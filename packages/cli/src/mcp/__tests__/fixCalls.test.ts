/**
 * MSG-7 (lab MS-13): a line that one call would clear carries that call as data, and sending
 * it clears the line. The plan is a box whose south wall is 4.30 m long, with a door that runs
 * from 0.50 to 5.50 m on it; the message used to stop at "runs from 0.50 to 5.50 m on a wall
 * 4.30 m long", without the 3.80 m that fits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

function plan(door: Record<string, unknown>): unknown {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
  return {
    version: '1',
    units: 'm',
    walls: [wall('south', [0, 0], [4.3, 0]), wall('east', [4.3, 0], [4.3, 4]), wall('north', [4.3, 4], [0, 4]), wall('west', [0, 4], [0, 0])],
    rooms: [{ id: 'room', name: 'Room', boundary: ['south', 'east', 'north', 'west'], use: 'living' }],
    openings: [{ id: 'door', wall: 'south', type: 'door', offset: 0.5, width: 0.9, height: 2.1, ...door }],
  }
}

interface Line {
  code: string
  message: string
  found: string
  needed: string
  fix: string
  fixes?: unknown[]
  calls?: { tool: string; arguments: Record<string, unknown> }[]
}

let b: Bench
beforeAll(() => {
  b = bench({
    'too-wide.json': plan({ width: 5 }),
    'too-far.json': plan({ offset: 3.9 }),
    'too-tall.json': plan({ height: 3 }),
  })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

async function lines(file: string): Promise<Line[]> {
  return (await ok('grid_check', { plan: file })).data!['lines'] as Line[]
}

describe('a door that runs off its 4.30 m wall', () => {
  it('says the width that fits at its offset, 3.80 m, and carries the call that makes it', async () => {
    const line = (await lines('too-wide.json')).find((l) => l.code === 'opening/out-of-wall')!
    expect(line.message).toBe('Door "door" runs off its wall')
    expect(line.found).toContain('wall "south", which is 4.30 m long')
    expect(line.found).toContain('at its offset of 0.50 m, a width up to 3.80 m fits')
    expect(line.needed).toBe('a width of at most 3.80 m at its offset')
    expect(line.fix).toBe('Make it 3.80 m wide or narrower, keeping its start.')
    expect(line.calls).toEqual([{ tool: 'grid_change_opening', arguments: { plan: 'too-wide.json', opening: 'door', width: 3.8, keep: 'start' } }])
  })

  it('is gone once that call is sent', async () => {
    const [call] = (await lines('too-wide.json')).find((l) => l.code === 'opening/out-of-wall')!.calls!
    await ok(call!.tool, call!.arguments)
    expect((await lines('too-wide.json')).map((l) => l.code)).not.toContain('opening/out-of-wall')
  })

  it('offers both calls when moving it or narrowing it would do, and each clears the line', async () => {
    const line = (await lines('too-far.json')).find((l) => l.code === 'opening/out-of-wall')!
    expect(line.found).toContain('An offset from 0.00 to 3.40 m fits; at its offset of 3.90 m, a width up to 0.40 m fits')
    expect(line.needed).toBe('an offset of at most 3.40 m, or a width of at most 0.40 m at its offset')
    expect(line.calls!.map((c) => c.arguments)).toEqual([
      { plan: 'too-far.json', opening: 'door', from: 'start', distance: 3.4 },
      { plan: 'too-far.json', opening: 'door', width: 0.4, keep: 'start' },
    ])
    await ok(line.calls![0]!.tool, line.calls![0]!.arguments)
    expect((await lines('too-far.json')).map((l) => l.code)).not.toContain('opening/out-of-wall')
  })
})

describe('a door taller than its wall', () => {
  it('says the height that fits and is gone once the call is sent', async () => {
    const line = (await lines('too-tall.json')).find((l) => l.code === 'opening/too-tall')!
    expect(line.found).toContain('at its sill of 0.00 m, a height up to 2.70 m fits')
    expect(line.fix).toBe("If the storey is taller, raise the wall, or its floor's height and the elevation of any floor over it; if not, make it 2.70 m high or lower, or lower its sill.")
    expect(line.calls).toEqual([{ tool: 'grid_change_opening', arguments: { plan: 'too-tall.json', opening: 'door', height: 2.7 } }])
    await ok(line.calls![0]!.tool, line.calls![0]!.arguments)
    expect((await lines('too-tall.json')).map((l) => l.code)).not.toContain('opening/too-tall')
  })
})
