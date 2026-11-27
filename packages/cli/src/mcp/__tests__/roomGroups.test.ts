/**
 * CNT-57: rooms grouped into households, departments and zones, read the same by every tool.
 * A care home's sixty bedrooms along a corridor, each with a room type and a tenure, in five
 * households of twelve (a fact of the person's own): counted, listed, coloured, cropped,
 * scheduled and briefed by the words a person groups them by.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { parseBrief } from '../../brief/brief'
import { briefLines } from '../../brief/lines'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSEHOLDS = ['Birch', 'Cedar', 'Elm', 'Hazel', 'Oak'] as const

function careHome(): FloorPlan {
  const out = compileRoomsText([
    'plan "Care home"',
    'walls outside 0.3 inside 0.15 height 2.8',
    'unit bed',
    '  room r "Bedroom {n}" bedroom 3 x 4 tenure private type "Ensuite single"',
    '  door d between r and corridor, centred, 0.9 wide',
    'end',
    'repeat bed 30 east as 1 at 0,0',
    'room corridor "Corridor" corridor * x 2 north of 1 until 30 tenure common',
    'repeat bed 30 east as 31 north of corridor mirror north-south',
    '',
  ].join('\n'))
  expect(out.problems).toEqual([])
  const plan = parseFloorPlan(out.plan)
  return {
    ...plan,
    rooms: plan.rooms.map((room) => {
      const n = Number(/^r-(\d+)$/.exec(room.id)?.[1])
      if (Number.isNaN(n)) return room
      return { ...room, ...(n > 30 ? { roomType: 'Ensuite double' } : {}), properties: { household: HOUSEHOLDS[Math.floor((n - 1) / 12)]! } }
    }),
  }
}

let b: Bench
beforeAll(() => {
  const plan = careHome()
  const typed = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'r-1' ? { ...r, properties: { ...r.properties, type: 'respite' } } : r)) }
  const feet = { ...plan, display: { length: 'ft-in', area: 'ft2' } }
  b = bench({ 'home.json': plan, 'typed.json': typed, 'feet.json': feet })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

type Group = { value: unknown; count: number; ids: string[]; sums: Record<string, number> }
const groupsOf = (reply: Reply): [unknown, number][] => (reply.data!['groups'] as Group[]).map((g) => [g.value, g.count])

describe('counting rooms by their group', () => {
  it('groups by type, roomType and room type alike: the firm\'s room type', async () => {
    for (const by of ['type', 'roomType', 'room type', 'Room_Type']) {
      const reply = await ok('grid_count', { plan: 'home.json', kind: ['room'], by })
      expect(reply.data!['by']).toBe('room type')
      expect(groupsOf(reply)).toEqual([['Ensuite double', 30], ['Ensuite single', 30], [null, 1]])
    }
  })

  it('groups by tenure', async () => {
    const reply = await ok('grid_count', { plan: 'home.json', kind: ['room'], by: 'tenure' })
    expect(groupsOf(reply)).toEqual([['private', 60], ['common', 1]])
  })

  it('groups sixty bedrooms by household, a fact of the person\'s own, with each household\'s area', async () => {
    const reply = await ok('grid_count', { plan: 'home.json', kind: ['room'], where: ['use = bedroom'], by: 'household', sum: ['area'] })
    const groups = reply.data!['groups'] as Group[]
    expect(groups.map((g) => [g.value, g.count])).toEqual(HOUSEHOLDS.map((h) => [h, 12]))
    expect(groups[0]!.sums['area']).toBeCloseTo(12 * 12, 0)
    expect(reply.text).toContain('By "household":')
  })

  it('reads a fact named type as the person\'s, before the room type', async () => {
    const reply = await ok('grid_count', { plan: 'typed.json', kind: ['room'], by: 'type' })
    expect(reply.data!['by']).toBe('type')
    expect(groupsOf(reply)).toEqual([['respite', 1], [null, 60]])
    const typed = await ok('grid_count', { plan: 'typed.json', kind: ['room'], by: 'room type' })
    expect(typed.data!['by']).toBe('room type')
  })

  it('finds by type and tenure as it counts by them', async () => {
    const reply = await ok('grid_find', { plan: 'home.json', where: ['type = ensuite double', 'tenure = private'] })
    expect(reply.data!['count']).toBe(30)
  })

  it('counts areas in whole square feet on a plan read in square feet', async () => {
    const reply = await ok('grid_count', { plan: 'feet.json', kind: ['room'], where: ['use = bedroom'], by: 'area', sum: ['area'] })
    expect(reply.text).toMatch(/^ {2}\d+ sq ft \(\d+\.\d\d m²\): 60 rooms/m)
  })
})

describe('the groups in every other answer', () => {
  it('lists the values each group field holds in grid_fields', async () => {
    const reply = await ok('grid_fields', { plan: 'home.json', kind: ['room'] })
    const fields = reply.data!['fields'] as { name: string; count?: number; values?: string[] }[]
    expect(fields.find((f) => f.name === 'room type')).toMatchObject({ count: 60, values: ['Ensuite double', 'Ensuite single'] })
    expect(fields.find((f) => f.name === 'tenure')).toMatchObject({ count: 61, values: ['private', 'common'] })
    expect(fields.find((f) => f.name === 'area')).not.toHaveProperty('values')
    expect(reply.text).toContain('room type for room (on 60 rooms: "Ensuite double", "Ensuite single")')
    const facts = reply.data!['facts'] as { name: string; values: string[] }[]
    expect(facts.find((f) => f.name === 'household')!.values).toEqual([...HOUSEHOLDS])
  })

  it('colours the plan by type and crops it to a tenure', async () => {
    const coloured = await ok('grid_view', { plan: 'home.json', kind: 'plan', colour: 'type' })
    expect(coloured.text).toContain('Coloured by "room type"')
    const cropped = await ok('grid_view', { plan: 'home.json', kind: 'plan', crop: 'tenure = common' })
    expect(cropped.text).toContain('the one room where tenure = common')
  })

  it('gives each room its type and tenure in the room schedule, as text, data and CSV', async () => {
    const reply = await ok('grid_schedule', { plan: 'home.json', of: 'rooms', whole: true })
    const rows = reply.data!['rows'] as { id: string; roomType: string | null; tenure: string | null }[]
    expect(rows.find((r) => r.id === 'r-31')).toMatchObject({ roomType: 'Ensuite double', tenure: 'private' })
    expect(rows.find((r) => r.id === 'corridor')).toMatchObject({ roomType: null, tenure: 'common' })
    expect(reply.text).toContain(', room type "Ensuite single", tenure private;')
    const csv = await ok('grid_schedule', { plan: 'home.json', of: 'rooms', format: 'csv', whole: true })
    expect(csv.text).toContain('state,room type,tenure,household')
  })

  it('leaves the room schedule of a plan with no room type or tenure as it was', async () => {
    const plan = careHome()
    b.write('plain.json', { ...plan, rooms: plan.rooms.map((r) => { const { roomType, tenure, ...rest } = r; void roomType; void tenure; return rest }) })
    const reply = await ok('grid_schedule', { plan: 'plain.json', of: 'rooms' })
    expect(Object.keys((reply.data!['rows'] as object[])[0]!)).not.toContain('roomType')
    expect(Object.keys((reply.data!['rows'] as object[])[0]!)).not.toContain('tenure')
  })

  it('measures a brief\'s wish scoped by tenure or room type on those rooms only', () => {
    const plan = careHome()
    const said = { level: 'must', source: 'given', quote: 'what they said' } as const
    const brief = (fact: Record<string, unknown>, count: number) => briefLines(plan, parseBrief({ rooms: [{ use: 'bedroom', fact, count, ...said }] }, { versionNeeded: false }))[0]!
    expect(brief({ name: 'room type', value: 'Ensuite double' }, 30).state).toBe('met')
    expect(brief({ name: 'type', value: 'ensuite single' }, 30).state).toBe('met')
    expect(brief({ name: 'tenure', value: 'private' }, 60).state).toBe('met')
    expect(brief({ name: 'household', value: 'Oak' }, 12).state).toBe('met')
    expect(brief({ name: 'tenure', value: 'common' }, 1).state).toBe('missed')
  })
})
