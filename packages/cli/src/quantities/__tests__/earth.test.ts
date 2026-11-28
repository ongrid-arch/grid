/**
 * ARE-77: walls and slabs with earth against them, and the dig. A basement estimate priced its
 * buried walls as outside render, the slab under the garden as roof and the basement floor's
 * half on the ground as upper floor, with nothing for the dig; a car park's walls got plaster.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { meanHeld, planEarth } from '@ongrid/floorplan/geometry'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'
import { planEstimate } from '../estimate'

const box = (p: string, floor: string, x0: number, y0: number, x1: number, y1: number) => [
  { id: `${p}s`, floor, start: [x0, y0], end: [x1, y0], kind: 'exterior' },
  { id: `${p}e`, floor, start: [x1, y0], end: [x1, y1], kind: 'exterior' },
  { id: `${p}n`, floor, start: [x1, y1], end: [x0, y1], kind: 'exterior' },
  { id: `${p}w`, floor, start: [x0, y1], end: [x0, y0], kind: 'exterior' },
]

/**
 * A house 10 × 8 m on the ground, over a car park 10 × 12 m reaching 4 m out under the garden,
 * over a store under its western half. Walls 0.2 m thick on their centre lines, slabs 0.25 m.
 */
function basement(ground: number, stacked = false): FloorPlan {
  const at = (elevation: number, height: number) => (stacked ? {} : { elevation, height, slab: 0.25 })
  return parseFloorPlan({
    floors: [
      { id: 'b2', name: 'Store level', level: -2, ...at(-6.5, 2.7) },
      { id: 'b1', name: 'Car park', level: -1, ...at(-3.5, 3) },
      { id: 'ground', name: 'Ground floor', level: 0, ...at(0, 2.7) },
    ],
    site: { ground },
    walls: [...box('g', 'ground', 0, 0, 10, 8), ...box('a', 'b1', 0, 0, 10, 12), ...box('c', 'b2', 0, 0, 5, 12)],
    rooms: [
      { id: 'hall', name: 'Hall', floor: 'ground', boundary: ['gs', 'ge', 'gn', 'gw'], use: 'living' },
      { id: 'park', name: 'Parking', floor: 'b1', boundary: ['as', 'ae', 'an', 'aw'], use: 'parking' },
      { id: 'store', name: 'Store', floor: 'b2', boundary: ['cs', 'ce', 'cn', 'cw'], use: 'storage' },
    ],
  })
}

const line = (lines: readonly { key: string; quantity: number }[], key: string): number | undefined => lines.find((l) => l.key === key)?.quantity

describe('a basement under a garden (ARE-77)', () => {
  const plan = basement(0)
  const survey = surveyPlan(plan)
  const estimate = planEstimate(survey)
  const keys = estimate.lines.map((l) => l.key)
  // Outlines to the outside face: the house 10.2 × 8.2, the car park 10.2 × 12.2, the store 5.2 × 12.2.
  const carPark = 10.2 * 12.2
  const store = 5.2 * 12.2

  it('lists the walls below the ground as retaining walls by the height of earth they hold, not as outside face', () => {
    // The car park's walls are 3 m high under 3.5 m of earth; the store's 2.7 m under 6.5 m.
    expect(line(estimate.lines, 'retaining_wall:3')).toBeCloseTo(2 * (10.2 + 12.2) * 3, 6)
    expect(line(estimate.lines, 'retaining_wall:2.7')).toBeCloseTo(2 * (5.2 + 12.2) * 2.7, 6)
    // Only the house is outside face: 36.8 m of outline at 2.7 m.
    expect(line(estimate.lines, 'external_finish')).toBeCloseTo(2 * (10.2 + 8.2) * 2.7, 6)
    const alone = planEstimate(surveyPlan(parseFloorPlan({ walls: box('g', 'ground', 0, 0, 10, 8), rooms: [{ id: 'hall', name: 'Hall', boundary: ['gs', 'ge', 'gn', 'gw'], use: 'living' }] })))
    expect(line(estimate.lines, 'wall:exterior:0.2')).toBeCloseTo(line(alone.lines, 'wall:exterior:0.2')!, 6)
  })

  it('takes the slab under the garden as a buried slab with its soil, never as roof', () => {
    // The car park reaches 4 m past the house: 10.2 × 4 m, its top at -3.5 + 3 + 0.25.
    expect(line(estimate.lines, 'buried_slab')).toBeCloseTo(10.2 * 4, 6)
    expect(estimate.lines.find((l) => l.key === 'buried_slab')!.what).toContain('under 0.25 m of soil')
    expect(line(estimate.lines, 'roof')).toBeCloseTo(10.2 * 8.2, 6)
    const takeoff = planTakeoff(survey)
    const b1 = takeoff.envelope.floors.find((f) => f.floor === 'b1')!
    expect(b1.roof).toBeNull()
    expect(b1.buried!.area).toBeCloseTo(40.8, 6)
    expect(b1.buried!.cover).toBeCloseTo(0.25, 6)
  })

  it('gives every slab on the ground as ground-bearing, the car park\'s half past the store too, never as upper floor', () => {
    expect(line(estimate.lines, 'slab')).toBeCloseTo(store + (carPark - store), 6)
    expect(estimate.lines.find((l) => l.key === 'slab')!.what).toBe('Ground-bearing slabs ("Store level", "Car park")')
    // The upper floor structure: the house's gross internal area, and the car park's by the share of its slab over the store.
    const share = store / carPark
    expect(line(estimate.lines, 'upper_floor')).toBeCloseTo(9.8 * 7.8 + 9.8 * 11.8 * share, 6)
    const b1 = planTakeoff(survey).envelope.floors.find((f) => f.floor === 'b1')!
    expect(b1.slab!.onGround).toBeCloseTo(carPark - store, 6)
  })

  it('gives the dig, from the ground down to the underside of each ground-bearing slab', () => {
    const volume = store * 6.75 + (carPark - store) * 3.75
    expect(line(estimate.lines, 'excavation')).toBeCloseTo(volume, 6)
    expect(estimate.lines.find((l) => l.key === 'excavation')!.unit).toBe('m3')
    const earth = planTakeoff(survey).earth!
    expect(earth.excavation).toBeCloseTo(volume, 6)
    expect(earth.dig.map((d) => [d.floor, Number(d.depth.toFixed(2))])).toEqual([['b2', 6.75], ['b1', 3.75]])
  })

  it('gives the inside face of the walls against the earth its own line, not plaster', () => {
    expect(keys).not.toContain('wall_finish:parking')
    expect(keys).not.toContain('wall_finish:storage')
    expect(line(estimate.lines, 'retaining_face')).toBeCloseTo(2 * (9.8 + 11.8) * 3 + 2 * (4.8 + 11.8) * 2.7, 6)
    const park = planTakeoff(survey).rooms.find((r) => r.id === 'park')!
    expect(park.wallFace).toBeCloseTo(0, 6)
    expect(park.earthFace).toBeCloseTo(2 * (9.8 + 11.8) * 3, 6)
  })
})

describe('a basement roof standing just over the ground', () => {
  it('is a buried slab when its top is no more than 0.3 m above the ground, and not in the roof', () => {
    // Stacked: the car park's roof top is at the house's floor, 0.15 m above the ground.
    const survey = surveyPlan(basement(-0.15, true))
    const takeoff = planTakeoff(survey)
    const b1 = takeoff.envelope.floors.find((f) => f.floor === 'b1')!
    expect(b1.roof).toBeNull()
    expect(b1.buried!.cover).toBe(0)
    expect(takeoff.envelope.roof).toBeCloseTo(10.2 * 8.2, 6)
    const estimate = planEstimate(survey)
    expect(line(estimate.lines, 'roof')).toBeCloseTo(10.2 * 8.2, 6)
    expect(line(estimate.lines, 'buried_slab')).toBeCloseTo(10.2 * 4, 6)
  })
})

describe('a house cut into a slope', () => {
  // The ground rises from 0 on the west to 2 m on the east: the house's floor is at 0.
  const plan = parseFloorPlan({
    site: { groundSides: { west: 0, east: 2 } },
    walls: box('h', 'ground', 0, 0, 10, 6),
    rooms: [{ id: 'room', name: 'Room', boundary: ['hs', 'he', 'hn', 'hw'], use: 'living' }],
  })
  const earth = planEarth(plan)

  it('holds the earth along each wall as the ground runs, the east wall most', () => {
    const byWall = new Map(earth.retaining.map((r) => [r.wall, r] as const))
    expect(byWall.has('hw')).toBe(false)
    const east = byWall.get('he')!
    const south = byWall.get('hs')!
    expect(east.retained).toBeGreaterThan(south.retained - 1e-9)
    // Along the south wall the earth rises evenly from nothing: about half its most.
    expect(south.area / south.length).toBeCloseTo(meanHeld(0, south.retained, south.height), 1)
    expect(east.share).toBeGreaterThan(0)
  })

  it('digs the floor out, from the ground at its middle', () => {
    expect(earth.dig).toHaveLength(1)
    expect(earth.dig[0]!.depth).toBeGreaterThan(0.25)
  })
})

describe('the mean of a straight line held between 0 and a height', () => {
  it('is exact where the line crosses either', () => {
    expect(meanHeld(-1, 1, 3)).toBeCloseTo(0.25, 12)
    expect(meanHeld(0, 4, 2)).toBeCloseTo(1.5, 12)
    expect(meanHeld(-2, -1, 2)).toBe(0)
    expect(meanHeld(5, 5, 2)).toBe(2)
  })
})

describe('a plan with nothing in the earth', () => {
  it('answers as before: no earth, no new lines', () => {
    const survey = surveyPlan(labPlan('F/scenarios/odd-house.json'))
    expect(planTakeoff(survey).earth).toBeUndefined()
    const keys = planEstimate(survey).lines.map((l) => l.key)
    for (const key of ['retaining_face', 'buried_slab', 'excavation']) expect(keys).not.toContain(key)
    expect(keys.some((key) => key.startsWith('retaining_wall:'))).toBe(false)
    expect(planEstimate(survey).lines.find((l) => l.key === 'slab')!.what).toMatch(/^Lowest floor slab/)
  })
})
