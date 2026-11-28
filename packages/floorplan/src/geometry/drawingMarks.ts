/**
 * LVL-9: the marks a plan carries for its other drawings: where a section is cut and which way it
 * looks, where each elevation is seen from, and the level of each room's floor.
 *
 * - **A section mark** is the cut line as given, with the way it looks (`planSection`'s own frame),
 *   so the plan and the section say the same.
 * - **An elevation mark** stands outside each of the plan's four main sides (`planAxes`, SHT-4: the
 *   way most of its outside walls run), `elevationMarkOffset` beyond the drawing and its
 *   dimensions, looking at the building. It is named by the way that side faces: by the north the
 *   plan states, else by the drawing's own, north at the top (CNT-3). It also names the facade
 *   that draws that side (LVL-8, `planFacade`): the side of the drawing it is seen from.
 * - **A level mark** is each drawn room's floor level: its storey's (LVL-1) and its own offset
 *   (LVL-7), with whether the plan states the storey's elevation.
 * - **A schedule mark** (ARE-15) is each drawn room's and opening's mark in the schedules, as the
 *   caller gives them by id (the room's number, `D1`, `W1`): a room's at its label point, an
 *   opening's on the face of its wall away from a door's swing, or on a window's room side, so it
 *   is beside the part and clear of its symbol. A part the caller gives no mark has none.
 * - **An access mark** (SHT-27) is what the access measurements found, as the caller measured it
 *   and gives it by part id with its label: each way as a line through the rooms and the doors on
 *   it, each room's turning circle at its place and size, each door's label on the face of its
 *   wall away from its schedule mark, and each step at the door or opening it is at. Only what is
 *   on the floor drawn is placed; a way that leaves the floor is drawn in the pieces on it.
 *
 * Pure: where each mark is, in plan metres. How a mark looks is the viewer's.
 */

import type { FloorPlan } from './plan'
import type { Bounds, PlanDrawing } from './floorplan'
import { planAxes } from './dimensions'
import { floorElevations } from './elevations'
import { planFloors } from './floors'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import { roomFloorOffset } from './steps'
import { limit } from './tolerances'
import type { Vec2 } from './vec2'
import { add, dot, scale } from './vec2'
import type { SectionLine } from './section'
import type { FacadeSide } from './facade'
import { sectionFrame } from './section'
import { pointInPolygon } from './innerPoint'

export interface SectionMark {
  /** The cut line as given. */
  readonly from: Vec2
  readonly to: Vec2
  /** The way the section looks, a unit direction on the plan. */
  readonly look: Vec2
  /** The section's name on the drawing. */
  readonly label: string
}

export interface ElevationMark {
  /** The way the side of the building it looks at faces, by the compass. */
  readonly faces: CompassPoint
  /** Whether that is the north the plan states, or the drawing's top taken as north. */
  readonly northStated: boolean
  /**
   * LVL-8: the facade that draws this side, `planFacade(plan, facade)` (`grid draw --facade`): the
   * side of the drawing, north at its top, nearest the way the mark looks from.
   */
  readonly facade: FacadeSide
  /** The middle of the mark. */
  readonly at: Vec2
  /** The way it looks: at the building, a unit direction on the plan. */
  readonly look: Vec2
}

export interface LevelMark {
  readonly room: string
  /** The room's label point, which the mark is drawn under. */
  readonly at: Vec2
  /** The top of the room's floor, in metres from the ground floor's floor level. */
  readonly level: number
  /** Whether the floor states its elevation (or stands at the datum, 0); otherwise worked out. */
  readonly stated: boolean
}

/** ARE-15: a room's or an opening's mark, tied to its row in the schedules by the part's id. */
export interface ScheduleMark {
  readonly of: 'room' | 'opening'
  readonly id: string
  /** The mark as the schedule gives it: a room's number, an opening's `D1`, `W1` or `O1`. */
  readonly mark: string
  /** A room's label point, which the mark is drawn over; an opening's middle on the face of its wall the mark stands by. */
  readonly at: Vec2
  /** For an opening, the way out from that face, a unit direction on the plan; null for a room. */
  readonly out: Vec2 | null
}

/** ARE-15: the marks to draw, by part id, as the schedules number the parts. */
export interface ScheduleMarkLabels {
  readonly rooms: ReadonlyMap<string, string>
  readonly openings: ReadonlyMap<string, string>
}

/** SHT-27: the access measurements to mark, by part id, each with its words, as the caller measured them. */
export interface AccessMarkLabels {
  /** Each way: its rooms and the doors or openings between them, in walking order, by id. */
  readonly routes: readonly { readonly to: string; readonly stops: readonly string[] }[]
  readonly turning: readonly { readonly room: string; readonly at: Vec2; readonly diameter: number; readonly label: string; readonly short: boolean }[]
  readonly doors: readonly { readonly id: string; readonly label: string; readonly short: boolean }[]
  /** Each step, by the door or opening it is at. */
  readonly steps: readonly { readonly at: string; readonly label: string; readonly short: boolean }[]
}

/** SHT-27: the access marks of one floor's drawing, placed. `short` is under (a step: over) the person's own figure. */
export interface AccessMarks {
  /** Each run of a way on this floor, as points through its rooms' label points and its doors' middles. */
  readonly routes: readonly { readonly to: string; readonly points: readonly Vec2[] }[]
  readonly turning: readonly { readonly room: string; readonly at: Vec2; readonly radius: number; readonly label: string; readonly short: boolean }[]
  /** A door's label stands at `at`, on the face of its wall `out` points from. */
  readonly doors: readonly { readonly id: string; readonly at: Vec2; readonly out: Vec2; readonly label: string; readonly short: boolean }[]
  readonly steps: readonly { readonly id: string; readonly at: Vec2; readonly out: Vec2; readonly label: string; readonly short: boolean }[]
}

export interface DrawingMarks {
  readonly section: SectionMark | null
  /** SHT-23: further sections, each with its own name, as a sheet marks them. Empty when none is asked for. */
  readonly sections: readonly SectionMark[]
  readonly elevations: readonly ElevationMark[]
  readonly levels: readonly LevelMark[]
  /** ARE-15: one per drawn room and opening the schedules give a mark. */
  readonly schedule: readonly ScheduleMark[]
  /** SHT-27: null when the access marks are not asked for. */
  readonly access: AccessMarks | null
}

/** SHT-23: a section line with the name the section is drawn under. */
export interface NamedSectionLine {
  readonly line: SectionLine
  readonly label: string
}

export interface DrawingMarksAsked {
  readonly section?: SectionLine | null
  /** SHT-23: more section lines, each marked with its own name. */
  readonly sections?: readonly NamedSectionLine[]
  readonly elevations?: boolean
  readonly levels?: boolean
  /** ARE-15: the schedules' marks, by part id. */
  readonly schedule?: ScheduleMarkLabels | null
  /** SHT-27: the access measurements, by part id. */
  readonly access?: AccessMarkLabels | null
}

/**
 * The marks of one floor's drawing. `around` is what the plan's picture frames before the marks
 * (the drawing and its dimensions); an elevation mark stands outside it.
 */
export function drawingMarks(plan: FloorPlan, floor: string, drawing: PlanDrawing, around: Bounds, asked: DrawingMarksAsked): DrawingMarks {
  let section: SectionMark | null = null
  if (asked.section != null) {
    section = { from: asked.section.from, to: asked.section.to, look: sectionFrame(asked.section).look, label: 'A' }
  }
  const sections: SectionMark[] = (asked.sections ?? []).map(({ line, label }) => ({ from: line.from, to: line.to, look: sectionFrame(line).look, label }))

  const elevations: ElevationMark[] = []
  if (asked.elevations === true && drawing.walls.length > 0) {
    const axes = planAxes(drawing.walls)
    const orientation = planOrientation(plan)
    const corners: Vec2[] = [around.min, { x: around.max.x, y: around.min.y }, around.max, { x: around.min.x, y: around.max.y }]
    const centre: Vec2 = { x: (around.min.x + around.max.x) / 2, y: (around.min.y + around.max.y) / 2 }
    const offset = limit('elevationMarkOffset')
    for (const side of [scale(axes.v, -1), axes.u, axes.v, scale(axes.u, -1)]) {
      const reach = Math.max(...corners.map((c) => dot(c, side))) - dot(centre, side)
      const bearing = bearingOf(side, orientation, orientation.north ?? 0) ?? 0
      elevations.push({ faces: compassPoint(bearing), northStated: orientation.north !== null, facade: facadeSideOf(side), at: add(centre, scale(side, reach + offset)), look: scale(side, -1) })
    }
  }

  const levels: LevelMark[] = []
  if (asked.levels === true) {
    const storey = floorElevations(plan).floors.get(floor)
    const stated = planFloors(plan).find((f) => f.id === floor)?.elevation !== undefined || (storey?.floorLevel ?? 0) === 0
    const byId = new Map(plan.rooms.map((room) => [room.id, room] as const))
    for (const room of drawing.rooms) {
      const own = byId.get(room.id)
      const offset = own === undefined ? 0 : roomFloorOffset(own)
      levels.push({ room: room.id, at: room.labelAt, level: (storey?.floorLevel ?? 0) + offset, stated })
    }
  }

  return {
    section, sections, elevations, levels,
    schedule: asked.schedule == null ? [] : scheduleMarks(drawing, asked.schedule),
    access: asked.access == null ? null : accessMarks(drawing, asked.access),
  }
}

/**
 * SHT-27: the access marks on the drawn floor. A way's stops are placed at a room's label point
 * and an opening's middle; a stop not on this floor breaks the way into the runs that are. A
 * door's and a step's label stand on the face away from the schedule mark's (`markSide`).
 */
function accessMarks(drawing: PlanDrawing, labels: AccessMarkLabels): AccessMarks {
  const roomAt = new Map(drawing.rooms.map((room) => [room.id, room.labelAt] as const))
  const openings = new Map(drawing.openings.map((opening) => [opening.id, opening] as const))
  const middleOf = (opening: PlanDrawing['openings'][number]): Vec2 => scale(add(opening.from, opening.to), 0.5)
  const pointOf = (id: string): Vec2 | undefined => {
    const opening = openings.get(id)
    return opening === undefined ? roomAt.get(id) : middleOf(opening)
  }
  const routes: { to: string; points: Vec2[] }[] = []
  for (const route of labels.routes) {
    let run: Vec2[] = []
    const close = (): void => {
      if (run.length >= 2) routes.push({ to: route.to, points: run })
      run = []
    }
    for (const stop of route.stops) {
      const p = pointOf(stop)
      if (p === undefined) close()
      else run.push(p)
    }
    close()
  }
  const placed = (id: string): { at: Vec2; out: Vec2 } | null => {
    const opening = openings.get(id)
    if (opening === undefined) return null
    const middle = middleOf(opening)
    const out = scale(markSide(drawing, opening, middle), -1)
    return { at: add(middle, scale(out, opening.thickness / 2)), out }
  }
  const doors: AccessMarks['doors'][number][] = []
  for (const door of labels.doors) {
    const at = placed(door.id)
    if (at !== null && !doors.some((d) => d.id === door.id)) doors.push({ id: door.id, ...at, label: door.label, short: door.short })
  }
  const steps: AccessMarks['steps'][number][] = []
  for (const step of labels.steps) {
    const at = placed(step.at)
    if (at !== null && !steps.some((s) => s.id === step.at && s.label === step.label)) steps.push({ id: step.at, ...at, label: step.label, short: step.short })
  }
  const turning = labels.turning.filter((t) => roomAt.has(t.room)).map((t) => ({ room: t.room, at: t.at, radius: t.diameter / 2, label: t.label, short: t.short }))
  return { routes, turning, doors, steps }
}

/** ARE-15: each drawn room's and opening's mark, in the drawing's order. */
function scheduleMarks(drawing: PlanDrawing, labels: ScheduleMarkLabels): ScheduleMark[] {
  const out: ScheduleMark[] = []
  for (const room of drawing.rooms) {
    const mark = labels.rooms.get(room.id)
    if (mark !== undefined) out.push({ of: 'room', id: room.id, mark, at: room.labelAt, out: null })
  }
  const seen = new Set<string>()
  for (const opening of drawing.openings) {
    const mark = labels.openings.get(opening.id)
    if (mark === undefined || seen.has(opening.id)) continue
    seen.add(opening.id)
    const middle = scale(add(opening.from, opening.to), 0.5)
    const side = markSide(drawing, opening, middle)
    out.push({ of: 'opening', id: opening.id, mark, at: add(middle, scale(side, opening.thickness / 2)), out: side })
  }
  return out
}

/**
 * The face of an opening's wall its mark stands by: a door's, away from the face it swings to
 * (C2: `left` is the face the normal points at), so the mark is clear of its leaf; a window's or
 * a doorless opening's, the face a room is on, tried one wall's thickness from the middle.
 */
function markSide(drawing: PlanDrawing, opening: PlanDrawing['openings'][number], middle: Vec2): Vec2 {
  const n = opening.normal
  if (opening.type === 'door' && opening.swing !== undefined) return opening.swing === 'left' ? scale(n, -1) : n
  const inRoom = (side: Vec2): boolean => {
    const p = add(middle, scale(side, opening.thickness))
    return drawing.rooms.some((room) => pointInPolygon(p, room.polygon, room.holes))
  }
  return inRoom(n) || !inRoom(scale(n, -1)) ? n : scale(n, -1)
}

/** The side of the drawing a direction on the plan points to most: +y is north, the drawing's top. */
function facadeSideOf(out: Vec2): FacadeSide {
  if (Math.abs(out.y) >= Math.abs(out.x)) return out.y >= 0 ? 'north' : 'south'
  return out.x >= 0 ? 'east' : 'west'
}

/** The points the marks reach on the plan, for the picture to frame them too. */
export function marksExtent(marks: DrawingMarks): Vec2[] {
  return [...(marks.section === null ? [] : [marks.section.from, marks.section.to]), ...marks.sections.flatMap((m) => [m.from, m.to]), ...marks.elevations.map((m) => m.at)]
}
