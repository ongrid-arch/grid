/**
 * What lies above a floor, for its plan (SHT-11, lab DR-5): the outline of the floor over it,
 * which a plan draws dashed, so a loft, an overhang or a floor that steps back shows on the plan
 * below it.
 *
 * The floor above is every floor at the next level up (LVL-1's `level`), and its outline the one
 * ARE-9's gross external area measures: what the outer edges of its walls enclose
 * (`floorOutline`). Drawn whole, most of that outline would lie on this floor's own outer walls
 * and say nothing, so a stretch that runs along this floor's outline, within `aboveSameEdge`, is
 * left out. What is left is where the floor above does not stand on this one's outer walls: past
 * them (an overhang, a floor over a basement's edge) or inside them (a loft, a floor stepped
 * back). A stretch over this floor's inner walls is kept: the walls drawn over it hide it.
 *
 * LVL-29: a floor whose roof states an overhang or parts (canopies, brise-soleil) has the roof's
 * edge past its own outline, and each part's, among the same dashed lines.
 *
 * The plan cannot yet say where a floor has a void or an opening (LVL-4), so floor no room
 * claims is not told apart: a void enclosed by the walls above is inside their outline.
 *
 * Pure, and never throws.
 */

import type { FloorPlan } from './plan'
import { planFloors, wholePlan } from './floors'
import { floorOutline } from './spaces'
import type { Vec2 } from './vec2'
import { add, distance, dot, scale, sub } from './vec2'
import { tolerance } from './tolerances'
import { planEnvelope } from './envelope'

export interface PlanAbove {
  /** The floors above, by id, in plan order. Empty on the top floor and on a plan that is no slice. */
  readonly floors: readonly string[]
  /** The parts of their outline to draw dashed: open lines, or closed ones that repeat their first point. */
  readonly lines: readonly (readonly Vec2[])[]
}

const NOTHING: PlanAbove = { floors: [], lines: [] }

const levelOf = (level: number): number => (Number.isFinite(level) ? level : 0)

/** The stretches of `a`–`b`, as shares of its length from `a`, that run along an edge of `rings`. */
function alongOutline(a: Vec2, b: Vec2, rings: readonly (readonly Vec2[])[]): [number, number][] {
  const length = distance(a, b)
  const near = tolerance('aboveSameEdge')
  const dir = scale(sub(b, a), 1 / length)
  const off = (p: Vec2): number => Math.abs((p.x - a.x) * dir.y - (p.y - a.y) * dir.x)
  const along = (p: Vec2): number => dot(sub(p, a), dir) / length
  const out: [number, number][] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i]!
      const d = ring[(i + 1) % ring.length]!
      if (off(c) > near || off(d) > near) continue
      const from = Math.max(0, Math.min(along(c), along(d)))
      const to = Math.min(1, Math.max(along(c), along(d)))
      if ((to - from) * length > near) out.push([from, to])
    }
  }
  return out.sort((x, y) => x[0] - y[0])
}

/** The parts of `ring`'s edges that do not run along `own`, joined end to end where they meet. */
function clipRing(ring: readonly Vec2[], own: readonly (readonly Vec2[])[]): Vec2[][] {
  const near = tolerance('aboveSameEdge')
  const pieces: Vec2[][] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const length = distance(a, b)
    if (!(length > tolerance('noLength'))) continue
    const at = (t: number): Vec2 => add(a, scale(sub(b, a), t))
    let from = 0
    const keep = (to: number): void => {
      if ((to - from) * length > near) pieces.push([at(from), at(to)])
    }
    for (const [x, y] of alongOutline(a, b, own)) {
      if (x > from) keep(x)
      from = Math.max(from, y)
    }
    keep(1)
  }
  // Join a piece to the one before it where they meet, within `aboveSameEdge` (the join leaves
  // steps of a hair at the corners), and the last to the first round the ring.
  const joined: Vec2[][] = []
  for (const piece of pieces) {
    const last = joined[joined.length - 1]
    if (last !== undefined && distance(last[last.length - 1]!, piece[0]!) <= near) last.push(piece[1]!)
    else joined.push([...piece])
  }
  if (joined.length > 1) {
    const first = joined[0]!
    const last = joined[joined.length - 1]!
    if (distance(last[last.length - 1]!, first[0]!) <= near) {
      joined[0] = [...last, ...first.slice(1)]
      joined.pop()
    }
  }
  return joined.map(straighten)
}

/** A line without the corners that lie on the straight run through their neighbours (`sameFace`). */
function straighten(line: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [line[0]!]
  for (let i = 1; i < line.length - 1; i++) {
    const a = out[out.length - 1]!
    const p = line[i]!
    const b = line[i + 1]!
    const span = distance(a, b)
    const off = span > 0 ? Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / span : distance(a, p)
    if (off > tolerance('sameFace')) out.push(p)
  }
  out.push(line[line.length - 1]!)
  return out
}

/**
 * The outline of the floor above `slice`'s floor, less what runs along its own outline: what its
 * plan draws dashed. `slice` is one floor's `planForFloor`; the floor above is read from the plan
 * it was cut from.
 */
export function floorAbove(slice: FloorPlan): PlanAbove {
  const { whole, floor } = wholePlan(slice)
  if (floor === null) return NOTHING
  const floors = planFloors(whole)
  const here = floors.find((f) => f.id === floor)
  if (here === undefined) return NOTHING
  const level = levelOf(here.level)
  const higher = floors.map((f) => levelOf(f.level)).filter((l) => l > level)
  const roofed = roofPast(whole, floor)
  if (higher.length === 0 && roofed.length === 0) return NOTHING
  const next = higher.length === 0 ? level : Math.min(...higher)
  const above = higher.length === 0 ? [] : floors.filter((f) => levelOf(f.level) === next).map((f) => f.id)
  const own = floorOutline(whole, floor) ?? []
  const lines: Vec2[][] = []
  for (const id of above) {
    for (const ring of floorOutline(whole, id) ?? []) lines.push(...clipRing(ring, own))
  }
  // LVL-29: the floor's own roof past its walls, its overhang and its parts, dashed as well.
  for (const ring of roofed) lines.push(...clipRing(ring, own))
  return { floors: above, lines }
}

/** LVL-29: the rings of a floor's roof that states an overhang or parts, and of each part; none otherwise. */
function roofPast(whole: FloorPlan, floor: string): Vec2[][] {
  const roof = (whole.floors ?? []).find((f) => f.id === floor)?.roof
  if (roof === undefined || (roof.overhang === undefined && (roof.parts ?? []).length === 0)) return []
  const env = planEnvelope(whole, { floors: [floor] }).floors[0]?.roof ?? null
  if (env === null) return []
  const pieces = [...(roof.overhang === undefined ? [] : env.pieces), ...env.facets.flatMap((facet) => (facet.part === undefined ? [] : facet.pieces))]
  return pieces.flatMap((polygon) => polygon.map((ring) => ring.slice(0, ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? -1 : ring.length).map(([x, y]) => ({ x, y }))))
}
