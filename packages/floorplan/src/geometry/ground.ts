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
 * LVL-23: a plan that names buildings (C23) gives each its own ground (`buildingGrounds`): its
 * `pad`, else the site's stated ground, else the floor level of its own ground floor (its lowest
 * floor at or above level 0). Each building's floors stand above its own ground, and each building
 * has its own ground floor, the floor of its own nearest that ground. The floors no building names
 * are read against the site's ground, as every floor was before. `level` stays the site's, so the
 * sections and facades draw the site's ground line as before.
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
import { planBuildings } from './buildings'

/** The site's stated ground level, or null when the plan states none. */
export function statedGround(plan: FloorPlan): number | null {
  const ground = plan.site?.ground
  return ground !== undefined && Number.isFinite(ground) ? ground : null
}

/** LVL-23: what a building's ground is: its pad, the site's stated ground, or its own ground floor's floor level. */
export type GroundFrom = 'pad' | 'site' | 'floor'

/** LVL-23: a building's own ground. */
export interface BuildingGround {
  /** Its level, in metres from the plan's datum. */
  readonly level: number
  readonly from: GroundFrom
}

/** Where the ground is, and which floors stand at it. */
export interface GroundLevel {
  /** The site's ground level: as stated, else 0. */
  readonly level: number
  readonly stated: boolean
  /** How far each floor's floor level stands above its ground, by floor id (negative below it). */
  readonly above: ReadonlyMap<string, number>
  /** The floors the way out is checked from: see `groundLevel`. Each building's own, in plan order. */
  readonly groundFloors: readonly Floor[]
  /** Whether a floor stands so high over the ground that a door to the outside opens in mid-air. */
  readonly aboveGround: (floor: string) => boolean
  /** LVL-23: the level of the ground under a floor: its building's own, else the site's. */
  readonly groundOf: (floor: string) => number
  /** LVL-23: the first ground floor of a floor's own building (of the floors no building names, for one in none), or undefined when it has none. */
  readonly groundFloorOf: (floor: string) => Floor | undefined
  /** LVL-23: each building's own ground, by building id; empty when the plan names no building. */
  readonly buildings: ReadonlyMap<string, BuildingGround>
}

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/** The building each floor is in and the buildings' pads (CNT-6, LVL-23), or none when the list cannot be read. */
function buildingsOf(plan: FloorPlan): { holder: ReadonlyMap<string, string>; pads: ReadonlyMap<string, number | null> } {
  if ((plan.buildings ?? []).length === 0) return { holder: new Map(), pads: new Map() }
  try {
    const read = planBuildings(plan)
    return { holder: new Map(read.flatMap((b) => b.floors.map((f) => [f, b.id] as const))), pads: new Map(read.map((b) => [b.id, b.pad] as const)) }
  } catch {
    return { holder: new Map(), pads: new Map() }
  }
}

/**
 * LVL-23: each building's own ground, by id: its pad when it states one; else the site's stated
 * ground; else the floor level of its ground floor, the lowest of its floors at or above level 0
 * (the lowest standing of those on that level), or 0 when it has none.
 */
export function buildingGrounds(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): Map<string, BuildingGround> {
  const { holder, pads } = buildingsOf(plan)
  const site = statedGround(plan)
  const floors = planFloors(plan)
  const out = new Map<string, BuildingGround>()
  for (const [id, pad] of pads) {
    if (pad !== null) {
      out.set(id, { level: pad, from: 'pad' })
      continue
    }
    if (site !== null) {
      out.set(id, { level: site, from: 'site' })
      continue
    }
    const own = floors.filter((f) => holder.get(f.id) === id && levelOf(f) >= 0)
    const lowest = Math.min(...own.map(levelOf))
    const at = own.filter((f) => levelOf(f) === lowest).map((f) => elevations.floors.get(f.id)?.floorLevel ?? 0)
    out.set(id, { level: at.length === 0 ? 0 : Math.min(...at), from: 'floor' })
  }
  return out
}

/**
 * The ground and the ground floor.
 *
 * A floor stands above the ground by its floor level less the ground's (LVL-23: its own building's
 * ground); past `outsideDoorAboveGround` it is off the ground, and its doors to the outside open in
 * mid-air. The ground floor is, of the floors not off the ground, for each building on its own and
 * for the floors no building names together:
 *
 * - with no ground stated (and for the floors no building names), the floors at level 0, or the
 *   only floor (as before LVL-4);
 * - with a ground stated, or for a building (its own ground), the floors whose floor level lies
 *   nearest the ground, every floor within `sameFloorLevel` of the nearest counted.
 */
export function groundLevel(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): GroundLevel {
  const floors = planFloors(plan)
  const stated = statedGround(plan)
  const level = stated ?? 0
  const { holder } = buildingsOf(plan)
  const buildings = holder.size === 0 ? new Map<string, BuildingGround>() : buildingGrounds(plan, elevations)
  const groundOf = (floor: string): number => {
    const building = holder.get(floor)
    return building === undefined ? level : (buildings.get(building)?.level ?? level)
  }
  const above = new Map(floors.map((f) => [f.id, (elevations.floors.get(f.id)?.floorLevel ?? 0) - groundOf(f.id)] as const))
  // CNT-6 (C23): a floor that states what lies below it says itself whether it is at the ground.
  const below = new Map(floors.map((f) => [f.id, f.below] as const))
  const aboveGround = (floor: string): boolean => {
    const stated = below.get(floor)
    if (stated !== undefined) return stated !== 'ground'
    return (above.get(floor) ?? 0) > limit('outsideDoorAboveGround')
  }
  const groups = new Map<string, Floor[]>()
  for (const f of floors) {
    const key = holder.get(f.id) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  const ground = new Set<string>()
  const firstOf = new Map<string, Floor>()
  for (const [key, group] of groups) {
    let found: Floor[]
    if (stated === null && key === '') {
      found = (group.length === 1 ? group : group.filter((f) => levelOf(f) === 0)).filter((f) => !aboveGround(f.id))
    } else {
      const onGround = group.filter((f) => !aboveGround(f.id))
      const nearest = Math.min(...onGround.map((f) => Math.abs(above.get(f.id)!)))
      found = onGround.filter((f) => Math.abs(above.get(f.id)!) - nearest <= tolerance('sameFloorLevel'))
    }
    for (const f of found) ground.add(f.id)
    if (found[0] !== undefined) firstOf.set(key, found[0])
  }
  const groundFloors = floors.filter((f) => ground.has(f.id))
  const groundFloorOf = (floor: string): Floor | undefined => firstOf.get(holder.get(floor) ?? '')
  return { level, stated: stated !== null, above, groundFloors, aboveGround, groundOf, groundFloorOf, buildings }
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
 * `openingBelowGround` under the ground the site states (LVL-23: or its building's pad), floor by
 * floor in plan order. None when the plan states no ground. An opening is in an outside wall when its wall is stated exterior, or
 * when the stretch of wall it is in has a room on one face only (MSG-13, `planWallSides`).
 */
export function openingsBelowGround(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): OpeningBelowGround[] {
  const site = statedGround(plan)
  // LVL-23: a building's pad is a ground stated for its own floors.
  const { holder, pads } = buildingsOf(plan)
  if (site === null && ![...pads.values()].some((pad) => pad !== null)) return []
  const found: OpeningBelowGround[] = []
  for (const floor of planFloors(plan)) {
    const base = elevations.floors.get(floor.id)?.floorLevel
    const building = holder.get(floor.id)
    const ground = (building === undefined ? null : (pads.get(building) ?? null)) ?? site
    if (base === undefined || ground === null) continue
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
