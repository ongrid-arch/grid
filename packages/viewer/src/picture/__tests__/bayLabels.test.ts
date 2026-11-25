import { describe, expect, it } from 'vitest'
import type { PlanBay } from '@ongrid/floorplan/geometry'
import { basementCarPark } from '@ongrid/floorplan/test-support/parking'
import { bayLabels } from '../bayLabels'
import { planToSvg } from '../planSvg'

/**
 * VEW-32: a row of bays too small for their numbers is labelled once, as a range; a bay that has
 * room for its number keeps it.
 */
const bay = (i: number, width: number, y = 5): PlanBay => {
  const x = i * width
  return { id: `b${i}`, number: `P${i}`, outline: [{ x: x - width / 2, y: y - 2.5 }, { x: x + width / 2, y: y - 2.5 }, { x: x + width / 2, y: y + 2.5 }, { x: x - width / 2, y: y + 2.5 }], centre: { x, y } }
}
const row = (count: number, width: number, y = 5): PlanBay[] => Array.from({ length: count }, (_, i) => bay(i + 1, width, y))

describe('bay labels', () => {
  it('numbers each bay that has room for its number', () => {
    const labels = bayLabels(row(8, 2.5), 0.05)
    expect(labels.map((l) => l.text)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
    expect(labels.every((l) => l.bay !== null)).toBe(true)
  })

  it('writes a crowded row once, as a range from its first number to its last', () => {
    const labels = bayLabels(row(120, 2.5), 0.5)
    expect(labels).toEqual([{ at: { x: (1 * 2.5 + 120 * 2.5) / 2, y: 5 }, text: 'P1-P120', bay: null }])
  })

  it('leaves a lone bay too small for its number blank, and writes its neighbour row apart', () => {
    const labels = bayLabels([...row(10, 2.5), bay(50, 2.5, 30), ...row(5, 2.5, 60)].map((b, i) => ({ ...b, id: `x${i}`, number: b.number })), 0.5)
    expect(labels.map((l) => l.text).sort()).toEqual(['P1-P10', 'P1-P5'])
  })

  it('splits a row where it is broken by a gap', () => {
    const left = row(5, 2.5)
    const right = row(5, 2.5).map((b, i) => ({ ...b, id: `r${i}`, number: `Q${i + 1}`, centre: { x: b.centre.x + 100, y: b.centre.y } }))
    expect(bayLabels([...left, ...right], 0.5).map((l) => l.text)).toEqual(['P1-P5', 'Q1-Q5'])
  })

  it('draws the range, not the run of numbers, in a picture', () => {
    const bays = Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, number: `P${i + 1}`, at: [0.3 + 0.2 * i, 10], width: 0.2, length: 4.8, floor: 'B1' }))
    const svg = planToSvg(basementCarPark({ bays }), { floor: 'B1' })
    const ranges = [...svg.matchAll(/data-part="bay-range"[^>]*>.*?<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    expect(ranges).toEqual(['P1-P24'])
    expect(svg).not.toMatch(/>P1<\/text>/)
  })
})
