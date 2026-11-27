/**
 * Curved walls (CNT-18, C21).
 *
 * A wall may be an arc of a circle: the plan states its `centre` and the `sweep` it turns
 * through from `start` to `end`. The curve is the wall's axis, and every length along a curved
 * wall (its length, an opening's `offset` and `width`, a part's `from` and `to`) is measured
 * along it, as C2 measures them along a straight wall's axis.
 *
 * Here the curve is worked out once from what the plan states, and turned into what the rest of
 * the geometry needs: a point and a direction at any distance along it, and the stations a chain
 * of straight pieces follows it by. The pieces stand at most `arcSagitta` off the curve and turn
 * at most `arcStep` each, so a room traced along them measures within a few hundredths of a
 * percent of its true area; never more than `arcPiecesMost` of them.
 */

import type { Wall } from './plan'
import type { Vec2 } from './vec2'
import { limit, tolerance } from './tolerances'
import { metresText } from './rounding'
import { name, num, said, type Said, type Value } from '../messages/say'
import { pointSaid } from './issueWords'

/** A curved wall's arc, worked out from the plan. */
export interface WallCurve {
  readonly centre: Vec2
  /** From the centre to `start`. */
  readonly radius: number
  /** Radians, counter-clockwise from +X: where `start` lies seen from the centre. */
  readonly startAngle: number
  /** Radians the wall turns through from `start` to `end`: counter-clockwise positive, its size in (0, 2π]. */
  readonly sweep: number
  /** Along the curve, in metres. */
  readonly length: number
  /** A whole circle: `start` and `end` are one point and the wall has no ends. */
  readonly closed: boolean
}

const TURN = 2 * Math.PI

const curves = new WeakMap<object, WallCurve | null>()

/**
 * The arc of a curved wall, or null for a straight one. The sweep taken is the one that brings
 * `start` round to where `end` lies, the stated way round; of a sweep near nothing and a whole
 * turn, the one nearer the stated sweep. Whether the end lies on the circle is `curveFault`'s.
 */
export function wallCurve(wall: Wall): WallCurve | null {
  if (wall.arc === undefined) return null
  const known = curves.get(wall)
  if (known !== undefined) return known
  const curve = workOut(wall)
  curves.set(wall, curve)
  return curve
}

function workOut(wall: Wall): WallCurve | null {
  const arc = wall.arc!
  const centre = { x: arc.centre[0], y: arc.centre[1] }
  const radius = Math.hypot(wall.start[0] - centre.x, wall.start[1] - centre.y)
  if (!Number.isFinite(radius)) return null
  const startAngle = Math.atan2(wall.start[1] - centre.y, wall.start[0] - centre.x)
  const endAngle = Math.atan2(wall.end[1] - centre.y, wall.end[0] - centre.x)
  const stated = (arc.sweep * Math.PI) / 180
  const sign = stated >= 0 ? 1 : -1
  const turn = ((((endAngle - startAngle) * sign) % TURN) + TURN) % TURN
  const candidates = [turn, turn + TURN].filter((t) => t > tolerance('sameAngle') && t <= TURN + tolerance('sameAngle'))
  const size = Math.min(TURN, candidates.reduce((best, t) => (Math.abs(t - Math.abs(stated)) < Math.abs(best - Math.abs(stated)) ? t : best), candidates[0] ?? TURN))
  const closed = TURN - size <= tolerance('sameAngle')
  const sweep = sign * (closed ? TURN : size)
  return { centre, radius, startAngle, sweep, length: radius * Math.abs(sweep), closed }
}

/** Where the curve is `s` metres along it from `start`. Any `s`: a whole circle carries on round. */
export function curvePointAt(curve: WallCurve, s: number): Vec2 {
  const angle = curve.startAngle + (Math.sign(curve.sweep) * s) / curve.radius
  return { x: curve.centre.x + curve.radius * Math.cos(angle), y: curve.centre.y + curve.radius * Math.sin(angle) }
}

/**
 * How far along the curve from `start` a point lies, seen from the centre: the curve's own
 * distance for a point on it. A point off the ends of an open curve is taken to the nearer end.
 */
export function curveAlong(curve: WallCurve, p: Vec2): number {
  const angle = Math.atan2(p.y - curve.centre.y, p.x - curve.centre.x)
  const turned = ((((angle - curve.startAngle) * Math.sign(curve.sweep)) % TURN) + TURN) % TURN
  const s = turned * curve.radius
  if (s <= curve.length || curve.closed) return Math.min(s, curve.length)
  // Past the end: the nearer of the two ends, round the gap.
  return s - curve.length < (TURN - turned) * curve.radius ? curve.length : 0
}

/**
 * The curve's furthest points to the right, up, to the left and down, those of them that lie on
 * it (CNT-30). With its two ends they bound it, where its stations alone may cut a bulge off.
 */
export function curveExtremes(curve: WallCurve): Vec2[] {
  const out: Vec2[] = []
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2
    const turned = ((((angle - curve.startAngle) * Math.sign(curve.sweep)) % TURN) + TURN) % TURN
    if (!curve.closed && turned * curve.radius > curve.length) continue
    out.push({ x: curve.centre.x + curve.radius * Math.cos(angle), y: curve.centre.y + curve.radius * Math.sin(angle) })
  }
  return out
}

/** The unit direction the curve runs in, `s` metres along it. */
export function curveTangentAt(curve: WallCurve, s: number): Vec2 {
  const sign = Math.sign(curve.sweep)
  const angle = curve.startAngle + (sign * s) / curve.radius
  return { x: -sign * Math.sin(angle), y: sign * Math.cos(angle) }
}

/** How many straight pieces the curve is followed by (see the header). */
export function curvePieceCount(curve: WallCurve): number {
  const sagitta = tolerance('arcSagitta')
  const bySagitta = sagitta >= curve.radius ? Math.PI : 2 * Math.acos(1 - sagitta / curve.radius)
  const step = Math.min(tolerance('arcStep'), bySagitta)
  const fewest = curve.closed ? 3 : 1
  return Math.max(fewest, Math.min(limit('arcPiecesMost'), Math.ceil(Math.abs(curve.sweep) / step)))
}

/**
 * The most a curved wall's straight pieces stand off its curve, on its outer face, in metres:
 * what a file that writes it as pieces is off by. 0 for a straight wall.
 */
export function curveDeviation(wall: Wall): number {
  const curve = wallCurve(wall)
  if (curve === null || curveFault(wall) !== null) return 0
  const half = wall.virtual === true ? 0 : wall.thickness / 2
  const turn = Math.abs(curve.sweep) / curvePieceCount(curve)
  return (curve.radius + half) * (1 - Math.cos(turn / 2))
}

/** The distances along the curve its straight pieces meet at, from 0 to its length. */
export function curveStations(curve: WallCurve): number[] {
  const n = curvePieceCount(curve)
  return Array.from({ length: n + 1 }, (_, i) => (i === n ? curve.length : (curve.length * i) / n))
}

/**
 * The stations strictly between `from` and `to` (which may run past the length round a whole
 * circle), with `from` and `to` themselves: the curve between them, piece by piece. A station
 * nearer than a quarter of a piece to either end is dropped, so no piece is a sliver.
 */
export function curveStationsBetween(curve: WallCurve, from: number, to: number): number[] {
  const n = curvePieceCount(curve)
  const step = curve.length / n
  const out = [from]
  const first = Math.floor(from / step) + 1
  for (let i = first; i * step < to; i++) {
    const s = i * step
    if (s - from < step / 4 || to - s < step / 4) continue
    out.push(s)
  }
  out.push(to)
  return out
}

/** A length in a message, to the millimetre, as a figure the language writes with its decimal mark. */
const m3 = (value: number): Value => num(metresText(value, 3))

/** Degrees, for a message: to a tenth. */
const degrees = (radians: number): Value => num(String(Math.round((radians * 180) / Math.PI * 10) / 10))

/** A point in a message, to the millimetre. */
const at = (x: number, y: number): Said => pointSaid(metresText(x, 3), metresText(y, 3))

/**
 * Why a curved wall cannot be built, or null when it can: a radius of nothing or no more than
 * half its thickness (its inside face would have none), or an end that does not lie where the
 * sweep takes its start, within `arcEnds`. MSG-11: the sentence is said by key
 * (`issue.wall/arc-…`), in the person's language.
 */
export function curveFault(wall: Wall): { readonly code: 'wall/arc-too-tight' | 'wall/arc-ends-apart'; readonly said: Said } | null {
  if (wall.arc === undefined) return null
  const curve = wallCurve(wall)
  const id = name(wall.id)
  if (curve === null || curve.radius <= tolerance('noLength')) {
    return { code: 'wall/arc-too-tight', said: said('issue.wall/arc-too-tight.noRadius', { wall: id }) }
  }
  const half = wall.virtual ? 0 : wall.thickness / 2
  if (curve.radius <= half) {
    return { code: 'wall/arc-too-tight', said: said('issue.wall/arc-too-tight', { wall: id, radius: m3(curve.radius), thickness: m3(wall.thickness), half: m3(half) }) }
  }
  const stated = (wall.arc.sweep * Math.PI) / 180
  const endRadius = Math.hypot(wall.end[0] - curve.centre.x, wall.end[1] - curve.centre.y)
  const along = Math.abs(Math.abs(curve.sweep) - Math.abs(stated)) * curve.radius
  const apart = Math.max(Math.abs(endRadius - curve.radius), along)
  if (apart > tolerance('arcEnds')) {
    const meant = curvePointAt({ ...curve, sweep: stated }, curve.radius * Math.abs(stated))
    const words = {
      wall: id,
      sweep: degrees(stated),
      centre: at(curve.centre.x, curve.centre.y),
      meant: at(meant.x, meant.y),
      end: at(wall.end[0], wall.end[1]),
      apart: m3(apart),
    }
    // WRT-82: an end on the circle is reached by a sweep one way round or the other: named, to copy.
    const onCircle = Math.abs(endRadius - curve.radius) <= tolerance('arcEnds')
    if (!onCircle) return { code: 'wall/arc-ends-apart', said: said('issue.wall/arc-ends-apart', words) }
    return { code: 'wall/arc-ends-apart', said: said('issue.wall/arc-ends-apart.reach', { ...words, reach: num(sweepText(reachingSweep(curve, wall, stated))) }) }
  }
  return null
}

/**
 * WRT-82: the sweep in degrees that takes `start` round to where `end` lies seen from the centre,
 * counter-clockwise or clockwise, whichever is nearer the stated sweep's size (so a sweep given
 * with the wrong sign, or in radians, is answered with the one meant).
 */
function reachingSweep(curve: WallCurve, wall: Wall, stated: number): number {
  const endAngle = Math.atan2(wall.end[1] - curve.centre.y, wall.end[0] - curve.centre.x)
  const left = (((endAngle - curve.startAngle) % TURN) + TURN) % TURN
  const ways = left <= tolerance('sameAngle') ? [TURN, -TURN] : [left, left - TURN]
  const best = ways.reduce((a, b) => (Math.abs(Math.abs(b) - Math.abs(stated)) < Math.abs(Math.abs(a) - Math.abs(stated)) ? b : a))
  return (best * 180) / Math.PI
}

/** A sweep to copy into a plan: signed, to four decimals of a degree, so its end lands within `arcEnds` on any building's radius. */
const sweepText = (deg: number): string => {
  const text = String(Math.round(deg * 1e4) / 1e4)
  return deg > 0 ? `+${text}` : text
}
