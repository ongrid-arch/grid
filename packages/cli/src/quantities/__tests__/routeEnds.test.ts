/**
 * ARE-30: a route ends at the door of the stair room it reaches, and says where it starts and ends.
 *
 * The stair-room house: a hall (x 0 to 4) and a stair room (4 to 6), 4 m deep, a door between them.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const survey = surveyPlan(stairRoomHouse())

describe('a route ends at the door of the stair room (ARE-30)', () => {
  it('to a stair room it ends at the doorway into it, not at the middle of its widest circle', () => {
    const toStair = routeBetween(survey, 'ground-main', 'ground-stair', false)!
    expect(toStair.endPoint!.at).toBe('door')
    const toMiddle = routeBetween(survey, 'ground-main', 'ground-stair', false, { end: 'middle' })!
    expect(toMiddle.endPoint!.at).toBe('middle')
    expect(toStair.length!).toBeLessThan(toMiddle.length!)
    // The door is the same one: the stair room's share of the walk is nil at the door.
    expect(toStair.legs.at(-1)!.length).toBeCloseTo(0, 6)
    expect(toStair.endPoint!.point.x).toBeGreaterThan(4)
    expect(toStair.endPoint!.point.y).toBeCloseTo(1.5 + 0.45, 1)
  })

  it('a room that is no stair keeps ending at its middle, and a lift ends at its door too', () => {
    expect(routeBetween(survey, 'ground-stair', 'ground-main', false)!.endPoint!.at).toBe('middle')
    expect(routeBetween(surveyPlan(stairRoomHouse({ use: 'lift' })), 'ground-main', 'ground-stair', false)!.endPoint!.at).toBe('door')
  })

  it('to outside it ends at the outside face of the door out', () => {
    const route = routeBetween(survey, 'ground-stair', 'outside')!
    expect(route.endPoint!.at).toBe('outside face of the door')
    expect(route.endPoint!.point.y).toBeLessThan(0)
  })

  it('a start is the middle, the door it leaves by, the farthest corner, or a point given', () => {
    const at = (start: Parameters<typeof routeBetween>[4] & object) => routeBetween(survey, 'ground-main', 'ground-stair', false, start)!
    expect(at({}).startPoint!.at).toBe('middle')
    const door = at({ start: 'door' })
    expect(door.startPoint!.at).toBe('door')
    expect(door.legs[0]!.length).toBeCloseTo(0, 6)
    const corner = at({ start: 'farthest corner' })
    expect(corner.startPoint!.at).toBe('farthest corner')
    expect(corner.startPoint!.point.x).toBeCloseTo(0.1, 6)
    expect(corner.startPoint!.point.y).toBeCloseTo(3.9, 6)
    expect(corner.length!).toBeGreaterThan(at({}).length!)
    const given = at({ start: { x: 1, y: 1 } })
    expect(given.startPoint).toEqual({ point: { x: 1, y: 1 }, at: 'given point' })
  })

  describe('through grid_measure', () => {
    let b: Bench
    afterEach(() => b?.close())
    it('gives both points in coordinates and refuses a start off the floor', async () => {
      b = bench({ 'house.json': stairRoomHouse() })
      const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'ground-main', to: 'ground-stair', start: 'door' })
      expect(reply.isError).toBe(false)
      const answer = reply.data!['answer'] as { startPoint: { at: string }; endPoint: { at: string; point: { x: number } } }
      expect(answer.startPoint.at).toBe('door')
      expect(answer.endPoint.at).toBe('door')
      expect(reply.text).toContain('(door) to')
      const off = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'ground-main', to: 'ground-stair', x: 9, y: 9 })
      expect(off.isError).toBe(true)
      const both = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'ground-main', to: 'ground-stair', x: 1, y: 1, start: 'door' })
      expect(both.isError).toBe(true)
    })
  })
})
