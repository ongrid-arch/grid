/**
 * The plot (BRF-3, lab EL-16), in words and as data: the boundary and its street edges, how far
 * the building stands from each edge against the set-back the person asked for, how far each face
 * of the building is from the edge in front of it, the plot coverage, and the site's things. The
 * geometry is `siteMeasures` in the core; this only words it.
 *
 * The set-backs are the person's own figures, never a code's, and the answer says so under their
 * heading. A distance is said with the figure beside it, and how far short it falls; no line says
 * a distance is enough. The ways are read by the plan's north, and a plan that states none is
 * answered with north as the top of the drawing, said first (`northLine`).
 */
import { areaText as areaFigure, metresText, planFacing, siteMeasures, siteThingsText, type EdgeDistance, type FloorPlan } from '@ongrid/floorplan/geometry'
import type { Display } from '@ongrid/floorplan/types/units'
import { FIGURES_HEADING } from '../brief/brief'
import { northData, northLine } from './facing'
import { areaText, lengthText } from './units'

export const SITE_RULE =
  'The building is measured from its outside face, the walls\' outer faces of every floor at or above the ground floor, joined into one shape seen from above; a floor below the ground floor is left out, and nothing outside the walls (eaves, steps) is drawn to measure. '
  + 'An edge\'s distance is the least distance from that shape to the edge, as a tape between the two nearest points measures it. A face\'s distance is to the edge of the boundary in front of it, square to the face. '
  + 'Open outdoor space (a terrace, a pool deck, a garden, a balcony) is left out of that shape, as it is of every area; a roofed one (a porch, a carport) is part of it. '
  + 'The plot coverage is the part of that shape inside the boundary against the boundary\'s area. '
  + 'The set-backs are the person\'s own figures: Grid sets each distance against them and applies no figure of its own, and checks no rule. The site\'s things are drawn only.'

const settle = (value: number): number => Math.round(Number(value.toPrecision(12)))
const round = (value: number): number => settle(value * 1000) / 1000 + 0
/** A share as a percentage: a whole number as one, else to one decimal. */
export function percentText(ratio: number): string {
  const tenths = settle(ratio * 1000) / 10 + 0
  return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)}%`
}

export interface SiteAnswer {
  readonly lines: readonly string[]
  readonly data: Record<string, unknown>
}

/** The whole answer about the plot. */
export function siteAnswer(plan: FloorPlan, display: Display): SiteAnswer {
  const site = siteMeasures(plan)
  const facing = planFacing(plan)
  const L = (v: number): string => lengthText(v, display)
  const A = (v: number): string => areaText(v, display)
  const lines = [northLine(facing)]
  const boundary = site.boundary
  const things = plan.site?.things ?? []

  if (boundary === null) {
    lines.push('The site states no boundary, so no distance to it and no plot coverage are measured: give site.boundary, the plot\'s corners in order round it.')
  } else if (boundary.problem !== null) {
    lines.push(`The site's boundary is not one closed shape (${boundary.problem}), so no distance to it and no plot coverage are measured.`)
  } else {
    const streets = boundary.edges.filter((e) => e.street)
    lines.push(`The plot: ${A(boundary.area)} inside a boundary of ${boundary.edges.length} edges; ${streets.length === 0 ? 'no edge is said to be on a street' : `on the street: ${streets.map((e) => `edge ${e.edge} (${e.name})`).join(', ')}`}.`)
    if (site.footprint === null) lines.push(`Plot coverage and the distances to the boundary were not measured: ${site.why ?? 'the building has no outline'}`)
    else {
      if (site.coverage !== null && site.covered !== null) lines.push(`Plot coverage: ${percentText(site.coverage)}, the building's ${A(site.covered)} on the ${A(boundary.area)} plot.`)
      const open = site.withOpen
      if (open !== null && open.coverage !== null && open.covered !== null) lines.push(`With the open outdoor space counted as building: ${percentText(open.coverage)}, ${A(open.covered)} on the ${A(boundary.area)} plot.`)
      if (boundary.edges.some((e) => e.setback !== null)) lines.push(FIGURES_HEADING)
      lines.push('From each edge of the boundary, the least distance to the building:')
      for (const at of site.edges) lines.push(`  ${edgeLine(at, L, site.withOpen?.edges.find((o) => o.edge.edge === at.edge.edge))}`)
      lines.push('From each face of the building, square to it, to the edge of the boundary in front of it:')
      for (const face of site.faces) {
        const edge = boundary.edges[face.edge - 1]!
        lines.push(`  The ${face.faces} face, ${L(face.length)} long: ${L(face.distance)} to ${edge.name}.`)
      }
    }
  }
  if (things.length > 0) lines.push(`The site's things, drawn only and never measured: ${siteThingsText(things)}.`)

  const data = {
    measures: 'geometry, set against the person\'s own set-backs',
    ...northData(facing),
    boundary:
      boundary === null
        ? null
        : {
            area: round(boundary.area),
            problem: boundary.problem,
            edges: boundary.edges.map((e) => {
              const at = site.edges.find((d) => d.edge.edge === e.edge)
              const withOpenAt = site.withOpen?.edges.find((d) => d.edge.edge === e.edge)
              return {
                edge: e.edge,
                from: [round(e.from.x), round(e.from.y)],
                to: [round(e.to.x), round(e.to.y)],
                length: round(e.length),
                faces: e.faces,
                bearing: round(e.bearing),
                street: e.street,
                name: e.name,
                setback: e.setback,
                distance: at === undefined ? null : round(at.distance),
                distanceWithOpenOutdoor: withOpenAt === undefined ? null : round(withOpenAt.distance),
                past: at === undefined ? null : round(at.past),
                short: at?.short == null ? null : round(at.short),
                face: at?.face ?? null,
                floor: at?.floor ?? null,
              }
            }),
          },
    setbacksAre: FIGURES_HEADING,
    footprint: site.footprint === null ? null : { area: round(site.footprint.area), floors: site.footprint.floors },
    why: site.why,
    coverage: site.coverage === null || site.covered === null || boundary === null ? null : { ratio: round(site.coverage), percent: percentText(site.coverage), covered: round(site.covered), plot: round(boundary.area), openOutdoorLeftOut: site.withOpen !== null },
    coverageWithOpenOutdoor: site.withOpen === null || site.withOpen.coverage === null || site.withOpen.covered === null || boundary === null ? null : { ratio: round(site.withOpen.coverage), percent: percentText(site.withOpen.coverage), covered: round(site.withOpen.covered), plot: round(boundary.area) },
    faces: site.faces.map((f) => ({ face: f.face, from: [round(f.from.x), round(f.from.y)], to: [round(f.to.x), round(f.to.y)], length: round(f.length), faces: f.faces, edge: f.edge, distance: round(f.distance) })),
    things: things.map((t) => ({ id: t.id, kind: t.kind, ...(t.label === undefined ? {} : { label: t.label }) })),
  }
  return { lines, data }
}

/** One edge: its distance, the set-back asked for beside it, and how far short it falls. */
function edgeLine(at: EdgeDistance, L: (v: number) => string, open?: EdgeDistance): string {
  const { edge } = at
  const where = `Edge ${edge.edge}${edge.street ? ', on the street' : ''}`
  const asked = edge.setback
  const figure = asked === null ? 'no set-back asked' : asked.source === 'assumed' ? `${L(asked.distance)} is assumed for you, to confirm` : `you asked for ${L(asked.distance)}`
  if (at.past > 0) return `${where}: the building reaches ${L(at.past)} over ${edge.name}, out of the plot; ${figure}.`
  const short = at.short === null ? '' : `: ${L(at.short)} short`
  const beside = open === undefined || Math.abs(open.distance - at.distance) < 0.0005 ? '' : `; ${open.past > 0 ? `the open outdoor space reaches ${L(open.past)} over it` : `${L(open.distance)} to the open outdoor space`}`
  return `${where}: ${L(at.distance)} from ${edge.name}${open === undefined ? '' : ' (the enclosed building)'}${beside}; ${figure}${short}.`
}

/**
 * The plot in a line or two for `grid describe`, on a plan whose site states a boundary or things:
 * its area and coverage, and the edge the building comes nearest, with the set-back asked for it.
 * A person's form names no id; an agent's names the edge by number and points to the full answer.
 */
export function siteDescription(plan: FloorPlan, audience: 'person' | 'agent'): string[] {
  const things = plan.site?.things ?? []
  if (plan.site?.boundary === undefined && things.length === 0) return []
  const site = siteMeasures(plan)
  const M = (v: number): string => `${metresText(v)} m`
  const lines: string[] = []
  const boundary = site.boundary
  if (boundary !== null && boundary.problem === null) {
    const near = [...site.edges].sort((a, b) => a.distance - b.distance)[0]
    const area = `${areaFigure(boundary.area)} m²`
    const coverage = site.coverage === null ? null : percentText(site.coverage)
    if (audience === 'person') {
      const nearText = near === undefined ? '' : near.past > 0 ? `; the building reaches ${M(near.past)} over ${near.edge.name}` : `; its nearest edge is ${near.edge.name}, ${M(near.distance)} away${near.edge.setback === null ? '' : `, where ${M(near.edge.setback.distance)} was asked`}`
      lines.push(`The plot: ${area}${coverage === null ? '' : `, ${coverage} of it covered by the building`}${nearText}.`)
    } else {
      const nearText = near === undefined ? '' : `; nearest edge ${near.edge.edge} (${near.edge.faces}) at ${M(near.past > 0 ? 0 : near.distance)}${near.past > 0 ? `, ${M(near.past)} over it` : ''}${near.edge.setback === null ? '' : `, set-back asked ${M(near.edge.setback.distance)}`}`
      lines.push(`Site: plot ${area}${coverage === null ? '' : `, coverage ${coverage}`}${nearText}. grid_measure what=site gives every edge and face.`)
    }
  } else if (boundary !== null) lines.push(`The site's boundary is not one closed shape, so nothing is measured from it.`)
  if (things.length > 0) lines.push(`${audience === 'person' ? 'On the site' : 'Site things'}: ${siteThingsText(things)}, drawn only.`)
  return lines
}
