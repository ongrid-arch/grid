/** ARE-68: the lettable area, efficiency, the area per person, frontage zones and the area as written, in the tools. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'
import { shopPlan, towerPlan } from '../../quantities/__tests__/lettablePlans'

let b: Bench
beforeAll(() => {
  b = bench({ 'tower.json': towerPlan(), 'school.json': towerPlan(), 'shop.json': shopPlan() })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

type Lettable = { lettable: number; core: number; efficiency: number; floors: { floor: string; coreShare: number }[]; floorTypes: { floorType: string }[] }

describe('ARE-68: grid_areas', () => {
  it('gives the lettable area, the core and efficiency beside net to gross, with their rules', async () => {
    const reply = await ok('grid_areas', { plan: 'tower.json' })
    const data = reply.data as { lettable: Lettable; netToGross: number; grossInternal: number }
    expect(data.lettable.efficiency).toBeCloseTo(data.lettable.lettable / data.grossInternal, 2)
    expect(data.netToGross).toBeGreaterThan(data.lettable.efficiency)
    expect(reply.text).toMatch(/Lettable area: [\d.]+ m², [\d.]+% of gross internal\. The core: [\d.]+ m²/)
    expect(reply.text).toMatch(/It holds the core and the corridors; lettable to gross: [\d.]+%\./)
    expect(reply.text).toMatch(/Floor "f1": net .*; lettable [\d.]+ m² \([\d.]+%\), core [\d.]+ m² \([\d.]+% of the plate\)\./)
    expect(reply.text).toContain('Efficiency by floor type: office, 1 floor')
    expect(reply.text).toContain('Not lettable, in the net:')
    expect(reply.text).toContain('net internal or net lettable area')
    expect((reply.data as { people?: unknown }).people).toBeUndefined()
  })

  it('counts the uses the person chooses as lettable', async () => {
    const reply = await ok('grid_areas', { plan: 'tower.json', lettable_uses: ['office'] })
    expect((reply.data as { lettable: Lettable }).lettable.floorTypes.map((t) => t.floorType)).toEqual(['office'])
    expect(reply.text).toContain('the rooms you counted as lettable: use office')
  })

  it('gives the area per pupil from the call, and from the brief', async () => {
    const asked = await ok('grid_areas', { plan: 'tower.json', people: { pupils: 10 } })
    const gross = (asked.data as { grossInternal: number }).grossInternal
    expect((asked.data as { people: { kind: string; per: { grossInternal: number } }[] }).people[0]!.per.grossInternal).toBeCloseTo(gross / 10, 2)
    expect(asked.text).toMatch(/Per pupil, for 10 pupils: gross internal [\d.]+ m², gross external [\d.]+ m², net [\d.]+ m², lettable [\d.]+ m²\./)
    await ok('grid_write_brief', { plan: 'school.json', brief: { people: { pupils: 20, covers: { count: 5, rooms: ['Shop'] } } } })
    const briefed = await ok('grid_areas', { plan: 'school.json' })
    expect(briefed.text).toContain('Per pupil, for 20 pupils, from the brief: gross internal')
    expect(briefed.text).toMatch(/Per cover, for 5 covers in Shop, from the brief: net [\d.]+ m²\./)
  })

  it('refuses a figure it does not know, naming the ones it does', async () => {
    const reply = await b.call('grid_areas', { plan: 'tower.json', people: { guests: 3 } })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('pupils, covers, keys, beds, capacity, desks')
  })

  it('gives each room\'s area as written beside its net when asked', async () => {
    const reply = await ok('grid_areas', { plan: 'shop.json', as_written: true })
    expect(reply.text).toContain('"Shop" (retail): 6.00 m × 20.00 m, 120.00 m², as written 125.24 m²')
    expect(reply.text).toContain('the size a room written to its walls\' centre lines was written at')
    const room = (reply.data as { floors: { rooms: { asWritten?: number }[] }[] }).floors[0]!.rooms[0]!
    expect(room.asWritten).toBeCloseTo(6.2 * 20.2, 6)
    const plain = await ok('grid_areas', { plan: 'shop.json' })
    expect(plain.text).not.toContain('as written')
  })
})

describe('ARE-68: grid_compare', () => {
  it('gives each option\'s lettable area and efficiency, and the area per person', async () => {
    const reply = await ok('grid_compare', { plans: ['tower.json', 'shop.json'], people: { keys: 4 } })
    const options = (reply.data as { options: { lettable: number; efficiency: number; people: unknown[] }[] }).options
    expect(options[1]!.lettable).toBeCloseTo(120, 6)
    expect(options.every((o) => o.people.length === 1)).toBe(true)
    expect(reply.text).toMatch(/A: .*net to gross [\d.]+%; lettable [\d.]+ m² \([\d.]+%\), core [\d.]+ m² \([\d.]+%\)/)
    expect(reply.text).toContain('Per key, for 4 keys: gross internal')
  })
})

describe('ARE-68: grid_measure what=frontage', () => {
  it('gives a shop in bands A, B, C and the rest, in m² and sq ft', async () => {
    const reply = await ok('grid_measure', { plan: 'shop.json', what: 'frontage', room: 'shop' })
    expect(reply.text).toContain('"Shop": frontage 6.00 m on "south" (the wall it opens through most); bands of 6.10 m: A 36.60 m² (394 sq ft), B 36.60 m² (394 sq ft), C 36.60 m² (394 sq ft), the rest 10.20 m² (110 sq ft); 120.00 m² in all.')
    expect(reply.text).toContain('no band is weighted')
    const answer = (reply.data as { answer: { bands: { name: string; area: number }[] } }).answer
    expect(answer.bands.map((band) => band.name)).toEqual(['A', 'B', 'C', 'the rest'])
  })

  it('takes the wall, the depth and the bands, and refuses a wall the room is not on', async () => {
    const reply = await ok('grid_measure', { plan: 'shop.json', what: 'frontage', room: 'shop', wall: 'north', depth: 5, bands: 2 })
    expect(reply.text).toContain('on "north" (the wall named); bands of 5.00 m: A 30.00 m²')
    const refused = await b.call('grid_measure', { plan: 'shop.json', what: 'frontage', room: 'shop', wall: 'nope' })
    expect(refused.isError).toBe(true)
    const stray = await b.call('grid_measure', { plan: 'shop.json', what: 'seats', bands: 2 })
    expect(stray.isError).toBe(true)
  })
})
