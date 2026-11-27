/**
 * VEW-80: the plan's geometry as data, for a program that reads it without working anything out
 * (a robot's map, a wayfinding app, a digital twin, a GIS): `grid export --format json|geojson`
 * and `grid_export`. `docs/plan-data.md` is its contract.
 *
 * Every floor is in one frame: the plan's own x and y, in metres, as the plan file writes them,
 * the same on every floor; each part says its floor and the floor's elevation above the ground
 * floor's floor level. The rooms, openings, walls and items are the building after the work, in
 * id order, so the same plan writes the same bytes whatever order its file lists them in. Each
 * value is the one `grid_find` gives for the field of that name (`quantities/query.ts`), and the
 * coordinates come from `quantities/geometry.ts`, which the query reads too.
 *
 * `json` is Grid's own record; `geojson` writes the same members as a FeatureCollection (a room a
 * Polygon with its holes, a wall a MultiPolygon of its solid runs or the LineString of a dividing
 * line, an opening the Polygon of its hole, an item its footprint), outer rings counter-clockwise
 * and closed, with the frame in a member of its own, `grid`. Its coordinates are the plan's
 * metres, not longitude and latitude.
 *
 * Pure: a survey in, text out.
 */
import { floorElevations, planFloors, planHasPhases, doorKindOf, type FloorPlan } from '@ongrid/floorplan/geometry'
import type { FactValue } from '@ongrid/floorplan/types/floorplan'
import { askPlan, GRID_FIELDS, type Asked, type Part, type PartKind, type Value } from '../quantities/query'
import { doorStateOf, keptOut, partGeometry, rounded, type Point, type Ring } from '../quantities/geometry'
import type { Survey } from '../quantities/survey'

/** The formats the data is written in. */
export const DATA_FORMATS = ['geojson', 'json'] as const
export type DataFormat = (typeof DATA_FORMATS)[number]

export function isDataFormat(value: unknown): value is DataFormat {
  return typeof value === 'string' && (DATA_FORMATS as readonly string[]).includes(value)
}

/** The version of the record's members; a member taken out or changed in meaning raises it. */
export const PLAN_DATA_VERSION = 1

export interface DataFrame {
  readonly version: number
  readonly units: 'm'
  /** The plan's own x and y, the same on every floor. */
  readonly frame: 'plan'
  readonly floors: readonly { readonly id: string; readonly name: string; readonly level: number; readonly elevation: number }[]
}

interface DataPart {
  readonly id: string
  readonly part: PartKind
  readonly floor: string
  readonly elevation: number
  /** Only in a plan with phases: existing or new. */
  readonly phase?: string
  /** The facts of the person's own, as the plan gives them. */
  readonly facts: Readonly<Record<string, FactValue>>
}

export interface DataRoom extends DataPart {
  readonly name: string
  readonly number: string | null
  readonly use: string | null
  /** A zone's room, else null. */
  readonly zoneOf: string | null
  readonly keepOut: boolean
  readonly area: number | null
  readonly centre: Point
  readonly centroid: Point
  readonly polygon: Ring
  readonly holes: readonly Ring[]
}

export interface DataOpening extends DataPart {
  readonly wall: string
  readonly kind: string | null
  readonly centre: Point
  readonly along: Point
  readonly across: Point
  readonly hole: Ring
  readonly width: number
  readonly clearWidth: number | null
  readonly sill: number
  readonly height: number
  /** The room on the side `across` points to first, then the other: an id, or `outside`. */
  readonly rooms: readonly string[]
  readonly hinge: string | null
  readonly swing: string | null
  readonly opensInto: string | null
  readonly sweeps: readonly Ring[] | null
  readonly glazed: boolean
  readonly state: string | null
  readonly automatic: boolean
}

export interface DataWall extends DataPart {
  readonly kind: string
  readonly virtual: boolean
  readonly thickness: number
  readonly height: number
  readonly glazed: boolean
  readonly rooms: readonly string[]
  readonly centreLine: Ring
  readonly centre: Point
  readonly centroid: Point
  readonly polygons: readonly Ring[]
}

export interface DataItem extends DataPart {
  readonly kind: string
  readonly label: string | null
  readonly room: string | null
  readonly size: readonly [number, number]
  readonly turn: number
  readonly height: number | null
  readonly clearance: number | null
  readonly centre: Point
  readonly centroid: Point
  readonly polygon: Ring
}

export interface PlanData {
  readonly grid: DataFrame
  readonly rooms: readonly DataRoom[]
  readonly openings: readonly DataOpening[]
  readonly walls: readonly DataWall[]
  readonly items: readonly DataItem[]
}

/** The plan's floors, lowest level first; floors sharing a level keep the plan's order. */
function floorsUp(plan: FloorPlan): ReturnType<typeof planFloors> {
  return planFloors(plan)
    .map((floor, order) => ({ floor, order }))
    .sort((a, b) => a.floor.level - b.floor.level || a.order - b.order)
    .map(({ floor }) => floor)
}

/**
 * The data of the floors named (`floorIds`, every floor when left out) of the survey's plan.
 * `stated` is the plan as read, for its facts and phases.
 */
export function planData(survey: Survey, stated: FloorPlan, floorIds?: readonly string[]): PlanData {
  const asked = askPlan(survey, { items: true, stated })
  const geometry = partGeometry(survey)
  const levels = floorElevations(survey.plan).floors
  const floors = floorsUp(survey.plan).filter((floor) => floorIds === undefined || floorIds.includes(floor.id))
  const order = new Map(floors.map((floor, i) => [floor.id, i] as const))
  const elevation = (floor: string): number => rounded(levels.get(floor)?.floorLevel ?? 0)
  const phases = planHasPhases(stated)
  const value = valueOf(asked)
  const held = asked.parts
    .filter((part) => order.has(part.floor) && part.phase !== 'demolished')
    .map((part, i) => ({ part, i }))
    .sort((a, b) => order.get(a.part.floor)! - order.get(b.part.floor)! || a.i - b.i)
    .map(({ part }) => part)
  const base = (part: Part): DataPart => ({ id: part.id, part: part.kind, floor: part.floor, elevation: elevation(part.floor), ...(phases && part.phase !== undefined ? { phase: part.phase } : {}), facts: part.facts })
  const text = (part: Part, name: string): string | null => {
    const v = value(part, name)
    return typeof v === 'string' ? v : null
  }
  const number = (part: Part, name: string): number | null => {
    const v = value(part, name)
    return typeof v === 'number' ? rounded(v) : null
  }
  const list = (part: Part, name: string): string[] => {
    const v = value(part, name)
    return Array.isArray(v) ? (v as readonly unknown[]).filter((item): item is string => typeof item === 'string') : []
  }

  const rooms: DataRoom[] = []
  const openings: DataOpening[] = []
  const walls: DataWall[] = []
  const items: DataItem[] = []
  const planRooms = new Map(survey.plan.rooms.map((r) => [r.id, r] as const))
  const planOpenings = new Map(survey.plan.openings.map((o) => [o.id, o] as const))
  const planWalls = new Map(survey.plan.walls.map((w) => [w.id, w] as const))
  const planItems = new Map((survey.plan.items ?? []).map((i) => [i.id, i] as const))
  for (const part of held) {
    if (part.kind === 'room') {
      const shape = geometry.room(part.id)
      const room = planRooms.get(part.id)
      if (shape === null || room === undefined) continue
      rooms.push({
        ...base(part), name: room.name, number: text(part, 'number'), use: text(part, 'use'), zoneOf: part.zoneOf ?? null, keepOut: keptOut(room),
        area: number(part, 'area'), centre: shape.centre, centroid: shape.centroid, polygon: shape.polygon[0]!, holes: shape.polygon.slice(1),
      })
    } else if (part.kind === 'wall') {
      const shape = geometry.wall(part.id)
      const wall = planWalls.get(part.id)
      if (shape === null || wall === undefined) continue
      walls.push({
        ...base(part), kind: wall.kind ?? 'interior', virtual: wall.virtual === true, thickness: rounded(wall.thickness), height: rounded(wall.height), glazed: shape.glazed,
        rooms: list(part, 'rooms'), centreLine: shape.centreLine, centre: shape.centre, centroid: shape.centroid, polygons: shape.polygon,
      })
    } else if (part.kind === 'door' || part.kind === 'window' || part.kind === 'opening') {
      const shape = geometry.opening(part.id)
      const opening = planOpenings.get(part.id)
      if (shape === null || opening === undefined) continue
      const sides = list(part, 'rooms')
      const state = doorStateOf(opening)
      const opensInto = opening.type !== 'door' || opening.swing === undefined ? null : sides[opening.swing === 'left' ? 0 : 1] ?? null
      openings.push({
        ...base(part), wall: opening.wall, kind: opening.type === 'door' ? doorKindOf(opening.kind) : opening.kind ?? null,
        centre: shape.centre, along: shape.along, across: shape.across, hole: shape.polygon[0]!,
        width: rounded(opening.width), clearWidth: shape.clearWidth === null ? null : rounded(shape.clearWidth), sill: rounded(opening.sill), height: rounded(opening.height),
        rooms: sides, hinge: opening.hinge ?? null, swing: opening.swing ?? null, opensInto, sweeps: shape.sweeps,
        glazed: shape.glazed, state: opening.type === 'door' ? state : null, automatic: opening.type === 'door' && state === 'automatic',
      })
    } else if (part.kind === 'fixture' || part.kind === 'furniture' || part.kind === 'point') {
      const shape = geometry.item(part.id)
      const item = planItems.get(part.id)
      if (shape === null || item === undefined) continue
      items.push({
        ...base(part), kind: item.kind, label: text(part, 'label'), room: text(part, 'room'), size: [rounded(item.size[0]), rounded(item.size[1])], turn: rounded(item.turn ?? 0),
        height: number(part, 'height'), clearance: number(part, 'clearance'), centre: shape.centre, centroid: shape.centroid, polygon: shape.polygon[0]!,
      })
    }
  }
  const frame: DataFrame = {
    version: PLAN_DATA_VERSION, units: 'm', frame: 'plan',
    floors: floors.map((floor) => ({ id: floor.id, name: floor.name, level: floor.level, elevation: elevation(floor.id) })),
  }
  return { grid: frame, rooms, openings, walls, items }
}

/** A grid field's value for a part, by the field's name. */
function valueOf(asked: Asked): (part: Part, name: string) => Value {
  const fields = new Map(GRID_FIELDS.map((info) => [info.name, { from: 'grid' as const, info }] as const))
  return (part, name) => asked.value(part, fields.get(name)!)
}

// ---------------------------------------------------------------------------------------------
// The text

type Position = readonly [number, number]

const signedArea = (ring: Ring): number => ring.reduce((sum, a, i) => {
  const b = ring[(i + 1) % ring.length]!
  return sum + a[0] * b[1] - b[0] * a[1]
}, 0) / 2

/** A GeoJSON ring: closed, counter-clockwise for an outline and clockwise for a hole (RFC 7946's right-hand rule). */
function geoRing(ring: Ring, hole: boolean): Position[] {
  const turned = (signedArea(ring) < 0) !== hole ? [...ring].reverse() : [...ring]
  return turned.length === 0 ? [] : [...turned, turned[0]!]
}

function feature(geometry: Record<string, unknown>, properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'Feature', id: `${String(properties['part'])}/${String(properties['id'])}`, geometry, properties }
}

const without = <T extends object>(part: T, ...keys: (keyof T)[]): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...(part as Record<string, unknown>) }
  for (const key of keys) delete out[key as string]
  return out
}

/** The data as GeoJSON: one FeatureCollection, the frame in its `grid` member. */
export function planGeoJson(data: PlanData): Record<string, unknown> {
  const features = [
    ...data.rooms.map((room) => feature({ type: 'Polygon', coordinates: [geoRing(room.polygon, false), ...room.holes.map((hole) => geoRing(hole, true))] }, without(room, 'polygon', 'holes'))),
    ...data.walls.map((wall) => feature(
      wall.polygons.length === 0 ? { type: 'LineString', coordinates: wall.centreLine } : { type: 'MultiPolygon', coordinates: wall.polygons.map((run) => [geoRing(run, false)]) },
      without(wall, 'polygons'),
    )),
    ...data.openings.map((opening) => feature({ type: 'Polygon', coordinates: [geoRing(opening.hole, false)] }, without(opening, 'hole'))),
    ...data.items.map((item) => feature({ type: 'Polygon', coordinates: [geoRing(item.polygon, false)] }, without(item, 'polygon'))),
  ]
  return { type: 'FeatureCollection', grid: data.grid, features }
}

/** The file's text in `format`. */
export function planDataText(data: PlanData, format: DataFormat): string {
  return `${JSON.stringify(format === 'geojson' ? planGeoJson(data) : data)}\n`
}
