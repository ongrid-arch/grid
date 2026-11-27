/**
 * WRT-84: a fact that counts something is never counted twice by a split, nor kept from one room
 * by a merge. A room split in two gives the new room the facts that describe the place (a
 * department) and none of its numbers (seats), which the room keeps; the answer names them with
 * the call that sets each part's own. Two rooms merged add up the numbers both carry, and say so;
 * a number only one carried is named. Two offices side by side, 4 m by 3 m each.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from '../../mcp/__tests__/replay/harness'

const wall = (id: string, a: [number, number], b: [number, number]) => ({ id, start: a, end: b, thickness: 0.1, height: 2.7, kind: 'interior' })
type Facts = Record<string, string | number | boolean>
const plan = (west: Facts, east: Facts, uses: [string, string] = ['office', 'office']): Record<string, unknown> => ({
  version: '1',
  walls: [
    wall('s1', [0, 0], [4, 0]), wall('s2', [4, 0], [8, 0]), wall('e', [8, 0], [8, 3]),
    wall('n2', [8, 3], [4, 3]), wall('n1', [4, 3], [0, 3]), wall('w', [0, 3], [0, 0]), wall('p', [4, 0], [4, 3]),
  ],
  rooms: [
    { id: 'west', name: 'West office', use: uses[0], boundary: ['s1', 'p', 'n1', 'w'], properties: west },
    { id: 'east', name: 'East office', use: uses[1], boundary: ['s2', 'e', 'n2', 'p'], properties: east },
  ],
  openings: [],
})

let b: Bench | undefined
afterAll(() => b?.close())
async function call(p: Record<string, unknown>, tool: string, args: Record<string, unknown>): Promise<{ reply: Reply; rooms: { id: string; properties?: Facts }[] }> {
  b?.close()
  b = bench({ 'p.json': p })
  const reply = await b.call(tool, { plan: 'p.json', ...args })
  expect(reply.isError, reply.text).toBe(false)
  return { reply, rooms: JSON.parse(readFileSync(join(b.folder, 'p.json'), 'utf8')).rooms }
}
const factsOf = (rooms: { id: string; properties?: Facts }[], id: string) => rooms.find((r) => r.id === id)?.properties

describe('a split copies the facts of the place, not its counts (WRT-84)', () => {
  it('keeps the head count on the room, gives the new room the department, and the floor still counts 31 with the other office', async () => {
    const { reply, rooms } = await call(plan({ department: 'Sales', 'cost centre': 'CC-12', 'head count': 30 }, { department: 'Sales', 'head count': 1 }), 'grid_split_room', { room: 'west', side: 'north', size: 1, new_room: 'quiet', new_name: 'Quiet room' })
    expect(factsOf(rooms, 'west')).toEqual({ department: 'Sales', 'cost centre': 'CC-12', 'head count': 30 })
    expect(factsOf(rooms, 'quiet')).toEqual({ department: 'Sales', 'cost centre': 'CC-12' })
    expect(reply.text).toContain('Facts that count something are not copied to "Quiet room", so none is counted twice: "West office" keeps "head count" (30) as stated for the whole room')
    expect(reply.text).toContain('call grid_set_facts with parts "west" and set, then with parts "quiet"')
    const count = await b!.call('grid_count', { plan: 'p.json', kind: ['room'], sum: ['head count'] })
    expect(count.isError, count.text).toBe(false)
    expect((count.data!['groups'] as { sums: Record<string, number> }[]).map((g) => g.sums['head count']), count.text).toEqual([31])
  })

  it('says nothing of counts when the room carries none', async () => {
    const { reply, rooms } = await call(plan({ department: 'Sales' }, {}), 'grid_split_room', { room: 'west', side: 'north', size: 1, new_room: 'quiet', new_name: 'Quiet room' })
    expect(factsOf(rooms, 'quiet')).toEqual({ department: 'Sales' })
    expect(reply.text).not.toContain('count something')
  })
})

describe('a merge adds up the counts both rooms carry, and says so (WRT-84)', () => {
  it('sums the seats of two offices', async () => {
    const { reply, rooms } = await call(plan({ department: 'Sales', seats: 4 }, { department: 'Sales', seats: 6 }), 'grid_merge_rooms', { room: 'west', with: 'east' })
    expect(factsOf(rooms, 'west')).toEqual({ department: 'Sales', seats: 10 })
    expect(reply.text).toContain('"West office" carries "seats" 10 (4 + 6): the figures of "West office" and "East office" added up, as counts.')
    expect(reply.text).toContain('grid_set_facts, parts "west"')
    // A sum is not something the second room "said otherwise".
    expect(reply.text).not.toContain('said otherwise')
  })

  it('sums with zones too, the zones keeping their own', async () => {
    const { rooms } = await call(plan({ seats: 4 }, { seats: 6 }), 'grid_merge_rooms', { room: 'west', with: 'east', zones: true })
    expect(factsOf(rooms, 'west-east')).toEqual({ seats: 10 })
    expect(factsOf(rooms, 'west')).toEqual({ seats: 4 })
    expect(factsOf(rooms, 'east')).toEqual({ seats: 6 })
  })

  it('names a count only one room carried, and the facts of the place a new use may not fit', async () => {
    const { reply, rooms } = await call(plan({ seats: 4, membership: 'private office' }, {}, ['office', 'meeting']), 'grid_merge_rooms', { room: 'west', with: 'east', use: 'meeting', name: 'Meeting room' })
    expect(factsOf(rooms, 'west')).toEqual({ seats: 4, membership: 'private office' })
    expect(reply.text).toContain('"Meeting room" keeps "seats" (4) from "West office" alone: "East office" stated none.')
    expect(reply.text).toContain('"Meeting room" is used as meeting now and keeps the facts of "West office" ("membership")')
  })
})
