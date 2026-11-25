/**
 * VEW-51: a room's size lines (its width and depth, dashed inside the room) are drawn only where
 * they cross no stair, lift, door swing or room label, and left out where they cannot. The
 * geometry core says where each line would go; this decides which of them the picture keeps.
 */
import type { Dimension, Vec2 } from '@ongrid/floorplan/geometry'
import type { Box } from '../canvas2d/labelPlacement'

type Segment = readonly [Vec2, Vec2]

function ends(dim: Dimension): Segment {
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  return [
    { x: dim.from.x + shift.x, y: dim.from.y + shift.y },
    { x: dim.to.x + shift.x, y: dim.to.y + shift.y }
  ]
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function segmentsMeet([a, b]: Segment, [c, d]: Segment): boolean {
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  return d1 * d2 < 0 && d3 * d4 < 0
}

function insidePolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p = polygon[i]!
    const q = polygon[j]!
    if (p.y > point.y !== q.y > point.y && point.x < ((q.x - p.x) * (point.y - p.y)) / (q.y - p.y) + p.x) inside = !inside
  }
  return inside
}

/** Whether a line passes through a polygon: across one of its edges, or wholly inside it. */
export function crossesPolygon(line: Segment, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 2) return false
  for (let i = 0; i < polygon.length; i++) {
    if (segmentsMeet(line, [polygon[i]!, polygon[(i + 1) % polygon.length]!])) return true
  }
  return insidePolygon(line[0], polygon)
}

function boxPolygon(box: Box): Vec2[] {
  return [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY }
  ]
}

/** Whether a line passes through a box. */
export function crossesBox(line: Segment, box: Box): boolean {
  return crossesPolygon(line, boxPolygon(box))
}

/** The dimensions without the room size lines that cross a stair, a lift or a door swing. */
export function withoutBlockedSizeLines(dimensions: readonly Dimension[], polygons: readonly (readonly Vec2[])[], boxes: readonly Box[]): Dimension[] {
  return dimensions.filter((dim) => {
    if (dim.kind !== 'room') return true
    const line = ends(dim)
    return !polygons.some((polygon) => crossesPolygon(line, polygon)) && !boxes.some((box) => crossesBox(line, box))
  })
}

/** Whether a room size line runs through any of these label boxes. */
export function crossesAny(dim: Dimension, boxes: readonly Box[]): boolean {
  const line = ends(dim)
  return boxes.some((box) => crossesBox(line, box))
}
