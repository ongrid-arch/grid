/**
 * BRF-5: the sun table's geometry. A window wall's way comes from `planFacing`; the window area
 * is each hole's width by height; the depth from a window wall is the farthest point of the
 * room's floor, square to the wall's inside face, so an L-shaped room is as deep as its far leg.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { planSunTable } from '../sun'

/** An L-shaped room 6 m by 6 m with a 3 m by 3 m bite out of its north-east corner. */
function lShaped(extra: Record<string, unknown> = {}) {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7 })
  return parseFloorPlan({
    walls: [
      wall('a', [0, 0], [6, 0]),
      wall('b', [6, 0], [6, 3]),
      wall('c', [6, 3], [3, 3]),
      wall('d', [3, 3], [3, 6]),
      wall('e', [3, 6], [0, 6]),
      wall('f', [0, 6], [0, 0]),
    ],
    rooms: [{ id: 'l', name: 'L room', boundary: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    openings: [
      { id: 'south-1', wall: 'a', type: 'window', offset: 1, width: 1.2, height: 1.5, sill: 0.9 },
      { id: 'south-2', wall: 'a', type: 'window', offset: 4, width: 1, height: 1, sill: 0.9 },
      { id: 'leg', wall: 'd', type: 'window', offset: 1, width: 1, height: 1.2, sill: 0.9 },
      { id: 'entry', wall: 'e', type: 'door', offset: 1, width: 0.9, height: 2.1 },
    ],
    ...extra,
  })
}

describe('the sun table (planSunTable)', () => {
  it('groups the windows by window wall, adds their areas and sets them against the net floor area', () => {
    const [room] = planSunTable(lShaped()).rooms
    expect(room!.floorArea).toBeCloseTo(5.8 * 2.8 + 2.8 * 3, 9)
    expect(room!.windowArea).toBeCloseTo(1.8 + 1 + 1.2, 9)
    expect(room!.windowToFloor).toBeCloseTo(4 / 24.64, 9)
    // Clockwise from north: the leg's east wall (90°), then the south wall (180°). The door is no window.
    expect(room!.walls.map((w) => [w.wall, w.faces, w.bearing, w.windows.map((o) => o.id)])).toEqual([
      ['d', 'east', 90, ['leg']],
      ['a', 'south', 180, ['south-1', 'south-2']],
    ])
  })

  it('measures the depth from each window wall square to its inside face, to the farthest point of the floor', () => {
    const [room] = planSunTable(lShaped()).rooms
    const depth = new Map(room!.walls.map((w) => [w.wall, w.depth]))
    // From the south wall's face at y 0.1 to the far end of the west leg at y 5.9.
    expect(depth.get('a')).toBeCloseTo(5.8, 9)
    // From the leg's east face at x 2.9 back to the west wall's face at x 0.1.
    expect(depth.get('d')).toBeCloseTo(2.8, 9)
  })

  it('turns the ways by the stated north, and keeps the depth and the areas', () => {
    const [plain] = planSunTable(lShaped()).rooms
    const [turned] = planSunTable(lShaped({ north: 90 })).rooms
    const table = planSunTable(lShaped({ north: 90 }))
    expect(table.facing.northStated).toBe(true)
    expect(turned!.walls.map((w) => [w.wall, w.faces])).toEqual([['d', 'south'], ['a', 'west']])
    expect(turned!.walls.find((w) => w.wall === 'a')!.depth).toBeCloseTo(plain!.walls.find((w) => w.wall === 'a')!.depth, 9)
    expect(turned!.windowArea).toBeCloseTo(plain!.windowArea, 9)
  })

  it('gives a room with no window to the outside an empty row', () => {
    const plan = lShaped()
    const [room] = planSunTable({ ...plan, openings: plan.openings.filter((o) => o.type !== 'window') }).rooms
    expect(room).toMatchObject({ room: 'l', windowArea: 0, windowToFloor: 0, walls: [] })
  })
})

describe('VEW-78: a glazed door in the sun table', () => {
  it('counts a door whose type is glazed with the windows, marked as a door, and no other door', () => {
    const glazed = lShaped({
      types: { doors: [{ id: 'slider', name: 'Glazed slider', kind: 'sliding', glazed: true }] },
      openings: [
        { id: 'south-1', wall: 'a', type: 'window', offset: 1, width: 1.2, height: 1.5, sill: 0.9 },
        { id: 'patio', wall: 'a', type: 'door', offset: 3, width: 2.4, height: 2.1, doorType: 'slider' },
        { id: 'entry', wall: 'e', type: 'door', offset: 1, width: 0.9, height: 2.1 },
      ],
    })
    const [room] = planSunTable(glazed).rooms
    const south = room!.walls.find((w) => w.wall === 'a')!
    expect(south.windows.map((o) => [o.id, o.door === true])).toEqual([['south-1', false], ['patio', true]])
    expect(room!.windowArea).toBeCloseTo(1.8 + 2.4 * 2.1, 9)
    expect(room!.walls.some((w) => w.windows.some((o) => o.id === 'entry'))).toBe(false)
  })

  it('counts a door whose type is made of glass, and leaves out a window whose type says it is not glazed', () => {
    const plan = lShaped({
      types: {
        doors: [{ id: 'glass', name: 'Frameless', material: 'Toughened glass' }],
        windows: [{ id: 'panel', name: 'Solid panel', glazed: false }],
      },
      openings: [
        { id: 'south-1', wall: 'a', type: 'window', offset: 1, width: 1.2, height: 1.5, sill: 0.9, windowType: 'panel' },
        { id: 'patio', wall: 'a', type: 'door', offset: 3, width: 1, height: 2.1, doorType: 'glass' },
      ],
    })
    const [room] = planSunTable(plan).rooms
    expect(room!.walls.flatMap((w) => w.windows.map((o) => o.id))).toEqual(['patio'])
  })
})
