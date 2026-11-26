/**
 * CNT-47: the equipment kinds, and the clear floor an item keeps behind it and at its sides.
 */
import { describe, expect, it } from 'vitest'
import { EQUIPMENT_KINDS, parseFloorPlan, type Item } from '../../types/floorplan'
import { builtInItem } from '../../library/builtIn'
import { compileRoomsText } from '../../rooms/compile'
import { itemKindDefinition, itemKinds, takesFloor } from '../itemKinds'
import { itemClearanceZones, itemSolid, itemSymbol } from '../items'
import { validatePlan } from '../validate'

describe('the equipment kinds (CNT-47)', () => {
  it('are fixtures that take floor, each drawn, raised in 3D and sized in the library but equipment', () => {
    for (const kind of EQUIPMENT_KINDS) {
      expect(itemKindDefinition(kind)?.group, kind).toBe('fixture')
      expect(takesFloor(kind), kind).toBe(true)
      const item: Item = { id: kind, kind, at: [0, 0], size: [1, 0.8], height: 1.5 }
      expect(itemSymbol(item)!.rings.length, kind).toBeGreaterThan(0)
      expect(itemSolid(item).length, kind).toBeGreaterThan(0)
      if (kind !== 'equipment') expect(builtInItem(kind)?.kind, kind).toBe(kind)
    }
    expect(builtInItem('equipment')).toBeUndefined()
    expect(itemKinds('fixture')).toEqual(expect.arrayContaining([...EQUIPMENT_KINDS]))
  })

  it('places equipment by its kind only with its size and height', () => {
    const text = (line: string): string => ['walls outside 0.3 inside 0.1 height 3', 'room plant "Plant room" store 6 x 4 at 0,0', line].join('\n')
    expect(compileRoomsText(text('item x equipment at 2,2')).problems[0]!.message).toMatch(/give its size and height/)
    const plan = parseFloorPlan(compileRoomsText(text('item ups "UPS" equipment 1.2 x 0.8 1.9 high at 2,2')).plan)
    expect(plan.items![0]).toMatchObject({ kind: 'equipment', label: 'UPS', size: [1.2, 0.8], height: 1.9 })
  })
})

describe('clear floor on every side (CNT-47)', () => {
  const zones = (item: Item) => itemClearanceZones(item).map((z) => [z.side, z.zone.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6])])

  it('lays a zone behind, at the left and at the right of an item as well as in front', () => {
    const item: Item = { id: 'f', kind: 'fume-cupboard', at: [0, 0], size: [2, 1], height: 2.4, clearance: 1, clearSides: { back: 0.5, left: 0.3, right: 0.4 } }
    expect(zones(item)).toEqual([
      ['front', [[-1, 0.5], [1, 0.5], [1, 1.5], [-1, 1.5]]],
      ['back', [[-1, -1], [1, -1], [1, -0.5], [-1, -0.5]]],
      ['left', [[-1.3, -0.5], [-1, -0.5], [-1, 0.5], [-1.3, 0.5]]],
      ['right', [[1, -0.5], [1.4, -0.5], [1.4, 0.5], [1, 0.5]]],
    ])
  })

  it('says when a wall or an item stands in the clear floor at a side', () => {
    const text = [
      'walls outside 0.3 inside 0.1 height 3',
      'room lab "Lab" lab 6 x 4 at 0,0',
      'item fc fume-cupboard clear right 0.5 in lab against north, at west',
      'item b1 lab-bench 1.5 x 0.75 clear right 0.8 at 3,1',
      'item b2 lab-bench 1.5 x 0.75 at 4.9,1',
    ].join('\n')
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    expect(plan.items!.find((i) => i.id === 'fc')!.clearSides).toEqual({ right: 0.5 })
    const blocked = validatePlan(plan).issues.filter((i) => i.code === 'item/clearance-blocked')
    expect(blocked.map((i) => i.id).sort()).toEqual(['b1', 'fc'])
    expect(blocked.find((i) => i.id === 'b1')!.message).toMatch(/keeps 0\.80 m clear at its right, and .*b2.* stands in that floor/)
    expect(blocked.find((i) => i.id === 'fc')!.message).toMatch(/keeps 0\.50 m clear at its right, and wall/)
  })
})
