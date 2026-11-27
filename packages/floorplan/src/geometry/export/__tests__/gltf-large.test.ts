import { describe, expect, it, vi } from 'vitest'
import type { Scene3D } from '../../scene3d'
import { toGlb } from '../gltf'
import { parseGlb, readMeshes } from './glb-reader'

/**
 * A mesh with more than 65,535 vertices, which a 16-bit index would wrap.
 *
 * Triangulating such a polygon for real takes minutes (the cost grows with the
 * square of the vertex count), so the mesh builder is replaced by one that
 * returns a big mesh at once. What is under test is the writer: that every index
 * survives into the file.
 */

const COUNT = 70_000

vi.mock('../mesh', async (original) => {
  const real = await original<typeof import('../mesh')>()
  return {
    ...real,
    floorMesh: () => ({
      // VEW-73: round a circle, so every face of the fan faces up and the writer, which writes a
      // point once per normal it carries, keeps one point each.
      points: Array.from({ length: COUNT }, (_, i) => ({ x: 100 * Math.cos((2 * Math.PI * i) / COUNT), y: 100 * Math.sin((2 * Math.PI * i) / COUNT), z: 0 })),
      // A fan over every vertex, so indices 65,535 and above are all used.
      faces: Array.from({ length: COUNT - 2 }, (_, i) => [0, i + 1, i + 2] as const)
    })
  }
})

describe('a mesh with more than 65,535 vertices', () => {
  const scene: Scene3D = {
    walls: [],
    openings: [],
    slabs: [{ roomId: 'big', name: 'Big', polygon: [], holes: [] }],
    dividers: [],
    stairs: [],
    shell: null,
    bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, width: 1, height: 1 },
    height: 0,
    issues: []
  }

  it('keeps every index, with none wrapped', () => {
    const glb = parseGlb(toGlb(scene))
    const [mesh] = readMeshes(glb)

    // VEW-73: a point is written once per normal it carries, so a sliver whose 32-bit normal
    // differs may add a point; every triangle still lands on the points it was given.
    expect(mesh!.points.length).toBeGreaterThanOrEqual(COUNT)
    expect(mesh!.triangles).toHaveLength(COUNT - 2)
    expect(mesh!.triangles.reduce((top, t) => Math.max(top, ...t), 0)).toBeGreaterThanOrEqual(COUNT - 1)
    const at = (i: number): [number, number, number] => {
      const angle = (2 * Math.PI * i) / COUNT
      return [Math.fround(100 * Math.cos(angle)), 0, Math.fround(0 - Math.fround(100 * Math.sin(angle)))]
    }
    mesh!.triangles.forEach((triangle, i) => {
      const got = triangle.map((k) => mesh!.points[k]!).map((p) => [p.x, p.y, p.z])
      expect(got).toEqual([at(0), at(i + 1), at(i + 2)])
    })
  })

  it('stores them as 32-bit unsigned integers', () => {
    const glb = parseGlb(toGlb(scene))
    const primitive = glb.json.meshes![0]!.primitives[0]!
    expect(glb.json.accessors![primitive.indices!]!.componentType).toBe(5125)
  })
})
