/**
 * Turns a saved plan into the bytes of an export file. The caller names a format and a
 * floor, and gets the file's bytes back.
 *
 * DXF is what the 2D view draws: the floor named, or (VEW-72) every floor when none is, each on a
 * layout of its own at the largest standard scale it fits at. IFC is the whole building, one storey per floor. OBJ and GLB (VEW-64) are the whole building
 * as the 3D view stacks it when no floor is named, each floor at its elevation, and one floor at
 * its elevation when one is.
 *
 * Every format writes the plan's parts in id order (QAR-5), so the same building gives the
 * same bytes whatever order its file lists them in.
 *
 * LVL-8: opening patterns are expanded into plain openings before any format reads the plan.
 *
 * VEW-73: OBJ and GLB may leave the roofs out (`roofs: false`) and write curved walls with a given
 * number of pieces to a whole circle (`arcSegments`); an OBJ comes with its materials (`materials`).
 *
 * HND-6: every export also says what it leaves out (`leftOut`), and the file says it too, each
 * format in its own way (see `geometry/export/leftOut.ts`). `empty` says the file holds nothing
 * of the plan: the library still writes it, and the command and the tool server refuse it.
 */
import type { FloorPlan } from '../types/floorplan'
import type { ReadFault } from '../types/readParts'
import { buildFloorPlan, buildScene, sceneGround, siteScene, dxfFactsOf, dxfSheets, floorElevations, inIdOrder, nearOrigin, planFloors, planForFloor, resolveFloor, roomNumbers, shownRoomNumber, toBuildingGlb, toBuildingObj, toDxfFloors, toIfc, withPatterns } from '../geometry'
import { toMtl, type StoreyScene } from '../geometry/export/obj'
import type { BuildingGlbOptions, GlbNorth, GlbSun } from '../geometry/export/gltf'
import type { Vec2 } from '../geometry/vec2'
import { planOrientation } from '../geometry/orientation'
import { planPlace, type PlanSun } from '../geometry/sunShade'
import type { Scene3D } from '../geometry/scene3d'
import type { DxfProfile } from '../geometry/export/dxfProfile'
import type { DxfFloor, DxfOpeningFacts, DxfSheet } from '../geometry/export/dxf'
import type { ApproximatedPart, Approximations, LeftOutPart } from '../geometry/export/leftOut'
import { curveDeviation } from '../geometry/arc'
import { exportContents, type ExportContents } from './leftOut'

export type { ApproximatedPart, Approximations, LeftOutKind, LeftOutPart } from '../geometry/export/leftOut'
export { countText, kindsText, leftOutByKind, partName, partNames } from '../geometry/export/leftOut'
// VEW-80: what a file of the floors held leaves out, for the data the CLI writes from its survey.
export { exportContents, type ExportContents } from './leftOut'

export type ExportFormat = 'dxf' | 'ifc' | 'obj' | 'glb'

export const EXPORT_FORMATS: readonly ExportFormat[] = ['dxf', 'ifc', 'obj', 'glb']

// Dialog filter names stay in plain language; the extension names the tool's own format.
const FILTER_NAMES: Record<ExportFormat, string> = {
  dxf: 'AutoCAD drawing (DXF)',
  ifc: 'BIM model (IFC)',
  obj: '3D model (OBJ)',
  glb: '3D model (GLB)',
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value)
}

export interface PlanExportOptions {
  /** The IFC's project identity when the plan stores none (`FloorPlan.projectId` wins). */
  readonly projectId: string
  readonly projectName: string
  /**
   * The floor to export. DXF: the floor shown in the views, the ground floor when missing. OBJ and
   * GLB (VEW-64): every floor when missing, that floor alone when given. A stale id falls back to
   * the ground floor in every format.
   */
  readonly floorId?: string | null
  readonly now: Date
  /** What the reader did with the plan file (MSG-6): the parts it left out are named too. */
  readonly faults?: readonly ReadFault[]
  /** HND-1: the DXF's layers, pens and scale; Grid's neutral profile when left out. */
  readonly dxfProfile?: DxfProfile
  /**
   * VEW-72: the DXF's scale as stated, 100 for 1:100; left out, the largest standard scale every
   * floor fits at. The profile's scale is not read here: the caller states it when its file does.
   */
  readonly dxfScale?: number
  /**
   * VEW-72: each opening's mark and schedule type, by id, from the schedules: the DXF's MARK and
   * TYPE attributes and the IFC's Tag. Left out, an opening is marked by its id.
   */
  readonly openingMarks?: ReadonlyMap<string, { readonly mark: string; readonly type: string | null }>
  /** VEW-73: OBJ and GLB: false leaves every roof and its parapet out. Left out, they are in. */
  readonly roofs?: boolean
  /** VEW-73: OBJ and GLB: the straight pieces a whole circle of curved wall is written with (`ARC_SEGMENTS_RANGE`). */
  readonly arcSegments?: number
  /** CNT-58: GLB: the sun at a moment, written as a directional light node named `sun`. None when left out. */
  readonly sun?: { readonly sun: PlanSun; readonly utcOffset: number | null }
}

/** CNT-58: the north and place a GLB carries, when the plan states either. */
function glbNorth(plan: FloorPlan): GlbNorth | undefined {
  const orientation = planOrientation(plan)
  const place = planPlace(plan)
  if (orientation.north === null && place === null && !orientation.yAxisStated) return undefined
  return { north: orientation.north, yAxis: orientation.yAxis, ...(place === null ? {} : { latitude: place.latitude, longitude: place.longitude }) }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** CNT-58: the sun as the GLB writes it, in the file's axes (x, up, -y). */
function glbSun(asked: NonNullable<PlanExportOptions['sun']>): GlbSun {
  const { sun, utcOffset } = asked
  const e = (sun.position.elevation * Math.PI) / 180
  const d = sun.moment.day
  const minutes = ((Math.round(sun.moment.minutes) % 1440) + 1440) % 1440
  const r = (v: number): number => Math.round(v * 1e9) / 1e9 + 0
  return {
    toward: [r(Math.cos(e) * sun.toward.x), r(Math.sin(e)), r(-Math.cos(e) * sun.toward.y)],
    azimuth: Math.round(sun.position.azimuth * 10) / 10,
    elevation: Math.round(sun.position.elevation * 10) / 10,
    date: `${String(d.year).padStart(4, '0')}-${pad2(d.month)}-${pad2(d.day)}`,
    time: `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`,
    utcOffset,
  }
}

export interface PlanExport {
  readonly data: string | Uint8Array
  readonly fileName: string
  readonly filter: { name: string; extensions: string[] }
  /** HND-6: the parts of the plan this file leaves out, which the file names too. */
  readonly leftOut: readonly LeftOutPart[]
  /** HND-6: the file holds no wall, room or fixture of the plan. */
  readonly empty: boolean
  /**
   * CNT-18: the parts the file writes with their curve as straight pieces, which the file names
   * beside what it leaves out. Empty for a plan with no curved wall.
   */
  readonly approximated: readonly ApproximatedPart[]
  /** VEW-64: the floors the file holds, lowest level first, each with its elevation in metres. */
  readonly floors: readonly HeldFloor[]
  /** VEW-64: the ids of the plan's floors the file does not hold, lowest level first. */
  readonly floorsLeftOut: readonly string[]
  /** VEW-72: a DXF's sheets, one per floor it holds: the scale, whether stated, and whether the floor fits. Empty for the other formats. */
  readonly sheets: readonly DxfSheet[]
  /** VEW-73: an OBJ's materials, the text of `OBJ_MATERIALS_FILE`, to write beside it; null for the other formats. */
  readonly materials: string | null
}

/** VEW-64: a floor an export holds, and where its floor level stands above the ground floor's. */
export interface HeldFloor {
  readonly id: string
  readonly elevation: number
}

/**
 * CNT-18: which curved parts each format writes as straight pieces. The DXF writes a curved
 * wall's faces and a curved dividing line as true arcs, and only the room outlines along them
 * as pieces; the IFC writes a curved wall's axis as a true arc and its body, the spaces and the
 * slabs as pieces; the OBJ and the GLB are triangles, so their walls are flat facets and their
 * floors' outlines pieces.
 */
function approximationsOf(plan: FloorPlan, format: ExportFormat, contents: ExportContents, perCircle?: number): Approximations {
  const parts = format === 'dxf' ? contents.curved.rooms : [...contents.curved.walls, ...contents.curved.rooms]
  if (parts.length === 0) return { parts, off: 0 }
  // VEW-73: measured at the pieces the walls are written with.
  const pieces = format === 'obj' || format === 'glb' ? perCircle : undefined
  const off = Math.max(0, ...plan.walls.filter((wall) => wall.arc !== undefined).map((wall) => curveDeviation(wall, pieces)))
  return { parts, off }
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** `my-house.dxf`, or `my-house-first.dxf` when a multi-floor plan exports one floor. */
export function exportFileName(projectName: string, format: ExportFormat, floorName: string | null): string {
  const base = slug(projectName) || 'floor-plan'
  const floor = floorName === null ? '' : slug(floorName)
  return `${floor ? `${base}-${floor}` : base}.${format}`
}

/** The plan's floors, lowest level first; floors sharing a level keep the plan's order, as the 3D view stacks them. */
function floorsUp(plan: FloorPlan): string[] {
  return planFloors(plan)
    .map((floor, order) => ({ floor, order }))
    .sort((a, b) => a.floor.level - b.floor.level || a.order - b.order)
    .map(({ floor }) => floor.id)
}

/**
 * VEW-64: the floors of a 3D file, each built at its own floor level and placed at its elevation
 * (`floorElevations`, the rule the 3D view and the IFC stack by). HND-11 (lab MS-12): a 32-bit
 * point holds about seven digits, so for the GLB a plan at survey coordinates is moved near zero
 * once, on the whole plan, from the site's origin when the plan states one, and each floor is cut
 * from the moved plan, so every slice still reads its shell and stairs from the whole; the file's
 * root node moves it back (`nearOrigin`, `GlbOptions.origin`). The OBJ writes its numbers as
 * text and keeps them as they are.
 */
function storeysOf(plan: FloorPlan, floorIds: readonly string[], near: boolean, asked: Pick<PlanExportOptions, 'roofs' | 'arcSegments'> = {}): { storeys: StoreyScene[]; origin: readonly [number, number] } {
  const moved = near ? nearOrigin(plan) : { plan, at: [0, 0] as const }
  const levels = floorElevations(moved.plan).floors
  const sceneOf = (id: string): Scene3D => {
    const scene = buildScene(planForFloor(moved.plan, id), asked.arcSegments === undefined ? {} : { arcSegments: asked.arcSegments })
    // VEW-73: roofs left out, and the parapets that stand on them.
    return asked.roofs === false && scene.shell !== null ? { ...scene, shell: { ...scene.shell, roof: null, parapet: null } } : scene
  }
  const storeys = floorIds.map((id) => ({ id, elevation: levels.get(id)?.floorLevel ?? 0, scene: sceneOf(id) }))
  return { storeys, origin: moved.at }
}

/**
 * CNT-60: the site a GLB of the whole building carries: its blocks (`siteScene`) and, when the site
 * states a plot, the ground cut to it (`sceneGround`), moved by `at` as the storeys were
 * (`nearOrigin`), so they land where the building does. None when the plan has neither.
 */
function glbSite(plan: FloorPlan, at: readonly [number, number]): BuildingGlbOptions['site'] {
  const blocks = siteScene(plan).blocks
  const ground = plan.site?.boundary === undefined ? null : sceneGround(plan, 0)
  if (blocks.length === 0 && ground === null) return undefined
  const [dx, dy] = at
  if (dx === 0 && dy === 0) return { ground, blocks }
  const shift = (p: Vec2): Vec2 => ({ x: p.x - dx, y: p.y - dy })
  const moved = ground === null
    ? null
    : {
        level: ground.level,
        // The slope's rise at a point is read where the point was.
        ...(ground.tilt === undefined ? {} : { tilt: { ...ground.tilt, at: ground.tilt.at + ground.tilt.x * dx + ground.tilt.y * dy } }),
        pieces: ground.pieces.map((polygon) => polygon.map((ring) => ring.map(([x, y]): [number, number] => [x - dx, y - dy])))
      }
  return { ground: moved, blocks: blocks.map((block) => ({ ...block, outline: block.outline.map(shift) })) }
}

/** CNT-58: the GLB's north and sun options, each only when there is one. */
function withNorthAndSun(plan: FloorPlan, options: PlanExportOptions): { north?: GlbNorth; sun?: GlbSun } {
  const north = glbNorth(plan)
  return { ...(north === undefined ? {} : { north }), ...(options.sun === undefined ? {} : { sun: glbSun(options.sun) }) }
}

export function exportPlan(stated: FloorPlan, format: ExportFormat, options: PlanExportOptions): PlanExport {
  // LVL-8: every format reads plain openings; a pattern is expanded into them first, so a plan
  // with a pattern exports exactly what the same plan with those openings written out does.
  const plan = withPatterns(stated)
  const filter = { name: FILTER_NAMES[format], extensions: [format] }
  const ordered = inIdOrder(plan)
  if (format === 'ifc') {
    const contents = exportContents(ordered, planFloors(ordered).map((floor) => floor.id), options.faults)
    const approximations = approximationsOf(ordered, format, contents)
    const marks = options.openingMarks === undefined ? {} : { marks: new Map([...options.openingMarks].map(([id, own]) => [id, own.mark] as const)) }
    const data = toIfc(plan, { projectId: options.projectId, projectName: plan.name ?? plan.title ?? options.projectName, timestamp: options.now, leftOut: contents.leftOut, approximations, ...marks })
    const levels = floorElevations(ordered).floors
    const floors = floorsUp(ordered).map((id) => ({ id, elevation: levels.get(id)?.floorLevel ?? 0 }))
    return { data, fileName: exportFileName(options.projectName, format, null), filter, leftOut: contents.leftOut, empty: contents.empty, approximated: approximations.parts, floors, floorsLeftOut: [], sheets: [], materials: null }
  }

  // VEW-64: OBJ and GLB hold every floor unless one is named; VEW-72: and so does DXF, each floor
  // on a layout of its own. A stale id falls back to the ground floor.
  const whole = options.floorId === undefined || options.floorId === null
  const floorId = resolveFloor(plan, options.floorId)
  const allFloors = floorsUp(ordered)
  const held = whole ? allFloors : [floorId]
  const contents = exportContents(ordered, held, options.faults)
  const approximations = approximationsOf(ordered, format, contents, options.arcSegments)
  const note = { leftOut: contents.leftOut, approximations }
  let data: string | Uint8Array
  let floors: HeldFloor[]
  let sheets: DxfSheet[] = []
  if (format === 'dxf') {
    const levels = floorElevations(ordered).floors
    const numbered = roomNumbers(ordered)
    const listed = planFloors(ordered)
    const dxfFloors = held.map((id): DxfFloor => {
      const storey = planForFloor(ordered, id)
      const stated = listed.find((f) => f.id === id)
      // CNT-9: the DXF writes the facts of the floor's parts and of the floor itself.
      const facts = dxfFactsOf(storey, stated ?? null)
      // HND-1: each room's tag carries its number, counted across the whole building (ARE-12).
      // CNT-59: a room's tag from another tool in its place.
      const tagOf = new Map(storey.rooms.flatMap((room) => (room.identity?.tag === undefined ? [] : [[room.id, room.identity.tag] as const])))
      const numbers = new Map(numbered.filter((n) => n.floor === id).map((n) => [n.id, tagOf.get(n.id) ?? shownRoomNumber(n)]))
      // VEW-72: each opening's mark, type, height and sill for its block's attributes. CNT-59: a
      // tag from another tool is its mark.
      const openings = new Map(storey.openings.map((o) => [o.id, { mark: o.identity?.tag ?? options.openingMarks?.get(o.id)?.mark ?? o.id, type: options.openingMarks?.get(o.id)?.type ?? null, height: o.height, sill: o.sill } satisfies DxfOpeningFacts] as const))
      // HND-6, CNT-18: in a file of several floors, each floor names what it leaves out of itself.
      const own = <T extends { readonly floor: string | null }>(parts: readonly T[]): T[] => (held.length === 1 ? [...parts] : parts.filter((part) => part.floor === id || (part.floor === null && id === held[0])))
      return { id, name: stated?.name || id, drawing: buildFloorPlan(storey), leftOut: own(contents.leftOut), approximations: { ...approximations, parts: own(approximations.parts) }, facts, roomNumbers: numbers, openings }
    })
    const scale = options.dxfScale ?? 'fit'
    data = toDxfFloors(dxfFloors, { scale, ...(options.dxfProfile === undefined ? {} : { profile: options.dxfProfile }) })
    sheets = dxfSheets(dxfFloors, scale)
    floors = held.map((id) => ({ id, elevation: levels.get(id)?.floorLevel ?? 0 }))
  } else {
    const { storeys, origin } = storeysOf(ordered, held, format === 'glb', options)
    const site = format === 'glb' && whole ? glbSite(ordered, origin) : undefined
    data = format === 'obj' ? toBuildingObj(storeys, note) : toBuildingGlb(storeys, { ...note, origin, root: whole ? 'building' : 'floor', ...withNorthAndSun(plan, options), ...(site === undefined ? {} : { site }) })
    floors = storeys.map(({ id, elevation }) => ({ id, elevation }))
  }
  const heldIds = new Set(held)
  const floorsLeftOut = allFloors.filter((id) => !heldIds.has(id))
  const planFloorList = planFloors(plan)
  const floor = planFloorList.find((f) => f.id === floorId)
  const floorName = !whole && planFloorList.length > 1 ? (floor?.name || floorId) : null
  return { data, fileName: exportFileName(options.projectName, format, floorName), filter, leftOut: contents.leftOut, empty: contents.empty, approximated: approximations.parts, floors, floorsLeftOut, sheets, materials: format === 'obj' ? toMtl() : null }
}
