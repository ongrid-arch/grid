/**
 * WRT-72: a door or window added to a plan that has its walls, in a side of a room or between two
 * rooms, placed as rooms text places it and refused as the change to an opening refuses it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from './replay/harness'

type Added = { id: string; wall: string; type: string; offset: number; width: number; sill: number; height: number; swing?: string; hinge?: string; kind?: string; anchor?: { from: string; room: string }; phase?: string }

/** A hall (west) and a living room (east), a door between them, a dividing line to a study in the north. */
function twoRooms(phase?: string): FloorPlan {
  const p = phase === undefined ? {} : { phase }
  const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior' = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind, ...p })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s1', [0, 0], [5, 0]), wall('mid', [5, 0], [5, 4], 'interior'), wall('n1', [5, 4], [0, 4]), wall('w', [0, 4], [0, 0]), wall('s2', [5, 0], [9, 0]), wall('e', [9, 0], [9, 4]), wall('n2', [9, 4], [5, 4])],
    rooms: [
      { id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s1', 'mid', 'n1', 'w'], ...p },
      { id: 'living', name: 'Living', use: 'living', boundary: ['s2', 'e', 'n2', 'mid'], ...p }
    ],
    openings: [{ id: 'front', wall: 's1', type: 'door', offset: 0.5, width: 0.9, sill: 0, height: 2.1, ...p }]
  } as unknown as FloorPlan
}

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

const onDisk = (): Added[] => (JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8')) as { openings: Added[] }).openings
async function add(args: Record<string, unknown>, plan: FloorPlan = twoRooms()) {
  b.write('plan.json', plan)
  return b.call('grid_add_opening', { plan: 'plan.json', ...args })
}

describe('grid_add_opening', () => {
  it('puts a door in the side of a room, centred, with a door\'s own size', async () => {
    const reply = await add({ type: 'door', room: 'living', side: 'north' })
    expect(reply.isError, reply.text).toBe(false)
    const made = onDisk().find((o) => o.id === 'door-living-north')!
    expect(made).toMatchObject({ wall: 'n2', type: 'door', width: 0.9, height: 2.1, sill: 0 })
    expect(made.offset).toBeCloseTo(1.55, 3)
    expect(reply.text).toContain('New door "door-living-north", 0.90 m wide')
    expect(reply.text).toContain('no swing drawn yet')
  })

  it('places a window from a side, as rooms text says "0.6 from east", and keeps its anchor', async () => {
    const reply = await add({ type: 'window', room: 'living', side: 'north', from: 'east', distance: 0.6, width: 1.5 })
    expect(reply.isError, reply.text).toBe(false)
    const made = onDisk().find((o) => o.type === 'window')!
    expect(made).toMatchObject({ wall: 'n2', width: 1.5, sill: 0.9, height: 1.2, anchor: { from: 'east', room: 'living' } })
    // n2 runs from x=9 to x=5: its offset 0 is at the east end, and the inside face is 0.1 m in.
    expect(made.offset).toBeCloseTo(0.7, 3)
  })

  it('puts a door between two rooms, with its swing into the one named', async () => {
    const reply = await add({ type: 'door', room: 'hall', between: 'living', opens_into: 'living', hinged: 'left', width: 0.8, id: 'link' })
    expect(reply.isError, reply.text).toBe(false)
    const made = onDisk().find((o) => o.id === 'link')!
    expect(made).toMatchObject({ wall: 'mid', swing: 'right', width: 0.8 })
    expect(made.hinge).toBeDefined()
    expect(reply.text).toContain('opens into "Living"')
  })

  it('takes a kind, and a sliding door needs no swing', async () => {
    const reply = await add({ type: 'door', room: 'hall', between: 'living', kind: 'sliding' })
    expect(reply.isError, reply.text).toBe(false)
    expect(onDisk().find((o) => o.id !== 'front')).toMatchObject({ kind: 'sliding' })
    expect(reply.text).not.toContain('no swing drawn')
  })

  it('refuses a width the wall cannot take, with its free stretches, and writes nothing', async () => {
    const reply = await add({ type: 'door', room: 'hall', side: 'south', from: 'west', distance: 0.8, width: 1 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('Free stretches, from the wall\'s start')
    expect(onDisk().map((o) => o.id)).toEqual(['front'])
  })

  it('refuses rooms that share no wall, a taken id, and a place with no side or between', async () => {
    const plan = twoRooms()
    const apart = { ...plan, walls: [...plan.walls, { id: 'x1', start: [20, 0], end: [24, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }, { id: 'x2', start: [24, 0], end: [24, 4], thickness: 0.2, height: 2.7, kind: 'exterior' }, { id: 'x3', start: [24, 4], end: [20, 4], thickness: 0.2, height: 2.7, kind: 'exterior' }, { id: 'x4', start: [20, 4], end: [20, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }], rooms: [...plan.rooms, { id: 'shed', name: 'Shed', use: 'storage', boundary: ['x1', 'x2', 'x3', 'x4'] }] } as unknown as FloorPlan
    const none = await add({ type: 'door', room: 'hall', between: 'shed' }, apart)
    expect(none.isError).toBe(true)
    expect(none.text).toContain('share no wall')
    const taken = await add({ type: 'door', room: 'hall', side: 'north', id: 'front' })
    expect(taken.isError).toBe(true)
    expect(taken.text).toContain('already taken')
    const nowhere = await add({ type: 'door', room: 'hall' })
    expect(nowhere.isError).toBe(true)
    expect(nowhere.text).toContain('Say where it goes')
    const both = await add({ type: 'door', room: 'hall', side: 'north', between: 'living' })
    expect(both.isError).toBe(true)
    const noSwing = await add({ type: 'window', room: 'hall', side: 'north', opens_into: 'outside' })
    expect(noSwing.isError).toBe(true)
    expect(noSwing.text).toContain('Only a door opens')
  })

  it('in a plan with phases, the new opening is new work', async () => {
    const reply = await add({ type: 'window', room: 'living', side: 'east' }, twoRooms('existing'))
    expect(reply.isError, reply.text).toBe(false)
    expect(onDisk().find((o) => o.type === 'window')?.phase).toBe('new')
  })

  it('runs as grid edit add-opening', async () => {
    const { runEdit } = await import('../../command/edit')
    b.write('plan.json', twoRooms())
    let out = ''
    await runEdit(['add-opening', 'plan.json', '--type', 'window', '--room', 'hall', '--side', 'north', '--width', '1.2m', '--project', b.folder], b.folder, (text) => { out += text })
    expect(out).toContain('New window')
    expect(onDisk().some((o) => o.type === 'window' && o.width === 1.2)).toBe(true)
  })
})
