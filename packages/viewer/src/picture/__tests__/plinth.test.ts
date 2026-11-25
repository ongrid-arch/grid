/**
 * VEW-16: a house whose floor stands clear of the ground the site states is drawn standing on it,
 * in its facade and its section: the plinth the core works out is painted, and no strip is left
 * open between the ground line and the slab.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { SectionLine } from '@ongrid/floorplan/geometry'
import { facadeToSvg } from '../facade'
import { pictureToSvg } from '../planSvg'
import { sectionPicture } from '../section'

const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.3, height: 2.7, floor: 'ground' })

/** One floor, 10 m by 8 m, on Grid's own 0.25 m slab, with the ground 0.45 m below its floor. */
const house = (ground: number): FloorPlan =>
  parseFloorPlan({
    version: '1',
    floors: [{ id: 'ground', name: 'Ground floor', level: 0 }],
    site: { ground },
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
    rooms: [{ id: 'r', name: 'Living', boundary: ['s', 'e', 'n', 'w'], floor: 'ground' }]
  })

const ACROSS: SectionLine = { from: { x: 5, y: -2 }, to: { x: 5, y: 10 }, toward: 'left' }
const tagsOf = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]

describe('a house on a plinth (VEW-16)', () => {
  it('paints the plinth in its facade, down to the ground line', () => {
    const svg = facadeToSvg(house(-0.45), { side: 'south' })
    const plinth = tagsOf(svg, 'facade-face').filter((tag) => attr(tag, 'data-kind') === 'plinth')
    expect(plinth).toHaveLength(1)
    // The ground line and the facade's outline at the same height: 0.45 m below the floor.
    expect(attr(tagsOf(svg, 'facade-ground')[0]!, 'y1')).toBe('0.45')
    expect(attr(tagsOf(svg, 'facade-outline')[0]!, 'd')).toContain(',0.45')
  })

  it('cuts the plinth in its section, standing on a ground line that runs under the house', () => {
    const svg = pictureToSvg(sectionPicture(house(-0.45), ACROSS))
    const ground = tagsOf(svg, 'section-ground')
    expect(ground).toHaveLength(1)
    expect(attr(ground[0]!, 'd')).toBe('M0.0000,0.4500L12.0000,0.4500')
    expect(attr(tagsOf(svg, 'section-cut')[0]!, 'd')).toContain(',0.4500')
    expect(tagsOf(svg, 'section-beyond').some((tag) => attr(tag, 'data-kind') === 'plinth')).toBe(true)
  })

  it('draws a house at the ground as before: no plinth, the ground line stopping at it', () => {
    expect(tagsOf(facadeToSvg(house(-0.25), { side: 'south' }), 'facade-face').some((tag) => attr(tag, 'data-kind') === 'plinth')).toBe(false)
    const svg = pictureToSvg(sectionPicture(house(-0.25), ACROSS))
    expect(attr(tagsOf(svg, 'section-ground')[0]!, 'd')).toBe('M0.0000,0.2500L1.8500,0.2500M10.1500,0.2500L12.0000,0.2500')
  })
})
