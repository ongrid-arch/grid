import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { floorBuilding, floorStatesBuilding } from '../../geometry/floors'
import {
  BUILDING_TYPES,
  DEFAULT_FLOOR_ID,
  EMPTY_FLOOR_PLAN,
  FloorPlanSchema,
  PlanSchemaError,
  ROOM_USES,
  parseFloorPlan,
  safeParseFloorPlan
} from '../floorplan'

// A plan as it was written before floors existed. Kept literal on purpose: the
// point of these tests is that such a file survives the schema change untouched.
const v1Plan = {
  version: '1',
  units: 'm',
  walls: [
    { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.7, kind: 'exterior' }
  ],
  rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2'] }],
  openings: [
    { id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 }
  ]
}

describe('a plan written before floors existed', () => {
  it('parses', () => {
    expect(() => parseFloorPlan(v1Plan)).not.toThrow()
  })

  it('gains no keys — the file round-trips byte-stable', () => {
    const parsed = parseFloorPlan(v1Plan)

    // The whole reason the new fields are .optional() rather than .default():
    // handlers.ts reads a plan through this parse and writes the result back over
    // the user's file, so an injected key would be a spurious diff in their repo.
    expect(Object.keys(parsed).sort()).toEqual(['openings', 'rooms', 'units', 'version', 'walls'])
    expect(parsed.walls.every((wall) => !('floor' in wall))).toBe(true)
    expect(parsed.rooms.every((room) => !('floor' in room))).toBe(true)
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(v1Plan)
  })

  it('has no floors array of its own', () => {
    expect(parseFloorPlan(v1Plan).floors).toBeUndefined()
  })
})

describe('a plan that names floors', () => {
  const multi = {
    ...v1Plan,
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [
      { ...v1Plan.walls[0], floor: 'ground' },
      { ...v1Plan.walls[1], floor: 'first' }
    ],
    rooms: [{ ...v1Plan.rooms[0], floor: 'ground' }]
  }

  it('keeps every floor field through the parse', () => {
    const parsed = parseFloorPlan(multi)

    expect(parsed.floors).toHaveLength(2)
    expect(parsed.walls.map((wall) => wall.floor)).toEqual(['ground', 'first'])
    expect(parsed.rooms[0]?.floor).toBe('ground')
  })

  it('defaults a floor level to 0 when it is not stated', () => {
    const parsed = parseFloorPlan({ ...multi, floors: [{ id: 'ground', name: 'Ground floor' }] })

    expect(parsed.floors?.[0]?.level).toBe(0)
  })

  it('rejects an empty floor id or name', () => {
    expect(safeParseFloorPlan({ ...multi, floors: [{ id: '', name: 'Nameless' }] })).toBeNull()
    expect(safeParseFloorPlan({ ...multi, floors: [{ id: 'ground', name: '' }] })).toBeNull()
  })

  // LVL-1 (lab VE-3, half levels): a level orders the floors and need not be whole. Before
  // LVL-1 this test was 'rejects a non-integer level'.
  it('accepts a half level', () => {
    expect(
      safeParseFloorPlan({ ...multi, floors: [{ id: 'ground', name: 'Ground', level: 0.5 }] })?.floors
    ).toEqual([{ id: 'ground', name: 'Ground', level: 0.5 }])
  })

  it('accepts a negative level for a basement', () => {
    const parsed = parseFloorPlan({
      ...multi,
      floors: [{ id: 'basement', name: 'Basement', level: -1 }]
    })

    expect(parsed.floors?.[0]?.level).toBe(-1)
  })
})

describe('the error a plan that does not fit throws (QAR-6)', () => {
  it('is the one floorplan re-exports, so callers never import the schema library', () => {
    let thrown: unknown
    try {
      parseFloorPlan({ ...v1Plan, units: 'ft' })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(PlanSchemaError)
    expect((thrown as PlanSchemaError).issues[0]?.path).toEqual(['units'])
  })
})

describe('the version literal', () => {
  // Pinned deliberately. The assistant reads a changed schema description and may
  // infer the version should move with it; a bumped version fails this parse, the
  // watcher drops the push, and the preview goes blank with no error anywhere.
  it('still refuses any version but 1', () => {
    expect(safeParseFloorPlan({ ...v1Plan, version: '2' })).toBeNull()
    expect(FloorPlanSchema.safeParse({ ...v1Plan, version: 2 }).success).toBe(false)
  })

  it('still backfills a missing version', () => {
    const noVersion: Record<string, unknown> = { ...v1Plan }
    delete noVersion.version

    expect(parseFloorPlan(noVersion).version).toBe('1')
  })
})

describe('the empty plan', () => {
  it('parses and names no floors', () => {
    expect(() => parseFloorPlan(EMPTY_FLOOR_PLAN)).not.toThrow()
    expect(parseFloorPlan(EMPTY_FLOOR_PLAN).floors).toBeUndefined()
  })
})

describe('the default floor id', () => {
  it('is what an unstated floor means', () => {
    expect(DEFAULT_FLOOR_ID).toBe('ground')
  })
})

// Hinge and swing are optional and never defaulted. Absent means "not
// decided", and an undecided door draws no swing.
describe('door hinge and swing', () => {
  const withSwing = {
    ...v1Plan,
    openings: [{ ...v1Plan.openings[0], hinge: 'start', swing: 'left' }]
  }

  it('leaves a door without them untouched', () => {
    const [door] = parseFloorPlan(v1Plan).openings
    expect('hinge' in door).toBe(false)
    expect('swing' in door).toBe(false)
  })

  it('round-trips both values', () => {
    const parsed = parseFloorPlan(withSwing)
    expect(parsed.openings[0]).toMatchObject({ hinge: 'start', swing: 'left' })
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(withSwing)
  })

  it('keeps half a swing, so validation can warn about it', () => {
    const half = { ...v1Plan, openings: [{ ...v1Plan.openings[0], hinge: 'end' }] }
    const [door] = parseFloorPlan(half).openings
    expect(door.hinge).toBe('end')
    expect('swing' in door).toBe(false)
  })

  it('rejects values outside the two words', () => {
    const bad = (opening: object): unknown => ({ ...v1Plan, openings: [{ ...v1Plan.openings[0], ...opening }] })
    expect(safeParseFloorPlan(bad({ hinge: 'left' }))).toBeNull()
    expect(safeParseFloorPlan(bad({ swing: 'in' }))).toBeNull()
  })
})

// Room.use: optional and never defaulted, so a room says what it is for only when someone
// said so. An unknown value is read as not stated rather than failing the whole plan, because a
// throw here means no preview at all (main parses with `FloorPlanSchema.parse`).
describe('a room’s use', () => {
  const withUse = (use: unknown) => ({
    ...v1Plan,
    rooms: [{ id: 'r1', name: 'Bedroom 2', boundary: ['w1', 'w2'], floor: 'ground', use }]
  })

  it('is absent from an old plan’s rooms, which round-trip byte-stable', () => {
    const parsed = parseFloorPlan(v1Plan)
    expect('use' in parsed.rooms[0]!).toBe(false)
    expect(JSON.stringify(parsed.rooms)).toBe(JSON.stringify(v1Plan.rooms))
  })

  it('keeps each of the 27 values (CNT-5: past homes)', () => {
    for (const use of ROOM_USES) {
      const parsed = parseFloorPlan(withUse(use))
      expect(parsed.rooms[0]!.use).toBe(use)
      expect(JSON.parse(JSON.stringify(parsed)).rooms[0].use).toBe(use)
    }
    expect([...ROOM_USES]).toEqual([
      // LVL-3 added `lift`; CNT-5 the uses past homes.
      'bedroom', 'living', 'dining', 'kitchen', 'bathroom', 'toilet', 'utility', 'study',
      'office', 'meeting', 'reception', 'retail', 'classroom', 'treatment', 'waiting', 'sport', 'changing', 'staff', 'worship', 'assembly',
      'corridor', 'stair', 'lift', 'storage', 'plant', 'parking',
      // CNT-40: stations, wards, culture, the open-plan workplace, labs, cells and back of house.
      'platform', 'concourse', 'ticketing', 'checkin', 'security', 'gate', 'ward', 'operating', 'anteroom', 'gallery', 'auditorium',
      'stage', 'foyer', 'library', 'cafe', 'bar', 'breakout', 'print', 'comms', 'phonebooth', 'focus', 'wellbeing', 'training', 'lab',
      'cleanroom', 'cell', 'prep', 'other'
    ])
  })

  it.each([['a misspelled value', 'bedrom'], ['a number', 3], ['null', null]])(
    'reads %s as not stated and keeps the rest of the room',
    (_label, use) => {
      const parsed = parseFloorPlan(withUse(use))
      const room = parsed.rooms[0]!
      expect(room.use).toBeUndefined()
      expect(JSON.parse(JSON.stringify(room))).toEqual({
        id: 'r1', name: 'Bedroom 2', boundary: ['w1', 'w2'], floor: 'ground'
      })
    }
  )
})

/**
 * Known failures from the lab (entries Z-4 and Z-5), as expected failures. Each states the
 * right behaviour and fails today; when its fix lands, vitest reports it, and `it.fails`
 * becomes `it`. Each title starts with its lab entry ID.
 */
/** A dividing line (ARE-2): a virtual wall has no material, so 0 is what it may state and gets. */
describe('what kind of building it is (CNT-5)', () => {
  const base = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }

  it('is absent from an old plan, which round-trips with no key added', () => {
    const parsed = parseFloorPlan(v1Plan)
    expect('building' in parsed).toBe(false)
    expect(parsed.floors?.some((f) => 'building' in f) ?? false).toBe(false)
  })

  it('is on the plan, and a floor may say otherwise for itself: the shop under the flats', () => {
    const plan = parseFloorPlan({
      ...base,
      building: 'home',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0, building: 'shop' }, { id: 'L1', name: 'Floor 1', level: 1 }],
    })
    expect(plan.building).toBe('home')
    expect(floorBuilding(plan, 'ground')).toBe('shop')
    expect(floorBuilding(plan, 'L1')).toBe('home')
    expect(floorStatesBuilding(plan, 'ground')).toBe(true)
    expect(floorStatesBuilding(plan, 'L1')).toBe(false)
    expect(floorBuilding({ ...plan, building: undefined }, 'L1')).toBeUndefined()
  })

  it('takes only the kinds it knows, and a room only the tenures it knows', () => {
    expect(BUILDING_TYPES).toContain('office')
    expect(() => parseFloorPlan({ ...base, building: 'mall' })).toThrow()
    expect(() => parseFloorPlan({ ...base, rooms: [{ id: 'r', name: 'R', boundary: [], tenure: 'mine' }] })).toThrow()
    const room = parseFloorPlan({ ...base, rooms: [{ id: 'r', name: 'Shop 1', boundary: [], use: 'retail', tenure: 'commercial', roomType: 'Unit A' }] }).rooms[0]!
    expect(room).toMatchObject({ use: 'retail', tenure: 'commercial', roomType: 'Unit A' })
  })
})

describe('a virtual wall', () => {
  const line = (extra: object = {}) => ({ id: 'v', start: [0, 0], end: [1, 0], virtual: true, ...extra })
  const problems = (raw: unknown) => FloorPlanSchema.safeParse(raw).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

  // Lab AR-2, an expected failure until ARE-2.
  it('AR-2 a virtual wall may state thickness 0', () => {
    expect(() => parseFloorPlan({ walls: [line({ thickness: 0 })] })).not.toThrow()
  })

  // Lab Z-5: the plan nine test files read with JSON.parse was refused here, because its
  // dividing line has thickness 0 and height 0. An expected failure until ARE-2.
  it('Z-5 the shared fixture plan passes the schema', () => {
    const fixture: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/floor-plan.json'), 'utf8'))
    expect(safeParseFloorPlan(fixture)).not.toBeNull()
  })

  it('may state height 0', () => {
    expect(parseFloorPlan({ walls: [line({ thickness: 0, height: 0 })] }).walls[0]).toMatchObject({ thickness: 0, height: 0 })
  })

  it('gets thickness 0 and height 0 when it states neither', () => {
    expect(parseFloorPlan({ walls: [line()] }).walls[0]).toMatchObject({ thickness: 0, height: 0 })
  })

  it('keeps a thickness it states, which measuring ignores', () => {
    expect(parseFloorPlan({ walls: [line({ thickness: 0.1 })] }).walls[0]!.thickness).toBe(0.1)
  })

  it('is refused with a negative thickness or height, by name', () => {
    expect(problems({ walls: [line({ thickness: -0.1 })] })).toEqual(['walls.0.thickness: Number must be greater than or equal to 0'])
    expect(problems({ walls: [line({ height: -1 })] })).toEqual(['walls.0.height: Number must be greater than or equal to 0'])
  })
})

describe('a solid wall', () => {
  const solid = (extra: object = {}) => ({ id: 's', start: [0, 0], end: [1, 0], ...extra })
  const problems = (raw: unknown) => FloorPlanSchema.safeParse(raw).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

  it('still gets 0.2 m and 2.7 m when it states neither', () => {
    expect(parseFloorPlan({ walls: [solid()] }).walls[0]).toMatchObject({ thickness: 0.2, height: 2.7 })
    expect(parseFloorPlan({ walls: [solid({ virtual: false })] }).walls[0]).toMatchObject({ thickness: 0.2, height: 2.7 })
  })

  it('is still refused with thickness or height 0, with the same words as before', () => {
    expect(problems({ walls: [solid({ thickness: 0 })] })).toEqual(['walls.0.thickness: Number must be greater than 0'])
    expect(problems({ walls: [solid({ height: 0 })] })).toEqual(['walls.0.height: Number must be greater than 0'])
    expect(problems({ walls: [solid({ thickness: -1, height: 0 })] })).toEqual([
      'walls.0.thickness: Number must be greater than 0',
      'walls.0.height: Number must be greater than 0'
    ])
  })

  it('is refused with a thickness that is not a number', () => {
    expect(problems({ walls: [solid({ thickness: '0.2' })] })).toEqual(['walls.0.thickness: Expected number, received string'])
  })
})

/** ARE-10: a room may state its height, floor to ceiling, in metres. */
describe('a room’s height', () => {
  const withHeight = (height: unknown) => ({ ...v1Plan, rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2'], height }] })
  const problems = (raw: unknown) => FloorPlanSchema.safeParse(raw).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

  it('is absent from an old plan’s rooms, which round-trip byte-stable', () => {
    const parsed = parseFloorPlan(v1Plan)
    expect('height' in parsed.rooms[0]!).toBe(false)
    expect(JSON.stringify(parsed.rooms)).toBe(JSON.stringify(v1Plan.rooms))
  })

  it('keeps the height a room states', () => {
    expect(parseFloorPlan(withHeight(2.55)).rooms[0]!.height).toBe(2.55)
  })

  it('is refused at 0, below it, or as text, by name', () => {
    expect(problems(withHeight(0))).toEqual(['rooms.0.height: Number must be greater than 0'])
    expect(problems(withHeight(-2.4))).toEqual(['rooms.0.height: Number must be greater than 0'])
    expect(problems(withHeight('2.4'))).toEqual(['rooms.0.height: Expected number, received string'])
  })
})

describe('known failures (expected to fail until fixed)', () => {
  const rect = (extra: object = {}) =>
    ([[0, 0], [5, 0], [5, 4], [0, 4]] as const).map((start, i, all) => ({
      id: `w${i + 1}`, start, end: all[(i + 1) % 4], thickness: 0.2, height: 2.7, kind: 'exterior', ...extra
    }))

  // Lab MS-1: `thick` instead of `thickness` is dropped and the wall gets the 0.2 m default.
  it.fails('MS-1 a misspelt field is not dropped in silence', () => {
    const raw = { walls: rect({ thickness: undefined, thick: 0.4 }) }
    let said = false
    try {
      said = parseFloorPlan(raw).walls[0]!.thickness === 0.4
    } catch {
      said = true
    }
    expect(said).toBe(true)
  })
})

describe('the project id (QAR-5)', () => {
  it('is absent from an old plan, which gains no key', () => {
    const parsed = parseFloorPlan(v1Plan)
    expect('projectId' in parsed).toBe(false)
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(v1Plan)
  })

  it('round-trips when stated', () => {
    const plan = { ...v1Plan, projectId: '6f1c2a9e-0b7d-4c55-9e0a-3d2f1b8c7a64' }
    expect(parseFloorPlan(plan).projectId).toBe('6f1c2a9e-0b7d-4c55-9e0a-3d2f1b8c7a64')
    expect(JSON.parse(JSON.stringify(parseFloorPlan(plan)))).toEqual(plan)
  })

  it('is refused when empty, not text, or not one line', () => {
    for (const projectId of ['', 7, 'two\nlines']) {
      const result = FloorPlanSchema.safeParse({ ...v1Plan, projectId })
      expect(result.success, JSON.stringify(projectId)).toBe(false)
      if (!result.success) expect(result.error.issues[0]!.path).toEqual(['projectId'])
    }
  })
})
