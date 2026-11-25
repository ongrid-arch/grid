/**
 * VEW-11: a stair as a section cuts it, the way a stair is built.
 *
 * A flight is a sloped slab with steps on it: along the flight, from its foot, its top steps up
 * one riser at each riser line, and its underside, the soffit, runs parallel to the slope, one
 * waist below the roots of the steps (where each tread meets the riser above it), the waist
 * measured square to the slope. The soffit never runs below what the flight rises from: the floor
 * the stair starts on, or the underside of the landing below it. A landing is a level slab under
 * its floor, never solid down to the floor the stair leaves.
 *
 * Heights are in metres from the ground floor's floor level, as the section's are. The waist is
 * Grid's own drawing figure (`stairWaist`): the plan states none.
 */

import type { StairFlight, StairLayout } from './stairs'
import { limit, tolerance } from './tolerances'
import type { Vec2 } from './vec2'

/** A flight's profile along it: `s` in metres from its foot, along its walking line. */
export interface FlightProfile {
  /** The flight's length on plan, from its first riser line to its last. */
  readonly length: number
  /** The tread's top over `s`: one riser higher past each riser line. */
  topAt(s: number): number
  /** The soffit under `s`, never below the foot. */
  bottomAt(s: number): number
  /** Where along the flight its outline changes: the riser lines and the soffit's kink at the foot. */
  readonly breaks: readonly number[]
  /** The level of the floor or landing the flight rises from, and of the one it rises to. */
  readonly lower: number
  readonly upper: number
}

/** The waist of every flight and the thickness of every landing, in metres. */
export function stairWaist(): number {
  return limit('stairWaist')
}

/** A landing's slab: as thick as the waist, and at least one riser, so the last riser below meets it. */
export function landingThickness(stair: StairLayout): number {
  return Math.max(stairWaist(), stair.riserHeight)
}

/** The top and the underside of a landing, never below the floor the stair starts on. */
export function landingLevels(stair: StairLayout, risersBelow: number): { bottom: number; top: number } {
  const top = stair.lower.level + risersBelow * stair.riserHeight
  return { bottom: Math.max(stair.lower.level, top - landingThickness(stair)), top }
}

export function flightProfile(stair: StairLayout, flight: StairFlight): FlightProfile {
  const riser = stair.riserHeight
  const going = flight.going
  const treads = Math.max(1, flight.riserLines.length - 1)
  const length = going * treads
  const base = stair.lower.level
  const lower = base + flight.risersBelow * riser
  const upper = lower + flight.risers * riser
  // The foot: the floor the stair starts on, or the underside of the landing the flight leaves.
  const foot = flight.risersBelow === 0 ? lower : landingLevels(stair, flight.risersBelow).bottom
  // The soffit drops below the roots of the steps by the waist, measured square to the slope.
  const slope = going > 0 ? riser / going : 0
  const drop = stairWaist() * Math.sqrt(1 + slope * slope)
  const soffit = (s: number): number => lower + s * slope - drop
  const topAt = (s: number): number => {
    const k = going > 0 ? Math.min(treads - 1, Math.max(0, Math.floor(s / going))) : 0
    return lower + (k + 1) * riser
  }
  const breaks: number[] = []
  for (let k = 1; k < treads; k++) breaks.push(k * going)
  if (slope > 0) {
    const kink = (foot - lower + drop) / slope
    if (kink > 0 && kink < length) breaks.push(kink)
  }
  breaks.sort((a, b) => a - b)
  return { length, topAt, bottomAt: (s) => Math.max(foot, soffit(s)), breaks, lower, upper }
}

/**
 * The flight's profile between two places along it, drawn across a section: from `x0` (at `s0`
 * along the flight) to `x1` (at `s1`), `s` changing evenly between. Counter-clockwise, `x` across
 * and `y` up: the soffit from left to right, then the treads and risers back. Where `s` hardly
 * changes (a cut square to the flight), one tread's slice.
 */
export function profileRing(profile: FlightProfile, x0: number, s0: number, x1: number, s1: number, snap: (v: number) => number): Vec2[] {
  const [xa, sa, xb, sb] = x0 <= x1 ? [x0, s0, x1, s1] : [x1, s1, x0, s0]
  const none = tolerance('noLength')
  const xs: number[] = [xa]
  if (Math.abs(sb - sa) > none) {
    const lo = Math.min(sa, sb)
    const hi = Math.max(sa, sb)
    for (const s of profile.breaks) if (s > lo + none && s < hi - none) xs.push(xa + ((s - sa) / (sb - sa)) * (xb - xa))
  }
  xs.push(xb)
  xs.sort((a, b) => a - b)
  const sAt = (x: number): number => (xb - xa > none ? sa + ((x - xa) / (xb - xa)) * (sb - sa) : (sa + sb) / 2)
  const ring: Vec2[] = []
  const put = (x: number, y: number): void => {
    const p = { x: snap(x), y: snap(y) }
    const last = ring[ring.length - 1]
    if (last === undefined || last.x !== p.x || last.y !== p.y) ring.push(p)
  }
  for (const x of xs) put(x, profile.bottomAt(sAt(x)))
  for (let i = xs.length - 1; i > 0; i--) {
    const top = profile.topAt(sAt((xs[i]! + xs[i - 1]!) / 2))
    put(xs[i]!, top)
    put(xs[i - 1]!, top)
  }
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first !== undefined && last !== undefined && first.x === last.x && first.y === last.y) ring.pop()
  return ring
}
