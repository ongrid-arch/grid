/**
 * CNT-9: asking across the plan's parts by any field: what Grid works out (an area, a width, the
 * rooms beside a wall) or a fact of the person's own (a fire rating, a department, a head count).
 * The three tools `grid_fields`, `grid_find` and `grid_count` are written on this file.
 *
 * A part is a wall, a door, a window, a doorless opening, a room or a floor, and (CNT-45) a fixture
 * or a piece of furniture, asked of only when a tool asks for them (`askPlan`). A condition is one
 * line, `<field> <test>`: `fire rating is missing`, `department = Sales`, `area >= 20`,
 * `width < 900 mm`, `name contains office`. A part with no value for a field meets only `is
 * missing`; every other test needs a value. Text is matched whatever its capitals. A fact is
 * named as the plan names it, matched whatever its capitals, spaces or dashes (`factKey`); where
 * one has the name of a field Grid works out, `properties.<name>` asks for the fact.
 *
 * Grid checks nothing against a fact: it finds, counts and sums them as the plan gives them.
 *
 * Pure: a survey in, plain data out.
 */
import { compareIds, flatOfRoom, floorOf, indexPlan, itemKindDefinition, itemRoom, phaseReading, planFlats, planFloors, planForFloor, roomShapes, tolerance, wallLength } from '@ongrid/floorplan/geometry'
import { factKey, factOf, factText, type FloorPlan, type FactValue, type Phase } from '@ongrid/floorplan/types/floorplan'
import { say } from '@ongrid/floorplan/messages'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { LengthRefused, readLength, type AreaUnit } from '@ongrid/floorplan/types/units'
import { notCountedRooms, planAreas, roomKey, type RoomNotCounted } from './areas'
import { roomHeight } from './measure'
import { roomGroupField } from './roomGroups'
import { planSeating, seatingOf, type Seating } from './seats'
import { surveyPlan, type Survey } from './survey'
import { sqFt } from './units'

/** The parts that carry facts of the person's own (`grid_set_facts`). */
export const FACT_PART_KINDS = ['wall', 'door', 'window', 'opening', 'room', 'floor'] as const
/** CNT-45: and the plan's fixtures and furniture, which the query tools ask of too; CNT-52: and its points. */
export const PART_KINDS = [...FACT_PART_KINDS, 'fixture', 'furniture', 'point'] as const
export type PartKind = (typeof PART_KINDS)[number]
const ITEMS: readonly PartKind[] = ['fixture', 'furniture', 'point']
/** CNT-52: the kind of part an item is asked of as, by its group. */
const itemPart = (kind: string): PartKind => {
  const group = itemKindDefinition(kind)?.group
  return group === 'furniture' ? 'furniture' : group === 'point' ? 'point' : 'fixture'
}
const isItemPart = (kind: PartKind): boolean => kind === 'fixture' || kind === 'furniture' || kind === 'point'

export type FieldType = 'text' | 'number' | 'yes-no' | 'list'
export type Value = string | number | boolean | readonly string[] | null

/** A field that can be asked about. */
export interface FieldInfo {
  readonly name: string
  readonly type: FieldType | 'mixed'
  /** `m` or `m²` for a measure; null for anything else, and for every fact of the person's own. */
  readonly unit: 'm' | 'm²' | null
  /** The kinds of part that have it. */
  readonly kinds: readonly PartKind[]
  /** `grid` for what the plan states or Grid works out; `yours` for a fact of the person's own. */
  readonly from: 'grid' | 'yours'
  readonly about: string
}

/** A fact of the person's own as `grid_fields` lists it. */
export interface FactInfo extends FieldInfo {
  /** How many parts carry it. */
  readonly count: number
  /** Its values, at most `FACT_VALUES_SHOWN`, most carried first; text and yes or no only. */
  readonly values: readonly string[]
  /** True when a field Grid works out has the same name: ask for it as `properties.<name>`. */
  readonly shadowed: boolean
}

export const FACT_VALUES_SHOWN = 12

const OPENINGS: readonly PartKind[] = ['door', 'window', 'opening']
const ALL: readonly PartKind[] = PART_KINDS
const PHASE_KINDS: readonly PartKind[] = ['wall', ...OPENINGS, 'room']

/** The fields Grid states or works out, in the order `grid_fields` lists them. */
export const GRID_FIELDS: readonly FieldInfo[] = [
  { name: 'id', type: 'text', unit: null, kinds: ALL, from: 'grid', about: 'Its id in the plan.' },
  { name: 'kind', type: 'text', unit: null, kinds: ALL, from: 'grid', about: 'wall, door, window, opening (doorless), room, floor, fixture (it takes floor: a toilet, a bath) or furniture (it can be moved: a bed, a sofa).' },
  { name: 'floor', type: 'text', unit: null, kinds: ALL, from: 'grid', about: 'The id of the floor it is on; a floor\'s own id.' },
  { name: 'name', type: 'text', unit: null, kinds: ['room', 'floor'], from: 'grid', about: 'Its name in the plan.' },
  { name: 'number', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The room number the plan states, if any.' },
  { name: 'use', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'What the room is for, as the plan states it.' },
  { name: 'room type', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The firm\'s own type for the room ("B2 double bedroom"), as the plan states it.' },
  { name: 'tenure', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'Who the room is for: private, shared, common or commercial, as the plan states it.' },
  { name: 'flat', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The id of the flat the room is in, from the plan\'s flats list; none for a room in no flat.' },
  { name: 'flat type', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The type of the flat the room is in: its name, else its id.' },
  { name: 'area', type: 'number', unit: 'm²', kinds: ['room', 'floor'], from: 'grid', about: 'Net floor area, as grid_areas measures it; none for a room Grid could not draw.' },
  { name: 'height', type: 'number', unit: 'm', kinds: ['wall', ...OPENINGS, 'room', 'floor', ...ITEMS], from: 'grid', about: 'A wall\'s or opening\'s height; a room\'s as grid_measure gives it; a floor\'s stated clear height; an item\'s from the floor to its top.' },
  { name: 'width', type: 'number', unit: 'm', kinds: [...OPENINGS, ...ITEMS], from: 'grid', about: 'The opening in the wall, as the plan states it; an item\'s width along its back.' },
  { name: 'sill', type: 'number', unit: 'm', kinds: OPENINGS, from: 'grid', about: 'Height of the opening\'s bottom above the floor.' },
  { name: 'length', type: 'number', unit: 'm', kinds: ['wall'], from: 'grid', about: 'Along its centre line, end to end.' },
  { name: 'thickness', type: 'number', unit: 'm', kinds: ['wall'], from: 'grid', about: 'As the plan states it.' },
  { name: 'wall kind', type: 'text', unit: null, kinds: ['wall'], from: 'grid', about: 'exterior, interior or partition, as the plan states it.' },
  { name: 'virtual', type: 'yes-no', unit: null, kinds: ['wall'], from: 'grid', about: 'yes for a dividing line, which has no material.' },
  { name: 'wall', type: 'text', unit: null, kinds: OPENINGS, from: 'grid', about: 'The id of the wall it is in.' },
  { name: 'rooms', type: 'list', unit: null, kinds: ['wall', ...OPENINGS, ...ITEMS], from: 'grid', about: 'The ids of the rooms beside it; an opening\'s two sides, "outside" where no room is; the room an item stands in.' },
  { name: 'level', type: 'number', unit: null, kinds: ['floor'], from: 'grid', about: 'The floor\'s place in the stack: 0 the ground floor, 1 the floor above.' },
  { name: 'phase', type: 'text', unit: null, kinds: PHASE_KINDS, from: 'grid', about: say('en', 'query.field.phase') },
  { name: 'stage', type: 'text', unit: null, kinds: PHASE_KINDS, from: 'grid', about: say('en', 'query.field.stage') },
  // CNT-51: a room's or zone's finishes, as the plan states them.
  { name: 'floor finish', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The finish of its floor, as the plan names it.' },
  { name: 'wall finish', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The finish of its walls\' inside faces, as the plan names it.' },
  { name: 'ceiling finish', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'The finish of its ceiling, as the plan names it.' },
  { name: 'skirting finish', type: 'text', unit: null, kinds: ['room'], from: 'grid', about: 'Its skirting as the plan names it; none when it states no skirting.' },
  { name: 'band finishes', type: 'list', unit: null, kinds: ['room'], from: 'grid', about: 'The finishes of its bands and of the wall faces finished apart, each once.' },
  // CNT-45: the plan's fixtures and furniture.
  { name: 'item kind', type: 'text', unit: null, kinds: ITEMS, from: 'grid', about: 'What the item is: a fixture (toilet, basin, shower, bath, kitchen-run, or equipment such as rack or seat), furniture (bed, table, chair, sofa, storage, armchair, stool, desk, rug, plant) or a point (extinguisher, aed, call-point, first-aid, sensor, desk-point, spawn, camera, you-are-here, hose-reel, fire-door, exit, refuge, assembly-point).' },
  { name: 'label', type: 'text', unit: null, kinds: ITEMS, from: 'grid', about: 'What the drawing calls the item, its own or its library entry\'s.' },
  { name: 'library', type: 'text', unit: null, kinds: ITEMS, from: 'grid', about: 'The library entry it was placed from, by name.' },
  { name: 'room', type: 'text', unit: null, kinds: ITEMS, from: 'grid', about: 'The id of the room it stands in: the one that holds the middle of its footprint.' },
  { name: 'depth', type: 'number', unit: 'm', kinds: ITEMS, from: 'grid', about: 'From its back to its front.' },
  { name: 'turn', type: 'number', unit: null, kinds: ITEMS, from: 'grid', about: 'Degrees counter-clockwise; 0 puts its back to -y.' },
  { name: 'clearance', type: 'number', unit: 'm', kinds: ITEMS, from: 'grid', about: 'The clear floor it keeps in front of it.' },
  // ARE-67: the seats, desks and covers the furniture gives (`seats.ts`), per item and in totals.
  { name: 'item zone', type: 'text', unit: null, kinds: ITEMS, from: 'grid', about: 'The id of the zone of its room it stands in, if any. Named so to leave a fact called zone to the person.' },
  { name: 'seats', type: 'number', unit: null, kinds: [...ITEMS, 'room', 'floor'], from: 'grid', about: 'The seats an item gives (a chair one, a sofa or pew one per 0.6 m of width unless its label says), or a room\'s, zone\'s or floor\'s total of them, as grid_measure what=seats counts them.' },
  { name: 'desks', type: 'number', unit: null, kinds: [...ITEMS, 'room', 'floor'], from: 'grid', about: 'A desk is one; a room\'s, zone\'s or floor\'s total of them.' },
  { name: 'covers', type: 'number', unit: null, kinds: [...ITEMS, 'room', 'floor'], from: 'grid', about: 'The seats an item gives when it stands at a table; a room\'s, zone\'s or floor\'s total of them.' },
]

/** One part of the plan, as the query tools see it. */
export interface Part {
  readonly kind: PartKind
  readonly id: string
  readonly floor: string
  readonly facts: Readonly<Record<string, FactValue>>
  readonly phase?: Phase
  /** CNT-8, only on a zone: the room it is part of. It has no number of its own and is counted in no total. */
  readonly zoneOf?: string
}

/** Why a question was refused, in Grid's words, never repeating what was sent. */
export class QueryRefused extends Error {
  override readonly name = 'QueryRefused'
}

/** The plan read for the query tools: its parts, and each field's values worked out on first use. */
export interface Asked {
  readonly survey: Survey
  readonly parts: readonly Part[]
  /** The value of a field for a part, worked out once. */
  value(part: Part, field: Field): Value
  /**
   * CNT-27: why a room part is in no total of grid_areas' net (a zone, a stair or lift room counted
   * with its shaft's lowest, a void, outdoor space), or null for a room the net counts and any other part.
   */
  counting(part: Part): RoomNotCounted | null
}

/** A field as a question names it: one Grid works out, or a fact of the person's own. */
export type Field = { readonly from: 'grid'; readonly info: FieldInfo } | { readonly from: 'yours'; readonly name: string }

function openingKind(type: 'door' | 'window' | 'opening'): PartKind {
  return type
}

/**
 * Every part of the plan, in one order whatever the file's: floors, then each kind by id. CNT-45:
 * with `items`, its fixtures, furniture and points (CNT-52) last, with their facts; a change of facts
 * leaves them out: an item is given its facts as it is added (`grid_add_item`).
 */
export function askPlan(survey: Survey, options: { readonly items?: boolean; readonly stated?: FloorPlan } = {}): Asked {
  const plan = survey.plan
  const stated = options.stated ?? plan
  const phases = phaseReading(stated)
  let before: Survey | undefined
  const beforeWork = (): Survey => (before ??= surveyPlan(stated, 'before'))
  const wallFloor = new Map(stated.walls.map((w) => [w.id, floorOf(w)] as const))
  const parts: Part[] = []
  const byId = <T extends { id: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => compareIds(a.id, b.id))
  for (const floor of planFloors(stated)) parts.push({ kind: 'floor', id: floor.id, floor: floor.id, facts: floor.properties ?? {} })
  const zoneOf = new Map(survey.rooms.flatMap((room) => (room.facts.zoneOf === undefined ? [] : [[room.facts.id, room.facts.zoneOf] as const])))
  for (const room of byId(stated.rooms)) {
    const phase = phases.room(room)
    const of = zoneOf.get(room.id) ?? (phase === 'demolished' && room.partOf !== undefined ? beforeWork().byId.get(room.id)?.facts.zoneOf : undefined)
    parts.push({ kind: 'room', id: room.id, floor: floorOf(room), facts: room.properties ?? {}, phase, ...(of === undefined ? {} : { zoneOf: of }) })
  }
  for (const wall of byId(stated.walls)) parts.push({ kind: 'wall', id: wall.id, floor: floorOf(wall), facts: wall.properties ?? {}, phase: phases.wall(wall) })
  for (const opening of byId(stated.openings)) parts.push({ kind: openingKind(opening.type), id: opening.id, floor: wallFloor.get(opening.wall) ?? 'ground', facts: opening.properties ?? {}, phase: phases.opening(opening) })
  const items = new Map((options.items === true ? plan.items ?? [] : []).map((item) => [item.id, item] as const))
  for (const item of byId([...items.values()])) parts.push({ kind: itemPart(item.kind), id: item.id, floor: floorOf(item), facts: item.properties ?? {} })
  let shapes: ReturnType<typeof roomShapes> | null = null
  const roomOfItem = (id: string): string | null => {
    shapes ??= roomShapes(indexPlan(plan))
    return itemRoom(items.get(id)!, shapes)?.id ?? null
  }

  const walls = new Map(stated.walls.map((w) => [w.id, w] as const))
  const rooms = new Map(stated.rooms.map((r) => [r.id, r] as const))
  const openings = new Map(stated.openings.map((o) => [o.id, o] as const))
  const floors = new Map(planFloors(stated).map((f) => [f.id, f] as const))
  let areas: Map<string, number | null> | null = null
  let floorAreas: Map<string, number> | null = null
  let left: Map<string, RoomNotCounted> | null = null
  const beside = new Map<Survey, Map<string, string[]>>()
  let flatsOf: ReturnType<typeof flatOfRoom> | null = null
  let flatTypes: Map<string, string | null> | null = null
  let seating: Seating | null = null
  const seatingNow = (): Seating => (seating ??= planSeating(survey))
  const storeys = new Map<string, ReturnType<typeof planForFloor>>()
  const cache = new Map<string, Value>()

  const measured = (): { areas: Map<string, number | null>; floorAreas: Map<string, number>; left: Map<string, RoomNotCounted> } => {
    if (areas === null || floorAreas === null || left === null) {
      const figures = planAreas(survey)
      // CNT-27: by floor and id, as the figures list them.
      areas = new Map(figures.floors.flatMap((f) => f.rooms.map((r) => [roomKey(f.floor, r.id), r.net] as const)))
      floorAreas = new Map(figures.floors.map((f) => [f.floor, f.net] as const))
      left = notCountedRooms(figures)
    }
    return { areas, floorAreas, left }
  }
  const areaOf = (part: Part): number | null => {
    const m = measured()
    return part.kind === 'floor' ? m.floorAreas.get(part.id) ?? null : m.areas.get(roomKey(part.floor, part.id)) ?? null
  }
  const roomsBeside = (wall: string, state: Survey): string[] => {
    let byWall = beside.get(state)
    if (byWall === undefined) {
      byWall = new Map()
      for (const room of state.rooms) {
        for (const id of new Set(room.edges.flatMap((edge) => (edge.wall === null ? [] : [edge.wall.id])))) {
          byWall.set(id, [...(byWall.get(id) ?? []), room.facts.id])
        }
      }
      beside.set(state, byWall)
    }
    return [...(byWall.get(wall) ?? [])].sort(compareIds)
  }
  // CNT-4: the flat a room is in, by the plan's flats list; the one whose id comes first when two hold it.
  const flatOf = (room: string): { id: string; type: string | null } | null => {
    if (flatsOf === null || flatTypes === null) {
      const flats = planFlats(plan)
      flatsOf = flatOfRoom(flats)
      flatTypes = new Map(flats.map((flat) => [flat.id, flat.typeName ?? flat.type] as const))
    }
    const id = flatsOf.get(room)
    return id === undefined ? null : { id, type: flatTypes.get(id) ?? null }
  }
  const storey = (floor: string): ReturnType<typeof planForFloor> => {
    let found = storeys.get(floor)
    if (found === undefined) {
      found = planForFloor(plan, floor)
      storeys.set(floor, found)
    }
    return found
  }

  const gridValue = (part: Part, name: string): Value => {
    if (name === 'id') return part.id
    if (name === 'kind') return part.kind
    if (name === 'floor') return part.floor
    if (name === 'phase' || name === 'stage') return part.phase ?? null
    if (name === 'seats' || name === 'desks' || name === 'covers' || name === 'item zone') {
      const counted = seatingNow()
      if (isItemPart(part.kind)) {
        if (name === 'item zone') return counted.itemZones.get(part.id) ?? null
        return counted.byItem.get(part.id)?.[name] ?? 0
      }
      if (name === 'item zone') return null
      if (part.kind === 'floor') return counted.floors.get(part.id)?.[name] ?? 0
      return seatingOf(counted, part.id)?.[name] ?? 0
    }
    if (part.kind === 'floor') {
      const floor = floors.get(part.id)!
      if (name === 'name') return floor.name
      if (name === 'level') return floor.level
      if (name === 'height') return floor.height ?? null
      if (name === 'area') return areaOf(part)
      return null
    }
    if (part.kind === 'room') {
      const room = rooms.get(part.id)!
      if (name === 'name') return room.name
      // CNT-8: a zone is numbered by its room; a number it states is kept, not read.
      if (name === 'number') return part.zoneOf === undefined ? room.number ?? null : null
      if (name === 'use') return room.use ?? null
      if (name === 'room type') return room.roomType ?? null
      if (name === 'tenure') return room.tenure ?? null
      if (name === 'flat') return flatOf(room.id)?.id ?? null
      if (name === 'flat type') return flatOf(room.id)?.type ?? null
      if (name === 'area') return areaOf(part)
      if (name === 'height') {
        const slice = part.phase === 'demolished' ? planForFloor(beforeWork().plan, part.floor) : storey(part.floor)
        return roomHeight(slice, part.id).value
      }
      if (name === 'floor finish') return room.finishes?.floor ?? null
      if (name === 'wall finish') return room.finishes?.walls ?? null
      if (name === 'ceiling finish') return room.finishes?.ceiling ?? null
      if (name === 'skirting finish') return room.finishes?.skirting === false ? 'none' : room.finishes?.skirting ?? null
      if (name === 'band finishes') return [...new Set([...(room.finishes?.bands ?? []).map((band) => band.finish), ...(room.finishes?.faces ?? []).map((face) => face.finish)])]
      return null
    }
    if (part.kind === 'wall') {
      const wall = walls.get(part.id)!
      // Along a curved wall's curve (CNT-18).
      if (name === 'length') return wallLength(wall)
      if (name === 'thickness') return wall.thickness
      if (name === 'height') return wall.height
      if (name === 'wall kind') return wall.kind
      if (name === 'virtual') return wall.virtual === true
      if (name === 'rooms') return roomsBeside(wall.id, part.phase === 'demolished' ? beforeWork() : survey)
      return null
    }
    if (isItemPart(part.kind)) {
      const item = items.get(part.id)!
      if (name === 'item kind') return item.kind
      if (name === 'label') return item.label ?? null
      if (name === 'library') return item.library ?? null
      if (name === 'room') return roomOfItem(item.id)
      if (name === 'rooms') return roomOfItem(item.id) === null ? [] : [roomOfItem(item.id)!]
      if (name === 'width') return item.size[0]
      if (name === 'depth') return item.size[1]
      if (name === 'height') return item.height
      if (name === 'turn') return item.turn ?? 0
      if (name === 'clearance') return item.clearance ?? null
      return null
    }
    const opening = openings.get(part.id)!
    if (name === 'width') return opening.width
    if (name === 'height') return opening.height
    if (name === 'sill') return opening.sill
    if (name === 'wall') return opening.wall
    if (name === 'rooms') {
      const state = part.phase === 'demolished' ? beforeWork() : survey
      const sides = state.facts.openings.get(opening.id)?.sides
      if (sides === undefined) return []
      return sides.map((side) => (typeof side === 'object' ? side.room : side))
    }
    return null
  }

  return {
    survey,
    parts,
    value(part, field) {
      if (field.from === 'yours') return factOf({ properties: part.facts }, field.name) ?? null
      if (!field.info.kinds.includes(part.kind)) return null
      const key = `${part.kind}\u0000${part.id}\u0000${field.info.name}`
      if (cache.has(key)) return cache.get(key)!
      const value = gridValue(part, field.info.name)
      cache.set(key, value)
      return value
    },
    counting(part) {
      return part.kind === 'room' ? measured().left.get(roomKey(part.floor, part.id)) ?? null : null
    },
  }
}

// ---------------------------------------------------------------------------------------------
// What can be asked

/** The facts of the person's own the parts carry, by name, first met first. */
export function factInfos(asked: Asked, kinds?: readonly PartKind[]): FactInfo[] {
  const found = new Map<string, { name: string; kinds: Set<PartKind>; types: Set<string>; count: number; values: Map<string, number> }>()
  for (const part of asked.parts) {
    if (kinds !== undefined && !kinds.includes(part.kind)) continue
    for (const [name, value] of Object.entries(part.facts)) {
      const key = factKey(name)
      const entry = found.get(key) ?? { name, kinds: new Set<PartKind>(), types: new Set<string>(), count: 0, values: new Map<string, number>() }
      entry.kinds.add(part.kind)
      entry.types.add(typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'yes-no' : 'text')
      entry.count += 1
      if (typeof value !== 'number') entry.values.set(factText(value), (entry.values.get(factText(value)) ?? 0) + 1)
      found.set(key, entry)
    }
  }
  const grid = new Set(GRID_FIELDS.map((f) => factKey(f.name)))
  return [...found.values()].map((entry) => ({
    name: entry.name,
    type: entry.types.size === 1 ? ([...entry.types][0] as FieldType) : 'mixed',
    unit: null,
    kinds: PART_KINDS.filter((kind) => entry.kinds.has(kind)),
    from: 'yours',
    about: 'A fact of your own, as the plan gives it.',
    count: entry.count,
    values: [...entry.values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, FACT_VALUES_SHOWN).map(([value]) => value),
    shadowed: grid.has(factKey(entry.name)),
  }))
}

/** CNT-57: the fields a room is grouped by that Grid states, whose values grid_fields lists. */
export const ROOM_GROUP_FIELDS = ['room type', 'tenure', 'flat type'] as const

/**
 * CNT-57: the values the rooms state for each of `ROOM_GROUP_FIELDS`, most stated first, with how
 * many rooms state one; a zone is its room's, so it is left out. Only the fields a room states.
 */
export function roomGroupValues(asked: Asked): Map<string, { count: number; values: string[] }> {
  const out = new Map<string, { count: number; values: string[] }>()
  for (const name of ROOM_GROUP_FIELDS) {
    const field: Field = { from: 'grid', info: GRID_FIELDS.find((f) => f.name === name)! }
    const seen = new Map<string, number>()
    let count = 0
    for (const part of asked.parts) {
      if (part.kind !== 'room' || part.zoneOf !== undefined) continue
      const value = asked.value(part, field)
      if (typeof value !== 'string') continue
      count += 1
      seen.set(value, (seen.get(value) ?? 0) + 1)
    }
    if (count === 0) continue
    out.set(name, { count, values: [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, FACT_VALUES_SHOWN).map(([value]) => value) })
  }
  return out
}

/** Every name a question may use, for a refusal's nearest name. */
function knownNames(asked: Asked): string[] {
  return [...GRID_FIELDS.map((f) => f.name), ...factInfos(asked).map((f) => f.name)]
}

/**
 * The field a question names: one Grid works out by its name, `properties.<name>` for a fact, or
 * a fact by its name. Unknown, it is refused with the nearest name the plan has, never the name sent.
 */
export function fieldOf(asked: Asked, name: string, argument: string): Field {
  const wanted = name.trim()
  const grid = GRID_FIELDS.find((f) => f.name === wanted.toLowerCase() || factKey(f.name) === factKey(wanted))
  if (wanted.toLowerCase().startsWith('properties.')) return { from: 'yours', name: wanted.slice('properties.'.length) }
  if (grid !== undefined) return { from: 'grid', info: grid }
  const fact = factInfos(asked).find((f) => factKey(f.name) === factKey(wanted))
  if (fact !== undefined) return { from: 'yours', name: fact.name }
  // CNT-57: a room's group by the word a person uses (`type` for the room type), a fact's name first.
  const group = roomGroupField(wanted)
  if (group !== null) return { from: 'grid', info: GRID_FIELDS.find((f) => f.name === group)! }
  const near = likelyId(wanted, knownNames(asked))
  throw new QueryRefused(`${argument} names no field of the plan and no fact any part carries.${near === null ? '' : ` The nearest is ${JSON.stringify(near)}.`} grid_fields lists them.`)
}

/** A field's name as an answer gives it: Grid's own, or the fact's as the plan names it. */
export function fieldName(field: Field): string {
  return field.from === 'grid' ? field.info.name : field.name
}

/** What a field holds, for a test or a sum: a number, text, yes or no, or a list. */
function fieldType(asked: Asked, field: Field): FieldInfo['type'] {
  if (field.from === 'grid') return field.info.type
  return factInfos(asked).find((f) => factKey(f.name) === factKey(field.name))?.type ?? 'text'
}

// ---------------------------------------------------------------------------------------------
// Conditions

export type Test = 'missing' | 'set' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains'

export interface Condition {
  readonly field: Field
  readonly test: Test
  readonly value: string | null
}

/** The rule every answer of grid_find and grid_count states. */
export const QUERY_RULE =
  'A part with no value for a field meets only "is missing"; every other test needs a value. Text is matched whatever its capitals. Facts are the plan\'s own: Grid checks nothing against them.'

const TESTS = /^(.+?)\s*(!=|>=|<=|=|>|<)\s*(.+)$/

/** One condition, `<field> <test> [value]`, read; refused by its place in the list, never repeating it. */
export function readCondition(asked: Asked, text: string, place: string): Condition {
  const line = text.trim()
  const word = /^(.+?)\s+is\s+(missing|not set|set)$/i.exec(line)
  if (word !== null) {
    const test = word[2]!.toLowerCase() === 'set' ? 'set' : 'missing'
    return { field: fieldOf(asked, word[1]!, place), test, value: null }
  }
  const contains = /^(.+?)\s+contains\s+(.+)$/i.exec(line)
  if (contains !== null) return { field: fieldOf(asked, contains[1]!, place), test: 'contains', value: contains[2]!.trim() }
  const compared = TESTS.exec(line)
  if (compared === null) {
    throw new QueryRefused(`${place} is not a condition Grid reads: write a field and a test, as "fire rating is missing", "department = Sales", "area >= 20" or "name contains office".`)
  }
  const field = fieldOf(asked, compared[1]!, place)
  const test = compared[2] as Test
  const type = fieldType(asked, field)
  if ((test === '<' || test === '<=' || test === '>' || test === '>=') && type !== 'number' && type !== 'mixed') {
    throw new QueryRefused(`${place} compares ${JSON.stringify(fieldName(field))} as a number, but it holds ${type === 'list' ? 'a list' : type === 'yes-no' ? 'yes or no' : 'text'}: use = or != instead.`)
  }
  return { field, test, value: compared[3]!.trim() }
}

// CMD-30: in one form (NFC) on both sides, so a name written before with a combining accent is still found.
const fold = (text: string): string => text.normalize('NFC').trim().toLowerCase()

/** A number the person typed for a field: a length may carry its unit (`900 mm`, `3'`). */
function numberOf(field: Field, text: string): number | null {
  if (field.from === 'grid' && field.info.unit === 'm') {
    try {
      return readLength(text, 'point')
    } catch (error) {
      if (error instanceof LengthRefused) return null
      throw error
    }
  }
  const n = Number(text.replace(/\s*m²?$|\s*m2$/i, ''))
  return Number.isFinite(n) && text.trim() !== '' ? n : null
}

function yesNo(text: string): boolean | null {
  const word = fold(text)
  return word === 'yes' || word === 'true' ? true : word === 'no' || word === 'false' ? false : null
}

function equal(field: Field, value: Exclude<Value, null>, wanted: string): boolean {
  if (Array.isArray(value)) return value.some((item) => fold(item) === fold(wanted))
  if (typeof value === 'number') {
    const n = numberOf(field, wanted)
    if (n === null) return false
    return field.from === 'grid' && field.info.unit !== null ? Math.abs(value - n) <= tolerance('noLength') : value === n
  }
  if (typeof value === 'boolean') return yesNo(wanted) === value
  return fold(value as string) === fold(wanted)
}

/** Whether a part meets one condition. */
export function meets(asked: Asked, part: Part, condition: Condition): boolean {
  const value = asked.value(part, condition.field)
  const missing = value === null || (Array.isArray(value) && value.length === 0)
  if (condition.test === 'missing') return missing
  if (condition.test === 'set') return !missing
  if (missing) return false
  const wanted = condition.value!
  switch (condition.test) {
    case '=':
      return equal(condition.field, value, wanted)
    case '!=':
      return !equal(condition.field, value, wanted)
    case 'contains': {
      const words = Array.isArray(value) ? (value as readonly string[]) : [typeof value === 'string' ? value : factText(value as number | boolean)]
      return words.some((word) => fold(word).includes(fold(wanted)))
    }
    default: {
      if (typeof value !== 'number') return false
      const n = numberOf(condition.field, wanted)
      if (n === null) return false
      if (condition.test === '<') return value < n
      if (condition.test === '<=') return value <= n
      if (condition.test === '>') return value > n
      return value >= n
    }
  }
}

/** A number in a condition that cannot be read is refused before the parts are looked at. */
export function checkCondition(condition: Condition, place: string): void {
  if (condition.value === null) return
  const numeric = condition.test === '<' || condition.test === '<=' || condition.test === '>' || condition.test === '>='
  if (numeric && numberOf(condition.field, condition.value) === null) {
    const unit = condition.field.from === 'grid' && condition.field.info.unit === 'm' ? ', in metres or with its unit, as 0.9 or 900 mm' : ''
    throw new QueryRefused(`${place} compares with something that is not a number: give a number${unit}.`)
  }
}

// ---------------------------------------------------------------------------------------------
// Finding and counting

export interface Selection {
  readonly kinds?: readonly PartKind[]
  readonly floor?: string
  /** A room by id: the room, the walls beside it and the openings into it. */
  readonly room?: string
  readonly where?: readonly string[]
  readonly fields?: readonly Field[]
  /** ARE-75: every part, before and after the work, as a question about phases picks them. */
  readonly bothStates?: boolean
}

export function isPhaseField(field: Field): boolean {
  return field.from === 'grid' && (field.info.name === 'phase' || field.info.name === 'stage')
}

/** The parts a selection picks, in the parts' order. Phase questions include both states. */
export function select(asked: Asked, selection: Selection): Part[] {
  const conditions = (selection.where ?? []).map((text, i) => {
    const condition = readCondition(asked, text, `where item ${i + 1}`)
    checkCondition(condition, `where item ${i + 1}`)
    return condition
  })
  const includesDemolition = selection.bothStates === true || selection.fields?.some(isPhaseField) === true || conditions.some(({ field }) => isPhaseField(field))
  const rooms: Field = { from: 'grid', info: GRID_FIELDS.find((f) => f.name === 'rooms')! }
  return asked.parts.filter((part) => {
    if (!includesDemolition && part.phase === 'demolished') return false
    if (selection.kinds !== undefined && !selection.kinds.includes(part.kind)) return false
    if (selection.floor !== undefined && part.floor !== selection.floor) return false
    if (selection.room !== undefined) {
      const inRoom = part.kind === 'room' ? part.id === selection.room : (asked.value(part, rooms) as readonly string[] | null)?.includes(selection.room) === true
      if (!inRoom) return false
    }
    return conditions.every((condition) => meets(asked, part, condition))
  })
}

/** A value as an answer's data gives it: a list as a list, a length to the millimetre. */
export function shown(value: Value): Value {
  if (typeof value === 'number') return Math.round(value * 10000) / 10000
  return value
}

/** A group's value as text, for the answer and the key: "not stated" for none. */
export function valueWords(value: Value): string {
  if (value === null) return 'not stated'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

export interface Group {
  /** The value the parts share; null for the parts with none. */
  readonly value: Value
  readonly count: number
  /** Each field summed over the group's parts that have a value for it. */
  readonly sums: Readonly<Record<string, number>>
  /** How many of the group's parts have no value for each field summed. */
  readonly missing: Readonly<Record<string, number>>
  readonly ids: readonly string[]
}

/**
 * CNT-24: a number as it is printed, so equal sizes are one group. An area is printed to the
 * hundredth of a square metre (`areaReported`'s figure) and a length to the millimetre; any other
 * number keeps the four decimals `shown` gives.
 */
export function printedValue(field: Field | null, value: number, areaUnit: AreaUnit = 'm2'): number {
  const unit = field === null ? null : unitOf(field)
  // CNT-57: on a plan read in square feet an area prints, so groups, to the whole square foot.
  if (unit === 'm²' && areaUnit === 'ft2') return Math.round(Math.round(sqFt(value)) / sqFt(1) * 10000) / 10000
  const decimals = unit === 'm²' ? 2 : unit === 'm' ? 3 : 4
  const scale = 10 ** decimals
  // Round the digits that print, not the binary value: 13.495 prints as 13.50 whatever its error.
  const rounded = Math.round(Number((Math.abs(value) * scale).toPrecision(12))) / scale
  return value < 0 ? -rounded : rounded
}

/**
 * The parts grouped by one field's value, each group with its count, its sums and its ids, the
 * largest first and "not stated" last; one group of all of them when no field is given.
 */
export function groupParts(asked: Asked, parts: readonly Part[], by: Field | null, sums: readonly Field[], areaUnit: AreaUnit = 'm2'): Group[] {
  const groups = new Map<string, { value: Value; parts: Part[] }>()
  for (const part of parts) {
    const raw = by === null ? null : asked.value(part, by)
    const value = typeof raw === 'number' ? printedValue(by, raw, areaUnit) : raw
    if (Array.isArray(value)) throw new QueryRefused(`by names a field that holds a list (${JSON.stringify(fieldName(by!))}): group by a field with one value per part, or find by it with where.`)
    const key = value === null ? '\u0000none' : typeof value === 'string' ? `t:${fold(value)}` : `${typeof value}:${String(value)}`
    const group = groups.get(key) ?? { value, parts: [] }
    group.parts.push(part)
    groups.set(key, group)
  }
  const out = [...groups.values()].map((group): Group => {
    const total: Record<string, number> = {}
    const missing: Record<string, number> = {}
    for (const field of sums) {
      const name = fieldName(field)
      total[name] = 0
      missing[name] = 0
      for (const part of group.parts) {
        const value = asked.value(part, field)
        if (typeof value === 'number') total[name] += value
        else missing[name] += 1
      }
      total[name] = Math.round(total[name]! * 10000) / 10000
    }
    return { value: shown(group.value), count: group.parts.length, sums: total, missing, ids: group.parts.map((p) => p.id) }
  })
  return out.sort((a, b) => (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || b.count - a.count || valueWords(a.value).localeCompare(valueWords(b.value)))
}

/** Checks that each field to sum holds numbers. */
export function checkSums(asked: Asked, fields: readonly Field[]): void {
  for (const field of fields) {
    const type = fieldType(asked, field)
    if (type !== 'number' && type !== 'mixed') throw new QueryRefused(`sum names ${JSON.stringify(fieldName(field))}, which holds ${type === 'list' ? 'a list' : type === 'yes-no' ? 'yes or no' : 'text'}: only a field of numbers can be summed. Count the parts by it with by instead.`)
  }
}

/** The unit of a field's values, for a sum: Grid's own; none for a fact of the person's own. */
export function unitOf(field: Field): 'm' | 'm²' | null {
  return field.from === 'grid' ? field.info.unit : null
}
