/**
 * MSG-37: writing rooms text and the common edits answer in the plan's display units, as the
 * drawing and grid_areas do; a plan in metres answers as it always has.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = [
  'walls outside 0.3 inside 0.1143 height 2.7',
  'room living "Living" living 8.4 x 9.4 at 0.3,0.3',
  'room bed "Bed" bedroom 3 x 2.5 east of living',
  'door front in living south, centred, 0.9 wide, opens in',
  'door d1 between living and bed, centred, 0.8128 wide',
  'window w1 in bed east, centred, 1.2 wide, sill 0.9'
]

let b: Bench
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

describe('answers in the display units (MSG-37)', () => {
  it('writes a feet and inches plan back in feet and inches, its walls in inches', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'feet.json', rooms: ['display ft-in numbers m', ...HOUSE].join('\n') })
    expect(reply.text).toContain('930.6 sq ft (86.46 m²) inside in all')
    expect(reply.text).toContain(`living "Living": 27'-7" x 30'-10", 849.9 sq ft (78.96 m²) inside`)
    expect(reply.text).toContain(`w-living-bed: interior 4 1/2", 9'-2", living | bed`)
    expect(reply.text).toContain(`w1: window 3'-11" in ext-east-1`)
  })

  it('says an edit of a feet and inches plan in feet and inches, the areas in square feet', async () => {
    const wall = await ok('grid_change_wall', { plan: 'feet.json', wall: 'w-living-bed', thickness: 0.15 })
    expect(wall.text).toContain(`Wall "w-living-bed": 5 7/8" thick, was 4 1/2". Its centre line stays where it is, so each face moves 3/4" out.`)
    expect(wall.text).toContain('net 931 sq ft (86.46 m²) → 930 sq ft (86.37 m²) (-1 sq ft (0.09 m²))')
    expect(wall.text).toContain(`1 wall another thickness (4 1/2" → 5 7/8")`)
    const opening = await ok('grid_change_opening', { plan: 'feet.json', opening: 'w1', width: 1, sill: 1 })
    expect(opening.text).toContain(`window "w1" width 3'-11" → 3'-3", keeping its centre.`)
    expect(opening.text).toContain('window "w1" sill 35" → 39".')
    const side = await ok('grid_move_room_side', { plan: 'feet.json', room: 'bed', side: 'east', by: 0.5 })
    expect(side.text).toContain(`the east side of "Bed", 1'-8" east`)
  })

  it('writes and edits a millimetre plan in millimetres', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'mm.json', rooms: ['display mm numbers m', ...HOUSE].join('\n') })
    expect(reply.text).toContain('living "Living": 8400 x 9400 mm, 78.96 m² inside')
    expect(reply.text).toContain('d1: door 813 mm in w-living-bed')
    const opening = await ok('grid_change_opening', { plan: 'mm.json', opening: 'w1', width: 1 })
    expect(opening.text).toContain('window "w1" width 1200 mm → 1000 mm, keeping its centre.')
  })

  it('answers a plan in metres as before', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'm.json', rooms: HOUSE.join('\n') })
    expect(reply.text).toContain('living "Living": 8.40 x 9.40 m, 78.96 m² inside (written 8.40 x 9.40 to the inside faces)')
    expect(reply.text).toContain('w-living-bed: interior 0.1143 m, 2.80 m, living | bed')
    const wall = await ok('grid_change_wall', { plan: 'm.json', wall: 'w-living-bed', thickness: 0.15 })
    expect(wall.text).toContain('Wall "w-living-bed": 0.15 m thick, was 0.11 m. Its centre line stays where it is, so each face moves 0.018 m out.')
    expect(wall.text).toContain('net 86.46 m² → 86.37 m² (-0.09); 2 rooms differ in size; 1 wall another thickness (0.11 → 0.15 m)')
    const opening = await ok('grid_change_opening', { plan: 'm.json', opening: 'w1', width: 1 })
    expect(opening.text).toContain('window "w1" width 1.20 → 1.00 m, keeping its centre.')
  })
})
