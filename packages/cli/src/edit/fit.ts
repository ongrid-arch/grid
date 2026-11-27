/**
 * WRT-18: a change is written only when it leaves the drawing with no problem it did not have.
 * `newProblems` is that check, of any severity, the one `writeChange` makes before it writes;
 * `largestFit` finds the largest move up to the one asked for that passes it, so a side that
 * cannot move as far as asked is refused with the move that fits (`sideMoveThatFits`).
 *
 * Pure: plans and patches in, problems and figures out.
 */
import { dot, sub, tolerance, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { insideAcross, moveRoomSide, type Patch } from './edits'
import { EditRefused } from './refused'
import { roomSide } from './sideNames'
import type { Vec2 } from '@ongrid/floorplan/geometry'
import type { Survey } from '../quantities/survey'

/** The narrowest a room is left across the side that moves: the least inside size `grid_move_room_side` takes. */
export const NARROWEST_ACROSS = 0.3

export type DrawingIssue = ReturnType<typeof validatePlan>['issues'][number]

/** What a change checks a patch with before it is written: the problems it would add. */
export type ProblemsOf = (patch: Patch) => DrawingIssue[]

/**
 * What a change may add without being refused, because it reports the design asked for rather
 * than a fault in the drawing: a floor that sits back from or over the one below, as an
 * extension does; a wall whose stated kind the rooms round it read otherwise, kept as stated; and
 * a fixture's fit, which `grid_place_item` answers.
 */
const MAY_ADD = (issue: DrawingIssue): boolean => issue.severity !== 'error' && (issue.code.startsWith('item/') || issue.code === 'floor/out-of-line' || issue.code === 'floor/set-back' || issue.code === 'floor/split-level' || issue.code === 'wall/kind-differs')

/**
 * The drawing's problems after a change that it did not have before, of any severity, matched
 * by code and part and counted, so a problem that only changes its figures is not new. A
 * warning left on a part whose error the change clears is not new either: the change fixed more
 * than it left.
 */
export function newProblems(before: FloorPlan, after: FloorPlan): DrawingIssue[] {
  const key = (issue: DrawingIssue): string => `${issue.code}|${issue.id}`
  const was = validatePlan(before).issues
  const now = validatePlan(after).issues
  const erred = (issues: readonly DrawingIssue[]): Set<string> => new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.id))
  const cleared = new Set([...erred(was)].filter((id) => !erred(now).has(id)))
  const had = new Map<string, number>()
  for (const issue of was) had.set(key(issue), (had.get(key(issue)) ?? 0) + 1)
  return now.filter((issue) => {
    const left = had.get(key(issue)) ?? 0
    if (left > 0) had.set(key(issue), left - 1)
    return left === 0 && !MAY_ADD(issue) && !(issue.severity !== 'error' && cleared.has(issue.id))
  })
}

/** A refusal's list of new problems: at most three, in their own words, and how many more. */
export function problemsText(problems: readonly DrawingIssue[]): string {
  const shown = problems.slice(0, 3).map((issue) => `${JSON.stringify(issue.id)}: ${issue.message}`).join(' ')
  return `${shown}${problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''}`
}

/** The finest step a move that fits is given in: a centimetre. */
const STEP = 0.01

/**
 * The largest move the same way as `asked`, and no larger, that `fits`, to the centimetre, or
 * null when none of a centimetre or more does. Found by halving between nothing and the move
 * asked for, and checked once more at the figure it gives, so a figure it gives always fits.
 */
export function largestFit(asked: number, fits: (by: number) => boolean): number | null {
  const sign = Math.sign(asked)
  let lo = 0
  let hi = Math.abs(asked)
  while (hi - lo > STEP / 2) {
    const mid = (lo + hi) / 2
    if (fits(sign * mid)) lo = mid
    else hi = mid
  }
  for (let best = Math.floor(lo / STEP + tolerance('noLength')) * STEP; best >= STEP - tolerance('noLength'); best -= STEP) {
    const by = sign * Math.round(best * 100) / 100
    if (fits(by)) return by
    if (best < lo - 3 * STEP) break
  }
  return null
}

/**
 * Moves one side of a room by `by` (WRT-3), or refuses the move when it would leave the drawing
 * with a new problem or cannot be made, saying why and the largest move the same way that fits:
 * in metres to move it, and the room's inside size it leaves.
 */
export function sideMoveThatFits(survey: Survey, roomId: string, side: string, by: number, problemsOf: ProblemsOf): Patch {
  // CMD-50: the side as rooms text names it; a name the room has no side for is refused here, listing its sides.
  const out = roomSide(survey, roomId, side).out
  const move = (distance: number): { patch: Patch; problems: DrawingIssue[] } | { refused: string } => {
    try {
      const patch = moveRoomSide(survey, roomId, side, distance)
      return { patch, problems: problemsOf(patch) }
    } catch (error) {
      if (error instanceof EditRefused) return { refused: error.message }
      throw error
    }
  }
  const [least, most] = roomsAcross(survey, roomId, out)
  const leavesRoom = (distance: number): boolean => distance >= least - tolerance('noLength') && distance <= most + tolerance('noLength')
  const asked = move(by)
  if ('patch' in asked && asked.problems.length === 0 && leavesRoom(by)) return asked.patch
  const why = 'refused' in asked ? asked.refused : asked.problems.length === 0 ? `Moving it ${by.toFixed(2)} m would leave a room on that wall less than ${NARROWEST_ACROSS.toFixed(2)} m across.` : `Moving it ${by.toFixed(2)} m would leave the drawing with problems it does not have: ${problemsText(asked.problems)}`
  const best = largestFit(by, (distance) => {
    if (!leavesRoom(distance)) return false
    const tried = move(distance)
    return 'patch' in tried && tried.problems.length === 0
  })
  const now = insideAcross(survey, roomId, out)
  const offer = best === null ? 'No move that way fits.' : `The largest move that fits is by ${best.toFixed(2)} m, to ${(now + best).toFixed(2)} m inside.`
  throw new EditRefused(`${why} ${offer}`)
}

/**
 * The moves the rooms on the moved wall allow, least and most: each keeps at least
 * `NARROWEST_ACROSS` inside across the side that moves. A room on the same side of the wall as
 * the room named grows with the move, one on the other side shrinks.
 */
function roomsAcross(survey: Survey, roomId: string, out: Vec2): [number, number] {
  const facing = (edge: { from: { x: number; y: number }; to: { x: number; y: number }; length: number }): number => {
    const d = sub(edge.to, edge.from)
    return dot({ x: d.y / edge.length, y: -d.x / edge.length }, out)
  }
  const square = (cosine: number, to: 1 | -1): boolean => Math.abs(cosine - to) < 1e-3
  const walls = new Set(survey.byId.get(roomId)!.edges.filter((edge) => edge.wall !== null && square(facing(edge), 1)).map((edge) => edge.wall!.id))
  let least = -Infinity
  let most = Infinity
  for (const room of survey.rooms) {
    if (room.polygon.length < 3) continue
    const across = insideAcross(survey, room.facts.id, out)
    for (const edge of room.edges) {
      if (edge.wall === null || !walls.has(edge.wall.id)) continue
      const f = facing(edge)
      if (square(f, 1)) least = Math.max(least, NARROWEST_ACROSS - across)
      else if (square(f, -1)) most = Math.min(most, across - NARROWEST_ACROSS)
    }
  }
  return [least, most]
}
