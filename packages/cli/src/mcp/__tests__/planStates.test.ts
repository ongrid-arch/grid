/**
 * ARE-75: the reading tools read the building before the work, after it, or both, on the
 * refurbishment stand-in (a kitchen and dining room made one, a living room split for a study,
 * the bathroom kept), and grid_view draws the demolition and proposed plans by name.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { refurbishmentRaw } from '@ongrid/floorplan/test-support/phases'
import { bench, type Bench, type Reply } from './replay/harness'

const PLAIN = {
  version: '1',
  walls: [
    { id: 'a', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'b', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'c', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'd', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
  ],
  rooms: [{ id: 'room', name: 'Room', use: 'living', boundary: ['a', 'b', 'c', 'd'] }],
  openings: [{ id: 'door', wall: 'a', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'refurb.json': refurbishmentRaw(), 'plain.json': PLAIN })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

const roomIds = (data: Record<string, unknown>): string[] =>
  (data['floors'] as { rooms: { id: string }[] }[]).flatMap((f) => f.rooms.map((r) => r.id)).sort()

describe('grid_areas before, after and both (ARE-75)', () => {
  it('measures the building before the work as a plan of that state', async () => {
    const reply = await ok('grid_areas', { plan: 'refurb.json', state: 'before' })
    expect(roomIds(reply.data!)).toEqual(['bath', 'dining', 'kitchen', 'living-old'])
    expect(reply.data!['net']).toBeCloseTo(53.76, 6)
    expect(reply.data!['state']).toBe('before')
    expect(reply.text).toContain('Read before the work: the existing parts and those to be demolished, as a plan of that state alone.')
  })

  it('measures after the work as it always has', async () => {
    const asked = await ok('grid_areas', { plan: 'refurb.json', state: 'after' })
    const left = await ok('grid_areas', { plan: 'refurb.json' })
    expect(roomIds(asked.data!)).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(asked.data!['net']).toBe(left.data!['net'])
  })

  it('gives the area table of the work with both, as text and CSV', async () => {
    const reply = await ok('grid_areas', { plan: 'refurb.json', state: 'both' })
    expect(reply.text).toContain('The area table of the work, net, before the work (existing), after it (proposed) and the change:')
    expect(reply.text).toContain('"Kitchen", to be demolished: 13.44 m² → 0.00 m², −13.44 m²')
    expect(reply.text).toContain('"Kitchen and dining", new: 0.00 m² → 27.36 m², +27.36 m²')
    expect(reply.text).toContain('"Bathroom", existing: 8.64 m² → 8.64 m², no change')
    expect(reply.text).toContain('kitchen: 13.44 m² → 27.36 m², +13.92 m²')
    expect(reply.text).toContain('Net: 53.76 m² → 53.86 m², +0.10 m²')
    const work = reply.data!['work'] as { rooms: { id: string; phase: string }[]; byUse: Record<string, { change: number }> }
    expect(work.rooms).toHaveLength(7)
    expect(work.byUse['study']!.change).toBeCloseTo(8.74, 6)
    // The figures after the work stay in the data.
    expect(roomIds(reply.data!)).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    const table = await ok('grid_areas', { plan: 'refurb.json', state: 'both', format: 'csv' })
    const lines = table.text.trim().split('\n')
    expect(lines[0]).toBe('row,floor,id,name,use,phase,existing m2,proposed m2,change m2,change sq ft')
    expect(lines.find((line) => line.startsWith('room,ground,kitchen,'))).toMatch(/^room,ground,kitchen,Kitchen,kitchen,demolished,13\.44\d*,0,-13\.44/)
    expect(lines.some((line) => line.startsWith('use,all,,dining,dining,,'))).toBe(true)
  })

  it('reads a plan with no phases the same with every state', async () => {
    const left = await ok('grid_areas', { plan: 'plain.json' })
    for (const state of ['before', 'after']) {
      const reply = await ok('grid_areas', { plan: 'plain.json', state })
      expect(reply.text).toBe(left.text)
    }
    const both = await ok('grid_areas', { plan: 'plain.json', state: 'both' })
    expect(both.text).toContain('The plan states no phase, so the building is the same before and after the work.')
  })
})

describe('grid_view: the demolition and proposed plans (ARE-75)', () => {
  it('names each drawing and draws its state', async () => {
    const demolition = await ok('grid_view', { plan: 'refurb.json', kind: 'plan', state: 'demolition', ids: true })
    expect(demolition.text.split('\n')[0]).toContain('Demolition plan: the building before the work')
    expect(demolition.data!['ids']).toContain('kitchen')
    expect(demolition.data!['ids']).not.toContain('study')
    expect(demolition.text).toContain('to be demolished')
    const proposed = await ok('grid_view', { plan: 'refurb.json', kind: 'plan', state: 'proposed', ids: true })
    expect(proposed.text.split('\n')[0]).toContain('Proposed plan: the building after the work')
    expect(proposed.data!['ids']).toContain('study')
    expect(proposed.data!['ids']).not.toContain('kitchen')
    const before = await ok('grid_view', { plan: 'refurb.json', kind: 'plan', state: 'before', ids: true })
    expect(before.data!['ids']).toContain('kitchen')
    // A plain state draws no work: nothing is marked to be demolished.
    expect(before.text).not.toContain('The plan marks its work')
    expect(demolition.text).toContain('The plan marks its work')
  })

  it('draws the 3D model before the work', async () => {
    const reply = await ok('grid_view', { plan: 'refurb.json', kind: '3d', state: 'demolition' })
    expect(reply.text.split('\n')[0]).toContain('Demolition plan')
  })
})

describe('grid_schedule, grid_describe and grid_find in a state (ARE-75)', () => {
  it('schedules the rooms and openings of the building before the work', async () => {
    const rooms = await ok('grid_schedule', { plan: 'refurb.json', of: 'rooms', state: 'before' })
    expect(rooms.text).toContain('Dining room')
    expect(rooms.text).not.toContain('Study')
    const openings = await ok('grid_schedule', { plan: 'refurb.json', of: 'openings', state: 'before', format: 'csv' })
    expect(openings.text).toContain('win-south-old')
    expect(openings.text).not.toContain('win-living')
    expect(openings.data!['state']).toBe('before')
  })

  it('describes the building before, after and both', async () => {
    const before = await ok('grid_describe', { plan: 'refurb.json', state: 'before' })
    expect(before.text).toContain('Dining room')
    expect(before.text).not.toContain('Study')
    const both = await ok('grid_describe', { plan: 'refurb.json', state: 'both' })
    expect(both.text.indexOf('Read before the work')).toBeLessThan(both.text.indexOf('Read after the work'))
    expect(both.text.indexOf('Read before the work')).toBeGreaterThanOrEqual(0)
    expect(both.text).toContain('Read after the work')
    expect(both.text).toContain('Study')
  })

  it('finds among the parts of one state, and its view draws that state', async () => {
    const walls = await ok('grid_find', { plan: 'refurb.json', kind: ['wall'], state: 'before' })
    expect(walls.data!['count']).toBe(7)
    expect(walls.data!['ids']).toContain('wk')
    expect((walls.data!['view'] as Record<string, unknown>)['state']).toBe('before')
    const after = await ok('grid_find', { plan: 'refurb.json', kind: ['wall'], state: 'after' })
    expect(after.data!['ids']).not.toContain('wk')
    expect(after.data!['count']).toBe(7)
    const both = await ok('grid_find', { plan: 'refurb.json', kind: ['wall'], state: 'both' })
    expect(both.data!['count']).toBe(8)
  })
})

describe('grid_export before the work (ARE-75)', () => {
  it('writes the building before the work beside the whole export', async () => {
    const reply = await ok('grid_export', { plan: 'refurb.json', format: 'dxf', state: 'before' })
    expect(reply.data!['written']).toBe('exports/refurb-before.dxf')
    expect(reply.data!['state']).toBe('before')
    const dxf = readFileSync(join(b.folder, 'exports/refurb-before.dxf'), 'utf8')
    expect(dxf).toContain('Dining room')
    expect(dxf).not.toContain('Study')
    await ok('grid_export', { plan: 'refurb.json', format: 'dxf' })
    expect(existsSync(join(b.folder, 'exports/refurb.dxf'))).toBe(true)
    expect(existsSync(join(b.folder, 'exports/refurb-before.dxf'))).toBe(true)
  })
})
