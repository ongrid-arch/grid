/**
 * CNT-60: the site in 3D: the neighbours, fences, paths, paving, trees and pools as blocks on the
 * ground, the ground cut to the plot and over the pools, and a party wall drawn as a cut.
 */
import { describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import type { FloorPlan } from '../plan'
import { siteScene, poolOutlines } from '../siteScene'
import { sceneGround } from '../groundPlane'
import { buildScene, partyWall } from '../scene3d'
import { inPieces, multiArea } from '../polygons'
import { limit, tolerance } from '../tolerances'

const POOL: [number, number][] = [[12, 0], [16, 0], [16, 3], [12, 3]]

function sited(site: NonNullable<FloorPlan['site']>, context?: FloorPlan['context'], floors?: FloorPlan['floors']): FloorPlan {
  return { ...flat(), site, ...(context === undefined ? {} : { context }), ...(floors === undefined ? {} : { floors }) }
}

const blocksOf = (plan: FloorPlan, id: string) => siteScene(plan).blocks.filter((b) => b.id === id)

describe('the site in 3D', () => {
  it('stands a fence its stated height from the ground, and one with none at the drawn height', () => {
    const plan = sited({
      ground: -0.15,
      things: [
        { id: 'f1', kind: 'fence', points: [[-2, -2], [12, -2]], height: 1.8 },
        { id: 'f2', kind: 'fence', points: [[-2, -2], [-2, 10]] }
      ]
    })
    const [tall] = blocksOf(plan, 'f1')
    expect(tall!.kind).toBe('fence')
    expect(tall!.bottom).toBeCloseTo(-0.15)
    expect(tall!.top).toBeCloseTo(1.65)
    expect(blocksOf(plan, 'f2')[0]!.top - blocksOf(plan, 'f2')[0]!.bottom).toBeCloseTo(limit('fenceDrawnHeight'))
  })

  it('sinks a pool into the ground: its water below the edge, and the ground cut away over it', () => {
    const plan = sited({ ground: 0, things: [{ id: 'pool', kind: 'pool', points: POOL }] })
    const [water] = blocksOf(plan, 'pool')
    expect(water!.kind).toBe('water')
    expect(water!.top).toBeCloseTo(-limit('poolWaterBelowEdge'))
    expect(water!.bottom).toBeCloseTo(-limit('poolDrawnDepth'))
    expect(poolOutlines(plan)).toHaveLength(1)
    const ground = sceneGround(plan, 10)
    expect(inPieces(ground.pieces, { x: 14, y: 1.5 })).toBe(false)
    expect(inPieces(ground.pieces, { x: 18, y: 1.5 })).toBe(true)
  })

  it('cuts the ground to the plot when the site states one, else lays the square round the building', () => {
    const plot = sited({ boundary: [[-5, -5], [15, -5], [15, 13], [-5, 13]] })
    // The ground floor's own slab goes down into the ground and cuts both the same.
    const square = multiArea(sceneGround(flat(), 10).pieces)
    const cut = 30 * 28 - square
    expect(cut).toBeGreaterThan(0)
    expect(multiArea(sceneGround(plot, 40).pieces)).toBeCloseTo(20 * 18 - cut)
    expect(inPieces(sceneGround(plot, 40).pieces, { x: 20, y: 0 })).toBe(false)
    expect(sceneGround(plot, 40).plot).toBe(true)
    expect(sceneGround(flat(), 10).plot).toBeUndefined()
  })

  it('stands a neighbour on the ground, and one on a floor 4 m up at that floor', () => {
    const floors = [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'deck', name: 'Deck', level: 1, elevation: 4 }]
    const plan = sited(
      { ground: -0.3 },
      [
        { id: 'next-door', name: 'No. 12', points: [[11, 0], [20, 0], [20, 8], [11, 8]], height: 9 },
        { id: 'platform', points: [[-6, 0], [-1, 0], [-1, 3], [-6, 3]], height: 0.3, floor: 'deck' },
        { id: 'outline', points: [[-6, 10], [-1, 10], [-1, 12]] }
      ],
      floors
    )
    const [house] = blocksOf(plan, 'next-door')
    expect(house!.kind).toBe('neighbour')
    expect(house!.bottom).toBeCloseTo(-0.3)
    expect(house!.top).toBeCloseTo(8.7)
    const [platform] = blocksOf(plan, 'platform')
    expect(platform!.bottom).toBeCloseTo(4)
    expect(platform!.top).toBeCloseTo(4.3)
    // No height: its footprint on the ground.
    expect(blocksOf(plan, 'outline')[0]!.top - blocksOf(plan, 'outline')[0]!.bottom).toBeCloseTo(tolerance('siteLift'))
  })

  it('draws a tree as a trunk up to its crown and a crown its canopy across', () => {
    const plan = sited({ things: [{ id: 'oak', kind: 'tree', at: [14, 10], height: 10, canopy: 6 }] })
    const [trunk, crown] = blocksOf(plan, 'oak')
    expect(trunk!.kind).toBe('trunk')
    expect(crown!.kind).toBe('crown')
    expect(trunk!.top).toBeCloseTo(10 * tolerance('treeCrownBase'))
    expect(crown!.bottom).toBeCloseTo(trunk!.top)
    expect(crown!.top).toBeCloseTo(10)
    const xs = crown!.outline.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 1)
  })

  it('lays paving and a path on the ground, the path its width across', () => {
    const plan = sited({
      things: [
        { id: 'terrace', kind: 'paving', points: [[0, -4], [10, -4], [10, 0], [0, 0]] },
        { id: 'walk', kind: 'path', points: [[2, -10], [2, -4]], width: 1.2 }
      ]
    })
    const [terrace] = blocksOf(plan, 'terrace')
    expect(terrace!.top - terrace!.bottom).toBeCloseTo(tolerance('siteLift'))
    const [walk] = blocksOf(plan, 'walk')
    const xs = walk!.outline.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.2)
  })

  it('lifts a thing to the ground at its middle on a slope', () => {
    const plan = sited({ ground: 0, fall: { slope: 10, toward: 'south' }, things: [{ id: 'low', kind: 'paving', points: [[0, -20], [4, -20], [4, -16], [0, -16]] }] })
    const [low] = blocksOf(plan, 'low')
    // 10 % falling south, 22 m south of the building's middle (y 4) is 2.2 m down.
    expect(low!.bottom).toBeCloseTo(-2.2, 1)
  })

  it('gives every block a counter-clockwise outline, and a plan with no site none', () => {
    expect(siteScene(flat()).blocks).toEqual([])
    const plan = sited({ things: [{ id: 'clockwise', kind: 'paving', points: [[0, 0], [0, -3], [3, -3], [3, 0]] }] })
    const ring = siteScene(plan).blocks[0]!.outline
    let twice = 0
    for (let i = 0; i < ring.length; i++) twice += ring[i]!.x * ring[(i + 1) % ring.length]!.y - ring[(i + 1) % ring.length]!.x * ring[i]!.y
    expect(twice).toBeGreaterThan(0)
  })
})

describe('a party wall in 3D', () => {
  it('is drawn as a cut: a separating wall, or one with a neighbour beyond it', () => {
    expect(partyWall({ kind: 'separating' })).toBe(true)
    expect(partyWall({ kind: 'exterior', beyond: 'neighbour' })).toBe(true)
    expect(partyWall({ kind: 'exterior' })).toBe(false)
    const plan = flat()
    const party: FloorPlan = { ...plan, walls: plan.walls.map((w) => (w.id === 'w1' || w.id === 'w2' ? { ...w, kind: 'separating' as const, beyond: 'neighbour' as const } : w)) }
    const walls = buildScene(party).walls
    expect(walls.filter((w) => w.cut === true).map((w) => w.id).sort()).toEqual(['w1', 'w2'])
    expect(buildScene(plan).walls.some((w) => w.cut === true)).toBe(false)
  })
})
