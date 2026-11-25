/**
 * Turns a saved plan into the bytes of an export file. The caller names a format and a
 * floor, and gets the file's bytes back.
 *
 * DXF, OBJ and GLB are what the 2D and 3D views draw, one floor at a time, so they export the
 * floor the user is looking at. IFC is the whole building, one storey per floor.
 *
 * Every format writes the plan's parts in id order (QAR-5), so the same building gives the
 * same bytes whatever order its file lists them in.
 *
 * LVL-8: opening patterns are expanded into plain openings before any format reads the plan.
 *
 * HND-6: every export also says what it leaves out (`leftOut`), and the file says it too, each
 * format in its own way (see `geometry/export/leftOut.ts`). `empty` says the file holds nothing
 * of the plan: the library still writes it, and the command and the tool server refuse it.
 */
import type { FloorPlan } from '../types/floorplan'
import type { ReadFault } from '../types/readParts'
import { buildFloorPlan, buildScene, dxfFactsOf, inIdOrder, nearOrigin, planFloors, planForFloor, resolveFloor, roomNumbers, shownRoomNumber, toDxf, toGlb, toIfc, toObj, withPatterns } from '../geometry'
import type { DxfProfile } from '../geometry/export/dxfProfile'
import type { ApproximatedPart, Approximations, LeftOutPart } from '../geometry/export/leftOut'
import { curveDeviation } from '../geometry/arc'
import { exportContents, type ExportContents } from './leftOut'

export type { ApproximatedPart, Approximations, LeftOutKind, LeftOutPart } from '../geometry/export/leftOut'
export { countText, kindsText, leftOutByKind, partName, partNames } from '../geometry/export/leftOut'

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
  /** The floor shown in the views; a missing or stale id falls back to the lowest floor. */
  readonly floorId?: string | null
  readonly now: Date
  /** What the reader did with the plan file (MSG-6): the parts it left out are named too. */
  readonly faults?: readonly ReadFault[]
  /** HND-1: the DXF's layers, pens and scale; Grid's neutral profile when left out. */
  readonly dxfProfile?: DxfProfile
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
}

/**
 * CNT-18: which curved parts each format writes as straight pieces. The DXF writes a curved
 * wall's faces and a curved dividing line as true arcs, and only the room outlines along them
 * as pieces; the IFC writes a curved wall's axis as a true arc and its body, the spaces and the
 * slabs as pieces; the OBJ and the GLB are triangles, so their walls are flat facets and their
 * floors' outlines pieces.
 */
function approximationsOf(plan: FloorPlan, format: ExportFormat, contents: ExportContents): Approximations {
  const parts = format === 'dxf' ? contents.curved.rooms : [...contents.curved.walls, ...contents.curved.rooms]
  if (parts.length === 0) return { parts, off: 0 }
  const off = Math.max(0, ...plan.walls.filter((wall) => wall.arc !== undefined).map(curveDeviation))
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

/**
 * HND-11 (lab MS-12): the GLB of one floor. A 32-bit point holds about seven digits, so a floor at
 * survey coordinates is built near zero, from the site's origin when the plan states one, and
 * the file's one node is moved back by that offset (`nearOrigin`, `GlbOptions.origin`). DXF, IFC
 * and OBJ write their numbers as text and keep them as they are.
 */
function glbOf(storey: FloorPlan, note: { readonly leftOut: readonly LeftOutPart[] }): Uint8Array {
  const near = nearOrigin(storey)
  return toGlb(buildScene(near.plan), { ...note, origin: near.at })
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
    const data = toIfc(plan, { projectId: options.projectId, projectName: plan.name ?? plan.title ?? options.projectName, timestamp: options.now, leftOut: contents.leftOut, approximations })
    return { data, fileName: exportFileName(options.projectName, format, null), filter, leftOut: contents.leftOut, empty: contents.empty, approximated: approximations.parts }
  }

  const floorId = resolveFloor(plan, options.floorId)
  const contents = exportContents(ordered, [floorId], options.faults)
  const storey = planForFloor(ordered, floorId)
  const approximations = approximationsOf(ordered, format, contents)
  const note = { leftOut: contents.leftOut, approximations }
  // CNT-9: the DXF writes the facts of the floor's parts and of the floor itself.
  const facts = dxfFactsOf(storey, planFloors(ordered).find((f) => f.id === floorId) ?? null)
  // HND-1: each room's tag carries its number, counted across the whole building (ARE-12).
  const numbers = (): Map<string, string> => new Map(roomNumbers(ordered).filter((n) => n.floor === floorId).map((n) => [n.id, shownRoomNumber(n)]))
  const profile = options.dxfProfile === undefined ? {} : { profile: options.dxfProfile }
  const data = format === 'dxf' ? toDxf(buildFloorPlan(storey), { ...note, facts, roomNumbers: numbers(), ...profile })
    : format === 'obj' ? toObj(buildScene(storey), note)
    : glbOf(storey, note)
  const floors = planFloors(plan)
  const floor = floors.find((f) => f.id === floorId)
  const floorName = floors.length > 1 ? (floor?.name || floorId) : null
  return { data, fileName: exportFileName(options.projectName, format, floorName), filter, leftOut: contents.leftOut, empty: contents.empty, approximated: approximations.parts }
}
