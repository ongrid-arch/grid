import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { warehouse } from '@ongrid/floorplan/test-support/columns'
import { planToSvg } from '../planSvg'
import { LIGHT_LOOK, TECHNICAL_COLORS } from '../look'

/**
 * CNT-16 (lab EL-6): columns and a structural grid in the 2D picture, in the working look and
 * the technical one, through the one drawing function (`planScene`): each column cut through as a
 * wall is, the grid's chain lines with each line's name in a circle past both ends, and its
 * spacing dimensioned line to line and in all.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

const names = (svg: string): string[] => [...svg.matchAll(/<text [^>]*data-part="grid-name"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)

describe('columns and a structural grid in the 2D picture', () => {
  for (const look of ['working', 'technical'] as const) {
    it(`draws the grid with its lines, names and dimensions, and the columns cut, in the ${look} look`, () => {
      const svg = planToSvg(warehouse(), { look })
      expect(parts(svg, 'grid')).toHaveLength(1)
      expect(parts(svg, 'grid-line')).toHaveLength(8)
      expect(parts(svg, 'grid-bubble')).toHaveLength(16)
      expect(names(svg).sort()).toEqual(['1', '1', '2', '2', '3', '3', '4', '4', '5', '5', 'A', 'A', 'B', 'B', 'C', 'C'])
      const dims = parts(svg, 'dimension').filter((d) => d.includes('data-kind="grid"'))
      expect(dims.map((d) => /data-id="([^"]+)"/.exec(d)?.[1])).toEqual([
        'grid:main:x:1-2', 'grid:main:x:2-3', 'grid:main:x:3-4', 'grid:main:x:4-5', 'grid:main:x:overall',
        'grid:main:y:A-B', 'grid:main:y:B-C', 'grid:main:y:overall',
      ])
      expect(svg).toContain('>7.500<')
      const columns = parts(svg, 'column')
      expect(columns).toHaveLength(8)
      const tone = look === 'working' ? LIGHT_LOOK.wallExterior : TECHNICAL_COLORS.wallExterior
      for (const column of columns) expect(column).toContain(`fill="${tone}"`)
      // The columns over the walls, the grid under them.
      expect(svg.indexOf('data-part="column"')).toBeGreaterThan(svg.lastIndexOf('data-part="wall"'))
      expect(svg.indexOf('data-part="grid"')).toBeLessThan(svg.indexOf('data-part="wall"'))
    })
  }

  it('draws a round column as its circle, and a plan with neither as before', () => {
    const plan = parseFloorPlan({ ...warehouse(), grids: undefined, columns: [{ id: 'r1c', shape: 'round', width: 0.5, at: [10, 10] }] })
    const svg = planToSvg(plan)
    expect(parts(svg, 'column')).toEqual([expect.stringMatching(/^<circle [^>]*r="0.25"/)])
    const plain = parseFloorPlan({ ...warehouse(), grids: undefined, columns: undefined })
    expect(planToSvg(plain)).not.toMatch(/data-part="(column|grid)"/)
  })
})
