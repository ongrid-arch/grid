import { afterEach, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const plan = {
  version: '1',
  units: 'm',
  walls: [
    { id: 'south', start: [0, 0], end: [4, 0], thickness: 0.3, height: 2.6, kind: 'exterior' },
    { id: 'east', start: [4, 0], end: [4, 3], thickness: 0.3, height: 2.6, kind: 'exterior' },
    { id: 'north', start: [4, 3], end: [0, 3], thickness: 0.3, height: 2.6, kind: 'exterior' },
    { id: 'west', start: [0, 3], end: [0, 0], thickness: 0.3, height: 2.6, kind: 'exterior' },
  ],
  rooms: [{ id: 'room', name: 'Room', use: 'living', boundary: ['south', 'east', 'north', 'west'] }],
  openings: [{ id: 'window', wall: 'north', type: 'window', offset: 1, width: 1, sill: 1, height: 1 }],
}
const revised = { ...plan, openings: [{ ...plan.openings[0]!, width: 2 }] }
const rates = { currency: 'TST', rates: {
  wall: { rate: 10, unit: 'm2', waste: 0.1 },
  window: { rate: 15, unit: 'nr' },
  ceiling: { rate: 1, unit: 'nr' },
  'demolish:cut': { rate: 25, unit: 'm2' },
  'new:lintel': { rate: 10, unit: 'm' },
  gross_internal: { rate: 100, unit: 'm2' },
} }

describe('ARE-74: pricing two versions', () => {
  let b: Bench
  const open = () => (b = bench({ 'plan.json': plan, 'earlier.json': plan, 'later.json': revised, 'rates.json': rates }))
  afterEach(() => b.close())

  it('prices wall area less openings and the old and new window keys from a marker', async () => {
    open()
    expect((await b.call('grid_mark_start', { name: 'start.json' })).isError).toBe(false)
    b.write('plan.json', revised)
    const args = { for: 'estimate', since: 'start.json', whole: true }
    const r = await b.call('grid_takeoff', args)
    expect(r.isError, r.text).toBe(false)
    expect(r.text).toContain('35.40 m² → 34.40 m²')
    const close = (n: number) => expect.closeTo(n, 8)
    expect(r.data?.['lines']).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'wall:exterior:0.3', before: close(35.4), after: close(34.4), change: close(-1), rate: 10, waste: 0.1, beforeAmount: close(389.4), afterAmount: close(378.4), changeAmount: close(-11) }),
      expect.objectContaining({ key: 'window:1x1', before: 1, after: 0, change: -1, changeAmount: -15 }),
      expect.objectContaining({ key: 'window:2x1', before: 0, after: 1, change: 1, changeAmount: 15 }),
      expect.objectContaining({ key: 'ceiling', assumed: true, state: 'wrong unit', changeAmount: null }),
      expect.objectContaining({ key: 'gross_internal', state: 'alternative' }),
    ]))
    expect(r.data?.['cost']).toMatchObject({ currency: 'TST', complete: false, change: close(-11) })
    const sheet = await b.call('grid_takeoff', { ...args, format: 'csv' })
    expect(sheet.text).toContain('key,what,unit,before,after,change')
    expect(sheet.text).toContain('window:1x1,')
  })

  it('accepts a baseline file and returns a rate card without rates', async () => {
    b = bench({ 'plan.json': revised, 'earlier.json': plan })
    const since = await b.call('grid_takeoff', { for: 'estimate', since: 'earlier.json' })
    expect(since.isError, since.text).toBe(false)
    expect(since.data?.['lines']).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'window:1x1', before: 1, after: 0 }),
      expect.objectContaining({ key: 'window:2x1', before: 0, after: 1 }),
    ]))
    expect(since.data?.['rateCard']).toBeDefined()
    expect(since.data?.['cost']).toBeUndefined()
  })

  it('prices the work between two plans, including the cut and lintel on the wall that stays', async () => {
    open()
    const pair = await b.call('grid_takeoff', { for: 'change', plans: ['earlier.json', 'later.json'], whole: true })
    expect(pair.isError, pair.text).toBe(false)
    expect(pair.data?.['lines']).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'demolish:cut:exterior:0.3', quantity: 1, amount: 25, list: 'demolish' }),
      expect.objectContaining({ key: 'make_good:reveals', quantity: expect.closeTo(1.8), list: 'make good' }),
      expect.objectContaining({ key: 'new:lintel:exterior:0.3', quantity: expect.closeTo(2.3), amount: expect.closeTo(23), assumed: true, list: 'new' }),
    ]))
  })

  it('uses the same cost comparison in diff and compare', async () => {
    open()
    expect((await b.call('grid_mark_start', {})).isError).toBe(false)
    b.write('plan.json', revised)
    const diff = await b.call('grid_diff', { rates: 'rates.json', picture: false, whole: true })
    const compare = await b.call('grid_compare', { plans: ['earlier.json', 'later.json'], rates: 'rates.json', whole: true })
    expect(diff.isError, diff.text).toBe(false)
    expect(compare.isError, compare.text).toBe(false)
    expect(compare.data?.['comparisons']).toEqual([expect.objectContaining({ estimateChange: expect.objectContaining({ lines: (diff.data?.['estimateChange'] as Record<string, unknown>)['lines'] }) })])
    expect(diff.data?.['estimateChange']).toMatchObject({ cost: { change: expect.closeTo(-11) } })
  })

  it('measures demolished openings on the earlier side of a phase diff', async () => {
    open()
    b.write('plan.json', { ...plan, openings: [
      { ...plan.openings[0]!, phase: 'demolished' },
      { ...revised.openings[0]!, id: 'new-window', phase: 'new' },
    ] })
    const diff = await b.call('grid_diff', { since: 'phase', rates: 'rates.json', picture: false, whole: true })
    expect(diff.isError, diff.text).toBe(false)
    expect(diff.data?.['estimateChange']).toMatchObject({ lines: expect.arrayContaining([
      expect.objectContaining({ key: 'window:1x1', before: 1, after: 0 }),
      expect.objectContaining({ key: 'window:2x1', before: 0, after: 1 }),
    ]) })
  })

  it('refuses inputs that would make the comparison ambiguous', async () => {
    open()
    for (const args of [
      { since: 'earlier.json' },
      { for: 'change', plan: 'plan.json', plans: ['earlier.json', 'later.json'] },
      { for: 'estimate', plans: ['earlier.json', 'later.json'] },
      { for: 'change', since: 'earlier.json' },
    ]) {
      expect((await b.call('grid_takeoff', args)).isError).toBe(true)
    }
  })
})
