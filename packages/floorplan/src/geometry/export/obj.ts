/**
 * OBJ export — the open 3D interchange format SketchUp reads.
 *
 * OBJ before glTF on purpose: it is plain text, a `v` per point and an `f` per
 * face, with no buffers, accessors or base64 to get wrong. When the first
 * export looks off, the bug is in the geometry and nowhere else.
 *
 * Input is a `Scene3D`, not a `FloorPlan`: it is exactly what Canvas3D draws,
 * with the doors and windows already cut out of the wall elevations and the
 * broken geometry already dropped, so the file cannot disagree with what the
 * user saw.
 *
 * Coordinates are the model's own: metres, X and Y as on the plan, Z up (C4).
 * OBJ has no unit or axis field, so the header comment says so; an importer that
 * wants Y up has to turn the model itself, as it would for any Z-up source.
 *
 * VEW-73: each object is drawn in the material of its kind (`usemtl wall` and so on), from
 * `grid.mtl` (`OBJ_MATERIALS_FILE`, `toMtl`), which the export writes beside the OBJ. The name
 * is fixed because the materials are: every OBJ Grid writes can share one file.
 */

import type { Scene3D } from '../scene3d'
import { MESH_MATERIALS, OPENING_PART_KINDS, columnMesh, floorMesh, itemMesh, makeNamer, materialOf, openingPartMesh, shellMesh, stairMesh, wallMesh } from './mesh'
import type { Mesh } from './mesh'
import { GENERAL_GUIDANCE_LABEL } from '../rules/types'
import { approximationLines, leftOutLines, leftOutSummary, type Approximations, type LeftOutPart } from './leftOut'
import { english, said } from '../../messages/say'

/** VEW-73: the materials file every OBJ names (`mtllib`), written beside it. */
export const OBJ_MATERIALS_FILE = 'grid.mtl'

/**
 * VEW-73: the text of `grid.mtl`: a material for each kind (`MESH_MATERIALS`), by its name, in the
 * same colours as the GLB's, glass seen through. The same text every time.
 */
export function toMtl(): string {
  const lines = [`# ${GENERAL_GUIDANCE_LABEL}`, '# Grid materials, one per kind of part']
  for (const material of MESH_MATERIALS) {
    const [r, g, b] = material.colour.map((c) => c.toFixed(3))
    lines.push('', `newmtl ${material.name}`, 'Ka 0.000 0.000 0.000', `Kd ${r} ${g} ${b}`, 'Ks 0.000 0.000 0.000', `d ${material.opacity.toFixed(3)}`, 'illum 1')
  }
  return `${lines.join('\n')}\n`
}

/** Avoids `-0.000000`, which readers parse and nobody wants to read. */
function num(value: number): string {
  const fixed = value.toFixed(6)
  return fixed === '-0.000000' ? '0.000000' : fixed
}

export interface ObjOptions {
  /** HND-6: the parts of the plan this file leaves out, named in comments after the header. */
  readonly leftOut?: readonly LeftOutPart[]
  /** CNT-18: the curves it writes as flat facets and straight pieces, named after them. */
  readonly approximations?: Approximations
}

/**
 * A comment line. OBJ has no escape: a line break would end the comment and start a command, so
 * every character a line could break at is dropped. Ids are JSON strings already (`partName`).
 */
function objComment(text: string): string {
  return `# ${text.replace(/[\p{Cc}\u2028\u2029]/gu, '')}`
}

/** The objects of one scene, appended to `lines`: its points raised by `lift`, its faces after `offset` points. */
function writeScene(scene: Scene3D, lines: string[], nameOf: (prefix: string, id: string) => string, offset: number, lift: number): number {
  const write = (prefix: string, id: string, mesh: Mesh | null): void => {
    if (!mesh) return

    lines.push(`o ${nameOf(prefix, id)}`, `usemtl ${materialOf(prefix)}`)
    for (const p of mesh.points) lines.push(`v ${num(p.x)} ${num(p.y)} ${num(p.z + lift)}`)
    // OBJ indices are 1-based and global across the whole file.
    for (const [a, b, c] of mesh.faces) {
      lines.push(`f ${offset + a + 1} ${offset + b + 1} ${offset + c + 1}`)
    }
    offset += mesh.points.length
  }

  for (const wall of scene.walls) write('wall', wall.id, wallMesh(wall))
  for (const slab of scene.slabs) {
    // CNT-7 (C26): an outdoor space's floor says so, its kind and whether a roof covers it (lab EL-18).
    if (slab.outdoor !== undefined && floorMesh(slab) !== null) lines.push(`# grid-outdoor ${slab.outdoor.kind} roofed=${slab.outdoor.roofed}`)
    write('floor', slab.roomId, floorMesh(slab))
  }
  for (const stair of scene.stairs) write('stair', stair.id, stairMesh(stair))
  // CNT-16: each column, once, whole.
  for (const column of scene.columns ?? []) write('column', column.id, columnMesh(column))
  // CNT-42: each fixture and piece of furniture, as its kind's blocks.
  for (const item of scene.items ?? []) write('item', item.id, itemMesh(item))
  // CNT-14: each door's and window's frame, leaves and glass.
  for (const opening of scene.openings) for (const part of OPENING_PART_KINDS) write(part, opening.id, openingPartMesh(opening, part))
  // LVL-4: the slab the floor stands on, its roof and its parapet.
  const shell = scene.shell
  if (shell !== null) {
    write('slab', shell.floor, shellMesh(shell.slab))
    if (shell.roof) write('roof', shell.floor, shellMesh([shell.roof]))
    if (shell.parapet) write('parapet', shell.floor, shellMesh([shell.parapet]))
  }
  return offset
}

/** The header, and what the file leaves out and writes as pieces, as comments. */
function headerOf(options: ObjOptions): string[] {
  const lines = [`# ${GENERAL_GUIDANCE_LABEL}`, '# Grid floor plan', '# Units: metres. X and Y are the plan, Z is up.', `mtllib ${OBJ_MATERIALS_FILE}`]
  // HND-6: what the file leaves out, as comments after the header. Only when something is.
  const leftOut = options.leftOut ?? []
  if (leftOut.length > 0) lines.push(...[leftOutSummary(leftOut), ...leftOutLines(leftOut)].map(objComment))
  if (options.approximations !== undefined) lines.push(...approximationLines(options.approximations).map(objComment))
  return lines
}

/**
 * The scene as an OBJ document, one object per wall and per room, then the stairs, the columns (CNT-16), each door's
 * and window's frame, leaves and glass (CNT-14), and the floor's slab, roof and parapet (LVL-4).
 *
 * Pure and total: it never throws and never reads the filesystem. Whatever the
 * scene could not build is already absent from it, so a broken plan exports the
 * part that is sound — the same graceful degradation the canvases apply.
 */
export function toObj(scene: Scene3D, options: ObjOptions = {}): string {
  const lines = headerOf(options)
  writeScene(scene, lines, makeNamer(), 0, 0)
  return `${lines.join('\n')}\n`
}

/** VEW-64: one floor of a building: its id, where its floor level stands, and its scene. The GLB takes the same. */
export interface StoreyScene {
  readonly id: string
  /** Metres: its floor level above the ground floor's (`floorElevations`). */
  readonly elevation: number
  /** The floor's scene, built at its own floor level (z = 0). */
  readonly scene: Scene3D
}

/**
 * VEW-64: floors stacked into one OBJ. OBJ has no nodes and no transforms, so each floor's points
 * are written at its height in the building, and each floor's objects follow a comment line
 * `# grid-floor "<id>" elevation=<metres>`. No `g` line groups them: some readers make one object
 * of a group, which would melt a floor's walls into one. The header says the heights are the
 * building's. One namer serves the file, so the parts of every floor keep names of their own.
 */
export function toBuildingObj(storeys: readonly StoreyScene[], options: ObjOptions = {}): string {
  const lines = headerOf(options)
  // MSG-11: a file's own words are the English of their keys.
  lines.push(objComment(english(said('drawing.obj.stacked'))))
  const nameOf = makeNamer()
  let offset = 0
  for (const storey of storeys) {
    lines.push(objComment(`grid-floor ${JSON.stringify(storey.id)} elevation=${num(storey.elevation)}`))
    offset = writeScene(storey.scene, lines, nameOf, offset, storey.elevation)
  }
  return `${lines.join('\n')}\n`
}
