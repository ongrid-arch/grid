/**
 * ARE-76: a building's height, storeys and floor to floor, each from its own ground and within its
 * own footprint. A row of identical split-level houses stepping up a street is six houses of two
 * storeys, each as high as the next, and a half level beside a floor is never the floor over it.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { SLAB_THICKNESS } from '../elevations'
import { groundLevel } from '../ground'
import { buildingHeight, buildingHeights, planStoreys } from '../storeys'
import { levelsSetTo, planLevels } from '../floorToFloor'

const STEP = 0.6
const HALF = 1.4

/**
 * One house `n` (from 0) of the row, 5 m wide: a street half at the front and a garden half at the
 * back half a level up, each with a floor over it a storey up. `whole` numbers its levels 0 to 3,
 * else in halves, 0, 0.5, 1 and 1.5 past twice the house's own number, so no two houses share a level.
 */
function house(n: number, whole: boolean): string {
  const x = n * 5
  const level = (i: number): number => (whole ? i : n * 2 + i / 2)
  const at = (i: number): string => (Math.round((n * STEP + i * HALF) * 1000) / 1000).toString()
  return [
    `floor h${n}f0 "House ${n + 1} street" level ${level(0)} elevation ${at(0)} height 2.5`,
    `room h${n}liv "Living" living 5 x 4 at ${x},0`,
    `floor h${n}b0 "House ${n + 1} garden" level ${level(1)} elevation ${at(1)} height 2.5`,
    `room h${n}kit "Kitchen" kitchen 5 x 4.5 at ${x},4`,
    `floor h${n}f1 "House ${n + 1} front bedroom" level ${level(2)} elevation ${at(2)} height 2.5`,
    `room h${n}bed "Bedroom" bedroom 5 x 4 at ${x},0`,
    `floor h${n}b1 "House ${n + 1} back bedroom" level ${level(3)} elevation ${at(3)} height 2.5`,
    `room h${n}bed2 "Bedroom" bedroom 5 x 4.5 at ${x},4`,
    '',
  ].join('\n')
}

const HOUSES = 6
const ids = Array.from({ length: HOUSES }, (_, n) => n)

function row(options: { named?: boolean; whole?: boolean; site?: Record<string, unknown>; count?: number } = {}): FloorPlan {
  const count = options.count ?? HOUSES
  const made = compileRoomsText(`plan "Rising street"\nwalls outside 0.3 inside 0.1\n${ids.slice(0, count).map((n) => house(n, options.whole ?? false)).join('')}`)
  expect(made.problems).toEqual([])
  const raw = { ...(made.plan as object) } as Record<string, unknown>
  if (options.named ?? true) raw['buildings'] = ids.slice(0, count).map((n) => ({ id: `h${n}`, name: `House ${n + 1}`, floors: [`h${n}f0`, `h${n}b0`, `h${n}f1`, `h${n}b1`] }))
  raw['site'] = { ...((raw['site'] as object | undefined) ?? {}), ground: -0.15, ...(options.site ?? {}) }
  return parseFloorPlan(raw)
}

/** One house from its street floor's ground to the top of its back bedroom floor's roof slab. */
const ONE_HOUSE = 0.15 + 3 * HALF + 2.5 + SLAB_THICKNESS

describe('ARE-76 a row of split-level houses on one stated ground', () => {
  it('measures every house to the same height, each from the ground under its own street floor', () => {
    const heights = buildingHeights(row())
    // The lowest house stands on the site's ground as stated; each house up the street on ground as much higher.
    expect(heights.map((b) => b.height!.from)).toEqual(['site', ...Array(HOUSES - 1).fill('under')])
    heights.forEach((b, n) => {
      expect(b.height!.height).toBeCloseTo(ONE_HOUSE, 9)
      expect(b.height!.ground).toBeCloseTo(n * STEP - 0.15, 9)
    })
  })

  it('counts each house two storeys with two split levels, and the plan two storeys above ground', () => {
    const plan = row()
    expect(buildingHeights(plan).map((b) => b.storeys)).toEqual(Array(HOUSES).fill({ above: 2, below: 0, split: 2 }))
    const storeys = planStoreys(plan)
    expect([storeys.above, storeys.below]).toEqual([2, 0])
    const first = storeys.storeys.filter((s) => s.building === 'h0')
    expect(first.map((s) => [s.floors, s.split, s.floorToFloor])).toEqual([
      [['h0f0', 'h0b0'], ['h0b0'], expect.closeTo(2 * HALF, 9)],
      [['h0f1', 'h0b1'], ['h0b1'], null],
    ])
  })

  it('reads half levels by where the floors stand, whatever numbers their levels', () => {
    const plan = row({ whole: true })
    expect(buildingHeights(plan).map((b) => b.storeys)).toEqual(Array(HOUSES).fill({ above: 2, below: 0, split: 2 }))
  })

  it('gives floor to floor to the next floor over the same footprint, never to the half level beside it', () => {
    const levels = new Map(planLevels(row()).map((l) => [l.floor, l] as const))
    expect(levels.get('h0f0')).toMatchObject({ floorToFloor: 2 * HALF, over: ['h0f1'] })
    expect(levels.get('h0b0')).toMatchObject({ floorToFloor: 2 * HALF, over: ['h0b1'] })
    expect(levels.get('h0f1')).toMatchObject({ floorToFloor: 2.5 + SLAB_THICKNESS, over: [] })
    expect(levels.get('h5b1')).toMatchObject({ floorToFloor: 2.5 + SLAB_THICKNESS, over: [] })
  })

  it('still sets a floor to floor level on level, keeping each half level a half level up', () => {
    const plan = row({ count: 1 })
    const { set, problems } = levelsSetTo(plan, { floorToFloor: HALF, floors: ['h0f0'] })
    expect(problems).toEqual([])
    expect(set).toEqual([{ floor: 'h0f0', height: HALF - SLAB_THICKNESS, was: 2.5, set: true }])
  })

  it('measures each house on a sloping street from the lowest ground under its own walls', () => {
    // The street rises 0.6 m every 5 m along the row, as the houses do.
    const plan = row({ site: { ground: undefined, groundSides: { west: -0.15, east: -0.15 + HOUSES * STEP } } })
    const heights = buildingHeights(plan)
    expect(heights.map((b) => b.height!.from)).toEqual(Array(HOUSES).fill('under'))
    // The ground is one even slope through the sides, the outside faces a little past the axes: within a few centimetres.
    for (const b of heights) expect(b.height!.height).toBeCloseTo(ONE_HOUSE, 1)
  })

  it('measures a house that states its pad from the pad, as before', () => {
    const plan = row({ count: 2 })
    const padded = parseFloorPlan({ ...plan, buildings: plan.buildings!.map((b, n) => (n === 1 ? { ...b, pad: 0.2 } : b)) })
    const heights = buildingHeights(padded)
    expect(heights[1]!.height).toMatchObject({ from: 'pad', ground: 0.2 })
    expect(heights[0]!.height).toMatchObject({ from: 'site', ground: -0.15 })
  })
})

describe('ARE-76 what reads as before', () => {
  it('a row with no buildings named is one building, measured from the site\'s ground', () => {
    const plan = row({ named: false })
    expect(buildingHeight(plan)).toMatchObject({ from: 'site', ground: -0.15 })
    expect(groundLevel(plan).buildings.size).toBe(0)
  })

  it('a plain stack of whole storeys keeps a storey per level and floor to floor level to level', () => {
    const made = compileRoomsText(`plan "Block"
floor g "Ground" level 0 height 3
room a "Office" office 10 x 8 at 0,0
floor f1 "First" level 1 height 3
room b "Office" office 10 x 8 at 0,0
floor f2 "Second" level 2 height 3
room c "Office" office 10 x 8 at 0,0
`)
    expect(made.problems).toEqual([])
    const plan = parseFloorPlan(made.plan)
    const storeys = planStoreys(plan)
    expect([storeys.above, storeys.below]).toEqual([3, 0])
    expect(storeys.storeys.map((s) => s.split)).toEqual([[], [], []])
    expect(planLevels(plan).map((l) => l.over)).toEqual([['f1'], ['f2'], []])
  })
})
