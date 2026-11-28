/**
 * HND-6: which parts of the plan an export leaves out, and whether it holds anything at all.
 *
 * Worked out from the validation the exporters skip by, and nothing else: each floor the file
 * holds is sliced (`planForFloor`) and validated (`validatePlan`) as the views and the IFC do, and
 * a part is left out exactly when that floor's `broken` set holds its id. An opening that no floor
 * holds is left out too: its wall is not in the plan, or its wall's id is used on several floors,
 * which `planForFloor` drops from every slice. Its reason is the whole plan's line for it, the
 * one `grid check` gives. Then the parts the reader left out (MSG-6), which are not in the plan
 * at all, by their place in the file.
 *
 * The validation here leaves the spaces out (`spaces: false`): they add warnings and never change
 * `broken`.
 */
import type { FloorPlan } from '../types/floorplan'
import type { PartList, ReadFault } from '../types/readParts'
import { planFloors, planForFloor } from '../geometry/floors'
import { validatePlan, type Issue } from '../geometry/validate'
import type { ApproximatedPart, LeftOutKind, LeftOutPart } from '../geometry/export/leftOut'
import { roomWallIds } from '../geometry/plan'
import { itemSolid } from '../geometry/items'
import { isMassing } from '../geometry/massing'
import { siteFloors } from '../geometry/site'

export interface ExportContents {
  /** What the file leaves out, in the order: read, then by floor, walls, rooms, openings, fixtures. */
  readonly leftOut: readonly LeftOutPart[]
  /** True when the file holds no wall, room, fixture or massing floor: nothing of the plan. */
  readonly empty: boolean
  /**
   * CNT-18: the curved solid walls the file holds, and the rooms it holds that run along a curved
   * wall, by floor; each format says which of them it writes as straight pieces.
   */
  readonly curved: { readonly walls: readonly ApproximatedPart[]; readonly rooms: readonly ApproximatedPart[] }
}

const KIND_OF_LIST: Readonly<Record<PartList, LeftOutKind>> = {
  walls: 'wall',
  rooms: 'room',
  openings: 'opening',
  floors: 'floor',
  items: 'item',
  patterns: 'pattern'
}

/** The code of the first line that names the part, an error before a warning. */
function codeOf(issues: readonly Issue[], kind: LeftOutKind, id: string): string | null {
  const named = issues.filter((issue) => issue.id === id && (issue.entity === kind || issue.entity === 'plan'))
  return (named.find((issue) => issue.severity === 'error') ?? named[0])?.code ?? null
}

/** The parts the reader left out (MSG-6), which no floor holds: by their place in the file. */
export function readLeftOut(faults: readonly ReadFault[]): LeftOutPart[] {
  const parts: LeftOutPart[] = []
  for (const fault of faults) {
    if (fault.kind !== 'part-left-out' && fault.kind !== 'id-clash') continue
    parts.push({
      kind: KIND_OF_LIST[fault.part.list],
      id: fault.part.id,
      place: `${fault.part.list}[${fault.part.index}]`,
      floor: null,
      code: fault.kind === 'id-clash' ? 'plan/id-clash' : 'plan/part-left-out'
    })
  }
  return parts
}

/** The ids of the walls the reader left out, as `readPlanParts` gives them to `validatePlan`. */
function readWalls(faults: readonly ReadFault[]): string[] {
  return faults.flatMap((fault) =>
    (fault.kind === 'part-left-out' || fault.kind === 'id-clash') && fault.part.list === 'walls' && fault.part.id !== null ? [fault.part.id] : []
  )
}

/**
 * What an export of `floorIds` leaves out of `plan`, and whether it is empty. `plan` is the plan
 * as the exporter reads it (in id order, QAR-5), so the list comes in the same order every time.
 * `faults` are the reader's, when the plan was read from a file.
 */
export function exportContents(plan: FloorPlan, floorIds: readonly string[], faults: readonly ReadFault[] = []): ExportContents {
  const leftOut = readLeftOut(faults)
  // Given to each validation, so a part on a wall the reader left out is named for it, as
  // `grid check` names it. It adds no part to `broken` that the plan holds.
  const leftOutWalls = new Set(readWalls(faults))
  let drawn = 0
  const held = new Set<object>()
  const curvedWalls: ApproximatedPart[] = []
  const curvedRooms: ApproximatedPart[] = []

  for (const floor of planFloors(plan)) {
    const slice = planForFloor(plan, floor.id)
    for (const opening of slice.openings) held.add(opening)
    if (!floorIds.includes(floor.id)) continue
    const { issues, broken } = validatePlan(slice, undefined, { spaces: false, leftOutWalls })
    // CMD-56: a floor that is massing, an outline and no walls, is in every file: its outline in
    // the DXF, a proxy in the IFC, its slab in each.
    if (isMassing(plan, floor.id)) drawn++
    const add = (kind: LeftOutKind, id: string, counts: boolean): void => {
      if (broken.has(id)) leftOut.push({ kind, id, place: null, floor: floor.id, code: codeOf(issues, kind, id) })
      else if (counts) drawn++
    }
    for (const wall of slice.walls) add('wall', wall.id, true)
    for (const room of slice.rooms) add('room', room.id, true)
    for (const opening of slice.openings) add('opening', opening.id, false)
    // CNT-48: an item the checks pass but Grid has no solid for is left out of the GLB and the
    // OBJ, so it is counted here as a broken one is, and no file holds fewer than it says.
    for (const item of slice.items ?? []) {
      if (!broken.has(item.id) && itemSolid(item).length === 0) leftOut.push({ kind: 'item', id: item.id, place: null, floor: floor.id, code: null })
      else add('item', item.id, true)
    }
    const floorName = floor.id
    const curved = new Set(slice.walls.filter((wall) => wall.arc !== undefined && !broken.has(wall.id)).map((wall) => wall.id))
    for (const wall of slice.walls) if (curved.has(wall.id) && wall.virtual !== true) curvedWalls.push({ kind: 'wall', id: wall.id, floor: floorName })
    for (const room of slice.rooms) {
      if (!broken.has(room.id) && roomWallIds(room).some((id) => curved.has(id))) curvedRooms.push({ kind: 'room', id: room.id, floor: floorName })
    }
  }

  // An opening no floor holds goes with every file that holds a floor with a wall of its wall's
  // id, named with the first such floor; with no such wall anywhere, with every file and no floor.
  const orphans = plan.openings.filter((opening) => !held.has(opening))
  if (orphans.length > 0) {
    const { issues } = validatePlan(plan, undefined, { spaces: false, leftOutWalls })
    const floorsOfWall = new Map<string, string[]>()
    for (const floor of planFloors(plan)) {
      for (const wall of planForFloor(plan, floor.id).walls) floorsOfWall.set(wall.id, [...(floorsOfWall.get(wall.id) ?? []), floor.id])
    }
    for (const opening of orphans) {
      const floors = floorsOfWall.get(opening.wall) ?? []
      const inFile = floors.filter((floor) => floorIds.includes(floor))
      if (floors.length > 0 && inFile.length === 0) continue
      leftOut.push({ kind: 'opening', id: opening.id, place: null, floor: inFile[0] ?? null, code: codeOf(issues, 'opening', opening.id) })
    }
  }

  return { leftOut, empty: drawn === 0, curved: { walls: curvedWalls, rooms: curvedRooms } }
}

/**
 * CMD-56: the site's things (C13) a file that writes none of them leaves out: each named on the
 * first floor of `floorIds` the site is drawn on (`siteFloors`), and none when the file holds no
 * such floor, since the site is drawn on no other.
 */
export function siteLeftOut(plan: FloorPlan, floorIds: readonly string[]): LeftOutPart[] {
  const things = plan.site?.things ?? []
  if (things.length === 0) return []
  const drawnOn = new Set(siteFloors(plan))
  const floor = floorIds.find((id) => drawnOn.has(id))
  if (floor === undefined) return []
  return things.map((thing) => ({ kind: 'site', id: thing.id, place: null, floor, code: null }))
}
