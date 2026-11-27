/**
 * WRT-15: the room edits on a plan with phases. On a plan whose every part is stated existing,
 * merge, split, add a room, stretch and a side moved each write the work: what stood before and
 * is taken out or reshaped stays in the plan, to be demolished, and what the edit makes is new.
 * The edit leaves no fault of its own behind, and its answer says what it kept and what is new.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

type Part = { id: string; phase?: string; start?: number[]; end?: number[]; wall?: string; offset?: number; boundary?: string[]; floor?: string }

const wall = (id: string, start: number[], end: number[], kind = 'exterior', thickness = 0.3, floor?: string) => ({ id, start, end, thickness, height: 2.7, kind, phase: 'existing', ...(floor ? { floor } : {}) })

/** Two rooms side by side, 8 by 5 m between centre lines, split at x = 4; every part stated existing. */
function twoRooms(floor?: string, tag = ''): { walls: Part[]; rooms: Part[]; openings: Part[] } {
  const t = (id: string): string => `${id}${tag}`
  return {
    walls: [
      wall(t('n1'), [0, 5], [4, 5], 'exterior', 0.3, floor), wall(t('n2'), [4, 5], [8, 5], 'exterior', 0.3, floor), wall(t('e'), [8, 5], [8, 0], 'exterior', 0.3, floor),
      wall(t('s2'), [8, 0], [4, 0], 'exterior', 0.3, floor), wall(t('s1'), [4, 0], [0, 0], 'exterior', 0.3, floor), wall(t('west'), [0, 0], [0, 5], 'exterior', 0.3, floor),
      wall(t('mid'), [4, 0], [4, 5], 'interior', 0.1, floor),
    ],
    rooms: [
      { id: t('living'), name: 'Living room', use: 'living', boundary: [t('s1'), t('mid'), t('n1'), t('west')], phase: 'existing', ...(floor ? { floor } : {}) } as Part,
      { id: t('kitchen'), name: 'Kitchen', use: 'kitchen', boundary: [t('s2'), t('e'), t('n2'), t('mid')], phase: 'existing', ...(floor ? { floor } : {}) } as Part,
    ],
    openings: [
      { id: t('front'), wall: t('s1'), type: 'door', offset: 1, width: 0.9, height: 2.1, phase: 'existing' } as Part,
      { id: t('d-mid'), wall: t('mid'), type: 'door', offset: 2, width: 0.8, height: 2.1, phase: 'existing' } as Part,
    ],
  }
}

const PLAN = { version: '1', ...twoRooms() }

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

const onDisk = (file: string): { walls: Part[]; rooms: Part[]; openings: Part[] } => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as { walls: Part[]; rooms: Part[]; openings: Part[] }
const phases = (parts: Part[]): Record<string, string | undefined> => Object.fromEntries(parts.map((p) => [p.id, p.phase]))

const withoutPhases = (plan: object): object => JSON.parse(JSON.stringify(plan, (key, value: unknown) => (key === 'phase' ? undefined : value))) as object

/** Runs one edit on a fresh copy of a plan, and holds it to leaving no fault of its own. */
async function edit(file: string, plan: object, tool: string, args: Record<string, unknown>): Promise<Reply> {
  b.write(file, plan)
  const reply = await b.call(tool, { plan: file, ...args })
  expect(reply.isError, reply.text).toBe(false)
  // No more problems in the drawing than the same edit makes on the plan with no phases.
  const problems = reply.data!['drawingProblems'] as { before: number; after: number }
  b.write(`plain-${file}`, withoutPhases(plan))
  const plain = await b.call(tool, { plan: `plain-${file}`, ...args })
  expect(plain.isError, plain.text).toBe(false)
  const plainProblems = plain.data!['drawingProblems'] as { before: number; after: number }
  expect(problems.after - problems.before, reply.text).toBeLessThanOrEqual(plainProblems.after - plainProblems.before)
  expect(reply.text).not.toContain('changed in place')
  const check = await b.call('grid_check', { plan: file, full: true })
  expect(check.isError, check.text).toBe(false)
  for (const code of ['wall/crosses-room', 'room/phase-wall', 'opening/phase-wall', 'room/no-route-out', 'room/unclosed']) expect(check.text, code).not.toContain(code)
  // The doors the answer lists are of the building after the work: no room kept to be demolished is named.
  for (const line of reply.data!['doors'] as string[]) expect(line).not.toContain('-before')
  return reply
}

describe('room edits on a plan with phases (WRT-15)', () => {
  it('merges two rooms: the wall between is kept to be demolished, and the merged room is new', async () => {
    const reply = await edit('merge.json', PLAN, 'grid_merge_rooms', { room: 'living', with: 'kitchen', use: 'living' })
    const file = onDisk('merge.json')
    expect(phases(file.walls)['mid']).toBe('demolished')
    expect(phases(file.rooms)).toEqual({ living: 'new', kitchen: 'demolished', 'living-before': 'demolished' })
    expect(file.rooms.find((r) => r.id === 'living-before')!.boundary).toEqual(['s1', 'mid', 'n1', 'west'])
    expect(phases(file.openings)).toEqual({ front: 'existing', 'd-mid': 'demolished' })
    expect(reply.text).toContain('Stood before the work and stays in the plan, to be demolished: wall "mid", room "kitchen" and room "living" (as "living-before").')
    expect(reply.text).toContain('New work in their place: room "living".')
    // Compared by phase, the work is a wall and a door removed and a room made bigger, not a room gone.
    const diff = await b.call('grid_diff', { plan: 'merge.json', since: 'phase', picture: false })
    const changes = (diff.data!['changes'] as { text: string }[]).map((c) => c.text)
    expect(changes.some((c) => c.startsWith('Wall "mid" removed'))).toBe(true)
    // WRT-32: the kitchen merged into the living room, one line with the wall taken out, never a room lost.
    expect(changes.some((c) => c.startsWith('Room removed'))).toBe(false)
    expect(changes.find((c) => c.includes('merged with "Kitchen"'))).toContain('wall "mid" taken out between them')
    const rooms = diff.data!['rooms'] as { room: string; status: string; before: number | null; after: number | null; mergedInto: string | null }[]
    expect(rooms.find((r) => r.room === 'kitchen')).toMatchObject({ status: 'removed', mergedInto: 'living' })
    expect(rooms.find((r) => r.room === 'living')).toMatchObject({ before: 17.86, after: 36.19 })
    expect(rooms.map((r) => r.room).sort()).toEqual(['kitchen', 'living'])
  })

  it('splits a room: the new wall, door and rooms are new, and the room it was is kept to be demolished', async () => {
    await edit('split.json', PLAN, 'grid_split_room', { room: 'living', side: 'west', size: 1.5, new_room: 'study', new_name: 'Study', new_use: 'study' })
    const file = onDisk('split.json')
    expect(phases(file.walls)['study-east']).toBe('new')
    expect(phases(file.rooms)).toEqual({ living: 'new', kitchen: 'existing', study: 'new', 'living-before': 'demolished' })
    expect(file.openings.find((o) => o.id === 'door-study')?.phase).toBe('new')
  })

  it('adds a room against an existing wall: the wall\'s pieces stay existing and the room it is built against stays', async () => {
    const reply = await edit('add.json', PLAN, 'grid_add_room', { room: 'ext', against: 'living', side: 'north', width: 3, depth: 3, name: 'Extension', use: 'living', opening_width: 2 })
    const file = onDisk('add.json')
    // CNT-59: the longest piece, between the two rooms, keeps the wall's id.
    expect(phases(file.walls)).toMatchObject({ 'n1-a': 'existing', n1: 'existing', 'n1-c': 'existing', 'ext-north': 'new' })
    expect(file.walls.some((w) => w.id === 'n1-b')).toBe(false)
    expect(phases(file.rooms)).toEqual({ living: 'existing', kitchen: 'existing', ext: 'new' })
    expect(file.openings.find((o) => o.id === 'pass-ext')?.phase).toBe('new')
    expect(reply.text).not.toContain('Stood before the work')
  })

  it('adds a room over a door it takes out: the door is kept, to be demolished, on the piece of wall that holds it', async () => {
    await edit('add-door.json', PLAN, 'grid_add_room', { room: 'porch', against: 'living', side: 'south', width: 3, depth: 3, name: 'Porch', use: 'living', in_the_way: 'remove', door_width: 0.9, opening_width: 1 })
    const front = onDisk('add-door.json').openings.find((o) => o.id === 'front')!
    // CNT-59: the piece that holds it is the longest, which keeps the wall's id.
    expect([front.phase, front.wall]).toEqual(['demolished', 's1'])
    // Where it stood: 1 m from the old wall's start at x = 4, so x = 3; the piece starts at x = 3.7.
    expect(front.offset).toBeCloseTo(0.7, 6)
  })

  it('stretches the plan: the wall moved out is new and kept as it stood, the walls made longer stay and their new stretches are new', async () => {
    const reply = await edit('stretch.json', PLAN, 'grid_stretch', { side: 'east', by: 1 })
    const file = onDisk('stretch.json')
    const walls = Object.fromEntries(file.walls.map((w) => [w.id, w]))
    expect([walls['e']!.phase, walls['e']!.start]).toEqual(['new', [9, 5]])
    expect([walls['e-before']!.phase, walls['e-before']!.start]).toEqual(['demolished', [8, 5]])
    expect([walls['n2']!.phase, walls['n2']!.end]).toEqual(['existing', [8, 5]])
    expect([walls['n2-new']!.phase, walls['n2-new']!.start, walls['n2-new']!.end]).toEqual(['new', [8, 5], [9, 5]])
    expect([walls['s2-new']!.phase, walls['s2-new']!.start, walls['s2-new']!.end]).toEqual(['new', [9, 0], [8, 0]])
    expect(phases(file.rooms)).toEqual({ living: 'existing', kitchen: 'new', 'kitchen-before': 'demolished' })
    expect(file.rooms.find((r) => r.id === 'kitchen-before')!.boundary).toEqual(['s2', 'e-before', 'n2', 'mid'])
    expect(reply.text).toContain('wall "e" (as "e-before")')
  })

  it('moves a room\'s side: the wall moved is new, its door goes with it, and a door that did not move stays existing', async () => {
    const reply = await edit('side.json', PLAN, 'grid_move_room_side', { room: 'living', side: 'east', by: 0.5 })
    const file = onDisk('side.json')
    expect(phases(file.walls)).toMatchObject({ mid: 'new', 'mid-before': 'demolished', n1: 'existing', 'n1-new': 'new', n2: 'existing', 'n2-before': 'demolished', s1: 'existing', 's1-new': 'new' })
    // n2 is made shorter: it takes its new end and the stretch cut off is kept.
    expect(file.walls.find((w) => w.id === 'n2')!.start).toEqual([4.5, 5])
    expect(phases(file.openings)).toEqual({ front: 'existing', 'd-mid': 'new', 'd-mid-before': 'demolished' })
    // The front door's wall kept its ends, so the door keeps its place along it.
    expect(file.openings.find((o) => o.id === 'front')!.offset).toBe(1)
    expect(file.openings.find((o) => o.id === 'd-mid-before')!.wall).toBe('mid-before')
    expect(phases(file.rooms)).toEqual({ living: 'new', kitchen: 'new', 'living-before': 'demolished', 'kitchen-before': 'demolished' })
    expect(reply.text).not.toContain('"front" is new work')
  })

  it('merges two rooms on the upper floor of a two-storey plan, leaving the floor below as it stood', async () => {
    const ground = twoRooms('ground')
    const upper = twoRooms('first', '-1')
    const plan = {
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 1 }],
      walls: [...ground.walls, ...upper.walls],
      rooms: [...ground.rooms, ...upper.rooms],
      openings: [...ground.openings, ...upper.openings.filter((o) => o.id !== 'front-1')],
    }
    await edit('school.json', plan, 'grid_merge_rooms', { room: 'living-1', with: 'kitchen-1', use: 'living' })
    const file = onDisk('school.json')
    expect(phases(file.walls)['mid-1']).toBe('demolished')
    expect(phases(file.walls)['mid']).toBe('existing')
    expect(phases(file.rooms)).toEqual({ living: 'existing', kitchen: 'existing', 'living-1': 'new', 'kitchen-1': 'demolished', 'living-1-before': 'demolished' })
    expect(file.rooms.find((r) => r.id === 'living-1-before')!.floor).toBe('first')
  })
})
