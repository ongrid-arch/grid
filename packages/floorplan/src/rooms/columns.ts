/**
 * The plan's columns in rooms text (WRT-79), so an agent writes CNT-16's `columns` in words,
 * never as the plan file's JSON:
 *
 *   column <id> [square|round] <width> [x <depth>] at x,y [turn <degrees>] [height <m>]
 *          [through <floor>] [on <floor>] ["<label>"]
 *   columns <group> [square|round] <width> [x <depth>] at x,y, count <n> [x <m>],
 *          every <spacing> [x <spacing>] [turn ...] [height ...] [through ...] [on ...] ["<label>"]
 *   columns <group> [square|round] <width> [x <depth>] on grid <grid> [...]
 *   column [<id>] [square|round] <width> [x <depth>] at grid [<grid>] <x line>/<y line> [...]
 *   columns [<group>] ring <n> radius <r> [at x,y] [start <degrees>] [square|round] <width> [...]
 *   raw column { ...Grid's own JSON for a column... }
 *
 * A round column's width is its diameter; a square one is as deep as it is wide unless `x <depth>`
 * says. `columns` sets out a grid from its first column's middle: `count 5 x 3` columns, east
 * and then north, `every 6 x 8` metres apart (one spacing for both), named `<group>-1`,
 * `<group>-2` and on, row by row from the south-west. `pillar` and `pillars` are read as `column`
 * and `columns`. A column stands on the floor `on` names, else on the floor whose line it is
 * under; on the ground floor, unless `on` says it, the floor is left unstated, as C5 reads it.
 * WRT-83: a column with no floor, in a text whose floors include no `ground`, stands on the floor
 * at level 0 (else the lowest), never on a floor the plan does not have.
 *
 * WRT-83: `on grid <grid>` stands a column at every crossing of that grid's lines (`grids.ts`),
 * named `<group>-<x line>-<y line>` (the group `c` when none is written); `at grid 7/B` at one
 * crossing, on the text's one grid with lines of those names, or the grid named before it (`c-7-B`
 * when no id is written). On a radial grid the x lines are its rays and the y lines its rings.
 * `ring <n> radius <r>` sets out n columns evenly round a circle, counter-clockwise from `start`
 * degrees (from east), round `at`, else round the text's one radial grid's centre, named
 * `<group>-1` and on (the group `ring` when none is written). A square column on a grid is turned
 * as the grid is, or as its ray; in a ring, to face the centre. A grid may be written after the
 * columns on it.
 *
 * The read-back writes each column as a column line in its floor's block (`columnLines`), and
 * raw when its words would not give it back as it is.
 *
 * Pure: words in, columns out, or the reason there are none.
 */
import { ColumnSchema, COLUMN_SHAPES, DEFAULT_FLOOR_ID, FULL_TURN, type Column, type StructuralGrid } from '../types/floorplan'
import { gridCrossings, gridLineNames, type GridCrossing } from '../geometry/structuralGrid'
import { english, said, type MessageKey, type Values } from '../messages/say'
import { plainId } from '../types/planText'
import { isNumberWord, isPointWord, metres, numberOf, pointOf, RoomsStop, type LineWord, type PlainNumbers } from './words'

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

/** WRT-83: the words that may follow `column` or `columns` straight away when no id is written. */
const NO_ID_WORDS: readonly string[] = ['at', 'on', 'ring', ...COLUMN_SHAPES]

/** WRT-83: a crossing as an id's part: plain letters, digits, `.`, `_` and `-`. */
const idPart = (name: string): string => plainId(name).replace(/[^A-Za-z0-9._-]/g, '')

/** WRT-83: where a column line's columns go once the grids are known: every crossing, one, or a ring. */
type Placing =
  | { readonly kind: 'crossings'; readonly grid: string }
  | { readonly kind: 'crossing'; readonly grid: string | null; readonly x: string; readonly y: string; readonly ref: string }
  | { readonly kind: 'ring'; readonly count: number; readonly radius: number; readonly centre: P | null; readonly start: number }

/** What one column or columns line writes, before its floor is known: its columns, or how to place them on a grid. */
interface ColumnWords {
  readonly columns: Omit<Column, 'floor'>[]
  readonly on?: string
  /** WRT-83: the columns placed once the grids are known. */
  readonly place?: (grids: readonly StructuralGrid[]) => Omit<Column, 'floor'>[]
}

/** The columns one column or columns line writes, before their floor is known. */
function columnsOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): ColumnWords {
  const grid = t[0] === 'columns' || t[0] === 'pillars'
  const forms = said('rooms.column.forms')
  // WRT-83: `column at grid 7/B ...`, `columns ring 8 ...`, `columns 0.4 on grid G`: no id written.
  const unnamed = t[1] !== undefined && quoted[1]?.quoted !== true && (NO_ID_WORDS.includes(t[1]) || isNumberWord(t[1]))
  const id = unnamed ? undefined : t[1]
  if (!unnamed && (id === undefined || quoted[1]?.quoted === true)) return refuse(at, 'rooms.column.usage', { forms })
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
  let placing: Placing | undefined
  let ring: number | undefined
  let radius: number | undefined
  let start: number | undefined
  const twice = (word: string, set: unknown): void => {
    if (set !== undefined) refuse(at, 'rooms.column.twice', { word })
  }
  const whole = (word: string | undefined): number => {
    const n = word === undefined ? NaN : Number(word)
    if (!Number.isInteger(n) || n < 1) return refuse(at, 'rooms.column.grid')
    return n
  }
  let i = unnamed ? 1 : 2
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
    } else if (w === 'at' && next === 'grid') {
      // WRT-83: `at grid [<grid>] 7/B`, one crossing.
      twice('at', point ?? placing)
      const named = t[i + 2] !== undefined && !t[i + 2]!.includes('/') ? t[i + 2]! : null
      const ref = t[i + (named === null ? 2 : 3)]
      const parts = ref?.split('/') ?? []
      if (ref === undefined || parts.length !== 2 || parts.some((part) => part === '')) return refuse(at, 'rooms.column.gridRef')
      placing = { kind: 'crossing', grid: named, x: parts[0]!, y: parts[1]!, ref }
      i += named === null ? 3 : 4
    } else if (w === 'on' && next === 'grid') {
      // WRT-83: `on grid <grid>`, every crossing.
      twice('on grid', placing)
      if (t[i + 2] === undefined) return refuse(at, 'rooms.column.gridRef')
      placing = { kind: 'crossings', grid: t[i + 2]! }
      i += 3
    } else if (grid && w === 'ring') {
      twice('ring', ring)
      ring = whole(next)
      i += 2
    } else if (grid && w === 'radius') {
      twice('radius', radius)
      if (next === undefined) return refuse(at, 'rooms.column.ring')
      radius = numberOf(next, at, plain)
      i += 2
    } else if (grid && w === 'start') {
      twice('start', start)
      const value = next === undefined ? NaN : Number(next.replace(/(°|deg|degrees)$/, ''))
      if (!Number.isFinite(value)) return refuse(at, 'rooms.column.takes.turn')
      start = value
      i += 2
    } else if (w === 'at') {
      twice('at', point ?? placing)
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
  // WRT-83: a ring is set out round its centre, `at` or the radial grid's.
  if (ring !== undefined || radius !== undefined || start !== undefined) {
    if (ring === undefined || radius === undefined || !(radius > 0) || placing !== undefined || count !== undefined || every !== undefined) return refuse(at, 'rooms.column.ring')
    placing = { kind: 'ring', count: ring, radius, centre: point ?? null, start: start ?? 0 }
    point = undefined
  }
  if (point === undefined && placing === undefined) return refuse(at, 'rooms.column.takes.point')
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
  const stands = on === undefined ? {} : { on }
  if (placing !== undefined) {
    if (count !== undefined || every !== undefined || point !== undefined || (placing.kind !== 'ring' && (placing.kind === 'crossings') !== grid)) return refuse(at, 'rooms.column.usage', { forms })
    // A square column turned as the grid's line it stands on, or to face a ring's centre, unless `turn` says.
    const turned = (cid: string, middle: P, angle: number): Omit<Column, 'floor'> => {
      const made = one(cid, middle)
      const way = ((angle % 90) + 90) % 90
      // A square one as deep as wide looks the same a quarter turn round, so it takes no turn then.
      return turn !== undefined || form === 'round' || (way === 0 && size![1] === undefined) || angle === 0 ? made : withTurn(made, angle)
    }
    const how = placing
    const place = (grids: readonly StructuralGrid[]): Omit<Column, 'floor'>[] => {
      if (how.kind === 'ring') {
        const centre = how.centre ?? ringCentre(grids, at)
        const r = (v: number): number => Math.round(v * 1e6) / 1e6
        const group = id ?? 'ring'
        return Array.from({ length: how.count }, (_, k) => {
          const angle = how.start + (FULL_TURN * k) / how.count
          const a = (angle * Math.PI) / 180
          return turned(`${group}-${k + 1}`, [r(centre[0] + how.radius * Math.cos(a)), r(centre[1] + how.radius * Math.sin(a))], angle)
        })
      }
      const crossings = how.kind === 'crossings' ? gridCrossings(gridNamed(grids, how.grid, at)) : [crossingOf(grids, how, at)]
      const group = id ?? 'c'
      const r = (v: number): number => Math.round(v * 1e6) / 1e6
      return crossings.map((c) => turned(how.kind === 'crossing' && id !== undefined ? id : `${group}-${idPart(c.x)}-${idPart(c.y)}`, [r(c.at.x), r(c.at.y)], c.turn))
    }
    return { columns: [], ...stands, place }
  }
  const middle = point!
  if (!grid) {
    if (count !== undefined || every !== undefined) return refuse(at, 'rooms.column.usage', { forms })
    if (id === undefined) return refuse(at, 'rooms.column.usage', { forms })
    return { columns: [one(id, middle)], ...stands }
  }
  if (id === undefined) return refuse(at, 'rooms.column.usage', { forms })
  if (count === undefined || (every === undefined && count[0] * count[1] > 1)) return refuse(at, 'rooms.column.grid')
  const n = count[0] * count[1]
  if (n > COLUMNS_MOST) return refuse(at, 'rooms.column.most', { most: String(COLUMNS_MOST), count: String(n) })
  const step = every ?? [0, 0]
  const columns: Omit<Column, 'floor'>[] = []
  const r = (v: number): number => Math.round(v * 1e6) / 1e6
  for (let row = 0; row < count[1]; row++) {
    for (let k = 0; k < count[0]; k++) columns.push(one(`${id}-${columns.length + 1}`, [r(middle[0] + k * step[0]), r(middle[1] + row * step[1])]))
  }
  return { columns, ...stands }
}

/** WRT-83: a column with `turn` set, in the schema's order of fields. */
function withTurn(column: Omit<Column, 'floor'>, turn: number): Omit<Column, 'floor'> {
  const { height, through, label, ...rest } = column
  return { ...rest, turn, ...(height === undefined ? {} : { height }), ...(through === undefined ? {} : { through }), ...(label === undefined ? {} : { label }) }
}

/** WRT-83: the grid of an id, or refused with the grids the text has. */
function gridNamed(grids: readonly StructuralGrid[], id: string, at: number): StructuralGrid {
  const found = grids.find((g) => g.id === id)
  if (found !== undefined) return found
  return grids.length === 0 ? refuse(at, 'rooms.column.noGrids') : refuse(at, 'rooms.column.noGrid', { grid: id, grids: grids.map((g) => g.id).join(', ') })
}

/** WRT-83: one crossing, `7/B` or `B/7`, on the named grid or the one grid that has it. */
function crossingOf(grids: readonly StructuralGrid[], how: { readonly grid: string | null; readonly x: string; readonly y: string; readonly ref: string }, at: number): GridCrossing {
  const on = how.grid === null ? grids : [gridNamed(grids, how.grid, at)]
  if (on.length === 0) return refuse(at, 'rooms.column.noGrids')
  const found: Array<{ grid: StructuralGrid; crossing: GridCrossing }> = []
  for (const g of on) {
    const crossing = gridCrossings(g).find((c) => (c.x === how.x && c.y === how.y) || (c.x === how.y && c.y === how.x))
    if (crossing !== undefined) found.push({ grid: g, crossing })
  }
  if (found.length === 1) return found[0]!.crossing
  if (found.length > 1) return refuse(at, 'rooms.column.whichGrid', { ref: how.ref, grids: found.map((f) => f.grid.id).join(', ') })
  const g = on[0]!
  return refuse(at, 'rooms.column.noCrossing', { ref: how.ref, grid: on.length === 1 ? g.id : on.map((x) => x.id).join(', '), xs: gridLineNames(g.x, 'x').join(', '), ys: gridLineNames(g.y, 'y').join(', ') })
}

/** WRT-83: a ring's centre when its line gives none: the text's one radial grid's. */
function ringCentre(grids: readonly StructuralGrid[], at: number): P {
  const radial = grids.filter((g) => g.polar !== undefined)
  if (radial.length !== 1) return refuse(at, 'rooms.column.ringCentre', { count: String(radial.length) })
  return radial[0]!.origin
}

/** The column lines of a text, read as they come, and given their floors and checked at the end. */
export class ColumnLines {
  private readonly entries: Array<{ readonly line: number; readonly columns: readonly Column[]; readonly place?: (grids: readonly StructuralGrid[]) => Column[] }> = []

  get written(): boolean {
    return this.entries.length > 0
  }

  /** A column or columns line, under the floor line of `floor` (null: no floor line above it). */
  read(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers, floor: string | null): void {
    const { columns, on, place } = columnsOfWords(t, quoted, at, plain)
    const stands = on ?? floor
    // C5: on the ground floor, unless `on` says it, the floor is left unstated.
    const stated = stands === null || (stands === DEFAULT_FLOOR_ID && on === undefined) ? undefined : stands
    const floored = (made: readonly Omit<Column, 'floor'>[]): Column[] => made.map((c) => (stated === undefined ? c : withFloor(c, stated)))
    this.entries.push({ line: at, columns: floored(columns), ...(place === undefined ? {} : { place: (grids: readonly StructuralGrid[]) => floored(place(grids)) }) })
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
  finish(taken: ReadonlySet<string>, floors: readonly string[], grids: readonly StructuralGrid[] = [], levels: ReadonlyMap<string, number> = new Map()): { columns?: Column[]; problems: ColumnNote[] } {
    const problems: ColumnNote[] = []
    if (this.entries.length === 0) return { problems }
    const columns: Column[] = []
    const first = new Map<string, number>()
    const note = (line: number, key: MessageKey, values: Values): void => {
      const message = english(said(key, { line: String(line), ...values }))
      problems.push({ code: key === 'rooms.column.unknownFloor' ? 'rooms/unknown-floor' : 'rooms/duplicate-id', line, message: message.charAt(0).toUpperCase() + message.slice(1) })
    }
    // WRT-83: a column with no floor stands on the ground floor (C5); a text with floors and no
    // `ground` stands it on the floor at level 0, else the lowest, so it is never left out.
    const ground = floors.length === 0 || floors.includes(DEFAULT_FLOOR_ID) ? null : (floors.find((f) => levels.get(f) === 0) ?? [...floors].sort((a, b) => (levels.get(a) ?? 0) - (levels.get(b) ?? 0))[0]!)
    for (const entry of this.entries) {
      const { line } = entry
      let made: readonly Column[] = entry.columns
      if (entry.place !== undefined) {
        try {
          made = entry.place(grids)
        } catch (error) {
          if (!(error instanceof RoomsStop)) throw error
          const message = error.message
          problems.push({ code: 'rooms/column', line, message: message.charAt(0).toUpperCase() + message.slice(1) })
          continue
        }
      }
      for (const stated of made) {
        const column = ground !== null && stated.floor === undefined ? withFloor(stated, ground) : stated
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
