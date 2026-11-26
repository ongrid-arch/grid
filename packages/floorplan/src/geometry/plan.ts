/**
 * The plan model, as it arrives from the app.
 *
 * Nothing is redefined here: the types come straight from
 * `../types/floorplan`, which is what the watcher parses and validates
 * with Zod. The only thing this file owns is the index the rest of the module
 * uses to avoid walking arrays on every lookup.
 */

import type {
  FloorPlan as AppFloorPlan,
  Opening,
  Room,
  Wall as AppWall
} from '../types/floorplan'

export type { Dormer, Floor, Opening, OpeningAnchor, OpeningType, Roof, Rooflight, RoofShape, Room, Stair, WallKind } from '../types/floorplan'

/**
 * A divider with no substance: it closes a room's outline but is neither drawn
 * as a wall nor extruded in 3D. It is what makes "the kitchen open to the
 * dining room" representable.
 *
 * The plan schema declares the field (`virtual` in `types/floorplan`), so it
 * survives parsing. It is restated here so the geometry reads it from its own
 * `Wall` type. Without it, an open room has no closable outline and nothing
 * can be drawn — neither the floor in 3D nor the area in the panel.
 */
export type Wall = AppWall & { virtual?: boolean }

export type FloorPlan = Omit<AppFloorPlan, 'walls'> & { walls: Wall[] }

export interface PlanIndex {
  readonly plan: FloorPlan
  readonly wallsById: ReadonlyMap<string, Wall>
  readonly openingsByWall: ReadonlyMap<string, readonly Opening[]>
  /** Which rooms each wall borders. This is where exterior vs interior comes from. */
  readonly roomsByWall: ReadonlyMap<string, readonly Room[]>
}

export function indexPlan(plan: FloorPlan): PlanIndex {
  const wallsById = new Map<string, Wall>()
  for (const wall of plan.walls) wallsById.set(wall.id, wall)

  const openingsByWall = new Map<string, Opening[]>()
  for (const opening of plan.openings) {
    const list = openingsByWall.get(opening.wall)
    if (list) list.push(opening)
    else openingsByWall.set(opening.wall, [opening])
  }

  // Sorting by position along the wall simplifies both the solid-run
  // computation and overlap detection.
  for (const list of openingsByWall.values()) {
    list.sort((a, b) => a.offset - b.offset)
  }

  const roomsByWall = new Map<string, Room[]>()
  for (const room of plan.rooms) {
    for (const wallId of new Set(roomWallIds(room))) {
      const list = roomsByWall.get(wallId)
      if (list) list.push(room)
      else roomsByWall.set(wallId, [room])
    }
  }

  return { plan, wallsById, openingsByWall, roomsByWall }
}

/** Every wall a room lists: round its outline, then round each of its holes (ARE-6). */
export function roomWallIds(room: Room): string[] {
  const holes = room.holes ?? []
  return holes.length === 0 ? room.boundary : [...room.boundary, ...holes.flat()]
}

export function openingsOf(index: PlanIndex, wallId: string): readonly Opening[] {
  return index.openingsByWall.get(wallId) ?? []
}
