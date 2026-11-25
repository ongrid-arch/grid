/**
 * CNT-14: kinds of door and window and their handing through the tool server: the person's
 * terms in `grid_change_opening` and rooms text, the not-checked line in `grid_check`, and the
 * kinds in the schedules.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from './replay/harness'

/** A hall (west) and a bedroom (east), the wall between them drawn south to north, a door in it with no swing stated. */
function twoRooms(): FloorPlan {
  const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior' = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s1', [0, 0], [3, 0]), wall('mid', [3, 0], [3, 3], 'interior'), wall('n1', [3, 3], [0, 3]), wall('w', [0, 3], [0, 0]), wall('s2', [3, 0], [6, 0]), wall('e', [6, 0], [6, 3]), wall('n2', [6, 3], [3, 3])],
    rooms: [
      { id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s1', 'mid', 'n1', 'w'] },
      { id: 'bedroom', name: 'Bedroom', use: 'bedroom', boundary: ['s2', 'e', 'n2', 'mid'] }
    ],
    openings: [
      { id: 'd', wall: 'mid', type: 'door', offset: 1, width: 0.8, sill: 0, height: 2.1 },
      { id: 'patio', wall: 'e', type: 'door', offset: 0.3, width: 2.4, sill: 0, height: 2.1 },
      { id: 'win', wall: 'n2', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 }
    ]
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': twoRooms() })
})
afterAll(() => b.close())

const opening = (id: string): FloorPlan['openings'][number] => parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8'))).openings.find((o) => o.id === id)!

/** A door with a 0.02 m threshold keeps it when only its width or swing is changed. */
describe('a door keeps its sill when something else changes', () => {
  it('widening it', async () => {
    const plan = twoRooms()
    plan.openings.find((o) => o.id === 'd')!.sill = 0.02
    b.write('plan.json', plan)
    const reply = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'd', width: 0.9 })
    expect(reply.isError, reply.text).toBe(false)
    expect(opening('d').width).toBeCloseTo(0.9)
    expect(opening('d').sill).toBeCloseTo(0.02)
  })
  it('turning its swing', async () => {
    const plan = twoRooms()
    plan.openings.find((o) => o.id === 'd')!.sill = 0.02
    b.write('plan.json', plan)
    const reply = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'd', opens_into: 'hall', hinged: 'left' })
    expect(reply.isError, reply.text).toBe(false)
    expect(opening('d').sill).toBeCloseTo(0.02)
  })
  it('a window made a door still gets a floor-level sill', async () => {
    b.write('plan.json', twoRooms())
    await b.call('grid_change_opening', { plan: 'plan.json', opening: 'win', type: 'door' })
    expect(opening('win').sill).toBe(0)
  })
})
