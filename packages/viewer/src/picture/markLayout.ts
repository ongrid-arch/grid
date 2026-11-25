/**
 * VEW-31: where the dimension chains, the grid bubbles and the view marks of a plan picture stand
 * so that none lies on another. The geometry core gives each chain its line and each grid its
 * ends (`buildDimensions`, `planGrid`); this lays them out against each other, in plan metres,
 * and gives the boxes a mark in pixels keeps off.
 *
 * - A side prints its overall size once: one that repeats another on the same side is dropped.
 * - Chains of one side that lie on each other (two facade lines, a wing and the main walls) are
 *   pushed out, one chain spacing at a time, in order from the building.
 * - A grid's names stand past the outermost chain in their way, and its own spacing chain moves
 *   out with them. A grid with nothing in its way is drawn as the core gives it.
 *
 * Idempotent: laying out what was laid out changes nothing. Pure: no DOM, no React.
 */
import type { Bounds, Dimension, PlanDrawing, Vec2 } from '@ongrid/floorplan/geometry'
import { computeBounds, tolerance } from '@ongrid/floorplan/geometry'
import { dimensionText, dimensionTextBox, lineBox, type Box } from '../canvas2d/labelPlacement'
import { GRID_BUBBLE_PX } from './look'

/** How far apart the chains outside the plan stand, as the core sets them, in metres. */
const CHAIN_SPACING = 0.5
/** Two chains of a side closer than this, over the same stretch, lie on each other. */
const TOO_CLOSE = 0.4
/** How far past the outermost chain in its way a grid's bubbles start, in metres. */
const GRID_GAP = 0.5
/** How far either side of a grid line a chain still stands in the way of its bubble, in metres. */
const LANE = 0.4
/** Stretches that overlap by less than this, in metres, do not overlap. */
const SHARED = 0.05
/** A chain that ends no further than this inside a grid line's end still stands at it, in metres. */
const AT_END = 0.01
/** How long the tick across each end of a drafted dimension is, in pixels (as the picture draws it). */
const TICK_PX = 7

const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const near = (a: Vec2, b: Vec2): boolean => Math.abs(a.x - b.x) < tolerance('joint') && Math.abs(a.y - b.y) < tolerance('joint')

/** A chain outside the plan, not a room's size, a grid's or an opening's inside a wall. */
const outside = (dim: Dimension): boolean => dim.kind !== 'room' && dim.kind !== 'grid' && dim.side !== undefined

function withOffset(dim: Dimension, offset: number): Dimension {
  if (offset === dim.offset) return dim
  const by = offset - dim.offset
  return { ...dim, offset, labelAt: { x: dim.labelAt.x + dim.normal.x * by, y: dim.labelAt.y + dim.normal.y * by } }
}

/** The stretch a dimension covers along its own line, as two distances. */
function stretch(dim: Dimension): [number, number] {
  const along = { x: -dim.normal.y, y: dim.normal.x }
  const a = dot(dim.from, along)
  const b = dot(dim.to, along)
  return [Math.min(a, b), Math.max(a, b)]
}

const shared = (a: [number, number], b: [number, number]): number => Math.min(a[1], b[1]) - Math.max(a[0], b[0])

/** (1) A side's overall size once: the later of two that say the same over the same stretch goes. */
function withoutRepeats(dims: readonly Dimension[]): Dimension[] {
  const kept: Dimension[] = []
  for (const dim of dims) {
    const repeats =
      dim.kind === 'overall' &&
      dim.side !== undefined &&
      kept.some(
        (other) =>
          other.kind === 'overall' &&
          other.side === dim.side &&
          dot(other.normal, dim.normal) > 0.999 &&
          dimensionText(other.value) === dimensionText(dim.value) &&
          shared(stretch(other), stretch(dim)) > Math.min(other.value, dim.value) / 2
      )
    if (!repeats) kept.push(dim)
  }
  return kept
}

interface Chain {
  readonly dims: Dimension[]
  readonly normal: Vec2
  readonly range: [number, number]
  /** How far out along its normal its line stands, in metres. */
  position: number
}

/** (2) Chains of a side that lie on each other are pushed out, nearest the building first. */
function withSeparatedChains(dims: readonly Dimension[]): Dimension[] {
  const byKey = new Map<string, Dimension[]>()
  for (const dim of dims) {
    if (!outside(dim)) continue
    const key = `${dim.chain ?? dim.side}|${dim.kind}`
    byKey.set(key, [...(byKey.get(key) ?? []), dim])
  }
  const chains: Chain[] = [...byKey.values()].map((group) => {
    const first = group[0]!
    const ranges = group.map(stretch)
    return {
      dims: group,
      normal: first.normal,
      range: [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))],
      position: dot(first.from, first.normal) + first.offset
    }
  })
  const order = chains.map((chain, index) => ({ chain, index })).sort((a, b) => a.chain.position - b.chain.position || a.index - b.index)
  const placed: Chain[] = []
  const pushed = new Map<Dimension, number>()
  for (const { chain } of order) {
    const first = chain.position
    for (let guard = 0; guard <= placed.length; guard++) {
      const under = placed.find((other) => dot(other.normal, chain.normal) > 0.999 && shared(other.range, chain.range) > SHARED && Math.abs(other.position - chain.position) < TOO_CLOSE)
      if (under === undefined) break
      chain.position = under.position + CHAIN_SPACING
    }
    placed.push(chain)
    const by = chain.position - first
    if (by !== 0) for (const dim of chain.dims) pushed.set(dim, dim.offset + by)
  }
  return dims.map((dim) => (pushed.has(dim) ? withOffset(dim, pushed.get(dim)!) : dim))
}

/** Which end of a grid's lines a dimension of the grid, or a bubble, stands at. */
export type GridEnd = 'from' | 'to'

interface End {
  readonly grid: string
  readonly set: 'x' | 'y'
  readonly end: GridEnd
  /** The way out past the end, a unit vector. */
  readonly out: Vec2
  readonly points: readonly Vec2[]
}

/** Every end of every grid's lines, set by set. */
function gridEnds(drawing: PlanDrawing): End[] {
  const out: End[] = []
  for (const grid of drawing.grids ?? []) {
    for (const set of ['x', 'y'] as const) {
      const lines = grid.lines.filter((line) => line.set === set)
      if (lines.length === 0) continue
      const along = lines[0]!.along
      out.push({ grid: grid.id, set, end: 'from', out: along, points: lines.map((line) => line.from) })
      out.push({ grid: grid.id, set, end: 'to', out: { x: -along.x, y: -along.y }, points: lines.map((line) => line.to) })
    }
  }
  return out
}

/**
 * How far past `point`, along `out`, the chain lines in its lane reach: 0 when none stands at or
 * beyond the point, else that distance and the gap a bubble keeps from it.
 */
function reachPast(point: Vec2, out: Vec2, chains: readonly Dimension[]): number {
  const side = { x: -out.y, y: out.x }
  let need = 0
  for (const dim of chains) {
    const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
    const ends = [dim.from, dim.to].map((p) => ({ t: dot({ x: p.x + shift.x - point.x, y: p.y + shift.y - point.y }, out), s: dot({ x: p.x + shift.x - point.x, y: p.y + shift.y - point.y }, side) }))
    const [a, b] = ends as [{ t: number; s: number }, { t: number; s: number }]
    // The part of the line within the lane, as a stretch of its length from 0 to 1.
    let lo = 0
    let hi = 1
    if (a.s === b.s) {
      if (Math.abs(a.s) > LANE) continue
    } else {
      const u1 = (-LANE - a.s) / (b.s - a.s)
      const u2 = (LANE - a.s) / (b.s - a.s)
      lo = Math.max(0, Math.min(u1, u2))
      hi = Math.min(1, Math.max(u1, u2))
      if (lo > hi) continue
    }
    const farthest = Math.max(a.t + (b.t - a.t) * lo, a.t + (b.t - a.t) * hi)
    if (farthest >= -AT_END) need = Math.max(need, farthest + GRID_GAP)
  }
  return need
}

/** (3) Each grid chain stands past the chains in its way; the same reach is where its bubbles start. */
function gridReaches(drawing: PlanDrawing, chains: readonly Dimension[]): Map<string, number> {
  const reach = new Map<string, number>()
  for (const end of gridEnds(drawing)) {
    reach.set(`${end.grid}|${end.set}|${end.end}`, Math.max(0, ...end.points.map((point) => reachPast(point, end.out, chains))))
  }
  return reach
}

/** What `layoutMarks` works out. */
export interface MarkLayout {
  /** The dimensions as they are drawn. */
  readonly dimensions: Dimension[]
  /** How far past a grid line's end, in metres, its name's circle and its set's chain start. 0 where nothing is in the way. */
  readonly gridReach: (grid: string, set: 'x' | 'y', end: GridEnd) => number
}

/** The dimensions as they are drawn, and where the grids' bubbles stand against them. */
export function layoutMarks(drawing: PlanDrawing, dimensions: readonly Dimension[]): MarkLayout {
  const laid = withSeparatedChains(withoutRepeats(dimensions))
  const reach = gridReaches(drawing, laid.filter(outside))
  const ends = gridEnds(drawing)
  const result = laid.map((dim) => {
    if (dim.kind !== 'grid') return dim
    const end = ends.find((e) => dot(e.out, dim.normal) > 0.999 && e.points.some((p) => near(p, dim.from)))
    const by = end === undefined ? 0 : reach.get(`${end.grid}|${end.set}|${end.end}`) ?? 0
    return by > 0 ? withOffset(dim, by) : dim
  })
  return { dimensions: result, gridReach: (grid, set, end) => reach.get(`${grid}|${set}|${end}`) ?? 0 }
}

/** The dimensions as they are drawn (`layoutMarks`). */
export function layoutDimensions(drawing: PlanDrawing, dimensions: readonly Dimension[]): Dimension[] {
  return layoutMarks(drawing, dimensions).dimensions
}

/** The frame a plan's dimensions need, with the bubbles of a grid pushed past its chains. */
export function framedByLayout(drawing: PlanDrawing, framed: Bounds, layout: MarkLayout): Bounds {
  const points: Vec2[] = [framed.min, framed.max]
  for (const end of gridEnds(drawing)) {
    const by = layout.gridReach(end.grid, end.set, end.end)
    if (by > 0) for (const p of end.points) points.push({ x: p.x + end.out.x * by, y: p.y + end.out.y * by })
  }
  return points.length === 2 ? framed : computeBounds(points)
}

/** The ticks across the ends of each chain and the extension lines tying it to what it measures: what a figure keeps off. */
export function dimensionClutter(dims: readonly Dimension[], mpp: number, drafted: boolean): Box[] {
  const boxes: Box[] = []
  const half = (TICK_PX / 2 + 1) * mpp
  for (const dim of dims) {
    if (dim.kind === 'room') continue
    const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
    const a = { x: dim.from.x + shift.x, y: dim.from.y + shift.y }
    const b = { x: dim.to.x + shift.x, y: dim.to.y + shift.y }
    if (drafted) for (const end of [a, b]) boxes.push({ minX: end.x - half, maxX: end.x + half, minY: end.y - half, maxY: end.y + half })
    if (dim.offset !== 0) {
      boxes.push(lineBox(dim.from, a, mpp), lineBox(dim.to, b, mpp))
    }
  }
  return boxes
}

/** The boxes a view mark keeps off: every chain with its figure, and every grid bubble. */
export function markObstacles(drawing: PlanDrawing, layout: MarkLayout, mpp: number, drafted: boolean): Box[] {
  const boxes: Box[] = dimensionClutter(layout.dimensions, mpp, drafted)
  for (const dim of layout.dimensions) {
    if (dim.kind === 'room') continue
    const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
    boxes.push(lineBox({ x: dim.from.x + shift.x, y: dim.from.y + shift.y }, { x: dim.to.x + shift.x, y: dim.to.y + shift.y }, mpp))
    boxes.push(dimensionTextBox(dim.labelAt, dim, mpp))
  }
  const r = GRID_BUBBLE_PX * mpp
  for (const end of gridEnds(drawing)) {
    const by = layout.gridReach(end.grid, end.set, end.end)
    for (const p of end.points) {
      const centre = { x: p.x + end.out.x * (by + r), y: p.y + end.out.y * (by + r) }
      boxes.push({ minX: centre.x - r, maxX: centre.x + r, minY: centre.y - r, maxY: centre.y + r })
    }
  }
  return boxes
}
