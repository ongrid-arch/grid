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
 * by id, and a room then with the room that shares most of its floor, under any id (MSG-23: one
 * room reshaped, as a comparison by phase reads one). A plan written rooms first names its rooms
 * and openings itself, so there openings are paired by id first and by place after (lab RT-8);
 * its rooms by place first too, then by id, by the floor they share and by name (WRT-32), an id or
 * a name kept only by a room that shares its floor: a rewrite may give either to a room elsewhere.
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
import { cutOutline, multiArea, ringOf } from '../polygons'
import { area, centroid, distance } from '../vec2'
import { curveExtremes, wallCurve } from '../arc'
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

/**
 * The corner of the box round a plan's solid walls, the lowest x and y; null with none. MSG-26: a
 * curved wall's box is its curve's, so a round room's one end says nothing of where it reaches.
 */
function lowCorner(plan: FloorPlan): Point | null {
  let x = Infinity
  let y = Infinity
  for (const wall of plan.walls) {
    if (wall.virtual === true) continue
    x = Math.min(x, wall.start[0], wall.end[0])
    y = Math.min(y, wall.start[1], wall.end[1])
    const curve = wallCurve(wall)
    for (const p of curve === null ? [] : curveExtremes(curve)) {
      x = Math.min(x, p.x)
      y = Math.min(y, p.y)
    }
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
      // MSG-26: two curves stand in one place only round one centre: the ends and the centre give the radius.
      if (wall.arc !== undefined && other.arc !== undefined && distance(vec(moved(wall.arc.centre, shift)), vec(other.arc.centre)) > near) continue
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
  readonly outline: readonly Vec2[]
}

function footprints(plan: FloorPlan, shift: Point = [0, 0]): Map<string, Footprint> {
  const index = indexPlan(plan)
  const found = new Map<string, Footprint>()
  for (const room of plan.rooms) {
    const polygon = tryRoomPolygon(room, index)
    if (polygon === null) continue
    const outline = polygon.map((p) => ({ x: p.x + shift[0], y: p.y + shift[1] }))
    found.set(room.id, { area: area(polygon), centre: centroid(outline), outline })
  }
  return found
}

/** The floor two rooms share, in m²: 0 when their boxes do not meet or the cut fails. */
function sharedFloor(a: Footprint, b: Footprint): number {
  const box = (o: readonly Vec2[]): [number, number, number, number] => [Math.min(...o.map((p) => p.x)), Math.min(...o.map((p) => p.y)), Math.max(...o.map((p) => p.x)), Math.max(...o.map((p) => p.y))]
  const [ax0, ay0, ax1, ay1] = box(a.outline)
  const [bx0, by0, bx1, by1] = box(b.outline)
  if (ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0) return 0
  const cut = cutOutline('intersection', [ringOf(a.outline)], [[ringOf(b.outline)]])
  return cut === null ? 0 : multiArea(cut)
}

/**
 * MSG-23: of the pairs `candidates` holds, the ones whose two rooms share at least `share` of
 * the smaller one's floor; a pair with a room that does not close is kept, as nothing says
 * otherwise. Rooms written rooms first keep their ids and names through a rewrite that gives them
 * to a room elsewhere: that is another room.
 */
function sharingFloor(candidates: Candidate[], was: ReadonlyMap<string, Footprint>, is: ReadonlyMap<string, Footprint>): Candidate[] {
  const share = tolerance('diffRoomKeptShare')
  return candidates.filter((c) => {
    const a = was.get(c.before)
    const b = is.get(c.after)
    if (a === undefined || b === undefined) return true
    const smaller = Math.min(a.area, b.area)
    return smaller > 0 && sharedFloor(a, b) >= share * smaller
  })
}

/**
 * MSG-23: rooms left unpaired on the same floor, under any ids, that share most of the larger
 * one's floor: one room reshaped, as a comparison by phase reads a room taken down and built
 * again a little otherwise. Cheapest the one that shares most.
 */
function roomsByOverlap(
  earlier: FloorPlan,
  later: FloorPlan,
  was: ReadonlyMap<string, Footprint>,
  is: ReadonlyMap<string, Footprint>,
  taken: { before: Set<string>; after: Set<string> }
): Candidate[] {
  const share = tolerance('diffRoomOverlapShare')
  const candidates: Candidate[] = []
  for (const room of earlier.rooms) {
    const a = was.get(room.id)
    if (taken.before.has(room.id) || a === undefined) continue
    for (const other of later.rooms) {
      const b = is.get(other.id)
      if (taken.after.has(other.id) || b === undefined || floorOf(other) !== floorOf(room)) continue
      const larger = Math.max(a.area, b.area)
      if (larger <= 0) continue
      const part = sharedFloor(a, b) / larger
      if (part >= share) candidates.push({ before: room.id, after: other.id, cost: 1 - part, reversed: false })
    }
  }
  return candidates
}

function roomsByPlace(
  earlier: FloorPlan,
  later: FloorPlan,
  was: ReadonlyMap<string, Footprint>,
  is: ReadonlyMap<string, Footprint>,
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
  for (const room of earlier.rooms) {
    if (taken.before.has(room.id)) continue
    // The same walls, as paired: the surest sign of the same room.
    const mapped = room.boundary.map((id) => wallPairs.get(id))
    if (mapped.every((id): id is string => id !== undefined)) {
      for (const other of laterByWalls.get(`${floorOf(room)}\u0001${wallKey(mapped)}`) ?? []) {
        candidates.push({ before: room.id, after: other.id, cost: 0, reversed: false })
      }
    }
    // Or the same size in the same place (the earlier footprints already moved by the shift).
    const before = was.get(room.id)
    if (before === undefined) continue
    const centre = before.centre
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

/**
 * WRT-32: rooms left unpaired that have the same name on the same floor, the one room of that
 * name on its floor in each version. Used for a plan written rooms first: its author named the
 * room, and its walls are named after the room's id, so a room whose id changed and that moved
 * has nothing else to be paired by.
 */
function roomsByName(earlier: FloorPlan, later: FloorPlan, taken: { before: Set<string>; after: Set<string> }): Candidate[] {
  const key = (room: Room): string => `${floorOf(room)}\u0001${room.name.trim()}`
  const only = (rooms: readonly Room[], gone: ReadonlySet<string>): Map<string, Room> => {
    const counts = new Map<string, number>()
    for (const room of rooms) if (room.name.trim() !== '') counts.set(key(room), (counts.get(key(room)) ?? 0) + 1)
    return new Map(rooms.filter((room) => room.name.trim() !== '' && counts.get(key(room)) === 1 && !gone.has(room.id)).map((room) => [key(room), room] as const))
  }
  const theirs = only(later.rooms, taken.after)
  return [...only(earlier.rooms, taken.before)].flatMap(([k, room]) => {
    const other = theirs.get(k)
    return other === undefined ? [] : [{ before: room.id, after: other.id, cost: 0, reversed: false }]
  })
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
  // MSG-26: a curved wall is no piece of a line, and a line none of a curve.
  if (target.arc !== undefined) return null
  const s = moved(target.start, targetShift)
  const e = moved(target.end, targetShift)
  const length = Math.hypot(e[0] - s[0], e[1] - s[1])
  if (length === 0) return null
  const dir = { x: (e[0] - s[0]) / length, y: (e[1] - s[1]) / length }
  const near = tolerance('diffPlace')
  const line = tolerance('diffSameLine')
  const found: Piece[] = []
  for (const other of others) {
    if (!alike(target, other) || other.arc !== undefined) continue
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

/** A straight wall's line: where it starts, its direction and its length, the earlier plan moved by `shift`. */
interface Line {
  readonly s: Point
  readonly dir: Vec2
  readonly length: number
}

function lineOf(wall: Wall, shift: Point): Line | null {
  if (wall.arc !== undefined) return null
  const s = moved(wall.start, shift)
  const e = moved(wall.end, shift)
  const length = Math.hypot(e[0] - s[0], e[1] - s[1])
  return length === 0 ? null : { s, dir: { x: (e[0] - s[0]) / length, y: (e[1] - s[1]) / length }, length }
}

/** Where a wall lies along `line`, its lower end first, or null when it is off the line by more than `slack`. */
function stretchOn(line: Line, wall: Wall, shift: Point, slack: number): { lo: number; hi: number; reversed: boolean } | null {
  if (wall.arc !== undefined) return null
  const a = moved(wall.start, shift)
  const b = moved(wall.end, shift)
  const off = (p: Point): number => Math.abs(line.dir.x * (p[1] - line.s[1]) - line.dir.y * (p[0] - line.s[0]))
  if (off(a) > slack || off(b) > slack) return null
  const ta = line.dir.x * (a[0] - line.s[0]) + line.dir.y * (a[1] - line.s[1])
  const tb = line.dir.x * (b[0] - line.s[0]) + line.dir.y * (b[1] - line.s[1])
  return { lo: Math.min(ta, tb), hi: Math.max(ta, tb), reversed: tb < ta }
}

/**
 * MSG-27: a later wall that still stands along the line of the earlier one, sharing a stretch of
 * it longer than `diffPlace`: the same wall made longer or shorter. Null otherwise.
 */
function sharedStretch(earlier: Wall, earlierShift: Point, later: Wall): { overlap: number; reversed: boolean } | null {
  const line = lineOf(earlier, earlierShift)
  if (line === null) return null
  const on = stretchOn(line, later, [0, 0], tolerance('diffSameLine'))
  if (on === null) return null
  const overlap = Math.min(on.hi, line.length) - Math.max(on.lo, 0)
  return overlap > tolerance('diffPlace') ? { overlap, reversed: on.reversed } : null
}

/**
 * MSG-27: what a wall in both versions gained and lost along its line: the stretches the later
 * wall has beyond the earlier one (added) and the earlier one beyond the later (removed), each
 * from and to on the centre line. Null when the later wall is off the earlier one's line (moved
 * across it or turned), or a curve that left its circle: then it no longer stands where it stood.
 * Both walls are in the same plan's coordinates.
 */
export function wallStretches(before: Wall, after: Wall): { added: Array<[Point, Point]>; removed: Array<[Point, Point]> } | null {
  const near = tolerance('diffPlace')
  if (before.arc !== undefined || after.arc !== undefined) {
    if (before.arc === undefined || after.arc === undefined) return null
    const radius = (w: Wall, c: Point): number => Math.hypot(w.start[0] - c[0], w.start[1] - c[1])
    const sameCircle = distance(vec(before.arc.centre), vec(after.arc.centre)) <= near && Math.abs(radius(before, before.arc.centre) - radius(after, after.arc.centre)) <= near
    return sameCircle ? { added: [], removed: [] } : null
  }
  const line = lineOf(before, [0, 0])
  if (line === null) return null
  // A wall made thicker on one face moves its centre line by half the difference.
  const on = stretchOn(line, after, [0, 0], tolerance('diffSameLine') + Math.abs(after.thickness - before.thickness) / 2)
  if (on === null) return null
  const at = (t: number): Point => [line.s[0] + line.dir.x * t, line.s[1] + line.dir.y * t]
  const added: Array<[Point, Point]> = []
  const removed: Array<[Point, Point]> = []
  const beyond = (lo: number, hi: number, into: Array<[Point, Point]>): void => {
    if (hi - lo > near) into.push([at(lo), at(hi)])
  }
  beyond(on.lo, Math.min(on.hi, 0), added)
  beyond(Math.max(on.lo, line.length), on.hi, added)
  beyond(0, Math.min(on.lo, line.length), removed)
  beyond(Math.max(on.hi, 0), line.length, removed)
  return { added, removed }
}

/**
 * MSG-27: a straight wall whose later centre line still lies inside where the earlier wall stood,
 * both its ends within half the earlier wall's thickness of the earlier line: a wall nudged, not
 * taken out and built elsewhere.
 */
export function withinItsThickness(before: Wall, after: Wall): boolean {
  const line = lineOf(before, [0, 0])
  return line !== null && stretchOn(line, after, [0, 0], before.thickness / 2) !== null
}

/** MSG-27: walls of the two versions along one line, sharing stretches: one wall lengthened, cut back or cut otherwise. */
interface LineGroup {
  readonly before: readonly Wall[]
  readonly after: readonly Wall[]
}

/**
 * MSG-27: the walls left free in both versions grouped by the line they share: two walls alike
 * and sharing a stretch of one line are in one group, and so is every wall sharing a stretch with
 * either. A party wall made longer under a new id, or drawn in other pieces and made longer, is
 * one group: the same wall with a new stretch, not one removed and one added.
 */
function lineGroups(freeBefore: readonly Wall[], freeAfter: readonly Wall[], shift: Point): LineGroup[] {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let at = key
    while (parent.get(at) !== at) at = parent.get(at)!
    parent.set(key, at)
    return at
  }
  const key = (side: 'b' | 'a', id: string): string => `${side}\u0000${id}`
  for (const w of freeBefore) parent.set(key('b', w.id), key('b', w.id))
  for (const w of freeAfter) parent.set(key('a', w.id), key('a', w.id))
  const cells = new Cells<Wall>(Math.max(1, tolerance('diffPlace') * 40))
  for (const wall of freeAfter) {
    const line = lineOf(wall, [0, 0])
    if (line === null) continue
    // Every metre or so along it, so a lookup near any point of a long wall finds it.
    const steps = Math.ceil(line.length / (tolerance('diffPlace') * 20))
    for (let i = 0; i <= steps; i++) cells.add([line.s[0] + (line.dir.x * line.length * i) / steps, line.s[1] + (line.dir.y * line.length * i) / steps], wall)
  }
  for (const wall of freeBefore) {
    const line = lineOf(wall, shift)
    if (line === null) continue
    const seen = new Set<string>()
    const steps = Math.ceil(line.length / (tolerance('diffPlace') * 20))
    for (let i = 0; i <= steps; i++) {
      for (const other of cells.near([line.s[0] + (line.dir.x * line.length * i) / steps, line.s[1] + (line.dir.y * line.length * i) / steps])) {
        if (seen.has(other.id)) continue
        seen.add(other.id)
        if (!alike(wall, other) || sharedStretch(wall, shift, other) === null) continue
        parent.set(find(key('b', wall.id)), find(key('a', other.id)))
      }
    }
  }
  const groups = new Map<string, { before: Wall[]; after: Wall[] }>()
  const add = (k: string, wall: Wall, side: 'before' | 'after'): void => {
    const root = find(k)
    const group = groups.get(root) ?? { before: [], after: [] }
    group[side].push(wall)
    groups.set(root, group)
  }
  for (const w of freeBefore) add(key('b', w.id), w, 'before')
  for (const w of freeAfter) add(key('a', w.id), w, 'after')
  return [...groups.values()].filter((g) => g.before.length > 0 && g.after.length > 0)
}

/** MSG-27: one stretch of an earlier wall, kept in the aligned plan under its own name. */
interface Part {
  /** The later wall it lies along, or null for a stretch no later wall stands on: removed. */
  readonly later: Wall | null
  /** Where it starts and ends, in plan metres on the later plan. */
  readonly start: Point
  readonly end: Point
}

/** MSG-27: earlier walls of a line group cut as the later version cuts them. */
interface Recut {
  /** The earlier walls, by earlier id. */
  readonly before: readonly Wall[]
  readonly after: readonly Wall[]
  /** Each earlier wall's parts, in order along it. */
  readonly parts: ReadonlyMap<string, readonly Part[]>
}

/**
 * MSG-27: a group with several walls on one side, cut as the later version cuts it: each later
 * wall takes the stretch of the earlier walls that lies along it, and a stretch of an earlier
 * wall along no later wall is a part of its own, so it reads as removed. Null when the earlier
 * walls overlap one another, the later ones do, or the earlier walls along one later wall leave a
 * gap: no one way to read it.
 */
function recutOf(group: LineGroup, shift: Point): Recut | null {
  const near = tolerance('diffPlace')
  const slack = tolerance('diffSameLine')
  const ref = lineOf([...group.after].sort((a, b) => compareText(a.id, b.id))[0]!, [0, 0])!
  const at = (t: number): Point => [ref.s[0] + ref.dir.x * t, ref.s[1] + ref.dir.y * t]
  const stretches = (walls: readonly Wall[], by: Point): Array<{ wall: Wall; lo: number; hi: number; reversed: boolean }> | null => {
    const found = walls.map((wall) => ({ wall, ...stretchOn(ref, wall, by, slack * 2)! })).sort((a, b) => a.lo - b.lo)
    for (let i = 1; i < found.length; i++) if (found[i]!.lo < found[i - 1]!.hi - near) return null
    return found
  }
  if (group.before.some((w) => stretchOn(ref, w, shift, slack * 2) === null)) return null
  const before = stretches(group.before, shift)
  const after = stretches(group.after, [0, 0])
  if (before === null || after === null) return null
  // The earlier walls along each later wall leave no gap within the stretch they cover.
  for (const l of after) {
    const along = before.filter((b) => Math.min(b.hi, l.hi) - Math.max(b.lo, l.lo) > near)
    for (let i = 1; i < along.length; i++) if (along[i]!.lo > along[i - 1]!.hi + near) return null
  }
  const parts = new Map<string, Part[]>()
  for (const b of before) {
    // The points along it where a later wall starts or ends cut it.
    const cuts = [b.lo, b.hi, ...after.flatMap((l) => [l.lo, l.hi]).filter((t) => t > b.lo + near && t < b.hi - near)].sort((x, y) => x - y)
    const own: Part[] = []
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1]!
      const hi = cuts[i]!
      if (hi - lo <= near) continue
      const middle = (lo + hi) / 2
      const later = after.find((l) => middle > l.lo && middle < l.hi)?.wall ?? null
      // A part runs the way its later wall runs, else the way its own wall ran.
      const forward = later === null ? !b.reversed : !(after.find((l) => l.wall === later)!.reversed)
      own.push({ later, start: forward ? at(lo) : at(hi), end: forward ? at(hi) : at(lo) })
    }
    // In order along the earlier wall, its start first.
    parts.set(b.wall.id, b.reversed ? own.reverse() : own)
  }
  return { before: group.before, after: group.after, parts }
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
  // MSG-27: a wall keeps its id only while it still stands along its line; one that left it is
  // paired by id last, after every wall that stands where it stood.
  const onItsLine = (b: Wall, a: Wall): boolean => sharedStretch(b, shift, a) !== null
  const walls = [...wallChoice, ...assign(byId(earlier.walls, later.walls, wallTaken, onItsLine), wallTaken)]

  // Walls drawn in other pieces: one wall where several of the other version stand end to end.
  const splits: Array<{ wall: Wall; pieces: Piece[] }> = []
  const joins: Array<{ wall: Wall; pieces: Piece[] }> = []
  const recuts: Recut[] = []
  {
    const pairedAfter = new Set(walls.map((c) => c.after))
    const pairedBefore = new Set(walls.map((c) => c.before))
    const freeBefore = earlier.walls.filter((w) => !pairedBefore.has(w.id))
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
    // MSG-27: what is left along one line: one wall lengthened or cut back is a pair; several
    // cut otherwise are cut as the later version cuts them.
    const groups = lineGroups(freeBefore.filter((w) => !usedBefore.has(w.id)), freeAfter.filter((w) => !usedAfter.has(w.id)), shift)
    for (const group of groups) {
      if (group.before.length === 1 && group.after.length === 1) {
        const shared = sharedStretch(group.before[0]!, shift, group.after[0]!)!
        walls.push({ before: group.before[0]!.id, after: group.after[0]!.id, cost: 0, reversed: shared.reversed })
        wallTaken.before.add(group.before[0]!.id)
        wallTaken.after.add(group.after[0]!.id)
        continue
      }
      const recut = recutOf(group, shift)
      if (recut === null) continue
      recuts.push(recut)
      recut.before.forEach((w) => wallTaken.before.add(w.id))
      recut.after.forEach((w) => wallTaken.after.add(w.id))
    }
  }
  for (const s of splits) {
    wallTaken.before.add(s.wall.id)
    s.pieces.forEach((p) => wallTaken.after.add(p.id))
  }
  for (const j of joins) {
    wallTaken.after.add(j.wall.id)
    j.pieces.forEach((p) => wallTaken.before.add(p.id))
  }
  // The rest by id, wherever they stand now: a wall moved off its line, or turned.
  walls.push(...assign(byId(earlier.walls, later.walls, wallTaken), wallTaken))
  const wallPairs = pairsOf(walls)
  const reversed = new Set(walls.filter((c) => c.reversed).map((c) => c.before))

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

  // MSG-23: rooms by where they stand first, then by id, then by the floor they share. Rooms
  // written rooms first keep an id or a name only for a room that shares its floor (WRT-32's name
  // last), since a rewrite may give either to a room elsewhere.
  const roomTaken = { before: new Set<string>(), after: new Set<string>() }
  const roomsWere = footprints(earlier, shift)
  const roomsAre = footprints(later)
  const rooms = options.idsFirst
    ? [
        ...assign(roomsByPlace(earlier, later, roomsWere, roomsAre, wallPairs, roomTaken), roomTaken),
        ...assign(sharingFloor(byId(earlier.rooms, later.rooms, roomTaken), roomsWere, roomsAre), roomTaken),
        ...assign(roomsByOverlap(earlier, later, roomsWere, roomsAre, roomTaken), roomTaken),
        ...assign(sharingFloor(roomsByName(earlier, later, roomTaken), roomsWere, roomsAre), roomTaken)
      ]
    : [
        ...assign(roomsByPlace(earlier, later, roomsWere, roomsAre, wallPairs, roomTaken), roomTaken),
        ...assign(byId(earlier.rooms, later.rooms, roomTaken), roomTaken),
        ...assign(roomsByOverlap(earlier, later, roomsWere, roomsAre, roomTaken), roomTaken)
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
      // MSG-26: a curve's centre moves with its ends, and a curve drawn the other way round turns the other way.
      const arc = wall.arc === undefined ? {} : { arc: { centre: pair?.arc ? slipped(moved(wall.arc.centre, shift), pair.arc.centre) : moved(wall.arc.centre, shift), sweep: reversed.has(wall.id) ? -wall.arc.sweep : wall.arc.sweep } }
      // A point that slipped by less than a centimetre has not moved (`diffMovement`).
      return { ...wall, id: wallName(wall.id), start: pair ? slipped(from, pair.start) : from, end: pair ? slipped(to, pair.end) : to, ...arc }
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

  let redrawnPlan = splits.length + joins.length === 0 ? aligned : redraw(aligned, later, splits, joins, wallName)
  const redrawn: Redrawn[] = [
    ...splits.map(({ wall, pieces }) => ({ before: [wall.id], after: pieces.map((p) => p.id) })),
    ...joins.map(({ wall, pieces }) => ({ before: pieces.map((p) => p.id), after: [wall.id] }))
  ]
  // MSG-27: the walls of one line cut otherwise, each group cut only where every room keeps its floor.
  for (const recut of recuts) {
    const cut = recutPlan(redrawnPlan, later, recut, wallName)
    if (cut === null) continue
    redrawnPlan = cut
    redrawn.push({ before: recut.before.map((w) => w.id), after: recut.after.map((w) => w.id) })
  }

  // What a plan written rooms first keeps of its rooms' walls (`written`) is keyed by the earlier
  // names: under the later names it would read as walls edited by hand, so it is left out then.
  const kept = renamed.some((r) => r.type !== 'opening') || redrawn.length > 0 ? withoutWritten(redrawnPlan) : redrawnPlan
  return { shift: [shift[0], shift[1]], walls: wallPairs, openings: openingPairs, rooms: roomPairs, renamed, redrawn, aligned: kept }
}

/**
 * MSG-27: the aligned earlier plan with the walls of one line group cut as the later version cuts
 * them: one wall under each later wall's id over the stretch the earlier walls had along it, and
 * each stretch along no later wall under a name of its own. Each opening moves onto the part
 * holding its middle, at the same place; each room lists the parts. Null when a room would not
 * keep its floor: then the walls are left as they were.
 */
function recutPlan(aligned: FloorPlan, later: FloorPlan, recut: Recut, wallName: (id: string) => string): FloorPlan | null {
  const near = tolerance('diffPlace')
  const used = new Set([...aligned.walls.map((w) => w.id), ...later.walls.map((w) => w.id)])
  const laterRooms = new Map(later.rooms.map((r) => [r.id, r] as const))
  const own = new Map(aligned.walls.map((w) => [w.id, w] as const))
  const project = (p: Point, from: Point, dir: Vec2): number => (p[0] - from[0]) * dir.x + (p[1] - from[1]) * dir.y
  // Each later wall's stretch, over every earlier part along it.
  const along = new Map<string, { start: Point; end: Point; from: Wall }>()
  // Each earlier wall's new walls, in order along it, with their ends.
  const into = new Map<string, Array<{ id: string; start: Point; end: Point }>>()
  for (const wall of recut.before) {
    const name = wallName(wall.id)
    const source = own.get(name)
    if (source === undefined) return null
    let first = true
    const list: Array<{ id: string; start: Point; end: Point }> = []
    for (const part of recut.parts.get(wall.id) ?? []) {
      if (part.later === null) {
        const id = first && !later.walls.some((w) => w.id === name) ? name : freeName(name, used)
        used.add(id)
        first = false
        list.push({ id, start: part.start, end: part.end })
        continue
      }
      const l = part.later
      const length = Math.hypot(l.end[0] - l.start[0], l.end[1] - l.start[1])
      const dir = { x: (l.end[0] - l.start[0]) / length, y: (l.end[1] - l.start[1]) / length }
      const was = along.get(l.id)
      const lo = (p: Point, q: Point): Point => (project(p, l.start, dir) <= project(q, l.start, dir) ? p : q)
      const hi = (p: Point, q: Point): Point => (project(p, l.start, dir) >= project(q, l.start, dir) ? p : q)
      along.set(l.id, was === undefined ? { start: part.start, end: part.end, from: source } : { start: lo(was.start, part.start), end: hi(was.end, part.end), from: was.from })
      list.push({ id: l.id, start: part.start, end: part.end })
    }
    into.set(name, list)
  }
  const ends = new Map<string, { start: Point; end: Point }>()
  for (const [, list] of into) for (const item of list) ends.set(item.id, along.get(item.id) ?? item)

  const walls: Wall[] = []
  const placed = new Set<string>()
  for (const wall of aligned.walls) {
    const list = into.get(wall.id)
    if (list === undefined) {
      walls.push(wall)
      continue
    }
    for (const item of list) {
      if (placed.has(item.id)) continue
      placed.add(item.id)
      const at = ends.get(item.id)!
      const from = along.get(item.id)?.from ?? wall
      walls.push({ ...from, id: item.id, start: [at.start[0], at.start[1]], end: [at.end[0], at.end[1]] })
    }
  }

  const openings: Opening[] = []
  for (const opening of aligned.openings) {
    const list = into.get(opening.wall)
    const host = own.get(opening.wall)
    if (list === undefined || host === undefined) {
      openings.push(opening)
      continue
    }
    const length = Math.hypot(host.end[0] - host.start[0], host.end[1] - host.start[1])
    const dir = { x: (host.end[0] - host.start[0]) / length, y: (host.end[1] - host.start[1]) / length }
    const point = (t: number): Point => [host.start[0] + dir.x * t, host.start[1] + dir.y * t]
    const middle = point(opening.offset + opening.width / 2)
    const target = list.find((item) => {
      const a = project(item.start, host.start, dir)
      const b = project(item.end, host.start, dir)
      const m = project(middle, host.start, dir)
      return m >= Math.min(a, b) - near && m <= Math.max(a, b) + near
    }) ?? list[list.length - 1]!
    const at = ends.get(target.id)!
    const tl = Math.hypot(at.end[0] - at.start[0], at.end[1] - at.start[1])
    if (tl === 0) return null
    const td = { x: (at.end[0] - at.start[0]) / tl, y: (at.end[1] - at.start[1]) / tl }
    const q0 = project(point(opening.offset), at.start, td)
    const q1 = project(point(opening.offset + opening.width), at.start, td)
    const flipped = q1 < q0
    openings.push({
      ...opening,
      wall: target.id,
      offset: Math.max(0, Math.min(q0, q1)),
      ...(flipped && opening.hinge !== undefined ? { hinge: opening.hinge === 'start' ? 'end' : 'start' } : {}),
      ...(flipped && opening.swing !== undefined ? { swing: opening.swing === 'left' ? 'right' : 'left' } : {})
    })
  }

  const leftovers = new Set([...into.values()].flat().filter((item) => !along.has(item.id)).map((item) => item.id))
  const listFor = (ids: readonly string[], room: string, reverse: boolean): string[] => {
    const theirs = new Set([...(laterRooms.get(room)?.boundary ?? []), ...(laterRooms.get(room)?.holes ?? []).flat()])
    const out: string[] = []
    for (const id of ids) {
      const list = into.get(id)
      if (list === undefined) {
        if (out[out.length - 1] !== id) out.push(id)
        continue
      }
      const ordered = reverse ? [...list].reverse() : list
      const kept = ordered.filter((item) => theirs.has(item.id) || leftovers.has(item.id))
      for (const item of kept.length > 0 ? kept : ordered) if (out[out.length - 1] !== item.id) out.push(item.id)
    }
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop()
    return out
  }
  const before = footprints(aligned)
  const next: FloorPlan = { ...aligned, walls, openings, rooms: aligned.rooms }
  const rooms: Room[] = []
  for (const room of aligned.rooms) {
    const touched = [...room.boundary, ...(room.holes ?? []).flat()].some((id) => into.has(id))
    if (!touched) {
      rooms.push(room)
      continue
    }
    const was = before.get(room.id)
    // Either way along each wall, whichever keeps the room's floor.
    const tried = [false, true].map((reverse): Room => ({
      ...room,
      boundary: listFor(room.boundary, room.id, reverse),
      ...(room.holes === undefined ? {} : { holes: room.holes.map((hole) => listFor(hole, room.id, reverse)) })
    }))
    const keeps = tried.find((candidate) => {
      const now = footprints({ ...next, rooms: [candidate] }).get(room.id)
      if (was === undefined) return now === undefined
      return now !== undefined && Math.abs(now.area - was.area) <= tolerance('areaReported')
    })
    if (keeps === undefined) return null
    rooms.push(keeps)
  }
  return { ...next, rooms }
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
