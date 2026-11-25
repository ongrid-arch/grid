/**
 * Columns (CNT-16, C25; lab EL-6): where each stands, the floor it covers, the room it is taken
 * off, the floors it rises through and what is worth a look about it.
 *
 * A column is a thing of its own: never a wall (it closes no outline and is never a short wall),
 * never a room and never a fixture (C6). It is square (a rectangle when its depth differs from
 * its width) or round. The room it stands in is found from the outlines, never named: the
 * smallest room on its floor whose floor holds its middle, zones aside (a zone's floor is its
 * room's, CNT-8). The floor it covers inside that room's outline (ARE-1) is taken off the room's
 * area, so an open office with three columns measures what it measures by hand.
 *
 * A column may rise `through` floors above its own, as a wall does (LVL-5, C19, `through.ts`): it
 * stands on each of those floors, and each floor's slice (`planForFloor`) holds it as a column of
 * that floor (`columnPart` says which column of the plan it is). What draws the building whole
 * (the 3D view, the exports) draws it once, from its own floor to its top (`columnRise`).
 *
 * Pure: a plan in, shapes, areas and issues out. Never throws on a plan the schema reads.
 */

import type { Column } from '../types/floorplan'
import type { FloorPlan, PlanIndex, Room } from './plan'
import { floorOf, planFloors } from './floors'
import { throughProblem, wallFloorIds } from './through'
import { floorElevations } from './elevations'
import { tryRoomShape, type RoomShape } from './room'
import { roomZones } from './zones'
import { pointInPolygon } from './innerPoint'
import { intersectionArea, ringOf } from './polygons'
import { limit, tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { area } from './vec2'
import { english, joined, name, said, type Said } from '../messages/say'
import { withSaid } from './issueWords'
import { likelyId } from '../types/nearest'
import type { Issue } from './validate'

export { COLUMN_SHAPES, type Column, type ColumnShape } from '../types/floorplan'

// ── Its shape ────────────────────────────────────────────────────────────────────────────────

/** A column's depth: its own, else its width (a square, or a round column's diameter). */
export const columnDepth = (column: Pick<Column, 'width' | 'depth'>): number => column.depth ?? column.width

/**
 * The floor a column covers, counter-clockwise: a square column's four corners, turned about its
 * middle, or a round column as `columnRoundPieces` straight sides round its circle.
 */
export function columnFootprint(column: Column): Vec2[] {
  const [x, y] = column.at
  if (column.shape === 'round') {
    const r = column.width / 2
    const steps = limit('columnRoundPieces')
    const out: Vec2[] = []
    for (let i = 0; i < steps; i++) {
      const t = (2 * Math.PI * i) / steps
      out.push({ x: x + r * Math.cos(t), y: y + r * Math.sin(t) })
    }
    return out
  }
  const turn = ((column.turn ?? 0) * Math.PI) / 180
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const w = column.width / 2
  const d = columnDepth(column) / 2
  const corner = (u: number, v: number): Vec2 => ({ x: x + c * u - s * v, y: y + s * u + c * v })
  return [corner(-w, -d), corner(w, -d), corner(w, d), corner(-w, d)]
}

/** The floor a column covers, in square metres: a round column's is the true circle's. */
export function columnArea(column: Pick<Column, 'shape' | 'width' | 'depth'>): number {
  return column.shape === 'round' ? (Math.PI * column.width * column.width) / 4 : column.width * columnDepth(column)
}

// ── The floors it stands on ──────────────────────────────────────────────────────────────────

/** What a slice's column is of the plan's: the column as stated, and whether this is its own floor. */
export interface ColumnPart {
  readonly whole: Column
  readonly base: boolean
}

const parts = new WeakMap<Column, ColumnPart>()

/** The column of the plan a slice's column is (CNT-16 with LVL-5), or null for a column as stated. */
export function columnPart(column: Column): ColumnPart | null {
  return parts.get(column) ?? null
}

/**
 * The floors a column stands on: its own first, then each floor above it, by level, up to the one
 * it rises `through`. One whose `through` reaches no floor above its own stands on its own floor
 * only (`columnIssues` says so).
 */
export function columnFloorIds(plan: FloorPlan, column: Column): string[] {
  return wallFloorIds(plan, column)
}

/** Whether a column stands on a floor: its own, or one it rises through. */
export function columnStandsOn(plan: FloorPlan, column: Column, floorId: string): boolean {
  if (column.through === undefined || column.through === floorOf(column)) return floorOf(column) === floorId
  return columnFloorIds(plan, column).includes(floorId)
}

/**
 * The columns a floor's slice holds: each column standing on it, as a column of that floor (no
 * `through`), marked with the column of the plan it is (`columnPart`). Undefined when the plan
 * states no columns, so a slice of such a plan keeps no key.
 */
export function sliceColumns(plan: FloorPlan, floorId: string): Column[] | undefined {
  if (plan.columns === undefined) return undefined
  const out: Column[] = []
  for (const column of plan.columns) {
    if (!columnStandsOn(plan, column, floorId)) continue
    if (column.through === undefined) {
      out.push(column)
      continue
    }
    const { through: _through, ...rest } = column
    void _through
    const copy: Column = { ...rest, floor: floorId }
    const whole = parts.get(column)?.whole ?? column
    parts.set(copy, { whole, base: floorOf(whole) === floorId })
    out.push(copy)
  }
  return out
}

/** The columns standing on a floor, as stated (or, on a slice, as the slice holds them). */
export function columnsOnFloor(plan: FloorPlan, floorId: string): Column[] {
  return (plan.columns ?? []).filter((column) => columnStandsOn(plan, column, floorId))
}

/**
 * How high a column rises above its own floor's level: to the top of the floor it rises through,
 * its stated `height` above that floor's level, else that floor's storey height. `plan` is the
 * whole plan; a slice's column is read as the column of the plan it is.
 */
export function columnRise(plan: FloorPlan, column: Column): number {
  const levels = floorElevations(plan).floors
  const floors = columnFloorIds(plan, column)
  const own = levels.get(floors[0]!)
  const top = levels.get(floors[floors.length - 1]!)
  const height = column.height ?? top?.clearHeight ?? 0
  if (own === undefined || top === undefined) return height
  return Math.max(0, top.floorLevel + height - own.floorLevel)
}

// ── The room it stands in, and the floor it takes ───────────────────────────────────────────

/** The rooms a column may stand in: every room whose outline closes, zones aside, with its shape. */
function roomsOf(index: PlanIndex): { room: Room; shape: RoomShape }[] {
  const zones = roomZones(index)
  return index.plan.rooms.flatMap((room) => {
    if (zones.zoneOf.has(room.id)) return []
    const shape = tryRoomShape(room, index)
    return shape === null ? [] : [{ room, shape }]
  })
}

/** The room a column stands in: the smallest room on its floor whose floor holds its middle, or null. */
export function columnRoom(column: Column, rooms: readonly { readonly room: Room; readonly shape: RoomShape }[], floorId: string = floorOf(column)): Room | null {
  const at = { x: column.at[0], y: column.at[1] }
  let best: { room: Room; area: number } | null = null
  for (const { room, shape } of rooms) {
    if (floorOf(room) !== floorId) continue
    if (!pointInPolygon(at, shape.polygon, shape.holes)) continue
    const size = area(shape.polygon)
    if (best === null || size < best.area) best = { room, area: size }
  }
  return best?.room ?? null
}

/** What the columns take off each room of an index, by room id, worked out once per index. */
const taken = new WeakMap<PlanIndex, ReadonlyMap<string, { readonly area: number; readonly columns: readonly string[] }>>()

/**
 * The floor the columns standing in a room cover inside its outline, less its holes: each column
 * cut to the room's floor, a round one scaled to its true circle. 0 for a room no column stands
 * in, and for every room of a plan with no columns.
 */
export function roomColumnArea(room: Room, index: PlanIndex): number {
  return columnsTaken(index).get(room.id)?.area ?? 0
}

/** The columns standing in a room, by id, in plan order. Empty for a room none stands in. */
export function roomColumns(room: Room, index: PlanIndex): readonly string[] {
  return columnsTaken(index).get(room.id)?.columns ?? []
}

function columnsTaken(index: PlanIndex): ReadonlyMap<string, { readonly area: number; readonly columns: readonly string[] }> {
  const columns = index.plan.columns ?? []
  if (columns.length === 0) return EMPTY
  let found = taken.get(index)
  if (found !== undefined) return found
  const out = new Map<string, { area: number; columns: string[] }>()
  try {
    const rooms = roomsOf(index)
    const floorIds = new Set(index.plan.rooms.map(floorOf))
    const out_ = leftOutColumns(index.plan)
    for (const column of columns) {
      if (out_.has(column)) continue
      for (const floorId of floorIds) {
        if (!columnStandsOn(index.plan, column, floorId)) continue
        const footprint = columnFootprint(column)
        const drawn = area(footprint)
        // CNT-33: every room the column stands in takes its own clipped share, so a column on a
        // room line comes off both and the shares add up to the column's floor.
        for (const { room, shape } of rooms) {
          if (floorOf(room) !== floorId) continue
          let cut: number
          try {
            cut = intersectionArea([ringOf(shape.polygon), ...shape.holes.map(ringOf)], [ringOf(footprint)])
          } catch {
            // The library failed on this room: the column's own floor, if its middle is in the room.
            cut = pointInPolygon({ x: column.at[0], y: column.at[1] }, shape.polygon, shape.holes) ? drawn : 0
          }
          const share = drawn > 0 ? (cut / drawn) * columnArea(column) : 0
          if (!(share > tolerance('noArea'))) continue
          const entry = out.get(room.id) ?? { area: 0, columns: [] }
          entry.area += share
          entry.columns.push(column.id)
          out.set(room.id, entry)
        }
      }
    }
  } catch {
    // A plan whose rooms cannot be read takes nothing off them.
  }
  found = out
  taken.set(index, found)
  return found
}

const EMPTY: ReadonlyMap<string, { readonly area: number; readonly columns: readonly string[] }> = new Map()

/** A column whose numbers Grid can build: every one finite and within `largest`. */
export function soundColumn(column: Column): boolean {
  const numbers = [column.at[0], column.at[1], column.width, columnDepth(column), column.turn ?? 0, column.height ?? 1]
  return numbers.every((value) => Number.isFinite(value) && Math.abs(value) <= tolerance('largest')) && column.width > 0 && columnDepth(column) > 0
}

// ── What is worth a look ─────────────────────────────────────────────────────────────────────

/** A column named in a sentence: its label when it states one, else its id. */
export function columnSaid(column: Pick<Column, 'id' | 'label'>): Said {
  return column.label === undefined || column.label.trim() === ''
    ? said('issue.part.column', { id: name(column.id) })
    : said('issue.part.column.labelled', { id: name(column.id), label: name(column.label) })
}

/** Why a column is left out of every view, measure and export, or null when it is not. */
type ColumnFault = 'too-large' | 'duplicate-id' | 'unknown-floor'

function columnFaults(plan: FloorPlan): Map<Column, ColumnFault> {
  const columns = plan.columns ?? []
  const faults = new Map<Column, ColumnFault>()
  if (columns.length === 0) return faults
  const others = new Set<string>([
    ...plan.walls.map((w) => w.id),
    ...plan.rooms.map((r) => r.id),
    ...plan.openings.map((o) => o.id),
    ...(plan.items ?? []).map((i) => i.id),
  ])
  const counts = new Map<string, number>()
  for (const column of columns) counts.set(column.id, (counts.get(column.id) ?? 0) + 1)
  const floorIds = new Set(planFloors(plan).map((floor) => floor.id))
  for (const column of columns) {
    if (!soundColumn(column)) faults.set(column, 'too-large')
    else if ((counts.get(column.id) ?? 0) > 1 || others.has(column.id)) faults.set(column, 'duplicate-id')
    else if (!floorIds.has(floorOf(column))) faults.set(column, 'unknown-floor')
  }
  return faults
}

/** The columns the drawing's checks leave out of every view, measure and export (`columnIssues`). */
export function leftOutColumns(plan: FloorPlan): ReadonlySet<Column> {
  return new Set(columnFaults(plan).keys())
}

/** The columns of a plan that are drawn, measured and exported: every one the checks do not leave out. */
export function soundColumns(plan: FloorPlan): Column[] {
  const out = leftOutColumns(plan)
  return (plan.columns ?? []).filter((column) => !out.has(column))
}

const issueOf = (id: string, code: string, sentence: Said, severity: Issue['severity']): Issue =>
  withSaid({ entity: 'plan', id, code, message: english(sentence), severity }, sentence)

/**
 * The drawing's checks on the plan's columns (CNT-16). Errors (the column is left out of every
 * view, measure and export, as `leftOutColumns` says; its id is not put in `broken`, which an id
 * shared with another part would leave out too): an id another part or column has, a floor the
 * plan does not have, a number Grid cannot build. A warning: a `through` that reaches no floor
 * above the column's own, which then stands on its own floor only.
 */
export function columnIssues(plan: FloorPlan): Issue[] {
  const columns = plan.columns ?? []
  if (columns.length === 0) return []
  const issues: Issue[] = []
  const faults = columnFaults(plan)
  const floors = planFloors(plan)
  const floorIds = floors.map((floor) => floor.id)
  for (const column of columns) {
    const noun = columnSaid(column)
    const fault = faults.get(column)
    const floor = floorOf(column)
    if (fault !== undefined) {
      if (fault === 'unknown-floor') {
        const meant = likelyId(floor, floorIds)
        const sentence = meant === null
          ? said('issue.plan/column-unknown-floor', { column: noun, floor: name(floor) })
          : said('issue.plan/column-unknown-floor.meant', { column: noun, floor: name(floor), meant: name(meant) })
        issues.push(issueOf(column.id, 'plan/column-unknown-floor', sentence, 'error'))
      } else {
        issues.push(issueOf(column.id, `plan/column-${fault}`, said(`issue.plan/column-${fault}`, { column: noun }), 'error'))
      }
      continue
    }
    // A slice's column has no `through`: the whole plan says it once.
    const problem = throughProblem(plan, column)
    if (problem !== null) {
      const own = floors.find((x) => x.id === floor)?.level ?? 0
      const above = floors.filter((f) => f.level > own).map((f) => name(f.id))
      const values = { column: noun, through: name(column.through!), own: name(floor) }
      issues.push(
        issueOf(
          column.id,
          'plan/column-through-floor',
          said(problem === 'unknown' ? 'issue.plan/column-through-floor.unknown' : 'issue.plan/column-through-floor.below', {
            ...values,
            above: above.length === 0 ? said('issue.part.through.none', { own: name(floor) }) : said('issue.part.through.above', { floors: joined(above, 'join.comma') }),
          }),
          'warning'
        )
      )
    }
  }
  return issues
}
