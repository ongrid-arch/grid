/**
 * VEW-66: the ground in the 3D view lies at the ground, cut away over the floors that go down
 * into it.
 */
import { describe, expect, it } from 'vitest'
import { exterior, flat, room } from '../../test-support/plans'
import type { FloorPlan } from '../plan'
import { sceneGround } from '../groundPlane'
import { inPieces, multiArea } from '../polygons'

/** The flat on the ground floor, over a cellar 10 × 12 that reaches 4 m past it under the garden. */
function basementHouse(site: FloorPlan['site'] = { ground: 0 }): FloorPlan {
  const ground = flat()
  const down = (id: string, start: [number, number], end: [number, number]) => exterior(id, start, end, { floor: 'basement' })
  return {
    ...ground,
    floors: [
      { id: 'basement', name: 'Basement', level: -1 },
      { id: 'ground', name: 'Ground floor', level: 0 }
    ],
    ...(site === undefined ? {} : { site }),
    walls: [...ground.walls, down('b-s', [0, 0], [10, 0]), down('b-e', [10, 0], [10, 12]), down('b-n', [10, 12], [0, 12]), down('b-w', [0, 12], [0, 0])],
    rooms: [...ground.rooms, room('cellar', 'Cellar', ['b-s', 'b-e', 'b-n', 'b-w'], 'basement')]
  }
}

describe('the ground in 3D', () => {
  it('lies at 0 when the site states no ground, under the ground floor', () => {
    const ground = sceneGround(flat(), 10)
    expect(ground.level).toBe(0)
    expect(ground.stated).toBe(false)
    // The ground floor's slab lies in the ground, so its outline is cut out.
    expect(ground.into).toEqual(['ground'])
    expect(inPieces(ground.pieces, { x: 5, y: 4 })).toBe(false)
    expect(inPieces(ground.pieces, { x: -5, y: 4 })).toBe(true)
  })

  it('lies at the level the site states', () => {
    expect(sceneGround(basementHouse({ ground: -0.15 }), 10).level).toBe(-0.15)
    expect(sceneGround(basementHouse({ ground: -0.15 }), 10).stated).toBe(true)
  })

  it('is cut away over a basement, under the garden too, and reaches past the walls', () => {
    const ground = sceneGround(basementHouse(), 10)
    expect(ground.into).toEqual(['basement', 'ground'])
    // Over the cellar where it reaches under the garden, and under the house.
    expect(inPieces(ground.pieces, { x: 5, y: 10 })).toBe(false)
    expect(inPieces(ground.pieces, { x: 5, y: 4 })).toBe(false)
    // Round it, out to 10 m past the walls' lines.
    expect(inPieces(ground.pieces, { x: 5, y: 13 })).toBe(true)
    expect(inPieces(ground.pieces, { x: -9.9, y: 21.9 })).toBe(true)
    expect(inPieces(ground.pieces, { x: -10.1, y: 0 })).toBe(false)
    // The square less the cellar's outline, to the outside face of its walls.
    const cellar = sceneGround(basementHouse(), 10).pieces
    expect(multiArea(cellar)).toBeGreaterThan(30 * 32 - 10.5 * 12.5)
    expect(multiArea(cellar)).toBeLessThan(30 * 32 - 10 * 12)
  })

  it('cuts nothing where every floor stands over the ground, as on a plinth', () => {
    const ground = sceneGround({ ...flat(), site: { ground: -1 } }, 10)
    expect(ground.into).toEqual([])
    expect(ground.pieces).toHaveLength(1)
    expect(multiArea(ground.pieces)).toBeCloseTo(30 * 28, 6)
  })

  it('takes a ground stated over every floor as burying them all', () => {
    const ground = sceneGround(basementHouse({ ground: 3 }), 10)
    expect(ground.level).toBe(3)
    expect(ground.into).toEqual(['basement', 'ground'])
  })

  it('gives a square round the origin for a plan with no wall', () => {
    const ground = sceneGround({ ...flat(), walls: [], rooms: [], openings: [] }, 5)
    expect(ground.into).toEqual([])
    expect(multiArea(ground.pieces)).toBeCloseTo(100, 6)
  })
})
