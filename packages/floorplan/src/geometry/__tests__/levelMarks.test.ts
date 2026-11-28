/**
 * VEW-84: what the core gives the level marks of a section and an elevation: where each floor and
 * roof stands across a section and how far the building is drawn, and every level a facade marks
 * (ground, floors, eaves and ridge, a flat roof's top, a parapet's top) with the stretch it marks.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planSection } from '../section'
import { planFacade } from '../facade'

type Raw = Record<string, unknown>
const wall = (id: string, start: number[], end: number[], floor: string, height = 2.7): Raw => ({ id, start, end, thickness: 0.3, kind: 'exterior', height, floor })

/** A box 8 × 6 m on its walls' lines, its one floor's roof and parapet as given. */
function box(floor: Raw): FloorPlan {
  return parseFloorPlan({
    floors: [{ id: 'ground', name: 'Ground floor', level: 0, ...floor }],
    walls: [wall('s', [0, 0], [8, 0], 'ground', 2.4), wall('e', [8, 0], [8, 6], 'ground', 2.4), wall('n', [8, 6], [0, 6], 'ground', 2.4), wall('w', [0, 6], [0, 0], 'ground', 2.4)],
    rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'], floor: 'ground' }]
  })
}

/** A split level: a low half from x 0 to 5 at ±0, a high half from x 5 to 10 at +1.5 m. */
function splitLevel(): FloorPlan {
  return parseFloorPlan({
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
}

describe('where a section\'s levels stand across it (VEW-84)', () => {
  it('gives the building\'s extent apart from the ground line, which runs to the line\'s ends', () => {
    // The line runs 5 m past the building at each end: x = 0 is plan x = -5.
    const section = planSection(splitLevel(), { from: { x: -5, y: 3 }, to: { x: 15, y: 3 }, toward: 'left' })
    expect(section.building).not.toBeNull()
    expect(section.building!.from).toBeCloseTo(4.85, 6)
    expect(section.building!.to).toBeCloseTo(15.15, 6)
    expect(section.bounds.min.x).toBeLessThanOrEqual(0)
    expect(section.bounds.max.x).toBeGreaterThanOrEqual(20)
  })

  it('gives each half of a split level its own stretch, so its mark goes beside its own half', () => {
    const section = planSection(splitLevel(), { from: { x: -5, y: 3 }, to: { x: 15, y: 3 }, toward: 'left' })
    const low = section.levels.find((l) => l.floor === 'low')!
    const high = section.levels.find((l) => l.floor === 'high')!
    expect([low.from, low.to].map((v) => Number(v!.toFixed(3)))).toEqual([4.85, 10.15])
    expect([high.from, high.to].map((v) => Number(v!.toFixed(3)))).toEqual([9.85, 15.15])
  })

  it('gives a roof its stretch and a parapet cut on it its top', () => {
    const section = planSection(box({ parapet: 0.9 }), { from: { x: 4, y: -3 }, to: { x: 4, y: 9 }, toward: 'left' })
    expect(section.roofs).toHaveLength(1)
    const [roof] = section.roofs
    expect(roof!.to - roof!.from).toBeGreaterThan(5.5)
    expect(roof!.parapet).toBeCloseTo(roof!.level + 0.9, 6)
  })
})

describe('the levels an elevation marks (VEW-84)', () => {
  it('marks the ground, the floor, the eaves and the ridge of a gabled house, as a section does', () => {
    const plan = box({ roof: { shape: 'gable', eaves: 2.4, ridge: 4.4, ridgeRuns: 'east-west' } })
    const facade = planFacade(plan, 'south')
    expect(facade.marks.map((m) => [m.kind, m.level])).toEqual([
      ['ground', 0],
      ['floor', 0],
      ['eaves', 2.4],
      ['ridge', 4.4]
    ])
    const section = planSection(plan, { from: { x: 4, y: -3 }, to: { x: 4, y: 9 }, toward: 'left' })
    expect([section.roofs[0]!.eaves, section.roofs[0]!.ridge]).toEqual([2.4, 4.4])
    for (const mark of facade.marks) expect(mark.u1 - mark.u0).toBeGreaterThan(7)
  })

  it('marks a flat roof\'s top and its parapet\'s top', () => {
    const facade = planFacade(box({ parapet: 0.9 }), 'south')
    const kinds = facade.marks.map((m) => m.kind)
    expect(kinds).toEqual(['ground', 'floor', 'roof', 'parapet'])
    const roof = facade.marks.find((m) => m.kind === 'roof')!
    const parapet = facade.marks.find((m) => m.kind === 'parapet')!
    expect(parapet.level).toBeCloseTo(roof.level + 0.9, 6)
  })

  it('marks each half of a split level over its own stretch of the facade', () => {
    const facade = planFacade(splitLevel(), 'south')
    const floors = facade.marks.filter((m) => m.kind === 'floor')
    expect(floors.map((m) => [m.floor, m.level])).toEqual([['low', 0], ['high', 1.5]])
    const [low, high] = floors
    expect(low!.u1).toBeLessThan(high!.u1)
    expect(high!.u0).toBeGreaterThan(low!.u0)
  })
})
