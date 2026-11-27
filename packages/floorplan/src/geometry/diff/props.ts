/**
 * Which properties of an entity differ between two versions.
 *
 * Numbers are equal when they are within the tolerance of each other; that is
 * a distance, not a rounding, so a value sitting on the edge of a rounding
 * grid cannot flicker between "changed" and "unchanged". Nothing is rewritten:
 * a change carries the plan's own numbers.
 */

import type { Floor, Opening, Room, Wall } from '../plan'
import type { Phase } from '../../types/floorplan'
import { floorOf } from '../floors'
import type { PropChange } from './types'
import { tolerance } from '../tolerances'

type Point = readonly [number, number]

function near(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon
}

function number(
  key: string,
  before: number,
  after: number,
  epsilon: number
): PropChange | null {
  return near(before, after, epsilon) ? null : { key, before, after }
}

function point(key: string, before: Point, after: Point, epsilon: number): PropChange | null {
  return near(before[0], after[0], epsilon) && near(before[1], after[1], epsilon)
    ? null
    : { key, before: [before[0], before[1]], after: [after[0], after[1]] }
}

function exact(
  key: string,
  before: string | boolean,
  after: string | boolean
): PropChange | null {
  return before === after ? null : { key, before, after }
}

function present(changes: readonly (PropChange | null)[]): PropChange[] {
  return changes.filter((change): change is PropChange => change !== null)
}

/** In the schema's own order, so the result does not depend on how it was found. */
export function wallProps(before: Wall, after: Wall, epsilon: number): PropChange[] {
  return present([
    point('start', before.start, after.start, epsilon),
    point('end', before.end, after.end, epsilon),
    number('thickness', before.thickness, after.thickness, epsilon),
    number('height', before.height, after.height, epsilon),
    exact('kind', before.kind, after.kind),
    // Unstated and `false` are the same wall.
    exact('virtual', before.virtual === true, after.virtual === true),
    exact('floor', floorOf(before), floorOf(after)),
    arcProp(before, after, epsilon),
    // WRT-86: the type it takes (C24), as the reading filled it; null on the side that takes none.
    optionalText('wallType', before.wallType, after.wallType)
  ])
}

/** WRT-86: a name a part may leave out: stated and unstated differ, and `null` stands for unstated. */
function optionalText(key: string, before: string | undefined, after: string | undefined): PropChange | null {
  return before === after ? null : { key, before: before ?? null, after: after ?? null }
}

/**
 * CNT-18: a wall's curve as a property, its `arc` written as JSON, null on the side that is
 * straight. The sweep is compared in degrees within the same tolerance as a length.
 */
function arcProp(before: Wall, after: Wall, epsilon: number): PropChange | null {
  const value = (wall: Wall): [number, number, number] | null => (wall.arc === undefined ? null : [wall.arc.centre[0], wall.arc.centre[1], wall.arc.sweep])
  const [a, b] = [value(before), value(after)]
  if (a === null && b === null) return null
  if (a !== null && b !== null && a.every((v, i) => near(v, b[i]!, epsilon))) return null
  const text = (v: readonly number[] | null): string | null => (v === null ? null : JSON.stringify({ centre: [v[0], v[1]], sweep: v[2] }))
  return { key: 'arc', before: text(a), after: text(b) }
}

/** A number a part may leave unstated: stated or taken out is a change, null on the unstated side. */
function optionalNumber(key: string, before: number | undefined, after: number | undefined, epsilon: number): PropChange | null {
  if (before === undefined && after === undefined) return null
  if (before === undefined || after === undefined) return { key, before: before ?? null, after: after ?? null }
  return number(key, before, after, epsilon)
}

/**
 * A room's holes as a property (ARE-6): one entry per hole, its wall ids written as JSON, so a
 * list of lists stays a list of text. Null on the side that states none.
 */
function holesProp(before: Room, after: Room): PropChange | null {
  const text = (room: Room): string[] => (room.holes ?? []).map((hole) => JSON.stringify(hole))
  const [a, b] = [text(before), text(after)]
  if (a.length === b.length && a.every((hole, i) => hole === b[i])) return null
  return { key: 'holes', before: before.holes === undefined ? null : a, after: after.holes === undefined ? null : b }
}

/**
 * Whether two wall lists go round the same ring (WRT-8, lab U-4): the same walls in the same
 * cyclic order, from any wall and either way round. A room whose list starts at another wall is
 * the same outline; walls in another order are not.
 */
export function sameRing(a: readonly string[], b: readonly string[]): boolean {
  const n = a.length
  if (n !== b.length) return false
  if (n === 0) return true
  for (const step of [1, -1]) {
    for (let start = 0; start < n; start++) {
      if (b[start] !== a[0]) continue
      let all = true
      for (let i = 0; i < n && all; i++) all = a[i] === b[(((start + step * i) % n) + n) % n]
      if (all) return true
    }
  }
  return false
}

export function roomProps(before: Room, after: Room, epsilon: number): PropChange[] {
  const sameBoundary = sameRing(before.boundary, after.boundary)
  return present([
    exact('name', before.name, after.name),
    // C3 gives the order meaning: the same walls in another order are a change. The same ring
    // from another wall, or the other way round, is the same outline (WRT-8, lab U-4).
    sameBoundary ? null : { key: 'boundary', before: [...before.boundary], after: [...after.boundary] },
    // ARE-6. No holes stated and an empty list are the same room.
    holesProp(before, after),
    exact('floor', floorOf(before), floorOf(after)),
    // ARE-5. Unstated and `false` are the same room.
    exact('inside', before.inside === true, after.inside === true),
    // CNT-8. Unstated, read as '', is a room of its own.
    exact('partOf', before.partOf ?? '', after.partOf ?? ''),
    // ARE-10. Unstated is not a height: the room follows its walls.
    optionalNumber('height', before.height, after.height, epsilon),
    // LVL-7. Unstated is the storey's own floor, so 0 and unstated are the same room.
    number('floorOffset', before.floorOffset ?? 0, after.floorOffset ?? 0, epsilon)
  ])
}

/** A number a part may leave out (LVL-1): stated and unstated differ, and `null` stands for unstated. */
function optional(key: string, before: number | undefined, after: number | undefined, epsilon: number): PropChange | null {
  if (before === undefined && after === undefined) return null
  if (before === undefined || after === undefined) return { key, before: before ?? null, after: after ?? null }
  return number(key, before, after, epsilon)
}

export function floorProps(before: Floor, after: Floor): PropChange[] {
  const epsilon = tolerance('diffLength')
  return present([
    exact('name', before.name, after.name),
    number('level', before.level, after.level, 0),
    optional('elevation', before.elevation, after.elevation, epsilon),
    optional('height', before.height, after.height, epsilon),
    optional('slab', before.slab, after.slab, epsilon)
  ])
}

export function openingProps(before: Opening, after: Opening, epsilon: number): PropChange[] {
  return present([
    exact('wall', before.wall, after.wall),
    exact('type', before.type, after.type),
    number('offset', before.offset, after.offset, epsilon),
    number('width', before.width, after.width, epsilon),
    number('sill', before.sill, after.sill, epsilon),
    number('height', before.height, after.height, epsilon),
    // WRT-86: the door or window type it takes (C24).
    optionalText('doorType', before.doorType, after.doorType),
    optionalText('windowType', before.windowType, after.windowType)
  ])
}

/**
 * MSG-25: a part's phase (C16) as each version reads it (`read`, the earlier's and the later's
 * `phaseReading`), compared only where one of the two states a phase on the part: a part that
 * states none on either side takes it from its wall or the plan's base, which their own lines
 * say. None when the comparison leaves phases out (`read` null).
 */
export function phaseProp<T extends { readonly phase?: Phase }>(before: T, after: T, read: readonly [(part: T) => Phase, (part: T) => Phase] | null): PropChange[] {
  if (read === null || (before.phase === undefined && after.phase === undefined)) return []
  const [was, is] = [read[0](before), read[1](after)]
  return was === is ? [] : [{ key: 'phase', before: was, after: is }]
}
