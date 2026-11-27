/**
 * VEW-79: a curved plan is drawn with its curves dimensioned as curves: one radius, written
 * `R 6.00`, with a cross at its centre, and no figure for each straight piece of the curve.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'
import { dimensionText } from '../../canvas2d/labelPlacement'

const pavilion = (() => {
  const written = compileRoomsText('room pav "Pavilion" assembly circle 12 at 0,0\nroom ring "Ring" corridor band 6.1 to 9 from 0 sweep 180 at 0,0\n')
  expect(written.problems).toEqual([])
  return parseFloorPlan(written.plan)
})()

const texts = (svg: string): string[] => [...svg.matchAll(/data-part="dimension-text"[^>]*>([^<]*)</g)].map((m) => m[1]!)

describe('curves in a plan picture (VEW-79)', () => {
  it.each(['working', 'technical'] as const)('writes each radius once, after its mark, with a cross at its centre, in the %s look', (look) => {
    const svg = planToSvg(pavilion, { look })
    const shown = texts(svg)
    expect(shown.filter((t) => t === 'R 6.00')).toHaveLength(1)
    expect(shown.filter((t) => t === 'R 9.00')).toHaveLength(1)
    expect([...svg.matchAll(/data-kind="radius"/g)]).toHaveLength(2)
    expect([...svg.matchAll(/data-part="centre-mark"/g)].length).toBeGreaterThanOrEqual(1)
    // The band's chord once, and no figure for a piece of either curve.
    expect([...svg.matchAll(/data-kind="chord"/g)]).toHaveLength(1)
    expect([...svg.matchAll(/data-kind="room"/g)].length).toBeLessThanOrEqual(2)
  })

  it('writes a radius after its mark and every other figure as it was', () => {
    expect(dimensionText(6, 'radius')).toBe('R 6.00')
    expect(dimensionText(6, 'chord')).toBe('6.00')
    expect(dimensionText(6, 'overall')).toBe('6.00')
  })
})
