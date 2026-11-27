/**
 * VEW-82: what a GLB's nodes carry of the plan in their `extras`, which glTF importers keep as each
 * node's metadata (a game engine's, a renderer's): the rooms a part stands in or between, a room's
 * use, finishes, type and number, each part's type and the person's own facts (CNT-9), and for the
 * walls the stretches between the rooms beside them, which a GLB split at the rooms is cut along.
 *
 * Worked out from one floor's plan as the 3D scene reads it (after the work, CNT-10), so the facts
 * and the meshes agree. Pure: it reads the plan and changes nothing.
 */

import type { FloorPlan, Opening, Room, Wall } from '../plan'
import type { Item } from '../../types/floorplan'
import { indexPlan } from '../plan'
import { planInState } from '../phases'
import { validatePlan } from '../validate'
import { stretchAt, wallSides, type WallStretch } from '../exposure'
import { itemRoom, roomShapes } from '../items'
import { columnRoom } from '../columns'
import { openingSpan, wallPointAt, wallSegments } from '../wall'
import { dot, length, sub, type Vec2 } from '../vec2'
import { tolerance } from '../tolerances'

/** The person's own facts on a part (CNT-9), as the plan states them. */
export type GlbProperties = Readonly<Record<string, string | number | boolean>>

/** What one part's node says of it, past its id, kind and floor. Every field only when the plan states it. */
export interface GlbPartFacts {
  /** The rooms it stands in, or between: a wall's and an opening's as `{ left, right }`, by the wall's faces. */
  readonly rooms?: readonly string[] | { readonly left: readonly string[]; readonly right: readonly string[] }
  readonly name?: string
  readonly use?: string
  /** A room's finishes as the plan states them; a wall's, the finish of its face in each room beside it. */
  readonly finish?: unknown
  readonly type?: string
  readonly number?: string
  readonly properties?: GlbProperties
  /** A door's: the face it swings to, and its kind as stated. */
  readonly swing?: 'left' | 'right'
  readonly doorKind?: string
}

/** A wall's stretch between rooms' corners: from and to along its axis, and the rooms on each face. */
export interface GlbWallStretch {
  readonly from: number
  readonly to: number
  readonly left: readonly string[]
  readonly right: readonly string[]
  /** With no room on either face because another wall stands across it there: a corner, a partition meeting it. */
  readonly under?: true
}

/** Whether a point lies inside another wall's body (its axis widened by half its thickness). */
function insideWall(point: Vec2, wall: Wall): boolean {
  const reach = wall.thickness / 2 + tolerance('wallContact')
  return wallSegments(wall).some((segment) => {
    const t = Math.max(0, Math.min(segment.length, dot(sub(point, segment.start), segment.dir)))
    const foot = { x: segment.start.x + segment.dir.x * t, y: segment.start.y + segment.dir.y * t }
    return length(sub(point, foot)) <= reach
  })
}

/** One floor's facts, by the kind of part and its id. */
export interface GlbFacts {
  readonly walls: ReadonlyMap<string, GlbPartFacts>
  /** Each wall's stretches, in order along it, covering it start to end. */
  readonly stretches: ReadonlyMap<string, readonly GlbWallStretch[]>
  readonly rooms: ReadonlyMap<string, GlbPartFacts>
  readonly openings: ReadonlyMap<string, GlbPartFacts>
  readonly items: ReadonlyMap<string, GlbPartFacts>
  readonly columns: ReadonlyMap<string, GlbPartFacts>
}

/** The fields of an object whose value is set, so a node never carries a key with nothing in it. */
function stated<T extends object>(facts: T): T {
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined)) as T
}

const sorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort()

/** The finish of a wall's face in a room: the room's own for that wall (CNT-51), else its walls'. */
function faceFinish(room: Room | undefined, wallId: string): string | undefined {
  if (room === undefined) return undefined
  return room.finishes?.faces?.find((face) => face.wall === wallId)?.finish ?? room.finishes?.walls
}

/** The finish of a wall's faces in each room beside it, by room id; undefined when no room states one. */
export function wallFinishes(wallId: string, rooms: readonly string[], byId: ReadonlyMap<string, Room>): Readonly<Record<string, string>> | undefined {
  const finishes = sorted(rooms).flatMap((id) => {
    const finish = faceFinish(byId.get(id), wallId)
    return finish === undefined ? [] : [[id, finish] as const]
  })
  return finishes.length === 0 ? undefined : Object.fromEntries(finishes)
}

/** The rooms on a wall's two faces over a stretch of it, or over the whole wall. */
function sidesOver(stretches: readonly WallStretch[]): { left: string[]; right: string[] } {
  return { left: sorted(stretches.flatMap((s) => s.left)), right: sorted(stretches.flatMap((s) => s.right)) }
}

/** One floor's facts: `plan` is the floor's own plan (`planForFloor`), as its scene was built from. */
export function glbFacts(floorPlan: FloorPlan): GlbFacts {
  const after = planInState(floorPlan, 'after')
  // The parts the scene leaves out (a wall of no length, a room or opening on one) have no node,
  // and cannot be measured: they are left out here too, as `buildScene` leaves them out.
  const { broken } = validatePlan(after)
  const plan = broken.size === 0 ? after : { ...after, walls: after.walls.filter((w) => !broken.has(w.id)), rooms: after.rooms.filter((r) => !broken.has(r.id)), openings: after.openings.filter((o) => !broken.has(o.id)) }
  const index = indexPlan(plan)
  const byId = new Map(plan.rooms.map((room) => [room.id, room] as const))

  const walls = new Map<string, GlbPartFacts>()
  const stretches = new Map<string, readonly GlbWallStretch[]>()
  const wallFacts = (wall: Wall): GlbPartFacts => {
    const sides = wallSides(index, wall.id)
    const along = sides?.stretches ?? []
    const others = plan.walls.filter((other) => other !== wall && other.virtual !== true)
    const under = (s: WallStretch): boolean => s.left.length === 0 && s.right.length === 0 && others.some((other) => insideWall(wallPointAt(wall, (s.from + s.to) / 2), other))
    stretches.set(wall.id, along.map((s) => ({ from: s.from, to: s.to, left: sorted(s.left), right: sorted(s.right), ...(under(s) ? { under: true as const } : {}) })))
    const rooms = sidesOver(along)
    return stated({
      rooms,
      finish: wallFinishes(wall.id, [...rooms.left, ...rooms.right], byId),
      type: wall.wallType,
      properties: wall.properties
    })
  }
  for (const wall of plan.walls) walls.set(wall.id, wallFacts(wall))

  const rooms = new Map<string, GlbPartFacts>()
  for (const room of plan.rooms) {
    rooms.set(room.id, stated({ rooms: [room.id], name: room.name, use: room.use, finish: room.finishes, type: room.roomType, number: room.number, properties: room.properties }))
  }

  const openings = new Map<string, GlbPartFacts>()
  const openingFacts = (opening: Opening): GlbPartFacts => {
    const sides = wallSides(index, opening.wall)
    const span = openingSpan(opening)
    const at = sides === null ? null : stretchAt(sides, (span.from + span.to) / 2)
    return stated({
      rooms: at === null ? undefined : sidesOver([at]),
      type: opening.type === 'door' ? opening.doorType : opening.windowType,
      properties: opening.properties,
      swing: opening.type === 'door' ? opening.swing : undefined,
      doorKind: opening.type === 'door' ? opening.kind : undefined
    })
  }
  for (const opening of plan.openings) openings.set(opening.id, openingFacts(opening))

  const shapes = (plan.items ?? []).length > 0 || (plan.columns ?? []).length > 0 ? roomShapes(index) : []
  const items = new Map<string, GlbPartFacts>()
  const itemFacts = (item: Item): GlbPartFacts => {
    const room = itemRoom(item, shapes)
    return stated({ rooms: room === null ? undefined : [room.id], name: item.label, type: item.kind, properties: item.properties })
  }
  for (const item of plan.items ?? []) items.set(item.id, itemFacts(item))

  const columns = new Map<string, GlbPartFacts>()
  for (const column of plan.columns ?? []) {
    const room = columnRoom(column, shapes)
    columns.set(column.id, stated({ rooms: room === null ? undefined : [room.id], name: column.label, type: column.shape }))
  }

  return { walls, stretches, rooms, openings, items, columns }
}
