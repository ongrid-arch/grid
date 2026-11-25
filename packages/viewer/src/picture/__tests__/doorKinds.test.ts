import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'

/**
 * CNT-14: each kind of door and window drawn with its usual symbol by the one drawing function
 * (`planScene`), from the core's `openingSymbol`: the view draws it and works out nothing.
 * A door or window that states no kind is drawn exactly as before.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

/** A 12 × 8 m shed with one opening in its north wall, 5 m high. */
function shed(opening: Partial<Opening>): FloorPlan {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.3, height: 5, kind: 'exterior' as const })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s', [0, 0], [12, 0]), wall('e', [12, 0], [12, 8]), wall('n', [12, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
    rooms: [{ id: 'bay', name: 'Loading bay', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [{ id: 'dock', wall: 'n', type: 'door', offset: 4, width: 3.5, sill: 0, height: 4.5, ...opening } as Opening]
  }
}

describe('kinds of door and window in the 2D picture', () => {
  it('draws a 3.5 m dock door as a roller door, not as a 3.5 m arc (done when 1)', () => {
    // VEW-22: with no kind it is drawn as Grid's guess, a sliding door, never one 3.5 m leaf.
    const asLeaf = planToSvg(shed({ hinge: 'start', swing: 'right' }))
    expect(parts(asLeaf, 'door-arc')).toEqual([])
    expect(parts(asLeaf, 'door-symbol')[0]).toContain('data-kind="sliding"')
    expect(parts(asLeaf, 'opening')[0]).toContain('data-kind-guess="true"')
    // Still checked as one leaf 3.5 m wide, it is asked about: a door warning on the drawing.
    expect(parts(asLeaf, 'door-warning')).toHaveLength(1)
    const roller = planToSvg(shed({ kind: 'roller', swing: 'right' }))
    expect(parts(roller, 'door-arc')).toEqual([])
    const symbol = parts(roller, 'door-symbol')
    expect(symbol).toHaveLength(1)
    expect(symbol[0]).toContain('data-kind="roller"')
    const leaves = parts(roller, 'door-leaf')
    expect(leaves).toHaveLength(2)
    expect(leaves.filter((l) => l.includes('data-above="true"') && l.includes('stroke-dasharray'))).toHaveLength(1)
    expect(parts(roller, 'door-warning')).toEqual([])
  })

  it('draws a wide door that states no kind as a pair or a sliding door, Grid\'s guess, and a narrow one as one leaf (VEW-22)', () => {
    const pair = planToSvg(shed({ width: 1.8, hinge: 'start', swing: 'right' }))
    expect(parts(pair, 'door-arc')).toHaveLength(2)
    expect(parts(pair, 'door-symbol')[0]).toContain('data-kind="double"')
    // A 4 m door, or one whose face is not stated, slides: nothing to guess about its swing, no "?".
    for (const door of [shed({ width: 4, hinge: 'start', swing: 'right' }), shed({ width: 1.8 })]) {
      const svg = planToSvg(door, { look: 'technical' })
      expect(parts(svg, 'door-symbol')[0]).toContain('data-kind="sliding"')
      expect(parts(svg, 'door-undecided')).toEqual([])
    }
    const leaf = planToSvg(shed({ width: 0.9, hinge: 'start', swing: 'right' }))
    expect(parts(leaf, 'door-arc')).toHaveLength(1)
    expect(leaf).not.toContain('data-kind-guess')
  })

  it('draws a garage door with what lies overhead dashed, a sliding door with no swing, and never a "?" for either', () => {
    for (const kind of ['garage', 'sliding', 'pocket'] as const) {
      const svg = planToSvg(shed({ kind }), { look: 'technical' })
      expect(parts(svg, 'door-arc'), kind).toEqual([])
      expect(parts(svg, 'door-undecided'), kind).toEqual([])
      expect(parts(svg, 'door-symbol')[0], kind).toContain(`data-kind="${kind}"`)
    }
    // A pair that states no face is still undecided.
    expect(parts(planToSvg(shed({ kind: 'double' }), { look: 'technical' }), 'door-undecided')).toHaveLength(1)
    expect(parts(planToSvg(shed({ kind: 'double', swing: 'right' })), 'door-arc')).toHaveLength(2)
  })

  it('draws a high-level window dashed, above the cut, and one with no kind as before', () => {
    const window = (kind?: Opening['kind']) => planToSvg(shed({ type: 'window', width: 2, sill: 3.5, height: 1, ...(kind ? { kind } : {}) }), { look: 'technical' })
    const plain = parts(window(), 'window-symbol')
    expect(plain).toHaveLength(1)
    expect(plain[0]).not.toContain('data-kind')
    const high = window('high-level')
    expect(parts(high, 'window-symbol')[0]).toContain('data-kind="high-level"')
    const lines = [...parts(high, 'window-face'), ...parts(high, 'window-glass')]
    expect(lines).toHaveLength(3)
    expect(lines.every((l) => l.includes('data-above="true"') && l.includes('stroke-dasharray'))).toBe(true)
    expect(parts(window('sliding'), 'window-glass')).toHaveLength(2)
  })
})

describe('a sliding door and the frames of a detailed drawing (VEW-39)', () => {
  it('draws a sliding door as panels with glass and an arrow', () => {
    const svg = planToSvg(shed({ kind: 'sliding', swing: 'right', width: 2 }), { look: 'technical' })
    expect(parts(svg, 'door-leaf').length).toBeGreaterThanOrEqual(8)
    expect(parts(svg, 'door-arrow')).toHaveLength(6)
    const symbol = svg.match(/<g data-part="door-symbol"[^>]*data-kind="sliding".*?<\/g>/)![0]
    expect(symbol.match(/data-part="window-glass"/g)).toHaveLength(2)
  })

  it('draws each frame square, its pen included, inside the wall\'s faces', () => {
    const svg = planToSvg(shed({ kind: 'single', hinge: 'start', swing: 'right', width: 0.9 }), { look: 'technical', paperScale: 50 })
    const frames = parts(svg, 'frame')
    expect(frames).toHaveLength(2)
    for (const tag of frames) {
      const pen = Number(tag.match(/stroke-width="([\d.]+)"/)![1])
      const ys = [...tag.match(/d="([^"]+)"/)![1]!.matchAll(/,(-?[\d.]+)/g)].map((m) => Math.abs(Number(m[1])))
      // The wall's north face is at y = 8.15 (drawn flipped): its pen's half-width past it is out of the wall.
      for (const y of ys) expect(y + pen / 2).toBeLessThanOrEqual(8.15 + 1e-3)
      for (const y of ys) expect(y - pen / 2).toBeGreaterThanOrEqual(7.85 - 1e-3)
    }
  })
})
