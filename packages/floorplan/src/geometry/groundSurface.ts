/**
 * CNT-49: the ground on a slope.
 *
 * A plan may state the ground round the building in more than one place (C7): at its sides
 * (`site.groundSides`, C4's four sides of the building's extent), as a fall (`site.fall`, a slope
 * in percent toward a compass point of the drawing, through `site.ground`, else 0, at the middle of
 * the building), or along edges of the plot (`site.groundEdges`, the level at each corner of the
 * edge: a street that falls along it). Grid takes the one even slope, a plane over the plan, that
 * fits every stated level best (least squares):
 *
 * - a side is its level at the two ends of that face of the building's extent;
 * - an edge of the plot is its level at its two corners;
 * - `ground`, stated beside a side or an edge, is its level at the middle of the building;
 * - with a fall stated, the slope is the fall's and only the height is fitted;
 * - levels that lie along one line alone leave the ground level across that line.
 *
 * Levels that lie on one even slope are met exactly. When they do not, `offBy` is how far the
 * slope taken is off the furthest of them, and `worst` names it, so it is said, never hidden.
 *
 * A plan that states none of the three has no surface (null): its ground is LVL-4's one level.
 * Pure, and never throws.
 */

import type { FloorPlan } from './plan'
import { planBounds } from './floorplan'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { boundaryEdgeCount, type FallToward } from '../types/floorplan'

/** CNT-49: where a stated level is: a side of the building, an edge of the plot, the fall's middle or the site's ground. */
export type GroundSource = { readonly kind: 'side'; readonly side: 'north' | 'east' | 'south' | 'west' } | { readonly kind: 'edge'; readonly edge: number } | { readonly kind: 'ground' }

/** One stated level at a point of the plan. */
export interface GroundControl {
  readonly at: Vec2
  readonly level: number
  readonly from: GroundSource
}

/** The ground on a slope: a plane over the plan, `level = c + gx * x + gy * y`. */
export interface GroundSurface {
  /** The ground's level at a point of the plan. */
  readonly at: (p: Vec2) => number
  /** How much the ground rises per metre along x and along y. */
  readonly gradient: Vec2
  /** The level at the plan's origin. */
  readonly c: number
  /** The fall, in percent: how steep it is at its steepest. */
  readonly slope: number
  /** The way it falls on the drawing (a unit vector), or null when it is level. */
  readonly toward: Vec2 | null
  /** The lowest and the highest ground under the building's walls. */
  readonly low: number
  readonly high: number
  /** The stated levels it is fitted to. */
  readonly controls: readonly GroundControl[]
  /** How far it is off the furthest stated level, metres; 0 when every one is met. */
  readonly offBy: number
  /** The stated level it is furthest off, when `offBy` is more than nothing. */
  readonly worst: GroundControl | null
}

/** The way each compass point of the drawing lies, north up it (C4). */
const TOWARD: Readonly<Record<FallToward, Vec2>> = {
  north: { x: 0, y: 1 },
  'north-east': { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  east: { x: 1, y: 0 },
  'south-east': { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  south: { x: 0, y: -1 },
  'south-west': { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  west: { x: -1, y: 0 },
  'north-west': { x: -Math.SQRT1_2, y: Math.SQRT1_2 }
}

/** Whether the plan states the ground on a slope at all. */
export function statesSlope(plan: FloorPlan): boolean {
  const site = plan.site
  return site !== undefined && (site.groundSides !== undefined || site.fall !== undefined || (site.groundEdges ?? []).length > 0)
}

/** The building's walls' ends, or the corners of its extent, or the origin. */
function buildingPoints(plan: FloorPlan): Vec2[] {
  const points: Vec2[] = []
  for (const w of plan.walls) {
    for (const p of [w.start, w.end]) if (Number.isFinite(p[0]) && Number.isFinite(p[1])) points.push({ x: p[0], y: p[1] })
  }
  if (points.length > 0) return points
  for (const floor of plan.floors ?? []) for (const p of floor.outline ?? []) points.push({ x: p[0], y: p[1] })
  if (points.length > 0) return points
  for (const p of plan.site?.boundary ?? []) points.push({ x: p[0], y: p[1] })
  return points.length > 0 ? points : [{ x: 0, y: 0 }]
}

function extentOf(plan: FloorPlan): { min: Vec2; max: Vec2 } {
  try {
    const b = planBounds(plan)
    if ([b.min.x, b.min.y, b.max.x, b.max.y].every(Number.isFinite) && b.max.x >= b.min.x && b.max.y >= b.min.y) return { min: b.min, max: b.max }
  } catch {
    // Read from the points below.
  }
  const points = buildingPoints(plan)
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } }
}

/** The stated levels, each at its point of the plan. */
export function groundControls(plan: FloorPlan): GroundControl[] {
  const site = plan.site
  if (site === undefined) return []
  const { min, max } = extentOf(plan)
  const out: GroundControl[] = []
  const sides = site.groundSides
  if (sides !== undefined) {
    const ends: Record<'north' | 'east' | 'south' | 'west', [Vec2, Vec2]> = {
      north: [{ x: min.x, y: max.y }, { x: max.x, y: max.y }],
      east: [{ x: max.x, y: min.y }, { x: max.x, y: max.y }],
      south: [{ x: min.x, y: min.y }, { x: max.x, y: min.y }],
      west: [{ x: min.x, y: min.y }, { x: min.x, y: max.y }]
    }
    for (const side of ['north', 'east', 'south', 'west'] as const) {
      const level = sides[side]
      if (level === undefined || !Number.isFinite(level)) continue
      for (const at of ends[side]) out.push({ at, level, from: { kind: 'side', side } })
    }
  }
  const boundary = site.boundary
  if (boundary !== undefined) {
    const edges = boundaryEdgeCount(boundary)
    for (const g of site.groundEdges ?? []) {
      if (!(g.edge >= 1 && g.edge <= edges)) continue
      const a = boundary[g.edge - 1]!
      const b = boundary[g.edge % edges]!
      out.push({ at: { x: a[0], y: a[1] }, level: g.start, from: { kind: 'edge', edge: g.edge } })
      out.push({ at: { x: b[0], y: b[1] }, level: g.end ?? g.start, from: { kind: 'edge', edge: g.edge } })
    }
  }
  if (site.ground !== undefined && Number.isFinite(site.ground) && (out.length > 0 || site.fall !== undefined)) {
    out.push({ at: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }, level: site.ground, from: { kind: 'ground' } })
  }
  return out
}

/**
 * The gradient that fits the levels best: the least-squares solution of the plane through their
 * mean, the shortest one where they leave it open (levels along one line, or at one point).
 */
function fitGradient(points: readonly GroundControl[], mean: Vec2, level: number): Vec2 {
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sxz = 0
  let syz = 0
  for (const p of points) {
    const dx = p.at.x - mean.x
    const dy = p.at.y - mean.y
    const dz = p.level - level
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
    sxz += dx * dz
    syz += dy * dz
  }
  // The 2 by 2 matrix's eigenvectors, and the part of (sxz, syz) along each kept one.
  const trace = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det))
  const l1 = trace / 2 + disc
  const l2 = trace / 2 - disc
  const small = Math.max(l1, 1) * tolerance('noLength')
  const vector = (l: number): Vec2 => {
    const v = Math.abs(sxy) > tolerance('noLength') ? { x: l - syy, y: sxy } : sxx >= syy ? (l === l1 ? { x: 1, y: 0 } : { x: 0, y: 1 }) : l === l1 ? { x: 0, y: 1 } : { x: 1, y: 0 }
    const n = Math.hypot(v.x, v.y)
    return n === 0 ? { x: 1, y: 0 } : { x: v.x / n, y: v.y / n }
  }
  let g = { x: 0, y: 0 }
  for (const l of [l1, l2]) {
    if (!(l > small)) continue
    const v = vector(l)
    const k = (v.x * sxz + v.y * syz) / l
    g = { x: g.x + k * v.x, y: g.y + k * v.y }
  }
  return g
}

/** CNT-49: the ground on a slope the plan states, or null when it states none. See the module's header. */
export function groundSurface(plan: FloorPlan): GroundSurface | null {
  if (!statesSlope(plan)) return null
  const site = plan.site!
  const controls = groundControls(plan)
  const { min, max } = extentOf(plan)
  const middle = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }
  let gradient: Vec2
  let c: number
  const fall = site.fall
  if (fall !== undefined && Number.isFinite(fall.slope)) {
    const d = TOWARD[fall.toward]
    gradient = { x: (-fall.slope / 100) * d.x + 0, y: (-fall.slope / 100) * d.y + 0 }
    const offsets = controls.map((p) => p.level - (gradient.x * p.at.x + gradient.y * p.at.y))
    c = offsets.length === 0 ? -(gradient.x * middle.x + gradient.y * middle.y) : offsets.reduce((a, b) => a + b, 0) / offsets.length
  } else if (controls.length === 0) {
    gradient = { x: 0, y: 0 }
    c = site.ground ?? 0
  } else {
    const mean = { x: controls.reduce((a, p) => a + p.at.x, 0) / controls.length, y: controls.reduce((a, p) => a + p.at.y, 0) / controls.length }
    const level = controls.reduce((a, p) => a + p.level, 0) / controls.length
    gradient = fitGradient(controls, mean, level)
    c = level - (gradient.x * mean.x + gradient.y * mean.y)
  }
  const at = (p: Vec2): number => c + gradient.x * p.x + gradient.y * p.y
  let offBy = 0
  let worst: GroundControl | null = null
  for (const p of controls) {
    const off = Math.abs(p.level - at(p.at))
    if (off > offBy) {
      offBy = off
      worst = p
    }
  }
  if (!(offBy > tolerance('sameFloorLevel'))) {
    offBy = 0
    worst = null
  }
  const levels = buildingPoints(plan).map(at)
  const steep = Math.hypot(gradient.x, gradient.y)
  return {
    at,
    gradient,
    c,
    slope: steep * 100,
    toward: steep > tolerance('noSlope') ? { x: -gradient.x / steep, y: -gradient.y / steep } : null,
    low: Math.min(...levels),
    high: Math.max(...levels),
    controls,
    offBy,
    worst
  }
}
