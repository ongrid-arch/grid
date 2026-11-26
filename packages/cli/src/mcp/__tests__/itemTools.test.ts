/**
 * CNT-45: fixtures and furniture written, moved and taken out through the tools. A flat of two
 * rooms: a bathroom whose inside faces run from 0,0 to 2.4,2 and a bedroom of 3.5 × 4 m east of
 * it. The items the tools write are the plan's own, placed as a rooms text `item` line places them.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const FLAT = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room bath "Bathroom" bathroom 2.4 x 2 at 0,0',
  'room bed "Bedroom" bedroom 3.5 x 4 east of bath',
  'door d1 between bath and bed, centred, 0.8 wide',
]

let b: Bench
type Rec = Record<string, unknown>
const items = (name: string): Rec[] | undefined => (JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Rec)['items'] as Rec[] | undefined
const itemIn = (name: string, id: string): Rec => items(name)!.find((i) => i['id'] === id)!
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
  await ok('grid_write_rooms', { plan: 'flat.json', rooms: FLAT.join('\n') })
  await ok('grid_add_item', { plan: 'flat.json', name: 'bath', id: 'tub', room: 'bath', against: 'north', end: 'west' })
})
afterAll(() => b.close())

describe('grid_add_item', () => {
  it('stands a bath against a side of a room, its turn worked out, and says it fits', async () => {
    expect(itemIn('flat.json', 'tub')).toEqual({ id: 'tub', library: 'bath', at: [0.85, 1.65], turn: 180 })
    const reply = await ok('grid_add_item', { plan: 'flat.json', name: 'wardrobe', id: 'robe', room: 'bed', against: 'east', full_width: true, label: 'Built-in wardrobe', out: 'robe.json' })
    expect(itemIn('robe.json', 'robe')).toMatchObject({ library: 'wardrobe', turn: 90, size: [4, 0.6], label: 'Built-in wardrobe' })
    expect(reply.text).toContain('against the east side of room "bed", the full width of it, facing into the room,')
    expect(reply.text).toContain('It fits:')
    expect(reply.data).toMatchObject({ item: 'robe', fits: true })
  })

  it('places a kind at a point, and refuses what it cannot place with nothing written', async () => {
    await ok('grid_add_item', { plan: 'flat.json', name: 'sofa', width: 2, depth: 0.9, x: 4.4, y: 2, turn: 90, out: 'sofa.json' })
    expect(itemIn('sofa.json', 'sofa')).toMatchObject({ kind: 'sofa', at: [4.4, 2], turn: 90, size: [2, 0.9], height: 0.85 })
    expect(await refused('grid_add_item', { plan: 'flat.json', name: 'bath', width: 3, depth: 0.7, room: 'bath', against: 'north' })).toMatch(/does not fit along the north side of room bath.*Nothing was written/)
    expect(await refused('grid_add_item', { plan: 'flat.json', name: 'bath', id: 'tub', room: 'bath', against: 'south' })).toMatch(/The id "tub" is taken by bath "tub"/)
    expect(items('flat.json')!.map((i) => i['id'])).toEqual(['tub'])
  })
})

describe('grid_move_item and grid_remove_item', () => {
  it('moves an item against another side, by a distance, and turns it', async () => {
    const reply = await ok('grid_move_item', { plan: 'flat.json', id: 'tub', against: 'south', end: 'east', out: 'moved.json' })
    expect(itemIn('moved.json', 'tub')).toEqual({ id: 'tub', library: 'bath', at: [1.55, 0.35], turn: 0 })
    expect(reply.text).toMatch(/Moved bath "tub" against the south side of room "bath", in its east corner/)
    await ok('grid_move_item', { plan: 'flat.json', id: 'tub', dx: 0, dy: -0.1, out: 'nudged.json' })
    expect(itemIn('nudged.json', 'tub')['at']).toEqual([0.85, 1.55])
    expect(await refused('grid_move_item', { plan: 'flat.json', id: 'tubb', turn: 90 })).toMatch(/no item "tubb": did you mean "tub"\?/)
  })

  it('takes items out by id or every item in a room', async () => {
    const reply = await ok('grid_remove_item', { plan: 'flat.json', ids: ['tub'], out: 'gone.json' })
    expect(items('gone.json')).toEqual([])
    expect(reply.text).toContain('Took out bath "tub".')
    await ok('grid_remove_item', { plan: 'flat.json', room: 'bath', out: 'cleared.json' })
    expect(items('cleared.json')).toEqual([])
    expect(await refused('grid_remove_item', { plan: 'flat.json', room: 'bed' })).toMatch(/has no fixtures or furniture/)
  })
})

describe('items follow their walls', () => {
  it('moves a bath with the wall it stands against when the room is made deeper, and counts the item notes', async () => {
    const reply = await ok('grid_move_room_side', { plan: 'flat.json', room: 'bath', side: 'north', by: 0.5, out: 'deeper.json' })
    const tub = itemIn('deeper.json', 'tub')
    expect((tub['at'] as number[])[0]).toBeCloseTo(0.85, 6)
    expect((tub['at'] as number[])[1]).toBeCloseTo(2.15, 6)
    expect(reply.text).toMatch(/Bath "tub" stands against a wall that moved, and moved with it\./)
    expect((reply.data as Rec)['drawingProblems']).toMatchObject({ items: { before: 0, after: 0 } })
  })

  it('writes item lines through grid_write_rooms, and reads them back', async () => {
    await ok('grid_write_rooms', { plan: 'lines.json', rooms: [...FLAT, 'item robe wardrobe in bed against east, full width'].join('\n') })
    expect(itemIn('lines.json', 'robe')).toMatchObject({ library: 'wardrobe', turn: 90, size: [4, 0.6] })
    const back = await ok('grid_describe', { plan: 'lines.json', as: 'rooms' })
    expect(back.text).toContain('item robe wardrobe in bed against east, full width 0.6 deep')
  })
})

describe('the items wherever an agent looks', () => {
  it('finds and counts fixtures and furniture as kinds of part, with their rooms', async () => {
    await ok('grid_add_item', { plan: 'flat.json', name: 'double-bed', id: 'bed1', room: 'bed', against: 'north', out: 'furnished.json' })
    const found = await ok('grid_find', { plan: 'furnished.json', kind: ['fixture'], fields: ['item kind', 'room'] })
    expect(found.data).toMatchObject({ count: 1, ids: ['tub'] })
    expect(found.text).toContain('fixture "tub"')
    const fields = await ok('grid_fields', { plan: 'furnished.json', kind: ['furniture'] })
    expect((fields.data as Rec)['kinds']).toEqual([{ kind: 'furniture', count: 1 }])
    const counted = await ok('grid_count', { plan: 'furnished.json', kind: ['fixture', 'furniture'], by: 'room' })
    expect(((counted.data as Rec)['groups'] as Rec[]).map((g) => [g['value'], g['count']])).toEqual([['bath', 1], ['bed', 1]])
  })

  it('lists the items grid_view draws, with their boxes', async () => {
    const view = await ok('grid_view', { plan: 'furnished.json', kind: 'plan' })
    expect(view.text).toMatch(/Fixtures and furniture drawn: 2 \(bath "tub", bed "bed1"\)/)
    expect(((view.data as Rec)['boxes'] as Rec[]).filter((box) => box['kind'] === 'fixture' || box['kind'] === 'furniture').map((box) => box['id'])).toEqual(['tub', 'bed1'])
  })

  it('schedules the fixtures and furniture with of=fixtures', async () => {
    const schedule = await ok('grid_schedule', { plan: 'furnished.json', of: 'fixtures' })
    expect(((schedule.data as Rec)['fixtures'] as Rec[]).map((row) => [row['id'], row['room']])).toEqual([['tub', 'bath'], ['bed1', 'bed']])
    expect(schedule.text).not.toContain('In all:')
  })
})
