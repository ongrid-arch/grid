/**
 * WRT-42: what the read-back gives in Grid's own terms is named, an opening the writing refuses
 * goes raw on its own, so its floor's rooms, walls and other openings stay rooms text, and an
 * opening on one of two room sides on one line is placed on its own.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { planRevision } from '../stamp'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

/** A row of cabins on a corridor beside a stair lobby whose stair opening is written on the lobby's side. */
const DECK = [
  'walls outside 0.3 inside 0.1 height 2.4',
  'unit cabin flat "Cabin" "Cabin {n}" c=corr',
  '  room cab "Cabin {n}" bedroom 2.9 x 4.95',
  '  door d between cab and $c, 0.2 from east, 0.8 wide, opens into cab',
  'end',
  'room corr "Corridor" corridor 27 x 1.2 at 0,0',
  'room lobby "Stair lobby" corridor 8.9 x 10 north of corr align west',
  'room stair "Stair" stair 3 x 5 inside lobby corner ne',
  'room lift "Lifts" lift 3 x 3 inside lobby corner se',
  'opening o-st in lobby east, 0.5 from north, 1.4 wide',
  'opening o-lf in lift west, centred, 1.2 wide',
  'door dl between lobby and corr, centred, 1 wide',
  'repeat cabin 6 east as 101 east of lobby align south',
  '',
].join('\n')

const lines = (text: string): string[] => text.split('\n')

/** The plan's fingerprint with its parts in id order: a raw part is written after the parts worked out. */
const byId = <T extends { id: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
const print = (plan: FloorPlan): string => planRevision({ floors: plan.floors, walls: byId(plan.walls), rooms: byId(plan.rooms), openings: byId(plan.openings) })

describe('a stair lobby on a row of cabins (WRT-42)', () => {
  const plan = written(DECK)
  const reading = readRoomsText(plan)

  it('reads back as rooms text, the stair opening placed on the side of the lobby it is in', () => {
    expect(reading.rawFloors).toEqual([])
    expect(reading.rawOpenings).toEqual([])
    expect(lines(reading.text).filter((l) => l.startsWith('raw '))).toEqual([])
    for (const id of ['lobby', 'stair', 'lift', 'corr', 'cab-101', 'cab-106']) expect(reading.text).toContain(`room ${id} `)
    expect(reading.text).toMatch(/^opening o-st in lobby east\.2, /m)
  })

  it('loses nothing: writing the reading again gives back the same plan', () => {
    expect(print(written(reading.text))).toBe(print(plan))
  })
})

describe('an opening the writing refuses (WRT-42)', () => {
  // A window drawn across the corner where the wall between two rooms meets the outside wall:
  // no room side holds it, so no opening line can write it.
  const plan = written('walls outside 0.3 inside 0.1 height 2.4\nroom a "Hall" corridor 4 x 3 at 0,0\nroom b "Office" office 3 x 3 east of a\nroom c "Store" storage 7.1 x 2 north of a align west\ndoor d1 between a and b, centred, 0.9 wide\nwindow w1 in a south, 1 from west, 1.2 wide\n')
  const across: FloorPlan = { ...plan, openings: plan.openings.map((o) => (o.id === 'w1' ? { ...o, offset: 3.5 } : o)) }
  const reading = readRoomsText(across)

  it('goes raw on its own, and its floor stays rooms text', () => {
    expect(reading.rawFloors).toEqual([])
    expect(reading.rawOpenings).toEqual(['w1'])
    const raw = lines(reading.text).filter((l) => l.startsWith('raw '))
    expect(raw).toHaveLength(1)
    expect(raw[0]).toMatch(/^raw opening \{"id":"w1"/)
    for (const id of ['a', 'b', 'c']) expect(reading.text).toContain(`room ${id} `)
    expect(reading.text).toMatch(/^door d1 in /m)
  })

  it('is named, with why, in a comment line just above it, with no line of a text the reader never sees', () => {
    const all = lines(reading.text)
    const note = all[all.findIndex((l) => l.startsWith('raw opening')) - 1]!
    expect(note.startsWith('# ')).toBe(true)
    expect(note).toContain("'w1'")
    expect(note).toContain('does not fit in one stretch of wall')
    expect(note).not.toMatch(/\bline \d+/i)
  })

  it('loses nothing: writing the reading again gives back the same plan', () => {
    expect(print(written(reading.text))).toBe(print(across))
  })
})

describe('a floor given in Grid’s own terms (WRT-42)', () => {
  // A plan drawn by hand: the south wall runs half a metre past the corner, which no room line writes.
  const plan = written('walls outside 0.3 inside 0.1 height 2.4\nroom a "Hall" corridor 4 x 3 at 0,0\nroom b "Office" office 3 x 3 east of a\ndoor d1 between a and b, centred, 0.9 wide\n')
  const moved: FloorPlan = { ...plan, walls: plan.walls.map((w) => (w.id === 'ext-south' ? { ...w, start: [w.start[0] - 0.5, w.start[1]] as [number, number] } : w)) }
  const reading = readRoomsText(moved)

  it('names the wall that stops rooms text, in its comment line and in rawFloors', () => {
    expect(reading.rawFloors).toHaveLength(1)
    expect(reading.rawFloors[0]!.why).toContain("'ext-south'")
    const note = lines(reading.text).find((l) => l.startsWith('# ') && l.includes("Grid's own terms"))!
    expect(note).toContain("'ext-south'")
    expect(note).not.toMatch(/\bline \d+/i)
  })

  it('still loses nothing', () => {
    expect(print(written(reading.text))).toBe(print(moved))
  })
})
