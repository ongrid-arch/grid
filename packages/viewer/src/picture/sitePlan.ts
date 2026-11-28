/**
 * VEW-85: the site plan as a picture: the plot seen from above with every building of the plan on
 * it, drawn from what the core works out (`sitePlan`), and nothing worked out here.
 *
 * Drawn in the plan's looks (SHT-1), lightest first: the context round the plan dashed, the
 * site's things and its boundary as the ground floor's plan draws them (`siteNodes`, with their
 * labels), the set-back lines dashed inside the plot with the person's figure along them, each
 * building's footprint solid in the look's outside-wall colour (poche) with its name, storeys and
 * height over it on a halo of paper, the word for a street outside each street edge, a scale bar
 * in the bottom-left corner and, when the plan states its north, the north arrow. The key under
 * the drawing says what the poche, the set-back lines and the street edges are.
 *
 * `sitePlanNodes` with `faint` is the site drawn faint under a floor's plan (`PictureOptions.site`).
 *
 * Pure: no DOM, no React.
 */
import { computeBounds, sitePlan, type SitePlan, type SitePlanBuilding, type Vec2 } from '@ongrid/floorplan/geometry'
import type { Language } from '@ongrid/floorplan/messages'
import { METRES, showLength, type Display } from '@ongrid/floorplan/types/units'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { estimateTextWidth } from '../canvas2d/labelPlacement'
import { fitTo, type Viewport } from '../canvas2d/viewport'
import type { Look } from './look'
import { TEXT_PX, lengthText, lineMetres } from './look'
import type { Picture, PictureOptions } from './planSvg'
import { DEFAULT_WIDTH, displayOfPicture, lookOf } from './planSvg'
import { siteNodes, sitePaints } from './site'
import type { SvgNode } from './svgNode'
import { el } from './svgNode'
import { drawingText, wordsOf, type DrawingWords } from './words'
import { northArrowNode, writingBand, type KeyEntry } from './writing'

export interface SitePlanPictureOptions {
  /** Width in pixels. 1200 by default. */
  readonly width?: number
  /** VEW-87: height in pixels. By default it follows the site's shape, between 0.4 and 2.5 times the width. */
  readonly height?: number
  /** A named look, as for a plan: `working` by default. */
  readonly look?: PictureOptions['look']
  /** N in 1:N, for a look whose lines are in millimetres on paper. The picture's own when left out. */
  readonly paperScale?: number
  /** MSG-11: the language of its words; the plan's own display language when left out. */
  readonly language?: Language
  /** The units its heights, set-backs and scale bar are written in; the plan's own display when left out. */
  readonly display?: Display
}

/** A site plan laid out as a picture, with what it draws and its scale bar. */
export interface SitePlanPicture extends Picture {
  readonly sitePlan: SitePlan
  /** The scale bar's length, in metres, and its words. */
  readonly scaleBar: { readonly metres: number; readonly words: string }
}

const n = (value: number): string => lengthText(value)
const ring = (points: readonly Vec2[]): string => `M${points.map((p) => `${n(p.x)},${n(-p.y)}`).join('L')}Z`

/** How faint the site is under a floor's plan. */
const FAINT = 0.35
/** The scale bar: its pieces, its height and how far it stands in from the corner, in pixels; and the share of the view's width it takes at most. */
const BAR_PIECES = 4
const BAR_PX = 6
const BAR_INSET_PX = 24
const BAR_SHARE = 0.2
/** How far a street's word stands out from its edge, and the paper round words over poche, in pixels. */
const STREET_PX = 14
const PAD_PX = 3
const FOOT = 0.3048

/** Text in pixels at a point of the plan, turned by `turn` degrees, on a box of paper so it reads over poche and lines. */
function haloText(look: Look, at: Vec2, mpp: number, lines: readonly string[], part: string, size: number, turn = 0): SvgNode {
  const style = { 'font-family': look.colors.font, 'font-size': size, 'text-anchor': 'middle', fill: look.colors.label }
  const row = size + 2
  const top = -(lines.length * row) / 2
  const wide = Math.max(...lines.map((line) => estimateTextWidth(line, size))) + 2 * PAD_PX
  const box = el('rect', { x: n(-wide / 2), y: n(top - PAD_PX / 2), width: n(wide), height: n(lines.length * row + PAD_PX), fill: look.colors.paper, stroke: 'none' }, [], 'box')
  const rows = lines.map((line, i) => el('text', { y: n(top + (i + 1) * row - 3), ...style }, [line], `t${i}`))
  return el('g', { 'data-part': part, transform: `translate(${n(at.x)} ${n(-at.y)}) scale(${n(mpp)})${turn === 0 ? '' : ` rotate(${n(turn)})`}` }, [box, ...rows])
}

/** A building's words: its name, and its storeys and height. */
export function buildingWords(building: SitePlanBuilding, words: DrawingWords, units: Display): string[] {
  const name = building.id === '' && building.name === null ? null : building.name ?? drawingText(words, 'drawing.site.rest')
  const facts = [
    drawingText(words, building.storeys.above === 1 ? 'drawing.site.storeys.one' : 'drawing.site.storeys.many', { count: building.storeys.above }),
    ...(building.storeys.below > 0 ? [drawingText(words, 'drawing.site.below', { count: building.storeys.below })] : []),
    ...(building.height === null ? [] : [drawingText(words, 'drawing.site.height', { height: showLength(building.height, units) })]),
  ]
  return [...(name === null ? [] : [name]), facts.join(drawingText(words, 'join.comma'))]
}

/** Upright text along a line: its angle in degrees, turned so it never reads upside down. */
function uprightAngle(from: Vec2, to: Vec2): number {
  const degrees = (Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI
  return degrees > 90 ? degrees - 180 : degrees < -90 ? degrees + 180 : degrees
}

/** The site plan's nodes, in plan screen terms: everything but the scale bar and the north arrow. */
export function sitePlanNodes(drawn: SitePlan, look: Look, mpp: number, words: DrawingWords, units: Display, options: { readonly faint?: boolean; readonly paperScale?: number; readonly plot?: boolean } = {}): SvgNode[] {
  const line = lineMetres(look, mpp, options.paperScale)
  const paint = sitePaints(look, line)
  const nodes: SvgNode[] = []
  if (drawn.context.length > 0) {
    nodes.push(el('g', { 'data-part': 'site-context' }, drawn.context.flatMap((shape) => [
      el('path', { 'data-part': 'context-shape', 'data-context': shape.id, d: ring(shape.points), fill: 'none', stroke: look.colors.labelSoft, 'stroke-width': n(line.width('site')), 'stroke-dasharray': line.dash('above').map(n).join(' ') }, [], shape.id),
      ...(shape.name === null ? [] : [haloText(look, centre(shape.points), mpp, [shape.name], 'context-name', TEXT_PX.siteLabel)]),
    ])))
  }
  if (drawn.site !== null && options.plot !== false) nodes.push(...siteNodes(drawn.site, paint, mpp))
  // The set-back lines, dashed inside the plot, each with the person's figure along it.
  for (const setback of drawn.setbacks) {
    const middle = { x: (setback.from.x + setback.to.x) / 2, y: (setback.from.y + setback.to.y) / 2 }
    nodes.push(el('g', { 'data-part': 'site-setback', 'data-edge': String(setback.edge) }, [
      el('path', { d: `M${n(setback.from.x)},${n(-setback.from.y)}L${n(setback.to.x)},${n(-setback.to.y)}`, fill: 'none', stroke: look.colors.dimension, 'stroke-width': n(line.width('site')), 'stroke-dasharray': line.dash('chain').map(n).join(' ') }),
      haloText(look, middle, mpp, [drawingText(words, 'drawing.site.setback', { distance: showLength(setback.distance, units) })], 'site-setback-figure', TEXT_PX.siteLabel, uprightAngle(setback.from, setback.to)),
    ], `setback:${setback.edge}`))
  }
  // The buildings in poche, then their words over every one of them.
  const poche = look.colors.wallExterior
  for (const building of drawn.buildings) {
    if (building.pieces.length === 0) continue
    const d = building.pieces.map((piece) => ring(piece.outline) + piece.holes.map(ring).join('')).join('')
    nodes.push(el('path', { 'data-part': 'site-building', 'data-id': building.id, d, fill: poche, 'fill-rule': 'evenodd', stroke: poche, 'stroke-width': n(line.width('boundary')), 'stroke-linejoin': 'miter' }, [], `building:${building.id}`))
  }
  for (const building of drawn.buildings) {
    if (building.labelAt === null) continue
    nodes.push(haloText(look, building.labelAt, mpp, buildingWords(building, words, units), 'site-building-name', TEXT_PX.siteLabel + 1))
  }
  // VEW-88: a street edge with a name is labelled with it; one without, with the word for a street.
  for (const street of drawn.streets) {
    const out = STREET_PX * mpp
    const at = { x: (street.from.x + street.to.x) / 2 + street.outward.x * out, y: (street.from.y + street.to.y) / 2 + street.outward.y * out }
    nodes.push(haloText(look, at, mpp, [street.name ?? drawingText(words, 'drawing.site.street')], 'site-street-name', TEXT_PX.siteLabel + 1, uprightAngle(street.from, street.to)))
  }
  return options.faint === true ? [el('g', { 'data-part': 'site-under', opacity: n(FAINT), 'pointer-events': 'none', 'aria-hidden': 'true' }, nodes, 'site-under')] : nodes
}

function centre(points: readonly Vec2[]): Vec2 {
  const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / Math.max(points.length, 1), y: sum.y / Math.max(points.length, 1) }
}

/** The longest round length (1, 2 or 5 times a power of ten) no longer than `most`. */
export function roundLength(most: number): number {
  if (!(most > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(most))
  return [5, 2, 1].map((f) => f * power).find((length) => length <= most) ?? power
}

/** The scale bar in the bottom-left corner: its pieces alternately ink and paper, 0 at its left and its length at its right. */
function scaleBar(look: Look, view: Viewport, mpp: number, units: Display): { node: SvgNode; metres: number; words: string } {
  const feet = units.length === 'ft-in'
  const unit = feet ? FOOT : 1
  const length = roundLength((view.width * BAR_SHARE) / unit) * unit
  const text = feet ? `${Math.round(length / FOOT)} ft` : showLength(length, { ...units, length: 'm', precision: 0 })
  const left = view.x + BAR_INSET_PX * mpp
  const bottom = view.y + view.height - BAR_INSET_PX * mpp
  const piece = length / BAR_PIECES
  const pieces = Array.from({ length: BAR_PIECES }, (_, i) =>
    el('rect', { x: n(left + i * piece), y: n(bottom - BAR_PX * mpp), width: n(piece), height: n(BAR_PX * mpp), fill: i % 2 === 0 ? look.ink : look.colors.paper, stroke: look.ink, 'stroke-width': n(mpp) }, [], `p${i}`)
  )
  const label = (x: number, words: string, key: string): SvgNode =>
    el('g', { transform: `translate(${n(x)} ${n(bottom - (BAR_PX + 4) * mpp)}) scale(${n(mpp)})` }, [el('text', { fill: look.colors.label, 'font-family': look.colors.font, 'font-size': TEXT_PX.siteLabel, 'text-anchor': 'middle' }, [words])], key)
  return { node: el('g', { 'data-part': 'scale-bar', 'data-metres': n(length) }, [...pieces, label(left, '0', 'zero'), label(left + length, text, 'length')], 'scale-bar'), metres: length, words: text }
}

/** The key under a site plan: what the poche, the set-back lines and the street edges are. */
function siteKey(drawn: SitePlan, look: Look, words: DrawingWords): KeyEntry[] {
  const entries: KeyEntry[] = []
  if (drawn.buildings.some((b) => b.pieces.length > 0)) entries.push({ swatch: 'fill', color: look.colors.wallExterior, words: drawingText(words, 'drawing.site.key.building') })
  if (drawn.site?.boundary != null) entries.push({ swatch: 'dash', color: look.site.boundary, words: drawingText(words, 'drawing.site.key.boundary') })
  if (drawn.streets.length > 0) entries.push({ swatch: 'line', color: look.site.street, words: drawingText(words, 'drawing.site.key.street') })
  if (drawn.setbacks.length > 0) entries.push({ swatch: 'dash', color: look.colors.dimension, words: drawingText(words, 'drawing.site.key.setback') })
  return entries
}

/** Lays out the site plan of a plan as a picture. A plan with nothing on its site is an empty frame round its origin: the caller refuses it first. */
export function sitePlanPicture(plan: FloorPlan, options: SitePlanPictureOptions = {}): SitePlanPicture {
  const drawn = sitePlan(plan)
  const look = lookOf(options.look)
  const width = Math.max(1, Math.round(options.width ?? DEFAULT_WIDTH))
  const framed = drawn.bounds ?? computeBounds([{ x: 0, y: 0 }, { x: 10, y: 10 }])
  const shape = Math.min(Math.max(framed.height / Math.max(framed.width, 0.001), 0.4), 2.5)
  const height = Math.max(1, Math.round(options.height ?? width * shape))
  const view = fitTo(framed, width / height)
  const mpp = view.width / width
  const shown = displayOfPicture(plan, { ...(options.language === undefined ? {} : { language: options.language }), ...(options.display === undefined ? {} : { labels: { display: options.display } }) })
  const words = wordsOf(shown)
  const units = { ...(shown ?? METRES), decimal: words.decimal }
  const nodes = sitePlanNodes(drawn, look, mpp, words, units, options.paperScale === undefined ? {} : { paperScale: options.paperScale })
  const bar = scaleBar(look, view, mpp, units)
  nodes.push(bar.node)
  if (drawn.north !== null) nodes.push(northArrowNode(drawn.north, view, mpp, look.colors))
  const titled = [plan.title ?? plan.site?.name ?? plan.name, plan.site?.address].filter((part): part is string => part !== undefined)
  const caption = drawingText(words, 'drawing.site.title')
  const title = titled.length === 0 ? caption : `${caption}${drawingText(words, 'join.comma')}${titled.join(drawingText(words, 'join.comma'))}`
  const key = writingBand(title, siteKey(drawn, look, words), width, look.colors, words)
  const count = drawn.buildings.filter((b) => b.pieces.length > 0).length
  const picture: SitePlanPicture = {
    width,
    height,
    view,
    look,
    rooms: 0,
    undecidedDoors: [],
    nodes,
    key,
    title: drawingText(words, count === 1 ? 'drawing.site.picture.one' : 'drawing.site.picture.many', { count }),
    sitePlan: drawn,
    scaleBar: { metres: bar.metres, words: bar.words },
  }
  return words.language === 'en' ? picture : { ...picture, language: words.language }
}
