/**
 * SHT-21: floors that are alike, printed once on a client sheet as a typical floor.
 *
 * Two floors are alike when their drawings would be: the same walls, openings, items, columns,
 * bays, writing and stairs, at the same places in the plan's own coordinates, the same rooms (use,
 * name less its number, net area) and the same floor record (its height, roof, outline, kind). Ids,
 * names and numbers are left out, since every floor has its own. Nothing is measured here: the
 * areas are `planAreas`', the slices `planForFloor`'s.
 */
import { buildingOfFloor, floorElevations, planFloors, planForFloor } from '@ongrid/floorplan/geometry'
import { areaText } from '@ongrid/floorplan/geometry/rounding'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { PlanAreas } from '../quantities/areas'
import { nameLessNumber } from './roomGroups'

/** Fields that name a part, or tie it to its own floor, and so differ between alike floors. */
const OWN: ReadonlySet<string> = new Set(['id', 'floor', 'name', 'number', 'label', 'boundary', 'wall', 'room', 'zoneOf', 'from', 'to', 'properties', 'level', 'elevation'])

/** A part as a comparable value: its own names left out, lengths to the millimetre, keys in order. */
function shape(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 1000) / 1000
  if (Array.isArray(value)) return value.map(shape)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) if (!OWN.has(key)) out[key] = shape((value as Record<string, unknown>)[key])
  return out
}

const sorted = (values: readonly unknown[]): string[] => values.map((v) => JSON.stringify(v)).sort()

/** What a floor's drawing and table are made of, as one string: alike floors give the same. */
export function floorSignature(plan: FloorPlan, floorId: string, areas: PlanAreas, building: string, clearHeight: number | null): string {
  const slice = planForFloor(plan, floorId)
  const walls = new Map(slice.walls.map((wall) => [wall.id, wall] as const))
  const floor = (plan.floors ?? []).find((f) => f.id === floorId)
  const rooms = (areas.floors.find((f) => f.floor === floorId)?.rooms ?? []).map((room) => ({
    use: room.use,
    name: nameLessNumber(room.name) || room.name,
    net: room.net === null ? null : areaText(room.net, 2),
    counted: room.countedWith !== undefined,
    zone: room.zoneOf !== undefined,
  }))
  const joins = (parts: readonly { from: string; to: string }[]): unknown[] =>
    parts.filter((p) => p.from === floorId || p.to === floorId).map((p) => ({ from: p.from === floorId, part: shape(p) }))
  return JSON.stringify({
    building,
    floor: floor === undefined ? null : shape(floor),
    height: clearHeight === null ? null : shape(clearHeight),
    walls: sorted(slice.walls.map(shape)),
    openings: sorted(slice.openings.map((o) => ({ ...(shape(o) as object), on: shape(walls.get(o.wall) ?? null) }))),
    rooms: sorted(rooms),
    items: sorted((slice.items ?? []).map(shape)),
    columns: sorted((slice.columns ?? []).map(shape)),
    bays: sorted((slice.bays ?? []).map(shape)),
    sketch: sorted((slice.sketch ?? []).map(shape)),
    notes: sorted((slice.annotations ?? []).filter((note) => note.kind !== 'key').map(shape)),
    stairs: sorted([...joins(plan.stairs ?? []), ...joins(plan.ramps ?? [])]),
  })
}

/**
 * The floors in sets of alike ones, one set per page, in the order of each set's lowest floor. A
 * floor in `apart` (its own words in sheet.json, a part left out of it) is always a set of its own.
 */
export function typicalFloors(plan: FloorPlan, areas: PlanAreas, apart: ReadonlySet<string>): string[][] {
  let holder: ReadonlyMap<string, string> = new Map()
  try {
    holder = (plan.buildings ?? []).length === 0 ? new Map() : buildingOfFloor(plan)
  } catch {
    holder = new Map()
  }
  const levels = floorElevations(plan).floors
  const sets: string[][] = []
  const bySignature = new Map<string, string[]>()
  for (const floor of planFloors(plan)) {
    if (apart.has(floor.id)) {
      sets.push([floor.id])
      continue
    }
    const signature = floorSignature(plan, floor.id, areas, holder.get(floor.id) ?? '', levels.get(floor.id)?.clearHeight ?? null)
    const found = bySignature.get(signature)
    if (found) {
      found.push(floor.id)
      continue
    }
    const set = [floor.id]
    bySignature.set(signature, set)
    sets.push(set)
  }
  return sets
}
