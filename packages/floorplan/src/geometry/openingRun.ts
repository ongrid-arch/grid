/**
 * Openings along a smooth run of walls, and along a curve (VEW-77).
 *
 * An opening belongs to one wall (C2), and its `offset` and `width` are measured along that
 * wall's axis. Where the wall carries on past an end into the next one as one smooth run (they
 * meet end to end with no third wall at the joint, turn by no more than `smoothRunTurn` there,
 * and are as thick and as high, both solid or both dividing lines), the opening may carry on
 * across the joint: past its wall's end, its `offset` and `width` are measured on along the run.
 * A curve traced by many short walls, or an oval of four arcs, holds a door wider than any one
 * of them. On a whole circle (a curved wall with no ends) an opening may instead carry on round
 * past the circle's start, which `wallParts` splits on each side of it.
 *
 * Here the run an opening covers is worked out (`openingReach`), and from it what draws the
 * opening: the points of the axis from edge to edge, with the normal at each (`openingAxis`), and
 * the copies of the opening that each further wall of the run cuts its gap for (`runGuests`). A
 * copy keeps the opening's id and its own `wall`, so code that draws an opening once, on its own
 * wall, knows a copy by `opening.wall !== wall.id`. Nothing here changes the plan.
 */

import type { Opening, Wall } from './plan'
import type { Vec2 } from './vec2'
import { distance, dot, normalize, perp, scale, sub, add } from './vec2'
import { tolerance } from './tolerances'
import { floorOf } from './floors'
import { curveStationsBetween, wallCurve } from './arc'
import { openingSpan, wallFrameAt, wallLength, type WallSegment } from './wall'

/** A stretch of one wall an opening covers, in that wall's own terms. */
export interface RunStretch {
  readonly wall: Wall
  /** Along this wall from its start, `from` no more than `to`. */
  readonly from: number
  readonly to: number
  /** The run crosses this wall from its end toward its start. */
  readonly reversed: boolean
}

type End = 'start' | 'end'

const point = (wall: Wall, end: End): Vec2 => {
  const p = end === 'start' ? wall.start : wall.end
  return { x: p[0], y: p[1] }
}

const lengthOf = (wall: Wall): number | null => {
  try {
    const length = wallLength(wall)
    return Number.isFinite(length) && length > tolerance('noLength') ? length : null
  } catch {
    return null
  }
}

/** The way out of `wall` past `end`: along its axis at its end, or back along it at its start. */
function leaving(wall: Wall, end: End, length: number): Vec2 {
  const dir = wallFrameAt(wall, end === 'start' ? 0 : length).dir
  return end === 'start' ? scale(dir, -1) : dir
}

/**
 * The wall that carries `wall` on past `end` as one smooth run, and which of its own ends meets
 * there; null at a corner, a joint three walls meet at, a change of thickness, height or kind of
 * wall, or the end of the run. A whole circle has no ends, so neither carries one on.
 */
export function smoothNext(walls: readonly Wall[], wall: Wall, end: End): { readonly wall: Wall; readonly enters: End } | null {
  if (wallCurve(wall)?.closed === true) return null
  const length = lengthOf(wall)
  if (length === null) return null
  const at = point(wall, end)
  const near = tolerance('joint')
  const meeting: { wall: Wall; enters: End }[] = []
  for (const other of walls) {
    if (other === wall || other.id === wall.id || floorOf(other) !== floorOf(wall)) continue
    for (const side of ['start', 'end'] as const) {
      if (distance(point(other, side), at) <= near) meeting.push({ wall: other, enters: side })
    }
  }
  if (meeting.length !== 1) return null
  const next = meeting[0]!
  const nextLength = lengthOf(next.wall)
  if (nextLength === null || wallCurve(next.wall)?.closed === true) return null
  if ((next.wall.virtual === true) !== (wall.virtual === true)) return null
  const same = tolerance('noLength')
  if (Math.abs(next.wall.thickness - wall.thickness) > same || Math.abs(next.wall.height - wall.height) > same) return null
  // Into the next wall the run goes on along it from the end it enters at.
  const out = leaving(wall, end, length)
  const into = scale(leaving(next.wall, next.enters, nextLength), -1)
  const turn = Math.acos(Math.max(-1, Math.min(1, dot(out, into))))
  return turn <= (tolerance('smoothRunTurn') * Math.PI) / 180 ? next : null
}

/**
 * The stretches of wall an opening covers, in order along it from its near edge: its own wall's,
 * and those of the walls its run carries it onto past either end. Null when it runs past the
 * end of its run (more than `openingOverrun`), or off a wall that cannot be measured. On a whole
 * circle the one stretch is the opening's own span, which may reach round past the start.
 */
export function openingReach(walls: readonly Wall[], opening: Opening, wall: Wall): RunStretch[] | null {
  const length = lengthOf(wall)
  if (length === null) return null
  const span = openingSpan(opening)
  const overrun = tolerance('openingOverrun')
  if (wallCurve(wall)?.closed === true) {
    return span.to - span.from <= length + overrun ? [{ wall, from: span.from, to: span.to, reversed: false }] : null
  }
  const own: RunStretch = { wall, from: Math.max(0, Math.min(span.from, length)), to: Math.min(length, Math.max(span.to, 0)), reversed: false }
  const after = onward(walls, wall, 'end', span.to - length, overrun)
  const before = onward(walls, wall, 'start', -span.from, overrun)
  if (after === null || before === null) return null
  return [...before.reverse(), own, ...after]
}

/**
 * The stretches past `end` of `wall` that `reach` metres of an opening cover, nearest first, in
 * the run's direction away from `wall`; empty when it reaches no further than `overrun`, null
 * when the run ends first.
 */
function onward(walls: readonly Wall[], wall: Wall, end: End, reach: number, overrun: number): RunStretch[] | null {
  const out: RunStretch[] = []
  const seen = new Set<string>([wall.id])
  let left = reach
  let current = wall
  let exit = end
  while (left > overrun) {
    const next = smoothNext(walls, current, exit)
    if (next === null || seen.has(next.wall.id)) return null
    seen.add(next.wall.id)
    const length = lengthOf(next.wall)!
    const take = Math.min(left, length)
    const fromStart = next.enters === 'start'
    // Going on past the end, a wall entered at its start runs the way the opening's wall does;
    // going back past the start, one entered at its end does.
    const reversed = end === 'end' ? !fromStart : fromStart
    out.push({ wall: next.wall, from: fromStart ? 0 : length - take, to: fromStart ? take : length, reversed })
    left -= take
    current = next.wall
    exit = fromStart ? 'end' : 'start'
  }
  return out
}

/** A point of an opening's axis, and the normal there: the side of the opening's own wall's left face. */
export interface AxisPoint {
  readonly point: Vec2
  readonly normal: Vec2
  /** How far along the run it lies, in the opening's own terms: `offset` at its near edge. */
  readonly at: number
}

/** An opening's axis from edge to edge: its points (the curve's stations on a curve) and the straight chord between its edges. */
export interface OpeningAxis {
  readonly points: readonly AxisPoint[]
  readonly chord: WallSegment
  /** It follows a curve or crosses a joint, so it is not the one straight line of its chord. */
  readonly bends: boolean
}

/**
 * The axis of an opening from its near edge to its far one, along its run (`openingReach`), or
 * null when it does not fit its run. On a straight wall it is the two edges; on a curve its
 * stations too, so a line through them stands no further off the curve than the wall's own
 * pieces; across a joint, the joint, where the normal is the mean of the two walls'.
 */
export function openingAxis(walls: readonly Wall[], opening: Opening, wall: Wall): OpeningAxis | null {
  const stretches = openingReach(walls, opening, wall)
  if (stretches === null) return null
  const span = openingSpan(opening)
  const points: AxisPoint[] = []
  const near = tolerance('joint')
  let base = span.from
  for (const stretch of stretches) {
    if (stretch.to - stretch.from <= near) continue
    const curve = wallCurve(stretch.wall)
    const stations = curve === null ? [stretch.from, stretch.to] : curveStationsBetween(curve, stretch.from, stretch.to)
    if (stretch.reversed) stations.reverse()
    for (const s of stations) {
      const frame = wallFrameAt(stretch.wall, s)
      const normal = stretch.reversed ? scale(frame.normal, -1) : frame.normal
      const at = base + (stretch.reversed ? stretch.to - s : s - stretch.from)
      const last = points[points.length - 1]
      if (last !== undefined && distance(last.point, frame.point) <= near) {
        points[points.length - 1] = { point: last.point, normal: normalize(add(last.normal, normal)), at: last.at }
        continue
      }
      points.push({ point: frame.point, normal, at })
    }
    base += stretch.to - stretch.from
  }
  if (points.length < 2) return null
  const start = points[0]!.point
  const end = points[points.length - 1]!.point
  const length = distance(start, end)
  const dir = length === 0 ? { x: 1, y: 0 } : normalize(sub(end, start))
  return {
    points,
    chord: { start, end, dir, normal: perp(dir), length, from: span.from, to: span.to },
    bends: points.length > 2
  }
}

/**
 * The openings that run onto each wall from another wall of its run, each a copy clipped to the
 * stretch of that wall it covers (its `offset` and `width` in that wall's terms), by wall id.
 * They cut the gaps there; the opening is drawn once, on its own wall.
 */
export function runGuests(walls: readonly Wall[], openings: readonly Opening[]): ReadonlyMap<string, readonly Opening[]> {
  const out = new Map<string, Opening[]>()
  const byId = new Map(walls.map((wall) => [wall.id, wall]))
  for (const opening of openings) {
    const wall = byId.get(opening.wall)
    if (wall === undefined) continue
    const length = lengthOf(wall)
    if (length === null || wallCurve(wall)?.closed === true) continue
    const overrun = tolerance('openingOverrun')
    if (opening.offset >= -overrun && opening.offset + opening.width <= length + overrun) continue
    for (const stretch of openingReach(walls, opening, wall) ?? []) {
      if (stretch.wall === wall || stretch.to - stretch.from <= tolerance('noLength')) continue
      const copy: Opening = { ...opening, offset: stretch.from, width: stretch.to - stretch.from }
      const list = out.get(stretch.wall.id)
      if (list === undefined) out.set(stretch.wall.id, [copy])
      else list.push(copy)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.offset - b.offset)
  return out
}

/**
 * A wall's own openings with those that run onto it from its run (`runGuests`), in order along
 * it; where two start at one place, the one that runs on first, so the wall's own is the one an
 * overlap names.
 */
export function openingsCutting(own: readonly Opening[], guests: ReadonlyMap<string, readonly Opening[]>, wallId: string): readonly Opening[] {
  const more = guests.get(wallId)
  if (more === undefined || more.length === 0) return own
  return [...more, ...own].sort((a, b) => a.offset - b.offset)
}
