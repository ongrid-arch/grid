/**
 * Facts of the person's own set on the parts of a plan, and a room's number (WRT-74): "lot 7 is
 * sold", "every room on the first floor is Sales", "the meeting room is 2.03". CNT-9 made the
 * format hold them and the query tools read them; this is what writes them.
 *
 * The parts are named by id (`parts`, of any kind), or picked as `grid_find` picks them (a kind, a
 * floor, a room, `where` conditions), or both, each narrowing the other. `set` gives facts by name
 * and value (text, a number, yes or no), `unset` takes facts out, `number` gives one room its
 * number or, as `none`, leaves it to Grid's count. A name the plan already carries under another
 * spelling (`Department` for `department`) keeps the plan's spelling, so a fact has one name. A
 * name that is one of Grid's own fields (a room's name, use or number, an area) is refused,
 * with what sets it.
 *
 * A number is one room's: it is refused for several rooms, for a zone (its room's number counts)
 * and when another room has it. When stating it moves the numbers Grid counts for the other rooms,
 * the change writes them the numbers they showed (WRT-23, `keepRoomNumbers`), and the answer says so.
 *
 * Grid checks nothing against a fact. Pure: a survey in, a patch out.
 */
import { roomNumbers, shownRoomNumber } from '@ongrid/floorplan/geometry'
import { english, name as sayName, num, said, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import { PropertiesSchema, factKey, factText, textProblem, type FactValue, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import { askPlan, QueryRefused, select, type Part, type Selection } from '../quantities/query'
import type { Survey } from '../quantities/survey'
import { emptyPatch, listed, type OpeningChange, type PartList, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

export interface FactsRequest {
  /** The parts by id, of any kind. */
  readonly parts?: readonly string[]
  /** The parts as grid_find picks them. */
  readonly selection?: Selection
  /** One room's number, or `none` to leave it to Grid's count. */
  readonly number?: string
  readonly set?: Readonly<Record<string, FactValue>>
  readonly unset?: readonly string[]
}

/** What the change did on one part, for the answer's data. */
export interface PartFacts {
  readonly kind: Part['kind']
  readonly id: string
  readonly set: Readonly<Record<string, FactValue>>
  readonly unset: readonly string[]
  readonly number?: string | null
}

/** Grid's own fields, by the fact name an agent would give them, and what sets each. */
const OWN_FIELDS: Readonly<Record<string, { readonly kinds: readonly Part['kind'][]; readonly how: MessageKey }>> = {
  name: { kinds: ['room', 'floor'], how: 'edit.facts.how.name' },
  use: { kinds: ['room'], how: 'edit.facts.how.use' },
  number: { kinds: ['room'], how: 'edit.facts.how.number' },
  area: { kinds: ['room', 'floor'], how: 'edit.facts.how.area' },
}

const refuse = (key: MessageKey, values?: Values): never => {
  throw new EditRefused(english(said(key, values)))
}

const partName = (part: Pick<Part, 'kind' | 'id'>): string => `${part.kind} ${quoted(part.id)}`
const valueSaid = (value: FactValue): Values[string] => (typeof value === 'string' ? sayName(value) : typeof value === 'number' ? num(String(value)) : factText(value))
const partsSaid = (parts: readonly Pick<Part, 'kind' | 'id'>[]): string => listed(parts.map(partName), 6)

/** The parts the request names, in the plan's order. */
function partsOf(survey: Survey, request: FactsRequest): Part[] {
  const asked = askPlan(survey)
  const selection = request.selection ?? {}
  const selecting = selection.kinds !== undefined || selection.floor !== undefined || selection.room !== undefined || (selection.where ?? []).length > 0
  const ids = request.parts ?? []
  if (ids.length === 0 && !selecting) refuse('edit.facts.noParts')
  for (const id of ids) {
    if (asked.parts.some((part) => part.id === id)) continue
    const meant = likelyId(id, asked.parts.map((part) => part.id))
    refuse('edit.facts.unknownPart', { part: sayName(id), meant: meant === null ? '' : said('edit.facts.meant', { part: sayName(meant) }) })
  }
  let picked: Part[]
  try {
    picked = selecting ? select(asked, selection) : [...asked.parts]
  } catch (error) {
    if (error instanceof QueryRefused) throw new EditRefused(error.message)
    throw error
  }
  const named = new Set(ids)
  const parts = ids.length === 0 ? picked : picked.filter((part) => named.has(part.id))
  if (parts.length === 0) refuse('edit.facts.noneMet')
  return parts
}

/** The spelling the plan already gives a fact, matched by `factKey`, or the name as given. */
function planSpelling(survey: Survey, name: string): string {
  const key = factKey(name)
  const plan = survey.plan
  for (const part of [...(plan.floors ?? []), ...plan.rooms, ...plan.walls, ...plan.openings]) {
    for (const own of Object.keys(part.properties ?? {})) if (factKey(own) === key) return own
  }
  return name
}

/** The number change for one room: the patch's field, its line, and whether other rooms' numbers move. */
function numberChange(survey: Survey, parts: readonly Part[], asked: string): { room: Part; number: string | null; lines: string[] } | null {
  const rooms = parts.filter((part) => part.kind === 'room')
  const other = parts.find((part) => part.kind !== 'room')
  if (other !== undefined) refuse('edit.facts.numberNotRoom', { part: partName(other) })
  if (rooms.length !== 1) refuse('edit.facts.numberOneRoom', { count: rooms.length })
  const room = rooms[0]!
  if (room.zoneOf !== undefined) refuse('edit.facts.numberZone', { room: sayName(room.id), of: sayName(room.zoneOf) })
  const plan = survey.plan
  const record = plan.rooms.find((r) => r.id === room.id)!
  const text = asked.trim()
  const number = text.toLowerCase() === 'none' ? null : text
  if (number !== null) {
    const problem = textProblem(number, 'id')
    if (problem !== null) refuse('edit.facts.numberText', { problem })
  }
  const before = roomNumbers(plan)
  const was = before.find((n) => n.id === room.id && n.floor === room.floor)
  if ((record.number ?? null) === number) return null
  if (number !== null) {
    const taken = before.find((n) => n.id !== room.id && shownRoomNumber(n) === number)
    if (taken !== undefined) refuse('edit.facts.numberTaken', { number: sayName(number), room: sayName(taken.id) })
  }
  const after: FloorPlan = { ...plan, rooms: plan.rooms.map((r) => (r.id !== room.id ? r : number === null ? { ...r, number: undefined } : { ...r, number })) }
  const now = new Map(roomNumbers(after).map((n) => [`${n.floor}\u0000${n.id}`, shownRoomNumber(n)] as const))
  const moved = before.some((n) => n.id !== room.id && now.get(`${n.floor}\u0000${n.id}`) !== shownRoomNumber(n))
  if (moved && number === null) refuse('edit.facts.numberNoneMoves', { room: sayName(room.id) })
  const shownWas = was === undefined ? null : shownRoomNumber(was)
  const lines = [
    number === null
      ? english(said('edit.facts.numberNone', { room: sayName(room.id), number: sayName(now.get(`${room.floor}\u0000${room.id}`) ?? '') }))
      : english(said(record.number === undefined ? 'edit.facts.numberCounted' : 'edit.facts.number', { room: sayName(room.id), number: sayName(number), was: sayName(shownWas ?? '') })),
    ...(moved ? [english(said('edit.facts.numbersKept'))] : []),
  ]
  return { room, number, lines }
}

export function setFacts(survey: Survey, request: FactsRequest): Patch {
  const setting = Object.entries(request.set ?? {})
  const unsetting = request.unset ?? []
  if (setting.length === 0 && unsetting.length === 0 && request.number === undefined) refuse('edit.facts.nothing')
  const parts = partsOf(survey, request)

  // The names, in the plan's spelling, each given once; Grid's own fields are refused.
  const named = new Map<string, string>()
  const once = (given: string): string => {
    const name = given.trim()
    if (name === '') refuse('edit.facts.emptyName')
    const own = OWN_FIELDS[factKey(name)]
    const on = own === undefined ? undefined : parts.find((part) => own.kinds.includes(part.kind))
    if (own !== undefined && on !== undefined) refuse('edit.facts.ownField', { fact: sayName(name), part: partName(on), how: said(own.how) })
    const key = factKey(name)
    const first = named.get(key)
    if (first !== undefined) refuse('edit.facts.twice', { first: sayName(first), second: sayName(name) })
    named.set(key, name)
    return planSpelling(survey, name)
  }
  const sets = setting.map(([given, value]) => {
    const name = once(given)
    const clean = typeof value === 'string' ? value.trim() : value
    if (clean === '') refuse('edit.facts.emptyValue', { fact: sayName(name) })
    return { name, value: clean }
  })
  const unsets = unsetting.map(once)

  const said_: string[] = []
  const patch = emptyPatch(said_)
  const rooms = patch.rooms as Map<string, RoomChange>
  const done: PartFacts[] = []
  const changes = new Map<Part, { set: Record<string, FactValue>; unset: string[]; number?: string | null }>()
  const changeOf = (part: Part): { set: Record<string, FactValue>; unset: string[]; number?: string | null } => {
    const had = changes.get(part)
    if (had !== undefined) return had
    const fresh = { set: {}, unset: [] }
    changes.set(part, fresh)
    return fresh
  }

  // The number first: it is one room's, and its line leads.
  if (request.number !== undefined) {
    const change = numberChange(survey, parts, request.number)
    if (change !== null) {
      changeOf(change.room).number = change.number
      said_.push(...change.lines)
    }
  }

  // Each fact, on every part: what it was, and what it is now.
  const facts = new Map<Part, Record<string, FactValue>>(parts.map((part) => [part, { ...part.facts }] as const))
  const ownName = (record: Readonly<Record<string, FactValue>>, name: string): string | undefined => Object.keys(record).find((own) => factKey(own) === factKey(name))
  for (const { name, value } of sets) {
    const changed: Part[] = []
    const already: Part[] = []
    let was: FactValue | undefined
    for (const part of parts) {
      const record = facts.get(part)!
      const own = ownName(record, name)
      if (own !== undefined && record[own] === value && own === name) {
        already.push(part)
        continue
      }
      if (own !== undefined) {
        was = record[own]
        delete record[own]
      }
      record[name] = value
      changeOf(part).set[name] = value
      changed.push(part)
    }
    if (changed.length === 1 && was !== undefined) said_.push(english(said('edit.facts.setWas', { part: partName(changed[0]!), fact: sayName(name), value: valueSaid(value), was: valueSaid(was) })))
    else if (changed.length > 0) said_.push(english(said('edit.facts.set', { parts: partsSaid(changed), fact: sayName(name), value: valueSaid(value) })))
    if (already.length > 0) said_.push(english(said('edit.facts.already', { parts: partsSaid(already), fact: sayName(name), value: valueSaid(value) })))
  }
  for (const name of unsets) {
    const taken: Part[] = []
    const none: Part[] = []
    for (const part of parts) {
      const record = facts.get(part)!
      const own = ownName(record, name)
      if (own === undefined) {
        none.push(part)
        continue
      }
      delete record[own]
      changeOf(part).unset.push(own)
      taken.push(part)
    }
    if (taken.length > 0) said_.push(english(said('edit.facts.unset', { parts: partsSaid(taken), fact: sayName(name) })))
    if (none.length > 0) said_.push(english(said('edit.facts.notThere', { parts: partsSaid(none), fact: sayName(name) })))
  }
  if (changes.size === 0) refuse('edit.facts.unchanged')

  // Into the patch, each part's facts whole, as the file will hold them.
  const floors = new Map<string, Record<string, unknown>>()
  for (const part of parts) {
    const change = changes.get(part)
    if (change === undefined) continue
    done.push({ kind: part.kind, id: part.id, set: change.set, unset: change.unset, ...(change.number === undefined ? {} : { number: change.number }) })
    const factsChanged = Object.keys(change.set).length > 0 || change.unset.length > 0
    const record = facts.get(part)!
    if (factsChanged) {
      const checked = PropertiesSchema.safeParse(record)
      if (!checked.success) refuse('edit.facts.refused', { part: partName(part), problem: checked.error.issues[0]?.message ?? '' })
    }
    const properties = Object.keys(record).length === 0 ? null : record
    const facts_ = factsChanged ? { properties } : {}
    if (part.kind === 'room') rooms.set(part.id, { ...facts_, ...(change.number === undefined ? {} : { number: change.number }) })
    else if (part.kind === 'wall') (patch.walls as Map<string, { properties?: typeof properties }>).set(part.id, facts_)
    else if (part.kind === 'floor') {
      if (survey.plan.floors === undefined) refuse('edit.facts.noFloors')
      floors.set(part.id, facts_)
    } else (patch.openings as Map<string, OpeningChange>).set(part.id, facts_)
  }
  const withFloors: Patch = floors.size === 0 ? patch : { ...patch, parts: new Map<PartList, ReadonlyMap<string, Readonly<Record<string, unknown>>>>([['floors', floors]]) }
  return { ...withFloors, extra: { parts: done } }
}
