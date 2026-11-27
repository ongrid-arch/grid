/**
 * CNT-52: points placed through the tools: an extinguisher with facts of its own on a wall, an
 * assembly point outside, a camera; counted by grid_count, listed by grid_schedule of=items and
 * described.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const OFFICE = ['walls outside 0.3 inside 0.1 height 3', 'room hall "Hall" corridor 8 x 2 at 0,0', 'room office "Office" office 8 x 5 north of hall', 'door d1 between hall and office, centred, 0.9 wide']

let b: Bench
type Rec = Record<string, unknown>
const items = (): Rec[] => (JSON.parse(readFileSync(join(b.folder, 'office.json'), 'utf8')) as Rec)['items'] as Rec[]
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'office.json', rooms: OFFICE.join('\n') })
})
afterAll(() => b.close())

describe('points through the tools (CNT-52)', () => {
  it('places an extinguisher on a wall with its facts, and says it is in no one\'s way', async () => {
    const reply = await ok('grid_add_item', { plan: 'office.json', name: 'extinguisher', id: 'fe1', x: 0, y: 1, facts: { type: 'CO2', serviced: '2026-09' } })
    expect(items().find((i) => i['id'] === 'fe1')).toEqual({ id: 'fe1', library: 'extinguisher', at: [0, 1], properties: { type: 'CO2', serviced: '2026-09' } })
    expect(reply.text).toContain('It is a point')
    expect(reply.data).toMatchObject({ fits: true, worthALook: [] })
    await ok('grid_add_item', { plan: 'office.json', name: 'extinguisher', id: 'fe2', x: 7.5, y: 1, facts: { type: 'foam' } })
    await ok('grid_add_item', { plan: 'office.json', name: 'assembly-point', id: 'ap', x: -10, y: -10 })
    await ok('grid_add_item', { plan: 'office.json', name: 'camera', id: 'cam', x: 4, y: 6.5, turn: 180 })
    await ok('grid_add_item', { plan: 'office.json', name: 'desk', id: 'desk1', x: 4, y: 5 })
  })

  it('counts the points by kind and finds them by their facts', async () => {
    const counted = await ok('grid_count', { plan: 'office.json', kind: ['point'], by: 'item kind' })
    const groups = (counted.data as { groups: { value: unknown; count: number }[] }).groups
    expect(Object.fromEntries(groups.map((g) => [g.value, g.count]))).toEqual({ extinguisher: 2, 'assembly-point': 1, camera: 1 })
    const found = await ok('grid_find', { plan: 'office.json', kind: ['item'], where: ['type = CO2'] })
    expect(found.text).toContain('fe1')
    expect(found.text).not.toContain('fe2')
    // The desk is furniture, not a point.
    const all = await ok('grid_count', { plan: 'office.json', kind: ['item'] })
    expect((all.data as { total: { count: number } }).total.count).toBe(5)
  })

  it('lists every item with its place and facts in grid_schedule of=items', async () => {
    const reply = await ok('grid_schedule', { plan: 'office.json', of: 'items' })
    expect(reply.text).toMatch(/Items: .*2 fire extinguishers/)
    expect(reply.text).toContain('1. Extinguisher "fe1" (extinguisher), in "Hall", at 0.00 m, 1.00 m; "type" "CO2", "serviced" "2026-09"')
    expect(reply.text).toMatch(/Assembly point "ap" \(assembly-point\), in no room/)
    const rows = (reply.data as { rows: Rec[] }).rows
    expect(rows.map((r) => r['id'])).toEqual(['fe1', 'fe2', 'ap', 'cam', 'desk1'])
    expect(rows[0]).toMatchObject({ group: 'point', properties: { type: 'CO2' } })
    const csv = await ok('grid_schedule', { plan: 'office.json', of: 'items', format: 'csv' })
    expect(csv.text).toMatch(/number,id,kind,group,label,floor,room,.*facts/)
  })

  it('names the points in the description', async () => {
    const person = await ok('grid_describe', { plan: 'office.json', length: 'rooms', for: 'person' })
    expect(person.text).toMatch(/Furniture: 1 desk\. Points: 2 extinguishers, 1 camera, 1 assembly point\./)
    const agent = await ok('grid_describe', { plan: 'office.json', length: 'rooms' })
    expect(agent.text).toContain('Items: 1 desk, 2 fire extinguishers, 1 camera, 1 assembly point.')
  })
})
