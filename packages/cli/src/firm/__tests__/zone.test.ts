/**
 * ARE-73: a firm's fixture clearance with a width is measured as an activity zone on the
 * fixture's centre line: the clear floor straight out over the whole width, a part of it on no
 * free floor read as nothing, with the clear width each side of the centre line by compass.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { firmMeasures } from '../measure'
import { parseFirmStandards } from '../standards'

function bathroom(): ReturnType<typeof parseFloorPlan> {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.1, height: 2.5, kind: 'exterior' })
  return parseFloorPlan({
    version: '1',
    units: 'm',
    walls: [wall('s', [0, 0], [3, 0]), wall('e', [3, 0], [3, 2.4]), wall('n', [0, 2.4], [3, 2.4]), wall('w', [0, 2.4], [0, 0])],
    rooms: [{ id: 'bath', name: 'Bathroom', boundary: ['s', 'e', 'n', 'w'], use: 'bathroom' }],
    openings: [],
    items: [
      { id: 'tight', kind: 'toilet', at: [0.35, 0.375], size: [0.4, 0.65], height: 0.8 },
      { id: 'free', kind: 'toilet', at: [1.5, 0.375], size: [0.4, 0.65], height: 0.8 },
      { id: 'basin', kind: 'basin', at: [2.5, 0.275], size: [0.55, 0.45], height: 0.85 },
    ],
  })
}

describe('ARE-73: a firm\'s fixture clearance as a zone', () => {
  it('measures the zone over the firm\'s width, for the kinds it names, and says each side by compass', () => {
    const standards = parseFirmStandards({ version: '1', standards: [{ measure: 'fixture_clearance', value: 0.7, width: 0.8, unit: 'm', kinds: ['toilet'] }] })
    const measured = firmMeasures(bathroom(), standards)
    expect(measured.map((m) => m.thing.id)).toEqual(['tight', 'free'])
    const [tight, free] = measured
    expect(tight!.measured).toBe(0)
    expect(tight!.said).toBe('in "Bathroom", over a zone 0.80 m wide on its centre line: 0.30 m to the west and 2.60 m to the east of it')
    expect(free!.measured).toBeCloseTo(1.65, 6)
  })

  it('keeps the floor straight out from the front when the standard states no width', () => {
    const standards = parseFirmStandards({ version: '1', standards: [{ measure: 'fixture_clearance', value: 0.7, unit: 'm', kinds: ['toilet'] }] })
    const [tight] = firmMeasures(bathroom(), standards)
    expect(tight!.measured).toBeCloseTo(1.65, 6)
    expect(tight!.said).toBe('in "Bathroom", to the nearest wall face, doorway or fixture')
  })
})
