/**
 * CMD-55: the plan's finishes, types and glazing carried into the 3D files as materials. Before, a
 * plan with oak, tile and paint finishes exported a GLB drawn in the kinds' grey alone, its glazed
 * doors and glass walls opaque, and an IFC that held none of its finishes.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../../types/floorplan'
import { exportPlan } from '../../../export/planExport'
import { buildScene } from '../../scene3d'
import { toGlb } from '../gltf'
import { toObj } from '../obj'
import { liningMesh, planMaterials } from '../surfaces'
import { limit } from '../../tolerances'
import { parseGlb, readMeshes, type Glb } from './glb-reader'

const ids = { projectId: 'p', projectName: 'Finished flat', now: new Date(0) }

/** Two rooms: a kitchen in oak and tile with a feature wall, a hall in paint with a glass wall to the east. */
function finished(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [8, 0], thickness: 0.2, height: 2.5, kind: 'exterior', wallType: 'brick' },
      { id: 'w2', start: [8, 0], end: [8, 3], thickness: 0.1, height: 2.5, kind: 'exterior', wallType: 'curtain' },
      { id: 'w3', start: [8, 3], end: [0, 3], thickness: 0.2, height: 2.5, kind: 'exterior', wallType: 'brick' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior', wallType: 'brick' },
      { id: 'w5', start: [4, 0], end: [4, 3], thickness: 0.1, height: 2.5, kind: 'partition' }
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['w1', 'w5', 'w3', 'w4'], finishes: { floor: 'Oak boards', walls: 'Porcelain tile', ceiling: 'White paint', faces: [{ wall: 'w4', finish: 'Sage paint' }] } },
      { id: 'hall', name: 'Hall', boundary: ['w1', 'w2', 'w3', 'w5'], finishes: { walls: 'White paint' } }
    ],
    openings: [
      { id: 'd1', wall: 'w5', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', doorType: 'glazed' },
      { id: 'd2', wall: 'w3', type: 'door', offset: 5, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', doorType: 'oak' },
      { id: 'n1', wall: 'w1', type: 'window', offset: 1.5, width: 1.2, sill: 0.9, height: 1.2, windowType: 'alu' }
    ],
    types: {
      walls: [{ id: 'brick', name: 'Brick', material: 'Red brick' }, { id: 'curtain', name: 'Curtain wall', glazed: true }],
      doors: [{ id: 'glazed', name: 'Glazed door', glazed: true }, { id: 'oak', name: 'Oak door', material: 'Oak' }],
      windows: [{ id: 'alu', name: 'Aluminium window', material: 'Grey aluminium' }]
    }
  } as FloorPlan
}

type Material = { name: string; alphaMode?: string; doubleSided?: boolean; pbrMetallicRoughness: { baseColorFactor: number[]; metallicFactor: number }; extras?: Record<string, unknown> }
type Node = { name?: string; mesh?: number; extras?: Record<string, unknown> }

/** The plan with no type and no finish named anywhere. */
function plain(plan: FloorPlan): FloorPlan {
  const without = <T extends object>(part: T, keys: readonly string[]): T => Object.fromEntries(Object.entries(part).filter(([key]) => !keys.includes(key))) as T
  return { ...without(plan, ['types']), walls: plan.walls.map((w) => without(w, ['wallType'])), openings: plan.openings.map((o) => without(o, ['doorType', 'windowType'])), rooms: plan.rooms.map((r) => without(r, ['finishes'])) }
}

const glbOf = (plan: FloorPlan): Glb => parseGlb(exportPlan(plan, 'glb', ids).data as Uint8Array)
const materialsOf = (glb: Glb): Material[] => glb.json.materials as Material[]
/** The material a node's mesh is drawn in, by name. */
function materialOfNode(glb: Glb, name: string): Material {
  const node = (glb.json.nodes as Node[]).find((n) => n.name === name)!
  const primitive = glb.json.meshes![node.mesh!]!.primitives[0]!
  return materialsOf(glb)[primitive.material!]!
}

describe('the plan\'s own materials (planMaterials)', () => {
  it('names one material per wall, door and window type, then per finish by name', () => {
    expect(planMaterials(finished()).map((m) => m.name)).toEqual([
      'walltype_brick', 'walltype_curtain', 'doortype_glazed', 'doortype_oak', 'windowtype_alu',
      'finish_Oak_boards', 'finish_Porcelain_tile', 'finish_Sage_paint', 'finish_White_paint'
    ])
  })

  it('reads a colour from the words of its name, and makes a glazed type glass', () => {
    const byName = new Map(planMaterials(finished()).map((m) => [m.name, m] as const))
    expect(byName.get('finish_Oak_boards')!.colour).toEqual([0.784, 0.627, 0.427])
    expect(byName.get('walltype_curtain')!.glass).toBe(true)
    expect(byName.get('doortype_glazed')!.glass).toBe(true)
    expect(byName.get('doortype_oak')!.glass).toBe(false)
    expect(byName.get('walltype_brick')!.opacity).toBe(1)
  })

  it('is empty for a plan with no type and no finish', () => {
    expect(planMaterials(plain(finished()))).toEqual([])
  })
})

describe('a GLB in the plan\'s materials', () => {
  const glb = glbOf(finished())

  it('lists the kinds it uses, then the plan\'s own it uses, each named and not metallic', () => {
    const names = materialsOf(glb).map((m) => m.name)
    expect(names).toEqual(expect.arrayContaining(['walltype_brick', 'walltype_curtain', 'doortype_glazed', 'doortype_oak', 'windowtype_alu', 'finish_Oak_boards', 'finish_Porcelain_tile', 'finish_Sage_paint', 'finish_White_paint', 'ceiling', 'glass']))
    expect(names.indexOf('glass')).toBeLessThan(names.indexOf('walltype_brick'))
    expect(materialsOf(glb).every((m) => m.pbrMetallicRoughness.metallicFactor === 0)).toBe(true)
    expect(materialsOf(glb).find((m) => m.name === 'finish_Oak_boards')!.extras).toEqual({ gridMaterial: 'finish', gridFinish: 'Oak boards' })
    expect(materialsOf(glb).find((m) => m.name === 'walltype_brick')!.extras).toEqual({ gridMaterial: 'wallType', gridType: 'brick', gridTypeName: 'Brick', gridStated: 'Red brick' })
  })

  it('draws a wall in its type, a glazed wall and a glazed door\'s leaves as glass', () => {
    expect(materialOfNode(glb, 'wall_w1').name).toBe('walltype_brick')
    expect(materialOfNode(glb, 'wall_w5').name).toBe('wall')
    const curtain = materialOfNode(glb, 'wall_w2')
    expect(curtain.name).toBe('walltype_curtain')
    expect(curtain.alphaMode).toBe('BLEND')
    expect(curtain.doubleSided).toBe(true)
    expect(curtain.pbrMetallicRoughness.baseColorFactor[3]).toBeLessThan(1)
    const glazedLeaf = materialOfNode(glb, 'leaf_d1')
    expect(glazedLeaf.name).toBe('doortype_glazed')
    expect(glazedLeaf.alphaMode).toBe('BLEND')
    expect(materialOfNode(glb, 'leaf_d2').name).toBe('doortype_oak')
    expect(materialOfNode(glb, 'frame_d2').name).toBe('frame')
    expect(materialOfNode(glb, 'frame_n1').name).toBe('windowtype_alu')
    expect(materialOfNode(glb, 'glass_n1').name).toBe('glass')
  })

  it('draws each room\'s floor in its floor finish, and the kinds\' floor where it names none', () => {
    expect(materialOfNode(glb, 'floor_kitchen').name).toBe('finish_Oak_boards')
    expect(materialOfNode(glb, 'floor_hall').name).toBe('floor')
  })

  it('lines each finished wall face in its finish, a part per room and finish, facing into the room', () => {
    const nodes = glb.json.nodes as Node[]
    const linings = nodes.filter((n) => n.mesh !== undefined && n.extras?.['gridKind'] === 'lining')
    // In the rooms' id order, as the scene lists them.
    expect(linings.map((n) => [n.name, materialOfNode(glb, n.name!).name])).toEqual([
      ['lining_hall', 'finish_White_paint'],
      ['lining_kitchen', 'finish_Porcelain_tile'],
      ['lining_kitchen_2', 'finish_Sage_paint']
    ])
    expect(linings[2]!.extras).toEqual({ gridId: 'kitchen', gridKind: 'lining', gridFloor: 'ground', gridRooms: ['kitchen'], gridFinish: 'Sage paint' })
    // The feature wall w4 runs x = 0, its face at x = 0.1; its lining a hair into the room.
    const sage = readMeshes(glb).find((m) => m.name === 'lining_kitchen_2')!
    for (const p of sage.points) expect(p.x).toBeCloseTo(0.1 + limit('liningOffset'), 6)
  })

  it('gives every room a ceiling, in its ceiling finish or the kinds\' ceiling, facing down', () => {
    expect(materialOfNode(glb, 'ceiling_kitchen').name).toBe('finish_White_paint')
    expect(materialOfNode(glb, 'ceiling_hall').name).toBe('ceiling')
    const ceiling = readMeshes(glb).find((m) => m.name === 'ceiling_kitchen')!
    // glTF is Y up: the ceiling at the room's height, a hair under it.
    for (const p of ceiling.points) expect(p.y).toBeCloseTo(2.5 - limit('liningOffset'), 6)
  })

  it('keeps the kinds alone for a plan with no type and no finish, a ceiling per room among them', () => {
    const bare = glbOf(plain(finished()))
    expect(materialsOf(bare).map((m) => m.name)).toEqual(['wall', 'floor', 'door', 'frame', 'glass', 'slab', 'roof', 'ceiling'])
  })
})

describe('a scene with no plan behind it (toGlb, toObj)', () => {
  it('draws a glazed wall and a glazed door\'s leaves as glass', () => {
    const scene = buildScene(finished())
    expect(scene.walls.find((w) => w.id === 'w2')!.glazed).toBe(true)
    const glb = parseGlb(toGlb(scene))
    expect(materialOfNode(glb, 'wall_w2').name).toBe('glass')
    expect(materialOfNode(glb, 'leaf_d1').name).toBe('glass')
    expect(materialOfNode(glb, 'leaf_d2').name).toBe('door')
    const obj = toObj(scene)
    expect(obj).toMatch(/^o wall_w2\nusemtl glass$/m)
    expect(obj).toMatch(/^o leaf_d1\nusemtl glass$/m)
  })
})

describe('an OBJ in the plan\'s materials', () => {
  const made = exportPlan(finished(), 'obj', ids)
  const obj = made.data as string

  it('names each part\'s material after its object, and grid.mtl holds every one of them', () => {
    expect(obj).toMatch(/^o wall_w1\nusemtl walltype_brick$/m)
    expect(obj).toMatch(/^o floor_kitchen\nusemtl finish_Oak_boards$/m)
    expect(obj).toMatch(/^o lining_kitchen_2\nusemtl finish_Sage_paint$/m)
    expect(obj).toMatch(/^o ceiling_hall\nusemtl ceiling$/m)
    expect(obj).toMatch(/^o leaf_d1\nusemtl doortype_glazed$/m)
    const used = new Set(obj.split('\n').filter((l) => l.startsWith('usemtl ')).map((l) => l.slice(7)))
    const defined = new Set(made.materials!.split('\n').filter((l) => l.startsWith('newmtl ')).map((l) => l.slice(7)))
    for (const name of used) expect(defined.has(name), name).toBe(true)
    expect(made.materials).toMatch(/newmtl walltype_curtain\n.*\nKd 0\.700 0\.820 0\.900\n.*\nd 0\.350/)
  })
})

describe('a lining (liningMesh)', () => {
  it('faces the room on the left of its side, open over its holes', () => {
    const mesh = liningMesh({ room: 'r', wall: 'w', finish: 'Paint', band: false, from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, bottom: 0, top: 2.5, holes: [{ along: [1, 2], rise: [0, 2] }] })!
    let area = 0
    for (const [a, b, c] of mesh.faces) {
      const [p, q, r] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
      // Its normal's y: the room lies toward +y, left of a side running +x.
      const ny = (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z)
      expect(ny).toBeGreaterThan(0)
      area += ny / 2
    }
    expect(area).toBeCloseTo(4 * 2.5 - 1 * 2, 6)
  })
})
