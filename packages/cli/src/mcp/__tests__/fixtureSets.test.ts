/**
 * CNT-48: a room's usual fixtures in one call. `grid_add_item` given a typical room's name and a
 * room, with no side and no point, sets out each of its items against a side of that room where
 * Grid's checks find it clear, a smaller one of the same thing where it fits nowhere, and says
 * what it could not place. And the 3D and eye answers say the fixtures stand in the picture.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const FLAT = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room bath "Bathroom" bathroom 2.4 x 2 at 0,0',
  'room shower "Shower room" bathroom 1.4 x 1.4 east of bath',
  'room kitchen "Kitchen" kitchen 3.6 x 3 east of shower',
  'room loo "WC" toilet 0.6 x 0.6 north of bath',
  'door d1 between bath and shower, centred, 0.8 wide',
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
  await ok('grid_write_rooms', { plan: 'flat.json', rooms: FLAT.join('\n') })
})
afterAll(() => b.close())

describe('grid_add_item with a typical room', () => {
  it('sets out a bathroom\'s bath, WC and basin, each where it fits', async () => {
    const reply = await ok('grid_add_item', { plan: 'flat.json', name: 'bathroom', room: 'bath', out: 'bath.json' })
    expect(reply.data).toMatchObject({ fits: true, notPlaced: [] })
    // The room's own id is bath, so the bath takes the next free one.
    expect((reply.data as Rec)['placed']).toEqual(['bath-2', 'wc', 'basin'])
    expect(reply.text).toContain('Set out 3 of the 3 items of typical room "bathroom" in room "Bathroom"')
    expect(itemsOf('bath.json').map((i) => i['library'])).toEqual(['bath', 'wc', 'basin'])
    // Grid's checks find nothing in the way of any of them.
    const check = await ok('grid_check', { plan: 'bath.json' })
    expect(check.text).not.toMatch(/item\/(into-wall|overlap|clearance-blocked|blocks-doorway)/)
  })

  it('puts a shower in place of a bath in a room too narrow for one', async () => {
    const reply = await ok('grid_add_item', { plan: 'flat.json', name: 'bathroom', room: 'shower', out: 'shower.json' })
    const placed = itemsOf('shower.json').map((i) => i['library'])
    expect(placed[0]).toMatch(/^shower-/)
    expect(reply.text).toMatch(/as "shower-\d+": the typical room's own size fits nowhere in this room/)
  })

  it('sets a kitchen run against a side of the kitchen', async () => {
    const reply = await ok('grid_add_item', { plan: 'flat.json', name: 'kitchen', room: 'kitchen', out: 'kitchen.json' })
    expect(reply.data).toMatchObject({ fits: true, placed: ['kitchen-run-3000'] })
    expect(itemsOf('kitchen.json')[0]).toMatchObject({ library: 'kitchen-run-3000' })
  })

  it('does not add a fixture of a kind the room already holds', async () => {
    await ok('grid_add_item', { plan: 'flat.json', name: 'wc', id: 'own-wc', room: 'bath', against: 'east', out: 'own.json' })
    const reply = await ok('grid_add_item', { plan: 'own.json', name: 'bathroom', room: 'bath', out: 'own-set.json' })
    expect((reply.data as Rec)['placed']).not.toContain('wc')
    expect(reply.text).toContain('Not added again: the room already holds "wc"')
    expect(itemsOf('own-set.json').filter((i) => i['library'] === 'wc')).toHaveLength(1)
  })

  it('says what fits nowhere, and refuses when nothing fits', async () => {
    const text = await refused('grid_add_item', { plan: 'flat.json', name: 'bathroom', room: 'loo' })
    expect(text).toContain('Nothing of typical room "bathroom" fits in room "WC"')
  })

  it('takes no size or place of its own with a typical room', async () => {
    expect(await refused('grid_add_item', { plan: 'flat.json', name: 'kitchen', room: 'kitchen', width: 2, depth: 0.6 })).toContain('is a typical room of several items')
  })
})

describe('the 3D and eye answers', () => {
  it('say the fixtures stand in the picture', async () => {
    const eye = await ok('grid_view', { plan: 'kitchen.json', kind: 'eye', room: 'kitchen', toward: 'north' })
    expect(eye.text).toContain("The plan's fixtures and furniture stand in it as plain blocks")
    expect(eye.text).not.toMatch(/no [^.]*furniture/)
  }, 60_000)
})
