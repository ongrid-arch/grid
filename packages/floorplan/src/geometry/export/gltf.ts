/**
 * glTF export — the open 3D format SketchUp, Blender and the web read,
 * written as a binary GLB.
 *
 * Input is a `Scene3D`, the same as the OBJ exporter: exactly what Canvas3D
 * draws, with the doors and windows already cut out of the wall elevations and
 * the broken geometry already dropped, so the file cannot disagree with what the
 * user saw. The triangles come from the same mesh builder as OBJ's.
 *
 * glTF is metres and Y up. The model is Z up (C4), so each point is written as
 * `(x, y, z) → (x, z, -y)`: a rotation, not a mirror, so faces keep facing
 * outward and nothing needs re-winding.
 *
 * VEW-73: every primitive carries flat normals and box-projected UVs in metres, and is drawn in
 * the material of its kind (`MESH_MATERIALS`), named so; `docs/3d-files.md` says it all for a
 * person.
 *
 * GLB, not `.gltf`: one binary file with no base64 and no second file, which is
 * the form SketchUp documents. The result is bytes because a file is bytes; the
 * caller decides where they go.
 */

import type { Scene3D } from '../scene3d'
import { MESH_MATERIALS, OPENING_PART_KINDS, columnMesh, floorMesh, itemMesh, makeNamer, materialOf, openingPartMesh, shellMesh, stairMesh, wallMesh } from './mesh'
import type { Mesh, MeshMaterial } from './mesh'
import type { Vec3 } from '../scene3d'
import type { StoreyScene } from './obj'
import { GENERAL_GUIDANCE_LABEL } from '../rules/types'
import { english, name, said } from '../../messages/say'
import { approximationLines, leftOutLines, leftOutSummary, NO_APPROXIMATIONS, type Approximations, type LeftOutPart } from './leftOut'

const MAGIC = 0x46546c67 // "glTF"
const VERSION = 2
const CHUNK_JSON = 0x4e4f534a // "JSON"
const CHUNK_BIN = 0x004e4942 // "BIN\0"

// glTF component and buffer-view target codes.
const FLOAT = 5126
const UNSIGNED_INT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

/** A constant, so the same scene always gives the same bytes. */
const GENERATOR = 'Grid'

/**
 * VEW-73: a glTF material for each of the kinds (`MESH_MATERIALS`), named by its kind. Not
 * metallic: a primitive with no material gets glTF's default, which is fully metallic and renders
 * dark in several viewers. Not double-sided on purpose, so a winding mistake shows as a missing
 * face instead of being hidden; glass is double-sided and blended, as CNT-14 wrote it.
 */
function gltfMaterial(kind: MeshMaterial): object {
  const material = MESH_MATERIALS.find((m) => m.name === kind)!
  const pbr = { baseColorFactor: [...material.colour, material.opacity], metallicFactor: 0, roughnessFactor: kind === 'glass' ? 0.1 : 1 }
  return material.opacity < 1 ? { name: kind, pbrMetallicRoughness: pbr, alphaMode: 'BLEND', doubleSided: true } : { name: kind, pbrMetallicRoughness: pbr }
}

/** Rounds up to a multiple of 4, which GLB chunks and glTF views need. */
const pad4 = (n: number): number => (n + 3) & ~3

/**
 * Wraps a glTF document and an optional binary buffer in the GLB container:
 * a header, a JSON chunk padded with spaces, and a binary chunk padded with
 * zeros. The total length is written after both paddings are known.
 */
function encodeGlb(document: object, binary: Uint8Array | null): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document))
  const jsonLength = pad4(json.byteLength)
  const binLength = binary ? pad4(binary.byteLength) : 0

  const total =
    HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    jsonLength +
    (binary ? CHUNK_HEADER_BYTES + binLength : 0)

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, MAGIC, true)
  view.setUint32(4, VERSION, true)
  view.setUint32(8, total, true)

  let at = HEADER_BYTES
  view.setUint32(at, jsonLength, true)
  view.setUint32(at + 4, CHUNK_JSON, true)
  out.set(json, at + CHUNK_HEADER_BYTES)
  out.fill(0x20, at + CHUNK_HEADER_BYTES + json.byteLength, at + CHUNK_HEADER_BYTES + jsonLength)
  at += CHUNK_HEADER_BYTES + jsonLength

  if (binary) {
    view.setUint32(at, binLength, true)
    view.setUint32(at + 4, CHUNK_BIN, true)
    out.set(binary, at + CHUNK_HEADER_BYTES)
  }

  return out
}

interface Part {
  readonly name: string
  readonly mesh: Mesh
  /** VEW-73: the material it is drawn in, by its kind. */
  readonly material: MeshMaterial
  /** CNT-7 (C26): an outdoor space's floor says so in its node's `extras` (lab EL-18). */
  readonly outdoor?: { readonly kind: string; readonly roofed: boolean }
}

/**
 * Everything the scene could build, walls first, then room floors, stairs, columns (CNT-16), items
 * (CNT-42), the doors' and windows' parts (CNT-14) and the shell (LVL-4), as OBJ lists them. VEW-64: one namer
 * serves a whole file, so the parts of every floor keep names of their own.
 */
function partsOf(scene: Scene3D, nameOf: (prefix: string, id: string) => string = makeNamer()): Part[] {
  const parts: Part[] = []
  for (const wall of scene.walls) {
    const mesh = wallMesh(wall)
    if (mesh) parts.push({ name: nameOf('wall', wall.id), mesh, material: 'wall' })
  }
  for (const slab of scene.slabs) {
    const mesh = floorMesh(slab)
    if (mesh) parts.push({ name: nameOf('floor', slab.roomId), mesh, material: 'floor', ...(slab.outdoor === undefined ? {} : { outdoor: slab.outdoor }) })
  }
  for (const stair of scene.stairs) {
    const mesh = stairMesh(stair)
    if (mesh) parts.push({ name: nameOf('stair', stair.id), mesh, material: 'stair' })
  }
  // CNT-16: each column, once, whole.
  for (const column of scene.columns ?? []) {
    const mesh = columnMesh(column)
    if (mesh) parts.push({ name: nameOf('column', column.id), mesh, material: 'column' })
  }
  // CNT-42: each fixture and piece of furniture, as its kind's blocks.
  for (const item of scene.items ?? []) {
    const mesh = itemMesh(item)
    if (mesh) parts.push({ name: nameOf('item', item.id), mesh, material: 'item' })
  }
  // CNT-14: each door's and window's frame, leaves and glass, each in its kind's material.
  for (const opening of scene.openings) {
    for (const kind of OPENING_PART_KINDS) {
      const mesh = openingPartMesh(opening, kind)
      if (mesh) parts.push({ name: nameOf(kind, opening.id), mesh, material: materialOf(kind) })
    }
  }
  // LVL-4: the slab the floor stands on, its roof and its parapet.
  const shell = scene.shell
  if (shell !== null) {
    const add = (prefix: string, mesh: Mesh | null): void => {
      if (mesh) parts.push({ name: nameOf(prefix, shell.floor), mesh, material: materialOf(prefix) })
    }
    add('slab', shellMesh(shell.slab))
    if (shell.roof) add('roof', shellMesh([shell.roof]))
    if (shell.parapet) add('parapet', shellMesh([shell.parapet]))
  }
  return parts
}

export interface GlbOptions {
  /** HND-6: the parts of the plan this file leaves out, written into `asset.extras`. */
  readonly leftOut?: readonly LeftOutPart[]
  /** CNT-18: the curves it writes as flat facets and straight pieces, written beside them. */
  readonly approximations?: Approximations
  /**
   * HND-11 (lab MS-12): where the scene's zero is on the plan, when the scene was built near zero
   * from a plan far from it (`nearOrigin`). The model is then one node that holds every part,
   * moved there by its translation, and `asset.extras.gridOrigin` says so. A 32-bit point holds
   * about seven digits, so the points stay small and the offset, a JSON number, stays exact.
   */
  readonly origin?: readonly [number, number]
  /** CNT-58: the plan's north and where it is, written into `asset.extras.gridNorth`. */
  readonly north?: GlbNorth
  /** CNT-58: the sun at a moment, written as a directional light node named `sun` (`KHR_lights_punctual`). */
  readonly sun?: GlbSun
}

/** CNT-58: the north the plan states (degrees counter-clockwise from +y on the plan, null for none), which way its y runs, and its place on the earth. */
export interface GlbNorth {
  readonly north: number | null
  readonly yAxis: 'up' | 'down'
  readonly latitude?: number
  readonly longitude?: number
}

/** CNT-58: the sun: the way toward it in the file's axes (x, up, -y of the plan), a unit vector, and what it was worked out for. */
export interface GlbSun {
  readonly toward: readonly [number, number, number]
  readonly azimuth: number
  readonly elevation: number
  readonly date: string
  readonly time: string
  readonly utcOffset: number | null
}

/** CNT-58: the name of the sun's light node. */
export const GLB_SUN_NODE = 'sun'

/**
 * The sun's node: a directional light shines down its node's -Z, so the node is turned from -Z
 * onto the way the sun's rays run, away from the sun. Its intensity is in lux, as the extension
 * reads it, for a clear day's direct sun; none with the sun down.
 */
function sunNode(sun: GlbSun): object {
  const r = [-sun.toward[0], -sun.toward[1], -sun.toward[2]]
  // The turn from (0, 0, -1) to r: its axis (0, 0, -1) × r, its half angle from 1 + (0, 0, -1) · r.
  const w = 1 - r[2]!
  const q = w <= 0 ? [1, 0, 0, 0] : [r[1]!, -r[0]!, 0, w]
  const length = Math.hypot(...q)
  const rotation = q.map((v) => Math.round((v / length) * 1e9) / 1e9 + 0)
  return {
    name: GLB_SUN_NODE,
    rotation,
    extensions: { KHR_lights_punctual: { light: 0 } },
    extras: { gridSun: { azimuth: sun.azimuth, elevation: sun.elevation, date: sun.date, time: sun.time, utcOffset: sun.utcOffset } },
  }
}

const SUN_LUX = 100000

/** The document with the sun's light: the extension's one light, its node a root of the scene. */
function withSun(document: Record<string, unknown>, sun: GlbSun | undefined): Record<string, unknown> {
  if (sun === undefined) return document
  const nodes = (document['nodes'] as object[] | undefined) ?? []
  const scenes = (document['scenes'] as { nodes?: number[] }[] | undefined) ?? [{}]
  const roots = scenes[0]?.nodes ?? []
  return {
    ...document,
    extensionsUsed: ['KHR_lights_punctual'],
    extensions: { KHR_lights_punctual: { lights: [{ name: GLB_SUN_NODE, type: 'directional', color: [1, 1, 1], intensity: sun.elevation > 0 ? SUN_LUX : 0 }] } },
    nodes: [...nodes, sunNode(sun)],
    scenes: [{ ...scenes[0], nodes: [...roots, nodes.length] }],
  }
}

/** The name of the node that holds the model when it is moved to where the plan's zero is. */
export const GLB_ORIGIN_NODE = 'origin'

/** VEW-64: the name of the root node of a whole building, the floors its children. */
export const GLB_BUILDING_NODE = 'building'

/** The site offset worth writing: none for (0, 0) or when none is given. */
const movedBy = (origin: readonly [number, number] | undefined): readonly [number, number] | null =>
  origin !== undefined && (origin[0] !== 0 || origin[1] !== 0) ? origin : null

/**
 * The asset block. HND-6: when the file leaves parts of the plan out, `asset.extras.gridLeftOut`
 * says so: a note in words, the count, and each part. `extras` is glTF's place for data of an
 * application's own, which every reader keeps and none acts on. JSON escapes the ids.
 */
function assetOf(leftOut: readonly LeftOutPart[], origin: readonly [number, number] | null, approximations: Approximations, holder: string = GLB_ORIGIN_NODE, north?: GlbNorth): object {
  // MSG-3: the label travels in the file, where glTF keeps data of the file's own.
  const extras: Record<string, unknown> = { label: GENERAL_GUIDANCE_LABEL }
  // CNT-58: the plan's north and place, so a renderer can turn the model to the compass.
  if (north !== undefined) extras['gridNorth'] = north
  if (origin !== null) {
    extras['gridOrigin'] = {
      x: origin[0],
      y: origin[1],
      // MSG-11: a file's own words are its English (`drawing.glb.origin`).
      note: english(said('drawing.glb.origin', { x: origin[0], y: origin[1], node: name(holder) }))
    }
  }
  if (leftOut.length > 0) {
    const note = [leftOutSummary(leftOut), ...leftOutLines(leftOut)]
    extras['gridLeftOut'] = { count: leftOut.length, note, parts: leftOut }
  }
  // CNT-18: `asset.extras.gridApproximated`, the curves written as facets, beside what is left out.
  if (approximations.parts.length > 0) {
    extras['gridApproximated'] = { count: approximations.parts.length, note: approximationLines(approximations), parts: approximations.parts }
  }
  return { version: '2.0', generator: GENERATOR, extras }
}

/** The parts' meshes in one buffer, and a node for each part, in the parts' order. */
interface Written {
  readonly binary: Uint8Array
  readonly accessors: object[]
  readonly bufferViews: object[]
  readonly meshes: object[]
  readonly nodes: object[]
  /** VEW-73: the materials the parts use, in `MESH_MATERIALS` order; a primitive's index is into these. */
  readonly materials: readonly MeshMaterial[]
}

/** A mesh as glTF draws it: flat normals and box-projected UVs, each point once per normal it carries. */
interface FlatMesh {
  /** glTF's frame: Y up. */
  readonly positions: readonly (readonly [number, number, number])[]
  readonly normals: readonly (readonly [number, number, number])[]
  readonly uvs: readonly (readonly [number, number])[]
  readonly indices: readonly number[]
}

const UP: Vec3 = { x: 0, y: 0, z: 1 }

/** A face's unit normal in the model's frame, from its winding; up for a face of no area. */
function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x }
  const length = Math.hypot(n.x, n.y, n.z)
  return length > 0 && Number.isFinite(length) ? { x: n.x / length, y: n.y / length, z: n.z / length } : UP
}

/**
 * VEW-73: a point's texture coordinates on a face, in metres, projected along the axis the face's
 * normal is nearest to (box projection), in the model's frame. Seen from the side the face faces,
 * u runs to the right and v down the picture (glTF's v), so a texture stands upright on a wall and
 * is not mirrored; on a floor or roof north is up the picture. `0 - …` so no -0 is stored.
 */
export function boxUv(p: Vec3, n: Vec3): readonly [number, number] {
  const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)]
  if (az >= ax && az >= ay) return n.z >= 0 ? [p.x, 0 - p.y] : [0 - p.x, 0 - p.y]
  if (ax >= ay) return n.x >= 0 ? [p.y, 0 - p.z] : [0 - p.y, 0 - p.z]
  return n.y >= 0 ? [0 - p.x, 0 - p.z] : [p.x, 0 - p.z]
}

/** Z up to Y up: (x, y, z) → (x, z, -y). A rotation, so winding is kept; `0 - y` so y = 0 is not -0. */
const yUp = (p: Vec3): [number, number, number] => [p.x, p.z, 0 - p.y]

/**
 * The mesh with flat normals: each face's corners carry its normal and the UV it projects them
 * to, and a point is written once for each normal it carries, so the faces of one plane share
 * their points and an edge between two planes stays sharp.
 */
function flatMesh(mesh: Mesh): FlatMesh {
  const positions: [number, number, number][] = []
  const normals: [number, number, number][] = []
  const uvs: (readonly [number, number])[] = []
  const indices: number[] = []
  const seen = new Map<string, number>()
  // Normals and UVs are worked out from the points as stored, 32 bits each, so two meshes whose
  // stored points are the same give the same file, whatever their last digits were.
  const stored = mesh.points.map((p) => ({ x: Math.fround(p.x), y: Math.fround(p.y), z: Math.fround(p.z) }))
  for (const face of mesh.faces) {
    const [a, b, c] = face.map((i) => stored[i]!) as [Vec3, Vec3, Vec3]
    const n = faceNormal(a, b, c)
    // Faces of one plane share their points: their normals agree to the ten-thousandth, whatever
    // the 32-bit rounding of their points gave each face.
    const key = yUp(n).map((c) => Math.round(c * 1e4)).join(',')
    for (const i of face) {
      const at = `${i}|${key}`
      let k = seen.get(at)
      if (k === undefined) {
        k = positions.length
        seen.set(at, k)
        const p = stored[i]!
        positions.push(yUp(p))
        normals.push(yUp(n))
        uvs.push(boxUv(p, n))
      }
      indices.push(k)
    }
  }
  return { positions, normals, uvs, indices }
}

function writeParts(parts: readonly Part[]): Written {
  const flats = parts.map((part) => flatMesh(part.mesh))
  // Per mesh: its positions, its normals, its UVs, then its indices. Every component is 4 bytes,
  // so every view and accessor stays 4-byte aligned with no padding in between.
  const size = flats.reduce((sum, f) => sum + f.positions.length * (12 + 12 + 8) + f.indices.length * 4, 0)
  const binary = new Uint8Array(size)
  const view = new DataView(binary.buffer)
  const used = MESH_MATERIALS.map((m) => m.name).filter((name) => parts.some((part) => part.material === name))

  const accessors: object[] = []
  const bufferViews: object[] = []
  const meshes: object[] = []
  const nodes: object[] = []
  let at = 0

  /** Writes rows of floats as one view and one accessor, the bounds when asked; returns the accessor's index. */
  const floats = (rows: readonly (readonly number[])[], type: 'VEC2' | 'VEC3', bounds: boolean): number => {
    const start = at
    const width = type === 'VEC2' ? 2 : 3
    const lo = Array<number>(width).fill(Infinity)
    const hi = Array<number>(width).fill(-Infinity)
    for (const row of rows) {
      for (const [k, value] of row.entries()) {
        // The bounds describe what is stored, which is the 32-bit value.
        const stored = Math.fround(value)
        view.setFloat32(at, stored, true)
        at += 4
        lo[k] = Math.min(lo[k]!, stored)
        hi[k] = Math.max(hi[k]!, stored)
      }
    }
    bufferViews.push({ buffer: 0, byteOffset: start, byteLength: at - start, target: ARRAY_BUFFER })
    accessors.push({ bufferView: bufferViews.length - 1, componentType: FLOAT, count: rows.length, type, ...(bounds ? { min: lo, max: hi } : {}) })
    return accessors.length - 1
  }

  for (const [index, part] of parts.entries()) {
    const flat = flats[index]!
    const position = floats(flat.positions, 'VEC3', true)
    const normal = floats(flat.normals, 'VEC3', false)
    const uv = floats(flat.uvs, 'VEC2', false)
    const indexStart = at
    for (const i of flat.indices) {
      view.setUint32(at, i, true)
      at += 4
    }
    bufferViews.push({ buffer: 0, byteOffset: indexStart, byteLength: at - indexStart, target: ELEMENT_ARRAY_BUFFER })
    accessors.push({ bufferView: bufferViews.length - 1, componentType: UNSIGNED_INT, count: flat.indices.length, type: 'SCALAR' })
    const indices = accessors.length - 1
    const name = part.name
    meshes.push({
      name,
      primitives: [{ attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv }, indices, material: used.indexOf(part.material) }]
    })
    const outdoor = part.outdoor
    nodes.push(outdoor === undefined ? { name, mesh: index } : { name, mesh: index, extras: { gridOutdoor: outdoor.kind, gridRoofed: outdoor.roofed } })
  }
  return { binary, accessors, bufferViews, meshes, nodes, materials: used }
}

/** The document around written parts, with `extra` nodes after the parts' and the scene's roots. */
function documentOf(asset: object, written: Written, extra: readonly object[], roots: readonly number[]): Record<string, unknown> {
  return {
    asset,
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes: [...written.nodes, ...extra],
    meshes: written.meshes,
    materials: written.materials.map(gltfMaterial),
    accessors: written.accessors,
    bufferViews: written.bufferViews,
    buffers: [{ byteLength: written.binary.byteLength }]
  }
}

/**
 * The scene as a GLB file.
 *
 * Pure and total: it never throws, never reads the clock or the filesystem, and
 * gives the same bytes for the same scene. Whatever the scene could not build is
 * already absent from it, so a broken plan exports the part that is sound — the
 * same graceful degradation the canvases apply.
 */
export function toGlb(scene: Scene3D, options: GlbOptions = {}): Uint8Array {
  const parts = partsOf(scene)
  const moved = movedBy(options.origin)
  const asset = assetOf(options.leftOut ?? [], moved, options.approximations ?? NO_APPROXIMATIONS, GLB_ORIGIN_NODE, options.north)
  if (parts.length === 0) return encodeGlb(withSun({ asset, scene: 0, scenes: [{}] }, options.sun), null)
  const written = writeParts(parts)
  const nodes = written.nodes
  // HND-11: a model built near zero is held by one node, moved to where the plan's zero is.
  // `0 - y`, as for the points, so y = 0 is not written as -0.
  const holder = moved === null ? [] : [{ name: GLB_ORIGIN_NODE, translation: [moved[0], 0, 0 - moved[1]], children: nodes.map((_, i) => i) }]
  return encodeGlb(withSun(documentOf(asset, written, holder, moved === null ? nodes.map((_, i) => i) : [nodes.length]), options.sun), written.binary)
}

export interface BuildingGlbOptions extends GlbOptions {
  /**
   * `building`: one root node (`GLB_BUILDING_NODE`) with a child node per floor, each moved up to
   * its elevation. `floor`: one floor asked for alone, its node the root, carrying its elevation.
   */
  readonly root: 'building' | 'floor'
}

/** A translation, or none when it moves nothing. `0 - y`, as for the points, so y = 0 is not -0. */
function translation(x: number, up: number, y: number): { translation?: number[] } {
  return x === 0 && up === 0 && y === 0 ? {} : { translation: [x, up, 0 - y] }
}

/**
 * VEW-64: floors stacked into one GLB. Each floor is a node named by its floor id, moved up to its
 * elevation, that holds its parts, with `extras.gridFloor` and `extras.gridElevation`; the floors
 * are the children of one root (`building`), which carries the site offset (HND-11) when there is
 * one. With `root: 'floor'` a single floor is the root itself, carrying the offset and its
 * elevation, so a file of one floor lands where that floor stands in the building.
 *
 * Pure and total, as `toGlb`: the same storeys give the same bytes.
 */
export function toBuildingGlb(storeys: readonly StoreyScene[], options: BuildingGlbOptions): Uint8Array {
  const nameOf = makeNamer()
  const perFloor = storeys.map((storey) => partsOf(storey.scene, nameOf))
  const parts = perFloor.flat()
  const moved = movedBy(options.origin)
  const asOne = options.root === 'floor' && storeys.length === 1
  const holderName = asOne ? storeys[0]!.id : GLB_BUILDING_NODE
  const asset = assetOf(options.leftOut ?? [], moved, options.approximations ?? NO_APPROXIMATIONS, holderName, options.north)
  if (parts.length === 0) return encodeGlb(withSun({ asset, scene: 0, scenes: [{}] }, options.sun), null)
  const written = writeParts(parts)
  const [ox, oy] = moved ?? [0, 0]

  const floors: object[] = []
  let first = 0
  for (const [k, storey] of storeys.entries()) {
    const count = perFloor[k]!.length
    const children = Array.from({ length: count }, (_, i) => first + i)
    first += count
    const lift = asOne ? translation(ox, storey.elevation, oy) : translation(0, storey.elevation, 0)
    floors.push({
      name: storey.id,
      ...lift,
      ...(children.length === 0 ? {} : { children }),
      extras: { gridFloor: storey.id, gridElevation: storey.elevation }
    })
  }
  const floorIndex = (k: number): number => written.nodes.length + k
  if (asOne) return encodeGlb(withSun(documentOf(asset, written, floors, [floorIndex(0)]), options.sun), written.binary)
  const root = { name: GLB_BUILDING_NODE, ...translation(ox, 0, oy), children: storeys.map((_, k) => floorIndex(k)) }
  return encodeGlb(withSun(documentOf(asset, written, [...floors, root], [floorIndex(storeys.length)]), options.sun), written.binary)
}
