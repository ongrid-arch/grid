/**
 * SHT-27: the access marks, placed on the drawn floor from what the caller gives by part id: a
 * way's stops at its rooms' label points and its doors' middles, broken where it leaves the floor,
 * and a door's or a turning circle's mark only on the floor that holds it.
 */
import { describe, expect, it } from 'vitest'
import { twoFloorHouse } from '../../test-support/plans'
import { drawingMarks, type AccessMarkLabels } from '../drawingMarks'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'

const plan = twoFloorHouse()
const marksOn = (floor: string, access: AccessMarkLabels) => {
  const drawing = buildFloorPlan(planForFloor(plan, floor))
  return { drawing, marks: drawingMarks(plan, floor, drawing, drawing.bounds, { access }) }
}

describe('SHT-27 the access marks on a floor', () => {
  const access: AccessMarkLabels = {
    // A way that goes up to the first floor: its rooms below, a stair, then the landing and the study.
    routes: [{ to: 'study', stops: ['hall', 'stair-join', 'landing', 'd_up', 'study'] }],
    turning: [{ room: 'landing', at: { x: 2.5, y: 4 }, diameter: 1.4, label: 'turns 1.40 m', short: true }],
    doors: [{ id: 'd_up', label: '0.80 m clear', short: false }, { id: 'balcony', label: '0.70 m clear', short: true }],
    steps: [{ at: 'balcony', label: 'step 0.15 m', short: false }, { at: 'balcony', label: 'step 0.15 m', short: false }],
  }

  it('places each mark on the floor that holds it, and breaks a way where it leaves the floor', () => {
    const { drawing, marks } = marksOn('first', access)
    const room = (id: string) => drawing.rooms.find((r) => r.id === id)!.labelAt
    const door = drawing.openings.find((o) => o.id === 'd_up')!
    const middle = { x: (door.from.x + door.to.x) / 2, y: (door.from.y + door.to.y) / 2 }
    // The hall is below and the stair no part drawn: the run on this floor is landing, door, study.
    expect(marks.access!.routes).toEqual([{ to: 'study', points: [room('landing'), middle, room('study')] }])
    expect(marks.access!.turning).toEqual([{ room: 'landing', at: { x: 2.5, y: 4 }, radius: 0.7, label: 'turns 1.40 m', short: true }])
    expect(marks.access!.doors.map((d) => [d.id, d.label, d.short])).toEqual([['d_up', '0.80 m clear', false], ['balcony', '0.70 m clear', true]])
    // Each tag stands on its wall's face, out from the middle of the opening.
    const upMark = marks.access!.doors[0]!
    expect(Math.hypot(upMark.at.x - middle.x, upMark.at.y - middle.y)).toBeCloseTo(door.thickness / 2, 6)
    // The same step said twice is one mark.
    expect(marks.access!.steps.map((s) => s.id)).toEqual(['balcony'])
  })

  it('leaves out what stands on another floor, and draws no access marks unless asked', () => {
    const { marks } = marksOn('ground', access)
    expect(marks.access!.turning).toEqual([])
    expect(marks.access!.doors).toEqual([])
    expect(marks.access!.routes).toEqual([])
    const drawing = buildFloorPlan(planForFloor(plan, 'ground'))
    expect(drawingMarks(plan, 'ground', drawing, drawing.bounds, { levels: true }).access).toBeNull()
  })
})
