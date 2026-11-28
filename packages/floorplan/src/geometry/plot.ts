/**
 * BRF-3 (C13): the plot as the plan states it, ready to measure and to draw.
 *
 * `site.boundary` is the plot's outline, its corners in order round it, either way round. Each edge
 * gets its number (edge 1 from the first point to the second), the way it faces out of the plot,
 * read as a compass point by the plan's north (CNT-3; the top of the drawing when it states none,
 * and `northStated` says so), whether it is on a street, and the set-back the person asked for
 * from it: the one asked for that edge, else for the street edges, else for every edge.
 *
 * The site's things (fences, gates, paths, paving, trees, pools) are turned into what a view draws:
 * lines, filled shapes and a tree's crown. No area, check, wall count or storey height reads them.
 *
 * Pure: a plan in, plain data out. No AI, no file, no network.
 */
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { SiteThing, SiteThingKind } from '../types/floorplan'
import type { FloorPlan } from './plan'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import { convexHull, cutOutline, piecesAsRings, strip } from './polygons'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { fromTuple, signedArea } from './vec2'
import { english, joined, said, sayValue, type Said, type Value } from '../messages/say'
import { ringProblem } from './ring'

/** Where a set-back an edge takes was asked for: for that edge, for the street edges, or for every edge. */
export type SetbackFrom = 'edge' | 'street' | 'all'

/** A set-back the person asked for, as one edge takes it. Their figure, never a code's. */
export interface AskedSetback {
  readonly distance: number
  readonly from: SetbackFrom
  /** `given` by the person, `assumed` for them to confirm, or null when the plan does not say. */
  readonly source: 'given' | 'assumed' | null
}

/** One edge of the plot's boundary. */
export interface BoundaryEdge {
  /** Its number: edge 1 runs from the first point to the second. */
  readonly edge: number
  readonly from: Vec2
  readonly to: Vec2
  readonly length: number
  /** The unit normal pointing out of the plot. */
  readonly outward: Vec2
  /** Degrees clockwise from north, as the plan's north reads it (the top of the drawing when it states none). */
  readonly bearing: number
  readonly faces: CompassPoint
  readonly street: boolean
  /** VEW-88: the name of the street it is on, as the plan gives it; null when it gives none. */
  readonly streetName: string | null
  /** How a line names it: `the east boundary`, with its number when another edge faces the same way. */
  readonly name: string
  readonly setback: AskedSetback | null
}

export interface PlotBoundary {
  /** The corners, without a last point that repeats the first. */
  readonly points: readonly Vec2[]
  readonly edges: readonly BoundaryEdge[]
  /** In square metres. */
  readonly area: number
  /** Why nothing is measured from it: it crosses itself or encloses no ground. Null when sound. */
  readonly problem: string | null
  /** Whether the plan states its north: else the ways are read with north as the top of the drawing. */
  readonly northStated: boolean
}

/** One of the site's things, as a view draws it, in plan metres. */
export interface PlanSiteThing {
  readonly id: string
  readonly kind: SiteThingKind
  /** The person's word for it, else its kind's. */
  readonly label: string
  /** Shapes to fill: paving, a pool, a path's strip. Each counter-clockwise, open (not closed back). */
  readonly rings: readonly (readonly Vec2[])[]
  /** Lines to draw: a fence, a gate between its posts. */
  readonly lines: readonly (readonly Vec2[])[]
  /** A tree: its trunk, and its crown's radius when the plan states its canopy. */
  readonly tree: { readonly at: Vec2; readonly radius: number | null } | null
}

/** The site as a view draws it: the boundary, its street edges, and its things. */
export interface PlanSite {
  /** The boundary's corners, closed back to the first by the view; null when the plan states none. */
  readonly boundary: readonly Vec2[] | null
  /** The edges on a street, each from its first point to its second. */
  readonly streets: readonly (readonly [Vec2, Vec2])[]
  readonly things: readonly PlanSiteThing[]
}

/** The words for each kind of thing, in Grid's own words. */
export const SITE_THING_WORDS: Readonly<Record<SiteThingKind, readonly [string, string]>> = {
  fence: ['fence', 'fences'],
  gate: ['gate', 'gates'],
  path: ['path', 'paths'],
  paving: ['paved area', 'paved areas'],
  tree: ['tree', 'trees'],
  pool: ['pool', 'pools'],
}

const finitePair = (p: readonly [number, number]): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1])

/** The boundary's corners as the plan states them, without a last point that repeats the first. */
function corners(points: readonly (readonly [number, number])[]): Vec2[] {
  const open = points.length > 1 && points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1] ? points.slice(0, -1) : points
  return open.map(fromTuple)
}

export { ringFault, ringProblem, segmentsMeet } from './ring'

/**
 * How a line names an edge of the boundary (MSG-11): `the east boundary`, with its number when
 * another edge of `edges` faces the same way. `BoundaryEdge.name` is its English.
 */
export function boundaryEdgeSaid(edges: readonly Pick<BoundaryEdge, 'faces'>[], edge: Pick<BoundaryEdge, 'edge' | 'faces'>): Said {
  const numbered = edges.filter((e) => e.faces === edge.faces).length > 1
  return said(numbered ? 'check.boundary.edge.numbered' : 'check.boundary.edge', { way: said(`describe.way.${edge.faces}`), edge: edge.edge })
}

/**
 * The plot's boundary, its edges and their set-backs, or null when the plan states no boundary or
 * one with a number Grid cannot use. Never throws.
 */
export function plotBoundary(plan: Pick<FloorPlan, 'site' | 'north' | 'yAxis'>): PlotBoundary | null {
  const site = plan.site
  if (site?.boundary === undefined || !site.boundary.every(finitePair)) return null
  const points = corners(site.boundary)
  const problem = ringProblem(points)
  const orientation = planOrientation(plan)
  const turn = signedArea(points) >= 0 ? 1 : -1
  const streets = new Set(site.streets ?? [])
  const streetNames = new Map((site.streetNames ?? []).map((s) => [s.edge, s.name]))
  const asked = (key: number | 'street' | 'all'): AskedSetback | null => {
    const found = (site.setbacks ?? []).find((s) => s.from === key)
    if (found === undefined) return null
    return { distance: found.distance, from: typeof key === 'number' ? 'edge' : key, source: found.source ?? null }
  }
  const all = asked('all')
  const street = asked('street')
  const raw = points.map((from, i) => {
    const to = points[(i + 1) % points.length]!
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const outward = length === 0 ? { x: 0, y: 0 } : { x: (turn * (to.y - from.y)) / length, y: (-turn * (to.x - from.x)) / length }
    const bearing = bearingOf(outward, orientation, orientation.north ?? 0) ?? 0
    const edge = i + 1
    const onStreet = streets.has(edge)
    return { edge, from, to, length, outward, bearing, faces: compassPoint(bearing), street: onStreet, streetName: onStreet ? (streetNames.get(edge) ?? null) : null, setback: asked(edge) ?? (onStreet ? street : null) ?? all }
  })
  const edges = raw.map((e): BoundaryEdge => ({ ...e, name: english(boundaryEdgeSaid(raw, e)) }))
  return { points, edges, area: Math.abs(signedArea(points)), problem, northStated: orientation.north !== null }
}

/** A path's strip: each stretch of its middle line as wide as the path, the bends filled, joined. */
function pathRings(points: readonly Vec2[], width: number): Vec2[][] {
  const half = width / 2
  const pieces: Polygon[] = []
  const ends: Vec2[][] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length <= tolerance('noLength')) continue
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    const piece = strip(a, dir, length, half, 0, (v) => v)
    pieces.push(piece)
    ends.push(piece[0]!.map(([x, y]) => ({ x, y })))
  }
  // At each bend, the corners of the two stretches' ends round the point they share.
  for (let i = 0; i + 1 < ends.length; i++) {
    const [, b1, b2] = ends[i]!
    const [a1, , , a2] = ends[i + 1]!
    const hull = convexHull([b1!, b2!, a1!, a2!])
    if (hull.length >= 3) pieces.push([hull.map((p): [number, number] => [p.x, p.y])])
  }
  if (pieces.length === 0) return []
  const joined: MultiPolygon | null = cutOutline('union', pieces[0]!, pieces.slice(1))
  return joined === null ? [] : piecesAsRings(joined).map((piece) => piece.outline)
}

/** A ring of corners, counter-clockwise. */
const ccw = (points: readonly Vec2[]): Vec2[] => (signedArea(points) >= 0 ? [...points] : [...points].reverse())

/** One thing as a view draws it, or null when it holds a number Grid cannot use. */
function siteThing(thing: SiteThing): PlanSiteThing | null {
  const base = { id: thing.id, kind: thing.kind, label: thing.label ?? SITE_THING_WORDS[thing.kind][0], rings: [] as Vec2[][], lines: [] as Vec2[][], tree: null }
  const points = (thing.points ?? []).filter(finitePair).map(fromTuple)
  switch (thing.kind) {
    case 'fence':
    case 'gate':
      return points.length >= 2 ? { ...base, lines: [points] } : null
    case 'path':
      return points.length >= 2 && thing.width !== undefined ? { ...base, rings: pathRings(points, thing.width) } : null
    case 'paving':
    case 'pool':
      return points.length >= 3 && Math.abs(signedArea(points)) > tolerance('noArea') ? { ...base, rings: [ccw(points)] } : null
    case 'tree':
      return thing.at !== undefined && finitePair(thing.at) ? { ...base, tree: { at: fromTuple(thing.at), radius: thing.canopy === undefined ? null : thing.canopy / 2 } } : null
  }
}

/** The site as a view draws it, or null when the plan states neither a boundary nor a thing. */
export function planSite(plan: Pick<FloorPlan, 'site' | 'north' | 'yAxis'>): PlanSite | null {
  const boundary = plotBoundary(plan)
  const things = (plan.site?.things ?? []).flatMap((thing) => siteThing(thing) ?? [])
  if (boundary === null && things.length === 0) return null
  return {
    boundary: boundary === null ? null : boundary.points,
    streets: boundary === null ? [] : boundary.edges.filter((e) => e.street).map((e) => [e.from, e.to] as const),
    things,
  }
}

/** Every point the site reaches, for framing a view: a tree by its crown's box. */
export function siteExtent(site: PlanSite): Vec2[] {
  const points: Vec2[] = [...(site.boundary ?? [])]
  for (const thing of site.things) {
    for (const ring of thing.rings) points.push(...ring)
    for (const line of thing.lines) points.push(...line)
    if (thing.tree !== null) {
      const { at, radius } = thing.tree
      const r = radius ?? 0
      points.push({ x: at.x - r, y: at.y - r }, { x: at.x + r, y: at.y + r })
    }
  }
  return points
}

/**
 * How many things of each kind the site holds, in `SITE_THING_WORDS` order, as a sentence by its
 * keys (MSG-11, `line.part.siteThing.*`): `1 fence, 3 trees and 1 pool`.
 */
export function siteThingsSaid(things: readonly Pick<SiteThing, 'kind'>[]): Value {
  const counts = (Object.keys(SITE_THING_WORDS) as SiteThingKind[])
    .map((kind) => [kind, things.filter((t) => t.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]): Value => said(`line.part.siteThing.${kind}.${count === 1 ? 'one' : 'many'}`, { count }))
  return joined(counts, 'join.comma', 'join.and')
}

/** How many things of each kind the site holds, in English: `1 fence, 3 trees and 1 pool`. */
export function siteThingsText(things: readonly Pick<SiteThing, 'kind'>[]): string {
  return sayValue('en', siteThingsSaid(things))
}
