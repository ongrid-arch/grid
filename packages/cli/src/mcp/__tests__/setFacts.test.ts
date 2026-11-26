/**
 * WRT-74: grid_set_facts writes facts of the person's own and a room's number into the plan, on
 * parts named by id or picked as grid_find picks them, and answers with what changed. The plan is
 * CNT-9's office (`packages/floorplan/fixtures/facts-office.json`): facts on walls, doors,
 * windows, rooms and floors, and the rooms numbered G.01 to 1.02.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomNumbers, shownRoomNumber } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { bench, type Bench, type Reply } from './replay/harness'

let b: Bench
beforeAll(() => {
  b = bench({ 'office.json': factsOffice() })
})
afterAll(() => b.close())

const raw = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as Record<string, unknown>
const onDisk = (file: string): FloorPlan => parseFloorPlan(raw(file))
const room = (plan: FloorPlan, id: string) => plan.rooms.find((r) => r.id === id)!
/** A room's record with no stated number. */
const unnumbered = (record: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'number'))

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_set_facts', { plan: 'office.json', out: 'set.json', ...args })
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

async function refused(args: Record<string, unknown>): Promise<string> {
  const reply = await b.call('grid_set_facts', { plan: 'office.json', out: 'refused.json', ...args })
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}

describe('grid_set_facts (WRT-74)', () => {
  it('sets a fact on parts by id, of different kinds, and answers with what changed', async () => {
    const reply = await ok({ parts: ['g-office', 'd-g2', 'gs'], set: { status: 'let' } })
    const plan = onDisk('set.json')
    expect(room(plan, 'g-office').properties).toEqual({ department: 'Sales', 'head count': 8, finish: 'Carpet', status: 'let' })
    expect(plan.openings.find((o) => o.id === 'd-g2')!.properties).toEqual({ 'door set': 'DS-02', 'self-closing': false, status: 'let' })
    expect(plan.walls.find((w) => w.id === 'gs')!.properties).toEqual({ 'U-value': 0.18, status: 'let' })
    expect(reply.text).toContain('"status" is "let" now on room "g-office", wall "gs" and door "d-g2".')
    expect(reply.text).toContain('Wrote "set.json".')
    expect(reply.data!['parts']).toEqual([
      { kind: 'room', id: 'g-office', set: { status: 'let' }, unset: [] },
      { kind: 'wall', id: 'gs', set: { status: 'let' }, unset: [] },
      { kind: 'door', id: 'd-g2', set: { status: 'let' }, unset: [] },
    ])
    // Nothing else in the file changed.
    const before = factsOffice() as { rooms: Record<string, unknown>[] }
    const after = raw('set.json') as { rooms: Record<string, unknown>[] }
    expect(after.rooms.filter((r) => r['id'] !== 'g-office')).toEqual(before.rooms.filter((r) => r['id'] !== 'g-office'))
  })

  it('sets a fact on every part grid_find picks, and grid_count then reads it', async () => {
    const reply = await ok({ kind: ['room'], floor: 'first', set: { zone: 'B', capacity: 10 } })
    expect(reply.text).toContain('"zone" is "B" now on room "f-store" and room "f-studio".')
    const plan = onDisk('set.json')
    expect(plan.rooms.filter((r) => r.properties?.['zone'] === 'B').map((r) => r.id).sort()).toEqual(['f-store', 'f-studio'])
    expect(room(plan, 'f-store').properties?.['capacity']).toBe(10)
    const count = await b.call('grid_count', { plan: 'set.json', kind: ['room'], by: 'zone' })
    const groups = count.data!['groups'] as { value: string | null; ids: string[] }[]
    expect(groups.find((g) => g.value === 'B')?.ids).toEqual(['f-store', 'f-studio'])
  })

  it('picks by where, and says what was so already', async () => {
    const reply = await ok({ kind: ['room'], where: ['department = Sales'], set: { department: 'Sales', floor_plate: 'east' } })
    expect(reply.text).toContain('"department" was "Sales" already on room "g-meeting" and room "g-office".')
    expect(reply.text).toContain('"floor_plate" is "east" now on room "g-meeting" and room "g-office".')
  })

  it('keeps the plan\'s spelling of a fact, and replaces its value', async () => {
    const reply = await ok({ parts: ['g-office'], set: { Department: 'Marketing' } })
    expect(room(onDisk('set.json'), 'g-office').properties).toEqual({ department: 'Marketing', 'head count': 8, finish: 'Carpet' })
    expect(reply.text).toContain('room "g-office": "department" is "Marketing" now, not "Sales".')
  })

  it('takes facts out, and says which parts carried none', async () => {
    const reply = await ok({ kind: ['room'], floor: 'first', unset: ['head count'] })
    const plan = onDisk('set.json')
    expect(room(plan, 'f-studio').properties).toEqual({ department: 'Design', finish: 'Timber' })
    expect(reply.text).toContain('"head count" is taken off room "f-studio".')
    expect(reply.text).toContain('room "f-store" carried no "head count" already.')
  })

  it('takes the facts key out when a part has none left', async () => {
    await ok({ parts: ['w-g1'], unset: ['glazing', 'openable'] })
    const opening = (raw('set.json')['openings'] as Record<string, unknown>[]).find((o) => o['id'] === 'w-g1')!
    expect('properties' in opening).toBe(false)
  })

  it('sets a fact on a floor', async () => {
    await ok({ parts: ['first'], kind: ['floor'], set: { occupancy: 20 } })
    expect(onDisk('set.json').floors!.find((f) => f.id === 'first')!.properties).toEqual({ 'fire compartment': 'FC-2', occupancy: 20 })
  })

  it('gives one room its number, and refuses one another room has', async () => {
    const reply = await ok({ parts: ['g-office'], number: '2.03' })
    expect(room(onDisk('set.json'), 'g-office').number).toBe('2.03')
    expect(reply.text).toContain('Room "g-office" is number "2.03" now, not "G.02".')
    expect(await refused({ parts: ['g-office'], number: 'G.03' })).toContain('Room "g-meeting" has the number "G.03" already.')
  })

  it('refuses a number for two rooms, or for a part that is not a room', async () => {
    expect(await refused({ parts: ['g-office', 'g-meeting'], number: '7' })).toContain('names 2 rooms')
    expect(await refused({ parts: ['d-g2'], number: '7' })).toContain('door "d-g2" is not a room')
  })

  it('keeps the numbers Grid counted for the other rooms when one is stated', async () => {
    const plain = factsOffice() as { rooms: Record<string, unknown>[] }
    b.write('counted.json', { ...plain, rooms: plain.rooms.map(unnumbered) })
    const before = new Map(roomNumbers(onDisk('counted.json')).map((n) => [n.id, shownRoomNumber(n)] as const))
    const reply = await b.call('grid_set_facts', { plan: 'counted.json', parts: ['g-reception'], number: '100', out: 'numbered.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('the other rooms are given the numbers they showed')
    const after = new Map(roomNumbers(onDisk('numbered.json')).map((n) => [n.id, shownRoomNumber(n)] as const))
    expect(after.get('g-reception')).toBe('100')
    for (const [id, number] of before) if (id !== 'g-reception') expect(after.get(id), id).toBe(number)
  })

  it('takes a number out, leaving the room to Grid\'s count, unless that moves other rooms\' numbers', async () => {
    const reply = await ok({ parts: ['g-reception'], number: 'none' })
    expect(room(onDisk('set.json'), 'g-reception').number).toBeUndefined()
    expect(reply.text).toContain('Room "g-reception" states no number now: Grid counts it as "3".')
    const plain = factsOffice() as { rooms: Record<string, unknown>[] }
    b.write('one.json', { ...plain, rooms: plain.rooms.map((r) => (r['id'] === 'g-reception' ? r : unnumbered(r))) })
    const moves = await b.call('grid_set_facts', { plan: 'one.json', parts: ['g-reception'], number: 'none', out: 'unnumbered.json' })
    expect(moves.isError).toBe(true)
    expect(moves.text).toContain('would move the numbers Grid counts for other rooms')
  })

  it('refuses what it cannot do, and writes nothing', async () => {
    expect(await refused({ parts: ['g-ofice'], set: { status: 'let' } })).toContain('The part "g-ofice" is not in this plan. Did you mean "g-office"?')
    expect(await refused({ set: { status: 'let' } })).toContain('Name the parts')
    expect(await refused({ parts: ['g-office'] })).toContain('Pass set, unset or number')
    expect(await refused({ parts: ['g-office'], set: { name: 'Big office' } })).toContain('grid_rename_room')
    expect(await refused({ parts: ['g-office'], set: { area: 20 } })).toContain('Grid measures')
    expect(await refused({ parts: ['g-office'], set: { department: 'Sales' } })).toContain('nothing to change')
    expect(await refused({ kind: ['room'], where: ['department = Nobody'], set: { status: 'x' } })).toContain('No part of the plan is both named and picked')
    expect(await refused({ parts: ['g-office'], set: { status: '' } })).toContain('is given no value')
    expect(await refused({ parts: ['g-office'], set: { status: 'a', Status: 'b' } })).toContain('names one fact twice')
    expect(() => readFileSync(join(b.folder, 'refused.json'))).toThrow()
  })
})

describe('grid_fields says how facts are set (WRT-74)', () => {
  it('names grid_set_facts and the rooms text words', async () => {
    const reply = await b.call('grid_fields', { plan: 'office.json' })
    expect(reply.text).toContain('grid_set_facts')
    expect(reply.text).toContain('facts department=Sales capacity=4')
  })
})
