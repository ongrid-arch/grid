/**
 * CNT-57: a room's group, by the word a person groups rooms by. A group is what the plan already
 * holds, never a field of its own: the firm's room type (`roomType`, CNT-5), its tenure (CNT-5),
 * or a fact of the person's own (CNT-9: a household, a department, a zone, a wing). The query
 * tools (`query.ts`) and the brief's scopes (`brief/lines.ts`) read a room's group here, so a
 * group asked by one name is the same group in every answer.
 *
 * Pure: a room in, its value out.
 */
import { factKey, factOf, type FactValue, type FloorPlan } from '@ongrid/floorplan/types/floorplan'

type Room = FloorPlan['rooms'][number]

/** The fields of a room a group may be, as `grid_fields` names them. */
export type RoomGroupField = 'room type' | 'tenure'

/** The words each is asked by, matched as a fact's name is (`factKey`). */
const NAMES: Readonly<Record<RoomGroupField, readonly string[]>> = {
  'room type': ['room type', 'type'],
  tenure: ['tenure'],
}

/**
 * The room field a name asks for, or null for a fact. A word Grid lends (`type` for the room type)
 * is a fact's when a part carries a fact by that name: `owned` says whether one does.
 */
export function roomGroupField(name: string, owned: (name: string) => boolean = () => false): RoomGroupField | null {
  const key = factKey(name)
  for (const field of Object.keys(NAMES) as RoomGroupField[]) {
    if (factKey(field) === key) return field
    if (NAMES[field].some((word) => factKey(word) === key) && !owned(name)) return field
  }
  return null
}

/** A room's value for a group, by its name: its room type, its tenure, else the fact so named. */
export function roomGroupValue(room: Room, name: string): FactValue | undefined {
  const field = roomGroupField(name, () => factOf(room, name) !== undefined)
  if (field === 'room type') return room.roomType
  if (field === 'tenure') return room.tenure
  return factOf(room, name)
}
