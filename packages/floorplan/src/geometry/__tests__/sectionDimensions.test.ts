/**
 * VEW-89: a section's dimension chains: up its left side the detail (floor, sill, head, clear
 * height), floor to floor and the overall height to its top; along the cut the walls' faces and
 * the overall length.
 */
import { describe, expect, it } from 'vitest'
import { twoFloorHouse } from '../../test-support/plans'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planSection } from '../section'
import { sectionChains, type SectionChain } from '../sectionDimensions'

/** Across the two-floor house at x = 6.5, from the street to the garden: through the kitchen window and the study. */
const house = () => planSection(twoFloorHouse(), { from: { x: 6.5, y: -2 }, to: { x: 6.5, y: 10 }, toward: 'left' })

const chain = (chains: readonly SectionChain[], kind: SectionChain['kind']) => chains.find((c) => c.kind === kind)
const values = (c: SectionChain | undefined) => c?.dimensions.map((d) => Number(d.value.toFixed(3)))
const ends = (c: SectionChain | undefined) => c?.dimensions.map((d) => `${d.ends[0].kind}:${d.ends[0].id}-${d.ends[1].kind}:${d.ends[1].id}`)
const sum = (c: SectionChain | undefined) => Number((c?.dimensions.reduce((s, d) => s + d.value, 0) ?? 0).toFixed(3))

/** One room 8 × 6 m with 2.4 m walls, on a floor that states its roof (or a parapet), and a window in its south wall. */
function box(floor: Record<string, unknown>): FloorPlan {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.3, kind: 'exterior', height: 2.4 })
  return parseFloorPlan({
    floors: [{ id: 'ground', name: 'Loft', level: 0, ...floor }],
    walls: [wall('s', [0, 0], [8, 0]), wall('e', [8, 0], [8, 6]), wall('n', [8, 6], [0, 6]), wall('w', [0, 6], [0, 0])],
    rooms: [{ id: 'r', name: 'Loft room', boundary: ['s', 'e', 'n', 'w'], use: 'bedroom' }],
    openings: [{ id: 'win', wall: 's', type: 'window', offset: 3.5, width: 1, sill: 1, height: 1.2 }]
  })
}

describe('the chains of a section through the two-floor house', () => {
  const section = house()
  const chains = sectionChains(section)

  it('gives the window the line cuts, with its sill and head levels', () => {
    expect(section.openings).toEqual([{ id: 'win_k', floor: 'ground', type: 'window', from: 1.9, to: 2.1, sill: 0.9, head: 2.1 }])
  })

  it('draws three vertical chains on the left and two along the cut, nearest first', () => {
    expect(chains.map((c) => `${c.axis} ${c.kind}`)).toEqual(['vertical detail', 'vertical levels', 'vertical overall', 'horizontal walls', 'horizontal length'])
    for (const c of chains.filter((c) => c.axis === 'vertical')) for (const d of c.dimensions) expect([d.from.x, d.to.x, d.side]).toEqual([section.building!.from, section.building!.from, 'left'])
    for (const c of chains.filter((c) => c.axis === 'horizontal')) for (const d of c.dimensions) expect([d.from.y, d.to.y, d.side]).toEqual([section.bounds.min.y, section.bounds.min.y, 'bottom'])
  })

  it('runs the detail through the floor, the sill, the head and each floor\'s clear height', () => {
    const detail = chain(chains, 'detail')
    expect(ends(detail)).toEqual(['floor:ground-sill:win_k', 'sill:win_k-head:win_k', 'head:win_k-ceiling:kitchen', 'ceiling:kitchen-floor:first', 'floor:first-ceiling:study', 'ceiling:study-roof:first'])
    expect(values(detail)).toEqual([0.9, 1.2, 0.6, 0.25, 2.7, 0.25])
  })

  it('gives floor to floor and the overall height, each adding up to the next', () => {
    expect(values(chain(chains, 'levels'))).toEqual([2.95, 2.95])
    expect(values(chain(chains, 'overall'))).toEqual([5.9])
    expect(sum(chain(chains, 'detail'))).toBe(5.9)
    expect(sum(chain(chains, 'levels'))).toBe(5.9)
  })

  it('dimensions the walls cut along the line, and the overall length', () => {
    expect(values(chain(chains, 'walls'))).toEqual([0.2, 3.85, 0.1, 3.85, 0.2])
    expect(ends(chain(chains, 'length'))).toEqual(['face:s2-face:n1'])
    expect(values(chain(chains, 'length'))).toEqual([8.2])
  })
})

describe('the top of a section', () => {
  it('is the ridge of a pitched roof', () => {
    const chains = sectionChains(planSection(box({ roof: { shape: 'gable', eaves: 2.4, ridge: 4.4, ridgeRuns: 'east-west' } }), { from: { x: 4, y: -2 }, to: { x: 4, y: 8 }, toward: 'left' }))
    const overall = chain(chains, 'overall')!
    expect(overall.dimensions).toHaveLength(1)
    expect(overall.dimensions[0]!.ends[1].kind).toBe('ridge')
    expect(overall.dimensions[0]!.value).toBeGreaterThan(4.4)
    // One floor standing on the ground: floor to floor says no more than the overall, so it is left out.
    expect(chain(chains, 'levels')).toBeUndefined()
    expect(ends(chain(chains, 'detail'))!.slice(0, 2)).toEqual(['floor:ground-sill:win', 'sill:win-head:win'])
    expect(values(chain(chains, 'detail'))!.slice(0, 2)).toEqual([1, 1.2])
  })

  it('is the parapet of a flat roof that has one', () => {
    const chains = sectionChains(planSection(box({ parapet: 0.9 }), { from: { x: 4, y: -2 }, to: { x: 4, y: 8 }, toward: 'left' }))
    expect(chain(chains, 'overall')!.dimensions[0]!.ends[1]).toEqual({ kind: 'parapet', id: 'ground' })
  })
})

it('gives no chains for a line that cuts nothing of the building', () => {
  expect(sectionChains(planSection(twoFloorHouse(), { from: { x: 20, y: -2 }, to: { x: 20, y: 10 }, toward: 'left' }))).toEqual([])
})
