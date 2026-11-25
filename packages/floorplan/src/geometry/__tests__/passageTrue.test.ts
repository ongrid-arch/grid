/**
 * ARE-25: the way through a room measured true to the walls. The grid finds where the way is
 * narrowest; the width there is the plan's own, so a way between walls w apart measures w.
 */
import { describe, expect, it } from 'vitest'
import { passageWidth, type Obstacle, type Segment } from '../use'
import type { Vec2 } from '../vec2'

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

describe('a way between walls w apart measures w (ARE-25)', () => {
  for (const w of [0.7, 0.9, 1.2, 1.5, 1.8, 2.37]) {
    it(`measures a ${w} m wide room ${w} m, along it and across it, on the grid of any step`, () => {
      const polygon = rect(0, 0, 9, w)
      const west: Segment = [{ x: 0, y: 0 }, { x: 0, y: w }]
      const east: Segment = [{ x: 9, y: 0 }, { x: 9, y: w }]
      for (const step of [undefined, 0.05, w / 24]) {
        const way = passageWidth(polygon, [], [], west, east, step === undefined ? {} : { step })!
        expect(way.width).toBeCloseTo(w, 6)
        expect(way.beside).toEqual({ fixtures: [], wall: true })
      }
    })
  }

  it('measures the gap beside a fixture to the fixture, and names only what the body touches there', () => {
    const polygon = rect(0, 0, 9, 1.8)
    const west: Segment = [{ x: 0, y: 0 }, { x: 0, y: 1.8 }]
    const east: Segment = [{ x: 9, y: 0 }, { x: 9, y: 1.8 }]
    // A cabinet 0.6 deep against the south wall leaves 1.2 m; a bench 0.75 deep across, 2 m on, leaves 1.05 m.
    const cabinet: Obstacle = { id: 'cabinet', outline: rect(3, 0, 4, 0.6) }
    const bench: Obstacle = { id: 'bench', outline: rect(6, 1.05, 7, 1.8) }
    const way = passageWidth(polygon, [], [cabinet, bench], west, east, { step: 0.075 })!
    expect(way.width).toBeCloseTo(1.05, 6)
    expect(way.beside).toEqual({ fixtures: ['bench'], wall: true })
    const one = passageWidth(polygon, [], [cabinet], west, east, { step: 0.075 })!
    expect(one.width).toBeCloseTo(1.2, 6)
    expect(one.beside).toEqual({ fixtures: ['cabinet'], wall: true })
  })

  it('never measures on a grid finer than useRaster', () => {
    const polygon = rect(0, 0, 4, 1)
    const way = passageWidth(polygon, [], [], [{ x: 0, y: 0 }, { x: 0, y: 1 }], [{ x: 4, y: 0 }, { x: 4, y: 1 }], { step: 0.001 })!
    expect(way.step).toBeCloseTo(0.02, 9)
  })
})
