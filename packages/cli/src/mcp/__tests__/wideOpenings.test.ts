/**
 * WRT-22: an opening or door an edit makes is as wide as its wall or room side allows. The tools'
 * arguments stop only at `openingWidest`; the edit itself refuses one that does not fit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.3, height: 12, kind: 'exterior' })

/** A warehouse hall 60 by 30 m between centre lines, with one dock door in its south wall. */
const HALL = {
  version: '1',
  building: 'warehouse',
  walls: [wall('s', [0, 0], [60, 0]), wall('e', [60, 0], [60, 30]), wall('n', [60, 30], [0, 30]), wall('w', [0, 30], [0, 0])],
  rooms: [{ id: 'hall', name: 'Hall', use: 'storage', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'dock', wall: 's', type: 'door', offset: 10, width: 4, height: 5 }],
}

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

describe('wide openings in an edit (WRT-22)', () => {
  it('splits a hall with a 15 m door in the new wall', async () => {
    b.write('split.json', HALL)
    const reply = await b.call('grid_split_room', { plan: 'split.json', room: 'hall', side: 'east', size: 20, new_room: 'bay', new_name: 'Loading bay', door_width: 15 })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('15.00 m wide')
  })

  it('refuses a door wider than the new wall, by the wall, not by the argument', async () => {
    b.write('split-wide.json', HALL)
    const reply = await b.call('grid_split_room', { plan: 'split-wide.json', room: 'hall', side: 'east', size: 20, new_room: 'bay', new_name: 'Loading bay', door_width: 40 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('would run past the ends of the new')
  })

  it('makes a dock door 30 m wide in a 60 m wall', async () => {
    b.write('change.json', HALL)
    const reply = await b.call('grid_change_opening', { plan: 'change.json', opening: 'dock', width: 30, keep: 'start' })
    expect(reply.isError, reply.text).toBe(false)
  })
})
