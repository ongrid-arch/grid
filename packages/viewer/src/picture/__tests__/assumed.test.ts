import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'
import { DARK_LOOK, LIGHT_LOOK, LOOK_NAMES, TECHNICAL_COLORS } from '../look'

/**
 * WRT-6 (lab WR-15): what the plan marks assumed is drawn in its own style, in every look: a
 * dashed line in the look's warning colour round the wall or room, or across the opening.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

const marked = parseFloorPlan({
  ...flat(),
  marks: [
    { part: 'wall', id: 'e1', value: 'thickness', source: 'assumed' },
    { part: 'room', id: 'bathroom', source: 'assumed' },
    { part: 'opening', id: 'd_bb', value: 'width', source: 'assumed' },
    { part: 'wall', id: 's2', source: 'scanned', tolerance: 0.02 },
  ],
})

const WARNING = { working: LIGHT_LOOK.warning, technical: TECHNICAL_COLORS.warning, dark: DARK_LOOK.warning, simple: LIGHT_LOOK.warning, large: LIGHT_LOOK.warning } as const

describe('assumed parts in the 2D picture', () => {
  for (const look of LOOK_NAMES) {
    it(`are dashed in the ${look} look, over the walls`, () => {
      const svg = planToSvg(marked, { look })
      expect(parts(svg, 'assumed-wall').map((p) => /data-id="([^"]+)"/.exec(p)?.[1])).toEqual(['e1'])
      expect(parts(svg, 'assumed-room').map((p) => /data-id="([^"]+)"/.exec(p)?.[1])).toEqual(['bathroom'])
      expect(parts(svg, 'assumed-opening').map((p) => /data-id="([^"]+)"/.exec(p)?.[1])).toEqual(['d_bb'])
      for (const part of [...parts(svg, 'assumed-wall'), ...parts(svg, 'assumed-room')]) {
        expect(part).toContain(`stroke="${WARNING[look]}"`)
        expect(part).toContain('stroke-dasharray=')
      }
      expect(svg.indexOf('data-part="assumed"')).toBeGreaterThan(svg.lastIndexOf('data-part="wall"'))
    })
  }

  it('are not drawn in a plan that marks nothing assumed', () => {
    expect(planToSvg(parseFloorPlan(flat()))).not.toContain('data-part="assumed')
  })
})
