/**
 * Where the ground is (LVL-4, lab VE-7 and VE-8).
 *
 * A plan may state the level of the ground outside, once for the site (`site.ground`, in metres
 * from the ground floor's floor level, the datum of a floor's `elevation`). With it stated:
 *
 * - the ground floor is the floor that stands nearest the ground, not the one at `level` 0, and a
 *   floor stands above the ground by its height over that level, not over 0;
 * - a door or window in an outside wall that lies below the ground is named
 *   (`openingsBelowGround`), wholly or in part.
 *
 * Unstated, the ground is at 0 and the ground floor is the floor at level 0, exactly as before.
 * One level for the whole site: the ground on each side of a house on a slope comes later.
 *
 * A floor on the ground whose slab stands clear of the ground stands on a plinth (VEW-16,
 * `plinthUnder`): its sections and facades carry it down to the ground, so nothing is left open
 * under it.
 *
 * Pure, and never throws.
 */

import { floorOf, planFloors, planForFloor } from './floors'
import type { BuildingElevations } from './elevations'
import { floorElevations } from './elevations'
import type { FloorSlab } from './envelope'
import type { Floor, FloorPlan, Opening } from './plan'
import { indexPlan } from './plan'
import { planWallSides, stretchAt } from './exposure'
import { brokenOnFloor } from './validate'
import { limit, tolerance } from './tolerances'
import { wallLength } from './wall'

/** The site's stated ground level, or null when the plan states none. */
export function statedGround(plan: FloorPlan): number | null {
  const ground = plan.site?.ground
  return ground !== undefined && Number.isFinite(ground) ? ground : null
}

/** Where the ground is, and which floors stand at it. */
export interface GroundLevel {
  /** The ground's level: as stated, else 0. */
  readonly level: number
  readonly stated: boolean
  /** How far each floor's floor level stands above the ground, by floor id (negative below it). */
  readonly above: ReadonlyMap<string, number>
  /** The floors the way out is checked from: see `groundLevel`. */
  readonly groundFloors: readonly Floor[]
  /** Whether a floor stands so high over the ground that a door to the outside opens in mid-air. */
  readonly aboveGround: (floor: string) => boolean
}

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/**
 * The ground and the ground floor.
 *
 * A floor stands above the ground by its floor level less the ground's; past
 * `outsideDoorAboveGround` it is off the ground, and its doors to the outside open in mid-air. The
 * ground floor is, of the floors not off the ground:
 *
 * - with no ground stated, the floors at level 0, or the only floor (as before LVL-4);
 * - with a ground stated, the floors whose floor level lies nearest the ground, every floor within
 *   `sameFloorLevel` of the nearest counted.
 */
export function groundLevel(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): GroundLevel {
  const floors = planFloors(plan)
  const stated = statedGround(plan)
  const level = stated ?? 0
  const above = new Map(floors.map((f) => [f.id, (elevations.floors.get(f.id)?.floorLevel ?? 0) - level] as const))
  // CNT-6 (C23): a floor that states what lies below it says itself whether it is at the ground.
  const below = new Map(floors.map((f) => [f.id, f.below] as const))
  const aboveGround = (floor: string): boolean => {
    const stated = below.get(floor)
    if (stated !== undefined) return stated !== 'ground'
    return (above.get(floor) ?? 0) > limit('outsideDoorAboveGround')
  }
  const onGround = floors.filter((f) => !aboveGround(f.id))
  let groundFloors: Floor[]
  if (stated === null) {
    groundFloors = (floors.length === 1 ? floors : floors.filter((f) => levelOf(f) === 0)).filter((f) => !aboveGround(f.id))
  } else {
    const nearest = Math.min(...onGround.map((f) => Math.abs(above.get(f.id)!)))
    groundFloors = onGround.filter((f) => Math.abs(above.get(f.id)!) - nearest <= tolerance('sameFloorLevel'))
  }
  return { level, stated: stated !== null, above, groundFloors, aboveGround }
}

/** The plinth a floor stands on, from the ground up to the underside of its slab. */
export interface Plinth {
  /** The ground's level. */
  readonly bottom: number
  /** The underside of the floor's slab. */
  readonly top: number
}

/**
 * VEW-16: the plinth under a floor, or null. A floor has one when its slab is a base slab (LVL-4:
 * on the lowest level, standing on the ground, `below` unstated or `ground`) and the slab's
 * underside stands more than `plinthLeast` above the ground: the walls are carried down to the
 * ground under it. A floor at the ground or below it, or standing on anything else, has none.
 */
export function plinthUnder(slab: FloorSlab | null, ground: number): Plinth | null {
  if (slab === null || slab.kind !== 'base' || !Number.isFinite(ground)) return null
  const foot = slab.top - Math.max(0, slab.thickness)
  if (!Number.isFinite(foot) || !(foot - ground > tolerance('plinthLeast'))) return null
  return { bottom: ground, top: foot }
}

/** A door or window in an outside wall that lies below the ground the site states. */
export interface OpeningBelowGround {
  readonly floor: string
  readonly opening: string
  readonly type: Opening['type']
  readonly wall: string
  /** The rooms inside it, by id: one, or none when no room is drawn there. */
  readonly rooms: readonly string[]
  /** Metres its foot (the sill, or a door's threshold) lies below the ground. */
  readonly sillBelow: number
  /** Metres its top lies below the ground: 0 or less when it reaches above it. */
  readonly topBelow: number
  /** Whether it lies wholly below the ground. */
  readonly wholly: boolean
}

/**
 * Every door, window and doorless opening in an outside wall whose foot lies more than
 * `openingBelowGround` under the ground the site states, floor by floor in plan order. None when
 * the plan states no ground. An opening is in an outside wall when its wall is stated exterior, or
 * when the stretch of wall it is in has a room on one face only (MSG-13, `planWallSides`).
 */
export function openingsBelowGround(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): OpeningBelowGround[] {
  const ground = statedGround(plan)
  if (ground === null) return []
  const found: OpeningBelowGround[] = []
  for (const floor of planFloors(plan)) {
    const base = elevations.floors.get(floor.id)?.floorLevel
    if (base === undefined) continue
    const slice = planForFloor(plan, floor.id)
    const broken = brokenOnFloor(slice)
    const index = indexPlan(slice)
    let sides: ReturnType<typeof planWallSides> | null = null
    for (const opening of slice.openings) {
      if (broken.has(opening.id) || broken.has(opening.wall)) continue
      const sill = base + opening.sill
      const top = sill + opening.height
      if (!(ground - sill > tolerance('openingBelowGround'))) continue
      const wall = index.wallsById.get(opening.wall)
      if (wall === undefined || floorOf(wall) !== floor.id) continue
      sides ??= planWallSides(index)
      const wallSides = sides.get(wall.id)
      let along: number
      try {
        along = Math.min(opening.offset + opening.width / 2, wallLength(wall))
      } catch {
        continue
      }
      const stretch = wallSides === undefined ? null : stretchAt(wallSides, along)
      const outside = wall.kind === 'exterior' || stretch?.worked === 'exterior'
      if (!outside) continue
      const rooms = stretch === null ? [] : [...new Set([...stretch.left, ...stretch.right])]
      found.push({
        floor: floor.id,
        opening: opening.id,
        type: opening.type,
        wall: wall.id,
        rooms,
        sillBelow: ground - sill,
        topBelow: ground - top,
        wholly: ground - top > tolerance('openingBelowGround')
      })
    }
  }
  return found
}
