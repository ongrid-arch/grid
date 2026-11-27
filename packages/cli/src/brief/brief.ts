/**
 * BRF-1: the brief, what the person asked for, kept in a file of its own beside the plan.
 *
 * `<plan>.brief.json` (`plan.brief.json` beside `plan.json`), read and written only through
 * `fs/projectFiles.ts`. The plan knows nothing of it, and no export, sheet or drawing reads it:
 * the person's words stay with the person's project.
 *
 *   {
 *     "version": "1",
 *     "rooms": [
 *       { "name": "Bathroom 1", "area": 4.5, "level": "must", "source": "given", "quote": "a small bathroom, about 4.5 square metres" },
 *       { "use": "bedroom", "count": 3, "level": "must", "source": "given", "quote": "three bedrooms" }
 *     ],
 *     "footprint": { "width": 10, "depth": 12, "level": "should", "source": "assumed" },
 *     "touch": [{ "rooms": ["Kitchen", "Living room"], "level": "must", "source": "given", "quote": "the kitchen open to the living room" }],
 *     "figures": {
 *       "heading": "The person's own figures: theirs, not from any code or standard.",
 *       "door_width": { "value": 0.8, "level": "must", "source": "given", "quote": "my chair needs 80 cm doors" }
 *     },
 *     "open": [{ "quote": "somewhere to work from home", "about": "its size, and which room" }],
 *     "people": { "pupils": 420, "covers": { "count": 80, "rooms": ["Dining hall"] } }
 *   }
 *
 * ARE-68: `people` is who the building, or some of its rooms, is for: a fact the area answers give
 * the area per one of, not a wish, so no line measures it.
 *
 * Every wish carries a level (`must`, `should`, `avoid`) and where it came from, in WRT-6's
 * words (`MARK_SOURCES`): `given` by the person, with their words beside it, or `assumed` by whoever wrote the
 * brief, for the person to confirm. What the person said with no figure yet is `open`.
 *
 * The figures under `figures` are the person's own, never a code's: the file and every answer
 * say so under their heading. A figure Grid does not know is refused with the ones it knows.
 * A refusal names the place and never repeats the text.
 */
import path from 'path'
import { MARK_SOURCES, ROOM_USES, readUse, type MarkSource } from '@ongrid/floorplan/types/floorplan'
import { PathRefused, quoted, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { NAME_MAX } from '../command/planText'
import { reasonProblem } from '../seen/marks'
import { DOOR_MEASURES, type DoorMeasure } from '../quantities/doorWidth'
import { readPeople, type PeopleFigures } from '../quantities/lettable'

/** What the file name adds to the plan's name. */
export const BRIEF_SUFFIX = '.brief.json'
/** The largest brief Grid reads. */
export const BRIEF_FILE_MAX_BYTES = 1024 * 1024
/** The longest quote a wish may keep: the person's words, a sentence or two. */
export const QUOTE_MAX = 300
/** The most wishes of one kind a brief may hold. */
export const WISHES_MAX = 500

/** How much a wish matters to the person. `avoid` is a wish for the drawing not to hold it. */
export const LEVELS = ['must', 'should', 'avoid'] as const
export type Level = (typeof LEVELS)[number]

/**
 * Where a wish came from, in WRT-6's own words (`MARK_SOURCES`, the plan's marks): `given` by the
 * person, or `assumed` by whoever wrote the brief. A wish is said, not taped or captured, so the
 * other two, `measured` and `scanned`, are for the plan's values and not for a brief.
 */
export type Source = Extract<MarkSource, 'given' | 'assumed'>
const WISH_SOURCES: ReadonlySet<MarkSource> = new Set<Source>(['given', 'assumed'])
export const SOURCES: readonly Source[] = MARK_SOURCES.filter((source): source is Source => WISH_SOURCES.has(source))

/** The heading the person's figures sit under, in the file and in every answer. */
export const FIGURES_HEADING = "The person's own figures: theirs, not from any code or standard."

/**
 * The person's own figures Grid knows how to measure, and how: each is a smallest size, but a
 * step, which is a largest height. BRF-4 adds the person's site limits (`site`): a largest plot
 * coverage (a percentage), floor area ratio, building height (metres), and a smallest number of
 * parking spaces per home. `least` and `top` bound the value; a value of `least` itself is
 * refused but for a step (no sill) and parking (none per home).
 */
const SEATING_TOP = 100_000

export const FIGURES = {
  door_width: { what: 'door width', most: false, unit: 'm', least: 0, top: 100, site: false, measures: 'the clear width every door and doorless opening leaves, leaf by leaf, unless the figure says leaf or hole (measure)' },
  corridor_width: { what: 'corridor width', most: false, unit: 'm', least: 0, top: 100, site: false, measures: 'each room used as a corridor at its narrowest point from end to end, clear of fixtures' },
  turning_circle: { what: 'turning circle', most: false, unit: 'm', least: 0, top: 100, site: false, measures: 'the widest circle each room holds (or the rooms the figure names), in the empty room' },
  step: { what: 'step at a door', most: true, unit: 'm', least: 0, top: 100, site: false, measures: 'the sill of every door and doorless opening above its floor' },
  ceiling_height: { what: 'ceiling height', most: false, unit: 'm', least: 0, top: 100, site: false, measures: 'each room\'s height, as grid_measure gives it' },
  // BRF-4: the person's own site limits, each set against the plan as it is drawn, massing or walls.
  plot_coverage: { what: 'plot coverage', most: true, unit: '%', least: 0, top: 100, site: true, measures: 'the building seen from above, every floor at or above the ground floor, against the plot\'s area, as grid_measure what=site gives it' },
  floor_area_ratio: { what: 'floor area ratio', most: true, unit: '', least: 0, top: 100, site: true, measures: 'the gross area of every floor at or above the ground floor, by the measure named, against the plot\'s area' },
  building_height: { what: 'building height', most: true, unit: 'm', least: 0, top: 1000, site: true, measures: 'from the ground to the top of the highest roof' },
  parking_per_home: { what: 'parking per home', most: false, unit: 'spaces per home', least: 0, top: 100, site: true, measures: 'the parking spaces the floors state against the homes they state' },
  // ARE-67: the person's own targets for the whole plan's seats, desks and covers, counted from the furniture (`quantities/seats.ts`).
  seats: { what: 'seats', most: false, unit: 'seats', least: 0, top: SEATING_TOP, site: false, measures: 'the seats the furniture gives in the whole plan, as grid_measure what=seats counts them' },
  desks: { what: 'desks', most: false, unit: 'desks', least: 0, top: SEATING_TOP, site: false, measures: 'the desks in the whole plan, as grid_measure what=seats counts them' },
  covers: { what: 'covers', most: false, unit: 'covers', least: 0, top: SEATING_TOP, site: false, measures: 'the seats at a table in the whole plan, as grid_measure what=seats counts them' },
} as const
export type FigureName = keyof typeof FIGURES
export const FIGURE_NAMES = Object.keys(FIGURES) as FigureName[]

/** ARE-67: what the furniture is counted for: seats, desks and covers. */
export const SEATING_WHATS = ['seats', 'desks', 'covers'] as const
export type SeatingWhat = (typeof SEATING_WHATS)[number]
export const isSeatingFigure = (figure: FigureName): figure is SeatingWhat => (SEATING_WHATS as readonly string[]).includes(figure)

/** ARE-67: the most seats, desks or covers a wish may ask for. */
export const SEATING_MAX = SEATING_TOP

/** ARE-67: a target for a room's seats, desks or covers: exactly, at least or at most, as a count of rooms is. */
export interface SeatingTarget {
  readonly exactly: number | null
  readonly atLeast: number | null
  readonly atMost: number | null
}

/** Why a brief was refused. One line, naming the place, never repeating the text. */
export class BriefRefused extends Error {
  override readonly name = 'BriefRefused'
}

/** What every wish says about itself. */
export interface Said {
  readonly level: Level
  readonly source: Source
  /** The person's words for it; needed when it is given. */
  readonly quote: string | null
}

/** A wish about one room (by name) or the rooms of a use. */
export interface RoomWish extends Said {
  readonly name: string | null
  readonly use: string | null
  readonly count: number | null
  /** ARE-33: at least / at most this many rooms of the name or use. Counts, never areas. */
  readonly countAtLeast: number | null
  readonly countAtMost: number | null
  /** About this net area, m². */
  readonly area: number | null
  readonly atLeast: number | null
  readonly atMost: number | null
  /** About this inside size, either way round, m. */
  readonly inside: readonly [number, number] | null
  /** ARE-67: the seats, desks and covers the furniture of the rooms it means gives, together. */
  readonly seats: SeatingTarget | null
  readonly desks: SeatingTarget | null
  readonly covers: SeatingTarget | null
}

export interface FootprintWish extends Said {
  readonly width: number | null
  readonly depth: number | null
  readonly area: number | null
}

/** Two rooms that must touch (`must`, `should`) or must not (`avoid`). */
export interface TouchWish extends Said {
  readonly rooms: readonly [string, string]
}

/** BRF-4: the gross measure a floor area ratio is set by, as the brief writes it. */
export const RATIO_MEASURES = ['gross_external', 'gross_internal'] as const
export type RatioMeasure = (typeof RATIO_MEASURES)[number]

export interface FigureWish extends Said {
  readonly figure: FigureName
  readonly value: number
  /** For a turning circle: the rooms it is for, by name. Every room when empty. */
  readonly rooms: readonly string[]
  /** For a floor area ratio: the gross measure it is set by; null when the brief names none. */
  readonly measure: RatioMeasure | null
  /** ARE-27: for a door width, the width it is for (`measure` in the file): clear, leaf or hole. Null when the brief names none, read as clear. */
  readonly door: DoorMeasure | null
}

/** What the person said that has no figure yet: still to ask. */
export interface OpenWish {
  readonly quote: string
  /** What is still to ask, in the agent's words. */
  readonly about: string | null
}

export interface Brief {
  readonly version: '1'
  readonly rooms: readonly RoomWish[]
  readonly footprint: FootprintWish | null
  readonly touch: readonly TouchWish[]
  readonly figures: readonly FigureWish[]
  readonly open: readonly OpenWish[]
  /** ARE-68: who the building, or some of its rooms, is for (pupils, covers, keys…): a fact for the area per person, not a wish. */
  readonly people?: PeopleFigures
}

/** The brief file of a plan file: beside it, its name without `.json` and `.brief.json` after. */
export function briefFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${BRIEF_SUFFIX}`)
}

// ---------------------------------------------------------------------------------------------
// Reading the brief's contents

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const KEY = /^[A-Za-z0-9._-]{1,64}$/

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key))
  if (unknown.length === 0) return
  const named = unknown.length === 1 && KEY.test(unknown[0]!) ? ` (${quoted(unknown[0]!)})` : ''
  throw new BriefRefused(`${where} holds a field Grid does not know${named}: it may hold only ${listOf(keys)}`)
}

function words(value: unknown, where: string, max: number): string {
  if (typeof value !== 'string') throw new BriefRefused(`${where} must be text`)
  const problem = reasonProblem(value, max)
  if (problem !== null) throw new BriefRefused(`${where} ${problem}`)
  return value
}

function size(value: unknown, where: string, unit: 'm' | 'm²', max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new BriefRefused(`${where} must be a number of ${unit === 'm' ? 'metres' : 'square metres'} above 0 and at most ${max.toLocaleString('en-US')}`)
  }
  return value
}

function optional<T>(raw: Record<string, unknown>, key: string, read: (value: unknown) => T): T | null {
  return raw[key] === undefined || raw[key] === null ? null : read(raw[key])
}

function said(raw: Record<string, unknown>, where: string, levels: readonly Level[] = LEVELS): Said {
  const level = raw['level']
  if (!levels.includes(level as Level)) throw new BriefRefused(`${where}.level must be one of ${listOf([...levels])}`)
  const source = raw['source']
  if (!SOURCES.includes(source as Source)) throw new BriefRefused(`${where}.source must be given (the person said it) or assumed (for the person to confirm)`)
  const quote = optional(raw, 'quote', (value) => words(value, `${where}.quote`, QUOTE_MAX))
  if (source === 'given' && quote === null) throw new BriefRefused(`${where} is given, so it keeps the person's words in quote`)
  return { level: level as Level, source: source as Source, quote }
}

function list(raw: unknown, where: string): unknown[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new BriefRefused(`${where} must be a list`)
  if (raw.length > WISHES_MAX) throw new BriefRefused(`${where} holds ${raw.length.toLocaleString('en-US')} items; it may hold at most ${WISHES_MAX}`)
  return raw
}

/** ARE-33: the largest whole number an at_least or at_most on a use wish may be without an area unit said, before it reads as a count. */
const COUNT_LIKE_MAX = 30
/** An area unit in the person's words: m², m2, sqm, square, metre, meter, sq ft, feet. */
const AREA_UNIT = /m²|m2|sq\s?m|sqm|square|metre|meter|\bsq\b|\bft\b|feet|foot|tatami|㎡/i

const ROOM_KEYS = [
  'name', 'use', 'count', 'count_at_least', 'count_at_most', 'area', 'at_least', 'at_most', 'inside',
  ...SEATING_WHATS.flatMap((what) => [what, `${what}_at_least`, `${what}_at_most`]),
  'level', 'source', 'quote',
] as const

function roomWish(raw: unknown, where: string): RoomWish {
  if (!isObject(raw)) throw new BriefRefused(`${where} must be an object`)
  onlyKeys(raw, ROOM_KEYS, where)
  const name = optional(raw, 'name', (value) => words(value, `${where}.name`, NAME_MAX))
  // MSG-22: a use in the person's own word (`cocina`, `Flur`) is kept as the use it means.
  const use = optional(raw, 'use', (value) => {
    const read = readUse(value)
    if (typeof read !== 'string' || !ROOM_USES.includes(read as never)) throw new BriefRefused(`${where}.use must be one of the room uses, or a word that plainly means one: ${ROOM_USES.join(', ')}`)
    return read
  })
  if (name === null && use === null) throw new BriefRefused(`${where} names a room (name) or the rooms of a use (use)`)
  const whole = (key: string, max = 1000) => optional(raw, key, (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new BriefRefused(`${where}.${key} must be a whole number from 0 to ${max.toLocaleString('en-US')}`)
    return value
  })
  const count = whole('count')
  const countAtLeast = whole('count_at_least')
  const countAtMost = whole('count_at_most')
  if (count !== null && (countAtLeast !== null || countAtMost !== null)) throw new BriefRefused(`${where} gives count, exactly how many, or count_at_least and count_at_most: not both`)
  if (countAtLeast !== null && countAtMost !== null && countAtLeast > countAtMost) throw new BriefRefused(`${where}.count_at_least is more than its count_at_most`)
  const area = optional(raw, 'area', (value) => size(value, `${where}.area`, 'm²', 100_000))
  const atLeast = optional(raw, 'at_least', (value) => size(value, `${where}.at_least`, 'm²', 100_000))
  const atMost = optional(raw, 'at_most', (value) => size(value, `${where}.at_most`, 'm²', 100_000))
  // ARE-33: at_least and at_most are square metres. A whole number of a few, on the rooms of a use, with
  // no area unit in the person's words, is a count in the wrong field: refused, naming the right ones.
  if (name === null && use !== null && [atLeast, atMost].some((v) => v !== null && Number.isInteger(v) && v <= COUNT_LIKE_MAX) && !AREA_UNIT.test(raw['quote'] === undefined || raw['quote'] === null ? '' : String(raw['quote']))) {
    throw new BriefRefused(`${where} gives at_least or at_most, which are square metres, as a small whole number on the rooms of a use: for how many rooms use count_at_least or count_at_most, and for a size say its unit in quote`)
  }
  if (area !== null && (atLeast !== null || atMost !== null)) throw new BriefRefused(`${where} gives area, a size about which the room is, or at_least and at_most: not both`)
  if (atLeast !== null && atMost !== null && atLeast > atMost) throw new BriefRefused(`${where}.at_least is more than its at_most`)
  const inside = optional(raw, 'inside', (value) => {
    if (!Array.isArray(value) || value.length !== 2) throw new BriefRefused(`${where}.inside must be two sizes in metres, as [3, 4]`)
    return [size(value[0], `${where}.inside[0]`, 'm', 1000), size(value[1], `${where}.inside[1]`, 'm', 1000)] as const
  })
  // ARE-67: a room's seats, desks and covers, each read as a count of rooms is.
  const target = (what: SeatingWhat): SeatingTarget | null => {
    const exactly = whole(what, SEATING_MAX)
    const least = whole(`${what}_at_least`, SEATING_MAX)
    const most = whole(`${what}_at_most`, SEATING_MAX)
    if (exactly !== null && (least !== null || most !== null)) throw new BriefRefused(`${where} gives ${what}, exactly how many, or ${what}_at_least and ${what}_at_most: not both`)
    if (least !== null && most !== null && least > most) throw new BriefRefused(`${where}.${what}_at_least is more than its ${what}_at_most`)
    return exactly === null && least === null && most === null ? null : { exactly, atLeast: least, atMost: most }
  }
  return { name, use, count, countAtLeast, countAtMost, area, atLeast, atMost, inside, seats: target('seats'), desks: target('desks'), covers: target('covers'), ...said(raw, where) }
}

function footprintWish(raw: unknown): FootprintWish {
  const where = 'footprint'
  if (!isObject(raw)) throw new BriefRefused(`${where} must be an object`)
  onlyKeys(raw, ['width', 'depth', 'area', 'level', 'source', 'quote'], where)
  const width = optional(raw, 'width', (value) => size(value, `${where}.width`, 'm', 10_000))
  const depth = optional(raw, 'depth', (value) => size(value, `${where}.depth`, 'm', 10_000))
  const area = optional(raw, 'area', (value) => size(value, `${where}.area`, 'm²', 1_000_000))
  if ((width === null) !== (depth === null)) throw new BriefRefused(`${where} gives width and depth together, the outside sizes either way round`)
  if (width === null && area === null) throw new BriefRefused(`${where} gives width and depth, area, or both`)
  return { width, depth, area, ...said(raw, where, ['must', 'should']) }
}

function touchWish(raw: unknown, where: string): TouchWish {
  if (!isObject(raw)) throw new BriefRefused(`${where} must be an object`)
  onlyKeys(raw, ['rooms', 'level', 'source', 'quote'], where)
  const rooms = raw['rooms']
  if (!Array.isArray(rooms) || rooms.length !== 2) throw new BriefRefused(`${where}.rooms must be two rooms' names`)
  const pair = [words(rooms[0], `${where}.rooms[0]`, NAME_MAX), words(rooms[1], `${where}.rooms[1]`, NAME_MAX)] as const
  return { rooms: pair, ...said(raw, where) }
}

function figureWishes(raw: unknown): FigureWish[] {
  if (raw === undefined || raw === null) return []
  if (!isObject(raw)) throw new BriefRefused('figures must be an object, each of the person\'s figures by its name')
  const out: FigureWish[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'heading') continue
    if (!FIGURE_NAMES.includes(key as FigureName)) {
      const named = KEY.test(key) ? ` ${quoted(key)}` : ''
      throw new BriefRefused(`figures names a figure Grid does not know${named}. The figures it knows: ${listOf([...FIGURE_NAMES])}`)
    }
    const figure = key as FigureName
    const where = `figures.${figure}`
    if (!isObject(value)) throw new BriefRefused(`${where} must be an object with value, level and source`)
    const extra = figure === 'turning_circle' ? ['rooms'] : figure === 'floor_area_ratio' || figure === 'door_width' ? ['measure'] : []
    onlyKeys(value, ['value', ...extra, 'level', 'source', 'quote'], where)
    const v = value['value']
    const { unit, least, top } = FIGURES[figure]
    if (isSeatingFigure(figure) && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > top)) throw new BriefRefused(`${where}.value must be a whole number of ${unit} from 1 to ${top.toLocaleString('en-US')}`)
    // A step may be none at all, no sill, and so may the parking a home needs.
    const zero = figure === 'step' || figure === 'parking_per_home'
    if (typeof v !== 'number' || !Number.isFinite(v) || v < least || v > top || (v === least && !zero)) {
      const of = unit === 'm' ? 'a number of metres' : unit === '%' ? 'a percentage of the plot' : unit === '' ? 'a ratio, the floor area over the plot area,' : `a number of ${unit}`
      throw new BriefRefused(`${where}.value must be ${of}${zero ? ` from ${least}` : ` above ${least}`} to ${top.toLocaleString('en-US')}`)
    }
    const rooms = list(value['rooms'], `${where}.rooms`).map((room, i) => words(room, `${where}.rooms[${i}]`, NAME_MAX))
    const measure = figure !== 'floor_area_ratio' ? null : optional(value, 'measure', (m) => {
      if (!RATIO_MEASURES.includes(m as RatioMeasure)) throw new BriefRefused(`${where}.measure must be ${RATIO_MEASURES.join(' or ')}`)
      return m as RatioMeasure
    })
    // ARE-27: a door width is for the clear width unless the brief says leaf or hole.
    const door = figure !== 'door_width' ? null : optional(value, 'measure', (m) => {
      if (!DOOR_MEASURES.includes(m as DoorMeasure)) throw new BriefRefused(`${where}.measure must be clear, leaf or hole`)
      return m as DoorMeasure
    })
    out.push({ figure, value: v, rooms, measure, door, ...said(value, where, ['must', 'should']) })
  }
  return out
}

function openWish(raw: unknown, where: string): OpenWish {
  if (!isObject(raw)) throw new BriefRefused(`${where} must be an object with the person's words in quote`)
  onlyKeys(raw, ['quote', 'about'], where)
  return { quote: words(raw['quote'], `${where}.quote`, QUOTE_MAX), about: optional(raw, 'about', (value) => words(value, `${where}.about`, QUOTE_MAX)) }
}

/** ARE-68: the brief's figures for who the building is for, when it gives them. */
function briefPeople(raw: unknown): Pick<Brief, 'people'> {
  if (raw === undefined || raw === null) return {}
  const read = readPeople(raw, 'people')
  if (typeof read === 'string') throw new BriefRefused(read)
  return Object.keys(read).length === 0 ? {} : { people: read }
}

/** The brief's contents, checked. Refused with the first place that is wrong. A file's `version` must be "1"; a tool call's may be left out. */
export function parseBrief(raw: unknown, options: { readonly versionNeeded?: boolean } = {}): Brief {
  if (!isObject(raw)) throw new BriefRefused('it must be a JSON object with rooms, footprint, touch, figures or open')
  onlyKeys(raw, ['version', 'rooms', 'footprint', 'touch', 'figures', 'open', 'people'], 'the brief')
  if ((options.versionNeeded !== false || raw['version'] !== undefined) && raw['version'] !== '1') throw new BriefRefused('version must be "1"')
  const brief: Brief = {
    version: '1',
    rooms: list(raw['rooms'], 'rooms').map((wish, i) => roomWish(wish, `rooms[${i}]`)),
    footprint: raw['footprint'] === undefined || raw['footprint'] === null ? null : footprintWish(raw['footprint']),
    touch: list(raw['touch'], 'touch').map((wish, i) => touchWish(wish, `touch[${i}]`)),
    figures: figureWishes(raw['figures']),
    open: list(raw['open'], 'open').map((wish, i) => openWish(wish, `open[${i}]`)),
    ...briefPeople(raw['people']),
  }
  if (brief.rooms.length + brief.touch.length + brief.figures.length + brief.open.length === 0 && brief.footprint === null && brief.people === undefined) {
    throw new BriefRefused('it holds no wish: give rooms, footprint, touch, figures or open')
  }
  return brief
}

/** ARE-52: a line of a brief that was refused: where it is, why, and the line as it was sent. */
export interface RefusedLine {
  readonly where: string
  readonly problem: string
  /** The line as the caller sent it, as JSON text, for the caller to mend and send again. */
  readonly line: string
}

/** ARE-52: what a brief call holds: the lines that read, and the lines that did not. */
export interface BriefParts {
  readonly brief: Brief
  readonly refused: readonly RefusedLine[]
}

function lineText(value: unknown): string {
  const text = JSON.stringify(value) ?? 'null'
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text
}

/**
 * ARE-52: a brief call's contents read line by line. A wish that is wrong is left out and
 * returned with its place and why; the others are kept. A fault in the brief as a whole (not an
 * object, a field it does not take, a wrong version, a list too long or no valid wish at all)
 * still throws `BriefRefused`; with no valid wish it names every refused line.
 */
export function parseBriefLines(raw: unknown, options: { readonly versionNeeded?: boolean } = {}): BriefParts {
  if (!isObject(raw)) throw new BriefRefused('it must be a JSON object with rooms, footprint, touch, figures or open')
  onlyKeys(raw, ['version', 'rooms', 'footprint', 'touch', 'figures', 'open', 'people'], 'the brief')
  if ((options.versionNeeded !== false || raw['version'] !== undefined) && raw['version'] !== '1') throw new BriefRefused('version must be "1"')
  const refused: RefusedLine[] = []
  const each = <T>(key: string, read: (wish: unknown, where: string) => T): T[] => {
    const out: T[] = []
    list(raw[key], key).forEach((wish, i) => {
      const where = `${key}[${i}]`
      try {
        out.push(read(wish, where))
      } catch (error) {
        if (!(error instanceof BriefRefused)) throw error
        refused.push({ where, problem: error.message, line: lineText(wish) })
      }
    })
    return out
  }
  const rooms = each('rooms', roomWish)
  const touch = each('touch', touchWish)
  const open = each('open', openWish)
  let footprint: FootprintWish | null = null
  if (raw['footprint'] !== undefined && raw['footprint'] !== null) {
    try {
      footprint = footprintWish(raw['footprint'])
    } catch (error) {
      if (!(error instanceof BriefRefused)) throw error
      refused.push({ where: 'footprint', problem: error.message, line: lineText(raw['footprint']) })
    }
  }
  const figures: FigureWish[] = []
  const given = raw['figures']
  if (given !== undefined && given !== null) {
    if (!isObject(given)) throw new BriefRefused('figures must be an object, each of the person\'s figures by its name')
    for (const [key, value] of Object.entries(given)) {
      if (key === 'heading') continue
      try {
        figures.push(...figureWishes({ [key]: value }))
      } catch (error) {
        if (!(error instanceof BriefRefused)) throw error
        refused.push({ where: `figures.${KEY.test(key) ? key : '…'}`, problem: error.message, line: lineText(value) })
      }
    }
  }
  let people: Pick<Brief, 'people'> = {}
  try {
    people = briefPeople(raw['people'])
  } catch (error) {
    if (!(error instanceof BriefRefused)) throw error
    refused.push({ where: 'people', problem: error.message, line: lineText(raw['people']) })
  }
  const brief: Brief = { version: '1', rooms, footprint, touch, figures, open, ...people }
  if (rooms.length + touch.length + figures.length + open.length === 0 && footprint === null && people.people === undefined) {
    if (refused.length === 0) throw new BriefRefused('it holds no wish: give rooms, footprint, touch, figures or open')
    throw new BriefRefused(refused.map((r) => r.problem).join('; and '))
  }
  return { brief, refused }
}

/** The brief as its file holds it: the keys the file takes, the person's figures under their heading. */
export function briefJson(brief: Brief): Record<string, unknown> {
  const s = (wish: Said): Record<string, unknown> => ({ level: wish.level, source: wish.source, ...(wish.quote === null ? {} : { quote: wish.quote }) })
  const some = <T>(key: string, value: T | null): Record<string, T> => (value === null ? {} : { [key]: value })
  const out: Record<string, unknown> = { version: '1' }
  if (brief.rooms.length > 0) {
    out['rooms'] = brief.rooms.map((w) => ({
      ...some('name', w.name), ...some('use', w.use), ...some('count', w.count), ...some('count_at_least', w.countAtLeast), ...some('count_at_most', w.countAtMost), ...some('area', w.area),
      ...some('at_least', w.atLeast), ...some('at_most', w.atMost), ...some('inside', w.inside === null ? null : [...w.inside]),
      ...Object.fromEntries(SEATING_WHATS.flatMap((what) => {
        const t = w[what]
        return t === null ? [] : [...(t.exactly === null ? [] : [[what, t.exactly]]), ...(t.atLeast === null ? [] : [[`${what}_at_least`, t.atLeast]]), ...(t.atMost === null ? [] : [[`${what}_at_most`, t.atMost]])]
      })),
      ...s(w),
    }))
  }
  if (brief.footprint !== null) {
    const f = brief.footprint
    out['footprint'] = { ...some('width', f.width), ...some('depth', f.depth), ...some('area', f.area), ...s(f) }
  }
  if (brief.touch.length > 0) out['touch'] = brief.touch.map((w) => ({ rooms: [...w.rooms], ...s(w) }))
  if (brief.figures.length > 0) {
    out['figures'] = {
      heading: FIGURES_HEADING,
      ...Object.fromEntries(brief.figures.map((w) => [w.figure, { value: w.value, ...(w.rooms.length > 0 ? { rooms: [...w.rooms] } : {}), ...some('measure', w.measure ?? w.door), ...s(w) }])),
    }
  }
  if (brief.open.length > 0) out['open'] = brief.open.map((w) => ({ quote: w.quote, ...some('about', w.about) }))
  if (brief.people !== undefined) out['people'] = Object.fromEntries(Object.entries(brief.people).map(([kind, f]) => [kind, f.rooms === undefined ? f.count : { count: f.count, rooms: [...f.rooms] }]))
  return out
}

// ---------------------------------------------------------------------------------------------
// The file

function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

/** The brief file as read: its path in the project, the brief, and why it could not be read. */
export interface BriefRead {
  /** The brief file, relative to the project folder. */
  readonly file: string
  /** Null when there is no brief, or it could not be read. */
  readonly brief: Brief | null
  /** Why the file could not be read, when it is there and wrong. */
  readonly problem: string | null
}

/**
 * Reads the brief beside `planFile`, inside the project. No file is no brief. A file that can't
 * be read gives no brief and says why, so an edit never fails on it. A path the project refuses
 * throws `PathRefused`.
 */
export function readBrief(project: Project, planFile: string): BriefRead {
  const file = briefFileOf(planFile)
  const shown = path.basename(file)
  const relative = project.relative(project.resolve(file))
  let text: string
  try {
    text = project.readText(file, BRIEF_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) return { file: relative, brief: null, problem: `${shown}: ${oneLine(error.message)}` }
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { file: relative, brief: null, problem: null }
    if (code === 'EISDIR') return { file: relative, brief: null, problem: `${shown} is a folder, not a brief` }
    if (code === 'EFBIG') return { file: relative, brief: null, problem: `${shown} is larger than ${BRIEF_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a brief` }
    if (code === 'EACCES' || code === 'EPERM') return { file: relative, brief: null, problem: `${shown} can't be read: permission denied` }
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // The parser's message quotes the text around the fault, and the text holds the person's words.
    return { file: relative, brief: null, problem: `${shown} is not JSON` }
  }
  try {
    return { file: relative, brief: parseBrief(raw), problem: null }
  } catch (error) {
    if (error instanceof BriefRefused) return { file: relative, brief: null, problem: `${shown} is not a brief: ${error.message}` }
    throw error
  }
}

/** Writes the brief beside `planFile`, replacing the one there. Returns its path in the project. */
export function writeBrief(project: Project, planFile: string, brief: Brief): string {
  const file = briefFileOf(planFile)
  try {
    return project.relative(project.writeFile(file, `${JSON.stringify(briefJson(brief), null, 2)}\n`))
  } catch (error) {
    if (error instanceof PathRefused) throw error
    const code = (error as NodeJS.ErrnoException).code
    const why = code === 'EACCES' || code === 'EPERM' ? ': permission denied' : code === 'EISDIR' ? ': it is a folder' : code === 'ENOENT' ? ': its folder does not exist' : `: ${oneLine((error as Error).message)}`
    throw new BriefRefused(`Can't write ${path.basename(file)}${why}.`)
  }
}
