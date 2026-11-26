/**
 * ARE-60: whether a room is heated or cooled, written in rooms text and read back with nothing lost.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText } from '../index'
import { parseFloorPlan } from '../../types/floorplan'

const TEXT = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'room living "Living room" living 5 x 4 at 0,0',
  'room garage "Garage" parking 3 x 4 east of living conditioned',
  'room store "Store" storage 2 x 4 west of living unconditioned',
  'room lanai "Lanai" - 5 x 3 north of living',
].join('\n')

describe('conditioned and unconditioned in rooms text (ARE-60)', () => {
  it('states it on the rooms whose line says, and on no other', () => {
    const written = compileRoomsText(TEXT)
    expect(written.plan, JSON.stringify(written.problems)).not.toBeNull()
    const plan = parseFloorPlan(written.plan)
    expect(plan.rooms.map((room) => [room.id, room.conditioned ?? null])).toEqual([
      ['living', null],
      ['garage', true],
      ['store', false],
      ['lanai', null],
    ])
  })

  it('reads it back as rooms text, and the text writes the same plan again', () => {
    const plan = parseFloorPlan(compileRoomsText(TEXT).plan)
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toMatch(/room garage "Garage" parking .* conditioned$/m)
    expect(reading.text).toMatch(/room store "Store" storage .* unconditioned$/m)
    const again = parseFloorPlan(compileRoomsText(reading.text).plan)
    expect(again.rooms.map((room) => room.conditioned ?? null)).toEqual(plan.rooms.map((room) => room.conditioned ?? null))
  })

  it('reads it as nothing on outdoor space, and says so', () => {
    const written = compileRoomsText(TEXT.replace('room lanai "Lanai" - 5 x 3 north of living', 'room lanai "Lanai" - 5 x 3 north of living outdoor porch conditioned'))
    expect(written.plan).not.toBeNull()
    expect(parseFloorPlan(written.plan).rooms.find((room) => room.id === 'lanai')!.conditioned).toBeUndefined()
    const warning = written.warnings.find((w) => w.code === 'rooms/conditioned-outdoor')
    expect(warning?.message).toContain('is outdoor space, which is never under air')
  })
})
