/**
 * CNT-59: an edit that cuts a wall in pieces keeps the wall's id and what another tool calls it
 * (`identity`) on its longest piece; the other pieces are new walls with none, so a surveyed
 * wall's GlobalId is never retired and never on two walls.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Part = { id: string; start?: number[]; end?: number[]; identity?: { guid?: string }; properties?: Record<string, unknown>; kind?: string }

const GUID = '2O2Fr$t4X7Zf8NOew3FLOH'
const MID_GUID = '1hqIFTRjfV6AWq_bMtnZwI'
const wall = (id: string, start: number[], end: number[], kind = 'exterior', thickness = 0.3) => ({ id, start, end, thickness, height: 2.7, kind })

/** Two rooms side by side, 8 by 5 m between centre lines, split at x = 4, the north walls surveyed. */
const PLAN = {
  version: '1',
  walls: [
    { ...wall('n1', [0, 5], [4, 5]), identity: { guid: GUID, name: 'Basic Wall:Exterior 300', tag: '348112' }, properties: { surveyed: true } },
    wall('n2', [4, 5], [8, 5]),
    wall('e', [8, 5], [8, 0]),
    wall('s2', [8, 0], [4, 0]),
    wall('s1', [4, 0], [0, 0]),
    wall('west', [0, 0], [0, 5]),
    { ...wall('mid', [4, 0], [4, 5], 'interior', 0.1), identity: { guid: MID_GUID } },
  ],
  rooms: [
    { id: 'living', name: 'Living room', use: 'living', boundary: ['s1', 'mid', 'n1', 'west'] },
    { id: 'kitchen', name: 'Kitchen', use: 'kitchen', boundary: ['s2', 'e', 'n2', 'mid'] },
  ],
  openings: [{ id: 'd-mid', wall: 'mid', type: 'door', offset: 0.5, width: 0.8, height: 2.1 }],
}

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

const onDisk = (file: string): { walls: Part[] } => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as { walls: Part[] }
const length = (w: Part): number => Math.hypot(w.end![0]! - w.start![0]!, w.end![1]! - w.start![1]!)

describe('a wall cut by an edit keeps its id and identity on its longest piece (CNT-59)', () => {
  it('adds a room against a surveyed wall', async () => {
    b.write('add.json', PLAN)
    const reply = await b.call('grid_add_room', { plan: 'add.json', room: 'ext', against: 'living', side: 'north', width: 2, depth: 3, name: 'Extension', use: 'living', from: 'west', distance: 0.3 })
    expect(reply.isError, reply.text).toBe(false)
    const walls = onDisk('add.json').walls
    const pieces = walls.filter((w) => w.id === 'n1' || w.id.startsWith('n1-'))
    expect(pieces.length).toBeGreaterThan(1)
    const kept = walls.find((w) => w.id === 'n1')!
    expect(kept.identity).toEqual({ guid: GUID, name: 'Basic Wall:Exterior 300', tag: '348112' })
    for (const piece of pieces) expect(length(piece)).toBeLessThanOrEqual(length(kept) + 1e-9)
    expect(walls.filter((w) => w.identity?.guid === GUID)).toHaveLength(1)
    // The other pieces keep the wall's facts, as before.
    for (const piece of pieces) expect(piece.properties).toEqual({ surveyed: true })
  })

  it('merges two rooms across a wall with an identity', async () => {
    b.write('merge.json', PLAN)
    const reply = await b.call('grid_merge_rooms', { plan: 'merge.json', room: 'living', with: 'kitchen', use: 'living' })
    expect(reply.isError, reply.text).toBe(false)
    const walls = onDisk('merge.json').walls
    // The whole wall between is taken out: its GlobalId leaves with it, on no other wall.
    expect(walls.some((w) => w.identity?.guid === MID_GUID)).toBe(false)
    expect(walls.filter((w) => w.identity?.guid === GUID)).toHaveLength(1)
  })
})
