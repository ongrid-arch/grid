/**
 * CNT-60: party walls and the neighbours round the plan, written through the tools. A terrace
 * house of a hall and a kitchen, 8 m deep; its west side is shared with No. 12 next door.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'room hall "Hall" corridor 2 x 8 at 0.3,0.3',
  'room kitchen "Kitchen" kitchen 4 x 8 east of hall',
  'door front in hall south, centred, 0.9 wide, opens in',
  'door d1 between hall and kitchen, centred, 0.8 wide',
]

let b: Bench
type Raw = { walls: { id: string; kind?: string; beyond?: string }[]; context?: Record<string, unknown>[]; floors?: unknown[] }
const file = (name: string): Raw => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Raw
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

describe('grid_set_party_wall', () => {
  it('makes the wall on a room\'s side a party wall with a neighbour beyond it', async () => {
    const reply = await ok('grid_set_party_wall', { plan: 'house.json', room: 'hall', side: 'west', out: 'party.json' })
    const party = file('party.json').walls.filter((w) => w.kind === 'separating')
    expect(party).toHaveLength(1)
    expect(party[0]!.beyond).toBe('neighbour')
    expect(reply.text).toContain(`${party[0]!.id} (the west side of "Hall"): a party wall now, with a neighbour beyond it.`)
    // Nothing else changed.
    const before = file('house.json').walls
    expect(file('party.json').walls.filter((w) => w.id !== party[0]!.id)).toEqual(before.filter((w) => w.id !== party[0]!.id))
  })

  it('takes walls by id, with a common part of the building beyond, and clears them again', async () => {
    const id = file('party.json').walls.find((w) => w.kind === 'separating')!.id
    await ok('grid_set_party_wall', { plan: 'party.json', walls: [id], beyond: 'common', out: 'common.json' })
    expect(file('common.json').walls.find((w) => w.id === id)).toMatchObject({ kind: 'separating', beyond: 'common' })
    const cleared = await ok('grid_set_party_wall', { plan: 'common.json', walls: [id], clear: true, out: 'cleared.json' })
    const wall = file('cleared.json').walls.find((w) => w.id === id)!
    expect(wall.kind).toBe('exterior')
    expect(wall.beyond).toBeUndefined()
    expect(cleared.text).toContain('an ordinary wall again')
  })

  it('refuses a side the room does not have, an unknown wall, and both ways at once', async () => {
    expect(await refused('grid_set_party_wall', { plan: 'house.json', room: 'hall', side: 'ne' })).toMatch(/side/i)
    expect(await refused('grid_set_party_wall', { plan: 'house.json', walls: ['nope'] })).toContain('The wall named is not in this plan.')
    expect(await refused('grid_set_party_wall', { plan: 'house.json', walls: ['nope'], room: 'hall', side: 'west' })).toContain('not both')
    expect(await refused('grid_set_party_wall', { plan: 'house.json', room: 'hall' })).toContain('room and side')
  })
})

describe('grid_change_neighbour', () => {
  it('adds a neighbour by a box, with its height and name', async () => {
    const reply = await ok('grid_change_neighbour', { plan: 'house.json', action: 'add', id: 'no-12', name: 'No. 12', at: '-8,0', width: 7.7, depth: 8.6, height: 9, out: 'n1.json' })
    expect(file('n1.json').context).toEqual([{ id: 'no-12', name: 'No. 12', points: [[-8, 0], [-0.3, 0], [-0.3, 8.6], [-8, 8.6]], height: 9 }])
    expect(reply.text).toContain('Added the neighbour no-12 ("No. 12"), 7.70 m by 8.60 m, 9.00 m high.')
  })

  it('adds one by its points with an id of its own, moves, resizes and takes it out', async () => {
    await ok('grid_change_neighbour', { plan: 'n1.json', action: 'add', points: ['10,0', '16,0', '16,8', '10,8'], out: 'n2.json' })
    const added = file('n2.json').context!
    expect(added.map((s) => s['id'])).toEqual(['no-12', 'neighbour-2'])
    await ok('grid_change_neighbour', { plan: 'n2.json', action: 'move', id: 'neighbour-2', by: '1,0', out: 'n3.json' })
    expect(file('n3.json').context![1]!['points']).toEqual([[11, 0], [17, 0], [17, 8], [11, 8]])
    await ok('grid_change_neighbour', { plan: 'n3.json', action: 'resize', id: 'neighbour-2', height: 12, out: 'n4.json' })
    expect(file('n4.json').context![1]!['height']).toBe(12)
    await ok('grid_change_neighbour', { plan: 'n4.json', action: 'remove', id: 'no-12', out: 'n5.json' })
    expect(file('n5.json').context!.map((s) => s['id'])).toEqual(['neighbour-2'])
    await ok('grid_change_neighbour', { plan: 'n5.json', action: 'remove', id: 'neighbour-2', out: 'n6.json' })
    expect(file('n6.json').context).toBeUndefined()
  })

  it('refuses an unknown id with the ones it has, a floor it does not have and half a box', async () => {
    expect(await refused('grid_change_neighbour', { plan: 'n1.json', action: 'move', id: 'no-14', by: '1,0' })).toContain('The plan has no neighbour with the id no-14. Its neighbours: no-12.')
    expect(await refused('grid_change_neighbour', { plan: 'n1.json', action: 'add', at: '0,20', width: 3, depth: 3, floor: 'roof' })).toContain('"ground"')
    expect(await refused('grid_change_neighbour', { plan: 'n1.json', action: 'add', at: '0,20', width: 3 })).toContain('at, width and depth together')
  })
})
