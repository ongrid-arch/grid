/**
 * VEW-9: how far a route is walked, and where a person stands in a doorway.
 *
 * A route is walked from the middle of the room it starts in (the centre of the widest circle the
 * room holds) to the middle of each doorway on its side of the wall, straight through the hole to
 * the middle of its other side, and on to the next doorway, ending at the middle of the room it
 * ends in, or at the outside face of the door out. Inside a room the line is the shortest one that
 * stays on its floor: it goes round inside corners and holes, never through a wall.
 *
 * A doorway's middle on the far side is the near middle mirrored across the wall's centre line,
 * so a wall's thickness is walked once, face to face. A dividing line (`open side`) is crossed at
 * the middle of the stretch the two rooms share. Pure: a survey in, numbers out.
 *
 * ARE-18: a route out may go up or down a stair (`StairPassage`): walked to the foot of its
 * walking line, along it on plan and on from its head; a stair drawn as a room on each floor,
 * from the middle of the room to the middle of the one over it. The climb is never in the length.
 * Where a length cannot be given, `walkRoute` names the room and why (`WalkGap`).
 */
import {
  cross,
  curveAlong,
  dot,
  lineMouth,
  openingChord,
  openingMouth,
  pointInPolygon,
  poleOfInaccessibility,
  sub,
  tolerance,
  wallAxis,
  wallCurve,
  wallFrameAt,
  wallSegments,
  type Opening,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import type { Survey, SurveyRoom } from './survey'

export const WALKED_RULE =
  'Walked from the middle of the room it starts in (the centre of its widest circle) to the middle of each doorway, face to face through the wall, and on to the middle of the room it ends in, or to the outside face of the door out; inside each room on the shortest line that keeps to its floor, round inside corners; a stair along its walking line on plan, or from the middle of a stair room to the middle of the one over it, the climb left out.'

type Ring = readonly Vec2[]

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const far = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Where a doorway is crossed: the middle on the room's side and on the other side. */
export interface Crossing {
  readonly near: Vec2
  readonly far: Vec2
  /** Into the room, from the doorway: square to the wall. */
  readonly inward: Vec2
}

function wallOf(survey: Survey, id: string): Wall | undefined {
  return survey.plan.walls.find((w) => w.id === id)
}

/**
 * Where the doorway `via` (an opening's id, or a dividing line's wall id) is crossed from `room`,
 * or null when the room is on neither side of it. `other` is the room across, for a dividing
 * line, whose shared stretch is crossed at its middle.
 */
export function crossingOf(survey: Survey, room: SurveyRoom, via: string, other: SurveyRoom | null = null): Crossing | null {
  if (room.polygon.length < 3) return null
  const opening: Opening | undefined = survey.plan.openings.find((o) => o.id === via)
  const wall = wallOf(survey, opening?.wall ?? via)
  if (wall === undefined) return null
  // CNT-18: a curved wall has no one axis. A doorway in it is crossed square to its own hole,
  // the straight chord between its edges; a curved dividing line along the curve.
  if (wall.arc !== undefined) {
    if (opening === undefined || wall.virtual === true) return curvedLineCrossing(wall, room, other)
    const chord = openingChord(wall, opening.offset, opening.offset + opening.width)
    if (chord.length < tolerance('noLength')) return null
    const mouth = openingMouth(wall, opening, room.polygon, room.holes)
    // ARE-18: on the curve's outside the hole's face bows out of the room's outline, which
    // follows the curve by straight pieces: the doorway is found from the curve's own frame.
    if (mouth === null) return curvedDoorCrossing(wall, opening, room)
    const near = mid(mouth[0], mouth[1])
    const side = dot(sub(near, chord.start), chord.normal)
    const inward = side >= 0 ? chord.normal : { x: -chord.normal.x, y: -chord.normal.y }
    return { near, far: { x: near.x - 2 * side * chord.normal.x, y: near.y - 2 * side * chord.normal.y }, inward }
  }
  const axis = wallAxis(wall)
  if (axis.length < tolerance('noLength')) return null
  const inwardOf = (near: Vec2): Vec2 => {
    // The normal that points into the room: toward the room's own middle from the wall's line.
    const side = dot(sub(near, axis.start), axis.normal)
    if (Math.abs(side) > tolerance('noLength')) return side > 0 ? axis.normal : { x: -axis.normal.x, y: -axis.normal.y }
    // ARE-18: on the line itself, the side a step away that is the room's floor; round a hole
    // (a well open to the room) the room's middle may lie either way.
    const back = { x: -axis.normal.x, y: -axis.normal.y }
    const step = tolerance('useRaster')
    const on = (n: Vec2): boolean => pointInPolygon({ x: near.x + n.x * step, y: near.y + n.y * step }, room.polygon, room.holes)
    if (on(axis.normal) !== on(back)) return on(axis.normal) ? axis.normal : back
    const pole = poleOfInaccessibility(room.polygon, undefined, room.holes).point
    return dot(sub(pole, axis.start), axis.normal) >= 0 ? axis.normal : { x: -axis.normal.x, y: -axis.normal.y }
  }
  if (opening !== undefined && wall.virtual !== true) {
    const mouth = openingMouth(wall, opening, room.polygon, room.holes)
    if (mouth === null) return null
    const near = mid(mouth[0], mouth[1])
    const side = dot(sub(near, axis.start), axis.normal)
    const mirrored = { x: near.x - 2 * side * axis.normal.x, y: near.y - 2 * side * axis.normal.y }
    return { near, far: mirrored, inward: inwardOf(near) }
  }
  const mine = ringMouth(wall, room)
  if (mine === null) return null
  let stretch: readonly [Vec2, Vec2] = mine
  if (other !== null && other.polygon.length >= 3) {
    const theirs = ringMouth(wall, other)
    if (theirs !== null) {
      const t = (p: Vec2): number => dot(sub(p, axis.start), axis.dir)
      const lo = Math.max(Math.min(t(mine[0]), t(mine[1])), Math.min(t(theirs[0]), t(theirs[1])))
      const hi = Math.min(Math.max(t(mine[0]), t(mine[1])), Math.max(t(theirs[0]), t(theirs[1])))
      if (hi > lo) stretch = [{ x: axis.start.x + axis.dir.x * lo, y: axis.start.y + axis.dir.y * lo }, { x: axis.start.x + axis.dir.x * hi, y: axis.start.y + axis.dir.y * hi }]
    }
  }
  const near = mid(stretch[0], stretch[1])
  return { near, far: near, inward: inwardOf(near) }
}

/** ARE-18: where a dividing line meets a room: on its outline, or round one of its holes (a well open to the room). */
function ringMouth(wall: Wall, room: Pick<SurveyRoom, 'polygon' | 'holes'>): readonly [Vec2, Vec2] | null {
  for (const ring of [room.polygon, ...room.holes]) {
    const mouth = lineMouth(wall, ring)
    if (mouth !== null) return mouth
  }
  return null
}

/** The nearest point of a room's outline or holes to `p`. */
function nearestOnOutline(p: Vec2, rings: readonly Ring[]): Vec2 {
  let best = p
  let bestD = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const ab = sub(ring[(i + 1) % ring.length]!, a)
      const span = dot(ab, ab)
      const t = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t }
      const d = far(p, q)
      if (d < bestD) [best, bestD] = [q, d]
    }
  }
  return best
}

/**
 * ARE-18: a door in a curved wall, crossed from the room on either side: at the middle of the
 * hole along the curve, the face on the room's side (set on the room's outline) and the face
 * across, square to the curve there. Null when neither face has the room's floor past it.
 */
function curvedDoorCrossing(wall: Wall, opening: Opening, room: SurveyRoom): Crossing | null {
  const frame = wallFrameAt(wall, opening.offset + opening.width / 2)
  const half = wall.thickness / 2
  const step = tolerance('useRaster')
  for (const side of [1, -1] as const) {
    const n = { x: frame.normal.x * side, y: frame.normal.y * side }
    const face = { x: frame.point.x + n.x * half, y: frame.point.y + n.y * half }
    if (!pointInPolygon({ x: face.x + n.x * step, y: face.y + n.y * step }, room.polygon, room.holes)) continue
    return { near: nearestOnOutline(face, [room.polygon, ...room.holes]), far: { x: frame.point.x - n.x * half, y: frame.point.y - n.y * half }, inward: n }
  }
  return null
}

/**
 * CNT-18: where a curved dividing line is crossed from `room`: at the middle, along the curve, of
 * the stretch it shares with `other` (or of the room's own stretch of it), on the straight piece
 * the two rooms' outlines follow it by there, square to the curve, into the room.
 */
function curvedLineCrossing(wall: Wall, room: SurveyRoom, other: SurveyRoom | null): Crossing | null {
  const curve = wallCurve(wall)
  if (curve === null) return null
  const mine = ringMouth(wall, room)
  if (mine === null) return null
  const span = (mouth: readonly [Vec2, Vec2]): [number, number] => {
    const a = curveAlong(curve, mouth[0])
    const b = curveAlong(curve, mouth[1])
    return [Math.min(a, b), Math.max(a, b)]
  }
  let [lo, hi] = span(mine)
  const theirs = other !== null && other.polygon.length >= 3 ? ringMouth(wall, other) : null
  if (theirs !== null) {
    const [a, b] = span(theirs)
    if (Math.min(hi, b) > Math.max(lo, a)) [lo, hi] = [Math.max(lo, a), Math.min(hi, b)]
  }
  const at = (lo + hi) / 2
  const frame = wallFrameAt(wall, at)
  // On the straight piece there, which the rooms' outlines share, a hair inside the true curve.
  const piece = wallSegments(wall).find((p) => at >= p.from && at <= p.to) ?? null
  const k = piece === null || piece.to === piece.from ? 0 : ((at - piece.from) * piece.length) / (piece.to - piece.from)
  const near = piece === null ? frame.point : { x: piece.start.x + piece.dir.x * k, y: piece.start.y + piece.dir.y * k }
  // The normal that points into the room: the side of the curve the room's floor is on there, a
  // step past the straight pieces its outline follows the curve by; else toward its middle.
  const step = tolerance('useRaster')
  const back = { x: -frame.normal.x, y: -frame.normal.y }
  const on = (n: Vec2): boolean => pointInPolygon({ x: near.x + n.x * step, y: near.y + n.y * step }, room.polygon, room.holes)
  const pole = poleOfInaccessibility(room.polygon, undefined, room.holes).point
  const inward = on(frame.normal) !== on(back) ? (on(frame.normal) ? frame.normal : back) : dot(sub(pole, near), frame.normal) >= 0 ? frame.normal : back
  return { near, far: near, inward }
}

// ---------------------------------------------------------------------------------------------
// The shortest line across a room's floor

/** Whether segment a-b crosses segment c-d away from their ends: a wall would be walked through. */
function crossesProperly(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const eps = tolerance('noLength')
  const o1 = cross(sub(b, a), sub(c, a))
  const o2 = cross(sub(b, a), sub(d, a))
  const o3 = cross(sub(d, c), sub(a, c))
  const o4 = cross(sub(d, c), sub(b, c))
  return ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
}

function nearEdge(p: Vec2, rings: readonly Ring[]): boolean {
  const near = tolerance('joint')
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const ab = sub(b, a)
      const span = dot(ab, ab)
      const t = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
      if (far(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }) < near) return true
    }
  }
  return false
}

/** Whether a straight line from a to b keeps to the floor: it crosses no side and stays inside. */
function sees(a: Vec2, b: Vec2, polygon: Ring, holes: readonly Ring[]): boolean {
  const rings = [polygon, ...holes]
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      if (crossesProperly(a, b, ring[i]!, ring[(i + 1) % ring.length]!)) return false
    }
  }
  for (const t of [0.25, 0.5, 0.75]) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (!pointInPolygon(p, polygon, holes) && !nearEdge(p, rings)) return false
  }
  return true
}

/** The corners a shortest line can turn at: those that point into the floor (inside corners). */
function turningCorners(polygon: Ring, holes: readonly Ring[]): Vec2[] {
  const out: Vec2[] = []
  // The floor is on the left of every side, outline and holes alike (`survey.ts`): a corner
  // turning right reaches into the floor.
  for (const ring of [polygon, ...holes]) {
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i + ring.length - 1) % ring.length]!
      const at = ring[i]!
      const next = ring[(i + 1) % ring.length]!
      if (cross(sub(at, prev), sub(next, at)) < -tolerance('noLength')) out.push(at)
    }
  }
  return out
}

/** The length of the shortest line from a to b across a room's floor, or null when there is none. */
export function lengthAcross(room: Pick<SurveyRoom, 'polygon' | 'holes'>, from: Vec2, to: Vec2): number | null {
  const { polygon, holes } = room
  // ARE-18: a point a hair off the floor (a chord's sag along a curve) is walked from the
  // nearest point of the outline; the hair is not in the length.
  const rings = [polygon, ...holes]
  const onFloor = (p: Vec2): Vec2 => (pointInPolygon(p, polygon, holes) || nearEdge(p, rings) ? p : nearestOnOutline(p, rings))
  const a = onFloor(from)
  const b = onFloor(to)
  if (sees(a, b, polygon, holes)) return far(a, b)
  const nodes = [a, b, ...turningCorners(polygon, holes)]
  const best = nodes.map(() => Infinity)
  const done = nodes.map(() => false)
  best[0] = 0
  for (;;) {
    let at = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && best[i]! < Infinity && (at < 0 || best[i]! < best[at]!)) at = i
    if (at < 0) return null
    if (at === 1) return best[1]!
    done[at] = true
    for (let i = 0; i < nodes.length; i++) {
      if (done[i] || !sees(nodes[at]!, nodes[i]!, polygon, holes)) continue
      const through = best[at]! + far(nodes[at]!, nodes[i]!)
      if (through < best[i]!) best[i] = through
    }
  }
}

// ---------------------------------------------------------------------------------------------
// A route, walked

export interface WalkedLeg {
  /** The room walked across, or `outside` for the last step's hole when the route ends outside. */
  readonly room: string
  /** Across this room's floor, from where the route comes in to where it leaves. */
  readonly length: number
}

/**
 * ARE-30: where a route starts: the room's middle, its door, its farthest corner, or a point given.
 * ARE-81: a point given `as` the farthest point (`farthest.ts`) is said to be one.
 */
export type StartAt = 'middle' | 'door' | 'farthest corner' | { readonly x: number; readonly y: number; readonly as?: 'farthest point' }
/** ARE-30: where a route ends in its last room: the room's middle or the doorway into it. */
export type EndAt = 'middle' | 'door'
export interface RouteEnds {
  readonly start?: StartAt
  readonly end?: EndAt
  /** The rooms that are stairs or lifts: a route to one ends at its door unless `end` says otherwise. */
  readonly doorEnds?: ReadonlySet<string>
}
/** ARE-30: a route's two points, on the drawing, and which kind each is. */
export interface WalkPoint {
  readonly point: Vec2
  readonly at: 'middle' | 'door' | 'farthest corner' | 'farthest point' | 'given point' | 'outside face of the door'
}

export interface Walked {
  /** ARE-30: where the route starts and where it ends, in metres on the drawing. */
  readonly start: WalkPoint
  readonly end: WalkPoint
  /** In metres, the whole way. */
  readonly length: number
  /** Each room's share, the first and the last included; the holes through walls are in `through`. */
  readonly legs: readonly WalkedLeg[]
  /** Through the walls, face to face, all the doorways together. */
  readonly through: number
  /** ARE-18: along the stairs on the way, on plan, all of them together; 0 on one floor. */
  readonly onStairs: number
}

/**
 * ARE-18: a stair on the way, between two floors: where it is met in the room at each end (by
 * room id; null for the room's middle, a stair drawn as a room) and how long it is on plan.
 */
export interface StairPassage {
  readonly at: ReadonlyMap<string, Vec2 | null>
  readonly length: number
}

/** ARE-18: why a route's length is not given, and the room it stops at. */
export interface WalkGap {
  readonly room: string
  /** `no outline`: the room cannot be drawn; `doorway`: the doorway `via` is not found on its side; `no line`: no line keeps to its floor. */
  readonly reason: 'no outline' | 'doorway' | 'no line'
  readonly via?: string
}

export type WalkAnswer = { readonly walked: Walked; readonly gap: null } | { readonly walked: null; readonly gap: WalkGap }

/**
 * How far the route through `rooms` by the doorways `vias` is walked (`WALKED_RULE`). `toOutside`
 * when the last doorway leads out. A via in `stairs` is a stair between floors. When the length
 * cannot be measured, the room where it stops and why.
 */
export function walkRoute(survey: Survey, rooms: readonly string[], vias: readonly string[], toOutside: boolean, stairs: ReadonlyMap<string, StairPassage> = new Map(), ends: RouteEnds = {}): WalkAnswer {
  const legs: WalkedLeg[] = []
  let through = 0
  let onStairs = 0
  let enter: Vec2 | null = null
  let startPoint: WalkPoint | null = null
  let endPoint: WalkPoint | null = null
  const gap = (room: string, reason: WalkGap['reason'], via?: string): WalkAnswer => ({ walked: null, gap: { room, reason, ...(via === undefined ? {} : { via }) } })
  for (let i = 0; i < rooms.length; i++) {
    const room = survey.byId.get(rooms[i]!)
    if (room === undefined || room.polygon.length < 3) return gap(rooms[i]!, 'no outline')
    const middle = (r: SurveyRoom): Vec2 => poleOfInaccessibility(r.polygon, undefined, r.holes).point
    let start = enter ?? middle(room)
    const via = vias[i]
    const first = i === 0
    const last = i === rooms.length - 1
    if (first) startPoint = { point: start, at: 'middle' }
    let leave: Vec2
    if (via === undefined) {
      leave = middle(room)
    } else {
      const other = i + 1 < rooms.length ? (survey.byId.get(rooms[i + 1]!) ?? null) : null
      const stair = stairs.get(via)
      if (stair !== undefined) {
        if (other === null || other.polygon.length < 3) return gap(rooms[i + 1] ?? room.facts.id, 'no outline')
        leave = stair.at.get(room.facts.id) ?? middle(room)
        enter = stair.at.get(other.facts.id) ?? middle(other)
        onStairs += stair.length
      } else {
        const crossing = crossingOf(survey, room, via, other)
        if (crossing === null) return gap(room.facts.id, 'doorway', via)
        leave = crossing.near
        let next = crossing.far
        if (other !== null) {
          // The far side as the next room has it, when it finds the doorway there too.
          const theirs = crossingOf(survey, other, via, room)
          if (theirs !== null) next = theirs.near
        } else if (!toOutside) return gap(room.facts.id, 'doorway', via)
        through += far(leave, next)
        enter = next
      }
    }
    if (first) {
      const asked = ends.start ?? 'middle'
      if (typeof asked === 'object') {
        start = { x: asked.x, y: asked.y }
        startPoint = { point: start, at: asked.as ?? 'given point' }
      } else if (asked === 'door' && via !== undefined) {
        start = leave
        startPoint = { point: start, at: 'door' }
      } else if (asked === 'farthest corner') {
        let best: Vec2 | null = null
        let bestLength = -1
        for (const corner of [...room.polygon]) {
          const d = lengthAcross(room, corner, leave)
          if (d !== null && d > bestLength) [best, bestLength] = [corner, d]
        }
        if (best !== null) {
          start = best
          startPoint = { point: start, at: 'farthest corner' }
        }
      }
    }
    if (last && via === undefined) {
      const wantDoor = (ends.end ?? (ends.doorEnds?.has(room.facts.id) === true ? 'door' : 'middle')) === 'door'
      if (wantDoor && enter !== null && !first) {
        leave = enter
        endPoint = { point: leave, at: 'door' }
      } else endPoint = { point: leave, at: 'middle' }
    } else if (last && toOutside && enter !== null) {
      endPoint = { point: enter, at: 'outside face of the door' }
    }
    const across = lengthAcross(room, start, leave)
    if (across === null) return gap(room.facts.id, 'no line')
    legs.push({ room: room.facts.id, length: across })
  }
  return { walked: { start: startPoint!, end: endPoint!, length: legs.reduce((sum, leg) => sum + leg.length, 0) + through + onStairs, legs, through, onStairs }, gap: null }
}

/** `walkRoute`'s length alone: null when it cannot be measured. */
export function walkedLength(survey: Survey, rooms: readonly string[], vias: readonly string[], toOutside: boolean, stairs: ReadonlyMap<string, StairPassage> = new Map(), ends: RouteEnds = {}): Walked | null {
  return walkRoute(survey, rooms, vias, toOutside, stairs, ends).walked
}
