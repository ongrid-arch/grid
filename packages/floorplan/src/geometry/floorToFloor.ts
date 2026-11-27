/**
 * Floor-to-floor heights (LVL-24): the distance from one floor's level to the next floor's over
 * it, read from where the floors stand, and the levels a floor-to-floor gives.
 *
 * The plan holds no floor-to-floor of its own: it is the difference of two floors' levels, which a
 * floor states as its `elevation` (C5, LVL-1) or the stacking rule works out (`floorElevations`).
 * So setting one writes elevations, and every reader (the 3D view, the IFC, sections, the
 * building's height) reads it with nothing new. A floor's `height` stays its clear height, floor to
 * ceiling, what a wall on it with no height of its own takes.
 *
 * Floors are read per building (CNT-6, LVL-23; the floors no building names together), each
 * building's levels in the order of `level`. Floors sharing a level share a place in the order.
 * The top level's floor-to-floor runs to the top of its roof slab (its level, its clear height and
 * `SLAB_THICKNESS`), so the building's height is its floors' floor-to-floor summed from its first.
 *
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import { floorElevations, SLAB_THICKNESS, type BuildingElevations } from './elevations'
import { groundFloor, planFloors } from './floors'
import { planBuildings } from './buildings'
import type { Floor, FloorPlan } from './plan'

/** One floor's place in its building's stack. */
export interface FloorLevel {
  readonly floor: string
  readonly name: string
  /** The building it is in, by id; null for a floor no building names. */
  readonly building: string | null
  /** Its order (`Floor.level`). */
  readonly level: number
  /** Where its floor slab's top stands, m from the plan's datum. */
  readonly floorLevel: number
  /** Whether the floor states its elevation; else the stacking rule placed it. */
  readonly placed: 'stated' | 'stacked'
  /** Its clear height, floor to ceiling, m: stated, or worked out from its walls. */
  readonly clearHeight: number
  readonly heightStated: boolean
  /** The slab over it, m: the next level's slab, or the roof's. */
  readonly slabOver: number
  /** To the next level's floor level, or to the top of its roof slab when none is over it. */
  readonly floorToFloor: number
  /** The floors of the next level up, by id; empty for the top level, whose floor-to-floor runs to its roof. */
  readonly over: readonly string[]
}

const finite = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v)
const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)
const slabOf = (floor: Floor): number => (finite(floor.slab) && floor.slab >= 0 ? floor.slab : SLAB_THICKNESS)
/** To the millimetre, so floor-to-floor summed over forty storeys stays the figure given. */
const mm = (v: number): number => Math.round(v * 1000) / 1000 + 0

function floorsOf(plan: FloorPlan): Floor[] {
  try {
    return planFloors(plan)
  } catch {
    return [groundFloor(plan)]
  }
}

/** The plan's floors in groups, one per building (the floors no building names under ''), each in plan order. */
export function floorGroups(plan: FloorPlan): Map<string, Floor[]> {
  const holder = new Map<string, string>()
  try {
    for (const b of planBuildings(plan)) for (const f of b.floors) holder.set(f, b.id)
  } catch {
    // A buildings list that cannot be read: every floor together, as `stackBuildings` reads it.
  }
  const groups = new Map<string, Floor[]>()
  for (const floor of floorsOf(plan)) {
    const key = holder.get(floor.id) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), floor])
  }
  return groups
}

/** A group's floors by level, lowest first. */
function byLevel(floors: readonly Floor[]): Floor[][] {
  const levels = new Map<number, Floor[]>()
  for (const f of floors) levels.set(levelOf(f), [...(levels.get(levelOf(f)) ?? []), f])
  return [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([, fs]) => fs)
}

/**
 * Every floor's level, clear height and floor-to-floor, by building (in the order the plan lists
 * them, the floors no building names first), each building's floors lowest level first.
 */
export function planLevels(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): FloorLevel[] {
  const out: FloorLevel[] = []
  for (const [building, floors] of floorGroups(plan)) {
    const levels = byLevel(floors)
    levels.forEach((here, i) => {
      const next = levels[i + 1]
      for (const floor of here) {
        const at = elevations.floors.get(floor.id)
        if (at === undefined) continue
        const nextLevel = next === undefined ? undefined : elevations.floors.get(next[0]!.id)?.floorLevel
        const slabOver = next === undefined ? SLAB_THICKNESS : slabOf(next[0]!)
        out.push({
          floor: floor.id,
          name: floor.name,
          building: building === '' ? null : building,
          level: levelOf(floor),
          floorLevel: mm(at.floorLevel),
          placed: finite(floor.elevation) ? 'stated' : 'stacked',
          clearHeight: mm(at.clearHeight),
          heightStated: finite(floor.height) && floor.height > 0,
          slabOver,
          floorToFloor: mm(nextLevel === undefined ? at.clearHeight + slabOver : nextLevel - at.floorLevel),
          over: next === undefined ? [] : next.map((f) => f.id),
        })
      }
    })
  }
  return out
}

/** What a floor-to-floor is set on: every floor, one building's, or the floors listed. */
export interface FloorToFloorRequest {
  /** Metres from each floor's level to the next one's over it. */
  readonly floorToFloor: number
  /** The floors it is set on, by id: every floor of the building (or of the plan) when left out. */
  readonly floors?: readonly string[]
  /** The building whose floors it is set on, by id; every building when left out. */
  readonly building?: string
  /** A clear height set on the same floors, m. */
  readonly clear?: number
}

/** What one floor is set to: its new elevation (when it moves or must be stated) and its clear height. */
export interface FloorSet {
  readonly floor: string
  readonly elevation?: number
  readonly height?: number
  /** How its height was come by: given, filled (floor-to-floor less the slab over it, where it stated none) or kept as stated. */
  readonly clear: 'given' | 'filled' | 'kept' | 'untouched'
}

/** Why a floor-to-floor cannot be set, with the figures. */
export type FloorToFloorProblem =
  | { readonly kind: 'no-room'; readonly floor: string; readonly slab: number }
  | { readonly kind: 'clear-too-tall'; readonly floor: string; readonly fits: number }

/**
 * The elevations and clear heights a floor-to-floor gives (`request`), per building: the lowest
 * level at or above 0 (else the highest below it) keeps where it stands, each level above it stands
 * its floor-to-floor over the one under it and each level below it its own floor-to-floor under the
 * one over it. The levels set take `request.floorToFloor`; the others keep the floor-to-floor they
 * have now, so a call for one floor moves the floors over it with it. Every floor that moves, and
 * every floor of a level set but the one that keeps its place, gets its elevation stated. A floor
 * set takes `request.clear` as its height when given; else one that states no height takes its
 * floor-to-floor less the slab over it, so its walls meet that slab; one that states a height keeps
 * it. Problems (a floor-to-floor no taller than the slab over it, a clear height that with that slab
 * runs past it) are returned instead, and nothing is set.
 */
export function levelsSetTo(plan: FloorPlan, request: FloorToFloorRequest): { readonly set: readonly FloorSet[]; readonly problems: readonly FloorToFloorProblem[] } {
  const elevations = floorElevations(plan)
  const read = new Map(planLevels(plan, elevations).map((l) => [l.floor, l] as const))
  const chosen = request.floors === undefined ? null : new Set(request.floors)
  const set: FloorSet[] = []
  const problems: FloorToFloorProblem[] = []
  for (const [building, floors] of floorGroups(plan)) {
    if (request.building !== undefined && building !== request.building) continue
    const levels = byLevel(floors).filter((fs) => fs.some((f) => read.has(f.id)))
    if (levels.length === 0) continue
    const hit = levels.map((fs) => chosen === null || fs.some((f) => chosen.has(f.id)))
    if (!hit.some(Boolean)) continue
    const ftf = levels.map((fs, i) => (hit[i] ? request.floorToFloor : read.get(fs[0]!.id)!.floorToFloor))
    for (let i = 0; i < levels.length; i++) {
      if (!hit[i]) continue
      const first = read.get(levels[i]![0]!.id)!
      if (ftf[i]! <= first.slabOver) problems.push({ kind: 'no-room', floor: first.floor, slab: first.slabOver })
      else if (request.clear !== undefined && request.clear + first.slabOver > ftf[i]! + 1e-9) problems.push({ kind: 'clear-too-tall', floor: first.floor, fits: mm(ftf[i]! - first.slabOver) })
    }
    const baseAt = levels.findIndex((fs) => levelOf(fs[0]!) >= 0)
    const base = baseAt < 0 ? levels.length - 1 : baseAt
    const at: number[] = levels.map((fs) => read.get(fs[0]!.id)!.floorLevel)
    for (let i = base + 1; i < levels.length; i++) at[i] = mm(at[i - 1]! + ftf[i - 1]!)
    for (let i = base - 1; i >= 0; i--) at[i] = mm(at[i + 1]! - ftf[i]!)
    levels.forEach((fs, i) => {
      for (const floor of fs) {
        const now = read.get(floor.id)
        if (now === undefined) continue
        const moves = Math.abs(now.floorLevel - at[i]!) > 1e-9
        const elevation = moves || (hit[i] && i !== base) ? at[i]! : undefined
        let height: number | undefined
        let clear: FloorSet['clear'] = 'untouched'
        if (hit[i]) {
          if (request.clear !== undefined) [height, clear] = [request.clear, 'given']
          else if (!now.heightStated) [height, clear] = [mm(ftf[i]! - now.slabOver), 'filled']
          else clear = 'kept'
        }
        if (elevation === undefined && height === undefined && clear === 'untouched') continue
        set.push({ floor: floor.id, ...(elevation === undefined ? {} : { elevation }), ...(height === undefined ? {} : { height }), clear })
      }
    })
  }
  return problems.length > 0 ? { set: [], problems } : { set, problems }
}
