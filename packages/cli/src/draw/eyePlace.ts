/**
 * VEW-75: where the eye view stands and which way it looks, worked out from the room's outline,
 * its openings and the plan's items: in a doorway, in front of an item, tucked into a corner of the
 * room, or on its middle line (`eyeStand` in `views.ts`); never inside a fixture or a piece of
 * furniture; and the headings that give a one-point or a two-point perspective.
 *
 * Headings are degrees clockwise from the top of the drawing (+y), as `eyeCamera` takes them.
 * The figures here are the eye view's own choices of where a person stands, not drawing
 * tolerances. No drawing here.
 */
import { floorOf, itemFootprint, pointInPolygon, poleOfInaccessibility, wallFrameAt, wrapDegrees, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import type { SurveyRoom } from '../quantities/survey'

const DEG = Math.PI / 180

/** A room with less floor than this, in square metres, is seen from its doorway, looking diagonally across. */
export const SMALL_ROOM_AREA = 9
/** How far the eye stands clear of the room's walls when Grid tucks it into a corner, in metres. */
const CORNER_CLEAR = 0.4
/** How far past the wall's face, into the room, the eye stands in a doorway, in metres. */
const DOORWAY_IN = 0.1
/** How far in front of an item the eye stands, in metres. */
const IN_FRONT = 0.5
/** How far a standing point is kept from an item's footprint, in metres. */
const ITEM_CLEAR = 0.2
/** The furthest a point is moved to clear an item, in metres, and the step it is searched by. */
const CLEAR_SEARCH = 4
const CLEAR_STEP = 0.1
const CLEAR_DIRECTIONS = 24
/** Items lower than this, in metres, such as a rug, are stood on, not walked round. */
const LOW_ITEM = 0.3
/** A two-point view looks at least this many degrees off square to the room's walls. */
export const TWO_POINT_OFF = 25

/** The corners of a room `at` names, as directions on the drawing (north is its top). */
export const EYE_CORNERS: Readonly<Record<string, Vec2>> = {
  'north-east': { x: 1, y: 1 },
  'south-east': { x: 1, y: -1 },
  'south-west': { x: -1, y: -1 },
  'north-west': { x: -1, y: 1 },
}

/** Whether a point is inside the ring, at least `margin` from each of its sides. */
function insideBy(ring: readonly Vec2[], p: Vec2, margin: number): boolean {
  return pointInPolygon(p, ring) && distanceToRing(ring, p) >= margin
}

function distanceToRing(ring: readonly Vec2[], p: Vec2): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y))
  }
  return best
}

/** Whether a point is on the room's floor, at least `margin` from its outline and its holes. */
function onFloor(room: Pick<SurveyRoom, 'polygon' | 'holes'>, p: Vec2, margin: number): boolean {
  return insideBy(room.polygon, p, margin) && room.holes.every((hole) => !pointInPolygon(p, hole) && distanceToRing(hole, p) >= margin)
}

/** The heading from one point to another. */
export function headingTo(from: Vec2, to: Vec2): number {
  return wrapDegrees(Math.atan2(to.x - from.x, to.y - from.y) / DEG)
}

/**
 * Standing in the doorway of one of the room's doors or openings: its middle, just past the
 * wall's face on the room's side.
 */
export function doorwayPoint(plan: FloorPlan, room: Pick<SurveyRoom, 'polygon' | 'holes'>, opening: { wall: string; offset: number; width: number }): Vec2 | null {
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (wall === undefined) return null
  const frame = wallFrameAt(wall, opening.offset + opening.width / 2)
  const into = (wall.virtual === true ? 0 : wall.thickness / 2) + DOORWAY_IN
  for (const side of [1, -1]) {
    const p = { x: frame.point.x + frame.normal.x * into * side, y: frame.point.y + frame.normal.y * into * side }
    if (onFloor(room, p, 0)) return p
  }
  return null
}

/** Standing in front of an item, looking the way it faces, as from its seat or its desk. */
export function inFrontOf(item: Parameters<typeof itemFootprint>[0]): { stand: Vec2; heading: number } {
  const [backLeft, , frontRight, frontLeft] = itemFootprint(item) as [Vec2, Vec2, Vec2, Vec2]
  const depth = Math.hypot(frontLeft.x - backLeft.x, frontLeft.y - backLeft.y) || 1
  const front = { x: (frontLeft.x - backLeft.x) / depth, y: (frontLeft.y - backLeft.y) / depth }
  const middle = { x: (frontLeft.x + frontRight.x) / 2, y: (frontLeft.y + frontRight.y) / 2 }
  return { stand: { x: middle.x + front.x * IN_FRONT, y: middle.y + front.y * IN_FRONT }, heading: headingTo({ x: 0, y: 0 }, front) }
}

/**
 * Tucked into a corner of the room: from the outline's corner furthest that way, toward the
 * middle of the room, the first point clear of its walls. Null when the room has none.
 */
export function cornerPoint(room: Pick<SurveyRoom, 'polygon' | 'holes'>, corner: Vec2): Vec2 | null {
  let far = room.polygon[0]
  for (const p of room.polygon) if (p.x * corner.x + p.y * corner.y > far!.x * corner.x + far!.y * corner.y) far = p
  if (far === undefined) return null
  const centre = poleOfInaccessibility(room.polygon, undefined, room.holes).point
  const run = Math.hypot(centre.x - far.x, centre.y - far.y)
  for (let step = CLEAR_STEP / 2; step < run; step += CLEAR_STEP / 2) {
    const p = { x: far.x + ((centre.x - far.x) * step) / run, y: far.y + ((centre.y - far.y) * step) / run }
    if (onFloor(room, p, CORNER_CLEAR)) return p
  }
  return centre
}

/** The corner of the room's outline furthest from where the eye stands: what a diagonal view looks at. */
export function farCorner(room: Pick<SurveyRoom, 'polygon'>, stand: Vec2): Vec2 {
  let far = room.polygon[0]!
  for (const p of room.polygon) if (Math.hypot(p.x - stand.x, p.y - stand.y) > Math.hypot(far.x - stand.x, far.y - stand.y)) far = p
  return far
}

/** The footprints of the items on a floor that a person cannot stand in, by id. */
export function floorItems(plan: FloorPlan, floor: string): { id: string; footprint: Vec2[] }[] {
  return (plan.items ?? []).filter((item) => floorOf(item) === floor && item.height >= LOW_ITEM).map((item) => ({ id: item.id, footprint: itemFootprint(item) }))
}

/** The item a point stands in or too near to, or null. */
export function itemAt(items: readonly { id: string; footprint: readonly Vec2[] }[], p: Vec2): string | null {
  return items.find((item) => pointInPolygon(p, item.footprint) || distanceToRing(item.footprint, p) < ITEM_CLEAR)?.id ?? null
}

/**
 * The nearest point to `p` clear of every item and on the room's floor: searched on rings round
 * it, a step further each time. `p` itself when it is clear; null when nothing near is.
 */
export function clearOfItems(room: Pick<SurveyRoom, 'polygon' | 'holes'>, items: readonly { id: string; footprint: readonly Vec2[] }[], p: Vec2): Vec2 | null {
  if (itemAt(items, p) === null) return p
  for (let r = CLEAR_STEP; r <= CLEAR_SEARCH + 1e-9; r += CLEAR_STEP) {
    for (let i = 0; i < CLEAR_DIRECTIONS; i++) {
      const a = (i * 360) / CLEAR_DIRECTIONS
      const q = { x: p.x + Math.sin(a * DEG) * r, y: p.y + Math.cos(a * DEG) * r }
      if (onFloor(room, q, DOORWAY_IN) && itemAt(items, q) === null) return q
    }
  }
  return null
}

/** The heading the room's walls run square to: its longest side's, as a heading. */
function wallsHeading(polygon: readonly Vec2[]): number {
  let best = { length: 0, heading: 0 }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > best.length) best = { length, heading: headingTo(a, b) }
  }
  return best.heading
}

/** How far a heading is from square to the room's walls, from -45 to 45 degrees. */
export function offSquare(polygon: readonly Vec2[], heading: number): number {
  const off = wrapDegrees(heading - wallsHeading(polygon)) % 90
  return off > 45 ? off - 90 : off
}

/** A one-point view: the heading squared on the wall it faces. */
export function squareHeading(polygon: readonly Vec2[], heading: number): number {
  return wrapDegrees(heading - offSquare(polygon, heading))
}

/** A two-point view: the heading turned, when it must be, to `TWO_POINT_OFF` degrees off square. */
export function twoPointHeading(polygon: readonly Vec2[], heading: number): { heading: number; turned: number } {
  const off = offSquare(polygon, heading)
  if (Math.abs(off) >= TWO_POINT_OFF) return { heading, turned: 0 }
  const turned = (off < 0 ? -TWO_POINT_OFF : TWO_POINT_OFF) - off
  return { heading: wrapDegrees(heading + turned), turned }
}
