/**
 * Entities that may have changed id instead of changing.
 *
 * The assistant rewrites the whole file each turn, and nothing makes it keep
 * ids. A wall that was only moved can come back under a new id and look like a
 * deletion plus an addition. The diff cannot tell, and must not guess: it
 * reports both changes exactly as they are, and adds one issue per pair that
 * overlaps so much that an id change is the likelier story. Merging the pair
 * would hide the very bug the issue exists to surface.
 */

import type { FloorPlan, Opening, PlanIndex, Room, Wall } from '../plan'
import { floorOf } from '../floors'
import { tryRoomPolygon } from '../room'
import { area, centroid, cross, distance, dot, fromTuple, normalize, sub } from '../vec2'
import { english, name, said } from '../../messages/say'
import { matchById } from './match'
import type { DiffIssue, EntityRef } from './types'
import { TOLERANCES, tolerance } from '../tolerances'

/** Walls overlap by this share of the longer one, along a shared line (`diffWallOverlap`). */
export const WALL_OVERLAP = TOLERANCES.diffWallOverlap.value
/** Openings on the same wall closer than this, in metres, are the same place (`diffOpeningOffset`). */
export const OPENING_OFFSET = TOLERANCES.diffOpeningOffset.value
/** Rooms whose areas differ by less than this share of the larger are the same size (`diffRoomAreaShare`). */
export const ROOM_AREA_SHARE = TOLERANCES.diffRoomAreaShare.value
/** Rooms whose centres are closer than this, in metres, are in the same place (`diffRoomCentre`). */
export const ROOM_CENTRE = TOLERANCES.diffRoomCentre.value

/** Share of the longer wall covered by the shorter one, 0 if they are not on one line. */
function wallOverlap(a: Wall, b: Wall): number {
  const lengthOf = (w: Wall): number => distance(fromTuple(w.start), fromTuple(w.end))
  const [longer, shorter] = lengthOf(a) >= lengthOf(b) ? [a, b] : [b, a]
  const total = lengthOf(longer)
  if (total === 0) return 0

  const start = fromTuple(longer.start)
  const dir = normalize(sub(fromTuple(longer.end), start))
  const off = (p: [number, number]): number => Math.abs(cross(dir, sub(fromTuple(p), start)))
  const sameLine = tolerance('diffSameLine')
  if (off(shorter.start) > sameLine || off(shorter.end) > sameLine) return 0

  const along = [shorter.start, shorter.end]
    .map((p) => dot(dir, sub(fromTuple(p), start)))
    .sort((x, y) => x - y)
  const covered = Math.max(0, Math.min(total, along[1]!) - Math.max(0, along[0]!))
  return covered / total
}

function issue(noun: string, removed: EntityRef, added: EntityRef): DiffIssue {
  return {
    code: 'suspected_id_churn',
    message:
      `${noun} ${removed.id} was removed and ${noun.toLowerCase()} ${added.id} was added in ` +
      `the same place: the id may have changed instead`,
    entities: [removed, added]
  }
}

/**
 * CMD-34: two rooms that may be one under a new id, named by the names the person gave them (their
 * id when they have none), as the rest of a comparison names rooms; the ids are in `entities`.
 */
function roomIssue(removed: Room, added: Room): DiffIssue {
  const before = removed.name || removed.id
  const after = added.name || added.id
  return {
    code: 'suspected_id_churn',
    message: english(before === after
      ? said('diff.issue.roomIdChurn.sameName', { room: name(after) })
      : said('diff.issue.roomIdChurn', { before: name(before), after: name(after) })),
    entities: [{ type: 'room', id: removed.id }, { type: 'room', id: added.id }]
  }
}

interface Footprint {
  readonly area: number
  readonly centre: { x: number; y: number }
}

function footprint(room: Room, index: PlanIndex): Footprint | null {
  const polygon = tryRoomPolygon(room, index)
  return polygon === null ? null : { area: area(polygon), centre: centroid(polygon) }
}

function byFloor<T>(items: readonly T[], floorOfItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = floorOfItem(item)
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  return groups
}

export function idChurn(
  base: FloorPlan,
  head: FloorPlan,
  baseIndex: PlanIndex,
  headIndex: PlanIndex,
  epsilon: number
): DiffIssue[] {
  const issues: DiffIssue[] = []

  // Walls: the same line, the same thickness, the same floor.
  const walls = matchById(base.walls, head.walls)
  const renamed = new Map<string, string>() // removed wall id -> added wall id
  const addedByFloor = byFloor(walls.added, floorOf)
  for (const removed of walls.removed) {
    for (const added of addedByFloor.get(floorOf(removed)) ?? []) {
      if (Math.abs(removed.thickness - added.thickness) > epsilon) continue
      if (wallOverlap(removed, added) < tolerance('diffWallOverlap')) continue
      if (!renamed.has(removed.id)) renamed.set(removed.id, added.id)
      issues.push(issue('Wall', { type: 'wall', id: removed.id }, { type: 'wall', id: added.id }))
    }
  }
  const hostOf = (wallId: string): string => renamed.get(wallId) ?? wallId

  // Openings: the same wall (or the wall it was rebuilt as) and nearly the same offset.
  const openings = matchById(base.openings, head.openings)
  const addedByHost = new Map<string, Opening[]>()
  for (const added of openings.added) {
    const list = addedByHost.get(added.wall)
    if (list) list.push(added)
    else addedByHost.set(added.wall, [added])
  }
  for (const removed of openings.removed) {
    for (const added of addedByHost.get(hostOf(removed.wall)) ?? []) {
      if (Math.abs(removed.offset - added.offset) > tolerance('diffOpeningOffset')) continue
      issues.push(
        issue('Opening', { type: 'opening', id: removed.id }, { type: 'opening', id: added.id })
      )
    }
  }

  // Rooms: the same walls (as rebuilt), or the same size in the same place.
  const rooms = matchById(base.rooms, head.rooms)
  const addedRooms = byFloor(rooms.added, floorOf)
  for (const removed of rooms.removed) {
    const walls = new Set(removed.boundary.map(hostOf))
    const was = footprint(removed, baseIndex)
    for (const added of addedRooms.get(floorOf(removed)) ?? []) {
      const sameWalls =
        walls.size === new Set(added.boundary).size && added.boundary.every((id) => walls.has(id))
      let sameSpot = false
      const is = was === null ? null : footprint(added, headIndex)
      if (was !== null && is !== null) {
        const larger = Math.max(was.area, is.area)
        sameSpot =
          larger > 0 &&
          Math.abs(was.area - is.area) <= tolerance('diffRoomAreaShare') * larger &&
          distance(was.centre, is.centre) <= tolerance('diffRoomCentre')
      }
      if (sameWalls || sameSpot) {
        issues.push(roomIssue(removed, added))
      }
    }
  }

  return issues
}
