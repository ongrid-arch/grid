/**
 * Wall faults, each with the change that would fix it (MSG-12).
 *
 * A room's outline is made by crossing the endless lines of its walls, so where a wall ends
 * never changes it: a wall 1.5 m short of its corner, or one that runs a metre past it, leaves
 * the room closed and its area as before (lab entries MS-2, L-6). Nothing else compared one wall
 * with another either: a copy of a wall under a new id, or a dividing line on top of a solid
 * wall, passed in silence while the drawing and every export showed that stretch twice (MS-15,
 * W-10, AE-5); and a wall standing in a room that does not list it changed nothing (MS-17).
 *
 * This module looks for those slips, floor by floor, and names each one at the wall:
 *
 * - `short`: at a corner of a room, one of the two walls stops short of where their lines cross.
 * - `gap`: two walls a room lists one after the other, in a row, leave a gap between their ends.
 * - `overrun`: a wall runs on past the last corner a room makes on it, and its end meets no
 *   other wall. A wall longer than one room is normal (it may border several, and T-junctions
 *   are everywhere), so only a free end beyond every outline that uses the wall counts.
 * - `duplicate`: two walls, or two dividing lines, on one line lie on top of each other.
 * - `line-on-wall`: a dividing line lies on top of a solid wall.
 * - `listed-twice`: a room names one wall twice in its wall list.
 * - `crosses-room`: a wall runs across a room that does not list it, from one side to another.
 * - `stands-in-room`: walls stand inside a room that does not list them, and stop there: a stub,
 *   or a pod, a column or furniture drawn as walls. One per room, and no fix: what they are is
 *   for the person to say.
 *
 * Every distance is read against the tolerance table: a wall reaches another when its end lies
 * within half the thicker of the two plus `gap` of the other's line, as `gap` says.
 *
 * Each fault carries its fix as a list of plain edits (`WallEdit`), so that a caller can apply
 * them to the plan file as it stands, and `tidyPlan` applies the ones chosen. A fix is offered
 * only when it was tried on the plan and every room it touches still has an outline: where none
 * is safe the fault says what to do instead, and its `fix` is null.
 */

import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan, openingsOf, roomWallIds } from './plan'
import { floorOf, wallStandsOn } from './floors'
import type { RoomOutline } from './room'
import { roomNesting, roomOutline } from './room'
import { sitsWithin } from './nesting'
import { roomZones } from './zones'
import { tolerance } from './tolerances'
import { areaText, metresText } from './rounding'
import type { Said, Value } from '../messages/say'
import { english, joined, name, num, said } from '../messages/say'
import { pointSaid } from './issueWords'
import { factKey } from '../types/facts'
import { wallWithEnds } from '../types/floorplan'
import type { Vec2 } from './vec2'
import { area, cross, dot, sub } from './vec2'
import { wallAxis } from './wall'
import type { WallCurve } from './arc'
import { curveAlong, curveFault, curvePointAt, wallCurve } from './arc'
import { boxIndex } from './boxIndex'

export type WallFaultKind =
  | 'short'
  | 'gap'
  | 'overrun'
  | 'duplicate'
  | 'line-on-wall'
  | 'listed-twice'
  | 'crosses-room'
  | 'stands-in-room'

/** One change to the plan file. Coordinates are in metres, as the file holds them. */
export type WallEdit =
  /** Move one end of a wall. Openings keep their place: a fix that moves `start` resets their offsets. */
  | { readonly op: 'move-end'; readonly wall: string; readonly end: 'start' | 'end'; readonly to: [number, number] }
  /**
   * Take a wall out. CNT-9: with `factsTo`, the facts of the person's own it carries go onto that
   * wall first, where that wall carries none of the same name, so taking out a copy loses none.
   */
  | { readonly op: 'remove-wall'; readonly wall: string; readonly factsTo?: string }
  | { readonly op: 'set-boundary'; readonly room: string; readonly boundary: readonly string[] }
  | { readonly op: 'add-room'; readonly room: Room }
  /** Put an opening on a wall at an offset; `hinge` and `swing` are set when the wall runs the other way. */
  | {
      readonly op: 'move-opening'
      readonly opening: string
      readonly wall: string
      readonly offset: number
      readonly hinge?: 'start' | 'end'
      readonly swing?: 'left' | 'right'
    }
  | { readonly op: 'remove-opening'; readonly opening: string }

export interface WallFix {
  /** The fix in words, as the message ends: the English of `said`. */
  readonly says: string
  /** MSG-11: the fix by its key and values. */
  readonly said: Said
  readonly edits: readonly WallEdit[]
  /** WRT-36: the rooms the fix would leave with no way in; its sentence says so too. */
  readonly seals?: readonly string[]
}

export interface WallFault {
  /** Stable while the walls it is about keep their ids: `short:n:end`, `duplicate:copy`. */
  readonly id: string
  readonly kind: WallFaultKind
  readonly floor: string
  /** The walls it is about, the one the fix changes first. */
  readonly walls: readonly string[]
  /** The rooms it was found in. */
  readonly rooms: readonly string[]
  /** How far, in metres: the gap, the overrun, the length two walls share or a wall stands in a room. */
  readonly distance: number
  /** What is wrong, then the fix or what to do instead: the English of `said`. */
  readonly message: string
  /** MSG-11: the message by its key and values (`issue.wall/<kind>`). */
  readonly said: Said
  readonly fix: WallFix | null
}

export interface WallFaultOptions {
  readonly index?: PlanIndex
  /** Ids validation could not draw (`validatePlan`); they are left out. */
  readonly broken?: ReadonlySet<string>
}

// ── Small geometry ──────────────────────────────────────────────────────────────────────────

interface Seg {
  readonly wall: Wall
  readonly a: Vec2
  readonly b: Vec2
  readonly dir: Vec2
  readonly normal: Vec2
  readonly length: number
  /** 0 for a dividing line. */
  readonly t: number
  readonly box: { x0: number; y0: number; x1: number; y1: number }
}

const thickness = (wall: Wall): number => (wall.virtual === true ? 0 : wall.thickness)

/**
 * A curved wall as the faults see it (CNT-28): no fault is about it and no fix moves it, but a
 * straight wall that ends on it, at one of its ends or along it, meets a wall there, and the
 * corner a straight wall makes with it is a corner on that straight wall.
 */
interface Bend {
  readonly wall: Wall
  readonly curve: WallCurve
  readonly t: number
}

/** What a straight wall meets at a corner: another straight wall, or a curved one. */
type Met = Seg | Bend

const isBend = (w: Met): w is Bend => 'curve' in w

/** A sound curved wall, or null for a straight one or a curve `curveFault` finds wrong. */
function bendOf(wall: Wall): Bend | null {
  if (wall.arc === undefined || curveFault(wall) !== null) return null
  const curve = wallCurve(wall)
  return curve === null ? null : { wall, curve, t: thickness(wall) }
}

/** How far a point lies from a curved wall's curve, between its ends. */
function toCurve(p: Vec2, b: Bend): number {
  const q = curvePointAt(b.curve, curveAlong(b.curve, p))
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** How far a point lies from what a straight wall meets, along its axis or its curve. */
const toMet = (p: Vec2, w: Met): number => (isBend(w) ? toCurve(p, w) : toSegment(p, w))

/**
 * A straight wall as the faults measure it. A curved wall (CNT-18) is left out: its ends are on
 * its curve and moving one would move the curve, so no fault here is about it and no fix moves
 * it. The rooms round it are still traced (`Bend`), and a straight wall in them is still looked at.
 */
function segOf(wall: Wall): Seg | null {
  if (wall.arc !== undefined) return null
  let axis
  try {
    axis = wallAxis(wall)
  } catch {
    return null
  }
  const t = thickness(wall)
  const pad = t / 2 + tolerance('gap')
  return {
    wall,
    a: axis.start,
    b: axis.end,
    dir: axis.dir,
    normal: axis.normal,
    length: axis.length,
    t,
    box: {
      x0: Math.min(axis.start.x, axis.end.x) - pad,
      y0: Math.min(axis.start.y, axis.end.y) - pad,
      x1: Math.max(axis.start.x, axis.end.x) + pad,
      y1: Math.max(axis.start.y, axis.end.y) + pad
    }
  }
}

const along = (s: Seg, p: Vec2): number => dot(sub(p, s.a), s.dir)
const across = (s: Seg, p: Vec2): number => dot(sub(p, s.a), s.normal)
const at = (s: Seg, d: number): Vec2 => ({ x: s.a.x + s.dir.x * d, y: s.a.y + s.dir.y * d })

function toSegment(p: Vec2, s: Seg): number {
  const d = Math.max(0, Math.min(s.length, along(s, p)))
  const q = at(s, d)
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** Pairs of segments whose boxes overlap: a sweep along x, so a large floor is not n². */
function nearPairs(segs: readonly Seg[]): [Seg, Seg][] {
  const sorted = [...segs].sort((p, q) => p.box.x0 - q.box.x0)
  const pairs: [Seg, Seg][] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!
    for (let j = i + 1; j < sorted.length && sorted[j]!.box.x0 <= p.box.x1; j++) {
      const q = sorted[j]!
      if (q.box.y0 <= p.box.y1 && p.box.y0 <= q.box.y1) pairs.push([p, q])
    }
  }
  return pairs
}

/** To the micrometre, so a fix writes 4, not 3.9999999999999996. */
const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6
  return Object.is(r, -0) ? 0 : r
}
const pair = (p: Vec2): [number, number] => [tidy(p.x), tidy(p.y)]

/** A length to the millimetre, with at least two decimals: 1.50, 0.025. */
export function wallMetres(value: number): string {
  const fixed = metresText(value, 3)
  return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed
}
/** A length to the millimetre, as a figure: the sentence writes the unit. */
const m = (value: number): Value => num(wallMetres(value))
const point = (p: Vec2): Said => pointSaid(wallMetres(p.x), wallMetres(p.y))

/** `a, b and c`. */
const list = (values: readonly Value[]): Value => joined(values, 'join.comma', 'join.and')

/** A wall's end, as a sentence names it. */
const endSaid = (end: 'start' | 'end'): Said => said(`issue.part.end.${end}`)

function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

/** The stretches of a segment inside a polygon, as distances along it. */
function insideStretches(s: Seg, polygon: readonly Vec2[]): [number, number][] {
  const cuts = [0, s.length]
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const e = sub(q, p)
    const denom = cross(s.dir, e)
    if (Math.abs(denom) < tolerance('parallel')) continue
    const w = sub(p, s.a)
    const d = cross(w, e) / denom
    const u = cross(w, s.dir) / denom
    if (u >= 0 && u <= 1 && d > 0 && d < s.length) cuts.push(d)
  }
  cuts.sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [d0, d1] = [cuts[i]!, cuts[i + 1]!]
    if (d1 - d0 < tolerance('noLength')) continue
    if (!pointInPolygon(at(s, (d0 + d1) / 2), polygon)) continue
    const last = out.at(-1)
    if (last && Math.abs(last[1] - d0) < tolerance('noLength')) last[1] = d1
    else out.push([d0, d1])
  }
  return out
}

// ── Edits ───────────────────────────────────────────────────────────────────────────────────

/** The parts of a plan the edits touch. Any other key, on the plan or on its parts, is kept. */
export interface EditablePlan {
  readonly walls: readonly { readonly id: string; readonly start: readonly number[]; readonly end: readonly number[] }[]
  readonly rooms: readonly { readonly id: string; readonly boundary: readonly string[] }[]
  readonly openings: readonly { readonly id: string; readonly wall: string; readonly offset: number }[]
}

/**
 * The plan with the edits made, in order. Nothing else changes: every other key of the plan, of
 * its walls, rooms and openings is kept as it was, so this also works on a plan file as read.
 */
export function applyWallEdits<P extends EditablePlan>(plan: P, edits: readonly WallEdit[]): P {
  let walls = [...plan.walls] as Record<string, unknown>[]
  let rooms = [...plan.rooms] as Record<string, unknown>[]
  let openings = [...plan.openings] as Record<string, unknown>[]
  for (const edit of edits) {
    switch (edit.op) {
      case 'move-end':
        // HND-11: the point is on the centre line; a wall its file places by its face keeps it.
        walls = walls.map((w) => (w.id === edit.wall ? wallWithEnds(w, { [edit.end]: edit.to }) : w))
        break
      case 'remove-wall': {
        const gone = walls.find((w) => w.id === edit.wall)
        const facts = gone?.['properties']
        if (edit.factsTo !== undefined && typeof facts === 'object' && facts !== null) {
          walls = walls.map((w) => {
            if (w.id !== edit.factsTo) return w
            const own = (typeof w['properties'] === 'object' && w['properties'] !== null ? w['properties'] : {}) as Record<string, unknown>
            const keys = new Set(Object.keys(own).map(factKey))
            const added = Object.entries(facts as Record<string, unknown>).filter(([name]) => !keys.has(factKey(name)))
            return added.length === 0 ? w : { ...w, properties: { ...own, ...Object.fromEntries(added) } }
          })
        }
        walls = walls.filter((w) => w.id !== edit.wall)
        break
      }
      case 'set-boundary':
        rooms = rooms.map((r) => (r.id === edit.room ? { ...r, boundary: [...edit.boundary] } : r))
        break
      case 'add-room':
        rooms = [...rooms, { ...edit.room, boundary: [...edit.room.boundary] }]
        break
      case 'move-opening':
        openings = openings.map((o) => {
          if (o.id !== edit.opening) return o
          const moved: Record<string, unknown> = { ...o, wall: edit.wall, offset: edit.offset }
          if (edit.hinge !== undefined) moved.hinge = edit.hinge
          if (edit.swing !== undefined) moved.swing = edit.swing
          return moved
        })
        break
      case 'remove-opening':
        openings = openings.filter((o) => o.id !== edit.opening)
        break
    }
  }
  return { ...plan, walls, rooms, openings }
}

// ── The search ──────────────────────────────────────────────────────────────────────────────

interface Traced {
  readonly room: Room
  readonly outline: RoomOutline
}

interface Context {
  readonly plan: FloorPlan
  readonly index: PlanIndex
  readonly floor: string
  readonly segs: ReadonlyMap<string, Seg>
  /** The floor's sound curved walls (CNT-28), which the straight ones may end on. */
  readonly bends: ReadonlyMap<string, Bend>
  /** Rooms on the floor whose outline was traced, with or without a fault. */
  readonly traced: readonly Traced[]
}

/**
 * Moves one end of a wall to a point on its own line, and keeps its openings where they stand.
 * Null when an opening would no longer fit on the wall.
 */
function moveEnd(ctx: Context, s: Seg, end: 'start' | 'end', to: Vec2): WallEdit[] | null {
  const d = along(s, to)
  const length = end === 'end' ? d : s.length - d
  if (length < tolerance('gap')) return null
  const shift = end === 'start' ? -d : 0
  const edits: WallEdit[] = [{ op: 'move-end', wall: s.wall.id, end, to: pair(to) }]
  const overrun = tolerance('openingOverrun')
  for (const o of openingsOf(ctx.index, s.wall.id)) {
    const offset = o.offset + shift
    if (offset < -overrun || offset + o.width > length + overrun) return null
    if (shift !== 0) edits.push({ op: 'move-opening', opening: o.id, wall: s.wall.id, offset: tidy(Math.max(0, offset)) })
  }
  return edits
}

/**
 * Whether every room the edits touch still has an outline with no fault, as it had before. A
 * room that had none before is not held to it.
 */
function fixHolds(ctx: Context, edits: readonly WallEdit[]): boolean {
  const after = applyWallEdits(ctx.plan, edits)
  const index = indexPlan(after)
  const walls = new Set<string>()
  const rooms = new Set<string>()
  for (const e of edits) {
    if (e.op === 'move-end' || e.op === 'remove-wall') walls.add(e.wall)
    if (e.op === 'set-boundary') rooms.add(e.room)
    if (e.op === 'add-room') rooms.add(e.room.id)
  }
  // A room is held to its holes' walls too (ARE-6): a fix that moves one must leave it sound.
  for (const { room } of ctx.traced) if (roomWallIds(room).some((id) => walls.has(id))) rooms.add(room.id)
  const before = new Map(ctx.traced.map((t) => [t.room.id, t.outline.fault === null]))
  for (const room of after.rooms) {
    if (!rooms.has(room.id)) continue
    if (before.get(room.id) === false) continue
    try {
      const outline = roomOutline(room, index)
      if (outline.fault !== null || area(outline.polygon) < tolerance('areaEqual')) return false
    } catch {
      return false
    }
  }
  return true
}

function fixOf(ctx: Context, sentence: Said | null, edits: readonly WallEdit[] | null): WallFix | null {
  if (sentence === null || edits === null || !fixHolds(ctx, edits)) return null
  return { says: english(sentence), said: sentence, edits }
}

const NO_FIX = said('issue.wall/fault.noFix')

/** The message, what is wrong and then the fix or what to do instead, with its English. */
function say(what: Said, fix: Said | null, otherwise: Said = NO_FIX): { message: string; said: Said } {
  const sentence = said('issue.part.both', { first: what, then: fix !== null ? said('issue.wall/fault.fix', { fix }) : otherwise })
  return { message: english(sentence), said: sentence }
}

/** The end of a segment nearest a point. */
const nearestEnd = (s: Seg, p: Vec2): 'start' | 'end' =>
  Math.hypot(p.x - s.a.x, p.y - s.a.y) <= Math.hypot(p.x - s.b.x, p.y - s.b.y) ? 'start' : 'end'
const endPoint = (s: Seg, end: 'start' | 'end'): Vec2 => (end === 'start' ? s.a : s.b)

/** How far a wall end may lie from the other wall's line and still reach it (`gap`). */
const reach = (a: Seg, b: Met): number => Math.max(a.t, b.t) / 2 + tolerance('gap')

/**
 * Corners and rows of each room's own wall list: `short` and `gap`. A corner whose lines cross
 * far from both walls is a wall list out of order, which the outline already refuses, and is
 * left to that refusal.
 */
function cornerFaults(ctx: Context, out: Map<string, WallFault>): void {
  for (const { room, outline } of ctx.traced) {
    if (outline.fault?.code === 'room/out-of-order') continue
    const corners = new Set(outline.corners.map((c) => `${c.wallA}|${c.wallB}`))
    const runs = straightSides(room.boundary, corners)
    for (const c of outline.corners) {
      const a = ctx.segs.get(c.wallA)
      const b = ctx.segs.get(c.wallB)
      if (!a || !b || a === b) continue
      const stray = Math.max(tolerance('strayCorner'), Math.max(a.t, b.t) + tolerance('wallContact'))
      if (Math.min(c.offA, c.offB) > stray) continue
      const sine = Math.abs(cross(a.dir, b.dir))
      // A straight side drawn in pieces reaches the corner with the piece nearest it, whatever the
      // order its pieces are listed in.
      const nearest = (id: string, fallback: Seg): [Seg, number] =>
        (runs.get(id) ?? [id]).reduce<[Seg, number]>(
          (best, piece) => {
            const seg = ctx.segs.get(piece)
            if (!seg) return best
            const off = toSegment(c.at, seg)
            return off < best[1] ? [seg, off] : best
          },
          [fallback, toSegment(c.at, fallback)]
        )
      const [na, offA] = nearest(c.wallA, a)
      const [nb, offB] = nearest(c.wallB, b)
      for (const [s, other, off] of [[na, nb, offA], [nb, na, offB]] as const) {
        if (off * sine <= reach(s, other)) continue
        const end = nearestEnd(s, c.at)
        const id = `short:${s.wall.id}:${end}`
        const known = out.get(id)
        if (known) {
          if (!known.rooms.includes(room.id)) out.set(id, { ...known, rooms: [...known.rooms, room.id] })
          continue
        }
        const edits = moveEnd(ctx, s, end, c.at)
        const fix = fixOf(ctx, said('issue.wall/fault.moveEnd', { end: endSaid(end), wall: name(s.wall.id), at: point(c.at) }), edits)
        out.set(id, {
          id,
          kind: 'short',
          floor: ctx.floor,
          walls: [s.wall.id, other.wall.id],
          rooms: [room.id],
          distance: off,
          ...say(
            said('issue.wall/short', {
              wall: name(s.wall.id),
              gap: m(off),
              other: name(other.wall.id),
              room: name(room.id),
              end: endSaid(end),
              at: point(endPoint(s, end)),
              corner: point(c.at)
            }),
            fix?.said ?? null
          ),
          fix
        })
      }
    }
    // The pieces of one straight side must cover it with no gap, in whatever order they are listed.
    for (const side of new Set(runs.values())) {
      const pieces = [...new Set(side)].flatMap((id) => {
        const seg = ctx.segs.get(id)
        return seg ? [seg] : []
      })
      if (pieces.length < 2) continue
      const ref = pieces[0]!
      const spans = pieces
        .map((seg) => {
          const [p, q] = [along(ref, seg.a), along(ref, seg.b)]
          return { seg, from: Math.min(p, q), to: Math.max(p, q) }
        })
        .sort((x, y) => x.from - y.from)
      let reached = spans[0]!
      for (const next of spans.slice(1)) {
        const apart = next.from - reached.to
        if (apart > tolerance('gap')) {
          const a = reached.seg
          const ia = a.wall.id
          const ib = next.seg.wall.id
          // The end of the piece before the gap that faces it, moved onto its own line opposite the next piece's end.
          const facing = at(ref, reached.to)
          const end = nearestEnd(a, facing)
          const target = at(a, along(a, at(ref, next.from)))
          const id = `gap:${ia}:${ib}`
          if (!out.has(id)) {
            const fix = fixOf(ctx, said('issue.wall/fault.moveEnd', { end: endSaid(end), wall: name(ia), at: point(target) }), moveEnd(ctx, a, end, target))
            out.set(id, {
              id,
              kind: 'gap',
              floor: ctx.floor,
              walls: [ia, ib],
              rooms: [room.id],
              distance: apart,
              ...say(
                said('issue.wall/gap', { a: name(ia), b: name(ib), room: name(room.id), gap: m(apart), at: point(endPoint(a, end)), target: point(target) }),
                fix?.said ?? null
              ),
              fix
            })
          }
        }
        if (next.to > reached.to) reached = next
      }
    }
  }
}

/** For each wall of a room's list, the walls of the straight side it is part of (neighbours that make no corner). */
function straightSides(ids: readonly string[], corners: ReadonlySet<string>): Map<string, string[]> {
  const sides = new Map<string, string[]>()
  const n = ids.length
  // Start just after a corner, so that a side wrapping round the end of the list is one side.
  const start = ids.findIndex((id, i) => corners.has(`${id}|${ids[(i + 1) % n]!}`))
  if (start < 0) return sides
  let side: string[] = []
  for (let k = 1; k <= n; k++) {
    const id = ids[(start + k) % n]!
    side.push(id)
    if (corners.has(`${id}|${ids[(start + k + 1) % n]!}`)) {
      for (const piece of side) sides.set(piece, side)
      side = []
    }
  }
  return sides
}

/** Whether a wall end lies on another wall's body, straight or curved (CNT-28), to within `gap`. */
function touchesAnother(s: Seg, p: Vec2, near: readonly Met[]): boolean {
  return near.some((o) => o !== s && toMet(p, o) <= o.t / 2 + tolerance('gap'))
}

/** Free ends of listed walls beyond the last corner any room makes on them: `overrun`. */
function overrunFaults(ctx: Context, out: Map<string, WallFault>): void {
  // The corners each wall has in rooms whose outline is sound, with the wall it meets there.
  // CNT-28: a corner with a curved wall is a corner on the straight wall that makes it.
  const cornersOn = new Map<string, { d: number; at: Vec2; other: Met; room: string }[]>()
  const met = (id: string): Met | undefined => ctx.segs.get(id) ?? ctx.bends.get(id)
  for (const { room, outline } of ctx.traced) {
    if (outline.fault !== null) continue
    for (const c of outline.corners) {
      for (const [id, otherId] of [[c.wallA, c.wallB], [c.wallB, c.wallA]] as const) {
        const s = ctx.segs.get(id)
        const other = met(otherId)
        if (!s || !other) continue
        const entry = { d: along(s, c.at), at: c.at, other, room: room.id }
        const known = cornersOn.get(id)
        if (known) known.push(entry)
        else cornersOn.set(id, [entry])
      }
    }
    // Two walls in a row reach as far as their facing ends: a joint, not a corner.
    const corners = new Set(outline.corners.map((c) => `${c.wallA}|${c.wallB}`))
    const ids = room.boundary
    for (let i = 0; i < ids.length; i++) {
      const [ia, ib] = [ids[i]!, ids[(i + 1) % ids.length]!]
      if (ia === ib || corners.has(`${ia}|${ib}`)) continue
      const a = met(ia)
      const b = met(ib)
      if (!a || !b) continue
      for (const [s, other] of [[a, b], [b, a]] as const) {
        if (isBend(s)) continue
        const end = toMet(s.a, other) <= toMet(s.b, other) ? s.a : s.b
        const entry = { d: along(s, end), at: end, other, room: room.id }
        const known = cornersOn.get(s.wall.id)
        if (known) known.push(entry)
        else cornersOn.set(s.wall.id, [entry])
      }
    }
  }
  const segs = [...ctx.segs.values()]
  const nearby = new Map<Seg, Met[]>()
  for (const [p, q] of nearPairs(segs)) {
    for (const [x, y] of [[p, q], [q, p]] as const) {
      const known = nearby.get(x)
      if (known) known.push(y)
      else nearby.set(x, [y])
    }
  }
  // A free end on a curved wall meets it too (CNT-28). A floor has few curved walls.
  const bends = [...ctx.bends.values()]
  for (const s of segs) {
    const corners = cornersOn.get(s.wall.id)
    if (!corners || corners.length === 0) continue
    for (const end of ['start', 'end'] as const) {
      const d = end === 'end' ? s.length : 0
      const last = corners.reduce((best, c) => ((end === 'end' ? c.d > best.d : c.d < best.d) ? c : best))
      const past = end === 'end' ? d - last.d : last.d - d
      if (past <= reach(s, last.other)) continue
      const p = endPoint(s, end)
      if (touchesAnother(s, p, [...(nearby.get(s) ?? []), ...bends])) continue
      const id = `overrun:${s.wall.id}:${end}`
      const edits = moveEnd(ctx, s, end, last.at)
      const fix = fixOf(ctx, said('issue.wall/overrun.fix', { end: endSaid(end), wall: name(s.wall.id), at: point(last.at) }), edits)
      // When the other wall ends at the corner, the slip may be its: it may be meant to reach this
      // end. Not a curved wall's (CNT-28): moving its end would move its curve.
      const theirs = isBend(last.other) ? null : theirsSaid(last.other, last.at, p)
      const otherwise =
        edits === null && openingsOf(ctx.index, s.wall.id).length > 0 ? said('issue.wall/overrun.opening') : NO_FIX
      out.set(id, {
        id,
        kind: 'overrun',
        floor: ctx.floor,
        walls: [s.wall.id, last.other.wall.id],
        rooms: [last.room],
        distance: past,
        ...say(
          said('issue.wall/overrun', { wall: name(s.wall.id), past: m(past), other: name(last.other.wall.id), room: name(last.room), at: point(last.at), to: point(p) }),
          fix === null ? null : theirs === null ? fix.said : said('issue.part.both', { first: fix.said, then: theirs }),
          otherwise
        ),
        fix
      })
    }
  }
}

/** That the other wall, ending at the corner, may be the one meant to reach `p`; or null. */
function theirsSaid(other: Seg, corner: Vec2, p: Vec2): Said | null {
  const otherEnd = nearestEnd(other, corner)
  const otherAt = endPoint(other, otherEnd)
  return Math.hypot(otherAt.x - corner.x, otherAt.y - corner.y) <= tolerance('gap')
    ? said('issue.wall/overrun.theirs', { other: name(other.wall.id), at: point(p), end: endSaid(otherEnd) })
    : null
}

/** The rooms that list a wall, on this floor. */
const listing = (ctx: Context, wallId: string): Room[] =>
  (ctx.index.roomsByWall.get(wallId) ?? []).filter((r) => floorOf(r) === ctx.floor)

/** Wall lists with `gone` replaced by `kept`, and a `kept` that would then follow itself dropped. */
function relist(ctx: Context, gone: string, kept: string): WallEdit[] {
  return listing(ctx, gone).map((room) => {
    const swapped = room.boundary.map((id) => (id === gone ? kept : id))
    const boundary = swapped.filter((id, i) => id !== swapped[(i + swapped.length - 1) % swapped.length] || swapped.length === 1)
    return { op: 'set-boundary', room: room.id, boundary }
  })
}

/** The openings of a removed wall, moved onto the wall kept in its place; a door already there is not doubled. */
function moveOpenings(ctx: Context, from: Seg, to: Seg): WallEdit[] {
  const edits: WallEdit[] = []
  const reversed = dot(from.dir, to.dir) < 0
  const there = openingsOf(ctx.index, to.wall.id)
  for (const o of openingsOf(ctx.index, from.wall.id)) {
    const p = along(to, at(from, o.offset))
    const q = along(to, at(from, o.offset + o.width))
    const offset = Math.min(p, q)
    const doubled = there.some(
      (k) => k.type === o.type && Math.abs(k.offset - offset) < tolerance('diffOpeningOffset') && Math.abs(k.width - o.width) < tolerance('diffOpeningOffset')
    )
    if (doubled) {
      edits.push({ op: 'remove-opening', opening: o.id })
      continue
    }
    const flipped: { hinge?: 'start' | 'end'; swing?: 'left' | 'right' } = {}
    if (reversed && o.hinge !== undefined) flipped.hinge = o.hinge === 'start' ? 'end' : 'start'
    if (reversed && o.swing !== undefined) flipped.swing = o.swing === 'left' ? 'right' : 'left'
    edits.push({ op: 'move-opening', opening: o.id, wall: to.wall.id, offset: tidy(Math.max(0, offset)), ...flipped })
  }
  return edits
}

/**
 * The stretch of `b` that lies on `a`: bodies overlapping by more than `gap` across their
 * width, within `a`'s length, as fractions of `b`. Null when they share no such stretch.
 */
function sharedStretch(a: Seg, b: Seg): [number, number] | null {
  const limit = Math.max((a.t + b.t) / 2 - tolerance('gap'), tolerance('wallContact'))
  const [s0, s1] = [along(a, b.a), along(a, b.b)]
  const [d0, d1] = [across(a, b.a), across(a, b.b)]
  let lo = 0
  let hi = 1
  // Each bound is linear in u: v0 + u (v1 - v0) within [min, max].
  const keep = (v0: number, v1: number, min: number, max: number): void => {
    const dv = v1 - v0
    if (Math.abs(dv) < tolerance('noLength')) {
      if (v0 < min || v0 > max) hi = -1
      return
    }
    const [u0, u1] = [(min - v0) / dv, (max - v0) / dv]
    lo = Math.max(lo, Math.min(u0, u1))
    hi = Math.min(hi, Math.max(u0, u1))
  }
  keep(s0, s1, 0, a.length)
  keep(d0, d1, -limit, limit)
  return hi > lo ? [lo, hi] : null
}

/** Walls on top of walls: `duplicate` and `line-on-wall`. */
function overlapFaults(ctx: Context, out: Map<string, WallFault>): void {
  const order = new Map(ctx.plan.walls.map((w, i) => [w.id, i]))
  // Two walls of a room narrower than they are thick overlap; that room's refusal says so.
  const squeezed = ctx.traced.filter((t) => t.outline.fault?.code === 'room/inside-out').map((t) => new Set(roomWallIds(t.room)))
  for (const [p, q] of nearPairs([...ctx.segs.values()])) {
    if (Math.abs(cross(p.dir, q.dir)) >= tolerance('nearlyParallel')) continue
    if (squeezed.some((walls) => walls.has(p.wall.id) && walls.has(q.wall.id))) continue
    // The one the fix changes: the line when one is a line, else the copy (the later one), or
    // the one lying wholly on the other.
    let [kept, gone] = (order.get(p.wall.id) ?? 0) <= (order.get(q.wall.id) ?? 0) ? [p, q] : [q, p]
    const line = (s: Seg): boolean => s.wall.virtual === true
    if (line(kept) !== line(gone) && line(kept)) [kept, gone] = [gone, kept]
    let shared = sharedStretch(kept, gone)
    if (shared === null) continue
    let length = (shared[1] - shared[0]) * gone.length
    if (length <= Math.max(kept.t, gone.t, tolerance('lineInside')) + tolerance('gap')) continue
    const whole = (stretch: [number, number], s: Seg): boolean => (stretch[1] - stretch[0]) * s.length >= s.length - tolerance('gap')
    if (line(kept) === line(gone) && !whole(shared, gone)) {
      const back = sharedStretch(gone, kept)
      if (back !== null && whole(back, kept)) {
        ;[kept, gone] = [gone, kept]
        shared = back
        length = (back[1] - back[0]) * gone.length
      }
    }
    const kind: WallFaultKind = line(gone) && !line(kept) ? 'line-on-wall' : 'duplicate'
    const id = `${kind}:${gone.wall.id}`
    if (out.has(id)) continue
    // A wall or a dividing line, as a sentence names it: in a sentence, at its start, or after "of".
    const named = (s: Seg, form: 'named' | 'Named' | 'ofNamed'): Said => said(`issue.part.${form}.${line(s) ? 'line' : 'wall'}`, { id: name(s.wall.id) })
    const keptName = named(kept, 'named')
    let edits: WallEdit[] | null
    let says: Said | null
    if (whole(shared, gone)) {
      const rooms = listing(ctx, gone.wall.id).map((r) => r.id)
      const hasOpenings = openingsOf(ctx.index, gone.wall.id).length > 0
      // CNT-9: a copy's facts of the person's own go onto the wall kept.
      const facts = gone.wall.properties !== undefined && Object.keys(gone.wall.properties).length > 0 ? { factsTo: kept.wall.id } : {}
      const givesFacts = 'factsTo' in facts
      edits = kind === 'line-on-wall' && hasOpenings ? null : [...relist(ctx, gone.wall.id, kept.wall.id), ...moveOpenings(ctx, gone, kept), { op: 'remove-wall', wall: gone.wall.id, ...facts }]
      const relisted =
        rooms.length === 0 ? '' : said(rooms.length > 1 ? 'issue.wall/duplicate.relist.many' : 'issue.wall/duplicate.relist.one', { kept: keptName, rooms: list(rooms.map(name)) })
      const then = hasOpenings
        ? givesFacts
          ? said('issue.wall/duplicate.movingFacts', { kept: keptName })
          : said('issue.wall/duplicate.moving')
        : givesFacts
          ? said('issue.wall/duplicate.facts', { kept: keptName })
          : '.'
      says = said('issue.wall/duplicate.remove', { gone: named(gone, 'named'), relisted, then })
    } else if (shared[0] <= tolerance('noLength') || shared[1] >= 1 - tolerance('noLength')) {
      // The shared stretch is at one end of the wall: take that end back to where the other ends.
      const end: 'start' | 'end' = shared[0] <= tolerance('noLength') ? 'start' : 'end'
      const u = end === 'start' ? shared[1] : shared[0]
      const target = { x: gone.a.x + (gone.b.x - gone.a.x) * u, y: gone.a.y + (gone.b.y - gone.a.y) * u }
      edits = moveEnd(ctx, gone, end, target)
      says = said('issue.wall/duplicate.moveEnd', { end: endSaid(end), gone: named(gone, 'ofNamed'), at: point(target), kept: keptName })
    } else {
      edits = null
      says = null
    }
    const fix = fixOf(ctx, says, edits)
    const what =
      kind === 'line-on-wall'
        ? said('issue.wall/line-on-wall', { line: name(gone.wall.id), wall: name(kept.wall.id), length: m(length) })
        : said('issue.wall/duplicate', { gone: named(gone, 'Named'), kept: named(kept, 'ofNamed'), length: m(length) })
    const otherwise =
      edits === null && kind === 'line-on-wall' && whole(shared, gone)
        ? said('issue.wall/line-on-wall.opening', { wall: name(kept.wall.id) })
        : edits === null
          ? said('issue.wall/duplicate.past', { kept: keptName })
          : NO_FIX
    out.set(id, {
      id,
      kind,
      floor: ctx.floor,
      walls: [gone.wall.id, kept.wall.id],
      rooms: listing(ctx, gone.wall.id).map((r) => r.id),
      distance: length,
      ...say(what, fix?.said ?? null, otherwise),
      fix
    })
  }
}

/** A room that names one wall twice: `listed-twice`. */
function listedTwiceFaults(ctx: Context, out: Map<string, WallFault>): void {
  for (const room of ctx.plan.rooms) {
    if (floorOf(room) !== ctx.floor) continue
    const places = new Map<string, number[]>()
    room.boundary.forEach((id, i) => places.set(id, [...(places.get(id) ?? []), i + 1]))
    for (const [wallId, at] of places) {
      if (at.length < 2) continue
      const id = `listed-twice:${room.id}:${wallId}`
      let seen = false
      const boundary = room.boundary.filter((w) => {
        if (w !== wallId) return true
        if (seen) return false
        seen = true
        return true
      })
      const fix = fixOf(ctx, said('issue.room/wall-listed-twice.fix', { place: at[0]! }), [{ op: 'set-boundary', room: room.id, boundary }])
      out.set(id, {
        id,
        kind: 'listed-twice',
        floor: ctx.floor,
        walls: [wallId],
        rooms: [room.id],
        distance: 0,
        ...say(
          said(at.length === 2 ? 'issue.room/wall-listed-twice' : 'issue.room/wall-listed-twice.many', { room: name(room.id), wall: name(wallId), n: at.length, places: list(at) }),
          fix?.said ?? null,
          said('issue.room/wall-listed-twice.noFix')
        ),
        fix
      })
    }
  }
}

/** A fresh room id: `bed-2`, or the next number free. */
function freshId(plan: FloorPlan, base: string): string {
  const taken = new Set([...plan.walls, ...plan.rooms, ...plan.openings].map((e) => e.id))
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/**
 * The room split in two along a wall that crosses it: each part is the run of its wall list
 * from one wall the crossing wall meets to the other, closed by the crossing wall. Null when no
 * such split gives two outlines.
 */
interface Split {
  readonly edits: WallEdit[]
  readonly areas: [number, number]
  readonly ids: [string, string]
  /** WRT-36: the two parts' wall lists, the larger first, each with its outline. */
  readonly parts: readonly [{ readonly boundary: readonly string[]; readonly polygon: readonly Vec2[] }, { readonly boundary: readonly string[]; readonly polygon: readonly Vec2[] }]
}

function splitAlong(ctx: Context, room: Room, s: Seg, stretch: [number, number]): Split | null {
  const ids = room.boundary
  const meets = (p: Vec2): number[] =>
    ids
      .map((id, i) => ({ i, seg: ctx.segs.get(id) }))
      .filter((e) => e.seg !== undefined && toSegment(p, e.seg) <= (e.seg.t + s.t) / 2 + tolerance('gap'))
      .sort((x, y) => toSegment(p, x.seg!) - toSegment(p, y.seg!))
      .map((e) => e.i)
  const from = meets(at(s, stretch[0]))
  const to = meets(at(s, stretch[1]))
  const run = (i: number, j: number): string[] => {
    const out: string[] = []
    for (let k = i; ; k = (k + 1) % ids.length) {
      out.push(ids[k]!)
      if (k === j) return out
    }
  }
  const other = freshId(ctx.plan, room.id)
  for (const i of from) {
    for (const j of to) {
      if (i === j) continue
      const one = [...run(i, j), s.wall.id]
      const two = [...run(j, i), s.wall.id]
      if (one.length < 3 || two.length < 3) continue
      const plan = applyWallEdits(ctx.plan, [{ op: 'set-boundary', room: room.id, boundary: one }])
      const index = indexPlan(plan)
      try {
        const a = roomOutline({ ...room, boundary: one }, index)
        const b = roomOutline({ ...room, boundary: two }, index)
        if (a.fault !== null || b.fault !== null) continue
        const [areaA, areaB] = [area(a.polygon), area(b.polygon)]
        if (areaA < tolerance('areaReported') || areaB < tolerance('areaReported')) continue
        // Each part's list starts where the room's own list starts, as far as it can.
        const first = (part: string[]): string[] => {
          const k = part.reduce((best, id, n) => (ids.indexOf(id) >= 0 && (best < 0 || ids.indexOf(id) < ids.indexOf(part[best]!)) ? n : best), -1)
          return k <= 0 ? part : [...part.slice(k), ...part.slice(0, k)]
        }
        const [big, small] = (areaA >= areaB ? [one, two] : [two, one]).map(first) as [string[], string[]]
        const [bigPolygon, smallPolygon] = areaA >= areaB ? [a.polygon, b.polygon] : [b.polygon, a.polygon]
        // The new part says nothing about its use, nor that it sits inside another room: that is for the person to say.
        const part: Room = { id: other, name: `${room.name} (part)`, boundary: small }
        if (room.floor !== undefined) part.floor = room.floor
        // CNT-9: the part keeps the room's facts of the person's own; its number stays with the room.
        if (room.properties !== undefined && Object.keys(room.properties).length > 0) part.properties = { ...room.properties }
        return {
          edits: [
            { op: 'set-boundary', room: room.id, boundary: big },
            { op: 'add-room', room: part }
          ],
          areas: [Math.max(areaA, areaB), Math.min(areaA, areaB)],
          ids: [room.id, other],
          parts: [
            { boundary: big, polygon: bigPolygon },
            { boundary: small, polygon: smallPolygon }
          ]
        }
      } catch {
        continue
      }
    }
  }
  return null
}

/** The middle of a polygon's corners: enough to tell which side of a line a part lies on. */
const middleOf = (polygon: readonly Vec2[]): Vec2 => ({
  x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
  y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
})

interface CornerCut {
  readonly edits: WallEdit[]
  /** The walls the cut meets, which now end on it. */
  readonly met: readonly string[]
  /** The walls wholly beyond it, taken out. */
  readonly gone: readonly string[]
  /** The openings moved onto it from the corner, in their order along it. */
  readonly moved: readonly string[]
}

/**
 * WRT-36: a solid wall across a corner of a room, at an angle to the walls it meets, with the
 * room's own outside walls round the corner it cuts off (a chamfered corner, a corner entrance),
 * is the room's new face: the corner beyond it is outside. The walls it meets end on it, a wall
 * wholly beyond it is taken out, an opening on the corner moves onto it, and the room lists it in
 * place of the corner. Null when it is no such wall, or the corner's openings cannot be kept.
 */
function cornerCut(ctx: Context, room: Room, s: Seg, split: Split): CornerCut | null {
  if (s.wall.virtual === true) return null
  const [big, small] = split.parts
  const corner = small.boundary.filter((id) => id !== s.wall.id)
  const met = corner.filter((id) => big.boundary.includes(id))
  const gone = corner.filter((id) => !big.boundary.includes(id))
  if (met.length !== 2 || new Set(room.boundary).size !== room.boundary.length) return null
  const segs: Seg[] = []
  for (const id of corner) {
    const seg = ctx.segs.get(id)
    // Round the corner, only the room's own solid walls: the outside.
    if (!seg || seg.wall.virtual === true || listing(ctx, id).some((r) => r.id !== room.id)) return null
    segs.push(seg)
  }
  const square = tolerance('squareCorner')
  const side = Math.sign(across(s, middleOf(small.polygon)))
  if (side === 0) return null
  const edits: WallEdit[] = []
  // Each opening on the corner, with the wall it stood on and its middle there.
  const toMove: { o: { id: string; width: number; hinge?: 'start' | 'end'; swing?: 'left' | 'right' }; from: Seg; at: Vec2 }[] = []
  for (const m of segs.filter((seg) => met.includes(seg.wall.id))) {
    // At an angle to the wall it meets: a wall square to it divides the room, as before.
    if (Math.abs(dot(s.dir, m.dir)) <= square || Math.abs(cross(s.dir, m.dir)) <= square) return null
    const t = -across(s, m.a) / dot(m.dir, s.normal)
    const p = at(m, t)
    const end: 'start' | 'end' = Math.sign(across(s, m.b)) === side ? 'end' : 'start'
    if (Math.sign(across(s, endPoint(m, end))) !== side || Math.abs(across(s, endPoint(m, end))) <= tolerance('gap')) continue
    const overrun = tolerance('openingOverrun')
    // What stays of the wall, along it from its start.
    const [from, to] = end === 'end' ? [0, t] : [t, m.length]
    if (to - from < tolerance('gap')) return null
    edits.push({ op: 'move-end', wall: m.wall.id, end, to: pair(p) })
    for (const o of openingsOf(ctx.index, m.wall.id)) {
      const [o0, o1] = [o.offset, o.offset + o.width]
      if (o0 >= from - overrun && o1 <= to + overrun) {
        if (from !== 0) edits.push({ op: 'move-opening', opening: o.id, wall: m.wall.id, offset: tidy(Math.max(0, o0 - from)) })
      } else if (o1 <= from + overrun || o0 >= to - overrun) {
        toMove.push({ o, from: m, at: at(m, o.offset + o.width / 2) })
      } else {
        return null
      }
    }
  }
  for (const id of gone) {
    const g = ctx.segs.get(id)!
    for (const o of openingsOf(ctx.index, id)) toMove.push({ o, from: g, at: at(g, o.offset + o.width / 2) })
    const facts = ctx.segs.get(id)!.wall.properties
    edits.push({ op: 'remove-wall', wall: id, ...(facts !== undefined && Object.keys(facts).length > 0 ? { factsTo: s.wall.id } : {}) })
  }
  // The openings on the corner keep the way in: onto the cut, in the order they stood round the
  // corner, spaced evenly along its stretch clear of the walls it meets. One goes in its middle.
  if (toMove.length > 0) {
    const margin = Math.max(...segs.filter((seg) => met.includes(seg.wall.id)).map((seg) => seg.t)) / 2
    const widths = toMove.reduce((sum, m) => sum + m.o.width, 0)
    const spare = s.length - 2 * margin - widths
    if (openingsOf(ctx.index, s.wall.id).length > 0 || spare < 0) return null
    toMove.sort((p, q) => along(s, p.at) - along(s, q.at))
    const gap = spare / (toMove.length + 1)
    let offset = margin + gap
    for (const { o, from } of toMove) {
      // Hinge and swing are read along the wall: a wall running the other way turns them.
      const reversed = dot(from.dir, s.dir) < 0
      const flipped: { hinge?: 'start' | 'end'; swing?: 'left' | 'right' } = {}
      if (reversed && o.hinge !== undefined) flipped.hinge = o.hinge === 'start' ? 'end' : 'start'
      if (reversed && o.swing !== undefined) flipped.swing = o.swing === 'left' ? 'right' : 'left'
      edits.push({ op: 'move-opening', opening: o.id, wall: s.wall.id, offset: tidy(offset), ...flipped })
      offset += o.width + gap
    }
  }
  edits.push({ op: 'set-boundary', room: room.id, boundary: [...big.boundary] })
  return { edits, met, gone, moved: toMove.map((m) => m.o.id) }
}

/**
 * WRT-36: the parts of a split left with no way in: a part with no door,
 * opening or open side on any of its walls, or both parts when their only ones are on the wall
 * between them. An opening on a wall both parts list counts for the part it stands in.
 */
function sealedBy(ctx: Context, s: Seg, split: Split): string[] {
  const open = (id: string): boolean => ctx.segs.get(id)?.wall.virtual === true
  const ways = (part: Split['parts'][number], other: Split['parts'][number]): { any: boolean; out: boolean } => {
    const side = Math.sign(across(s, middleOf(part.polygon)))
    let out = false
    for (const id of part.boundary) {
      if (id === s.wall.id) continue
      if (open(id)) out = true
      const seg = ctx.segs.get(id)
      for (const o of openingsOf(ctx.index, id)) {
        if (!other.boundary.includes(id) || seg === undefined) out = true
        else if (Math.sign(across(s, at(seg, o.offset + o.width / 2))) === side) out = true
      }
    }
    return { any: out || open(s.wall.id) || openingsOf(ctx.index, s.wall.id).length > 0, out }
  }
  const [big, small] = split.parts
  const a = ways(big, small)
  const b = ways(small, big)
  const sealed = [...(a.any ? [] : [split.ids[0]]), ...(b.any ? [] : [split.ids[1]])]
  if (sealed.length > 0) return sealed
  return a.out || b.out ? [] : [...split.ids]
}

/** Walls in a room that does not list them: `crosses-room` and `stands-in-room`. */
function crossingFaults(ctx: Context, out: Map<string, WallFault>): void {
  const nesting = roomNesting(ctx.index)
  const zones = roomZones(ctx.index)
  // CNT-25: each room is tried only against the walls whose boxes meet its own (`boxIndex`), in
  // the order they are listed, as before; a box that is not all numbers is tried by every room.
  const segs = [...ctx.segs.values()]
  const finite = (b: Seg['box']): boolean => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)
  const filed = segs.map((s, i) => ({ s, i })).filter(({ s }) => finite(s.box))
  const filedIndex = boxIndex(filed.map(({ s }) => s.box))
  const unfiled = segs.map((s, i) => ({ s, i })).filter(({ s }) => !finite(s.box)).map(({ i }) => i)
  const nearRoom = (box: Seg['box']): Seg[] =>
    finite(box) ? [...filedIndex.near(box).map((k) => filed[k]!.i), ...unfiled].sort((x, y) => x - y).map((i) => segs[i]!) : segs
  for (const { room, outline } of ctx.traced) {
    if (outline.fault !== null) continue
    // The walls round its holes are its own too (ARE-6).
    const listed = new Set(roomWallIds(room))
    const polygon = outline.polygon
    const box = polygon.reduce(
      (b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    )
    const standing: { s: Seg; inside: number }[] = []
    for (const s of nearRoom(box)) {
      if (listed.has(s.wall.id)) continue
      if (s.box.x0 > box.x1 || s.box.x1 < box.x0 || s.box.y0 > box.y1 || s.box.y1 < box.y0) continue
      // The walls of a room that sits inside this one stand in it by right (ARE-5).
      if (listing(ctx, s.wall.id).some((r) => r.id !== room.id && sitsWithin(nesting, r.id, room.id))) continue
      // So do the dividing lines of its zones (CNT-8): they mark where a use is, not a wall.
      if (s.wall.virtual === true && listing(ctx, s.wall.id).some((r) => zones.zoneOf.get(r.id) === room.id)) continue
      const stretches = insideStretches(s, polygon)
      const length = (list: readonly [number, number][]): number => list.reduce((sum, [d0, d1]) => sum + d1 - d0, 0)
      // What stands in a hole (ARE-6) stands in no part of the room: the holes lie inside the
      // outline, so their stretches come off its.
      const inHoles = outline.holes.reduce((sum, hole) => sum + length(insideStretches(s, hole.polygon)), 0)
      const inside = length(stretches) - inHoles
      if (inside <= tolerance('lineInside')) continue
      if (inHoles > 0) {
        standing.push({ s, inside })
        continue
      }
      // A wall that runs from one side of the room to another divides it. One that stops inside
      // it (a stub, a column, a pod, a piece of furniture drawn as a wall) stands in it.
      const onEdge = (d: number): boolean => toBoundary(at(s, d), polygon) <= tolerance('gap')
      const divides = stretches.length === 1 && onEdge(stretches[0]![0]) && onEdge(stretches[0]![1])
      // It divides the room only where the room can be split in two along it.
      const split = divides ? splitAlong(ctx, room, s, stretches[0]!) : null
      if (split === null) {
        standing.push({ s, inside })
        continue
      }
      const id = `crosses-room:${s.wall.id}:${room.id}`
      const part = said(s.wall.virtual === true ? 'issue.part.Named.dividingLine' : 'issue.part.Named.wall', { id: name(s.wall.id) })
      // WRT-36: a wall across a corner at an angle is the room's new face; the corner goes outside.
      const cut = cornerCut(ctx, room, s, split)
      const cutFix =
        cut === null
          ? null
          : fixOf(
              ctx,
              said('issue.wall/crosses-room.corner', {
                room: name(room.id),
                area: num(areaText(split.areas[0])),
                walls: list(cut.met.map(name)),
                gone: cut.gone.length === 0 ? '' : said('issue.wall/crosses-room.corner.gone', { walls: list(cut.gone.map(name)) }),
                moved:
                  cut.moved.length === 0
                    ? ''
                    : said(cut.moved.length === 1 ? 'issue.wall/crosses-room.corner.moved' : 'issue.wall/crosses-room.corner.movedMany', { openings: list(cut.moved.map(name)) })
              }),
              cut.edits
            )
      // WRT-36: a split that leaves a part with no way in says so, and tidy makes it only when asked by its id.
      const seals = cutFix === null ? sealedBy(ctx, s, split) : []
      const splitSaid = said('issue.wall/crosses-room.fix', {
        room: name(room.id),
        a: name(split.ids[0]),
        areaA: num(areaText(split.areas[0])),
        b: name(split.ids[1]),
        areaB: num(areaText(split.areas[1])),
        seals:
          seals.length === 0
            ? ''
            : seals.length === 1
              ? said('issue.wall/crosses-room.seals.one', { room: name(seals[0]!) })
              : said(
                  // Through each other only when the wall between them carries a way through.
                  s.wall.virtual === true || openingsOf(ctx.index, s.wall.id).length > 0 ? 'issue.wall/crosses-room.seals.between' : 'issue.wall/crosses-room.seals.both',
                  { a: name(seals[0]!), b: name(seals[1]!) }
                )
      })
      const splitFix = cutFix === null ? fixOf(ctx, splitSaid, split.edits) : null
      const fix = cutFix ?? (splitFix === null ? null : seals.length === 0 ? splitFix : { ...splitFix, seals })
      out.set(id, {
        id,
        kind: 'crosses-room',
        floor: ctx.floor,
        walls: [s.wall.id],
        rooms: [room.id],
        distance: inside,
        ...say(said('issue.wall/crosses-room', { part, length: m(inside), room: name(room.id) }), fix?.said ?? null, said('issue.wall/crosses-room.noFix')),
        fix
      })
    }
    if (standing.length > 0) {
      const walls = standing.map((w) => w.s.wall.id)
      // How many more, in quotes as the line has always written it.
      const shown: Value[] = walls.length > 6 ? [...walls.slice(0, 6).map(name), said('issue.wall/stands-in-room.more', { n: walls.length - 6 })] : walls.map(name)
      const sentence = said(walls.length === 1 ? 'issue.wall/stands-in-room' : 'issue.wall/stands-in-room.many', { walls: list(shown), room: name(room.id) })
      out.set(`stands-in-room:${room.id}`, {
        id: `stands-in-room:${room.id}`,
        kind: 'stands-in-room',
        floor: ctx.floor,
        walls,
        rooms: [room.id],
        distance: Math.max(...standing.map((w) => w.inside)),
        message: english(sentence),
        said: sentence,
        fix: null
      })
    }
  }
}

/** How far a point lies from the edge of a polygon. */
function toBoundary(p: Vec2, polygon: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ab = sub(b, a)
    const len2 = dot(ab, ab)
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t)))
  }
  return best
}

/**
 * Every wall fault of the plan, floor by floor, in a stable order. Never throws. Walls and rooms
 * in `broken` are left out, as are rooms whose outline could not be traced at all.
 */
export function wallFaults(plan: FloorPlan, options: WallFaultOptions = {}): WallFault[] {
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? new Set<string>()
  const floors = [...new Set([...plan.walls.map(floorOf), ...plan.rooms.map(floorOf)])]
  const found: WallFault[] = []
  for (const floor of floors) {
    const segs = new Map<string, Seg>()
    const bends = new Map<string, Bend>()
    const counts = new Map<string, number>()
    for (const w of plan.walls) counts.set(w.id, (counts.get(w.id) ?? 0) + 1)
    for (const w of plan.walls) {
      // LVL-5: a wall through floors is one of each floor's it stands on.
      if (!wallStandsOn(plan, w, floor) || broken.has(w.id) || counts.get(w.id) !== 1) continue
      const s = segOf(w)
      if (s) segs.set(w.id, s)
      const b = bendOf(w)
      if (b) bends.set(w.id, b)
    }
    const traced: Traced[] = []
    for (const room of plan.rooms) {
      // CNT-28: a room a sound curved wall bounds is traced too, as CNT-18 meant it to be.
      if (floorOf(room) !== floor || room.boundary.some((id) => !segs.has(id) && !bends.has(id))) continue
      try {
        const outline = roomOutline(room, index)
        // A room refused for something other than its outline (an id used twice, an empty one).
        if (broken.has(room.id) && outline.fault === null) continue
        traced.push({ room, outline })
      } catch {
        continue
      }
    }
    const ctx: Context = { plan, index, floor, segs, bends, traced }
    const out = new Map<string, WallFault>()
    try {
      listedTwiceFaults(ctx, out)
      cornerFaults(ctx, out)
      overrunFaults(ctx, out)
      overlapFaults(ctx, out)
      crossingFaults(ctx, out)
    } catch {
      // A plan odd enough to throw here is reported by the checks that refuse it.
    }
    found.push(...out.values())
  }
  return found
}

export interface TidyResult<P> {
  readonly plan: P
  /** The faults whose fixes were made, in the order made. */
  readonly applied: readonly WallFault[]
  /** The faults asked for and not fixed, with why. */
  readonly skipped: readonly { readonly id: string; readonly why: string }[]
}

/**
 * Makes the fixes of the faults named, or of every fault that has one when `ids` is left out.
 * The faults are looked for again before each fix, so a fix that an earlier one made needless
 * is skipped, and one fix never works on walls another has moved. The plan is a parsed plan, or
 * a plan file as read with `parse` to read it (every other key of the file is kept).
 */
export function tidyPlan<P extends EditablePlan>(
  plan: P,
  ids?: readonly string[],
  parse: (plan: P) => FloorPlan = (p) => p as unknown as FloorPlan
): TidyResult<P> {
  const find = (p: FloorPlan): readonly WallFault[] => wallFaults(p)
  let current = plan
  const wanted = ids ?? find(parse(plan)).filter((f) => f.fix !== null).map((f) => f.id)
  const applied: WallFault[] = []
  const skipped: { id: string; why: string }[] = []
  for (const id of wanted) {
    const fault = find(parse(current)).find((f) => f.id === id)
    if (fault === undefined) {
      skipped.push({ id, why: applied.length > 0 ? 'no longer found: an earlier fix took care of it' : 'not found in this plan' })
      continue
    }
    if (fault.fix === null) {
      skipped.push({ id, why: 'Grid offers no change for it' })
      continue
    }
    current = applyWallEdits(current, fault.fix.edits)
    applied.push(fault)
  }
  return { plan: current, applied, skipped }
}
