/**
 * The plan's structural grids in rooms text (WRT-83), so an agent writes CNT-16's `grids` in
 * words, straight or radial, never as the plan file's JSON:
 *
 *   grid <id> ["<name>"] [at x,y] [turn <degrees>] x <spacing> ... [names <name> ...]
 *        y <spacing> ... [names <name> ...] [floors <floor> ...]
 *   grid <id> ["<name>"] polar [at x,y] rings <radius> ... [names ...] rays <degrees> ... [names ...]
 *        [floors <floor> ...]
 *   raw grid { ...Grid's own JSON for a grid... }
 *
 * A straight grid's x lines are numbered 1, 2, 3 and run along its y, each the spacing past the
 * one before; its y lines are lettered A, B, C. A spacing written `<n>@<s>` is n spacings of s
 * (`4@7.5`). A radial grid's rings are lettered and its rays numbered; each list gives the rings'
 * radii and the rays' angles (degrees, counter-clockwise from east) one by one, as `<n>@<s>`
 * steps past the one before, or as `<first> to <last> every <step>`. Unplaced, a grid is set out
 * from 0,0. With no `floors`, it is drawn on every floor.
 *
 * The read-back writes each grid as a grid line (`gridLines`), and raw when its words would not
 * give it back as it is.
 *
 * Pure: words in, grids out, or the reason there are none.
 */
import { StructuralGridSchema, type StructuralGrid } from '../types/floorplan'
import { english, said, type MessageKey, type Values } from '../messages/say'
import { polarLines } from '../geometry/structuralGrid'
import { limit } from '../geometry/tolerances'
import { isPointWord, metres, numberOf, PLAIN_METRES, pointOf, quotedWordsOf, RoomsStop, type LineWord, type PlainNumbers } from './words'

/** The first word of the lines this file reads. */
export const GRID_LINE_WORDS: readonly string[] = ['grid']

/** The words a grid line takes; any other ends a list of values or names. */
const KEYS = new Set(['at', 'turn', 'x', 'y', 'names', 'polar', 'rings', 'rays', 'floors', 'on'])

/** A note on the grid lines, as the compiler records its others. */
export interface GridNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

const refuse = (at: number, key: MessageKey, values: Values = {}): never => {
  throw new RoomsStop('rooms/grid', english(said(key, { line: String(at), ...values })), at)
}

/** An angle in degrees, `30`, `30°` or `30deg`. */
function degrees(word: string | undefined, at: number, what: string): number {
  const value = word === undefined ? NaN : Number(word.replace(/(°|deg|degrees)$/, ''))
  if (!Number.isFinite(value)) return refuse(at, 'rooms.grid.takes.degrees', { word: what })
  return value
}

/**
 * The values of one list, from word `i` up to the next key: each value as written, `<n>@<s>` as
 * n steps of s (each past the value before, or spacings), or `<a> to <b> every <s>`.
 */
function listOf(t: readonly string[], i: number, at: number, read: (word: string) => number, what: string, steps: boolean): { values: number[]; next: number } {
  const values: number[] = []
  let k = i
  while (k < t.length && !KEYS.has(t[k]!)) {
    const w = t[k]!
    const repeat = /^(\d+)@(.+)$/.exec(w)
    if (repeat) {
      const n = Number(repeat[1])
      const step = read(repeat[2]!)
      if (!(n >= 1) || !(step > 0)) return refuse(at, 'rooms.grid.takes.list', { word: what })
      for (let m = 0; m < n; m++) values.push(steps ? step : (values.at(-1) ?? 0) + step)
      k += 1
    } else if (t[k + 1] === 'to' && t[k + 3] === 'every') {
      const from = read(w)
      const to = t[k + 2] === undefined ? NaN : read(t[k + 2]!)
      const step = t[k + 4] === undefined ? NaN : read(t[k + 4]!)
      if (!(step > 0) || !(to >= from)) return refuse(at, 'rooms.grid.takes.list', { word: what })
      const n = Math.round((to - from) / step)
      if (Math.abs(from + n * step - to) > step / 2 || n + 1 > limit('gridLinesMost')) return refuse(at, 'rooms.grid.takes.list', { word: what })
      for (let m = 0; m <= n; m++) values.push(from + m * step)
      k += 5
    } else {
      values.push(read(w))
      k += 1
    }
  }
  if (values.length === 0) return refuse(at, 'rooms.grid.takes.list', { word: what })
  return { values, next: k }
}

/** The names after `names`, up to the next key. */
function namesOf(t: readonly string[], i: number, at: number): { names: string[]; next: number } {
  let k = i
  while (k < t.length && !KEYS.has(t[k]!)) k++
  if (k === i) return refuse(at, 'rooms.grid.takes.names')
  return { names: t.slice(i, k), next: k }
}

/** The spacings from each of a radial list's values to the next, refused unless each is past the one before. */
function stepsOf(values: readonly number[], at: number, word: string): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) {
    const step = Math.round((values[i]! - values[i - 1]!) * 1e6) / 1e6
    if (!(step > 0)) return refuse(at, 'rooms.grid.order', { word })
    out.push(step)
  }
  return out
}

/** A grid line's words as the plan's grid, checked by the schema. */
export function gridOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): StructuralGrid {
  const forms = said('rooms.grid.forms')
  const id = t[1]
  if (id === undefined || quoted[1]?.quoted === true || KEYS.has(id)) return refuse(at, 'rooms.grid.usage', { forms })
  let name: string | undefined
  let polar = false
  let origin: [number, number] | undefined
  let turn: number | undefined
  let floors: string[] | undefined
  const sets: Record<'x' | 'y' | 'rings' | 'rays', { values: number[]; names?: string[] } | undefined> = { x: undefined, y: undefined, rings: undefined, rays: undefined }
  const twice = (word: string, set: unknown): void => {
    if (set !== undefined && set !== false) refuse(at, 'rooms.grid.twice', { word })
  }
  const length = (word: string): number => numberOf(word, at, plain)
  let i = 2
  while (i < t.length) {
    const w = t[i]!
    const next = t[i + 1]
    if (quoted[i]?.quoted === true) {
      twice('"<name>"', name)
      name = quoted[i]!.text
      i += 1
    } else if (w === 'polar') {
      twice('polar', polar)
      polar = true
      i += 1
    } else if (w === 'at') {
      twice('at', origin)
      if (next === undefined || !isPointWord(next)) return refuse(at, 'rooms.grid.takes.point')
      origin = pointOf(next, at, plain)
      i += 2
    } else if (w === 'turn') {
      twice('turn', turn)
      turn = degrees(next, at, 'turn')
      i += 2
    } else if (w === 'floors' || w === 'on') {
      twice(w, floors)
      const { names, next: after } = namesOf(t, i + 1, at)
      floors = names
      i = after
    } else if (w === 'x' || w === 'y' || w === 'rings' || w === 'rays') {
      twice(w, sets[w])
      const read = w === 'rays' ? (word: string) => degrees(word, at, w) : length
      const { values, next: after } = listOf(t, i + 1, at, read, w, w === 'x' || w === 'y')
      let names: string[] | undefined
      i = after
      if (t[i] === 'names') {
        const named = namesOf(t, i + 1, at)
        names = named.names
        i = named.next
      }
      sets[w] = { values, ...(names === undefined ? {} : { names }) }
    } else if (w === 'names') return refuse(at, 'rooms.grid.namesAfter')
    else return refuse(at, 'rooms.grid.word', { word: w, forms })
  }
  const grid: Record<string, unknown> = { id, ...(name === undefined ? {} : { name }), origin: origin ?? [0, 0] }
  if (polar) {
    if (sets.x !== undefined || sets.y !== undefined || turn !== undefined || sets.rings === undefined || sets.rays === undefined) return refuse(at, 'rooms.grid.polarSets')
    const rings = sets.rings.values
    if (!(rings[0]! > 0)) return refuse(at, 'rooms.grid.order', { word: 'rings' })
    const rays = sets.rays.values
    grid['turn'] = rays[0]
    grid['x'] = { spacing: stepsOf(rays, at, 'rays'), ...(sets.rays.names === undefined ? {} : { names: sets.rays.names }) }
    grid['y'] = { spacing: stepsOf(rings, at, 'rings'), ...(sets.rings.names === undefined ? {} : { names: sets.rings.names }) }
    grid['polar'] = { radius: rings[0] }
    if (rays[0] === 0) delete grid['turn']
  } else {
    if (sets.rings !== undefined || sets.rays !== undefined || sets.x === undefined || sets.y === undefined) return refuse(at, 'rooms.grid.sets')
    if (turn !== undefined && turn !== 0) grid['turn'] = turn
    grid['x'] = { spacing: sets.x.values, ...(sets.x.names === undefined ? {} : { names: sets.x.names }) }
    grid['y'] = { spacing: sets.y.values, ...(sets.y.names === undefined ? {} : { names: sets.y.names }) }
  }
  if (floors !== undefined) grid['floors'] = floors
  return checked(grid, at)
}

/** A grid as the schema reads it, or refused on its line with the schema's reason. */
function checked(value: unknown, at: number): StructuralGrid {
  const read = StructuralGridSchema.safeParse(value)
  if (read.success) return read.data
  const issue = read.error.issues[0]!
  return refuse(at, 'rooms.grid.invalid', { field: issue.path.join('.') || 'grid', problem: issue.message })
}

/** The grid lines of a text, read as they come and checked at the end. */
export class GridLines {
  private readonly entries: Array<{ readonly line: number; readonly grid: StructuralGrid }> = []

  get written(): boolean {
    return this.entries.length > 0
  }

  /** A grid line. */
  read(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): void {
    this.entries.push({ line: at, grid: gridOfWords(t, quoted, at, plain) })
  }

  /** `raw grid {...}`: Grid's own JSON for a grid, taken as it is. */
  raw(json: string, at: number): void {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      return refuse(at, 'rooms.grid.raw.unread')
    }
    this.entries.push({ line: at, grid: checked(value, at) })
  }

  /** The grids as they stand so far, for the column lines that name one. */
  grids(): StructuralGrid[] {
    return this.entries.map((entry) => entry.grid)
  }

  /** The plan's grids, each id used twice and each floor the plan does not have (`floors`, empty when it has no floor list) named on its line. */
  finish(floors: readonly string[]): { grids?: StructuralGrid[]; problems: GridNote[] } {
    const problems: GridNote[] = []
    if (this.entries.length === 0) return { problems }
    const first = new Map<string, number>()
    const note = (line: number, code: string, key: MessageKey, values: Values): void => {
      const message = english(said(key, { line: String(line), ...values }))
      problems.push({ code, line, message: message.charAt(0).toUpperCase() + message.slice(1) })
    }
    for (const { line, grid } of this.entries) {
      const had = first.get(grid.id)
      if (had !== undefined) note(line, 'rooms/duplicate-id', 'rooms.grid.duplicate', { id: grid.id, first: String(had) })
      else first.set(grid.id, line)
      for (const floor of grid.floors ?? []) {
        if (floors.length > 0 && !floors.includes(floor)) note(line, 'rooms/unknown-floor', 'rooms.column.unknownFloor', { floor, floors: floors.join(', ') })
      }
    }
    return { grids: this.entries.map((entry) => entry.grid), problems }
  }
}

/** Whether a word is written back as itself: no key, no quote, no space, no `@`. */
const plainWord = (word: string): boolean => /^[A-Za-z0-9._'-]+$/.test(word) && !KEYS.has(word) && !/^\d+@/.test(word) && word !== 'to' && word !== 'every' && !/^["']/.test(word)

/** Whether a name is written back in quotes as it is. */
const plainName = (text: string): boolean => !/["'\\#]/.test(text) && text.trim() === text && text !== ''

/** A grid as rooms text: a grid line, or `raw grid` when its words would not give it back as it is. */
export function gridLine(grid: StructuralGrid): string {
  const words = [grid.id, ...(grid.floors ?? []), ...(grid.x.names ?? []), ...(grid.y.names ?? [])]
  const raw = `raw grid ${JSON.stringify(grid)}`
  if (!words.every(plainWord) || (grid.name !== undefined && !plainName(grid.name))) return raw
  const named = (names: readonly string[] | undefined): string[] => (names === undefined ? [] : ['names', ...names])
  const head = ['grid', grid.id, ...(grid.name === undefined ? [] : [`"${grid.name}"`])]
  const origin = grid.origin[0] === 0 && grid.origin[1] === 0 ? [] : ['at', `${metres(grid.origin[0])},${metres(grid.origin[1])}`]
  const floors = grid.floors === undefined ? [] : ['floors', ...grid.floors]
  let line: string
  if (grid.polar !== undefined) {
    const { rays, rings } = polarLines(grid)
    line = [...head, 'polar', ...origin, 'rings', ...rings.map(metres), ...named(grid.y.names), 'rays', ...rays.map(metres), ...named(grid.x.names), ...floors].join(' ')
  } else {
    if (grid.x.spacing.length === 0 || grid.y.spacing.length === 0) return raw
    const turn = grid.turn === undefined || grid.turn === 0 ? [] : ['turn', metres(grid.turn)]
    line = [...head, ...origin, ...turn, 'x', ...grid.x.spacing.map(metres), ...named(grid.x.names), 'y', ...grid.y.spacing.map(metres), ...named(grid.y.names), ...floors].join(' ')
  }
  // The words must give the very grid back; else it is written as the file holds it.
  try {
    const words = quotedWordsOf(line, 0)
    const again = gridOfWords(words.map((w) => w.text), words, 0, PLAIN_METRES)
    return JSON.stringify(again) === JSON.stringify(grid) ? line : raw
  } catch {
    return raw
  }
}

/** The plan's grids as rooms text, one line each. */
export function gridLines(grids: readonly StructuralGrid[]): string[] {
  return grids.map(gridLine)
}
