/**
 * Rooms text to a plan (WRT-2): the author names rooms with their sizes and where they go,
 * and doors and windows by the rooms they join; Grid works out the walls, their kinds, each
 * room's boundary and each opening's wall and offset.
 *
 * The way of writing comes from the lab's rooms-first prototype (lab entry WR-20), which the
 * owner chose as the main way agents write (WRT-1). The plan file stays the source of truth:
 * the text is a way of writing it, and `readRoomsText` reads any plan back as text.
 *
 * The language, one statement per line (`#` starts a comment). A plain number is metres (under a
 * display that is not metres, what its `numbers` word names, WRT-34); a length
 * may instead carry its unit in one word: `360cm`, `3600mm`, `12ft`, `12ft6in`, `12'6"` (`words.ts`):
 *
 *   plan "<name>"
 *   display <m|cm|mm|ft-in> [area m2|ft2] [decimal point|comma] [precision <n>] [numbers <m|cm|mm|ft>]
 *                                      how the person reads lengths and areas: the plan's `display`
 *                                      (WRT-7). The file stays in metres. Under a display that is
 *                                      not metres a plain number is what `numbers` names, or is
 *                                      refused as a question (WRT-34); `numbers` is not kept in the plan
 *   building <home|office|shop|...>    what kind of building the plan is (CNT-5)
 *   based on <revision>                the plan this text was read from (written by the read-back)
 *   walls outside <t> inside <t> [interior|partition] height <h>      the thickness rule, for
 *       the floor it is on (before its rooms) and every floor after it (WRT-47)
 *   walltype <t> <kind>                every inside wall of that thickness gets that kind
 *   sizes inside|centre|outside        what a room's size measures to, when its line does not say
 *   doors height <h>   windows sill <s> height <h>                    defaults
 *   floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]
 *       the name in quotes (or `name <text>`), or left out: the id names the floor. level is the
 *       storey number, whole or a half (0.5), never a height; elevation the metres from the
 *       ground floor's level to this one's; height to its ceiling; slab the floor under it.
 *       `elevation=0`, `level: 1` and `Height = 2.7` are read as `elevation 0` and so on (WRT-14)
 *   room <id> "<name>" <use|-> <width> x <depth> [inside|centre|outside] <where> [...]
 *   room <id> "<name>" <use|-> polygon x,y x,y x,y ...                 inside faces; a point's
 *       lengths may carry their unit, as a size's do: 10ft,0ft (WRT-62). The points are the room's
 *       place, from the drawing's origin (the unit's, in a unit): 'at', a side or a corner on the
 *       same line is refused, never read as a move (WRT-63)
 *       <where>: at x,y (the south-west corner the size measures to: inside, unless centre or outside)
 *                <north|south|east|west> of <room or unit> [align <side|centre>] [shift <m>] [until [near] <room>] [open [<room>]]
 *                inside <room> corner <ne|nw|se|sw> [wall <t> [kind]] [open]  cuts that corner out of the room
 *                (as wide or as deep as the room's side there, a strip across it: WRT-66)
 *                one place and one size a line (WRT-55); 'open <room>' names the room it is open to, for a
 *                room placed 'at x,y' too, and a bare 'open' is said in the answer: the room it is placed
 *                beside, or the room it is cut out of
 *       then:    walls <t> [kind]  height <h>  floor <m> (its floor above or below the storey's)  first-wall <wall id>
 *                tenure <private|shared|common|commercial>  type "<the firm's own room type>"
 *                outdoor <garden|courtyard|terrace|balcony|light-well|porch|carport|other> [roofed|unroofed]
 *                                 the room is outdoor space (CNT-7, C26), roofed or not
 *                conditioned|unconditioned  heated or cooled or not, so in the living area under air
 *                                 or out of it (ARE-60); unstated, a parking room is not
 *                number "<text>"  dept <text>  facts <name>=<value> ...  its stated room number, its
 *                                 department and facts of the person's own (WRT-74), never in a unit
 *                through <floor>  the room, and so its walls, stands on every floor written after this
 *                                 one up to that floor too, in the same place (WRT-4): a stair or lift
 *                                 core, a shaft, a block's outside walls; with the openings written
 *                                 between two rooms that both rise (LVL-16)
 *       <use>:   one of Grid's uses, or a word that plainly means one (`USE_WORDS`): 'wc' is toilet
 *       a size may be '*': the room stretches as far as the room named after 'until', to its far face,
 *       or to its near face less the wall between when that room stands in the way or the line says
 *       'until near' (WRT-55); a '*' along the room it is placed beside, with no 'until', takes that
 *       room's extent
 *   wall between <room> and <room> [<side>] [<t>] [kind|virtual] [height <h>] [id <id>] [reversed]
 *   wall <room> <side> [<t>] [kind] [height <h>] [id <id>] [reversed]  an outside wall
 *   door|window|opening <id> ["<name>"] between <room> and <room>, <place>, <w> wide [...]
 *   door|window|opening <id> ["<name>"] in <room> <side>, <place>, <w> wide [...]
 *       the name is kept in the opening's facts (`properties.name`, WRT-55). Between two rooms a
 *       place that, measured along the room's side, misses the stretch they share is measured along
 *       that stretch, and 'opens in' or 'opens out' is refused, the fix for the room the words most
 *       often mean first: out of the smaller room, or into it (WRT-65);
 *       a window in a side partly against another room goes in the side's outside stretch
 *       <side>: a compass word, or `<side>.<k>` when more than one of the room's sides faces it,
 *                counted from the west, then the south; a bare word there is refused, except in a
 *                unit with one such side onto something outside it (WRT-51)
 *       <place>: centred | <m> from <north|south|east|west> [of <room>]
 *       then:    sill <m>, height <m>, opens into <room>|in|out, hinged <direction>, no-swing
 *                hinged left|right [seen from <room>|outside]  as seen from the room it opens into
 *                unless named (CNT-14); a kind: single, double, sliding, pocket, folding, roller,
 *                garage (doors), single, double, sliding, fixed, high-level (windows); and
 *                part <w> [x <h>], the part that opens
 *       a raw room may be named too (WRT-45): the wall both rooms' boundaries name, or the one
 *       of its walls whose outside face looks to <side>, measured from that wall's own ends
 *   unit <name> [setting=default ...] ... end      rooms and openings written once
 *   unit <name> flat "<type name>" ["<flat name>"] [setting=default ...] ... end
 *       a flat type (CNT-4): every placement of it is a flat of that type in the plan's flats,
 *       with its label as id, the flat name with {n} as the label, its rooms, and mirrored
 *       when it is placed mirrored; the type is in the plan's flat types, by the unit's name
 *   place <unit> as <label> <where> [mirror east-west|north-south] [gap <t>] [setting=value ...]
 *   repeat <unit> <n> <direction> of <room or unit> as <first label> [...]
 *   repeat <unit> <n> <direction> as <first label> <where the first goes> [mirror ...] [gap <t>] [setting=value ...]
 *          [first setting=value ...] [last setting=value ...] [<setting>=* fill <length>]
 *       one room type placed n times in a row (WRT-4): the first where the line says, each next one
 *       on the given side of the one before; 'first' and 'last' settings hold for the two ends
 *       only (end rooms a wall's width narrower). A label ending in digits counts up from them and
 *       keeps their width (301, 302; 001, 002; A01, A02, WRT-55), another takes a number after it
 *       (A1, A2, ...), so the ids are the same on every writing. 'fill <length>' works out the one
 *       setting written '*' so the row is that long, to the faces its sizes measure to (WRT-55); a
 *       row that runs past an end of the room its first is placed beside is said once (`rooms/row-overrun`)
 *   copy <floor> [with openings]   rename <room> <new id> "<name>" [use]   remove <id>
 *       a copy takes the floor's rooms and its raw floor fields (LVL-16), its openings only when
 *       asked; an id written on several floors is kept on the first and has the floor's id in
 *       front on the others
 *   raw wall|room|opening { ...Grid's own JSON... }     a part written the Grid way
 *   raw floor { "roof": {...}, "parapet": <m> }         the floor's fields rooms text has no words for (LVL-6);
 *                                                      BRF-4 adds "outline", "homes" and "parking";
 *                                                      null takes a copied one off (LVL-16)
 *   plot <w> x <d> [at x,y]   site boundary x,y ...   street <side|edge n>   setback <from> <m>
 *   north <degrees> [clockwise] | north <up|left|...>   site origin|location|elevation|ground|country ...
 *   site <fence|gate|path|paving|tree|pool> ...         the plot, north and the site (CNT-41): `site.ts`
 *   ground <m> [below|above]                            the ground outside (ARE-62): `ground.ts`
 *   stair <id> ["<name>"] from <floor|room> to <floor|room> in <room>, <w> wide, straight|L|U, runs <side>
 *         [then <side>] [along <side>] [risers <n>]   or   ..., <w> wide, run x,y x,y ...
 *   raw stair { ...Grid's own JSON for a stair... }     the plan's stairs (LVL-21): `stairs.ts`
 *
 * An opening pattern (LVL-8) is not rooms text, in a unit or out of one: a `pattern` line is
 * refused with where a pattern goes instead (`patternLine`). It lives in the plan file's
 * `patterns`, naming its wall by id, and `grid write` keeps it, so the wall ids written here are
 * what keep it placed (WRT-4: the same on every writing, and when a row grows by one).
 * WRT-37: they are named per building, rooms that share a wall: the building of the floor's first
 * room keeps the plain names (`ext-south`) and each other puts its first room's id in the names
 * that name no room (`ext-pump-south`), so a building added elsewhere renames none of them.
 *
 * Pure: text in, a plan and a report out. Nothing here reads or writes a file.
 */
import { BUILDING_TYPES, DEFAULT_FLOOR_ID, DOOR_KINDS, OPENING_KINDS, OUTDOOR_KINDS, ROOM_TENURES, ROOM_USES, WALL_DEFAULTS, WINDOW_KINDS, WallKindSchema, readBuilding, readUse, type BuildingType, type FloorPlan, type Opening, type OpeningKind, type Room, type OutdoorKind, type RoomTenure, type RoomUse, type Wall, type WallKind, factKey, safeParseFloorPlan } from '../types/floorplan'
import { doorKindOf, kindFits, sweepsFloor } from '../geometry/openingKinds'
import { hingeSeenFrom } from '../geometry/handing'
import { indexPlan } from '../geometry/plan'
import { pointInPolygon } from '../geometry/innerPoint'
import type { Vec2 } from '../geometry/vec2'
import { phaseReading, planHasPhases, standsIn } from '../geometry/phases'
import { roomFloorArea, tryRoomPolygon } from '../geometry/room'
import { floorOf } from '../geometry/floors'
import { isOutdoor } from '../geometry/outdoor'
import { wallFrameAt, wallLength } from '../geometry/wall'
import { limit, tolerance } from '../geometry/tolerances'
import { buildingKind } from '../geometry/plausible'
import { AREA_UNITS, DECIMAL_MARKS, LENGTH_UNITS, type AreaUnit, type DecimalMark } from '../types/units'
import { english, joined, name as sayName, num, said, type MessageKey, type Said, type Values } from '../messages/say'
import { idsOfText } from './ids'
import { factValueOf, f2, hasUnit, isNumberWord, isPointWord, metres, pointHasUnit, numberOf, PLAIN_METRES, PLAIN_UNITS, pointOf, quotedWordsOf, RoomsStop, wordsOf, type LineWord, type PlainNumbers, type PlainUnit } from './words'
import { checkWritten } from './selfCheck'
import { SITE_LINE_WORDS, SiteLines } from './site'
import { STAIR_LINE_WORDS, StairLines } from './stairs'
import { likelyMeant } from '../types/nearest'
import { readingNotes } from '../types/reading'

type P = readonly [number, number]
/** A wall as the text writes it into the file: no height when the text states none (WRT-6). */
type WrittenWall = Omit<Wall, 'height' | 'unstated'> & { height?: number }

/** The floor's fields a `raw floor` line may hold: LVL-6's roof and parapet, BRF-4's outline, homes and parking. */
export const RAW_FLOOR_KEYS: readonly string[] = ['roof', 'parapet', 'outline', 'homes', 'parking']

/** WRT-68: the kinds a `raw` line takes, written after it in small letters. */
const RAW_KINDS: readonly string[] = ['wall', 'room', 'opening', 'floor', 'stair']

/**
 * WRT-48: where a part a `raw` line cannot hold goes instead, by the word written after `raw`:
 * an opening's type, a floor's own field, or one of the plan file's lists.
 */
const RAW_ELSEWHERE: Readonly<Record<string, Said>> = {
  door: said('rooms.raw.kind.opening', { type: 'door' }),
  doorway: said('rooms.raw.kind.opening', { type: 'door' }),
  gate: said('rooms.raw.kind.opening', { type: 'door' }),
  window: said('rooms.raw.kind.opening', { type: 'window' }),
  skylight: said('rooms.raw.kind.opening', { type: 'window' }),
  roof: said('rooms.raw.kind.floor', { list: 'roof' }),
  parapet: said('rooms.raw.kind.floor', { list: 'parapet' }),
  outline: said('rooms.raw.kind.floor', { list: 'outline' }),
  // LVL-21: a stair is `raw stair` or a stair line of its own.
  stair: said('rooms.raw.kind.stair'),
  staircase: said('rooms.raw.kind.stair'),
  column: said('rooms.raw.kind.list', { list: 'columns' }),
  pillar: said('rooms.raw.kind.list', { list: 'columns' }),
  fixture: said('rooms.raw.kind.list', { list: 'items' }),
  item: said('rooms.raw.kind.list', { list: 'items' }),
  furniture: said('rooms.raw.kind.list', { list: 'items' }),
  site: said('rooms.raw.kind.site'),
  bay: said('rooms.raw.kind.list', { list: 'bays' }),
  ramp: said('rooms.raw.kind.list', { list: 'ramps' }),
  grid: said('rooms.raw.kind.list', { list: 'grids' }),
}

/** WRT-48: words agents write on a raw wall for a curve, which Grid states as `arc`. */
const CURVE_WORDS = new Set(['bulge', 'spline', 'ellipse', 'curve', 'curved', 'radius', 'sagitta', 'bend', 'controlpoints', 'centre', 'center', 'sweep'])
/** WRT-48: words agents write on a raw part for facts of their own, which Grid holds in `properties`. */
const FACT_WORDS = new Set(['facts', 'fact', 'attributes', 'attrs', 'props', 'metadata', 'meta', 'custom', 'data', 'tags'])

/** WRT-14: the words a floor line knows after its id, `name` among them. */
const FLOOR_KEYS: readonly string[] = ['name', 'level', 'elevation', 'height', 'slab', 'building', 'copy']

/** WRT-69: what each word of a floor line takes, said when it has nothing after it. */
const FLOOR_TAKES: Readonly<Record<string, MessageKey>> = {
  name: 'rooms.floor.takes.name',
  level: 'rooms.floor.takes.level',
  elevation: 'rooms.floor.takes.elevation',
  height: 'rooms.floor.takes.height',
  slab: 'rooms.floor.takes.slab',
  building: 'rooms.floor.takes.building',
}

/** WRT-69: the floor's own words an agent writes on a walls, doors or windows line, with what they take. */
const FLOOR_ONLY: Readonly<Record<string, string>> = { level: '<n>', elevation: '<m>', slab: '<m>' }

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
/**
 * WRT-7: a `display` line, as the plan's `display`; and WRT-34: what a plain number is, from its
 * `numbers` word, which is how this text is written and is not kept in the plan.
 */
function displayOfWords(t: readonly string[], at: number): { display: NonNullable<FloorPlan['display']>; numbers: PlainUnit | null } {
  const usage = `line ${at}: write 'display <m|cm|mm|ft-in> [area m2|ft2] [decimal point|comma] [precision 0-5] [numbers m|cm|mm|ft]': how the person reads lengths and areas, and what a number with no unit is.`
  const length = t[1] as NonNullable<FloorPlan['display']>['length']
  if (!(LENGTH_UNITS as readonly string[]).includes(t[1] ?? '')) throw new RoomsStop('rooms/syntax', usage, at)
  const out: { -readonly [K in keyof NonNullable<FloorPlan['display']>]: NonNullable<FloorPlan['display']>[K] } = { length }
  let numbers: PlainUnit | null = null
  for (let i = 2; i < t.length; i += 2) {
    const key = t[i]!
    const value = t[i + 1]
    if (key === 'area' && (AREA_UNITS as readonly string[]).includes(value ?? '') && out.area === undefined) out.area = value as AreaUnit
    else if (key === 'decimal' && (DECIMAL_MARKS as readonly string[]).includes(value ?? '') && out.decimal === undefined) out.decimal = value as DecimalMark
    else if (key === 'precision' && /^[0-5]$/.test(value ?? '') && out.precision === undefined) out.precision = Number(value)
    else if (key === 'numbers' && (PLAIN_UNITS as readonly string[]).includes(value ?? '') && numbers === null) numbers = value as PlainUnit
    else throw new RoomsStop('rooms/syntax', usage, at)
  }
  return { display: out, numbers }
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
/**
 * WRT-35: the words a room line takes after its use, each with what it takes after it, for the
 * word most likely meant when one is not understood; `<m>` and `<t>` take a number.
 */
const ROOM_LINE_WORDS: Readonly<Record<string, readonly string[]>> = {
  at: ['x,y'],
  north: ['of', '<room>'],
  south: ['of', '<room>'],
  east: ['of', '<room>'],
  west: ['of', '<room>'],
  align: ['<side|centre>'],
  shift: ['<m>'],
  until: ['<room>'],
  open: [],
  inside: ['<room>', 'corner', '<ne|nw|se|sw>'],
  centre: [],
  outside: [],
  polygon: ['x,y', 'x,y', 'x,y'],
  walls: ['<t>'],
  wall: ['<t>'],
  height: ['<m>'],
  floor: ['<m>'],
  'first-wall': ['<wall id>'],
  tenure: ['<tenure>'],
  type: ['"<text>"'],
  through: ['<floor>'],
  outdoor: ['<kind>'],
  roofed: [],
  unroofed: [],
  conditioned: [],
  unconditioned: [],
  number: ['"<text>"'],
  dept: ['"<text>"'],
  facts: ['<name>=<value>'],
}
/** The words agents write for a room line's own: a room's level above its storey is its `floor`. */
const ROOM_LINE_MEANS: Readonly<Record<string, string>> = { level: 'floor', elevation: 'floor', offset: 'floor', ceiling: 'height', headroom: 'height', thickness: 'walls' }

/** Whether `word` is what `form` asks for: a number for `<m>` or `<t>`, a point for `x,y`, the word itself for a word. */
function takesWord(form: string, word: string): boolean {
  if (form === '<m>' || form === '<t>') return isNumberWord(word)
  if (form === 'x,y') return isPointWord(word)
  if (form.startsWith('<') || form.startsWith('"')) return !Object.hasOwn(ROOM_LINE_WORDS, word)
  return word === form
}

/**
 * The room line's word most likely meant by `t[i]`, written with what follows it on the line
 * when that fits (`level 0.6` is `floor 0.6`), else with what it takes; null when none is near.
 */
function roomWordMeant(t: readonly string[], i: number): string | null {
  const w = t[i]!
  const meant = ROOM_LINE_MEANS[w.toLowerCase()] ?? likelyMeant(w, Object.keys(ROOM_LINE_WORDS))
  if (meant === null) return null
  const takes = ROOM_LINE_WORDS[meant]!
  const after = t.slice(i + 1, i + 1 + takes.length)
  const fits = after.length === takes.length && takes.every((form, k) => takesWord(form, after[k]!))
  return [meant, ...(fits ? after : takes)].join(' ')
}
/** The wall thicknesses rooms text writes when its `walls` line does not say (BRF-6's first layout packs by them). */
export const ROOMS_WALLS = { outside: 0.3, inside: 0.1 } as const

/**
 * LVL-18: an opening reaching above its walls. Raising the walls (or the storey and the floors over
 * it) is offered before lowering the opening, and walls lower than a storey (`storeyLowest`, Grid's
 * own size) are named as the likelier fault. `wall` names the one wall of a raw room.
 */
function openingTooHigh(values: Values, wallHeight: number, wall: string | null): string {
  const low = wallHeight < limit('storeyLowest')
  const key = wall === null ? (low ? 'rooms.openingTooHigh.low' : 'rooms.openingTooHigh') : low ? 'rooms.rawRoom.tooHigh.low' : 'rooms.rawRoom.tooHigh'
  return english(said(key, { ...values, ...(wall === null ? {} : { wall }), limit: num(f2(limit('storeyLowest'))) }))
}
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
/**
 * WRT-44: a straight wall whose two ends, as the plan file holds them, are one point: the check
 * reads it so (`wall/zero-length`) and leaves it out. A curve is read by its own checks.
 */
function noLength(start: unknown, end: unknown, arc?: unknown): boolean {
  if (arc !== undefined || !Array.isArray(start) || !Array.isArray(end)) return false
  return typeof start[0] === 'number' && typeof start[1] === 'number' && start[0] === end[0] && start[1] === end[1]
}
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

/**
 * WRT-52: how far a group of rooms' sizes, as written, run past the inside box `box` of them on
 * each side, or null when one of them is sized to its inside faces (it has nothing taken off).
 */
function marginsOf(rooms: readonly RoomDraft[], box: Box): Margins | null {
  if (rooms.length === 0 || rooms.some((r) => r.off === undefined)) return null
  const sized = rooms.map((r) => [r.box[0] - r.off!.west, r.box[1] - r.off!.south, r.box[2] + r.off!.east, r.box[3] + r.off!.north] as const)
  return {
    west: box[0] - Math.min(...sized.map((b) => b[0])),
    south: box[1] - Math.min(...sized.map((b) => b[1])),
    east: Math.max(...sized.map((b) => b[2])) - box[2],
    north: Math.max(...sized.map((b) => b[3])) - box[3],
  }
}

/**
 * WRT-52: what lining up a room or unit sized to centre lines or outside faces, placed `dir` of
 * one sized the same way, moves it by along the side it is placed on, so the sizes as written
 * line up and not the inside faces: a room beside a dividing line has nothing taken off there,
 * one beside a wall half of it. None when either is sized to its inside faces.
 */
function alongSized(placed: Margins | null, ref: Margins | null, dir: string, alignIn: string | null): number {
  if (placed === null || ref === null) return 0
  const horiz = dir === 'east' || dir === 'west'
  const align = alignIn ?? (horiz ? 'south' : 'west')
  const [low, high] = horiz ? (['south', 'north'] as const) : (['west', 'east'] as const)
  if (align === low) return placed[low] - ref[low]
  if (align === high) return ref[high] - placed[high]
  return (ref[high] - ref[low] - (placed[high] - placed[low])) / 2
}

/**
 * WRT-55: a door, window or opening line with a name written after its id
 * (`door front "Front door" in hall north, ...`): the name apart, and the line without it.
 */
function openingLine(words: string[], line: number): OpeningLine {
  const named = words.length > 3 && words[2] !== 'between' && words[2] !== 'in' && (words[3] === 'between' || words[3] === 'in')
  return named ? { words: [words[0]!, words[1]!, ...words.slice(3)], line, name: words[2]! } : { words, line }
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
/** WRT-41: the two rooms a `wall between <a> and <b> [<side>] ... virtual` line opens to each other, or null. */
function openedPair(words: readonly string[]): string | null {
  if (words[0] !== 'wall' || words[1] !== 'between' || words[3] !== 'and' || words[2] === undefined || words[4] === undefined) return null
  const opened = words.some((w, i) => i > 4 && w === 'virtual' && words[i - 1] !== 'id')
  return opened ? pairKey(words[2], words[4]) : null
}
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
  /** ARE-60: heated or cooled, when the line says. */
  conditioned: boolean | null
  /** WRT-74: the room's stated number, and its facts of the person's own, when the line says. */
  number: string | null
  facts: Record<string, string | number | boolean> | null
  /** The size as written and what it measures to, for the answer. */
  size: { w: number | null; d: number | null; basis: SizeBasis } | null
  /** WRT-4: the last floor the room rises through, when it stands on the floors after its own too. */
  through: string | null
  /** WRT-4: the floor whose room this one is, standing here because that one rises through. */
  risenFrom: string | null
  /** WRT-47: for a room sized to centre lines or outside faces and placed by its corner, the box its size measures to. */
  drawn?: Box
  /** WRT-52: for a room sized to centre lines or outside faces, what its size took off each side for the walls round it. */
  off?: Margins
  /** WRT-55: the rooms it was placed beside (`<side> of <room or unit>`), for advice that applies to it. */
  beside?: readonly string[]
}

/** WRT-52: how far a room's size, as written, runs past its inside faces on each side. */
interface Margins {
  west: number
  east: number
  south: number
  north: number
}

interface OpeningLine {
  words: string[]
  line: number
  /** WRT-55: the name written after its id, kept in its facts as `name`. */
  name?: string
  /** LVL-16: carried up with two rooms that rise through, from the floor they rise from. */
  risen?: true
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
  /** LVL-6: the floor's fields rooms text has no words for, as Grid's plan file holds them (`raw floor`); LVL-16: `null` takes a copied one off. */
  extra: Record<string, unknown>
  /** LVL-16: the floor this one copies, and whether it took its openings. */
  copied: { from: string; openings: boolean } | null
  rooms: Map<string, RoomDraft>
  inst: Map<string, string[]>
  between: Map<string, WallSay>
  /** What the text says about one of several walls two rooms share: keyed by the pair, a room and its side. */
  betweenSide: Map<string, WallSay>
  open: Set<string>
  /**
   * WRT-41: the pairs of rooms a `wall between ... virtual` line of this floor opens, read when
   * the floor starts, so a room placed beside the other is placed against it, wherever the line is.
   */
  ahead: Set<string>
  extover: Array<{ room: string; side: string; say: WallSay }>
  openings: OpeningLine[]
  raw: { walls: unknown[]; rooms: unknown[]; openings: unknown[] }
  /** CNT-4: each placement of a flat type on this floor: its label, its unit, its rooms and whether it is mirrored. */
  flats: Array<{ label: string; unit: string; mirrored: boolean; rooms: RoomDraft[] }>
  /** WRT-47: the walls line this floor is written by: the one in force when it started, and the line it came from. */
  rule: WallsRule
  /** WRT-55: the rows of units repeated on this floor, so a room placed beside one is held to it. */
  rows: Array<{ line: number; unit: string; count: number; d: string; rooms: RoomDraft[]; fill: number | null }>
}

/** WRT-47: a walls line's figures, and the line that stated them (null for Grid's own). */
interface WallsRule {
  outside: number
  inside: number
  height: number | null
  kind: WallKind
  line: number | null
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
  /** WRT-27: written raw, in Grid's own JSON, and measured as Grid measures every room; `corners` 0 when Grid cannot draw it. */
  readonly raw?: true
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
  /** WRT-27: written raw, in Grid's own JSON, not worked out. */
  readonly raw?: true
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
  /** WRT-27: how many of the walls, rooms and openings were written raw; left out when none were. */
  readonly raw?: { readonly walls: number; readonly rooms: number; readonly openings: number }
}

// ---------------------------------------------------------------------------------------------
// The compiler

/**
 * A stretch of a room's face that another room's face looks onto, `d` apart at its middle. A face
 * turned further out of parallel than `roomsFaceSkew` allows (WRT-56) carries how the gap changes
 * along it: `slope` per metre from `mid`, the station where the gap is `d`.
 */
interface Facing {
  s0: number
  s1: number
  d: number
  f: Edge
  turn?: { slope: number; mid: number; beyond: boolean }
}

interface Edge {
  room: RoomDraft
  i: number
  p: P
  q: P
  u: P
  n: P
  L: number
  cands: Array<Facing>
  cover: Array<Facing>
  idx: number
}

/** WRT-45: what a door, window or opening line says after the wall it names. */
interface OpeningWords {
  readonly pos: { centred: true } | { centred: false; dist: number; comp: string; ref: string | null }
  readonly width: number
  readonly sill: number | null
  readonly height: number | null
  readonly opens: string | null
  readonly hinged: string | null
  readonly openingKind: OpeningKind | null
  readonly seenFrom: string | null
  readonly part: { width: number; height?: number } | null
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
  /** WRT-56: a piece of the wall between two rooms whose sides are out of parallel. */
  turned?: boolean
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
  /** WRT-34: how a plain number is read, from the text's display line, found before any line is read. */
  private plain: PlainNumbers = PLAIN_METRES
  // WRT-6 (lab AU3-6): no height until the text states one. A wall the text gives no height is
  // written with none, and the reading gives it its floor's height or Grid's default.
  // WRT-47: the walls line in force; each floor keeps the one it started with (`FloorDraft.rule`).
  private rule: WallsRule = { ...ROOMS_WALLS, height: null, kind: 'interior', line: null }
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
  /** WRT-27: each raw part with its line and the floor whose line it is written under. */
  private readonly rawParts: Array<{ kind: 'wall' | 'room' | 'opening'; part: Record<string, unknown>; line: number; under: string }> = []
  /** WRT-48: the names a wall line gives that were no room of its floor when it was read. */
  private readonly wallNames: Array<{ fl: FloorDraft; room: string; line: number }> = []
  /** WRT-17: every wall thickness a line of the text states, besides the walls line. */
  private readonly statedT = new Set<number>()
  /** WRT-17: the pairs of rooms whose wall's thickness, from their gap, has been said. */
  private readonly fromGap = new Set<string>()
  /** WRT-56: per floor, the pairs of rooms whose wall lies between faces out of parallel. */
  private readonly turned = new Map<string, Map<string, { a: string; b: string; sine: number; off: number }>>()
  /** WRT-17: the line each opening was written on, for a refusal that names it. */
  private readonly openingLines = new Map<string, number>()
  /** LVL-19: each placed opening's id as its line writes it, by its id in the plan. */
  private readonly openingLocal = new Map<string, string>()
  /**
   * WRT-51: for an opening line refused for not saying which of several sides, the line written
   * with each side in full, and for a line between two rooms the room it must then join; tried
   * before they are offered. WRT-57: `leadsOut` marks a door or doorless opening written in a
   * side of which a part is onto the outside, and `word` the side each line writes.
   */
  readonly sideOffers = new Map<number, Array<{ text: string; onto?: string; leadsOut?: true; word?: string }>>()
  /** WRT-55: the lines that write, as data, for a refusal that stops the writing, by its line. */
  readonly stopFixes = new Map<number, RoomsFix[]>()
  /** WRT-55: the value worked out for each repeat line's setting written '*', from the round before. */
  private readonly fills: ReadonlyMap<number, number>
  /** WRT-55: each repeat line's setting written '*', as placed this round, and the row's length then. */
  readonly fillFound = new Map<number, { value: number; length: number; fill: number }>()
  /** WRT-55: the rows whose overrun of their street has been said. */
  private readonly overrunSaid = new Set<number>()
  /** WRT-55: the lines whose bare `open` the answer has said the room of. */
  private readonly openSaid = new Set<number>()
  /** WRT-51: the room beyond the wall each opening line was placed in, by its line; null for the outside. */
  readonly placedAt = new Map<number, string | null>()
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

  constructor(text: string, assumed: Map<string, number>, options: CompileOptions = {}, fills: ReadonlyMap<number, number> = new Map()) {
    this.lines = text.split(/\r\n|\r|\n/)
    this.assumed = assumed
    this.fills = fills
    const places = options.places ?? 4
    const scale = 10 ** places
    this.fix = places === 4 ? r4 : (v: number): number => {
      const r = Math.round(v * scale) / scale
      return Object.is(r, -0) || r === 0 ? 0 : r
    }
  }

  /** CNT-41: the plot, north and the site's things, from their own lines. */
  private readonly siteLines = new SiteLines()
  /** LVL-21: the stairs, from their own lines and `raw stair`. */
  private readonly stairLines = new StairLines()

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
      this.cur = newFloor('ground', 'Ground floor', 0, this.rule)
      this.cur.ahead = this.openedAhead(this.lines.map((text, i) => ({ line: i + 1, text })))
      this.floors.push(this.cur)
    }
    return this.cur
  }

  run(): WrittenPlan | null {
    this.plain = this.plainNumbers()
    let i = 0
    while (i < this.lines.length) {
      const at = i + 1
      const text = this.lines[i]!
      i++
      // WRT-48: every line starting `raw` is read here, so a kind raw does not take is named as such.
      // WRT-68: in any letter case, so `Raw stair` is refused for its kind and `Raw wall` for its capitals.
      const raw = /^\s*(raw)\b\s*([^\s{]*)\s*(.*)$/i.exec(text)
      if (raw) {
        const [, word, kind, rest] = raw as unknown as [string, string, string, string]
        const small = `raw ${kind.toLowerCase()}`
        if (RAW_KINDS.includes(kind.toLowerCase()) && `${word} ${kind}` !== small) {
          this.problem('rooms/raw', at, english(said('rooms.raw.smallLetters', { line: at, written: `${word} ${kind}`, offered: small })))
        } else if (word !== 'raw') this.rawKind(kind, at)
        else if (kind === 'floor') this.rawFloor(rest, at)
        else if (kind === 'pattern') this.stop('rooms/syntax', at, patternLine(at, false))
        else if (kind === 'wall' || kind === 'room' || kind === 'opening') this.rawPart(kind, rest, at)
        else if (kind === 'stair') this.stairLines.raw(rest, at)
        else this.rawKind(kind, at)
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
    this.rawFloors()
    this.wallRooms()
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
    if (keys === null) {
      this.stop('rooms/raw', at, `line ${at}: a raw floor is a JSON object holding only the floor's "roof", "parapet", "outline", "homes", "parking" and "level", as Grid's plan file holds them.`)
    }
    // WRT-14: a level that is no storey number (neither whole nor a half) is the plan file's own too.
    const known = [...RAW_FLOOR_KEYS, 'level']
    // WRT-48: each field it does not take is named, with where it goes when that is the floor line.
    for (const key of keys.filter((k) => !known.includes(k))) {
      const nearest = likelyMeant(key, known)
      const fix = FLOOR_KEYS.includes(key)
        ? said('rooms.raw.floorField.line', { field: key })
        : nearest !== null
          ? said('rooms.raw.unknownField.nearest', { nearest })
          : said('rooms.raw.unknownField.none')
      const field = said('rooms.raw.unknownField.named', { field: key })
      this.problem('rooms/raw', at, english(said('rooms.raw.floorField', { line: at, field, known: joined(known.map((k) => `"${k}"`), 'join.comma', 'join.and'), fix })))
    }
    // WRT-48: with no floor line above it, it is the one floor the text has, the ground floor (`emit` writes it).
    Object.assign(this.floor().extra, Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => known.includes(k))))
  }

  /** WRT-48: a `raw` line of a kind raw does not take, named, with where that part goes. */
  private rawKind(kind: string, at: number): void {
    if (kind === '') {
      this.problem('rooms/raw', at, english(said('rooms.raw.kind.nothing', { line: at })))
      return
    }
    const word = kind.toLowerCase().replace(/s$/, '')
    const where = Object.hasOwn(RAW_ELSEWHERE, word) ? RAW_ELSEWHERE[word]! : said('rooms.raw.kind.none')
    this.problem('rooms/raw', at, english(said('rooms.raw.kind', { line: at, kind, where })))
  }

  /**
   * WRT-48: each field of a raw part that Grid's plan file does not have, named with its line, the
   * nearest field Grid knows and the fields that place has, read from the schema (`readingNotes`).
   */
  private rawFields(kind: 'wall' | 'room' | 'opening', part: Record<string, unknown>, at: number): void {
    const list = kind === 'wall' ? 'walls' : kind === 'room' ? 'rooms' : 'openings'
    for (const note of readingNotes({ [list]: [part] })) {
      if (note.kind !== 'unknown-field') continue
      const place = note.at.replace(/^[a-z]+\[0\]\.?/, '')
      const word = (note.field ?? '').toLowerCase()
      const fix =
        place === '' && kind === 'wall' && CURVE_WORDS.has(word)
          ? said('rooms.raw.unknownField.arc')
          : place === '' && FACT_WORDS.has(word)
            ? said('rooms.raw.unknownField.properties')
            : note.nearest !== null && note.field !== null
              ? note.nearestWritten
                ? said('rooms.raw.unknownField.written', { field: note.field, nearest: note.nearest })
                : said('rooms.raw.unknownField.nearest', { nearest: note.nearest })
              : said('rooms.raw.unknownField.none')
      this.problem(
        'rooms/raw',
        at,
        english(
          said('rooms.raw.unknownField', {
            line: at,
            kind,
            id: String(part['id']),
            field: note.field === null ? said('rooms.raw.unknownField.unnamed') : said('rooms.raw.unknownField.named', { field: note.field }),
            place: place === '' ? '' : said('rooms.raw.unknownField.in', { place }),
            fix,
            known: joined(note.known.map((k) => `"${k}"`), 'join.comma', 'join.and'),
          })
        )
      )
    }
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
    let part = value as Record<string, unknown>
    // WRT-27: a raw wall or room with no floor is on the floor of the floor line above it, as a
    // room line is. An opening is on its wall's floor and states none.
    if (kind !== 'opening' && this.explicitFloors && part['floor'] === undefined) part = { ...part, floor: fl.id }
    // WRT-44: a raw wall whose two ends are one point has no length: refused with its line, never
    // left for a later step to throw on.
    if (kind === 'wall' && noLength(part['start'], part['end'], part['arc'])) {
      const at0 = part['start'] as [number, number]
      this.problem('rooms/raw', at, english(said('rooms.raw.zeroLength', { line: at, id: String(part['id']), x: metres(at0[0]), y: metres(at0[1]) })))
    }
    this.rawFields(kind, part, at)
    const list = kind === 'wall' ? fl.raw.walls : kind === 'room' ? fl.raw.rooms : fl.raw.openings
    list.push(part)
    this.rawIds.add(part['id'] as string)
    this.rawParts.push({ kind, part, line: at, under: fl.id })
  }

  /**
   * WRT-34: how the text's plain numbers are read, from its last display line, wherever it is
   * written, so a length above that line is read by the same rule. Raw parts are the plan file's
   * own JSON, in metres.
   */
  private plainNumbers(): PlainNumbers {
    let plain = PLAIN_METRES
    this.lines.forEach((text, i) => {
      if (!/^\s*display\b/.test(text)) return
      const { display, numbers } = displayOfWords(wordsOf(text, i + 1), i + 1)
      plain = { display: display.length ?? 'm', numbers }
    })
    return plain
  }

  /** WRT-27: a raw wall or room that names a floor the text does not write is refused with its line. */
  private rawFloors(): void {
    const floors = this.floors.map((f) => f.id)
    for (const { kind, part, line } of this.rawParts) {
      if (kind === 'opening' || part['floor'] === undefined) continue
      const floor = part['floor']
      if (typeof floor === 'string' && floors.includes(floor)) continue
      this.stop('rooms/unknown-floor', line, english(said('rooms.raw.unknownFloor', { line, kind, id: String(part['id']), floor: String(floor), floors: floors.join(', ') })))
    }
  }

  private statement(t: string[], at: number): void {
    const kw = t[0]!
    // CNT-41: the plot, north and the site's things (`site.ts`).
    if (SITE_LINE_WORDS.includes(kw)) return this.siteLines.read(t, quotedWordsOf(this.lines[at - 1] ?? '', at), at, this.plain)
    // LVL-21: a stair (`stairs.ts`), laid out once the rooms are drawn.
    if (STAIR_LINE_WORDS.includes(kw)) return this.stairLines.read(t, quotedWordsOf(this.lines[at - 1] ?? '', at), at, this.plain)
    switch (kw) {
      case 'plan':
        this.name = t[1] ?? null
        if (t.length > 2) this.planWords(t, at)
        return
      case 'building':
        if (t.length !== 2 || !BUILDINGS.includes(readBuilding(t[1]) as string)) this.stop('rooms/syntax', at, `line ${at}: write 'building <kind>': one of ${BUILDINGS.join(', ')}.`)
        this.building = readBuilding(t[1]) as BuildingType
        return
      case 'display':
        this.display = displayOfWords(t, at).display
        return
      case 'based':
        if (t[1] !== 'on' || t.length !== 3) this.stop('rooms/syntax', at, `line ${at}: write 'based on <revision>', as the read-back writes it.`)
        this.basedOn = t[2]!
        return
      case 'walls':
        this.readPairs(t.slice(1), at, { outside: 'outside', inside: 'inside', height: 'height' }, this.rule as unknown as Record<string, unknown>, true)
        this.rule.line = at
        this.wallsLine(at)
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
        this.tkinds.set(Math.round(numberOf(t[1]!, at, this.plain) * 1000), t[2] as WallKind)
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
        this.floor().openings.push(openingLine(t, at))
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
          `line ${at}: '${kw}' is not a word this way of writing knows. A line starts with one of: plan, building, based, walls, walltype, sizes, doors, windows, floor, room, wall, door, window, opening, unit, place, repeat, copy, rename, remove, raw, plot, site, street, setback, north, stair.`
        )
    }
  }

  /**
   * WRT-48: a plan line with words after its one name: the name in quotes is kept and the rest
   * named; a name not in quotes is offered in quotes with the words after it.
   */
  private planWords(t: string[], at: number): void {
    const quoted = quotedWordsOf(this.lines[at - 1] ?? t.join(' '), at)[1]?.quoted === true
    const extra = `'${t.slice(2).join(' ')}'`
    const offered = `plan ${quoteWords(quoted ? t[1]! : t.slice(1).join(' '))}`
    this.problem('rooms/syntax', at, english(said('rooms.plan.oneName', { line: at, extra, offered })))
  }

  /** WRT-48: each room a wall line names that is no room of its floor, there or written after it. */
  private wallRooms(): void {
    for (const { fl, room, line } of this.wallNames) {
      if (fl.rooms.has(room)) continue
      const ids = [...fl.rooms.keys()]
      const meant = likelyMeant(room, ids)
      const rooms = ids.length === 0 ? said('rooms.wall.unknownRoom.none') : joined(ids, 'join.comma')
      const nearest = meant === null ? '' : said('rooms.wall.unknownRoom.nearest', { nearest: meant })
      this.problem('rooms/unknown-room', line, english(said('rooms.wall.unknownRoom', { line, room, floor: fl.id, nearest, rooms })))
    }
  }

  /**
   * WRT-47: a walls line is for the floor it is written on while that floor has no rooms, and for
   * every floor after it. Written after a floor's rooms, it leaves that floor as it started, and says so.
   */
  private wallsLine(at: number): void {
    const fl = this.cur
    if (fl === null) return
    if (!started(fl)) {
      fl.rule = { ...this.rule }
      return
    }
    const was = fl.rule
    const now = this.rule
    const same = (a: number | null, b: number | null): boolean => (a === null ? b === null : b !== null && Math.abs(a - b) <= tolerance('diffLength'))
    if (same(was.outside, now.outside) && same(was.inside, now.inside) && same(was.height, now.height) && was.kind === now.kind) return
    const key: MessageKey = was.height === null ? 'rooms.wallsLate' : 'rooms.wallsLate.height'
    this.warn('rooms/walls-late', at, english(said(key, { line: String(at), floor: fl.id, outside: f2(was.outside), inside: f2(was.inside), height: f2(was.height ?? 0) })))
  }

  private readPairs(t: string[], at: number, keys: Record<string, string>, target: Record<string, unknown>, kinds: boolean): void {
    const known = joined([...Object.keys(keys), ...(kinds ? ['interior', 'partition'] : [])], 'join.comma')
    const refuse = (key: MessageKey, values: Values): never => this.stop('rooms/syntax', at, `line ${at}: ${english(said(key, values))}`)
    let i = 0
    while (i < t.length) {
      const w = t[i]!
      if (Object.hasOwn(keys, w) && i + 1 < t.length) {
        target[keys[w]!] = numberOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (kinds && KINDS.includes(w as WallKind)) {
        target['kind'] = w
        i++
      } else if (Object.hasOwn(keys, w)) {
        // WRT-69: a known word with nothing after it needs its value, not "is not understood".
        refuse('rooms.pairs.noValue', { word: w, known })
      } else if (Object.hasOwn(FLOOR_ONLY, w)) {
        refuse('rooms.pairs.floorWord', { word: w, value: FLOOR_ONLY[w]!, known })
      } else {
        refuse('rooms.pairs.unknown', { word: w, known })
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
      // WRT-69: a number in the name's place; offered as the level when it can be the storey number.
      const word = words[0].text
      const rest = words.slice(1)
      const storey = Number(word)
      if (Number.isInteger(storey * 2) && !rest.some((w) => !w.quoted && w.text === 'level')) {
        const named = rest[0]?.quoted === true ? [lineWord(rest[0])] : []
        const fixed = [`floor ${id.text}`, ...named, `level ${word}`, ...rest.slice(named.length).map(lineWord)].join(' ')
        refuse(say('rooms.floor.numberName.level', { word, line: fixed }))
      }
      refuse(say('rooms.floor.numberName', { word }))
    } else if (words[0] !== undefined && !FLOOR_KEYS.includes(words[0].text)) {
      // An unquoted name: the words up to the first setting, offered back in quotes.
      let end = 0
      while (end < words.length && (words[end]!.quoted || !FLOOR_KEYS.includes(words[end]!.text))) end++
      const fixed = [`floor ${id.text}`, quoteWords(words.slice(0, end).map((w) => w.text).join(' ')), ...words.slice(end).map(lineWord)].join(' ')
      refuse(say('rooms.floor.unquoted', { word: words[0].text, line: fixed }))
    }
    const fl = newFloor(id.text, name ?? id.text, this.floors.length === 0 ? 0 : this.floors.length, this.rule)
    fl.ahead = this.openedAhead(this.lines.slice(at).map((text, i) => ({ line: at + i + 1, text })))
    let copy: string[] | null = null
    const seen = new Set<string>()
    while (i < words.length) {
      const w = words[i]!
      const key = w.quoted ? '' : w.text
      if (w.quoted && name === null) {
        // WRT-69: the name written after the settings goes right after the id.
        const fixed = [`floor ${id.text}`, lineWord(w), ...words.filter((x) => x !== w).map(lineWord)].join(' ')
        refuse(say('rooms.floor.nameLate', { name: sayName(w.text), line: fixed }))
      }
      if (!FLOOR_KEYS.includes(key)) refuse(say('rooms.floor.unknown', { word: w.text }))
      if (key === 'copy') {
        // WRT-4: 'floor l4 "Fourth floor" level 4 copy l3', the floor and its copy on one line.
        copy = words.slice(i).map((x) => x.text)
        break
      }
      if (seen.has(key) || (key === 'name' && name !== null)) refuse(say('rooms.floor.twice', { word: key }))
      seen.add(key)
      const value = words[i + 1]
      if (value === undefined || (!value.quoted && FLOOR_KEYS.includes(value.text))) {
        refuse(say('rooms.floor.noValue', { word: key, takes: said(FLOOR_TAKES[key]!, { kinds: BUILDINGS.join(', ') }) }))
      }
      i += 2
      if (key === 'name') {
        name = value.text
        fl.name = name
      } else if (key === 'building') {
        const kind = readBuilding(value.text) as string
        if (!BUILDINGS.includes(kind)) refuse(say('rooms.floor.building', { word: value.text, kinds: BUILDINGS.join(', ') }))
        fl.building = kind as BuildingType
      } else if (key === 'level') {
        fl.level = this.storeyNumber(value.text, at, refuse)
      } else {
        let v: number
        try {
          v = numberOf(value.text, at, this.plain)
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
      // WRT-74: a number is one room's; the room it is on the floors above has none of its own.
      this.addRoom({ ...room, poly: [...room.poly], through: null, risenFrom: src.id, number: null }, null)
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
      // LVL-16: an opening between two rooms that both rise goes up with them, when every room its
      // line names rises too; one in a rising room's outside wall (a stair's door to the street) does not.
      for (const o of src.openings) {
        const [, , word, a, and, b] = o.words
        if (word !== 'between' || and !== 'and' || a === undefined || b === undefined) continue
        const rises = (id: string): boolean => risen.has(`${from}\u0000${id}`)
        if (rises(a) && rises(b) && o.words.slice(2).filter((w) => src.rooms.has(w)).every(rises)) fl.openings.push({ ...o, risen: true })
      }
    }
  }

  /**
   * LVL-16: the floors that copy another's rooms and took none of its doors and windows, nor
   * wrote their own, named in one warning by the floor they copy.
   */
  private warnCopiesWithoutOpenings(): void {
    const SHOWN = 10
    const bySource = new Map<string, string[]>()
    const own = (fl: FloorDraft): number => fl.openings.filter((o) => o.risen !== true).length + fl.raw.openings.length
    // A copy of a copy that took none is named too: its doors are on the floor the first copied.
    const warned = new Set<string>()
    for (const fl of this.floors) {
      if (fl.copied === null || fl.copied.openings || fl.rooms.size === 0 || own(fl) > 0) continue
      const src = this.floors.find((f) => f.id === fl.copied!.from)!
      if (own(src) === 0 && !warned.has(src.id)) continue
      warned.add(fl.id)
      bySource.set(src.id, [...(bySource.get(src.id) ?? []), fl.id])
    }
    if (bySource.size === 0) return
    const parts = [...bySource].map(([from, floors]) => {
      const shown = joined(floors.slice(0, SHOWN).map((id) => `'${id}'`), 'join.comma', 'join.and')
      const list = floors.length > SHOWN ? said('rooms.copyNoOpenings.more', { list: shown, count: floors.length - SHOWN }) : shown
      return said(floors.length === 1 ? 'rooms.copyNoOpenings.one' : 'rooms.copyNoOpenings.many', { floors: list, from })
    })
    this.warn('rooms/copy-no-openings', null, english(said('rooms.copyNoOpenings', { list: joined(parts, 'join.space') })))
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

  /**
   * WRT-41: the pairs of rooms the lines of one floor open by a `wall between ... virtual` line,
   * up to the next floor line. A unit's own lines and raw parts are passed over (a unit reads its
   * own when it is placed), and a line that cannot be read is left for its turn to say so.
   */
  private openedAhead(lines: ReadonlyArray<{ line: number; text: string }>): Set<string> {
    const pairs = new Set<string>()
    let inUnit = false
    for (const { line, text } of lines) {
      if (/^\s*raw\b/.test(text)) continue
      let words: string[]
      try {
        words = wordsOf(text, line)
      } catch (error) {
        if (error instanceof RoomsStop) continue
        throw error
      }
      if (inUnit) {
        if (words[0] === 'end') inUnit = false
        continue
      }
      if (words[0] === 'unit') inUnit = true
      else if (words[0] === 'floor') break
      else {
        const pair = openedPair(words)
        if (pair !== null) pairs.add(pair)
      }
    }
    return pairs
  }

  private gapBetween(room: RoomDraft, others: RoomDraft[], fl: FloorDraft = this.floor()): number {
    if (others.length === 1) {
      const key = pairKey(room.id, others[0]!.id)
      if (fl.open.has(key) || fl.ahead.has(key)) return 0
      const say = fl.between.get(key)
      if (say && say.t !== null) return say.t
    }
    // LVL-12, WRT-31: a room beside outdoor space (a courtyard, a terrace), or a unit's rooms
    // beside one, is set off by the building's outside wall. A building room's own walls may set
    // it; an outdoor space's own walls are its edges (a railing, a fence), never the building's.
    const outdoorPair = others.length > 0 && others.every((other) => facesOutdoor(room, other))
    const ts = [room, ...others]
      .filter((r) => !outdoorPair || r.outdoor === null)
      .map((r) => r.wallsT)
      .filter((t): t is number => t !== null)
    if (ts.length > 0) return Math.max(...ts)
    return outdoorPair ? fl.rule.outside : fl.rule.inside
  }

  /**
   * WRT-74: a room line's number and facts: `number <text>`, `dept <text>` (the fact
   * `department`) and `facts <name>=<value> ...`, each value typed as `factValueOf` reads it.
   * Refused in a unit, which is placed many times: each placed room is given its own with
   * grid_set_facts, by its id. Returns the index of the word after them.
   */
  private readRoomFacts(room: RoomDraft, t: readonly string[], i: number, at: number, ctx: PlaceCtx | null): number {
    const w = t[i]!
    if (ctx !== null) this.stop('rooms/syntax', at, english(said('rooms.room.factsInUnit', { line: at, word: w })))
    const facts = room.facts ?? {}
    const add = (name: string, value: string | number | boolean): void => {
      const first = Object.keys(facts).find((own) => factKey(own) === factKey(name))
      if (first !== undefined) this.stop('rooms/syntax', at, english(said('rooms.room.factTwice', { line: at, room: room.id, first, second: name })))
      facts[name] = value
      room.facts = facts
    }
    if (w === 'number') {
      if (room.number !== null) this.stop('rooms/syntax', at, english(said('rooms.room.factTwice', { line: at, room: room.id, first: 'number', second: 'number' })))
      room.number = t[i + 1]!
      return i + 2
    }
    if (w === 'dept') {
      add('department', t[i + 1]!)
      return i + 2
    }
    // The words as written, so a value keeps its accents and which half was in quotes is known.
    const written = quotedWordsOf(this.lines[at - 1] ?? '', at, true)
    const aligned = written.length === t.length
    let k = i + 1
    while (k < t.length && aligned && written[k]!.pair !== undefined) {
      const { name, value, valueQuoted } = written[k]!.pair!
      if (name.trim() === '') this.stop('rooms/syntax', at, english(said('rooms.room.factsForm', { line: at })))
      if (value.trim() === '') this.stop('rooms/syntax', at, english(said('rooms.room.factEmpty', { line: at, fact: name })))
      add(name, factValueOf(value, valueQuoted))
      k++
    }
    if (k === i + 1) this.stop('rooms/syntax', at, english(said('rooms.room.factsForm', { line: at })))
    return k
  }

  private readRoom(t: string[], at: number, ctx: PlaceCtx | null): RoomDraft {
    if (t.length < 4) this.stop('rooms/syntax', at, `line ${at}: write 'room <id> "<name>" <use> <width> x <depth> <where>'.`)
    const [, id, name, useWord] = t as [string, string, string, string]
    let use: RoomUse | undefined
    if (useWord === '-') use = undefined
    else if (roomUseOf(useWord) !== null) use = roomUseOf(useWord)!
    else if (useWord === 'outdoor' || (OUTDOOR_KINDS as readonly string[]).includes(useWord)) this.outdoorUse(t, at, useWord)
    else {
      this.stop('rooms/unknown-use', at, `line ${at}: '${useWord}' is not a room use Grid knows. Use one of: ${USES.join(', ')}; or '-' for none. The room's name keeps the person's own word: "Pooja room", "Bryggers".`)
    }
    const fl = this.floor()
    const room: RoomDraft = { id, name, use, line: at, poly: [], box: [0, 0, 0, 0], wallsT: null, wallsKind: null, height: null, floorOffset: null, firstWall: null, tenure: null, roomType: null, outdoor: null, roofed: null, conditioned: null, number: null, facts: null, size: null, through: null, risenFrom: null }
    const mx = ctx?.mx === true
    const my = ctx?.my === true
    let W: string | null = null
    let D: string | null = null
    let basis: SizeBasis | null = null
    let poly: P[] | null = null
    // WRT-62: a polygon with a unit in its points is taken as meant, as a size with its unit is.
    let polyMeant = false
    const place: { at?: P; dir?: string; ref?: string; align?: string; shift?: number; until?: string; untilNear?: boolean; inside?: string; corner?: string; open?: boolean; openTo?: string; wallT?: number; wallKind?: WallKind | null } = {}
    // WRT-55: a room goes in one place and has one size: a second is refused by name, never read over the first.
    const placedBy: string[] = []
    const sizedBy: string[] = []
    const once = (list: string[], words: string, key: 'rooms.room.placedTwice' | 'rooms.room.sizedTwice'): void => {
      if (list.length > 0) this.stop('rooms/syntax', at, english(said(key, { line: at, room: id, first: list[0]!, second: words })))
      list.push(words)
    }
    let i = 4
    while (i < t.length) {
      const w = t[i]!
      const m = /^([0-9.+\-*/()]+|\*)x([0-9.+\-*/()]+|\*)$/.exec(w)
      if (m) {
        once(sizedBy, w, 'rooms.room.sizedTwice')
        W = m[1]!
        D = m[2]!
        i++
      } else if (i + 2 < t.length && ['x', '×', 'by'].includes(t[i + 1]!) && (isNumberWord(w) || w === '*')) {
        once(sizedBy, t.slice(i, i + 3).join(' '), 'rooms.room.sizedTwice')
        W = w
        D = t[i + 2]!
        i += 3
      } else if (Object.hasOwn(BASIS_WORDS, w) && !(w === 'inside' && t[i + 2] === 'corner')) {
        basis = BASIS_WORDS[w]!
        i++
      } else if (w === 'polygon') {
        once(sizedBy, 'polygon', 'rooms.room.sizedTwice')
        poly = []
        i++
        // WRT-62: a point's lengths may carry their unit, as a size's do; one Grid cannot read is refused by its word.
        while (i < t.length && isPointWord(t[i]!)) {
          if (pointHasUnit(t[i]!)) polyMeant = true
          poly.push(pointOf(t[i]!, at, this.plain))
          i++
        }
        if (poly.length < 3) this.stop('rooms/syntax', at, `line ${at}: a polygon needs at least three points written x,y with no space, in metres or with a unit, such as 3.2,0 or 10ft,0ft.`)
      } else if (w === 'at' && i + 1 < t.length) {
        once(placedBy, `at ${t[i + 1]}`, 'rooms.room.placedTwice')
        place.at = pointOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (Object.hasOwn(DIRS, w) && i + 2 < t.length && t[i + 1] === 'of') {
        once(placedBy, t.slice(i, i + 3).join(' '), 'rooms.room.placedTwice')
        place.dir = w
        place.ref = t[i + 2]!
        i += 3
      } else if (w === 'align' && i + 1 < t.length) {
        place.align = t[i + 1]!
        i += 2
      } else if (w === 'shift' && i + 1 < t.length) {
        place.shift = numberOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (w === 'until' && i + 2 < t.length && t[i + 1] === 'near') {
        // WRT-55: stop at the near face of the room named, less the wall between.
        place.until = t[i + 2]!
        place.untilNear = true
        i += 3
      } else if (w === 'until' && i + 1 < t.length) {
        place.until = t[i + 1]!
        i += 2
      } else if (w === 'inside' && i + 3 < t.length && t[i + 2] === 'corner') {
        once(placedBy, t.slice(i, i + 4).join(' '), 'rooms.room.placedTwice')
        place.inside = t[i + 1]!
        place.corner = t[i + 3]!
        i += 4
      } else if (w === 'open') {
        place.open = true
        i++
        // WRT-55: 'open <room>' names the room it is open to.
        if (i < t.length && !Object.hasOwn(ROOM_LINE_WORDS, t[i]!) && !isNumberWord(t[i]!) && !Object.hasOwn(BASIS_WORDS, t[i]!)) {
          place.openTo = t[i]!
          i++
        }
      } else if (w === 'height' && i + 1 < t.length) {
        room.height = numberOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (w === 'floor' && i + 1 < t.length && isNumberWord(t[i + 1]!)) {
        room.floorOffset = numberOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (w === 'floor' && i + 1 < t.length) {
        // WRT-55: a storey is a floor line, and the rooms after it stand on it.
        this.stop('rooms/syntax', at, english(said('rooms.room.floorNamed', { line: at, floor: t[i + 1]! })))
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
      } else if (w === 'conditioned' || w === 'unconditioned') {
        room.conditioned = w === 'conditioned'
        i++
      } else if (w === 'type' && i + 1 < t.length) {
        room.roomType = t[i + 1]!
        i += 2
      } else if ((w === 'number' || w === 'dept' || w === 'facts') && (i + 1 < t.length || w === 'facts')) {
        i = this.readRoomFacts(room, t, i, at, ctx)
      } else if (w === 'through' && i + 1 < t.length) {
        if (ctx !== null) this.stop('rooms/syntax', at, `line ${at}: 'through <floor>' is written on a room line of its own, not inside a unit.`)
        room.through = t[i + 1]!
        i += 2
      } else if ((w === 'walls' || w === 'wall') && i + 1 < t.length) {
        const T = numberOf(t[i + 1]!, at, this.plain)
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
        const meant = roomWordMeant(t, i)
        this.stop(
          'rooms/syntax',
          at,
          english(said('rooms.room.unknown', { line: at, word: w, meant: meant === null ? '' : said('rooms.room.meant', { written: meant }), tenures: TENURES.join('|'), outdoor: OUTDOOR_KINDS.join('|') }))
        )
      }
    }
    // ARE-60: outdoor space is never under air, so the word is said to be read as nothing.
    if (room.conditioned !== null && room.outdoor !== null) {
      this.warn('rooms/conditioned-outdoor', at, english(said('rooms.room.conditionedNever', { line: at, room: sayName(id), word: room.conditioned ? 'conditioned' : 'unconditioned' })))
      room.conditioned = null
    }
    if (poly !== null) {
      // WRT-63: a polygon's points are its place, from the drawing's origin or the unit's; a place
      // written beside them is refused, never read as a move or dropped.
      if (placedBy.length > 0) {
        const from = place.at
        if (from !== undefined) {
          const points = `polygon ${poly.map((p) => `${metres(p[0] + from[0])},${metres(p[1] + from[1])}`).join(' ')}`
          this.stop('rooms/syntax', at, english(said('rooms.room.polygonAt', { line: at, room: id, at: placedBy[0]!, points })))
        }
        this.stop('rooms/syntax', at, english(said('rooms.room.polygonPlaced', { line: at, room: id, place: placedBy[0]! })))
      }
      let pts = poly
      if (mx) pts = pts.map((p) => [-p[0], p[1]] as P)
      if (my) pts = pts.map((p) => [p[0], -p[1]] as P)
      room.poly = cleanPoly(pts)
      room.box = boxOf([room.poly])
      if (!polyMeant) {
        this.side(at, id, 'width', room.box[2] - room.box[0], 'polygon')
        this.side(at, id, 'depth', room.box[3] - room.box[1], 'polygon')
      }
      if (place.open) this.openNamed(room, place.openTo, at, ctx)
      return room
    }
    if (W === null || D === null) this.stop('rooms/size', at, `line ${at}: room '${id}' has no size. Write '<width> x <depth>' (metres, or with a unit such as 12ft), inside faces, or 'polygon ...'.`)
    let Wn = W === '*' ? null : numberOf(W, at, this.plain)
    let Dn = D === '*' ? null : numberOf(D, at, this.plain)
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
    // WRT-47: what is taken off each side, so a room placed by its corner is placed by the corner its size measures to.
    const off = { west: 0, east: 0, south: 0, north: 0 }
    if (used !== 'inside') {
      // The size runs to the walls' centre lines or outside faces: take off the walls round it.
      const share = used === 'centre' ? 0.5 : 1
      const side = (s: string): number => (this.assumed.get(`${fl.id}|${id}|${s}`) ?? (room.wallsT ?? fl.rule.outside)) * share
      off.west = side('west')
      off.east = side('east')
      off.south = side('south')
      off.north = side('north')
      if (Wn !== null) Wn -= off.west + off.east
      if (Dn !== null) Dn -= off.south + off.north
      if ((Wn !== null && Wn <= 0) || (Dn !== null && Dn <= 0)) {
        this.stop('rooms/size', at, `line ${at}: room '${id}' measured to the walls' ${used === 'centre' ? 'centre lines' : 'outside faces'} leaves nothing inside them. Write a bigger size, or its inside size.`)
      }
      room.off = off
    }
    if (place.inside !== undefined) return this.placeInside(room, Wn, Dn, place, at, ctx)
    let box: Box
    if (place.open && place.dir === undefined) this.openNamed(room, place.openTo, at, ctx)
    if (place.at) {
      if (Wn === null || Dn === null) this.stop('rooms/size', at, `line ${at}: '*' needs a room to stretch to. With 'at', give both sizes.`)
      let [x0, y0] = place.at
      const Ww = Wn + off.west + off.east
      const Dw = Dn + off.south + off.north
      if (ctx !== null) {
        if (mx) x0 = -x0 - Ww
        if (my) y0 = -y0 - Dw
      }
      // WRT-55: a room of a unit too, so the wall it meets its neighbour by is the one the text means.
      if (used !== 'inside') room.drawn = [x0, y0, x0 + Ww, y0 + Dw]
      box = [x0 + off.west, y0 + off.south, x0 + off.west + Wn, y0 + off.south + Dn]
    } else if (place.dir !== undefined) {
      const { box: rbox, rooms: rrooms } = this.lookup(place.ref!, at, ctx)
      room.beside = rrooms.map((r) => r.id)
      let openOnto = false
      if (place.open) {
        if (place.openTo === undefined && rrooms.length !== 1) this.stop('rooms/syntax', at, english(said('rooms.room.openUnit', { line: at, ref: place.ref!, rooms: rrooms.map((r) => `'open ${r.id}'`).join(', ') })))
        const to = this.openNamed(room, place.openTo ?? rrooms[0]!.id, at, ctx, place.openTo === undefined ? 'beside' : null)
        openOnto = rrooms.some((r) => r.id === to) && rrooms.length === 1
      }
      const until = place.until !== undefined ? this.lookup(place.until, at, ctx) : null
      const ubox = until === null ? null : { box: until.box, near: place.untilNear === true ? true : null, gap: this.gapBetween(room, until.rooms) }
      const dir = place.dir
      const along = alongSized(room.off ?? null, marginsOf(rrooms, rbox), dir, place.align ?? null)
      let extent = false
      const boxAt = (gap: number): Box => this.relBox(Wn, Dn, dir, rbox, gap, place.align ?? null, (place.shift ?? 0) + along, ubox, at, () => (extent = true))
      if (openOnto) box = boxAt(0)
      else {
        // WRT-52: the rooms it will face, two by two; a dividing line between two of them takes no wall's width.
        const touching = boxAt(0)
        box = boxAt(this.gapAcross([{ room, box: touching }], touching, dir, rrooms) ?? this.gapBetween(room, rrooms))
      }
      // WRT-55: a room of a fixed length placed beside a row of units is the row's street.
      const across = (DIRS[dir]![0] === 0) as boolean
      if ((across ? Wn : Dn) !== null && ctx === null) {
        const row = this.floor().rows.find((x) => x.rooms.some((r) => rrooms.includes(r)) && (DIRS[x.d]![0] === 0) !== across)
        if (row !== undefined) this.rowOverrun(row, { ...room, box }, dir === 'north' ? 'south' : dir === 'south' ? 'north' : dir === 'east' ? 'west' : 'east', at)
      }
      if (extent) this.guesses.push(english(said('rooms.room.starExtent', { line: at, room: id, ref: place.ref!, side: said(Wn === null ? 'rooms.size.width' : 'rooms.size.depth'), length: num(f2(Wn === null ? box[2] - box[0] : box[3] - box[1])) })))
    } else {
      const pool = ctx !== null ? ctx.local : fl.rooms
      if (pool.size > 0) {
        this.stop('rooms/syntax', at, `line ${at}: room '${id}' does not say where it goes. Write 'at x,y' or, better, '<north|south|east|west> of <room>'. Only the first room may leave it out (it starts at 0,0).`)
      }
      if (Wn === null || Dn === null) this.stop('rooms/size', at, `line ${at}: '*' needs a room to stretch to.`)
      if (used !== 'inside') room.drawn = [0, 0, Wn + off.west + off.east, Dn + off.south + off.north]
      box = [off.west, off.south, off.west + Wn, off.south + Dn]
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

  /**
   * WRT-55: opens `room` to the room `to` names (`open <room>`), or refuses a bare `open` that has
   * no room to be open to. `how` says how a bare `open` found its room, which the answer says once.
   */
  private openNamed(room: RoomDraft, to: string | undefined, at: number, ctx: PlaceCtx | null, how: 'beside' | 'host' | null = null): string {
    if (to === undefined) this.stop('rooms/syntax', at, english(said('rooms.room.openWhich', { line: at, room: room.id })))
    const fl = this.floor()
    if (!(ctx?.local.has(to) ?? false) && !fl.rooms.has(to)) {
      const known = [...(ctx?.local.keys() ?? []), ...fl.rooms.keys()].filter((x) => x !== room.id)
      this.stop('rooms/unknown-room', at, english(said('rooms.room.openUnknown', { line: at, room: room.id, to, rooms: known.join(', ') || english(said('rooms.wall.unknownRoom.none')) })))
    }
    fl.open.add(pairKey(room.id, to))
    if (how !== null && !this.openSaid.has(at)) {
      this.openSaid.add(at)
      this.guesses.push(english(said(how === 'host' ? 'rooms.room.openHost' : 'rooms.room.openBeside', { line: at, room: room.id, to })))
    }
    return to
  }

  /**
   * WRT-55: outdoor space written in the use slot: refused with where its words go, and the line
   * written so when it is one line of the text (not a unit's line, written for every placement).
   */
  private outdoorUse(t: readonly string[], at: number, word: string): never {
    const fromName = t[2]!.toLowerCase().split(/[^a-z-]+/).find((x) => (OUTDOOR_KINDS as readonly string[]).includes(x))
    const kind = (OUTDOOR_KINDS as readonly string[]).includes(word) ? word : (fromName ?? 'other')
    const source = this.lines[at - 1]
    let written: string | null = null
    if (source !== undefined) {
      const m = /^(\s*room\s+\S+\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)\s+)(\S+)/.exec(source)
      if (m !== null && m[2]!.toLowerCase() === word) {
        const rest = source.slice(m[0].length)
        const hash = unquoted(rest, /#/)
        written = `${m[1]}-${(hash === null ? rest : rest.slice(0, hash.index)).trimEnd()} outdoor ${kind}`.trim()
        this.stopFixes.set(at, [{ line: at, text: written }])
      }
    }
    const offer = written === null ? '' : said('rooms.room.outdoorUse.offer', { written })
    this.stop('rooms/unknown-use', at, english(said('rooms.room.outdoorUse', { line: at, word, kind, kinds: OUTDOOR_KINDS.join(', '), offer })))
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

  /**
   * The box of a room placed `d` of the box `rb`. A side written `*` stretches as far as the room
   * named after `until` (`ub`): to its far face, or (WRT-55) to its near face less the wall
   * between when the line says `until near` or that room stands in the way of the stretch. With
   * no `until`, a `*` along the room it is placed beside takes that room's extent (`extent`).
   */
  private relBox(
    W: number | null,
    D: number | null,
    d: string,
    rb: Box,
    gap: number,
    alignIn: string | null,
    shift: number,
    ub: { box: Box; near: boolean | null; gap: number } | null,
    at: number,
    extent?: () => void
  ): Box {
    const horiz = d === 'east' || d === 'west'
    const align = alignIn ?? (horiz ? 'south' : 'west')
    const ok = horiz ? ['south', 'north', 'centre', 'center'] : ['west', 'east', 'centre', 'center']
    if (!ok.includes(align)) this.stop('rooms/syntax', at, `line ${at}: a room placed ${d} of another lines up by 'align ${ok[0]}', 'align ${ok[1]}' or 'align centre', not '${align}'.`)
    const need = (): { box: Box; near: boolean | null; gap: number } => ub ?? this.stop('rooms/size', at, `line ${at}: '*' means 'stretch this side'. Say how far with 'until <room>'.`)
    // How far a side stretched from `start` the way `sign` runs on `axis` (0 east-west, 1 north-south) reaches.
    const reach = (start: number, sign: 1 | -1, axis: 0 | 1, across: readonly [number, number] | null): number => {
      const u = need()
      const [lo, hi] = [u.box[axis]!, u.box[axis + 2]!]
      const ahead = sign > 0 ? lo >= start - eps() : hi <= start + eps()
      const inWay = across !== null && ahead && Math.min(across[1], u.box[3 - axis]!) - Math.max(across[0], u.box[1 - axis]!) > eps()
      if (u.near === true || inWay) return sign > 0 ? lo - u.gap : hi + u.gap
      return sign > 0 ? hi : lo
    }
    // A `*` across the way it is placed: to the room named after `until`, or along the room it is placed beside.
    const along = (start: number, axis: 0 | 1, sign: 1 | -1, across: readonly [number, number] | null): number => {
      if (ub !== null) return reach(start, sign, axis, across)
      extent?.()
      return sign > 0 ? rb[axis + 2]! : rb[axis]!
    }
    const centre = (axis: 0 | 1, size: number | null): [number, number] => {
      if (size === null) this.stop('rooms/syntax', at, `line ${at}: 'align centre' cannot be combined with '*'.`)
      const lo = (rb[axis]! + rb[axis + 2]!) / 2 - size / 2
      return [lo, lo + size]
    }
    // Along the way it is placed (`axis`), from the face of the room beside it.
    const away = (axis: 0 | 1, size: number | null, across: readonly [number, number] | null): [number, number] => {
      if (d === 'east' || d === 'north') {
        const lo = rb[axis + 2]! + gap
        return [lo, size !== null ? lo + size : reach(lo, 1, axis, across)]
      }
      const hi = rb[axis]! - gap
      return [size !== null ? hi - size : reach(hi, -1, axis, across), hi]
    }
    // Across it, lined up with the room beside it.
    const lined = (axis: 0 | 1, size: number | null, across: readonly [number, number] | null): [number, number] => {
      const [low, high] = axis === 1 ? ['south', 'north'] : ['west', 'east']
      let span: [number, number]
      if (align === low) span = [rb[axis]!, size !== null ? rb[axis]! + size : along(rb[axis]!, axis, 1, across)]
      else if (align === high) span = [size !== null ? rb[axis + 2]! - size : along(rb[axis + 2]!, axis, -1, across), rb[axis + 2]!]
      else span = centre(axis, size)
      return [span[0] + shift, span[1] + shift]
    }
    const [awaySize, acrossSize] = horiz ? [W, D] : [D, W]
    const [awayAxis, acrossAxis]: [0 | 1, 0 | 1] = horiz ? [0, 1] : [1, 0]
    let awaySpan: [number, number]
    let acrossSpan: [number, number]
    // WRT-55: the side that is known first, so a stretch can tell whether the room it runs to is in its way.
    if (awaySize !== null) {
      awaySpan = away(awayAxis, awaySize, null)
      acrossSpan = lined(acrossAxis, acrossSize, awaySpan)
    } else {
      acrossSpan = lined(acrossAxis, acrossSize, null)
      awaySpan = away(awayAxis, awaySize, acrossSpan)
    }
    const [x0, x1] = horiz ? awaySpan : acrossSpan
    const [y0, y1] = horiz ? acrossSpan : awaySpan
    return [x0, y0, x1, y1]
  }

  private placeInside(
    room: RoomDraft,
    W: number | null,
    D: number | null,
    place: { inside?: string; corner?: string; wallT?: number; wallKind?: WallKind | null; open?: boolean; openTo?: string },
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
    // WRT-31: outdoor space cut out of a room's corner (a recessed balcony) is set off by the
    // building's outside wall, as one placed beside a room is.
    const outdoorPair = facesOutdoor(room, host)
    const ownT = outdoorPair ? (room.outdoor === null ? room.wallsT : host.wallsT) : room.wallsT
    // WRT-55: 'open' on a room cut out of a corner opens it to its host, with no wall between.
    const openHost = place.open === true && (place.openTo ?? host.id) === host.id
    const T = openHost ? 0 : (place.wallT ?? ownT ?? (outdoorPair ? this.floor().rule.outside : this.floor().rule.inside))
    const cx = c.includes('e') ? hb[2] : hb[0]
    const cy = c.includes('n') ? hb[3] : hb[1]
    const sx = c.includes('e') ? -1 : 1
    const sy = c.includes('n') ? -1 : 1
    const k = host.poly.findIndex((p) => Math.abs(p[0] - cx) < eps() && Math.abs(p[1] - cy) < eps())
    if (k < 0) this.stop('rooms/inside-corner', at, `line ${at}: room '${host.id}' has no square corner at its ${c} to put '${room.id}' in (another room may already be there).`)
    const n = host.poly.length
    // The host's sides from the corner, C, rotated so the corner comes first: C, B, ..., A.
    const ring = [...host.poly.slice(k), ...host.poly.slice(0, k)]
    const C = ring[0]!
    const B = ring[1]!
    const A = ring[n - 1]!
    const dA = unit(sub(A, C))
    const dB = unit(sub(B, C))
    const sideA = norm(sub(A, C))
    const sideB = norm(sub(B, C))
    const sideX = Math.abs(dA[0]) > 0.5 ? sideA : sideB
    const sideY = Math.abs(dA[0]) > 0.5 ? sideB : sideA
    // WRT-66: a size, or a size and its wall, that comes to the whole side spans it: no wall
    // runs along a side that borders nothing of the host, so the room takes the whole side.
    const spans = (size: number, side: number) => Math.abs(size - side) < eps() || Math.abs(size + T - side) < eps()
    const spanX = spans(W, sideX)
    const spanY = spans(D, sideY)
    const fitsX = spanX || W + T < sideX - eps()
    const fitsY = spanY || D + T < sideY - eps()
    const sizes = { line: at, room: room.id, w: num(f2(W)), d: num(f2(D)), t: num(f2(T)), corner: c, host: host.id }
    if (spanX && spanY) this.stop('rooms/inside-corner', at, english(said('rooms.inside.fills', sizes)))
    if (!fitsX || !fitsY) {
      this.stop(
        'rooms/inside-corner',
        at,
        english(said('rooms.inside.noFit', { ...sizes, x: num(f2(sideX)), y: num(f2(sideY)), wFit: num(f2(sideX - T)), dFit: num(f2(sideY - T)) }))
      )
    }
    const w = spanX ? sideX : W
    const d = spanY ? sideY : D
    if ((spanX && Math.abs(W - sideX) >= eps()) || (spanY && Math.abs(D - sideY) >= eps())) {
      this.guesses.push(english(said('rooms.inside.wholeSide', { ...sizes, side: num(f2(spanX ? sideX : sideY)), size: num(f2(spanX ? W : D)) })))
    }
    const box: Box = [Math.min(cx, cx + sx * w), Math.min(cy, cy + sy * d), Math.max(cx, cx + sx * w), Math.max(cy, cy + sy * d)]
    const alongA = Math.abs(dA[0]) > 0.5 ? spanX : spanY
    const la = alongA ? sideA : (Math.abs(dA[0]) > 0.5 ? w : d) + T
    const lb = !alongA && (spanX || spanY) ? sideB : (Math.abs(dB[0]) > 0.5 ? w : d) + T
    const Ca = add(C, mul(dA, la))
    const Cb = add(C, mul(dB, lb))
    const Q = add(Ca, mul(dB, lb))
    let rest: P[]
    if (!spanX && !spanY) rest = [Ca, Q, Cb, ...ring.slice(1)]
    else {
      // A strip: the far end of the spanned side goes too, and the strip's inner corner, Q, must
      // stand on the host's next side beyond it, short of that side's end.
      const end = alongA ? A : B
      const next = alongA ? ring[n - 2]! : ring[2]!
      const across = alongA ? dB : dA
      const reach = alongA ? lb : la
      const onward = sub(next, end)
      if (n < 4 || Math.abs(cross(unit(onward), across)) > eps() || dot(onward, across) < reach + eps()) {
        this.stop('rooms/inside-corner', at, english(said('rooms.inside.noStrip', sizes)))
      }
      rest = alongA ? [Q, Cb, ...ring.slice(1, n - 1)] : [Ca, Q, ...ring.slice(2)]
    }
    host.poly = cleanPoly(rest)
    room.box = box
    room.poly = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]
    const kind = place.wallKind ?? (outdoorPair ? null : room.wallsKind)
    if (kind && !openHost) this.floor().between.set(pairKey(room.id, host.id), { t: T, kind, height: null, id: null, reversed: false, line: at })
    if (place.open === true) this.openNamed(room, place.openTo ?? host.id, at, ctx, place.openTo === undefined ? 'host' : null)
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
        say.height = numberOf(words[i + 1]!, at, this.plain)
        i += 2
      } else if (w === 'id' && i + 1 < words.length) {
        say.id = words[i + 1]!
        i += 2
      } else if (w === 'reversed') {
        say.reversed = true
        i++
      } else if (isNumberWord(w)) {
        say.t = numberOf(w, at, this.plain)
        this.statedT.add(say.t)
        i++
      } else {
        this.stop('rooms/syntax', at, english(said('rooms.wall.unknownWord', { line: at, word: w, kinds: `${KINDS.join(', ')}${allowVirtual ? ', virtual' : ''}` })))
      }
    }
    return say
  }

  private stWall(t: string[], at: number): void {
    const fl = this.floor()
    // WRT-48: a name that is no room yet is checked once every line is read (`wallRooms`).
    const named = t[1] === 'between' ? [t[2], t[4]] : [t[1]]
    for (const room of named) if (room !== undefined && !fl.rooms.has(room)) this.wallNames.push({ fl, room, line: at })
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
    const lines = this.expand(name, label, params, mx, my, at)
    // WRT-41: the unit's own dividing lines, wherever they are in it, place its rooms against each other.
    for (const { words } of lines) {
      const pair = openedPair(words)
      if (pair !== null) fl.ahead.add(pair)
    }
    for (const { line, words } of lines) {
      if (words[0] === 'room') this.addRoom(this.readRoom(words, line, ctx), ctx)
      else if (words[0] === 'door' || words[0] === 'window' || words[0] === 'opening') pending.push(openingLine(words, line))
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
      const dir = place.dir
      const along = alongSized(marginsOf(rooms, ub), marginsOf(rrooms, rbox), dir, place.align ?? null)
      const boxAt = (gap: number): Box => this.relBox(W, D, dir, rbox, gap, place.align ?? null, (place.shift ?? 0) + along, null, at)
      let gap = place.gap
      if (gap === undefined) {
        // WRT-52: the unit's rooms and the rooms it is placed beside that face each other, two by two.
        const touching = boxAt(0)
        const moved = rooms.map((r) => ({ room: r, box: [r.box[0] + touching[0] - ub[0], r.box[1] + touching[1] - ub[1], r.box[2] + touching[0] - ub[0], r.box[3] + touching[1] - ub[1]] as Box }))
        gap = this.gapAcross(moved, touching, dir, rrooms) ?? undefined
      }
      if (gap === undefined && this.unitOpensOnto(rooms, ub, dir, rrooms)) gap = 0
      if (gap === undefined) {
        const ts = [...rooms, ...rrooms].map((r) => r.wallsT).filter((t): t is number => t !== null)
        gap = ts.length > 0 ? Math.max(...ts) : fl.rule.inside
      }
      box = boxAt(gap)
    } else {
      if (fl.rooms.size > 0) this.stop('rooms/syntax', at, `line ${at}: say where unit '${label}' goes: 'at x,y' or '<north|south|east|west> of <room or unit>'.`)
      box = [0, 0, W, D]
    }
    const dx = box[0] - ub[0]
    const dy = box[1] - ub[1]
    for (const r of rooms) {
      r.poly = r.poly.map((p) => [p[0] + dx, p[1] + dy] as P)
      r.box = [r.box[0] + dx, r.box[1] + dy, r.box[2] + dx, r.box[3] + dy]
      if (r.drawn !== undefined) r.drawn = [r.drawn[0] + dx, r.drawn[1] + dy, r.drawn[2] + dx, r.drawn[3] + dy]
      this.addRoom(r, null)
    }
    fl.inst.set(label, rooms.map((r) => r.id))
    // CNT-4: a placement of a flat type is a flat, mirrored when it is placed mirrored (WRT-4).
    if (this.flatTypes.has(name)) fl.flats.push({ label, unit: name, mirrored: mx !== my, rooms })
    fl.openings.push(...pending)
  }

  /**
   * WRT-41: a unit placed beside a room goes against it, as a room line with `open` does, when
   * every room on the unit's side that faces it is open to one of the rooms it is placed beside.
   */
  private unitOpensOnto(rooms: readonly RoomDraft[], ub: Box, dir: string, beside: readonly RoomDraft[]): boolean {
    const fl = this.floor()
    const [dx, dy] = DIRS[dir]!
    // The unit's face toward the rooms it is placed beside: its south face when it goes north of them.
    const k = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3
    const facing = rooms.filter((r) => Math.abs(r.box[k] - ub[k]) < eps())
    return facing.length > 0 && facing.every((r) => beside.some((b) => fl.open.has(pairKey(r.id, b.id)) || fl.ahead.has(pairKey(r.id, b.id))))
  }

  /**
   * WRT-52: how far what is placed `dir` of the rooms `beside` goes from them, worked out for the
   * rooms that will face each other across the gap: on each side the ones with no room of their
   * own in front of them, whose extents overlap along it. Each two need the wall between them (a
   * dividing line or `open` takes none), less how far each stands back from its side's face; the
   * gap is the most any two need. Null when no two face each other, or when none need a gap at
   * all, which leaves the rule from before.
   */
  private gapAcross(placed: ReadonlyArray<{ room: RoomDraft; box: Box }>, own: Box, dir: string, beside: readonly RoomDraft[]): number | null {
    const [dx, dy] = DIRS[dir]!
    const horiz = dx !== 0
    // The face of what is placed toward the rooms beside, and theirs toward it.
    const k = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3
    const kb = dx > 0 ? 2 : dx < 0 ? 0 : dy > 0 ? 3 : 1
    const lo = horiz ? 1 : 0
    const hi = horiz ? 3 : 2
    const besideBox = boxOf(beside.map((r) => [[r.box[0], r.box[1]], [r.box[2], r.box[3]]] as P[]))
    const overlap = (a: Box, b: Box): boolean => Math.min(a[hi], b[hi]) - Math.max(a[lo], b[lo]) > eps()
    const front = <T>(items: ReadonlyArray<T>, boxOfItem: (x: T) => Box, back: (x: T) => number): Array<{ item: T; back: number }> =>
      items
        .map((item) => ({ item, back: back(item) }))
        .filter((x, _, all) => !all.some((y) => y !== x && y.back < x.back - eps() && overlap(boxOfItem(y.item), boxOfItem(x.item))))
    const ours = front(placed, (p) => p.box, (p) => Math.abs(p.box[k] - own[k]))
    const theirs = front(beside, (b) => b.box, (b) => Math.abs(b.box[kb] - besideBox[kb]))
    let most: number | null = null
    for (const p of ours) {
      for (const b of theirs) {
        if (!overlap(p.item.box, b.item.box)) continue
        const need = this.gapBetween(p.item.room, [b.item]) - p.back - b.back
        if (most === null || need > most) most = need
      }
    }
    return most === null || most < -eps() ? null : Math.max(0, most)
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
        place.at = pointOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (Object.hasOwn(DIRS, w) && i + 2 < t.length && t[i + 1] === 'of') {
        place.dir = w
        place.ref = t[i + 2]!
        i += 3
      } else if (w === 'align' && i + 1 < t.length) {
        place.align = t[i + 1]!
        i += 2
      } else if ((w === 'shift' || w === 'gap') && i + 1 < t.length) {
        place[w] = numberOf(t[i + 1]!, at, this.plain)
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
    const { words: all, ends } = this.endSettings(t.slice(named ? 8 : 6), at)
    // WRT-55: 'fill <length>': the setting written '*' is worked out so the row is that long.
    const f = all.indexOf('fill')
    const fill = f >= 0 && f + 1 < all.length ? numberOf(all[f + 1]!, at, this.plain) : null
    const words = f >= 0 ? [...all.slice(0, f), ...all.slice(f + 2)] : all
    const { place, params, mx, my } = this.readPlace(words, at)
    if (named && (place.at !== undefined || place.dir !== undefined)) {
      this.stop('rooms/syntax', at, `line ${at}: this repeat already starts ${d} of '${ref}'; say where the first goes only in the form without 'of': 'repeat <unit> <n> ${d} as ${label} at x,y'.`)
    }
    const starred = [...params].filter(([, value]) => value === '*').map(([key]) => key)
    let filled: { key: string; value: number } | null = null
    if (fill !== null || starred.length > 0) {
      const unitParams = this.units.get(t[1]!)?.params ?? new Map<string, string>()
      if (fill === null || starred.length !== 1 || fill <= 0) {
        const known = [...unitParams.keys()].map((key) => `${key}=*`)
        this.stop('rooms/syntax', at, english(said('rooms.repeat.fill', { line: at, settings: known.join(', ') || english(said('rooms.wall.unknownRoom.none')) })))
      }
      const key = starred[0]!
      const first = Number(unitParams.get(key))
      const value = this.fills.get(at) ?? (Number.isFinite(first) && first > 0 ? first : fill / n)
      if (!(value > 0)) this.stop('rooms/size', at, english(said('rooms.repeat.fillNone', { line: at, key, length: num(f2(fill)), count: n })))
      params.set(key, String(r4(value)))
      filled = { key, value: r4(value) }
    }
    const labels: string[] = []
    // WRT-55: a label counts from its digits and keeps their width (001, 002; A01, A02); one with none takes a number after it.
    const digits = /^(.*?)(\d+)$/.exec(label)
    for (let k = 0; k < n; k++) {
      const lab = digits !== null ? `${digits[1]}${String(Number(digits[2]) + k).padStart(digits[2]!.length, '0')}` : n > 1 ? `${label}${k + 1}` : label
      const settings = new Map(params)
      if (k === 0) for (const [key, value] of ends.first) settings.set(key, value)
      if (k === n - 1) for (const [key, value] of ends.last) settings.set(key, value)
      const where: UnitPlace = named ? { ...place, dir: d, ref: ref! } : k === 0 ? place : { dir: d, ref: ref!, ...(place.gap === undefined ? {} : { gap: place.gap }) }
      this.placeUnit(t[1]!, lab, where, settings, mx, my, at)
      labels.push(lab)
      ref = lab
    }
    const fl = this.floor()
    const rows = labels.flatMap((lab) => fl.inst.get(lab) ?? []).map((id) => fl.rooms.get(id)!)
    const row = { line: at, unit: t[1]!, count: n, d, rooms: rows, fill }
    if (filled !== null) this.fillFound.set(at, { value: filled.value, length: Compiler.rowLength(row), fill: fill! })
    // WRT-55: the room the first of the row is placed beside, across the row: the row's street.
    const firstPlace = named ? { dir: d, ref: t[5]! } : place
    if (firstPlace.dir !== undefined && firstPlace.ref !== undefined && (DIRS[firstPlace.dir]![0] === 0) !== (DIRS[d]![0] === 0)) {
      const street = fl.rooms.get(firstPlace.ref)
      if (street !== undefined) this.rowOverrun(row, street, firstPlace.dir, at)
    }
    fl.rows.push(row)
  }

  /** WRT-55: how many units a repeat line places. */
  fillCount(line: number): number {
    return this.floors.flatMap((fl) => fl.rows).find((row) => row.line === line)?.count ?? 1
  }

  /** WRT-55: how long a row of units is along the way it runs, to the faces its rooms' sizes measure to. */
  private static rowLength(row: { d: string; rooms: readonly RoomDraft[] }): number {
    const axis = DIRS[row.d]![0] === 0 ? 1 : 0
    const sized = row.rooms.map((r) => {
      const o = r.off ?? { west: 0, east: 0, south: 0, north: 0 }
      return axis === 0 ? [r.box[0] - o.west, r.box[2] + o.east] : [r.box[1] - o.south, r.box[3] + o.north]
    })
    return Math.max(...sized.map((x) => x[1]!)) - Math.min(...sized.map((x) => x[0]!))
  }

  /**
   * WRT-55: a row of units that runs past an end of the room it is placed beside (its street, a
   * corridor), said once for the row, first among the warnings: the front steps where it does.
   */
  private rowOverrun(row: { line: number; unit: string; count: number; d: string; rooms: readonly RoomDraft[] }, street: RoomDraft, side: string, at: number): void {
    if (this.overrunSaid.has(row.line) || row.rooms.length === 0) return
    const axis = DIRS[row.d]![0] === 0 ? 1 : 0
    const lo = Math.min(...row.rooms.map((r) => r.box[axis]!))
    const hi = Math.max(...row.rooms.map((r) => r.box[axis + 2]!))
    const past = [
      { by: hi - street.box[axis + 2]!, end: axis === 0 ? 'east' : 'north' },
      { by: street.box[axis]! - lo, end: axis === 0 ? 'west' : 'south' },
    ].sort((a, b) => b.by - a.by)[0]!
    if (past.by <= tolerance('joint')) return
    this.overrunSaid.add(row.line)
    const length = street.box[axis + 2]! - street.box[axis]!
    const values = { line: row.line, count: row.count, unit: row.unit, by: num(f2(past.by)), end: past.end, street: street.id, side, each: num(f2(past.by / row.count)), length: num(f2(length)) }
    this.warnings.unshift({ code: 'rooms/row-overrun', line: at, message: english(said('rooms.row.overrun', values)) })
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
    // WRT-47: a floor copied before it has rooms of its own is written by the walls its rooms were placed by.
    if (!started(fl)) fl.rule = { ...src.rule }
    // A room that rose through to this floor is here already (WRT-4).
    for (const r of src.rooms.values()) if (!(fl.rooms.get(r.id)?.risenFrom === (r.risenFrom ?? src.id))) this.addRoom({ ...r, poly: [...r.poly], through: null, risenFrom: r.risenFrom, number: null }, null)
    // LVL-16: the floor's outline, roof, parapet, homes and parking too, unless this floor set its own.
    for (const key of RAW_FLOOR_KEYS) if (src.extra[key] !== undefined && !(key in fl.extra)) fl.extra[key] = structuredClone(src.extra[key])
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
    if (rest !== '' && rest !== 'with openings') this.stop('rooms/syntax', at, `line ${at}: after the floor id only 'with openings' is understood.`)
    // LVL-16: an opening carried up with the rooms that rose through to this floor is here already.
    const here = new Set(fl.openings.map((o) => o.words[1]))
    if (rest === 'with openings') fl.openings.push(...src.openings.filter((o) => !here.has(o.words[1])).map((o) => ({ words: o.words, line: o.line, ...(o.name === undefined ? {} : { name: o.name }) })))
    fl.copied = { from: src.id, openings: rest === 'with openings' }
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
        if (e.room === f.room || dot(e.u, f.u) > 0) continue
        // CNT-36: faces that run the opposite way face each other when their distance apart
        // changes by no more than `roomsFaceSkew` along the shorter: corners written to the
        // centimetre on an angled side are never parallel to the arithmetic's own precision.
        const sine = Math.abs(cross(e.u, f.u))
        const skewed = sine > tolerance('parallel')
        // WRT-56: faces further out of parallel, up to `roomsFaceTurn`, are one wall's two faces
        // when they are no further apart than a wall all along what they share, as a scanned
        // room's are: a surveyed partition is never two outside walls laid over each other.
        const turned = skewed && sine * Math.min(e.L, f.L) > tolerance('roomsFaceSkew')
        if (turned && sine > tolerance('roomsFaceTurn')) continue
        const sa = dot(sub(f.q, e.p), e.u)
        const sb = dot(sub(f.p, e.p), e.u)
        const s0 = Math.max(0, Math.min(sa, sb))
        const s1 = Math.min(e.L, Math.max(sa, sb))
        // The distance apart at the middle of the stretch they share: the wall between lies there.
        const slope = skewed ? dot(f.u, e.n) / dot(f.u, e.u) : 0
        const mid = (s0 + s1) / 2
        const d = dot(sub(f.p, e.p), e.n) + (mid - sb) * slope
        if (d < -eps() || d > FACING_REACH) continue
        if (turned) {
          const ends = [d + (s0 - mid) * slope, d + (s1 - mid) * slope]
          if (Math.min(...ends) < -eps() || Math.max(...ends) > maxT + eps()) continue
        }
        if (s1 - s0 > eps()) e.cands.push({ s0, s1, d: Math.max(d, 0), f, ...(skewed ? { turn: { slope, mid, beyond: turned } } : {}) })
      }
    }
    let junc = fl.rule.outside
    const thicknessStated = (t: number): boolean =>
      [fl.rule.inside, fl.rule.outside, ...this.statedT, ...[...this.tkinds.keys()].map((k) => k / 1000)].some((s) => Math.abs(s - t) <= tolerance('diffLength'))
    // WRT-67: what a wall between two indoor rooms may be without a word: the inside thickness, or one a line states.
    const insideStated = (t: number): boolean =>
      [fl.rule.inside, ...this.statedT, ...[...this.tkinds.keys()].map((k) => k / 1000)].some((s) => Math.abs(s - t) <= tolerance('diffLength'))
    // WRT-31: what a wall between a room and outdoor space may be without a word: the outside thickness, or one a line states.
    const outsideStated = (t: number): boolean => [fl.rule.outside, ...this.statedT].some((s) => Math.abs(s - t) <= tolerance('diffLength'))
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
          // WRT-53: the end of a wall seen end on is that wall's however near the room beyond it
          // is: beside a shallow cut-out from a room's corner it is no wall to the room beyond.
          if (walled(x, y, c.d)) {
            taken.push([x, y])
            continue
          }
          if (c.d <= maxT + eps()) {
            e.cover.push({ s0: x, s1: y, d: c.d, f: c.f, ...(c.turn ? { turn: c.turn } : {}) })
            // WRT-17: a wall the text states may be seen end on across an outside face; a wall
            // only as thick as an odd gap between two rooms does not make every such stretch one.
            if (thicknessStated(c.d)) junc = Math.max(junc, c.d)
          } else if (c.d < 2 * fl.rule.outside + maxT) {
            const key = pairKey(e.room.id, c.f.room.id)
            if (!reported.has(key)) {
              reported.add(key)
              const [a, b] = (order.get(e.room.id)! < order.get(c.f.room.id)! ? [e.room, c.f.room] : [c.f.room, e.room]) as [RoomDraft, RoomDraft]
              this.problem('rooms/gap', b.line, this.gapSaid(a, b, c.d, y - x, e.n, maxT))
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
    const height = fl.height !== null ? null : fl.rule.height
    const raws: RawWall[] = []
    const pt = (e: Edge, s: number, off: number): P => [e.p[0] + e.u[0] * s + e.n[0] * off, e.p[1] + e.u[1] * s + e.n[1] * off]
    // WRT-56: the walls between two rooms whose sides are out of parallel are one thickness, the
    // gap the rooms leave there on average, so the pieces along sides written as facets of a curve
    // meet face to face.
    // Every stretch out of parallel between two such rooms is drawn so, the short ones too. A
    // thickness the text states that the gap passes through is the wall meant there: a 115 mm
    // partition between sides surveyed a little out of parallel stays 115 mm.
    const turnedT = new Map<string, number>()
    {
      const sums = new Map<string, { sum: number; len: number; lo: number; hi: number }>()
      const beyond = new Set<string>()
      for (const e of edges) {
        for (const c of e.cover) {
          if (!c.turn || order.get(e.room.id)! > order.get(c.f.room.id)!) continue
          const key = pairKey(e.room.id, c.f.room.id)
          const was = sums.get(key) ?? { sum: 0, len: 0, lo: Infinity, hi: -Infinity }
          const ends = [c.s0, c.s1].map((s) => c.d + (s - c.turn!.mid) * c.turn!.slope)
          sums.set(key, { sum: was.sum + c.d * (c.s1 - c.s0), len: was.len + (c.s1 - c.s0), lo: Math.min(was.lo, ...ends), hi: Math.max(was.hi, ...ends) })
          if (c.turn.beyond) beyond.add(key)
        }
      }
      for (const [key, { sum, len, lo, hi }] of sums) {
        if (!beyond.has(key)) continue
        const mean = sum / len
        const said = fl.between.get(key)?.t ?? null
        const stated = [...(said !== null ? [said] : []), fl.rule.inside, ...this.statedT, ...[...this.tkinds.keys()].map((k) => k / 1000)]
        const within = stated.filter((t) => t >= lo - tolerance('diffLength') && t <= hi + tolerance('diffLength'))
        const meant = said !== null && within.includes(said) ? said : within.sort((x, y) => Math.abs(x - mean) - Math.abs(y - mean))[0]
        turnedT.set(key, meant ?? mean)
      }
    }
    for (const e of edges) {
      const A = e.room
      for (const c of e.cover) {
        const B = c.f.room
        if (order.get(A.id)! > order.get(B.id)!) continue
        const key = pairKey(A.id, B.id)
        const turn = turnedT.has(key) ? c.turn : undefined
        let d = turn ? turnedT.get(key)! : c.d
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
          fl.rule.kind
        let virtual = false
        // WRT-55: a wall line between two rooms placed touching stands its wall on the line they share.
        const walling = spec !== undefined && spec.kind !== 'virtual' && (!fl.open.has(key) || spec.t !== null || spec.kind !== null)
        if (d < tolerance('roomsTouch') && walling) {
          d = spec.t ?? (facesOutdoor(A, B) ? fl.rule.outside : fl.rule.inside)
          if (!this.fromGap.has(`on|${key}`)) {
            this.fromGap.add(`on|${key}`)
            this.warn('rooms/wall-on-line', spec.line, english(said('rooms.wallOnLine', { line: spec.line, a: A.id, b: B.id, thickness: num(f2(d)), half: num(f2(d / 2)) })))
          }
        } else if (d < tolerance('roomsTouch')) {
          if (fl.open.has(key)) {
            virtual = true
            d = 0
            kind = 'interior'
          } else {
            const beside = (B.beside ?? []).includes(A.id) || (A.beside ?? []).includes(B.id)
            const open = beside ? said('rooms.touching.openBeside', { a: A.id, b: B.id }) : said('rooms.touching.openNamed', { a: A.id, b: B.id })
            this.problem('rooms/touching', B.line, english(said('rooms.touching', { a: A.id, aLine: A.line, b: B.id, bLine: B.line, along: num(f2(c.s1 - c.s0)), gap: (d * 1000).toFixed(0), open })))
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
        // WRT-67: between two indoor rooms the outside thickness is no inside wall's, and a wall
        // thicker than the one the rooms would be set apart by says the floor in it and the fix.
        if (!virtual && !(spec && spec.t !== null) && !this.fromGap.has(key)) {
          const values = { a: A.id, aLine: String(A.line), b: B.id, bLine: String(B.line), thickness: f2(d), inside: f2(fl.rule.inside), outside: f2(fl.rule.outside) }
          if (facesOutdoor(A, B) ? !thicknessStated(d) : !insideStated(d)) {
            this.fromGap.add(key)
            this.warn('rooms/wall-from-gap', B.line, english(said('rooms.wallFromGap', { ...values, ...this.gapWallTakes(edges, A, B, d, e.n) })))
          } else if (facesOutdoor(A, B) && !outsideStated(d)) {
            // WRT-31: the inside thickness is no outside wall's: rooms placed by hand left it.
            this.fromGap.add(key)
            this.warn('rooms/wall-from-gap', B.line, english(said('rooms.wallFromGap.outdoor', values)))
          }
        }
        const f = c.f
        // WRT-56: between faces out of parallel the wall runs midway between them. Each end is
        // midway between a corner and the other face: the corner of the other face where its
        // stretch ends there, else the point on this face, so the pieces between two sides
        // written as facets of one curve meet end to end.
        const gapAt = (s: number): number => (turn ? c.d + (s - turn.mid) * turn.slope : c.d)
        const fEnds = [dot(sub(f.p, e.p), e.u), dot(sub(f.q, e.p), e.u)]
        const end = (s: number): P => {
          if (!turn || fEnds.some((x) => Math.abs(x - s) <= eps())) return pt(e, s, gapAt(s) / 2)
          const on = pt(e, s, 0)
          return sub(on, mul(f.n, dot(sub(on, f.p), f.n) / 2))
        }
        const a = end(c.s0)
        const b = end(c.s1)
        if (turn && !virtual) this.noteTurned(fl, A, B, turn.beyond ? Math.abs(cross(e.u, f.u)) : 0, Math.max(...[c.s0, c.s1].map((s) => Math.abs(gapAt(s) - d))) / 2)
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
          ...(turn ? { turned: true } : {}),
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
      let T = fl.rule.outside
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
    this.checkOpenedShare(fl, edges)
    this.sideThicknesses(fl, edges, raws)
    this.warnTurned(fl)
    return { edges, raws }
  }

  /** WRT-56: a wall between faces out of parallel, the most they turn and how far its face is off them. */
  private noteTurned(fl: FloorDraft, A: RoomDraft, B: RoomDraft, sine: number, off: number): void {
    const pairs = this.turned.get(fl.id) ?? new Map<string, { a: string; b: string; sine: number; off: number }>()
    this.turned.set(fl.id, pairs)
    const key = pairKey(A.id, B.id)
    const had = pairs.get(key)
    pairs.set(key, { a: A.id, b: B.id, sine: Math.max(sine, had?.sine ?? 0), off: Math.max(off, had?.off ?? 0) })
  }

  /**
   * WRT-56: once a floor, the rooms whose sides are out of parallel and got one wall between
   * them, drawn along their middle line: the rooms keep their corners as written.
   */
  private warnTurned(fl: FloorDraft): void {
    const SHOWN = 6
    const pairs = [...(this.turned.get(fl.id)?.values() ?? [])]
    if (pairs.length === 0) return
    const names = pairs.slice(0, SHOWN).map((p) => said('rooms.facesTurned.pair', { a: p.a, b: p.b }))
    const shown = joined(names, 'join.comma', 'join.and')
    const list = pairs.length > SHOWN ? said('rooms.facesTurned.more', { list: shown, count: pairs.length - SHOWN }) : shown
    const degrees = (Math.asin(Math.min(1, Math.max(...pairs.map((p) => p.sine)))) * 180) / Math.PI
    const off = Math.max(...pairs.map((p) => p.off))
    this.warn(
      'rooms/faces-turned',
      null,
      english(said('rooms.facesTurned', { floor: fl.id, list, degrees: num(degrees.toFixed(1)), off: num(((off * 1000)).toFixed(0)) }))
    )
  }

  /**
   * CNT-36: two rooms opened to each other (`open` on a room line, or a `virtual` wall line) share
   * a side, square or at an angle, or the line is refused by name: the rooms are never given an
   * outside wall each across the side the text opened.
   */
  private checkOpenedShare(fl: FloorDraft, edges: Edge[]): void {
    const near = (id: string): string[] => [...new Set(edges.filter((e) => e.room.id === id).flatMap((e) => e.cover.map((c) => c.f.room.id)))].sort()
    for (const key of [...fl.open].sort()) {
      const [one, two] = key.split('\u0000') as [string, string]
      if (!fl.rooms.has(one) || !fl.rooms.has(two) || near(one).includes(two)) continue
      const [A, B] = [fl.rooms.get(one)!, fl.rooms.get(two)!].sort((x, y) => x.line - y.line) as [RoomDraft, RoomDraft]
      const [a, b] = [A.id, B.id]
      const spec = fl.between.get(key) ?? [...fl.betweenSide].find(([k]) => k.startsWith(`${key}\u0000`))?.[1]
      const line = spec?.line ?? Math.max(A.line, B.line)
      const none = english(said('rooms.openNotShared.none'))
      const list = (id: string): string => near(id).map((x) => `'${x}'`).join(', ') || none
      this.problem('rooms/no-shared-wall', line, english(said('rooms.openNotShared', { line: String(line), a, b, aNear: list(a), bNear: list(b) })))
    }
  }

  /**
   * WRT-47: the wall a side of a room sized to centre lines or outside faces is taken to have
   * next round. Two such rooms placed by their corners, whose sizes meet on one line, have the
   * wall the text means for the two between them, its centre line on the line they meet on, not
   * the gap this round's guess left; any other wall is as thick as it came out.
   */
  private meantBetween(fl: FloorDraft, e: Edge, r: RawWall): { t: number; meets: boolean } {
    const asBuilt = { t: r.t, meets: false }
    if (r.ext || r.virtual || r.rooms.length !== 2) return asBuilt
    const [A, B] = r.rooms as [RoomDraft, RoomDraft]
    // WRT-55: two rooms sized to their outside faces, one placed beside the other, meet on the
    // line between them too, so their sizes add up as two placed by their corners do.
    const outside = A.size?.basis === 'outside' && B.size?.basis === 'outside' && (A.drawn === undefined || B.drawn === undefined)
    if (!outside && (A.drawn === undefined || B.drawn === undefined || !boxesMeet(A.drawn, B.drawn))) return asBuilt
    const key = pairKey(A.id, B.id)
    const spec = fl.betweenSide.get(`${key}\u0000${e.room.id}\u0000${compassOf(e.n)}`) ?? fl.between.get(key)
    if (spec && spec.t !== null && spec.kind !== 'virtual') return { t: spec.t, meets: true }
    if (outside) return { t: r.t, meets: true }
    return { t: this.gapBetween(A, [B], fl), meets: true }
  }

  /**
   * WRT-55: the size of each of two rooms written `w x d` that makes it `by` larger toward the
   * other across a gap whose normal is `n`, as its line would write it, the later room first.
   */
  private closingSizes(a: RoomDraft, b: RoomDraft, by: number, n: P): Said[] {
    const wide = Math.abs(n[0]) > 0.5
    const plain = this.plain.numbers === 'm' || (this.plain.numbers === null && this.plain.display === 'm')
    const word = (v: number): string => (plain ? String(r4(v)) : `${r4(v)}m`)
    return [b, a].flatMap((r) => {
      if (r.size === null || r.size.w === null || r.size.d === null) return []
      const size = wide ? `${word(r.size.w + by)} x ${word(r.size.d)}` : `${word(r.size.w)} x ${word(r.size.d + by)}`
      return [said('rooms.gap.size', { room: r.id, size })]
    })
  }

  /**
   * WRT-67: what a wall `d` thick from the gap between rooms `a` and `b` takes past the wall they
   * would be set apart by, along every stretch they share on the floor, and the fix: the sizes
   * that close the gap to that wall, or how far to move a room. A thinner wall takes no floor.
   */
  private gapWallTakes(edges: readonly Edge[], a: RoomDraft, b: RoomDraft, d: number, n: P): Values {
    const wall = this.gapBetween(b, [a])
    const by = d - wall
    if (by <= tolerance('diffLength')) return { floor: '', fix: said('rooms.wallFromGap.move') }
    let along = 0
    for (const e of edges) if (e.room === a) for (const c of e.cover) if (c.f.room === b) along += c.s1 - c.s0
    const floor = said('rooms.wallFromGap.floor', { more: num(f2(by)), wall: num(f2(wall)), along: num(f2(along)), area: num(f2(by * along)) })
    const offers = this.closingSizes(a, b, by, n)
    const fix = offers.length === 0 ? said('rooms.wallFromGap.moveBy', { by: num(f2(by)) }) : said('rooms.wallFromGap.closes', { by: num(f2(by)), sizes: joined(offers, 'join.commaOr') })
    return { floor, fix }
  }

  /**
   * WRT-55: two rooms that leave a gap too wide for one wall, with the size of each that closes it
   * to the wall between them, as its line would write it.
   */
  private gapSaid(a: RoomDraft, b: RoomDraft, d: number, along: number, n: P, widest: number): string {
    const wall = this.gapBetween(b, [a])
    const by = d - wall
    const offers = this.closingSizes(a, b, by, n)
    const closes = offers.length === 0 ? said('rooms.gap.close') : said('rooms.gap.closes', { wall: num(f2(wall)), by: num(f2(by)), sizes: joined(offers, 'join.commaOr') })
    return english(said('rooms.gap', { a: a.id, aLine: a.line, b: b.id, bLine: b.line, gap: num(f2(d)), along: num(f2(along)), widest: num(String(widest)), closes }))
  }

  /** What each side of a room sized to centre lines or outside faces turned out to have. */
  private sideThicknesses(fl: FloorDraft, edges: Edge[], raws: RawWall[]): void {
    for (const e of edges) {
      const room = e.room
      if (room.size === null || room.size.basis === 'inside' || room.poly.length !== 4) continue
      const along = new Map<number, number>()
      const meeting = new Set<number>()
      for (const r of raws) {
        for (const [idx, s0, s1] of r.sides) {
          if (idx !== e.idx) continue
          const { t, meets } = this.meantBetween(fl, e, r)
          along.set(t, (along.get(t) ?? 0) + (s1 - s0))
          if (meets) meeting.add(t)
        }
      }
      let best = fl.rule.outside
      let most = -1
      // WRT-47: a side that meets other rooms on its line takes the wall shared there, however
      // long its outside stretch: the rooms on both sides are placed by that line.
      for (const [t, len] of along) if ((meeting.size === 0 || meeting.has(t)) && len > most + eps()) [best, most] = [t, len]
      // A room sized to its outside faces that meets another on a line gives up half the wall
      // there, its centre line on that line, so the two sizes add up.
      if (room.size.basis === 'outside' && meeting.has(best)) best /= 2
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
          const move = ox <= oy ? said('rooms.overlap.eastWest', { room: b.id, by: num(f2(ox)) }) : said('rooms.overlap.northSouth', { room: b.id, by: num(f2(oy)) })
          // WRT-55: a corner is offered only to a room that fits inside the other.
          // WRT-66: or as wide or as deep as the other, cut across it as a strip.
          const fitsX = bb[2] - bb[0] < ab[2] - ab[0] + eps()
          const fitsY = bb[3] - bb[1] < ab[3] - ab[1] + eps()
          const fits = fitsX && fitsY && (bb[2] - bb[0] < ab[2] - ab[0] - eps() || bb[3] - bb[1] < ab[3] - ab[1] - eps())
          const corner = fits ? said('rooms.overlap.corner', { a: a.id, b: b.id }) : ''
          this.problem('rooms/overlap', b.line, english(said('rooms.overlap', { a: a.id, aLine: a.line, b: b.id, bLine: b.line, ox: num(f2(ox)), oy: num(f2(oy)), move, corner })))
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
        // WRT-52: two rooms sized to centre lines or outside faces whose sizes as written line up
        // step only by what each took off for its own wall there (one beside a dividing line, one
        // beside a wall): their sizes add up.
        if (e.room.off !== undefined && f.room.off !== undefined) {
          const side = compassOf(e.n, DIRS) as keyof Margins
          if (Math.abs(dot(sub(f.p, e.p), e.n) + f.room.off[side] - e.room.off[side]) < tolerance('roomsFaceStep')) continue
        }
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
    // WRT-39: a crossing wall at a real angle reaches the line as far as half the line's own
    // thickness, so a thick outside wall along a row of rooms is seen across the ends of the
    // walls between them.
    const covered = (d: P, off: number, t: number, from: number, to: number): boolean => {
      const spans: Array<[number, number]> = []
      for (const o of raws) {
        if (o.virtual || Math.abs(cross(o.d!, d)) < tolerance('nearlyParallel')) continue
        const base: P = mul([-d[1], d[0]], off)
        const x = intersectLines(base, d, o.a, o.d!)
        if (x === null) continue
        const so = dot(sub(x, o.a), o.d!)
        const len = dot(sub(o.b, o.a), o.d!)
        const sin = Math.abs(cross(o.d!, d))
        const reach = sin >= tolerance('nearlyParallel') ? Math.max(maxT, t / 2 / sin) : maxT
        if (so < Math.min(0, len) - reach - eps() || so > Math.max(0, len) + reach + eps()) continue
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
        const joins = cur !== null && r.lo! - cur.hi <= maxT + eps() && (r.lo! - cur.hi <= eps() || covered(d, cross(d, r.a), r.t, cur.hi, r.lo!))
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
    // WRT-56: the pieces of one wall between sides out of parallel meet end to end as worked out:
    // nearly in line, neither is a wall the other's end stands in.
    const pieceKey = (w: DerivedWall): string | null => (w.raws.every((r) => r.turned === true) ? pairKey(w.raws[0]!.rooms[0]!.id, w.raws[0]!.rooms[1]!.id) : null)
    const pieces = (w: DerivedWall, o: DerivedWall): boolean => pieceKey(w) !== null && pieceKey(w) === pieceKey(o)
    for (const w of walls) {
      const ends: P[] = []
      const mine = roomsOf(w)
      for (const [end, sign] of [[w.a, -1], [w.b, 1]] as const) {
        // ARE-28: a dividing line ends where the two rooms it separates stop sharing an edge,
        // never carried on into the walls it meets: past there it would lie beside one room only.
        if (w.virtual) {
          ends.push(end)
          continue
        }
        // WRT-56: an end shared with the next piece of the same wall stays where the two meet.
        if (walls.some((o) => o !== w && pieces(w, o) && [o.a, o.b].some((x) => norm(sub(x, end)) <= eps()))) {
          ends.push(end)
          continue
        }
        const ray = mul(w.d, sign)
        let best: { tau: number; x: P; o: DerivedWall; half: number } | null = null
        const met: Array<{ tau: number; x: P; o: DerivedWall; half: number }> = []
        for (const o of walls) {
          if (o === w || Math.abs(cross(o.d, w.d)) < eps() || pieces(w, o)) continue
          const x = intersectLines(end, ray, o.a, o.d)
          if (x === null) continue
          const tau = dot(sub(x, end), ray)
          const so = dot(x, o.d)
          const half = (o.virtual ? 0 : o.t / 2) / Math.abs(cross(o.d, w.d))
          // WRT-39: an end at a room's corner lies half the other wall's thickness from its
          // centre line, and that wall's end half this wall's thickness short of the crossing,
          // each within `gap` as the check reads a corner reached: walls thicker than two widest
          // gaps meet as thin ones do. Only walls at a real angle, and never further than a
          // joined corner may reach (`mitreReach`): a wall nearly in line is met by neither.
          const angled = Math.abs(cross(o.d, w.d)) >= tolerance('nearlyParallel')
          const corner = (tolerance('mitreReach') * Math.max(w.t, o.t)) / 2
          const reach = angled ? Math.max(maxT, Math.min(half + tolerance('gap'), corner)) : maxT
          const along = angled ? Math.max(maxT, Math.min(w.t / 2 / Math.abs(cross(o.d, w.d)) + tolerance('gap'), corner)) : maxT
          if (tau < -reach - eps() || tau > reach + eps() || so < o.lo - along - eps() || so > o.hi + along + eps()) continue
          met.push({ tau, x, o, half })
        }
        // WRT-17: a wall whose body the end already stands in is the wall it meets, before a
        // nearer centre line past the end: an outside wall ends in the room's corner wall, not
        // across the corner of the room beside it.
        // WRT-39: a wall too thick for the widest gap's reach holds it within `gap`, so a corner
        // written to the millimetre (a polygon room) still holds its end. Thinner walls are met as
        // before, so a plan of them is written again as it was.
        const wide = (h: { half: number }): boolean => h.half > maxT
        const holds = (h: { tau: number; half: number }): boolean => Math.abs(h.tau) <= h.half + (wide(h) ? tolerance('gap') : eps())
        // WRT-39: and a solid wall the end stands in before a dividing line it stands on: where
        // two rooms open to each other and the outside turns a corner, the outside walls meet
        // each other, not the open line, which neither may run past into the room beyond.
        // Then the nearer, and of two such thick walls about as near (within `gap`) a wall of one
        // of its own rooms: where a room stands over the next one's wall, its own walls still meet
        // at its corner.
        type Hit = (typeof met)[number]
        const solid = (h: Hit): boolean => holds(h) && !h.o.virtual
        const own = (h: Hit): boolean => solid(h) && [...roomsOf(h.o)].some((room) => mine.has(room))
        const rank = (h: Hit): number => (holds(h) ? 2 : 0) + (solid(h) ? 1 : 0)
        const nearer = (h: Hit, b: Hit, by: number): boolean => Math.abs(h.tau) < Math.abs(b.tau) - by
        for (const hit of met) {
          const by = best !== null && wide(hit) && wide(best) ? tolerance('gap') : tolerance('noLength')
          const tie = best !== null && rank(hit) === rank(best) && !nearer(hit, best, by) && !nearer(best, hit, by)
          const better =
            best === null ||
            rank(hit) > rank(best) ||
            (rank(hit) === rank(best) && nearer(hit, best, by)) ||
            (tie && by > tolerance('noLength') && own(hit) && !own(best)) ||
            (tie && own(hit) === own(best) && nearer(hit, best, tolerance('noLength')))
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
    this.nameWalls(walls, edges, prefix, [...fl.rooms.keys()])
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
        // ARE-28: a dividing line keeps the ends of the edge its rooms share.
        if (A.w.virtual || B.w.virtual) continue
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

  /**
   * WRT-37: the floor's rooms in buildings, two rooms in one when a wall borders both. Each room
   * is given its building's mark: none for the building of the floor's first room, else the id
   * of the building's first room, in the text's order.
   */
  private buildingMarks(walls: DerivedWall[], order: string[]): Map<string, string> {
    const up = new Map<string, string>()
    const top = (id: string): string => {
      let r = id
      while (up.has(r) && up.get(r) !== r) r = up.get(r)!
      return r
    }
    const place = new Map(order.map((id, k) => [id, k]))
    const rank = (id: string): number => place.get(id) ?? order.length
    for (const w of walls) {
      const ids = w.raws.flatMap((r) => r.rooms.map((room) => room.id))
      for (const id of ids) if (!up.has(id)) up.set(id, id)
      for (const id of ids.slice(1)) {
        const [a, b] = [top(ids[0]!), top(id)]
        if (a === b) continue
        if (rank(a) <= rank(b)) up.set(b, a)
        else up.set(a, b)
      }
    }
    const first = order.length > 0 && up.has(order[0]!) ? top(order[0]!) : null
    return new Map([...up.keys()].map((id) => [id, top(id) === first ? '' : `${top(id)}-`]))
  }

  private nameWalls(walls: DerivedWall[], edges: Edge[], prefix: string, order: string[]): void {
    const names = new Map<string, DerivedWall[]>()
    const marks = this.buildingMarks(walls, order)
    for (const w of walls) {
      const mark = marks.get(w.raws[0]!.rooms[0]!.id) ?? ''
      const left: string[] = []
      const right: string[] = []
      for (const r of w.raws) {
        r.rooms.forEach((room, k) => {
          const e = edges[r.sides[k]![0]]!
          // A point just inside the room's face: a wall stood on the line two rooms touch on has both faces on its axis (WRT-55).
          const side = cross(w.d, sub(sub(e.p, mul(e.n, probe())), w.a)) > 0 ? left : right
          if (!side.includes(room.id)) side.push(room.id)
        })
      }
      w.sidesRooms = [left, right]
      let base: string
      if (w.ext) base = `ext-${mark}${compassOf(edges[w.raws[0]!.sides[0]![0]]!.n)}`
      else if (w.virtual) base = `open-${[...left, ...right].slice(0, 2).join('-')}`
      else if (left.length === 1 && right.length === 1) base = `w-${left[0]}-${right[0]}`
      else if (left.length === 1 || right.length === 1) {
        const one = left.length === 1 ? left[0]! : right[0]!
        let n: P = [0, 0]
        for (const r of w.raws) r.rooms.forEach((room, k) => {
          if (room.id === one) n = edges[r.sides[k]![0]]!.n
        })
        base = `w-${one}-${compassOf(n)}`
      } else if (Math.abs(w.d[0]) < tolerance('noLength')) base = `w-${mark}x${r4(w.a[0])}`
      else if (Math.abs(w.d[1]) < tolerance('noLength')) base = `w-${mark}y${r4(w.a[1])}`
      else base = `w-${mark}angled`
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

  /** WRT-51: a room's sides facing one way, in the order `<side>.<k>` counts them: from the west, then the south. */
  private static facing(edges: readonly Edge[], rid: string, side: string): Edge[] {
    const hits = edges.filter((e) => e.room.id === rid && dot(e.n, COMPASS[side]!) > 0.9)
    return hits.sort((a, b) => a.p[0] + a.q[0] - (b.p[0] + b.q[0]) || a.p[1] + a.q[1] - (b.p[1] + b.q[1]))
  }

  /** WRT-51: the word an opening line picks this side by: `east`, or `east.2` when more than one of the room's sides faces east. */
  private static sideWordOf(edges: readonly Edge[], e: Edge): string {
    const side = compassOf(e.n)
    const hits = Compiler.facing(edges, e.room.id, side)
    return hits.length > 1 ? `${side}.${hits.indexOf(e) + 1}` : side
  }

  /** WRT-51: what lies beyond a room's side: the rooms on the other face of its stretches of wall, and the outside where one has none. */
  private static beyondOf(raws: readonly RawWall[], e: Edge): { rooms: string[]; outside: boolean } {
    const rooms = new Set<string>()
    let outside = false
    for (const r of raws) {
      if (!r.sides.some((sd) => sd[0] === e.idx)) continue
      const other = r.rooms.filter((x) => x !== e.room)
      if (other.length === 0) outside = true
      for (const x of other) rooms.add(x.id)
    }
    return { rooms: [...rooms].sort(), outside }
  }

  /** WRT-51: what lies beyond a side, in words: "the wall to 'wc'", "the wall to the outside". */
  static beyondSaid(beyond: { rooms: string[]; outside: boolean }): Said {
    const list: Array<string | Said> = beyond.rooms.map((x) => `'${x}'`)
    if (beyond.outside || list.length === 0) list.push(said('rooms.rawRoom.outside'))
    return said('rooms.side.beyond', { list: joined(list, 'join.and') })
  }

  /**
   * WRT-51: an opening line as written with another place in place of `find` (a regular
   * expression for `in <room> <side>` or `between <a> and <b>`), or null when the line is not
   * written as the words read (a line of a unit, written once for every placement).
   */
  /**
   * WRT-65: a door between two rooms that 'opens in' or 'opens out' is refused, with a fix for each
   * room. The fix first is the room the words most often mean: 'out' out of the smaller room (a
   * toilet or a store opens out into the room beside it), 'in' into it; between two rooms the same
   * size, or one whose outline is not known, the room named second, which a door that says
   * nothing opens into.
   */
  private refuseInOutBetween(t: readonly string[], at: number, oid: string, how: 'in' | 'out', a: string, b: string, areaA: number | null, areaB: number | null): never {
    const same = areaA === null || areaB === null || Math.abs(areaA - areaB) < tolerance('areaEqual')
    const small = same || areaB! < areaA! ? b : a
    const large = small === a ? b : a
    const likely = how === 'out' ? large : small
    const other = likely === a ? b : a
    const offers = [likely, other].flatMap((room) => {
      const text = this.rewritten(t, at, /\bopens\s+(?:in|out)\b/, `opens into ${room}`)
      return text === null ? [] : [{ line: at, text }]
    })
    if (offers.length > 0) this.stopFixes.set(at, offers)
    const key: MessageKey = how === 'out' ? (same ? 'rooms.door.meant.outSecond' : 'rooms.door.meant.outSmaller') : same ? 'rooms.door.meant.inSecond' : 'rooms.door.meant.inSmaller'
    return this.stop('rooms/door-side', at, english(said('rooms.door.inOutBetween', { line: at, id: oid, how, a, b, meant: said(key, { room: small }), likely, other })))
  }

  private rewritten(t: readonly string[], at: number, find: RegExp, put: string): string | null {
    const source = this.lines[at - 1]
    if (source === undefined) return null
    let words: string[]
    try {
      words = wordsOf(source, at)
    } catch {
      return null
    }
    if (words.length < 4 || words.slice(0, 4).some((w, k) => w !== t[k]) || (t[2] === 'between' && words[5] !== t[5])) return null
    const m = unquoted(source, find)
    if (m === null) return null
    return `${source.slice(0, m.index)}${put}${source.slice(m.index + m[0].length)}`.trim()
  }

  private pickEdge(fl: FloorDraft, edges: Edge[], raws: readonly RawWall[], t: readonly string[], rid: string, sideWord: string, at: number): Edge {
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
    const hits = Compiler.facing(edges, rid, side)
    if (hits.length === 0) {
      this.stop('rooms/no-side', at, `line ${at}: room '${rid}' has no side facing ${side}. Its sides: ${mine.map((e) => `${Compiler.sideWordOf(edges, e)} (${f2(e.L)} m)`).join(', ')}.`)
    }
    if (hits.length === 1 && k === null) return hits[0]!
    if (k !== null && Number.isInteger(k) && k >= 1 && k <= hits.length) return hits[k - 1]!
    // WRT-51: more than one side faces that way. In a unit, the one side onto something that is
    // not one of the unit's own rooms (the corridor, the outside) is the one meant; else the line
    // does not say which, and each side is named with what lies beyond it.
    const beyond = hits.map((e) => Compiler.beyondOf(raws, e))
    const sides = hits.map((e, n) => said('rooms.side.one', { word: Compiler.sideWordOf(edges, e), length: num(f2(e.L)), beyond: Compiler.beyondSaid(beyond[n]!) }))
    const unit = k === null ? [...fl.inst].find(([, ids]) => ids.includes(rid)) : undefined
    if (unit !== undefined) {
      const own = new Set(unit[1])
      const onto = hits.filter((_, n) => beyond[n]!.outside || beyond[n]!.rooms.some((x) => !own.has(x)))
      if (onto.length === 1) {
        const e = onto[0]!
        const n = hits.indexOf(e)
        const others = hits.flatMap((f, m) => (f === e ? [] : [said('rooms.side.other', { word: Compiler.sideWordOf(edges, f), beyond: Compiler.beyondSaid(beyond[m]!) })]))
        this.guesses.push(
          english(said('rooms.side.unitGuess', { line: at, room: rid, count: hits.length, side, word: Compiler.sideWordOf(edges, e), beyond: Compiler.beyondSaid(beyond[n]!), unit: unit[0], others: joined(others, 'join.commaOr') }))
        )
        return e
      }
    }
    // WRT-57: a door or opening in a side partly onto the outside may be the way out, as an entrance
    // beside a room carved in the corner is: a line that leads it into a room instead is not offered alone.
    const leadsOut = (t[0] === 'door' || t[0] === 'opening') && beyond.some((b) => b.outside)
    const offers = hits.flatMap((e) => {
      const word = Compiler.sideWordOf(edges, e)
      const text = this.rewritten(t, at, new RegExp(`\\bin\\s+${escaped(rid)}\\s+${escaped(sideWord)}(?![\\w.])`), `in ${rid} ${word}`)
      return text === null ? [] : [{ text, word, ...(leadsOut ? { leadsOut: true as const } : {}) }]
    })
    if (offers.length > 0) this.sideOffers.set(at, offers)
    const list = joined(sides, 'join.semicolon')
    if (k === null) this.stop('rooms/no-side', at, english(said('rooms.side.many', { line: at, room: rid, count: hits.length, side, sides: list })))
    this.stop('rooms/no-side', at, english(said('rooms.side.noSuch', { line: at, room: rid, count: hits.length, side, word: sideWord, sides: list })))
  }

  /**
   * WRT-45: the words of a door, window or opening line after the wall it names: where along the
   * wall, how wide and the rest, read the same for a line placed by Grid's rooms and by a raw room.
   */
  private openingWords(t: string[], from: number, at: number, kind: Opening['type'], oid: string): OpeningWords {
    let i = from
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
        const dist = numberOf(w, at, this.plain)
        const comp = t[i + 2]!
        i += 3
        let ref: string | null = null
        if (i + 1 < t.length && t[i] === 'of') {
          ref = t[i + 1]!
          i += 2
        }
        pos = { centred: false, dist, comp, ref }
      } else if (i + 1 < t.length && t[i + 1] === 'wide') {
        width = numberOf(w, at, this.plain)
        i += 2
      } else if (w === 'sill' && i + 1 < t.length) {
        sill = numberOf(t[i + 1]!, at, this.plain)
        i += 2
      } else if (w === 'height' && i + 1 < t.length) {
        height = numberOf(t[i + 1]!, at, this.plain)
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
        part = { width: numberOf(t[i + 1]!, at, this.plain) }
        i += 2
        if (t[i] === 'x' && i + 1 < t.length) {
          part = { ...part, height: numberOf(t[i + 1]!, at, this.plain) }
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
    return { pos, width, sill, height, opens, hinged, openingKind, seenFrom, part }
  }

  /** A distance along a wall running `u` is measured from one of the two ways it runs, or the line is refused. */
  private measuredFrom(u: P, comp: string, at: number): void {
    if (!Object.hasOwn(COMPASS, comp)) this.stop('rooms/syntax', at, `line ${at}: measure from north, south, east or west, not '${comp}'.`)
    if (Math.abs(dot(u, COMPASS[comp]!)) < 0.3) {
      const runs = Math.abs(u[0]) > Math.abs(u[1]) ? 'east-west' : 'north-south'
      this.stop('rooms/syntax', at, `line ${at}: this wall runs ${runs}, so a distance along it is measured from ${runs === 'east-west' ? 'east or west' : 'north or south'}, not from ${comp}.`)
    }
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
          return `${A}'s ${Compiler.sideWordOf(edges, edges[side[0]]!)} side (${f2(side[2] - side[1])} m)`
        })
        // WRT-51: the line written with each of A's sides in place of 'between A and B', tried before it is offered.
        const offers = new Map<string, { text: string; onto?: string }>()
        for (const r of shared) {
          const word = Compiler.sideWordOf(edges, edges[r.sides[r.rooms[0]!.id === A ? 0 : 1]![0]]!)
          const text = this.rewritten(t, at, new RegExp(`\\bbetween\\s+${escaped(A)}\\s+and\\s+${escaped(B)}(?![\\w.-])`), `in ${A} ${word}`)
          if (text !== null && !offers.has(text)) offers.set(text, { text, onto: B })
        }
        if (offers.size > 0) this.sideOffers.set(at, [...offers.values()])
        this.stop('rooms/two-shared-walls', at, `line ${at}: '${A}' and '${B}' share ${shared.length} walls: ${desc.join('; ')}. Say which with 'in ${A} <side>' in place of 'between ${A} and ${B}'.`)
      }
      const r = shared[0]!
      const k = r.rooms[0]!.id === A ? 0 : 1
      e = edges[r.sides[k]![0]]!
      stretch = [r.sides[k]![1], r.sides[k]![2]]
      between = { A, B, r }
      i += 4
    } else if (i + 2 < t.length && t[i] === 'in') {
      e = this.pickEdge(fl, edges, raws, t, t[i + 1]!, t[i + 2]!, at)
      stretch = [0, e.L]
      i += 3
    } else {
      this.stop('rooms/syntax', at, `line ${at}: after the id write 'between <room> and <room>' or 'in <room> <side>'.`)
    }
    const { pos, width, sill, height, opens, hinged, openingKind, seenFrom, part } = this.openingWords(t, i, at, kind, oid)
    const u = e.u
    // WRT-55: a place measured along the room's side, or along one stretch of it, from that stretch's end.
    let alongStretch = false
    const placeOn = (): { s: number; fromEnd: 'lo' | 'hi' | null } => {
      if (pos.centred) return { s: (stretch[0] + stretch[1]) / 2 - width / 2, fromEnd: null }
      const { dist, comp, ref } = pos
      this.measuredFrom(u, comp, at)
      let [lo, hi] = alongStretch ? stretch : [0, e.L]
      if (ref !== null && ref !== e.room.id) {
        if (!fl.rooms.has(ref)) this.stop('rooms/unknown-room', at, `line ${at}: there is no room '${ref}' on floor '${fl.id}'.`)
        const cand = edges.filter((f) => f.room.id === ref && Math.abs(cross(f.u, u)) < tolerance('parallel') && Math.abs(dot(sub(f.p, e.p), e.n)) <= tolerance('roomsWallWidest') + eps())
        if (cand.length === 0) this.stop('rooms/no-side', at, `line ${at}: room '${ref}' has no side along this wall to measure from.`)
        const f = cand.reduce((x, y) => (y.L > x.L ? y : x))
        ;[lo, hi] = [dot(sub(f.p, e.p), u), dot(sub(f.q, e.p), u)].sort((x, y) => x - y) as [number, number]
      }
      const fromHi = dot(u, COMPASS[comp]!) > 0
      return { s: fromHi ? hi - dist - width : lo + dist, fromEnd: fromHi ? 'hi' : 'lo' }
    }
    let { s, fromEnd } = placeOn()
    // Which stretch of wall holds it.
    const mine: Array<[RawWall, [number, number, number]]> = []
    for (const r of raws) for (const sd of r.sides) if (sd[0] === e.idx) mine.push([r, sd])
    // WRT-55: between two rooms, a place measured along the room's side that falls outside the
    // stretch they share is measured along that stretch, from its end on that side.
    if (between !== null && !pos.centred && !(stretch[0] - eps() <= s && s + width <= stretch[1] + eps())) {
      alongStretch = true
      const tried = placeOn()
      if (stretch[0] - eps() <= tried.s && tried.s + width <= stretch[1] + eps()) {
        ;({ s, fromEnd } = tried)
        this.guesses.push(english(said('rooms.door.alongShared', { line: at, id: oid, a: between.A, b: between.B, length: num(f2(stretch[1] - stretch[0])), comp: pos.comp })))
      }
    }
    // WRT-55: a window written in a side that is partly the wall to another room goes in the side's
    // outside stretch, placed along it, unless it already stands in an outside stretch.
    if (kind === 'window' && between === null) {
      const outward = mine.filter(([r]) => r.rooms.length === 1 || (r.rooms.length === 2 && facesOutdoor(r.rooms[0]!, r.rooms[1]!)))
      const inOne = outward.some(([, sd]) => sd[1] - eps() <= s && s + width <= sd[2] + eps())
      if (outward.length > 0 && outward.length < mine.length && !inOne) {
        const [, sd] = outward.reduce((x, y) => (y[1][2] - y[1][1] > x[1][2] - x[1][1] ? y : x))
        stretch = [sd[1], sd[2]]
        alongStretch = true
        ;({ s, fromEnd } = placeOn())
        const inner = [...new Set(mine.filter(([r]) => !outward.some(([o]) => o === r)).flatMap(([r]) => r.rooms.map((x) => x.id)).filter((x) => x !== e.room.id))]
        this.guesses.push(english(said('rooms.window.outsideStretch', { line: at, id: oid, room: e.room.id, side: Compiler.sideWordOf(edges, e), length: num(f2(sd[2] - sd[1])), rooms: inner.map((x) => `'${x}'`).join(', ') })))
      }
    }
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
      // WRT-31: a window onto outdoor space is in an outside wall.
      if (other.length > 0 && !facesOutdoor(e.room, other[0]!)) this.warn('rooms/inside-window', at, `Line ${at}: window '${oid}' is in the wall between '${e.room.id}' and '${other[0]!.id}', not in an outside wall.`)
    } else {
      openingSill = r4(sill ?? 0)
      openingHeight = r4(height ?? this.dflt.doorH)
    }
    if (openingSill + openingHeight > wallHeight + tolerance('openingOverrun')) {
      this.problem('rooms/opening-too-high', at, openingTooHigh({ line: at, kind, id: oid, top: num(f2(openingSill + openingHeight)), height: num(f2(wallHeight)) }, wallHeight, null))
      return null
    }
    const item: { -readonly [K in keyof Opening]: Opening[K] } = { id: oid, wall: w.id, type: kind, offset: r4(offset), width: r4(width), sill: openingSill, height: openingHeight }
    if (openingKind !== null) item.kind = openingKind
    if (part !== null) item.opens = { width: r4(part.width), ...(part.height !== undefined ? { height: r4(part.height) } : {}) }
    // CNT-14: a door that slides, rolls or lifts needs no swing: nothing is guessed for it.
    const swingless = kind === 'door' && !sweepsFloor(doorKindOf(openingKind))
    let swing = ''
    if (kind === 'door' && opens === '<none') swing = '; no swing stated (Grid does not check its sweep; a drawing sheet marks it with a dashed line and "?", the working picture leaves a plain gap)'
    else if (kind === 'door' && swingless && opens === null && hinged === null) swing = `; ${openingKind}, which sweeps nothing`
    else if (kind === 'door') {
      const guessed: string[] = []
      let target: string | null
      if (opens === null && swingless) {
        target = null
      } else if (opens === null) {
        target = between ? between.B : e.room.id
        guessed.push(`opens into '${target}'`)
      } else if ((opens === '<out' || opens === '<in') && between !== null) {
        // WRT-55: between two rooms neither is the outside, so 'in' and 'out' say nothing: name the room.
        const areaOf = (room: string): number | null => {
          const draft = fl.rooms.get(room)
          return draft === undefined ? null : Math.abs(signedArea(draft.poly))
        }
        this.refuseInOutBetween(t, at, oid, opens === '<out' ? 'out' : 'in', between.A, between.B, areaOf(between.A), areaOf(between.B))
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
      swing = stated ? `; opens into ${target ?? 'the outside'}` : `; ${openingKind}, which sweeps nothing`
    }
    const joins = other.length > 0 ? `${e.room.id} and ${other[0]!.id}` : `${e.room.id} and the outside`
    const loName = compassOf([-u[0], -u[1]], DIRS)
    const hiName = compassOf(u, DIRS)
    this.openingFacts.push(`${oid}: ${kind} ${f2(width)} m in ${w.id}, joins ${joins}; ${f2(s)} m from ${e.room.id}'s ${loName} corner, ${f2(e.L - s - width)} m from its ${hiName} corner${swing}`)
    this.placedAt.set(at, other.length > 0 ? other[0]!.id : null)
    return item
  }

  /** WRT-45: the raw rooms on a floor: the ones written under its line, or that state it as their floor. */
  private rawRoomsOn(fl: FloorDraft): Set<string> {
    const ids = new Set<string>()
    for (const { kind, part } of this.rawParts) if (kind === 'room' && (!this.explicitFloors || part['floor'] === fl.id)) ids.add(String(part['id']))
    return ids
  }

  /** WRT-45: the rooms an opening line names: two after 'between', one after 'in'. */
  private static roomsNamed(t: readonly string[]): string[] {
    if (t[2] === 'between' && t[4] === 'and' && t.length > 5) return [t[3]!, t[5]!]
    if (t[2] === 'in' && t.length > 4) return [t[3]!]
    return []
  }

  /**
   * WRT-45: a door, window or opening line that names a raw room, placed once every wall of the
   * plan is known (`plan` is the plan as written so far, read; null when it cannot be read). The
   * wall is the one the two rooms share, or the one of the room whose outside face looks to the
   * side named; the place along it is measured from the wall's own ends. When the line does not
   * say which wall, it is refused by name with the raw opening line to write instead.
   */
  private resolveRawRoomOpening(plan: FloorPlan | null, fl: FloorDraft, t: string[], at: number, oid: string, planId: (local: string) => string): Opening | null {
    const kind = t[0] as Opening['type']
    const named = Compiler.roomsNamed(t)
    const rawIds = this.rawRoomsOn(fl)
    const between = t[2] === 'between'
    for (const x of named) {
      if (!rawIds.has(x) && !fl.rooms.has(x)) this.stop('rooms/unknown-room', at, english(said('rooms.rawRoom.unknown', { line: at, room: x, floor: fl.id, rooms: [...fl.rooms.keys(), ...rawIds].join(', ') })))
    }
    const { pos, width, sill, height, opens, hinged, openingKind, seenFrom, part } = this.openingWords(t, between ? 6 : 5, at, kind, oid)
    const openingSill = kind === 'window' ? r4(sill ?? this.dflt.winSill) : r4(sill ?? 0)
    const openingHeight = r4(height ?? (kind === 'window' ? this.dflt.winH : this.dflt.doorH))
    const rawName = named.find((x) => rawIds.has(x))!
    const pid = (x: string): string => (rawIds.has(x) ? x : planId(x))
    const roomOf = (x: string): Room | undefined => plan?.rooms.find((r) => r.id === pid(x) && (!this.explicitFloors || r.floor === fl.id))
    const wallsOf = (r: Room | undefined): string[] => (r === undefined ? [] : [...new Set([...r.boundary, ...(r.holes ?? []).flat()])])
    const rawLine = (wall: string | null, offset: number | null): string => {
      const fields = [`"id": ${JSON.stringify(oid)}`, `"wall": ${wall === null ? '"<wall>"' : JSON.stringify(wall)}`, `"type": "${kind}"`, `"offset": ${offset === null ? '<offset>' : metres(offset)}`, `"width": ${metres(width)}`, `"height": ${metres(openingHeight)}`]
      if (kind === 'window') fields.push(`"sill": ${metres(openingSill)}`)
      return `raw opening {${fields.join(', ')}}`
    }
    const refuse = (code: string, why: Said, wall: string | null = null, offset: number | null = null): never =>
      this.stop(code, at, english(said('rooms.rawRoom.refused', { line: at, room: rawName, why, kind, raw: rawLine(wall, offset), walls: wallsOf(roomOf(rawName)).join(', ') })))
    if (plan === null) return refuse('rooms/raw', said('rooms.rawRoom.notRead'))
    const index = indexPlan(plan)
    const lengthOf = (w: Wall): number | null => {
      try {
        return wallLength(w)
      } catch {
        return null
      }
    }
    const polyOf = (r: Room): Vec2[] | null => tryRoomPolygon(r, index)
    // Whether a point just past one face of the wall, at `s` along it, lies in the room: 1 the left face, -1 the right.
    const past = (w: Wall, s: number, side: 1 | -1, poly: readonly Vec2[]): boolean => {
      const f = wallFrameAt(w, s)
      const off = side * (w.thickness / 2 + tolerance('stepPastFace'))
      return pointInPolygon({ x: f.point.x + f.normal.x * off, y: f.point.y + f.normal.y * off }, poly)
    }
    let wall: Wall | undefined
    if (between) {
      const other = named.find((x) => x !== rawName) ?? named[1]!
      const theirs = new Set(wallsOf(roomOf(named[1]!)))
      const shared = wallsOf(roomOf(named[0]!)).filter((w) => theirs.has(w))
      if (shared.length === 0) return refuse('rooms/no-shared-wall', said('rooms.rawRoom.noShared', { other }))
      if (shared.length > 1) return refuse('rooms/two-shared-walls', said('rooms.rawRoom.manyShared', { count: shared.length, other, walls: shared.join(', ') }))
      wall = index.wallsById.get(shared[0]!)
      if (wall === undefined) return refuse('rooms/raw', said('rooms.rawRoom.notDrawn'))
    } else {
      const side = t[4]!
      if (!Object.hasOwn(COMPASS, side)) this.stop('rooms/syntax', at, english(said('rooms.rawRoom.badSide', { line: at, side })))
      const room = roomOf(named[0]!)
      const poly = room === undefined ? null : polyOf(room)
      if (poly === null) return refuse('rooms/raw', said('rooms.rawRoom.notDrawn'))
      const facing = wallsOf(room).filter((id) => {
        const w = index.wallsById.get(id)
        const L = w === undefined ? null : lengthOf(w)
        if (w === undefined || L === null) return false
        const f = wallFrameAt(w, L / 2)
        const sign = past(w, L / 2, 1, poly) ? -1 : 1
        return dot([sign * f.normal.x, sign * f.normal.y], COMPASS[side]!) >= S2 - eps()
      })
      if (facing.length === 0) return refuse('rooms/no-side', said('rooms.rawRoom.noSide', { side }))
      if (facing.length > 1) return refuse('rooms/no-side', said('rooms.rawRoom.manySides', { count: facing.length, side, walls: facing.join(', ') }))
      wall = index.wallsById.get(facing[0]!)!
    }
    const L = lengthOf(wall)
    if (L === null) return refuse('rooms/raw', said('rooms.rawRoom.notDrawn'), wall.id)
    const chord = unit([wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]])
    let offset: number
    let fromEnd: 'start' | 'end' | null = null
    if (pos.centred) offset = (L - width) / 2
    else {
      if (pos.ref !== null && pos.ref !== rawName) return refuse('rooms/no-side', said('rooms.rawRoom.measuredOf', { ref: pos.ref }), wall.id)
      this.measuredFrom(chord, pos.comp, at)
      fromEnd = dot(chord, COMPASS[pos.comp]!) > 0 ? 'end' : 'start'
      offset = fromEnd === 'end' ? L - pos.dist - width : pos.dist
    }
    if (offset < -eps() || offset + width > L + eps()) {
      this.problem('rooms/opening-fit', at, english(said('rooms.rawRoom.fit', { line: at, kind, id: oid, width: num(f2(width)), from: num(f2(offset)), to: num(f2(offset + width)), wall: wall.id, length: num(f2(L)) })))
      return null
    }
    if (openingSill + openingHeight > wall.height + tolerance('openingOverrun')) {
      this.problem('rooms/opening-too-high', at, openingTooHigh({ line: at, kind, id: oid, top: num(f2(openingSill + openingHeight)), height: num(f2(wall.height)) }, wall.height, wall.id))
      return null
    }
    const item: { -readonly [K in keyof Opening]: Opening[K] } = { id: oid, wall: wall.id, type: kind, offset: r4(offset), width: r4(width), sill: openingSill, height: openingHeight }
    if (openingKind !== null) item.kind = openingKind
    if (part !== null) item.opens = { width: r4(part.width), ...(part.height !== undefined ? { height: r4(part.height) } : {}) }
    // The rooms on the wall's two faces, by the plan's ids, as the plan's rooms name it.
    const onWall = plan.rooms.filter((r) => (!this.explicitFloors || r.floor === fl.id) && wallsOf(r).includes(wall.id))
    const first = pid(named[0]!)
    const outside = english(said('rooms.rawRoom.outside'))
    const joins = joined(onWall.length > 1 ? onWall.map((r) => r.id) : [onWall[0]?.id ?? first, outside], 'join.comma', 'join.and')
    const mid = offset + width / 2
    const faceOf = (room: string | null): 'left' | 'right' => {
      const r = onWall.find((x) => x.id === (room ?? first))
      const poly = r === undefined ? null : polyOf(r)
      if (poly === null) return refuse('rooms/raw', said('rooms.rawRoom.notDrawn'), wall.id, offset)
      const face = past(wall, mid, 1, poly) ? 'left' : past(wall, mid, -1, poly) ? 'right' : refuse('rooms/raw', said('rooms.rawRoom.notDrawn'), wall.id, offset)
      return room === null ? (face === 'left' ? 'right' : 'left') : face
    }
    const onIt = (room: string): boolean => onWall.some((r) => r.id === room)
    let note: Said | null = null
    const swingless = kind === 'door' && !sweepsFloor(doorKindOf(openingKind))
    if (kind === 'door' && opens === '<none') note = said('rooms.rawRoom.noSwing')
    else if (kind === 'door' && swingless && opens === null && hinged === null) note = said('rooms.rawRoom.sweepsNothing', { kind: String(openingKind) })
    else if (kind === 'door') {
      const guessed: Said[] = []
      const others = onWall.filter((r) => r.id !== first).map((r) => r.id)
      let target: string | null = null
      if (opens === null && !swingless) {
        target = pid(between ? named[1]! : named[0]!)
        guessed.push(said('rooms.rawRoom.guess.opens', { room: target }))
      } else if ((opens === '<out' || opens === '<in') && between) {
        // WRT-65: as for rooms Grid works out, 'in' and 'out' between two rooms say nothing.
        const areaOf = (room: string): number | null => {
          const r = roomOf(room)
          const poly = r === undefined ? null : polyOf(r)
          return poly === null ? null : Math.abs(signedArea(poly.map((p) => [p.x, p.y] as P)))
        }
        this.refuseInOutBetween(t, at, oid, opens === '<out' ? 'out' : 'in', named[0]!, named[1]!, areaOf(named[0]!), areaOf(named[1]!))
      } else if (opens === '<out') target = others[0] ?? null
      else if (opens === '<in') target = first
      else if (opens !== null) {
        target = pid(opens)
        if (!onIt(target)) this.stop('rooms/door-side', at, english(said('rooms.rawRoom.doorSide', { line: at, id: oid, target: opens, wall: wall.id, rooms: joins })))
      }
      const stated = !(opens === null && swingless)
      if (stated) item.swing = faceOf(target)
      if (hinged === null) {
        // A pair hangs from both jambs and a door that slides, rolls or lifts from neither: no guess.
        if (openingKind !== 'double' && !swingless) {
          item.hinge = fromEnd ?? 'start'
          guessed.push(said(fromEnd !== null ? 'rooms.rawRoom.guess.hingeMeasured' : 'rooms.rawRoom.guess.hingeStart'))
        }
      } else if (hinged === 'left' || hinged === 'right') {
        let from: string | null = target
        if (seenFrom !== null) {
          from = seenFrom === 'outside' ? null : pid(seenFrom)
          if (from !== null && !onIt(from)) this.stop('rooms/door-side', at, english(said('rooms.rawRoom.seenFrom', { line: at, id: oid, target: seenFrom, wall: wall.id, rooms: joins })))
        } else if (!stated) this.stop('rooms/syntax', at, english(said('rooms.rawRoom.hingedNeedsRoom', { line: at, hinged })))
        item.hinge = hingeSeenFrom(faceOf(from), hinged)
      } else {
        if (!Object.hasOwn(COMPASS, hinged) || Math.abs(dot(chord, COMPASS[hinged]!)) < 0.3) this.stop('rooms/syntax', at, english(said('rooms.rawRoom.hingedEnd', { line: at, hinged, wall: wall.id })))
        item.hinge = dot(chord, COMPASS[hinged]!) > 0 ? 'end' : 'start'
      }
      if (guessed.length > 0) this.guesses.push(english(said('rooms.rawRoom.guessed', { line: at, id: oid, list: joined(guessed, 'join.semicolon') })))
      note = stated ? said('rooms.rawRoom.opensInto', { room: target ?? outside }) : said('rooms.rawRoom.sweepsNothing', { kind: String(openingKind) })
    }
    this.openingFacts.push(english(said('rooms.rawRoom.fact', { id: oid, kind, width: num(f2(width)), wall: wall.id, joins, from: num(f2(offset)), to: num(f2(L - offset - width)), said: note ?? '' })))
    return item
  }

  // ------------------------------------------------------------------------------------------
  // The plan

  private emit(): WrittenPlan | null {
    const plan: { -readonly [K in keyof WrittenPlan]: WrittenPlan[K] } = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    // WRT-48: a raw floor with no floor line gives its fields to the one floor, which is written then.
    if (this.explicitFloors || this.floors.some((f) => Object.values(f.extra).some((v) => v !== null))) {
      plan.floors = this.floors.map((f) => ({
        id: f.id,
        name: f.name,
        level: f.level,
        ...(f.elevation !== null ? { elevation: f.elevation } : {}),
        ...(f.height !== null ? { height: f.height } : {}),
        ...(f.slab !== null ? { slab: f.slab } : {}),
        ...(f.building !== null ? { building: f.building } : {}),
        // LVL-16: a field set to null (a copied one taken off) is not written.
        ...(Object.fromEntries(Object.entries(f.extra).filter(([, v]) => v !== null)) as Pick<NonNullable<FloorPlan['floors']>[number], 'roof' | 'parapet' | 'outline' | 'homes' | 'parking'>),
      }))
    }
    if (this.building !== null) plan.building = this.building
    if (this.display !== null) plan.display = this.display
    const multi = this.floors.length > 1
    for (const fl of this.floors) fl.openings = carriedKept(fl)
    this.warnCopiesWithoutOpenings()
    // An id written on two floors stays as written on the first floor that writes it (LVL-16), and
    // takes its floor's id in front on the others, so it stays one id in the plan.
    const first = new Map<string, string>()
    const on = new Map<string, FloorDraft[]>()
    for (const fl of this.floors) {
      const ids = new Set([...fl.rooms.keys(), ...fl.openings.map((o) => o.words[1] ?? '')])
      for (const id of ids) {
        if (!first.has(id)) first.set(id, fl.id)
        on.set(id, [...(on.get(id) ?? []), fl])
      }
    }
    const idOf = (fl: FloorDraft, id: string): string => (first.get(id) === fl.id ? id : `${fl.id}-${id}`)
    // MSG-6 (lab AB-7): an id written once is kept as written; one Grid had to change is named
    // with what it is now, so the next call can use it.
    const changed = [...on].filter(([id, floors]) => id !== '' && floors.length > 1)
    if (changed.length > 0) {
      const FLOORS_SHOWN = 3
      const IDS_SHOWN = 10
      const line = ([id, floors]: [string, FloorDraft[]]): Said => {
        const others = floors.slice(1)
        const shown = joined(others.slice(0, FLOORS_SHOWN).map((fl) => said('rooms.idChanged.on', { id: idOf(fl, id), floor: fl.id })), 'join.comma', 'join.and')
        const list = others.length > FLOORS_SHOWN ? said('rooms.idChanged.moreFloors', { list: shown, count: others.length - FLOORS_SHOWN }) : shown
        return said('rooms.idChanged.id', { id, first: floors[0]!.id, others: list })
      }
      const ids = joined(changed.slice(0, IDS_SHOWN).map(line), 'join.semicolon')
      const list = changed.length > IDS_SHOWN ? said('rooms.idChanged.moreIds', { list: ids, count: changed.length - IDS_SHOWN }) : ids
      this.warn('rooms/id-changed', null, english(said(changed.length === 1 ? 'rooms.idChanged.one' : 'rooms.idChanged.many', { list })))
    }
    const trueAreas = new Map<string, number>()
    const rawRoomLines: Array<{ fl: FloorDraft; words: string[]; line: number; local: string; name?: string }> = []
    for (const fl of this.floors) {
      const wallPrefix = multi ? `${fl.id}-` : ''
      const height = fl.height ?? fl.rule.height ?? WALL_DEFAULTS.solid.height
      let worked: { edges: Edge[]; raws: RawWall[]; gone: ReadonlySet<string> } | null = null
      // WRT-47: a floor's stated height is its walls' (LVL-1); a walls line that says another is told so.
      if (fl.rooms.size > 0 && fl.height !== null && fl.rule.height !== null && Math.abs(fl.height - fl.rule.height) > tolerance('diffLength')) {
        const values = { floor: fl.id, floorHeight: f2(fl.height), height: f2(fl.rule.height), line: String(fl.rule.line ?? '') }
        this.warn('rooms/walls-height', fl.rule.line, english(said('rooms.wallsHeight', values)))
      }
      if (fl.rooms.size === 0) {
        if (fl.raw.walls.length + fl.raw.rooms.length === 0) this.warn('rooms/empty-floor', null, `Floor '${fl.id}' has no rooms.`)
      } else {
        const { edges, raws } = this.derive(fl)
        if (this.problems.length > 0) continue
        const built = this.buildWalls(fl, edges, raws, wallPrefix)
        // WRT-44: a wall worked out with its two ends at one point, as the file holds them, has
        // no length: two outside walls closer than their own thickness (the notch between two
        // flats of a row) cover its place. It is left out, so the plan never holds a wall the check
        // would leave out; the other walls keep their ids, as a plan written before has them.
        const gone = new Set(built.filter((w) => noLength(w.json.start, w.json.end)).map((w) => w.json.id))
        const walls = built.filter((w) => !gone.has(w.json.id))
        worked = { edges, raws, gone }
        plan.walls.push(...walls.map((w) => w.json))
        for (const room of fl.rooms.values()) {
          let boundary: string[] = []
          for (const e of edges.filter((x) => x.room === room)) {
            const parts: Array<[number, string]> = []
            for (const r of raws) for (const sd of r.sides) if (sd[0] === e.idx && !gone.has(r.wall!.id)) parts.push([sd[1], r.wall!.id])
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
            ...(room.conditioned !== null ? { conditioned: room.conditioned } : {}),
            ...(room.number !== null ? { number: room.number } : {}),
            ...(room.facts !== null ? { properties: room.facts } : {}),
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
      }
      // WRT-45: every opening line is read, on a floor of raw rooms too; one naming a raw room is
      // placed once every wall of the plan is known.
      const seen = new Set<string>()
      const rawRooms = this.rawRoomsOn(fl)
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
        const named = Compiler.roomsNamed(o.words)
        if (named.some((x) => rawRooms.has(x))) {
          rawRoomLines.push({ fl, words: o.words, line: o.line, local, ...(o.name === undefined ? {} : { name: o.name }) })
          continue
        }
        try {
          if (worked === null && named.length > 0) this.stop('rooms/unknown-room', o.line, english(said('rooms.rawRoom.unknown', { line: o.line, room: named[0]!, floor: fl.id, rooms: [...rawRooms].join(', ') })))
          const item = this.resolveOpening(fl, worked?.edges ?? [], worked?.raws ?? [], o.words, o.line, idOf(fl, local), height)
          // WRT-44: an opening that lands in a wall left out for having no length has no wall.
          if (item && worked?.gone.has(item.wall) === true) this.problem('rooms/opening-fit', o.line, english(said('rooms.opening.noLength', { line: o.line, id: local, wall: item.wall })))
          else if (item) {
            plan.openings.push(o.name === undefined ? item : { ...item, properties: { ...item.properties, name: o.name } })
            this.openingLines.set(item.id, o.line)
            this.openingLocal.set(item.id, local)
          }
        } catch (error) {
          if (!(error instanceof RoomsStop)) throw error
          const fixes = error.line === null ? undefined : this.stopFixes.get(error.line)
          this.problems.push({ code: error.code, line: error.line, message: error.message.charAt(0).toUpperCase() + error.message.slice(1), ...(fixes === undefined ? {} : { fixes }) })
        }
      }
      plan.walls.push(...(fl.raw.walls as WrittenWall[]))
      plan.rooms.push(...(fl.raw.rooms as Room[]))
      plan.openings.push(...(fl.raw.openings as Opening[]))
    }
    // WRT-45: the lines naming a raw room, on the plan with every wall written. A plan that cannot
    // be read is already refused for what else is wrong with it, unless nothing else is.
    const written = rawRoomLines.length > 0 ? safeParseFloorPlan(plan) : null
    if (written !== null || this.problems.length === 0) {
      for (const { fl, words, line, local, name } of rawRoomLines) {
        try {
          const item = this.resolveRawRoomOpening(written, fl, words, line, idOf(fl, local), (x) => idOf(fl, x))
          if (item) {
            plan.openings.push(name === undefined ? item : { ...item, properties: { ...item.properties, name } })
            this.openingLines.set(item.id, line)
          }
        } catch (error) {
          if (!(error instanceof RoomsStop)) throw error
          const fixes = error.line === null ? undefined : this.stopFixes.get(error.line)
          this.problems.push({ code: error.code, line: error.line, message: error.message.charAt(0).toUpperCase() + error.message.slice(1), ...(fixes === undefined ? {} : { fixes }) })
        }
      }
    }
    if (this.problems.length === 0) this.carryShaftDoors(plan, idOf)
    this.checkOpeningClash(plan.openings, plan.walls as Wall[])
    this.emitFlats(plan, idOf)
    const all = [...plan.walls, ...plan.rooms, ...plan.openings].map((x) => x.id)
    const twice = [...new Set(all.filter((x, k) => all.indexOf(x) !== k))].sort()
    for (const id of twice) this.problem('rooms/duplicate-id', null, `The id '${id}' would name two things in the plan (walls, rooms and openings share one set of ids). Rename one.`)
    this.rawOpeningFloors(plan.walls)
    this.emitSite(plan)
    this.emitStairs(plan)
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
    this.rawFacts(plan)
    return plan
  }

  /** CNT-41: the site lines into the plan's `site` and `north`; a plot with no place is centred on the walls. */
  private emitSite(plan: { -readonly [K in keyof WrittenPlan]: WrittenPlan[K] }): void {
    if (!this.siteLines.written) return
    const ends = plan.walls.flatMap((w) => [w.start, w.end].map((p) => [p[0], p[1], w.thickness / 2] as const))
    const extent = ends.length === 0 ? null : ([Math.min(...ends.map((e) => e[0] - e[2])), Math.min(...ends.map((e) => e[1] - e[2])), Math.max(...ends.map((e) => e[0] + e[2])), Math.max(...ends.map((e) => e[1] + e[2]))] as const)
    const made = this.siteLines.finish(extent)
    const capital = (note: { code: string; line: number | null; message: string }): RoomsProblem => ({ ...note, message: note.message.charAt(0).toUpperCase() + note.message.slice(1) })
    this.problems.push(...made.problems.map(capital))
    this.warnings.push(...made.warnings.map(capital))
    if (made.site !== undefined) plan.site = made.site
    if (made.north !== undefined) plan.north = made.north
  }

  /** LVL-21: the stair lines into the plan's `stairs`, laid out in the rooms as drawn. */
  private emitStairs(plan: { -readonly [K in keyof WrittenPlan]: WrittenPlan[K] }): void {
    if (!this.stairLines.written) return
    const made = this.stairLines.finish(this.problems.length > 0 ? null : safeParseFloorPlan(plan))
    const capital = (note: { code: string; line: number | null; message: string }): RoomsProblem => ({ ...note, message: note.message.charAt(0).toUpperCase() + note.message.slice(1) })
    this.problems.push(...made.problems.map(capital))
    this.warnings.push(...made.warnings.map(capital))
    this.guesses.push(...made.guesses)
    if (made.stairs !== undefined) plan.stairs = made.stairs
    for (const id of this.stairLines.rawIds()) this.rawIds.add(id)
  }

  /**
   * LVL-19: a stair or a lift that rose `through` to a floor where no door leads into it (nor into
   * the rising rooms its own openings join it to) takes up the doors it has, on the floor it is
   * written on, into a room that does not rise: each in the same place, where the same stretch of
   * its wall on this floor is shared with a room of this floor (the roof's terrace). A door whose
   * place there faces the outside or another rising room stays where it is written, and a floor
   * that writes any door into it gets none. The write answer names every door carried.
   */
  private carryShaftDoors(plan: { walls: WrittenWall[]; openings: Opening[] }, idOf: (fl: FloorDraft, id: string) => string): void {
    if (!this.explicitFloors) return
    const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
    const ids = new Set([...plan.walls.map((w) => w.id), ...plan.openings.map((o) => o.id)])
    for (const fl of this.floors) for (const room of fl.rooms.values()) ids.add(idOf(fl, room.id))
    const step = tolerance('stepPastFace')
    const dirOf = (w: WrittenWall): { a: P; u: P; L: number } => {
      const a: P = [w.start[0], w.start[1]]
      const d = sub([w.end[0], w.end[1]], a)
      const L = norm(d)
      return { a, u: mul(d, 1 / L), L }
    }
    // The room on each face of a wall at a point along it, of a floor's rooms (null: none, the outside).
    const facing = (fl: FloorDraft, w: WrittenWall, at: number): [string | null, string | null] => {
      const { a, u } = dirOf(w)
      const mid = add(a, mul(u, at))
      const n: P = [-u[1], u[0]]
      const off = w.thickness / 2 + step
      const at2 = (k: number): string | null => {
        const p = add(mid, mul(n, k * off))
        const room = [...fl.rooms.values()].find((r) => pointInPolygon({ x: p[0], y: p[1] }, r.poly.map(([x, y]) => ({ x, y }))))
        return room?.id ?? null
      }
      return [at2(1), at2(-1)]
    }
    const straight = (w: WrittenWall | undefined): w is WrittenWall => w !== undefined && w.arc === undefined
    const on = (fl: FloorDraft): Opening[] => plan.openings.filter((o) => walls.get(o.wall)?.floor === fl.id)
    const carried: Said[] = []
    for (const fl of this.floors) {
      const rose = new Set([...fl.rooms.values()].filter((r) => r.risenFrom !== null).map((r) => r.id))
      if (rose.size === 0) continue
      // What each door or opening on this floor joins, by the rooms on its two faces.
      const ways = on(fl).flatMap((o) => {
        const w = walls.get(o.wall)
        return o.type === 'window' || !straight(w) ? [] : [facing(fl, w, o.offset + o.width / 2)]
      })
      const done = new Set<string>()
      for (const first of rose) {
        if (done.has(first)) continue
        // The rising rooms the floor's openings join to this one: a stair and the lift beside it.
        const group = new Set([first])
        for (let grew = true; grew; ) {
          grew = false
          for (const [x, y] of ways) {
            for (const [p, q] of [[x, y], [y, x]] as const) {
              if (p !== null && q !== null && group.has(p) && rose.has(q) && !group.has(q)) {
                group.add(q)
                grew = true
              }
            }
          }
        }
        for (const id of group) done.add(id)
        if (ways.some(([x, y]) => (x !== null && group.has(x)) !== (y !== null && group.has(y)))) continue
        for (const id of group) {
          const shaft = fl.rooms.get(id)!
          if (shaft.use !== 'stair' && shaft.use !== 'lift') continue
          const src = this.floors.find((f) => f.id === shaft.risenFrom)
          if (src === undefined) continue
          for (const o of on(src)) {
            const sw = walls.get(o.wall)
            if (o.type === 'window' || !straight(sw)) continue
            const [left, right] = facing(src, sw, o.offset + o.width / 2)
            const other = left === id ? right : right === id ? left : undefined
            // A door to the outside, or to a room that rises with it, is not this one's to carry.
            if (other === undefined || other === null || rose.has(other)) continue
            const s = dirOf(sw)
            const p0 = add(s.a, mul(s.u, o.offset))
            const p1 = add(s.a, mul(s.u, o.offset + o.width))
            const target = plan.walls.find((w) => {
              if (w.floor !== fl.id || !straight(w)) return false
              const t = dirOf(w)
              if (Math.abs(cross(t.u, s.u)) > tolerance('joint')) return false
              const reach = Math.max(w.thickness, sw.thickness) / 2 + tolerance('joint')
              return [p0, p1].every((p) => {
                const along = dot(sub(p, t.a), t.u)
                return Math.abs(cross(t.u, sub(p, t.a))) <= reach && along >= -tolerance('joint') && along <= t.L + tolerance('joint')
              })
            })
            if (target === undefined) continue
            const t = dirOf(target)
            const same = dot(t.u, s.u) > 0
            const offset = Math.max(0, Math.min(dot(sub(p0, t.a), t.u), dot(sub(p1, t.a), t.u)))
            const [l, r] = facing(fl, target, offset + o.width / 2)
            const into = l === id ? r : r === id ? l : undefined
            if (into === undefined || into === null || rose.has(into)) continue
            const local = this.openingLocal.get(o.id) ?? o.id
            const newId = `${fl.id}-${local}`
            if (ids.has(newId)) continue
            if (on(fl).some((x) => x.wall === target.id && x.offset < offset + o.width && offset < x.offset + x.width)) continue
            const flip = <T extends string>(v: T | undefined, a: T, b: T): T | undefined => (v === undefined || same ? v : v === a ? b : a)
            // Its anchor names the rooms of the floor it is written on, so it stays there.
            const kept: Opening = { ...o }
            delete kept.anchor
            const swing = flip(o.swing, 'left', 'right')
            const hinge = flip(o.hinge, 'start', 'end')
            const item: Opening = { ...kept, id: newId, wall: target.id, offset: r4(offset), ...(swing === undefined ? {} : { swing }), ...(hinge === undefined ? {} : { hinge }) }
            plan.openings.push(item)
            ids.add(newId)
            const line = this.openingLines.get(o.id)
            if (line !== undefined) this.openingLines.set(newId, line)
            this.openingFacts.push(
              english(said('rooms.rawRoom.fact', { id: newId, kind: o.type, width: num(f2(o.width)), wall: target.id, joins: `${idOf(fl, id)} and ${idOf(fl, into)}`, from: num(f2(offset)), to: num(f2(t.L - offset - o.width)), said: '' }))
            )
            carried.push(said('rooms.doorCarried.one', { id: newId, floor: fl.id, shaft: idOf(src, id), source: o.id, from: src.id, room: idOf(fl, into) }))
          }
        }
      }
    }
    if (carried.length > 0) this.warn('rooms/door-carried', null, english(said('rooms.doorCarried', { list: joined(carried, 'join.semicolon') })))
  }

  /**
   * WRT-27: a raw opening written under one floor in a wall of another (one that rises through no
   * floor) is refused with its line: an opening is on its wall's floor.
   */
  private rawOpeningFloors(walls: readonly WrittenWall[]): void {
    const byId = new Map(walls.map((w) => [w.id, w]))
    for (const { kind, part, line, under } of this.rawParts) {
      if (kind !== 'opening') continue
      const wall = byId.get(String(part['wall']))
      if (wall === undefined || wall.through !== undefined || (wall.floor ?? DEFAULT_FLOOR_ID) === under) continue
      this.problem('rooms/raw', line, english(said('rooms.raw.openingFloor', { line, id: String(part['id']), wall: wall.id, floor: wall.floor ?? DEFAULT_FLOOR_ID, under })))
    }
  }

  /**
   * WRT-27: the raw parts in the answer beside the ones worked out: each raw room measured on the
   * plan as it is read, as Grid measures every room; each raw wall with its length and rooms; each
   * raw opening with its wall.
   */
  private rawFacts(plan: WrittenPlan): void {
    if (this.rawParts.length === 0) return
    const read = safeParseFloorPlan(plan)
    const index = read === null ? null : indexPlan(read)
    for (const { kind, part } of this.rawParts) {
      const id = String(part['id'])
      if (kind === 'room') {
        const room = read?.rooms.find((r) => r.id === id)
        const poly = room === undefined || index === null ? null : tryRoomPolygon(room, index)
        const b = poly === null ? null : boxOf([poly.map((p) => [p.x, p.y] as P)])
        const apart = room === undefined ? {} : isOutdoor(room) ? { apart: 'outdoor' as const } : room.void === true ? { apart: 'void' as const } : {}
        this.roomFacts.push({
          id,
          name: typeof part['name'] === 'string' ? part['name'] : id,
          floor: room === undefined ? DEFAULT_FLOOR_ID : floorOf(room),
          width: b === null ? 0 : b[2] - b[0],
          depth: b === null ? 0 : b[3] - b[1],
          area: poly === null || room === undefined || index === null ? 0 : roomFloorArea(room, index, poly),
          corners: poly === null ? 0 : poly.length,
          ...apart,
          basis: null,
          written: null,
          raw: true,
        })
      } else if (kind === 'wall') {
        const wall = read?.walls.find((w) => w.id === id)
        this.wallFacts.push({
          id,
          kind: wall?.kind ?? 'exterior',
          virtual: wall?.virtual === true,
          thickness: wall?.thickness ?? 0,
          // WRT-44: measured without throwing: a straight wall of no length is 0 long.
          length: wall === undefined ? 0 : wall.arc === undefined ? norm(sub([wall.end[0], wall.end[1]], [wall.start[0], wall.start[1]])) : wallLength(wall),
          rooms: (index?.roomsByWall.get(id) ?? []).map((r) => r.id),
          handles: [],
          stretches: [],
          raw: true,
        })
      } else {
        const width = typeof part['width'] === 'number' ? f2(part['width']) : '?'
        this.openingFacts.push(english(said('rooms.raw.openingFact', { id, type: String(part['type'] ?? 'opening'), width, wall: String(part['wall']) })))
      }
    }
  }

  /** WRT-27: how many walls, rooms and openings were written raw, or null when none were. */
  rawCounts(): { walls: number; rooms: number; openings: number } | null {
    if (this.rawParts.length === 0) return null
    const count = (kind: 'wall' | 'room' | 'opening'): number => this.rawParts.filter((p) => p.kind === kind).length
    return { walls: count('wall'), rooms: count('room'), openings: count('opening') }
  }

  /**
   * CNT-4: the flat types, and each placement of one as a flat. A label placed on more than one
   * floor takes its floor's id in front, as a room's id does. A room removed after it was placed
   * is not in its flat; a flat with no room left is not written.
   */
  private emitFlats(plan: { flatTypes?: FloorPlan['flatTypes']; flats?: FloorPlan['flats'] }, idOf: (fl: FloorDraft, id: string) => string): void {
    if (this.flatTypes.size === 0) return
    plan.flatTypes = [...this.flatTypes].map(([id, type]) => ({ id, name: type.name }))
    // LVL-16: a label on several floors stays as written on the first that places it.
    const labels = new Map<string, string>()
    for (const fl of this.floors) for (const f of fl.flats) if (!labels.has(f.label)) labels.set(f.label, fl.id)
    const flats: NonNullable<FloorPlan['flats']> = []
    for (const fl of this.floors) {
      for (const flat of fl.flats) {
        const rooms = flat.rooms.filter((r) => fl.rooms.get(r.id) === r).map((r) => idOf(fl, r.id))
        if (rooms.length === 0) continue
        const type = this.flatTypes.get(flat.unit)!
        const id = labels.get(flat.label) === fl.id ? flat.label : `${fl.id}-${flat.label}`
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
  private checkOpeningClash(openings: readonly Opening[], walls: readonly Wall[]): void {
    // CNT-35: a plan that states a phase is checked as the drawing check reads it, once before the
    // work and once after, so a widened door's old opening and its new one are no clash.
    const phased = planHasPhases({ walls: [...walls], openings: [...openings], rooms: [] })
    const reading = phaseReading({ walls: [...walls] })
    const seen = new Set<string>()
    for (const state of phased ? (['before', 'after'] as const) : ([null] as const)) {
      this.clashIn(state === null ? openings : openings.filter((o) => standsIn(reading.opening(o), state)), seen)
    }
  }

  private clashIn(openings: readonly Opening[], seen: Set<string>): void {
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
          if (seen.has(`${kept.id}|${b.id}`)) continue
          seen.add(`${kept.id}|${b.id}`)
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

/**
 * LVL-16: a floor's openings with the carried ones it does not keep left out: one whose two rooms
 * are not both on the floor, and one the floor writes itself, by its id or between the same rooms.
 */
function carriedKept(fl: FloorDraft): OpeningLine[] {
  const own = fl.openings.filter((o) => o.risen !== true)
  const ids = new Set(own.map((o) => o.words[1]))
  const pairs = new Set(own.filter((o) => o.words[2] === 'between' && o.words[4] === 'and').map((o) => pairKey(o.words[3]!, o.words[5]!)))
  return fl.openings.filter((o) => o.risen !== true || (!ids.has(o.words[1]) && !pairs.has(pairKey(o.words[3]!, o.words[5]!)) && fl.rooms.has(o.words[3]!) && fl.rooms.has(o.words[5]!)))
}

/** WRT-47: whether two boxes meet along a side: one's edge on the other's, with a length in common. */
function boxesMeet(a: Box, b: Box): boolean {
  const near = (p: number, q: number): boolean => Math.abs(p - q) <= tolerance('joint')
  const overlap = (lo0: number, hi0: number, lo1: number, hi1: number): boolean => Math.min(hi0, hi1) - Math.max(lo0, lo1) > tolerance('joint')
  return ((near(a[2], b[0]) || near(a[0], b[2])) && overlap(a[1], a[3], b[1], b[3])) || ((near(a[3], b[1]) || near(a[1], b[3])) && overlap(a[0], a[2], b[0], b[2]))
}

/** WRT-47: whether a floor has rooms placed on its own lines (copied ones too), past rising through from below. */
function started(fl: FloorDraft): boolean {
  return fl.copied !== null || [...fl.rooms.values()].some((r) => r.risenFrom === null)
}

function newFloor(id: string, name: string, level: number, rule: WallsRule): FloorDraft {
  return {
    rule: { ...rule },
    id,
    name,
    level,
    height: null,
    elevation: null,
    slab: null,
    building: null,
    extra: {},
    copied: null,
    rooms: new Map(),
    inst: new Map(),
    between: new Map(),
    betweenSide: new Map(),
    open: new Set(),
    ahead: new Set(),
    extover: [],
    openings: [],
    raw: { walls: [], rooms: [], openings: [] },
    flats: [],
    rows: [],
  }
}

/** The most times one line may repeat a unit: a corridor of rooms, not a city. */
const REPEAT_MAX = 500

/** How many times a plan whose sizes run to the walls is placed again, at most. */
const SETTLE_ROUNDS = 8

/** WRT-51: a word of rooms text as a regular expression that matches it and nothing else. */
function escaped(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
  // CNT-36: a dividing line between rooms that share no side is refused too; only a door, window or opening line is fixed here.
  if (!['door', 'window', 'opening'].includes(door[0] ?? '')) return null
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
  return compiled(text, options).result
}

/**
 * WRT-51: an opening line refused for not saying which of several sides, with the lines that
 * say it in full and write: each is tried, and kept when the line is then placed (in the wall to
 * the room it was meant to join, for two rooms that share several walls) and nothing is refused
 * that was not before. Nothing is changed: they are offered, in the message and as data.
 */
function withSideFix(text: string, problem: RoomsProblem, all: readonly RoomsProblem[], offers: Compiler['sideOffers']): RoomsProblem {
  if ((problem.code !== 'rooms/no-side' && problem.code !== 'rooms/two-shared-walls') || problem.line === null) return problem
  const at = problem.line
  const had = new Set(all.map((p) => `${p.code}|${p.line}`))
  const lines = text.split(/\r\n|\r|\n/)
  const kept: Array<{ fix: RoomsFix; said: Said; onto: string | null; leadsOut: boolean; word: string }> = []
  for (const offer of offers.get(at) ?? []) {
    const tried = compiled([...lines.slice(0, at - 1), offer.text, ...lines.slice(at)].join('\n'), { offerFixes: false })
    if (!tried.c.placedAt.has(at)) continue
    const onto = tried.c.placedAt.get(at)!
    if (offer.onto !== undefined && onto !== offer.onto) continue
    if (!tried.result.problems.every((p) => p.line !== at && had.has(`${p.code}|${p.line}`))) continue
    kept.push({ fix: { line: at, text: offer.text }, said: said('rooms.side.offer', { text: offer.text, beyond: Compiler.beyondSaid({ rooms: onto === null ? [] : [onto], outside: onto === null }) }), onto, leadsOut: offer.leadsOut === true, word: offer.word ?? '' })
  }
  // WRT-57: a door that could lead outside is never offered only lines that lead it into a room.
  const into = kept.filter((k) => k.leadsOut && k.onto !== null)
  let staysOut = ''
  if (into.length > 0 && into.length === kept.length) {
    kept.length = 0
    const rooms = joined([...new Set(into.map((k) => `'${k.onto}'`))], 'join.and')
    staysOut = ` ${english(said('rooms.side.staysOut', { rooms, words: joined(into.map((k) => `'${k.word}'`), 'join.commaOr') }))}`
  }
  if (kept.length === 0) return staysOut === '' ? problem : { ...problem, message: `${problem.message}${staysOut}` }
  const written = english(said('rooms.side.offers', { line: at, offers: joined(kept.map((k) => k.said), 'join.commaOr') }))
  return { ...problem, message: `${problem.message} ${written}`, fixes: [...(problem.fixes ?? []), ...kept.map((k) => k.fix)] }
}

function compiled(text: string, options: CompileOptions): { result: RoomsResult; c: Compiler } {
  const offerFixes = options.offerFixes ?? true
  let assumed = new Map<string, number>()
  // WRT-55: each repeat line's setting written '*' and, by line, what it was and how long the row came out each round.
  const fills = new Map<number, number>()
  const tried = new Map<number, Array<{ value: number; length: number }>>()
  let compiler: Compiler | null = null
  let plan: WrittenPlan | null = null
  let stopped: RoomsProblem | null = null
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    compiler = new Compiler(text, assumed, options, fills)
    try {
      plan = compiler.run()
      stopped = null
    } catch (error) {
      if (!(error instanceof RoomsStop)) throw error
      const message = error.message.charAt(0).toUpperCase() + error.message.slice(1)
      const fixes = error.line === null ? undefined : compiler.stopFixes.get(error.line)
      stopped = { code: error.code, line: error.line, message, ...(fixes === undefined ? {} : { fixes }) }
      plan = null
      break
    }
    // A size to the walls' centre lines or outside faces needs the walls round it: place again
    // until every side has the wall it was taken to have.
    const moved = [...compiler.found].some(([key, t]) => Math.abs((assumed.get(key) ?? Number.NaN) - t) > tolerance('joint') || !assumed.has(key))
    // WRT-55: a row to fill a length is placed again with its setting moved by the secant of the rounds so far.
    let refilled = false
    for (const [line, got] of compiler.fillFound) {
      if (Math.abs(got.length - got.fill) <= tolerance('joint')) continue
      const seen = [...(tried.get(line) ?? []), { value: got.value, length: got.length }]
      tried.set(line, seen)
      const [a, b] = seen.length >= 2 ? (seen.slice(-2) as [{ value: number; length: number }, { value: number; length: number }]) : [null, seen[0]!]
      const slope = a !== null && Math.abs(b.value - a.value) > tolerance('noLength') ? (b.length - a.length) / (b.value - a.value) : null
      const step = slope !== null && Math.abs(slope) > tolerance('noLength') ? (got.fill - b.length) / slope : (got.fill - b.length) / Math.max(1, compiler.fillCount(line))
      fills.set(line, b.value + step)
      refilled = true
    }
    if ((!moved && !refilled) || plan === null) break
    assumed = new Map([...assumed, ...compiler.found])
  }
  const c = compiler!
  let problems: RoomsProblem[] = stopped === null ? c.problems : [stopped]
  let warnings: RoomsProblem[] = c.warnings
  // WRT-55: a row that cannot be made the length it is to fill is refused with what it came out.
  if (stopped === null) {
    for (const [line, got] of c.fillFound) {
      if (Math.abs(got.length - got.fill) > tolerance('joint')) problems = [...problems, { code: 'rooms/fill', line, message: english(said('rooms.repeat.fillMissed', { line, fill: num(f2(got.fill)), length: num(f2(got.length)) })) }]
    }
    if (problems.length > 0) plan = null
  }
  // MSG-22: the ids it writes are ids every tool takes, and the ones put in plain letters are named.
  if (stopped === null && plan !== null && problems.length === 0) {
    const ids = idsOfText(text, plan)
    problems = ids.problems
    warnings = [...warnings, ...ids.warnings]
    if (problems.length > 0) plan = null
  }
  // WRT-17: what is written passes the drawing's own check, or is not written.
  if (stopped === null && plan !== null && problems.length === 0) {
    const checked = checkWritten(plan, warnings, c.rawIds)
    problems = checked.problems
    warnings = [...warnings, ...checked.warnings]
    if (problems.length > 0) plan = null
  }
  const result: RoomsResult = {
    plan: stopped === null ? plan : null,
    name: c.name,
    basedOn: c.basedOn,
    // WRT-55: a refused text says first that a row runs past its street.
    problems: [...(problems.length > 0 ? warnings.filter((w) => w.code === 'rooms/row-overrun') : []), ...(offerFixes ? problems.map((p) => withSideFix(text, withAlignmentFix(text, p, problems), problems, c.sideOffers)) : problems)],
    warnings,
    guesses: c.guesses,
    rooms: c.roomFacts,
    walls: c.wallFacts,
    openings: c.openingFacts,
    sizes: c.sizes,
    ...(c.rawCounts() === null ? {} : { raw: c.rawCounts()! }),
  }
  return { result, c }
}
