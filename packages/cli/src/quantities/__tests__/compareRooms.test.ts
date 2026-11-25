import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { comparePlans } from '../compare'
import { surveyPlan } from '../survey'

/**
 * WRT-32: a room that kept its name and size but stands somewhere else is said to have moved, how
 * far and which way. Found when grid_compare said of a corridor moved 1 m east, between a living
 * room made wider and a bedroom made narrower, that every room kept its name and size.
 */
const text = (living: number, bed: number): string => `plan "Three in a row"
walls outside 0.2 inside 0.1 height 2.7
room living "Living" living ${living} x 4 at 0,0
room spine "Spine" corridor 1.2 x 4 east of living
room bed "Bedroom" bedroom ${bed} x 4 east of spine

door front in spine south, 0.2 from west, 0.9 wide, opens in, hinged west
`

function plan(living: number, bed: number): FloorPlan {
  const result = compileRoomsText(text(living, bed))
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

describe('a room that moved as it was', () => {
  it('is said to have moved, how far and which way, between two plans and in place', () => {
    for (const inPlace of [false, true]) {
      const c = comparePlans(surveyPlan(plan(4, 4)), surveyPlan(plan(5, 3)), ['before', 'after'], { inPlace })
      expect(c.likeness).toBeNull()
      const spine = c.rooms.find((r) => r.name === 'Spine')!
      expect(spine.moved).toBeCloseTo(1, 2)
      expect(spine.by![0]).toBeCloseTo(1, 2)
      expect(spine.by![1]).toBeCloseTo(0, 2)
      expect(c.roomsMoved.map((r) => r.text)).toEqual(['"Spine" moved 1.00 m east on the drawing, as it was'])
      expect(c.verdict).toContain('"Spine" moved 1.00 m east on the drawing, as it was')
      // The rooms that changed size did not move as they were.
      expect(c.rooms.find((r) => r.name === 'Living')!.moved).toBeNull()
      expect(c.rooms.find((r) => r.name === 'Bedroom')!.moved).toBeNull()
    }
  })

  it('says nothing moved for the same plan twice', () => {
    const c = comparePlans(surveyPlan(plan(4, 4)), surveyPlan(plan(4, 4)))
    expect(c.likeness).toBe('same')
    expect(c.roomsMoved).toEqual([])
    expect(c.rooms.every((r) => r.moved === null && r.by === null)).toBe(true)
  })
})
