/**
 * WRT-75 (C16): a fit-out started from a base plan. The new plan names the base and has the
 * base's rooms, as they stand after its own work, as its own rooms on the base's walls: their
 * ids, names, uses and floors, their boundaries naming the base's walls. It holds no wall and no
 * opening of its own, so the base stays the shell, read in as existing, and every change made
 * after it (a room split, merged or added, a door between two rooms) is the fit-out's work, which
 * the edits already keep off the base (`phases.ts`).
 *
 * Pure: the base plan in, the new plan's file out, or the reason there is none.
 */
import { mergeBase, planInState, validatePlan, type FloorPlan, type Room } from '@ongrid/floorplan/geometry'
import { english, name, said } from '@ongrid/floorplan/messages'
import { safeParseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { EditRefused } from './refused'

export interface FitOutStarted {
  /** The plan file's JSON. */
  readonly file: Record<string, unknown>
  /** The plan read with its base, as every command reads it. */
  readonly plan: FloorPlan
  readonly rooms: readonly string[]
  readonly said: readonly string[]
}

/** A room of the base, as the fit-out's own: its phase is the fit-out's (new), the rest as the base has it. */
function ownRoom(room: Room): Room {
  const { phase: _phase, ...rest } = room
  void _phase
  return rest
}

/** The fit-out on `base` (the plan as read, its patterns expanded), named by its path from the project folder, `file`. */
export function startFitOut(base: FloorPlan, file: string, options: { readonly name?: string } = {}): FitOutStarted {
  const shell = planInState(base, 'after')
  const rooms = shell.rooms.map(ownRoom)
  const json: Record<string, unknown> = {
    version: '1',
    units: 'm',
    ...(options.name === undefined ? {} : { name: options.name }),
    base: file,
    ...(base.building === undefined ? {} : { building: base.building }),
    ...(base.display === undefined ? {} : { display: base.display }),
    walls: [],
    rooms,
    openings: [],
  }
  const own = safeParseFloorPlan(json)
  if (own === null) throw new EditRefused(english(said('fitOut.start.unread', { file: name(file) })))
  const merged = mergeBase(own, base)
  if (merged.clashes.length > 0) throw new EditRefused(english(said('fitOut.start.clash', { file: name(file), ids: merged.clashes.slice(0, 5).map((id) => `"${id}"`).join(', ') })))
  const errors = validatePlan(merged.plan).issues.filter((issue) => issue.severity === 'error')
  if (errors.length > 0) throw new EditRefused(english(said('fitOut.start.broken', { file: name(file), id: name(errors[0]!.id), message: errors[0]!.message })))
  const lines = [
    english(rooms.length === 0 ? said('fitOut.start.noRooms', { file: name(file) }) : rooms.length === 1 ? said('fitOut.start.room', { file: name(file) }) : said('fitOut.start.rooms', { file: name(file), count: rooms.length })),
    english(said('fitOut.start.next')),
  ]
  return { file: json, plan: merged.plan, rooms: rooms.map((r) => r.id), said: lines }
}
