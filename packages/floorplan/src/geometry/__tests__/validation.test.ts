import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { planFloors, planForFloor } from '../floors'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'
import { validatePlan } from '../validate'
import { wallParts } from '../wall'
import { parseFloorPlan } from '../../types/floorplan'
import { outline } from '../../test-support/outline'

/**
 * What the AI is going to get wrong.
 *
 * Producing valid plans consistently is the project's number one risk, so a
 * malformed plan is the normal case, not an edge case. The renderer must draw
 * what it can and report the rest — never break.
 */

/** A 4×4 room with a door that fits. */
function basePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 4], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [4, 4], end: [0, 4], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, height: 2.1, sill: 0 }
    ]
  }
}

const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => i.code)

describe('a sound plan passes clean', () => {
  it('reports nothing', () => {
    expect(codes(basePlan())).toEqual([])
  })
})

describe('geometrically impossible plans', () => {
  it('catches a door wider than its wall', () => {
    const plan = basePlan()
    plan.openings[0]!.width = 5
    expect(codes(plan)).toContain('opening/out-of-wall')
  })

  it('catches a door running past the far end', () => {
    const plan = basePlan()
    plan.openings[0]!.offset = 3.8
    expect(codes(plan)).toContain('opening/out-of-wall')
  })

  it('catches a window poking through the ceiling', () => {
    const plan = basePlan()
    plan.openings[0] = { ...plan.openings[0]!, type: 'window', sill: 1.8, height: 1.2 }
    expect(codes(plan)).toContain('opening/too-tall')
  })

  it('catches an opening on a wall that does not exist', () => {
    const plan = basePlan()
    plan.openings[0]!.wall = 'w99'
    expect(codes(plan)).toContain('opening/missing-wall')
  })

  it('catches two overlapping openings on the same wall', () => {
    const plan = basePlan()
    plan.openings.push({
      id: 'o2',
      wall: 'w1',
      type: 'window',
      offset: 1.9,
      width: 1,
      height: 1,
      sill: 0.9
    })
    expect(codes(plan)).toContain('opening/overlap')
  })

  it('skips an overlapping opening instead of drawing two holes in one place', () => {
    const plan = basePlan()
    plan.openings.push({ id: 'o2', wall: 'w1', type: 'window', offset: 1.9, width: 1, height: 1, sill: 0.9 })
    const { broken } = validatePlan(plan)
    // The opening nearer wall.start is kept; the one running into it is skipped.
    expect(broken.has('o1')).toBe(false)
    expect(broken.has('o2')).toBe(true)
    expect(buildFloorPlan(plan).openings.map((o) => o.id)).toEqual(['o1'])
    expect(buildScene(plan).issues.some((i) => i.code === 'opening/overlap')).toBe(true)
  })

  it('catches an opening that sits inside a wider one, not just its neighbour', () => {
    // A = [0.2, 3.2], B = [0.3, 0.7], C = [2.0, 2.4]: B and C both sit inside A.
    const plan = basePlan()
    plan.openings = [
      { id: 'A', wall: 'w1', type: 'window', offset: 0.2, width: 3, height: 1, sill: 0.9 },
      { id: 'B', wall: 'w1', type: 'window', offset: 0.3, width: 0.4, height: 1, sill: 0.9 },
      { id: 'C', wall: 'w1', type: 'window', offset: 2.0, width: 0.4, height: 1, sill: 0.9 }
    ]
    const { issues, broken } = validatePlan(plan)
    const flagged = issues.filter((i) => i.code === 'opening/overlap').map((i) => i.id)
    expect(flagged.sort()).toEqual(['B', 'C'])
    expect([...broken].filter((id) => ['A', 'B', 'C'].includes(id)).sort()).toEqual(['B', 'C'])
  })

  it('never draws two openings that overlap on one wall (invariant)', () => {
    // Every pair of drawn openings on a wall is disjoint, whatever the spans.
    const spans: Array<[number, number]> = [
      [0.1, 1], [0.5, 0.5], [1.2, 0.3], [1.4, 1.2], [2.5, 0.4], [2.6, 0.2], [3, 0.8]
    ]
    for (let mask = 1; mask < 1 << spans.length; mask++) {
      const plan = basePlan()
      plan.openings = spans
        .filter((_, i) => mask & (1 << i))
        .map(([offset, width], i) => ({ id: `o${i}`, wall: 'w1', type: 'window' as const, offset, width, height: 1, sill: 0.9 }))
      const drawn = buildFloorPlan(plan).openings
      const byId = new Map(plan.openings.map((o) => [o.id, o]))
      for (let i = 0; i < drawn.length; i++) {
        for (let j = i + 1; j < drawn.length; j++) {
          const a = byId.get(drawn[i]!.id)!
          const b = byId.get(drawn[j]!.id)!
          const disjoint = a.offset + a.width <= b.offset + 1e-9 || b.offset + b.width <= a.offset + 1e-9
          expect(disjoint, `${a.id} and ${b.id} overlap`).toBe(true)
        }
      }
    }
  })

  it('catches a zero-length wall', () => {
    const plan = basePlan()
    plan.walls[0]!.end = [0, 0]
    expect(codes(plan)).toContain('wall/zero-length')
  })

  it('catches a wall with no thickness that is not marked virtual', () => {
    const plan = basePlan()
    plan.walls[0]!.thickness = 0
    expect(codes(plan)).toContain('wall/no-thickness')
  })

  it('catches a room referencing a missing wall', () => {
    const plan = basePlan()
    plan.rooms[0]!.boundary = ['w1', 'w2', 'w3', 'w99']
    expect(codes(plan)).toContain('room/unclosed')
  })

  it('catches a boundary with consecutive parallel walls', () => {
    const plan = basePlan()
    plan.rooms[0]!.boundary = ['w1', 'w3', 'w2', 'w4']
    expect(codes(plan)).toContain('room/unclosed')
  })
})

describe('a broken plan still gets drawn, minus what fails', () => {
  it('skips the impossible opening but keeps wall and room', () => {
    const plan = basePlan()
    plan.openings[0]!.width = 5

    const drawing = buildFloorPlan(plan)

    expect(drawing.issues.length).toBeGreaterThan(0)
    expect(drawing.openings).toHaveLength(0)
    // The wall stays whole, without the opening that could not be cut.
    expect(drawing.walls.find((w) => w.id === 'w1')!.slices).toHaveLength(1)
    expect(drawing.rooms).toHaveLength(1)
  })

  it('skips the broken room but keeps the walls', () => {
    const plan = basePlan()
    plan.rooms[0]!.boundary = ['w1', 'w3', 'w2', 'w4']

    const drawing = buildFloorPlan(plan)

    expect(drawing.rooms).toHaveLength(0)
    expect(drawing.walls).toHaveLength(4)
  })

  it('never throws, however broken the plan is', () => {
    const plan = basePlan()
    plan.walls[1]!.end = [4, 0]
    plan.openings[0]!.offset = -10
    plan.rooms[0]!.boundary = ['w99']

    expect(() => buildFloorPlan(plan)).not.toThrow()
    expect(() => buildScene(plan)).not.toThrow()
  })
})

/**
 * Floors (C5).
 *
 * The flat `floor` field keeps ids globally unique, which the 3D mesh cache
 * depends on — but it also means nothing structurally stops a room on one
 * storey from naming a wall on another. These checks are that missing wall.
 */

/** The same 4×4 room, lifted onto a named floor, plus a second storey. */
function twoFloorPlan(): FloorPlan {
  const plan = basePlan()
  return {
    ...plan,
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [
      ...plan.walls.map((wall) => ({ ...wall, floor: 'ground' })),
      { id: 'f1', start: [0, 0] as [number, number], end: [4, 0] as [number, number], thickness: 0.2, height: 2.5, kind: 'exterior' as const, floor: 'first' }
    ],
    rooms: plan.rooms.map((room) => ({ ...room, floor: 'ground' }))
  }
}

describe('a room reaching onto another floor', () => {
  it('is reported once, as an error', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'first' // w1 leaves the ground floor, r1 still names it

    const crossFloor = validatePlan(plan).issues.filter((i) => i.code === 'room/cross-floor')

    expect(crossFloor).toHaveLength(1)
    expect(crossFloor[0]!.entity).toBe('room')
    expect(crossFloor[0]!.id).toBe('r1')
    expect(crossFloor[0]!.severity).toBe('error')
  })

  it('marks the room broken so the drawing skips it', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'first'

    expect(validatePlan(plan).broken.has('r1')).toBe(true)
    expect(buildFloorPlan(plan).rooms).toHaveLength(0)
  })

  it('does not also report it as unclosed — one fault, one issue', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'first'

    expect(codes(plan).filter((c) => c.startsWith('room/'))).toEqual(['room/cross-floor'])
  })
})

describe('a floor nobody declared', () => {
  it('is an error on the wall that names it, which is left out (LVL-1)', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'attic'

    const unknown = validatePlan(plan).issues.filter((i) => i.code === 'wall/unknown-floor')

    expect(unknown).toHaveLength(1)
    // LVL-1 (lab MS-10): a floor the plan does not list, named outright, is an error with the
    // nearest listed id, and the wall is left out. Before LVL-1: a warning, and drawn.
    expect(unknown[0]!.severity).toBe('error')
    expect(unknown[0]!.message).toMatch(/the nearest floor it lists is "/)
    expect(validatePlan(plan).broken.has('w1')).toBe(true)
  })

  it('is an error on a room that names it (LVL-1)', () => {
    const plan = twoFloorPlan()
    plan.rooms[0]!.floor = 'attic'

    expect(codes(plan)).toContain('room/unknown-floor')
  })

  it('stays quiet when there is no registry to be absent from', () => {
    const plan = basePlan()
    plan.walls[0]!.floor = 'wherever'
    plan.rooms[0]!.floor = 'wherever'

    expect(codes(plan).filter((c) => c.endsWith('unknown-floor'))).toEqual([])
  })

  it('stays quiet when the registry is empty', () => {
    const plan = { ...basePlan(), floors: [] }
    plan.walls[0]!.floor = 'wherever'

    expect(codes(plan).filter((c) => c.endsWith('unknown-floor'))).toEqual([])
  })
})

describe('a registry that lists the same floor twice', () => {
  it('warns once, and the first entry is the one that counts', () => {
    const plan = {
      ...twoFloorPlan(),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'ground', name: 'Duplicate', level: 9 }
      ]
    }

    const dupes = validatePlan(plan).issues.filter((i) => i.code === 'plan/duplicate-floor')

    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.entity).toBe('plan')
    expect(dupes[0]!.severity).toBe('warning')
  })
})

describe('floors do not disturb a sound plan', () => {
  it('leaves a well-formed two-floor plan clean', () => {
    expect(validatePlan(twoFloorPlan()).issues).toEqual([])
  })

  it('leaves a plan that never mentions floors exactly as it was', () => {
    expect(validatePlan(basePlan()).issues).toEqual([])
  })

  it('validates each floor of a sound plan clean on its own', () => {
    const plan = twoFloorPlan()

    for (const floor of planFloors(plan)) {
      expect(validatePlan(planForFloor(plan, floor.id)).issues).toEqual([])
    }
  })

  it('never throws on garbage floor values', () => {
    const plan = twoFloorPlan()
    plan.walls[0]!.floor = 'nowhere'
    plan.rooms[0]!.floor = 'elsewhere'

    expect(() => validatePlan(plan)).not.toThrow()
    expect(() => buildFloorPlan(plan)).not.toThrow()
    expect(() => buildScene(plan)).not.toThrow()
  })
})

/**
 * Duplicate ids.
 *
 * Ids are the only handle anything has on anything else: `indexPlan` builds
 * `wallsById` with `set()`, so the last duplicate silently wins every lookup.
 * The assistant is told ids are unique across the whole file, but nothing
 * enforced it — and multi-floor plans make collisions easy, because the natural
 * mistake is to reuse `w1` on each storey.
 *
 * Marking them broken rather than picking a winner is the point: when two walls
 * answer to `w1`, nobody can know which one the room meant, and drawing one of
 * them is drawing something the user never described.
 */
describe('an id used twice', () => {
  /** The same plan with `w2` renamed to `w1`, so two walls answer to `w1`. */
  function duplicateWallPlan(): FloorPlan {
    const plan = basePlan()
    plan.walls[1]!.id = 'w1'
    plan.rooms[0]!.boundary = ['w1', 'w1', 'w3', 'w4']
    return plan
  }

  it('is reported once, as an error, however many entities share it', () => {
    const plan = basePlan()
    plan.walls[1]!.id = 'w1'
    plan.walls[2]!.id = 'w1'

    const dupes = validatePlan(plan).issues.filter((i) => i.code === 'plan/duplicate-id')

    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.id).toBe('w1')
    expect(dupes[0]!.severity).toBe('error')
  })

  it('marks the id broken, so nothing is drawn from a guess', () => {
    const { broken } = validatePlan(duplicateWallPlan())

    expect(broken.has('w1')).toBe(true)
    expect(buildFloorPlan(duplicateWallPlan()).walls.map((w) => w.id)).not.toContain('w1')
  })

  it('takes the room resting on it down too, rather than drawing half a room', () => {
    // A boundary that still closes perfectly: every id resolves, the polygon is
    // sound, and the only thing wrong is that `w1` names two walls. Without the
    // collision this room draws clean, so nothing but the duplicate can fault it.
    const plan = twoFloorPlan()
    plan.walls[4]!.id = 'w1'

    expect(validatePlan(plan).broken.has('r1')).toBe(true)
    expect(buildFloorPlan(plan).rooms).toHaveLength(0)
  })

  it('reports the duplicate itself, not a bogus unclosed room', () => {
    const plan = twoFloorPlan()
    plan.walls[4]!.id = 'w1'

    expect(codes(plan).filter((c) => c.startsWith('room/'))).toEqual(['room/broken-wall'])
  })

  it('catches a collision between two different kinds of entity', () => {
    // `broken` is one flat set of ids, so a room named after a wall inherits
    // that wall's fate. The namespace is the whole file, not one array.
    const plan = basePlan()
    plan.rooms[0]!.id = 'w1'

    expect(codes(plan)).toContain('plan/duplicate-id')
  })

  it('catches two openings sharing an id', () => {
    const plan = basePlan()
    plan.openings.push({ ...plan.openings[0]!, offset: 2.6 })

    expect(codes(plan)).toContain('plan/duplicate-id')
  })

  it('does not blame the cross-floor check for an ambiguous lookup', () => {
    // `wallsById` would resolve the room's `w1` to whichever came last — which
    // may sit on another floor. Reporting that as `room/cross-floor` would be a
    // coin flip dressed up as a diagnosis.
    const plan = twoFloorPlan()
    plan.walls[4]!.id = 'w1' // the first-floor wall now collides with a ground one

    expect(codes(plan)).toContain('plan/duplicate-id')
    expect(codes(plan)).not.toContain('room/cross-floor')
  })

  it('stays quiet on a plan whose ids are all distinct', () => {
    expect(codes(basePlan())).not.toContain('plan/duplicate-id')
    expect(codes(twoFloorPlan())).not.toContain('plan/duplicate-id')
  })

  it('never throws', () => {
    const plan = duplicateWallPlan()

    expect(() => validatePlan(plan)).not.toThrow()
    expect(() => buildFloorPlan(plan)).not.toThrow()
    expect(() => buildScene(plan)).not.toThrow()
  })
})

/**
 * Floor ids are compared exactly, so `"Ground"` and `"ground"` are two floors.
 *
 * Deliberately a warning and not a normalisation: folding them together would
 * silently merge two storeys the file keeps apart, and which name then wins is
 * unanswerable. C5 is a closed convention — changing how a floor id is matched
 * is a team decision, not a bug fix. Saying so out loud is the part that
 * belongs here.
 */
describe('floor ids that differ only by case or spacing', () => {
  it('warns, naming both, without merging them', () => {
    const plan = {
      ...twoFloorPlan(),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'Ground ', name: 'Ground floor again', level: 1 }
      ]
    }

    const similar = validatePlan(plan).issues.filter((i) => i.code === 'plan/similar-floor-id')

    expect(similar).toHaveLength(1)
    expect(similar[0]!.severity).toBe('warning')
    expect(similar[0]!.message).toContain('Ground ')
    expect(planFloors(plan).map((f) => f.id)).toContain('Ground ')
  })

  it('says nothing when the ids are properly distinct', () => {
    expect(codes(twoFloorPlan())).not.toContain('plan/similar-floor-id')
  })
})

/** Known failures from the lab (entry Z-4) that MSG-16 fixed. */
describe('lab failures fixed by MSG-16', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const issuesOf = (plan: FloorPlan) => validatePlan(plan).issues
  const divider = { id: 'v', start: [2.5, 0] as P, end: [2.5, 4] as P, virtual: true, height: 2.7 }

  it('MS-8 a door on a virtual wall is reported', () => {
    const { walls, room } = outline(RECT)
    const plan = planOf({
      walls: [...walls, divider],
      rooms: [room],
      openings: [{ id: 'd', wall: 'v', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    })
    // About the door itself. The dividing line also splits the room, which ARE-4 reports as a
    // room that does not match its space; that line is not what this probe asks for.
    expect(issuesOf(plan).some((i) => i.entity === 'opening' && i.id === 'd')).toBe(true)
  })
})

/** Known failures from the lab (entry Z-4) that MSG-6 fixed. */
describe('lab failures fixed by MSG-6', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]

  // The later of the two is refused and named; the first keeps its id, so the room on it is drawn.
  it('MS-9 two ids that differ only by a trailing space are reported', () => {
    const { walls, room } = outline(RECT)
    const plan = parseFloorPlan({ walls: [...walls, { ...walls[0]!, id: 'w1 ', start: [10, 10], end: [12, 10] }], rooms: [room] })
    const result = validatePlan(plan)
    expect(result.issues.filter((i) => i.severity === 'error').map((i) => [i.code, i.entity, i.id])).toEqual([['plan/similar-id', 'wall', 'w1 ']])
    expect([...result.broken]).toEqual(['w1 '])
  })
})

/** Known failures from the lab (entry Z-4) that LVL-1 fixed. */
describe('lab failures fixed by LVL-1', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]

  // Lab MS-10 (as corrected by the lab): with a floors list the warning already fired; without
  // one nothing did. LVL-1 makes it an error with the id the slip looks like.
  it('MS-10 a misspelt floor is reported when the plan lists no floors', () => {
    const { walls, room } = outline(RECT)
    const plan = parseFloorPlan({
      walls: walls.map((w, i) => ({ ...w, floor: i === 0 ? 'frist' : 'first' })),
      rooms: [{ ...room, floor: 'first' }]
    })
    const found = validatePlan(plan).issues.filter((i) => /frist/.test(i.message))
    expect(found.map((i) => [i.code, i.entity, i.id, i.severity])).toEqual([['wall/unknown-floor', 'wall', 'w1', 'error']])
    expect(found[0]!.message).toContain('spelt like floor "first"')
  })

  // Lab MS-10's other half: it passed before LVL-1, as a warning on the wall. LVL-1 made it an
  // error, as it is without a floors list.
  it('MS-10 a misspelt floor is reported when the plan lists its floors', () => {
    const { walls, room } = outline(RECT)
    const plan = parseFloorPlan({
      floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
      walls: walls.map((w, i) => (i === 0 ? { ...w, floor: 'frist' } : w)),
      rooms: [room]
    })
    const found = validatePlan(plan).issues.filter((i) => /frist/.test(i.message))
    expect(found.map((i) => [i.code, i.entity, i.id, i.severity])).toEqual([['wall/unknown-floor', 'wall', 'w1', 'error']])
  })
})

/**
 * Known failures from the lab (entry Z-4) that MSG-12 fixed. MS-15 ran as an expected failure
 * above until walls were compared with walls (`wallFaults.ts`).
 */
describe('lab failures fixed by MSG-12', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)

  it('MS-15 a copy of a wall under a new id is reported', () => {
    const { walls, room } = outline(RECT)
    const issues = validatePlan(planOf({ walls: [...walls, { ...walls[0]!, id: 'copy' }], rooms: [room] })).issues
    expect(issues.map((i) => [i.code, i.entity, i.id, i.severity])).toEqual([['wall/duplicate', 'wall', 'copy', 'warning']])
    expect(issues[0]!.message).toBe(
      'Wall "copy" lies on top of wall "w1" for 5.00 m: the drawing and every export show that stretch twice. Fix: remove wall "copy".'
    )
  })
})

/**
 * Known failures from the lab (entry Z-4) that MSG-15 fixed, and the lab entries behind its table
 * of tolerances and limits (MS-16, MS-3, T-7, AE-6). MS-3 and MS-16 ran as expected failures
 * above until the table was there.
 */
describe('lab failures fixed by MSG-15', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const issuesOf = (plan: FloorPlan) => validatePlan(plan).issues
  const codesOf = (plan: FloorPlan) => issuesOf(plan).map((i) => [i.code, i.id])

  it('MS-3 a wall 27 m high in a house is worth a warning', () => {
    const { walls, room } = outline(RECT)
    walls[0] = { ...walls[0]!, height: 27 }
    const issues = issuesOf(planOf({ walls, rooms: [room] }))
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['wall/size-question', 'w1', 'warning']])
    expect(issues[0]!.message).toBe(
      'Wall "w1" is 27.00 m high, the others on its floor typically 2.70 m: is that meant? Grid stands ' +
        'a storey on its tallest wall, so this one makes the storey 27.00 m high. The limit is ' +
        "Grid's own, for catching a slipped digit or unit, and no rule."
    )
  })

  // Lab MS-16: the wall is 4.8996 m long, so the door "runs from 4.00 to 4.90" only by rounding.
  it('MS-16 a door flush with the end of an angled wall is accepted', () => {
    const len = 4.8996
    const a = (33 * Math.PI) / 180
    const wall = { id: 'w', start: [0, 0], end: [len * Math.cos(a), len * Math.sin(a)], thickness: 0.2, height: 2.7, kind: 'exterior' }
    const plan = planOf({ walls: [wall], openings: [{ id: 'd', wall: 'w', type: 'door', offset: 4.0, width: 0.9, height: 2.1 }] })
    expect(issuesOf(plan)).toEqual([])
  })

  // Lab L-5: wall ends rounded to the millimetre, each door placed to finish at the wall's
  // intended end. 208 of 400 were refused before.
  it('MS-16 accepts 400 doors flush with the end of walls whose ends were rounded to the millimetre', () => {
    let seed = 7
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const mm = (v: number): number => Math.round(v * 1000) / 1000
    let refused = 0
    let overran = 0
    for (let i = 0; i < 400; i++) {
      const length = 2 + random() * 6
      const angle = random() * 2 * Math.PI
      const start: P = [mm(random() * 20), mm(random() * 20)]
      const end: P = [mm(start[0] + length * Math.cos(angle)), mm(start[1] + length * Math.sin(angle))]
      const width = 0.9
      const wall = { id: 'w', start, end, thickness: 0.2, height: 2.7, kind: 'exterior' }
      const opening = { id: 'd', wall: 'w', type: 'door', offset: length - width, width, height: 2.1 }
      const drawn = Math.hypot(end[0] - start[0], end[1] - start[1])
      if (length > drawn) overran++
      if (issuesOf(planOf({ walls: [wall], openings: [opening] })).length > 0) refused++
    }
    expect(overran).toBeGreaterThan(150)
    expect(refused).toBe(0)
  })

  it('MS-16 refuses an overrun past the millimetre, stating it and the offset that fits', () => {
    const wall = { id: 'w', start: [0, 0], end: [4.8996, 0], thickness: 0.2, height: 2.7 }
    const plan = planOf({ walls: [wall], openings: [{ id: 'd', wall: 'w', type: 'door', offset: 4.01, width: 0.9, height: 2.1 }] })
    const issues = issuesOf(plan)
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['opening/out-of-wall', 'd', 'error']])
    expect(issues[0]!.message).toBe(
      'Opening "d" runs from 4.01 to 4.91 m on wall "w", which is 4.8996 m long: it runs 10 mm past ' +
        'the end of the wall, more than the 1 mm Grid allows. An offset from 0.00 to 3.9996 m fits; at its ' +
        'offset of 4.01 m, a width up to 0.8896 m fits.'
    )
  })

  it('MS-16 says so when the opening is wider than its wall', () => {
    const wall = { id: 'w', start: [0, 0], end: [0.8, 0], thickness: 0.2, height: 2.7 }
    const plan = planOf({ walls: [wall], openings: [{ id: 'd', wall: 'w', type: 'door', offset: 0, width: 0.9, height: 2.1 }] })
    expect(issuesOf(plan)[0]!.message).toMatch(/runs 100 mm past the end of the wall, more than the 1 mm Grid allows\. It is 100 mm wider than the wall is long; at its offset of 0\.00 m, a width up to 0\.80 m fits\.$/)
  })

  it('MS-16 draws a door that runs a hair past its wall within the wall', () => {
    const wall = { id: 'w', start: [0, 0], end: [4.8996, 0], thickness: 0.2, height: 2.7 }
    const plan = planOf({ walls: [wall], openings: [{ id: 'd', wall: 'w', type: 'door', offset: 4.0, width: 0.9, height: 2.1 }] })
    expect(validatePlan(plan).broken.size).toBe(0)
    const parts = wallParts(plan.walls[0]!, plan.openings)
    expect(Math.max(...parts.map((p) => p.to))).toBeCloseTo(4.8996, 9)
    expect(parts.map((p) => p.kind)).toEqual(['solid', 'lintel'])
    expect(buildScene(plan).walls).toHaveLength(1)
  })

  it('MS-3 asks whether a flat typed in feet is in feet', () => {
    const feet = 1 / 0.3048
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]].map(([x, y]) => [x! * feet, y! * feet] as P), {
      thickness: [0.2 * feet, 0.2 * feet, 0.2 * feet, 0.2 * feet]
    })
    const tall = walls.map((w) => ({ ...w, height: 2.7 * feet }))
    const plan = planOf({
      walls: tall,
      rooms: [{ ...room, use: 'bedroom' }],
      openings: [{ id: 'd', wall: 'w1', type: 'door', offset: 1, width: 0.9 * feet, height: 2.1 * feet }]
    })
    const issues = issuesOf(plan)
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['plan/units-question', 'plan', 'warning']])
    expect(issues[0]!.message).toBe(
      'Is this plan in feet? Its walls are typically 8.86 m high and 0.656 m thick, and its doors ' +
        '2.95 m wide: read as feet, those are 2.70 m, 0.20 m and 0.90 m. Grid reads every size as ' +
        'metres. If the plan was typed in feet, multiply every length by 0.3048 (wall points, ' +
        'thickness and height; opening offset, width, sill and height).'
    )
  })

  it('MS-3 asks about millimetres as well, and says nothing about a plan in metres', () => {
    const { walls, room } = outline(RECT)
    const inMm = walls.map((w) => ({
      ...w,
      start: [w.start[0] * 1000, w.start[1] * 1000] as P,
      end: [w.end[0] * 1000, w.end[1] * 1000] as P,
      thickness: w.thickness * 1000,
      height: w.height * 1000
    }))
    const codes = issuesOf(planOf({ walls: inMm, rooms: [room] })).map((i) => i.code)
    expect(codes).toContain('plan/units-question')
    expect(issuesOf(planOf({ walls: inMm, rooms: [room] })).find((i) => i.code === 'plan/units-question')!.message).toMatch(/^Is this plan in millimetres\?/)
    expect(issuesOf(planOf({ walls, rooms: [room] }))).toEqual([])
  })

  it('MS-3 asks about a wall far higher than any home has, where the plan says it is a home', () => {
    const { walls, room } = outline(RECT)
    const high = walls.map((w) => ({ ...w, height: 12 }))
    expect(codesOf(planOf({ walls: high, rooms: [{ ...room, use: 'storage' }] }))).toEqual([])
    const issues = issuesOf(planOf({ walls: high, rooms: [{ ...room, use: 'bedroom' }] }))
    expect(issues.map((i) => i.code)).toEqual(['wall/size-question', 'wall/size-question', 'wall/size-question', 'wall/size-question'])
    expect(issues[0]!.message).toMatch(
      /^Wall "w1" is 12\.00 m high: is that meant\? Grid asks about walls higher than 10\.00 m in a home \(a room in this plan is a bedroom or a living room\)/
    )
  })

  it('WRT-22 reads the kind of building before the units question: a warehouse with 12 m walls is in metres', () => {
    const { walls, room } = outline(RECT.map(([x, y]) => [x * 20, y * 20] as P), { thickness: [0.3, 0.3, 0.3, 0.3] })
    const tall = walls.map((w) => ({ ...w, height: 12 }))
    expect(issuesOf(planOf({ walls: tall, rooms: [room] })).map((i) => i.code)).toContain('plan/units-question')
    for (const building of ['warehouse', 'industry', 'assembly', 'sport']) {
      expect(issuesOf(planOf({ walls: tall, rooms: [room], building })).map((i) => i.code), building).not.toContain('plan/units-question')
      expect(issuesOf(planOf({ walls: tall, rooms: [room], floors: [{ id: 'ground', name: 'Ground', level: 0, building }] })).map((i) => i.code), building).not.toContain('plan/units-question')
    }
  })

  it('MS-3 asks about a door one nanometre wide, and still counts it as a way through', () => {
    const { walls, room } = outline(RECT)
    const plan = planOf({ walls, rooms: [room], openings: [{ id: 'd', wall: 'w1', type: 'door', offset: 1, width: 1e-9, height: 2.1 }] })
    const issues = issuesOf(plan)
    expect(issues.map((i) => [i.code, i.id])).toEqual([['opening/size-question', 'd']])
    expect(issues[0]!.message).toMatch(/^Door "d" is 1e-9 m wide: is that meant\? Grid asks about openings narrower than 0\.20 m\. It still counts as a way through\./)
  })

  // Lab T-7: JSON reads 1e400 as infinity, and the schema used to accept it.
  it('T-7 refuses a number too big to hold', () => {
    const { walls, room } = outline(RECT)
    const text = JSON.stringify({ walls, rooms: [room] }).replace('"thickness":0.2', '"thickness":1e400')
    const raw: unknown = JSON.parse(text)
    expect(() => parseFloorPlan(raw)).toThrow(/finite number: this one is too large to hold and reads as infinity/)
    const infinite = JSON.parse(JSON.stringify({ walls, rooms: [room] }).replace('"end":[5,0]', '"end":[1e400,0]')) as unknown
    expect(() => parseFloorPlan(infinite)).toThrow(/finite number/)
  })

  it('T-7 refuses a wall 1e9 m thick, and every size past 10,000 km', () => {
    const { walls, room } = outline(RECT)
    walls[0] = { ...walls[0]!, thickness: 1e9 }
    const result = validatePlan(planOf({ walls, rooms: [room] }))
    expect(result.issues.map((i) => [i.code, i.id, i.severity])).toEqual([
      ['wall/too-large', 'w1', 'error'],
      ['room/broken-wall', 'r1', 'error']
    ])
    expect(result.issues[0]!.message).toBe(
      'Wall "w1": its thickness is 1000000000 m, past the 10,000 km Grid accepts. A number this large ' +
        'is no building: most likely a digit or a unit slipped. Give every size in metres.'
    )
    expect(result.broken.has('w1')).toBe(true)
    const door = { id: 'd', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2e7 }
    const { walls: fresh } = outline(RECT)
    expect(codesOf(planOf({ walls: fresh, openings: [door] })).filter(([, id]) => id === 'd')).toEqual([['opening/too-large', 'd']])
  })

  it('T-7 refuses infinity in a plan built in code, which never met the schema', () => {
    const { walls, room } = outline(RECT)
    const built: FloorPlan = { version: '1', units: 'm', walls: [{ ...walls[0]!, end: [Infinity, 0] }, ...walls.slice(1)], rooms: [room], openings: [] }
    const issues = issuesOf(built)
    expect(issues[0]!.code).toBe('wall/too-large')
    expect(issues[0]!.message).toMatch(/^Wall "w1": a coordinate of its end is not a finite number\./)
  })

  // Lab AE-6: a 0.0015 m partition from a scan passed with no issue.
  it('AE-6 questions a partition 1.5 mm thick, and not a 3 cm glass wall', () => {
    const { walls, room } = outline(RECT)
    const thin = { id: 'p', start: [2.5, 0], end: [2.5, 4], thickness: 0.0015, height: 2.7, kind: 'partition' }
    const issues = issuesOf(planOf({ walls: [...walls, thin], rooms: [room] })).filter((i) => i.code === 'wall/size-question')
    expect(issues.map((i) => i.id)).toEqual(['p'])
    expect(issues[0]!.message).toBe(
      'Wall "p" is 0.0015 m thick: is that meant? Grid asks about solid walls thinner than 0.02 m. If ' +
        'it is a line on the floor with no substance, mark it virtual. The limit is Grid\'s own, for ' +
        'catching a slipped digit or unit, and no rule.'
    )
    const glass = { ...thin, thickness: 0.03 }
    expect(issuesOf(planOf({ walls: [...walls, glass], rooms: [room] })).filter((i) => i.code === 'wall/size-question')).toEqual([])
  })

  it('takes a survey\'s looser tolerances for one check', () => {
    const wall = { id: 'w', start: [0, 0], end: [4.8996, 0], thickness: 0.2, height: 2.7 }
    const plan = planOf({ walls: [wall], openings: [{ id: 'd', wall: 'w', type: 'door', offset: 4.01, width: 0.9, height: 2.1 }] })
    expect(validatePlan(plan, undefined, { tolerances: { openingOverrun: 0.02 } }).issues).toEqual([])
    expect(validatePlan(plan).issues.map((i) => i.code)).toEqual(['opening/out-of-wall'])
  })
})

/**
 * Known failures from the lab (entry Z-4) that ARE-5 fixed. It ran as an expected failure above
 * until rooms on one floor were set against each other.
 */
describe('lab failures fixed by ARE-5', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const issuesOf = (plan: FloorPlan) => validatePlan(plan).issues

  it('AR-4 a room listed twice is reported', () => {
    const { walls, room } = outline(RECT)
    const issues = issuesOf(planOf({ walls, rooms: [room, { ...room, id: 'r2', name: 'Again' }] }))
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([['room/overlap', 'r2', 'warning']])
    expect(issues[0]!.message).toBe(
      'Rooms "r1" and "r2" cover the same 18.24 m² of floor and list the same walls, so that floor is ' +
        'counted twice, once in each. If one is a copy of the other, remove it; if not, check their ' +
        'wall lists.'
    )
  })
})

/**
 * Known failures from the lab (entry Z-4) that ARE-4 fixed. They ran as expected failures above
 * until Grid worked out the spaces the walls enclose and set each room against them.
 */
describe('lab failures fixed by ARE-4', () => {
  type P = [number, number]
  const RECT: P[] = [[0, 0], [5, 0], [5, 4], [0, 4]]
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const issuesOf = (plan: FloorPlan) => validatePlan(plan).issues

  it('MS-2 a 1.5 m gap in a room outline is reported', () => {
    const { walls, room } = outline(RECT)
    walls[1] = { ...walls[1]!, start: [5, 1.5] }
    const issues = issuesOf(planOf({ walls, rooms: [room] }))
    // MSG-12 adds the line on the wall itself, with the gap and the fix.
    expect(issues.map((i) => [i.code, i.id, i.severity])).toEqual([
      ['room/not-enclosed', 'r1', 'warning'],
      ['wall/short', 'w2', 'warning']
    ])
    expect(issues[0]!.message).toMatch(/not enclosed by its walls/)
    expect(issues[1]!.message).toMatch(/^Wall "w2" stops 1\.50 m short of its corner with wall "w1" in room "r1"/)
  })

  it('MS-17 a wall that cuts a room in two without being listed is reported', () => {
    const { walls, room } = outline(RECT)
    const cut = { id: 'cut', start: [2.5, 0], end: [2.5, 4], thickness: 0.1, height: 2.7, kind: 'partition' }
    const issues = issuesOf(planOf({ walls: [...walls, cut], rooms: [room] }))
    // MSG-12 adds the line on the wall itself, with the split that would fix it.
    expect(issues.map((i) => [i.code, i.id])).toEqual([
      ['room/space-mismatch', 'r1'],
      ['wall/crosses-room', 'cut']
    ])
    expect(issues[0]!.message).toMatch(/lies on wall "cut", which its wall list leaves out/)
    expect(issues[0]!.message).toMatch(/covers parts of 2 enclosed spaces/)
    expect(issues[1]!.message).toMatch(/^Wall "cut" runs 3\.80 m across room "r1", which does not list it/)
  })
})

/**
 * Known failures from the lab (entry Z-4) that ARE-1 fixed. They ran as expected failures
 * above until each wall's face was chosen from the outline.
 */
describe('lab failures fixed by ARE-1', () => {
  const planOf = (raw: unknown): FloorPlan => parseFloorPlan(raw)
  const codesOf = (plan: FloorPlan) => validatePlan(plan).issues.map((i) => i.code)

  it('AR-12 a room narrower than its walls is an issue, not an area', () => {
    const { walls, room } = outline([[0, 0], [3, 0], [3, 0.3], [0, 0.3]], { thickness: [0.4, 0.4, 0.4, 0.4] })
    expect(codesOf(planOf({ walls, rooms: [room] }))).toEqual(['room/inside-out'])
  })

  // Lab AR-13: a 20 m² room read 345 m², with no issue.
  it('AR-13 two swapped boundary entries in a room 3 cm out of square are reported', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5.03, 4], [0, 4.02]])
    const plan = planOf({ walls, rooms: [{ ...room, boundary: ['w1', 'w3', 'w2', 'w4'] }] })
    expect(codesOf(plan)).toEqual(['room/out-of-order'])
  })

  it('MS-7 two walls in a row with different thickness still make a room', () => {
    const { walls, room } = outline([[0, 0], [2.5, 0], [5, 0], [5, 4], [0, 4]], { thickness: [0.3, 0.1, 0.2, 0.2, 0.2] })
    expect(validatePlan(planOf({ walls, rooms: [room] })).broken.has('r1')).toBe(false)
  })
})
