import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { drawingSheet } from '../drawingSheet'
import { notShownNote } from '../limits'
import { sheetPages } from '../pages'
import { sheetMeasure } from '../drawingFiles'

/**
 * SHT-13: the note under a drawing lists only what the floor really leaves out.
 */

await loadLanguage('es')

/** A 10 by 6 m studio on the default floor, with whatever else the test adds. */
function studio(extra: Record<string, unknown> = {}): FloorPlan {
  const corners: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]]
  return parseFloorPlan({
    version: '1',
    units: 'm',
    walls: corners.map((start, i) => ({ id: `w${i}`, start, end: corners[(i + 1) % 4], thickness: 0.2, height: 2.7, kind: 'exterior' })),
    rooms: [{ id: 'r', name: 'Studio', boundary: ['w0', 'w1', 'w2', 'w3'], use: 'living' }],
    openings: [],
    ...extra,
  })
}

const bed = { id: 'b', kind: 'bed', at: [2, 2], size: [1.6, 2], height: 0.5 }
const column = { id: 'c', shape: 'square', width: 0.4, at: [5, 3] }
const grid = { id: 'g', origin: [0, 0], x: { spacing: [5, 5] }, y: { spacing: [6] } }

const EVERYTHING = 'Drawn from the plan alone. Not shown: furniture, stairs, structure, services and landscape.'

describe('the note of what a drawing leaves out (SHT-13)', () => {
  it('lists everything on a plan that draws none of it', () => {
    expect(notShownNote(studio(), 'ground', false, 'en')).toBe(EVERYTHING)
  })

  it('does not list furniture when furniture is drawn on the floor', () => {
    const note = notShownNote(studio({ items: [bed] }), 'ground', false, 'en')
    expect(note).toBe('Drawn from the plan alone. Not shown: stairs, structure, services and landscape.')
  })

  it('does not list structure when a column or a grid is drawn on the floor', () => {
    expect(notShownNote(studio({ columns: [column] }), 'ground', false, 'en')).not.toContain('structure')
    expect(notShownNote(studio({ grids: [grid] }), 'ground', false, 'en')).not.toContain('structure')
  })

  it('does not list stairs when the plan draws them', () => {
    expect(notShownNote(studio(), 'ground', true, 'en')).not.toContain('stairs')
  })

  it('always lists services and landscape, even when everything else is drawn', () => {
    const plan = studio({ items: [bed], columns: [column] })
    expect(notShownNote(plan, 'ground', true, 'en')).toBe('Drawn from the plan alone. Not shown: services and landscape.')
  })

  it('reads a fixture as no furniture', () => {
    const toilet = { id: 't', kind: 'toilet', at: [1, 1], size: [0.4, 0.7], height: 0.8 }
    expect(notShownNote(studio({ items: [toilet] }), 'ground', false, 'en')).toBe(EVERYTHING)
  })

  it('says it in Spanish with the same things left out', () => {
    expect(notShownNote(studio({ items: [bed], columns: [column] }), 'ground', false, 'es'))
      .toBe('Dibujado solo a partir del plano. No se muestran las escaleras, las instalaciones y el paisajismo.')
    expect(notShownNote(studio(), 'ground', false, 'es')).toContain('el mobiliario')
  })

  it('is on the client sheet floor page and the drawing sheet', async () => {
    const plan = studio({ items: [bed], columns: [column] })
    const loaded = { file: 'plan.json', plan, ...validatePlan(plan) }
    const date = new Date('2026-11-22T12:00:00Z')
    const client = sheetPages(loaded, null, 'client', { name: 'x', date })
    expect(client.pages[1]!.notes).toContain('Drawn from the plan alone. Not shown: stairs, services and landscape.')
    const drawing = drawingSheet(loaded, {}, { project: 'Test', date, measure: await sheetMeasure() })
    const text = JSON.stringify(drawing)
    expect(text).toContain('Not shown: stairs, services and landscape.')
    expect(text).not.toContain('furniture')
  })
})
