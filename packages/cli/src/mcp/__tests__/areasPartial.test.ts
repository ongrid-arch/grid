/** ARE-42: grid_areas gives the floors that could be measured and names the ones that could not. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { bench, type Bench } from './replay/harness'

let b: Bench
beforeAll(() => {
  const plan = structuredClone(stairRoomHouse())
  plan.rooms = plan.rooms.filter((room) => room.floor !== 'first')
  for (const wall of plan.walls) if (wall.floor === 'first') wall.kind = 'interior'
  b = bench({ 'tower.json': plan })
})
afterAll(() => b.close())

describe('grid_areas with a floor that could not be measured (ARE-42)', () => {
  it('keeps the whole total null and gives the other floors with the failing floor named', async () => {
    const reply = await b.call('grid_areas', { plan: 'tower.json', gross: 'internal' })
    expect(reply.isError, reply.text).toBe(false)
    const data = reply.data as { grossInternal: number | null; partial: { grossInternal: { area: number; unmeasured: { floor: string }[] } } }
    expect(data.grossInternal).toBeNull()
    expect(data.partial.grossInternal.area).toBeGreaterThan(0)
    expect(data.partial.grossInternal.unmeasured.map((u) => u.floor)).toEqual(['first'])
    expect(reply.text).toMatch(/Gross internal: not known for the whole building; the other 2 floors add up to .*; not measured: floor "first" \(/)
  })
})
