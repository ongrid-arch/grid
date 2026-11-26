import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { SvgChild, SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { DrawingDoesNotFit, drawingSheets, type DrawingRequest } from '../drawingSheet'
import { drawingSheetPdf, sheetMeasure } from '../drawingFiles'
import { extentOf, pdfPageCount, readPdf } from './readPdf'

/**
 * SHT-20: every floor at one stated scale on one paper, and a floor too long for the paper split
 * over pages at that scale. Measured on the PDF, page by page.
 */

const loaded = (plan: FloorPlan) => ({ file: 'plan.json', plan, ...validatePlan(plan) })
const date = new Date('2026-11-22T12:00:00Z')
const measure = await sheetMeasure()
const setOf = (plan: FloorPlan, request: DrawingRequest) => drawingSheets(loaded(plan), request, { project: 'Test house', date, measure })
const WALL_GREY = '0.349 0.349 0.349'

/** A room of `width` by `depth` metres on a floor, its walls 0.2 m thick on their centre lines. */
function roomWalls(floor: string | undefined, width: number, depth: number, prefix: string) {
  const corners: [number, number][] = [[0, 0], [width, 0], [width, depth], [0, depth]]
  return corners.map((start, i) => ({ id: `${prefix}${i}`, start, end: corners[(i + 1) % 4], thickness: 0.2, height: 2.7, kind: 'exterior', ...(floor === undefined ? {} : { floor }) }))
}

/** Two floors: a 10 by 6 m ground floor and a 6 by 6 m first floor, north stated. */
const twoFloors = parseFloorPlan({
  version: '1',
  units: 'm',
  north: 0,
  floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 1 }],
  walls: [...roomWalls(undefined, 10, 6, 'g'), ...roomWalls('first', 6, 6, 'f')],
  rooms: [
    { id: 'living', name: 'Living', boundary: ['g0', 'g1', 'g2', 'g3'], use: 'living' },
    { id: 'bed', name: 'Bedroom', boundary: ['f0', 'f1', 'f2', 'f3'], use: 'bedroom', floor: 'first' },
  ],
  openings: [],
})

/** A platform 60 m long and 0.2 m thick: too long for A4 at 1:100. */
const platform = parseFloorPlan({
  version: '1',
  units: 'm',
  walls: [{ id: 'w', start: [0, 0], end: [60, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }],
  rooms: [],
  openings: [],
})

function* walk(nodes: readonly SvgChild[]): Generator<SvgNode> {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    yield node
    yield* walk(node.children)
  }
}
const parts = (nodes: readonly SvgNode[], part: string) => [...walk(nodes)].filter((n) => n.attrs['data-part'] === part)

describe('every floor at one stated scale (SHT-20)', () => {
  it('draws each floor on its own page, all at 1:100 on A4, each with a scale bar and north', async () => {
    const set = setOf(twoFloors, { scale: 100, paper: 'A4' })
    expect(set).toMatchObject({ scale: 100, paper: 'A4', floors: ['ground', 'first'] })
    expect(set.sheets.map((s) => [s.floor, s.scale, s.paper.name, s.part])).toEqual([['ground', 100, 'A4', null], ['first', 100, 'A4', null]])
    const pdf = await drawingSheetPdf(set.sheets, 'test')
    expect(pdfPageCount(pdf)).toBe(2)
    for (const [i, sheet] of set.sheets.entries()) {
      expect(parts(sheet.nodes, 'scale-bar')).toHaveLength(1)
      expect(parts(sheet.nodes, 'north-arrow')).toHaveLength(1)
      const page = readPdf(pdf, i)
      const texts = page.texts.map((t) => t.text).join(' ')
      expect(texts).toContain(`Floor plan of ${['Ground floor', 'First floor'][i]}, floor ${i + 1} of 2, drawn at 1:100 on A4.`)
      // The walls' outside faces, at the one scale: 10.2 m and 6.2 m are 102 mm and 62 mm.
      const walls = extentOf(page.paths.filter((p) => p.paint.startsWith('f') && p.fill === WALL_GREY))
      expect(walls.width).toBeCloseTo([102, 62][i]!, 1)
      expect(walls.height).toBeCloseTo(62, 1)
    }
  })

  it('chooses one scale and paper every floor fits when none is asked', () => {
    const set = setOf(twoFloors, {})
    expect(set).toMatchObject({ scale: 100, paper: 'A4', chosen: { scale: true, paper: true } })
    expect(new Set(set.sheets.map((s) => s.scale))).toEqual(new Set([100]))
  })

  it('draws one floor alone when it is asked for', () => {
    expect(setOf(twoFloors, { floor: 'first', scale: 50 }).sheets.map((s) => s.floor)).toEqual(['first'])
  })

  it('refuses a floor too large, naming it on a plan of several and offering what fits and a split', () => {
    const big = parseFloorPlan({ ...twoFloors, walls: [...roomWalls(undefined, 10, 6, 'g'), ...roomWalls('first', 40, 6, 'f')] })
    expect(() => setOf(big, { scale: 100, paper: 'A4' })).toThrow(DrawingDoesNotFit)
    expect(() => setOf(big, { scale: 100, paper: 'A4' })).toThrow(/^At 1:100 the drawing of First floor is \d+ x \d+ mm, larger than the \d+ x \d+ mm A4 leaves for it after its margins and title block: A2 fits it, or 1:200 fits A4, or --split prints it at 1:100 over 2 pages of A4\.$/)
  })
})

describe('a long floor split over pages (SHT-20)', () => {
  it('cuts a 60 m platform at 1:100 on A4 into three parts at that scale, the wall 600 mm across them', async () => {
    const set = setOf(platform, { scale: 100, paper: 'A4', split: true })
    expect(set.sheets.map((s) => s.part)).toEqual([{ index: 1, count: 3 }, { index: 2, count: 3 }, { index: 3, count: 3 }])
    expect(set.sheets.every((s) => s.scale === 100 && s.paper.name === 'A4' && s.paper.orientation === 'landscape')).toBe(true)
    const pdf = await drawingSheetPdf(set.sheets, 'test')
    expect(pdfPageCount(pdf)).toBe(3)
    let total = 0
    for (const [i, sheet] of set.sheets.entries()) {
      // Each part's drawing inside the paper's frame, its dashed line on each cut side.
      expect(sheet.drawing.x).toBeGreaterThanOrEqual(10)
      expect(sheet.drawing.x + sheet.drawing.width).toBeLessThanOrEqual(sheet.paper.width - 10)
      expect(parts(sheet.nodes, 'match-line')).toHaveLength(i === 1 ? 2 : 1)
      expect(parts(sheet.nodes, 'scale-bar')).toHaveLength(1)
      const page = readPdf(pdf, i)
      expect(page.texts.map((t) => t.text).join(' ')).toContain(`Part ${i + 1} of 3 of this floor`)
      // The wall's ink between this part's match lines (or its own end).
      const lines = parts(sheet.nodes, 'match-line').map((n) => Number(n.attrs['x1']))
      const from = i === 0 ? -Infinity : Math.min(...lines)
      const to = i === 2 ? Infinity : Math.max(...lines)
      const ink = page.paths.filter((p) => p.paint.startsWith('f') && p.fill === WALL_GREY)
      const wall = extentOf(ink)
      total += Math.min(wall.maxX, to) - Math.max(wall.minX, from)
    }
    // A free wall ends at its end points: 60 m is 600 mm.
    expect(total).toBeCloseTo(600, 0)
  })

  it('draws a floor that fits whole on one page, and splits only the one that does not', () => {
    const mixed = parseFloorPlan({
      ...twoFloors,
      walls: [...roomWalls(undefined, 10, 6, 'g'), ...roomWalls('first', 60, 6, 'f')],
    })
    const set = setOf(mixed, { scale: 100, paper: 'A4', split: true })
    expect(set.sheets.map((s) => [s.floor, s.part?.index ?? null])).toEqual([['ground', null], ['first', 1], ['first', 2], ['first', 3]])
  })

  it('splits on A0 when no paper is asked and none fits whole', () => {
    const long = parseFloorPlan({ ...platform, walls: [{ ...platform.walls[0]!, end: [300, 0] }] })
    const set = setOf(long, { scale: 100, split: true })
    expect(set).toMatchObject({ scale: 100, paper: 'A0' })
    expect(set.sheets.length).toBe(3)
  })
})
