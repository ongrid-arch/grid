import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture, pictureToSvg } from '../planSvg'

/**
 * CNT-55: an item hung above the plan's cut (a wall unit, a hood) is drawn dashed with no fill,
 * after what stands under it, and a commercial kitchen's piece has its label inside it.
 */
const groups = (svg: string): string[] => [...svg.matchAll(/<g [^>]*data-part="fixture"[^>]*>[\s\S]*?<\/g>/g)].map((m) => m[0])

function kitchen(): FloorPlan {
  return {
    ...flat(),
    items: [
      { id: 'hood', kind: 'hood', label: 'Hood', at: [2, 1], size: [1.8, 1], height: 0.6, elevation: 2 },
      { id: 'range', kind: 'range', label: 'Range', at: [2, 1], size: [0.9, 0.9], height: 0.9 },
      { id: 'run', kind: 'kitchen-run', at: [5, 1], size: [2.4, 0.6], height: 0.9 },
    ],
  }
}

describe('items by height and label in the drawing', () => {
  it('draws a hung item dashed and unfilled, after the others', () => {
    for (const look of ['working', 'technical'] as const) {
      const svg = pictureToSvg(planPicture(kitchen(), { look }))
      const drawn = groups(svg)
      const ids = drawn.map((g) => /data-id="([^"]+)"/.exec(g)![1])
      expect(ids.indexOf('hood'), look).toBeGreaterThan(ids.indexOf('range'))
      const hood = drawn.find((g) => g.includes('data-id="hood"'))!
      expect(hood, look).toContain('data-raised="true"')
      expect(hood, look).toMatch(/data-part="fixture-ring"[^>]*fill="none"/)
      const range = drawn.find((g) => g.includes('data-id="range"'))!
      expect(range, look).not.toContain('data-raised')
      expect(range, look).not.toMatch(/data-part="fixture-ring"[^>]*fill="none"/)
    }
    const technical = groups(pictureToSvg(planPicture(kitchen(), { look: 'technical' }))).find((g) => g.includes('data-id="hood"'))!
    expect(technical).toMatch(/data-part="fixture-ring"[^>]*stroke-dasharray/)
  })

  it('writes a commercial piece\'s label inside it, and no other item\'s', () => {
    const svg = pictureToSvg(planPicture(kitchen(), {}))
    const labels = [...svg.matchAll(/data-part="fixture-label"[^>]*>([^<]*)</g)].map((m) => m[1])
    expect(labels.sort()).toEqual(['Hood', 'Range'])
  })
})
