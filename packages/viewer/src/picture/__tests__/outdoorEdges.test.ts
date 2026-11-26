import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'

const written = compileRoomsText([
  'walls outside 0.3 inside 0.1 height 2.7',
  'room living "Living room" living 5 x 4 at 0,0',
  'room terrace "Terrace" - 5 x 3 north of living outdoor terrace',
  'wall terrace east railing height 1.1',
  'wall terrace west 0.15 height 0.45',
].join('\n'))

function paths(svg: string, part: string): string[] {
  return [...svg.matchAll(/<path [^>]+>/g)].map(([tag]) => tag).filter((tag) => tag.includes(`data-part="${part}"`))
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
}

describe('outdoor edges in plans (WRT-76)', () => {
  it.each(['working', 'technical'] as const)('draws distinct outdoor space and edge styles in the %s look', (look) => {
    expect(written.problems).toEqual([])
    const svg = planToSvg(parseFloorPlan(written.plan), { look })
    const [inside, outside] = paths(svg, 'room')
    expect(attr(outside!, 'data-outdoor')).toBe('true')
    expect(attr(outside!, 'fill')).not.toBe(attr(inside!, 'fill'))
    for (const part of ['open-edge', 'railing', 'low-wall']) {
      const drawn = paths(svg, part)
      expect(drawn).toHaveLength(1)
      expect(attr(drawn[0]!, 'fill')).toBe('none')
      expect(attr(drawn[0]!, 'stroke')).toBeDefined()
      expect(attr(drawn[0]!, 'stroke-dasharray')).toBeUndefined()
    }
    expect(attr(paths(svg, 'low-wall')[0]!, 'd')).toMatch(/Z$/i)
    expect(attr(paths(svg, 'railing')[0]!, 'd')).not.toMatch(/Z$/i)
  })
})
