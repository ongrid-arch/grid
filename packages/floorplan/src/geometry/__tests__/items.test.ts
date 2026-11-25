/**
 * CNT-12: fixtures in the plan, on CNT-11's decision (fixtures now, furniture later). A fixture
 * is never a wall and never a room: it adds no area and no note, is drawn to scale, is matched
 * to the room it stands in, takes only its own floor from it, and is exported as furnishing.
 */
import { describe, expect, it } from 'vitest'
import type { Item } from '../../types/floorplan'
import { FloorPlanSchema, parseFloorPlan } from '../../types/floorplan'
import { flat, twoFloorHouse } from '../../test-support/plans'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { validatePlan } from '../validate'
import { checkPlanSanity } from '../rules'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'
import { inIdOrder } from '../order'
import { area } from '../vec2'
import { convexPenetration, itemFloorTaken, itemFootprint, itemRoom, itemSymbol, roomShapes } from '../items'
import { toIfc } from '../export/ifc'
import { toDxf } from '../export/dxf'

const fixtures = (): Item[] => [
  { id: 'run', kind: 'kitchen-run', at: [6.6, 0.4], size: [3, 0.6], height: 0.9 },
  { id: 'bath', kind: 'bath', at: [8.95, 7.55], size: [1.7, 0.7], height: 0.55, turn: 180 },
  { id: 'wc', kind: 'toilet', at: [9.575, 5], size: [0.4, 0.65], height: 0.8, turn: 90, label: 'WC' },
  { id: 'basin', kind: 'basin', at: [9.7, 6], size: [0.5, 0.4], height: 0.85, turn: 90 },
  { id: 'shower', kind: 'shower', at: [5.55, 4.55], size: [0.9, 0.9], height: 0.1 }
]

const withItems = (items: Item[], plan: FloorPlan = flat()): FloorPlan => ({ ...plan, items })
const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => i.code)
const areas = (plan: FloorPlan): number[] => {
  const index = indexPlan(plan)
  return plan.rooms.map((r) => roomArea(r, index))
}

describe('an item is never a room or a wall', () => {
  it('adds 0 m² and 0 notes: the rooms, the drawing problems and the findings stay as they were', () => {
    const before = flat()
    const after = withItems(fixtures())
    expect(areas(after)).toEqual(areas(before))
    expect(validatePlan(after).issues).toEqual(validatePlan(before).issues)
    expect(checkPlanSanity(after).findings).toEqual(checkPlanSanity(before).findings)
    const drawing = buildFloorPlan(after)
    expect(drawing.rooms.map((r) => r.area)).toEqual(buildFloorPlan(before).rooms.map((r) => r.area))
    expect(drawing.walls).toHaveLength(before.walls.length)
    expect(drawing.items.map((i) => i.id)).toEqual(['run', 'bath', 'wc', 'basin', 'shower'])
  })

  it('leaves a kind Grid does not hold out with one note, and still adds no area', () => {
    // CNT-20: a table is furniture now; a piano is still no kind Grid holds.
    const table: Item = { id: 't1', kind: 'piano', at: [2, 6], size: [1.6, 0.9], height: 0.75 }
    const plan = withItems([table])
    expect(areas(plan)).toEqual(areas(flat()))
    const issues = validatePlan(plan).issues.filter((i) => i.entity === 'item')
    expect(issues.map((i) => [i.code, i.severity])).toEqual([['item/unknown-kind', 'error']])
    expect(issues[0]!.message).toContain('"bed"')
    expect(buildFloorPlan(plan).items).toEqual([])
    expect(checkPlanSanity(plan).findings).toEqual(checkPlanSanity(flat()).findings)
  })
})

describe('where an item stands', () => {
  it('covers its size, turned counter-clockwise about its middle, back to -Y unturned', () => {
    const [run, bath, wc] = fixtures()
    const foot = itemFootprint(run!)
    expect(foot.map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)])).toEqual([[5.1, 0.1], [8.1, 0.1], [8.1, 0.7], [5.1, 0.7]])
    expect(area(foot)).toBeCloseTo(1.8, 9)
    // Turned half round, its back is against the north wall's face (y 7.9).
    expect(Math.max(...itemFootprint(bath!).map((p) => p.y))).toBeCloseTo(7.9, 9)
    // A quarter turn puts the back to +X, against the east wall's face (x 9.9).
    expect(Math.max(...itemFootprint(wc!).map((p) => p.x))).toBeCloseTo(9.9, 9)
  })

  it('is in the smallest room on its floor that holds its middle, and in none outside the rooms', () => {
    const plan = withItems(fixtures())
    const rooms = roomShapes(indexPlan(plan))
    expect(fixtures().map((i) => itemRoom(i, rooms)?.id)).toEqual(['kitchen', 'bathroom', 'bathroom', 'bathroom', 'bathroom'])
    expect(itemRoom({ ...fixtures()[0]!, at: [20, 20] }, rooms)).toBeNull()
    expect(itemRoom({ ...fixtures()[0]!, floor: 'first' }, rooms)).toBeNull()
  })

  it('takes from its room only the floor it stands on, overlapping fixtures counted once', () => {
    const plan = withItems(fixtures())
    const taken = itemFloorTaken(plan.items!, roomShapes(indexPlan(plan)))
    expect(taken.get('kitchen')).toBeCloseTo(1.8, 6)
    expect(taken.get('bathroom')).toBeCloseTo(1.7 * 0.7 + 0.4 * 0.65 + 0.5 * 0.4 + 0.81, 6)
    expect(taken.has('hall')).toBe(false)
    const twice = itemFloorTaken([fixtures()[0]!, { ...fixtures()[0]!, id: 'run2' }], roomShapes(indexPlan(plan)))
    expect(twice.get('kitchen')).toBeCloseTo(1.8, 6)
  })

  it('goes with its floor when the plan is sliced, and in id order for an export', () => {
    const plan: FloorPlan = { ...twoFloorHouse(), items: [{ ...fixtures()[0]!, id: 'b' }, { ...fixtures()[0]!, id: 'a', floor: 'first' }] }
    expect(planForFloor(plan, 'ground').items!.map((i) => i.id)).toEqual(['b'])
    expect(planForFloor(plan, 'first').items!.map((i) => i.id)).toEqual(['a'])
    expect(inIdOrder(plan).items!.map((i) => i.id)).toEqual(['a', 'b'])
    expect('items' in planForFloor(flat(), 'ground')).toBe(false)
  })
})

describe('what is worth a look about an item', () => {
  it('names an item that runs into a wall, and not one that stands against its face', () => {
    const into: Item = { ...fixtures()[0]!, at: [6.6, 0.3] }
    const issues = validatePlan(withItems([into])).issues.filter((i) => i.entity === 'item')
    // CNT-21: the run's back also reaches into the kitchen window's opening, past the room's edge.
    expect(issues.map((i) => [i.code, i.severity])).toEqual([['item/into-wall', 'warning'], ['item/leaves-room', 'warning']])
    expect(issues[0]!.message).toContain('"s2" by 0.10 m')
    expect(codes(withItems(fixtures())).filter((c) => c.startsWith('item/'))).toEqual([])
  })

  it('names an item taller than its room, with both heights', () => {
    const tall: Item = { ...fixtures()[0]!, height: 3 }
    const issue = validatePlan(withItems([tall])).issues.find((i) => i.code === 'item/too-tall')!
    expect(issue.severity).toBe('warning')
    expect(issue.message).toContain('3.00 m high, 0.30 m higher than room "Kitchen", which is 2.70 m high')
  })

  it('names an item in no room, one on a floor the plan does not have, and one with a taken id', () => {
    const plan = withItems([
      { ...fixtures()[0]!, id: 'out', at: [20, 20] },
      { ...fixtures()[0]!, id: 'up', floor: 'loft' },
      { ...fixtures()[0]!, id: 'hall' }
    ])
    expect(codes(plan).filter((c) => c.startsWith('item/'))).toEqual(['item/unknown-floor', 'item/duplicate-id', 'item/outside-rooms'])
  })

  it('measures how far two convex shapes reach into each other', () => {
    const square = (x: number): { x: number; y: number }[] => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }]
    expect(convexPenetration(square(0), square(0.75))).toBeCloseTo(0.25, 9)
    expect(convexPenetration(square(0), square(1))).toBe(0)
    expect(convexPenetration(square(0), square(2))).toBe(0)
  })
})

describe('how an item is drawn', () => {
  it('draws each kind inside its own footprint, so the symbol is to scale', () => {
    for (const item of fixtures()) {
      const foot = itemFootprint(item)
      const xs = foot.map((p) => p.x)
      const ys = foot.map((p) => p.y)
      const symbol = itemSymbol(item)!
      const points = [...symbol.rings.flat(), ...symbol.lines.flat()]
      expect(points.length, item.kind).toBeGreaterThan(3)
      for (const p of points) {
        expect(p.x, item.kind).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9)
        expect(p.x, item.kind).toBeLessThanOrEqual(Math.max(...xs) + 1e-9)
        expect(p.y, item.kind).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9)
        expect(p.y, item.kind).toBeLessThanOrEqual(Math.max(...ys) + 1e-9)
      }
    }
  })

  it('gives the DXF a fixtures layer only when the plan has fixtures', () => {
    expect(toDxf(buildFloorPlan(flat()))).not.toContain('GRID-FIXTURES')
    const dxf = toDxf(buildFloorPlan(withItems(fixtures())))
    expect(dxf).toContain('GRID-FIXTURES')
    expect(dxf.split('\n').filter((line) => line === 'GRID-WALLS-EXTERIOR').length).toBe(
      toDxf(buildFloorPlan(flat())).split('\n').filter((line) => line === 'GRID-WALLS-EXTERIOR').length
    )
  })
})

describe('the IFC', () => {
  const count = (ifc: string, type: string): number => ifc.split('\n').filter((line) => line.includes(`=${type}(`)).length

  it('exports every fixture as furnishing and never as a wall', () => {
    const before = toIfc(flat())
    const after = toIfc(withItems(fixtures()))
    expect(count(after, 'IFCFURNISHINGELEMENT')).toBe(5)
    expect(count(after, 'IFCWALLSTANDARDCASE')).toBe(count(before, 'IFCWALLSTANDARDCASE'))
    expect(count(after, 'IFCSPACE')).toBe(count(before, 'IFCSPACE'))
    expect(count(after, 'IFCSLAB')).toBe(count(before, 'IFCSLAB'))
    const wc = after.split('\n').find((line) => line.includes('IFCFURNISHINGELEMENT') && line.includes("'wc'"))!
    expect(wc).toContain("'WC',$,'toilet'")
    // Written after everything else: the file without fixtures is the start of the file with them.
    const data = (ifc: string): string[] => ifc.split('\n').filter((line) => line.startsWith('#'))
    expect(data(after).slice(0, data(before).length)).toEqual(data(before))
  })

  it('leaves out a fixture of a kind the plan does not hold, and a plan without any is as it was', () => {
    const table: Item = { id: 't1', kind: 'piano', at: [2, 6], size: [1.6, 0.9], height: 0.75 }
    expect(count(toIfc(withItems([table])), 'IFCFURNISHINGELEMENT')).toBe(0)
    expect(toIfc(withItems([]))).toBe(toIfc(flat()))
  })
})

describe('the plan format', () => {
  it('reads items and keeps a plan without them free of the key', () => {
    const plan = parseFloorPlan({ walls: [], rooms: [], openings: [], items: [{ id: 'wc', kind: 'toilet', at: [1, 1], size: [0.4, 0.65], height: 0.8 }] })
    expect(plan.items).toEqual([{ id: 'wc', kind: 'toilet', at: [1, 1], size: [0.4, 0.65], height: 0.8 }])
    expect('items' in parseFloorPlan({ walls: [] })).toBe(false)
  })

  it('refuses an item with no size or height, or a size of 0', () => {
    const bad = (item: unknown): boolean => FloorPlanSchema.safeParse({ items: [item] }).success
    expect(bad({ id: 'wc', kind: 'toilet', at: [1, 1], height: 0.8 })).toBe(false)
    expect(bad({ id: 'wc', kind: 'toilet', at: [1, 1], size: [0.4, 0.65] })).toBe(false)
    expect(bad({ id: 'wc', kind: 'toilet', at: [1, 1], size: [0, 0.65], height: 0.8 })).toBe(false)
    expect(bad({ id: 'wc', kind: 'toilet', at: [1, 1], size: [0.4, 0.65], height: 0.8 })).toBe(true)
  })
})
