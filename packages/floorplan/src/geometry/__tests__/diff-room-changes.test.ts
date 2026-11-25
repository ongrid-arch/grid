/**
 * WRT-32: a room in both versions says every change it went through, in one line, by its name,
 * with the direction of a move: renamed and moved, its id changed (rooms first, moved or not),
 * and two rooms knocked into one read as a merge with the wall taken out, not as a room lost.
 *
 * Built on the repository's own flat: by hand (`two-bed-flat.json`) and rooms first
 * (`rooms/flat.rooms`). Making the living room 0.30 m wider moves the rooms east of it as they were.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { compareBuildings } from '../diff'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, 'two-bed-flat.json'), 'utf8')))
const roomsText = (): string => readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8')

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { ...plan, written: stampFor(plan) }
}

const wider = (text: string): string => text.replace('living   4.4 x 4.2', 'living   4.7 x 4.2')
/** The bedroom's id changed, its doors' and windows' ids kept. */
const newId = (text: string): string => text.replace('room bed1 ', 'room study ').replace('east of bed1', 'east of study').replace('north of bed1', 'north of study').replace('until bed1', 'until study').replace('between hall and bed1', 'between hall and study').replace('in bed1 south', 'in study south').replace('opens into bed1', 'opens into study')

describe('a room renamed and moved', () => {
  it('says both, with the direction of the move', () => {
    const compared = compareBuildings(written(roomsText()), written(wider(roomsText()).replace('"Bedroom 1"', '"Study"')))
    const bed = compared.rooms.find((r) => r.room === 'bed1')!
    expect(bed.status).toBe('changed')
    expect(bed.text).toBe('"Bedroom 1" renamed "Study"; moved 0.30 m east on the drawing')
    expect(bed.moved).toBeCloseTo(0.3, 6)
    expect(bed.by![0]).toBeCloseTo(0.3, 6)
    expect(bed.by![1]).toBeCloseTo(0, 6)
    expect(compared.changes.map((c) => c.text)).toContain('"Bedroom 1" renamed "Study"; moved 0.30 m east on the drawing')
    // The rooms that only moved are still said together, without it.
    expect(compared.changes.map((c) => c.text)).toContain('"Hall", "Bathroom" and "Bedroom 2" moved 0.30 m east on the drawing, as they were')
    expect(compared.verdict).toContain('"Bedroom 1" renamed "Study"; moved 0.30 m east on the drawing')
  })

  it('still says a room that only moved as one of the rooms that moved as they were', () => {
    const compared = compareBuildings(written(roomsText()), written(wider(roomsText())))
    const bed = compared.rooms.find((r) => r.room === 'bed1')!
    expect(bed.status).toBe('moved')
    expect(bed.by![0]).toBeCloseTo(0.3, 6)
    expect(compared.changes.map((c) => c.text)).toEqual([
      '"Living room" 18.48 m² → 19.74 m² (4.40 × 4.20 m → 4.70 × 4.20 m)',
      '"Bedroom 1", "Hall", "Bathroom" and "Bedroom 2" moved 0.30 m east on the drawing, as they were'
    ])
  })
})

describe('a room whose id changed, written rooms first', () => {
  it('names the id change, in the room and in the verdict', () => {
    const compared = compareBuildings(written(roomsText()), written(newId(roomsText())))
    expect(compared.changes).toEqual([])
    const bed = compared.rooms.find((r) => r.room === 'study')!
    expect(bed.status).toBe('unchanged')
    expect(bed.idBefore).toBe('bed1')
    expect(bed.text).toBe('"Bedroom 1" (id "bed1" → "study") as it was (13.64 m²)')
    expect(compared.verdict).toContain('the id of "Bedroom 1" is now "study" (was "bed1")')
  })

  it('is the same room when it moved too, not a room removed and one added', () => {
    const compared = compareBuildings(written(roomsText()), written(wider(newId(roomsText()))))
    expect(compared.rooms.map((r) => r.status)).not.toContain('added')
    expect(compared.rooms.map((r) => r.status)).not.toContain('removed')
    const bed = compared.rooms.find((r) => r.room === 'study')!
    expect(bed.status).toBe('moved')
    expect(bed.idBefore).toBe('bed1')
    expect(bed.text).toBe('"Bedroom 1" (id "bed1" → "study") moved 0.30 m east on the drawing, as it was (13.64 m²)')
    expect(compared.changes.map((c) => c.text)).toEqual([
      '"Living room" 18.48 m² → 19.74 m² (4.40 × 4.20 m → 4.70 × 4.20 m)',
      '"Bedroom 1", "Hall", "Bathroom" and "Bedroom 2" moved 0.30 m east on the drawing, as they were'
    ])
    expect(compared.verdict).toContain('the id of "Bedroom 1" is now "study" (was "bed1")')
    expect(compared.issues).toEqual([])
  })
})

describe('two rooms knocked into one', () => {
  /** The living room takes in the kitchen: the wall between them and the hatch in it go. */
  function merged(): FloorPlan {
    const before = flat()
    return {
      ...before,
      walls: before.walls.filter((w) => w.id !== 'living-north'),
      openings: before.openings.filter((o) => o.wall !== 'living-north'),
      rooms: before.rooms.filter((r) => r.id !== 'kitchen').map((r) => (r.id === 'living' ? { ...r, boundary: ['ext-south', 'spine', 'ext-north', 'ext-west'] } : r))
    }
  }

  it('reads as a merge with the wall taken out, in one line, not as a room lost', () => {
    const compared = compareBuildings(flat(), merged())
    const living = compared.rooms.find((r) => r.room === 'living')!
    const kitchen = compared.rooms.find((r) => r.room === 'kitchen')!
    expect(living.text).toBe('"Living room" merged with "Kitchen", wall "living-north" taken out between them; 18.48 m² → 32.12 m² (4.40 × 4.20 m → 4.40 × 7.30 m)')
    expect(living.mergedWith).toEqual(['kitchen'])
    expect(living.wallsTakenOut).toEqual(['living-north'])
    expect(kitchen.status).toBe('removed')
    expect(kitchen.mergedInto).toBe('living')
    expect(kitchen.text).toBe('"Kitchen" merged into "Living room", 13.20 m²')
    const lines = compared.changes.map((c) => c.text)
    expect(lines).toContain(living.text)
    expect(lines.some((t) => t.startsWith('Room removed'))).toBe(false)
    expect(compared.verdict).not.toContain('Room removed')
    expect(compared.verdict).toContain('"Living room" merged with "Kitchen"')
    // MSG-27: the picture draws the kitchen as part of the room it went into, with the sum, not as lost.
    expect(compared.marks.removed.rooms).toEqual([])
    expect(compared.marks.changedRooms.find((r) => r.room === 'living')?.label).toBe('Living room: 18.48 + 13.20 + 0.44 = 32.12 m²')
  })

  it('keeps a room taken out with no room to go into as removed', () => {
    const before = flat()
    const after: FloorPlan = { ...before, rooms: before.rooms.filter((r) => r.id !== 'kitchen') }
    const compared = compareBuildings(before, after)
    const kitchen = compared.rooms.find((r) => r.room === 'kitchen')!
    expect(kitchen.mergedInto).toBeNull()
    expect(kitchen.text).toBe('Room removed: "Kitchen", 13.20 m²')
  })
})
