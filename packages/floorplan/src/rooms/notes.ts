/**
 * Writing on the drawing and the sketch layer in rooms text and through the tools (SHT-22): one
 * reading of their words, so a rooms text line and `grid_annotate` place the same thing.
 *
 *   note "<text>" at x,y | in <room>          words on the drawing, at a point or in a room
 *   tag "<text>" at x,y | in <room>           short words in a box: "you are here", "FE"
 *   symbol north|entrance at x,y | in <room> [turn <degrees>] ["<label>"]
 *   key [at x,y]                              the drawing's key; under the drawing with no at
 *   route [<category>] x,y x,y ...            a line drawn with an arrowhead at its end: the way out
 *   sketch line <category> x,y x,y ...        a line through two or more points
 *   sketch shape <category> x,y x,y x,y ...   a closed shape
 *   sketch rect <category> x,y x,y            two opposite corners
 *   sketch arc <category> at x,y radius <m> start <degrees> end <degrees>
 *   sketch text <category> at x,y "<text>"
 *   raw note {...}   raw sketch {...}         Grid's own JSON for one, taken as it is
 *
 * Each line may end with `on <floor>` and `id <id>`. With no `on`, a line written under a `floor`
 * line is on that floor, and one before any is on the ground floor (C5); a note in a room is on
 * its room's floor. With no `id`, Grid gives `<kind>-<n>` (`note-1`, `tag-2`, `route-1`, `sketch-3`),
 * the next one free. A `category` is the author's word for what a sketch item is (`garden`,
 * `exit`): it names its layer in an export and its entry in the drawing's key.
 *
 * The plan format has no arrow, and a sketch is drawn as it is written: a route is a sketch line
 * whose last three points draw its head, a V at its end (`routeHead`), so every drawing and export
 * shows it. The read-back finds a route by working its head out again (`routeShaft`).
 *
 * Nothing here is measured or checked: writing on the drawing is drawn and exported only.
 *
 * Pure: words in, the plan's `annotations` and `sketch` out, or the reason there are none.
 */
import { AnnotationSchema, ANNOTATION_KINDS, ANNOTATION_SYMBOLS, DEFAULT_FLOOR_ID, SKETCH_KINDS, SketchItemSchema, type Annotation, type AnnotationKind, type FloorPlan, type SketchItem, type SketchKind } from '../types/floorplan'
import { planFloors, floorOf } from '../geometry/floors'
import { plainId } from '../types/planText'
import { isPointWord, metres, numberOf, pointOf, quotedWordsOf, RoomsStop, type LineWord, type PlainNumbers, PLAIN_METRES } from './words'

type P = readonly [number, number]

/** The first words of the lines this file reads. `arrow` is read as `route`. */
export const NOTE_LINE_WORDS: readonly string[] = ['note', 'tag', 'symbol', 'key', 'sketch', 'route', 'arrow']

/** What a line or a call may place: an annotation's kind, a sketch item's, or a route. */
export const NOTE_KINDS = [...ANNOTATION_KINDS, 'route', ...SKETCH_KINDS] as const
export type NoteKind = AnnotationKind | SketchKind | 'route'

/** The category a route takes when it names none. */
export const ROUTE_CATEGORY = 'route'

/** The longest a route's head is, along the route, in metres: a drawing size, never measured. */
const HEAD_LENGTH = 0.4
/** How far each side of a route's head opens from the route, in degrees. */
const HEAD_OPENS = 28

/** What a line or a tool says about one thing on the drawing: every field left out when not said. */
export interface NoteWords {
  readonly kind: NoteKind
  readonly id?: string
  readonly text?: string
  readonly symbol?: string
  readonly at?: P
  readonly room?: string
  readonly floor?: string
  readonly turn?: number
  readonly points?: readonly P[]
  readonly category?: string
  readonly radius?: number
  readonly start?: number
  readonly end?: number
}

/** Why words place nothing, in a sentence that names what to write instead. */
export class NoteRefused extends Error {
  override readonly name = 'NoteRefused'
}

/** A note on the lines, as the compiler records its others. */
export interface NoteNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

const isAnnotationKind = (kind: NoteKind): kind is AnnotationKind => (ANNOTATION_KINDS as readonly string[]).includes(kind)

/** `line N: ` in front of a message, or nothing when the words come from a tool (`at` 0). */
const lead = (at: number): string => (at > 0 ? `line ${at}: ` : '')
const stop = (at: number, message: string): never => {
  throw new RoomsStop('rooms/note', `${lead(at)}${message}`, at > 0 ? at : null)
}

/** How each kind's line is written. */
const USAGE: Readonly<Record<NoteKind, string>> = {
  note: `note "<text>" at x,y | in <room> [on <floor>] [id <id>]`,
  tag: `tag "<text>" at x,y | in <room> [on <floor>] [id <id>]`,
  symbol: `symbol ${ANNOTATION_SYMBOLS.join('|')} at x,y | in <room> [turn <degrees>] ["<label>"] [on <floor>] [id <id>]`,
  key: 'key [at x,y] [on <floor>] [id <id>]',
  route: 'route [<category>] x,y x,y ... [on <floor>] [id <id>]',
  line: 'sketch line <category> x,y x,y ... [on <floor>] [id <id>]',
  shape: 'sketch shape <category> x,y x,y x,y ... [on <floor>] [id <id>]',
  rect: 'sketch rect <category> x,y x,y [on <floor>] [id <id>]',
  arc: 'sketch arc <category> at x,y radius <m> start <degrees> end <degrees> [on <floor>] [id <id>]',
  text: 'sketch text <category> at x,y "<text>" [on <floor>] [id <id>]',
}

/** The words a line takes before a value. */
const VALUE_WORDS = new Set(['at', 'in', 'on', 'id', 'turn', 'radius', 'start', 'end'])

/** Degrees, a plain number. */
function degreesOf(word: string | undefined, at: number, usage: string): number {
  const value = Number((word ?? '').replace(/°$/, ''))
  if (word === undefined || word.trim() === '' || !Number.isFinite(value)) return stop(at, `expected degrees, a plain number. Write '${usage}'.`)
  return value
}

/** One line's words, its first word among them, into what it says. */
export function noteOfWords(words: readonly LineWord[], at = 0, plain: PlainNumbers = PLAIN_METRES): NoteWords {
  const first = words[0]?.text
  let i = 1
  let kind: NoteKind
  let category: string | undefined
  if (first === 'sketch') {
    const what = words[1]?.text
    if (what === undefined || !(SKETCH_KINDS as readonly string[]).includes(what)) return stop(at, `a sketch line says what it is: ${SKETCH_KINDS.map((k) => `'${USAGE[k]}'`).join(', ')}.`)
    kind = what as SketchKind
    const named = words[2]
    if (named === undefined || named.quoted || isPointWord(named.text) || VALUE_WORDS.has(named.text)) return stop(at, `a sketch ${kind} names its category, the author's word for what it is (garden, street, fence), after '${kind}'. Write '${USAGE[kind]}'.`)
    category = named.text
    i = 3
  } else if (first === 'route' || first === 'arrow') {
    kind = 'route'
    const named = words[1]
    if (named !== undefined && !named.quoted && !isPointWord(named.text) && !VALUE_WORDS.has(named.text)) {
      category = named.text
      i = 2
    }
  } else if (first !== undefined && (ANNOTATION_KINDS as readonly string[]).includes(first)) {
    kind = first as AnnotationKind
  } else return stop(at, `a line of writing on the drawing starts with one of: ${NOTE_LINE_WORDS.join(', ')}.`)
  const usage = USAGE[kind]
  const out: { -readonly [K in keyof NoteWords]?: NoteWords[K] } = { kind, ...(category === undefined ? {} : { category }) }
  const points: P[] = []
  const once = (key: keyof NoteWords, word: string): void => {
    if (out[key] !== undefined) stop(at, `'${word}' is written twice. Write '${usage}'.`)
  }
  while (i < words.length) {
    const w = words[i]!
    if (w.quoted) {
      once('text', 'the text in quotes')
      out.text = w.text
      i++
      continue
    }
    if (isPointWord(w.text)) {
      if (kind === 'note' || kind === 'tag' || kind === 'symbol' || kind === 'key' || kind === 'arc' || kind === 'text') stop(at, `a ${kind} is placed by 'at x,y', not by a point on its own. Write '${usage}'.`)
      points.push(pointOf(w.text, at, plain))
      i++
      continue
    }
    if (kind === 'symbol' && out.symbol === undefined && (ANNOTATION_SYMBOLS as readonly string[]).includes(w.text)) {
      out.symbol = w.text
      i++
      continue
    }
    const value = words[i + 1]
    if (VALUE_WORDS.has(w.text) && value !== undefined) {
      const key = w.text
      if (key === 'at') {
        once('at', 'at')
        out.at = pointOf(value.text, at, plain)
      } else if (key === 'in') {
        once('room', 'in')
        out.room = value.text
      } else if (key === 'on') {
        once('floor', 'on')
        out.floor = value.text
      } else if (key === 'id') {
        once('id', 'id')
        out.id = value.text
      } else if (key === 'radius') {
        once('radius', 'radius')
        out.radius = numberOf(value.text, at, plain)
      } else {
        once(key as 'turn' | 'start' | 'end', key)
        out[key as 'turn' | 'start' | 'end'] = degreesOf(value.text, at, usage)
      }
      i += 2
      continue
    }
    return stop(at, `'${w.text}' is not understood on a ${kind} line. Write '${usage}'.`)
  }
  if (points.length > 0) out.points = points
  return out as NoteWords
}

/** One line of rooms text into what it says: for a tool that takes lines (`at` 0). */
export function noteOfLine(line: string, at = 0, plain: PlainNumbers = PLAIN_METRES): NoteWords {
  return noteOfWords(quotedWordsOf(line, at), at, plain)
}

const settled = (value: number): number => {
  const r = Math.round(value * 10000) / 10000
  return Object.is(r, -0) ? 0 : r
}
const samePoint = (a: P, b: P): boolean => a[0] === b[0] && a[1] === b[1]

/**
 * The three points that draw a route's head after its last point: one side of the V, the tip
 * again, the other side. The head points back along the last leg, at most `HEAD_LENGTH` long and
 * at most half that leg. Null when the route's last two points are the same.
 */
export function routeHead(shaft: readonly P[]): P[] | null {
  const tip = shaft.at(-1)
  const from = [...shaft].reverse().find((p) => tip !== undefined && !samePoint(p, tip))
  if (tip === undefined || from === undefined) return null
  const dx = from[0] - tip[0]
  const dy = from[1] - tip[1]
  const leg = Math.hypot(dx, dy)
  const length = Math.min(HEAD_LENGTH, leg / 2)
  const side = (sign: number): P => {
    const a = Math.atan2(dy, dx) + (sign * HEAD_OPENS * Math.PI) / 180
    return [settled(tip[0] + length * Math.cos(a)), settled(tip[1] + length * Math.sin(a))]
  }
  return [side(1), tip, side(-1)]
}

/** A sketch line's route, without its head, when its last three points are the head `routeHead` draws; null for any other line. */
export function routeShaft(item: Pick<SketchItem, 'kind' | 'points'>): P[] | null {
  const points = item.points ?? []
  if (item.kind !== 'line' || points.length < 5) return null
  const shaft = points.slice(0, -3) as P[]
  const head = routeHead(shaft)
  if (head === null) return null
  return head.every((p, k) => samePoint(p, points[points.length - 3 + k] as P)) ? shaft : null
}

/** The prefix of the id Grid gives words that name none: the kind, `route`, or `sketch`. */
const wordsPrefix = (words: NoteWords): string => (isAnnotationKind(words.kind) || words.kind === 'route' ? words.kind : 'sketch')

/** The prefix a part's words would have: a route is a sketch line with its head. */
const partPrefix = (part: Annotation | SketchItem): string => (isAnnotation(part) ? part.kind : routeShaft(part) !== null ? 'route' : 'sketch')

/**
 * The ids, in order, of parts that may name none: each named one keeps its own, and each other
 * takes `<prefix>-<n>`, `n` one more than the parts of its prefix before it, or the next free.
 */
export function givenIds(parts: readonly { readonly prefix: string; readonly id?: string }[]): string[] {
  const taken = new Set(parts.flatMap((p) => (p.id === undefined ? [] : [p.id])))
  const before = new Map<string, number>()
  return parts.map((p) => {
    const n = (before.get(p.prefix) ?? 0) + 1
    before.set(p.prefix, n)
    if (p.id !== undefined) return p.id
    let k = n
    while (taken.has(`${p.prefix}-${k}`)) k++
    const id = `${p.prefix}-${k}`
    taken.add(id)
    return id
  })
}

/** What placing is checked against: the plan's rooms and floors. */
export interface NotePlace {
  readonly rooms: ReadonlyMap<string, string>
  readonly floors: readonly string[]
}

/** The rooms (with their floors) and floors a plan has, for `notePart`. */
export function notePlaceOf(plan: Pick<FloorPlan, 'rooms' | 'floors' | 'walls'>): NotePlace {
  return { rooms: new Map(plan.rooms.map((r) => [r.id, floorOf(r)])), floors: planFloors(plan as FloorPlan).map((f) => f.id) }
}

const listed = (ids: readonly string[]): string => `${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ` and ${ids.length - 20} more` : ''}`

/**
 * One thing on the drawing as the plan file holds it, from its words and its id. `blockFloor` is
 * the floor a line is written under (null for a tool, or before any `floor` line). Refused,
 * naming what to write, when the words do not place it or the schema would not read it.
 */
export function notePart(words: NoteWords, id: string, place: NotePlace, blockFloor: string | null = null): Annotation | SketchItem {
  const usage = USAGE[words.kind]
  const refuse = (message: string): never => {
    throw new NoteRefused(`${message} Write '${usage}'.`)
  }
  if (words.room !== undefined && !place.rooms.has(words.room)) refuse(`the plan has no room '${words.room}'${place.rooms.size === 0 ? '' : `: its rooms are ${listed([...place.rooms.keys()])}`}.`)
  const floor = words.floor ?? (words.room === undefined ? (blockFloor ?? undefined) : undefined)
  if (floor !== undefined && !place.floors.includes(floor)) refuse(`the plan has no floor '${floor}': its floors are ${listed(place.floors)}.`)
  if (floor === undefined && words.room === undefined && !place.floors.includes(DEFAULT_FLOOR_ID)) refuse(`the plan has no ground floor to put it on: say which floor with on, one of ${listed(place.floors)}.`)
  // C5: the ground floor is the one a part that states none is on, so it is never written.
  const stated = floor === undefined || floor === DEFAULT_FLOOR_ID ? {} : { floor }
  const record: Record<string, unknown> = { id }
  if (isAnnotationKind(words.kind)) {
    for (const key of ['points', 'category', 'radius', 'start', 'end'] as const) if (words[key] !== undefined) refuse(`a ${words.kind} takes no ${key}.`)
    if (words.kind !== 'symbol' && words.symbol !== undefined) refuse(`only a symbol takes ${words.symbol}.`)
    if (words.kind !== 'symbol' && words.turn !== undefined) refuse(`only a symbol is turned.`)
    if (words.at !== undefined && words.room !== undefined) refuse(`a ${words.kind} is placed at a point or in a room, not both.`)
    if (words.kind !== 'key' && words.at === undefined && words.room === undefined) refuse(`a ${words.kind} needs its place: at x,y, or in a room.`)
    if ((words.kind === 'note' || words.kind === 'tag') && (words.text ?? '').trim() === '') refuse(`a ${words.kind} needs its text, in quotes.`)
    if (words.kind === 'symbol' && words.symbol === undefined) refuse(`a symbol says which: ${ANNOTATION_SYMBOLS.join(' or ')}.`)
    Object.assign(record, { kind: words.kind }, words.text === undefined ? {} : { text: words.text }, words.symbol === undefined ? {} : { symbol: words.symbol })
    Object.assign(record, words.at === undefined ? {} : { at: [words.at[0], words.at[1]] }, words.room === undefined ? {} : { room: words.room }, words.room !== undefined && words.floor === undefined ? {} : stated)
    if (words.turn !== undefined) record['turn'] = words.turn
    return checked(AnnotationSchema, record, words.kind) as Annotation
  }
  if (words.room !== undefined) refuse(`a sketch ${words.kind === 'route' ? 'route' : words.kind} is placed by its points, not in a room.`)
  if (words.symbol !== undefined || words.turn !== undefined) refuse(`a sketch ${words.kind} takes no ${words.symbol !== undefined ? 'symbol' : 'turn'}.`)
  const points = words.points ?? []
  const kind: SketchKind = words.kind === 'route' ? 'line' : words.kind
  Object.assign(record, { kind, category: words.category ?? (words.kind === 'route' ? ROUTE_CATEGORY : refuse(`a sketch ${words.kind} names its category.`)) }, stated)
  if (words.kind === 'route' || kind === 'line' || kind === 'shape') {
    const least = kind === 'shape' ? 3 : 2
    if (words.at !== undefined || words.radius !== undefined || words.start !== undefined || words.end !== undefined) refuse(`a ${words.kind} is drawn through its points only.`)
    if (points.length < least) refuse(`a ${words.kind} needs ${least} points or more, each x,y.`)
    if (words.kind === 'route') {
      if (words.text !== undefined) refuse('a route takes no text: place a note or a tag beside it.')
      const head = routeHead(points)
      if (head === null) refuse('a route needs two different points at its end, for its arrowhead.')
      record['points'] = [...points, ...head!].map((p) => [p[0], p[1]])
    } else {
      if (words.text !== undefined) refuse(`a sketch ${kind} takes no text: write a sketch text beside it.`)
      record['points'] = points.map((p) => [p[0], p[1]])
    }
  } else if (kind === 'rect') {
    if (points.length !== 2 || words.at !== undefined) refuse('a sketch rect is two opposite corners, each x,y.')
    record['from'] = [points[0]![0], points[0]![1]]
    record['to'] = [points[1]![0], points[1]![1]]
  } else if (kind === 'arc') {
    if (words.at === undefined || words.radius === undefined || words.start === undefined || words.end === undefined) refuse('a sketch arc needs at, its centre, its radius, and start and end, in degrees counter-clockwise from east.')
    Object.assign(record, { at: [words.at![0], words.at![1]], radius: words.radius, start: words.start, end: words.end })
  } else {
    if (words.at === undefined || (words.text ?? '').trim() === '') refuse('a sketch text needs at x,y and its text, in quotes.')
    Object.assign(record, { at: [words.at![0], words.at![1]], text: words.text })
  }
  return checked(SketchItemSchema, record, words.kind) as SketchItem
}

/** The record read by its schema; refused with the schema's first word on it. */
function checked(schema: typeof AnnotationSchema | typeof SketchItemSchema, record: Record<string, unknown>, kind: NoteKind): unknown {
  const read = schema.safeParse(record)
  if (read.success) return read.data
  const issue = read.error.issues[0]!
  throw new NoteRefused(`the ${kind} would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}. Write '${USAGE[kind]}'.`)
}

/** Whether a part is writing on the drawing (an annotation) rather than a sketch item. */
export const isAnnotation = (part: Annotation | SketchItem): part is Annotation => (ANNOTATION_KINDS as readonly string[]).includes(part.kind)

const point = (p: readonly number[]): string => `${metres(p[0]!)},${metres(p[1]!)}`
/** A word as rooms text reads it back unchanged: plain letters, no space and no quote. */
const plainWord = (word: string): boolean => /^[a-z0-9][a-z0-9._-]*$/.test(word) && !VALUE_WORDS.has(word) && plainId(word) === word
const quote = (text: string): string => (!text.includes('"') ? `"${text}"` : !text.includes("'") ? `'${text}'` : `"${text.replace(/"/g, '\\"')}"`)
const word = (text: string): string => (plainWord(text) ? text : quote(text))

/** Where a part is, in words: at a point, in a room, through its points. */
export function notePlaceText(part: Annotation | SketchItem): string {
  if (isAnnotation(part)) return part.at !== undefined ? `at ${point(part.at)}` : part.room !== undefined ? `in ${part.room}` : 'under the drawing'
  const shaft = routeShaft(part)
  if (shaft !== null) return `from ${point(shaft[0]!)} to ${point(shaft.at(-1)!)}${shaft.length > 2 ? `, ${shaft.length - 1} legs` : ''}`
  if (part.kind === 'rect') return `from ${point(part.from!)} to ${point(part.to!)}`
  if (part.kind === 'arc' || part.kind === 'text') return `at ${point(part.at!)}`
  return `through ${part.points!.length} points`
}

/** What a part is, in a few words: `tag "You are here"`, `route exit`, `sketch line garden`. */
export function noteWhat(part: Annotation | SketchItem): string {
  if (isAnnotation(part)) return [part.kind, ...(part.symbol === undefined ? [] : [part.symbol]), ...(part.text === undefined ? [] : [quote(part.text)])].join(' ')
  if (routeShaft(part) !== null) return part.category === ROUTE_CATEGORY ? 'route' : `route ${part.category}`
  return `sketch ${part.kind} ${part.category}${part.kind === 'text' && part.text !== undefined ? ` ${quote(part.text)}` : ''}`
}

/** One part as its line, its floor and id written as `on` and `id` say. */
function partLine(part: Annotation | SketchItem, on: string | null, id: string | null): string {
  const tail = [...(on === null ? [] : [`on ${word(on)}`]), ...(id === null ? [] : [`id ${word(id)}`])]
  if (isAnnotation(part)) {
    const words: string[] = [part.kind]
    if (part.symbol !== undefined) words.push(part.symbol)
    if (part.text !== undefined) words.push(quote(part.text))
    if (part.at !== undefined) words.push(`at ${point(part.at)}`)
    if (part.room !== undefined) words.push(`in ${word(part.room)}`)
    if (part.turn !== undefined) words.push(`turn ${metres(part.turn)}`)
    return [...words, ...tail].join(' ')
  }
  const shaft = routeShaft(part)
  if (shaft !== null) return ['route', ...(part.category === ROUTE_CATEGORY ? [] : [part.category]), ...shaft.map(point), ...tail].join(' ')
  const head = `sketch ${part.kind} ${part.category}`
  if (part.kind === 'line' || part.kind === 'shape') return [head, ...part.points!.map(point), ...tail].join(' ')
  if (part.kind === 'rect') return [head, point(part.from!), point(part.to!), ...tail].join(' ')
  if (part.kind === 'arc') return [head, `at ${point(part.at!)}`, `radius ${metres(part.radius!)}`, `start ${metres(part.start!)}`, `end ${metres(part.end!)}`, ...tail].join(' ')
  return [head, `at ${point(part.at!)}`, quote(part.text!), ...tail].join(' ')
}

/**
 * Whether a part's line gives it back as the file holds it. One that would not (a category that is
 * not a plain word, a room or a floor the plan does not have, a figure finer than rooms text
 * writes) is read back raw.
 */
function writesBack(part: Annotation | SketchItem, place: NotePlace): boolean {
  if (!isAnnotation(part) && !plainWord(part.category)) return false
  if (isAnnotation(part) && part.room !== undefined && !place.rooms.has(part.room)) return false
  if (part.floor === DEFAULT_FLOOR_ID) return false
  if (!(isAnnotation(part) && part.room !== undefined && part.floor === undefined) && !place.floors.includes(floorOf(part))) return false
  const values: number[] = []
  const add = (p: readonly number[] | undefined): void => {
    if (p !== undefined) values.push(...p)
  }
  if (isAnnotation(part)) {
    add(part.at)
    if (part.turn !== undefined) values.push(part.turn)
  } else {
    for (const p of part.points ?? []) add(p)
    add(part.from)
    add(part.to)
    add(part.at)
    for (const v of [part.radius, part.start, part.end]) if (v !== undefined) values.push(v)
  }
  return values.every((v) => settled(v) === v)
}

/**
 * The plan's annotations, then its sketch, as rooms text writes them: nothing when it holds
 * neither. `blockFloor` is the floor of the block the lines are written under, the last one.
 */
export function noteLines(plan: FloorPlan, blockFloor: string = DEFAULT_FLOOR_ID): string[] {
  const parts: Array<Annotation | SketchItem> = [...(plan.annotations ?? []), ...(plan.sketch ?? [])]
  if (parts.length === 0) return []
  const place = notePlaceOf(plan)
  const raw = parts.map((p) => !writesBack(p, place))
  // An id is left out when the id Grid would give it is its own, so `note-1` reads back as it was
  // written; a raw line keeps its own, as the compiler reads it.
  const omit = parts.map((p, k) => !raw[k] && /^[a-z]+-\d+$/.test(p.id) && p.id.startsWith(`${partPrefix(p)}-`))
  for (let pass = 0; pass <= parts.length; pass++) {
    const given = givenIds(parts.map((p, k) => ({ prefix: partPrefix(p), ...(omit[k] ? {} : { id: p.id }) })))
    const wrong = given.flatMap((id, k) => (omit[k] && id !== parts[k]!.id ? [k] : []))
    if (wrong.length === 0) break
    for (const k of wrong) omit[k] = false
  }
  return parts.map((part, k) => {
    if (raw[k]) return `raw ${isAnnotation(part) ? 'note' : 'sketch'} ${JSON.stringify(part)}`
    const on = isAnnotation(part) && part.room !== undefined ? (part.floor ?? null) : floorOf(part) === blockFloor ? null : floorOf(part)
    return partLine(part, on, omit[k] ? null : part.id)
  })
}

/** What the drawing carries, by floor, in a line each: nothing when the plan holds none. */
export function notesSummary(plan: Pick<FloorPlan, 'annotations' | 'sketch' | 'rooms'>): string[] {
  const rooms = new Map(plan.rooms.map((r) => [r.id, floorOf(r)]))
  const parts: Array<Annotation | SketchItem> = [...(plan.annotations ?? []), ...(plan.sketch ?? [])]
  const byFloor = new Map<string, Array<Annotation | SketchItem>>()
  for (const part of parts) {
    const floor = isAnnotation(part) && part.room !== undefined && part.floor === undefined ? (rooms.get(part.room) ?? DEFAULT_FLOOR_ID) : floorOf(part)
    byFloor.set(floor, [...(byFloor.get(floor) ?? []), part])
  }
  return [...byFloor].map(([floor, list]) => {
    const counts = new Map<string, number>()
    for (const part of list) {
      const what = isAnnotation(part) ? part.kind : routeShaft(part) !== null ? 'route' : 'sketch'
      counts.set(what, (counts.get(what) ?? 0) + 1)
    }
    const said = [...counts].map(([what, n]) => `${n} ${n === 1 ? what : what === 'sketch' ? 'sketch items' : `${what}s`}`)
    return `Floor ${floor}: ${said.join(', ')} (${listed(list.map((p) => p.id))}).`
  })
}

/** One part placed, in a line for an answer: its id, what it is, where, and on which floor. */
export function placedLine(part: Annotation | SketchItem, rooms: ReadonlyMap<string, string>): string {
  const floor = isAnnotation(part) && part.room !== undefined && part.floor === undefined ? (rooms.get(part.room) ?? DEFAULT_FLOOR_ID) : floorOf(part)
  return `${part.id}: ${noteWhat(part)} ${notePlaceText(part)}, on floor ${floor}`
}

/** `raw note {...}` and `raw sketch {...}`: the plan file's own record, read by its schema. */
export function rawNoteOf(kind: 'note' | 'sketch', json: string, at: number): Annotation | SketchItem {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return stop(at, `a raw ${kind} is one JSON object on the rest of the line, as Grid's plan file holds it in "${kind === 'note' ? 'annotations' : 'sketch'}"; this one could not be read.`)
  }
  const read = (kind === 'note' ? AnnotationSchema : SketchItemSchema).safeParse(value)
  if (!read.success) {
    const issue = read.error.issues[0]!
    return stop(at, `the raw ${kind} would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}.`)
  }
  return read.data as Annotation | SketchItem
}

/**
 * The lines of one rooms text, read as they come and made into the plan's `annotations` and
 * `sketch` once the rooms are drawn (`finish`).
 */
export class NoteLines {
  private readonly entries: Array<{ readonly line: number; readonly words?: NoteWords; readonly raw?: Annotation | SketchItem; readonly floor: string | null }> = []

  get written(): boolean {
    return this.entries.length > 0
  }

  /** One line: `quoted` its words with whether each was quoted; `floor` the block it is under. */
  read(quoted: readonly LineWord[], at: number, plain: PlainNumbers, floor: string | null): void {
    this.entries.push({ line: at, words: noteOfWords(quoted, at, plain), floor })
  }

  /** `raw note {...}` or `raw sketch {...}`. */
  raw(kind: 'note' | 'sketch', json: string, at: number): void {
    this.entries.push({ line: at, raw: rawNoteOf(kind, json, at), floor: null })
  }

  /**
   * The plan's annotations and sketch, in the order of their lines, and one guess listing what
   * was placed. `plan` is the plan as drawn, null when it cannot be read: the lines are then
   * refused for what else is wrong with it.
   */
  finish(plan: Pick<FloorPlan, 'rooms' | 'floors' | 'walls'> | null): { annotations?: Annotation[]; sketch?: SketchItem[]; problems: NoteNote[]; guesses: string[] } {
    const problems: NoteNote[] = []
    if (this.entries.length === 0 || plan === null) return { problems, guesses: [] }
    const place = notePlaceOf(plan)
    const ids = givenIds(this.entries.map((e) => ({ prefix: e.raw !== undefined ? partPrefix(e.raw) : wordsPrefix(e.words!), ...((e.raw?.id ?? e.words?.id) === undefined ? {} : { id: e.raw?.id ?? e.words!.id! }) })))
    const seen = new Map<string, number>()
    const annotations: Annotation[] = []
    const sketch: SketchItem[] = []
    this.entries.forEach((entry, k) => {
      const id = ids[k]!
      const had = seen.get(id)
      if (had !== undefined) {
        problems.push({ code: 'rooms/duplicate-id', line: entry.line, message: `line ${entry.line}: the id '${id}' is used on line ${had} already: writing on the drawing and the sketch share one set of ids.` })
        return
      }
      seen.set(id, entry.line)
      try {
        const part = entry.raw ?? notePart(entry.words!, id, place, entry.floor)
        if (isAnnotation(part)) annotations.push(part)
        else sketch.push(part)
      } catch (error) {
        if (!(error instanceof NoteRefused)) throw error
        problems.push({ code: 'rooms/note', line: entry.line, message: `line ${entry.line}: ${error.message}` })
      }
    })
    const out: { annotations?: Annotation[]; sketch?: SketchItem[]; problems: NoteNote[]; guesses: string[] } = { problems, guesses: [] }
    if (annotations.length > 0) out.annotations = annotations
    if (sketch.length > 0) out.sketch = sketch
    if (problems.length === 0) out.guesses = notesSummary({ annotations, sketch, rooms: plan.rooms }).map((line) => `Drawn on the plan, never measured: ${line.charAt(0).toLowerCase()}${line.slice(1)}`)
    return out
  }
}
