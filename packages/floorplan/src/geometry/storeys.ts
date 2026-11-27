/**
 * BRF-4 (C17, lab FD-1): how many storeys the building has, and how high it stands over the
 * ground, from the floors that hold something: an outline they state (massing) or walls that
 * close one. Both are read before any wall exists.
 *
 * - A storey is a level (`Floor.level`, C5) with at least one such floor on it: two flats side
 *   by side on one level are one storey. The storeys at or above the ground floor are counted
 *   apart from those below it, as BRF-3's footprint takes them (`footprintFloors`).
 * - ARE-76: storeys are counted per building (CNT-6; the floors no building names together). A
 *   level whose floor level stands inside the clear height of a lower storey of its building (a
 *   half level, or a mezzanine) is a split level of that storey, never a storey of its own: by
 *   where the floors stand, whatever numbers their levels. The plan's count is the most of any one
 *   building's, so a terrace of two-storey houses has two storeys.
 * - The height is from the ground (`site.ground`, else the ground floor's floor level; LVL-23: a
 *   building's own ground, its pad first; ARE-76: else the ground under it, see `buildingHeight`) to the top of the highest roof: a floor's level, its clear height and the roof slab over it, or the
 *   ridge its sloped roof states, and the parapet it states. A roof stated by its pitch alone is
 *   taken at the floor's clear height, the tallest of its walls as the roof cuts them.
 *
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import { floorElevations, SLAB_THICKNESS, type BuildingElevations } from './elevations'
import { planFloors } from './floors'
import { groundLevel, type GroundFrom, type GroundLevel } from './ground'
import { outlineKnown, slabOutline } from './outline'
import type { FloorPlan } from './plan'
import { indexPlan } from './plan'
import { footprintFloors } from './site'
import { planBuildings } from './buildings'
import { validatePlan } from './validate'
import { floorGroups, sharesFootprint, type FloorFootprint } from './floorToFloor'
import { tolerance } from './tolerances'

/** One storey: a level with floors that hold something, and the split levels within its height. */
export interface Storey {
  readonly level: number
  /** Its floors, by id, in plan order: its own level's, then its split levels'. */
  readonly floors: readonly string[]
  /** Under the ground floor: a basement. */
  readonly below: boolean
  /** ARE-76: the building it is in, by id; null for the floors no building names. */
  readonly building: string | null
  /** ARE-76: its floors on split levels, standing inside its height: half levels and mezzanines. */
  readonly split: readonly string[]
  /** ARE-76: where its own level's floor stands, m from the plan's datum. */
  readonly floorLevel: number
  /** ARE-76: to the floor level of the next storey of its building over its footprint, m; null when none is. */
  readonly floorToFloor: number | null
}

export interface PlanStoreys {
  /** Storeys at or above the ground floor; ARE-76: of the building with the most. */
  readonly above: number
  /** Storeys under it; ARE-76: of the building with the most. */
  readonly below: number
  readonly storeys: readonly Storey[]
  /** Floors that hold nothing yet, no outline and no walls that close one: in no storey. */
  readonly empty: readonly string[]
  /** Floors whose outline could not be worked out, with why: in no storey. */
  readonly unknown: readonly { readonly floor: string; readonly reason: string }[]
}

export interface BuildingHeight {
  /** From the ground to the top of the highest roof, m. */
  readonly height: number
  /** The floor whose roof is highest. */
  readonly floor: string
  /** The ground's level, from the ground floor's floor level: stated, or 0. LVL-23: a building's own ground. */
  readonly ground: number
  /** Whether the site states its ground. */
  readonly groundStated: boolean
  /** LVL-23: what the height is measured from: a building's pad, the site's stated ground, or the ground floor's floor level. ARE-76: or the ground under the building. */
  readonly from: HeightFrom
}

/** ARE-76: what a height is measured from: LVL-23's grounds, or `under`, the ground under the building's own floors. */
export type HeightFrom = GroundFrom | 'under'

export interface StoreyOptions {
  readonly broken?: ReadonlySet<string>
}

/** A level of one building's floors that hold something, as the storeys are read from it. */
interface LevelRow {
  readonly level: number
  readonly floors: string[]
  readonly below: boolean
  readonly floorLevel: number
  readonly clearHeight: number
}

/** The storeys of the building: the levels whose floors hold something, per building (ARE-76). */
export function planStoreys(plan: FloorPlan, options: StoreyOptions = {}): PlanStoreys {
  const broken = options.broken ?? validatePlan(plan, indexPlan(plan), { spaces: false }).broken
  const upper = new Set(footprintFloors(plan))
  const elevations = floorElevations(plan)
  const outlines = new Map<string, FloorFootprint>()
  const empty: string[] = []
  const unknown: { floor: string; reason: string }[] = []
  for (const floor of planFloors(plan)) {
    const outline = slabOutline(plan, floor.id, broken)
    if (!outlineKnown(outline)) {
      unknown.push({ floor: floor.id, reason: outline.reason })
      continue
    }
    if (outline.pieces.length === 0) {
      empty.push(floor.id)
      continue
    }
    outlines.set(floor.id, outline)
  }
  const same = tolerance('sameFloorLevel')
  const storeys: Storey[] = []
  let above = 0
  let below = 0
  for (const [building, floors] of floorGroups(plan)) {
    const byLevel = new Map<number, LevelRow>()
    for (const floor of floors) {
      if (!outlines.has(floor.id)) continue
      const level = Number.isFinite(floor.level) ? floor.level : 0
      const at = elevations.floors.get(floor.id)
      const row = byLevel.get(level) ?? { level, floors: [], below: !upper.has(floor.id), floorLevel: Infinity, clearHeight: 0 }
      row.floors.push(floor.id)
      byLevel.set(level, { ...row, floorLevel: Math.min(row.floorLevel, at?.floorLevel ?? 0), clearHeight: Math.max(row.clearHeight, at?.clearHeight ?? 0) })
    }
    // Lowest level first; a level inside the height of the storey under it is a split level of it.
    const whole: { row: LevelRow; floors: string[]; split: string[] }[] = []
    for (const row of [...byLevel.values()].sort((a, b) => a.level - b.level)) {
      const host = whole.at(-1)
      const rise = host === undefined ? 0 : row.floorLevel - host.row.floorLevel
      if (host !== undefined && host.row.below === row.below && rise > same && rise < host.row.clearHeight - same) {
        host.floors.push(...row.floors)
        host.split.push(...row.floors)
      } else whole.push({ row, floors: [...row.floors], split: [] })
    }
    const sharing = (a: readonly string[], b: readonly string[]): boolean => a.some((f) => b.some((g) => sharesFootprint(outlines.get(f) ?? null, outlines.get(g) ?? null)))
    whole.forEach((storey, i) => {
      const next = whole.slice(i + 1).find((up) => sharing(storey.floors, up.floors))
      storeys.push({
        level: storey.row.level,
        floors: storey.floors,
        below: storey.row.below,
        building: building === '' ? null : building,
        split: storey.split,
        floorLevel: storey.row.floorLevel,
        floorToFloor: next === undefined ? null : next.row.floorLevel - storey.row.floorLevel,
      })
    })
    above = Math.max(above, whole.filter((s) => !s.row.below).length)
    below = Math.max(below, whole.filter((s) => s.row.below).length)
  }
  return { above, below, storeys, empty, unknown }
}

/**
 * ARE-76: the ground each building's height is measured from, by id: its own (LVL-23,
 * `buildingGrounds`), but for a building on the site's ground. On a slope that is the lowest
 * ground under its own floors' walls. On one stated level it lies under the lowest of those
 * buildings' ground floors (each its lowest floor at or above level 0), and a building whose
 * ground floor stands higher stands on ground as much higher, as a row of houses up a street
 * does; a building that stands otherwise states its `pad`. Either way it is `under`, unless it is
 * the site's ground as stated.
 */
function heightGrounds(plan: FloorPlan, elevations: BuildingElevations, ground: GroundLevel): Map<string, { readonly level: number; readonly from: HeightFrom }> {
  const out = new Map<string, { level: number; from: HeightFrom }>(ground.buildings)
  const onSite = [...ground.buildings].filter(([, g]) => g.from === 'site').map(([id]) => id)
  if (onSite.length === 0) return out
  const groups = floorGroups(plan)
  const same = tolerance('sameFloorLevel')
  if (ground.surface !== null) {
    for (const id of onSite) {
      const lows = (groups.get(id) ?? []).map((f) => ground.under.get(f.id)?.low).filter((v): v is number => v !== undefined)
      if (lows.length > 0) out.set(id, { level: Math.min(...lows), from: 'under' })
    }
    return out
  }
  const groundFloorLevel = (id: string): number | null => {
    const own = (groups.get(id) ?? []).filter((f) => (Number.isFinite(f.level) ? f.level : 0) >= 0)
    if (own.length === 0) return null
    const lowest = Math.min(...own.map((f) => (Number.isFinite(f.level) ? f.level : 0)))
    const at = own.filter((f) => (Number.isFinite(f.level) ? f.level : 0) === lowest).map((f) => elevations.floors.get(f.id)?.floorLevel).filter((v): v is number => v !== undefined && Number.isFinite(v))
    return at.length === 0 ? null : Math.min(...at)
  }
  const levels = new Map(onSite.map((id) => [id, groundFloorLevel(id)] as const))
  const known = [...levels.values()].filter((v): v is number => v !== null)
  if (known.length === 0) return out
  const lowest = Math.min(...known)
  for (const [id, at] of levels) {
    if (at === null || !(at - lowest > same)) continue
    out.set(id, { level: ground.level + (at - lowest), from: 'under' })
  }
  return out
}

/**
 * How high the building stands over the ground: to the top of the highest roof of a floor at or
 * above the ground floor that holds something. Null when no such floor holds anything.
 */
export function buildingHeight(plan: FloorPlan, storeys: PlanStoreys = planStoreys(plan), only?: ReadonlySet<string>, building?: string): BuildingHeight | null {
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations)
  // LVL-23: a building of the plan is measured from its own ground; ARE-76: the ground under it.
  const own = building === undefined ? undefined : heightGrounds(plan, elevations, ground).get(building)
  return heightFrom(plan, storeys, only, own, elevations, ground)
}

/** The height of the floors `only` (every floor when left out) from `own` ground, else the site's. */
function heightFrom(plan: FloorPlan, storeys: PlanStoreys, only: ReadonlySet<string> | undefined, own: { readonly level: number; readonly from: HeightFrom } | undefined, elevations: BuildingElevations, ground: GroundLevel): BuildingHeight | null {
  const base: { level: number; from: HeightFrom } = own ?? { level: ground.level, from: ground.stated ? 'site' : 'floor' }
  const floors = new Map(planFloors(plan).map((floor) => [floor.id, floor] as const))
  let best: { top: number; floor: string } | null = null
  for (const storey of storeys.storeys) {
    if (storey.below) continue
    for (const id of storey.floors) {
      if (only !== undefined && !only.has(id)) continue
      const at = elevations.floors.get(id)
      const floor = floors.get(id)
      if (at === undefined || floor === undefined) continue
      const ridge = floor.roof !== undefined && floor.roof.shape !== 'flat' && floor.roof.ridge !== undefined ? floor.roof.ridge : null
      const top = at.floorLevel + Math.max(at.clearHeight, ridge ?? 0) + SLAB_THICKNESS + (floor.parapet ?? 0)
      if (best === null || top > best.top) best = { top, floor: id }
    }
  }
  if (best === null) return null
  return { height: best.top - base.level, floor: best.floor, ground: base.level, groundStated: ground.stated, from: base.from }
}

/** LVL-23: a building's own storeys: the levels of its own floors that hold something, above its ground floor and below it. */
export interface BuildingStoreys {
  readonly above: number
  readonly below: number
  /** ARE-76: its split levels, the levels inside the height of one of its storeys. */
  readonly split: number
}

/**
 * CNT-6 (C23): how high each building the plan names stands over the ground, from its own floors
 * (`buildingHeight`), by id, in plan order. Null for a building none of whose floors holds anything.
 * LVL-23: measured from its own ground, with its own storeys. ARE-76: its split levels counted.
 */
export function buildingHeights(plan: FloorPlan, storeys: PlanStoreys = planStoreys(plan)): { readonly id: string; readonly name: string; readonly height: BuildingHeight | null; readonly storeys: BuildingStoreys }[] {
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations)
  const grounds = heightGrounds(plan, elevations, ground)
  return planBuildings(plan).map((building) => {
    const own = new Set(building.floors)
    const mine = storeys.storeys.filter((s) => s.building === building.id)
    return {
      id: building.id,
      name: building.name,
      height: heightFrom(plan, storeys, own, grounds.get(building.id), elevations, ground),
      storeys: { above: mine.filter((s) => !s.below).length, below: mine.filter((s) => s.below).length, split: splitLevels(plan, mine) },
    }
  })
}

/** ARE-76: how many levels of split floors the storeys hold. */
function splitLevels(plan: FloorPlan, storeys: readonly Storey[]): number {
  const levels = new Map(planFloors(plan).map((f) => [f.id, Number.isFinite(f.level) ? f.level : 0] as const))
  return storeys.reduce((sum, s) => sum + new Set(s.split.map((f) => levels.get(f) ?? 0)).size, 0)
}
