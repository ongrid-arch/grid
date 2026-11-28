/**
 * CMD-55: what a 3D file draws each part in, past its kind: the plan's own materials (one per wall
 * type, door type, window type and room finish) and, for one floor, which part takes which, with
 * the room's insides the 3D view draws (`sceneInterior`): each finished wall face's lining and
 * each room's ceiling.
 *
 * - A wall takes its type's material; a glazed type's is glass. A door's leaves take its door
 *   type's (glass when the type is glazed), a window's frame and sashes its window type's; a
 *   window's glass stays glass.
 * - A room's floor takes its floor finish; a lining its finish; a ceiling its room's ceiling
 *   finish, else the kinds' `ceiling`.
 *
 * A material's colour is read from the words of its name (`finishTint`), as the 3D view tints a
 * finish; a name that says none takes its kind's colour. Pure: a plan in, plain data out.
 */

import type { FloorPlan } from '../plan'
import type { Scene3D, SceneOpening, SceneWall, Vec3 } from '../scene3d'
import type { OpeningPartKind } from '../openingParts'
import type { Vec2 } from '../vec2'
import { FINISH_SURFACES, openingGlazed, openingTypeOf, wallGlazed, wallTypeOf } from '../partTypes'
import { finishTint } from '../finishTint'
import { sceneInterior, type SceneCeiling, type SceneLining } from '../interior'
import { planInState } from '../phases'
import { limit } from '../tolerances'
import { triangulate } from '../triangulate'
import { MESH_MATERIALS, makeNamer, materialOf, type Face, type Mesh, type MeshMaterial } from './mesh'

/** What one of the plan's materials stands for. */
export type PlanMaterialSource =
  | { readonly kind: 'wallType' | 'doorType' | 'windowType'; readonly id: string; readonly typeName: string; readonly stated: string | null }
  | { readonly kind: 'finish'; readonly finish: string }

/** One of the plan's own materials, as a 3D file writes it. */
export interface PlanMaterial {
  /** Its name in the file: `walltype_<id>`, `doortype_<id>`, `windowtype_<id>` or `finish_<name>`. */
  readonly name: string
  readonly colour: readonly [number, number, number]
  readonly opacity: number
  /** Seen through: written blended and double-sided, as the kinds' `glass`. */
  readonly glass: boolean
  readonly source: PlanMaterialSource
}

const kindMaterial = (name: MeshMaterial): (typeof MESH_MATERIALS)[number] => MESH_MATERIALS.find((m) => m.name === name)!

/** `#rrggbb` as three numbers from 0 to 1, to the thousandth. */
function rgb(hex: string): readonly [number, number, number] {
  const channel = (k: number): number => Math.round((parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16) / 255) * 1000) / 1000
  return [channel(0), channel(1), channel(2)]
}

/** A material read from its words, else its kind's colour; glass in the kinds' glass. */
function looked(name: string, source: PlanMaterialSource, words: string, fallback: MeshMaterial, glass: boolean): PlanMaterial {
  if (glass) {
    const pane = kindMaterial('glass')
    return { name, colour: pane.colour, opacity: pane.opacity, glass: true, source }
  }
  const tint = finishTint(words)
  return { name, colour: tint === null ? kindMaterial(fallback).colour : rgb(tint), opacity: 1, glass: false, source }
}

/** Every finish a room or zone of the plan names, by name, sorted, each once. */
function planFinishNames(plan: Pick<FloorPlan, 'rooms'>): string[] {
  const names = new Set<string>()
  for (const room of plan.rooms) {
    const finishes = room.finishes
    if (finishes === undefined) continue
    for (const surface of FINISH_SURFACES) {
      const finish = finishes[surface]
      if (typeof finish === 'string') names.add(finish)
    }
    for (const face of finishes.faces ?? []) names.add(face.finish)
    for (const band of finishes.bands ?? []) names.add(band.finish)
  }
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * The plan's own materials: its wall types, door types and window types in the plan's order, then
 * every finish its rooms name, by name. Every floor of one plan reads the same list, so the files
 * of each floor name the same materials.
 */
export function planMaterials(plan: Pick<FloorPlan, 'types' | 'rooms'>): PlanMaterial[] {
  const nameOf = makeNamer()
  const out: PlanMaterial[] = []
  const seen = new Set<string>()
  const once = <T extends { readonly id: string }>(list: readonly T[] | undefined, kind: string): T[] =>
    (list ?? []).filter((type) => {
      const key = `${kind}\u0000${type.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  for (const type of once(plan.types?.walls, 'wall')) {
    const glass = wallGlazed(plan, { wallType: type.id })
    out.push(looked(nameOf('walltype', type.id), { kind: 'wallType', id: type.id, typeName: type.name, stated: type.material ?? null }, type.material ?? type.name, 'wall', glass))
  }
  for (const type of once(plan.types?.doors, 'door')) {
    const glass = openingGlazed(plan, { type: 'door', doorType: type.id })
    out.push(looked(nameOf('doortype', type.id), { kind: 'doorType', id: type.id, typeName: type.name, stated: type.material ?? null }, type.material ?? type.name, 'door', glass))
  }
  for (const type of once(plan.types?.windows, 'window')) {
    out.push(looked(nameOf('windowtype', type.id), { kind: 'windowType', id: type.id, typeName: type.name, stated: type.material ?? null }, type.material ?? type.name, 'frame', false))
  }
  for (const finish of planFinishNames(plan)) out.push(looked(nameOf('finish', finish), { kind: 'finish', finish }, finish, 'wall', false))
  return out
}

/** A room's lining or ceiling as a part of the file: its room, its finish, its material and its mesh. */
export interface SurfacePart {
  readonly kind: 'lining' | 'ceiling'
  readonly room: string
  /** The finish it shows, or null for a ceiling whose room names none. */
  readonly finish: string | null
  readonly material: string
  readonly mesh: Mesh
}

/** One floor's parts as a 3D file draws them: the materials its parts take by id, and its rooms' insides. */
export interface StoreySurfaces {
  /** A wall's type material, by wall id. */
  readonly walls: ReadonlyMap<string, string>
  /** A door's leaves' type material, by opening id. */
  readonly doors: ReadonlyMap<string, string>
  /** A window's frame and sashes' type material, by opening id. */
  readonly windows: ReadonlyMap<string, string>
  /** A room's floor finish material, by room id. */
  readonly floors: ReadonlyMap<string, string>
  /** The linings of each room's finished wall faces, a part per room and finish, in room order. */
  readonly linings: readonly SurfacePart[]
  /** Each room's ceiling, every height of it one part, in room order. */
  readonly ceilings: readonly SurfacePart[]
}

/** No materials of the plan's own: every part in its kind's. */
export const NO_SURFACES: StoreySurfaces = { walls: new Map(), doors: new Map(), windows: new Map(), floors: new Map(), linings: [], ceilings: [] }

/** Meshes one after the other as one. */
function joinedMesh(meshes: readonly Mesh[]): Mesh | null {
  const points: Vec3[] = []
  const faces: Face[] = []
  for (const mesh of meshes) {
    const base = points.length
    points.push(...mesh.points)
    for (const [a, b, c] of mesh.faces) faces.push([base + a, base + b, base + c])
  }
  return faces.length === 0 ? null : { points, faces }
}

/**
 * A lining as a flat surface facing into its room (on the left of its side), a hair off the
 * wall's face (`liningOffset`, a band twice as far), open over its holes; as the 3D view draws it.
 */
export function liningMesh(lining: SceneLining): Mesh | null {
  const dx = lining.to.x - lining.from.x
  const dy = lining.to.y - lining.from.y
  const length = Math.hypot(dx, dy)
  if (!(length > 0) || !(lining.top > lining.bottom)) return null
  const outline: Vec2[] = [{ x: 0, y: lining.bottom }, { x: length, y: lining.bottom }, { x: length, y: lining.top }, { x: 0, y: lining.top }]
  const holes = lining.holes.map((h): Vec2[] => [{ x: h.along[0], y: h.rise[0] }, { x: h.along[0], y: h.rise[1] }, { x: h.along[1], y: h.rise[1] }, { x: h.along[1], y: h.rise[0] }])
  const { vertices, triangles } = triangulate(outline, holes)
  if (triangles.length === 0) return null
  const inset = limit('liningOffset') * (lining.band ? 2 : 1)
  const ux = dx / length
  const uy = dy / length
  const points = vertices.map((v) => ({ x: lining.from.x + ux * v.x - uy * inset, y: lining.from.y + uy * v.x + ux * inset, z: v.y }))
  // Counter-clockwise on (along, up) faces the side's right: each triangle turned, to face the room.
  return { points, faces: triangles.map(([a, b, c]): Face => [a, c, b]) }
}

/** A ceiling's pieces as one surface facing down, a hair under its height (`liningOffset`). */
export function ceilingMesh(ceiling: SceneCeiling): Mesh | null {
  const z = ceiling.z - limit('liningOffset')
  const meshes = ceiling.pieces.flatMap((piece): Mesh[] => {
    const { vertices, triangles } = triangulate(piece.outline, piece.holes)
    return triangles.length === 0 ? [] : [{ points: vertices.map((v) => ({ x: v.x, y: v.y, z })), faces: triangles.map(([a, b, c]): Face => [a, c, b]) }]
  })
  return joinedMesh(meshes)
}

/**
 * One floor's surfaces: `slice` is the floor's own plan (`planForFloor`), `scene` the scene built
 * from it, `clearHeight` the storey's, which a room that states no height reaches, and
 * `materials` the plan's (`planMaterials`).
 */
export function storeySurfaces(slice: FloorPlan, scene: Pick<Scene3D, 'slabs' | 'walls' | 'openings'>, clearHeight: number, materials: readonly PlanMaterial[]): StoreySurfaces {
  const plan = planInState(slice, 'after')
  const typeName = new Map(materials.flatMap((m) => (m.source.kind === 'finish' ? [] : [[`${m.source.kind}\u0000${m.source.id}`, m.name] as const])))
  const finishName = new Map(materials.flatMap((m) => (m.source.kind === 'finish' ? [[m.source.finish, m.name] as const] : [])))

  const walls = new Map<string, string>()
  const drawnWalls = new Set(scene.walls.map((w) => w.id))
  for (const wall of plan.walls) {
    if (!drawnWalls.has(wall.id)) continue
    const type = wallTypeOf(plan, wall)
    const name = type === null ? undefined : typeName.get(`wallType\u0000${type.id}`)
    if (name !== undefined) walls.set(wall.id, name)
  }

  const doors = new Map<string, string>()
  const windows = new Map<string, string>()
  const drawnOpenings = new Set(scene.openings.map((o) => o.id))
  for (const opening of plan.openings) {
    if (!drawnOpenings.has(opening.id)) continue
    const type = openingTypeOf(plan, opening)
    if (type === null) continue
    const name = typeName.get(`${opening.type === 'door' ? 'doorType' : 'windowType'}\u0000${type.id}`)
    if (name !== undefined) (opening.type === 'door' ? doors : windows).set(opening.id, name)
  }

  const floors = new Map<string, string>()
  const slabRooms = new Set(scene.slabs.map((s) => s.roomId))
  for (const room of plan.rooms) {
    const floor = room.finishes?.floor
    const name = floor === undefined ? undefined : finishName.get(floor)
    if (slabRooms.has(room.id) && name !== undefined) floors.set(room.id, name)
  }

  const interior = sceneInterior(slice, scene, clearHeight)
  // A part per room and finish, in the order the rooms' first linings come.
  const byRoom = new Map<string, Map<string, Mesh[]>>()
  for (const lining of interior.linings) {
    const mesh = liningMesh(lining)
    if (mesh === null) continue
    const own = byRoom.get(lining.room) ?? new Map<string, Mesh[]>()
    byRoom.set(lining.room, own)
    own.set(lining.finish, [...(own.get(lining.finish) ?? []), mesh])
  }
  const linings: SurfacePart[] = []
  for (const [room, finishes] of byRoom) {
    for (const [finish, meshes] of finishes) {
      const mesh = joinedMesh(meshes)
      const material = finishName.get(finish)
      if (mesh !== null && material !== undefined) linings.push({ kind: 'lining', room, finish, material, mesh })
    }
  }

  const ceilingsByRoom = new Map<string, { finish: string | null; meshes: Mesh[] }>()
  for (const ceiling of interior.ceilings) {
    const mesh = ceilingMesh(ceiling)
    if (mesh === null) continue
    const own = ceilingsByRoom.get(ceiling.room) ?? { finish: ceiling.finish, meshes: [] }
    own.meshes.push(mesh)
    ceilingsByRoom.set(ceiling.room, own)
  }
  const ceilings: SurfacePart[] = []
  for (const [room, { finish, meshes }] of ceilingsByRoom) {
    const mesh = joinedMesh(meshes)
    const material = finish === null ? 'ceiling' : finishName.get(finish) ?? 'ceiling'
    if (mesh !== null) ceilings.push({ kind: 'ceiling', room, finish, material, mesh })
  }

  return { walls, doors, windows, floors, linings, ceilings }
}

/** A wall's material: a party wall's cut, else its type's, else glass for a glazed one, else `wall`. */
export function wallMaterial(wall: Pick<SceneWall, 'id' | 'glazed' | 'cut'>, surfaces: StoreySurfaces): string {
  if (wall.cut === true) return 'cut'
  return surfaces.walls.get(wall.id) ?? (wall.glazed === true ? 'glass' : 'wall')
}

/**
 * A part of a door or window's material: a door's leaves its type's, else glass when it is glazed;
 * a window's frame and sashes its type's; glass is glass, and every other part its kind's.
 */
export function openingPartMaterial(opening: Pick<SceneOpening, 'id' | 'type' | 'glazed'>, part: OpeningPartKind, surfaces: StoreySurfaces): string {
  if (part === 'glass') return 'glass'
  if (opening.type === 'door') return part === 'leaf' ? surfaces.doors.get(opening.id) ?? (opening.glazed === true ? 'glass' : 'door') : materialOf(part)
  return surfaces.windows.get(opening.id) ?? materialOf(part)
}

/** A room's floor's material: its floor finish's, else `floor`. */
export function floorMaterial(roomId: string, surfaces: StoreySurfaces): string {
  return surfaces.floors.get(roomId) ?? 'floor'
}
