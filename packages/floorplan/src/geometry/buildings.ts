/**
 * Buildings and context (CNT-6, C23; lab EL-17, AC-7): a plan that names several buildings, each a
 * group of its own floors, and shapes drawn round the plan for context that are in no measure.
 *
 * A building is a named group of floors, never a floor: it adds no floor and closes no outline.
 * Each building stacks its own floors (`floorElevations`), so a garden studio's floor does not
 * stand on the house's, and has its own areas (the sum of its floors', `areas.ts`) and its own
 * height. LVL-23: a building may state its `pad`, the level of its own ground; its floors stack
 * from it, and its ground floor, way out and height are read against its own ground (`ground.ts`). Everything that reads the buildings reads them here, so a fault in the list is read one
 * way: the first building with an id is the building, a floor two buildings name stays in the one
 * listed first, and an id that is no floor is named and left out (`buildingIssues`). Nothing is
 * refused.
 *
 * A context shape (a neighbour's house, the hall a stand stands in) is drawn on its floor and is
 * read by nothing else: no area, no check, no count, no export of the building.
 *
 * Pure: a plan in, ids and words out.
 */

import type { ContextShape, FloorPlan } from '../types/floorplan'
import { DEFAULT_FLOOR_ID } from '../types/floorplan'
import { isFloorSlice, planFloors, wholePlan } from './floors'
import type { Issue } from './validate'
import { english, name, said, type Said } from '../messages/say'
import { withSaid } from './issueWords'
import { likelyId } from '../types/nearest'

/** A building as Grid reads it: the floors of the plan it names, each once, in plan order. */
export interface PlanBuildingRead {
  readonly id: string
  /** Its name, else its id. */
  readonly name: string
  /** The floors that are its own, in the plan's floor order. */
  readonly floors: readonly string[]
  /** Ids it names that are no floor of the plan. */
  readonly unknown: readonly string[]
  /** Floors it names that a building listed before it holds, each with that building's id. */
  readonly elsewhere: readonly { readonly floor: string; readonly building: string }[]
  /** LVL-23: the level of its own ground, from the plan's datum, as stated; null when it states none. */
  readonly pad: number | null
}

/** The plan's buildings, the first with an id winning, in plan order. A slice is read as the plan it was cut from. */
export function planBuildings(plan: FloorPlan): PlanBuildingRead[] {
  const { whole } = wholePlan(plan)
  const listed = whole.buildings ?? []
  if (listed.length === 0) return []
  const floors = planFloors(whole)
  const order = new Map(floors.map((floor, i) => [floor.id, i] as const))
  const ids = new Set<string>()
  const holder = new Map<string, string>()
  const out: PlanBuildingRead[] = []
  for (const building of listed) {
    if (ids.has(building.id)) continue
    ids.add(building.id)
    const own: string[] = []
    const unknown: string[] = []
    const elsewhere: { floor: string; building: string }[] = []
    for (const id of new Set(building.floors)) {
      if (!order.has(id)) unknown.push(id)
      else if (holder.has(id)) elsewhere.push({ floor: id, building: holder.get(id)! })
      else {
        holder.set(id, building.id)
        own.push(id)
      }
    }
    out.push({
      id: building.id,
      name: building.name ?? building.id,
      floors: own.sort((a, b) => order.get(a)! - order.get(b)!),
      unknown,
      elsewhere,
      pad: building.pad !== undefined && Number.isFinite(building.pad) ? building.pad : null,
    })
  }
  return out
}

/** Each floor a building holds, by id: that building's id. */
export function buildingOfFloor(plan: FloorPlan): ReadonlyMap<string, string> {
  return new Map(planBuildings(plan).flatMap((building) => building.floors.map((floor) => [floor, building.id] as const)))
}

/** MSG-11: an issue says its sentence by key (`issue.plan/building-*`); its `message` is the English. */
const buildingIssue = (id: string, code: string, sentence: Said): Issue => withSaid({ entity: 'plan', id, code, message: english(sentence), severity: 'warning' }, sentence)

/**
 * What the drawing's check says about the buildings list (CNT-6): a building listed twice, a floor
 * it names that the plan does not have, and a floor two buildings name. Each is worth a look and
 * leaves out only what it names. Run on the whole plan only.
 */
export function buildingIssues(plan: FloorPlan): Issue[] {
  if (isFloorSlice(plan) || (plan.buildings ?? []).length === 0) return []
  const issues: Issue[] = []
  const seen = new Set<string>()
  for (const building of plan.buildings ?? []) {
    if (seen.has(building.id)) issues.push(buildingIssue(building.id, 'plan/building-duplicate-id', said('issue.plan/building-duplicate-id', { building: name(building.id) })))
    seen.add(building.id)
  }
  const floorIds = planFloors(plan).map((floor) => floor.id)
  for (const building of planBuildings(plan)) {
    for (const id of building.unknown) {
      const meant = likelyId(id, floorIds)
      const values = { building: name(building.name), floor: name(id) }
      issues.push(
        buildingIssue(building.id, 'plan/building-unknown-floor', meant === null ? said('issue.plan/building-unknown-floor', values) : said('issue.plan/building-unknown-floor.meant', { ...values, meant: name(meant) }))
      )
    }
    for (const { floor, building: first } of building.elsewhere) {
      issues.push(buildingIssue(building.id, 'plan/building-floor-in-two', said('issue.plan/building-floor-in-two', { building: name(building.name), floor: name(floor), first: name(first) })))
    }
  }
  return issues
}

/** The context shapes drawn on a floor (C5: an unstated floor is the ground floor), in plan order. */
export function contextOn(plan: FloorPlan, floor: string): ContextShape[] {
  const { whole } = wholePlan(plan)
  return (whole.context ?? []).filter((shape) => (shape.floor ?? DEFAULT_FLOOR_ID) === floor)
}
