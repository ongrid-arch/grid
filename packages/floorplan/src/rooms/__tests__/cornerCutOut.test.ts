/**
 * WRT-53: a room cut out of a corner of another closes that corner with its own walls, in a
 * corner against a neighbouring room as in one against the outside walls, whatever its size.
 * The end of the cut-out's wall, seen across the corner from the host's neighbour, is that wall's
 * end: never a gap between the host and its neighbour, and never a wall as thick as the corner.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

const CORNERS = ['ne', 'nw', 'se', 'sw'] as const

/** A hall with a living room along its west side and a kitchen along the north of both. */
const house = (cut: string): string =>
  'walls outside 0.3 inside 0.1 height 2.4\n' +
  'room living "Living" living 3.81 x 4.0 at 0,0\n' +
  'room hall "Hall" corridor 1.9 x 4.0 east of living align south\n' +
  'room kitchen "Kitchen" kitchen 5.81 x 3 north of living align west\n' +
  cut

/** A hall with a room on every side. */
const surrounded = (cut: string): string =>
  'walls outside 0.3 inside 0.1 height 2.4\n' +
  'room hall "Hall" corridor 2 x 2 at 0,0\n' +
  'room w "West" living 3 x 2 west of hall align south\n' +
  'room e "East" bedroom 3 x 2 east of hall align south\n' +
  'room n "North" kitchen 7.2 x 2 north of w align west\n' +
  'room s "South" bedroom 7.2 x 2 south of w align west\n' +
  cut

function cleanly(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  expect(result.warnings.map((w) => `${w.code}: ${w.message}`)).toEqual([])
  const plan = parseFloorPlan(result.plan)
  expect(validatePlan(plan).issues.map((i) => `${i.code}: ${i.message}`)).toEqual([])
  // No wall is thicker than a line states: the corner's depth is never taken for a wall.
  for (const w of plan.walls) expect([0.1, 0.3]).toContain(Number(w.thickness.toFixed(3)))
  return plan
}

describe('a room cut out of a corner against a neighbouring room', () => {
  it("writes the sample plans' cupboard in the hall corner against the living room, as against the outside", () => {
    for (const corner of ['nw', 'sw'] as const) {
      const plan = cleanly(
        'room living "Living" living 3.81 x 4.0 at 0,0\n' +
          'room hall "Hall" corridor 1.9 x 4.0 east of living align south\n' +
          `room cupb "Cupboard" cupboard 0.9 x 1.0 inside hall corner ${corner}\n`
      )
      const cupb = plan.rooms.find((r) => r.id === 'cupb')!
      const hall = plan.rooms.find((r) => r.id === 'hall')!
      // Its own two walls close the corner, and the hall goes round them.
      const own = cupb.boundary.filter((id) => hall.boundary.includes(id) && plan.walls.find((w) => w.id === id)!.thickness === 0.1)
      expect(own.length).toBeGreaterThanOrEqual(2)
    }
  })

  for (const [w, d] of [[0.9, 1.0], [1.2, 0.3], [0.3, 1.2], [0.4, 0.4], [0.3, 0.2]] as const) {
    it(`closes a ${w} x ${d} cut-out in every corner of a hall between two rooms`, () => {
      for (const corner of CORNERS) cleanly(house(`room cupb "Cupboard" storage ${w} x ${d} inside hall corner ${corner}\n`))
    })

    it(`closes a ${w} x ${d} cut-out in every corner of a hall with a room on every side`, () => {
      for (const corner of CORNERS) cleanly(surrounded(`room cupb "Cupboard" storage ${w} x ${d} inside hall corner ${corner}\n`))
    })
  }

  it('still refuses a real gap between two rooms beside a cut-out', () => {
    const result = compileRoomsText(
      'walls outside 0.3 inside 0.1 height 2.4\n' +
        'room living "Living" living 3.81 x 4.0 at 0,0\n' +
        'room hall "Hall" corridor 1.9 x 4.0 at 4.71,0\n' +
        'room cupb "Cupboard" storage 0.9 x 1.0 inside hall corner nw\n'
    )
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => p.code)).toContain('rooms/gap')
  })
})
