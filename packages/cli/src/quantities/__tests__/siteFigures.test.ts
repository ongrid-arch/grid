/**
 * CNT-56: the site's figures are always given, for the whole site and each building: coverage,
 * gross external area, floor area ratio, homes, homes per hectare and parking per home. A house
 * and a garage named as two buildings on a 40 × 25 m plot (1000 m², a tenth of a hectare); the
 * house holds 2 homes and 1 parking space, the garage 2 spaces.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { METRES } from '@ongrid/floorplan/types/units'
import { siteMeasures, type FloorPlan } from '@ongrid/floorplan/geometry'
import { siteAnswer } from '../site'
import { siteFigures } from '../siteFigures'

const TEXT = `plan "House and garage"
plot 40 x 25 at 0,0
floor house "House" level 0
room liv "Living" living 10 x 8 at 5,4
door d1 in liv south, centred, 0.9 wide
floor garage "Garage" level 0
room gar "Garage" garage 4 x 5 at 26,4
door d2 in gar south, centred, 0.9 wide
floor house1 "House first" level 1
room bed "Bed" bedroom 10 x 8 at 5,4
`

function plan(options: { buildings?: boolean; homes?: boolean } = {}): FloorPlan {
  const made = compileRoomsText(TEXT)
  expect(made.problems).toEqual([])
  const raw = made.plan as unknown as { floors: { id: string }[] } & Record<string, unknown>
  const stated: Record<string, { homes?: number; parking?: number }> = options.homes === false ? { garage: { parking: 2 } } : { house: { homes: 2, parking: 1 }, garage: { parking: 2 } }
  return parseFloorPlan({
    ...raw,
    floors: raw.floors.map((f) => ({ ...f, ...(stated[f.id] ?? {}) })),
    ...(options.buildings === false ? {} : { buildings: [{ id: 'house', name: 'House', floors: ['house', 'house1'] }, { id: 'garage', name: 'Garage', floors: ['garage'] }] }),
  })
}

describe('CNT-56 the site figures', () => {
  it('gives every figure for the whole site and each building, each its own', () => {
    const p = plan()
    const figures = siteFigures(p, siteMeasures(p))
    expect(figures.plot).toBe(1000)
    const [house, garage] = figures.buildings
    expect([house!.id, garage!.id]).toEqual(['house', 'garage'])
    // The house's two floors and the garage's one, at or above the ground floor.
    expect(figures.site.grossExternal).toBeCloseTo(house!.grossExternal! + garage!.grossExternal!, 6)
    expect(house!.grossExternal!).toBeGreaterThan(2 * 80)
    expect(figures.site.floorAreaRatio).toBeCloseTo(figures.site.grossExternal! / 1000, 9)
    expect(house!.floorAreaRatio).toBeCloseTo(house!.grossExternal! / 1000, 9)
    expect(figures.site.coverage).toBeCloseTo(house!.coverage! + garage!.coverage!, 6)
    // Homes and parking: the house's own, the garage's own, the site's both.
    expect([figures.site.homes, house!.homes, garage!.homes]).toEqual([2, 2, null])
    expect(figures.site.homesPerHectare).toBeCloseTo(20, 9)
    expect(house!.homesPerHectare).toBeCloseTo(20, 9)
    expect([figures.site.parking, house!.parking, garage!.parking]).toEqual([3, 1, 2])
    expect(figures.site.parkingPerHome).toBeCloseTo(1.5, 9)
    expect(house!.parkingPerHome).toBeCloseTo(0.5, 9)
    expect(garage!.parkingPerHome).toBeNull()
  })

  it('says the figures in every answer, and why one is not measured', () => {
    const answer = siteAnswer(plan({ homes: false }), METRES)
    const text = answer.lines.join('\n')
    expect(text).toContain('The whole site: plot coverage')
    expect(text).toContain('homes not stated')
    expect(text).toContain('homes per hectare not measured (no homes are stated)')
    expect(text).toContain('"Garage": plot coverage')
    const data = answer.data as { figures: { site: { homes: number | null; notMeasured: Record<string, string> }; buildings: { id: string }[] } }
    expect(data.figures.site.homes).toBeNull()
    expect(data.figures.site.notMeasured['homesPerHectare']).toBe('no homes are stated')
    expect(data.figures.buildings.map((b) => b.id)).toEqual(['house', 'garage'])
  })

  it('names the building on every face line, and the nearest building on each edge', () => {
    const text = siteAnswer(plan(), METRES).lines.join('\n')
    expect(text).toMatch(/"House": The south face, .* to the south boundary\./)
    expect(text).toMatch(/"Garage": The west face, .* to "House", which stands in front of it; the west boundary is .* away\./)
    expect(text).toContain('Edge 2: 9.70 m from the east boundary; no set-back asked. The nearest building is "Garage".')
    expect(text).toContain('"House" and "Garage": 10.40 m.')
  })

  it('gives the figures on a plan that names no building, for the whole site only', () => {
    const p = plan({ buildings: false })
    const figures = siteFigures(p, siteMeasures(p))
    expect(figures.buildings).toEqual([])
    expect(figures.site.homes).toBe(2)
    expect(figures.site.parking).toBe(3)
  })
})
