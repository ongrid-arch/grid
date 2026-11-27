/**
 * CNT-56: the site's figures, always given with `grid_measure what=site`, for the whole site and
 * for each building on its own: the plot coverage, the gross external area of the floors at or
 * above the ground floor, the floor area ratio, the homes, the homes per hectare and the parking
 * per home. So no agent works a density out by hand, and an outbuilding's figures are its own,
 * never the house's.
 *
 * These are measures, never limits: the person's own limits (BRF-4, `limits.ts`) are set against
 * them, and no line here says a figure is enough. A figure that cannot be measured is null with why.
 *
 * - The area is ARE-9's gross external area of each floor at or above the ground floor
 *   (`footprintFloors`), added up; the ratio is it over the plot's area. A building's are its own
 *   floors', over the whole plot.
 * - Homes are what the floors state (`floors[].homes`, C17), else the flats the plan lists, each
 *   counted in the building of its first floor.
 * - Parking is what the floors state (`floors[].parking`), else the bays drawn (CNT-19).
 *
 * Pure: a plan and its site measures in, figures and lines out.
 */
import { footprintFloors, planAreaFigures, planBayCounts, planBuildings, planFlats, planFloors, type FloorPlan, type SiteMeasures } from '@ongrid/floorplan/geometry'
import { english, name, num, said, type Said } from '@ongrid/floorplan/messages'
import type { Display } from '@ongrid/floorplan/types/units'
import { areaText } from './units'

/** Square metres in a hectare. */
const M2_PER_HECTARE = 10_000

/** Why a figure is not measured. */
export type FigureWhy = 'noPlot' | 'noFootprint' | 'noGross' | 'noHomes'

/** One building's figures, or the whole site's (`id` null). */
export interface SiteFigure {
  readonly id: string | null
  readonly name: string
  /** The footprint inside the boundary over the plot's area, 0 to 1. */
  readonly coverage: number | null
  readonly coverageWhy: FigureWhy | null
  /** Gross external area of its floors at or above the ground floor, m². */
  readonly grossExternal: number | null
  readonly grossWhy: FigureWhy | null
  readonly floorAreaRatio: number | null
  readonly ratioWhy: FigureWhy | null
  readonly homes: number | null
  readonly homesFrom: 'floors' | 'flats' | null
  readonly homesPerHectare: number | null
  readonly densityWhy: FigureWhy | null
  readonly parking: number | null
  readonly parkingFrom: 'floors' | 'bays' | null
  readonly parkingPerHome: number | null
}

export interface SiteFigures {
  /** The plot's area inside its boundary, m²; null when the boundary is missing or not sound. */
  readonly plot: number | null
  readonly site: SiteFigure
  /** Each building, in the order the site measures list them; empty on a plan that names none. */
  readonly buildings: readonly SiteFigure[]
}

/** The figures of the whole site and each building. */
export function siteFigures(plan: FloorPlan, site: SiteMeasures): SiteFigures {
  const plot = site.boundary !== null && site.boundary.problem === null && site.boundary.area > 0 ? site.boundary.area : null
  const upper = footprintFloors(plan)
  const areas = planAreaFigures(plan, { floors: upper })
  const gea = new Map(areas.floors.map((f) => [f.floor, f.grossExternal] as const))
  const floors = plan.floors ?? []
  const flats = planFlats(plan)
  const bays = new Map(planBayCounts(plan).map((b) => [b.floor, b.count] as const))

  const figure = (id: string | null, label: string, own: ReadonlySet<string> | null, coverage: number | null, hasFootprint: boolean): SiteFigure => {
    const mine = (floor: string): boolean => own === null || own.has(floor)
    // The gross external area of its floors at or above the ground floor.
    const counted = upper.filter(mine)
    const grosses = counted.map((f) => gea.get(f) ?? null)
    const grossExternal = grosses.some((g) => g === null) ? null : grosses.reduce<number>((sum, g) => sum + g!, 0)
    const grossWhy: FigureWhy | null = grossExternal === null ? 'noGross' : null
    const stated = floors.filter((f) => mine(f.id))
    const homesStated = stated.some((f) => f.homes !== undefined)
    const ownFlats = flats.filter((f) => f.floors.length > 0 && mine(f.floors[0]!))
    const homes = homesStated ? stated.reduce((sum, f) => sum + (f.homes ?? 0), 0) : ownFlats.length > 0 ? ownFlats.length : null
    const homesFrom = homesStated ? 'floors' : ownFlats.length > 0 ? 'flats' : null
    const parkingStated = stated.some((f) => f.parking !== undefined)
    const drawn = [...bays].filter(([floor]) => mine(floor)).reduce((sum, [, count]) => sum + count, 0)
    const parking = parkingStated ? stated.reduce((sum, f) => sum + (f.parking ?? 0), 0) : drawn > 0 ? drawn : null
    const parkingFrom = parkingStated ? 'floors' : drawn > 0 ? 'bays' : null
    return {
      id,
      name: label,
      coverage: plot === null ? null : coverage,
      coverageWhy: plot === null ? 'noPlot' : coverage === null ? (hasFootprint ? 'noPlot' : 'noFootprint') : null,
      grossExternal,
      grossWhy,
      floorAreaRatio: plot === null || grossExternal === null ? null : grossExternal / plot,
      ratioWhy: plot === null ? 'noPlot' : grossWhy,
      homes,
      homesFrom,
      homesPerHectare: plot === null || homes === null ? null : homes / (plot / M2_PER_HECTARE),
      densityWhy: homes === null ? 'noHomes' : plot === null ? 'noPlot' : null,
      parking,
      parkingFrom,
      parkingPerHome: parking === null || homes === null || homes === 0 ? null : parking / homes,
    }
  }

  const whole = figure(null, english(said('site.figures.whole')), null, site.coverage, site.footprint !== null)
  const buildings = (site.buildings ?? []).map((b) => figure(b.id, b.name, new Set(floorsOf(plan, site, b.id)), b.coverage, b.footprint !== null))
  return { plot, site: whole, buildings }
}

/** A building's floors: those it names, or, for the floors in no building, every floor no building holds. */
function floorsOf(plan: FloorPlan, site: SiteMeasures, id: string): string[] {
  const listed = planBuildings(plan)
  const held = new Set(listed.flatMap((b) => b.floors))
  if (site.buildings?.find((b) => b.id === id)?.rest === true) return planFloors(plan).map((f) => f.id).filter((f) => !held.has(f))
  return [...(listed.find((b) => b.id === id)?.floors ?? [])]
}

const settle = (value: number): number => Number(value.toPrecision(12))
const fixed = (value: number, places: number): string => (Math.round(settle(value * 10 ** places)) / 10 ** places + 0).toFixed(places)

/** One figure line, for the whole site or a building. */
export function siteFigureLine(f: SiteFigure, display: Display, percent: (ratio: number) => string): Said {
  const notMeasured = (why: FigureWhy | null): Said => said('site.figures.notMeasured', { why: said(`site.figures.why.${why ?? 'noFootprint'}`) })
  const from = (word: 'floors' | 'flats' | 'bays'): Said => said(`site.figures.from.${word}`)
  return said('site.figures.line', {
    building: f.id === null ? said('site.figures.whole') : name(f.name),
    coverage: f.coverage === null ? notMeasured(f.coverageWhy) : num(percent(f.coverage)),
    gea: f.grossExternal === null ? notMeasured(f.grossWhy) : areaText(f.grossExternal, display),
    far: f.floorAreaRatio === null ? notMeasured(f.ratioWhy) : num(fixed(f.floorAreaRatio, 2)),
    homes: f.homes === null ? said('site.figures.homes.none') : said('site.figures.homes', { count: num(String(f.homes)), from: from(f.homesFrom!) }),
    density: f.homesPerHectare === null ? said('site.figures.density.none', { why: said(`site.figures.why.${f.densityWhy ?? 'noHomes'}`) }) : said('site.figures.density', { value: num(fixed(f.homesPerHectare, 1)) }),
    parking: f.parking === null
      ? said('site.figures.parking.none')
      : f.parkingPerHome === null
        ? said('site.figures.parking.noHomes', { count: num(String(f.parking)), from: from(f.parkingFrom!) })
        : said('site.figures.parking', { count: num(String(f.parking)), from: from(f.parkingFrom!), per: num(fixed(f.parkingPerHome, 2)) }),
  })
}

/** A figure as data, rounded as the answer gives it. */
export function siteFigureData(f: SiteFigure): Record<string, unknown> {
  const r = (v: number | null, places: number): number | null => (v === null ? null : Math.round(settle(v * 10 ** places)) / 10 ** places + 0)
  return {
    ...(f.id === null ? {} : { id: f.id, name: f.name }),
    coverage: r(f.coverage, 4),
    grossExternal: r(f.grossExternal, 3),
    floorAreaRatio: r(f.floorAreaRatio, 4),
    homes: f.homes,
    homesFrom: f.homesFrom,
    homesPerHectare: r(f.homesPerHectare, 2),
    parking: f.parking,
    parkingFrom: f.parkingFrom,
    parkingPerHome: r(f.parkingPerHome, 4),
    notMeasured: Object.fromEntries(
      ([['coverage', f.coverageWhy], ['grossExternal', f.grossWhy], ['floorAreaRatio', f.ratioWhy], ['homesPerHectare', f.densityWhy]] as const)
        .filter(([, why]) => why !== null)
        .map(([key, why]) => [key, english(said(`site.figures.why.${why!}`))])
    ),
  }
}
