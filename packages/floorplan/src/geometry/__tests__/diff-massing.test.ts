/**
 * MSG-27: two versions compared by their massing and their site. An option with other blocks is
 * never the same building; an outline moved and grown, homes changed, a tree cut down and a
 * second building are change lines, with the figures side by side.
 *
 * The plot and the blocks are invented here: a 60 × 40 m plot, a 30 × 14 m block of three
 * storeys 3 m high, then two 14 × 14 m blocks.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compareBuildings } from '../diff'
import { compareMassing } from '../diff/massing'
import { english } from '../../messages/say'

const PLOT = [[0, 0], [60, 0], [60, 40], [0, 40]]
const box = (x: number, y: number, w: number, d: number): number[][] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]

function optionA(extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    floors: [0, 1, 2].map((level) => ({ id: `f${level}`, name: `Floor ${level}`, level, height: 3, building: 'home', outline: box(10, 10, 30, 14), homes: 4 })),
    site: {
      boundary: PLOT,
      streets: [1],
      things: [
        { id: 't1', kind: 'tree', at: [5, 5] },
        { id: 't2', kind: 'tree', at: [50, 5] },
        { id: 'cafe-path', kind: 'path', points: [[0, 30], [20, 30]], width: 2 }
      ]
    },
    ...extra
  })
}

/** Option B: the block replaced by two, each its own building, more homes; a tree cut down. */
function optionB(): FloorPlan {
  const block = (id: string, x: number) => [0, 1, 2].map((level) => ({ id: `${id}-${level}`, name: `${id} ${level}`, level, height: 3, building: 'home', outline: box(x, 10, 14, 14), homes: 3 }))
  return parseFloorPlan({
    version: '1',
    units: 'm',
    floors: [...block('west', 10), ...block('east', 30)],
    buildings: [
      { id: 'west', name: 'West block', floors: ['west-0', 'west-1', 'west-2'] },
      { id: 'east', name: 'East block', floors: ['east-0', 'east-1', 'east-2'] }
    ],
    site: { boundary: PLOT, streets: [1], things: [{ id: 't1', kind: 'tree', at: [5, 5] }, { id: 'cafe-path', kind: 'path', points: [[0, 30], [20, 30]], width: 2 }] }
  })
}

describe('the massing and the site compared', () => {
  it('never calls an option with two new blocks the same building', () => {
    const compared = compareBuildings(optionA(), optionB())
    expect(compared.sameBuilding).toBe(false)
    const lines = compared.changes.map((c) => c.text)
    expect(lines).toEqual(expect.arrayContaining([
      'Building added: "West block", floors "west-0", "west-1" and "west-2"',
      'Building added: "East block", floors "east-0", "east-1" and "east-2"',
      'Site tree "t2" removed'
    ]))
    expect(lines.some((line) => line.startsWith('Floor added:'))).toBe(true)
    const { figures } = compared.massing
    expect(figures.grossExternal).toEqual({ before: 1260, after: 1176 })
    expect(figures.homes).toEqual({ before: 12, after: 18 })
    expect(figures.plot).toEqual({ before: 2400, after: 2400 })
    expect(figures.far.before).toBeCloseTo(0.525, 6)
    expect(figures.far.after).toBeCloseTo(0.49, 6)
    expect(compared.verdict).toContain('Side by side: gross external area 1260.00 → 1176.00 m²')
    expect(compared.verdict).toContain('homes 12 → 18')
    expect(compared.verdict).toContain('gross external area to the plot (FAR) 0.53 → 0.49')
  })

  it('says an outline that moved and grew, and homes that changed, floor by floor', () => {
    const before = optionA()
    const after = optionA({
      floors: [0, 1, 2].map((level) => ({ id: `f${level}`, name: `Floor ${level}`, level, height: 3, building: 'home', outline: level === 0 ? box(6, 10, 32, 14) : box(10, 10, 30, 14), homes: level === 2 ? 5 : 4 }))
    })
    const lines = compareMassing(before, after).lines.map((l) => english(l.said))
    expect(lines).toEqual(['Floor "Floor 0": outline 420.00 → 448.00 m², its middle moved 3.00 m west on the drawing', 'Floor "Floor 2": homes 4 → 5'])
    const compared = compareBuildings(before, after)
    expect(compared.sameBuilding).toBe(false)
    expect(compared.verdict).toContain('plot coverage 17.5 → 19.8 %')
  })

  it('says a site thing that moved, and a boundary that changed', () => {
    const before = optionA()
    const after = optionA({ site: { boundary: box(0, 0, 60, 45), streets: [1], things: [{ id: 't1', kind: 'tree', at: [9, 5] }, { id: 't2', kind: 'tree', at: [50, 5] }, { id: 'cafe-path', kind: 'path', points: [[0, 30], [20, 30]], width: 2 }] } })
    expect(compareMassing(before, after).lines.map((l) => english(l.said))).toEqual(['Site boundary 2400.00 → 2700.00 m²', 'Site tree "t1" moved 4.00 m east on the drawing'])
  })

  it('finds no change when the massing and the site are the same', () => {
    const compared = compareBuildings(optionA(), optionA())
    expect(compared.massing.lines).toEqual([])
    expect(compared.massing.sideBySide).toBeNull()
    expect(compared.sameBuilding).toBe(true)
  })
})
