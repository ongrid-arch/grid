/**
 * ARE-80: the columns are obstacles in every clearance measure, as the fixtures are. A boxed riser
 * 0.8 x 0.25 m against one side of a corridor 1.2 m between its faces leaves 0.95 m beside it:
 * that is the corridor's narrowest point, and no turning circle is centred on the riser.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { accessAnswer } from '../access'
import { surveyPlan } from '../survey'
import { fixturesOf, roomIndicators } from '../use'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
const L = (v: number): string => `${v.toFixed(2)} m`

/** A corridor 6 m long and 1.2 m between its wall faces, with a door at each end and the columns given. */
const corridor = (columns: unknown[]): FloorPlan => {
  const walls = [wall('s', [-0.1, -0.1], [6.1, -0.1]), wall('e', [6.1, -0.1], [6.1, 1.3]), wall('n', [6.1, 1.3], [-0.1, 1.3]), wall('w', [-0.1, 1.3], [-0.1, -0.1])]
  return parseFloorPlan({
    version: '1',
    units: 'm',
    walls,
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: walls.map((w) => w.id) }],
    openings: [
      { id: 'd1', wall: 'w', type: 'door', offset: 0.05, width: 1.1, sill: 0, height: 2.1 },
      { id: 'd2', wall: 'e', type: 'door', offset: 0.05, width: 1.1, sill: 0, height: 2.1 },
    ],
    columns,
  })
}
const RISER = { id: 'riser', label: 'Riser', shape: 'square', width: 0.8, depth: 0.25, at: [3, 0.125] }

describe('a column in a clearance measure', () => {
  it('narrows a corridor to what is left beside it, and keeps the turning circle off it', () => {
    const before = accessAnswer(surveyPlan(corridor([])), { yours: [], code: () => null }, L, null).data
    expect(before.corridors[0]!.narrowest).toBeCloseTo(1.2, 2)

    const found = accessAnswer(surveyPlan(corridor([RISER])), { yours: [], code: () => null }, L, null)
    expect(found.data.corridors[0]!.narrowest).toBeCloseTo(0.95, 2)
    const circle = found.data.turning[0]!
    // The circle the corridor holds clear of the riser: 1.2 m, centred away from it.
    expect(circle.diameter).toBeCloseTo(1.2, 2)
    const gap = Math.max(Math.abs(circle.at.x - 3) - 0.4, 0)
    expect(gap).toBeGreaterThanOrEqual(circle.diameter / 2 - 0.01)
  })

  it('names the column beside the way, and leaves the fixture counts alone', () => {
    const survey = surveyPlan(corridor([RISER]))
    const room = survey.rooms.find((r) => r.facts.id === 'hall')!
    const lines = roomIndicators(survey, room, {}, L).lines.join('\n')
    expect(lines).toContain('the widest body or trolley that gets through "Hall" from "d2" to "d1" is 0.95 m at its narrowest')
    expect(lines).toContain('between Column "Riser" ("riser") and a wall')
    expect(lines).toContain('the room holds no fixtures')
    expect(fixturesOf(survey).rows).toEqual([])
  })

  it('reads a column on another floor as no obstacle', () => {
    const plan = corridor([{ ...RISER, floor: 'first' }])
    const withFloors = parseFloorPlan({ ...plan, floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 3 }] })
    expect(accessAnswer(surveyPlan(withFloors), { yours: [], code: () => null }, L, null).data.corridors[0]!.narrowest).toBeCloseTo(1.2, 2)
  })
})
