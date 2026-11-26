/**
 * Any field of a part set by id, checked by the plan schema (CMD-42): "raise the terrace 0.6 m"
 * (a room's `floorOffset`), "the hall walls are 3.2 m high" (a wall's `height`), "the first floor
 * stands at 3.4 m" (a floor's `elevation`), "the column is 0.5 m wide". The follow-ups no other
 * edit makes, which agents otherwise made by editing the plan file by hand.
 *
 * The parts are walls, rooms, floors, columns, stairs, ramps, bays and structural grids, named by
 * id; `kind` says which list when an id is in two. A field is one the list's schema names, read
 * from the schema itself, so a field added to the schema can be set with no change here. `set`
 * gives each field its whole value as the file holds it (metres, an object for `arc` or `roof`);
 * `unset` takes fields out. A field another tool sets is refused with that tool, so each change
 * has one way to be made; doors, windows, the site and north are left to their own tools.
 *
 * The check is the plan schema's: the plan as stated, with the change, is read by
 * `FloorPlanSchema`, and an issue it did not have before refuses the change, naming the part and
 * the field. `writeChange` then refuses one that adds a problem to the drawing, as for every edit.
 *
 * Pure: the plan as read in, a patch out.
 */
import { english, name as sayName, said, type MessageKey } from '@ongrid/floorplan/messages'
import {
  BaySchema,
  ColumnSchema,
  FloorPlanSchema,
  FloorSchema,
  RampSchema,
  RoomSchema,
  StairSchema,
  StructuralGridSchema,
  WallSchema,
  statedItem,
  statedOpening,
  statedWall,
  type FloorPlan,
} from '@ongrid/floorplan/types/floorplan'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import { applyPatch, emptyPatch, listed, type PartList, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

type RawRecord = Record<string, unknown>

/** The kinds of part grid_set changes, by the word the tool takes, with their list in the file. */
export const SET_KINDS = ['wall', 'room', 'floor', 'column', 'stair', 'ramp', 'bay', 'grid'] as const
export type SetKind = (typeof SET_KINDS)[number]

const LISTS: Readonly<Record<SetKind, 'walls' | 'rooms' | PartList>> = {
  wall: 'walls',
  room: 'rooms',
  floor: 'floors',
  column: 'columns',
  stair: 'stairs',
  ramp: 'ramps',
  bay: 'bays',
  grid: 'grids',
}

const SCHEMAS: Readonly<Record<SetKind, unknown>> = {
  wall: WallSchema,
  room: RoomSchema,
  floor: FloorSchema,
  column: ColumnSchema,
  stair: StairSchema,
  ramp: RampSchema,
  bay: BaySchema,
  grid: StructuralGridSchema,
}

/** The words a kind is said with in an answer. */
const KIND_WORDS: Readonly<Record<SetKind, string>> = { wall: 'wall', room: 'room', floor: 'floor', column: 'column', stair: 'stair', ramp: 'ramp', bay: 'bay', grid: 'structural grid' }

/** The fields another tool sets, by kind (`*` for every kind), and the words that name the tool. */
const OWN_FIELDS: Readonly<Record<SetKind | '*', Readonly<Record<string, MessageKey>>>> = {
  '*': { properties: 'edit.set.how.facts', phase: 'edit.set.how.phase' },
  room: { name: 'edit.set.how.rename', use: 'edit.set.how.rename', finishes: 'edit.set.how.rename', conditioned: 'edit.set.how.rename', number: 'edit.set.how.facts', boundary: 'edit.set.how.boundary', holes: 'edit.set.how.boundary' },
  wall: { thickness: 'edit.set.how.thickness', start: 'edit.set.how.ends', end: 'edit.set.how.ends', wallType: 'edit.set.how.type', face: 'edit.set.how.reading', placedBy: 'edit.set.how.reading', unstated: 'edit.set.how.reading', typed: 'edit.set.how.reading' },
  floor: {},
  column: {},
  stair: {},
  ramp: {},
  bay: {},
  grid: {},
}

/** The longest value an answer writes out; a longer one is cut short. */
const VALUE_SHOWN_MAX = 80

export interface SetRequest {
  /** The parts, by id. */
  readonly parts: readonly string[]
  /** Which list the ids are in, when an id is in more than one. */
  readonly kind?: SetKind
  /** Each field's whole new value, as the file holds it. */
  readonly set?: Readonly<Record<string, unknown>>
  /** Fields to take out. */
  readonly unset?: readonly string[]
}

/** What the change did on one part, for the answer's data. */
export interface PartSet {
  readonly kind: SetKind
  readonly id: string
  readonly set: Readonly<Record<string, unknown>>
  readonly unset: readonly string[]
}

const refuse = (key: MessageKey, values?: Parameters<typeof said>[1]): never => {
  throw new EditRefused(english(said(key, values)))
}

/** The field names a schema's object names, through its preprocessing and refinements. */
function fieldsOf(schema: unknown): string[] {
  let at = schema as { shape?: Record<string, unknown>; _def?: { schema?: unknown; innerType?: unknown } } | undefined
  for (let depth = 0; at !== undefined && at.shape === undefined && depth < 8; depth++) at = (at._def?.schema ?? at._def?.innerType) as typeof at
  return at?.shape === undefined ? [] : Object.keys(at.shape)
}

const shown = (value: unknown): string => {
  const text = JSON.stringify(value) ?? String(value)
  return text.length <= VALUE_SHOWN_MAX ? text : `${text.slice(0, VALUE_SHOWN_MAX - 1)}…`
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

interface Found {
  readonly kind: SetKind
  readonly id: string
  /** The part as Grid reads it. */
  readonly read: RawRecord
}

const partName = (part: Pick<Found, 'kind' | 'id'>): string => `${KIND_WORDS[part.kind]} ${quoted(part.id)}`

/** The records of one kind, as Grid reads the plan. */
function recordsOf(plan: FloorPlan, kind: SetKind): RawRecord[] {
  const list = (plan as unknown as RawRecord)[LISTS[kind]]
  return Array.isArray(list) ? (list as RawRecord[]) : []
}

/** The part each id names, in the order given. */
function partsOf(plan: FloorPlan, request: SetRequest): Found[] {
  const found: Found[] = []
  for (const id of new Set(request.parts)) {
    const hits = SET_KINDS.flatMap((kind) => recordsOf(plan, kind).filter((record) => record['id'] === id).map((read) => ({ kind, id, read })))
    if (request.kind !== undefined) {
      const hit = hits.find((h) => h.kind === request.kind)
      if (hit !== undefined) {
        found.push(hit)
        continue
      }
      if (hits.length > 0) refuse('edit.set.notKind', { kind: KIND_WORDS[request.kind], part: sayName(id), is: KIND_WORDS[hits[0]!.kind] })
    }
    if (hits.length > 1) refuse('edit.set.twoLists', { part: sayName(id), first: KIND_WORDS[hits[0]!.kind], second: KIND_WORDS[hits[1]!.kind] })
    if (hits.length === 1) {
      found.push(hits[0]!)
      continue
    }
    if (plan.openings.some((opening) => opening.id === id)) refuse('edit.set.opening', { part: sayName(id) })
    const known = SET_KINDS.flatMap((kind) => recordsOf(plan, kind).map((record) => String(record['id'])))
    const meant = likelyId(id, known)
    refuse('edit.set.unknownPart', { part: sayName(id), meant: meant === null ? '' : said('edit.facts.meant', { part: sayName(meant) }) })
  }
  return found
}

/** Refuses a field the kind's schema does not name, or one another tool sets. */
function checkField(kind: SetKind, field: string): void {
  if (field === 'id') refuse('edit.set.id')
  const own = OWN_FIELDS[kind][field] ?? OWN_FIELDS['*'][field]
  const fields = fieldsOf(SCHEMAS[kind])
  if (own !== undefined && fields.includes(field)) refuse('edit.set.own', { field: sayName(field), kind: KIND_WORDS[kind], how: said(own) })
  if (fields.includes(field)) return
  const settable = fields.filter((f) => f !== 'id' && OWN_FIELDS[kind][f] === undefined && OWN_FIELDS['*'][f] === undefined)
  const meant = likelyId(field, settable)
  refuse('edit.set.unknownField', { field: sayName(field), kind: KIND_WORDS[kind], meant: meant === null ? '' : said('edit.set.meantField', { field: sayName(meant) }), fields: settable.join(', ') })
}

/** The plan as its file states it, for the schema to read again. */
function asStated(plan: FloorPlan): RawRecord {
  return {
    ...plan,
    walls: plan.walls.map((wall) => statedWall(wall)),
    openings: plan.openings.map((opening) => statedOpening(opening)),
    ...(plan.items === undefined ? {} : { items: plan.items.map((item) => statedItem(item)) }),
  }
}

/** The schema's issues reading a plan, each as its path and message. */
function issuesOf(raw: RawRecord): { path: (string | number)[]; message: string }[] {
  const parsed = FloorPlanSchema.safeParse(raw)
  return parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
}

/** Refuses the patch when the plan schema reads the plan with it as it did not without it. */
function checkSchema(plan: FloorPlan, patch: Patch, parts: readonly Found[]): void {
  const stated = asStated(plan)
  const key = (issue: { path: (string | number)[]; message: string }): string => `${issue.path.join('.')}\u0000${issue.message}`
  const before = new Set(issuesOf(stated).map(key))
  const fresh = issuesOf(applyPatch(stated, patch)).filter((issue) => !before.has(key(issue)))
  const issue = fresh[0]
  if (issue === undefined) return
  const [list, index, field, ...rest] = issue.path
  const record = typeof list === 'string' && typeof index === 'number' ? (stated[list] as RawRecord[] | undefined)?.[index] : undefined
  const part = record === undefined ? undefined : parts.find((p) => LISTS[p.kind] === list && p.id === record['id'])
  if (part !== undefined && typeof field === 'string') {
    const problem = [...rest.map(String), issue.message].join(' ').trim()
    refuse('edit.set.refused', { part: partName(part), field: sayName(field), problem })
  }
  refuse('edit.set.refusedPlan', { problem: `${issue.path.join('.')} ${issue.message}`.trim() })
}

export function setFields(plan: FloorPlan, request: SetRequest): Patch {
  const setting = Object.entries(request.set ?? {})
  const unsetting = [...new Set(request.unset ?? [])]
  if (setting.length === 0 && unsetting.length === 0) refuse('edit.set.nothing')
  for (const field of unsetting) if (Object.hasOwn(request.set ?? {}, field)) refuse('edit.set.twice', { field: sayName(field) })
  const parts = partsOf(plan, request)
  for (const part of parts) for (const field of [...setting.map(([f]) => f), ...unsetting]) checkField(part.kind, field)

  const said_: string[] = []
  const changes = new Map<Found, { set: RawRecord; unset: string[] }>()
  const changeOf = (part: Found): { set: RawRecord; unset: string[] } => {
    const had = changes.get(part)
    if (had !== undefined) return had
    const fresh = { set: {}, unset: [] }
    changes.set(part, fresh)
    return fresh
  }
  const stated = (part: Found): RawRecord => (part.kind === 'wall' ? (statedWall(part.read) as RawRecord) : part.read)
  const partsSaid = (list: readonly Found[]): string => listed(list.map(partName), 6)

  for (const [field, value] of setting) {
    const changed: Found[] = []
    const already: Found[] = []
    for (const part of parts) {
      if (same(stated(part)[field], value)) {
        already.push(part)
        continue
      }
      changeOf(part).set[field] = value
      changed.push(part)
    }
    const was = changed.length === 1 ? changed[0]!.read[field] : undefined
    if (changed.length === 1 && was !== undefined) said_.push(english(said('edit.set.setWas', { part: partName(changed[0]!), field: sayName(field), value: shown(value), was: shown(was) })))
    else if (changed.length > 0) said_.push(english(said('edit.set.set', { parts: partsSaid(changed), field: sayName(field), value: shown(value) })))
    if (already.length > 0) said_.push(english(said('edit.set.already', { parts: partsSaid(already), field: sayName(field), value: shown(value) })))
  }
  for (const field of unsetting) {
    const taken: Found[] = []
    const none: Found[] = []
    for (const part of parts) {
      if (stated(part)[field] === undefined) {
        none.push(part)
        continue
      }
      changeOf(part).unset.push(field)
      taken.push(part)
    }
    if (taken.length === 1) said_.push(english(said('edit.set.unsetWas', { part: partName(taken[0]!), field: sayName(field), was: shown(taken[0]!.read[field]) })))
    else if (taken.length > 0) said_.push(english(said('edit.set.unset', { parts: partsSaid(taken), field: sayName(field) })))
    if (none.length > 0) said_.push(english(said('edit.set.notThere', { parts: partsSaid(none), field: sayName(field) })))
  }
  if (changes.size === 0) refuse('edit.facts.unchanged')

  // Into the patch: walls and rooms through their own maps, so a wall whose height its floor gave
  // is changed as its file states it (`readingAfter`); the other lists through `parts`.
  const patch = emptyPatch(said_)
  const walls = patch.walls as Map<string, unknown>
  const rooms = patch.rooms as Map<string, RoomChange>
  const lists = new Map<PartList, Map<string, Readonly<Record<string, unknown>>>>()
  const done: PartSet[] = []
  for (const part of parts) {
    const change = changes.get(part)
    if (change === undefined) continue
    done.push({ kind: part.kind, id: part.id, set: change.set, unset: change.unset })
    const fields: RawRecord = { ...change.set, ...Object.fromEntries(change.unset.map((field) => [field, null])) }
    const list = LISTS[part.kind]
    if (list === 'walls') walls.set(part.id, fields)
    else if (list === 'rooms') rooms.set(part.id, fields as RoomChange)
    else {
      const byId = lists.get(list) ?? new Map<string, Readonly<Record<string, unknown>>>()
      byId.set(part.id, fields)
      lists.set(list, byId)
    }
  }
  const made: Patch = { ...patch, ...(lists.size === 0 ? {} : { parts: lists }), extra: { parts: done } }
  checkSchema(plan, made, parts)
  return made
}
