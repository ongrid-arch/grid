/**
 * CNT-55: the bathroom's and the kitchen's kinds, an item hung above the floor (`elevation`), and
 * how the drawing, the checks and the exports read its height: a wall unit floats over a kitchen
 * run, a sink stands in its worktop, a WC is a flow terminal, and a plain word is a kind.
 */
import { describe, expect, it } from 'vitest'
import { KITCHEN_KINDS, SANITARY_KINDS, parseFloorPlan, readItemKind, type Item } from '../../types/floorplan'
import { builtInItem } from '../../library/builtIn'
import { say } from '../../messages/say'
import { compileRoomsText } from '../../rooms/compile'
import { readRoomsText } from '../../rooms/read'
import { placeItem } from '../../rooms/items'
import type { FloorPlan } from '../plan'
import { buildFloorPlan } from '../floorplan'
import { isInsetKind, isLabelledKind, itemIfcType, itemKindDefinition, takesFloor } from '../itemKinds'
import { isRaised, itemFloorTaken, itemSolid, itemSymbol, itemTop, roomShapes } from '../items'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { toDxf, DXF_LAYERS } from '../export/dxf'
import { toIfc } from '../export/ifc'

/** A kitchen 4 m by 3 m, 2.5 m high, and the items given. */
function kitchen(items: readonly Item[]): FloorPlan {
  const plan = parseFloorPlan(compileRoomsText(['walls outside 0.3 inside 0.1 height 2.5', 'room k "Kitchen" kitchen 4 x 3 at 0,0'].join('\n')).plan)
  return { ...plan, items: [...items] }
}

const run: Item = { id: 'run', kind: 'kitchen-run', at: [2, 2.7], size: [3, 0.6], height: 0.9, turn: 180 }
const codes = (plan: FloorPlan, id: string): string[] => validatePlan(plan).issues.filter((issue) => issue.id === id).map((issue) => issue.code)

describe('the sanitary and kitchen kinds (CNT-55)', () => {
  it('are fixtures, each with its own symbol, its solid, an entry in the library and its words', () => {
    const shapes = new Set<string>()
    for (const kind of [...SANITARY_KINDS, ...KITCHEN_KINDS]) {
      expect(itemKindDefinition(kind)?.group, kind).toBe('fixture')
      expect(takesFloor(kind), kind).toBe(true)
      const item: Item = { id: kind, kind, at: [0, 0], size: [0.6, 0.5], height: 0.9 }
      const symbol = itemSymbol(item)!
      expect(symbol.rings.length, kind).toBeGreaterThan(0)
      shapes.add(JSON.stringify(symbol))
      expect(itemSolid(item).length, kind).toBeGreaterThan(0)
      expect(builtInItem(kind)?.kind, kind).toBe(kind)
      for (const key of [`kind.about.${kind}`, `issue.part.item.${kind}`, `issue.part.Item.${kind}`, `describe.fixture.${kind}.one`, `describe.fixture.${kind}.many`] as const) {
        expect(say('en', key as Parameters<typeof say>[1], { id: 'x', count: 1 }), key).not.toBe(key)
        expect(say('es', key as Parameters<typeof say>[1], { id: 'x', count: 1 }), key).not.toBe(key)
      }
    }
    // Each told apart by its shape alone, at one size.
    expect(shapes.size).toBe(SANITARY_KINDS.length + KITCHEN_KINDS.length)
    expect(['sink', 'hob', 'shower-screen'].every(isInsetKind)).toBe(true)
    expect(['range', 'fryer', 'prep-table', 'dishwasher', 'hood'].every(isLabelledKind)).toBe(true)
    expect(isLabelledKind('oven')).toBe(false)
  })

  it('reads a plain word as its kind, as a use is read, and leaves any other word for the check', () => {
    expect(['WC', 'w.c.', 'Loo', 'lavatory'].map(readItemKind)).toEqual(['toilet', 'toilet', 'toilet', 'toilet'])
    expect(['tub', 'Washbasin', 'fridge-freezer', 'Wall cabinet', 'cooker', 'Toilet', 'Kitchen_Run'].map(readItemKind)).toEqual(['bath', 'basin', 'fridge', 'wall-unit', 'oven', 'toilet', 'kitchen-run'])
    expect(readItemKind('bidet')).toBe('bidet')
    expect(readItemKind('jacuzzi')).toBe('jacuzzi')
    const plan = kitchen([{ id: 'w', kind: 'WC', at: [0.5, 0.5], size: [0.4, 0.6], height: 0.8 }])
    expect(parseFloorPlan(plan).items![0]!.kind).toBe('toilet')
  })

  it('says the kind a misspelt one most likely means', () => {
    const plan = kitchen([{ id: 'b', kind: 'bidét', at: [0.5, 0.5], size: [0.4, 0.6], height: 0.4 }])
    const found = validatePlan(plan).issues.find((issue) => issue.code === 'item/unknown-kind')!
    expect(found.message).toContain('did you mean "bidet"?')
  })

  it('places a plain word in rooms text and by a tool as its kind, from Grid\'s first entry of it', () => {
    const plan = kitchen([])
    const made = placeItem(plan, { id: 'w', name: 'WC', room: 'k', against: 'west' })
    expect(made.item).toMatchObject({ kind: 'toilet', library: 'wc' })
  })
})

describe('an item hung above the floor (CNT-55)', () => {
  const wall: Item = { id: 'wu', kind: 'wall-unit', at: [2, 2.825], size: [3, 0.35], height: 0.72, elevation: 1.45, turn: 180 }

  it('is raised to its elevation in 3D, its height its own', () => {
    expect(itemSolid(wall)).toEqual([expect.objectContaining({ bottom: 1.45, top: expect.closeTo(2.17, 9) })])
    expect(itemTop(wall)).toBeCloseTo(2.17, 9)
    expect(isRaised(wall)).toBe(true)
    expect(isRaised({ elevation: 0.2 })).toBe(false)
  })

  it('stands in no item it hangs over, takes no floor and keeps no one from their clear floor', () => {
    const kept = { ...run, clearance: 1.2 }
    const shelf: Item = { ...wall, id: 'shelf', at: [2, 2], elevation: 1.6 }
    const plan = kitchen([kept, wall, shelf])
    expect(codes(plan, 'wu')).toEqual([])
    expect(codes(plan, 'shelf')).toEqual([])
    expect(codes(plan, 'run')).toEqual([])
    const taken = itemFloorTaken(plan.items!, roomShapes(indexPlan(plan)))
    expect(taken.get('k')).toBeCloseTo(3 * 0.6, 6)
    // Hung low enough to meet the run, it stands in it; on the floor, the shelf blocks the run's clear floor.
    expect(codes(kitchen([run, { ...wall, elevation: 0.5 }]), 'wu')).toContain('item/overlap')
    expect(codes(kitchen([kept, { ...shelf, elevation: 0 }]), 'run')).toContain('item/clearance-blocked')
  })

  it('is too tall by its top', () => {
    const plan = kitchen([{ ...wall, elevation: 2 }])
    const found = validatePlan(plan).issues.find((issue) => issue.code === 'item/too-tall')!
    expect(found.message).toContain('reaches 2.72 m, hung 2.00 m above the floor, 0.22 m higher than room "Kitchen"')
  })

  it('takes its elevation from its library entry, and rooms text writes it back as "above"', () => {
    const plan = parseFloorPlan(compileRoomsText(['walls outside 0.3 inside 0.1 height 2.5', 'room k "Kitchen" kitchen 4 x 3 at 0,0', 'item wu wall-unit in k against north', 'item hood hood 1.2 x 0.6 0.5 high above 1.9 in k against north, at west'].join('\n')).plan)
    expect(plan.items![0]).toMatchObject({ kind: 'wall-unit', elevation: 1.45, height: 0.72 })
    expect(plan.items![1]).toMatchObject({ kind: 'hood', elevation: 1.9, height: 0.5 })
    const text = readRoomsText(plan).text
    expect(text).toContain('above 1.9')
    const again = parseFloorPlan(compileRoomsText(text).plan)
    expect(again.items!.map((item) => item.elevation)).toEqual([1.45, 1.9])
  })
})

describe('a sink or a hob set into a worktop (CNT-55)', () => {
  it('stands in no item, and no item in it', () => {
    const sink: Item = { id: 'sink', kind: 'sink', at: [1.5, 2.6], size: [1, 0.5], height: 0.2, elevation: 0.7, turn: 180 }
    const hob: Item = { id: 'hob', kind: 'hob', at: [3, 2.6], size: [0.6, 0.5], height: 0.03, elevation: 0.88, turn: 180 }
    const plan = kitchen([run, sink, hob])
    expect(validatePlan(plan).issues.filter((issue) => issue.code === 'item/overlap')).toEqual([])
  })
})

describe('symbols by height and label, in the drawing and the DXF (CNT-55)', () => {
  const fryer: Item = { id: 'fr', kind: 'fryer', label: 'Fryer', at: [1, 1], size: [0.4, 0.8], height: 0.9 }
  const hood: Item = { id: 'hd', kind: 'hood', label: 'Hood', at: [2, 2.5], size: [1.8, 1], height: 0.6, elevation: 2, turn: 180 }
  const plan = kitchen([fryer, hood, run])

  it('marks a hung item raised and a commercial piece labelled', () => {
    const drawn = buildFloorPlan(plan).items
    expect(drawn.find((item) => item.id === 'hd')).toMatchObject({ raised: true, labelled: true, label: 'Hood' })
    expect(drawn.find((item) => item.id === 'fr')).toMatchObject({ labelled: true, label: 'Fryer' })
    expect(drawn.find((item) => item.id === 'fr')!.raised).toBeUndefined()
    expect(drawn.find((item) => item.id === 'run')!.labelled).toBeUndefined()
  })

  it('puts a hung item on the dashed layer and writes a labelled one\'s label', () => {
    const dxf = toDxf(buildFloorPlan(plan))
    expect(dxf).toContain(DXF_LAYERS.fixturesAbove)
    expect(dxf).toMatch(new RegExp(`\\n\\s*8\\r?\\n${DXF_LAYERS.fixturesAbove}\\r?\\n`))
    expect(dxf).toMatch(/\n\s*1\r?\nFryer\r?\n/)
    expect(dxf).toMatch(/\n\s*1\r?\nHood\r?\n/)
    // A plan with nothing hung writes no such layer.
    expect(toDxf(buildFloorPlan(kitchen([fryer, run])))).not.toContain(DXF_LAYERS.fixturesAbove)
  })
})

describe('sanitary kinds in the IFC (CNT-55)', () => {
  it('are flow terminals typed by their sanitary kind, lifted by their elevation; furniture stays furnishing', () => {
    expect(itemIfcType('toilet')).toEqual({ type: 'IFCSANITARYTERMINALTYPE', predefined: 'TOILETPAN' })
    expect(itemIfcType('towel-radiator')?.type).toBe('IFCSPACEHEATERTYPE')
    expect(itemIfcType('oven')).toBeUndefined()
    const plan = kitchen([
      { id: 'wc', kind: 'toilet', library: 'wall-hung-wc', at: [0.5, 0.4], size: [0.36, 0.54], height: 0.22, elevation: 0.2 },
      { id: 'b1', kind: 'basin', at: [1.5, 0.3], size: [0.55, 0.45], height: 0.85 },
      { id: 'b2', kind: 'basin', at: [2.5, 0.3], size: [0.55, 0.45], height: 0.85 },
      { id: 'oven', kind: 'oven', at: [3.5, 0.4], size: [0.6, 0.6], height: 0.9 },
    ])
    const ifc = toIfc(plan)
    expect(ifc.match(/IFCFLOWTERMINAL\(/g)).toHaveLength(3)
    expect(ifc.match(/IFCFURNISHINGELEMENT\(/g)).toHaveLength(1)
    expect(ifc).toMatch(/IFCSANITARYTERMINALTYPE\([^;]*\.TOILETPAN\.\);/)
    expect(ifc.match(/IFCSANITARYTERMINALTYPE\(/g)).toHaveLength(2)
    expect(ifc.match(/IFCRELDEFINESBYTYPE\(/g)!.length).toBeGreaterThanOrEqual(2)
    expect(ifc).toMatch(/IFCCARTESIANPOINT\(\(0\.5,0\.4,0\.2\)\)/)
  })
})
