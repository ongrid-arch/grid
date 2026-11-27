/**
 * LVL-25: rooms numbered by their floor. `{level}` (or `{floor}`) in a label or a name is the
 * floor's level, and a copy of the floor numbers by its own level what was numbered by one.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { countedLabel, withLevel } from '../levels'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const UNIT = [
  'unit key flat "Studio" "Flat {n}"',
  '  room room "Room {n}" bedroom 3.2 x 4',
  '  door door between room and corridor, centred, 0.9 wide',
  'end',
]

const hotel = (label: string, copies: readonly string[]): string =>
  [
    'walls outside 0.3 inside 0.15 height 2.8',
    'floor l1 "First floor" level 1',
    ...UNIT,
    'room corridor "Corridor {level}" corridor 13.2 x 1.5 at 0.15,0.15',
    `repeat key 4 east as ${label} north of corridor`,
    ...copies,
  ].join('\n')

const roomsOn = (plan: FloorPlan, floor: string): FloorPlan['rooms'] => plan.rooms.filter((r) => r.floor === floor)

describe('{level} in labels and names (LVL-25)', () => {
  it('counts a label as written and fills it with the floor level', () => {
    expect(countedLabel('{level}01', 2, 6)).toBe('{level}03')
    expect(withLevel(countedLabel('{level}01', 2, 6), 4)).toBe('403')
    expect(countedLabel('A7', 1, 3)).toBe('A8')
    expect(countedLabel('A', 1, 3)).toBe('A2')
    expect(countedLabel('A', 0, 1)).toBe('A')
    expect(withLevel('Room {floor}-{level}', 2)).toBe('Room 2-2')
  })

  it('numbers the rooms, doors and flats of a floor by its level', () => {
    const plan = written(hotel('{level}01', []))
    expect(roomsOn(plan, 'l1').map((r) => [r.id, r.name])).toEqual([
      ['corridor', 'Corridor 1'],
      ['room-101', 'Room 101'],
      ['room-102', 'Room 102'],
      ['room-103', 'Room 103'],
      ['room-104', 'Room 104'],
    ])
    expect(plan.openings.map((o) => o.id)).toEqual(['door-101', 'door-102', 'door-103', 'door-104'])
    expect(plan.flats!.map((f) => [f.id, f.name])).toEqual([
      ['101', 'Flat 101'],
      ['102', 'Flat 102'],
      ['103', 'Flat 103'],
      ['104', 'Flat 104'],
    ])
  })

  it('renumbers a copied floor by its own level: labels, ids, names and flats', () => {
    const plan = written(hotel('{level}01', ['floor l2 "Second floor" level 2 copy l1 with openings', 'floor l3 "Third floor" level 3', 'copy l2 with openings']))
    expect(roomsOn(plan, 'l2').map((r) => [r.id, r.name])).toEqual([
      ['l2-corridor', 'Corridor 2'],
      ['room-201', 'Room 201'],
      ['room-202', 'Room 202'],
      ['room-203', 'Room 203'],
      ['room-204', 'Room 204'],
    ])
    expect(roomsOn(plan, 'l3').map((r) => r.name)).toEqual(['Corridor 3', 'Room 301', 'Room 302', 'Room 303', 'Room 304'])
    const ids = new Set(plan.openings.map((o) => o.id))
    for (const id of ['door-101', 'door-204', 'door-301']) expect(ids.has(id)).toBe(true)
    // Each door still joins its own room and the floor's corridor.
    const room201 = plan.rooms.find((r) => r.id === 'room-201')!
    const door201 = plan.openings.find((o) => o.id === 'door-201')!
    expect(room201.boundary).toContain(door201.wall)
    expect(plan.flats!.filter((f) => f.rooms.some((r) => r.startsWith('room-3'))).map((f) => [f.id, f.name])).toEqual([
      ['301', 'Flat 301'],
      ['302', 'Flat 302'],
      ['303', 'Flat 303'],
      ['304', 'Flat 304'],
    ])
  })

  it('renumbers each floor a repeat of floors writes', () => {
    const plan = written(hotel('{level}01', ['repeat floors 2 from l1 as l2 with openings']))
    expect(plan.floors!.map((f) => [f.id, f.level])).toEqual([
      ['l1', 1],
      ['l2', 2],
      ['l3', 3],
    ])
    expect(roomsOn(plan, 'l3').filter((r) => r.id.startsWith('room-')).map((r) => r.name)).toEqual(['Room 301', 'Room 302', 'Room 303', 'Room 304'])
  })

  it('keeps a label written without {level} on every copy', () => {
    const plan = written(hotel('101', ['floor l2 "Second floor" level 2 copy l1 with openings']))
    expect(roomsOn(plan, 'l2').filter((r) => r.name.startsWith('Room')).map((r) => [r.id, r.name])).toEqual([
      ['l2-room-101', 'Room 101'],
      ['l2-room-102', 'Room 102'],
      ['l2-room-103', 'Room 103'],
      ['l2-room-104', 'Room 104'],
    ])
  })

  it('goes on from a label digits: as A7, and {level}07', () => {
    const a = written(hotel('A7', []))
    expect(roomsOn(a, 'l1').map((r) => r.id)).toContain('room-A10')
    expect(roomsOn(a, 'l1').map((r) => r.id)).toContain('room-A7')
    const b = written(hotel('{level}07', []))
    expect(roomsOn(b, 'l1').filter((r) => r.id !== 'corridor').map((r) => r.name)).toEqual(['Room 107', 'Room 108', 'Room 109', 'Room 110'])
  })

  it('uses the room ids after the fill in the lines that follow', () => {
    const text = hotel('{level}01', []) + '\nroom store "Store" storage 2 x 1.5 east of 104\nwindow w1 in room-101 north, centred, 1.2 wide'
    const plan = written(text)
    expect(plan.rooms.some((r) => r.id === 'store')).toBe(true)
    expect(plan.openings.some((o) => o.id === 'w1')).toBe(true)
  })

  it('takes a label that is also a room id: the label is not an id', () => {
    const text = ['walls outside 0.3 inside 0.15 height 2.8', 'unit pod', '  room cell "Cell {n}" bedroom 3 x 3', 'end', 'room A "Hall" corridor 6 x 2 at 0,0', 'place pod as A north of A'].join('\n')
    const plan = written(text)
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(['A', 'cell-A'])
  })

  it('copies a floor named by its name', () => {
    const plan = written(hotel('{level}01', ['floor l2 "Second floor" level 2', 'copy "first floor" with openings']))
    expect(roomsOn(plan, 'l2').length).toBe(5)
  })
})
