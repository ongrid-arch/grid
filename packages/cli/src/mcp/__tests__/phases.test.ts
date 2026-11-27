/**
 * CNT-10: existing, demolished and new, and a fit-out on a fixed shell, through the tool server.
 * The plan is the stand-in for the lab's EL-10 (`packages/floorplan/fixtures/refurbishment.json`).
 *
 * Done when (1): the plan keeps every phase through the tools and an edit, and the comparison by
 * phase shows what is demolished (here; the drawing is `viewer/src/picture/__tests__/phases.test.ts`).
 * Done when (2): a widened door is an old opening and a new one in the same place (here, through
 * grid_change_opening, and in `floorplan/src/geometry/__tests__/phases.test.ts`).
 * Done when (3): in a fit-out on a base plan, an edit that touches a base wall is refused (CP4-4).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { refurbishmentRaw } from '@ongrid/floorplan/test-support/phases'
import { bench, type Bench, type Reply } from './replay/harness'
import { drawFile, type DrawRequest } from '../../command/draw'
import { loadPlan } from '../../command/plan'
import { openProject } from '../../fs/projectFiles'

/** A plan from the lab's rooms fixtures, as its file holds it. */
const fixturePlan = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '../../../../floorplan/fixtures/rooms', name), 'utf8'))

const SHELL = {
  version: '1',
  walls: [
    { id: 's1', start: [0, 0], end: [8, 0], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 's2', start: [8, 0], end: [8, 5], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 's3', start: [8, 5], end: [0, 5], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 's4', start: [0, 5], end: [0, 0], thickness: 0.3, height: 3, kind: 'exterior' },
  ],
  rooms: [{ id: 'shell', name: 'Shell', boundary: ['s1', 's2', 's3', 's4'] }],
  openings: [
    { id: 'entrance', wall: 's1', type: 'door', offset: 1, width: 1, height: 2.1 },
    { id: 'w1', wall: 's3', type: 'window', offset: 2, width: 1.5, sill: 0.9, height: 1.2 },
  ],
}

const FIT_OUT = {
  version: '1',
  base: 'shell.json',
  walls: [{ id: 'p1', start: [4, 0], end: [4, 5], thickness: 0.1, height: 3, kind: 'partition' }],
  rooms: [
    { id: 'front', name: 'Reception', use: 'reception', boundary: ['s1', 'p1', 's3', 's4'] },
    { id: 'back', name: 'Office', use: 'office', boundary: ['s1', 's2', 's3', 'p1'] },
  ],
  openings: [{ id: 'd1', wall: 'p1', type: 'door', offset: 2, width: 0.8, height: 2.1 }],
}

/** WRT-85: a shell with its structure and a fixture, and a fit-out on it that lists the ground floor. */
const FRAME = {
  ...SHELL,
  floors: [{ id: 'ground', name: 'Ground', level: 0, slab: 0.25, height: 2.8 }],
  columns: [
    { id: 'c1', shape: 'square', width: 0.4, at: [2, 2.5] },
    { id: 'c2', shape: 'square', width: 0.4, at: [6, 2.5] },
  ],
  grids: [{ id: 'g', origin: [0, 0], x: { spacing: [4, 4] }, y: { spacing: [5] } }],
  items: [{ id: 'breast', kind: 'storage', label: 'Chimney breast', at: [0.5, 2.5], size: [0.6, 1.2], height: 2.6 }],
}
const FRAME_FIT_OUT = { ...FIT_OUT, base: 'frame.json', floors: [{ id: 'ground', name: 'Ground floor' }] }

let b: Bench
beforeAll(() => {
  b = bench({ 'refurb.json': refurbishmentRaw(), 'shell.json': SHELL, 'fitout.json': FIT_OUT, 'frame.json': FRAME, 'framefit.json': FRAME_FIT_OUT })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

const onDisk = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as Record<string, unknown>

describe('a plan with existing, demolished and new parts (CNT-10, EL-10)', () => {
  it('compares by phase, and the comparison shows what is demolished and what is new (done when 1)', async () => {
    const reply = await ok('grid_diff', { plan: 'refurb.json', since: 'phase', picture: false })
    expect(reply.text).toContain('Compared with the plan as it stands before its work')
    const changes = (reply.data!['changes'] as { text: string }[]).map((c) => c.text)
    // What is to be demolished is what was removed; what is new, what was added.
    expect(changes).toContain('Wall "wk" removed, 5.00 m, by "Kitchen" and "Dining room"')
    expect(changes).toContain('Door removed: "d-kitchen", 0.80 m wide, in "Dining room" and "Kitchen"')
    expect(changes).toContain('Window removed: "win-south-old", 1.20 m wide, in "Living room"')
    expect(changes).toContain('Room removed: "Kitchen", 13.44 m²')
    expect(changes).toContain('Wall "wst" added, 4.00 m, by "Living room" and "Study"')
    expect(changes).toContain('Room added: "Kitchen and dining", 27.36 m²')
    // The widened door: its old opening and the new one, paired by place.
    expect(changes).toContain('Door "d-bath" width 0.70 → 0.90 m, in "Bathroom" and "Living room"')
    expect(reply.data!['since']).toEqual({ kind: 'phase', name: null, at: null, commit: null, revision: null, by: null, note: null })
    const rooms = reply.data!['rooms'] as { room: string; status: string }[]
    expect(rooms.find((r) => r.room === 'bath')?.status).toBe('unchanged')
  })

  it('returns the comparison\'s picture by phase', async () => {
    const reply = await ok('grid_diff', { plan: 'refurb.json', since: 'phase' })
    expect(reply.image).toBe(true)
  })

  it('refuses to compare by phase a plan with none', async () => {
    b.write('plain.json', { version: '1', walls: [{ id: 'a', start: [0, 0], end: [4, 0] }], rooms: [], openings: [] })
    const reply = await b.call('grid_diff', { plan: 'plain.json', since: 'phase', picture: false })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('states no phase')
  })

  it('says the check and the areas are of the building after the work', async () => {
    const check = await ok('grid_check', { plan: 'refurb.json' })
    expect(check.text).toContain('as it will be after the work')
    const areas = await ok('grid_areas', { plan: 'refurb.json' })
    const ids = (areas.data!['floors'] as { rooms: { id: string }[] }[]).flatMap((f) => f.rooms.map((r) => r.id)).sort()
    expect(ids).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(areas.data!['notes']).toContain('These areas are of the building as it will be after the work: the 3 rooms to be demolished are left out, and new rooms are in.')
    const described = await ok('grid_describe', { plan: 'refurb.json', for: 'agent', length: 'line' })
    expect(described.text).toContain('WORK existing 6 walls 5 openings 1 rooms; demolished 1 walls 3 openings 3 rooms; new 1 walls 3 openings 3 rooms; figures after the work.')
  })

  it('draws the parts to be demolished in grid_view, as grid draw does, and counts what grid_check counts (VEW-14)', async () => {
    const view = await ok('grid_view', { plan: 'refurb.json', kind: 'plan' })
    expect(view.image).toBe(true)
    // The demolished wall and doors are in the picture's boxes, not dropped with the building after the work.
    const boxes = (view.data!['boxes'] as { id: string }[]).map((box) => box.id)
    expect(boxes).toContain('wk')
    expect(boxes).toContain('d-kitchen')
    expect(boxes).toContain('win-south-old')
    // 1 wall, 3 openings and 3 rooms: the count the work line of grid_describe and grid_check give.
    expect(view.text).toContain('7 to be demolished (1 walls, 3 openings, 3 rooms)')
    const check = await ok('grid_check', { plan: 'refurb.json', full: true })
    expect(check.text).toContain('7 to be demolished')
    // A demolished id can be picked out.
    const picked = await ok('grid_view', { plan: 'refurb.json', kind: 'plan', highlight: ['wk', 'd-kitchen'] })
    expect(picked.text).toContain('Picked out 2 of the 2 asked for on this floor')
  })

  it('draws a school phased through the tools as grid draw does, with grid_check\'s count (VEW-70)', async () => {
    b.write('school.json', fixturePlan('school.plan.json'))
    await ok('grid_start_works', { plan: 'school.json' })
    await ok('grid_merge_rooms', { plan: 'school.json', room: 'c1', with: 'c2' })
    await ok('grid_set_phase', { plan: 'school.json', phase: 'demolished', parts: ['d-c3'] })
    const check = await ok('grid_check', { plan: 'school.json', full: true })
    expect(check.text).toContain('4 to be demolished')
    const view = await ok('grid_view', { plan: 'school.json', kind: 'plan', out: 'school.svg' })
    expect(view.text).toContain('4 to be demolished (1 walls, 1 openings, 2 rooms)')
    // One floor: no line about other floors.
    expect(view.text).not.toContain('on this floor')
    const dashed = (svg: string): string[] => [...svg.matchAll(/data-part="(demolished-[a-z]+)"[^>]*data-id="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`).sort()
    const viewed = readFileSync(join(b.folder, 'exports', 'school.svg'), 'utf8')
    expect(dashed(viewed)).toEqual(['demolished-opening:d-c3', 'demolished-wall:w-c1-c2'])
    expect(viewed).toContain('to be demolished')
    // grid draw draws the same dashed parts and key.
    const drawn = await drawFile(loadPlan(openProject(b.folder, b.folder, 'project'), join(b.folder, 'school.json')), { look: 'working' } as DrawRequest, 1, 'working')
    const drawnSvg = String(drawn.file)
    expect(dashed(drawnSvg)).toEqual(dashed(viewed))
    expect(drawnSvg).toContain('to be demolished')
    const picked = await ok('grid_view', { plan: 'school.json', kind: 'plan', highlight: ['w-c1-c2', 'd-c3', 'c2'] })
    expect(picked.text).toContain('Picked out 3 of the 3 asked for on this floor')
  })

  it('says which parts to be demolished are on the floor drawn, and where the others are (VEW-70)', async () => {
    b.write('house.json', fixturePlan('two-storey.plan.json'))
    await ok('grid_start_works', { plan: 'house.json' })
    await ok('grid_merge_rooms', { plan: 'house.json', room: 'f-bed', with: 'f-bath' })
    const check = await ok('grid_check', { plan: 'house.json', full: true })
    const total = /(\d+) to be demolished/.exec(check.text)![1]
    const ground = await ok('grid_view', { plan: 'house.json', kind: 'plan', floor: 'ground' })
    expect(ground.text).toContain(`${total} to be demolished`)
    expect(ground.text).toContain(`None of the ${total} to be demolished is on this floor: floor "first" has ${total}.`)
    const first = await ok('grid_view', { plan: 'house.json', kind: 'plan', floor: 'first' })
    expect(first.text).toContain(`All ${total} to be demolished are on this floor`)
    expect(first.text).toContain('"f-mid"')
  })

  it('draws a plan with no phases as before, with no line about demolition (VEW-14)', async () => {
    b.write('plain2.json', { version: '1', walls: [{ id: 'a', start: [0, 0], end: [4, 0] }], rooms: [], openings: [] })
    const view = await ok('grid_view', { plan: 'plain2.json', kind: 'plan' })
    expect(view.text).not.toContain('to be demolished')
  })

  it('costs the work as three lists: demolish, make good and new', async () => {
    const reply = await ok('grid_takeoff', { plan: 'refurb.json', for: 'change' })
    const lines = reply.data!['lines'] as { key: string; quantity: number; unit: string; list: string }[]
    const q = (key: string) => lines.find((l) => l.key === key)?.quantity
    // wk: 5 m long, 2.7 m high, less its 0.8 x 2.1 door: 13.5 - 1.68 = 11.82 m².
    expect(q('demolish:wall:interior:0.1')).toBeCloseTo(11.82, 2)
    expect(q('demolish:door:0.8x2.1')).toBe(1)
    expect(q('demolish:door:0.7x2.1')).toBe(1)
    expect(q('demolish:window:1.2x1.2')).toBe(1)
    // Floor under wk: 5 x 0.1. Both ends of wk meet walls that stay, 2.7 m high each.
    expect(q('make_good:floor')).toBeCloseTo(0.5, 3)
    expect(q('make_good:wall_end')).toBeCloseTo(5.4, 3)
    // The blocked window, 1.2 x 1.2, filled in; the old bath door lies inside the new one: no infill.
    expect(q('make_good:infill:exterior:0.3')).toBeCloseTo(1.44, 3)
    expect(q('make_good:infill:interior:0.1')).toBeUndefined()
    // Reveals of the new bath door (0.1 thick: 2 x 2.1 + 0.9) and the new window (0.3: 2 x 1.2 + 2 x 1.2).
    expect(q('make_good:reveals')).toBeCloseTo((2 * 2.1 + 0.9) * 0.1 + (2 * 1.2 + 2 * 1.2) * 0.3, 3)
    // wst: 4 m long, 2.7 high, less its door: 10.8 - 1.68 = 9.12.
    expect(q('new:wall:partition:0.1')).toBeCloseTo(9.12, 2)
    expect(q('new:door:0.9x2.1')).toBe(1)
    expect(q('new:door:0.8x2.1')).toBe(1)
    expect(q('new:window:1.2x1.2')).toBe(1)
    expect(lines.map((l) => l.list)).toEqual([...lines.map((l) => l.list)].sort((a, c) => ['demolish', 'make good', 'new'].indexOf(a) - ['demolish', 'make good', 'new'].indexOf(c)))
    expect(lines.every((l) => l.quantity > 0)).toBe(true)
    expect(reply.text).toContain('Demolish:')
    expect(reply.text).toContain('Make good:')
    expect(reply.text).toContain('New:')
    expect(reply.text).toContain('rate per')
  })

  it('prices the change from the person\'s own rates, a shorter key covering longer ones', async () => {
    b.write('rates.json', { currency: 'XTS', label: 'made-up test rates', rates: { demolish: { rate: 10, unit: 'nr' }, 'demolish:wall': { rate: 20, unit: 'm2' } } })
    const reply = await ok('grid_takeoff', { plan: 'refurb.json', for: 'change', rates: 'rates.json' })
    const cost = reply.data!['cost'] as { total: number; complete: boolean }
    // 11.82 m² at 20, and the two doors and the window to be demolished at 10 each.
    expect(cost.total).toBeCloseTo(11.82 * 20 + 3 * 10, 2)
    expect(cost.complete).toBe(false)
  })

  it('widens a door as an old opening, kept to be demolished, and a new one in its place (done when 2)', async () => {
    b.write('widen.json', refurbishmentRaw())
    const reply = await ok('grid_change_opening', { plan: 'widen.json', opening: 'd-living', width: 1.2 })
    expect(reply.text).toContain('the opening it was is kept as "d-living-before", to be demolished')
    const file = onDisk('widen.json')
    const openings = file['openings'] as { id: string; phase?: string; width: number; offset: number }[]
    const old = openings.find((o) => o.id === 'd-living-before')!
    const now = openings.find((o) => o.id === 'd-living')!
    expect([old.phase, old.width, now.phase, now.width]).toEqual(['demolished', 0.8, 'new', 1.2])
    // Every other part keeps its phase as the file stated it.
    const before = refurbishmentRaw()
    for (const list of ['walls', 'rooms'] as const) {
      expect((file[list] as { id: string; phase?: string }[]).map((p) => [p.id, p.phase])).toEqual((before[list] as { id: string; phase?: string }[]).map((p) => [p.id, p.phase]))
    }
    const check = await ok('grid_check', { plan: 'widen.json' })
    expect(check.text).not.toContain('overlap')
  })

  it('keeps a door made another kind (CNT-14) as its old self, to be demolished, beside the new one', async () => {
    b.write('kind.json', refurbishmentRaw())
    const reply = await ok('grid_change_opening', { plan: 'kind.json', opening: 'd-living', kind: 'sliding' })
    expect(reply.text).toContain('the opening it was is kept as "d-living-before", to be demolished')
    const openings = onDisk('kind.json')['openings'] as { id: string; phase?: string; kind?: string }[]
    const old = openings.find((o) => o.id === 'd-living-before')!
    const now = openings.find((o) => o.id === 'd-living')!
    expect([old.phase, old.kind, now.phase, now.kind]).toEqual(['demolished', undefined, 'new', 'sliding'])
  })

  it('keeps an opening taken out, to be demolished, and makes what an edit adds new', async () => {
    b.write('remove.json', refurbishmentRaw())
    await ok('grid_change_opening', { plan: 'remove.json', opening: 'win-east', remove: true })
    const openings = onDisk('remove.json')['openings'] as { id: string; phase?: string }[]
    expect(openings.find((o) => o.id === 'win-east')?.phase).toBe('demolished')
    const plan = parseFloorPlan(onDisk('remove.json'))
    expect(plan.openings.length).toBe(11)
  })
})

describe('a fit-out on a base plan (CNT-10, CP4-4)', () => {
  it('reads the base\'s walls as existing and draws and measures the fit-out in them', async () => {
    const areas = await ok('grid_areas', { plan: 'fitout.json' })
    const ids = (areas.data!['floors'] as { rooms: { id: string }[] }[]).flatMap((f) => f.rooms.map((r) => r.id)).sort()
    expect(ids).toEqual(['back', 'front'])
    const check = await ok('grid_check', { plan: 'fitout.json' })
    expect(check.text).toContain('fitted out in "shell.json"')
    expect(check.text).not.toMatch(/rests on|not enclosed|unclosed/)
  })

  it('refuses an edit that touches a base wall, and writes nothing (done when 3)', async () => {
    const before = readFileSync(join(b.folder, 'fitout.json'), 'utf8')
    const reply = await b.call('grid_move_room_side', { plan: 'fitout.json', room: 'back', side: 'east', by: 1 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('That change would touch the base plan "shell.json": "s2"')
    expect(reply.text).toContain('read-only')
    expect(readFileSync(join(b.folder, 'fitout.json'), 'utf8')).toBe(before)
    const door = await b.call('grid_change_opening', { plan: 'fitout.json', opening: 'entrance', width: 1.2 })
    expect(door.isError).toBe(true)
    expect(door.text).toContain('"entrance"')
    expect(readFileSync(join(b.folder, 'shell.json'), 'utf8')).toBe(`${JSON.stringify(SHELL, null, 1)}\n`)
  })

  it('makes an edit inside the shell, and never writes the base\'s parts into the fit-out', async () => {
    // WRT-18: 0.4 m, as 0.5 m would end the partition inside the shell's window.
    await ok('grid_move_room_side', { plan: 'fitout.json', room: 'front', side: 'east', by: 0.4 })
    const file = onDisk('fitout.json')
    const walls = (file['walls'] as { id: string; start: number[] }[])
    expect(walls.map((w) => w.id)).toEqual(['p1'])
    expect(walls[0]!.start).toEqual([4.4, 0])
    expect((file['openings'] as { id: string }[]).map((o) => o.id)).toEqual(['d1'])
    expect(file['base']).toBe('shell.json')
  })

  it('refuses a base whose parts share an id with the fit-out', async () => {
    b.write('clash.json', { ...FIT_OUT, walls: [...FIT_OUT.walls, { id: 's2', start: [1, 1], end: [2, 1] }] })
    const reply = await b.call('grid_check', { plan: 'clash.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('"s2"')
  })
})

describe('a base plan\'s structure, fixtures and floors in its fit-out (WRT-85)', () => {
  it('draws the base\'s columns, grid and fixtures in the fit-out and takes the columns off its rooms\' floor', async () => {
    const view = await ok('grid_view', { plan: 'framefit.json', kind: 'plan' })
    const boxes = (view.data!['boxes'] as { id: string }[]).map((box) => box.id)
    expect(boxes).toContain('breast')
    // The front room's 3.8 x 4.7 m, less column c1's 0.4 x 0.4 m.
    const areas = await ok('grid_areas', { plan: 'framefit.json' })
    const front = (areas.data!['floors'] as { rooms: { id: string; net: number }[] }[])[0]!.rooms.find((r) => r.id === 'front')
    expect(front?.net).toBeCloseTo(17.7, 6)
    const loaded = loadPlan(openProject(b.folder, b.folder, 'project'), join(b.folder, 'framefit.json'))
    expect(loaded.plan.grids?.map((g) => g.id)).toEqual(['g'])
    expect(loaded.plan.floors?.[0]).toMatchObject({ id: 'ground', name: 'Ground floor', slab: 0.25, height: 2.8 })
    expect([...loaded.base!.items]).toEqual(['breast'])
    const check = await ok('grid_check', { plan: 'framefit.json' })
    expect(check.text).toContain('fitted out in "frame.json"')
  })

  it('refuses to move or take out a base fixture, and writes nothing', async () => {
    const before = readFileSync(join(b.folder, 'framefit.json'), 'utf8')
    const moved = await b.call('grid_move_item', { plan: 'framefit.json', id: 'breast', dx: 0.2, dy: 0 })
    expect(moved.isError).toBe(true)
    expect(moved.text).toContain('That change would touch the base plan "frame.json": "breast"')
    const removed = await b.call('grid_remove_item', { plan: 'framefit.json', ids: ['breast'] })
    expect(removed.isError).toBe(true)
    expect(removed.text).toContain('"breast"')
    expect(readFileSync(join(b.folder, 'framefit.json'), 'utf8')).toBe(before)
  })

  it('writes none of the base\'s parts or floor values into the fit-out on a change inside the shell', async () => {
    await ok('grid_move_room_side', { plan: 'framefit.json', room: 'front', side: 'east', by: 0.4 })
    const file = onDisk('framefit.json')
    expect(file['columns']).toBeUndefined()
    expect(file['grids']).toBeUndefined()
    expect(file['items']).toBeUndefined()
    expect(file['floors']).toEqual([{ id: 'ground', name: 'Ground floor' }])
  })
})
