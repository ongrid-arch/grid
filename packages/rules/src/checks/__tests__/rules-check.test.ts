import { describe, expect, it } from 'vitest'
import { planForFloor, type FloorPlan } from '@ongrid/floorplan/geometry'
import { floorGraph } from '@ongrid/floorplan/geometry/rules/graph'
import { checkLocalRules } from '..'
import type { RuleFinding } from '..'
import { door, edit, exterior, flat, twoFloorHouse, withOpening, withoutOpening } from '@ongrid/floorplan/test-support/plans'

/** What was not checked about routes: the fixtures state no room use, which has its own tests. */
const routeNotes = (report: ReturnType<typeof checkLocalRules>) =>
  report.notChecked.filter((n) => n.reason !== 'no_use')

const summary = (plan: FloorPlan) =>
  checkLocalRules(plan).findings.map((f) => `${f.code} ${f.floor} ${f.rooms.join('+')}`)

/** The route notices only: these fixtures state no room's use, so each floor also has a `no_use` one. */
const routeNotices = (plan: FloorPlan) => routeNotes(checkLocalRules(plan)).filter((n) => n.reason !== 'no_use')

const roomsWithFindings = (findings: readonly RuleFinding[]) => new Set(findings.flatMap((f) => f.rooms))

describe('rooms that cannot be left', () => {
  it('finds nothing in a flat where every room reaches the front door', () => {
    expect(checkLocalRules(flat()).findings).toEqual([])
  })

  it('reports a floor with no exit once, and not every room on it', () => {
    expect(summary(withoutOpening(flat(), 'front'))).toEqual(['no_exit ground '])
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
    const report = checkLocalRules(withoutOpening(flat(), 'd_hb'))
    const applied = new Set(report.rules.map((r) => r.id))
    for (const finding of report.findings) expect(applied.has(finding.ruleId)).toBe(true)
  })

  it('never lets a room off by taking a door away', () => {
    const before = withoutOpening(flat(), 'd_hb')
    const flagged = roomsWithFindings(checkLocalRules(before).findings)
    for (const opening of before.openings.filter((o) => o.type !== 'window')) {
      const after = roomsWithFindings(checkLocalRules(withoutOpening(before, opening.id)).findings)
      const lost = [...flagged].filter((room) => !after.has(room))
      // A floor-wide "no exit" names no room, and stands for all of them.
      const noExit = checkLocalRules(withoutOpening(before, opening.id)).findings.some(
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
    const report = checkLocalRules(noHall())
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
    const report = checkLocalRules(twoFloorHouse())
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
    expect(checkLocalRules(plan).findings.filter((f) => f.floor === 'first').map((f) => f.code)).toEqual(['no_stair'])
  })

  it('check the only floor of a plan, whatever its level', () => {
    const only = edit(withoutOpening(flat(), 'front'), (copy) => {
      copy.floors = [{ id: 'upper', name: 'Upper', level: 2 }]
      for (const w of copy.walls) w.floor = 'upper'
      for (const r of copy.rooms) r.floor = 'upper'
    })
    expect(routeNotices(only)).toEqual([])
    expect(summary(only)).toEqual(['no_exit upper '])
  })
})

describe('what cannot be drawn', () => {
  it('names a room that does not close as not checked, and draws no conclusion from it', () => {
    // Bottom and top only: two parallel walls make no corner.
    const plan = edit(flat(), (copy) => {
      copy.rooms.find((r) => r.id === 'kitchen')!.boundary = ['s2', 'kb2', 'hk']
    })
    const report = checkLocalRules(plan)
    expect(routeNotices(plan)).toMatchObject([
      { reason: 'cannot_be_drawn', floor: 'ground', rooms: ['kitchen'], openings: [] }
    ])
    expect(report.findings).toEqual([])
  })

  it('leaves out an opening on a wall that cannot be drawn, and the rooms resting on it', () => {
    const plan = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 'bb')!.thickness = 0
    })
    const report = checkLocalRules(plan)
    expect(routeNotices(plan)).toMatchObject([
      { reason: 'cannot_be_drawn', rooms: ['bathroom', 'bedroom'], openings: ['d_bb'] }
    ])
    expect(report.findings).toEqual([])
  })

  it('does not throw on the plan in the repository, read raw, and joins its open-plan rooms', async () => {
    const { readFileSync } = await import('node:fs')
    // Read raw: its virtual wall v1 has no thickness or height, which the schema rejects.
    const raw = JSON.parse(readFileSync(`${__dirname}/../../../../floorplan/fixtures/floor-plan.json`, 'utf8')) as FloorPlan
    expect(() => checkLocalRules(raw)).not.toThrow()
    const graph = floorGraph(planForFloor(raw, 'ground'))
    expect(graph.links).toContainEqual({ rooms: ['r1', 'r2'], via: 'v1' })
  })
})

describe('where a trapped room leads', () => {
  const trapped = () => withoutOpening(flat(), 'd_hb')
  const byRoom = (plan: FloorPlan) =>
    new Map(checkLocalRules(plan).findings.map((f) => [`${f.code} ${f.rooms.join('+')}`, f]))

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
      for (const finding of checkLocalRules(plan).findings) {
        if (finding.code !== 'no_route_to_exit') expect(finding).not.toHaveProperty('through')
      }
    }
  })

  it('keeps the report plain data at schema version 1', () => {
    const report = checkLocalRules(trapped())
    expect(report.schemaVersion).toBe(1)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('only ever leads into rooms that are trapped too, through that floor’s own openings', () => {
    const plans = [trapped(), withOpening(trapped(), door('d_bb0', 'bb', 2.5)), withoutOpening(twoFloorHouse(), 'd_hb')]
    for (const plan of plans) {
      const report = checkLocalRules(plan)
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

describe('what the full check does not need to be told', () => {
  /** The flat with its bedroom stated and cut off, so both kinds of check have something to say. */
  const trapped = () =>
    edit(withoutOpening(flat(), 'd_hb'), (copy) => {
      copy.rooms.find((r) => r.id === 'bedroom')!.use = 'bedroom'
    })

  it('gives the same report whatever the order of walls, rooms and openings', () => {
    const shuffled = edit(trapped(), (copy) => {
      copy.walls.reverse()
      copy.rooms.reverse()
      copy.openings.reverse()
    })
    const report = checkLocalRules(trapped())
    expect(report.findings.length).toBeGreaterThan(0)
    expect(JSON.stringify(checkLocalRules(shuffled))).toBe(JSON.stringify(report))
  })

  it('never throws on a plan with nothing in it', () => {
    const empty: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    expect(() => checkLocalRules(empty)).not.toThrow()
    // MSG-2 (lab CH-1): no rooms, so no check that looks at rooms ran, and the report says so.
    expect(checkLocalRules(empty).notChecked.map((n) => n.reason)).toEqual(['no_rooms'])
  })

  it('stays plain: no data-model or compliance word in what it says', () => {
    const forbidden = /\b(id|ids|virtual|boundary|entity|entities|comply|complies|fails?|violat\w*|passes|approved)\b/i
    for (const options of [undefined, { country: 'ES' }]) {
      const report = checkLocalRules(trapped(), options)
      for (const item of [...report.findings, ...report.notChecked]) expect(item.message).not.toMatch(forbidden)
      for (const line of report.limits) expect(line).not.toMatch(forbidden)
    }
  })
})

/** Known failures from the lab (entry Z-4) that a fix has turned into normal tests. */
describe('lab failures fixed by MSG-18', () => {
  it('CH-6 a 5 cm hole in the outside wall is not a way out', () => {
    const corners: [number, number][] = [[0, 0], [5, 0], [5, 4], [0, 4]]
    const walls = corners.map((start, i) => exterior(`w${i + 1}`, start, corners[(i + 1) % 4]!))
    const plan: FloorPlan = {
      version: '1',
      units: 'm',
      walls,
      rooms: [{ id: 'r1', name: 'Room', boundary: walls.map((w) => w.id), use: 'living' }],
      openings: [door('d', 'w1', 1, 0.05)]
    }
    // The same two notes as a room with nothing in its walls, and the hole named.
    expect(checkLocalRules(plan).findings.map((f) => [f.code, f.openings])).toEqual([
      ['no_exit', []],
      ['opening_too_small_to_pass', ['d']],
      ['room_without_door', []]
    ])
  })
})
