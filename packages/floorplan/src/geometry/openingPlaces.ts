/**
 * Where each opening stands (MSG-16): checks that an opening fits the clear run of its wall.
 *
 * An opening is cut through its own wall only, in the drawing and in every export (`wallParts`,
 * the IFC void). So where another wall meets its wall, that wall's body stands across the opening
 * and nothing says so. Here each wall's clear run is worked out between the bodies of the walls
 * that meet it, and every opening and every wall end is tested against it. Every finding is a
 * warning: the opening is still drawn, cut through its own wall.
 *
 * - `opening/crosses-wall`: the opening runs into the body of a wall that meets its wall at a
 *   corner or a junction, or crosses it.
 * - `wall/ends-in-opening`: a wall ends on another wall inside one of its openings. A wall whose
 *   centre line meets that wall at a jamb, within `openingOverrun`, makes the jamb and is not
 *   named (ARE-32): a corridor carried through an opening as wide as it is between its walls'
 *   centre lines, or a bay's mouth. One whose body runs into the opening is named otherwise.
 * - `opening/fills-wall`: the opening is as long as its wall; nothing of the wall is left.
 * - `opening/on-dividing-line`: a door or a window on a dividing line, which has no wall to hang
 *   it in. A warning, not a refusal: an open-plan opening is sometimes drawn that way.
 * - `opening/window-between-rooms`: a window in a wall with rooms on both sides, unless the wall
 *   is stated as an outside wall. It may be a borrowed light, so it is a warning, not a refusal.
 *
 * Walls meet as the wall faults have them meet: an end within half the other wall's thickness
 * plus `gap` of its line. A meeting sharper than `mitreReach` half thicknesses is left out, as the
 * corners leave it square (SHT-2). An opening runs into a body when it overlaps it by more than
 * `openingOverrun`.
 */

import type { Issue } from './validate'
import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { openingsOf } from './plan'
import { openingReach } from './openingRun'
import { floorOf } from './floors'
import { cross, sub } from './vec2'
import type { WallSegment } from './wall'
import { openingSpan, wallAxis, wallSegments } from './wall'
import { curveFault, wallCurve } from './arc'
import { tolerance } from './tolerances'
import { metresText } from './rounding'
import { wallSides } from './exposure'
import { boxIndex, boxOfPoints, widenBox } from './boxIndex'
import type { Said } from '../messages/say'
import { english, name, num, said } from '../messages/say'
import { withSaid } from './issueWords'

/** An `Issue`, plus the other things it names, so the result can list them. */
export interface PlaceIssue extends Issue {
  readonly hits: readonly string[]
}

/** Where another wall's body stands across a wall, along its axis. */
interface Cover {
  /** The wall that stands there. */
  readonly wall: string
  readonly from: number
  readonly to: number
  /** Where that wall's centre line crosses this one's, along it (ARE-32). */
  readonly at: number
  /** `end`: that wall ends on this one, inside its length. `across`: this wall ends on it, or it passes through. */
  readonly how: 'end' | 'across'
  /** How high that wall stands. */
  readonly height: number
}

const half = (wall: Wall): number => (wall.virtual ? 0 : wall.thickness / 2)

/**
 * A wall as this check measures it: its straight pieces along its axis (one for a straight wall,
 * the chords of a curve, CNT-18), how long it is, and whether it is a whole circle with no ends.
 */
interface Course {
  readonly segments: readonly WallSegment[]
  readonly length: number
  readonly closed: boolean
}

/** Walls that cannot be measured are validation's to report, and are left out here. */
function courseOf(wall: Wall): Course | null {
  if (![...wall.start, ...wall.end].every(Number.isFinite)) return null
  if (wall.arc !== undefined) {
    if (curveFault(wall) !== null) return null
    const curve = wallCurve(wall)!
    return { segments: wallSegments(wall), length: curve.length, closed: curve.closed }
  }
  if (wall.start[0] === wall.end[0] && wall.start[1] === wall.end[1]) return null
  const axis = wallAxis(wall)
  return { segments: [{ ...axis, from: 0, to: axis.length }], length: axis.length, closed: false }
}

/**
 * Where `other`'s body stands across `wall`, or null when they do not meet. The two axes' lines
 * cross at `s` along `wall` and `u` along `other`; they meet when that point lies on both walls,
 * each reaching half the other's thickness plus `gap` past its ends. A curved wall is tried
 * piece by piece, and the first piece that meets is taken.
 */
function coverOf(wall: Wall, course: Course, other: Wall, otherCourse: Course): Cover | null {
  for (const a of course.segments) {
    for (const b of otherCourse.segments) {
      const cover = coverOfPieces(wall, course, a, other, otherCourse, b)
      if (cover !== null) return cover
    }
  }
  return null
}

function coverOfPieces(wall: Wall, course: Course, a: WallSegment, other: Wall, otherCourse: Course, b: WallSegment): Cover | null {
  const sine = cross(a.dir, b.dir)
  if (Math.abs(sine) < tolerance('parallel')) return null
  const gap = tolerance('gap')
  const reachOnWall = (half(other) + gap) / Math.abs(sine)
  const reachOnOther = (half(wall) + gap) / Math.abs(sine)
  // Sharper than the corners join: left square, and not a meeting here either.
  const most = tolerance('mitreReach') * (Math.max(half(wall), half(other)) + gap)
  if (reachOnWall > most || reachOnOther > most) return null

  const d = sub(b.start, a.start)
  const s = cross(d, b.dir) / sine
  const u = cross(d, a.dir) / sine
  // Only at an end of the wall itself does the meeting reach past a piece.
  const lowA = !course.closed && a.from <= 0 ? -reachOnWall : 0
  const highA = !course.closed && a.to >= course.length ? a.length + reachOnWall : a.length
  const lowB = !otherCourse.closed && b.from <= 0 ? -reachOnOther : 0
  const highB = !otherCourse.closed && b.to >= otherCourse.length ? b.length + reachOnOther : b.length
  if (s < lowA || s > highA) return null
  if (u < lowB || u > highB) return null

  // Along each wall's own axis: a chord is a little shorter than the curve it stands for.
  const scaleA = a.length === 0 ? 1 : (a.to - a.from) / a.length
  const scaleB = b.length === 0 ? 1 : (b.to - b.from) / b.length
  const at = a.from + s * scaleA
  const atOther = b.from + u * scaleB
  const body = (half(other) / Math.abs(sine)) * scaleA
  const otherEnds = !otherCourse.closed && (atOther <= reachOnOther || atOther >= otherCourse.length - reachOnOther)
  const wallEnds = !course.closed && (at <= reachOnWall || at >= course.length - reachOnWall)
  return {
    wall: other.id,
    from: Math.max(0, at - body),
    to: Math.min(course.length, at + body),
    at,
    how: otherEnds && !wallEnds ? 'end' : 'across',
    height: other.height
  }
}

/** The covers on every wall, by wall id, for the walls given (one floor's, not broken). */
function coversOf(walls: readonly Wall[]): Map<string, Cover[]> {
  const courses = walls.map(courseOf)
  const boxes = walls.map((wall, i) => {
    const course = courses[i]
    if (!course) return boxOfPoints([])
    const reach = tolerance('mitreReach') * (half(wall) + tolerance('gap'))
    return widenBox(boxOfPoints(course.segments.flatMap((segment) => [segment.start, segment.end])), reach)
  })
  const near = boxIndex(boxes)
  const covers = new Map<string, Cover[]>()
  walls.forEach((wall, i) => {
    const a = courses[i]
    if (!a) return
    const list: Cover[] = []
    for (const j of near.near(boxes[i]!)) {
      const other = walls[j]!
      const b = courses[j]
      if (j === i || !b || other.virtual || other.id === wall.id) continue
      const cover = coverOf(wall, a, other, b)
      if (cover && cover.to > cover.from) list.push(cover)
    }
    covers.set(wall.id, list)
  })
  return covers
}

/** The stretches of `0..length` that no cover takes, in order. */
function clearRuns(length: number, covers: readonly { from: number; to: number }[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = []
  let at = 0
  for (const c of [...covers].sort((x, y) => x.from - y.from)) {
    if (c.from > at) runs.push({ from: at, to: c.from })
    at = Math.max(at, c.to)
  }
  if (length > at) runs.push({ from: at, to: length })
  return runs
}

/** What to say about where an opening of `width` fits on its wall, clear of `covers`. */
function whereItFits(length: number, covers: readonly Cover[], width: number, middle: number): Said {
  const fits = clearRuns(length, covers).filter((run) => run.to - run.from >= width)
  if (fits.length === 0) return said('issue.opening/crosses-wall.noStretch')
  const best = fits.reduce((x, y) =>
    Math.abs((x.from + x.to) / 2 - middle) <= Math.abs((y.from + y.to) / 2 - middle) ? x : y
  )
  return said('issue.opening/crosses-wall.fits', { from: num(metresText(best.from)), to: num(metresText(best.to - width)) })
}

const warning = (entity: Issue['entity'], id: string, code: string, sentence: Said, hits: readonly string[]): PlaceIssue =>
  withSaid({ entity, id, code, message: english(sentence), severity: 'warning', hits }, sentence)

/**
 * The checks on where each opening stands, for the walls and openings that are not broken.
 * Never throws: a wall that cannot be measured is validation's to report.
 */
export function openingPlaceIssues(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>): PlaceIssue[] {
  const issues: PlaceIssue[] = []
  const overrun = tolerance('openingOverrun')
  const byFloor = new Map<string, Wall[]>()
  for (const wall of plan.walls) {
    if (broken.has(wall.id) || index.wallsById.get(wall.id) !== wall) continue
    const list = byFloor.get(floorOf(wall))
    if (list) list.push(wall)
    else byFloor.set(floorOf(wall), [wall])
  }

  for (const walls of byFloor.values()) {
    const covers = coversOf(walls)
    for (const wall of walls) {
      const axis = courseOf(wall)
      if (!axis) continue
      const here = covers.get(wall.id) ?? []
      for (const opening of openingsOf(index, wall.id)) {
        if (broken.has(opening.id)) continue
        const what = said(`issue.part.Named.${opening.type}`, { id: name(opening.id) })
        const span = openingSpan(opening)
        // VEW-77: an opening that runs on past an end of its wall along a smooth run crosses the
        // walls of that run by design, and leaves its wall's ends standing past its own.
        const run = span.from < -overrun || span.to > axis.length + overrun ? (openingReach(walls, opening, wall) ?? []).map((stretch) => stretch.wall.id) : []

        if (wall.virtual && opening.type !== 'opening') {
          issues.push(
            warning(
              'opening',
              opening.id,
              'opening/on-dividing-line',
              said(opening.type === 'door' ? 'issue.opening/on-dividing-line.door' : 'issue.opening/on-dividing-line', { opening: what, line: name(wall.id) }),
              [wall.id]
            )
          )
        }

        if (run.length <= 1 && span.from <= overrun && span.to >= axis.length - overrun) {
          issues.push(
            warning(
              'opening',
              opening.id,
              'opening/fills-wall',
              said('issue.opening/fills-wall', { opening: what, wall: name(wall.id), length: num(metresText(axis.length)) }),
              [wall.id]
            )
          )
          continue
        }

        for (const cover of here) {
          // A wall met past an end that the run carries the opening over is met beyond the joint.
          if (run.includes(cover.wall) || (run.length > 1 && (cover.at <= overrun || cover.at >= axis.length - overrun))) continue
          // Past its wall's ends it is the next walls' to cut: here, only its own wall's stretch.
          const [from, to] = run.length > 1 ? [Math.max(span.from, 0), Math.min(span.to, axis.length)] : [span.from, span.to]
          const into = Math.min(to, cover.to) - Math.max(from, cover.from)
          if (!(into > overrun)) continue
          // A wall no higher than the sill stands under the window, not across it.
          if (cover.height <= opening.sill + overrun) continue
          if (cover.how === 'end') {
            // A wall whose centre line meets this one at a jamb makes that jamb (ARE-32): the
            // opening is as wide as the space between the walls that frame it.
            if (Math.abs(cover.at - span.from) <= overrun || Math.abs(cover.at - span.to) <= overrun) continue
            issues.push(
              warning(
                'wall',
                cover.wall,
                'wall/ends-in-opening',
                said('issue.wall/ends-in-opening', {
                  wall: name(cover.wall),
                  on: name(wall.id),
                  // As the line has always written it: the opening's id in small letters.
                  inside: said(`issue.part.inside.${opening.type}`, { id: name(opening.id.toLowerCase()) }),
                  from: num(metresText(span.from)),
                  to: num(metresText(span.to)),
                  it: said(`issue.part.the.${opening.type}`)
                }),
                [opening.id, wall.id]
              )
            )
          } else {
            issues.push(
              warning(
                'opening',
                opening.id,
                'opening/crosses-wall',
                said('issue.opening/crosses-wall', {
                  opening: what,
                  wall: name(wall.id),
                  into: num(metresText(into)),
                  other: name(cover.wall),
                  fits: whereItFits(axis.length, here, opening.width, (span.from + span.to) / 2)
                }),
                [cover.wall, wall.id]
              )
            )
          }
        }

        if (opening.type === 'window' && !wall.virtual) {
          const sides = wallSides(index, wall.id)
          // A wall stated as outside is kept so (MSG-13), and a window in it is what was meant:
          // onto a light well drawn as a room, say.
          const left = new Set<string>()
          const right = new Set<string>()
          for (const stretch of sides && sides.exposure !== 'exterior' ? sides.stretches : []) {
            if (!(Math.min(span.to, stretch.to) - Math.max(span.from, stretch.from) > overrun)) continue
            stretch.left.forEach((room) => left.add(room))
            stretch.right.forEach((room) => right.add(room))
          }
          const a = [...left][0]
          const b = [...right].find((room) => room !== a)
          if (a !== undefined && b !== undefined) {
            issues.push(
              warning(
                'opening',
                opening.id,
                'opening/window-between-rooms',
                said('issue.opening/window-between-rooms', { opening: what, wall: name(wall.id), a: name(a), b: name(b) }),
                [wall.id, a, b]
              )
            )
          }
        }
      }
    }
  }
  return issues
}

/**
 * Whether a wall `thickness` thick ending on wall `wallId` at `s` along it stays clear of that
 * wall's openings, for the edit commands (WRT-3). Null when it is clear; otherwise the opening it
 * would land in and the nearest place along the wall where it would not.
 */
export function wallEndInOpening(
  index: PlanIndex,
  wallId: string,
  s: number,
  thickness: number
): { readonly opening: Opening; readonly nearest: number | null } | null {
  const wall = index.wallsById.get(wallId)
  if (!wall) return null
  const axis = courseOf(wall)
  if (!axis) return null
  const halfWidth = thickness / 2
  const overrun = tolerance('openingOverrun')
  const spans = openingsOf(index, wallId).map(openingSpan)
  const hit = spans.find((span) => Math.min(span.to, s + halfWidth) - Math.max(span.from, s - halfWidth) > overrun)
  if (!hit) return null
  // The places the wall's middle may stand: the clear runs between openings, less half its thickness.
  const places = clearRuns(axis.length, spans)
    .map((run) => ({ from: run.from + halfWidth, to: run.to - halfWidth }))
    .filter((run) => run.to >= run.from)
  const nearest = places
    .map((run) => Math.min(Math.max(s, run.from), run.to))
    .reduce<number | null>((best, at) => (best === null || Math.abs(at - s) < Math.abs(best - s) ? at : best), null)
  return { opening: hit.opening, nearest }
}

