/**
 * MSG-6: a plan read part by part. A fault stays where it is.
 *
 * `parseFloorPlan` is all or nothing: one negative offset, one number written as text or one
 * `null` refuses the whole plan with a position such as `openings.3.offset` (lab MS-6). This
 * reader checks each wall, room, opening, floor, fixture and opening pattern (LVL-8) with the schema's own rules, keeps
 * what is sound, and says what it did with the rest, part by part:
 *
 * - **read as meant**: a number written as text (`"2.5"`, `"0.9 m"`), `"true"` for true, a word
 *   that differs from one the format knows only in its capitals or spaces (`"Exterior"`,
 *   `"Door"`), and a number where an id goes. The value is read and the line says so.
 * - **value left out**: a value the format cannot read in a field that may be left out. The
 *   field's default is used, or the field is read as not stated, and the line says which. One
 *   fact of the person's own (CNT-9) is left out on its own, and the part keeps the others. A
 *   size stated where the field has a default is not: the default would change what is drawn,
 *   so the part is left out (`STATED_SIZES`).
 * - **part left out**: a value the part cannot do without (a wall's start, an opening's type)
 *   that cannot be read. The part is set aside; the rest of the plan is read and checked
 *   without it, and every view, measure and export leaves it out.
 *
 * Then the ids. Ids are unique across the whole plan (the owner's decision of 20 November
 * 2026). Of two parts of different kinds with one id, only the clash is set aside: the wall is
 * kept, because rooms and openings name walls, and the other part is left out, so the rooms on
 * that wall are still measured (lab MS-9). This is the reader's to do, because `validatePlan`
 * marks what it skips in one set of ids, where a room named after a wall takes the wall with it.
 * Two walls with one id are left as they are for `validatePlan`, which skips both
 * (`plan/duplicate-id`): a room that names that id could mean either; so are a blank id and two
 * ids that differ only in capitals or spaces (`plan/blank-id`, `plan/similar-id`).
 *
 * The plan's other lists (notes, sketch items, stairs, saved views and the like) lose only the
 * entries that cannot be read, each with its own line (MSG-20). What is left at the plan's top
 * level (a version Grid does not read, a list that is not a list) still refuses the plan, with
 * the schema's own problems. Pure: the file as JSON in,
 * plain data out. Text from the file is repeated only in quotes and only when it keeps to the
 * text rule (MSG-9).
 */
import { z } from 'zod'
import {
  DEFAULT_FLOOR_ID,
  FloorPlanSchema,
  FloorSchema,
  withTypes,
  withLibrary,
  ItemSchema,
  OpeningPatternSchema,
  OpeningSchema,
  RoomSchema,
  WallSchema,
  type FloorPlan,
  type PlanSchemaIssue
} from './floorplan'
import type { JsonPath, TextMark } from './jsonText'
import { quoted, textProblem } from './planText'
import { planInMetres } from './units'
import { name, num, said, sayValue, type MessageKey, type Value } from '../messages/say'

export type PartList = 'walls' | 'rooms' | 'openings' | 'floors' | 'items' | 'patterns'

/** The part a fault is about: where it is in the file, and its id when it can be read. */
export interface PartRef {
  readonly list: PartList
  /** Its position in the file's list, from 0. */
  readonly index: number
  /** Its id, when it is text that keeps to the text rule; else null. */
  readonly id: string | null
}

interface ValueFault<T> {
  /** The part it is in; null for the plan's own fields (`units`, `referenceImage`). */
  readonly part: PartRef | null
  /** Where the value is, from the top of the file. */
  readonly path: JsonPath
  /** What is there, in words (MSG-11: by key and values): `-0.3`, `null`, `missing`, `NaN, which JSON does not hold as a number`. */
  readonly found: T
  /** What the format takes there, in words: `a number of at least 0`. */
  readonly wants: T
}

/**
 * What the reader did with a part or value. Its words are in English (`found`, `wants`, `read`,
 * `used`); MSG-11: `words` holds the same by key and values (`T` = `Value`), to say them in any
 * language. `words` is not enumerable, so a fault reads and compares as it did.
 */
export type ReadFault<T = string> = (
  | (ValueFault<T> & { readonly kind: 'read-as-meant'; /** The value read, in words. */ readonly read: T })
  | (ValueFault<T> & {
      readonly kind: 'value-left-out'
      /** The default used, in words; null when the field is read as not stated. */
      readonly used: T | null
    })
  | (ValueFault<T> & { readonly kind: 'part-left-out'; readonly part: PartRef })
  /** A part with the id of a part of another kind, or of the same kind but not two walls. It is left out; `kept` is read. */
  | { readonly kind: 'id-clash'; readonly part: PartRef & { readonly id: string }; readonly kept: PartRef & { readonly id: string } }
) & { readonly words?: ReadFault<Value> }

/**
 * MSG-5: a wall, room or opening the reader left out, as the checks need it to hold back what
 * rests on it: a door it held, a room beside it. Each value only when it can be read.
 */
export interface LeftOutPart {
  readonly kind: 'wall' | 'room' | 'opening'
  readonly id: string | null
  /** The floor of a wall or a room as written, the default floor when it states none; null for an opening. */
  readonly floor: string | null
  /** The walls it names: a room's boundary, an opening's wall. Empty for a wall. */
  readonly walls: readonly string[]
}

export type PlanRead =
  | {
      readonly plan: FloorPlan
      /** What the reader did with each part or value it could not read as written, in file order. */
      readonly faults: readonly ReadFault[]
      /** The ids of the walls left out, for `validatePlan` to name them on the rooms and openings that rest on them. */
      readonly leftOutWalls: ReadonlySet<string>
      /** MSG-5: every wall, room and opening left out (`part-left-out`, `id-clash`), in file order. */
      readonly leftOut: readonly LeftOutPart[]
    }
  | {
      readonly plan: null
      /** `not-an-object`, or what the schema refuses at the plan's top level. */
      readonly refusal: { readonly kind: 'not-an-object' } | { readonly kind: 'schema'; readonly issues: readonly PlanSchemaIssue[] }
    }

const LISTS: readonly PartList[] = ['walls', 'rooms', 'openings', 'floors', 'items', 'patterns']
const SCHEMAS: Record<PartList, z.ZodTypeAny> = {
  walls: WallSchema,
  rooms: RoomSchema,
  openings: OpeningSchema,
  floors: FloorSchema,
  items: ItemSchema,
  // LVL-8: an opening pattern that cannot be read is left out on its own.
  patterns: OpeningPatternSchema
}
/**
 * The sizes with a default. A size stated there that cannot be read (out of range, NaN, a
 * decimal comma, a word) is a statement, not a gap: the default would change what is drawn and
 * measured (a wall stated -0.3 thick drawn 0.2 thick), so the part is left out instead. Only
 * `null`, which states nothing, takes the default. A floor's `level` is not one of them: it only
 * orders the floors, and leaving a floor out would leave out everything on it. Nor is a wall's
 * `arc` (CNT-18): it has no default, so one that cannot be read is read as not stated, as a hinge
 * is, and the line says so; the wall is drawn straight. HND-11: a wall's
 * `face` is one too: read as its centre line, the wall would stand half its thickness off.
 */
const STATED_SIZES: Partial<Record<PartList, readonly string[]>> = { walls: ['thickness', 'height', 'face'], openings: ['sill'] }

/** The order ids are kept in: walls first, because rooms and openings name them. */
const ID_ORDER: readonly PartList[] = ['walls', 'rooms', 'openings', 'items', 'patterns']

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const sameKeys = (a: JsonPath, b: JsonPath): boolean => a.length === b.length && a.every((key, i) => key === b[i])

/** An id as a line may repeat it: text that keeps to the text rule. */
export function readableId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && textProblem(value, 'id') === null ? value : null
}

// ---------------------------------------------------------------------------------------------
// Words for what is found and what is wanted

/** The kinds of value the format names, each by its words (MSG-11: `read.type.*`). */
const TYPE_WORDS: Record<string, MessageKey> = {
  number: 'read.type.number',
  string: 'read.type.string',
  boolean: 'read.type.boolean',
  array: 'read.type.array',
  object: 'read.type.object',
  null: 'read.type.null',
  nan: 'read.type.nan'
}

/** A number as JSON wrote it: never with the language's decimal mark, since it is the file's own text. */
const asWritten = (value: number | string): string => String(value)

/** What a value is, in words, never repeating text that breaks the text rule. */
function valueText(value: unknown, mark: TextMark | undefined): Value {
  if (mark?.what === 'not-a-number') return said('read.found.notANumber', { token: mark.token })
  if (mark?.what === 'decimal-comma') return said('read.found.decimalComma', { token: mark.token })
  if (value === undefined) return said('read.found.missing')
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return asWritten(String(value))
  if (typeof value === 'string') {
    if (value === '') return said('read.found.emptyText')
    return textProblem(value, 'id') === null ? said('read.found.text', { text: name(value) }) : said('read.type.string')
  }
  if (Array.isArray(value)) return said('read.found.list', { count: value.length })
  return said('read.type.object')
}

/** What the format takes where a number is too small or too large, or a list too short or long. */
function rangeText(issue: PlanSchemaIssue & { code: 'too_small' | 'too_big' }): Value {
  const small = issue.code === 'too_small'
  const bound = small ? issue.minimum : issue.maximum
  const value = typeof bound === 'bigint' ? bound.toString() : String(bound)
  if (issue.type === 'number') return said(small ? (issue.inclusive ? 'read.wants.atLeast' : 'read.wants.moreThan') : issue.inclusive ? 'read.wants.atMost' : 'read.wants.lessThan', { value: num(value) })
  if (issue.type === 'array' && issue.exact) return said('read.found.list', { count: num(value) })
  const unit = issue.type === 'string' ? 'characters' : 'items'
  return said(`read.wants.${small ? 'least' : 'most'}.${unit}` as MessageKey, { value: num(value) })
}

/** What the format takes at the place of a schema problem, in words. */
export function wantedText(issue: PlanSchemaIssue): Value {
  switch (issue.code) {
    case 'invalid_type':
      return Object.hasOwn(TYPE_WORDS, issue.expected) ? said(TYPE_WORDS[issue.expected]!) : said('read.wants.a', { type: issue.expected })
    case 'invalid_enum_value':
      return said('read.wants.oneOf', { options: issue.options.map((o) => JSON.stringify(o)).join(', ') })
    case 'invalid_literal':
      return JSON.stringify(issue.expected)
    case 'too_small':
    case 'too_big':
      return rangeText(issue)
    case 'not_finite':
      return said('read.wants.finite')
    default:
      return said('read.wants.format')
  }
}

/** What was found at the place of a schema problem, in words. */
function foundText(issue: PlanSchemaIssue, value: unknown, mark: TextMark | undefined): Value {
  if (mark !== undefined) return valueText(value, mark)
  // A text-rule problem says what is wrong with the text without repeating it (MSG-9). The
  // schema's own sentence stays as the schema words it, in English (`planText.ts`).
  if (issue.code === 'custom') return said(typeof value === 'string' ? 'read.found.textThat' : Array.isArray(value) ? 'read.found.listThat' : 'read.found.valueThat', { problem: issue.message })
  // `[4, 6, 3, 3]` where a point goes: most likely `4,6` and `3,3` with a decimal comma.
  if (issue.code === 'too_big' && issue.type === 'array' && Array.isArray(value) && value.length === 4 && value.every((v) => Number.isInteger(v))) {
    return said('read.found.splitPoint', { numbers: value.join(', ') })
  }
  return valueText(value, undefined)
}

// ---------------------------------------------------------------------------------------------
// Read as meant

const NO = Symbol('no reading')
const NUMBER_TEXT = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(?:m)?\s*$/
const fold = (word: string): string => word.toLowerCase().replace(/[\s_-]+/g, '')

/** The value most likely meant, when it can be told for sure; else `NO`. */
function asMeant(value: unknown, issue: PlanSchemaIssue): unknown {
  if (issue.code === 'invalid_type') {
    if (issue.expected === 'number' && typeof value === 'string') {
      const found = NUMBER_TEXT.exec(value)
      return found === null ? NO : Number(found[1])
    }
    if (issue.expected === 'boolean' && typeof value === 'string') {
      const word = value.trim().toLowerCase()
      return word === 'true' ? true : word === 'false' ? false : NO
    }
    // An id or a name written as a whole number: 12 for "12".
    if (issue.expected === 'string' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
    return NO
  }
  if (issue.code === 'invalid_enum_value' && typeof value === 'string' && value.trim() !== '') {
    const match = issue.options.filter((option) => typeof option === 'string' && fold(option) === fold(value))
    return match.length === 1 ? match[0] : NO
  }
  if (issue.code === 'invalid_literal' && typeof issue.expected === 'string') {
    if (typeof value === 'string' && value.trim() !== '' && fold(value) === fold(issue.expected)) return issue.expected
    if (typeof value === 'number' && String(value) === issue.expected) return issue.expected
  }
  return NO
}

/** A value read or used, in words. */
function readText(value: unknown): string {
  if (typeof value === 'string') return quoted(value)
  if (Array.isArray(value) || isObject(value)) return JSON.stringify(value)
  return String(value)
}

// ---------------------------------------------------------------------------------------------
// One part

function getAt(root: unknown, path: JsonPath): unknown {
  let here: unknown = root
  for (const key of path) {
    if (typeof here !== 'object' || here === null) return undefined
    here = (here as Record<string | number, unknown>)[key]
  }
  return here
}

/**
 * Sets a value inside a part, copying each list and object on the way, so the file as read is
 * never changed. Never a deep copy: a part may nest a list a hundred thousand deep (lab T-9).
 */
function setAt(root: Record<string, unknown>, path: JsonPath, value: unknown): void {
  let here: Record<string | number, unknown> = root
  for (const key of path.slice(0, -1)) {
    const child = here[key]
    const copy = (Array.isArray(child) ? [...child] : { ...(child as object) }) as Record<string | number, unknown>
    here[key] = copy
    here = copy
  }
  here[path[path.length - 1]!] = value
}

/**
 * One part, read as far as it can be: the part as it is kept (or null when it is left out), and
 * what was done to it. A value left out is told the default used once the part is read.
 */
function readPart(list: PartList, index: number, raw: unknown, marks: readonly TextMark[]): { part: Record<string, unknown> | null; faults: ReadFault<Value>[] } {
  const schema = SCHEMAS[list]
  const ref: PartRef = { list, index, id: isObject(raw) ? readableId(raw['id']) : null }
  if (!isObject(raw)) {
    return { part: null, faults: [{ kind: 'part-left-out', part: ref, path: [list, index], found: valueText(raw, undefined), wants: said('read.type.object') }] }
  }
  const part: Record<string, unknown> = { ...raw }
  let faults: ReadFault<Value>[] = []
  // A value left out, in its place among the faults, until the default it leaves is known.
  const pending = new Map<ReadFault<Value>, string>()
  const tried = new Set<string>()
  // Each turn reads one value as meant or leaves one field out, so a part cannot take more
  // turns than it has values; the bound only stops a schema that never settles.
  for (let turn = 0; turn < 64; turn++) {
    const parsed = schema.safeParse(part)
    if (parsed.success) {
      const data = parsed.data as Record<string, unknown>
      const used = (field: string): string | null => (data[field] === undefined ? null : readText(data[field]))
      return { part, faults: faults.map((f) => (pending.has(f) ? { ...f, used: used(pending.get(f)!) } : f)) }
    }
    const issue = parsed.error.issues[0]! as PlanSchemaIssue
    const path: JsonPath = [list, index, ...issue.path]
    const mark = marks.find((m) => sameKeys(m.path, path))
    const value = getAt(part, issue.path)
    const said = { part: ref, path, found: foundText(issue, value, mark), wants: wantedText(issue) }
    const field = issue.path[0]
    const key = issue.path.join('.')
    if (mark === undefined && !tried.has(key)) {
      const meant = asMeant(value, issue)
      if (meant !== NO && issue.path.length > 0) {
        tried.add(key)
        setAt(part, issue.path, meant)
        faults.push({ kind: 'read-as-meant', ...said, read: readText(meant) })
        continue
      }
    }
    // A value read as meant that still does not fit is said once, as what is done with it.
    const others = faults.filter((f) => f.kind !== 'read-as-meant' || !sameKeys(f.path, path))
    // CNT-9: one fact the format cannot read is left out on its own; the part keeps its others.
    const fact = issue.path[1]
    if (field === 'properties' && typeof fact === 'string' && isObject(part['properties']) && Object.hasOwn(part['properties'], fact)) {
      const facts = { ...(part['properties'] as Record<string, unknown>) }
      delete facts[fact]
      part['properties'] = facts
      faults = [...others, { kind: 'value-left-out', ...said, used: null }]
      continue
    }
    // A field the part can do without: left out, and its default used. Never the id, and never a
    // number out of range where the field has a default.
    const stated = typeof field === 'string' && (STATED_SIZES[list] ?? []).includes(field) && (value !== null || mark !== undefined)
    if (typeof field === 'string' && field !== 'id' && !stated && Object.hasOwn(part, field)) {
      const without = { ...part }
      delete without[field]
      const again = schema.safeParse(without)
      if (again.success || !again.error.issues.some((i) => i.path[0] === field)) {
        delete part[field]
        const fault: ReadFault<Value> = { kind: 'value-left-out', ...said, used: null }
        faults = [...others, fault]
        pending.set(fault, field)
        continue
      }
    }
    return { part: null, faults: [{ kind: 'part-left-out', ...said }] }
  }
  return { part: null, faults: [{ kind: 'part-left-out', part: ref, path: [list, index], found: said('read.found.unreadable'), wants: said('read.wants.format') }] }
}

// ---------------------------------------------------------------------------------------------
// The plan

/** Where each kept part was in the file, list by list. */
type Positions = Record<PartList, number[]>

/** The plan's own fields, once its parts are read: read as meant, left out, or refused. */
function readTop(work: Record<string, unknown>, faults: ReadFault<Value>[], marks: readonly TextMark[]): { plan: FloorPlan } | { issues: PlanSchemaIssue[] } {
  const tried = new Set<string>()
  // MSG-20: where each entry kept of a list left out entry by entry was in the file.
  const positions = new Map<string, number[]>()
  for (let turn = 0; turn < 16; turn++) {
    const parsed = FloorPlanSchema.safeParse(work)
    if (parsed.success) return { plan: parsed.data }
    const issue = parsed.error.issues[0]! as PlanSchemaIssue
    const [field] = issue.path
    // A list that is not a list, too long a list, or a part the schema still refuses: the
    // parts were each read, so this is the plan's shape, and the plan is refused.
    if (typeof field !== 'string' || field === 'version' || LISTS.includes(field as PartList)) {
      if (field === 'version' && !tried.has('version')) {
        const meant = asMeant(work['version'], issue)
        if (meant !== NO) {
          tried.add('version')
          faults.push({ kind: 'read-as-meant', part: null, path: issue.path, found: foundText(issue, work['version'], undefined), wants: wantedText(issue), read: readText(meant) })
          work['version'] = meant
          continue
        }
      }
      return { issues: parsed.error.issues as PlanSchemaIssue[] }
    }
    const value = getAt(work, issue.path)
    const mark = marks.find((m) => sameKeys(m.path, issue.path))
    const said = { part: null, path: issue.path, found: foundText(issue, value, mark), wants: wantedText(issue) }
    if (mark === undefined && !tried.has(field)) {
      const meant = issue.path.length === 1 ? asMeant(value, issue) : NO
      if (meant !== NO) {
        tried.add(field)
        work[field] = meant
        faults.push({ kind: 'read-as-meant', ...said, read: readText(meant) })
        continue
      }
    }
    // COD-3: a place Grid does not know is left out alone; the rest of the site is kept. BRF-3:
    // so is any other field of the site, and one street, set-back or thing of its lists.
    const site = work['site']
    if (field === 'site' && issue.path.length >= 2 && typeof site === 'object' && site !== null && !Array.isArray(site)) {
      const rest = { ...(site as Record<string, unknown>) }
      const [, key, at] = issue.path
      const list = typeof key === 'string' ? rest[key] : undefined
      if ((key === 'streets' || key === 'setbacks' || key === 'things') && typeof at === 'number' && Array.isArray(list)) rest[key] = list.filter((_, i) => i !== at)
      else delete rest[String(key)]
      work['site'] = rest
      faults.push({ kind: 'value-left-out', ...said, used: null })
      continue
    }
    // HND-10 (C31): a trace image's placement that cannot be read is left out alone: the image
    // keeps its path and is drawn without it. Its path cannot be done without.
    const image = work['referenceImage']
    const [, key] = issue.path
    if (field === 'referenceImage' && typeof key === 'string' && key !== 'path' && typeof image === 'object' && image !== null && !Array.isArray(image)) {
      const rest = { ...(image as Record<string, unknown>) }
      delete rest[key]
      work['referenceImage'] = rest
      faults.push({ kind: 'value-left-out', ...said, used: null })
      continue
    }
    // MSG-20: an entry of one of the plan's other lists (a note, a sketch item, a stair) that
    // cannot be read is left out alone, each with its own line at its place in the file, and the
    // rest of the list is kept. Every bad entry of the list goes in one turn.
    const entries = work[field]
    if (Array.isArray(entries) && typeof issue.path[1] === 'number') {
      const first = new Map<number, PlanSchemaIssue>()
      for (const each of parsed.error.issues as PlanSchemaIssue[]) {
        const at = each.path[1]
        if (each.path[0] === field && typeof at === 'number' && !first.has(at)) first.set(at, each)
      }
      const places = positions.get(field) ?? entries.map((_, i) => i)
      for (const [at, each] of [...first].sort(([a], [b]) => a - b)) {
        const path = [field, places[at]!, ...each.path.slice(2)]
        const found = foundText(each, getAt(work, each.path), marks.find((m) => sameKeys(m.path, path)))
        faults.push({ kind: 'value-left-out', part: null, path, found, wants: wantedText(each), used: null })
      }
      work[field] = entries.filter((_, i) => !first.has(i))
      positions.set(field, places.filter((_, i) => !first.has(i)))
      continue
    }
    // `units` keeps its default, metres; `projectId` and `referenceImage` are read as not stated.
    delete work[field]
    const used = FloorPlanSchema.safeParse(work)
    const data = used.success ? (used.data as Record<string, unknown>)[field] : undefined
    faults.push({ kind: 'value-left-out', ...said, used: data === undefined ? null : readText(data) })
  }
  return { issues: (FloorPlanSchema.safeParse(work).error?.issues ?? []) as PlanSchemaIssue[] }
}

/** One id on two parts, but not two walls: the first is kept, in the order walls, rooms, openings, items. */
function readClashes(plan: FloorPlan, positions: Positions, faults: ReadFault<Value>[]): FloorPlan {
  const out = { ...plan } as Record<string, unknown>
  const first = new Map<string, PartRef & { id: string }>()
  for (const list of ID_ORDER) {
    const parts = (plan[list as keyof FloorPlan] ?? undefined) as readonly { id: string }[] | undefined
    if (parts === undefined) continue
    const kept: { id: string }[] = []
    parts.forEach((part, at) => {
      const ref = { list, index: positions[list][at]!, id: part.id }
      const same = first.get(part.id)
      // Two walls with one id stay for `validatePlan`: a room naming it could mean either.
      if (same !== undefined && !(same.list === 'walls' && list === 'walls')) {
        faults.push({ kind: 'id-clash', part: ref, kept: same })
        return
      }
      if (same === undefined) first.set(part.id, ref)
      kept.push(part)
    })
    if (kept.length !== parts.length) out[list] = kept
  }
  return out as FloorPlan
}

/**
 * Reads a plan part by part. `raw` is the file as JSON; `marks` are the values its text held
 * that JSON does not (`readPlanText`), at their places. Never throws.
 */
export function readPlanParts(given: unknown, marks: readonly TextMark[] = []): PlanRead {
  if (!isObject(given)) return { plan: null, refusal: { kind: 'not-an-object' } }
  const faults: ReadFault<Value>[] = []
  // WRT-7: a file that states its lengths in another unit is read in that unit, and in metres from here on.
  const converted = planInMetres(given)
  // CNT-15 (C24): every part filled from its type first, so a part read alone is read as it is meant.
  // CNT-20 (C30): and every item from its library entry.
  const raw = withLibrary(withTypes(converted.raw)) as Record<string, unknown>
  if (converted.from !== null) {
    faults.push({ kind: 'read-as-meant', part: null, path: ['units'], found: JSON.stringify(given['units']), wants: said('read.wants.metres'), read: said('read.read.converted', { unit: said(`read.unit.${converted.from}` as MessageKey) }) })
  }
  const positions = Object.fromEntries(LISTS.map((list) => [list, [] as number[]])) as Positions
  const work: Record<string, unknown> = { ...raw }
  const whole = FloorPlanSchema.safeParse(raw)
  const bad = new Set(whole.success ? [] : whole.error.issues.filter((i) => typeof i.path[1] === 'number').map((i) => `${i.path[0]}|${i.path[1]}`))
  for (const list of LISTS) {
    const parts = raw[list]
    if (!Array.isArray(parts)) continue
    const kept: unknown[] = []
    parts.forEach((part, index) => {
      if (!bad.has(`${list}|${index}`)) {
        kept.push(part)
        positions[list].push(index)
        return
      }
      const read = readPart(list, index, part, marks)
      faults.push(...read.faults)
      if (read.part !== null) {
        kept.push(read.part)
        positions[list].push(index)
      }
    })
    work[list] = kept
  }
  const top = whole.success ? { plan: whole.data } : readTop(work, faults, marks)
  if (!('plan' in top)) return { plan: null, refusal: { kind: 'schema', issues: top.issues } }
  const plan = readClashes(top.plan, positions, faults)
  const leftOutWalls = new Set<string>()
  for (const fault of faults) {
    if (fault.part === null || fault.part.list !== 'walls' || fault.part.id === null) continue
    if (fault.kind === 'part-left-out' || fault.kind === 'id-clash') leftOutWalls.add(fault.part.id)
  }
  const inWords = faults.map(inEnglish)
  return { plan, faults: inWords, leftOutWalls, leftOut: leftOutParts(raw, inWords) }
}

/** A fault's words in English, with the same by key and values as its `words` (MSG-11). */
function inEnglish(fault: ReadFault<Value>): ReadFault {
  const text = (value: Value): string => sayValue('en', value)
  let out: ReadFault
  if (fault.kind === 'id-clash') out = { ...fault }
  else if (fault.kind === 'read-as-meant') out = { ...fault, found: text(fault.found), wants: text(fault.wants), read: text(fault.read) }
  else if (fault.kind === 'value-left-out') out = { ...fault, found: text(fault.found), wants: text(fault.wants), used: fault.used === null ? null : text(fault.used) }
  else out = { ...fault, found: text(fault.found), wants: text(fault.wants) }
  return Object.defineProperty(out, 'words', { value: fault, enumerable: false })
}

const LEFT_OUT_KINDS: Partial<Record<PartList, LeftOutPart['kind']>> = { walls: 'wall', rooms: 'room', openings: 'opening' }

/** MSG-5: the walls, rooms and openings the reader left out, each with what can be read of it. */
function leftOutParts(raw: Record<string, unknown>, faults: readonly ReadFault[]): LeftOutPart[] {
  const parts: LeftOutPart[] = []
  for (const fault of faults) {
    if (fault.kind !== 'part-left-out' && fault.kind !== 'id-clash') continue
    const kind = LEFT_OUT_KINDS[fault.part.list]
    if (kind === undefined) continue
    const list = raw[fault.part.list]
    const item = Array.isArray(list) && isObject(list[fault.part.index]) ? (list[fault.part.index] as Record<string, unknown>) : {}
    const floor = kind === 'opening' ? null : item['floor'] === undefined ? DEFAULT_FLOOR_ID : readableId(item['floor'])
    const named = kind === 'room' ? (Array.isArray(item['boundary']) ? (item['boundary'] as unknown[]) : []) : kind === 'opening' ? [item['wall']] : []
    const walls = named.flatMap((id) => readableId(id) ?? [])
    parts.push({ kind, id: fault.part.id, floor, walls })
  }
  return parts
}
