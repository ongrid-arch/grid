/**
 * LVL-19: a stair and a lift written once, rising `through` to a roof floor with a terrace, join
 * the roof to the ground floor, and on a floor where nothing leads into them they take their doors
 * up from the floor they are written on, so the terrace is entered from the stair.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { checkPlanSanity } from '../../geometry/rules/check'
import { floorsWithNoStair } from '../../geometry/rules/noStair'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const block = (roof: string[], first: string[] = []): string =>
  [
    'walls outside 0.3 inside 0.1 height 2.8',
    'floor g "Ground floor" level 0',
    'room corr "Corridor" corridor 8 x 1.6 at 0.15,0.15',
    'room stair "Stair" stair 2 x 1.6 west of corr through roof',
    'room lift "Lift" lift 1.6 x 1.6 west of stair through roof',
    'room shop "Shop" retail 8 x 4 north of corr',
    'door d-front in corr east, centred, 1.0 wide, opens in',
    'door d-shop between shop and corr, centred, 0.9 wide, opens into shop',
    'opening o-stair between corr and stair, centred, 1.0 wide',
    'opening o-lift between stair and lift, centred, 1.0 wide',
    'floor f1 "First floor" level 1',
    'room landing "Landing" corridor 8 x 1.6 at 0.15,0.15',
    'room flat "Flat" living 8 x 4 north of landing',
    'door d-flat between flat and landing, centred, 0.9 wide, opens into flat',
    ...first,
    'floor roof "Roof" level 2',
    ...roof,
  ].join('\n')

const TERRACE = 'room terrace "Roof terrace" - 8 x 5.7 at 0.15,0.15 outdoor terrace unroofed'

function written(text: string) {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return { plan: parseFloorPlan(result.plan), result }
}

const joins = (plan: FloorPlan, id: string): string[] => {
  const opening = plan.openings.find((o) => o.id === id)!
  return plan.rooms.filter((r) => r.boundary.includes(opening.wall)).map((r) => r.id).sort()
}

describe('a stair and lift written through to the roof (LVL-19)', () => {
  it("carries the stair's door to the terrace on the roof, and the floors are joined", () => {
    const { plan, result } = written(block([TERRACE], ['opening o-stair1 between landing and stair, centred, 1.0 wide']))
    const carried = plan.openings.find((o) => o.id === 'roof-o-stair')
    expect(carried).toMatchObject({ type: 'opening', width: 1 })
    expect(joins(plan, 'roof-o-stair')).toEqual(['roof-stair', 'terrace'])
    // The opening between the stair and the lift rose with them already, so the lift is reached.
    expect(plan.openings.some((o) => o.id === 'roof-o-lift')).toBe(true)
    // A floor that writes its own door into the stair keeps it and gets none carried.
    expect(plan.openings.some((o) => o.id === 'f1-o-stair')).toBe(false)
    const warning = result.warnings.find((w) => w.code === 'rooms/door-carried')
    expect(warning?.message).toContain("'o-stair' of 'stair' on floor 'g' is 'roof-o-stair' on floor 'roof', into 'terrace'")
    expect(floorsWithNoStair(plan)).toEqual([])
    const report = checkPlanSanity(plan)
    expect(report.notChecked.filter((n) => n.reason === 'no_stairs')).toEqual([])
    expect(report.findings.filter((f) => f.code === 'room_without_door' || f.code === 'no_stair')).toEqual([])
  })

  it('carries a door to every floor the stair rises through that writes none of its own', () => {
    const { plan } = written(block([TERRACE]))
    expect(joins(plan, 'f1-o-stair')).toEqual(['f1-stair', 'landing'])
    expect(joins(plan, 'roof-o-stair')).toEqual(['roof-stair', 'terrace'])
  })

  it('places the carried door where it is written, in the same span', () => {
    const { plan } = written(block([TERRACE]))
    const at = (id: string) => {
      const o = plan.openings.find((x) => x.id === id)!
      const w = plan.walls.find((x) => x.id === o.wall)!
      const [sx, sy] = w.start as unknown as [number, number]
      const [ex, ey] = w.end as unknown as [number, number]
      const L = Math.hypot(ex - sx, ey - sy)
      const point = (d: number) => [sx + ((ex - sx) * d) / L, sy + ((ey - sy) * d) / L].map((v) => Math.round(v * 1000) / 1000)
      return [point(o.offset), point(o.offset + o.width)].sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!)
    }
    expect(at('roof-o-stair')).toEqual(at('o-stair'))
  })

  it("never carries a door that leads to the outside, such as a lift's street door", () => {
    const text = block([TERRACE]).replace('opening o-lift between stair and lift, centred, 1.0 wide', 'door d-lift in lift west, centred, 0.9 wide, opens in')
    const { plan } = written(text)
    expect(plan.openings.some((o) => o.id === 'd-lift')).toBe(true)
    expect(plan.openings.some((o) => o.id.endsWith('-d-lift'))).toBe(false)
  })

  it('carries nothing when the floor writes its own door into the stair', () => {
    const { plan, result } = written(block([TERRACE, 'door d-terrace between terrace and stair, centred, 0.9 wide, opens into terrace']))
    expect(plan.openings.some((o) => o.id === 'roof-o-stair')).toBe(false)
    expect(joins(plan, 'd-terrace')).toEqual(['roof-stair', 'terrace'])
    expect(result.warnings.find((w) => w.code === 'rooms/door-carried')?.message ?? '').not.toContain("floor 'roof'")
  })

  it('carries nothing where the stair faces the outside on the floor it rises to', () => {
    // The terrace stands east of the stair's place only from 2 m north: the stair's door faces the open air.
    const { plan } = written(block(['room terrace "Roof terrace" - 8 x 3.6 at 0.15,2.25 outdoor terrace unroofed']))
    expect(plan.openings.some((o) => o.id === 'roof-o-stair')).toBe(false)
  })

  it('reads back as rooms text that writes the same plan again', () => {
    const { plan } = written(block([TERRACE]))
    const back = readRoomsText(plan)
    expect(back.rawFloors).toEqual([])
    const again = written(back.text).plan
    expect(again.openings.map((o) => o.id).sort()).toEqual(plan.openings.map((o) => o.id).sort())
  })
})
