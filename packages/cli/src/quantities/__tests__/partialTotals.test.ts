/**
 * ARE-42: a floor whose gross figure cannot be worked out does not take the building's total
 * from the floors that can: their total is given, with each floor left out named and why.
 */
import { describe, expect, it } from 'vitest'
import { stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { planAreas } from '../areas'
import { surveyPlan } from '../survey'

/** The house with one floor left with no rooms and no wall facing outside: no gross internal area there. */
function withBrokenFloor(floors: readonly string[]) {
  const plan = structuredClone(stairRoomHouse())
  for (const floor of floors) {
    plan.rooms = plan.rooms.filter((room) => room.floor !== floor)
    for (const wall of plan.walls) if (wall.floor === floor) wall.kind = 'interior'
  }
  return plan
}

describe('a building total with floors that could not be measured (ARE-42)', () => {
  it('gives the other floors\' total and names the floor left out with its reason', () => {
    const whole = planAreas(surveyPlan(stairRoomHouse()))
    expect(whole.partial).toBeUndefined()
    const areas = planAreas(surveyPlan(withBrokenFloor(['first'])))
    expect(areas.grossInternal).toBeNull()
    const part = areas.partial!.grossInternal!
    const others = areas.floors.filter((f) => f.floor !== 'first')
    expect(part.floors).toEqual(others.map((f) => f.floor))
    expect(part.area).toBeCloseTo(others.reduce((sum, f) => sum + f.grossInternal!, 0), 9)
    expect(part.unmeasured.map((u) => u.floor)).toEqual(['first'])
    expect(part.unmeasured[0]!.why).toMatch(/\S/)
    expect(areas.notes.some((note) => note.includes('not measured: floor "first"'))).toBe(true)
  })

  it('names every floor that fails, not a sample', () => {
    const areas = planAreas(surveyPlan(withBrokenFloor(['first', 'ground'])))
    const part = areas.partial?.grossInternal
    expect(part?.unmeasured.map((u) => u.floor).sort()).toEqual(['first', 'ground'])
  })
})
