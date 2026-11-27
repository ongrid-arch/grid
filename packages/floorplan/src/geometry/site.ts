/**
 * BRF-3 (C13, lab EL-16): how far the building stands from each edge of its plot, and how much of
 * the plot it covers.
 *
 * The building is measured from its outside face as one shape: the footprint. It is LVL-4's slab
 * outline of every floor (`slabOutline`, joined as ARE-9's gross external area is), for every
 * floor at or above the ground floor (`groundLevel`), joined into one shape seen from above. A
 * floor below the ground floor, a basement, is under the ground and is left out; a floor above
 * that reaches out past the one below counts where it reaches. A floor whose walls close no
 * floor adds nothing.
 *
 * - ARE-24: open outdoor space (a terrace, a pool deck, a garden, a balcony) is no building, as it
 *   is in no area: it is left out of the footprint, and `withOpen` is the same measured with it in.
 *   A roofed outdoor space (a porch, a carport) is part of the building.
 * - An edge's distance is the least distance, in plan metres, from the footprint to that edge of
 *   the boundary (`plotBoundary`), as a tape between the two nearest points measures it, with the
 *   face nearest the edge named: what a set-back is set against.
 * - A face's distance is to the edge of the boundary in front of it, as a tape held square to the
 *   face measures it: the nearest edge any part of which lies square in front of the face.
 * - The plot coverage is the footprint's area inside the boundary, against the boundary's area.
 * - A set-back is the person's figure (`site.setbacks`): a distance more than `setbackShort`
 *   under it is said with both figures. Grid applies no figure of its own and never says a
 *   distance is enough.
 * - A footprint reaching more than `pastBoundary` past an edge is said to stand over it.
 *
 * - LVL-23: on a plan that names buildings, each is also measured on its own (`buildings`): its
 *   footprint, from its own floors at or above its own ground floor, and its distance to each edge.
 * - CNT-56: on such a plan each building's faces are measured on their own, and a face's tape,
 *   square to it, stops at the first other building in front of it (`stops`, `at`), the edge
 *   beyond named (`toEdge`); the site's faces are the buildings' faces and each edge names the
 *   building nearest it. The floors in no named building are one more building (`rest`). Each
 *   pair of buildings is measured apart (`apart`). A run of the outline's straight pieces that is
 *   one curved wall's outside face (within `curveFit` of it) is one face, reported once (`curve`).
 *
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import type { MultiPolygon } from 'polygon-clipping'
import { floorElevations } from './elevations'
import { planFloors } from './floors'
import { groundLevel } from './ground'
import { planBuildings } from './buildings'
import { slabOutline, outlineKnown } from './outline'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import type { FloorPlan, PlanIndex } from './plan'
import { indexPlan } from './plan'
import { buildingPlan, isOutdoor, outdoorRoofed, planHasOutdoor } from './outdoor'
import { plotBoundary, type BoundaryEdge, type PlotBoundary } from './plot'
import { cutOutline, multiArea, piecesAsRings, ringOf } from './polygons'
import { wallCurve, type WallCurve } from './arc'
import { floorOf } from './floors'
import { tolerance } from './tolerances'
import { validatePlan } from './validate'
import type { Vec2 } from './vec2'
import { english, joined, said, type Said } from '../messages/say'

/** The building seen from above: its outside face, every floor at or above the ground floor. */
export interface Footprint {
  readonly pieces: MultiPolygon
  /** In square metres. */
  readonly area: number
  /** The floors it is made of, by id, in plan order. */
  readonly floors: readonly string[]
}

/** One face of the footprint: a straight stretch of its outside. */
export interface FootprintFace {
  /** Its number, round the footprint's outline from its first corner. */
  readonly face: number
  readonly from: Vec2
  readonly to: Vec2
  readonly length: number
  readonly faces: CompassPoint
  /** The edge of the boundary nearest it, by number, and how far it is. */
  readonly edge: number
  /** CNT-56: how far the tape square to it runs: to the edge in front, or to the first other building on the way. */
  readonly distance: number
  /** CNT-56: the building it is a face of, by id; only on a plan that names buildings. */
  readonly building?: string
  /** CNT-56: what the tape stops at: the edge in front of the face, or another building first. */
  readonly stops: 'edge' | 'building'
  /** CNT-56: the building it stops at, by id; null when it reaches the edge. */
  readonly at: string | null
  /** CNT-56: how far the edge in front lies, past any building on the way; null when no edge lies square in front. */
  readonly toEdge: number | null
  /** CNT-56: a curved face, one face for the straight pieces its outline is drawn with; null for a straight one. */
  readonly curve: FaceCurve | null
}

/** CNT-56: a curved face of the footprint. */
export interface FaceCurve {
  /** The radius of its outside face, m. */
  readonly radius: number
  /** The straight pieces it is drawn with. */
  readonly pieces: number
  /** Whether it goes all the way round: a round building. */
  readonly closed: boolean
  /** The ways its first and last pieces face. */
  readonly from: CompassPoint
  readonly to: CompassPoint
}

/** How far the building stands from one edge of the boundary. */
export interface EdgeDistance {
  readonly edge: BoundaryEdge
  /** The least distance from the footprint to the edge, in metres: 0 when it reaches the edge. */
  readonly distance: number
  /** The face of the footprint nearest the edge, by number. */
  readonly face: number
  /** The floor whose outline comes nearest the edge. */
  readonly floor: string
  /** How far the footprint reaches past the edge, out of the plot, in metres; 0 when it does not. */
  readonly past: number
  /** How far short of the set-back asked for the distance falls, in metres; null when it does not, or none was asked. */
  readonly short: number | null
  /** CNT-56: on the site of a plan that names buildings, the building nearest the edge, by id. */
  readonly building?: string
}

export interface SiteMeasures {
  /** Null when the plan states no boundary. */
  readonly boundary: PlotBoundary | null
  /** Null when no floor's walls close a floor, or the outline could not be worked out (`why`). */
  readonly footprint: Footprint | null
  /** Why there is no footprint, in a sentence; null when there is one. */
  readonly why: string | null
  /**
   * MSG-11: the same, by its key (`check.siteWhy.*`), so a line says it in any language; null when
   * there is a footprint. Not enumerable, so the measures compare and print as before.
   */
  readonly whySaid?: Said | null
  /** Each edge of the boundary, in order, when the boundary is sound and there is a footprint. */
  readonly edges: readonly EdgeDistance[]
  /** Each face of the footprint, in order round each piece. */
  readonly faces: readonly FootprintFace[]
  /** The footprint's area inside the boundary against the boundary's, from 0 to 1; null when either is missing. */
  readonly coverage: number | null
  /** The footprint's area inside the boundary, m². */
  readonly covered: number | null
  /**
   * ARE-24: the same measured with the plan's open outdoor space (a terrace, a pool deck, a garden)
   * counted as building; null when the plan has none or it changes nothing, or no boundary is
   * sound. The fields above are the enclosed building, open outdoor space left out.
   */
  readonly withOpen: OpenOutdoorMeasures | null
  /**
   * LVL-23: each building the plan names, measured on its own: its footprint (its own floors at or
   * above its own ground floor) and its distance to each edge. Only on a plan that names buildings.
   */
  readonly buildings?: readonly BuildingSite[]
  /** CNT-56: the least distance between each pair of buildings with a footprint, in plan order; only on a plan that names buildings. */
  readonly apart?: readonly BuildingsApart[]
}

/** CNT-56: how far two buildings stand apart, seen from above: 0 when they touch or overlap. */
export interface BuildingsApart {
  readonly a: string
  readonly b: string
  readonly distance: number
}

/** LVL-23: one building of the plan on its site. */
export interface BuildingSite {
  readonly id: string
  readonly name: string
  /** Null when its floors close no floor, or their outline could not be worked out (`why`). */
  readonly footprint: Footprint | null
  readonly why: string | null
  /** Each edge of the boundary, when the boundary is sound and it has a footprint. */
  readonly edges: readonly EdgeDistance[]
  /** CNT-56: each of its faces, its tape stopping at the first other building. */
  readonly faces: readonly FootprintFace[]
  /** CNT-56: its footprint inside the boundary against the boundary's area, and that area; null when either is missing. */
  readonly coverage: number | null
  readonly covered: number | null
  /** CNT-56: the floors in no building the plan names, measured as one more building (its id is empty). */
  readonly rest?: true
}

/** ARE-24: the site measured with the open outdoor space in the footprint. */
export interface OpenOutdoorMeasures {
  readonly footprint: Footprint
  readonly edges: readonly EdgeDistance[]
  readonly faces: readonly FootprintFace[]
  readonly coverage: number | null
  readonly covered: number | null
}

export interface SiteOptions {
  readonly index?: PlanIndex
  /** Ids the drawing's checks mark as broken; worked out with `validatePlan` when not given. */
  readonly broken?: ReadonlySet<string>
}

/** The floors the footprint is made of: every floor not below the ground floor (all, when no floor stands at the ground). */
export function footprintFloors(plan: FloorPlan): string[] {
  const floors = planFloors(plan)
  const ground = groundLevel(plan, floorElevations(plan))
  if (ground.groundFloors.length === 0) return floors.map((f) => f.id)
  const lowest = Math.min(...ground.groundFloors.map((f) => ground.above.get(f.id) ?? 0))
  return floors.filter((f) => (ground.above.get(f.id) ?? 0) >= lowest - tolerance('sameFloorLevel')).map((f) => f.id)
}

/** The floors the site is drawn on: the ground floors, or the lowest floor when none stands at the ground. */
export function siteFloors(plan: FloorPlan): string[] {
  const floors = planFloors(plan)
  const ground = groundLevel(plan, floorElevations(plan)).groundFloors
  if (ground.length > 0) return ground.map((f) => f.id)
  return floors.length === 0 ? [] : [[...floors].sort((a, b) => a.level - b.level)[0]!.id]
}

interface Segment {
  readonly a: Vec2
  readonly b: Vec2
}

function pointToSegment(p: Vec2, s: Segment): number {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2))
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy))
}

/** Whether two segments cross. */
function cross(s: Segment, t: Segment): boolean {
  const o = (a: Vec2, b: Vec2, c: Vec2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = o(t.a, t.b, s.a)
  const d2 = o(t.a, t.b, s.b)
  const d3 = o(s.a, s.b, t.a)
  const d4 = o(s.a, s.b, t.b)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** The least distance between two segments. */
export function segmentDistance(s: Segment, t: Segment): number {
  if (cross(s, t)) return 0
  return Math.min(pointToSegment(s.a, t), pointToSegment(s.b, t), pointToSegment(t.a, s), pointToSegment(t.b, s))
}

/**
 * How far the part of `edge` square in front of `face` lies from it, along the face's outward
 * normal `out`, as a tape held square to the face measures it; null when no part of the edge is in
 * front of the face.
 */
function squareDistance(face: Segment, out: Vec2, edge: Segment): number | null {
  const length = Math.hypot(face.b.x - face.a.x, face.b.y - face.a.y)
  if (length === 0) return null
  const u = { x: (face.b.x - face.a.x) / length, y: (face.b.y - face.a.y) / length }
  const along = (p: Vec2): number => (p.x - face.a.x) * u.x + (p.y - face.a.y) * u.y
  const ahead = (p: Vec2): number => (p.x - face.a.x) * out.x + (p.y - face.a.y) * out.y
  // The edge as p(s) = a + s (b - a), s from 0 to 1, clipped to 0 <= along <= length and ahead >= 0.
  let lo = 0
  let hi = 1
  const clip = (f0: number, f1: number, min: number, max: number): boolean => {
    const d = f1 - f0
    if (Math.abs(d) <= tolerance('noLength')) return f0 >= min - tolerance('noLength') && f0 <= max + tolerance('noLength')
    let s0 = (min - f0) / d
    let s1 = (max - f0) / d
    if (s0 > s1) [s0, s1] = [s1, s0]
    lo = Math.max(lo, s0)
    hi = Math.min(hi, s1)
    return lo <= hi
  }
  if (!clip(along(edge.a), along(edge.b), 0, length)) return null
  if (!clip(ahead(edge.a), ahead(edge.b), 0, Infinity)) return null
  const at = (t: number): number => ahead({ x: edge.a.x + t * (edge.b.x - edge.a.x), y: edge.a.y + t * (edge.b.y - edge.a.y) })
  return Math.min(at(lo), at(hi))
}

/** The straight stretches of a footprint's outlines, piece by piece; holes are courtyards and are left out. */
function outlineSegments(pieces: MultiPolygon): Segment[][] {
  return piecesAsRings(pieces).map(({ outline }) => outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length]! })))
}

/** What is measured from one footprint: each edge, each face and the coverage. */
interface Measured {
  readonly edges: readonly EdgeDistance[]
  readonly faces: readonly FootprintFace[]
  readonly coverage: number | null
  readonly covered: number | null
}

type Outlines = readonly { floor: string; pieces: MultiPolygon }[]

/** CNT-56: another building a face's tape may stop at: its id and its outline's stretches. */
interface Stop {
  readonly id: string
  readonly segments: readonly Segment[]
}

/** CNT-56: a curved wall a stretch of the outline may lie on: its arc and how far off it its faces reach. */
interface Arc {
  readonly curve: WallCurve
  readonly reach: number
}

const TURN = 2 * Math.PI

/** Whether a point lies on a curved wall's body, `curveFit` past its faces, within its sweep. */
function onArc(p: Vec2, arc: Arc): boolean {
  const { curve } = arc
  const r = Math.hypot(p.x - curve.centre.x, p.y - curve.centre.y)
  if (Math.abs(r - curve.radius) > arc.reach) return false
  if (curve.closed) return true
  const way = Math.sign(curve.sweep)
  const turned = ((((Math.atan2(p.y - curve.centre.y, p.x - curve.centre.x) - curve.startAngle) * way) % TURN) + TURN) % TURN
  // A face's corner may stand past the wall's end by as much as its faces reach off its line.
  const past = arc.reach / Math.max(curve.radius, arc.reach)
  return turned <= Math.abs(curve.sweep) + past || turned >= TURN - past
}

/** The curved walls of the floors a footprint is made of. */
function arcsOf(plan: FloorPlan, floors: readonly string[]): Arc[] {
  const on = new Set(floors)
  return plan.walls.flatMap((wall) => {
    if (wall.arc === undefined || !on.has(floorOf(wall))) return []
    const curve = wallCurve(wall)
    return curve === null ? [] : [{ curve, reach: wall.thickness / 2 + tolerance('curveFit') }]
  })
}

/** CNT-56: a face of the outline: the stretches that make it, by their place in the outline's list. */
interface FaceGroup {
  /** Each stretch, by its index in the flat list of every ring's stretches, in order along the face. */
  readonly parts: readonly number[]
  readonly closed: boolean
  /** The curved wall it lies on; null for a straight face. */
  readonly arc: Arc | null
}

/**
 * CNT-56: the stretches of the outline that make each face: a straight one alone, or the
 * stretches in a row on one curved wall's outside together, however many pieces and joints its
 * outline is drawn with.
 */
function faceGroups(rings: readonly Segment[][], arcs: readonly Arc[]): FaceGroup[] {
  const groups: FaceGroup[] = []
  let base = 0
  for (const ring of rings) {
    const n = ring.length
    const label = ring.map((s) => {
      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
      return arcs.findIndex((arc) => onArc(s.a, arc) && onArc(s.b, arc) && onArc(mid, arc))
    })
    if (n > 0 && label[0]! >= 0 && label.every((l) => l === label[0])) {
      groups.push({ parts: ring.map((_, i) => base + i), closed: true, arc: arcs[label[0]!]! })
      base += n
      continue
    }
    // Start where a curve does not carry on from the stretch before, so a curve across the
    // ring's first corner stays one face.
    const start = Math.max(0, label.findIndex((l, i) => l < 0 || l !== label[(i + n - 1) % n]))
    const here: { first: number; group: FaceGroup }[] = []
    let k = 0
    while (k < n) {
      const i = (start + k) % n
      const l = label[i]!
      const parts = [base + i]
      k++
      while (l >= 0 && k < n && label[(start + k) % n] === l) {
        parts.push(base + ((start + k) % n))
        k++
      }
      here.push({ first: i, group: { parts, closed: false, arc: l >= 0 ? arcs[l]! : null } })
    }
    groups.push(...here.sort((x, y) => x.first - y.first).map((h) => h.group))
    base += n
  }
  return groups
}

/** CNT-56: the radius of a curved face: its stretches' ends' mean distance from the curve's centre. */
function faceRadius(stretches: readonly Segment[], curve: WallCurve): number {
  const points = stretches.flatMap((s) => [s.a, s.b])
  return points.reduce((sum, p) => sum + Math.hypot(p.x - curve.centre.x, p.y - curve.centre.y), 0) / points.length
}

/** CNT-56: how far a curved face turns round its centre, stretch by stretch: radians, a whole turn when closed. */
function turnAlong(stretches: readonly Segment[], curve: WallCurve, closed: boolean): number {
  if (closed) return TURN
  let total = 0
  for (const s of stretches) {
    const u = { x: s.a.x - curve.centre.x, y: s.a.y - curve.centre.y }
    const v = { x: s.b.x - curve.centre.x, y: s.b.y - curve.centre.y }
    total += Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y)
  }
  return Math.abs(total)
}

function measureFrom(plan: FloorPlan, boundary: PlotBoundary, footprint: Footprint, outlines: Outlines, stops: readonly Stop[] = []): Measured {
  const pieces = footprint.pieces
  const plot = [ringOf(boundary.points)]
  const rings = outlineSegments(pieces)
  const segments = rings.flat()
  const groups = faceGroups(rings, arcsOf(plan, footprint.floors))
  // Each stretch's face, by number.
  const faceOf = new Map<number, number>()
  groups.forEach((g, n) => {
    for (const i of g.parts) faceOf.set(i, n + 1)
  })
  const byFloor = outlines.map((o) => ({ floor: o.floor, segments: outlineSegments(o.pieces).flat() }))
  const outside = cutOutline('difference', pieces, [plot]) ?? []
  const outsidePoints = piecesAsRings(outside).flatMap((p) => p.outline)
  const inside = cutOutline('intersection', pieces, [plot])
  const covered = inside === null ? null : multiArea(inside)

  const edges = boundary.edges.map((edge): EdgeDistance => {
    const line: Segment = { a: edge.from, b: edge.to }
    let distance = Infinity
    let face = 0
    segments.forEach((s, i) => {
      const d = segmentDistance(s, line)
      if (d < distance) {
        distance = d
        face = faceOf.get(i) ?? i + 1
      }
    })
    let floor = byFloor[0]!.floor
    let nearest = Infinity
    for (const f of byFloor) {
      for (const s of f.segments) {
        const d = segmentDistance(s, line)
        if (d < nearest) {
          nearest = d
          floor = f.floor
        }
      }
    }
    // How far out of the plot the footprint reaches past this edge: from the outside pieces' corners
    // that lie square in front of the edge.
    const dx = edge.to.x - edge.from.x
    const dy = edge.to.y - edge.from.y
    const len2 = dx * dx + dy * dy
    let past = 0
    for (const p of outsidePoints) {
      const t = len2 === 0 ? 0 : ((p.x - edge.from.x) * dx + (p.y - edge.from.y) * dy) / len2
      if (t < 0 || t > 1) continue
      past = Math.max(past, (p.x - edge.from.x) * edge.outward.x + (p.y - edge.from.y) * edge.outward.y)
    }
    if (past > tolerance('pastBoundary')) distance = 0
    else past = 0
    const asked = edge.setback
    const short = asked !== null && past === 0 && asked.distance - distance > tolerance('setbackShort') ? asked.distance - distance : null
    return { edge, distance, face, floor, past, short }
  })

  const orientation = planOrientation(plan)
  const way = (v: Vec2): CompassPoint => compassPoint(bearingOf(v, orientation, orientation.north ?? 0) ?? 0)
  const pieceFaces = segments.map((s) => {
    const length = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    // Pieces run counter-clockwise, so the outside is to the right of each stretch.
    const outward = length === 0 ? { x: 0, y: 0 } : { x: (s.b.y - s.a.y) / length, y: -(s.b.x - s.a.x) / length }
    // The edge square in front of the face, nearest it; the nearest edge any way when none is.
    let edge = 1
    let distance = Infinity
    for (const e of boundary.edges) {
      const d = squareDistance(s, outward, { a: e.from, b: e.to })
      if (d !== null && d < distance) {
        distance = d
        edge = e.edge
      }
    }
    const toEdge = distance === Infinity ? null : distance
    if (distance === Infinity) {
      for (const e of boundary.edges) {
        const d = segmentDistance(s, { a: e.from, b: e.to })
        if (d < distance) {
          distance = d
          edge = e.edge
        }
      }
    }
    // CNT-56: the tape stops at the first other building square in front of the face.
    let at: string | null = null
    let stop = toEdge ?? Infinity
    for (const other of stops) {
      for (const t of other.segments) {
        const d = squareDistance(s, outward, t)
        if (d !== null && d < stop) {
          stop = d
          at = other.id
        }
      }
    }
    return { s, length, outward, edge, distance: at === null ? distance : stop, at, toEdge }
  })
  const faces = groups.map((g, n): FootprintFace => {
    const parts = g.parts.map((i) => pieceFaces[i]!)
    const first = parts[0]!
    const last = parts[parts.length - 1]!
    // The face's figure is its nearest piece's: where the tape is shortest.
    const near = parts.reduce((best, p) => (p.distance < best.distance ? p : best), first)
    const radius = g.arc === null ? null : faceRadius(parts.map((p) => p.s), g.arc.curve)
    // A curved face's length is along its curve, not its jagged outline's joints.
    const length = g.arc === null || radius === null ? parts.reduce((sum, p) => sum + p.length, 0) : radius * turnAlong(parts.map((p) => p.s), g.arc.curve, g.closed)
    const chord = { x: last.s.b.x - first.s.a.x, y: last.s.b.y - first.s.a.y }
    const across = Math.hypot(chord.x, chord.y)
    // A curve faces the way square to its chord, outward; a whole round one, the way of its nearest piece.
    const outward = parts.length === 1 || g.closed || across === 0 ? near.outward : { x: chord.y / across, y: -chord.x / across }
    const curve: FaceCurve | null = g.arc === null ? null : { radius: radius!, pieces: parts.length, closed: g.closed, from: way(first.outward), to: way(last.outward) }
    return {
      face: n + 1,
      from: first.s.a,
      to: g.closed ? first.s.a : last.s.b,
      length,
      faces: way(parts.length === 1 ? first.outward : outward),
      edge: near.edge,
      distance: near.distance,
      stops: near.at === null ? 'edge' : 'building',
      at: near.at,
      toEdge: near.toEdge,
      curve,
    }
  })
  return { edges, faces, coverage: boundary.area > 0 && covered !== null ? covered / boundary.area : null, covered }
}

/** The footprint of `plan` as its floors' outlines join (LVL-23: only the floors `only` holds, when given), or why it has none. */
function footprintOf(plan: FloorPlan, broken: ReadonlySet<string>, only?: ReadonlySet<string>): { footprint: Footprint; outlines: Outlines } | { why: Said } {
  const outlines: { floor: string; pieces: MultiPolygon }[] = []
  const unknown: Said[] = []
  for (const floor of footprintFloors(plan).filter((f) => only === undefined || only.has(f))) {
    const outline = slabOutline(plan, floor, broken)
    // The outline's own reason is English (`outline.ts`), as the other measures give it.
    if (!outlineKnown(outline)) unknown.push(said('check.siteWhy.floor', { floor: JSON.stringify(floor), reason: outline.reason }))
    else if (outline.pieces.length > 0) outlines.push({ floor, pieces: outline.pieces })
  }
  if (unknown.length > 0) return { why: said('check.siteWhy.outline', { floors: joined(unknown, 'join.space') }) }
  if (outlines.length === 0) return { why: said('check.siteWhy.noFloor') }
  const pieces = cutOutline('union', outlines[0]!.pieces, outlines.slice(1).map((o) => o.pieces))
  if (pieces === null || pieces.length === 0) return { why: said('check.siteWhy.notJoined') }
  return { footprint: { pieces, area: multiArea(pieces), floors: outlines.map((o) => o.floor) }, outlines }
}

/**
 * ARE-24: the plan with the open outdoor space (a terrace, a pool deck, a garden: outdoor space
 * with no roof) taken out of the building, as every area leaves it out: the walls that bound it and
 * no room are dropped (`buildingPlan`). A roofed one (a porch, a carport) stays, so it counts.
 * The plan itself, the same object, when nothing is taken out.
 */
function enclosedPlan(plan: FloorPlan): FloorPlan {
  if (!planHasOutdoor(plan)) return plan
  const roofedAsBuilding: FloorPlan = {
    ...plan,
    rooms: plan.rooms.map((room) => {
      if (!isOutdoor(room) || outdoorRoofed(room) !== true) return room
      const rest: Record<string, unknown> = { ...room }
      delete rest['outdoor']
      return rest as unknown as typeof room
    }),
  }
  const built = buildingPlan(roofedAsBuilding, indexPlan(roofedAsBuilding))
  return built.walls.length === plan.walls.length ? plan : built
}

/**
 * How far the building stands from the plot's boundary, face by face and edge by edge, and how
 * much of the plot it covers. The building is the enclosed one: open outdoor space is left out of
 * the footprint, as of every area (ARE-24); `withOpen` is the same measured with it in, null when
 * the plan has none or it changes nothing. Never throws on a plan the schema reads.
 */
export function siteMeasures(plan: FloorPlan, options: SiteOptions = {}): SiteMeasures {
  const boundary = plotBoundary(plan)
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? validatePlan(plan, index, { spaces: false }).broken
  const none = { boundary, edges: [], faces: [], coverage: null, covered: null, withOpen: null }
  const without = (why: Said): SiteMeasures => Object.defineProperty({ ...none, footprint: null, why: english(why) }, 'whySaid', { value: why, enumerable: false })
  const enclosed = enclosedPlan(plan)
  const made = footprintOf(enclosed, broken)
  if ('why' in made) return without(made.why)
  const { footprint, outlines } = made
  const sound = boundary !== null && boundary.problem === null ? boundary : null
  // LVL-23: each building on its own, only on a plan that names some. CNT-56: the floors in no
  // building are one more, and each building's faces stop at the others.
  const listed = planBuildings(plan)
  const held = new Set(listed.flatMap((b) => b.floors))
  const restFloors = footprintFloors(plan).filter((f) => !held.has(f))
  const groups: { id: string; name: string; floors: ReadonlySet<string>; rest: boolean }[] = [
    ...listed.map((b) => ({ id: b.id, name: b.name, floors: new Set(b.floors), rest: false })),
    ...(listed.length > 0 && restFloors.length > 0 ? [{ id: '', name: english(said('site.building.rest')), floors: new Set(restFloors), rest: true }] : []),
  ]
  const owns = groups.map((g) => ({ group: g, own: footprintOf(enclosed, broken, g.floors) }))
  const outlinesOf = new Map(owns.flatMap(({ group, own }) => ('why' in own ? [] : [[group.id, outlineSegments(own.footprint.pieces).flat()] as const])))
  const sites = owns.map(({ group, own }): BuildingSite => {
    const base = { id: group.id, name: group.name, ...(group.rest ? { rest: true as const } : {}) }
    if ('why' in own) return { ...base, footprint: null, why: english(own.why), edges: [], faces: [], coverage: null, covered: null }
    if (sound === null) return { ...base, footprint: own.footprint, why: null, edges: [], faces: [], coverage: null, covered: null }
    const stops = [...outlinesOf].filter(([id]) => id !== group.id).map(([id, segments]) => ({ id, segments }))
    const m = measureFrom(enclosed, sound, own.footprint, own.outlines, stops)
    return { ...base, footprint: own.footprint, why: null, edges: m.edges, faces: m.faces.map((f) => ({ ...f, building: group.id })), coverage: m.coverage, covered: m.covered }
  })
  const apart: BuildingsApart[] = []
  const withOutline = sites.filter((b) => outlinesOf.has(b.id))
  withOutline.forEach((x, i) => {
    for (const y of withOutline.slice(i + 1)) {
      let distance = Infinity
      for (const s of outlinesOf.get(x.id)!) for (const t of outlinesOf.get(y.id)!) distance = Math.min(distance, segmentDistance(s, t))
      apart.push({ a: x.id, b: y.id, distance })
    }
  })
  const buildings = groups.length === 0 ? {} : { buildings: sites, apart }
  if (sound === null) return { ...none, footprint, why: null, ...buildings }
  const whole = measureFrom(enclosed, sound, footprint, outlines)
  // CNT-56: on a plan that names buildings, the site's faces are the buildings' own, and each
  // edge's distance is its nearest building's, named.
  const measured: Measured = groups.length === 0 || sites.some((b) => b.footprint === null)
    ? whole
    : {
        ...whole,
        faces: sites.flatMap((b) => b.faces),
        edges: whole.edges.map((edge) => {
          const nearest = sites
            .map((b) => ({ id: b.id, at: b.edges.find((e) => e.edge.edge === edge.edge.edge)! }))
            .sort((x, y) => (y.at.past - x.at.past) || (x.at.distance - y.at.distance))[0]!
          return { ...nearest.at, building: nearest.id }
        }),
      }
  let withOpen: OpenOutdoorMeasures | null = null
  if (enclosed !== plan) {
    const all = footprintOf(plan, broken)
    if (!('why' in all)) withOpen = { footprint: all.footprint, ...measureFrom(plan, sound, all.footprint, all.outlines) }
  }
  return { boundary, footprint, why: null, ...measured, withOpen, ...buildings }
}
