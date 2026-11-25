/**
 * VEW-37: the sheet of plans side by side (grid_compare's picture) draws every floor of each plan,
 * stacked in its column at one scale, and keeps its titles above the drawings.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { sheetView } from '../views'

function box(floor: string | undefined): FloorPlan['walls'] {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id: `${floor ?? 'g'}-${id}`, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' as const, ...(floor ? { floor } : {}) })
  return [wall('s', [0, 0], [6, 0]), wall('e', [6, 0], [6, 4]), wall('n', [6, 4], [0, 4]), wall('w', [0, 4], [0, 0])]
}

function plan(floors: string[]): FloorPlan {
  const many = floors.length > 1
  return {
    version: '1',
    units: 'm',
    ...(many ? { floors: floors.map((id, level) => ({ id, name: id, level })) } : {}),
    walls: floors.flatMap((id) => box(many ? id : undefined)),
    rooms: floors.map((id) => ({ id: `r-${id}`, name: `Room ${id}`, use: 'living', boundary: ['s', 'e', 'n', 'w'].map((w) => `${many ? id : 'g'}-${w}`), ...(many ? { floor: id } : {}) })),
    openings: []
  } as FloorPlan
}

describe('the sheet of plans side by side', () => {
  it('draws every floor of an option, stacked, at the scale of the others', async () => {
    const villa = plan(['ground'])
    const house = plan(['ground', 'upper'])
    const one = await sheetView([{ plan: villa, title: 'Villa' }, { plan: plan(['ground']), title: 'Other' }], 'working')
    const both = await sheetView([{ plan: villa, title: 'Villa' }, { plan: house, title: 'House' }], 'working')
    // Two floors stand one over the other: the sheet is taller, and the scale is the one every column has.
    expect(both.height).toBeGreaterThan(one.height * 1.6)
    expect(both.pxPerMetre).toBeCloseTo(one.pxPerMetre, 5)
  })

  it('draws the one floor asked for, as before', async () => {
    const house = plan(['ground', 'upper'])
    const asked = await sheetView([{ plan: house, title: 'House', floor: 'upper' }, { plan: plan(['ground']), title: 'Villa' }], 'working')
    const plain = await sheetView([{ plan: plan(['ground']), title: 'House' }, { plan: plan(['ground']), title: 'Villa' }], 'working')
    expect(asked.height).toBe(plain.height)
  })
})
