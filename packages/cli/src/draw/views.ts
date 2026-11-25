/**
 * The named views the tool server draws: a floor plan, a sheet of plans side by side at one
 * scale, a facade (LVL-8), the 3D model from a side of the drawing, an eye-level view from inside
 * a room, and a section along a line (LVL-9).
 *
 * Every picture is the viewer's own drawing (`planPicture`, `planStill`): only the camera and
 * the frame are chosen here. A 3D picture is taken from one camera record (VEW-3, `cameraAsk.ts`).
 */
import type { Display } from '@ongrid/floorplan/types/units'
import type { Language } from '@ongrid/floorplan/messages'
import { poleOfInaccessibility, type Bounds, type CameraRecord, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import { LOOKS as PICTURE_LOOKS, comparisonPicture, facadePicture, fullHeight, pictureToSvg, planPicture, PICTURE_FONT, type FaultLine, type PictureShow, type TracePicture } from '@ongrid/viewer/src/picture'
import { resolveFloor, type BuildingComparison, type Facade, type FacadeSide } from '@ongrid/floorplan/geometry'
import { el, toSvg } from '@ongrid/viewer/src/picture/svgNode'
import { sectionPicture } from '@ongrid/viewer/src/picture/section'
import type { PlanSection, SectionLine } from '@ongrid/floorplan/geometry/section'
import type { DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { planStill } from '@ongrid/viewer/src/still'
import { loadCanvas } from './canvas'
import { registerScriptFonts } from '../sheet/fonts'
import { drawPlan, pictureToPng } from './drawPlan'
import { partBounds, pixelBoxes, type PartBox } from './partBoxes'
import { forSkia } from './skiaText'
import { stampLabel } from './stamp'

import { pictureLook, type LookName } from './viewNames'

/** SHT-10: a picture for an agent is always on light paper (`pictureLook`). */
function lookOf(look: LookName): 'working' | 'technical' {
  return pictureLook(look)
}

export interface PlanView {
  readonly png: Uint8Array
  readonly width: number
  readonly height: number
  readonly pxPerMetre: number
  /** Plan views: where each room, opening and wall is on the picture, in image pixels (VEW-6). */
  readonly boxes?: readonly PartBox[]
  /** Plan views: the doors drawn with the "undecided" mark (`Picture.undecidedDoors`). */
  readonly undecidedDoors?: readonly string[]
}

export async function planView(
  plan: FloorPlan,
  options: { floor?: string; look: LookName; dimensions: boolean; ids?: boolean; display?: Display; frame?: Bounds; faults?: readonly FaultLine[]; show?: PictureShow; language?: Language; marks?: DrawingMarksAsked; trace?: TracePicture },
): Promise<PlanView> {
  // VEW-2's check view: every room, door and window carries its id. VEW-6: a frame crops.
  // MSG-8: the result record's lines, marked on the drawing and listed under it.
  const extra = {
    ...(options.ids || options.display ? { labels: { ...(options.ids ? { ids: true } : {}), ...(options.display ? { display: options.display } : {}) } } : {}),
    ...(options.frame ? { frame: options.frame } : {}),
    ...(options.faults ? { faults: options.faults } : {}),
    // SHT-7: what the picture shows.
    ...(options.show ? { show: options.show } : {}),
    // MSG-11: Grid's own words on the drawing in this language (the display's own when left out).
    ...(options.language ? { language: options.language } : {}),
    // LVL-9: the marks for the plan's other drawings.
    ...(options.marks ? { marks: options.marks } : {}),
    // HND-10: the trace image under the plan, read from the project folder by the caller.
    ...(options.trace ? { trace: options.trace } : {}),
  }
  const picture = planPicture(plan, { floor: options.floor ?? null, look: lookOf(options.look), showDimensions: options.dimensions, ...extra })
  const png = await drawPlan(plan, { format: 'png', floor: options.floor, look: lookOf(options.look), showDimensions: options.dimensions, ...extra })
  const boxes = pixelBoxes(partBounds(plan, options.floor), picture)
  return { png, width: picture.width, height: fullHeight(picture), pxPerMetre: picture.width / picture.view.width, boxes, undecidedDoors: picture.undecidedDoors }
}

/**
 * VEW-4: one floor as the preview page draws it: the viewer's own SVG, each part with its
 * `data-id`, and each part's box in the SVG's own frame (plan metres, y down), so the page can
 * frame a room without measuring anything itself.
 */
export function planDrawing(plan: FloorPlan, floor: string, look: 'working' | 'technical' | 'dark'): { svg: string; boxes: Array<{ id: string; kind: string; x: number; y: number; width: number; height: number }> } {
  const picture = planPicture(plan, { floor, look, showDimensions: true })
  const round = (n: number): number => Math.round(n * 1000) / 1000
  const boxes = partBounds(plan, floor).map((part) => ({ id: part.id, kind: part.kind, x: round(part.bounds.min.x), y: round(-part.bounds.max.y), width: round(part.bounds.width), height: round(part.bounds.height) }))
  return { svg: pictureToSvg(picture), boxes }
}

/** LVL-9: a section along a line through every floor, with the section it was drawn from. */
export async function sectionView(plan: FloorPlan, line: SectionLine, look: LookName, language?: Language): Promise<PlanView & { readonly section: PlanSection }> {
  // MSG-11: the drawing's own words in the language asked for, else the plan's own.
  const picture = sectionPicture(plan, line, { look: lookOf(look), ...(language === undefined ? {} : { language }) })
  const png = await pictureToPng(picture)
  return { png, width: picture.width, height: fullHeight(picture), pxPerMetre: picture.width / picture.view.width, section: picture.section }
}

/**
 * LVL-8: one side of the building in elevation, every floor at its level. The core works out what
 * is seen (`planFacade`); the viewer draws it (`facadePicture`), in the look asked for.
 */
export async function facadeView(plan: FloorPlan, options: { side: FacadeSide; look: LookName; language?: Language }): Promise<PlanView & { readonly facade: Facade }> {
  const picture = facadePicture(plan, { side: options.side, look: lookOf(options.look), ...(options.language === undefined ? {} : { language: options.language }) })
  const png = await pictureToPng(picture)
  return { png, width: picture.width, height: fullHeight(picture), pxPerMetre: picture.width / picture.view.width, facade: picture.facade }
}

/**
 * WRT-8: a comparison as one picture of a floor: the later plan pale, what was removed and added
 * in their colours, and the changed rooms labelled with their old and new area. The core says
 * what changed (`marks`); the viewer draws it (`comparisonPicture`).
 */
export async function comparisonView(comparison: Pick<BuildingComparison, 'aligned' | 'marks'>, later: FloorPlan, floor: string | undefined): Promise<PlanView & { readonly floor: string }> {
  const shown = resolveFloor(later, floor)
  const picture = comparisonPicture(comparison.aligned, later, comparison.marks, { floor: shown })
  const png = await pictureToPng(picture)
  return { png, width: picture.width, height: fullHeight(picture), pxPerMetre: picture.width / picture.view.width, floor: shown }
}

const SHEET_WIDTH = 2400
const GAP = 40
const TITLE = 48

/**
 * Several plans side by side, every one at the same scale, each under its title. MSG-11: the
 * plans' own words and the label in `language`; each plan's own display language when left out.
 */
export async function sheetView(plans: readonly { plan: FloorPlan; title: string; floor?: string }[], look: LookName, language?: Language): Promise<PlanView> {
  const tongue = language === undefined ? {} : { language }
  const canvasModule = await loadCanvas()
  const { createCanvas, loadImage, GlobalFonts } = canvasModule
  registerScriptFonts(canvasModule)
  // The pictures' text is written the way Skia draws it right (`forSkia`, VEW-7).
  const installed = (family: string): boolean => GlobalFonts.has(family)
  const first = plans.map((p) => planPicture(p.plan, { floor: p.floor ?? null, look: lookOf(look), ...tongue }))
  const metres = first.reduce((sum, picture) => sum + picture.view.width, 0)
  const pxPerMetre = (SHEET_WIDTH - GAP * (plans.length - 1)) / metres
  let x = 0
  let tallest = 0
  const parts: string[] = []
  plans.forEach((p, i) => {
    const view = first[i]!.view
    const width = Math.max(1, Math.round(view.width * pxPerMetre))
    const height = Math.max(1, Math.round(view.height * pxPerMetre))
    const picture = planPicture(p.plan, { floor: p.floor ?? null, look: lookOf(look), width, height, ...tongue })
    // One label for the whole sheet, stamped below, not one per plan (MSG-3).
    const svg = pictureToSvg({ ...picture, nodes: forSkia(picture.nodes, installed) }, 1, { label: false })
    parts.push(svg.replace(/^<svg /, `<svg x="${x}" y="${TITLE}" `))
    const title = el('text', { x: x + width / 2, y: TITLE - 14, 'text-anchor': 'middle', 'font-family': PICTURE_FONT, 'font-size': 28, fill: '#000000' }, [p.title])
    parts.push(toSvg(forSkia([title], installed)))
    x += width + GAP
    tallest = Math.max(tallest, height)
  })
  const width = x - GAP
  const height = tallest + TITLE
  const paper = PICTURE_LOOKS[lookOf(look)].colors.paper
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${paper}"/>${parts.join('')}</svg>`
  const image = await loadImage(Buffer.from(sheet))
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = paper
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  stampLabel(context, width, { paper, ink: PICTURE_LOOKS[lookOf(look)].colors.labelSoft }, language)
  return { png: await canvas.encode('png'), width, height, pxPerMetre }
}

const STILL_W = 1200
const STILL_H = 800
const DEG = Math.PI / 180

async function png(image: { data: Uint8ClampedArray; width: number; height: number }, language?: Language): Promise<Uint8Array> {
  const { createCanvas, ImageData } = await loadCanvas()
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
  stampLabel(context, image.width, undefined, language)
  return canvas.encode('png')
}

export interface CameraView {
  readonly png: Uint8Array
  /** VEW-3: the camera the picture was taken with, the one record the app's 3D view opens at too. */
  readonly camera: CameraRecord
}

/**
 * VEW-3: the 3D model as one camera record sees it, with its floor cut away (`cut`). The picture
 * is the app's own scene, taken with `recordCamera`, the settings the app's 3D view opens at for
 * the same record. A camera outside every room sees the ground grid; one in a room does not.
 */
export async function cameraView(plan: FloorPlan, camera: CameraRecord, language?: Language): Promise<CameraView> {
  const image = planStill(plan, { camera, width: STILL_W, height: STILL_H, look: 'light', supersample: 2 })
  return { png: await png(image, language), camera }
}

/**
 * Where to stand in a room to look toward a point or a heading (degrees clockwise from the top
 * of the drawing): back from its middle, away from what is looked at, so more of the room is seen.
 */
export function eyeStand(polygon: readonly Vec2[], toward: Vec2 | number): Vec2 {
  const centre = poleOfInaccessibility(polygon).point
  const heading = typeof toward === 'number' ? toward : ((Math.atan2(toward.x - centre.x, toward.y - centre.y) / DEG) % 360 + 360) % 360
  return standBack(polygon, centre, heading)
}

/** A point behind the room's middle, opposite the heading, still well inside the room. */
function standBack(polygon: readonly Vec2[], centre: Vec2, heading: number): Vec2 {
  const dir = { x: -Math.sin(heading * DEG), y: -Math.cos(heading * DEG) }
  let best = centre
  for (let step = 0.25; step < 20; step += 0.25) {
    const p = { x: centre.x + dir.x * step, y: centre.y + dir.y * step }
    if (!insideBy(polygon, p, 0.4)) break
    best = p
  }
  return best
}

function insideBy(polygon: readonly Vec2[], p: Vec2, margin: number): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside
  }
  if (!inside) return false
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < margin) return false
  }
  return true
}
