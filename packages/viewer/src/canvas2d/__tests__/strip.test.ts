/** VEW-77: the gap a window on a curve leaves is filled along the curve, not across its chord. */
import { describe, expect, it } from 'vitest'
import { buildFloorPlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { openingStrip, stripAcross } from '../strip'

const bay: FloorPlan = {
  version: '1',
  units: 'm',
  walls: [
    { id: 'b', start: [3, 0], end: [0, 3], thickness: 0.3, height: 3, kind: 'exterior', arc: { centre: [0, 0], sweep: 90 } },
    { id: 'c', start: [0, 3], end: [3, 0], thickness: 0.3, height: 3, kind: 'exterior' }
  ],
  rooms: [{ id: 'r', name: 'Bay', boundary: ['b', 'c'] }],
  openings: [
    { id: 'w1', wall: 'b', type: 'window', offset: 1, width: 2.4, sill: 0.9, height: 1.5 },
    { id: 'w2', wall: 'c', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.5 }
  ]
}

describe('openingStrip (VEW-77)', () => {
  const drawing = buildFloorPlan(bay)

  it('follows the wall faces round a curve', () => {
    const w1 = drawing.openings.find((o) => o.id === 'w1')!
    const strip = openingStrip(w1)
    expect(strip.length).toBe(2 * w1.path!.length)
    for (const p of strip) {
      const r = Math.hypot(p.x, p.y)
      expect(Math.min(Math.abs(r - 3.15), Math.abs(r - 2.85))).toBeLessThan(1e-9)
    }
  })

  it('is the strip across a straight opening, as before', () => {
    const w2 = drawing.openings.find((o) => o.id === 'w2')!
    expect(openingStrip(w2)).toEqual(stripAcross(w2.from, w2.to, w2.normal, w2.thickness))
  })
})
