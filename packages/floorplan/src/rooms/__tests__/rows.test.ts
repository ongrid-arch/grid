/**
 * CNT-47: items laid out in rows. A hall whose inside faces run from 0,0 to 12,8: racks in rows
 * against its north side, seats at a point, and the read-back that writes them as row lines.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { validatePlan } from '../../geometry/validate'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { rowOfWords } from '../rows'

const HALL = ['walls outside 0.3 inside 0.1 height 4', 'room hall "Hall" office 12 x 8 at 0,0']
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HALL, ...lines].join('\n'))
const planOf = (...lines: string[]): FloorPlan => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}
const itemOf = (plan: FloorPlan, id: string) => plan.items!.find((i) => i.id === id)!

describe('a row line (CNT-47)', () => {
  it('lays a row of racks against a side, centred on it', () => {
    const plan = planOf('row r rack in hall against north, repeat 10')
    expect(plan.items!.map((i) => i.id)).toEqual(Array.from({ length: 10 }, (_, n) => `r-${n + 1}`))
    // Ten racks 0.6 m wide touch: 6 m of row centred on the 12 m side, backs on the north face.
    const first = itemOf(plan, 'r-1')
    const last = itemOf(plan, 'r-10')
    expect(first).toMatchObject({ kind: 'rack', library: 'rack', turn: 180, size: [0.6, 1.2] })
    expect(first.at[1]).toBeCloseTo(8 - 0.6, 9)
    // Turned 180, an item's left is to the east: the row runs from east to west.
    expect(Math.max(first.at[0], last.at[0])).toBeCloseTo(9 - 0.3, 9)
    expect(Math.min(first.at[0], last.at[0])).toBeCloseTo(3 + 0.3, 9)
    expect(validatePlan(plan).issues.filter((i) => i.entity === 'item')).toEqual([])
  })

  it('lays several rows, each in front of the last, from an end of the side', () => {
    const plan = planOf('row r rack in hall against north, at west, repeat 5 every 0.6, 3 rows every 2.4')
    expect(plan.items).toHaveLength(15)
    expect(plan.items!.map((i) => i.id).slice(0, 6)).toEqual(['r-1-1', 'r-1-2', 'r-1-3', 'r-1-4', 'r-1-5', 'r-2-1'])
    const xs = plan.items!.filter((i) => i.id.startsWith('r-1-')).map((i) => i.at[0])
    expect(Math.min(...xs)).toBeCloseTo(0.3, 9)
    expect(itemOf(plan, 'r-2-1').at[1]).toBeCloseTo(itemOf(plan, 'r-1-1').at[1] - 2.4, 9)
    expect(itemOf(plan, 'r-3-1').at[1]).toBeCloseTo(8 - 0.6 - 4.8, 9)
  })

  it('lays seats at a point, along their backs and in rows behind', () => {
    const plan = planOf('row s seat at 2,1 repeat 4 every 0.55, 2 rows every 0.9 behind')
    expect(plan.items).toHaveLength(8)
    expect(itemOf(plan, 's-1-1').at).toEqual([2, 1])
    expect(itemOf(plan, 's-1-4').at).toEqual([3.65, 1])
    expect(itemOf(plan, 's-2-1').at).toEqual([2, 0.1])
    expect(itemOf(plan, 's-2-1')).toMatchObject({ kind: 'seat' })
  })

  it('takes generic equipment of its own size, and rows of a kind with clear floor', () => {
    const plan = planOf('row ups "UPS" equipment 1.2 x 0.8 1.9 high at 2,3 repeat 2 every 1.5')
    expect(itemOf(plan, 'ups-2')).toMatchObject({ kind: 'equipment', label: 'UPS', size: [1.2, 0.8], height: 1.9, at: [3.5, 3] })
    // Unstated, rows are their depth and the clear floor kept in front apart: the aisle.
    const benches = planOf('row b lab-bench at 3,1 repeat 1, 2 rows')
    expect(itemOf(benches, 'b-2-1').at[1]).toBeCloseTo(1 + 0.75 + 1, 9)
  })

  it('refuses a row it cannot lay out, naming why', () => {
    expect(write('row r rack in hall against north').problems[0]!.message).toMatch(/after 'repeat'/)
    expect(write('row r rack in hall against north, repeat 0').problems[0]!.message).toMatch(/whole number, 1 or more/)
    expect(write('row r rack in hall against north, repeat 3 every 0.4').problems[0]!.message).toMatch(/0\.4 m apart, items 0\.6 m wide stand in each other/)
    expect(write('row r rack in hall against north, repeat 30').problems[0]!.message).toMatch(/does not fit along the north side of room hall/)
    expect(write('row r rack in hall against north, repeat 2, 2 rows behind').problems[0]!.message).toMatch(/takes no 'behind'/)
    expect(write('row r rack at 1,1 repeat 300 every 0.6, 300 rows every 2').problems[0]!.message).toMatch(/more than the 50000 a plan may hold/)
    expect(write('item r-2 wc at 1,1', 'row r rack at 3,3 repeat 3').problems[0]!.message).toMatch(/the item id 'r-2' is used by two items/)
    expect(() => rowOfWords(['row', 'r', 'rack', 'at', '1,1', 'repeat', '2', 'sideways'], [], 0)).toThrow(/'sideways' is not a word a row knows/)
  })
})

describe('the read-back of rows (CNT-47)', () => {
  it('writes a run of items that is a row as its row line, and the text gives back the same items', () => {
    const plan = planOf(
      'item desk1 desk at 10,2',
      'row r rack in hall against north, at west, repeat 5, 3 rows every 2.4',
      'row s seat at 2,1 repeat 4 every 0.55, 2 rows every 0.9 behind',
      'row k kennel 0.8 x 0.8 1 high clear back 0.2 at 6,1 repeat 3',
    )
    const text = readRoomsText(plan).text
    const rowLines = text.split('\n').filter((line) => line.startsWith('row '))
    expect(rowLines).toHaveLength(3)
    expect(rowLines[0]).toMatch(/^row r rack at 2\.7,7\.4 turn 180 repeat 5 every 0\.6, 3 rows every 2\.4$/)
    expect(rowLines[1]).toBe('row s seat at 2,1 repeat 4 every 0.55, 2 rows every 0.9 behind')
    expect(rowLines[2]).toBe('row k kennel 0.8 x 0.8 1 high clear back 0.2 at 6,1 repeat 3 every 0.8')
    expect(text).toContain('item desk1 desk at 10,2')
    const again = parseFloorPlan(compileRoomsText(text).plan)
    expect(again.items).toEqual(plan.items)
  })

  it('writes items one by one when they are not exactly a row', () => {
    const plan = planOf('row s seat at 2,1 repeat 3 every 0.6')
    const moved = parseFloorPlan({ ...plan, items: plan.items!.map((i) => (i.id === 's-2' ? { ...i, at: [2.7, 1] } : i)) })
    const text = readRoomsText(moved).text
    expect(text).not.toMatch(/^row /m)
    expect(text.split('\n').filter((line) => line.startsWith('item s-'))).toHaveLength(3)
  })
})
