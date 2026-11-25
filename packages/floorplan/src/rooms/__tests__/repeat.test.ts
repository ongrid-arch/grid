/**
 * WRT-4: one room type placed many times, a floor copied on its own line, and rooms whose walls
 * rise through several floors, all written once in rooms text. The hotel floor is the lab's
 * WR-6 case: twelve rooms of one type against the 103 parts of the hand-drawn original.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planAreaFigures } from '../../geometry/areas'
import { expandPatterns } from '../../geometry/patterns'
import { indexPlan } from '../../geometry/plan'
import { roomArea } from '../../geometry/room'
import { parseFloorPlan, type FloorPlan, type OpeningPattern } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

/** Each room's net area by name, as Grid measures it. */
function areasByName(plan: FloorPlan): Map<string, number> {
  const index = indexPlan(plan)
  return new Map(plan.rooms.map((room) => [room.name, roomArea(room, index)] as const))
}

describe('one room type placed many times (WR-6)', () => {
  it('writes the twelve-room hotel floor in at most 20 lines, one room type placed twelve times', () => {
    const text = read('hotel.rooms')
    const lines = text.replace(/\n$/, '').split('\n')
    expect(lines.length).toBeLessThanOrEqual(20)
    // One unit, and the two lines that place it six times each.
    expect(lines.filter((line) => line.startsWith('unit '))).toHaveLength(1)
    const placing = lines.filter((line) => /^(repeat|place) /.test(line))
    expect(placing.map((line) => line.split(' ')[1])).toEqual(['guest', 'guest'])
    expect(placing.reduce((n, line) => n + (line.startsWith('repeat') ? Number(line.split(' ')[2]) : 1), 0)).toBe(12)
    const plan = written(text)
    expect(plan.rooms.filter((room) => /^Room 3\d\d$/.test(room.name))).toHaveLength(12)
  })

  it('compiles to the same areas as the 103-part original, room by room and in total', () => {
    const original = parseFloorPlan(JSON.parse(read('hotel.plan.json')))
    expect(original.walls.length + original.rooms.length + original.openings.length).toBe(103)
    const plan = written(read('hotel.rooms'))
    const before = areasByName(original)
    const after = areasByName(plan)
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
    for (const [name, area] of before) expect(after.get(name), name).toBeCloseTo(area, 6)
    const a = planAreaFigures(original)
    const b = planAreaFigures(plan)
    expect(b.net.area).toBeCloseTo(a.net.area!, 6)
    expect(b.grossInternal.area).toBeCloseTo(a.grossInternal.area!, 6)
    expect(b.grossExternal.area).toBeCloseTo(a.grossExternal.area!, 6)
    expect(b.byUse).toEqual(a.byUse)
  })

  it('gives the repeated parts the same ids on every writing of the same file', () => {
    const text = read('hotel.rooms')
    const first = compileRoomsText(text).plan!
    const second = compileRoomsText(text).plan!
    const ids = (plan: typeof first): string[] => [...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id)
    expect(ids(second)).toEqual(ids(first))
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first.rooms.map((room) => room.id)).toEqual(expect.arrayContaining(['room-301', 'bath-301', 'room-312', 'bath-312', 'corridor']))
    expect(first.openings.map((opening) => opening.id)).toEqual(expect.arrayContaining(['door-301', 'bdoor-306', 'win-307', 'win-312']))
  })

  it('keeps the ids of the rooms already placed when the row grows by one', () => {
    const row = (n: number): string => [
      'walls outside 0.3 inside 0.1 height 2.6',
      'unit cell',
      '  room room "Cell {n}" office 3 x 4',
      '  window win in room south, centred, 1.2 wide',
      'end',
      `repeat cell ${n} east as A at 0,0`,
    ].join('\n')
    const four = compileRoomsText(row(4)).plan!
    const five = compileRoomsText(row(5)).plan!
    expect(four.rooms.map((room) => room.id)).toEqual(['room-A1', 'room-A2', 'room-A3', 'room-A4'])
    expect(five.rooms.map((room) => room.id).slice(0, 4)).toEqual(four.rooms.map((room) => room.id))
    expect(five.openings.map((opening) => opening.id).slice(0, 4)).toEqual(four.openings.map((opening) => opening.id))
  })

  it('places the first where the line says and the next ones beside it, with settings for the two ends only', () => {
    const plan = written([
      'walls outside 0.3 inside 0.1 height 2.6',
      'unit cell w=3',
      '  room room "Cell {n}" office $w x 4',
      'end',
      'repeat cell 3 east as 1 at 0,0 first w=2.5 last w=2',
    ].join('\n'))
    const widths = areasByName(plan)
    expect(widths.get('Cell 1')).toBeCloseTo(10, 6)
    expect(widths.get('Cell 2')).toBeCloseTo(12, 6)
    expect(widths.get('Cell 3')).toBeCloseTo(8, 6)
  })

  it('refuses a setting after first or last that is not name=value, and a count that is not whole', () => {
    const base = 'walls outside 0.3 inside 0.1 height 2.6\nunit cell w=3\n  room room "Cell {n}" office $w x 4\nend\n'
    expect(compileRoomsText(`${base}repeat cell 3 east as 1 at 0,0 first north of x`).problems[0]).toMatchObject({ code: 'rooms/syntax', line: 5 })
    expect(compileRoomsText(`${base}repeat cell 2.5 east as 1 at 0,0`).problems[0]!.message).toContain('a whole number of times')
    expect(compileRoomsText(`${base}room a "A" office 3 x 3\nrepeat cell 2 east of a as 1 at 9,9`).problems[0]!.message).toContain("already starts east of 'a'")
  })
})

describe('a floor copied, and walls that rise through several floors', () => {
  const block = [
    'walls outside 0.3 inside 0.15 height 2.8',
    'floor g "Ground floor" level 0',
    'room core "Stair" stair 2.6 x 5 at 0.15,0.15 through f2',
    'room hall "Entrance" corridor 6 x 5 east of core',
    'floor f1 "First floor" level 1',
    'room flat "Flat 1" living 6 x 5 east of core',
    'window w in flat south, centred, 1.8 wide',
    'floor f2 "Second floor" level 2 copy f1 with openings',
    'floor f3 "Roof room" level 3',
    'room loft "Loft" storage 4 x 4 at 0.15,0.15',
  ].join('\n')

  it('stands a room that rises through on every floor up to the one named, its walls in the same place', () => {
    const plan = written(block)
    const cores = plan.rooms.filter((room) => room.name === 'Stair')
    expect(cores.map((room) => [room.id, room.floor])).toEqual([['core', 'g'], ['f1-core', 'f1'], ['f2-core', 'f2']])
    const index = indexPlan(plan)
    for (const core of cores) expect(roomArea(core, index)).toBeCloseTo(13, 6)
    // The core's walls on each floor stand where the ground floor's stand.
    const place = (floor: string): string[] =>
      plan.walls.filter((w) => w.floor === floor && plan.rooms.find((r) => r.floor === floor && r.name === 'Stair')!.boundary.includes(w.id)).map((w) => `${w.start.join(',')} ${w.end.join(',')}`).sort()
    expect(place('f1')).toEqual(place('g'))
    expect(place('f2')).toEqual(place('g'))
    expect(plan.rooms.some((room) => room.floor === 'f3' && room.name === 'Stair')).toBe(false)
  })

  it('copies a floor from its floor line, the rooms risen through it kept once', () => {
    const plan = written(block)
    expect(plan.rooms.filter((room) => room.floor === 'f2').map((room) => room.name).sort()).toEqual(['Flat 1', 'Stair'])
    // LVL-16: the floor that writes the window first keeps its id.
    expect(plan.openings.map((opening) => opening.id)).toEqual(['w', 'f2-w'])
    const once = compileRoomsText(block)
    expect(JSON.stringify(compileRoomsText(block).plan)).toBe(JSON.stringify(once.plan))
  })

  it('writes the same plan from a floor line with copy as from a copy line of its own', () => {
    const own = block.replace('floor f2 "Second floor" level 2 copy f1 with openings', 'floor f2 "Second floor" level 2\ncopy f1 with openings')
    expect(JSON.stringify(compileRoomsText(own).plan)).toBe(JSON.stringify(compileRoomsText(block).plan))
  })

  it('refuses a room that rises through a floor not written after its own, naming the floors that are', () => {
    const result = compileRoomsText(block.replace('through f2', 'through f9'))
    expect(result.plan).toBeNull()
    expect(result.problems[0]).toMatchObject({ code: 'rooms/unknown-floor', line: 3 })
    expect(result.problems[0]!.message).toContain('Floors written after it: f1, f2, f3.')
    expect(compileRoomsText('unit u\n  room a "A" office 3 x 3 through f1\nend\nplace u as 1 at 0,0').problems[0]!.message).toContain('not inside a unit')
  })
})

describe("repeated rooms and copied floors with LVL-8's opening patterns", () => {
  // A row of cells written once and placed n times, its floor copied with its openings, and two
  // opening patterns in the plan file (rooms text writes none), on the row's outside walls and
  // repeated on the copy. The north wall is written reversed, so it starts where the row starts.
  const row = (n: number): string => [
    'walls outside 0.3 inside 0.1 height 2.6',
    'floor g "Ground floor" level 0',
    'unit cell',
    '  room room "Cell {n}" office 3 x 4',
    '  window win in room south, centred, 1.2 wide',
    'end',
    `repeat cell ${n} east as 1 at 0,0`,
    'wall room-1 north reversed',
    'floor f1 "First floor" level 1 copy g with openings',
  ].join('\n')
  const patterns: OpeningPattern[] = [
    { id: 'north-row', wall: 'g-ext-north', opening: { type: 'window', width: 1, height: 1.2, sill: 0.9 }, spacing: 3.1, margins: { start: 1 }, floors: ['f1'] },
    { id: 'south-vent', wall: 'g-ext-south', opening: { type: 'window', width: 0.4, height: 0.4, sill: 2 }, spacing: 3.1, margins: { start: 0.2 }, floors: ['f1'] },
  ]
  /** The plan as Grid reads it: rooms text written, the file's patterns kept beside it and expanded. */
  function placed(n: number): FloorPlan {
    const plan = written(row(n))
    const expansion = expandPatterns({ ...plan, patterns })
    expect(expansion.issues).toEqual([])
    return expansion.plan
  }
  const ids = (plan: FloorPlan): string[] => [...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id)
  const where = (plan: FloorPlan): Map<string, string> => new Map(plan.openings.map((o) => [o.id, `${o.wall} ${o.offset} ${o.width}`]))

  it('gives a patterned row the same ids on every writing, none shared, and keeps them when the row grows by one', () => {
    const four = placed(4)
    expect(ids(placed(4))).toEqual(ids(four))
    expect(JSON.stringify(placed(4))).toBe(JSON.stringify(four))
    // Both schemes on both floors: the unit's openings (as written on the floor that writes them
    // first, the copy's with its floor first, LVL-16) and the patterns' (floor after).
    expect(four.openings.map((o) => o.id)).toEqual(expect.arrayContaining(['win-1', 'f1-win-4', 'north-row-g-1', 'north-row-f1-4', 'south-vent-g-4', 'south-vent-f1-1']))
    expect(four.openings.filter((o) => o.id.startsWith('north-row-'))).toHaveLength(8)
    // No id is given twice, across walls, rooms and every opening.
    expect(new Set(ids(four)).size).toBe(ids(four).length)

    const five = placed(5)
    expect(new Set(ids(five)).size).toBe(ids(five).length)
    // Every part of the row of four keeps its id in the row of five, and every opening its place.
    expect(ids(five)).toEqual(expect.arrayContaining(ids(four)))
    const after = where(five)
    for (const [id, at] of where(four)) expect(after.get(id), id).toBe(at)
    expect(five.openings.map((o) => o.id)).toEqual(expect.arrayContaining(['win-5', 'f1-win-5', 'north-row-g-5', 'north-row-f1-5', 'south-vent-f1-5']))
  })

  it('refuses a pattern line, in a unit or out of one, and says where a pattern goes', () => {
    const out = compileRoomsText('room a "A" office 3 x 3\npattern north-row on ext-north every 3')
    expect(out.plan).toBeNull()
    expect(out.problems[0]).toMatchObject({ code: 'rooms/syntax', line: 2 })
    expect(out.problems[0]!.message).toContain('an opening pattern is not rooms text')
    expect(out.problems[0]!.message).toContain('"patterns"')
    const raw = compileRoomsText('room a "A" office 3 x 3\nraw pattern {"id":"p"}')
    expect(raw.problems[0]!.message).toContain('an opening pattern is not rooms text')
    const inUnit = compileRoomsText('unit u\n  room a "A" office 3 x 3\n  pattern p on a south\nend\nplace u as 1 at 0,0')
    expect(inUnit.plan).toBeNull()
    expect(inUnit.problems[0]).toMatchObject({ code: 'rooms/syntax', line: 3 })
    expect(inUnit.problems[0]!.message).toContain('a unit cannot hold one')
  })
})
