/**
 * Two versions of a plan compared by what stands where in the building (WRT-8).
 *
 * The earlier plan is laid on the later one first (`alignPlans`): walls paired by where they
 * stand, with a shifted origin, before any id; then the id diff (`diffPlans`) compares the
 * pairs. What comes back is read the way a person reads a change, cheapest first:
 *
 * - the issues: a door that now joins other rooms (MSG-14), an opening a changed wall now
 *   meets, a room that no longer closes, the notes of the drawing check that came and went;
 * - a short verdict, room by room, with how many ids were only renamed;
 * - the changes, one line each;
 * - with rooms named, the changes outside them (the scope check);
 * - what a picture marks: removed, added, and the rooms that changed with their old and new area.
 *
 * Before anything is paired, the later plan is tried as the earlier one mirrored or turned a
 * quarter (WRT-4, `turn.ts`): a flat flipped left to right is said to be mirrored, in the
 * verdict's first sentence, with whether every room kept its size, and what else changed is
 * listed from there, not as every wall moved (lab Y-5, WR-16).
 *
 * A plan written rooms first (both versions carry `written`, WRT-2) is compared at the level of
 * its rooms and openings, whose names the author chose: its walls are worked out from the rooms
 * and named by where they are, so a wall list is no way to say what changed (lab RT-8). A room
 * that kept its size and moved is said to have moved.
 *
 * WRT-12: an opening with no change of its own is said by where it went in the building: one
 * that moved with its wall, or along it with its room, is said to have moved with it, how far
 * and which way; one that did not move though its wall changed stayed where it was.
 *
 * WRT-32: a room in both versions says every change it went through in one line: renamed and
 * moved as it was, its id changed (named, though no change line), and a room that took another in,
 * with the walls taken out between them; the room that went is said to have merged into it, not
 * to be lost.
 *
 * Pure: plans in, plain data out. Every word comes from the plans' own names and figures.
 */

import type { FloorPlan, Opening, PlanIndex, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomFloorArea, tryRoomPolygon } from '../room'
import { doorsThatChangedRooms, openingFaces } from '../rules/doors'
import { areaText, metresText } from '../rounding'
import { quoted } from '../../types/planText'
import type { Phase } from '../../types/floorplan'
import { english, joined, name, num, said, sayValue } from '../../messages/say'
import { planAreaFigures } from '../areas'
import { floorOf, planFloors } from '../floors'
import { tolerance } from '../tolerances'
import type { Vec2 } from '../vec2'
import { roomWallCauses } from './causes'
import { compareText } from './order'
import { alignPlans, wallStretches, withinItsThickness, type Redrawn, type RenamedId } from './place'
import { findTurn, turnPlan, type PlanTurn } from './turn'
import { diffPlans } from './diff'
import { phaseWords } from './summary'
import { floorChanges, type FloorChange } from './floors'
import { compareMassing, type MassingComparison } from './massing'
import { withPatterns } from '../patterns'
import { changesOutsideScope } from './scope'
import type { DiffIssue, EntityRef, IssueCode, PlanChange, PlanDiff } from './types'

export const BUILDING_COMPARISON_VERSION = 1 as const

export type ComparisonIssueCode =
  | IssueCode
  /** MSG-14: a door or doorless opening that joins other rooms than it did. */
  | 'door_joins_other_rooms'
  /** A wall that was added or moved now meets another wall inside an opening of it. */
  | 'opening_crossed'
  /** A note of the drawing check the later version has and the earlier did not. */
  | 'note_added'
  /** A note of the earlier version the later one no longer has. */
  | 'note_gone'

export interface ComparisonIssue {
  readonly code: ComparisonIssueCode
  readonly message: string
  readonly entities: readonly EntityRef[]
}

export type RoomStatus = 'unchanged' | 'changed' | 'moved' | 'added' | 'removed'

export interface RoomVerdict {
  /** The later id; the earlier id for a room that was removed. */
  readonly room: string
  readonly name: string
  readonly status: RoomStatus
  /** Net m², as Grid measures the room; null when it did not exist or could not close. */
  readonly before: number | null
  readonly after: number | null
  /** How far a room that kept its size moved, in metres; null otherwise. WRT-32: a changed room that kept its size too. */
  readonly moved: number | null
  /** WRT-32: which way it moved, in metres east and north on the drawing, when `moved` is set; null otherwise. */
  readonly by: readonly [number, number] | null
  /** WRT-32: its id in the earlier version when that was another, said in its text; null when it kept its id. */
  readonly idBefore: string | null
  /** WRT-32: the rooms of the earlier version merged into it, by their ids in `aligned`; empty when none was. */
  readonly mergedWith: readonly string[]
  /** WRT-32: the walls taken out between it and the rooms merged into it, by their ids in `aligned`. */
  readonly wallsTakenOut: readonly string[]
  /** WRT-32: for a room removed, the later room it was merged into; null otherwise. */
  readonly mergedInto: string | null
  /** WRT-19: the walls its floor grew or shrank by, by later id, named in its text; empty when none is. */
  readonly walls: readonly string[]
  readonly text: string
}

export interface ChangeLine {
  readonly text: string
  /** The parts it is about, by the later plan's ids (an earlier one keeps its own). */
  readonly entities: readonly EntityRef[]
  /** The rooms it is about, by later id: what the scope check reads. */
  readonly rooms: readonly string[]
}

/** What a picture of the comparison marks. Ids are the aligned earlier plan's for `removed`, the later plan's otherwise. */
export interface ComparisonMarks {
  /** Only what is gone. */
  readonly removed: { readonly walls: readonly string[]; readonly openings: readonly string[]; readonly rooms: readonly string[] }
  /** Only what is new: a wall that moved or a door that was widened is changed (WRT-12). */
  readonly added: { readonly walls: readonly string[]; readonly openings: readonly string[]; readonly rooms: readonly string[] }
  /** In both versions and changed: walls whose ends or thickness changed and openings that changed, under ids both share. */
  readonly changed: { readonly walls: readonly string[]; readonly openings: readonly string[] }
  /** Rooms in both versions that changed or moved, with the words for their label. */
  readonly changedRooms: readonly { readonly room: string; readonly label: string }[]
  /**
   * MSG-27: the stretches a wall in both versions gained (`added`, on the later wall) or lost
   * (`removed`, on the aligned earlier wall) along its line, from and to on its centre line in
   * plan metres, with its thickness. The rest of such a wall stood where it stands: it is not
   * marked changed for its length alone.
   */
  readonly stretches: readonly WallStretchMark[]
}

/** MSG-27: a stretch of a wall gained or lost along its line. */
export interface WallStretchMark {
  /** The later id for a stretch added; the aligned earlier plan's for one removed. */
  readonly wall: string
  readonly kind: 'added' | 'removed'
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly thickness: number
}

/** A line of the drawing check, as `inspectPlan` gives it: only what is needed to follow it. */
export interface NoteLike {
  readonly code: string
  readonly thing: { readonly kind: string; readonly id: string }
  readonly also: readonly string[]
  readonly message: string
}

export interface CompareOptions {
  /** The rooms the author meant to edit, by later id: the scope check. Nothing checked when left out. */
  readonly rooms?: readonly string[]
  /** The notes of the drawing check on each version, to say which came and went. */
  readonly notes?: { readonly before: readonly NoteLike[]; readonly after: readonly NoteLike[] }
  /**
   * MSG-25: whether a wall, opening or room whose phase changed is said. Default true; false for
   * a plan compared with itself by phase, whose pairs are one part before and after its work.
   */
  readonly phases?: boolean
}

export interface OpeningMovedWith {
  /** The later id. */
  readonly opening: string
  readonly text: string
  /** What it moved with: its wall, or a room that moved as it was. */
  readonly with: 'wall' | 'room'
  /** How far its middle moved on the drawing, in metres, east and north. */
  readonly by: readonly [number, number]
}

export interface BuildingComparison {
  readonly version: typeof BUILDING_COMPARISON_VERSION
  /** Both versions were written rooms first: compared by rooms and openings. */
  readonly roomsFirst: boolean
  /** What was added to every earlier coordinate to lay it on the later plan. */
  readonly shift: readonly [number, number]
  readonly renamed: {
    readonly count: number
    readonly walls: number
    readonly openings: number
    readonly rooms: number
    readonly pairs: readonly RenamedId[]
  }
  /** Walls one version draws as one and the other as several pieces end to end: no change. */
  readonly redrawn: readonly Redrawn[]
  /**
   * WRT-4: the later plan is the earlier one mirrored or turned, and everything else is compared
   * from there; null when it is not. The verdict says it first.
   */
  readonly turn: PlanTurn | null
  /** The verdict's first sentence when the plan is mirrored or turned: the turn, and whether every room kept its size. */
  readonly turnLine: string | null
  /** Nothing stands anywhere else and nothing changed: ids aside, the same building. False for a plan mirrored or turned. */
  readonly sameBuilding: boolean
  /**
   * WRT-25: the floors in both versions that stand elsewhere or changed their level, elevation,
   * height, slab or name, with the old and new figures; each is a floor line, said first.
   */
  readonly floors: readonly FloorChange[]
  /**
   * MSG-27: the massing and the site, which walls and rooms say nothing of: each floor's outline,
   * homes and parking, the buildings, the plot and its things, each a change line said after the
   * floors', and the figures side by side.
   */
  readonly massing: MassingComparison
  readonly verdict: string
  readonly rooms: readonly RoomVerdict[]
  readonly changes: readonly ChangeLine[]
  readonly issues: readonly ComparisonIssue[]
  /** Openings whose wall moved, grew or was replaced and which stayed where they were in the building. */
  readonly stayed: readonly { readonly opening: string; readonly text: string }[]
  /**
   * WRT-12: openings with no change of their own that moved in the building with their wall, or
   * along it with the room they are in. Not change lines: they follow from the wall or room.
   */
  readonly movedWith: readonly OpeningMovedWith[]
  readonly scope: { readonly checked: boolean; readonly rooms: readonly string[]; readonly outside: readonly ChangeLine[] }
  readonly marks: ComparisonMarks
  /** The earlier plan, laid on the later one and under its ids: what a picture draws as removed. */
  readonly aligned: FloorPlan
  /** The id diff of the aligned earlier plan against the later one. */
  readonly diff: PlanDiff
}

// ── Measuring ─────────────────────────────────────────────────────────────────────────────

interface Box {
  readonly min: Vec2
  readonly max: Vec2
}

interface RoomShape {
  readonly polygon: readonly Vec2[] | null
  readonly area: number | null
  readonly box: Box | null
  /** Four corners on the axes: its size can be said as width × depth. */
  readonly rectangle: boolean
}

function shapes(plan: FloorPlan, index: PlanIndex): Map<string, RoomShape> {
  const found = new Map<string, RoomShape>()
  for (const room of plan.rooms) {
    const polygon = tryRoomPolygon(room, index)
    if (polygon === null || polygon.length === 0) {
      found.set(room.id, { polygon: null, area: null, box: null, rectangle: false })
      continue
    }
    const xs = polygon.map((p) => p.x)
    const ys = polygon.map((p) => p.y)
    const box = { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } }
    const near = tolerance('diffLength')
    const onBox = polygon.every((p) => (Math.abs(p.x - box.min.x) <= near || Math.abs(p.x - box.max.x) <= near) && (Math.abs(p.y - box.min.y) <= near || Math.abs(p.y - box.max.y) <= near))
    found.set(room.id, { polygon, area: roomFloorArea(room, index, polygon), box, rectangle: polygon.length === 4 && onBox })
  }
  return found
}

function inside(p: Vec2, polygon: readonly Vec2[]): boolean {
  let within = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) within = !within
  }
  return within
}

/** A point on a room's floor: the middle of its box when that is on it, else its first corner's neighbourhood. */
function pointIn(shape: RoomShape): Vec2 | null {
  if (shape.polygon === null || shape.box === null) return null
  const middle = { x: (shape.box.min.x + shape.box.max.x) / 2, y: (shape.box.min.y + shape.box.max.y) / 2 }
  return inside(middle, shape.polygon) ? middle : null
}

/** The rooms of the other version whose floor holds this room's middle: where an added room was carved from, or a removed one went. */
function roomsUnder(shape: RoomShape, others: ReadonlyMap<string, RoomShape>): string[] {
  const at = pointIn(shape)
  if (at === null) return []
  return [...others].filter(([, other]) => other.polygon !== null && inside(at, other.polygon)).map(([id]) => id)
}

const sizeText = (box: Box): string => `${metresText(box.max.x - box.min.x)} × ${metresText(box.max.y - box.min.y)} m`
const areaWords = (value: number | null): string => (value === null ? 'not measured' : `${areaText(value)} m²`)
const nameOf = (room: Room): string => quoted(room.name || room.id)

/** "0.30 m east", "0.20 m east and 0.10 m north": the sides of the drawing, north at the top. */
function moveWords(dx: number, dy: number): string {
  const least = tolerance('diffMovement')
  const parts: string[] = []
  if (Math.abs(dx) >= least) parts.push(`${metresText(Math.abs(dx))} m ${dx > 0 ? 'east' : 'west'}`)
  if (Math.abs(dy) >= least) parts.push(`${metresText(Math.abs(dy))} m ${dy > 0 ? 'north' : 'south'}`)
  return `${parts.join(' and ')} on the drawing`
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function axisOf(wall: Wall): { start: Vec2; dir: Vec2; length: number } | null {
  const dx = wall.end[0] - wall.start[0]
  const dy = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dy)
  return length === 0 ? null : { start: { x: wall.start[0], y: wall.start[1] }, dir: { x: dx / length, y: dy / length }, length }
}

function middle(opening: Opening, wall: Wall | undefined): Vec2 | null {
  const axis = wall === undefined ? null : axisOf(wall)
  if (axis === null) return null
  const along = opening.offset + opening.width / 2
  return { x: axis.start.x + axis.dir.x * along, y: axis.start.y + axis.dir.y * along }
}

/** The jamb a door hangs from and the face it opens to, as directions on the plan: free of which way its wall runs. */
function handing(opening: Opening, wall: Wall | undefined): { hinge: Vec2 | null; swing: Vec2 | null } {
  const axis = wall === undefined ? null : axisOf(wall)
  if (axis === null) return { hinge: null, swing: null }
  const hinge = opening.hinge === undefined ? null : opening.hinge === 'start' ? { x: -axis.dir.x, y: -axis.dir.y } : axis.dir
  const left = { x: -axis.dir.y, y: axis.dir.x }
  const swing = opening.swing === undefined ? null : opening.swing === 'left' ? left : { x: -left.x, y: -left.y }
  return { hinge, swing }
}

const sameWay = (a: Vec2 | null, b: Vec2 | null): boolean => (a === null || b === null ? a === b : a.x * b.x + a.y * b.y > 0)

/** The rooms that list a wall, by id. */
function roomsOfWall(plan: FloorPlan): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const room of plan.rooms) {
    for (const wall of new Set([...room.boundary, ...(room.holes ?? []).flat()])) {
      const list = found.get(wall)
      if (list) list.push(room.id)
      else found.set(wall, [room.id])
    }
  }
  return found
}

// ── Issues ────────────────────────────────────────────────────────────────────────────────

/** Walls that were added or moved and now meet another wall inside one of its openings. */
function crossedOpenings(later: FloorPlan, changed: ReadonlySet<string>): ComparisonIssue[] {
  const issues: ComparisonIssue[] = []
  const walls = new Map(later.walls.map((w) => [w.id, w] as const))
  const slack = tolerance('diffPlace')
  for (const opening of later.openings) {
    const host = walls.get(opening.wall)
    const axis = host === undefined ? null : axisOf(host)
    if (host === undefined || axis === null) continue
    for (const id of changed) {
      if (id === opening.wall) continue
      const wall = walls.get(id)
      if (wall === undefined || wall.virtual === true || floorOf(wall) !== floorOf(host)) continue
      const half = wall.thickness / 2
      const meets = [wall.start, wall.end].some((end) => {
        const rx = end[0] - axis.start.x
        const ry = end[1] - axis.start.y
        const along = rx * axis.dir.x + ry * axis.dir.y
        const across = Math.abs(axis.dir.x * ry - axis.dir.y * rx)
        return across <= host.thickness / 2 + slack && along + half > opening.offset + slack && along - half < opening.offset + opening.width - slack
      })
      if (!meets) continue
      issues.push({
        code: 'opening_crossed',
        message: `Wall ${quoted(wall.id)} now meets wall ${quoted(host.id)} inside ${opening.type} ${quoted(opening.id)}`,
        entities: [{ type: 'wall', id: wall.id }, { type: 'opening', id: opening.id }]
      })
    }
  }
  return issues
}

function noteIssues(notes: CompareOptions['notes'], rename: (kind: string, id: string) => string): ComparisonIssue[] {
  if (notes === undefined) return []
  const key = (line: NoteLike, map: (kind: string, id: string) => string): string =>
    [line.code, line.thing.kind, map(line.thing.kind, line.thing.id), ...line.also.map((id) => map('', id)).sort()].join('\u0000')
  const same = (_kind: string, id: string): string => id
  const count = (lines: readonly NoteLike[], map: (kind: string, id: string) => string): Map<string, NoteLike[]> => {
    const found = new Map<string, NoteLike[]>()
    for (const line of lines) {
      const k = key(line, map)
      const list = found.get(k)
      if (list) list.push(line)
      else found.set(k, [line])
    }
    return found
  }
  const before = count(notes.before, rename)
  const after = count(notes.after, same)
  const issues: ComparisonIssue[] = []
  const ref = (line: NoteLike, id: string): EntityRef[] => (['wall', 'opening', 'room', 'floor'].includes(line.thing.kind) ? [{ type: line.thing.kind as EntityRef['type'], id }] : [])
  for (const [k, lines] of after) {
    const had = before.get(k)?.length ?? 0
    for (const line of lines.slice(had)) issues.push({ code: 'note_added', message: `New note ${line.code}: ${line.message}`, entities: ref(line, line.thing.id) })
  }
  for (const [k, lines] of before) {
    const has = after.get(k)?.length ?? 0
    for (const line of lines.slice(has)) issues.push({ code: 'note_gone', message: `Note gone ${line.code}: ${line.message}`, entities: ref(line, rename(line.thing.kind, line.thing.id)) })
  }
  return issues
}

/** WRT-32: at most this many rooms whose id changed are named in the verdict; more are only counted. */
const ROOM_IDS_NAMED = 3

/** WRT-19: what a wall states of its own, which no room line says: listed whichever way the plan was written. */
const WALL_FIGURES: ReadonlySet<string> = new Set(['thickness', 'height', 'kind', 'virtual', 'floor', 'arc', 'phase'])

const ISSUE_ORDER: Readonly<Record<string, number>> = {
  door_joins_other_rooms: 0,
  opening_crossed: 1,
  room_unclosed: 2,
  dangling_host: 3,
  invalid_base: 4,
  invalid_head: 5,
  unknown_target: 6,
  note_added: 7,
  note_gone: 8,
  suspected_id_churn: 9
}

/** WRT-20: a floor added to or removed from a plan, with the rooms on it and their net area. */
function floorLine(plan: FloorPlan, floor: string, kind: 'added' | 'removed'): string {
  const rooms = plan.rooms.filter((room) => floorOf(room) === floor).length
  const net = rooms === 0 ? 0 : (planAreaFigures(plan).floors.find((f) => f.floor === floor)?.net ?? 0)
  const named = planFloors(plan).find((f) => f.id === floor)?.name ?? floor
  const counted = rooms === 0 ? said('diff.floor.rooms.none') : said(rooms === 1 ? 'diff.floor.rooms.one' : 'diff.floor.rooms.many', { count: rooms, area: num(areaText(net)) })
  return english(said(kind === 'added' ? 'diff.floor.added' : 'diff.floor.removed', { floor: name(named), rooms: counted }))
}

// ── The comparison ────────────────────────────────────────────────────────────────────────

/**
 * Compares two versions of a plan by what stands where in the building. LVL-8: each is compared
 * with its opening patterns expanded, so a pattern's openings are paired, mirrored and turned as
 * plain openings are (a plan already expanded is taken as it is).
 */
export function compareBuildings(earlierStated: FloorPlan, laterStated: FloorPlan, options: CompareOptions = {}): BuildingComparison {
  const earlier = withPatterns(earlierStated)
  const later = withPatterns(laterStated)
  const roomsFirst = earlier.written?.from === 'rooms' && later.written?.from === 'rooms'
  // WRT-4: a mirror or a quarter turn first, so a flipped plan is not every wall moved.
  const turn = findTurn(earlier, later)
  const alignment = alignPlans(turn === null ? earlier : turnPlan(earlier, turn.id), later, { idsFirst: roomsFirst })
  const aligned = alignment.aligned
  const diff = diffPlans(aligned, later, options.phases === false ? { phases: false } : {})

  const baseIndex = indexPlan(aligned)
  const headIndex = indexPlan(later)
  const was = shapes(aligned, baseIndex)
  const is = shapes(later, headIndex)
  const baseRooms = new Map(aligned.rooms.map((r) => [r.id, r] as const))
  const headRooms = new Map(later.rooms.map((r) => [r.id, r] as const))
  const least = tolerance('diffMovement')
  const areaSlack = tolerance('areaReported')
  const wallChanges = new Map(diff.changes.flatMap((c) => (c.entity.type === 'wall' ? [[c.entity.id, c] as const] : [])))
  // MSG-25: a part's phase change in words, from the id diff, which compares it; '' when it kept its phase.
  const phaseChanges = new Map(diff.changes.flatMap((c) => c.props.filter((p) => p.key === 'phase').map((p) => [`${c.entity.type}:${c.entity.id}`, phaseWords(p.before as Phase, p.after as Phase)] as const)))
  const phaseSaid = (type: EntityRef['type'], id: string): string => phaseChanges.get(`${type}:${id}`) ?? ''

  // WRT-32: the earlier id of each room whose id changed, by later id.
  const idBefore = new Map(alignment.renamed.filter((r) => r.type === 'room').map((r) => [r.after, r.before] as const))
  // WRT-32: two rooms knocked into one. A room with no pair whose middle lies on the floor of a
  // room in both versions, on its floor, that grew, went into it; the walls the two shared that
  // the room no longer lists were taken out between them.
  const mergedInto = new Map<string, string>()
  const mergedWith = new Map<string, string[]>()
  const takenOut = new Map<string, string[]>()
  for (const room of aligned.rooms) {
    if (headRooms.has(room.id)) continue
    const at = pointIn(was.get(room.id)!)
    if (at === null) continue
    const into = later.rooms.find((other) => {
      const now = is.get(other.id)!
      const then = was.get(other.id)
      if (!baseRooms.has(other.id) || floorOf(other) !== floorOf(room) || now.polygon === null || now.area === null || then?.area == null) return false
      return now.area > then.area + areaSlack && inside(at, now.polygon)
    })
    if (into === undefined) continue
    mergedInto.set(room.id, into.id)
    mergedWith.set(into.id, [...(mergedWith.get(into.id) ?? []), room.id])
    const walls = (r: Room): Set<string> => new Set([...r.boundary, ...(r.holes ?? []).flat()])
    const theirs = walls(baseRooms.get(into.id)!)
    const kept = walls(into)
    const gone = [...walls(room)].filter((id) => theirs.has(id) && !kept.has(id))
    takenOut.set(into.id, [...new Set([...(takenOut.get(into.id) ?? []), ...gone])])
  }

  // Room by room.
  const verdicts: RoomVerdict[] = []
  const moves = new Map<string, { dx: number; dy: number }>()
  // WRT-32: every room that kept its size and moved, changed in other ways or not: what an opening moved with.
  const carried = new Map<string, { dx: number; dy: number }>()
  const none = { by: null, idBefore: null, mergedWith: [], wallsTakenOut: [], mergedInto: null } as const
  for (const room of later.rooms) {
    const before = baseRooms.get(room.id)
    const after = is.get(room.id)!
    if (before === undefined) {
      verdicts.push({ room: room.id, name: room.name, status: 'added', before: null, after: after.area, moved: null, walls: [], ...none, text: `Room added: ${nameOf(room)}, ${areaWords(after.area)}` })
      continue
    }
    const old = was.get(room.id)!
    const words: string[] = []
    if (before.name !== room.name) words.push(`renamed ${quoted(room.name)}`)
    // WRT-32: the rooms merged into it, and the walls taken out between them.
    const tookIn = mergedWith.get(room.id) ?? []
    const wallsGone = takenOut.get(room.id) ?? []
    if (tookIn.length > 0) {
      const rooms = joined(tookIn.map((id) => name(baseRooms.get(id)?.name || id)), 'join.comma', 'join.and')
      const walls = joined(wallsGone.map((id) => name(id)), 'join.comma', 'join.and')
      words.push(english(said(wallsGone.length === 0 ? 'diff.room.merged' : wallsGone.length === 1 ? 'diff.room.merged.wall' : 'diff.room.merged.walls', { rooms, walls })))
    }
    if (before.use !== room.use) words.push(`use ${before.use ?? 'not stated'} → ${room.use ?? 'not stated'}`)
    const areaChanged = old.area === null || after.area === null ? old.area !== after.area : Math.abs(after.area - old.area) > areaSlack
    const sizeChanged = old.box !== null && after.box !== null && (Math.abs(after.box.max.x - after.box.min.x - (old.box.max.x - old.box.min.x)) >= least || Math.abs(after.box.max.y - after.box.min.y - (old.box.max.y - old.box.min.y)) >= least)
    // WRT-19: the walls it grew or shrank by. Written rooms first, a wall's line follows the rooms, so only its thickness is a cause.
    const cause = areaChanged || sizeChanged ? roomWallCauses(room, after.polygon, wallChanges, baseIndex, headIndex, { thicknessOnly: roomsFirst }) : null
    const causes = cause?.walls ?? []
    if (areaChanged || sizeChanged) {
      const sized = old.rectangle && after.rectangle && old.box !== null && after.box !== null ? ` (${sizeText(old.box)} → ${sizeText(after.box)})` : ''
      words.push(`${areaWords(old.area)} → ${areaWords(after.area)}${sized}${cause?.said ? `, ${english(cause.said)}` : ''}`)
    }
    if ((before.height ?? null) !== (room.height ?? null)) words.push(`height ${before.height === undefined ? 'not stated' : `${metresText(before.height)} m`} → ${room.height === undefined ? 'not stated' : `${metresText(room.height)} m`}`)
    if ((before.floorOffset ?? 0) !== (room.floorOffset ?? 0)) words.push(`floor offset ${metresText(before.floorOffset ?? 0)} → ${metresText(room.floorOffset ?? 0)} m`)
    // WRT-20: an unstated floor is the ground floor (C5), so a room that now states it stands where it stood.
    if (floorOf(before) !== floorOf(room)) words.push(`moved to floor ${quoted(floorOf(room))}`)
    // MSG-25: a room now to be demolished, or now new.
    if (phaseSaid('room', room.id) !== '') words.push(phaseSaid('room', room.id))
    // WRT-32: a room whose id changed says so; the id alone is no change line ("ids aside, the same building").
    const earlierId = idBefore.get(room.id) ?? null
    const subject = earlierId === null ? quoted(before.name || before.id) : english(said('diff.room.id', { room: name(before.name || before.id), before: name(earlierId), after: name(room.id) }))
    const facts = { idBefore: earlierId, mergedWith: tookIn, wallsTakenOut: wallsGone, mergedInto: null }
    // WRT-32: how far a room that kept its size moved, said whatever else changed.
    const dx = old.box !== null && after.box !== null ? after.box.min.x - old.box.min.x : 0
    const dy = old.box !== null && after.box !== null ? after.box.min.y - old.box.min.y : 0
    const moved = !areaChanged && !sizeChanged && Math.hypot(dx, dy) >= least
    const how = moved ? { moved: Math.hypot(dx, dy), by: [dx, dy] as const } : { moved: null, by: null }
    if (moved) carried.set(room.id, { dx, dy })
    if (words.length > 0) {
      if (moved) words.push(english(said('diff.room.moved', { by: moveWords(dx, dy) })))
      verdicts.push({ room: room.id, name: room.name, status: 'changed', before: old.area, after: after.area, ...how, walls: causes, ...facts, text: `${subject} ${words.join('; ')}` })
      continue
    }
    if (moved) {
      moves.set(room.id, { dx, dy })
      verdicts.push({ room: room.id, name: room.name, status: 'moved', before: old.area, after: after.area, ...how, walls: [], ...facts, text: `${subject} moved ${moveWords(dx, dy)}, as it was (${areaWords(after.area)})` })
      continue
    }
    verdicts.push({ room: room.id, name: room.name, status: 'unchanged', before: old.area, after: after.area, ...how, walls: [], ...facts, text: `${subject} as it was (${areaWords(after.area)})` })
  }
  for (const room of aligned.rooms) {
    if (headRooms.has(room.id)) continue
    const area = was.get(room.id)!.area
    const into = mergedInto.get(room.id) ?? null
    const text = into === null
      ? `Room removed: ${nameOf(room)}, ${areaWords(area)}`
      : english(said('diff.room.mergedInto', { room: name(room.name || room.id), into: name(headRooms.get(into)!.name || into), area: areaWords(area) }))
    verdicts.push({ room: room.id, name: room.name, status: 'removed', before: area, after: null, moved: null, walls: [], ...none, mergedInto: into, text })
  }

  const wallsBefore = baseIndex.wallsById
  const wallsAfter = headIndex.wallsById
  const laterRoomsOf = roomsOfWall(later)
  const earlierRoomsOf = roomsOfWall(aligned)
  const roomNames = (ids: readonly string[], plan: ReadonlyMap<string, Room>): string => listWords(ids.map((id) => { const r = plan.get(id); return r ? nameOf(r) : quoted(id) }))

  // Openings, by their place in their rooms.
  const openingLines: ChangeLine[] = []
  const stayed: { opening: string; text: string }[] = []
  const movedWith: OpeningMovedWith[] = []
  // The walls whose ends moved, and how: an opening on one that kept its place on it moved with it.
  const movedHosts = new Map(diff.changes.flatMap((c) => (c.entity.type === 'wall' && c.kind === 'modified' && c.motion !== undefined ? [[c.entity.id, c.motion.kind] as const] : [])))
  const baseOpenings = new Map(aligned.openings.map((o) => [o.id, o] as const))
  const headOpenings = new Map(later.openings.map((o) => [o.id, o] as const))
  // The rooms an opening is in: what lies on its two sides where it stands, not every room its wall bounds.
  const faces = { base: openingFaces(aligned, { windows: true }), head: openingFaces(later, { windows: true }) }
  const roomsOfOpening = (o: Opening, side: 'base' | 'head'): string[] =>
    [...new Set((faces[side].get(o.id)?.sides ?? []).flatMap((face) => ('room' in face ? [face.room] : [])))].sort(compareText)
  for (const opening of later.openings) {
    const before = baseOpenings.get(opening.id)
    const rooms = roomsOfOpening(opening, 'head')
    const where = rooms.length === 0 ? '' : `, in ${roomNames(rooms, headRooms)}`
    const noun = opening.type.charAt(0).toUpperCase() + opening.type.slice(1)
    const entity: EntityRef = { type: 'opening', id: opening.id }
    if (before === undefined) {
      openingLines.push({ text: `${noun} added: ${quoted(opening.id)}, ${metresText(opening.width)} m wide${where}`, entities: [entity], rooms })
      continue
    }
    const words: string[] = []
    if (before.type !== opening.type) words.push(`was a ${before.type}`)
    const range = (key: 'width' | 'height' | 'sill'): void => {
      if (Math.abs(before[key] - opening[key]) > tolerance('diffLength')) words.push(`${key} ${metresText(before[key])} → ${metresText(opening[key])} m`)
    }
    range('width')
    range('height')
    range('sill')
    // CNT-14: a door or window of another kind, or another part that opens.
    if ((before.kind ?? null) !== (opening.kind ?? null)) words.push(opening.kind === undefined ? `no kind stated now (was ${before.kind})` : `now ${opening.kind}${before.kind === undefined ? '' : ` (was ${before.kind})`}`)
    const part = (o: Opening): string => (o.opens === undefined ? 'the whole of it' : `${metresText(o.opens.width)}${o.opens.height === undefined ? '' : ` × ${metresText(o.opens.height)}`} m`)
    const partMoved = (a: number | undefined, b: number | undefined): boolean => (a === undefined) !== (b === undefined) || (a !== undefined && b !== undefined && Math.abs(a - b) > tolerance('diffLength'))
    if (partMoved(before.opens?.width, opening.opens?.width) || partMoved(before.opens?.height, opening.opens?.height)) words.push(`part that opens ${part(before)} → ${part(opening)}`)
    const handBefore = handing(before, wallsBefore.get(before.wall))
    const handAfter = handing(opening, wallsAfter.get(opening.wall))
    if (!sameWay(handBefore.hinge, handAfter.hinge)) words.push(opening.hinge === undefined ? 'hinge no longer stated' : before.hinge === undefined ? 'hinge now stated' : 'hung from the other jamb')
    if (!sameWay(handBefore.swing, handAfter.swing)) words.push(opening.swing === undefined ? 'swing no longer stated' : before.swing === undefined ? 'swing now stated' : 'opens to the other side')

    // Where it is along its wall, against where its rooms went.
    const from = middle(before, wallsBefore.get(before.wall))
    const to = middle(opening, wallsAfter.get(opening.wall))
    const axis = wallsAfter.get(opening.wall) === undefined ? null : axisOf(wallsAfter.get(opening.wall)!)
    let slid: number | null = null
    // The rooms it is in that moved by as much along its wall as it did.
    let keepers: string[] = []
    if (from !== null && to !== null && axis !== null) {
      const along = (v: Vec2): number => v.x * axis.dir.x + v.y * axis.dir.y
      const moved = along({ x: to.x - from.x, y: to.y - from.y })
      const slack = tolerance('diffPlace')
      const keeps = (room: string): boolean => {
        const a = was.get(room)?.box
        const b = is.get(room)?.box
        if (!a || !b) return false
        return [{ x: b.min.x - a.min.x, y: b.min.y - a.min.y }, { x: b.max.x - a.max.x, y: b.max.y - a.max.y }].some((d) => Math.abs(moved - along(d)) <= slack)
      }
      // MSG-27: widened or narrowed from one edge, its other edge where it was: it did not slide.
      const grew = (opening.width - before.width) / 2
      const edgeKept = Math.min(Math.abs(moved - grew), Math.abs(moved + grew)) <= slack
      if (Math.abs(moved) > slack && !edgeKept) {
        keepers = rooms.filter(keeps)
        if (keepers.length === 0) slid = moved
      }
    }
    if (slid !== null) words.push(`moved ${metresText(Math.abs(slid))} m along its wall`)
    // MSG-25: a window blocked up, a door kept that was to go.
    if (phaseSaid('opening', opening.id) !== '') words.push(phaseSaid('opening', opening.id))
    if (words.length > 0) {
      openingLines.push({ text: `${noun} ${quoted(opening.id)} ${words.join('; ')}${where}`, entities: [entity], rooms })
      continue
    }
    // WRT-12: worth saying only where something round it changed, and said by where it went in the building.
    const replaced = before.wall !== opening.wall ? ', on the wall that replaced its own' : ''
    const motion = movedHosts.get(opening.wall)
    const by: [number, number] = from !== null && to !== null ? [to.x - from.x, to.y - from.y] : [0, 0]
    // A wall made thicker on one side: the opening's face on the other side is where it was.
    const faceStayed = ((): boolean => {
      const hostBefore = wallsBefore.get(before.wall)
      const hostAfter = wallsAfter.get(opening.wall)
      if (axis === null || hostBefore === undefined || hostAfter === undefined) return false
      const normal = { x: -axis.dir.y, y: axis.dir.x }
      return [1, -1].some((side) => Math.hypot(by[0] + (normal.x * side * (hostAfter.thickness - hostBefore.thickness)) / 2, by[1] + (normal.y * side * (hostAfter.thickness - hostBefore.thickness)) / 2) < least)
    })()
    // The rooms it is in that moved by as much as it did, as they were.
    const movers = rooms.filter((room) => {
      const d = carried.get(room)
      return d !== undefined && Math.abs(d.dx - by[0]) <= tolerance('diffPlace') && Math.abs(d.dy - by[1]) <= tolerance('diffPlace')
    })
    const withRooms = movers.length > 0 ? movers : keepers
    if (Math.hypot(by[0], by[1]) < least || faceStayed) {
      // Said only of a wall that moved or was replaced: one that only grew at its other end carries nothing.
      if (replaced !== '' || (motion !== undefined && motion !== 'resized')) stayed.push({ opening: opening.id, text: `${noun} ${quoted(opening.id)} stayed where it was${where}${replaced}` })
    } else if (withRooms.length > 0) {
      movedWith.push({ opening: opening.id, with: 'room', by, text: `${noun} ${quoted(opening.id)} moved with ${roomNames(withRooms, headRooms)}, ${moveWords(by[0], by[1])}${where}` })
    } else if (replaced !== '' || motion !== undefined) {
      movedWith.push({ opening: opening.id, with: 'wall', by, text: `${noun} ${quoted(opening.id)} moved with its wall, ${moveWords(by[0], by[1])}${where}` })
    }
    // Else a slip shorter than `diffPlace` along a wall that stood still: no change.
  }
  for (const opening of aligned.openings) {
    if (headOpenings.has(opening.id)) continue
    const rooms = roomsOfOpening(opening, 'base')
    const noun = opening.type.charAt(0).toUpperCase() + opening.type.slice(1)
    openingLines.push({ text: `${noun} removed: ${quoted(opening.id)}, ${metresText(opening.width)} m wide${rooms.length === 0 ? '' : `, in ${roomNames(rooms, baseRooms)}`}`, entities: [{ type: 'opening', id: opening.id }], rooms: rooms.filter((id) => headRooms.has(id)) })
  }

  // The change lines.
  const roomLines: ChangeLine[] = []
  for (const verdict of verdicts) {
    // WRT-32: a merge is one line, the room that took the other in, about both.
    if (verdict.status === 'changed') roomLines.push({ text: verdict.text, entities: [{ type: 'room', id: verdict.room }, ...verdict.mergedWith.map((id) => ({ type: 'room' as const, id }))], rooms: [verdict.room] })
    // A room added is about the room it was carved from too, and a room removed about the room it went into.
    if (verdict.status === 'added') roomLines.push({ text: verdict.text, entities: [{ type: 'room', id: verdict.room }], rooms: [verdict.room, ...roomsUnder(is.get(verdict.room)!, was)] })
    if (verdict.status === 'removed' && verdict.mergedInto === null) roomLines.push({ text: verdict.text, entities: [{ type: 'room', id: verdict.room }], rooms: [verdict.room, ...roomsUnder(was.get(verdict.room)!, is)] })
  }
  // Rooms that moved together, as they were, in one line.
  const groups = new Map<string, string[]>()
  for (const [room, d] of moves) {
    const key = `${Math.round(d.dx / least)}:${Math.round(d.dy / least)}`
    const list = groups.get(key)
    if (list) list.push(room)
    else groups.set(key, [room])
  }
  for (const rooms of groups.values()) {
    const d = moves.get(rooms[0]!)!
    const names = rooms.map((id) => nameOf(headRooms.get(id)!))
    roomLines.push({
      text: rooms.length === 1 ? `${names[0]} moved ${moveWords(d.dx, d.dy)}, as it was` : `${listWords(names)} moved ${moveWords(d.dx, d.dy)}, as they were`,
      entities: rooms.map((id) => ({ type: 'room' as const, id })),
      rooms
    })
  }

  // Walls and floors one line each, as the id diff of the pairs says, with the rooms they stand by.
  // WRT-19: written rooms first, a plan's walls follow its rooms, so only the walls whose own
  // figures changed are listed (and every floor that changed): a room line says the rest.
  const listed = (change: PlanChange): boolean =>
    !change.derived && (change.entity.type === 'floor' || (change.entity.type === 'wall' && (!roomsFirst || (change.kind === 'modified' && change.props.some((p) => WALL_FIGURES.has(p.key))))))
  const wallLines: ChangeLine[] = []
  // WRT-20: a floor added or removed, said first with its rooms and their net area as `grid_areas` gives it.
  const floorLines: ChangeLine[] = []
  const floorsGone = new Set<string>()
  const floorsNew = new Set<string>()
  // WRT-25: a floor in both versions that changed, or stands elsewhere because the floors under it
  // changed, is a floor line with its old and new figures, never a "wall or opening change".
  const floors = floorChanges(aligned, later)
  const floorSaid = new Set(floors.map((f) => f.floor))
  {
    // Walls changed the same way and nothing else are one line: "9 walls height 2.60 → 2.70 m".
    const alike = new Map<string, PlanChange[]>()
    for (const change of diff.changes) {
      if (!listed(change) || change.entity.type !== 'wall' || change.kind !== 'modified' || change.motion !== undefined) continue
      const list = alike.get(change.summary)
      if (list) list.push(change)
      else alike.set(change.summary, [change])
    }
    const grouped = new Set<string>()
    for (const [summary, list] of alike) {
      if (list.length < 2) continue
      const ids = list.map((c) => c.entity.id)
      ids.forEach((id) => grouped.add(id))
      const shown = ids.length > 4 ? `${ids.slice(0, 4).map(quoted).join(', ')} and ${ids.length - 4} more` : listWords(ids.map(quoted))
      const rooms = [...new Set(ids.flatMap((id) => laterRoomsOf.get(id) ?? []))].sort(compareText)
      wallLines.push({ text: `${ids.length} walls ${summary.replace(/^Wall /, '')}: ${shown}`, entities: list.map((c) => c.entity), rooms })
    }
    for (const change of diff.changes) {
      if (grouped.has(change.entity.id) && change.entity.type === 'wall') continue
      if (!listed(change)) continue
      if (change.entity.type === 'floor') {
        if (change.kind === 'modified') {
          if (!floorSaid.has(change.entity.id)) wallLines.push({ text: change.summary, entities: [change.entity], rooms: [] })
        } else {
          const set = change.kind === 'added' ? floorsNew : floorsGone
          set.add(change.entity.id)
          floorLines.push({ text: floorLine(change.kind === 'added' ? later : aligned, change.entity.id, change.kind), entities: [change.entity], rooms: [] })
        }
        continue
      }
      const id = change.entity.id
      const wall = change.kind === 'removed' ? wallsBefore.get(id) : wallsAfter.get(id)
      const rooms = (change.kind === 'removed' ? earlierRoomsOf : laterRoomsOf).get(id) ?? []
      const length = wall && axisOf(wall) ? `, ${metresText(axisOf(wall)!.length)} m` : ''
      const by = rooms.length === 0 ? '' : `, by ${roomNames(rooms, change.kind === 'removed' ? baseRooms : headRooms)}`
      const what = change.kind === 'modified' ? change.summary.replace(/^Wall /, '') : change.kind
      wallLines.push({ text: `Wall ${quoted(id)} ${what}${change.kind === 'modified' ? '' : length}${by}`, entities: [change.entity], rooms: rooms.filter((r) => headRooms.has(r)) })
    }
  }
  for (const floor of floors) floorLines.push({ text: english(floor.said), entities: [{ type: 'floor', id: floor.floor }], rooms: [] })
  // MSG-27: the massing and the site, moved as the walls were, after the floors.
  const massing = compareMassing(turn === null ? earlier : turnPlan(earlier, turn.id), later, alignment.shift)
  const massingLines: ChangeLine[] = massing.lines.map((line) => ({ text: english(line.said), entities: line.entities, rooms: [] }))
  const changes: ChangeLine[] = [...floorLines, ...massingLines, ...roomLines, ...wallLines, ...openingLines]
  // The rooms on a floor added or removed: its floor's line counts them, and the verdict does not say them again.
  const ofFloorLine = (v: RoomVerdict): boolean =>
    (v.status === 'added' && floorsNew.has(floorOf(headRooms.get(v.room)!))) || (v.status === 'removed' && floorsGone.has(floorOf(baseRooms.get(v.room)!)))

  // Issues first.
  const kinds: Record<string, ReadonlyMap<string, string>> = { wall: alignment.walls, opening: alignment.openings, room: alignment.rooms }
  const rename = (kind: string, id: string): string => kinds[kind]?.get(id) ?? alignment.walls.get(id) ?? alignment.openings.get(id) ?? alignment.rooms.get(id) ?? id
  const changedWalls = new Set(diff.changes.filter((c) => c.entity.type === 'wall' && (c.kind === 'added' || c.motion !== undefined)).map((c) => c.entity.id))
  const scope = options.rooms === undefined ? null : changesOutsideScope(diff, aligned, later, { rooms: options.rooms })
  const issues: ComparisonIssue[] = [
    ...doorsThatChangedRooms(aligned, later).map((d): ComparisonIssue => ({ code: 'door_joins_other_rooms', message: `Door ${d.message}`, entities: [{ type: 'opening', id: d.opening }] })),
    ...crossedOpenings(later, changedWalls),
    // WRT-32: written rooms first, a wall is named after its rooms, so a wall under a new id is a room's new id, not churn.
    ...diff.issues.filter((i) => !(roomsFirst && i.code === 'suspected_id_churn' && i.entities.every((e) => e.type === 'wall'))).map((i: DiffIssue): ComparisonIssue => i),
    ...(scope?.issues.filter((i) => i.code === 'unknown_target') ?? []),
    ...noteIssues(options.notes, rename)
  ].sort((a, b) => (ISSUE_ORDER[a.code] ?? 99) - (ISSUE_ORDER[b.code] ?? 99) || compareText(a.message, b.message))

  // The scope check: room lines and opening lines by their rooms; wall lines as the scope check of the diff says.
  let outside: ChangeLine[] = []
  if (options.rooms !== undefined) {
    const named = new Set(options.rooms)
    const outOfScope = new Set((scope?.changes ?? []).map((c: PlanChange) => `${c.entity.type}:${c.entity.id}`))
    const site = new Set(massingLines)
    outside = changes.filter((line) => {
      // MSG-27: the massing and the site are no room's.
      if (site.has(line)) return true
      if (line.entities.some((e) => e.type === 'wall' || e.type === 'floor')) return line.entities.some((e) => outOfScope.has(`${e.type}:${e.id}`))
      return line.rooms.length === 0 ? line.entities.every((e) => !named.has(e.id)) : !line.rooms.some((id) => named.has(id))
    })
  }

  // What a picture marks.
  const ids = (type: EntityRef['type'], kind: 'added' | 'removed' | 'modified'): string[] => diff.changes.filter((c) => c.entity.type === type && c.kind === kind).map((c) => c.entity.id)
  // MSG-27: a wall in both versions read by place. One whose ends moved along its line gained or
  // lost a stretch, and the rest of it stands where it stood; one that left the ground it stood on
  // was taken out where it stood and built where it stands, whatever its id. MSG-25: a wall whose phase or
  // thickness changed is marked changed, not drawn as any part to be demolished.
  const markedChanged: string[] = []
  const wallsTakenDown: string[] = []
  const wallsBuilt: string[] = []
  const stretches: WallStretchMark[] = []
  for (const change of diff.changes) {
    if (change.entity.type !== 'wall' || change.kind !== 'modified') continue
    const id = change.entity.id
    const own = change.props.some((p) => p.key === 'thickness' || p.key === 'phase')
    const ends = change.props.some((p) => p.key === 'start' || p.key === 'end')
    const was = wallsBefore.get(id)
    const is = wallsAfter.get(id)
    const along = ends && was !== undefined && is !== undefined ? wallStretches(was, is) : null
    // A wall nudged within its own thickness is drawn changed, where it was outlined.
    if (ends && along === null && was !== undefined && is !== undefined && withinItsThickness(was, is)) {
      markedChanged.push(id)
      continue
    }
    if (ends && along === null) {
      wallsTakenDown.push(id)
      wallsBuilt.push(id)
      continue
    }
    for (const [from, to] of along?.added ?? []) stretches.push({ wall: id, kind: 'added', from, to, thickness: is!.thickness })
    for (const [from, to] of along?.removed ?? []) stretches.push({ wall: id, kind: 'removed', from, to, thickness: was!.thickness })
    // A curve that kept its circle and changed its sweep is drawn changed, as before.
    if (own || (ends && was?.arc !== undefined)) markedChanged.push(id)
  }
  // An opening is marked changed when the comparison says it changed or moved: one that stands
  // where it stood, its offset changed only because its wall's start did, is not (MSG-27).
  const saidOpenings = new Set([...openingLines.flatMap((line) => line.entities.filter((e) => e.type === 'opening').map((e) => e.id)), ...movedWith.map((m) => m.opening)])
  const movedOpenings = ids('opening', 'modified').filter((id) => saidOpenings.has(id))
  // MSG-27: a room another went into is drawn as the room it went into, never as lost.
  const removedRooms = ids('room', 'removed').filter((id) => !mergedInto.has(id))
  const sumLabel = (v: RoomVerdict): string | null => {
    if (v.mergedWith.length === 0 || v.before === null || v.after === null) return null
    const parts = [v.before, ...v.mergedWith.map((id) => was.get(id)?.area ?? null)]
    if (parts.some((a) => a === null)) return null
    const rest = v.after - parts.reduce<number>((n, a) => n + a!, 0)
    const terms = parts.map((a) => areaText(a!)).join(' + ')
    const restText = Math.abs(rest) <= areaSlack ? '' : ` ${rest > 0 ? '+' : '−'} ${areaText(Math.abs(rest))}`
    return `${v.name || v.room}: ${terms}${restText} = ${areaWords(v.after)}`
  }
  const marks: ComparisonMarks = {
    removed: { walls: [...ids('wall', 'removed'), ...wallsTakenDown], openings: ids('opening', 'removed'), rooms: removedRooms },
    added: { walls: [...ids('wall', 'added'), ...wallsBuilt], openings: ids('opening', 'added'), rooms: ids('room', 'added') },
    // WRT-12: what is in both versions and changed is drawn as changed, never as added.
    changed: { walls: markedChanged, openings: movedOpenings },
    stretches,
    changedRooms: verdicts.flatMap((v) => {
      // Words a picture's fonts all have: no arrow. MSG-27: a room that took another in gives its sum.
      if (v.status === 'changed') return [{ room: v.room, label: sumLabel(v) ?? `${v.name || v.room}: ${areaWords(v.before)} to ${areaWords(v.after)}` }]
      if (v.status === 'moved') return [{ room: v.room, label: `${v.name || v.room}: moved, ${areaWords(v.after)}` }]
      return []
    })
  }

  const renamed = alignment.renamed
  const renamedCount = { walls: renamed.filter((r) => r.type === 'wall').length, openings: renamed.filter((r) => r.type === 'opening').length, rooms: renamed.filter((r) => r.type === 'room').length }
  const sameBuilding = changes.length === 0 && turn === null
  const [sx, sy] = alignment.shift
  const shifted = Math.hypot(sx, sy) > tolerance('diffLength') ? `; the whole drawing sits ${moveWords(sx, sy)} of where it was, which is no change` : ''
  // WRT-32: a few rooms whose id changed are named, so an agent that knew the old id finds the room.
  const roomIds = renamed.filter((r) => r.type === 'room')
  const roomIdWords = roomIds.length === 0 || roomIds.length > ROOM_IDS_NAMED
    ? ''
    : `; ${sayValue('en', joined(roomIds.map((r) => said('diff.room.idNow', { room: name(headRooms.get(r.after)?.name || r.after), before: name(r.before), after: name(r.after) })), 'join.comma', 'join.and'))}`
  const renamedWords = renamed.length === 0
    ? ''
    : `${plural(renamed.length, 'id')} renamed (${[plural(renamedCount.walls, 'wall'), plural(renamedCount.openings, 'opening'), plural(renamedCount.rooms, 'room')].filter((t) => !t.startsWith('0 ')).join(', ')})${roomIdWords}`
  const redrawn = alignment.redrawn
  const redrawnWords = redrawn.length === 0
    ? ''
    : `${plural(redrawn.reduce((n, r) => n + r.before.length, 0), 'wall')} drawn as ${plural(redrawn.reduce((n, r) => n + r.after.length, 0), 'piece')} standing where ${redrawn.reduce((n, r) => n + r.before.length, 0) === 1 ? 'it' : 'they'} stood`
  // WRT-12: the openings that moved with their wall or room, counted, so none is read as having stayed.
  const withWall = movedWith.some((m) => m.with === 'wall')
  const withRoom = movedWith.some((m) => m.with === 'room')
  const their = movedWith.length === 1 ? 'its' : 'their'
  const movedWithWords = movedWith.length === 0
    ? ''
    : `${plural(movedWith.length, 'opening')} moved with ${their} ${withWall && withRoom ? (movedWith.length === 1 ? 'wall or room' : 'walls or rooms') : withWall ? (movedWith.length === 1 ? 'wall' : 'walls') : movedWith.length === 1 ? 'room' : 'rooms'}`
  const sameWords = [renamedWords, redrawnWords].filter((w) => w !== '').join(', ')
  let verdict: string
  let turnFirst = ''
  if (turn !== null) {
    // Every room in both versions, at the size it had: the mirror or the turn changed no size.
    const keepsSize = verdicts.every((v) => v.status !== 'added' && v.status !== 'removed' && (v.before === null || v.after === null || Math.abs(v.after - v.before) <= areaSlack))
    turnFirst = `${turn.text}${keepsSize ? ', and every room keeps its size' : ''}.`
    if (changes.length === 0) verdict = `Nothing else changed${sameWords === '' ? '' : `; ${sameWords}`}${shifted}.`
    else {
      const parts: string[] = [...floorLines, ...massingLines].map((line) => line.text)
      const folded = verdicts.filter(ofFloorLine).length
      for (const v of verdicts) if ((v.status === 'changed' || v.status === 'added' || v.status === 'removed') && v.mergedInto === null && !ofFloorLine(v)) parts.push(v.text)
      const others = changes.length - parts.length - folded
      if (others > 0) parts.push(plural(others, roomsFirst ? 'other change' : 'wall or opening change'))
      if (movedWithWords !== '') parts.push(movedWithWords)
      if (renamed.length > 0) parts.push(renamedWords)
      if (redrawn.length > 0) parts.push(redrawnWords)
      verdict = `Besides, ${plural(changes.length, 'change')}, room by room: ${parts.join('; ')}${shifted}.`
    }
  } else if (sameBuilding) {
    verdict = `Same building${sameWords === '' ? '' : `, ${sameWords}`}: every room, wall and opening stands where it stood${shifted}.`
  } else {
    const parts: string[] = [...floorLines, ...massingLines].map((line) => line.text)
    for (const v of verdicts) if ((v.status === 'changed' || v.status === 'added' || v.status === 'removed') && v.mergedInto === null && !ofFloorLine(v)) parts.push(v.text)
    for (const line of roomLines) if (line.entities.every((e) => moves.has(e.id))) parts.push(line.text)
    const kept = verdicts.filter((v) => v.status === 'unchanged').length
    if (kept > 0) parts.push(`${plural(kept, 'room')} as ${kept === 1 ? 'it was' : 'they were'}`)
    const others = changes.length - roomLines.length - floorLines.length - massingLines.length
    if (others > 0) parts.push(`${plural(others, roomsFirst && wallLines.length === 0 ? 'opening change' : 'wall or opening change')}`)
    if (movedWithWords !== '') parts.push(movedWithWords)
    if (renamed.length > 0) parts.push(renamedWords)
    if (redrawn.length > 0) parts.push(redrawnWords)
    verdict = `${plural(changes.length, 'change')}, room by room: ${parts.join('; ')}${shifted}.`
  }
  // MSG-27: the figures that differ, side by side.
  if (massing.sideBySide !== null) verdict += ` ${english(massing.sideBySide)}.`
  if (options.rooms !== undefined) verdict += ` ${outside.length === 0 ? 'Nothing changed' : `${plural(outside.length, 'change')}`} outside the rooms named (${options.rooms.map(quoted).join(', ') || 'none'}).`
  if (issues.length > 0) verdict = `${plural(issues.length, 'issue')} to look at first. ${verdict}`
  // WRT-4: the mirror or the turn is said first, before anything else.
  if (turn !== null) verdict = `${turnFirst} ${verdict}`

  return {
    version: BUILDING_COMPARISON_VERSION,
    roomsFirst,
    shift: alignment.shift,
    renamed: { count: renamed.length, ...renamedCount, pairs: renamed },
    redrawn,
    turn,
    turnLine: turn === null ? null : turnFirst,
    sameBuilding,
    floors,
    massing,
    verdict,
    rooms: verdicts,
    changes,
    issues,
    stayed,
    movedWith,
    scope: { checked: options.rooms !== undefined, rooms: options.rooms ?? [], outside },
    marks,
    aligned,
    diff
  }
}
