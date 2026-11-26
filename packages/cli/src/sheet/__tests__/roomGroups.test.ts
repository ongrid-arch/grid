import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { sumText } from '@ongrid/floorplan/geometry/rounding'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { sheetPages } from '../pages'
import { nameLessNumber } from '../roomGroups'

/** SHT-21: a client floor's room list, grouped: rooms alike are one row with their sum. */
const date = new Date('2026-11-26T12:00:00Z')

/** A corridor with `count` alike bedrooms along its south side, numbered 1 on, and a larger one at its end. */
function wing(count: number): LoadedPlan {
  const text = `plan "Care Wing"
building health
walls outside 0.3 inside 0.12 height 2.8
unit bed
  room room "Bedroom {n}" bedroom 3.6 x 4.2
  door door between room and hall, centred, 0.9 wide, opens into room, hinged west
end
repeat bed ${count} east as 1 at 0,0
room big "Bedroom ${count + 1}" bedroom 5 x 4.2 east of ${count}
room hall "Hall" corridor * x 1.8 north of 1 until big
door entry in hall west, centred, 1.2 wide, opens in, hinged north
`
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  const { issues, broken } = validatePlan(plan)
  return { file: 'wing', plan, issues, broken }
}

describe('a client floor\'s rooms, grouped (SHT-21)', () => {
  const loaded = wing(60)
  const floorPage = sheetPages(loaded, null, 'client', { name: 'wing', date }).pages.find((p) => p.kind === 'floor')!
  const rows = floorPage.table!.rows

  it('gives sixty alike bedrooms one row, "60 × Bedroom", with the area of each and their sum', () => {
    const row = rows.find((r) => r.name === '60 × Bedroom')!
    expect(row).toBeDefined()
    const each = planAreas(surveyPlan(loaded.plan)).floors[0]!.rooms.find((r) => r.name === 'Bedroom 1')!.net!
    expect(row.detail).toBe(`${(Math.round(each * 10) / 10).toFixed(1)} m² each`)
    expect(Number(row.area)).toBeCloseTo(each * 60, 0)
  })

  it('keeps a room of another size apart, by its own name', () => {
    expect(rows.map((r) => r.name)).toEqual(['60 × Bedroom', 'Bedroom 61', 'Hall'])
  })

  it('still adds up to the floor\'s net area', () => {
    const floor = planAreas(surveyPlan(loaded.plan)).floors[0]!
    const sum = rows.reduce((total, r) => total + Number(r.area), 0)
    expect(sum.toFixed(1)).toBe(floorPage.table!.total!.area)
    expect(floorPage.table!.total!.area).toBe(sumText([floor.net], floor.net, 1).total)
  })

  it('keeps one row per room on the check sheet', () => {
    const check = sheetPages(loaded, null, 'check', { name: 'wing', date }).pages.find((p) => p.kind === 'floor')!
    expect(check.table!.rows.length).toBe(62)
  })

  it('leaves two alike rooms a row each, by their own names, as a house\'s bedrooms', () => {
    const two = sheetPages(wing(2), null, 'client', { name: 'wing', date }).pages.find((p) => p.kind === 'floor')!
    expect(two.table!.rows.map((r) => r.name)).toEqual(['Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Hall'])
  })

  it('takes the number off the end of a name, and only there', () => {
    expect(nameLessNumber('Bedroom 12')).toBe('Bedroom')
    expect(nameLessNumber('Room-3b')).toBe('Room')
    expect(nameLessNumber('Flat 2 Kitchen')).toBe('Flat 2 Kitchen')
    expect(nameLessNumber('101')).toBe('')
  })
})
