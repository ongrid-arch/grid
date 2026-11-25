/**
 * MSG-28: a door moved to another wall is said to be there. The change that moved it names what
 * lies on each side of its new wall, and of its old one, never its old sides as its new; and
 * grid_diff says it moved from one wall to the other, never a distance along its wall.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from './replay/harness'

/** A hall (west) and a living room (east), a front door in the hall's south wall and a door between them. */
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

describe('a door moved to another wall', () => {
  it('the change that moved it names the sides of its new wall and of its old one', async () => {
    b.write('plan.json', twoRooms())
    const reply = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'link', room: 'living', side: 'north' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('Moved door "link" to wall "n2", the north side of "Living".')
    expect(reply.text).toContain('It was between "Hall" ↔ "Living"; it is now between "Living" ↔ outside.')
    expect(reply.text).not.toContain('It is between "Hall" ↔ "Living"')
  })

  it('a change that keeps it on its wall still says where it is', async () => {
    b.write('plan.json', twoRooms())
    const reply = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'link', width: 0.9 })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('It is between "Hall" ↔ "Living".')
  })

  it('grid_diff says it moved from one wall to the other, with their sides', async () => {
    b.write('plan.json', twoRooms())
    const marked = await b.call('grid_mark_start', { plan: 'plan.json' })
    expect(marked.isError, marked.text).toBe(false)
    const moved = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'link', room: 'living', side: 'north' })
    expect(moved.isError, moved.text).toBe(false)
    const reply = await b.call('grid_diff', { plan: 'plan.json', picture: false })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('Door "link" moved from wall "mid", between "Hall" and "Living", to wall "n2", between "Living" and outside')
    expect(reply.text).not.toContain('along its wall')
  })
})
