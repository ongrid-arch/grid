/**
 * How much each room's net area changed, and why.
 *
 * Areas come from the core's own room outline (C3: inner faces), never from a
 * second routine. An area is derived data, so a difference only counts when
 * something it is derived from changed too: a wall on the room's boundary,
 * or the room itself. Without that, noise under the length tolerance on a
 * big room could add up to more than the area tolerance and report a change
 * nobody made.
 */

import type { FloorPlan, PlanIndex, Room } from '../plan'
import { roomWallIds } from '../plan'
import { floorOf } from '../floors'
import { roomFloorArea, roomNesting, tryRoomPolygon } from '../room'
import { english, name, said } from '../../messages/say'
import { matchById } from './match'
import type { AreaDelta, DiffIssue, PlanChange } from './types'

/** As Grid measures the room (`roomArea`): less the floor of any room marked `inside` in it. */
function netArea(room: Room | undefined, index: PlanIndex): number | null {
  if (room === undefined) return null
  const polygon = tryRoomPolygon(room, index)
  return polygon === null ? null : roomFloorArea(room, index, polygon)
}

/** The rooms that sit right inside a room (ARE-5), in either version. */
function innerRooms(id: string, baseIndex: PlanIndex, headIndex: PlanIndex): string[] {
  return [...new Set([baseIndex, headIndex].flatMap((index) => roomNesting(index).hosts.get(id)?.rooms ?? []))]
}

export interface RoomAreas {
  readonly areas: AreaDelta[]
  readonly issues: DiffIssue[]
}

export function roomAreas(
  base: FloorPlan,
  head: FloorPlan,
  baseIndex: PlanIndex,
  headIndex: PlanIndex,
  wallChanges: ReadonlyMap<string, PlanChange>,
  roomChanges: ReadonlyMap<string, PlanChange>,
  areaEpsilon: number
): RoomAreas {
  const areas: AreaDelta[] = []
  const issues: DiffIssue[] = []

  const rooms = matchById(base.rooms, head.rooms)

  const delta = (earlier: Room | undefined, later: Room | undefined): void => {
    const room = (later ?? earlier)!
    const before = netArea(earlier, baseIndex)
    const after = netArea(later, headIndex)
    if (before === null && after === null) return

    // Its walls, round its outline and its holes (ARE-6).
    const boundary = new Set([...(earlier ? roomWallIds(earlier) : []), ...(later ? roomWallIds(later) : [])])
    // A room with rooms inside it also follows from them: their own changes, and their walls'.
    const inner = innerRooms(room.id, baseIndex, headIndex)
    for (const id of inner) {
      for (const index of [baseIndex, headIndex]) {
        for (const r of index.plan.rooms) if (r.id === id) r.boundary.forEach((wall) => boundary.add(wall))
      }
    }
    const causes = [
      ...[...boundary].map((id) => wallChanges.get(id)),
      ...inner.map((id) => roomChanges.get(id))
    ].filter((c): c is PlanChange => c !== undefined)
    const dependsOn = [...new Set(causes.map((c) => c.id))].sort()

    // A room in both versions is only reported if something it comes from changed.
    if (earlier !== undefined && later !== undefined) {
      const closedBothTimes = before !== null && after !== null
      if (closedBothTimes) {
        const derivedFromChange = dependsOn.length > 0 || roomChanges.has(room.id)
        if (!derivedFromChange || Math.abs(after - before) <= areaEpsilon) return
      }
      if (before !== null && after === null) {
        issues.push({
          code: 'room_unclosed',
          // CMD-34: by the name the person gave it; its id is in `entities`.
          message: english(said('diff.issue.roomUnclosed', { room: name(room.name || room.id) })),
          entities: [{ type: 'room', id: room.id }]
        })
      }
    }

    areas.push({ roomId: room.id, floor: floorOf(room), before, after, dependsOn })
  }

  for (const added of rooms.added) delta(undefined, added)
  for (const removed of rooms.removed) delta(removed, undefined)
  for (const [earlier, later] of rooms.both) delta(earlier, later)

  return { areas, issues }
}
