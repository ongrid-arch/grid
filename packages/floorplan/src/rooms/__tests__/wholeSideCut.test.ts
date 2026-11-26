/**
 * WRT-66: a room cut from a corner may be exactly as wide or as deep as its host's side there.
 * It is written as a strip across the host with one dividing wall or line, and the host keeps
 * the rest as a rectangle. A size that with its wall comes to the whole side takes the whole
 * side. A cut that does not fit is refused with the sizes that do.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

const CORNERS = ['ne', 'nw', 'se', 'sw'] as const

function cleanly(text: string): { plan: FloorPlan; guesses: readonly string[] } {
  const result = compileRoomsText(text)
  expect(result.problems.map((p) => `${p.code}: ${p.message}`)).toEqual([])
  expect(result.warnings.map((w) => `${w.code}: ${w.message}`)).toEqual([])
  const plan = parseFloorPlan(result.plan)
  expect(validatePlan(plan).issues.map((i) => `${i.code}: ${i.message}`)).toEqual([])
  return { plan, guesses: result.guesses }
}

const room = (plan: FloorPlan, id: string) => plan.rooms.find((r) => r.id === id)!
const wall = (plan: FloorPlan, id: string) => plan.walls.find((w) => w.id === id)!
/** The walls dividing two rooms: those both bound, less the outside walls round both. */
const shared = (plan: FloorPlan, a: string, b: string) =>
  room(plan, a).boundary.filter((id) => room(plan, b).boundary.includes(id) && wall(plan, id).kind !== 'exterior')

/** How many walls bound a room: four for a rectangle, six for an L. */
function wallCount(plan: FloorPlan, id: string): number {
  return room(plan, id).boundary.length
}

describe('a room cut from a corner across a whole side', () => {
  const stair = (cut: string) =>
    'walls outside 0.3 inside 0.1 height 2.4\n' + 'room stair "Stairs" stair 0.85 x 4.0 at 0,0\n' + cut

  for (const corner of CORNERS) {
    it(`writes a cupboard as wide as the stair in its ${corner} corner, with one wall between`, () => {
      const { plan } = cleanly(stair(`room cupb "Cupboard" cupboard 0.85 x 1.0 inside stair corner ${corner}\n`))
      // The stair is a rectangle again: four sides, and one wall divides it from the cupboard.
      expect(wallCount(plan, 'stair')).toBe(4)
      expect(wallCount(plan, 'cupb')).toBe(4)
      const between = shared(plan, 'stair', 'cupb')
      expect(between).toHaveLength(1)
      expect(wall(plan, between[0]!).thickness).toBe(0.1)
    })

    it(`takes a cupboard and its wall that come to the stair's width as the whole width, in its ${corner} corner`, () => {
      const { plan, guesses } = cleanly(stair(`room cupb "Cupboard" cupboard 0.75 x 1.0 inside stair corner ${corner} wall 0.1\n`))
      expect(wallCount(plan, 'stair')).toBe(4)
      expect(shared(plan, 'stair', 'cupb')).toHaveLength(1)
      expect(guesses.join('\n')).toMatch(/'cupb' spans the whole 0\.85 m side of 'stair'/)
    })
  }

  it('writes a cupboard as deep as a wide room, across its depth', () => {
    const { plan } = cleanly('walls outside 0.3 inside 0.1 height 2.4\nroom hall "Hall" corridor 3 x 1.2 at 0,0\nroom cupb "Cupboard" cupboard 0.8 x 1.2 inside hall corner se\n')
    expect(wallCount(plan, 'hall')).toBe(4)
    expect(shared(plan, 'hall', 'cupb')).toHaveLength(1)
  })

  const cabin = (loft: string) => 'walls outside 0.14 inside 0.07 height 2.4\nroom main "Main room" living 3.6 x 5 at 0,0\n' + loft

  it('writes a sleeping loft across the whole width of a cabin with a dividing line', () => {
    const { plan } = cleanly(cabin('room loft "Sleeping loft" bedroom 3.6 x 1.7 inside main corner nw open\n'))
    expect(wallCount(plan, 'main')).toBe(4)
    const between = shared(plan, 'main', 'loft')
    expect(between).toHaveLength(1)
    expect(wall(plan, between[0]!).virtual).toBe(true)
  })

  it('writes the loft whose size and wall come to the width', () => {
    const { plan, guesses } = cleanly(cabin('room loft "Sleeping loft" bedroom 3.53 x 1.7 inside main corner nw wall 0.07\n'))
    expect(wallCount(plan, 'main')).toBe(4)
    expect(guesses.join('\n')).toMatch(/'loft' spans the whole 3\.60 m side of 'main'/)
  })

  it('lets a room beside the host still meet it after the strip is cut', () => {
    cleanly(stair('room cupb "Cupboard" cupboard 0.85 x 1.0 inside stair corner nw\nroom hall "Hall" corridor 2 x 4.0 east of stair align south\n'))
  })
})

describe('a room too big for the corner', () => {
  it('is refused with the sizes that fit', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.4\nroom stair "Stairs" stair 0.85 x 4.0 at 0,0\nroom cupb "Cupboard" cupboard 0.9 x 1.0 inside stair corner ne\n')
    expect(result.plan).toBeNull()
    const refusal = result.problems.find((p) => p.code === 'rooms/inside-corner')!
    expect(refusal.message).toContain('a width under 0.75 m and a depth under 3.90 m')
    expect(refusal.message).toContain('the whole 0.85 m width or the whole 4.00 m depth')
  })

  it('is refused as filling a host it matches both ways', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.4\nroom stair "Stairs" stair 0.85 x 4.0 at 0,0\nroom cupb "Cupboard" cupboard 0.85 x 4.0 inside stair corner ne\n')
    expect(result.plan).toBeNull()
    const refusal = result.problems.find((p) => p.code === 'rooms/inside-corner')!
    expect(refusal.message).toContain("would fill 'stair'")
  })

  it('is refused when the host does not go on square past the side it spans', () => {
    const hall = (b: string) =>
      'walls outside 0.3 inside 0.1 height 2.4\nroom hall "Hall" corridor 3 x 2 at 0,0\nroom a "Cupboard" cupboard 1 x 0.5 inside hall corner sw\n' + b
    // The west side left above the first cupboard is 1.40 m; a strip as deep that reaches past
    // the cupboard's wall leaves the hall no square side to end on.
    const result = compileRoomsText(hall('room b "Store" storage 1.5 x 1.4 inside hall corner nw\n'))
    expect(result.plan).toBeNull()
    expect(result.problems.find((p) => p.code === 'rooms/inside-corner')!.message).toContain('does not go on square')
    // One that stops short of it writes.
    cleanly(hall('room b "Store" storage 0.8 x 1.4 inside hall corner nw\n'))
  })
})

describe('the overlap advice', () => {
  it('offers the corner to a room as wide as the other', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.4\nroom stair "Stairs" stair 0.85 x 4.0 at 0,0\nroom cupb "Cupboard" cupboard 0.85 x 1.0 at 0,3\n')
    const overlap = result.problems.find((p) => p.code === 'rooms/overlap')!
    expect(overlap.message).toContain("write 'inside stair corner <ne|nw|se|sw>'")
  })
})
