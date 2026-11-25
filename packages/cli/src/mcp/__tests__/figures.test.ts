/** CMD-22: the figures in a tool's structured data are rounded as the text rounds them. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { compactData, roundedData } from '../figures'
import { bench, type Bench } from './replay/harness'

const fourFlats = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/four-flats.plan.json'), 'utf8')) as FloorPlan

describe('roundedData', () => {
  it('takes the noise off a length and an area', () => {
    expect(roundedData({ depth: 3.0999999999999996, area: 27.359999999999985 })).toEqual({ depth: 3.1, area: 27.36 })
  })
  it('rounds half up from a cleaned value, so 20.295 is 20.3 and 15.75 stays', () => {
    expect(roundedData({ area: 20.294999999999998 })).toEqual({ area: 20.3 })
    expect(roundedData({ rooms: [{ area: 15.75 }, { floorArea: 20.295 }] })).toEqual({ rooms: [{ area: 15.75 }, { floorArea: 20.3 }] })
    expect(roundedData({ width: 1.8749999999999982, shift: -1.875 })).toEqual({ width: 1.875, shift: -1.875 })
  })
  it('keeps a length at the millimetre and a wall line\'s net as a length', () => {
    expect(roundedData({ walls: [{ gross: 12.3456789, net: 11.0004999 }], net: 20.12345 })).toEqual({ walls: [{ gross: 12.346, net: 11 }], net: 20.12 })
  })
  it('writes the areas of a use and an estimate line in m2 to 0.01', () => {
    expect(roundedData({ byUse: { living: 20.294999999999998 }, walls: 4.12345, lines: [{ unit: 'm2', quantity: 27.359999999999985 }, { unit: 'm', quantity: 7.12345 }] })).toEqual({ byUse: { living: 20.3 }, walls: 4.12, lines: [{ unit: 'm2', quantity: 27.36 }, { unit: 'm', quantity: 7.123 }] })
  })
  it('leaves whole numbers, places on the globe and tolerances alone', () => {
    expect(roundedData({ count: 3, latitude: 51.5007292, tol: 0.0000005 })).toEqual({ count: 3, latitude: 51.5007292, tol: 0.0000005 })
  })
})

describe('compactData', () => {
  const tool = { outputSchema: { type: 'object', properties: { floors: { type: 'array', items: { type: 'object', required: ['grossInternal'] } } } } }
  it('puts the label, single figures and totals first and drops what is empty', () => {
    const out = compactData({ label: 'L', rooms: [{ id: 'a', note: null, tags: [] }], totals: { floor: 1 }, net: 2, extra: [] }, tool)
    expect(Object.keys(out)).toEqual(['label', 'totals', 'net', 'rooms'])
    expect(out['rooms']).toEqual([{ id: 'a' }])
  })
  it('keeps a key the output schema requires', () => {
    expect(compactData({ floors: [{ grossInternal: null }] }, tool)).toEqual({ floors: [{ grossInternal: null }] })
  })
})

describe('structured data through the server', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({ 'plan.json': fourFlats })
  })
  afterAll(() => b.close())
  const noisy = (value: unknown): string[] | null => JSON.stringify(value).match(/"[^"]+":-?\d+\.\d{4,}/g)

  it('carries no figure past the millimetre', async () => {
    for (const [tool, args] of [['grid_areas', {}], ['grid_takeoff', {}], ['grid_takeoff', { for: 'estimate' }]] as const) {
      const r = await b.call(tool, args)
      expect(r.isError, r.text).toBe(false)
      expect(noisy(r.data), tool).toBeNull()
    }
  })

  it('is no longer and has totals before rooms with data=compact', async () => {
    const full = await b.call('grid_takeoff', {})
    const compact = await b.call('grid_takeoff', { data: 'compact' })
    expect(compact.text).toBe(full.text)
    expect(JSON.stringify(compact.data).length).toBeLessThanOrEqual(JSON.stringify(full.data).length)
    const keys = Object.keys(compact.data!)
    expect(keys.indexOf('totals')).toBeLessThan(keys.indexOf('rooms'))
  })
})
