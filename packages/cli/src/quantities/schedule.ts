/**
 * One schedule of the doors, windows and doorless openings, grouped by type and size, each
 * listed once with the two rooms it joins. Sizes are the hole in the wall: the plan holds no
 * frame, leaf or clear width.
 */
import { compareIds, openingTypeOf, partHeight, partWidth, phaseReading, planForFloor, roomNumbers, sideSeenFrom, statedKind, tolerance } from '@ongrid/floorplan/geometry'
import { factText, type DoorType, type Facts, type FloorPlan, type Opening, type OpeningKind, type Phase, type WindowType } from '@ongrid/floorplan/types/floorplan'
import { english, said, type Said } from '@ongrid/floorplan/messages'
import { planFacts, type FloorFacts, type OpeningFacts, type PlanFacts } from '../describe/facts'
import { AREA_RULES, FLAT_RULE, notCounted, planAreas, type RoomNotCounted } from './areas'
import { flatOfRoom, planFlatTypes, planFlats } from '@ongrid/floorplan/geometry'
import { HEIGHT_RULE, roomHeight } from './measure'
import { joinStates, type AreaState, type NumberState } from './state'
import { roomCalled, sideNames, surveyPlan, type Survey } from './survey'
import { csv, csvLengths, csvLengthUnit, sqFt } from './units'
import type { Display } from '@ongrid/floorplan/types/units'
import type { DrawingMarksAsked, ScheduleMarkLabels } from '@ongrid/floorplan/geometry/drawingMarks'

export const SCHEDULE_RULE =
  'Sizes are the opening in the wall, width by height, in metres, with the sill above the floor. The plan holds no frames or leaves, so a clear width is not known.'

export interface ScheduleItem {
  readonly id: string
  readonly floor: string
  readonly between: readonly [string, string]
}

export interface ScheduleRow {
  readonly type: 'door' | 'window' | 'opening'
  /** CNT-14: the kind the plan states (`sliding`, `fixed`), or null; one type of each kind and size. */
  readonly kind: OpeningKind | null
  readonly width: number
  readonly height: number
  readonly sill: number
  readonly count: number
  readonly items: readonly ScheduleItem[]
}

export interface Schedule {
  readonly rows: readonly ScheduleRow[]
  readonly counts: Readonly<Record<'door' | 'window' | 'opening', number>>
  readonly rule: string
}

const ORDER = { door: 0, window: 1, opening: 2 } as const

/** CNT-14: openings that state no kind first, then by kind's word. */
const kindOrder = (a: OpeningKind | null, b: OpeningKind | null): number => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1)

export function planSchedule(
  survey: Survey,
  options: { floors?: readonly string[]; types?: readonly ('door' | 'window' | 'opening')[]; narrowerThan?: number } = {},
): Schedule {
  const groups = new Map<string, { type: ScheduleRow['type']; kind: OpeningKind | null; width: number; height: number; sill: number; items: ScheduleItem[] }>()
  const stated = new Map(survey.plan.openings.map((o) => [o.id, o] as const))
  for (const floor of survey.facts.floors) {
    if (options.floors !== undefined && !options.floors.includes(floor.id)) continue
    for (const opening of floor.openings) {
      if (options.types !== undefined && !options.types.includes(opening.type)) continue
      if (options.narrowerThan !== undefined && !(opening.width < options.narrowerThan - tolerance('noLength'))) continue
      const kind = statedKind(opening.type, stated.get(opening.id)?.kind)
      const key = [opening.type, kind ?? '', opening.width.toFixed(3), opening.height.toFixed(3), opening.sill.toFixed(3)].join('|')
      const group = groups.get(key) ?? { type: opening.type, kind, width: opening.width, height: opening.height, sill: opening.sill, items: [] }
      group.items.push({ id: opening.id, floor: floor.id, between: sideNames(opening) })
      groups.set(key, group)
    }
  }
  const rows = [...groups.values()]
    .map((group) => ({ ...group, count: group.items.length }))
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || kindOrder(a.kind, b.kind) || a.width - b.width || a.height - b.height || a.sill - b.sill)
  const counts = { door: 0, window: 0, opening: 0 }
  for (const row of rows) counts[row.type] += row.count
  return { rows, counts, rule: SCHEDULE_RULE }
}

// ---------------------------------------------------------------------------------------------
// ARE-12: the room schedule and the opening schedule, as tables.
//
// Both are data first. The tool's text, its CSV and the sheet's tables are written from the same
// rows, so no part reads another's printed text (lab AB-4, AU7-1). Rows are in one order whatever
// the order of the file: floors by level, then by id, rooms and openings by id (`compareIds`,
// QAR-5). Room numbers count up in that order; a room that states its own number (CNT-9) comes
// first on its floor, by that number, and is given it; every row carries its part's facts. The
// numbering is the library's (`roomNumbers`), so the IFC file gives every room the same number
// (HND-2).

/** A room as the room schedule lists it. */
export interface RoomScheduleRow {
  /** 1, 2, 3… across the floors, in the schedule's order. Grid's, not the plan's. */
  readonly number: number
  /** CNT-9: the number the plan states for the room, which the schedule gives in place of Grid's; null when it states none. */
  readonly roomNumber: string | null
  /**
   * ARE-15: the room's mark on the drawing: its number in the schedule of every floor (the stated
   * one, else Grid's), the same whichever floors are asked for.
   */
  readonly mark: string
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly floor: string
  readonly floorName: string
  /** Net, in m²; null when Grid could not draw the room, and the totals say so. */
  readonly area: number | null
  readonly state: NumberState
  /** In metres, by ARE-10's rule; null when the plan gives none. */
  readonly height: number | null
  /** CNT-9: the room's facts of the person's own, by name, as the plan gives them. */
  readonly properties: Facts
  /** CNT-4, only on a plan that lists flats: the id of the flat the room is in, or null. */
  readonly flat?: string | null
  /** CNT-57, only on a plan where a room states one: the firm's room type of the room, or null. */
  readonly roomType?: string | null
  /** CNT-57, only on a plan where a room states one: who the room is for (CNT-5), or null. */
  readonly tenure?: string | null
  /**
   * CNT-8, only on a room with zones: each zone, measured, by id. A zone is no row of
   * its own: its floor is in its room's area, so a column of areas adds up to the total.
   */
  readonly zones?: readonly RoomScheduleZone[]
  /**
   * CNT-27, only on a room the net counts in no total (a stair or lift room over the lowest of its
   * shaft, a void, outdoor space): why, as grid_areas counts it. The rows without it add up to the totals.
   */
  readonly notCounted?: RoomNotCounted
}

/** A zone of a room in the room schedule (CNT-8). */
export interface RoomScheduleZone {
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly area: number | null
  /** CNT-9: the zone's own facts, as the plan gives them. It has no number: its room has. */
  readonly properties: Facts
}

/** A total of the room schedule: one floor's, or all floors'. */
export interface RoomScheduleTotal {
  /** Null for the total of all floors. */
  readonly floor: string | null
  readonly floorName: string | null
  readonly rooms: number
  readonly area: number
  readonly state: AreaState
}

export interface RoomSchedule {
  readonly rows: readonly RoomScheduleRow[]
  /** One per floor, in the schedule's order; each names its floor. */
  readonly floors: readonly RoomScheduleTotal[]
  /** Every floor given. */
  readonly total: RoomScheduleTotal
  readonly rules: readonly string[]
}

/** One opening, listed once, with the rooms on its two sides. */
export interface OpeningScheduleRow {
  readonly number: number
  /**
   * ARE-15: its mark on the drawing, `D1`, `W1`, `O1`: its type's letter and its place among the
   * openings of its type in the schedule of every floor, the same whichever floors are asked for.
   */
  readonly mark: string
  /**
   * ARE-15: the door or window type it is (`openingTypeKey`); null for a doorless opening. CNT-15:
   * `door-type:<id>` (`namedTypeKey`) for one that takes a type the plan names.
   */
  readonly typeKey: string | null
  readonly phase: Phase
  readonly id: string
  readonly type: 'door' | 'window' | 'opening'
  readonly floor: string
  readonly floorName: string
  readonly width: number
  readonly height: number
  readonly sill: number
  /** CNT-14: its kind as the plan states it, or null (a door with none is one swinging leaf). */
  readonly kind: OpeningKind | null
  /** CNT-14: the part of it that opens, when the plan states one: width, and height (the opening's when unstated). */
  readonly opens: { readonly width: number; readonly height: number } | null
  /** CNT-14: a door's handing in rooms, `opens into "Hall", hinged on the left`, when the plan states it. */
  readonly handing: string | null
  /** MSG-11: the same handing as a sentence by key, for the sheet to say in its language; null with `handing`. */
  readonly handingSaid: Said | null
  /** A room's name, or what lies there when no room does (`outside`, `nothing drawn`, `a room left out`). */
  readonly between: readonly [string, string]
  /** CNT-9: the opening's facts of the person's own, by name, as the plan gives them. */
  readonly properties: Facts
}

export interface OpeningSchedule {
  readonly rows: readonly OpeningScheduleRow[]
  /** Each opening that stands after the work, counted once. */
  readonly counts: Readonly<Record<'door' | 'window' | 'opening', number>>
  readonly rule: string
}

export const ROOM_SCHEDULE_RULE =
  'Rooms are listed floor by floor from the lowest: on each floor, the rooms that state a number in the plan first, by that number and given it, then the others by id, numbered by Grid. Areas are net, as grid_areas measures them; heights are as grid_measure gives them.'

/** CNT-9: the number a room schedule row is shown by: the plan's own, else Grid's. */
export function shownNumber(row: Pick<RoomScheduleRow, 'number' | 'roomNumber'>): string {
  return row.roomNumber ?? String(row.number)
}

/** CNT-9: a row's facts in words, `fire rating "EI 30", head count 12`; empty when it carries none. */
export function factsText(properties: Facts): string {
  return Object.entries(properties).map(([name, value]) => `${JSON.stringify(name)} ${typeof value === 'string' ? JSON.stringify(value) : factText(value)}`).join(', ')
}

/** A row the schedule cannot write: it is named, never left out in silence. */
export class ScheduleRowError extends Error {
  constructor(schedule: string, row: number, what: string) {
    super(`The ${schedule} cannot be written: row ${row} ${what}.`)
    this.name = 'ScheduleRowError'
  }
}

/** Floors by level, then by id: the file's order decides nothing. */
function floorOrder(facts: PlanFacts, floors: readonly string[] | undefined): FloorFacts[] {
  return facts.floors
    .filter((floor) => floors === undefined || floors.includes(floor.id))
    .sort((a, b) => a.level - b.level || compareIds(a.id, b.id))
}

export function roomSchedule(survey: Survey, options: { floors?: readonly string[] } = {}): RoomSchedule {
  const order = floorOrder(survey.facts, options.floors)
  const areas = planAreas(survey, { floors: order.map((f) => f.id) })
  const numbered = roomNumbers(survey.plan, order.map((f) => f.id))
  // ARE-15: the marks are the numbers of the schedule of every floor, so a floor asked alone keeps them.
  const marks = new Map(roomNumbers(survey.plan).map((r) => [r.id, r.stated ?? String(r.number)] as const))
  // CNT-4: on a plan that lists flats, each row says which flat its room is in.
  const listsFlats = (survey.plan.flats ?? []).length > 0
  const flatOf = flatOfRoom(planFlats(survey.plan))
  // CNT-57: on a plan where a room states its room type or tenure, each row gives its own.
  const listsTypes = survey.plan.rooms.some((r) => r.roomType !== undefined)
  const listsTenures = survey.plan.rooms.some((r) => r.tenure !== undefined)
  const rows: RoomScheduleRow[] = []
  const floors: RoomScheduleTotal[] = []
  for (const floor of order) {
    const figures = areas.floors.find((f) => f.floor === floor.id)
    if (figures === undefined) continue
    const storey = planForFloor(survey.plan, floor.id)
    const places = figures.rooms.filter((room) => room.zoneOf === undefined)
    const byId = new Map(places.map((room) => [room.id, room] as const))
    // CNT-27: the floor's total counts the rooms the net counts.
    const counted = places.filter((room) => notCounted(room) === null)
    const own = new Map(storey.rooms.map((r) => [r.id, r] as const))
    // HND-2: the library's numbers, which number no zone (CNT-8), so the IFC gives the same.
    for (const { number, stated, id } of numbered.filter((n) => n.floor === floor.id)) {
      const room = byId.get(id)
      if (room === undefined) continue
      const why = notCounted(room)
      const zones = figures.rooms
        .filter((zone) => zone.zoneOf === room.id)
        .sort((a, z) => compareIds(a.id, z.id))
        .map((zone) => ({ id: zone.id, name: zone.name, use: zone.use, area: zone.net, properties: own.get(zone.id)?.properties ?? {} }))
      rows.push({
        number,
        roomNumber: stated,
        mark: marks.get(room.id) ?? stated ?? String(number),
        id: room.id,
        name: room.name,
        use: room.use,
        floor: floor.id,
        floorName: floor.name ?? floor.id,
        area: room.net,
        state: room.state,
        height: roomHeight(storey, room.id).value,
        properties: own.get(id)?.properties ?? {},
        ...(listsFlats ? { flat: flatOf.get(room.id) ?? null } : {}),
        ...(listsTypes ? { roomType: own.get(id)?.roomType ?? null } : {}),
        ...(listsTenures ? { tenure: own.get(id)?.tenure ?? null } : {}),
        ...(zones.length === 0 ? {} : { zones }),
        ...(why === null ? {} : { notCounted: { why, ...(room.countedWith === undefined ? {} : { with: room.countedWith }) } }),
      })
    }
    floors.push({ floor: floor.id, floorName: floor.name ?? floor.id, rooms: counted.length, area: figures.net, state: figures.states.net })
  }
  return {
    rows,
    floors,
    total: { floor: null, floorName: null, rooms: rows.filter((row) => row.notCounted === undefined).length, area: areas.net, state: areas.states.net },
    rules: [ROOM_SCHEDULE_RULE, AREA_RULES.net, HEIGHT_RULE],
  }
}

const TYPE_ORDER = { door: 0, opening: 1, window: 2 } as const

/** ARE-15: the letter an opening's mark starts with, by its type. Marks are codes, the same in every language. */
export const MARK_LETTERS = { door: 'D', window: 'W', opening: 'O' } as const

/**
 * WRT-23: the marks openings keep, by opening id: the one the opening states (its fact `mark`),
 * else its id when that is the letter of its type and a number (`W3`). A mark two openings claim
 * is the first's, in the schedule's order. `taken` holds them all.
 */
function claimedMarks(openings: readonly OpeningFacts[], stated: ReadonlyMap<string, Opening>, taken: Set<string>): Map<string, string> {
  const byId = new Map<string, string>()
  for (const opening of openings) {
    const said = stated.get(opening.id)?.properties?.['mark']
    const own = typeof said === 'string' && said.trim().length > 0 ? said.trim() : null
    const mark = own ?? (new RegExp(`^${MARK_LETTERS[opening.type]}[1-9][0-9]*$`).test(opening.id) ? opening.id : null)
    if (mark === null || taken.has(mark)) continue
    byId.set(opening.id, mark)
    taken.add(mark)
  }
  return byId
}

interface OpeningScheduleOptions {
  readonly floors?: readonly string[]
  /** The plan with both states, for schedules that list removals. */
  readonly stated?: FloorPlan
}

type UnnumberedOpening = Omit<OpeningScheduleRow, 'number'>

function openingRows(
  facts: PlanFacts,
  plan: FloorPlan,
  taken: Set<string>,
  include: (opening: OpeningFacts) => boolean,
): UnnumberedOpening[] {
  const stated = new Map(plan.openings.map((o) => [o.id, o] as const))
  const phases = phaseReading(plan)
  const floors = floorOrder(facts, undefined).map((floor) => ({
    floor,
    openings: floor.openings.filter(include).sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || compareIds(a.id, b.id)),
  }))
  const claimed = claimedMarks(floors.flatMap((f) => f.openings), stated, taken)
  const rows: UnnumberedOpening[] = []
  const seenOf = { door: 0, window: 0, opening: 0 }
  for (const { floor, openings } of floors) {
    const named = new Map(floor.rooms.map((room) => [room.id, roomCalled(room)] as const))
    const side = (s: OpeningFacts['sides'][number]): string => (typeof s === 'object' ? named.get(s.room) ?? s.room : s)
    for (const opening of openings) {
      const own = stated.get(opening.id)
      let mark = claimed.get(opening.id)
      if (mark === undefined) {
        do {
          seenOf[opening.type] += 1
          mark = `${MARK_LETTERS[opening.type]}${seenOf[opening.type]}`
        } while (taken.has(mark))
        taken.add(mark)
      }
      const kind = statedKind(opening.type, own?.kind)
      const opens = own?.opens === undefined || opening.type === 'opening' ? null : { width: partWidth(opening.width, own.opens), height: partHeight(opening.height, own.opens) }
      // CNT-15 (C24): a door or window that takes one of the plan's named types is of that type.
      const named = own === undefined ? null : openingTypeOf(plan, own)
      rows.push({
        phase: phases.opening(own ?? opening),
        mark,
        typeKey: opening.type === 'opening' ? null : named !== null ? namedTypeKey(opening.type, named, opening.width, opening.height) : openingTypeKey(opening.type, kind, opening.width, opening.height, opens),
        id: opening.id,
        type: opening.type,
        floor: floor.id,
        floorName: floor.name ?? floor.id,
        width: opening.width,
        height: opening.height,
        sill: opening.sill,
        kind,
        opens,
        ...handingOf(own === undefined ? null : handingSaid(own, opening.sides, side)),
        between: [side(opening.sides[0]), side(opening.sides[1])],
        properties: own?.properties ?? {},
      })
    }
  }
  return rows
}

export function openingSchedule(survey: Survey, options: OpeningScheduleOptions = {}): OpeningSchedule {
  // Assign after-work marks first, across all floors, so they agree with the drawing.
  const taken = new Set<string>()
  const plan = options.stated ?? survey.plan
  const all = openingRows(survey.facts, plan, taken, () => true)
  if (options.stated !== undefined) {
    const phases = phaseReading(plan)
    const removed = new Set(plan.openings.filter((o) => phases.opening(o) === 'demolished').map((o) => o.id))
    if (removed.size > 0) all.push(...openingRows(planFacts(plan, 'before'), plan, taken, (o) => removed.has(o.id)))
  }
  const counts = { door: 0, window: 0, opening: 0 }
  const rows: OpeningScheduleRow[] = []
  for (const row of all) {
    if (options.floors !== undefined && !options.floors.includes(row.floor)) continue
    if (row.phase !== 'demolished') counts[row.type] += 1
    rows.push({ number: rows.length + 1, ...row })
  }
  return { rows, counts, rule: SCHEDULE_RULE }
}

// ---------------------------------------------------------------------------------------------
// ARE-15: the door schedule and the window schedule by type, and the marks that tie the drawing
// to the schedules' rows.
//
// A type is the kind the plan states and the size of the opening, with the part that opens when
// the plan states one (`basis: 'kind-and-size'`). CNT-15 (C24): a type the plan names is a row of
// its own (`basis: 'named'`), keyed by its id, and the openings that name none stay grouped as here.

/** A size in a type's key, to the millimetre: `0.9`, `2.1`. */
const keySize = (value: number): string => String(Math.round(value * 1000) / 1000)

/**
 * ARE-15: a door or window type's key: its type, the kind the plan states and its size, as the
 * estimate and the IFC key them (`door:0.9x2.1`, `door:sliding:2.2x2.1`), and the part that
 * opens when the plan states one (`door:double:1.5x2.1:opens:0.9x2.1`).
 */
export function openingTypeKey(type: 'door' | 'window', kind: OpeningKind | null, width: number, height: number, opens: { readonly width: number; readonly height: number } | null): string {
  return `${type}:${kind === null ? '' : `${kind}:`}${keySize(width)}x${keySize(height)}${opens === null ? '' : `:opens:${keySize(opens.width)}x${keySize(opens.height)}`}`
}

/**
 * CNT-15: the key of a type the plan names: `door-type:<id>`, and the size after it for the doors
 * or windows of the type that state a size of their own, which are a type apart for a supplier.
 */
export function namedTypeKey(type: 'door' | 'window', named: DoorType | WindowType, width: number, height: number): string {
  const near = (a: number | undefined, b: number): boolean => a === undefined || Math.abs(a - b) <= tolerance('noLength')
  const own = near(named.width, width) && near(named.height, height)
  return `${type}-type:${named.id}${own ? '' : `:${keySize(width)}x${keySize(height)}`}`
}

/** One opening of a type, by its mark. */
export interface OpeningTypeItem {
  readonly mark: string
  readonly id: string
  readonly floor: string
  readonly floorName: string
  readonly sill: number
  readonly handing: string | null
  readonly between: readonly [string, string]
}

/** One door or window type, with the marks of every opening of it. */
export interface OpeningTypeRow {
  /** 1, 2, 3… in the schedule's order. */
  readonly number: number
  /** What makes the type: its kind and size, or (CNT-15) a type the plan names. */
  readonly basis: 'kind-and-size' | 'named'
  readonly key: string
  /** CNT-53: the phase when the schedule lists types by phase. */
  readonly phase?: Phase
  /** CNT-15: the named type's id, name, material (null when it states none) and whether it is glazed; all null for a type of kind and size. */
  readonly typeId: string | null
  readonly name: string | null
  readonly material: string | null
  readonly glazed: boolean | null
  readonly type: 'door' | 'window'
  readonly kind: OpeningKind | null
  readonly width: number
  readonly height: number
  readonly opens: { readonly width: number; readonly height: number } | null
  /** The sills of its openings, each once, lowest first. */
  readonly sills: readonly number[]
  readonly count: number
  /** Its openings' marks, in the schedule's order. */
  readonly marks: readonly string[]
  readonly items: readonly OpeningTypeItem[]
}

export interface OpeningTypeSchedule {
  readonly of: 'door' | 'window'
  readonly rows: readonly OpeningTypeRow[]
  /** The openings that stand after the work, each counted once. */
  readonly count: number
  readonly rule: string
}

export const OPENING_TYPE_RULE =
  "Doors and windows of a type the plan names are that type, first, in the order the plan lists its types; one that states a size of its own is a type apart. The others are grouped into types by the kind the plan states and the size of the opening in the wall, width by height, and by the part that opens when the plan states one. Each type lists the marks of its openings, as the drawing shows them (grid_view marks schedule) and the opening schedule numbers them (of=openings)."

/** CNT-15: the plan's named types first, in the order it lists them, then the types of kind and size. */
function namedFirst(a: string | null, b: string | null, order: ReadonlyMap<string, number>): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  return (order.get(a) ?? 0) - (order.get(b) ?? 0)
}

/** ARE-15: the doors, or the windows, grouped by type, each type with its openings' marks. */
export function openingTypeSchedule(survey: Survey, of: 'door' | 'window', options: OpeningScheduleOptions = {}): OpeningTypeSchedule {
  const groups = new Map<string, { rows: OpeningScheduleRow[] }>()
  const listed = openingSchedule(survey, options).rows.filter((row) => row.type === of)
  for (const row of listed) {
    const key = JSON.stringify([row.typeKey, options.stated === undefined ? null : row.phase])
    const group = groups.get(key) ?? { rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  const listedTypes = of === 'door' ? survey.plan.types?.doors ?? [] : survey.plan.types?.windows ?? []
  const typeOrder = new Map(listedTypes.map((type, i) => [type.id, i] as const))
  const plan = options.stated ?? survey.plan
  const stated = new Map(plan.openings.map((o) => [o.id, o] as const))
  const rows = [...groups.values()]
    .map(({ rows: of_ }) => {
      const first = of_[0]!
      const key = first.typeKey!
      const own = stated.get(first.id)
      const named = own === undefined || !key.startsWith(`${of}-type:`) ? null : openingTypeOf(plan, own)
      return {
        basis: named === null ? ('kind-and-size' as const) : ('named' as const),
        key,
        ...(options.stated === undefined ? {} : { phase: first.phase }),
        typeId: named?.id ?? null,
        name: named?.name ?? null,
        material: named === null ? null : named.material ?? null,
        glazed: named === null ? null : named.glazed === true,
        type: of,
        kind: first.kind,
        width: first.width,
        height: first.height,
        opens: first.opens,
        sills: [...new Set(of_.map((r) => r.sill))].sort((a, b) => a - b),
        count: of_.length,
        marks: of_.map((r) => r.mark),
        items: of_.map((r) => ({ mark: r.mark, id: r.id, floor: r.floor, floorName: r.floorName, sill: r.sill, handing: r.handing, between: r.between })),
      }
    })
    .sort((a, b) =>
      Number(a.phase === 'demolished') - Number(b.phase === 'demolished')
      || namedFirst(a.typeId, b.typeId, typeOrder)
      || (a.typeId !== null && a.typeId === b.typeId ? a.key.length - b.key.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : 0)
      || kindOrder(a.kind, b.kind) || a.width - b.width || a.height - b.height
      || (a.opens?.width ?? a.width) - (b.opens?.width ?? b.width)
      || (a.opens?.height ?? a.height) - (b.opens?.height ?? b.height)
      || compareIds(a.phase ?? '', b.phase ?? ''),
    )
    .map((row, i): OpeningTypeRow => ({ number: i + 1, ...row }))
  return { of, rows, count: listed.filter((row) => row.phase !== 'demolished').length, rule: OPENING_TYPE_RULE }
}

export const REMOVAL_SECTION = english(said('schedule.openings.removals'))

const removalSection = (phase: Phase | undefined): string | null => phase === 'demolished' ? REMOVAL_SECTION : null

/** ARE-15: the door or window schedule by type as CSV: one row per type, with its marks. */
export function openingTypeScheduleCsv(schedule: OpeningTypeSchedule, display?: Pick<Display, 'length'>): string {
  const name = `${schedule.of} schedule`
  const windows = schedule.of === 'window'
  // CNT-15: a schedule with a type the plan names has its name and material, after the key.
  const named = schedule.rows.some((r) => r.basis === 'named')
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    return [
      numberCell(name, n, 'number', r.number, false), textCell(name, n, 'type', r.key), ...(named ? [r.name, r.material] : []), r.kind,
      ...csvLengths(display, [numberCell(name, n, 'width', r.width, false), numberCell(name, n, 'height', r.height, false), r.opens?.width ?? null, r.opens?.height ?? null]),
      ...(windows ? [r.sills.length === 1 ? csvLengths(display, [r.sills[0]!])[0]! : csvLengths(display, r.sills).join('; ')] : []),
      numberCell(name, n, 'count', r.count, false), r.marks.join('; '), r.phase ?? null, removalSection(r.phase),
    ]
  })
  const unit = csvLengthUnit(display)
  return csv(['number', 'type', ...(named ? ['name', 'material'] : []), 'kind', `width ${unit}`, `height ${unit}`, `opens width ${unit}`, `opens height ${unit}`, ...(windows ? [`sill ${unit}`] : []), 'count', 'marks', 'phase', 'section'], rows)
}

/** ARE-15: the marks asked for, with the schedules' marks of the plan's rooms and openings. */
export function withScheduleMarks(marks: DrawingMarksAsked, plan: FloorPlan): DrawingMarksAsked {
  return { ...marks, schedule: scheduleMarkLabels(surveyPlan(plan)) }
}

/**
 * ARE-15: the marks the drawing carries (`grid_view marks schedule`), by part id: each room's from
 * the room schedule and each opening's from the opening schedule, of every floor. The drawing
 * draws one for each part it draws that has one, so a mark and its row are one to one.
 */
export function scheduleMarkLabels(survey: Survey): ScheduleMarkLabels {
  return {
    rooms: new Map(roomSchedule(survey).rows.map((row) => [row.id, row.mark] as const)),
    openings: new Map(openingSchedule(survey).rows.map((row) => [row.id, row.mark] as const)),
  }
}

type Cell = string | number | null

/** A number for a spreadsheet: finite, and never a negative zero (AU7-1). */
function numberCell(schedule: string, row: number, what: string, value: unknown, nullable: boolean): number | null {
  if (value === null && nullable) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ScheduleRowError(schedule, row, `has no number for its ${what}`)
  return value === 0 ? 0 : value
}

function textCell(schedule: string, row: number, what: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new ScheduleRowError(schedule, row, `has no ${what}`)
  return value
}

/** CNT-9: every fact name the rows carry, in the order first met: one column each. */
function factColumns(rows: readonly { readonly properties: Facts }[]): string[] {
  const names = new Set<string>()
  for (const row of rows) for (const name of Object.keys(row.properties)) names.add(name)
  return [...names]
}

/** CNT-9: a row's facts under the fact columns; empty where it carries none. */
function factCells(properties: Facts, columns: readonly string[]): Cell[] {
  return columns.map((column) => {
    const value = properties[column]
    return value === undefined ? null : typeof value === 'number' ? value : factText(value)
  })
}

/** The room schedule as CSV: one row per room, then each floor's total and the total of all floors. */
export function roomScheduleCsv(schedule: RoomSchedule, display?: Pick<Display, 'length'>): string {
  const name = 'room schedule'
  const columns = factColumns(schedule.rows)
  // CNT-4: a flat column only on a plan that lists flats, so every other schedule is as it was.
  const flats = schedule.rows.some((r) => r.flat !== undefined)
  // CNT-57: room type and tenure columns only on a plan where a room states one.
  const types = schedule.rows.some((r) => r.roomType !== undefined)
  const tenures = schedule.rows.some((r) => r.tenure !== undefined)
  // CNT-27: a column for the rows in no total only when there is one, so every other schedule is as it was.
  const left = schedule.rows.some((r) => r.notCounted !== undefined)
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    const area = numberCell(name, n, 'area', r.area, r.state === 'not-looked-at')
    return [
      r.roomNumber ?? numberCell(name, n, 'number', r.number, false), textCell(name, n, 'room id', r.id), textCell(name, n, 'name', r.name), r.use,
      area, area === null ? null : sqFt(area), csvLengths(display, [numberCell(name, n, 'height', r.height, true)])[0]!, textCell(name, n, 'floor', r.floorName), r.state,
      ...(flats ? [r.flat ?? null] : []),
      ...(types ? [r.roomType ?? null] : []),
      ...(tenures ? [r.tenure ?? null] : []),
      ...(left ? [r.notCounted?.why ?? null] : []),
      ...factCells(r.properties, columns),
    ]
  })
  const totals = [...schedule.floors, schedule.total].map((t): Cell[] => {
    const area = numberCell(name, rows.length + 1, 'total area', t.area, false)!
    return [null, '', t.floor === null ? 'Total, all floors' : `Total, ${t.floorName}`, null, area, sqFt(area), null, t.floorName ?? 'all', t.state.state, ...(flats ? [null] : []), ...(types ? [null] : []), ...(tenures ? [null] : []), ...(left ? [null] : []), ...columns.map(() => null)]
  })
  return csv(['number', 'room id', 'name', 'use', 'area m2', 'area sq ft', `height ${csvLengthUnit(display)}`, 'floor', 'state', ...(flats ? ['flat'] : []), ...(types ? ['room type'] : []), ...(tenures ? ['tenure'] : []), ...(left ? ['not in totals'] : []), ...columns], [...rows, ...totals])
}

/** The opening schedule as CSV: one row per opening, each listed once. */
export function openingScheduleCsv(schedule: OpeningSchedule, display?: Pick<Display, 'length'>): string {
  const name = 'opening schedule'
  const columns = factColumns(schedule.rows)
  // CNT-14: the kind, the part that opens and the handing, each only when some opening states it,
  // so a schedule of a plan that states none is as before.
  const kinds = schedule.rows.some((r) => r.kind !== null)
  const parts = schedule.rows.some((r) => r.opens !== null)
  const handings = schedule.rows.some((r) => r.handing !== null)
  const unit = csvLengthUnit(display)
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    return [
      numberCell(name, n, 'number', r.number, false), textCell(name, n, 'mark', r.mark), textCell(name, n, 'id', r.id), textCell(name, n, 'type', r.type),
      ...(kinds ? [r.kind] : []),
      ...csvLengths(display, [numberCell(name, n, 'width', r.width, false), numberCell(name, n, 'height', r.height, false), numberCell(name, n, 'sill', r.sill, false)]),
      ...(parts ? csvLengths(display, [r.opens?.width ?? null, r.opens?.height ?? null]) : []),
      ...(handings ? [r.handing] : []),
      textCell(name, n, 'floor', r.floorName), textCell(name, n, 'room on one side', r.between[0]), textCell(name, n, 'room on the other side', r.between[1]), 1,
      r.phase, removalSection(r.phase), ...factCells(r.properties, columns),
    ]
  })
  return csv(
    ['number', 'mark', 'id', 'type', ...(kinds ? ['kind'] : []), `width ${unit}`, `height ${unit}`, `sill ${unit}`, ...(parts ? [`opens width ${unit}`, `opens height ${unit}`] : []), ...(handings ? ['handing'] : []), 'floor', 'side 1', 'side 2', 'count', 'phase', 'section', ...columns],
    rows,
  )
}

/**
 * CNT-14: a door's handing in rooms, as the plan states it: the room it opens into and the side it
 * is hinged on as seen from there (`sideSeenFrom`); null when it states no swing. `sides` are what
 * lies on the face the wall's normal points at, then the other.
 */
function handingSaid(opening: Opening, sides: OpeningFacts['sides'], name: (side: OpeningFacts['sides'][number]) => string): Said | null {
  if (opening.type !== 'door' || opening.swing === undefined) return null
  const into = opening.swing === 'left' ? sides[0] : sides[1]
  // A room by its name; past a face with no room, what lies there.
  const words = typeof into === 'object' ? said('sheet.handing.into', { room: name(into) }) : into === 'outside' ? said('sheet.handing.outside') : said('sheet.handing.toward', { what: name(into) })
  return opening.hinge === undefined ? words : said('sheet.handing.hinged', { opens: words, side: said(`sheet.handing.side.${sideSeenFrom(opening.swing, opening.hinge)}`) })
}

/** A row's handing, in English and by key. */
const handingOf = (sentence: Said | null): { readonly handing: string | null; readonly handingSaid: Said | null } => ({ handing: sentence === null ? null : english(sentence), handingSaid: sentence })

// ---------------------------------------------------------------------------------------------
// CNT-4: the flat schedule and the mix by type, from the plan's flats list (lab EL-1, AR-7).

/** A flat as the flat schedule lists it. */
export interface FlatScheduleRow {
  /** 1, 2, 3… in id order, whatever the order of the file. */
  readonly number: number
  readonly id: string
  readonly name: string
  /** The type it states, by id, and the type's name (its id when the plan does not state it); null with none. */
  readonly type: string | null
  readonly typeName: string | null
  readonly mirrored: boolean
  /** The floors its rooms are on, by name, in floor order: two or more for a duplex. */
  readonly floors: readonly string[]
  readonly rooms: number
  /** Its rooms used as a bedroom. */
  readonly bedrooms: number
  /** Net, in m², as grid_areas measures a flat. */
  readonly area: number
  readonly state: NumberState
}

/** One type in the mix: how many flats of it, how many mirrored, and their area. */
export interface FlatMixRow {
  /** Null for the flats that state no type. */
  readonly type: string | null
  readonly name: string
  readonly flats: number
  readonly mirrored: number
  /** ARE-15: the bedrooms of each flat of the type, when they all have as many; null when they differ or none is placed. */
  readonly bedrooms: number | null
  /** The share of all flats, 0 to 1. */
  readonly share: number
  readonly area: number
  /** The area of one flat of the type, on average; null with none placed. */
  readonly each: number | null
}

export interface FlatSchedule {
  readonly rows: readonly FlatScheduleRow[]
  /** By type: the plan's flat types in their order, then any type it names but does not state, then the flats with none. */
  readonly mix: readonly FlatMixRow[]
  readonly total: { readonly flats: number; readonly area: number; readonly state: AreaState }
  /** The net area of the rooms in no flat: the common parts. */
  readonly notInFlats: number
  readonly rules: readonly string[]
}

export const FLAT_SCHEDULE_RULE =
  "Flats are the plan's own list of which rooms make each flat, never read from the rooms' names, numbered in id order. The mix counts the flats of each type the plan states, and the mirrored ones among them."

export function flatSchedule(survey: Survey, options: { floors?: readonly string[] } = {}): FlatSchedule {
  const order = floorOrder(survey.facts, options.floors)
  const areas = planAreas(survey, { floors: order.map((f) => f.id) })
  const names = new Map(order.map((f) => [f.id, f.name] as const))
  const uses = new Map(survey.plan.rooms.map((room) => [room.id, room.use] as const))
  const rows: FlatScheduleRow[] = [...areas.flats]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((flat, i) => ({
      number: i + 1,
      id: flat.id,
      name: flat.name,
      type: flat.type,
      typeName: flat.type === null ? null : flat.typeName ?? flat.type,
      mirrored: flat.mirrored,
      floors: flat.floors.map((id) => names.get(id) ?? id),
      rooms: flat.rooms.length,
      bedrooms: flat.rooms.filter((id) => uses.get(id) === 'bedroom').length,
      area: flat.net,
      state: flat.state.state,
    }))
  const stated = planFlatTypes(survey.plan)
  const named = [...new Set(rows.map((row) => row.type).filter((type): type is string => type !== null && !stated.some((t) => t.id === type)))]
  const kinds: { type: string | null; name: string }[] = [
    ...stated.map((t) => ({ type: t.id, name: t.name })),
    ...named.map((type) => ({ type, name: type })),
    ...(rows.some((row) => row.type === null) ? [{ type: null, name: 'no type' }] : []),
  ]
  const mix = kinds.map(({ type, name }): FlatMixRow => {
    const of = rows.filter((row) => row.type === type)
    const area = of.reduce((sum, row) => sum + row.area, 0)
    const beds = [...new Set(of.map((row) => row.bedrooms))]
    return { type, name, flats: of.length, mirrored: of.filter((row) => row.mirrored).length, bedrooms: beds.length === 1 ? beds[0]! : null, share: rows.length === 0 ? 0 : of.length / rows.length, area, each: of.length === 0 ? null : area / of.length }
  })
  const state = joinStates(areas.flats.map((flat) => flat.state))
  return {
    rows,
    mix,
    total: { flats: rows.length, area: rows.reduce((sum, row) => sum + row.area, 0), state },
    notInFlats: areas.notInFlats ?? areas.net,
    rules: [FLAT_SCHEDULE_RULE, FLAT_RULE],
  }
}

/** The flat schedule as CSV: one row per flat, the totals, then the mix, one row per type. */
export function flatScheduleCsv(schedule: FlatSchedule): string {
  const name = 'flat schedule'
  const rows: Cell[][] = schedule.rows.map((r, i) => {
    const n = i + 1
    return [
      'flat', numberCell(name, n, 'number', r.number, false), textCell(name, n, 'flat id', r.id), textCell(name, n, 'name', r.name), r.typeName,
      r.mirrored ? 'yes' : 'no', r.floors.join('; '), r.rooms, r.bedrooms, null, null, numberCell(name, n, 'area', r.area, false), sqFt(r.area), r.state,
    ]
  })
  rows.push(['total', null, '', 'All flats', null, null, null, null, null, schedule.total.flats, null, schedule.total.area, sqFt(schedule.total.area), schedule.total.state.state])
  rows.push(['total', null, '', 'In no flat', null, null, null, null, null, null, null, schedule.notInFlats, sqFt(schedule.notInFlats), null])
  for (const m of schedule.mix) rows.push(['mix', null, m.type ?? '', m.name, m.name, null, null, null, m.bedrooms, m.flats, m.mirrored, m.area, sqFt(m.area), null])
  return csv(['row', 'number', 'id', 'name', 'type', 'mirrored', 'floors', 'rooms', 'bedrooms', 'flats', 'mirrored flats', 'area m2', 'area sq ft', 'state'], rows)
}
