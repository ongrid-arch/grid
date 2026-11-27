/**
 * CNT-4: flats in the tool server and on the sheet. The four-flat floor's areas per flat come from
 * the list the rooms text writes (lab EL-1); a flat type placed four times, two of them mirrored,
 * gives a mix table by type; a duplex is one flat on two floors; and a plan that lists no flats
 * answers as before.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { duplexHouse } from '@ongrid/floorplan/test-support/plans'
import { flatSchedule, flatScheduleCsv, roomSchedule, roomScheduleCsv } from '../../quantities/schedule'
import { surveyPlan } from '../../quantities/survey'
import { sheetPages } from '../../sheet/pages'
import { bench, type Bench } from './replay/harness'

const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const FOUR_FLATS = readFileSync(resolve(FLOORPLAN_FIXTURES, 'rooms/four-flats.rooms'), 'utf8')
const TWO_BED = JSON.parse(readFileSync(resolve(FLOORPLAN_FIXTURES, 'two-bed-flat.json'), 'utf8')) as FloorPlan

/** One flat type placed four times, two of them mirrored (WRT-4's repeat and mirror). */
const FOUR_OF_ONE = [
  'plan "Four of one flat"',
  'walls outside 0.3 inside 0.1 height 2.7',
  'unit one flat "One bedroom" "Flat {n}"',
  '  room living "Flat {n} Living room" living 5 x 4',
  '  room bed    "Flat {n} Bedroom"     bedroom 3 x 4 east of living',
  '  door d-bed between living and bed, 1 from south, 0.8 wide',
  'end',
  'repeat one 2 east as A at 0,0',
  'repeat one 2 east as B north of A1 mirror east-west',
].join('\n')

describe('CNT-4 flats in the tool server', () => {
  let b: Bench
  beforeAll(async () => {
    b = bench({ 'duplex.json': duplexHouse(), 'flat.json': TWO_BED })
    for (const [file, rooms] of [['four.json', FOUR_FLATS], ['row.json', FOUR_OF_ONE]] as const) {
      const wrote = await b.call('grid_write_rooms', { plan: file, rooms })
      expect(wrote.isError, wrote.text).toBe(false)
    }
  })
  afterAll(() => b.close())

  it('gives the four-flat floor\'s areas per flat from the list grid_write_rooms wrote, and the common parts apart (EL-1)', async () => {
    const reply = await b.call('grid_areas', { plan: 'four.json' })
    const flats = reply.data!['flats'] as { id: string; name: string; net: number; mirrored: boolean; state: { state: string } }[]
    expect(flats.map((f) => [f.id, Number(f.net.toFixed(2)), f.mirrored, f.state.state])).toEqual([
      ['A', 68.27, false, 'proven'],
      ['B', 68.27, true, 'proven'],
      ['C', 99.23, false, 'proven'],
      ['D', 99.23, true, 'proven'],
    ])
    expect(reply.data!['notInFlats'] as number).toBeCloseTo(84.49, 2)
    expect(reply.text).toContain('Flats, as the plan lists them:')
    expect(reply.text).toContain('  "Flat A" (One bedroom; 5 rooms): 68.27 m²')
    expect(reply.text).toContain('  "Flat D" (Two bedrooms, mirrored; 6 rooms): 99.23 m²')
    // ARE-14: with the common parts' area to the party walls after it.
    expect(reply.text).toContain('  In no flat: 84.49 m²; to the party walls 95.85 m² to the inside face of the outer walls, 99.35 m² to the outside face of the outer walls.')
    expect(reply.text).toContain("A flat's area is the net area of the rooms the plan lists for it")
    const csv = await b.call('grid_areas', { plan: 'four.json', format: 'csv' })
    expect(csv.text).toContain('ground,A,Flat A,One bedroom,,,68.267,734.821,flat,proven')
  })

  it('gives a mix by type for one flat type placed four times, two of them mirrored', async () => {
    const reply = await b.call('grid_schedule', { plan: 'row.json', of: 'flats' })
    expect(reply.isError, reply.text).toBe(false)
    const mix = reply.data!['mix'] as { type: string; name: string; flats: number; mirrored: number; share: number; area: number; each: number }[]
    expect(mix).toHaveLength(1)
    expect(mix[0]).toMatchObject({ type: 'one', name: 'One bedroom', flats: 4, mirrored: 2, share: 1 })
    expect(mix[0]!.area).toBeCloseTo(128, 6)
    expect(mix[0]!.each).toBeCloseTo(32, 6)
    const rows = reply.data!['rows'] as { number: number; id: string; mirrored: boolean; rooms: number; bedrooms: number }[]
    expect(rows.map((r) => [r.number, r.id, r.mirrored, r.rooms, r.bedrooms])).toEqual([
      [1, 'A1', false, 2, 1],
      [2, 'A2', false, 2, 1],
      [3, 'B1', true, 2, 1],
      [4, 'B2', true, 2, 1],
    ])
    expect(reply.text).toContain('Mix by type:\n  "One bedroom": 4 flats (2 mirrored), 1 bedroom each, 100.0% of the flats, 128.00 m², 32.00 m² each on average')
    const csv = (await b.call('grid_schedule', { plan: 'row.json', of: 'flats', format: 'csv' })).text.split('\n')
    expect(csv[0]).toBe('row,number,id,name,type,mirrored,floors,rooms,bedrooms,flats,mirrored flats,area m2,area sq ft,state')
    expect(csv.find((line) => line.startsWith('mix,'))).toMatch(/^mix,,one,One bedroom,One bedroom,,,,1,4,2,128,/)
  })

  it('gives the mix of the four-flat floor by its two types, and each room\'s flat in the room schedule', async () => {
    const reply = await b.call('grid_schedule', { plan: 'four.json', of: 'flats' })
    const mix = reply.data!['mix'] as { type: string; flats: number; mirrored: number }[]
    expect(mix.map((m) => [m.type, m.flats, m.mirrored])).toEqual([['flat1', 2, 1], ['flat2', 2, 1]])
    const rooms = await b.call('grid_schedule', { plan: 'four.json', of: 'rooms' })
    const rows = rooms.data!['rows'] as { id: string; flat: string | null }[]
    expect(rows.find((r) => r.id === 'bed2-C')!.flat).toBe('C')
    expect(rows.find((r) => r.id === 'corridor')!.flat).toBeNull()
    expect(rooms.text).toContain(', flat "Flat C"')
    expect(rooms.text).toContain(', in no flat')
  })

  it('takes a duplex as one flat on two floors, in the schedule and the mix', async () => {
    const reply = await b.call('grid_schedule', { plan: 'duplex.json', of: 'flats' })
    const rows = reply.data!['rows'] as { id: string; floors: string[]; rooms: number }[]
    expect(rows.map((r) => [r.id, r.floors, r.rooms])).toEqual([
      ['D1', ['Ground floor', 'First floor'], 4],
      ['S1', ['Ground floor'], 2],
    ])
    expect(reply.text).toContain('"Duplex 1" (Two-storey flat), "Ground floor" and "First floor": 4 rooms')
    const areas = await b.call('grid_areas', { plan: 'duplex.json' })
    expect(areas.text).toMatch(/"Duplex 1" \(Two-storey flat; 4 rooms\): [\d.]+ m², on 2 floors \("ground" [\d.]+ m², "first" [\d.]+ m²\)/)
    const check = await b.call('grid_check', { plan: 'duplex.json' })
    // No fault of the list; CNT-6 says the studio, entered only through the duplex's hall, has no front door.
    expect(check.text).not.toMatch(/flat\/(?!no-front-door)/)
    expect(check.text).toContain('flat/no-front-door')
  })

  it('carries a door\'s and a window\'s kind and part into every flat placed, and schedules both the flats and the kinds (CNT-14)', async () => {
    const rooms = [
      'plan "Two flats with kinds"',
      'walls outside 0.3 inside 0.1 height 2.7',
      'unit one flat "One bedroom" "Flat {n}"',
      '  room living "Flat {n} Living room" living 5 x 4',
      '  room bed    "Flat {n} Bedroom"     bedroom 3 x 4 east of living',
      '  door d-bed between living and bed, 1 from south, 0.8 wide, pocket',
      '  window w-liv in living south, centred, 1.8 wide, double, part 0.6',
      'end',
      'repeat one 2 east as A at 0,0',
    ].join('\n')
    const wrote = await b.call('grid_write_rooms', { plan: 'kinds.json', rooms })
    expect(wrote.isError, wrote.text).toBe(false)
    const flats = await b.call('grid_schedule', { plan: 'kinds.json', of: 'flats' })
    expect((flats.data!['rows'] as { id: string }[]).map((r) => r.id)).toEqual(['A1', 'A2'])
    const openings = await b.call('grid_schedule', { plan: 'kinds.json', of: 'openings' })
    const rows = openings.data!['rows'] as { id: string; type: string; kind: string | null; opens: { width: number } | null }[]
    expect(rows.filter((r) => r.type === 'door').map((r) => r.kind)).toEqual(['pocket', 'pocket'])
    expect(rows.filter((r) => r.type === 'window').map((r) => [r.kind, r.opens?.width])).toEqual([['double', 0.6], ['double', 0.6]])
    expect(openings.text).toContain('pocket door')
    const grouped = await b.call('grid_schedule', { plan: 'kinds.json' })
    expect(grouped.text).toContain('2 × pocket door')
  })

  it('answers as before on a plan that lists no flats', async () => {
    const areas = await b.call('grid_areas', { plan: 'flat.json' })
    expect(Object.hasOwn(areas.data!, 'flats')).toBe(false)
    expect(areas.text).not.toContain('Flats')
    const rooms = await b.call('grid_schedule', { plan: 'flat.json', of: 'rooms' })
    expect((rooms.data!['rows'] as Record<string, unknown>[]).every((r) => !Object.hasOwn(r, 'flat'))).toBe(true)
    const flats = await b.call('grid_schedule', { plan: 'flat.json', of: 'flats' })
    expect(flats.isError).toBe(false)
    expect(flats.text).toContain('The plan lists no flats')
  })
})

describe('CNT-4 flats on the check set and in the CSV', () => {
  it('ends the check set with the flat schedule and the mix, from the same rows', () => {
    const plan = parseFloorPlan(duplexHouse())
    const { issues, broken } = validatePlan(plan)
    const pages = sheetPages({ file: 'duplex', plan, issues, broken }, null, 'check', { name: 'duplex', date: new Date(Date.UTC(2026, 10, 22)) }).pages
    const page = pages.find((p) => p.title === 'Flat schedule')!
    const schedule = flatSchedule(surveyPlan(plan))
    expect(page.table!.rows.map((r) => r.name)).toEqual(['1. Duplex 1', '2. Studio 1', 'In no flat'])
    expect(page.table!.total!.detail).toBe('2 flats')
    expect(page.notes[0]).toBe(`Mix by type. ${schedule.mix.map((m) => `${m.name}: 1 flat, ${m.area.toFixed(1)} m² in all.`).join(' ')}`)
    expect(pages.at(-1)!.title).toBe('Flat schedule')
    // A plan with no flats has no such page.
    const two = parseFloorPlan(TWO_BED)
    const plain = sheetPages({ file: 'flat', plan: two, ...validatePlan(two) }, null, 'check', { name: 'flat', date: new Date(Date.UTC(2026, 10, 22)) }).pages
    expect(plain.some((p) => p.title === 'Flat schedule')).toBe(false)
  })

  it('adds a flat column to the room schedule CSV only on a plan that lists flats', () => {
    const header = (plan: unknown): string => roomScheduleCsv(roomSchedule(surveyPlan(parseFloorPlan(plan)))).split('\n')[0]!
    expect(header(duplexHouse())).toBe('number,room id,name,use,area m2,area sq ft,height m,floor,state,flat')
    expect(header(TWO_BED)).toBe('number,room id,name,use,area m2,area sq ft,height m,floor,state')
    expect(flatScheduleCsv(flatSchedule(surveyPlan(parseFloorPlan(duplexHouse())))).split('\n')[1]).toMatch(/^flat,1,D1,Duplex 1,Two-storey flat,no,Ground floor; First floor,4,0,,,/)
  })
})
