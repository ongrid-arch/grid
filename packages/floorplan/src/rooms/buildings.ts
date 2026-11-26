/**
 * The buildings of a plan in rooms text (LVL-23): which floors are each building's own (C23) and
 * where its ground is.
 *
 *   building <id> ["<name>"] [pad <length>]                     the floor lines under it are its own,
 *                                                               up to `end` or the next building line
 *   building <id> ["<name>"] [pad <length>] floors <floor> ...  the floors it names, written anywhere
 *   building <kind>                                             what kind of building the plan is (CNT-5)
 *
 * A building's floors count their levels from its own ground floor: a floor line under a building
 * line that states no level takes the next level of that building, the first being 0. `pad` is the
 * level of the building's own ground, from the plan's datum; its floors that state no elevation
 * stack from it (`geometry/elevations.ts`). A floor is in one building at most.
 *
 * The read-back writes each building in the `floors` form after the floors (`buildingLines`), as it
 * writes the floors in the plan's order, so writing the text again keeps them.
 *
 * Pure: words in, buildings out, or the reason there are none.
 */
import { BUILDING_TYPES, readBuilding, type FloorPlan } from '../types/floorplan'
import { nearestWord } from '../types/reading'
import { planBuildings } from '../geometry/buildings'
import { english, said } from '../messages/say'
import { metres, numberOf, RoomsStop, type LineWord, type PlainNumbers } from './words'

/** A building of the plan as the tools and rooms text give it (`PlanBuildingSchema`). */
export interface BuildingMade {
  readonly id: string
  readonly name?: string
  readonly floors: string[]
  readonly pad?: number
}

/** What a building line says. `floors` is null for the block form, whose floors are the lines under it. */
export interface BuildingWords {
  readonly id: string
  readonly name: string | null
  readonly pad: number | null
  readonly floors: readonly string[] | null
}

const KEYS = ['pad', 'floors'] as const

/** Whether a `building` line says what kind of building the plan is (CNT-5), not which floors are a building's. */
export function isKindLine(t: readonly string[]): boolean {
  return t.length === 2 && (BUILDING_TYPES as readonly string[]).includes(readBuilding(t[1]) as string)
}

const stop = (at: number, message: string): never => {
  throw new RoomsStop('rooms/syntax', english(said('rooms.building.line', { line: at, problem: message, form: said('rooms.building.form') })), at)
}

/** A building line's words: `building <id> ["<name>"] [pad <length>] [floors <floor> ...]`. */
export function buildingOfWords(quoted: readonly LineWord[], at: number, plain: PlainNumbers): BuildingWords {
  const id = quoted[1]
  if (id === undefined || id.quoted || (KEYS as readonly string[]).includes(id.text)) stop(at, english(said('rooms.building.noId')))
  // A bare word near a kind of building is taken for a misspelt kind, never for a building's id.
  if (quoted.length === 2) {
    const kind = nearestWord(id!.text.toLowerCase(), BUILDING_TYPES)
    if (kind !== null) stop(at, english(said('rooms.building.nearKind', { word: id!.text, kind, id: id!.text })))
  }
  let i = 2
  let name: string | null = null
  if (quoted[i]?.quoted === true) {
    name = quoted[i]!.text
    i++
  }
  let pad: number | null = null
  let floors: string[] | null = null
  while (i < quoted.length) {
    const word = quoted[i]!
    if (word.quoted || !(KEYS as readonly string[]).includes(word.text)) stop(at, english(said('rooms.building.unknown', { word: word.text })))
    if (word.text === 'pad') {
      if (pad !== null) stop(at, english(said('rooms.building.twice', { word: 'pad' })))
      const value = quoted[i + 1]
      if (value === undefined || value.quoted) stop(at, english(said('rooms.building.noPad')))
      try {
        pad = numberOf(value!.text, at, plain)
      } catch (error) {
        if (!(error instanceof RoomsStop)) throw error
        stop(at, error.message.replace(/^line \d+: /, ''))
      }
      i += 2
      continue
    }
    // `floors` takes the rest of the line.
    floors = quoted.slice(i + 1).map((w) => w.text)
    if (floors.length === 0) stop(at, english(said('rooms.building.noFloors')))
    break
  }
  return { id: id!.text, name, pad, floors }
}

interface Entry {
  readonly line: number
  readonly words: BuildingWords
  /** The floors of a block, by the floor lines under it. */
  readonly held: string[]
  /** Their levels, in the same order. */
  readonly levels: number[]
  /** Written `building <word>` alone, which may be a kind of building Grid does not know. */
  readonly bare: boolean
}

/** The building lines of one rooms text, read as they come and made into buildings at the end. */
export class BuildingLines {
  private readonly entries: Entry[] = []
  private open: Entry | null = null

  get written(): boolean {
    return this.entries.length > 0
  }

  read(quoted: readonly LineWord[], at: number, plain: PlainNumbers): void {
    const words = buildingOfWords(quoted, at, plain)
    const entry: Entry = { line: at, words, held: [], levels: [], bare: quoted.length === 2 }
    this.entries.push(entry)
    this.open = words.floors === null ? entry : null
  }

  /** `end`: the floor lines after it are in no building. */
  end(at: number): void {
    if (this.open === null) throw new RoomsStop('rooms/syntax', english(said('rooms.building.endAlone', { line: at })), at)
    this.open = null
  }

  /**
   * The level a floor line that states none takes: under a building line, the one above the
   * highest of that building's floors so far, 0 for its first; `fallback` outside a building.
   */
  levelFor(fallback: number): number {
    if (this.open === null) return fallback
    return this.open.levels.length === 0 ? 0 : Math.floor(Math.max(...this.open.levels)) + 1
  }

  /** A floor line, at its level, written under the open building line, if any. */
  floor(id: string, level: number): void {
    this.open?.held.push(id)
    this.open?.levels.push(level)
  }

  /** The plan's buildings, in the order of their lines, and what is wrong with them. */
  finish(floors: readonly string[]): { buildings?: BuildingMade[]; problems: { code: string; line: number; message: string }[] } {
    const problems: { code: string; line: number; message: string }[] = []
    if (this.entries.length === 0) return { problems }
    const buildings: BuildingMade[] = []
    const ids = new Map<string, number>()
    const holder = new Map<string, { building: string; line: number }>()
    for (const { line, words, held, bare } of this.entries) {
      if (ids.has(words.id)) {
        problems.push({ code: 'rooms/duplicate-id', line, message: english(said('rooms.building.duplicate', { line, id: words.id, other: ids.get(words.id)! })) })
        continue
      }
      ids.set(words.id, line)
      const own = words.floors ?? held
      if (own.length === 0) {
        // A lone word with no floor under it is most likely a kind of building Grid does not know.
        const message = bare ? said('rooms.building.emptyBare', { line, id: words.id, kinds: BUILDING_TYPES.join(', ') }) : said('rooms.building.empty', { line, id: words.id })
        problems.push({ code: 'rooms/syntax', line, message: english(message) })
        continue
      }
      let sound = true
      for (const floor of own) {
        if (!floors.includes(floor)) {
          problems.push({ code: 'rooms/unknown-floor', line, message: english(said('rooms.building.unknownFloor', { line, id: words.id, floor, floors: floors.join(', ') })) })
          sound = false
          continue
        }
        const other = holder.get(floor)
        if (other !== undefined) {
          problems.push({ code: 'rooms/syntax', line, message: english(said('rooms.building.twoBuildings', { line, floor, id: words.id, other: other.building, at: other.line })) })
          sound = false
          continue
        }
        holder.set(floor, { building: words.id, line })
      }
      if (!sound) continue
      buildings.push({ id: words.id, ...(words.name === null ? {} : { name: words.name }), floors: [...own], ...(words.pad === null ? {} : { pad: words.pad }) })
    }
    return problems.length > 0 ? { problems } : { buildings, problems }
  }
}

const quote = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`)

/** One building as a line, in the `floors` form. */
export function buildingLine(building: BuildingMade): string {
  return [
    `building ${building.id}`,
    ...(building.name === undefined ? [] : [quote(building.name)]),
    ...(building.pad === undefined || !Number.isFinite(building.pad) ? [] : [`pad ${metres(building.pad)}`]),
    'floors',
    ...building.floors,
  ].join(' ')
}

/**
 * The read-back's building lines: each building of the plan, in the `floors` form, as Grid reads it
 * (`planBuildings`): the floors it holds, so an id that is no floor, or a floor a building listed
 * before it holds, is not written. A building that holds no floor is not written.
 */
export function buildingLines(plan: FloorPlan): string[] {
  const stated = new Map<string, string | undefined>()
  for (const b of plan.buildings ?? []) if (!stated.has(b.id)) stated.set(b.id, b.name)
  return planBuildings(plan)
    .filter((b) => b.floors.length > 0)
    .map((b) => {
      const name = stated.get(b.id)
      return buildingLine({ id: b.id, ...(name === undefined ? {} : { name }), floors: [...b.floors], ...(b.pad === null ? {} : { pad: b.pad }) })
    })
}
