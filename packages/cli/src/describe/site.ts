/**
 * `grid describe`'s lines on the plot (BRF-3) for a person, in the person's language (MSG-11): the
 * same lines `siteDescription` (`quantities/site.ts`) gives, said by key. The geometry is
 * `siteMeasures` in the core; this only words it. The agent's lines are `siteDescription`'s, a
 * format of codes that stays as it is.
 */
import { areaText, boundaryEdgeSaid, metresText, siteMeasures, siteThingsSaid, type FloorPlan } from '@ongrid/floorplan/geometry'
import { name, num, say, said, type MessageKey, type Value, type Values } from '@ongrid/floorplan/messages'
import { percentText } from '../quantities/site'
import type { Words } from './card'

/** The person's lines on the plot: its area and coverage, the edge the building comes nearest, and the site's things; empty for a plan whose site states neither a boundary nor a thing. */
export function personSite(plan: FloorPlan, w: Words): string[] {
  const things = plan.site?.things ?? []
  if (plan.site?.boundary === undefined && things.length === 0) return []
  const t = (key: MessageKey, values?: Values): string => say(w.language, key, values, w.options)
  const site = siteMeasures(plan)
  const lines: string[] = []
  const boundary = site.boundary
  if (boundary !== null && boundary.problem === null) {
    const near = [...site.edges].sort((a, b) => a.distance - b.distance)[0]
    const coverage: Value = site.coverage === null ? '' : said('describe.site.coverage', { percent: num(percentText(site.coverage).replace('%', '')) })
    const named = near === undefined ? '' : boundaryEdgeSaid(boundary.edges, near.edge)
    const nearSaid: Value =
      near === undefined
        ? ''
        : near.past > 0
          ? said('describe.site.over', { past: num(metresText(near.past)), boundary: named })
          : near.edge.setback === null
            ? said('describe.site.nearest', { boundary: named, distance: num(metresText(near.distance)) })
            : said('describe.site.nearest.asked', { boundary: named, distance: num(metresText(near.distance)), asked: num(metresText(near.edge.setback.distance)) })
    lines.push(t('describe.site.plot', { area: num(areaText(boundary.area)), coverage, near: nearSaid }))
  } else if (boundary !== null) lines.push(t('describe.site.notClosed'))
  if (things.length > 0) lines.push(t('describe.site.things', { things: siteThingsSaid(things) }))
  return lines
}

/**
 * CNT-50: the site's own name and its address as the plan states them, joined in the person's
 * language; null when it states neither. A name the same as `besides` (the title it is under) is
 * left out. Kept as written: Grid never looked it up.
 */
export function sitePlace(plan: Pick<FloorPlan, 'site'>, language: string, besides?: string): string | null {
  const parts = [plan.site?.name, plan.site?.address].filter((p): p is string => p !== undefined && p !== besides)
  return parts.length === 0 ? null : parts.join(say(language, 'join.comma'))
}

/** CNT-50: describe's line on the site's name and address, for a person or an agent; empty when the plan states neither. */
export function placeLines(plan: FloorPlan, audience: 'person' | 'agent', w: Words): string[] {
  const site = plan.site
  if (audience === 'agent') {
    const fields = [...(site?.name === undefined ? [] : [`name ${JSON.stringify(site.name)}`]), ...(site?.address === undefined ? [] : [`address ${JSON.stringify(site.address)}`])]
    return fields.length === 0 ? [] : [`SITE ${fields.join('; ')}`]
  }
  const place = sitePlace(plan, w.language)
  return place === null ? [] : [say(w.language, 'describe.site.place', { place: name(place) }, w.options)]
}

/**
 * CNT-50: a project's name as a sheet's title block carries it, with the site's own name (when it
 * is not the project's) and its address after it, joined in the sheet's language.
 */
export function projectWithPlace(project: string, plan: Pick<FloorPlan, 'site'>, language: string): string {
  const parts = [project, ...[plan.site?.name, plan.site?.address].filter((p): p is string => p !== undefined && p !== project)]
  return parts.join(say(language, 'join.comma'))
}
