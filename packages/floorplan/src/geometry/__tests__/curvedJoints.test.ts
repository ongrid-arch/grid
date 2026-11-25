/**
 * CNT-30: a straight wall meets a curved one at the curve's face. At a corner both walls end on
 * one line, through the crossings of their faces, so the drawing shows no notch; a partition that
 * runs into a curve stops where its faces meet the curve's face, the bulge included.
 */
import { describe, expect, it } from 'vitest'
import type { Wall } from '../plan'
import { wallJoints } from '../joints'
import { SQUARE_ENDS, wallLength, wallSegments, wallSliceShape, type WallEnds } from '../wall'
import type { Vec2 } from '../vec2'

type Tuple = [number, number]

function wall(id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall {
  return { id, start, end, thickness: 0.3, height: 3, kind: 'exterior', ...extra }
}

/** The radius of the pavilion's curves: each turns through 90° across a 6 m side. */
const R = 3 * Math.SQRT2

/**
 * A pavilion: 8 m by 6 m, its two short sides bowed out as quarter-circle curves, so each of its
 * four corners is a straight wall meeting a curve at an angle of 45°. A partition crosses it, and
 * another runs from it to the very bulge of the right-hand curve.
 */
function pavilion(): Wall[] {
  return [
    wall('bottom', [0, 0], [8, 0]),
    wall('right', [8, 0], [8, 6], { arc: { centre: [5, 3], sweep: 90 } }),
    wall('top', [8, 6], [0, 6]),
    wall('left', [0, 6], [0, 0], { arc: { centre: [3, 3], sweep: 90 } }),
    wall('across', [4, 0], [4, 6], { kind: 'partition', thickness: 0.1 }),
    wall('bulge', [4, 3], [5 + R, 3], { kind: 'partition', thickness: 0.1 })
  ]
}

/** The two corner points of one end of a wall, its left face's first, as drawn. */
function corners(w: Wall, ends: WallEnds | undefined, which: 'start' | 'end'): [Vec2, Vec2] {
  const shape = wallSliceShape(w, 0, wallLength(w), ends ?? SQUARE_ENDS)
  const left = shape.left.points
  const right = shape.right.points
  return which === 'start' ? [left[0]!, right[right.length - 1]!] : [left[left.length - 1]!, right[0]!]
}

const near = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Whether two pairs of points are the same two points, in either order, to a tenth of a millimetre. */
function samePair(a: [Vec2, Vec2], b: [Vec2, Vec2]): boolean {
  const close = 1e-4
  return (near(a[0], b[0]) < close && near(a[1], b[1]) < close) || (near(a[0], b[1]) < close && near(a[1], b[0]) < close)
}

const fromCentre = (p: Vec2, centre: Tuple): number => Math.hypot(p.x - centre[0], p.y - centre[1])

describe('a straight wall meeting a curve at a corner', () => {
  const walls = pavilion()
  const joints = wallJoints(walls)
  const byId = (id: string): Wall => walls.find((w) => w.id === id)!

  it.each([
    ['bottom', 'end', 'right', 'start'],
    ['top', 'start', 'right', 'end'],
    ['top', 'end', 'left', 'start'],
    ['bottom', 'start', 'left', 'end']
  ] as const)('ends %s at its %s on the line the curve %s ends on at its %s', (straight, straightEnd, curved, curvedEnd) => {
    const a = corners(byId(straight), joints.get(straight), straightEnd)
    const b = corners(byId(curved), joints.get(curved), curvedEnd)
    expect(samePair(a, b)).toBe(true)
  })

  it("puts the inside corner on the curve's inside face and on the straight wall's", () => {
    const [left, right] = corners(byId('right'), joints.get('right'), 'start')
    // The curve turns counter-clockwise, so its left face is its inside one.
    expect(fromCentre(left, [5, 3])).toBeCloseTo(R - 0.15, 6)
    expect(left.y).toBeCloseTo(0.15, 6)
    // Outside, the curve's face runs on along its tangent past its end, to the bottom's outside face.
    expect(right.y).toBeCloseTo(-0.15, 6)
  })
})

describe('a partition that runs into a curve', () => {
  it('is joined on the bulge, between two of its stations, and stops at the face', () => {
    const walls = pavilion()
    const curve = walls.find((w) => w.id === 'right')!
    // The bulge is not one of the stations the curve is followed by.
    const stations = wallSegments(curve).map((s) => s.start)
    expect(stations.every((p) => near(p, { x: 5 + R, y: 3 }) > 0.01)).toBe(true)
    const joints = wallJoints(walls)
    const bulge = walls.find((w) => w.id === 'bulge')!
    const [left, right] = corners(bulge, joints.get('bulge'), 'end')
    expect(fromCentre(left, [5, 3])).toBeCloseTo(R - 0.15, 6)
    expect(fromCentre(right, [5, 3])).toBeCloseTo(R - 0.15, 6)
  })

  it('stops at the face away from the bulge too', () => {
    const turn = (20 * Math.PI) / 180
    const end: Tuple = [5 + R * Math.cos(turn), 3 + R * Math.sin(turn)]
    const walls = [...pavilion().filter((w) => w.id !== 'bulge'), wall('slant', [6, end[1]], end, { kind: 'partition', thickness: 0.1 })]
    const joints = wallJoints(walls)
    const slant = walls.find((w) => w.id === 'slant')!
    const [left, right] = corners(slant, joints.get('slant'), 'end')
    expect(fromCentre(left, [5, 3])).toBeCloseTo(R - 0.15, 6)
    expect(fromCentre(right, [5, 3])).toBeCloseTo(R - 0.15, 6)
  })
})

describe('what was joined well before', () => {
  it('keeps a corner of two straight walls as it was', () => {
    const joints = wallJoints([wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 3])])
    const end = joints.get('a')!.end
    expect(end.left).toBeCloseTo(-0.15, 12)
    expect(end.right).toBeCloseTo(0.15, 12)
  })

  it('keeps a curve that carries its wall on in line with it square', () => {
    const bend = [wall('a', [0, 0], [4, 0]), wall('q', [4, 0], [6, 2], { arc: { centre: [4, 2], sweep: 90 } })]
    expect(wallJoints(bend).has('q')).toBe(false)
  })
})
