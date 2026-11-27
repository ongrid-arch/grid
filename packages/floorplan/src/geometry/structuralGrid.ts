/**
 * Structural grids (CNT-16, C25; lab EL-6): a named grid's lines, worked out from where it is set
 * out, its turn and the spacing of each set, with their names and the dimensions between them.
 *
 * A grid's `x` lines run along its own y, each the set's spacing past the one before; its `y`
 * lines run along its own x. Each line runs `gridOverrun` past the outermost line across it, and
 * its name is written there, at both ends. Unnamed, x lines are numbered 1, 2, 3 and y lines
 * lettered A, B, C (then AA, AB). The spacing is dimensioned along the ends of each set's lines
 * at their start, line to line, and in all along their other ends when the set has three lines or
 * more. A grid is drawn only: it is in no measure, check or count, and places nothing.
 *
 * Pure: a plan in, lines and dimensions out.
 */

import { FULL_TURN, type GridLines, type StructuralGrid } from '../types/floorplan'
import type { FloorPlan } from './plan'
import type { Dimension } from './dimensions'
import { isFloorSlice, planFloors } from './floors'
import { limit } from './tolerances'
import type { Vec2 } from './vec2'
import { english, name, said } from '../messages/say'
import { withSaid } from './issueWords'
import { likelyId } from '../types/nearest'
import type { Issue } from './validate'

export type { GridLines, StructuralGrid } from '../types/floorplan'

/** One line of a grid, ready to draw: its name and its two ends, beyond which its name is written. */
export interface PlanGridLine {
  readonly name: string
  /** Which set it is of: `x` lines run along the grid's y, `y` lines along its x. */
  readonly set: 'x' | 'y'
  readonly from: Vec2
  readonly to: Vec2
  /** The way from `to` to `from`'s side, a unit vector: past `from` its name is written, and past `to`. */
  readonly along: Vec2
  /** WRT-83: a radial grid's ring, the points it is drawn through from `from` to `to`; a straight line has none. */
  readonly path?: readonly Vec2[]
  /** WRT-83: the way out past `to`, when it is not the way back along `along` (a ring's end). */
  readonly outTo?: Vec2
  /** WRT-83: the name is written past `from` only (a ray, at its outer end; a whole ring, once). */
  readonly namedAt?: 'from'
}

/** A grid, ready to draw. */
export interface PlanGrid {
  readonly id: string
  readonly name: string | null
  readonly lines: readonly PlanGridLine[]
  /** WRT-83: a radial grid's centre, its rings' radii and its rays' angles in degrees. */
  readonly polar?: { readonly centre: Vec2; readonly rings: readonly number[]; readonly rays: readonly number[] }
}

/** The name of a y line by its place in its set: A to Z, then AA, AB and on. */
export function gridLetter(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** Where each line of a set lies along the grid's axis, from 0. */
function positions(set: GridLines): number[] {
  const out = [0]
  for (const step of set.spacing) out.push(out[out.length - 1]! + step)
  return out
}

/** The names of a set's lines: its own, else numbers (x) or letters (y). */
export function gridLineNames(set: GridLines, which: 'x' | 'y'): string[] {
  const count = set.spacing.length + 1
  if (set.names !== undefined && set.names.length === count) return set.names.map((value) => value.trim())
  return Array.from({ length: count }, (_, i) => (which === 'x' ? String(i + 1) : gridLetter(i)))
}

/** A grid's own axes: `ex` along its x, `ey` along its y. */
function axesOf(grid: StructuralGrid): { o: Vec2; ex: Vec2; ey: Vec2 } {
  const turn = ((grid.turn ?? 0) * Math.PI) / 180
  return {
    o: { x: grid.origin[0], y: grid.origin[1] },
    ex: { x: Math.cos(turn), y: Math.sin(turn) },
    ey: { x: -Math.sin(turn), y: Math.cos(turn) },
  }
}

const at = (o: Vec2, ex: Vec2, u: number, ey: Vec2, v: number): Vec2 => ({ x: o.x + ex.x * u + ey.x * v, y: o.y + ex.y * u + ey.y * v })

/** WRT-83: a radial grid's rays' angles in degrees and its rings' radii, each in order. */
export function polarLines(grid: StructuralGrid): { rays: number[]; rings: number[] } {
  const turn = grid.turn ?? 0
  return { rays: positions(grid.x).map((a) => turn + a), rings: positions(grid.y).map((r) => (grid.polar?.radius ?? 0) + r) }
}

/** WRT-83: the point at `radius` from `centre` at `degrees`, counter-clockwise from east. */
const onRing = (centre: Vec2, radius: number, degrees: number): Vec2 => {
  const a = (degrees * Math.PI) / 180
  return { x: centre.x + radius * Math.cos(a), y: centre.y + radius * Math.sin(a) }
}

/** WRT-83: a way at `degrees`, counter-clockwise from east, as a unit vector. */
const way = (degrees: number): Vec2 => onRing({ x: 0, y: 0 }, 1, degrees)

/** WRT-83: the points of an arc of `radius` from `from` degrees through `sweep`, a piece every `gridArcStep` degrees at most. */
function arcPoints(centre: Vec2, radius: number, from: number, sweep: number): Vec2[] {
  const pieces = Math.max(2, Math.ceil(Math.abs(sweep) / limit('gridArcStep')))
  return Array.from({ length: pieces + 1 }, (_, i) => onRing(centre, radius, from + (sweep * i) / pieces))
}

/**
 * WRT-83: whether a radial grid's rays go all the way round: the gap from its last ray back to
 * its first is no wider than its widest gap between rays. Its rings are then whole circles.
 */
export function polarWhole(grid: StructuralGrid): boolean {
  if (grid.x.spacing.length < 2) return false
  const spread = grid.x.spacing.reduce((sum, step) => sum + step, 0)
  return FULL_TURN - spread <= Math.max(...grid.x.spacing)
}

/**
 * WRT-83: a radial grid's lines: its rays from inside its first ring to past its last, named at
 * their outer end; its rings as arcs from before its first ray to past its last, named at both
 * ends, or as whole circles named once in the gap after the last ray.
 */
function planPolarGrid(grid: StructuralGrid): PlanGrid {
  const centre = { x: grid.origin[0], y: grid.origin[1] }
  const { rays, rings } = polarLines(grid)
  const run = limit('gridOverrun')
  const inner = rings[0]!
  const outer = rings[rings.length - 1]!
  const rayNames = gridLineNames(grid.x, 'x')
  const ringNames = gridLineNames(grid.y, 'y')
  const whole = polarWhole(grid)
  const first = rays[0]!
  const last = rays[rays.length - 1]!
  const lines: PlanGridLine[] = rays.map((angle, i) => ({
    name: rayNames[i]!,
    set: 'x',
    from: onRing(centre, outer + run, angle),
    to: onRing(centre, Math.max(0, inner - run), angle),
    along: way(angle),
    namedAt: 'from',
  }))
  for (const [j, radius] of rings.entries()) {
    if (whole) {
      const at = last + (FULL_TURN - (last - first)) / 2
      const path = arcPoints(centre, radius, at, FULL_TURN)
      lines.push({ name: ringNames[j]!, set: 'y', from: path[0]!, to: path[0]!, along: way(at), path, namedAt: 'from' })
      continue
    }
    // Past the end rays by the overrun, measured along the ring, short of closing it.
    const past = Math.min((run / radius) * (180 / Math.PI), (FULL_TURN - (last - first)) / 2 - limit('gridArcStep') / 2)
    const start = first - Math.max(0, past)
    const sweep = last - first + 2 * Math.max(0, past)
    const path = arcPoints(centre, radius, start, sweep)
    const end = start + sweep
    lines.push({ name: ringNames[j]!, set: 'y', from: path[0]!, to: path[path.length - 1]!, along: way(start - 90), outTo: way(end + 90), path })
  }
  return { id: grid.id, name: grid.name ?? null, lines, polar: { centre, rings, rays } }
}

/** A grid's lines, x lines first, each in order. WRT-83: a radial grid's rays, then its rings. */
export function planGrid(grid: StructuralGrid): PlanGrid {
  if (grid.polar !== undefined) return planPolarGrid(grid)
  const { o, ex, ey } = axesOf(grid)
  const xs = positions(grid.x)
  const ys = positions(grid.y)
  const run = limit('gridOverrun')
  const xNames = gridLineNames(grid.x, 'x')
  const yNames = gridLineNames(grid.y, 'y')
  const lines: PlanGridLine[] = [
    ...xs.map((u, i): PlanGridLine => ({
      name: xNames[i]!,
      set: 'x',
      from: at(o, ex, u, ey, ys[0]! - run),
      to: at(o, ex, u, ey, ys[ys.length - 1]! + run),
      along: { x: -ey.x, y: -ey.y },
    })),
    ...ys.map((v, j): PlanGridLine => ({
      name: yNames[j]!,
      set: 'y',
      from: at(o, ex, xs[0]! - run, ey, v),
      to: at(o, ex, xs[xs.length - 1]! + run, ey, v),
      along: { x: -ex.x, y: -ex.y },
    })),
  ]
  return { id: grid.id, name: grid.name ?? null, lines }
}

/** The grids drawn on a floor: each that names it, or names no floor. On a plan that is no slice, `floor` is null: the grids that name none. */
export function gridsOn(plan: FloorPlan, floor: string | null): StructuralGrid[] {
  return (plan.grids ?? []).filter((grid) => grid.floors === undefined || (floor !== null && grid.floors.includes(floor)))
}

/**
 * The dimensions of a grid drawn: for each set, line to line along the ends at its lines' start,
 * and from its first line to its last along their other ends when it has three lines or more. Each
 * measures to the lines' centre lines, and lies on their ends.
 */
export function gridDimensions(grid: PlanGrid): Dimension[] {
  const out: Dimension[] = []
  if (grid.polar !== undefined) return polarDimensions(grid, grid.polar)
  for (const set of ['x', 'y'] as const) {
    const lines = grid.lines.filter((line) => line.set === set)
    if (lines.length < 2) continue
    const dim = (id: string, a: Vec2, b: Vec2, normal: Vec2): Dimension => ({
      id,
      kind: 'grid',
      from: a,
      to: b,
      value: Math.hypot(b.x - a.x, b.y - a.y),
      normal,
      offset: 0,
      labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      measuredTo: ['centre-line', 'centre-line'],
    })
    const out1 = lines[0]!.along
    for (let i = 0; i + 1 < lines.length; i++) {
      out.push(dim(`grid:${grid.id}:${set}:${lines[i]!.name}-${lines[i + 1]!.name}`, lines[i]!.from, lines[i + 1]!.from, out1))
    }
    if (lines.length >= 3) {
      const first = lines[0]!
      const last = lines[lines.length - 1]!
      out.push(dim(`grid:${grid.id}:${set}:overall`, first.to, last.to, { x: -out1.x, y: -out1.y }))
    }
  }
  return out
}

/**
 * WRT-83: a radial grid's dimensions: ring to ring along its first ray, on the side its rays do
 * not turn to. Its rays' angles are written as its names are, not dimensioned.
 */
function polarDimensions(grid: PlanGrid, polar: NonNullable<PlanGrid['polar']>): Dimension[] {
  const angle = polar.rays[0]!
  const out = way(angle - 90)
  const names = grid.lines.filter((line) => line.set === 'y').map((line) => line.name)
  const dims: Dimension[] = []
  for (let j = 0; j + 1 < polar.rings.length; j++) {
    const a = onRing(polar.centre, polar.rings[j]!, angle)
    const b = onRing(polar.centre, polar.rings[j + 1]!, angle)
    dims.push({
      id: `grid:${grid.id}:y:${names[j]}-${names[j + 1]}`,
      kind: 'grid',
      from: a,
      to: b,
      value: polar.rings[j + 1]! - polar.rings[j]!,
      normal: out,
      offset: 0,
      labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      measuredTo: ['centre-line', 'centre-line'],
    })
  }
  return dims
}

/** WRT-83: where two lines of a grid cross: their names, the point, and the way its x line runs (degrees). */
export interface GridCrossing {
  readonly x: string
  readonly y: string
  readonly at: Vec2
  /** A straight grid's turn; a radial grid's ray's angle. */
  readonly turn: number
}

/** WRT-83: every crossing of a grid's lines, y line by y line (ring by ring), x line by x line (ray by ray). */
export function gridCrossings(grid: StructuralGrid): GridCrossing[] {
  const xNames = gridLineNames(grid.x, 'x')
  const yNames = gridLineNames(grid.y, 'y')
  const out: GridCrossing[] = []
  if (grid.polar !== undefined) {
    const centre = { x: grid.origin[0], y: grid.origin[1] }
    const { rays, rings } = polarLines(grid)
    rings.forEach((radius, j) => rays.forEach((angle, i) => out.push({ x: xNames[i]!, y: yNames[j]!, at: onRing(centre, radius, angle), turn: angle })))
    return out
  }
  const { o, ex, ey } = axesOf(grid)
  const xs = positions(grid.x)
  positions(grid.y).forEach((v, j) => xs.forEach((u, i) => out.push({ x: xNames[i]!, y: yNames[j]!, at: at(o, ex, u, ey, v), turn: grid.turn ?? 0 })))
  return out
}

/**
 * What the drawing's check says about the grids (CNT-16): a floor a grid names that the plan does
 * not have. Worth a look: the grid is drawn on the floors it names that the plan has. Run on the
 * whole plan only.
 */
export function gridIssues(plan: FloorPlan): Issue[] {
  if (isFloorSlice(plan) || (plan.grids ?? []).length === 0) return []
  const floorIds = planFloors(plan).map((floor) => floor.id)
  const issues: Issue[] = []
  for (const grid of plan.grids ?? []) {
    for (const floor of grid.floors ?? []) {
      if (floorIds.includes(floor)) continue
      const meant = likelyId(floor, floorIds)
      const values = { grid: name(grid.name ?? grid.id), floor: name(floor) }
      const sentence = meant === null ? said('issue.plan/grid-unknown-floor', values) : said('issue.plan/grid-unknown-floor.meant', { ...values, meant: name(meant) })
      issues.push(withSaid({ entity: 'plan', id: grid.id, code: 'plan/grid-unknown-floor', message: english(sentence), severity: 'warning' }, sentence))
    }
  }
  return issues
}
