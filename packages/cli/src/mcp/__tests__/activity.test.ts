/**
 * ARE-73: grid_measure what=activity, the activity zone in front of each fixture per kind,
 * through the tool server: per_kind as a box or a depth, room optional, only the zones with
 * findings unless all, and the refusals of a kind Grid does not hold and a figure out of range.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { bench, type Bench, type Reply } from './replay/harness'

function bathroom(): unknown {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.1, height: 2.5, kind: 'exterior' })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s', [0, 0], [3, 0]), wall('e', [3, 0], [3, 2.4]), wall('n', [0, 2.4], [3, 2.4]), wall('w', [0, 2.4], [0, 0])],
    rooms: [{ id: 'bath', name: 'Bathroom', boundary: ['s', 'e', 'n', 'w'], use: 'bathroom' }],
    openings: [],
    items: [
      // Its centre line 0.3 m from the west face.
      { id: 'wc', kind: 'toilet', at: [0.35, 0.375], size: [0.4, 0.65], height: 0.8 },
      { id: 'basin', kind: 'basin', at: [2, 0.275], size: [0.55, 0.45], height: 0.85 },
    ],
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'bath.json': bathroom() })
})
afterAll(() => b.close())

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_measure', { plan: 'bath.json', what: 'activity', ...args })
  expect(reply.isError, reply.text).toBe(false)
  expect(reply.text.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
  expect(approvalWords(reply.text)).toEqual([])
  return reply
}

type Zone = { items: string[]; short: string[]; ways: Record<string, string>; figure: { front: number; width: number; from: string }; measured: Record<string, number | null> }
const zones = (reply: Reply): Zone[] => (reply.data!['answer'] as { zones: Zone[] }).zones

describe('ARE-73: grid_measure what=activity', () => {
  it('measures a WC\'s box on its centre line, with no room given, and lists only the shortfalls', async () => {
    const reply = await ok({ per_kind: { toilet: { front: 0.7, width: 0.8 }, basin: 0.6 } })
    expect(zones(reply).map((z) => z.items)).toEqual([['wc']])
    expect(zones(reply)[0]!.short).toEqual(['left'])
    expect(zones(reply)[0]!.ways['left']).toBe('west')
    expect(reply.data!['answer']).toMatchObject({ measured: 2, listed: 1 })
    expect(reply.text).toContain('to the west of the 0.40 m asked')
    expect(reply.text).toContain('1 more zone is at least its figure all round')
    expect(reply.text).toMatch(/Taken off each zone: .*; left out: furniture, points and rugs/)
  })

  it('lists every zone with all, and one room with room', async () => {
    const reply = await ok({ room: 'bath', all: true, clearance: 0.5 })
    expect(zones(reply).map((z) => z.items[0])).toEqual(['wc', 'basin'])
    expect(zones(reply)[1]!.figure).toMatchObject({ front: 0.5, from: 'person' })
  })

  it('refuses a kind Grid does not hold, a figure out of range, and per_kind for another measure', async () => {
    const unknown = await b.call('grid_measure', { plan: 'bath.json', what: 'activity', per_kind: { spaceship: 1 } })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('per_kind names a kind Grid does not hold')
    const big = await b.call('grid_measure', { plan: 'bath.json', what: 'activity', per_kind: { toilet: { front: 500 } } })
    expect(big.isError).toBe(true)
    expect(big.text).toContain('per_kind.toilet.front takes a length')
    const stray = await b.call('grid_measure', { plan: 'bath.json', what: 'use', room: 'bath', per_kind: { toilet: 0.7 } })
    expect(stray.isError).toBe(true)
    expect(stray.text).toContain('not per_kind')
  })
})
