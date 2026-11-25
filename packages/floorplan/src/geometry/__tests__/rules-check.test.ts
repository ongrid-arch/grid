import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { checkPlanSanity } from '../rules'
import type { RuleFinding } from '../rules'
import { floorGraph } from '../rules/graph'
import { planForFloor } from '../floors'
import { door, edit, flat, twoFloorHouse, wall, withOpening, withoutOpening } from '../../test-support/plans'

const summary = (plan: FloorPlan) =>
  checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.floor} ${f.rooms.join('+')}`)

const routeNotices = (plan: FloorPlan) => checkPlanSanity(plan).notChecked

const roomsWithFindings = (findings: readonly RuleFinding[]) => new Set(findings.flatMap((f) => f.rooms))

describe('rooms that cannot be left', () => {
  it('finds nothing in a flat where every room reaches the front door', () => {
    expect(checkPlanSanity(flat()).findings).toEqual([])
  })

  it('reports a floor with no exit once, and fails the route of each room on it (ARE-40)', () => {
    expect(summary(withoutOpening(flat(), 'front'))).toEqual(['no_exit ground ', 'no_route_to_exit ground bathroom', 'no_route_to_exit ground bedroom', 'no_route_to_exit ground hall', 'no_route_to_exit ground kitchen'])
  })

  it('reports a room with no door, and only that', () => {
    expect(summary(withoutOpening(flat(), 'd_bb'))).toEqual(['room_without_door ground bathroom'])
  })

  it('reports each room cut off behind another', () => {
    expect(summary(withoutOpening(flat(), 'd_hb'))).toEqual([
      'no_route_to_exit ground bathroom',
      'no_route_to_exit ground bedroom'
    ])
  })

  it('names the rule each finding comes from', () => {
    const report = checkPlanSanity(withoutOpening(flat(), 'd_hb'))
    const applied = new Set(report.rules.map((r) => r.id))
    for (const finding of report.findings) expect(applied.has(finding.ruleId)).toBe(true)
  })

  it('never lets a room off by taking a door away', () => {
    const before = withoutOpening(flat(), 'd_hb')
    const flagged = roomsWithFindings(checkPlanSanity(before).findings)
    for (const opening of before.openings.filter((o) => o.type !== 'window')) {
      const after = roomsWithFindings(checkPlanSanity(withoutOpening(before, opening.id)).findings)
      const lost = [...flagged].filter((room) => !after.has(room))
      // A floor-wide "no exit" names no room, and stands for all of them.
      const noExit = checkPlanSanity(withoutOpening(before, opening.id)).findings.some(
        (f) => f.code === 'no_exit'
      )
      if (!noExit) expect(lost, `removing ${opening.id}`).toEqual([])
    }
  })
})

describe('a door to a space that is not a room', () => {
  // The hall is not drawn as a room; the kitchen has a back door instead.
  const noHall = () =>
    edit(withOpening(flat(), door('back', 'e1', 1.5)), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'hall')
    })

  it('is reported with its door, and is not counted as an exit', () => {
    const report = checkPlanSanity(noHall())
    const undrawn = report.findings.filter((f) => f.code === 'door_to_undrawn_space')
    expect(undrawn.map((f) => [f.rooms, f.openings])).toEqual([
      [['bedroom'], ['d_hb']],
      [['kitchen'], ['d_hk']]
    ])
    expect(summary(noHall())).toEqual(
      expect.arrayContaining([
        'no_route_to_exit ground bathroom',
        'no_route_to_exit ground bedroom'
      ])
    )
    expect(summary(noHall())).not.toContain('no_route_to_exit ground kitchen')
  })
})

describe('floors other than the ground floor', () => {
  it('get a notice that their way out was not checked, and no route findings', () => {
    const report = checkPlanSanity(twoFloorHouse())
    expect(routeNotices(twoFloorHouse())).toMatchObject([{ reason: 'no_stairs', floor: 'first', rooms: [] }])
    // LVL-1 (lab VE-8): the balcony door upstairs leads outside 2.95 m up. It is named, and it
    // is no way out; there are still no route findings. Before LVL-1, nothing upstairs.
    // LVL-14: the floor itself, which no stair reaches, is a finding too.
    expect(report.findings.filter((f) => f.floor === 'first').map((f) => [f.code, f.openings])).toEqual([
      ['door_to_outside_above_ground', ['balcony']],
      ['no_stair', []]
    ])
  })

  it('still report a room with no door', () => {
    const plan = withoutOpening(twoFloorHouse(), 'd_up')
    // LVL-1: with the balcony door named (lab VE-8).
    // LVL-14: with the floor no stair reaches named.
    expect(summary(plan)).toEqual(['door_to_outside_above_ground first study', 'no_stair first ', 'room_without_door first landing'])
  })

  it('never count on a balcony door, so losing one changes nothing', () => {
    // Were upstairs checked for exits, the balcony would be its only one.
    const plan = withoutOpening(twoFloorHouse(), 'balcony')
    // LVL-14: only the floor no stair reaches is said, as with the balcony door.
    expect(checkPlanSanity(plan).findings.filter((f) => f.floor === 'first').map((f) => f.code)).toEqual(['no_stair'])
  })

  it('check the only floor of a plan, whatever its level', () => {
    const only = edit(withoutOpening(flat(), 'front'), (copy) => {
      copy.floors = [{ id: 'upper', name: 'Upper', level: 2 }]
      for (const w of copy.walls) w.floor = 'upper'
      for (const r of copy.rooms) r.floor = 'upper'
    })
    expect(routeNotices(only)).toEqual([])
    expect(summary(only)).toEqual(['no_exit upper ', 'no_route_to_exit upper bathroom', 'no_route_to_exit upper bedroom', 'no_route_to_exit upper hall', 'no_route_to_exit upper kitchen'])
  })
})

describe('a flat drawn on its own', () => {
  // MSG-13 (lab MS-11): whether a door leads outside is worked out from what lies past it. A wall
  // that only says `interior` (which is also what a wall that states no kind reads as) with no
  // room and no enclosed floor behind it faces outside, so the front door is a way out.
  it('takes a front door with nothing behind it as a way out, though its wall says interior', () => {
    const plan = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 's1')!.kind = 'interior'
    })
    expect(checkPlanSanity(plan).findings).toEqual([])
    expect(routeNotices(plan)).toEqual([])
  })

  // The front door opens onto a landing whose walls are drawn and which is not drawn as a room:
  // floor the walls enclose and no room claims is a space not drawn, not the outside.
  const flatOffLanding = () =>
    edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 's1')!.kind = 'interior'
      copy.walls.push(
        wall('l1', [0, 0], [0, -2], { kind: 'exterior' }),
        wall('l2', [0, -2], [4, -2], { kind: 'exterior' }),
        wall('l3', [4, -2], [4, 0], { kind: 'exterior' })
      )
    })

  it('is not told it has no way out: its entrance is reported as leading to a space not drawn', () => {
    const report = checkPlanSanity(flatOffLanding())
    expect(report.findings.map((f) => [f.code, f.rooms, f.openings])).toEqual([
      ['door_to_undrawn_space', ['hall'], ['front']]
    ])
  })

  it('says the way out was not checked, naming the door', () => {
    expect(routeNotices(flatOffLanding())).toEqual([
      {
        reason: 'way_out_not_drawn',
        floor: 'ground',
        rooms: [],
        openings: ['front'],
        message: 'The way out of "Ground floor" was not checked: its only door out leads to a space that is not drawn'
      }
    ])
  })

  it('still has no way out once that door is gone too', () => {
    expect(summary(withoutOpening(flatOffLanding(), 'front'))).toEqual(['no_exit ground ', 'no_route_to_exit ground bathroom', 'no_route_to_exit ground bedroom', 'no_route_to_exit ground hall', 'no_route_to_exit ground kitchen'])
  })
})

describe('a floor that is one open room', () => {
  // Upstairs is one room with no door: it is reached by a stair, which the plan cannot draw.
  const loft = () =>
    edit(twoFloorHouse(), (copy) => {
      const upstairs = copy.rooms.filter((r) => r.floor === 'first')
      const kept = upstairs[0]!.id
      copy.rooms = copy.rooms.filter((r) => r.floor !== 'first' || r.id === kept)
      const walls = new Set(copy.walls.filter((w) => w.floor === 'first').map((w) => w.id))
      copy.openings = copy.openings.filter((o) => !walls.has(o.wall))
    })

  it('is not reported as a room with no door when it is off the ground floor', () => {
    const report = checkPlanSanity(loft())
    // LVL-14: the loft no stair reaches is named, but never as a room with no door.
    expect(report.findings.filter((f) => f.floor === 'first').map((f) => f.code)).toEqual(['no_stair'])
    expect(report.notChecked).toMatchObject([{ reason: 'no_stairs', floor: 'first' }])
  })

  it('is still reported on the ground floor', () => {
    const studio = edit(flat(), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id === 'hall')
      copy.openings = []
    })
    expect(summary(studio)).toContain('room_without_door ground hall')
  })
})

describe('what the checks do not need to be told', () => {
  const trapped = () => withoutOpening(flat(), 'd_hb')

  it('give the same report whatever the order of walls, rooms and openings', () => {
    const shuffled = edit(trapped(), (copy) => {
      copy.walls.reverse()
      copy.rooms.reverse()
      copy.openings.reverse()
    })
    const report = checkPlanSanity(trapped())
    expect(report.findings.length).toBeGreaterThan(0)
    expect(JSON.stringify(checkPlanSanity(shuffled))).toBe(JSON.stringify(report))
  })

  it('never throw on a plan with nothing in it', () => {
    const empty: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    expect(() => checkPlanSanity(empty)).not.toThrow()
    expect(checkPlanSanity(empty).notChecked).toEqual([])
  })

  it('stay plain: no data-model or compliance word in what they say', () => {
    const forbidden = /\b(id|ids|virtual|boundary|entity|entities|comply|complies|fails?|violat\w*|passes|approved)\b/i
    for (const plan of [trapped(), twoFloorHouse(), withoutOpening(flat(), 'front')]) {
      const report = checkPlanSanity(plan)
      for (const item of [...report.findings, ...report.notChecked]) expect(item.message).not.toMatch(forbidden)
      for (const line of report.limits) expect(line).not.toMatch(forbidden)
    }
  })
})

describe('what cannot be drawn', () => {
  it('names a room that does not close as not checked, and draws no conclusion from it', () => {
    // Bottom and top only: two parallel walls make no corner.
    const plan = edit(flat(), (copy) => {
      copy.rooms.find((r) => r.id === 'kitchen')!.boundary = ['s2', 'kb2', 'hk']
    })
    const report = checkPlanSanity(plan)
    expect(routeNotices(plan)).toMatchObject([
      { reason: 'cannot_be_drawn', floor: 'ground', rooms: ['kitchen'], openings: [] }
    ])
    expect(report.findings).toEqual([])
  })

  it('leaves out an opening on a wall that cannot be drawn, and the rooms resting on it', () => {
    const plan = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 'bb')!.thickness = 0
    })
    const report = checkPlanSanity(plan)
    expect(routeNotices(plan)).toMatchObject([
      { reason: 'cannot_be_drawn', rooms: ['bathroom', 'bedroom'], openings: ['d_bb'] }
    ])
    expect(report.findings).toEqual([])
  })

  it('does not throw on the plan in the repository, read raw, and joins its open-plan rooms', async () => {
    const { readFileSync } = await import('node:fs')
    // Read raw: its virtual wall v1 has no thickness or height, which the schema rejects.
    const raw = JSON.parse(readFileSync(`${__dirname}/../../../fixtures/floor-plan.json`, 'utf8')) as FloorPlan
    expect(() => checkPlanSanity(raw)).not.toThrow()
    const graph = floorGraph(planForFloor(raw, 'ground'))
    expect(graph.links).toContainEqual({ rooms: ['r1', 'r2'], via: 'v1' })
  })
})

describe('where a trapped room leads', () => {
  const trapped = () => withoutOpening(flat(), 'd_hb')
  const byRoom = (plan: FloorPlan) =>
    new Map(checkPlanSanity(plan).findings.map((f) => [`${f.code} ${f.rooms.join('+')}`, f]))

  it('names the room beyond each way through', () => {
    const findings = byRoom(trapped())
    expect(findings.get('no_route_to_exit bedroom')?.through).toEqual([{ room: 'bathroom', via: 'd_bb' }])
    expect(findings.get('no_route_to_exit bathroom')?.through).toEqual([{ room: 'bedroom', via: 'd_bb' }])
  })

  it('lists every way through, ordered by room then by id', () => {
    const plan = withOpening(trapped(), door('d_bb0', 'bb', 2.5))
    expect(byRoom(plan).get('no_route_to_exit bedroom')?.through).toEqual([
      { room: 'bathroom', via: 'd_bb' },
      { room: 'bathroom', via: 'd_bb0' }
    ])
  })

  it('is only on findings about a room with no route', () => {
    const plans = [withoutOpening(flat(), 'front'), withoutOpening(flat(), 'd_bb'), trapped()]
    for (const plan of plans) {
      for (const finding of checkPlanSanity(plan).findings) {
        if (finding.code !== 'no_route_to_exit') expect(finding).not.toHaveProperty('through')
      }
    }
  })

  it('keeps the report plain data at schema version 1', () => {
    const report = checkPlanSanity(trapped())
    expect(report.schemaVersion).toBe(1)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('only ever leads into rooms that are trapped too, through that floor’s own openings', () => {
    const plans = [trapped(), withOpening(trapped(), door('d_bb0', 'bb', 2.5)), withoutOpening(twoFloorHouse(), 'd_hb')]
    for (const plan of plans) {
      const report = checkPlanSanity(plan)
      const trappedRooms = new Set(
        report.findings.filter((f) => f.code === 'no_route_to_exit').flatMap((f) => f.rooms)
      )
      for (const finding of report.findings.filter((f) => f.code === 'no_route_to_exit')) {
        const storey = planForFloor(plan, finding.floor)
        const ways = new Set([...storey.openings.filter((o) => o.type !== 'window').map((o) => o.id), ...storey.walls.filter((w) => w.virtual).map((w) => w.id)])
        expect(finding.through?.length).toBeGreaterThan(0)
        for (const { room, via } of finding.through ?? []) {
          expect(trappedRooms.has(room)).toBe(true)
          expect(ways.has(via)).toBe(true)
        }
      }
    }
  })
})
