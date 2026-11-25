import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { MEASURES, planAreaFigures } from '../areas'
import { edit, twoFloorHouse } from '../../test-support/plans'

/**
 * ARE-16: a void (LVL-4) is open to the floor below, so it has no floor: it adds nothing to a
 * floor's net, gross internal or gross external area. It is still listed and measured.
 */
const solid = (): FloorPlan => parseFloorPlan(twoFloorHouse())
const withVoid = (): FloorPlan => parseFloorPlan(edit(twoFloorHouse(), (p) => { p.rooms = p.rooms.map((r) => (r.id === 'landing' ? { ...r, void: true } : r)) }))

const first = (plan: FloorPlan) => planAreaFigures(plan).floors.find((f) => f.floor === 'first')!

describe('ARE-16 a void adds no floor area', () => {
  const [a, b] = [first(solid()), first(withVoid())]
  const landing = a.rooms.find((r) => r.id === 'landing')!.area

  it('takes the void out of the floor net and its use', () => {
    expect(landing).toBeGreaterThan(30)
    expect(b.net).toBeCloseTo(a.net - landing, 6)
    expect(Object.values(b.byUse).reduce((x, y) => x + y, 0)).toBeCloseTo(b.net, 6)
  })

  it('still lists the void with its size, marked as a void', () => {
    const listed = b.rooms.find((r) => r.id === 'landing')!
    expect(listed.void).toBe(true)
    expect(listed.area).toBeCloseTo(landing, 6)
    expect(b.voids).toBeCloseTo(landing, 6)
    expect(a.voids).toBe(0)
  })

  it('takes it out of gross internal and gross external too', () => {
    expect(b.grossInternal!).toBeCloseTo(a.grossInternal! - landing, 6)
    expect(b.grossExternal!).toBeCloseTo(a.grossExternal! - landing, 6)
  })

  it('keeps net plus walls plus unclaimed floor equal to gross external', () => {
    expect(b.grossExternal!).toBeCloseTo(b.net + b.overStairs + b.outsideRooms + b.walls! + b.unclaimed! - b.offSpace!, 6)
  })

  it('totals without the void, and says so in the rule', () => {
    const [x, y] = [planAreaFigures(solid()), planAreaFigures(withVoid())]
    expect(y.net.area!).toBeCloseTo(x.net.area! - landing, 6)
    expect(y.grossInternal.area!).toBeCloseTo(x.grossInternal.area! - landing, 6)
    for (const measure of ['net', 'grossInternal', 'grossExternal'] as const) expect(MEASURES[measure].notTakenOff + MEASURES[measure].measures).toMatch(/void/i)
  })
})
