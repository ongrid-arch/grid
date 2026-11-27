/**
 * VEW-62: a picture `grid_view` drew, written to a file in the project: a PNG, an SVG or a PDF,
 * and beside it a small JSON that says how the picture sits on the plan. The files go through
 * the project's own file access, so a path outside the project, or through a link out of it,
 * is refused as everywhere.
 */
import path from 'node:path'
import { say } from '@ongrid/floorplan/messages'
import type { SKRSContext2D } from '@napi-rs/canvas'
import { pathProblem, type Project } from '../fs/projectFiles'
import { writeBesidePlan } from '../command/export'
import { loadCanvas } from './canvas'
import type { WorldBounds } from './views'
import { EXPORTS_DIR } from '../export/projectExports'
import { worldFileText, type PixelTransform } from './pictureTransform'

export const PICTURE_EXTENSIONS = ['.png', '.svg', '.pdf'] as const
export type PictureExtension = (typeof PICTURE_EXTENSIONS)[number]

/** What a view says of its picture, for the file beside it. */
export interface PictureRecord {
  readonly kind: string
  readonly floor: string | null
  readonly pxPerMetre: number | null
  readonly bounds: WorldBounds | null
  readonly pixelToMetres: PixelTransform | null
  readonly panels?: readonly { readonly floor: string | null; readonly pixelToMetres: PixelTransform }[]
}

export class PictureOutRefused extends Error {}

/** The extension an `out` name ends in, or a refusal naming the three. */
export function pictureExtension(out: string): PictureExtension {
  const ext = path.extname(out).toLowerCase()
  if (!(PICTURE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new PictureOutRefused(`out must name a ${PICTURE_EXTENSIONS.join(', ')} file: the picture is written as the name ends.`)
  }
  return ext as PictureExtension
}

/** The size in pixels a PNG's header gives. */
export function pngSize(png: Uint8Array): { readonly width: number; readonly height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** One PDF page, the picture's size in points (a pixel is a point), holding the PNG. */
export async function pngToPdf(png: Uint8Array, title: string): Promise<Uint8Array> {
  const canvas = await loadCanvas()
  const { width, height } = pngSize(png)
  const doc = new canvas.PDFDocument({ title, creator: 'Grid', producer: 'Grid' })
  const ctx = doc.beginPage(width, height) as SKRSContext2D
  ctx.drawImage(await canvas.loadImage(Buffer.from(png)), 0, 0, width, height)
  doc.endPage()
  return new Uint8Array(doc.close())
}

/** The JSON file's name beside a picture: `.view.json`, so a picture named like its plan never replaces it. */
export function recordName(out: string): string {
  return `${out.slice(0, out.length - path.extname(out).length)}.view.json`
}

export function worldFileName(out: string): string {
  return `${out.slice(0, -'.png'.length)}.pgw`
}

export interface PictureWritten {
  readonly picture: string
  readonly record: string
  readonly worldFile: string | null
}

/**
 * Writes the picture and its record. A bare name goes into `exports/` beside the plan, as every
 * export does; a name with a folder is written where it says, inside the project.
 */
export function writePicture(
  project: Project,
  planFile: string,
  out: string,
  data: string | Uint8Array,
  record: PictureRecord & { readonly width: number; readonly height: number },
  gridVersion: string,
): PictureWritten {
  const problem = pathProblem(out)
  if (problem !== null) throw new PictureOutRefused(`out ${JSON.stringify(out)} is refused: ${problem}.`)
  const name = recordName(out)
  const plain = path.basename(out) === out && !out.includes('\\')
  const json = JSON.stringify({ file: path.basename(out), ...record, ...(record.bounds === null ? {} : { pixel: 'x = (worldX - bounds.minX) * pxPerMetre, y = (bounds.maxY - worldY) * pxPerMetre, from the top-left corner' }), gridVersion }, null, 2) + '\n'
  const world = path.extname(out).toLowerCase() === '.png' && record.pixelToMetres !== null
    ? { name: worldFileName(out), text: worldFileText(record.pixelToMetres) }
    : null
  const target = (given: string): string => plain ? path.join(path.dirname(planFile), EXPORTS_DIR, given) : given
  const paths = [out, name, ...(world === null ? [] : [world.name])].map((given) => project.writable(target(given)))
  if (new Set(paths).size !== paths.length || paths.includes(project.resolve(planFile))) {
    throw new PictureOutRefused(say('en', 'view.files.distinct'))
  }
  const write = (given: string, body: string | Uint8Array): string =>
    project.relative(plain ? writeBesidePlan(project, planFile, given, body) : project.writeFile(given, body))
  return { picture: write(out, data), record: write(name, json), worldFile: world === null ? null : write(world.name, world.text) }
}
