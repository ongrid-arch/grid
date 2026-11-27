/**
 * ARE-12: the room schedule and the opening schedule (lab AR-7, AC-10, AB-4, AU7-1), as data, as
 * text, as CSV and as tables on the check set.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { roomNumbers, toIfc, validatePlan } from '@ongrid/floorplan/geometry'
import { openingSchedule, openingScheduleCsv, roomSchedule, roomScheduleCsv, ScheduleRowError } from '../../quantities/schedule'
import { surveyPlan } from '../../quantities/survey'
import { sheetPages } from '../../sheet/pages'
import { bench, type Bench, type Reply } from './replay/harness'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const raw = (file: string): FloorPlan => JSON.parse(readFileSync(file, 'utf8')) as FloorPlan
const flat = raw(resolve(FLOORPLAN_FIXTURES, 'two-bed-flat.json'))
/** The lab's tiny house with a sleeping loft (AB-4): 25.73 m² on two floors, 277 sq ft. */
const tiny = raw(resolve(FIXTURES, 'tiny-loft.json'))

/** The same plan with every list, and the floors, in the opposite order. */
const reversed = (plan: FloorPlan): FloorPlan => ({
  ...plan,
  walls: [...plan.walls].reverse(),
  rooms: [...plan.rooms].reverse(),
  openings: [...plan.openings].reverse(),
  ...(plan.floors ? { floors: [...plan.floors].reverse() } : {}),
})
const survey = (plan: FloorPlan) => surveyPlan(parseFloorPlan(plan))

/** A CSV line split into fields: a bare number stays a number, as a spreadsheet reads it. */
function fields(line: string): (string | number)[] {
  const out: string[] = []
  const quoted: boolean[] = []
  let at = 0
  while (at <= line.length) {
    if (line[at] === '"') {
      let text = ''
      at++
      while (at < line.length && !(line[at] === '"' && line[at + 1] !== '"')) {
        // A doubled quote inside a quoted field is one quote.
        if (line[at] === '"') at++
        text += line[at]
        at++
      }
      out.push(text)
      quoted.push(true)
      at += 2
    } else {
      const end = line.indexOf(',', at) === -1 ? line.length : line.indexOf(',', at)
      out.push(line.slice(at, end))
      quoted.push(false)
      at = end + 1
    }
  }
  return out.map((f, i) => (!quoted[i] && /^-?\d+(\.\d+)?$/.test(f) ? Number(f) : f))
}

const renovation: FloorPlan = {
  ...tiny,
  walls: tiny.walls.map((wall) => wall.id === 'loft-ext-east' ? { ...wall, phase: 'demolished' } : wall),
  rooms: tiny.rooms.map((room) => room.id === 'loft-loft' ? { ...room, phase: 'demolished' } : room),
  openings: tiny.openings.map((opening) => opening.id === 'ground-d-bath' ? { ...opening, phase: 'new' } : opening),
}

const livingDoor = flat.openings.find((opening) => opening.id === 'door-living')!
const replacement: FloorPlan = {
  ...flat,
  openings: [
    ...flat.openings.map((opening) => opening.id === livingDoor.id ? { ...opening, phase: 'new' as const } : opening),
    { ...livingDoor, id: 'door-living-before', phase: 'demolished' },
  ],
}

describe('CNT-53 opening phases in grid_schedule', () => {
  let b: Bench
  beforeAll(() => { b = bench({ 'renovation.json': renovation, 'loft.json': tiny, 'replacement.json': replacement }) })
  afterAll(() => b.close())

  it('appends a removal with its before-work room and keeps the after-work counts and marks', async () => {
    const reply = await b.call('grid_schedule', { plan: 'renovation.json', of: 'openings' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data?.['counts']).toEqual({ door: 2, window: 4, opening: 0 })
    const rows = reply.data?.['rows'] as { id: string; phase: string; mark: string; between: string[] }[]
    expect(rows.find((row) => row.id === 'ground-d-bath')).toMatchObject({ phase: 'new' })
    expect(rows.find((row) => row.id === 'ground-d-in')).toMatchObject({ phase: 'existing' })
    expect(rows.at(-1)).toMatchObject({ id: 'loft-w-loft', phase: 'demolished', between: expect.arrayContaining(['Sleeping loft']) })
    expect(new Set(rows.map((row) => row.mark)).size).toBe(rows.length)
    expect(rows.slice(0, -1).map((row) => row.mark)).toEqual(openingSchedule(survey(renovation)).rows.map((row) => row.mark))
    expect(reply.text.split('To be removed')[1]).toContain('loft-w-loft')
    const csv = await b.call('grid_schedule', { plan: 'renovation.json', of: 'openings', format: 'csv' })
    const [, header, ...cells] = csv.text.trim().split('\n').map(fields)
    expect(header).toEqual(expect.arrayContaining(['phase', 'section']))
    expect(cells.at(-1)).toEqual(expect.arrayContaining(['loft-w-loft', 'demolished', 'To be removed']))
    expect(cells.every((row) => row.length === header!.length)).toBe(true)
  })

  it('lists a removed-only floor in the window schedule and excludes it from the main count', async () => {
    const args = { plan: 'renovation.json', of: 'windows', floor: 'loft' }
    const reply = await b.call('grid_schedule', args)
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data).toMatchObject({ count: 0, rows: [{ phase: 'demolished', count: 1, items: [{ id: 'loft-w-loft' }] }] })
    expect(reply.text).toContain('To be removed')
    const csv = await b.call('grid_schedule', { ...args, format: 'csv' })
    expect(fields(csv.text.trim().split('\n').at(-1)!)).toEqual(expect.arrayContaining(['demolished', 'To be removed']))
    const all = await b.call('grid_schedule', { plan: 'renovation.json', of: 'windows' })
    expect(reply.data?.['rows']).toMatchObject([{ marks: (all.data?.['rows'] as { marks: string[] }[]).at(-1)!.marks }])
  })

  it('separates doors of the same type by phase and defaults an unphased plan to existing', async () => {
    const args = { plan: 'replacement.json', of: 'doors' }
    const reply = await b.call('grid_schedule', args)
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data?.['count']).toBe(6)
    const rows = reply.data?.['rows'] as { key: string; phase: string; count: number }[]
    expect(rows.filter((row) => row.key === 'door:0.8x2.1')).toEqual([
      expect.objectContaining({ phase: 'existing', count: 3 }),
      expect.objectContaining({ phase: 'new', count: 1 }),
      expect.objectContaining({ phase: 'demolished', count: 1 }),
    ])
    const csv = await b.call('grid_schedule', { ...args, format: 'csv' })
    expect(csv.text).toContain(',new,')
    expect(csv.text.trim().split('\n').at(-1)).toMatch(/,demolished,To be removed$/)
    const plain = await b.call('grid_schedule', { plan: 'loft.json', of: 'doors' })
    expect((plain.data?.['rows'] as { phase: string }[]).map((row) => row.phase)).toEqual(['existing', 'existing'])
  })
})

describe('ARE-12 the room schedule', () => {
  it('gives the flat one row per room: number, name, use, area, height, floor', () => {
    const s = roomSchedule(survey(flat))
    expect(s.rows).toHaveLength(6)
    expect(s.rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6])
    for (const r of s.rows) {
      expect(r.name).not.toBe('')
      expect(r.use).not.toBeNull()
      expect(r.area).toBeGreaterThan(0)
      expect(r.height).toBeGreaterThan(0)
      expect(r.floor).toBe(s.rows[0]!.floor)
    }
    expect(s.total.area).toBeCloseTo(62.65, 6)
    expect(s.rows.reduce((a, r) => a + r.area!, 0)).toBeCloseTo(s.total.area, 9)
  })

  it('is the same whatever the order of the file', () => {
    expect(roomSchedule(survey(reversed(flat)))).toEqual(roomSchedule(survey(flat)))
    expect(roomSchedule(survey(reversed(tiny)))).toEqual(roomSchedule(survey(tiny)))
  })

  it('totals all floors of the tiny house: 25.73 m², 277 sq ft, not the main floor alone (AB-4, AU7-1)', () => {
    const s = roomSchedule(survey(tiny))
    expect(s.total.area).toBeCloseTo(25.73, 2)
    expect(Math.round(s.total.area * 10.7639104)).toBe(277)
    expect(s.floors.map((f) => f.floorName)).toEqual(['Main floor', 'Sleeping loft'])
    expect(s.floors.reduce((a, f) => a + f.area, 0)).toBeCloseTo(s.total.area, 9)
    const csv = roomScheduleCsv(s).trim().split('\n')
    const total = fields(csv[csv.length - 1]!)
    expect(total[2]).toBe('Total, all floors')
    expect(Math.round(total[5] as number)).toBe(277)
    // Numbers are bare in the CSV, so a spreadsheet reads them as numbers.
    // MSG-3: row 1 is the label, row 2 the header.
    for (const line of csv.slice(2, -3)) {
      const row = fields(line)
      expect(typeof row[0]).toBe('number')
      expect(typeof row[4]).toBe('number')
      expect(typeof row[6]).toBe('number')
    }
    expect(csv.filter((line) => line.includes('Total, Main floor') || line.includes('Total, Sleeping loft'))).toHaveLength(2)
  })

  it('fails loudly on a row it cannot write, naming the row', () => {
    const s = roomSchedule(survey(flat))
    const broken = { ...s, rows: s.rows.map((r, i) => (i === 2 ? { ...r, area: Number.NaN } : r)) }
    expect(() => roomScheduleCsv(broken)).toThrow(ScheduleRowError)
    expect(() => roomScheduleCsv(broken)).toThrow('The room schedule cannot be written: row 3 has no number for its area.')
    const nameless = { ...s, rows: s.rows.map((r, i) => (i === 0 ? { ...r, name: '' } : r)) }
    expect(() => roomScheduleCsv(nameless)).toThrow('row 1 has no name')
  })

  it('lists a room Grid could not draw with no area, and the totals say they leave it out', () => {
    const plan = { ...flat, rooms: [...flat.rooms, { id: 'ghost', name: 'Box room', boundary: ['nope-a', 'nope-b', 'nope-c'] }] }
    const s = roomSchedule(survey(plan))
    const ghost = s.rows.find((r) => r.id === 'ghost')!
    expect(ghost.area).toBeNull()
    expect(ghost.state).toBe('not-looked-at')
    expect(s.total.state.leftOut.map((r) => r.id)).toEqual(['ghost'])
    expect(roomScheduleCsv(s)).toContain(',ghost,Box room,,,,')
  })

  it('HND-2 numbers every room as the library does, and the IFC file gives each the same number', () => {
    for (const plan of [flat, tiny, reversed(tiny)]) {
      const parsed = parseFloorPlan(plan)
      const rows = roomSchedule(survey(plan)).rows.map((r) => [r.floor, r.id, r.number])
      expect(rows).toEqual(roomNumbers(parsed).map((n) => [n.floor, n.id, n.number]))
      // In the IFC a space's Name is its number and Grid_Space holds its room id (HND-2).
      const ifc = toIfc(parsed)
      const spaces = [...ifc.matchAll(/^#\d+=IFCSPACE\('[^']+',#\d+,'(\d+)',/gm)].map((m) => Number(m[1]))
      const ids = [...ifc.matchAll(/^#\d+=IFCPROPERTYSINGLEVALUE\('Id',\$,IFCIDENTIFIER\('([^']*)'\),\$\);$/gm)].map((m) => m[1])
      expect(spaces.map((n, i) => [ids[i], n])).toEqual(rows.map(([, id, n]) => [id, n]))
    }
  })

  it('HND-2 numbers only the floors asked for, from 1, as before', () => {
    const s = roomSchedule(survey(tiny), { floors: [tiny.floors![1]!.id] })
    expect(s.rows.map((r) => r.number)).toEqual(s.rows.map((_, i) => i + 1))
    expect(s.rows.map((r) => [r.floor, r.id, r.number])).toEqual(roomNumbers(parseFloorPlan(tiny), [tiny.floors![1]!.id]).map((n) => [n.floor, n.id, n.number]))
  })
})

describe('ARE-12 the opening schedule', () => {
  it('lists the flat\'s 6 doors and 1 gap once each, not 13 times, with the two rooms each joins (AC-10)', () => {
    const plan = survey(flat)
    // Room by room, every inside door is seen from both sides.
    const roomByRoom = plan.facts.floors[0]!.openings
      .filter((o) => o.type !== 'window')
      .reduce((n, o) => n + o.sides.filter((side) => typeof side === 'object').length, 0)
    expect(roomByRoom).toBe(13)
    const s = openingSchedule(plan)
    const passages = s.rows.filter((r) => r.type !== 'window')
    expect(passages).toHaveLength(7)
    expect(s.counts).toEqual({ door: 6, window: 6, opening: 1 })
    expect(new Set(s.rows.map((r) => r.id)).size).toBe(s.rows.length)
    const names = new Set(flat.rooms.map((r) => r.name))
    for (const r of passages) {
      expect(r.between).toHaveLength(2)
      expect(r.between.filter((side) => names.has(side)).length).toBeGreaterThanOrEqual(1)
    }
    expect(passages.find((r) => r.id === 'pass-kitchen-living')!.between.slice().sort()).toEqual(['Kitchen', 'Living room'].sort())
    expect(passages.find((r) => r.id === 'door-entrance')!.between).toContain('outside')
  })

  it('is the same whatever the order of the file, and its CSV has one row per opening', () => {
    expect(openingSchedule(survey(reversed(flat)))).toEqual(openingSchedule(survey(flat)))
    const csv = openingScheduleCsv(openingSchedule(survey(flat))).trim().split('\n')
    // MSG-3: the label row, the header and 13 openings.
    expect(csv).toHaveLength(2 + 13)
    expect(fields(csv[2]!).slice(4, 7).every((v) => typeof v === 'number')).toBe(true)
  })
})

describe('ARE-12 asked for through grid_schedule and on the check set', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({ 'flat.json': flat, 'tiny.json': tiny })
  })
  afterAll(() => b.close())
  const ok = async (args: Record<string, unknown>): Promise<Reply> => {
    const reply = await b.call('grid_schedule', args)
    expect(reply.isError, reply.text).toBe(false)
    return reply
  }

  it('gives the room schedule with of=rooms, in feet, with the total of all floors', async () => {
    const reply = await ok({ plan: 'tiny.json', of: 'rooms', units: 'ft' })
    expect(reply.text).toContain('All floors: 4 rooms, 277 sq ft (25.73 m²).')
    expect(reply.text).toContain('"Main floor": 3 rooms')
    expect((reply.data!['rows'] as unknown[]).length).toBe(4)
    const csv = await ok({ plan: 'tiny.json', of: 'rooms', format: 'csv' })
    expect(csv.text.split('\n').slice(0, 2)).toEqual(['"General guidance, not your local rules"', 'number,room id,name,use,area m2,area sq ft,height m,floor,state'])
  })

  it('gives each opening once with of=openings, and refuses the grouped schedule\'s filters with it', async () => {
    const reply = await ok({ plan: 'flat.json', of: 'openings' })
    expect(reply.text).toContain('In all, each counted once: 6 doors, 6 windows, 1 doorless openings.')
    expect(reply.text.split('\n').filter((line) => /^\d+\. /.test(line))).toHaveLength(13)
    const refused = await b.call('grid_schedule', { plan: 'flat.json', of: 'openings', types: ['door'] })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('of=openings takes no types')
  })

  it('puts both schedules on the check set as tables, from the same rows', () => {
    const plan = parseFloorPlan(tiny)
    const { issues, broken } = validatePlan(plan)
    const pages = sheetPages({ file: 'tiny', plan, issues, broken }, null, 'check', { name: 'tiny', date: new Date(Date.UTC(2026, 10, 22)) }).pages
    const rooms = pages.find((p) => p.title === 'Room schedule')!.table!
    expect(rooms.rows.filter((r) => /^\d+\. /.test(r.name))).toHaveLength(4)
    expect(rooms.total).toEqual({ name: 'Total, all floors', detail: '4 rooms, 277 sq ft', area: rooms.total!.area })
    expect(rooms.rows.some((r) => r.name === 'Total, Sleeping loft')).toBe(true)
    const openings = pages.find((p) => p.title === 'Door and window schedule')!.table!
    expect(openings.rows).toHaveLength(openingSchedule(surveyPlan(plan)).rows.length)
  })
})
