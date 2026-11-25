import { describe, expect, it } from 'vitest'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { boxIsClear, labelObstacles, placeLabel, segmentsOf, type Ring } from '../sectionLabels'
import { pictureToSvg } from '../planSvg'
import { sectionPicture } from '../section'

/** VEW-50: a room's words in the largest empty part of its cut, never over lines or solids. */
const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const room = { from: 0, to: 6, bottom: 0, top: 3 }
const size = { width: 1.2, height: 0.5 }

describe('placing a room label', () => {
  it('takes the middle of an empty room', () => {
    const at = placeLabel(room, size, { solids: [], lines: [] })!
    expect(at.x).toBeCloseTo(3, 0)
    expect(at.y).toBeCloseTo(1.5, 0)
  })

  it('keeps clear of a stair block, a seen door and a slab edge', () => {
    const stair = [rect(2, 0, 4, 3)]
    const door = segmentsOf([rect(4.5, 0, 5.2, 2.1)])
    const slab = segmentsOf([rect(0, 2.6, 6, 3)])
    const obstacles = { solids: [stair], lines: [...segmentsOf(stair), ...door, ...slab] }
    const at = placeLabel(room, size, obstacles)!
    expect(at).not.toBeNull()
    expect(boxIsClear(at, obstacles)).toBe(true)
    expect(at.x + size.width / 2).toBeLessThanOrEqual(2)
  })

  it('goes in the largest empty part, not the middle, when a solid takes the middle', () => {
    const solid = [rect(1, 0, 3, 3)]
    const at = placeLabel(room, size, { solids: [solid], lines: segmentsOf(solid) })!
    expect(at.x).toBeGreaterThan(3.5)
  })

  it('gives none when the room has no clear place', () => {
    const solid = [rect(-1, -1, 7, 4)]
    expect(placeLabel(room, size, { solids: [solid], lines: segmentsOf(solid) })).toBeNull()
  })
})

describe('the labels of a section', () => {
  const plan = labPlan('A/scenarios/townhouse.json')
  const picture = sectionPicture(plan, { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 13 }, toward: 'left' })
  const svg = pictureToSvg(picture)

  it('lie in no solid part and cross no line', () => {
    const obstacles = labelObstacles(picture.section)
    const texts = [...svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"><text/g)]
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) {
      const centre = { x: Number(t[1]), y: -Number(t[2]) }
      expect(boxIsClear({ ...centre, width: 0.1, height: 0.05 }, obstacles)).toBe(true)
    }
  })

  it('stand on a halo of paper, written under the words', () => {
    const halos = svg.indexOf('data-part="section-room-halos"')
    expect(halos).toBeGreaterThan(-1)
    expect(halos).toBeLessThan(svg.indexOf('data-part="section-rooms"'))
    expect(svg.slice(halos, svg.indexOf('data-part="section-rooms"'))).toContain('stroke="#ffffff"')
  })
})
