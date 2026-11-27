import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'

/**
 * WRT-83: a radial grid in the 2D picture: its rays named past their outer ends, its rings drawn
 * as circles through their points and named once, and the columns set out on it.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const names = (svg: string): string[] => [...svg.matchAll(/<text [^>]*data-part="grid-name"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)

describe('a radial grid in the 2D picture', () => {
  it('draws its rays and rings with their names, and the columns on it', () => {
    const result = compileRoomsText(['walls outside 0.3 inside 0.1 height 4', 'room hall "Hall" storage 30 x 30 at 0,0', 'door d1 in hall south, centred, 1.2 wide, opens in', 'grid P polar at 15,15 rings 5.9 9 rays 0 to 315 every 45', 'columns p round 0.4 on grid P'].join('\n'))
    expect(result.problems).toEqual([])
    const svg = planToSvg(parseFloorPlan(result.plan), { look: 'technical' })
    const lines = parts(svg, 'grid-line')
    expect(lines).toHaveLength(10)
    // A ring is drawn through many points, a ray through two.
    expect(lines.filter((line) => (line.match(/L/g) ?? []).length > 10)).toHaveLength(2)
    expect(parts(svg, 'grid-bubble')).toHaveLength(10)
    expect(names(svg).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', 'A', 'B'])
    expect(parts(svg, 'column')).toHaveLength(16)
  })
})
