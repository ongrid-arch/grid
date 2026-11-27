/**
 * ARE-70: a flat drawn on its own up in a building leaves by its front door onto the common
 * landing. The check follows its way out from that door, as it does for a flat on the ground floor,
 * and never says that no stair joins the floor to the ground.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { checkPlanSanity } from '../rules'
import { edit, flat, twoFloorHouse } from '../../test-support/plans'
import { stand } from '../../test-support/largerBuilding'

const summary = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.rooms.join('+')} ${f.openings.join('+')}`.trim())
const notices = (plan: FloorPlan): string[] => checkPlanSanity(plan).notChecked.map((n) => `${n.reason} ${n.floor} ${n.openings.join('+')}`)

/** The test flat on a third floor, 9 m above the ground, nothing else of the building drawn. */
const upHigh = (change: (copy: FloorPlan) => void = () => {}): FloorPlan =>
  edit(flat(), (copy) => {
    copy.floors = [{ id: 'third', name: 'Third floor', level: 3, elevation: 9 }]
    for (const part of [...copy.walls, ...copy.rooms, ...copy.openings]) (part as { floor?: string }).floor = 'third'
    change(copy)
  })
const entrance = (copy: FloorPlan): FloorPlan['walls'][number] => copy.walls.find((w) => w.id === 's1')!

describe('ARE-70 a flat up in a building leaves by its front door onto the common landing', () => {
  it('reads a front door in a separating wall as the way out, not as a floor no stair joins', () => {
    const plan = upHigh((copy) => {
      entrance(copy).kind = 'separating'
    })
    expect(summary(plan)).toEqual([])
    expect(notices(plan)).toEqual(['way_out_through_common_parts third front'])
  })

  it('does the same for a wall that states the common parts beyond it', () => {
    const plan = upHigh((copy) => {
      entrance(copy).kind = 'interior'
      entrance(copy).beyond = 'common'
    })
    expect(summary(plan)).toEqual([])
    expect(notices(plan)).toEqual(['way_out_through_common_parts third front'])
  })

  it('finds a room cut off from the front door', () => {
    const cut = upHigh((copy) => {
      entrance(copy).kind = 'separating'
      // The bedroom and bathroom are joined to each other only.
      copy.openings = copy.openings.filter((o) => o.id !== 'd_hb')
    })
    expect(summary(cut)).toEqual(['no_route_to_exit bathroom', 'no_route_to_exit bedroom'])
    expect(checkPlanSanity(cut).findings[0]!.message).toMatch(/Bathroom/)
  })

  it('still says a door that nothing marks, 9 m above the ground, as no way out', () => {
    const plan = upHigh()
    expect(summary(plan)).toEqual(['door_to_outside_above_ground hall front'])
    expect(notices(plan)).toEqual(['no_stairs third '])
  })

  it('reads an open side onto the common parts as the way out too', () => {
    const plan = edit(stand('common'), (copy) => {
      copy.floors = [{ id: 'third', name: 'Third floor', level: 3, elevation: 9 }]
      for (const part of [...copy.walls, ...copy.rooms]) (part as { floor?: string }).floor = 'third'
    })
    expect(summary(plan)).toEqual([])
    expect(notices(plan)).toEqual(['way_out_through_common_parts third front'])
  })

  it('keeps a balcony door upstairs said beside a front door onto the landing', () => {
    const plan = upHigh((copy) => {
      entrance(copy).kind = 'separating'
      copy.openings.push({ id: 'balcony', type: 'door', wall: 'n2', offset: 2, width: 0.9, height: 2.1, sill: 0, floor: 'third' } as FloorPlan['openings'][number])
    })
    expect(summary(plan)).toEqual(['door_to_outside_above_ground bedroom balcony'])
    expect(notices(plan)).toEqual(['way_out_through_common_parts third front'])
  })

  it('gives an upper floor entered from the common parts no "no stair" finding when the ground floor is drawn', () => {
    const before = twoFloorHouse()
    expect(summary(before)).toContain('no_stair')
    const plan = edit(before, (copy) => {
      copy.walls.find((w) => w.id === 'u_w')!.kind = 'separating'
      copy.openings.push({ id: 'up-front', type: 'door', wall: 'u_w', offset: 2, width: 0.9, height: 2.1, sill: 0, floor: 'first' } as FloorPlan['openings'][number])
    })
    expect(summary(plan).filter((line) => line.startsWith('no_stair'))).toEqual([])
    expect(notices(plan)).toContain('way_out_through_common_parts first up-front')
    expect(notices(plan).some((n) => n.startsWith('no_stairs'))).toBe(false)
  })
})
