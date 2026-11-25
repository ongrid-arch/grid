import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { checkPlanSanity } from '../rules'
import { door, edit, flat, room, wall, withoutOpening } from '../../test-support/plans'

const summary = (plan: FloorPlan) => checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.rooms.join('+')}`)

/** The flat with a yard against its north wall, entered by a gate in the bedroom's wall or by none. */
const withYard = (gate: boolean): FloorPlan =>
  edit(flat(), (c) => {
    c.walls.push(wall('ys', [0, 8], [0, 12]), wall('yw', [0, 12], [10, 12]), wall('ye', [10, 12], [10, 8]))
    c.rooms.push({ ...room('yard', 'Yard', ['n1', 'n2', 'ys', 'yw', 'ye']), outdoor: 'courtyard' })
    if (gate) c.openings.push(door('gate', 'n2', 2))
  })

describe('an outdoor space no door reaches', () => {
  it('is said when nothing leads into it', () => {
    expect(summary(withYard(false))).toEqual(['room_without_door yard'])
  })

  it('is not said when a door leads into it', () => {
    expect(summary(withYard(true))).toEqual([])
  })
})

describe('a floor with no way out', () => {
  it('fails the route check for every room that has a door', () => {
    const plan = withoutOpening(flat(), 'front')
    expect(summary(plan)).toEqual([
      'no_exit ',
      'no_route_to_exit bathroom',
      'no_route_to_exit bedroom',
      'no_route_to_exit hall',
      'no_route_to_exit kitchen'
    ])
  })

  it('fails a room with no door at all by that, and not twice', () => {
    expect(summary(withoutOpening(withoutOpening(flat(), 'front'), 'd_bb'))).toEqual([
      'no_exit ',
      'no_route_to_exit bedroom',
      'no_route_to_exit hall',
      'no_route_to_exit kitchen',
      'room_without_door bathroom'
    ])
  })
})
