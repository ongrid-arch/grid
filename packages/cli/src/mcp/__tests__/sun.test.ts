/**
 * BRF-5: "which rooms get the sun", as a table of geometry (grid_measure what=sun). The lab's
 * two-bed flat, given a north, answers with each window wall's way and bearing, the window area
 * against the floor area and the room's depth from each window wall, every line labelled as
 * geometry and none reading as a verdict (MSG-3).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { bench, type Bench, type Reply } from './replay/harness'

const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')) as Record<string, unknown>

let b: Bench
beforeAll(() => {
  b = bench({
    // North 30° counter-clockwise from the top of the drawing: the south wall looks south-west.
    'flat-north.json': { ...flat, north: 30 },
    'flat.json': flat,
  })
})
afterAll(() => b.close())

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_measure', { what: 'sun', ...args })
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

type Wall = { wall: string; faces: string; bearing: number; windows: { id: string; area: number }[]; windowArea: number; depth: number }
type Room = { id: string; floorArea: number; windowArea: number; windowToFloor: number | null; windowWalls: Wall[] }
const rooms = (reply: Reply): Room[] => (reply.data!['answer'] as { rooms: Room[] }).rooms

describe('which rooms get the sun, as a table (grid_measure what=sun)', () => {
  it('gives the two-bed flat with a stated north a table per room: way, window area against floor area, depth', async () => {
    const reply = await ok({ plan: 'flat-north.json' })
    const table = rooms(reply)
    expect(table.map((r) => r.id)).toEqual(['living', 'kitchen', 'hall', 'bed1', 'bath', 'bed2'])
    const living = table.find((r) => r.id === 'living')!
    // 4.40 × 4.20 m inside the wall faces; 1.80 × 1.50 m south and 1.40 × 1.30 m west.
    expect(living).toMatchObject({ floorArea: 18.48, windowArea: 4.52, windowToFloor: 0.245 })
    expect(living.windowWalls).toEqual([
      { wall: 'ext-south', from: 0.15, to: 4.55, faces: 'south-west', bearing: 210, windows: [{ id: 'win-living-south', width: 1.8, height: 1.5, area: 2.7 }], windowArea: 2.7, depth: 4.2 },
      { wall: 'ext-west', from: 3.25, to: 7.45, faces: 'north-west', bearing: 300, windows: [{ id: 'win-living-west', width: 1.4, height: 1.3, area: 1.82 }], windowArea: 1.82, depth: 4.4 },
    ].map((w) => expect.objectContaining(w)))
    const bed2 = table.find((r) => r.id === 'bed2')!
    expect(bed2).toMatchObject({ floorArea: 7.2, windowArea: 1.56 })
    expect(bed2.windowWalls).toEqual([expect.objectContaining({ wall: 'ext-east', faces: 'south-east', bearing: 120, depth: 3 })])
    expect(table.find((r) => r.id === 'hall')).toMatchObject({ windowArea: 0, windowWalls: [] })
    expect(reply.data!['answer']).toMatchObject({ measures: 'geometry, not a daylight result', north: { stated: true, degrees: 30 } })

    const lines = reply.text.split('\n')
    // MSG-3's label first, then the north the directions are from, then the table.
    expect(lines[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(lines[1]).toBe('North, as the plan states it: 30° counter-clockwise from the top of the drawing (north 30).')
    expect(lines).toContain('Geometry, "Living room" ("living"): floor 18.48 m², windows 4.52 m², 24.5% of the floor area, in 2 window walls.')
    expect(lines).toContain('Geometry, "Living room" ("living"), window wall "ext-south": faces south-west (bearing 210°); windows "win-living-south" 1.80 m wide × 1.50 m high, 2.70 m²; the room runs 4.20 m deep from its inside face.')
    expect(lines).toContain('Geometry, "Hall" ("hall"): floor 5.33 m², no window in an outside wall.')
    // Every line of the table is labelled as geometry, and the rule says it is no daylight result.
    const table_ = lines.slice(2, -1)
    expect(table_.length).toBeGreaterThan(6)
    for (const line of table_) expect(line).toMatch(/^Geometry\b/)
    expect(lines[lines.length - 1]).toMatch(/^This is geometry, not a daylight or sunlight result/)
    // MSG-3: no line reads as a pass or a verdict.
    for (const line of lines) expect(approvalWords(line), line).toEqual([])
    expect(reply.text).not.toMatch(/\b(?:enough|adequate|sufficient|good|poor|well[- ]lit|daylight factor)\b/i)
  })

  it('says first that north is the top of the drawing when the plan states none', async () => {
    const reply = await ok({ plan: 'flat.json' })
    const lines = reply.text.split('\n')
    expect(lines[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(lines[1]).toMatch(/^The plan states no north, so these directions take north as the top of the drawing \(\+y\)/)
    expect(lines).toContain('Geometry, "Living room" ("living"), window wall "ext-south": faces south if the top of the drawing is north (bearing 180°); windows "win-living-south" 1.80 m wide × 1.50 m high, 2.70 m²; the room runs 4.20 m deep from its inside face.')
    expect(reply.data!['answer']).toMatchObject({ north: { stated: false, assumed: 'the top of the drawing, +y' } })
    for (const line of lines) expect(approvalWords(line), line).toEqual([])
  })

  it('answers for one room, in the units asked, and refuses what sun does not take', async () => {
    const reply = await ok({ plan: 'flat-north.json', room: 'bath', units: 'cm' })
    expect(rooms(reply).map((r) => r.id)).toEqual(['bath'])
    expect(rooms(reply)[0]).toMatchObject({ floorArea: 4.8, windowArea: 0.42, windowToFloor: 0.088 })
    expect(reply.text).toContain('Geometry, "Bathroom" ("bath"): floor 4.80 m², windows 0.42 m², 8.8% of the floor area, in 1 window wall.')
    expect(reply.text).toContain('"win-bath" 60.0 cm wide × 70.0 cm high, 0.42 m²; the room runs 300.0 cm deep from its inside face.')
    const stray = await b.call('grid_measure', { plan: 'flat-north.json', what: 'sun', wall: 'ext-east' })
    expect(stray.isError).toBe(true)
    expect(stray.text).toContain('what=sun takes room, date, until, time, hours, utc_offset, areas, not wall.')
    const unknown = await b.call('grid_measure', { plan: 'flat-north.json', what: 'sun', room: 'attic' })
    expect(unknown.isError).toBe(true)
  })
})
