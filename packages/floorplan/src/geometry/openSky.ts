/**
 * Floor open to the sky (LVL-12): enclosed floor that no room claims and that is the outside.
 *
 * The walls of a floor enclose spaces (`spaces.ts`). A space no room on its floor claims is, by
 * default, floor someone has not drawn as a room yet (ARE-4): it carries a slab and a roof, its
 * walls stand inside, and the check says it belongs to no room. It is the open sky instead, a
 * courtyard not drawn as one, when the plan says so in one of two ways:
 *
 * - **a window looks into it**: a window in a wall that a room on the floor lies against on one
 *   face, with the space on the other. A window looks outside; a wardrobe left out of the rooms
 *   has none into it, so it stays floor.
 * - **it lies over open sky**: the greater part of it lies, on the floors of the next level down,
 *   over outdoor space with no roof (a courtyard, a light well) or over floor open to the sky
 *   there, worked out the same way, floor by floor down. The open sky over a courtyard on the
 *   ground floor is open on every floor drawn round it.
 *
 * Open floor has no slab and no roof (`envelope.ts`), a wall beside it faces outside
 * (`exposure.ts`), and the check does not call it floor no room claims (`validate.ts`). The gross
 * areas still count it: an outdoor space drawn as one (CNT-7, C26) is what takes floor off them.
 *
 * A floor that states an outline (BRF-4, C17) is massing, all of it floor no room claims yet:
 * none of it is read as open. Pure: rooms' outlines and the plan's levels, never a wall's
 * exposure, so the exposure can ask. Never throws.
 */

import type { FloorPlan, PlanIndex, Room } from './plan'
import { floorOf, planFloors, wallsOnFloor } from './floors'
import { floorSpaces, spacesKnown, type FloorPiece, type FloorSpaces, type FloorSpacesUnknown } from './spaces'
import { tryRoomShape } from './room'
import { isOutdoor, outdoorRoofed } from './outdoor'
import { roomZones } from './zones'
import { statedOutline } from './massing'
import { withPatterns } from './patterns'
import { wallFrameAt } from './wall'
import { tolerance, tolerancesAsStated } from './tolerances'
import { cutOutline, multiArea, ringOf } from './polygons'
import type { MultiPolygon } from 'polygon-clipping'
import type { Vec2 } from './vec2'

/** Why a space no room claims is open: a window looks into it, or it lies over open sky. */
export type OpenSkyReason = 'window' | 'below'

/** A space of a floor that no room claims and that is open to the sky. */
export interface OpenSpace extends FloorPiece {
  readonly reason: OpenSkyReason
}

interface Shaped {
  readonly room: Room
  readonly polygon: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
}

interface Worked {
  readonly spaces: Map<string, FloorSpaces | FloorSpacesUnknown>
  readonly rooms: Map<string, Shaped[]>
  readonly open: Map<string, readonly OpenSpace[]>
  readonly below: Map<string, MultiPolygon>
  floors?: { readonly id: string; readonly level: number }[]
}

const cache = new WeakMap<PlanIndex, Worked>()

function workedFor(index: PlanIndex): Worked {
  const stated = tolerancesAsStated()
  let found = stated ? cache.get(index) : undefined
  if (found === undefined) {
    found = { spaces: new Map(), rooms: new Map(), open: new Map(), below: new Map() }
    if (stated) cache.set(index, found)
  }
  return found
}

function inRing(p: Vec2, ring: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

/** Whether a point lies in a piece of floor: in its outer ring and in none of its islands. */
export const inPiece = (p: Vec2, piece: Pick<FloorPiece, 'rings' | 'min' | 'max'>): boolean => {
  const [outer, ...islands] = piece.rings
  return (
    outer !== undefined &&
    p.x >= piece.min.x && p.x <= piece.max.x && p.y >= piece.min.y && p.y <= piece.max.y &&
    inRing(p, outer) &&
    !islands.some((ring) => inRing(p, ring))
  )
}

const inShape = (p: Vec2, shape: Shaped): boolean => inRing(p, shape.polygon) && !shape.holes.some((hole) => inRing(p, hole))

/** The spaces the walls of a floor enclose (`floorSpaces` on the whole plan), once per index. */
export function enclosedSpaces(index: PlanIndex, floor: string): FloorSpaces | FloorSpacesUnknown {
  const worked = workedFor(index)
  let found = worked.spaces.get(floor)
  if (found === undefined) {
    found = floorSpaces(index.plan, floor, { index })
    worked.spaces.set(floor, found)
  }
  return found
}

/** The rooms of a floor whose outline closes, zones aside, with their shapes. */
function roomsOn(index: PlanIndex, floor: string): Shaped[] {
  const worked = workedFor(index)
  let found = worked.rooms.get(floor)
  if (found === undefined) {
    const zones = roomZones(index).zoneOf
    found = index.plan.rooms.flatMap((room) => {
      if (floorOf(room) !== floor || zones.has(room.id)) return []
      const shape = tryRoomShape(room, index)
      return shape === null || shape.polygon.length < 3 ? [] : [{ room, polygon: shape.polygon, holes: shape.holes }]
    })
    worked.rooms.set(floor, found)
  }
  return found
}

const levelOf = (level: number): number => (Number.isFinite(level) ? level : 0)

function floorsOf(index: PlanIndex): { readonly id: string; readonly level: number }[] {
  const worked = workedFor(index)
  if (worked.floors === undefined) {
    try {
      worked.floors = planFloors(index.plan).map((f) => ({ id: f.id, level: levelOf(f.level) }))
    } catch {
      worked.floors = []
    }
  }
  return worked.floors
}

/** The floors on the next level down from `floor`; none for the lowest level. */
function floorsBelow(index: PlanIndex, floor: string): string[] {
  const floors = floorsOf(index)
  const own = floors.find((f) => f.id === floor)
  if (own === undefined) return []
  const lower = floors.filter((f) => f.level < own.level).map((f) => f.level)
  if (lower.length === 0) return []
  const next = Math.max(...lower)
  return floors.filter((f) => f.level === next).map((f) => f.id)
}

const polygonOf = (rings: readonly (readonly Vec2[])[]): MultiPolygon => [rings.map((ring) => ringOf([...ring]))]

/**
 * What is open to the sky on the floors of the next level down from `floor`, on plan: their
 * outdoor spaces with no roof and their open floor. Empty on the lowest level.
 */
function openUnder(index: PlanIndex, floor: string): MultiPolygon {
  const worked = workedFor(index)
  let found = worked.below.get(floor)
  if (found === undefined) {
    const pieces: MultiPolygon[] = []
    for (const lower of floorsBelow(index, floor)) {
      for (const shape of roomsOn(index, lower)) {
        if (isOutdoor(shape.room) && outdoorRoofed(shape.room) === false) pieces.push(polygonOf([shape.polygon, ...shape.holes]))
      }
      for (const space of openSky(index, lower)) pieces.push(polygonOf(space.rings))
    }
    found = pieces.length === 0 ? [] : (cutOutline('union', pieces[0]!, pieces.slice(1)) ?? [])
    worked.below.set(floor, found)
  }
  return found
}

/**
 * Whether a point of `floor` lies over open sky: in an outdoor space with no roof, or in open
 * floor, on a floor of the next level down. False on the lowest level.
 */
export function openBelow(index: PlanIndex, floor: string, p: Vec2): boolean {
  const under = openUnder(index, floor)
  return under.some((polygon) => {
    const [outer, ...holes] = polygon
    const ring = (r: readonly [number, number][]): Vec2[] => r.map(([x, y]) => ({ x, y }))
    return outer !== undefined && inRing(p, ring(outer)) && !holes.some((hole) => inRing(p, ring(hole)))
  })
}

/** How much of a piece lies over open sky, in square metres. */
function areaOver(index: PlanIndex, floor: string, rings: readonly (readonly Vec2[])[]): number {
  const under = openUnder(index, floor)
  if (under.length === 0) return 0
  const over = cutOutline('intersection', polygonOf(rings), [under])
  return over === null ? 0 : multiArea(over)
}

/** Whether a window looks into the space from a room of the floor. */
function windowInto(index: PlanIndex, floor: string, space: FloorPiece, plan: FloorPlan): boolean {
  const rooms = roomsOn(index, floor).filter((shape) => !isOutdoor(shape.room))
  if (rooms.length === 0) return false
  const walls = new Map(wallsOnFloor(index.plan, floor).map((wall) => [wall.id, wall] as const))
  for (const opening of plan.openings) {
    if (opening.type !== 'window') continue
    const wall = walls.get(opening.wall)
    if (wall === undefined || wall.virtual === true) continue
    let frame: ReturnType<typeof wallFrameAt>
    try {
      frame = wallFrameAt(wall, opening.offset + opening.width / 2)
    } catch {
      continue
    }
    const step = wall.thickness / 2 + tolerance('stepPastFace')
    const left = { x: frame.point.x + frame.normal.x * step, y: frame.point.y + frame.normal.y * step }
    const right = { x: frame.point.x - frame.normal.x * step, y: frame.point.y - frame.normal.y * step }
    for (const [into, from] of [[left, right], [right, left]] as const) {
      if (inPiece(into, space) && rooms.some((shape) => inShape(from, shape))) return true
    }
  }
  return false
}

/**
 * The spaces of a floor that no room claims and that are open to the sky, each with why (see the
 * module's header). Worked out once per index; empty for a floor whose spaces cannot be worked
 * out, and for one that states an outline. Never throws.
 */
export function openSky(index: PlanIndex, floor: string): readonly OpenSpace[] {
  const worked = workedFor(index)
  const known = worked.open.get(floor)
  if (known !== undefined) return known
  // Set before it is worked out, so a floor that is somehow its own floor below ends the climb.
  worked.open.set(floor, [])
  let open: OpenSpace[] = []
  try {
    const result = statedOutline(index.plan, floor) === null ? enclosedSpaces(index, floor) : null
    const unclaimed = result !== null && spacesKnown(result) ? result.spaces.filter((space) => space.rooms.length === 0) : []
    if (unclaimed.length > 0) {
      const plan = withPatterns(index.plan)
      open = unclaimed.flatMap((space): OpenSpace[] => {
        const piece: FloorPiece = { rings: space.rings, area: space.area, at: space.at, min: space.min, max: space.max, walls: space.walls }
        if (windowInto(index, floor, piece, plan)) return [{ ...piece, reason: 'window' }]
        return areaOver(index, floor, piece.rings) * 2 > piece.area ? [{ ...piece, reason: 'below' }] : []
      })
    }
  } catch {
    open = []
  }
  worked.open.set(floor, open)
  return open
}

/** Whether a point of a floor lies in floor open to the sky there. */
export function inOpenSky(index: PlanIndex, floor: string, p: Vec2): boolean {
  return openSky(index, floor).some((space) => inPiece(p, space))
}
