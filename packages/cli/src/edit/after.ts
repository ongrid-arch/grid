/**
 * The plan as it will be once a change is written (WRT-11): the plan Grid reads after the patch
 * (`readingAfter`), with the boundaries of a plan written rooms first kept as the file will keep
 * them (`keptDerived`), so a room the change did not touch is not read as changed by hand and
 * left with no area. Every figure an answer gives about "the plan now" is measured on this.
 *
 * Pure: a plan and a patch in, a plan out.
 */
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { keptDerived } from '@ongrid/floorplan/rooms'
import { planAreas } from '../quantities/areas'
import type { Survey } from '../quantities/survey'
import { readingAfter, type Patch } from './edits'

export function planAfter(plan: FloorPlan, patch: Patch): FloorPlan {
  return keptDerived(plan.rooms, readingAfter(plan, patch) as unknown as Record<string, unknown>) as unknown as FloorPlan
}

/**
 * Each room's net area as `grid_areas` gives it, by room id: columns taken off, the same on the
 * plan before and the plan after. A room Grid cannot draw has none.
 */
export function roomNets(survey: Survey): Map<string, number | null> {
  const out = new Map<string, number | null>()
  for (const floor of planAreas(survey).floors) for (const room of floor.rooms) out.set(room.id, room.net)
  return out
}
