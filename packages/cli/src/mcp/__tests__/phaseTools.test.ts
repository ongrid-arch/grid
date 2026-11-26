/**
 * WRT-73: phases set without hand-editing the file: the plan as it stands marked existing, parts
 * marked by id or by room, one plan from a before and an after, a correction that is not work,
 * and a mirror that keeps its north.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runEdit } from '../../command/edit'
import { GRID_TOOLS } from '../serveTools'
import { bench, type Bench } from './replay/harness'

type Part = { id: string; phase?: string; start?: number[]; end?: number[]; wall?: string; boundary?: string[] }
type PlanFile = { north?: number; walls: Part[]; rooms: Part[]; openings: Part[] }

const wall = (id: string, start: number[], end: number[], kind = 'exterior', thickness = 0.3) => ({ id, start, end, thickness, height: 2.7, kind })

/** Two rooms side by side, 8 by 5 m between centre lines, split at x = 4; no phase stated. */
function twoRooms(): { walls: Part[]; rooms: Part[]; openings: Part[] } {
  return {
    walls: [
      wall('n1', [0, 5], [4, 5]), wall('n2', [4, 5], [8, 5]), wall('e', [8, 5], [8, 0]),
      wall('s2', [8, 0], [4, 0]), wall('s1', [4, 0], [0, 0]), wall('west', [0, 0], [0, 5]),
      wall('mid', [4, 0], [4, 5], 'interior', 0.1),
    ],
    rooms: [
      { id: 'living', name: 'Living room', use: 'living', boundary: ['s1', 'mid', 'n1', 'west'] } as Part,
      { id: 'kitchen', name: 'Kitchen', use: 'kitchen', boundary: ['s2', 'e', 'n2', 'mid'] } as Part,
    ],
    openings: [
      { id: 'front', wall: 's1', type: 'door', offset: 1, width: 0.9, height: 2.1 } as Part,
      { id: 'd-mid', wall: 'mid', type: 'door', offset: 2, width: 0.8, height: 2.1 } as Part,
    ],
  }
}
const PLAN = { version: '1', north: 30, ...twoRooms() }

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

const onDisk = (file: string): PlanFile => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as PlanFile
const phases = (parts: Part[]): Record<string, string | undefined> => Object.fromEntries(parts.map((p) => [p.id, p.phase]))
async function ok(name: string, args: Record<string, unknown>) {
  const reply = await b.call(name, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('grid_start_works', () => {
  it('marks every part existing, and says so when there is nothing left to mark', async () => {
    b.write('s.json', PLAN)
    const reply = await ok('grid_start_works', { plan: 's.json' })
    expect(reply.text).toContain('Marked 7 walls, 2 doors or windows and 2 rooms as existing')
    const file = onDisk('s.json')
    for (const part of [...file.walls, ...file.openings, ...file.rooms]) expect(part.phase, part.id).toBe('existing')
    const again = await ok('grid_start_works', { plan: 's.json' })
    expect(again.text).toContain('already states a phase, so nothing was marked')
  })

  it('makes the next edit the work', async () => {
    b.write('w.json', PLAN)
    await ok('grid_start_works', { plan: 'w.json' })
    await ok('grid_merge_rooms', { plan: 'w.json', room: 'living', with: 'kitchen', use: 'living' })
    const file = onDisk('w.json')
    expect(phases(file.walls)['mid']).toBe('demolished')
    expect(phases(file.rooms)['living']).toBe('new')
  })

  it('keeps a phase a part already states', async () => {
    b.write('k.json', { ...PLAN, openings: PLAN.openings.map((o) => (o.id === 'd-mid' ? { ...o, phase: 'demolished' } : o)) })
    const reply = await ok('grid_start_works', { plan: 'k.json' })
    expect(reply.text).toContain('1 part already stated a phase and kept it')
    expect(phases(onDisk('k.json').openings)['d-mid']).toBe('demolished')
  })
})

describe('grid_start_works on a plan part marked already', () => {
  it('leaves a door with no phase to go with its wall when the wall states demolished', async () => {
    // The old garage wall is marked to go; the door in it states nothing, so it goes with its wall.
    const walls = [...PLAN.walls, { ...wall('spur', [8, 0], [10, 0], 'exterior', 0.3), phase: 'demolished' }]
    b.write('sp.json', { ...PLAN, walls, openings: [...PLAN.openings, { id: 'shed-door', wall: 'spur', type: 'door', offset: 0.5, width: 0.9, height: 2.1 }] })
    await ok('grid_start_works', { plan: 'sp.json' })
    const file = onDisk('sp.json')
    expect(phases(file.openings)['shed-door']).toBeUndefined()
    expect(phases(file.walls)).toMatchObject({ spur: 'demolished', mid: 'existing' })
  })
})

describe('grid_set_phase', () => {
  it('marks parts by id, and refuses an id the plan has not', async () => {
    b.write('p.json', PLAN)
    await ok('grid_start_works', { plan: 'p.json' })
    // The kitchen goes: its room and the walls round it that no other room uses, named one by one.
    const reply = await ok('grid_set_phase', { plan: 'p.json', phase: 'demolished', parts: ['kitchen', 'e', 'n2', 's2'] })
    expect(reply.text).toContain('as to be demolished')
    expect(phases(onDisk('p.json').walls)).toMatchObject({ e: 'demolished', n2: 'demolished', s2: 'demolished', mid: 'existing' })
    expect(phases(onDisk('p.json').rooms)).toMatchObject({ kitchen: 'demolished', living: 'existing' })
    const refused = await b.call('grid_set_phase', { plan: 'p.json', phase: 'new', parts: ['nope'] })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('"nope"')
  })

  it('keeps a door to be demolished when its wall is named existing by id', async () => {
    b.write('x.json', PLAN)
    await ok('grid_start_works', { plan: 'x.json' })
    await ok('grid_set_phase', { plan: 'x.json', phase: 'demolished', parts: ['d-mid'] })
    await ok('grid_set_phase', { plan: 'x.json', phase: 'existing', parts: ['mid'] })
    expect(phases(onDisk('x.json').openings)['d-mid']).toBe('demolished')
  })

  it('marks a room with the walls only it uses, leaving a shared wall and naming it', async () => {
    b.write('r.json', PLAN)
    await ok('grid_start_works', { plan: 'r.json' })
    // Demolishing the kitchen would leave the living room's wall "mid" standing; its own walls go with it and the door in them.
    const reply = await b.call('grid_set_phase', { plan: 'r.json', phase: 'demolished', rooms: ['kitchen'] })
    expect(reply.text).toContain('Left as they are')
    expect(reply.text).toContain('wall "mid" (room "living" stands against it too)')
    expect(reply.isError, reply.text).toBe(false)
    const file = onDisk('r.json')
    expect(phases(file.rooms)['kitchen']).toBe('demolished')
    expect(phases(file.walls)).toMatchObject({ e: 'demolished', mid: 'existing' })
  })

  it('refuses a mark that leaves a room round a wall that is gone, and writes nothing', async () => {
    b.write('c.json', PLAN)
    await ok('grid_start_works', { plan: 'c.json' })
    const refused = await b.call('grid_set_phase', { plan: 'c.json', phase: 'demolished', parts: ['west'] })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('nothing was written')
    expect(phases(onDisk('c.json').walls)['west']).toBe('existing')
  })
})

describe('grid_phase_from', () => {
  it('writes one plan from two: existing, demolished, new, and the old self of what changed', async () => {
    const before = { version: '1', ...twoRooms() }
    // After: the wall between is gone, one room; the front door is wider; a new window on the north.
    const after = {
      version: '1',
      walls: before.walls.filter((w) => w.id !== 'mid'),
      rooms: [{ id: 'living', name: 'Living room', use: 'living', boundary: ['s1', 's2', 'e', 'n2', 'n1', 'west'] }],
      openings: [{ id: 'front', wall: 's1', type: 'door', offset: 1, width: 1.2, height: 2.1 }, { id: 'win', wall: 'n1', type: 'window', offset: 1, width: 1, height: 1.2, sill: 0.9 }],
    }
    b.write('before.json', before)
    b.write('after.json', after)
    const reply = await ok('grid_phase_from', { before: 'before.json', after: 'after.json', out: 'works.json' })
    expect(reply.text).toContain('Wrote one plan from the two')
    const file = onDisk('works.json')
    expect(phases(file.walls)).toMatchObject({ n1: 'existing', n2: 'existing', mid: 'demolished' })
    expect(phases(file.openings)).toMatchObject({ front: 'new', 'front-before': 'demolished', win: 'new', 'd-mid': 'demolished' })
    expect(phases(file.rooms)).toMatchObject({ living: 'new', 'living-before': 'demolished', kitchen: 'demolished' })
    // The plans themselves are not changed, and the result reads: grid_check has no phase clash.
    expect(onDisk('before.json').walls.some((w) => w.phase !== undefined)).toBe(false)
    const check = await ok('grid_check', { plan: 'works.json', full: true })
    for (const code of ['opening/phase-wall', 'room/phase-wall']) expect(check.text).not.toContain(code)
  })

  it('keeps a changed wall as its old self beside it, with the doors on each', async () => {
    const before = { version: '1', ...twoRooms() }
    const after = { version: '1', ...twoRooms() }
    after.walls = after.walls.map((w) => (w.id === 'mid' ? { ...w, thickness: 0.2 } : w))
    b.write('b2.json', before)
    b.write('a2.json', after)
    await ok('grid_phase_from', { before: 'b2.json', after: 'a2.json', out: 'w2.json' })
    const file = onDisk('w2.json')
    expect(phases(file.walls)).toMatchObject({ mid: 'new', 'mid-before': 'demolished' })
    expect(file.openings.find((o) => o.id === 'd-mid-before')?.wall).toBe('mid-before')
    expect(file.openings.find((o) => o.id === 'd-mid')?.wall).toBe('mid')
  })

  it('does not write over either of the two plans', async () => {
    b.write('b3.json', { version: '1', ...twoRooms() })
    b.write('a3.json', { version: '1', ...twoRooms() })
    for (const out of ['b3.json', './a3.json']) {
      const refused = await b.call('grid_phase_from', { before: 'b3.json', after: 'a3.json', out })
      expect(refused.isError, out).toBe(true)
      expect(refused.text).toContain('Nothing was written')
    }
    expect(onDisk('a3.json').walls.some((w) => w.phase !== undefined)).toBe(false)
  })

  it('refuses plans that state phases already, and writes nothing', async () => {
    b.write('phased.json', { version: '1', ...twoRooms(), walls: twoRooms().walls.map((w) => ({ ...w, phase: 'existing' })) })
    const refused = await b.call('grid_phase_from', { before: 'phased.json', after: 'phased.json', out: 'no.json' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('already states phases')
  })
})

describe('a correction and a mirror that keeps north', () => {
  it('fixes the survey in place with correction, and makes work without it', async () => {
    b.write('f.json', PLAN)
    await ok('grid_start_works', { plan: 'f.json' })
    b.write('g.json', onDisk('f.json'))
    await ok('grid_move_room_side', { plan: 'f.json', room: 'kitchen', side: 'east', by: 0.5, correction: true })
    const fixed = onDisk('f.json')
    expect(fixed.walls.every((w) => w.phase === 'existing')).toBe(true)
    expect(fixed.walls.length).toBe(PLAN.walls.length)
    await ok('grid_move_room_side', { plan: 'g.json', room: 'kitchen', side: 'east', by: 0.5 })
    expect(phases(onDisk('g.json').walls)).toMatchObject({ e: 'new' })
  })

  it('mirrors a phased plan as a correction, keeping its north', async () => {
    b.write('m.json', PLAN)
    await ok('grid_start_works', { plan: 'm.json' })
    const reply = await ok('grid_mirror', { plan: 'm.json', how: 'left-right', keep_north: true, correction: true, out: 'm2.json' })
    expect(reply.text).toContain('north stays at 30')
    const file = onDisk('m2.json')
    expect(file.north).toBe(30)
    expect(file.walls.length).toBe(PLAN.walls.length)
    expect(file.walls.every((w) => w.phase === 'existing')).toBe(true)
    const plain = await ok('grid_mirror', { plan: 'm.json', how: 'left-right', out: 'm3.json' })
    expect(plain.text).toContain('north is mirrored')
    expect(onDisk('m3.json').north).toBe(330)
  })
})

describe('a correction of a plan that has parts to be demolished', () => {
  // A wall past the east end, already marked to go.
  const withSpur = { ...PLAN, walls: [...PLAN.walls, { ...wall('spur', [8, 0], [10, 0]), phase: 'demolished' }] }

  it('mirrors and turns them with the rest of the building', async () => {
    for (const [file, how] of [['sm.json', { how: 'left-right' }], ['st.json', { turn: 180 }]] as const) {
      b.write(file, withSpur)
      await ok('grid_start_works', { plan: file })
      await ok('grid_mirror', { plan: file, ...how, correction: true })
      const spur = onDisk(file).walls.find((w) => w.id === 'spur')!
      // The building ran from 0 to 10 with the spur on the east: now the spur is on the west.
      expect(Math.max(spur.start![0]!, spur.end![0]!), file).toBe(2)
      expect(onDisk(file).walls.length, file).toBe(withSpur.walls.length)
      expect(spur.phase).toBe('demolished')
    }
  })

  it('says when an edit leaves them where they stood', async () => {
    b.write('ss.json', withSpur)
    await ok('grid_start_works', { plan: 'ss.json' })
    const reply = await ok('grid_change_wall', { plan: 'ss.json', wall: 'mid', thickness: 0.15, correction: true })
    expect(reply.text).toContain('to be demolished is left as it was')
  })
})

describe('a correction that adds or reshapes', () => {
  it('adds a window the survey missed, and joins two rooms that were one, with no work', async () => {
    b.write('ad.json', PLAN)
    await ok('grid_start_works', { plan: 'ad.json' })
    await ok('grid_add_opening', { plan: 'ad.json', room: 'kitchen', side: 'east', type: 'window', correction: true })
    expect(onDisk('ad.json').openings.some((o) => o.phase === 'new' || o.phase === 'demolished')).toBe(false)
    expect(onDisk('ad.json').openings).toHaveLength(3)
    await ok('grid_merge_rooms', { plan: 'ad.json', room: 'living', with: 'kitchen', use: 'living', correction: true })
    const file = onDisk('ad.json')
    expect([...file.walls, ...file.rooms, ...file.openings].some((p) => p.phase === 'new' || p.phase === 'demolished')).toBe(false)
    expect(file.rooms).toHaveLength(1)
  })

  it('is taken by every edit that would otherwise make work', () => {
    expect(GRID_TOOLS.filter((t) => 'correction' in t.args).map((t) => t.name)).toEqual([
      'grid_change_opening', 'grid_change_wall', 'grid_move_room_side', 'grid_mirror', 'grid_merge_rooms', 'grid_split_room', 'grid_add_room', 'grid_stretch', 'grid_square_scan', 'grid_fill_room', 'grid_add_opening',
    ])
  })
})

describe('grid edit', () => {
  it('runs phase and start-works from the command line', async () => {
    b.write('e.json', PLAN)
    let out = ''
    await runEdit(['start-works', 'e.json', '--project', b.folder], b.folder, (text) => { out += text })
    expect(out).toContain('as existing')
    out = ''
    await runEdit(['phase', 'e.json', '--phase', 'demolished', '--rooms', 'kitchen', '--project', b.folder], b.folder, (text) => { out += text })
    expect(out).toContain('to be demolished')
    expect(phases(onDisk('e.json').rooms)['kitchen']).toBe('demolished')
  })
})
