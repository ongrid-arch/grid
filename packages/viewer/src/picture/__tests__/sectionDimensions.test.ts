/**
 * VEW-89: a section's dimension chains drawn: up its left side past the level marks, along the cut
 * under the drawing, inside the picture, and left off when asked.
 */
import { describe, expect, it } from 'vitest'
import { twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import type { SectionLine } from '@ongrid/floorplan/geometry'
import { pictureToSvg } from '../planSvg'
import { sectionPicture } from '../section'
import type { SvgNode } from '../svgNode'

const LINE: SectionLine = { from: { x: 6.5, y: -2 }, to: { x: 6.5, y: 10 }, toward: 'left' }

function all(nodes: readonly SvgNode[], part: string): SvgNode[] {
  return nodes.flatMap((node) => [...(node.attrs['data-part'] === part ? [node] : []), ...all(node.children.filter((c): c is SvgNode => typeof c !== 'string'), part)])
}

describe.each(['working', 'technical'] as const)('the chains of a section in the %s look', (look) => {
  const picture = sectionPicture(twoFloorHouse(), LINE, { look })
  const chains = all(picture.nodes, 'section-chain')

  it('draws each chain the section has, a dimension per figure', () => {
    expect(chains.map((c) => c.attrs['data-chain'])).toEqual(picture.chains.map((c) => c.kind))
    expect(chains.map((c) => c.attrs['data-chain'])).toEqual(['detail', 'levels', 'overall', 'walls', 'length'])
    chains.forEach((c, i) => expect(all([c], 'dimension')).toHaveLength(picture.chains[i]!.dimensions.length))
  })

  it('stands the vertical chains past the floors\' level marks, nearest first, and the others under the drawing, all inside the picture', () => {
    const { view } = picture
    const lineOf = (c: SvgNode) => all([c], 'dimension-line')[0]!.attrs
    const xs = chains.slice(0, 3).map((c) => Number(lineOf(c)['x1']))
    const marks = all(picture.nodes, 'section-level').map((m) => Number(String(m.attrs['transform']).match(/translate\(([-\d.]+)/)![1]))
    expect(xs[0]!).toBeLessThan(Math.min(...marks))
    expect(xs[1]!).toBeLessThan(xs[0]!)
    expect(xs[2]!).toBeLessThan(xs[1]!)
    expect(xs[2]!).toBeGreaterThan(view.x)
    const ys = chains.slice(3).map((c) => -Number(lineOf(c)['y1']))
    expect(ys[0]!).toBeLessThan(picture.section.bounds.min.y)
    expect(ys[1]!).toBeLessThan(ys[0]!)
    expect(-ys[1]!).toBeLessThan(view.y + view.height)
  })

  it('writes the figures', () => {
    const svg = pictureToSvg(picture)
    for (const figure of ['5.90', '2.95', '1.20', '8.20']) expect(svg).toContain(`>${figure}</text>`)
  })
})

it('leaves the chains off when asked, and frames the section closer', () => {
  const on = sectionPicture(twoFloorHouse(), LINE, { look: 'technical' })
  const off = sectionPicture(twoFloorHouse(), LINE, { look: 'technical', dimensions: false })
  expect(off.chains).toEqual([])
  expect(all(off.nodes, 'section-chain')).toEqual([])
  expect(all(off.nodes, 'dimension')).toEqual([])
  expect(off.view.width).toBeLessThan(on.view.width)
})
