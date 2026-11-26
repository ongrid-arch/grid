/**
 * SHT-6: the sheet at a true scale as its three files. The SVG is `drawingSheetSvg`; the PDF and
 * the PNG draw the same elements with `drawVector`: the PDF as vector paths and text on a page
 * of the paper's size, the PNG on a canvas. Both run wherever `@napi-rs/canvas` has a binary
 * (Linux, macOS and Windows), with no image step of the system's own.
 */
import type { SKRSContext2D } from '@napi-rs/canvas'
import { loadCanvas } from '../draw/canvas'
import { registerSheetFonts, SANS, sheetFont } from './fonts'
import { drawingSheetSvg, type DrawingSheet, type MeasureText } from './drawingSheet'
import { drawVector } from './vector'

/** Points in a millimetre: a PDF page is measured in points, 72 to the inch. */
export const POINTS_PER_MM = 72 / 25.4

/** The PNG's resolution, in dots per inch, and the most pixels on its longer side. */
export const PNG_DPI = 150
export const PNG_MAX_SIDE = 4000

/** Text measured with the sheet's sans face, in millimetres (`MeasureText`). */
export async function sheetMeasure(): Promise<MeasureText> {
  const canvas = await loadCanvas()
  registerSheetFonts(canvas)
  const ctx = canvas.createCanvas(10, 10).getContext('2d')
  ctx.textRendering = 'optimizeSpeed'
  return (text, size, bold = false) => {
    ctx.font = sheetFont(SANS, 100, bold ? 600 : 400)
    return (ctx.measureText(text).width * size) / 100
  }
}

/** SHT-20: one PDF of every page, and an SVG and a PNG of each page, in order. */
export interface DrawingFiles {
  readonly pdf: Uint8Array
  readonly svgs: readonly string[]
  readonly pngs: readonly Uint8Array[]
}

/** The sheet's PDF: one page of the paper's size for each sheet (SHT-20), every line and letter vector. */
export async function drawingSheetPdf(sheet: DrawingSheet | readonly DrawingSheet[], title: string): Promise<Uint8Array> {
  const canvas = await loadCanvas()
  registerSheetFonts(canvas)
  const doc = new canvas.PDFDocument({ title, creator: 'Grid', producer: 'Grid' })
  for (const page of Array.isArray(sheet) ? sheet : [sheet as DrawingSheet]) {
    const ctx = doc.beginPage(page.paper.width * POINTS_PER_MM, page.paper.height * POINTS_PER_MM) as SKRSContext2D
    ctx.scale(POINTS_PER_MM, POINTS_PER_MM)
    drawVector(ctx, canvas, page.nodes)
    doc.endPage()
  }
  return new Uint8Array(doc.close())
}

/** The PNG's pixels per millimetre: `PNG_DPI`, less on a paper so large its longer side would pass `PNG_MAX_SIDE`. */
export function pngPixelsPerMm(sheet: DrawingSheet): number {
  const longer = Math.max(sheet.paper.width, sheet.paper.height)
  return Math.min(PNG_DPI / 25.4, PNG_MAX_SIDE / longer)
}

/** The sheet as a PNG to share: the same drawing, on white. */
export async function drawingSheetPng(sheet: DrawingSheet): Promise<Uint8Array> {
  const canvas = await loadCanvas()
  registerSheetFonts(canvas)
  const k = pngPixelsPerMm(sheet)
  const surface = canvas.createCanvas(Math.round(sheet.paper.width * k), Math.round(sheet.paper.height * k))
  const ctx = surface.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, surface.width, surface.height)
  ctx.scale(k, k)
  drawVector(ctx, canvas, sheet.nodes)
  return new Uint8Array(await surface.encode('png'))
}

export async function drawingSheetFiles(sheets: readonly DrawingSheet[], title: string): Promise<DrawingFiles> {
  const pngs: Uint8Array[] = []
  for (const sheet of sheets) pngs.push(await drawingSheetPng(sheet))
  return { pdf: await drawingSheetPdf(sheets, title), svgs: sheets.map(drawingSheetSvg), pngs }
}
