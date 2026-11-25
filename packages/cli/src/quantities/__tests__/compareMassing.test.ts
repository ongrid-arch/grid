import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { comparePlans } from '../compare'
import { surveyPlan } from '../survey'

/**
 * MSG-27: options compared by their massing and their site. Two options of massing alone, one
 * block and then two, have no wall, opening or room to tell them apart: they are never the same
 * building. The plot and the blocks are invented here.
 */
const box = (x: number, w: number): number[][] => [[x, 10], [x + w, 10], [x + w, 24], [x, 24]]

function option(blocks: Array<{ id: string; x: number; w: number; homes: number }>, trees: number): FloorPlan {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    floors: blocks.flatMap((b) => [0, 1].map((level) => ({ id: `${b.id}-${level}`, name: `${b.id} ${level}`, level, height: 3, building: 'home', outline: box(b.x, b.w), homes: b.homes }))),
    ...(blocks.length > 1 ? { buildings: blocks.map((b) => ({ id: b.id, name: b.id, floors: [`${b.id}-0`, `${b.id}-1`] })) } : {}),
    site: { boundary: [[0, 0], [60, 0], [60, 40], [0, 40]], things: Array.from({ length: trees }, (_, i) => ({ id: `t${i + 1}`, kind: 'tree', at: [5 + i * 10, 5] })) }
  })
}

describe('grid_compare on massing', () => {
  it('never calls two new blocks the same building as one, and says what differs side by side', () => {
    const a = option([{ id: 'block', x: 10, w: 30, homes: 6 }], 3)
    const b = option([{ id: 'west', x: 10, w: 14, homes: 4 }, { id: 'east', x: 30, w: 14, homes: 4 }], 2)
    const compared = comparePlans(surveyPlan(a), surveyPlan(b), ['A', 'B'])
    expect(compared.likeness).toBeNull()
    expect(compared.verdict).not.toContain('same building')
    expect(compared.massing.lines).toEqual(expect.arrayContaining(['Building added: "west", floors "west-0" and "west-1"', 'Site tree "t3" removed']))
    expect(compared.verdict).toContain('Side by side: gross external area 840.00 → 784.00 m²')
    expect(compared.verdict).toContain('homes 12 → 16')
  })

  it('still calls the same massing the same building', () => {
    const a = option([{ id: 'block', x: 10, w: 30, homes: 6 }], 3)
    const compared = comparePlans(surveyPlan(a), surveyPlan(a), ['A', 'B'])
    expect(compared.likeness).toBe('same')
    expect(compared.massing.lines).toEqual([])
  })
})
