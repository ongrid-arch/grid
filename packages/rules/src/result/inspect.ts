/**
 * The front door (MSG-1): one call that reads a plan, runs every check and returns one record,
 * and never throws.
 *
 * It gathers what used to come back in separate lists: the reading's refusals, the drawing's
 * problems (`validatePlan`), the door sweeps (`validateDoorSweeps`), and the full check's
 * findings and notices (`checkLocalRules`). Each becomes a line of the one list, worded by its
 * code (`catalogue.ts`). A check that fails inside Grid becomes a line too, and the others
 * still run.
 *
 * Pure: a plan in, plain data out. No AI, no file, no network.
 */

import {
  assumedValues,
  floorOf,
  itemNameSaid,
  itemNounSaid,
  marksWithNoPart,
  mergeBase,
  phaseCounts,
  planFacing,
  planHasPhases,
  planInState,
  planFloors,
  checkDoorSweeps,
  siteThingsSaid,
  tapedLengths,
  tapedMissingSaid,
  validatePlan,
  withPatterns,
  LIMITS as PLAN_LIMITS,
  PLAN_LIMIT_KEYS,
  GENERAL_GUIDANCE_LABEL,
  type FloorPlan,
  type Issue,
  type TapedRow
} from '@ongrid/floorplan/geometry'
import { DEFAULT_LANGUAGE, en, joined, name, num, said, say, sayValue, withSentence, type Language, type MessageKey, type SayOptions, type Value } from '@ongrid/floorplan/messages'
import { DEFAULT_FLOOR_ID, FloorPlanSchema, quoted, textProblem } from '@ongrid/floorplan/types/floorplan'
import { readPlanText, type TextMark, type TextRead } from '@ongrid/floorplan/types/jsonText'
import { countryInText, countryName } from '@ongrid/floorplan/types/places'
import { readPlanParts, type LeftOutPart, type PartRef, type ReadFault } from '@ongrid/floorplan/types/readParts'
import { readingNotes, type ReadingNote } from '@ongrid/floorplan/types/reading'
import { FIGURE_LIMIT_KEYS, FIGURE_LIMITS } from '../checks/catalogue'
import { checkLocalRules, type CheckOptions } from '../checks/check'
import type { CheckCoverage, FindingCode, NotChecked, Rule, RuleFinding, RulesReport } from '../checks/types'
import { wordLine, type Subject } from './catalogue'
import { FIRM_MEASURES, firmShort, firmUsed, type FirmInput } from './firm'
import { LINE_KINDS, RESULT_VERSION, type Cause, type GridResult, type HeldNote, type LineKind, type ResultLine, type Thing, type ThingKind } from './types'

type ZodIssue = NonNullable<ReturnType<typeof FloorPlanSchema.safeParse>['error']>['issues'][number]

/** MSG-11: a part as a line names it, `Wall "w1"`, by its key (`thing.*`). */
const noun = (kind: Exclude<ThingKind, 'plan'> | 'door' | 'window', id: string): Value => said(`thing.${kind}`, { id: name(id) })
const THE_PLAN: Value = said('thing.plan')
/** An id from a file the format refused, when it is one Grid would read: else it is not repeated. */
const safeId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && textProblem(value, 'id') === null ? value : null

const FINDING_CODES: Record<FindingCode, string> = {
  no_exit: 'floor/no-exit',
  // LVL-14: a floor above the ground that nothing joins to the ground floor.
  no_stair: 'floor/no-stair',
  room_without_door: 'room/no-door',
  no_route_to_exit: 'room/no-route-out',
  door_to_undrawn_space: 'opening/to-undrawn-space',
  door_to_outside_above_ground: 'opening/door-out-above-ground',
  door_between_homes: 'opening/between-homes',
  flat_without_front_door: 'flat/no-front-door',
  opening_below_ground: 'opening/below-ground',
  opening_too_small_to_pass: 'opening/too-small-to-pass',
  // MSG-17: a way out leads to open air, and a let is left through common parts.
  door_into_closed_court: 'opening/into-closed-court',
  let_through_another_let: 'room/through-another-let',
  room_too_small: 'room/too-small',
  no_escape_opening: 'room/no-escape-opening',
  escape_window_too_small: 'room/escape-window-too-small',
  escape_window_too_high: 'room/escape-window-too-high',
  stair_out_of_line: 'room/stair-out-of-line',
  lift_out_of_line: 'room/lift-out-of-line',
  stair_shifted: 'room/stair-shifted',
  lift_shifted: 'room/lift-shifted',
  setback_short: 'plan/setback-short',
  over_boundary: 'plan/over-boundary'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function errorText(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error))
}

/**
 * MSG-11: the language the record being made is said in, and its decimal mark. Set by
 * `inspectPlan` for the one record it makes, as `withDisplay` sets a drawing's display.
 */
let speaking: { readonly language: Language; readonly options: SayOptions } = { language: DEFAULT_LANGUAGE, options: {} }

/** One line from its code and what the code is told, in the record's language. */
function line(code: string, kind: LineKind, thing: Thing, floor: string | null, subject: Subject, extra: Partial<Pick<ResultLine, 'figures' | 'fixes' | 'each' | 'held' | 'firm'>> = {}): ResultLine {
  const words = wordLine(code, subject, speaking.language, speaking.options)
  return {
    code,
    kind,
    thing,
    floor,
    also: subject.also,
    message: words.message,
    found: words.found,
    needed: words.needed,
    fix: words.fix,
    ...(Object.keys(words.values).length > 0 ? { values: words.values } : {}),
    ...extra
  }
}

const blank = (label: Value): Subject => ({ label, name: '', floorName: '', said: '', also: [], names: [], floors: 0, country: '' })

// ---------------------------------------------------------------------------------------------
// Reading

/** Where a schema problem is, as `walls[2].thickness`. Paths are keys of the schema and positions. */
function placeText(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${key}` : String(key)), '') || 'the plan'
}

/** The part of the file a schema problem is in, when it can be told from what was read. */
function partAt(raw: Record<string, unknown>, path: readonly (string | number)[]): { thing: Thing; floor: string | null; label: Value } {
  const whole = { thing: { kind: 'plan' as const, id: '' }, floor: null, label: THE_PLAN }
  const [list, at] = path
  const kinds: Record<string, ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor', items: 'item', stairs: 'stair', patterns: 'pattern' }
  if (typeof list !== 'string' || typeof at !== 'number' || !Object.hasOwn(kinds, list)) return whole
  const items = raw[list]
  const item = Array.isArray(items) ? (items[at] as unknown) : undefined
  if (typeof item !== 'object' || item === null) return whole
  const fields = item as Record<string, unknown>
  const id = safeId(fields['id'])
  if (id === null) return whole
  const kind = kinds[list]!
  let floor: string | null
  if (kind === 'floor') floor = id
  else if (kind === 'opening' || kind === 'pattern') {
    const walls = Array.isArray(raw['walls']) ? (raw['walls'] as unknown[]) : []
    const wall = walls.find((w) => typeof w === 'object' && w !== null && (w as Record<string, unknown>)['id'] === fields['wall'])
    floor = wall === undefined ? null : safeId((wall as Record<string, unknown>)['floor']) ?? DEFAULT_FLOOR_ID
  } else floor = safeId(fields['floor']) ?? DEFAULT_FLOOR_ID
  return { thing: { kind, id }, floor, label: kind === 'plan' ? THE_PLAN : noun(kind, id) }
}

/** What the format wants where a number is too small or too large. */
function rangeText(issue: ZodIssue & { code: 'too_small' | 'too_big' }): Value {
  const small = issue.code === 'too_small'
  const bound = small ? issue.minimum : issue.maximum
  const value = num(typeof bound === 'bigint' ? bound.toString() : String(bound))
  if (issue.type === 'number') return said(small ? (issue.inclusive ? 'read.wants.atLeast' : 'read.wants.moreThan') : issue.inclusive ? 'read.wants.atMost' : 'read.wants.lessThan', { value })
  const unit = issue.type === 'string' ? 'characters' : 'items'
  return said(`read.wants.${small ? 'least' : 'most'}.${unit}` as MessageKey, { value })
}

function refusalLines(raw: Record<string, unknown>, issues: readonly ZodIssue[]): ResultLine[] {
  return issues.map((issue) => {
    const place = placeText(issue.path)
    const part = partAt(raw, issue.path)
    const subject = (found: Value, wants: Value): Subject => ({ ...blank(part.label), said: found, place, wants })
    switch (issue.code) {
      case 'invalid_type':
        return issue.received === 'undefined'
          ? line('plan/missing-field', 'refused', part.thing, part.floor, subject('', said('read.wants.a', { type: issue.expected })))
          : line('plan/wrong-type', 'refused', part.thing, part.floor, subject(said('line.part.aAt', { type: issue.received, place }), said('read.wants.a', { type: issue.expected })))
      case 'invalid_enum_value':
        return line('plan/unknown-word', 'refused', part.thing, part.floor, subject('', said('read.wants.oneOf', { options: issue.options.map((o) => JSON.stringify(o)).join(', ') })))
      case 'invalid_literal':
        return line('plan/unknown-word', 'refused', part.thing, part.floor, subject('', JSON.stringify(issue.expected)))
      case 'too_small':
      case 'too_big':
        return line('plan/out-of-range', 'refused', part.thing, part.floor, subject('', rangeText(issue)))
      default:
        // Made from the schema's own rules, Grid's text checks among them: never the text found.
        return line('plan/not-in-format', 'refused', part.thing, part.floor, subject(oneLine(issue.message), said('read.wants.format')))
    }
  })
}

/** What each place may hold, for a field Grid does not know there (`line.part.fieldsOf.*`). */
const FIELDS_OF: Record<string, MessageKey> = {
  walls: 'line.part.fieldsOf.walls',
  rooms: 'line.part.fieldsOf.rooms',
  openings: 'line.part.fieldsOf.openings',
  floors: 'line.part.fieldsOf.floors',
  items: 'line.part.fieldsOf.items',
  patterns: 'line.part.fieldsOf.patterns',
  '': 'line.part.fieldsOf.plan',
  referenceImage: 'line.part.fieldsOf.referenceImage',
  written: 'line.part.fieldsOf.written'
}

/**
 * The words Grid does not read (MSG-4), one line each, about the part they are on: a field Grid
 * does not know, a room use it does not know, and an empty plan. They are worth a look: the
 * plan is read without them, and that may be what explains the other lines.
 */
function readingLines(raw: Record<string, unknown>, notes: readonly ReadingNote[], names: Names): ResultLine[] {
  return notes.map((note) => {
    if (note.kind === 'empty') return line('plan/empty', 'worth-a-look', { kind: 'plan', id: '' }, null, blank(THE_PLAN))
    // The part by where it is in the file; named as every other line names it.
    const at = note.part === null ? null : partAt(raw, [note.part.list, note.part.index])
    const part = at === null || at.thing.kind === 'plan' ? null : { thing: at.thing, ...names.thingOf(at.thing.kind, at.thing.id) }
    const thing = part?.thing ?? { kind: 'plan' as const, id: '' }
    const subject = { ...blank(part?.label ?? THE_PLAN), name: part?.name ?? '', nearest: note.nearest }
    if (note.kind === 'unknown-field') {
      const word = note.field === null ? said('line.part.unnamedField') : name(note.field)
      const key = FIELDS_OF[note.part?.list ?? note.at]
      const what = key === undefined ? name(note.at) : said(key)
      return line('plan/unknown-field', 'worth-a-look', thing, part?.floor ?? null, {
        ...subject,
        word,
        nearestWritten: note.nearestWritten,
        known: said('line.part.knownFields', { what, fields: note.known.join(', ') }),
        place: note.at || said('line.part.top')
      })
    }
    // The uses Grid knows are listed by the catalogue, in the line's language.
    const word = note.use !== null ? name(note.use) : note.notText !== null ? said('line.part.useThatIs', { what: note.said ?? note.notText }) : said('line.part.useNotRepeated')
    return line('plan/unknown-use', 'worth-a-look', thing, part?.floor ?? null, {
      ...subject,
      word,
      place: `${note.part.list}[${note.part.index}].use`
    })
  })
}


/** A part a reading fault is about, as a line names it: `Door "d1"`, or `The wall at walls[3]` when its id cannot be read. */
function faultPart(raw: Record<string, unknown>, ref: PartRef): { thing: Thing; floor: string | null; label: Value; place: string } {
  const place = `${ref.list}[${ref.index}]`
  const kind = PART_KINDS[ref.list]
  const items = raw[ref.list]
  const fields = Array.isArray(items) && typeof items[ref.index] === 'object' && items[ref.index] !== null ? (items[ref.index] as Record<string, unknown>) : {}
  const type = fields['type']
  const nounKind = kind === 'opening' && (type === 'door' || type === 'window' || type === 'opening') ? type : (kind as Exclude<ThingKind, 'plan'>)
  let floor: string | null
  if (kind === 'floor') floor = ref.id
  else if (kind === 'opening' || kind === 'pattern') {
    const walls = Array.isArray(raw['walls']) ? (raw['walls'] as unknown[]) : []
    const wall = walls.find((w) => typeof w === 'object' && w !== null && (w as Record<string, unknown>)['id'] === fields['wall'])
    floor = wall === undefined ? null : safeId((wall as Record<string, unknown>)['floor']) ?? DEFAULT_FLOOR_ID
  } else floor = safeId(fields['floor']) ?? DEFAULT_FLOOR_ID
  // A part whose id cannot be read is named by its place, and the line is about the plan.
  if (ref.id === null) return { thing: { kind: 'plan', id: '' }, floor: null, label: said(`thing.at.${nounKind}`, { place }), place }
  return { thing: { kind, id: ref.id }, floor, label: noun(nounKind, ref.id), place }
}

const PART_KINDS: Record<PartRef['list'], ThingKind> = { walls: 'wall', rooms: 'room', openings: 'opening', floors: 'floor', items: 'item', patterns: 'pattern' }

/** An id no part of the file has: `kitchen-2`. */
function freeId(raw: Record<string, unknown>, id: string): string {
  const taken = new Set<string>()
  for (const list of Object.keys(PART_KINDS)) {
    const items = raw[list]
    if (!Array.isArray(items)) continue
    for (const item of items) if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>)['id'] === 'string') taken.add((item as Record<string, unknown>)['id'] as string)
  }
  const base = id.trim().replace(/\s+/g, '-') || 'part'
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return quoted(`${base}-${n}`)
}

/**
 * What the reader did with each part or value it could not read as written (MSG-6), one line
 * each: a part left out (or one whose id another part keeps) is `left-out`, a value left out or
 * read as meant is `worth-a-look`.
 */
function faultLines(raw: Record<string, unknown>, faults: readonly ReadFault[]): ResultLine[] {
  return faults.map((fault) => {
    if (fault.kind === 'id-clash') {
      const at = faultPart(raw, fault.part)
      const kept = faultPart(raw, fault.kept)
      const subject: Subject = { ...blank(at.label), place: `${at.place}.id`, rename: freeId(raw, fault.part.id), kept: said('line.part.keptAt', { label: kept.label, place: kept.place }), also: [fault.kept.id] }
      return line('plan/id-clash', 'left-out', at.thing, at.floor, subject)
    }
    const at = fault.part === null ? { thing: { kind: 'plan' as const, id: '' }, floor: null, label: THE_PLAN } : faultPart(raw, fault.part)
    // MSG-11: the fault's words by key and values, to say them in the record's language.
    // Of the same kind as the fault, which is not an id clash here.
    const words = (fault.words ?? fault) as Exclude<NonNullable<typeof fault.words>, { kind: 'id-clash' }>
    const subject: Subject = { ...blank(at.label), said: words.found, place: placeText(fault.path), wants: words.wants }
    if (words.kind === 'read-as-meant') return line('plan/read-as-meant', 'worth-a-look', at.thing, at.floor, { ...subject, read: words.read })
    if (words.kind === 'value-left-out') {
      const made = line('plan/value-left-out', 'worth-a-look', at.thing, at.floor, { ...subject, used: words.used })
      if (fault.part === null && fault.path.length === 1 && fault.path[0] === 'units') UNITS_READ.add(made)
      return made
    }
    return line('plan/part-left-out', 'left-out', at.thing, at.floor, subject)
  })
}

/** A file that cannot be read as JSON, in the words of what it is (MSG-6). */
function textFaultLine(fault: Extract<TextRead, { ok: false }>['fault']): ResultLine {
  const plan = { kind: 'plan' as const, id: '' }
  if (fault.kind === 'not-json') {
    const where = fault.ends ? said('line.part.json.ends') : fault.line === null ? said('line.part.json.unreadable') : said('line.part.json.stops', { line: fault.line, column: fault.column ?? 0 })
    return line('plan/not-json', 'refused', plan, null, { ...blank(THE_PLAN), said: where })
  }
  const side = (s: { label: string | null }, other: MessageKey): Value => (s.label === null ? said(other) : name(s.label))
  const ours = side(fault.ours, 'line.part.side.first')
  const theirs = side(fault.theirs, 'line.part.side.second')
  const list = (ids: readonly string[]): Value =>
    ids.length > 6 ? said('line.part.andMore', { shown: joined(ids.slice(0, 6).map(name), 'join.comma'), more: ids.length - 6 }) : joined(ids.map(name), 'join.comma')
  const parts = [
    fault.ours.adds.length > 0 ? said('line.part.adds', { side: ours, ids: list(fault.ours.adds) }) : null,
    fault.theirs.adds.length > 0 ? said('line.part.adds', { side: theirs, ids: list(fault.theirs.adds) }) : null,
    fault.changed.length > 0 ? said('line.part.bothChange', { ids: list(fault.changed) }) : null
  ].filter((part): part is NonNullable<typeof part> => part !== null)
  const sides = joined(parts, 'join.semicolon')
  const conflicts = fault.conflicts === 1 ? said('line.part.conflicts.one') : said('line.part.conflicts.many', { count: fault.conflicts })
  const values = { conflicts, ours, theirs, line: fault.line }
  return line('plan/unfinished-merge', 'refused', plan, null, {
    ...blank(THE_PLAN),
    said: parts.length > 0 ? said('line.part.merge.sides', { ...values, sides }) : said('line.part.merge', values),
    ...(parts.length > 0 ? { sides } : {})
  })
}

type Read =
  | { plan: FloorPlan; raw: Record<string, unknown>; lines: ResultLine[]; leftOutWalls: ReadonlySet<string>; leftOut: readonly LeftOutPart[] }
  | { plan: null; lines: ResultLine[] }

function readPlan(raw: unknown): Read {
  let value = raw
  let marks: readonly TextMark[] = []
  if (typeof raw === 'string') {
    // MSG-6: the text is read before the JSON reader, for a merge left unfinished, NaN and a decimal comma.
    const text = readPlanText(raw)
    if (!text.ok) return { plan: null, lines: [textFaultLine(text.fault)] }
    value = text.value
    marks = text.marks
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { plan: null, lines: [line('plan/not-an-object', 'refused', { kind: 'plan', id: '' }, null, blank(THE_PLAN))] }
  }
  // MSG-6: part by part, so a fault stays where it is and the rest is still checked.
  const read = readPlanParts(value, marks)
  if (read.plan === null) {
    if (read.refusal.kind === 'not-an-object') return { plan: null, lines: [line('plan/not-an-object', 'refused', { kind: 'plan', id: '' }, null, blank(THE_PLAN))] }
    return { plan: null, lines: refusalLines(value as Record<string, unknown>, read.refusal.issues) }
  }
  return {
    plan: read.plan,
    raw: value as Record<string, unknown>,
    lines: faultLines(value as Record<string, unknown>, read.faults),
    leftOutWalls: read.leftOutWalls,
    leftOut: read.leftOut
  }
}

// ---------------------------------------------------------------------------------------------
// A plan that was read

interface Names {
  readonly floors: number
  floorName(id: string): string
  roomName(id: string): string
  thingOf(kind: ThingKind, id: string): { label: Value; name: string; floor: string | null }
  /** CNT-13: a fixture inside a sentence, `kitchen run "k1"` (`itemNameSaid`). */
  itemName(id: string): Value
}

function namesOf(plan: FloorPlan, stated: FloorPlan = plan): Names {
  const floors = planFloors(plan)
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const rooms = new Map<string, FloorPlan['rooms'][number]>()
  for (const room of plan.rooms) if (!rooms.has(room.id)) rooms.set(room.id, room)
  const walls = new Map<string, FloorPlan['walls'][number]>()
  for (const wall of plan.walls) if (!walls.has(wall.id)) walls.set(wall.id, wall)
  const openings = new Map<string, FloorPlan['openings'][number]>()
  for (const opening of plan.openings) if (!openings.has(opening.id)) openings.set(opening.id, opening)
  const stairs = new Map<string, NonNullable<FloorPlan['stairs']>[number]>()
  for (const stair of plan.stairs ?? []) if (!stairs.has(stair.id)) stairs.set(stair.id, stair)
  const items = new Map<string, NonNullable<FloorPlan['items']>[number]>()
  for (const item of plan.items ?? []) if (!items.has(item.id)) items.set(item.id, item)
  // LVL-8: a pattern is on its wall's floor.
  const patterns = new Map<string, NonNullable<FloorPlan['patterns']>[number]>()
  for (const pattern of stated.patterns ?? []) if (!patterns.has(pattern.id)) patterns.set(pattern.id, pattern)
  const flats = new Map<string, NonNullable<FloorPlan['flats']>[number]>()
  for (const flat of plan.flats ?? []) if (!flats.has(flat.id)) flats.set(flat.id, flat)
  const floorName = (id: string): string => floorNames.get(id) ?? id
  const roomName = (id: string): string => rooms.get(id)?.name || id
  return {
    floors: floors.length,
    floorName,
    roomName,
    itemName: (id) => {
      const item = items.get(id)
      return item ? itemNameSaid(item) : said('issue.part.item.item', { id: name(id) })
    },
    thingOf(kind, id) {
      switch (kind) {
        case 'plan':
          return { label: THE_PLAN, name: '', floor: null }
        case 'floor':
          return { label: noun('floor', floorName(id)), name: floorName(id), floor: id }
        case 'stair': {
          // LVL-3: a stair is on the floor its walking line starts from.
          const stair = stairs.get(id)
          return { label: noun('stair', stair?.name ?? id), name: stair?.name ?? id, floor: stair ? stair.from : null }
        }
        case 'room': {
          const room = rooms.get(id)
          return { label: noun('room', roomName(id)), name: roomName(id), floor: room ? floorOf(room) : null }
        }
        case 'wall': {
          const wall = walls.get(id)
          return { label: noun('wall', id), name: id, floor: wall ? floorOf(wall) : null }
        }
        case 'opening': {
          const opening = openings.get(id)
          const wall = opening ? walls.get(opening.wall) : undefined
          return {
            label: noun(opening ? opening.type : 'opening', id),
            name: id,
            floor: wall ? floorOf(wall) : null
          }
        }
        case 'pattern': {
          const wall = walls.get(patterns.get(id)?.wall ?? '')
          return { label: noun('pattern', id), name: id, floor: wall ? floorOf(wall) : null }
        }
        case 'flat': {
          // CNT-4: a flat by its name; on the floor of its first room, and on none when it holds none.
          const flat = flats.get(id)
          const first = flat?.rooms.map((room) => rooms.get(room)).find((room) => room !== undefined)
          return { label: noun('flat', flat?.name ?? id), name: flat?.name ?? id, floor: first === undefined ? null : floorOf(first) }
        }
        case 'item': {
          // A fixture by its kind: `Toilet "wc1"` (CNT-12). One of a kind Grid does not hold is an `Item`.
          const item = items.get(id)
          return { label: item ? itemNounSaid(item) : noun('item', id), name: id, floor: item ? floorOf(item) : null }
        }
      }
    }
  }
}

/** The thing a drawing problem is about: the plan-wide codes that name a floor are about the floor. */
function issueThing(issue: Issue): { thing: Thing; also: string[] } {
  if (issue.code === 'plan/similar-floor-id' || issue.code === 'plan/duplicate-floor' || issue.code === 'plan/same-level') return { thing: { kind: 'floor', id: issue.id }, also: [] }
  if (issue.entity === 'plan') return { thing: { kind: 'plan', id: '' }, also: issue.id === 'plan' ? [] : [issue.id] }
  return { thing: { kind: issue.entity, id: issue.id }, also: [] }
}

/**
 * MSG-5: the id of the part each drawing line follows from, as `validatePlan` gives it (`plan`
 * for the plan as a whole), until the record finds the line about that part.
 */
const CAUSE_IDS = new WeakMap<ResultLine, string>()
/** MSG-5: a line's cause where the record finds it itself, not the drawing check. */
const CAUSE_LINES = new WeakMap<ResultLine, ResultLine>()
/** MSG-5: the reader's line for a plan's stated unit, which it reads as metres. */
const UNITS_READ = new WeakSet<ResultLine>()
/** MSG-5: what is measured against a size, and so follows from a plan that may not be in metres. */
const SIZED = new Set(['plan/far-from-origin', 'wall/size-question', 'opening/size-question', 'room/size-question', 'floor/size-question', 'room/too-small', 'room/escape-window-too-small', 'room/escape-window-too-high', 'opening/wide-single-leaf'])

function issueLine(issue: Issue & { readonly hits?: readonly string[] }, names: Names): ResultLine {
  const { thing, also } = issueThing(issue)
  const at = names.thingOf(thing.kind, thing.id)
  const label = issue.code === 'plan/duplicate-id' ? name(issue.id) : at.label
  const subject: Subject = {
    ...blank(label),
    name: at.name,
    floorName: at.floor === null ? '' : names.floorName(at.floor),
    said: issue.said ?? oneLine(issue.message),
    also: [...also, ...(issue.hits ?? [])],
    floors: names.floors,
    ...(issue.code === 'opening/door-hits-item' ? { items: (issue.hits ?? []).map(names.itemName) } : {}),
    ...(issue.fixes ? { fixes: issue.fixes } : {})
  }
  const made = line(issue.code, issue.severity === 'error' ? 'left-out' : 'worth-a-look', thing, at.floor, subject, issue.fixes ? { fixes: issue.fixes } : {})
  if (issue.causedBy !== undefined) CAUSE_IDS.set(made, issue.causedBy)
  return made
}

/** A finding's code and the thing its line is about. */
function findingThing(finding: RuleFinding, wayOutNotDrawn: ReadonlySet<string>): { code: string; thing: Thing } {
  let code = FINDING_CODES[finding.code]
  if (finding.code === 'no_route_to_exit' && wayOutNotDrawn.has(finding.floor)) code = 'room/no-route-to-door-out'
  const thing: Thing =
    finding.code === 'no_exit' || finding.code === 'no_stair'
      ? { kind: 'floor', id: finding.floor }
      : finding.code === 'setback_short' || finding.code === 'over_boundary'
      ? { kind: 'plan', id: '' }
      : finding.code === 'flat_without_front_door' && finding.flat !== undefined
      ? { kind: 'flat', id: finding.flat }
      : (finding.code === 'door_to_undrawn_space' ||
          finding.code === 'door_between_homes' ||
          finding.code === 'door_to_outside_above_ground' ||
          finding.code === 'opening_below_ground' ||
          finding.code === 'opening_too_small_to_pass' ||
          finding.code === 'door_into_closed_court') &&
        finding.openings[0] !== undefined
      ? { kind: 'opening', id: finding.openings[0] }
      : { kind: 'room', id: finding.rooms[0] ?? '' }
  return { code, thing }
}

function findingSubject(finding: RuleFinding, names: Names, thing: Thing): Subject {
  const room = finding.rooms[0]
  return {
    ...blank(names.thingOf(thing.kind, thing.id).label),
    name: room === undefined ? names.floorName(finding.floor) : names.roomName(room),
    floorName: names.floorName(finding.floor),
    also: [...finding.rooms, ...finding.openings].filter((id) => id !== thing.id),
    names: finding.rooms.map(names.roomName),
    floors: names.floors,
    finding,
    said: finding.said ?? finding.message
  }
}

/**
 * MSG-17: the kind of line a plan check's finding is. A door to the outside above the ground is
 * listed as not checked: it is not taken as a way out, and where it leads (a balcony, an outside
 * stair) is not looked at.
 */
const findingKind = (finding: RuleFinding): LineKind => (finding.code === 'door_to_outside_above_ground' ? 'not-checked' : 'finding')

function findingLine(finding: RuleFinding, names: Names, wayOutNotDrawn: ReadonlySet<string>): ResultLine {
  const { code, thing } = findingThing(finding, wayOutNotDrawn)
  return line(code, findingKind(finding), thing, finding.floor, findingSubject(finding, names, thing), finding.figures ? { figures: finding.figures } : {})
}

/** MSG-5 (lab MS-14): the findings whose notes may stand as one line for several rooms. */
const GROUPED = new Set([
  'room/no-door',
  'room/no-route-out',
  'room/no-route-to-door-out',
  'opening/to-undrawn-space',
  'opening/door-out-above-ground',
  'opening/too-small-to-pass',
  'opening/into-closed-court',
  'room/too-small',
  'room/no-escape-opening',
  'room/escape-window-too-small',
  'room/escape-window-too-high'
])

/**
 * MSG-5 (lab MS-14): identical notes as one line. Findings of one code on one floor that say the
 * same in every word but the room's name (what was found, what is needed, the fix and the
 * figures) become one line that lists the rooms, in the order the check gave them; `each` and
 * `also` keep every id. Twelve hotel rooms with the same window are one line, not twelve.
 */
function groupedFindings(findings: readonly RuleFinding[], names: Names, wayOutNotDrawn: ReadonlySet<string>): ResultLine[] {
  const made = findings.map((finding) => ({ finding, line: findingLine(finding, names, wayOutNotDrawn) }))
  const groups = new Map<string, typeof made>()
  const order: (typeof made)[] = []
  for (const one of made) {
    const { line: l } = one
    if (!GROUPED.has(l.code) || l.fixes !== undefined) {
      order.push([one])
      continue
    }
    const key = JSON.stringify([l.code, l.floor, l.found, l.needed, l.fix, l.figures ?? null])
    const group = groups.get(key)
    if (group === undefined) {
      const fresh = [one]
      groups.set(key, fresh)
      order.push(fresh)
    } else group.push(one)
  }
  return order.map((group) => {
    if (group.length === 1) return group[0]!.line
    const first = group[0]!
    const { code, thing } = findingThing(first.finding, wayOutNotDrawn)
    const each = group.map((one) => one.line.thing)
    const also = [...new Set(group.flatMap((one) => [one.line.thing.id, ...one.line.also]))].filter((id) => id !== thing.id)
    const subject: Subject = { ...findingSubject(first.finding, names, thing), also, group: group.map((one) => findingSubject(one.finding, names, one.line.thing).name) }
    return line(code, findingKind(first.finding), thing, first.finding.floor, subject, { ...(first.line.figures ? { figures: first.line.figures } : {}), each })
  })
}

function noticeCode(notice: NotChecked): string {
  switch (notice.reason) {
    case 'no_stairs':
      return 'floor/not-checked-no-stairs'
    case 'way_out_not_drawn':
      return 'floor/not-checked-way-out-not-drawn'
    case 'way_out_through_common_parts':
      return 'floor/not-checked-way-out-common-parts'
    case 'cannot_be_drawn':
      return notice.rooms.length > 0 ? 'floor/not-checked-rooms-not-drawn' : 'floor/not-checked-doors-not-drawn'
    case 'no_use':
      return 'floor/not-checked-no-use'
    case 'no_figures_for_place':
      return notice.ruleId === 'habitable-room-area' ? 'plan/not-checked-sizes-for-place' : 'plan/not-checked-escapes-for-place'
    case 'above_escape_storeys':
      return 'floor/not-checked-above-escape-storeys'
    case 'no_rooms':
      return 'plan/not-checked-no-rooms'
    case 'boundary_not_measured':
      return 'plan/not-checked-boundary'
    case 'not_for_building': {
      const what = notice.ruleId === 'habitable-room-area' ? 'sizes' : 'escapes'
      return notice.floor === '' ? `plan/not-checked-${what}-for-building` : `floor/not-checked-${what}-for-building`
    }
  }
}

/**
 * MSG-5: what a held note was about, as a "could not be drawn" line's `found` says it: its key
 * (`line.part.held.*`), with `.one` or `.many` for one room or several. MSG-11: in the message files.
 */
const HELD_KEYS: Record<string, { readonly key: string; readonly many: boolean }> = {
  'floor/no-exit': { key: 'line.part.held.noExit', many: false },
  'room/no-door': { key: 'line.part.held.noDoor', many: true },
  'room/no-route-out': { key: 'line.part.held.routeOut', many: true },
  'room/no-route-to-door-out': { key: 'line.part.held.routeOut', many: true },
  'opening/to-undrawn-space': { key: 'line.part.held.undrawnSpace', many: true },
  'room/no-escape-opening': { key: 'line.part.held.noEscape', many: true },
  'room/escape-window-too-small': { key: 'line.part.held.escapeWindow', many: true },
  'room/escape-window-too-high': { key: 'line.part.held.escapeWindow', many: true }
}

/** The notes a "could not be drawn" notice holds back, as data and in words ('' when none). */
function heldNotes(notice: NotChecked, names: Names, wayOutNotDrawn: ReadonlySet<string>): { held: HeldNote[]; said: Value } {
  const held = (notice.held ?? []).map(({ finding, waitsFor }): HeldNote => {
    const { code, thing } = findingThing(finding, wayOutNotDrawn)
    const also = [...finding.rooms, ...finding.openings].filter((id) => id !== thing.id)
    return { code, thing, floor: finding.floor, also, waitsFor: [...waitsFor] }
  })
  // One phrase per code, its rooms (or floors) by name, in the order held.
  const byCode = new Map<string, string[]>()
  for (const [i, note] of held.entries()) {
    const finding = notice.held![i]!.finding
    const who = note.code === 'floor/no-exit' ? names.floorName(finding.floor) : names.roomName(finding.rooms[0] ?? note.thing.id)
    byCode.set(note.code, [...(byCode.get(note.code) ?? []), who])
  }
  if (byCode.size === 0) return { held, said: '' }
  const phrases = [...byCode].map(([code, list]): Value => {
    const named = joined([...new Set(list)].map(name), 'join.comma')
    const words = HELD_KEYS[code]
    if (words === undefined) return said('line.part.held.other', { names: named })
    const key = words.many ? `${words.key}.${list.length > 1 ? 'many' : 'one'}` : words.key
    return said(key as MessageKey, { names: named })
  })
  return { held, said: joined(phrases, 'join.semicolon') }
}

function noticeLine(notice: NotChecked, names: Names, country: string, wayOutNotDrawn: ReadonlySet<string> = new Set()): ResultLine {
  const thing: Thing = notice.floor === '' ? { kind: 'plan', id: '' } : { kind: 'floor', id: notice.floor }
  const { held, said: heldSaid } = heldNotes(notice, names, wayOutNotDrawn)
  const subject: Subject = {
    ...blank(names.thingOf(thing.kind, thing.id).label),
    name: notice.floor === '' ? '' : names.floorName(notice.floor),
    floorName: notice.floor === '' ? '' : names.floorName(notice.floor),
    also: [...notice.rooms, ...notice.openings],
    names: notice.rooms.map(names.roomName),
    floors: names.floors,
    country,
    notice,
    said: notice.message,
    heldSaid
  }
  return line(noticeCode(notice), 'not-checked', thing, notice.floor === '' ? null : notice.floor, subject, held.length > 0 ? { held } : {})
}

/** The stages of a check, by their words (`line.part.stage.*`). */
type Stage = 'reading' | 'drawing' | 'phases' | 'door' | 'plan' | 'firm' | 'writing' | 'site' | 'orientation' | 'marks' | 'taped' | 'accessible'

function checkFailed(stage: Stage, error: unknown): ResultLine {
  return line('plan/check-failed', 'not-checked', { kind: 'plan', id: '' }, null, {
    ...blank(THE_PLAN),
    // The error's own text is a program's, and stays as it is written.
    said: said('line.part.stopped', { stage: said(`line.part.stage.${stage}`), error: errorText(error) })
  })
}

/**
 * MSG-5 (lab W-7): each line that follows from another, filed under it. A drawing line names the
 * part it follows from by id (`validatePlan`'s `causedBy`); its cause is the first line about that
 * part, a part left out before one worth a look: the reader's line for a part it left out, the
 * drawing's for one it cannot draw, `plan/duplicate-id` for an id two walls share, the plan's own
 * line for `plan`. A line whose cause has no line of its own stays a problem of its own.
 */
function filed(lines: readonly ResultLine[]): ResultLine[] {
  const order = new Map(LINE_KINDS.map((kind, i) => [kind, i] as const))
  // Stable: lines of one kind keep the order their check gave them.
  const sorted = [...lines].sort((a, b) => order.get(a.kind)! - order.get(b.kind)!)
  const about = new Map<string, ResultLine>()
  for (const l of sorted) {
    if (l.kind !== 'left-out' && l.kind !== 'worth-a-look' && l.kind !== 'refused') continue
    const key = l.thing.kind === 'plan' ? (l.code === 'plan/duplicate-id' ? l.also[0] ?? null : 'plan') : l.thing.kind === 'floor' ? null : l.thing.id
    if (key !== null && !about.has(key)) about.set(key, l)
  }
  const causeOf = new Map<ResultLine, ResultLine>()
  for (const l of sorted) {
    const id = CAUSE_IDS.get(l)
    const cause = CAUSE_LINES.get(l) ?? (id === undefined ? undefined : about.get(id))
    if (cause !== undefined && cause !== l) causeOf.set(l, cause)
  }
  const under = new Map<ResultLine, ResultLine[]>()
  for (const l of sorted) {
    const cause = causeOf.get(l)
    if (cause !== undefined) under.set(cause, [...(under.get(cause) ?? []), l])
  }
  const out: ResultLine[] = []
  const placed = new Set<ResultLine>()
  const place = (l: ResultLine, cause: ResultLine | null): void => {
    if (placed.has(l)) return
    placed.add(l)
    out.push(cause === null ? l : { ...l, causedBy: causeId(cause) })
    for (const next of under.get(l) ?? []) place(next, l)
  }
  for (const l of sorted) if (!causeOf.has(l)) place(l, null)
  // A ring of causes has no first line: its lines stand as problems of their own.
  for (const l of sorted) place(l, null)
  return out
}

/** A line as a cause names it: its code, and the id of the part it is about. */
function causeId(l: ResultLine): Cause {
  return { code: l.code, id: l.thing.kind === 'plan' && l.code === 'plan/duplicate-id' ? l.also[0] ?? '' : l.thing.id }
}

function record(lines: readonly ResultLine[], read: boolean, report: RulesReport | null, taped: readonly TapedRow[] | null = null, firm: FirmInput | null = null): GridResult {
  const language = speaking.language
  const sorted = filed(lines)
  const counts = Object.fromEntries(LINE_KINDS.map((kind) => [kind, sorted.filter((l) => l.kind === kind).length])) as Record<LineKind, number>
  return {
    resultVersion: RESULT_VERSION,
    label: language === DEFAULT_LANGUAGE ? GENERAL_GUIDANCE_LABEL : say(language, 'label'),
    ...(language === DEFAULT_LANGUAGE ? {} : { language }),
    read,
    count: sorted.length,
    counts,
    problems: problemsIn(sorted),
    lines: sorted,
    basis: report?.basis ?? 'general-baseline',
    ...(report?.lookupNotice ? { lookupNotice: report.lookupNotice } : {}),
    checks: inLanguage(report?.rules ?? [], language),
    coverage: coverageIn(report?.coverage ?? [], language),
    figures: report?.figures ?? [],
    limits: limitsIn(report?.limits ?? [...PLAN_LIMITS, ...FIGURE_LIMITS], language),
    place: report?.place ?? null,
    ...(report?.withoutPlace ? { withoutPlace: report.withoutPlace } : {}),
    ...(taped === null ? {} : { taped }),
    ...(firm === null ? {} : { firm: firmUsed(firm) })
  }
}

/** MSG-5: the lines that follow from no other and are not `not-checked`: the problems to act on. */
export function problemsIn(lines: readonly ResultLine[]): number {
  return lines.filter((l) => l.causedBy === undefined && l.kind !== 'not-checked').length
}

/** MSG-11: a check's title by its id, in a language; as it is when Grid has no words for it. */
function titleIn(id: string, title: string, language: Language): string {
  const key = `check.title.${id}`
  return Object.hasOwn(en, key) ? say(language, key as MessageKey) : title
}

/** The checks run, their titles and the plan checks' source in the record's language. */
function inLanguage(rules: readonly Rule[], language: Language): readonly Rule[] {
  if (language === DEFAULT_LANGUAGE) return rules
  return rules.map((rule) => ({
    ...rule,
    title: titleIn(rule.id, rule.title, language),
    source: rule.source.kind === 'plan-sanity' ? { ...rule.source, label: say(language, 'check.source.planSanity') } : rule.source
  }))
}

/** What each check looked at, its title and its reasons in the record's language. */
function coverageIn(coverage: readonly CheckCoverage[], language: Language): readonly CheckCoverage[] {
  if (language === DEFAULT_LANGUAGE) return coverage
  return coverage.map((check) => ({
    ...check,
    title: titleIn(check.ruleId, check.title, language),
    skipped: check.skipped.map((skip) => (skip.said === undefined ? skip : withSentence({ ...skip, why: sayValue(language, skip.said, speaking.options) }, skip.said)))
  }))
}

/** What these checks never look at, in the record's language. */
function limitsIn(limits: readonly string[], language: Language): readonly string[] {
  if (language === DEFAULT_LANGUAGE) return limits
  const english = [...PLAN_LIMITS, ...FIGURE_LIMITS]
  const keys = [...PLAN_LIMIT_KEYS, ...FIGURE_LIMIT_KEYS]
  return limits.map((limit) => (english.indexOf(limit) === -1 ? limit : say(language, keys[english.indexOf(limit)]!)))
}

/**
 * COD-8: the firm's own standards as lines: each part measured short of the firm's figure is a
 * finding with its `firm/` code, after the code figures' findings, and a file that could not be
 * read is one `firm/not-read` line. The firm's figures are not tied to a place, so they are set
 * against the plan whatever place it states, or none.
 */
function firmLines(firm: FirmInput, names: Names): ResultLine[] {
  if (firm.problem !== null) {
    return [line('firm/not-read', 'not-checked', { kind: 'plan', id: '' }, null, { ...blank(name(firm.file)), said: firm.problem, floors: names.floors, firm: { value: 0, name: null, file: firm.file, measured: null, said: '' } })]
  }
  const out: ResultLine[] = []
  for (const measured of firm.measured) {
    const standard = firm.standards[measured.standard]
    if (standard === undefined || !firmShort(measured, standard)) continue
    const at = names.thingOf(measured.thing.kind, measured.thing.id)
    const unit = FIRM_MEASURES[standard.measure].unit
    out.push(
      line(FIRM_MEASURES[standard.measure].code, 'finding', measured.thing, measured.floor ?? at.floor, {
        ...blank(at.label),
        name: at.name,
        floorName: at.floor === null ? '' : names.floorName(at.floor),
        also: [...measured.also],
        floors: names.floors,
        // MSG-11: where it was measured by key when the caller gives it, else its text.
        firm: { value: standard.value, name: standard.name, file: firm.file, note: standard.note, measured: measured.measured, said: measured.sentence ?? measured.said }
      }, { firm: { standard: measured.standard, measure: standard.measure, value: standard.value, unit, name: standard.name, note: standard.note, file: firm.file } })
    )
  }
  return out
}

/** Every line about a plan that was read. */
function inspectRead(read: Extract<Read, { plan: FloorPlan }>, inspectOptions: InspectOptions): GridResult {
  const { firm, ...options } = inspectOptions
  // LVL-8: the checks read the plain openings a pattern expands into, so a window placed by a
  // pattern counts for escape like one placed by hand. The drawing check reads the plan as stated,
  // and says first what kept any pattern's openings from being placed (`validatePlan`).
  // CNT-10: a fit-out is read with its base's walls and openings, as existing. The drawing check
  // reads both states of a plan with phases; every other check, the building after the work.
  const stated = options.base === undefined ? read.plan : mergeBase(read.plan, withPatterns(options.base)).plan
  const whole = withPatterns(stated)
  const plan = planInState(whole, 'after')
  const lines: ResultLine[] = [...read.lines]
  const names = namesOf(whole, stated)
  const stage = (name: Stage, body: () => void): void => {
    try {
      body()
    } catch (error) {
      lines.push(checkFailed(name, error))
    }
  }
  // What the file says that Grid does not read leads the lines of its kind: it may explain them.
  stage('reading', () => {
    lines.push(...readingLines(read.raw, readingNotes(read.raw), names))
  })
  stage('drawing', () => {
    lines.push(...validatePlan(stated, undefined, { leftOutWalls: read.leftOutWalls, leftOutParts: read.leftOut }).issues.map((issue) => issueLine(issue, names)))
  })
  // CNT-10: which state the checks read, and what the plan's work holds.
  stage('phases', () => {
    if (!planHasPhases(whole)) return
    const counts = phaseCounts(whole)
    const parts = (n: { walls: number; openings: number; rooms: number }): number => n.walls + n.openings + n.rooms
    const work = { existing: parts(counts.existing), demolished: parts(counts.demolished), new: parts(counts.new) }
    const what = whole.base === undefined ? said('line.part.work', work) : said('line.part.work.base', { ...work, base: name(whole.base) })
    lines.push(line('plan/read-after-work', 'not-checked', { kind: 'plan', id: '' }, null, { ...blank(THE_PLAN), floors: names.floors, said: what }))
  })
  stage('door', () => {
    const seen = new Set<string>()
    const checked = checkDoorSweeps(plan, (opening) => opening)
    for (const issue of checked.issues) {
      const key = `${issue.code}|${issue.id}|${issue.hits.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(issueLine(issue, names))
    }
    // CNT-14: the doors whose swing the plan does not state, floor by floor, as not checked.
    for (const { floor, doors } of checked.notChecked) {
      lines.push(
        line('floor/not-checked-door-swings', 'not-checked', { kind: 'floor', id: floor }, floor, {
          ...blank(names.thingOf('floor', floor).label),
          name: names.floorName(floor),
          floorName: names.floorName(floor),
          also: doors,
          floors: names.floors
        })
      )
    }
  })
  let report: RulesReport | null = null
  stage('plan', () => {
    // MSG-5: with what the reader left out, so a note that rests on it is held back.
    report = checkLocalRules(plan, { ...options, leftOut: read.leftOut })
    // CNT-6: a floor whose way out goes on through the common parts words its cut-off rooms so too.
    const wayOutNotDrawn = new Set(report.notChecked.filter((n) => n.reason === 'way_out_not_drawn' || n.reason === 'way_out_through_common_parts').map((n) => n.floor))
    // COD-3: the place by Grid's name for it, never the text it was given.
    // MSG-11: in English with its article (`the United States`); in another language by Grid's name for it.
    const country = report.place === null ? '' : speaking.language === DEFAULT_LANGUAGE ? countryInText(report.place.country) : countryName(report.place.country)
    lines.push(...groupedFindings(report.findings, names, wayOutNotDrawn))
    // LVL-14: a floor with no stair at all is a finding, which says why its way out was not
    // followed; the notice stays in the report (the coverage reads it) but is not a line beside it.
    const noStair = new Set(report.findings.filter((f) => f.code === 'no_stair').map((f) => f.floor))
    const notices = report.notChecked.filter((notice) => !(notice.reason === 'no_stairs' && noStair.has(notice.floor)))
    lines.push(...notices.map((notice) => noticeLine(notice, names, country, wayOutNotDrawn)))
  })
  // COD-8: the firm's own standards, after the code figures' findings, apart from them.
  if (firm !== undefined) {
    stage('firm', () => {
      lines.push(...firmLines(firm, names))
    })
  }
  // SHT-7: what is written on the drawing. The sketch is drawn and never measured or checked,
  // and the record says so, floor by floor. A note in a room the plan lacks is not drawn.
  stage('writing', () => {
    const byFloor = new Map<string, NonNullable<FloorPlan['sketch']>>()
    for (const item of plan.sketch ?? []) byFloor.set(floorOf(item), [...(byFloor.get(floorOf(item)) ?? []), item])
    for (const [floor, items] of byFloor) {
      const label = names.thingOf('floor', floor).label
      const categories = [...new Set(items.map((item) => item.category))]
      lines.push(
        line('floor/sketch-drawn-only', 'not-checked', { kind: 'floor', id: floor }, floor, {
          ...blank(label),
          name: names.floorName(floor),
          floorName: names.floorName(floor),
          said: said(items.length === 1 ? 'line.part.sketch.one' : 'line.part.sketch.many', { count: items.length }),
          also: items.map((item) => item.id),
          names: categories,
          floors: names.floors
        })
      )
    }
    const rooms = new Set(whole.rooms.map((room) => room.id))
    for (const note of plan.annotations ?? []) {
      if (note.room === undefined || rooms.has(note.room)) continue
      lines.push(line('plan/note-no-place', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(name(note.id)), also: [note.id, note.room], floors: names.floors, said: said('line.part.noteRoom', { room: note.room }) }))
    }
  })
  // BRF-3: the site's things are drawn only, and the record says so once.
  stage('site', () => {
    const things = plan.site?.things ?? []
    if (things.length === 0) return
    lines.push(
      line('plan/site-things-drawn-only', 'not-checked', { kind: 'plan', id: '' }, null, {
        ...blank(THE_PLAN),
        said: siteThingsSaid(things),
        also: things.map((thing) => thing.id),
        floors: names.floors
      })
    )
  })
  // CNT-3: a front that names no outside part, and a plan whose y runs down the page.
  stage('orientation', () => {
    if (plan.yAxis === 'down') lines.push(line('plan/y-down', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(THE_PLAN), floors: names.floors }))
    const front = plan.front === undefined ? null : planFacing(plan).front
    if (front === null || !('missing' in front)) return
    const label = said(front.part === 'wall' ? 'thing.inner.wall' : 'thing.inner.opening', { id: name(front.id) })
    const why = said(front.missing === 'no-such-part' ? 'line.part.front.missing' : front.part === 'wall' ? 'line.part.front.wall' : 'line.part.front.opening')
    lines.push(line('plan/front-not-said', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also: [front.id], floors: names.floors, said: why }))
  })
  // WRT-6 (lab WR-15): what the plan marks assumed, for the person to confirm, and a mark that
  // names a part the plan no longer has.
  stage('marks', () => {
    for (const mark of marksWithNoPart(whole)) {
      const label = noun(mark.part, mark.id)
      lines.push(line('plan/mark-no-part', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also: [mark.id], floors: names.floors, ...(mark.value ? { word: valueWord(mark.value) } : {}) }))
    }
    for (const value of assumedValues(whole)) {
      const at = names.thingOf(value.part, value.id)
      lines.push(
        line('plan/value-assumed', 'to-confirm', { kind: value.part, id: value.id }, at.floor, {
          ...blank(at.label),
          name: at.name,
          floorName: at.floor === null ? '' : names.floorName(at.floor),
          floors: names.floors,
          said: value.tolerance === null ? '' : said('line.part.giveOrTake', { tolerance: num(String(value.tolerance)) }),
          ...(value.value ? { word: valueWord(value.value) } : {})
        })
      )
    }
  })
  // HND-11 (lab WR-14): each length taped on site against the drawing. One that differs, or that
  // cannot be measured, is a line; the whole table rides on the record.
  let taped: readonly TapedRow[] | null = null
  stage('taped', () => {
    if ((plan.taped ?? []).length === 0) return
    taped = tapedLengths(plan)
    for (const row of taped) {
      if (row.state === 'agrees') continue
      const room = names.thingOf('room', row.room)
      const also = [...new Set([row.room, ...row.walls])]
      if (row.state === 'differs') {
        lines.push(line('room/taped-differs', 'worth-a-look', { kind: 'room', id: row.room }, room.floor, { ...blank(room.label), name: room.name, floorName: room.floor === null ? '' : names.floorName(room.floor), also: row.walls, floors: names.floors, taped: row }))
      } else {
        const label = row.missing === 'no-room' ? said('issue.part.named.room', { id: name(row.room) }) : room.label
        lines.push(line('plan/taped-not-measured', 'worth-a-look', { kind: 'plan', id: '' }, null, { ...blank(label), also, floors: names.floors, said: tapedMissingSaid(row) ?? '', taped: row }))
      }
    }
  })
  // CNT-17 (lab EL-15): what the plan marks as needing to be accessible is measured by
  // grid_measure what=access, never checked here: no figure for it has been confirmed.
  stage('accessible', () => {
    const rooms = plan.accessible?.rooms ?? []
    const routes = plan.accessible?.routes ?? []
    if (rooms.length === 0 && routes.length === 0) return
    const count = (n: number, part: 'room' | 'route'): Value => said(`line.part.accessCount.${part}.${n === 1 ? 'one' : 'many'}`, { count: n })
    const what = joined([...(rooms.length > 0 ? [count(rooms.length, 'room')] : []), ...(routes.length > 0 ? [count(routes.length, 'route')] : [])], 'join.and')
    const marked = [...new Set([...rooms, ...routes.flatMap((r) => [r.to, ...(r.from === undefined ? [] : [r.from])])])]
    lines.push(line('plan/not-checked-access', 'not-checked', { kind: 'plan', id: '' }, null, { ...blank(THE_PLAN), also: marked, floors: names.floors, said: what }))
  })
  // MSG-5: a plan that may not be in metres (`plan/units-question`): what is measured against a
  // size follows from it, and it follows from the unit the plan states, which is read as metres.
  const units = lines.find((l) => l.code === 'plan/units-question')
  if (units !== undefined) {
    const stated = lines.find((l) => UNITS_READ.has(l))
    if (stated !== undefined) CAUSE_LINES.set(units, stated)
    for (const l of lines) if (SIZED.has(l.code)) CAUSE_LINES.set(l, units)
  }
  return record(lines, true, report, taped, firm ?? null)
}

/** WRT-6: a marked value as a line names it: a field with words of its own (`line.part.value.*`), else the field as the format names it. */
const VALUE_WORDS: Readonly<Record<string, MessageKey>> = {
  floorOffset: 'line.part.value.floorOffset',
  at: 'line.part.value.at',
  start: 'line.part.value.start',
  end: 'line.part.value.end',
  turn: 'line.part.value.turn'
}
const valueWord = (field: string): Value => (Object.hasOwn(VALUE_WORDS, field) ? said(VALUE_WORDS[field]!) : field)

/**
 * Reads a plan and runs every check on it. Never throws.
 *
 * `raw` is the plan as parsed JSON, or its text. A plan the format refuses gives a record with
 * `read: false` whose lines say where and why; nothing else is checked then.
 */
export function inspectPlan(raw: unknown, options: InspectOptions = {}): GridResult {
  const before = speaking
  speaking = { language: options.language ?? DEFAULT_LANGUAGE, options: options.decimal === undefined ? {} : { decimal: options.decimal } }
  try {
    const read = readPlan(raw)
    if (read.plan === null) return record(read.lines, false, null)
    return inspectRead(read, options)
  } catch (error) {
    return record([checkFailed('reading', error)], false, null)
  } finally {
    speaking = before
  }
}

/**
 * The options of the full check, and MSG-11's language: the record's words are said in it
 * (English when not given; its messages must be loaded, `loadLanguage`), with its decimal mark
 * unless `decimal` chooses one. The codes, the values and everything else are the same in every
 * language.
 */
export interface InspectOptions extends CheckOptions {
  readonly language?: Language
  readonly decimal?: 'point' | 'comma'
  /** COD-8: the firm's own standards beside the plan, measured. */
  readonly firm?: FirmInput
}
