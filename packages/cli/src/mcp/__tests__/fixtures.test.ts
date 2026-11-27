/**
 * CNT-12: the four answers lab entry S-18 found an items layer gives, from the plan's fixtures,
 * in the tools an agent already uses: how many of each kind (grid_schedule), the free floor in
 * each room (grid_areas), a fixture taller than its room or running into a wall (grid_check),
 * and the gap between two fixtures (grid_measure). A fixture adds no floor area and no note.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

/** An 8 × 4 m box: a kitchen 6 m wide and a bathroom 2 m wide, a door between them. */
function plan(items?: unknown[]): unknown {
  const wall = (id: string, start: number[], end: number[], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1', [0, 0], [6, 0]),
      wall('s2', [6, 0], [8, 0]),
      wall('e', [8, 0], [8, 4]),
      wall('n2', [8, 4], [6, 4]),
      wall('n1', [6, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      wall('mid', [6, 0], [6, 4], 'interior'),
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['s1', 'mid', 'n1', 'w'], use: 'kitchen' },
      { id: 'bath', name: 'Bathroom', boundary: ['s2', 'e', 'n2', 'mid'], use: 'bathroom' },
    ],
    openings: [
      { id: 'front', wall: 's1', type: 'door', offset: 0.5, width: 0.9, height: 2.1 },
      { id: 'd', wall: 'mid', type: 'door', offset: 1.6, width: 0.8, height: 2.1 },
    ],
    ...(items === undefined ? {} : { items }),
  }
}

const FIXTURES = [
  { id: 'run', kind: 'kitchen-run', at: [3, 0.4], size: [3, 0.6], height: 0.9 },
  { id: 'island', kind: 'kitchen-run', at: [3, 2.5], size: [2, 0.9], height: 0.9, label: 'Island' },
  { id: 'wc', kind: 'toilet', at: [7.575, 1], size: [0.4, 0.65], height: 0.8, turn: 90 },
  { id: 'basin', kind: 'basin', at: [7.7, 3], size: [0.5, 0.4], height: 0.85, turn: 90 },
]

let b: Bench
beforeAll(() => {
  b = bench({
    'empty.json': plan(),
    'fitted.json': plan(FIXTURES),
    'clash.json': plan([{ ...FIXTURES[0], at: [3, 0.3] }, { ...FIXTURES[1], height: 3 }]),
    // CNT-20: a table is furniture now; a piano is a kind Grid does not hold.
    'table.json': plan([{ id: 't1', kind: 'piano', at: [3, 2], size: [1.6, 0.9], height: 0.75 }]),
    // CNT-42: a fit-out's desks, counted as desks, and a rug and a chest of drawers in the front doorway.
    'office.json': plan([
      { id: 'desk1', library: 'desk', at: [2, 3.6] },
      { id: 'desk2', library: 'desk', at: [3.4, 3.6] },
      { id: 'stool', library: 'stool', at: [4.6, 2] },
      { id: 'mat', library: 'rug', at: [1, 1] },
    ]),
    'chest.json': plan([{ id: 'chest', kind: 'storage', at: [0.95, 0.45], size: [0.9, 0.5], height: 0.8 }]),
    'mat.json': plan([{ id: 'mat', kind: 'rug', at: [0.95, 0.45], size: [0.9, 0.5], height: 0.01 }]),
  })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('count by kind (grid_schedule)', () => {
  it('counts the fixtures by kind, each with the room it stands in', async () => {
    const reply = await ok('grid_schedule', { plan: 'fitted.json', types: ['fixture'] })
    expect(reply.text).toContain('Fixtures: 1 toilet, 1 basin, 2 kitchen runs.')
    expect(reply.text).toContain('Island "island" (kitchen-run), in "Kitchen"')
    expect(reply.text).not.toContain('In all:')
    // CNT-20: every kind the registry holds is counted, furniture too (CNT-52: and the points; CNT-55: and the fittings).
    expect(reply.data!['fixtureCounts']).toEqual({ toilet: 1, basin: 1, shower: 0, bath: 0, 'kitchen-run': 2, bed: 0, table: 0, chair: 0, sofa: 0, storage: 0, armchair: 0, stool: 0, desk: 0, rug: 0, plant: 0, rack: 0, generator: 0, pump: 0, tank: 0, seat: 0, pew: 0, altar: 0, 'fume-cupboard': 0, 'lab-bench': 0, 'safety-shower': 0, kennel: 0, 'exam-table': 0, 'clinical-sink': 0, equipment: 0, bidet: 0, urinal: 0, vanity: 0, 'double-basin': 0, 'towel-radiator': 0, 'shower-screen': 0, sink: 0, hob: 0, oven: 0, fridge: 0, 'tall-unit': 0, 'wall-unit': 0, range: 0, fryer: 0, 'prep-table': 0, dishwasher: 0, hood: 0, extinguisher: 0, aed: 0, 'call-point': 0, 'first-aid': 0, sensor: 0, 'desk-point': 0, spawn: 0, camera: 0, 'you-are-here': 0, 'hose-reel': 0, 'fire-door': 0, exit: 0, refuge: 0, 'assembly-point': 0 })
    const rooms = (reply.data!['fixtures'] as { id: string; room: string }[]).map((f) => [f.id, f.room])
    expect(rooms).toEqual([['run', 'kitchen'], ['island', 'kitchen'], ['wc', 'bath'], ['basin', 'bath']])
  })

  it('counts desks, a stool and a rug each as its own kind (CNT-42)', async () => {
    const reply = await ok('grid_schedule', { plan: 'office.json', types: ['fixture'] })
    expect(reply.data!['fixtureCounts']).toMatchObject({ table: 0, chair: 0, desk: 2, stool: 1, rug: 1 })
  })

  it('keeps the doors and windows schedule as it was for a plan with no fixtures', async () => {
    const reply = await ok('grid_schedule', { plan: 'empty.json' })
    expect(reply.text).not.toContain('Fixtures')
    expect(reply.data).not.toHaveProperty('fixtures')
  })
})

describe('free floor per room (grid_areas)', () => {
  it('gives each room with fixtures its free floor, and adds 0 m² to every total', async () => {
    const before = await ok('grid_areas', { plan: 'empty.json' })
    const after = await ok('grid_areas', { plan: 'fitted.json' })
    for (const key of ['net', 'grossInternal', 'grossExternal']) expect(after.data![key]).toBe(before.data![key])
    const rooms = (after.data!['floors'] as { rooms: { id: string; net: number; free?: number; fixtures?: number }[] }[])[0]!.rooms
    const kitchen = rooms.find((r) => r.id === 'kitchen')!
    expect(kitchen.fixtures).toBeCloseTo(1.8 + 1.8, 6)
    expect(kitchen.free).toBeCloseTo(kitchen.net - 3.6, 6)
    expect(after.text).toMatch(/"Kitchen" \(kitchen\): .*free floor 18\.44 m² \(fixtures stand on 3\.60 m²\)/)
    expect(after.text).toContain('Free floor is a room')
  })

  it('adds 0 m² and one note for a piano, a kind Grid does not hold', async () => {
    const before = await ok('grid_areas', { plan: 'empty.json' })
    const table = await ok('grid_areas', { plan: 'table.json' })
    expect(table.data!['net']).toBe(before.data!['net'])
    const empty = await ok('grid_check', { plan: 'empty.json' })
    const check = await ok('grid_check', { plan: 'table.json' })
    expect(check.data!['count']).toBe((empty.data!['count'] as number) + 1)
    const line = (check.data!['lines'] as { code: string; kind: string; thing: unknown }[]).find((l) => l.code === 'item/unknown-kind')!
    expect(line).toMatchObject({ kind: 'left-out', thing: { kind: 'item', id: 't1' } })
  })
})

describe('clashes (grid_check)', () => {
  it('adds no line for fixtures that stand clear', async () => {
    const empty = await ok('grid_check', { plan: 'empty.json' })
    const fitted = await ok('grid_check', { plan: 'fitted.json' })
    expect(fitted.data!['count']).toBe(empty.data!['count'])
  })

  it('names a fixture taller than its room and one that runs into a wall, by its kind', async () => {
    const reply = await ok('grid_check', { plan: 'clash.json' })
    const lines = (reply.data!['lines'] as { code: string; kind: string; message: string; floor: string }[]).filter((l) => l.code.startsWith('item/'))
    expect(lines.map((l) => [l.code, l.kind, l.floor])).toEqual([
      ['item/into-wall', 'worth-a-look', 'ground'],
      ['item/too-tall', 'worth-a-look', 'ground'],
    ])
    expect(lines[0]!.message).toBe('Kitchen run "run" runs into a wall')
    expect(lines[1]!.message).toBe('Kitchen run "island" is taller than the room it stands in')
    expect(reply.text).toContain('[item/too-tall]')
  })
})

describe('the gap between fixtures (grid_measure)', () => {
  it('measures between two fixtures edge to edge, and from a fixture to a wall', async () => {
    const gap = await ok('grid_measure', { plan: 'fitted.json', what: 'between', from: 'run', to: 'island' })
    expect((gap.data!['answer'] as { distance: number }).distance).toBeCloseTo(1.35, 9)
    expect(gap.text).toContain('From kitchen run "run" to Island "island": 1.35 m clear')
    const wall = await ok('grid_measure', { plan: 'fitted.json', what: 'between', from: 'island', to: 'n1' })
    expect((wall.data!['answer'] as { distance: number }).distance).toBeCloseTo(3.9 - 2.95, 9)
  })

  it('measures a way through a doorway a rug lies in as if it were bare, and not one a chest stands in (CNT-42)', async () => {
    const route = async (file: string): Promise<unknown> => (await ok('grid_measure', { plan: file, what: 'route', room: 'kitchen', to: 'outside', width: 0.7 })).data!['answer']
    expect(await route('mat.json')).toEqual(await route('empty.json'))
    expect(await route('chest.json')).not.toEqual(await route('empty.json'))
  })

  it('fits a box clear of the room\'s fixtures', async () => {
    const empty = await ok('grid_measure', { plan: 'empty.json', what: 'fit', room: 'kitchen', width: 5, depth: 3 })
    expect((empty.data!['answer'] as { fits: boolean }).fits).toBe(true)
    const fitted = await ok('grid_measure', { plan: 'fitted.json', what: 'fit', room: 'kitchen', width: 5, depth: 3 })
    expect((fitted.data!['answer'] as { fits: boolean; clearOf: string[] }).fits).toBe(false)
    expect((fitted.data!['answer'] as { clearOf: string[] }).clearOf).toEqual(['run', 'island'])
    expect(fitted.text).toContain('clear of its 2 fixtures')
  })
})

describe('describing the plan (grid_describe)', () => {
  it('counts the fixtures on the longer descriptions', async () => {
    const reply = await ok('grid_describe', { plan: 'fitted.json', for: 'agent' })
    expect(reply.text).toContain('Fixtures: 1 toilet, 1 basin, 2 kitchen runs.')
    const empty = await ok('grid_describe', { plan: 'empty.json', for: 'agent' })
    expect(empty.text).not.toContain('Fixtures')
  })
})

describe('mirroring the plan (grid_mirror)', () => {
  it('mirrors the fixtures with the walls, so each still stands against its wall', async () => {
    const reply = await ok('grid_mirror', { plan: 'fitted.json', how: 'left-right', out: 'mirrored.json' })
    expect(reply.text).toContain('and 4 fixtures')
    const schedule = await ok('grid_schedule', { plan: 'mirrored.json', types: ['fixture'] })
    const rooms = (schedule.data!['fixtures'] as { id: string; room: string }[]).map((f) => [f.id, f.room])
    expect(rooms).toEqual([['run', 'kitchen'], ['island', 'kitchen'], ['wc', 'bath'], ['basin', 'bath']])
    const check = await ok('grid_check', { plan: 'mirrored.json' })
    expect((check.data!['lines'] as { code: string }[]).filter((l) => l.code.startsWith('item/'))).toEqual([])
    const top = await ok('grid_mirror', { plan: 'fitted.json', how: 'top-bottom', out: 'flipped.json' })
    expect(top.isError).toBe(false)
    const flipped = await ok('grid_check', { plan: 'flipped.json' })
    expect((flipped.data!['lines'] as { code: string }[]).filter((l) => l.code.startsWith('item/'))).toEqual([])
  })
})
