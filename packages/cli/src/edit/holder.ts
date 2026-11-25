/**
 * WRT-46: the part of a plan that holds an id, and where it is, for a refusal of a taken id. An
 * agent that wrote a plan again from rooms text may take the items it kept for cleared; naming the
 * bed that holds `bed-1`, and where it stands, says why the id is taken and what to change.
 */
import { english, name, num, said } from '@ongrid/floorplan/messages'
import { floorOf, indexPlan, itemKindWord, itemRoom, planFloors, roomShapes, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'

const n2 = (value: number) => num(value.toFixed(2))

/** The words that name the part holding `id` and where it is: "bed "bed-1" at (1.20, 2.40) in room "Bedroom"". */
export function idHolder(plan: FloorPlan, id: string): string {
  const floors = planFloors(plan).length > 1
  const onFloor = (part: { readonly floor?: string }) => (floors ? said('edit.idTaken.onFloor', { floor: name(floorOf(part)) }) : '')
  const item = (plan.items ?? []).find((part) => part.id === id)
  if (item !== undefined) {
    const index = indexPlan(plan)
    const room = itemRoom(item, roomShapes(index, validatePlan(plan, index).broken))
    const values = { kind: itemKindWord(item.kind), id: name(item.id), x: n2(item.at[0]), y: n2(item.at[1]), floor: onFloor(item) }
    return english(room === null ? said('edit.idTaken.item.noRoom', values) : said('edit.idTaken.item', { ...values, room: name(room.name || room.id) }))
  }
  const room = plan.rooms.find((part) => part.id === id)
  if (room !== undefined) return english(said('edit.idTaken.room', { room: name(room.name || room.id), id: name(room.id), floor: onFloor(room) }))
  const wall = plan.walls.find((part) => part.id === id)
  if (wall !== undefined) return english(said('edit.idTaken.wall', { id: name(wall.id), x1: n2(wall.start[0]), y1: n2(wall.start[1]), x2: n2(wall.end[0]), y2: n2(wall.end[1]), floor: onFloor(wall) }))
  const opening = plan.openings.find((part) => part.id === id)
  if (opening !== undefined) return english(said(opening.type === 'door' ? 'edit.idTaken.door' : opening.type === 'window' ? 'edit.idTaken.window' : 'edit.idTaken.opening', { id: name(opening.id), wall: name(opening.wall) }))
  const column = (plan.columns ?? []).find((part) => part.id === id)
  if (column !== undefined) return english(said('edit.idTaken.column', { id: name(column.id), x: n2(column.at[0]), y: n2(column.at[1]), floor: onFloor(column) }))
  return english(said('edit.idTaken.other'))
}
