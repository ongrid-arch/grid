/**
 * CNT-20 (C30): the library a plan places from by name. An item that names an entry takes its
 * size from it, every time, and is written back as it was stated; the plan's own entry wins over
 * Grid's; Grid's typical rooms hold together; and the checks say when items stand in each other
 * or in the clear floor one keeps.
 */
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema, parseFloorPlan, statedItem, type Item } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { flat } from '../../test-support/plans'
import { buildFloorPlan } from '../../geometry/floorplan'
import { validatePlan } from '../../geometry/validate'
import { itemClearanceZone, itemFootprint, convexPenetration } from '../../geometry/items'
import { isItemKind } from '../../geometry/itemKinds'
import { BUILT_IN_ITEMS, BUILT_IN_ROOMS, BUILT_IN_SOURCE, LibraryFileSchema, libraryFootprint, placeFromLibrary, planLibrary } from '../index'

const bed = { id: 'b1', library: 'double-bed', at: [2, 3] }

describe('an item placed by name', () => {
  it('takes its kind, size, height, clear floor and label from Grid\'s entry, and says so', () => {
    const plan = parseFloorPlan({ walls: [], rooms: [], openings: [], items: [bed] })
    expect(plan.items![0]).toEqual({ id: 'b1', library: 'double-bed', at: [2, 3], kind: 'bed', size: [1.4, 2], height: 0.5, clearance: 0.6, label: 'Double bed', fromLibrary: ['kind', 'size', 'height', 'clearance', 'label'] })
    // Read part by part, as the command reads a file, it is the same.
    const read = readPlanParts({ walls: [], rooms: [], openings: [], items: [bed] })
    expect(read.plan?.items?.[0]).toEqual(plan.items![0])
  })

  it('keeps what it states itself, and is written back as stated', () => {
    const plan = parseFloorPlan({ items: [{ ...bed, height: 0.45, label: 'Our bed' }] })
    const item = plan.items![0]!
    expect(item.height).toBe(0.45)
    expect(item.label).toBe('Our bed')
    expect(item.fromLibrary).toEqual(['kind', 'size', 'clearance'])
    expect(statedItem(item)).toEqual({ id: 'b1', library: 'double-bed', at: [2, 3], height: 0.45, label: 'Our bed' })
  })

  it('takes the plan\'s own entry over Grid\'s of the same name', () => {
    const own = { name: 'double-bed', kind: 'bed', size: [1.35, 1.9], height: 0.55, source: 'Our standard, sheet 2' }
    const plan = parseFloorPlan({ items: [bed], library: [own] })
    expect(plan.items![0]).toMatchObject({ kind: 'bed', size: [1.35, 1.9], height: 0.55 })
    expect(plan.items![0]!.clearance).toBeUndefined()
  })

  it('reads a name no library holds as nothing filled: an item that states its size is drawn and named', () => {
    const plan = parseFloorPlan({ ...flat(), items: [{ id: 'b1', library: 'doble-bed', kind: 'bed', at: [2, 6], size: [1.4, 2], height: 0.5 }] })
    const issues = validatePlan(plan).issues.filter((i) => i.entity === 'item')
    expect(issues.map((i) => i.code)).toEqual(['item/unknown-library'])
    expect(issues[0]!.message).toContain('Did you mean "double-bed"?')
    expect(buildFloorPlan(plan).items.map((i) => i.id)).toEqual(['b1'])
    // One that states nothing else is not a whole item: the schema refuses it, and the reading leaves it out.
    expect(FloorPlanSchema.safeParse({ items: [{ id: 'b1', library: 'doble-bed', at: [2, 3] }] }).success).toBe(false)
  })

  it('keeps a plan with no library free of the key, and a file\'s own fromLibrary is not read', () => {
    expect('library' in parseFloorPlan({ walls: [] })).toBe(false)
    const plan = parseFloorPlan({ items: [{ id: 'wc', kind: 'toilet', at: [1, 1], size: [0.4, 0.65], height: 0.8, fromLibrary: ['kind'] }] })
    expect(plan.items![0]!.fromLibrary).toBeUndefined()
  })
})

describe('Grid\'s built-in library', () => {
  it('is Grid\'s own sizes, each of a kind Grid holds and each saying so', () => {
    expect(new Set(BUILT_IN_ITEMS.map((e) => e.name)).size).toBe(BUILT_IN_ITEMS.length)
    for (const entry of BUILT_IN_ITEMS) {
      expect(isItemKind(entry.kind), entry.name).toBe(true)
      expect(entry.source, entry.name).toBe(BUILT_IN_SOURCE)
    }
  })

  it('keeps its sizes: a released name never changes size (a new size is a new name)', () => {
    const sizes = Object.fromEntries(BUILT_IN_ITEMS.map((e) => [e.name, [e.kind, ...e.size, e.height, e.clearance ?? 0]]))
    expect(sizes).toEqual({
      wc: ['toilet', 0.4, 0.65, 0.8, 0.6],
      'wc-compact': ['toilet', 0.36, 0.6, 0.8, 0.6],
      basin: ['basin', 0.55, 0.45, 0.85, 0.6],
      'basin-small': ['basin', 0.45, 0.35, 0.85, 0.6],
      'shower-800': ['shower', 0.8, 0.8, 2, 0.6],
      'shower-900': ['shower', 0.9, 0.9, 2, 0.6],
      'shower-1200': ['shower', 1.2, 0.8, 2, 0.6],
      bath: ['bath', 1.7, 0.7, 0.55, 0.7],
      'bath-1500': ['bath', 1.5, 0.7, 0.55, 0.7],
      'kitchen-run-2400': ['kitchen-run', 2.4, 0.6, 0.9, 1.2],
      'kitchen-run-3000': ['kitchen-run', 3, 0.6, 0.9, 1.2],
      'single-bed': ['bed', 0.9, 2, 0.5, 0.6],
      'double-bed': ['bed', 1.4, 2, 0.5, 0.6],
      'large-double-bed': ['bed', 1.6, 2, 0.5, 0.6],
      'king-bed': ['bed', 1.8, 2, 0.5, 0.6],
      'side-table': ['table', 0.45, 0.4, 0.55, 0],
      'bedside-table': ['table', 0.4, 0.35, 0.5, 0],
      'coffee-table': ['table', 1.1, 0.6, 0.4, 0],
      'dining-table-4': ['table', 1.2, 0.8, 0.75, 0],
      'dining-table-6': ['table', 1.8, 0.9, 0.75, 0],
      chair: ['chair', 0.45, 0.5, 0.9, 0],
      stool: ['stool', 0.35, 0.35, 0.45, 0],
      'bar-stool': ['stool', 0.4, 0.4, 0.75, 0],
      armchair: ['armchair', 0.8, 0.85, 0.85, 0],
      'sofa-2': ['sofa', 1.6, 0.9, 0.85, 0],
      'sofa-3': ['sofa', 2.1, 0.9, 0.85, 0],
      wardrobe: ['storage', 1, 0.6, 2, 0.6],
      'chest-of-drawers': ['storage', 0.8, 0.45, 0.8, 0.5],
      'tv-unit': ['storage', 1.6, 0.45, 0.5, 0.5],
      desk: ['desk', 1.2, 0.6, 0.75, 0.75],
      'desk-1400': ['desk', 1.4, 0.7, 0.75, 0.75],
      rug: ['rug', 2, 1.4, 0.01, 0],
      'rug-large': ['rug', 3, 2, 0.01, 0],
      plant: ['plant', 0.5, 0.5, 1.2, 0],
      'wc-child': ['toilet', 0.32, 0.5, 0.35, 0.5],
      'basin-low': ['basin', 0.45, 0.35, 0.55, 0.5],
      cot: ['bed', 0.66, 1.26, 0.95, 0.5],
      'nap-cot': ['bed', 0.6, 1.3, 0.15, 0.4],
      'changing-table': ['table', 0.9, 0.7, 0.9, 0.7],
      'coat-rail': ['storage', 1.2, 0.4, 1.7, 0.6],
      'coat-rail-low': ['storage', 1.2, 0.3, 1.1, 0.6],
      // CNT-47: equipment.
      rack: ['rack', 0.6, 1.2, 2, 1],
      generator: ['generator', 3, 1.2, 2, 1],
      pump: ['pump', 0.6, 0.6, 0.8, 0.6],
      tank: ['tank', 1.5, 1.5, 2, 0],
      seat: ['seat', 0.5, 0.6, 0.9, 0],
      pew: ['pew', 3, 0.6, 0.9, 0],
      altar: ['altar', 2, 1, 1, 1],
      'fume-cupboard': ['fume-cupboard', 1.5, 0.9, 2.4, 1],
      'lab-bench': ['lab-bench', 3, 0.75, 0.9, 1],
      'safety-shower': ['safety-shower', 1, 1, 2.3, 0],
      kennel: ['kennel', 0.9, 0.9, 0.9, 0],
      'exam-table': ['exam-table', 1.2, 0.6, 0.9, 0.8],
      'clinical-sink': ['clinical-sink', 0.9, 0.6, 0.9, 0.6],
      // CNT-52: the points.
      extinguisher: ['extinguisher', 0.4, 0.4, 1, 0],
      aed: ['aed', 0.4, 0.4, 1.2, 0],
      'call-point': ['call-point', 0.3, 0.3, 1.4, 0],
      'first-aid': ['first-aid', 0.4, 0.4, 1.4, 0],
      sensor: ['sensor', 0.3, 0.3, 2.4, 0],
      'desk-point': ['desk-point', 0.4, 0.4, 0.75, 0],
      spawn: ['spawn', 0.6, 0.6, 0.05, 0],
      camera: ['camera', 0.3, 0.3, 2.6, 0],
      'you-are-here': ['you-are-here', 0.5, 0.5, 1.6, 0],
      'hose-reel': ['hose-reel', 0.5, 0.5, 1.4, 0],
      'fire-door': ['fire-door', 0.4, 0.4, 2.1, 0],
      exit: ['exit', 0.4, 0.4, 2.2, 0],
      refuge: ['refuge', 0.5, 0.5, 1.2, 0],
      'assembly-point': ['assembly-point', 0.6, 0.6, 2, 0],
    })
  })

  it('holds the starter furniture, each counted by its own kind (CNT-42)', () => {
    const kindOf = (name: string): string | undefined => BUILT_IN_ITEMS.find((e) => e.name === name)?.kind
    expect(['sofa-2', 'armchair', 'coffee-table', 'dining-table-4', 'chair', 'stool', 'single-bed', 'double-bed', 'king-bed', 'bedside-table', 'wardrobe', 'desk', 'rug', 'tv-unit', 'plant'].map(kindOf)).toEqual(
      ['sofa', 'armchair', 'table', 'table', 'chair', 'stool', 'bed', 'bed', 'bed', 'table', 'storage', 'desk', 'rug', 'storage', 'plant']
    )
  })

  it('sets out each typical room inside its size, every item clear of the others and of the clear floor each keeps', () => {
    const library = planLibrary({})
    for (const room of BUILT_IN_ROOMS) {
      const placed = placeFromLibrary(library, { name: room.name, at: [0, 0] }, new Set())
      const plan = parseFloorPlan({ items: placed.items })
      const items = plan.items!
      expect(items, room.name).toHaveLength(room.items.length)
      const inside = (p: { x: number; y: number }): boolean => p.x >= -1e-9 && p.y >= -1e-9 && p.x <= room.size[0] + 1e-9 && p.y <= room.size[1] + 1e-9
      for (const item of items) {
        expect(itemFootprint(item).every(inside), `${room.name}: ${item.id}`).toBe(true)
        expect(itemClearanceZone(item).every(inside), `${room.name}: ${item.id}'s clear floor`).toBe(true)
        for (const other of items) {
          if (other === item) continue
          expect(convexPenetration(itemFootprint(item), itemFootprint(other)), `${room.name}: ${item.id} in ${other.id}`).toBeLessThan(1e-6)
          if (item.clearance) expect(convexPenetration(itemClearanceZone(item), itemFootprint(other)), `${room.name}: ${other.id} in ${item.id}'s clear floor`).toBeLessThan(1e-6)
        }
      }
    }
  })

  it('places a typical room turned about its back-left corner, each item turned with it', () => {
    const library = planLibrary({})
    const placed = placeFromLibrary(library, { name: 'cloakroom', at: [10, 5], turn: 90 }, new Set(['wc']))
    expect(placed.items).toEqual([
      { id: 'wc-2', library: 'wc', at: [9.675, 5.4], turn: 90 },
      { id: 'basin-small', library: 'basin-small', at: [8.8, 5.825], turn: 180 },
    ])
  })

  it('holds child-size fixtures and furniture, each of a kind Grid holds (CNT-43)', () => {
    const library = planLibrary({})
    for (const name of ['wc-child', 'basin-low', 'cot', 'nap-cot', 'changing-table', 'coat-rail', 'coat-rail-low']) expect(library.items.get(name)?.from, name).toBe('grid')
  })

  it('places an item at its own size, height and label, the entry filling the rest (CNT-43)', () => {
    const library = planLibrary({})
    const placed = placeFromLibrary(library, { name: 'desk', at: [2, 2], own: { size: [1.4, 0.7], label: 'Hot desk' } }, new Set())
    expect(placed.items).toEqual([{ id: 'desk', library: 'desk', at: [2, 2], size: [1.4, 0.7], label: 'Hot desk' }])
    const item = parseFloorPlan({ items: placed.items }).items![0]!
    expect([item.size, item.height, item.clearance, item.label, item.fromLibrary]).toEqual([[1.4, 0.7], 0.75, 0.75, 'Hot desk', ['kind', 'height', 'clearance']])
  })

  it('places a thing the library has no entry for by its kind, given its size and height (CNT-43)', () => {
    const library = planLibrary({})
    const placed = placeFromLibrary(library, { name: 'storage', at: [1, 1], id: 'kennel-1', own: { size: [1.2, 0.9], height: 0.9, label: 'Kennel' } }, new Set())
    expect(placed.kind).toBe('storage')
    expect(placed.items).toEqual([{ id: 'kennel-1', kind: 'storage', at: [1, 1], size: [1.2, 0.9], height: 0.9, label: 'Kennel' }])
    expect(parseFloorPlan({ items: placed.items }).items![0]!.size).toEqual([1.2, 0.9])
    expect(() => placeFromLibrary(library, { name: 'storage', at: [1, 1], own: { size: [1.2, 0.9] } }, new Set())).toThrow('give its width, depth and height')
  })

  it('refuses own figures for a typical room, which is many items (CNT-43)', () => {
    expect(() => placeFromLibrary(planLibrary({}), { name: 'bathroom', at: [0, 0], own: { height: 1 } }, new Set())).toThrow('place its items one by one')
  })

  it('gives the floor an entry needs: an item with its clear floor in front, a typical room its size', () => {
    const library = planLibrary({})
    expect(libraryFootprint(library, 'double-bed')).toEqual({ width: 1.4, depth: 2.6, what: 'item' })
    expect(libraryFootprint(library, 'double-bedroom')).toEqual({ width: 3.2, depth: 3.4, what: 'room' })
    expect(libraryFootprint(library, 'piano')).toBeNull()
  })
})

describe('an office\'s own library', () => {
  it('is looked in after the plan and before Grid, and an entry placed from it is copied into the plan', () => {
    const office = LibraryFileSchema.parse({
      version: '1',
      items: [{ name: 'wc', kind: 'toilet', size: [0.38, 0.7], height: 0.8, clearance: 0.75, source: 'Office sheet 4' }],
      rooms: [{ name: 'our-wc', size: [1, 1.7], items: [{ library: 'wc', at: [0.4, 0.35] }] }],
    })
    const library = planLibrary({}, [{ file: 'library/office.json', items: office.items ?? [], rooms: office.rooms ?? [] }])
    expect(library.items.get('wc')).toMatchObject({ from: 'office', file: 'library/office.json' })
    expect(library.items.get('bath')).toMatchObject({ from: 'grid' })
    const placed = placeFromLibrary(library, { name: 'our-wc', at: [0, 0] }, new Set())
    expect(placed.copy.map((e) => e.name)).toEqual(['wc'])
    // With the entry copied in, the plan reads the office's size without the folder.
    const plan = parseFloorPlan({ items: placed.items, library: placed.copy })
    expect(plan.items![0]!.size).toEqual([0.38, 0.7])
  })

  it('refuses a file that holds a field a library file does not have', () => {
    expect(LibraryFileSchema.safeParse({ version: '1', items: [], sofas: [] }).success).toBe(false)
  })
})

describe('items that stand in each other', () => {
  const at = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind: 'table', at: [x, y], size: [1, 0.6], height: 0.75, ...extra })

  it('names two items that stand in each other, and not two that only touch', () => {
    const codes = (items: Item[]): string[] => validatePlan({ ...flat(), items }).issues.filter((i) => i.entity === 'item').map((i) => i.code)
    expect(codes([at('a', 2, 6), at('b', 2.5, 6)])).toEqual(['item/overlap'])
    expect(codes([at('a', 2, 6), at('b', 3, 6)])).toEqual([])
  })

  it('names what stands in the clear floor an item keeps in front of it', () => {
    const issues = validatePlan({ ...flat(), items: [at('bed', 2, 5, { kind: 'bed', clearance: 0.6 }), at('t', 2, 5.8)] }).issues.filter((i) => i.entity === 'item')
    expect(issues.map((i) => [i.code, i.id])).toEqual([['item/clearance-blocked', 'bed']])
    expect(issues[0]!.message).toBe('Bed "bed" keeps 0.60 m clear in front of it, and table "t" stands in that floor.')
  })
})
