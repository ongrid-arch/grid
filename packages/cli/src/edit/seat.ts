/**
 * Where the openings go when an edit changes walls (WRT-3, lab WR-4, WR-3).
 *
 * An opening is drawn from its wall's start (C2), so a wall that grows at its start, or a wall
 * written the other way round, slides every opening on it. After an edit has worked out where
 * its walls go, each opening on a changed wall is put back by what it is kept from:
 *
 * - its `anchor`, when it states one: the distance to an end of its wall, or to a named room's
 *   inside face, is kept;
 * - else its place in the building: the edit says where a point of the building on that wall is
 *   now (`carry`), which is where it was unless the edit moved it.
 *
 * Then a door or doorless opening that would join other rooms than before is carried with the
 * edit's move, when the edit has one, if that keeps it between the same rooms; else it stays
 * and the answer says it could not be kept.
 *
 * Pure: a plan in, offsets and lines out.
 */
import { doorsThatChangedRooms } from '@ongrid/floorplan/geometry/rules/doors'
import { add, dot, scale, sub, tolerance, wallAxis, wallLength, type FloorPlan, type Opening, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { quoted } from '../fs/projectFiles'
import { surveyPlan, type Survey } from '../quantities/survey'
import { EditRefused } from './refused'

type Pair = [number, number]

export const COMPASS: Record<'north' | 'east' | 'south' | 'west', Vec2> = { north: { x: 0, y: 1 }, east: { x: 1, y: 0 }, south: { x: 0, y: -1 }, west: { x: -1, y: 0 } }

export const r3 = (value: number): number => Math.round(value * 1000) / 1000

const pt = (pair: readonly [number, number]): Vec2 => ({ x: pair[0], y: pair[1] })

/** Where a point of the building that lay on the named wall is after the edit. */
export type Carry = (point: Vec2, wall: string) => Vec2

export const STAYS: Carry = (point) => point

export interface Seating {
  /** New offsets, by opening id. */
  readonly offsets: Map<string, number>
  readonly guessed: string[]
  readonly notKept: string[]
}

/** The wall as the edit leaves it. */
function wallAfter(wall: Wall, change: { start?: Pair; end?: Pair } | undefined): Wall {
  return change ? { ...wall, ...(change.start ? { start: change.start } : {}), ...(change.end ? { end: change.end } : {}) } : wall
}

/** Which end of its wall an anchor measures from, or null when the side it names runs across the wall. */
function endOf(wall: Wall, from: NonNullable<Opening['anchor']>['from']): 'start' | 'end' | null {
  if (from === 'start' || from === 'end') return from
  const along = dot(wallAxis(wall).dir, COMPASS[from])
  if (Math.abs(along) < 0.3) return null
  return along > 0 ? 'end' : 'start'
}

/**
 * Where along the wall (from its start) a room's inside face toward `from` meets the wall, for
 * the side of the room on that wall nearest `near`; null when the room has no side on it.
 */
export function roomFaceAlong(survey: Survey, room: string, wall: Wall, from: keyof typeof COMPASS, near: number): number | null {
  const found = survey.byId.get(room)
  if (!found) return null
  const axis = wallAxis(wall)
  const toward = dot(axis.dir, COMPASS[from])
  if (Math.abs(toward) < 0.3) return null
  let best: { lo: number; hi: number; miss: number } | null = null
  for (const edge of found.edges) {
    if (edge.wall?.id !== wall.id) continue
    const a = dot(sub(edge.from, axis.start), axis.dir)
    const b = dot(sub(edge.to, axis.start), axis.dir)
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const miss = near < lo ? lo - near : near > hi ? near - hi : 0
    if (best === null || miss < best.miss) best = { lo, hi, miss }
  }
  if (best === null) return null
  return toward > 0 ? best.hi : best.lo
}

/** The distance from a room's face to an opening's nearer edge, and which way it is measured. */
function faceDistance(face: number, opening: { offset: number; width: number }, fromHigh: boolean): number {
  return fromHigh ? face - (opening.offset + opening.width) : opening.offset - face
}

function placeFromFace(face: number, distance: number, width: number, fromHigh: boolean): number {
  return fromHigh ? face - distance - width : face + distance
}

const label = (o: Opening): string => `${o.type} ${quoted(o.id)}`

/**
 * The offsets of the openings after an edit that moves walls. `walls` holds the edit's wall
 * changes; walls it adds or removes are the edit's own business. Refuses, with nothing done,
 * an opening that would no longer fit on its wall.
 */
export function seatOpenings(
  before: Survey,
  walls: ReadonlyMap<string, { start?: Pair; end?: Pair }>,
  carry: Carry,
  options: { readonly shift?: Vec2; readonly what?: string } = {},
): Seating {
  const plan = before.plan
  const byId = new Map(plan.walls.map((w) => [w.id, w]))
  const offsets = new Map<string, number>()
  const guessed: string[] = []
  const notKept: string[] = []
  if (walls.size === 0) return { offsets, guessed, notKept }
  const what = options.what ?? 'the change'

  const fits = (o: Opening, wall: Wall, offset: number): boolean =>
    offset >= -tolerance('joint') && offset + o.width <= wallLength(wall) + tolerance('joint')
  const refuse = (o: Opening, wall: Wall): never => {
    throw new EditRefused(`${what[0]!.toUpperCase()}${what.slice(1)} would leave ${label(o)} outside its wall ${quoted(wall.id)}; move or remove it first.`)
  }

  // First pass: by an end of the wall, or by its place in the building.
  const roomAnchored: Opening[] = []
  for (const o of plan.openings) {
    const old = byId.get(o.wall)
    if (!old) continue
    if (o.anchor?.room !== undefined) {
      // CNT-22: a curved wall the change leaves as it is keeps its openings where they are; the
      // edits refuse to move a curved wall, so a room's face on it stays where it was.
      if (old.arc !== undefined && !walls.has(o.wall)) continue
      roomAnchored.push(o)
      continue
    }
    const change = walls.get(o.wall)
    if (!change) continue
    const now = wallAfter(old, change)
    const oldAxis = wallAxis(old)
    const newAxis = wallAxis(now)
    let offset: number
    const end = o.anchor ? endOf(old, o.anchor.from) : null
    if (o.anchor && end === null) notKept.push(`${label(o)} is kept from the ${o.anchor.from}, which runs across its wall: it was kept where it is in the building instead.`)
    if (end === 'start') offset = o.offset
    else if (end === 'end') offset = newAxis.length - (oldAxis.length - o.offset)
    else {
      const mid = add(oldAxis.start, scale(oldAxis.dir, o.offset + o.width / 2))
      offset = dot(sub(carry(mid, o.wall), newAxis.start), newAxis.dir) - o.width / 2
    }
    if (!fits(o, now, offset)) refuse(o, now)
    offsets.set(o.id, r3(offset))
  }

  // Second pass: from a named room's face, which needs the rooms as the edit leaves them.
  if (roomAnchored.length > 0) {
    const after = surveyPlan(patchedPlan(plan, walls, offsets))
    for (const o of roomAnchored) {
      const anchor = o.anchor!
      const old = byId.get(o.wall)!
      const now = wallAfter(old, walls.get(o.wall))
      const from = anchor.from as keyof typeof COMPASS
      const fromHigh = dot(wallAxis(old).dir, COMPASS[from]) > 0
      const was = roomFaceAlong(before, anchor.room!, old, from, o.offset + o.width / 2)
      const mid = add(wallAxis(old).start, scale(wallAxis(old).dir, o.offset + o.width / 2))
      const guess = dot(sub(carry(mid, o.wall), wallAxis(now).start), wallAxis(now).dir)
      const is = was === null ? null : roomFaceAlong(after, anchor.room!, now, from, guess)
      if (was === null || is === null) {
        if (walls.has(o.wall)) {
          const offset = guess - o.width / 2
          if (!fits(o, now, offset)) refuse(o, now)
          offsets.set(o.id, r3(offset))
        }
        notKept.push(`${label(o)} is kept from the ${from} side of room ${quoted(anchor.room!)}, which has no side on its wall: it was kept where it is in the building instead.`)
        continue
      }
      const offset = placeFromFace(is, faceDistance(was, o, fromHigh), o.width, fromHigh)
      if (!fits(o, now, offset)) refuse(o, now)
      if (walls.has(o.wall) || Math.abs(offset - o.offset) > tolerance('noLength')) offsets.set(o.id, r3(offset))
    }
  }

  // Doors that would join other rooms follow the move, where that keeps them between the same rooms.
  const shift = options.shift
  const moved = patchedPlan(plan, walls, offsets)
  for (const change of doorsThatChangedRooms(plan, moved)) {
    const o = plan.openings.find((x) => x.id === change.opening)!
    if (o.anchor !== undefined) continue
    const now = wallAfter(byId.get(o.wall)!, walls.get(o.wall))
    // CNT-22: a door on a curved wall is not slid along it: it has no straight way to slide.
    const along = shift && now.arc === undefined ? dot(shift, wallAxis(now).dir) : 0
    const at = offsets.get(o.id) ?? o.offset
    if (Math.abs(along) > tolerance('noLength') && fits(o, now, at + along)) {
      const trial = new Map(offsets).set(o.id, r3(at + along))
      const still = doorsThatChangedRooms(plan, patchedPlan(plan, walls, trial)).some((c) => c.opening === o.id)
      if (!still) {
        offsets.set(o.id, r3(at + along))
        guessed.push(`${label(o)} was carried ${Math.abs(along).toFixed(2)} m with the wall, so it still joins the same rooms.`)
        continue
      }
    }
    notKept.push(`${label(o)} could not stay between the same rooms: they no longer share enough wall where it is. It was left in place.`)
  }
  return { offsets, guessed, notKept }
}

/** The plan with the walls moved and the offsets set, to read it as the edit leaves it. */
export function patchedPlan(plan: FloorPlan, walls: ReadonlyMap<string, { start?: Pair; end?: Pair }>, offsets: ReadonlyMap<string, number>): FloorPlan {
  return {
    ...plan,
    walls: plan.walls.map((w) => wallAfter(w, walls.get(w.id))),
    openings: plan.openings.map((o) => (offsets.has(o.id) ? { ...o, offset: offsets.get(o.id)! } : o)),
  }
}

export { pt }
