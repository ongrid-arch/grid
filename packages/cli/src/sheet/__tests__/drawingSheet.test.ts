import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture } from '@ongrid/viewer/src/picture'
import type { SvgChild, SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { loadCanvas } from '../../draw/canvas'
import { DrawingDoesNotFit, drawingSheet, drawingSheetSvg, PAPERS, scaleBarMetres, TEXT_MM, type DrawingRequest } from '../drawingSheet'
import { drawingSheetPdf, drawingSheetPng, pngPixelsPerMm, sheetMeasure } from '../drawingFiles'
import { VECTOR_TAGS, vectorAttribute, vectorIgnores } from '../vector'
import { extentOf, readPdf, type PdfPath } from './readPdf'

/**
 * SHT-6: one printable sheet at a true scale. The PDF is read back as a printer reads it, and
 * measured: a 10 m wall at 1:100 is 100 mm on the page. Its words are read back as text.
 */

const loaded = (plan: FloorPlan) => ({ file: 'plan.json', plan, ...validatePlan(plan) })
const date = new Date('2026-11-22T12:00:00Z')
const measure = await sheetMeasure()
const sheetOf = (plan: FloorPlan, request: DrawingRequest, language?: 'en' | 'es') =>
  drawingSheet(loaded(plan), request, { project: 'Test house', date, measure, ...(language ? { language } : {}) })

/** One free-standing wall, 10 m long and 0.2 m thick, along x. */
const oneWall = parseFloorPlan({
  version: '1',
  units: 'm',
  walls: [{ id: 'w', start: [0, 0], end: [10, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }],
  rooms: [],
  openings: [],
})

/** A 10 by 6 m room, its outside walls 0.2 m thick on their centre lines, north stated. */
function box(north?: number): FloorPlan {
  const corners: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]]
  return parseFloorPlan({
    version: '1',
    units: 'm',
    ...(north === undefined ? {} : { north }),
    walls: corners.map((start, i) => ({ id: `w${i}`, start, end: corners[(i + 1) % 4], thickness: 0.2, height: 2.7, kind: 'exterior' })),
    rooms: [{ id: 'r', name: 'Studio', boundary: ['w0', 'w1', 'w2', 'w3'], use: 'living' }],
    openings: [],
  })
}

const flat = parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.plan.json'), 'utf8')))

/** The paths painted inside the floor's drawing, filled with something other than paper. */
function inkInside(paths: readonly PdfPath[], area: { x: number; y: number; width: number; height: number }): PdfPath[] {
  return paths.filter((p) => p.paint.startsWith('f') && p.fill !== '1 1 1' && p.points.length > 0 && p.points.every((q) => q.x >= area.x - 0.01 && q.x <= area.x + area.width + 0.01 && q.y >= area.y - 0.01 && q.y <= area.y + area.height + 0.01))
}

function* walk(nodes: readonly SvgChild[]): Generator<SvgNode> {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    yield node
    yield* walk(node.children)
  }
}

describe('a sheet at a true scale (SHT-6)', () => {
  it('prints a 10 m wall 100 mm long at 1:100 on A4, measured on the PDF', async () => {
    const sheet = sheetOf(oneWall, { scale: 100, paper: 'A4' })
    const page = readPdf(await drawingSheetPdf(sheet, 'test'))
    expect(page.hasImage).toBe(false)
    const wall = extentOf(inkInside(page.paths, sheet.drawing).filter((p) => p.fill === '0.349 0.349 0.349'))
    expect(wall.width).toBeCloseTo(100, 2)
    expect(wall.height).toBeCloseTo(2, 2)
  })

  it.each([[50, 'A3'], [100, 'A4'], [200, 'A4']] as const)('prints a 10 by 6 m room at 1:%i on %s, outside faces 10.2 by 6.2 m', async (scale, paper) => {
    const sheet = sheetOf(box(), { scale, paper })
    expect(sheet.scale).toBe(scale)
    expect(sheet.paper.name).toBe(paper)
    const page = readPdf(await drawingSheetPdf(sheet, 'test'))
    const walls = extentOf(inkInside(page.paths, sheet.drawing).filter((p) => p.fill === '0.349 0.349 0.349'))
    expect(walls.width).toBeCloseTo((10.2 * 1000) / scale, 2)
    expect(walls.height).toBeCloseTo((6.2 * 1000) / scale, 2)
  })

  it('prints the scale bar its stated length: 5 m is 50 mm at 1:100', async () => {
    const sheet = sheetOf(box(), { scale: 100, paper: 'A4' })
    expect(sheet.scaleBar).toMatchObject({ metres: 5, length: 50 })
    const page = readPdf(await drawingSheetPdf(sheet, 'test'))
    const bar = page.paths.filter((p) => p.points.every((q) => q.y >= sheet.scaleBar.y - 0.2 && q.y <= sheet.scaleBar.y + 2.2 && q.x >= sheet.scaleBar.x - 0.2 && q.x <= sheet.scaleBar.x + 50.2))
    expect(bar.length).toBeGreaterThanOrEqual(5)
    expect(extentOf(bar).width).toBeCloseTo(50, 2)
  })

  it('writes a page of the paper\'s size, turned the way the drawing fits', async () => {
    const a4 = readPdf(await drawingSheetPdf(sheetOf(flat, { scale: 100, paper: 'A4' }), 'test'))
    expect([a4.width, a4.height].sort((a, b) => a - b).map((v) => Math.round(v))).toEqual([210, 297])
    const tall = sheetOf(parseFloorPlan({ ...box(), walls: box().walls.map((w) => ({ ...w, start: [w.start[1], w.start[0]] as [number, number], end: [w.end[1], w.end[0]] as [number, number] })) }), { scale: 50, paper: 'A3' })
    expect(tall.paper.orientation).toBe('portrait')
    expect(sheetOf(box(), { scale: 50, paper: 'A3' }).paper.orientation).toBe('landscape')
  })

  it('carries the scale bar, caption, title block, north arrow and label, read back as text', async () => {
    const sheet = sheetOf(box(30), { scale: 100, paper: 'A4' })
    const texts = readPdf(await drawingSheetPdf(sheet, 'test')).texts.map((t) => t.text)
    for (const words of [
      'Floor plan of Ground floor, drawn at 1:100 on A4.',
      'PROJECT', 'Test house', 'DRAWING', 'Ground floor plan', 'SCALE', '1:100 on A4', 'DATE', '22 NOV 2026', 'STATUS', 'Draft',
      'General guidance, not your local rules',
      'N',
      'Studio',
    ]) expect(texts).toContain(words)
    expect(texts.some((t) => t.endsWith('5 m'))).toBe(true)
    expect(texts.join(' ')).not.toContain('North is not stated')
    expect(sheet.north).toMatchObject({ turn: (30 * Math.PI) / 180 })
  })

  it('says north is not stated, and draws no arrow, when the plan states none', async () => {
    const sheet = sheetOf(box(), { scale: 100, paper: 'A4' })
    expect(sheet.north).toBeNull()
    expect([...walk(sheet.nodes)].some((n) => n.attrs['data-part'] === 'north-arrow')).toBe(false)
    const texts = readPdf(await drawingSheetPdf(sheet, 'test')).texts.map((t) => t.text)
    expect(texts).toContain('North is not stated in the plan.')
  })

  it('draws the picture\'s own north arrow once, as the sheet\'s', () => {
    const sheet = sheetOf(box(90), { scale: 100, paper: 'A4' })
    expect([...walk(sheet.nodes)].filter((n) => n.attrs['data-part'] === 'north-arrow')).toHaveLength(1)
  })

  it('sizes its own text in paper millimetres: notes 2.5 mm, titles 5 to 6 mm', async () => {
    const sheet = sheetOf(flat, { scale: 100, paper: 'A4' })
    const own = sheet.nodes.filter((n) => n.attrs['data-part'] !== 'floor-drawing')
    const sizes = [...walk(own)].filter((n) => n.tag === 'text').map((n) => Number(n.attrs['font-size']))
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2.5)
    expect(Math.max(...sizes)).toBe(TEXT_MM.project)
    const page = readPdf(await drawingSheetPdf(sheet, 'test'))
    expect(page.texts.find((t) => t.text === 'Ground floor plan')!.size).toBeCloseTo(5, 2)
    expect(page.texts.find((t) => t.text === 'Test house')!.size).toBeCloseTo(6, 2)
    // The drawing's own figures print at 2.5 mm, its room names a little larger.
    expect(page.texts.find((t) => t.text === '9.50')!.size).toBeCloseTo(2.5, 2)
    expect(page.texts.find((t) => t.text === 'Kitchen')!.size).toBeGreaterThan(2.5)
  })

  it('keeps the drawing, the foot and the title block inside the frame, apart', () => {
    for (const paper of ['A4', 'A3', 'A0'] as const) {
      const sheet = sheetOf(flat, { scale: 100, paper })
      const { drawing } = sheet
      const block = [...walk(sheet.nodes)].find((n) => n.attrs['data-part'] === 'title-block')!
      expect(drawing.x).toBeGreaterThanOrEqual(10)
      expect(drawing.x + drawing.width).toBeLessThanOrEqual(sheet.paper.width - 10)
      expect(drawing.y).toBeGreaterThanOrEqual(10)
      expect(drawing.y + drawing.height).toBeLessThan(Number(block.attrs['y']))
      expect(drawing.y + drawing.height).toBeLessThan(sheet.scaleBar.y)
      expect(Number(block.attrs['x']) + Number(block.attrs['width'])).toBeCloseTo(sheet.paper.width - 10, 3)
      expect(Number(block.attrs['y']) + Number(block.attrs['height'])).toBeCloseTo(sheet.paper.height - 10, 3)
    }
  })

  it('writes the SVG in millimetres, its floor nested at the scale', () => {
    const sheet = sheetOf(oneWall, { scale: 100, paper: 'A4' })
    const svg = drawingSheetSvg(sheet)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="297mm" height="210mm" viewBox="0 0 297 210"/)
    expect(sheet.drawing.width).toBeCloseTo((sheet.drawing.view.width * 1000) / 100, 3)
    expect(svg).toContain('General guidance, not your local rules')
    expect(svg).toContain('data-part="floor-drawing"')
  })

  it('chooses 1:100 and the smallest paper when neither is asked for', () => {
    const sheet = sheetOf(flat, {})
    expect(sheet).toMatchObject({ scale: 100, paper: { name: 'A4' }, chosen: { scale: true, paper: true } })
    // A floor 120 m long fits no paper at 1:100, and A1 at 1:200.
    const long = parseFloorPlan({ ...oneWall, walls: [{ ...oneWall.walls[0]!, end: [120, 0] }] })
    expect(sheetOf(long, {})).toMatchObject({ scale: 200, paper: { name: 'A1' } })
    expect(sheetOf(long, { scale: 500 })).toMatchObject({ scale: 500, paper: { name: 'A4', orientation: 'landscape' } })
  })

  it('refuses a floor too large for the paper asked for, saying what fits', () => {
    expect(() => sheetOf(flat, { scale: 20, paper: 'A4' })).toThrow(DrawingDoesNotFit)
    expect(() => sheetOf(flat, { scale: 20, paper: 'A4' })).toThrow(/^At 1:20 the floor's drawing is \d+ x \d+ mm, larger than the \d+ x \d+ mm A4 leaves for it after its margins and title block: A0 fits it, or 1:100 fits A4, or --split prints it at 1:20 over \d+ pages of A4\.$/)
  })

  it('leaves the room sizes off when asked, keeping the outside dimensions', () => {
    const kinds = (roomSizes: boolean) => [...walk(sheetOf(flat, { scale: 100, paper: 'A4', roomSizes }).nodes)].filter((n) => n.attrs['data-part'] === 'dimension').map((n) => n.attrs['data-kind'])
    expect(kinds(true)).toContain('room')
    expect(kinds(false)).not.toContain('room')
    expect(kinds(false)).toContain('overall')
  })

  it('writes its words in Spanish when asked', async () => {
    await loadLanguage('es')
    const texts = readPdf(await drawingSheetPdf(sheetOf(box(), { scale: 50, paper: 'A3' }, 'es'), 'test')).texts.map((t) => t.text)
    for (const words of ['ESCALA', '1:50 en A3', 'Borrador', 'El plano no indica el norte.']) expect(texts).toContain(words)
    expect(texts.some((t) => t.includes('0,5'))).toBe(true)
  })

  it('draws a PNG of the paper at 150 dpi, at most 4000 pixels long', async () => {
    const sheet = sheetOf(flat, { scale: 100, paper: 'A4' })
    const png = await drawingSheetPng(sheet)
    const canvas = await loadCanvas()
    const image = await canvas.loadImage(Buffer.from(png))
    expect([image.width, image.height]).toEqual([Math.round(297 * 150 / 25.4), Math.round(210 * 150 / 25.4)])
    expect(pngPixelsPerMm(sheetOf(flat, { scale: 100, paper: 'A0' })) * PAPERS.A0.height).toBeCloseTo(4000, 6)
  })

  it.each([[20, 1], [50, 2], [100, 5], [200, 10], [500, 20], [1000, 50]])('takes a scale bar of round metres at 1:%i: %i m', (scale, metres) => {
    expect(scaleBarMetres(scale)).toBe(metres)
  })
})

describe('the vector walker (SHT-6)', () => {
  it('handles every element and attribute the lab\'s buildings are drawn with, in the technical look', () => {
    const dir = resolve(__dirname, '../../../../floorplan/fixtures/rooms')
    const unknown = new Set<string>()
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.plan.json'))) {
      const plan = parseFloorPlan(JSON.parse(readFileSync(resolve(dir, file), 'utf8')))
      for (const floor of plan.floors?.map((f) => f.id) ?? [null]) {
        for (const paperScale of [50, 100, 200]) {
          const picture = planPicture(plan, { floor, look: 'technical', paperScale, marks: { elevations: true, levels: true } })
          for (const node of walk(picture.nodes)) {
            if (!(VECTOR_TAGS as readonly string[]).includes(node.tag)) unknown.add(`<${node.tag}>`)
            for (const [name, value] of Object.entries(node.attrs)) if (value !== undefined && !vectorIgnores(name) && !vectorAttribute(node.tag, name)) unknown.add(`${node.tag} ${name}`)
          }
        }
      }
    }
    expect([...unknown]).toEqual([])
  })
})
