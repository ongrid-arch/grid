/**
 * VEW-85: `grid_view kind=site`'s answer: the site plan's picture, and in words and data what it
 * draws: every building with its storeys and height, the ones that could not be drawn and why,
 * the plot, the labelled things, the set-back lines, the street edges, the scale bar and the
 * north. Loaded only when a site plan is asked for. `withSiteLine` is the line a floor plan drawn
 * with the site faint under it adds.
 */
import type { PixelTransform } from '../draw/pictureTransform'
import { sitePlan, type FloorPlan, type SitePlan, type SitePlanBuilding } from '@ongrid/floorplan/geometry'
import { siteView, type PictureSize, type WorldBounds } from '../draw/views'
import { drawingLook, type LookName } from '../draw/viewNames'
import { areaText, displayFor, lengthText } from '../quantities/units'
import { m, ToolRefusal, type Answer } from './toolkit'
import type { Display } from '@ongrid/floorplan/types/units'
import type { Language } from '@ongrid/floorplan/messages'
import { siteLabels } from '@ongrid/viewer/src/picture/site'

const q = (text: string): string => JSON.stringify(text)
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** A building as the answer names it: its name, else what it is. */
function buildingName(building: SitePlanBuilding): string {
  if (building.name !== null) return q(building.name)
  return building.id === '' ? 'The building' : 'The floors in no building'
}

function buildingLine(building: SitePlanBuilding, units: Display): string {
  const below = building.storeys.below > 0 ? ` and ${count(building.storeys.below, 'storey')} below the ground` : ''
  const height = building.height === null ? ', its height not known' : `, ${lengthText(building.height, units)} high`
  const area = building.area === null ? '' : `, ${areaText(building.area, units)} seen from above`
  return `${buildingName(building)}${building.id === '' ? '' : ` (${building.id})`}: ${count(building.storeys.above, 'storey')}${below}${height}${area}`
}

/** What the site plan holds, in lines for the agent. */
export function sitePlanLines(drawn: SitePlan, units: Display): string[] {
  const shown = drawn.buildings.filter((b) => b.pieces.length > 0)
  const missing = drawn.buildings.filter((b) => b.pieces.length === 0)
  const lines: string[] = []
  lines.push(shown.length === 0 ? 'No building is drawn: no floor of the plan has walls that close an outline.' : `Buildings drawn in solid fill, each with its name, storeys and height written on it: ${shown.map((b) => buildingLine(b, units)).join('; ')}.`)
  for (const b of missing) lines.push(`${buildingName(b)}${b.id === '' ? '' : ` (${b.id})`} is not drawn: ${b.why ?? 'its floors close no outline'}.`)
  lines.push(drawn.plotArea === null
    ? drawn.site?.boundary == null ? 'The plan states no plot boundary: the picture is framed to the buildings and the site\'s things. grid_set_site sets it.' : 'The plot boundary is drawn, but it crosses itself, so no area, street edge or set-back is read from it.'
    : `The plot boundary is the long dash and dot, ${areaText(drawn.plotArea, units)}.`)
  const labels = drawn.site === null ? [] : siteLabels(drawn.site)
  const things = drawn.site?.things.length ?? 0
  if (things > 0) lines.push(`The site's things are drawn in their own style (${count(things, 'thing')})${labels.length === 0 ? ', none with a label of its own' : `, labelled as the plan names them: ${labels.map((l) => q(l.text)).join(', ')}`}.`)
  if (drawn.setbacks.length > 0) lines.push(`Set-back lines, dashed inside the plot at the person's own figures: ${drawn.setbacks.map((s) => `${lengthText(s.distance, units)} from edge ${s.edge}`).join(', ')}. Grid adds no figure of its own; grid_measure what=site measures each building against them.`)
  if (drawn.streets.length > 0) lines.push(`Street edges drawn heavier, with the word Street outside them: ${drawn.streets.map((s) => `edge ${s.edge}, facing ${s.faces}`).join('; ')}. The plan holds no street names, so none is written.`)
  if (drawn.context.length > 0) lines.push(`Context round the plan, dashed: ${drawn.context.map((c) => (c.name === null ? q(c.id) : q(c.name))).join(', ')}.`)
  return lines
}

/** The site plan's picture and what it draws; the picture's words in `language`, the answer's text in the tool's English. */
export async function siteAnswer(plan: FloorPlan, asked: LookName, language?: Language, display?: Display, size?: PictureSize): Promise<Answer & { readonly image: NonNullable<Answer['image']>; readonly picture: { readonly svg?: () => string; readonly bounds: WorldBounds | null; readonly pixelToMetres?: PixelTransform } }> {
  if (sitePlan(plan).bounds === null) throw new ToolRefusal('kind=site draws the plot and the buildings on it, and this plan has neither a plot, a site thing nor a floor whose walls close an outline. Write the rooms first, or set the plot with grid_set_site.')
  const look = asked === drawingLook(asked) ? asked : `${drawingLook(asked)} (asked as ${asked})`
  const view = await siteView(plan, { look: asked, ...(language === undefined ? {} : { language }), ...(display === undefined ? {} : { display }), ...(size === undefined ? {} : { size }) })
  const drawn = view.sitePlan
  const units = display ?? displayFor(undefined, undefined, plan, language ?? 'en')
  const north = drawn.north === null
    ? 'The plan states no north, so no north arrow is drawn and the top of the drawing is taken as north; grid_set_plan sets it.'
    : 'The north arrow in the top-right corner points to the north the plan states.'
  const lines = [
    `Site plan, ${look}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px, framed to the plot and every building on it. A scale bar of ${view.scaleBar.words} is in the bottom-left corner. ${north} Look at the picture before you describe it.`,
    ...sitePlanLines(drawn, units),
    'To show the site under a floor\'s plan, faint (an upper floor\'s evacuation map with the assembly point across the street), draw kind=plan with with_site true.',
  ]
  const data = {
    kind: 'site',
    floor: null,
    camera: null,
    view: null,
    pxPerMetre: view.pxPerMetre,
    sills: [],
    ids: drawn.buildings.filter((b) => b.pieces.length > 0 && b.id !== '').map((b) => b.id),
    boxes: [],
    site: {
      buildings: drawn.buildings.map((b) => ({ id: b.id, name: b.name, storeys: b.storeys, height: b.height === null ? null : Number(m(b.height)), area: b.area, drawn: b.pieces.length > 0, why: b.why })),
      plotArea: drawn.plotArea,
      setbacks: drawn.setbacks.map((s) => ({ edge: s.edge, distance: s.distance })),
      streets: drawn.streets.map((s) => ({ edge: s.edge, faces: s.faces })),
      labels: drawn.site === null ? [] : siteLabels(drawn.site).map((l) => ({ id: l.id, text: l.text })),
      north: drawn.north !== null,
      scaleBar: view.scaleBar.metres,
    },
  }
  return { text: lines.join('\n'), data, image: { data: view.png, mimeType: 'image/png' }, picture: { ...(view.svg ? { svg: view.svg } : {}), bounds: view.bounds ?? null, ...(view.pixelToMetres ? { pixelToMetres: view.pixelToMetres } : {}) } }
}

/** The line a floor plan drawn with the site faint under it adds. */
export function withSiteLine(plan: FloorPlan): string {
  const drawn = sitePlan(plan)
  const shown = drawn.buildings.filter((b) => b.pieces.length > 0).length
  return `The site is drawn faint under the floor, framed with it: the plot, its things and their labels, the set-back lines, the street edges and the footprints of ${count(shown, 'building')}, as kind=site draws them.`
}
