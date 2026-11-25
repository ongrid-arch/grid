/**
 * Rooms text to a plan (WRT-2): the author names rooms with their sizes and where they go,
 * and doors and windows by the rooms they join; Grid works out the walls, their kinds, each
 * room's boundary and each opening's wall and offset.
 *
 * The way of writing comes from the lab's rooms-first prototype (lab entry WR-20), which the
 * owner chose as the main way agents write (WRT-1). The plan file stays the source of truth:
 * the text is a way of writing it, and `readRoomsText` reads any plan back as text.
 *
 * The language, one statement per line (`#` starts a comment). A plain number is metres; a length
 * may instead carry its unit in one word: `360cm`, `3600mm`, `12ft`, `12ft6in`, `12'6"` (`words.ts`):
 *
 *   plan "<name>"
 *   display <m|cm|mm|ft-in> [area m2|ft2] [decimal point|comma] [precision <n>]
 *                                      how the person reads lengths and areas: the plan's `display`
 *                                      (WRT-7). It changes no length, and the file stays in metres
 *   building <home|office|shop|...>    what kind of building the plan is (CNT-5)
 *   based on <revision>                the plan this text was read from (written by the read-back)
 *   walls outside <t> inside <t> [interior|partition] height <h>      the thickness rule
 *   walltype <t> <kind>                every inside wall of that thickness gets that kind
 *   sizes inside|centre|outside        what a room's size measures to, when its line does not say
 *   doors height <h>   windows sill <s> height <h>                    defaults
 *   floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]
 *       the name in quotes (or `name <text>`), or left out: the id names the floor. level is the
 *       storey number, whole or a half (0.5), never a height; elevation the metres from the
 *       ground floor's level to this one's; height to its ceiling; slab the floor under it.
 *       `elevation=0`, `level: 1` and `Height = 2.7` are read as `elevation 0` and so on (WRT-14)
 *   room <id> "<name>" <use|-> <width> x <depth> [inside|centre|outside] <where> [...]
 *   room <id> "<name>" <use|-> polygon x,y x,y x,y ...                 inside faces
 *       <where>: at x,y (the south-west inside corner)
 *                <north|south|east|west> of <room or unit> [align <side|centre>] [shift <m>] [until <room>] [open]
 *                inside <room> corner <ne|nw|se|sw> [wall <t> [kind]]  cuts that corner out of the room
 *       then:    walls <t> [kind]  height <h>  floor <m> (its floor above or below the storey's)  first-wall <wall id>
 *                tenure <private|shared|common|commercial>  type "<the firm's own room type>"
 *                outdoor <garden|courtyard|terrace|balcony|light-well|porch|carport|other> [roofed|unroofed]
 *                                 the room is outdoor space (CNT-7, C26), roofed or not
 *                through <floor>  the room, and so its walls, stands on every floor written after this
 *                                 one up to that floor too, in the same place (WRT-4): a stair or lift
 *                                 core, a shaft, a block's outside walls
 *       <use>:   one of Grid's uses, or a word that plainly means one (`USE_WORDS`): 'wc' is toilet
 *       a size may be '*': the room stretches as far as the room named after 'until'
 *   wall between <room> and <room> [<side>] [<t>] [kind|virtual] [height <h>] [id <id>] [reversed]
 *   wall <room> <side> [<t>] [kind] [height <h>] [id <id>] [reversed]  an outside wall
 *   door|window|opening <id> between <room> and <room>, <place>, <w> wide [...]
 *   door|window|opening <id> in <room> <side>, <place>, <w> wide [...]
 *       <place>: centred | <m> from <north|south|east|west> [of <room>]
 *       then:    sill <m>, height <m>, opens into <room>|in|out, hinged <direction>, no-swing
 *                hinged left|right [seen from <room>|outside]  as seen from the room it opens into
 *                unless named (CNT-14); a kind: single, double, sliding, pocket, folding, roller,
 *                garage (doors), single, double, sliding, fixed, high-level (windows); and
 *                part <w> [x <h>], the part that opens
 *   unit <name> [setting=default ...] ... end      rooms and openings written once
 *   unit <name> flat "<type name>" ["<flat name>"] [setting=default ...] ... end
 *       a flat type (CNT-4): every placement of it is a flat of that type in the plan's flats,
 *       with its label as id, the flat name with {n} as the label, its rooms, and mirrored
 *       when it is placed mirrored; the type is in the plan's flat types, by the unit's name
 *   place <unit> as <label> <where> [mirror east-west|north-south] [gap <t>] [setting=value ...]
 *   repeat <unit> <n> <direction> of <room or unit> as <first label> [...]
 *   repeat <unit> <n> <direction> as <first label> <where the first goes> [mirror ...] [gap <t>] [setting=value ...]
 *          [first setting=value ...] [last setting=value ...]
 *       one room type placed n times in a row (WRT-4): the first where the line says, each next one
 *       on the given side of the one before; 'first' and 'last' settings hold for the two ends
 *       only (end rooms a wall's width narrower). A numeric label counts up (301, 302, ...),
 *       another takes a number after it (A1, A2, ...), so the ids are the same on every writing.
 *   copy <floor> [with openings]   rename <room> <new id> "<name>" [use]   remove <id>
 *   raw wall|room|opening { ...Grid's own JSON... }     a part written the Grid way
 *   raw floor { "roof": {...}, "parapet": <m> }         the floor's fields rooms text has no words for (LVL-6);
 *                                                      BRF-4 adds "outline", "homes" and "parking"
 *
 * An opening pattern (LVL-8) is not rooms text, in a unit or out of one: a `pattern` line is
 * refused with where a pattern goes instead (`patternLine`). It lives in the plan file's
 * `patterns`, naming its wall by id, and `grid write` keeps it, so the wall ids written here are
 * what keep it placed (WRT-4: the same on every writing, and when a row grows by one).
 *
 * Pure: text in, a plan and a report out. Nothing here reads or writes a file.
 */
import { BUILDING_TYPES, DOOR_KINDS, OPENING_KINDS, OUTDOOR_KINDS, ROOM_TENURES, ROOM_USES, WALL_DEFAULTS, WINDOW_KINDS, WallKindSchema, readUse, type BuildingType, type FloorPlan, type Opening, type OpeningKind, type Room, type OutdoorKind, type RoomTenure, type RoomUse, type Wall, type WallKind } from '../types/floorplan'
import { doorKindOf, kindFits, sweepsFloor } from '../geometry/openingKinds'
import { hingeSeenFrom } from '../geometry/handing'
import { indexPlan } from '../geometry/plan'
import { tryRoomPolygon } from '../geometry/room'
import { limit, tolerance } from '../geometry/tolerances'
import { buildingKind } from '../geometry/plausible'
import { AREA_UNITS, DECIMAL_MARKS, LENGTH_UNITS, type AreaUnit, type DecimalMark } from '../types/units'
import { english, name as sayName, said, type MessageKey, type Values } from '../messages/say'
import { f2, hasUnit, isNumberWord, metres, numberOf, pointOf, quotedWordsOf, RoomsStop, wordsOf, type LineWord } from './words'
import { checkWritten } from './selfCheck'

type P = readonly [number, number]
/** A wall as the text writes it into the file: no height when the text states none (WRT-6). */
type WrittenWall = Omit<Wall, 'height' | 'unstated'> & { height?: number }

/** The floor's fields a `raw floor` line may hold: LVL-6's roof and parapet, BRF-4's outline, homes and parking. */
export const RAW_FLOOR_KEYS: readonly string[] = ['roof', 'parapet', 'outline', 'homes', 'parking']

/** WRT-14: the words a floor line knows after its id, `name` among them. */
const FLOOR_KEYS: readonly string[] = ['name', 'level', 'elevation', 'height', 'slab', 'building', 'copy']

/** A word of a floor line as it is written back in a refusal's offered line. */
const lineWord = (w: LineWord): string => (w.quoted ? quoteWords(w.text) : w.text)

/** Words in double quotes, or single when they hold a double quote. */
const quoteWords = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`)

/**
 * The plan as rooms text writes it: the file's own JSON, before the reading fills anything in.
 * A wall the text gives no height has none (WRT-6); read it with `parseFloorPlan`.
 */
export type WrittenPlan = Omit<FloorPlan, 'walls'> & { walls: WrittenWall[] }
type Box = readonly [number, number, number, number]

const KINDS: readonly WallKind[] = WallKindSchema.options
const USES: readonly string[] = ROOM_USES
const TENURES: readonly string[] = ROOM_TENURES
const BUILDINGS: readonly string[] = BUILDING_TYPES

/** CNT-5: a use word as the plan file reads it (`readUse`): a use, or a word that plainly means one. */
function roomUseOf(word: string): RoomUse | null {
  const read = readUse(word)
  return typeof read === 'string' && USES.includes(read) ? (read as RoomUse) : null
}
/** WRT-7: a `display` line, as the plan's `display`. */
function displayOfWords(t: readonly string[], at: number): NonNullable<FloorPlan['display']> {
  const usage = `line ${at}: write 'display <m|cm|mm|ft-in> [area m2|ft2] [decimal point|comma] [precision 0-5]': how the person reads lengths and areas.`
  const length = t[1] as NonNullable<FloorPlan['display']>['length']
  if (!(LENGTH_UNITS as readonly string[]).includes(t[1] ?? '')) throw new RoomsStop('rooms/syntax', usage, at)
  const out: { -readonly [K in keyof NonNullable<FloorPlan['display']>]: NonNullable<FloorPlan['display']>[K] } = { length }
  for (let i = 2; i < t.length; i += 2) {
    const key = t[i]!
    const value = t[i + 1]
    if (key === 'area' && (AREA_UNITS as readonly string[]).includes(value ?? '') && out.area === undefined) out.area = value as AreaUnit
    else if (key === 'decimal' && (DECIMAL_MARKS as readonly string[]).includes(value ?? '') && out.decimal === undefined) out.decimal = value as DecimalMark
    else if (key === 'precision' && /^[0-5]$/.test(value ?? '') && out.precision === undefined) out.precision = Number(value)
    else throw new RoomsStop('rooms/syntax', usage, at)
  }
  return out
}
const S2 = Math.sqrt(0.5)
const DIRS: Readonly<Record<string, P>> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }
const DIAG: Readonly<Record<string, P>> = { ne: [S2, S2], nw: [-S2, S2], se: [S2, -S2], sw: [-S2, -S2] }
const COMPASS: Readonly<Record<string, P>> = { ...DIRS, ...DIAG }
const MIRROR_X: Readonly<Record<string, string>> = { east: 'west', west: 'east', ne: 'nw', nw: 'ne', se: 'sw', sw: 'se' }
const MIRROR_Y: Readonly<Record<string, string>> = { north: 'south', south: 'north', ne: 'se', se: 'ne', nw: 'sw', sw: 'nw' }
export const SIZE_BASES = ['inside', 'centre', 'outside'] as const
export type SizeBasis = (typeof SIZE_BASES)[number]
const BASIS_WORDS: Readonly<Record<string, SizeBasis>> = { inside: 'inside', centre: 'centre', center: 'centre', outside: 'outside' }
/** The wall thicknesses rooms text writes when its `walls` line does not say (BRF-6's first layout packs by them). */
export const ROOMS_WALLS = { outside: 0.3, inside: 0.1 } as const
/** How far apart two parallel room faces may be and still be looked at as one wall's two faces. */
const FACING_REACH = 3
/** How far out of line two faces may be and still be named as sizes that do not add up. */
const STEP_REACH = 0.12

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
const cross = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
const norm = (a: P): number => Math.hypot(a[0], a[1])
const unit = (a: P): P => {
  const n = norm(a)
  return [a[0] / n, a[1] / n]
}
const r4 = (v: number): number => {
  const r = Math.round(v * 10000) / 10000
  return Object.is(r, -0) || r === 0 ? 0 : r
}
const eps = (): number => tolerance('joint')
/** How far inside a room's edge a point is taken to stand in it, when two rooms are tested for overlap. */
const probe = (): number => tolerance('roomsTouch') / 4

function signedArea(pts: readonly P[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/**
 * WRT-4 with LVL-8: why a `pattern` line (or `raw pattern`) is refused, and where a pattern goes.
 * A unit cannot hold one either: a pattern names one wall by its id, not a unit's room side.
 */
function patternLine(at: number, inUnit: boolean): string {
  return `line ${at}: an opening pattern is not rooms text${inUnit ? ', and a unit cannot hold one' : ''}. Write it in the plan file's "patterns", naming its wall by id (grid describe --as rooms gives the ids; 'id <id>' on a wall line fixes one): grid write keeps it, and its openings are placed on that wall and on the floors it names. Openings written in a unit are placed with every copy of it.`
}

function contains(poly: readonly P[], pt: P): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a[1] > pt[1] !== b[1] > pt[1]) {
      const x = a[0] + ((pt[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])
      if (pt[0] < x) inside = !inside
    }
  }
  return inside
}

function intersectLines(p1: P, d1: P, p2: P, d2: P): P | null {
  const den = cross(d1, d2)
  if (Math.abs(den) < tolerance('parallel')) return null
  const t = cross(sub(p2, p1), d2) / den
  return add(p1, mul(d1, t))
}

function cleanPoly(pts: readonly P[]): P[] {
  const out: P[] = []
  for (const p of pts) if (out.length === 0 || norm(sub(p, out[out.length - 1]!)) > eps()) out.push(p)
  if (out.length > 1 && norm(sub(out[0]!, out[out.length - 1]!)) < eps()) out.pop()
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length]!
      const b = out[i]!
      const c = out[(i + 1) % out.length]!
      if (Math.abs(cross(sub(b, a), sub(c, b))) < tolerance('noLength')) {
        out.splice(i, 1)
        changed = true
        break
      }
    }
  }
  if (signedArea(out) < 0) out.reverse()
  return out
}

function boxOf(polys: readonly (readonly P[])[]): Box {
  const xs = polys.flatMap((poly) => poly.map((p) => p[0]))
  const ys = polys.flatMap((poly) => poly.map((p) => p[1]))
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

const compassOf = (n: P, table: Readonly<Record<string, P>> = COMPASS): string =>
  Object.keys(table).reduce((best, k) => (dot(n, table[k]!) > dot(n, table[best]!) ? k : best))

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
/** LVL-12: one of two rooms is outdoor space (CNT-7) and the other is not: the wall between faces outside. */
const facesOutdoor = (a: Pick<RoomDraft, 'outdoor'>, b: Pick<RoomDraft, 'outdoor'>): boolean => (a.outdoor === null) !== (b.outdoor === null)

// ---------------------------------------------------------------------------------------------
// What the text says

/** A wall the text says something about: its thickness, kind, height, id or direction. */
interface WallSay {
  t: number | null
  kind: WallKind | 'virtual' | null
  height: number | null
  id: string | null
  reversed: boolean
  line: number
}

interface RoomDraft {
  id: string
  name: string
  use: RoomUse | undefined
  line: number
  poly: P[]
  box: Box
  wallsT: number | null
  wallsKind: WallKind | null
  height: number | null
  /** LVL-7: how far the room's floor stands above or below its storey's floor level. */
  floorOffset: number | null
  firstWall: string | null
  /** CNT-5: who the room is for, and the firm's own room type. */
  tenure: RoomTenure | null
  roomType: string | null
  /** CNT-7 (C26): the outdoor kind, and whether a roof covers it when the line says. */
  outdoor: OutdoorKind | null
  roofed: boolean | null
  /** The size as written and what it measures to, for the answer. */
  size: { w: number | null; d: number | null; basis: SizeBasis } | null
  /** WRT-4: the last floor the room rises through, when it stands on the floors after its own too. */
  through: string | null
  /** WRT-4: the floor whose room this one is, standing here because that one rises through. */
  risenFrom: string | null
}

interface OpeningLine {
  words: string[]
  line: number
}

interface FloorDraft {
  id: string
  name: string
  level: number
  height: number | null
  elevation: number | null
  slab: number | null
  /** CNT-5: the floor's own kind of building. */
  building: BuildingType | null
  /** LVL-6: the floor's fields rooms text has no words for, as Grid's plan file holds them (`raw floor`). */
  extra: { roof?: unknown; parapet?: unknown }
  rooms: Map<string, RoomDraft>
  inst: Map<string, string[]>
  between: Map<string, WallSay>
  /** What the text says about one of several walls two rooms share: keyed by the pair, a room and its side. */
  betweenSide: Map<string, WallSay>
  open: Set<string>
  extover: Array<{ room: string; side: string; say: WallSay }>
  openings: OpeningLine[]
  raw: { walls: unknown[]; rooms: unknown[]; openings: unknown[] }
  /** CNT-4: each placement of a flat type on this floor: its label, its unit, its rooms and whether it is mirrored. */
  flats: Array<{ label: string; unit: string; mirrored: boolean; rooms: RoomDraft[] }>
}

interface Unit {
  params: Map<string, string>
  body: Array<{ line: number; text: string }>
}

interface PlaceCtx {
  local: Map<string, RoomDraft>
  mx: boolean
  my: boolean
}

// ---------------------------------------------------------------------------------------------
// The answer

/** One problem or warning, with its code and, where there is one, its line. */
export interface RoomsProblem {
  readonly code: string
  readonly line: number | null
  readonly message: string
  /**
   * MSG-7 with BRF-6 (lab AB-11): each change to one line that would clear the problem, as data:
   * the line, numbered from 1, and the text to write there. Only a door between two rooms that
   * share no wall has one today: the other alignment of one of the rooms.
   */
  readonly fixes?: readonly RoomsFix[]
}

/** One line of rooms text written another way: its number, from 1, and its new text. */
export interface RoomsFix {
  readonly line: number
  readonly text: string
}

export interface RoomFacts {
  readonly id: string
  readonly name: string
  readonly floor: string
  /** Inside faces, east-west by north-south, for a rectangle; the box for any other outline. */
  readonly width: number
  readonly depth: number
  readonly area: number
  readonly corners: number
  /** ARE-16: the room is no floor inside the building: outdoor space (CNT-7) or a void (LVL-4). Left out of the inside total. */
  readonly apart?: 'outdoor' | 'void'
  /** What the size on the room's line measured to, and the numbers written. */
  readonly basis: SizeBasis | null
  readonly written: { readonly width: number | null; readonly depth: number | null } | null
}

export interface DerivedWallFacts {
  readonly id: string
  readonly kind: WallKind
  readonly virtual: boolean
  readonly thickness: number
  readonly length: number
  /** The rooms on its two sides, or one room for an outside wall. */
  readonly rooms: readonly string[]
  /** The statements that would say something about it: `wall between a and b` or `wall a south`. */
  readonly handles: readonly string[]
  /** Its stretches along its centre line, each with the statement that says something about it. */
  readonly stretches: readonly { readonly handle: string; readonly start: readonly [number, number]; readonly end: readonly [number, number] }[]
}

export interface RoomsResult {
  /** Null when a problem stopped the writing: nothing is to be written then. */
  readonly plan: WrittenPlan | null
  readonly name: string | null
  readonly basedOn: string | null
  readonly problems: readonly RoomsProblem[]
  readonly warnings: readonly RoomsProblem[]
  readonly guesses: readonly string[]
  readonly rooms: readonly RoomFacts[]
  readonly walls: readonly DerivedWallFacts[]
  readonly openings: readonly string[]
  /** The default size basis, and whether the text stated it. */
  readonly sizes: { readonly basis: SizeBasis; readonly stated: boolean }
}

// ---------------------------------------------------------------------------------------------
// The compiler

interface Edge {
  room: RoomDraft
  i: number
  p: P
  q: P
  u: P
  n: P
  L: number
  cands: Array<{ s0: number; s1: number; d: number; f: Edge }>
  cover: Array<{ s0: number; s1: number; d: number; f: Edge }>
  idx: number
}

interface RawWall {
  a: P
  b: P
  t: number
  kind: WallKind
  virtual: boolean
  /** Null when the text states none: the file gets no height, and the reading fills it (WRT-6). */
  height: number | null
  wantId: string | null
  reversed: boolean
  rooms: RoomDraft[]
  sides: Array<[number, number, number]>
  ext: boolean
  handles: string[]
  d?: P
  lo?: number
  hi?: number
  wall?: DerivedWall
}

interface DerivedWall {
  lo: number
  hi: number
  raws: RawWall[]
  d: P
  t: number
  kind: WallKind
  virtual: boolean
  height: number | null
  base: P
  a: P
  b: P
  a2: P
  b2: P
  start: P
  end: P
  ext: boolean
  id: string
  json: WrittenWall
  sidesRooms: [string[], string[]]
}

class Compiler {
  private readonly lines: string[]
  name: string | null = null
  basedOn: string | null = null
  /** CNT-5: what kind of building the plan is. */
  building: BuildingType | null = null
  /** WRT-7: how the person reads lengths and areas, from a `display` line. */
  display: NonNullable<FloorPlan['display']> | null = null
  // WRT-6 (lab AU3-6): no height until the text states one. A wall the text gives no height is
  // written with none, and the reading gives it its floor's height or Grid's default.
  private rule: { outside: number; inside: number; height: number | null; kind: WallKind } = { ...ROOMS_WALLS, height: null, kind: 'interior' }
  private dflt = { doorH: 2.1, winSill: 0.9, winH: 1.2 }
  private tkinds = new Map<number, WallKind>()
  sizes: { basis: SizeBasis; stated: boolean } = { basis: 'inside', stated: false }
  readonly floors: FloorDraft[] = []
  private explicitFloors = false
  /** One wall per stretch between two rooms, never one long wall past several. */
  split = false
  private units = new Map<string, Unit>()
  /** CNT-4: the units that are flat types, in the order written: the type's name and the flats' name. */
  private flatTypes = new Map<string, { name: string; flatName: string | null }>()
  /** WRT-4: rooms that rise through the floors written after their own, up to `through`. */
  private risers: Array<{ room: string; from: string; through: string; line: number; done?: boolean }> = []
  private cur: FloorDraft | null = null
  readonly problems: RoomsProblem[] = []
  readonly warnings: RoomsProblem[] = []
  readonly guesses: string[] = []
  readonly roomFacts: RoomFacts[] = []
  readonly wallFacts: DerivedWallFacts[] = []
  readonly openingFacts: string[] = []
  /** WRT-17: the parts written raw, in Grid's own JSON: the person's, not worked out here. */
  readonly rawIds = new Set<string>()
  /** WRT-17: every wall thickness a line of the text states, besides the walls line. */
  private readonly statedT = new Set<number>()
  /** WRT-17: the pairs of rooms whose wall's thickness, from their gap, has been said. */
  private readonly fromGap = new Set<string>()
  /** WRT-17: the line each opening was written on, for a refusal that names it. */
  private readonly openingLines = new Map<string, number>()
  /** The wall thickness each side of a sized room was taken to have, keyed floor|room|side. */
  readonly assumed: Map<string, number>
  /** What each side of a sized room turned out to have. */
  readonly found = new Map<string, number>()
  /**
   * WRT-22: the room sides written with no unit, stretched with '*' or drawn as a polygon, keyed
   * line|room|side; asked about once the plan's kind of building is known (`askSizes`).
   */
  private readonly sides = new Map<string, { line: number; room: string; side: 'width' | 'depth'; length: number; how: 'bare' | 'stretched' | 'polygon' }>()

  /** How the walls' ends and thicknesses are written: to a tenth of a millimetre, unless asked finer. */
  private readonly fix: (value: number) => number

  constructor(text: string, assumed: Map<string, number>, options: CompileOptions = {}) {
    this.lines = text.split(/\r\n|\r|\n/)
    this.assumed = assumed
    const places = options.places ?? 4
    const scale = 10 ** places
    this.fix = places === 4 ? r4 : (v: number): number => {
      const r = Math.round(v * scale) / scale
      return Object.is(r, -0) || r === 0 ? 0 : r
    }
  }

  private stop(code: string, at: number | null, message: string): never {
    throw new RoomsStop(code, message, at)
  }

  private problem(code: string, at: number | null, message: string): void {
    this.problems.push({ code, line: at, message })
  }

  private warn(code: string, at: number | null, message: string): void {
    this.warnings.push({ code, line: at, message })
  }

  private floor(): FloorDraft {
    if (this.cur === null) {
      this.cur = newFloor('ground', 'Ground floor', 0)
      this.floors.push(this.cur)
    }
    return this.cur
  }

  run(): WrittenPlan | null {
    let i = 0
    while (i < this.lines.length) {
      const at = i + 1
      const text = this.lines[i]!
      i++
      const rawFloor = /^\s*raw\s+floor\s+(.*)$/.exec(text)
      if (rawFloor) {
        this.rawFloor(rawFloor[1]!, at)
        continue
      }
      if (/^\s*raw\s+pattern\b/.test(text)) this.stop('rooms/syntax', at, patternLine(at, false))
      const raw = /^\s*raw\s+(wall|room|opening)\s+(.*)$/.exec(text)
      if (raw) {
        this.rawPart(raw[1] as 'wall' | 'room' | 'opening', raw[2]!, at)
        continue
      }
      const t = wordsOf(text, at)
      if (t.length === 0) continue
      if (t[0] === 'unit') {
        if (t.length < 2) this.stop('rooms/syntax', at, `line ${at}: write 'unit <name> [setting=default ...]', its lines, then 'end'.`)
        const params = new Map<string, string>()
        let settings = t.slice(2)
        if (settings[0] === 'flat') {
          // CNT-4: `unit <name> flat "<type name>" ["<flat name>"]`: the unit is a flat type.
          const typeName = settings[1]
          if (typeName === undefined || typeName.includes('=')) this.stop('rooms/syntax', at, `line ${at}: a flat type is written 'unit <name> flat "<type name>" ["<flat name>"] [setting=default ...]'.`)
          const flatName = settings[2] !== undefined && !settings[2].includes('=') ? settings[2] : null
          this.flatTypes.set(t[1]!, { name: typeName, flatName })
          settings = settings.slice(flatName === null ? 2 : 3)
        }
        for (const p of settings) {
          const eq = p.indexOf('=')
          if (eq < 0) this.stop('rooms/syntax', at, `line ${at}: a unit's settings are written name=value, found '${p}'.`)
          params.set(p.slice(0, eq), p.slice(eq + 1))
        }
        const body: Array<{ line: number; text: string }> = []
        while (i < this.lines.length && wordsOf(this.lines[i]!, i + 1)[0] !== 'end') {
          const line = this.lines[i]!
          if (line.trim() !== '' && !line.trim().startsWith('#')) body.push({ line: i + 1, text: line })
          i++
        }
        if (i >= this.lines.length) this.stop('rooms/syntax', at, `line ${at}: unit '${t[1]}' has no closing 'end' line.`)
        i++
        this.units.set(t[1]!, { params, body })
      } else {
        this.statement(t, at)
      }
    }
    for (const riser of this.risers) {
      if (riser.done === true) continue
      const after = this.floors.slice(this.floors.findIndex((f) => f.id === riser.from) + 1).map((f) => f.id)
      this.stop(
        'rooms/unknown-floor',
        riser.line,
        `line ${riser.line}: room '${riser.room}' rises through '${riser.through}', which is not a floor written after floor '${riser.from}'. ${after.length === 0 ? 'No floor is written after it.' : `Floors written after it: ${after.join(', ')}.`}`
      )
    }
    return this.emit()
  }

  /** LVL-6: the current floor's `roof` and `parapet`, as Grid's plan file holds them; BRF-4: its `outline`, `homes` and `parking`. */
  private rawFloor(json: string, at: number): void {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      this.stop('rooms/raw', at, `line ${at}: a raw floor is one JSON object on the rest of the line, with the floor's roof, parapet, outline, homes, parking or level as Grid's plan file holds them; this one could not be read.`)
    }
    const keys = typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : null
    // WRT-14: a level that is no storey number (neither whole nor a half) is the plan file's own too.
    if (keys === null || keys.some((k) => !RAW_FLOOR_KEYS.includes(k) && k !== 'level')) {
      this.stop('rooms/raw', at, `line ${at}: a raw floor is a JSON object holding only the floor's "roof", "parapet", "outline", "homes", "parking" and "level", as Grid's plan file holds them.`)
    }
    Object.assign(this.floor().extra, value)
  }

  private rawPart(kind: 'wall' | 'room' | 'opening', json: string, at: number): void {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      this.stop('rooms/raw', at, `line ${at}: a raw ${kind} is one JSON object on the rest of the line, as Grid's plan file holds it; this one could not be read.`)
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value) || typeof (value as { id?: unknown }).id !== 'string') {
      this.stop('rooms/raw', at, `line ${at}: a raw ${kind} is a JSON object with an "id", as Grid's plan file holds it.`)
    }
    const fl = this.floor()
    const list = kind === 'wall' ? fl.raw.walls : kind === 'room' ? fl.raw.rooms : fl.raw.openings
    list.push(value)
    this.rawIds.add((value as { id: string }).id)
  }

  private statement(t: string[], at: number): void {
    const kw = t[0]!
    switch (kw) {
      case 'plan':
        this.name = t[1] ?? null
        return
      case 'building':
        if (t.length !== 2 || !BUILDINGS.includes(t[1]!)) this.stop('rooms/syntax', at, `line ${at}: write 'building <kind>': one of ${BUILDINGS.join(', ')}.`)
        this.building = t[1] as BuildingType
        return
      case 'display':
        this.display = displayOfWords(t, at)
        return
      case 'based':
        if (t[1] !== 'on' || t.length !== 3) this.stop('rooms/syntax', at, `line ${at}: write 'based on <revision>', as the read-back writes it.`)
        this.basedOn = t[2]!
        return
      case 'walls':
        this.readPairs(t.slice(1), at, { outside: 'outside', inside: 'inside', height: 'height' }, this.rule as unknown as Record<string, unknown>, true)
        return
      case 'doors':
        this.readPairs(t.slice(1), at, { height: 'doorH' }, this.dflt as unknown as Record<string, unknown>, false)
        return
      case 'windows':
        this.readPairs(t.slice(1), at, { sill: 'winSill', height: 'winH' }, this.dflt as unknown as Record<string, unknown>, false)
        return
      case 'sizes': {
        const basis = BASIS_WORDS[t[1] ?? '']
        if (t.length !== 2 || basis === undefined) this.stop('rooms/syntax', at, `line ${at}: write 'sizes inside', 'sizes centre' or 'sizes outside': what a room's size measures to.`)
        this.sizes = { basis, stated: true }
        return
      }
      case 'walltype':
        if (t.length !== 3 || !KINDS.includes(t[2] as WallKind)) {
          this.stop('rooms/syntax', at, `line ${at}: write 'walltype <thickness> <interior|partition|exterior>': every inside wall of that thickness gets that kind.`)
        }
        this.tkinds.set(Math.round(numberOf(t[1]!, at) * 1000), t[2] as WallKind)
        return
      case 'floor':
        this.stFloor(t, at)
        return
      case 'room': {
        const room = this.readRoom(t, at, null)
        this.addRoom(room, null)
        if (room.through !== null) this.risers.push({ room: room.id, from: this.floor().id, through: room.through, line: at })
        return
      }
      case 'wall':
        this.stWall(t, at)
        return
      case 'door':
      case 'window':
      case 'opening':
        this.floor().openings.push({ words: t, line: at })
        return
      case 'place':
        this.stPlace(t, at)
        return
      case 'repeat':
        this.stRepeat(t, at)
        return
      case 'copy':
        this.stCopy(t, at)
        return
      case 'rename':
        this.stRename(t, at)
        return
      case 'remove':
        this.stRemove(t, at)
        return
      case 'pattern':
        return this.stop('rooms/syntax', at, patternLine(at, false))
      default:
        this.stop(
          'rooms/syntax',
          at,
          `line ${at}: '${kw}' is not a word this way of writing knows. A line starts with one of: plan, building, based, walls, walltype, sizes, doors, windows, floor, room, wall, door, window, opening, unit, place, repeat, copy, rename, remove, raw.`
        )
    }
  }

  private readPairs(t: string[], at: number, keys: Record<string, string>, target: Record<string, unknown>, kinds: boolean): void {
    let i = 0
    while (i < t.length) {
      const w = t[i]!
      if (Object.hasOwn(keys, w) && i + 1 < t.length) {
        target[keys[w]!] = numberOf(t[i + 1]!, at)
        i += 2
      } else if (kinds && KINDS.includes(w as WallKind)) {
        target['kind'] = w
        i++
      } else {
        this.stop('rooms/syntax', at, `line ${at}: '${w}' is not understood here. Known words: ${Object.keys(keys).join(', ')}${kinds ? ', interior, partition' : ''}.`)
      }
    }
  }

  /**
   * WRT-14: `floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy ...]`.
   * The name is optional (the id names a floor with none) and written in quotes, or as `name <text>`;
   * the settings may be written as agents guess them (`elevation=0`, `level: 1`, `Height = 2.7`);
   * and level is the storey number, a whole number or a half. Every refusal quotes the whole form.
   */
  private stFloor(t: string[], at: number): void {
    const refuse: (problem: string, code?: string) => never = (problem, code = 'rooms/syntax') => this.stop(code, at, `line ${at}: ${problem} ${english(said('rooms.floor.how', { form: said('rooms.floor.form') }))}`)
    const say = (key: MessageKey, values?: Values): string => english(said(key, values))
    const all = quotedWordsOf(this.lines[at - 1] ?? t.join(' '), at)
    const id = all[1]
    if (id === undefined || id.text.includes('=') || id.text.includes(':') || FLOOR_KEYS.includes(id.text.toLowerCase())) refuse(say('rooms.floor.noId'))
    // The settings as `key value`, whichever way the key and its value were joined.
    const words: LineWord[] = []
    for (const w of all.slice(2)) {
      const m = w.quoted ? null : /^([A-Za-z]+)\s*[=:]\s*(.*)$/.exec(w.text)
      if (m !== null && FLOOR_KEYS.includes(m[1]!.toLowerCase())) {
        words.push({ text: m[1]!.toLowerCase(), quoted: false })
        if (m[2] !== '') words.push({ text: m[2]!, quoted: false })
      } else if (!w.quoted && (w.text === '=' || w.text === ':') && words.length > 0) {
        continue
      } else if (!w.quoted && FLOOR_KEYS.includes(w.text.toLowerCase())) {
        words.push({ text: w.text.toLowerCase(), quoted: false })
      } else {
        words.push(w)
      }
    }
    let name: string | null = null
    let i = 0
    if (words[0]?.quoted === true) {
      name = words[0].text
      i = 1
      const setting = /^\s*([A-Za-z]+)\s*[=:]\s*(\S*)\s*$/.exec(name)
      if (setting !== null && FLOOR_KEYS.includes(setting[1]!.toLowerCase())) {
        const fixed = [`floor ${id.text}`, `${setting[1]!.toLowerCase()} ${setting[2]}`.trim(), ...words.slice(1).map(lineWord)].join(' ')
        refuse(say('rooms.floor.settingName', { name: sayName(name), setting: `${setting[1]!.toLowerCase()} ${setting[2]}`.trim(), line: fixed }))
      }
    } else if (words[0] !== undefined && isNumberWord(words[0].text)) {
      refuse(say('rooms.floor.unknown', { word: words[0].text }))
    } else if (words[0] !== undefined && !FLOOR_KEYS.includes(words[0].text)) {
      // An unquoted name: the words up to the first setting, offered back in quotes.
      let end = 0
      while (end < words.length && (words[end]!.quoted || !FLOOR_KEYS.includes(words[end]!.text))) end++
      const fixed = [`floor ${id.text}`, quoteWords(words.slice(0, end).map((w) => w.text).join(' ')), ...words.slice(end).map(lineWord)].join(' ')
      refuse(say('rooms.floor.unquoted', { word: words[0].text, line: fixed }))
    }
    const fl = newFloor(id.text, name ?? id.text, this.floors.length === 0 ? 0 : this.floors.length)
    let copy: string[] | null = null
    const seen = new Set<string>()
    while (i < words.length) {
      const w = words[i]!
      const key = w.quoted ? '' : w.text
      if (!FLOOR_KEYS.includes(key)) refuse(say('rooms.floor.unknown', { word: w.text }))
      if (key === 'copy') {
        // WRT-4: 'floor l4 "Fourth floor" level 4 copy l3', the floor and its copy on one line.
        copy = words.slice(i).map((x) => x.text)
        break
      }
      if (seen.has(key) || (key === 'name' && name !== null)) refuse(say('rooms.floor.twice', { word: key }))
      seen.add(key)
      const value = words[i + 1]
      if (value === undefined || (!value.quoted && FLOOR_KEYS.includes(value.text))) refuse(say('rooms.floor.noValue', { word: key }))
      i += 2
      if (key === 'name') {
        name = value.text
        fl.name = name
      } else if (key === 'building') {
        if (!BUILDINGS.includes(value.text)) refuse(say('rooms.floor.building', { word: value.text, kinds: BUILDINGS.join(', ') }))
        fl.building = value.text as BuildingType
      } else if (key === 'level') {
        fl.level = this.storeyNumber(value.text, at, refuse)
      } else {
        let v: number
        try {
          v = numberOf(value.text, at)
        } catch (error) {
          if (!(error instanceof RoomsStop)) throw error
          refuse(error.message.replace(/^line \d+: /, ''), error.code)
        }
        if (key === 'height') fl.height = v
        else if (key === 'elevation') fl.elevation = v
        else fl.slab = v
      }
    }
    if (this.floors.some((f) => f.id === fl.id)) refuse(say('rooms.floor.duplicate', { id: fl.id }), 'rooms/duplicate-id')
    if (!this.explicitFloors && this.floors.length > 0) refuse(say('rooms.floor.roomsFirst'))
    this.explicitFloors = true
    this.floors.push(fl)
    this.cur = fl
    this.riseInto(fl)
    if (copy !== null) this.stCopy(copy, at)
  }

  /** WRT-14: a level is the storey number, a whole number or a half; never a length. */
  private storeyNumber(word: string, at: number, refuse: (problem: string) => never): number {
    if (/[a-z'"]/i.test(word)) refuse(english(said('rooms.floor.levelLength', { value: word })))
    const v = numberOf(word, at)
    if (!Number.isInteger(v * 2)) refuse(english(said('rooms.floor.levelFraction', { value: word })))
    return v
  }

  /**
   * WRT-4: the rooms that rise through this floor stand on it, in the same place, with what the
   * text said about the walls between them and their outside walls.
   */
  private riseInto(fl: FloorDraft): void {
    const rising = this.risers.filter((r) => r.done !== true)
    for (const riser of rising) {
      const src = this.floors.find((f) => f.id === riser.from)!
      const room = src.rooms.get(riser.room)
      if (room === undefined) continue
      this.addRoom({ ...room, poly: [...room.poly], through: null, risenFrom: src.id }, null)
      if (riser.through === fl.id) riser.done = true
    }
    const risen = new Set(rising.map((r) => `${r.from}\u0000${r.room}`))
    const ofRisers = (from: string, key: string): boolean => key.split('\u0000').slice(0, 2).every((id) => risen.has(`${from}\u0000${id}`))
    for (const from of new Set(rising.map((r) => r.from))) {
      const src = this.floors.find((f) => f.id === from)!
      for (const [k, v] of src.between) if (ofRisers(from, k)) fl.between.set(k, { ...v })
      for (const [k, v] of src.betweenSide) if (ofRisers(from, k)) fl.betweenSide.set(k, { ...v })
      for (const k of src.open) if (ofRisers(from, k)) fl.open.add(k)
      for (const e of src.extover) if (risen.has(`${from}\u0000${e.room}`)) fl.extover.push({ ...e, say: { ...e.say } })
    }
  }

  // ------------------------------------------------------------------------------------------
  // Rooms

  private lookup(ref: string, at: number, ctx: PlaceCtx | null): { box: Box; rooms: RoomDraft[] } {
    const fl = this.floor()
    if (ctx !== null) {
      const r = ctx.local.get(ref)
      if (r) return { box: r.box, rooms: [r] }
      this.stop('rooms/unknown-room', at, `line ${at}: inside a unit, '${ref}' must be a room of the same unit written above this line. Rooms so far: ${[...ctx.local.keys()].join(', ') || 'none'}.`)
    }
    const r = fl.rooms.get(ref)
    if (r) return { box: r.box, rooms: [r] }
    const inst = fl.inst.get(ref)
    if (inst) {
      const rooms = inst.map((id) => fl.rooms.get(id)!)
      return { box: boxOf(rooms.map((x) => [[x.box[0], x.box[1]], [x.box[2], x.box[3]]] as P[])), rooms }
    }
    const known = [...fl.rooms.keys(), ...fl.inst.keys()]
    this.stop(
      'rooms/unknown-room',
      at,
      `line ${at}: '${ref}' is not a room or a placed unit on floor '${fl.id}' at this point. If it was removed or renamed, measure from another room. If it comes later, move it above this line: rooms are placed in the order written. Known so far: ${known.join(', ') || 'none'}.`
    )
  }

  private gapBetween(room: RoomDraft, others: RoomDraft[]): number {
    const fl = this.floor()
    if (others.length === 1) {
      const key = pairKey(room.id, others[0]!.id)
      if (fl.open.has(key)) return 0
      const say = fl.between.get(key)
      if (say && say.t !== null) return say.t
    }
    const ts = [room, ...others].map((r) => r.wallsT).filter((t): t is number => t !== null)
    if (ts.length > 0) return Math.max(...ts)
    // LVL-12: a room beside outdoor space (a courtyard, a terrace) is set off by an outside wall.
    return others.length === 1 && facesOutdoor(room, others[0]!) ? this.rule.outside : this.rule.inside
  }

  private readRoom(t: string[], at: number, ctx: PlaceCtx | null): RoomDraft {
    if (t.length < 4) this.stop('rooms/syntax', at, `line ${at}: write 'room <id> "<name>" <use> <width> x <depth> <where>'.`)
    const [, id, name, useWord] = t as [string, string, string, string]
    let use: RoomUse | undefined
    if (useWord === '-') use = undefined
    else if (roomUseOf(useWord) !== null) use = roomUseOf(useWord)!
    else {
      this.stop('rooms/unknown-use', at, `line ${at}: '${useWord}' is not a room use Grid knows. Use one of: ${USES.join(', ')}; or '-' for none. The room's name keeps the person's own word: "Pooja room", "Bryggers".`)
    }
    const fl = this.floor()
    const room: RoomDraft = { id, name, use, line: at, poly: [], box: [0, 0, 0, 0], wallsT: null, wallsKind: null, height: null, floorOffset: null, firstWall: null, tenure: null, roomType: null, outdoor: null, roofed: null, size: null, through: null, risenFrom: null }
    const mx = ctx?.mx === true
    const my = ctx?.my === true
    let W: string | null = null
    let D: string | null = null
    let basis: SizeBasis | null = null
    let poly: P[] | null = null
    const place: { at?: P; dir?: string; ref?: string; align?: string; shift?: number; until?: string; inside?: string; corner?: string; open?: boolean; wallT?: number; wallKind?: WallKind | null } = {}
    let i = 4
    while (i < t.length) {
      const w = t[i]!
      const m = /^([0-9.+\-*/()]+|\*)x([0-9.+\-*/()]+|\*)$/.exec(w)
      if (m) {
        W = m[1]!
        D = m[2]!
        i++
      } else if (i + 2 < t.length && ['x', '×', 'by'].includes(t[i + 1]!) && (isNumberWord(w) || w === '*')) {
        W = w
        D = t[i + 2]!
        i += 3
      } else if (Object.hasOwn(BASIS_WORDS, w) && !(w === 'inside' && t[i + 2] === 'corner')) {
        basis = BASIS_WORDS[w]!
        i++
      } else if (w === 'polygon') {
        poly = []
        i++
        while (i < t.length && /^[0-9.+\-*/()]+,[0-9.+\-*/()]+$/.test(t[i]!)) {
          poly.push(pointOf(t[i]!, at))
          i++
        }
        if (poly.length < 3) this.stop('rooms/syntax', at, `line ${at}: a polygon needs at least three points written x,y.`)
      } else if (w === 'at' && i + 1 < t.length) {
        place.at = pointOf(t[i + 1]!, at)
        i += 2
      } else if (Object.hasOwn(DIRS, w) && i + 2 < t.length && t[i + 1] === 'of') {
        place.dir = w
        place.ref = t[i + 2]!
        i += 3
      } else if (w === 'align' && i + 1 < t.length) {
        place.align = t[i + 1]!
        i += 2
      } else if (w === 'shift' && i + 1 < t.length) {
        place.shift = numberOf(t[i + 1]!, at)
        i += 2
      } else if (w === 'until' && i + 1 < t.length) {
        place.until = t[i + 1]!
        i += 2
      } else if (w === 'inside' && i + 3 < t.length && t[i + 2] === 'corner') {
        place.inside = t[i + 1]!
        place.corner = t[i + 3]!
        i += 4
      } else if (w === 'open') {
        place.open = true
        i++
      } else if (w === 'height' && i + 1 < t.length) {
        room.height = numberOf(t[i + 1]!, at)
        i += 2
      } else if (w === 'floor' && i + 1 < t.length && isNumberWord(t[i + 1]!)) {
        room.floorOffset = numberOf(t[i + 1]!, at)
        i += 2
      } else if (w === 'first-wall' && i + 1 < t.length) {
        room.firstWall = t[i + 1]!
        i += 2
      } else if (w === 'tenure' && i + 1 < t.length) {
        if (!TENURES.includes(t[i + 1]!)) this.stop('rooms/syntax', at, `line ${at}: '${t[i + 1]}' is not a tenure Grid knows. Use one of: ${TENURES.join(', ')}.`)
        room.tenure = t[i + 1] as RoomTenure
        i += 2
      } else if (w === 'outdoor' && i + 1 < t.length && (OUTDOOR_KINDS as readonly string[]).includes(t[i + 1]!)) {
        room.outdoor = t[i + 1] as OutdoorKind
        i += 2
      } else if ((w === 'roofed' || w === 'unroofed') && room.outdoor !== null) {
        room.roofed = w === 'roofed'
        i++
      } else if (w === 'type' && i + 1 < t.length) {
        room.roomType = t[i + 1]!
        i += 2
      } else if (w === 'through' && i + 1 < t.length) {
        if (ctx !== null) this.stop('rooms/syntax', at, `line ${at}: 'through <floor>' is written on a room line of its own, not inside a unit.`)
        room.through = t[i + 1]!
        i += 2
      } else if ((w === 'walls' || w === 'wall') && i + 1 < t.length) {
        const T = numberOf(t[i + 1]!, at)
        this.statedT.add(T)
        let kind: WallKind | null = null
        i += 2
        if (i < t.length && KINDS.includes(t[i] as WallKind)) {
          kind = t[i] as WallKind
          i++
        }
        if (w === 'walls') {
          room.wallsT = T
          room.wallsKind = kind
        } else {
          place.wallT = T
          place.wallKind = kind
        }
      } else {
        this.stop(
          'rooms/syntax',
          at,
          `line ${at}: '${w}' is not understood on a room line. After the use, write a size ('3.0 x 4.4' = east-west by north-south, inside faces; add 'centre' or 'outside' to measure to the walls' centre lines or outside faces) or 'polygon x,y x,y ...', then where it goes: 'at x,y', '<north|south|east|west> of <room>' with optional 'align', 'shift', 'until', 'open', or 'inside <room> corner <ne|nw|se|sw>'. 'walls <t> [kind]' sets this room's own wall thickness; 'through <floor>' stands it on every floor after this one up to that floor; 'tenure <private|shared|common|commercial>' and 'type "<text>"' say who it is for and the firm's own room type; 'outdoor <${OUTDOOR_KINDS.join('|')}>', then 'roofed' or 'unroofed', marks it as outdoor space.`
        )
      }
    }
    if (poly !== null) {
      let origin: P = place.at ?? [0, 0]
      let pts = poly
      if (mx) pts = pts.map((p) => [-p[0], p[1]] as P)
      if (my) pts = pts.map((p) => [p[0], -p[1]] as P)
      if (ctx !== null && place.at) origin = [mx ? -origin[0] : origin[0], my ? -origin[1] : origin[1]]
      room.poly = cleanPoly(pts.map((p) => [p[0] + origin[0], p[1] + origin[1]] as P))
      room.box = boxOf([room.poly])
      this.side(at, id, 'width', room.box[2] - room.box[0], 'polygon')
      this.side(at, id, 'depth', room.box[3] - room.box[1], 'polygon')
      return room
    }
    if (W === null || D === null) this.stop('rooms/size', at, `line ${at}: room '${id}' has no size. Write '<width> x <depth>' (metres, or with a unit such as 12ft), inside faces, or 'polygon ...'.`)
    let Wn = W === '*' ? null : numberOf(W, at)
    let Dn = D === '*' ? null : numberOf(D, at)
    for (const [label, word, v] of [['width', W, Wn], ['depth', D, Dn]] as const) {
      if (v !== null && v <= 0) this.stop('rooms/size', at, `line ${at}: room '${id}' has a ${label} of ${v}. Sizes are above 0.`)
      // WRT-22: a length written with its unit is taken as meant; a bare one past a building's is asked about.
      if (v === null || hasUnit(word)) continue
      if (v > limit('roomsSideBare')) {
        this.stop('rooms/size', at, english(said('rooms.size.bare', { line: String(at), room: id, length: metres(v), side: said(`rooms.size.${label}`), limit: metres(limit('roomsSideBare')) })))
      }
      this.side(at, id, label, v, 'bare')
    }
    const used = basis ?? this.sizes.basis
    room.size = { w: Wn, d: Dn, basis: used }
    if (used !== 'inside') {
      // The size runs to the walls' centre lines or outside faces: take off the walls round it.
      const share = used === 'centre' ? 0.5 : 1
      const side = (s: string): number => (this.assumed.get(`${fl.id}|${id}|${s}`) ?? (room.wallsT ?? this.rule.outside)) * share
      if (Wn !== null) Wn -= side('west') + side('east')
      if (Dn !== null) Dn -= side('south') + side('north')
      if ((Wn !== null && Wn <= 0) || (Dn !== null && Dn <= 0)) {
        this.stop('rooms/size', at, `line ${at}: room '${id}' measured to the walls' ${used === 'centre' ? 'centre lines' : 'outside faces'} leaves nothing inside them. Write a bigger size, or its inside size.`)
      }
    }
    if (place.inside !== undefined) return this.placeInside(room, Wn, Dn, place, at, ctx)
    let box: Box
    if (place.at) {
      if (Wn === null || Dn === null) this.stop('rooms/size', at, `line ${at}: '*' needs a room to stretch to. With 'at', give both sizes.`)
      let [x0, y0] = place.at
      if (ctx !== null) {
        if (mx) x0 = -x0 - Wn
        if (my) y0 = -y0 - Dn
      }
      box = [x0, y0, x0 + Wn, y0 + Dn]
    } else if (place.dir !== undefined) {
      const { box: rbox, rooms: rrooms } = this.lookup(place.ref!, at, ctx)
      let gap: number
      if (place.open) {
        if (rrooms.length !== 1) this.stop('rooms/syntax', at, `line ${at}: 'open' needs one room to be open to, and '${place.ref}' is a unit.`)
        this.floor().open.add(pairKey(id, rrooms[0]!.id))
        gap = 0
      } else {
        gap = this.gapBetween(room, rrooms)
      }
      const ubox = place.until !== undefined ? this.lookup(place.until, at, ctx).box : null
      if ((Wn === null || Dn === null) && ubox === null) this.stop('rooms/size', at, `line ${at}: '*' means 'stretch this side'. Say how far with 'until <room>'.`)
      box = this.relBox(Wn, Dn, place.dir, rbox, gap, place.align ?? null, place.shift ?? 0, ubox, at)
    } else {
      const pool = ctx !== null ? ctx.local : fl.rooms
      if (pool.size > 0) {
        this.stop('rooms/syntax', at, `line ${at}: room '${id}' does not say where it goes. Write 'at x,y' or, better, '<north|south|east|west> of <room>'. Only the first room may leave it out (it starts at 0,0).`)
      }
      if (Wn === null || Dn === null) this.stop('rooms/size', at, `line ${at}: '*' needs a room to stretch to.`)
      box = [0, 0, Wn, Dn]
    }
    if (box[2] - box[0] <= eps() || box[3] - box[1] <= eps()) {
      this.stop('rooms/size', at, `line ${at}: room '${id}' comes out with no size (${f2(box[2] - box[0])} x ${f2(box[3] - box[1])}). Check 'until': the room it stretches to must lie beyond this one.`)
    }
    room.box = box
    room.poly = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]
    if (W === '*') this.side(at, id, 'width', box[2] - box[0], 'stretched')
    if (D === '*') this.side(at, id, 'depth', box[3] - box[1], 'stretched')
    return room
  }

  /** WRT-22: keeps a room side to ask about, the longest when a line is placed more than once. */
  private side(line: number, room: string, side: 'width' | 'depth', length: number, how: 'bare' | 'stretched' | 'polygon'): void {
    const key = `${line}|${room}|${side}`
    const before = this.sides.get(key)
    if (before === undefined || length > before.length) this.sides.set(key, { line, room, side, length, how })
  }

  /**
   * WRT-22: a room side with no unit longer than a building of the plan's kind has is asked
   * about, never refused: it is drawn as metres, and the answer says how to say it is meant.
   */
  private askSizes(plan: WrittenPlan): void {
    const kind = buildingKind(plan)
    const longest = limit('roomsSideAsked', kind)
    const where = kind === 'home' ? said('issue.part.inHome') : kind === 'hall' ? said('issue.part.inHall') : ''
    for (const s of this.sides.values()) {
      if (!(s.length > longest + tolerance('joint'))) continue
      const values = { line: String(s.line), room: s.room, length: metres(s.length), side: said(`rooms.size.${s.side}`), limit: metres(longest), kind: where }
      this.warn('rooms/size-question', s.line, english(said(`rooms.size.question.${s.how}`, values)))
    }
  }

  private relBox(W: number | null, D: number | null, d: string, rb: Box, gap: number, alignIn: string | null, shift: number, ub: Box | null, at: number): Box {
    const horiz = d === 'east' || d === 'west'
    const align = alignIn ?? (horiz ? 'south' : 'west')
    const ok = horiz ? ['south', 'north', 'centre', 'center'] : ['west', 'east', 'centre', 'center']
    if (!ok.includes(align)) this.stop('rooms/syntax', at, `line ${at}: a room placed ${d} of another lines up by 'align ${ok[0]}', 'align ${ok[1]}' or 'align centre', not '${align}'.`)
    const need = (v: Box | null): Box => v ?? this.stop('rooms/size', at, `line ${at}: '*' means 'stretch this side'. Say how far with 'until <room>'.`)
    let x0: number, x1: number, y0: number, y1: number
    if (horiz) {
      if (d === 'east') {
        x0 = rb[2] + gap
        x1 = W !== null ? x0 + W : need(ub)[2]
      } else {
        x1 = rb[0] - gap
        x0 = W !== null ? x1 - W : need(ub)[0]
      }
      if (align === 'south') {
        y0 = rb[1]
        y1 = D !== null ? y0 + D : need(ub)[3]
      } else if (align === 'north') {
        y1 = rb[3]
        y0 = D !== null ? y1 - D : need(ub)[1]
      } else {
        if (D === null) this.stop('rooms/syntax', at, `line ${at}: 'align centre' cannot be combined with '*'.`)
        y0 = (rb[1] + rb[3]) / 2 - D / 2
        y1 = y0 + D
      }
      y0 += shift
      y1 += shift
    } else {
      if (d === 'north') {
        y0 = rb[3] + gap
        y1 = D !== null ? y0 + D : need(ub)[3]
      } else {
        y1 = rb[1] - gap
        y0 = D !== null ? y1 - D : need(ub)[1]
      }
      if (align === 'west') {
        x0 = rb[0]
        x1 = W !== null ? x0 + W : need(ub)[2]
      } else if (align === 'east') {
        x1 = rb[2]
        x0 = W !== null ? x1 - W : need(ub)[0]
      } else {
        if (W === null) this.stop('rooms/syntax', at, `line ${at}: 'align centre' cannot be combined with '*'.`)
        x0 = (rb[0] + rb[2]) / 2 - W / 2
        x1 = x0 + W
      }
      x0 += shift
      x1 += shift
    }
    return [x0, y0, x1, y1]
  }

  private placeInside(
    room: RoomDraft,
    W: number | null,
    D: number | null,
    place: { inside?: string; corner?: string; wallT?: number; wallKind?: WallKind | null },
    at: number,
    ctx: PlaceCtx | null
  ): RoomDraft {
    if (W === null || D === null) this.stop('rooms/size', at, `line ${at}: a room inside another needs both sizes.`)
    const { rooms: hosts } = this.lookup(place.inside!, at, ctx)
    if (hosts.length !== 1) this.stop('rooms/syntax', at, `line ${at}: 'inside' needs one room, and '${place.inside}' is a unit.`)
    const host = hosts[0]!
    const c = place.corner!
    if (!Object.hasOwn(DIAG, c)) this.stop('rooms/syntax', at, `line ${at}: the corner is one of ne, nw, se, sw, not '${c}'.`)
    const hb = host.box
    const T = place.wallT ?? room.wallsT ?? this.rule.inside
    const cx = c.includes('e') ? hb[2] : hb[0]
    const cy = c.includes('n') ? hb[3] : hb[1]
    const sx = c.includes('e') ? -1 : 1
    const sy = c.includes('n') ? -1 : 1
    const box: Box = [Math.min(cx, cx + sx * W), Math.min(cy, cy + sy * D), Math.max(cx, cx + sx * W), Math.max(cy, cy + sy * D)]
    const k = host.poly.findIndex((p) => Math.abs(p[0] - cx) < eps() && Math.abs(p[1] - cy) < eps())
    if (k < 0) this.stop('rooms/inside-corner', at, `line ${at}: room '${host.id}' has no square corner at its ${c} to put '${room.id}' in (another room may already be there).`)
    const n = host.poly.length
    const A = host.poly[(k - 1 + n) % n]!
    const C = host.poly[k]!
    const B = host.poly[(k + 1) % n]!
    const dA = unit(sub(A, C))
    const dB = unit(sub(B, C))
    const la = Math.abs(dA[0]) > 0.5 ? W + T : D + T
    const lb = Math.abs(dB[0]) > 0.5 ? W + T : D + T
    if (la >= norm(sub(A, C)) - eps() || lb >= norm(sub(B, C)) - eps()) {
      this.stop(
        'rooms/inside-corner',
        at,
        `line ${at}: '${room.id}' (${f2(W)} x ${f2(D)} plus a ${f2(T)} wall) does not fit in the ${c} corner of '${host.id}', whose sides there are ${f2(norm(sub(A, C)))} and ${f2(norm(sub(B, C)))} m.`
      )
    }
    const Ca = add(C, mul(dA, la))
    const Cb = add(C, mul(dB, lb))
    const Q = add(Ca, mul(dB, lb))
    host.poly = cleanPoly([...host.poly.slice(0, k), Ca, Q, Cb, ...host.poly.slice(k + 1)])
    room.box = box
    room.poly = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]
    const kind = place.wallKind ?? room.wallsKind
    if (kind) this.floor().between.set(pairKey(room.id, host.id), { t: T, kind, height: null, id: null, reversed: false, line: at })
    return room
  }

  private addRoom(room: RoomDraft, ctx: PlaceCtx | null): void {
    const pool = ctx !== null ? ctx.local : this.floor().rooms
    if (pool.has(room.id) || this.floor().rooms.has(room.id)) {
      this.stop('rooms/duplicate-id', room.line, `line ${room.line}: the id '${room.id}' is used twice on floor '${this.floor().id}'. Every room needs its own id.`)
    }
    pool.set(room.id, room)
  }

  // ------------------------------------------------------------------------------------------
  // What the text says about a wall

  private wallSay(words: string[], at: number, allowVirtual: boolean): WallSay {
    const say: WallSay = { t: null, kind: null, height: null, id: null, reversed: false, line: at }
    let i = 0
    while (i < words.length) {
      const w = words[i]!
      if (KINDS.includes(w as WallKind) || (allowVirtual && w === 'virtual')) {
        say.kind = w as WallKind | 'virtual'
        i++
      } else if (w === 'height' && i + 1 < words.length) {
        say.height = numberOf(words[i + 1]!, at)
        i += 2
      } else if (w === 'id' && i + 1 < words.length) {
        say.id = words[i + 1]!
        i += 2
      } else if (w === 'reversed') {
        say.reversed = true
        i++
      } else if (isNumberWord(w)) {
        say.t = numberOf(w, at)
        this.statedT.add(say.t)
        i++
      } else {
        this.stop('rooms/syntax', at, `line ${at}: '${w}' is not understood on a wall line. Known: a thickness, ${KINDS.join(', ')}${allowVirtual ? ', virtual' : ''}, height <m>, id <id>, reversed.`)
      }
    }
    return say
  }

  private stWall(t: string[], at: number): void {
    const fl = this.floor()
    if (t.length >= 4 && t[1] === 'between' && t[3] === 'and') {
      // 'wall between a and b east': the wall on a's east side, where a and b share more than one.
      const side = t[5] !== undefined && Object.hasOwn(COMPASS, t[5]) ? t[5] : null
      const say = this.wallSay(t.slice(side === null ? 5 : 6), at, true)
      if (side !== null) fl.betweenSide.set(`${pairKey(t[2]!, t[4]!)}\u0000${t[2]}\u0000${side}`, say)
      else fl.between.set(pairKey(t[2]!, t[4]!), say)
      if (say.kind === 'virtual') fl.open.add(pairKey(t[2]!, t[4]!))
    } else if (t.length >= 3 && Object.hasOwn(COMPASS, t[2]!)) {
      fl.extover.push({ room: t[1]!, side: t[2]!, say: this.wallSay(t.slice(3), at, false) })
    } else {
      this.stop(
        'rooms/syntax',
        at,
        `line ${at}: write 'wall between <room> and <room> [<thickness>] [interior|partition|virtual]' or 'wall <room> <north|south|east|west> [<thickness>] [exterior|interior]' for an outside wall; either may add 'height <m>', 'id <id>' or 'reversed'.`
      )
    }
  }

  // ------------------------------------------------------------------------------------------
  // Units

  private expand(name: string, label: string, params: Map<string, string>, mx: boolean, my: boolean, at: number): Array<{ line: number; words: string[] }> {
    const unitDef = this.units.get(name)
    if (!unitDef) this.stop('rooms/unknown-unit', at, `line ${at}: there is no unit called '${name}'. Units written: ${[...this.units.keys()].join(', ') || 'none'}.`)
    const vals = new Map(unitDef.params)
    for (const k of params.keys()) {
      if (!unitDef.params.has(k)) this.stop('rooms/syntax', at, `line ${at}: unit '${name}' has no setting '${k}'. Its settings: ${[...unitDef.params.keys()].join(', ') || 'none'}.`)
      vals.set(k, params.get(k)!)
    }
    const raw: Array<{ line: number; words: string[] }> = []
    const localIds = new Set<string>()
    const keys = [...vals.keys()].sort((a, b) => b.length - a.length)
    for (const { line, text } of unitDef.body) {
      let filled = text
      for (const k of keys) filled = filled.split(`$${k}`).join(vals.get(k)!)
      if (filled.includes('$')) this.stop('rooms/syntax', line, `line ${line}: '${filled.trim()}' uses a setting the unit does not have.`)
      const words = wordsOf(filled.split('{n}').join(label), line)
      if (words[0] === 'room' && words[1] !== undefined) localIds.add(words[1])
      if (words.length > 0) raw.push({ line, words })
    }
    return raw.map(({ line, words }) => {
      const kw = words[0]!
      const nt = [...words]
      for (let i = 1; i < nt.length; i++) {
        if (kw === 'room' && (i === 2 || i === 3)) continue
        if (localIds.has(nt[i]!) || ((kw === 'door' || kw === 'window' || kw === 'opening') && i === 1)) nt[i] = `${nt[i]}-${label}`
      }
      if (kw === 'room') {
        for (let i = 0; i < nt.length - 2; i++) {
          if (Object.hasOwn(DIRS, nt[i]!) && nt[i + 1] === 'of' && !nt.includes('align')) {
            nt.splice(i + 3, 0, 'align', nt[i] === 'east' || nt[i] === 'west' ? 'south' : 'west')
            break
          }
        }
        const s = nt.indexOf('shift')
        if (s >= 0 && s + 1 < nt.length) {
          const d = nt.find((w, k) => Object.hasOwn(DIRS, w) && nt[k + 1] === 'of')
          if ((mx && (d === 'north' || d === 'south')) || (my && (d === 'east' || d === 'west'))) nt[s + 1] = `-(${nt[s + 1]})`
        }
      }
      for (let i = 1; i < nt.length; i++) {
        if (kw === 'room' && i === 2) continue
        if (mx && Object.hasOwn(MIRROR_X, nt[i]!)) nt[i] = MIRROR_X[nt[i]!]!
        else if (my && Object.hasOwn(MIRROR_Y, nt[i]!)) nt[i] = MIRROR_Y[nt[i]!]!
      }
      return { line, words: nt }
    })
  }

  private placeUnit(name: string, label: string, place: UnitPlace, params: Map<string, string>, mx: boolean, my: boolean, at: number): void {
    const fl = this.floor()
    if (fl.inst.has(label) || fl.rooms.has(label)) this.stop('rooms/duplicate-id', at, `line ${at}: the label '${label}' is already used on this floor.`)
    const ctx: PlaceCtx = { local: new Map(), mx, my }
    const pending: OpeningLine[] = []
    for (const { line, words } of this.expand(name, label, params, mx, my, at)) {
      if (words[0] === 'room') this.addRoom(this.readRoom(words, line, ctx), ctx)
      else if (words[0] === 'door' || words[0] === 'window' || words[0] === 'opening') pending.push({ words, line })
      else if (words[0] === 'wall') this.stWall(words, line)
      else if (words[0] === 'pattern') this.stop('rooms/syntax', line, patternLine(line, true))
      else this.stop('rooms/syntax', line, `line ${line}: a unit may hold room, wall, door, window and opening lines, not '${words[0]}'.`)
    }
    const rooms = [...ctx.local.values()]
    if (rooms.length === 0) this.stop('rooms/syntax', at, `line ${at}: unit '${name}' has no rooms.`)
    const ub = boxOf(rooms.map((r) => [[r.box[0], r.box[1]], [r.box[2], r.box[3]]] as P[]))
    const W = ub[2] - ub[0]
    const D = ub[3] - ub[1]
    let box: Box
    if (place.at) box = [place.at[0], place.at[1], place.at[0] + W, place.at[1] + D]
    else if (place.dir !== undefined) {
      const { box: rbox, rooms: rrooms } = this.lookup(place.ref!, at, null)
      let gap = place.gap
      if (gap === undefined) {
        const ts = [...rooms, ...rrooms].map((r) => r.wallsT).filter((t): t is number => t !== null)
        gap = ts.length > 0 ? Math.max(...ts) : this.rule.inside
      }
      box = this.relBox(W, D, place.dir, rbox, gap, place.align ?? null, place.shift ?? 0, null, at)
    } else {
      if (fl.rooms.size > 0) this.stop('rooms/syntax', at, `line ${at}: say where unit '${label}' goes: 'at x,y' or '<north|south|east|west> of <room or unit>'.`)
      box = [0, 0, W, D]
    }
    const dx = box[0] - ub[0]
    const dy = box[1] - ub[1]
    for (const r of rooms) {
      r.poly = r.poly.map((p) => [p[0] + dx, p[1] + dy] as P)
      r.box = [r.box[0] + dx, r.box[1] + dy, r.box[2] + dx, r.box[3] + dy]
      this.addRoom(r, null)
    }
    fl.inst.set(label, rooms.map((r) => r.id))
    // CNT-4: a placement of a flat type is a flat, mirrored when it is placed mirrored (WRT-4).
    if (this.flatTypes.has(name)) fl.flats.push({ label, unit: name, mirrored: mx !== my, rooms })
    fl.openings.push(...pending)
  }

  private readPlace(t: string[], at: number): { place: UnitPlace; params: Map<string, string>; mx: boolean; my: boolean } {
    const place: UnitPlace = {}
    const params = new Map<string, string>()
    let mx = false
    let my = false
    let i = 0
    while (i < t.length) {
      const w = t[i]!
      if (w === 'at' && i + 1 < t.length) {
        place.at = pointOf(t[i + 1]!, at)
        i += 2
      } else if (Object.hasOwn(DIRS, w) && i + 2 < t.length && t[i + 1] === 'of') {
        place.dir = w
        place.ref = t[i + 2]!
        i += 3
      } else if (w === 'align' && i + 1 < t.length) {
        place.align = t[i + 1]!
        i += 2
      } else if ((w === 'shift' || w === 'gap') && i + 1 < t.length) {
        place[w] = numberOf(t[i + 1]!, at)
        if (w === 'gap') this.statedT.add(place[w]!)
        i += 2
      } else if (w === 'mirror' && i + 1 < t.length) {
        const how = t[i + 1]!
        if (!['x', 'y', 'east-west', 'north-south'].includes(how)) this.stop('rooms/syntax', at, `line ${at}: mirror is 'mirror east-west' (left and right swap) or 'mirror north-south'.`)
        if (how === 'x' || how === 'east-west') mx = true
        else my = true
        i += 2
      } else if (w.includes('=')) {
        const eq = w.indexOf('=')
        params.set(w.slice(0, eq), w.slice(eq + 1))
        i++
      } else {
        this.stop('rooms/syntax', at, `line ${at}: '${w}' is not understood when placing a unit. Known: at x,y; <direction> of <room>; align; shift; gap; mirror east-west|north-south; name=value.`)
      }
    }
    return { place, params, mx, my }
  }

  private stPlace(t: string[], at: number): void {
    if (t.length < 4 || t[2] !== 'as') this.stop('rooms/syntax', at, `line ${at}: write 'place <unit> as <label> <where> [mirror east-west] [name=value]'.`)
    const { place, params, mx, my } = this.readPlace(t.slice(4), at)
    this.placeUnit(t[1]!, t[3]!, place, params, mx, my, at)
  }

  /**
   * One room type placed n times in a row. Written 'of <room>', every placement goes on that
   * side of the one before, the first of the room named (WRT-2). Written without it (WRT-4), the
   * first goes where the rest of the line says and each next one on the given side of the one
   * before. 'first' and 'last' settings hold for the two ends only.
   */
  private stRepeat(t: string[], at: number): void {
    const named = t[4] === 'of' && t[6] === 'as'
    if (t.length < (named ? 8 : 6) || !(named || t[4] === 'as') || !Object.hasOwn(DIRS, t[3]!)) {
      this.stop(
        'rooms/syntax',
        at,
        `line ${at}: write 'repeat <unit> <how many> <north|south|east|west> of <room or unit> as <first label> [...]', or 'repeat <unit> <how many> <north|south|east|west> as <first label> <where the first goes> [...] [first setting=value ...] [last setting=value ...]'.`
      )
    }
    const n = numberOf(t[2]!, at)
    if (!Number.isInteger(n) || n < 1 || n > REPEAT_MAX) this.stop('rooms/syntax', at, `line ${at}: a unit is repeated a whole number of times, from 1 to ${REPEAT_MAX}; '${t[2]}' is not one.`)
    const d = t[3]!
    let ref = named ? t[5]! : null
    const label = named ? t[7]! : t[5]!
    const { words, ends } = this.endSettings(t.slice(named ? 8 : 6), at)
    const { place, params, mx, my } = this.readPlace(words, at)
    if (named && (place.at !== undefined || place.dir !== undefined)) {
      this.stop('rooms/syntax', at, `line ${at}: this repeat already starts ${d} of '${ref}'; say where the first goes only in the form without 'of': 'repeat <unit> <n> ${d} as ${label} at x,y'.`)
    }
    for (let k = 0; k < n; k++) {
      const lab = /^\d+$/.test(label) ? String(Number(label) + k) : n > 1 ? `${label}${k + 1}` : label
      const settings = new Map(params)
      if (k === 0) for (const [key, value] of ends.first) settings.set(key, value)
      if (k === n - 1) for (const [key, value] of ends.last) settings.set(key, value)
      const where: UnitPlace = named ? { ...place, dir: d, ref: ref! } : k === 0 ? place : { dir: d, ref: ref!, ...(place.gap === undefined ? {} : { gap: place.gap }) }
      this.placeUnit(t[1]!, lab, where, settings, mx, my, at)
      ref = lab
    }
  }

  /** The words of a repeat line before 'first' and 'last', and the settings after each. */
  private endSettings(t: string[], at: number): { words: string[]; ends: { first: Map<string, string>; last: Map<string, string> } } {
    const ends = { first: new Map<string, string>(), last: new Map<string, string>() }
    const words: string[] = []
    let into: Map<string, string> | null = null
    for (const w of t) {
      if (w === 'first' || w === 'last') {
        into = ends[w]
        continue
      }
      if (into === null) {
        words.push(w)
        continue
      }
      const eq = w.indexOf('=')
      if (eq <= 0) this.stop('rooms/syntax', at, `line ${at}: after 'first' or 'last' come settings written name=value, for that end only; found '${w}'. Write where the units go before them.`)
      into.set(w.slice(0, eq), w.slice(eq + 1))
    }
    return { words, ends }
  }

  // ------------------------------------------------------------------------------------------
  // Floors copied, rooms renamed and removed

  private stCopy(t: string[], at: number): void {
    if (t.length < 2) this.stop('rooms/syntax', at, `line ${at}: write 'copy <floor id> [with openings]', on a line of its own or at the end of the floor line.`)
    const src = this.floors.find((f) => f.id === t[1])
    if (!src) this.stop('rooms/unknown-floor', at, `line ${at}: there is no floor '${t[1]}'. Floors so far: ${this.floors.map((f) => f.id).join(', ')}.`)
    const fl = this.floor()
    if (fl === src) this.stop('rooms/syntax', at, `line ${at}: a floor cannot copy itself. Start the new floor with a 'floor' line first.`)
    // A room that rose through to this floor is here already (WRT-4).
    for (const r of src.rooms.values()) if (!(fl.rooms.get(r.id)?.risenFrom === (r.risenFrom ?? src.id))) this.addRoom({ ...r, poly: [...r.poly], through: null, risenFrom: r.risenFrom }, null)
    for (const [k, v] of src.inst) fl.inst.set(k, [...v])
    // CNT-4: the flats placed on the floor copied are flats here too, of the copied rooms.
    for (const flat of src.flats) {
      const rooms = flat.rooms.flatMap((r) => (src.rooms.get(r.id) === r && fl.rooms.has(r.id) ? [fl.rooms.get(r.id)!] : []))
      fl.flats.push({ ...flat, rooms })
    }
    for (const [k, v] of src.between) fl.between.set(k, { ...v })
    for (const [k, v] of src.betweenSide) fl.betweenSide.set(k, { ...v })
    for (const k of src.open) fl.open.add(k)
    fl.extover.push(...src.extover.map((e) => ({ ...e, say: { ...e.say } })))
    const rest = t.slice(2).join(' ')
    if (rest === 'with openings') fl.openings.push(...src.openings)
    else if (rest !== '') this.stop('rooms/syntax', at, `line ${at}: after the floor id only 'with openings' is understood.`)
  }

  private stRename(t: string[], at: number): void {
    const fl = this.floor()
    if (t.length < 4 || !fl.rooms.has(t[1]!)) this.stop('rooms/syntax', at, `line ${at}: write 'rename <room id> <new id> "<new name>" [use]'. Rooms here: ${[...fl.rooms.keys()].join(', ')}.`)
    const [, old, fresh, name] = t as [string, string, string, string]
    const r = fl.rooms.get(old)!
    const use = t[4]
    if (use === '-') r.use = undefined
    else if (use !== undefined) {
      if (roomUseOf(use) === null) this.stop('rooms/unknown-use', at, `line ${at}: '${use}' is not a room use Grid knows. Use one of: ${USES.join(', ')}; or '-'.`)
      r.use = roomUseOf(use)!
    }
    r.id = fresh
    r.name = name
    fl.rooms = new Map([...fl.rooms].map(([k, v]) => [k === old ? fresh : k, v]))
    const swap = (key: string): string => key.split('\u0000').map((x) => (x === old ? fresh : x)).reduce((a, b) => pairKey(a, b))
    fl.between = new Map([...fl.between].map(([k, v]) => [swap(k), v]))
    fl.betweenSide = new Map(
      [...fl.betweenSide].map(([k, v]) => {
        const [a, b, room, side] = k.split('\u0000') as [string, string, string, string]
        return [`${swap(pairKey(a, b))}\u0000${room === old ? fresh : room}\u0000${side}`, v]
      })
    )
    fl.open = new Set([...fl.open].map(swap))
    fl.extover = fl.extover.map((e) => ({ ...e, room: e.room === old ? fresh : e.room }))
    fl.openings = fl.openings.map((o) => ({ ...o, words: o.words.map((w, i) => (w === old && i > 1 ? fresh : w)) }))
  }

  private stRemove(t: string[], at: number): void {
    const fl = this.floor()
    if (t.length < 2) this.stop('rooms/syntax', at, `line ${at}: write 'remove <room id or opening id>'.`)
    if (fl.rooms.delete(t[1]!)) return
    const before = fl.openings.length
    fl.openings = fl.openings.filter((o) => o.words[1] !== t[1])
    if (fl.openings.length === before) this.stop('rooms/unknown-room', at, `line ${at}: nothing called '${t[1]}' on floor '${fl.id}' to remove.`)
  }

  // ------------------------------------------------------------------------------------------
  // Walls worked out

  private derive(fl: FloorDraft): { edges: Edge[]; raws: RawWall[] } {
    const rooms = [...fl.rooms.values()]
    const order = new Map(rooms.map((r, i) => [r.id, i]))
    const edges: Edge[] = []
    for (const r of rooms) {
      for (let i = 0; i < r.poly.length; i++) {
        const p = r.poly[i]!
        const q = r.poly[(i + 1) % r.poly.length]!
        const u = unit(sub(q, p))
        edges.push({ room: r, i, p, q, u, n: [u[1], -u[0]], L: norm(sub(q, p)), cands: [], cover: [], idx: edges.length })
      }
    }
    this.checkOverlaps(rooms)
    const maxT = tolerance('roomsWallWidest')
    for (const e of edges) {
      for (const f of edges) {
        if (e.room === f.room) continue
        if (Math.abs(cross(e.u, f.u)) > tolerance('parallel') || dot(e.u, f.u) > 0) continue
        const d = dot(sub(f.p, e.p), e.n)
        if (d < -eps() || d > FACING_REACH) continue
        const sa = dot(sub(f.q, e.p), e.u)
        const sb = dot(sub(f.p, e.p), e.u)
        const s0 = Math.max(0, Math.min(sa, sb))
        const s1 = Math.min(e.L, Math.max(sa, sb))
        if (s1 - s0 > eps()) e.cands.push({ s0, s1, d: Math.max(d, 0), f })
      }
    }
    let junc = this.rule.outside
    const thicknessStated = (t: number): boolean =>
      [this.rule.inside, this.rule.outside, ...this.statedT, ...[...this.tkinds.keys()].map((k) => k / 1000)].some((s) => Math.abs(s - t) <= tolerance('diffLength'))
    const reported = new Set<string>()
    for (const e of edges) {
      const taken: Array<[number, number]> = []
      // A stretch no wider than a wall, crossed by the two faces of a wall between other rooms
      // (two rooms stacked between two others, or a room cut out of a corner of the next), is
      // that wall seen end on: the rooms beyond it leave no gap (WRT-10).
      const walled = (x: number, y: number, reach: number): boolean => {
        if (y - x > maxT + eps()) return false
        const span = (g: Edge): [number, number] => {
          const a = dot(sub(g.p, e.p), e.n)
          const b = dot(sub(g.q, e.p), e.n)
          return [Math.max(Math.min(a, b), 0), Math.min(Math.max(a, b), reach)]
        }
        const face = (at: number, side: number): Array<[number, number]> =>
          edges
            .filter((g) => Math.abs(dot(g.n, e.u) - side) <= tolerance('parallel') && Math.abs(dot(sub(g.p, e.p), e.u) - at) <= eps())
            .map(span)
            .filter(([a, b]) => b - a > eps())
        const below = face(x, 1)
        return face(y, -1).some(([a, b]) => below.some(([c, d]) => Math.min(b, d) - Math.max(a, c) > eps()))
      }
      for (const c of [...e.cands].sort((a, b) => a.d - b.d)) {
        let parts: Array<[number, number]> = [[c.s0, c.s1]]
        for (const [a, b] of taken) {
          const next: Array<[number, number]> = []
          for (const [x, y] of parts) {
            if (b <= x + eps() || a >= y - eps()) next.push([x, y])
            else {
              if (a > x + eps()) next.push([x, a])
              if (b < y - eps()) next.push([b, y])
            }
          }
          parts = next
        }
        for (const [x, y] of parts) {
          if (y - x <= eps()) continue
          if (c.d <= maxT + eps()) {
            e.cover.push({ s0: x, s1: y, d: c.d, f: c.f })
            // WRT-17: a wall the text states may be seen end on across an outside face; a wall
            // only as thick as an odd gap between two rooms does not make every such stretch one.
            if (thicknessStated(c.d)) junc = Math.max(junc, c.d)
          } else if (c.d < 2 * this.rule.outside + maxT && !walled(x, y, c.d)) {
            const key = pairKey(e.room.id, c.f.room.id)
            if (!reported.has(key)) {
              reported.add(key)
              const [a, b] = (order.get(e.room.id)! < order.get(c.f.room.id)! ? [e.room, c.f.room] : [c.f.room, e.room]) as [RoomDraft, RoomDraft]
              this.problem(
                'rooms/gap',
                b.line,
                `Rooms '${a.id}' (line ${a.line}) and '${b.id}' (line ${b.line}) leave a gap of ${f2(c.d)} m between them, along ${f2(y - x)} m: wider than one wall (walls here are up to ${maxT} m) and too narrow for an outside wall on each. If it is one wall, close the gap to its thickness; if it is a duct or a cupboard, write it as a room.`
              )
            }
          }
          taken.push([x, y])
        }
      }
      e.cover.sort((a, b) => a.s0 - b.s0)
    }
    for (const x of fl.extover) if (x.say.t !== null) junc = Math.max(junc, x.say.t)
    junc += eps()

    // A floor's stated height is the height of its walls (LVL-1), so they state none of their own:
    // the reading gives it to them, and the file says it once, on the floor (WRT-6).
    const height = fl.height !== null ? null : this.rule.height
    const raws: RawWall[] = []
    const pt = (e: Edge, s: number, off: number): P => [e.p[0] + e.u[0] * s + e.n[0] * off, e.p[1] + e.u[1] * s + e.n[1] * off]
    for (const e of edges) {
      const A = e.room
      for (const c of e.cover) {
        const B = c.f.room
        if (order.get(A.id)! > order.get(B.id)!) continue
        const key = pairKey(A.id, B.id)
        let d = c.d
        const spec =
          fl.betweenSide.get(`${key}\u0000${A.id}\u0000${compassOf(e.n)}`) ??
          fl.betweenSide.get(`${key}\u0000${B.id}\u0000${compassOf(c.f.n)}`) ??
          fl.between.get(key)
        let kind: WallKind =
          (spec && spec.kind !== null && spec.kind !== 'virtual' ? spec.kind : null) ??
          // LVL-12: the wall between a room and outdoor space is an outside wall.
          (facesOutdoor(A, B) ? 'exterior' : null) ??
          this.tkinds.get(Math.round(d * 1000)) ??
          A.wallsKind ??
          B.wallsKind ??
          this.rule.kind
        let virtual = false
        if (d < tolerance('roomsTouch')) {
          if (fl.open.has(key)) {
            virtual = true
            d = 0
            kind = 'interior'
          } else {
            this.problem(
              'rooms/touching',
              B.line,
              `Rooms '${A.id}' (line ${A.line}) and '${B.id}' (line ${B.line}) touch along ${f2(c.s1 - c.s0)} m with no wall between them (the gap is ${(d * 1000).toFixed(0)} mm). If the space is open-plan, add 'open' to the room line or write 'wall between ${A.id} and ${B.id} virtual'. If there is a wall, leave its thickness between the rooms.`
            )
            continue
          }
        } else if (fl.open.has(key) && !(spec && spec.kind === 'virtual')) {
          this.problem('rooms/open-apart', B.line, `'${A.id}' is marked open to '${B.id}', but the rooms are ${f2(d)} m apart. Rooms open to each other touch.`)
          continue
        } else if (spec && spec.kind === 'virtual') {
          virtual = true
          kind = 'interior'
        }
        if (spec && spec.t !== null && !virtual && Math.abs(spec.t - d) > tolerance('diffLength')) {
          this.warn(
            'rooms/wall-thickness',
            spec.line,
            `Line ${spec.line} says the wall between '${A.id}' and '${B.id}' is ${f2(spec.t)} m, but the rooms as placed leave ${f2(d)} m. The plan uses ${f2(d)}. Write the wall line before the rooms it separates, or move a room.`
          )
        }
        // WRT-17: the wall takes the gap the rooms leave; a gap no line states is said, once a pair.
        if (!virtual && !(spec && spec.t !== null) && !this.fromGap.has(key)) {
          if (!thicknessStated(d)) {
            this.fromGap.add(key)
            this.warn(
              'rooms/wall-from-gap',
              B.line,
              english(said('rooms.wallFromGap', { a: A.id, aLine: String(A.line), b: B.id, bLine: String(B.line), thickness: f2(d), inside: f2(this.rule.inside), outside: f2(this.rule.outside) }))
            )
          }
        }
        const off = c.d / 2
        const f = c.f
        const a = pt(e, c.s0, off)
        const b = pt(e, c.s1, off)
        const fs = [dot(sub(a, f.p), f.u), dot(sub(b, f.p), f.u)].sort((x, y) => x - y) as [number, number]
        raws.push({
          a,
          b,
          t: virtual ? (spec?.t ?? 0) : d,
          kind,
          virtual,
          height: virtual ? (spec?.height ?? 0) : (spec?.height ?? height),
          wantId: spec?.id ?? null,
          reversed: spec?.reversed ?? false,
          rooms: [A, B],
          sides: [[e.idx, c.s0, c.s1], [f.idx, fs[0], fs[1]]],
          ext: false,
          handles: [`wall between ${A.id} and ${B.id}`],
        })
      }
      // What no room faces is outside.
      let cur = 0
      const gaps: Array<[number, number]> = []
      for (const c of e.cover) {
        if (c.s0 - cur > eps()) gaps.push([cur, c.s0])
        cur = Math.max(cur, c.s1)
      }
      if (e.L - cur > eps()) gaps.push([cur, e.L])
      let T = this.rule.outside
      let kind: WallKind = 'exterior'
      let say: WallSay | null = null
      for (const x of fl.extover) {
        if (x.room === A.id && dot(e.n, COMPASS[x.side]!) > 0.9) {
          T = x.say.t ?? T
          kind = x.say.kind !== null && x.say.kind !== 'virtual' ? x.say.kind : kind
          say = x.say
        }
      }
      for (const [a0, b0] of gaps) {
        const whole = a0 < eps() && b0 > e.L - eps()
        if (b0 - a0 <= junc && !whole) continue // the end of a wall that meets this face
        raws.push({
          a: pt(e, a0, T / 2),
          b: pt(e, b0, T / 2),
          t: T,
          kind,
          virtual: false,
          height: say?.height ?? height,
          wantId: say?.id ?? null,
          reversed: say?.reversed ?? false,
          rooms: [A],
          sides: [[e.idx, a0, b0]],
          ext: true,
          handles: [`wall ${A.id} ${compassOf(e.n)}`],
        })
      }
    }
    // Two rooms that share walls on more than one line: each handle names the first room's side.
    const perPair = new Map<string, number>()
    for (const r of raws) if (r.rooms.length === 2) perPair.set(pairKey(r.rooms[0]!.id, r.rooms[1]!.id), (perPair.get(pairKey(r.rooms[0]!.id, r.rooms[1]!.id)) ?? 0) + 1)
    for (const r of raws) {
      if (r.rooms.length !== 2 || (perPair.get(pairKey(r.rooms[0]!.id, r.rooms[1]!.id)) ?? 0) < 2) continue
      r.handles = [`wall between ${r.rooms[0]!.id} and ${r.rooms[1]!.id} ${compassOf(edges[r.sides[0]![0]]!.n)}`]
    }
    this.checkSteps(edges)
    this.sideThicknesses(fl, edges, raws)
    return { edges, raws }
  }

  /** What each side of a room sized to centre lines or outside faces turned out to have. */
  private sideThicknesses(fl: FloorDraft, edges: Edge[], raws: RawWall[]): void {
    for (const e of edges) {
      const room = e.room
      if (room.size === null || room.size.basis === 'inside' || room.poly.length !== 4) continue
      const along = new Map<number, number>()
      for (const r of raws) {
        for (const [idx, s0, s1] of r.sides) if (idx === e.idx) along.set(r.t, (along.get(r.t) ?? 0) + (s1 - s0))
      }
      let best = this.rule.outside
      let most = -1
      for (const [t, len] of along) if (len > most + eps()) [best, most] = [t, len]
      this.found.set(`${fl.id}|${room.id}|${compassOf(e.n, DIRS)}`, best)
    }
  }

  private checkOverlaps(rooms: RoomDraft[]): void {
    for (let i = 0; i < rooms.length; i++) {
      for (const b of rooms.slice(i + 1)) {
        const a = rooms[i]!
        const ab = boxOf([a.poly])
        const bb = boxOf([b.poly])
        const ox = Math.min(ab[2], bb[2]) - Math.max(ab[0], bb[0])
        const oy = Math.min(ab[3], bb[3]) - Math.max(ab[1], bb[1])
        if (ox <= eps() || oy <= eps()) continue
        let hit = false
        for (const [poly, other] of [[a.poly, b.poly], [b.poly, a.poly]] as const) {
          for (let k = 0; k < poly.length; k++) {
            const p = poly[k]!
            const q = poly[(k + 1) % poly.length]!
            const m: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
            const u = unit(sub(q, p))
            const k5 = probe()
            const inner: P = [m[0] - u[1] * k5, m[1] + u[0] * k5]
            const corner: P = [p[0] - u[1] * k5 + u[0] * k5, p[1] + u[0] * k5 + u[1] * k5]
            if (contains(other, inner) || contains(other, corner)) hit = true
          }
        }
        if (!hit) {
          const c: P = [a.poly.reduce((s, p) => s + p[0], 0) / a.poly.length, a.poly.reduce((s, p) => s + p[1], 0) / a.poly.length]
          hit = contains(b.poly, c) && contains(a.poly, c)
        }
        if (hit) {
          const fix = ox <= oy ? `move '${b.id}' ${f2(ox)} m east or west` : `move '${b.id}' ${f2(oy)} m north or south`
          this.problem(
            'rooms/overlap',
            b.line,
            `Rooms '${a.id}' (line ${a.line}) and '${b.id}' (line ${b.line}) overlap: they share an area about ${f2(ox)} m east-west by ${f2(oy)} m north-south. To clear it, ${fix}, or make one of them smaller by that much plus the wall between them. If '${b.id}' is meant to sit in a corner of '${a.id}', write 'inside ${a.id} corner <ne|nw|se|sw>'.`
          )
        }
      }
    }
  }

  private checkSteps(edges: Edge[]): void {
    const seen = new Set<string>()
    const maxT = tolerance('roomsWallWidest')
    for (const e of edges) {
      for (const f of edges) {
        if (e.room === f.room || e.idx >= f.idx) continue
        if (Math.abs(cross(e.u, f.u)) > tolerance('parallel') || dot(e.u, f.u) < 0) continue
        const d = Math.abs(dot(sub(f.p, e.p), e.n))
        if (d < tolerance('roomsFaceStep') || d > STEP_REACH) continue
        const [sa, sb] = [dot(sub(f.p, e.p), e.u), dot(sub(f.q, e.p), e.u)].sort((x, y) => x - y) as [number, number]
        const gap = Math.max(sa - e.L, 0 - sb)
        if (gap > maxT || gap < -eps()) continue
        const key = `${e.room.id}|${f.room.id}|${d.toFixed(4)}`
        if (seen.has(key)) continue
        seen.add(key)
        this.warn(
          'rooms/out-of-line',
          f.room.line,
          `The faces of '${e.room.id}' and '${f.room.id}' that run side by side are ${(d * 100).toFixed(1)} cm out of line. If the wall should be straight there, the sizes do not add up by that much: change one size, or use '*' with 'until <room>' so the room stretches to line up. If the step is meant, leave it.`
        )
      }
    }
  }

  private buildWalls(fl: FloorDraft, edges: Edge[], raws: RawWall[], prefix: string): DerivedWall[] {
    const maxT = tolerance('roomsWallWidest')
    const groups = new Map<string, RawWall[]>()
    for (const r of raws) {
      let d = unit(sub(r.b, r.a))
      if (d[0] < -tolerance('noLength') || (Math.abs(d[0]) < tolerance('noLength') && d[1] < 0)) d = [-d[0], -d[1]]
      r.d = d
      const off = cross(d, r.a)
      const key = [Math.atan2(d[1], d[0]).toFixed(6), off.toFixed(4), r.t.toFixed(4), r.kind, r.virtual, r.height === null ? '-' : r.height.toFixed(4)].join('|')
      const list = groups.get(key)
      if (list) list.push(r)
      else groups.set(key, [r])
    }
    // WRT-17: a gap between two stretches on one line is the end of a wall seen end on only where
    // the bodies of walls crossing the line cover it. Open floor between them (two lifts in the
    // corners of one lobby) keeps them two walls, so neither closes the floor off.
    const covered = (d: P, off: number, from: number, to: number): boolean => {
      const spans: Array<[number, number]> = []
      for (const o of raws) {
        if (o.virtual || Math.abs(cross(o.d!, d)) < tolerance('nearlyParallel')) continue
        const base: P = mul([-d[1], d[0]], off)
        const x = intersectLines(base, d, o.a, o.d!)
        if (x === null) continue
        const so = dot(sub(x, o.a), o.d!)
        const len = dot(sub(o.b, o.a), o.d!)
        if (so < Math.min(0, len) - maxT - eps() || so > Math.max(0, len) + maxT + eps()) continue
        const at = dot(x, d)
        const half = o.t / 2 / Math.abs(cross(o.d!, d))
        spans.push([at - half, at + half])
      }
      spans.sort((p, q) => p[0] - q[0])
      let reached = from
      for (const [p, q] of spans) {
        if (p > reached + eps()) break
        reached = Math.max(reached, q)
        if (reached >= to - eps()) return true
      }
      return reached >= to - eps()
    }
    const walls: DerivedWall[] = []
    for (const rs of groups.values()) {
      const d = rs[0]!.d!
      for (const r of rs) {
        const pa = dot(r.a, d)
        const pb = dot(r.b, d)
        r.lo = Math.min(pa, pb)
        r.hi = Math.max(pa, pb)
      }
      rs.sort((a, b) => a.lo! - b.lo!)
      let cur: DerivedWall | null = null
      let curId: string | null = null
      for (const r of rs) {
        // A wall the text names stays apart from a neighbour named otherwise: that is how a
        // plan drawn with its walls cut at the room corners is written again as it was.
        const sameName = curId === null || r.wantId === null || r.wantId === curId
        // Stretches given one id are one wall, however far apart along the line they lie.
        const named = cur !== null && r.wantId !== null && r.wantId === curId
        const joins = cur !== null && r.lo! - cur.hi <= maxT + eps() && (r.lo! - cur.hi <= eps() || covered(d, cross(d, r.a), cur.hi, r.lo!))
        if (cur !== null && ((joins && sameName && !this.split) || named)) {
          cur.hi = Math.max(cur.hi, r.hi!)
          cur.raws.push(r)
          curId = curId ?? r.wantId
        } else {
          curId = r.wantId
          cur = { lo: r.lo!, hi: r.hi!, raws: [r], d, t: r.t, kind: r.kind, virtual: r.virtual, height: r.height, base: rs[0]!.a } as DerivedWall
          walls.push(cur)
        }
      }
    }
    for (const w of walls) {
      const perp = sub(w.base, mul(w.d, dot(w.base, w.d)))
      w.a = add(perp, mul(w.d, w.lo))
      w.b = add(perp, mul(w.d, w.hi))
      for (const r of w.raws) r.wall = w
    }
    // Each end reaches the centre line of the wall it meets.
    const roomsOf = (w: DerivedWall): Set<string> => new Set(w.raws.flatMap((r) => r.rooms.map((room) => room.id)))
    for (const w of walls) {
      const ends: P[] = []
      const mine = roomsOf(w)
      for (const [end, sign] of [[w.a, -1], [w.b, 1]] as const) {
        const ray = mul(w.d, sign)
        let best: { tau: number; x: P; o: DerivedWall; half: number } | null = null
        const met: Array<{ tau: number; x: P; o: DerivedWall; half: number }> = []
        for (const o of walls) {
          if (o === w || Math.abs(cross(o.d, w.d)) < eps()) continue
          const x = intersectLines(end, ray, o.a, o.d)
          if (x === null) continue
          const tau = dot(sub(x, end), ray)
          const so = dot(x, o.d)
          if (tau < -maxT - eps() || tau > maxT + eps() || so < o.lo - maxT - eps() || so > o.hi + maxT + eps()) continue
          const hit = { tau, x, o, half: (o.virtual ? 0 : o.t / 2) / Math.abs(cross(o.d, w.d)) }
          met.push(hit)
        }
        // WRT-17: a wall whose body the end already stands in is the wall it meets, before a
        // nearer centre line past the end: an outside wall ends in the room's corner wall, not
        // across the corner of the room beside it.
        const holds = (h: { tau: number; half: number }): boolean => Math.abs(h.tau) <= h.half + eps()
        for (const hit of met) {
          const better =
            best === null ||
            (holds(hit) && !holds(best)) ||
            (holds(hit) === holds(best) && Math.abs(hit.tau) < Math.abs(best.tau) - tolerance('noLength'))
          if (better) best = hit
        }
        // WRT-17: past the wall it meets, through bodies that touch, to the wall that makes the
        // corner of one of its own rooms: the wall between two rooms of different widths reaches
        // the wider room's corner, so that room's outline closes.
        if (best !== null) {
          const near = roomsOf(best.o)
          let reached = best.tau + best.half
          let far = best
          for (const hit of met.filter((h) => h.tau > best!.tau + eps()).sort((p, q) => p.tau - q.tau)) {
            if (hit.tau - hit.half > reached + eps()) break
            reached = Math.max(reached, hit.tau + hit.half)
            if ([...roomsOf(hit.o)].some((room) => mine.has(room) && !near.has(room))) far = hit
          }
          // Only as far as the check reads a corner as reached: half the thicker wall and `gap`.
          if (far.tau - best.tau > Math.max(w.t, far.o.t) / 2 + tolerance('gap')) best = far
        }
        ends.push(best ? best.x : end)
      }
      w.a2 = ends[0]!
      w.b2 = ends[1]!
    }
    this.closeSides(walls, edges)
    // Outside walls run with their room on the left; inside walls run east or north.
    for (const w of walls) {
      w.ext = w.raws.every((r) => r.rooms.length === 1)
      let a = w.a2
      let b = w.b2
      if (w.ext) {
        const e = edges[w.raws[0]!.sides[0]![0]]!
        if (dot(sub(b, a), e.u) < 0) [a, b] = [b, a]
      }
      if (w.raws.some((r) => r.reversed)) [a, b] = [b, a]
      w.start = a
      w.end = b
    }
    this.nameWalls(walls, edges, prefix)
    for (const w of walls) {
      const fix = this.fix
      const json: WrittenWall = {
        id: w.id,
        start: [fix(w.start[0]), fix(w.start[1])],
        end: [fix(w.end[0]), fix(w.end[1])],
        thickness: fix(w.t),
        ...(w.height !== null ? { height: fix(w.height) } : {}),
        kind: w.kind,
        ...(w.virtual ? { virtual: true } : {}),
        ...(this.explicitFloors ? { floor: fl.id } : {}),
      }
      w.json = json
    }
    return walls
  }

  /**
   * WRT-17: two walls that make one straight side of a room, one after the other, end at one
   * place along it. Each end reaches the centre line of the wall it meets, and where that wall is
   * at an angle (a 45 degree side) two walls of different thicknesses reach it at different
   * places: the thinner one is carried on to the other's end, inside the angled wall's body.
   */
  private closeSides(walls: DerivedWall[], edges: Edge[]): void {
    const maxT = tolerance('roomsWallWidest')
    for (const e of edges) {
      const on: Array<{ w: DerivedWall; s0: number; s1: number }> = []
      for (const w of walls) {
        for (const r of w.raws) for (const [idx, s0, s1] of r.sides) if (idx === e.idx) on.push({ w, s0, s1 })
      }
      if (on.length < 2) continue
      on.sort((p, q) => p.s0 - q.s0)
      const station = (p: P): number => dot(sub(p, e.p), e.u)
      for (let k = 0; k + 1 < on.length; k++) {
        const [A, B] = [on[k]!, on[k + 1]!]
        if (A.w === B.w || B.s0 - A.s1 > maxT + eps()) continue
        const aEnd = station(A.w.a2) >= station(A.w.b2) ? 'a2' : 'b2'
        const bEnd = station(B.w.a2) <= station(B.w.b2) ? 'a2' : 'b2'
        const [sa, sb] = [station(A.w[aEnd]), station(B.w[bEnd])]
        const apart = sb - sa
        if (apart <= eps() || apart > maxT) continue
        if (A.w.t <= B.w.t) A.w[aEnd] = add(A.w[aEnd], mul(e.u, apart))
        else B.w[bEnd] = add(B.w[bEnd], mul(e.u, -apart))
      }
    }
  }

  private nameWalls(walls: DerivedWall[], edges: Edge[], prefix: string): void {
    const names = new Map<string, DerivedWall[]>()
    for (const w of walls) {
      const left: string[] = []
      const right: string[] = []
      for (const r of w.raws) {
        r.rooms.forEach((room, k) => {
          const e = edges[r.sides[k]![0]]!
          const side = cross(w.d, sub(e.p, w.a)) > 0 ? left : right
          if (!side.includes(room.id)) side.push(room.id)
        })
      }
      w.sidesRooms = [left, right]
      let base: string
      if (w.ext) base = `ext-${compassOf(edges[w.raws[0]!.sides[0]![0]]!.n)}`
      else if (w.virtual) base = `open-${[...left, ...right].slice(0, 2).join('-')}`
      else if (left.length === 1 && right.length === 1) base = `w-${left[0]}-${right[0]}`
      else if (left.length === 1 || right.length === 1) {
        const one = left.length === 1 ? left[0]! : right[0]!
        let n: P = [0, 0]
        for (const r of w.raws) r.rooms.forEach((room, k) => {
          if (room.id === one) n = edges[r.sides[k]![0]]!.n
        })
        base = `w-${one}-${compassOf(n)}`
      } else if (Math.abs(w.d[0]) < tolerance('noLength')) base = `w-x${r4(w.a[0])}`
      else if (Math.abs(w.d[1]) < tolerance('noLength')) base = `w-y${r4(w.a[1])}`
      else base = 'w-angled'
      const list = names.get(base)
      if (list) list.push(w)
      else names.set(base, [w])
    }
    for (const [base, ws] of names) {
      if (ws.length === 1) ws[0]!.id = prefix + base
      else {
        ws.sort((p, q) => r4(dot(p.a, p.d)) - r4(dot(q.a, q.d)) || r4(cross(p.d, p.a)) - r4(cross(q.d, q.a)))
        ws.forEach((w, k) => (w.id = `${prefix}${base}-${k + 1}`))
      }
    }
    // The text may name a wall itself.
    for (const w of walls) {
      const wanted = [...new Set(w.raws.map((r) => r.wantId).filter((x): x is string => x !== null))]
      if (wanted.length > 1) {
        this.problem('rooms/wall-id', null, `One wall is given two ids, ${wanted.map((x) => `'${x}'`).join(' and ')}: ${w.raws.flatMap((r) => r.handles).join('; ')}. Give it one.`)
      } else if (wanted.length === 1) w.id = wanted[0]!
    }
  }

  // ------------------------------------------------------------------------------------------
  // Openings

  private pickEdge(fl: FloorDraft, edges: Edge[], rid: string, sideWord: string, at: number): Edge {
    if (!fl.rooms.has(rid)) this.stop('rooms/unknown-room', at, `line ${at}: there is no room '${rid}' on floor '${fl.id}'. Rooms: ${[...fl.rooms.keys()].join(', ')}.`)
    let side = sideWord
    let k: number | null = null
    if (side.includes('.')) {
      const [s, ks] = side.split('.', 2) as [string, string]
      side = s
      k = Number(ks)
    }
    if (!Object.hasOwn(COMPASS, side)) this.stop('rooms/syntax', at, `line ${at}: '${side}' is not a side. Use north, south, east, west (or ne, nw, se, sw for an angled wall).`)
    const mine = edges.filter((e) => e.room.id === rid)
    const hits = mine.filter((e) => dot(e.n, COMPASS[side]!) > 0.9)
    if (hits.length === 0) {
      this.stop('rooms/no-side', at, `line ${at}: room '${rid}' has no side facing ${side}. Its sides: ${mine.map((e) => `${compassOf(e.n)} (${f2(e.L)} m)`).join(', ')}.`)
    }
    if (k !== null) {
      hits.sort((a, b) => a.p[0] + a.q[0] - (b.p[0] + b.q[0]) || a.p[1] + a.q[1] - (b.p[1] + b.q[1]))
      if (!Number.isInteger(k) || k < 1 || k > hits.length) this.stop('rooms/no-side', at, `line ${at}: room '${rid}' has ${hits.length} side(s) facing ${side}; '${side}.${k}' does not exist.`)
      return hits[k - 1]!
    }
    if (hits.length > 1) {
      hits.sort((a, b) => b.L - a.L)
      if (hits[0]!.L - hits[1]!.L < eps()) {
        this.guesses.push(`Line ${at}: room '${rid}' has ${hits.length} sides facing ${side} of the same length; the first was used. Write '${side}.1', '${side}.2' (counted from the west or south) to choose.`)
      }
    }
    return hits[0]!
  }

  private resolveOpening(fl: FloorDraft, edges: Edge[], raws: RawWall[], t: string[], at: number, oid: string, wallHeight: number): Opening | null {
    const kind = t[0] as Opening['type']
    let i = 2
    let between: { A: string; B: string; r: RawWall } | null = null
    let e: Edge
    let stretch: [number, number]
    if (i + 3 < t.length && t[i] === 'between' && t[i + 2] === 'and') {
      const A = t[i + 1]!
      const B = t[i + 3]!
      for (const x of [A, B]) if (!fl.rooms.has(x)) this.stop('rooms/unknown-room', at, `line ${at}: there is no room '${x}' on floor '${fl.id}'. Rooms: ${[...fl.rooms.keys()].join(', ')}.`)
      const shared = raws.filter((r) => r.rooms.length === 2 && new Set(r.rooms.map((x) => x.id)).has(A) && new Set(r.rooms.map((x) => x.id)).has(B))
      if (shared.length === 0) {
        const nb = [...new Set(raws.filter((r) => r.rooms.length === 2 && r.rooms.some((x) => x.id === A)).flatMap((r) => r.rooms.map((x) => x.id)))].filter((x) => x !== A).sort()
        this.stop('rooms/no-shared-wall', at, `line ${at}: '${A}' and '${B}' do not share a wall, so nothing can be put between them. '${A}' shares walls with: ${nb.join(', ') || 'no room'}.`)
      }
      if (shared.length > 1) {
        const desc = shared.map((r) => {
          const k = r.rooms[0]!.id === A ? 0 : 1
          const side = r.sides[k]!
          return `${A}'s ${compassOf(edges[side[0]]!.n)} side (${f2(side[2] - side[1])} m)`
        })
        this.stop('rooms/two-shared-walls', at, `line ${at}: '${A}' and '${B}' share ${shared.length} walls: ${desc.join('; ')}. Say which with 'in ${A} <side>' in place of 'between ${A} and ${B}'.`)
      }
      const r = shared[0]!
      const k = r.rooms[0]!.id === A ? 0 : 1
      e = edges[r.sides[k]![0]]!
      stretch = [r.sides[k]![1], r.sides[k]![2]]
      between = { A, B, r }
      i += 4
    } else if (i + 2 < t.length && t[i] === 'in') {
      e = this.pickEdge(fl, edges, t[i + 1]!, t[i + 2]!, at)
      stretch = [0, e.L]
      i += 3
    } else {
      this.stop('rooms/syntax', at, `line ${at}: after the id write 'between <room> and <room>' or 'in <room> <side>'.`)
    }
    let pos: { centred: true } | { centred: false; dist: number; comp: string; ref: string | null } | null = null
    let width: number | null = null
    let sill: number | null = null
    let height: number | null = null
    let opens: string | null = null
    let hinged: string | null = null
    // CNT-14: its kind, the side it is hinged on as seen from a room, and the part that opens.
    let openingKind: OpeningKind | null = null
    let seenFrom: string | null = null
    let part: { width: number; height?: number } | null = null
    while (i < t.length) {
      const w = t[i]!
      if (w === 'centred' || w === 'centered') {
        pos = { centred: true }
        i++
      } else if (i + 2 < t.length && t[i + 1] === 'from') {
        const dist = numberOf(w, at)
        const comp = t[i + 2]!
        i += 3
        let ref: string | null = null
        if (i + 1 < t.length && t[i] === 'of') {
          ref = t[i + 1]!
          i += 2
        }
        pos = { centred: false, dist, comp, ref }
      } else if (i + 1 < t.length && t[i + 1] === 'wide') {
        width = numberOf(w, at)
        i += 2
      } else if (w === 'sill' && i + 1 < t.length) {
        sill = numberOf(t[i + 1]!, at)
        i += 2
      } else if (w === 'height' && i + 1 < t.length) {
        height = numberOf(t[i + 1]!, at)
        i += 2
      } else if (w === 'opens' && i + 1 < t.length) {
        if (t[i + 1] === 'into' && i + 2 < t.length) {
          opens = t[i + 2]!
          i += 3
        } else if (t[i + 1] === 'out' || t[i + 1] === 'in') {
          opens = `<${t[i + 1]}`
          i += 2
        } else this.stop('rooms/syntax', at, `line ${at}: write 'opens into <room>', 'opens out' or 'opens in'.`)
      } else if (w === 'no-swing') {
        opens = '<none'
        i++
      } else if (w === 'hinged' && i + 1 < t.length) {
        hinged = t[i + 1]!
        i += 2
        // CNT-14: 'hinged left|right', as seen from the room it opens into unless 'seen from <room>' says.
        const seen = t[i] === 'as' && t[i + 1] === 'seen' && t[i + 2] === 'from' ? 3 : t[i] === 'seen' && t[i + 1] === 'from' ? 2 : 0
        if (seen > 0) {
          if (hinged !== 'left' && hinged !== 'right') this.stop('rooms/syntax', at, `line ${at}: 'seen from' goes with 'hinged left' or 'hinged right'.`)
          if (i + seen >= t.length) this.stop('rooms/syntax', at, `line ${at}: write 'seen from <room>' or 'seen from outside'.`)
          seenFrom = t[i + seen]!
          i += seen + 1
        }
      } else if ((OPENING_KINDS as readonly string[]).includes(w)) {
        if (kind === 'opening' || !kindFits(kind, w)) {
          this.stop('rooms/syntax', at, `line ${at}: a ${kind === 'opening' ? 'doorless opening' : kind} cannot be '${w}'. ${kind === 'window' ? `A window is ${WINDOW_KINDS.join(', ')}` : kind === 'door' ? `A door is ${DOOR_KINDS.join(', ')}` : 'An opening has no kind'}.`)
        }
        if (openingKind !== null) this.stop('rooms/syntax', at, `line ${at}: ${kind} '${oid}' is given two kinds, '${openingKind}' and '${w}'.`)
        openingKind = w as OpeningKind
        i++
      } else if (w === 'part' && i + 1 < t.length) {
        part = { width: numberOf(t[i + 1]!, at) }
        i += 2
        if (t[i] === 'x' && i + 1 < t.length) {
          part = { ...part, height: numberOf(t[i + 1]!, at) }
          i += 2
        }
      } else {
        this.stop(
          'rooms/syntax',
          at,
          `line ${at}: '${w}' is not understood on a ${kind} line. Write the place ('centred' or '<m> from <north|south|east|west> [of <room>]'), '<m> wide', and optionally 'sill <m>', 'height <m>', 'opens into <room>|out|in', 'hinged <north|south|east|west>' or 'hinged left|right [seen from <room>]', 'no-swing', a kind (${OPENING_KINDS.join(', ')}) and 'part <m> [x <m>]'.`
        )
      }
    }
    if (width === null) this.stop('rooms/syntax', at, `line ${at}: ${kind} '${oid}' has no width. Write for example '0.9 wide'.`)
    if (pos === null) this.stop('rooms/syntax', at, `line ${at}: ${kind} '${oid}' does not say where along the wall. Write 'centred' or '<m> from <side>'.`)
    const u = e.u
    let s: number
    let fromEnd: 'lo' | 'hi' | null = null
    if (pos.centred) s = (stretch[0] + stretch[1]) / 2 - width / 2
    else {
      const { dist, comp, ref } = pos
      if (!Object.hasOwn(COMPASS, comp)) this.stop('rooms/syntax', at, `line ${at}: measure from north, south, east or west, not '${comp}'.`)
      if (Math.abs(dot(u, COMPASS[comp]!)) < 0.3) {
        const runs = Math.abs(u[0]) > Math.abs(u[1]) ? 'east-west' : 'north-south'
        this.stop('rooms/syntax', at, `line ${at}: this wall runs ${runs}, so a distance along it is measured from ${runs === 'east-west' ? 'east or west' : 'north or south'}, not from ${comp}.`)
      }
      let lo = 0
      let hi = e.L
      if (ref !== null && ref !== e.room.id) {
        if (!fl.rooms.has(ref)) this.stop('rooms/unknown-room', at, `line ${at}: there is no room '${ref}' on floor '${fl.id}'.`)
        const cand = edges.filter((f) => f.room.id === ref && Math.abs(cross(f.u, u)) < tolerance('parallel') && Math.abs(dot(sub(f.p, e.p), e.n)) <= tolerance('roomsWallWidest') + eps())
        if (cand.length === 0) this.stop('rooms/no-side', at, `line ${at}: room '${ref}' has no side along this wall to measure from.`)
        const f = cand.reduce((x, y) => (y.L > x.L ? y : x))
        ;[lo, hi] = [dot(sub(f.p, e.p), u), dot(sub(f.q, e.p), u)].sort((x, y) => x - y) as [number, number]
      }
      const fromHi = dot(u, COMPASS[comp]!) > 0
      s = fromHi ? hi - dist - width : lo + dist
      fromEnd = fromHi ? 'hi' : 'lo'
    }
    // Which stretch of wall holds it.
    const mine: Array<[RawWall, [number, number, number]]> = []
    for (const r of raws) for (const sd of r.sides) if (sd[0] === e.idx) mine.push([r, sd])
    let hold = mine.filter(([, sd]) => sd[1] - eps() <= s && s + width <= sd[2] + eps())
    if (between !== null) hold = hold.filter(([r]) => r === between!.r)
    if (hold.length === 0) {
      const who = e.room.id
      const parts = [...mine]
        .sort((x, y) => x[1][1] - y[1][1])
        .map(([r, sd]) => {
          const other = r.rooms.map((x) => x.id).filter((x) => x !== who)
          return `${f2(sd[1])} to ${f2(sd[2])} m (${other.length > 0 ? `wall to ${other[0]}` : 'outside wall'}, ${f2(sd[2] - sd[1])} m long)`
        })
      const startWord = Math.abs(u[0]) > Math.abs(u[1]) ? (u[0] > 0 ? 'west' : 'east') : u[1] > 0 ? 'south' : 'north'
      this.problem(
        'rooms/opening-fit',
        at,
        `Line ${at}: ${kind} '${oid}' (${f2(width)} m wide) would run from ${f2(s)} to ${f2(s + width)} m along the ${compassOf(e.n)} side of '${who}', which is ${f2(e.L)} m long${between ? `; the wall shared by '${between.A}' and '${between.B}' is only ${f2(stretch[1] - stretch[0])} m long` : ''}. It does not fit in one stretch of wall. Stretches on that side, measured from its ${startWord} end: ${parts.join('; ')}. A part that is meant to run past its wall can be written raw.`
      )
      return null
    }
    const [r] = hold[0]!
    const w = r.wall!
    const axStart: P = [w.json.start[0], w.json.start[1]]
    const axDir = unit(sub([w.json.end[0], w.json.end[1]], axStart))
    const param = (p: P): number => dot(sub(p, axStart), axDir)
    const sideOf = (p: P): number => cross(axDir, sub(p, axStart))
    const P0 = add(e.p, mul(u, s))
    const P1 = add(e.p, mul(u, s + width))
    const o0 = param(P0)
    const o1 = param(P1)
    const offset = Math.min(o0, o1)
    const other = r.rooms.filter((x) => x !== e.room)
    let openingSill: number
    let openingHeight: number
    if (kind === 'window') {
      openingSill = r4(sill ?? this.dflt.winSill)
      openingHeight = r4(height ?? this.dflt.winH)
      if (other.length > 0) this.warn('rooms/inside-window', at, `Line ${at}: window '${oid}' is in the wall between '${e.room.id}' and '${other[0]!.id}', not in an outside wall.`)
    } else {
      openingSill = r4(sill ?? 0)
      openingHeight = r4(height ?? this.dflt.doorH)
    }
    if (openingSill + openingHeight > wallHeight + tolerance('openingOverrun')) {
      this.problem('rooms/opening-too-high', at, `Line ${at}: ${kind} '${oid}' reaches ${f2(openingSill + openingHeight)} m but the walls are ${f2(wallHeight)} m high. Lower it or raise the walls.`)
      return null
    }
    const item: { -readonly [K in keyof Opening]: Opening[K] } = { id: oid, wall: w.id, type: kind, offset: r4(offset), width: r4(width), sill: openingSill, height: openingHeight }
    if (openingKind !== null) item.kind = openingKind
    if (part !== null) item.opens = { width: r4(part.width), ...(part.height !== undefined ? { height: r4(part.height) } : {}) }
    // CNT-14: a door that slides, rolls or lifts needs no swing: nothing is guessed for it.
    const swingless = kind === 'door' && !sweepsFloor(doorKindOf(openingKind))
    let said = ''
    if (kind === 'door' && opens === '<none') said = '; swing not decided (Grid draws a plain gap)'
    else if (kind === 'door' && swingless && opens === null && hinged === null) said = `; ${openingKind}, which sweeps nothing`
    else if (kind === 'door') {
      const guessed: string[] = []
      let target: string | null
      if (opens === null && swingless) {
        target = null
      } else if (opens === null) {
        target = between ? between.B : e.room.id
        guessed.push(`opens into '${target}'`)
      } else if (opens === '<out') target = other.length > 0 ? other[0]!.id : null
      else if (opens === '<in') target = e.room.id
      else {
        target = opens
        if (!r.rooms.some((x) => x.id === target)) {
          this.stop('rooms/door-side', at, `line ${at}: door '${oid}' cannot open into '${target}': it joins ${r.rooms.map((x) => x.id).join(' and ')}${other.length > 0 ? '' : ' and the outside'}.`)
        }
      }
      const mid = mul(add(P0, P1), 0.5)
      const step = tolerance('stepPastFace')
      // The face of the wall a room is on: the room the line is in, another, or the outside (null).
      const faceOf = (room: string | null): 'left' | 'right' => {
        const tp = room === null ? add(mid, mul(e.n, 1)) : room === e.room.id ? sub(mid, mul(e.n, step)) : add(mid, mul(e.n, r.t + step))
        return sideOf(tp) > 0 ? 'left' : 'right'
      }
      const stated = !(opens === null && swingless)
      if (stated) item.swing = faceOf(target)
      let hp: P | null
      if (hinged === null) {
        // A pair hangs from both jambs and a door that slides, rolls or lifts from neither: no guess.
        if (openingKind === 'double' || swingless) hp = null
        else if (fromEnd !== null) {
          hp = fromEnd === 'hi' ? P1 : P0
          guessed.push('hinged at the jamb nearer the corner it was measured from')
        } else {
          hp = o0 < o1 ? P0 : P1
          guessed.push("hinged at the jamb nearer the wall's start")
        }
      } else if (hinged === 'left' || hinged === 'right') {
        // CNT-14: as seen from a room, the room it opens into unless another is named.
        let from: string | null = target
        if (seenFrom !== null) {
          from = seenFrom === 'outside' ? null : seenFrom
          if (from !== null && !r.rooms.some((x) => x.id === from)) {
            this.stop('rooms/door-side', at, `line ${at}: door '${oid}' cannot be seen from '${from}': it joins ${r.rooms.map((x) => x.id).join(' and ')}${other.length > 0 ? '' : ' and the outside'}.`)
          }
        } else if (!stated) {
          this.stop('rooms/syntax', at, `line ${at}: 'hinged ${hinged}' needs a room to see it from: write 'opens into <room>' or 'hinged ${hinged} seen from <room>'.`)
        }
        hp = hingeSeenFrom(faceOf(from), hinged) === 'start' ? (o0 < o1 ? P0 : P1) : o0 < o1 ? P1 : P0
      } else {
        if (!Object.hasOwn(COMPASS, hinged) || Math.abs(dot(u, COMPASS[hinged]!)) < 0.3) {
          this.stop('rooms/syntax', at, `line ${at}: 'hinged ${hinged}' does not name one end of this wall. Use one of the two directions the wall runs in, or left or right.`)
        }
        hp = dot(u, COMPASS[hinged]!) > 0 ? P1 : P0
      }
      if (hp !== null) item.hinge = Math.abs(param(hp) - offset) < eps() ? 'start' : 'end'
      if (guessed.length > 0) this.guesses.push(`Line ${at}: door '${oid}' did not say everything, so: ${guessed.join('; ')}.`)
      said = stated ? `; opens into ${target ?? 'the outside'}` : `; ${openingKind}, which sweeps nothing`
    }
    const joins = other.length > 0 ? `${e.room.id} and ${other[0]!.id}` : `${e.room.id} and the outside`
    const loName = compassOf([-u[0], -u[1]], DIRS)
    const hiName = compassOf(u, DIRS)
    this.openingFacts.push(`${oid}: ${kind} ${f2(width)} m in ${w.id}, joins ${joins}; ${f2(s)} m from ${e.room.id}'s ${loName} corner, ${f2(e.L - s - width)} m from its ${hiName} corner${said}`)
    return item
  }

  // ------------------------------------------------------------------------------------------
  // The plan

  private emit(): WrittenPlan | null {
    const plan: { -readonly [K in keyof WrittenPlan]: WrittenPlan[K] } = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    if (this.explicitFloors) {
      plan.floors = this.floors.map((f) => ({
        id: f.id,
        name: f.name,
        level: f.level,
        ...(f.elevation !== null ? { elevation: f.elevation } : {}),
        ...(f.height !== null ? { height: f.height } : {}),
        ...(f.slab !== null ? { slab: f.slab } : {}),
        ...(f.building !== null ? { building: f.building } : {}),
        ...(f.extra as Pick<NonNullable<FloorPlan['floors']>[number], 'roof' | 'parapet' | 'outline' | 'homes' | 'parking'>),
      }))
    }
    if (this.building !== null) plan.building = this.building
    if (this.display !== null) plan.display = this.display
    const multi = this.floors.length > 1
    // An id written on two floors gets its floor's id in front, so it stays one id in the plan.
    const count = new Map<string, number>()
    for (const fl of this.floors) {
      const ids = new Set([...fl.rooms.keys(), ...fl.openings.map((o) => o.words[1] ?? '')])
      for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1)
    }
    const idOf = (fl: FloorDraft, id: string): string => ((count.get(id) ?? 0) > 1 ? `${fl.id}-${id}` : id)
    // MSG-6 (lab AB-7): an id written once is kept as written; one Grid had to change is named
    // with what it is now, so the next call can use it.
    const changed = [...count].filter(([id, n]) => id !== '' && n > 1).map(([id]) => {
      const on = this.floors.filter((fl) => fl.rooms.has(id) || fl.openings.some((o) => o.words[1] === id))
      return `'${id}' is ${on.map((fl) => `'${idOf(fl, id)}' on floor '${fl.id}'`).join(' and ')}`
    })
    if (changed.length > 0) {
      this.warn(
        'rooms/id-changed',
        null,
        `Ids are unique across the whole plan, and ${changed.length === 1 ? 'this one was' : 'these were'} written on more than one floor, so each takes its floor's id in front: ${changed.join('; ')}. Every other id is kept as written. Use these ids in later calls.`
      )
    }
    const trueAreas = new Map<string, number>()
    for (const fl of this.floors) {
      const wallPrefix = multi ? `${fl.id}-` : ''
      const height = fl.height ?? this.rule.height ?? WALL_DEFAULTS.solid.height
      if (fl.rooms.size === 0) {
        if (fl.raw.walls.length + fl.raw.rooms.length === 0) this.warn('rooms/empty-floor', null, `Floor '${fl.id}' has no rooms.`)
      } else {
        const { edges, raws } = this.derive(fl)
        if (this.problems.length > 0) continue
        const walls = this.buildWalls(fl, edges, raws, wallPrefix)
        plan.walls.push(...walls.map((w) => w.json))
        for (const room of fl.rooms.values()) {
          let boundary: string[] = []
          for (const e of edges.filter((x) => x.room === room)) {
            const parts: Array<[number, string]> = []
            for (const r of raws) for (const sd of r.sides) if (sd[0] === e.idx) parts.push([sd[1], r.wall!.id])
            parts.sort((a, b) => a[0] - b[0])
            for (const [, wid] of parts) if (boundary.length === 0 || boundary[boundary.length - 1] !== wid) boundary.push(wid)
          }
          while (boundary.length > 1 && boundary[0] === boundary[boundary.length - 1]) boundary.pop()
          if (room.firstWall !== null) {
            const k = boundary.indexOf(room.firstWall)
            if (k < 0) this.warn('rooms/first-wall', room.line, `Line ${room.line}: room '${room.id}' has no wall '${room.firstWall}' to start its boundary at; its walls are ${boundary.join(', ')}.`)
            else boundary = [...boundary.slice(k), ...boundary.slice(0, k)]
          }
          const id = idOf(fl, room.id)
          const item: Room = {
            id,
            name: room.name,
            ...(room.use !== undefined ? { use: room.use } : {}),
            boundary,
            ...(this.explicitFloors ? { floor: fl.id } : {}),
            ...(room.height !== null ? { height: room.height } : {}),
            ...(room.floorOffset !== null ? { floorOffset: room.floorOffset } : {}),
            ...(room.tenure !== null ? { tenure: room.tenure } : {}),
            ...(room.roomType !== null ? { roomType: room.roomType } : {}),
            ...(room.outdoor !== null ? { outdoor: room.outdoor } : {}),
            ...(room.roofed !== null ? { roofed: room.roofed } : {}),
          }
          plan.rooms.push(item)
          const area = Math.abs(signedArea(room.poly))
          trueAreas.set(id, area)
          const b = boxOf([room.poly])
          const rect = room.poly.length === 4 && Math.abs(area - (b[2] - b[0]) * (b[3] - b[1])) < tolerance('areaEqual')
          this.roomFacts.push({
            id,
            name: room.name,
            floor: fl.id,
            width: b[2] - b[0],
            depth: b[3] - b[1],
            area,
            corners: rect ? 4 : room.poly.length,
            ...(room.outdoor !== null ? { apart: 'outdoor' as const } : {}),
            basis: room.size?.basis ?? null,
            written: room.size ? { width: room.size.w, depth: room.size.d } : null,
          })
        }
        for (const w of walls) {
          const [L, R] = w.sidesRooms
          this.wallFacts.push({
            id: w.json.id,
            kind: w.json.kind,
            virtual: w.virtual,
            thickness: w.json.thickness,
            length: norm(sub(w.end, w.start)),
            rooms: [...L, ...R],
            handles: [...new Set(w.raws.flatMap((r) => r.handles))],
            stretches: w.raws.flatMap((r) => r.handles.map((handle) => ({ handle, start: [r.a[0], r.a[1]] as const, end: [r.b[0], r.b[1]] as const }))),
          })
        }
        const seen = new Set<string>()
        for (const o of fl.openings) {
          const local = o.words[1]
          if (local === undefined) {
            this.problem('rooms/syntax', o.line, `Line ${o.line}: an opening needs an id after '${o.words[0]}'.`)
            continue
          }
          if (seen.has(local)) {
            this.problem('rooms/duplicate-id', o.line, `Line ${o.line}: the id '${local}' is used by two openings on floor '${fl.id}'.`)
            continue
          }
          seen.add(local)
          try {
            const item = this.resolveOpening(fl, edges, raws, o.words, o.line, idOf(fl, local), height)
            if (item) {
              plan.openings.push(item)
              this.openingLines.set(item.id, o.line)
            }
          } catch (error) {
            if (!(error instanceof RoomsStop)) throw error
            this.problem(error.code, error.line, error.message.charAt(0).toUpperCase() + error.message.slice(1))
          }
        }
      }
      plan.walls.push(...(fl.raw.walls as WrittenWall[]))
      plan.rooms.push(...(fl.raw.rooms as Room[]))
      plan.openings.push(...(fl.raw.openings as Opening[]))
    }
    this.checkOpeningClash(plan.openings)
    this.emitFlats(plan, idOf)
    const all = [...plan.walls, ...plan.rooms, ...plan.openings].map((x) => x.id)
    const twice = [...new Set(all.filter((x, k) => all.indexOf(x) !== k))].sort()
    for (const id of twice) this.problem('rooms/duplicate-id', null, `The id '${id}' would name two things in the plan (walls, rooms and openings share one set of ids). Rename one.`)
    if (this.problems.length > 0) return null
    this.askSizes(plan)
    const wallIds = new Set(plan.walls.map((w) => w.id))
    for (const o of plan.openings) if (!wallIds.has(o.wall)) this.warn('rooms/raw-wall-missing', null, `Opening '${o.id}' names wall '${o.wall}', which the plan does not have; grid check will name it too.`)
    // What Grid itself will measure, by its own method. An outline reads no wall's height.
    const index = indexPlan(plan as unknown as FloorPlan)
    for (const room of plan.rooms) {
      const truth = trueAreas.get(room.id)
      if (truth === undefined) continue
      const poly = tryRoomPolygon(room, index)
      if (poly === null) this.warn('rooms/not-drawn', null, `Grid cannot draw room '${room.id}' from the walls worked out for it; its inside area is ${truth.toFixed(2)} m².`)
      else {
        const area = Math.abs(signedArea(poly.map((p) => [p.x, p.y] as P)))
        if (Math.abs(area - truth) > tolerance('areaReported')) this.warn('rooms/area-differs', null, `Grid measures room '${room.id}' at ${area.toFixed(2)} m², but its inside is ${truth.toFixed(2)} m².`)
      }
    }
    return plan
  }

  /**
   * CNT-4: the flat types, and each placement of one as a flat. A label placed on more than one
   * floor takes its floor's id in front, as a room's id does. A room removed after it was placed
   * is not in its flat; a flat with no room left is not written.
   */
  private emitFlats(plan: { flatTypes?: FloorPlan['flatTypes']; flats?: FloorPlan['flats'] }, idOf: (fl: FloorDraft, id: string) => string): void {
    if (this.flatTypes.size === 0) return
    plan.flatTypes = [...this.flatTypes].map(([id, type]) => ({ id, name: type.name }))
    const labels = new Map<string, number>()
    for (const fl of this.floors) for (const label of new Set(fl.flats.map((f) => f.label))) labels.set(label, (labels.get(label) ?? 0) + 1)
    const flats: NonNullable<FloorPlan['flats']> = []
    for (const fl of this.floors) {
      for (const flat of fl.flats) {
        const rooms = flat.rooms.filter((r) => fl.rooms.get(r.id) === r).map((r) => idOf(fl, r.id))
        if (rooms.length === 0) continue
        const type = this.flatTypes.get(flat.unit)!
        const id = (labels.get(flat.label) ?? 0) > 1 ? `${fl.id}-${flat.label}` : flat.label
        flats.push({
          id,
          ...(type.flatName === null ? {} : { name: type.flatName.split('{n}').join(flat.label) }),
          type: flat.unit,
          rooms,
          ...(flat.mirrored ? { mirrored: true } : {}),
        })
      }
    }
    plan.flats = flats
  }

  /**
   * Openings that share a stretch of one wall, by the check's own rule (`validateOverlaps`): any
   * stretch shared is a clash, a window over a door too, and the check leaves the later one out.
   * So the writing is refused (WRT-17), naming both lines.
   */
  private checkOpeningClash(openings: readonly Opening[]): void {
    const byWall = new Map<string, Opening[]>()
    for (const o of openings) {
      const list = byWall.get(o.wall)
      if (list) list.push(o)
      else byWall.set(o.wall, [o])
    }
    const lineOf = (o: Opening): string => String(this.openingLines.get(o.id) ?? '-')
    for (const [wid, ops] of byWall) {
      const sorted = [...ops].sort((a, b) => a.offset - b.offset)
      let kept = sorted[0]!
      for (const b of sorted.slice(1)) {
        if (b.offset < kept.offset + kept.width - tolerance('openingOverrun')) {
          this.problem(
            'rooms/openings-overlap',
            this.openingLines.get(b.id) ?? null,
            english(
              said('rooms.openingsOverlap', {
                line: lineOf(b),
                opening: `${b.type} '${b.id}'`,
                by: f2(Math.min(kept.offset + kept.width, b.offset + b.width) - b.offset),
                wall: wid,
                other: `${kept.type} '${kept.id}'`,
                otherLine: lineOf(kept),
              })
            )
          )
        } else if (b.offset + b.width > kept.offset + kept.width) kept = b
      }
    }
  }
}

interface UnitPlace {
  at?: P
  dir?: string
  ref?: string
  align?: string
  shift?: number
  gap?: number
}

function newFloor(id: string, name: string, level: number): FloorDraft {
  return {
    id,
    name,
    level,
    height: null,
    elevation: null,
    slab: null,
    building: null,
    extra: {},
    rooms: new Map(),
    inst: new Map(),
    between: new Map(),
    betweenSide: new Map(),
    open: new Set(),
    extover: [],
    openings: [],
    raw: { walls: [], rooms: [], openings: [] },
    flats: [],
  }
}

/** The most times one line may repeat a unit: a corridor of rooms, not a city. */
const REPEAT_MAX = 500

/** How many times a plan whose sizes run to the walls is placed again, at most. */
const SETTLE_ROUNDS = 8

/** Where a word stands in a line of rooms text outside quotes: `re`'s first match there, or null. */
function unquoted(line: string, re: RegExp): RegExpExecArray | null {
  const quoted: Array<[number, number]> = []
  for (const m of line.matchAll(/"[^"]*"|'[^']*'/g)) quoted.push([m.index, m.index + m[0].length])
  const hash = line.split('').findIndex((c, i) => c === '#' && !quoted.some(([a, b]) => i >= a && i < b))
  for (const m of line.matchAll(new RegExp(re.source, 'g'))) {
    if (hash >= 0 && m.index >= hash) break
    if (!quoted.some(([a, b]) => m.index >= a && m.index < b)) return m
  }
  return null
}

/**
 * BRF-6 (lab AB-11): a door between rooms that share no wall, where one of the two was placed
 * beside another room and lined up on the wrong side. The other alignments of the room written
 * last, then of the other, are tried in turn; the first with which the door line is no longer
 * refused, and nothing else is that was not before, is the fix. Nothing is changed: it is offered, as data and in the message.
 */
function alignmentFix(text: string, at: number, had: ReadonlySet<string>): RoomsFix | null {
  const lines = text.split(/\r\n|\r|\n/)
  let door: string[]
  try {
    door = wordsOf(lines[at - 1] ?? '', at)
  } catch {
    return null
  }
  const rooms = [door[3], door[5]].filter((id): id is string => id !== undefined)
  const lineOf = (id: string): number => lines.slice(0, at - 1).findIndex((line) => /^\s*room\s/.test(line) && wordsOf(line, 0)[1] === id)
  const order = rooms.map(lineOf).filter((i) => i >= 0).sort((a, b) => b - a)
  for (const i of order) {
    const line = lines[i]!
    const place = unquoted(line, /\b(north|south|east|west)\s+of\s+\S+/)
    if (place === null) continue
    const across = place[1] === 'north' || place[1] === 'south'
    const now = unquoted(line, /\balign\s+(\S+)/)
    const current = now?.[1] === 'center' ? 'centre' : (now?.[1] ?? (across ? 'west' : 'south'))
    for (const side of across ? ['west', 'east', 'centre'] : ['south', 'north', 'centre']) {
      if (side === current) continue
      const written = now !== null
        ? `${line.slice(0, now.index)}align ${side}${line.slice(now.index + now[0].length)}`
        : `${line.slice(0, place.index + place[0].length)} align ${side}${line.slice(place.index + place[0].length)}`
      const tried = compileRoomsText([...lines.slice(0, i), written, ...lines.slice(i + 1)].join('\n'), { offerFixes: false }).problems
      if (tried.every((p) => p.line !== at && had.has(`${p.code}|${p.line}`))) return { line: i + 1, text: written.trim() }
    }
  }
  return null
}

/** The problem with its fix, for a door between rooms that share no wall: in the message, and as data. */
function withAlignmentFix(text: string, problem: RoomsProblem, all: readonly RoomsProblem[]): RoomsProblem {
  if (problem.code !== 'rooms/no-shared-wall' || problem.line === null) return problem
  const fix = alignmentFix(text, problem.line, new Set(all.map((p) => `${p.code}|${p.line}`)))
  if (fix === null) return problem
  return { ...problem, message: `${problem.message} With line ${fix.line} written '${fix.text}', they share a wall.`, fixes: [fix] }
}

export interface CompileOptions {
  /**
   * HND-12: the decimal places the walls' ends, thicknesses and heights are written to: 4 (a
   * tenth of a millimetre) for rooms text a person or an agent writes, more for a plan read from
   * a scan, whose rooms keep the scan's own areas.
   */
  readonly places?: number
  /**
   * BRF-6: whether a door between two rooms that share no wall is refused with the alignment that
   * would make them share one, when there is one. On (the default) unless a fix is being tried.
   */
  readonly offerFixes?: boolean
}

/**
 * Writes rooms text as a plan. The answer holds the plan, or null with the problems that stop
 * it; every warning and every guess the writing made; and the rooms, walls and openings as
 * Grid worked them out.
 * A door between two rooms that share no wall is refused with the alignment that would make
 * them share one, when there is one (`offerFixes`, on unless a fix is being tried).
 */
export function compileRoomsText(text: string, options: CompileOptions = {}): RoomsResult {
  const offerFixes = options.offerFixes ?? true
  let assumed = new Map<string, number>()
  let compiler: Compiler | null = null
  let plan: WrittenPlan | null = null
  let stopped: RoomsProblem | null = null
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    compiler = new Compiler(text, assumed, options)
    try {
      plan = compiler.run()
      stopped = null
    } catch (error) {
      if (!(error instanceof RoomsStop)) throw error
      const message = error.message.charAt(0).toUpperCase() + error.message.slice(1)
      stopped = { code: error.code, line: error.line, message }
      plan = null
      break
    }
    // A size to the walls' centre lines or outside faces needs the walls round it: place again
    // until every side has the wall it was taken to have.
    const moved = [...compiler.found].some(([key, t]) => Math.abs((assumed.get(key) ?? Number.NaN) - t) > tolerance('joint') || !assumed.has(key))
    if (!moved || plan === null) break
    assumed = new Map([...assumed, ...compiler.found])
  }
  const c = compiler!
  let problems: RoomsProblem[] = stopped === null ? c.problems : [stopped]
  let warnings: RoomsProblem[] = c.warnings
  // WRT-17: what is written passes the drawing's own check, or is not written.
  if (stopped === null && plan !== null && problems.length === 0) {
    const checked = checkWritten(plan, warnings, c.rawIds)
    problems = checked.problems
    warnings = [...warnings, ...checked.warnings]
    if (problems.length > 0) plan = null
  }
  return {
    plan: stopped === null ? plan : null,
    name: c.name,
    basedOn: c.basedOn,
    problems: offerFixes ? problems.map((p) => withAlignmentFix(text, p, problems)) : problems,
    warnings,
    guesses: c.guesses,
    rooms: c.roomFacts,
    walls: c.wallFacts,
    openings: c.openingFacts,
    sizes: c.sizes,
  }
}
