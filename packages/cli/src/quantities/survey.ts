/**
 * The plan read once for the measuring tools: each room's inside outline, which wall each side
 * of it lies on, and which openings are in it. Built on `planFacts` (`describe/facts.ts`), so a
 * room, its area and the rooms an opening joins are the same here as in `grid describe` and in
 * the way-out check.
 *
 * Pure: a plan in, numbers out. Nothing here reads a file.
 */
import {
  cross,
  dot,
  indexPlan,
  planInState,
  planForFloor,
  roomWallIds,
  sub,
  curveFault,
  tolerance,
  wallSegments,
  type FloorPlan,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { ALONG_WALL_SINE, planFacts, type OpeningFacts, type PlanFacts, type RoomFacts } from '../describe/facts'

/** How far a side of the outline may be from a wall's face and still lie on it, in metres. */
const ON_FACE_M = 0.02

/** One side of a room's inside outline. */
export interface RoomEdge {
  readonly from: Vec2
  readonly to: Vec2
  readonly length: number
  /** The wall whose face it lies on, or null when none of the room's walls is there. */
  readonly wall: Wall | null
}

export interface SurveyRoom {
  readonly facts: RoomFacts
  /** The inside outline, counter-clockwise. Empty when the room has none. */
  readonly polygon: readonly Vec2[]
  /** Its holes (ARE-6), clockwise. Empty for a room with none. */
  readonly holes: readonly (readonly Vec2[])[]
  /** The sides of its outline, then of each hole: the floor is on the left of every one. */
  readonly edges: readonly RoomEdge[]
  /** Openings with this room on one side. */
  readonly openings: readonly OpeningFacts[]
}

export interface Survey {
  readonly plan: FloorPlan
  readonly facts: PlanFacts
  /** Rooms in plan order, floor by floor. */
  readonly rooms: readonly SurveyRoom[]
  readonly byId: ReadonlyMap<string, SurveyRoom>
}

function wallOfEdge(from: Vec2, to: Vec2, walls: readonly Wall[]): Wall | null {
  const edge = sub(to, from)
  const length = Math.hypot(edge.x, edge.y)
  if (length < tolerance('noLength')) return null
  for (const wall of walls) {
    // A curved wall's sides are along its straight pieces (CNT-18).
    if (wall.arc !== undefined && curveFault(wall) !== null) continue
    for (const axis of wallSegments(wall)) {
      if (axis.length < tolerance('noLength')) continue
      if (Math.abs(cross(edge, axis.dir)) / length > ALONG_WALL_SINE) continue
      const half = wall.virtual === true ? 0 : wall.thickness / 2
      const off = (p: Vec2): number => Math.abs(dot(sub(p, axis.start), axis.normal))
      if (Math.abs(off(from) - half) > ON_FACE_M || Math.abs(off(to) - half) > ON_FACE_M) continue
      // The side must lie along the wall, not only on its line.
      const a = dot(sub(from, axis.start), axis.dir)
      const b = dot(sub(to, axis.start), axis.dir)
      const reach = wall.thickness / 2 + ON_FACE_M
      if (Math.max(a, b) < -reach || Math.min(a, b) > axis.length + reach) continue
      return wall
    }
  }
  return null
}

export function surveyPlan(stated: FloorPlan): Survey {
  // CNT-10: every measure is of the building as it will be after the work (`planInState`).
  const plan = planInState(stated, 'after')
  // Its facts count the work too (`PlanFacts.work`), from the plan as stated.
  const facts = planFacts(stated)
  const rooms: SurveyRoom[] = []
  for (const floor of facts.floors) {
    const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
    const index = indexPlan(storey)
    const outlines = roomOutlines(storey, index, leftOut.rooms)
    for (const room of floor.rooms) {
      const polygon = outlines.get(room.id)?.polygon ?? []
      const holes = outlines.get(room.id)?.holes ?? []
      const own = storey.rooms.find((r) => r.id === room.id)
      const walls = (own ? roomWallIds(own) : []).map((id) => index.wallsById.get(id)).filter((w): w is Wall => w !== undefined)
      const edges: RoomEdge[] = [polygon, ...holes].flatMap((ring) =>
        ring.map((from, i) => {
          const to = ring[(i + 1) % ring.length]!
          return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y), wall: wallOfEdge(from, to, walls) }
        })
      )
      const openings = floor.openings.filter((o) => o.sides.some((side) => typeof side === 'object' && side.room === room.id))
      rooms.push({ facts: room, polygon, holes, edges, openings })
    }
  }
  return { plan, facts, rooms, byId: new Map(rooms.map((room) => [room.facts.id, room])) }
}

/**
 * WRT-43: what an answer calls a room: its name, or its id when its name is blank, so a room
 * with no name is never written as "" and lost among the others.
 */
export function roomCalled(room: { readonly id: string; readonly name: string }): string {
  return room.name.trim() === '' ? room.id : room.name
}

/** A room of the survey by id, as `roomCalled` calls it; the id itself when no room has it. */
export function roomCalledById(survey: Survey, id: string): string {
  const room = survey.byId.get(id)
  return room === undefined ? id : roomCalled(room.facts)
}

/** The two sides of an opening as room ids, or `outside` and the like. */
export function sideNames(opening: OpeningFacts): [string, string] {
  return opening.sides.map((side) => (typeof side === 'object' ? side.room : side)) as [string, string]
}
