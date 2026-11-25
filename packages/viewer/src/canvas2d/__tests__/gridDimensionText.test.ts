import { describe, expect, it } from 'vitest'
import { gridDimensions, planGrid } from '@ongrid/floorplan/geometry'
import { dimensionText } from '../labelPlacement'

describe('a grid dimension is drawn to the millimetre', () => {
  const grid = planGrid({ id: 'g', origin: [0, 0], x: { spacing: [7.425, 7.425, 7.425, 7.425] }, y: { spacing: [6, 6] } } as never)
  const dims = gridDimensions(grid)

  it('reads 7.425, not 7.43', () => {
    const first = dims.find((d) => d.id.endsWith(':x:1-2'))!
    expect(dimensionText(first.value, first.kind)).toBe('7.425')
  })

  it('adds up: four spacings and the overall', () => {
    const parts = dims.filter((d) => d.id.includes(':x:') && !d.id.endsWith('overall'))
    const overall = dims.find((d) => d.id.endsWith(':x:overall'))!
    const sum = parts.reduce((s, d) => s + Math.round(Number(dimensionText(d.value, d.kind)) * 1000), 0)
    expect(parts).toHaveLength(4)
    expect(sum).toBe(Math.round(Number(dimensionText(overall.value, overall.kind)) * 1000))
  })

  it('leaves other dimensions at the centimetre', () => {
    expect(dimensionText(7.425, 'wall')).toBe('7.43')
  })
})
