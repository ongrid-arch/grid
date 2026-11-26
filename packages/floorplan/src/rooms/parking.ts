/**
 * Parking bays and ramps in rooms text and through the tools (CNT-46): one reading of their words,
 * so a `bay`, `bays` or `ramp` line, `grid_place_bays` and `grid_add_ramp` lay them out the same way.
 * What they write is the plan's own `bays` and `ramps` (C29, CNT-19).
 *
 *   bay <id> at x,y, <w> x <l> [turn <deg>] [number <n>] [on <floor>]
 *   bays <group> in <room> along <side>, <w> x <l> [count <n>] [offset <m>] [from <end>] [inset <m>] [numbered <first>]
 *   bays <group> in <room> fill, <w> x <l> [aisle <m>] [rows east-west|north-south] [from <side>] [count <n>] [numbered <first>]
 *   bays <group> at x,y, <w> x <l>, count <n>, runs <way> [pitch <m>] [turn <deg>] [first <k>] [numbered <first>] [on <floor>]
 *   ramp <id> ["<name>"] from <floor|room> to <floor|room> [in <room>], <w> wide, straight, runs <way> [along <side>] [slope <%>]
 *   ramp <id> ["<name>"] from <floor|room> to <floor|room>, <w> wide, run x,y x,y ... [slope <%>]
 *   ramp <id> ["<name>"] from <floor|room> to <floor|room> [in <room>], <w> wide, helix [at x,y] [radius <m>] [turns <n>] [starts <side|deg>] [clockwise] [slope <%>]
 *   raw bay { ... }   raw ramp { ... }
 *
 * A size may be a kind word instead, `car`, `small`, `accessible` or `motorcycle`: Grid's own size
 * for it (`BAY_SIZES`), never a code's. C29 records no kind, so the kind gives the size only.
 *
 * - A bay's `at` is its middle (C29). A bay line with no `on` stands on the floor of the floor line
 *   above it; a row in a room on its room's floor.
 * - Every row is laid out by one function (`rowBays`) from its explicit words: its first bay's
 *   middle, the way it runs, the pitch between middles (the bay's width unless said) and the turn
 *   (none for a row running east or west, whose bays' length runs along y; 90 for one running north
 *   or south). Its bays are `<group>-<k>`, `k` from `first` (1 unless said), and numbered on from
 *   `numbered`'s last digits, which keep their width (`B1-07`, `B1-08`).
 * - `along <side>`: one row against that inside face, its bays' length across it, from the west
 *   (or south) end unless `from` says, `offset` from the face and `inset` from the end. As many as
 *   fit unless `count` says.
 * - `fill`: rows across the room's box, from the side `from` names (the south or west one unless
 *   said): a row, an aisle, two rows back to back, an aisle, and so on, as many rows as fit, with
 *   aisles `aisle` wide (Grid's own 6 m unless said). The rows run along the room's longer side
 *   unless `rows` says. A bay that would leave the room or stand on a column or another bay is left
 *   out, and the others are numbered on in order.
 * - A ramp joins two floors as a stair does: a room after `from` or `to` stands for its floor, and
 *   with no `in` the ramp goes in that room. `straight` runs it from face to face of its room the
 *   way `runs` says, centred across or against the side `along` names. `helix` turns its middle
 *   line round a circle (`HELIX_STEPS` points a full turn, at most the schema's): about `at`, or the
 *   middle of its room; with `radius` the middle line's, else the largest its room holds; `turns`
 *   full turns (1 unless said), counter-clockwise unless `clockwise`, starting at the side or the
 *   angle `starts` names (south unless said; degrees counter-clockwise from east). `planRamps`
 *   works out its levels, rise, length and slope, and a ramp it would leave out is refused.
 *
 * The read-back (`parkingLines`) writes bays as rows where laying the row out again gives the very
 * same bays, else one line each, and raw when Grid leaves the bay out; ramps as a helix or in their
 * room when that gives back their own middle line, else along it, and raw when Grid leaves it out.
 *
 * Pure: words in, bays and ramps out, or the reason there are none.
 */
import { BaySchema, RampSchema, RAMP_RUN_MAX, type Bay, type FloorPlan, type Ramp } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { floorOf, planFloors } from '../geometry/floors'
import { tryRoomPolygon } from '../geometry/room'
import { pointInPolygon, rectInsidePolygon } from '../geometry/innerPoint'
import { bayFootprint, leftOutBays, oneInText, parkingIssues, planRamps, slopeText, type RampLayout } from '../geometry/parking'
import { columnFootprint, columnsOnFloor } from '../geometry/columns'
import { intersectionArea, ringOf } from '../geometry/polygons'
import { tolerance } from '../geometry/tolerances'
import type { Vec2 } from '../geometry/vec2'
import { plainId } from '../types/planText'
import { isPointWord, numberOf, pointOf, RoomsStop, type LineWord, type PlainNumbers, PLAIN_METRES } from './words'

type P = readonly [number, number]
type Room = FloorPlan['rooms'][number]

/** The first words of the lines this file reads. */
export const PARKING_LINE_WORDS: readonly string[] = ['bay', 'bays', 'ramp']

/** The sides of the drawing (C4): the ways a row or a ramp runs. */
export const PARKING_WAYS = ['north', 'east', 'south', 'west'] as const
export type ParkingWay = (typeof PARKING_WAYS)[number]

/** The ways the rows of a fill run. */
export const BAY_ROWS = ['east-west', 'north-south'] as const
export type BayRows = (typeof BAY_ROWS)[number]

/** The kinds of bay Grid has a size for. */
export const BAY_KINDS = ['car', 'small', 'accessible', 'motorcycle'] as const
export type BayKind = (typeof BAY_KINDS)[number]

/** Grid's own sizes for each kind, width by length in metres: starting sizes, not a code's figures. */
export const BAY_SIZES: Readonly<Record<BayKind, { readonly width: number; readonly length: number }>> = {
  car: { width: 2.5, length: 5 },
  small: { width: 2.3, length: 4.5 },
  accessible: { width: 3.6, length: 5 },
  motorcycle: { width: 1, length: 2.2 },
}

/** Grid's own width for an aisle between rows of bays, in metres: a starting size, not a code's figure. */
export const BAY_AISLE = 6

/** The points a helix ramp's middle line takes for a full turn, and the fewest it may take. */
export const HELIX_STEPS = 24
const HELIX_FEWEST = 12

/** The most bays one line or one call places. */
export const BAYS_MOST = 5000

const CLOCKWISE: Readonly<Record<ParkingWay, ParkingWay>> = { north: 'east', east: 'south', south: 'west', west: 'north' }
const OPPOSITE: Readonly<Record<ParkingWay, ParkingWay>> = { north: 'south', south: 'north', east: 'west', west: 'east' }
const ANGLE: Readonly<Record<ParkingWay, number>> = { east: 0, north: 90, west: 180, south: 270 }
const STEP: Readonly<Record<ParkingWay, P>> = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] }

const ns = (way: ParkingWay): boolean => way === 'north' || way === 'south'
const across = (a: ParkingWay, b: ParkingWay): boolean => a !== b && OPPOSITE[a] !== b

/** A length for a sentence: to the millimetre, no trailing zeros. */
const m = (v: number): string => String(Math.round(v * 1000) / 1000 + 0)
/** A number for a line Grid reads again: exact to the nanometre. */
const exact = (v: number): string => String(Math.round(v * 1e9) / 1e9 + 0)
const settled = (v: number): number => Math.round(v * 1e9) / 1e9 + 0
/** A figure found again from points: to a millionth, so the words a person wrote come back. */
const nice = (v: number): number => Math.round(v * 1e6) / 1e6 + 0
const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/** Why words give no bay or ramp, in a sentence that names what to change, starting in small letters. */
export class ParkingRefused extends Error {
  override readonly name = 'ParkingRefused'
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────

/** A size, or the kind it comes from. */
interface Sized {
  readonly width?: number
  readonly length?: number
  readonly kind?: BayKind
}

/** One bay's words. */
export interface BayWords extends Sized {
  readonly id: string
  readonly at: P
  readonly turn?: number
  readonly number?: string
  readonly floor?: string
}

/** A row of bays by its first bay: the read-back's own form, and what every row is laid out from. */
export interface RowSpec {
  readonly group: string
  readonly first: number
  readonly at: P
  readonly runs: ParkingWay
  readonly count: number
  readonly width: number
  readonly length: number
  readonly pitch?: number
  readonly turn?: number
  readonly numbered?: string
  readonly floor?: string
}

/** A `bays` line's words, or a call's. */
export interface BaysWords extends Sized {
  readonly group: string
  /** `along`: one row against a side of the room; `fill`: rows and aisles across it; `at`: by its first bay. */
  readonly how: 'along' | 'fill' | 'at'
  readonly room?: string
  readonly side?: ParkingWay
  readonly from?: ParkingWay
  readonly offset?: number
  readonly inset?: number
  readonly aisle?: number
  readonly rows?: BayRows
  readonly count?: number
  readonly numbered?: string
  readonly first?: number
  readonly at?: P
  readonly runs?: ParkingWay
  readonly pitch?: number
  readonly turn?: number
  readonly floor?: string
}

/** A ramp's words. */
export interface RampWords {
  readonly id: string
  readonly name?: string
  readonly from: string
  readonly to: string
  readonly width: number
  readonly room?: string
  readonly shape?: 'straight' | 'helix'
  readonly runs?: ParkingWay
  readonly along?: ParkingWay
  readonly run?: readonly P[]
  readonly at?: P
  readonly radius?: number
  readonly turns?: number
  /** Degrees counter-clockwise from east. */
  readonly starts?: number
  readonly clockwise?: boolean
  readonly slope?: number
}

// ── Bays ─────────────────────────────────────────────────────────────────────────────────────

/** A size from its words: as given, else the kind's, else a car's; with what Grid chose. */
function sizeOf(words: Sized): { width: number; length: number; guess: string | null } {
  if (words.width !== undefined && words.length !== undefined) return { width: words.width, length: words.length, guess: null }
  if (words.width !== undefined || words.length !== undefined) throw new ParkingRefused("give a bay's size as '<width> x <length>', both, or a kind: car, small, accessible or motorcycle.")
  const kind = words.kind ?? 'car'
  const size = BAY_SIZES[kind]
  return { ...size, guess: `${m(size.width)} x ${m(size.length)} m, Grid's own size for ${kind === 'accessible' ? 'an accessible bay' : `a ${kind} bay`}, not a code figure; give '<width> x <length>' for your own.${words.kind === undefined ? '' : ' Grid records no kind on a bay: the kind gave its size only.'}` }
}

/** The number `m` bays on from `first`: its last digits counted on, keeping their width. */
export function numberAfter(first: string, steps: number): string {
  const found = /^(.*?)(\d+)$/.exec(first)
  if (found === null) throw new ParkingRefused(`'numbered' takes the first bay's number, a number or text ending in one (1, B1-01), not '${first}'.`)
  const n = String(Number(found[2]!) + steps)
  return `${found[1]!}${n.padStart(found[2]!.length, '0')}`
}

const defaultTurn = (runs: ParkingWay): number | undefined => (ns(runs) ? 90 : undefined)

/** The bays of a row, laid out from its explicit words: the one way every row is made. */
export function rowBays(spec: RowSpec): Bay[] {
  const pitch = spec.pitch ?? spec.width
  const turn = spec.turn ?? defaultTurn(spec.runs)
  const [dx, dy] = STEP[spec.runs]
  const out: Bay[] = []
  for (let k = 0; k < spec.count; k++) {
    out.push({
      id: `${spec.group}-${spec.first + k}`,
      ...(spec.numbered === undefined ? {} : { number: numberAfter(spec.numbered, k) }),
      at: [settled(spec.at[0] + k * pitch * dx), settled(spec.at[1] + k * pitch * dy)],
      width: spec.width,
      length: spec.length,
      ...(turn === undefined ? {} : { turn }),
      ...(spec.floor === undefined ? {} : { floor: spec.floor }),
    })
  }
  return out
}

/** The box round a polygon, [x0, y0, x1, y1]. */
type Box = readonly [number, number, number, number]
const boxOf = (poly: readonly Vec2[]): Box => [Math.min(...poly.map((p) => p.x)), Math.min(...poly.map((p) => p.y)), Math.max(...poly.map((p) => p.x)), Math.max(...poly.map((p) => p.y))]

/** A room by id, the one on `floor` first: a room written on a later floor may carry its floor's id in front. */
function roomNamed(plan: FloorPlan, id: string, floor: string | null): Room | undefined {
  const rooms = plan.rooms
  if (floor !== null) {
    const here = rooms.find((r) => floorOf(r) === floor && (r.id === id || r.id === `${floor}-${id}`))
    if (here !== undefined) return here
  }
  return rooms.find((r) => r.id === id) ?? rooms.find((r) => r.id.endsWith(`-${id}`) && r.id === `${floorOf(r)}-${id}`)
}

/** A room's id and its inside outline, or the reason Grid cannot lay anything in it. */
function roomShape(plan: FloorPlan, id: string, floor: string | null): { room: Room; poly: Vec2[]; box: Box } {
  const room = roomNamed(plan, id, floor)
  if (room === undefined) throw new ParkingRefused(`the plan has no room '${id}' to lay it in.`)
  const poly = tryRoomPolygon(room, indexPlan(plan))
  if (poly === null) throw new ParkingRefused(`Grid cannot draw room ${room.id}, so there is nothing to lay it in.`)
  return { room, poly, box: boxOf(poly) }
}

const inside = (bay: Bay, poly: readonly Vec2[]): boolean => {
  const corners = bayFootprint(bay)
  const step = tolerance('sameFace')
  return rectInsidePolygon(
    { minX: Math.min(...corners.map((c) => c.x)) + step, minY: Math.min(...corners.map((c) => c.y)) + step, maxX: Math.max(...corners.map((c) => c.x)) - step, maxY: Math.max(...corners.map((c) => c.y)) - step },
    poly
  )
}

const overlaps = (a: readonly Vec2[], b: readonly Vec2[]): boolean => {
  try {
    return intersectionArea([ringOf(a)], [ringOf(b)]) > tolerance('bayOverlap')
  } catch {
    return false
  }
}

/** Bays laid out from words, with what Grid chose and what it left out. */
export interface BaysMade {
  readonly bays: readonly Bay[]
  /** The rows, as the read-back writes them. */
  readonly rows: readonly RowSpec[]
  /** The room they were laid in; null for a row or a bay given by its place. */
  readonly room: string | null
  readonly floor: string
  readonly guesses: readonly string[]
  /** How many a fill left out, standing on a column or another bay or leaving the room. */
  readonly leftOut: number
}

/** How far a row of `count` bays `w` wide fits along `length`, less `inset`. */
const fitting = (length: number, w: number): number => Math.floor((length + tolerance('sameFace')) / w)

/**
 * The bays a `bays` line or `grid_place_bays` gives. `floor` is the floor a row given by its place
 * stands on when the words do not say (null: none stated). `keep` are the bays the plan keeps, which
 * a fill does not lay a bay over. Throws `ParkingRefused`.
 */
export function layBays(plan: FloorPlan, words: BaysWords, floor: string | null = null, keep: readonly Bay[] = []): BaysMade {
  const size = sizeOf(words)
  const guesses: string[] = size.guess === null ? [] : [`the bays are ${size.guess}`]
  const { width: w, length: l } = size
  if (!(w > 0) || !(l > 0)) throw new ParkingRefused("a bay's width and length are more than 0.")
  if (words.count !== undefined && (!Number.isInteger(words.count) || words.count < 1 || words.count > BAYS_MOST)) throw new ParkingRefused(`count is a whole number from 1 to ${BAYS_MOST}.`)
  const first = words.first ?? 1
  if (!Number.isInteger(first) || first < 0) throw new ParkingRefused("'first' is a whole number, the index of the row's first bay in its id.")
  if (words.numbered !== undefined) numberAfter(words.numbered, 0)
  if (words.how === 'at') {
    if (words.at === undefined || words.runs === undefined || words.count === undefined) throw new ParkingRefused("a row by its place says its first bay's middle, how many and the way it runs: 'at x,y, <w> x <l>, count <n>, runs <way>'.")
    if (words.pitch !== undefined && !(words.pitch > 0)) throw new ParkingRefused('pitch is the distance between two bays\' middles, more than 0.')
    const at = words.floor ?? floor ?? undefined
    const spec: RowSpec = { group: words.group, first, at: words.at, runs: words.runs, count: words.count, width: w, length: l, ...(words.pitch === undefined ? {} : { pitch: words.pitch }), ...(words.turn === undefined ? {} : { turn: words.turn }), ...(words.numbered === undefined ? {} : { numbered: words.numbered }), ...(at === undefined ? {} : { floor: at }) }
    return { bays: rowBays(spec), rows: [spec], room: null, floor: at ?? floorOf({}), guesses, leftOut: 0 }
  }
  if (words.room === undefined) throw new ParkingRefused("say the room the bays go in: 'in <room>'.")
  const { room, poly, box } = roomShape(plan, words.room, words.floor ?? floor)
  const onFloor = floorOf(room)
  const stated = plan.floors === undefined && room.floor === undefined ? undefined : onFloor
  const [x0, y0, x1, y1] = box
  const named = `room ${room.id} is ${m(x1 - x0)} m east-west by ${m(y1 - y0)} m north-south inside`
  const base = { group: words.group, width: w, length: l, ...(stated === undefined ? {} : { floor: stated }) }
  if (words.how === 'along') {
    const side = words.side!
    const start = words.from ?? (ns(side) ? 'west' : 'south')
    if (!across(side, start)) throw new ParkingRefused(`a row along the ${side} side starts at one of its ends: 'from ${ns(side) ? 'west' : 'south'}' or 'from ${ns(side) ? 'east' : 'north'}', not 'from ${start}'.`)
    const runs = OPPOSITE[start]
    const offset = words.offset ?? 0
    const inset = words.inset ?? 0
    if (offset < 0 || inset < 0) throw new ParkingRefused('offset and inset are distances into the room, 0 or more.')
    const long = ns(side) ? x1 - x0 : y1 - y0
    const deep = ns(side) ? y1 - y0 : x1 - x0
    if (offset + l > deep + tolerance('sameFace')) throw new ParkingRefused(`bays ${m(l)} m long${offset > 0 ? ` and ${m(offset)} m off the face` : ''} need the room ${m(offset + l)} m deep from its ${side} side, and ${named}.`)
    const fit = fitting(long - inset, w)
    if (fit < 1) throw new ParkingRefused(`a bay ${m(w)} m wide does not fit along the ${side} side${inset > 0 ? ` past ${m(inset)} m` : ''}: ${named}.`)
    if (words.count !== undefined && words.count > fit) throw new ParkingRefused(`${words.count} bays ${m(w)} m wide do not fit along the ${side} side of room ${room.id}${inset > 0 ? ` past ${m(inset)} m` : ''}: ${fit} do, and ${named}.`)
    const count = words.count ?? fit
    // The first bay's middle: half a bay in from the end it starts at, half a length off the face.
    const alongAt = (start === 'west' ? x0 + inset + w / 2 : start === 'east' ? x1 - inset - w / 2 : start === 'south' ? y0 + inset + w / 2 : y1 - inset - w / 2)
    const acrossAt = side === 'south' ? y0 + offset + l / 2 : side === 'north' ? y1 - offset - l / 2 : side === 'west' ? x0 + offset + l / 2 : x1 - offset - l / 2
    const at: P = ns(side) ? [settled(alongAt), settled(acrossAt)] : [settled(acrossAt), settled(alongAt)]
    const spec: RowSpec = { ...base, first, at, runs, count, ...(words.numbered === undefined ? {} : { numbered: words.numbered }) }
    const bays = rowBays(spec)
    if (!bays.every((bay) => inside(bay, poly))) throw new ParkingRefused(`the row laid in the box of room ${room.id} reaches outside the room, which is not a rectangle: give the row by its first bay instead ('bays ${words.group} at x,y, ${m(w)} x ${m(l)}, count <n>, runs <way>').`)
    if (words.count === undefined) guesses.push(`${count} bay${count === 1 ? '' : 's'} fit along the ${side} side of room ${room.id}, from its ${start} end${fit * w < long - inset - tolerance('sameFace') ? `, ${m(long - inset - fit * w)} m left at the ${OPPOSITE[start]} end` : ''}.`)
    return { bays, rows: [spec], room: room.id, floor: onFloor, guesses, leftOut: 0 }
  }
  // A fill: rows and aisles across the room's box.
  const rows = words.rows ?? (x1 - x0 >= y1 - y0 ? 'east-west' : 'north-south')
  const eastWest = rows === 'east-west'
  const from = words.from ?? (eastWest ? 'south' : 'west')
  if (eastWest !== ns(from)) throw new ParkingRefused(`rows running ${rows} start against the ${eastWest ? 'south or the north' : 'west or the east'} side: 'from ${eastWest ? 'south' : 'west'}' or 'from ${eastWest ? 'north' : 'east'}', not 'from ${from}'.`)
  const aisle = words.aisle ?? BAY_AISLE
  if (!(aisle > 0)) throw new ParkingRefused('an aisle is more than 0 wide.')
  if (words.aisle === undefined) guesses.push(`the aisles are ${m(aisle)} m wide, Grid's own width, not a code figure; give 'aisle <m>' for your own.`)
  const long = eastWest ? x1 - x0 : y1 - y0
  const deep = eastWest ? y1 - y0 : x1 - x0
  const near = tolerance('sameFace')
  let count = 0
  while ((count + 1) * l + Math.ceil((count + 1) / 2) * aisle <= deep + near) count++
  if (count === 0) throw new ParkingRefused(`a row of bays ${m(l)} m long and its aisle ${m(aisle)} m wide need the room ${m(l + aisle)} m deep across rows running ${rows}, and ${named}. Use 'along <side>' for one row against a wall, or rows running the other way.`)
  const perRow = fitting(long, w)
  if (perRow < 1) throw new ParkingRefused(`a bay ${m(w)} m wide does not fit along rows running ${rows}: ${named}.`)
  const sign = from === 'south' || from === 'west' ? 1 : -1
  const face = from === 'south' ? y0 : from === 'north' ? y1 : from === 'west' ? x0 : x1
  const runs: ParkingWay = eastWest ? 'east' : 'north'
  const startAlong = (eastWest ? x0 : y0) + w / 2
  const columns = columnsOnFloor(plan, onFloor).map(columnFootprint)
  const kept = keep.filter((bay) => floorOf(bay) === onFloor).map(bayFootprint)
  const placed: Bay[] = []
  let leftOut = 0
  let full = false
  for (let r = 0; r < count && !full; r++) {
    const offset = Math.floor(r / 2) * (2 * l + aisle) + (r % 2 === 0 ? 0 : l + aisle)
    const acrossAt = face + sign * (offset + l / 2)
    const at: P = eastWest ? [startAlong, acrossAt] : [acrossAt, startAlong]
    for (const bay of rowBays({ ...base, first: 0, at, runs, count: perRow })) {
      const corners = bayFootprint(bay)
      if (!inside(bay, poly) || columns.some((c) => overlaps(corners, c)) || kept.some((k) => overlaps(corners, k))) {
        leftOut++
        continue
      }
      placed.push(bay)
      if (words.count !== undefined && placed.length >= words.count) {
        full = true
        break
      }
    }
  }
  if (placed.length === 0) throw new ParkingRefused(`every bay of the fill would leave room ${room.id} or stand on a column or another bay: ${named}.`)
  // The ids and numbers in the order laid, so the bays are numbered on with no gap.
  const bays = placed.map((bay, k): Bay => ({ ...bay, id: `${words.group}-${first + k}`, ...(words.numbered === undefined ? {} : { number: numberAfter(words.numbered, k) }) }))
  const aisles = Math.ceil(count / 2)
  const used = count * l + aisles * aisle
  guesses.push(
    `${count} row${count === 1 ? '' : 's'} of bays running ${rows} from the ${from} side of room ${room.id}, with ${aisles} aisle${aisles === 1 ? '' : 's'} ${m(aisle)} m wide, up to ${perRow} bays a row` +
      `${deep - used > near ? `; ${m(deep - used)} m left at the ${OPPOSITE[from]} side` : ''}${long - perRow * w > near ? `, ${m(long - perRow * w)} m at the ${eastWest ? 'east' : 'north'} end of each row` : ''}.`
  )
  if (leftOut > 0) guesses.push(`${leftOut} bay${leftOut === 1 ? ' was' : 's were'} left out, leaving the room or standing on a column or another bay.`)
  return { bays, rows: rowsOf(bays), room: room.id, floor: onFloor, guesses, leftOut }
}

/** One bay from its words. */
export function layBay(words: BayWords, floor: string | null = null): { bay: Bay; guesses: string[] } {
  const size = sizeOf(words)
  if (!(size.width > 0) || !(size.length > 0)) throw new ParkingRefused("a bay's width and length are more than 0.")
  const on = words.floor ?? floor ?? undefined
  const bay: Bay = {
    id: words.id,
    ...(words.number === undefined ? {} : { number: words.number }),
    at: [words.at[0], words.at[1]],
    width: size.width,
    length: size.length,
    ...(words.turn === undefined ? {} : { turn: words.turn }),
    ...(on === undefined ? {} : { floor: on }),
  }
  const checked = BaySchema.safeParse(bay)
  if (!checked.success) throw new ParkingRefused(`the bay would not be read: ${checked.error.issues[0]!.path.join('.')} ${checked.error.issues[0]!.message}.`)
  return { bay, guesses: size.guess === null ? [] : [`bay ${words.id} is ${size.guess}`] }
}

/** The bays' numbers, said: `1 to 24`, or none. */
export function numbersSaid(bays: readonly Bay[]): string {
  const numbers = bays.flatMap((b) => (b.number === undefined ? [] : [b.number]))
  if (numbers.length === 0) return 'unnumbered'
  return numbers.length === 1 ? `numbered ${numbers[0]}` : `numbered ${numbers[0]} to ${numbers[numbers.length - 1]}`
}

/** What a line or a call placed, in a sentence. */
export function baysSummary(made: BaysMade): string {
  const n = made.bays.length
  const b = made.bays[0]
  const size = b === undefined ? '' : ` ${m(b.width)} x ${m(b.length)} m`
  return `${n}${size} bay${n === 1 ? '' : 's'} ${made.room === null ? `in a row on floor ${made.floor}` : `in room ${made.room} on floor ${made.floor}`}, ${made.bays.length === 0 ? 'none' : `${made.bays[0]!.id} to ${made.bays[n - 1]!.id}`}, ${numbersSaid(made.bays)}`
}

// ── Ramps ────────────────────────────────────────────────────────────────────────────────────

/** A floor's id from a word after `from` or `to`: the floor, or the floor of the room it names. */
function endOf(plan: FloorPlan, word: string, which: 'from' | 'to', floors: readonly string[]): { floor: string; room: string | null } {
  if (floors.includes(word)) return { floor: word, room: null }
  const room = roomNamed(plan, word, null)
  if (room !== undefined) return { floor: floorOf(room), room: room.id }
  throw new ParkingRefused(`'${word}' after ${which} is neither a floor of the plan (its floors: ${floors.join(', ')}) nor a room.`)
}

/** A straight ramp's middle line in a room's box: face to face the way it runs, centred across or against `along`. */
function straightInBox(box: Box, width: number, runs: ParkingWay, along: ParkingWay | undefined, room: string): P[] {
  const [x0, y0, x1, y1] = box
  const wide = ns(runs) ? x1 - x0 : y1 - y0
  if (width > wide + tolerance('sameFace')) throw new ParkingRefused(`a ramp ${m(width)} m wide does not fit across room ${room}, which is ${m(wide)} m across.`)
  const s = along === undefined ? (ns(runs) ? (x0 + x1) / 2 : (y0 + y1) / 2) : along === 'west' ? x0 + width / 2 : along === 'east' ? x1 - width / 2 : along === 'south' ? y0 + width / 2 : y1 - width / 2
  const a = runs === 'north' ? [y0, y1] : runs === 'south' ? [y1, y0] : runs === 'east' ? [x0, x1] : [x1, x0]
  return ns(runs) ? [[settled(s), settled(a[0]!)], [settled(s), settled(a[1]!)]] : [[settled(a[0]!), settled(s)], [settled(a[1]!), settled(s)]]
}

/** How many stretches a helix of `turns` takes: `HELIX_STEPS` a turn, at most the schema's points. */
function helixSteps(turns: number): number {
  const want = turns * HELIX_STEPS
  const near = Math.round(want)
  const n = Math.abs(want - near) <= tolerance('noLength') ? near : Math.ceil(want)
  return Math.max(2, Math.min(n, RAMP_RUN_MAX - 1))
}

/** A helix's middle line: points on its circle, from the angle it starts at. */
export function helixRun(at: P, radius: number, turns: number, starts: number, clockwise: boolean): P[] {
  const n = helixSteps(turns)
  const sign = clockwise ? -1 : 1
  const out: P[] = []
  for (let k = 0; k <= n; k++) {
    const angle = ((starts + (sign * 360 * turns * k) / n) * Math.PI) / 180
    out.push([settled(at[0] + radius * Math.cos(angle)), settled(at[1] + radius * Math.sin(angle))])
  }
  return out
}

/** A ramp laid out from its words. */
export interface RampMade {
  readonly ramp: Ramp
  readonly room: string | null
  readonly layout: RampLayout
  readonly guesses: readonly string[]
}

/** What Grid worked out for a ramp, in a sentence. */
export function rampSummary(layout: RampLayout): string {
  const stated = layout.statedSlope === null ? '' : `, the slope stated ${slopeText(layout.statedSlope)}%`
  return `ramp ${layout.id} climbs ${m(layout.rise)} m from floor ${layout.lower.floor} to floor ${layout.upper.floor} over ${m(layout.length)} m along its middle line: slope ${slopeText(layout.slope)}% (1 in ${oneInText(layout.oneIn)})${stated}`
}

/**
 * The ramp its words give, laid out and checked as every ramp is (`planRamps`). Throws
 * `ParkingRefused`, its sentence starting in small letters, for a caller to put its own start on.
 */
export function layRamp(plan: FloorPlan, words: RampWords): RampMade {
  const floors = planFloors(plan).map((f) => f.id)
  if (!Number.isFinite(words.width) || words.width <= 0) throw new ParkingRefused("a ramp is given its width across its middle line, more than 0: '<width> wide'.")
  if (words.slope !== undefined && !(words.slope > 0)) throw new ParkingRefused('slope is the slope the design means, in percent, more than 0.')
  const from = endOf(plan, words.from, 'from', floors)
  const to = endOf(plan, words.to, 'to', floors)
  if (from.floor === to.floor) throw new ParkingRefused(`a ramp joins two floors, and from and to are both floor ${from.floor}.`)
  const guesses: string[] = []
  const shapeWords = words.room !== undefined || words.shape !== undefined || words.runs !== undefined || words.along !== undefined || words.at !== undefined || words.radius !== undefined || words.turns !== undefined || words.starts !== undefined || words.clockwise !== undefined
  let line: P[]
  let room: string | null = null
  const fallback = from.room ?? to.room
  if (words.run !== undefined) {
    if (shapeWords) throw new ParkingRefused("give the ramp's middle line ('run') or its shape (straight in a room, or helix), not both.")
    if (words.run.length < 2) throw new ParkingRefused('a middle line has two points or more: its edge on the from floor, each turn, and its edge on the to floor.')
    line = words.run.map((p) => [settled(p[0]), settled(p[1])] as P)
  } else if (words.shape === 'helix') {
    if (words.runs !== undefined || words.along !== undefined) throw new ParkingRefused("a helix turns round its middle: 'runs' and 'along' are for a straight ramp.")
    const turns = words.turns ?? 1
    if (!(turns > 0) || turns > (RAMP_RUN_MAX - 1) / HELIX_FEWEST) throw new ParkingRefused(`turns is how many full turns the helix makes between its two floors, more than 0 and at most ${m((RAMP_RUN_MAX - 1) / HELIX_FEWEST)}; a taller helix is one ramp a floor.`)
    const named = words.room ?? (words.at === undefined ? fallback ?? undefined : undefined)
    const shape = named === undefined ? null : roomShape(plan, named, words.room === undefined ? null : from.floor)
    if (shape !== null && words.room === undefined) guesses.push(`the ramp ${words.id} turns in room ${shape.room.id}, the room ${from.room !== null ? 'from' : 'to'} names.`)
    if (shape !== null) room = shape.room.id
    const box = shape?.box
    const at: P | undefined = words.at ?? (box === undefined ? undefined : [settled((box[0] + box[2]) / 2), settled((box[1] + box[3]) / 2)])
    if (at === undefined) throw new ParkingRefused("say where the helix turns: its middle, 'at x,y', or the room it turns in, 'in <room>'.")
    let radius = words.radius
    if (radius === undefined) {
      if (box === undefined) throw new ParkingRefused("give the helix its radius, to its middle line: 'radius <m>'.")
      radius = settled(Math.min(at[0] - box[0], box[2] - at[0], at[1] - box[1], box[3] - at[1]) - words.width / 2)
      guesses.push(`the helix's middle line has a radius of ${m(radius)} m, the largest room ${shape!.room.id} holds for a ramp ${m(words.width)} m wide.`)
    }
    if (!(radius - words.width / 2 > tolerance('sameFace'))) throw new ParkingRefused(`a helix ${m(words.width)} m wide needs a radius to its middle line of more than ${m(words.width / 2)} m, half its width, so its inner edge goes round a middle${words.radius === undefined && shape !== null ? `, and room ${shape.room.id} holds ${m(radius)} m` : ''}.`)
    if (box !== undefined) {
      const reach = radius + words.width / 2
      const near = tolerance('sameFace')
      if (at[0] - reach < box[0] - near || at[0] + reach > box[2] + near || at[1] - reach < box[1] - near || at[1] + reach > box[3] + near) {
        throw new ParkingRefused(`a helix of radius ${m(radius)} m and ${m(words.width)} m wide reaches ${m(reach)} m from its middle, past the walls of room ${shape!.room.id}, which is ${m(box[2] - box[0])} m by ${m(box[3] - box[1])} m inside.`)
      }
    }
    const starts = words.starts ?? ANGLE.south
    if (words.starts === undefined) guesses.push(`the helix ${words.id} starts at the south of its circle and turns ${words.clockwise === true ? 'clockwise' : 'counter-clockwise'} going from floor ${from.floor}.`)
    line = helixRun(at, radius, turns, starts, words.clockwise === true)
  } else {
    if (words.at !== undefined || words.radius !== undefined || words.turns !== undefined || words.starts !== undefined || words.clockwise !== undefined) throw new ParkingRefused("'at', 'radius', 'turns', 'starts' and 'clockwise' are for a helix: write 'helix'.")
    const named = words.room ?? fallback ?? undefined
    if (named === undefined) throw new ParkingRefused("say the room the ramp goes in ('in <room>'), or give its middle line ('run x,y x,y ...') or a helix.")
    if (words.runs === undefined) throw new ParkingRefused(`say the way a straight ramp runs from ${words.from} ('runs north', 'runs east' and so on).`)
    if (words.along !== undefined && !across(words.runs, words.along)) throw new ParkingRefused(`a ramp that runs ${words.runs} goes along a side beside it: 'along ${words.along}' is not.`)
    const shape = roomShape(plan, named, words.room === undefined ? null : from.floor)
    if (words.room === undefined) guesses.push(`the ramp ${words.id} goes in room ${shape.room.id}, the room ${from.room !== null ? 'from' : 'to'} names.`)
    room = shape.room.id
    line = straightInBox(shape.box, words.width, words.runs, words.along, shape.room.id)
  }
  if (room !== null) {
    const host = plan.rooms.find((r) => r.id === room)!
    if (floorOf(host) !== from.floor && floorOf(host) !== to.floor) throw new ParkingRefused(`room ${room} is on floor ${floorOf(host)}, which the ramp does not join (it joins ${from.floor} and ${to.floor}).`)
  }
  const ramp: Ramp = {
    id: words.id,
    ...(words.name === undefined ? {} : { name: words.name }),
    from: from.floor,
    to: to.floor,
    width: words.width,
    run: line.map((p) => [p[0], p[1]] as [number, number]),
    ...(words.slope === undefined ? {} : { slope: words.slope }),
  }
  const checked = RampSchema.safeParse(ramp)
  if (!checked.success) throw new ParkingRefused(`the ramp would not be read: ${checked.error.issues[0]!.path.join('.')} ${checked.error.issues[0]!.message}.`)
  const others = (plan.ramps ?? []).filter((r) => r.id !== ramp.id)
  const withRamp: FloorPlan = { ...plan, ramps: [...others, ramp] }
  const error = parkingIssues(withRamp).find((issue) => issue.id === ramp.id && issue.severity === 'error')
  const layout = planRamps(withRamp).ramps.find((r) => r.id === ramp.id)
  if (error !== undefined || layout === undefined) throw new ParkingRefused(lower(error?.message ?? `ramp ${ramp.id} could not be laid out.`))
  return { ramp, room, layout, guesses }
}

// ── The read-back ────────────────────────────────────────────────────────────────────────────

/** An id a line gives back as it is: one word of plain letters. */
const readable = (id: string): boolean => /^[A-Za-z0-9._-]+$/.test(id) && plainId(id) === id
const quoteText = (text: string): string => (readable(text) ? text : text.includes('"') ? `'${text}'` : `"${text}"`)

const sameBay = (a: Bay, b: Bay): boolean =>
  a.id === b.id && a.number === b.number && settled(a.at[0]) === settled(b.at[0]) && settled(a.at[1]) === settled(b.at[1]) && a.width === b.width && a.length === b.length && (a.turn ?? 0) === (b.turn ?? 0) && floorOf(a) === floorOf(b)

const wayOf = (d: P): ParkingWay | null => {
  const near = tolerance('sameFace')
  if (Math.abs(d[0]) <= near && Math.abs(d[1]) > near) return d[1] > 0 ? 'north' : 'south'
  if (Math.abs(d[1]) <= near && Math.abs(d[0]) > near) return d[0] > 0 ? 'east' : 'west'
  return null
}

const idParts = (id: string): { group: string; k: number } | null => {
  const found = /^(.+)-(0|[1-9][0-9]{0,8})$/.exec(id)
  return found === null ? null : { group: found[1]!, k: Number(found[2]!) }
}

/** The rows bays make, in their order: each the longest run that laying its row out gives back. */
function rowsOf(bays: readonly Bay[]): RowSpec[] {
  const rows: RowSpec[] = []
  let i = 0
  while (i < bays.length) {
    const spec = rowFrom(bays, i)
    rows.push(spec)
    i += spec.count
  }
  return rows
}

/** The row starting at bay `i`: one bay when no longer row gives back the same bays. */
function rowFrom(bays: readonly Bay[], i: number): RowSpec {
  const a = bays[i]!
  const one: RowSpec = { group: a.id, first: -1, at: a.at, runs: 'east', count: 1, width: a.width, length: a.length }
  const b = bays[i + 1]
  const pa = idParts(a.id)
  if (b === undefined || pa === null || (a.number !== undefined && !/\d$/.test(a.number))) return one
  const runs = wayOf([b.at[0] - a.at[0], b.at[1] - a.at[1]])
  if (runs === null) return one
  const pitch = settled(Math.abs(b.at[0] - a.at[0]) + Math.abs(b.at[1] - a.at[1]))
  const turnStated = a.turn ?? 0
  const turnDefault = defaultTurn(runs) ?? 0
  const base: RowSpec = {
    group: pa.group,
    first: pa.k,
    at: a.at,
    runs,
    count: 1,
    width: a.width,
    length: a.length,
    ...(pitch === a.width ? {} : { pitch }),
    ...(turnStated === turnDefault ? {} : { turn: turnStated }),
    ...(a.number === undefined ? {} : { numbered: a.number }),
    ...(a.floor === undefined ? {} : { floor: a.floor }),
  }
  let count = 1
  for (let n = 2; i + n <= bays.length; n++) {
    let laid: Bay[]
    try {
      laid = rowBays({ ...base, count: n })
    } catch {
      break
    }
    if (!sameBay(laid[n - 1]!, bays[i + n - 1]!)) break
    count = n
  }
  if (count < 2 || !sameBay(rowBays({ ...base, count: 1 })[0]!, a)) return one
  return { ...base, count }
}

/** A bay's line. */
function bayLine(bay: Bay, floors: boolean): string {
  const parts = [`${exact(bay.width)} x ${exact(bay.length)}`]
  if (bay.turn !== undefined) parts.push(`turn ${exact(bay.turn)}`)
  if (bay.number !== undefined) parts.push(`number ${quoteText(bay.number)}`)
  if (floors || bay.floor !== undefined) parts.push(`on ${floorOf(bay)}`)
  return `bay ${bay.id} at ${exact(bay.at[0])},${exact(bay.at[1])}, ${parts.join(', ')}`
}

/** A row's line, by its first bay. */
export function rowLine(spec: RowSpec, floors: boolean): string {
  const parts = [`${exact(spec.width)} x ${exact(spec.length)}`, `count ${spec.count}`, `runs ${spec.runs}`]
  if (spec.pitch !== undefined) parts.push(`pitch ${exact(spec.pitch)}`)
  if (spec.turn !== undefined) parts.push(`turn ${exact(spec.turn)}`)
  if (spec.first !== 1) parts.push(`first ${spec.first}`)
  if (spec.numbered !== undefined) parts.push(`numbered ${quoteText(spec.numbered)}`)
  if (floors || spec.floor !== undefined) parts.push(`on ${spec.floor ?? floorOf({})}`)
  return `bays ${spec.group} at ${exact(spec.at[0])},${exact(spec.at[1])}, ${parts.join(', ')}`
}

/** The circle three points lie on, or null when they lie on a line. */
function circleOf(a: P, b: P, c: P): { at: P; radius: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) <= tolerance('noLength')) return null
  const sq = (p: P): number => p[0] * p[0] + p[1] * p[1]
  const x = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d
  const y = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d
  return { at: [x, y], radius: Math.hypot(a[0] - x, a[1] - y) }
}

/** The words of a ramp that give back its own middle line, as a helix or in a room; null when none do. */
export function rampWordsOf(plan: FloorPlan, ramp: Ramp): RampWords | null {
  const run = ramp.run.map((p) => [p[0], p[1]] as P)
  const own = { id: ramp.id, ...(ramp.name === undefined ? {} : { name: ramp.name }), from: ramp.from, to: ramp.to, width: ramp.width, ...(ramp.slope === undefined ? {} : { slope: ramp.slope }) }
  const same = (line: readonly P[]): boolean => line.length === run.length && line.every((p, i) => p[0] === settled(run[i]![0]) && p[1] === settled(run[i]![1]))
  if (run.length >= 4) {
    const circle = circleOf(run[0]!, run[1]!, run[2]!)
    if (circle !== null) {
      const at: P = [nice(circle.at[0]), nice(circle.at[1])]
      const radius = nice(circle.radius)
      const angle = (p: P): number => (Math.atan2(p[1] - circle.at[1], p[0] - circle.at[0]) * 180) / Math.PI
      let step = angle(run[1]!) - angle(run[0]!)
      if (step > 180) step -= 360
      if (step <= -180) step += 360
      const starts = nice(((angle(run[0]!) % 360) + 360) % 360) % 360
      const turns = nice((Math.abs(step) * (run.length - 1)) / 360)
      const clockwise = step < 0
      if (turns > 0 && same(helixRun(at, radius, turns, starts, clockwise))) return { ...own, shape: 'helix', at, radius, turns, starts, ...(clockwise ? { clockwise } : {}) }
    }
  }
  if (run.length !== 2) return null
  const runs = wayOf([run[1]![0] - run[0]![0], run[1]![1] - run[0]![1]])
  if (runs === null) return null
  const index = indexPlan(plan)
  const middle = { x: (run[0]![0] + run[1]![0]) / 2, y: (run[0]![1] + run[1]![1]) / 2 }
  const rooms = plan.rooms
    .filter((r) => (floorOf(r) === ramp.from || floorOf(r) === ramp.to) && readable(r.id))
    .map((r) => ({ room: r, poly: tryRoomPolygon(r, index) }))
    .filter((r): r is { room: Room; poly: Vec2[] } => r.poly !== null && pointInPolygon(middle, r.poly))
    .sort((a, b) => (floorOf(a.room) === ramp.from ? 0 : 1) - (floorOf(b.room) === ramp.from ? 0 : 1))
  for (const { room, poly } of rooms) {
    for (const along of [undefined, CLOCKWISE[runs], OPPOSITE[CLOCKWISE[runs]]]) {
      try {
        if (same(straightInBox(boxOf(poly), ramp.width, runs, along, room.id))) return { ...own, room: room.id, shape: 'straight', runs, ...(along === undefined ? {} : { along }) }
      } catch {
        // A box the ramp does not fit gives no words.
      }
    }
  }
  return null
}

const startsText = (deg: number): string => {
  const side = (Object.keys(ANGLE) as ParkingWay[]).find((way) => ANGLE[way] === deg)
  return side ?? exact(deg)
}

/** A ramp's line from its words. */
export function rampLine(words: RampWords): string {
  const head = `ramp ${words.id}${words.name === undefined ? '' : ` ${words.name.includes('"') ? `'${words.name}'` : `"${words.name}"`}`} from ${words.from} to ${words.to}`
  const parts = [`${exact(words.width)} wide`]
  if (words.run !== undefined) parts.push(`run ${words.run.map((p) => `${exact(p[0])},${exact(p[1])}`).join(' ')}`)
  else if (words.shape === 'helix') {
    const helix = ['helix']
    if (words.at !== undefined) helix.push(`at ${exact(words.at[0])},${exact(words.at[1])}`)
    if (words.radius !== undefined) helix.push(`radius ${exact(words.radius)}`)
    if (words.turns !== undefined) helix.push(`turns ${exact(words.turns)}`)
    if (words.starts !== undefined) helix.push(`starts ${startsText(words.starts)}`)
    if (words.clockwise === true) helix.push('clockwise')
    parts.push(helix.join(' '))
  } else {
    parts.push('straight')
    parts.push(`runs ${words.runs}${words.along === undefined ? '' : ` along ${words.along}`}`)
  }
  if (words.slope !== undefined) parts.push(`slope ${exact(words.slope)}`)
  return `${head}${words.room === undefined ? '' : ` in ${words.room}`}, ${parts.join(', ')}`
}

/**
 * The plan's bays and ramps as rooms text, after its floors: bays in rows where laying the row out
 * again gives the same bays, one line each otherwise, and raw when Grid leaves one out; ramps as a
 * helix or in their room when that gives back their middle line, along it otherwise, raw when Grid
 * cannot lay one out. So writing the text again keeps them as they are.
 */
export function parkingLines(plan: FloorPlan): string[] {
  const bays = plan.bays ?? []
  const ramps = plan.ramps ?? []
  if (bays.length === 0 && ramps.length === 0) return []
  const floors = plan.floors !== undefined
  const lines: string[] = []
  const out = leftOutBays(plan)
  // The bays a line can write, kept in their order between the raw ones.
  let run: Bay[] = []
  const flush = (): void => {
    let i = 0
    while (i < run.length) {
      const spec = rowFrom(run, i)
      lines.push(spec.first < 0 ? bayLine(run[i]!, floors) : rowLine(spec, floors))
      i += spec.count
    }
    run = []
  }
  const seen = new Set<string>()
  for (const bay of bays) {
    const twice = seen.has(bay.id)
    seen.add(bay.id)
    const plain = readable(bay.id) && (bay.floor === undefined || readable(bay.floor))
    if (twice || out.has(bay) || !plain) {
      flush()
      lines.push(`raw bay ${JSON.stringify(bay)}`)
    } else run.push(bay)
  }
  flush()
  const laid = planRamps(plan)
  const rampSeen = new Set<string>()
  for (const ramp of ramps) {
    const twice = rampSeen.has(ramp.id)
    rampSeen.add(ramp.id)
    if (twice || laid.faults.has(ramp) || ![ramp.id, ramp.from, ramp.to].every(readable)) {
      lines.push(`raw ramp ${JSON.stringify(ramp)}`)
      continue
    }
    const words = rampWordsOf(plan, ramp)
    lines.push(rampLine(words ?? { id: ramp.id, ...(ramp.name === undefined ? {} : { name: ramp.name }), from: ramp.from, to: ramp.to, width: ramp.width, run: ramp.run.map((p) => [p[0], p[1]] as P), ...(ramp.slope === undefined ? {} : { slope: ramp.slope }) }))
  }
  return lines
}

// ── The lines ────────────────────────────────────────────────────────────────────────────────

const BAY_USAGE = "write 'bay <id> at x,y, <width> x <length> [turn <deg>] [number <n>] [on <floor>]'."
const BAYS_USAGE =
  "write 'bays <group> in <room> along <side>, <width> x <length> [count <n>] [offset <m>] [from <end>] [inset <m>] [numbered <first>]', 'bays <group> in <room> fill, <width> x <length> [aisle <m>] [rows east-west|north-south] [from <side>] [count <n>] [numbered <first>]', or by its first bay: 'bays <group> at x,y, <width> x <length>, count <n>, runs <way> [pitch <m>] [turn <deg>] [first <k>] [numbered <first>]'."
const RAMP_USAGE =
  "write 'ramp <id> from <floor|room> to <floor|room> in <room>, <width> wide, straight, runs <way> [along <side>] [slope <%>]', '..., <width> wide, helix [at x,y] [radius <m>] [turns <n>] [starts <side|deg>] [clockwise]', or with its middle line: '..., <width> wide, run x,y x,y ...'."

/** The words a line reads one after another, stopping with its code and line. */
class Reader {
  i: number
  constructor(
    readonly t: readonly string[],
    readonly quoted: readonly LineWord[],
    readonly at: number,
    readonly plain: PlainNumbers,
    readonly code: string,
    start: number
  ) {
    this.i = start
  }

  stop(message: string): never {
    throw new RoomsStop(this.code, `${this.at > 0 ? `line ${this.at}: ` : ''}${message}`, this.at > 0 ? this.at : null)
  }

  get word(): string | undefined {
    return this.t[this.i]
  }

  get next(): string | undefined {
    return this.t[this.i + 1]
  }

  length(after: string): number {
    const word = this.next
    if (word === undefined) return this.stop(`'${after}' takes a length.`)
    this.i += 2
    return numberOf(word, this.at, this.plain)
  }

  plainNumber(after: string): number {
    const word = this.next
    const n = word === undefined ? NaN : Number(word.replace(/%$/, ''))
    if (!Number.isFinite(n)) return this.stop(`'${after}' takes a number${word === undefined ? '' : `, not '${word}'`}.`)
    this.i += 2
    return n
  }

  whole(after: string, least: number): number {
    const n = this.plainNumber(after)
    if (!Number.isInteger(n) || n < least) return this.stop(`'${after}' takes a whole number, ${least} or more.`)
    return n
  }

  way(after: string): ParkingWay {
    const word = this.next
    if (word !== undefined && (PARKING_WAYS as readonly string[]).includes(word)) {
      this.i += 2
      return word as ParkingWay
    }
    return this.stop(`'${after}' takes north, south, east or west${word === undefined ? '' : `, not '${word}'`}.`)
  }

  point(after: string): P {
    const word = this.next
    if (word === undefined || !isPointWord(word)) return this.stop(`'${after}' takes a point written x,y with no space.`)
    this.i += 2
    return pointOf(word, this.at, this.plain)
  }

  text(after: string): string {
    const word = this.quoted[this.i + 1]
    if (word === undefined) return this.stop(`'${after}' takes a word.`)
    this.i += 2
    return word.text
  }

  /** `<w> x <l>` or a kind word, when the line is at one. */
  size(into: { width?: number; length?: number; kind?: BayKind }): boolean {
    const word = this.word!
    if ((BAY_KINDS as readonly string[]).includes(word)) {
      if (into.kind !== undefined || into.width !== undefined) this.stop('the line gives the bays\' size twice.')
      into.kind = word as BayKind
      this.i += 1
      return true
    }
    if (this.next === 'x' && this.t[this.i + 2] !== undefined) {
      if (into.kind !== undefined || into.width !== undefined) this.stop('the line gives the bays\' size twice.')
      into.width = numberOf(word, this.at, this.plain)
      into.length = numberOf(this.t[this.i + 2]!, this.at, this.plain)
      this.i += 3
      return true
    }
    return false
  }
}

/** A set-once record of a line's words. */
function once<T extends object>(r: Reader): { set: <K extends keyof T>(into: T, key: K, value: T[K], word: string) => void } {
  return {
    set(into, key, value, word) {
      if ((into as Record<string, unknown>)[key as string] !== undefined) r.stop(`the line says '${word}' twice.`)
      ;(into as Record<string, unknown>)[key as string] = value
    },
  }
}

/** The words of a `bay` line, after `bay`; `at` its line, or 0 from a tool. */
export function bayOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers = PLAIN_METRES): BayWords {
  const r = new Reader(t, quoted, at, plain, 'rooms/bay', 2)
  const id = t[1]
  if (id === undefined || quoted[1]?.quoted === true) return r.stop(`a bay needs an id after 'bay'; ${BAY_USAGE}`)
  const words: { at?: P; width?: number; length?: number; kind?: BayKind; turn?: number; number?: string; floor?: string } = {}
  const set = once<typeof words>(r).set
  while (r.word !== undefined) {
    const word = r.word
    if (word === 'at') set(words, 'at', r.point('at'), 'at')
    else if (word === 'turn' || word === 'turned') set(words, 'turn', r.plainNumber(word), word)
    else if (word === 'number') set(words, 'number', r.text('number'), 'number')
    else if (word === 'on') set(words, 'floor', r.text('on'), 'on')
    else if (!r.size(words)) return r.stop(`'${word}' is not a word a bay line knows; ${BAY_USAGE}`)
  }
  if (words.at === undefined) return r.stop(`a bay says where its middle is, 'at x,y'; ${BAY_USAGE}`)
  return { id, ...(words as Omit<BayWords, 'id'>), at: words.at }
}

/** The words of a `bays` line, after `bays`; `at` its line, or 0 from a tool. */
export function baysOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers = PLAIN_METRES): BaysWords {
  const r = new Reader(t, quoted, at, plain, 'rooms/bay', 2)
  const group = t[1]
  if (group === undefined || quoted[1]?.quoted === true) return r.stop(`a row of bays needs a group id after 'bays', which names its bays <group>-1, <group>-2 and on; ${BAYS_USAGE}`)
  const words: { -readonly [K in keyof BaysWords]?: BaysWords[K] } = {}
  const set = once<typeof words>(r).set
  while (r.word !== undefined) {
    const word = r.word
    if (word === 'in') set(words, 'room', r.text('in'), 'in')
    else if (word === 'along') {
      if (words.how !== undefined) r.stop("a row is 'along <side>', 'fill' or 'at x,y', one of them.")
      words.how = 'along'
      words.side = r.way('along')
    } else if (word === 'fill') {
      if (words.how !== undefined) r.stop("a row is 'along <side>', 'fill' or 'at x,y', one of them.")
      words.how = 'fill'
      r.i += 1
    } else if (word === 'at') {
      if (words.how !== undefined) r.stop("a row is 'along <side>', 'fill' or 'at x,y', one of them.")
      words.how = 'at'
      words.at = r.point('at')
    } else if (word === 'count') set(words, 'count', r.whole('count', 1), 'count')
    else if (word === 'offset') set(words, 'offset', r.length('offset'), 'offset')
    else if (word === 'inset') set(words, 'inset', r.length('inset'), 'inset')
    else if (word === 'from') set(words, 'from', r.way('from'), 'from')
    else if (word === 'aisle') set(words, 'aisle', r.length('aisle'), 'aisle')
    else if (word === 'rows') {
      const next = r.next
      if (next === undefined || !(BAY_ROWS as readonly string[]).includes(next)) r.stop(`'rows' takes east-west or north-south${next === undefined ? '' : `, not '${next}'`}.`)
      set(words, 'rows', next as BayRows, 'rows')
      r.i += 2
    } else if (word === 'numbered') set(words, 'numbered', r.text('numbered'), 'numbered')
    else if (word === 'first') set(words, 'first', r.whole('first', 0), 'first')
    else if (word === 'runs') set(words, 'runs', r.way('runs'), 'runs')
    else if (word === 'pitch') set(words, 'pitch', r.length('pitch'), 'pitch')
    else if (word === 'turn' || word === 'turned') set(words, 'turn', r.plainNumber(word), word)
    else if (word === 'on') set(words, 'floor', r.text('on'), 'on')
    else if (!r.size(words)) return r.stop(`'${word}' is not a word a bays line knows; ${BAYS_USAGE}`)
  }
  if (words.how === undefined) return r.stop(`say where the row goes: 'in <room> along <side>', 'in <room> fill' or 'at x,y'; ${BAYS_USAGE}`)
  if (words.how !== 'at' && words.room === undefined) return r.stop(`'${words.how}' lays the bays in a room: say which, 'in <room>'.`)
  if (words.how === 'at' && words.room !== undefined) return r.stop("a row by its first bay ('at x,y') is in no room: leave out 'in'.")
  const only = (list: readonly (keyof BaysWords)[], how: string): void => {
    const extra = list.filter((k) => words[k] !== undefined)
    if (extra.length > 0) r.stop(`'${extra[0]!}' is not for a row ${how}.`)
  }
  if (words.how === 'along') only(['aisle', 'rows', 'runs', 'pitch', 'turn'], "along a side (it is for 'fill' or a row by its first bay)")
  if (words.how === 'fill') only(['offset', 'inset', 'runs', 'pitch', 'turn'], "that fills a room (it is for 'along' or a row by its first bay)")
  if (words.how === 'at') only(['offset', 'inset', 'aisle', 'rows', 'from'], "by its first bay (it is for a row in a room)")
  return { group, ...(words as Omit<BaysWords, 'group'>), how: words.how }
}

const SHAPE_WORDS = ['straight', 'helix', 'spiral']

/** The words of a `ramp` line, after `ramp`; `at` its line, or 0 from a tool. */
export function rampOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers = PLAIN_METRES): RampWords {
  const r = new Reader(t, quoted, at, plain, 'rooms/ramp', 2)
  const id = t[1]
  if (id === undefined || quoted[1]?.quoted === true) return r.stop(`a ramp needs an id after 'ramp'; ${RAMP_USAGE}`)
  let name: string | undefined
  if (quoted[2]?.quoted === true) {
    name = quoted[2].text
    r.i = 3
  }
  const words: { -readonly [K in keyof RampWords]?: RampWords[K] } = {}
  const set = once<typeof words>(r).set
  while (r.word !== undefined) {
    const word = r.word
    const next = r.next
    if (word === 'from' || word === 'to' || word === 'in') set(words, word === 'in' ? 'room' : word, r.text(word), word)
    else if (next === 'wide') {
      set(words, 'width', numberOf(word, at, plain), 'wide')
      r.i += 2
    } else if (word === 'width') set(words, 'width', r.length('width'), 'width')
    else if (SHAPE_WORDS.includes(word)) {
      set(words, 'shape', word === 'straight' ? 'straight' : 'helix', word)
      r.i += 1
    } else if (word === 'runs' || word === 'along') set(words, word, r.way(word), word)
    else if (word === 'at') set(words, 'at', r.point('at'), 'at')
    else if (word === 'radius') set(words, 'radius', r.length('radius'), 'radius')
    else if (word === 'turns') {
      const n = r.plainNumber('turns')
      if (!(n > 0)) r.stop("'turns' takes how many full turns, more than 0.")
      set(words, 'turns', n, 'turns')
    } else if (word === 'starts') {
      if (next !== undefined && (PARKING_WAYS as readonly string[]).includes(next)) {
        set(words, 'starts', ANGLE[next as ParkingWay], 'starts')
        r.i += 2
      } else set(words, 'starts', r.plainNumber('starts'), 'starts')
    } else if (word === 'clockwise' || word === 'counter-clockwise' || word === 'anticlockwise' || word === 'counterclockwise') {
      set(words, 'clockwise', word === 'clockwise', word)
      r.i += 1
    } else if (word === 'slope') set(words, 'slope', r.plainNumber('slope'), 'slope')
    else if (word === 'run') {
      const points: P[] = []
      r.i += 1
      while (r.word !== undefined && isPointWord(r.word)) points.push(pointOf(t[r.i++]!, at, plain))
      if (points.length < 2) r.stop("'run' takes the ramp's middle line, x,y x,y ...: two points or more.")
      set(words, 'run', points, 'run')
    } else return r.stop(`'${word}' is not a word a ramp line knows; ${RAMP_USAGE}`)
  }
  if (words.from === undefined || words.to === undefined) return r.stop(`a ramp says the floors it joins, 'from <floor|room> to <floor|room>'; ${RAMP_USAGE}`)
  if (words.width === undefined) return r.stop("a ramp says how wide it is, '<width> wide', across its middle line.")
  // A counter-clockwise helix is the one Grid lays when nothing is said.
  if (words.clockwise === false) delete words.clockwise
  return { id, ...(name === undefined ? {} : { name }), ...(words as Omit<RampWords, 'id' | 'name'>) }
}

/** A note on the lines, as the compiler records its others. */
export interface ParkingNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

type Entry =
  | { readonly line: number; readonly kind: 'bay'; readonly words: BayWords; readonly floor: string | null }
  | { readonly line: number; readonly kind: 'bays'; readonly words: BaysWords; readonly floor: string | null }
  | { readonly line: number; readonly kind: 'ramp'; readonly words: RampWords }
  | { readonly line: number; readonly kind: 'raw bay'; readonly bay: Bay }
  | { readonly line: number; readonly kind: 'raw ramp'; readonly ramp: Ramp }

/** The other parts' ids, which a bay's or a ramp's may not share. */
function partIds(plan: FloorPlan): Set<string> {
  return new Set([...plan.walls.map((w) => w.id), ...plan.rooms.map((r) => r.id), ...plan.openings.map((o) => o.id), ...(plan.stairs ?? []).map((s) => s.id), ...(plan.items ?? []).map((i) => i.id), ...(plan.columns ?? []).map((c) => c.id)])
}

/** The bay and ramp lines of a text, read as they come and laid out once the rooms are drawn. */
export class ParkingLines {
  private readonly entries: Entry[] = []

  get written(): { bays: boolean; ramps: boolean } {
    return { bays: this.entries.some((e) => e.kind === 'bay' || e.kind === 'bays' || e.kind === 'raw bay'), ramps: this.entries.some((e) => e.kind === 'ramp' || e.kind === 'raw ramp') }
  }

  /** The ids of the raw bays and ramps: the plan file's own, which the check names but never refuses. */
  rawIds(): string[] {
    return this.entries.flatMap((e) => (e.kind === 'raw bay' ? [e.bay.id] : e.kind === 'raw ramp' ? [e.ramp.id] : []))
  }

  /** A line starting `bay`, `bays` or `ramp`; `floor` the floor line above it, null for none. */
  read(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers, floor: string | null): void {
    if (t[0] === 'bay') this.entries.push({ line: at, kind: 'bay', words: bayOfWords(t, quoted, at, plain), floor })
    else if (t[0] === 'bays') this.entries.push({ line: at, kind: 'bays', words: baysOfWords(t, quoted, at, plain), floor })
    else this.entries.push({ line: at, kind: 'ramp', words: rampOfWords(t, quoted, at, plain) })
  }

  /** `raw bay {...}` or `raw ramp {...}`: Grid's own JSON, taken as it is, never laid out again. */
  raw(kind: 'bay' | 'ramp', json: string, at: number): void {
    const list = kind === 'bay' ? 'bays' : 'ramps'
    const form = kind === 'bay' ? '{"id", "at": [x, y], "width", "length"}' : '{"id", "from", "to", "width", "run": [[x, y], ...]}'
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw new RoomsStop('rooms/raw', `line ${at}: a raw ${kind} is one JSON object on the rest of the line, as Grid's plan file holds it in "${list}"; this one could not be read.`, at)
    }
    const checked = kind === 'bay' ? BaySchema.safeParse(value) : RampSchema.safeParse(value)
    if (!checked.success) {
      const issue = checked.error.issues[0]!
      throw new RoomsStop('rooms/raw', `line ${at}: the raw ${kind} would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}. A ${kind} is ${form} as Grid's plan file holds it.`, at)
    }
    if (kind === 'bay') this.entries.push({ line: at, kind: 'raw bay', bay: checked.data as Bay })
    else this.entries.push({ line: at, kind: 'raw ramp', ramp: checked.data as Ramp })
  }

  /** The plan's bays and ramps, in the order of their lines, and what the lines say about them. */
  finish(plan: FloorPlan | null): { bays?: Bay[]; ramps?: Ramp[]; problems: ParkingNote[]; guesses: string[] } {
    const problems: ParkingNote[] = []
    const guesses: string[] = []
    const { bays: anyBays, ramps: anyRamps } = this.written
    if (!anyBays && !anyRamps) return { problems, guesses }
    const bays: Bay[] = []
    const ramps: Ramp[] = []
    const ids = new Map<string, number>()
    const others = plan === null ? new Set<string>() : partIds(plan)
    const floors = plan === null ? [] : planFloors(plan).map((f) => f.id)
    const problem = (code: string, line: number, message: string): void => {
      problems.push({ code, line, message: `line ${line}: ${message}` })
    }
    /** Whether the ids are free, recording them; a problem when one is not. */
    const free = (list: readonly string[], line: number): boolean => {
      for (const id of list) {
        const first = ids.get(id)
        if (first !== undefined || others.has(id)) {
          problem('rooms/duplicate-id', line, `the id '${id}' is used ${first === undefined ? 'by another part of the plan' : `on line ${first} too`}; bays and ramps share one set of ids with walls, rooms, openings, stairs, items and columns.`)
          return false
        }
      }
      for (const id of list) ids.set(id, line)
      return true
    }
    const floorKnown = (floor: string | undefined, line: number): boolean => {
      if (floor === undefined || floors.includes(floor)) return true
      problem('rooms/bay', line, `the plan has no floor '${floor}' (its floors: ${floors.join(', ')}).`)
      return false
    }
    // A floor line above a bay gives its floor only in a plan that lists its floors.
    const above = (floor: string | null): string | null => (plan?.floors === undefined ? null : floor)
    for (const entry of this.entries) {
      if (entry.kind === 'raw bay') {
        if (free([entry.bay.id], entry.line)) bays.push(entry.bay)
        continue
      }
      if (entry.kind === 'raw ramp') {
        if (free([entry.ramp.id], entry.line)) ramps.push(entry.ramp)
        continue
      }
      // A plan that cannot be read is refused for what else is wrong with it.
      if (plan === null) continue
      try {
        if (entry.kind === 'bay') {
          if (!floorKnown(entry.words.floor, entry.line)) continue
          const made = layBay(entry.words, above(entry.floor))
          if (!free([made.bay.id], entry.line)) continue
          bays.push(made.bay)
          guesses.push(...made.guesses.map((g) => `Line ${entry.line}: ${g}`))
        } else if (entry.kind === 'bays') {
          if (!floorKnown(entry.words.floor, entry.line)) continue
          const made = layBays({ ...plan, bays }, entry.words, above(entry.floor), bays)
          if (!free(made.bays.map((b) => b.id), entry.line)) continue
          bays.push(...made.bays)
          guesses.push(...made.guesses.map((g) => `Line ${entry.line}: ${g}`), `Line ${entry.line}: ${baysSummary(made)}.`)
        } else {
          const made = layRamp({ ...plan, bays, ramps }, entry.words)
          if (!free([made.ramp.id], entry.line)) continue
          ramps.push(made.ramp)
          guesses.push(...made.guesses.map((g) => `Line ${entry.line}: ${g}`), `Line ${entry.line}: ${rampSummary(made.layout)}.`)
        }
      } catch (error) {
        if (!(error instanceof ParkingRefused)) throw error
        problem(entry.kind === 'ramp' ? 'rooms/ramp' : 'rooms/bay', entry.line, error.message)
      }
    }
    return { ...(anyBays ? { bays } : {}), ...(anyRamps ? { ramps } : {}), problems, guesses }
  }
}
