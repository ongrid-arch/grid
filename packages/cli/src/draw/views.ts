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
import type { Picture } from '@ongrid/viewer/src/picture'
import { LOOKS as PICTURE_LOOKS, comparisonPicture, facadePicture, fileHeight, fullHeight, pictureToSvg, planPicture, PICTURE_FONT, type FaultLine, type PictureShow, type TracePicture } from '@ongrid/viewer/src/picture'
import { planFloors, resolveFloor, type BuildingComparison, type Facade, type FacadeSide } from '@ongrid/floorplan/geometry'
import { el, toSvg } from '@ongrid/viewer/src/picture/svgNode'
import { sectionPicture } from '@ongrid/viewer/src/picture/section'
import type { PlanSection, SectionLine } from '@ongrid/floorplan/geometry/section'
import type { DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { planStill, stillRoofShown } from '@ongrid/viewer/src/still'
import { loadCanvas } from './canvas'
import { registerScriptFonts } from '../sheet/fonts'
import { drawPlan, pictureToPng } from './drawPlan'
import { partBounds, pixelBoxes, type PartBox } from './partBoxes'
import { forSkia } from './skiaText'
import { captionHeight, captioned, withLabelMetadata } from './stamp'

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
  /** The same picture as the viewer's SVG, made only when called (VEW-62). */
  readonly svg?: () => string
  /** Plan views: the plan's metres the picture covers, y up as the plan states it (VEW-62). */
  readonly bounds?: WorldBounds
}

/** VEW-62: the part of the plan, in metres, that a plan picture covers. */
export interface WorldBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** The SVG of a picture as the PNG draws it, made when asked for. */
function svgOf(picture: Picture): () => string {
  return () => pictureToSvg(picture, 1, { label: true })
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
  return { png, width: picture.width, height: fileHeight(picture), pxPerMetre: picture.width / picture.view.width, boxes, undecidedDoors: picture.undecidedDoors, svg: svgOf(picture),
    // The view is in screen coordinates, y down: the plan's y runs the other way.
    bounds: { minX: picture.view.x, minY: -(picture.view.y + picture.view.height), maxX: picture.view.x + picture.view.width, maxY: -picture.view.y } }
}

/**
 * VEW-4: one floor as the preview page draws it: the viewer's own SVG, each part with its
 * `data-id`, and each part's box in the SVG's own frame (plan metres, y down), so the page can
 * frame a room without measuring anything itself.
 */
export function planDrawing(plan: FloorPlan, floor: string, look: 'working' | 'technical' | 'dark', trace?: TracePicture): { svg: string; boxes: Array<{ id: string; kind: string; x: number; y: number; width: number; height: number }> } {
  // VEW-67: the trace image under the plan, as grid_view draws it.
  const picture = planPicture(plan, { floor, look, showDimensions: true, ...(trace === undefined ? {} : { trace }) })
  const round = (n: number): number => Math.round(n * 1000) / 1000
  const boxes = partBounds(plan, floor).map((part) => ({ id: part.id, kind: part.kind, x: round(part.bounds.min.x), y: round(-part.bounds.max.y), width: round(part.bounds.width), height: round(part.bounds.height) }))
  // The page draws this in the plan's own frame and carries the label itself: no caption band here.
  return { svg: pictureToSvg(picture, 1, { label: false }), boxes }
}

/** LVL-9: a section along a line through every floor, with the section it was drawn from. */
export async function sectionView(plan: FloorPlan, line: SectionLine, look: LookName, language?: Language, display?: Display): Promise<PlanView & { readonly section: PlanSection }> {
  // MSG-11: the drawing's own words in the language asked for, else the plan's own.
  const picture = sectionPicture(plan, line, { look: lookOf(look), ...(language === undefined ? {} : { language }), ...(display === undefined ? {} : { display }) })
  const png = await pictureToPng(picture)
  return { png, width: picture.width, height: fileHeight(picture), pxPerMetre: picture.width / picture.view.width, section: picture.section, svg: svgOf(picture) }
}

/**
 * LVL-8: one side of the building in elevation, every floor at its level. The core works out what
 * is seen (`planFacade`); the viewer draws it (`facadePicture`), in the look asked for.
 */
export async function facadeView(plan: FloorPlan, options: { side: FacadeSide; look: LookName; language?: Language; display?: Display }): Promise<PlanView & { readonly facade: Facade }> {
  const picture = facadePicture(plan, { side: options.side, look: lookOf(options.look), ...(options.language === undefined ? {} : { language: options.language }), ...(options.display === undefined ? {} : { display: options.display }) })
  const png = await pictureToPng(picture)
  return { png, width: picture.width, height: fileHeight(picture), pxPerMetre: picture.width / picture.view.width, facade: picture.facade, svg: svgOf(picture) }
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
  return { png, width: picture.width, height: fileHeight(picture), pxPerMetre: picture.width / picture.view.width, floor: shown }
}

/** One drawing of a sheet: a plan, its title, the floor drawn and (VEW-74) its frame and sizes. */
export interface SheetEntry {
  readonly plan: FloorPlan
  readonly title: string
  readonly floor?: string
  readonly frame?: Bounds
  readonly showDimensions?: boolean
}

const SHEET_WIDTH = 2400
const GAP = 40
const TITLE = 48
const FLOOR_NAME = 30

/**
 * Several plans side by side, every one at the same scale, each under its title. MSG-11: the
 * plans' own words and the label in `language`; each plan's own display language when left out.
 * VEW-74: an entry may give the part of the plan to frame and whether to draw its sizes, so the
 * floors of one plan side by side all frame the same part of it.
 */
export async function sheetView(plans: readonly SheetEntry[], look: LookName, language?: Language): Promise<PlanView> {
  const tongue = language === undefined ? {} : { language }
  const canvasModule = await loadCanvas()
  const { createCanvas, loadImage, GlobalFonts } = canvasModule
  registerScriptFonts(canvasModule)
  // The pictures' text is written the way Skia draws it right (`forSkia`, VEW-7).
  const installed = (family: string): boolean => GlobalFonts.has(family)
  // VEW-37: with no floor asked, every floor of a plan is drawn, the highest first, stacked in
  // the plan's column; a plan of one floor, or a floor asked for, is one drawing as before.
  const columns = plans.map((p) => {
    const floors = p.floor ? [p.floor] : planFloors(p.plan).length > 1 ? [...planFloors(p.plan)].reverse().map((f) => f.id) : [null]
    return floors.map((id) => ({ id, name: id === null || floors.length === 1 ? null : (planFloors(p.plan).find((f) => f.id === id)?.name ?? id) }))
  })
  const own = (p: SheetEntry) => ({ ...(p.frame === undefined ? {} : { frame: p.frame }), ...(p.showDimensions === undefined ? {} : { showDimensions: p.showDimensions }) })
  const first = plans.map((p, i) => columns[i]!.map((f) => planPicture(p.plan, { floor: f.id, look: lookOf(look), ...own(p), ...tongue })))
  // One scale for every floor of every option: the columns' widths, in metres, fill the sheet.
  const metres = first.reduce((sum, pictures) => sum + Math.max(...pictures.map((picture) => picture.view.width)), 0)
  const pxPerMetre = (SHEET_WIDTH - GAP * (plans.length - 1)) / metres
  let x = 0
  let tallest = 0
  const parts: string[] = []
  plans.forEach((p, i) => {
    const columnWidth = Math.max(1, Math.round(Math.max(...first[i]!.map((picture) => picture.view.width)) * pxPerMetre))
    let y = TITLE
    columns[i]!.forEach((f, j) => {
      const view = first[i]![j]!.view
      const width = Math.max(1, Math.round(view.width * pxPerMetre))
      const height = Math.max(1, Math.round(view.height * pxPerMetre))
      const picture = planPicture(p.plan, { floor: f.id, look: lookOf(look), width, height, ...own(p), ...tongue })
      if (f.name !== null) {
        parts.push(toSvg(forSkia([el('text', { x: x + columnWidth / 2, y: y + FLOOR_NAME - 8, 'text-anchor': 'middle', 'font-family': PICTURE_FONT, 'font-size': 20, fill: '#000000' }, [f.name])], installed)))
        y += FLOOR_NAME
      }
      // One label for the whole sheet, stamped below, not one per plan (MSG-3).
      const svg = pictureToSvg({ ...picture, nodes: forSkia(picture.nodes, installed) }, 1, { label: false })
      parts.push(svg.replace(/^<svg /, `<svg x="${x + Math.round((columnWidth - width) / 2)}" y="${y}" `))
      // The drawing's own band of title and key sits under it: count it, so it is never cut off.
      y += fullHeight(picture) + (f.name !== null ? 8 : 0)
    })
    const title = el('text', { x: x + columnWidth / 2, y: TITLE - 14, 'text-anchor': 'middle', 'font-family': PICTURE_FONT, 'font-size': 28, fill: '#000000' }, [p.title])
    parts.push(toSvg(forSkia([title], installed)))
    x += columnWidth + GAP
    tallest = Math.max(tallest, y - TITLE)
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
  // VEW-17: one label for the whole sheet, in a caption band under the plans.
  const captionedSheet = captioned(createCanvas, canvas, { paper, ink: PICTURE_LOOKS[lookOf(look)].colors.labelSoft }, language)
  return { png: withLabelMetadata(await captionedSheet.encode('png'), language), width, height: captionedSheet.height, pxPerMetre }
}

const STILL_W = 1200
const STILL_H = 800
const DEG = Math.PI / 180

async function png(image: { data: Uint8ClampedArray; width: number; height: number }, language?: Language): Promise<Uint8Array> {
  const { createCanvas, ImageData } = await loadCanvas()
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
  // VEW-17: the label in a caption band under the picture, and in the file's own metadata.
  return withLabelMetadata(await captioned(createCanvas, canvas, undefined, language).encode('png'), language)
}

export interface CameraView {
  readonly png: Uint8Array
  /** VEW-3: the camera the picture was taken with, the one record the app's 3D view opens at too. */
  readonly camera: CameraRecord
  /** VEW-19: whether the roof is drawn. */
  readonly roof: boolean
}

/**
 * VEW-3: the 3D model as one camera record sees it, with its floor cut away (`cut`). The picture
 * is the app's own scene, taken with `recordCamera`, the settings the app's 3D view opens at for
 * the same record. A camera outside every room sees the ground grid; one in a room does not.
 * VEW-19: the roof is drawn as `roof` says, else as every still decides (`stillRoofShown`).
 */
export async function cameraView(plan: FloorPlan, camera: CameraRecord, language?: Language, roof?: boolean): Promise<CameraView> {
  const drawn = roof ?? stillRoofShown(plan, { focus: camera.cut, inside: camera.standingIn.room !== null })
  // VEW-17: the caption band under the still is part of its size.
  // VEW-26: a record framed in portrait (a tower) is drawn standing up, as many pixels.
  const [width, height] = camera.aspectRatio < 1 ? [STILL_H, STILL_W] : [STILL_W, STILL_H]
  const image = planStill(plan, { camera, width, height: height - captionHeight(width), look: 'light', supersample: 2, roof: drawn })
  return { png: await png(image, language), camera, roof: drawn }
}

/**
 * Where to stand in a room to look toward a point or a heading (degrees clockwise from the top
 * of the drawing): back from its middle, away from what is looked at, so more of the room is seen.
 */
export function eyeStand(polygon: readonly Vec2[], toward: Vec2 | number, holes: readonly (readonly Vec2[])[] = []): Vec2 {
  const centre = poleOfInaccessibility(polygon, undefined, holes).point
  const heading = typeof toward === 'number' ? toward : ((Math.atan2(toward.x - centre.x, toward.y - centre.y) / DEG) % 360 + 360) % 360
  return standBack(polygon, holes, centre, heading)
}

/** A point behind the room's middle, opposite the heading, still well inside the room. */
function standBack(polygon: readonly Vec2[], holes: readonly (readonly Vec2[])[], centre: Vec2, heading: number): Vec2 {
  const dir = { x: -Math.sin(heading * DEG), y: -Math.cos(heading * DEG) }
  let best = centre
  for (let step = 0.25; step < 20; step += 0.25) {
    const p = { x: centre.x + dir.x * step, y: centre.y + dir.y * step }
    if (!insideBy(polygon, p, 0.4) || holes.some((hole) => insideBy(hole, p, 0) || !outsideBy(hole, p, 0.4))) break
    best = p
  }
  return best
}

/** Whether a point is at least `margin` from every side of a hole. */
function outsideBy(ring: readonly Vec2[], p: Vec2, margin: number): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < margin) return false
  }
  return true
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
