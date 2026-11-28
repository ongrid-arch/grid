/**
 * ARE-81: a route from a point with no room named, and from a room's or a floor's farthest point
 * by its nearest way.
 *
 * The stair-room house: on each of three floors a hall (x 0 to 4) and a stair room (4 to 6),
 * 4 m deep, a door between them; the ground hall's front door in its south wall. A second door
 * out is added in the hall's west wall, near its north end, so the hall has two ways out.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { door, stairRoomHouse, withOpening } from '@ongrid/floorplan/test-support/plans'
import { farthestOnFloor, farthestPoint, roomAtPoint } from '../farthest'
import { routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const twoWaysOut = (): ReturnType<typeof stairRoomHouse> => withOpening(stairRoomHouse(), door('west', 'ground-w', 0.2))
const survey = surveyPlan(twoWaysOut())

describe('the farthest point by the nearest way (ARE-81)', () => {
  it('is the point whose nearest way out is the longest, not the corner farthest from the door the middle takes', () => {
    const found = farthestPoint(survey, 'ground-main', 'outside')!
    expect(found.route.startPoint).toEqual({ point: found.point, at: 'farthest point' })
    // The north-east corner: nearer the west door than the front door.
    expect(found.point.x).toBeGreaterThan(3.8)
    expect(found.point.y).toBeGreaterThan(3.8)
    expect(found.route.exit).toBe('west')
    // The farthest corner is measured to the front door the middle takes, and so overstates it.
    const corner = routeBetween(survey, 'ground-main', 'outside', true, { start: 'farthest corner' })!
    expect(corner.length!).toBeGreaterThan(found.route.length! + 0.2)
    // No point of the room walks farther to its nearest way out.
    for (let x = 0.15; x < 3.9; x += 0.35) {
      for (let y = 0.15; y < 3.9; y += 0.35) {
        const from = routeBetween(survey, 'ground-main', 'outside', true, { start: { x, y } })!
        expect(from.length!).toBeLessThanOrEqual(found.route.length! + 1e-6)
      }
    }
  })

  it('with one way out it is never shorter than the farthest corner, and goes down the stairs from upstairs', () => {
    const one = surveyPlan(stairRoomHouse())
    const found = farthestPoint(one, 'second-main', 'outside')!
    const corner = routeBetween(one, 'second-main', 'outside', true, { start: 'farthest corner' })!
    expect(found.route.length!).toBeGreaterThanOrEqual(corner.length! - 1e-6)
    expect(new Set(found.route.floors)).toEqual(new Set(['second', 'first', 'ground']))
  })

  it('to a room: the farthest point of the hall from the stair room', () => {
    const found = farthestPoint(survey, 'ground-main', 'ground-stair')!
    // The west side of the hall is farthest from the door in its east wall.
    expect(found.point.x).toBeLessThan(0.2)
    expect(found.route.to).toBe('ground-stair')
  })

  it('a floor: each room once, the longest walk first', () => {
    const floor = farthestOnFloor(survey, 'ground', 'outside')
    expect(floor.rooms.map((r) => r.room)).toEqual(['ground-stair', 'ground-main'])
    expect(floor.rooms[0]!.route.length!).toBeGreaterThan(floor.rooms[1]!.route.length!)
    expect(floor.unreached).toEqual([])
    // The room the route ends in is not one of them.
    expect(farthestOnFloor(survey, 'ground', 'ground-stair').rooms.map((r) => r.room)).toEqual(['ground-main'])
  })

  it('finds the room a point stands in, and says when floors or no room hold it', () => {
    expect(roomAtPoint(survey, { x: 1, y: 1 }, 'first')).toMatchObject({ room: { facts: { id: 'first-main' } } })
    expect(roomAtPoint(survey, { x: 1, y: 1 })).toEqual({ floors: ['ground', 'first', 'second'] })
    expect(roomAtPoint(survey, { x: 9, y: 9 })).toEqual({ none: true })
  })

  it('leaves the plan as it was', () => {
    const plan = twoWaysOut()
    const before = JSON.stringify(plan)
    farthestOnFloor(surveyPlan(plan), 'ground', 'outside')
    expect(JSON.stringify(plan)).toBe(before)
  })

  describe('through grid_measure', () => {
    let b: Bench
    afterEach(() => b?.close())

    it('a route from a point with no room, on the floor named', async () => {
      b = bench({ 'house.json': twoWaysOut() })
      const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', x: 1, y: 1, floor: 'second', to: 'outside' })
      expect(reply.isError).toBe(false)
      const answer = reply.data!['answer'] as { from: string; startPoint: { at: string; point: { x: number; y: number } }; floors: string[] }
      expect(answer.from).toBe('second-main')
      expect(answer.startPoint).toEqual({ at: 'given point', point: { x: 1, y: 1 } })
      expect(answer.floors).toContain('ground')
      const many = await b.call('grid_measure', { plan: 'house.json', what: 'route', x: 1, y: 1, to: 'outside' })
      expect(many.isError).toBe(true)
      expect(many.text).toContain('more than one floor')
      const none = await b.call('grid_measure', { plan: 'house.json', what: 'route', x: 9, y: 9, floor: 'ground', to: 'outside' })
      expect(none.isError).toBe(true)
      expect(none.text).toContain('no room')
    })

    it('a room\'s farthest point, and every room of a floor', async () => {
      b = bench({ 'house.json': twoWaysOut() })
      const room = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'ground-main', to: 'outside', start: 'farthest point' })
      expect(room.isError).toBe(false)
      const answer = room.data!['answer'] as { exit: string; startPoint: { at: string }; farthest: { room: string; length: number }[]; length: number }
      expect(answer.startPoint.at).toBe('farthest point')
      expect(answer.exit).toBe('west')
      expect(answer.farthest).toEqual([expect.objectContaining({ room: 'ground-main', length: answer.length })])
      expect(room.text).toContain('The farthest point of')
      const floor = await b.call('grid_measure', { plan: 'house.json', what: 'route', floor: 'ground', to: 'outside', start: 'farthest point' })
      expect(floor.isError).toBe(false)
      const rooms = floor.data!['answer'] as { from: string; floor: string; farthest: { room: string }[] }
      expect(rooms.floor).toBe('ground')
      expect(rooms.farthest.map((f) => f.room)).toEqual(['ground-stair', 'ground-main'])
      expect(rooms.from).toBe('ground-stair')
      const noFloor = await b.call('grid_measure', { plan: 'house.json', what: 'route', to: 'outside', start: 'farthest point' })
      expect(noFloor.isError).toBe(true)
      const floorAndRoom = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'ground-main', floor: 'ground', to: 'outside' })
      expect(floorAndRoom.isError).toBe(true)
      const stray = await b.call('grid_measure', { plan: 'house.json', what: 'room', room: 'ground-main', floor: 'ground' })
      expect(stray.isError).toBe(true)
    })
  })
})
