import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FloorPlan } from '../../plan'
import { buildScene, elevationArea } from '../../scene3d'
import { indexPlan } from '../../plan'
import { roomPolygon } from '../../room'
import { area } from '../../vec2'
import { toGlb } from '../gltf'
import { toObj } from '../obj'
import { tolerance } from '../../tolerances'
import type { Vec3 } from '../../scene3d'
import type { ReadMesh } from './glb-reader'
import { emptyPlan, parseGlb, readAccessor, readMeshes, rotated, samplePlan } from './glb-reader'

/**
 * glTF export.
 *
 * The exporter is fed `Scene3D`, the same data Canvas3D draws, so what is
 * checked here is the file. The reading side lives in `glb-reader.ts` and
 * shares nothing with the writer: a strict GLB reader, then geometry measured
 * straight off the triangles in the exported Y-up frame.
 */

/** CNT-14: the doors' and windows' parts, as the exporters name them, after the stairs. */
const openingNames = (scene: ReturnType<typeof buildScene>): string[] =>
  scene.openings.flatMap((o) => (['frame', 'leaf', 'glass'] as const).filter((part) => o.parts.some((p) => p.part === part)).map((part) => `${part}_${o.id}`))

describe('the container', () => {
  it('exports an empty scene as a valid GLB with no geometry', () => {
    const bytes = toGlb(buildScene(emptyPlan()))
    expect(bytes).toBeInstanceOf(Uint8Array)

    // parseGlb checks the magic, the version, the header length, 4-byte chunks,
    // the space padding of the JSON chunk and that no buffer is left dangling.
    const glb = parseGlb(bytes)
    expect(glb.json.asset.version).toBe('2.0')
    expect(glb.json.scene).toBe(0)
    expect(glb.json.scenes).toHaveLength(1)
    expect(glb.json.scenes![0]!.nodes ?? []).toHaveLength(0)
    expect(glb.bin).toBeNull()
    expect(glb.chunkLengths).toHaveLength(1)
    for (const key of ['buffers', 'bufferViews', 'accessors', 'meshes', 'nodes', 'materials']) {
      expect((glb.json as unknown as Record<string, unknown>)[key]).toBeUndefined()
    }
  })

  it('pads the JSON chunk with spaces to a multiple of 4', () => {
    const bytes = toGlb(buildScene(emptyPlan()))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const jsonLength = view.getUint32(12, true)
    expect(jsonLength % 4).toBe(0)
    expect(bytes.byteLength).toBe(12 + 8 + jsonLength)
    const last = bytes[bytes.byteLength - 1]
    expect(last === 0x7d || last === 0x20).toBe(true) // "}" or a space, never a NUL
  })
})

describe('determinism', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives the same bytes for the same scene', () => {
    const a = toGlb(buildScene(samplePlan()))
    const b = toGlb(buildScene(samplePlan()))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('does not read the clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    const early = toGlb(buildScene(samplePlan()))
    vi.setSystemTime(new Date('2031-12-31T23:59:59Z'))
    const late = toGlb(buildScene(samplePlan()))
    expect(Buffer.from(early).equals(Buffer.from(late))).toBe(true)
  })

  it('writes no date or version-dependent text', () => {
    const glb = parseGlb(toGlb(buildScene(samplePlan())))
    const text = JSON.stringify(glb.json)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    // MSG-3: `extras` holds the label, and nothing that changes from run to run.
    expect(Object.keys(glb.json.asset).sort()).toEqual(['extras', 'generator', 'version'])
    expect(glb.json.asset.generator).toBe('Grid')
  })
})

describe('nodes', () => {
  const realPlan: FloorPlan = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../fixtures/floor-plan.json'), 'utf8')
  )

  it('writes one named node with one mesh per wall and per slab', () => {
    const scene = buildScene(realPlan)
    expect(scene.walls).toHaveLength(5)
    expect(scene.slabs).toHaveLength(3)

    const glb = parseGlb(toGlb(scene))
    const meshes = readMeshes(glb)
    // LVL-4: and the floor's slab and its roof, last. CNT-14: the doors' and windows' parts before them.
    const parts = openingNames(scene)
    expect(parts.length).toBeGreaterThan(0)
    expect(meshes).toHaveLength(10 + parts.length)
    expect(meshes.filter((m) => m.name.startsWith('wall_'))).toHaveLength(5)
    expect(meshes.filter((m) => m.name.startsWith('floor_'))).toHaveLength(3)
    expect(meshes.map((m) => m.name)).toEqual([
      ...scene.walls.map((w) => `wall_${w.id}`),
      ...scene.slabs.map((s) => `floor_${s.roomId}`),
      ...parts,
      'slab_ground',
      'roof_ground'
    ])
    for (const node of glb.json.nodes!) {
      expect(glb.json.meshes![node.mesh!]!.primitives).toHaveLength(1)
    }
    expect(glb.json.meshes).toHaveLength(10 + parts.length)
  })

  it('names nodes with letters, digits, underscore, dot and dash only, and uniquely', () => {
    const glb = parseGlb(toGlb(buildScene(samplePlan())))
    const names = readMeshes(glb).map((m) => m.name)
    // CNT-14: the door's, the doorless opening's (none) and the window's parts.
    expect(names).toEqual(['wall_w1', 'wall_w2', 'wall_w3', 'wall_w4', 'floor_r1', 'frame_o1', 'leaf_o1', 'frame_o2', 'glass_o2', 'frame_o3', 'leaf_o3', 'slab_ground', 'roof_ground'])
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9_.-]+$/)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps hostile or colliding ids from breaking the file or the names', () => {
    const plan = samplePlan()
    // Since MSG-6 a blank id, and ids alike but for spaces ('a b' and 'a\nb'), are refused and the
    // part skipped, so these four are all distinct.
    const ids = ['a b', 'a/b', 'x"}{', '#', 'a_b']
    plan.walls = plan.walls.map((wall, i) => ({ ...wall, id: ids[i] ?? wall.id }))
    plan.openings = []
    plan.rooms = []

    // parseGlb throws if the JSON is not well formed.
    const names = readMeshes(parseGlb(toGlb(buildScene(plan)))).map((m) => m.name)
    // The four walls, and the slab and roof their outline carries (LVL-4).
    expect(names).toHaveLength(6)
    expect(new Set(names).size).toBe(6)
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9_.-]+$/)
    expect(names.slice(0, 2)).toEqual(['wall_a_b', 'wall_a_b_2'])
  })
})

// ---------------------------------------------------------------------------
// Measuring the exported geometry, in the file's own frame (Y up)
// ---------------------------------------------------------------------------

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const crossV = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})
const dotV = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

/** Signed volume by the divergence theorem: positive when the faces point outward. */
function volume(mesh: ReadMesh): number {
  let sum = 0
  for (const [a, b, c] of mesh.triangles) {
    sum += dotV(mesh.points[a]!, crossV(mesh.points[b]!, mesh.points[c]!)) / 6
  }
  return sum
}

function extent(mesh: ReadMesh) {
  const range = (pick: (v: Vec3) => number): [number, number] => {
    const values = mesh.points.map(pick)
    return [Math.min(...values), Math.max(...values)]
  }
  return { x: range((v) => v.x), y: range((v) => v.y), z: range((v) => v.z) }
}

const meshOf = (plan: FloorPlan, name: string): ReadMesh =>
  readMeshes(parseGlb(toGlb(buildScene(plan)))).find((m) => m.name === name)!

describe('axes and units', () => {
  const wallPlan = (start: [number, number], end: [number, number]): FloorPlan => ({
    ...emptyPlan(),
    walls: [{ id: 'w', start, end, thickness: 0.2, height: 2.7, kind: 'exterior' }]
  })

  it('writes metres: a wall 4 m long and 2.7 m high spans 4 and 2.7', () => {
    const box = extent(meshOf(wallPlan([0, 0], [4, 0]), 'wall_w'))
    expect(box.x[1] - box.x[0]).toBeCloseTo(4, 5)
    expect(box.y[1] - box.y[0]).toBeCloseTo(2.7, 5)
    expect(box.z[1] - box.z[0]).toBeCloseTo(0.2, 5)
  })

  it('puts the plan height on Y and the plan forward direction on -Z', () => {
    // 3 m forward (+Y on the plan), from height 0 up to 2.7 m.
    const box = extent(meshOf(wallPlan([0, 0], [0, 3]), 'wall_w'))
    expect(box.y[0]).toBeCloseTo(0, 5)
    expect(box.y[1]).toBeCloseTo(2.7, 5)
    expect(box.z[0]).toBeCloseTo(-3, 5)
    expect(box.z[1]).toBeCloseTo(0, 5)
    expect(box.x[0]).toBeCloseTo(-0.1, 5)
    expect(box.x[1]).toBeCloseTo(0.1, 5)
  })

  it('keeps plan X on X', () => {
    const box = extent(meshOf(wallPlan([1, 0], [5, 0]), 'wall_w'))
    expect(box.x[0]).toBeCloseTo(1, 5)
    expect(box.x[1]).toBeCloseTo(5, 5)
  })

  it('turns the model instead of mirroring it: every wall has a positive volume', () => {
    // A reflection such as (x, z, y) keeps every bounding box of a symmetric
    // test and still turns the solid inside out; the signed volume does not lie.
    for (const mesh of readMeshes(parseGlb(toGlb(buildScene(samplePlan()))))) {
      if (!mesh.name.startsWith('wall_')) continue
      expect(volume(mesh)).toBeGreaterThan(0)
    }
  })

  it('writes the up axis of the plan as Y for a slab too', () => {
    const slab = meshOf(samplePlan(), 'floor_r1')
    const box = extent(slab)
    // VEW-73: lifted off the slab it stands on.
    expect(box.y[0]).toBeCloseTo(tolerance('floorLift'), 5)
    expect(box.y[1]).toBeCloseTo(tolerance('floorLift'), 5)
    // Inner faces sit half a wall (0.1 m) inside the 3 m the walls are apart.
    expect(box.z[0]).toBeCloseTo(-2.9, 5)
    expect(box.z[1]).toBeCloseTo(-0.1, 5)
  })
})

describe('accessors', () => {
  it('declares bounds equal to the 32-bit values actually stored', () => {
    // 0.1 is not a 32-bit float: bounds taken from the 64-bit original would
    // disagree with the data in the last digit, and a validator checks it.
    const glb = parseGlb(toGlb(buildScene(samplePlan())))
    const positions = glb.json.meshes!.map((m) => m.primitives[0]!.attributes.POSITION!)
    // Seven, and since CNT-14 the six of the doors' and window's parts.
    expect(positions).toHaveLength(13)
    for (const index of positions) {
      const rows = readAccessor(glb, index)
      const accessor = glb.json.accessors![index]!
      const lo = [0, 1, 2].map((k) => Math.min(...rows.map((r) => r[k]!)))
      const hi = [0, 1, 2].map((k) => Math.max(...rows.map((r) => r[k]!)))
      expect(accessor.min).toEqual(lo)
      expect(accessor.max).toEqual(hi)
    }
  })

  it('writes no negative zero, which JSON would print as 0 and the data would not match', () => {
    const glb = parseGlb(toGlb(buildScene(samplePlan())))
    for (const mesh of readMeshes(glb)) {
      for (const p of mesh.points) {
        for (const value of [p.x, p.y, p.z]) expect(Object.is(value, -0)).toBe(false)
      }
    }
  })

  it('writes 32-bit unsigned indices that all point inside their mesh', () => {
    const glb = parseGlb(toGlb(buildScene(samplePlan())))
    for (const mesh of glb.json.meshes!) {
      const primitive = mesh.primitives[0]!
      const indices = glb.json.accessors![primitive.indices!]!
      const positions = glb.json.accessors![primitive.attributes.POSITION!]!
      expect(indices.componentType).toBe(5125)
      expect(indices.count % 3).toBe(0)
      for (const [i] of readAccessor(glb, primitive.indices!)) {
        expect(i).toBeLessThan(positions.count)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Orientation, measured in the exported frame
// ---------------------------------------------------------------------------

/** A point as a key, rounded to what 32 bits can tell apart at this size. */
const key = (p: Vec3): string => {
  const r = (v: number) => Math.round(v * 1e4) / 1e4 + 0
  return `${r(p.x)},${r(p.y)},${r(p.z)}`
}

/** Directed edges by position, so a vertex that was duplicated cannot hide a gap. */
function edgeCounts(mesh: ReadMesh): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (a: Vec3, b: Vec3) => {
    const id = `${key(a)}>${key(b)}`
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  for (const [a, b, c] of mesh.triangles) {
    const [pa, pb, pc] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
    add(pa, pb)
    add(pb, pc)
    add(pc, pa)
  }
  return counts
}

/** An L-shaped room, 6 walls, so its slab is not a rectangle. */
function lPlan(): FloorPlan {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({
    id,
    start,
    end,
    thickness: 0.2,
    height: 2.5,
    kind: 'exterior' as const
  })
  return {
    ...emptyPlan(),
    walls: [
      wall('a', [0, 0], [4, 0]),
      wall('b', [4, 0], [4, 2]),
      wall('c', [4, 2], [2, 2]),
      wall('d', [2, 2], [2, 4]),
      wall('e', [2, 4], [0, 4]),
      wall('f', [0, 4], [0, 0])
    ],
    rooms: [{ id: 'L', name: 'L room', boundary: ['a', 'b', 'c', 'd', 'e', 'f'] }]
  }
}

describe('faces face outward', () => {
  it('gives each wall the volume of its elevation times its thickness', () => {
    const scene = buildScene(samplePlan())
    const meshes = readMeshes(parseGlb(toGlb(scene)))
    for (const wall of scene.walls) {
      const mesh = meshes.find((m) => m.name === `wall_${wall.id}`)!
      const expected = elevationArea(wall.elevation) * wall.elevation.thickness
      expect(volume(mesh)).toBeCloseTo(expected, 4)
    }
  })

  it('shares every wall edge between two triangles that traverse it in opposite directions', () => {
    const meshes = readMeshes(parseGlb(toGlb(buildScene(samplePlan()))))
    for (const mesh of meshes.filter((m) => m.name.startsWith('wall_'))) {
      const counts = edgeCounts(mesh)
      for (const [edge, count] of counts) {
        const [from, to] = edge.split('>')
        expect(count, `${mesh.name} edge ${edge}`).toBe(1)
        expect(counts.get(`${to}>${from}`), `${mesh.name} reverse of ${edge}`).toBe(1)
      }
    }
  })

  it.each([
    ['a rectangular room', samplePlan(), 'floor_r1'],
    ['an L-shaped room', lPlan(), 'floor_L']
  ])('faces a slab up and gives it the room area: %s', (_label, plan, name) => {
    const slab = meshOf(plan, name)
    const index = indexPlan(plan)
    const expected = area(roomPolygon(plan.rooms[0]!, index))

    let total = 0
    for (const [a, b, c] of slab.triangles) {
      const pa = slab.points[a]!
      const normal = crossV(sub(slab.points[b]!, pa), sub(slab.points[c]!, pa))
      expect(normal.y).toBeGreaterThan(0)
      expect(Math.abs(normal.x)).toBeLessThan(1e-6)
      expect(Math.abs(normal.z)).toBeLessThan(1e-6)
      total += normal.y / 2
    }
    expect(total).toBeCloseTo(expected, 4)
  })
})

/** Pieces of a mesh that share no vertex position. */
function pieces(mesh: ReadMesh): number {
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let root = k
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(k, root)
    return root
  }
  for (const p of mesh.points) parent.set(key(p), key(p))
  for (const [a, b, c] of mesh.triangles) {
    const [ra, rb, rc] = [find(key(mesh.points[a]!)), find(key(mesh.points[b]!)), find(key(mesh.points[c]!))]
    parent.set(rb, ra)
    parent.set(find(rc), find(ra))
  }
  return new Set([...parent.keys()].map(find)).size
}

describe('the shape of the walls', () => {
  it('is the same for a plan turned off the axes', () => {
    const plan = samplePlan()
    const turned = rotated(plan, 0.6435)
    const before = readMeshes(parseGlb(toGlb(buildScene(plan))))
    const after = readMeshes(parseGlb(toGlb(buildScene(turned))))

    expect(after.map((m) => m.name)).toEqual(before.map((m) => m.name))
    for (const [i, mesh] of before.entries()) {
      expect(after[i]!.triangles.length).toBe(mesh.triangles.length)
      expect(after[i]!.points.length).toBe(mesh.points.length)
      if (mesh.name.startsWith('wall_')) {
        expect(volume(after[i]!)).toBeCloseTo(volume(mesh), 4)
        expect(volume(after[i]!)).toBeGreaterThan(0)
      }
    }
  })

  it('centres a wall drawn right to left on its axis', () => {
    // w3 runs from (4, 3) to (0, 3): its axis is at plan y = 3, so z = -3. Its outer face runs
    // 0.1 m past both ends to the mitred corners (SHT-2).
    const box = extent(meshOf(samplePlan(), 'wall_w3'))
    expect(box.z[0]).toBeCloseTo(-3.1, 5)
    expect(box.z[1]).toBeCloseTo(-2.9, 5)
    expect(box.x[0]).toBeCloseTo(-0.1, 5)
    expect(box.x[1]).toBeCloseTo(4.1, 5)
  })

  it('leaves no face on the floor under a door whose sill is 0', () => {
    // w1 is 4 m long, 0.2 m thick, with a 0.9 m door: the bottom is 3.1 m of it.
    const wall = meshOf(samplePlan(), 'wall_w1')
    let onFloor = 0
    for (const [a, b, c] of wall.triangles) {
      const [pa, pb, pc] = [wall.points[a]!, wall.points[b]!, wall.points[c]!]
      if (Math.max(Math.abs(pa.y), Math.abs(pb.y), Math.abs(pc.y)) > 1e-6) continue
      onFloor += Math.hypot(...Object.values(crossV(sub(pb, pa), sub(pc, pa)))) / 2
    }
    expect(onFloor).toBeCloseTo((4 - 0.9) * 0.2, 4)
  })

  it('cuts a wall in two where an opening spans its whole height', () => {
    expect(pieces(meshOf(samplePlan(), 'wall_w2'))).toBe(2)
    expect(pieces(meshOf(samplePlan(), 'wall_w1'))).toBe(1)
  })
})

/** A strict reader for the OBJ export: `o` groups, `v` points, triangular `f`. */
function readObj(text: string): ReadMesh[] {
  const points: Vec3[] = []
  const groups: { name: string; triangles: [number, number, number][] }[] = []
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue
    const [kind, ...rest] = line.split(' ')
    if (kind === 'mtllib' || kind === 'usemtl') continue
    if (kind === 'o') groups.push({ name: rest[0]!, triangles: [] })
    else if (kind === 'v') points.push({ x: +rest[0]!, y: +rest[1]!, z: +rest[2]! })
    else if (kind === 'f' && rest.length === 3) {
      groups[groups.length - 1]!.triangles.push([+rest[0]! - 1, +rest[1]! - 1, +rest[2]! - 1])
    } else throw new Error(`unexpected OBJ line: ${line}`)
  }
  return groups.map((g) => ({ name: g.name, points, triangles: g.triangles }))
}

describe('the same model as the OBJ export', () => {
  it.each([
    ['the sample room', samplePlan()],
    ['an L-shaped room', lPlan()]
  ])('has the same elements, triangles and volumes: %s', (_label, plan) => {
    const scene = buildScene(plan)
    const glb = readMeshes(parseGlb(toGlb(scene)))
    const obj = readObj(toObj(scene))

    expect(glb.map((m) => m.name)).toEqual(obj.map((m) => m.name))
    expect(glb.length).toBeGreaterThan(0)
    for (const [i, mesh] of glb.entries()) {
      expect(mesh.triangles.length).toBe(obj[i]!.triangles.length)
      if (mesh.name.startsWith('wall_')) {
        // OBJ is Z up and GLB is Y up, and the volume is the same in both: the
        // axis change is a rotation. Both are rounded (6 decimals, 32 bits).
        expect(volume(mesh)).toBeCloseTo(volume(obj[i]!), 4)
      }
    }
  })
})

describe('material and shading', () => {
  const glb = () => parseGlb(toGlb(buildScene(samplePlan())))

  it('gives every primitive the material of its kind, named so, with no metallic response (VEW-73)', () => {
    const doc = glb().json
    const materials = doc.materials as { name?: string; pbrMetallicRoughness?: { metallicFactor?: number; roughnessFactor?: number } }[]
    const names = readMeshes(glb()).map((m) => m.name)
    for (const [i, mesh] of doc.meshes!.entries()) {
      const kind = names[i]!.split('_')[0]!
      const expected = kind === 'leaf' ? 'door' : kind === 'parapet' ? 'wall' : kind
      for (const primitive of mesh.primitives) expect(materials[primitive.material!]!.name).toBe(expected)
    }
    // Only the materials the file uses, each once.
    expect(new Set(materials.map((m) => m.name)).size).toBe(materials.length)
    for (const material of materials) expect(material.pbrMetallicRoughness!.metallicFactor).toBe(0)
    expect(materials.find((m) => m.name === 'wall')!.pbrMetallicRoughness!.roughnessFactor).toBe(1)
  })

  it('does not mark the wall material double-sided, so a winding mistake stays visible', () => {
    const wall = (glb().json.materials as { name?: string; doubleSided?: boolean }[]).find((m) => m.name === 'wall')!
    expect(wall.doubleSided ?? false).toBe(false)
  })
})

describe('a plan that is not sound', () => {
  const realPlan: FloorPlan = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../fixtures/floor-plan.json'), 'utf8')
  )

  const broken = (): FloorPlan => {
    const plan = samplePlan()
    plan.walls.push(
      // Zero length: no axis, so the scene cannot build it.
      { id: 'bad', start: [1, 1], end: [1, 1], thickness: 0.2, height: 2.5, kind: 'interior' },
      // Open-plan boundary with no physical wall.
      { id: 'virt', start: [2, 0], end: [2, 3], thickness: 0.2, height: 2.5, kind: 'interior', virtual: true }
    )
    return plan
  }

  it('leaves out the broken and the virtual wall and exports the rest', () => {
    const scene = buildScene(broken())
    expect(scene.issues.length).toBeGreaterThan(0)

    const names = readMeshes(parseGlb(toGlb(scene))).map((m) => m.name)
    expect(names).not.toContain('wall_bad')
    expect(names).not.toContain('wall_virt')
    expect(names).toEqual(['wall_w1', 'wall_w2', 'wall_w3', 'wall_w4', 'floor_r1', ...openingNames(scene), 'slab_ground', 'roof_ground'])
  })

  it('writes only finite positions', () => {
    for (const plan of [samplePlan(), rotated(samplePlan(), 0.6435), lPlan(), realPlan, broken()]) {
      for (const mesh of readMeshes(parseGlb(toGlb(buildScene(plan))))) {
        for (const p of mesh.points) {
          for (const value of [p.x, p.y, p.z]) expect(Number.isFinite(value)).toBe(true)
        }
      }
    }
  })

  it('does not throw for any plan the other exporters are tested with', () => {
    for (const plan of [emptyPlan(), samplePlan(), lPlan(), realPlan, broken()]) {
      expect(() => toGlb(buildScene(plan))).not.toThrow()
    }
  })
})
