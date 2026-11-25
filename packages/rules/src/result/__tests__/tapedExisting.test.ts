/**
 * ARE-41: the check sets taped lengths against the existing state, as every change's answer does.
 */
import { describe, expect, it } from 'vitest'
import { tapedLengths } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { inspectPlan } from '../..'

const wall = (id: string, start: [number, number], end: [number, number], phase: string) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'partition', phase })

const raw = {
  version: '1',
  walls: [
    wall('s', [0, 0], [4, 0], 'existing'),
    wall('e', [4, 0], [4, 3], 'existing'),
    wall('n', [4, 3], [0, 3], 'existing'),
    wall('w', [0, 3], [0, 0], 'existing'),
    wall('s2', [0, 0], [6, 0], 'new'),
    wall('e2', [6, 0], [6, 3], 'new'),
    wall('n2', [6, 3], [0, 3], 'new'),
    wall('w2', [0, 3], [0, 0], 'new'),
  ],
  rooms: [
    { id: 'old', name: 'Old', boundary: ['s', 'e', 'n', 'w'], phase: 'demolished' },
    { id: 'big', name: 'Big', boundary: ['s2', 'e2', 'n2', 'w2'], phase: 'new' },
  ],
  openings: [],
  taped: [{ room: 'old', wall: 's', length: 3.8 }, { room: 'big', wall: 's2', length: 5.8 }],
}

describe('the check measures taped lengths in the existing state (ARE-41)', () => {
  it('says the same rows as tapedLengths on the plan read whole', () => {
    const rows = inspectPlan(raw).taped ?? []
    expect(rows.map((r) => r.state)).toEqual(['agrees', 'not-measured'])
    expect(rows).toEqual(tapedLengths(parseFloorPlan(raw)))
  })
})
