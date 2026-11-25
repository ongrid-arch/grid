/**
 * MSG-14: which rooms a door or an open dividing line joins, read from the geometry along the
 * whole line, and rooms that reach no way in, even when the way out cannot be checked. The plans
 * are the lab's findings rebuilt: two stores that open only into each other (CH-7), an open
 * office split by two crossing lines (S-4) and a wall moved 1 m under a door (WR-3).
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { checkPlanSanity } from '../rules'
import { doorsThatChangedRooms } from '../rules/doors'
import { floorGraph } from '../rules/graph'
import { door, edit, exterior, room, twoFloorHouse, wall } from '../../test-support/plans'

const plan = (parts: Partial<FloorPlan> & Pick<FloorPlan, 'walls'>): FloorPlan => ({ version: '1', units: 'm', rooms: [], openings: [], ...parts })

const summary = (p: FloorPlan) => checkPlanSanity(p).findings.map((f) => `${f.code} ${f.floor} ${f.rooms.join('+')}`)

describe('CH-7 rooms that reach no way in, when the way out is not checked', () => {
  // The lab's M-8 flat: three 3.2 m rooms in a row. The front door is in the hall; the two
  // stores open only into each other, with no door to the hall.
  const flat = (landing: boolean): FloorPlan =>
    plan({
      walls: [
        wall('s', [0, 0], [9.6, 0]),
        exterior('e', [9.6, 0], [9.6, 3.2]),
        exterior('n', [9.6, 3.2], [0, 3.2]),
        exterior('w', [0, 3.2], [0, 0]),
        wall('m1', [3.2, 0], [3.2, 3.2]),
        wall('m2', [6.4, 0], [6.4, 3.2]),
        // The landing outside the front door, drawn as walls and not as a room.
        ...(landing ? [exterior('l1', [0, 0], [0, -2]), exterior('l2', [0, -2], [3.2, -2]), exterior('l3', [3.2, -2], [3.2, 0])] : [])
      ],
      rooms: [room('hall', 'Hall', ['s', 'm1', 'n', 'w']), room('store1', 'Store 1', ['s', 'm2', 'n', 'm1']), room('store2', 'Store 2', ['s', 'e', 'n', 'm2'])],
      openings: [door('front', 's', 1), door('bc', 'm2', 1)]
    })

  it('names both stores, though the front door leads to a landing not drawn', () => {
    const report = checkPlanSanity(flat(true))
    expect(report.findings.map((f) => [f.code, f.rooms, f.message])).toEqual([
      ['door_to_undrawn_space', ['hall'], 'A door from "Hall" leads to a space that is not drawn as a room'],
      ['no_route_to_exit', ['store1'], '"Store 1" has no route to a door to the outside, nor to a door into a space that is not drawn'],
      ['no_route_to_exit', ['store2'], '"Store 2" has no route to a door to the outside, nor to a door into a space that is not drawn']
    ])
    expect(report.notChecked.map((n) => n.reason)).toEqual(['way_out_not_drawn'])
    expect(report.findings[1]!.through).toEqual([{ room: 'store2', via: 'bc' }])
  })

  it('names them as cut off from the way out when nothing lies past the front door (MSG-13)', () => {
    expect(summary(flat(false))).toEqual(['no_route_to_exit ground store1', 'no_route_to_exit ground store2'])
  })

  it('says nothing more once a door joins the stores to the hall', () => {
    const joined = edit(flat(true), (copy) => {
      copy.openings.push(door('ab', 'm1', 1))
    })
    expect(summary(joined)).toEqual(['door_to_undrawn_space ground hall'])
  })
})

describe('S-4 an open office split into four zones by two crossing lines', () => {
  // 24 × 14 m: four desk zones west of a core wall at x = 18, split by one line across (y = 7)
  // and one along (x = 9) that cross at their middles, (9, 7); two meeting rooms and a tea point
  // east of the core. The entrance is in the south-west zone, the fire exit in the north-west.
  const line = (id: string, start: [number, number], end: [number, number]): Wall => ({ ...wall(id, start, end), virtual: true, thickness: 0, height: 0 })
  const office = (): FloorPlan =>
    plan({
      walls: [
        exterior('o-s', [0, 0], [24, 0]),
        exterior('o-e', [24, 0], [24, 14]),
        exterior('o-n', [24, 14], [0, 14]),
        exterior('o-w', [0, 14], [0, 0]),
        wall('core', [18, 0], [18, 14]),
        wall('m1-n', [18, 5], [24, 5]),
        wall('m2-n', [18, 9], [24, 9]),
        line('vx', [9, 0], [9, 14]),
        line('vy', [0, 7], [18, 7])
      ],
      rooms: [
        room('z-sw', 'Support', ['o-s', 'vx', 'vy', 'o-w']),
        room('z-se', 'Finance', ['o-s', 'core', 'vy', 'vx']),
        room('z-ne', 'Sales', ['vy', 'core', 'o-n', 'vx']),
        room('z-nw', 'Product', ['vy', 'vx', 'o-n', 'o-w']),
        room('meet-1', 'Meeting room 1', ['o-s', 'o-e', 'm1-n', 'core']),
        room('meet-2', 'Meeting room 2', ['m1-n', 'o-e', 'm2-n', 'core']),
        room('tea', 'Tea point', ['m2-n', 'o-e', 'o-n', 'core'])
      ],
      openings: [
        door('entry', 'o-w', 11),
        door('fire-exit', 'o-n', 20),
        door('m1-d', 'core', 2),
        door('m2-d', 'core', 6),
        door('tea-d', 'core', 11)
      ] as Opening[]
    })

  it('joins the four zones along both halves of each line', () => {
    const links = floorGraph(office()).links.filter((l) => l.via === 'vx' || l.via === 'vy')
    expect(links).toEqual([
      { rooms: ['z-ne', 'z-nw'], via: 'vx' },
      { rooms: ['z-ne', 'z-se'], via: 'vy' },
      { rooms: ['z-nw', 'z-sw'], via: 'vy' },
      { rooms: ['z-se', 'z-sw'], via: 'vx' }
    ])
  })

  it('gives no false exit note: every zone and room reaches the entrance (S-4: 6 notes)', () => {
    expect(checkPlanSanity(office()).findings).toEqual([])
  })
})

describe('WR-3 a wall moved 1 m under a door', () => {
  // A hall along the south of a living room and a kitchen. The living-room door is in the hall's
  // north wall, 4.0 to 4.9 m along it; the wall between the living room and the kitchen stands at
  // x = 5, and the edit moves it to x = 4. Nothing about the door or the wall lists changes.
  const house = (x: number): FloorPlan =>
    plan({
      walls: [
        exterior('s', [0, 0], [9, 0]),
        exterior('e1', [9, 0], [9, 2]),
        exterior('e2', [9, 2], [9, 6]),
        exterior('n', [9, 6], [0, 6]),
        exterior('w2', [0, 6], [0, 2]),
        exterior('w1', [0, 2], [0, 0]),
        wall('hall-n', [0, 2], [9, 2]),
        wall('lk', [x, 2], [x, 6])
      ],
      rooms: [
        room('hall', 'Hall', ['s', 'e1', 'hall-n', 'w1']),
        room('living', 'Living room', ['hall-n', 'lk', 'n', 'w2']),
        room('kitchen', 'Kitchen', ['hall-n', 'e2', 'n', 'lk'])
      ],
      openings: [door('front', 's', 1), door('door-living', 'hall-n', 4), door('door-kitchen', 'hall-n', 7)]
    })

  it('names the door that now joins other rooms, with the rooms before and after', () => {
    expect(doorsThatChangedRooms(house(5), house(4))).toEqual([
      {
        opening: 'door-living',
        floor: 'ground',
        before: [{ room: 'hall' }, { room: 'living' }],
        after: [{ room: 'hall' }, { room: 'kitchen' }],
        message: '"door-living" joined "hall" and "living"; it now joins "hall" and "kitchen"'
      }
    ])
  })

  it('names nothing when the doors still join the rooms they did', () => {
    expect(doorsThatChangedRooms(house(5), house(5.5))).toEqual([])
  })

  it('says when a door now leads outside or into a space not drawn', () => {
    const before = house(5)
    const roomless = { ...before, rooms: before.rooms.filter((r) => r.id !== 'hall') }
    expect(doorsThatChangedRooms(before, roomless).map((c) => c.message)).toEqual([
      '"front" joined "hall" and the outside; it now joins the outside and a space that is not drawn',
      '"door-living" joined "hall" and "living"; it now joins "living" and a space that is not drawn',
      '"door-kitchen" joined "hall" and "kitchen"; it now joins "kitchen" and a space that is not drawn'
    ])
  })
})

describe('a door into a space not drawn, off the ground floor', () => {
  it('is said on every floor, as on the ground (CH-7)', () => {
    const house = twoFloorHouse()
    const noLanding = { ...house, rooms: house.rooms.filter((r) => r.id !== 'landing') }
    // LVL-1: with the balcony door, 2.95 m up, named too (lab VE-8).
    // LVL-14: and the first floor, which no stair reaches, is named.
    expect(summary(noLanding)).toEqual(['door_to_outside_above_ground first study', 'door_to_undrawn_space first study', 'no_stair first '])
  })
})
