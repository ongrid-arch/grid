/**
 * ARE-68: the lettable area, the core and the efficiency of each floor, and the area per person.
 *
 * Read from the rooms `planAreas` already measures, by the one rule of which rooms a total counts
 * (CNT-27): no zone, void, outdoor space or room named outside, and a stair or lift shaft once.
 *
 * - Lettable area is the net of the rooms a tenant or a buyer has the use of. A room is lettable by
 *   the tenure it states (private, shared or commercial is, common is not), else by its use (stair,
 *   lift, plant, corridor and parking are not). The person may choose instead: the uses, or the
 *   tenures, that are lettable, a room being lettable when it is of either.
 * - The core is the rooms used as stair, lift or plant on each floor plate, a shaft room counted
 *   with the one below included: its share of a plate is what stands on that plate, though the net
 *   counts the shaft's floor once.
 * - Efficiency is lettable over gross internal, per floor, per floor type (the floors whose largest
 *   lettable use is the same) and in all; null where the floor has no gross internal area.
 * - The area per person: for each figure the person gives for who the building is for (pupils,
 *   covers, keys, beds, capacity), the gross internal, gross external, net and lettable area per
 *   one; a figure for named rooms is measured on their net. With no figure, the covers and desks
 *   counted from the furniture (ARE-67) give theirs.
 *
 * Pure: the area figures in, square metres and shares out. The words are in the message files.
 */
import { ENGLISH_SPEAKER, type Speaker } from '@ongrid/floorplan/messages'
import type { RoomTenure } from '@ongrid/floorplan/types/floorplan'
import { notCounted, type PlanAreas, type RoomArea } from './areas'
import type { SeatingTotal } from './seats'
import { NOT_LOOKED_AT, joinStates, sumState, type AreaState } from './state'

/** The uses a room of the core has: what stands on every plate to serve the building. */
export const CORE_USES: readonly string[] = ['stair', 'lift', 'plant']

/** The uses a room with no tenure is not lettable by: the core, the corridors and parking. */
export const NOT_LETTABLE_USES: readonly string[] = ['stair', 'lift', 'plant', 'corridor', 'parking']

/** The tenures that are lettable when the plan states them: one household's, a few tenants', a business's. */
const LETTABLE_TENURES: ReadonlySet<string> = new Set<RoomTenure>(['private', 'shared', 'commercial'])

/** The rooms the person counts as lettable: of these uses, or of these tenures. */
export interface LettableChoice {
  readonly uses?: readonly string[]
  readonly tenures?: readonly RoomTenure[]
}

/** Why a room is lettable or not: its stated tenure, its use, or the person's choice. */
export type LettableBy = 'tenure' | 'use' | 'chosen'

const chosen = (choice: LettableChoice | undefined): boolean => (choice?.uses?.length ?? 0) + (choice?.tenures?.length ?? 0) > 0

/** Whether a room the totals count is lettable, and by what. */
export function isLettable(room: RoomArea, choice?: LettableChoice): { readonly lettable: boolean; readonly by: LettableBy } {
  if (chosen(choice)) {
    const byUse = room.use !== null && (choice!.uses ?? []).includes(room.use)
    const byTenure = room.tenure !== undefined && (choice!.tenures ?? []).includes(room.tenure as RoomTenure)
    return { lettable: byUse || byTenure, by: 'chosen' }
  }
  if (room.tenure !== undefined) return { lettable: LETTABLE_TENURES.has(room.tenure), by: 'tenure' }
  return { lettable: !NOT_LETTABLE_USES.includes(room.use ?? ''), by: 'use' }
}

/** A room of the lettable area or the core, by floor and id. */
export interface LettableRoom {
  readonly floor: string
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly area: number | null
}

export interface FloorLettable {
  readonly floor: string
  readonly lettable: number
  readonly core: number
  readonly grossInternal: number | null
  /** Lettable over gross internal, 0 to 1; null without a gross internal area. */
  readonly efficiency: number | null
  /** The core over gross internal, 0 to 1; null without a gross internal area. */
  readonly coreShare: number | null
  /** The floor's largest lettable use, its floor type; null when nothing on it is lettable. */
  readonly floorType: string | null
  readonly lettableByUse: Readonly<Record<string, number>>
  /** The core's rooms on this plate. */
  readonly coreRooms: readonly LettableRoom[]
  readonly states: { readonly lettable: AreaState; readonly core: AreaState }
}

export interface FloorTypeLettable {
  readonly floorType: string
  readonly floors: readonly string[]
  readonly lettable: number
  readonly grossInternal: number | null
  readonly efficiency: number | null
}

export interface LettableFigures {
  /** How a room was found lettable: by its tenure or use (the plan), or by the uses and tenures chosen. */
  readonly chosen: LettableChoice | null
  readonly lettable: number
  readonly core: number
  readonly grossInternal: number | null
  readonly efficiency: number | null
  readonly coreShare: number | null
  readonly floors: readonly FloorLettable[]
  /** The floors grouped by their floor type, largest lettable area first; floors with nothing lettable left out. */
  readonly floorTypes: readonly FloorTypeLettable[]
  readonly lettableByUse: Readonly<Record<string, number>>
  /** The rooms the net counts that are not lettable, by use ("not said" for none), and their floor. */
  readonly notLettable: Readonly<Record<string, number>>
  readonly states: { readonly lettable: AreaState; readonly core: AreaState; readonly efficiency: AreaState }
  /** What each figure measures, in Grid's own words. */
  readonly rules: { readonly lettable: string; readonly core: string; readonly efficiency: string }
}

const NOT_SAID = 'not said'
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
const share = (part: number, whole: number | null): number | null => (whole === null || !(whole > 0) ? null : part / whole)

function byUse(rooms: readonly RoomArea[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const room of rooms) out[room.use ?? NOT_SAID] = (out[room.use ?? NOT_SAID] ?? 0) + (room.net ?? 0)
  return out
}

const roomOf = (room: RoomArea): LettableRoom => ({ floor: room.floor, id: room.id, name: room.name, use: room.use, area: room.net })

/** The rules, in Grid's own words, said with the figures. */
export function lettableRules(choice: LettableChoice | null, s: Speaker = ENGLISH_SPEAKER): LettableFigures['rules'] {
  const lettable = choice === null
    ? s.say('lettable.rule.plan', { uses: NOT_LETTABLE_USES.join(', ') })
    : s.say('lettable.rule.chosen', { chosen: [...(choice.uses ?? []).map((use) => `use ${use}`), ...(choice.tenures ?? []).map((tenure) => `tenure ${tenure}`)].join(', ') })
  return {
    lettable,
    core: s.say('lettable.rule.core', { uses: CORE_USES.join(', ') }),
    efficiency: s.say('lettable.rule.efficiency'),
  }
}

/** The lettable area, the core and the efficiency of each floor, of each floor type and in all. */
export function lettableFigures(areas: Pick<PlanAreas, 'floors'>, choice?: LettableChoice): LettableFigures {
  const asked = chosen(choice) ? { ...(choice!.uses?.length ? { uses: [...choice!.uses] } : {}), ...(choice!.tenures?.length ? { tenures: [...choice!.tenures] } : {}) } : null
  const notLettable: Record<string, number> = {}
  const floors: FloorLettable[] = areas.floors.map((f) => {
    const counted = f.rooms.filter((room) => notCounted(room) === null)
    const lettableRooms = counted.filter((room) => isLettable(room, choice).lettable)
    for (const room of counted) {
      if (lettableRooms.includes(room)) continue
      notLettable[room.use ?? NOT_SAID] = (notLettable[room.use ?? NOT_SAID] ?? 0) + (room.net ?? 0)
    }
    // The core on this plate: a shaft room over the one below is on it too, though counted below.
    const coreRooms = f.rooms.filter((room) => CORE_USES.includes(room.use ?? '') && (notCounted(room) === null || notCounted(room) === 'shaft'))
    const lettable = sum(lettableRooms.map((room) => room.net ?? 0))
    const core = sum(coreRooms.map((room) => room.net ?? 0))
    const uses = byUse(lettableRooms)
    const top = Object.entries(uses).filter(([, area]) => area > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    return {
      floor: f.floor,
      lettable,
      core,
      grossInternal: f.grossInternal,
      efficiency: share(lettable, f.grossInternal),
      coreShare: share(core, f.grossInternal),
      floorType: top === undefined ? null : top[0],
      lettableByUse: uses,
      coreRooms: coreRooms.map(roomOf),
      states: { lettable: sumState(lettableRooms), core: sumState(coreRooms) },
    }
  })
  const types = new Map<string, FloorLettable[]>()
  for (const f of floors) if (f.floorType !== null) types.set(f.floorType, [...(types.get(f.floorType) ?? []), f])
  const floorTypes = [...types.entries()].map(([floorType, of]) => {
    const lettable = sum(of.map((f) => f.lettable))
    const grossInternal = of.some((f) => f.grossInternal === null) ? null : sum(of.map((f) => f.grossInternal!))
    return { floorType, floors: of.map((f) => f.floor), lettable, grossInternal, efficiency: share(lettable, grossInternal) }
  }).sort((a, b) => b.lettable - a.lettable || a.floorType.localeCompare(b.floorType))
  const lettableByUse: Record<string, number> = {}
  for (const f of floors) for (const [use, area] of Object.entries(f.lettableByUse)) lettableByUse[use] = (lettableByUse[use] ?? 0) + area
  const lettable = sum(floors.map((f) => f.lettable))
  const core = sum(floors.map((f) => f.core))
  const grossInternal = floors.length === 0 || floors.some((f) => f.grossInternal === null) ? null : sum(floors.map((f) => f.grossInternal!))
  const lettableState = joinStates(floors.map((f) => f.states.lettable))
  return {
    chosen: asked,
    lettable,
    core,
    grossInternal,
    efficiency: share(lettable, grossInternal),
    coreShare: share(core, grossInternal),
    floors,
    floorTypes,
    lettableByUse,
    notLettable,
    states: {
      lettable: lettableState,
      core: joinStates(floors.map((f) => f.states.core)),
      efficiency: grossInternal === null ? NOT_LOOKED_AT : lettableState,
    },
    rules: lettableRules(asked),
  }
}

// ---------------------------------------------------------------------------------------------
// The area per person

/** The figures for who a building or a room is for. */
export const PEOPLE_KINDS = ['pupils', 'covers', 'keys', 'beds', 'capacity', 'desks'] as const
export type PeopleKind = (typeof PEOPLE_KINDS)[number]

/** One of each, in the words a ratio is said in. */
export const PERSON_WORD: Readonly<Record<PeopleKind, string>> = { pupils: 'pupil', covers: 'cover', keys: 'key', beds: 'bed', capacity: 'person', desks: 'desk' }

/** A figure for who the building, or some of its rooms, is for. */
export interface PeopleFigure {
  readonly count: number
  /** The rooms it is for, by id or name; the whole building when empty. */
  readonly rooms?: readonly string[]
}

export type PeopleFigures = Readonly<Partial<Record<PeopleKind, PeopleFigure>>>

/** Where a figure came from: the call, the brief, or the furniture as counted. */
export type PeopleFrom = 'asked' | 'brief' | 'counted'

export interface PeopleRatio {
  readonly kind: PeopleKind
  readonly count: number
  readonly from: PeopleFrom
  /** The rooms it is for, by id; empty for the whole building. */
  readonly rooms: readonly string[]
  /** The area each is per one of: null where not known, or not measured for a figure of named rooms. */
  readonly per: {
    readonly grossInternal: number | null
    readonly grossExternal: number | null
    readonly net: number | null
    readonly lettable: number | null
  }
}

/**
 * The area per one of each figure. `given` holds the person's (from the call first, else the
 * brief); `counted` is the furniture's count, used for covers and desks where no figure is given.
 */
export function peopleRatios(
  areas: Pick<PlanAreas, 'floors' | 'net' | 'grossInternal' | 'grossExternal'>,
  lettable: Pick<LettableFigures, 'lettable'>,
  given: { readonly asked?: PeopleFigures; readonly brief?: PeopleFigures },
  counted?: SeatingTotal,
): PeopleRatio[] {
  const out: PeopleRatio[] = []
  for (const kind of PEOPLE_KINDS) {
    const figure = given.asked?.[kind] ?? given.brief?.[kind]
    const from: PeopleFrom = given.asked?.[kind] !== undefined ? 'asked' : 'brief'
    if (figure !== undefined && figure.count > 0) {
      const rooms = figure.rooms ?? []
      if (rooms.length === 0) {
        const per = (area: number | null): number | null => (area === null ? null : area / figure.count)
        out.push({ kind, count: figure.count, from, rooms: [], per: { grossInternal: per(areas.grossInternal), grossExternal: per(areas.grossExternal), net: per(areas.net), lettable: per(lettable.lettable) } })
      } else {
        // A zone named is measured on its own unless its room is named too, which holds it.
        const ids = new Set(rooms)
        const named = (room: RoomArea): boolean => ids.has(room.id) || ids.has(room.name)
        const byKey = new Map(areas.floors.flatMap((f) => f.rooms.map((room) => [`${f.floor}\u0000${room.id}`, room] as const)))
        const held = (room: RoomArea): boolean => {
          if (!named(room)) return false
          if (notCounted(room) === null) return true
          const of = room.zoneOf === undefined ? undefined : byKey.get(`${room.floor}\u0000${room.zoneOf}`)
          return notCounted(room) === 'zone' && (of === undefined || !named(of))
        }
        const net = sum(areas.floors.flatMap((f) => f.rooms.filter(held).map((room) => room.net ?? 0)))
        out.push({ kind, count: figure.count, from, rooms: [...rooms], per: { grossInternal: null, grossExternal: null, net: net / figure.count, lettable: null } })
      }
      continue
    }
    const fromFurniture = counted === undefined ? 0 : kind === 'covers' ? counted.covers : kind === 'desks' ? counted.desks : 0
    if (fromFurniture > 0) {
      const per = (area: number | null): number | null => (area === null ? null : area / fromFurniture)
      out.push({ kind, count: fromFurniture, from: 'counted', rooms: [], per: { grossInternal: per(areas.grossInternal), grossExternal: per(areas.grossExternal), net: per(areas.net), lettable: per(lettable.lettable) } })
    }
  }
  return out
}

/** The most people a figure may give. */
export const PEOPLE_MAX = 1_000_000

/**
 * A figure for who the building is for, as the call or the brief gives it: a whole number, or an
 * object with `count` and the `rooms` it is for. The problem, in one line naming the place, when
 * it is not one.
 */
export function readPeople(value: unknown, where: string): PeopleFigures | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${where} takes an object, each figure by its name: ${PEOPLE_KINDS.join(', ')}`
  const out: Partial<Record<PeopleKind, PeopleFigure>> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!(PEOPLE_KINDS as readonly string[]).includes(key)) return `${where} names a figure Grid does not know; the figures it knows are ${PEOPLE_KINDS.join(', ')}`
    const kind = key as PeopleKind
    const fields = typeof entry === 'number' ? { count: entry } : entry
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return `${where}.${kind} takes a whole number, or an object with count and rooms`
    const extra = Object.keys(fields).filter((field) => field !== 'count' && field !== 'rooms')
    if (extra.length > 0) return `${where}.${kind} takes count and rooms only`
    const count = (fields as Record<string, unknown>)['count']
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > PEOPLE_MAX) return `${where}.${kind} must be a whole number from 1 to ${PEOPLE_MAX.toLocaleString('en-US')}`
    const rooms = (fields as Record<string, unknown>)['rooms']
    if (rooms !== undefined && (!Array.isArray(rooms) || rooms.length > 500 || rooms.some((id) => typeof id !== 'string' || id.trim() === '' || id.length > 200))) return `${where}.${kind}.rooms takes a list of room ids`
    out[kind] = { count, ...(rooms === undefined || (rooms as string[]).length === 0 ? {} : { rooms: [...(rooms as string[])] }) }
  }
  return out
}
