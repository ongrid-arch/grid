/**
 * WRT-86: a curved wall's figures, as a comparison says them before and after: its radius, its
 * sweep in degrees (counter-clockwise positive) and its bulge, as Grid reads one in a raw wall
 * (WRT-82) and CAD stores it: the tangent of a quarter of the sweep, its sign the side it bows
 * to. A whole circle has no bulge. A curve bent the other way keeps its radius and turns its
 * bulge and sweep round, so a change that left the radius alone still has figures to say.
 *
 * Pure: a wall in, plain data out.
 */
import type { Wall } from '../plan'
import { wallCurve } from '../arc'
import { fixedText, metresText } from '../rounding'
import { num, said, type Said, type Value } from '../../messages/say'

export interface CurveFigures {
  /** Metres, from the centre to the wall's start. */
  readonly radius: number
  /** Degrees it turns from start to end, counter-clockwise positive. */
  readonly sweep: number
  /** The tangent of a quarter of the sweep; null for a whole circle. */
  readonly bulge: number | null
}

/** A curved wall's figures, null for a straight one or a curve that cannot be worked out. */
export function curveFigures(wall: Wall): CurveFigures | null {
  const curve = wallCurve(wall)
  if (curve === null) return null
  return { radius: curve.radius, sweep: (curve.sweep * 180) / Math.PI, bulge: curve.closed ? null : Math.tan(curve.sweep / 4) }
}

const degreesText = (value: number): string => fixedText(value, 1).replace(/\.0$/, '')
const bulgeSaid = (value: number | null): Value => (value === null ? said('diff.curve.circle') : num(fixedText(value, 3)))

/** Whether two curves differ as the comparison says them, at the figures it prints. */
export function curvesDiffer(a: CurveFigures, b: CurveFigures): boolean {
  return metresText(a.radius) !== metresText(b.radius) || degreesText(a.sweep) !== degreesText(b.sweep)
}

/**
 * A wall's curve before and after in words: made curved, made straight or curved another way,
 * with its figures. Null when neither version is curved.
 */
export function curveChangeSaid(before: CurveFigures | null, after: CurveFigures | null): Said | null {
  if (before === null && after === null) return null
  if (before === null) return said('diff.curve.made', { radius: num(metresText(after!.radius)), bulge: bulgeSaid(after!.bulge), sweep: num(degreesText(after!.sweep)) })
  if (after === null) return said('diff.curve.straightened', { radius: num(metresText(before.radius)), bulge: bulgeSaid(before.bulge), sweep: num(degreesText(before.sweep)) })
  return said('diff.curve.changed', {
    radiusBefore: num(metresText(before.radius)),
    radiusAfter: num(metresText(after.radius)),
    bulgeBefore: bulgeSaid(before.bulge),
    bulgeAfter: bulgeSaid(after.bulge),
    sweepBefore: num(degreesText(before.sweep)),
    sweepAfter: num(degreesText(after.sweep))
  })
}
