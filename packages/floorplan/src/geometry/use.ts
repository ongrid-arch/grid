/**
 * Use indicators (CNT-13): what the plan's fixtures leave of a room for using it. Is the way
 * through wide enough for a body or a trolley, is there a turning circle, how much floor is in
 * front of and beside a fixture, how much of a doorway a fixture and an open leaf leave clear,
 * and whether a fixture stands in front of a window.
 *
 * Each is a measure, never a rule: it says what it measured and how, and the caller sets it
 * against a width the person gives or one of Grid's own indicator figures (`useDoorwayClear`,
 * `usePassageWidth`, `useTurningCircle`, `useClearSpace` in `tolerances.ts`), and says which.
 * Nothing here cites a document.
 *
 * Pure: shapes in, figures out. A fixture is its footprint (`itemFootprint`); a room is the
 * outline and holes its shape gives.
 */

import { floorOf } from './floors'
import type { Holes } from './innerPoint'
import { pointInPolygon, poleOfInaccessibility } from './innerPoint'
import { itemKindDefinition } from './itemKinds'
import { isItemKind, itemFootprint, itemName, itemNounSaid, type Item } from './items'
import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import type { Said, Value } from '../messages/say'
import { english, name, num, said } from '../messages/say'
import { withSaid } from './issueWords'
import { metresText } from './rounding'
import { limit, tolerance } from './tolerances'
import type { Issue } from './validate'
import type { Vec2 } from './vec2'
import { add, cross, dot, length, lerp, scale, signedArea, sub, vec } from './vec2'
import { openingChord, wallLength, wallPointAt, wallSegments } from './wall'
import { curveFault } from './arc'
import { INDEX_FROM, SpatialIndex, type IndexBox } from './spatialIndex'

/** The indicators, by code, each with what it measures in Grid's words and the figure it is set against when the person gives none. */
export const USE_INDICATORS = {
  'use/doorway-clear-width': {
    name: 'clear width of a doorway',
    measures: 'the widest stretch of the hole in the wall that no fixture stands in front of, less what an open leaf and its stop take for a door',
    figure: 'useDoorwayClear'
  },
  'use/passage-width': {
    name: 'way through a room',
    measures: 'the widest body or trolley that gets from one doorway of the room to another, or to its widest point, keeping clear of its walls and fixtures',
    figure: 'usePassageWidth'
  },
  'use/turning-space': {
    name: 'turning space',
    measures: 'the widest circle the room\'s free floor holds, clear of its walls and fixtures',
    figure: 'useTurningCircle'
  },
  'use/space-by-fixture': {
    name: 'space in front of and beside a fixture',
    measures: 'the clear floor straight out from the front and from each side of a fixture to the nearest wall face, doorway or other fixture, the least along that face',
    figure: 'useClearSpace'
  },
  'use/window-blocked': {
    name: 'window blocked',
    measures: 'how much of a window\'s width a fixture higher than its sill stands in front of, within the approach depth',
    figure: 'useApproachDepth'
  }
} as const

export type UseCode = keyof typeof USE_INDICATORS

/** Said with every indicator: what it is, and what it is not. */
export const INDICATOR_NOTE =
  'An indicator, measured on the plan: it says what was measured and the width it was set against. Grid\'s own figures are indicators, not a rule from any code or standard.'

export type Segment = readonly [Vec2, Vec2]

/** Something standing on the floor that a body keeps clear of: a fixture's footprint, by its id. */
export interface Obstacle {
  readonly id: string
  readonly outline: readonly Vec2[]
}

/** The fixtures of a plan held as obstacles on one floor: the kinds it holds, each by its footprint. */
export function fixtureObstacles(items: readonly Item[], floor: string): Obstacle[] {
  return items.filter((item) => isItemKind(item.kind) && floorOf(item) === floor).map((item) => ({ id: item.id, outline: itemFootprint(item) }))
}

// ── Small shapes ─────────────────────────────────────────────────────────────────────────────

function distanceToSegment(p: Vec2, [a, b]: Segment): number {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return length(sub(p, add(a, scale(ab, t))))
}

/** `distanceToSegment` squared, in plain numbers: for ranking many segments, never for a figure that is said. */
function squaredToSegment(p: Vec2, [a, b]: Segment): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const span = abx * abx + aby * aby
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / span))
  const dx = p.x - (a.x + abx * t)
  const dy = p.y - (a.y + aby * t)
  return dx * dx + dy * dy
}

/** Where a ray from `origin` along unit `dir` first meets a segment, as a distance, or null. */
function rayHits(origin: Vec2, dir: Vec2, [a, b]: Segment): number | null {
  const s = sub(b, a)
  const denominator = cross(dir, s)
  if (Math.abs(denominator) < tolerance('parallel')) return null
  const w = sub(a, origin)
  const t = cross(w, s) / denominator
  const u = cross(w, dir) / denominator
  if (t < -tolerance('noLength') || u < -tolerance('relativeNoise') || u > 1 + tolerance('relativeNoise')) return null
  return Math.max(0, t)
}

/** The part of a convex polygon inside another convex polygon (Sutherland–Hodgman), or `[]`. */
function convexOverlap(subject: readonly Vec2[], clip: readonly Vec2[]): Vec2[] {
  const inward = Math.sign(signedArea(clip))
  let out = [...subject]
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const p = clip[i]!
    const edge = sub(clip[(i + 1) % clip.length]!, p)
    if (dot(edge, edge) === 0) continue
    const side = (x: Vec2): number => inward * cross(edge, sub(x, p))
    const next: Vec2[] = []
    for (let j = 0; j < out.length; j++) {
      const a = out[j]!
      const b = out[(j + 1) % out.length]!
      const sa = side(a)
      const sb = side(b)
      if (sa >= 0) next.push(a)
      if (sa >= 0 !== sb >= 0) next.push(lerp(a, b, sa / (sa - sb)))
    }
    out = next
  }
  return out
}

const edgesOf = (ring: readonly Vec2[]): Segment[] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as const)

// ── A hole in a wall ─────────────────────────────────────────────────────────────────────────

interface WallFrame {
  /** Where a distance along the wall's axis lands on the line the frame measures along. */
  readonly at: (s: number) => Vec2
  /** The distance along the wall's axis a point on that line stands for. */
  readonly along: (p: Vec2) => number
  readonly dir: Vec2
  /** 90° counter-clockwise from `dir`. */
  readonly normal: Vec2
  readonly half: number
}

/**
 * The line a hole is measured along. On a straight wall it is the wall's axis; on a curved wall
 * (CNT-18) it is the opening's own chord, its hole being straight between its edges (C21), with
 * its edges where the opening's offset and far edge are along the curve.
 */
function frameOf(wall: Wall, opening?: Opening): WallFrame | null {
  const half = wall.virtual === true ? 0 : wall.thickness / 2
  if (wall.arc !== undefined) {
    if (curveFault(wall) !== null) return null
    const from = opening?.offset ?? 0
    const to = opening === undefined ? wallLength(wall) : opening.offset + opening.width
    const chord = openingChord(wall, from, to)
    if (chord.length < tolerance('noLength')) return null
    const k = chord.length / (to - from)
    return {
      at: (s) => add(chord.start, scale(chord.dir, (s - from) * k)),
      along: (p) => from + dot(sub(p, chord.start), chord.dir) / k,
      dir: chord.dir,
      normal: chord.normal,
      half
    }
  }
  const start = vec(wall.start[0], wall.start[1])
  const delta = sub(vec(wall.end[0], wall.end[1]), start)
  const len = length(delta)
  if (len < tolerance('noLength')) return null
  const dir = scale(delta, 1 / len)
  return { at: (s) => add(start, scale(dir, s)), along: (p) => dot(sub(p, start), dir), dir, normal: vec(-dir.y, dir.x), half }
}

/** The hole's edge on one face of the wall: `side` 1 is the face the normal points at, -1 the other. */
function holeFace(frame: WallFrame, opening: Opening, side: 1 | -1): Segment {
  const across = scale(frame.normal, side * frame.half)
  return [add(frame.at(opening.offset), across), add(frame.at(opening.offset + opening.width), across)]
}

/** The floor in front of one face of a hole, `depth` deep, as a counter-clockwise box. */
function approachZone(frame: WallFrame, face: Segment, side: 1 | -1, depth: number): Vec2[] {
  const out = scale(frame.normal, side * depth)
  const box = [face[0], face[1], add(face[1], out), add(face[0], out)]
  return signedArea(box) < 0 ? box.reverse() : box
}

/** The stretches of the hole, as offsets along the wall, that the fixtures cover within the approach depth on either face. */
function coveredSpans(frame: WallFrame, opening: Opening, fixtures: readonly Obstacle[]): { id: string; from: number; to: number }[] {
  const depth = limit('useApproachDepth')
  const spans: { id: string; from: number; to: number }[] = []
  for (const side of [1, -1] as const) {
    const zone = approachZone(frame, holeFace(frame, opening, side), side, depth)
    for (const fixture of fixtures) {
      const part = convexOverlap(fixture.outline, zone)
      if (part.length < 3 || Math.abs(signedArea(part)) < tolerance('noArea')) continue
      const along = part.map((p) => frame.along(p))
      const from = Math.max(opening.offset, Math.min(...along))
      const to = Math.min(opening.offset + opening.width, Math.max(...along))
      if (to - from > tolerance('noLength')) spans.push({ id: fixture.id, from, to })
    }
  }
  return spans
}

/** The longest stretch of [from, to] that none of the spans covers. */
function longestFree(from: number, to: number, spans: readonly { from: number; to: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  let best = 0
  let at = from
  for (const span of sorted) {
    if (span.from > at) best = Math.max(best, span.from - at)
    at = Math.max(at, span.to)
  }
  return Math.max(best, to - at)
}

/** ARE-27: one leaf of a door: where it stands along the hole, and what it leaves clear when open. */
export interface DoorLeaf {
  /** Its near and far edges, as offsets along the wall. */
  readonly from: number
  readonly to: number
  /** Its width along the wall. */
  readonly width: number
  /** What it and its stop take when open (`openLeafAllowance`). */
  readonly allowance: number
  /** The widest stretch of it no fixture stands in front of, less its allowance, never below 0. */
  readonly clear: number
  /** True for a leaf the door is judged by: the part the plan says opens, or each leaf of a pair that states none. */
  readonly active: boolean
}

/**
 * ARE-27: what a door is judged by. `hole` for a doorless opening, which leaves its whole hole;
 * `leaf` for one leaf, the part the plan says opens (`opens`) or a door's only leaf; `pair` for
 * both leaves of a pair that states no active leaf, opened together.
 */
export type DoorJudgedBy = 'hole' | 'leaf' | 'pair'

export interface DoorwayClearance {
  readonly opening: string
  /** The hole in the wall, as the plan states its width. */
  readonly hole: number
  /** What the open leaves and their stops take off the width it is judged by; 0 for a doorless opening, or a door that leaves its hole whole. */
  readonly leaf: number
  /** How much of the hole fixtures stand in front of, within `useApproachDepth` on either face, joined where they overlap. */
  readonly covered: number
  /** The widest stretch no fixture stands in front of, of the leaf or leaves it is judged by. */
  readonly run: number
  /** What is left: the run less the leaf, never below 0. The one clear width every check and measure reads. */
  readonly clear: number
  /** ARE-27: each leaf, in order along the wall; none for a doorless opening. */
  readonly leaves: readonly DoorLeaf[]
  /** ARE-27: what `clear` is the width of. */
  readonly judgedBy: DoorJudgedBy
  /** The fixtures standing in front of the hole, by id, in plan order. */
  readonly narrowedBy: readonly string[]
}

/**
 * ARE-27: what an open leaf and its stop take in its doorway, by the door's kind. A swinging leaf
 * (no kind, `single`, `double`) and a folding door take `useOpenLeaf`; a door that slides along
 * its wall or into it, rolls up or lifts overhead leaves its hole whole and takes nothing. A
 * doorless opening has no leaf.
 */
export function openLeafAllowance(opening: Pick<Opening, 'type' | 'kind'>): number {
  if (opening.type !== 'door') return 0
  const kind = opening.kind
  return kind === 'sliding' || kind === 'pocket' || kind === 'roller' || kind === 'garage' ? 0 : limit('useOpenLeaf')
}

/**
 * ARE-27: a door's leaves along its hole. A pair (`double`) is two leaves: the part the plan says
 * opens (`opens`), at the end it hangs from (`hinge`, else the wall's start end), and the rest; or
 * two equal leaves when it states none, both active. Any other door is one leaf: the part that
 * opens when stated, beside a fixed panel, else the whole hole.
 */
function leafSpans(opening: Opening): { from: number; to: number; active: boolean }[] {
  const a = opening.offset
  const b = opening.offset + opening.width
  const part = opening.opens === undefined ? null : Math.min(opening.opens.width, opening.width)
  const atEnd = opening.hinge === 'end'
  if (opening.kind === 'double') {
    if (part === null || part >= opening.width) {
      const mid = (a + b) / 2
      return [{ from: a, to: mid, active: true }, { from: mid, to: b, active: true }]
    }
    return atEnd
      ? [{ from: a, to: b - part, active: false }, { from: b - part, to: b, active: true }]
      : [{ from: a, to: a + part, active: true }, { from: a + part, to: b, active: false }]
  }
  if (part === null) return [{ from: a, to: b, active: true }]
  return [atEnd ? { from: b - part, to: b, active: true } : { from: a, to: a + part, active: true }]
}

/** The clear width a door or doorless opening leaves (`use/doorway-clear-width`), leaf by leaf (ARE-27). */
export function doorwayClearance(wall: Wall, opening: Opening, fixtures: readonly Obstacle[]): DoorwayClearance {
  const frame = frameOf(wall, opening)
  const spans = frame === null ? [] : coveredSpans(frame, opening, fixtures)
  const by = new Set(spans.map((s) => s.id))
  const covered = spans.length === 0 ? 0 : Math.max(0, opening.width - longestFreeTotal(opening.offset, opening.offset + opening.width, spans))
  const narrowedBy = fixtures.filter((f) => by.has(f.id)).map((f) => f.id)
  const base = { opening: opening.id, hole: opening.width, covered, narrowedBy }
  if (opening.type !== 'door') {
    const run = longestFree(opening.offset, opening.offset + opening.width, spans)
    return { ...base, leaf: 0, run, clear: run, leaves: [], judgedBy: 'hole' }
  }
  const allowance = openLeafAllowance(opening)
  const leaves: DoorLeaf[] = leafSpans(opening).map((s) => {
    const run = longestFree(s.from, s.to, spans)
    return { from: s.from, to: s.to, width: s.to - s.from, allowance, clear: Math.max(0, run - allowance), active: s.active }
  })
  const active = leaves.filter((l) => l.active)
  if (active.length > 1) {
    // A pair opened together: the widest free stretch across both leaves, less each leaf's allowance.
    const run = longestFree(Math.min(...active.map((l) => l.from)), Math.max(...active.map((l) => l.to)), spans)
    const taken = allowance * active.length
    return { ...base, leaf: taken, run, clear: Math.max(0, run - taken), leaves, judgedBy: 'pair' }
  }
  const one = active[0]!
  return { ...base, leaf: allowance, run: longestFree(one.from, one.to, spans), clear: one.clear, leaves, judgedBy: 'leaf' }
}

export interface WindowCover {
  readonly window: string
  readonly width: number
  readonly sill: number
  /** How much of the window's width fixtures higher than its sill stand in front of, joined where they overlap. */
  readonly covered: number
  /** Each such fixture, with its height and the stretch of the window it covers. */
  readonly by: readonly { readonly id: string; readonly height: number; readonly covers: number }[]
}

/**
 * How much of a window fixtures block (`use/window-blocked`): those standing within
 * `useApproachDepth` of its hole on either face that are higher than its sill and leave less than
 * `windowGlassKept` of its glass clear above them (CNT-29).
 */
export function windowCover(wall: Wall, opening: Opening, fixtures: readonly (Obstacle & { readonly height: number })[]): WindowCover {
  const frame = frameOf(wall, opening)
  // Judged against the glass left clear above the fixture, not the sill alone: a low seat before
  // glazing that runs to the floor leaves most of the glass clear.
  const top = opening.sill + opening.height
  const higher = fixtures.filter((f) => f.height > opening.sill + tolerance('itemAboveRoom') && top - f.height < limit('windowGlassKept'))
  const spans = frame === null ? [] : coveredSpans(frame, opening, higher)
  const by = higher.flatMap((f) => {
    const own = spans.filter((s) => s.id === f.id)
    if (own.length === 0) return []
    const covers = opening.width - longestFreeTotal(opening.offset, opening.offset + opening.width, own)
    return [{ id: f.id, height: f.height, covers }]
  })
  const covered = spans.length === 0 ? 0 : Math.max(0, opening.width - longestFreeTotal(opening.offset, opening.offset + opening.width, spans))
  return { window: opening.id, width: opening.width, sill: opening.sill, covered, by }
}

/** The total length of [from, to] that none of the spans covers. */
function longestFreeTotal(from: number, to: number, spans: readonly { from: number; to: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  let free = 0
  let at = from
  for (const span of sorted) {
    if (span.from > at) free += span.from - at
    at = Math.max(at, span.to)
  }
  return free + Math.max(0, to - at)
}

/**
 * Where a hole meets a room: the hole's edge on the face of its wall the room is on, or null
 * when the room is on neither face.
 */
export function openingMouth(wall: Wall, opening: Opening, polygon: readonly Vec2[], holes: Holes = []): Segment | null {
  const frame = frameOf(wall, opening)
  if (frame === null) return null
  const step = tolerance('useRaster')
  for (const side of [1, -1] as const) {
    const face = holeFace(frame, opening, side)
    const inward = add(lerp(face[0], face[1], 0.5), scale(frame.normal, side * step))
    if (pointInPolygon(inward, polygon, holes)) return face
  }
  return null
}

/** Where a dividing line meets a room: the stretch of its outline that lies on the line, or null. */
export function lineMouth(wall: Wall, polygon: readonly Vec2[]): Segment | null {
  if (wall.arc !== undefined && curveFault(wall) !== null) return null
  if (wall.arc === undefined && frameOf(wall) === null) return null
  const near = tolerance('wallContact')
  const along: number[] = []
  // A curved line is looked along piece by piece (CNT-18); its mouth is the chord between the
  // ends of the stretch the room's outline runs along.
  for (const piece of wallSegments(wall)) {
    const k = piece.length === 0 ? 1 : (piece.to - piece.from) / piece.length
    for (const [a, b] of edgesOf(polygon)) {
      const off = (p: Vec2): number => Math.abs(dot(sub(p, piece.start), piece.normal))
      if (off(a) > near || off(b) > near || length(sub(b, a)) < tolerance('noLength')) continue
      const sa = dot(sub(a, piece.start), piece.dir)
      const sb = dot(sub(b, piece.start), piece.dir)
      // A piece's line runs on past it, where the curve does not.
      if (wall.arc !== undefined && (Math.max(sa, sb) < -near || Math.min(sa, sb) > piece.length + near)) continue
      along.push(piece.from + sa * k, piece.from + sb * k)
    }
  }
  if (along.length === 0) return null
  const from = Math.min(...along)
  const to = Math.max(...along)
  return [wallPointAt(wall, from), wallPointAt(wall, to)]
}

// ── A turning circle ─────────────────────────────────────────────────────────────────────────

/** The widest circle a room's free floor holds (`use/turning-space`): its diameter and middle. */
export function turningSpace(polygon: readonly Vec2[], holes: Holes, fixtures: readonly Obstacle[]): { readonly diameter: number; readonly at: Vec2 } {
  const pole = poleOfInaccessibility(polygon, undefined, [...holes, ...fixtures.map((f) => f.outline)])
  return { diameter: 2 * pole.distance, at: pole.point }
}

/** The other fixtures' boxes, edges and bucket grid, made once for each list of them a caller measures many fixtures against (CNT-23). */
interface PreparedOthers {
  readonly ids: readonly string[]
  readonly boxes: readonly IndexBox[]
  readonly edges: readonly (readonly Segment[])[]
  readonly index: SpatialIndex | null
}

const preparedCache = new WeakMap<readonly Obstacle[], PreparedOthers>()

function preparedOthers(others: readonly Obstacle[]): PreparedOthers {
  const known = preparedCache.get(others)
  if (known) return known
  const boxes = others.map((o) => boxOfPoints(o.outline))
  const made: PreparedOthers = {
    ids: others.map((o) => o.id),
    boxes,
    edges: others.map((o) => edgesOf(o.outline)),
    index: others.length >= INDEX_FROM ? new SpatialIndex(boxes) : null
  }
  preparedCache.set(others, made)
  return made
}

/** Slack on a ray's reach when narrowing which shapes it could meet: one step of the grid, far more than a hit's own noise. */
const RAY_SLACK = tolerance('useRaster')

/** How far a ray that meets no edge is followed: past any plan. */
const RAY_FAR = limit('largest')

function boxOfPoints(points: readonly Vec2[]): IndexBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

// ── The floor round a fixture ────────────────────────────────────────────────────────────────

export interface FixtureSpace {
  readonly fixture: string
  /** The clear floor straight out from its front, and from its left and right as seen from its front, in metres; null when nothing bounds it there, or the side does not count (`sides`, `joined`). */
  readonly front: number | null
  readonly left: number | null
  readonly right: number | null
  /** What stops the front, when another fixture does (the run it faces: the clear floor between them is an aisle); null for a wall, a hole or nothing. */
  readonly frontBy: string | null
  /** False for a kind that needs no clear floor beside it: both sides answer null. */
  readonly sides: boolean
  /** CNT-37: the fixtures flush against its left and right sides, end to end with it: one run. A joined side is not measured; the run's ends are. */
  readonly joined: { readonly left: readonly string[]; readonly right: readonly string[] }
}

/**
 * The clear floor in front of and beside a fixture (`use/space-by-fixture`): from each face, the
 * least distance straight out to the room's outline (a wall face, or the line across a
 * doorway), a hole or another fixture, tried at points along the face `useRaster` apart.
 *
 * CNT-37: fixtures standing flush against a side, end to end, are one run: that side is joined,
 * not measured, and the ray goes on past the run, so the end piece's side is read from the end
 * of the run. A kind that keeps no clear floor beside it (`sides` false) has no sides.
 */
export function fixtureSpace(item: Item, polygon: readonly Vec2[], holes: Holes, others: readonly Obstacle[]): FixtureSpace {
  const [backLeft, backRight, frontRight, frontLeft] = itemFootprint(item)
  // CNT-23: the room's own edges are tried first, and of the other fixtures only those whose box
  // meets the ray as far as the nearest edge so far; the least is the same as trying them all.
  const walls: Segment[] = [...edgesOf(polygon), ...holes.flatMap(edgesOf)]
  const { boxes, edges, index, ids } = preparedOthers(others)
  const contact = tolerance('wallContact')
  const unit = (v: Vec2): Vec2 => scale(v, 1 / length(v))
  interface Clear {
    readonly least: number | null
    /** The fixture the least distance meets, or null for the room's own edges. */
    readonly by: string | null
    /** The one fixture every point along the face meets within contact, or null. */
    readonly flush: string | null
  }
  const clear = (a: Vec2, b: Vec2, out: Vec2): Clear => {
    const pieces = Math.max(1, Math.min(200, Math.ceil(length(sub(b, a)) / tolerance('useRaster'))))
    let least = Infinity
    let by: string | null = null
    let flush: string | null | undefined
    for (let i = 0; i < pieces; i++) {
      const origin = lerp(a, b, (i + 0.5) / pieces)
      let ray = Infinity
      let rayBy: string | null = null
      const hit = (wall: Segment, owner: string | null): void => {
        const t = rayHits(origin, out, wall)
        if (t !== null && t < ray) {
          ray = t
          rayBy = owner
        }
      }
      for (const wall of walls) hit(wall, null)
      // A ray the room's edges do not stop is followed as far as any plan goes.
      const reach = Math.min(ray, least) === Infinity ? RAY_FAR : Math.min(ray, least) + RAY_SLACK
      const endX = origin.x + out.x * reach
      const endY = origin.y + out.y * reach
      const lowX = Math.min(origin.x, endX) - RAY_SLACK
      const highX = Math.max(origin.x, endX) + RAY_SLACK
      const lowY = Math.min(origin.y, endY) - RAY_SLACK
      const highY = Math.max(origin.y, endY) + RAY_SLACK
      const tryOther = (k: number): void => {
        const box = boxes[k]!
        if (ids[k] === item.id) return
        if ((box.maxX < lowX || box.minX > highX || box.maxY < lowY || box.minY > highY)) return
        for (const wall of edges[k]!) hit(wall, ids[k]!)
      }
      if (index !== null) index.range(lowX, lowY, highX, highY, tryOther)
      else for (let k = 0; k < boxes.length; k++) tryOther(k)
      if (ray < least) {
        least = ray
        by = rayBy
      }
      const touching = ray <= contact && rayBy !== null ? rayBy : null
      flush = flush === undefined ? touching : flush === touching ? flush : null
    }
    return { least: least === Infinity ? null : least, by, flush: flush ?? null }
  }
  const front = unit(sub(frontLeft!, backLeft!))
  const across = unit(sub(backRight!, backLeft!))
  const needs = itemKindDefinition(item.kind)?.sides !== false
  const measured = clear(frontLeft!, frontRight!, front)
  // A side, followed past every fixture flush against it.
  const side = (a: Vec2, b: Vec2, out: Vec2): { readonly least: number | null; readonly joined: string[] } => {
    const joined: string[] = []
    let from = a
    let to = b
    for (let step = 0; step <= others.length; step++) {
      const found = clear(from, to, out)
      if (found.flush === null || joined.includes(found.flush)) return { least: found.least, joined }
      joined.push(found.flush)
      const own = dot(from, out)
      const neighbour = others[ids.indexOf(found.flush)]!
      const shift = Math.max(...neighbour.outline.map((p) => dot(p, out))) - own + 2 * contact
      from = add(from, scale(out, shift))
      to = add(to, scale(out, shift))
    }
    return { least: null, joined }
  }
  const left = needs ? side(backLeft!, frontLeft!, scale(across, -1)) : null
  const right = needs ? side(backRight!, frontRight!, across) : null
  return {
    fixture: item.id,
    front: measured.least,
    frontBy: measured.by,
    left: left !== null && left.joined.length === 0 ? left.least : null,
    right: right !== null && right.joined.length === 0 ? right.least : null,
    sides: needs,
    joined: { left: left?.joined ?? [], right: right?.joined ?? [] }
  }
}

// ── The way through a room ───────────────────────────────────────────────────────────────────

export interface Passage {
  /** The widest body that gets from one mouth to the other, in metres. */
  readonly width: number
  /** Where it is narrowest. */
  readonly at: Vec2
  /** What stands either side of the narrowest point: the fixtures, by id, and whether a wall does. */
  readonly beside: { readonly fixtures: readonly string[]; readonly wall: boolean }
  /** True when the narrowest point is a doorway itself: nothing inside the room is narrower. */
  readonly atDoorway: boolean
  /** The step of the grid it was measured on, in metres. */
  readonly step: number
}

/** How a way through a room is measured (ARE-25). */
export interface PassageOptions {
  /** The step of the grid to use at least, in metres: coarser than `useRaster`, never finer. */
  readonly step?: number
}

/** The point of a segment nearest to `p`. */
function nearestOnSegment(p: Vec2, [a, b]: Segment): Vec2 {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return add(a, scale(ab, t))
}

/** How far the grid's figure may be from the plan's, in steps of the grid: a point of any way is within half a diagonal of a point of the grid. */
const GRID_ERROR_STEPS = 1.5

/**
 * The width of the way at the point the grid found narrowest, taken from the plan (ARE-25): from
 * the nearest thing to that point, a line straight across through it to the first thing on the
 * other side, and the body that fits at its middle, as wide as its clearance from everything.
 * That body is the figure when it is no narrower than the grid's and within the grid's own error
 * of it; else the grid's figure stands, at its point. `fromPlan` says which.
 */
function acrossAt(
  point: Vec2,
  clear: number,
  step: number,
  obstacles: readonly { readonly segment: Segment }[],
  polygon: readonly Vec2[],
  holes: Holes,
  fixtures: readonly Obstacle[]
): { readonly at: Vec2; readonly half: number; readonly fromPlan: boolean } {
  const grid = { at: point, half: clear, fromPlan: false }
  let nearest: Vec2 | null = null
  let least = Infinity
  for (const o of obstacles) {
    const q = nearestOnSegment(point, o.segment)
    const d = length(sub(point, q))
    if (d < least) {
      least = d
      nearest = q
    }
  }
  if (nearest === null || least <= tolerance('noLength')) return grid
  const dir = scale(sub(point, nearest), 1 / least)
  let across = Infinity
  for (const o of obstacles) {
    const t = rayHits(nearest, dir, o.segment)
    if (t !== null && t > tolerance('wallContact') && t < across) across = t
  }
  if (!Number.isFinite(across)) return grid
  const middle = add(nearest, scale(dir, across / 2))
  if (!pointInPolygon(middle, polygon, holes) || fixtures.some((f) => pointInPolygon(middle, f.outline))) return grid
  let half = Infinity
  for (const o of obstacles) half = Math.min(half, distanceToSegment(middle, o.segment))
  if (half < clear || 2 * (half - clear) > GRID_ERROR_STEPS * step) return grid
  return { at: middle, half, fromPlan: true }
}

/**
 * The widest body or trolley that gets through a room from one mouth to another
 * (`use/passage-width`), keeping clear of its walls, its holes and the fixtures: the floor is
 * tried on a grid of points `useRaster` apart (coarser for a room that would take more than
 * `useRasterCells` points), and the way is the one whose narrowest point is widest. A mouth is a
 * doorway's edge on the room's face (`openingMouth`), a dividing line's stretch (`lineMouth`), a
 * point, such as the room's widest point (`pointMouth`), or null for anywhere in the room, where a
 * way starts or ends for a person already in it. The room's outline is open along the two mouths.
 * Null when the mouths are not joined by free floor at all.
 *
 * ARE-25: the grid finds where the way is narrowest; the width there is then taken from the plan
 * itself (`acrossAt`), so a way between walls w apart measures w, not w less a step of the grid.
 */
export function passageWidth(polygon: readonly Vec2[], holes: Holes, fixtures: readonly Obstacle[], from: Segment | null, to: Segment | null, options: PassageOptions = {}): Passage | null {
  if (polygon.length < 3) return null
  const contact = tolerance('wallContact')
  const mouths = [from, to].filter((mouth): mouth is Segment => mouth !== null && length(sub(mouth[1], mouth[0])) > tolerance('noLength'))

  // What a body keeps clear of: the outline less the mouths, the holes, the fixtures.
  const obstacles: { readonly segment: Segment; readonly owner: string | null }[] = []
  for (const [a, b] of edgesOf(polygon)) {
    const len = length(sub(b, a))
    if (len < tolerance('noLength')) continue
    const dir = scale(sub(b, a), 1 / len)
    const normal = vec(-dir.y, dir.x)
    const cuts: [number, number][] = []
    for (const [p, q] of mouths) {
      if (Math.abs(dot(sub(p, a), normal)) > contact || Math.abs(dot(sub(q, a), normal)) > contact) continue
      const s = dot(sub(p, a), dir)
      const t = dot(sub(q, a), dir)
      cuts.push([Math.max(0, Math.min(s, t)), Math.min(len, Math.max(s, t))])
    }
    let at = 0
    for (const [s, t] of cuts.filter(([s, t]) => t > s).sort((x, y) => x[0] - y[0])) {
      if (s > at) obstacles.push({ segment: [add(a, scale(dir, at)), add(a, scale(dir, s))], owner: null })
      at = Math.max(at, t)
    }
    if (len > at) obstacles.push({ segment: [add(a, scale(dir, at)), b], owner: null })
  }
  for (const hole of holes) for (const segment of edgesOf(hole)) obstacles.push({ segment, owner: null })
  for (const fixture of fixtures) for (const segment of edgesOf(fixture.outline)) obstacles.push({ segment, owner: fixture.id })

  // The grid.
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of polygon) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const step = Math.max(tolerance('useRaster'), options.step ?? 0, Math.sqrt(((x1 - x0) * (y1 - y0)) / limit('useRasterCells')))
  const columns = Math.max(1, Math.ceil((x1 - x0) / step))
  const rows = Math.max(1, Math.ceil((y1 - y0) / step))
  const cells = columns * rows
  const clearance = new Float64Array(cells).fill(-1)
  const centre = (i: number): Vec2 => vec(x0 + ((i % columns) + 0.5) * step, y0 + (Math.floor(i / columns) + 0.5) * step)
  const free: number[] = []
  // CNT-23: a room with many fixtures has tens of thousands of edges. The nearest edge to a point,
  // and the fixture a point stands in, come from a bucket grid; the figures are the same.
  const edgeIndex = obstacles.length >= INDEX_FROM ? new SpatialIndex(obstacles.map(({ segment: [a, b] }) => boxOfPoints([a, b]))) : null
  const fixtureIndex = fixtures.length >= INDEX_FROM ? new SpatialIndex(fixtures.map((f) => boxOfPoints(f.outline))) : null
  for (let i = 0; i < cells; i++) {
    const p = centre(i)
    if (!pointInPolygon(p, polygon, holes)) continue
    const stands = fixtureIndex === null ? fixtures.some((f) => pointInPolygon(p, f.outline)) : fixtureIndex.some(p.x, p.y, (k) => pointInPolygon(p, fixtures[k]!.outline))
    if (stands) continue
    let least = Infinity
    if (edgeIndex === null) for (const o of obstacles) least = Math.min(least, distanceToSegment(p, o.segment))
    else {
      // Squared distances find the nearest edge; the distance the plain loop would give is then
      // worked out for every edge as near as that, so the figure is the same to the last digit.
      const near: number[] = []
      let nearest = Infinity
      edgeIndex.nearest(
        p.x,
        p.y,
        (k) => {
          const d = squaredToSegment(p, obstacles[k]!.segment)
          if (d <= nearest * (1 + tolerance('relativeNoise'))) {
            if (d < nearest) nearest = d
            near.push(k)
          }
          return d
        },
        true
      )
      for (const k of near) least = Math.min(least, distanceToSegment(p, obstacles[k]!.segment))
    }
    clearance[i] = least
    free.push(i)
  }

  // Where a body starts and ends: the free points beside each mouth.
  const reach = step * 1.5
  // (A point plainly farther than `reach` is dropped on its squared distance, without the root.)
  const beside = (mouth: Segment | null): Set<number> =>
    new Set(mouth === null ? free : free.filter((i) => {
      const p = centre(i)
      return squaredToSegment(p, mouth) <= reach * reach * (1 + tolerance('relativeNoise')) && distanceToSegment(p, mouth) <= reach
    }))
  const starts = beside(from)
  const ends = beside(to)
  if (starts.size === 0 || ends.size === 0) return null

  // The widest way: add the points widest first, joining neighbours, until a start meets an end.
  const parent = new Int32Array(cells + 2).map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  const join = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  const START = cells
  const END = cells + 1
  const added = new Uint8Array(cells)
  const order = [...free].sort((a, b) => clearance[b]! - clearance[a]!)
  for (const i of order) {
    added[i] = 1
    const cx = i % columns
    const cy = Math.floor(i / columns)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue
        const j = ny * columns + nx
        if (added[j]) join(i, j)
      }
    }
    if (starts.has(i)) join(i, START)
    if (ends.has(i)) join(i, END)
    if (find(START) !== find(END)) continue

    // The width taken from the plan where the grid found the way narrowest, or, where the line
    // across from there runs off (into a recess, say), from a point of the grid beside it.
    let found = acrossAt(centre(i), clearance[i]!, step, obstacles, polygon, holes, fixtures)
    for (let dy = -1; dy <= 1 && !found.fromPlan; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= columns || ny >= rows || clearance[ny * columns + nx]! < 0) continue
        const beside = acrossAt(centre(ny * columns + nx), clearance[i]!, step, obstacles, polygon, holes, fixtures)
        if (beside.fromPlan && (!found.fromPlan || beside.half > found.half)) found = beside
      }
    }
    const { at, half } = found
    const near = obstacles.filter((o) => distanceToSegment(at, o.segment) <= half + (found.fromPlan ? contact : step))
    const owners = new Set(near.map((o) => o.owner))
    const fixtureIds = fixtures.filter((f) => owners.has(f.id)).map((f) => f.id)
    const width = 2 * half
    const narrowMouth = Math.min(...mouths.map(([a, b]) => length(sub(b, a))), Infinity)
    const atDoorway = fixtureIds.length === 0 && mouths.some((m) => distanceToSegment(at, m) <= 2 * step) && width >= narrowMouth - 2 * step
    return { width, at, beside: { fixtures: fixtureIds, wall: near.some((o) => o.owner === null) }, atDoorway, step }
  }
  return null
}

/** A point as a mouth: where a way starts or ends inside a room. */
export function pointMouth(p: Vec2): Segment {
  return [p, p]
}

/** The fixtures of a list by id, named in a sentence (`itemName`), in the list's order. */
export function fixtureNames(items: readonly Item[], ids: readonly string[]): string[] {
  const wanted = new Set(ids)
  return items.filter((item) => wanted.has(item.id)).map(itemName)
}

// ── What is worth a look ─────────────────────────────────────────────────────────────────────

/** A line about a fixture that names the opening it stands in front of (`hits`, as a door sweep names what it hits). */
export interface ItemUseIssue extends Issue {
  readonly hits: readonly string[]
}

/** A length in metres, as a figure: the sentence writes the unit. */
const m = (value: number): Value => num(metresText(value))

/**
 * The drawing's use checks on the fixtures (CNT-13), both worth a look: a fixture standing in
 * front of a doorway, within `useApproachDepth` of its hole (`item/blocks-doorway`), and one
 * higher than a window's sill standing in front of it (`item/blocks-window`). Each says what it
 * measured and with what depth, as an indicator. Fixtures and openings already left out are
 * skipped; the lines come in the order of the fixtures, then of the openings.
 */
export function itemUseIssues(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>): ItemUseIssue[] {
  const items = (plan.items ?? []).filter((item) => !broken.has(item.id) && isItemKind(item.kind))
  if (items.length === 0) return []
  const depth = limit('useApproachDepth')
  const found: { item: number; opening: number; issue: ItemUseIssue }[] = []
  const measured = said('issue.part.approach', { depth: m(depth) })
  const say = (item: Item, opening: Opening, code: string, sentence: Said): void => {
    found.push({
      item: items.indexOf(item),
      opening: plan.openings.indexOf(opening),
      issue: withSaid({ entity: 'item', id: item.id, code, message: english(sentence), severity: 'warning', hits: [opening.id] }, sentence)
    })
  }
  for (const opening of plan.openings) {
    if (broken.has(opening.id)) continue
    const wall = index.wallsById.get(opening.wall)
    if (wall === undefined || broken.has(wall.id) || wall.virtual === true) continue
    const floor = floorOf(wall)
    const here = items.filter((item) => floorOf(item) === floor)
    if (here.length === 0) continue
    const obstacles = here.map((item) => ({ id: item.id, outline: itemFootprint(item), height: item.height }))
    if (opening.type === 'window') {
      for (const by of windowCover(wall, opening, obstacles).by) {
        const item = here.find((i) => i.id === by.id)!
        say(
          item,
          opening,
          'item/blocks-window',
          said('issue.item/blocks-window', {
            item: itemNounSaid(item),
            height: m(item.height),
            window: name(opening.id),
            sill: m(opening.sill),
            covers: m(by.covers),
            width: m(opening.width),
            measured
          })
        )
      }
      continue
    }
    const all = doorwayClearance(wall, opening, obstacles)
    for (const id of all.narrowedBy) {
      const item = here.find((i) => i.id === id)!
      const alone = doorwayClearance(wall, opening, obstacles.filter((o) => o.id === id))
      const leaf = all.leaf > 0 ? said('issue.item/blocks-doorway.leaf', { leaf: m(all.leaf) }) : ''
      say(
        item,
        opening,
        'item/blocks-doorway',
        said('issue.item/blocks-doorway', {
          item: itemNounSaid(item),
          front: said(`issue.part.inFrontOf.${opening.type}`, { id: name(opening.id) }),
          covered: m(alone.covered),
          width: m(opening.width),
          clear: m(all.clear),
          leaf,
          measured
        })
      )
    }
  }
  return found.sort((a, b) => a.item - b.item || a.opening - b.opening).map((f) => f.issue)
}
