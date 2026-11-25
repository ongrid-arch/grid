/**
 * `drawStill`: a PNG of the plan's 3D model as the app opens it, from a plain function call.
 * No browser, no running app and no GPU. This is what `grid draw --3d` calls.
 *
 * The picture comes from `planStill` in `@ongrid/viewer`: the app's own 3D scene, taken with
 * the app's opening camera (`OPENING_CAMERA`) and drawn in software, flat-shaded and without
 * shadows. The pixels become a PNG through `@napi-rs/canvas` (MIT), loaded on the first
 * still, as for a 2D PNG.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Language } from '@ongrid/floorplan/messages'
import { DEFAULT_STILL_HEIGHT, DEFAULT_STILL_WIDTH, planStill, type StillOptions } from '@ongrid/viewer/src/still'
import { loadCanvas } from './canvas'
import { captioned, withLabelMetadata } from './stamp'

export interface StillDrawOptions extends Omit<StillOptions, 'width' | 'height'> {
  /** In pixels, before `scale`: 1200 by 800 by default. */
  readonly width?: number
  readonly height?: number
  /** Pixels per picture pixel, as for a 2D PNG: 2 gives a still twice as wide and tall. 1 by default. */
  readonly scale?: number
  /** MSG-3: the label in the top-left corner. On by default; off where the page carries it (a sheet). */
  readonly label?: boolean
  /** MSG-11: the language the label is written in. English when left out. */
  readonly language?: Language
}

/**
 * Draws the plan's 3D model and resolves to the PNG file's bytes.
 *
 * `focus` names a floor to show as a cutaway, as the app does when a floor is chosen; the
 * whole building is shown without it. `look` is `light` (the default) or your own colours;
 * SHT-10: a file is always light, so `dark` draws `light`.
 *
 * The plan is not checked here: parse and validate it first. Whatever part of a broken plan
 * cannot be built is left out, as in the app.
 *
 * ```ts
 * writeFileSync('model.png', await drawStill(plan))
 * ```
 */
export async function drawStill(plan: FloorPlan, options: StillDrawOptions = {}): Promise<Uint8Array> {
  const { scale = 1, width = DEFAULT_STILL_WIDTH, height = DEFAULT_STILL_HEIGHT, label = true, language, ...still } = options
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError(`The scale must be a number above 0: got ${scale}`)
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  if (w < 1 || h < 1) throw new RangeError(`A scale of ${scale} leaves no pixels to draw`)

  const image = planStill(plan, { ...still, ...(still.look === 'dark' ? { look: 'light' as const } : {}), width: w, height: h })

  // Loaded only for a picture: it is a native module.
  const { createCanvas, ImageData } = await loadCanvas()
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
  // VEW-17: the label in a caption band under the picture, and in the file's own metadata.
  if (!label) return canvas.encode('png')
  return withLabelMetadata(await captioned(createCanvas, canvas, undefined, language).encode('png'), language)
}
