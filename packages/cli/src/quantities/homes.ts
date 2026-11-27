/**
 * ARE-72: the measures for homes, asked about as questions after the check.
 *
 * A home is each flat the plan lists (`planFlats`), or, with none, the whole plan when it says it
 * is a home (`buildingKind`: a room used as a bedroom or a living room). Of each home Grid asks:
 *
 * - whether it has a bathroom, a kitchen and a way in: a room used as one, or named so, and a
 *   door, an opening or an open edge from one of its rooms to the outside or to a room that is
 *   not the home's;
 * - whether a bedroom, living or dining room, or a kitchen, bathroom or toilet, is far smaller or
 *   narrower than a home's ever is: its net area as `grid_areas` gives it, its width the widest
 *   circle it holds as `grid_measure` gives it, against Grid's own limits (`homeRoomSmallest` and
 *   the like in the tolerances table), with no place or country needed;
 * - whether a room's name says one use ("Bedroom 2") while its use says another (`living`).
 *
 * Each is a question, never a rule: the figures are Grid's own and cite no document, and nothing
 * here says what a home must have. Pure: a survey in, records out. Nothing here reads a file.
 */
import { buildingKind, limit, planFlats } from '@ongrid/floorplan/geometry'
import { foldUseWord, ROOM_USES, USE_WORDS, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { roomUseOfLabel, say } from '@ongrid/floorplan/messages'
import { planAreas } from './areas'
import { measureRoom, OUTSIDE, wayGraph } from './measure'
import type { Survey, SurveyRoom } from './survey'
import { smallMetres } from './units'

/** What a home is asked for. */
export const USUAL_ROOMS = ['bathroom', 'kitchen', 'entrance'] as const
export type UsualRoom = (typeof USUAL_ROOMS)[number]

/** A home of the plan: a flat, or the whole plan (`id` null). */
export interface Home {
  readonly id: string | null
  /** The flat's name, else its id; null for the whole plan. */
  readonly name: string | null
  /** Its rooms, by id: no outdoor space and no void. */
  readonly rooms: readonly string[]
}

export type HomeQuestionKind = 'lacks' | 'small' | 'narrow' | 'name-use'

export interface HomeQuestion {
  readonly kind: HomeQuestionKind
  /** The flat it is about, by id; null for the whole plan as one home. */
  readonly home: string | null
  /** The room it is about; null for a room the home lacks. */
  readonly room: string | null
  /** What the home lacks, for `lacks`. */
  readonly lacks: UsualRoom | null
  /** The room's use as stated, for `small`, `narrow` and `name-use`. */
  readonly use: RoomUse | null
  /** The uses the room's name says, for `name-use`. */
  readonly named: readonly RoomUse[]
  /** The size drawn and Grid's limit, for `small` (m²) and `narrow` (m). */
  readonly drawn: number | null
  readonly limit: number | null
  readonly text: string
}

/** The rooms a home lives in, measured against `homeRoomSmallest` and `homeRoomNarrowest`. */
const LIVING_USES: readonly RoomUse[] = ['bedroom', 'living', 'dining']
/** A home's wet rooms, measured against `homeWetRoomSmallest` and `homeWetRoomNarrowest`. */
const WET_USES: readonly RoomUse[] = ['kitchen', 'bathroom', 'toilet']

/** The uses a name is read for in a home: the rooms of a home and the ways between them. */
const HOME_NAME_USES: readonly RoomUse[] = ['bedroom', 'living', 'dining', 'kitchen', 'bathroom', 'toilet', 'utility', 'study', 'office', 'corridor', 'stair', 'storage', 'parking', 'plant']

/**
 * Plain words for the rooms of a home that `USE_WORDS` keeps out, because the figure checks read
 * bedrooms and living rooms only by the use their author chose. Here they only ask a question.
 */
const HOME_WORDS: Readonly<Record<string, RoomUse>> = {
  bed: 'bedroom',
  beds: 'bedroom',
  bedroom: 'bedroom',
  bedrooms: 'bedroom',
  lounge: 'living',
  living: 'living',
  dining: 'dining',
  kitchen: 'kitchen',
  bath: 'bathroom',
  bathroom: 'bathroom',
}

/** Uses near enough that a name saying one and a use saying the other is no question. */
const NEAR: ReadonlyArray<readonly [RoomUse, RoomUse]> = [
  ['bathroom', 'toilet'],
  ['utility', 'storage'],
  ['storage', 'parking'],
  ['study', 'office'],
  ['living', 'dining'],
]
const near = (a: RoomUse, b: RoomUse): boolean => a === b || NEAR.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

function useOfWord(word: string): RoomUse | null {
  const lower = word.trim().toLowerCase()
  if (lower === '' || /^\d+$/.test(lower)) return null
  if (Object.hasOwn(HOME_WORDS, lower)) return HOME_WORDS[lower]!
  if ((ROOM_USES as readonly string[]).includes(lower)) return lower as RoomUse
  const labelled = roomUseOfLabel(word)
  if (labelled !== null) return labelled
  const folded = foldUseWord(word)
  if ((ROOM_USES as readonly string[]).includes(folded)) return folded as RoomUse
  return Object.hasOwn(USE_WORDS, folded) ? USE_WORDS[folded]! : null
}

/**
 * The uses a room's name says, of a home's: the whole name, each word and each two words together
 * ("Bedroom 2" bedroom, "Kitchen / dining" kitchen and dining, "Sala de estar" living). Empty when
 * the name says none: "Hall", "Room 3".
 */
export function usesInName(name: string): RoomUse[] {
  const words = name.split(/[^\p{L}\p{N}-]+/u).filter((w) => w !== '')
  const pieces = words.flatMap((w) => (w.includes('-') ? w.split('-').filter((p) => p !== '') : []))
  const candidates = [name, ...words, ...pieces, ...words.slice(1).map((w, i) => `${words[i]} ${w}`), ...words.slice(2).map((w, i) => `${words[i]} ${words[i + 1]} ${w}`)]
  const out: RoomUse[] = []
  for (const candidate of candidates) {
    const use = useOfWord(candidate)
    if (use !== null && HOME_NAME_USES.includes(use) && !out.includes(use)) out.push(use)
  }
  return out
}

const indoor = (room: SurveyRoom | undefined): boolean => room !== undefined && room.facts.outdoor === undefined && room.facts.void !== true && room.facts.zoneOf === undefined

/** The plan's homes: its flats, or the whole plan when it says it is a home; none otherwise. */
export function planHomes(survey: Survey): Home[] {
  const flats = planFlats(survey.plan)
  if (flats.length > 0) {
    return flats.map((flat) => ({ id: flat.id, name: flat.name, rooms: flat.rooms.map((r) => r.id).filter((id) => indoor(survey.byId.get(id))) })).filter((home) => home.rooms.length > 0)
  }
  if (buildingKind(survey.plan) !== 'home') return []
  const rooms = survey.rooms.filter(indoor).map((r) => r.facts.id)
  return rooms.length === 0 ? [] : [{ id: null, name: null, rooms }]
}

/** Whether a room of the home is used as `use`, or its name says so. */
function hasUse(survey: Survey, home: Home, use: RoomUse): boolean {
  return home.rooms.some((id) => {
    const room = survey.byId.get(id)
    return room !== undefined && (room.facts.use === use || usesInName(room.facts.name).includes(use))
  })
}

/** Whether a way leads out of the home: to the outside, or to a room that is not the home's. */
function hasWayIn(survey: Survey, home: Home, ways: (floor: string) => ReadonlyMap<string, ReadonlyArray<{ readonly room: string }>>): boolean {
  const own = new Set(home.rooms)
  return home.rooms.some((id) => {
    const room = survey.byId.get(id)
    if (room === undefined) return false
    return (ways(room.facts.floor).get(id) ?? []).some((w) => w.room === OUTSIDE || !own.has(w.room))
  })
}

/** What a home lacks of a bathroom, a kitchen and a way in. */
export function homeLacks(survey: Survey, home: Home): UsualRoom[] {
  const graphs = new Map<string, ReadonlyMap<string, ReadonlyArray<{ readonly room: string }>>>()
  const ways = (floor: string) => {
    let found = graphs.get(floor)
    if (found === undefined) {
      found = wayGraph(survey, floor).next
      graphs.set(floor, found)
    }
    return found
  }
  return USUAL_ROOMS.filter((usual) => (usual === 'entrance' ? !hasWayIn(survey, home, ways) : !hasUse(survey, home, usual)))
}

const q = (text: string): string => JSON.stringify(text)
const homeWords = (home: Home): string => (home.name === null ? say('en', 'home.whole') : say('en', 'home.flat', { home: q(home.name) }))
const roomWords = (room: SurveyRoom): string => q(room.facts.name.trim() === '' ? room.facts.id : room.facts.name.trim())

/** Every question about the plan's homes: what each lacks, then its rooms' sizes and names, in plan order. */
export function homeQuestions(survey: Survey): HomeQuestion[] {
  const homes = planHomes(survey)
  if (homes.length === 0) return []
  const nets = new Map<string, number | null>()
  for (const floor of planAreas(survey).floors) for (const room of floor.rooms) if (!nets.has(room.id)) nets.set(room.id, room.net)
  const out: HomeQuestion[] = []
  const blank = { room: null, lacks: null, use: null, named: [], drawn: null, limit: null } as const
  for (const home of homes) {
    const where = homeWords(home)
    for (const lacks of homeLacks(survey, home)) out.push({ ...blank, kind: 'lacks', home: home.id, lacks, text: say('en', `home.lacks.${lacks}`, { home: where }) })
    for (const id of home.rooms) {
      const room = survey.byId.get(id)
      if (room === undefined) continue
      const use = room.facts.use ?? null
      const name = roomWords(room)
      const said = { room: id, use, named: [] as RoomUse[] }
      const living = use !== null && LIVING_USES.includes(use)
      const wet = use !== null && WET_USES.includes(use)
      if (living || wet) {
        const smallest = limit(living ? 'homeRoomSmallest' : 'homeWetRoomSmallest')
        const narrowest = limit(living ? 'homeRoomNarrowest' : 'homeWetRoomNarrowest')
        const net = nets.get(id) ?? null
        const widest = room.polygon.length >= 3 ? measureRoom(room).widestCircle : null
        if (net !== null && net < smallest) {
          out.push({ ...blank, ...said, kind: 'small', home: home.id, drawn: net, limit: smallest, text: say('en', 'home.small', { room: name, home: where, use: use!, drawn: smallMetres(net), limit: String(smallest) }) })
        } else if (widest !== null && widest < narrowest) {
          out.push({ ...blank, ...said, kind: 'narrow', home: home.id, drawn: widest, limit: narrowest, text: say('en', 'home.narrow', { room: name, home: where, use: use!, drawn: smallMetres(widest), limit: String(narrowest) }) })
        }
      }
      const named = usesInName(room.facts.name)
      if (use !== null && named.length > 0 && !named.some((n) => near(n, use))) {
        out.push({ ...blank, ...said, kind: 'name-use', home: home.id, named, text: say('en', 'home.nameUse', { room: name, home: where, named: named.join(' and '), use }) })
      }
    }
  }
  return out
}
