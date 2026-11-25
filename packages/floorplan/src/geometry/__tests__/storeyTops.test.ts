/**
 * VEW-33: under another floor a storey's top is that floor's slab. Walls that stop short of it are
 * drawn up to it in sections and facades, and the check says the gap, or walls that rise past the
 * floor over them.
 */
import { describe, expect, it } from 'vitest'
import { exterior, room, twoFloorHouse, wall } from '../../test-support/plans'
import type { Floor, FloorPlan, Wall } from '../plan'
import { indexPlan } from '../plan'
import { planSection, type SectionLine } from '../section'
import { planFacade } from '../facade'
import { validatePlan } from '../validate'

/** Four outside walls round a 10 x 8 box on a floor, `height` m high, and one room in it. */
const box = (prefix: string, floor: string, height: number): { walls: Wall[]; room: ReturnType<typeof room> } => {
  const walls = [
    exterior(`${prefix}-s`, [0, 0], [10, 0], { floor, height }),
    exterior(`${prefix}-e`, [10, 0], [10, 8], { floor, height }),
    exterior(`${prefix}-n`, [10, 8], [0, 8], { floor, height }),
    exterior(`${prefix}-w`, [0, 8], [0, 0], { floor, height })
  ]
  return { walls, room: room(`${prefix}-room`, `${prefix} room`, walls.map((w) => w.id), floor) }
}

/** Two floors, one over the other, each a box: the lower one's walls `lowerHeight` m high. */
function stacked(lower: Floor, upper: Floor, lowerHeight: number, extra: Wall[] = []): FloorPlan {
  const a = box('b', lower.id, lowerHeight)
  const b = box('g', upper.id, 2.7)
  return { version: '1', units: 'm', openings: [], floors: [lower, upper], walls: [...a.walls, ...extra, ...b.walls], rooms: [a.room, b.room] }
}

/** A car park whose floor stands at -4.00, its walls 3.00 m high, under a ground floor at 0: 0.75 m short of the slab. */
const carPark = (extra: Wall[] = []): FloorPlan =>
  stacked({ id: 'b1', name: 'Car park', level: -1, elevation: -4 }, { id: 'g', name: 'Ground', level: 0, elevation: 0 }, 3, extra)

/** Across the box from south to north, looking west. */
const ACROSS: SectionLine = { from: { x: 5, y: -2 }, to: { x: 5, y: 10 }, toward: 'left' }

const ys = (rings: readonly (readonly { y: number }[])[]): [number, number] => [Math.min(...rings.flat().map((p) => p.y)), Math.max(...rings.flat().map((p) => p.y))]
const codes = (plan: FloorPlan) => validatePlan(plan, indexPlan(plan)).issues.filter((i) => i.code === 'floor/gap-under-slab' || i.code === 'floor/walls-past-floor')

describe('a car park whose walls stop short of the slab over it', () => {
  const plan = carPark()
  const section = planSection(plan, ACROSS)

  it('cuts its walls up to the underside of the ground floor\'s slab, with no band of nothing', () => {
    const slab = section.parts.find((p) => p.kind === 'slab' && p.id === 'g')!
    expect(ys(slab.rings)).toEqual([-0.25, 0])
    for (const id of ['b-s', 'b-n']) expect(ys(section.parts.find((p) => p.id === id)!.rings)).toEqual([-4, -0.25])
    // Joined with the slab, the cut is one connected shape: walls, slab and the floors' walls over it.
    expect(section.cut).toHaveLength(1)
  })

  it('raises its walls beyond the cut too', () => {
    const far = section.beyond.filter((f) => f.kind === 'wall' && f.id === 'b-w')
    expect(far.length).toBeGreaterThan(0)
    for (const face of far) {
      const points = face.edge === null ? face.pieces.flatMap((p) => p.outline) : [...face.edge]
      expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(-0.25, 6)
    }
  })

  it('lists the walls it drew up to the slab, and marks only the strip it added', () => {
    const note = section.assumed.find((a) => a.kind === 'wall-top')!
    expect(note.ids).toEqual(['b-s', 'b-n'])
    expect(note.words).toBe('2 walls cut on "Car park" stop short of the slab of "Ground" over them, by up to 0.75 m: they are drawn up to the slab ("b-s", "b-n").')
    expect(note.hatched).toBe(true)
    expect(ys(note.pieces.map((p) => p.outline))).toEqual([-1, -0.25])
  })

  it('says the gap in the check, once, on the car park', () => {
    const found = codes(plan)
    expect(found.map((i) => [i.code, i.id, i.severity])).toEqual([['floor/gap-under-slab', 'b1', 'warning']])
    expect(found[0]!.message).toContain('stop 0.75 m short of the slab of "Ground" over it')
    expect(found[0]!.message).toContain('they reach -1.00 m, and the slab\'s underside is at -0.25 m')
  })

  it('still says it for a floor marked overhang "meant": that mark is about outlines', () => {
    const meant = stacked({ id: 'b1', name: 'Car park', level: -1, elevation: -4 }, { id: 'g', name: 'Ground', level: 0, elevation: 0, overhang: 'meant' }, 3)
    expect(codes(meant).map((i) => i.code)).toEqual(['floor/gap-under-slab'])
  })

  it('keeps a dwarf wall at its own height', () => {
    const low = carPark([wall('b-dwarf', [5, 1], [5, 7], { floor: 'b1', height: 1 })])
    const cut = planSection(low, { from: { x: 0, y: 4 }, to: { x: 10, y: 4 }, toward: 'left' })
    expect(ys(cut.parts.find((p) => p.id === 'b-dwarf')!.rings)).toEqual([-4, -3])
    expect(ys(cut.parts.find((p) => p.id === 'b-e')!.rings)).toEqual([-4, -0.25])
  })
})

describe('a storey above the ground that stops short of the floor over it', () => {
  // The ground floor's walls state 2.70 m; the first floor stands at 3.50, on a 0.25 m slab.
  const plan = stacked({ id: 'g', name: 'Ground', level: 0, elevation: 0 }, { id: 'f', name: 'First', level: 1, elevation: 3.5 }, 2.7)

  it('draws its walls up to that floor\'s slab in the facade', () => {
    const south = planFacade(plan, 'south')
    const walls = south.faces.filter((f) => f.kind === 'wall' && f.floor === 'g')
    expect(walls.length).toBeGreaterThan(0)
    for (const face of walls) expect(face.top).toBeCloseTo(3.25, 6)
  })

  it('says the gap in the check', () => {
    expect(codes(plan).map((i) => [i.code, i.id])).toEqual([['floor/gap-under-slab', 'g']])
  })
})

describe('walls that meet the floor over them', () => {
  it('says nothing, and draws nothing new, for walls stated floor to floor, into the slab', () => {
    const plan = stacked({ id: 'g', name: 'Ground', level: 0, elevation: 0 }, { id: 'f', name: 'First', level: 1, elevation: 3 }, 3)
    expect(codes(plan)).toEqual([])
    const section = planSection(plan, ACROSS)
    expect(ys(section.parts.find((p) => p.id === 'b-s')!.rings)).toEqual([0, 3])
    expect(section.assumed.some((a) => a.kind === 'wall-top')).toBe(false)
  })

  it('says walls that rise past the floor over them, into the storey above', () => {
    const plan = stacked({ id: 'g', name: 'Ground', level: 0, elevation: 0 }, { id: 'f', name: 'First', level: 1, elevation: 3 }, 3.4)
    const found = codes(plan)
    expect(found.map((i) => [i.code, i.id])).toEqual([['floor/walls-past-floor', 'g']])
    expect(found[0]!.message).toContain('rise 0.40 m past the floor of "First" over it')
  })

  it('says nothing for a plan that states no level, and draws it as before', () => {
    const plan = twoFloorHouse()
    expect(codes(plan)).toEqual([])
    expect(planSection(plan, { from: { x: 5, y: -2 }, to: { x: 5, y: 10 }, toward: 'left' }).assumed.some((a) => a.kind === 'wall-top')).toBe(false)
  })
})
