/**
 * Storey elevations: where each floor stands. A floor may state its elevation, its clear height
 * and the slab it stands on (LVL-1, C5 reopened); what it leaves out is derived, as before: its
 * height from its tallest drawn wall, its elevation from the floors below it (`level` orders
 * them). The 3D view and the IFC export both stack storeys through this one rule, so a storey
 * stands at the same height in both.
 */

import { DEFAULT_FLOOR, planFloors, storeySlice } from './floors'
import type { Floor, FloorPlan, Wall } from './plan'
import { indexPlan } from './plan'
import { validatePlan } from './validate'
import { wallPeak } from './roofs'
import { buildingOfFloor } from './buildings'
import { outdoorOnlyWalls } from './outdoor'
import { tolerancesAsStated } from './tolerances'

/** What a storey with no drawn wall counts as: the plan's default wall height. */
export const DEFAULT_STOREY_HEIGHT = 2.7

/** Where one level stands. */
export interface StoreyLevel {
  /** The top of its floor slab, where its walls and rooms stand. */
  readonly floorLevel: number
  /** Its stated height, else the height of its tallest drawn wall, else the default. */
  readonly clearHeight: number
}

/** One floor to stack: what it states, and the tallest wall it draws. */
export interface FloorToStack {
  readonly floor: Floor
  /** The tallest drawn wall: 0, negative or non-finite when it draws none. */
  readonly tallest: number
}

const stated = (value: number | undefined, positive: boolean): number | undefined =>
  value !== undefined && Number.isFinite(value) && (positive ? value > 0 : value >= 0) ? value : undefined

/** A floor's stated elevation, which may lie below 0. */
const elevationOf = (floor: Floor): number | undefined =>
  floor.elevation !== undefined && Number.isFinite(floor.elevation) ? floor.elevation : undefined

/**
 * Stacks floors, by `id`, with `slab` metres of floor slab where a floor states none.
 *
 * A floor's clear height is its stated `height`, else the tallest wall drawn on its level (floors
 * sharing a level share it), else `DEFAULT_STOREY_HEIGHT`. A floor that states its `elevation`
 * stands there. One that does not is placed by the order of `level`: the lowest level at or
 * above 0 stands at 0, with its slab below it; each higher level stands on its own slab, laid on
 * the highest storey top of the levels below it (its level plus its clear height). Levels below 0 hang downward, each one's walls
 * ending under the slab of the level above it. Gaps in the numbering are ignored: levels are an
 * order, not positions. With nothing stated this is the rule Grid had before LVL-1.
 */
export function stackFloors(entries: readonly FloorToStack[], slab: number): Map<string, StoreyLevel> {
  const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)
  const slabOf = (floor: Floor): number => stated(floor.slab, false) ?? slab

  const groups = new Map<number, FloorToStack[]>()
  for (const entry of entries) {
    const level = levelOf(entry.floor)
    groups.set(level, [...(groups.get(level) ?? []), entry])
  }
  const clearOf = (entry: FloorToStack, group: readonly FloorToStack[]): number => {
    const own = stated(entry.floor.height, true)
    if (own !== undefined) return own
    let tallest = 0
    for (const other of group) if (Number.isFinite(other.tallest) && other.tallest > tallest) tallest = other.tallest
    return tallest > 0 ? tallest : DEFAULT_STOREY_HEIGHT
  }

  const all = [...groups.keys()]
  const above = all.filter((level) => level >= 0).sort((a, b) => a - b)
  const below = all.filter((level) => level < 0).sort((a, b) => b - a)
  const stacked = new Map<string, StoreyLevel>()

  // Upward: the first level stands at 0; each next one on the highest storey top so far.
  let top: number | null = null
  let ceiling: number | null = null
  for (const level of above) {
    const group = groups.get(level)!
    const tops: number[] = []
    const undersides: number[] = []
    for (const entry of group) {
      const clearHeight = clearOf(entry, group)
      const floorLevel = elevationOf(entry.floor) ?? (top === null ? 0 : top + slabOf(entry.floor))
      stacked.set(entry.floor.id, { floorLevel, clearHeight })
      tops.push(floorLevel + clearHeight)
      undersides.push(floorLevel - slabOf(entry.floor))
    }
    top = Math.max(top ?? -Infinity, ...tops)
    if (ceiling === null) ceiling = Math.min(...undersides)
  }

  // Downward: each level's walls end under the slab of the level above it.
  ceiling ??= -slab
  for (const level of below) {
    const group = groups.get(level)!
    const undersides: number[] = []
    for (const entry of group) {
      const clearHeight = clearOf(entry, group)
      const floorLevel = elevationOf(entry.floor) ?? ceiling - clearHeight
      stacked.set(entry.floor.id, { floorLevel, clearHeight })
      undersides.push(floorLevel - slabOf(entry.floor))
    }
    ceiling = Math.min(...undersides)
  }

  return stacked
}

/**
 * Stacks levels from the tallest drawn wall on each (0, negative or non-finite when it has
 * none), with `slab` metres of floor slab between storeys: `stackFloors` for floors that state
 * nothing, one per level.
 */
export function stackLevels(
  tallestByLevel: ReadonlyMap<number, number>,
  slab: number
): Map<number, StoreyLevel> {
  const entries = [...tallestByLevel].map(([level, tallest]) => ({
    floor: { id: String(level), name: String(level), level },
    tallest
  }))
  const stacked = stackFloors(entries, slab)
  return new Map([...tallestByLevel.keys()].map((level) => [level, stacked.get(String(level))!]))
}

/**
 * The thickness of every floor slab and of the roof. The plan has no field for
 * it yet; an optional one would override this without changing the rule.
 */
export const SLAB_THICKNESS = 0.25

const isFinitePoint = (p: readonly [number, number]): boolean =>
  Number.isFinite(p[0]) && Number.isFinite(p[1])

/** Every number a wall's shape depends on is a number. */
export const isFiniteWall = (wall: Wall): boolean =>
  isFinitePoint(wall.start) &&
  isFinitePoint(wall.end) &&
  Number.isFinite(wall.thickness) &&
  Number.isFinite(wall.height) &&
  (wall.arc === undefined || (isFinitePoint(wall.arc.centre) && Number.isFinite(wall.arc.sweep)))

/**
 * Whether the views draw a wall, so it counts toward its storey's height: not
 * virtual, not reported `broken` by validation, and every number finite.
 * Validation judges shape, not whether a number is a number (a NaN passes every
 * comparison), so finiteness is checked here too.
 */
export function isDrawnWall(wall: Wall, broken: ReadonlySet<string>): boolean {
  return !wall.virtual && !broken.has(wall.id) && isFiniteWall(wall)
}

/** The whole building's storeys, as the 3D view and the IFC export stack them. */
export interface BuildingElevations {
  /** Every floor `planFloors` gives. Floors sharing a level and stating nothing share a value. */
  readonly floors: ReadonlyMap<string, StoreyLevel>
  /** The roof slab, lying on the highest storey top (LVL-1), whichever floor that is on. */
  readonly roof: { readonly bottom: number; readonly top: number }
}

/** The tallest wall a floor draws, as its roof cuts it (LVL-6), or 0 when it draws none or cannot be analysed. */
function tallestDrawnWall(plan: FloorPlan, floor: Floor): number {
  try {
    // LVL-5: a wall through floors counts toward the floor it rises through, with its own height.
    const slice = storeySlice(plan, floor.id)
    const index = indexPlan(slice)
    const broken = new Set(validatePlan(slice, index, { spaces: false }).broken)
    // CNT-7 (C26): a fence or a parapet round outdoor space is no part of the building's storey.
    const open = outdoorOnlyWalls(index)
    let tallest = 0
    for (const wall of slice.walls) {
      // LVL-6: a wall the floor's roof cuts is as tall as the roof leaves it.
      if (isDrawnWall(wall, broken) && !open.has(wall.id)) tallest = Math.max(tallest, wallPeak(slice, wall))
    }
    return tallest
  } catch {
    return 0
  }
}

function floorsOf(plan: FloorPlan): Floor[] {
  try {
    return planFloors(plan)
  } catch {
    return [DEFAULT_FLOOR]
  }
}

/**
 * Each floor's level and clear height, plus the roof, with `SLAB_THICKNESS` slabs where a floor
 * states none. The roof lies on the highest storey top of the building, whichever floor that is
 * on, so a loft stated low inside a taller storey does not pull the roof down with it. Total:
 * whatever the plan contains, it never throws, and a floor that cannot be analysed counts as
 * one with no walls.
 */
export function floorElevations(plan: FloorPlan): BuildingElevations {
  // CNT-25: worked out once per plan, since every floor's drawing, 3D shell and stairs ask the
  // whole plan's levels, and working them out validates every floor. A plan is never changed in
  // place once read; nothing is kept while `withTolerances` is in force. Each caller gets its own map.
  const stated = tolerancesAsStated()
  let found = stated ? elevationsOf.get(plan) : undefined
  if (found === undefined) {
    found = workOutElevations(plan)
    if (stated) elevationsOf.set(plan, found)
  }
  return { floors: new Map(found.floors), roof: found.roof }
}

/** Each plan's levels, as `floorElevations` works them out (CNT-25). */
const elevationsOf = new WeakMap<FloorPlan, BuildingElevations>()

function workOutElevations(plan: FloorPlan): BuildingElevations {
  const floors = floorsOf(plan)
  const entries = floors.map((floor) => ({ floor, tallest: tallestDrawnWall(plan, floor) }))
  // CNT-6 (C23): each building the plan names stacks its own floors; the floors no building names
  // are stacked together, as every floor was before.
  const building = buildingOfFloorSafe(plan)
  const groups = new Map<string, FloorToStack[]>()
  for (const entry of entries) {
    const key = building.get(entry.floor.id) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  const byFloor = new Map<string, StoreyLevel>()
  for (const group of groups.values()) for (const [id, level] of stackFloors(group, SLAB_THICKNESS)) byFloor.set(id, level)
  return { floors: byFloor, roof: roofOver(byFloor) }
}

/** The building each floor is in (CNT-6), or none when the list cannot be read. */
function buildingOfFloorSafe(plan: FloorPlan): ReadonlyMap<string, string> {
  if ((plan.buildings ?? []).length === 0) return new Map()
  try {
    return buildingOfFloor(plan)
  } catch {
    return new Map()
  }
}

/** The roof slab over the highest storey top of the stack, or over one default storey when there is none. */
export function roofOver(storeys: ReadonlyMap<string, StoreyLevel>): BuildingElevations['roof'] {
  let bottom = -Infinity
  for (const storey of storeys.values()) bottom = Math.max(bottom, storey.floorLevel + storey.clearHeight)
  if (!Number.isFinite(bottom)) bottom = DEFAULT_STOREY_HEIGHT
  return { bottom, top: bottom + SLAB_THICKNESS }
}
