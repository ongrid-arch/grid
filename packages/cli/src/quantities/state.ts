/**
 * The state of every area Grid gives (MSG-2, lab AA-12, AC-9): proven, not proven or not looked
 * at, and the rooms that make it so. A total that left a room out names it, so a sum that is
 * short is never read as the whole.
 *
 * - A room's area is `not-looked-at` when the room cannot be drawn: it has no area then.
 * - It is `not-proven` when the drawing questions its outline: the walls it lists do not
 *   enclose it as drawn, it overlaps another room, or it is marked inside a room that holds it
 *   not (the codes in `DOUBTS`).
 * - A total is `proven` when every room in it is (a total of no rooms is 0, and proven);
 *   `not-proven` when one is left out or in doubt, and it names them; `not-looked-at` when none
 *   of its rooms could be measured.
 * - A gross area is worked out from the walls marked exterior: `not-looked-at` when they close no
 *   floor, and `not-proven` when a room it takes off is.
 *
 * Pure: a plan in, plain data out.
 */
import { planForFloor, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import type { NumberState } from '@ongrid/rules'

export type { NumberState }

/** The drawing problems that question a room's measured outline, and so its area. */
export const DOUBTS: readonly string[] = ['room/not-enclosed', 'room/space-mismatch', 'room/overlap', 'room/overlap-unknown', 'room/inside-no-host', 'room/zone-not-in-room']

/** A room a figure names, as the plan writes it. */
export interface RoomRef {
  readonly floor: string
  readonly id: string
  readonly name: string
}

export interface AreaState {
  readonly state: NumberState
  /** Rooms the figure should hold but could not measure: it is short by their area. */
  readonly leftOut: readonly RoomRef[]
  /** Rooms it holds whose outline the drawing questions. */
  readonly notProven: readonly RoomRef[]
  /** ARE-20: why it is not proven when no room makes it so, such as a gross area below the net, in sentences. Absent when there is none. */
  readonly why?: readonly string[]
}

/** A room as the states read it: its area, null when not measured, and its own state. */
export interface MeasuredRoom extends RoomRef {
  readonly net: number | null
  readonly state: NumberState
}

/** The drawing codes that question each room's outline, by floor then room id. */
export function roomDoubts(plan: FloorPlan, floors: readonly string[]): Map<string, Map<string, string[]>> {
  const doubts = new Map<string, Map<string, string[]>>()
  for (const floor of floors) {
    const onFloor = new Map<string, string[]>()
    for (const issue of validatePlan(planForFloor(plan, floor)).issues) {
      if (issue.entity !== 'room' || !DOUBTS.includes(issue.code)) continue
      onFloor.set(issue.id, [...new Set([...(onFloor.get(issue.id) ?? []), issue.code])])
    }
    doubts.set(floor, onFloor)
  }
  return doubts
}

/** A room's state from its area and the drawing's doubts about it. */
export function roomState(net: number | null, doubts: readonly string[]): NumberState {
  return net === null ? 'not-looked-at' : doubts.length > 0 ? 'not-proven' : 'proven'
}

const ref = (room: RoomRef): RoomRef => ({ floor: room.floor, id: room.id, name: room.name })

/** The state of a sum of these rooms. */
export function sumState(rooms: readonly MeasuredRoom[]): AreaState {
  const leftOut = rooms.filter((room) => room.net === null).map(ref)
  const notProven = rooms.filter((room) => room.state === 'not-proven').map(ref)
  // A sum of no rooms is exact: 0. A sum of rooms none of which could be measured is no figure at all.
  const measured = rooms.length - leftOut.length
  const state: NumberState =
    rooms.length > 0 && measured === 0 ? 'not-looked-at' : leftOut.length + notProven.length > 0 ? 'not-proven' : 'proven'
  return { state, leftOut, notProven }
}

/** The state of a figure measured from the walls, less these rooms: proven unless one of them is not. */
export function lessRooms(rooms: readonly MeasuredRoom[]): AreaState {
  const { leftOut, notProven } = sumState(rooms)
  return { state: leftOut.length + notProven.length > 0 ? 'not-proven' : 'proven', leftOut, notProven }
}

/** The state of a figure made of others: the worst of them, with all they name. */
export function joinStates(states: readonly AreaState[]): AreaState {
  const all = (pick: (s: AreaState) => readonly RoomRef[]): RoomRef[] => {
    const seen = new Map<string, RoomRef>()
    for (const room of states.flatMap(pick)) seen.set(`${room.floor}\u0000${room.id}`, room)
    return [...seen.values()]
  }
  const state: NumberState = states.some((s) => s.state === 'not-looked-at')
    ? 'not-looked-at'
    : states.some((s) => s.state === 'not-proven')
      ? 'not-proven'
      : 'proven'
  const why = [...new Set(states.flatMap((s) => s.why ?? []))]
  return { state, leftOut: all((s) => s.leftOut), notProven: all((s) => s.notProven), ...(why.length === 0 ? {} : { why }) }
}

/** ARE-20: the state with a reason added that makes it not proven (one not looked at stays so). */
export function doubted(state: AreaState, why: string | null): AreaState {
  if (why === null || state.state === 'not-looked-at') return state
  return { ...state, state: 'not-proven', why: [...new Set([...(state.why ?? []), why])] }
}

/** A figure Grid could not work out at all: nothing it would be made of was measured. */
export const NOT_LOOKED_AT: AreaState = { state: 'not-looked-at', leftOut: [], notProven: [] }

const names = (rooms: readonly RoomRef[], several: boolean): string =>
  rooms.map((room) => `${JSON.stringify(room.name)}${several ? ` on ${JSON.stringify(room.floor)}` : ''}`).join(', ')

/** The state in words, after the figure: "", or "; not proven: leaves out "Kitchen", which could not be measured". */
export function stateText(state: AreaState, several: boolean): string {
  if (state.state === 'proven') return ''
  if (state.state === 'not-looked-at' && state.leftOut.length === 0) return '; not looked at: nothing it is made of could be measured'
  const parts: string[] = []
  if (state.leftOut.length > 0) parts.push(`leaves out ${names(state.leftOut, several)}, which could not be measured`)
  if (state.notProven.length > 0) parts.push(`holds ${names(state.notProven, several)}, whose outline the drawing questions`)
  // ARE-20: a reason in Grid's own words, such as a gross area below the net, ends with its own stop.
  for (const why of state.why ?? []) parts.push(why.replace(/\.$/, ''))
  return `; ${state.state === 'not-proven' ? 'not proven' : 'not looked at'}: ${parts.join('; ')}`
}
