/**
 * ARE-60: the living area under air, to the outside face of the walls round the rooms heated or
 * cooled, and the total under roof, the gross external area with the roofed outdoor spaces' floor.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { MEASURES, isConditioned, planAreaFigures } from '../areas'

type Raw = Record<string, unknown> & { rooms: Record<string, unknown>[] }

function written(lines: readonly string[], change: (plan: Raw) => Raw = (plan) => plan): FloorPlan {
  const result = compileRoomsText(lines.join('\n'))
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(change(result.plan as unknown as Raw))
}

const stating = (id: string, conditioned: boolean) => (plan: Raw): Raw => ({ ...plan, rooms: plan.rooms.map((room) => (room['id'] === id ? { ...room, conditioned } : room)) })

// A 6 × 5 m living room and a 3 × 5 m garage beside it, 0.3 m outside walls and a 0.1 m wall between.
const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room l "Living" living 6 x 5 at 0,0', 'room g "Garage" parking 3 x 5 east of l']
// The living room to the outside face of its walls, the wall to the garage in full: 6.4 × 5.6 m.
const LIVING_UNDER_AIR = 6.4 * 5.6
// The whole house to the outside face: 9.7 × 5.6 m.
const HOUSE_GROSS = 9.7 * 5.6

describe('ARE-60 a house with a garage beside it', () => {
  const plan = written(HOUSE)
  const areas = planAreaFigures(plan)

  it('gives the living area under air without the garage, its own outer walls or their ends, and the wall between in full', () => {
    expect(areas.grossExternal.area).toBeCloseTo(HOUSE_GROSS, 6)
    expect(areas.conditioned.area).toBeCloseTo(LIVING_UNDER_AIR, 6)
    expect(areas.conditioned.rule).toBe(MEASURES.conditioned)
    expect(areas.conditioned.why).toBeNull()
  })

  it('gives the total under roof with the garage in', () => {
    expect(areas.underRoof.area).toBeCloseTo(HOUSE_GROSS, 6)
    expect(areas.underRoof.rule).toBe(MEASURES.underRoof)
  })

  it('marks the garage not under air, by its use, and keeps the net as it was', () => {
    expect(areas.net.area).toBeCloseTo(45, 6)
    const garage = areas.floors[0]!.rooms.find((room) => room.id === 'g')!
    expect(garage.unconditioned).toBe(true)
    expect(areas.floors[0]!.rooms.find((room) => room.id === 'l')!.unconditioned).toBeUndefined()
    expect(areas.notUnderAir).toEqual({ rooms: [{ floor: 'ground', id: 'g', name: 'Garage', why: 'use', area: 15 }], area: 15 })
  })

  it('counts a garage stated as conditioned under air, as the whole house', () => {
    const heated = planAreaFigures(written(HOUSE, stating('g', true)))
    expect(heated.conditioned.area).toBeCloseTo(HOUSE_GROSS, 6)
    expect(heated.notUnderAir.rooms).toEqual([])
  })

  it('takes out a store stated unconditioned, as it does a garage', () => {
    const store = written(['walls outside 0.3 inside 0.1 height 2.7', 'room l "Living" living 6 x 5 at 0,0', 'room s "Store" storage 3 x 5 east of l'], stating('s', false))
    const figures = planAreaFigures(store)
    expect(figures.conditioned.area).toBeCloseTo(LIVING_UNDER_AIR, 6)
    expect(figures.underRoof.area).toBeCloseTo(HOUSE_GROSS, 6)
    expect(figures.notUnderAir.rooms.map((room) => [room.id, room.why])).toEqual([['s', 'stated']])
  })

  it('adds a roofed porch to the total under roof and leaves it out of the area under air', () => {
    const porch = planAreaFigures(written([...HOUSE, 'room p "Porch" - 6 x 2 south of l outdoor porch']))
    expect(porch.conditioned.area).toBeCloseTo(LIVING_UNDER_AIR, 6)
    // The porch's floor, 6 × 2 m inside its edges, is under the roof.
    expect(porch.underRoof.area).toBeCloseTo(porch.grossExternal.area! + 12, 6)
    const open = planAreaFigures(written([...HOUSE, 'room p "Terrace" - 6 x 2 south of l outdoor terrace']))
    expect(open.underRoof.area).toBeCloseTo(open.grossExternal.area!, 6)
  })

  it('leads with them where homes are measured to the outside face', () => {
    expect(planAreaFigures(plan, { country: 'US' }).reader.underAirFirst).toBe(true)
    expect(planAreaFigures(plan, { country: 'US', gross: 'both' }).reader.underAirFirst).toBe(true)
    expect(planAreaFigures(plan, { country: 'GB' }).reader.underAirFirst).toBe(false)
    expect(planAreaFigures(plan).reader.underAirFirst).toBe(false)
  })
})

describe('ARE-60 which rooms are under air', () => {
  const room = (extra: Record<string, unknown>) => parseFloorPlan({ walls: [], openings: [], rooms: [{ id: 'r', name: 'R', boundary: [], ...extra }] }).rooms[0]!

  it('is every room but parking unless it states otherwise, and never outdoor space or a void', () => {
    expect(isConditioned(room({}))).toBe(true)
    expect(isConditioned(room({ use: 'storage' }))).toBe(true)
    expect(isConditioned(room({ use: 'parking' }))).toBe(false)
    expect(isConditioned(room({ use: 'parking', conditioned: true }))).toBe(true)
    expect(isConditioned(room({ use: 'living', conditioned: false }))).toBe(false)
    expect(isConditioned(room({ outdoor: 'porch', conditioned: true }))).toBe(false)
    expect(isConditioned(room({ void: true }))).toBe(false)
  })
})

describe('ARE-60 the lab plans', () => {
  const FIXTURES = resolve(__dirname, '../../../fixtures')
  const names = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'))

  it.each(names)('%s: the area under air is at most the gross external area, and the total under roof at least', (name) => {
    const plan = parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')))
    const areas = planAreaFigures(plan)
    for (const f of areas.floors) {
      if (f.grossExternal === null) continue
      if (f.conditioned !== null) expect(f.conditioned).toBeLessThanOrEqual(f.grossExternal + 1e-6)
      expect(f.underRoof).toBeGreaterThanOrEqual(f.grossExternal - 1e-6)
    }
  })
})
