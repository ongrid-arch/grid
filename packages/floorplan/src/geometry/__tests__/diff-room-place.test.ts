/**
 * MSG-23: two versions are paired room by room by where the rooms stand first. A plan written
 * rooms first and rewritten may give a room's id and name to a room elsewhere: that is another
 * room, not the same one moved or shrunk. A room reshaped under a new id, as a comparison by phase
 * reads one, is the same room changed.
 *
 * The wards are invented here; the flat is the repository's own (`rooms/flat.rooms`).
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { alignPlans, compareBuildings } from '../diff'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const flatText = (): string => readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8')

function compiled(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

/** As `grid write` leaves it: written rooms first. */
function written(text: string): FloorPlan {
  const plan = compiled(text)
  return { ...plan, written: stampFor(plan) }
}

const HEAD = 'plan "Ward"\nwalls outside 0.2 inside 0.1 height 2.7\n\n'

/** Two rows of beds, the south row numbered from 1 west to east, the north row after it. */
function ward(perRow: number, width: number): string {
  const lines: string[] = []
  for (let i = 1; i <= perRow; i++) {
    const at = i === 1 ? 'at 0,0' : `east of bed${i - 1}`
    lines.push(`room bed${i} "Bed ${i}" bedroom ${width} x 4.0 ${at}`)
  }
  for (let i = 1; i <= perRow; i++) {
    const n = perRow + i
    lines.push(`room bed${n} "Bed ${n}" bedroom ${width} x 4.0 north of bed${i}`)
  }
  return HEAD + lines.join('\n') + '\n'
}

describe('a plan written rooms first, rewritten', () => {
  it('pairs each room with the room standing in its place, not with the one that took its id', () => {
    // The same two rows, numbered the other way: Bed 1 is now the north-west bed.
    const before = written(ward(2, 3.0))
    const after = written(
      HEAD +
        [
          'room bed3 "Bed 3" bedroom 3.0 x 4.0 at 0,0',
          'room bed4 "Bed 4" bedroom 3.0 x 4.0 east of bed3',
          'room bed1 "Bed 1" bedroom 3.0 x 4.0 north of bed3',
          'room bed2 "Bed 2" bedroom 3.0 x 4.0 north of bed4'
        ].join('\n') +
        '\n'
    )
    const alignment = alignPlans(before, after, { idsFirst: true })
    expect(Object.fromEntries(alignment.rooms)).toEqual({ bed1: 'bed3', bed2: 'bed4', bed3: 'bed1', bed4: 'bed2' })
    const compared = compareBuildings(before, after)
    expect(compared.rooms.map((r) => r.status)).not.toContain('moved')
    expect(compared.changes.map((c) => c.text)).toContain('"Bed 1" (id "bed1" → "bed3") renamed "Bed 3"')
  })

  it('never says a bed shrank to the size of the bed that took its number across the ward', () => {
    // Eight beds rewritten as ten narrower ones: "Bed 5" was the north-west bed, now it is the
    // south-east one.
    const before = written(ward(4, 3.0))
    const after = written(ward(5, 2.4))
    const pairs = alignPlans(before, after, { idsFirst: true }).rooms
    expect(pairs.get('bed5')).not.toBe('bed5')
    const compared = compareBuildings(before, after)
    // The new Bed 5 stands where Bed 4 stood: it is that bed, renamed and narrower, not the old
    // Bed 5 shrunk.
    const bed5 = compared.rooms.find((r) => r.room === 'bed5')!
    expect(bed5.idBefore).toBe('bed4')
    expect(compared.changes.map((c) => c.text)).not.toContain('"Bed 5" 12.00 m² → 9.60 m² (3.00 × 4.00 m → 2.40 × 4.00 m)')
    // The old north-west bed is the room standing in its place now, Bed 6, made narrower.
    expect(pairs.get('bed5')).toBe('bed6')
    expect(compared.changes.map((c) => c.text)).toContain('"Bed 5" (id "bed5" → "bed6") renamed "Bed 6"; 12.00 m² → 9.60 m² (3.00 × 4.00 m → 2.40 × 4.00 m)')
  })

  it('keeps a room under its id that moved a little or grew as the same room', () => {
    const before = written(ward(2, 3.0))
    const after = written(ward(2, 3.0).replace('room bed1 "Bed 1" bedroom 3.0 x 4.0', 'room bed1 "Bed 1" bedroom 4.5 x 4.0'))
    const pairs = alignPlans(before, after, { idsFirst: true }).rooms
    // Bed 1 grew half as wide again; Bed 2 east of it moved 1.5 m east, half its width.
    expect(pairs.get('bed1')).toBe('bed1')
    expect(pairs.get('bed2')).toBe('bed2')
  })
})

describe('a room reshaped under a new id', () => {
  /** Bedroom 1 taken down and built again 0.30 m shallower, under another id, its walls new. */
  const reshaped = (): string =>
    flatText()
      .replace('room bed1    "Bedroom 1"   bedroom  4.4 x 3.1', 'room study   "Bedroom 1"   bedroom  4.4 x 2.8')
      .replaceAll('bed1', 'study')

  it('is the same room changed, not one room removed and another added', () => {
    const compared = compareBuildings(compiled(flatText()), compiled(reshaped()))
    expect(compared.rooms.map((r) => r.status)).not.toContain('removed')
    expect(compared.rooms.map((r) => r.status)).not.toContain('added')
    const study = compared.rooms.find((r) => r.room === 'study')!
    expect(study.status).toBe('changed')
    expect(study.idBefore).toBe('bed1')
  })

  it('is the same room written rooms first too', () => {
    const compared = compareBuildings(written(flatText()), written(reshaped().replace('"Bedroom 1"', '"Study"')))
    const study = compared.rooms.find((r) => r.room === 'study')!
    expect(study.status).toBe('changed')
    expect(study.idBefore).toBe('bed1')
  })

  it('does not read two equal rooms knocked into one as one of them reshaped', () => {
    // The two south beds of the ward become one double room under a new id: neither of them is
    // three quarters of it.
    const before = written(ward(2, 3.0))
    const after = written(HEAD + ['room double "Double" bedroom 6.1 x 4.0 at 0,0', 'room bed3 "Bed 3" bedroom 3.0 x 4.0 north of double', 'room bed4 "Bed 4" bedroom 3.0 x 4.0 east of bed3'].join('\n') + '\n')
    const pairs = alignPlans(before, after, { idsFirst: true }).rooms
    expect(pairs.get('bed1')).toBeUndefined()
    expect(pairs.get('bed2')).toBeUndefined()
    expect(pairs.get('bed3')).toBe('bed3')
  })
})
