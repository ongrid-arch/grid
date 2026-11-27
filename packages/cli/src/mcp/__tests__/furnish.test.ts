/**
 * CNT-61: fewer calls to furnish a plan. `grid_place_item` takes a list of entries as one change,
 * and `grid_furnish_rooms` furnishes every room of a house with its use's usual set in one call.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room living "Living room" living 4.5 x 4 at 0,0',
  'room dining "Dining room" dining 3.4 x 4 east of living',
  'room kitchen "Kitchen" kitchen 3.2 x 4 east of dining',
  'room bed1 "Bedroom 1" bedroom 4.5 x 3.6 north of living',
  'room bed2 "Bedroom 2" bedroom 3.4 x 3.6 north of dining',
  'room bath "Bathroom" bathroom 3.2 x 2.2 north of kitchen',
  'room bed3 "Bedroom 3" bedroom 3.2 x 1.4 north of bath',
  'room hall "Hall" corridor 1.2 x 1.2 north of bed1',
  'door d1 between living and dining, centred, 0.8 wide',
  'door d2 between dining and kitchen, centred, 0.8 wide',
  'door d3 between living and bed1, centred, 0.8 wide',
]

let b: Bench
type Rec = Record<string, unknown>
const itemsOf = (name: string): Rec[] => ((JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Rec)['items'] as Rec[] | undefined) ?? []
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
async function refused(tool: string, args: Record<string, unknown>): Promise<string> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'house.json', rooms: HOUSE.join('\n') })
})
afterAll(() => b.close())

describe('grid_place_item with items', () => {
  it('places a list of entries in order as one change, each id made unique along the list', async () => {
    const reply = await ok('grid_place_item', {
      plan: 'house.json',
      items: [
        { name: 'double-bed', x: 2.25, y: 5.3 },
        { name: 'bedside-table', x: 1.2, y: 4.5 },
        { name: 'bedside-table', x: 3.3, y: 4.5 },
        { name: 'wardrobe', id: 'robe-1', x: 3.5, y: 7.4, turn: 180 },
      ],
      out: 'list.json',
    })
    expect((reply.data as Rec)['placed']).toEqual(['double-bed', 'bedside-table', 'bedside-table-2', 'robe-1'])
    expect(reply.text).toContain('Placed the 4 entries of items, in order, as one change: 4 items.')
    expect(reply.text).toContain('in room "Bedroom 1"')
    expect(itemsOf('list.json').map((item) => item['id'])).toEqual(['double-bed', 'bedside-table', 'bedside-table-2', 'robe-1'])
  })

  it('refuses the whole list for one bad entry, naming it, and writes nothing', async () => {
    const text = await refused('grid_place_item', { plan: 'house.json', items: [{ name: 'wc', x: 1, y: 1 }, { name: 'doble-bed', x: 2, y: 2 }], out: 'bad.json' })
    expect(text).toContain('Entry 2 of items: Can\'t place "doble-bed"')
    expect(text).toContain('Did you mean "double-bed"?')
    expect(() => readFileSync(join(b.folder, 'bad.json'))).toThrow()
    expect(await refused('grid_place_item', { plan: 'house.json', items: [{ name: 'wc', x: 1 }] })).toContain('entry 1 of items needs y')
    expect(await refused('grid_place_item', { plan: 'house.json', items: [{ name: 'wc', x: 1, y: 1, colour: 'red' }] })).toContain('not "colour"')
    expect(await refused('grid_place_item', { plan: 'house.json', items: [{ name: 'wc', id: 'w', x: 1, y: 1 }, { name: 'wc', id: 'w', x: 2, y: 1 }] })).toContain('an entry before it in items has the id "w"')
  })

  it('takes items or name, x and y, not both', async () => {
    expect(await refused('grid_place_item', { plan: 'house.json', name: 'wc', items: [{ name: 'wc', x: 1, y: 1 }] })).toContain('Give items, or name, x and y for one entry, not both')
    expect(await refused('grid_place_item', { plan: 'house.json', name: 'wc' })).toContain('Pass x, y')
  })

  it('still places one entry as before', async () => {
    const reply = await ok('grid_place_item', { plan: 'house.json', name: 'wc', x: 10, y: 4.9, out: 'one.json' })
    expect((reply.data as Rec)['placed']).toEqual(['wc'])
    expect(reply.text).not.toContain('entries of items')
  })
})

describe('grid_furnish_rooms', () => {
  let reply: Reply
  beforeAll(async () => {
    reply = await ok('grid_furnish_rooms', { plan: 'house.json', out: 'furnished.json' })
  }, 120_000)

  it('furnishes every bedroom, the bathroom, the kitchen, the living and the dining room in one call', () => {
    const rooms = (reply.data as Rec)['rooms'] as Rec[]
    expect(rooms.map((room) => room['room'])).toEqual(['living', 'dining', 'kitchen', 'bed1', 'bed2', 'bath', 'bed3'])
    const setOf = Object.fromEntries(rooms.map((room) => [room['room'], room['set']]))
    expect(setOf).toMatchObject({ living: 'living-room', dining: 'dining-room', kitchen: 'kitchen', bed1: 'double-bedroom', bed2: 'double-bedroom', bath: 'bathroom' })
    expect(reply.text).toContain('Furnished room "Bedroom 1" with typical room "double-bedroom" as it is drawn')
    // The hall has no usual set and is left alone.
    expect(rooms.some((room) => room['room'] === 'hall')).toBe(false)
    const libraries = itemsOf('furnished.json').map((item) => item['library'])
    for (const name of ['sofa-3', 'dining-table-6', 'kitchen-run-3000', 'double-bed', 'bath', 'wc', 'basin']) expect(libraries, name).toContain(name)
  })

  it('leaves a room too small for any set unfurnished and says why', () => {
    const bed3 = ((reply.data as Rec)['rooms'] as Rec[]).find((room) => room['room'] === 'bed3')!
    expect(bed3['how']).toBe('not-furnished')
    expect(reply.text).toMatch(/Room "Bedroom 3" not furnished: "double-bedroom" and "single-bedroom" fit nowhere in it as drawn \("single-bedroom" is 2\.40 × 3\.00 m, larger than the room\)/)
    expect((reply.data as Rec)['notFurnished']).toEqual(['bed3'])
  })

  it('sets out nothing Grid\'s fit checks find in the way', async () => {
    const check = await ok('grid_check', { plan: 'furnished.json', full: true })
    expect(check.text).not.toMatch(/item\/(into-wall|overlap|clearance-blocked|blocks-doorway|outside-rooms|leaves-room)|opening\/door-hits-item/)
  })

  it('furnishes nothing more on a second call, and refuses', async () => {
    const text = await refused('grid_furnish_rooms', { plan: 'furnished.json' })
    expect(text).toContain('Nothing was furnished.')
    expect(text).toContain('Not furnished, as they hold items already: "Living room", "Dining room", "Kitchen", "Bedroom 1", "Bedroom 2" and "Bathroom".')
  })

  it('refuses a plan with no room of a use that has a usual set', async () => {
    await ok('grid_write_rooms', { plan: 'store.json', rooms: ['walls outside 0.3 inside 0.1 height 2.6', 'room store "Store" storage 3 x 3 at 0,0'].join('\n') })
    expect(await refused('grid_furnish_rooms', { plan: 'store.json' })).toContain('No room to furnish')
  })

  it('takes another set for a room, and refuses one the library does not hold', async () => {
    const own = await ok('grid_furnish_rooms', { plan: 'house.json', rooms: ['bed2'], sets: { bed2: 'single-bedroom' }, out: 'single.json' })
    expect(((own.data as Rec)['rooms'] as Rec[])[0]).toMatchObject({ room: 'bed2', set: 'single-bedroom', how: 'as-drawn' })
    expect(itemsOf('single.json').map((item) => item['library'])).toContain('single-bed')
    expect(await refused('grid_furnish_rooms', { plan: 'house.json', sets: { bed2: 'single-bedrom' } })).toContain('Did you mean "single-bedroom"?')
  })

  it('sets a bathroom too narrow for its set as drawn out item by item against its sides', async () => {
    await ok('grid_write_rooms', { plan: 'narrow.json', rooms: ['walls outside 0.3 inside 0.1 height 2.6', 'room bath "Bathroom" bathroom 1.7 x 2.6 at 0,0'].join('\n') })
    const narrow = await ok('grid_furnish_rooms', { plan: 'narrow.json', out: 'narrow-furnished.json' })
    expect(((narrow.data as Rec)['rooms'] as Rec[])[0]).toMatchObject({ room: 'bath', set: 'bathroom', how: 'item-by-item' })
    expect(narrow.text).toContain('Room "Bathroom": "bathroom" fits nowhere in it as drawn')
    expect(itemsOf('narrow-furnished.json').length).toBeGreaterThan(0)
  })

  it('says a room of a use with no usual set has none', async () => {
    const text = await refused('grid_furnish_rooms', { plan: 'house.json', rooms: ['hall'] })
    expect(text).toContain('Grid has no usual set for its use, corridor')
  })
})
