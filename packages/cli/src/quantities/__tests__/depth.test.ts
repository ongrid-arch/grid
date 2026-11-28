/**
 * ARE-82: each floor's depth below the ground, its formation level, retained height and dig. Car
 * park and basement plans had their depth tables, retained heights and dig volume built by hand.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planEarth } from '@ongrid/floorplan/geometry'
import { depthAnswer, floorsBelowGround, planDepths } from '../depth'

const METRES = { length: 'm', area: 'm2', decimal: 'point' } as const

const box = (p: string, floor: string, x0: number, y0: number, x1: number, y1: number) => [
  { id: `${p}s`, floor, start: [x0, y0], end: [x1, y0], kind: 'exterior' },
  { id: `${p}e`, floor, start: [x1, y0], end: [x1, y1], kind: 'exterior' },
  { id: `${p}n`, floor, start: [x1, y1], end: [x0, y1], kind: 'exterior' },
  { id: `${p}w`, floor, start: [x0, y1], end: [x0, y0], kind: 'exterior' },
]

/** A house 10 × 8 m over a car park 10 × 12 m, over a store under its western half; slabs 0.25 m, walls 0.2 m. */
function basement(): FloorPlan {
  return parseFloorPlan({
    floors: [
      { id: 'b2', name: 'Store level', level: -2, elevation: -6.5, height: 2.7, slab: 0.25 },
      { id: 'b1', name: 'Car park', level: -1, elevation: -3.5, height: 3, slab: 0.25 },
      { id: 'ground', name: 'Ground floor', level: 0, elevation: 0, height: 2.7, slab: 0.25 },
    ],
    site: { ground: 0 },
    walls: [...box('g', 'ground', 0, 0, 10, 8), ...box('a', 'b1', 0, 0, 10, 12), ...box('c', 'b2', 0, 0, 5, 12)],
    rooms: [
      { id: 'hall', name: 'Hall', floor: 'ground', boundary: ['gs', 'ge', 'gn', 'gw'], use: 'living' },
      { id: 'park', name: 'Parking', floor: 'b1', boundary: ['as', 'ae', 'an', 'aw'], use: 'parking' },
      { id: 'store', name: 'Store', floor: 'b2', boundary: ['cs', 'ce', 'cn', 'cw'], use: 'storage' },
    ],
  })
}

describe('a car park and a store below the ground (ARE-82)', () => {
  const plan = basement()
  const depths = planDepths(plan)
  const of = (floor: string) => depths.floors.find((f) => f.floor === floor)!
  const carPark = 10.2 * 12.2
  const store = 5.2 * 12.2

  it('lists only the floors below the ground, each with its depth under it', () => {
    expect(depths.floors.map((f) => f.floor)).toEqual(['b2', 'b1'])
    expect(of('b1').depth).toEqual({ low: 3.5, high: 3.5 })
    expect(of('b2').depth).toEqual({ low: 6.5, high: 6.5 })
    expect(of('b1').ground).toEqual({ low: 0, high: 0 })
    expect(of('b1').below).toBe('wholly')
  })

  it('gives the formation level, the underside of the slab on the ground, and its depth', () => {
    expect(of('b1').formation!.level).toBeCloseTo(-3.75, 9)
    expect(of('b1').formation!.depth.high).toBeCloseTo(3.75, 9)
    expect(of('b2').formation!.level).toBeCloseTo(-6.75, 9)
  })

  it('gives the retained height on each side, no higher than the wall', () => {
    expect(of('b1').retained.map((r) => r.side)).toEqual(['north', 'east', 'south', 'west'])
    for (const r of of('b1').retained) expect(r.height).toBeCloseTo(3, 9)
    for (const r of of('b2').retained) expect(r.height).toBeCloseTo(2.7, 9)
    // The south face of the car park: 10.2 m along, 3 m high, wholly under the ground.
    expect(of('b1').retained.find((r) => r.side === 'south')!.area).toBeCloseTo(10.2 * 3, 6)
  })

  it('gives the area below the ground and the dig, which add up to ARE-77\'s excavation', () => {
    expect(of('b1').area).toBeCloseTo(carPark, 6)
    expect(of('b2').area).toBeCloseTo(store, 6)
    expect(of('b1').dig!.volume).toBeCloseTo((carPark - store) * 3.75, 6)
    expect(of('b2').dig!.volume).toBeCloseTo(store * 6.75, 6)
    expect(depths.excavation).toBeCloseTo(planEarth(plan).excavation, 9)
    expect(depths.excavation).toBeCloseTo(store * 6.75 + (carPark - store) * 3.75, 6)
  })

  it('words it floor by floor, with the excavation in all', () => {
    const answer = depthAnswer(plan, METRES)
    const text = answer.lines.join('\n')
    expect(text).toContain('"Car park": floor level -3.50 m, the ground round it at 0.00 m; its floor is 3.50 m below the ground, wholly under it.')
    expect(text).toContain('Formation level -3.75 m, the underside of its slab on the ground: 3.75 m below the ground.')
    expect(text).toContain('Retained height, the most earth its outer walls hold above its floor: 3.00 m on the north, 3.00 m on the east, 3.00 m on the south, 3.00 m on the west.')
    expect(text).toMatch(/Excavation in all: \d+\.\d m³, assumed\./)
    expect(answer.data['state']).toBe('assumed')
    expect((answer.data['floors'] as { floor: string }[]).map((f) => f.floor)).toEqual(['b2', 'b1'])
  })
})

describe('a house cut into a slope (ARE-82)', () => {
  // The ground rises from 0 on the west to 2 m on the east: the house's floor is at 0.
  const plan = parseFloorPlan({
    site: { groundSides: { west: 0, east: 2 } },
    walls: box('h', 'ground', 0, 0, 10, 6),
    rooms: [{ id: 'room', name: 'Room', boundary: ['hs', 'he', 'hn', 'hw'], use: 'living' }],
  })
  const depths = planDepths(plan)

  it('is below the ground on its higher side only, from the lowest to the highest ground', () => {
    expect(depths.floors).toHaveLength(1)
    const f = depths.floors[0]!
    expect(f.below).toBe('partly')
    expect(f.depth.low).toBe(0)
    expect(f.depth.high).toBeGreaterThan(1.5)
    expect(f.retained.find((r) => r.side === 'east')!.height).toBeGreaterThan(f.retained.find((r) => r.side === 'south')!.height - 1e-9)
    expect(f.retained.some((r) => r.side === 'west')).toBe(false)
    expect(depthAnswer(plan, METRES).lines.join('\n')).toContain('under it on its higher side only, as a floor cut into a slope')
  })
})

describe('a plan with nothing below the ground (ARE-82)', () => {
  it('says so, and lists no floor', () => {
    const plan = labPlan('F/scenarios/odd-house.json')
    expect(floorsBelowGround(plan).size).toBe(0)
    const answer = depthAnswer(plan, METRES)
    expect(answer.lines).toEqual(['No floor stands below the ground: every floor\'s level is at or above the ground round it.'])
    expect(answer.data['floors']).toEqual([])
  })
})
