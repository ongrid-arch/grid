import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOOR_ID } from '../../types/floorplan'
import {
  DEFAULT_FLOOR,
  defaultFloor,
  floorHasGeometry,
  floorOf,
  planFloors,
  planForFloor,
  resolveFloor,
  viewFloor,
  type FloorPlan
} from '..'

// Synthetic on purpose. `fixtures/floor-plan.json` is the shared fixture for
// conventions/geometry/revision/dimensions with hard-coded expectations, so
// multi-floor fixtures never touch it.
function wall(id: string, floor?: string): FloorPlan['walls'][number] {
  return {
    id,
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    height: 2.7,
    kind: 'interior',
    ...(floor ? { floor } : {})
  }
}

function room(id: string, boundary: string[], floor?: string): FloorPlan['rooms'][number] {
  return { id, name: id, boundary, ...(floor ? { floor } : {}) }
}

function opening(id: string, wallId: string): FloorPlan['openings'][number] {
  return { id, wall: wallId, type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 }
}

function plan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return { version: '1', units: 'm', walls: [], rooms: [], openings: [], ...overrides }
}

const twoFloors = plan({
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0 },
    { id: 'first', name: 'First floor', level: 1 }
  ],
  walls: [wall('g-w1', 'ground'), wall('g-w2', 'ground'), wall('f-w1', 'first')],
  rooms: [room('g-r1', ['g-w1', 'g-w2'], 'ground'), room('f-r1', ['f-w1'], 'first')],
  openings: [opening('g-o1', 'g-w1'), opening('f-o1', 'f-w1')]
})

describe('floorOf', () => {
  it('passes a stated floor through', () => {
    expect(floorOf(wall('w1', 'first'))).toBe('first')
    expect(floorOf(room('r1', [], 'basement'))).toBe('basement')
  })

  it('reads an unstated floor as the ground floor', () => {
    expect(floorOf(wall('w1'))).toBe(DEFAULT_FLOOR_ID)
    expect(floorOf({})).toBe(DEFAULT_FLOOR_ID)
  })

  it('agrees with the default floor', () => {
    expect(DEFAULT_FLOOR.id).toBe(DEFAULT_FLOOR_ID)
    expect(DEFAULT_FLOOR.level).toBe(0)
  })
})

describe('planFloors', () => {
  it('orders registry floors by level, not by array position', () => {
    const out = planFloors(
      plan({
        floors: [
          { id: 'first', name: 'First floor', level: 1 },
          { id: 'basement', name: 'Basement', level: -1 },
          { id: 'ground', name: 'Ground floor', level: 0 }
        ]
      })
    )

    expect(out.map((f) => f.id)).toEqual(['basement', 'ground', 'first'])
  })

  it('keeps registry order when levels tie', () => {
    const out = planFloors(
      plan({
        floors: [
          { id: 'b', name: 'B', level: 0 },
          { id: 'a', name: 'A', level: 0 }
        ]
      })
    )

    expect(out.map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('keeps a declared floor that has no geometry', () => {
    const out = planFloors(
      plan({
        floors: [
          { id: 'ground', name: 'Ground floor', level: 0 },
          { id: 'first', name: 'First floor', level: 1 }
        ],
        walls: [wall('w1', 'ground')]
      })
    )

    // "I want three storeys" is intent; the empty ones still get a tab.
    expect(out.map((f) => f.id)).toEqual(['ground', 'first'])
  })

  it('appends a floor that only an entity names, so geometry stays reachable', () => {
    const out = planFloors(
      plan({
        floors: [{ id: 'ground', name: 'Ground floor', level: 0 }],
        walls: [wall('w1', 'ground'), wall('w2', 'attic')]
      })
    )

    expect(out.map((f) => f.id)).toEqual(['ground', 'attic'])
  })

  it('appends entity-only floors in first-appearance order', () => {
    const out = planFloors(
      plan({
        walls: [wall('w1', 'roof'), wall('w2', 'cellar')],
        rooms: [room('r1', [], 'roof')]
      })
    )

    expect(out.map((f) => f.id)).toEqual(['roof', 'cellar'])
  })

  it('collapses a duplicated registry id, first entry winning', () => {
    const out = planFloors(
      plan({
        floors: [
          { id: 'ground', name: 'Ground floor', level: 0 },
          { id: 'ground', name: 'Duplicate', level: 5 }
        ]
      })
    )

    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('Ground floor')
  })

  it('gives a plan with no floor information exactly one ground floor', () => {
    expect(planFloors(plan())).toEqual([DEFAULT_FLOOR])
    expect(planFloors(plan({ walls: [wall('w1')], rooms: [room('r1', ['w1'])] }))).toEqual([
      DEFAULT_FLOOR
    ])
  })
})

describe('resolveFloor', () => {
  it('passes a floor the plan has through', () => {
    expect(resolveFloor(twoFloors, 'first')).toBe('first')
  })

  it('falls back to the default floor for one the plan does not have', () => {
    // The assistant deleting the floor being viewed must not blank the view.
    expect(resolveFloor(twoFloors, 'demolished')).toBe('ground')
  })

  it('falls back to the default floor when nothing is requested', () => {
    expect(resolveFloor(twoFloors, null)).toBe('ground')
    expect(resolveFloor(twoFloors, undefined)).toBe('ground')
    expect(resolveFloor(twoFloors)).toBe('ground')
  })

  it('opens on the ground floor, not the basement, by level and not by array position', () => {
    const withBasement = plan({
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'basement', name: 'Basement', level: -1 }
      ]
    })

    expect(resolveFloor(withBasement, null)).toBe('ground')
    expect(resolveFloor(withBasement, 'basement')).toBe('basement')
  })

  it('gives the ground floor for a plan with no floor information', () => {
    expect(resolveFloor(plan(), null)).toBe(DEFAULT_FLOOR_ID)
    expect(resolveFloor(plan(), 'anything')).toBe(DEFAULT_FLOOR_ID)
  })
})

describe('defaultFloor', () => {
  const basementAndGround = plan({
    floors: [
      { id: 'basement', name: 'Basement', level: -1 },
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ]
  })

  it('is the ground floor, not a basement below it', () => {
    expect(defaultFloor(basementAndGround)).toBe('ground')
  })

  it('is the first floor at level 0 when several share it', () => {
    const shared = plan({
      floors: [
        { id: 'cellar', name: 'Cellar', level: -1 },
        { id: 'east', name: 'East wing', level: 0 },
        { id: 'west', name: 'West wing', level: 0 }
      ]
    })
    expect(defaultFloor(shared)).toBe('east')
  })

  it('is the lowest floor of a plan that is all basement', () => {
    const allBasement = plan({
      floors: [
        { id: 'upper', name: 'Upper basement', level: -1 },
        { id: 'lower', name: 'Lower basement', level: -2 }
      ]
    })
    expect(defaultFloor(allBasement)).toBe('lower')
  })

  it('is the lowest floor when none is at level 0', () => {
    const upstairs = plan({
      floors: [
        { id: 'second', name: 'Second floor', level: 2 },
        { id: 'first', name: 'First floor', level: 1 }
      ]
    })
    expect(defaultFloor(upstairs)).toBe('first')
  })

  it('skips a basement when the floors above it have no level 0', () => {
    const noGround = plan({
      floors: [
        { id: 'basement', name: 'Basement', level: -1 },
        { id: 'first', name: 'First floor', level: 1 }
      ]
    })
    expect(defaultFloor(noGround)).toBe('first')
  })

  it('counts a floor only an unlabelled wall names as the ground', () => {
    const unlabelled = plan({
      floors: [{ id: 'cellar', name: 'Cellar', level: -1 }],
      walls: [wall('w1')]
    })
    expect(defaultFloor(unlabelled)).toBe(DEFAULT_FLOOR_ID)
  })

  it('gives the ground floor for a plan with no floor information', () => {
    expect(defaultFloor(plan())).toBe(DEFAULT_FLOOR_ID)
  })
})

describe('viewFloor', () => {
  const withBasement = plan({
    floors: [
      { id: 'basement', name: 'Basement', level: -1 },
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ]
  })

  it('passes a floor the plan has through, a basement included', () => {
    expect(viewFloor(withBasement, 'first')).toBe('first')
    expect(viewFloor(withBasement, 'basement')).toBe('basement')
  })

  it('falls back to the default floor for one the plan does not have', () => {
    expect(viewFloor(withBasement, 'demolished')).toBe('ground')
  })

  it('falls back to the default floor when nothing is requested', () => {
    expect(viewFloor(withBasement, null)).toBe('ground')
    expect(viewFloor(withBasement, undefined)).toBe('ground')
  })

  it('is what resolveFloor gives, so an export opens on the ground floor too', () => {
    expect(resolveFloor(withBasement, null)).toBe('ground')
  })
})

describe('planForFloor', () => {
  it('keeps only the walls and rooms of that floor', () => {
    const ground = planForFloor(twoFloors, 'ground')

    expect(ground.walls.map((w) => w.id)).toEqual(['g-w1', 'g-w2'])
    expect(ground.rooms.map((r) => r.id)).toEqual(['g-r1'])
  })

  it('carries openings with their wall, not by a floor of their own', () => {
    expect(planForFloor(twoFloors, 'first').openings.map((o) => o.id)).toEqual(['f-o1'])
  })

  it('treats an unstated floor as the ground floor', () => {
    const mixed = plan({ walls: [wall('w1'), wall('w2', 'first')] })

    expect(planForFloor(mixed, DEFAULT_FLOOR_ID).walls.map((w) => w.id)).toEqual(['w1'])
  })

  it('carries version, units, the registry and the reference image over untouched', () => {
    const withImage = plan({
      ...twoFloors,
      referenceImage: { path: 'assets/reference.png', opacity: 0.4 }
    })
    const slice = planForFloor(withImage, 'ground')

    expect(slice.version).toBe('1')
    expect(slice.units).toBe('m')
    expect(slice.floors).toEqual(withImage.floors)
    expect(slice.referenceImage).toEqual(withImage.referenceImage)
  })

  it('returns nothing for a floor the plan does not have', () => {
    const slice = planForFloor(twoFloors, 'nowhere')

    expect(slice.walls).toEqual([])
    expect(slice.rooms).toEqual([])
    expect(slice.openings).toEqual([])
  })

  // Invariants — these are what make cross-floor bleed impossible, rather than
  // merely absent from the cases above.
  it('partitions the plan: nothing lost, nothing duplicated', () => {
    const slices = planFloors(twoFloors).map((f) => planForFloor(twoFloors, f.id))

    expect(slices.reduce((n, s) => n + s.walls.length, 0)).toBe(twoFloors.walls.length)
    expect(slices.reduce((n, s) => n + s.rooms.length, 0)).toBe(twoFloors.rooms.length)
    expect(slices.reduce((n, s) => n + s.openings.length, 0)).toBe(twoFloors.openings.length)

    const seen = slices.flatMap((s) => s.walls.map((w) => w.id))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('leaves every slice internally complete — each opening has its wall', () => {
    for (const floor of planFloors(twoFloors)) {
      const slice = planForFloor(twoFloors, floor.id)
      const ids = new Set(slice.walls.map((w) => w.id))

      for (const o of slice.openings) expect(ids.has(o.wall)).toBe(true)
    }
  })

  it('drops an opening whose wall is on another floor', () => {
    // The assistant can write this; the slice must not carry the orphan along.
    const crossed = plan({
      floors: twoFloors.floors,
      walls: [wall('g-w1', 'ground')],
      openings: [opening('o1', 'g-w1'), opening('o2', 'missing')]
    })

    expect(planForFloor(crossed, 'ground').openings.map((o) => o.id)).toEqual(['o1'])
  })

  it('drops an opening whose wall id names a wall on more than one floor', () => {
    // Reusing `w1` on each storey is the natural mistake, and the slice is
    // where it becomes visible: both floors match the id, so the same door gets
    // drawn twice. The id belongs to no single storey, so it goes nowhere.
    const collided = plan({
      floors: twoFloors.floors,
      walls: [wall('w1', 'ground'), wall('w1', 'first')],
      openings: [opening('o1', 'w1')]
    })

    expect(planForFloor(collided, 'ground').openings).toEqual([])
    expect(planForFloor(collided, 'first').openings).toEqual([])
  })

  it('still carries an opening whose wall id is used once', () => {
    // Guard: the check above must key on the collision, not on the slice having
    // a wall of that id at all.
    const sound = plan({
      floors: twoFloors.floors,
      walls: [wall('g-w1', 'ground'), wall('f-w1', 'first')],
      openings: [opening('o1', 'g-w1')]
    })

    expect(planForFloor(sound, 'ground').openings.map((o) => o.id)).toEqual(['o1'])
  })
})

describe('floorHasGeometry', () => {
  it('is true for a floor with a wall or a room', () => {
    expect(floorHasGeometry(twoFloors, 'ground')).toBe(true)
    expect(floorHasGeometry(twoFloors, 'first')).toBe(true)
  })

  it('is false for a declared but empty floor', () => {
    const empty = plan({
      floors: [{ id: 'attic', name: 'Attic', level: 2 }],
      walls: [wall('w1', 'ground')]
    })

    expect(floorHasGeometry(empty, 'attic')).toBe(false)
  })

  it('is false for a floor the plan does not have at all', () => {
    expect(floorHasGeometry(twoFloors, 'nowhere')).toBe(false)
  })
})
