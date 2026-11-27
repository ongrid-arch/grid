/**
 * CMD-47: one building of a site of many read and changed on its own. Three houses of two floors
 * each, 30 m apart, each its own building with a stair between its floors and a gable roof.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const house = (id: string, x: number): string[] => [
  `building ${id} "House ${id.toUpperCase()}"`,
  `floor ${id}g "${id} ground" level 0 height 2.7`,
  `room liv "Living" living 8 x 6 at ${x},0`,
  'room st "Stair" stair 2.4 x 6 east of liv',
  'door d1 in liv south, centred, 0.9 wide',
  'door d2 between liv and st, centred, 0.9 wide',
  `floor ${id}1 "${id} first" level 1 height 2.7`,
  'raw floor {"roof": {"shape": "gable", "eaves": 2.7, "ridge": 5, "ridgeRuns": "east-west"}}',
  `room bed "Bed" bedroom 8 x 6 at ${x},0`,
  'room st "Stair" stair 2.4 x 6 east of bed',
  'door d3 between bed and st, centred, 0.9 wide',
  'end',
]
const stairs = (id: string): string[] => [`stair ${id}-s from ${id}g to ${id}1 in ${id === 'a' ? 'st' : `${id}g-st`}, 1 wide, straight, runs north`]
const SITE = ['walls outside 0.3 inside 0.1 height 2.7', ...house('a', 0), ...house('b', 30), ...house('c', 60), ...stairs('a'), ...stairs('b'), ...stairs('c')].join('\n')

let b: Bench
const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>
type Part = Record<string, unknown>
const list = (plan: Record<string, unknown>, key: string): Part[] => (plan[key] as Part[] | undefined) ?? []
/** The parts of a list on the floors given, as the file holds them. */
const on = (plan: Record<string, unknown>, key: string, floors: readonly string[]): Part[] => list(plan, key).filter((p) => floors.includes(p['floor'] as string))
/** A room without the number a change pins on it when the count would move it (WRT-23). */
const unnumbered = (parts: Part[]): Part[] => parts.map((part) => Object.fromEntries(Object.entries(part).filter(([key]) => key !== 'number')))
async function call(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
async function refused(tool: string, args: Record<string, unknown>): Promise<string> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}
const textOf = async (plan: string, building: string): Promise<string> => (await call('grid_describe', { plan, as: 'rooms', building })).text

beforeAll(async () => {
  b = bench({})
  await call('grid_write_rooms', { plan: 'site.json', rooms: SITE })
})
afterAll(() => b.close())

describe('one building read back as rooms text', () => {
  it('holds its own floors and parts only, and its building line', async () => {
    const text = await textOf('site.json', 'b')
    expect(text).toMatch(/^based on [0-9a-f]{16}$/m)
    expect(text).toContain('floor bg "b ground"')
    expect(text).toContain('floor b1 "b first"')
    expect(text).not.toMatch(/floor (ag|a1|cg|c1) /)
    expect(text).toMatch(/^stair b-s /m)
    expect(text).toMatch(/^building b "House B".* floors bg b1$/m)
  })

  it('refuses a building the plan does not have, and building without as=rooms', async () => {
    expect(await refused('grid_describe', { plan: 'site.json', as: 'rooms', building: 'z' })).toContain('The plan has no building z. Its buildings: a, b, c.')
    expect(await refused('grid_describe', { plan: 'site.json', building: 'b' })).toContain('building goes with as=rooms')
  })
})

describe('grid_write_building', () => {
  it('writes one building back changed, every other building\'s records as they were', async () => {
    const before = file('site.json')
    const text = await textOf('site.json', 'b')
    const changed = text.replace(/^(room bg-st .*)$/m, '$1\nroom bg-store "Store" storage 2 x 2 north of bg-liv\ndoor d9 between bg-liv and bg-store, centred, 0.8 wide')
    expect(changed).not.toBe(text)
    const reply = await call('grid_write_building', { plan: 'site.json', building: 'b', rooms: changed, out: 'one.json' })
    expect(reply.text).toContain('Wrote building b from rooms text, in place of its 2 floors, 4 rooms')
    expect(reply.text).toContain('Every other building is as it was.')
    const after = file('one.json')
    for (const key of ['walls', 'rooms', 'items', 'stairs']) {
      expect(unnumbered(on(after, key, ['ag', 'a1', 'cg', 'c1']))).toEqual(on(before, key, ['ag', 'a1', 'cg', 'c1']))
    }
    const otherOpenings = (plan: Record<string, unknown>): Part[] => list(plan, 'openings').filter((o) => /^(a|c)/.test(String(list(plan, 'walls').find((w) => w['id'] === o['wall'])?.['floor'])))
    expect(otherOpenings(after)).toEqual(otherOpenings(before))
    expect(list(after, 'rooms').map((r) => r['id'])).toContain('bg-store')
    expect(list(after, 'stairs').map((s) => s['id'])).toEqual(['a-s', 'b-s', 'c-s'])
    expect(after['buildings']).toEqual(before['buildings'])
    // Read again, it writes the same building.
    const again = await textOf('one.json', 'b')
    expect(again).toContain('room bg-store "Store" storage')
  })

  it('refuses text read from an older version of the building, and text with no based on line', async () => {
    const old = await textOf('site.json', 'a')
    await call('grid_set_building', { plan: 'site.json', id: 'a', pad: 0.4, out: 'padded.json' })
    await call('grid_add_storey', { plan: 'padded.json', building: 'a' })
    const stale = await refused('grid_write_building', { plan: 'padded.json', building: 'a', rooms: old })
    expect(stale).toContain('This rooms text was read from another version of building a')
    expect(stale).toContain('Nothing was written.')
    const fresh = old.replace(/^based on .*$/m, '')
    expect(await refused('grid_write_building', { plan: 'site.json', building: 'a', rooms: fresh })).toContain('Pass replace=true')
  })

  it('writes three townhouses in place of one house, an id another building holds given its floor in front', async () => {
    const townhouse = (n: number): string[] => [
      `building t${n} "Townhouse ${n}"`,
      `floor t${n}g "T${n} ground" level 0 height 2.7`,
      `room liv "Living" living 4 x 6 at ${30 + (n - 1) * 4.3},0`,
      'door d1 in liv south, centred, 0.9 wide',
      'end',
    ]
    const reply = await call('grid_write_building', { plan: 'site.json', building: 'b', replace: true, rooms: ['walls outside 0.3 inside 0.1 height 2.7', ...townhouse(1), ...townhouse(2), ...townhouse(3)].join('\n'), out: 'town.json' })
    expect(reply.text).toContain("The text's building lines write buildings t1, t2 and t3 in its place.")
    expect(reply.text).toContain('liv → t1g-liv')
    const after = file('town.json')
    expect((after['buildings'] as Part[]).map((x) => x['id'])).toEqual(['a', 't1', 't2', 't3', 'c'])
    expect(list(after, 'floors').map((f) => f['id'])).toEqual(['ag', 'a1', 't1g', 't2g', 't3g', 'cg', 'c1'])
    const ids = list(after, 'rooms').map((r) => r['id'])
    expect(ids).toEqual(expect.arrayContaining(['liv', 't1g-liv', 't2g-liv', 't3g-liv']))
    expect(new Set(ids).size).toBe(ids.length)
    expect(list(after, 'stairs').map((s) => s['id'])).toEqual(['a-s', 'c-s'])
    expect(reply.data).toMatchObject({ building: 'b', buildingsWritten: ['t1', 't2', 't3'] })
  })

  it('refuses a floor another building holds, and a text with no floor line', async () => {
    const text = (await textOf('site.json', 'b')).replace(/\bbg\b/g, 'ag')
    expect(await refused('grid_write_building', { plan: 'site.json', building: 'b', replace: true, rooms: text })).toContain('Floor ag is a floor of the plan outside building b')
    expect(await refused('grid_write_building', { plan: 'site.json', building: 'b', replace: true, rooms: 'room liv "Living" living 4 x 4 at 30,0' })).toContain('names each of its floors with a floor line')
  })
})

describe('grid_add_storey', () => {
  it('adds a storey on top like the top floor, the stair, the building record and the roof going up', async () => {
    const reply = await call('grid_add_storey', { plan: 'site.json', building: 'c', out: 'tall.json' })
    expect(reply.text).toContain('Added storey c2 ("House C level 2") on top of building c, at level 2 over c1, laid out like c1')
    expect(reply.text).toContain('1 stair flight now reach c2')
    const after = file('tall.json')
    expect((after['buildings'] as Part[]).find((x) => x['id'] === 'c')?.['floors']).toEqual(['cg', 'c1', 'c2'])
    const floors = list(after, 'floors')
    expect(floors.find((f) => f['id'] === 'c1')?.['roof']).toBeUndefined()
    expect(floors.find((f) => f['id'] === 'c2')).toMatchObject({ level: 2, height: 2.7, roof: { shape: 'gable' } })
    expect(floors.find((f) => f['id'] === 'c2')?.['elevation']).toBeUndefined()
    expect(on(after, 'rooms', ['c2']).map((r) => r['id']).sort()).toEqual(['c2-bed', 'c2-st'])
    expect(list(after, 'stairs').find((s) => s['to'] === 'c2')).toMatchObject({ id: 'c-s-c2', from: 'c1', to: 'c2' })
    // The other buildings are untouched, and the new storey stacks over the old top.
    const before = file('site.json')
    expect(on(after, 'walls', ['ag', 'a1', 'bg', 'b1'])).toEqual(on(before, 'walls', ['ag', 'a1', 'bg', 'b1']))
    const areas = await call('grid_areas', { plan: 'tall.json' })
    expect(areas.text).toMatch(/House C.*3 storeys/)
  })

  it('takes a floor to copy and a new id, and refuses a floor of another building', async () => {
    const reply = await call('grid_add_storey', { plan: 'site.json', building: 'a', like: 'ag', id: 'a-top', name: 'Roof studio', out: 'studio.json' })
    expect(reply.text).toContain('Added storey a-top ("Roof studio")')
    expect(on(file('studio.json'), 'rooms', ['a-top']).map((r) => r['id']).sort()).toEqual(['a-top-liv', 'a-top-st'])
    expect(await refused('grid_add_storey', { plan: 'site.json', building: 'a', like: 'bg' })).toContain("Floor bg is not one of building a's")
  })
})

describe('grid_remove_building and grid_place_building', () => {
  it('takes a building out with its floors and everything on them', async () => {
    const reply = await call('grid_remove_building', { plan: 'site.json', id: 'b', out: 'gone.json' })
    expect(reply.text).toContain('Took building b out of the plan with its 2 floors (bg and b1)')
    const after = file('gone.json')
    expect((after['buildings'] as Part[]).map((x) => x['id'])).toEqual(['a', 'c'])
    expect(on(after, 'walls', ['bg', 'b1'])).toEqual([])
    expect(on(after, 'rooms', ['bg', 'b1'])).toEqual([])
    expect(list(after, 'floors').map((f) => f['id'])).toEqual(['ag', 'a1', 'cg', 'c1'])
    expect(list(after, 'stairs').map((s) => s['id'])).toEqual(['a-s', 'c-s'])
  })

  it('places a copy of a building on another lot, with ids of its own, moved', async () => {
    const reply = await call('grid_place_building', { plan: 'site.json', from: 'a', id: 'd', name: 'House D', move: '90,0', out: 'four.json' })
    expect(reply.text).toContain('Placed building d, a copy of a ("House A") moved 90 m east and 0 m north: 2 floors (dg and d1)')
    const before = file('site.json')
    const after = file('four.json')
    expect((after['buildings'] as Part[]).at(-1)).toEqual({ id: 'd', name: 'House D', floors: ['dg', 'd1'] })
    const walls = on(after, 'walls', ['dg'])
    const source = on(before, 'walls', ['ag'])
    expect(walls).toHaveLength(source.length)
    expect(walls.map((w) => (w['start'] as number[])[0])).toEqual(source.map((w) => (w['start'] as number[])[0] + 90))
    expect(on(after, 'rooms', ['dg']).map((r) => r['id']).sort()).toEqual(['dg-liv', 'dg-st'])
    expect(list(after, 'stairs').find((s) => s['id'] === 'd-a-s')).toMatchObject({ from: 'dg', to: 'd1' })
    const ids = [...list(after, 'walls'), ...list(after, 'rooms'), ...list(after, 'openings')].map((p) => p['id'])
    expect(new Set(ids).size).toBe(ids.length)
    const check = await call('grid_check', { plan: 'four.json' })
    const was = await call('grid_check', { plan: 'site.json' })
    expect((check.data as { count: number }).count).toBe((was.data as { count: number }).count)
  })

  it('places a copy at a point, and refuses one that would stand over another building', async () => {
    const reply = await call('grid_place_building', { plan: 'site.json', from: 'a', id: 'e', at: '-40,0', out: 'west.json' })
    expect(reply.data).toMatchObject({ building: 'e', moved: [-39.85, 0.15], overlaps: [] })
    expect(await refused('grid_place_building', { plan: 'site.json', from: 'a', id: 'e', at: '31,1' })).toContain('would break the drawing')
    expect(await refused('grid_place_building', { plan: 'site.json', from: 'a', id: 'e', at: '1,1', move: '1,1' })).toContain('one of the two')
    expect(await refused('grid_place_building', { plan: 'site.json', from: 'a', id: 'b', move: '1,1' })).toContain('Building b is in the plan already')
  })
})
