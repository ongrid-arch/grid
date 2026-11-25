/**
 * CNT-7 (C26, lab EL-8, EL-18, R-8): outdoor space, roofed or open.
 *
 * The house is the lab's G series house: outside walls 0.30 m thick on centre lines from
 * (3.15, 10.15) to (11.85, 19.85), six rooms, 76.34 m² net, 78.96 m² gross internal and 90 m² gross
 * external (`s01a-house-alone.json`). `s01c-plot-virtual.json` draws its 15 × 30 m plot round it as
 * six more rooms bounded by dividing lines: the front garden, the driveway, a strip of front garden,
 * two side passages and the back garden. Drawn so, the lab read 436.25 m² of floor (EL-8); Grid
 * today reads 436.34 m², the 450 m² plot less the house's 13.66 m² of walls. Marked as outdoor
 * space, the six are 360.00 m² listed apart (450 less the 90 m² the house covers), and the house is
 * measured as it is alone.
 *
 * `s02a-terrace-porch.json` is the same house with a terrace off its north wall and a porch over its
 * front door, both bounded by dividing lines, the porch on two posts; `s04a-garage-carport.json` a
 * house with a garage and a carport on four posts in front of it (EL-18). By hand: the porch is
 * 2.40 × 1.50 = 3.60 m², the terrace 4.65 × 3.00 = 13.95 m², the carport 3.40 × 5.40 = 18.36 m².
 */
import { describe, expect, it } from 'vitest'
import {
  buildScene,
  checkPlanSanity,
  floorElevations,
  indexPlan,
  outdoorOnlyWalls,
  planAreaFigures,
  planEnvelope,
  planWallSides,
  type FloorPlan,
} from '../index'
import { toIfc } from '../export/ifc'
import { toObj } from '../export/obj'
import { toGlb } from '../export/gltf'
import { parseFloorPlan } from '../../types/floorplan'
import { labPlanText } from '../../test-support/lab'
import { named, parseIfc, quantityOf } from '../../test-support/ifcVolume'
import { multiArea } from '../polygons'

type Raw = Record<string, unknown> & { rooms: Record<string, unknown>[]; walls: Record<string, unknown>[] }

const raw = (name: string): Raw => JSON.parse(labPlanText(`G/scenarios/${name}.json`)) as Raw

/** The lab plan with its rooms marked as the map says. */
function marked(name: string, marks: Record<string, Record<string, unknown>>): FloorPlan {
  const plan = raw(name)
  for (const room of plan.rooms) Object.assign(room, marks[room.id as string] ?? {})
  return parseFloorPlan(plan)
}

const GARDENS = {
  'front-garden': { outdoor: 'garden' },
  driveway: { outdoor: 'other' },
  'front-east': { outdoor: 'garden' },
  'side-w': { outdoor: 'other' },
  'side-e': { outdoor: 'other' },
  'back-garden': { outdoor: 'garden' },
}
const round = (value: number | null | undefined): string => (value ?? NaN).toFixed(2)

describe('the house with its garden drawn as outdoor space (done-when 1, lab EL-8)', () => {
  it('totals 76.34 m², not the 436 m² of the garden drawn as rooms', () => {
    const drawn = planAreaFigures(parseFloorPlan(raw('s01c-plot-virtual')))
    expect(round(drawn.net.area)).toBe('436.34')
    expect(drawn.outdoor).toBeUndefined()

    const areas = planAreaFigures(marked('s01c-plot-virtual', GARDENS))
    expect([areas.net.area, areas.grossInternal.area, areas.grossExternal.area].map(round)).toEqual(['76.34', '78.96', '90.00'])
    // The same figures as the house drawn alone.
    const alone = planAreaFigures(parseFloorPlan(raw('s01a-house-alone')))
    expect([alone.net.area, alone.grossInternal.area, alone.grossExternal.area].map(round)).toEqual(['76.34', '78.96', '90.00'])
    expect(areas.byUse).toEqual(alone.byUse)
    // The garden is listed apart, by kind, none of it roofed.
    expect(round(areas.outdoor!.area)).toBe('360.00')
    expect(round(areas.outdoor!.open)).toBe('360.00')
    expect(areas.outdoor!.roofed).toBe(0)
    expect(Object.keys(areas.outdoor!.byKind).sort()).toEqual(['garden', 'other'])
    expect(areas.outdoor!.weighted).toBeNull()
    expect(areas.floors[0]!.rooms.filter((room) => room.outdoor !== undefined).map((room) => room.id)).toEqual(Object.keys(GARDENS))
    expect(areas.notes).toContain('360.00 m² of outdoor space is listed apart: it is in no net, gross internal or gross external figure.')
  })

  it('keeps the sums of a floor: gross external is the net, the walls and the floor no room claims', () => {
    const floor = planAreaFigures(marked('s01c-plot-virtual', GARDENS)).floors[0]!
    expect(floor.grossExternal!).toBeCloseTo(floor.net + floor.outsideRooms + floor.walls! + floor.unclaimed! - floor.offSpace!, 6)
  })

  it('gives the garden no note of its own, and the house walls beside it face outside', () => {
    const drawn = parseFloorPlan(raw('s01c-plot-virtual'))
    const plan = marked('s01c-plot-virtual', GARDENS)
    const gardens = new Set(Object.keys(GARDENS))
    const names = (p: FloorPlan): string[] => checkPlanSanity(p).findings.filter((f) => f.rooms.some((id) => gardens.has(id))).map((f) => f.code)
    expect(names(plan)).toEqual([])
    // The walls the gardens lie along face outside, as the house's own walls do drawn alone.
    const sides = planWallSides(indexPlan(plan))
    for (const id of ['ext-s', 'ext-e', 'ext-n', 'ext-w']) expect(sides.get(id)!.worked, id).toBe('exterior')
    expect(planWallSides(indexPlan(drawn)).get('ext-w')!.worked).toBe('interior')
    for (const id of ['ext-s', 'ext-e', 'ext-n', 'ext-w']) expect(sides.get(id)!.differs, id).toBeNull()
  })

  it('says no garden has no way out and no courtyard has no door, fenced in or not', () => {
    // The back garden fenced in all round, 1.8 m high, with no gate: drawn as a room, it is told
    // it has no door, as a courtyard is.
    const fenced = raw('s01c-plot-virtual')
    for (const wall of fenced.walls) if (['plot-e', 'plot-n', 'plot-w', 'back-line'].includes(String(wall['id']))) Object.assign(wall, { virtual: undefined, thickness: 0.1, height: 1.8 })
    const asDrawn = checkPlanSanity(parseFloorPlan(fenced)).findings
    expect(asDrawn.map((f) => [f.code, f.message])).toEqual([['room_without_door', '"Back garden" has no door or opening to another space']])
    for (const room of fenced.rooms) Object.assign(room, (GARDENS as Record<string, object>)[room.id as string] ?? {})
    const outdoor = checkPlanSanity(parseFloorPlan(fenced)).findings
    expect(outdoor.filter((f) => f.rooms.some((id) => id in GARDENS))).toEqual([])
    // Its fence is no part of the building: it sets no storey height, and is in no area.
    expect(planAreaFigures(parseFloorPlan(fenced)).grossExternal.area!.toFixed(2)).toBe('90.00')

    const court = marked('s08a-infill-courtyard', { court: { outdoor: 'courtyard' } })
    expect(checkPlanSanity(court).findings.filter((f) => f.rooms.includes('court'))).toEqual([])
    const before = planAreaFigures(parseFloorPlan(raw('s08a-infill-courtyard')))
    const after = planAreaFigures(court)
    // The courtyard, 4.20 × 3.70 = 15.54 m², comes off the net and both gross figures.
    expect(round(after.outdoor!.area)).toBe('15.54')
    for (const m of ['net', 'grossExternal'] as const) expect(round(before[m].area! - after[m].area!), m).toBe('15.54')
    // ARE-39: gross internal follows the rooms beside each wall. Before, the walls round the room
    // had rooms on both faces and counted as floor; marked outdoor, they face outside and come off too.
    expect(round(before.grossInternal.area! - after.grossInternal.area!)).toBe('19.17')
  })
})

describe('a parapet or a fence round a terrace sets no storey height', () => {
  it('leaves the house at its own height, and a floor of the terrace alone at the plan default', () => {
    // A 3.2 m garden wall round the back garden, taller than the house.
    const plan = raw('s01c-plot-virtual')
    for (const wall of plan.walls) if (wall['id'] === 'plot-n') Object.assign(wall, { virtual: undefined, thickness: 0.2, height: 3.2, kind: 'exterior' })
    expect(floorElevations(parseFloorPlan(plan)).floors.get('ground')!.clearHeight).toBe(3.2)
    for (const room of plan.rooms) Object.assign(room, (GARDENS as Record<string, object>)[room.id as string] ?? {})
    const outdoor = parseFloorPlan(plan)
    expect(outdoorOnlyWalls(indexPlan(outdoor)).has('plot-n')).toBe(true)
    expect(floorElevations(outdoor).floors.get('ground')!.clearHeight).toBe(2.7)
  })
})

/** The roof a plan's envelope gives its one floor, in m². */
const roofArea = (plan: FloorPlan): string => round(planEnvelope(plan).floors[0]!.roof?.area ?? 0)

/** The ring areas of a scene solid's pieces. */
const sceneArea = (pieces: readonly { readonly outline: readonly { x: number; y: number }[]; readonly holes: readonly (readonly { x: number; y: number }[])[] }[]): number =>
  multiArea(pieces.map((piece) => [piece.outline, ...piece.holes].map((ring) => ring.map((p): [number, number] => [p.x, p.y]))))

/** The IFC roof slab's gross area, from the file alone. */
function ifcRoof(plan: FloorPlan): string {
  const doc = parseIfc(toIfc(plan))
  const slabs = doc.order.filter((e) => e.type === 'IFCSLAB' && String((e.args[2] as { v?: unknown }).v).endsWith('roof slab'))
  return round(slabs.reduce((total, slab) => total + quantityOf(doc, slab, 'Qto_SlabBaseQuantities', 'GrossArea'), 0))
}

describe('a roof only over the outdoor spaces marked roofed (done-when 2, lab EL-18)', () => {
  const porch = { terrace: { outdoor: 'terrace' }, porch: { outdoor: 'porch' } }

  it('roofs the house and the porch, not the open terrace, in the envelope, the IFC and the 3D', () => {
    // Drawn as rooms, the terrace and the porch are both roofed with the house: 90 + 13.95 + 3.60.
    const drawn = parseFloorPlan(raw('s02a-terrace-porch'))
    expect(roofArea(drawn)).toBe('107.55')
    expect(ifcRoof(drawn)).toBe('107.55')

    const plan = marked('s02a-terrace-porch', porch)
    expect(roofArea(plan)).toBe('93.60')
    expect(ifcRoof(plan)).toBe('93.60')
    const shell = buildScene(plan).shell!
    expect(round(sceneArea(shell.roof!.pieces))).toBe('93.60')
    // The slab is the house's: the terrace and the porch stand on the ground.
    expect(round(sceneArea(shell.slab[0]!.pieces))).toBe('90.00')
  })

  it('roofs the carport, by its kind or as stated, and takes a roof off a porch stated open', () => {
    expect(roofArea(parseFloorPlan(raw('s04a-garage-carport')))).toBe('130.75')
    const carport = marked('s04a-garage-carport', { carport: { outdoor: 'carport' } })
    expect(roofArea(carport)).toBe('130.68')
    expect(ifcRoof(carport)).toBe('130.68')
    expect(roofArea(marked('s04a-garage-carport', { carport: { outdoor: 'carport', roofed: false } }))).toBe('112.32')
    expect(roofArea(marked('s02a-terrace-porch', { terrace: { outdoor: 'terrace', roofed: true }, porch: { outdoor: 'porch', roofed: false } }))).toBe('103.95')
  })

  it('keeps the outdoor and roofed marks in the IFC, the OBJ and the GLB', () => {
    const plan = marked('s02a-terrace-porch', porch)
    const ifc = toIfc(plan)
    const doc = parseIfc(ifc)
    const terrace = named(doc, 'IFCSPACE', 'Terrace')[0]!
    expect(terrace.args[9]).toEqual({ t: 'enum', v: 'EXTERNAL' })
    expect(named(doc, 'IFCSPACE', 'Living room')[0]!.args[9]).toEqual({ t: 'enum', v: 'INTERNAL' })
    expect(ifc).toMatch(/IFCPROPERTYSINGLEVALUE\('Outdoor',\$,IFCLABEL\('porch'\),\$\)/)
    expect(ifc).toMatch(/IFCPROPERTYSINGLEVALUE\('Roofed',\$,IFCBOOLEAN\(\.T\.\),\$\)/)
    expect(ifc).toMatch(/IFCPROPERTYSINGLEVALUE\('Roofed',\$,IFCBOOLEAN\(\.F\.\),\$\)/)
    const scene = buildScene(plan)
    const obj = toObj(scene)
    expect(obj).toContain('# grid-outdoor terrace roofed=false')
    expect(obj).toContain('# grid-outdoor porch roofed=true')
    const glb = Buffer.from(toGlb(scene))
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as { nodes: { name: string; extras?: Record<string, unknown> }[] }
    expect(json.nodes.filter((node) => node.extras !== undefined).map((node) => [node.name, node.extras])).toEqual([
      ['floor_terrace', { gridOutdoor: 'terrace', gridRoofed: false }],
      ['floor_porch', { gridOutdoor: 'porch', gridRoofed: true }],
    ])
  })
})

describe('the outdoor mark (C26)', () => {
  it('reads true as outdoor space of no named kind, and weights it only by a rule the caller states', () => {
    const plan = marked('s03a-flat-balcony', { balcony: { outdoor: true } })
    expect(plan.rooms.find((room) => room.id === 'balcony')!.outdoor).toBe(true)
    const plain = planAreaFigures(plan)
    expect(plain.outdoor!.byKind).toEqual({ other: plain.outdoor!.area })
    const balcony = marked('s03a-flat-balcony', { balcony: { outdoor: 'balcony' } })
    const weighted = planAreaFigures(balcony, { outdoorWeights: { balcony: { weight: 0.5, rule: 'Half a balcony, a rule the caller states.' } } })
    // ARE-14 adds each kind the rule counts and the net with that floor beside it.
    expect(weighted.outdoor!.weighted).toEqual({
      area: weighted.outdoor!.area / 2,
      rules: ['Half a balcony, a rule the caller states.'],
      kinds: [{ kind: 'balcony', area: weighted.outdoor!.area, share: 0.5, counted: weighted.outdoor!.area / 2, rule: 'Half a balcony, a rule the caller states.' }],
      withNet: weighted.net.area! + weighted.outdoor!.area / 2,
    })
    expect(weighted.net.area).toBe(planAreaFigures(balcony).net.area)
  })
})
