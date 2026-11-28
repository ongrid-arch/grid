/**
 * CMD-56: the site (C13) and the massing (C17) carried into the DXF and the IFC.
 *
 * The plot is a quadrilateral, (0, 0), (40, 0), (40, 30) and (0, 30), with a set-back of 3 m from
 * every edge, so its set-back lines run 3 m inside each edge: along y = 3 from x = 3 to x = 37 for
 * edge 1, by hand. Two buildings stand on it as massing: "Hall", two floors of 10 by 8 m, 3 m high
 * each, and "Shed", one floor of 6 by 5 m, 4 m high. On the ground: a tree, a paved area, a path, a
 * fence, a gate and a pool.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../types/floorplan'
import { parseFloorPlan } from '../../types/floorplan'
import { samplePlan } from '../../geometry/export/__tests__/glb-reader'
import { dxfProblems, modelEntities, numberOf, readDxf, valueOf, valuesOf } from '../../geometry/export/__tests__/dxf-reader'
import { en, entity, num, nums, ofType, parseDoc, ref, refs, str } from '../../geometry/export/__tests__/step-reader'
import { limit } from '../../geometry/tolerances'
import { exportPlan, type ExportFormat } from '../planExport'

const ids = { projectId: 'site-1', projectName: 'Site', now: new Date('2026-11-28T12:00:00.000Z') }
const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))

const HALL = [[5, 10], [15, 10], [15, 18], [5, 18]]
const SHED = [[25, 10], [31, 10], [31, 15], [25, 15]]
const THINGS = [
  { id: 'oak', kind: 'tree', at: [2, 25], canopy: 4 },
  { id: 'yard', kind: 'paving', points: [[5, 4], [15, 4], [15, 8], [5, 8]] },
  { id: 'walk', kind: 'path', points: [[20, 0], [20, 10]], width: 1.5 },
  { id: 'rail', kind: 'fence', points: [[0, 30], [40, 30]], height: 1.2 },
  { id: 'entry', kind: 'gate', points: [[18, 0], [22, 0]] },
  { id: 'pond', kind: 'pool', points: [[30, 20], [36, 20], [36, 26], [30, 26]] },
]
const SITE = { boundary: [[0, 0], [40, 0], [40, 30], [0, 30]], streets: [1], setbacks: [{ from: 'all', distance: 3 }], things: THINGS }

/** The two buildings as massing on the plot: no wall anywhere. */
const massing = (): FloorPlan =>
  parseFloorPlan({
    version: '1',
    units: 'm',
    walls: [],
    rooms: [],
    openings: [],
    floors: [
      { id: 'hall-0', name: 'Hall ground', level: 0, height: 3, outline: HALL },
      { id: 'hall-1', name: 'Hall first', level: 1, height: 3, outline: HALL },
      { id: 'shed-0', name: 'Shed ground', level: 0, height: 4, outline: SHED },
    ],
    buildings: [
      { id: 'hall', name: 'Hall', floors: ['hall-0', 'hall-1'] },
      { id: 'shed', name: 'Shed', floors: ['shed-0'] },
    ],
    site: SITE,
  })

/** The sample's walled room, on the same plot. */
const walled = (): FloorPlan => ({ ...(samplePlan() as FloorPlan), site: SITE } as FloorPlan)

const exported = (plan: FloorPlan, format: ExportFormat, floorId?: string) => exportPlan(plan, format, { ...ids, ...(floorId === undefined ? {} : { floorId }) })

const layered = (dxf: string, layer: string, type?: string) => modelEntities(dxf, type).filter((e) => e.layer === layer)

const corners = (e: { readonly pairs: readonly { code: number; value: string }[] }): number[][] => {
  const xs = valuesOf(e, 10).map(Number)
  const ys = valuesOf(e, 20).map(Number)
  return xs.map((x, i) => [x, ys[i]!])
}

describe('CMD-56: a plan of massing exports', () => {
  it('is not empty in any format: a massing floor is something the file holds', () => {
    for (const format of ['dxf', 'ifc', 'obj', 'glb'] as const) expect(exported(massing(), format).empty, format).toBe(false)
    // One floor of it too.
    expect(exported(massing(), 'dxf', 'shed-0').empty).toBe(false)
  })

  it('a plan with neither walls nor massing is still empty', () => {
    const bare = parseFloorPlan({ version: '1', units: 'm', walls: [], rooms: [], openings: [], site: SITE })
    expect(exported(bare, 'dxf').empty).toBe(true)
  })
})

describe('CMD-56: the DXF draws the site and the massing', () => {
  const dxf = text(exported(massing(), 'dxf').data)

  it('is a sound document', () => {
    expect(dxfProblems(dxf)).toEqual([])
  })

  it('draws the boundary, closed, on its own layer', () => {
    const [boundary, ...more] = layered(dxf, 'GRID-SITE-BOUNDARY', 'LWPOLYLINE')
    expect(more).toEqual([])
    expect(numberOf(boundary!, 70)).toBe(1)
    expect(corners(boundary!)).toEqual([[0, 0], [40, 0], [40, 30], [0, 30]])
  })

  it('draws each set-back line 3 m inside its edge, ended at its neighbours', () => {
    const lines = layered(dxf, 'GRID-SITE-SETBACKS', 'LINE').map((e) => [numberOf(e, 10), numberOf(e, 20), numberOf(e, 11), numberOf(e, 21)])
    expect(lines).toHaveLength(4)
    expect(lines).toContainEqual([3, 3, 37, 3])
    expect(lines).toContainEqual([37, 27, 3, 27])
  })

  it('draws the paving, the path, the fence and gate, the pool and the tree on their layers', () => {
    expect(corners(layered(dxf, 'GRID-SITE-PAVING', 'LWPOLYLINE')[0]!)).toEqual([[5, 4], [15, 4], [15, 8], [5, 8]])
    // A path is its strip, closed, its width across.
    const path = layered(dxf, 'GRID-SITE-PATHS', 'LWPOLYLINE')
    expect(path).toHaveLength(1)
    expect(numberOf(path[0]!, 70)).toBe(1)
    expect(Math.max(...corners(path[0]!).map(([x]) => x!)) - Math.min(...corners(path[0]!).map(([x]) => x!))).toBeCloseTo(1.5, 6)
    // The fence and the gate, open lines.
    const fences = layered(dxf, 'GRID-SITE-FENCES', 'LWPOLYLINE')
    expect(fences.map(corners)).toEqual([[[0, 30], [40, 30]], [[18, 0], [22, 0]]])
    expect(fences.every((e) => numberOf(e, 70) === 0)).toBe(true)
    expect(layered(dxf, 'GRID-SITE-POOLS', 'LWPOLYLINE')).toHaveLength(1)
    // The tree: its trunk as wide as the 3D views draw it, and its crown across its canopy of 4 m.
    const tree = layered(dxf, 'GRID-SITE-TREES', 'CIRCLE').map((e) => [numberOf(e, 10), numberOf(e, 20), numberOf(e, 40)])
    expect(tree).toEqual([[2, 25, limit('treeDrawnTrunk') / 2], [2, 25, 2]])
  })

  it('draws each massing floor as a closed outline at its floor level, as high as its storey', () => {
    const massed = modelEntities(dxf, 'LWPOLYLINE').filter((e) => e.layer === 'GRID-MASSING')
    expect(massed).toHaveLength(3)
    const risen = massed.map((e) => [Number(valueOf(e, 38) ?? 0), numberOf(e, 39), numberOf(e, 70)])
    // The floors side by side, lowest first: the hall's ground and the shed at 0, the hall's first above.
    expect(risen.map(([, h]) => h)).toEqual(expect.arrayContaining([3, 4]))
    expect(risen.every(([, , closed]) => closed === 1)).toBe(true)
    const first = risen.find(([z]) => z! > 0)!
    expect(first[0]).toBeCloseTo(3 + 0.25, 6)
    expect(first[1]).toBe(3)
  })

  it('draws the site once, on the floor it is drawn on, and lists the layers it uses', () => {
    // The site is drawn on the ground floors, the hall's and the shed's: once, with the first of them.
    expect(layered(dxf, 'GRID-SITE-BOUNDARY')).toHaveLength(1)
    const shed = text(exported(massing(), 'dxf', 'shed-0').data)
    expect(layered(shed, 'GRID-SITE-BOUNDARY')).toHaveLength(1)
    expect(layered(shed, 'GRID-SITE-SETBACKS')).toHaveLength(4)
    const upper = text(exported(massing(), 'dxf', 'hall-1').data)
    expect(layered(upper, 'GRID-SITE-BOUNDARY')).toEqual([])
    expect(layered(upper, 'GRID-MASSING')).toHaveLength(1)
    const layers = readDxf(dxf).tables.get('LAYER')!.records.map((r) => valueOf(r, 2))
    for (const layer of ['GRID-SITE-BOUNDARY', 'GRID-SITE-SETBACKS', 'GRID-SITE-PAVING', 'GRID-SITE-PATHS', 'GRID-SITE-FENCES', 'GRID-SITE-POOLS', 'GRID-SITE-TREES', 'GRID-MASSING']) {
      expect(layers).toContain(layer)
    }
  })

  it('a walled plan draws its site too, and leaves nothing of it out', () => {
    const made = exported(walled(), 'dxf')
    const walledDxf = text(made.data)
    expect(layered(walledDxf, 'GRID-SITE-BOUNDARY')).toHaveLength(1)
    expect(layered(walledDxf, 'GRID-SITE-TREES', 'CIRCLE')).toHaveLength(2)
    expect(layered(walledDxf, 'GRID-SITE-PAVING')).toHaveLength(1)
    // Its floor has walls: its outline is no massing.
    expect(layered(walledDxf, 'GRID-MASSING')).toEqual([])
    expect(made.leftOut).toEqual([])
  })

  it('a plan with no site writes no site layer', () => {
    const plain = text(exported(samplePlan() as FloorPlan, 'dxf').data)
    expect(plain).not.toContain('GRID-SITE-')
    expect(plain).not.toContain('GRID-MASSING')
  })
})

describe('CMD-56: the IFC carries the site and the massing', () => {
  const doc = parseDoc(text(exported(massing(), 'ifc').data))

  it('gives the site the plot as its footprint', () => {
    const [site] = ofType(doc, 'IFCSITE')
    const shape = entity(doc, ref(site!.args[6]))
    const [representation] = refs(shape.args[2]).map((id) => entity(doc, id))
    expect(str(representation!.args[1])).toBe('FootPrint')
    expect(str(representation!.args[2])).toBe('GeometricCurveSet')
    const view = entity(doc, ref(representation!.args[0]))
    expect(view.type).toBe('IFCGEOMETRICREPRESENTATIONSUBCONTEXT')
    expect(str(view.args[0])).toBe('FootPrint')
    const set = entity(doc, refs(representation!.args[3])[0]!)
    const line = entity(doc, refs(set.args[0])[0]!)
    const points = refs(line.args[0]).map((id) => nums(entity(doc, id).args[0]))
    expect(points).toEqual([[0, 0], [40, 0], [40, 30], [0, 30], [0, 0]])
  })

  it('writes one IfcBuilding per building the plan names', () => {
    expect(ofType(doc, 'IFCBUILDING').map((b) => str(b.args[2]))).toEqual(['Hall', 'Shed'])
  })

  it('writes each massing floor as a proxy on its storey, swept up its height', () => {
    const proxies = ofType(doc, 'IFCBUILDINGELEMENTPROXY')
    expect(proxies.map((p) => [str(p.args[2]), str(p.args[4]), str(p.args[7])])).toEqual([
      ['Hall ground massing', 'Massing', 'hall-0'],
      ['Shed ground massing', 'Massing', 'shed-0'],
      ['Hall first massing', 'Massing', 'hall-1'],
    ])
    const solids = ofType(doc, 'IFCEXTRUDEDAREASOLID')
    const depthOf = (proxy: (typeof proxies)[number]): number => {
      const shape = entity(doc, ref(proxy.args[6]))
      const body = entity(doc, refs(shape.args[2])[0]!)
      const solid = entity(doc, refs(body.args[3])[0]!)
      expect(solids).toContain(solid)
      return num(solid.args[3])
    }
    expect(proxies.map(depthOf)).toEqual([3, 4, 3])
    // Each in its storey, by a containment of its own.
    const contained = ofType(doc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE').filter((r) => refs(r.args[4]).some((id) => proxies.some((p) => p.id === id)))
    expect(contained).toHaveLength(3)
    for (const relation of contained) expect(entity(doc, ref(relation.args[5])).type).toBe('IFCBUILDINGSTOREY')
    // Its base quantities: 80 m² on plan, 3 m high, 240 m³, by hand.
    const quantitiesOf = (proxy: (typeof proxies)[number]): Record<string, number> => {
      const relation = ofType(doc, 'IFCRELDEFINESBYPROPERTIES').find((r) => refs(r.args[4]).includes(proxy.id))!
      const set = entity(doc, ref(relation.args[5]))
      expect(str(set.args[2])).toBe('BaseQuantities')
      return Object.fromEntries(refs(set.args[5]).map((id) => entity(doc, id)).map((q) => [str(q.args[0]), num(q.args[3])]))
    }
    expect(proxies.map(quantitiesOf)).toEqual([
      { GrossFootprintArea: 80, Height: 3, GrossVolume: 240 },
      { GrossFootprintArea: 30, Height: 4, GrossVolume: 120 },
      { GrossFootprintArea: 80, Height: 3, GrossVolume: 240 },
    ])
    expect(en(ofType(doc, 'IFCSITE')[0]!.args[8])).toBe('ELEMENT')
  })

  it('names the site things it does not write, in the file and in the answer', () => {
    const made = exported(massing(), 'ifc')
    expect(made.leftOut.map((part) => [part.kind, part.id])).toEqual(THINGS.map((thing) => ['site', thing.id]))
    const values = new Map(ofType(doc, 'IFCPROPERTYSINGLEVALUE').map((v) => [str(v.args[0]), v.args[2]] as const))
    expect(values.get('SiteThings')).toBeDefined()
    expect(text(made.data)).toContain('IFCINTEGER(6)')
    expect(text(made.data)).toMatch(/This file holds no site things: 6 are left out\./)
    // Nothing broken: the note says nothing of parts that cannot be drawn.
    expect(text(made.data)).not.toMatch(/they cannot be drawn/)
  })

  it('a plan with no boundary gives the site no shape', () => {
    const plain = parseDoc(text(exported(samplePlan() as FloorPlan, 'ifc').data))
    expect(ofType(plain, 'IFCSITE')[0]!.args[6]).toEqual({ t: 'null' })
    expect(ofType(plain, 'IFCBUILDINGELEMENTPROXY')).toEqual([])
    expect(ofType(plain, 'IFCGEOMETRICCURVESET')).toEqual([])
  })
})

describe('CMD-56: the other formats and the site things', () => {
  it('the OBJ and a GLB of one floor name them; a GLB of the whole building writes them', () => {
    expect(exported(massing(), 'obj').leftOut.map((part) => part.kind)).toEqual(THINGS.map(() => 'site'))
    expect(exported(massing(), 'glb', 'hall-0').leftOut).toHaveLength(THINGS.length)
    expect(exported(massing(), 'glb').leftOut).toEqual([])
    // A file of a floor the site is not drawn on names none.
    expect(exported(massing(), 'obj', 'hall-1').leftOut).toEqual([])
  })
})
