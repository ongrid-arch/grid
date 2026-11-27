/**
 * VEW-66: the ground in the 3D view.
 *
 * The 3D view stacks storeys in the floors' own datum: metres from the ground floor's floor level,
 * as `floorElevations` places them. The ground lies at the level the site states (`site.ground`,
 * LVL-4), else at 0, the same level `groundLevel` and the sections (VEW-65) take. Under it are the
 * floors whose slab's underside lies below it: a basement, a car park's levels, the ground floor's
 * own slab. The ground is drawn as a sheet round the building, cut away over the outline of every
 * such floor, so a floor shown as a cutaway is seen through the hole and the rest of what is buried
 * is seen through the ground.
 *
 * CNT-49: on a slope (`groundSurface`) the sheet is tilted: `tilt` is the ground's level at a point
 * over `level`, `at + x * x + y * y`, and a floor goes down into the ground when its slab's underside
 * lies below the highest ground under its walls.
 *
 * CNT-60: with a plot stated (`site.boundary`), the ground is the plot, not the square, and it is cut
 * away over every pool too, so the pool's water (`siteScene`) is seen down in the hole. Pure, and
 * never throws.
 */

import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { BuildingElevations } from './elevations'
import { floorElevations } from './elevations'
import { planEnvelope } from './envelope'
import { planBounds } from './floorplan'
import type { FloorPlan } from './plan'
import { groundLevel } from './ground'
import { cutOutline } from './polygons'
import { tolerance } from './tolerances'
import { poolOutlines } from './siteScene'

/** The ground under and round the building, in the floors' own datum and on plan (C4). */
export interface SceneGround {
  /** The ground's level: as the site states it, else 0. */
  readonly level: number
  readonly stated: boolean
  /** CNT-49: on a slope, the ground's rise over `level` at a point of the plan, `at + x * px + y * py`. */
  readonly tilt?: { readonly at: number; readonly x: number; readonly y: number }
  /** The floors that go down into the ground, their slab's underside below it, in plan order. */
  readonly into: readonly string[]
  /**
   * The ground on plan: a square reaching `reach` past the plan's walls on every side, or the plot
   * when the site states one (CNT-60), less the outlines of the floors in `into` and the pools.
   * Each piece counter-clockwise with its holes clockwise.
   */
  readonly pieces: MultiPolygon
}

/**
 * The ground for the 3D view, reaching `reach` metres past the plan's walls. A floor whose outline
 * is not known cuts nothing; a plan with no wall gives a square round the origin.
 */
export function sceneGround(plan: FloorPlan, reach: number, elevations: BuildingElevations = floorElevations(plan)): SceneGround {
  let level = 0
  let stated = false
  let tilt: SceneGround['tilt']
  let highUnder: (floor: string) => number = () => level
  try {
    const ground = groundLevel(plan, elevations)
    level = ground.level
    stated = ground.stated
    if (ground.surface !== null) {
      tilt = { at: ground.surface.c - level, x: ground.surface.gradient.x, y: ground.surface.gradient.y }
      highUnder = (floor) => ground.under.get(floor)?.high ?? level
    }
  } catch {
    // The ground at 0, as with none stated.
  }

  const into: string[] = []
  const outlines: MultiPolygon[] = []
  try {
    for (const shell of planEnvelope(plan, { elevations }).floors) {
      const storey = elevations.floors.get(shell.floor)
      if (storey === undefined) continue
      const thickness = shell.slab === null ? 0 : Math.max(0, shell.slab.thickness)
      const foot = (shell.slab?.top ?? storey.floorLevel) - thickness
      if (!(highUnder(shell.floor) - foot > tolerance('sameFloorLevel'))) continue
      into.push(shell.floor)
      if (shell.outline !== null && shell.outline.length > 0) outlines.push(shell.outline)
    }
  } catch {
    // Nothing is cut: the ground lies whole round the building.
  }

  const square = plotOf(plan) ?? groundSquare(plan, reach)
  // CNT-60: the pools are holes in the ground.
  for (const pool of poolOutlines(plan)) outlines.push([[[...pool.map((p): [number, number] => [p.x, p.y]), [pool[0]!.x, pool[0]!.y]]]])
  const pieces = outlines.length === 0 ? [square] : (cutOutline('difference', [square], outlines) ?? [square])
  return { level, stated, ...(tilt === undefined ? {} : { tilt }), into, pieces }
}

/** CNT-60: the plot's boundary as a closed ring, counter-clockwise; null when the site states none. */
function plotOf(plan: FloorPlan): Polygon | null {
  const boundary = plan.site?.boundary
  if (boundary === undefined || boundary.length < 3) return null
  const first = boundary[0]!
  const last = boundary.at(-1)!
  const open = first[0] === last[0] && first[1] === last[1] ? boundary.slice(0, -1) : boundary
  const ring: [number, number][] = open.map(([x, y]) => [x, y])
  let twice = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!
    const [bx, by] = ring[(i + 1) % ring.length]!
    twice += ax * by - bx * ay
  }
  if (!(Math.abs(twice) > 0)) return null
  if (twice < 0) ring.reverse()
  return [[...ring, ring[0]!]]
}

/** The square `reach` past the plan's bounds, counter-clockwise; round the origin when there are none. */
function groundSquare(plan: FloorPlan, reach: number): Polygon {
  const r = Number.isFinite(reach) && reach > 0 ? reach : 0
  let bounds: { min: { x: number; y: number }; max: { x: number; y: number } }
  try {
    bounds = planBounds(plan)
  } catch {
    bounds = { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
  }
  const finite = [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].every(Number.isFinite) && bounds.max.x >= bounds.min.x && bounds.max.y >= bounds.min.y
  const { min, max } = finite ? bounds : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
  const [x0, y0, x1, y1] = [min.x - r, min.y - r, max.x + r, max.y + r]
  return [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0]
    ]
  ]
}
