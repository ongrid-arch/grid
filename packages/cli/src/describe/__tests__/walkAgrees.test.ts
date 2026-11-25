/**
 * ARE-18: the walk and the description agree with the way-out check.
 *
 * - Every way the check reads is a way on for the walk: a room joined only by an open side is
 *   walked, never "not reached".
 * - From a room's middle you face square to the room, and it is said by its whole size.
 * - A fixture clear of the walls is said where it stands, not on the nearest wall.
 * - The description says a door leads in from outside when the check reads it as a way out.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { checkPlanSanity } from '@ongrid/floorplan/geometry/rules/check'
import { edit, flat } from '@ongrid/floorplan/test-support/plans'
import { surveyPlan } from '../../quantities/survey'
import { planWalk, walkText } from '../walk'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })
const door = (id: string, wallId: string, offset: number): Record<string, unknown> => ({ id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1 })

/**
 * A hall 10 × 8 with two light wells in its floor, 2 × 2 each, open to it all round: dividing
 * lines round each, which the hall lists as its holes (ARE-6). Its door out is in the south wall.
 */
const line = (id: string, start: Tuple, end: Tuple): Record<string, unknown> => wall(id, start, end, { virtual: true, thickness: 0, height: 0 })
const WELLS = {
  version: '1',
  units: 'm',
  walls: [
    wall('s', [0, 0], [10, 0]),
    wall('e', [10, 0], [10, 8]),
    wall('n', [10, 8], [0, 8]),
    wall('w', [0, 8], [0, 0]),
    line('a1', [2, 3], [4, 3]),
    line('a2', [4, 3], [4, 5]),
    line('a3', [4, 5], [2, 5]),
    line('a4', [2, 5], [2, 3]),
    line('b1', [6, 3], [8, 3]),
    line('b2', [8, 3], [8, 5]),
    line('b3', [8, 5], [6, 5]),
    line('b4', [6, 5], [6, 3]),
  ],
  rooms: [
    { id: 'hall', name: 'Hall', boundary: ['s', 'e', 'n', 'w'], holes: [['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4']], use: 'corridor' },
    { id: 'well-a', name: 'West well', boundary: ['a1', 'a2', 'a3', 'a4'] },
    { id: 'well-b', name: 'East well', boundary: ['b1', 'b2', 'b3', 'b4'] },
  ],
  openings: [door('front', 's', 4.5)],
}

/** A hall 10 × 4 whose south side is a dividing line onto the outside, and no door. */
const OPEN_FRONT = {
  version: '1',
  units: 'm',
  walls: [wall('s', [0, 0], [10, 0], { virtual: true, thickness: 0, height: 0 }), wall('e', [10, 0], [10, 4]), wall('n', [10, 4], [0, 4]), wall('w', [0, 4], [0, 0])],
  rooms: [{ id: 'hall', name: 'Hall', boundary: ['s', 'e', 'n', 'w'], use: 'corridor' }],
  openings: [],
}

/** A stair room 3.00 × 16.10 m with a landing beside its far end, and no door from outside. */
const LONG_STAIR = {
  version: '1',
  units: 'm',
  walls: [
    wall('st-s', [0, 0], [3, 0]),
    wall('st-e1', [3, 0], [3, 13.1], { kind: 'interior' }),
    wall('st-e2', [3, 13.1], [3, 16.1], { kind: 'interior' }),
    wall('st-n', [3, 16.1], [0, 16.1]),
    wall('st-w', [0, 16.1], [0, 0]),
    wall('l-s', [3, 13.1], [6, 13.1]),
    wall('l-e', [6, 13.1], [6, 16.1]),
    wall('l-n', [6, 16.1], [3, 16.1]),
  ],
  rooms: [
    { id: 'stair', name: 'Stair', boundary: ['st-s', 'st-e1', 'st-e2', 'st-n', 'st-w'], use: 'stair' },
    { id: 'landing', name: 'Landing', boundary: ['l-s', 'l-e', 'l-n', 'st-e2'] },
  ],
  openings: [door('d', 'st-e2', 1)],
}

/** A kitchen 5 × 4 entered from the south, with an island 2 × 1 in the middle and a worktop on the north wall. */
const KITCHEN = {
  version: '1',
  units: 'm',
  walls: [wall('s', [0, 0], [5, 0]), wall('e', [5, 0], [5, 4]), wall('n', [5, 4], [0, 4]), wall('w', [0, 4], [0, 0])],
  rooms: [{ id: 'kitchen', name: 'Kitchen', boundary: ['s', 'e', 'n', 'w'], use: 'kitchen' }],
  openings: [door('in', 's', 2.05)],
  items: [
    { id: 'island', kind: 'table', label: 'Island', at: [2.5, 2], size: [2, 1], height: 0.9 },
    { id: 'top', kind: 'table', label: 'Worktop', at: [2.5, 3.6], size: [3, 0.6], height: 0.9 },
  ],
}

describe('the walk takes every way the check reads (ARE-18)', () => {
  it('walks both wells open to the hall: none is left "not reached"', () => {
    const survey = surveyPlan(parseFloorPlan(WELLS))
    expect(checkPlanSanity(survey.plan).findings.filter((f) => f.code === 'no_route_to_exit')).toEqual([])
    const walk = planWalk(survey).floors[0]!
    expect(walk.notReached).toEqual([])
    expect(walk.stops.map((s) => s.room).sort()).toEqual(['hall', 'well-a', 'well-b'])
    // Each well's open side is said in the hall, ahead of you as you come in.
    const hall = walk.stops.find((s) => s.room === 'hall')!
    expect(hall.ahead.filter((t) => t.kind === 'open side').map((t) => t.to).sort()).toEqual(['well-a', 'well-b'])
  })
})

describe('from a room\'s middle, square to the room (ARE-18)', () => {
  it('a 3.00 × 16.10 m stair is 3 m across and 16.1 m deep, 1.5 m to each side', () => {
    const walk = planWalk(surveyPlan(parseFloorPlan(LONG_STAIR))).floors[0]!
    expect(walk.start).toBe('stair')
    const stair = walk.stops[0]!
    expect(stair.room).toBe('stair')
    expect(stair.across).toBeCloseTo(2.8, 6)
    expect(stair.deep).toBeCloseTo(15.9, 6)
    expect(stair.reach.left).toBeCloseTo(1.4, 6)
    expect(stair.reach.right).toBeCloseTo(1.4, 6)
    expect(stair.facing).toBe('N')
  })
})

describe('a fixture clear of the walls is said where it stands (ARE-18)', () => {
  const survey = surveyPlan(parseFloorPlan(KITCHEN))
  const kitchen = planWalk(survey).floors[0]!.stops[0]!

  it('the island in the room, its near side 1.4 m ahead, across your way; the worktop on the wall ahead', () => {
    expect(kitchen.inRoom.map((t) => [t.id, Number(t.near!.ahead.toFixed(2)), t.near!.across])).toEqual([['island', 1.4, 0]])
    expect(kitchen.ahead.map((t) => t.id)).toEqual(['top'])
  })

  it('in words, for a person and for an agent', () => {
    const person = walkText(survey, planWalk(survey), 'person')
    expect(person).toContain('Standing clear of the walls: the Island, its near side 1.4 m ahead, across your way.')
    const agent = walkText(survey, planWalk(survey), 'agent')
    expect(agent).toContain('| F island f +1.4 X')
  })
})

describe('the description says a door leads in from outside when the check does (ARE-18)', () => {
  let b: Bench
  afterEach(() => b?.close())

  const passes = (plan: FloorPlan): boolean => !checkPlanSanity(plan).findings.some((f) => f.code === 'no_exit' || f.code === 'no_route_to_exit')

  it('through a wall not stated exterior, with nothing past it', async () => {
    const plan = edit(flat(), (copy) => {
      copy.walls = copy.walls.map((w) => (w.id === 's1' ? { ...w, kind: 'interior' } : w))
    })
    expect(passes(plan)).toBe(true)
    b = bench({ 'plan.json': plan })
    const person = await b.call('grid_describe', { plan: 'plan.json', for: 'person' })
    expect(person.text).toContain('from outside, a door leads into Hall.')
    expect(person.text).not.toContain('no door leads in from outside')
    const agent = await b.call('grid_describe', { plan: 'plan.json', for: 'agent' })
    expect(agent.text).toContain('from outside into hall')
  })

  it('across an open side to the outside, when no door leads in', async () => {
    const plan = parseFloorPlan(OPEN_FRONT)
    expect(passes(plan)).toBe(true)
    b = bench({ 'plan.json': plan })
    const person = await b.call('grid_describe', { plan: 'plan.json', for: 'person' })
    expect(person.text).toContain('from outside, no door but an open side leads into')
    const agent = await b.call('grid_describe', { plan: 'plan.json', for: 'agent' })
    expect(agent.text).toContain('from outside across open sides into hall')
  })
})
