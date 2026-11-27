/**
 * VEW-79: in the DXF a curve's radius is a radial dimension, its centre and a point on the curve,
 * written `R 6.00`, and a curve that is not a whole circle has its chord as an aligned one.
 */
import { describe, expect, it } from 'vitest'
import { exportPlan } from '../../../export/planExport'
import { compileRoomsText } from '../../../rooms/compile'
import { parseFloorPlan } from '../../../types/floorplan'
import { dxfProblems, modelEntities, numberOf, readDxf, valueOf } from './dxf-reader'

const options = { projectId: 'p', projectName: 'Pavilion', now: new Date('2026-11-27T12:00:00Z') }

describe('curve dimensions in the DXF (VEW-79)', () => {
  const written = compileRoomsText('room pav "Pavilion" assembly circle 12 at 0,0\nroom ring "Ring" corridor band 6.1 to 9 from 0 sweep 180 at 0,0\n')
  const dxf = exportPlan(parseFloorPlan(written.plan), 'dxf', options).data as string

  it('writes each radius as a radial dimension from its centre, and the chord as an aligned one', () => {
    expect(dxfProblems(dxf)).toEqual([])
    const dims = modelEntities(dxf, 'DIMENSION')
    const radial = dims.filter((d) => d.pairs.some((p) => p.code === 100 && p.value === 'AcDbRadialDimension'))
    expect(radial.map((d) => Number(numberOf(d, 42).toFixed(2))).sort()).toEqual([6, 9])
    for (const d of radial) {
      expect(numberOf(d, 70) & 7).toBe(4)
      expect(numberOf(d, 10)).toBeCloseTo(0, 6)
      expect(numberOf(d, 20)).toBeCloseTo(0, 6)
      expect(Math.hypot(numberOf(d, 15), numberOf(d, 25))).toBeCloseTo(numberOf(d, 42), 4)
    }
    const aligned = dims.filter((d) => d.pairs.some((p) => p.code === 100 && p.value === 'AcDbAlignedDimension'))
    expect(aligned.some((d) => Math.abs(numberOf(d, 42) - 18) < 0.01)).toBe(true)
  })

  it('draws the radius text after its mark in the dimension\'s block', () => {
    const blockTexts = readDxf(dxf).blocks.flatMap((b) => b.entities.filter((e) => e.type === 'TEXT').map((e) => valueOf(e, 1)))
    expect(blockTexts).toContain('R 6.00')
    expect(blockTexts).toContain('R 9.00')
  })
})
