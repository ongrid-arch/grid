/**
 * LVL-24: floor-to-floor heights set through `grid_set_levels`, and every floor's level said in its
 * answer and in a write's.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

/** A tower of `count` storeys, each one room 12 x 10, the floors' heights left out. */
const tower = (count: number, first: string[] = []): string =>
  ['walls outside 0.3 inside 0.1', ...first, ...Array.from({ length: count }, (_, i) => [`floor l${i} "Level ${i}" level ${i}`, `room r${i} "Office ${i}" office 12 x 10 at 0,0`]).flat()].join('\n')

let b: Bench
const floors = (file: string): Record<string, unknown>[] => (JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as { floors: Record<string, unknown>[] }).floors
async function call(args: Record<string, unknown>, error = false): Promise<Reply> {
  const reply = await b.call('grid_set_levels', args)
  expect(reply.isError, reply.text).toBe(error)
  return reply
}

beforeAll(async () => {
  b = bench({})
  for (const [plan, rooms] of [['tower.json', tower(40)], ['block.json', tower(3)]] as const) {
    const reply = await b.call('grid_write_rooms', { plan, rooms })
    expect(reply.isError, reply.text).toBe(false)
  }
})
afterAll(() => b.close())

describe('grid_set_levels', () => {
  it('stacks a forty-storey tower at 3.9 m floor to floor to 156 m, and lists the levels as one run', async () => {
    const reply = await call({ plan: 'tower.json', floorToFloor: 3.9, out: 'tower-set.json' })
    const written = floors('tower-set.json')
    expect(written[0]).toMatchObject({ id: 'l0', height: 3.65 })
    expect(written[0]!['elevation']).toBeUndefined()
    expect(written[39]).toMatchObject({ id: 'l39', elevation: 152.1, height: 3.65 })
    expect(reply.text).toContain('Floor-to-floor 3.90 m set on "l0", "l1"')
    expect(reply.text).toContain('"l0" keeps its level, 0.00 m')
    expect(reply.text).toContain('Height set on "l0", "l1"')
    expect(reply.text).toContain('"l0" to "l38", 39 floors, at 0.00 m to 148.20 m, each floor-to-floor 3.90 m, clear height 3.65 m (stated)')
    expect(reply.text).toContain('"l39" at 152.10 m, floor-to-floor 3.90 m, clear height 3.65 m (stated)')
    expect(reply.text).toContain('Height 156.00 m, from the ground floor\'s floor level (0.00 m) to the top of the highest roof, over "l39".')
    const levels = (reply.data as { levels: { floor: string; level: number; floorToFloor: number }[] }).levels
    expect(levels).toHaveLength(40)
    expect(levels[39]).toMatchObject({ floor: 'l39', level: 152.1, floorToFloor: 3.9 })
  })

  it('sets one floor\'s and moves the floors over it, the rooms\' ceiling kept apart', async () => {
    const set = await call({ plan: 'block.json', floorToFloor: 3.5, ceiling: 2.7, out: 'block-a.json' })
    expect(set.text).toContain('Rooms\' height 2.70 m, floor to ceiling, set on the 3 rooms of "l0", "l1" and "l2".')
    const reply = await call({ plan: 'block-a.json', floorToFloor: '15ft', floors: ['l0'], out: 'block-b.json' })
    expect(floors('block-b.json').map((f) => [f['id'], f['elevation'], f['height']])).toEqual([['l0', undefined, 4.322], ['l1', 4.572, 3.25], ['l2', 8.072, 3.25]])
    expect(reply.text).toContain('The floor-to-floor wins over the height "l0" stated (3.25 m)')
    expect(reply.text).toContain('Moved with them, keeping their own floor-to-floor: "l1" and "l2".')
  })

  it('refuses a floor the plan does not have, a ceiling that does not fit, and nothing to change, writing nothing', async () => {
    expect((await call({ plan: 'block.json', floorToFloor: 3, floors: ['l9'] }, true)).text).toMatch(/The plan has no floor "l9"\. Its floors: "l0", "l1" and "l2"\. Nothing was written\./)
    expect((await call({ plan: 'block.json', floorToFloor: 3, ceiling: 2.9 }, true)).text).toContain('the rooms can be at most 2.75 m high')
    expect((await call({ plan: 'block.json', floorToFloor: 3, building: 'b' }, true)).text).toContain('The plan has no building "b". It names none')
    expect((await call({ plan: 'block-a.json', floorToFloor: 3.5, ceiling: 2.7 }, true)).text).toContain('The floors stand so already: floor-to-floor 3.50 m, rooms 2.70 m high.')
    expect(floors('block.json').every((f) => f['elevation'] === undefined)).toBe(true)
  })

  it('refuses a later change that writes a clear height as the floor-to-floor, saying why', async () => {
    await call({ plan: 'block.json', floorToFloor: 3, out: 'block-c.json' })
    const reply = await b.call('grid_set', { plan: 'block-c.json', parts: ['l0'], kind: 'floor', set: { height: 3 } })
    expect(reply.isError, reply.text).toBe(true)
    expect(reply.text).toContain('states a clear height of 3.00 m, and the slab of "Level 1" over it is 0.25 m: together they reach 3.25 m')
  })
})

describe('the levels in a write\'s answer', () => {
  it('lists each floor\'s level and floor-to-floor for a plan of more than one level', async () => {
    const reply = await b.call('grid_write_rooms', { plan: 'written.json', rooms: tower(2, []).replace('level 1', 'level 1 elevation 3.6') })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('Levels, in metres from the plan\'s datum (0)')
    expect(reply.text).toContain('"l0" at 0.00 m, floor-to-floor 3.60 m, clear height 2.70 m')
  })

  it('says nothing of levels for a plan of one', async () => {
    const reply = await b.call('grid_write_rooms', { plan: 'one.json', rooms: tower(1) })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toContain('Levels, in metres')
  })
})
