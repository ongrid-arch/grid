/**
 * One building of a plan that holds many (CMD-47): its parts, found by the floors that are its own
 * (C23, LVL-23), the plan of that building alone, and its parts copied with new ids or moved.
 *
 * A part is the building's when it stands on one of its floors: a wall, a room, an item, a
 * column, a bay, a note, a sketch line, a context shape; an opening or an opening pattern when its
 * wall is; a stair or a ramp when both its ends are (`touching` when either is, for taking the
 * building out); a flat when its rooms are. Everything else (the plot, north, the types, the
 * library, the saved views) is the whole plan's and is never the building's.
 *
 * Ids are renamed in every field that names a part, never in the person's words (names, labels,
 * texts, facts) nor in a fixed word (a use, a kind, a type, a side).
 */
import { floorOf, planBuildings, planFloors, type FloorPlan } from '@ongrid/floorplan/geometry'
import { EditRefused } from './refused'

export type RawRecord = Record<string, unknown>

/** The plan's lists of parts that stand on one floor, by their `floor` (the ground floor when unstated). */
export const ON_A_FLOOR = ['items', 'columns', 'bays', 'annotations', 'sketch', 'context'] as const
/** The lists the building's parts are taken from and put back into, besides walls, rooms, openings and items. */
export const OTHER_LISTS = ['floors', 'stairs', 'ramps', 'patterns', 'columns', 'bays', 'annotations', 'sketch', 'context', 'flats'] as const
export type OtherList = (typeof OTHER_LISTS)[number]

/** A building's parts, by id in each list, as the plan holds them. */
export interface BuildingParts {
  readonly id: string
  readonly floors: readonly string[]
  readonly walls: ReadonlySet<string>
  readonly rooms: ReadonlySet<string>
  readonly openings: ReadonlySet<string>
  readonly items: ReadonlySet<string>
  /** The other lists: the parts wholly in the building. */
  readonly lists: ReadonlyMap<OtherList, ReadonlySet<string>>
  /** Stairs and ramps with one end in the building and one out: taken out with it, never copied. */
  readonly touching: ReadonlyMap<'stairs' | 'ramps', ReadonlySet<string>>
}

const listOf = (plan: FloorPlan, key: string): RawRecord[] => {
  const value = (plan as unknown as RawRecord)[key]
  return Array.isArray(value) ? (value as RawRecord[]) : []
}
const idOf = (part: RawRecord): string => (typeof part['id'] === 'string' ? part['id'] : '')
const said = (ids: readonly string[]): string => (ids.length > 12 ? `${ids.slice(0, 12).join(', ')} and ${ids.length - 12} more` : ids.join(', '))

/** The building by id, or refused naming the plan's buildings. */
export function buildingNamed(plan: FloorPlan, id: string, what = 'building'): ReturnType<typeof planBuildings>[number] {
  const all = planBuildings(plan)
  const found = all.find((b) => b.id === id)
  if (found !== undefined) return found
  throw new EditRefused(`The plan has no ${what} ${id}. ${all.length === 0 ? 'It names no building: grid_set_building adds one from its floors.' : `Its buildings: ${said(all.map((b) => b.id))}.`}`)
}

/** The floor a ramp's end stands on: a floor by id, else the floor of the room it names. */
function endFloor(plan: FloorPlan, end: unknown): string | null {
  if (typeof end !== 'string') return null
  if (planFloors(plan).some((f) => f.id === end)) return end
  const room = plan.rooms.find((r) => r.id === end)
  return room === undefined ? null : floorOf(room)
}

/** The parts that are the building's own. */
export function buildingParts(plan: FloorPlan, id: string): BuildingParts {
  const building = buildingNamed(plan, id)
  const floors = new Set(building.floors)
  const on = (part: { readonly floor?: string }): boolean => floors.has(floorOf(part))
  const walls = new Set(plan.walls.filter(on).map((w) => w.id))
  const rooms = new Set(plan.rooms.filter(on).map((r) => r.id))
  const lists = new Map<OtherList, Set<string>>()
  const touching = new Map<'stairs' | 'ramps', Set<string>>()
  lists.set('floors', new Set(building.floors))
  for (const key of ['stairs', 'ramps'] as const) {
    const whole = new Set<string>()
    const one = new Set<string>()
    for (const part of listOf(plan, key)) {
      const ends = [key === 'stairs' ? part['from'] : endFloor(plan, part['from']), key === 'stairs' ? part['to'] : endFloor(plan, part['to'])].map((end) => typeof end === 'string' && floors.has(end))
      if (ends.every(Boolean)) whole.add(idOf(part))
      else if (ends.some(Boolean)) one.add(idOf(part))
    }
    lists.set(key, whole)
    touching.set(key, one)
  }
  lists.set('patterns', new Set(listOf(plan, 'patterns').filter((p) => walls.has(p['wall'] as string)).map(idOf)))
  for (const key of ON_A_FLOOR) if (key !== 'items') lists.set(key, new Set(listOf(plan, key).filter((part) => on(part as { floor?: string })).map(idOf)))
  lists.set('flats', new Set(listOf(plan, 'flats').filter((f) => Array.isArray(f['rooms']) && (f['rooms'] as string[]).length > 0 && (f['rooms'] as string[]).every((r) => rooms.has(r))).map(idOf)))
  return {
    id,
    floors: building.floors,
    walls,
    rooms,
    openings: new Set(plan.openings.filter((o) => walls.has(o.wall)).map((o) => o.id)),
    items: new Set((plan.items ?? []).filter(on).map((i) => i.id)),
    lists,
    touching,
  }
}

/**
 * The plan of the building alone: its parts, its own building record, and what the whole plan
 * says that a reading of it needs (its display, types, library and kind of building). No site.
 */
export function buildingPlan(plan: FloorPlan, parts: BuildingParts): FloorPlan {
  const pick = (key: string, ids: ReadonlySet<string>): RawRecord[] => listOf(plan, key).filter((part) => ids.has(idOf(part)))
  const out: RawRecord = { version: '1', units: 'm' }
  for (const key of ['building', 'display', 'types', 'library', 'flatTypes'] as const) {
    const value = (plan as unknown as RawRecord)[key]
    if (value !== undefined) out[key] = value
  }
  out['walls'] = plan.walls.filter((w) => parts.walls.has(w.id))
  out['rooms'] = plan.rooms.filter((r) => parts.rooms.has(r.id))
  out['openings'] = plan.openings.filter((o) => parts.openings.has(o.id))
  const items = (plan.items ?? []).filter((i) => parts.items.has(i.id))
  if (items.length > 0) out['items'] = items
  for (const [key, ids] of parts.lists) {
    const picked = pick(key, ids)
    if (picked.length > 0) out[key] = picked
  }
  out['buildings'] = (plan.buildings ?? []).filter((b) => b.id === parts.id).map((b) => ({ ...b, floors: [...parts.floors] }))
  return out as unknown as FloorPlan
}

/** Every id the plan holds in one of its lists of parts, the floors' included. */
export function planIdsIn(plan: object): Set<string> {
  const ids = new Set<string>()
  for (const value of Object.values(plan)) {
    if (!Array.isArray(value)) continue
    for (const part of value) if (typeof part === 'object' && part !== null && typeof (part as RawRecord)['id'] === 'string') ids.add((part as RawRecord)['id'] as string)
  }
  return ids
}

/** The fields that hold the person's words or a fixed word, never an id: left as written. */
const NOT_IDS = new Set(['name', 'label', 'text', 'use', 'number', 'properties', 'written', 'type', 'kind', 'library', 'doorType', 'windowType', 'wallType', 'hinge', 'swing', 'phase', 'outdoor', 'tenure', 'overhang', 'building', 'face', 'roomType', 'category', 'finishes', 'shape', 'ridgeRuns', 'symbol', 'display', 'types'])

/** A record with each id in `map` renamed wherever it names a part. */
export function renamedIds<T>(value: T, map: ReadonlyMap<string, string>): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map.get(v) ?? v
    if (Array.isArray(v)) return v.map(walk)
    if (typeof v !== 'object' || v === null) return v
    return Object.fromEntries(Object.entries(v).map(([key, item]) => [key, NOT_IDS.has(key) ? item : walk(item)]))
  }
  return walk(value) as T
}

/** The keys that hold one point, and those that hold a list of points, in plan metres. */
const POINT = new Set(['start', 'end', 'centre', 'at', 'from', 'to', 'origin'])
const POINTS = new Set(['points', 'run', 'outline'])
const isPoint = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number'

/** VEW-22: a coordinate moved, cleaned of floating noise only. */
const exact = (value: number): number => Math.round(value * 1e6) / 1e6

/** A record with every point in it moved by `by`: wall ends and arc centres, item and column places, stair runs, outlines. */
export function movedBy<T>(value: T, by: readonly [number, number]): T {
  const move = (p: [number, number]): [number, number] => [exact(p[0] + by[0]), exact(p[1] + by[1])]
  const walk = (v: unknown, key: string | null): unknown => {
    if (key !== null && POINT.has(key) && isPoint(v)) return move(v)
    if (key !== null && POINTS.has(key) && Array.isArray(v) && v.every(isPoint)) return (v as [number, number][]).map(move)
    if (Array.isArray(v)) return v.map((item) => walk(item, null))
    if (typeof v !== 'object' || v === null) return v
    return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, k === 'properties' ? item : walk(item, k)]))
  }
  return walk(value, null) as T
}

/** An id no part has: the one asked for, else with -2, -3 ... after it. */
export function freeId(wanted: string, taken: Set<string>): string {
  let id = wanted
  for (let n = 2; taken.has(id); n++) id = `${wanted}-${n}`
  taken.add(id)
  return id
}

/** A part's id moved to another floor: its floor's id in front swapped for the new floor's, else the new floor's put in front. */
export function idOnFloor(id: string, from: string, to: string): string {
  return id.startsWith(`${from}-`) ? `${to}-${id.slice(from.length + 1)}` : `${to}-${id}`
}

/** Refused when a list of ids names one twice or one the plan has elsewhere. */
export function refuseTaken(ids: readonly string[], taken: ReadonlySet<string>, what: string): void {
  const clash = ids.filter((id) => taken.has(id))
  if (clash.length > 0) throw new EditRefused(`${what} ${said([...new Set(clash)])} ${clash.length === 1 ? 'is' : 'are'} the id${clash.length === 1 ? '' : 's'} of another part of the plan already: give another.`)
}
