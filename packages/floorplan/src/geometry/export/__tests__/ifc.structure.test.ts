/**
 * HND-2: every IFC file Grid writes for the repository's plans, checked as a whole.
 *
 * The lab checks its IFC files with IfcOpenShell (`K/tools/check_ifc.py`), which is not in this
 * repository and whose licence keeps it out of it. This is the check that stands in for it here:
 * each file is read with the strict STEP reader, and then every reference must point at an
 * entity that exists, every relationship must join entities of the kinds IFC allows there, and
 * every room, wall, slab, door, window and opening must carry what HND-2 writes on it: a number,
 * a use and an area with its rule, base quantities, and a wall type with its material; and every
 * flat the plan lists is a zone that groups its spaces (CNT-4).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../plan'
import { parseFloorPlan } from '../../../types/floorplan'
import { planAreaFigures, MEASURES } from '../../areas'
import { roomNumbers, shownRoomNumber } from '../../roomNumbers'
import { limit } from '../../tolerances'
import { toIfc } from '../ifc'
import { ballroomWithStage, duplexHouse, edit, flat, genkanFlat, stairHouse } from '../../../test-support/plans'
import { compileRoomsText } from '../../../rooms/compile'
import { planFlats } from '../../flats'
import { entity, num, nums, ofType, parseDoc, ref, refs, str, walk, type Doc, type Entity, type Value } from './step-reader'

const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../fixtures')
const CLI_FIXTURES = resolve(__dirname, '../../../../../cli/fixtures')

const jsonIn = (dir: string, suffix: string): [string, string][] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => [`${dir === CLI_FIXTURES ? 'cli' : 'floorplan'}/${name}`, join(dir, name)])

const read = (path: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(path, 'utf8')))

/** The flat with a WC in it, so fixtures are in the check too. */
function flatWithFixture(): FloorPlan {
  return { ...flat(), items: [{ id: 'wc', kind: 'toilet', at: [2, 2], size: [0.4, 0.7], height: 0.8 }] }
}

/** The bench's two-bed flat drawn at survey coordinates, far from the origin (lab MS-12). */
const FAR: readonly [number, number] = [612345.6, 4123456.7]
function farFlat(): FloorPlan {
  const plan = read(join(FLOORPLAN_FIXTURES, 'two-bed-flat.json'))
  const move = ([x, y]: readonly [number, number]): [number, number] => [x + FAR[0], y + FAR[1]]
  return { ...plan, walls: plan.walls.map((wall) => ({ ...wall, start: move(wall.start), end: move(wall.end) })) }
}

/**
 * LVL-4's parts no fixture states: a parapet on the roof, a ceiling with a lowered zone, a room
 * set below its storey (its own slab, lower down) and a void opening the slab.
 */
function shellFlat(): FloorPlan {
  return edit(flat(), (p) => {
    p.floors = [{ id: 'ground', name: 'Ground floor', level: 0, parapet: 1.1, slab: 0.3 }]
    const [hall, kitchen, bedroom, bathroom] = p.rooms
    hall!.void = true
    kitchen!.ceiling = { lowered: [{ name: 'Bulkhead', points: [[4, 3], [10, 3], [10, 4], [4, 4]], height: 2.3 }] }
    bedroom!.ceiling = {}
    bathroom!.floorOffset = -0.1
  })
}

const PLANS: [string, () => FloorPlan][] = [
  ...jsonIn(FLOORPLAN_FIXTURES, '.json'),
  ...jsonIn(CLI_FIXTURES, '.json'),
  ...jsonIn(join(FLOORPLAN_FIXTURES, 'rooms'), '.plan.json').map(([name, path]): [string, string] => [name.replace('floorplan/', 'floorplan/rooms/'), path])
].map(([name, path]): [string, () => FloorPlan] => [name, () => read(path)])
PLANS.push(
  ['test-support stairHouse', stairHouse],
  ['test-support genkanFlat', () => genkanFlat()],
  ['test-support ballroomWithStage', () => ballroomWithStage()],
  ['test-support flat with a fixture', flatWithFixture],
  ['two-bed flat at survey coordinates', farFlat],
  ['test-support flat with a parapet, ceilings, a void and a sunken room', shellFlat],
  // CNT-4: flats, placed from flat types in rooms text, and a duplex on two floors.
  ['floorplan/rooms/four-flats.rooms, with its flat types', () => parseFloorPlan(compileRoomsText(readFileSync(join(FLOORPLAN_FIXTURES, 'rooms', 'four-flats.rooms'), 'utf8')).plan)],
  ['test-support duplex house', duplexHouse]
)

const OPTIONS = { projectId: 'structure', projectName: 'Structure', timestamp: new Date('2026-11-22T00:00:00Z') } as const

// ---------------------------------------------------------------------------
// What may stand where
// ---------------------------------------------------------------------------

/** IfcRoot's subtypes Grid writes that are objects (they can hold properties, types and materials). */
// CNT-55: and a sanitary fixture or a towel radiator, a flow terminal.
const ELEMENTS = new Set(['IFCWALLSTANDARDCASE', 'IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 'IFCROOF', 'IFCCOVERING', 'IFCFURNISHINGELEMENT', 'IFCFLOWTERMINAL', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCOPENINGELEMENT'])
const SPATIAL = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'])
const TYPES = new Set(['IFCWALLTYPE', 'IFCDOORSTYLE', 'IFCWINDOWSTYLE', 'IFCSANITARYTERMINALTYPE', 'IFCSPACEHEATERTYPE'])
const RELATIONS = new Set([
  'IFCRELAGGREGATES',
  'IFCRELCONTAINEDINSPATIALSTRUCTURE',
  'IFCRELDEFINESBYPROPERTIES',
  'IFCRELDEFINESBYTYPE',
  'IFCRELASSOCIATESMATERIAL',
  'IFCRELVOIDSELEMENT',
  'IFCRELFILLSELEMENT',
  'IFCRELCOVERSSPACES',
  'IFCRELASSIGNSTOGROUP'
])
const PROPERTY_SETS = new Set(['IFCPROPERTYSET', 'IFCELEMENTQUANTITY'])
/** CNT-4: a flat is a zone, a group of spaces. */
const GROUPS = new Set(['IFCZONE'])
const QUANTITIES = new Set(['IFCQUANTITYLENGTH', 'IFCQUANTITYAREA', 'IFCQUANTITYVOLUME'])

/** Which parts each kind of whole may aggregate. */
const AGGREGATES: Readonly<Record<string, ReadonlySet<string>>> = {
  IFCPROJECT: new Set(['IFCSITE']),
  IFCSITE: new Set(['IFCBUILDING']),
  IFCBUILDING: new Set(['IFCBUILDINGSTOREY']),
  IFCBUILDINGSTOREY: new Set(['IFCSPACE']),
  IFCSTAIR: new Set(['IFCSTAIRFLIGHT', 'IFCSLAB']),
  // LVL-4: a flat roof is its slab.
  IFCROOF: new Set(['IFCSLAB'])
}
/** What a storey contains: LVL-4's roof, its parapet (an IfcWall) and the ceilings among them. */
const CONTAINED = new Set(['IFCWALLSTANDARDCASE', 'IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 'IFCROOF', 'IFCCOVERING', 'IFCFURNISHINGELEMENT', 'IFCFLOWTERMINAL', 'IFCSTAIR'])
const TYPED: Readonly<Record<string, string>> = { IFCWALLTYPE: 'IFCWALLSTANDARDCASE', IFCDOORSTYLE: 'IFCDOOR', IFCWINDOWSTYLE: 'IFCWINDOW', IFCSANITARYTERMINALTYPE: 'IFCFLOWTERMINAL', IFCSPACEHEATERTYPE: 'IFCFLOWTERMINAL' }

// ---------------------------------------------------------------------------
// Reading what an object carries
// ---------------------------------------------------------------------------

interface Carried {
  /** Property and quantity sets by name, each with its values by name. */
  readonly sets: Map<string, Map<string, Value>>
  readonly types: Entity[]
  readonly materials: Entity[]
  readonly containers: Entity[]
  readonly aggregatedBy: Entity[]
}

function carriedBy(doc: Doc): Map<number, Carried> {
  const out = new Map<number, Carried>()
  const of = (id: number): Carried => {
    let found = out.get(id)
    if (!found) {
      found = { sets: new Map(), types: [], materials: [], containers: [], aggregatedBy: [] }
      out.set(id, found)
    }
    return found
  }
  for (const rel of ofType(doc, 'IFCRELDEFINESBYPROPERTIES')) {
    const set = entity(doc, ref(rel.args[5]))
    const values = new Map<string, Value>()
    for (const id of refs(set.args[set.type === 'IFCELEMENTQUANTITY' ? 5 : 4])) {
      const item = entity(doc, id)
      // A property's value is its third attribute, a quantity's its fourth.
      values.set(str(item.args[0]), item.args[item.type === 'IFCPROPERTYSINGLEVALUE' ? 2 : 3]!)
    }
    for (const id of refs(rel.args[4])) {
      const name = str(set.args[2])
      expect(of(id).sets.has(name), `#${id} carries ${name} twice`).toBe(false)
      of(id).sets.set(name, values)
    }
  }
  for (const rel of ofType(doc, 'IFCRELDEFINESBYTYPE')) for (const id of refs(rel.args[4])) of(id).types.push(entity(doc, ref(rel.args[5])))
  for (const rel of ofType(doc, 'IFCRELASSOCIATESMATERIAL')) for (const id of refs(rel.args[4])) of(id).materials.push(entity(doc, ref(rel.args[5])))
  for (const rel of ofType(doc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')) for (const id of refs(rel.args[4])) of(id).containers.push(entity(doc, ref(rel.args[5])))
  for (const rel of ofType(doc, 'IFCRELAGGREGATES')) for (const id of refs(rel.args[5])) of(id).aggregatedBy.push(entity(doc, ref(rel.args[4])))
  return out
}

const typedNumber = (value: Value | undefined): number => {
  if (value?.t === 'num') return value.v
  if (value?.t === 'typed' && value.v.t === 'num') return value.v.v
  throw new Error(`expected a number, got ${JSON.stringify(value)}`)
}
const enumOf = (value: Value | undefined): string => {
  if (value?.t === 'enum') return value.v
  throw new Error(`expected an enumeration, got ${JSON.stringify(value)}`)
}
const typedText = (value: Value | undefined): string => {
  if (value?.t === 'typed' && value.v.t === 'str') return value.v.v
  throw new Error(`expected a typed text, got ${JSON.stringify(value)}`)
}

/** Every point the file writes, by id. */
const pointsOf = (doc: Doc): Map<number, number[]> =>
  new Map(ofType(doc, 'IFCCARTESIANPOINT').map((p) => [p.id, (p.args[0]?.t === 'list' ? p.args[0].v : []).map(typedNumber)] as const))

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Everything the check asserts about one file. Returns how many of each it looked at. `measured`
 * is the plan ARE-9's figures are read from: the plan itself, except for the flat at survey
 * coordinates, whose figures are the same flat's at the origin: out there ARE-9's areas are off
 * by about 0.0003 m² (the arithmetic runs out of digits), and the file, written near the origin,
 * is not.
 */
function checkFile(plan: FloorPlan, text: string, measured: FloorPlan = plan): Record<string, number> {
  const doc = parseDoc(text)

  // 1. Every reference names an entity the file defines.
  for (const e of doc.order) {
    for (const arg of e.args) {
      for (const v of walk(arg)) {
        if (v.t === 'ref') expect(doc.entities.has(v.v), `#${e.id} ${e.type} names #${v.v}`).toBe(true)
      }
    }
  }

  // 2. Identities are unique.
  const rooted = doc.order.filter((e) => ELEMENTS.has(e.type) || SPATIAL.has(e.type) || TYPES.has(e.type) || RELATIONS.has(e.type) || PROPERTY_SETS.has(e.type) || GROUPS.has(e.type))
  const guids = rooted.map((e) => str(e.args[0]))
  expect(new Set(guids).size, 'unique GlobalIds').toBe(guids.length)
  for (const guid of guids) expect(guid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)

  // 3. Every relationship joins entities of the kinds IFC allows there.
  for (const rel of ofType(doc, 'IFCRELAGGREGATES')) {
    const whole = entity(doc, ref(rel.args[4]))
    const allowed = AGGREGATES[whole.type]
    expect(allowed, `${whole.type} aggregates`).toBeDefined()
    expect(refs(rel.args[5]).length).toBeGreaterThan(0)
    for (const id of refs(rel.args[5])) expect(allowed!.has(entity(doc, id).type), `${whole.type} aggregates ${entity(doc, id).type}`).toBe(true)
  }
  for (const rel of ofType(doc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
    expect(entity(doc, ref(rel.args[5])).type).toBe('IFCBUILDINGSTOREY')
    expect(refs(rel.args[4]).length).toBeGreaterThan(0)
    for (const id of refs(rel.args[4])) expect(CONTAINED.has(entity(doc, id).type), `contained ${entity(doc, id).type}`).toBe(true)
  }
  for (const rel of ofType(doc, 'IFCRELDEFINESBYPROPERTIES')) {
    const set = entity(doc, ref(rel.args[5]))
    expect(PROPERTY_SETS.has(set.type), set.type).toBe(true)
    for (const id of refs(rel.args[4])) {
      const object = entity(doc, id)
      expect(ELEMENTS.has(object.type) || SPATIAL.has(object.type) || GROUPS.has(object.type), `properties on ${object.type}`).toBe(true)
    }
    if (set.type === 'IFCPROPERTYSET') {
      for (const id of refs(set.args[4])) expect(entity(doc, id).type).toBe('IFCPROPERTYSINGLEVALUE')
    } else {
      expect(str(set.args[2])).toMatch(/^Qto_\w+BaseQuantities$/)
      expect(str(set.args[4])).toBe('BaseQuantities')
      for (const id of refs(set.args[5])) {
        const quantity = entity(doc, id)
        expect(QUANTITIES.has(quantity.type), quantity.type).toBe(true)
        const value = typedNumber(quantity.args[3])
        expect(Number.isFinite(value) && value >= 0, `${str(quantity.args[0])} ${value}`).toBe(true)
      }
    }
  }
  for (const rel of ofType(doc, 'IFCRELDEFINESBYTYPE')) {
    const type = entity(doc, ref(rel.args[5]))
    expect(TYPED[type.type], type.type).toBeDefined()
    for (const id of refs(rel.args[4])) expect(entity(doc, id).type).toBe(TYPED[type.type])
  }
  for (const rel of ofType(doc, 'IFCRELASSOCIATESMATERIAL')) {
    const material = entity(doc, ref(rel.args[5]))
    const related = refs(rel.args[4]).map((id) => entity(doc, id).type)
    if (material.type === 'IFCMATERIALLAYERSETUSAGE') expect(new Set(related)).toEqual(new Set(['IFCWALLSTANDARDCASE']))
    else {
      expect(material.type).toBe('IFCMATERIALLAYERSET')
      expect(new Set(related)).toEqual(new Set(['IFCWALLTYPE']))
    }
  }
  for (const rel of ofType(doc, 'IFCRELVOIDSELEMENT')) {
    // A door voids its wall; a stair, lift shaft or void its floor's slab (LVL-4).
    expect(['IFCWALLSTANDARDCASE', 'IFCSLAB']).toContain(entity(doc, ref(rel.args[4])).type)
    expect(entity(doc, ref(rel.args[5])).type).toBe('IFCOPENINGELEMENT')
  }
  for (const rel of ofType(doc, 'IFCRELFILLSELEMENT')) {
    expect(entity(doc, ref(rel.args[4])).type).toBe('IFCOPENINGELEMENT')
    expect(['IFCDOOR', 'IFCWINDOW']).toContain(entity(doc, ref(rel.args[5])).type)
  }
  // CNT-4: a zone groups spaces, and only spaces.
  for (const rel of ofType(doc, 'IFCRELASSIGNSTOGROUP')) {
    expect(entity(doc, ref(rel.args[6])).type).toBe('IFCZONE')
    expect(refs(rel.args[4]).length).toBeGreaterThan(0)
    for (const id of refs(rel.args[4])) expect(entity(doc, id).type).toBe('IFCSPACE')
  }
  for (const rel of ofType(doc, 'IFCRELCOVERSSPACES')) {
    expect(entity(doc, ref(rel.args[4])).type).toBe('IFCSPACE')
    expect(refs(rel.args[5]).length).toBeGreaterThan(0)
    for (const id of refs(rel.args[5])) expect(entity(doc, id).type).toBe('IFCCOVERING')
  }

  // 4. At least one storey, and the chain up to the project.
  const carried = carriedBy(doc)
  const on = (e: Entity): Carried => carried.get(e.id) ?? { sets: new Map(), types: [], materials: [], containers: [], aggregatedBy: [] }
  const storeys = ofType(doc, 'IFCBUILDINGSTOREY')
  expect(storeys.length).toBeGreaterThan(0)
  for (const storey of storeys) expect(on(storey).aggregatedBy.map((e) => e.type)).toEqual(['IFCBUILDING'])

  // 5. Every element stands in exactly one storey.
  for (const e of doc.order.filter((x) => CONTAINED.has(x.type))) {
    const parts = on(e).aggregatedBy
    // A stair's landing is part of its stair, and a roof's slab of its roof, not of a storey.
    if (e.type === 'IFCSLAB' && parts.length > 0) {
      expect(parts).toHaveLength(1)
      expect(['IFCSTAIR', 'IFCROOF']).toContain(parts[0]!.type)
      expect(on(e).containers).toHaveLength(0)
    } else {
      expect(on(e).containers.map((s) => s.type), `${e.type} ${str(e.args[2])}`).toEqual(['IFCBUILDINGSTOREY'])
    }
  }

  // 6. Each space: its number, use and area with the rule, and its base quantities. The number
  //    is the one the room states (CNT-9), as text, else Grid's count.
  const numbers = new Map(roomNumbers(plan).map((n) => [`${n.floor}\u0000${n.id}`, shownRoomNumber(n)] as const))
  const figures = new Map(
    planAreaFigures(measured).floors.flatMap((f) => f.rooms.map((room) => [`${f.floor}\u0000${room.id}`, room] as const))
  )
  const spaces = ofType(doc, 'IFCSPACE')
  for (const space of spaces) {
    const { sets, aggregatedBy } = on(space)
    expect(aggregatedBy.map((e) => e.type)).toEqual(['IFCBUILDINGSTOREY'])
    const grid = sets.get('Grid_Space')
    const qto = sets.get('Qto_SpaceBaseQuantities')
    const common = sets.get('Pset_SpaceCommon')
    expect(grid, str(space.args[7])).toBeDefined()
    expect(qto, str(space.args[7])).toBeDefined()
    expect(common, str(space.args[7])).toBeDefined()
    const id = typedText(grid!.get('Id'))
    const stated = grid!.get('Number')
    const number = stated?.t === 'typed' && stated.v.t === 'str' ? typedText(stated) : String(typedNumber(stated))
    expect(str(space.args[2])).toBe(number)
    expect(typedText(common!.get('Reference'))).toBe(number)
    expect(typedText(grid!.get('Use')).length).toBeGreaterThan(0)
    expect(typedText(grid!.get('AreaMeasure'))).toBe(MEASURES.net.name)
    expect(typedText(grid!.get('AreaRule'))).toBe(MEASURES.net.measures)
    for (const name of ['Height', 'GrossPerimeter', 'GrossFloorArea', 'NetFloorArea', 'GrossVolume']) expect(qto!.has(name), name).toBe(true)
    const area = typedNumber(grid!.get('Area'))
    expect(typedNumber(qto!.get('NetFloorArea'))).toBeCloseTo(area, 9)

    // The number is the room schedule's (ARE-12), and the area is ARE-9's net, room by room.
    const floor = [...numbers.keys()].find((key) => key.endsWith(`\u0000${id}`) && numbers.get(key) === number)
    expect(floor, `room ${id} numbered ${number}`).toBeDefined()
    const figure = figures.get(floor!)
    expect(figure, `ARE-9 figure for ${id}`).toBeDefined()
    expect(area).toBeCloseTo(figure!.area, 6)
  }

  // 7. Every wall: Pset_WallCommon, its base quantities, one layer set usage, and a type that
  //    carries the layer set of that usage.
  const walls = ofType(doc, 'IFCWALLSTANDARDCASE')
  for (const wall of walls) {
    const { sets, materials, types } = on(wall)
    expect(sets.has('Pset_WallCommon')).toBe(true)
    const qto = sets.get('Qto_WallBaseQuantities')
    expect(qto, str(wall.args[2])).toBeDefined()
    for (const name of ['Length', 'Width', 'Height', 'GrossFootprintArea', 'GrossSideArea', 'NetSideArea', 'GrossVolume', 'NetVolume']) expect(qto!.has(name), name).toBe(true)
    expect(typedNumber(qto!.get('NetVolume'))).toBeLessThanOrEqual(typedNumber(qto!.get('GrossVolume')) + 1e-9)
    expect(materials.map((m) => m.type)).toEqual(['IFCMATERIALLAYERSETUSAGE'])
    expect(types.map((t) => t.type)).toEqual(['IFCWALLTYPE'])
    const typeMaterials = on(types[0]!).materials
    expect(typeMaterials.map((m) => m.type)).toEqual(['IFCMATERIALLAYERSET'])
    expect(ref(materials[0]!.args[0])).toBe(typeMaterials[0]!.id)
    // The layer names a material.
    for (const layer of refs(typeMaterials[0]!.args[0])) expect(entity(doc, ref(entity(doc, layer).args[0])).type).toBe('IFCMATERIAL')
  }

  // 8. Every slab, door, window and doorless opening carries its base quantities; a slab Grid
  //    worked out says it is assumed, and every door and window has its type.
  const slabs = ofType(doc, 'IFCSLAB')
  for (const slab of slabs) {
    const { sets, aggregatedBy } = on(slab)
    const qto = sets.get('Qto_SlabBaseQuantities')
    expect(qto, str(slab.args[2])).toBeDefined()
    for (const name of ['Width', 'Perimeter', 'GrossArea', 'GrossVolume']) expect(qto!.has(name), name).toBe(true)
    if (qto!.has('NetArea')) expect(typedNumber(qto!.get('NetArea'))).toBeLessThan(typedNumber(qto!.get('GrossArea')))
    // Every slab but a stair's landing is worked out from the walls (LVL-4), and says so, once.
    const landing = aggregatedBy.some((e) => e.type === 'IFCSTAIR')
    if (!landing) expect(sets.get('Grid_Slab')?.get('Assumed')).toEqual({ t: 'typed', name: 'IFCBOOLEAN', v: { t: 'enum', v: 'T' } })
  }
  // One floor slab per storey: LVL-4's, never one under each room as well.
  const floorSlabs = slabs.filter((s) => ['FLOOR', 'BASESLAB'].includes(enumOf(s.args[8])) && on(s).aggregatedBy.length === 0)
  const perStorey = new Map<number, number>()
  for (const slab of floorSlabs) {
    // A room set above or below its storey has a piece of its own; the floor's slab says it is the floor's.
    const note = on(slab).sets.get('Grid_Slab')?.get('Note')
    if (!typedText(note).includes("the floor's outline")) continue
    const storey = on(slab).containers[0]!.id
    perStorey.set(storey, (perStorey.get(storey) ?? 0) + 1)
  }
  for (const [, count] of perStorey) expect(count).toBe(1)
  const roofs = ofType(doc, 'IFCROOF')
  for (const roof of roofs) expect(on(roof).sets.size, 'IFC2x3 has no roof quantities: its slab holds them').toBe(0)
  const coverings = ofType(doc, 'IFCCOVERING')
  for (const covering of coverings) {
    expect(enumOf(covering.args[8])).toBe('CEILING')
    expect(on(covering).sets.get('Qto_CoveringBaseQuantities')?.has('GrossArea'), str(covering.args[2])).toBe(true)
  }
  const parapets = ofType(doc, 'IFCWALL')
  for (const parapet of parapets) expect(on(parapet).sets.get('Qto_WallBaseQuantities')?.has('Height'), str(parapet.args[2])).toBe(true)
  const fillers = [...ofType(doc, 'IFCDOOR'), ...ofType(doc, 'IFCWINDOW')]
  for (const filler of fillers) {
    const name = filler.type === 'IFCDOOR' ? 'Qto_DoorBaseQuantities' : 'Qto_WindowBaseQuantities'
    const qto = on(filler).sets.get(name)
    expect(qto, str(filler.args[2])).toBeDefined()
    expect(typedNumber(qto!.get('Width'))).toBeCloseTo(typedNumber(filler.args[9]), 9)
    expect(typedNumber(qto!.get('Height'))).toBeCloseTo(typedNumber(filler.args[8]), 9)
    expect(on(filler).types.map((t) => t.type)).toEqual([filler.type === 'IFCDOOR' ? 'IFCDOORSTYLE' : 'IFCWINDOWSTYLE'])
  }
  // 9. CNT-4: each flat the plan lists is one zone, grouping the spaces of its rooms once each,
  //    on whatever storeys they are on, with its id, type and net area as the areas give it.
  const zones = ofType(doc, 'IFCZONE')
  const flatAreas = new Map(planAreaFigures(measured).flats.map((f) => [f.id, f] as const))
  const resolved = new Map(planFlats(measured).map((f) => [f.id, f] as const))
  expect(zones.length).toBe([...flatAreas.keys()].length)
  for (const zone of zones) {
    const groups = ofType(doc, 'IFCRELASSIGNSTOGROUP').filter((rel) => ref(rel.args[6]) === zone.id)
    expect(groups, str(zone.args[2])).toHaveLength(1)
    const grid = on(zone).sets.get('Grid_Flat')
    expect(grid, str(zone.args[2])).toBeDefined()
    const id = typedText(grid!.get('Id'))
    const figure = flatAreas.get(id)!
    expect(str(zone.args[2])).toBe(figure.name)
    expect(typedNumber(grid!.get('Area'))).toBeCloseTo(figure.net, 6)
    expect(typedText(grid!.get('AreaMeasure'))).toBe(MEASURES.net.name)
    const spacesOf = refs(groups[0]!.args[4]).map((sid) => typedText(on(entity(doc, sid)).sets.get('Grid_Space')!.get('Id')))
    expect(spacesOf.sort()).toEqual(resolved.get(id)!.rooms.map((r) => r.id).sort())
    // A duplex's spaces are on more than one storey.
    const storeysOf = new Set(refs(groups[0]!.args[4]).map((sid) => on(entity(doc, sid)).aggregatedBy[0]!.id))
    expect(storeysOf.size).toBe(figure.floors.length)
  }

  const filled = new Set(ofType(doc, 'IFCRELFILLSELEMENT').map((r) => ref(r.args[4])))
  const holes = ofType(doc, 'IFCOPENINGELEMENT').filter((o) => !filled.has(o.id))
  for (const hole of holes) expect(on(hole).sets.has('Qto_OpeningElementBaseQuantities'), str(hole.args[2])).toBe(true)

  return {
    storeys: storeys.length,
    spaces: spaces.length,
    walls: walls.length,
    slabs: slabs.length,
    fillers: fillers.length,
    holes: holes.length,
    roofs: roofs.length,
    coverings: coverings.length,
    parapets: parapets.length,
    zones: zones.length,
    slabHoles: ofType(doc, 'IFCRELVOIDSELEMENT').filter((r) => entity(doc, ref(r.args[4])).type === 'IFCSLAB').length
  }
}

describe('HND-2 every IFC Grid writes for the repository\'s plans is whole', () => {
  it('reads more than twenty plans', () => {
    expect(PLANS.length).toBeGreaterThan(20)
  })

  const totals: Record<string, number> = {}
  for (const [name, plan] of PLANS) {
    it(`${name}: references, relationships, room data, quantities and materials`, () => {
      const counts = checkFile(plan(), toIfc(plan(), OPTIONS), plan === farFlat ? read(join(FLOORPLAN_FIXTURES, 'two-bed-flat.json')) : plan())
      expect(counts.storeys).toBeGreaterThan(0)
      for (const [key, value] of Object.entries(counts)) totals[key] = (totals[key] ?? 0) + value
    })
  }

  it('looked at rooms, walls, slabs, doors and windows, and doorless openings across them', () => {
    // Runs after the files above: the sums are of everything they checked.
    for (const key of ['spaces', 'walls', 'slabs', 'fillers', 'holes', 'roofs', 'coverings', 'parapets', 'slabHoles', 'zones']) expect(totals[key] ?? 0, key).toBeGreaterThan(0)
  })
})

describe('HND-2 a plan at survey coordinates is written near the origin', () => {
  const near = parseDoc(toIfc(read(join(FLOORPLAN_FIXTURES, 'two-bed-flat.json')), OPTIONS))
  const far = parseDoc(toIfc(farFlat(), OPTIONS))
  const site = (doc: Doc): Entity => ofType(doc, 'IFCSITE')[0]!

  it('moves the site by whole steps of farFromOrigin, and nothing else is far', () => {
    const step = limit('farFromOrigin')
    const placement = entity(far, ref(site(far).args[5]))
    const axes = entity(far, ref(placement.args[1]))
    const siteAt = ref(axes.args[0])
    const [x, y] = pointsOf(far).get(siteAt)!
    expect([x! / step, y! / step].map((v) => Math.abs(v - Math.round(v)) < 1e-9)).toEqual([true, true])
    expect(Math.hypot(x! - FAR[0], y! - FAR[1])).toBeLessThan(step)
    for (const [id, coords] of pointsOf(far)) {
      if (id === siteAt) continue
      for (const v of coords) expect(Math.abs(v), `#${id}`).toBeLessThan(step)
    }
  })

  it('keeps a stated site on its point, with its data and the north, and writes the elements from it (CNT-3, HND-11)', () => {
    const step = limit('farFromOrigin')
    const stated: readonly [number, number] = [FAR[0] + 1, FAR[1] + 2]
    const sited = parseDoc(toIfc({ ...farFlat(), north: -30, site: { origin: [...stated], latitude: 40.5, longitude: -3.25, elevation: 650 } }, OPTIONS))
    const pointOf = (localPlacement: number): number[] => pointsOf(sited).get(ref(entity(sited, ref(entity(sited, localPlacement).args[1])).args[0]))!
    const s = site(sited)
    expect(pointOf(ref(s.args[5]))).toEqual([stated[0], stated[1], 0])
    expect([nums(s.args[9]), nums(s.args[10]), num(s.args[11])]).toEqual([[40, 30, 0, 0], [-3, -15, 0, 0], 650])
    const building = ofType(sited, 'IFCBUILDING')[0]!
    expect(ref(entity(sited, ref(building.args[5])).args[0])).toBe(ref(s.args[5]))
    // HND-11: the elements are written from the site's own origin, so the building stands on it.
    // Before, they were moved by whole steps of farFromOrigin and the building held the rest.
    const [bx, by] = pointOf(ref(building.args[5]))
    expect([bx, by]).toEqual([0, 0])
    expect(Math.hypot(stated[0] - FAR[0], stated[1] - FAR[1])).toBeLessThan(step)
    const context = ofType(sited, 'IFCGEOMETRICREPRESENTATIONCONTEXT')[0]!
    const [nx, ny] = nums(entity(sited, ref(context.args[5])).args[0])
    expect(nx).toBeCloseTo(0.5, 9)
    expect(ny).toBeCloseTo(Math.sqrt(3) / 2, 9)
  })

  it('leaves a plan near the origin where it is', () => {
    const placement = entity(near, ref(site(near).args[5]))
    const axes = entity(near, ref(placement.args[1]))
    expect(pointsOf(near).get(ref(axes.args[0]))).toEqual([0, 0, 0])
  })

  it('gives the same rooms, areas and quantities as the plan drawn at the origin', () => {
    const values = (doc: Doc): number[] =>
      ['IFCQUANTITYLENGTH', 'IFCQUANTITYAREA', 'IFCQUANTITYVOLUME'].flatMap((type) => ofType(doc, type).map((q) => typedNumber(q.args[3])))
    const a = values(near)
    const b = values(far)
    expect(b).toHaveLength(a.length)
    b.forEach((v, i) => expect(v).toBeCloseTo(a[i]!, 6))
    expect(ofType(far, 'IFCSPACE').map((s) => [str(s.args[2]), str(s.args[7])])).toEqual(ofType(near, 'IFCSPACE').map((s) => [str(s.args[2]), str(s.args[7])]))
  })
})

describe('HND-2 the bench\'s two-bed flat, room by room (lab EX-2: name only, 0 quantity sets)', () => {
  const doc = parseDoc(toIfc(read(join(FLOORPLAN_FIXTURES, 'two-bed-flat.json')), OPTIONS))
  const carried = carriedBy(doc)
  const named = (type: string, name: string, at = 2): Entity => ofType(doc, type).find((e) => str(e.args[at]) === name)!
  const set = (e: Entity, name: string): Map<string, Value> => carried.get(e.id)!.sets.get(name)!

  it('numbers Bedroom 1 as 2, says it is a bedroom, and gives its net area with the rule', () => {
    const bedroom = named('IFCSPACE', 'Bedroom 1', 7)
    expect(str(bedroom.args[2])).toBe('2')
    expect(str(bedroom.args[4])).toBe('bedroom')
    const grid = set(bedroom, 'Grid_Space')
    expect(typedText(grid.get('Use'))).toBe('bedroom')
    expect(typedNumber(grid.get('Area'))).toBeCloseTo(13.64, 9)
    expect(typedText(grid.get('AreaMeasure'))).toBe('Net area')
    expect(typedText(set(bedroom, 'Pset_SpaceCommon').get('Category'))).toBe('bedroom')
    expect(typedNumber(set(bedroom, 'Qto_SpaceBaseQuantities').get('NetFloorArea'))).toBeCloseTo(13.64, 9)
  })

  it('numbers the six rooms 1 to 6 and their areas add up to the flat\'s 62.65 m² net', () => {
    const spaces = ofType(doc, 'IFCSPACE')
    expect(spaces.map((s) => str(s.args[2])).sort()).toEqual(['1', '2', '3', '4', '5', '6'])
    const total = spaces.reduce((sum, s) => sum + typedNumber(set(s, 'Grid_Space').get('Area')), 0)
    expect(total).toBeCloseTo(62.65, 6)
  })

  it('takes the entrance door out of the north wall\'s side and volume, and types the wall exterior 0.3 m', () => {
    const wall = named('IFCWALLSTANDARDCASE', 'ext-north')
    const qto = set(wall, 'Qto_WallBaseQuantities')
    expect(typedNumber(qto.get('GrossSideArea'))).toBeCloseTo(9.2 * 2.6, 9)
    expect(typedNumber(qto.get('NetSideArea'))).toBeCloseTo(9.2 * 2.6 - 0.9 * 2.1, 9)
    expect(typedNumber(qto.get('NetVolume'))).toBeCloseTo((9.2 * 2.6 - 0.9 * 2.1) * 0.3, 9)
    const [type] = carried.get(wall.id)!.types
    expect(str(type!.args[2])).toBe('Exterior wall 0.3 m')
    const [layers] = carried.get(type!.id)!.materials
    const material = entity(doc, ref(entity(doc, refs(layers!.args[0])[0]!).args[0]))
    // CNT-15 (lab AU3-4): the plan states no material, and the IFC says so.
    expect(str(material.args[0])).toBe('Not stated')
  })

  it('types the entrance door by its size and handing, with its quantities', () => {
    const door = named('IFCDOOR', 'door-entrance')
    expect(carried.get(door.id)!.types.map((t) => [str(t.args[2]), str(t.args[7])])).toEqual([['Door 0.9 x 2.1 m, single swing, right hand', 'door:0.9x2.1']])
    expect(typedNumber(set(door, 'Qto_DoorBaseQuantities').get('Area'))).toBeCloseTo(1.89, 9)
  })

  it('gives the doorless pass between kitchen and living room its own quantities, and writes no zone: the plan lists no flats (CNT-4)', () => {
    const pass = named('IFCOPENINGELEMENT', 'pass-kitchen-living')
    expect(typedNumber(set(pass, 'Qto_OpeningElementBaseQuantities').get('Width'))).toBeCloseTo(1.2, 9)
    expect(ofType(doc, 'IFCZONE')).toHaveLength(0)
    expect(ofType(doc, 'IFCRELASSIGNSTOGROUP')).toHaveLength(0)
  })

  it('writes a zone per flat once the plan lists them, grouping its spaces, and changes nothing else (CNT-4)', () => {
    const plain = read(join(FLOORPLAN_FIXTURES, 'two-bed-flat.json'))
    const rooms = plain.rooms.map((r) => r.id)
    const listed: FloorPlan = { ...plain, flatTypes: [{ id: 'two-bed', name: 'Two bedrooms' }], flats: [{ id: 'flat-1', name: 'Flat 1', type: 'two-bed', rooms }] }
    const zoned = parseDoc(toIfc(listed, OPTIONS))
    const [zone] = ofType(zoned, 'IFCZONE')
    expect([str(zone!.args[2]), str(zone!.args[4])]).toEqual(['Flat 1', 'Two bedrooms'])
    const [group] = ofType(zoned, 'IFCRELASSIGNSTOGROUP')
    expect(refs(group!.args[4])).toHaveLength(ofType(zoned, 'IFCSPACE').length)
    // Everything before the zones is the file as it was: the zones come after the storeys' contents.
    const before = toIfc(plain, OPTIONS).split('\n').filter((line) => line.startsWith('#'))
    const after = toIfc(listed, OPTIONS).split('\n').filter((line) => line.startsWith('#'))
    const first = after.findIndex((line) => line.includes('IFCZONE('))
    expect(after.slice(0, first)).toEqual(before.slice(0, first))
  })
})
