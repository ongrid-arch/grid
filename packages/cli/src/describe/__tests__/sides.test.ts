/**
 * CMD-49: a room's outline read as the sides a person names: a curve traced by short straight
 * pieces is one curved side, and a room of four sides turned on the drawing has its own sides.
 */
import { describe, expect, it } from 'vitest'
import type { Vec2 } from '@ongrid/floorplan/geometry'
import { ringSides, roomForm } from '../sides'

const STEP = (2.5 * Math.PI) / 180
const deg = (d: number): number => (d * Math.PI) / 180

/** Points round `c` at radius `r` from angle `a0` turning `sweep`, every 2.5 degrees, both ends. */
function arc(c: Vec2, r: number, a0: number, sweep: number): Vec2[] {
  const n = Math.max(1, Math.round(Math.abs(sweep) / STEP))
  return Array.from({ length: n + 1 }, (_, k) => ({ x: c.x + r * Math.cos(a0 + (sweep * k) / n), y: c.y + r * Math.sin(a0 + (sweep * k) / n) }))
}

const turnedBy = (points: readonly Vec2[], degrees: number): Vec2[] => points.map((p) => ({ x: p.x * Math.cos(deg(degrees)) - p.y * Math.sin(deg(degrees)), y: p.x * Math.sin(deg(degrees)) + p.y * Math.cos(deg(degrees)) }))

describe('a ring of points read as sides (CMD-49)', () => {
  it('reads a round room traced by 144 pieces as one curved side all the way round', () => {
    const circle = arc({ x: 20, y: 20 }, 17.7, 0, 2 * Math.PI).slice(0, -1)
    expect(circle).toHaveLength(144)
    const sides = ringSides(circle)
    expect(sides).toHaveLength(1)
    expect(sides[0]!.curve!.radius).toBeCloseTo(17.7, 6)
    expect(sides[0]!.curve!.sweep).toBeCloseTo(2 * Math.PI, 9)
    expect(sides[0]!.length).toBeCloseTo(2 * Math.PI * 17.7, 6)
    expect(roomForm(circle)).toEqual({ kind: 'round', across: expect.closeTo(35.4, 6) })
  })

  it('reads a band between two curves on one centre by its length along its middle and its width', () => {
    const outer = arc({ x: 0, y: 0 }, 21, 0, Math.PI)
    const inner = arc({ x: 0, y: 0 }, 17.8, Math.PI, -Math.PI)
    const ring = [...outer, ...inner]
    const sides = ringSides(ring)
    expect(sides.map((s) => (s.curve === null ? 'straight' : 'curved'))).toEqual(['curved', 'straight', 'curved', 'straight'])
    expect(sides[0]!.length).toBeCloseTo(21 * Math.PI, 6)
    expect(sides[2]!.curve!.sweep).toBeLessThan(0)
    // The concave side faces out toward its centre: south, at its middle.
    expect(sides[2]!.out.y).toBeCloseTo(-1, 6)
    const form = roomForm(ring)
    expect(form).toEqual({ kind: 'band', long: expect.closeTo(19.4 * Math.PI, 6), wide: expect.closeTo(3.2, 6) })
  })

  it('reads an oval as its four arcs, each one side', () => {
    // Two small arcs round the ends and two large ones along the sides, meeting without a kink.
    const a = 6
    const b = 3
    const small = (b * b) / a
    const large = ((a - small) ** 2 + b * b - small * small) / (2 * (b - small))
    const phi = Math.atan2(large - b, a - small)
    const ring = [
      ...arc({ x: a - small, y: 0 }, small, -phi, 2 * phi).slice(0, -1),
      ...arc({ x: 0, y: b - large }, large, phi, Math.PI - 2 * phi).slice(0, -1),
      ...arc({ x: -(a - small), y: 0 }, small, Math.PI - phi, 2 * phi).slice(0, -1),
      ...arc({ x: 0, y: large - b }, large, Math.PI + phi, Math.PI - 2 * phi).slice(0, -1),
    ]
    const sides = ringSides(ring)
    // Where two arcs meet without a kink a piece may go to either: the radii are right to 0.05 m.
    expect(sides.map((s) => s.curve?.radius.toFixed(1))).toEqual([small, large, small, large].map((r) => r.toFixed(1)))
    expect(sides.reduce((sum, s) => sum + s.pieces, 0)).toBe(ring.length)
  })

  it('reads a hall with a bowed side as its three straight sides and one curve', () => {
    // A 10 x 6 hall whose east side bows out on a radius of 4.
    const half = Math.asin(3 / 4)
    const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, ...arc({ x: 10 - 4 * Math.cos(half), y: 3 }, 4, -half, 2 * half).slice(1, -1), { x: 10, y: 6 }, { x: 0, y: 6 }]
    const sides = ringSides(ring)
    expect(sides.map((s) => (s.curve === null ? s.length.toFixed(2) : `r${s.curve.radius.toFixed(2)}`))).toEqual(['10.00', 'r4.00', '10.00', '6.00'])
    expect(sides[1]!.length).toBeCloseTo(4 * 2 * half, 6)
    expect(sides[1]!.out.x).toBeCloseTo(1, 6)
    expect(roomForm(ring)).toEqual({ kind: 'curved', curves: [{ radius: expect.closeTo(4, 6), length: expect.closeTo(8 * half, 6) }] })
  })

  it('reads a curve drawn by hand as short straight walls, to the centimetre, as one side', () => {
    const ring = arc({ x: 5, y: 5 }, 5, 0, 2 * Math.PI).slice(0, -1).map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }))
    expect(ringSides(ring)).toHaveLength(1)
  })

  it('splits a curve where the key the caller gives changes', () => {
    const circle = arc({ x: 0, y: 0 }, 6, 0, 2 * Math.PI).slice(0, -1)
    const sides = ringSides(circle, (i) => (i < 72 ? 'shared' : 'outside'))
    expect(sides.map((s) => [s.pieces, (Math.abs(s.curve!.sweep) * 180) / Math.PI])).toEqual([
      [72, expect.closeTo(180, 6)],
      [72, expect.closeTo(180, 6)],
    ])
  })

  it('gives a rectangle turned 7 degrees its own sides and its turn', () => {
    const studio = turnedBy([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }], 7)
    expect(roomForm(studio)).toEqual({ kind: 'turned', across: expect.closeTo(5, 9), up: expect.closeTo(3, 9), degrees: expect.closeTo(7, 9) })
    // Turned the other way, and from another corner, it is the same room.
    const back = turnedBy([{ x: 5, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }, { x: 5, y: 0 }], -97)
    expect(roomForm(back)).toEqual({ kind: 'turned', across: expect.closeTo(3, 9), up: expect.closeTo(5, 9), degrees: expect.closeTo(-7, 9) })
  })

  it('gives a four-sided room that is not a rectangle its four sides, and says nothing new of a square one', () => {
    expect(roomForm([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 14.5, y: 4.5 }, { x: 4.5, y: 9.3 }])).toMatchObject({ kind: 'four', sides: [12, expect.closeTo(5.15, 2), expect.closeTo(11.09, 2), expect.closeTo(10.33, 2)] })
    expect(roomForm([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }])).toBeNull()
    // An L: neither a curve nor four sides, read by across and up as before.
    expect(roomForm([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }])).toBeNull()
  })
})
