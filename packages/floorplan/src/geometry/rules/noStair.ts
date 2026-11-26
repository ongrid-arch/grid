/**
 * LVL-14: the floors above the ground that nothing joins to the building below: no room on them
 * is used as a stair or a lift, and the plan states no stair and no ramp that reaches them. Such a
 * floor cannot be reached, and its way out cannot be followed down; the check says so as a
 * finding (`no_stair`), and the write answer says it at once.
 *
 * Only in a plan that draws a ground floor: a flat drawn on its own up in a building has nothing
 * below it to be joined to. A floor of voids only holds no room to reach. A ramp counts as a join,
 * so a parking deck reached by its ramp is not said to have nothing.
 *
 * Pure: a plan in, plain data out.
 */

import type { FloorPlan } from '../plan'
import { floorOf, planFloors } from '../floors'
import { floorElevations } from '../elevations'
import { groundLevel } from '../ground'

/** A floor above the ground that nothing joins, and the ground floor a stair to it would rise from. */
export interface FloorWithNoStair {
  /** The floor's id. */
  readonly floor: string
  /** The ground floor's id: the first of the plan's ground floors (LVL-23: of its own building's). */
  readonly from: string
}

/** Every floor above the ground with no stair or lift room and no stated stair or ramp to it, in floor order. */
export function floorsWithNoStair(plan: FloorPlan): FloorWithNoStair[] {
  const site = groundLevel(plan, floorElevations(plan))
  if (site.groundFloors.length === 0) return []
  const joined = new Set([...(plan.stairs ?? []), ...(plan.ramps ?? [])].flatMap((way) => [way.from, way.to]))
  const rooms = new Set<string>()
  const shafts = new Set<string>()
  for (const room of plan.rooms) {
    const floor = floorOf(room)
    if (room.use === 'stair' || room.use === 'lift') shafts.add(floor)
    if (room.void !== true) rooms.add(floor)
  }
  // LVL-23: from its own building's ground floor; a building that draws none has nothing to join to.
  return planFloors(plan)
    .filter((floor) => site.aboveGround(floor.id) && rooms.has(floor.id) && !shafts.has(floor.id) && !joined.has(floor.id))
    .flatMap((floor) => {
      const from = site.groundFloorOf(floor.id)?.id
      return from === undefined ? [] : [{ floor: floor.id, from }]
    })
}
