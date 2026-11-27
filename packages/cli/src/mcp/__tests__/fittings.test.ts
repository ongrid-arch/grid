/**
 * CNT-55: bathroom and kitchen fittings placed through the tools: a WC asked for by its plain word,
 * a wall unit hung over a kitchen run, and a refusal that says the kind most likely meant.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const FLAT = ['walls outside 0.3 inside 0.1 height 2.5', 'room k "Kitchen" kitchen 4 x 3 at 0,0', 'room bath "Bathroom" bathroom 2 x 2 east of k', 'door d1 between k and bath, centred, 0.8 wide']

let b: Bench
type Rec = Record<string, unknown>
const items = (): Rec[] => (JSON.parse(readFileSync(join(b.folder, 'flat.json'), 'utf8')) as Rec)['items'] as Rec[]
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'flat.json', rooms: FLAT.join('\n') })
})
afterAll(() => b.close())

describe('fittings through the tools (CNT-55)', () => {
  it('places a WC asked for by its plain word as Grid\'s first toilet', async () => {
    await ok('grid_add_item', { plan: 'flat.json', name: 'WC', id: 'wc1', room: 'bath', against: 'north', end: 'east' })
    expect(items().find((i) => i['id'] === 'wc1')).toMatchObject({ library: 'wc' })
  })

  it('hangs a wall unit over the kitchen run, in no one\'s way, and says how high', async () => {
    await ok('grid_add_item', { plan: 'flat.json', name: 'kitchen-run-3000', id: 'run', room: 'k', against: 'north' })
    const reply = await ok('grid_add_item', { plan: 'flat.json', name: 'wall-unit', id: 'wu', room: 'k', against: 'north', width: 3, depth: 0.35, elevation: 1.5 })
    expect(items().find((i) => i['id'] === 'wu')).toMatchObject({ library: 'wall-unit', size: [3, 0.35], elevation: 1.5 })
    expect(reply.text).toContain('hung 1.50 m above the floor')
    expect(reply.data).toMatchObject({ fits: true, worthALook: [] })
  })

  it('refuses a word that is no kind with the kind it most likely means', async () => {
    const reply = await b.call('grid_add_item', { plan: 'flat.json', name: 'bidett', room: 'bath', against: 'west' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("did you mean 'bidet'?")
  })
})
