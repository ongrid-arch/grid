/**
 * VEW-85: what a site plan draws. A house of two storeys, a garden studio behind it and a garage
 * beside it, each named as its own building, on a 40 × 30 m plot with a street to the south and
 * set-backs the person asked for: every building gets its footprint, name, storeys and height,
 * the frame holds the plot and all of them, and each set-back line lies inside the plot at the
 * person's figure.
 */
import { describe, expect, it } from 'vitest'
import { sitePlanFixture } from '../../test-support/sitePlan'
import { sitePlan } from '../sitePlan'

const named = () => sitePlanFixture(true)

describe('VEW-85 the site plan', () => {
  it('draws every building the plan names, each with its footprint, name, storeys and height', () => {
    const drawn = sitePlan(named())
    expect(drawn.buildings.map((b) => [b.id, b.name, b.storeys.above, b.pieces.length])).toEqual([
      ['house', 'House', 2, 1],
      ['studio', 'Studio', 1, 1],
      ['garage', 'Garage', 1, 1],
    ])
    const house = drawn.buildings[0]!
    const studio = drawn.buildings[1]!
    expect(house.height!).toBeGreaterThan(studio.height!)
    // The studio's words are written inside its own footprint, behind the house.
    expect(studio.labelAt!.y).toBeGreaterThan(20)
    expect(studio.labelAt!.y).toBeLessThan(24.5)
    expect(studio.why).toBeNull()
  })

  it('frames the plot and every building, never one building as the plot', () => {
    const drawn = sitePlan(named())
    expect(drawn.bounds!.min.x).toBeLessThanOrEqual(0)
    expect(drawn.bounds!.min.y).toBeLessThanOrEqual(0)
    expect(drawn.bounds!.max.x).toBeGreaterThanOrEqual(40)
    expect(drawn.bounds!.max.y).toBeGreaterThanOrEqual(30)
    expect(drawn.plotArea).toBeCloseTo(1200, 6)
    expect(drawn.north!.turn).toBeCloseTo((10 * Math.PI) / 180, 9)
  })

  it('draws each set-back line inside the plot at the person\'s figure, and the street with its way out', () => {
    const drawn = sitePlan(named())
    const byEdge = new Map(drawn.setbacks.map((s) => [s.edge, s]))
    // Edge 1 runs along the south, on the street: 4 m in, from the west boundary to edge 2's line.
    const south = byEdge.get(1)!
    expect(south.distance).toBe(4)
    expect(south.from.y).toBeCloseTo(4, 9)
    expect(south.to.y).toBeCloseTo(4, 9)
    expect(south.from.x).toBeCloseTo(0, 9)
    expect(south.to.x).toBeCloseTo(38, 9)
    // Edge 2 is the east one, 2 m in, from the street's line to the north boundary.
    const east = byEdge.get(2)!
    expect(east.from.x).toBeCloseTo(38, 9)
    expect([east.from.y, east.to.y].sort((a, b) => a - b)).toEqual([4, 30])
    expect(drawn.setbacks).toHaveLength(2)
    expect(drawn.streets.map((s) => [s.edge, s.outward.y])).toEqual([[1, -1]])
    expect(drawn.site!.things.map((t) => t.label)).toEqual(['Old oak', 'Assembly point'])
  })

  it('draws a plan that names no buildings as one footprint, unnamed, with its storeys', () => {
    const drawn = sitePlan(sitePlanFixture(false))
    expect(drawn.buildings).toHaveLength(1)
    const only = drawn.buildings[0]!
    expect(only.id).toBe('')
    expect(only.name).toBeNull()
    expect(only.storeys.above).toBe(2)
    expect(only.pieces.length).toBe(3)
  })
})
