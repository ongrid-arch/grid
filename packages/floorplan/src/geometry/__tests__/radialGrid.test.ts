/**
 * WRT-83 (C25): a radial grid's lines as drawn: rays from inside its first ring to past its last,
 * named at their outer end; rings as arcs past its end rays, or whole circles named once; ring to
 * ring dimensions along its first ray; and the crossings columns are set out on.
 */
import { describe, expect, it } from 'vitest'
import { StructuralGridSchema, type StructuralGrid } from '../../types/floorplan'
import { gridCrossings, gridDimensions, planGrid, polarWhole } from '../structuralGrid'
import { limit } from '../tolerances'

const radial = (rays: number[], extra: Partial<StructuralGrid> = {}): StructuralGrid =>
  StructuralGridSchema.parse({ id: 'P', origin: [10, 10], x: { spacing: rays }, y: { spacing: [3] }, polar: { radius: 4 }, ...extra })
const distance = (p: { x: number; y: number }): number => Math.hypot(p.x - 10, p.y - 10)

describe('a radial grid', () => {
  it('draws its rays out past its last ring and its rings as arcs past its end rays', () => {
    const drawn = planGrid(radial([90], { turn: 0 }))
    const rays = drawn.lines.filter((line) => line.set === 'x')
    const rings = drawn.lines.filter((line) => line.set === 'y')
    expect(rays.map((ray) => ray.name)).toEqual(['1', '2'])
    expect(rays.every((ray) => ray.namedAt === 'from')).toBe(true)
    expect(distance(rays[0]!.from)).toBeCloseTo(7 + limit('gridOverrun'), 6)
    expect(distance(rays[0]!.to)).toBeCloseTo(4 - limit('gridOverrun'), 6)
    expect(rings.map((ring) => ring.name)).toEqual(['A', 'B'])
    for (const [ring, radius] of [[rings[0]!, 4], [rings[1]!, 7]] as const) {
      expect(ring.path!.every((p) => Math.abs(distance(p) - radius) < 1e-9)).toBe(true)
      expect(ring.namedAt).toBeUndefined()
      // It starts before the first ray (below the centre's east) and ends past the second.
      expect(ring.from.y).toBeLessThan(10)
      expect(ring.to.x).toBeLessThan(10)
    }
    expect(polarWhole(radial([90]))).toBe(false)
  })

  it('draws whole rings, named once, when its rays go all the way round', () => {
    const grid = radial([45, 45, 45, 45, 45, 45, 45])
    expect(polarWhole(grid)).toBe(true)
    const rings = planGrid(grid).lines.filter((line) => line.set === 'y')
    expect(rings.every((ring) => ring.namedAt === 'from' && ring.from === ring.path![0])).toBe(true)
    expect(rings[0]!.path!.length).toBeGreaterThan(360 / limit('gridArcStep'))
  })

  it('dimensions its rings along its first ray, and gives every crossing', () => {
    const grid = radial([90], { turn: 90 })
    const dims = gridDimensions(planGrid(grid))
    expect(dims.map((d) => [d.id, d.value])).toEqual([['grid:P:y:A-B', 3]])
    expect(dims[0]!.from.x).toBeCloseTo(10, 9)
    expect(gridCrossings(grid).map((c) => [c.x, c.y, Math.round(c.at.x * 1e6) / 1e6, Math.round(c.at.y * 1e6) / 1e6, c.turn])).toEqual([
      ['1', 'A', 10, 14, 90],
      ['2', 'A', 6, 10, 180],
      ['1', 'B', 10, 17, 90],
      ['2', 'B', 3, 10, 180],
    ])
  })

  it('is refused when its rays go round a full turn or more', () => {
    expect(StructuralGridSchema.safeParse({ id: 'P', origin: [0, 0], x: { spacing: [180, 180] }, y: { spacing: [] }, polar: { radius: 4 } }).success).toBe(false)
    expect(StructuralGridSchema.safeParse({ id: 'S', origin: [0, 0], x: { spacing: [180, 180] }, y: { spacing: [] } }).success).toBe(true)
  })
})
