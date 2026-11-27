/**
 * ARE-76: `grid_areas` on a row of split-level houses up a street, each a building: every house
 * as high as the next from the ground under it, with two storeys and two split levels.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const HOUSES = [0, 1, 2]

/** House `n`: a street half, a garden half a level up, and a bedroom floor a storey over each. */
const house = (n: number): string[] =>
  ['f0', 'b0', 'f1', 'b1'].flatMap((part, i) => [
    `floor h${n}${part} "House ${n + 1} ${part}" level ${n * 2 + i / 2} elevation ${Math.round((n * 0.6 + i * 1.4) * 1000) / 1000} height 2.5`,
    `room h${n}${part}r "Room" ${i < 2 ? 'living' : 'bedroom'} 5 x ${i % 2 === 0 ? 4 : 4.5} at ${n * 5},${i % 2 === 0 ? 0 : 4}`,
  ])

let b: Bench
beforeAll(async () => {
  b = bench({})
  const reply = await b.call('grid_write_rooms', { plan: 'row.json', rooms: ['walls outside 0.3 inside 0.1', ...HOUSES.flatMap(house)].join('\n') })
  expect(reply.isError, reply.text).toBe(false)
  const file = join(b.folder, 'row.json')
  const plan = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  plan['buildings'] = HOUSES.map((n) => ({ id: `h${n}`, name: `House ${n + 1}`, floors: ['f0', 'b0', 'f1', 'b1'].map((p) => `h${n}${p}`) }))
  plan['site'] = { ...((plan['site'] as object | undefined) ?? {}), ground: -0.15 }
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`)
})
afterAll(() => b.close())

describe('ARE-76 grid_areas per building on a rising street', () => {
  it('gives every house the same height, from the ground under it, with two storeys and two split levels', async () => {
    const reply = await b.call('grid_areas', { plan: 'row.json' })
    expect(reply.isError, reply.text).toBe(false)
    const buildings = (reply.data as { buildings: { id: string; height: number; ground: number; from: string; storeys: unknown }[] }).buildings
    expect(buildings.map((h) => h.from)).toEqual(['site', 'under', 'under'])
    buildings.forEach((h, n) => {
      expect(h.height).toBeCloseTo(buildings[0]!.height, 9)
      expect(h.ground).toBeCloseTo(n * 0.6 - 0.15, 9)
      expect(h.storeys).toEqual({ above: 2, below: 0, split: 2 })
    })
    expect(reply.text).toContain('2 storeys with 2 split levels')
    expect(reply.text).toContain('from the ground under it at +0.45')
    expect((reply.data as { storeys: { above: number } }).storeys.above).toBe(2)
  })
})
