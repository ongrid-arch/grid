/**
 * LVL-8: a facade from the model: the walls that face a side, every floor at its level, openings
 * at their sills and heads, the ground, and how far back each face stands.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { labPlan } from '../../test-support/lab'
import { FACADE_SIDES, planFacade } from '../facade'
import { planFacing } from '../orientation'
import { floorElevations } from '../elevations'

const wall = (id: string, start: [number, number], end: [number, number], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })

/**
 * A house of two floors: the ground floor 10 m by 8 m, the first floor 6 m by 5 m over its north
 * west corner, so the first floor stands 3 m back from the south side and 4 m back from the east.
 * The ground is 15 cm below the ground floor.
 */
function steppedHouse(extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({
    version: '1',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 },
    ],
    site: { ground: -0.15 },
    walls: [
      wall('gs', [0, 0], [10, 0], 'ground'),
      wall('ge', [10, 0], [10, 8], 'ground'),
      wall('gn', [10, 8], [0, 8], 'ground'),
      wall('gw', [0, 8], [0, 0], 'ground'),
      wall('fs', [0, 3], [6, 3], 'first'),
      wall('fe', [6, 3], [6, 8], 'first'),
      wall('fn', [6, 8], [0, 8], 'first'),
      wall('fw', [0, 8], [0, 3], 'first'),
    ],
    rooms: [
      { id: 'g', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
      { id: 'f', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' },
    ],
    openings: [
      { id: 'front', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1 },
      { id: 'w-first', wall: 'fs', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 },
    ],
    ...extra,
  })
}

describe('the facade of a side', () => {
  it('draws the walls that face that side, and no other', () => {
    const plan = steppedHouse()
    expect(planFacade(plan, 'south').walls).toEqual(['gs', 'fs'])
    expect(planFacade(plan, 'north').walls).toEqual(['gn', 'fn'])
    expect(planFacade(plan, 'east').walls).toEqual(['ge', 'fe'])
    expect(planFacade(plan, 'west').walls).toEqual(['gw', 'fw'])
  })

  it('stacks the floors at their levels: each wall from its floor level, each slab under it, each roof on top', () => {
    const facade = planFacade(steppedHouse(), 'south')
    const of = (kind: string, floor: string) => facade.faces.filter((f) => f.kind === kind && f.floor === floor).map((f) => [f.bottom, f.top])
    expect(of('wall', 'ground')).toEqual([[0, 2.7]])
    // VEW-29: the slab's thickness is not stated, so no band: the wall stands down over the edge.
    expect(of('wall', 'first')).toEqual([[2.7, 5.65]])
    expect(of('slab', 'first')).toEqual([])
    expect(of('roof', 'ground')).toEqual([[2.7, 2.95]])
    expect(of('roof', 'first')).toEqual([[5.65, 5.9]])
    expect(facade.levels.map((l) => [l.floor, l.name, l.level])).toEqual([
      ['ground', 'Ground floor', 0],
      ['first', 'First floor', 2.95],
    ])
    // The same levels the 3D view and the IFC stack the floors at.
    expect(floorElevations(steppedHouse()).floors.get('first')!.floorLevel).toBe(2.95)
  })

  it('reaches the building\'s corners, walls and all, left to right as a person outside sees it', () => {
    const south = planFacade(steppedHouse(), 'south')
    const ground = south.faces.find((f) => f.wall === 'gs')!
    // Seen from the south, east is on the right: u runs with x, to the outside faces of the corners.
    expect([ground.u0, ground.u1]).toEqual([-0.15, 10.15])
    const north = planFacade(steppedHouse(), 'north')
    const back = north.faces.find((f) => f.wall === 'gn')!
    // Seen from the north, east is on the left: u runs against x.
    expect([back.u0, back.u1]).toEqual([-10.15, 0.15])
  })

  it('puts each opening at its sill and its head, from its floor\'s level', () => {
    const facade = planFacade(steppedHouse(), 'south')
    const openings = facade.faces.flatMap((f) => f.openings).sort((a, b) => a.bottom - b.bottom)
    expect(openings).toEqual([
      { id: 'front', type: 'door', wall: 'gs', u0: 4.5, u1: 5.5, bottom: 0, top: 2.1 },
      { id: 'w-first', type: 'window', wall: 'fs', u0: 2, u1: 3.2, bottom: 3.85, top: 5.05 },
    ])
    expect(facade.openings).toEqual(['front', 'w-first'])
  })

  it('gives each face how far back it stands, and comes farthest first, so a nearer face hides what is behind it', () => {
    const facade = planFacade(steppedHouse(), 'south')
    const tier = (wallId: string) => facade.faces.find((f) => f.wall === wallId)!
    expect([tier('gs').depth, tier('gs').tier]).toEqual([0, 0])
    expect([tier('fs').depth, tier('fs').tier]).toEqual([3, 1])
    const depths = facade.faces.map((f) => f.depth)
    expect(depths).toEqual([...depths].sort((a, b) => b - a))
    // Seen from the north both floors' walls stand in one plane.
    expect(new Set(planFacade(steppedHouse(), 'north').faces.filter((f) => f.kind === 'wall').map((f) => f.tier))).toEqual(new Set([0]))
  })

  it('stands on the ground the site states, and outlines what stands above it', () => {
    const facade = planFacade(steppedHouse(), 'south')
    expect(facade.ground).toEqual({ level: -0.15, stated: true })
    // The silhouette: the ground floor's 10.3 m from the ground to its roof, the first floor's 6.3 m on top.
    expect(facade.outline).toHaveLength(1)
    const ring = facade.outline[0]!
    const area = Math.abs(ring.slice(0, -1).reduce((sum, [u, z], i) => sum + u * ring[i + 1]![1] - ring[i + 1]![0] * z, 0)) / 2
    // VEW-29: with no band between the floors the first floor's walls stand down to the ground floor's roof,
    // and the silhouette is the walls' own width there, not the band's.
    expect(area).toBeCloseTo(10.3 * (2.95 + 0.15) + 6.3 * (5.9 - 2.95) - 1.545, 6)
    expect(facade.extent).toEqual({ u0: -0.15, u1: 10.15, bottom: -0.15, top: 5.9 })
    // With no ground stated, the ground floor's floor level, 0, as LVL-4 reads it.
    const { site: _site, ...rest } = steppedHouse()
    void _site
    expect(planFacade(rest as FloorPlan, 'south').ground).toEqual({ level: 0, stated: false })
  })

  it('names the way the side faces only by a north the plan states', () => {
    expect(planFacade(steppedHouse(), 'south').compass).toBeNull()
    // North 90° counter-clockwise from the top of the drawing: north is to the left, so the bottom
    // of the drawing, its south side, faces west.
    expect(planFacade(steppedHouse({ north: 90 }), 'south').compass).toEqual({ bearing: 270, faces: 'west' })
  })

  it('draws a pattern\'s openings as the plain openings it expands into', () => {
    const plan = steppedHouse({ patterns: [{ id: 'row', wall: 'gs', opening: { type: 'window', width: 1, height: 1.2, sill: 0.9 }, count: 2, margins: { start: 1, end: 1 } }] })
    const facade = planFacade(plan, 'south')
    expect(facade.openings).toEqual(['front', 'w-first', 'row-ground-1', 'row-ground-2'])
  })

  it('cuts a wall to the roof the floor states, so a gable end is a gable, and shows the slope it looks at (LVL-6)', () => {
    const w = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, height: 6 })
    const plan = parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0, roof: { shape: 'gable', eaves: 2.5, ridge: 5, ridgeRuns: 'east-west' } }],
      walls: [w('s', [0, 0], [10, 0]), w('e', [10, 0], [10, 6]), w('n', [10, 6], [0, 6]), w('w', [0, 6], [0, 0])],
      rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'] }],
      openings: [],
    })
    // Seen from the east the end wall rises to the ridge, 5 m, in the middle of its 6 m.
    const gable = planFacade(plan, 'east').faces.find((f) => f.wall === 'e')!
    expect(gable.top).toBe(5)
    expect(gable.outline).toContainEqual([3, 5])
    expect(gable.outline.filter(([, z]) => z === 2.5).length).toBeGreaterThanOrEqual(2)
    // Seen from the south the side wall stops at the eaves, and the roof's plane rises behind it.
    const south = planFacade(plan, 'south')
    expect(south.faces.find((f) => f.wall === 's')!.top).toBe(2.5)
    expect(south.faces.some((f) => f.kind === 'roof-plane' && f.top > 5)).toBe(true)
  })

  it('says nothing faces a side when the plan has no outside face', () => {
    const empty = parseFloorPlan({ version: '1', walls: [], rooms: [], openings: [] })
    expect(planFacade(empty, 'north')).toMatchObject({ faces: [], extent: null, walls: [], openings: [] })
  })
})

describe('on the plans Grid already knows', () => {
  const fixture = (name: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

  it('draws the walls CNT-3 says face each side, on a house drawn square to the page', () => {
    for (const name of ['three-bed-house.json', 'two-bed-flat.json', 'villa.json']) {
      const plan = fixture(name)
      const facing = planFacing(plan)
      for (const side of FACADE_SIDES) {
        const expected = [...new Set(facing.walls.filter((w) => w.faces === side).map((w) => w.wall))]
        expect(planFacade(plan, side).walls.slice().sort(), `${name} ${side}`).toEqual(expected.sort())
      }
    }
  })

  it('stacks the lab\'s odd house: the ground floor to 2.70 m, the first floor from 2.95 m, a roof on each', () => {
    const plan = labPlan('F/scenarios/odd-house.json')
    const facade = planFacade(plan, 'south')
    const floors = [...new Set(facade.faces.map((f) => f.floor))]
    expect(floors.length).toBe(2)
    const [lower, upper] = facade.levels
    expect(lower!.level).toBe(0)
    expect(upper!.level).toBeCloseTo(2.95, 9)
    expect(Math.max(...facade.faces.filter((f) => f.kind === 'wall' && f.floor === lower!.floor).map((f) => f.top))).toBeCloseTo(2.7, 9)
    expect(Math.min(...facade.faces.filter((f) => f.kind === 'wall' && f.floor === upper!.floor).map((f) => f.bottom))).toBeCloseTo(2.7, 9)
    expect(facade.faces.filter((f) => f.kind === 'roof').map((f) => f.floor).sort()).toEqual([...new Set(facade.faces.filter((f) => f.kind === 'roof').map((f) => f.floor))].sort())
  })
})

describe('a sloped roof seen as a roof (VEW-12)', () => {
  const w = (id: string, start: [number, number], end: [number, number], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })
  /** Two floors, 10 m by 7 m, the first floor under a roof the plan states. */
  const house = (roof: Record<string, unknown>): FloorPlan =>
    parseFloorPlan({
      version: '1',
      floors: [
        { id: 'g', name: 'Ground floor', level: 0 },
        { id: 'f', name: 'First floor', level: 1, roof },
      ],
      walls: [
        w('gs', [0, 0], [10, 0], 'g'), w('ge', [10, 0], [10, 7], 'g'), w('gn', [10, 7], [0, 7], 'g'), w('gw', [0, 7], [0, 0], 'g'),
        w('fs', [0, 0], [10, 0], 'f'), w('fe', [10, 0], [10, 7], 'f'), w('fn', [10, 7], [0, 7], 'f'), w('fw', [0, 7], [0, 0], 'f'),
      ],
      rooms: [
        { id: 'a', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'g' },
        { id: 'b', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'f' },
      ],
      openings: [],
    })
  const kinds = (lines: readonly { kind: string }[]): string[] => lines.map((l) => l.kind).sort()

  it('names the lines of a gable\'s plane: its eaves at the foot, its ridge at the top, a verge at each end', () => {
    const facade = planFacade(house({ shape: 'gable', eaves: 2.6, pitch: 40, ridgeRuns: 'east-west' }), 'south')
    const planes = facade.faces.filter((f) => f.kind === 'roof-plane')
    expect(planes).toHaveLength(1)
    const plane = planes[0]!
    expect(kinds(plane.roofLines)).toEqual(['eaves', 'ridge', 'verge', 'verge'])
    const eaves = plane.roofLines.find((l) => l.kind === 'eaves')!
    const ridge = plane.roofLines.find((l) => l.kind === 'ridge')!
    expect(eaves.from[1]).toBe(plane.bottom)
    expect(eaves.to[1]).toBe(plane.bottom)
    expect(ridge.from[1]).toBe(plane.top)
    expect(Math.abs(eaves.to[0] - eaves.from[0])).toBeCloseTo(10.3, 6)
    // The verges run up the plane's two ends, upright as seen from the eaves side.
    for (const verge of plane.roofLines.filter((l) => l.kind === 'verge')) expect(verge.from[0]).toBe(verge.to[0])
    // The band along the eaves, the fascia, says it is the eaves; the walls and slabs say nothing.
    const bands = facade.faces.filter((f) => f.kind === 'roof')
    expect(bands.filter((f) => f.edge === 'eaves')).toHaveLength(1)
    expect(facade.faces.filter((f) => f.kind !== 'roof').every((f) => f.edge === null)).toBe(true)
    expect(facade.faces.filter((f) => f.kind !== 'roof-plane').every((f) => f.roofLines.length === 0)).toBe(true)
  })

  it('names a verge band on the gable end, and a hip where a hip roof\'s planes meet', () => {
    const gableEnd = planFacade(house({ shape: 'gable', eaves: 2.6, pitch: 40, ridgeRuns: 'east-west' }), 'east')
    expect(gableEnd.faces.filter((f) => f.kind === 'roof').map((f) => f.edge)).toEqual(['verge', 'verge'])
    const hip = planFacade(house({ shape: 'hip', eaves: 2.6, pitch: 40 }), 'south')
    const plane = hip.faces.find((f) => f.kind === 'roof-plane')!
    expect(kinds(plane.roofLines)).toEqual(['eaves', 'hip', 'hip', 'ridge'])
    const end = planFacade(house({ shape: 'hip', eaves: 2.6, pitch: 40 }), 'east').faces.find((f) => f.kind === 'roof-plane')!
    expect(kinds(end.roofLines)).toEqual(['eaves', 'hip', 'hip'])
  })

  it('names the top of a mono-pitch roof its ridge, and where a roof meets a floor above an abutment', () => {
    const mono = planFacade(house({ shape: 'mono-pitch', eaves: 2.6, pitch: 15, highSide: 'north' }), 'south').faces.find((f) => f.kind === 'roof-plane')!
    expect(kinds(mono.roofLines)).toEqual(['eaves', 'ridge', 'verge', 'verge'])
    // A lean-to over the ground floor's south part, under the first floor set back 3 m.
    const plan = parseFloorPlan({
      version: '1',
      floors: [
        { id: 'g', name: 'Ground floor', level: 0, roof: { shape: 'mono-pitch', eaves: 2.4, pitch: 15, highSide: 'north' } },
        { id: 'f', name: 'First floor', level: 1 },
      ],
      walls: [
        w('gs', [0, 0], [10, 0], 'g'), w('ge', [10, 0], [10, 8], 'g'), w('gn', [10, 8], [0, 8], 'g'), w('gw', [0, 8], [0, 0], 'g'),
        w('fs', [0, 3], [10, 3], 'f'), w('fe', [10, 3], [10, 8], 'f'), w('fn', [10, 8], [0, 8], 'f'), w('fw', [0, 8], [0, 3], 'f'),
      ],
      rooms: [
        { id: 'a', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'g' },
        { id: 'b', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'f' },
      ],
      openings: [],
    })
    const leanTo = planFacade(plan, 'south').faces.find((f) => f.kind === 'roof-plane')!
    expect(kinds(leanTo.roofLines)).toEqual(['abutment', 'eaves', 'verge', 'verge'])
  })

  it('names nothing on a flat roof', () => {
    const facade = planFacade(house({ shape: 'flat', eaves: 2.6 }), 'south')
    expect(facade.faces.every((f) => f.edge === null && f.roofLines.length === 0)).toBe(true)
  })
})

describe('every wall that faces the viewer, outdoor space and all (VEW-25)', () => {
  const at = (id: string, start: [number, number], end: [number, number], floor: string, height = 2.7) => ({ id, start, end, thickness: 0.3, height, floor })
  /** A house 10 m by 8 m, its south wall in three, the middle one from 2 m to 6 m. */
  const house = (floor: string) => [at('gs1', [0, 0], [2, 0], floor), at('gs2', [2, 0], [6, 0], floor), at('gs3', [6, 0], [10, 0], floor), at('ge', [10, 0], [10, 8], floor), at('gn', [10, 8], [0, 8], floor), at('gw', [0, 8], [0, 0], floor)]
  const living = (floor: string) => ({ id: 'in', name: 'Living', boundary: ['gs1', 'gs2', 'gs3', 'ge', 'gn', 'gw'], floor })

  /** A walled porch 4 m by 2 m before the middle of the south wall, a door in its front and one into the house. */
  const porch = (): FloorPlan =>
    parseFloorPlan({
      version: '1',
      floors: [{ id: 'g', name: 'Ground floor', level: 0 }],
      walls: [...house('g'), at('pw', [2, 0], [2, -2], 'g'), at('ps', [2, -2], [6, -2], 'g'), at('pe', [6, -2], [6, 0], 'g')],
      rooms: [living('g'), { id: 'po', name: 'Porch', outdoor: 'porch', boundary: ['gs2', 'pw', 'ps', 'pe'], floor: 'g' }],
      openings: [
        { id: 'porch-door', wall: 'ps', type: 'door', offset: 1.5, width: 1, height: 2.1 },
        { id: 'house-door', wall: 'gs2', type: 'door', offset: 1.5, width: 1, height: 2.1 },
      ],
    })

  it('draws a porch\'s front wall and its door under the porch\'s roof, and not the house wall it hides', () => {
    const facade = planFacade(porch(), 'south')
    const front = facade.faces.find((f) => f.wall === 'ps')!
    expect([front.u0, front.u1, front.bottom, front.top, front.depth, front.tier]).toEqual([1.85, 6.15, 0, 2.7, 0, 0])
    expect(front.openings.map((o) => [o.id, o.u0, o.u1, o.bottom, o.top])).toEqual([['porch-door', 3.5, 4.5, 0, 2.1]])
    // The porch's roof stands on its walls.
    const roof = facade.faces.find((f) => f.kind === 'roof' && f.u0 > 2 && f.u1 < 6)!
    expect(roof.bottom).toBe(front.top)
    // The house wall behind the porch, and its door, are hidden whole.
    expect(facade.walls).toEqual(['gs1', 'gs3', 'ps'])
    expect(facade.openings).toEqual(['porch-door'])
  })

  it('draws a stair enclosure on a roof terrace as walls with its door, and the terrace\'s parapet', () => {
    const plan = parseFloorPlan({
      version: '1',
      floors: [
        { id: 'g', name: 'Ground floor', level: 0 },
        { id: 'r', name: 'Roof', level: 1 },
      ],
      walls: [
        ...house('g'),
        at('rs', [0, 0], [10, 0], 'r', 1.1), at('re', [10, 0], [10, 8], 'r', 1.1), at('rn', [10, 8], [0, 8], 'r', 1.1), at('rw', [0, 8], [0, 0], 'r', 1.1),
        at('ss', [4, 3], [7, 3], 'r'), at('se', [7, 3], [7, 6], 'r'), at('sn', [7, 6], [4, 6], 'r'), at('sw', [4, 6], [4, 3], 'r'),
      ],
      rooms: [
        living('g'),
        { id: 't', name: 'Terrace', outdoor: 'terrace', boundary: ['rs', 're', 'rn', 'rw'], floor: 'r' },
        { id: 'st', name: 'Stair', use: 'stair', boundary: ['ss', 'se', 'sn', 'sw'], floor: 'r' },
      ],
      openings: [{ id: 'stair-door', wall: 'ss', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
    })
    const facade = planFacade(plan, 'south')
    const parapet = facade.faces.find((f) => f.wall === 'rs')!
    expect([parapet.u0, parapet.u1, parapet.bottom, parapet.top, parapet.tier]).toEqual([-0.15, 10.15, 2.7, 4.05, 0])
    const enclosure = facade.faces.find((f) => f.wall === 'ss')!
    expect([enclosure.u0, enclosure.u1, enclosure.bottom, enclosure.top, enclosure.depth]).toEqual([3.85, 7.15, 2.7, 5.65, 3])
    expect(enclosure.openings.map((o) => o.id)).toEqual(['stair-door'])
    // Its roof stands on its walls, not in the sky.
    expect(facade.faces.some((f) => f.kind === 'roof' && f.floor === 'r' && f.bottom === enclosure.top && f.u0 === enclosure.u0)).toBe(true)
    expect(facade.openings).toEqual(['stair-door'])
  })

  it('draws a stepped block\'s set-back front with its window and door above the terrace\'s parapet', () => {
    const plan = parseFloorPlan({
      version: '1',
      floors: [
        { id: 'g', name: 'Ground floor', level: 0 },
        { id: 'f', name: 'First floor', level: 1 },
      ],
      walls: [
        ...house('g'),
        at('fs', [0, 3], [10, 3], 'f'), at('fe', [10, 3], [10, 8], 'f'), at('fn', [10, 8], [0, 8], 'f'), at('fw', [0, 8], [0, 3], 'f'),
        at('tw', [0, 3], [0, 0], 'f', 1.1), at('ts', [0, 0], [10, 0], 'f', 1.1), at('te', [10, 0], [10, 3], 'f', 1.1),
      ],
      rooms: [
        living('g'),
        { id: 'flat', name: 'Flat', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'f' },
        { id: 't', name: 'Terrace', outdoor: 'terrace', boundary: ['fs', 'te', 'ts', 'tw'], floor: 'f' },
      ],
      openings: [
        { id: 'flat-window', wall: 'fs', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 },
        { id: 'flat-door', wall: 'fs', type: 'door', offset: 6, width: 0.9, height: 2.1 },
      ],
    })
    const facade = planFacade(plan, 'south')
    // The flat's front, whole and once, 3 m back.
    const fronts = facade.faces.filter((f) => f.wall === 'fs')
    expect(fronts.map((f) => [f.u0, f.u1, f.bottom, f.top, f.depth, f.tier])).toEqual([[-0.15, 10.15, 2.7, 5.65, 3, 1]])
    expect(fronts[0]!.openings.map((o) => o.id)).toEqual(['flat-window', 'flat-door'])
    const parapet = facade.faces.find((f) => f.wall === 'ts')!
    expect([parapet.bottom, parapet.top, parapet.depth]).toEqual([2.7, 4.05, 0])
    expect(facade.walls).toEqual(['gs1', 'gs2', 'gs3', 'fs', 'ts'])
    expect(facade.openings).toEqual(['flat-window', 'flat-door'])
  })
})

describe('a balcony under another floor keeps its low walls (VEW-35)', () => {
  const at = (id: string, start: [number, number], end: [number, number], floor: string, height?: number) => ({ id, start, end, thickness: 0.2, floor, ...(height === undefined ? {} : { height }) })
  const house = (f: string) => [at(f + 's1', [0, 0], [2, 0], f, 2.7), at(f + 's2', [2, 0], [8, 0], f, 2.7), at(f + 's3', [8, 0], [10, 0], f, 2.7), at(f + 'e', [10, 0], [10, 8], f, 2.7), at(f + 'n', [10, 8], [0, 8], f, 2.7), at(f + 'w', [0, 8], [0, 0], f, 2.7)]
  /** A flat's floor stated as an outline with no walls but the balcony's, under a top floor. */
  const block = (): FloorPlan =>
    parseFloorPlan({
      version: '1',
      floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'u', name: 'U', level: 3, outline: [[0, 0], [10, 0], [10, 8], [0, 8]] }, { id: 'v', name: 'V', level: 6 }],
      walls: [...house('g'), ...house('v'), at('bw', [2, 0], [2, -1.5], 'u', 1.1), at('bs', [2, -1.5], [8, -1.5], 'u', 1.1), at('be', [8, -1.5], [8, 0], 'u', 1.1)],
      rooms: [
        { id: 'gi', name: 'Ground', boundary: ['gs1', 'gs2', 'gs3', 'ge', 'gn', 'gw'], floor: 'g' },
        { id: 'vi', name: 'Top', boundary: ['vs1', 'vs2', 'vs3', 've', 'vn', 'vw'], floor: 'v' },
        { id: 'bal', name: 'Balcony', outdoor: 'balcony', boundary: ['bw', 'bs', 'be'], floor: 'u' },
      ],
      openings: [{ id: 'slide-1', wall: 'bs', type: 'door', offset: 0.5, width: 2, height: 2.1 }],
    })

  it('draws the balcony walls at their own 1.10 m, not up to the slab over them', () => {
    const facade = planFacade(block(), 'south')
    const front = facade.faces.find((f) => f.wall === 'bs')!
    expect([front.bottom, front.top]).toEqual([2.7, 4.05])
  })

  it('counts every sliding door behind a balcony whose walls are low', () => {
    const plan = parseFloorPlan({
      version: '1',
      floors: [{ id: 'g', name: 'G', level: 0 }, { id: 'u', name: 'U', level: 3 }, { id: 'v', name: 'V', level: 6 }],
      walls: [...house('g'), ...house('u'), ...house('v'), at('bw', [2, 0], [2, -1.5], 'u', 1.1), at('bs', [2, -1.5], [8, -1.5], 'u', 1.1), at('be', [8, -1.5], [8, 0], 'u', 1.1)],
      rooms: [
        { id: 'gi', name: 'Ground', boundary: ['gs1', 'gs2', 'gs3', 'ge', 'gn', 'gw'], floor: 'g' },
        { id: 'ui', name: 'Flat', boundary: ['us1', 'us2', 'us3', 'ue', 'un', 'uw'], floor: 'u' },
        { id: 'vi', name: 'Top', boundary: ['vs1', 'vs2', 'vs3', 've', 'vn', 'vw'], floor: 'v' },
        { id: 'bal', name: 'Balcony', outdoor: 'balcony', boundary: ['us2', 'bw', 'bs', 'be'], floor: 'u' },
      ],
      openings: [
        { id: 'slide-1', wall: 'us2', type: 'door', offset: 0.5, width: 2, height: 2.1 },
        { id: 'slide-2', wall: 'us2', type: 'door', offset: 3.5, width: 2, height: 2.1 },
      ],
    })
    const facade = planFacade(plan, 'south')
    expect(facade.openings).toEqual(['slide-1', 'slide-2'])
    expect(facade.faces.find((f) => f.wall === 'us1')!.top).toBe(5.65)
    expect(facade.faces.find((f) => f.wall === 'bs')!.top).toBe(4.05)
  })
})

describe('a building with curved corners (VEW-36)', () => {
  /**
   * A tower 30 m square round its middle, its corners quarter circles of `radius`, one floor, its
   * core round a courtyard in the middle of the office with two lift doors on its south wall.
   */
  function roundedTower(radius: number, curvesFirst = false): FloorPlan {
    const h = 15
    const r = radius
    const at = (id: string, start: [number, number], end: [number, number], centre?: [number, number]) => ({ id, start, end, thickness: 0.3, height: 3.5, ...(centre === undefined ? {} : { arc: { centre, sweep: 90 } }) })
    const outside = [
      at('south', [-h + r, -h], [h - r, -h]),
      at('south-east', [h - r, -h], [h, -h + r], [h - r, -h + r]),
      at('east', [h, -h + r], [h, h - r]),
      at('north-east', [h, h - r], [h - r, h], [h - r, h - r]),
      at('north', [h - r, h], [-h + r, h]),
      at('north-west', [-h + r, h], [-h, h - r], [-h + r, h - r]),
      at('west', [-h, h - r], [-h, -h + r]),
      at('south-west', [-h, -h + r], [-h + r, -h], [-h + r, -h + r]),
    ]
    const core = [at('core-s', [-3, -3], [3, -3]), at('core-e', [3, -3], [3, 3]), at('core-n', [3, 3], [-3, 3]), at('core-w', [-3, 3], [-3, -3])]
    const walls = curvesFirst ? [...outside.filter((w) => 'arc' in w), ...outside.filter((w) => !('arc' in w)), ...core] : [...outside, ...core]
    return parseFloorPlan({
      version: '1',
      walls,
      rooms: [{ id: 'office', name: 'Office', boundary: outside.map((w) => w.id), holes: [core.map((w) => w.id)] }],
      openings: [
        { id: 'band', wall: 'south', type: 'window', offset: 0, width: 2 * (h - r), sill: 0.9, height: 1.8 },
        { id: 'lift-1', wall: 'core-s', type: 'door', offset: 1, width: 1.2, height: 2.1 },
        { id: 'lift-2', wall: 'core-s', type: 'door', offset: 3.5, width: 1.2, height: 2.1 },
      ],
    })
  }

  it('draws each side\'s straight wall between its two corners, with its window, and nothing from the core', () => {
    const plan = roundedTower(4)
    expect(planFacade(plan, 'south').walls).toEqual(['south', 'south-east', 'south-west'])
    expect(planFacade(plan, 'east').walls).toEqual(['south-east', 'east', 'north-east'])
    expect(planFacade(plan, 'north').walls).toEqual(['north-east', 'north', 'north-west'])
    expect(planFacade(plan, 'west').walls).toEqual(['north-west', 'west', 'south-west'])
    const south = planFacade(plan, 'south')
    expect(south.openings).toEqual(['band'])
    const front = south.faces.find((f) => f.wall === 'south')!
    // To the centimetre: the side may take in the curve's first millimetres, within `facadeOnFace`.
    const cm = (n: number): number => Math.round(n * 100) / 100 + 0
    expect([front.u0, front.u1, front.depth].map(cm)).toEqual([-11, 11, 0])
    expect(front.openings.map((o) => [o.id, cm(o.u0), cm(o.u1)])).toEqual([['band', -11, 11]])
    for (const side of FACADE_SIDES) {
      const facade = planFacade(plan, side)
      expect(facade.walls.filter((w) => w.startsWith('core')), side).toEqual([])
      expect(facade.openings.filter((o) => o.startsWith('lift')), side).toEqual([])
    }
  })

  it('never draws a corner on a side it does not face, however tight the corners and whatever order the walls come in', () => {
    const plan = roundedTower(0.6, true)
    expect(planFacade(plan, 'south').walls).toEqual(['south-east', 'south-west', 'south'])
    expect(planFacade(plan, 'north').walls).toEqual(['north-east', 'north-west', 'north'])
    expect(planFacade(plan, 'east').walls).toEqual(['south-east', 'north-east', 'east'])
    expect(planFacade(plan, 'west').walls).toEqual(['north-west', 'south-west', 'west'])
    expect(planFacade(plan, 'south').openings).toEqual(['band'])
  })
})

describe('a window through two floors', () => {
  const tall = (floorExtra: Record<string, unknown> = {}): FloorPlan => {
    const w = (id: string, start: [number, number], end: [number, number], extra: Record<string, unknown> = {}) => ({ id, start, end, thickness: 0.3, height: 2.7, floor: 'ground', ...extra })
    return parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 3, ...floorExtra }],
      walls: [
        w('s', [0, 0], [10, 0], { through: 'first' }),
        w('e', [10, 0], [10, 8]),
        w('n', [10, 8], [0, 8]),
        w('wst', [0, 8], [0, 0]),
        w('fe', [10, 0], [10, 8], { floor: 'first' }),
        w('fn', [10, 8], [0, 8], { floor: 'first' }),
        w('fw', [0, 8], [0, 0], { floor: 'first' }),
      ],
      rooms: [
        { id: 'g', name: 'Hall', boundary: ['s', 'e', 'n', 'wst'], floor: 'ground' },
        { id: 'f', name: 'Bedroom', boundary: ['s', 'fe', 'fn', 'fw'], floor: 'first' },
      ],
      openings: [{ id: 'stair-window', wall: 's', type: 'window', offset: 2, width: 2, sill: 0.5, height: 4.5 }],
    })
  }

  it('is one face with one window, from the sill to the head', () => {
    const facade = planFacade(tall(), 'south')
    const walls = facade.faces.filter((f) => f.kind === 'wall' && f.wall === 's')
    expect(walls).toHaveLength(1)
    expect(walls[0]!.bottom).toBe(0)
    expect(walls[0]!.openings).toHaveLength(1)
    expect(walls[0]!.openings[0]).toMatchObject({ id: 'stair-window', bottom: 0.5, top: 5 })
    expect(facade.openings).toEqual(['stair-window'])
  })

  it('has no slab band across it where the slab states its thickness', () => {
    const facade = planFacade(tall({ slab: 0.25 }), 'south')
    const wall = facade.faces.find((f) => f.kind === 'wall' && f.wall === 's')!
    const across = facade.faces.filter((f) => f.kind === 'slab' && f.u0 >= wall.u0 && f.u1 <= wall.u1 && f.bottom >= wall.bottom && f.top <= wall.top)
    expect(across).toEqual([])
    expect(facade.faces.filter((f) => f.kind === 'wall' && f.wall === 's')).toHaveLength(1)
  })
})
