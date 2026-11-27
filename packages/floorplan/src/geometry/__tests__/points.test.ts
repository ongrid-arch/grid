/**
 * CNT-52: the point kinds: things that stand at a point of the plan (an extinguisher, a camera, an
 * exit), drawn by their own symbols, in no one's way, carrying facts of the person's own into the
 * exports and through the rooms text read-back.
 */
import { describe, expect, it } from 'vitest'
import { POINT_KINDS, parseFloorPlan, type Item } from '../../types/floorplan'
import { builtInItem } from '../../library/builtIn'
import { say } from '../../messages/say'
import { compileRoomsText } from '../../rooms/compile'
import { readRoomsText } from '../../rooms/read'
import { flat } from '../../test-support/plans'
import type { FloorPlan } from '../plan'
import { buildFloorPlan } from '../floorplan'
import { isPointKind, itemKindDefinition, itemKinds, takesFloor } from '../itemKinds'
import { itemSolid, itemSymbol } from '../items'
import { validatePlan } from '../validate'
import { dxfFactsOf, toDxf } from '../export/dxf'
import { IFC_FACTS_SET, toIfc } from '../export/ifc'

const PLACE_CODES = ['item/outside-rooms', 'item/into-wall', 'item/leaves-room', 'item/overlap', 'item/clearance-blocked']

describe('the point kinds (CNT-52)', () => {
  it('are points that take no floor, each with its own symbol, a solid, an entry in the library and its words', () => {
    const shapes = new Set<string>()
    for (const kind of POINT_KINDS) {
      expect(itemKindDefinition(kind)?.group, kind).toBe('point')
      expect(isPointKind(kind), kind).toBe(true)
      expect(takesFloor(kind), kind).toBe(false)
      const item: Item = { id: kind, kind, at: [0, 0], size: [0.4, 0.4], height: 1.2 }
      const symbol = itemSymbol(item)!
      expect(symbol.rings.length, kind).toBeGreaterThan(0)
      shapes.add(JSON.stringify(symbol))
      const [solid] = itemSolid(item)
      expect(solid, kind).toMatchObject({ bottom: expect.closeTo(0.8, 6), top: 1.2 })
      const entry = builtInItem(kind)!
      expect(entry.kind, kind).toBe(kind)
      for (const key of [`kind.about.${kind}`, `drawing.key.point.${kind}`, `issue.part.item.${kind}`, `describe.fixture.${kind}.one`] as const) {
        expect(say('en', key as Parameters<typeof say>[1], { id: 'x', count: 1 }), key).not.toBe(key)
        expect(say('es', key as Parameters<typeof say>[1], { id: 'x', count: 1 }), key).not.toBe(key)
      }
    }
    // Each told apart by its shape alone.
    expect(shapes.size).toBe(POINT_KINDS.length)
    expect(itemKinds('point')).toEqual([...POINT_KINDS])
    expect(isPointKind('toilet')).toBe(false)
  })

  it('stands on a wall, outside or on another item without a word of where it stands', () => {
    const items: Item[] = [
      { id: 'fe1', kind: 'extinguisher', at: [2, 0], size: [0.4, 0.4], height: 1 },
      { id: 'ap', kind: 'assembly-point', at: [-6, -6], size: [0.6, 0.6], height: 2 },
      { id: 'cp', kind: 'call-point', at: [2, 0.1], size: [0.3, 0.3], height: 1.4 },
      { id: 'bed', kind: 'bed', at: [7, 2], size: [1.4, 2], height: 0.5, clearance: 0.6 },
      { id: 'cam', kind: 'camera', at: [7, 3.2], size: [0.3, 0.3], height: 2.6 },
    ]
    const plan: FloorPlan = { ...flat(), items }
    const issues = validatePlan(plan).issues.filter((issue) => issue.entity === 'item')
    expect(issues.filter((issue) => PLACE_CODES.includes(issue.code))).toEqual([])
    // The bed is still checked: a fixture put in it is said.
    const crowded: FloorPlan = { ...plan, items: [...items, { id: 'wc', kind: 'toilet', at: [7, 2], size: [0.4, 0.6], height: 0.8 }] }
    expect(validatePlan(crowded).issues.some((issue) => issue.code === 'item/overlap' && issue.id === 'wc')).toBe(true)
  })

  it('places a point by its kind from Grid\'s library in rooms text', () => {
    const text = ['walls outside 0.3 inside 0.1 height 3', 'room hall "Hall" corridor 6 x 2 at 0,0', 'item fe1 extinguisher at 0.2,1'].join('\n')
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    const item = parseFloorPlan(result.plan).items![0]!
    expect(item).toMatchObject({ kind: 'extinguisher', library: 'extinguisher', size: [0.4, 0.4], height: 1 })
  })
})

describe('facts on an item (CNT-52)', () => {
  const plan: FloorPlan = {
    ...flat(),
    items: [{ id: 'fe1', kind: 'extinguisher', at: [2, 1], size: [0.4, 0.4], height: 1, properties: { type: 'CO2', serviced: '2026-09', capacity: 5 } }],
  }

  it('are read with the item', () => {
    expect(parseFloorPlan(plan).items![0]!.properties).toEqual({ type: 'CO2', serviced: '2026-09', capacity: 5 })
  })

  it('go into the DXF\'s facts at the item\'s middle and into the IFC\'s own set', () => {
    const dxf = toDxf(buildFloorPlan(plan), { facts: dxfFactsOf(plan, null) })
    expect(dxf).toContain('[fe1] type: CO2')
    expect(dxf).toContain('[fe1] capacity: 5')
    const ifc = toIfc(plan)
    expect(ifc).toContain(IFC_FACTS_SET)
    expect(ifc).toMatch(/IFCPROPERTYSINGLEVALUE\('serviced'/)
  })

  it('are kept when the plan is read back as rooms text and written again', () => {
    const reading = readRoomsText(plan)
    expect(reading.text).toMatch(/raw item .*"properties"/)
    const again = parseFloorPlan(compileRoomsText(reading.text).plan)
    expect(again.items![0]!.properties).toEqual({ type: 'CO2', serviced: '2026-09', capacity: 5 })
  })
})
