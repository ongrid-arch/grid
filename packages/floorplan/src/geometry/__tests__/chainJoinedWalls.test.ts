import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { buildFloorPlan } from '../floorplan'
import { outsideDimensions } from '../dimensions'

/**
 * VEW-54: walls that meet a facade side by side and touch (an extension built against an old
 * wall) are one wall in the walls chain, not two pieces each dimensioned on its own.
 */
const wall = (id: string, start: [number, number], end: [number, number], thickness: number, kind: 'exterior' | 'interior') => ({ id, start, end, thickness, height: 2.7, kind })

const flat = (partitions: ReturnType<typeof wall>[]): FloorPlan =>
  parseFloorPlan({
    version: '1',
    units: 'm',
    walls: [
      wall('w1', [0, 0], [8, 0], 0.25, 'exterior'),
      wall('w2', [8, 0], [8, 5], 0.25, 'exterior'),
      wall('w3', [8, 5], [0, 5], 0.25, 'exterior'),
      wall('w4', [0, 5], [0, 0], 0.25, 'exterior'),
      ...partitions
    ],
    rooms: [
      { id: 'a', name: 'West', boundary: ['w1', 'p1', 'w3', 'w4'] },
      { id: 'b', name: 'East', boundary: ['w1', 'p2', 'w3', 'w2'] }
    ],
    openings: []
  })

/** The lengths of the walls chain along the south side, in metres. */
function southWalls(plan: FloorPlan): number[] {
  return outsideDimensions(buildFloorPlan(plan))
    .filter((d) => d.kind === 'wall' && d.side === 'bottom')
    .map((d) => Math.round(Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) * 1000) / 1000)
    .sort((a, b) => a - b)
}

describe('VEW-54: touching walls on a facade are one wall in the chain', () => {
  it('two 0.15 m walls side by side are one 0.3 m wall', () => {
    const lengths = southWalls(flat([wall('p1', [5, 0], [5, 5], 0.15, 'interior'), wall('p2', [5.15, 0], [5.15, 5], 0.15, 'interior')]))
    expect(lengths).toContain(0.3)
    expect(lengths.filter((l) => l === 0.15)).toHaveLength(0)
  })

  it('walls with a gap between them stay two', () => {
    const lengths = southWalls(flat([wall('p1', [5, 0], [5, 5], 0.15, 'interior'), wall('p2', [6, 0], [6, 5], 0.15, 'interior')]))
    expect(lengths.filter((l) => l === 0.15)).toHaveLength(2)
  })
})
