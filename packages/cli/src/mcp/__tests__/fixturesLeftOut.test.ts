/**
 * ARE-26: a measure that depends on fixtures names the ones it left out and why. A toilet with no
 * height is set aside when the plan is read; its room used to read as holding no fixtures, with
 * a clear turning circle, and only grid_check said the toilet was left out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixturesLeftOut, fixturesLeftOutLine } from '../../quantities/fixtures'
import { bench, type Bench } from './replay/harness'

const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
function bathroom(items: unknown[]): unknown {
  return {
    version: '1',
    units: 'm',
    walls: [wall('a', [0, 0], [3, 0]), wall('b', [3, 0], [3, 3]), wall('c', [3, 3], [0, 3]), wall('d', [0, 3], [0, 0])],
    rooms: [{ id: 'wc', name: 'WC', boundary: ['a', 'b', 'c', 'd'], use: 'bathroom' }],
    openings: [{ id: 'door', wall: 'd', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
    items,
  }
}
const NO_HEIGHT = { id: 'pan', kind: 'toilet', at: [1.5, 0.4], size: [0.4, 0.6] }
const FULL = { id: 'pan', kind: 'toilet', at: [1.5, 0.4], size: [0.4, 0.6], height: 0.4 }

let b: Bench
beforeAll(() => {
  b = bench({ 'without.json': bathroom([NO_HEIGHT]), 'with.json': bathroom([FULL]), 'none.json': bathroom([]) })
})
afterAll(() => b.close())

type Left = { id: string | null; field: string | null; found: string | null }[]

describe('fixtures a measure leaves out', () => {
  it('what=use does not say the room holds no fixtures, and names the toilet and its height', async () => {
    const reply = await b.call('grid_measure', { plan: 'without.json', what: 'use', room: 'wc' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toContain('the room holds no fixtures')
    expect(reply.text).toContain('Left out of this measure')
    expect(reply.text).toContain('"pan": its height is missing')
    expect(reply.data!['fixturesLeftOut']).toEqual([{ id: 'pan', field: 'height', found: 'missing' }] satisfies Left)
  })

  it('what=fit, what=access and a route with a width name it too', async () => {
    for (const args of [{ what: 'fit', room: 'wc', diameter: 1.5 }, { what: 'access' }, { what: 'route', room: 'wc', to: 'outside', width: 0.7 }]) {
      const reply = await b.call('grid_measure', { plan: 'without.json', ...args })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.text, JSON.stringify(args)).toContain('"pan": its height is missing')
      expect((reply.data!['fixturesLeftOut'] as Left).map((one) => one.id)).toEqual(['pan'])
    }
  })

  it('grid_areas names it', async () => {
    const reply = await b.call('grid_areas', { plan: 'without.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('"pan": its height is missing')
  })

  it('a measure of a plan with nothing left out answers as before', async () => {
    for (const plan of ['with.json', 'none.json']) {
      const reply = await b.call('grid_measure', { plan, what: 'use', room: 'wc' })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.text).not.toContain('Left out of this measure')
      expect(reply.data).not.toHaveProperty('fixturesLeftOut')
    }
    const none = await b.call('grid_measure', { plan: 'none.json', what: 'use', room: 'wc' })
    expect(none.text).toContain('the room holds no fixtures')
  })

  it('the helper names an item held back by the checks as well, with no field', () => {
    expect(fixturesLeftOutLine([])).toBeNull()
    expect(fixturesLeftOutLine([{ id: 'tub', index: null, field: null, found: null }])).toContain('"tub": grid_check says why')
    expect(fixturesLeftOut(bathroom([FULL]) as never)).toEqual([])
  })
})
