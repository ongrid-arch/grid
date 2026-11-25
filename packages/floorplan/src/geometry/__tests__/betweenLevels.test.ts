/**
 * A door onto a floor much higher than its own is not a way through (LVL-17).
 *
 * A foyer with the front door, and beside it a hall whose floor stands 3 m up (a back row reached
 * from the foyer), behind one dividing wall with one door. Each room's level is its `floorOffset`
 * (LVL-7). The step a person takes is Grid's own size (`passableRise`), not a code figure.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room } from '../plan'
import { checkPlanSanity } from '../rules'
import { floorGraph } from '../rules/graph'
import { limit } from '../tolerances'
import { planNotes } from '../../notes/notes'

const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior') => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 6,
  kind
})

const door = (id: string, onWall: string, extra: Partial<Opening> = {}): Opening => ({
  id,
  wall: onWall,
  type: 'door',
  offset: 1,
  width: 0.9,
  height: 2.1,
  sill: 0,
  ...extra
})

const front = door('front', 's')
const hallDoor = door('hall-door', 'mid')

/** The foyer and the hall, the hall's floor `rise` above the foyer's. */
function cinema(rise: number, openings: Opening[] = [front, hallDoor], hall: Partial<Room> = {}): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [8, 0], 'exterior'),
      wall('e', [8, 0], [8, 4], 'exterior'),
      wall('n', [8, 4], [0, 4], 'exterior'),
      wall('w', [0, 4], [0, 0], 'exterior'),
      wall('mid', [4, 0], [4, 4], 'interior')
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer', boundary: ['s', 'mid', 'n', 'w'], use: 'reception' },
      { id: 'hall', name: 'Back row', boundary: ['s', 'e', 'n', 'mid'], use: 'assembly', floorOffset: rise, ...hall }
    ],
    openings
  }
}

const codes = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.rooms.join('+')}`)

describe('a door onto a floor much higher than its own (LVL-17)', () => {
  it('is not a way through, and the graph names it with both levels', () => {
    const graph = floorGraph(cinema(3))
    expect(graph.links).toEqual([])
    expect(graph.betweenLevels).toEqual([{ opening: 'hall-door', lower: 'foyer', lowerAt: 0, upper: 'hall', upperAt: 3, rise: 3 }])
  })

  it('is a finding naming both rooms and both levels, and the room up there has no route out', () => {
    const report = checkPlanSanity(cinema(3))
    expect(codes(cinema(3))).toEqual(['door_between_levels foyer+hall', 'no_route_to_exit hall'])
    expect(report.findings[0]).toMatchObject({
      ruleId: 'door-leads-somewhere',
      openings: ['hall-door'],
      message: 'A door joins "Foyer", its floor at 0.00 m, and "Back row", its floor at 3.00 m: 3.00 m apart, more than a step, so it is not a way through without a stair',
      levels: { lower: { room: 'foyer', at: 0 }, upper: { room: 'hall', at: 3 }, rise: 3 }
    })
  })

  it('is said the same way in the notes a person reads', () => {
    const plan = cinema(3)
    const note = planNotes(plan, checkPlanSanity(plan)).notes[0]!
    expect(note.title.map((part) => part.text).join('')).toBe(
      'A door joins Foyer, its floor at 0.00 m, and Back row, its floor at 3.00 m: 3.00 m apart, more than a step, so it is not a way through without a stair'
    )
  })

  it('names a doorless opening as an opening', () => {
    const opening = door('hall-door', 'mid', { type: 'opening' })
    const report = checkPlanSanity(cinema(-1.2, [front, opening]))
    expect(report.findings[0]?.message).toBe(
      'An opening joins "Back row", its floor at -1.20 m, and "Foyer", its floor at 0.00 m: 1.20 m apart, more than a step, so it is not a way through without a stair'
    )
    expect(report.findings.map((f) => f.code)).toEqual(['door_between_levels', 'no_route_to_exit'])
  })

  it('is a way through at a step, Grid\'s own size, as drawn', () => {
    expect(limit('passableRise')).toBe(0.3)
    expect(codes(cinema(0.3))).toEqual([])
    expect(floorGraph(cinema(0.3)).links).toEqual([{ rooms: ['foyer', 'hall'], via: 'hall-door' }])
    expect(codes(cinema(0.31))).toEqual(['door_between_levels foyer+hall', 'no_route_to_exit hall'])
  })

  it('is a way through from or into a room used as a stair: the stair climbs between the levels', () => {
    expect(codes(cinema(3, [front, hallDoor], { use: 'stair' }))).toEqual([])
    expect(floorGraph(cinema(3, [front, hallDoor], { use: 'stair' })).betweenLevels).toEqual([])
  })

  it('makes a room whose only door it is a room with no route out, never a room with no door', () => {
    expect(codes(cinema(3)).some((line) => line.startsWith('room_without_door'))).toBe(false)
  })

  it('leaves windows alone, and a plan with every room on its storey as before', () => {
    const window: Opening = { id: 'hall-win', wall: 'mid', type: 'window', offset: 2.5, width: 1, height: 1, sill: 1 }
    expect(floorGraph(cinema(3, [front, hallDoor, window])).betweenLevels.map((b) => b.opening)).toEqual(['hall-door'])
    expect(codes(cinema(0))).toEqual([])
  })
})
