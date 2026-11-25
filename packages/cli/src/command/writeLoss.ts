/**
 * WRT-16: the floors a write would drop. Rooms text replaces the plan's walls, rooms and floors,
 * so a text that names fewer floors than the file holds would silently take the others, with their
 * rooms, outlines, homes and parking. The comparison is by floor id, on the plan as read whole.
 */
import { floorOf, planFloors } from '@ongrid/floorplan/geometry'
import type { Floor, FloorPlan } from '@ongrid/floorplan/types/floorplan'

export interface DroppedFloor {
  readonly id: string
  readonly name: string
  readonly rooms: number
  readonly outline: boolean
  readonly homes: number | null
  readonly parking: number | null
}

/** The floors `before` has that `after` does not, each with what stands on it. */
export function floorsDropped(before: FloorPlan, after: FloorPlan): DroppedFloor[] {
  const kept = new Set(planFloors(after).map((floor) => floor.id))
  const stated = new Map<string, Floor>((before.floors ?? []).map((floor) => [floor.id, floor]))
  return planFloors(before)
    .filter((floor) => !kept.has(floor.id))
    .map((floor) => {
      const own = stated.get(floor.id)
      return {
        id: floor.id,
        name: floor.name,
        rooms: before.rooms.filter((room) => floorOf(room) === floor.id).length,
        outline: own?.outline !== undefined,
        homes: own?.homes ?? null,
        parking: own?.parking ?? null,
      }
    })
}

/** One floor in words: `First floor (first): 4 rooms, an outline, 6 homes, 2 parking spaces`. */
export function droppedWords(floor: DroppedFloor): string {
  const parts = [
    `${floor.rooms} room${floor.rooms === 1 ? '' : 's'}`,
    ...(floor.outline ? ['an outline'] : []),
    ...(floor.homes === null ? [] : [`${floor.homes} home${floor.homes === 1 ? '' : 's'}`]),
    ...(floor.parking === null ? [] : [`${floor.parking} parking space${floor.parking === 1 ? '' : 's'}`]),
  ]
  return `${floor.name} (${floor.id}): ${parts.join(', ')}`
}
