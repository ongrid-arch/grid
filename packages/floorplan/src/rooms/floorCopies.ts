/**
 * Floors copied turned, moved or scaled, and floors repeated so (LVL-22):
 *
 *   copy <floor> [with openings] [turn <deg> [clockwise]] [about x,y] [move dx,dy] [scale <s>]
 *   repeat floors <n> from <floor> [as <first id>] [with openings] [turn <deg> [clockwise]]
 *          [about x,y] [move dx,dy] [scale <s>] [rise <m>]
 *
 * A turn is in degrees counter-clockwise on the drawing, as `north` reads its degrees, or
 * clockwise with the word after it. The floor turns about `about`, else the middle of the box
 * round its rooms, and is scaled about the same point; the move comes after both. A repeat writes
 * `n` floors after the one it repeats, the k-th turned k times the turn, moved k times the move,
 * scaled by the scale to the power k and standing k times `rise` above it, each worked out from
 * the floor it repeats, so the last carries no rounding of the ones before it.
 *
 * A scale keeps the walls as thick as they are: each face of a room moves with the centre line
 * of its wall (half the gap to the room it faces, else half the inside thickness), so a floor
 * scaled by 0.9 keeps its partitions and its rooms are smaller. Doors and windows keep their
 * widths and distances; the side a line names and the end a distance is measured from turn with
 * the floor, worked out from the room's own sides.
 *
 * Pure: words in, the copies' figures out. The compiler (`compile.ts`) places the rooms.
 */
import { english, joined, said, type MessageKey, type Values } from '../messages/say'
import { tolerance } from '../geometry/tolerances'
import { isPointWord, metres, numberOf, pointOf, RoomsStop, type PlainNumbers } from './words'

type P = readonly [number, number]

/** The most floors one repeat line writes: a tall tower, not a city. */
export const FLOORS_REPEAT_MAX = 200

/** The sides of the drawing and their half-way ways, as the compiler names a room's sides. */
const S2 = Math.SQRT1_2
const COMPASS: Readonly<Record<string, P>> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], ne: [S2, S2], nw: [-S2, S2], se: [S2, -S2], sw: [-S2, -S2] }
/** How near a side's outward way is to a compass word for the side to face it, as the compiler reads one (`facing`). */
const FACES = 0.9

/** What a copy line says after the floor it takes. */
export interface CopyWords {
  readonly from: string
  readonly openings: boolean
  /** Degrees counter-clockwise. */
  readonly turn: number
  readonly about: P | null
  readonly move: P
  readonly scale: number
}

/** What a `repeat floors` line says. */
export interface RepeatFloorsWords extends CopyWords {
  readonly count: number
  readonly first: string | null
  readonly rise: number | null
}

/** One copy's transform: about `about`, scaled by `scale`, turned `turn` degrees, then moved. */
export interface FloorTransform {
  readonly turn: number
  readonly about: P
  readonly move: P
  readonly scale: number
}

const refuse = (at: number, key: MessageKey, values: Values = {}): never => {
  throw new RoomsStop('rooms/syntax', english(said(key, { line: at, ...values })), at)
}

/** A plain number, degrees or a share: `2`, `-2.5`, `2deg`, `2°`. */
function plainNumber(word: string | undefined): number | null {
  if (word === undefined) return null
  const bare = word.replace(/(°|deg|degrees)$/, '')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(bare)) return null
  const value = Number(bare)
  return Number.isFinite(value) ? value : null
}

/** The words after the floor, from `i` on: what a copy and a repeat share, and what a repeat adds. */
function readTransformWords(t: readonly string[], i: number, at: number, plain: PlainNumbers, repeat: boolean): Omit<RepeatFloorsWords, 'from' | 'count'> {
  const form = said(repeat ? 'rooms.repeatFloors.form' : 'rooms.copy.form')
  const seen = new Set<string>()
  let openings = false
  let turn = 0
  let about: P | null = null
  let move: P = [0, 0]
  let scale = 1
  let first: string | null = null
  let rise: number | null = null
  const takes = (word: string): never => refuse(at, 'rooms.copy.takes', { word, takes: said(`rooms.copy.takes.${word}` as MessageKey), form })
  while (i < t.length) {
    const word = t[i]!
    const value = t[i + 1]
    const known = ['with', 'turn', 'about', 'move', 'scale', ...(repeat ? ['as', 'rise'] : [])]
    if (!known.includes(word)) refuse(at, 'rooms.copy.unknown', { word, form })
    if (seen.has(word)) refuse(at, 'rooms.copy.twice', { word, form })
    seen.add(word)
    i += 2
    if (word === 'with') {
      if (value !== 'openings') refuse(at, 'rooms.copy.unknown', { word: value === undefined ? word : `${word} ${value}`, form })
      openings = true
    } else if (word === 'turn') {
      const degrees = plainNumber(value)
      if (degrees === null) takes(word)
      const way = t[i]
      const clockwise = way === 'clockwise' || way === 'cw'
      if (clockwise || way === 'counter-clockwise' || way === 'anticlockwise' || way === 'ccw') i++
      turn = clockwise ? -degrees! : degrees!
    } else if (word === 'about' || word === 'move') {
      if (value === undefined || !isPointWord(value)) takes(word)
      const point = pointOf(value!, at, plain)
      if (word === 'about') about = point
      else move = point
    } else if (word === 'scale') {
      const share = plainNumber(value)
      if (share === null || !(share > 0)) takes(word)
      scale = share!
    } else if (word === 'as') {
      if (value === undefined || known.includes(value)) takes(word)
      first = value!
    } else {
      if (value === undefined || known.includes(value)) takes(word)
      rise = numberOf(value!, at, plain)
    }
  }
  return { openings, turn, about, move, scale, first, rise }
}

/** `copy <floor> ...`: the floor it takes and how, from the words of the line (`t[0]` is `copy`). */
export function readCopyWords(t: readonly string[], at: number, plain: PlainNumbers): CopyWords {
  const { openings, turn, about, move, scale } = readTransformWords(t, 2, at, plain, false)
  return { from: t[1]!, openings, turn, about, move, scale }
}

/** `repeat floors <n> from <floor> ...`, from the words of the line (`t[0]` is `repeat`, `t[1]` `floors`). */
export function readRepeatFloors(t: readonly string[], at: number, plain: PlainNumbers): RepeatFloorsWords {
  const form = said('rooms.repeatFloors.form')
  const count = plainNumber(t[2])
  if (count === null || !Number.isInteger(count) || count < 1 || count > FLOORS_REPEAT_MAX) refuse(at, 'rooms.repeatFloors.count', { word: t[2] ?? '', max: FLOORS_REPEAT_MAX, form })
  if (t[3] !== 'from' || t[4] === undefined) refuse(at, 'rooms.repeatFloors.from', { form })
  return { from: t[4]!, count: count!, ...readTransformWords(t, 5, at, plain, true) }
}

/** Whether a line asks for a plain copy, in the same place. */
export function inPlace(words: Pick<CopyWords, 'turn' | 'move' | 'scale'>): boolean {
  return words.turn === 0 && words.move[0] === 0 && words.move[1] === 0 && words.scale === 1
}

/**
 * The ids a repeat writes: counting up from the first id's digits, keeping their width (`f00`
 * gives `f01`, `f02`; `as l1` gives `l1`, `l2`), else the id with a number after it (`typ` gives
 * `typ2`, `typ3`).
 */
export function repeatedIds(from: string, first: string | null, count: number): string[] {
  const start = first ?? from
  const digits = /^(.*?)(\d+)$/.exec(start)
  const step = first === null ? 1 : 0
  return Array.from({ length: count }, (_, k) => {
    if (digits !== null) return `${digits[1]}${String(Number(digits[2]) + k + step).padStart(digits[2]!.length, '0')}`
    return first === null ? `${start}${k + 2}` : k === 0 ? start : `${start}${k + 1}`
  })
}

/** The k-th copy's transform (k from 1): k times the turn and the move, the scale to the power k. */
export function nthTransform(words: Pick<CopyWords, 'turn' | 'move' | 'scale'>, about: P, k: number): FloorTransform {
  return { turn: words.turn * k, about, move: [words.move[0] * k, words.move[1] * k], scale: words.scale ** k }
}

/** The middle of the box round the rooms' corners. */
export function middleOf(polys: readonly (readonly P[])[]): P {
  const xs = polys.flatMap((poly) => poly.map((p) => p[0]))
  const ys = polys.flatMap((poly) => poly.map((p) => p[1]))
  if (xs.length === 0) return [0, 0]
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

const rad = (degrees: number): number => (degrees * Math.PI) / 180

/** A way on the drawing turned with the floor. */
function turnWay(v: P, tr: FloorTransform): P {
  const c = Math.cos(rad(tr.turn))
  const s = Math.sin(rad(tr.turn))
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

/** A point turned and moved, and scaled about the same point, with no wall to keep: a floor's outline. */
export function turnPoint(p: P, tr: FloorTransform): P {
  const [dx, dy] = turnWay([(p[0] - tr.about[0]) * tr.scale, (p[1] - tr.about[1]) * tr.scale], tr)
  return [tr.about[0] + dx + tr.move[0], tr.about[1] + dy + tr.move[1]]
}

/** A room's sides as the compiler reads them: each from a corner to the next, with its outward way. */
interface Side {
  readonly p: P
  readonly q: P
  readonly u: P
  readonly n: P
  readonly L: number
}

function sidesOf(poly: readonly P[]): Side[] {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!
    const L = Math.hypot(q[0] - p[0], q[1] - p[1])
    const u: P = L > 0 ? [(q[0] - p[0]) / L, (q[1] - p[1]) / L] : [1, 0]
    return { p, q, u, n: [u[1], -u[0]], L }
  })
}

const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
const cross = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]

/**
 * Each room's corners on the copy, by id: turned and moved, and under a scale each side moved
 * with the centre line of its wall, half the gap to the room it faces, else `halfWall`.
 */
export function turnedRooms(rooms: ReadonlyArray<{ readonly id: string; readonly poly: readonly P[] }>, tr: FloorTransform, halfWall: number): Map<string, P[]> {
  const out = new Map<string, P[]>()
  if (tr.scale === 1) {
    for (const r of rooms) out.set(r.id, r.poly.map((p) => turnPoint(p, tr)))
    return out
  }
  const all = rooms.map((r) => ({ id: r.id, sides: sidesOf(r.poly) }))
  const widest = tolerance('roomsWallWidest')
  const joint = tolerance('joint')
  for (const r of rooms) {
    const mine = all.find((x) => x.id === r.id)!.sides
    // Each side's line, n . x = c, moved to its wall's centre line, scaled about the point and moved back.
    const lines = mine.map((e) => {
      let gap: number | null = null
      for (const other of all) {
        if (other.id === r.id) continue
        for (const f of other.sides) {
          if (dot(e.u, f.u) >= 0 || Math.abs(cross(e.u, f.u)) > tolerance('parallel')) continue
          const sa = dot([f.q[0] - e.p[0], f.q[1] - e.p[1]], e.u)
          const sb = dot([f.p[0] - e.p[0], f.p[1] - e.p[1]], e.u)
          if (Math.min(e.L, Math.max(sa, sb)) - Math.max(0, Math.min(sa, sb)) <= joint) continue
          const d = dot([f.p[0] - e.p[0], f.p[1] - e.p[1]], e.n)
          if (d < -joint || d > widest + joint) continue
          gap = gap === null ? Math.max(d, 0) : Math.min(gap, Math.max(d, 0))
        }
      }
      const h = gap === null ? halfWall : gap / 2
      const np = dot(e.n, tr.about)
      return { n: e.n, c: np + tr.scale * (dot(e.n, e.p) + h - np) - h }
    })
    const poly = r.poly.map((p, i) => {
      const a = lines[(i - 1 + lines.length) % lines.length]!
      const b = lines[i]!
      const det = cross(a.n, b.n)
      let x: P
      if (Math.abs(det) <= tolerance('parallel')) {
        const scaled: P = [tr.about[0] + tr.scale * (p[0] - tr.about[0]), tr.about[1] + tr.scale * (p[1] - tr.about[1])]
        const off = b.c - dot(b.n, scaled)
        x = [scaled[0] + b.n[0] * off, scaled[1] + b.n[1] * off]
      } else {
        x = [(a.c * b.n[1] - b.c * a.n[1]) / det, (a.n[0] * b.c - b.n[0] * a.c) / det]
      }
      return turnPoint(x, { ...tr, scale: 1 })
    })
    out.set(r.id, poly)
  }
  return out
}

/** The compass word nearest a way, of the eight (`table` narrows it). */
function compassOf(v: P, table: Readonly<Record<string, P>> = COMPASS): string {
  return Object.keys(table).reduce((best, k) => (dot(v, table[k]!) > dot(v, table[best]!) ? k : best))
}

/** A room's sides facing a compass word, in the compiler's order: from the west, then the south. */
function facing(sides: readonly Side[], word: string): number[] {
  const way = COMPASS[word]!
  return sides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => dot(s.n, way) > FACES)
    .sort((a, b) => a.s.p[0] + a.s.q[0] - (b.s.p[0] + b.s.q[0]) || a.s.p[1] + a.s.q[1] - (b.s.p[1] + b.s.q[1]))
    .map(({ i }) => i)
}

/** The word a line picks side `i` by: `east`, or `east.2` when more than one side faces east. */
function sideWord(sides: readonly Side[], i: number): string {
  const word = compassOf(sides[i]!.n)
  const hits = facing(sides, word)
  return hits.length > 1 ? `${word}.${hits.indexOf(i) + 1}` : word
}

/**
 * A room's side word (`south`, `south.2`) on the copy: the same side of the room, named by the
 * way it faces once turned. A word that names no one side is left as written, for the copy's
 * line to be refused as the floor's would be.
 */
export function turnedSide(before: readonly P[], after: readonly P[], word: string): string {
  const [side, ks] = word.split('.', 2) as [string, string | undefined]
  if (!Object.hasOwn(COMPASS, side)) return word
  const sides = sidesOf(before)
  const hits = facing(sides, side)
  const k = ks === undefined ? (hits.length === 1 ? 1 : null) : Number(ks)
  if (k === null || !Number.isInteger(k) || k < 1 || k > hits.length) return word
  return sideWord(sidesOf(after), hits[k - 1]!)
}

/** Every side word (no `.k`) of a room's sides that face `word`, once turned: the walls a wall line names. */
export function turnedSides(before: readonly P[], after: readonly P[], word: string): string[] {
  if (!Object.hasOwn(COMPASS, word)) return [word]
  const sides = sidesOf(before)
  const turned = sidesOf(after)
  const words = sides.flatMap((s, i) => (compassOf(s.n) === word ? [compassOf(turned[i]!.n)] : []))
  return words.length === 0 ? [word] : [...new Set(words)]
}

/**
 * The words of a door, window or opening line on the copy: the side after `in <room>`, the end a
 * distance is measured `from` and a compass word after `hinged`, turned with the floor.
 */
export function turnedOpeningWords(words: readonly string[], polys: (room: string) => { before: readonly P[]; after: readonly P[] } | undefined, tr: FloorTransform): string[] {
  const way = (word: string): string => (Object.hasOwn(COMPASS, word) ? compassOf(turnWay(COMPASS[word]!, tr)) : word)
  return words.map((w, i) => {
    if (i === 4 && words[2] === 'in') {
      const room = polys(words[3]!)
      return room === undefined ? w : turnedSide(room.before, room.after, w)
    }
    const before = words[i - 1]
    if (before === 'from' && words[i - 2] !== 'seen') return way(w)
    if (before === 'hinged') return way(w)
    return w
  })
}

/** A repeat's floors in words, for the answer: how each stands to the one below. */
export function repeatSaid(at: number, from: string, ids: readonly string[], words: RepeatFloorsWords): string {
  const each = [
    ...(words.turn === 0 ? [] : [said('rooms.repeatFloors.each.turn', { turn: metres(Math.abs(words.turn)), way: said(words.turn > 0 ? 'rooms.repeatFloors.ccw' : 'rooms.repeatFloors.cw') })]),
    ...(words.move[0] === 0 && words.move[1] === 0 ? [] : [said('rooms.repeatFloors.each.move', { dx: metres(words.move[0]), dy: metres(words.move[1]) })]),
    ...(words.scale === 1 ? [] : [said('rooms.repeatFloors.each.scale', { scale: metres(words.scale) })]),
    ...(words.rise === null ? [] : [said('rooms.repeatFloors.each.rise', { rise: metres(words.rise) })]),
  ]
  const key: MessageKey = each.length === 0 ? 'rooms.repeatFloors.wrote' : 'rooms.repeatFloors.wroteEach'
  return english(said(key, { line: at, count: ids.length, from, first: ids[0]!, last: ids[ids.length - 1]!, each: joined(each, 'join.semicolon') }))
}
