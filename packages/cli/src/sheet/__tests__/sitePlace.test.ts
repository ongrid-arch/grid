import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture } from '@ongrid/viewer/src/picture'
import type { LoadedPlan } from '../../command/plan'
import { drawingSheet } from '../drawingSheet'
import { sheetMeasure } from '../drawingFiles'
import { sheetPages } from '../pages'

/**
 * CNT-50: the site's own name and its address, as the plan states them, on the sheets' covers and
 * title blocks and in the band under a drawing. A plan with no name of its own is named by its site.
 */
const date = new Date('2026-11-27T12:00:00Z')
const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']

function load(...lines: string[]): LoadedPlan {
  const result = compileRoomsText([...HOUSE, ...lines].join('\n'))
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { file: 'plan.json', plan, ...validatePlan(plan) }
}

const SITED = ['site name "Harbour House"', 'site address "12 Harbour Road, Bristol"']

describe("the site's name and address on the sheets and drawings", () => {
  it('names a client sheet by its site and puts the address under the title', () => {
    const sheet = sheetPages(load(...SITED), null, 'client', { name: 'plan', date })
    expect(sheet.name).toBe('Harbour House')
    expect(sheet.pages[0]!.title).toBe('Harbour House')
    expect(sheet.pages[0]!.subtitle).toBe('12 Harbour Road, Bristol')
  })

  it('carries the site after the project in the title blocks of the elevations and of a drawing', async () => {
    const loaded = load(...SITED)
    const pages = sheetPages(loaded, null, 'check', { name: 'plan', date }).pages
    const block = pages.flatMap((p) => (p.picture?.kind === 'drawings' ? [p.picture.block] : []))[0]
    expect(block?.project).toBe('Harbour House, 12 Harbour Road, Bristol')
    const sheet = drawingSheet(loaded, { scale: 100, paper: 'A3' }, { project: 'Extension', date, measure: await sheetMeasure() })
    expect(sheet.words.project).toBe('Extension, Harbour House, 12 Harbour Road, Bristol')
  })

  it('shows the address in the band under the drawing, and nothing new for a plan that states none', () => {
    const band = (loaded: LoadedPlan): string => JSON.stringify(planPicture(loaded.plan).key)
    expect(band(load(...SITED))).toContain('Harbour House, 12 Harbour Road, Bristol')
    expect(band(load())).not.toContain('Harbour')
  })
})
