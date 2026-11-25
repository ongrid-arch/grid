/**
 * BRF-4 (lab FD-1): the person's own site limits against the plan as it is drawn, massing or
 * walls: "how much fits on this plot".
 *
 * Each limit is reported as used, allowed, and met or not, with the rule it was measured by:
 *
 * - plot coverage, the person's `plot_coverage` (brief figures): BRF-3's coverage, the building
 *   seen from above against the plot's area;
 * - floor area ratio, `floor_area_ratio`: the gross area of every floor at or above the ground
 *   floor, by the measure the person names (`MEASURES`, ARE-9), against the plot's area;
 * - building height, `building_height`: `buildingHeight` in the core, ground to the highest roof;
 * - set-backs, the plan's own `site.setbacks` (BRF-3): each edge's least distance;
 * - parking per home, `parking_per_home`: the parking spaces the floors state over the homes
 *   they state (C17).
 *
 * The figures are the person's, never Grid's: an unstated limit is not reported, and no line says
 * a plan is allowed or complies (MSG-3). The agent proposes; Grid counts and optimises nothing.
 *
 * Pure: a plan and the person's figures in, lines and data out.
 */
import {
  buildingHeight,
  footprintFloors,
  MEASURES,
  planAreaFigures,
  planFloors,
  planStoreys,
  siteMeasures,
  usualGross,
  type FloorPlan,
  type GrossMeasure,
  type PlanStoreys,
} from '@ongrid/floorplan/geometry'
import { countryOf } from '@ongrid/floorplan/types/places'
import type { Display } from '@ongrid/floorplan/types/units'
import { FIGURES, type FigureName, type FigureWish, type RatioMeasure } from '../brief/brief'
import { areaText, lengthText } from './units'

/** The limits, in the order they are reported. */
export const LIMITS = ['plot_coverage', 'floor_area_ratio', 'building_height', 'setback', 'parking_per_home'] as const
export type LimitName = (typeof LIMITS)[number]

/** How a limit stands: met, not met, or not measured (with why). */
export type LimitState = 'met' | 'missed' | 'not-measured'

export interface SiteLimit {
  readonly limit: LimitName
  /** For a set-back: the edge it is from, by number. */
  readonly edge: number | null
  readonly state: LimitState
  /** What the plan uses, in `unit`; null when it was not measured. */
  readonly used: number | null
  /** The person's figure. */
  readonly allowed: number
  /** Whether `allowed` is a most (true) or a least (false). */
  readonly most: boolean
  readonly unit: string
  /** How it was measured, naming the area rule where there is one. */
  readonly rule: string
  /** Why it was not measured; null when it was. */
  readonly why: string | null
  /** What was assumed in measuring it, for the person to confirm; null when nothing was. */
  readonly assumed: string | null
  /** Where the figure came from: the person (`given`) or the one who wrote it down (`assumed`); null when a set-back does not say. */
  readonly source: 'given' | 'assumed' | null
  readonly text: string
}

/** The rule each limit is measured by, said with every answer. */
export const LIMITS_RULE =
  'Site limits are the person\'s own figures, never a code\'s: Grid measures the plan as drawn against each one, says what is used, the limit and met or not, and brings no figure of its own and no better layout. '
  + 'Coverage and the floor area ratio are over the plot\'s area inside its boundary; the floors counted are every floor at or above the ground floor; parking per home counts what the floors state.'

const SITE_FIGURES: readonly FigureName[] = ['plot_coverage', 'floor_area_ratio', 'building_height', 'parking_per_home']

/** Whether a brief figure is a site limit (BRF-4), measured here rather than room by room. */
export const isSiteFigure = (figure: FigureName): boolean => FIGURES[figure].site

const settle = (value: number): number => Number(value.toPrecision(12))
const round = (value: number, places: number): number => Math.round(settle(value * 10 ** places)) / 10 ** places + 0
const fixed = (value: number, places: number): string => round(value, places).toFixed(places)
/** A figure as the person wrote it. */
const asWritten = (value: number): string => String(value)

/** The gross measure a ratio is set by: as the person named it, else the usual one for the place, else gross external. */
function ratioMeasure(plan: FloorPlan, named: RatioMeasure | null): { measure: GrossMeasure; assumed: string | null } {
  if (named !== null) return { measure: named === 'gross_internal' ? 'grossInternal' : 'grossExternal', assumed: null }
  const place = plan.site?.country === undefined ? null : countryOf(plan.site.country)
  const usual = place === null ? null : usualGross(place.code)
  if (usual !== null) return { measure: usual, assumed: `the ratio names no measure, so ${MEASURES[usual].name.toLowerCase()}, the one usual for ${place!.name}, is used; ask the person which their figure is set by` }
  return { measure: 'grossExternal', assumed: 'the ratio names no measure and Grid has none usual for the plan\'s place, so gross external area is used; ask the person which their figure is set by' }
}

interface Measured {
  readonly used: number | null
  readonly unit: string
  readonly rule: string
  readonly why: string | null
  readonly assumed: string | null
}

/**
 * Each site limit the person gave (`figures`, the brief's own figures) and each set-back the plan
 * asks for (`site.setbacks`), against the plan. Limits the person did not give are not reported.
 */
export function siteLimits(plan: FloorPlan, figures: readonly FigureWish[], display: Display): SiteLimit[] {
  const site = siteMeasures(plan)
  const plot = site.boundary !== null && site.boundary.problem === null ? site.boundary.area : null
  const A = (v: number): string => areaText(v, display)
  const L = (v: number): string => lengthText(v, display)
  const noPlot = site.boundary === null ? 'the site states no boundary (site.boundary), so there is no plot area to measure against' : 'the site\'s boundary is not one closed shape, so there is no plot area to measure against'
  const upper = new Set(footprintFloors(plan))
  const names = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
  let storeys: PlanStoreys | null = null
  const storeysOnce = (): PlanStoreys => (storeys ??= planStoreys(plan))

  const measure = (wish: FigureWish): Measured => {
    if (wish.figure === 'plot_coverage') {
      const rule = 'the building seen from above, every floor at or above the ground floor, open outdoor space left out, inside the plot\'s boundary, over the plot\'s area'
      if (plot === null) return { used: null, unit: '%', rule, why: noPlot, assumed: null }
      if (site.coverage === null || site.covered === null) return { used: null, unit: '%', rule, why: site.why ?? 'the building has no outline to measure', assumed: null }
      return { used: site.coverage * 100, unit: '%', rule: `${rule}: ${A(site.covered)} over ${A(plot)}`, why: null, assumed: null }
    }
    if (wish.figure === 'floor_area_ratio') {
      const { measure: m, assumed } = ratioMeasure(plan, wish.measure)
      const named = `${MEASURES[m].name} (${MEASURES[m].measures.replace(/\.$/, '')})`
      const rule = `${named}, of every floor at or above the ground floor, over the plot's area`
      if (plot === null) return { used: null, unit: '', rule, why: noPlot, assumed }
      const areas = planAreaFigures(plan, { floors: [...upper] })
      const unknown = areas.floors.filter((f) => f[m] === null)
      if (unknown.length > 0) {
        const f = unknown[0]!
        return { used: null, unit: '', rule, why: `${MEASURES[m].name.toLowerCase()} is not known on ${JSON.stringify(names.get(f.floor) ?? f.floor)}: ${f.why ?? 'it could not be worked out'}`, assumed }
      }
      const gross = areas.floors.reduce((sum, f) => sum + f[m]!, 0)
      return { used: gross / plot, unit: '', rule: `${rule}: ${A(gross)} over ${A(plot)}`, why: null, assumed }
    }
    if (wish.figure === 'building_height') {
      const rule = 'from the ground to the top of the highest roof: a floor\'s level, its clear height and the roof slab over it, or the ridge its roof states, and its parapet'
      const height = buildingHeight(plan, storeysOnce())
      if (height === null) return { used: null, unit: 'm', rule, why: 'no floor at or above the ground floor holds an outline or walls that close one', assumed: null }
      const ground = height.groundStated ? `the ground as site.ground states it` : 'the ground floor\'s floor level, since site.ground states no ground'
      return { used: height.height, unit: 'm', rule: `${rule}; from ${ground}, to the roof over ${JSON.stringify(names.get(height.floor) ?? height.floor)}`, why: null, assumed: null }
    }
    // parking_per_home
    const rule = 'the parking spaces the floors state (floors[].parking) over the homes they state (floors[].homes), added up over every floor'
    const floors = plan.floors ?? []
    const homes = floors.reduce((sum, f) => sum + (f.homes ?? 0), 0)
    const spaces = floors.reduce((sum, f) => sum + (f.parking ?? 0), 0)
    if (!floors.some((f) => f.homes !== undefined)) return { used: null, unit: 'spaces per home', rule, why: 'no floor states how many homes it holds (floors[].homes)', assumed: null }
    if (homes === 0) return { used: null, unit: 'spaces per home', rule, why: 'the floors state 0 homes', assumed: null }
    if (!floors.some((f) => f.parking !== undefined)) return { used: null, unit: 'spaces per home', rule, why: 'no floor states how many parking spaces it holds (floors[].parking)', assumed: null }
    return { used: spaces / homes, unit: 'spaces per home', rule: `${rule}: ${spaces} ${spaces === 1 ? 'space' : 'spaces'} for ${homes} ${homes === 1 ? 'home' : 'homes'}`, why: null, assumed: null }
  }

  const out: SiteLimit[] = []
  for (const figure of SITE_FIGURES) {
    const wish = figures.find((f) => f.figure === figure)
    if (wish === undefined) continue
    const { what, most } = FIGURES[figure]
    const m = measure(wish)
    const shown = (v: number): string => (m.unit === '%' ? `${fixed(v, 1)}%` : m.unit === 'm' ? L(v) : m.unit === '' ? fixed(v, 2) : `${fixed(v, 2)} ${m.unit}`)
    const limit = m.unit === '%' ? `${asWritten(wish.value)}%` : m.unit === 'm' ? L(wish.value) : m.unit === '' ? asWritten(wish.value) : `${asWritten(wish.value)} ${wish.value === 1 ? m.unit.replace(/^spaces/, 'space') : m.unit}`
    const yours = `your limit ${most ? 'at most' : 'at least'} ${limit}${wish.source === 'assumed' ? ', assumed for you to confirm' : ''}`
    const state: LimitState = m.used === null ? 'not-measured' : (most ? round(m.used, 4) <= wish.value : round(m.used, 4) >= wish.value) ? 'met' : 'missed'
    const head = `${what.charAt(0).toUpperCase()}${what.slice(1)}`
    const said = m.used === null
      ? `${head}: not measured, ${m.why}; ${yours}.`
      : `${head}: used ${shown(m.used)}, ${yours}: ${state === 'met' ? 'met' : 'not met'}. Measured as ${m.rule}.`
    out.push({ limit: figure as LimitName, edge: null, state, used: m.used === null ? null : round(m.used, 4), allowed: wish.value, most, unit: m.unit, rule: m.rule, why: m.why, assumed: m.assumed, source: wish.source, text: `${said}${m.assumed === null ? '' : ` Assumed: ${m.assumed}.`}` })
  }

  // The set-backs the plan asks for (BRF-3), edge by edge.
  const rule = 'the least distance from the building, seen from above, to the edge, as a tape between the two nearest points measures it'
  for (const edge of site.boundary?.problem === null ? site.boundary.edges : []) {
    if (edge.setback === null) continue
    const at = site.edges.find((e) => e.edge.edge === edge.edge)
    const yours = `your limit at least ${L(edge.setback.distance)}${edge.setback.source === 'assumed' ? ', assumed for you to confirm' : ''}`
    const head = `Set-back from edge ${edge.edge} (${edge.name})`
    if (at === undefined) {
      const why = site.why ?? 'the building has no outline to measure from'
      out.push({ limit: 'setback', edge: edge.edge, state: 'not-measured', used: null, allowed: edge.setback.distance, most: false, unit: 'm', rule, why, assumed: null, source: edge.setback.source, text: `${head}: not measured, ${why.replace(/\.$/, '')}; ${yours}.` })
      continue
    }
    const met = at.past === 0 && at.short === null
    const used = at.past > 0 ? `the building reaches ${L(at.past)} over it` : `used ${L(at.distance)}`
    out.push({ limit: 'setback', edge: edge.edge, state: met ? 'met' : 'missed', used: round(at.past > 0 ? 0 : at.distance, 4), allowed: edge.setback.distance, most: false, unit: 'm', rule, why: null, assumed: null, source: edge.setback.source, text: `${head}: ${used}, ${yours}: ${met ? 'met' : 'not met'}. Measured as ${rule}.` })
  }
  return out
}

/** The storeys and the gross area per floor, in a line each, for the massing before any wall. */
export function massingLines(plan: FloorPlan, display: Display): string[] {
  const storeys = planStoreys(plan)
  const names = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
  const lines = [storeysText(storeys)]
  const areas = planAreaFigures(plan)
  for (const f of areas.floors) {
    if (f.grossExternal === null) continue
    lines.push(`  ${JSON.stringify(names.get(f.floor) ?? f.floor)}: gross external ${areaText(f.grossExternal, display)}${f.massing ? ', massing: its outline, no walls yet' : ''}.`)
  }
  return lines
}

/** The storey count in words. */
export function storeysText(storeys: PlanStoreys): string {
  const n = (count: number, what: string): string => `${count === 0 ? 'none' : count} ${what}`
  const above = `${storeys.above} ${storeys.above === 1 ? 'storey' : 'storeys'} at or above the ground floor`
  return `Storeys: ${above}, ${n(storeys.below, 'below it')}; counted by level, from the floors that hold an outline or walls that close one${storeys.empty.length > 0 ? `, and not ${storeys.empty.length === 1 ? 'the floor' : `the ${storeys.empty.length} floors`} holding nothing yet` : ''}.`
}
