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
 * GLB, not `.gltf`: one binary file with no base64 and no second file, which is
 * the form SketchUp documents. The result is bytes because a file is bytes; the
 * caller decides where they go.
 */

import type { Scene3D } from '../scene3d'
import { OPENING_PART_KINDS, columnMesh, floorMesh, makeNamer, openingPartMesh, shellMesh, stairMesh, wallMesh } from './mesh'
import type { Mesh } from './mesh'
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
 * One plain grey for everything. It is not styling: a primitive with no material
 * gets glTF's default, which is fully metallic and renders dark in several
 * viewers. Not double-sided on purpose, so a winding mistake shows as a missing
 * face instead of being hidden.
 */
const MATERIAL = {
  pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 1 }
}

/**
 * CNT-14: the glass of the windows and of a door's fixed panel, pale and seen through. Written only
 * when the file holds glass, so a file with none is as before.
 */
const GLASS = {
  name: 'glass',
  pbrMetallicRoughness: { baseColorFactor: [0.7, 0.82, 0.9, 0.35], metallicFactor: 0, roughnessFactor: 0.1 },
  alphaMode: 'BLEND',
  doubleSided: true
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
  /** CNT-14: drawn in the glass material. */
  readonly glass?: true
  /** CNT-7 (C26): an outdoor space's floor says so in its node's `extras` (lab EL-18). */
  readonly outdoor?: { readonly kind: string; readonly roofed: boolean }
}

/**
 * Everything the scene could build, walls first, then room floors, stairs, columns (CNT-16), the
 * doors' and windows' parts (CNT-14) and the shell (LVL-4), as OBJ lists them. VEW-64: one namer
 * serves a whole file, so the parts of every floor keep names of their own.
 */
function partsOf(scene: Scene3D, nameOf: (prefix: string, id: string) => string = makeNamer()): Part[] {
  const parts: Part[] = []
  for (const wall of scene.walls) {
    const mesh = wallMesh(wall)
    if (mesh) parts.push({ name: nameOf('wall', wall.id), mesh })
  }
  for (const slab of scene.slabs) {
    const mesh = floorMesh(slab)
    if (mesh) parts.push({ name: nameOf('floor', slab.roomId), mesh, ...(slab.outdoor === undefined ? {} : { outdoor: slab.outdoor }) })
  }
  for (const stair of scene.stairs) {
    const mesh = stairMesh(stair)
    if (mesh) parts.push({ name: nameOf('stair', stair.id), mesh })
  }
  // CNT-16: each column, once, whole.
  for (const column of scene.columns ?? []) {
    const mesh = columnMesh(column)
    if (mesh) parts.push({ name: nameOf('column', column.id), mesh })
  }
  // CNT-14: each door's and window's frame, leaves and glass; the glass in its own material.
  for (const opening of scene.openings) {
    for (const kind of OPENING_PART_KINDS) {
      const mesh = openingPartMesh(opening, kind)
      if (mesh) parts.push({ name: nameOf(kind, opening.id), mesh, ...(kind === 'glass' ? { glass: true as const } : {}) })
    }
  }
  // LVL-4: the slab the floor stands on, its roof and its parapet.
  const shell = scene.shell
  if (shell !== null) {
    const add = (prefix: string, mesh: Mesh | null): void => {
      if (mesh) parts.push({ name: nameOf(prefix, shell.floor), mesh })
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
function assetOf(leftOut: readonly LeftOutPart[], origin: readonly [number, number] | null, approximations: Approximations, holder: string = GLB_ORIGIN_NODE): object {
  // MSG-3: the label travels in the file, where glTF keeps data of the file's own.
  const extras: Record<string, unknown> = { label: GENERAL_GUIDANCE_LABEL }
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
}

function writeParts(parts: readonly Part[]): Written {
  // Per mesh: its positions, then its indices. Both are 4 bytes a component, so
  // every view and accessor stays 4-byte aligned with no padding in between.
  const size = parts.reduce((sum, p) => sum + p.mesh.points.length * 12 + p.mesh.faces.length * 12, 0)
  const binary = new Uint8Array(size)
  const view = new DataView(binary.buffer)

  const accessors: object[] = []
  const bufferViews: object[] = []
  const meshes: object[] = []
  const nodes: object[] = []
  let at = 0

  for (const [index, { name, mesh }] of parts.entries()) {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    const positionStart = at
    for (const p of mesh.points) {
      // Z up to Y up: (x, y, z) → (x, z, -y). A rotation, so winding is kept.
      // `0 - y` and not `-y`: the latter turns y = 0 into -0, which JSON prints
      // as 0 and the stored data would not match.
      const coords = [p.x, p.z, 0 - p.y]
      for (const [k, value] of coords.entries()) {
        // The bounds describe what is stored, which is the 32-bit value.
        const stored = Math.fround(value)
        view.setFloat32(at, stored, true)
        at += 4
        lo[k] = Math.min(lo[k]!, stored)
        hi[k] = Math.max(hi[k]!, stored)
      }
    }
    const indexStart = at
    for (const face of mesh.faces) {
      for (const i of face) {
        view.setUint32(at, i, true)
        at += 4
      }
    }

    bufferViews.push(
      { buffer: 0, byteOffset: positionStart, byteLength: indexStart - positionStart, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: indexStart, byteLength: at - indexStart, target: ELEMENT_ARRAY_BUFFER }
    )
    accessors.push(
      {
        bufferView: index * 2,
        componentType: FLOAT,
        count: mesh.points.length,
        type: 'VEC3',
        min: lo,
        max: hi
      },
      {
        bufferView: index * 2 + 1,
        componentType: UNSIGNED_INT,
        count: mesh.faces.length * 3,
        type: 'SCALAR'
      }
    )
    meshes.push({
      name,
      primitives: [{ attributes: { POSITION: index * 2 }, indices: index * 2 + 1, material: parts[index]!.glass ? 1 : 0 }]
    })
    const outdoor = parts[index]!.outdoor
    nodes.push(outdoor === undefined ? { name, mesh: index } : { name, mesh: index, extras: { gridOutdoor: outdoor.kind, gridRoofed: outdoor.roofed } })
  }
  return { binary, accessors, bufferViews, meshes, nodes }
}

/** The document around written parts, with `extra` nodes after the parts' and the scene's roots. */
function documentOf(asset: object, parts: readonly Part[], written: Written, extra: readonly object[], roots: readonly number[]): object {
  return {
    asset,
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes: [...written.nodes, ...extra],
    meshes: written.meshes,
    materials: parts.some((part) => part.glass) ? [MATERIAL, GLASS] : [MATERIAL],
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
  const asset = assetOf(options.leftOut ?? [], moved, options.approximations ?? NO_APPROXIMATIONS)
  if (parts.length === 0) return encodeGlb({ asset, scene: 0, scenes: [{}] }, null)
  const written = writeParts(parts)
  const nodes = written.nodes
  // HND-11: a model built near zero is held by one node, moved to where the plan's zero is.
  // `0 - y`, as for the points, so y = 0 is not written as -0.
  const holder = moved === null ? [] : [{ name: GLB_ORIGIN_NODE, translation: [moved[0], 0, 0 - moved[1]], children: nodes.map((_, i) => i) }]
  return encodeGlb(documentOf(asset, parts, written, holder, moved === null ? nodes.map((_, i) => i) : [nodes.length]), written.binary)
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
  const asset = assetOf(options.leftOut ?? [], moved, options.approximations ?? NO_APPROXIMATIONS, holderName)
  if (parts.length === 0) return encodeGlb({ asset, scene: 0, scenes: [{}] }, null)
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
  if (asOne) return encodeGlb(documentOf(asset, parts, written, floors, [floorIndex(0)]), written.binary)
  const root = { name: GLB_BUILDING_NODE, ...translation(ox, 0, oy), children: storeys.map((_, k) => floorIndex(k)) }
  return encodeGlb(documentOf(asset, parts, written, [...floors, root], [floorIndex(storeys.length)]), written.binary)
}
