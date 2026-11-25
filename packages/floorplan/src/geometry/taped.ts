/**
 * HND-11 (C12, lab WR-14): the lengths taped on site against the same lengths drawn.
 *
 * A plan keeps what was taped in `taped`: a room's side along one of its walls, or the distance
 * between two of the room's corners, each corner named by the two walls that meet there. Both
 * are measured on the room's outline as the drawing has it, along the inside faces of its walls
 * (C3), the same outline its area is measured on: a side is every edge of the outline that lies
 * on that wall's face, end to end; a corner is the outline's corner where the two walls' faces
 * meet.
 *
 * A taped length agrees when the drawing is within its own `tolerance`, or `tapedAgree`. Nothing
 * is drawn or placed from a taped length: it is a check, and every run says each one.
 *
 * Pure: a plan in, plain data out.
 */
import { DEFAULT_FLOOR_ID, type Taped } from '../types/floorplan'
import { english, joined, name, num, said, type Said, type Value } from '../messages/say'
import { indexPlan, type FloorPlan, type PlanIndex, type Wall } from './plan'
import { roomOutline, type RoomOutline } from './room'
import { fixedText } from './rounding'
import { tolerance } from './tolerances'
import { wallFaces } from './wall'
import { cross, distance, intersectLines, sub, type Line, type Vec2 } from './vec2'

/** What a taped length is of. */
export type TapedWhat = 'side' | 'corners'

/**
 * Why a taped length could not be set against the drawing: the room or a wall is not in the
 * plan, the wall is not one of the room's, two walls make no corner of the room, or the room's
 * outline cannot be drawn. ARE-31: or the length itself is not a number above zero, so there is
 * nothing to set against the drawing.
 */
export type TapedMissing = 'bad-length' | 'no-room' | 'no-wall' | 'not-the-rooms' | 'no-corner' | 'not-drawn'

export interface TapedRow {
  /** Its place in the plan's `taped` list, from 0. */
  readonly index: number
  /** The id the plan gives it, or null. */
  readonly id: string | null
  readonly room: string
  /** The room's name, or its id when the plan has no such room. */
  readonly roomName: string
  /** The room's floor; the ground floor when the plan has no such room. */
  readonly floor: string
  readonly what: TapedWhat
  /** For a side, its wall; for corners, the two walls of `from`, then the two of `to`. */
  readonly walls: readonly string[]
  readonly taped: number
  /** The same length on the drawing, or null when it cannot be measured. */
  readonly drawn: number | null
  /** Drawn less taped: positive when the drawing is longer. Null with no drawn length. */
  readonly off: number | null
  /** How far apart the two may be and agree. */
  readonly within: number
  readonly state: 'agrees' | 'differs' | 'not-measured'
  /** Only when not measured: why. */
  readonly missing?: TapedMissing
  /** Only when not measured for a wall or a corner: the walls it is about. */
  readonly missingWalls?: readonly string[]
}

/** The face of a wall that looks into the room, as a line. */
function roomFace(wall: Wall, outline: RoomOutline): Line | null {
  const side = outline.sides.find((s) => s.wallId === wall.id)
  if (side === undefined) return null
  return wallFaces(wall)[side.face]
}

const offLine = (p: Vec2, line: Line): number => Math.abs(cross(line.dir, sub(p, line.point)))

/** The outline's length along a face: every edge whose two ends lie on it. */
function sideAlong(polygon: readonly Vec2[], face: Line): number | null {
  const near = tolerance('chainPoint')
  let total = 0
  let any = false
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (offLine(a, face) <= near && offLine(b, face) <= near) {
      total += distance(a, b)
      any = true
    }
  }
  return any ? total : null
}

/**
 * CNT-18: the outline's length along a curved wall's face that looks into the room: every edge
 * whose two ends lie on that face's circle, round the wall's centre. Going counter-clockwise the
 * left face is the inner one.
 */
function sideRound(outline: RoomOutline, wall: Wall): number | null {
  const side = outline.sides.find((s) => s.wallId === wall.id)
  if (side === undefined || wall.arc === undefined) return null
  const centre = { x: wall.arc.centre[0], y: wall.arc.centre[1] }
  const axis = distance(centre, { x: wall.start[0], y: wall.start[1] })
  const half = wall.virtual ? 0 : wall.thickness / 2
  const radius = axis - (side.face === 'left' ? 1 : -1) * Math.sign(wall.arc.sweep) * half
  const near = tolerance('chainPoint')
  const on = (p: Vec2): boolean => Math.abs(distance(centre, p) - radius) <= near
  let total = 0
  let any = false
  const polygon = outline.polygon
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (on(a) && on(b)) {
      total += distance(a, b)
      any = true
    }
  }
  return any ? total : null
}

/** The outline's corner where two faces meet, or null when they make none. */
function cornerOf(polygon: readonly Vec2[], a: Line, b: Line): Vec2 | null {
  const at = intersectLines(a, b)
  if (at === null) return null
  let best: Vec2 | null = null
  let gap = Infinity
  for (const p of polygon) {
    const d = distance(p, at)
    if (d < gap) [best, gap] = [p, d]
  }
  return best !== null && gap <= tolerance('chainPoint') ? best : null
}

interface Measured {
  readonly drawn: number | null
  readonly missing?: TapedMissing
  readonly missingWalls?: readonly string[]
}

function measure(entry: Taped, index: PlanIndex, outlines: Map<string, RoomOutline | null>): Measured {
  if (!Number.isFinite(entry.length) || entry.length <= 0) return { drawn: null, missing: 'bad-length' }
  const room = index.plan.rooms.find((r) => r.id === entry.room)
  if (room === undefined) return { drawn: null, missing: 'no-room' }
  const walls = entry.wall !== undefined ? [entry.wall] : [...(entry.from ?? []), ...(entry.to ?? [])]
  const unknown = walls.filter((id) => !index.wallsById.has(id))
  if (unknown.length > 0) return { drawn: null, missing: 'no-wall', missingWalls: unknown }
  if (!outlines.has(room.id)) {
    let outline: RoomOutline | null = null
    try {
      const traced = roomOutline(room, index)
      outline = traced.fault === null ? traced : null
    } catch {
      outline = null
    }
    outlines.set(room.id, outline)
  }
  const outline = outlines.get(room.id) ?? null
  if (outline === null) return { drawn: null, missing: 'not-drawn' }
  const faces = new Map<string, Line>()
  const notTheRooms: string[] = []
  // CNT-18: a curved wall's face is a circle, not a line: a side along it is measured round that
  // circle, and a corner on it is not worked out (it is said as no corner Grid finds).
  const curved: string[] = []
  for (const id of new Set(walls)) {
    const wall = index.wallsById.get(id)!
    if (wall.arc !== undefined) {
      if (outline.sides.some((s) => s.wallId === id)) curved.push(id)
      else notTheRooms.push(id)
      continue
    }
    const face = roomFace(wall, outline)
    if (face === null) notTheRooms.push(id)
    else faces.set(id, face)
  }
  if (notTheRooms.length > 0) return { drawn: null, missing: 'not-the-rooms', missingWalls: notTheRooms }
  if (entry.wall !== undefined && curved.includes(entry.wall)) {
    const drawn = sideRound(outline, index.wallsById.get(entry.wall)!)
    return drawn === null ? { drawn: null, missing: 'not-drawn' } : { drawn }
  }
  if (entry.wall === undefined && curved.length > 0) return { drawn: null, missing: 'no-corner', missingWalls: curved }
  if (entry.wall !== undefined) {
    const drawn = sideAlong(outline.polygon, faces.get(entry.wall)!)
    return drawn === null ? { drawn: null, missing: 'not-drawn' } : { drawn }
  }
  const corner = (pair: readonly [string, string]): Vec2 | null => cornerOf(outline.polygon, faces.get(pair[0])!, faces.get(pair[1])!)
  const from = corner(entry.from!)
  const to = corner(entry.to!)
  if (from === null || to === null) return { drawn: null, missing: 'no-corner', missingWalls: [...(from === null ? entry.from! : []), ...(to === null ? entry.to! : [])] }
  return { drawn: distance(from, to) }
}

/**
 * Every length the plan keeps as taped, in its order, set against the drawing. Empty for a plan
 * with none.
 */
export function tapedLengths(plan: FloorPlan, given?: PlanIndex): TapedRow[] {
  const list = plan.taped ?? []
  if (list.length === 0) return []
  const index = given ?? indexPlan(plan)
  const outlines = new Map<string, RoomOutline | null>()
  return list.map((entry, at) => {
    const room = plan.rooms.find((r) => r.id === entry.room)
    const measured = measure(entry, index, outlines)
    const within = entry.tolerance ?? tolerance('tapedAgree')
    const off = measured.drawn === null ? null : measured.drawn - entry.length
    const state = off === null ? 'not-measured' : Math.abs(off) <= within + tolerance('lengthEqual') ? 'agrees' : 'differs'
    return {
      index: at,
      id: entry.id ?? null,
      room: entry.room,
      roomName: room?.name ?? entry.room,
      floor: room?.floor ?? DEFAULT_FLOOR_ID,
      what: entry.wall !== undefined ? 'side' : 'corners',
      walls: entry.wall !== undefined ? [entry.wall] : [...(entry.from ?? []), ...(entry.to ?? [])],
      taped: entry.length,
      drawn: measured.drawn,
      off,
      within,
      state,
      ...(measured.missing === undefined ? {} : { missing: measured.missing }),
      ...(measured.missingWalls === undefined ? {} : { missingWalls: measured.missingWalls })
    }
  })
}

// ---------------------------------------------------------------------------------------------
// In words: one wording, for the record's lines, `grid check` and every change's answer. MSG-11:
// each is a sentence by key (`line.part.taped.*`), said in the reader's language; the `…Text`
// forms are its English.

const metres = (value: number): Said => said('issue.part.metres', { n: num(fixedText(value, 3)) })
const walls = (ids: readonly string[]): Value => joined(ids.map(name), 'join.comma', 'join.and')

/**
 * What was taped: `the side along wall "ext-s"`, `corner "ext-s"/"ext-w" to corner "row"/"bed-hall"`;
 * with `capital`, as a sentence starts it.
 */
export function tapedWhatSaid(row: Pick<TapedRow, 'what' | 'walls'>, capital = false): Said {
  if (row.what === 'side') return said(capital ? 'line.part.taped.Side' : 'line.part.taped.side', { wall: name(row.walls[0] ?? '') })
  const [a = '', b = '', c = '', d = ''] = row.walls
  return said(capital ? 'line.part.taped.Corners' : 'line.part.taped.corners', { a: name(a), b: name(b), c: name(c), d: name(d) })
}

/** The two figures: `3.552 m drawn against 3.470 m taped, 0.082 m longer`; the taped one alone when nothing is drawn. */
export function tapedFiguresSaid(row: Pick<TapedRow, 'taped' | 'drawn' | 'off'>): Said {
  if (row.drawn === null || row.off === null) return metres(row.taped)
  const off =
    Math.abs(row.off) < tolerance('lengthEqual')
      ? said('line.part.taped.same')
      : said(row.off > 0 ? 'line.part.taped.longer' : 'line.part.taped.shorter', { off: metres(Math.abs(row.off)) })
  return said('line.part.taped.figures', { drawn: metres(row.drawn), taped: metres(row.taped), off })
}

/** How close they may be: `0.010 m`. */
export const tapedWithinSaid = (row: Pick<TapedRow, 'within'>): Said => metres(row.within)

/** Why a taped length is not measured, or null when it is. */
export function tapedMissingSaid(row: Pick<TapedRow, 'missing' | 'missingWalls' | 'room'>): Said | null {
  const list = walls(row.missingWalls ?? [])
  switch (row.missing) {
    case undefined:
      return null
    case 'bad-length':
      return said('line.part.taped.missing.bad-length')
    case 'no-room':
      return said('line.part.taped.missing.no-room', { room: name(row.room) })
    case 'no-wall':
      return said('line.part.taped.missing.no-wall', { walls: list })
    case 'not-the-rooms':
      return said((row.missingWalls ?? []).length === 1 ? 'line.part.taped.missing.not-the-rooms.one' : 'line.part.taped.missing.not-the-rooms.many', { walls: list })
    case 'no-corner':
      return said('line.part.taped.missing.no-corner', { walls: list })
    case 'not-drawn':
      return said('line.part.taped.missing.not-drawn')
  }
}

/** `tapedWhatSaid` in English. */
export const tapedWhatText = (row: Pick<TapedRow, 'what' | 'walls'>): string => english(tapedWhatSaid(row))

/** `tapedFiguresSaid` in English. */
export const tapedFiguresText = (row: Pick<TapedRow, 'taped' | 'drawn' | 'off'>): string => english(tapedFiguresSaid(row))

/** `tapedWithinSaid` in English. */
export const tapedWithinText = (row: Pick<TapedRow, 'within'>): string => english(tapedWithinSaid(row))

/** `tapedMissingSaid` in English, or null when it is measured. */
export function tapedMissingText(row: Pick<TapedRow, 'missing' | 'missingWalls' | 'room'>): string | null {
  const sentence = tapedMissingSaid(row)
  return sentence === null ? null : english(sentence)
}
