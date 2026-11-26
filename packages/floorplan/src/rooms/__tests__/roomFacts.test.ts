/**
 * WRT-74: a room's number and facts of the person's own on its rooms text line (`number "2.03"`,
 * `dept "ED"`, `facts department=Sales capacity=4`), and the read-back writing them on the line,
 * so the text writes the same plan again.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText } from '../index'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const HEAD = ['walls outside 0.3 inside 0.1 height 2.7']

const written = (lines: readonly string[]): FloorPlan => {
  const result = compileRoomsText([...HEAD, ...lines].join('\n'))
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}

const refused = (lines: readonly string[]): string => {
  const result = compileRoomsText([...HEAD, ...lines].join('\n'))
  expect(result.plan).toBeNull()
  return result.problems.map((p) => p.message).join('\n')
}

describe('a room\'s number and facts in rooms text (WRT-74)', () => {
  it('states the number, the department and the facts of the rooms whose lines say, each value typed', () => {
    const plan = written([
      'room office "Office" office 4 x 4 at 0,0 number "2.03" dept "ED"',
      'room meet "Meeting" office 3 x 4 east of office facts department=Sales capacity=4 bookable=yes code="007" "head count"=8 floor-finish=Café',
      'room store "Store" storage 2 x 4 east of meet',
    ])
    const [office, meet, store] = plan.rooms
    expect(office!.number).toBe('2.03')
    expect(office!.properties).toEqual({ department: 'ED' })
    expect(meet!.number).toBeUndefined()
    expect(meet!.properties).toEqual({ department: 'Sales', capacity: 4, bookable: true, code: '007', 'head count': 8, 'floor-finish': 'Café' })
    expect(store!.properties).toBeUndefined()
    expect(store!.number).toBeUndefined()
  })

  it('takes the words in any order after the place, and an unquoted number', () => {
    const plan = written(['room lab "Lab" office facts zone=B 4 x 4 at 0,0 number 101'])
    expect(plan.rooms[0]!.number).toBe('101')
    expect(plan.rooms[0]!.properties).toEqual({ zone: 'B' })
  })

  it('refuses a fact with no value, one fact given twice, and facts with none after them', () => {
    expect(refused(['room a "A" office 4 x 4 at 0,0 facts capacity=']))
      .toContain("the fact 'capacity' has no value")
    expect(refused(['room a "A" office 4 x 4 at 0,0 dept ED facts Department=Sales']))
      .toContain("is given 'department' and 'Department', which name one fact")
    expect(refused(['room a "A" office 4 x 4 at 0,0 facts']))
      .toContain("write each fact after 'facts' as name=value")
    expect(refused(['room a "A" office 4 x 4 at 0,0 number 1 number 2']))
      .toContain("is given 'number' and 'number'")
  })

  it('refuses them in a unit, which is placed many times', () => {
    const message = refused([
      'unit desk',
      '  room d "Desk" office 2 x 2 at 0,0 dept Sales',
      'end',
      'place desk as d1 at 0,0',
    ])
    expect(message).toContain("'dept' is not written in a unit")
    expect(message).toContain('grid_set_facts')
  })

  it('names the words when a room line has one it does not know', () => {
    expect(refused(['room a "A" office 4 x 4 at 0,0 department Sales'])).toContain("'facts <name>=<value> ...'")
  })

  it('reads them back on the room line, and the text writes the same plan again', () => {
    const plan = written([
      'room office "Office" office 4 x 4 at 0,0 number "2.03" facts department=ED "head count"=3 open=no',
      'room meet "Meeting" office 3 x 4 east of office facts code="007" note="Sales, east"',
    ])
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toMatch(/^room office "Office" office .* number "2\.03" facts department=ED "head count"=3 open=no$/m)
    expect(reading.text).toMatch(/^room meet "Meeting" office .* facts code=007 note="Sales, east"$/m)
    const again = parseFloorPlan(compileRoomsText(reading.text).plan)
    expect(again.rooms.map((r) => [r.number, r.properties])).toEqual(plan.rooms.map((r) => [r.number, r.properties]))
  })

  it('reads back a plan file\'s numbers and facts, and writes them again', () => {
    const office = parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/facts-office.json'), 'utf8')))
    const reading = readRoomsText(office)
    expect(reading.text).toMatch(/number "G\.02" facts department=Sales "head count"=8 finish=Carpet/)
    const again = compileRoomsText(reading.text)
    expect(again.plan, JSON.stringify(again.problems)).not.toBeNull()
    const rooms = new Map(parseFloorPlan(again.plan).rooms.map((r) => [r.id, r] as const))
    for (const room of office.rooms) {
      expect(rooms.get(room.id)?.number, room.id).toBe(room.number)
      expect(rooms.get(room.id)?.properties, room.id).toEqual(room.properties)
    }
  })
})
