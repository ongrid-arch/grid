/**
 * The plan's columns in rooms text (WRT-79), so an agent writes CNT-16's `columns` in words,
 * never as the plan file's JSON:
 *
 *   column <id> [square|round] <width> [x <depth>] at x,y [turn <degrees>] [height <m>]
 *          [through <floor>] [on <floor>] ["<label>"]
 *   columns <group> [square|round] <width> [x <depth>] at x,y, count <n> [x <m>],
 *          every <spacing> [x <spacing>] [turn ...] [height ...] [through ...] [on ...] ["<label>"]
 *   raw column { ...Grid's own JSON for a column... }
 *
 * A round column's width is its diameter; a square one is as deep as it is wide unless `x <depth>`
 * says. `columns` sets out a grid from its first column's middle: `count 5 x 3` columns, east
 * and then north, `every 6 x 8` metres apart (one spacing for both), named `<group>-1`,
 * `<group>-2` and on, row by row from the south-west. `pillar` and `pillars` are read as `column`
 * and `columns`. A column stands on the floor `on` names, else on the floor whose line it is
 * under; on the ground floor, unless `on` says it, the floor is left unstated, as C5 reads it.
 *
 * The read-back writes each column as a column line in its floor's block (`columnLines`), and
 * raw when its words would not give it back as it is.
 *
 * Pure: words in, columns out, or the reason there are none.
 */
import { ColumnSchema, COLUMN_SHAPES, DEFAULT_FLOOR_ID, type Column } from '../types/floorplan'
import { english, said, type MessageKey, type Values } from '../messages/say'
import { plainId } from '../types/planText'
import { isPointWord, metres, numberOf, pointOf, RoomsStop, type LineWord, type PlainNumbers } from './words'

type P = readonly [number, number]

/** The first words of the lines this file reads. */
export const COLUMN_LINE_WORDS: readonly string[] = ['column', 'columns', 'pillar', 'pillars']

/** The most columns one grid line sets out. */
export const COLUMNS_MOST = 2000

/** A note on the column lines, as the compiler records its others. */
export interface ColumnNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

const refuse = (at: number, key: MessageKey, values: Values = {}): never => {
  throw new RoomsStop('rooms/column', english(said(key, { line: String(at), ...values })), at)
}

/** The columns one column or columns line writes, before their floor is known. */
function columnsOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): { columns: Omit<Column, 'floor'>[]; on?: string } {
  const grid = t[0] === 'columns' || t[0] === 'pillars'
  const forms = said('rooms.column.forms')
  const id = t[1]
  if (id === undefined || quoted[1]?.quoted === true) return refuse(at, 'rooms.column.usage', { forms })
  let shape: Column['shape'] | undefined
  let size: [number, number | undefined] | undefined
  let point: P | undefined
  let turn: number | undefined
  let height: number | undefined
  let through: string | undefined
  let on: string | undefined
  let label: string | undefined
  let count: [number, number] | undefined
  let every: [number, number] | undefined
  const twice = (word: string, set: unknown): void => {
    if (set !== undefined) refuse(at, 'rooms.column.twice', { word })
  }
  const whole = (word: string | undefined): number => {
    const n = word === undefined ? NaN : Number(word)
    if (!Number.isInteger(n) || n < 1) return refuse(at, 'rooms.column.grid')
    return n
  }
  let i = 2
  while (i < t.length) {
    const w = t[i]!
    const next = t[i + 1]
    if (quoted[i]?.quoted === true) {
      twice('"<label>"', label)
      label = quoted[i]!.text
      i += 1
    } else if ((COLUMN_SHAPES as readonly string[]).includes(w)) {
      twice(w, shape)
      shape = w as Column['shape']
      i += 1
    } else if (w === 'at') {
      twice('at', point)
      if (next === undefined || !isPointWord(next)) return refuse(at, 'rooms.column.takes.point')
      point = pointOf(next, at, plain)
      i += 2
    } else if (w === 'turn' || w === 'turned') {
      twice('turn', turn)
      const value = next === undefined ? NaN : Number(next.replace(/(°|deg|degrees)$/, ''))
      if (!Number.isFinite(value)) return refuse(at, 'rooms.column.takes.turn')
      turn = value
      i += 2
    } else if (w === 'height' || w === 'high') {
      twice('height', height)
      if (next === undefined) return refuse(at, 'rooms.column.takes.length', { word: w })
      height = numberOf(next, at, plain)
      i += 2
    } else if (w === 'through' || w === 'on') {
      if (w === 'through') twice(w, through)
      else twice(w, on)
      if (next === undefined) return refuse(at, 'rooms.column.takes.floor', { word: w })
      if (w === 'through') through = next
      else on = next
      i += 2
    } else if (grid && w === 'count') {
      twice('count', count)
      const nx = whole(next)
      const by = t[i + 2] === 'x' ? whole(t[i + 3]) : 1
      count = [nx, by]
      i += t[i + 2] === 'x' ? 4 : 2
    } else if (grid && w === 'every') {
      twice('every', every)
      if (next === undefined) return refuse(at, 'rooms.column.grid')
      const sx = numberOf(next, at, plain)
      const sy = t[i + 2] === 'x' && t[i + 3] !== undefined ? numberOf(t[i + 3]!, at, plain) : sx
      if (!(sx > 0 && sy > 0)) return refuse(at, 'rooms.column.grid')
      every = [sx, sy]
      i += t[i + 2] === 'x' ? 4 : 2
    } else if (size === undefined && (w === 'diameter' || w === 'width') && next !== undefined) {
      size = [numberOf(next, at, plain), undefined]
      i += 2
    } else if (size === undefined) {
      const width = numberOf(w, at, plain)
      if (t[i + 1] === 'x' && t[i + 2] !== undefined) {
        size = [width, numberOf(t[i + 2]!, at, plain)]
        i += 3
      } else {
        size = [width, undefined]
        i += 1
      }
    } else return refuse(at, 'rooms.column.word', { word: w, forms })
  }
  if (size === undefined || !(size[0] > 0) || (size[1] !== undefined && !(size[1] > 0))) return refuse(at, 'rooms.column.size')
  if (point === undefined) return refuse(at, 'rooms.column.takes.point')
  const form = shape ?? 'square'
  if (form === 'round' && size[1] !== undefined) return refuse(at, 'rooms.column.roundDepth', { width: metres(size[0]) })
  if (height !== undefined && !(height > 0)) return refuse(at, 'rooms.column.takes.length', { word: 'height' })
  const one = (cid: string, middle: P): Omit<Column, 'floor'> => ({
    id: cid,
    shape: form,
    width: size![0],
    ...(size![1] === undefined ? {} : { depth: size![1] }),
    at: [middle[0], middle[1]],
    ...(turn === undefined ? {} : { turn }),
    ...(height === undefined ? {} : { height }),
    ...(through === undefined ? {} : { through }),
    ...(label === undefined ? {} : { label }),
  })
  if (!grid) {
    if (count !== undefined || every !== undefined) return refuse(at, 'rooms.column.usage', { forms })
    return { columns: [one(id, point)], ...(on === undefined ? {} : { on }) }
  }
  if (count === undefined || (every === undefined && count[0] * count[1] > 1)) return refuse(at, 'rooms.column.grid')
  const n = count[0] * count[1]
  if (n > COLUMNS_MOST) return refuse(at, 'rooms.column.most', { most: String(COLUMNS_MOST), count: String(n) })
  const step = every ?? [0, 0]
  const columns: Omit<Column, 'floor'>[] = []
  const r = (v: number): number => Math.round(v * 1e6) / 1e6
  for (let row = 0; row < count[1]; row++) {
    for (let k = 0; k < count[0]; k++) columns.push(one(`${id}-${columns.length + 1}`, [r(point[0] + k * step[0]), r(point[1] + row * step[1])]))
  }
  return { columns, ...(on === undefined ? {} : { on }) }
}

/** The column lines of a text, read as they come, and given their floors and checked at the end. */
export class ColumnLines {
  private readonly entries: Array<{ readonly line: number; readonly columns: readonly Column[] }> = []

  get written(): boolean {
    return this.entries.length > 0
  }

  /** A column or columns line, under the floor line of `floor` (null: no floor line above it). */
  read(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers, floor: string | null): void {
    const { columns, on } = columnsOfWords(t, quoted, at, plain)
    const stands = on ?? floor
    // C5: on the ground floor, unless `on` says it, the floor is left unstated.
    const stated = stands === null || (stands === DEFAULT_FLOOR_ID && on === undefined) ? undefined : stands
    this.entries.push({ line: at, columns: columns.map((c) => (stated === undefined ? c : withFloor(c, stated))) })
  }

  /** `raw column {...}`: Grid's own JSON for a column, taken as it is. */
  raw(json: string, at: number): void {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      return refuse(at, 'rooms.column.raw.unread')
    }
    const checked = ColumnSchema.safeParse(value)
    if (!checked.success) {
      const issue = checked.error.issues[0]!
      return refuse(at, 'rooms.column.raw.invalid', { field: issue.path.join('.') || 'column', problem: issue.message })
    }
    this.entries.push({ line: at, columns: [checked.data] })
  }

  /**
   * The plan's columns in the order of their lines, with each id used twice, among them or by
   * another part (`taken`), and each floor the plan does not have (`floors`, empty when it has
   * no floor list) named on its line.
   */
  finish(taken: ReadonlySet<string>, floors: readonly string[]): { columns?: Column[]; problems: ColumnNote[] } {
    const problems: ColumnNote[] = []
    if (this.entries.length === 0) return { problems }
    const columns: Column[] = []
    const first = new Map<string, number>()
    const note = (line: number, key: MessageKey, values: Values): void => {
      const message = english(said(key, { line: String(line), ...values }))
      problems.push({ code: key === 'rooms.column.unknownFloor' ? 'rooms/unknown-floor' : 'rooms/duplicate-id', line, message: message.charAt(0).toUpperCase() + message.slice(1) })
    }
    for (const { line, columns: made } of this.entries) {
      for (const column of made) {
        const had = first.get(column.id)
        if (had !== undefined) note(line, 'rooms.column.duplicate.line', { id: column.id, first: String(had) })
        else if (taken.has(column.id)) note(line, 'rooms.column.duplicate.part', { id: column.id })
        first.set(column.id, had ?? line)
        for (const floor of [column.floor, column.through]) {
          if (floor !== undefined && floors.length > 0 && !floors.includes(floor)) note(line, 'rooms.column.unknownFloor', { floor, floors: floors.join(', ') })
        }
        columns.push(column)
      }
    }
    return { columns, problems }
  }
}

/** A column with its floor, in the schema's order of fields. */
function withFloor(column: Omit<Column, 'floor'>, floor: string): Column {
  const { through, label, ...rest } = column
  return { ...rest, floor, ...(through === undefined ? {} : { through }), ...(label === undefined ? {} : { label }) }
}

/** Whether an id is written back as a word, as the stair and item lines check theirs. */
const readable = (id: string): boolean => /^[A-Za-z0-9._-]+$/.test(id) && plainId(id) === id

/** Whether a label is written back in quotes as it is: no quote mark or backslash in it. */
const plainLabel = (label: string): boolean => !/["'\\#]/.test(label) && label.trim() === label && label !== ''

/**
 * A column as rooms text, written in the block of the floor `block` (null: before any floor
 * line), so it takes `on` only for the ground floor stated; `raw column` when its words would not
 * give it back as it is there.
 */
export function columnLine(column: Column, block: string | null): string {
  const words = [column.id, ...(column.through === undefined ? [] : [column.through])]
  const unstatedElsewhere = column.floor === undefined && block !== null && block !== DEFAULT_FLOOR_ID
  if (unstatedElsewhere || !words.every(readable) || (column.label !== undefined && !plainLabel(column.label))) return `raw column ${JSON.stringify(column)}`
  return [
    'column',
    column.id,
    ...(column.shape === 'round' ? ['round'] : []),
    column.depth === undefined ? metres(column.width) : `${metres(column.width)} x ${metres(column.depth)}`,
    'at',
    `${metres(column.at[0])},${metres(column.at[1])}`,
    ...(column.turn === undefined ? [] : ['turn', metres(column.turn)]),
    ...(column.height === undefined ? [] : ['height', metres(column.height)]),
    ...(column.through === undefined ? [] : ['through', column.through]),
    ...(column.floor === DEFAULT_FLOOR_ID ? ['on', DEFAULT_FLOOR_ID] : []),
    ...(column.label === undefined ? [] : [`"${column.label}"`]),
  ].join(' ')
}

/**
 * The plan's columns as rooms text for the block of floor `block`: those standing on it (a
 * column with no floor on the ground floor's). With `block` null, every column on the floor of
 * no block in `blocks`, as raw lines that keep their floor.
 */
export function columnLines(columns: readonly Column[], block: string | null, blocks: readonly string[]): string[] {
  const stands = (c: Column): string => c.floor ?? DEFAULT_FLOOR_ID
  if (block === null) return columns.filter((c) => !blocks.includes(stands(c))).map((c) => `raw column ${JSON.stringify(c)}`)
  return columns.filter((c) => stands(c) === block).map((c) => columnLine(c, block))
}
