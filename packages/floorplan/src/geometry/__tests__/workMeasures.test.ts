/**
 * ARE-79: the measures of the work, on a house of two rooms with a new room built out of its
 * north side, on a plot with a boundary.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { deepFreeze } from '../kept'
import { workMeasures } from '../workMeasures'

type Phase = 'existing' | 'new'
const wall = (id: string, start: [number, number], end: [number, number], phase: Phase, kind: 'exterior' | 'interior' = 'exterior') =>
  ({ id, start, end, thickness: kind === 'exterior' ? 0.3 : 0.1, height: 2.5, kind, phase })

/** A house of two rooms, 8 x 4 m on its walls' centre lines, and a new room 3 m deep built on its north side. */
function house(roof?: Record<string, unknown>, phased = true): FloorPlan {
  const walls = [
    wall('s', [0, 0], [8, 0], 'existing'),
    wall('e', [8, 0], [8, 4], 'existing'),
    wall('n', [8, 4], [0, 4], 'existing'),
    wall('w', [0, 4], [0, 0], 'existing'),
    wall('p', [4, 0], [4, 4], 'existing', 'interior'),
    wall('w2', [0, 7], [0, 4], 'new'),
    wall('n2', [8, 7], [0, 7], 'new'),
    wall('e2', [8, 4], [8, 7], 'new'),
  ]
  const rooms = [
    { id: 'a', name: 'Living', use: 'living', boundary: ['s', 'p', 'n', 'w'], phase: 'existing' },
    { id: 'b', name: 'Kitchen', use: 'kitchen', boundary: ['s', 'e', 'n', 'p'], phase: 'existing' },
    { id: 'c', name: 'Garden room', use: 'living', boundary: ['n', 'e2', 'n2', 'w2'], phase: 'new' },
  ]
  const plain = <T extends { phase?: string }>(part: T): T => {
    const own = { ...part }
    delete own.phase
    return own
  }
  return parseFloorPlan({
    version: '1',
    units: 'm',
    north: 0,
    walls: phased ? walls : walls.slice(0, 5).map(plain),
    rooms: phased ? rooms : rooms.slice(0, 2).map(plain),
    openings: [],
    site: { boundary: [[-5, -5], [15, -5], [15, 25], [-5, 25]] },
    ...(roof === undefined ? {} : { floors: [{ id: 'ground', name: 'Ground', level: 0, roof }] }),
  })
}

describe('the measures of the work (ARE-79)', () => {
  const plan = deepFreeze(house())
  const text = JSON.stringify(plan)
  const work = workMeasures(plan)

  it('finds the new parts', () => {
    expect(work.phased).toBe(true)
    expect(work.newRooms).toEqual(['c'])
    expect(work.newWalls.length).toBeGreaterThan(0)
    expect(JSON.stringify(plan)).toBe(text)
  })

  it('measures how far the building reaches past its old outline, on its one side', () => {
    expect(work.depths).toHaveLength(1)
    const [depth] = work.depths
    expect(depth!.faces).toBe('north')
    // The outside face moves from y = 4.15 to y = 7.15, across the house's 8.3 m.
    expect(depth!.depth).toBeCloseTo(3, 6)
    expect(depth!.across).toBeCloseTo(8.3, 6)
    expect(work.footprint.added).toBeCloseTo(3 * 8.3, 6)
  })

  it('gives the heights of the new walls above the ground, and the volume of the new room', () => {
    expect(work.newWalls).toEqual(['w2', 'n2', 'e2'])
    expect(work.heights.wallsLowest).toBeCloseTo(2.5, 6)
    expect(work.heights.wallsHighest).toBeCloseTo(2.5, 6)
    expect(work.heights.highest).toBeCloseTo(2.5, 6)
    expect(work.heights.underRoof).toBe(false)
    expect(work.rooms.map((r) => r.room)).toEqual(['c'])
    expect(work.rooms[0]!.area).toBeCloseTo(7.7 * 2.7, 6)
    expect(work.volume).toBeCloseTo(7.7 * 2.7 * 2.5, 6)
  })

  it('gives the plot left before and after, and the distances to the boundary', () => {
    expect(work.plot!.area).toBeCloseTo(600, 6)
    expect(work.plot!.before - work.plot!.after).toBeCloseTo(work.footprint.added, 6)
    const north = work.edges.find((e) => e.faces === 'north')!
    expect(north.added).toBeCloseTo(25 - 7.15, 6)
    expect(north.after).toBeCloseTo(25 - 7.15, 6)
    expect(north.before).toBeCloseTo(25 - 4.15, 6)
    const south = work.edges.find((e) => e.faces === 'south')!
    expect(south.before).toBeCloseTo(4.85, 6)
    expect(south.after).toBeCloseTo(4.85, 6)
    expect(south.added).toBeCloseTo(9.15, 6)
  })

  it('reads the new parts under a pitched roof: to its underside, the volume under it', () => {
    const roofed = workMeasures(house({ shape: 'gable', eaves: 2.5, ridge: 4, ridgeRuns: 'east-west' }))
    expect(roofed.heights.underRoof).toBe(true)
    expect(roofed.heights.highest!).toBeGreaterThan(2.5)
    expect(roofed.heights.highest!).toBeLessThanOrEqual(4 + 1e-9)
    const room = roofed.rooms[0]!
    expect(room.underRoof).toBe(true)
    expect(room.volume).toBeGreaterThan(room.area * 2.5 - 1e-6)
    expect(room.volume).toBeLessThan(room.area * 4)
  })

  it('gives nothing on a plan whose parts carry no phases', () => {
    const plain = workMeasures(house(undefined, false))
    expect(plain.phased).toBe(false)
    expect(plain.depths).toEqual([])
    expect(plain.volume).toBe(0)
  })
})
