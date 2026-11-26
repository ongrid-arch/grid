/**
 * CNT-45: fixtures and furniture in rooms text. A flat of two rooms: a bathroom whose inside
 * faces run from 0,0 to 2.4,2 and a bedroom of 3.5 × 4 m east of it. Every item written becomes
 * the plan's own `items`, which the drawing, the checks, the counts and the exports read.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { validatePlan } from '../../geometry/validate'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { itemsFollowWalls, placeItem } from '../items'

const FLAT = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room bath "Bathroom" bathroom 2.4 x 2 at 0,0',
  'room bed "Bedroom" bedroom 3.5 x 4 east of bath',
  'door d1 between bath and bed, centred, 0.8 wide',
]
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...FLAT, ...lines].join('\n'))
const planOf = (...lines: string[]): FloorPlan => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}
const itemOf = (plan: FloorPlan, id: string) => plan.items!.find((i) => i.id === id)!

describe('an item line (CNT-45)', () => {
  it('stands a bath against the north side, in its west corner, turned to face into the room', () => {
    const plan = planOf('item tub "Bath 1700" bath 1.7 x 0.7 in bath against north, at west')
    expect(plan.items).toHaveLength(1)
    const tub = itemOf(plan, 'tub')
    expect(tub).toMatchObject({ id: 'tub', kind: 'bath', library: 'bath', label: 'Bath 1700', size: [1.7, 0.7], turn: 180 })
    expect(tub.at[0]).toBeCloseTo(0.85, 9)
    expect(tub.at[1]).toBeCloseTo(2 - 0.35, 9)
    expect(validatePlan(plan).issues.filter((i) => i.entity === 'item')).toEqual([])
  })

  it('works out the turn for each side: south 0, east 90, north 180, west 270', () => {
    const plan = planOf(
      'item a wc in bath against south, at east',
      'item b basin in bath against west',
      'item c wardrobe in bed against east, at north',
      'item d double-bed in bed against north',
    )
    expect(itemOf(plan, 'a').turn ?? 0).toBe(0)
    expect(itemOf(plan, 'b').turn).toBe(270)
    expect(itemOf(plan, 'c').turn).toBe(90)
    expect(itemOf(plan, 'd').turn).toBe(180)
    // The WC in the south-east corner: its back on the south face, its side on the east face.
    expect(itemOf(plan, 'a').at).toEqual([2.2, 0.325])
    expect(validatePlan(plan).issues.filter((i) => i.entity === 'item' && i.code === 'item/into-wall')).toEqual([])
  })

  it('places an item a distance from an end, and a built-in wardrobe the full width of a side', () => {
    const plan = planOf('item wc1 wc in bath against south, 0.3 from west', 'item robe "Built-in wardrobe" wardrobe in bed against west, full width')
    expect(itemOf(plan, 'wc1').at[0]).toBeCloseTo(0.3 + 0.2, 9)
    const robe = itemOf(plan, 'robe')
    expect(robe.size[0]).toBeCloseTo(4, 9)
    expect(robe.size[1]).toBe(0.6)
    expect(robe).toMatchObject({ kind: 'storage', label: 'Built-in wardrobe', turn: 270 })
  })

  it('places an item by its kind, at a point, with its own size', () => {
    const plan = planOf('item sofa1 sofa 2 x 0.9 at 4,2 turn 90', 'item w2 toilet in bath against east')
    expect(itemOf(plan, 'sofa1')).toMatchObject({ kind: 'sofa', at: [4, 2], turn: 90, size: [2, 0.9], height: 0.85 })
    // A kind with no size is Grid's first entry of that kind.
    expect(itemOf(plan, 'w2')).toMatchObject({ kind: 'toilet', library: 'wc' })
    expect(write('item sofa1 sofa 2 x 0.9 at 4,2').guesses.some((g) => /a sofa given no height stands 0\.85 m high/.test(g))).toBe(true)
  })

  it('refuses what it cannot place, naming why', () => {
    expect(write('item t1 piano in bed against north').problems[0]!.message).toMatch(/'piano' is neither a library entry nor a kind/)
    expect(write('item t1 bath in nowhere against north').problems[0]!.message).toMatch(/no room 'nowhere'/)
    expect(write('item t1 bath 3 x 0.7 in bath against north').problems[0]!.message).toMatch(/does not fit along the north side of room bath, which is 2\.4 m long/)
    expect(write('item t1 bath in bath against north, at north').problems[0]!.message).toMatch(/has no north end: its ends are (east and west|west and east)/)
    expect(write('item bath bath in bath against north').problems[0]!.message).toMatch(/the item id 'bath' is the id of a wall, room or opening/)
    expect(write('item t1 bath in bath').problems[0]!.message).toMatch(/says where it goes/)
  })

  it('takes raw item, raw fixture and raw furniture as Grid holds an item', () => {
    const plan = planOf('raw item {"id": "x1", "kind": "table", "at": [4, 3], "size": [1, 1], "height": 0.75}', 'raw fixture {"id": "x2", "library": "wc", "at": [1, 1]}')
    expect(plan.items!.map((i) => i.id)).toEqual(['x1', 'x2'])
    expect(write('raw furniture {"id": "x3", "kind": "chair"}').problems[0]!.message).toMatch(/the raw item would not be read: at /)
  })
})

describe('the read-back of items (CNT-45)', () => {
  it('writes every item again so the text gives back the same items', () => {
    const plan = planOf(
      'item tub "Bath 1700" bath 1.7 x 0.7 in bath against north, at west',
      'item wc1 wc in bath against south, 0.3 from west',
      'item robe wardrobe in bed against west, full width',
      'item sofa1 sofa 2 x 0.9 0.8 high at 4.1,2.2 turn 90',
      'item bed1 double-bed in bed against north, at east',
    )
    const text = readRoomsText(plan).text
    expect(text).toContain('item tub "Bath 1700" bath 1.7 x 0.7 in bath against north, at west')
    expect(text).toContain('item wc1 wc in bath against south, 0.3 from west')
    expect(text).toMatch(/item robe wardrobe in bed against west, full width 0\.6 deep/)
    expect(text).toContain('item sofa1 sofa 2 x 0.9 0.8 high at 4.1,2.2 turn 90')
    expect(text).toContain('item bed1 double-bed in bed against north, at east')
    const again = parseFloorPlan(compileRoomsText(text).plan)
    expect(again.items).toEqual(plan.items)
  })

  it('writes an item rooms text cannot name as raw', () => {
    const plan = planOf('raw item {"id": "x1", "kind": "piano", "at": [4, 3], "size": [1.5, 0.6], "height": 1.2}')
    const text = readRoomsText(plan).text
    expect(text).toContain('raw item {"id":"x1","kind":"piano","at":[4,3],"size":[1.5,0.6],"height":1.2}')
    expect(parseFloorPlan(compileRoomsText(text).plan).items).toEqual(plan.items)
  })
})

describe('items follow their walls (CNT-45)', () => {
  it('moves a bath against a wall with that wall, and one in a corner with both', () => {
    const before = planOf('item tub bath in bath against north, at west', 'item bed1 double-bed at 4.5,2')
    const north = before.walls.find((w) => w.id === 'w-bath-north' || (w.start[1] > 2 && w.end[1] > 2 && Math.max(w.start[0], w.end[0]) < 3))!
    const west = before.walls.find((w) => Math.abs(w.start[0] - w.end[0]) < 1e-9 && w.start[0] < 0)!
    const shifted = (w: Wall, dx: number, dy: number): Wall => ({ ...w, start: [w.start[0] + dx, w.start[1] + dy], end: [w.end[0] + dx, w.end[1] + dy] })
    const after: FloorPlan = { ...before, walls: before.walls.map((w) => (w.id === north.id ? shifted(w, 0, 0.5) : w.id === west.id ? shifted(w, -0.25, 0) : w)) }
    const moved = itemsFollowWalls(before, after)
    const tub = itemOf(before, 'tub')
    expect(moved.get('tub')!.at[0]).toBeCloseTo(tub.at[0] - 0.25, 9)
    expect(moved.get('tub')!.at[1]).toBeCloseTo(tub.at[1] + 0.5, 9)
    expect(moved.has('bed1')).toBe(false)
  })

  it('places through the tools as the line does', () => {
    const plan = planOf()
    const made = placeItem(plan, { id: 'k', name: 'kitchen-run-2400', room: 'bed', against: 'south', end: 'west' })
    expect(made.room).toBe('bed')
    expect(made.record).toMatchObject({ id: 'k', library: 'kitchen-run-2400' })
    expect(made.item.turn ?? 0).toBe(0)
  })
})
