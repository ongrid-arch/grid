/**
 * ARE-81: the point of a room, or of a floor, that is the longest walk from where a route ends,
 * by its nearest way, and the room a point stands in.
 *
 * Every way the route could take (`everyWay`: each way out for `outside`, each stair or lift off
 * the floor for a room upstairs) is walked once from the doorway it leaves the room by. A point
 * of the room is then as far as the shortest of "across the room's floor to that doorway
 * (`lengthAcross`), and the rest of that way". The points tried are the corners of the room's
 * outline and of its holes, and points along each side every `farthestPointStep`: the farthest is
 * sought on the outline, where a walk across one room is longest. The route from the point found
 * is then walked in full by `routeBetween`, so it reads as every other route.
 *
 * Pure: a survey in, numbers out. The survey and the plan are never changed.
 */
import { pointInPolygon, tolerance, type Vec2 } from '@ongrid/floorplan/geometry'
import { outdoorIds } from '@ongrid/floorplan/geometry/outdoor'
import { say } from '@ongrid/floorplan/messages'
import { everyWay, routeBetween, type Route } from './measure'
import type { Survey, SurveyRoom } from './survey'
import { lengthAcross } from './walked'

/** How the farthest point is found, in Grid's words. */
export const FARTHEST_RULE = say('en', 'route.farthest.rule')

/** A room's farthest point and the route walked from it. */
export interface Farthest {
  readonly room: string
  readonly point: Vec2
  /** The route from the point, by its nearest way; its `length` is the walk. */
  readonly route: Route
}

/** The points of a room's outline and holes tried: every corner, and along each side. */
function outlinePoints(room: Pick<SurveyRoom, 'polygon' | 'holes'>): Vec2[] {
  const step = tolerance('farthestPointStep')
  const out: Vec2[] = []
  for (const ring of [room.polygon, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      out.push(a)
      const span = Math.hypot(b.x - a.x, b.y - a.y)
      const pieces = Math.ceil(span / step - tolerance('noLength'))
      for (let k = 1; k < pieces; k++) out.push({ x: a.x + ((b.x - a.x) * k) / pieces, y: a.y + ((b.y - a.y) * k) / pieces })
    }
  }
  return out
}

/**
 * The point of `room` from which the walk to `to` (a room id or `outside`) by the nearest way is
 * the longest, with the route from it; null when no way is measured from the room.
 */
export function farthestPoint(survey: Survey, room: string, to: string): Farthest | null {
  const at = survey.byId.get(room)
  if (at === undefined || at.polygon.length < 3 || room === to) return null
  const ways = everyWay(survey, room, to, { start: 'door' }).flatMap((r) => (r.length === null || r.startPoint === null ? [] : [{ door: r.startPoint.point, rest: r.length }]))
  if (ways.length === 0) return null
  let best: Vec2 | null = null
  let bestLength = -Infinity
  for (const p of outlinePoints(at)) {
    let nearest = Infinity
    for (const way of ways) {
      const across = lengthAcross(at, p, way.door)
      if (across !== null && across + way.rest < nearest) nearest = across + way.rest
    }
    if (nearest < Infinity && nearest > bestLength + tolerance('noLength')) [best, bestLength] = [p, nearest]
  }
  if (best === null) return null
  const route = routeBetween(survey, room, to, true, { start: { x: best.x, y: best.y, as: 'farthest point' } })
  return route === null || route.length === null ? null : { room, point: best, route }
}

/** A floor's rooms, each with its farthest point, longest first, and the rooms no way is measured from. */
export interface FloorFarthest {
  readonly rooms: readonly Farthest[]
  readonly unreached: readonly string[]
}

/**
 * Every room of `floor` measured by `farthestPoint`, longest walk first. Outdoor spaces are left
 * out, a zone is measured as its room, and so is the room the route ends in.
 */
export function farthestOnFloor(survey: Survey, floor: string, to: string): FloorFarthest {
  const outdoor = outdoorIds(survey.plan)
  const rooms: Farthest[] = []
  const unreached: string[] = []
  for (const room of survey.rooms) {
    const id = room.facts.id
    if (room.facts.floor !== floor || room.polygon.length < 3 || outdoor.has(id) || room.facts.zoneOf !== undefined || id === to) continue
    const found = farthestPoint(survey, id, to)
    if (found === null) unreached.push(id)
    else rooms.push(found)
  }
  rooms.sort((a, b) => b.route.length! - a.route.length! || (a.room < b.room ? -1 : a.room > b.room ? 1 : 0))
  return { rooms, unreached }
}

/**
 * The room a point stands in: on `floor` when it is given, else on any floor; a zone gives its
 * room. `none` when no room's floor holds the point, `floors` when rooms on more than one floor do.
 */
export function roomAtPoint(survey: Survey, point: Vec2, floor?: string): { readonly room: SurveyRoom } | { readonly none: true } | { readonly floors: readonly string[] } {
  const under = survey.rooms.filter((r) => r.polygon.length >= 3 && r.facts.zoneOf === undefined && (floor === undefined || r.facts.floor === floor) && pointInPolygon(point, r.polygon, r.holes))
  const floors = [...new Set(under.map((r) => r.facts.floor))]
  if (floors.length > 1) return { floors }
  // Two rooms on one floor over the point overlap: the first in the plan's order is taken.
  return under.length === 0 ? { none: true } : { room: under[0]! }
}
