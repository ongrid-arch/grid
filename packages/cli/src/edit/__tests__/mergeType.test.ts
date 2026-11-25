/**
 * WRT-33: a merge says when the merged room keeps a type fact that no longer fits its size, takes
 * a `type` for it, and offers to take out one of two doors on one wall. Two 1.5 x 3 storage units
 * side by side, each with a door onto the same side.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const wall = (id: string, a: [number, number], b: [number, number]) => ({ id, start: a, end: b, thickness: 0.1, height: 2.4, kind: 'interior' })
const plan = (doors: Array<Record<string, unknown>>, facts = true): Record<string, unknown> => ({
  version: '1',
  walls: [
    wall('s', [0, 0], [3, 0]), wall('e', [3, 0], [3, 3]),
    wall('n2', [3, 3], [1.5, 3]), wall('n1', [1.5, 3], [0, 3]), wall('w', [0, 3], [0, 0]), wall('p', [1.5, 0], [1.5, 3]),
  ],
  rooms: [
    { id: 'u1', name: 'Unit 1', use: 'storage', boundary: ['s', 'p', 'n1', 'w'], ...(facts ? { properties: { 'unit type': '1.5x3' } } : {}) },
    { id: 'u2', name: 'Unit 2', use: 'storage', boundary: ['s', 'e', 'n2', 'p'], ...(facts ? { properties: { 'unit type': '1.5x3' } } : {}) },
  ],
  openings: doors,
})
const door = (id: string, offset: number, type = 'door') => ({ id, wall: 's', type, offset, width: 0.9, height: 2.1 })

let b: Bench | undefined
afterAll(() => b?.close())
async function merge(p: Record<string, unknown>, args: Record<string, unknown> = {}) {
  b?.close()
  b = bench({ 'p.json': p })
  const reply = await b.call('grid_merge_rooms', { plan: 'p.json', room: 'u1', with: 'u2', ...args })
  expect(reply.isError, reply.text).toBe(false)
  return reply.text
}

describe('a merge says when its type no longer fits and offers the doubled door (WRT-33)', () => {
  const both = [door('d1', 0.3), door('d2', 1.8)]

  it('says the kept type is the first unit\'s and the room is now bigger', async () => {
    const text = await merge(plan(both))
    expect(text).toContain('keeps the "unit type" "1.5x3" of "Unit 1", and is now 8.41 m²')
    expect(text).toContain('pass type')
  })

  it('takes type for the merged room', async () => {
    const text = await merge(plan(both), { type: '3x3' })
    expect(text).not.toContain('pass type')
    const file = JSON.parse(readFileSync(join(b!.folder, 'p.json'), 'utf8'))
    expect(file.rooms.find((r: { id: string }) => r.id === 'u1').properties['unit type']).toBe('3x3')
  })

  it('names the type argument\'s fact "type" when the rooms carry none', async () => {
    await merge(plan(both, false), { type: '3x3' })
    expect(JSON.parse(readFileSync(join(b!.folder, 'p.json'), 'utf8')).rooms.find((r: { id: string }) => r.id === 'u1').properties.type).toBe('3x3')
  })

  it('says nothing of a type when the rooms carry none', async () => {
    expect(await merge(plan(both, false))).not.toContain('no longer fit')
  })

  it('offers to take out one of two doors on the merged room\'s wall', async () => {
    const text = await merge(plan(both))
    expect(text).toContain('2 doors on wall "s": "d1", "d2"')
    expect(text).toContain('grid_change_opening')
  })

  it('does not offer for one door, or for a window beside a door', async () => {
    expect(await merge(plan([door('d1', 0.3)]))).not.toContain('doors on wall')
    expect(await merge(plan([door('d1', 0.3), door('w2', 1.8, 'window')]))).not.toContain('doors on wall')
  })
})
