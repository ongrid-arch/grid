/**
 * Points well inside a room, and boxes that fit in one.
 *
 * A room's name belongs where there is floor around it. The average of the corners is not
 * that place: in an L or a U it can fall in the notch, outside the room. The point used here
 * is the pole of inaccessibility, the point inside the outline farthest from every edge,
 * found with the published cell search of Vladimir Agafonkin (Mapbox, 2016) and written
 * here from its description.
 *
 * The rest answers the questions a label placer asks: does a box fit in the room, does it
 * touch a shape, and where could a box of a given size sit, best spots first.
 *
 * A room with holes in it (ARE-6) passes them as `holes`: a point in a hole is not in the room,
 * and a hole's edges are edges like the outline's. With no holes every answer is as before.
 *
 * Pure: plan metres in, plan metres out.
 */

import type { Vec2 } from './vec2'
import { TOLERANCES } from './tolerances'

/** An axis-aligned box in plan metres. */
export interface Rect {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** The outline's own box. Empty (min above max) for no points. */
export function rectOf(points: readonly Vec2[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Rings a room's floor has besides its outline: its holes (ARE-6). */
export type Holes = readonly (readonly Vec2[])[]

const NO_HOLES: Holes = []

/**
 * Whether `p` lies inside the outline and in none of the holes, by the even-odd rule. A point
 * on an edge may go either way.
 */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[], holes: Holes = NO_HOLES): boolean {
  return inRing(p, polygon) && !holes.some((hole) => inRing(p, hole))
}

function inRing(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function segmentDistanceSquared(p: Vec2, a: Vec2, b: Vec2): number {
  let x = a.x
  let y = a.y
  const dx = b.x - x
  const dy = b.y - y
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = b.x
      y = b.y
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }
  return (p.x - x) ** 2 + (p.y - y) ** 2
}

/** How far `p` is from the nearest edge: positive inside the floor, negative outside or in a hole. */
export function signedDistanceToOutline(p: Vec2, polygon: readonly Vec2[], holes: Holes = NO_HOLES): number {
  let best = Infinity
  for (const ring of holes.length === 0 ? [polygon] : [polygon, ...holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      best = Math.min(best, segmentDistanceSquared(p, ring[i]!, ring[j]!))
    }
  }
  const d = Math.sqrt(best)
  return pointInPolygon(p, polygon, holes) ? d : -d
}

/** Where a room's label goes: a point inside, and how far it is from the nearest edge. */
export interface InnerPoint {
  readonly point: Vec2
  readonly distance: number
}

/** A square cell of the search: its centre, half its side, and how far in its centre is. */
interface Cell {
  readonly x: number
  readonly y: number
  readonly half: number
  readonly d: number
  /** The farthest any point of the cell could be from the edges. */
  readonly max: number
}

const cell = (x: number, y: number, half: number, polygon: readonly Vec2[], holes: Holes): Cell => {
  const d = signedDistanceToOutline({ x, y }, polygon, holes)
  return { x, y, half, d, max: d + half * Math.SQRT2 }
}

/** A heap of cells, the most promising on top. */
class CellQueue {
  private readonly cells: Cell[] = []
  get size(): number {
    return this.cells.length
  }
  push(c: Cell): void {
    const cells = this.cells
    cells.push(c)
    let i = cells.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (cells[parent]!.max >= c.max) break
      cells[i] = cells[parent]!
      i = parent
    }
    cells[i] = c
  }
  pop(): Cell {
    const cells = this.cells
    const top = cells[0]!
    const last = cells.pop()!
    if (cells.length > 0) {
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let next = i
        let value = last.max
        if (left < cells.length && cells[left]!.max > value) {
          next = left
          value = cells[left]!.max
        }
        if (right < cells.length && cells[right]!.max > value) next = right
        if (next === i) break
        cells[i] = cells[next]!
        i = next
      }
      cells[i] = last
    }
    return top
  }
}

/** How many cells the search starts with across the outline's longer side, at most. */
const START_CELLS = 64

/** The search never splits more cells than this, whatever the outline: it always ends. */
const MAX_CELLS = 20_000

/**
 * The point inside the outline farthest from its edges (the pole of inaccessibility), to
 * within `precision` metres (by default a thousandth of the outline's longer side).
 *
 * In a rectangle it is the middle; in an L it is the middle of the wider leg; in a U, of the
 * widest part; in a ring round a hole, the middle of its widest stretch. An outline with no area
 * gives its first corner at distance 0.
 */
export function poleOfInaccessibility(polygon: readonly Vec2[], precision?: number, holes: Holes = NO_HOLES): InnerPoint {
  if (polygon.length === 0) return { point: { x: 0, y: 0 }, distance: 0 }
  const box = rectOf(polygon)
  const width = box.maxX - box.minX
  const height = box.maxY - box.minY
  const side = Math.min(width, height)
  if (!(side > 0) || !Number.isFinite(side)) return { point: polygon[0]!, distance: 0 }
  const tolerance = precision !== undefined && precision > 0 ? precision : Math.max(width, height) / 1000

  // Cover the outline with square cells, and start from its middle and the middle of its box.
  // A long thin outline gets cells wider than it, so there are never more than a few hundred.
  const size = Math.max(side, Math.max(width, height) / START_CELLS)
  const half = size / 2
  const queue = new CellQueue()
  for (let x = box.minX; x < box.maxX; x += size) {
    for (let y = box.minY; y < box.maxY; y += size) queue.push(cell(x + half, y + half, half, polygon, holes))
  }
  let best = cell(box.minX + width / 2, box.minY + height / 2, 0, polygon, holes)
  const middle = areaCentre(polygon)
  if (middle) {
    const c = cell(middle.x, middle.y, 0, polygon, holes)
    if (c.d > best.d) best = c
  }

  let split = 0
  while (queue.size > 0 && split < MAX_CELLS) {
    const c = queue.pop()
    if (c.d > best.d) best = c
    // Nothing in this cell can beat the best by more than the tolerance: skip it.
    if (c.max - best.d <= tolerance) continue
    const h = c.half / 2
    queue.push(cell(c.x - h, c.y - h, h, polygon, holes))
    queue.push(cell(c.x + h, c.y - h, h, polygon, holes))
    queue.push(cell(c.x - h, c.y + h, h, polygon, holes))
    queue.push(cell(c.x + h, c.y + h, h, polygon, holes))
    split++
  }
  return { point: { x: best.x, y: best.y }, distance: Math.max(0, best.d) }
}

/** The centre of the outline's area, or `null` for an outline with none. */
function areaCentre(polygon: readonly Vec2[]): Vec2 | null {
  let x = 0
  let y = 0
  let twice = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    const f = a.x * b.y - b.x * a.y
    x += (a.x + b.x) * f
    y += (a.y + b.y) * f
    twice += f
  }
  if (twice === 0) return null
  return { x: x / (3 * twice), y: y / (3 * twice) }
}

/**
 * Whether the segment from `a` to `b` passes through the open inside of the box: running
 * along its border or touching a corner does not count.
 */
function segmentCrossesRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  const tiny = TOLERANCES.relativeNoise.value * Math.max(1, Math.abs(rect.maxX - rect.minX), Math.abs(rect.maxY - rect.minY))
  const minX = rect.minX + tiny
  const minY = rect.minY + tiny
  const maxX = rect.maxX - tiny
  const maxY = rect.maxY - tiny
  if (minX >= maxX || minY >= maxY) return false
  // Clip the segment to the box (Liang and Barsky) and see whether anything is left.
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const sides: [number, number][] = [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dy, a.y - minY],
    [dy, maxY - a.y]
  ]
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q <= 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return t1 > t0
}

function edgeCrossesRect(polygon: readonly Vec2[], rect: Rect): boolean {
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (segmentCrossesRect(polygon[j]!, polygon[i]!, rect)) return true
  }
  return false
}

const centreOf = (rect: Rect): Vec2 => ({ x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 })

/** Whether the whole box lies inside the outline, clear of the holes. Its border may touch an edge. */
export function rectInsidePolygon(rect: Rect, polygon: readonly Vec2[], holes: Holes = NO_HOLES): boolean {
  if (polygon.length < 3) return false
  return (
    pointInPolygon(centreOf(rect), polygon, holes) &&
    !edgeCrossesRect(polygon, rect) &&
    // A hole wholly inside the box has an edge through it, or a corner in it.
    !holes.some((hole) => edgeCrossesRect(hole, rect) || (hole.length > 0 && strictlyIn(hole[0]!, rect)))
  )
}

const strictlyIn = (p: Vec2, rect: Rect): boolean => p.x > rect.minX && p.x < rect.maxX && p.y > rect.minY && p.y < rect.maxY

/** Whether the box and the shape share any area: an edge through the box, or one inside the other. */
export function rectTouchesPolygon(rect: Rect, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) return false
  const own = rectOf(polygon)
  if (own.minX >= rect.maxX || rect.minX >= own.maxX || own.minY >= rect.maxY || rect.minY >= own.maxY) return false
  if (pointInPolygon(centreOf(rect), polygon) || edgeCrossesRect(polygon, rect)) return true
  // No edge crosses the box and the box is not inside the shape: the shape is inside the box
  // only if its corners are, strictly.
  const p = polygon[0]!
  return p.x > rect.minX && p.x < rect.maxX && p.y > rect.minY && p.y < rect.maxY
}

/** How many spots across the outline's longer side `spotsInside` tries first. */
const SPOTS_ACROSS = 24

/** The spots of a grid `count` across the outline's longer side where the box fits, the farthest from the edges first. */
function gridSpots(polygon: readonly Vec2[], halfWidth: number, halfHeight: number, holes: Holes, count: number, fits: (p: Vec2) => boolean): Vec2[] {
  const box = rectOf(polygon)
  const x0 = box.minX + halfWidth
  const x1 = box.maxX - halfWidth
  const y0 = box.minY + halfHeight
  const y1 = box.maxY - halfHeight
  if (x0 > x1 || y0 > y1) return []
  const step = Math.max(box.maxX - box.minX, box.maxY - box.minY) / count
  if (!(step > 0) || !Number.isFinite(step)) return []
  const across = Math.min(count, Math.floor((x1 - x0) / step))
  const up = Math.min(count, Math.floor((y1 - y0) / step))

  const grid: { at: Vec2; depth: number }[] = []
  for (let i = 0; i <= across; i++) {
    // Centred on the free span, so a box that only just fits is tried in the middle.
    const x = across === 0 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / across
    for (let j = 0; j <= up; j++) {
      const y = up === 0 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * j) / up
      const at = { x, y }
      if (!fits(at)) continue
      grid.push({ at, depth: signedDistanceToOutline(at, polygon, holes) })
    }
  }
  // The sort is stable, so equal spots keep their grid order: the same plan, the same spots.
  grid.sort((a, b) => b.depth - a.depth)
  return grid.map((spot) => spot.at)
}

/**
 * Where the centre of a box `halfWidth` × `halfHeight` (half sizes, metres) could sit with the
 * whole box inside the outline and clear of the holes. The pole of inaccessibility comes first
 * when the box fits there; the rest follow on a grid, the spots farthest from the edges first.
 * Empty when the box fits nowhere.
 */
export function spotsInside(polygon: readonly Vec2[], halfWidth: number, halfHeight: number, holes: Holes = NO_HOLES): Vec2[] {
  if (polygon.length < 3 || !(halfWidth >= 0) || !(halfHeight >= 0)) return []
  const fits = (p: Vec2): boolean =>
    rectInsidePolygon({ minX: p.x - halfWidth, minY: p.y - halfHeight, maxX: p.x + halfWidth, maxY: p.y + halfHeight }, polygon, holes)

  const out: Vec2[] = []
  const pole = poleOfInaccessibility(polygon, undefined, holes).point
  if (fits(pole)) out.push(pole)

  // VEW-22: a grid four times finer when the first finds no spot, so a long thin room at an
  // angle, a wedge, still holds a label that fits in it somewhere.
  for (const across of [SPOTS_ACROSS, 4 * SPOTS_ACROSS]) {
    const grid = gridSpots(polygon, halfWidth, halfHeight, holes, across, fits)
    for (const spot of grid) out.push(spot)
    if (out.length > 0) break
  }
  return out
}
