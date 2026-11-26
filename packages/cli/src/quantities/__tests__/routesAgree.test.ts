/**
 * ARE-18: a route and its walked length agree with the areas and the way-out check.
 *
 * - A door in a curved wall is walked from the room on the curve's outside as from the room
 *   inside it.
 * - The way out goes by the stairs the check reads, a stair the plan states or stair rooms one
 *   over the other, and never out through a door on a floor above the ground.
 * - Where the length cannot be given, the answer names the room and why.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { checkPlanSanity } from '@ongrid/floorplan/geometry/rules/check'
import { edit, stairHouse, stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { basementCarPark } from '@ongrid/floorplan/test-support/parking'
import { routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { crossingOf, walkRoute } from '../walked'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })

/** A living room with a half-round bay, a solid curved wall, and a nook past the bay through a door in it. */
const BAY = {
  version: '1',
  units: 'm',
  walls: [
    wall('s', [0, 0], [4, 0]),
    wall('e', [4, 0], [4, 3]),
    wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 }, kind: 'interior' }),
    wall('w', [0, 3], [0, 0]),
    wall('ne', [4, 3], [4, 5.5]),
    wall('nn', [4, 5.5], [0, 5.5]),
    wall('nw', [0, 5.5], [0, 3]),
  ],
  rooms: [
    { id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'] },
    { id: 'nook', name: 'Nook', boundary: ['bay', 'ne', 'nn', 'nw'] },
  ],
  openings: [
    { id: 'd2', wall: 's', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'db', wall: 'bay', type: 'door', offset: 2.7, width: 0.9, sill: 0, height: 2.1 },
  ],
}

/** Every room the check says has a way out. */
function roomsWithWayOut(plan: FloorPlan): string[] {
  const cut = new Set(checkPlanSanity(plan).findings.filter((f) => f.code === 'no_route_to_exit' || f.code === 'room_without_door').flatMap((f) => f.rooms))
  return plan.rooms.map((r) => r.id).filter((id) => !cut.has(id))
}

describe('a door in a curved wall, walked from either side (ARE-18)', () => {
  const survey = surveyPlan(parseFloorPlan(BAY))

  it('is found from the room on the curve\'s outside, at the hole\'s middle, through the wall\'s thickness', () => {
    const nook = crossingOf(survey, survey.byId.get('nook')!, 'db')!
    expect(nook).not.toBeNull()
    expect(Math.hypot(nook.far.x - nook.near.x, nook.far.y - nook.near.y)).toBeCloseTo(0.2, 2)
    // Into the nook, away from the bay's centre.
    const fromCentre = { x: nook.near.x - 2, y: nook.near.y - 3 }
    expect(fromCentre.x * nook.inward.x + fromCentre.y * nook.inward.y).toBeGreaterThan(0)
  })

  it('so the way out of the nook has its walked length, room by room', () => {
    const route = routeBetween(survey, 'nook', 'outside')!
    expect(route.rooms).toEqual(['nook', 'living'])
    expect(route.length).not.toBeNull()
    expect(route.gap).toBeNull()
    expect(route.legs.map((l) => l.room)).toEqual(['nook', 'living'])
  })
})

describe('the way out takes the stairs, as the check does (ARE-18)', () => {
  it('from the study upstairs: by the stated stair to the front door, not out of the balcony door', () => {
    const plan = stairHouse()
    const route = routeBetween(surveyPlan(plan), 'study', 'outside')!
    expect(route.steps.map((s) => [s.type, s.via, s.into])).toEqual([
      ['door', 'd_up', 'landing'],
      ['stair', 's1', 'hall'],
      ['door', 'front', 'outside'],
    ])
    expect(route.floors).toEqual(['first', 'first', 'ground'])
    // The stair is walked along its walking line on plan, (0.6, 0.6) to (0.6, 3.4): 2.8 m.
    expect(route.onStairs).toBeCloseTo(2.8, 6)
    expect(route.length).not.toBeNull()
    const legs = route.legs.reduce((sum, leg) => sum + leg.length, 0)
    expect(route.length! - legs - route.onStairs!).toBeGreaterThan(0)
  })

  it('a stair drawn as a room on each floor: from the second floor down to the hall and out, from the middle of each stair room', () => {
    const plan = stairRoomHouse()
    const route = routeBetween(surveyPlan(plan), 'second-main', 'outside')!
    expect(route.rooms).toEqual(['second-main', 'second-stair', 'first-stair', 'ground-stair', 'ground-main'])
    expect(route.steps.filter((s) => s.type === 'stair').length).toBe(2)
    expect(route.onStairs).toBe(0)
    expect(route.length).not.toBeNull()
  })

  it('every room the check says has a way out has a route out with a length, upstairs and in a basement', () => {
    const basement = edit(stairRoomHouse(), (copy) => {
      copy.floors = [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'Basement 1', level: -1 },
        { id: 'second', name: 'Basement 2', level: -2 },
      ]
    })
    for (const plan of [stairHouse(), stairRoomHouse(), basement]) {
      const survey = surveyPlan(plan)
      const ids = roomsWithWayOut(plan)
      expect(ids.length).toBe(plan.rooms.length)
      for (const id of ids) {
        const route = routeBetween(survey, id, 'outside')
        expect(route, id).not.toBeNull()
        expect(route!.length, id).not.toBeNull()
      }
    }
  })

  it('a route between two rooms keeps to their floor, and a body\'s width keeps to the floor too', () => {
    const route = routeBetween(surveyPlan(stairHouse()), 'study', 'landing')!
    expect(route.floors).toEqual(['first', 'first'])
    // On its floor alone, the study's way out is its balcony door, as before.
    expect(routeBetween(surveyPlan(stairHouse()), 'study', 'outside', false)!.steps.map((s) => s.via)).toEqual(['balcony'])
  })
})

describe('a length not given names the room and why (ARE-18)', () => {
  it('a doorway not found on a room\'s side', () => {
    const survey = surveyPlan(parseFloorPlan(BAY))
    // The front door is in the living room's wall, not the nook's.
    const answer = walkRoute(survey, ['nook', 'living'], ['d2'], false)
    expect(answer.walked).toBeNull()
    expect(answer.gap).toEqual({ room: 'nook', reason: 'doorway', via: 'd2' })
  })
})

describe('grid_measure what=route (ARE-18)', () => {
  let b: Bench
  afterEach(() => b?.close())

  it('says the stair it takes and its length on the stairs', async () => {
    b = bench({ 'house.json': stairHouse() })
    const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'study', to: 'outside' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('stair "s1" 0.90 m into "Hall"')
    expect(reply.text).toMatch(/Walked, [0-9.]+ m: .*, [0-9.]+ m through the walls and 2\.80 m along the stairs\./)
    const answer = reply.data!['answer'] as { found: boolean; floors: string[]; onStairs: number }
    expect(answer.found).toBe(true)
    expect(answer.floors).toEqual(['first', 'first', 'ground'])
  })

  it('from a floor above the ground with no stair: says there is no way out from that floor, and why (ARE-28)', async () => {
    b = bench({ 'house.json': edit(stairHouse(), (copy) => { copy.stairs = [] }) })
    const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'study', to: 'outside' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('There is no way from "Study" to the outside')
    expect(reply.text).toMatch(/There is no way out from "First floor": it stands above the ground and nothing joins it to the ground floor.*\(grid check: floor\/no-stair\)\./)
    expect(reply.data!['answer']).toEqual({ found: false, noStair: { floor: 'first', from: 'ground' } })
    // With its stair, the same room has its way out, and no such line.
    const joined = bench({ 'house.json': stairHouse() })
    try {
      const out = await joined.call('grid_measure', { plan: 'house.json', what: 'route', room: 'study', to: 'outside' })
      expect(out.text).not.toContain('There is no way out from')
    } finally {
      joined.close()
    }
  })

  it('walks out of the nook past the curved wall, with the length', async () => {
    b = bench({ 'bay.json': BAY })
    const reply = await b.call('grid_measure', { plan: 'bay.json', what: 'route', room: 'nook', to: 'outside' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/Walked, [0-9.]+ m: "Nook"/)
    expect(reply.text).not.toContain('grid_check says why')
  })
})

describe('a route out from a floor the check does not follow (ARE-63)', () => {
  let b: Bench
  afterEach(() => b?.close())
  // The basement car park: its stair core joins no stair room on the ground floor, so the check
  // follows no way out from it and says so in its notes; its ramp is for cars, stated between floors.
  const noMouth = (): FloorPlan => edit(basementCarPark(), (copy) => { copy.openings = copy.openings.filter((o) => o.id !== 'ramp-mouth') })

  it('the check leaves the basement unchecked, and says so', () => {
    for (const plan of [basementCarPark(), noMouth()]) {
      const check = checkPlanSanity(plan)
      expect(check.findings.filter((f) => f.floor === 'B1').map((f) => f.code)).toEqual([])
      expect(check.notChecked.map((n) => [n.reason, n.floor])).toContainEqual(['no_stairs', 'B1'])
    }
  })

  it('with no way out of its own: no route, and the answer says the check does not follow that floor either', async () => {
    b = bench({ 'park.json': noMouth() })
    const reply = await b.call('grid_measure', { plan: 'park.json', what: 'route', room: 'car-park', to: 'outside' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('There is no way from "Car park" to the outside')
    expect(reply.text).toContain('grid_check does not follow the way out of "Basement car park" either: no stair joins it to the ground floor')
    expect(reply.data!['answer']).toEqual({ found: false, notChecked: { reason: 'no_stairs', floor: 'B1' } })
  })

  it('with a way out of its own: the route, and a line that the check does not follow it', async () => {
    b = bench({ 'park.json': basementCarPark() })
    const reply = await b.call('grid_measure', { plan: 'park.json', what: 'route', room: 'car-park', to: 'outside' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('opening "ramp-mouth"')
    expect(reply.text).toContain('grid_check does not follow this way out: no stair joins "Basement car park" to the ground floor')
    const answer = reply.data!['answer'] as { found: boolean; notChecked?: unknown; length: number | null }
    expect(answer.found).toBe(true)
    expect(answer.length).not.toBeNull()
    expect(answer.notChecked).toEqual({ reason: 'no_stairs', floor: 'B1' })
  })

  it('a floor the check follows gets no such line', async () => {
    b = bench({ 'house.json': stairHouse() })
    const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'study', to: 'outside' })
    expect(reply.text).not.toContain('grid_check does not follow')
    expect((reply.data!['answer'] as Record<string, unknown>)['notChecked']).toBeUndefined()
  })
})
