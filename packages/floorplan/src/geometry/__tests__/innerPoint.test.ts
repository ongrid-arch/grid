import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../vec2'
import { centroid } from '../vec2'
import {
  pointInPolygon,
  poleOfInaccessibility,
  rectInsidePolygon,
  rectTouchesPolygon,
  signedDistanceToOutline,
  spotsInside
} from '../innerPoint'

const ring = (...points: [number, number][]): Vec2[] => points.map(([x, y]) => ({ x, y }))

const square = ring([0, 0], [4, 0], [4, 3], [0, 3])
/** An L: a 6 × 2 leg along the bottom and a 2 × 6 leg up the left. */
const ell = ring([0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6])
/** A U open at the top: 7 wide, 5 deep, a 3 × 3 notch in the middle of the top. */
const you = ring([0, 0], [7, 0], [7, 5], [5, 5], [5, 2], [2, 2], [2, 5], [0, 5])

describe('pointInPolygon', () => {
  it('tells inside from outside, notches included', () => {
    expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true)
    expect(pointInPolygon({ x: 5, y: 1 }, square)).toBe(false)
    expect(pointInPolygon({ x: 3.5, y: 3.5 }, you)).toBe(false)
    expect(pointInPolygon({ x: 1, y: 4 }, you)).toBe(true)
  })
})

describe('poleOfInaccessibility', () => {
  it('is the middle of a rectangle', () => {
    const { point, distance } = poleOfInaccessibility(square)
    expect(point.x).toBeCloseTo(2, 2)
    expect(point.y).toBeCloseTo(1.5, 2)
    expect(distance).toBeCloseTo(1.5, 2)
  })

  it('lies inside an L and a U, where the average of the corners does not', () => {
    // The old label point: the corners' average falls in the notch.
    expect(pointInPolygon(centroid(you), you)).toBe(false)
    for (const outline of [ell, you]) {
      const { point, distance } = poleOfInaccessibility(outline)
      expect(pointInPolygon(point, outline)).toBe(true)
      expect(signedDistanceToOutline(point, outline)).toBeCloseTo(distance, 6)
      expect(distance).toBeGreaterThan(0.9)
    }
  })

  it('works whichever way the outline winds', () => {
    const a = poleOfInaccessibility(you).point
    const b = poleOfInaccessibility([...you].reverse()).point
    expect(pointInPolygon(b, you)).toBe(true)
    expect(Math.abs(signedDistanceToOutline(a, you) - signedDistanceToOutline(b, you))).toBeLessThan(0.01)
  })

  it('ends on outlines with no area, and on huge ones', () => {
    expect(poleOfInaccessibility([]).distance).toBe(0)
    expect(poleOfInaccessibility(ring([0, 0], [5, 0], [10, 0])).distance).toBe(0)
    const huge = ring([0, 0], [1e7, 0], [1e7, 0.5], [0, 0.5])
    const { point } = poleOfInaccessibility(huge)
    expect(pointInPolygon(point, huge)).toBe(true)
  })
})

describe('rectInsidePolygon and rectTouchesPolygon', () => {
  it('lets a box touch the outline but not cross it', () => {
    expect(rectInsidePolygon({ minX: 0, minY: 0, maxX: 4, maxY: 3 }, square)).toBe(true)
    expect(rectInsidePolygon({ minX: 1, minY: 1, maxX: 3, maxY: 3.1 }, square)).toBe(false)
    // A box across the U's notch is not inside, though all four of its corners are.
    expect(rectInsidePolygon({ minX: 1, minY: 3, maxX: 6, maxY: 4 }, you)).toBe(false)
  })

  it('sees a shape inside a box, a box inside a shape, and edges through it', () => {
    const wall = ring([1, 1], [1.2, 1], [1.2, 1.2], [1, 1.2])
    expect(rectTouchesPolygon({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, wall)).toBe(true)
    expect(rectTouchesPolygon({ minX: 1.05, minY: 1.05, maxX: 1.1, maxY: 1.1 }, wall)).toBe(true)
    expect(rectTouchesPolygon({ minX: 1.1, minY: 0, maxX: 1.15, maxY: 2 }, wall)).toBe(true)
    expect(rectTouchesPolygon({ minX: 1.2, minY: 0, maxX: 2, maxY: 2 }, wall)).toBe(false)
  })
})

describe('spotsInside', () => {
  it('starts at the pole and keeps every box inside', () => {
    const spots = spotsInside(you, 0.8, 0.4)
    expect(spots.length).toBeGreaterThan(10)
    expect(spots[0]).toEqual(poleOfInaccessibility(you).point)
    for (const p of spots) {
      expect(rectInsidePolygon({ minX: p.x - 0.8, minY: p.y - 0.4, maxX: p.x + 0.8, maxY: p.y + 0.4 }, you)).toBe(true)
    }
  })

  it('has none for a box bigger than the room', () => {
    expect(spotsInside(square, 2.1, 1)).toEqual([])
    expect(spotsInside(you, 1.2, 2.6)).toEqual([])
  })

  it('gives the same spots every time', () => {
    expect(spotsInside(ell, 0.5, 0.3)).toEqual(spotsInside(ell, 0.5, 0.3))
  })

  it('finds a spot in a long thin wedge at an angle, where the first grid misses it (VEW-22)', () => {
    const rad = (d: number): number => (d * Math.PI) / 180
    // A wedge 20 m long and 4 degrees wide, at 30 degrees: a label 1.6 × 0.4 m fits only near its wide end.
    const wedge = ring([0, 0], [20 * Math.cos(rad(30)), 20 * Math.sin(rad(30))], [20 * Math.cos(rad(34)), 20 * Math.sin(rad(34))])
    const spots = spotsInside(wedge, 0.8, 0.2)
    expect(spots.length).toBeGreaterThan(0)
    for (const p of spots) expect(rectInsidePolygon({ minX: p.x - 0.8, minY: p.y - 0.2, maxX: p.x + 0.8, maxY: p.y + 0.2 }, wedge)).toBe(true)
  })
})
