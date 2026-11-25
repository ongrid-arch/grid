/**
 * WRT-4: is the later plan the earlier one mirrored or turned a quarter? (lab Y-5, WR-16)
 *
 * A flat flipped left to right, or entered with its y running down the page, stands nowhere it
 * stood: compared wall by wall it is every wall moved. So before anything is paired, the earlier
 * plan is laid on the later one mirrored and turned each way a drawing can be turned without
 * changing a size: mirrored left to right or top to bottom, turned a quarter either way or half
 * round, and mirrored across either diagonal. The way that stands more walls in their place
 * than the plain one, and at least half the later plan's walls, is the plan's turn; the
 * comparison then pairs and lists from there, and says the turn first in one line.
 *
 * The turn is taken about the middle of the box round the earlier plan's walls, as `grid_mirror`
 * mirrors; the pairing then moves the origin as it always does. Turns are counter-clockwise on
 * the drawing as Grid draws it, with y up, as a stated north is.
 *
 * Pure: plans in, plain data out.
 */

import type { FloorPlan, Opening, Room, Wall } from '../plan'
import { boundaryPrint } from '../../rooms/stamp'
import { wallsInPlace } from './place'

export const PLAN_TURNS = ['mirror-left-right', 'mirror-top-bottom', 'turn-180', 'turn-90', 'turn-270', 'mirror-diagonal', 'mirror-other-diagonal'] as const
export type PlanTurnId = (typeof PLAN_TURNS)[number]

export interface PlanTurn {
  readonly id: PlanTurnId
  /** A mirror image: what was on the left is on the right. */
  readonly mirrored: boolean
  /** How far it is turned after any mirror, in degrees counter-clockwise: 0, 90, 180 or 270. */
  readonly degrees: 0 | 90 | 180 | 270
  /** The line that says so, without its full stop. */
  readonly text: string
}

type Matrix = readonly [number, number, number, number]

const TURNS: Readonly<Record<PlanTurnId, { readonly m: Matrix; readonly degrees: PlanTurn['degrees']; readonly text: string }>> = {
  'mirror-left-right': { m: [-1, 0, 0, 1], degrees: 0, text: 'The plan is mirrored left to right (east and west swap)' },
  'mirror-top-bottom': { m: [1, 0, 0, -1], degrees: 0, text: 'The plan is mirrored top to bottom (north and south swap)' },
  'turn-180': { m: [-1, 0, 0, -1], degrees: 180, text: 'The plan is turned half round' },
  'turn-90': { m: [0, -1, 1, 0], degrees: 90, text: 'The plan is turned a quarter counter-clockwise' },
  'turn-270': { m: [0, 1, -1, 0], degrees: 270, text: 'The plan is turned a quarter clockwise' },
  'mirror-diagonal': { m: [0, 1, 1, 0], degrees: 90, text: 'The plan is mirrored across the diagonal from bottom left to top right (mirrored left to right, then turned a quarter counter-clockwise)' },
  'mirror-other-diagonal': { m: [0, -1, -1, 0], degrees: 270, text: 'The plan is mirrored across the diagonal from top left to bottom right (mirrored left to right, then turned a quarter clockwise)' },
}

export function planTurn(id: PlanTurnId): PlanTurn {
  const turn = TURNS[id]
  const [a, b, c, d] = turn.m
  return { id, mirrored: a * d - b * c < 0, degrees: turn.degrees, text: turn.text }
}

/** The middle of the box round the plan's walls, or null with none. */
function middle(plan: FloorPlan): [number, number] | null {
  if (plan.walls.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const wall of plan.walls) {
    for (const p of [wall.start, wall.end]) {
      x0 = Math.min(x0, p[0])
      y0 = Math.min(y0, p[1])
      x1 = Math.max(x1, p[0])
      y1 = Math.max(y1, p[1])
    }
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

const SIDES: Readonly<Record<string, readonly [number, number]>> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }

/**
 * The plan mirrored or turned about the middle of its walls' box: each wall's ends, so an
 * opening keeps its offset from the same end. A mirror swaps each wall's faces, so a door's
 * swing changes face and each room's walls are listed the other way round, still
 * counter-clockwise; an opening kept from a side of the drawing is kept from the side it went to.
 */
export function turnPlan(plan: FloorPlan, id: PlanTurnId): FloorPlan {
  const centre = middle(plan)
  if (centre === null) return plan
  const [a, b, c, d] = TURNS[id].m
  const mirrored = a * d - b * c < 0
  const map = (p: readonly [number, number]): [number, number] => {
    const x = p[0] - centre[0]
    const y = p[1] - centre[1]
    return [a * x + b * y + centre[0], c * x + d * y + centre[1]]
  }
  const side = (from: string): string => {
    const v = SIDES[from]
    if (v === undefined) return from
    const to: readonly [number, number] = [a * v[0] + b * v[1], c * v[0] + d * v[1]]
    return Object.keys(SIDES).find((name) => SIDES[name]![0] === to[0] && SIDES[name]![1] === to[1]) ?? from
  }
  // CNT-18: a curved wall's centre goes with its ends, and a mirror turns its sweep the other way.
  const walls = plan.walls.map((wall): Wall => ({
    ...wall,
    start: map(wall.start),
    end: map(wall.end),
    ...(wall.arc === undefined ? {} : { arc: { centre: map(wall.arc.centre), sweep: mirrored ? -wall.arc.sweep : wall.arc.sweep } }),
  }))
  const openings = plan.openings.map((opening): Opening => {
    let next: Opening = opening
    if (mirrored && opening.swing !== undefined) next = { ...next, swing: opening.swing === 'left' ? 'right' : 'left' }
    if (opening.anchor !== undefined) next = { ...next, anchor: { ...opening.anchor, from: side(opening.anchor.from) as typeof opening.anchor.from } }
    return next
  })
  const rooms = mirrored
    ? plan.rooms.map((room): Room => ({
        ...room,
        boundary: [...room.boundary].reverse(),
        ...(room.holes === undefined ? {} : { holes: room.holes.map((hole) => [...hole].reverse()) }),
      }))
    : plan.rooms
  return { ...plan, walls, openings, rooms, ...(mirrored ? reprinted(plan, rooms) : {}) }
}

/**
 * MSG-21: a plan written rooms first keeps each room's boundary fingerprint (`written`, WRT-2).
 * A mirror lists each room's walls the other way round, so each room whose fingerprint matched
 * is printed again for its new order, as the mirror edit does; otherwise the mirrored copy reads
 * as every room edited by hand. A room already edited by hand keeps its old print and is still
 * found so.
 */
function reprinted(plan: FloorPlan, rooms: readonly Room[]): Pick<FloorPlan, 'written'> {
  const written = plan.written
  if (written === undefined) return {}
  const before = new Map(plan.rooms.map((room) => [room.id, room]))
  const boundaries: Record<string, string> = { ...written.boundaries }
  for (const room of rooms) {
    const was = before.get(room.id)
    if (was !== undefined && written.boundaries[room.id] === boundaryPrint(was)) boundaries[room.id] = boundaryPrint(room)
  }
  return { written: { ...written, boundaries } }
}

/**
 * The turn that lays the earlier plan on the later one, or null when the plain way stands as
 * many walls in their place (a plan that is the same either way is not called turned).
 */
export function findTurn(earlier: FloorPlan, later: FloorPlan): PlanTurn | null {
  const plain = wallsInPlace(earlier, later)
  if (plain >= Math.min(earlier.walls.length, later.walls.length)) return null
  let best: { id: PlanTurnId; count: number } | null = null
  for (const id of PLAN_TURNS) {
    const count = wallsInPlace(turnPlan(earlier, id), later)
    if (count > (best?.count ?? plain)) best = { id, count }
  }
  if (best === null || best.count * 2 < later.walls.length) return null
  return planTurn(best.id)
}
