/**
 * `drawPlan`: a picture of one floor of a plan, as SVG or PNG, from a plain function call.
 * No browser and no running app. This is what `grid draw plan.json` will call.
 *
 * The SVG comes from `planToSvg` in `@ongrid/viewer`: the same elements the app's 2D view
 * draws, with the colours, line widths and font written in. The PNG is that SVG drawn by
 * Skia through `@napi-rs/canvas` (MIT), which ships a prebuilt binary for Linux, macOS and
 * Windows and needs nothing else installed. It is loaded on the first PNG, not before.
 *
 * Text is drawn in the first font of `PICTURE_FONT` the machine has, so a PNG's letters can
 * differ slightly between machines. Where labels go does not: it is worked out from a
 * fixed estimate of text width, never from the font. In the PNG, a run of CJK, Thai,
 * Devanagari or emoji is drawn in a system font that has it, and every text where a browser
 * puts it (`forSkia`).
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { FacadePictureOptions, Picture, PictureOptions } from '@ongrid/viewer/src/picture'
import { facadePicture, fileHeight, fileLookOf, pictureToSvg, planPicture } from '@ongrid/viewer/src/picture'
import { loadCanvas } from './canvas'
import { registerScriptFonts } from '../sheet/fonts'
import { forSkia } from './skiaText'
import { withLabelMetadata } from './stamp'

export type { PictureOptions }

export interface DrawOptions extends PictureOptions {
  readonly format: 'svg' | 'png'
  /**
   * PNG only: pixels per picture pixel, for a sharper image. 1 by default, so a PNG is as
   * many pixels as `width` and `height` say. 2 gives a picture twice as wide and tall, with
   * the same drawing.
   */
  readonly scale?: number
  /** MSG-3, VEW-17: the label in a caption band under the drawing. On by default; off where the page carries it (a sheet). */
  readonly label?: boolean
}

/**
 * Draws one floor of a plan. Asynchronous because the PNG is decoded and encoded off the
 * main thread; for the SVG alone, `planToSvg` in `@ongrid/viewer` gives the same text
 * synchronously.
 *
 * - `format: 'svg'` resolves to the SVG file as text.
 * - `format: 'png'` resolves to the PNG file's bytes.
 *
 * Every other option is `planToSvg`'s: `floor` (the ground floor by default), `width` (1200 px by
 * default), `height` (follows the plan's shape by default), `look` (`working`, the default,
 * or `technical`, or your own colours; SHT-10: a file is always on light paper, so `dark`, or
 * colours of your own on dark paper, draw the working look), `paperScale` (the technical look's 1:N) and
 * `showDimensions` (on by default) and `faults` (the result record's lines, to mark what went
 * wrong on the drawing and list it under it; none by default).
 *
 * The plan is not checked here: parse and validate it first. Whatever part of a broken plan
 * cannot be drawn is left out, as in the app.
 *
 * ```ts
 * writeFileSync('plan.svg', await drawPlan(plan, { format: 'svg' }))
 * writeFileSync('plan.png', await drawPlan(plan, { format: 'png', scale: 2 }))
 * ```
 */
export function drawPlan(plan: FloorPlan, options: DrawOptions & { format: 'svg' }): Promise<string>
export function drawPlan(plan: FloorPlan, options: DrawOptions & { format: 'png' }): Promise<Uint8Array>
export function drawPlan(plan: FloorPlan, options: DrawOptions): Promise<string | Uint8Array>
export async function drawPlan(plan: FloorPlan, options: DrawOptions): Promise<string | Uint8Array> {
  const { format, scale = 1, label = true, ...pictureOptions } = options
  // SHT-10: a file is drawn on light paper, whatever the screen's theme.
  const picture = planPicture(plan, { ...pictureOptions, look: fileLookOf(pictureOptions.look) })
  if (format === 'svg') return pictureToSvg(picture, 1, { label })
  if (format !== 'png') throw new RangeError(`Grid draws SVG or PNG, not ${String(format)}`)
  return pictureToPng(picture, { scale, label })
}

/**
 * LVL-8: one facade of a plan, as SVG or PNG: the side of the drawing (`side`, north its top),
 * every floor at its level, in the look's elevation line weights, with the label (MSG-3). The
 * geometry is the core's (`planFacade`); the viewer draws it (`facadePicture`).
 */
export function drawFacade(plan: FloorPlan, options: FacadePictureOptions & { format: 'svg'; label?: boolean }): Promise<string>
export function drawFacade(plan: FloorPlan, options: FacadePictureOptions & { format: 'png'; scale?: number; label?: boolean }): Promise<Uint8Array>
export function drawFacade(plan: FloorPlan, options: FacadePictureOptions & { format: 'svg' | 'png'; scale?: number; label?: boolean }): Promise<string | Uint8Array>
export async function drawFacade(plan: FloorPlan, options: FacadePictureOptions & { format: 'svg' | 'png'; scale?: number; label?: boolean }): Promise<string | Uint8Array> {
  const { format, scale = 1, label = true, ...pictureOptions } = options
  const picture = facadePicture(plan, { ...pictureOptions, look: fileLookOf(pictureOptions.look) })
  if (format === 'svg') return pictureToSvg(picture, 1, { label })
  if (format !== 'png') throw new RangeError(`Grid draws SVG or PNG, not ${String(format)}`)
  return pictureToPng(picture, { scale, label })
}

/** A picture the viewer laid out, as a PNG's bytes: a plan's (`drawPlan`), or a comparison's (WRT-8). */
export async function pictureToPng(picture: Picture, options: { readonly scale?: number; readonly label?: boolean } = {}): Promise<Uint8Array> {
  const { scale = 1, label = true } = options
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError(`The scale must be a number above 0: got ${scale}`)

  const width = Math.round(picture.width * scale)
  const height = Math.round(fileHeight(picture, label) * scale)
  if (width < 1 || height < 1) throw new RangeError(`A scale of ${scale} leaves no pixels to draw`)

  // Loaded only for a PNG: it is a native module, and an SVG needs none of it.
  const canvasModule = await loadCanvas()
  const { createCanvas, loadImage, GlobalFonts } = canvasModule
  registerScriptFonts(canvasModule)

  // The SVG is written at the PNG's own size, so Skia draws it at full resolution rather than
  // enlarging a smaller image. Its text is written the way Skia draws it right (`forSkia`).
  const installed = (family: string): boolean => GlobalFonts.has(family)
  const nodes = forSkia(picture.nodes, installed)
  const key = picture.key && { ...picture.key, nodes: forSkia(picture.key.nodes, installed) }
  const image = await loadImage(Buffer.from(pictureToSvg({ ...picture, nodes, key }, scale, { label })))

  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  // The paper, under the drawing's own, so no corner is ever left transparent.
  context.fillStyle = picture.look.colors.paper
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const file = await canvas.encode('png')
  // VEW-17: the label is in the file's own metadata as well as in its caption band.
  return label ? withLabelMetadata(file, picture.language) : file
}
