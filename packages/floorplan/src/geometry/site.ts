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
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import type { MultiPolygon } from 'polygon-clipping'
import { floorElevations } from './elevations'
import { planFloors } from './floors'
import { groundLevel } from './ground'
import { slabOutline, outlineKnown } from './outline'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import type { FloorPlan, PlanIndex } from './plan'
import { indexPlan } from './plan'
import { buildingPlan, isOutdoor, outdoorRoofed, planHasOutdoor } from './outdoor'
import { plotBoundary, type BoundaryEdge, type PlotBoundary } from './plot'
import { cutOutline, multiArea, piecesAsRings, ringOf } from './polygons'
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
  readonly distance: number
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

function measureFrom(plan: FloorPlan, boundary: PlotBoundary, footprint: Footprint, outlines: Outlines): Measured {
  const pieces = footprint.pieces
  const plot = [ringOf(boundary.points)]
  const segments = outlineSegments(pieces).flat()
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
        face = i + 1
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
  const faces = segments.map((s, i): FootprintFace => {
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
    if (distance === Infinity) {
      for (const e of boundary.edges) {
        const d = segmentDistance(s, { a: e.from, b: e.to })
        if (d < distance) {
          distance = d
          edge = e.edge
        }
      }
    }
    return { face: i + 1, from: s.a, to: s.b, length, faces: compassPoint(bearingOf(outward, orientation, orientation.north ?? 0) ?? 0), edge, distance }
  })
  return { edges, faces, coverage: boundary.area > 0 && covered !== null ? covered / boundary.area : null, covered }
}

/** The footprint of `plan` as its floors' outlines join, or why it has none. */
function footprintOf(plan: FloorPlan, broken: ReadonlySet<string>): { footprint: Footprint; outlines: Outlines } | { why: Said } {
  const outlines: { floor: string; pieces: MultiPolygon }[] = []
  const unknown: Said[] = []
  for (const floor of footprintFloors(plan)) {
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
      const { outdoor: _outdoor, ...rest } = room
      return rest
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
  if (boundary === null || boundary.problem !== null) return { ...none, footprint, why: null }
  const measured = measureFrom(enclosed, boundary, footprint, outlines)
  let withOpen: OpenOutdoorMeasures | null = null
  if (enclosed !== plan) {
    const whole = footprintOf(plan, broken)
    if (!('why' in whole)) withOpen = { footprint: whole.footprint, ...measureFrom(plan, boundary, whole.footprint, whole.outlines) }
  }
  return { boundary, footprint, why: null, ...measured, withOpen }
}
