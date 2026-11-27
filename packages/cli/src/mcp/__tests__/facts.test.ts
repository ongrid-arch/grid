/**
 * CNT-9: facts of the person's own, and a way to ask across them. The plan is the stand-in for
 * the lab's S-10 (`packages/floorplan/fixtures/facts-office.json`, 59 facts over walls, doors,
 * windows, rooms and floors), which is not in the repository.
 *
 * Done when (1): the 59 facts survive reading and an edit, and appear in the schedules (here),
 * an IFC property set and the DXF (`packages/floorplan/src/export/__tests__/facts.test.ts`).
 * Done when (2): "which doors have no fire rating" and "area per department" are each one call,
 * returning ids and only the fields asked for.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { factCount, factsOffice } from '@ongrid/floorplan/test-support/facts'
import { bench, type Bench, type Reply } from './replay/harness'

let b: Bench
beforeAll(() => {
  b = bench({ 'office.json': factsOffice() })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

const fresh = (file: string): void => b.write(file, factsOffice())
const onDisk = (file: string) => parseFloorPlan(JSON.parse(readFileSync(join(b.folder, file), 'utf8')))

describe('asking across the facts (done when 2)', () => {
  it('"which doors have no fire rating" is one call: the ids, and nothing else', async () => {
    const reply = await ok('grid_find', { plan: 'office.json', kind: ['door'], where: ['fire rating is missing'] })
    expect(reply.data!['ids']).toEqual(['d-g2'])
    expect(reply.data!['rows']).toEqual([{ id: 'd-g2' }])
    expect(reply.data!['count']).toBe(1)
    expect(reply.text).toContain('Found 1 door:')
  })

  it('gives only the fields asked for', async () => {
    const reply = await ok('grid_find', { plan: 'office.json', kind: ['door'], where: ['fire rating is set'], fields: ['fire rating', 'width'] })
    expect(reply.data!['rows']).toEqual([
      { id: 'd-entry', 'fire rating': 'EI 30', width: 1 },
      { id: 'd-f1', 'fire rating': 'EI 60', width: 0.9 },
      { id: 'd-g1', 'fire rating': 'EI 30', width: 0.9 },
    ])
  })

  it('"area per department" is one call: each group with its area and its ids', async () => {
    const reply = await ok('grid_count', { plan: 'office.json', kind: ['room'], by: 'department', sum: ['area'] })
    const groups = reply.data!['groups'] as { value: string; count: number; sums: { area: number }; ids: string[] }[]
    expect(groups.map((g) => [g.value, g.count, g.ids])).toEqual([
      ['Design', 2, ['f-store', 'f-studio']],
      ['Sales', 2, ['g-meeting', 'g-office']],
      ['Front of house', 1, ['g-reception']],
    ])
    const areas = await ok('grid_areas', { plan: 'office.json' })
    const net = new Map((areas.data!['floors'] as { rooms: { id: string; net: number }[] }[]).flatMap((f) => f.rooms.map((r) => [r.id, r.net] as const)))
    expect(groups[1]!.sums.area).toBeCloseTo(net.get('g-office')! + net.get('g-meeting')!, 1)
    expect(Object.keys(groups[0]!)).toEqual(['value', 'count', 'sums', 'missing', 'ids'])
    expect(reply.data!['units']).toEqual({ area: 'm²' })
    expect(reply.text).toContain('By "department":')
  })

  it('sums a fact of numbers, and says how many parts had none', async () => {
    const reply = await ok('grid_count', { plan: 'office.json', kind: ['room'], by: 'floor', sum: ['head count'] })
    const groups = reply.data!['groups'] as { value: string; sums: Record<string, number>; missing: Record<string, number> }[]
    expect(groups.map((g) => [g.value, g.sums['head count'], g.missing['head count']])).toEqual([['ground', 16, 0], ['first', 12, 1]])
  })

  it('lists what can be asked, with units and the facts the parts carry', async () => {
    const reply = await ok('grid_fields', { plan: 'office.json' })
    const facts = reply.data!['facts'] as { name: string; count: number; kinds: string[]; type: string; values: string[] }[]
    const rating = facts.find((f) => f.name === 'fire rating')!
    expect(rating).toMatchObject({ count: 6, kinds: ['wall', 'door'], type: 'text' })
    expect(rating.values).toEqual(['EI 30', 'EI 60'])
    expect(facts.find((f) => f.name === 'head count')).toMatchObject({ type: 'number', count: 4 })
    const fields = reply.data!['fields'] as { name: string; unit: string | null }[]
    expect(fields.find((f) => f.name === 'area')!.unit).toBe('m²')
    expect(fields.find((f) => f.name === 'width')!.unit).toBe('m')
  })

  it('reads lengths with their unit, and refuses an unknown field with the nearest one and never the word sent', async () => {
    const narrow = await ok('grid_find', { plan: 'office.json', kind: ['door'], where: ['width < 950 mm'] })
    expect(narrow.data!['ids']).toEqual(['d-f1', 'd-g1', 'd-g2'])
    const refused = await b.call('grid_find', { plan: 'office.json', where: ['fire ratng is missing'] })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('The nearest is "fire rating".')
    expect(refused.text).not.toContain('ratng')
    const text = await b.call('grid_count', { plan: 'office.json', sum: ['department'] })
    expect(text.isError).toBe(true)
    expect(text.text).toContain('only a field of numbers can be summed')
  })

  it('hands grid_view what it takes to show the answer: picked out, or coloured by group', async () => {
    const found = await ok('grid_find', { plan: 'office.json', kind: ['door'], where: ['fire rating is missing'] })
    const view = found.data!['view'] as Record<string, unknown>
    expect(view).toEqual({ kind: 'plan', floor: 'ground', highlight: ['d-g2'] })
    const picked = await ok('grid_view', { plan: 'office.json', ...view })
    expect(picked.image).toBe(true)
    expect(picked.data!['painted']).toEqual([{ colour: expect.any(String), value: null, words: 'picked out', ids: ['d-g2'] }])
    const counted = await ok('grid_count', { plan: 'office.json', kind: ['room'], by: 'department', sum: ['area'] })
    const coloured = await ok('grid_view', { plan: 'office.json', ...(counted.data!['view'] as Record<string, unknown>) })
    const groups = coloured.data!['painted'] as { words: string; ids: string[] }[]
    expect(groups.map((g) => [g.words, g.ids])).toEqual([['Sales', ['g-meeting', 'g-office']], ['Front of house', ['g-reception']]])
    expect(coloured.text).toContain('Coloured by "department"')
  })
})

describe('the facts in the schedules (done when 1)', () => {
  it('gives a stated room number in place of Grid\'s, and each room\'s facts', async () => {
    const reply = await ok('grid_schedule', { plan: 'office.json', of: 'rooms' })
    const rows = reply.data!['rows'] as { number: number; roomNumber: string | null; id: string; properties: Record<string, unknown> }[]
    expect(rows.map((r) => [r.roomNumber, r.id])).toEqual([['G.01', 'g-reception'], ['G.02', 'g-office'], ['G.03', 'g-meeting'], ['1.01', 'f-studio'], ['1.02', 'f-store']])
    expect(rows[1]!.properties).toEqual({ department: 'Sales', 'head count': 8, finish: 'Carpet' })
    expect(reply.text).toContain('"G.02". "Open office"')
    expect(reply.text).toContain('"department" "Sales", "head count" 8')
    // MSG-3: a CSV's first row is the label, in one cell.
    const csv = (await ok('grid_schedule', { plan: 'office.json', of: 'rooms', format: 'csv' })).text.split('\n')
    expect(csv[0]).toBe('"General guidance, not your local rules"')
    expect(csv[1]).toBe('number,room id,name,use,area m2,area sq ft,height m,floor,state,department,head count,finish')
    expect(csv[3]).toMatch(/^G\.02,g-office,Open office,other,.*,Sales,8,Carpet$/)
  })

  it('gives each door\'s and window\'s facts in the opening schedule', async () => {
    const reply = await ok('grid_schedule', { plan: 'office.json', of: 'openings' })
    const rows = reply.data!['rows'] as { id: string; properties: Record<string, unknown> }[]
    expect(rows.find((r) => r.id === 'd-entry')!.properties).toEqual({ 'fire rating': 'EI 30', 'door set': 'DS-01', 'self-closing': true })
    const csv = (await ok('grid_schedule', { plan: 'office.json', of: 'openings', format: 'csv' })).text.split('\n')
    expect(csv[0]).toBe('"General guidance, not your local rules"')
    // CNT-14: the doors state their swing, so the schedule says their handing.
    expect(csv[1]).toBe('number,mark,id,type,width m,height m,sill m,handing,floor,side 1,side 2,count,phase,section,fire rating,door set,self-closing,glazing,openable')
    const facts = rows.reduce((n, r) => n + Object.keys(r.properties).length, 0)
    expect(facts).toBe(11 + 12)
  })
})

describe('the facts kept through edits (done when 1)', () => {
  it('keeps all 59 after a door is changed and a side is moved', async () => {
    fresh('edit.json')
    await ok('grid_change_opening', { plan: 'edit.json', opening: 'd-entry', width: 1.1 })
    await ok('grid_move_room_side', { plan: 'edit.json', room: 'g-meeting', side: 'east', by: 0.5 })
    const plan = onDisk('edit.json')
    expect(factCount(plan)).toBe(59)
    expect(plan.openings.find((o) => o.id === 'd-entry')!.properties).toEqual({ 'fire rating': 'EI 30', 'door set': 'DS-01', 'self-closing': true })
  })

  // WRT-84: the facts that describe the place; a number (a count) stays with the room, so none is counted twice.
  it('splits a room into two that both keep its place facts, its counts and number staying with it, and says so', async () => {
    fresh('split.json')
    const reply = await ok('grid_split_room', { plan: 'split.json', room: 'g-office', side: 'north', size: 2, new_room: 'g-quiet', new_name: 'Quiet room' })
    const plan = onDisk('split.json')
    const office = plan.rooms.find((r) => r.id === 'g-office')!
    const quiet = plan.rooms.find((r) => r.id === 'g-quiet')!
    expect(quiet.properties).toEqual({ department: 'Sales', finish: 'Carpet' })
    expect(office.properties).toEqual({ department: 'Sales', 'head count': 8, finish: 'Carpet' })
    expect(reply.text).toContain('"Open office" keeps "head count" (8) as stated for the whole room')
    expect(office.number).toBe('G.02')
    expect(quiet.number).toBeUndefined()
    expect(reply.text).toContain('"Quiet room" keeps the facts of "Open office"')
  })

  // WRT-84: a head count both rooms carry is added up, and said.
  it('merges two rooms into one that keeps the first\'s facts and number, adds up their counts, and says so', async () => {
    fresh('merge.json')
    const reply = await ok('grid_merge_rooms', { plan: 'merge.json', room: 'g-office', with: 'g-meeting' })
    const merged = onDisk('merge.json').rooms.find((r) => r.id === 'g-office')!
    expect(merged.properties).toEqual({ department: 'Sales', 'head count': 14, finish: 'Carpet' })
    expect(merged.number).toBe('G.02')
    expect(reply.text).toContain('"head count" 14 (8 + 6)')
    expect(reply.text).toContain('"G.03"')
  })

  it('keeps every fact and number when the plan is read back as rooms text and written again', async () => {
    fresh('rooms.json')
    const read = await ok('grid_describe', { plan: 'rooms.json', as: 'rooms' })
    expect(read.text).not.toContain('raw room')
    const written = await ok('grid_write_rooms', { plan: 'rooms.json', rooms: read.data!['text'] as string })
    expect(factCount(onDisk('rooms.json'))).toBe(59)
    expect(written.text).toContain('Facts of your own and room numbers kept by id')
  })
})
