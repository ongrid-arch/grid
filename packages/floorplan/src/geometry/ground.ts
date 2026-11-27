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
 *
 * CNT-49: on a slope (`groundSurface`: ground per side, a fall, levels along the plot's edges) the
 * ground is read where it is wanted: a floor's ground runs from the lowest to the highest ground
 * under its walls, and it stands above the ground by how far its floor level is past that range
 * (0 within it), so a walk-out floor is on the ground and in the footprint and the storeys; an
 * opening is below the ground by the ground at its own place on its wall; and `aboveAt` says how
 * far a floor stands over the ground at a point, for a door out of it. `level` is then the lowest
 * ground under the building, which a height is measured from.
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
import { groundSurface, type GroundSurface } from './groundSurface'
import type { Vec2 } from './vec2'
import { wallPointAt } from './wall'

/** The site's stated ground level, or null when the plan states none. CNT-49: on a slope, the lowest ground under the building. */
export function statedGround(plan: FloorPlan, surface: GroundSurface | null = groundSurface(plan)): number | null {
  if (surface !== null) return surface.low
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
  /** CNT-49: the ground on a slope the site states, or null for one level (or none). */
  readonly surface: GroundSurface | null
  /** CNT-49: the lowest and the highest ground under each floor's walls, by floor id: one level off a slope. */
  readonly under: ReadonlyMap<string, { readonly low: number; readonly high: number }>
  /** CNT-49: the ground at a point of a floor: its building's pad, else the site's slope there, else its one level. */
  readonly groundAt: (floor: string, p: Vec2) => number
  /** CNT-49: how far a floor's floor level stands over the ground at a point (negative below it). */
  readonly aboveAt: (floor: string, p: Vec2) => number
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
export function buildingGrounds(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan), surface: GroundSurface | null = groundSurface(plan)): Map<string, BuildingGround> {
  const { holder, pads } = buildingsOf(plan)
  const site = statedGround(plan, surface)
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
  const surface = groundSurface(plan)
  const stated = statedGround(plan, surface)
  const level = stated ?? 0
  const { holder } = buildingsOf(plan)
  const buildings = holder.size === 0 ? new Map<string, BuildingGround>() : buildingGrounds(plan, elevations, surface)
  // CNT-49: a floor reads the slope unless its building stands on a pad of its own.
  const onSlope = (floor: string): boolean => {
    if (surface === null) return false
    const building = holder.get(floor)
    return building === undefined || buildings.get(building)?.from !== 'pad'
  }
  const under = new Map<string, { low: number; high: number }>()
  for (const f of floors) {
    if (!onSlope(f.id)) continue
    const points = floorPoints(plan, f)
    const levels = points.length === 0 ? [surface!.low, surface!.high] : points.map(surface!.at)
    under.set(f.id, { low: Math.min(...levels), high: Math.max(...levels) })
  }
  const groundOf = (floor: string): number => {
    const range = under.get(floor)
    if (range !== undefined) return range.low
    const building = holder.get(floor)
    return building === undefined ? level : (buildings.get(building)?.level ?? level)
  }
  const floorLevelOf = (floor: string): number => elevations.floors.get(floor)?.floorLevel ?? 0
  const above = new Map(
    floors.map((f) => {
      const at = floorLevelOf(f.id)
      const range = under.get(f.id)
      // CNT-49: within the range of the ground under it, a floor is at the ground.
      if (range !== undefined) return [f.id, at > range.high ? at - range.high : at < range.low ? at - range.low : 0] as const
      return [f.id, at - groundOf(f.id)] as const
    })
  )
  const groundAt = (floor: string, p: Vec2): number => (onSlope(floor) ? surface!.at(p) : groundOf(floor))
  const aboveAt = (floor: string, p: Vec2): number => floorLevelOf(floor) - groundAt(floor, p)
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
  return { level, stated: stated !== null, above, groundFloors, aboveGround, groundOf, groundFloorOf, buildings, surface, under, groundAt, aboveAt }
}

/** CNT-49: the points a floor's ground is read at: its walls' ends, else its outline's corners. */
function floorPoints(plan: FloorPlan, floor: Floor): Vec2[] {
  const points: Vec2[] = []
  for (const w of plan.walls) {
    if (floorOf(w) !== floor.id || w.virtual === true) continue
    for (const p of [w.start, w.end]) if (Number.isFinite(p[0]) && Number.isFinite(p[1])) points.push({ x: p[0], y: p[1] })
  }
  if (points.length === 0) for (const p of floor.outline ?? []) points.push({ x: p[0], y: p[1] })
  return points
}

/** CNT-49: where an opening is on the plan: the middle of its width on its wall's axis, or null. */
export function openingPoint(plan: FloorPlan, opening: Opening): Vec2 | null {
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (wall === undefined) return null
  try {
    const along = Math.min(Math.max(0, opening.offset + opening.width / 2), wallLength(wall))
    const p = wallPointAt(wall, along)
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
  } catch {
    return null
  }
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
  const surface = groundSurface(plan)
  const site = statedGround(plan, surface)
  // LVL-23: a building's pad is a ground stated for its own floors.
  const { holder, pads } = buildingsOf(plan)
  if (site === null && ![...pads.values()].some((pad) => pad !== null)) return []
  const found: OpeningBelowGround[] = []
  for (const floor of planFloors(plan)) {
    const base = elevations.floors.get(floor.id)?.floorLevel
    const building = holder.get(floor.id)
    const pad = building === undefined ? null : (pads.get(building) ?? null)
    const flat = pad ?? site
    if (base === undefined || flat === null) continue
    const slice = planForFloor(plan, floor.id)
    const broken = brokenOnFloor(slice)
    const index = indexPlan(slice)
    let sides: ReturnType<typeof planWallSides> | null = null
    for (const opening of slice.openings) {
      if (broken.has(opening.id) || broken.has(opening.wall)) continue
      // CNT-49: on a slope, the ground at the opening's own place on its wall.
      const point = pad === null && surface !== null ? openingPoint(slice, opening) : null
      const ground = point === null ? flat : surface!.at(point)
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
