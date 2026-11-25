/**
 * WRT-41: a room opened to the next by a dividing line keeps the inside size the text gives it,
 * wherever the `wall between ... virtual` line is written, as `open` on the room line does.
 */
import { describe, expect, it } from 'vitest'
import { indexPlan } from '../../geometry/plan'
import { tryRoomPolygon } from '../../geometry/room'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText, type RoomsResult } from '../compile'

const walls = 'walls outside 0.3 inside 0.15 height 2.7\n'

function written(text: string): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

/** Each room's area as Grid measures it on the plan, from the walls worked out for it. */
function measured(plan: FloorPlan): Record<string, number> {
  const index = indexPlan(plan)
  const out: Record<string, number> = {}
  for (const room of plan.rooms) {
    const poly = tryRoomPolygon(room, index)!
    let twice = 0
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % poly.length]!
      twice += a.x * b.y - b.x * a.y
    }
    out[room.id] = Math.abs(twice) / 2
  }
  return out
}

const areaNotes = (result: RoomsResult): string[] => result.warnings.filter((w) => w.code === 'rooms/area-differs').map((w) => w.message)

describe('a dividing line written after its rooms keeps their sizes (WRT-41)', () => {
  it('places the room against the one it is opened to, as open on its line does', () => {
    const after = written(`${walls}room a "A" bedroom 4.5 x 5 at 0,0\nroom b "B" bedroom 4.5 x 5 east of a\nwall between a and b virtual\n`)
    const open = written(`${walls}room a "A" bedroom 4.5 x 5 at 0,0\nroom b "B" bedroom 4.5 x 5 east of a open\n`)
    expect(areaNotes(after.result)).toEqual([])
    for (const area of Object.values(measured(after.plan))) expect(area).toBeCloseTo(22.5, 6)
    expect(after.plan.walls.map((w) => [w.start, w.end, w.virtual === true])).toEqual(open.plan.walls.map((w) => [w.start, w.end, w.virtual === true]))
    expect(after.result.rooms.map((r) => r.area)).toEqual([22.5, 22.5])
  })

  it('names the side too: wall between a and b east virtual', () => {
    const { result, plan } = written(`${walls}room a "A" bedroom 4.5 x 5 at 0,0\nroom b "B" bedroom 4.5 x 5 east of a\nwall between a and b east virtual\n`)
    expect(areaNotes(result)).toEqual([])
    for (const area of Object.values(measured(plan))) expect(area).toBeCloseTo(22.5, 6)
  })

  it('keeps each bay of a row repeated beside a corridor and opened to it after', () => {
    const text = [
      walls.trim(),
      'room cn "North circulation" corridor 31.5 x 2.4 at 0,0',
      'unit bay',
      'room bay "Bed {n}" bedroom 4.5 x 5 at 0,0',
      'end',
      'repeat bay 7 east as 8 north of cn',
      ...[8, 9, 10, 11, 12, 13, 14].map((n) => `wall between cn and bay-${n} virtual`),
      '',
    ].join('\n')
    const { result, plan } = written(text)
    expect(areaNotes(result)).toEqual([])
    const areas = measured(plan)
    for (const n of [8, 9, 10, 11, 12, 13, 14]) expect(areas[`bay-${n}`]).toBeCloseTo(22.5, 6)
    expect(areas['cn']).toBeCloseTo(31.5 * 2.4, 6)
  })

  it('keeps two rooms of one unit opened to each other by a line inside it', () => {
    const text = [
      walls.trim(),
      'unit suite',
      'room bed "Bed {n}" bedroom 4 x 4 at 0,0',
      'room sit "Sitting {n}" living 3 x 4 east of bed',
      'wall between bed and sit virtual',
      'end',
      'place suite as 1 at 0,0',
      '',
    ].join('\n')
    const { result, plan } = written(text)
    expect(areaNotes(result)).toEqual([])
    const areas = measured(plan)
    expect(areas['bed-1']).toBeCloseTo(16, 6)
    expect(areas['sit-1']).toBeCloseTo(12, 6)
  })

  it('keeps a stair of 42 sq ft opened to its landing', () => {
    const { result, plan } = written(`${walls}room landing "Landing" corridor 6ft x 7ft at 0,0\nroom stair "Stair" stair 3ft6in x 12ft east of landing align south\nwall between landing and stair virtual\n`)
    expect(areaNotes(result)).toEqual([])
    expect(measured(plan)['stair']! / 0.09290304).toBeCloseTo(42, 6)
  })

  it('leaves rooms placed by their corner where the text puts them, and says they grew', () => {
    const result = compileRoomsText(`${walls}room a "A" bedroom 4.5 x 5 at 0,0\nroom b "B" bedroom 4.5 x 5 at 4.65,0\nwall between a and b virtual\n`)
    expect(result.problems).toEqual([])
    expect(areaNotes(result)).toHaveLength(2)
  })
})
