/**
 * CMD-39: every answer of `grid serve` kept to a size an agent's host takes. On a large plan (a
 * tower of forty floors, a building of a thousand rooms) the reading tools answered hundreds of
 * kilobytes, most of it structured data, and hosts refused the answers whole.
 *
 * An answer is kept to `ANSWER_BUDGET_BYTES`, its text and its structured data (as JSON) together;
 * pictures travel as images and are not counted. One that fits is left as it is, to the byte. One
 * that does not is shortened here, once, for every tool: runs of like lines (one per floor, one per
 * room) keep their first two; then the text keeps its head and its last lines; then the longest
 * lists of the data keep their first items, each named in `left_out`. Its first line after the
 * label says so, and how to get the rest: `page` for the text's pieces, `whole` for all of it.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, say, type Language } from '@ongrid/floorplan/messages'
import type { ArgSpec, GridTool } from './toolkit'

/** A `page` the answer has not, refused as a tool refusal by the server (it imports nothing of the toolkit at run time). */
export class PageRefused extends Error {
  override readonly name = 'PageRefused'
}

/** The most an answer holds, its text and its data together, unless the call asks for it whole. */
export const ANSWER_BUDGET_BYTES = 20_000

/** The most the text takes when the data needs room too. */
const TEXT_SHARE_BYTES = 12_000

/** Room kept for the note and `left_out`. */
const NOTE_BYTES = 1_500

/** One piece of the text, with `page`. */
export const PAGE_BYTES = 14_000

/** A run of lines alike this long or longer keeps only its first two. */
const RUN_MIN = 4
const RUN_KEPT = 2

/** The most lists the data is cut in before the cutting stops. */
const CUTS_MAX = 400

export const WHOLE_ARG_NAME = 'whole'
export const PAGE_ARG_NAME = 'page'

export const WHOLE_ARG: ArgSpec = {
  type: 'boolean',
  description: `true for the answer whole, however large. Otherwise an answer is kept to about ${ANSWER_BUDGET_BYTES / 1000} KB, its text and its data together: one that is larger is shortened, and its first line after the label says what was left out. Shortened when needed when left out.`,
  examples: [true],
}

export const PAGE_ARG: ArgSpec = {
  type: 'number',
  description: 'The piece of the answer to give, from 1, when it is too large for one answer: a piece of its text and a stretch of each list its data was cut in, so the pieces together hold all of it. A shortened answer\'s first line says how many pieces there are. The answer shortened to fit when left out.',
  examples: [2],
  minimum: 1,
  maximum: 100_000,
}

/** The two arguments a tool takes beside its own: `whole`, and `page` when it only reads. */
export function budgetArgs(tool: Pick<GridTool, 'hint' | 'args' | 'ui'>): Readonly<Record<string, ArgSpec>> {
  const added: Record<string, ArgSpec> = {}
  if (tool.ui !== undefined) return added
  if (!Object.hasOwn(tool.args, WHOLE_ARG_NAME)) added[WHOLE_ARG_NAME] = WHOLE_ARG
  if (tool.hint === 'read' && !Object.hasOwn(tool.args, PAGE_ARG_NAME)) added[PAGE_ARG_NAME] = PAGE_ARG
  return added
}

/** What `left_out` holds in a shortened answer's data. */
export const LEFT_OUT_SCHEMA = {
  type: 'object',
  description: 'Only in an answer shortened to fit (CMD-39): its size whole, the budget, the pieces page gives, the text lines shown and each list of the data cut, with the first item kept (from, with page) and how many are kept. whole=true gives the answer whole.',
  properties: {
    whole_bytes: { type: 'number' },
    budget_bytes: { type: 'number' },
    pages: { type: 'number' },
    page: { type: 'number' },
    text_lines: { type: 'object', properties: { shown: { type: 'number' }, of: { type: 'number' } }, required: ['shown', 'of'] },
    lists: {
      type: 'array',
      items: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'number' }, shown: { type: 'number' }, of: { type: 'number' } }, required: ['path', 'shown', 'of'] },
    },
  },
  required: ['whole_bytes', 'budget_bytes', 'pages', 'lists'],
} as const

const encoder = new TextEncoder()
function bytes(text: string): number {
  return encoder.encode(text).length
}
function jsonBytes(value: unknown): number {
  return bytes(JSON.stringify(value) ?? '')
}
function kb(n: number): number {
  return Math.max(1, Math.round(n / 1000))
}

/** The language the call's answer is in: its own `language`, else English. */
function languageOf(args: Readonly<Record<string, unknown>>): Language {
  const asked = args['language']
  return typeof asked === 'string' && (LANGUAGES as readonly string[]).includes(asked) ? asked : DEFAULT_LANGUAGE
}

/** A line with its numbers and quoted names taken out: lines alike have the same. */
function shape(line: string): string {
  return line.replace(/"[^"]*"|'[^']*'|“[^”]*”/g, 'q').replace(/\d+(?:[.,]\d+)*/g, '0')
}

function indentOf(line: string): string {
  return /^\s*/.exec(line)![0]
}

/** Runs of `RUN_MIN` or more lines alike keep their first `RUN_KEPT` and one line counting the rest. */
function collapseRuns(lines: readonly string[], language: Language, mark: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const key = shape(lines[i]!)
    let j = i + 1
    while (j < lines.length && lines[j]!.trim() !== '' && shape(lines[j]!) === key) j++
    const run = j - i
    if (run >= RUN_MIN && lines[i]!.trim() !== '') {
      out.push(...lines.slice(i, i + RUN_KEPT), `${mark === '' ? indentOf(lines[i]!) : mark}${say(language, 'tool.budget.alike', { n: run - RUN_KEPT })}`)
    } else {
      out.push(...lines.slice(i, j))
    }
    i = j
  }
  return out
}

/** A line cut to at most `max` bytes, ending in an ellipsis. */
function cutLine(line: string, max: number): string {
  let cut = line
  while (bytes(cut) > max - 3 && cut.length > 0) cut = cut.slice(0, Math.max(0, Math.floor(cut.length * 0.9)))
  return `${cut}…`
}

/** The lines kept to `share` bytes: like lines first, then the head and the last lines. */
function shorten(lines: readonly string[], share: number, language: Language, mark: string): string[] {
  const size = (some: readonly string[]): number => bytes(some.join('\n'))
  if (size(lines) <= share) return [...lines]
  const collapsed = collapseRuns(lines, language, mark)
  if (size(collapsed) <= share) return collapsed
  const headShare = Math.floor((share * 2) / 3)
  const tailShare = share - headShare
  const head: string[] = []
  let used = 0
  for (const line of collapsed) {
    const more = bytes(line) + 1
    if (used + more > headShare) break
    head.push(line)
    used += more
  }
  if (head.length === 0) head.push(cutLine(collapsed[0]!, headShare))
  const tail: string[] = []
  used = 0
  for (let k = collapsed.length - 1; k >= head.length; k--) {
    const more = bytes(collapsed[k]!) + 1
    if (used + more > tailShare) break
    tail.unshift(collapsed[k]!)
    used += more
  }
  const skipped = collapsed.length - head.length - tail.length
  return skipped <= 0 ? [...head, ...tail] : [...head, `${mark}${say(language, 'tool.budget.skipped', { n: skipped })}`, ...tail]
}

/** The text in pieces of whole lines, each at most `most` bytes; a longer line is cut. */
function pieces(lines: readonly string[], most: number): string[][] {
  const out: string[][] = []
  let piece: string[] = []
  let used = 0
  for (const line of lines) {
    const one = bytes(line) > most ? cutLine(line, most) : line
    const more = bytes(one) + 1
    if (piece.length > 0 && used + more > most) {
      out.push(piece)
      piece = []
      used = 0
    }
    piece.push(one)
    used += more
  }
  if (piece.length > 0 || out.length === 0) out.push(piece)
  return out
}

type Key = string | number

interface Cut {
  /** Where the list is, key by key. */
  keys: Key[]
  shown: number
  of: number
}

/** A path as `left_out` writes it: `floors[0].rooms`. */
function pathOf(keys: readonly Key[]): string {
  return keys.map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? key : `.${key}`)).join('')
}

function same(a: readonly Key[], b: readonly Key[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i])
}

/** Every list in the data, with where it is and its size as JSON. Text is never cut: it may be a picture (an SVG) or a file. */
function lists(value: unknown, keys: Key[], out: { keys: Key[]; owner: Record<Key, unknown>; size: number; length: number }[], owner?: Record<Key, unknown>): void {
  if (Array.isArray(value)) {
    if (owner !== undefined && value.length > 1) out.push({ keys, owner, size: jsonBytes(value), length: value.length })
    value.forEach((item, i) => lists(item, [...keys, i], out, value as unknown as Record<Key, unknown>))
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, item] of Object.entries(value)) lists(item, [...keys, name], out, value as Record<Key, unknown>)
  }
}

/** The data cut to `share` bytes: its largest list halved, again until it fits or no list is left to cut. */
function cutData(data: Record<string, unknown>, share: number): { data: Record<string, unknown>; cuts: Cut[] } {
  const copy = structuredClone(data)
  const cuts: Cut[] = []
  for (let round = 0; round < CUTS_MAX; round++) {
    if (jsonBytes(copy) <= share) break
    const found: Parameters<typeof lists>[2] = []
    lists(copy, [], found)
    const largest = found.sort((a, b) => b.size - a.size)[0]
    if (largest === undefined) break
    // Halved each round, so long lists come down together and none is cut far below the others.
    const kept = Math.max(1, Math.floor(largest.length / 2))
    const key = largest.keys[largest.keys.length - 1]!
    largest.owner[key] = (largest.owner[key] as unknown[]).slice(0, kept)
    const before = cuts.find((cut) => same(cut.keys, largest.keys))
    if (before === undefined) cuts.push({ keys: largest.keys, shown: kept, of: largest.length })
    else before.shown = kept
  }
  return { data: copy, cuts: standing(cuts) }
}

/** The cuts that still name something: none inside an item an outer cut left out. */
function standing(cuts: readonly Cut[]): Cut[] {
  return cuts.filter((cut) => !cuts.some((outer) => outer !== cut && outer.keys.length < cut.keys.length && same(outer.keys, cut.keys.slice(0, outer.keys.length)) && (cut.keys[outer.keys.length] as number) >= outer.shown))
}

/** The cuts no other cut holds: the lists `page` walks through. */
function outermost(cuts: readonly Cut[]): Cut[] {
  return cuts.filter((cut) => !cuts.some((outer) => outer !== cut && outer.keys.length < cut.keys.length && same(outer.keys, cut.keys.slice(0, outer.keys.length))))
}

function at(data: unknown, keys: readonly Key[]): unknown {
  return keys.reduce<unknown>((value, key) => (value as Record<Key, unknown>)[key], data)
}

/** The label line on top, when the text has one, and the rest. */
function splitLabel(text: string): { label: string | null; body: string[] } {
  const lines = text.split('\n')
  const first = lines[0] ?? ''
  // A first line that holds it (a comment in rooms text, a CSV cell) is the label line too.
  const isLabel = LANGUAGES.some((language) => first.includes(say(language, 'label')))
  return isLabel ? { label: first, body: lines.slice(1) } : { label: null, body: lines }
}

/** A `page` that is no whole number is refused before the tool runs. */
export function checkPage(args: Readonly<Record<string, unknown>>): number | undefined {
  const page = args[PAGE_ARG_NAME]
  if (page === undefined) return undefined
  if (typeof page !== 'number' || !Number.isInteger(page)) throw new PageRefused(say(languageOf(args), 'tool.budget.pageWhole'))
  return page
}

/**
 * The answer within `ANSWER_BUDGET_BYTES`, or as it is when it fits. Without `page` it is the
 * answer shortened: its text's head and last lines, its lists' first items. With `page`, piece
 * `page` of the whole: that piece of the text, and that stretch of each list the data was cut in,
 * so the pages together hold all of it.
 */
export function withinBudget(tool: Pick<GridTool, 'hint' | 'args' | 'ui'>, args: Readonly<Record<string, unknown>>, text: string, data: Record<string, unknown>, page?: number): { text: string; data: Record<string, unknown> } {
  // The preview's answers are the page's to draw (VEW-4): a picture is never cut.
  if (tool.ui !== undefined) return { text, data }
  const wholeBytes = bytes(text) + jsonBytes(data)
  const language = languageOf(args)
  if (wholeBytes <= ANSWER_BUDGET_BYTES && page === undefined) return { text, data }
  const { label, body } = splitLabel(text)
  // A tool whose data repeats its text (grid_describe) gets the shortened text there too, so it counts twice.
  const repeats = data['text'] === text ? 'whole' : data['text'] === body.join('\n') ? 'body' : null
  const times = repeats === null ? 1 : 2
  const rest = repeats === null ? data : { ...data, text: '' }
  const room = ANSWER_BUDGET_BYTES - 2 * NOTE_BYTES
  const restBytes = jsonBytes(rest)

  // The pieces: each text piece and each stretch of the lists fit one answer together.
  const pieceBytes = Math.floor((restBytes > room / 2 ? room / 2 : Math.min(PAGE_BYTES, room - restBytes)) / times)
  const textPieces = pieces(body, Math.max(NOTE_BYTES, pieceBytes))
  const longest = Math.max(...textPieces.map((one) => bytes(one.join('\n'))))
  const pageShare = Math.max(NOTE_BYTES, room - longest * times)
  const windows = outermost(cutData(rest, pageShare).cuts)
  const pages = Math.max(textPieces.length, ...windows.map((cut) => Math.ceil(cut.of / cut.shown)))
  if (page !== undefined && page > pages) throw new PageRefused(pages === 1 ? say(language, 'tool.budget.noPageOne') : say(language, 'tool.budget.noPage', { pages }))
  if (wholeBytes <= ANSWER_BUDGET_BYTES) return { text, data }

  // Text whose lines may be comments (rooms text) gets Grid's lines as comments, so it still reads.
  const mark = (label ?? body[0] ?? '').startsWith('#') ? '# ' : ''
  let shown: string[]
  let kept: Record<string, unknown>
  let cuts: (Cut & { from?: number })[]
  if (page === undefined) {
    const textShare = Math.min(Math.max(TEXT_SHARE_BYTES, room - restBytes), room) / times
    shown = shorten(body, textShare, language, mark)
    ;({ data: kept, cuts } = cutData(rest, Math.max(NOTE_BYTES, room - bytes(shown.join('\n')) * times)))
  } else {
    shown = textPieces[page - 1] ?? []
    // Each list `page` walks through gives its own stretch; what is still too large is cut as without page.
    const stretch = structuredClone(rest)
    for (const cut of windows) {
      const keys = cut.keys
      const owner = at(stretch, keys.slice(0, -1)) as Record<Key, unknown>
      owner[keys[keys.length - 1]!] = (at(rest, keys) as unknown[]).slice((page - 1) * cut.shown, page * cut.shown)
    }
    const recut = cutData(stretch, Math.max(NOTE_BYTES, room - bytes(shown.join('\n')) * times))
    kept = recut.data
    cuts = [
      ...windows.map((cut) => ({ keys: cut.keys, from: Math.min(cut.of, (page - 1) * cut.shown), shown: (at(kept, cut.keys) as unknown[]).length, of: cut.of })),
      ...recut.cuts.filter((cut) => !windows.some((window) => same(window.keys, cut.keys))),
    ]
  }
  const shownText = shown.join('\n')
  const textCut = page === undefined && shownText !== body.join('\n')
  // An answer with no list to cut and text that fits (a picture as text) is given as it is.
  if (page === undefined && !textCut && cuts.length === 0) return { text, data }

  const floor = Object.hasOwn(tool.args, 'floor') ? say(language, 'tool.budget.floor') : ''
  const how = tool.hint !== 'read' ? say(language, 'tool.budget.howChange', { floor }) : pages === 1 ? say(language, 'tool.budget.howReadOne', { floor }) : say(language, 'tool.budget.howRead', { pages, floor })
  const what = [
    ...(textCut ? [say(language, 'tool.budget.lines', { shown: shown.length, of: body.length })] : []),
    ...(cuts.length > 0 ? [say(language, 'tool.budget.lists')] : []),
  ]
  const note = page !== undefined
    ? page < pages
      ? say(language, 'tool.budget.page', { page, pages, whole: kb(wholeBytes), next: page + 1 })
      : say(language, 'tool.budget.lastPage', { page, pages, whole: kb(wholeBytes) })
    : say(language, 'tool.budget.cut', { whole: kb(wholeBytes), budget: kb(ANSWER_BUDGET_BYTES), what: what.join(say(language, 'join.semicolon')), how })
  const leftOut = {
    whole_bytes: wholeBytes,
    budget_bytes: ANSWER_BUDGET_BYTES,
    pages,
    ...(page !== undefined ? { page } : {}),
    ...(textCut ? { text_lines: { shown: shown.length, of: body.length } } : {}),
    lists: cuts.map((cut) => ({ path: pathOf(cut.keys), ...(cut.from !== undefined ? { from: cut.from } : {}), shown: cut.shown, of: cut.of })),
  }
  const lines = [`${mark}${note}`, ...(shownText === '' ? [] : [shownText])]
  const finalText = [...(label === null ? [] : [label]), ...lines].join('\n')
  const repeated = repeats === 'whole' ? { text: finalText } : repeats === 'body' ? { text: lines.join('\n') } : {}
  return { text: finalText, data: { ...kept, ...repeated, left_out: leftOut } }
}
