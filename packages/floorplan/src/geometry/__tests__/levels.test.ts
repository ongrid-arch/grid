/**
 * LVL-1: floors state their level and height in metres, apart from their order (C5, reopened).
 * The cases are the lab's: the tiny house's loft (VE-2, A-8, AB-6), the flat on the third floor
 * (R-12, VE-3), racking taller than the shed (S-2), a misspelt floor (MS-10) and a door to the
 * outside ten metres up (VE-8).
 */
import { describe, expect, it } from 'vitest'
import { floorElevations, stackFloors, stackLevels, SLAB_THICKNESS } from '../elevations'
import { validatePlan } from '../validate'
import { checkPlanSanity } from '../rules'
import { planNotes } from '../../notes/notes'
import { parseFloorPlan, safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { outline, type Point } from '../../test-support/outline'
import { idEdits, misspeltFloorIds, nearestFloorId } from '../levels'

const mm = (value: number): number => Math.round(value * 1000) / 1000

/** A closed outline on `floor`, its walls and room renamed with `prefix`. */
function box(prefix: string, floor: string | undefined, points: Point[], height?: number, kind: 'exterior' | 'partition' = 'exterior') {
  const { walls, room } = outline(points)
  const rename = (id: string): string => `${prefix}-${id}`
  return {
    walls: walls.map((w) => {
      const rest: Record<string, unknown> = { ...w }
      delete rest.height
      return { ...rest, id: rename(w.id), kind, ...(height === undefined ? {} : { height }), ...(floor === undefined ? {} : { floor }) }
    }),
    room: { ...room, id: `${prefix}-room`, name: prefix, boundary: room.boundary.map(rename), ...(floor === undefined ? {} : { floor }) }
  }
}

const RECT: Point[] = [[0, 0], [7.2, 0], [7.2, 2.5], [0, 2.5]]
const LOFT: Point[] = [[3.3, 0], [7.2, 0], [7.2, 2.5], [3.3, 2.5]]

/** The lab's tiny house (A-8): a 3.6 m main floor and a sleeping loft with 1.2 m knee walls. */
function tinyHouse(loft: Record<string, unknown> = {}): FloorPlan {
  const main = box('main', 'ground', RECT, 3.6)
  const sleep = box('loft', 'loft', LOFT, 1.2)
  return parseFloorPlan({
    floors: [
      { id: 'ground', name: 'Main floor', level: 0 },
      { id: 'loft', name: 'Sleeping loft', level: 1, ...loft }
    ],
    walls: [...main.walls, ...sleep.walls],
    rooms: [main.room, sleep.room]
  })
}

describe('LVL-1 the plan file', () => {
  it('reads a floor\'s elevation, height and slab, and a half level', () => {
    const plan = parseFloorPlan({ floors: [{ id: 'mezz', name: 'Mezzanine', level: 0.5, elevation: 1.4, height: 2.4, slab: 0.2 }] })
    expect(plan.floors).toEqual([{ id: 'mezz', name: 'Mezzanine', level: 0.5, elevation: 1.4, height: 2.4, slab: 0.2 }])
  })

  it('adds no key to a plan that states none', () => {
    const floors = [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }]
    expect(parseFloorPlan({ floors }).floors).toEqual(floors)
  })

  it('refuses a floor height of 0 and a negative slab', () => {
    expect(safeParseFloorPlan({ floors: [{ id: 'g', name: 'G', height: 0 }] })).toBeNull()
    expect(safeParseFloorPlan({ floors: [{ id: 'g', name: 'G', slab: -0.1 }] })).toBeNull()
  })

  it('gives a wall with no height its floor\'s height, and leaves a stated 2.7 as it is (lab AU3-6)', () => {
    const plan = parseFloorPlan({
      floors: [{ id: 'ground', name: 'Ground', level: 0, height: 3 }],
      walls: [
        { id: 'unstated', start: [0, 0], end: [4, 0] },
        { id: 'stated', start: [4, 0], end: [4, 3], height: 2.7 },
        { id: 'line', start: [0, 0], end: [0, 3], virtual: true }
      ]
    })
    expect(plan.walls.map((w) => [w.id, w.height])).toEqual([['unstated', 3], ['stated', 2.7], ['line', 0]])
  })

  it('gives a wall the height of its own floor only', () => {
    const plan = parseFloorPlan({
      floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1, height: 2.5 }],
      walls: [
        { id: 'down', start: [0, 0], end: [4, 0] },
        { id: 'up', start: [0, 0], end: [4, 0], floor: 'first' }
      ]
    })
    expect(plan.walls.map((w) => [w.id, w.height])).toEqual([['down', 2.7], ['up', 2.5]])
  })
})

describe('LVL-1 where floors stand', () => {
  it('VE-2 stacks the tiny house\'s loft on its walls when it states nothing, as before: 5.30 m tall', () => {
    const e = floorElevations(tinyHouse())
    expect(mm(e.floors.get('loft')!.floorLevel)).toBe(3.85)
    expect(mm(e.roof.top)).toBe(5.3)
  })

  it('VE-2 stands the loft at its stated level, and the house is 4.00 m tall', () => {
    // The loft floor at 2.55 m: its 1.2 m knee walls top out at 3.75 m, under the 0.25 m roof.
    const e = floorElevations(tinyHouse({ elevation: 2.55 }))
    expect(e.floors.get('loft')).toEqual({ floorLevel: 2.55, clearHeight: 1.2 })
    expect(e.floors.get('ground')).toEqual({ floorLevel: 0, clearHeight: 3.6 })
    expect(mm(e.roof.bottom)).toBe(3.75)
    expect(mm(e.roof.top)).toBe(4)
  })

  it('lays the roof on the highest storey top, so a loft stated low does not pull it down', () => {
    const e = floorElevations(tinyHouse({ elevation: 2 }))
    // The loft's walls end at 3.20 m; the main floor's 3.6 m walls are higher.
    expect(mm(e.roof.bottom)).toBe(3.6)
    expect(mm(e.roof.top)).toBe(3.85)
  })

  it('R-12 stands a flat on the third floor at its stated elevation, and on the ground when it states none', () => {
    const flat = box('flat', 'third', RECT)
    const raw = { floors: [{ id: 'third', name: '3. Obergeschoss', level: 3 }], walls: flat.walls, rooms: [flat.room] }
    expect(floorElevations(parseFloorPlan(raw)).floors.get('third')!.floorLevel).toBe(0)
    const stated = parseFloorPlan({ ...raw, floors: [{ ...raw.floors[0]!, elevation: 8.85 }] })
    expect(floorElevations(stated).floors.get('third')).toEqual({ floorLevel: 8.85, clearHeight: 2.7 })
  })

  it('S-2 keeps a stated storey height when racking stands taller, and the roof with it', () => {
    const shed = box('shed', 'ground', [[0, 0], [60, 0], [60, 40], [0, 40]], 10)
    const rack = { id: 'rack', start: [5, 5], end: [55, 5], thickness: 1, height: 11, kind: 'partition', floor: 'ground' }
    const plan = parseFloorPlan({ floors: [{ id: 'ground', name: 'Shed', level: 0, height: 10 }], walls: [...shed.walls, rack], rooms: [shed.room] })
    const e = floorElevations(plan)
    expect(e.floors.get('ground')!.clearHeight).toBe(10)
    expect(e.roof).toEqual({ bottom: 10, top: 10 + SLAB_THICKNESS })
  })

  it('stacks a floor that states nothing on the stated one below it, on its own slab', () => {
    const plan = parseFloorPlan({
      floors: [
        { id: 'ground', name: 'Ground', level: 0, height: 3 },
        { id: 'first', name: 'First', level: 1, slab: 0.3 },
        { id: 'second', name: 'Second', level: 2 }
      ],
      walls: [
        { id: 'g', start: [0, 0], end: [4, 0], floor: 'ground' },
        { id: 'f', start: [0, 0], end: [4, 0], floor: 'first' },
        { id: 's', start: [0, 0], end: [4, 0], floor: 'second' }
      ]
    })
    const e = floorElevations(plan)
    expect(mm(e.floors.get('first')!.floorLevel)).toBe(3.3)
    expect(mm(e.floors.get('second')!.floorLevel)).toBe(6.25)
  })

  it('hangs a basement under the stated slab of the floor above it', () => {
    const plan = parseFloorPlan({
      floors: [
        { id: 'cellar', name: 'Cellar', level: -1, height: 2.4 },
        { id: 'ground', name: 'Ground', level: 0, slab: 0.4 }
      ],
      walls: [
        { id: 'c', start: [0, 0], end: [4, 0], floor: 'cellar' },
        { id: 'g', start: [0, 0], end: [4, 0], floor: 'ground' }
      ]
    })
    expect(mm(floorElevations(plan).floors.get('cellar')!.floorLevel)).toBe(-2.8)
  })

  it('stacks floors that state nothing exactly as levels were stacked before LVL-1', () => {
    const cases: Array<Array<[number, number]>> = [
      [[0, 2.7]],
      [[-1, 2.5], [0, 3], [1, 2.8], [2, 2.8]],
      [[0, 3], [1, 0], [3, 2.8]],
      [[-4, 2], [-1, 2.4], [0, 3], [5, 0]],
      [[1, 2.9]],
      [[-1, 2.3]]
    ]
    for (const entries of cases) {
      const byLevel = stackLevels(new Map(entries), SLAB_THICKNESS)
      const byFloor = stackFloors(
        entries.map(([level, tallest]) => ({ floor: { id: `f${level}`, name: 'F', level }, tallest })),
        SLAB_THICKNESS
      )
      for (const [level] of entries) expect(byFloor.get(`f${level}`)).toEqual(byLevel.get(level))
    }
  })
})

describe('LVL-1 floor ids the plan does not know (MS-10)', () => {
  it('counts edits between ids, a swap of two letters as one', () => {
    expect(idEdits('frist', 'first')).toBe(1)
    expect(idEdits('Ground', 'groud')).toBe(1)
    expect(idEdits('loft', 'basement')).toBeGreaterThan(2)
    expect(nearestFloorId('atic', ['ground', 'attic', 'first'])).toBe('attic')
  })

  it('with a floor list: an error with the nearest listed id, and the part is left out', () => {
    const main = box('main', 'ground', RECT)
    const plan = parseFloorPlan({
      floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
      walls: main.walls.map((w, i) => (i === 0 ? { ...w, floor: 'frist' } : w)),
      rooms: [main.room]
    })
    const result = validatePlan(plan)
    const unknown = result.issues.filter((i) => i.code === 'wall/unknown-floor')
    expect(unknown.map((i) => [i.id, i.severity])).toEqual([['main-w1', 'error']])
    expect(unknown[0]!.message).toBe(
      'Wall "main-w1" sits on floor "frist", which the plan does not list; the nearest floor it lists is "first". ' +
        'Name a listed floor, or add "frist" to the floors.'
    )
    expect(result.broken.has('main-w1')).toBe(true)
  })

  it('without a floor list: an id spelt like one the plan uses more is an error naming it', () => {
    const { walls, room } = outline(RECT)
    const plan = parseFloorPlan({
      walls: walls.map((w, i) => ({ ...w, floor: i === 0 ? 'frist' : 'first' })),
      rooms: [{ ...room, floor: 'first' }]
    })
    const unknown = validatePlan(plan).issues.filter((i) => i.code === 'wall/unknown-floor')
    expect(unknown.map((i) => [i.id, i.severity])).toEqual([['w1', 'error']])
    expect(unknown[0]!.message).toContain('"frist" is spelt like floor "first"')
  })

  it('without a floor list: a numbered series of floors, short labels and one floor of its own are not slips', () => {
    const on = (floors: string[]): FloorPlan =>
      parseFloorPlan({ walls: floors.map((floor, i) => ({ id: `w${i}`, start: [0, 0], end: [4, 0], floor })) })
    expect([...misspeltFloorIds(on(['f1', 'f1', 'f2', 'f10']))]).toEqual([])
    expect([...misspeltFloorIds(on(['level-1', 'level-1', 'level-2']))]).toEqual([])
    expect([...misspeltFloorIds(on(['b1', 'g1', 'g1']))]).toEqual([])
    expect([...misspeltFloorIds(on(['wherever', 'wherever']))]).toEqual([])
    expect([...misspeltFloorIds(on(['groud', 'ground', 'ground']))]).toEqual([['groud', 'ground']])
  })
})

describe('LVL-1 checks on levels and heights', () => {
  const wall = (id: string, floor: string, x = 0) => ({ id, start: [x, 0], end: [x + 4, 0], floor })
  const codesOf = (raw: unknown): string[] => validatePlan(parseFloorPlan(raw)).issues.map((i) => i.code)
  const issueOf = (raw: unknown, code: string) => validatePlan(parseFloorPlan(raw)).issues.find((i) => i.code === code)

  it('VE-3 names a missing level and the floor it misplaces', () => {
    const raw = {
      floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'one', name: 'One', level: 1 }, { id: 'top', name: 'Top', level: 3 }],
      walls: [wall('a', 'g'), wall('b', 'one'), wall('c', 'top')]
    }
    expect(issueOf(raw, 'plan/level-gap')?.message).toBe(
      'The plan has no floor at level 2, but floor "top" is at level 3. A level only orders the floors, so it is ' +
        'stacked as if no level were missing. If a floor is missing, add it; if not, state where it stands with an ' +
        'elevation in metres.'
    )
  })

  it('R-12 says a lone third-floor flat stands on the ground until it states its elevation', () => {
    const raw = { floors: [{ id: 'third', name: '3F', level: 3 }], walls: [wall('a', 'third')] }
    expect(issueOf(raw, 'plan/level-gap')?.message).toContain(
      'no floor at levels 0, 1 and 2, but floor "third" is at level 3. A level only orders the floors, so it stands at 0.00 m, on the ground.'
    )
    expect(codesOf({ ...raw, floors: [{ ...raw.floors[0]!, elevation: 8.85 }] })).not.toContain('plan/level-gap')
  })

  it('names a long run of missing levels as a range, and stays quick on a level typed as 1e9', () => {
    const raw = { floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'far', name: 'Far', level: 1e9 }], walls: [wall('a', 'g'), wall('b', 'far')] }
    expect(issueOf(raw, 'plan/level-gap')?.message).toContain('no floor at levels 1 to 999999999, but floor "far" is at level 1000000000.')
    const deep = { floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'pit', name: 'Pit', level: -3 }], walls: [wall('a', 'g'), wall('b', 'pit')] }
    expect(issueOf(deep, 'plan/level-gap')?.message).toContain('no floor at levels -2 and -1, but floor "pit" is at level -3.')
  })

  it('finds no gap in half levels or in a basement on its own', () => {
    const half = { floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'h', name: 'H', level: 0.5 }, { id: 'one', name: 'One', level: 1 }], walls: [wall('a', 'g'), wall('b', 'h'), wall('c', 'one')] }
    expect(codesOf(half)).not.toContain('plan/level-gap')
    const cellar = { floors: [{ id: 'b', name: 'B', level: -1 }], walls: [wall('a', 'b')] }
    expect(codesOf(cellar)).not.toContain('plan/level-gap')
  })

  it('MS-10 names two floors that stand at one level, one over the other', () => {
    const lower = box('a', 'downstairs', RECT)
    const upper = box('b', 'upstairs', RECT)
    const raw = { walls: [...lower.walls, ...upper.walls], rooms: [lower.room, upper.room] }
    expect(issueOf(raw, 'plan/same-level')?.message).toBe(
      'Floors "downstairs" and "upstairs" are all at level 0, so they stand at the same height, one over the other. ' +
        'Give each floor its own level, or state where each stands with an elevation in metres.'
    )
  })

  it('says nothing about two floors side by side at one level', () => {
    const left = box('a', 'west', [[0, 0], [6, 0], [6, 8], [0, 8]])
    const right = box('b', 'east', [[6, 0], [12, 0], [12, 8], [6, 8]])
    const raw = {
      floors: [{ id: 'west', name: 'West house', level: 0 }, { id: 'east', name: 'East house', level: 0 }],
      walls: [...left.walls, ...right.walls],
      rooms: [left.room, right.room]
    }
    expect(codesOf(raw)).not.toContain('plan/same-level')
  })

  it('VE-3 names an empty top floor that still counts as a storey', () => {
    const raw = { floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'roof', name: 'Roof', level: 1 }], walls: [wall('a', 'g')] }
    expect(issueOf(raw, 'floor/empty-top')?.message).toBe(
      'Floor "roof" is the top floor and has nothing drawn on it, but it still counts as a storey 2.70 m high, the ' +
        'default, and the roof stands on it. Remove the floor if nothing is on it yet.'
    )
  })

  it('S-2 names a wall taller than the height its floor states', () => {
    const raw = {
      floors: [{ id: 'g', name: 'Shed', level: 0, height: 10 }],
      walls: [wall('w', 'g'), { ...wall('rack', 'g', 10), height: 11, kind: 'partition' }]
    }
    expect(issueOf(raw, 'wall/above-storey')?.message).toBe(
      'Wall "rack" is 11.00 m high, 1.00 m higher than floor "g", which states it is 10.00 m high. The storey and ' +
        'the roof stay where the floor puts them; if the wall really is taller, raise the floor\'s height.'
    )
    expect(codesOf({ ...raw, floors: [{ id: 'g', name: 'Shed', level: 0 }] })).not.toContain('wall/above-storey')
  })

  it('VE-2 questions a partition typed 27 for 2.7', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const tall = { id: 'p', start: [2.5, 0], end: [2.5, 2], thickness: 0.1, height: 27, kind: 'partition' }
    const issue = validatePlan(parseFloorPlan({ walls: [...walls, tall], rooms: [room] })).issues.find((i) => i.id === 'p' && i.code === 'wall/size-question')
    expect(issue?.message).toContain('Wall "p" is 27.00 m high, the others on its floor typically 2.70 m: is that meant?')
  })

  it('questions a floor height typed 27 for 2.7', () => {
    const raw = { floors: [{ id: 'g', name: 'G', level: 0, height: 27 }], walls: [wall('a', 'g')], rooms: [{ id: 'r', name: 'Bed', boundary: [], use: 'bedroom' }] }
    expect(issueOf(raw, 'floor/size-question')?.message).toContain('Floor "g" states it is 27.00 m high: is that meant?')
  })

  it('says nothing new about a plan that states no levels', () => {
    const lower = box('a', 'ground', RECT)
    const upper = box('b', 'first', RECT)
    const raw = {
      floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
      walls: [...lower.walls, ...upper.walls],
      rooms: [lower.room, upper.room]
    }
    const lvl = ['plan/level-gap', 'plan/same-level', 'floor/empty-top', 'wall/above-storey', 'floor/size-question', 'wall/unknown-floor', 'room/unknown-floor']
    expect(codesOf(raw).filter((c) => lvl.includes(c))).toEqual([])
  })
})

describe('LVL-1 a door to the outside above the ground (VE-8)', () => {
  /** One room with a door in its south wall, on a floor that states `floor`. */
  function flat(floor: Record<string, unknown>): FloorPlan {
    const { walls, room } = box('flat', 'f', RECT)
    return parseFloorPlan({
      floors: [{ id: 'f', name: 'Flat', level: 0, ...floor }],
      walls,
      rooms: [room],
      openings: [{ id: 'door', wall: 'flat-w1', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    })
  }

  it('names a door at 9.85 m, and does not count it as a way out', () => {
    const report = checkPlanSanity(flat({ elevation: 9.85 }))
    expect(report.findings.map((f) => [f.code, f.ruleId, f.rooms, f.openings, f.elevation])).toEqual([
      ['door_to_outside_above_ground', 'door-leads-somewhere', ['flat-room'], ['door'], 9.85]
    ])
    expect(report.findings[0]!.message).toBe('Where a door from "flat" leads, 9.85 m above the ground, was not checked: it is not taken as a way out')
    expect(report.notChecked.map((n) => n.reason)).toEqual(['no_stairs'])
    const note = planNotes(flat({ elevation: 9.85 }), report).notes[0]!
    expect(note.title.map((p) => p.text).join('')).toBe('Where a door from flat leads, 9.85 m above the ground, was not checked: it is not taken as a way out')
  })

  it('counts the same door as a way out on the ground, and a few steps up', () => {
    for (const floor of [{}, { elevation: 1.2 }]) {
      const report = checkPlanSanity(flat(floor))
      expect(report.findings).toEqual([])
      expect(report.notChecked).toEqual([])
    }
  })

  it('names a door to the outside on an upper floor that states nothing', () => {
    const lower = box('a', 'ground', RECT)
    const upper = box('b', 'first', RECT)
    const plan = parseFloorPlan({
      floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
      walls: [...lower.walls, ...upper.walls],
      rooms: [lower.room, upper.room],
      openings: [
        { id: 'front', wall: 'a-w1', type: 'door', offset: 1, width: 0.9, height: 2.1 },
        { id: 'balcony', wall: 'b-w1', type: 'door', offset: 1, width: 0.9, height: 2.1 }
      ]
    })
    const report = checkPlanSanity(plan)
    // LVL-14: and the upper floor, which no stair reaches, is a finding of its own.
    expect(report.findings.map((f) => [f.code, f.floor, f.openings])).toEqual([['door_to_outside_above_ground', 'first', ['balcony']], ['no_stair', 'first', []]])
    expect(report.findings[0]!.message).toBe('Where a door from "b" leads, 2.95 m above the ground, was not checked: it is not taken as a way out')
  })
})
