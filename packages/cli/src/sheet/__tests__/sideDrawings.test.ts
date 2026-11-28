import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { buildFloorPlan, planForFloor, planSection, validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { facadePicture } from '@ongrid/viewer/src/picture/facade'
import { sectionPicture } from '@ongrid/viewer/src/picture/section'
import { planPicture } from '@ongrid/viewer/src/picture'
import { DRAWING_PIXEL_PT, DRAWINGS_BOX, pointsPerMetre, sheetSectionLines, sideDrawings, SIDE_SCALES, type PlacedDrawing } from '../sideDrawings'
import { planPictureOptions, sheetPages, type SheetPicture } from '../pages'
import type { LoadedPlan } from '../../command/plan'
import { sheetPdf } from '../pdf'
import { readPdf } from './readPdf'

function fixture(name: string): LoadedPlan {
  const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))
  return { file: name, plan, ...validatePlan(plan) }
}

const house = fixture('two-floor-house.json')
const flat = fixture('two-bed-flat.json')
const date = new Date('2026-11-21T12:00:00Z')

/** Every node of an SVG tree, depth first. */
function* walk(nodes: readonly unknown[]): Generator<{ attrs: Record<string, unknown>; children: readonly unknown[] }> {
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue
    const n = node as { attrs: Record<string, unknown>; children: readonly unknown[] }
    yield n
    yield* walk(n.children ?? [])
  }
}

describe('the sections a sheet cuts (SHT-23)', () => {
  it('cuts A along the building and B across it, both through it', () => {
    for (const loaded of [house, flat]) {
      const cuts = sheetSectionLines(loaded.plan)
      expect(cuts.map((cut) => cut.label)).toEqual(['A', 'B'])
      const [a, b] = cuts.map((cut) => cut.line)
      const length = (line: typeof a) => Math.hypot(line!.to.x - line!.from.x, line!.to.y - line!.from.y)
      expect(length(a)).toBeGreaterThanOrEqual(length(b))
      for (const cut of cuts) {
        const section = planSection(loaded.plan, cut.line)
        expect(section.reach.missesBuilding).toBe(false)
        // From outside the building to outside it.
        expect(section.reach.startInside).toBe(false)
        expect(section.reach.endInside).toBe(false)
        expect(section.rooms.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps off a wall that runs along the line', () => {
    const cuts = sheetSectionLines(house.plan)
    const walls = buildFloorPlan(planForFloor(house.plan, 'ground')).walls.filter((w) => !w.virtual)
    for (const { line } of cuts) {
      const across = line.from.y === line.to.y ? 'y' : 'x'
      const at = line.from[across]
      for (const wall of walls) {
        const [p, q] = wall.centerline
        if (Math.abs(p[across] - q[across]) > 1e-6) continue
        expect(Math.abs(p[across] - at)).toBeGreaterThan(wall.thickness / 2)
      }
    }
  })

  it('cuts nothing in a plan with no walls', () => {
    const empty: FloorPlan = { ...house.plan, walls: [], rooms: [], openings: [] }
    expect(sheetSectionLines(empty)).toEqual([])
    expect(sideDrawings(empty, { look: 'technical' })).toBeNull()
  })
})

describe('the elevations and sections at one scale (SHT-23)', () => {
  const sides = sideDrawings(house.plan, { look: 'technical' })!

  it('draws the four sides and both sections at one usual scale', () => {
    expect(SIDE_SCALES).toContain(sides.scale)
    // A small house fits at 1:50 or 1:100, not smaller.
    expect(sides.scale).toBeLessThanOrEqual(100)
    expect(sides.elevations.map((d) => (d.of === 'facade' ? d.side : null))).toEqual(['north', 'east', 'south', 'west'])
    expect(sides.sections.map((d) => (d.of === 'section' ? d.cut.label : null))).toEqual(['A', 'B'])
  })

  const pictureOf = (drawing: PlacedDrawing, scale: number) => drawing.of === 'facade'
    ? facadePicture(house.plan, { side: drawing.side, width: drawing.width, height: drawing.height, look: 'technical', paperScale: scale })
    // VEW-89: as the sheet draws it, without the dimension chains.
    : sectionPicture(house.plan, drawing.cut.line, { width: drawing.width, height: drawing.height, look: 'technical', paperScale: scale, label: drawing.cut.label, dimensions: false })

  it('prints a metre of every drawing the same length: the scale stated', () => {
    const k = pointsPerMetre(sides.scale)
    for (const drawing of [...sides.elevations, ...sides.sections]) {
      const picture = pictureOf(drawing, sides.scale)
      // The drawn width is the picture's metres at the scale, and a pixel prints at one size on each.
      expect(drawing.drawn.width).toBeCloseTo(picture.view.width * k, 6)
      expect(drawing.drawn.width / picture.width).toBeCloseTo(DRAWING_PIXEL_PT, 1)
    }
  })

  it('keeps every drawing inside the box, none over another', () => {
    const all = [...sides.elevations, ...sides.sections]
    for (const d of all) {
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.x + d.drawn.width).toBeLessThanOrEqual(DRAWINGS_BOX.width + 1e-6)
      expect(d.y + d.drawn.height).toBeLessThanOrEqual(DRAWINGS_BOX.height + 1e-6)
    }
    for (const page of [sides.elevations, sides.sections]) {
      for (const [i, a] of page.entries()) {
        for (const b of page.slice(i + 1)) {
          const apart = a.x + a.drawn.width <= b.x || b.x + b.drawn.width <= a.x || a.y + a.drawn.height <= b.y || b.y + b.drawn.height <= a.y
          expect(apart).toBe(true)
        }
      }
    }
  })

  it('stands the elevations of a row on one ground line', () => {
    const rows = new Map<number, PlacedDrawing[]>()
    for (const d of sides.elevations) {
      const foot = Math.round(d.y + d.drawn.height)
      rows.set(foot, [...(rows.get(foot) ?? []), d])
    }
    expect(rows.size).toBeLessThan(sides.elevations.length)
  })
})

describe('the sheets with their elevations and sections (SHT-23)', () => {
  it('follows the floors with the elevations and the sections on a client sheet', () => {
    const sheet = sheetPages(house, { version: '1', name: 'Solace House' }, 'client', { name: 'two-floor-house', date })
    expect(sheet.pages.map((p) => p.kind)).toEqual(['cover', 'floor', 'floor', 'elevations', 'sections'])
    const elevations = sheet.pages[3]!
    expect(elevations.title).toBe('Elevations')
    expect(elevations.topLine).toBe('Solace House / Elevations')
    expect(elevations.subtitle).toMatch(/^Every side of the building as seen from outside, at 1:\d+$/)
    const picture = elevations.picture as Extract<SheetPicture, { kind: 'drawings' }>
    expect(picture.kind).toBe('drawings')
    expect(picture.block).toMatchObject({ project: 'Solace House', drawing: 'Elevations', scale: `1:${picture.scale} on A3`, date: '21 NOV 2026', status: 'Draft' })
    expect(sheet.pages[4]!.title).toBe('Sections')
    expect(sheet.pages[4]!.subtitle).toBe(`Sections A and B at 1:${picture.scale}, cut where each floor plan marks them`)
    expect(sheet.pages[4]!.notes).toContain(`Every drawing on this page is at 1:${picture.scale} on A3: printed at full size, it measures true.`)
  })

  it('puts them between the floors and the schedules on a check sheet', () => {
    const sheet = sheetPages(house, null, 'check', { name: 'two-floor-house', date })
    expect(sheet.pages.map((p) => p.kind)).toEqual(['summary', 'floor', 'floor', 'elevations', 'sections', 'summary', 'summary', 'summary'])
    expect((sheet.pages[3]!.picture as Extract<SheetPicture, { kind: 'drawings' }>).block.project).toBe('two-floor-house')
  })

  it('marks sections A and B on every floor plan of the sheet', () => {
    for (const layout of ['client', 'check'] as const) {
      const sheet = sheetPages(house, null, layout, { name: 'two-floor-house', date })
      const plans = sheet.pages.filter((p) => p.picture?.kind === 'plan')
      expect(plans.length).toBe(2)
      for (const page of plans) {
        const { options } = planPictureOptions(page.picture as Extract<SheetPicture, { kind: 'plan' }>)
        expect(options.marks?.sections?.map((s) => s.label)).toEqual(['A', 'B'])
        const nodes = [...walk(planPicture(house.plan, options).nodes)]
        expect(nodes.filter((n) => n.attrs['data-part'] === 'section-mark').map((n) => n.attrs['data-label'])).toEqual(['A', 'B'])
      }
    }
  })

  beforeAll(async () => {
    await loadLanguage('es')
  })

  it('writes its words in the sheet language', () => {
    const sheet = sheetPages(house, null, 'client', { name: 'two-floor-house', date, language: 'es' })
    expect(sheet.pages.filter((p) => p.kind === 'elevations' || p.kind === 'sections').map((p) => p.title)).toEqual(['Alzados', 'Secciones'])
  })
})

describe('the elevations and sections in the PDF (SHT-23)', () => {
  it('prints each page with its title, its scale bar and its title block', async () => {
    const sheet = sheetPages(house, { version: '1', name: 'Solace House' }, 'client', { name: 'two-floor-house', date })
    const { pdf, sheet: laid } = await sheetPdf(house.plan, sheet)
    const index = (kind: string) => laid.pages.findIndex((p) => p.kind === kind)
    const scale = (sheet.pages[3]!.picture as Extract<SheetPicture, { kind: 'drawings' }>).scale
    for (const [kind, title] of [['elevations', 'Elevations'], ['sections', 'Sections']] as const) {
      const text = readPdf(pdf, index(kind)).texts.map((t) => t.text).join(' ')
      for (const words of [title, 'PROJECT', 'Solace House', 'DRAWING', `1:${scale} on A3`, '21 NOV 2026', 'Draft', '5 m']) expect(text).toContain(words)
    }
    const sections = readPdf(pdf, index('sections')).texts.map((t) => t.text).join(' ')
    expect(sections).toContain('Section A–A')
    expect(sections).toContain('Section B–B')
  }, 60_000)
})
