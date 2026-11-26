/**
 * Items laid out in rows (CNT-47): racks in a data hall, seats in a cinema, pews in a church,
 * kennels in a bank, as one line of rooms text or one tool call.
 *
 *   row <id> <the words of an item line> repeat <n> [every <m>] [, <k> rows [every <m>] [behind]]
 *
 * The words before `repeat` are an item line's own (`items.ts`): the first item's name, figures
 * and place, against a side of a room or at a point. `repeat <n>` lays out n of them side by side,
 * along each one's back, from its left, `every` metres from middle to middle (unstated, its width,
 * so they touch); `<k> rows` lays out k such rows, each in front of the last (`behind` it, for a
 * row placed at a point), `every` metres apart (unstated, its depth and the clear floor it keeps
 * in front, so that floor is the aisle). Against a side of a room, the first row is centred on that
 * side, or set at or from one end of it, as one item would be.
 *
 * The items are `<id>-<n>` in one row and `<id>-<row>-<n>` in several, counted from 1, and each is
 * a plain item of the plan: counted, drawn, measured and checked as every other. The read-back
 * (`itemAndRowLines`) writes a run of items that is exactly a row's, in order, as one row line at
 * its first item's point, so writing the text again gives the same items.
 *
 * Pure: words in, items out, or the reason there are none.
 */
import type { FloorPlan, Item } from '../types/floorplan'
import { floorOf, planFloors } from '../geometry/floors'
import { tolerance } from '../geometry/tolerances'
import { PARTS_MAX } from '../types/planText'
import type { Library } from '../library/index'
import { builtInItem } from '../library/builtIn'
import { figureWords, itemLine, itemLines, ItemRefused, itemOfWords, placeItem, samePlace, type ItemLines, type ItemMade, type ItemWords } from './items'
import { numberOf, RoomsStop, type LineWord, type PlainNumbers, PLAIN_METRES } from './words'

type P = readonly [number, number]

/** The first word of the line this file reads. */
export const ROW_LINE_WORDS: readonly string[] = ['row']

/** How a row repeats its first item. */
export interface RowWords {
  /** How many side by side in each row. */
  readonly count: number
  /** Metres from one's middle to the next's along the row; unstated, its width. */
  readonly every?: number
  /** How many rows; unstated, one. */
  readonly rows?: number
  /** Metres from one row to the next; unstated, its depth and its clear floor in front. */
  readonly rowEvery?: number
  /** Each row behind the last in place of in front of it (a row placed at a point only). */
  readonly behind?: boolean
}

const settled = (v: number): number => Math.round(v * 1e9) / 1e9 + 0
const exact = (v: number): string => String(settled(v))
const m = (v: number): string => String(Math.round(v * 1000) / 1000 + 0)
const turned = (deg: number): number => {
  const t = settled(((deg % 360) + 360) % 360)
  return t >= 360 ? 0 : t
}

/** The id of the item at a place in the rows, counted from 1. */
export function rowItemId(id: string, row: number, n: number, rows: number): string {
  return rows > 1 ? `${id}-${row}-${n}` : `${id}-${n}`
}

const USAGE = "write 'row <id> <name> [<w> x <d>] [<h> high] (in <room> against <side> [, at <end> | , <n> from <end>] | at x,y [turn <degrees>]) repeat <n> [every <m>] [, <k> rows [every <m>] [behind]]'."

/** The words of a row line: the item's, before `repeat`, and the row's, after it. `at` its line, or 0 from a tool. */
export function rowOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers = PLAIN_METRES): { item: ItemWords; row: RowWords } {
  const lead = at > 0 ? `line ${at}: ` : ''
  const stop = (message: string): never => {
    throw new RoomsStop('rooms/item', `${lead}${message}`, at > 0 ? at : null)
  }
  const r = t.findIndex((word, k) => k > 1 && word === 'repeat' && quoted[k]?.quoted !== true)
  if (r < 0) return stop(`a row says how many after 'repeat'; ${USAGE}`)
  const item = itemOfWords(t.slice(0, r), quoted.slice(0, r), at, plain)
  const whole = (word: string | undefined, what: string): number => {
    const n = word === undefined ? NaN : Number(word)
    if (!(Number.isInteger(n) && n >= 1)) stop(`${what} is a whole number, 1 or more${word === undefined ? '' : `, not '${word}'`}; ${USAGE}`)
    return n
  }
  const count = whole(t[r + 1], "'repeat' takes how many side by side, which")
  const row: { -readonly [K in keyof RowWords]: RowWords[K] } = { count }
  let i = r + 2
  while (i < t.length) {
    const word = t[i]!
    const next = t[i + 1]
    if (word === 'every') {
      if (next === undefined) return stop("'every' takes metres from one middle to the next.")
      const key = row.rows === undefined ? 'every' : 'rowEvery'
      if (row[key] !== undefined) return stop(`the row says 'every' twice for its ${key === 'every' ? 'items' : 'rows'}.`)
      row[key] = numberOf(next, at, plain)
      i += 2
    } else if (next === 'rows' || next === 'row') {
      if (row.rows !== undefined) return stop("the row says how many rows twice.")
      row.rows = whole(word, 'How many rows')
      i += 2
    } else if (word === 'behind') {
      if (row.rows === undefined) return stop("'behind' follows '<k> rows': each row then stands behind the last.")
      row.behind = true
      i += 1
    } else return stop(`'${word}' is not a word a row knows after 'repeat'; ${USAGE}`)
  }
  return { item, row }
}

/**
 * The items a row lays out: the first placed by its words as one item is, the others stepped
 * along its back and to its front. Throws `ItemRefused`, its sentence in small letters.
 */
export function layRow(plan: FloorPlan, words: ItemWords, row: RowWords, library?: Library): ItemMade[] {
  const rows = row.rows ?? 1
  if (!(Number.isInteger(row.count) && row.count >= 1)) throw new ItemRefused('a row repeats its item a whole number of times, 1 or more.')
  if (!(Number.isInteger(rows) && rows >= 1)) throw new ItemRefused('a row is laid out a whole number of times, 1 or more.')
  if (row.count * rows > PARTS_MAX) throw new ItemRefused(`${row.count * rows} items is more than the ${PARTS_MAX} a plan may hold.`)
  if (words.fullWidth === true) throw new ItemRefused("a row's items take their own width, so a row is never 'full width'.")
  if (row.behind === true && words.against !== undefined) throw new ItemRefused("a row against a side of a room steps into the room, so it takes no 'behind'.")
  const place = (w: ItemWords): ItemMade => (library === undefined ? placeItem(plan, w) : placeItem(plan, w, library))
  const first = place({ ...words, id: rowItemId(words.id, 1, 1, rows) })
  const [w, d] = first.item.size
  const near = tolerance('itemOverlap')
  const every = row.every ?? w
  if (!(Number.isFinite(every) && every > 0)) throw new ItemRefused("'every' is a length more than 0.")
  if (row.count > 1 && every < w - near) throw new ItemRefused(`${m(every)} m apart, items ${m(w)} m wide stand in each other: give 'every' ${m(w)} or more.`)
  const rowEvery = row.rowEvery ?? d + (first.item.clearance ?? 0)
  if (!(Number.isFinite(rowEvery) && rowEvery > 0)) throw new ItemRefused("the rows' 'every' is a length more than 0.")
  if (rows > 1 && rowEvery < d - near) throw new ItemRefused(`${m(rowEvery)} m apart, rows ${m(d)} m deep stand in each other: give the rows' 'every' ${m(d)} or more.`)
  const t = ((first.item.turn ?? 0) * Math.PI) / 180
  const across: P = [Math.cos(t), Math.sin(t)]
  const front: P = [-Math.sin(t), Math.cos(t)]
  let start: P = first.item.at
  if (words.against !== undefined && row.count > 1) {
    // The whole row is placed on the side as one item as long as it is, then its first item found in it.
    const length = (row.count - 1) * every + w
    const block = place({ ...words, id: words.id, size: [length, d], depth: d, height: first.item.height })
    start = [block.item.at[0] - (across[0] * (length - w)) / 2, block.item.at[1] - (across[1] * (length - w)) / 2]
  }
  const step = row.behind === true ? -rowEvery : rowEvery
  const made: ItemMade[] = []
  for (let r = 0; r < rows; r++) {
    for (let n = 0; n < row.count; n++) {
      const at: [number, number] = [settled(start[0] + across[0] * every * n + front[0] * step * r), settled(start[1] + across[1] * every * n + front[1] * step * r)]
      const id = rowItemId(words.id, r + 1, n + 1, rows)
      made.push({ ...first, record: { ...first.record, id, at }, item: { ...first.item, id, at }, guesses: r === 0 && n === 0 ? first.guesses : [] })
    }
  }
  return made
}

/** Reads a row line into the item lines, to be laid out once the rooms are drawn. */
export function readRowLine(lines: ItemLines, t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): void {
  const { item, row } = rowOfWords(t, quoted, at, plain)
  lines.readMany(at, (plan) => layRow(plan, item, row))
}

/** A row line from its item's words and its row's, as rooms text reads it. */
export function itemRowLine(words: ItemWords, row: RowWords): string {
  const along = `repeat ${row.count}${row.every === undefined ? '' : ` every ${exact(row.every)}`}`
  const rows = (row.rows ?? 1) > 1 ? `, ${row.rows} rows${row.rowEvery === undefined ? '' : ` every ${exact(row.rowEvery)}`}${row.behind === true ? ' behind' : ''}` : ''
  return `row ${itemLine(words).slice('item '.length)} ${along}${rows}`
}

// ── The read-back ──────────────────────────────────────────────────────────────────────────

const plainWord = (word: string): boolean => /^[A-Za-z0-9._-]+$/.test(word)

/** The row a run of items starting at `i` is laid out as, by its ids alone: its id, count and rows. */
function rowIds(items: readonly Item[], i: number): { id: string; count: number; rows: number } | null {
  const first = items[i]!.id
  const run = (id: string, rows: number): number => {
    let n = 0
    while (i + n < items.length && items[i + n]!.id === rowItemId(id, 1, n + 1, rows)) n++
    return n
  }
  if (first.endsWith('-1-1')) {
    const id = first.slice(0, -4)
    const count = run(id, 2)
    let rows = 1
    while (rows * count + count <= items.length - i && Array.from({ length: count }, (_, n) => items[i + rows * count + n]!.id === rowItemId(id, rows + 1, n + 1, 2)).every(Boolean)) rows++
    if (count >= 1 && rows >= 2) return { id, count, rows }
  }
  if (first.endsWith('-1')) {
    const id = first.slice(0, -2)
    const count = run(id, 1)
    if (count >= 2) return { id, count, rows: 1 }
  }
  return null
}

/** The row line a run of items is exactly, with how many items it takes, or null. */
function rowAt(plan: FloorPlan, items: readonly Item[], i: number): { line: string; size: number } | null {
  const ids = rowIds(items, i)
  if (ids === null || !plainWord(ids.id)) return null
  const f = items[i]!
  if (f.library !== undefined && ((plan.library ?? []).some((entry) => entry.name === f.library) || builtInItem(f.library) === undefined)) return null
  if (!plainWord(f.library ?? f.kind) || (f.floor !== undefined && !plainWord(f.floor)) || (f.label !== undefined && f.label.includes('"') && f.label.includes("'"))) return null
  const t = ((f.turn ?? 0) * Math.PI) / 180
  const across: P = [Math.cos(t), Math.sin(t)]
  const front: P = [-Math.sin(t), Math.cos(t)]
  const along = (b: Item, dir: P): number => (b.at[0] - f.at[0]) * dir[0] + (b.at[1] - f.at[1]) * dir[1]
  const row: { -readonly [K in keyof RowWords]: RowWords[K] } = { count: ids.count }
  if (ids.count > 1) row.every = settled(along(items[i + 1]!, across))
  if (ids.rows > 1) {
    const step = settled(along(items[i + ids.count]!, front))
    row.rows = ids.rows
    row.rowEvery = Math.abs(step)
    if (step < 0) row.behind = true
  }
  const floors = planFloors(plan).map((x) => x.id)
  const words: ItemWords = {
    id: ids.id,
    ...figureWords(f),
    at: [f.at[0], f.at[1]],
    ...(turned(f.turn ?? 0) === 0 ? {} : { turn: turned(f.turn ?? 0) }),
    ...(floorOf(f) !== 'ground' || (f.floor !== undefined && floors.some((x) => x !== 'ground')) ? { floor: floorOf(f) } : {}),
  }
  const size = ids.count * ids.rows
  try {
    const laid = layRow(plan, words, row)
    if (laid.length !== size || !laid.every((one, k) => one.item.id === items[i + k]!.id && samePlace(one.item, items[i + k]!))) return null
  } catch {
    return null
  }
  return { line: itemRowLine(words, row), size }
}

/**
 * CNT-47: the plan's items as rooms text, each run of them that is exactly a row written as its
 * row line, the others as `itemLines` writes them, in the plan's order.
 */
export function itemAndRowLines(plan: FloorPlan): string[] {
  const items = plan.items ?? []
  if (items.length === 0) return []
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1)
  const taken = new Set([...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id))
  const rows = new Map<number, { line: string; size: number }>()
  for (let i = 0; i < items.length; i++) {
    if ((counts.get(items[i]!.id) ?? 0) > 1 || taken.has(items[i]!.id)) continue
    const found = rowAt(plan, items, i)
    if (found === null || items.slice(i, i + found.size).some((x) => (counts.get(x.id) ?? 0) > 1 || taken.has(x.id))) continue
    rows.set(i, found)
    i += found.size - 1
  }
  if (rows.size === 0) return itemLines(plan)
  const inRow = new Set<number>()
  for (const [i, found] of rows) for (let k = 0; k < found.size; k++) inRow.add(i + k)
  const rest = itemLines({ ...plan, items: items.filter((_, k) => !inRow.has(k)) })
  const out: string[] = []
  let r = 0
  for (let i = 0; i < items.length; i++) {
    const found = rows.get(i)
    if (found !== undefined) out.push(found.line)
    else if (!inRow.has(i)) out.push(rest[r++]!)
  }
  return out
}
