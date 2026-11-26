/**
 * LVL-6: sloped roofs, the walls and rooms cut to them, and rooflights. The lab's own plans are in
 * `roofs-lab.test.ts`; these are built by hand, each with its figures worked out in the test.
 *
 * The box: one room, 8 × 6 m on its walls' lines (0.3 m outside walls, so 7.7 × 5.7 m inside,
 * x 0.15 to 7.85 and y 0.15 to 5.85, 43.89 m²), on a floor that states its roof.
 */
import { describe, expect, it } from 'vitest'
import { named, parseIfc, productVolume, quantityOf } from '../../test-support/ifcVolume'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { readRoomsText } from '../../rooms/read'
import { validatePlan } from '../validate'
import { floorElevations } from '../elevations'
import { planEnvelope } from '../envelope'
import { buildScene, elevationArea } from '../scene3d'
import { shellMesh, wallMesh } from '../export/mesh'
import { toIfc } from '../export/ifc'
import { toObj } from '../export/obj'
import { floorRoofShape, roofHeightAt, roomHeadroom, wallTopProfile } from '../roofs'

const OPTIONS = { projectId: 'roofs', projectName: 'Roofs', now: new Date('2026-11-22T00:00:00Z') }

type Raw = Record<string, unknown>

function box(roof: Raw | undefined, extra: { walls?: Raw[]; openings?: Raw[]; height?: number } = {}): FloorPlan {
  const wall = (id: string, start: number[], end: number[]): Raw => ({ id, start, end, thickness: 0.3, kind: 'exterior', ...(extra.height === undefined ? {} : { height: extra.height }) })
  return parseFloorPlan({
    floors: [{ id: 'ground', name: 'Ground', level: 0, ...(roof === undefined ? {} : { roof }) }],
    walls: [wall('s', [0, 0], [8, 0]), wall('e', [8, 0], [8, 6]), wall('n', [8, 6], [0, 6]), wall('w', [0, 6], [0, 0]), ...(extra.walls ?? [])],
    rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'], use: 'living' }],
    openings: extra.openings ?? [{ id: 'd', wall: 's', type: 'door', offset: 3.5, width: 0.9, height: 2.0 }]
  })
}

/** The volume a closed, outward-wound triangle mesh holds. */
function closedVolume(mesh: { points: readonly { x: number; y: number; z: number }[]; faces: readonly (readonly [number, number, number])[] }): number {
  let v = 0
  for (const [a, b, c] of mesh.faces) {
    const p = mesh.points[a]!
    const q = mesh.points[b]!
    const r = mesh.points[c]!
    v += (p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x)) / 6
  }
  return v
}

describe('the roof a floor states', () => {
  it('reads every plan written before LVL-6 with no key added, and refuses a roof that says too little or too much', () => {
    expect(box(undefined).floors![0]).toEqual({ id: 'ground', name: 'Ground', level: 0 })
    const refused = (roof: Raw): string[] => {
      try {
        box(roof)
        return []
      } catch (error) {
        return (error as { issues: { path: (string | number)[] }[] }).issues.map((i) => i.path.join('.'))
      }
    }
    expect(refused({ shape: 'flat', eaves: 2.4, pitch: 30 })).toEqual(['floors.0.roof.pitch'])
    expect(refused({ shape: 'gable', eaves: 1 })).toEqual(['floors.0.roof.pitch'])
    expect(refused({ shape: 'gable', eaves: 1, pitch: 30, ridge: 3 })).toEqual(['floors.0.roof.pitch'])
    expect(refused({ shape: 'gable', eaves: 2, ridge: 1.5 })).toEqual(['floors.0.roof.ridge'])
    expect(refused({ shape: 'hip', eaves: 1, pitch: 30, ridgeRuns: 'east-west' })).toEqual(['floors.0.roof.ridgeRuns'])
    expect(refused({ shape: 'mono-pitch', eaves: 1, pitch: 10 })).toEqual(['floors.0.roof.highSide'])
    expect(refused({ shape: 'gable', eaves: 1, pitch: 90 })).toEqual(['floors.0.roof.pitch'])
  })

  it('stands a gable on the outside walls\' lines: 1.0 m at the eaves, rising to the ridge over the middle', () => {
    const shape = floorRoofShape(box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' }), 'ground')!
    expect(roofHeightAt(shape, { x: 4, y: 0 })).toBeCloseTo(1, 9)
    expect(roofHeightAt(shape, { x: 4, y: 3 })).toBeCloseTo(3.6, 9)
    expect(roofHeightAt(shape, { x: 1, y: 1.5 })).toBeCloseTo(2.3, 9)
    expect(shape.pitch).toBeCloseTo((Math.atan(2.6 / 3) * 180) / Math.PI, 9)
    // Unstated, the ridge runs along the longer sides: east-west here.
    expect(roofHeightAt(floorRoofShape(box({ shape: 'gable', eaves: 1, ridge: 3.6 }), 'ground')!, { x: 4, y: 3 })).toBeCloseTo(3.6, 9)
    // North-south: from the west and east walls.
    const across = floorRoofShape(box({ shape: 'gable', eaves: 1, pitch: 45, ridgeRuns: 'north-south' }), 'ground')!
    expect(roofHeightAt(across, { x: 4, y: 1 })).toBeCloseTo(5, 9)
    expect(roofHeightAt(across, { x: 1, y: 3 })).toBeCloseTo(2, 9)
  })

  it('keeps all four planes of a hip, though its hips run through the outline\'s corners (VEW-12)', () => {
    const roof = planEnvelope(box({ shape: 'hip', eaves: 1, pitch: 45 })).floors[0]!.roof!
    expect(roof.facets).toHaveLength(4)
    // The planes cover the roof: 8.3 m by 6.3 m to the outside faces.
    expect(roof.facets.reduce((sum, f) => sum + f.area, 0)).toBeCloseTo(roof.area, 6)
    expect(roof.area).toBeCloseTo(8.3 * 6.3, 6)
  })

  it('makes a hip from all four sides at one pitch, a mono-pitch roof from the low side, and a flat roof level', () => {
    const hip = floorRoofShape(box({ shape: 'hip', eaves: 1, pitch: 45 }), 'ground')!
    expect(roofHeightAt(hip, { x: 4, y: 3 })).toBeCloseTo(4, 9)
    expect(roofHeightAt(hip, { x: 1, y: 3 })).toBeCloseTo(2, 9)
    expect(roofHeightAt(hip, { x: 7, y: 3 })).toBeCloseTo(2, 9)
    expect(hip.top).toBeCloseTo(4, 9)
    const mono = floorRoofShape(box({ shape: 'mono-pitch', eaves: 2.4, ridge: 3.6, highSide: 'north' }), 'ground')!
    expect(roofHeightAt(mono, { x: 1, y: 0 })).toBeCloseTo(2.4, 9)
    expect(roofHeightAt(mono, { x: 7, y: 6 })).toBeCloseTo(3.6, 9)
    expect(roofHeightAt(mono, { x: 4, y: 3 })).toBeCloseTo(3, 9)
    const flat = floorRoofShape(box({ shape: 'flat', eaves: 2.4 }), 'ground')!
    expect(flat.planes).toEqual([])
    expect(roofHeightAt(flat, { x: 4, y: 3 })).toBe(2.4)
  })

  it('stands square to a plan drawn off the drawing\'s axes', () => {
    const turn = (Math.PI / 180) * 30
    const at = (x: number, y: number): [number, number] => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)]
    const raw = {
      floors: [{ id: 'ground', name: 'Ground', level: 0, roof: { shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' } }],
      walls: [
        { id: 's', start: at(0, 0), end: at(8, 0), thickness: 0.3, kind: 'exterior' },
        { id: 'e', start: at(8, 0), end: at(8, 6), thickness: 0.3, kind: 'exterior' },
        { id: 'n', start: at(8, 6), end: at(0, 6), thickness: 0.3, kind: 'exterior' },
        { id: 'w', start: at(0, 6), end: at(0, 0), thickness: 0.3, kind: 'exterior' }
      ],
      rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'] }],
      openings: []
    }
    const plan = parseFloorPlan(raw)
    const shape = floorRoofShape(plan, 'ground')!
    const [x, y] = at(4, 3)
    expect(roofHeightAt(shape, { x, y })).toBeCloseTo(3.6, 9)
    const [x1, y1] = at(1, 1.5)
    expect(roofHeightAt(shape, { x: x1, y: y1 })).toBeCloseTo(2.3, 9)
    expect(roomHeadroom(plan, 'r')!.bands.map((b) => b.area.toFixed(2))).toEqual(roomHeadroom(box({ shape: 'gable', eaves: 1, ridge: 3.6 }), 'r')!.bands.map((b) => b.area.toFixed(2)))
  })
})

describe('the walls under it', () => {
  it('cuts a gable to its shape and leaves the eaves walls, which the roof does not cut, rectangles', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' }, { height: 3.6 })
    const wall = (id: string) => plan.walls.find((w) => w.id === id)!
    // The east wall runs north from (8, 0): 1.0 m at its ends, 3.6 m at the ridge, 3 m along.
    expect(wallTopProfile(plan, wall('e'))!.map((p) => [Number(p.u.toFixed(6)), Number(p.z.toFixed(6))])).toEqual([
      [0, 1],
      [3, 3.6],
      [6, 1]
    ])
    // The south wall, 3.6 m as stated, is cut to 1.0 m along its whole length: a rectangle again.
    expect(wallTopProfile(plan, wall('s'))!.map((p) => Number(p.z.toFixed(6)))).toEqual([1, 1])
  })

  it('lifts a wall that states no height to the roof, and leaves one lower than the roof as it is', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6 }, { walls: [{ id: 'low', start: [4, 0], end: [4, 6], thickness: 0.1, kind: 'partition', height: 1.2 }] })
    expect(plan.walls.find((w) => w.id === 'e')!.height).toBe(3.6)
    const low = plan.walls.find((w) => w.id === 'low')!
    expect(low.height).toBe(1.2)
    // The roof is 1.2 m high 0.2308 m in from each eaves line: there it cuts the partition.
    const top = wallTopProfile(plan, low)!
    expect(top.map((p) => [Number(p.u.toFixed(4)), Number(p.z.toFixed(4))])).toEqual([
      [0, 1],
      [0.2308, 1.2],
      [5.7692, 1.2],
      [6, 1]
    ])
  })

  it('raises each wall in 3D from its cut elevation, a closed solid as large as its face times its thickness', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' })
    const scene = buildScene(plan)
    const east = scene.walls.find((w) => w.id === 'e')!
    // The gable: 6 × 1.0 + 6 × 2.6 / 2 = 13.8 m², with no hole in it.
    expect(elevationArea(east.elevation)).toBeCloseTo(13.8, 9)
    expect(east.elevation.height).toBeCloseTo(3.6, 9)
    expect(scene.height).toBeCloseTo(3.6, 9)
    const mesh = wallMesh({ ...east, elevation: { ...east.elevation, ends: { start: { left: 0, right: 0 }, end: { left: 0, right: 0 } } } })!
    expect(closedVolume(mesh)).toBeCloseTo(13.8 * 0.3, 6)
    // The revision follows the roof: a steeper roof is another shape.
    const steeper = buildScene(box({ shape: 'gable', eaves: 1, ridge: 4, ridgeRuns: 'east-west' })).walls.find((w) => w.id === 'e')!
    expect(steeper.revision).not.toBe(east.revision)
  })

  it('stands the storey on its tallest wall as the roof cuts it', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6 }, { height: 5 })
    expect(floorElevations(plan).floors.get('ground')!.clearHeight).toBeCloseTo(3.6, 9)
    expect(floorElevations(box(undefined, { height: 5 })).floors.get('ground')!.clearHeight).toBe(5)
  })

  it('writes a gable wall to the IFC as its extrusion clipped by the roof\'s planes, the volume the 3D wall holds', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' })
    const doc = parseIfc(toIfc(plan, OPTIONS))
    const [wall] = named(doc, 'IFCWALLSTANDARDCASE', 'e')
    const east = buildScene(plan).walls.find((w) => w.id === 'e')!
    const mesh = closedVolume(wallMesh(east)!)
    expect(Math.abs(productVolume(doc, wall!, 0.005) - mesh) / mesh).toBeLessThan(0.01)
    expect(doc.order.some((e) => e.type === 'IFCBOOLEANCLIPPINGRESULT')).toBe(true)
    // HND-2's base quantities are the cut wall's: its volume, its highest point and its side.
    expect(Math.abs(quantityOf(doc, wall!, 'Qto_WallBaseQuantities', 'GrossVolume') - mesh) / mesh).toBeLessThan(0.01)
    expect(quantityOf(doc, wall!, 'Qto_WallBaseQuantities', 'Height')).toBeCloseTo(3.6, 9)
    // The east gable, 6 m on its line from 1 m at the eaves to 3.6 m at the ridge.
    expect(quantityOf(doc, wall!, 'Qto_WallBaseQuantities', 'GrossSideArea')).toBeCloseTo(6 * 1 + (6 * 2.6) / 2, 6)
  })
})

describe('the rooms under it', () => {
  it('reports a hip-roofed room by headroom band: 35.00 m² with 1.5 m, 20.16 m² with 2.2 m', () => {
    // At 45° from 1.0 m eaves, 1.5 m is 0.5 m in from every wall line and 2.2 m is 1.2 m in:
    // (8 − 1) × (6 − 1) = 35 m² and (8 − 2.4) × (6 − 2.4) = 20.16 m², both inside the room's faces.
    const headroom = roomHeadroom(box({ shape: 'hip', eaves: 1, pitch: 45 }), 'r')!
    expect(headroom.area).toBeCloseTo(43.89, 9)
    expect(headroom.bands.map((b) => Number(b.area.toFixed(4)))).toEqual([35, 20.16])
    expect(headroom.lowest).toBeCloseTo(1.15, 9)
    expect(headroom.highest).toBeCloseTo(4, 9)
  })

  it('takes a room\'s own height as its ceiling under the roof, and a flat ceiling with no roof whole', () => {
    const plan = parseFloorPlan({ ...JSON.parse(JSON.stringify(box({ shape: 'hip', eaves: 1, pitch: 45 }))), rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'], height: 2.1 }] })
    expect(roomHeadroom(plan, 'r')!.bands.map((b) => Number(b.area.toFixed(4)))).toEqual([35, 0])
    const flat = roomHeadroom(box(undefined), 'r')!
    expect(flat.bands.map((b) => Number(b.area.toFixed(4)))).toEqual([43.89, 43.89])
    expect(flat.underRoof).toBe(false)
  })

  it('writes a mono-pitch room into the IFC with the volume under its slope: 64.98 m³', () => {
    // From 2.4 m on the south wall's line to 3.6 m on the north's: 2.4 + 0.2 y over the room,
    // 7.7 × ∫ from 0.15 to 5.85 of (2.4 + 0.2 y) dy = 7.7 × (13.68 + 3.42) = 131.67 m³.
    const doc = parseIfc(toIfc(box({ shape: 'mono-pitch', eaves: 2.4, ridge: 3.6, highSide: 'north' }), OPTIONS))
    const [space] = named(doc, 'IFCSPACE', 'Room')
    expect(Math.abs(productVolume(doc, space!) - 131.67) / 131.67).toBeLessThan(0.02)
    expect(quantityOf(doc, space!, 'Qto_SpaceBaseQuantities', 'GrossVolume')).toBeCloseTo(131.67, 6)
  })
})

describe('the roof itself', () => {
  it('lays a gable roof on its two slopes, as thick as a flat one and as large on plan, more on the slope', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' })
    const roof = planEnvelope(plan).floors[0]!.roof!
    expect(roof.shape).toBe('gable')
    expect(roof.facets).toHaveLength(2)
    expect(roof.area).toBeCloseTo(8.3 * 6.3, 6)
    expect(roof.facets.reduce((t, f) => t + f.area, 0)).toBeCloseTo(roof.area, 6)
    expect(roof.slopeArea).toBeCloseTo(roof.area * Math.hypot(1, 2.6 / 3), 6)
    // The mesh is a closed solid as large as the roof's plan area times its thickness.
    const shell = buildScene(plan).shell!
    expect(shell.roof!.pieces.every((p) => p.rise !== undefined)).toBe(true)
    expect(closedVolume(shellMesh([shell.roof!])!)).toBeCloseTo(roof.area * roof.thickness, 6)
    // At the ridge the underside is 3.6 m up.
    const ridge = shellMesh([shell.roof!])!.points.filter((p) => Math.abs(p.y - 3) < 1e-6)
    expect(Math.min(...ridge.map((p) => p.z))).toBeCloseTo(3.6, 6)
    // The IFC's roof is a gable roof over one clipped slab, as large.
    const doc = parseIfc(toIfc(plan, OPTIONS))
    const [element] = named(doc, 'IFCROOF', 'Ground roof')
    expect(element!.args[8]).toEqual({ t: 'enum', v: 'GABLE_ROOF' })
    const [slab] = named(doc, 'IFCSLAB', 'Ground roof slab')
    expect(Math.abs(productVolume(doc, slab!, 0.005) - roof.area * roof.thickness) / (roof.area * roof.thickness)).toBeLessThan(0.01)
    // Its base quantities: the area on the slope, the volume on plan times its upright thickness.
    expect(quantityOf(doc, slab!, 'Qto_SlabBaseQuantities', 'GrossArea')).toBeCloseTo(roof.slopeArea, 6)
    expect(quantityOf(doc, slab!, 'Qto_SlabBaseQuantities', 'GrossVolume')).toBeCloseTo(roof.area * roof.thickness, 6)
    expect(toObj(buildScene(plan))).toContain('o roof_ground')
  })

  it('leaves a flat roof the floor states level at its eaves, with its parapet; a sloped one has none', () => {
    const flat = planEnvelope(parseFloorPlan({ ...JSON.parse(JSON.stringify(box({ shape: 'flat', eaves: 2.4 }))), floors: [{ id: 'ground', name: 'Ground', level: 0, parapet: 1, roof: { shape: 'flat', eaves: 2.4 } }] })).floors[0]!.roof!
    expect(flat.bottom).toBe(2.4)
    expect(flat.parapet).not.toBeNull()
    const sloped = planEnvelope(parseFloorPlan({ ...JSON.parse(JSON.stringify(box({ shape: 'hip', eaves: 1, pitch: 30 }))), floors: [{ id: 'ground', name: 'Ground', level: 0, parapet: 1, roof: { shape: 'hip', eaves: 1, pitch: 30 } }] })).floors[0]!.roof!
    expect(sloped.parapet).toBeNull()
  })

  it('opens the roof at a rooflight on one slope, and writes it to the IFC as a window in a void', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west', rooflights: [{ id: 'rl', at: [2, 1.5], width: 0.78, length: 1.18 }] })
    expect(validatePlan(plan).issues.filter((i) => i.code.startsWith('floor/rooflight') || i.code.startsWith('floor/dormers'))).toEqual([])
    const roof = planEnvelope(plan).floors[0]!.roof!
    expect(roof.rooflights.map((r) => r.rooflight.id)).toEqual(['rl'])
    // The hole on plan: 0.78 m by 1.18 m foreshortened by the slope.
    const hole = 0.78 * (1.18 / Math.hypot(1, 2.6 / 3))
    expect(roof.facets.reduce((t, f) => t + f.area, 0)).toBeCloseTo(8.3 * 6.3 - hole, 6)
    const doc = parseIfc(toIfc(plan, OPTIONS))
    expect(named(doc, 'IFCOPENINGELEMENT', 'rl')).toHaveLength(1)
    const [window] = named(doc, 'IFCWINDOW', 'rl')
    expect(window!.args[4]).toEqual({ t: 'str', v: 'Rooflight' })
    expect(doc.order.filter((e) => e.type === 'IFCRELFILLSELEMENT')).toHaveLength(1)
  })

  it('leaves out a rooflight across the ridge or off the roof, and says a roof\'s dormers are not drawn', () => {
    const plan = box({
      shape: 'gable',
      eaves: 1,
      ridge: 3.6,
      ridgeRuns: 'east-west',
      rooflights: [
        { id: 'ridge', at: [2, 3], width: 0.78, length: 1.18 },
        { id: 'off', at: [9, 3], width: 0.78, length: 1.18 }
      ],
      dormers: [{ id: 'd', shape: 'box', at: [6, 0.6], width: 1.8, height: 2.2 }]
    })
    const issues = validatePlan(plan).issues.filter((i) => i.code.startsWith('floor/rooflight') || i.code.startsWith('floor/dormers'))
    expect(issues.map((i) => [i.code, i.severity, i.message])).toEqual([
      ['floor/rooflight-misplaced', 'error', 'Rooflight "ridge" in the roof over floor "Ground" crosses a line where two slopes of the roof meet, so it would lie in both: it is left out'],
      ['floor/rooflight-misplaced', 'error', 'Rooflight "off" in the roof over floor "Ground" lies outside the roof: it is left out'],
      ['floor/dormers-not-drawn', 'warning', 'The roof over floor "Ground" lists a dormer: sections draw it and the headroom counts the floor under it, but the 3D model, elevations, exports and take-off do not show it yet']
    ])
    expect(planEnvelope(plan).floors[0]!.roof!.rooflights).toEqual([])
  })

  it('tells an opening that names the roof for its wall that a window in the roof is a rooflight', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6 }, { openings: [{ id: 'sky', wall: 'roof', type: 'window', offset: 1, width: 0.8, height: 1.2 }] })
    const [line] = validatePlan(plan).issues.filter((i) => i.code === 'opening/missing-wall')
    expect(line!.message).toBe(
      'Opening "sky" points at wall "roof", which is not in the plan. An opening sits in a wall; a window in the roof is a rooflight, stated in its floor\'s roof (floors[].roof.rooflights), and a dormer is stated there too (floors[].roof.dormers)'
    )
  })
})

describe('rooms text', () => {
  it('writes the roof back as it is, on a raw floor line', () => {
    const plan = box({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west', rooflights: [{ id: 'rl', at: [2, 1.5], width: 0.78, length: 1.18 }] }, { height: 3.6 })
    const text = readRoomsText(plan).text
    expect(text).toContain('raw floor {"roof":{"shape":"gable","eaves":1,"ridge":3.6,"ridgeRuns":"east-west","rooflights":[{"id":"rl","at":[2,1.5],"width":0.78,"length":1.18}]}}')
    const back = compileRoomsText(text).plan!
    expect(back.floors![0]!.roof).toEqual(plan.floors![0]!.roof)
  })
})
