/**
 * Stairs in rooms text and through the tools (LVL-21): one reading of a stair's words, so a
 * `stair` line, `grid_add_stair` and `grid_change_stair` lay a stair out the same way.
 *
 *   stair <id> ["<name>"] from <floor|room> to <floor|room> in <room>, <width> wide,
 *         straight|L|U, runs <north|south|east|west> [then <side>] [along <side>] [risers <n>]
 *   stair <id> ["<name>"] from <floor|room> to <floor|room>, <width> wide, run x,y x,y ... [risers <n>]
 *   raw stair { ...Grid's own JSON for a stair... }
 *
 * A room after `from` or `to` stands for its floor; with no `in`, the stair goes in the room
 * `from` names, or else the one `to` names. `runs` is the way the walking line goes from the
 * `from` floor towards the `to` floor (C4: north is up the drawing). The walking line is laid in
 * the box of the room's inside faces:
 *
 * - each end of it keeps a landing as deep as the stair is wide inside the room, so the end
 *   stands in the room, never on a wall's face: the square landing a stair turns on
 *   (`geometry/stairs.ts`);
 * - `straight`: one flight, centred across the room, or against the side `along` names;
 * - `L`: up against the side away from the turn, a square landing in the far corner, then a
 *   flight towards the side `then` names (a quarter turn clockwise from `runs` when left out);
 * - `U`: up one side and back down the other. Grid's stairs turn only on square landings as wide
 *   as the flight, so a U is two landings with a short flight between them across the well,
 *   and the room must be wider than twice the stair.
 *
 * What Grid works out (risers, their height, the going, the pitch, the rooms at its ends) is
 * `planStairs`'s, which also refuses a stair it cannot lay out. The read-back writes each stair
 * as a line (`stairLines`): in its room when the room's words give back its own walking line,
 * along its walking line otherwise, and raw when Grid cannot lay it out, so writing the text
 * again keeps it as it is.
 *
 * Pure: words in, a stair out, or the reason there is none.
 */
import { StairSchema, type FloorPlan, type Stair } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { floorOf, planFloors } from '../geometry/floors'
import { tryRoomPolygon } from '../geometry/room'
import { pointInPolygon } from '../geometry/innerPoint'
import { planStairs, type StairLayout } from '../geometry/stairs'
import { tolerance } from '../geometry/tolerances'
import { plainId } from '../types/planText'
import { isPointWord, numberOf, pointOf, RoomsStop, type LineWord, type PlainNumbers, PLAIN_METRES } from './words'

type P = readonly [number, number]

/** The first word of the line this file reads. */
export const STAIR_LINE_WORDS: readonly string[] = ['stair']

/** The shapes a stair laid in a room takes. */
export const STAIR_SHAPES = ['straight', 'L', 'U'] as const
export type StairShape = (typeof STAIR_SHAPES)[number]

/** The ways a stair runs and turns: the sides of the drawing (C4). */
export const STAIR_WAYS = ['north', 'east', 'south', 'west'] as const
export type StairWay = (typeof STAIR_WAYS)[number]

/** A quarter turn clockwise on the drawing. */
const CLOCKWISE: Readonly<Record<StairWay, StairWay>> = { north: 'east', east: 'south', south: 'west', west: 'north' }
const OPPOSITE: Readonly<Record<StairWay, StairWay>> = { north: 'south', south: 'north', east: 'west', west: 'east' }

/** What a stair line or a tool says about one stair. */
export interface StairWords {
  readonly id: string
  readonly name?: string
  /** A floor's id, or a room's, which stands for its floor. */
  readonly from: string
  readonly to: string
  readonly width: number
  /** The room it is laid in, with `shape` and `runs`; or its own walking line, `run`. */
  readonly room?: string
  readonly shape?: StairShape
  readonly runs?: StairWay
  readonly then?: StairWay
  readonly along?: StairWay
  readonly run?: readonly P[]
  readonly risers?: number
}

/** Why a stair's words give no stair, in a sentence that names what to change. */
export class StairRefused extends Error {
  override readonly name = 'StairRefused'
}

/** A stair laid out from its words. */
export interface StairMade {
  readonly stair: Stair
  /** The room it was laid in; null along a walking line of its own. */
  readonly room: string | null
  readonly layout: StairLayout
  /** What Grid chose, in a sentence each. */
  readonly guesses: readonly string[]
  /** What is worth a look on it, from `planStairs`. */
  readonly warnings: readonly string[]
}

/** A length for a sentence: to the millimetre, no trailing zeros. */
const m = (v: number): string => String(Math.round(v * 1000) / 1000 + 0)
/** A length for a line Grid reads again: exact to the nanometre. */
const exact = (v: number): string => String(Math.round(v * 1e9) / 1e9 + 0)
const settled = (v: number): number => Math.round(v * 1e9) / 1e9 + 0
const pointText = (p: P): string => `${m(p[0])},${m(p[1])}`

/** The floors and rooms of the plan, found by id: a room written on a later floor may carry its floor's id in front. */
function roomNamed(plan: FloorPlan, id: string, floors: readonly string[]): FloorPlan['rooms'][number] | undefined {
  return plan.rooms.find((r) => r.id === id) ?? plan.rooms.find((r) => floors.some((f) => r.id === `${f}-${id}` && floorOf(r) === f))
}

/** A floor's id from a word after `from` or `to`: the floor, or the floor of the room it names. */
function endOf(plan: FloorPlan, word: string, which: 'from' | 'to', floors: readonly string[]): { floor: string; room: string | null } {
  if (floors.includes(word)) return { floor: word, room: null }
  const room = roomNamed(plan, word, floors)
  if (room !== undefined) return { floor: floorOf(room), room: room.id }
  throw new StairRefused(`'${word}' after ${which} is neither a floor of the plan (its floors: ${floors.join(', ')}) nor a room.`)
}

/** The box round a room's inside faces, [x0, y0, x1, y1]. */
type Box = readonly [number, number, number, number]

/** The way from `a` to `b`, when it runs along a side of the drawing. */
function wayOf(a: P, b: P): StairWay | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const near = tolerance('sameFace')
  if (Math.abs(dx) <= near && Math.abs(dy) > near) return dy > 0 ? 'north' : 'south'
  if (Math.abs(dy) <= near && Math.abs(dx) > near) return dx > 0 ? 'east' : 'west'
  return null
}

const across = (a: StairWay, b: StairWay): boolean => a !== b && OPPOSITE[a] !== b

/**
 * The walking line in a room's box: `α` along `runs` from the face behind the foot, `σ` across
 * from the face away from `turn`. Lengths refused when a flight would be too short.
 */
function lineInBox(box: Box, width: number, shape: StairShape, runs: StairWay, turn: StairWay | undefined, along: StairWay | undefined, room: string): P[] {
  const [x0, y0, x1, y1] = box
  const ns = runs === 'north' || runs === 'south'
  const long = ns ? y1 - y0 : x1 - x0
  const wide = ns ? x1 - x0 : y1 - y0
  // The side the walking line's place across is measured from: the face away from the turn, or the one it runs along.
  const side: StairWay = along !== undefined ? along : OPPOSITE[turn ?? CLOCKWISE[runs]]
  const at = (alpha: number, sigma: number): P => {
    const a = runs === 'north' ? y0 + alpha : runs === 'south' ? y1 - alpha : runs === 'east' ? x0 + alpha : x1 - alpha
    const s = side === 'west' ? x0 + sigma : side === 'east' ? x1 - sigma : side === 'south' ? y0 + sigma : y1 - sigma
    return ns ? [settled(s), settled(a)] : [settled(a), settled(s)]
  }
  const shortest = tolerance('lineInside')
  const w = width
  const sizes = `room ${room} is ${m(long)} m ${ns ? 'north-south' : 'east-west'} by ${m(wide)} m across`
  if (long - 2 * w < shortest) {
    throw new StairRefused(`a ${shape === 'straight' ? 'straight ' : `${shape} `}stair ${m(w)} m wide running ${runs} needs the room longer than ${m(2 * w)} m that way, a landing as deep as the stair is wide at each end of its walking line, and ${sizes}. Make the room longer, the stair narrower, or run it the other way.`)
  }
  if (shape === 'straight') {
    if (wide + shortest < w) throw new StairRefused(`a stair ${m(w)} m wide does not fit across: ${sizes}.`)
    return [at(w, along === undefined ? wide / 2 : w / 2), at(long - w, along === undefined ? wide / 2 : w / 2)]
  }
  if (wide - 2 * w < shortest) {
    throw new StairRefused(
      shape === 'L'
        ? `an L stair ${m(w)} m wide needs the room wider than ${m(2 * w)} m across, for its landing in the corner and a landing at its head, and ${sizes}.`
        : `a U stair ${m(w)} m wide needs the room wider than ${m(2 * w)} m across, for its two flights side by side with the well between them, and ${sizes}.`
    )
  }
  if (shape === 'L') return [at(w, w / 2), at(long - w / 2, w / 2), at(long - w / 2, wide - w)]
  return [at(w, w / 2), at(long - w / 2, w / 2), at(long - w / 2, wide - w / 2), at(w, wide - w / 2)]
}

/** The box round a polygon. */
function boxOf(poly: readonly { x: number; y: number }[]): Box {
  return [Math.min(...poly.map((p) => p.x)), Math.min(...poly.map((p) => p.y)), Math.max(...poly.map((p) => p.x)), Math.max(...poly.map((p) => p.y))]
}

/** The walking line of a stair laid in a room, by its words, with the room's id and box. */
function roomLine(plan: FloorPlan, words: StairWords, ends: readonly string[], fallback: { readonly room: string; readonly which: 'from' | 'to' } | null): { line: P[]; room: string; poly: { x: number; y: number }[]; guessed: string | null } {
  const named = words.room ?? fallback?.room
  if (named === undefined) throw new StairRefused("say the room it goes in ('in <room>'), or give its walking line ('run x,y x,y ...').")
  if (words.runs === undefined) throw new StairRefused(`say the way it runs from ${words.from} ('runs north', 'runs east' and so on), the way its walking line goes up from the floor it starts on.`)
  const room = roomNamed(plan, named, ends)
  if (room === undefined) throw new StairRefused(`the plan has no room '${named}' to lay the stair in.`)
  if (!ends.includes(floorOf(room))) throw new StairRefused(`room ${room.id} is on floor ${floorOf(room)}, which the stair does not join (it joins ${ends.join(' and ')}).`)
  const shape = words.shape ?? 'straight'
  if (shape === 'straight' && words.then !== undefined) throw new StairRefused("a straight stair does not turn: 'then' is for an L or a U.")
  if (shape !== 'straight' && words.along !== undefined) throw new StairRefused(`an ${shape} stair goes up against the side away from its turn: 'along' is for a straight one; say the way it turns with 'then'.`)
  if (words.then !== undefined && !across(words.runs, words.then)) throw new StairRefused(`a stair that runs ${words.runs} turns east or west, or north or south, across it: 'then ${words.then}' is not across.`)
  if (words.along !== undefined && !across(words.runs, words.along)) throw new StairRefused(`a stair that runs ${words.runs} goes along a side beside it: 'along ${words.along}' is not.`)
  const poly = tryRoomPolygon(room, indexPlan(plan))
  if (poly === null) throw new StairRefused(`Grid cannot draw room ${room.id}, so there is nothing to lay the stair in.`)
  const line = lineInBox(boxOf(poly), words.width, shape, words.runs, words.then, words.along, room.id)
  return { line, room: room.id, poly, guessed: words.room === undefined ? `the stair ${words.id} goes in room ${room.id}, the room ${fallback?.which ?? 'from'} names.` : null }
}

/** Whether the flights and landings lie in the room: a point a step in from each corner (`stepPastFace`), so one that only touches a wall's face still does. */
function inRoom(layout: StairLayout, poly: readonly { x: number; y: number }[]): boolean {
  const step = tolerance('stepPastFace')
  const outlines = [...layout.flights.map((f) => f.outline), ...layout.landings.map((l) => l.outline)]
  return outlines.every((outline) => {
    const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length
    const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length
    return outline.every((p) => {
      const d = Math.hypot(cx - p.x, cy - p.y)
      return d === 0 || pointInPolygon({ x: p.x + ((cx - p.x) / d) * step, y: p.y + ((cy - p.y) / d) * step }, poly)
    })
  })
}

/** What Grid worked out for a stair, in a sentence. */
export function stairSummary(layout: StairLayout): string {
  const end = (e: StairLayout['lower']): string => (e.room === null ? `on floor ${e.floor}, in no room` : `in ${e.room} on floor ${e.floor}`)
  return (
    `stair ${layout.id} climbs ${m(layout.rise)} m in ${layout.risers} risers of ${m(layout.riserHeight)} m${layout.risersStated ? '' : ' (worked out)'}, ` +
    `going ${m(layout.going)} m, pitch ${layout.pitch.toFixed(1)}°, ${m(layout.width)} m wide, in ${layout.flights.length} flight${layout.flights.length === 1 ? '' : 's'}; ` +
    `walking line ${layout.line.map((p) => pointText([p.x, p.y])).join(' ')} from its foot ${end(layout.lower)} to its head ${end(layout.upper)}`
  )
}

/**
 * The stair its words give, laid out and checked as every stair is (`planStairs`). Throws
 * `StairRefused`, its sentence starting in small letters, for a caller to put its own start on.
 */
export function layStair(plan: FloorPlan, words: StairWords): StairMade {
  const floors = planFloors(plan).map((f) => f.id)
  if (!Number.isFinite(words.width) || words.width <= 0) throw new StairRefused("a stair is given its width across the walking line, more than 0: '<width> wide'.")
  if (words.risers !== undefined && (!Number.isInteger(words.risers) || words.risers < 1)) throw new StairRefused('risers is a whole number, 1 or more.')
  const from = endOf(plan, words.from, 'from', floors)
  const to = endOf(plan, words.to, 'to', floors)
  if (from.floor === to.floor) throw new StairRefused(`a stair joins two floors, and from and to are both floor ${from.floor}.`)
  const guesses: string[] = []
  let line: P[]
  let room: string | null = null
  let poly: { x: number; y: number }[] | null = null
  if (words.run !== undefined) {
    if (words.room !== undefined || words.shape !== undefined || words.runs !== undefined || words.then !== undefined || words.along !== undefined) {
      throw new StairRefused("give the stair's walking line ('run') or the room it is laid in with its shape and the way it runs, not both.")
    }
    if (words.run.length < 2) throw new StairRefused('a walking line has two points or more: its foot, each turn, and its head.')
    line = words.run.map((p) => [settled(p[0]), settled(p[1])] as P)
  } else {
    const laid = roomLine(plan, words, [from.floor, to.floor], from.room !== null ? { room: from.room, which: 'from' } : to.room !== null ? { room: to.room, which: 'to' } : null)
    line = laid.line
    room = laid.room
    poly = laid.poly
    if (laid.guessed !== null) guesses.push(laid.guessed)
  }
  const stair: Stair = {
    id: words.id,
    ...(words.name === undefined ? {} : { name: words.name }),
    from: from.floor,
    to: to.floor,
    width: words.width,
    run: line.map((p) => [p[0], p[1]] as [number, number]),
    ...(words.risers === undefined ? {} : { risers: words.risers }),
  }
  const checked = StairSchema.safeParse(stair)
  if (!checked.success) throw new StairRefused(`the stair would not be read: ${checked.error.issues[0]!.path.join('.')} ${checked.error.issues[0]!.message}.`)
  const others = (plan.stairs ?? []).filter((s) => s.id !== stair.id)
  const laid = planStairs({ ...plan, stairs: [...others, stair] }, () => new Set())
  const own = laid.problems.filter((p) => p.stair === stair.id)
  const error = own.find((p) => p.severity === 'error')
  const layout = laid.stairs.find((s) => s.id === stair.id)
  if (error !== undefined || layout === undefined) throw new StairRefused(lower(error?.message ?? `stair ${stair.id} could not be laid out.`))
  if (poly !== null && room !== null && !inRoom(layout, poly)) throw new StairRefused(`the stair laid in the box of room ${room} reaches outside the room, which is not a rectangle: give its walking line ('run x,y x,y ...') instead.`)
  return { stair, room, layout, guesses, warnings: own.filter((p) => p.severity === 'warning').map((p) => lower(p.message)) }
}

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * The words of a stair laid in a room that give back its own walking line, or null when no room
 * of its floors does: the read-back then writes its walking line.
 */
export function stairWordsOf(plan: FloorPlan, stair: Stair): StairWords | null {
  const run = stair.run.map((p) => [p[0], p[1]] as P)
  const shape: StairShape | null = run.length === 2 ? 'straight' : run.length === 3 ? 'L' : run.length === 4 ? 'U' : null
  if (shape === null) return null
  const runs = wayOf(run[0]!, run[1]!)
  const then = shape === 'straight' ? undefined : wayOf(run[1]!, run[2]!)
  if (runs === null || then === null) return null
  const index = indexPlan(plan)
  const foot = { x: run[0]![0], y: run[0]![1] }
  const rooms = plan.rooms
    .filter((r) => floorOf(r) === stair.from || floorOf(r) === stair.to)
    .map((r) => ({ room: r, poly: tryRoomPolygon(r, index) }))
    .filter((r): r is { room: FloorPlan['rooms'][number]; poly: { x: number; y: number }[] } => r.poly !== null && readable(r.room.id) && pointInPolygon(foot, r.poly))
    .sort((a, b) => (floorOf(a.room) === stair.from ? 0 : 1) - (floorOf(b.room) === stair.from ? 0 : 1))
  const sideways = shape === 'straight' ? [undefined, CLOCKWISE[runs], OPPOSITE[CLOCKWISE[runs]]] : [undefined]
  for (const { room, poly } of rooms) {
    for (const along of sideways) {
      let line: P[]
      try {
        line = lineInBox(boxOf(poly), stair.width, shape, runs, then, along, room.id)
      } catch {
        continue
      }
      const same = line.length === run.length && line.every((p, i) => Math.abs(p[0] - run[i]![0]) <= tolerance('sameFace') && Math.abs(p[1] - run[i]![1]) <= tolerance('sameFace'))
      if (!same) continue
      return {
        id: stair.id,
        ...(stair.name === undefined ? {} : { name: stair.name }),
        from: stair.from,
        to: stair.to,
        width: stair.width,
        room: room.id,
        shape,
        runs,
        ...(then === undefined || then === CLOCKWISE[runs] ? {} : { then }),
        ...(along === undefined ? {} : { along }),
        ...(stair.risers === undefined ? {} : { risers: stair.risers }),
      }
    }
  }
  return null
}

/** An id a stair line gives back as it is: one word of plain letters. */
const readable = (id: string): boolean => /^[A-Za-z0-9._-]+$/.test(id) && plainId(id) === id

const quoteName = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`)

/** A stair line from its words, as rooms text reads it. */
export function stairLine(words: StairWords): string {
  const head = `stair ${words.id}${words.name === undefined ? '' : ` ${quoteName(words.name)}`} from ${words.from} to ${words.to}`
  const parts = [`${exact(words.width)} wide`]
  if (words.run !== undefined) parts.push(`run ${words.run.map((p) => `${exact(p[0])},${exact(p[1])}`).join(' ')}`)
  else {
    parts.push(words.shape ?? 'straight')
    parts.push(`runs ${words.runs}${words.then === undefined ? '' : ` then ${words.then}`}${words.along === undefined ? '' : ` along ${words.along}`}`)
  }
  if (words.risers !== undefined) parts.push(`risers ${words.risers}`)
  return `${head}${words.room === undefined ? '' : ` in ${words.room}`}, ${parts.join(', ')}`
}

/**
 * The plan's stairs as rooms text: each in its room when that gives back its walking line, along
 * its walking line otherwise, and raw when Grid cannot lay it out, so it is written again unchanged.
 */
export function stairLines(plan: FloorPlan): string[] {
  const stairs = plan.stairs ?? []
  if (stairs.length === 0) return []
  const laid = planStairs(plan, () => new Set())
  const bad = new Set(laid.problems.filter((p) => p.severity === 'error').map((p) => p.stair))
  const seen = new Set<string>()
  return stairs.map((stair) => {
    const twice = seen.has(stair.id)
    seen.add(stair.id)
    if (twice || bad.has(stair.id) || ![stair.id, stair.from, stair.to].every(readable)) return `raw stair ${JSON.stringify(stair)}`
    const words = stairWordsOf(plan, stair)
    if (words !== null) return stairLine(words)
    return stairLine({ id: stair.id, ...(stair.name === undefined ? {} : { name: stair.name }), from: stair.from, to: stair.to, width: stair.width, run: stair.run.map((p) => [p[0], p[1]] as P), ...(stair.risers === undefined ? {} : { risers: stair.risers }) })
  })
}

/** A note on the stair lines, as the compiler records its others. */
export interface StairNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

const USAGE =
  "write 'stair <id> from <floor|room> to <floor|room> in <room>, <width> wide, straight|L|U, runs <north|south|east|west> [then <side>] [along <side>] [risers <n>]', or with its walking line: 'stair <id> from <floor> to <floor>, <width> wide, run x,y x,y ...'."

const SHAPE_WORDS: Readonly<Record<string, StairShape>> = { straight: 'straight', l: 'L', 'l-shaped': 'L', u: 'U', 'u-shaped': 'U' }

/** The words of a stair line, after `stair`; `at` its line, or 0 from a tool. */
export function stairOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers = PLAIN_METRES): StairWords {
  const lead = at > 0 ? `line ${at}: ` : ''
  const stop = (message: string): never => {
    throw new RoomsStop('rooms/stair', `${lead}${message}`, at > 0 ? at : null)
  }
  const id = t[1]
  if (id === undefined || quoted[1]?.quoted === true) return stop(`a stair needs an id after 'stair'; ${USAGE}`)
  let i = 2
  let name: string | undefined
  if (quoted[2]?.quoted === true) {
    name = quoted[2].text
    i = 3
  }
  const words: { -readonly [K in keyof StairWords]?: StairWords[K] } = {}
  const way = (word: string | undefined, after: string): StairWay => {
    if (word !== undefined && (STAIR_WAYS as readonly string[]).includes(word)) return word as StairWay
    return stop(`'${after}' takes north, south, east or west${word === undefined ? '' : `, not '${word}'`}.`)
  }
  const once = <K extends keyof StairWords>(key: K, value: StairWords[K], word: string): void => {
    if (words[key] !== undefined) stop(`the stair says '${word}' twice.`)
    words[key] = value
  }
  while (i < t.length) {
    const word = t[i]!
    const next = t[i + 1]
    if (word === 'from' || word === 'to' || word === 'in') {
      if (next === undefined) return stop(`'${word}' takes ${word === 'in' ? 'a room' : 'a floor or a room'}.`)
      once(word === 'in' ? 'room' : word, next, word)
      i += 2
    } else if (next === 'wide') {
      once('width', numberOf(word, at, plain), 'wide')
      i += 2
    } else if (word === 'width') {
      if (next === undefined) return stop("'width' takes a length.")
      once('width', numberOf(next, at, plain), 'width')
      i += 2
    } else if (Object.hasOwn(SHAPE_WORDS, word.toLowerCase())) {
      once('shape', SHAPE_WORDS[word.toLowerCase()]!, word)
      i += 1
    } else if (word === 'runs') {
      once('runs', way(next, 'runs'), 'runs')
      i += 2
    } else if (word === 'then' || word === 'along') {
      once(word, way(next, word), word)
      i += 2
    } else if (word === 'risers') {
      const n = next === undefined ? NaN : Number(next)
      if (!Number.isInteger(n) || n < 1) return stop("'risers' takes a whole number, 1 or more.")
      once('risers', n, 'risers')
      i += 2
    } else if (word === 'run') {
      const points: P[] = []
      i += 1
      while (i < t.length && isPointWord(t[i]!)) points.push(pointOf(t[i++]!, at, plain))
      if (points.length < 2) return stop("'run' takes the walking line's points, x,y x,y ...: its foot, each turn and its head, two or more.")
      once('run', points, 'run')
    } else return stop(`'${word}' is not a word a stair line knows; ${USAGE}`)
  }
  if (words.from === undefined || words.to === undefined) return stop(`a stair says the floors it joins, 'from <floor|room> to <floor|room>'; ${USAGE}`)
  if (words.width === undefined) return stop("a stair says how wide it is, '<width> wide', across its walking line.")
  return { id, ...(name === undefined ? {} : { name }), ...(words as Omit<StairWords, 'id' | 'name'>) }
}

/** The stair lines of a text, read as they come and laid out once the rooms are drawn. */
export class StairLines {
  private readonly entries: Array<{ readonly line: number; readonly words?: StairWords; readonly raw?: Stair }> = []

  get written(): boolean {
    return this.entries.length > 0
  }

  /** The ids of the raw stairs: the plan file's own, which the check names but never refuses. */
  rawIds(): string[] {
    return this.entries.flatMap((e) => (e.raw === undefined ? [] : [e.raw.id]))
  }

  read(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): void {
    this.entries.push({ line: at, words: stairOfWords(t, quoted, at, plain) })
  }

  /** `raw stair {...}`: Grid's own JSON for a stair, taken as it is, never laid out again. */
  raw(json: string, at: number): void {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw new RoomsStop('rooms/raw', `line ${at}: a raw stair is one JSON object on the rest of the line, as Grid's plan file holds it in "stairs"; this one could not be read.`, at)
    }
    const checked = StairSchema.safeParse(value)
    if (!checked.success) {
      const issue = checked.error.issues[0]!
      throw new RoomsStop('rooms/raw', `line ${at}: the raw stair would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}. A stair is {"id", "from", "to", "width", "run": [[x, y], ...]} as Grid's plan file holds it.`, at)
    }
    this.entries.push({ line: at, raw: checked.data })
  }

  /** The plan's stairs, in the order of their lines, and what the lines say about them. */
  finish(plan: FloorPlan | null): { stairs?: Stair[]; problems: StairNote[]; warnings: StairNote[]; guesses: string[] } {
    const problems: StairNote[] = []
    const warnings: StairNote[] = []
    const guesses: string[] = []
    if (this.entries.length === 0) return { problems, warnings, guesses }
    const stairs: Stair[] = []
    const ids = new Set<string>()
    for (const entry of this.entries) {
      const id = entry.words?.id ?? entry.raw!.id
      if (ids.has(id)) {
        problems.push({ code: 'rooms/duplicate-id', line: entry.line, message: `line ${entry.line}: the stair id '${id}' is used by two stairs.` })
        continue
      }
      ids.add(id)
      if (entry.raw !== undefined) {
        stairs.push(entry.raw)
        continue
      }
      // A plan that cannot be read is refused for what else is wrong with it.
      if (plan === null) continue
      try {
        const made = layStair({ ...plan, stairs: [] }, entry.words!)
        stairs.push(made.stair)
        guesses.push(...made.guesses.map((g) => `Line ${entry.line}: ${g}`), `Line ${entry.line}: ${stairSummary(made.layout)}.`)
        warnings.push(...made.warnings.map((w) => ({ code: 'rooms/stair-end', line: entry.line, message: `line ${entry.line}: ${w}` })))
      } catch (error) {
        if (!(error instanceof StairRefused)) throw error
        problems.push({ code: 'rooms/stair', line: entry.line, message: `line ${entry.line}: ${error.message}` })
      }
    }
    return { stairs, problems, warnings, guesses }
  }
}
