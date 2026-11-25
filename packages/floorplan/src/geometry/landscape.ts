/**
 * Garden and boundary walls (CNT-26): a wall that stands apart from the building is landscape.
 *
 * A wall is loose when it stands on a floor that has rooms and no room has anything to do with
 * it: no room lists it, no room lies just past either of its faces, it stands in no outdoor space
 * and it rises through no other floor. Loose walls that touch are one group, and a group is
 * landscape when it stands apart from the building:
 *
 * - it touches no wall of the building (a garden wall standing apart, a ring of walls round a
 *   yard); or
 * - it touches the building at one place only and closes no ring of its own (a garden wall run out
 *   from a corner of the house); or
 * - its walls alone close round rooms (a boundary wall round the plot, with any wall run out from
 *   the house to it).
 *
 * A group that meets the building at two places or more and does not close round it encloses
 * floor with the building's walls: a landing or a room not drawn yet, which stays floor no room
 * claims (ARE-4) and the building's. A low wall inside a room, a wall a room lists and the fence
 * round an outdoor space (CNT-7, `outdoorOnlyWalls`) are never loose.
 *
 * A landscape wall is never building. It is left out of the spaces the walls enclose
 * (`spaces.ts`) and of the walls the areas, the outline, the slab, the roof and the section gather
 * (`areas.ts`), so a closed ring of them encloses a garden, not floor; it sets no storey height
 * (`elevations.ts`); it stands in the open (`exposure.ts`: `detached`, whatever kind it states);
 * it is drawn lighter than an outside wall and keyed as a garden wall; and the take-off lists its
 * metres apart. It is still drawn, exported and checked as the wall it is.
 *
 * A floor with no rooms keeps every wall, so a plan drawn as walls alone, rooms to come, reads as
 * it always has. Read from the rooms' shapes and the walls only, never from the spaces or the
 * exposure, so both can read it. Pure, and never throws. The join is done by `polygon-clipping`
 * (MIT).
 */

import type { Pair, Polygon } from 'polygon-clipping'
import type { FloorPlan, PlanIndex, Wall } from './plan'
import { indexPlan, roomWallIds } from './plan'
import { floorOf, wallsOnFloor } from './floors'
import { tryRoomShape } from './room'
import { isOutdoor, outdoorOnlyWalls } from './outdoor'
import { inRing as inPairRing, strip, union } from './polygons'
import { tolerance, tolerancesAsStated } from './tolerances'
import { wallFrameAt, wallLength, wallSegments } from './wall'
import type { Vec2 } from './vec2'
import { add, dot, scale, sub } from './vec2'

const cache = new WeakMap<FloorPlan, ReadonlySet<string>>()
const NONE: ReadonlySet<string> = new Set()

type Shape = { readonly polygon: readonly Vec2[]; readonly holes: readonly (readonly Vec2[])[] }

function inRing(p: Vec2, ring: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

/** The points just past each face of the wall, at its middle and its quarters; null where its axis cannot be worked out. */
function probes(wall: Wall): Vec2[] | null {
  try {
    const length = wallLength(wall)
    if (!(length > 0)) return null
    const step = (wall.virtual === true ? 0 : wall.thickness / 2) + tolerance('stepPastFace')
    return [0.25, 0.5, 0.75].flatMap((share) => {
      const { point, normal } = wallFrameAt(wall, length * share)
      return [1, -1].map((sign) => ({ x: point.x + normal.x * step * sign, y: point.y + normal.y * step * sign }))
    })
  } catch {
    return null
  }
}

/** A wall as its straight pieces, each with half its thickness (none for a dividing line). */
interface Piece {
  readonly start: Vec2
  readonly end: Vec2
  readonly dir: Vec2
  readonly length: number
  readonly half: number
}

function piecesOf(wall: Wall): Piece[] {
  try {
    const half = wall.virtual === true ? 0 : wall.thickness / 2
    return wallSegments(wall).filter((s) => s.length > 0).map((s) => ({ start: s.start, end: s.end, dir: s.dir, length: s.length, half }))
  } catch {
    return []
  }
}

/** The point of a piece nearest a point. */
function nearestOn(piece: Piece, p: Vec2): Vec2 {
  const along = Math.max(0, Math.min(piece.length, dot(sub(p, piece.start), piece.dir)))
  return add(piece.start, scale(piece.dir, along))
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Whether two segments cross. */
function crosses(a: Piece, b: Piece): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = side(b.start, b.end, a.start)
  const d2 = side(b.start, b.end, a.end)
  const d3 = side(a.start, a.end, b.start)
  const d4 = side(a.start, a.end, b.end)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Where two pieces touch, body to body, or null where they do not. */
function contact(a: Piece, b: Piece): Vec2 | null {
  const reach = a.half + b.half + tolerance('touch')
  // Pieces whose boxes lie further apart than that cannot touch.
  if (
    Math.min(a.start.x, a.end.x) - Math.max(b.start.x, b.end.x) > reach ||
    Math.min(b.start.x, b.end.x) - Math.max(a.start.x, a.end.x) > reach ||
    Math.min(a.start.y, a.end.y) - Math.max(b.start.y, b.end.y) > reach ||
    Math.min(b.start.y, b.end.y) - Math.max(a.start.y, a.end.y) > reach
  )
    return null
  if (crosses(a, b)) {
    // The axes cross: near enough where, for telling one place from another.
    return nearestOn(b, nearestOn(a, b.start))
  }
  const pairs: [Vec2, Vec2][] = [
    [a.start, nearestOn(b, a.start)],
    [a.end, nearestOn(b, a.end)],
    [nearestOn(a, b.start), b.start],
    [nearestOn(a, b.end), b.end],
  ]
  let best: [Vec2, Vec2] | null = null
  for (const pair of pairs) if (best === null || distance(...pair) < distance(...best)) best = pair
  if (best === null || distance(...best) > reach) return null
  return scale(add(best[0], best[1]), 0.5)
}

/** The places where a group touches the building's walls, one for each spot more than a wall's width apart. */
function placesTouched(group: readonly Piece[], building: readonly Piece[]): number {
  const spots: { at: Vec2; reach: number }[] = []
  for (const a of group) {
    for (const b of building) {
      const at = contact(a, b)
      if (at === null) continue
      const reach = 2 * (a.half + b.half) + tolerance('touch')
      if (!spots.some((spot) => distance(spot.at, at) <= Math.max(spot.reach, reach))) spots.push({ at, reach })
    }
  }
  return spots.length
}

/** A group's walls alone joined: the rings they close round, as holes in what they cover. */
function closes(group: readonly Piece[]): readonly Pair[][] {
  try {
    const join = tolerance('gap')
    const keep = (v: number): number => v
    const strips: Polygon[] = group.map((piece) => strip(piece.start, piece.dir, piece.length, Math.max(piece.half, tolerance('touch')), join + piece.half, keep))
    const joined = union(strips)
    return joined.flatMap((polygon) => polygon.slice(1))
  } catch {
    return []
  }
}

/** The ids of the plan's garden and boundary walls: walls that stand apart from the building. */
export function landscapeWalls(plan: FloorPlan, index?: PlanIndex): ReadonlySet<string> {
  const stated = tolerancesAsStated()
  const found = stated ? cache.get(plan) : undefined
  if (found !== undefined) return found
  const out = work(plan, index)
  if (stated) cache.set(plan, out)
  return out
}

function work(plan: FloorPlan, given: PlanIndex | undefined): ReadonlySet<string> {
  const roomed = new Set(plan.rooms.filter((room) => !isOutdoor(room)).map(floorOf))
  if (roomed.size === 0) return NONE
  const listed = new Set<string>()
  for (const room of plan.rooms) for (const id of roomWallIds(room)) listed.add(id)
  const candidates = plan.walls.filter((wall) => !listed.has(wall.id) && wall.through === undefined && roomed.has(floorOf(wall)))
  if (candidates.length === 0) return NONE
  const index = given ?? indexPlan(plan)
  const outdoor = outdoorOnlyWalls(index)
  const shapes = new Map<string, Shape[]>()
  const shapesOn = (floor: string): Shape[] => {
    let list = shapes.get(floor)
    if (list === undefined) {
      list = plan.rooms.flatMap((room) => {
        if (floorOf(room) !== floor) return []
        const shape = tryRoomShape(room, index)
        return shape === null || shape.polygon.length < 3 ? [] : [shape]
      })
      shapes.set(floor, list)
    }
    return list
  }
  const loose = new Map<string, Wall[]>()
  for (const wall of candidates) {
    if (outdoor.has(wall.id)) continue
    const points = probes(wall)
    if (points === null) continue
    const rooms = shapesOn(floorOf(wall))
    const beside = points.some((p) => rooms.some((shape) => inRing(p, shape.polygon) && !shape.holes.some((hole) => inRing(p, hole))))
    if (beside) continue
    const floor = floorOf(wall)
    loose.set(floor, [...(loose.get(floor) ?? []), wall])
  }
  const out = new Set<string>()
  for (const [floor, walls] of loose) {
    const ids = new Set(walls.map((wall) => wall.id))
    const building = wallsOnFloor(plan, floor).filter((wall) => !ids.has(wall.id)).flatMap(piecesOf)
    const pieces = new Map(walls.map((wall) => [wall.id, piecesOf(wall)] as const))
    // The loose walls that touch, as groups.
    const groupOf = new Map<string, number>()
    const groups: Wall[][] = []
    for (const wall of walls) {
      if (groupOf.has(wall.id)) continue
      const group: Wall[] = []
      const todo = [wall]
      groupOf.set(wall.id, groups.length)
      while (todo.length > 0) {
        const next = todo.pop()!
        group.push(next)
        for (const other of walls) {
          if (groupOf.has(other.id)) continue
          if (pieces.get(next.id)!.some((a) => pieces.get(other.id)!.some((b) => contact(a, b) !== null))) {
            groupOf.set(other.id, groups.length)
            todo.push(other)
          }
        }
      }
      groups.push(group)
    }
    const rooms = shapesOn(floor)
    for (const group of groups) {
      const own = group.flatMap((wall) => pieces.get(wall.id)!)
      const touched = placesTouched(own, building)
      const rings = closes(own)
      // A room every corner of which lies inside a ring the group closes: the group goes round it.
      const round = rings.some((ring) => rooms.some((shape) => shape.polygon.every((corner) => inPairRing(corner, ring))))
      if (touched === 0 || (touched === 1 && rings.length === 0) || round) for (const wall of group) out.add(wall.id)
    }
  }
  return out.size === 0 ? NONE : out
}
