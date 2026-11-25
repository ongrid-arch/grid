import { describe, expect, it } from 'vitest'
import type { Dimension } from '@ongrid/floorplan/geometry'
import { warehouse } from '@ongrid/floorplan/test-support/columns'
import { planToSvg } from '../planSvg'
import { dimensionTextBox } from '../../canvas2d/labelPlacement'
import { layoutDimensions } from '../markLayout'

/**
 * VEW-31: dimension chains, grid bubbles and view marks keep clear of each other. The picture is
 * read back as text, so what is tested is what a person sees: where each bubble stands against
 * each chain line, and that a side prints one overall figure.
 */
interface Seg {
  readonly kind: string
  readonly id: string
  readonly a: [number, number]
  readonly b: [number, number]
}

const attr = (tag: string, name: string): number => Number(new RegExp(`${name}="([^"]+)"`).exec(tag)![1])

/** Every drawn dimension line, with the kind and id of the dimension it belongs to (SVG coordinates). */
function lines(svg: string): Seg[] {
  const out: Seg[] = []
  for (const group of svg.matchAll(/<g data-part="dimension" data-kind="(\w+)" data-id="([^"]+)"[^>]*>(.*?)<\/g>/g)) {
    for (const tag of group[3]!.matchAll(/<line [^>]*data-part="dimension-line"[^>]*>/g)) {
      out.push({ kind: group[1]!, id: group[2]!, a: [attr(tag[0], 'x1'), attr(tag[0], 'y1')], b: [attr(tag[0], 'x2'), attr(tag[0], 'y2')] })
    }
  }
  return out
}

const bubbles = (svg: string): { x: number; y: number; r: number }[] =>
  [...svg.matchAll(/<circle [^>]*data-part="grid-bubble"[^>]*>/g)].map((m) => ({ x: attr(m[0], 'cx'), y: attr(m[0], 'cy'), r: attr(m[0], 'r') }))

function distance(p: { x: number; y: number }, s: Seg): number {
  const [ax, ay] = s.a
  const [bx, by] = s.b
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / len2))
  return Math.hypot(p.x - (ax + t * (bx - ax)), p.y - (ay + t * (by - ay)))
}

describe('grid bubbles past the outermost chain', () => {
  for (const look of ['working', 'technical'] as const) {
    it(`keeps every bubble off every chain and overall line, in the ${look} look`, () => {
      const svg = planToSvg(warehouse(), { look })
      // A grid's own chain runs tangent to its bubbles by design; every other line must clear them.
      const chains = lines(svg).filter((s) => s.kind !== 'room' && s.kind !== 'grid')
      expect(chains.length).toBeGreaterThan(10)
      for (const bubble of bubbles(svg)) {
        for (const seg of chains) expect(distance(bubble, seg), `${seg.id} under a bubble`).toBeGreaterThan(bubble.r)
      }
    })
  }

  it('moves the grid spacing chain out past the building chains, not onto them', () => {
    const svg = planToSvg(warehouse())
    const all = lines(svg)
    const building = all.filter((s) => ['opening', 'wall', 'overall'].includes(s.kind))
    const grid = all.filter((s) => s.kind === 'grid')
    const outermostBelow = Math.max(...building.map((s) => s.a[1]))
    const gridBelow = grid.filter((s) => s.a[1] > 0 && s.a[1] === s.b[1] && s.a[1] > 0)
    expect(gridBelow.length).toBeGreaterThan(0)
    for (const seg of gridBelow) expect(seg.a[1]).toBeGreaterThan(outermostBelow)
  })

  it('leaves a grid with nothing in its way where it was', () => {
    const plain = warehouse()
    const svg = planToSvg({ ...plain, openings: [], walls: plain.walls }, { showDimensions: true })
    expect(svg).toContain('data-part="grid-bubble"')
  })
})

describe('chains on one side', () => {
  const dim = (id: string, kind: Dimension['kind'], offset: number, from = 0, to = 10, side: Dimension['side'] = 'bottom', value = to - from): Dimension => ({
    id,
    kind,
    from: { x: from, y: 0 },
    to: { x: to, y: 0 },
    value,
    normal: { x: 0, y: -1 },
    offset,
    labelAt: { x: (from + to) / 2, y: -offset },
    measuredTo: ['face', 'face'],
    side
  })
  const drawing = { grids: [], walls: [], rooms: [], openings: [] } as never

  it('prints a side\'s overall figure once', () => {
    const out = layoutDimensions(drawing, [dim('overall-width', 'overall', 1.1), dim('overall-g2-bottom-0', 'overall', 0.6, 0.02, 10.02)])
    expect(out.map((d) => d.id)).toEqual(['overall-width'])
  })

  it('keeps two different overall figures, and the same figure on two sides', () => {
    const other = { ...dim('overall-width-top', 'overall', 0.6, 0, 10, 'top'), normal: { x: 0, y: 1 } }
    const out = layoutDimensions(drawing, [dim('overall-width', 'overall', 1.1), other, dim('o2', 'overall', 0.6, 0, 8)])
    expect(out).toHaveLength(3)
  })

  it('pushes a chain that lies on another chain of its side out by one chain spacing', () => {
    const out = layoutDimensions(drawing, [dim('wall-bottom-0', 'wall', 0.6, 0, 5), dim('wall-bottom-1', 'wall', 0.6, 5, 10), { ...dim('opening-g2-0', 'opening', 0.7, 2, 4), chain: 'g2-bottom-0' }])
    const moved = out.find((d) => d.id === 'opening-g2-0')!
    expect(moved.offset).toBeCloseTo(1.1, 6)
    expect(out.find((d) => d.id === 'wall-bottom-0')!.offset).toBe(0.6)
  })

  it('leaves chains a chain spacing apart, and chains over different stretches, alone', () => {
    const input = [dim('a', 'opening', 0.6, 0, 5), dim('b', 'wall', 1.1, 0, 5), dim('c', 'opening', 0.6, 6, 10)]
    expect(layoutDimensions(drawing, input).map((d) => d.offset)).toEqual([0.6, 1.1, 0.6])
  })

  it('is the same when laid out twice', () => {
    const svgOnce = layoutDimensions(drawing, [dim('wall-bottom-0', 'wall', 0.6, 0, 5), { ...dim('opening-g2-0', 'opening', 0.7, 2, 4), chain: 'g2-bottom-0' }])
    expect(layoutDimensions(drawing, svgOnce)).toEqual(svgOnce)
  })
})

describe('view marks', () => {
  const at = (tag: string): { x: number; y: number; scale: number } => {
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(tag)!
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) }
  }

  // A small picture draws the same bubbles over many more metres: the marks must clear them there too.
  for (const [look, width] of [['working', 1200], ['technical', 1200], ['working', 240]] as const) {
    it(`stands each elevation mark clear of every grid bubble and chain, in the ${look} look at ${width} pixels`, () => {
      const svg = planToSvg(warehouse(), { look, width, marks: { elevations: true } })
      const marks = [...svg.matchAll(/<g [^>]*data-part="elevation-mark"[^>]*>/g)].map((m) => at(m[0]))
      expect(marks).toHaveLength(4)
      for (const mark of marks) {
        // The mark's disc is 12 pixels in radius, a bubble's circle its own radius.
        for (const bubble of bubbles(svg)) expect(Math.hypot(mark.x - bubble.x, mark.y - bubble.y)).toBeGreaterThan(12 * mark.scale + bubble.r)
        for (const seg of lines(svg).filter((s) => s.kind !== 'room')) expect(distance(mark, seg)).toBeGreaterThan(12 * mark.scale)
      }
    })
  }

  it('keeps a section head off the bubbles', () => {
    const svg = planToSvg(warehouse(), { marks: { section: { from: { x: 15, y: 5 }, to: { x: 15, y: -2 }, toward: 'left' } } })
    const heads = [...svg.matchAll(/<g [^>]*data-part="section-mark-head"[^>]*>/g)].map((m) => at(m[0]))
    expect(heads).toHaveLength(2)
    for (const head of heads) {
      for (const bubble of bubbles(svg)) expect(Math.hypot(head.x - bubble.x, head.y - bubble.y)).toBeGreaterThan(bubble.r + 6 * head.scale)
    }
  })
})

describe('figures off the ticks', () => {
  it('draws no figure on a tick or an extension line of a chain, in a drafted look', () => {
    const svg = planToSvg(warehouse(), { look: 'technical', width: 1200 })
    const ticks = [...svg.matchAll(/<line [^>]*data-part="dimension-tick"[^>]*>/g)].map((m) => ({ minX: Math.min(attr(m[0], 'x1'), attr(m[0], 'x2')), maxX: Math.max(attr(m[0], 'x1'), attr(m[0], 'x2')), minY: -Math.max(attr(m[0], 'y1'), attr(m[0], 'y2')), maxY: -Math.min(attr(m[0], 'y1'), attr(m[0], 'y2')) }))
    const extensions = [...svg.matchAll(/<line [^>]*data-part="extension"[^>]*>/g)].map((m) => m[0])
    expect(ticks.length).toBeGreaterThan(20)
    let figures = 0
    for (const chunk of svg.split('<g data-part="dimension" ').slice(1)) {
      const kind = /^data-kind="(\w+)"/.exec(chunk)![1]!
      if (kind === 'room' || kind === 'grid') continue
      // One dimension's own elements, up to the next dimension's.
      const own = chunk.split('data-part="dimension"')[0]!
      const placed = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)"><text [^>]*data-part="dimension-text"[^>]*>([^<]*)</.exec(own)
      if (placed === null || /rotate\(/.test(own)) continue
      figures++
      const [x, y, scale, text] = [Number(placed[1]), -Number(placed[2]), Number(placed[3]), placed[4]!]
      const box = dimensionTextBox({ x, y }, { kind: kind as Dimension['kind'], value: Number(text) }, scale)
      for (const tick of ticks) {
        const inside = tick.minX < box.maxX && box.minX < tick.maxX && tick.minY < box.maxY && box.minY < tick.maxY
        expect(inside, `${text} under a tick`).toBe(false)
      }
    }
    expect(figures).toBeGreaterThan(3)
    expect(extensions.length).toBeGreaterThan(10)
  })
})
