import { describe, expect, it } from 'vitest'
import { stairHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { planToSvg } from '../planSvg'
import { crossesBox, crossesPolygon } from '../sizeLines'

/**
 * VEW-51: a room's width and depth lines are drawn clear of stairs, lifts, door swings and room
 * labels, and left out where they cannot be.
 */
const roomLines = (svg: string): string[] => [...svg.matchAll(/<g [^>]*data-kind="room"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]!)

describe('room size lines clear of what they would cross', () => {
  it('leaves out the line that runs over a stair and keeps the others', () => {
    const withStair = roomLines(planToSvg(stairHouse(), { floor: 'ground' }))
    const without = roomLines(planToSvg(twoFloorHouse(), { floor: 'ground' }))
    expect(without).toContain('hall-width')
    expect(withStair).not.toContain('hall-width')
    expect(withStair).toContain('hall-depth')
    expect(withStair).toContain('kitchen-width')
  })

  it('tells a line across a polygon or a box from one beside it', () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    expect(crossesPolygon([{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }], square)).toBe(true)
    expect(crossesPolygon([{ x: -1, y: 2 }, { x: 2, y: 2 }], square)).toBe(false)
    expect(crossesPolygon([{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }], square)).toBe(true)
    expect(crossesBox([{ x: 2, y: 0.5 }, { x: 3, y: 0.5 }], { minX: 0, maxX: 1, minY: 0, maxY: 1 })).toBe(false)
  })
})
