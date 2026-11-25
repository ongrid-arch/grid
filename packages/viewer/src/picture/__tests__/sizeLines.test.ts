import { describe, expect, it } from 'vitest'
import { stairHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { crossesBox, crossesPolygon } from '../sizeLines'

const sizeLines = (svg: string): string[] =>
  [...svg.matchAll(/<g [^>]*data-kind="room"[^>]*>/g)].map((m) => m[0])

describe('room size lines (VEW-51)', () => {
  it('probe', () => {
    console.log(sizeLines(planToSvg(stairHouse(), { floor: 'ground' })).length, sizeLines(planToSvg(twoFloorHouse(), { floor: 'ground' })).length)
  })
  it('crossing tests', () => {
    const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    expect(crossesPolygon([{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }], sq)).toBe(true)
    expect(crossesPolygon([{ x: -1, y: 2 }, { x: 2, y: 2 }], sq)).toBe(false)
    expect(crossesBox([{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }], { minX: 0, maxX: 1, minY: 0, maxY: 1 })).toBe(true)
  })
})
