/** ARE-67: the seats, desks and covers in the tools an agent asks with: grid_measure what=seats and grid_count. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'
import { seatingPlan, SEATING_ITEMS } from '../../quantities/__tests__/seatingPlan'

let b: Bench
beforeAll(() => {
  b = bench({ 'p.json': seatingPlan(SEATING_ITEMS) })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('ARE-67: grid_measure what=seats', () => {
  it('counts the plan, each room and each zone, with its rule', async () => {
    const reply = await ok('grid_measure', { plan: 'p.json', what: 'seats' })
    const answer = (reply.data as { answer: { plan: unknown; rooms: { id: string; seats: number; desks: number }[]; zones: { id: string; desks: number; of: string }[] } }).answer
    expect(answer.plan).toEqual({ seats: 13, desks: 5, covers: 4 })
    expect(answer.rooms.map((r) => [r.id, r.seats, r.desks])).toEqual([['open', 5, 5], ['cafe', 8, 0]])
    expect(answer.zones.map((z) => [z.id, z.desks, z.of])).toEqual([['team-a', 3, 'open'], ['team-b', 2, 'open']])
    expect(reply.text).toContain('In the plan: 13 seats, 5 desks, 4 covers')
    expect(reply.text).toContain('"Team A" 3 seats, 3 desks, 0 covers')
    expect(reply.text).toContain('not how many people a room may hold')
  })

  it('counts one room with its pieces', async () => {
    const reply = await ok('grid_measure', { plan: 'p.json', what: 'seats', room: 'cafe' })
    expect(reply.text).toContain('"Cafe": 8 seats, 0 desks, 4 covers, from 4 chair, 1 sofa (3 seats, 1 by width), 1 stool.')
  })
})

describe('ARE-67: grid_count with kind=item and the seats fields', () => {
  it('takes kind=item for every fixture and piece of furniture', async () => {
    const reply = await ok('grid_count', { plan: 'p.json', kind: ['item'] })
    expect((reply.data as { total: { count: number } }).total.count).toBe(SEATING_ITEMS.length)
  })

  it('sums seats and desks by zone and by room', async () => {
    const byZone = await ok('grid_count', { plan: 'p.json', kind: ['item'], by: 'item zone', sum: ['seats', 'desks'] })
    const groups = (byZone.data as { groups: { value: unknown; sums: Record<string, number> }[] }).groups
    expect(Object.fromEntries(groups.map((g) => [String(g.value), g.sums]))).toEqual({
      'team-a': { seats: 3, desks: 3 },
      'team-b': { seats: 2, desks: 2 },
      null: { seats: 8, desks: 0 },
    })
    const rooms = await ok('grid_count', { plan: 'p.json', kind: ['room'], by: 'id', sum: ['covers'] })
    const sums = (rooms.data as { groups: { value: unknown; sums: Record<string, number> }[] }).groups
    expect(Object.fromEntries(sums.map((g) => [String(g.value), g.sums['covers']]))).toEqual({ cafe: 4, open: 0 })
  })
})
