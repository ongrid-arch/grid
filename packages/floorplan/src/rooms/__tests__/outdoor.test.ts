/**
 * CNT-7 (C26): an outdoor space written in rooms text, and read back as rooms text with nothing lost.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText } from '../index'
import { parseFloorPlan } from '../../types/floorplan'
import { roomsAnswer } from '../answer'

const TEXT = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'room living "Living room" living 5 x 4 at 0,0',
  'room terrace "Terrace" - 5 x 3 north of living outdoor terrace',
  'room porch "Porch" - 2 x 1.5 south of living outdoor porch unroofed',
].join('\n')

describe('outdoor space in rooms text (CNT-7)', () => {
  it('marks a room outdoor, roofed as its line says, and reads it back as rooms', () => {
    const written = compileRoomsText(TEXT)
    expect(written.plan).not.toBeNull()
    const plan = parseFloorPlan(written.plan)
    expect(plan.rooms.map((room) => [room.id, room.outdoor ?? null, room.roofed ?? null])).toEqual([
      ['living', null, null],
      ['terrace', 'terrace', null],
      ['porch', 'porch', false],
    ])
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toContain('outdoor terrace')
    expect(reading.text).toContain('outdoor porch unroofed')
  })

  it('names the words it takes when an outdoor kind is not one Grid knows', () => {
    const written = compileRoomsText(TEXT.replace('outdoor terrace', 'outdoor patio'))
    expect(written.plan).toBeNull()
    expect(JSON.stringify(written)).toContain("'outdoor <garden|courtyard|terrace|balcony|light-well|porch|carport|other>'")
  })
})

describe('the summary of a write (ARE-16)', () => {
  it('adds up the rooms that are floor inside, and says what it left out', () => {
    const written = compileRoomsText(TEXT)
    const answer = roomsAnswer(written).join('\n')
    expect(answer).toContain('20.00 m² inside, plus 18.00 m² outdoor or void in 2 rooms (not in the inside figure).')
  })
})
