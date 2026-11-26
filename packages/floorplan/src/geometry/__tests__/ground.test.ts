/**
 * LVL-4 (lab VE-7, VE-8): the site's ground level, the ground floor restated against it, and the
 * doors and windows that lie below it.
 */
import { describe, expect, it } from 'vitest'
import { edit, exterior, flat, room, twoFloorHouse, window_ } from '../../test-support/plans'
import { labPlan } from '../../test-support/lab'
import { groundLevel, openingsBelowGround, statedGround } from '../ground'
import { checkPlanSanity } from '../rules/check'
import { RULES, LIMITS } from '../rules/catalogue'
import type { FloorPlan } from '../plan'

const BASEMENT = 'A/scenarios/basement-flat.json'
const withGround = (plan: FloorPlan, ground: number): FloorPlan => ({ ...plan, site: { ground } })

describe('the ground level', () => {
  it('is 0 and unstated when the plan says nothing, and the ground floor is the one at level 0, as before', () => {
    const plan = labPlan(BASEMENT)
    expect(statedGround(plan)).toBeNull()
    const ground = groundLevel(plan)
    expect(ground).toMatchObject({ level: 0, stated: false })
    expect(ground.groundFloors.map((f) => f.id)).toEqual(['ground'])
    expect(ground.above.get('basement')).toBeCloseTo(-2.55, 9)
  })

  it('makes the floor nearest it the ground floor, once stated', () => {
    // A flat entered at the foot of a slope: the ground at the basement's floor.
    const ground = groundLevel(withGround(labPlan(BASEMENT), -2.55))
    expect(ground.groundFloors.map((f) => f.id)).toEqual(['basement'])
    expect(ground.above.get('ground')).toBeCloseTo(2.55, 9)
    expect(ground.aboveGround('ground')).toBe(true)
  })

  it('names a door out of a floor that stands above the stated ground, by its height over it (VE-8)', () => {
    const report = checkPlanSanity(withGround(labPlan(BASEMENT), -2.55))
    const up = report.findings.filter((f) => f.code === 'door_to_outside_above_ground')
    expect(up.map((f) => [f.openings[0], f.elevation])).toEqual([['g-door', 2.55]])
  })
})

describe('openings below the ground (VE-7)', () => {
  it('finds none when the plan states no ground', () => {
    expect(openingsBelowGround(labPlan(BASEMENT))).toEqual([])
  })

  it('finds a window partly below the ground, and says its sill is', () => {
    // The flat's kitchen window: sill 0.9 m, head 2.1 m above its floor at 0.
    const plan = withGround(flat(), 1.2)
    const below = openingsBelowGround(plan).filter((o) => o.opening === 'win_k')
    expect(below).toEqual([{ floor: 'ground', opening: 'win_k', type: 'window', wall: 's2', rooms: ['kitchen'], sillBelow: expect.closeTo(0.3, 9), topBelow: expect.closeTo(-0.9, 9), wholly: false }])
    const finding = checkPlanSanity(plan).findings.find((f) => f.code === 'opening_below_ground' && f.openings[0] === 'win_k')!
    expect(finding.message).toBe('The window in "Kitchen" lies partly below the ground: its sill is 0.30 m under the ground level the site states')
    expect(finding.belowGround).toEqual({ foot: 0.3, top: -0.9, wholly: false })
    expect(finding.ruleId).toBe('openings-above-ground')
  })

  it('leaves a window in an inside wall alone, and the floors above the ground', () => {
    const plan = edit(twoFloorHouse(), (p) => {
      p.openings.push(window_('inner', 'hk', 2.5, 0.6))
    })
    const below = openingsBelowGround(withGround(plan, 1.5)).map((o) => o.opening)
    expect(below).not.toContain('inner')
    expect(below).not.toContain('balcony')
    expect(below).toContain('front')
  })

  it('takes an opening whose foot is at the ground as at it', () => {
    expect(openingsBelowGround(withGround(flat(), 0)).map((o) => o.opening)).toEqual([])
  })
})

describe('the plan check', () => {
  it('is one of the six plan checks, and its limit is said in every report', () => {
    expect(RULES.map((r) => r.id)).toContain('openings-above-ground')
    expect(LIMITS).toContain("Whether a door or window lies below the ground is checked only when the plan states the site's ground level, and against that level, or on a slope against the ground at the opening's own wall")
  })
})

describe('ground dug away in front of an opening (ARE-37)', () => {
  // The flat's kitchen window (sill 0.9) is partly below the ground at 1.2. A light well south of it.
  const withWell = (floorOffset?: number): FloorPlan =>
    edit(withGround(flat(), 1.2), (p) => {
      p.walls.push(exterior('w_a', [4, 0], [4, -2]), exterior('w_b', [4, -2], [10, -2]), exterior('w_c', [10, -2], [10, 0]))
      p.rooms.push({ ...room('well', 'Light well', ['s2', 'w_c', 'w_b', 'w_a']), outdoor: 'light-well', ...(floorOffset === undefined ? {} : { floorOffset }) })
    })
  const named = (plan: FloorPlan) => checkPlanSanity(plan).findings.filter((f) => f.code === 'opening_below_ground' && f.openings[0] === 'win_k')

  it('names the window when nothing is drawn in front of it', () => {
    expect(named(withGround(flat(), 1.2))).toHaveLength(1)
  })

  it('leaves it out when a light well whose floor is at or under its foot is in front of it', () => {
    expect(named(withWell(-1.5))).toEqual([])
    expect(named(withWell(0.9))).toEqual([])
  })

  it('names it, and the light well, when the well floor stands above its foot', () => {
    const [finding] = named(withWell(1.1))
    expect(finding!.message).toBe('The window in "Kitchen" lies partly below the ground: its sill is 0.30 m under the ground level the site states, and the floor of "Light well" in front of it stands above its foot')
  })

  it('leaves out a door at the foot of a ramp', () => {
    const plan = edit(withGround(flat(), 1.2), (p) => {
      p.floors = [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'up', name: 'Up', level: 3 }]
      p.ramps = [{ id: 'r', from: 'ground', to: 'up', width: 3, run: [[2, 1], [2, -10]] }]
    })
    const front = (q: FloorPlan) => checkPlanSanity(q).findings.filter((f) => f.code === 'opening_below_ground' && f.openings[0] === 'front')
    expect(front(withGround(flat(), 1.2))).toHaveLength(1)
    expect(front(plan)).toEqual([])
  })
})
