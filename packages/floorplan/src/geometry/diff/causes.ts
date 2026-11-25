/**
 * WRT-19: the walls a room grew or shrank by, between two versions of a plan.
 *
 * A room whose floor changed is said with the walls on its outline whose face on its side moved:
 * a wall made thinner or thicker, or (drawn wall by wall) one that moved. Each is found from the
 * wall's centre line and thickness in both versions, under the same id once the earlier plan is
 * laid on the later one, and from the side of the wall the room is on in the later plan.
 *
 * MSG-26: a curved wall on its outline whose radius changed is said with its radius before and
 * after, from its ends and its centre in both versions.
 *
 * Pure: plans in, the walls and the words for them out.
 */

import type { PlanIndex, Room, Wall } from '../plan'
import { pointInPolygon } from '../innerPoint'
import { metresText } from '../rounding'
import { joined, name, num, said, type Said, type Value } from '../../messages/say'
import { compareText } from './order'
import { tolerance } from '../tolerances'
import type { Vec2 } from '../vec2'
import type { PlanChange } from './types'

export interface RoomCause {
  /** The walls named, by the later plan's ids, in the order they are said. */
  readonly walls: readonly string[]
  /** The part of the room's line that names them; null when no wall is named. */
  readonly said: Said | null
}

/** Where a straight wall runs: its middle and the direction to its left. */
function frame(wall: Wall): { middle: Vec2; along: Vec2; left: Vec2; length: number } | null {
  if (wall.arc !== undefined) return null
  const dx = wall.end[0] - wall.start[0]
  const dy = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  const along = { x: dx / length, y: dy / length }
  return { middle: { x: (wall.start[0] + wall.end[0]) / 2, y: (wall.start[1] + wall.end[1]) / 2 }, along, left: { x: -along.y, y: along.x }, length }
}

/** The stations along a wall the side of a room is looked for at: away from its ends, where other walls meet it. */
const STATIONS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].map((k) => k / 20)

/** Which side of the wall the room is on, +1 to its left and -1 to its right; null when it is on neither. */
function sideOf(wall: Wall, polygon: readonly Vec2[]): 1 | -1 | null {
  const f = frame(wall)
  if (f === null) return null
  const reach = wall.thickness / 2 + tolerance('diffPlace')
  for (const side of [1, -1] as const) {
    for (const t of STATIONS) {
      const along = (t - 0.5) * f.length
      const p = { x: f.middle.x + f.along.x * along + f.left.x * side * reach, y: f.middle.y + f.along.y * along + f.left.y * side * reach }
      if (pointInPolygon(p, polygon)) return side
    }
  }
  return null
}

/**
 * The walls of a room whose face on its side moved. `thicknessOnly`: a plan written rooms first,
 * whose walls follow its rooms, so only a wall's own thickness is a cause there.
 */
export function roomWallCauses(
  room: Room,
  polygon: readonly Vec2[] | null,
  changes: ReadonlyMap<string, PlanChange>,
  before: PlanIndex,
  after: PlanIndex,
  options: { readonly thicknessOnly: boolean }
): RoomCause {
  if (polygon === null) return { walls: [], said: null }
  const thinner = new Map<string, string[]>()
  const moved: { wall: string; by: number }[] = []
  const radii: { wall: string; before: number; after: number }[] = []
  // The walls round its holes are left out: both their sides are on the room's outline.
  for (const id of [...new Set(room.boundary)].sort(compareText)) {
    const change = changes.get(id)
    const was = before.wallsById.get(id)
    const is = after.wallsById.get(id)
    if (change === undefined || change.kind !== 'modified' || was === undefined || is === undefined || is.virtual === true) continue
    // MSG-26: a curved wall whose radius changed, in both versions curved.
    if (was.arc !== undefined && is.arc !== undefined) {
      const radius = (w: Wall): number => Math.hypot(w.start[0] - w.arc!.centre[0], w.start[1] - w.arc!.centre[1])
      if (Math.abs(radius(is) - radius(was)) > tolerance('diffLength')) radii.push({ wall: id, before: radius(was), after: radius(is) })
      continue
    }
    const thickness = change.props.some((p) => p.key === 'thickness')
    if (!thickness && (options.thicknessOnly || change.motion === undefined)) continue
    const f = frame(is)
    const g = frame(was)
    const side = sideOf(is, polygon)
    if (f === null || g === null || side === null) continue
    // The room's face of the wall, across the later wall's line, in both versions.
    const across = (p: Vec2): number => p.x * f.left.x + p.y * f.left.y
    const faceAfter = across(f.middle) + (side * is.thickness) / 2
    const faceBefore = across(g.middle) + (side * was.thickness) / 2
    if (Math.abs(faceAfter - faceBefore) <= tolerance('diffLength')) continue
    if (thickness) {
      const key = `${metresText(was.thickness)}\u0000${metresText(is.thickness)}`
      const list = thinner.get(key)
      if (list) list.push(id)
      else thinner.set(key, [id])
    } else moved.push({ wall: id, by: Math.abs(across(f.middle) - across(g.middle)) })
  }
  const parts: Value[] = []
  const walls: string[] = []
  for (const [key, ids] of thinner) {
    const [was, is] = key.split('\u0000') as [string, string]
    walls.push(...ids)
    parts.push(
      ids.length === 1
        ? said('diff.cause.thickness.one', { wall: name(ids[0]!), before: num(was), after: num(is) })
        : said('diff.cause.thickness.many', { walls: joined(ids.map(name), 'join.comma', 'join.and'), before: num(was), after: num(is) })
    )
  }
  for (const r of radii) {
    walls.push(r.wall)
    parts.push(said('diff.cause.radius', { wall: name(r.wall), before: num(metresText(r.before)), after: num(metresText(r.after)) }))
  }
  for (const m of moved) {
    walls.push(m.wall)
    parts.push(said('diff.cause.moved', { wall: name(m.wall), by: num(metresText(m.by)) }))
  }
  return { walls, said: parts.length === 0 ? null : said('diff.cause', { walls: joined(parts, 'join.comma', 'join.and') }) }
}
