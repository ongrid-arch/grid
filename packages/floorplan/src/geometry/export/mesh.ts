/**
 * Triangle meshes for the 3D exporters.
 *
 * OBJ and glTF both write what Canvas3D draws, so the walls and floors are
 * built here once and each exporter only serialises them. Two writers over two
 * copies of this code could disagree about a hole, a winding or a name; over
 * one copy they cannot.
 *
 * Internal on purpose: `export/index.ts` re-exports the exporters and not this
 * module, so the public surface stays `toObj`, `toGlb` and the other formats.
 *
 * Points are in the model's own frame: metres, X and Y as on the plan, Z up
 * (C4). Faces wind counter-clockwise seen from outside the solid. An exporter
 * that changes frame has to change it as a rotation, never a mirror.
 */

import type { Vec2 } from '../vec2'
import type { SceneGround } from '../groundPlane'
import type { SiteBlock, SiteBlockKind } from '../siteScene'
import type { SceneColumn, SceneItem, SceneOpening, SceneSlab, SceneSolid, SceneStair, SceneWall, Vec3, WallBasis, WallElevation } from '../scene3d'
import type { OpeningPartKind } from '../openingParts'
import { alongFace } from '../scene3d'
import { triangulate } from '../triangulate'
import { planeAt } from '../roofs'
import { tolerance } from '../tolerances'

export type Face = readonly [number, number, number]

/**
 * VEW-73: the materials the 3D files draw in, one per kind of part, in the order a file lists
 * them. Plain colours, not styling: they tell the kinds apart, and a person swaps a material once
 * in their program to change every part of its kind. Glass alone is seen through.
 */
export const MESH_MATERIALS = [
  { name: 'wall', colour: [0.86, 0.85, 0.82], opacity: 1 },
  { name: 'floor', colour: [0.72, 0.63, 0.5], opacity: 1 },
  { name: 'door', colour: [0.6, 0.45, 0.3], opacity: 1 },
  { name: 'frame', colour: [0.35, 0.35, 0.36], opacity: 1 },
  { name: 'glass', colour: [0.7, 0.82, 0.9], opacity: 0.35 },
  { name: 'slab', colour: [0.62, 0.62, 0.6], opacity: 1 },
  { name: 'roof', colour: [0.55, 0.3, 0.25], opacity: 1 },
  { name: 'stair', colour: [0.7, 0.7, 0.68], opacity: 1 },
  { name: 'column', colour: [0.75, 0.75, 0.73], opacity: 1 },
  { name: 'item', colour: [0.9, 0.9, 0.9], opacity: 1 },
  // CMD-55: a room's ceiling that names no finish.
  { name: 'ceiling', colour: [0.94, 0.93, 0.91], opacity: 1 },
  // CNT-60: a party wall, drawn as a cut; the site's ground, its fences, paths and paving, its
  // trees, its pools' water and the neighbours round it.
  { name: 'cut', colour: [0.25, 0.25, 0.27], opacity: 1 },
  { name: 'ground', colour: [0.6, 0.66, 0.5], opacity: 1 },
  { name: 'site', colour: [0.68, 0.66, 0.62], opacity: 1 },
  { name: 'planting', colour: [0.36, 0.5, 0.3], opacity: 1 },
  { name: 'water', colour: [0.3, 0.55, 0.75], opacity: 0.7 },
  { name: 'context', colour: [0.8, 0.8, 0.8], opacity: 1 }
] as const satisfies readonly { readonly name: string; readonly colour: readonly [number, number, number]; readonly opacity: number }[]

export type MeshMaterial = (typeof MESH_MATERIALS)[number]['name']

/** The material for a part named by its prefix (`wall`, `leaf`, `parapet` ...): a parapet is wall, a door's leaf `door`. */
export function materialOf(prefix: string): MeshMaterial {
  if (prefix === 'parapet') return 'wall'
  if (prefix === 'leaf') return 'door'
  return MESH_MATERIALS.find((material) => material.name === prefix)?.name ?? 'wall'
}

export interface Mesh {
  readonly points: readonly Vec3[]
  readonly faces: readonly Face[]
}

/**
 * Ids come from the plan file, which the assistant writes, and a name that
 * carries a newline would end the `o` statement and start a forged one.
 */
export function sanitize(id: string): string {
  const clean = id.replace(/[^A-Za-z0-9_.-]/g, '_')
  return clean.length > 0 ? clean : '_'
}

/**
 * A name allocator for one file: `prefix_id`, with a numeric suffix when the
 * sanitised name was already taken.
 */
export function makeNamer(): (prefix: string, id: string) => string {
  const taken = new Set<string>()
  return (prefix, id) => {
    const base = `${prefix}_${sanitize(id)}`
    let name = base
    for (let k = 2; taken.has(name); k++) name = `${base}_${k}`
    taken.add(name)
    return name
  }
}

/**
 * One wall as a closed solid: the elevation on both faces, and a band of
 * quads round every boundary edge — the ends, the top, and the jambs, sills
 * and lintels of every opening.
 *
 * The sides come from the triangulation's own rings, not from the outline and
 * holes that went in. Those differ exactly where it matters: a door's bottom
 * edge is also the wall's bottom edge, so it is no boundary, and a wall under
 * an open door must not get a face.
 */
/**
 * Whether every point can be written as a number: finite, and within what a 32-bit float (the
 * GLB's) holds. Validation refuses sizes that large before they get here; this is the last
 * guard, so that no export ever writes "Infinity" or a bound that is not a number.
 */
function storable(mesh: Mesh): Mesh | null {
  const fits = (v: number): boolean => Number.isFinite(Math.fround(v))
  return mesh.points.every((p) => fits(p.x) && fits(p.y) && fits(p.z)) ? mesh : null
}

export function wallMesh(wall: SceneWall): Mesh | null {
  // CNT-18: a curved wall is its straight pieces, one mesh of them.
  if (wall.pieces !== undefined) return joined(wall.pieces.map((piece) => elevationMesh(piece.elevation, piece.basis)))
  return elevationMesh(wall.elevation, wall.basis)
}

/** Meshes one after the other as one: each face's points moved past the points before it. */
function joined(meshes: readonly (Mesh | null)[]): Mesh | null {
  const points: Vec3[] = []
  const faces: Face[] = []
  for (const mesh of meshes) {
    if (mesh === null) continue
    const base = points.length
    points.push(...mesh.points)
    for (const [a, b, c] of mesh.faces) faces.push([base + a, base + b, base + c])
  }
  return faces.length === 0 ? null : storable({ points, faces })
}

function elevationMesh(elevation: WallElevation, basis: WallBasis): Mesh | null {
  const { vertices, triangles, rings } = triangulate(elevation.outline, elevation.holes)
  if (triangles.length === 0) return null

  const half = elevation.thickness / 2
  // `across` is the wall's right face (`−normal`): the front face is the right one. Each face's
  // ends go where the corners put them (SHT-2).
  const place = (p: Vec2, across: number): Vec3 => {
    const u = alongFace(elevation, p.x, across > 0 ? 'right' : 'left')
    return {
      x: basis.origin.x + basis.along.x * u + basis.up.x * p.y + basis.across.x * across,
      y: basis.origin.y + basis.along.y * u + basis.up.y * p.y + basis.across.y * across,
      z: basis.origin.z + basis.along.z * u + basis.up.z * p.y + basis.across.z * across
    }
  }

  // Vertex i is on the front face; vertex n + i is the same point on the back.
  const n = vertices.length
  const points = [...vertices.map((v) => place(v, half)), ...vertices.map((v) => place(v, -half))]

  const faces: Face[] = []
  for (const [a, b, c] of triangles) {
    // `along × up = across`, so counter-clockwise on the elevation faces +across.
    faces.push([a, b, c])
    faces.push([n + a, n + c, n + b])
  }

  // The region is on the left of each ring edge, so its outside is on the right.
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!
      const q = ring[(i + 1) % ring.length]!
      faces.push([n + p, n + q, q])
      faces.push([n + p, q, p])
    }
  }

  return storable({ points, faces })
}

/**
 * A room's floor: a flat surface at its height, facing up, open over its holes (ARE-6). That is
 * z = 0, or the room's `offset` when it is set off its storey (LVL-7), raised by `floorLift`
 * (VEW-73) off the slab. Then, for a room set off its storey, a band of quads runs
 * round its edge, and round each hole's, down (or up) to the storey's floor, so a stage is a
 * platform with sides and a sunken room has a sill round it, facing into the room.
 */
export function floorMesh(floor: SceneSlab): Mesh | null {
  const { vertices, triangles } = triangulate(floor.polygon, floor.holes)
  if (triangles.length === 0) return null
  // VEW-73: lifted off the slab under it, so the two never share a plane and flicker.
  const top = (floor.offset ?? 0) + tolerance('floorLift')
  const points: Vec3[] = vertices.map((v) => ({ x: v.x, y: v.y, z: top }))
  const faces: Face[] = [...triangles]
  if (floor.offset !== undefined && floor.offset !== 0) {
    // The polygon winds counter-clockwise and each hole clockwise, so outside the floor lies to
    // the right of every edge. With the top above the base these faces point out of the platform,
    // with it below into the room.
    for (const ring of [floor.polygon, ...floor.holes]) {
      const n = ring.length
      const base = points.length
      for (const p of ring) points.push({ x: p.x, y: p.y, z: 0 }, { x: p.x, y: p.y, z: top })
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const [p0, p1, q0, q1] = [base + 2 * i, base + 2 * i + 1, base + 2 * j, base + 2 * j + 1]
        faces.push([p0, q0, q1], [p0, q1, p1])
      }
    }
  }
  return storable({ points, faces })
}

/**
 * A stair (LVL-3) as one mesh: every tread and landing a closed block, its top facing up, its
 * bottom down, and a band of faces round its sides. Blocks that touch keep their own faces, so
 * the mesh is a set of solids, not one skin.
 */
export function stairMesh(stair: SceneStair): Mesh | null {
  return blocksMesh(stair.blocks)
}

/** CNT-16: a column as one closed solid, its footprint from its foot to its top. */
export function columnMesh(column: SceneColumn): Mesh | null {
  return blocksMesh([column])
}

/** CNT-42: a fixture or a piece of furniture as one mesh, each block its kind gives a closed solid. */
export function itemMesh(item: SceneItem): Mesh | null {
  return blocksMesh(item.blocks)
}

/** CNT-60: the material a block of the site is drawn in, by its kind. */
export function siteMaterial(kind: SiteBlockKind): MeshMaterial {
  if (kind === 'neighbour') return 'context'
  if (kind === 'water') return 'water'
  if (kind === 'trunk' || kind === 'crown') return 'planting'
  return 'site'
}

/** CNT-60: blocks of the site as one mesh of closed solids, in the floors' own datum. */
export function siteMesh(blocks: readonly SiteBlock[]): Mesh | null {
  return blocksMesh(blocks)
}

/**
 * CNT-60: the ground as a surface facing up, at its level, lifted on a slope to the ground at each
 * point (`SceneGround.tilt`), open over its holes. Null when it has no piece.
 */
export function groundMesh(ground: Pick<SceneGround, 'level' | 'tilt' | 'pieces'>): Mesh | null {
  const points: Vec3[] = []
  const faces: Face[] = []
  const ring = (r: readonly (readonly [number, number])[]): Vec2[] => {
    const open = r.length > 1 && r[0]![0] === r.at(-1)![0] && r[0]![1] === r.at(-1)![1] ? r.slice(0, -1) : r
    return open.map(([x, y]) => ({ x, y }))
  }
  const tilt = ground.tilt
  const z = (p: Vec2): number => ground.level + (tilt === undefined ? 0 : tilt.at + tilt.x * p.x + tilt.y * p.y)
  for (const [outer, ...holes] of ground.pieces) {
    if (outer === undefined) continue
    const { vertices, triangles } = triangulate(ring(outer), holes.map(ring))
    const base = points.length
    for (const v of vertices) points.push({ x: v.x, y: v.y, z: z(v) })
    for (const [a, b, c] of triangles) faces.push([base + a, base + b, base + c])
  }
  return faces.length === 0 ? null : storable({ points, faces })
}

/** Upright blocks, each its outline (counter-clockwise) solid from its bottom to its top, as one mesh of closed solids. */
function blocksMesh(blocks: readonly { readonly outline: readonly Vec2[]; readonly bottom: number; readonly top: number }[]): Mesh | null {
  const points: Vec3[] = []
  const faces: Face[] = []
  for (const block of blocks) {
    const { vertices, triangles } = triangulate(block.outline)
    if (triangles.length === 0) continue
    const top = points.length
    for (const v of vertices) points.push({ x: v.x, y: v.y, z: block.top })
    const bottom = points.length
    for (const v of vertices) points.push({ x: v.x, y: v.y, z: block.bottom })
    for (const [a, b, c] of triangles) faces.push([top + a, top + b, top + c], [bottom + a, bottom + c, bottom + b])
    // The outline winds counter-clockwise, so its outside lies to the right of each edge.
    const n = block.outline.length
    const side = points.length
    for (const p of block.outline) points.push({ x: p.x, y: p.y, z: block.bottom }, { x: p.x, y: p.y, z: block.top })
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const [p0, p1, q0, q1] = [side + 2 * i, side + 2 * i + 1, side + 2 * j, side + 2 * j + 1]
      faces.push([p0, q0, q1], [p0, q1, p1])
    }
  }
  return faces.length === 0 ? null : storable({ points, faces })
}

/**
 * CNT-14: the boxes of one part of a door or window (its frame, its leaves or its glass) as one
 * mesh, each a closed block like a stair's tread. Null when it has none of that part.
 */
export function openingPartMesh(opening: SceneOpening, part: OpeningPartKind): Mesh | null {
  return blocksMesh(opening.parts.filter((p) => p.part === part && p.top > p.bottom))
}

/** The parts of a door or window, in the order the exports write them. */
export const OPENING_PART_KINDS: readonly OpeningPartKind[] = ['frame', 'leaf', 'glass']

/**
 * Flat solids of the shell (LVL-4: a slab, a roof, a parapet) as one mesh: every piece a closed
 * prism from its bottom to its top, open through its holes, its top facing up, its bottom down, and
 * a band of faces round every ring of its edge, out of the solid. A piece of a sloped roof (LVL-6)
 * is the same prism with every point raised by its plane's height there, so it lies on the slope.
 */
export function shellMesh(solids: readonly SceneSolid[]): Mesh | null {
  const points: Vec3[] = []
  const faces: Face[] = []
  for (const solid of solids) {
    if (!(solid.top > solid.bottom)) continue
    for (const piece of solid.pieces) {
      const { vertices, triangles, rings } = triangulate(piece.outline, piece.holes)
      if (triangles.length === 0) continue
      const lift = (v: Vec2): number => (piece.rise === undefined ? 0 : planeAt(piece.rise, v))
      const top = points.length
      for (const v of vertices) points.push({ x: v.x, y: v.y, z: solid.top + lift(v) })
      const bottom = points.length
      for (const v of vertices) points.push({ x: v.x, y: v.y, z: solid.bottom + lift(v) })
      for (const [a, b, c] of triangles) faces.push([top + a, top + b, top + c], [bottom + a, bottom + c, bottom + b])
      // Outer rings wind counter-clockwise and holes clockwise: the solid lies on the left of every
      // edge, so its outside is on the right.
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]!
          const q = ring[(i + 1) % ring.length]!
          faces.push([bottom + p, bottom + q, top + q], [bottom + p, top + q, top + p])
        }
      }
    }
  }
  return faces.length === 0 ? null : storable({ points, faces })
}
