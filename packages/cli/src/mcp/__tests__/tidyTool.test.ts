import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

/**
 * WRT-36: `grid_tidy`, grid tidy on the tool server. A restaurant's corner entrance drawn as a
 * wall across the corner, which the room does not list: listed, the fault offers to take the
 * corner outside; made, the room lists the wall and the door stays on it.
 */
const corner = () => ({
  walls: [
    { id: 's', start: [0, 0], end: [10, 0], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 'e', start: [10, 0], end: [10, 8], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 'n', start: [10, 8], end: [0, 8], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 'w', start: [0, 8], end: [0, 0], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 'cut', start: [8, 0], end: [10, 2], thickness: 0.3, height: 3, kind: 'exterior' },
  ],
  rooms: [{ id: 'dining', name: 'Dining', use: 'living', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'entry', wall: 'cut', type: 'door', offset: 0.9, width: 1, height: 2.1 }],
  note: 'a key Grid does not know, kept as it is',
})

const FAULT = 'crosses-room:cut:dining'
let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})
const read = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(b!.folder, file), 'utf8')) as Record<string, unknown>

describe('grid_tidy', () => {
  it('lists the faults with their fixes and writes nothing', async () => {
    b = bench({ 'plan.json': corner() })
    const before = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    const reply = await b.call('grid_tidy', {})
    expect(reply.isError, reply.text).toBe(false)
    const data = reply.data as { faults: { id: string; fix: string | null; seals: string[] }[]; written: string | null }
    expect(data.faults.map((f) => f.id)).toEqual([FAULT])
    expect(data.faults[0]!.fix).toMatch(/^take the corner beyond it outside/)
    expect(data.faults[0]!.seals).toEqual([])
    expect(data.written).toBeNull()
    expect(reply.text).toContain(`- "${FAULT}": `)
    expect(reply.text).toContain(`apply ["${FAULT}"]`)
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(before)
  })

  it('makes the fix named, keeps every other key, and leaves no fault', async () => {
    b = bench({ 'plan.json': corner() })
    const reply = await b.call('grid_tidy', { apply: [FAULT] })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('Applied (1):')
    expect(reply.text).toContain('Wall faults left: none.')
    expect(reply.text).toMatch(/Wrote plan\.json\n$/)
    const written = read('plan.json') as { note: string; rooms: { boundary: string[] }[]; openings: { id: string; wall: string }[] }
    expect(written.note).toBe('a key Grid does not know, kept as it is')
    expect(written.rooms[0]!.boundary).toEqual(['s', 'cut', 'e', 'n', 'w'])
    expect(written.openings).toEqual([{ id: 'entry', wall: 'cut', type: 'door', offset: 0.9, width: 1, height: 2.1 }])
    expect(((await b.call('grid_tidy', {})).data as { faults: unknown[] }).faults).toEqual([])
  })

  it('writes to out with all and leaves the plan as it is', async () => {
    b = bench({ 'plan.json': corner() })
    const before = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    const reply = await b.call('grid_tidy', { all: true, out: 'tidied.json' })
    expect((reply.data as { written: string }).written).toBe('tidied.json')
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(before)
    expect((read('tidied.json') as { rooms: { boundary: string[] }[] }).rooms[0]!.boundary).toContain('cut')
  })

  it('says a fix would seal a room, lists it in seals, and still makes it with all', async () => {
    const plan = corner()
    plan.walls[4] = { id: 'part', start: [8, 0], end: [8, 8], thickness: 0.1, height: 3, kind: 'exterior' }
    plan.openings = [{ id: 'front', wall: 'w', type: 'door', offset: 3, width: 1, height: 2.1 }]
    b = bench({ 'plan.json': plan })
    const listed = (await b.call('grid_tidy', {})).data as { faults: { id: string; fix: string; seals: string[] }[] }
    expect(listed.faults[0]!.seals).toEqual(['dining-2'])
    expect(listed.faults[0]!.fix).toContain('Look before making it: it leaves room "dining-2" with no way in')
    const all = await b.call('grid_tidy', { all: true })
    const data = all.data as { applied: { id: string; seals: string[] }[]; skipped: unknown[]; written: string | null }
    expect(data.applied.map((f) => [f.id, f.seals])).toEqual([['crosses-room:part:dining', ['dining-2']]])
    expect(data.skipped).toEqual([])
    expect(data.written).toBe('plan.json')
    expect((read('plan.json') as { rooms: unknown[] }).rooms).toHaveLength(2)
  })

  it.each([
    [{ apply: [FAULT], all: true }, 'Pass apply or all=true, not both.'],
    [{ out: 'x.json' }, 'out goes with apply or all'],
    [{ all: true, out: 'x.txt' }, 'out must name a .json file.'],
    [{ all: true, out: '../outside.json' }, 'outside.json'],
    [{ floor: 'ground' }, 'floor'],
  ])('refuses %j', async (args, message) => {
    b = bench({ 'plan.json': corner() })
    const reply = await b.call('grid_tidy', args)
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain(message)
  })
})
