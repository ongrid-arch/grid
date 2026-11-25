import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '../planSvg'

/**
 * CNT-26: a garden or boundary wall, standing apart from the building, is drawn in the
 * partition's lighter fill, never as an outside wall, and keyed on its own.
 *
 * A 6 by 4 room with walls stated `exterior`, and a 1.8 m wall stated `exterior` too, 3 m south of
 * it, which no room lists and no room lies beside.
 */
function plan(): FloorPlan {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [6, 0], thickness: 0.3, height: 2.7, kind: 'exterior' },
      { id: 'w2', start: [6, 0], end: [6, 4], thickness: 0.3, height: 2.7, kind: 'exterior' },
      { id: 'w3', start: [6, 4], end: [0, 4], thickness: 0.3, height: 2.7, kind: 'exterior' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.3, height: 2.7, kind: 'exterior' },
      { id: 'garden', start: [-2, -3], end: [8, -3], thickness: 0.2, height: 1.8, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Studio', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: []
  })
}

const tagsOf = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const keyWords = (svg: string): string[] => [...svg.matchAll(/<g data-part="key-entry"[^>]*>.*?<text[^>]*>([^<]*)<\/text><\/g>/g)].map((m) => m[1]!)
const wallTag = (svg: string, id: string): string => tagsOf(svg, 'wall').find((tag) => attr(tag, 'data-id') === id)!

describe('a garden wall standing apart (CNT-26)', () => {
  it('is drawn in the partition fill, in the open, and the room\'s walls as outside walls', () => {
    const svg = planToSvg(plan())
    const garden = wallTag(svg, 'garden')
    expect(attr(garden, 'data-wall-kind')).toBe('partition')
    expect(attr(garden, 'data-exposure')).toBe('detached')
    expect(attr(wallTag(svg, 'w1'), 'data-wall-kind')).toBe('outside')
    expect(attr(garden, 'fill')).not.toBe(attr(wallTag(svg, 'w1'), 'fill'))
  })

  it('is keyed as a garden or boundary wall, and gives the drawing no partition entry', () => {
    const svg = planToSvg(plan(), { show: { key: true } })
    const words = keyWords(svg)
    expect(words).toContain('Garden or boundary wall')
    expect(words).toContain('Outside wall')
    expect(words).not.toContain('Partition')
  })
})
