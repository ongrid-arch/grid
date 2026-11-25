import { describe, expect, it } from 'vitest'
import type { SceneOpening, Vec2, WallElevation } from '@ongrid/floorplan/geometry'
import { cutElevation, cutOpening } from '../cutWall'

const wall = (holes: Vec2[][], height = 3, length = 6): WallElevation => ({
  wallId: 'w',
  outline: [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: height },
    { x: 0, y: height }
  ],
  holes,
  thickness: 0.2,
  length,
  height,
  ends: { start: { left: 0, right: 0 }, end: { left: 0, right: 0 } }
})
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
]
const area = (points: readonly Vec2[]): number =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!
    return sum + (p.x * q.y - q.x * p.y) / 2
  }, 0)
const top = (points: readonly Vec2[]): number => Math.max(...points.map((p) => p.y))

describe('a wall cut to a height', () => {
  it('is lowered to the height', () => {
    const cut = cutElevation(wall([]), 1.2)
    expect(top(cut.outline)).toBeCloseTo(1.2)
    expect(Math.abs(area(cut.outline))).toBeCloseTo(6 * 1.2)
    expect(cut.height).toBeCloseTo(1.2)
  })

  it('is left as it is when it is no higher than the cut', () => {
    const low = wall([], 1)
    expect(cutElevation(low, 1.2)).toBe(low)
  })

  it('keeps a hole wholly under the cut', () => {
    const cut = cutElevation(wall([rect(1, 0.3, 2, 1)]), 1.2)
    expect(cut.holes).toHaveLength(1)
    expect(Math.abs(area(cut.outline))).toBeCloseTo(6 * 1.2)
  })

  it('opens a hole that reaches the cut into a notch in the top', () => {
    const door = rect(1, 0, 2, 2.1)
    const cut = cutElevation(wall([door]), 1.2)
    expect(cut.holes).toHaveLength(0)
    // The wall's face is what is left of the strip under the cut once the doorway is out.
    expect(Math.abs(area(cut.outline))).toBeCloseTo(6 * 1.2 - 1 * 1.2)
    // The notch goes down to the floor: no point of the outline inside the doorway above it.
    expect(cut.outline.some((p) => p.x > 1 && p.x < 2 && p.y > 0)).toBe(false)
  })

  it('notches the top for several doorways, whichever way the outline runs', () => {
    const doors = [rect(4, 0, 5, 2.1), rect(1, 0, 2, 2.1)]
    for (const flip of [false, true]) {
      const source = wall(doors)
      const elevation = flip ? { ...source, outline: [...source.outline].reverse() } : source
      const cut = cutElevation(elevation, 1.2)
      expect(Math.abs(area(cut.outline))).toBeCloseTo(6 * 1.2 - 2 * 1.2)
    }
  })

  it('cuts a window that straddles the cut and leaves one above it out', () => {
    expect(cutElevation(wall([rect(1, 0.9, 2, 1.8)]), 1.2).holes).toHaveLength(0)
    const above = cutElevation(wall([rect(1, 1.5, 2, 2.1)]), 1.2)
    expect(above.holes).toHaveLength(0)
    expect(Math.abs(area(above.outline))).toBeCloseTo(6 * 1.2)
  })
})

describe('an opening under a cut', () => {
  const box = (bottom: number, top: number) => ({ part: 'frame' as const, outline: rect(0, 0, 1, 1), bottom, top })
  const opening = (...parts: ReturnType<typeof box>[]): SceneOpening => ({ id: 'o', wallId: 'w', type: 'door', kind: null, parts })

  it('is drawn up to the cut', () => {
    const cut = cutOpening(opening(box(0, 2.1)), 1.2)
    expect(cut.parts.map((p) => p.top)).toEqual([1.2])
  })

  it('leaves out a box wholly above the cut and keeps one under it', () => {
    const cut = cutOpening(opening(box(0, 1), box(1.5, 2)), 1.2)
    expect(cut.parts).toHaveLength(1)
  })

  it('is returned as it is when nothing reaches the cut', () => {
    const low = opening(box(0, 1))
    expect(cutOpening(low, 1.2)).toBe(low)
  })
})
