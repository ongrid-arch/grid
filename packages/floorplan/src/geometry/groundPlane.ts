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
 * One level for the whole site, as the schema has it: the ground on each side of a house on a slope
 * is not here. Pure, and never throws.
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

/** The ground under and round the building, in the floors' own datum and on plan (C4). */
export interface SceneGround {
  /** The ground's level: as the site states it, else 0. */
  readonly level: number
  readonly stated: boolean
  /** The floors that go down into the ground, their slab's underside below it, in plan order. */
  readonly into: readonly string[]
  /**
   * The ground on plan: a square reaching `reach` past the plan's walls on every side, less the
   * outlines of the floors in `into`. Each piece counter-clockwise with its holes clockwise.
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
  try {
    const ground = groundLevel(plan, elevations)
    level = ground.level
    stated = ground.stated
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
      if (!(level - foot > tolerance('sameFloorLevel'))) continue
      into.push(shell.floor)
      if (shell.outline !== null && shell.outline.length > 0) outlines.push(shell.outline)
    }
  } catch {
    // Nothing is cut: the ground lies whole round the building.
  }

  const square = groundSquare(plan, reach)
  const pieces = outlines.length === 0 ? [square] : (cutOutline('difference', [square], outlines) ?? [square])
  return { level, stated, into, pieces }
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
