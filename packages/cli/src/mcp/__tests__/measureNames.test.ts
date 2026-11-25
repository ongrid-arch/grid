/**
 * CMD-29: the same thing goes by the same name in every mode of grid_measure: a route goes from
 * a room (`from`, as `room`), and narrow takes `width` as route and use do (as `under`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
const plan = {
  version: '1',
  units: 'm',
  walls: [wall('a', [0, 0], [3, 0]), wall('b', [3, 0], [3, 3]), wall('c', [3, 3], [0, 3]), wall('d', [0, 3], [0, 0])],
  rooms: [{ id: 'wc', name: 'WC', boundary: ['a', 'b', 'c', 'd'], use: 'bathroom' }],
  openings: [{ id: 'door', wall: 'd', type: 'door', offset: 1, width: 0.7, height: 2.1 }],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': plan })
})
afterAll(() => b.close())

describe('one name for one thing across grid_measure modes', () => {
  it('route takes from as the room it starts in, with the same answer as room', async () => {
    const asRoom = await b.call('grid_measure', { plan: 'plan.json', what: 'route', room: 'wc', to: 'outside' })
    const asFrom = await b.call('grid_measure', { plan: 'plan.json', what: 'route', from: 'wc', to: 'outside' })
    expect(asFrom.isError, asFrom.text).toBe(false)
    expect(asFrom.text).toBe(asRoom.text)
    const both = await b.call('grid_measure', { plan: 'plan.json', what: 'route', room: 'wc', from: 'wc', to: 'outside' })
    expect(both.isError).toBe(false)
    const two = await b.call('grid_measure', { plan: 'plan.json', what: 'route', room: 'wc', from: 'other', to: 'outside' })
    expect(two).toMatchObject({ isError: true })
    expect(two.text).toContain('from or room')
  })

  it('narrow takes width as under', async () => {
    const asUnder = await b.call('grid_measure', { plan: 'plan.json', what: 'narrow', under: 0.8 })
    const asWidth = await b.call('grid_measure', { plan: 'plan.json', what: 'narrow', width: 0.8 })
    expect(asWidth.isError, asWidth.text).toBe(false)
    expect(asWidth.text).toBe(asUnder.text)
    const two = await b.call('grid_measure', { plan: 'plan.json', what: 'narrow', under: 0.8, width: 0.9 })
    expect(two).toMatchObject({ isError: true })
    expect(two.text).toContain('under or width')
  })

  it('still refuses an argument a mode does not take', async () => {
    const stray = await b.call('grid_measure', { plan: 'plan.json', what: 'room', room: 'wc', from: 'wc' })
    expect(stray).toMatchObject({ isError: true })
  })
})
