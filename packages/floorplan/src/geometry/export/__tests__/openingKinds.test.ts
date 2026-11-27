/**
 * CNT-14 (done when 3): the 3D files show each door's and window's glass, frame and leaves, the
 * leaves hung from the face of the wall the door opens toward, and the IFC types them by kind.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '../../plan'
import { buildScene } from '../../scene3d'
import { toObj } from '../obj'
import { toGlb } from '../gltf'
import { toIfc } from '../ifc'
import { DXF_LAYERS, toDxf } from '../dxf'
import { buildFloorPlan } from '../../floorplan'
import { openingSymbol } from '../../openingSymbol'
import type { Vec2 } from '../../vec2'
import { DOOR_KINDS, WINDOW_KINDS } from '../../../types/floorplan'
import { parseGlb, readMeshes } from './glb-reader'
import { dxfProblems, readDxf, valueOf, worldShapes, type Shape } from './dxf-reader'
import { en, entity, ofType, parseDoc, ref, refs, str } from './step-reader'

/** One 6 m wall along +x, 0.3 m thick, with a door opening north (to its left face) and a window. */
function plan(door: Partial<Opening> = {}, window: Partial<Opening> = {}): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [{ id: 'w', start: [0, 0], end: [6, 0], thickness: 0.3, height: 2.7, kind: 'exterior' }],
    rooms: [],
    openings: [
      { id: 'd', wall: 'w', type: 'door', offset: 0.5, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', ...door },
      { id: 'win', wall: 'w', type: 'window', offset: 3, width: 1.2, sill: 0.9, height: 1.2, ...window }
    ]
  } as FloorPlan
}

describe('OBJ and GLB', () => {
  it('hold each door\'s frame and leaf and each window\'s frame and glass, as objects of their own', () => {
    const obj = toObj(buildScene(plan()))
    const objects = obj.split('\n').filter((line) => line.startsWith('o ')).map((line) => line.slice(2))
    expect(objects).toEqual(['wall_w', 'frame_d', 'leaf_d', 'frame_win', 'glass_win'])
  })

  it('hangs the door\'s leaf from the face of the wall it opens toward, in the GLB as in the scene', () => {
    for (const [swing, face] of [['left', 0.15], ['right', -0.15]] as const) {
      const meshes = readMeshes(parseGlb(toGlb(buildScene(plan({ swing })))))
      const leaf = meshes.find((m) => m.name === 'leaf_d')!
      // glTF is Y up: plan y is -z.
      const ys = leaf.points.map((p) => -p.z)
      expect(swing === 'left' ? Math.max(...ys) : Math.min(...ys)).toBeCloseTo(face, 6)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.04, 6)
    }
  })

  it('draws the glass in a material of its own, seen through, and writes none when there is no glass', () => {
    const glb = parseGlb(toGlb(buildScene(plan())))
    const materials = glb.json.materials as { name?: string; alphaMode?: string }[]
    const glass = (glb.json.meshes as { name?: string; primitives: { material?: number }[] }[]).find((m) => m.name === 'glass_win')!
    expect(materials[glass.primitives[0]!.material!]).toMatchObject({ name: 'glass', alphaMode: 'BLEND' })
    // VEW-73: every other material is its kind's, and none is seen through.
    for (const material of materials) if (material.name !== 'glass') expect(material.alphaMode).toBeUndefined()
    const noWindow = { ...plan(), openings: [plan().openings[0]!] }
    const left = parseGlb(toGlb(buildScene(noWindow))).json.materials as { name?: string }[]
    expect(left.map((m) => m.name)).not.toContain('glass')
  })

  it('gives a pair two leaves, a sliding door two leaves in the wall, and a fixed window glass with no sash', () => {
    const leaves = (door: Partial<Opening>): number => buildScene(plan(door)).openings[0]!.parts.filter((p) => p.part === 'leaf').length
    expect(leaves({ width: 1.6, kind: 'double' })).toBe(2)
    expect(leaves({ width: 2.4, kind: 'sliding' })).toBe(2)
    const fixed = buildScene(plan({}, { kind: 'fixed' })).openings[1]!
    expect(fixed.parts.map((p) => p.part)).toEqual(['frame', 'frame', 'frame', 'frame', 'glass'])
  })
})

describe('IFC', () => {
  const doc = (p: FloorPlan) => parseDoc(toIfc(p, { projectId: 'kinds', projectName: 'Kinds', timestamp: new Date('2026-11-22T00:00:00Z') }))

  it('fills a window with its frame and glass, the glass styled as glass', () => {
    const d = doc(plan())
    const window = ofType(d, 'IFCWINDOW')[0]!
    const shape = entity(d, ref(window.args[6]))
    const body = entity(d, refs(shape.args[2])[0]!)
    const solids = refs(body.args[3])
    // Its frame (two jambs, a head, a sill), a sash's four members and its glass.
    expect(solids).toHaveLength(9)
    const styled = ofType(d, 'IFCSTYLEDITEM').map((s) => ref(s.args[0]))
    expect(styled).toEqual([solids[8]])
    expect(str(ofType(d, 'IFCSURFACESTYLE')[0]!.args[0])).toBe('Glass')
  })

  it('types a door by its kind, size and handing, tagged as the estimate keys it (lab AC-13)', () => {
    const d = doc(plan({ width: 2.2, kind: 'sliding', hinge: undefined, swing: undefined }, { kind: 'fixed' }))
    const door = ofType(d, 'IFCDOORSTYLE')[0]!
    expect(str(door.args[2])).toBe('Door 2.2 x 2.1 m, sliding, two leaves')
    expect(str(door.args[7])).toBe('door:sliding:2.2x2.1')
    expect(en(door.args[8])).toBe('DOUBLE_DOOR_SLIDING')
    const window = ofType(d, 'IFCWINDOWSTYLE')[0]!
    expect([str(window.args[2]), str(window.args[7]), en(window.args[9])]).toEqual(['Window 1.2 x 1.2 m, fixed', 'window:fixed:1.2x1.2', 'SINGLE_PANEL'])
    const roller = ofType(doc(plan({ width: 3, kind: 'roller' })), 'IFCDOORSTYLE')[0]!
    expect([str(roller.args[2]), en(roller.args[8])]).toEqual(['Door 3 x 2.1 m, roller, rolling up', 'ROLLINGUP'])
    // A door that states no kind is typed as before.
    expect(str(ofType(doc(plan()), 'IFCDOORSTYLE')[0]!.args[7])).toBe('door:0.9x2.1')
  })
})

describe('DXF', () => {
  it('writes a kind\'s symbol, and what lies above the cut on a dashed layer of its own; a plan with no kind as before', () => {
    const before = toDxf(buildFloorPlan(plan()))
    expect(before).not.toContain('GRID-OPENINGS-ABOVE')
    const garage = toDxf(buildFloorPlan(plan({ width: 2.4, kind: 'garage', hinge: undefined })))
    expect(garage).toContain('GRID-OPENINGS-ABOVE')
    // No swing arc for a garage door.
    expect(garage.split('\n').filter((line) => line.trim() === 'ARC')).toHaveLength(0)
  })

  // After merging HND-1: each symbol is a block, inserted and turned on its wall as HND-1's doors
  // are, so what a drafter sees must still be where the core's symbol puts it.
  const near = (a: Vec2, b: Vec2): boolean => Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5
  const sameAngle = (a: number, b: number): boolean => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 1e-4
  const deg = (c: Vec2, p: Vec2): number => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI

  /** One wall at `angle` degrees (drawn the other way when `reversed`), with one door or window of a kind on it. */
  function kinded(opening: Partial<Opening>, angle = 0, reversed = false): FloorPlan {
    const r = (angle * Math.PI) / 180
    const end: [number, number] = [6 * Math.cos(r), 6 * Math.sin(r)]
    return {
      version: '1',
      units: 'm',
      walls: [{ id: 'w', start: reversed ? end : [0, 0], end: reversed ? [0, 0] : end, thickness: 0.3, height: 2.7, kind: 'exterior' }],
      rooms: [],
      openings: [{ id: 'o', wall: 'w', type: 'door', offset: 1, width: 2.4, sill: 0, height: 2.1, ...opening }]
    } as FloorPlan
  }

  /** Each line and arc of the core's symbol (but its jambs, which the wall's outline draws) is in the file where the core puts it, on its layer. */
  function expectSymbolInPlace(plan: FloorPlan): void {
    const drawing = buildFloorPlan(plan)
    const opening = drawing.openings[0]!
    const symbol = openingSymbol(opening)!
    const dxf = toDxf(drawing)
    expect(dxfProblems(dxf)).toEqual([])
    const shapes = worldShapes(dxf).filter((shape) => shape.block !== null && /^GRID-(DOOR|WINDOW)-/.test(shape.block))
    const on = opening.type === 'door' ? DXF_LAYERS.doors : DXF_LAYERS.windows
    for (const piece of symbol.pieces) {
      if (piece.shape === 'arc') {
        const [start, end] = piece.counterClockwise ? [piece.far, piece.tip] : [piece.tip, piece.far]
        const hit = shapes.find((s: Shape) => s.type === 'ARC' && near(s.arc!.center, piece.center) && Math.abs(s.arc!.radius - piece.radius) < 1e-6 && sameAngle(s.arc!.start, deg(piece.center, start)) && sameAngle(s.arc!.end, deg(piece.center, end)))
        expect(hit?.layer, `arc of ${JSON.stringify(plan.openings[0])}`).toBe(DXF_LAYERS.doorSwings)
        continue
      }
      if (piece.part === 'jamb') continue
      const layer = piece.above ? DXF_LAYERS.openingsAbove : opening.type === 'door' && piece.part === 'leaf' ? DXF_LAYERS.doorSwings : on
      const hit = shapes.find((s) => s.type === 'LINE' && s.layer === layer && ((near(s.points[0]!, piece.from) && near(s.points[1]!, piece.to)) || (near(s.points[0]!, piece.to) && near(s.points[1]!, piece.from))))
      expect(hit, `${piece.part}${piece.above ? ' above' : ''} of ${JSON.stringify(plan.openings[0])} at ${JSON.stringify(plan.walls[0])}`).toBeDefined()
    }
  }

  it('puts every door kind\'s symbol where the core draws it, whichever jamb and face, on a wall at any angle (HND-1\'s blocks)', () => {
    for (const kind of DOOR_KINDS) {
      for (const hinge of ['start', 'end'] as const) {
        for (const swing of ['left', 'right'] as const) {
          for (const [angle, reversed] of [[0, false], [90, false], [210, false], [33, true]] as const) {
            expectSymbolInPlace(kinded({ kind, hinge, swing, ...(kind === 'single' || kind === 'double' || kind === 'folding' ? { opens: { width: 1.5 } } : {}) }, angle, reversed))
          }
        }
      }
    }
  })

  it('puts every window kind\'s symbol where the core draws it, on a wall at any angle', () => {
    for (const kind of WINDOW_KINDS) {
      for (const hinge of ['start', 'end'] as const) {
        for (const [angle, reversed] of [[0, false], [120, false], [300, true]] as const) {
          expectSymbolInPlace(kinded({ type: 'window', kind, hinge, sill: 0.9, height: 1.2, ...(kind === 'double' ? { opens: { width: 1.4 } } : {}) }, angle, reversed))
        }
      }
    }
  })

  it('makes one block per symbol, named by its kind, and lists the dashed layer with its pen only when a symbol has a line above the cut', () => {
    const two = kinded({ kind: 'sliding', hinge: undefined, swing: undefined })
    two.openings.push({ ...two.openings[0]!, id: 'o2', offset: 3.5 } as Opening)
    const dxf = toDxf(buildFloorPlan(two))
    const doc = readDxf(dxf)
    expect(doc.blocks.map((b) => b.name).filter((n) => n.startsWith('GRID-DOOR'))).toEqual(['GRID-DOOR-SLIDING-2400x2100-W300'])
    expect(doc.entities.filter((e) => e.type === 'INSERT' && valueOf(e, 2) === 'GRID-DOOR-SLIDING-2400x2100-W300')).toHaveLength(2)
    // A sliding door's leaves are all in the cut: no dashed layer.
    expect(doc.tables.get('LAYER')!.records.map((r) => valueOf(r, 2))).not.toContain(DXF_LAYERS.openingsAbove)

    const pocket = readDxf(toDxf(buildFloorPlan(kinded({ kind: 'pocket', hinge: 'end', swing: 'left' }))))
    expect(pocket.blocks.map((b) => b.name)).toContain('GRID-DOOR-POCKET-2400x2100-W300-LH')
    const layer = pocket.tables.get('LAYER')!.records.find((r) => valueOf(r, 2) === DXF_LAYERS.openingsAbove)!
    expect([valueOf(layer, 6), valueOf(layer, 370)]).toEqual(['DASHED', '18'])
    // HND-1's layer order: right after the doorless openings.
    const names = pocket.tables.get('LAYER')!.records.map((r) => valueOf(r, 2))
    expect(names.indexOf(DXF_LAYERS.openingsAbove)).toBeGreaterThan(names.indexOf(DXF_LAYERS.doorSwings))
    expect(pocket.tables.get('LTYPE')!.records.map((r) => valueOf(r, 2))).toContain('DASHED')

    // A door that states the kind of one leaf and no part is HND-1's door block, as before.
    const single = readDxf(toDxf(buildFloorPlan(kinded({ width: 0.9, kind: 'single', hinge: 'start', swing: 'left' }))))
    expect(single.blocks.map((b) => b.name)).toContain('GRID-DOOR-900x2100-W300-RH')
  })
})

