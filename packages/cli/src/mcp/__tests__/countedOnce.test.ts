/**
 * CNT-27: one rule for counting the rooms the net area counts. A stair or a lift drawn as a room on
 * each of three floors, one over the other, is one shaft: grid_count, the room schedule, the brief,
 * the option table and the verdict of a change count it once, on the floor it rises from, as
 * grid_areas does, and each says which rooms it left out and why.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { edit, stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { parseBrief } from '../../brief/brief'
import { briefLines } from '../../brief/lines'
import { comparePlans, optionRow } from '../../quantities/compare'
import { roomSchedule, roomScheduleCsv } from '../../quantities/schedule'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { bench, type Bench, type Reply } from './replay/harness'

/** The CSV's line of column names. */
const header = (csv: string): string => csv.split('\n').find((line) => line.startsWith('number,'))!

/** The house with its second floor's main room made a void, open to the floor below. */
const withVoid = edit(stairRoomHouse(), (copy) => {
  const room = copy.rooms.find((r) => r.id === 'second-main')!
  ;(room as { void?: boolean }).void = true
})

let b: Bench
beforeAll(() => {
  b = bench({ 'stair.json': stairRoomHouse(), 'lift.json': stairRoomHouse({ use: 'lift' }), 'void.json': withVoid })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

interface CountData {
  groups: { value: unknown; count: number; sums: Record<string, number>; ids: string[] }[]
  total: { count: number; sums: Record<string, number> }
  notCounted: { id: string; floor: string; why: string; with?: { floor: string; room: string } }[]
  stairs: string
}

describe('grid_count counts rooms as the net does (CNT-27)', () => {
  it('sums the rooms\' area to grid_areas\' net, the stair once', async () => {
    const reply = await ok('grid_count', { plan: 'stair.json', kind: ['room'], by: 'use', sum: ['area'] })
    const data = reply.data as unknown as CountData
    const areas = await ok('grid_areas', { plan: 'stair.json' })
    expect(data.total.sums['area']).toBeCloseTo(areas.data!['net'] as number, 6)
    expect(data.groups.find((g) => g.value === 'stair')!.count).toBe(1)
    expect(data.total.count).toBe(4)
    expect(data.stairs).toBe('once')
    expect(data.notCounted.map((r) => [r.id, r.why, r.with?.room])).toEqual([
      ['first-stair', 'shaft', 'ground-stair'],
      ['second-stair', 'shaft', 'ground-stair'],
    ])
    expect(reply.text).toContain('Not counted, as grid_areas counts them: 2 stair or lift rooms counted once, with the lowest room of their shaft')
  })

  it('counts a lift shaft once too', async () => {
    const reply = await ok('grid_count', { plan: 'lift.json', kind: ['room'], where: ['use = lift'] })
    expect((reply.data as unknown as CountData).total.count).toBe(1)
  })

  it('counts each floor\'s stair room with stairs=per floor, and says so', async () => {
    const reply = await ok('grid_count', { plan: 'stair.json', kind: ['room'], by: 'use', sum: ['area'], stairs: 'per floor' })
    const data = reply.data as unknown as CountData
    expect(data.groups.find((g) => g.value === 'stair')!.count).toBe(3)
    expect(data.notCounted).toEqual([])
    expect(data.stairs).toBe('per floor')
    const net = planAreas(surveyPlan(stairRoomHouse())).net
    expect(data.total.sums['area']).toBeGreaterThan(net + 1)
    expect(reply.text).toContain('Stairs and lifts are counted on every floor they are drawn on')
  })

  it('leaves a void out, with why', async () => {
    const reply = await ok('grid_count', { plan: 'void.json', kind: ['room'], sum: ['area'] })
    const data = reply.data as unknown as CountData
    expect(data.notCounted.find((r) => r.id === 'second-main')!.why).toBe('void')
    expect(data.total.sums['area']).toBeCloseTo(planAreas(surveyPlan(withVoid)).net, 6)
  })
})

describe('the room schedule marks the rows in no total (CNT-27)', () => {
  it('adds up the counted rows to each floor\'s total and the whole', () => {
    const s = roomSchedule(surveyPlan(stairRoomHouse()))
    const counted = s.rows.filter((r) => r.notCounted === undefined)
    expect(counted.reduce((a, r) => a + (r.area ?? 0), 0)).toBeCloseTo(s.total.area, 6)
    expect(s.total.rooms).toBe(counted.length)
    for (const f of s.floors) {
      const here = counted.filter((r) => r.floor === f.floor)
      expect(here.reduce((a, r) => a + (r.area ?? 0), 0)).toBeCloseTo(f.area, 6)
      expect(f.rooms).toBe(here.length)
    }
    expect(s.rows.find((r) => r.id === 'first-stair')!.notCounted).toEqual({ why: 'shaft', with: { floor: 'ground', room: 'ground-stair' } })
    expect(header(roomScheduleCsv(s))).toContain('not in totals')
  })

  it('keeps the CSV of a schedule with every row counted as it was', () => {
    const s = roomSchedule(surveyPlan(stairRoomHouse()), { floors: ['ground'] })
    expect(s.rows.every((r) => r.notCounted === undefined)).toBe(true)
    expect(header(roomScheduleCsv(s))).not.toContain('not in totals')
  })

  it('says so in the tool\'s text', async () => {
    const reply = await ok('grid_schedule', { plan: 'stair.json', of: 'rooms' })
    expect(reply.text).toMatch(/"Stair" \(stair\), "First floor": [^\n]*in no total: counted once with "Stair" on "Ground floor"/)
    expect(reply.text).toContain('"First floor": 1 room,')
  })
})

describe('grid_areas marks a void (CNT-27)', () => {
  it('in the CSV\'s counted column and the text', async () => {
    const csv = await ok('grid_areas', { plan: 'void.json', format: 'csv' })
    const row = csv.text.split('\n').find((line) => line.includes('second-main'))!
    expect(row).toContain(',void,')
    const text = await ok('grid_areas', { plan: 'void.json' })
    expect(text.text).toMatch(/a void, open to the floor below: in no figure/)
  })

  it('says a lift over a lift is counted with the lift it rises from', async () => {
    const reply = await ok('grid_areas', { plan: 'lift.json' })
    expect(reply.text).toContain('the lift it rises from')
  })
})

describe('the brief and compare count a shaft once (CNT-27)', () => {
  it('a brief asking for 1 lift is met by one shaft on three floors', () => {
    const brief = parseBrief({ rooms: [{ use: 'lift', count: 1, level: 'must', source: 'given', quote: 'one lift' }] }, { versionNeeded: false })
    const line = briefLines(stairRoomHouse({ use: 'lift' }), brief).find((l) => l.wish === 'rooms')!
    expect(line.state).toBe('met')
    expect(line.drawn).toBe('1')
  })

  it('the option table counts the stair once', () => {
    expect(optionRow('A', surveyPlan(stairRoomHouse())).rooms).toBe(4)
  })

  it('the verdict of a change counts a shaft taken out once', () => {
    const before = surveyPlan(stairRoomHouse())
    const after = surveyPlan(edit(stairRoomHouse(), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.use !== 'stair')
    }))
    const verdict = comparePlans(before, after, ['before', 'after'], { inPlace: true }).verdict
    expect(verdict).toContain('1 room taken out')
  })
})
