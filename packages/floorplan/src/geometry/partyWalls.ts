/**
 * ARE-14 (lab R-1): a flat's area to the middle of its party walls.
 *
 * The figure a developer quotes for a flat runs past the faces of its rooms: it holds the flat's
 * own inner walls and partitions, and stops at the middle of each wall the flat shares with another
 * flat, with the common parts or with a neighbour. At the walls that face outside it stops at the
 * inside face, or at the outside face, as the two gross areas do (`areas.ts`), so the figure comes
 * in the same two kinds and follows the gross measure the reader asked for.
 *
 * It is worked out room by room, edge by edge: each side of a room's floor is pushed out across
 * the wall it lies on, by half that wall where something of the building lies beyond it, by none
 * or all of it where the wall faces outside, and the corner between two pushed sides is filled to
 * where their lines meet. The pieces of a flat's rooms are joined, so two rooms of one flat meet
 * on the middle of the wall between them and the wall is counted once. Which walls face outside is
 * `exposure.ts`'s answer (MSG-13), stretch by stretch, read as the gross areas read it: a wall
 * stated exterior faces outside along all of it.
 *
 * Pure: rooms and walls in, square metres out. The join is done by `polygon-clipping` (MIT).
 */

import type { Polygon } from 'polygon-clipping'
import type { Wall } from './plan'
import type { WallSides } from './exposure'
import { stretchAt } from './exposure'
import { polygonArea, union } from './polygons'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { wallSegments, type WallSegment } from './wall'

/** A flat's area to the middle of its party walls, to each face of the walls that face outside. */
export interface PartyWallArea {
  /** To the inside face of the walls that face outside. */
  readonly grossInternal: number
  /** To their outside face. */
  readonly grossExternal: number
}

/** A room's floor as drawn: its outline and its holes, and the walls it lists. */
export interface PartyWallRoom {
  readonly polygon: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
  readonly walls: readonly Wall[]
}

type Pair = [number, number]

const signedArea = (ring: readonly Vec2[]): number => {
  let twice = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return twice / 2
}

/** The ring turned so that the floor lies on its left: outer rings counter-clockwise, holes clockwise. */
const floorOnLeft = (ring: readonly Vec2[], outer: boolean): Vec2[] => (signedArea(ring) > 0 === outer ? [...ring] : [...ring].reverse())

/** How far across its walls a room is pushed: to their inside face (0), their outside face (1), or across all of each (LVL-13). */
type PushDepth = 0 | 1 | 'whole'

/** A run of a room's side that lies on one wall's face, with how far the floor reaches past it. */
interface Reach {
  readonly from: number
  readonly to: number
  readonly depth: number
}

/**
 * How far past a room's side the figure reaches, along the side, in runs. `outer` is how much of a
 * wall that faces outside is counted: 0 to its inside face, 1 to its outside face. LVL-13: `whole`
 * reaches across the whole of every wall, whatever lies beyond it.
 */
function reaches(a: Vec2, b: Vec2, walls: readonly { readonly wall: Wall; readonly segment: WallSegment }[], sides: ReadonlyMap<string, WallSides>, outer: PushDepth): Reach[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (!(length > tolerance('noLength'))) return []
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  // The walls whose face this side lies on, each with the part of the side it runs along.
  const on = walls.flatMap(({ wall, segment }) => {
    if (wall.virtual === true || !(wall.thickness > 0)) return []
    if (Math.abs(dir.x * segment.dir.y - dir.y * segment.dir.x) > tolerance('nearlyParallel')) return []
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const across = Math.abs((mid.x - segment.start.x) * segment.dir.y - (mid.y - segment.start.y) * segment.dir.x)
    if (Math.abs(across - wall.thickness / 2) > tolerance('wallContact')) return []
    const u = (p: Vec2): number => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y
    const [u0, u1] = [u(segment.start), u(segment.end)].sort((x, y) => x - y) as [number, number]
    if (u1 < -wall.thickness || u0 > length + wall.thickness) return []
    return [{ wall, segment, u0, u1 }]
  })
  if (on.length === 0) return []
  const cuts = [...new Set([0, length, ...on.flatMap((w) => [w.u0, w.u1]).filter((u) => u > 0 && u < length)])].sort((x, y) => x - y)
  const out: Reach[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [from, to] = [cuts[i]!, cuts[i + 1]!]
    if (!(to - from > tolerance('noLength'))) continue
    const m = (from + to) / 2
    // The wall that runs along this part, else one that ends just short of it (where two walls meet).
    const here = on.find((w) => w.u0 <= m && m <= w.u1) ?? on.find((w) => w.u0 - w.wall.thickness <= m && m <= w.u1 + w.wall.thickness)
    if (here === undefined) continue
    const { wall, segment } = here
    if (outer === 'whole') {
      const last = out[out.length - 1]
      if (last !== undefined && last.depth === wall.thickness && from - last.to <= tolerance('noLength')) out[out.length - 1] = { ...last, to }
      else out.push({ from, to, depth: wall.thickness })
      continue
    }
    const point = { x: a.x + dir.x * m, y: a.y + dir.y * m }
    const t = Math.min(segment.length, Math.max(0, (point.x - segment.start.x) * segment.dir.x + (point.y - segment.start.y) * segment.dir.y))
    const along = segment.from + (segment.length === 0 ? 0 : (t * (segment.to - segment.from)) / segment.length)
    const wallSides = sides.get(wall.id)
    const worked = wallSides === undefined ? 'detached' : wallSides.stated === 'exterior' ? 'exterior' : (stretchAt(wallSides, along)?.worked ?? 'detached')
    const faces = worked === 'exterior' || worked === 'detached'
    const depth = faces ? outer * wall.thickness : wall.thickness / 2
    const last = out[out.length - 1]
    if (last !== undefined && last.depth === depth && from - last.to <= tolerance('noLength')) out[out.length - 1] = { ...last, to }
    else out.push({ from, to, depth })
  }
  return out
}

/** A ring's floor pushed out past each side by its reach, with the corners between two pushed sides filled. */
function pushedOut(ring: readonly Vec2[], walls: readonly { readonly wall: Wall; readonly segment: WallSegment }[], sides: ReadonlyMap<string, WallSides>, outer: PushDepth): Polygon[] {
  const n = ring.length
  const pieces: Polygon[] = []
  const runs = ring.map((a, i) => reaches(a, ring[(i + 1) % n]!, walls, sides, outer))
  const unit = (i: number): { dir: Vec2; normal: Vec2; length: number } => {
    const a = ring[i]!
    const b = ring[(i + 1) % n]!
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    // The floor is on the left of each side, so away from it is on the right.
    return { dir, normal: { x: dir.y, y: -dir.x }, length }
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i]!
    const { dir, normal } = unit(i)
    for (const run of runs[i]!) {
      if (!(run.depth > 0)) continue
      const at = (u: number, out: number): Pair => [a.x + dir.x * u + normal.x * out, a.y + dir.y * u + normal.y * out]
      pieces.push([[at(run.from, 0), at(run.to, 0), at(run.to, run.depth), at(run.from, run.depth)]])
    }
  }
  // At a corner that turns away from the floor, the two pushed sides leave a wedge between them: it
  // is filled to where their outer lines meet, as the faces of two walls meeting there do.
  for (let i = 0; i < n; i++) {
    const before = (i - 1 + n) % n
    const prev = unit(before)
    const next = unit(i)
    const last = runs[before]!.at(-1)
    const first = runs[i]![0]
    if (last === undefined || first === undefined) continue
    if (last.to < prev.length - tolerance('noLength') || first.from > tolerance('noLength')) continue
    const [d1, d2] = [last.depth, first.depth]
    if (!(d1 > 0) || !(d2 > 0)) continue
    const turn = prev.dir.x * next.dir.y - prev.dir.y * next.dir.x
    if (!(turn > tolerance('nearlyParallel'))) continue
    const p = ring[i]!
    const a1 = { x: p.x + prev.normal.x * d1, y: p.y + prev.normal.y * d1 }
    const a2 = { x: p.x + next.normal.x * d2, y: p.y + next.normal.y * d2 }
    // Where the line through a1 along the side before meets the line through a2 along the side after.
    const k = ((a2.x - a1.x) * next.dir.y - (a2.y - a1.y) * next.dir.x) / turn
    const meet = { x: a1.x + prev.dir.x * k, y: a1.y + prev.dir.y * k }
    pieces.push([[[p.x, p.y], [a1.x, a1.y], [meet.x, meet.y], [a2.x, a2.y]]])
  }
  return pieces
}

/** A room's floor and the pieces it is pushed out by across its walls, not yet joined. */
function roomPushed(room: PartyWallRoom, sides: ReadonlyMap<string, WallSides>, outer: PushDepth): Polygon[] {
  if (room.polygon.length < 3) return []
  const walls = room.walls.flatMap((wall) => {
    try {
      return wallSegments(wall).map((segment) => ({ wall, segment }))
    } catch {
      return []
    }
  })
  const outline = floorOnLeft(room.polygon, true)
  const holes = room.holes.filter((hole) => hole.length >= 3).map((hole) => floorOnLeft(hole, false))
  const ring = (points: readonly Vec2[]): Pair[] => points.map((p) => [p.x, p.y])
  const pieces: Polygon[] = [[ring(outline), ...holes.map(ring)]]
  // A hole's sides are pushed into it, to the middle or the face of the walls round it, as the outline's are.
  for (const r of [outline, ...holes]) pieces.push(...pushedOut(r, walls, sides, outer))
  return pieces
}

/**
 * LVL-13: a room's floor with the whole of each wall it lies on, the corners between two of them
 * filled: what a roof over the room alone covers. Pieces, not yet joined.
 */
export function overItsWalls(room: PartyWallRoom): Polygon[] {
  return roomPushed(room, new Map(), 'whole')
}

/**
 * The area of a group of rooms on one floor (a flat's, or the rooms in no flat) to the middle of
 * the walls they share with anything else of the building, and to the inside face and to the
 * outside face of the walls that face outside. Null when the join cannot be made.
 */
export function partyWallArea(rooms: readonly PartyWallRoom[], sides: ReadonlyMap<string, WallSides>): PartyWallArea | null {
  if (rooms.length === 0) return { grossInternal: 0, grossExternal: 0 }
  const measure = (outer: 0 | 1): number | null => {
    const pieces = rooms.flatMap((room) => roomPushed(room, sides, outer))
    if (pieces.length === 0) return 0
    try {
      return union(pieces).reduce((sum, polygon) => sum + polygonArea(polygon), 0)
    } catch {
      return null
    }
  }
  const grossInternal = measure(0)
  const grossExternal = measure(1)
  return grossInternal === null || grossExternal === null ? null : { grossInternal, grossExternal }
}
