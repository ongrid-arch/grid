/**
 * LVL-23: a site of buildings, each stacking its floors from its own ground. A building may state
 * its `pad`, the level of its own ground; its floors stand on it, and its ground floor, way out,
 * height, storeys, site distances and IFC building are its own.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { checkPlanSanity } from '../rules'
import { floorsWithNoStair } from '../rules/noStair'
import { floorElevations } from '../elevations'
import { groundLevel } from '../ground'
import { buildingHeight, buildingHeights } from '../storeys'
import { siteMeasures } from '../site'
import { toIfc } from '../export/ifc'

/** One row of two floors, its rooms `x` metres east; `elevation` on its ground floor when given. */
const row = (id: string, x: number, elevation?: number, stair = true): string => `floor ${id}g "${id} ground" level 0${elevation === undefined ? '' : ` elevation ${elevation}`}
room liv "Living" living 8 x 6 at ${x},0
room st "Stair" stair 2 x 6 east of liv
door d1 in liv south, centred, 0.9 wide
door d2 between liv and st, centred, 0.9 wide
floor ${id}1 "${id} first" level 1
room bed "Bed" bedroom 8 x 6 at ${x},0
${stair ? 'room st "Stair" stair 2 x 6 east of bed\ndoor d3 between bed and st, centred, 0.9 wide' : 'room bath "Bath" bathroom 2 x 6 east of bed'}
`

const site = (rows: string[], buildings?: { id: string; floors: string[]; pad?: number }[]): FloorPlan => {
  const made = compileRoomsText(`plan "Two rows"\nplot 80 x 20 at -5,-5\n${rows.join('')}`)
  expect(made.problems).toEqual([])
  return parseFloorPlan({ ...(made.plan as object), ...(buildings === undefined ? {} : { buildings: buildings.map((b) => ({ name: `Row ${b.id.toUpperCase()}`, ...b })) }) })
}

const findings = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => f.code)

describe('LVL-23 buildings on their own pads', () => {
  const pads = () =>
    site([row('a', 0), row('b', 40)], [
      { id: 'a', floors: ['ag', 'a1'], pad: 2.5 },
      { id: 'b', floors: ['bg', 'b1'], pad: 0.4 },
    ])

  it('stacks each building from its pad', () => {
    const levels = floorElevations(pads()).floors
    expect(levels.get('ag')!.floorLevel).toBeCloseTo(2.5, 9)
    expect(levels.get('a1')!.floorLevel).toBeCloseTo(2.5 + 2.7 + 0.25, 9)
    expect(levels.get('bg')!.floorLevel).toBeCloseTo(0.4, 9)
  })

  it('gives each building its own ground floor, so no way out is lost on a pad too high for one ground', () => {
    const plan = pads()
    const ground = groundLevel(plan)
    expect(ground.groundFloors.map((f) => f.id)).toEqual(['ag', 'bg'])
    expect(ground.above.get('ag')).toBeCloseTo(0, 9)
    expect(ground.aboveGround('ag')).toBe(false)
    expect(ground.groundOf('a1')).toBe(2.5)
    expect([...ground.buildings]).toEqual([
      ['a', { level: 2.5, from: 'pad' }],
      ['b', { level: 0.4, from: 'pad' }],
    ])
    expect(findings(plan)).toEqual([])
  })

  it('measures two identical rows on different pads to the same height, each from its pad, with its own storeys', () => {
    const heights = buildingHeights(pads())
    expect(heights.map((b) => [b.id, b.height!.height, b.height!.from, b.storeys])).toEqual([
      ['a', expect.closeTo(5.9, 9), 'pad', { above: 2, below: 0, split: 0 }],
      ['b', expect.closeTo(5.9, 9), 'pad', { above: 2, below: 0, split: 0 }],
    ])
  })

  it('names its own building\'s ground floor for a floor with no stair', () => {
    const plan = site([row('a', 0), row('b', 40, undefined, false)], [
      { id: 'a', floors: ['ag', 'a1'], pad: 2.5 },
      { id: 'b', floors: ['bg', 'b1'], pad: 0.4 },
    ])
    expect(floorsWithNoStair(plan)).toEqual([{ floor: 'b1', from: 'bg' }])
  })

  it('measures each building on the site, beside the whole', () => {
    const measured = siteMeasures(pads())
    expect(measured.buildings!.map((b) => [b.id, b.footprint!.area])).toEqual([
      ['a', expect.closeTo(measured.footprint!.area / 2, 6)],
      ['b', expect.closeTo(measured.footprint!.area / 2, 6)],
    ])
    const edges = (id: string): number[] => measured.buildings!.find((b) => b.id === id)!.edges.map((e) => e.distance)
    // The same distance to the south edge, 40 m apart along it.
    expect(edges('a')[0]).toBeCloseTo(edges('b')[0]!, 6)
    expect(edges('b')[3]! - edges('a')[3]!).toBeCloseTo(40, 6)
  })

  it('writes one IFC building for each, holding its own storeys', () => {
    const ifc = toIfc(pads())
    const buildings = ifc.split('\n').filter((line) => line.includes('IFCBUILDING('))
    expect(buildings).toHaveLength(2)
    expect(buildings.map((line) => /'(Row [AB])'/.exec(line)?.[1])).toEqual(['Row A', 'Row B'])
    expect(ifc.split('\n').filter((line) => line.includes('IFCBUILDINGSTOREY('))).toHaveLength(4)
  })
})

describe('LVL-23 a stepped row with no pad', () => {
  // Six houses stepping up a street 0.6 m each, each house stating its street floor's level.
  const houses = (named: boolean): FloorPlan => {
    const ids = ['h', 'i', 'j', 'k', 'm', 'n']
    return site(
      ids.map((id, n) => row(id, n * 10, n * 0.6)),
      named ? ids.map((id) => ({ id, floors: [`${id}g`, `${id}1`] })) : undefined
    )
  }

  it('measures each house from its own ground floor, six of two storeys', () => {
    const heights = buildingHeights(houses(true))
    expect(heights.map((b) => b.height!.from)).toEqual(Array(6).fill('floor'))
    for (const b of heights) expect(b.height!.height).toBeCloseTo(5.9, 9)
    expect(heights.map((b) => b.storeys)).toEqual(Array(6).fill({ above: 2, below: 0, split: 0 }))
  })

  it('checks every house\'s way out from its own street floor and sets no floor against a neighbour', () => {
    const plan = houses(true)
    expect(groundLevel(plan).groundFloors.map((f) => f.id)).toEqual(['hg', 'ig', 'jg', 'kg', 'mg', 'ng'])
    expect(findings(plan)).toEqual([])
  })
})

describe('LVL-23 a plan that names no building', () => {
  it('reads as before: one ground, measured from the ground floor', () => {
    const plan = site([row('a', 0)])
    const ground = groundLevel(plan)
    expect(ground.buildings.size).toBe(0)
    expect(ground.groundFloors.map((f) => f.id)).toEqual(['ag'])
    expect(buildingHeight(plan)).toEqual({ height: expect.closeTo(5.9, 9), floor: 'a1', ground: 0, groundStated: false, from: 'floor' })
    expect(siteMeasures(plan).buildings).toBeUndefined()
    expect(toIfc(plan).split('\n').filter((line) => line.includes('IFCBUILDING('))).toHaveLength(1)
  })
})
