import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture, pictureToSvg } from '../planSvg'

/**
 * CNT-52: a drawing that shows points keys each kind by its symbol, and a tag with words is listed
 * in the key by its number; the notes keep their own numbers under the notes.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

function evacuation(): FloorPlan {
  return {
    ...flat(),
    items: [
      { id: 'fe1', kind: 'extinguisher', at: [2, 0.3], size: [0.4, 0.4], height: 1 },
      { id: 'fe2', kind: 'extinguisher', at: [8, 0.3], size: [0.4, 0.4], height: 1 },
      { id: 'here', kind: 'you-are-here', at: [5, 2], size: [0.5, 0.5], height: 1.6 },
      { id: 'out', kind: 'exit', at: [0.3, 2], size: [0.4, 0.4], height: 2.2 },
    ],
    annotations: [
      { id: 'n1', kind: 'note', text: 'Keep the corridor clear', at: [5, 5] },
      { id: 't1', kind: 'tag', text: 'FE: CO2 extinguisher', at: [2, 1] },
    ],
  }
}

describe('points and tags in the key', () => {
  it('keys each point kind shown once, by its symbol, and the tag by its number', () => {
    const picture = planPicture(evacuation(), {})
    const band = JSON.stringify(picture.key)
    expect(band).toContain('Fire extinguisher')
    expect(band).toContain('You are here')
    expect(band).toContain('Exit')
    expect(band.match(/Fire extinguisher/g)).toHaveLength(1)
    const svg = pictureToSvg(picture)
    // Two notes in plan order: the note is 1, the tag 2, and the tag is in the key, not under the notes.
    expect(parts(svg, 'key-entry').length).toBeGreaterThanOrEqual(4)
    expect(svg).toContain('FE: CO2 extinguisher')
    expect(band.match(/FE: CO2 extinguisher/g)).toHaveLength(1)
    const numbers = parts(svg, 'notes-number')
    expect(numbers).toHaveLength(1)
    expect(svg).toMatch(/data-part="notes-number"[^>]*>1</)
  })

  it('draws a point over the walls it is fixed to', () => {
    const svg = pictureToSvg(planPicture(evacuation(), {}))
    const point = svg.indexOf('data-id="fe1"')
    const wall = svg.lastIndexOf('data-part="wall"')
    expect(point).toBeGreaterThan(wall)
  })

  it('keeps the tag under the notes when the key is turned off', () => {
    const picture = planPicture(evacuation(), { show: { key: false } })
    const svg = pictureToSvg(picture)
    expect(svg).not.toContain('Fire extinguisher')
    expect(parts(svg, 'notes-number')).toHaveLength(2)
  })

  it('has no key of its own for a plan with no points or tags', () => {
    const picture = planPicture(flat(), {})
    expect(JSON.stringify(picture.key ?? {})).not.toContain('key-entry')
  })
})
