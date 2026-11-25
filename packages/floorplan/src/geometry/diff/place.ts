/**
 * Pairing two versions of a plan by what stands where (WRT-8), before any id is trusted.
 *
 * Two versions of one building can share no ids: rooms text names its walls by where they are,
 * an import names everything afresh, an agent rewrites the file. Matched by id alone, the same
 * building reads as dozens of changes (lab WR-8, Y-4, RT-8). So the earlier plan is first laid
 * on the later one: moved to the later plan's origin when that pairs more walls (a shifted
 * origin), then each wall is paired with the wall standing in its place, its two ends within
 * `diffPlace` either way round, each opening with the opening at its place (or, its wall moved,
 * at its place along the paired wall: WRT-12), and each room with
 * the room that has the same walls or the same floor in the same place. What is left is paired
 * by id. A plan written rooms first names its rooms and openings itself, so there those are
 * paired by id first and by place after (lab RT-8).
 *
 * The result is the earlier plan moved and written under the later plan's ids: what the id diff
 * (`diffPlans`) then compares, so a wall that only got a new name is no change at all.
 *
 * Pure: plans in, plain data out.
 */

import type { FloorPlan, Opening, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { floorOf } from '../floors'
import { tryRoomPolygon } from '../room'
import { area, centroid, distance } from '../vec2'
import type { Vec2 } from '../vec2'
import { compareText } from './order'
import { tolerance } from '../tolerances'
import type { EntityType } from './types'

export interface RenamedId {
  readonly type: Exclude<EntityType, 'floor'>
  readonly before: string
  readonly after: string
}

/** Walls drawn in other pieces: one wall of a version standing exactly where several of the other stand, end to end. */
export interface Redrawn {
  /** Earlier wall ids, as the earlier plan names them. */
  readonly before: readonly string[]
  /** Later wall ids. */
  readonly after: readonly string[]
}

export interface Alignment {
  /** Added to every earlier coordinate to lay it on the later plan. [0, 0] when nothing moved. */
  readonly shift: readonly [number, number]
  /** Earlier id to later id, for every pair, renamed or not. */
  readonly walls: ReadonlyMap<string, string>
  readonly openings: ReadonlyMap<string, string>
  readonly rooms: ReadonlyMap<string, string>
  /** The pairs whose ids differ, by type then earlier id. */
  readonly renamed: readonly RenamedId[]
  /** Walls one version draws as one and the other as several pieces end to end (lab RT-8). */
  readonly redrawn: readonly Redrawn[]
  /** The earlier plan, moved by `shift`, under the later plan's ids. */
  readonly aligned: FloorPlan
}

export interface AlignOptions {
  /** Pair rooms and openings by id before place: their ids are the author's (rooms first). */
  readonly idsFirst?: boolean
}

type Point = readonly [number, number]

const moved = (p: Point, shift: Point): [number, number] => [p[0] + shift[0], p[1] + shift[1]]
const vec = (p: Point): Vec2 => ({ x: p[0], y: p[1] })

/** The corner of the box round a plan's solid walls, the lowest x and y; null with none. */
function lowCorner(plan: FloorPlan): Point | null {
  let x = Infinity
  let y = Infinity
  for (const wall of plan.walls) {
    if (wall.virtual === true) continue
    x = Math.min(x, wall.start[0], wall.end[0])
    y = Math.min(y, wall.start[1], wall.end[1])
  }
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

/** Points by the cell they fall in, so a lookup near a point reads nine cells, not every wall. */
class Cells<T> {
  private readonly cells = new Map<string, T[]>()
  constructor(private readonly size: number) {}
  private key(x: number, y: number): string {
    return `${Math.floor(x / this.size)}:${Math.floor(y / this.size)}`
  }
  add(p: Point, item: T): void {
    const key = this.key(p[0], p[1])
    const list = this.cells.get(key)
    if (list) list.push(item)
    else this.cells.set(key, [item])
  }
  near(p: Point): T[] {
    const cx = Math.floor(p[0] / this.size)
    const cy = Math.floor(p[1] / this.size)
    const found: T[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) found.push(...(this.cells.get(`${cx + dx}:${cy + dy}`) ?? []))
    }
    return found
  }
}

interface Candidate {
  readonly before: string
  readonly after: string
  readonly cost: number
  readonly reversed: boolean
}

/** One-to-one, cheapest first, ties by id: the same plans always pair the same way. */
function assign(candidates: Candidate[], taken: { before: Set<string>; after: Set<string> }): Candidate[] {
  candidates.sort((a, b) => a.cost - b.cost || compareText(a.before, b.before) || compareText(a.after, b.after))
  const chosen: Candidate[] = []
  for (const c of candidates) {
    if (taken.before.has(c.before) || taken.after.has(c.after)) continue
    taken.before.add(c.before)
    taken.after.add(c.after)
    chosen.push(c)
  }
  return chosen
}

/** The walls of `earlier`, moved by `shift`, that stand where a wall of `later` stands. */
function wallsByPlace(earlier: readonly Wall[], later: readonly Wall[], shift: Point): Candidate[] {
  const near = tolerance('diffPlace')
  const cells = new Cells<Wall>(near * 2)
  for (const wall of later) {
    cells.add(wall.start, wall)
    cells.add(wall.end, wall)
  }
  const candidates: Candidate[] = []
  for (const wall of earlier) {
    const s = moved(wall.start, shift)
    const e = moved(wall.end, shift)
    const seen = new Set<string>()
    for (const other of cells.near(s)) {
      if (seen.has(other.id)) continue
      seen.add(other.id)
      if (floorOf(other) !== floorOf(wall) || (other.virtual === true) !== (wall.virtual === true)) continue
      const along = Math.max(distance(vec(s), vec(other.start)), distance(vec(e), vec(other.end)))
      const back = Math.max(distance(vec(s), vec(other.end)), distance(vec(e), vec(other.start)))
      const cost = Math.min(along, back)
      if (cost > near) continue
      candidates.push({ before: wall.id, after: other.id, cost, reversed: back < along })
    }
  }
  return candidates
}

/** Where the middle of an opening sits on the plan, or null when its wall is not there. */
function middleOf(opening: Opening, walls: ReadonlyMap<string, Wall>, shift: Point = [0, 0]): Vec2 | null {
  const wall = walls.get(opening.wall)
  if (wall === undefined) return null
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
  if (length === 0) return null
  const t = (opening.offset + opening.width / 2) / length
  return {
    x: wall.start[0] + (wall.end[0] - wall.start[0]) * t + shift[0],
    y: wall.start[1] + (wall.end[1] - wall.start[1]) * t + shift[1]
  }
}

function openingsByPlace(
  earlier: FloorPlan,
  later: FloorPlan,
  shift: Point,
  wallPairs: ReadonlyMap<string, string>,
  taken: { before: Set<string>; after: Set<string> }
): Candidate[] {
  const near = tolerance('diffPlace')
  const earlierWalls = new Map(earlier.walls.map((w) => [w.id, w] as const))
  const laterWalls = new Map(later.walls.map((w) => [w.id, w] as const))
  const cells = new Cells<{ opening: Opening; at: Vec2 }>(near * 4)
  for (const opening of later.openings) {
    if (taken.after.has(opening.id)) continue
    const at = middleOf(opening, laterWalls)
    if (at !== null) cells.add([at.x, at.y], { opening, at })
  }
  const candidates: Candidate[] = []
  for (const opening of earlier.openings) {
    if (taken.before.has(opening.id)) continue
    const at = middleOf(opening, earlierWalls, shift)
    const host = earlierWalls.get(opening.wall)
    if (at === null || host === undefined) continue
    for (const other of cells.near([at.x, at.y])) {
      if (other.opening.type !== opening.type) continue
      const otherHost = laterWalls.get(other.opening.wall)
      if (otherHost === undefined || floorOf(otherHost) !== floorOf(host)) continue
      // An opening widened from one edge moves its middle by half the difference.
      const slack = near + Math.abs(other.opening.width - opening.width) / 2
      const gap = distance(at, other.at)
      if (gap > slack) continue
      // On the wall it was paired with, before one found anywhere else.
      const sameHost = wallPairs.get(opening.wall) === other.opening.wall
      candidates.push({ before: opening.id, after: other.opening.id, cost: gap + (sameHost ? 0 : near), reversed: false })
    }
  }
  return candidates
}

/**
 * WRT-12: what is left after the pairing by place, paired on the wall its own wall was paired
 * with, at the same place along it: measured from the matching end (the wall slid along itself)
 * or as its old middle seen from the later wall (the wall moved across). A window on a side
 * moved out is the same window under a new id, not one removed and one added.
 */
function openingsAlongWalls(
  earlier: FloorPlan,
  later: FloorPlan,
  shift: Point,
  wallPairs: ReadonlyMap<string, string>,
  reversed: ReadonlySet<string>,
  taken: { before: Set<string>; after: Set<string> }
): Candidate[] {
  const near = tolerance('diffPlace')
  const earlierWalls = new Map(earlier.walls.map((w) => [w.id, w] as const))
  const laterWalls = new Map(later.walls.map((w) => [w.id, w] as const))
  const laterOn = new Map<string, Opening[]>()
  for (const opening of later.openings) {
    if (taken.after.has(opening.id)) continue
    const list = laterOn.get(opening.wall)
    if (list) list.push(opening)
    else laterOn.set(opening.wall, [opening])
  }
  const candidates: Candidate[] = []
  for (const opening of earlier.openings) {
    if (taken.before.has(opening.id)) continue
    const pair = wallPairs.get(opening.wall)
    const host = earlierWalls.get(opening.wall)
    const otherHost = pair === undefined ? undefined : laterWalls.get(pair)
    if (pair === undefined || host === undefined || otherHost === undefined) continue
    const hostLength = Math.hypot(host.end[0] - host.start[0], host.end[1] - host.start[1])
    const length = Math.hypot(otherHost.end[0] - otherHost.start[0], otherHost.end[1] - otherHost.start[1])
    const at = middleOf(opening, earlierWalls, shift)
    if (at === null || length === 0) continue
    const dir = { x: (otherHost.end[0] - otherHost.start[0]) / length, y: (otherHost.end[1] - otherHost.start[1]) / length }
    const middle = opening.offset + opening.width / 2
    const fromEnd = reversed.has(opening.wall) ? hostLength - middle : middle
    const seen = (at.x - otherHost.start[0]) * dir.x + (at.y - otherHost.start[1]) * dir.y
    for (const other of laterOn.get(pair) ?? []) {
      if (other.type !== opening.type) continue
      const along = other.offset + other.width / 2
      const gap = Math.min(Math.abs(fromEnd - along), Math.abs(seen - along))
      if (gap > near + Math.abs(other.width - opening.width) / 2) continue
      candidates.push({ before: opening.id, after: other.id, cost: gap, reversed: false })
    }
  }
  return candidates
}

interface Footprint {
  readonly area: number
  readonly centre: Vec2
}

function footprints(plan: FloorPlan): Map<string, Footprint> {
  const index = indexPlan(plan)
  const found = new Map<string, Footprint>()
  for (const room of plan.rooms) {
    const polygon = tryRoomPolygon(room, index)
    if (polygon !== null) found.set(room.id, { area: area(polygon), centre: centroid(polygon) })
  }
  return found
}

function roomsByPlace(
  earlier: FloorPlan,
  later: FloorPlan,
  shift: Point,
  wallPairs: ReadonlyMap<string, string>,
  taken: { before: Set<string>; after: Set<string> }
): Candidate[] {
  const candidates: Candidate[] = []
  const wallKey = (walls: readonly string[]): string => [...new Set(walls)].sort().join('\u0000')
  const laterByWalls = new Map<string, Room[]>()
  for (const room of later.rooms) {
    if (taken.after.has(room.id)) continue
    const key = `${floorOf(room)}\u0001${wallKey(room.boundary)}`
    const list = laterByWalls.get(key)
    if (list) list.push(room)
    else laterByWalls.set(key, [room])
  }
  const was = footprints(earlier)
  const is = footprints(later)
  for (const room of earlier.rooms) {
    if (taken.before.has(room.id)) continue
    // The same walls, as paired: the surest sign of the same room.
    const mapped = room.boundary.map((id) => wallPairs.get(id))
    if (mapped.every((id): id is string => id !== undefined)) {
      for (const other of laterByWalls.get(`${floorOf(room)}\u0001${wallKey(mapped)}`) ?? []) {
        candidates.push({ before: room.id, after: other.id, cost: 0, reversed: false })
      }
    }
    // Or the same size in the same place.
    const before = was.get(room.id)
    if (before === undefined) continue
    const centre = { x: before.centre.x + shift[0], y: before.centre.y + shift[1] }
    for (const other of later.rooms) {
      if (taken.after.has(other.id) || floorOf(other) !== floorOf(room)) continue
      const after = is.get(other.id)
      if (after === undefined) continue
      const larger = Math.max(before.area, after.area)
      if (larger <= 0 || Math.abs(before.area - after.area) > tolerance('diffRoomAreaShare') * larger) continue
      const gap = distance(centre, after.centre)
      if (gap > tolerance('diffRoomCentre')) continue
      candidates.push({ before: room.id, after: other.id, cost: 1 + gap, reversed: false })
    }
  }
  return candidates
}

function byId<T extends { readonly id: string }>(
  earlier: readonly T[],
  later: readonly T[],
  taken: { before: Set<string>; after: Set<string> },
  fits: (before: T, after: T) => boolean = () => true
): Candidate[] {
  const laterById = new Map(later.map((item) => [item.id, item] as const))
  const candidates: Candidate[] = []
  for (const item of earlier) {
    const other = laterById.get(item.id)
    if (other === undefined || taken.before.has(item.id) || taken.after.has(item.id) || !fits(item, other)) continue
    candidates.push({ before: item.id, after: item.id, cost: 0, reversed: false })
  }
  return candidates
}

/** Names an earlier entity with no pair, so it cannot be read as a later one of the same id. */
function freeName(id: string, used: ReadonlySet<string>): string {
  if (!used.has(id)) return id
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${id}~before` : `${id}~before${n}`
    if (!used.has(name)) return name
  }
}

function withoutWritten(plan: FloorPlan): FloorPlan {
  const { written: _written, ...rest } = plan
  void _written
  return rest
}

function pairsOf(chosen: readonly Candidate[]): Map<string, string> {
  return new Map(chosen.map((c) => [c.before, c.after] as const))
}

interface Piece {
  readonly id: string
  /** Where it starts and ends along the wall it is a piece of, the lower first. */
  readonly lo: number
  readonly hi: number
  /** It runs the other way to that wall. */
  readonly reversed: boolean
}

/** Two walls alike in all but where they stand: the same floor, kind, thickness and height. */
function alike(a: Wall, b: Wall): boolean {
  const near = tolerance('diffLength')
  return floorOf(a) === floorOf(b) && a.kind === b.kind && (a.virtual === true) === (b.virtual === true) && Math.abs(a.thickness - b.thickness) <= near && Math.abs(a.height - b.height) <= near
}

/**
 * The walls among `others` that stand end to end exactly where `target` stands, in order along
 * it; null unless there are two or more and they cover it from end to end with no gap.
 */
function piecesOf(target: Wall, targetShift: Point, others: readonly Wall[], othersShift: Point): Piece[] | null {
  const s = moved(target.start, targetShift)
  const e = moved(target.end, targetShift)
  const length = Math.hypot(e[0] - s[0], e[1] - s[1])
  if (length === 0) return null
  const dir = { x: (e[0] - s[0]) / length, y: (e[1] - s[1]) / length }
  const near = tolerance('diffPlace')
  const line = tolerance('diffSameLine')
  const found: Piece[] = []
  for (const other of others) {
    if (!alike(target, other)) continue
    const a = moved(other.start, othersShift)
    const b = moved(other.end, othersShift)
    const off = (p: Point): number => Math.abs(dir.x * (p[1] - s[1]) - dir.y * (p[0] - s[0]))
    if (off(a) > line || off(b) > line) continue
    const ta = dir.x * (a[0] - s[0]) + dir.y * (a[1] - s[1])
    const tb = dir.x * (b[0] - s[0]) + dir.y * (b[1] - s[1])
    const lo = Math.min(ta, tb)
    const hi = Math.max(ta, tb)
    if (lo < -near || hi > length + near || hi - lo <= near) continue
    found.push({ id: other.id, lo, hi, reversed: tb < ta })
  }
  found.sort((x, y) => x.lo - y.lo)
  let at = 0
  for (const piece of found) {
    if (Math.abs(piece.lo - at) > near) return null
    at = piece.hi
  }
  return found.length >= 2 && Math.abs(at - length) <= near ? found : null
}

/** The origin, kept unless moving the earlier plan to the later one's corner pairs more walls, and the walls it pairs by place. */
function placeWalls(earlier: FloorPlan, later: FloorPlan): { shift: Point; chosen: Candidate[] } {
  const shifts: Point[] = [[0, 0]]
  const a = lowCorner(earlier)
  const b = lowCorner(later)
  if (a !== null && b !== null && (Math.abs(b[0] - a[0]) > tolerance('diffLength') || Math.abs(b[1] - a[1]) > tolerance('diffLength'))) {
    shifts.push([b[0] - a[0], b[1] - a[1]])
  }
  let shift: Point = [0, 0]
  let wallChoice: Candidate[] = []
  for (const candidate of shifts) {
    const chosen = assign(wallsByPlace(earlier.walls, later.walls, candidate), { before: new Set(), after: new Set() })
    if (chosen.length > wallChoice.length || (candidate === shifts[0] && wallChoice.length === 0)) {
      shift = candidate
      wallChoice = chosen
    }
  }
  return { shift, chosen: wallChoice }
}

/** How many walls of `earlier` stand in the place of a wall of `later`, the origin moved as `alignPlans` moves it (WRT-4). */
export function wallsInPlace(earlier: FloorPlan, later: FloorPlan): number {
  return placeWalls(earlier, later).chosen.length
}

/** Lays `earlier` on `later` and pairs what stands in the same place, then what keeps its id. */
export function alignPlans(earlier: FloorPlan, later: FloorPlan, options: AlignOptions = {}): Alignment {
  // The origin: kept unless moving the earlier plan to the later one's corner pairs more walls.
  const { shift, chosen: wallChoice } = placeWalls(earlier, later)

  const wallTaken = { before: new Set(wallChoice.map((c) => c.before)), after: new Set(wallChoice.map((c) => c.after)) }
  const walls = [...wallChoice, ...assign(byId(earlier.walls, later.walls, wallTaken), wallTaken)]
  const wallPairs = pairsOf(walls)
  const reversed = new Set(walls.filter((c) => c.reversed).map((c) => c.before))

  // Walls drawn in other pieces: one wall where several of the other version stand end to end.
  const splits: Array<{ wall: Wall; pieces: Piece[] }> = []
  const joins: Array<{ wall: Wall; pieces: Piece[] }> = []
  {
    const pairedAfter = new Set(wallPairs.values())
    const freeBefore = earlier.walls.filter((w) => !wallPairs.has(w.id))
    const freeAfter = later.walls.filter((w) => !pairedAfter.has(w.id))
    const usedBefore = new Set<string>()
    const usedAfter = new Set<string>()
    for (const wall of freeBefore) {
      const pieces = piecesOf(wall, shift, freeAfter.filter((w) => !usedAfter.has(w.id)), [0, 0])
      if (pieces === null) continue
      splits.push({ wall, pieces })
      usedBefore.add(wall.id)
      pieces.forEach((p) => usedAfter.add(p.id))
    }
    for (const wall of freeAfter) {
      if (usedAfter.has(wall.id)) continue
      const pieces = piecesOf(wall, [0, 0], freeBefore.filter((w) => !usedBefore.has(w.id)), shift)
      if (pieces === null) continue
      joins.push({ wall, pieces })
      usedAfter.add(wall.id)
      pieces.forEach((p) => usedBefore.add(p.id))
    }
  }

  const openingTaken = { before: new Set<string>(), after: new Set<string>() }
  const sameType = (x: Opening, y: Opening): boolean => x.type === y.type
  const openings = options.idsFirst
    ? [
        ...assign(byId(earlier.openings, later.openings, openingTaken), openingTaken),
        ...assign(openingsByPlace(earlier, later, shift, wallPairs, openingTaken), openingTaken),
        ...assign(openingsAlongWalls(earlier, later, shift, wallPairs, reversed, openingTaken), openingTaken)
      ]
    : [
        ...assign(openingsByPlace(earlier, later, shift, wallPairs, openingTaken), openingTaken),
        // WRT-12: on its wall that moved, at its place along it, before any id.
        ...assign(openingsAlongWalls(earlier, later, shift, wallPairs, reversed, openingTaken), openingTaken),
        // A door turned into a window under its id is the same opening changed.
        ...assign(byId(earlier.openings, later.openings, openingTaken, sameType), openingTaken),
        ...assign(byId(earlier.openings, later.openings, openingTaken), openingTaken)
      ]
  const openingPairs = pairsOf(openings)

  const roomTaken = { before: new Set<string>(), after: new Set<string>() }
  const rooms = options.idsFirst
    ? [
        ...assign(byId(earlier.rooms, later.rooms, roomTaken), roomTaken),
        ...assign(roomsByPlace(earlier, later, shift, wallPairs, roomTaken), roomTaken)
      ]
    : [
        ...assign(roomsByPlace(earlier, later, shift, wallPairs, roomTaken), roomTaken),
        ...assign(byId(earlier.rooms, later.rooms, roomTaken), roomTaken)
      ]
  const roomPairs = pairsOf(rooms)

  // Every earlier entity gets its pair's id, or a name no later entity of its type has.
  const rename = <T extends { readonly id: string }>(items: readonly T[], laterItems: readonly T[], pairs: ReadonlyMap<string, string>): Map<string, string> => {
    const used = new Set(laterItems.map((item) => item.id))
    const names = new Map<string, string>()
    for (const item of items) {
      const pair = pairs.get(item.id)
      if (pair !== undefined) names.set(item.id, pair)
    }
    for (const item of items) {
      if (names.has(item.id)) continue
      const name = freeName(item.id, used)
      used.add(name)
      names.set(item.id, name)
    }
    return names
  }
  const wallNames = rename(earlier.walls, later.walls, wallPairs)
  const openingNames = rename(earlier.openings, later.openings, openingPairs)
  const roomNames = rename(earlier.rooms, later.rooms, roomPairs)
  const wallName = (id: string): string => wallNames.get(id) ?? id
  const roomName = (id: string): string => roomNames.get(id) ?? id
  const lengths = new Map(earlier.walls.map((w) => [w.id, Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])] as const))

  const laterWalls = new Map(later.walls.map((w) => [w.id, w] as const))
  const laterOpenings = new Map(later.openings.map((o) => [o.id, o] as const))
  const slip = tolerance('diffMovement')
  const slipped = (p: [number, number], q: Point): [number, number] => (Math.abs(p[0] - q[0]) < slip && Math.abs(p[1] - q[1]) < slip ? [q[0], q[1]] : p)
  const settled = (opening: Opening): Opening => {
    const pair = laterOpenings.get(opening.id)
    return pair !== undefined && pair.wall === opening.wall && Math.abs(pair.offset - opening.offset) < slip ? { ...opening, offset: pair.offset } : opening
  }

  const aligned: FloorPlan = {
    ...earlier,
    walls: earlier.walls.map((wall) => {
      const start = moved(wall.start, shift)
      const end = moved(wall.end, shift)
      const pair = laterWalls.get(wallName(wall.id))
      const [from, to] = reversed.has(wall.id) ? [end, start] : [start, end]
      // A point that slipped by less than a centimetre has not moved (`diffMovement`).
      return { ...wall, id: wallName(wall.id), start: pair ? slipped(from, pair.start) : from, end: pair ? slipped(to, pair.end) : to }
    }),
    openings: earlier.openings.map((opening): Opening => {
      const next: Opening = { ...opening, id: openingNames.get(opening.id) ?? opening.id, wall: wallName(opening.wall) }
      const anchor = opening.anchor === undefined ? undefined : { ...opening.anchor, ...(opening.anchor.room === undefined ? {} : { room: roomName(opening.anchor.room) }) }
      if (!reversed.has(opening.wall)) return anchor === undefined ? next : { ...next, anchor }
      // The wall runs the other way now: its start is the other end, its left the other face.
      const length = lengths.get(opening.wall) ?? 0
      const flipped: Opening = {
        ...next,
        offset: Math.max(0, length - opening.offset - opening.width),
        ...(opening.hinge === undefined ? {} : { hinge: opening.hinge === 'start' ? 'end' : 'start' }),
        ...(opening.swing === undefined ? {} : { swing: opening.swing === 'left' ? 'right' : 'left' })
      }
      if (anchor === undefined) return flipped
      const from = anchor.from === 'start' ? 'end' : anchor.from === 'end' ? 'start' : anchor.from
      return { ...flipped, anchor: { ...anchor, from } }
    }).map(settled),
    rooms: earlier.rooms.map((room) => ({
      ...room,
      id: roomName(room.id),
      boundary: room.boundary.map(wallName),
      ...(room.holes === undefined ? {} : { holes: room.holes.map((hole) => hole.map(wallName)) })
    }))
  }

  const renamed: RenamedId[] = [
    ...walls.map((c) => ({ type: 'wall' as const, before: c.before, after: c.after })),
    ...openings.map((c) => ({ type: 'opening' as const, before: c.before, after: c.after })),
    ...rooms.map((c) => ({ type: 'room' as const, before: c.before, after: c.after }))
  ]
    .filter((r) => r.before !== r.after)
    .sort((x, y) => compareText(x.type, y.type) || compareText(x.before, y.before))

  const redrawnPlan = splits.length + joins.length === 0 ? aligned : redraw(aligned, later, splits, joins, wallName)
  const redrawn: Redrawn[] = [
    ...splits.map(({ wall, pieces }) => ({ before: [wall.id], after: pieces.map((p) => p.id) })),
    ...joins.map(({ wall, pieces }) => ({ before: pieces.map((p) => p.id), after: [wall.id] }))
  ]

  // What a plan written rooms first keeps of its rooms' walls (`written`) is keyed by the earlier
  // names: under the later names it would read as walls edited by hand, so it is left out then.
  const kept = renamed.some((r) => r.type !== 'opening') || redrawn.length > 0 ? withoutWritten(redrawnPlan) : redrawnPlan
  return { shift: [shift[0], shift[1]], walls: wallPairs, openings: openingPairs, rooms: roomPairs, renamed, redrawn, aligned: kept }
}

/**
 * The aligned earlier plan with its walls cut or joined as the later plan draws them, so walls
 * drawn in other pieces compare as the same walls: each opening moves onto the piece it stands
 * in, at the same place, and each room lists the pieces.
 */
function redraw(
  aligned: FloorPlan,
  later: FloorPlan,
  splits: ReadonlyArray<{ wall: Wall; pieces: Piece[] }>,
  joins: ReadonlyArray<{ wall: Wall; pieces: Piece[] }>,
  wallName: (id: string) => string
): FloorPlan {
  const laterWalls = new Map(later.walls.map((w) => [w.id, w] as const))
  const laterRooms = new Map(later.rooms.map((r) => [r.id, r] as const))
  const flip = (opening: Opening, offset: number, reversed: boolean): Opening => ({
    ...opening,
    offset: Math.max(0, offset),
    ...(reversed && opening.hinge !== undefined ? { hinge: opening.hinge === 'start' ? 'end' : 'start' } : {}),
    ...(reversed && opening.swing !== undefined ? { swing: opening.swing === 'left' ? 'right' : 'left' } : {})
  })
  // One earlier wall cut into pieces: its id becomes theirs.
  const cut = new Map<string, Piece[]>()
  for (const { wall, pieces } of splits) cut.set(wallName(wall.id), pieces)
  // Several earlier walls joined into one: each of their ids becomes its.
  const joined = new Map<string, { wall: Wall; piece: Piece }>()
  for (const { wall, pieces } of joins) for (const piece of pieces) joined.set(wallName(piece.id), { wall, piece })

  const walls: Wall[] = []
  const placed = new Set<string>()
  for (const wall of aligned.walls) {
    const pieces = cut.get(wall.id)
    if (pieces !== undefined) {
      for (const piece of pieces) {
        const other = laterWalls.get(piece.id)!
        walls.push({ ...wall, id: piece.id, start: [other.start[0], other.start[1]], end: [other.end[0], other.end[1]] })
      }
      continue
    }
    const into = joined.get(wall.id)
    if (into !== undefined) {
      if (!placed.has(into.wall.id)) walls.push({ ...wall, id: into.wall.id, start: [into.wall.start[0], into.wall.start[1]], end: [into.wall.end[0], into.wall.end[1]] })
      placed.add(into.wall.id)
      continue
    }
    walls.push(wall)
  }

  const openings = aligned.openings.map((opening): Opening => {
    const pieces = cut.get(opening.wall)
    if (pieces !== undefined) {
      const middle = opening.offset + opening.width / 2
      const piece = pieces.find((p) => middle >= p.lo && middle <= p.hi) ?? pieces[pieces.length - 1]!
      const offset = piece.reversed ? piece.hi - opening.offset - opening.width : opening.offset - piece.lo
      return { ...flip(opening, offset, piece.reversed), wall: piece.id }
    }
    const into = joined.get(opening.wall)
    if (into !== undefined) {
      const { piece } = into
      const offset = piece.reversed ? piece.hi - opening.offset - opening.width : piece.lo + opening.offset
      return { ...flip(opening, offset, piece.reversed), wall: into.wall.id }
    }
    return opening
  })

  const list = (ids: readonly string[], room: string): string[] => {
    const theirs = new Set([...(laterRooms.get(room)?.boundary ?? []), ...(laterRooms.get(room)?.holes ?? []).flat()])
    const out: string[] = []
    for (const id of ids) {
      const pieces = cut.get(id)
      const replaced = pieces === undefined ? [joined.get(id)?.wall.id ?? id] : pieces.filter((p) => theirs.has(p.id)).map((p) => p.id)
      for (const next of replaced.length > 0 ? replaced : (pieces ?? []).map((p) => p.id)) if (out[out.length - 1] !== next) out.push(next)
    }
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop()
    return out
  }
  const rooms = aligned.rooms.map((room) => ({
    ...room,
    boundary: list(room.boundary, room.id),
    ...(room.holes === undefined ? {} : { holes: room.holes.map((hole) => list(hole, room.id)) })
  }))
  return { ...aligned, walls, openings, rooms }
}
