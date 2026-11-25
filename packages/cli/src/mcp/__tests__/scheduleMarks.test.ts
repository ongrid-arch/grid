/**
 * ARE-15: the unit mix, the door and window schedules by type, and the marks that tie the drawing
 * to the schedules' rows (lab AR-7, CP2-4). The four-flat floor's mix counts its flats by type and
 * totals their areas; the door schedule groups doors by kind and size; every mark on the drawing
 * has one row and every row one mark; and an edit keeps each part's mark.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planFloors, validatePlan } from '@ongrid/floorplan/geometry'
import { duplexHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { pictureToSvg, planPicture } from '@ongrid/viewer/src/picture'
import { openingSchedule, openingTypeSchedule, openingTypeScheduleCsv, roomSchedule, scheduleMarkLabels } from '../../quantities/schedule'
import { surveyPlan } from '../../quantities/survey'
import { sheetPages } from '../../sheet/pages'
import { bench, type Bench, type Reply } from './replay/harness'

const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const FIXTURES = resolve(__dirname, '../../../fixtures')
const FOUR_FLATS = readFileSync(resolve(FLOORPLAN_FIXTURES, 'rooms/four-flats.rooms'), 'utf8')
const raw = (file: string): FloorPlan => JSON.parse(readFileSync(file, 'utf8')) as FloorPlan
const TWO_BED = raw(resolve(FLOORPLAN_FIXTURES, 'two-bed-flat.json'))
const TINY = raw(resolve(FIXTURES, 'tiny-loft.json'))

/** The two-bed flat with its living room's door a sliding one: the same size as three others, another kind. */
const withSliding = (): FloorPlan => ({ ...TWO_BED, openings: TWO_BED.openings.map((o) => (o.id === 'door-living' ? { ...o, kind: 'sliding' as const } : o)) })

let b: Bench
beforeAll(async () => {
  b = bench({ 'flat.json': TWO_BED, 'sliding.json': withSliding() })
  const wrote = await b.call('grid_write_rooms', { plan: 'four.json', rooms: FOUR_FLATS })
  expect(wrote.isError, wrote.text).toBe(false)
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
const onDisk = (file: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(b.folder, file), 'utf8')))

/** Every schedule mark drawn on each floor, as `of:id:mark`, read from the SVG. */
function drawnMarks(plan: FloorPlan): Map<string, string[]> {
  const labels = scheduleMarkLabels(surveyPlan(plan))
  const out = new Map<string, string[]>()
  for (const floor of planFloors(plan)) {
    const svg = pictureToSvg(planPicture(plan, { floor: floor.id, marks: { schedule: labels } }))
    const marks = [...svg.matchAll(/data-part="schedule-mark" data-of="(room|opening)" data-id="([^"]+)" data-mark="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}`)
    out.set(floor.id, marks)
  }
  return out
}

/** Every row of the room and opening schedules on each floor, as `of:id:mark`. */
function scheduleRows(plan: FloorPlan): Map<string, string[]> {
  const survey = surveyPlan(plan)
  const out = new Map<string, string[]>()
  for (const floor of planFloors(plan)) {
    const rooms = roomSchedule(survey, { floors: [floor.id] }).rows.map((r) => `room:${r.id}:${r.mark}`)
    const openings = openingSchedule(survey, { floors: [floor.id] }).rows.map((r) => `opening:${r.id}:${r.mark}`)
    out.set(floor.id, [...rooms, ...openings])
  }
  return out
}

describe('ARE-15 the unit mix (done when 1)', () => {
  it('counts the four-flat floor\'s flats by type and totals their areas', async () => {
    const reply = await ok('grid_schedule', { plan: 'four.json', of: 'flats' })
    const mix = reply.data!['mix'] as { type: string; name: string; flats: number; mirrored: number; bedrooms: number | null; area: number; each: number }[]
    expect(mix.map((m) => [m.type, m.name, m.flats, m.mirrored, m.bedrooms])).toEqual([
      ['flat1', 'One bedroom', 2, 1, 1],
      ['flat2', 'Two bedrooms', 2, 1, 2],
    ])
    expect(mix[0]!.area).toBeCloseTo(2 * 68.2671, 1)
    expect(mix[1]!.area).toBeCloseTo(2 * 99.2313, 1)
    const total = reply.data!['total'] as { flats: number; area: number }
    expect(total.flats).toBe(4)
    expect(total.area).toBeCloseTo(mix[0]!.area + mix[1]!.area, 1)
    expect(reply.text).toContain('Mix by type:\n  "One bedroom": 2 flats (1 mirrored), 1 bedroom each, 50.0% of the flats, 136.53 m²')
    expect(reply.text).toContain('  "Two bedrooms": 2 flats (1 mirrored), 2 bedrooms each, 50.0% of the flats, 198.46 m²')
    expect(reply.text).toContain('All flats: 4 flats, 335.00 m². In no flat: 84.49 m².')
  })
})

describe('ARE-15 the door and window schedules by type (done when 2)', () => {
  it('groups the doors by kind and size, each type with its marks', () => {
    const doors = openingTypeSchedule(surveyPlan(parseFloorPlan(withSliding())), 'door')
    expect(doors.rows.map((r) => [r.key, r.kind, r.width, r.count, r.marks])).toEqual([
      ['door:0.7x2.1', null, 0.7, 1, ['D1']],
      ['door:0.8x2.1', null, 0.8, 3, ['D2', 'D3', 'D5']],
      ['door:0.9x2.1', null, 0.9, 1, ['D4']],
      ['door:sliding:0.8x2.1', 'sliding', 0.8, 1, ['D6']],
    ])
    expect(doors.count).toBe(6)
    expect(doors.rows.every((r) => r.basis === 'kind-and-size')).toBe(true)
    // The marks are the opening schedule's: D6 is the living room's door.
    expect(openingSchedule(surveyPlan(parseFloorPlan(withSliding()))).rows.find((r) => r.mark === 'D6')!.id).toBe('door-living')
  })

  it('groups the windows by kind and size, with their sills', () => {
    const windows = openingTypeSchedule(surveyPlan(parseFloorPlan(TWO_BED)), 'window')
    expect(windows.rows.map((r) => [r.key, r.marks, r.sills])).toEqual([
      ['window:0.6x0.7', ['W1'], [1.4]],
      ['window:1.2x1.1', ['W4'], [1]],
      ['window:1.2x1.3', ['W3'], [0.9]],
      ['window:1.4x1.3', ['W2', 'W6'], [0.9]],
      ['window:1.8x1.5', ['W5'], [0.6]],
    ])
  })

  it('answers of=doors and of=windows as text and CSV', async () => {
    const doors = await ok('grid_schedule', { plan: 'sliding.json', of: 'doors' })
    expect(doors.text).toContain('Door schedule by type, 6 doors of 4 types:')
    expect(doors.text).toContain('2. 3 × door 0.80 m wide × 2.10 m high (type door:0.8x2.1): D2, D3, D5')
    expect(doors.text).toContain('4. 1 × sliding door 0.80 m wide × 2.10 m high (type door:sliding:0.8x2.1): D6')
    const csv = (await ok('grid_schedule', { plan: 'sliding.json', of: 'doors', format: 'csv' })).text.split('\n')
    expect(csv[1]).toBe('number,type,kind,width m,height m,opens width m,opens height m,count,marks')
    expect(csv[3]).toBe('2,door:0.8x2.1,,0.8,2.1,,,3,D2; D3; D5')
    const windows = await ok('grid_schedule', { plan: 'flat.json', of: 'windows', format: 'csv' })
    expect(windows.text.split('\n')[1]).toBe('number,type,kind,width m,height m,opens width m,opens height m,sill m,count,marks')
    expect(openingTypeScheduleCsv(openingTypeSchedule(surveyPlan(parseFloorPlan(TWO_BED)), 'window'))).toContain('4,window:1.4x1.3,,1.4,1.3,,,0.9,2,W2; W6')
  })

  it('gives each opening its mark in the opening schedule, the same when one floor is asked for', async () => {
    const house = parseFloorPlan(twoFloorHouse())
    const whole = openingSchedule(surveyPlan(house)).rows
    for (const floor of planFloors(house)) {
      for (const row of openingSchedule(surveyPlan(house), { floors: [floor.id] }).rows) expect(row.mark).toBe(whole.find((r) => r.id === row.id)!.mark)
    }
    const reply = await ok('grid_schedule', { plan: 'flat.json', of: 'openings' })
    expect(reply.text).toContain('1. D1 door "door-bath"')
    const csv = (await ok('grid_schedule', { plan: 'flat.json', of: 'openings', format: 'csv' })).text.split('\n')
    expect(csv[1]!.startsWith('number,mark,id,type,')).toBe(true)
  })
})

describe('ARE-15 the marks on the drawing (done when 3)', () => {
  it.each([
    ['the two-bed flat', () => TWO_BED],
    ['the two-floor house', () => twoFloorHouse()],
    ['the duplex', () => duplexHouse()],
    ['the tiny house with a loft', () => TINY],
  ])('has one row for every mark and one mark for every row: %s', (_name, make) => {
    const plan = parseFloorPlan(make())
    const drawn = drawnMarks(plan)
    const rows = scheduleRows(plan)
    for (const [floor, marks] of drawn) {
      expect(new Set(marks).size, floor).toBe(marks.length)
      expect([...marks].sort(), floor).toEqual([...rows.get(floor)!].sort())
    }
    // And every mark is used once across the plan.
    const all = [...drawn.values()].flat().map((m) => m.split(':')[0] + ':' + m.split(':')[2])
    expect(new Set(all).size).toBe(all.length)
  })

  it('has one row for every mark on the four-flat floor', () => {
    const plan = onDisk('four.json')
    const drawn = drawnMarks(plan)
    const rows = scheduleRows(plan)
    for (const [floor, marks] of drawn) expect([...marks].sort(), floor).toEqual([...rows.get(floor)!].sort())
    expect([...drawn.values()].flat().length).toBe(roomSchedule(surveyPlan(plan)).rows.length + openingSchedule(surveyPlan(plan)).rows.length)
  })

  it('draws nothing new unless the schedule marks are asked for', () => {
    const plan = parseFloorPlan(TWO_BED)
    expect(pictureToSvg(planPicture(plan, {}))).not.toContain('schedule-mark')
    expect(pictureToSvg(planPicture(plan, { marks: { levels: true } }))).not.toContain('schedule-mark')
  })

  it('is asked for by grid_view with marks schedule', async () => {
    const reply = await ok('grid_view', { plan: 'flat.json', kind: 'plan', marks: ['schedule'] })
    expect(reply.text).toContain('each room\'s and opening\'s mark in the schedules')
    expect(reply.image).toBeDefined()
  })

  it('puts the marks on the check set\'s floor drawings, the openings by mark in its schedule, and a page of types', () => {
    const plan = parseFloorPlan(withSliding())
    const { issues, broken } = validatePlan(plan)
    const sheet = sheetPages({ file: 'sliding.json', plan, issues, broken }, null, 'check', { name: 'Flat', date: new Date(Date.UTC(2026, 10, 22)) })
    const floor = sheet.pages.find((p) => p.kind === 'floor')!
    expect(floor.picture?.kind === 'plan' && floor.picture.marks?.openings.get('door-living')).toBe('D6')
    const openings = sheet.pages.find((p) => p.title === 'Door and window schedule')!
    expect(openings.table!.rows[0]!.name).toBe('D1 door door-bath')
    const types = sheet.pages.find((p) => p.title === 'Door and window types')!
    expect(types.table!.rows.map((r) => [r.name.split(' ')[0], r.area])).toEqual([['1.', '1'], ['2.', '3'], ['3.', '1'], ['4.', '1'], ['5.', '1'], ['6.', '1'], ['7.', '1'], ['8.', '2'], ['9.', '1']])
    expect(types.table!.rows[1]!.detail).toContain('marks D2, D3, D5')
    expect(types.table!.total!.area).toBe('12')
  })
})

describe('ARE-15 marks kept through an edit', () => {
  it('keeps every mark when a room grows and a door changes kind', async () => {
    const before = scheduleMarkLabels(surveyPlan(onDisk('flat.json')))
    await ok('grid_move_room_side', { plan: 'flat.json', room: 'bed2', side: 'north', by: 0.3, out: 'moved.json' })
    await ok('grid_change_opening', { plan: 'moved.json', opening: 'door-bed2', kind: 'sliding' })
    const after = scheduleMarkLabels(surveyPlan(onDisk('moved.json')))
    expect([...after.rooms]).toEqual([...before.rooms])
    expect([...after.openings]).toEqual([...before.openings])
    // The drawing of the edited plan still has one row for every mark.
    const plan = onDisk('moved.json')
    for (const [floor, marks] of drawnMarks(plan)) expect([...marks].sort(), floor).toEqual([...scheduleRows(plan).get(floor)!].sort())
  })
})
