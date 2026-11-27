import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { compareBuildings } from '@ongrid/floorplan/geometry'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { comparisonPicture } from '../comparison'
import { pictureToSvg } from '../planSvg'

/**
 * MSG-34: the picture of a comparison speaks the language asked for, else the later plan's own:
 * its key, the rooms it marks changed or removed, and its label, with the language's decimal mark.
 */
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(resolve(__dirname, '../../../../floorplan/fixtures'), 'two-bed-flat.json'), 'utf8')))

/** The wall between the kitchen and the living room moved 0.5 m north. */
function moved(before: FloorPlan): FloorPlan {
  return { ...before, walls: before.walls.map((w) => (w.id === 'living-north' ? { ...w, start: [w.start[0], w.start[1] + 0.5], end: [w.end[0], w.end[1] + 0.5] } : w)) }
}

beforeAll(async () => {
  await loadLanguage('es')
})

describe('the picture of a comparison in a language (MSG-34)', () => {
  it('writes its key and the changed rooms in Spanish, with a decimal comma, when asked', () => {
    const before = flat()
    const after = moved(before)
    const compared = compareBuildings(before, after)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, after, compared.marks, { language: 'es' }))
    expect(svg).toContain('Quitado')
    expect(svg).toContain('Sin cambios')
    expect(svg).toContain('Living room: de 18,48 m² a 20,68 m²')
    expect(svg).not.toContain('Removed')
    expect(svg).toContain('Orientación general, no sus normas locales')
  })

  it('speaks the later plan\'s own language when none is asked, and stays English for an English plan', () => {
    const before = flat()
    const after = { ...moved(before), display: { language: 'es' } } as FloorPlan
    const compared = compareBuildings(before, after)
    expect(pictureToSvg(comparisonPicture(compared.aligned, after, compared.marks))).toContain('Añadido')
    const english = moved(before)
    const plain = compareBuildings(before, english)
    const svg = pictureToSvg(comparisonPicture(plain.aligned, english, plain.marks))
    expect(svg).toContain('Removed')
    expect(svg).toContain('Living room: 18.48 m² to 20.68 m²')
  })

  it('keeps the marks as they compared before: the sentence is not part of the record', () => {
    const before = flat()
    const compared = compareBuildings(before, moved(before))
    const room = compared.marks.changedRooms[0]!
    expect(Object.keys(room).sort()).toEqual(['label', 'room'])
    expect((room as { said?: unknown }).said).toBeDefined()
  })
})
