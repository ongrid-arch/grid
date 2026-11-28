/**
 * VEW-84: level marks beside the building, on a datum line back to what they mark, on the side the
 * part stands, staggered so no two marks' words print over each other; in a section and in an
 * elevation alike.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { SectionLine } from '@ongrid/floorplan/geometry'
import { TEXT_PX } from '../look'
import { facadePicture } from '../facade'
import { LEVEL_GAP_PX, staggered } from '../levelMarks'
import { pictureToSvg } from '../planSvg'
import { sectionPicture } from '../section'

type Raw = Record<string, unknown>
const wall = (id: string, start: number[], end: number[], floor: string, height = 2.7): Raw => ({ id, start, end, thickness: 0.3, kind: 'exterior', height, floor })

/** A split level: a low half from x 0 to 5 at ±0, a high half from x 5 to 10 at +1.5 m. */
const splitLevel = (): FloorPlan =>
  parseFloorPlan({
    floors: [
      { id: 'low', name: 'Low half', level: 0, elevation: 0 },
      { id: 'high', name: 'High half', level: 1, elevation: 1.5, overhang: 'meant' }
    ],
    walls: [
      wall('ls', [0, 0], [5, 0], 'low'), wall('le', [5, 0], [5, 6], 'low'), wall('ln', [5, 6], [0, 6], 'low'), wall('lw', [0, 6], [0, 0], 'low'),
      wall('hs', [5, 0], [10, 0], 'high'), wall('he', [10, 0], [10, 6], 'high'), wall('hn', [10, 6], [5, 6], 'high'), wall('hw', [5, 6], [5, 0], 'high')
    ],
    rooms: [
      { id: 'living', name: 'Living', boundary: ['ls', 'le', 'ln', 'lw'], floor: 'low' },
      { id: 'study', name: 'Study', boundary: ['hs', 'he', 'hn', 'hw'], floor: 'high' }
    ]
  })

/** A gabled box 8 × 6 m, its eaves on the south and north. */
const gabled = (): FloorPlan =>
  parseFloorPlan({
    floors: [{ id: 'ground', name: 'Ground floor', level: 0, roof: { shape: 'gable', eaves: 2.4, ridge: 4.4, ridgeRuns: 'east-west' } }],
    walls: [wall('s', [0, 0], [8, 0], 'ground', 2.4), wall('e', [8, 0], [8, 6], 'ground', 2.4), wall('n', [8, 6], [0, 6], 'ground', 2.4), wall('w', [0, 6], [0, 0], 'ground', 2.4)],
    rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'], floor: 'ground' }]
  })

/** Each mark of one part: its place (metres, the SVG's y down), its scale and the words' baseline offset in pixels. */
function marksOf(svg: string, part: string): { floor?: string; x: number; y: number; mpp: number; textY: number; words: string; datum: string }[] {
  return [...svg.matchAll(new RegExp(`<g data-part="${part}"([^>]*)>(.*?)</g>`, 'g'))].map((m) => {
    const head = m[1]!
    const body = m[2]!
    const [, x, y, mpp] = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.e]+)\)/.exec(head)!
    const floor = /data-floor="([^"]+)"/.exec(head)?.[1]
    return {
      ...(floor === undefined ? {} : { floor }),
      x: Number(x),
      y: Number(y),
      mpp: Number(mpp),
      textY: Number(/<text [^>]*y="([-\d.]+)"/.exec(body)![1]),
      words: /<text[^>]*>([^<]*)<\/text>/.exec(body)![1]!,
      datum: /data-part="level-datum" d="([^"]+)"/.exec(body)![1]!
    }
  })
}

describe('a section\'s level marks (VEW-84)', () => {
  // The line runs 5 m past the building at each end.
  const line: SectionLine = { from: { x: -5, y: 3 }, to: { x: 15, y: 3 }, toward: 'left' }
  const picture = sectionPicture(splitLevel(), line, { look: 'technical' })
  const svg = pictureToSvg(picture)
  const building = picture.section.building!

  it('stands beside the building, not beside the line\'s ends, with a datum line back to it', () => {
    const marks = marksOf(svg, 'section-level')
    expect(marks).toHaveLength(2)
    for (const mark of marks) {
      const off = Math.min(Math.abs(mark.x - building.from), Math.abs(mark.x - building.to)) / mark.mpp
      // Within a pixel: the scale is written rounded.
      expect(Math.abs(off - LEVEL_GAP_PX)).toBeLessThan(1)
      // The datum line runs from the gap's far side, at the building, to the tick.
      expect(mark.datum).toMatch(/^M-?[\d.]+,0L0,0$/)
    }
  })

  it('marks each half of a split level beside its own half', () => {
    const [low, high] = ['low', 'high'].map((floor) => marksOf(svg, 'section-level').find((m) => m.floor === floor)!)
    expect(low!.x).toBeLessThan(building.from)
    expect(high!.x).toBeGreaterThan(building.to)
    expect(low!.words).toBe('±0.000 Low half')
    expect(high!.words).toBe('+1.500 High half')
  })
})

describe('an elevation\'s level marks (VEW-84)', () => {
  const picture = facadePicture(gabled(), { side: 'south', look: 'technical' })
  const svg = pictureToSvg(picture)

  it('marks the ground, the floor, the eaves and the ridge beside the building', () => {
    expect(marksOf(svg, 'facade-ground-level').map((m) => m.words)).toEqual(['±0.000 Ground'])
    expect(marksOf(svg, 'facade-level').map((m) => m.words)).toEqual(['±0.000 Ground floor'])
    expect(marksOf(svg, 'facade-eaves-level').map((m) => m.words)).toEqual(['+2.400 Eaves'])
    expect(marksOf(svg, 'facade-ridge-level').map((m) => m.words)).toEqual(['+4.400 Ridge'])
    const extent = picture.facade.extent!
    for (const mark of marksOf(svg, 'facade-ridge-level')) expect(Math.abs((mark.x - extent.u1) / mark.mpp - LEVEL_GAP_PX)).toBeLessThan(1)
  })

  it('staggers the ground and the ground floor, at one level, so their words do not print over each other', () => {
    const [ground] = marksOf(svg, 'facade-ground-level')
    const [floor] = marksOf(svg, 'facade-level')
    expect(ground!.y).toBe(floor!.y)
    const baseline = (m: { y: number; mpp: number; textY: number }): number => m.y / m.mpp + m.textY
    expect(Math.abs(baseline(ground!) - baseline(floor!))).toBeGreaterThanOrEqual(TEXT_PX.dimension)
    expect(svg).toContain('data-part="level-leader"')
  })
})

describe('staggering levels close together', () => {
  it('steps the words of each level that would touch the one below it clear of it, lowest first', () => {
    // 0.1 m apart at 0.01 m a pixel: 10 pixels, less than a line of words.
    const lifts = staggered([0, 0.1, 3], 0.01)
    expect(lifts[0]).toBe(0)
    expect(lifts[1]).toBeGreaterThan(0)
    expect(lifts[2]).toBe(0)
    expect(0.1 / 0.01 + lifts[1]! - 0).toBeGreaterThanOrEqual(TEXT_PX.dimension)
  })
})
