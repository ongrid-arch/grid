import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../plan'
import type { Scene3D, Vec3 } from '../../scene3d'
import { buildScene, elevationArea } from '../../scene3d'
import { signedArea } from '../../vec2'
import { toObj } from '../obj'
import { tolerance } from '../../tolerances'

/**
 * OBJ export.
 *
 * The exporter is fed `Scene3D`, the same data Canvas3D draws, so what is
 * checked here is the file — not that it agrees with a second opinion about
 * the plan. The reading side below is deliberately independent of the
 * exporter: a strict parser, then geometry measured straight off the triangles
 * (volume by the divergence theorem, edges counted, normals by cross product).
 */

interface Group {
  readonly name: string
  /** VEW-73: the material its `usemtl` names. */
  readonly material: string | null
  readonly faces: readonly (readonly [number, number, number])[]
}

interface Obj {
  /** VEW-73: the materials file its `mtllib` names. */
  readonly mtllib: string | null
  readonly vertices: readonly Vec3[]
  readonly groups: readonly Group[]
}

/**
 * Strict: anything but a comment, `o`, `v`, a triangular `f`, one `mtllib` before any object and
 * a `usemtl` right after each `o` (VEW-73) is an error.
 */
function parseObj(text: string): Obj {
  const vertices: Vec3[] = []
  const groups: { name: string; material: string | null; faces: [number, number, number][] }[] = []
  let mtllib: string | null = null
  let last = ''

  for (const [index, line] of text.split('\n').entries()) {
    if (line === '' || line.startsWith('#')) continue
    const parts = line.split(' ')
    const where = `line ${index + 1}: ${line}`

    const previous = last
    last = parts[0]!
    switch (parts[0]) {
      case 'mtllib': {
        expect(parts, where).toHaveLength(2)
        expect(mtllib === null && groups.length === 0 && vertices.length === 0, `one mtllib, before any object: ${where}`).toBe(true)
        mtllib = parts[1]!
        break
      }
      case 'usemtl': {
        expect(parts, where).toHaveLength(2)
        expect(previous, `usemtl right after its o: ${where}`).toBe('o')
        groups[groups.length - 1]!.material = parts[1]!
        break
      }
      case 'o': {
        expect(parts, where).toHaveLength(2)
        groups.push({ name: parts[1]!, material: null, faces: [] })
        break
      }
      case 'v': {
        expect(parts, where).toHaveLength(4)
        const [x, y, z] = parts.slice(1).map(Number) as [number, number, number]
        for (const c of [x, y, z]) expect(Number.isFinite(c), where).toBe(true)
        vertices.push({ x, y, z })
        break
      }
      case 'f': {
        expect(parts, where).toHaveLength(4)
        const ids = parts.slice(1).map((s) => Number(s) - 1) as [number, number, number]
        for (const id of ids) {
          expect(Number.isInteger(id) && id >= 0 && id < vertices.length, where).toBe(true)
        }
        expect(groups.length, `a face before any group: ${where}`).toBeGreaterThan(0)
        groups[groups.length - 1]!.faces.push(ids)
        break
      }
      default:
        throw new Error(`unexpected statement — ${where}`)
    }
  }
  return { mtllib, vertices, groups }
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const crossV = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})
const dotV = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

function corners(obj: Obj, face: readonly [number, number, number]): [Vec3, Vec3, Vec3] {
  return face.map((i) => obj.vertices[i]!) as [Vec3, Vec3, Vec3]
}

/** Signed volume by the divergence theorem: positive when normals point out. */
function volume(obj: Obj, group: Group): number {
  let sum = 0
  for (const face of group.faces) {
    const [a, b, c] = corners(obj, face)
    sum += dotV(a, crossV(b, c))
  }
  return sum / 6
}

function faceArea(obj: Obj, face: readonly [number, number, number]): number {
  const [a, b, c] = corners(obj, face)
  const n = crossV(sub(b, a), sub(c, a))
  return Math.hypot(n.x, n.y, n.z) / 2
}

function bounds(obj: Obj, group: Group) {
  const pts = group.faces.flatMap((f) => corners(obj, f))
  const range = (pick: (v: Vec3) => number): [number, number] => {
    const values = pts.map(pick)
    return [Math.min(...values), Math.max(...values)]
  }
  return { x: range((v) => v.x), y: range((v) => v.y), z: range((v) => v.z) }
}

// ---------------------------------------------------------------------------

/** A 4×3 room with a door whose sill is 0, a window, and a full-height opening. */
function samplePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
      { id: 'o2', wall: 'w3', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'o3', wall: 'w2', type: 'door', offset: 1, width: 1, sill: 0, height: 2.5 }
    ]
  }
}

/** The same plan turned about the origin, so no wall lies on an axis. */
function rotated(plan: FloorPlan, angle: number): FloorPlan {
  const turn = ([x, y]: readonly [number, number]): [number, number] => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle)
  ]
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, start: turn(w.start), end: turn(w.end) }))
  }
}

const objOf = (plan: FloorPlan): Obj => parseObj(toObj(buildScene(plan)))

const wallGroups = (obj: Obj) => obj.groups.filter((g) => g.name.startsWith('wall_'))
const floorGroups = (obj: Obj) => obj.groups.filter((g) => g.name.startsWith('floor_'))

describe('the file a reader actually sees', () => {
  it('parses strictly: only objects, vertices and triangles, every index in range', () => {
    const obj = objOf(samplePlan())
    expect(obj.vertices.length).toBeGreaterThan(0)
    expect(obj.groups.every((g) => g.faces.length > 0)).toBe(true)
  })

  it('says its units and axes, because OBJ cannot', () => {
    const text = toObj(buildScene(samplePlan()))
    expect(text).toMatch(/^# .*metres/im)
    expect(text).toMatch(/^# .*Z/m)
  })

  it('writes an empty plan as a header and nothing else', () => {
    const empty: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    const obj = objOf(empty)
    expect(obj.vertices).toHaveLength(0)
    expect(obj.groups).toHaveLength(0)
  })

  it('is deterministic', () => {
    expect(toObj(buildScene(samplePlan()))).toBe(toObj(buildScene(samplePlan())))
  })

  it('never writes a negative zero', () => {
    expect(toObj(buildScene(samplePlan()))).not.toMatch(/-0(\.0+)?(\s|$)/)
  })
})

describe('objects', () => {
  it('has one group per wall and one per room', () => {
    const obj = objOf(samplePlan())
    expect(wallGroups(obj).map((g) => g.name)).toEqual(['wall_w1', 'wall_w2', 'wall_w3', 'wall_w4'])
    expect(floorGroups(obj).map((g) => g.name)).toEqual(['floor_r1'])
  })

  it('cannot be made to inject statements through an id', () => {
    // Ids come from the plan file, which the assistant writes. A newline in a
    // name would end the `o` statement and start a forged one.
    const plan = samplePlan()
    plan.walls[0]!.id = 'w1\nv 9 9 9'
    plan.rooms[0]!.boundary[0] = 'w1\nv 9 9 9'
    plan.openings[0]!.wall = 'w1\nv 9 9 9'
    const text = toObj(buildScene(plan))
    expect(() => parseObj(text)).not.toThrow()
    const names = parseObj(text).groups.map((g) => g.name)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9_.-]+$/)
  })

  it('keeps object names unique when two ids sanitise to the same thing', () => {
    const plan = samplePlan()
    plan.walls[0]!.id = 'a b'
    plan.walls[1]!.id = 'a_b'
    plan.rooms = []
    plan.openings = []
    const names = objOf(plan).groups.map((g) => g.name)
    expect(names.length).toBeGreaterThanOrEqual(2)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('each wall is a closed solid', () => {
  it('has every edge in exactly two faces, running in opposite directions', () => {
    const obj = objOf(samplePlan())
    expect(wallGroups(obj)).toHaveLength(4)
    for (const group of wallGroups(obj)) {
      const used = new Map<string, number>()
      for (const [a, b, c] of group.faces) {
        for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
          used.set(`${i}>${j}`, (used.get(`${i}>${j}`) ?? 0) + 1)
        }
      }
      for (const [edge, count] of used) {
        const [i, j] = edge.split('>')
        expect(count, `${group.name}: ${edge}`).toBe(1)
        expect(used.has(`${j}>${i}`), `${group.name}: ${edge} has no opposite`).toBe(true)
      }
    }
  })

  it('has its normals out: the volume is positive and is the elevation times the thickness', () => {
    const plan = samplePlan()
    const scene = buildScene(plan)
    const obj = parseObj(toObj(scene))

    for (const wall of scene.walls) {
      const group = obj.groups.find((g) => g.name === `wall_${wall.id}`)!
      const expected = elevationArea(wall.elevation) * wall.elevation.thickness
      expect(volume(obj, group), wall.id).toBeCloseTo(expected, 6)
    }
  })

  // Since SHT-2 the corners are mitred: each wall's outer face runs on to the outer face of
  // the next, 0.1 m (half the 0.2 m wall) past the end of its axis, so a 4 m wall spans 4.2 m.
  it('puts each wall where the plan says, with its thickness centred on the axis', () => {
    const obj = objOf(samplePlan())
    const box = (id: string) => bounds(obj, obj.groups.find((g) => g.name === `wall_${id}`)!)

    const w1 = box('w1') // (0,0) → (4,0)
    expect(w1.x[0]).toBeCloseTo(-0.1, 6)
    expect(w1.x[1]).toBeCloseTo(4.1, 6)
    expect(w1.y[0]).toBeCloseTo(-0.1, 6)
    expect(w1.y[1]).toBeCloseTo(0.1, 6)
    expect(w1.z[0]).toBeCloseTo(0, 6)
    expect(w1.z[1]).toBeCloseTo(2.5, 6)

    const w2 = box('w2') // (4,0) → (4,3)
    expect(w2.x[0]).toBeCloseTo(3.9, 6)
    expect(w2.x[1]).toBeCloseTo(4.1, 6)
    expect(w2.y[0]).toBeCloseTo(-0.1, 6)
    expect(w2.y[1]).toBeCloseTo(3.1, 6)

    const w3 = box('w3') // (4,3) → (0,3), drawn right to left
    expect(w3.x[0]).toBeCloseTo(-0.1, 6)
    expect(w3.x[1]).toBeCloseTo(4.1, 6)
    expect(w3.y[0]).toBeCloseTo(2.9, 6)
    expect(w3.y[1]).toBeCloseTo(3.1, 6)
  })

  it('leaves no face under a door whose sill is the floor', () => {
    // The door's bottom and the wall's bottom are the same segment. A solid
    // that kept a face there would have a sheet of zero volume across the
    // doorway, and a viewer would draw it.
    const obj = objOf(samplePlan())
    const w1 = obj.groups.find((g) => g.name === 'wall_w1')!
    const onFloor = w1.faces.filter((f) => corners(obj, f).every((v) => Math.abs(v.z) < 1e-9))
    const area = onFloor.reduce((sum, f) => sum + faceArea(obj, f), 0)
    // (4 − 0.9) of wall bottom, 0.2 thick.
    expect(area).toBeCloseTo((4 - 0.9) * 0.2, 6)
  })

  it('cuts the wall in two at a full-height opening', () => {
    // o3 runs the whole height of w2: its volume is the wall minus the cut.
    const scene = buildScene(samplePlan())
    const wall = scene.walls.find((w) => w.id === 'w2')!
    const obj = parseObj(toObj(scene))
    const group = obj.groups.find((g) => g.name === 'wall_w2')!
    expect(volume(obj, group)).toBeCloseTo((3 * 2.5 - 1 * 2.5) * wall.elevation.thickness, 6)
  })
})

describe('floors', () => {
  it('lie flat just above z = 0, off the slab, facing up, and cover the room exactly', () => {
    const scene = buildScene(samplePlan())
    const obj = parseObj(toObj(scene))
    const floor = floorGroups(obj)[0]!

    let covered = 0
    for (const face of floor.faces) {
      const [a, b, c] = corners(obj, face)
      // VEW-73: lifted off the slab, so the two never share a plane.
      for (const v of [a, b, c]) expect(v.z).toBeCloseTo(tolerance('floorLift'), 9)
      const normal = crossV(sub(b, a), sub(c, a))
      expect(normal.z).toBeGreaterThan(0)
      covered += faceArea(obj, face)
    }
    expect(covered).toBeCloseTo(Math.abs(signedArea(scene.slabs[0]!.polygon)), 6)
  })

  it('covers a concave room without spilling out of it', () => {
    const plan: FloorPlan = {
      version: '1',
      units: 'm',
      walls: [
        [[0, 0], [4, 0]],
        [[4, 0], [4, 1]],
        [[4, 1], [1, 1]],
        [[1, 1], [1, 4]],
        [[1, 4], [0, 4]],
        [[0, 4], [0, 0]]
      ].map(([start, end], i) => ({
        id: `w${i + 1}`,
        start: start as [number, number],
        end: end as [number, number],
        thickness: 0.2,
        height: 2.5,
        kind: 'exterior' as const
      })),
      rooms: [{ id: 'r1', name: 'L', boundary: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] }],
      openings: []
    }
    const scene = buildScene(plan)
    expect(scene.slabs).toHaveLength(1)
    const obj = parseObj(toObj(scene))
    const covered = floorGroups(obj)[0]!.faces.reduce((s, f) => s + faceArea(obj, f), 0)
    expect(covered).toBeCloseTo(Math.abs(signedArea(scene.slabs[0]!.polygon)), 6)
  })
})

describe('independence from the frame', () => {
  it('exports a plan turned off the axes with the same volumes and the same mesh sizes', () => {
    // If the triangulation or the placement leaned on the axes, a wall along a
    // diagonal would come out a different size or a different mesh.
    const base = objOf(samplePlan())
    const turned = objOf(rotated(samplePlan(), 0.6435))

    expect(base.vertices.length).toBeGreaterThan(0)
    expect(turned.vertices).toHaveLength(base.vertices.length)
    for (const group of wallGroups(base)) {
      const other = turned.groups.find((g) => g.name === group.name)!
      expect(other.faces).toHaveLength(group.faces.length)
      // The file keeps 6 decimals, a micron: on a turned wall that rounds each
      // coordinate by up to 5e-7, and the volume inherits a few cm³ of it.
      expect(volume(turned, other)).toBeCloseTo(volume(base, group), 4)
    }
  })
})

describe('graceful degradation', () => {
  it('exports the part that is sound when a wall is broken', () => {
    const plan = samplePlan()
    plan.walls[3] = { ...plan.walls[3]!, end: plan.walls[3]!.start } // zero length
    const scene: Scene3D = buildScene(plan)
    expect(scene.walls.length).toBeLessThan(4)
    const obj = parseObj(toObj(scene))
    expect(wallGroups(obj)).toHaveLength(scene.walls.length)
  })

  it('does not draw a virtual wall: there is no substance to raise', () => {
    const plan = samplePlan()
    plan.walls[3] = { ...plan.walls[3]!, virtual: true }
    expect(wallGroups(objOf(plan)).map((g) => g.name)).not.toContain('wall_w4')
  })
})
