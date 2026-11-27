/**
 * CMD-42: grid_set sets fields of parts by id, checked by the plan schema, and answers as every
 * change does. The plan is CNT-9's office (`packages/floorplan/fixtures/facts-office.json`): two
 * floors, walls 3 m high, five rooms; the tests add a column to it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { bench, type Bench, type Reply } from './replay/harness'

const office = (): Record<string, unknown> => ({ ...factsOffice(), columns: [{ id: 'c1', shape: 'square', width: 0.3, at: [6, 4] }] })

let b: Bench
beforeAll(() => {
  b = bench({ 'office.json': office(), 'twice.json': { ...office(), columns: [{ id: 'gs', shape: 'round', width: 0.3, at: [6, 4] }] } })
})
afterAll(() => b.close())

const raw = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as Record<string, unknown>
const onDisk = (file: string): FloorPlan => parseFloorPlan(raw(file))

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_set', { plan: 'office.json', out: 'set.json', ...args })
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

async function refused(args: Record<string, unknown>): Promise<string> {
  const reply = await b.call('grid_set', { plan: 'office.json', out: 'refused.json', ...args })
  expect(reply.isError, reply.text).toBe(true)
  expect(reply.text).toMatch(/nothing was written/i)
  return reply.text
}

describe('grid_set (CMD-42)', () => {
  it('sets a room\'s floor offset by id, says what it was, and writes nothing else', async () => {
    const reply = await ok({ parts: ['g-meeting'], set: { floorOffset: 0.6 } })
    expect(onDisk('set.json').rooms.find((r) => r.id === 'g-meeting')!.floorOffset).toBe(0.6)
    expect(reply.text).toContain('"floorOffset" is 0.6 now on room "g-meeting".')
    expect(reply.text).toContain('Wrote "set.json".')
    expect(reply.data!['parts']).toEqual([{ kind: 'room', id: 'g-meeting', set: { floorOffset: 0.6 }, unset: [] }])
    expect(typeof reply.data!['planRevision']).toBe('string')
    const before = office() as { rooms: Record<string, unknown>[]; walls: unknown[] }
    const after = raw('set.json') as { rooms: Record<string, unknown>[]; walls: unknown[] }
    expect(after.rooms.filter((r) => r['id'] !== 'g-meeting')).toEqual(before.rooms.filter((r) => r['id'] !== 'g-meeting'))
    expect(after.walls).toEqual(before.walls)
  })

  it('sets the height of several walls in one call, with what one of them was', async () => {
    const reply = await ok({ parts: ['gs', 'ge'], set: { height: 3.2 } })
    const plan = onDisk('set.json')
    expect(plan.walls.filter((w) => w.id === 'gs' || w.id === 'ge').map((w) => w.height)).toEqual([3.2, 3.2])
    expect(plan.walls.find((w) => w.id === 'gn')!.height).toBe(3)
    expect(reply.text).toContain('"height" is 3.2 now on wall "gs" and wall "ge".')
    const one = await ok({ parts: ['gn'], set: { height: 3.4 } })
    expect(one.text).toContain('wall "gn": "height" is 3.4 now, not 3.')
  })

  it('sets a floor\'s elevation and outline, and a column\'s width', async () => {
    const outline = [[-0.15, -0.15], [12.15, -0.15], [12.15, 8.15], [-0.15, 8.15]]
    // The ground floor's 3 m walls stop short of a slab whose underside is higher: the drawing's check refuses it.
    expect(await refused({ parts: ['first'], set: { elevation: 3.4 } })).toContain('That change would break the drawing')
    await ok({ parts: ['first'], set: { elevation: 3.15 } })
    expect(onDisk('set.json').floors!.find((f) => f.id === 'first')!.elevation).toBe(3.15)
    await ok({ parts: ['ground'], set: { outline } })
    expect(onDisk('set.json').floors!.find((f) => f.id === 'ground')!.outline).toEqual(outline)
    const column = await ok({ parts: ['c1'], set: { width: 0.5 } })
    expect(onDisk('set.json').columns![0]!.width).toBe(0.5)
    expect(column.text).toContain('column "c1": "width" is 0.5 now, not 0.3.')
  })

  it('takes a field out with unset, and says when a part stated none', async () => {
    b.write('offset.json', { ...office(), rooms: (office()['rooms'] as Record<string, unknown>[]).map((r) => (r['id'] === 'g-meeting' ? { ...r, floorOffset: 0.3 } : r)) })
    const reply = await ok({ plan: 'offset.json', parts: ['g-meeting', 'g-office'], unset: ['floorOffset'] })
    expect(onDisk('set.json').rooms.find((r) => r.id === 'g-meeting')!.floorOffset).toBeUndefined()
    expect(reply.text).toContain('room "g-meeting": "floorOffset" is taken out; it was 0.3.')
    expect(reply.text).toContain('room "g-office" stated no "floorOffset" already.')
  })

  it('says a value that is so already, and refuses a call that changes nothing', async () => {
    const reply = await ok({ parts: ['gs', 'g-meeting'], set: { height: 3 } })
    expect(reply.text).toContain('"height" was 3 already on wall "gs".')
    expect(await refused({ parts: ['gs'], set: { height: 3 } })).toContain('nothing to change')
  })

  it('refuses a value the plan schema refuses, naming the part and the field, and writes nothing', async () => {
    expect(await refused({ parts: ['gs'], set: { height: -1 } })).toMatch(/^The wall "gs" cannot take that "height": /m)
    expect(await refused({ parts: ['ground'], set: { outline: [[0, 0], [1, 0]] } })).toContain('floor "ground" cannot take that "outline"')
    expect(await refused({ parts: ['g-meeting'], set: { floorOffset: 'high' } })).toContain('room "g-meeting" cannot take that "floorOffset"')
    expect(() => readFileSync(join(b.folder, 'refused.json'))).toThrow()
  })

  it('refuses a field the part does not have, with the nearest one', async () => {
    const text = await refused({ parts: ['gs'], set: { heigth: 3.2 } })
    expect(text).toContain('"heigth" is not a field of a wall. Did you mean "height"?')
  })

  it('refuses a field another tool sets, naming that tool', async () => {
    expect(await refused({ parts: ['gs'], set: { thickness: 0.4 } })).toContain('grid_change_wall')
    expect(await refused({ parts: ['g-meeting'], set: { name: 'Board room' } })).toContain('grid_rename_room')
    expect(await refused({ parts: ['g-meeting'], set: { properties: { zone: 'A' } } })).toContain('grid_set_facts')
    expect(await refused({ parts: ['g-meeting'], set: { phase: 'new' } })).toContain('grid_set_phase')
    expect(await refused({ parts: ['gs'], set: { start: [0, 1] } })).toContain('grid_move_room_side')
    expect(await refused({ parts: ['gs'], set: { id: 'south' } })).toContain('A part keeps its id')
  })

  it('refuses an unknown id with the nearest, a door with its tool, and an id of two kinds without kind', async () => {
    expect(await refused({ parts: ['g-meetin'], set: { height: 3 } })).toContain('Did you mean "g-meeting"?')
    expect(await refused({ parts: ['d-g2'], set: { width: 1 } })).toContain('grid_change_opening')
    const twice = await b.call('grid_set', { plan: 'twice.json', out: 'twice-out.json', parts: ['gs'], set: { height: 3.5 } })
    expect(twice.isError).toBe(true)
    expect(twice.text).toContain('is a wall and a column in this plan: pass kind')
    const column = await b.call('grid_set', { plan: 'twice.json', out: 'twice-out.json', parts: ['gs'], kind: 'column', set: { height: 3.5 } })
    expect(column.isError, column.text).toBe(false)
    expect(onDisk('twice-out.json').columns![0]!.height).toBe(3.5)
  })

  it('refuses a change based on a revision the plan is no longer at', async () => {
    b.write('shared.json', office())
    const first = await b.call('grid_set', { plan: 'shared.json', parts: ['gs'], set: { height: 3.1 } })
    expect(first.isError, first.text).toBe(false)
    const read = first.data!['planRevision'] as string
    const second = await b.call('grid_set', { plan: 'shared.json', parts: ['ge'], set: { height: 3.1 }, based_on: read })
    expect(second.isError, second.text).toBe(false)
    const stale = await b.call('grid_set', { plan: 'shared.json', parts: ['gn'], set: { height: 3.1 }, based_on: read })
    expect(stale.isError).toBe(true)
    expect(onDisk('shared.json').walls.find((w) => w.id === 'gn')!.height).toBe(3)
  })
})

describe('grid_set roof (WRT-79)', () => {
  it('sets a floor\'s roof from the words of a roof line, keeping its roof lights', async () => {
    await ok({ parts: ['first'], set: { roof: { shape: 'mono-pitch', eaves: 2.7, pitch: 10, highSide: 'north', rooflights: [{ id: 'r1', at: [6, 4], width: 1, length: 1 }] } } })
    const reply = await b.call('grid_set', { plan: 'set.json', out: 'roofed.json', parts: ['first'], roof: 'mono-pitch pitch 15 eaves 2.6 high south' })
    expect(reply.isError, reply.text).toBe(false)
    expect(onDisk('roofed.json').floors!.find((f) => f.id === 'first')!.roof).toEqual({ shape: 'mono-pitch', eaves: 2.6, pitch: 15, highSide: 'south', rooflights: [{ id: 'r1', at: [6, 4], width: 1, length: 1 }] })
    const off = await b.call('grid_set', { plan: 'roofed.json', out: 'bare.json', parts: ['first'], roof: 'none' })
    expect(off.isError, off.text).toBe(false)
    expect(onDisk('bare.json').floors!.find((f) => f.id === 'first')!.roof).toBeUndefined()
  })

  it('refuses words that give no roof, and a roof given twice', async () => {
    expect(await refusedRoof({ parts: ['first'], roof: 'gable pitch 45' })).toMatch(/roof: a roof says how high its eaves are/)
    expect(await refusedRoof({ parts: ['first'], roof: 'flat eaves 3', set: { roof: { shape: 'flat', eaves: 3 } } })).toMatch(/Give the roof once/)
  })
})

async function refusedRoof(args: Record<string, unknown>): Promise<string> {
  const reply = await b.call('grid_set', { plan: 'office.json', out: 'refused.json', ...args })
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}
