/**
 * MSG-25: two versions of a plan with phases (C16) compared by `compareBuildings` list every
 * wall, opening and room whose phase changed, with its phase before and after, in a change line,
 * in the verdict's count and among the parts a picture marks as changed. An opening that states
 * no phase follows its wall, whose own line says it. A plan compared with itself by phase
 * (`phases: false`) lists none.
 *
 * Built on the repository's flat, by hand (`two-bed-flat.json`) and rooms first
 * (`rooms/flat.rooms`), with phases set on its parts.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Phase } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { compareBuildings } from '../diff'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, 'two-bed-flat.json'), 'utf8')))

function written(): FloorPlan {
  const result = compileRoomsText(readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8'))
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { ...plan, written: stampFor(plan) }
}

/** The plan with the phases named set on its parts, by id. */
function phased(plan: FloorPlan, phases: Readonly<Record<string, Phase>>): FloorPlan {
  const set = <T extends { readonly id: string; readonly phase?: Phase }>(part: T): T => (phases[part.id] === undefined ? part : { ...part, phase: phases[part.id] })
  return { ...plan, walls: plan.walls.map(set), openings: plan.openings.map(set), rooms: plan.rooms.map(set) }
}

/** The revision before: the bathroom and the second bedroom to be knocked into one, the wall between them to be demolished. */
const EARLIER = { 'bath-north': 'demolished', bath: 'demolished', bed2: 'demolished' } as const
/** The revision after: both rooms and their wall kept, the first bedroom's window blocked up. */
const LATER = { 'bath-north': 'existing', bath: 'existing', bed2: 'existing', 'win-bed1': 'demolished' } as const

describe('two versions of a plan with phases', () => {
  it('lists the window now to be demolished, and the wall and rooms kept, each with its phase before and after', () => {
    const compared = compareBuildings(phased(flat(), EARLIER), phased(flat(), LATER))
    expect(compared.issues).toEqual([])
    expect(compared.changes.map((c) => c.text)).toEqual([
      '"Bathroom" now existing (was to be demolished)',
      '"Bedroom 2" now existing (was to be demolished)',
      'Wall "bath-north" now existing (was to be demolished), by "Bathroom" and "Bedroom 2"',
      'Window "win-bed1" now to be demolished (was existing), in "Bedroom 1"'
    ])
    expect(compared.sameBuilding).toBe(false)
    expect(compared.verdict).toBe('4 changes, room by room: "Bathroom" now existing (was to be demolished); "Bedroom 2" now existing (was to be demolished); 4 rooms as they were; 2 wall or opening changes.')
    const bed2 = compared.rooms.find((r) => r.room === 'bed2')!
    expect(bed2.status).toBe('changed')
    expect(bed2.after).toBe(bed2.before)
    // A picture of the comparison marks them as changed, not as any part to be demolished.
    expect(compared.marks.changed.openings).toEqual(['win-bed1'])
    expect(compared.marks.changed.walls).toEqual(['bath-north'])
    expect(compared.marks.changedRooms.map((r) => r.room)).toEqual(['bath', 'bed2'])
    expect(compared.diff.changes.find((c) => c.entity.id === 'win-bed1')?.props).toEqual([{ key: 'phase', before: 'existing', after: 'demolished' }])
  })

  it('lists a room made new', () => {
    const compared = compareBuildings(flat(), phased(flat(), { bed2: 'new' }))
    expect(compared.changes.map((c) => c.text)).toEqual(['"Bedroom 2" now new (was existing)'])
  })

  it('lists them too in a plan written rooms first, whose walls a room line otherwise says', () => {
    const compared = compareBuildings(phased(written(), { 'w-kitchen-living': 'demolished', living: 'demolished', kitchen: 'demolished' }), phased(written(), { 'w-kitchen-living': 'existing', 'win-bed1': 'demolished' }))
    expect(compared.roomsFirst).toBe(true)
    const lines = compared.changes.map((c) => c.text)
    expect(lines).toContain('Window "win-bed1" now to be demolished (was existing), in "Bedroom 1"')
    expect(lines.some((line) => line.startsWith('Wall "w-kitchen-living" now existing (was to be demolished)'))).toBe(true)
    expect(lines).toContain('"Living room" now existing (was to be demolished)')
    expect(lines).toHaveLength(4)
  })

  it('says a wall to be demolished once: its doors follow it and have no line of their own', () => {
    const rooms = { hall: 'demolished', bath: 'demolished', bed2: 'demolished' } as const
    const compared = compareBuildings(phased(flat(), { ...EARLIER, ...rooms }), phased(flat(), { ...EARLIER, ...rooms, 'hall-east': 'demolished' }))
    expect(compared.issues).toEqual([])
    expect(compared.changes.map((c) => c.text)).toEqual(['Wall "hall-east" now to be demolished (was existing), by "Hall", "Bathroom" and "Bedroom 2"'])
    expect(compared.diff.changes.map((c) => c.entity.id)).toEqual(['hall-east'])
  })

  it('reads a plan with phases against itself as the same building', () => {
    const compared = compareBuildings(phased(flat(), LATER), phased(flat(), LATER))
    expect(compared.sameBuilding).toBe(true)
    expect(compared.changes).toEqual([])
  })

  it('reads an unstated phase as existing: a part that now states it is no change', () => {
    const compared = compareBuildings(phased(flat(), EARLIER), phased(flat(), { ...EARLIER, 'win-bed1': 'existing', bed2: 'existing' }))
    expect(compared.changes).toEqual([])
  })

  it('lists no phase when told not to, as a plan compared with itself by phase is', () => {
    const compared = compareBuildings(phased(flat(), EARLIER), phased(flat(), LATER), { phases: false })
    expect(compared.changes).toEqual([])
  })
})
