/**
 * Wall geometry.
 *
 * A wall arrives as a segment with no thickness (`start` → `end`) plus a
 * number (`thickness`). Here it becomes the shapes both views draw: a polygon
 * in plan, and a list of parts to raise in 3D. Its ends are cut as the joints
 * with other walls decide (`joints.ts`), and square where it meets none.
 *
 * A curved wall (CNT-18, C21) has an arc for its axis instead (`arc.ts`). Every length along
 * it is along the curve, and its shapes follow the curve: exactly in `wallSliceShape`, by its
 * stations in the polygons. Code that reads a wall as lines reads `wallSegments`.
 */

import type { Opening, Wall } from './plan'
import type { Line, Vec2 } from './vec2'
import { tolerance, tolerancesAsStated } from './tolerances'
import { quoted } from '../types/planText'
import { add, fromTuple, length, normalize, perp, scale, sub } from './vec2'
import type { WallCurve } from './arc'
import { curvePointAt, curveStations, curveStationsBetween, curveTangentAt, wallCurve } from './arc'

export interface WallAxis {
  readonly start: Vec2
  readonly end: Vec2
  /** Unit direction from `start` towards `end`. */
  readonly dir: Vec2
  /** Unit normal: the direction half the thickness grows along. */
  readonly normal: Vec2
  readonly length: number
}

/**
 * The straight axis of a straight wall. A curved wall (CNT-18) has none: it is followed piece by
 * piece (`wallSegments`), or point by point (`wallFrameAt`), and this throws for it, so no code
 * takes its chord for the wall.
 */
export function wallAxis(wall: Wall): WallAxis {
  if (wall.arc !== undefined) {
    throw new Error(`Wall ${quoted(wall.id)} is curved: it has no straight axis`)
  }
  return straightAxis(wall)
}

function straightAxis(wall: Wall): WallAxis {
  const start = fromTuple(wall.start)
  const end = fromTuple(wall.end)
  const delta = sub(end, start)
  const len = length(delta)
  if (len === 0) {
    throw new Error(`Wall ${quoted(wall.id)} has zero length: start and end are the same point`)
  }
  const dir = normalize(delta)
  return { start, end, dir, normal: perp(dir), length: len }
}

/** Point on the wall axis, `s` meters away from `start`. */
export function pointAlong(axis: WallAxis, s: number): Vec2 {
  return add(axis.start, scale(axis.dir, s))
}

/** Whether the wall is a curve (CNT-18, C21). */
export function isCurved(wall: Wall): boolean {
  return wall.arc !== undefined
}

/** The wall's length along its axis, straight or curved. Throws for a straight wall of no length. */
export function wallLength(wall: Wall): number {
  const curve = wallCurve(wall)
  return curve === null ? wallAxis(wall).length : curve.length
}

/** A place on the wall's axis, the way the axis runs there, and the normal: the left face's side. */
export interface WallFrame {
  readonly point: Vec2
  readonly dir: Vec2
  readonly normal: Vec2
}

/** The wall's frame `s` metres along its axis from `start`, straight or curved. */
export function wallFrameAt(wall: Wall, s: number): WallFrame {
  const curve = wallCurve(wall)
  if (curve === null) {
    const axis = wallAxis(wall)
    return { point: pointAlong(axis, s), dir: axis.dir, normal: axis.normal }
  }
  const dir = curveTangentAt(curve, s)
  return { point: curvePointAt(curve, s), dir, normal: perp(dir) }
}

/** The point `s` metres along the wall's axis, straight or curved. */
export function wallPointAt(wall: Wall, s: number): Vec2 {
  return wallFrameAt(wall, s).point
}

/** One straight piece of a wall's axis: the whole axis of a straight wall, a chord of a curve. */
export interface WallSegment extends WallAxis {
  /** Where it starts and ends along the wall's axis, in metres from `start`. */
  readonly from: number
  readonly to: number
}

function segmentOf(start: Vec2, end: Vec2, from: number, to: number): WallSegment {
  const delta = sub(end, start)
  const len = length(delta)
  const dir = len === 0 ? { x: 1, y: 0 } : normalize(delta)
  return { start, end, dir, normal: perp(dir), length: len, from, to }
}

/**
 * The wall's axis as straight pieces, in order from `start`: one for a straight wall, the chain
 * of chords a curved one is followed by (`curveStations`). What measures, checks and traces a
 * wall as lines reads these.
 */
export function wallSegments(wall: Wall): WallSegment[] {
  const curve = wallCurve(wall)
  if (curve === null) {
    const axis = wallAxis(wall)
    return [{ ...axis, from: 0, to: axis.length }]
  }
  // CNT-25: a curve's chords are worked out once per wall, as its curve is (`wallCurve`), and
  // not while `withTolerances` is in force, which may change how many there are.
  const stated = tolerancesAsStated()
  let kept = stated ? curveChords.get(wall) : undefined
  if (kept === undefined) {
    kept = chords(curve, curveStations(curve))
    if (stated) curveChords.set(wall, kept)
  }
  return [...kept]
}

/** Each curved wall's chords, as `wallSegments` gives them (CNT-25). */
const curveChords = new WeakMap<Wall, readonly WallSegment[]>()

function chords(curve: WallCurve, stations: readonly number[]): WallSegment[] {
  const points = stations.map((s) => curvePointAt(curve, s))
  return stations.slice(1).map((to, i) => segmentOf(points[i]!, points[i + 1]!, stations[i]!, to))
}

/** The wall's axis as points: its two ends, or the stations along a curve (a whole circle closes on its start). */
export function wallPath(wall: Wall): Vec2[] {
  const curve = wallCurve(wall)
  if (curve === null) {
    const axis = wallAxis(wall)
    return [axis.start, axis.end]
  }
  return curveStations(curve).map((s) => curvePointAt(curve, s))
}

/**
 * The straight hole an opening makes in its wall: between its two edges on the axis. On a
 * straight wall it lies along the axis; on a curved one it is the chord between them, and its
 * `dir` and `normal` are the chord's, so a door's leaf closes along it (C21).
 */
export function openingChord(wall: Wall, from: number, to: number): WallSegment {
  return segmentOf(wallPointAt(wall, from), wallPointAt(wall, to), from, to)
}

/**
 * Straight copies of a wall for code that works on straight walls: the wall itself, or one per
 * chord of a curve, each with the wall's id and every other field. They are never written back.
 */
export function straightPieces(wall: Wall): Wall[] {
  if (wall.arc === undefined) return [wall]
  // CNT-25: the same pieces for the same wall, so what is worked out from them can be kept too.
  const stated = tolerancesAsStated()
  let kept = stated ? curvePieces.get(wall) : undefined
  if (kept === undefined) {
    kept = wallSegments(wall).map((segment) => {
      const piece: Wall = { ...wall, start: [segment.start.x, segment.start.y], end: [segment.end.x, segment.end.y] }
      delete piece.arc
      return piece
    })
    if (stated) curvePieces.set(wall, kept)
  }
  return [...kept]
}

/** Each curved wall's straight copies, as `straightPieces` gives them (CNT-25). */
const curvePieces = new WeakMap<Wall, readonly Wall[]>()

/**
 * The wall's two faces, as infinite lines.
 *
 * `left` is the face the normal points at (90° counter-clockwise from the
 * wall direction); `right` is the opposite one. They are lines and not
 * segments because rooms need to intersect them past their endpoints.
 */
export function wallFaces(wall: Wall): { left: Line; right: Line } {
  const axis = wallAxis(wall)
  // A virtual wall is a line with no substance: both faces lie on its axis, so
  // the rooms either side of it meet there and no floor is lost between them.
  const half = wall.virtual ? 0 : wall.thickness / 2
  return {
    left: { point: add(axis.start, scale(axis.normal, half)), dir: axis.dir },
    right: { point: add(axis.start, scale(axis.normal, -half)), dir: axis.dir }
  }
}

/** The wall axis as a pair of points: its two ends, curved or not. This is what a straight virtual wall draws as. */
export function wallCenterline(wall: Wall): [Vec2, Vec2] {
  return [fromTuple(wall.start), fromTuple(wall.end)]
}

/**
 * How far each face of a wall reaches past one end of its axis, in metres: positive runs past
 * the end, negative stops short of it. `left` is the face the normal points at. Both are 0 at an
 * end cut square; where walls meet, `wallJoints` (joints.ts) decides them (SHT-2).
 */
export interface FaceReach {
  readonly left: number
  readonly right: number
}

/** The reach of a wall's faces at both ends. */
export interface WallEnds {
  readonly start: FaceReach
  readonly end: FaceReach
}

/** A wall cut square at both ends: one that meets no other. */
export const SQUARE_ENDS: WallEnds = { start: { left: 0, right: 0 }, end: { left: 0, right: 0 } }

/**
 * Polygon of a run of the wall in plan, between `from` and `to` meters from
 * `start`. The four vertices come out in order, ready for a `<path>`.
 *
 * A run that reaches an end of the wall takes that end's corner from `ends`: each face runs
 * to where the joint puts it. A run too short for its corner (a door hard against it) keeps
 * the face no shorter than the run's other end.
 */
export function wallSlicePolygon(wall: Wall, from: number, to: number, ends: WallEnds = SQUARE_ENDS): Vec2[] {
  return sliceShape(wall, from, to, ends).flatMap((side) => side.points)
}

/**
 * One face of a run of wall, as `wallSliceShape` gives it: its points in order, and where a
 * stretch between two of them follows a curve, how much it turns (signed radians).
 */
export interface SliceSide {
  readonly points: readonly Vec2[]
  /** One per stretch between consecutive points: 0 for straight, the turn for an arc. */
  readonly turns: readonly number[]
}

/**
 * A run of wall as exactly as its shape is: the left face from `from` to `to`, then the right
 * face back. On a curved wall each face is an arc (with a straight reach past an end, where a
 * joint puts one); `wallSlicePolygon` is the same with the arcs followed by their stations. An
 * export that can write an arc writes this (CNT-18).
 */
export function wallSliceShape(wall: Wall, from: number, to: number, ends: WallEnds = SQUARE_ENDS): { readonly left: SliceSide; readonly right: SliceSide } {
  const curve = wallCurve(wall)
  const [left, right] = sliceShape(wall, from, to, ends)
  if (curve === null) return { left: { points: left!.points, turns: [0] }, right: { points: right!.points, turns: [0] } }
  return { left: left!.exact, right: right!.exact }
}

interface FaceRun {
  readonly points: Vec2[]
  readonly exact: SliceSide
}

function sliceShape(wall: Wall, from: number, to: number, ends: WallEnds): [FaceRun, FaceRun] {
  const curve = wallCurve(wall)
  const total = curve === null ? wallAxis(wall).length : curve.length
  const half = wall.thickness / 2
  const none = tolerance('noLength')
  const open = curve === null || !curve.closed
  const atStart = open && from <= none
  const atEnd = open && to >= total - none
  const leftFrom = atStart ? from - ends.start.left : from
  const rightFrom = atStart ? from - ends.start.right : from
  const leftTo = Math.max(atEnd ? to + ends.end.left : to, leftFrom)
  const rightTo = Math.max(atEnd ? to + ends.end.right : to, rightFrom)
  if (curve === null) {
    const axis = wallAxis(wall)
    const offsetLeft = scale(axis.normal, half)
    const offsetRight = scale(axis.normal, -half)
    const l = [add(pointAlong(axis, leftFrom), offsetLeft), add(pointAlong(axis, leftTo), offsetLeft)]
    const r = [add(pointAlong(axis, rightTo), offsetRight), add(pointAlong(axis, rightFrom), offsetRight)]
    return [
      { points: l, exact: { points: l, turns: [0] } },
      { points: r, exact: { points: r, turns: [0] } }
    ]
  }
  const leftSide = curveFace(curve, leftFrom, leftTo, half, total)
  const rightSide = curveFace(curve, rightFrom, rightTo, -half, total)
  return [leftSide, reverseFace(rightSide)]
}

/**
 * One face of a curved run, `offset` from the axis on the normal's side, from `faceFrom` to
 * `faceTo` along the axis. The curve is followed from `from` to `to`; past an end of the wall
 * the face runs straight on along the end's tangent, as far as its joint takes it.
 */
function curveFace(curve: WallCurve, faceFrom: number, faceTo: number, offset: number, total: number): FaceRun {
  const at = (s: number): Vec2 => {
    const on = curve.closed ? s : Math.min(Math.max(s, 0), total)
    const dir = curveTangentAt(curve, on)
    return add(add(curvePointAt(curve, on), scale(perp(dir), offset)), scale(dir, s - on))
  }
  // The face follows the curve where it lies on the wall, and runs straight on past an end.
  const a = curve.closed ? faceFrom : Math.max(faceFrom, 0)
  const b = curve.closed ? faceTo : Math.min(faceTo, total)
  if (b <= a) {
    const points = [at(faceFrom), at(faceTo)]
    return { points, exact: { points, turns: [0] } }
  }
  const points = curveStationsBetween(curve, a, b).map(at)
  // No stretch turns more than half a circle: a whole one, with no opening, would have no bulge.
  const halves = (b - a) / curve.radius > Math.PI ? 2 : 1
  const exactPoints = Array.from({ length: halves + 1 }, (_, k) => at(a + ((b - a) * k) / halves))
  const turns = Array.from({ length: halves }, () => (Math.sign(curve.sweep) * (b - a)) / curve.radius / halves)
  if (faceFrom < a) {
    points.unshift(at(faceFrom))
    exactPoints.unshift(at(faceFrom))
    turns.unshift(0)
  }
  if (faceTo > b) {
    points.push(at(faceTo))
    exactPoints.push(at(faceTo))
    turns.push(0)
  }
  return { points, exact: { points: exactPoints, turns } }
}

function reverseFace(face: FaceRun): FaceRun {
  return {
    points: [...face.points].reverse(),
    exact: { points: [...face.exact.points].reverse(), turns: [...face.exact.turns].reverse().map((t) => -t) }
  }
}

/** Polygon of the whole wall, with no openings taken out, its corners as `ends` puts them. */
export function wallPolygon(wall: Wall, ends: WallEnds = SQUARE_ENDS): Vec2[] {
  return wallSlicePolygon(wall, 0, wallLength(wall), ends)
}

/** How far an opening reaches along the wall, measured from `start`. */
export interface OpeningSpan {
  readonly opening: Opening
  readonly from: number
  readonly to: number
}

export function openingSpan(opening: Opening): OpeningSpan {
  // C2 · `offset` is the near edge, not the center.
  return { opening, from: opening.offset, to: opening.offset + opening.width }
}

/**
 * VEW-77: an opening's span on a whole circle `total` long, brought round to start on it, and cut
 * in two where it runs past the circle's start.
 */
function roundTheStart(span: OpeningSpan, total: number): OpeningSpan[] {
  const shift = Math.floor(span.from / total) * total
  const from = span.from - shift
  const to = span.to - shift
  const none = tolerance('noLength')
  if (to <= total + none) return [{ ...span, from, to }]
  return [
    { ...span, from, to: total },
    { ...span, from: 0, to: Math.min(to - total, from) }
  ]
}

export type WallPartKind = 'solid' | 'lintel' | 'sill'

/**
 * A piece of wall that has substance.
 *
 * This is the decision that avoids CSG: instead of subtracting boxes from the
 * wall to cut the openings, we split it into the pieces that do exist. Every
 * piece is a right prism — a rectangle along the wall, between two heights —
 * so raising it in 3D is an extrusion and nothing more.
 */
export interface WallPart {
  readonly kind: WallPartKind
  /** Meters from the wall's `start`. */
  readonly from: number
  readonly to: number
  /** Heights above the floor. */
  readonly zFrom: number
  readonly zTo: number
  /** The opening that produced the piece, for lintels and sills. */
  readonly opening?: Opening
}

/**
 * Breaks the wall into the pieces that need to be drawn and raised.
 *
 * - `solid`: a run from floor to ceiling, between openings.
 * - `lintel`: the header above an opening.
 * - `sill`: the apron below a window.
 *
 * A virtual wall has no substance and returns an empty list.
 */
export function wallParts(wall: Wall, openings: readonly Opening[] = []): WallPart[] {
  if (wall.virtual) return []

  const total = wallLength(wall)
  // An opening may run `openingOverrun` past an end of its wall (validate.ts); it is drawn
  // within the wall, so nothing pokes out of it. VEW-77: on a whole circle it may run round past
  // the start instead, and leaves its gap on both sides of it.
  const closed = wallCurve(wall)?.closed === true
  const spans = openings
    .map(openingSpan)
    .flatMap((span) => (closed ? roundTheStart(span, total) : [span]))
    .map((span) => ({ ...span, from: Math.max(0, span.from), to: Math.min(total, span.to) }))
    .sort((a, b) => a.from - b.from)
  const parts: WallPart[] = []
  const none = tolerance('noLength')

  let cursor = 0
  for (const span of spans) {
    // The solid run left before this opening.
    if (span.from - cursor > none) {
      parts.push({ kind: 'solid', from: cursor, to: span.from, zFrom: 0, zTo: wall.height })
    }

    const { opening } = span
    const head = opening.sill + opening.height

    if (opening.sill > none) {
      parts.push({
        kind: 'sill',
        from: span.from,
        to: span.to,
        zFrom: 0,
        zTo: opening.sill,
        opening
      })
    }
    if (wall.height - head > none) {
      parts.push({
        kind: 'lintel',
        from: span.from,
        to: span.to,
        zFrom: head,
        zTo: wall.height,
        opening
      })
    }

    cursor = Math.max(cursor, span.to)
  }

  if (total - cursor > none) {
    // A whole circle has no ends (CNT-18): the run after its last opening carries on round
    // into the run before its first, as one.
    const first = parts[0]
    if (wallCurve(wall)?.closed === true && spans.length > 0 && first?.kind === 'solid' && first.from <= none) {
      parts.shift()
      parts.push({ ...first, from: cursor, to: total + first.to })
    } else {
      parts.push({ kind: 'solid', from: cursor, to: total, zFrom: 0, zTo: wall.height })
    }
  }

  return parts
}

/**
 * The runs of wall drawn solid in plan.
 *
 * A lintel is invisible from above — looking down at the house, a door is just
 * a gap — so the plan view only needs the `solid` pieces.
 */
export function wallPlanSlices(wall: Wall, openings: readonly Opening[] = [], ends: WallEnds = SQUARE_ENDS): Vec2[][] {
  return wallParts(wall, openings)
    .filter((part) => part.kind === 'solid')
    .map((part) => wallSlicePolygon(wall, part.from, part.to, ends))
}
