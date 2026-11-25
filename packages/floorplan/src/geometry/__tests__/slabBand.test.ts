/**
 * VEW-29: a slab's edge is drawn as a band of its own only where its thickness is stated; an
 * unstated one leaves the walls standing down over the edge, as brick and render do.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planFacade } from '../facade'
import { planSection, type SectionLine } from '../section'

const wall = (id: string, start: [number, number], end: [number, number], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })

function house(slab?: number): FloorPlan {
  const ring = (p: string, floor: string) => [
    wall(`${p}s`, [0, 0], [8, 0], floor),
    wall(`${p}e`, [8, 0], [8, 6], floor),
    wall(`${p}n`, [8, 6], [0, 6], floor),
    wall(`${p}w`, [0, 6], [0, 0], floor)
  ]
  return parseFloorPlan({
    version: '1',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1, ...(slab === undefined ? {} : { slab }) }
    ],
    walls: [...ring('g', 'ground'), ...ring('f', 'first')],
    rooms: [
      { id: 'g', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
      { id: 'f', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' }
    ]
  })
}

const THROUGH: SectionLine = { from: { x: 4, y: -2 }, to: { x: 4, y: 8 }, toward: 'left' }

describe('the slab edge band', () => {
  it('is left out of a facade whose slab thickness is not stated, the wall standing down over the edge', () => {
    const facade = planFacade(house(), 'south')
    expect(facade.faces.filter((f) => f.kind === 'slab')).toEqual([])
    const first = facade.faces.find((f) => f.kind === 'wall' && f.floor === 'first')!
    expect(Math.min(...first.outline.map((p) => p[1]))).toBeCloseTo(2.7, 9)
  })

  it('is drawn in a facade where the floor states its slab', () => {
    const facade = planFacade(house(0.3), 'south')
    expect(facade.faces.filter((f) => f.kind === 'slab' && f.floor === 'first')).toHaveLength(1)
    const first = facade.faces.find((f) => f.kind === 'wall' && f.floor === 'first')!
    expect(Math.min(...first.outline.map((p) => p[1]))).toBeCloseTo(3, 9)
  })

  it('is left out of the section beyond the cut when the thickness is not stated, and drawn when it is', () => {
    expect(planSection(house(), THROUGH).beyond.filter((f) => f.kind === 'slab')).toEqual([])
    expect(planSection(house(0.3), THROUGH).beyond.filter((f) => f.kind === 'slab').length).toBeGreaterThan(0)
  })

  it('still cuts the slab in a section whether or not its thickness is stated', () => {
    expect(planSection(house(), THROUGH).parts.some((p) => p.kind === 'slab' && p.id === 'first')).toBe(true)
  })
})
