/**
 * VEW-78: the inside of a room as the 3D view draws it: a ceiling at the room's height whether or
 * not it states one, and the linings its wall finishes are drawn on, open over each opening, a
 * feature wall's face in its own finish and a band over its height.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { buildScene } from '../scene3d'
import { sceneInterior } from '../interior'
import { openingGlazed, wallGlazed } from '../partTypes'

const wall = (id: string, start: number[], end: number[], extra: Record<string, unknown> = {}) => ({ id, start, end, thickness: 0.2, height: 2.7, ...extra })

/** A room 4 m by 3 m on its walls' centre lines, a window in the south wall and a door in the west. */
function room(extra: Record<string, unknown> = {}, walls: Record<string, Record<string, unknown>> = {}) {
  return parseFloorPlan({
    walls: [
      wall('s', [0, 0], [4, 0], walls['s']),
      wall('e', [4, 0], [4, 3], walls['e']),
      wall('n', [4, 3], [0, 3], walls['n']),
      wall('w', [0, 3], [0, 0], walls['w']),
    ],
    rooms: [{ id: 'k', name: 'Kitchen', boundary: ['s', 'e', 'n', 'w'], ...extra }],
    openings: [
      { id: 'win', wall: 's', type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 0.9 },
      { id: 'door', wall: 'w', type: 'door', offset: 1, width: 0.9, height: 2.1 },
    ],
  })
}

const interior = (plan: ReturnType<typeof room>, height = 2.7) => sceneInterior(plan, buildScene(plan), height)

describe('the ceilings (sceneInterior)', () => {
  it('gives a room that states no ceiling one at its storey height, over its inside faces', () => {
    const { ceilings } = interior(room())
    expect(ceilings).toHaveLength(1)
    expect(ceilings[0]).toMatchObject({ room: 'k', finish: null, z: 2.7 })
    const xs = ceilings[0]!.pieces[0]!.outline.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(0.1, 9)
    expect(Math.max(...xs)).toBeCloseTo(3.9, 9)
  })

  it('stands at the room\'s own height, with its lowered zone lower, and names its finish', () => {
    const { ceilings } = interior(room({ height: 2.4, finishes: { ceiling: 'White plaster' }, ceiling: { lowered: [{ points: [[1, 1], [2, 1], [2, 2], [1, 2]], height: 2.1 }] } }))
    expect(ceilings.map((c) => [c.z, c.finish])).toEqual([[2.4, 'White plaster'], [2.1, 'White plaster']])
    expect(ceilings[0]!.pieces[0]!.holes).toHaveLength(1)
  })

  it('gives an open outdoor space none', () => {
    expect(interior(room({ outdoor: 'terrace' })).ceilings).toEqual([])
  })
})

describe('the linings (sceneInterior)', () => {
  it('lines none of a room that names no wall finish', () => {
    expect(interior(room()).linings).toEqual([])
  })

  it('lines every inside face in the walls finish, from the floor to the ceiling, open over each opening', () => {
    const { linings } = interior(room({ finishes: { walls: 'Sage paint' } }))
    expect(linings.map((l) => l.wall).sort()).toEqual(['e', 'n', 's', 'w'])
    expect(new Set(linings.map((l) => l.finish))).toEqual(new Set(['Sage paint']))
    const south = linings.find((l) => l.wall === 's')!
    expect([south.bottom, south.top]).toEqual([0, 2.7])
    expect(Math.hypot(south.to.x - south.from.x, south.to.y - south.from.y)).toBeCloseTo(3.8, 9)
    // The window, 1 to 2.2 along the wall's axis, from the face's corner at x 0.1.
    expect(south.holes).toHaveLength(1)
    expect(south.holes[0]!.along[0]).toBeCloseTo(0.9, 9)
    expect(south.holes[0]!.along[1]).toBeCloseTo(2.1, 9)
    expect(south.holes[0]!.rise).toEqual([0.9, 2.1])
    // The west wall runs north to south, as the room's side along it does: the door is 1 m from
    // the wall's start, 0.9 m from the side's.
    const west = linings.find((l) => l.wall === 'w')!
    expect(west.holes[0]!.along[0]).toBeCloseTo(0.9, 9)
    expect(west.holes[0]!.rise).toEqual([0, 2.1])
  })

  it('lines a feature wall in its own finish and a band over its height on the wall it names', () => {
    const { linings } = interior(
      room({ finishes: { walls: 'Paint', faces: [{ wall: 'n', finish: 'Brick slips' }], bands: [{ finish: 'Metro tile', height: 0.6, from: 0.9, wall: 'e' }] } })
    )
    expect(linings.find((l) => l.wall === 'n' && !l.band)?.finish).toBe('Brick slips')
    const band = linings.filter((l) => l.band)
    expect(band).toHaveLength(1)
    expect(band[0]).toMatchObject({ wall: 'e', finish: 'Metro tile', bottom: 0.9 })
    expect(band[0]!.top).toBeCloseTo(1.5, 9)
  })

  it('lines no face of a curved wall', () => {
    const plan = parseFloorPlan({
      walls: [
        wall('s', [0, 0], [4, 0]),
        wall('e', [4, 0], [4, 3]),
        wall('n', [4, 3], [0, 3], { arc: { centre: [2, 1.5], sweep: (2 * Math.atan2(2, 1.5) * 180) / Math.PI } }),
        wall('w', [0, 3], [0, 0]),
      ],
      rooms: [{ id: 'k', name: 'Room', boundary: ['s', 'e', 'n', 'w'], finishes: { walls: 'Paint' } }],
      openings: [],
    })
    const walls = sceneInterior(plan, buildScene(plan), 2.7).linings.map((l) => l.wall)
    expect(walls).not.toContain('n')
    expect(walls).toContain('s')
  })
})

describe('what is glass (openingGlazed, wallGlazed)', () => {
  const typed = parseFloorPlan({
    walls: [wall('a', [0, 0], [4, 0], { wallType: 'curtain' }), wall('b', [4, 0], [4, 3])],
    rooms: [],
    openings: [],
    types: { walls: [{ id: 'curtain', name: 'Curtain wall', glazed: true }], doors: [{ id: 'solid', name: 'Solid oak', material: 'Oak' }] },
  })

  it('takes a window as glass, a door only when its type says so, and a doorless opening never', () => {
    expect(openingGlazed(typed, { type: 'window' })).toBe(true)
    expect(openingGlazed(typed, { type: 'door' })).toBe(false)
    expect(openingGlazed(typed, { type: 'door', doorType: 'solid' })).toBe(false)
    expect(openingGlazed(typed, { type: 'opening' })).toBe(false)
  })

  it('takes a wall of a glazed type as glass, and marks it so in the scene', () => {
    expect(wallGlazed(typed, typed.walls[0]!)).toBe(true)
    expect(wallGlazed(typed, typed.walls[1]!)).toBe(false)
    const scene = buildScene(typed)
    expect(scene.walls.find((w) => w.id === 'a')?.glazed).toBe(true)
    expect(scene.walls.find((w) => w.id === 'b')?.glazed).toBeUndefined()
  })
})
