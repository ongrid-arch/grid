/**
 * CNT-37: fixtures standing end to end are one run. Their joined faces are not side clearance, the
 * ends of the run are measured, a kind that needs no side clearance has none, and a run facing
 * another has an aisle to it.
 */
import { describe, expect, it } from 'vitest'
import type { Item } from '../../types/floorplan'
import { outline } from '../../test-support/outline'
import type { FloorPlan } from '../plan'
import { fixtureObstacles, fixtureSpace } from '../use'
import { itemKindDefinition } from '../itemKinds'
import { roomShapes } from '../items'
import { indexPlan } from '../plan'

function room(items: Item[]): FloorPlan {
  const { walls, room: r } = outline([[0, 0], [6, 0], [6, 4], [0, 4]])
  return { version: '1', units: 'm', walls, rooms: [{ ...r, name: 'Kitchen' }], openings: [], items }
}
const piece = (id: string, kind: Item['kind'], x: number, y = 0.4, turn = 0): Item => ({ id, kind, at: [x, y], size: [0.6, 0.6], height: 0.9, turn })
const spaceOf = (plan: FloorPlan, id: string) => {
  const [{ shape }] = roomShapes(indexPlan(plan))
  return fixtureSpace(plan.items!.find((i) => i.id === id)!, [...shape!.polygon], shape!.holes.map((h) => [...h]), fixtureObstacles(plan.items!, 'ground'))
}
const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100)

describe('fixtures end to end', () => {
  // Seven basins, 0.6 m each, from x 0.5 to 4.7: the run's ends are 0.4 m from the left wall and 1.2 m from the right.
  const run = room(Array.from({ length: 7 }, (_, i) => piece(`b${i}`, 'basin', 0.8 + i * 0.6)))

  it('joins the faces that touch and measures only the two ends of the run', () => {
    const sides = Array.from({ length: 7 }, (_, i) => spaceOf(run, `b${i}`))
    expect(sides.map((s) => [s.joined.left.length, s.joined.right.length])).toEqual([[0, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 0]])
    expect(sides.map((s) => [round(s.left), round(s.right)])).toEqual([[0.4, null], [null, null], [null, null], [null, null], [null, null], [null, null], [null, 1.2]])
  })

  it('does not join a piece a hand apart from the next', () => {
    const apart = room([piece('a', 'basin', 1), piece('b', 'basin', 1.7)])
    const s = spaceOf(apart, 'a')
    expect(s.joined.right).toEqual([])
    expect(round(s.right)).toBe(0.1)
  })

  it('gives a kitchen run and a shower no sides, and a basin its sides', () => {
    expect(itemKindDefinition('kitchen-run')!.sides).toBe(false)
    expect(itemKindDefinition('shower')!.sides).toBe(false)
    const s = spaceOf(room([piece('k', 'kitchen-run', 3)]), 'k')
    expect([s.sides, s.left, s.right]).toEqual([false, null, null])
    expect(spaceOf(room([piece('b', 'basin', 3)]), 'b').sides).toBe(true)
  })
})

describe('runs that face each other', () => {
  it('names what stops the front, and nothing for a wall', () => {
    // A run along the bottom wall facing up and a second turned to face it from the far side, 1.3 m between.
    const plan = room([piece('a', 'kitchen-run', 3), piece('b', 'kitchen-run', 3, 2.3, 180)])
    const a = spaceOf(plan, 'a')
    expect([a.frontBy, round(a.front)]).toEqual(['b', 1.3])
    expect(spaceOf(room([piece('k', 'kitchen-run', 3)]), 'k').frontBy).toBeNull()
  })
})
