/**
 * VEW-73: what a game engine, a renderer or a headset needs from a GLB before it draws it well:
 * flat normals, texture coordinates in metres, a material named by each part's kind, room floors
 * off the slab, and, for the OBJ, the same materials in `grid.mtl`.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../plan'
import { buildScene } from '../../scene3d'
import { tolerance } from '../../tolerances'
import { boxUv, toGlb } from '../gltf'
import { MESH_MATERIALS } from '../mesh'
import { OBJ_MATERIALS_FILE, toMtl, toObj } from '../obj'
import { parseGlb, readAccessor, rotated, samplePlan, type Glb } from './glb-reader'

interface Primitive {
  readonly attributes: Record<string, number>
  readonly indices?: number
  readonly material?: number
}

const primitivesOf = (glb: Glb): { name: string; primitive: Primitive }[] =>
  (glb.json.meshes as { name: string; primitives: Primitive[] }[]).map((mesh) => ({ name: mesh.name, primitive: mesh.primitives[0]! }))

type V = readonly [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

for (const [label, plan] of [['the sample room', samplePlan()], ['the sample room turned off the axes', rotated(samplePlan(), 0.6435)]] as const) {
  describe(`normals and texture coordinates: ${label}`, () => {
    const glb = parseGlb(toGlb(buildScene(plan)))

    it('gives every primitive a normal and a UV for every point', () => {
      for (const { name, primitive } of primitivesOf(glb)) {
        const count = (glb.json.accessors![primitive.attributes['POSITION']!] as { count: number }).count
        expect(Object.keys(primitive.attributes), name).toEqual(['POSITION', 'NORMAL', 'TEXCOORD_0'])
        expect((glb.json.accessors![primitive.attributes['NORMAL']!] as { count: number; type: string }).count).toBe(count)
        expect((glb.json.accessors![primitive.attributes['TEXCOORD_0']!] as { type: string }).type).toBe('VEC2')
        expect((glb.json.accessors![primitive.attributes['TEXCOORD_0']!] as { count: number }).count).toBe(count)
      }
    })

    it('writes flat normals: unit length, and the normal of every face it is a corner of', () => {
      for (const { name, primitive } of primitivesOf(glb)) {
        const points = readAccessor(glb, primitive.attributes['POSITION']!) as unknown as V[]
        const normals = readAccessor(glb, primitive.attributes['NORMAL']!) as unknown as V[]
        const indices = readAccessor(glb, primitive.indices!).map((row) => row[0]!)
        for (const n of normals) expect(Math.hypot(...n), name).toBeCloseTo(1, 5)
        for (let i = 0; i < indices.length; i += 3) {
          const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!]
          const face = cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!))
          const size = Math.hypot(...face)
          if (size < 1e-9) continue
          for (const k of [a, b, c]) expect(dot(face, normals[k]!) / size, name).toBeCloseTo(1, 4)
        }
      }
    })

    it('projects UVs from the axis each face is nearest, in metres', () => {
      for (const { primitive } of primitivesOf(glb)) {
        const points = readAccessor(glb, primitive.attributes['POSITION']!) as unknown as V[]
        const normals = readAccessor(glb, primitive.attributes['NORMAL']!) as unknown as V[]
        const uvs = readAccessor(glb, primitive.attributes['TEXCOORD_0']!)
        for (const [k, [x, up, z]] of points.entries()) {
          // Back to the model's frame: glTF (x, up, z) is the plan's (x, -z, up).
          const [nx, nup, nz] = normals[k]!
          const [u, v] = boxUv({ x, y: -z, z: up }, { x: nx, y: -nz, z: nup })
          expect(uvs[k]![0]).toBeCloseTo(u, 4)
          expect(uvs[k]![1]).toBeCloseTo(v, 4)
        }
      }
    })
  })
}

describe('box projection', () => {
  it('is metres on the plan for a floor seen from above, north up the picture', () => {
    expect(boxUv({ x: 2, y: 3, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual([2, -3])
  })

  it('stands a texture upright on a wall, running to the right seen from outside', () => {
    // A wall facing south (-y): seen from the south, x runs to the right.
    expect(boxUv({ x: 1.5, y: 0, z: 2 }, { x: 0, y: -1, z: 0 })).toEqual([1.5, -2])
    // Facing north (+y): seen from the north, x runs to the left.
    expect(boxUv({ x: 1.5, y: 0, z: 2 }, { x: 0, y: 1, z: 0 })).toEqual([-1.5, -2])
    // Facing east (+x): y runs to the right.
    expect(boxUv({ x: 0, y: 4, z: 1 }, { x: 1, y: 0, z: 0 })).toEqual([4, -1])
  })
})

describe('materials by kind', () => {
  const glb = parseGlb(toGlb(buildScene(samplePlan())))
  const materials = glb.json.materials as { name: string }[]

  it('names a material for each kind the file holds, in the one order, and nothing else', () => {
    const order = MESH_MATERIALS.map((m) => m.name as string)
    const names = materials.map((m) => m.name)
    expect(names).toEqual(order.filter((name) => names.includes(name)))
    expect(names).toEqual(expect.arrayContaining(['wall', 'floor', 'door', 'frame', 'glass', 'slab', 'roof']))
  })

  it('draws each part in its kind: walls in wall, door leaves in door, the roof in roof', () => {
    const named = new Map(primitivesOf(glb).map(({ name, primitive }) => [name, materials[primitive.material!]!.name]))
    expect(named.get('wall_w1')).toBe('wall')
    expect(named.get('floor_r1')).toBe('floor')
    expect(named.get('leaf_o1')).toBe('door')
    expect(named.get('frame_o1')).toBe('frame')
    expect(named.get('glass_o2')).toBe('glass')
    expect(named.get('slab_ground')).toBe('slab')
    expect(named.get('roof_ground')).toBe('roof')
  })

  it('gives the same bytes for the same scene', () => {
    expect(toGlb(buildScene(samplePlan()))).toEqual(toGlb(buildScene(samplePlan())))
  })
})

describe('room floors off the slab', () => {
  it('lifts every room floor above the top of the slab it stands on', () => {
    const glb = parseGlb(toGlb(buildScene(samplePlan())))
    const ys = (name: string): number[] => {
      const { primitive } = primitivesOf(glb).find((p) => p.name === name)!
      return readAccessor(glb, primitive.attributes['POSITION']!).map((p) => p[1]!)
    }
    const slabTop = Math.max(...ys('slab_ground'))
    expect(Math.min(...ys('floor_r1'))).toBeCloseTo(slabTop + tolerance('floorLift'), 6)
    expect(Math.min(...ys('floor_r1'))).toBeGreaterThan(slabTop)
  })
})

describe('the OBJ names the same materials', () => {
  const plan: FloorPlan = samplePlan()
  const text = toObj(buildScene(plan))

  it('names grid.mtl, and a material for every object, right after it', () => {
    const lines = text.split('\n')
    expect(lines.filter((line) => line.startsWith('mtllib '))).toEqual([`mtllib ${OBJ_MATERIALS_FILE}`])
    lines.forEach((line, i) => {
      if (line.startsWith('o ')) expect(lines[i + 1]).toMatch(/^usemtl [a-z]+$/)
    })
    expect(lines[lines.indexOf('o wall_w1') + 1]).toBe('usemtl wall')
    expect(lines[lines.indexOf('o leaf_o1') + 1]).toBe('usemtl door')
  })

  it('writes every material it uses into grid.mtl, glass seen through', () => {
    const mtl = toMtl()
    const declared = [...mtl.matchAll(/^newmtl (\S+)$/gm)].map((m) => m[1])
    const used = new Set([...text.matchAll(/^usemtl (\S+)$/gm)].map((m) => m[1]))
    for (const name of used) expect(declared).toContain(name)
    expect(mtl).toMatch(/newmtl glass\nKa [^\n]+\nKd [^\n]+\nKs [^\n]+\nd 0\.350/)
    expect(toMtl()).toBe(mtl)
  })
})
