/**
 * LVL-23: buildings set through `grid_set_building`. Two rows of two floors, 30 m apart; each row
 * stands on its own pad, and its floors stack from it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const row = (id: string, x: number): string[] => [
  `floor ${id}g "${id} ground" level 0`,
  `room liv "Living" living 8 x 6 at ${x},0`,
  'room st "Stair" stair 2 x 6 east of liv',
  'door d1 in liv south, centred, 0.9 wide',
  'door d2 between liv and st, centred, 0.9 wide',
  `floor ${id}1 "${id} first" level 1`,
  `room bed "Bed" bedroom 8 x 6 at ${x},0`,
  'room st "Stair" stair 2 x 6 east of bed',
  'door d3 between bed and st, centred, 0.9 wide',
]

let b: Bench
const buildings = (name: string): unknown => (JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>)['buildings']
async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_set_building', args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
async function refused(args: Record<string, unknown>): Promise<string> {
  const reply = await b.call('grid_set_building', args)
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}

beforeAll(async () => {
  b = bench({})
  const reply = await b.call('grid_write_rooms', { plan: 'site.json', rooms: ['walls outside 0.3 inside 0.1 height 2.7', ...row('a', 0), ...row('b', 30)].join('\n') })
  expect(reply.isError, reply.text).toBe(false)
})
afterAll(() => b.close())

describe('grid_set_building', () => {
  it('adds a building on its pad, a length with its unit, and says where it stands', async () => {
    const reply = await ok({ plan: 'site.json', id: 'row-a', name: 'Row A', pad: '2.5ft', floors: ['ag', 'a1'], out: 'a.json' })
    expect(buildings('a.json')).toEqual([{ id: 'row-a', name: 'Row A', floors: ['ag', 'a1'], pad: expect.closeTo(0.762, 9) }])
    expect(buildings('site.json')).toBeUndefined()
    expect(reply.text).toContain('Added building row-a: "Row A", floors ag, a1, on a pad at 0.762 m.')
    expect(reply.text).toMatch(/Its ground floor: ag; 2 storeys, [0-9.]+ m high from its pad\./)
    expect(reply.data).toMatchObject({ building: 'row-a', buildings: ['row-a'] })
  })

  it('changes a building\'s pad and floors, and takes one out', async () => {
    await ok({ plan: 'site.json', id: 'row-a', floors: ['ag', 'a1'], out: 'b.json' })
    await ok({ plan: 'b.json', id: 'row-b', floors: ['bg'] })
    const changed = await ok({ plan: 'b.json', id: 'row-b', pad: 1, floors: ['bg', 'b1'] })
    expect(changed.text).toContain('Changed building row-b: a pad at 1 m; its floors, now bg, b1.')
    expect(buildings('b.json')).toEqual([
      { id: 'row-a', floors: ['ag', 'a1'] },
      { id: 'row-b', floors: ['bg', 'b1'], pad: 1 },
    ])
    await ok({ plan: 'b.json', id: 'row-a', remove: true })
    expect(buildings('b.json')).toEqual([{ id: 'row-b', floors: ['bg', 'b1'], pad: 1 }])
    await ok({ plan: 'b.json', id: 'row-b', remove: true })
    expect(buildings('b.json')).toBeUndefined()
  })

  it('refuses a floor the plan does not have, one in another building, and a change of nothing, writing nothing', async () => {
    await ok({ plan: 'site.json', id: 'row-a', floors: ['ag', 'a1'], out: 'c.json' })
    expect(await refused({ plan: 'c.json', id: 'row-b', floors: ['bg', 'zz'] })).toMatch(/The plan has no floor zz\. Its floors: .*Nothing was written\./)
    expect(await refused({ plan: 'c.json', id: 'row-b', floors: ['bg', 'a1'] })).toMatch(/Floor a1 is in building row-a already, and a floor is in one building at most/)
    expect(await refused({ plan: 'c.json', id: 'row-a' })).toMatch(/Give what changes: name, pad or floors; or remove\./)
    expect(await refused({ plan: 'c.json', id: 'row-z', pad: 1 })).toMatch(/to add it, give its floors/)
    expect(await refused({ plan: 'c.json', id: 'row-z', remove: true })).toMatch(/The plan has no building with the id row-z\. Its buildings: row-a\./)
    expect(buildings('c.json')).toEqual([{ id: 'row-a', floors: ['ag', 'a1'] }])
  })
})
