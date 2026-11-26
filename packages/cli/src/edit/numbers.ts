/**
 * Room numbers an edit keeps (WRT-23). A room that states no number is shown by Grid's count, so
 * adding or taking out a room moves the count of the rooms after it, and with it the schedule's
 * numbers and the IFC spaces' names. When a change would move the number a room had, the plan is
 * written with the numbers the rooms had stated (`number`, C9), and a room the change adds takes
 * the next number nobody has. A change that moves no number writes none.
 *
 * WRT-74: a room whose stated number the change takes out (`grid_set_facts` with number none) is
 * left to Grid's count: its own number moving is what was asked, and it is given none.
 *
 * Pure: the plan before, the file's JSON after, the JSON out.
 */
import { floorOf, roomNumbers, shownRoomNumber, type FloorPlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'

type RawRecord = Record<string, unknown>

export function keepRoomNumbers<T>(before: FloorPlan, after: T): T {
  const parsed = FloorPlanSchema.safeParse(after)
  if (!parsed.success) return after
  const had = new Map(roomNumbers(before).map((n) => [`${n.floor}\u0000${n.id}`, n] as const))
  const now = roomNumbers(parsed.data)
  const unstated = new Set(now.filter((n) => n.stated === null && (had.get(`${n.floor}\u0000${n.id}`)?.stated ?? null) !== null).map((n) => `${n.floor}\u0000${n.id}`))
  const moved = now.some((n) => {
    if (unstated.has(`${n.floor}\u0000${n.id}`)) return false
    const was = had.get(`${n.floor}\u0000${n.id}`)
    return was !== undefined && shownRoomNumber(was) !== shownRoomNumber(n)
  })
  if (!moved) return after

  const keep = new Map<string, string>()
  const taken = new Set<string>()
  for (const [key, n] of had) {
    keep.set(key, shownRoomNumber(n))
    taken.add(shownRoomNumber(n))
  }
  // A room the change adds takes the next whole number above every number in use.
  let next = Math.max(0, ...[...taken].map((t) => (/^[0-9]+$/.test(t) ? Number(t) : 0)))
  for (const n of now) {
    const key = `${n.floor}\u0000${n.id}`
    if (keep.has(key)) continue
    if (n.stated !== null && !taken.has(n.stated)) {
      keep.set(key, n.stated)
      taken.add(n.stated)
      continue
    }
    do next += 1
    while (taken.has(String(next)))
    keep.set(key, String(next))
    taken.add(String(next))
  }

  const rooms = (after as unknown as { rooms: RawRecord[] }).rooms.map((room, i) => {
    if (room['number'] !== undefined) return room
    if (unstated.has(`${floorOf(parsed.data.rooms[i]!)}\u0000${parsed.data.rooms[i]!.id}`)) return room
    const number = keep.get(`${floorOf(parsed.data.rooms[i]!)}\u0000${parsed.data.rooms[i]!.id}`)
    return number === undefined ? room : { ...room, number }
  })
  return { ...(after as unknown as RawRecord), rooms } as unknown as T
}
