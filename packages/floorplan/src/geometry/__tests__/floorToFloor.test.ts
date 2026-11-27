/**
 * LVL-24: floor-to-floor heights, read from where the floors stand and set as their elevations,
 * and the two warnings when heights conflict: a clear height that with the slab over it runs past
 * the floor over it, and walls whose own height is not their floor's.
 */
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { levelsSetTo, planLevels } from '../floorToFloor'
import { buildingHeight } from '../storeys'

type RawFloor = { id: string; name?: string; level: number; elevation?: number; height?: number; slab?: number }

/** A 10 x 8 box with one room on each floor; `wallHeight` on every wall of the floors it names. */
function tower(floors: RawFloor[], wallHeight: Record<string, number> = {}, extra: Record<string, unknown> = {}): FloorPlan {
  const walls: unknown[] = []
  const rooms: unknown[] = []
  for (const f of floors) {
    const corners: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]]
    const ids = corners.map((_, i) => `${f.id}-w${i}`)
    corners.forEach((c, i) => {
      const h = wallHeight[f.id]
      walls.push({ id: ids[i], start: c, end: corners[(i + 1) % 4], thickness: 0.2, kind: 'exterior', floor: f.id, ...(h === undefined ? {} : { height: h }) })
    })
    rooms.push({ id: `${f.id}-room`, name: `Room ${f.id}`, boundary: ids, floor: f.id })
  }
  return FloorPlanSchema.parse({ version: '1', units: 'm', floors: floors.map((f) => ({ name: f.id, ...f })), walls, rooms, openings: [], ...extra }) as FloorPlan
}

const codes = (plan: FloorPlan, ...wanted: string[]) => validatePlan(plan, indexPlan(plan)).issues.filter((i) => wanted.includes(i.code))

/** The plan with the floors set as `levelsSetTo` says. */
function applied(plan: FloorPlan, set: ReturnType<typeof levelsSetTo>['set']): FloorPlan {
  const byId = new Map(set.map((s) => [s.floor, s] as const))
  const floors = plan.floors!.map((f) => {
    const s = byId.get(f.id)
    return s === undefined ? f : { ...f, ...(s.elevation === undefined ? {} : { elevation: s.elevation }), ...(s.height === undefined ? {} : { height: s.height }) }
  })
  // As the file holds them: a height the floor gave is not written.
  const walls = plan.walls.map(({ unstated, ...w }) => ({ ...w, height: unstated?.includes('height') ? undefined : w.height }))
  return FloorPlanSchema.parse({ ...plan, floors, walls }) as FloorPlan
}

describe('floor-to-floor read from where the floors stand', () => {
  it('is the next level less this one, and the top one runs to its roof slab', () => {
    const plan = tower([{ id: 'g', level: 0 }, { id: 'f1', level: 1, elevation: 3.5 }, { id: 'f2', level: 2, elevation: 7 }])
    const levels = planLevels(plan)
    expect(levels.map((l) => [l.floor, l.floorLevel, l.floorToFloor, l.placed])).toEqual([
      ['g', 0, 3.5, 'stacked'],
      ['f1', 3.5, 3.5, 'stated'],
      ['f2', 7, 2.95, 'stated'],
    ])
    expect(levels[2]!.over).toEqual([])
  })

  it('reads each building on its own', () => {
    const plan = tower([{ id: 'a0', level: 0 }, { id: 'a1', level: 1 }, { id: 'b0', level: 0 }], {}, { buildings: [{ id: 'a', floors: ['a0', 'a1'] }, { id: 'b', floors: ['b0'], pad: 1 }] })
    const levels = planLevels(plan)
    expect(levels.map((l) => [l.building, l.floor, l.floorLevel])).toEqual([['a', 'a0', 0], ['a', 'a1', 2.95], ['b', 'b0', 1]])
  })
})

describe('the levels a floor-to-floor gives', () => {
  const forty = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, level: i }))

  it('stacks forty storeys at 3.9 m to 156 m, every floor stated but the first, each high to the slab over it', () => {
    const plan = tower(forty)
    const { set, problems } = levelsSetTo(plan, { floorToFloor: 3.9 })
    expect(problems).toEqual([])
    expect(set.find((s) => s.floor === 'l0')).toEqual({ floor: 'l0', height: 3.65, was: null, set: true })
    expect(set.find((s) => s.floor === 'l39')).toEqual({ floor: 'l39', elevation: 152.1, height: 3.65, was: null, set: true })
    const after = applied(plan, set)
    expect(buildingHeight(after)!.height).toBeCloseTo(156, 6)
    expect(planLevels(after).every((l) => Math.abs(l.floorToFloor - 3.9) < 1e-9)).toBe(true)
    expect(codes(after, 'floor/gap-under-slab', 'floor/walls-past-floor', 'floor/height-past-next')).toEqual([])
  })

  it('sets one floor and moves the floors over it, keeping theirs', () => {
    const three = tower(forty.slice(0, 3))
    const plan = applied(three, levelsSetTo(three, { floorToFloor: 3 }).set)
    const { set } = levelsSetTo(plan, { floorToFloor: 4.5, floors: ['l0'] })
    expect(set).toEqual([
      { floor: 'l0', height: 4.25, was: 2.75, set: true },
      { floor: 'l1', elevation: 4.5, set: false },
      { floor: 'l2', elevation: 7.5, set: false },
    ])
  })

  it('wins over a height the floor stated, and says what it was', () => {
    const plan = tower([{ id: 'g', level: 0, height: 2.7 }, { id: 'f', level: 1 }])
    expect(levelsSetTo(plan, { floorToFloor: 3.9 }).set).toEqual([
      { floor: 'g', height: 3.65, was: 2.7, set: true },
      { floor: 'f', elevation: 3.9, height: 3.65, was: null, set: true },
    ])
  })

  it('hangs a basement its floor-to-floor under the ground floor', () => {
    const plan = tower([{ id: 'b', level: -1 }, { id: 'g', level: 0 }])
    const { set } = levelsSetTo(plan, { floorToFloor: 3.2 })
    expect(set).toEqual([
      { floor: 'b', elevation: -3.2, height: 2.95, was: null, set: true },
      { floor: 'g', height: 2.95, was: null, set: true },
    ])
    expect(planLevels(applied(plan, set)).map((l) => l.floorLevel)).toEqual([-3.2, 0])
  })

  it('sets one building only', () => {
    const plan = tower([{ id: 'a0', level: 0 }, { id: 'a1', level: 1 }, { id: 'b0', level: 0 }, { id: 'b1', level: 1 }], {}, { buildings: [{ id: 'a', floors: ['a0', 'a1'] }, { id: 'b', floors: ['b0', 'b1'] }] })
    expect(levelsSetTo(plan, { floorToFloor: 4, building: 'b' }).set.map((s) => s.floor)).toEqual(['b0', 'b1'])
  })

  it('refuses a floor-to-floor no taller than the slab, and a ceiling that does not fit', () => {
    const plan = tower([{ id: 'g', level: 0 }, { id: 'f', level: 1, slab: 0.3 }])
    expect(levelsSetTo(plan, { floorToFloor: 0.3 }).problems[0]).toEqual({ kind: 'no-room', floor: 'g', slab: 0.3 })
    expect(levelsSetTo(plan, { floorToFloor: 3, ceiling: 2.8 }).problems[0]).toEqual({ kind: 'ceiling-too-tall', floor: 'g', fits: 2.7 })
    expect(levelsSetTo(plan, { floorToFloor: 3, ceiling: 2.8 }).set).toEqual([])
  })
})

describe('a clear height that runs past the floor over it', () => {
  it('is said when the height was written as the floor-to-floor', () => {
    // A block whose storeys are 3.00 m floor to floor, its floors' height written 3.00 too.
    const plan = tower([{ id: 'g', name: 'Ground', level: 0, height: 3 }, { id: 'f', name: 'First', level: 1, elevation: 3, height: 3 }])
    const found = codes(plan, 'floor/height-past-next', 'floor/walls-past-floor')
    expect(found.map((i) => [i.code, i.id, i.severity])).toEqual([['floor/height-past-next', 'g', 'warning']])
    expect(found[0]!.message).toContain('Floor "Ground" states a clear height of 3.00 m, and the slab of "First" over it is 0.25 m: together they reach 3.25 m, 0.25 m past "First", which stands at 3.00 m.')
    expect(found[0]!.message).toContain('a clear height of no more than 2.75 m')
  })

  it('is not said when the heights fit, nor when nothing states a level', () => {
    expect(codes(tower([{ id: 'g', level: 0, height: 2.75 }, { id: 'f', level: 1, elevation: 3 }]), 'floor/height-past-next')).toEqual([])
    expect(codes(tower([{ id: 'g', level: 0, height: 3 }, { id: 'f', level: 1, height: 3 }]), 'floor/height-past-next')).toEqual([])
  })

  it('gives way to walls past the floor over it, which says more', () => {
    const plan = tower([{ id: 'g', level: 0, height: 3.4 }, { id: 'f', level: 1, elevation: 3 }])
    expect(codes(plan, 'floor/height-past-next', 'floor/walls-past-floor').map((i) => i.code)).toEqual(['floor/walls-past-floor'])
  })
})

describe('walls whose own height is not their floor\'s', () => {
  it('says which wins, with how many walls take the floor\'s', () => {
    const base = tower([{ id: 'g', name: 'Ground', level: 0, height: 3 }])
    const plan = FloorPlanSchema.parse({ ...base, walls: base.walls.map((w, i) => (i < 3 ? { ...w, height: 2.7, unstated: undefined } : { ...w, height: undefined, unstated: undefined })) }) as FloorPlan
    const found = codes(plan, 'floor/wall-heights-differ')
    expect(found.map((i) => [i.id, i.severity])).toEqual([['g', 'warning']])
    expect(found[0]!.message).toBe('Floor "g" states a height of 3.00 m, and 3 walls on it state their own, 2.70 m. Each wall\'s own height wins: those walls stand at it, while the floor\'s 3.00 m stacks the storey and is what its one other wall takes. If the walls\' height is the storey\'s, state it on the floor and take it off the walls.')
  })

  it('is not said for a dwarf wall, nor for walls that take the floor\'s height', () => {
    const base = tower([{ id: 'g', level: 0, height: 3 }])
    expect(codes(base, 'floor/wall-heights-differ')).toEqual([])
    const dwarf = FloorPlanSchema.parse({ ...base, walls: [...base.walls, { id: 'dwarf', start: [2, 2], end: [2, 5], thickness: 0.1, floor: 'g', height: 1.1 }] }) as FloorPlan
    expect(codes(dwarf, 'floor/wall-heights-differ')).toEqual([])
  })
})
