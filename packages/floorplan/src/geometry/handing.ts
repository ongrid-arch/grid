/**
 * A door's handing in the person's terms (CNT-14): the room it opens into, and the side it is
 * hinged on as seen from a room, turned into the wall's terms the plan stores (C2): `swing`, the
 * face of the wall it opens toward, and `hinge`, the end of the opening it hangs from.
 *
 * "Opens into the hall" needs no knowledge of which way the wall was drawn, and neither does
 * "hinged on the left as seen from the bedroom": standing in a room and facing the wall, the end
 * on your left is the wall's end (its `end`) when you stand on the face its normal points at, and
 * its start when you stand on the other.
 *
 * Unless another room is named, the side is seen from the room the door opens into. `outside`
 * names the side of the wall with no room on it.
 *
 * Pure: it reads the plan, writes nothing and never throws.
 */

import type { FloorPlan, Opening } from '../types/floorplan'
import type { DoorHinge, DoorSide } from './door'
import { indexPlan } from './plan'
import { planForFloor } from './floors'
import { openingSides, roomOutlines } from './rules/graph'

/** Left or right, as a person standing in a room and facing the wall sees it. */
export type HandSide = 'left' | 'right'

/** The word for the side of a wall no room is on. */
export const OUTSIDE = 'outside'

/** A door's handing as a person says it. Each part may be left out. */
export interface RoomHanding {
  /** The room it opens into, by id, or `outside`. */
  readonly opensInto?: string
  /** The side it is hinged on, as seen from `seenFrom`. */
  readonly hinged?: HandSide
  /** The room it is seen from, by id, or `outside`; unstated, the room it opens into. */
  readonly seenFrom?: string
}

/** The handing in the wall's terms, only what was asked for; or why it cannot be given. */
export type HandingResult = { readonly hinge?: DoorHinge; readonly swing?: DoorSide } | { readonly refused: string }

/** The rooms on the two faces of the wall at an opening's middle: the face its normal points at (`left`), then the other. `null` where no room is. */
export function openingRooms(plan: FloorPlan, opening: Opening): readonly [string | null, string | null] {
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (wall === undefined) return [null, null]
  const slice = planForFloor(plan, wall.floor ?? 'ground')
  const index = indexPlan(slice)
  return openingSides(opening, index, roomOutlines(slice, index))
}

/** The face of the wall a room is on, by id or `outside`; null when it is on neither, or on both. */
function faceOf(sides: readonly [string | null, string | null], room: string): DoorSide | null {
  const target = room === OUTSIDE ? null : room
  const left = sides[0] === target
  const right = sides[1] === target
  return left === right ? null : left ? 'left' : 'right'
}

const named = (room: string | null): string => (room === null ? 'the outside' : `"${room}"`)

/**
 * The end a door hangs from, for a side seen from a face of its wall: on the face its normal
 * points at, a person facing the wall has the wall's end on their left; on the other face, its start.
 */
export function hingeSeenFrom(face: DoorSide, side: HandSide): DoorHinge {
  return face === 'left' ? (side === 'left' ? 'end' : 'start') : side === 'left' ? 'start' : 'end'
}

/** The side a door is hinged on as seen from a face of its wall: `hingeSeenFrom` read back. */
export function sideSeenFrom(face: DoorSide, hinge: DoorHinge): HandSide {
  return face === 'left' ? (hinge === 'end' ? 'left' : 'right') : hinge === 'start' ? 'left' : 'right'
}

/**
 * VEW-72: a door's hand, the one way Grid says it in the schedule, the DXF and the IFC: the side
 * its hinges are on, seen from the side it opens toward (`handing.convention`). Null when the
 * plan states no swing or no hinge.
 */
export function doorHand(opening: { readonly swing?: DoorSide | undefined; readonly hinge?: DoorHinge | undefined }): HandSide | null {
  return opening.swing === undefined || opening.hinge === undefined ? null : sideSeenFrom(opening.swing, opening.hinge)
}

/**
 * Turns a handing said in rooms into the wall's terms, for `opening` in `plan` as it is (its wall
 * and place). `opensInto` gives `swing`; `hinged` gives `hinge`, seen from `seenFrom`, else from
 * the room it opens into, else from the face the door already opens to. A room that is on neither
 * side of the door, a side that cannot be seen from anywhere, or a handing with nothing in it is
 * refused, saying which rooms the door is between.
 */
export function handingFromRooms(plan: FloorPlan, opening: Opening, asked: RoomHanding): HandingResult {
  if (opening.type !== 'door') return { refused: `Only a door has a handing; "${opening.id}" is ${opening.type === 'opening' ? 'an' : 'a'} ${opening.type}.` }
  if (asked.opensInto === undefined && asked.hinged === undefined) return { refused: 'Say the room it opens into, the side it is hinged on, or both.' }
  const sides = openingRooms(plan, opening)
  const between = `Door "${opening.id}" is between ${named(sides[0])} and ${named(sides[1])}`
  let swing: DoorSide | undefined
  if (asked.opensInto !== undefined) {
    const face = faceOf(sides, asked.opensInto)
    if (face === null) {
      return { refused: sides[0] === sides[1] ? `${between}: the same on both sides, so which way it opens cannot be told from a room.` : `${between}: it can open into one of those only.` }
    }
    swing = face
  }
  if (asked.hinged === undefined) return { swing: swing! }
  const from = asked.seenFrom ?? asked.opensInto
  const face = from !== undefined ? faceOf(sides, from) : (opening.swing ?? null)
  if (face === null) {
    if (from === undefined) return { refused: 'Say the room the side is seen from, or the room the door opens into: left and right depend on where you stand.' }
    return { refused: `${between}, so it cannot be seen from ${from === OUTSIDE ? 'the outside' : `"${from}"`}.` }
  }
  const hinge = hingeSeenFrom(face, asked.hinged)
  return swing === undefined ? { hinge } : { hinge, swing }
}

/**
 * A door's handing said in rooms, from what the plan states: the room it opens into and the side
 * it is hinged on as seen from that room. Null for what the plan does not state, or a room that
 * cannot be told.
 */
export function handingInRooms(plan: FloorPlan, opening: Opening): { readonly opensInto: string | null; readonly hinged: HandSide | null } | null {
  if (opening.type !== 'door' || opening.swing === undefined) return null
  const sides = openingRooms(plan, opening)
  const into = opening.swing === 'left' ? sides[0] : sides[1]
  const hinged = opening.hinge === undefined ? null : sideSeenFrom(opening.swing, opening.hinge)
  return { opensInto: into ?? OUTSIDE, hinged }
}
