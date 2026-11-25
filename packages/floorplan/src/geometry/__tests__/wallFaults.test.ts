/**
 * MSG-12: wall faults named at the wall, each with the change that would fix it, and a tidy call
 * that makes the fixes chosen (`wallFaults.ts`). The plans are the lab's findings rebuilt: a wall
 * short of its corner (MS-2), a wall past it, a corner slipped 0.3 m (L-6), a copy of a wall
 * (MS-15), a dividing line on a solid wall (W-10), a partition across a bedroom that does not
 * list it (MS-17).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { validatePlan } from '../validate'
import type { WallFault } from '../wallFaults'
import { applyWallEdits, tidyPlan, wallFaults, wallMetres } from '../wallFaults'
import { outline, type Point } from '../../test-support/outline'

type P = [number, number]
const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]

const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
const faultsOf = (plan: FloorPlan): WallFault[] => wallFaults(plan, { broken: validatePlan(plan, indexPlan(plan), { spaces: false }).broken })
const wallLines = (plan: FloorPlan) =>
  validatePlan(plan).issues.filter((i) => i.code.startsWith('wall/') || i.code === 'room/wall-listed-twice')
const wall = (id: string, start: Point, end: Point, extra: Partial<Wall> = {}): Wall => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.7,
  kind: 'interior',
  ...extra
})
const room = (id: string, boundary: string[]): Room => ({ id, name: id, boundary, use: 'living' })
const area = (plan: FloorPlan, id: string): number => {
  const index = indexPlan(plan)
  return roomArea(plan.rooms.find((r) => r.id === id)!, index)
}

/** The lab's MS-2 plan: a 4 × 3 m bedroom whose north wall starts 1.5 m short of its corner. */
const GAP_ROOM = {
  walls: [
    { id: 's', start: [0, 0], end: [4, 0] },
    { id: 'e', start: [4, 0], end: [4, 3] },
    { id: 'n', start: [2.5, 3], end: [0, 3] },
    { id: 'w', start: [0, 3], end: [0, 0] }
  ],
  rooms: [{ id: 'r', name: 'Gap room', use: 'bedroom', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [
    { id: 'd', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1 },
    { id: 'win', wall: 'e', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 }
  ]
}

describe('a wall short of its corner (MS-2)', () => {
  it('names the north wall, the 1.50 m gap and the move that closes it', () => {
    const plan = planOf(GAP_ROOM)
    // The room is still measured as if the walls met, as before.
    expect(area(plan, 'r')).toBeCloseTo(10.64, 9)
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.kind, f.walls, f.rooms])).toEqual([['short:n:start', 'short', ['n', 'e'], ['r']]])
    expect(faults[0]!.distance).toBeCloseTo(1.5, 9)
    expect(faults[0]!.message).toBe(
      'Wall "n" stops 1.50 m short of its corner with wall "e" in room "r": its start is at (2.50, 3.00) and ' +
        'the corner at (4.00, 3.00). The room is measured as if the two walls met. Fix: move the start ' +
        'of wall "n" to (4.00, 3.00).'
    )
    expect(faults[0]!.fix!.edits).toEqual([{ op: 'move-end', wall: 'n', end: 'start', to: [4, 3] }])
  })

  it('is one warning on the wall in the drawing checks, beside the room that is not enclosed', () => {
    const issues = validatePlan(planOf(GAP_ROOM)).issues
    expect(issues.map((i) => [i.code, i.entity, i.id, i.severity])).toEqual([
      ['room/not-enclosed', 'room', 'r', 'warning'],
      ['wall/short', 'wall', 'n', 'warning']
    ])
  })

  it('tidies: the fix is made, the finding is gone and the room is enclosed', () => {
    const plan = planOf(GAP_ROOM)
    const { plan: tidied, applied, skipped } = tidyPlan(plan, ['short:n:start'])
    expect(applied.map((f) => f.id)).toEqual(['short:n:start'])
    expect(skipped).toEqual([])
    expect(tidied.walls.find((w) => w.id === 'n')!.start).toEqual([4, 3])
    expect(validatePlan(tidied).issues).toEqual([])
    expect(area(tidied, 'r')).toBeCloseTo(10.64, 9)
  })

  it('keeps an opening where it stands when the start of its wall moves', () => {
    const raw = structuredClone(GAP_ROOM)
    raw.openings.push({ id: 'n-win', wall: 'n', type: 'window', offset: 0.5, width: 1, sill: 0.9, height: 1.2 })
    const fault = faultsOf(planOf(raw))[0]!
    expect(fault.fix!.edits).toEqual([
      { op: 'move-end', wall: 'n', end: 'start', to: [4, 3] },
      { op: 'move-opening', opening: 'n-win', wall: 'n', offset: 2 }
    ])
  })

  it('leaves the 1 mm gaps the lab rightly tolerated, and walls drawn to faces', () => {
    const { walls, room: r } = outline(RECT, { thickness: [0.3, 0.3, 0.3, 0.3] })
    // Every end 1 mm off its corner.
    const mm = walls.map((w) => ({ ...w, start: [w.start[0] + 0.001, w.start[1]] as P }))
    expect(faultsOf(planOf({ walls: mm, rooms: [r] }))).toEqual([])
    // Every wall drawn to the inner face of the next, as a survey gives them.
    const faces = planOf({
      walls: [
        wall('s', [0.15, 0], [5, 0], { thickness: 0.3 }),
        wall('e', [5, 0.15], [5, 4], { thickness: 0.3 }),
        wall('n', [4.85, 4], [0, 4], { thickness: 0.3 }),
        wall('w', [0, 3.85], [0, 0], { thickness: 0.3 })
      ],
      rooms: [room('r', ['s', 'e', 'n', 'w'])]
    })
    expect(faultsOf(faces)).toEqual([])
  })

  it('names a wall in a row whose end stops short of the next', () => {
    const plan = planOf({
      walls: [
        wall('s1', [0, 0], [2, 0]),
        wall('s2', [2.5, 0], [5, 0]),
        wall('e', [5, 0], [5, 4]),
        wall('n', [5, 4], [0, 4]),
        wall('w', [0, 4], [0, 0])
      ],
      rooms: [room('r', ['s1', 's2', 'e', 'n', 'w'])]
    })
    const faults = faultsOf(plan)
    expect(faults.map((f) => f.id)).toEqual(['gap:s1:s2'])
    expect(faults[0]!.message).toMatch(/^Walls "s1" and "s2" are one straight side of room "r", but leave 0\.50 m between their ends/)
    expect(faults[0]!.fix!.edits).toEqual([{ op: 'move-end', wall: 's1', end: 'end', to: [2.5, 0] }])
    expect(faultsOf(tidyPlan(plan).plan)).toEqual([])
  })

  it('leaves a straight side whose pieces are listed out of order: the outline is the same', () => {
    // The south side in three pieces, listed middle, west, east. A swap of two neighbours in
    // the lab's damage set; the room is measured as before, and no wall is short or apart.
    const plan = planOf({
      walls: [
        wall('s1', [0, 0], [2, 0]),
        wall('s2', [2, 0], [3, 0]),
        wall('s3', [3, 0], [5, 0]),
        wall('e', [5, 0], [5, 4]),
        wall('n', [5, 4], [0, 4]),
        wall('w', [0, 4], [0, 0])
      ],
      rooms: [room('r', ['s2', 's1', 's3', 'e', 'n', 'w'])]
    })
    expect(faultsOf(plan)).toEqual([])
  })
})

describe('a wall past its corner', () => {
  it('names a wall that runs 1 m on past the room, where its end meets nothing', () => {
    const { walls, room: r } = outline(RECT)
    walls[1] = { ...walls[1]!, end: [5, 5] }
    const faults = faultsOf(planOf({ walls, rooms: [r] }))
    expect(faults.map((f) => f.id)).toEqual(['overrun:w2:end'])
    expect(faults[0]!.message).toBe(
      'Wall "w2" runs 1.00 m past its corner with wall "w3" in room "r1", at (5.00, 4.00), to (5.00, 5.00), ' +
        'where it meets no other wall. Fix: move the end of wall "w2" back to (5.00, 4.00). If instead wall ' +
        '"w3" is meant to reach (5.00, 5.00), move its start there.'
    )
  })

  it('names the lab\'s corner slipped 0.3 m (L-6), which was measured 9.43 m² in silence', () => {
    // A 4 × 3 m room whose south wall ends 0.3 m up the east wall.
    const t = 0.3
    const plan = planOf({
      walls: [
        wall('south', [0, 0], [4, 0.3], { thickness: t }),
        wall('east', [4, 0], [4, 3], { thickness: t }),
        wall('north', [4, 3], [0, 3], { thickness: t }),
        wall('west', [0, 3], [0, 0], { thickness: t })
      ],
      rooms: [room('room', ['south', 'east', 'north', 'west'])]
    })
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.walls])).toEqual([['overrun:east:start', ['east', 'south']]])
    expect(faults[0]!.message).toMatch(/Wall "east" runs 0\.30 m past its corner with wall "south"/)
    expect(faults[0]!.message).toMatch(/If instead wall "south" is meant to reach \(4\.00, 0\.00\), move its end there\./)
  })

  it('leaves T-junctions and a long wall that borders several rooms', () => {
    // Three rooms in a row under one long north wall and on one long south wall.
    const plan = planOf({
      walls: [
        wall('s', [0, 0], [9, 0]),
        wall('n', [9, 4], [0, 4]),
        wall('w', [0, 4], [0, 0]),
        wall('e', [9, 0], [9, 4]),
        wall('p1', [3, 0], [3, 4], { thickness: 0.1 }),
        wall('p2', [6, 4], [6, 0], { thickness: 0.1 })
      ],
      rooms: [room('a', ['s', 'p1', 'n', 'w']), room('b', ['s', 'p2', 'n', 'p1']), room('c', ['s', 'e', 'n', 'p2'])]
    })
    expect(faultsOf(plan)).toEqual([])
  })
})

describe('walls on top of walls (MS-15, W-10, AE-5)', () => {
  it('MS-15 a copy of a wall under a new id is reported', () => {
    const { walls, room: r } = outline(RECT)
    const plan = planOf({
      walls: [...walls, { ...walls[0]!, id: 'copy' }],
      rooms: [r],
      openings: [{ id: 'door', wall: 'copy', type: 'door', offset: 1, width: 0.9, height: 2.1, hinge: 'start', swing: 'left' }]
    })
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.walls])).toEqual([['duplicate:copy', ['copy', 'w1']]])
    expect(faults[0]!.message).toBe(
      'Wall "copy" lies on top of wall "w1" for 5.00 m: the drawing and every export show that stretch twice. ' +
        'Fix: remove wall "copy", moving its openings onto it.'
    )
    const tidied = tidyPlan(plan).plan
    expect(tidied.walls.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'w4'])
    expect(tidied.openings).toEqual([{ id: 'door', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }])
    expect(validatePlan(tidied).issues).toEqual([])
  })

  it('moves the door of a copy drawn the other way round, with its hinge and swing turned', () => {
    const { walls, room: r } = outline(RECT)
    const plan = planOf({
      walls: [...walls, { ...walls[0]!, id: 'copy', start: [5, 0], end: [0, 0] }],
      rooms: [r],
      openings: [{ id: 'door', wall: 'copy', type: 'door', offset: 1, width: 0.9, height: 2.1, hinge: 'start', swing: 'left' }]
    })
    const [fault] = faultsOf(plan)
    expect(fault!.fix!.edits).toContainEqual({ op: 'move-opening', opening: 'door', wall: 'w1', offset: 3.1, hinge: 'end', swing: 'right' })
  })

  it('does not double a door that both copies carry (AE-5)', () => {
    const { walls, room: r } = outline(RECT)
    const door = { type: 'door', offset: 1, width: 0.9, height: 2.1 }
    const plan = planOf({
      walls: [...walls, { ...walls[0]!, id: 'copy' }],
      rooms: [r],
      openings: [{ id: 'd1', wall: 'w1', ...door }, { id: 'd2', wall: 'copy', ...door }]
    })
    const [fault] = faultsOf(plan)
    expect(fault!.fix!.edits).toContainEqual({ op: 'remove-opening', opening: 'd2' })
    expect(tidyPlan(plan).plan.openings.map((o) => o.id)).toEqual(['d1'])
  })

  it('lists the wall kept in the place of the copy a room named', () => {
    const { walls, room: r } = outline(RECT)
    const plan = planOf({ walls: [...walls, { ...walls[1]!, id: 'w2-copy' }], rooms: [{ ...r, boundary: ['w1', 'w2-copy', 'w3', 'w4'] }] })
    const [fault] = faultsOf(plan)
    expect(fault!.id).toBe('duplicate:w2-copy')
    expect(fault!.message).toMatch(/Fix: remove wall "w2-copy", and list wall "w2" in its place in room "r1"\.$/)
    const tidied = tidyPlan(plan).plan
    expect(tidied.rooms[0]!.boundary).toEqual(['w1', 'w2', 'w3', 'w4'])
    expect(validatePlan(tidied).issues).toEqual([])
  })

  it('takes back a wall that overlaps another at one end', () => {
    const { walls, room: r } = outline(RECT)
    // A second piece of the south wall drawn from x = 3 to 8, 2 m over the first.
    const extra = wall('more', [3, 0], [8, 0])
    const faults = faultsOf(planOf({ walls: [...walls, extra], rooms: [r] }))
    const dup = faults.find((f) => f.kind === 'duplicate')!
    expect(dup.message).toMatch(/^Wall "more" lies on top of wall "w1" for 2\.00 m/)
    expect(dup.fix!.edits).toEqual([{ op: 'move-end', wall: 'more', end: 'start', to: [5, 0] }])
  })

  it('W-10 a dividing line on top of a solid wall is named, and replaced by the wall', () => {
    // Two bays, the east one closed on the east by a dividing line drawn on the outside wall.
    const plan = planOf({
      walls: [
        wall('s', [0, 0], [10, 0]),
        wall('e', [10, 0], [10, 5], { thickness: 0.4, kind: 'exterior' }),
        wall('n', [10, 5], [0, 5]),
        wall('w', [0, 5], [0, 0]),
        { id: 'mid', start: [5, 0], end: [5, 5], virtual: true },
        { id: 'bay-e', start: [10, 0], end: [10, 5], virtual: true }
      ],
      rooms: [room('west-bay', ['s', 'mid', 'n', 'w']), room('east-bay', ['s', 'bay-e', 'n', 'mid'])]
    })
    const faults = faultsOf(plan)
    expect(faults.map((f) => f.id)).toEqual(['line-on-wall:bay-e'])
    expect(faults[0]!.message).toBe(
      'Dividing line "bay-e" lies on top of wall "e" for 5.00 m, so that stretch is both open and solid. ' +
        'Fix: remove line "bay-e", and list wall "e" in its place in room "east-bay".'
    )
    const tidied = tidyPlan(plan).plan
    expect(tidied.rooms[1]!.boundary).toEqual(['s', 'e', 'n', 'mid'])
    // The bay is now measured to the face of the wall, not its middle.
    expect(area(tidied, 'east-bay')).toBeLessThan(area(plan, 'east-bay'))
    expect(faultsOf(tidied)).toEqual([])
  })

  it('leaves walls back to back, rows of walls and a thin wall carrying on from a thick one', () => {
    const plan = planOf({
      walls: [
        wall('a', [0, 0], [5, 0], { thickness: 0.1 }),
        wall('b', [0, 0.1], [5, 0.1], { thickness: 0.1 }),
        wall('c', [5, 0], [8, 0], { thickness: 0.3 }),
        wall('d', [8, 0], [10, 0], { thickness: 0.1 })
      ],
      rooms: []
    })
    expect(faultsOf(plan)).toEqual([])
  })
})

describe('a wall a room lists twice', () => {
  it('names the room and the wall, and lists it once', () => {
    const { walls, room: r } = outline(RECT)
    const plan = planOf({ walls, rooms: [{ ...r, boundary: ['w1', 'w2', 'w2', 'w3', 'w4'] }] })
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.message])).toEqual([
      ['listed-twice:r1:w2', 'Room "r1" lists wall "w2" twice, at places 2 and 3 of its wall list. Fix: list it once, at place 2.']
    ])
    expect(wallLines(plan).map((i) => [i.code, i.entity, i.id])).toEqual([['room/wall-listed-twice', 'room', 'r1']])
    expect(tidyPlan(plan).plan.rooms[0]!.boundary).toEqual(['w1', 'w2', 'w3', 'w4'])
  })
})

describe('a wall across a room that does not list it (MS-17)', () => {
  /** The lab's M-7 plan: a hall and a bedroom, a partition across the bedroom in no wall list. */
  const STRAY = {
    walls: [
      wall('s', [0, 0], [6.4, 0], { kind: 'exterior' }),
      wall('e', [6.4, 0], [6.4, 3.2], { kind: 'exterior' }),
      wall('n', [6.4, 3.2], [0, 3.2], { kind: 'exterior' }),
      wall('w', [0, 3.2], [0, 0], { kind: 'exterior' }),
      wall('mid', [3.2, 0], [3.2, 3.2]),
      wall('stray', [4.8, 0], [4.8, 3.2], { thickness: 0.1, kind: 'partition' })
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s', 'mid', 'n', 'w'], use: 'living' },
      { id: 'bed', name: 'Bedroom', boundary: ['s', 'e', 'n', 'mid'], use: 'bedroom' }
    ],
    openings: [{ id: 'bed-door', wall: 'mid', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
  }

  it('names the partition and the split that would make the far half a room', () => {
    const plan = planOf(STRAY)
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.walls, f.rooms])).toEqual([['crosses-room:stray:bed', ['stray'], ['bed']]])
    expect(faults[0]!.message).toBe(
      'Wall "stray" runs 3.00 m across room "bed", which does not list it, so the room is measured and checked ' +
        'as one space. Fix: split room "bed" along it, into "bed" (4.35 m²) and "bed-2" (4.35 m²), each listing it. ' +
        'If it should not be there, remove it instead. ' +
        // WRT-36: the door is on the hall's side of the partition, so the far half has no way in.
        'Look before making it: it leaves room "bed" with no way in, no door, opening or open side on any of its walls.'
    )
  })

  it('tidies into two rooms whose areas add up to the bedroom less the partition', () => {
    const plan = planOf(STRAY)
    const before = area(plan, 'bed')
    // WRT-36: a split that seals a part is made only when named.
    const tidied = tidyPlan(plan, ['crosses-room:stray:bed']).plan
    expect(tidied.rooms.map((r) => [r.id, r.name, r.boundary])).toEqual([
      ['hall', 'Hall', ['s', 'mid', 'n', 'w']],
      ['bed', 'Bedroom', ['s', 'e', 'n', 'stray']],
      ['bed-2', 'Bedroom (part)', ['s', 'stray', 'n', 'mid']]
    ])
    // The new part says nothing about its use: that is for the person to say.
    expect(tidied.rooms[2]!.use).toBeUndefined()
    expect(area(tidied, 'bed') + area(tidied, 'bed-2')).toBeCloseTo(before - 0.1 * 3, 9)
    expect(faultsOf(tidied)).toEqual([])
  })

  it('groups walls that stand in a room without dividing it, with no fix', () => {
    const { walls, room: r } = outline(RECT)
    // A column and a stub drawn as walls in the room.
    const plan = planOf({
      walls: [...walls, wall('col', [2, 2], [2.4, 2], { thickness: 0.4 }), wall('stub', [5, 2], [3.5, 2])],
      rooms: [r]
    })
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.walls, f.fix])).toEqual([['stands-in-room:r1', ['col', 'stub'], null]])
    expect(faults[0]!.message).toMatch(/^Walls "col" and "stub" stand inside room "r1", which does not list them/)
  })

  it('leaves the walls of a room marked inside the room it sits in (ARE-5)', () => {
    expect(faultsOf(fixture('room-in-room.json')).filter((f) => f.kind === 'stands-in-room')).toEqual([])
  })
})

describe('sound plans', () => {
  it.each(['floor-plan.json', 'villa.json', 'three-bed-house.json', 'madrid-flat.json', 'berlin-flat.json', 'room-in-room.json'])(
    'finds no wall fault in %s',
    (name) => {
      expect(faultsOf(fixture(name))).toEqual([])
    }
  )
})

describe('tidy', () => {
  it('keeps every key of a plan file it does not change', () => {
    const raw = { ...structuredClone(GAP_ROOM), title: 'kept', walls: GAP_ROOM.walls.map((w) => ({ ...w, note: 'kept' })) }
    const { plan } = tidyPlan(raw, undefined, (p) => parseFloorPlan(p))
    expect(plan.title).toBe('kept')
    expect(plan.walls.every((w) => w.note === 'kept')).toBe(true)
    expect(plan.walls.find((w) => w.id === 'n')!.start).toEqual([4, 3])
  })

  it('says why a fault asked for was not fixed', () => {
    const { walls, room: r } = outline(RECT)
    const plan = planOf({ walls: [...walls, wall('col', [2, 2], [2.4, 2], { thickness: 0.4 })], rooms: [r] })
    expect(tidyPlan(plan, ['stands-in-room:r1', 'short:x:end']).skipped).toEqual([
      { id: 'stands-in-room:r1', why: 'Grid offers no change for it' },
      { id: 'short:x:end', why: 'not found in this plan' }
    ])
  })

  it('makes each edit as stated', () => {
    const { walls, room: r } = outline(RECT)
    const plan = planOf({ walls, rooms: [r], openings: [{ id: 'o', wall: 'w1', type: 'window', offset: 1, width: 1, height: 1, sill: 1 }] })
    const edited = applyWallEdits(plan, [
      { op: 'move-end', wall: 'w1', end: 'end', to: [6, 0] },
      { op: 'set-boundary', room: 'r1', boundary: ['w4', 'w3', 'w2', 'w1'] },
      { op: 'move-opening', opening: 'o', wall: 'w2', offset: 0.5, hinge: 'end' },
      { op: 'add-room', room: room('new', ['w1', 'w2', 'w3']) },
      { op: 'remove-wall', wall: 'w4' }
    ])
    expect(edited.walls.map((w) => w.id)).toEqual(['w1', 'w2', 'w3'])
    expect(edited.walls[0]!.end).toEqual([6, 0])
    expect(edited.rooms.map((x) => x.boundary)).toEqual([['w4', 'w3', 'w2', 'w1'], ['w1', 'w2', 'w3']])
    expect(edited.openings[0]).toMatchObject({ wall: 'w2', offset: 0.5, hinge: 'end' })
    expect(applyWallEdits(edited, [{ op: 'remove-opening', opening: 'o' }]).openings).toEqual([])
    // The plan it was given is not changed.
    expect(plan.walls).toHaveLength(4)
  })

  it('prints a length to the millimetre with at least two decimals', () => {
    expect([1.5, 0.025, 2.0749999999, 10].map(wallMetres)).toEqual(['1.50', '0.025', '2.075', '10.00'])
  })
})

describe('a curved wall meets the straight walls that end on it (CNT-28)', () => {
  /** A curved wall from (8, 0) to (8, 3), bulging east round (8, 1.5). */
  const bow = (): Wall => wall('bow', [8, 0], [8, 3], { arc: { centre: [8, 1.5], sweep: 180 } })

  it('reads a wall running along two rooms to the end of a curve as meeting it', () => {
    const plan = planOf({
      walls: [wall('long', [0, 0], [8, 0]), wall('e1', [4, 0], [4, 3]), wall('n1', [4, 3], [0, 3]), wall('w1', [0, 3], [0, 0]), bow(), wall('n2', [8, 3], [4, 3])],
      rooms: [room('a', ['long', 'e1', 'n1', 'w1']), room('b', ['long', 'bow', 'n2', 'e1'])]
    })
    expect(faultsOf(plan)).toEqual([])
    expect(wallLines(plan)).toEqual([])
  })

  it('reads a wall that ends on the middle of a curve as meeting it', () => {
    // The curve runs round (3, 0) from (3, -3) to (3, 3), through (6, 0), where "s" ends.
    const plan = planOf({
      walls: [
        wall('s', [-4, 0], [6, 0]),
        wall('e', [0, 0], [0, 3]),
        wall('n', [0, 3], [-4, 3]),
        wall('w', [-4, 3], [-4, 0]),
        wall('round', [3, -3], [3, 3], { arc: { centre: [3, 0], sweep: 180 } })
      ],
      rooms: [room('a', ['s', 'e', 'n', 'w'])]
    })
    expect(faultsOf(plan)).toEqual([])
    expect(wallLines(plan)).toEqual([])
  })

  it('counts the corner a straight wall makes with a curve in a room the curve bounds', () => {
    const plan = planOf({
      walls: [wall('long', [4, 0], [8, 0]), bow(), wall('n2', [8, 3], [4, 3]), wall('e1', [4, 3], [4, 0])],
      rooms: [room('b', ['long', 'bow', 'n2', 'e1'])]
    })
    expect(faultsOf(plan)).toEqual([])
  })

  it('still names a straight wall that runs on past the end of a curve, and moves only the straight wall', () => {
    const plan = planOf({
      walls: [wall('long', [4, 0], [8, 0]), bow(), wall('n2', [10, 3], [4, 3]), wall('e1', [4, 3], [4, 0])],
      rooms: [room('b', ['long', 'bow', 'n2', 'e1'])]
    })
    const faults = faultsOf(plan)
    expect(faults.map((f) => [f.id, f.walls])).toEqual([['overrun:n2:start', ['n2', 'bow']]])
    const [fault] = faults
    expect(fault!.distance).toBeCloseTo(2)
    expect(fault!.message).toContain('runs 2.00 m past its corner with wall "bow" in room "b"')
    expect(fault!.message).not.toContain('If instead')
    expect(fault!.fix!.edits).toEqual([{ op: 'move-end', wall: 'n2', end: 'start', to: [8, 3] }])
    expect(faultsOf(applyWallEdits(plan, fault!.fix!.edits))).toEqual([])
  })
})

/**
 * WRT-36: a dining room whose corner entrance was drawn as a wall across the corner at 45°, with
 * the door on it, while the room still lists the corner. Splitting along it made the corner a
 * room of its own, a dead triangle the entrance opened into.
 */
const CORNER_ENTRANCE = (extra: { openings?: unknown[]; walls?: unknown[]; rooms?: unknown[] } = {}) => ({
  walls: [
    { id: 's', start: [0, 0], end: [10, 0], thickness: 0.3, kind: 'exterior' },
    { id: 'e', start: [10, 0], end: [10, 8], thickness: 0.3, kind: 'exterior' },
    { id: 'n', start: [10, 8], end: [0, 8], thickness: 0.3, kind: 'exterior' },
    { id: 'w', start: [0, 8], end: [0, 0], thickness: 0.3, kind: 'exterior' },
    { id: 'cut', start: [8, 0], end: [10, 2], thickness: 0.3, kind: 'exterior' },
    ...(extra.walls ?? [])
  ],
  rooms: [{ id: 'dining', name: 'Dining', use: 'living', boundary: ['s', 'e', 'n', 'w'] }, ...(extra.rooms ?? [])],
  openings: extra.openings ?? [{ id: 'entry', wall: 'cut', type: 'door', offset: 0.9, width: 1, height: 2.1 }]
})

describe('a wall across a corner of a room, at an angle (WRT-36)', () => {
  it('takes the corner outside, keeps the door on the new face and leaves no fault', () => {
    const plan = planOf(CORNER_ENTRANCE())
    const faults = faultsOf(plan)
    expect(faults.map((f) => f.id)).toEqual(['crosses-room:cut:dining'])
    expect(faults[0]!.message).toBe(
      'Wall "cut" runs 2.404 m across room "dining", which does not list it, so the room is measured and checked as one space. ' +
        'Fix: take the corner beyond it outside: room "dining" lists it in place of the corner and measures 72.86 m², and walls "s" and "e" end on it. ' +
        'If the corner is meant to be a room of its own, split the room along it instead.'
    )
    const tidied = tidyPlan(plan).plan
    // No room is made of the corner: it is outside.
    expect(tidied.rooms.map((r) => [r.id, r.boundary])).toEqual([['dining', ['s', 'cut', 'e', 'n', 'w']]])
    expect(tidied.walls.find((w) => w.id === 's')!.end).toEqual([8, 0])
    expect(tidied.walls.find((w) => w.id === 'e')!.start).toEqual([10, 2])
    expect(tidied.openings).toEqual(plan.openings)
    expect(area(tidied, 'dining')).toBeCloseTo(72.86, 2)
    expect(faultsOf(tidied)).toEqual([])
  })

  it('moves a door on the corner it cuts off onto it, in its middle', () => {
    const plan = planOf(CORNER_ENTRANCE({ openings: [{ id: 'entry', wall: 's', type: 'door', offset: 8.6, width: 0.9, height: 2.1 }, { id: 'win', wall: 'e', type: 'window', offset: 4, width: 1.2, sill: 0.9, height: 1.2 }] }))
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:cut:dining')!
    expect(fault.message).toContain('"entry", on the corner, moves onto it, in its middle.')
    const tidied = tidyPlan(plan).plan
    const cut = Math.hypot(2, 2)
    expect(tidied.openings.find((o) => o.id === 'entry')).toMatchObject({ wall: 'cut', offset: Math.round(((cut - 0.9) / 2) * 1e6) / 1e6 })
    // The window past the new end of wall "e"'s start keeps its place in the building.
    expect(tidied.openings.find((o) => o.id === 'win')).toMatchObject({ wall: 'e', offset: 2 })
    expect(faultsOf(tidied)).toEqual([])
  })

  it('takes out a wall wholly beyond the cut, giving its facts to the cut', () => {
    // The corner drawn with a short return: s stops at 9.5 and a stub runs to e.
    const raw = CORNER_ENTRANCE()
    raw.walls = [
      { id: 's', start: [0, 0], end: [9.5, 0], thickness: 0.3, kind: 'exterior' },
      { id: 'ret', start: [9.5, 0], end: [10, 0.5], thickness: 0.3, kind: 'exterior', properties: { finish: 'brick' } },
      { id: 'e', start: [10, 0.5], end: [10, 8], thickness: 0.3, kind: 'exterior' },
      ...raw.walls.slice(2)
    ]
    raw.rooms = [{ id: 'dining', name: 'Dining', use: 'living', boundary: ['s', 'ret', 'e', 'n', 'w'] }]
    const plan = planOf(raw)
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:cut:dining')!
    expect(fault.message).toContain('Taken out, as wholly beyond it: "ret".')
    const tidied = tidyPlan(plan).plan
    expect(tidied.walls.map((w) => w.id)).not.toContain('ret')
    expect(tidied.walls.find((w) => w.id === 'cut')!.properties).toEqual({ finish: 'brick' })
    expect(tidied.rooms[0]!.boundary).toEqual(['s', 'cut', 'e', 'n', 'w'])
    expect(faultsOf(tidied)).toEqual([])
  })

  it('splits the room as before when another room lists a wall round the corner', () => {
    const plan = planOf(
      CORNER_ENTRANCE({
        walls: [{ id: 'e2', start: [14, 0], end: [14, 8], thickness: 0.3 }, { id: 's2', start: [10, 0], end: [14, 0], thickness: 0.3 }, { id: 'n2', start: [14, 8], end: [10, 8], thickness: 0.3 }],
        rooms: [{ id: 'bar', name: 'Bar', use: 'living', boundary: ['s2', 'e2', 'n2', 'e'] }],
        openings: [{ id: 'entry', wall: 'cut', type: 'door', offset: 0.9, width: 1, height: 2.1 }, { id: 'front', wall: 'w', type: 'door', offset: 3, width: 1, height: 2.1 }]
      })
    )
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:cut:dining')!
    expect(fault.fix!.says).toMatch(/^split room "dining" along it/)
    expect(fault.fix!.seals).toBeUndefined()
  })

  it('splits the room along a wall square to the walls it meets, as before', () => {
    const plan = planOf(
      CORNER_ENTRANCE({
        walls: [],
        openings: [{ id: 'front', wall: 'w', type: 'door', offset: 3, width: 1, height: 2.1 }, { id: 'store-door', wall: 'part', type: 'door', offset: 3, width: 0.8, height: 2.1 }]
      })
    )
    const raw = { ...CORNER_ENTRANCE(), walls: [...CORNER_ENTRANCE().walls.slice(0, 4), { id: 'part', start: [8, 0], end: [8, 8], thickness: 0.1 }], openings: plan.openings }
    const fault = faultsOf(planOf(raw)).find((f) => f.id === 'crosses-room:part:dining')!
    expect(fault.fix!.says).toMatch(/^split room "dining" along it/)
    expect(fault.fix!.seals).toBeUndefined()
  })
})

describe('a split that would seal a space (WRT-36)', () => {
  const partitioned = (openings: unknown[]) => ({
    ...CORNER_ENTRANCE(),
    walls: [...CORNER_ENTRANCE().walls.slice(0, 4), { id: 'part', start: [8, 0], end: [8, 8], thickness: 0.1 }],
    openings
  })

  it('warns that a part would have no way in, and tidy with no ids leaves it', () => {
    const plan = planOf(partitioned([{ id: 'front', wall: 'w', type: 'door', offset: 3, width: 1, height: 2.1 }]))
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:part:dining')!
    expect(fault.fix!.seals).toEqual(['dining-2'])
    expect(fault.message).toContain('Look before making it: it leaves room "dining-2" with no way in, no door, opening or open side on any of its walls.')
    const all = tidyPlan(plan)
    expect(all.applied).toEqual([])
    expect(all.skipped).toEqual([
      { id: fault.id, why: `not made with all, as it would leave "dining-2" with no way in: name it, "${fault.id}", to make it.` }
    ])
    expect(all.plan.rooms).toHaveLength(1)
    const named = tidyPlan(plan, [fault.id])
    expect(named.applied.map((f) => f.id)).toEqual([fault.id])
    expect(named.plan.rooms.map((r) => r.id)).toEqual(['dining', 'dining-2'])
  })

  it('warns when the parts\' only way in is the door between them', () => {
    const plan = planOf(partitioned([{ id: 'inner', wall: 'part', type: 'door', offset: 3, width: 0.9, height: 2.1 }]))
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:part:dining')!
    expect(fault.fix!.seals).toEqual(['dining', 'dining-2'])
    expect(fault.message).toContain('it leaves rooms "dining" and "dining-2" with no way in but through each other')
  })

  it('does not warn for a part reached through a door on the wall it shares with the room', () => {
    const plan = planOf(
      partitioned([
        { id: 'front', wall: 'w', type: 'door', offset: 3, width: 1, height: 2.1 },
        { id: 'store-door', wall: 'part', type: 'door', offset: 3, width: 0.8, height: 2.1 }
      ])
    )
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:part:dining')!
    expect(fault.fix!.seals).toBeUndefined()
    expect(tidyPlan(plan).applied.map((f) => f.id)).toEqual([fault.id])
  })

  it('counts a door on a wall both parts list for the part it stands in', () => {
    // The only door is on the south wall, east of the partition: the west part has none.
    const plan = planOf(partitioned([{ id: 'side', wall: 's', type: 'door', offset: 8.6, width: 0.9, height: 2.1 }]))
    const fault = faultsOf(plan).find((f) => f.id === 'crosses-room:part:dining')!
    expect(fault.fix!.seals).toEqual(['dining'])
  })
})
