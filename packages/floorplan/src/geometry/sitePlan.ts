/**
 * VEW-85: what a site plan draws: the plot seen from above with every building of the plan on it.
 *
 * - The plot and its things are the ground floor's (`planSite`): the boundary, its street edges and
 *   the fences, gates, paths, paving, trees and pools, each with the label the person gave it.
 * - Every building is drawn by its footprint, as `siteMeasures` works it out: on a plan that names
 *   buildings each one's own (its floors at or above its own ground floor, open outdoor space left
 *   out), and the floors in no building as one more; on a plan that names none, the one footprint.
 *   Each comes with its name, its storeys above and below the ground and its height
 *   (`buildingHeights`, `planStoreys`, `buildingHeight`), and the point its words are written at,
 *   the middle of its largest piece (`poleOfInaccessibility`). A building whose floors close no
 *   outline is listed with why, and not drawn.
 * - A set-back line runs inside the plot, parallel to its edge, at the person's own figure (C13's
 *   `setbacks`), ending where it meets the next edge's line (or the boundary, where that edge has no
 *   set-back). Grid adds no figure of its own.
 * - Each street edge comes with the way out of the plot, so the street's word is written outside it.
 * - The context shapes round the plan on the floors the site is drawn on (a neighbour's house).
 * - The frame holds the plot, every building, every thing and the context, so a plan of many
 *   buildings is never framed to one of them.
 *
 * Pure: a plan in, plain data out. Never throws on a plan the schema reads.
 */
import { boundaryEdgeCount } from '../types/floorplan'
import { contextOn, planBuildings } from './buildings'
import { computeBounds, type Bounds } from './floorplan'
import { wholePlan } from './floors'
import { poleOfInaccessibility } from './innerPoint'
import type { FloorPlan } from './plan'
import { planSite, plotBoundary, siteExtent, type BoundaryEdge, type PlanSite } from './plot'
import { piecesAsRings } from './polygons'
import { siteFloors, siteMeasures, type Footprint } from './site'
import { buildingHeight, buildingHeights, planStoreys } from './storeys'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'

/** One building as a site plan draws it. */
export interface SitePlanBuilding {
  /** Its id; empty for the floors in no building the plan names, and for a plan that names none. */
  readonly id: string
  /** Its name as the plan gives it; null for the floors in no building, and for a plan that names none. */
  readonly name: string | null
  /** Its footprint's pieces, each an outline and its holes, in plan metres. Empty when it has none (`why`). */
  readonly pieces: readonly { readonly outline: readonly Vec2[]; readonly holes: readonly (readonly Vec2[])[] }[]
  /** Its area seen from above, m²; null with no footprint. */
  readonly area: number | null
  /** Its storeys at or above its ground floor, and under it. */
  readonly storeys: { readonly above: number; readonly below: number }
  /** From its ground to the top of its highest roof, m; null when none of its floors holds anything. */
  readonly height: number | null
  /** Where its words are written: the middle of its largest piece. Null with no footprint. */
  readonly labelAt: Vec2 | null
  /** Why it has no footprint, in English; null when it has one. */
  readonly why: string | null
}

/** A set-back line: the edge it is from, the person's figure, and the line inside the plot. */
export interface SetbackLine {
  readonly edge: number
  readonly distance: number
  readonly from: Vec2
  readonly to: Vec2
}

/** A street edge, with the unit normal pointing out of the plot, toward the street. */
export interface SiteStreet {
  readonly edge: number
  readonly from: Vec2
  readonly to: Vec2
  readonly outward: Vec2
  /** The way it faces, by the plan's north (the top of the drawing when it states none). */
  readonly faces: BoundaryEdge['faces']
  /** VEW-88: the street's name, as the plan gives it; null when it gives none. */
  readonly name: string | null
}

/** Everything a site plan draws, in plan metres. */
export interface SitePlan {
  /** The plot and its things; null when the plan states neither. */
  readonly site: PlanSite | null
  /** The plot's area, m²; null with no sound boundary. */
  readonly plotArea: number | null
  readonly buildings: readonly SitePlanBuilding[]
  readonly setbacks: readonly SetbackLine[]
  readonly streets: readonly SiteStreet[]
  readonly context: readonly { readonly id: string; readonly name: string | null; readonly points: readonly Vec2[] }[]
  /** The plan's north as a turn in radians counter-clockwise from the top of the drawing; null when it states none. */
  readonly north: { readonly turn: number } | null
  /** Round everything drawn; null when there is nothing to draw. */
  readonly bounds: Bounds | null
}

const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x

/** Where the line through `p` along `d` meets the line through `q` along `e`; null when they are parallel. */
function meet(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denominator = cross(d, e)
  const sine = denominator / (Math.hypot(d.x, d.y) * Math.hypot(e.x, e.y) || 1)
  if (Math.abs(sine) < tolerance('parallel')) return null
  const t = cross({ x: q.x - p.x, y: q.y - p.y }, e) / denominator
  return { x: p.x + d.x * t, y: p.y + d.y * t }
}

/** Each edge's set-back line, moved in by the person's figure and ended at its neighbours' lines. */
function setbackLines(edges: readonly BoundaryEdge[]): SetbackLine[] {
  const shift = (edge: BoundaryEdge): number => edge.setback?.distance ?? 0
  const moved = (edge: BoundaryEdge): { at: Vec2; along: Vec2 } => ({
    at: { x: edge.from.x - edge.outward.x * shift(edge), y: edge.from.y - edge.outward.y * shift(edge) },
    along: { x: edge.to.x - edge.from.x, y: edge.to.y - edge.from.y },
  })
  return edges.flatMap((edge, i): SetbackLine[] => {
    const distance = shift(edge)
    if (!(distance > 0) || !(edge.length > tolerance('noLength'))) return []
    const own = moved(edge)
    const before = moved(edges[(i + edges.length - 1) % edges.length]!)
    const after = moved(edges[(i + 1) % edges.length]!)
    const from = meet(own.at, own.along, before.at, before.along) ?? own.at
    const to = meet(own.at, own.along, after.at, after.along) ?? { x: own.at.x + own.along.x, y: own.at.y + own.along.y }
    return [{ edge: edge.edge, distance, from, to }]
  })
}

/**
 * CMD-56: the plot's set-back lines, as the site plan draws them; none with no sound boundary or no
 * set-back asked for. The DXF writes them on the floor the site is drawn on.
 */
export function planSetbackLines(plan: FloorPlan): SetbackLine[] {
  const boundary = plotBoundary(wholePlan(plan).whole)
  return boundary === null || boundary.problem !== null ? [] : setbackLines(boundary.edges)
}

/** The pieces of a footprint, and the middle of its largest. */
function drawnFootprint(footprint: Footprint): Pick<SitePlanBuilding, 'pieces' | 'area' | 'labelAt'> {
  const pieces = piecesAsRings(footprint.pieces)
  const largest = [...pieces].sort((a, b) => ringArea(b.outline) - ringArea(a.outline))[0]
  return { pieces, area: footprint.area, labelAt: largest === undefined ? null : poleOfInaccessibility(largest.outline, undefined, largest.holes).point }
}

function ringArea(ring: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) sum += cross(ring[i]!, ring[(i + 1) % ring.length]!)
  return Math.abs(sum) / 2
}

/** What a site plan of the plan draws. A slice is read as the plan it was cut from. */
export function sitePlan(given: FloorPlan): SitePlan {
  const { whole: plan } = wholePlan(given)
  const site = planSite(plan)
  const boundary = plotBoundary(plan)
  const sound = boundary !== null && boundary.problem === null ? boundary : null
  const measures = siteMeasures(plan)
  const storeys = planStoreys(plan)
  const named = planBuildings(plan)
  const heights = new Map(buildingHeights(plan, storeys).map((b) => [b.id, b] as const))
  const empty = { pieces: [], area: null, labelAt: null }
  const buildings: SitePlanBuilding[] = measures.buildings === undefined
    ? [{
        id: '',
        name: null,
        ...(measures.footprint === null ? empty : drawnFootprint(measures.footprint)),
        storeys: { above: storeys.above, below: storeys.below },
        height: buildingHeight(plan, storeys)?.height ?? null,
        why: measures.footprint === null ? measures.why : null,
      }]
    : measures.buildings.map((b): SitePlanBuilding => {
        const own = heights.get(b.id)
        const rest = b.rest === true
        const floors = rest ? new Set(storeys.storeys.filter((s) => s.building === null).flatMap((s) => s.floors)) : undefined
        const restStoreys = rest ? storeys.storeys.filter((s) => s.building === null) : []
        return {
          id: b.id,
          name: rest ? null : (named.find((n) => n.id === b.id)?.name ?? b.name),
          ...(b.footprint === null ? empty : drawnFootprint(b.footprint)),
          storeys: rest ? { above: restStoreys.filter((s) => !s.below).length, below: restStoreys.filter((s) => s.below).length } : { above: own?.storeys.above ?? 0, below: own?.storeys.below ?? 0 },
          height: rest ? (buildingHeight(plan, storeys, floors)?.height ?? null) : (own?.height?.height ?? null),
          why: b.why,
        }
      })
  const streets = sound === null ? [] : sound.edges.filter((e) => e.street).map((e): SiteStreet => ({ edge: e.edge, from: e.from, to: e.to, outward: e.outward, faces: e.faces, name: e.streetName }))
  const setbacks = sound === null ? [] : setbackLines(sound.edges)
  const seen = new Set<string>()
  const context = siteFloors(plan).flatMap((floor) => contextOn(plan, floor)).flatMap((shape) => {
    if (seen.has(shape.id)) return []
    seen.add(shape.id)
    const ring = boundaryEdgeCount(shape.points) === shape.points.length ? shape.points : shape.points.slice(0, -1)
    return [{ id: shape.id, name: shape.name ?? null, points: ring.map(([x, y]) => ({ x, y })) }]
  })
  const points: Vec2[] = [
    ...(site === null ? [] : siteExtent(site)),
    ...buildings.flatMap((b) => b.pieces.flatMap((p) => p.outline)),
    ...context.flatMap((c) => c.points),
  ]
  const stated = typeof plan.north === 'number' && Number.isFinite(plan.north) ? plan.north : null
  return {
    site,
    plotArea: sound === null ? null : sound.area,
    buildings,
    setbacks,
    streets,
    context,
    north: stated === null ? null : { turn: (stated * Math.PI) / 180 },
    bounds: points.length === 0 ? null : computeBounds(points),
  }
}
