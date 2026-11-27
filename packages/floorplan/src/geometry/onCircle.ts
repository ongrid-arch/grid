/**
 * CMD-51: a room drawn with many straight walls whose corners all lie on one circle: a curve
 * written as a polygon. Its walls are many short pieces where one curved wall (C21) would do, so
 * every check, picture and change works through all of them; the answer that wrote it says how to
 * write it as a circle. A room with a curved wall, a hole, or fewer corners than
 * `polygonOnCircleCorners` (a hexagon or an octagon drawn on purpose) is none.
 */
import type { FloorPlan, Wall } from './plan'
import { roomWallIds } from './plan'
import type { Vec2 } from '../types/floorplan'
import { limit, tolerance } from './tolerances'

/** A room whose corners lie on one circle, round its walls' centre lines. */
export interface PolygonOnCircle {
  readonly room: string
  readonly corners: number
  readonly centre: Vec2
  /** The circle through the walls' centre lines, in metres. */
  readonly radius: number
  /** The walls' mean thickness, so the inside face's circle is `radius - thickness / 2`. */
  readonly thickness: number
}

/** The circle nearest `points` (least squares, Kåsa's fit): its centre and radius. */
function fitCircle(points: readonly Vec2[]): { centre: Vec2; radius: number } | null {
  const n = points.length
  const mx = points.reduce((s, p) => s + p[0], 0) / n
  const my = points.reduce((s, p) => s + p[1], 0) / n
  let suu = 0
  let svv = 0
  let suv = 0
  let suuu = 0
  let svvv = 0
  let suvv = 0
  let svuu = 0
  for (const [x, y] of points) {
    const u = x - mx
    const v = y - my
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) <= Number.EPSILON * (suu + svv) * (suu + svv)) return null
  const bu = (suuu + suvv) / 2
  const bv = (svvv + svuu) / 2
  const uc = (bu * svv - bv * suv) / det
  const vc = (bv * suu - bu * suv) / det
  const radius = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
  return { centre: [mx + uc, my + vc], radius }
}

/** The corners of a room's walls, each once: its walls' ends. */
function cornersOf(walls: readonly Wall[]): Vec2[] {
  const near = tolerance('polygonOnCircle')
  const out: Vec2[] = []
  for (const wall of walls) {
    for (const p of [wall.start, wall.end]) {
      if (!out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= near)) out.push(p)
    }
  }
  return out
}

/** Every room of the plan drawn as a polygon on one circle. */
export function polygonsOnCircles(plan: FloorPlan): PolygonOnCircle[] {
  const byId = new Map(plan.walls.map((wall) => [wall.id, wall] as const))
  const fewest = limit('polygonOnCircleCorners')
  const off = tolerance('polygonOnCircle')
  const found: PolygonOnCircle[] = []
  for (const room of plan.rooms) {
    if ((room.holes ?? []).length > 0 || room.boundary.length < fewest) continue
    const walls = roomWallIds(room).map((id) => byId.get(id))
    if (walls.some((wall) => wall === undefined || wall.arc !== undefined)) continue
    const corners = cornersOf(walls as Wall[])
    if (corners.length < fewest) continue
    const circle = fitCircle(corners)
    if (circle === null) continue
    if (corners.some((p) => Math.abs(Math.hypot(p[0] - circle.centre[0], p[1] - circle.centre[1]) - circle.radius) > off)) continue
    const thickness = (walls as Wall[]).reduce((s, wall) => s + wall.thickness, 0) / walls.length
    found.push({ room: room.id, corners: corners.length, centre: circle.centre, radius: circle.radius, thickness })
  }
  return found
}
