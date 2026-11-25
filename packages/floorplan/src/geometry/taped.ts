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
import { planInState } from './phases'
import { indexPlan, type FloorPlan, type PlanIndex, type Wall } from './plan'
import { roomOutline, type RoomOutline } from './room'
import { fixedText } from './rounding'
import { tolerance } from './tolerances'
import { wallFaces } from './wall'
import { curvePieceCount, wallCurve, type WallCurve } from './arc'
import { add, cross, distance, dot, intersectLines, scale, sub, type Line, type Vec2 } from './vec2'

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

/** CNT-32: the face of a curved wall that looks into the room, a circle round the wall's centre. */
interface RoundFace {
  readonly curve: WallCurve
  readonly radius: number
}

/**
 * CNT-32: the circle the room's outline runs along a curved wall by: of its two faces, the one
 * the outline has edges on. It is found on the outline itself, since the side the outline names
 * for a curved wall it goes round against the wall's own direction is told from the way it goes.
 */
function roundFace(wall: Wall, outline: RoomOutline): RoundFace | null {
  const curve = wallCurve(wall)
  if (!outline.sides.some((s) => s.wallId === wall.id) || curve === null) return null
  const half = wall.virtual ? 0 : wall.thickness / 2
  const polygon = outline.polygon
  for (const radius of [curve.radius - half, curve.radius + half]) {
    const face = { curve, radius }
    if (polygon.some((a, i) => alongRound(face, a, polygon[(i + 1) % polygon.length]!))) return face
  }
  return null
}

const TURN = 2 * Math.PI

/** CNT-32: whether a point on a curved face's circle lies on the wall's own stretch of it, from its start round its sweep. */
function onSweep(face: RoundFace, p: Vec2): boolean {
  const { curve, radius } = face
  if (curve.closed) return true
  const angle = Math.atan2(p.y - curve.centre.y, p.x - curve.centre.x)
  const turned = ((((angle - curve.startAngle) * Math.sign(curve.sweep)) % TURN) + TURN) % TURN
  const near = tolerance('chainPoint')
  return turned * radius <= Math.abs(curve.sweep) * radius + near || (TURN - turned) * radius <= near
}

/** CNT-32: whether a point lies on a curved face: on its circle, along the wall's own stretch of it. */
function onRound(face: RoundFace, p: Vec2): boolean {
  return Math.abs(distance(face.curve.centre, p) - face.radius) <= tolerance('chainPoint') && onSweep(face, p)
}

/**
 * CNT-32: whether an edge of the outline runs along a curved face: both its ends on the wall's
 * stretch of the circle, and turning round it no more than one of the curve's straight pieces
 * does, so a straight side whose corners happen to lie on the circle is not counted as the curve.
 */
function alongRound(face: RoundFace, a: Vec2, b: Vec2): boolean {
  if (!onRound(face, a) || !onRound(face, b)) return false
  const half = Math.min(1, distance(a, b) / (2 * face.radius))
  const piece = Math.abs(face.curve.sweep) / curvePieceCount(face.curve)
  return 2 * Math.asin(half) <= piece + tolerance('chainPoint') / face.radius
}

/**
 * CNT-18: the outline's length along a curved wall's face that looks into the room: every edge
 * that runs along that face's circle, round the wall's centre (CNT-32: along the wall's own
 * stretch of it).
 */
function sideRound(outline: RoomOutline, wall: Wall): number | null {
  const face = roundFace(wall, outline)
  if (face === null) return null
  let total = 0
  let any = false
  const polygon = outline.polygon
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (alongRound(face, a, b)) {
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

/** CNT-32: a wall's face that looks into the room: a line for a straight wall, a circle for a curved one. */
type RoomFace = { readonly line: Line; readonly round?: undefined } | { readonly round: RoundFace; readonly line?: undefined }

/** Where a line crosses a circle: none, or one or two points. */
function lineMeetsCircle(line: Line, centre: Vec2, radius: number): Vec2[] {
  const foot = add(line.point, scale(line.dir, dot(sub(centre, line.point), line.dir)))
  const off = distance(foot, centre)
  if (off > radius + tolerance('chainPoint')) return []
  const along = Math.sqrt(Math.max(0, radius * radius - off * off))
  return along === 0 ? [foot] : [add(foot, scale(line.dir, along)), add(foot, scale(line.dir, -along))]
}

/** Where two circles cross: none, or one or two points. */
function circlesMeet(a: Vec2, ra: number, b: Vec2, rb: number): Vec2[] {
  const d = distance(a, b)
  if (!(d > 0) || d > ra + rb + tolerance('chainPoint') || d < Math.abs(ra - rb) - tolerance('chainPoint')) return []
  const along = (d * d + ra * ra - rb * rb) / (2 * d)
  const dir = scale(sub(b, a), 1 / d)
  const foot = add(a, scale(dir, along))
  const across = Math.sqrt(Math.max(0, ra * ra - along * along))
  const normal = { x: -dir.y, y: dir.x }
  return across === 0 ? [foot] : [add(foot, scale(normal, across)), add(foot, scale(normal, -across))]
}

/**
 * CNT-32: where two of the room's faces cross, one of them at least a curve, which counts only
 * along its own wall's stretch. (Two straight faces are `cornerOf`'s.)
 */
function crossings(a: RoomFace, b: RoomFace): Vec2[] {
  let points: Vec2[] = []
  if (a.round !== undefined && b.round !== undefined) points = circlesMeet(a.round.curve.centre, a.round.radius, b.round.curve.centre, b.round.radius)
  else if (b.round !== undefined) points = lineMeetsCircle(a.line!, b.round.curve.centre, b.round.radius)
  else if (a.round !== undefined) points = lineMeetsCircle(b.line!, a.round.curve.centre, a.round.radius)
  return points.filter((p) => (a.round === undefined || onSweep(a.round, p)) && (b.round === undefined || onSweep(b.round, p)))
}

/** Whether an edge of the outline runs along a face. */
function along(face: RoomFace, a: Vec2, b: Vec2): boolean {
  if (face.round !== undefined) return alongRound(face.round, a, b)
  const near = tolerance('chainPoint')
  return offLine(a, face.line) <= near && offLine(b, face.line) <= near
}

/**
 * CNT-32: the outline's corner where two faces meet when one of them, or both, is a curve: the
 * outline's point at one of the places the faces cross. Where they cross at two of the room's
 * corners (a half-round bay closed by one straight wall), the corner where, going round the room
 * counter-clockwise, the first face gives way to the second; null when that does not settle it.
 */
function roundCornerOf(polygon: readonly Vec2[], a: RoomFace, b: RoomFace): Vec2 | null {
  const found = new Set<number>()
  for (const at of crossings(a, b)) {
    let best = -1
    let gap = Infinity
    polygon.forEach((p, i) => {
      const d = distance(p, at)
      if (d < gap) [best, gap] = [i, d]
    })
    if (best >= 0 && gap <= tolerance('chainPoint')) found.add(best)
  }
  const list = [...found]
  if (list.length === 1) return polygon[list[0]!]!
  const n = polygon.length
  const turning = list.filter((i) => along(a, polygon[(i + n - 1) % n]!, polygon[i]!) && along(b, polygon[i]!, polygon[(i + 1) % n]!))
  return turning.length === 1 ? polygon[turning[0]!]! : null
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
  const rounds = new Map<string, RoundFace>()
  const notTheRooms: string[] = []
  // CNT-18: a curved wall's face is a circle, not a line: a side along it is measured round that
  // circle. CNT-32: a corner on it is where the other wall's face crosses that circle.
  for (const id of new Set(walls)) {
    const wall = index.wallsById.get(id)!
    if (wall.arc !== undefined) {
      const round = roundFace(wall, outline)
      if (round === null) notTheRooms.push(id)
      else rounds.set(id, round)
      continue
    }
    const face = roomFace(wall, outline)
    if (face === null) notTheRooms.push(id)
    else faces.set(id, face)
  }
  if (notTheRooms.length > 0) return { drawn: null, missing: 'not-the-rooms', missingWalls: notTheRooms }
  if (entry.wall !== undefined && rounds.has(entry.wall)) {
    const drawn = sideRound(outline, index.wallsById.get(entry.wall)!)
    return drawn === null ? { drawn: null, missing: 'not-drawn' } : { drawn }
  }
  if (entry.wall !== undefined) {
    const drawn = sideAlong(outline.polygon, faces.get(entry.wall)!)
    return drawn === null ? { drawn: null, missing: 'not-drawn' } : { drawn }
  }
  const faceOf = (id: string): RoomFace => {
    const round = rounds.get(id)
    return round !== undefined ? { round } : { line: faces.get(id)! }
  }
  // A wall named twice makes no corner; two straight faces meet where their lines cross, as before.
  const corner = (pair: readonly [string, string]): Vec2 | null =>
    pair[0] === pair[1] && rounds.has(pair[0])
      ? null
      : rounds.has(pair[0]) || rounds.has(pair[1])
        ? roundCornerOf(outline.polygon, faceOf(pair[0]), faceOf(pair[1]))
        : cornerOf(outline.polygon, faces.get(pair[0])!, faces.get(pair[1])!)
  const from = corner(entry.from!)
  const to = corner(entry.to!)
  if (from === null || to === null) return { drawn: null, missing: 'no-corner', missingWalls: [...(from === null ? entry.from! : []), ...(to === null ? entry.to! : [])] }
  return { drawn: distance(from, to) }
}

/**
 * Every length the plan keeps as taped, in its order, set against the drawing. Empty for a plan
 * with none. ARE-41: a tape was run on the building as surveyed, so it is set against the
 * existing state (`planInState` 'before'), never the proposed one: a room or wall that is new
 * is not there to measure, and every reader (the check, every change's answer) gets the same
 * rows. A plan with no phases is read as it is; `given` is an index of the plan as it is read.
 */
export function tapedLengths(whole: FloorPlan, given?: PlanIndex): TapedRow[] {
  const list = whole.taped ?? []
  if (list.length === 0) return []
  const plan = planInState(whole, 'before')
  const index = given !== undefined && plan === whole ? given : indexPlan(plan)
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
