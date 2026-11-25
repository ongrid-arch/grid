import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../../types/floorplan'
import type { Pair, Polygon } from 'polygon-clipping'
import { ringArea, union } from '../../polygons'
import { buildFloorPlan } from '../../floorplan'
import { DXF_LAYERS, toDxf } from '../dxf'
import { dxfProblems, worldShapes } from './dxf-reader'

/**
 * VEW-54: touching walls on one layer are one outline in the DXF, as a drafter draws them: no
 * diagonal line across a corner or a junction, and a run that closes round a courtyard is an
 * outline with a hole.
 */
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../fixtures/two-bed-flat.json'), 'utf8')))

/** Every edge of every wall outline, as a key that does not depend on its direction. */
function edges(dxf: string, layer: string): string[] {
  const keys: string[] = []
  for (const shape of worldShapes(dxf)) {
    if (shape.layer !== layer || shape.type !== 'LWPOLYLINE') continue
    const p = shape.points
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!
      const b = p[(i + 1) % p.length]!
      const key = (v: { x: number; y: number }): string => `${v.x.toFixed(3)},${v.y.toFixed(3)}`
      keys.push([key(a), key(b)].sort().join('>'))
    }
  }
  return keys
}

describe('VEW-54 the DXF joins wall outlines per run', () => {
  const plan = flat()
  const dxf = toDxf(buildFloorPlan(plan))

  it('is a file that holds together', () => {
    expect(dxfProblems(dxf)).toEqual([])
  })

  it('has no edge of a wall outline drawn twice (no mitre line)', () => {
    for (const layer of [DXF_LAYERS.wallExterior, DXF_LAYERS.wallInterior]) {
      const keys = edges(dxf, layer)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
    }
  })

  it('has fewer outlines than wall pieces, and the same footprint', () => {
    const drawing = buildFloorPlan(plan)
    const solid = drawing.walls.filter((w) => !w.virtual && w.exposure === 'exterior')
    const layer = worldShapes(dxf).filter((s) => s.type === 'LWPOLYLINE' && s.layer === DXF_LAYERS.wallExterior)
    expect(layer.length).toBeLessThan(solid.reduce((n, w) => n + w.slices.length, 0))
    const asGeom = (rings: readonly (readonly { x: number; y: number }[])[]): Polygon[] => rings.map((r) => [r.map((p): Pair => [p.x, p.y])])
    const before = union(asGeom(solid.flatMap((w) => w.slices)))
    const after = union(asGeom(layer.map((s) => s.points)))
    const area = (m: Polygon[]): number => m.reduce((n, p) => n + ringArea(p[0]!) - p.slice(1).reduce((h, r) => h + ringArea(r), 0), 0)
    expect(area(after)).toBeCloseTo(area(before), 4)
  })
})
