/**
 * CNT-20: the one registry of kinds of thing. A kind added there, in one call, reaches the
 * drawing, the DXF and IFC exports, the measures and the drawing's check, with nothing else
 * changed; and every DXF door and fixture is a block.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { Item } from '../../types/floorplan'
import { ITEM_KINDS } from '../../types/floorplan'
import { flat } from '../../test-support/plans'
import type { FloorPlan } from '../plan'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { itemFloorTaken, itemFootprint, itemSolid, itemSymbol, roomShapes } from '../items'
import { indexPlan } from '../plan'
import { ITEM_KIND_DEFINITIONS, ItemKindRefused, isItemKind, itemKinds, liesUnderfoot, registerItemKind, takesFloor, type ItemKindDefinition } from '../itemKinds'
import { toDxf } from '../export/dxf'
import { toIfc } from '../export/ifc'

const withItems = (items: Item[], plan: FloorPlan = flat()): FloorPlan => ({ ...plan, items })

/** A kind of thing from outside Grid: a piano, with its own symbol and its own check. */
const piano: ItemKindDefinition = {
  kind: 'piano',
  group: 'furniture',
  word: 'piano',
  about: 'An upright piano: its back against the wall, its keys at its front.',
  symbol: (p) => ({ rings: [p.box(-0.5, -0.5, 0.5, 0.5)], lines: [[p.point(-0.5, 0.2), p.point(0.5, 0.2)]] }),
  check: (item) => (item.height > 1.2 ? [{ code: 'item/piano-tall', severity: 'warning', message: `Piano "${item.id}" is a tall upright.` }] : []),
}

const placedPiano: Item = { id: 'p1', kind: 'piano', at: [2, 6], size: [1.5, 0.6], height: 1.3 }

let unregister: (() => void) | null = null
afterEach(() => {
  unregister?.()
  unregister = null
})

/** DXF group-code pairs, as [code, value]. */
function pairs(dxf: string): [string, string][] {
  const lines = dxf.split('\r\n')
  const out: [string, string][] = []
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([lines[i]!.trim(), lines[i + 1]!])
  return out
}

/** The block each INSERT of model space names. */
function inserts(dxf: string): string[] {
  const p = pairs(dxf)
  const names: string[] = []
  for (let i = 0; i < p.length; i++) {
    if (p[i]![0] !== '0' || p[i]![1] !== 'INSERT') continue
    for (let j = i + 1; j < p.length && p[j]![0] !== '0'; j++) if (p[j]![0] === '2') names.push(p[j]![1])
  }
  return names
}

describe('the kinds registry', () => {
  it('holds Grid\'s own kinds, fixtures first, in ITEM_KINDS order', () => {
    expect(ITEM_KIND_DEFINITIONS.map((d) => d.kind)).toEqual([...ITEM_KINDS])
    expect(itemKinds('fixture')).toEqual(['toilet', 'basin', 'shower', 'bath', 'kitchen-run'])
    expect(itemKinds('furniture')).toEqual(['bed', 'table', 'chair', 'sofa', 'storage', 'armchair', 'stool', 'desk', 'rug', 'plant'])
    expect(takesFloor('desk')).toBe(false)
    expect(liesUnderfoot('rug')).toBe(true)
    expect(ITEM_KINDS.filter(liesUnderfoot)).toEqual(['rug'])
    expect(takesFloor('bath')).toBe(true)
    expect(takesFloor('bed')).toBe(false)
  })

  it('draws every one of Grid\'s kinds inside its footprint', () => {
    for (const kind of ITEM_KINDS) {
      const item: Item = { id: kind, kind, at: [3, 4], size: [1.2, 0.8], height: 0.8, turn: 30 }
      const symbol = itemSymbol(item)!
      const foot = itemFootprint(item)
      const xs = foot.map((p) => p.x)
      const ys = foot.map((p) => p.y)
      for (const p of [...symbol.rings.flat(), ...symbol.lines.flat()]) {
        expect(p.x, kind).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9)
        expect(p.x, kind).toBeLessThanOrEqual(Math.max(...xs) + 1e-9)
        expect(p.y, kind).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9)
        expect(p.y, kind).toBeLessThanOrEqual(Math.max(...ys) + 1e-9)
      }
    }
  })

  it('raises every one of Grid\'s kinds in 3D inside its footprint, from its floor to no higher than its height (CNT-42)', () => {
    for (const kind of ITEM_KINDS) {
      const item: Item = { id: kind, kind, at: [3, 4], size: [1.2, 0.8], height: 0.8, turn: 30 }
      const blocks = itemSolid(item)
      expect(blocks.length, kind).toBeGreaterThan(0)
      const foot = itemFootprint(item)
      const xs = foot.map((p) => p.x)
      const ys = foot.map((p) => p.y)
      for (const block of blocks) {
        expect(block.bottom, kind).toBeGreaterThanOrEqual(0)
        expect(block.top, kind).toBeLessThanOrEqual(item.height + 1e-12)
        expect(block.top, kind).toBeGreaterThan(block.bottom)
        // Counter-clockwise, so the faces of its solid point out.
        const area = block.outline.reduce((sum, p, i) => { const q = block.outline[(i + 1) % block.outline.length]!; return sum + p.x * q.y - q.x * p.y }, 0)
        expect(area, kind).toBeGreaterThan(0)
        for (const p of block.outline) {
          expect(p.x, kind).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9)
          expect(p.x, kind).toBeLessThanOrEqual(Math.max(...xs) + 1e-9)
          expect(p.y, kind).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9)
          expect(p.y, kind).toBeLessThanOrEqual(Math.max(...ys) + 1e-9)
        }
      }
      expect(Math.max(...blocks.map((b) => b.top)), kind).toBeGreaterThan(0)
    }
    // A kind that says nothing of its solid is its footprint, from the floor to its height.
    expect(itemSolid({ id: 'w', kind: 'storage', at: [1, 1], size: [1, 0.6], height: 2 })).toEqual([{ outline: itemFootprint({ id: 'w', kind: 'storage', at: [1, 1], size: [1, 0.6], height: 2 }), bottom: 0, top: 2 }])
    expect(itemSolid({ id: 'x', kind: 'piano', at: [1, 1], size: [1, 0.6], height: 2 })).toEqual([])
  })

  it('takes a new kind in one call, and it reaches the drawing, the DXF, the IFC and the checks', () => {
    // Before: a kind Grid does not hold is left out with one note.
    expect(validatePlan(withItems([placedPiano])).issues.map((i) => i.code)).toEqual(['item/unknown-kind'])
    expect(buildFloorPlan(withItems([placedPiano])).items).toEqual([])

    unregister = registerItemKind(piano)
    expect(isItemKind('piano')).toBe(true)
    expect(itemKinds('furniture').at(-1)).toBe('piano')
    const plan = withItems([placedPiano])

    // Drawing: its own symbol, labelled by its word, in its room.
    const [drawn] = buildFloorPlan(plan).items
    expect(drawn).toMatchObject({ id: 'p1', kind: 'piano', label: 'piano' })
    expect(drawn!.rings).toHaveLength(1)
    expect(drawn!.lines).toHaveLength(1)
    expect(drawn!.room).not.toBeNull()

    // Export: a block of its own in the DXF, inserted once; an IfcFurnishingElement of its kind.
    const dxf = toDxf(buildFloorPlan(plan))
    expect(inserts(dxf)).toContain('GRID-PIANO-1500x600')
    const ifc = toIfc(plan)
    expect(ifc.split('\n').filter((line) => line.includes('=IFCFURNISHINGELEMENT(') && line.includes("'piano'"))).toHaveLength(1)

    // Checks: its own, in its own words, and Grid's on every item (it runs into no wall here).
    const issues = validatePlan(plan).issues
    expect(issues.map((i) => [i.code, i.message])).toEqual([['item/piano-tall', 'Piano "p1" is a tall upright.']])
    const into = validatePlan(withItems([{ ...placedPiano, at: [0.2, 6] }])).issues.map((i) => i.code)
    expect(into).toContain('item/into-wall')

    // Measures: furniture takes no free floor.
    const index = indexPlan(plan)
    expect(itemFloorTaken(plan.items!, roomShapes(index)).size).toBe(0)
  })

  it('refuses a kind it holds already, or one that is not a plain id, and gives Grid\'s own back', () => {
    expect(() => registerItemKind({ ...piano, kind: 'bed' })).toThrow(ItemKindRefused)
    expect(() => registerItemKind({ ...piano, kind: 'Grand Piano' })).toThrow(ItemKindRefused)
    unregister = registerItemKind(piano)
    expect(() => registerItemKind(piano)).toThrow(ItemKindRefused)
    unregister()
    unregister = null
    expect(isItemKind('piano')).toBe(false)
    expect(isItemKind('bed')).toBe(true)
  })
})

describe('the DXF', () => {
  it('writes each door and each fixture as a block, one per kind and size, inserted where each stands', () => {
    const items: Item[] = [
      { id: 'bed', kind: 'bed', at: [2, 6], size: [1.4, 2], height: 0.5 },
      { id: 'wc1', kind: 'toilet', at: [9.575, 5], size: [0.4, 0.65], height: 0.8, turn: 90 },
      { id: 'wc2', kind: 'toilet', at: [9.575, 6], size: [0.4, 0.65], height: 0.8, turn: 90 },
      { id: 't1', kind: 'table', at: [5, 5], size: [0.45, 0.4], height: 0.55, library: 'side-table' },
    ]
    const plan = withItems(items)
    const dxf = toDxf(buildFloorPlan(plan))
    const used = inserts(dxf)
    expect(used.filter((name) => name === 'GRID-TOILET-400x650')).toHaveLength(2)
    expect(used).toContain('GRID-BED-1400x2000')
    expect(used).toContain('GRID-SIDE-TABLE-450x400')
    // Every door of the plan is a block insert too.
    const doors = plan.openings.filter((o) => o.type === 'door').length
    expect(used.filter((name) => name.startsWith('GRID-DOOR-'))).toHaveLength(doors)
    // A fixture's symbol is no longer loose lines in model space: each block is defined once.
    const defined = pairs(dxf).filter(([code, value], i, all) => code === '2' && value === 'GRID-TOILET-400x650' && all[i - 1]?.[1] !== 'INSERT')
    expect(defined.length).toBeGreaterThan(0)
  })

  it('turns an insert as the plan turns the item, its block drawn unturned about its middle', () => {
    const plan = withItems([{ id: 'wc', kind: 'toilet', at: [9.575, 5], size: [0.4, 0.65], height: 0.8, turn: 90 }])
    const p = pairs(toDxf(buildFloorPlan(plan)))
    const at = p.findIndex(([code, value], i) => code === '2' && value === 'GRID-TOILET-400x650' && p.slice(Math.max(0, i - 12), i).some(([c, v]) => c === '0' && v === 'INSERT'))
    expect(at).toBeGreaterThan(0)
    const after = p.slice(at, at + 8)
    expect(Number(after.find(([code]) => code === '10')?.[1])).toBe(9.575)
    expect(Number(after.find(([code]) => code === '50')?.[1])).toBe(90)
  })
})
