/**
 * WRT-50: a merge takes out every wall the two rooms share. Two rooms side by side whose party
 * wall is two walls (an earlier knock-through left it so), and a room that would be left round a
 * hole.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const wall = (id: string, a: [number, number], b: [number, number]) => ({ id, start: a, end: b, thickness: 0.1, height: 2.4, kind: 'interior' })
/** An L-shaped office with a desk zone tucked into its corner: they share the east wall and the north wall of the zone. */
const twoWalls = (): Record<string, unknown> => ({
  version: '1',
  walls: [
    wall('s1', [0, 0], [3, 0]), wall('aw', [0, 5], [0, 0]), wall('n', [6, 5], [0, 5]), wall('ea', [6, 3], [6, 5]),
    wall('p', [3, 0], [3, 3]), wall('q', [3, 3], [6, 3]),
    wall('s2', [3, 0], [6, 0]), wall('e', [6, 0], [6, 3]),
  ],
  rooms: [
    { id: 'office', name: 'Office', use: 'office', boundary: ['s1', 'p', 'q', 'ea', 'n', 'aw'], properties: { desks: 28 } },
    { id: 'zone', name: 'Desk zone', use: 'office', boundary: ['s2', 'e', 'q', 'p'], properties: { desks: 40 } },
  ],
  openings: [{ id: 'd1', wall: 'p', type: 'door', offset: 0.3, width: 0.9, height: 2.1 }],
})

let b: Bench | undefined
afterAll(() => b?.close())
async function merge(p: Record<string, unknown>, args: Record<string, unknown> = {}, room = 'office', other = 'zone') {
  b?.close()
  b = bench({ 'p.json': p })
  return b.call('grid_merge_rooms', { plan: 'p.json', room, with: other, ...args })
}
const onDisk = () => JSON.parse(readFileSync(join(b!.folder, 'p.json'), 'utf8')) as { walls: Array<{ id: string }>; rooms: Array<{ id: string; boundary: string[]; partOf?: string; properties?: Record<string, unknown> }>; openings: Array<{ id: string }> }

describe('a merge takes out every wall two rooms share (WRT-50)', () => {
  it('takes out both walls in one call and makes one room', async () => {
    const reply = await merge(twoWalls())
    expect(reply.isError, reply.text).toBe(false)
    const plan = onDisk()
    expect(plan.walls.map((w) => w.id).sort()).toEqual(['aw', 'e', 'ea', 'n', 's1', 's2'])
    expect(plan.rooms.map((r) => r.id)).toEqual(['office'])
    expect(plan.rooms[0]!.boundary).toEqual(['s1', 's2', 'e', 'ea', 'n', 'aw'])
    expect(plan.openings).toEqual([])
    expect(reply.text).toContain('Took out wall "p"')
    expect(reply.text).toContain('Took out wall "q"')
    expect(reply.text).toContain('Removed door "d1"')
  })

  // WRT-84: a number both rooms carry is a count, added up and said, never kept from one.
  it('adds up a counted fact both rooms carry, and says so', async () => {
    const reply = await merge(twoWalls())
    expect(reply.text).toContain('"Office" carries "desks" 68 (28 + 40)')
    expect(onDisk().rooms.find((r) => r.id === 'office')!.properties).toEqual({ desks: 68 })
  })

  it('keeps both rooms as zones with a dividing line for each wall', async () => {
    const reply = await merge(twoWalls(), { zones: true })
    expect(reply.isError, reply.text).toBe(false)
    const plan = onDisk()
    expect(plan.walls.map((w) => w.id).sort()).toEqual(['aw', 'e', 'ea', 'n', 'p-line', 'q-line', 's1', 's2'])
    expect(plan.rooms.filter((r) => r.partOf === 'office-zone').map((r) => r.id).sort()).toEqual(['office', 'zone'])
  })

  it('takes out three walls when one room wraps round three sides of the other', async () => {
    const plan = {
      version: '1',
      walls: [
        wall('qs', [3, 0], [0, 0]), wall('qe', [3, 3], [3, 0]), wall('qn', [0, 3], [3, 3]), wall('aw', [0, 3], [0, 0]),
        wall('bs', [0, -1], [5, -1]), wall('be', [5, -1], [5, 4]), wall('bn', [5, 4], [0, 4]), wall('bw1', [0, 4], [0, 3]), wall('bw2', [0, 0], [0, -1]),
      ],
      rooms: [
        { id: 'a', name: 'Core', use: 'office', boundary: ['qs', 'aw', 'qn', 'qe'] },
        { id: 'c', name: 'Ring', use: 'office', boundary: ['bs', 'be', 'bn', 'bw1', 'qn', 'qe', 'qs', 'bw2'] },
      ],
    }
    const reply = await merge(plan, {}, 'a', 'c')
    expect(reply.isError, reply.text).toBe(false)
    const after = onDisk()
    expect(after.walls.map((w) => w.id).sort()).toEqual(['aw', 'be', 'bn', 'bs', 'bw1', 'bw2'])
    expect(after.rooms).toHaveLength(1)
    expect(new Set(after.rooms[0]!.boundary)).toEqual(new Set(['bs', 'be', 'bn', 'bw1', 'aw', 'bw2']))
  })
})
