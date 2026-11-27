/**
 * LVL-26: a room that states its height stands its walls to it. A wall that bounds such a room and
 * stands to the top of the tallest of them (its floor offset and height) is raised, or stopped, by
 * that room: it is the room's, not the storey's, so the storey's height is not read from it and it
 * is not asked about against the storey. Pure.
 */
import type { PlanIndex, Wall } from './plan'
import { roomFloorOffset } from './steps'
import { tolerance } from './tolerances'

/** The top of the tallest room the wall bounds that states its height, above the storey's floor; null when none does. */
export function roomTopOver(wall: Wall, index: PlanIndex): number | null {
  let top: number | null = null
  for (const room of index.roomsByWall.get(wall.id) ?? []) {
    if (room.height === undefined || !Number.isFinite(room.height) || room.height <= 0) continue
    const own = roomFloorOffset(room) + room.height
    top = top === null ? Math.max(own, 0) : Math.max(top, own)
  }
  return top
}

/** Whether the wall stands to the top of a room it bounds that states its height (`roomTopOver`). */
export function raisedByRoom(wall: Wall, index: PlanIndex): boolean {
  const top = roomTopOver(wall, index)
  return top !== null && Number.isFinite(wall.height) && Math.abs(wall.height - top) <= tolerance('sameFloorLevel')
}
