/**
 * ARE-55: a fit-out (a plan that names a base) is taken off as its own work: partitions, doors and
 * finishes, with no slab, no roof and none of the shell's walls.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { mergeBase } from '@ongrid/floorplan/geometry'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'

const shell = parseFloorPlan({
  version: '1',
  floors: [{ id: 'f5', name: 'Fifth', level: 5 }],
  walls: [
    { id: 's1', start: [0, 0], end: [8, 0], thickness: 0.3, kind: 'exterior', height: 2.7 },
    { id: 's2', start: [8, 0], end: [8, 5], thickness: 0.3, kind: 'exterior', height: 2.7 },
    { id: 's3', start: [8, 5], end: [0, 5], thickness: 0.3, kind: 'exterior', height: 2.7 },
    { id: 's4', start: [0, 5], end: [0, 0], thickness: 0.3, kind: 'exterior', height: 2.7 },
  ],
  rooms: [{ id: 'shell', name: 'Shell', boundary: ['s1', 's2', 's3', 's4'] }],
})
const fitOut = parseFloorPlan({
  version: '1',
  base: 'shell.json',
  walls: [{ id: 'p1', start: [4, 0], end: [4, 5], thickness: 0.1, kind: 'partition', height: 2.7 }],
  rooms: [
    { id: 'front', name: 'Front', boundary: ['s1', 'p1', 's3', 's4'] },
    { id: 'back', name: 'Back', boundary: ['s1', 's2', 's3', 'p1'] },
  ],
  openings: [{ id: 'd1', wall: 'p1', type: 'door', offset: 2, width: 0.8, height: 2.1 }],
})

describe('the take-off of a fit-out', () => {
  const merged = mergeBase(fitOut, shell).plan
  const t = planTakeoff(surveyPlan(merged))

  it('lists only its own walls, not the shell\'s', () => {
    expect(t.walls.map((w) => w.kind)).toEqual(['partition'])
    expect(t.walls[0]!.gross).toBeCloseTo(5, 6)
  })

  it('has no slab and no roof, and says why', () => {
    expect(t.envelope.slabs).toBeNull()
    expect(t.envelope.roof).toBeNull()
    for (const floor of t.envelope.floors) {
      expect([floor.slab, floor.roof]).toEqual([null, null])
      expect(floor.why).toContain('base')
    }
  })

  it('still takes off the finishes of its rooms', () => {
    expect(t.rooms.map((r) => r.id)).toEqual(['front', 'back'])
    expect(t.totals.floorArea).toBeGreaterThan(30)
    expect(t.totals.skirting).toBeGreaterThan(20)
  })

  it('leaves a plan with no base as it was: the same walls with their outside walls, a slab and a roof', () => {
    const whole = planTakeoff(surveyPlan(parseFloorPlan({ ...fitOut, base: undefined, walls: [...shell.walls, ...fitOut.walls] })))
    expect(whole.walls.map((w) => w.kind)).toContain('exterior')
    expect(whole.envelope.slabs).toBeGreaterThan(0)
    expect(whole.envelope.roof).toBeGreaterThan(0)
  })
})
