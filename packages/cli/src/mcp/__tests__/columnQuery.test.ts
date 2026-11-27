/**
 * CMD-53: grid_fields, grid_find and grid_count ask of the plan's columns, and of its items and
 * columns by the room they stand in: its id, its name or its use.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const OFFICE = [
  'walls outside 0.3 inside 0.1 height 3',
  'floor ground "Ground"',
  'room hall "Hall" corridor 12 x 2 at 0,0',
  'room meet "Board room" meeting 6 x 6 north of hall',
  'room open "Open office" office 6 x 6 east of meet',
  'room wc "Toilets" toilet 3 x 2 east of hall',
  'door d1 between hall and meet, centred, 0.9 wide',
  'door d2 between hall and open, centred, 0.9 wide',
  'door d3 between hall and wc, centred, 0.8 wide',
  'column m1 0.4 at 2,5',
  'column m2 round 0.5 at 4,5',
  'column o1 0.4 at 9,5 through first',
  'floor first "First" level 1 elevation 3',
  'room loft "Loft" storage 12 x 8 at 0,0',
]

let b: Bench
type Rec = Record<string, unknown>
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
const counts = (reply: Reply): Record<string, number> =>
  Object.fromEntries((reply.data as { groups: { value: unknown; count: number }[] }).groups.map((g) => [String(g.value), g.count]))

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'office.json', rooms: OFFICE.join('\n') })
  await ok('grid_add_item', { plan: 'office.json', name: 'basin', id: 'b1', x: 12.5, y: 0.5 })
  await ok('grid_add_item', { plan: 'office.json', name: 'basin', id: 'b2', x: 13.5, y: 0.5 })
  await ok('grid_add_item', { plan: 'office.json', name: 'basin', id: 'b3', x: 1, y: 1 })
})
afterAll(() => b.close())

describe('columns asked of as parts (CMD-53)', () => {
  it('lists the columns and their fields in grid_fields', async () => {
    const reply = await ok('grid_fields', { plan: 'office.json', kind: ['column'] })
    const data = reply.data as { kinds: { kind: string; count: number }[]; fields: { name: string }[] }
    expect(data.kinds).toEqual([{ kind: 'column', count: 3 }])
    expect(data.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['column shape', 'width', 'depth', 'height', 'room', 'rooms', 'room use', 'room name', 'floors']))
  })

  it('finds the columns standing in a room, by its id and by its use', async () => {
    const byId = await ok('grid_find', { plan: 'office.json', kind: ['column'], room: 'meet' })
    expect((byId.data as { ids: string[] }).ids).toEqual(['m1', 'm2'])
    expect(byId.text).toContain('Found 2 columns')
    const byUse = await ok('grid_find', { plan: 'office.json', kind: ['column'], where: ['room use = meeting'], fields: ['room name', 'column shape', 'width'] })
    expect((byUse.data as { rows: Rec[] }).rows).toEqual([
      { id: 'm1', 'room name': 'Board room', 'column shape': 'square', width: 0.4 },
      { id: 'm2', 'room name': 'Board room', 'column shape': 'round', width: 0.5 },
    ])
  })

  it('counts the columns by room and by shape, and tests their sizes', async () => {
    expect(counts(await ok('grid_count', { plan: 'office.json', kind: ['column'], by: 'room' }))).toEqual({ meet: 2, open: 1 })
    expect(counts(await ok('grid_count', { plan: 'office.json', kind: ['column'], by: 'column shape' }))).toEqual({ square: 2, round: 1 })
    const wide = await ok('grid_find', { plan: 'office.json', kind: ['column'], where: ['width >= 450 mm'] })
    expect((wide.data as { ids: string[] }).ids).toEqual(['m2'])
  })

  it('finds a column that rises through a floor on that floor too', async () => {
    const first = await ok('grid_find', { plan: 'office.json', kind: ['column'], floor: 'first', fields: ['floors', 'rooms'] })
    expect((first.data as { rows: Rec[] }).rows).toEqual([{ id: 'o1', floors: ['ground', 'first'], rooms: ['loft', 'open'] }])
    const ground = await ok('grid_count', { plan: 'office.json', kind: ['column'], floor: 'ground' })
    expect((ground.data as { total: { count: number } }).total.count).toBe(3)
  })

  it('leaves the columns out of a question about other kinds', async () => {
    const reply = await ok('grid_count', { plan: 'office.json', kind: ['room'], floor: 'ground' })
    expect((reply.data as { total: { count: number } }).total.count).toBe(4)
  })
})

describe('items asked of by the room they stand in (CMD-53)', () => {
  it('counts the basins by the use of their room, in one call', async () => {
    const reply = await ok('grid_count', { plan: 'office.json', kind: ['fixture'], where: ['item kind = basin'], by: 'room use' })
    expect(counts(reply)).toEqual({ toilet: 2, corridor: 1 })
    const inToilets = await ok('grid_count', { plan: 'office.json', kind: ['fixture'], where: ['item kind = basin', 'room name = toilets'] })
    expect((inToilets.data as { total: { count: number } }).total.count).toBe(2)
  })
})
