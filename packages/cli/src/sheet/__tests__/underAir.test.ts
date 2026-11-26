/**
 * ARE-60: the client sheet's cover headlines a US home by its living area under air and its total
 * under roof, never by a gross figure with the garage in.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import type { LoadedPlan } from '../../command/plan'
import { sheetPages } from '../pages'

function loaded(country: string): LoadedPlan {
  const written = compileRoomsText([
    'walls outside 0.3 inside 0.1 height 2.7',
    'room living "Living" living 6 x 5 at 0,0',
    'room garage "Garage" parking 3 x 5 east of living',
  ].join('\n')).plan
  const plan = FloorPlanSchema.parse({ ...(written as object), site: { country } })
  const { issues, broken } = validatePlan(plan)
  return { file: 'house.json', plan, issues, broken }
}

const date = new Date('2026-11-21T12:00:00Z')
const cover = (country: string) => sheetPages(loaded(country), null, 'client', { name: 'house', date }).pages[0]!

describe('the client cover of a US home (ARE-60)', () => {
  it('leads with the living area under air and the total under roof', () => {
    const figures = cover('US').figures
    expect(figures.slice(0, 2).map((f) => f.label)).toEqual(['living area under air', 'total under roof'])
    expect(figures.some((f) => f.label === 'gross internal area')).toBe(false)
    // 6.4 × 5.6 m under air, 9.7 × 5.6 m under roof.
    expect(figures.slice(0, 2).map((f) => f.value)).toEqual(['35.8 m²', '54.3 m²'])
  })

  it('keeps the gross internal area on a cover elsewhere', () => {
    expect(cover('GB').figures[0]!.label).toBe('gross internal area')
  })
})
