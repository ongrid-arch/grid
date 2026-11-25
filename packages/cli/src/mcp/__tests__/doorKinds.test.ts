/**
 * CNT-14: kinds of door and window and their handing through the tool server: the person's
 * terms in `grid_change_opening` and rooms text, the not-checked line in `grid_check`, and the
 * kinds in the schedules.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench, type Reply } from './replay/harness'

/** A hall (west) and a bedroom (east), the wall between them drawn south to north, a door in it with no swing stated. */
function twoRooms(): FloorPlan {
  const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior' = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s1', [0, 0], [3, 0]), wall('mid', [3, 0], [3, 3], 'interior'), wall('n1', [3, 3], [0, 3]), wall('w', [0, 3], [0, 0]), wall('s2', [3, 0], [6, 0]), wall('e', [6, 0], [6, 3]), wall('n2', [6, 3], [3, 3])],
    rooms: [
      { id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s1', 'mid', 'n1', 'w'] },
      { id: 'bedroom', name: 'Bedroom', use: 'bedroom', boundary: ['s2', 'e', 'n2', 'mid'] }
    ],
    openings: [
      { id: 'd', wall: 'mid', type: 'door', offset: 1, width: 0.8, sill: 0, height: 2.1 },
      { id: 'patio', wall: 'e', type: 'door', offset: 0.3, width: 2.4, sill: 0, height: 2.1 },
      { id: 'win', wall: 'n2', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 }
    ]
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': twoRooms() })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
const onDisk = (file = 'plan.json'): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(b.folder, file), 'utf8')))
const opening = (id: string, file = 'plan.json') => onDisk(file).openings.find((o) => o.id === id)!

describe('doors with no swing stated (done when 2)', () => {
  it('are listed as not checked, one line for the floor naming them', async () => {
    b.write('plan.json', twoRooms())
    const reply = await ok('grid_check', { plan: 'plan.json' })
    const lines = reply.data!['lines'] as { code: string; kind: string; message: string; also: string[] }[]
    const line = lines.find((l) => l.code === 'floor/not-checked-door-swings')!
    expect(line.kind).toBe('not-checked')
    expect(line.message).toBe('On "Ground floor", 2 doors state no swing, so whether they open clear was not checked: "d", "patio"')
    expect(line.also).toEqual(['d', 'patio'])
    // The 2.4 m patio door states no kind: asked about too.
    expect(lines.filter((l) => l.code === 'opening/wide-single-leaf').map((l) => l.message)).toEqual(['Door "patio" states no kind, so it is checked as one swinging leaf this wide and drawn as Grid\'s guess, a pair or a sliding door'])
  })
})

describe('handing in the person\'s terms through grid_change_opening (done when 2)', () => {
  it('"opens into the hall, hinged on the left" writes the wall\'s terms: the hall\'s face, the north jamb', async () => {
    b.write('plan.json', twoRooms())
    const reply = await ok('grid_change_opening', { plan: 'plan.json', opening: 'd', opens_into: 'hall', hinged: 'left' })
    // The wall runs south to north, so the hall (west) is on its left face and north is its end.
    expect(opening('d')).toMatchObject({ swing: 'left', hinge: 'end' })
    expect(reply.text).toContain('door "d" now opens into "Hall".')
    expect(reply.text).toContain('door "d" is hinged on the left as seen from "Hall".')
  })

  it('"hinged on the left as seen from the bedroom" is the south jamb', async () => {
    b.write('plan.json', twoRooms())
    await ok('grid_change_opening', { plan: 'plan.json', opening: 'd', opens_into: 'hall', hinged: 'left', seen_from: 'bedroom' })
    expect(opening('d')).toMatchObject({ swing: 'left', hinge: 'start' })
  })

  it('makes the patio door sliding: no swing needed, no question, not listed as not checked', async () => {
    b.write('plan.json', twoRooms())
    await ok('grid_change_opening', { plan: 'plan.json', opening: 'patio', kind: 'sliding' })
    expect(opening('patio').kind).toBe('sliding')
    expect(opening('patio').hinge).toBeUndefined()
    const lines = (await ok('grid_check', { plan: 'plan.json' })).data!['lines'] as { code: string; also: string[] }[]
    expect(lines.filter((l) => l.code === 'opening/wide-single-leaf')).toEqual([])
    expect(lines.find((l) => l.code === 'floor/not-checked-door-swings')!.also).toEqual(['d'])
  })

  it('refuses a kind the type does not take, and hinged on a window', async () => {
    b.write('plan.json', twoRooms())
    const garage = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'win', kind: 'garage' })
    expect(garage.isError).toBe(true)
    expect(garage.text).toContain('A window cannot be garage: a window is single, double, sliding, fixed, high-level.')
    const hinged = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'win', hinged: 'left' })
    expect(hinged.isError).toBe(true)
  })
})

describe('kinds in rooms text', () => {
  const ROOMS = [
    'walls outside 0.3 inside 0.1 height 2.6',
    'room living "Living room" living 4.4 x 4.2',
    'room hall "Hall" corridor 1.3 x 4.2 east of living',
    'door d-living between hall and living, 0.5 from south, 0.8 wide, opens into living, hinged left',
    'door d-patio in living south, centred, 2.4 wide, sliding',
    'window w-high in living west, centred, 1.2 wide, sill 1.8, height 0.5, high-level',
    'door d-front in hall north, centred, 0.9 wide, opens in, hinged east, part 0.7'
  ].join('\n')

  it('writes a sliding door with no swing guessed, a door hinged on the left as seen from the room it opens into, and reads them back', async () => {
    await ok('grid_write_rooms', { plan: 'rooms.json', rooms: ROOMS })
    const patio = opening('d-patio', 'rooms.json')
    expect(patio).toMatchObject({ kind: 'sliding' })
    expect(patio.swing).toBeUndefined()
    expect(patio.hinge).toBeUndefined()
    expect(opening('w-high', 'rooms.json').kind).toBe('high-level')
    expect(opening('d-front', 'rooms.json').opens).toEqual({ width: 0.7 })
    // Standing in the living room facing east toward the hall, the left is north.
    const plan = onDisk('rooms.json')
    const living = plan.openings.find((o) => o.id === 'd-living')!
    const wall = plan.walls.find((w) => w.id === living.wall)!
    const northEnd = wall.end[1] > wall.start[1] ? 'end' : 'start'
    expect(living.hinge).toBe(northEnd)
    const text = (await ok('grid_describe', { plan: 'rooms.json', as: 'rooms' })).text
    expect(text).toContain('wide, sliding')
    expect(text).toContain('high-level')
    expect(text).toContain('part 0.7')
  })

  it('lists the kinds, the part that opens and the handing in the opening schedule', async () => {
    await ok('grid_write_rooms', { plan: 'rooms.json', rooms: ROOMS, replace: true })
    const reply = await ok('grid_schedule', { plan: 'rooms.json', of: 'openings' })
    const rows = reply.data!['rows'] as { id: string; kind: string | null; opens: unknown; handing: string | null }[]
    const row = (id: string) => rows.find((r) => r.id === id)!
    expect(row('d-patio')).toMatchObject({ kind: 'sliding', opens: null, handing: null })
    expect(row('d-living').handing).toBe('opens into Living room, hinged on the left')
    expect(row('d-front').opens).toEqual({ width: 0.7, height: 2.1 })
    expect(reply.text).toContain('sliding door "d-patio"')
    const csv = (await ok('grid_schedule', { plan: 'rooms.json', of: 'openings', format: 'csv' })).text.split('\n')
    expect(csv[1]).toBe('number,mark,id,type,kind,width m,height m,sill m,opens width m,opens height m,handing,floor,side 1,side 2,count')
    const grouped = await ok('grid_schedule', { plan: 'rooms.json' })
    expect(grouped.text).toContain('1 × sliding door 2.40 m wide')
  })
})

describe('a kind and a handing on a curved wall (CNT-18)', () => {
  /** A round room: one wall, a whole circle of radius 3 m round (5, 5), with a door on it and no swing stated. */
  const drum = (): FloorPlan => ({
    version: '1',
    units: 'm',
    walls: [{ id: 'round', start: [8, 5], end: [8, 5], thickness: 0.2, height: 2.7, kind: 'exterior', arc: { centre: [5, 5], sweep: 360 } }],
    rooms: [{ id: 'drum', name: 'Drum', use: 'living', boundary: ['round'] }],
    openings: [{ id: 'd', wall: 'round', type: 'door', offset: 2, width: 0.9, sill: 0, height: 2.1 }]
  })

  it('hangs a door on the curve in the person\'s terms, then makes it sliding, and checks it each time', async () => {
    b.write('drum.json', drum())
    await ok('grid_change_opening', { plan: 'drum.json', opening: 'd', opens_into: 'drum', hinged: 'left' })
    // The circle turns counter-clockwise, so the room inside is on its left face.
    expect(opening('d', 'drum.json')).toMatchObject({ swing: 'left', hinge: 'end' })
    const swung = await ok('grid_check', { plan: 'drum.json' })
    const codes = (r: Reply) => (r.data!['lines'] as { code: string }[]).map((l) => l.code)
    expect(codes(swung)).not.toContain('floor/not-checked-door-swings')
    await ok('grid_change_opening', { plan: 'drum.json', opening: 'd', kind: 'sliding' })
    expect(opening('d', 'drum.json')).toMatchObject({ kind: 'sliding' })
    const slid = await ok('grid_check', { plan: 'drum.json' })
    expect(codes(slid).filter((c) => c.startsWith('opening/'))).toEqual([])
  }, 30_000)
})
