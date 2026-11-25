/**
 * WRT-29: a door moved along its wall is said to have moved, and how far, by the change's own
 * verdict and by grid_compare, as grid_diff says it. Found when a door moved 2.88 m and both
 * answered that every opening was where it was.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from './replay/harness'

/** A hall (west) and a living room (east), a front door in the hall's south wall. */
function twoRooms(): FloorPlan {
  const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior' = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s1', [0, 0], [5, 0]), wall('mid', [5, 0], [5, 4], 'interior'), wall('n1', [5, 4], [0, 4]), wall('w', [0, 4], [0, 0]), wall('s2', [5, 0], [9, 0]), wall('e', [9, 0], [9, 4]), wall('n2', [9, 4], [5, 4])],
    rooms: [
      { id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s1', 'mid', 'n1', 'w'] },
      { id: 'living', name: 'Living', use: 'living', boundary: ['s2', 'e', 'n2', 'mid'] }
    ],
    openings: [
      { id: 'front', wall: 's1', type: 'door', offset: 0.5, width: 0.9, sill: 0, height: 2.1 },
      { id: 'link', wall: 'mid', type: 'door', offset: 1, width: 0.8, sill: 0, height: 2.1 }
    ]
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': twoRooms() })
})
afterAll(() => b.close())

describe('a door moved along its wall', () => {
  it('is said to have moved, and how far, by the change that moved it', async () => {
    b.write('plan.json', twoRooms())
    const reply = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'front', from: 'start', distance: 3.38 })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toContain('same building')
    expect(reply.text).toContain('door "front" moved 2.88 m along its wall')
  })

  it('is said to have moved by grid_compare', async () => {
    const moved = twoRooms()
    moved.openings[0] = { ...moved.openings[0]!, offset: 3.38 }
    b.write('before.json', twoRooms())
    b.write('after.json', moved)
    const reply = await b.call('grid_compare', { plans: ['before.json', 'after.json'], labels: ['Before', 'After'] })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toContain('same building')
    expect(reply.text).toContain('door "front" moved 2.88 m along its wall')
    expect(reply.text).toContain('Openings changed: door "front": moved 2.88 m along its wall.')
    const comparison = (reply.data as { comparisons: Array<{ openingsChanged: unknown[] }> }).comparisons[0]!
    expect(comparison.openingsChanged).toEqual([{ id: 'front', type: 'door', changes: ['moved 2.88 m along its wall'], moved: 2.88 }])
  })
})
