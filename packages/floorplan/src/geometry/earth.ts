/**
 * What of the building has earth against it (ARE-77): the walls that hold the ground back, the
 * slabs the ground covers, the slabs that rest on the ground, and the earth dug out for them.
 *
 * All of it is judged from the ground (`groundLevel`: the site's stated ground, its slope, a
 * building's pad) and the floors' levels (`floorElevations`), on the building as it will be after
 * the work. Nothing here is stated by the plan, so a take-off marks every figure assumed.
 *
 * - A retaining wall is an outer face of a floor (`planShell`) that has the ground above the
 *   floor's level along it. The ground runs straight along a wall (it is one level, or one even
 *   slope), so the depth of earth between its two ends is a straight line, held to the wall's
 *   height; the face below the ground is its area, and the most it holds is its retained height.
 *   A depth within `sameFloorLevel` is no earth.
 * - A buried slab is the slab over the part of a floor that the ground covers: the roof Grid does
 *   not lay there (`FloorEnvelope.buried`, LVL-13), and the flat roof over a floor whose floor is
 *   below the ground at the roof's middle when its top stands no more than `buriedSlabAboveGround` above it (a basement
 *   reaching out under the garden). Its soil cover is the ground at its middle less its top.
 * - A ground-bearing slab is the part of a floor's slab with no lower floor under it, on a floor
 *   that stands on the ground (its `below` unstated or `ground`, and not standing off the ground
 *   as `groundLevel` judges): the whole of a base slab, the half of a basement floor past the
 *   floor below it, a ground floor past the basement.
 * - The excavation is, for each floor whose floor is below the ground at the middle of its
 *   ground-bearing slab (a basement, a floor cut into a slope), that slab's area times the depth
 *   from the ground there down to the slab's underside. Each point of
 *   the plan lies over one lowest slab, so the parts add up to the dig.
 *
 * Pure, and never throws on a plan the schema reads: a floor whose outline is not known has none.
 */

import type { MultiPolygon } from 'polygon-clipping'
import { planInState } from './phases'
import { planFloors } from './floors'
import { floorElevations } from './elevations'
import { planEnvelope } from './envelope'
import { planShell, shellKnown } from './shell'
import { groundLevel } from './ground'
import { cutOutline, multiArea, ringArea } from './polygons'
import { tolerance } from './tolerances'
import type { FloorPlan } from './plan'
import type { Vec2 } from './vec2'

/** The outer face of one wall on one floor with earth against it. */
export interface RetainingFace {
  readonly floor: string
  readonly wall: string
  /** Along the floor's outline, in metres. */
  readonly length: number
  /** The wall's height, in metres. */
  readonly height: number
  /** The most earth it holds, from the floor's level up, held to its height, in metres. */
  readonly retained: number
  /** The face below the ground, in m². */
  readonly area: number
  /** The share of the wall's face below the ground: `area` over its length times its height. */
  readonly share: number
}

/** A slab with the earth on it. */
export interface BuriedSlab {
  readonly floor: string
  /** On plan, in m². */
  readonly area: number
  /** The level of its top, in the floors' datum. */
  readonly top: number
  /** The soil over it, in metres: the ground at its middle less its top, never below 0. */
  readonly cover: number
  /** `roof` when Grid would lay it as the floor's roof, which it then is not; `ground` when Grid lays none there. */
  readonly from: 'roof' | 'ground'
}

/** The part of a floor's slab that rests on the ground. */
export interface BearingSlab {
  readonly floor: string
  /** On plan, in m², to the outside face of the walls. */
  readonly area: number
  /** The share of the floor's slab it is. */
  readonly share: number
  /** Whether the whole slab is a base slab (LVL-4). */
  readonly base: boolean
  /** The level of its underside. */
  readonly bottom: number
}

/** The earth dug out under one floor. */
export interface FloorDig {
  readonly floor: string
  readonly area: number
  /** From the ground at its middle down to the underside of its slab, in metres. */
  readonly depth: number
  /** In m³. */
  readonly volume: number
}

export interface PlanEarth {
  readonly retaining: readonly RetainingFace[]
  readonly buried: readonly BuriedSlab[]
  readonly bearing: readonly BearingSlab[]
  readonly dig: readonly FloorDig[]
  /** Every floor's dig, in m³. */
  readonly excavation: number
  /** Whether any of it is in the earth: a retaining wall, a buried slab, a dig, or a ground-bearing slab off the lowest level. */
  readonly inEarth: boolean
}

/** The mean of a straight line from `a` to `b`, held between 0 and `h`. Exact: the line is cut where it crosses either. */
export function meanHeld(a: number, b: number, h: number): number {
  if (!(h > 0)) return 0
  const cuts = [0, 1]
  if (a !== b) for (const at of [0, h]) {
    const t = (at - a) / (b - a)
    if (t > 0 && t < 1) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  let sum = 0
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i]!
    const t1 = cuts[i + 1]!
    sum += (t1 - t0) * Math.min(h, Math.max(0, a + ((b - a) * (t0 + t1)) / 2))
  }
  return sum
}

/** The middle of some pieces, by area, or null when they have none. */
export function piecesMiddle(pieces: MultiPolygon): Vec2 | null {
  let total = 0
  let x = 0
  let y = 0
  for (const polygon of pieces) {
    polygon.forEach((ring, i) => {
      let cx = 0
      let cy = 0
      let signed = 0
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k]!
        const [bx, by] = ring[(k + 1) % ring.length]!
        const cross = ax * by - bx * ay
        signed += cross
        cx += (ax + bx) * cross
        cy += (ay + by) * cross
      }
      if (signed === 0) return
      const area = ringArea(ring) * (i === 0 ? 1 : -1)
      // The ring's centroid is the sums over three times its signed doubled area.
      x += (cx / (3 * signed)) * area
      y += (cy / (3 * signed)) * area
      total += area
    })
  }
  return total > 0 ? { x: x / total, y: y / total } : null
}

/** The earth against the building, floor by floor; only the floors given, when given. */
export function planEarth(stated: FloorPlan, floors?: readonly string[]): PlanEarth {
  const plan = planInState(stated, 'after')
  const wanted = (floor: string): boolean => floors === undefined || floors.includes(floor)
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations)
  const levelOf = (floor: string): number => elevations.floors.get(floor)?.floorLevel ?? 0
  const same = tolerance('sameFloorLevel')
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  const at = (p: readonly [number, number]): Vec2 => ({ x: p[0], y: p[1] })
  const groundOver = (floor: string, pieces: MultiPolygon): number => {
    const middle = piecesMiddle(pieces)
    return middle === null ? ground.groundOf(floor) : ground.groundAt(floor, middle)
  }

  const retaining: RetainingFace[] = []
  for (const shell of planShell(stated)) {
    if (!wanted(shell.floor) || !shellKnown(shell)) continue
    const level = levelOf(shell.floor)
    for (const face of shell.faces) {
      const wall = walls.get(face.wall)
      if (wall === undefined || !(face.height > 0) || !(face.length > 0)) continue
      const a = ground.groundAt(shell.floor, at(wall.start)) - level
      const b = ground.groundAt(shell.floor, at(wall.end)) - level
      const retained = Math.min(face.height, Math.max(0, a, b))
      if (!(retained > same)) continue
      const mean = meanHeld(a, b, face.height)
      retaining.push({ floor: shell.floor, wall: wall.id, length: face.length, height: face.height, retained, area: face.length * mean, share: mean / face.height })
    }
  }

  const envelope = planEnvelope(stated)
  const byFloor = new Map(planFloors(plan).map((f) => [f.id, f] as const))
  const buried: BuriedSlab[] = []
  const bearing: BearingSlab[] = []
  const dig: FloorDig[] = []
  for (const env of envelope.floors) {
    const floor = byFloor.get(env.floor)
    if (floor === undefined || !wanted(env.floor)) continue
    const level = levelOf(env.floor)
    if (env.buried !== undefined && env.buried.area > tolerance('noArea')) {
      buried.push({ floor: env.floor, area: env.buried.area, top: env.buried.top, cover: Math.max(0, groundOver(env.floor, env.buried.pieces) - env.buried.top), from: 'ground' })
    }
    if (env.roof !== null && env.roof.shape === null && env.roof.area > tolerance('noArea')) {
      const top = env.roof.bottom + env.roof.thickness
      const over = groundOver(env.floor, env.roof.pieces)
      // Only over a floor whose floor is below the ground there.
      if (over - level > same && top <= over + tolerance('buriedSlabAboveGround')) buried.push({ floor: env.floor, area: env.roof.area, top, cover: Math.max(0, over - top), from: 'roof' })
    }
    const slab = env.slab
    const onGround = (floor.below === undefined || floor.below === 'ground') && !ground.aboveGround(env.floor)
    if (slab === null || !(slab.area > tolerance('noArea')) || !onGround) continue
    const lower = envelope.floors.filter((other) => other.floor !== env.floor && other.outline !== null && other.outline.length > 0 && levelOf(other.floor) < level - same)
    const pieces = lower.length === 0 ? slab.pieces : cutOutline('difference', slab.pieces, lower.map((other) => other.outline!))
    if (pieces === null) continue
    const area = multiArea(pieces)
    if (!(area > tolerance('noArea'))) continue
    const bottom = level - slab.thickness
    bearing.push({ floor: env.floor, area, share: Math.min(1, area / slab.area), base: slab.kind === 'base', bottom })
    // A floor whose floor is below the ground at the middle of its ground-bearing slab is dug out.
    const over = groundOver(env.floor, pieces)
    const depth = over - bottom
    if (over - level > same) dig.push({ floor: env.floor, area, depth, volume: area * depth })
  }
  const excavation = dig.reduce((sum, d) => sum + d.volume, 0)
  const inEarth = retaining.length > 0 || buried.length > 0 || dig.length > 0 || bearing.some((b) => !b.base)
  return { retaining, buried, bearing, dig, excavation, inEarth }
}
