/**
 * SHT-21: a client floor's room list, grouped, so sixty bedrooms of one size are one row.
 *
 * Rooms of one use whose names differ only by a number at the end ("Bedroom 1", "Bedroom 2"), of
 * the same net area to the hundredth of a square metre, are one row: "60 × Bedroom", the area of
 * each in its detail and their sum as its area. A room the floor's net does not count (outdoor,
 * counted below, a void, not measured) stays a row of its own, and so do rooms alike to fewer than
 * `GROUP_MIN - 1` others: a house's two bedrooms of one size keep their own names.
 * The rows still add up to the floor's net area. The check sheet keeps one row per room.
 */
import { areaText } from '@ongrid/floorplan/geometry/rounding'
import type { RoomArea } from '../quantities/areas'

/** The fewest alike rooms made one row. */
export const GROUP_MIN = 3

/** A room's name less a number at its end, and what stood between them: "Bedroom 12" is "Bedroom". */
export function nameLessNumber(name: string): string {
  return name.replace(/[\s._#-]*\d+[a-z]?$/i, '').trim()
}

/** A row of the list: one room, or several alike. */
export interface RoomGroup {
  readonly rooms: readonly RoomArea[]
  /** The name the row is given: the room's own for one, the name less its number for several. */
  readonly name: string
}

/**
 * The rooms in rows, in the order of each row's first room. `counted` says which rooms are in the
 * floor's net; only those are grouped.
 */
export function groupRooms(rooms: readonly RoomArea[], counted: (room: RoomArea) => boolean): RoomGroup[] {
  const keyOf = (room: RoomArea): string | null => {
    const base = nameLessNumber(room.name)
    return !counted(room) || room.net === null || base === '' ? null : JSON.stringify([room.use, base, areaText(room.net, 2)])
  }
  const alike = new Map<string, RoomArea[]>()
  for (const room of rooms) {
    const key = keyOf(room)
    if (key !== null) alike.set(key, [...(alike.get(key) ?? []), room])
  }
  // Each room in plan order: a row of its own, or its group's row at the first of the group.
  const out: RoomGroup[] = []
  for (const room of rooms) {
    const group = alike.get(keyOf(room) ?? '')
    if (group === undefined || group.length < GROUP_MIN) out.push({ rooms: [room], name: room.name })
    else if (group[0] === room) out.push({ rooms: group, name: nameLessNumber(room.name) })
  }
  return out
}
