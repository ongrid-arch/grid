import { describe, expect, it } from 'vitest'
import { buildFloorPlan } from '../floorplan'
import { openingSymbol, type SymbolLine } from '../openingSymbol'
import type { FloorPlan } from '../plan'

/** VEW-39: a sliding door's plan symbol is two panels with glass and an arrow, not two loose lines. */
function plan(thickness: number): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [{ id: 'w', start: [0, 0], end: [4, 0], thickness: thickness || 0.3, height: 2.7, kind: 'exterior', ...(thickness === 0 && { virtual: true }) }],
    rooms: [],
    openings: [{ id: 'd', wall: 'w', type: 'door', offset: 1, width: 2, sill: 0, height: 2.1, kind: 'sliding', swing: 'left' }]
  }
}

const lines = (thickness: number): SymbolLine[] => {
  const opening = buildFloorPlan(plan(thickness)).openings[0]!
  return openingSymbol(opening)!.pieces.filter((p): p is SymbolLine => p.shape === 'line')
}

describe('the sliding door symbol', () => {
  it.each([0.3, 0])('has two panels of four edges, glass down each and an arrow each (wall %s m thick)', (thickness) => {
    const all = lines(thickness)
    expect(all.filter((l) => l.part === 'leaf')).toHaveLength(8)
    expect(all.filter((l) => l.part === 'glass')).toHaveLength(2)
    expect(all.filter((l) => l.part === 'jamb')).toHaveLength(2)
    expect(all.filter((l) => l.part === 'arrow')).toHaveLength(6)
  })

  it('keeps every panel line inside the wall and its arrow head on its shaft', () => {
    const all = lines(0.3)
    for (const l of all.filter((p) => p.part !== 'jamb')) for (const p of [l.from, l.to]) expect(Math.abs(p.y)).toBeLessThan(0.15)
    const [shaft, a, b] = all.filter((l) => l.part === 'arrow').slice(0, 3)
    expect(a!.from).toEqual(shaft!.to)
    expect(b!.from).toEqual(shaft!.to)
    expect(a!.to.x).toBeCloseTo(b!.to.x, 9)
    expect(a!.to.y).toBeCloseTo(-b!.to.y, 9)
  })
})
