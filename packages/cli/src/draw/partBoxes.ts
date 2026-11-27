/**
 * VEW-6: where each part of a floor is on a picture, in image pixels, so an agent can point at a
 * part, crop to it, or check that a label is where it says.
 *
 * The parts are measured from the plan in metres (a room by its outline, a door or window by its
 * hole through the wall, a wall by its body), then put through the picture's own framing. A box
 * is `x`, `y` from the top-left corner of the image, and `width`, `height`, all in pixels.
 */
import { buildFloorPlan, curveFault, floorOf, itemFootprint, itemKindDefinition, openingChord, planForFloor, resolveFloor, wallPolygon, type Bounds, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import type { Picture } from '@ongrid/viewer/src/picture'

/** CNT-45: and the plan's fixtures and furniture, each by its footprint. */
export type PartKind = 'room' | 'door' | 'window' | 'opening' | 'wall' | 'fixture' | 'furniture'

export interface PartBounds {
  readonly id: string
  readonly kind: PartKind
  /** In plan metres, y up. */
  readonly bounds: Bounds
}

export interface PixelBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PartBox {
  readonly id: string
  readonly kind: PartKind
  readonly box: PixelBox
}

function boundsOf(points: readonly Vec2[]): Bounds {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const min = { x: Math.min(...xs), y: Math.min(...ys) }
  const max = { x: Math.max(...xs), y: Math.max(...ys) }
  return { min, max, width: max.x - min.x, height: max.y - min.y }
}

/** A strip of a given width along a line, as its four corners. */
function strip(a: Vec2, b: Vec2, width: number): Vec2[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const n = { x: (-(b.y - a.y) / length) * (width / 2), y: ((b.x - a.x) / length) * (width / 2) }
  return [
    { x: a.x + n.x, y: a.y + n.y },
    { x: a.x - n.x, y: a.y - n.y },
    { x: b.x + n.x, y: b.y + n.y },
    { x: b.x - n.x, y: b.y - n.y },
  ]
}

/** Every room, opening, wall and (CNT-45) item of one floor, with its box in metres. Rooms without an outline are left out. */
export function partBounds(plan: FloorPlan, floor: string | undefined): PartBounds[] {
  const resolved = resolveFloor(plan, floor ?? null)
  const slice = planForFloor(plan, resolved)
  const walls = new Map(slice.walls.map((w) => [w.id, w]))
  const parts: PartBounds[] = []
  // The rooms as the picture draws them.
  for (const room of buildFloorPlan(slice).rooms) {
    if (room.polygon.length >= 3) parts.push({ id: room.id, kind: 'room', bounds: boundsOf(room.polygon) })
  }
  for (const opening of slice.openings) {
    const wall = walls.get(opening.wall)
    if (!wall) continue
    // CNT-18: an opening in a curved wall is its chord's strip, a curved wall its stations' box.
    if (wall.arc !== undefined) {
      if (curveFault(wall) !== null) continue
      const hole = openingChord(wall, opening.offset, opening.offset + opening.width)
      parts.push({ id: opening.id, kind: opening.type, bounds: boundsOf(strip(hole.start, hole.end, Math.max(wall.thickness, 0))) })
      continue
    }
    const [sx, sy] = wall.start
    const [ex, ey] = wall.end
    const length = Math.hypot(ex - sx, ey - sy)
    if (!(length > 0)) continue
    const dir = { x: (ex - sx) / length, y: (ey - sy) / length }
    const a = { x: sx + dir.x * opening.offset, y: sy + dir.y * opening.offset }
    const b = { x: a.x + dir.x * opening.width, y: a.y + dir.y * opening.width }
    parts.push({ id: opening.id, kind: opening.type, bounds: boundsOf(strip(a, b, Math.max(wall.thickness, 0))) })
  }
  for (const wall of slice.walls) {
    if (wall.arc !== undefined) {
      if (curveFault(wall) !== null) continue
      parts.push({ id: wall.id, kind: 'wall', bounds: boundsOf(wallPolygon(wall.virtual === true ? { ...wall, thickness: 0 } : wall)) })
      continue
    }
    const a = { x: wall.start[0], y: wall.start[1] }
    const b = { x: wall.end[0], y: wall.end[1] }
    parts.push({ id: wall.id, kind: 'wall', bounds: boundsOf(strip(a, b, wall.virtual === true ? 0 : wall.thickness)) })
  }
  for (const item of plan.items ?? []) {
    if (floorOf(item) !== resolved || itemKindDefinition(item.kind) === undefined) continue
    parts.push({ id: item.id, kind: itemKindDefinition(item.kind)!.group === 'furniture' ? 'furniture' : 'fixture', bounds: boundsOf(itemFootprint(item)) })
  }
  return parts
}

/**
 * The parts' boxes on a picture, in image pixels, cut to the image. A part wholly outside the
 * picture (in a crop) is left out.
 */
export function pixelBoxes(parts: readonly PartBounds[], picture: Pick<Picture, 'width' | 'height' | 'view'>): PartBox[] {
  const { view } = picture
  const sx = picture.width / view.width
  const sy = picture.height / view.height
  const out: PartBox[] = []
  for (const part of parts) {
    // The view has y down: plan y becomes -y.
    const left = Math.max(0, (part.bounds.min.x - view.x) * sx)
    const right = Math.min(picture.width, (part.bounds.max.x - view.x) * sx)
    const top = Math.max(0, (-part.bounds.max.y - view.y) * sy)
    const bottom = Math.min(picture.height, (-part.bounds.min.y - view.y) * sy)
    if (right < left || bottom < top) continue
    const round = (n: number): number => Math.round(n * 10) / 10
    out.push({ id: part.id, kind: part.kind, box: { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) } })
  }
  return out
}

/**
 * The frame for a crop: the parts' joined box, at least `least` metres each way about its middle,
 * with `margin` metres round it (VEW-74: several parts, a flat or a box in one frame).
 */
export function cropFrame(parts: PartBounds | readonly PartBounds[], least = 2, margin = 0): Bounds {
  const list = Array.isArray(parts) ? (parts as readonly PartBounds[]) : [parts as PartBounds]
  const joined = boundsOf(list.flatMap((part) => [part.bounds.min, part.bounds.max]))
  const { min, max } = joined
  const cx = (min.x + max.x) / 2
  const cy = (min.y + max.y) / 2
  const halfW = Math.max(max.x - min.x, least) / 2 + margin
  const halfH = Math.max(max.y - min.y, least) / 2 + margin
  return { min: { x: cx - halfW, y: cy - halfH }, max: { x: cx + halfW, y: cy + halfH }, width: 2 * halfW, height: 2 * halfH }
}
