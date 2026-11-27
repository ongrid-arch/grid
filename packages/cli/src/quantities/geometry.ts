/**
 * VEW-80: each part's geometry as coordinates, for `grid_find`'s `polygon`, `centre`, `centroid`,
 * `clear width` and `glazed` and for the plan's data export (`export/planData.ts`), so the two
 * never give two answers. Every point is in the plan's own frame, in metres: x and y as the plan
 * file writes them, the same on every floor.
 *
 * - A room: its inside outline and its holes (the survey's, which its area is measured from), a
 *   point on its floor (`centre`, where its name is drawn: never in a hole, never outside an L)
 *   and its centroid, the middle of its area, which may lie outside a room that is not convex.
 * - A wall: its solid runs as the drawing draws them, joined at the corners with the openings
 *   taken out; its centre line; the point halfway along it; the centroid of its runs.
 * - A door, window or doorless opening: its middle on the wall's centre line, the way along its
 *   wall and across it (toward the side the wall's normal points at, the first of its rooms), its
 *   hole through the wall, and the floor its leaves sweep (`doorSweeps`), an arc traced with the
 *   pieces a curved wall of that radius is traced with (`curvePieceCount`). The sweep is null when
 *   the plan does not say enough to know it, and empty for a door that sweeps none.
 * - An item: its footprint, its middle and its centroid.
 *
 * Facts the person keeps for what Grid does not model (`KEPT_FACTS`): a door's state (normally
 * open, closed, automatic or held open) and a keep-out zone. Grid checks nothing against them.
 *
 * Pure: a survey in, numbers out, each floor's drawing worked out once per survey.
 */
import {
  buildFloorPlan,
  curvePieceCount,
  doorSweeps,
  floorOf,
  openingGlazed,
  planForFloor,
  tolerance,
  wallGlazed,
  wallLength,
  wallPath,
  wallPointAt,
  wallSlicePolygon,
  type DoorSweep,
  type PlanDrawing,
  type Vec2,
} from '@ongrid/floorplan/geometry'
import { factOf, factText, type Facts, type Opening } from '@ongrid/floorplan/types/floorplan'
import { doorClearanceOf } from './doorWidth'
import type { Survey } from './survey'

/** A point, `[x, y]` in metres. */
export type Point = readonly [number, number]
/** A ring of points, not closed: the last point is not the first again. */
export type Ring = readonly Point[]

/** VEW-80: the facts the data export reads, by their names as `grid_set_facts` sets them. */
export const KEPT_FACTS = { doorState: 'door state', keepOut: 'keep out' } as const

/** VEW-80: the words a door's state is suggested in. Any other is kept as the person writes it. */
export const DOOR_STATES = ['open', 'closed', 'automatic', 'held open'] as const

export interface AreaGeometry {
  /** The outline first, then any holes (a room) or every solid run (a wall). */
  readonly polygon: readonly Ring[]
  readonly centre: Point
  readonly centroid: Point
}

export interface OpeningGeometry extends AreaGeometry {
  /** Unit, along the wall from its start's side. */
  readonly along: Point
  /** Unit, across the wall toward the side its normal points at: the opening's first room. */
  readonly across: Point
  /** What its leaves sweep, each a ring; null when the plan does not say enough, empty when it sweeps nothing. */
  readonly sweeps: readonly Ring[] | null
  /** The clear width, as `grid_measure what=access` and the brief measure it; null for a window. */
  readonly clearWidth: number | null
  readonly glazed: boolean
}

export interface WallGeometry extends AreaGeometry {
  readonly centreLine: Ring
  readonly glazed: boolean
}

export interface PartGeometry {
  room(id: string): AreaGeometry | null
  wall(id: string): WallGeometry | null
  opening(id: string): OpeningGeometry | null
  item(id: string): AreaGeometry | null
}

/** A number as the data gives it: to a tenth of a millimetre, as `grid_find` shows a value. */
export function rounded(n: number): number {
  const r = Math.round(n * 10000) / 10000
  return r === 0 ? 0 : r
}

export const pointOf = (p: Vec2): Point => [rounded(p.x), rounded(p.y)]
const ringOf = (ring: readonly Vec2[]): Ring => ring.map(pointOf)

const signedAreaOf = (ring: readonly Vec2[]): number => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** The middle of the area of `rings`, each counted in or (a hole) out; the corners' mean when they hold no area. */
export function areaCentroid(rings: readonly { readonly ring: readonly Vec2[]; readonly hole: boolean }[]): Vec2 | null {
  let total = 0
  let x = 0
  let y = 0
  for (const { ring, hole } of rings) {
    const signed = signedAreaOf(ring)
    if (Math.abs(signed) < tolerance('noArea')) continue
    // Each ring counted by its own size, whichever way round it runs.
    const weight = (hole ? -1 : 1) * Math.sign(signed)
    let cx = 0
    let cy = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const c = a.x * b.y - b.x * a.y
      cx += (a.x + b.x) * c
      cy += (a.y + b.y) * c
    }
    total += weight * signed
    x += (weight * cx) / 6
    y += (weight * cy) / 6
  }
  if (Math.abs(total) >= tolerance('noArea')) return { x: x / total, y: y / total }
  const corners = rings.filter((r) => !r.hole).flatMap((r) => r.ring)
  if (corners.length === 0) return null
  return { x: corners.reduce((s, p) => s + p.x, 0) / corners.length, y: corners.reduce((s, p) => s + p.y, 0) / corners.length }
}

/** An arc's floor as a ring: its pivot, then its curve from the closed leaf to the open one. */
function sweepRing(sweep: DoorSweep): readonly Vec2[] {
  if (sweep.shape === 'strip') return sweep.polygon
  const { center, radius, from, to, counterClockwise } = sweep.swing.arc
  let turn = to - from
  // The quarter turn the leaf makes, the way round it opens.
  while (counterClockwise && turn < 0) turn += 2 * Math.PI
  while (!counterClockwise && turn > 0) turn -= 2 * Math.PI
  const pieces = curvePieceCount({ centre: center, radius, startAngle: from, sweep: turn, length: radius * Math.abs(turn), closed: false })
  const arc = Array.from({ length: pieces + 1 }, (_, i) => {
    const angle = from + (turn * i) / pieces
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
  })
  return [center, ...arc]
}

const unit = (from: Vec2, to: Vec2): Vec2 => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  return length < tolerance('noLength') ? { x: 1, y: 0 } : { x: dx / length, y: dy / length }
}

const known = new WeakMap<Survey, PartGeometry>()

/** Every part's geometry on the survey's plan (the building after the work), worked out on first use. */
export function partGeometry(survey: Survey): PartGeometry {
  const found = known.get(survey)
  if (found !== undefined) return found
  const plan = survey.plan
  const drawings = new Map<string, PlanDrawing>()
  const drawing = (floor: string): PlanDrawing => {
    let one = drawings.get(floor)
    if (one === undefined) {
      one = buildFloorPlan(planForFloor(plan, floor))
      drawings.set(floor, one)
    }
    return one
  }
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  const openings = new Map(plan.openings.map((o) => [o.id, o] as const))
  const items = new Map((plan.items ?? []).map((i) => [i.id, i] as const))
  const cache = new Map<string, unknown>()
  const once = <T>(key: string, work: () => T): T => {
    if (!cache.has(key)) cache.set(key, work())
    return cache.get(key) as T
  }

  const made: PartGeometry = {
    room: (id) => once(`room ${id}`, () => {
      const room = survey.byId.get(id)
      if (room === undefined || room.polygon.length < 3) return null
      const drawn = drawing(room.facts.floor).rooms.find((r) => r.id === id)
      const middle = areaCentroid([{ ring: room.polygon, hole: false }, ...room.holes.map((ring) => ({ ring, hole: true }))])!
      return { polygon: [ringOf(room.polygon), ...room.holes.map(ringOf)], centre: pointOf(drawn?.labelAt ?? middle), centroid: pointOf(middle) }
    }),
    wall: (id) => once(`wall ${id}`, () => {
      const wall = walls.get(id)
      if (wall === undefined) return null
      const drawn = drawing(floorOf(wall)).walls.find((w) => w.id === id)
      if (drawn === undefined) return null
      const length = wallLength(wall)
      const line = wallPath(wall)
      const runs = drawn.slices.filter((ring) => ring.length >= 3)
      const middle = wallPointAt(wall, length / 2)
      const centroid = runs.length === 0 ? middle : areaCentroid(runs.map((ring) => ({ ring, hole: false }))) ?? middle
      return { polygon: runs.map(ringOf), centreLine: ringOf(line), centre: pointOf(middle), centroid: pointOf(centroid), glazed: wallGlazed(plan, wall) }
    }),
    opening: (id) => once(`opening ${id}`, () => {
      const opening = openings.get(id)
      const wall = opening && walls.get(opening.wall)
      const facts = survey.facts.openings.get(id)
      if (opening === undefined || wall === undefined || facts === undefined) return null
      const drawn = drawing(facts.floor).openings.find((o) => o.id === id)
      if (drawn === undefined) return null
      const hole = wallSlicePolygon(wall, opening.offset, opening.offset + opening.width)
      const middle = wallPointAt(wall, opening.offset + opening.width / 2)
      const sweeps = opening.type === 'door' ? doorSweeps(drawn, doorValues(opening)) : []
      return {
        polygon: [ringOf(hole)],
        centre: pointOf(middle),
        centroid: pointOf(middle),
        along: pointOf(unit(drawn.from, drawn.to)),
        across: pointOf(drawn.normal),
        sweeps: sweeps === null ? null : sweeps.map((sweep) => ringOf(sweepRing(sweep))),
        clearWidth: doorClearanceOf(survey, id)?.clear ?? null,
        glazed: openingGlazed(plan, opening),
      }
    }),
    item: (id) => once(`item ${id}`, () => {
      const item = items.get(id)
      if (item === undefined) return null
      const drawn = drawing(floorOf(item)).items.find((i) => i.id === id)
      if (drawn === undefined || drawn.outline.length < 3) return null
      const middle = areaCentroid([{ ring: drawn.outline, hole: false }]) ?? drawn.at
      return { polygon: [ringOf(drawn.outline)], centre: pointOf(drawn.at), centroid: pointOf(middle) }
    }),
  }
  known.set(survey, made)
  return made
}

function doorValues(opening: Opening): Parameters<typeof doorSweeps>[1] {
  return { hinge: opening.hinge ?? null, swing: opening.swing ?? null, kind: opening.kind ?? null, opens: opening.opens ?? null }
}

/** VEW-80: a door's state as the person keeps it (`door state`), or null when they keep none. */
export function doorStateOf(part: { readonly properties?: Facts | undefined }): string | null {
  const value = factOf(part, KEPT_FACTS.doorState)
  return value === undefined ? null : factText(value).trim().toLowerCase() || null
}

/** VEW-80: whether the person keeps a room or zone out of bounds (`keep out` true, or yes). */
export function keptOut(part: { readonly properties?: Facts | undefined }): boolean {
  const value = factOf(part, KEPT_FACTS.keepOut)
  if (value === true) return true
  return typeof value === 'string' && ['yes', 'true'].includes(value.trim().toLowerCase())
}
