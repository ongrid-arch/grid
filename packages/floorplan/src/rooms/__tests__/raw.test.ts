/**
 * WRT-27: a raw wall or room with no floor is on the floor of the floor line above it, as a room
 * line is; a raw part naming a floor the text does not write, or a raw opening in a wall of
 * another floor, is refused with its line; and the answer counts and measures every part
 * written, raw or not.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan } from '../../types/floorplan'
import { roomsAnswer } from '../answer'
import { compileRoomsText } from '../compile'

/** A 12 x 9 m pavilion inside, its four walls 0.3 m thick, written raw; `floor` added to each part when given. */
function pavilion(floor?: string, prefix = ''): string {
  const on = floor === undefined ? '' : `, "floor": "${floor}"`
  const wall = (id: string, a: [number, number], b: [number, number]): string =>
    `raw wall {"id": "${prefix}${id}", "start": [${a.join(', ')}], "end": [${b.join(', ')}], "thickness": 0.3, "height": 3, "kind": "exterior"${on}}`
  return [
    wall('p1', [-0.15, -0.15], [12.15, -0.15]),
    wall('p2', [12.15, -0.15], [12.15, 9.15]),
    wall('p3', [12.15, 9.15], [-0.15, 9.15]),
    wall('p4', [-0.15, 9.15], [-0.15, -0.15]),
    `raw room {"id": "${prefix}hall", "name": "Hall", "boundary": ["${prefix}p1", "${prefix}p2", "${prefix}p3", "${prefix}p4"]${on}}`,
  ].join('\n')
}

const GROUND = 'walls outside 0.3 inside 0.1 height 3\nfloor ground "Ground floor" level 0\nroom shop "Shop" - 12 x 9 at 0,0\n'

describe('raw lines are on the floor they are written under (WRT-27)', () => {
  it('puts raw walls and rooms with no floor on the floor line above them', () => {
    const result = compileRoomsText(`${GROUND}floor upper "Upper floor" level 1 elevation 3.3\n${pavilion()}\n`)
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    expect(plan.walls.filter((w) => w.id.startsWith('p')).map((w) => w.floor)).toEqual(['upper', 'upper', 'upper', 'upper'])
    expect(plan.rooms.find((r) => r.id === 'hall')!.floor).toBe('upper')
    const codes = validatePlan(plan).issues.map((i) => i.code)
    expect(codes.filter((c) => c.includes('unknown-floor') || c.includes('overlap'))).toEqual([])
  })

  it('keeps the floor a raw part states, when the text writes it', () => {
    const result = compileRoomsText(`walls outside 0.3 inside 0.1 height 3\nfloor ground "Ground floor" level 0\nfloor upper level 1 elevation 3.3\n${pavilion('ground')}\n`)
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    expect(plan.rooms.find((r) => r.id === 'hall')!.floor).toBe('ground')
  })

  it('refuses a raw part that names a floor the text does not write, naming its line', () => {
    const result = compileRoomsText(`${GROUND}${pavilion('roof')}\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/unknown-floor', 4]])
    expect(result.problems[0]!.message).toContain('Line 4')
    expect(result.problems[0]!.message).toContain("'roof'")
    expect(result.problems[0]!.message).toContain('ground')
  })

  it('refuses a raw opening in a wall of another floor, naming its line', () => {
    const opening = 'raw opening {"id": "d9", "wall": "ground-ext-south", "type": "door", "offset": 1, "width": 0.9, "height": 2.1}'
    const result = compileRoomsText(`${GROUND}floor upper level 1 elevation 3.3\nroom flat "Flat" - 12 x 9 at 0,0\n${opening}\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 6]])
    expect(result.problems[0]!.message).toContain("'ground-ext-south'")
    expect(result.problems[0]!.message).toContain("'upper'")
  })

  it('gives a raw part no floor when the text writes no floor line', () => {
    const result = compileRoomsText(`${pavilion()}\n`)
    expect(result.problems).toEqual([])
    const plan = result.plan!
    expect([...plan.walls, ...plan.rooms].every((part) => !('floor' in part))).toBe(true)
  })
})

describe('the answer counts and measures raw parts (WRT-27)', () => {
  it('counts and measures text that is all raw lines', () => {
    const result = compileRoomsText(`plan "Pavilion"\n${pavilion()}\n`)
    expect(result.problems).toEqual([])
    const hall = result.rooms.find((r) => r.id === 'hall')!
    expect(hall.raw).toBe(true)
    expect(hall.area).toBeCloseTo(108, 6)
    expect(result.walls.filter((w) => w.raw === true).map((w) => w.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(result.walls.find((w) => w.id === 'p1')!.length).toBeCloseTo(12.3, 6)
    const lines = roomsAnswer(result)
    expect(lines[0]).toBe('1 floor, 1 room; 0 walls and their kinds worked out; 0 openings placed; 108.00 m² inside in all.')
    expect(lines[1]).toContain('walls 4, rooms 1, openings 0')
  })

  it('counts raw parts with the rooms worked out, on every floor', () => {
    const result = compileRoomsText(`${GROUND}floor upper "Upper floor" level 1 elevation 3.3\n${pavilion()}\n`)
    const lines = roomsAnswer(result)
    expect(lines[0]).toMatch(/^2 floors, 2 rooms; 4 walls and their kinds worked out; 0 openings placed; 216\.00 m² inside in all\.$/)
    expect(lines.some((line) => line.includes('walls 4, rooms 1, openings 0'))).toBe(true)
  })

  it('says nothing of raw parts when none were written', () => {
    const lines = roomsAnswer(compileRoomsText(GROUND))
    expect(lines.some((line) => line.includes('raw'))).toBe(false)
  })
})
