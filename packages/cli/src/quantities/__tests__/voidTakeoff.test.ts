/**
 * ARE-16: a void (LVL-4) is open to the floor below. It adds no floor area to a floor or to the
 * plan, and no floor, ceiling or skirting to the take-off; its open edge is a guard length.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { edit, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'
import { planAreas } from '../areas'

const solid = (): FloorPlan => parseFloorPlan(twoFloorHouse())
const withVoid = (): FloorPlan => parseFloorPlan(edit(twoFloorHouse(), (p) => { p.rooms = p.rooms.map((r) => (r.id === 'landing' ? { ...r, void: true } : r)) }))

describe('the take-off of a void', () => {
  const [a, b] = [planTakeoff(surveyPlan(solid())), planTakeoff(surveyPlan(withVoid()))]
  const [was, now] = [a.rooms.find((r) => r.id === 'landing')!, b.rooms.find((r) => r.id === 'landing')!]

  it('has no floor, ceiling or skirting, and they come out of the totals', () => {
    expect(was.floorArea).toBeGreaterThan(30)
    expect([now.floorArea, now.ceiling, now.skirting]).toEqual([0, 0, 0])
    expect(b.totals.floorArea).toBeCloseTo(a.totals.floorArea - was.floorArea, 6)
    expect(b.totals.ceiling).toBeCloseTo(a.totals.ceiling - was.ceiling, 6)
    expect(b.totals.skirting).toBeCloseTo(a.totals.skirting - was.skirting, 6)
  })

  it('keeps the wall faces round it, and gives its open edge as a guard length', () => {
    expect(now.wallFace).toBeCloseTo(was.wallFace, 6)
    expect(now.void).toBe(true)
    expect(now.guard).toBeGreaterThan(0)
    expect(b.totals.guard).toBeCloseTo(now.guard!, 6)
    expect(a.totals.guard).toBeUndefined()
    expect(was.guard).toBeUndefined()
  })
})

describe('the areas of a plan with a void', () => {
  it('counts the void in no total, and lists it', () => {
    const [a, b] = [planAreas(surveyPlan(solid())), planAreas(surveyPlan(withVoid()))]
    const landing = a.floors.flatMap((f) => f.rooms).find((r) => r.id === 'landing')!.net!
    const listed = b.floors.flatMap((f) => f.rooms).find((r) => r.id === 'landing')!
    expect(listed.void).toBe(true)
    expect(listed.net).toBeCloseTo(landing, 6)
    expect(b.net).toBeCloseTo(a.net - landing, 6)
  })
})

describe('the guard of a void', () => {
  it('is the whole open side when a dividing line stands where a wall would', () => {
    const open = parseFloorPlan(edit(twoFloorHouse(), (p) => {
      p.rooms = p.rooms.map((r) => (r.id === 'landing' ? { ...r, void: true } : r))
      p.walls = p.walls.map((w) => (w.id === 'u_mid' ? { ...w, virtual: true } : w))
      p.openings = p.openings.filter((o) => o.wall !== 'u_mid')
    }))
    const landing = planTakeoff(surveyPlan(open)).rooms.find((r) => r.id === 'landing')!
    expect(landing.guard).toBeCloseTo(7.8, 6)
  })
})
