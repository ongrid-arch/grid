/**
 * A bay window in rooms text (WRT-88): one line puts a bay into a room's side, curved or canted,
 * with its windows.
 *
 *   bay in <room> <side>, [centred | <m> from <end>,] <w> wide, <d> deep, curved | canted [<deg>] [, windows <n> [<w> wide]]
 *
 * The bay stands out of the room's one straight side facing `<side>` (or `<side>.<k>`, counted
 * as an opening's side is), centred on it unless `<m> from <end>` places its near edge that far
 * from that end of the side. Its width and depth measure to the room's inside faces. A curved
 * bay is an arc whose chord is the width, bowing out that deep (at most a half circle); a canted
 * bay is a front and two cheeks, each cheek turning from the side by the angle written or
 * `bayCantAngle`. The outline is changed at once, so the walls are worked out as any other: a
 * curved bay is one curved wall (C21), a canted one three straight walls.
 *
 * `windows <n>` puts n windows in it: on a canted bay 3 (one in each facet) or 1 (the front);
 * on a curved bay n spread evenly along the curve. Without a width each fills its facet, or its
 * share of the curve, less `bayWindowPier` at each end. Each window is aimed at its facet, or at
 * the direction from the curve's centre to its middle, so the compiler places it there.
 *
 * Pure: words and points in, points out. Nothing here reads or writes a file.
 */
import { english, num, said } from '../messages/say'
import { limit, tolerance } from '../geometry/tolerances'
import { arcBetween, type CurveCircle } from './curves'
import { f2, isNumberWord, numberOf, RoomsStop, type PlainNumbers } from './words'

type P = readonly [number, number]

/** What a bay line says, before the room's side is known. */
export interface BayWords {
  readonly room: string
  readonly side: string
  /** Where along the side: centred, or its near edge `dist` from the end named. */
  readonly place: { readonly centred: true } | { readonly centred: false; readonly dist: number; readonly from: string }
  readonly width: number
  readonly depth: number
  readonly shape: 'curved' | 'canted'
  /** A canted bay's cheek angle from the side, in degrees. */
  readonly angle: number
  readonly windows: number
  /** The windows' width when the line states it. */
  readonly windowWidth: number | null
}

/** Where a bay's window goes: the straight facet it is centred on, or the direction from the bay's centre to its middle. */
export type BayAim = { readonly facet: readonly [P, P] } | { readonly centre: P; readonly angle: number }

/** A bay worked out on a room's side: the new outline, the circle of a curved bay, and its windows. */
export interface BayShape {
  readonly poly: P[]
  readonly curves: CurveCircle[]
  /** A canted bay's three facets, from the side's start: cheek, front, cheek. */
  readonly facets: ReadonlyArray<readonly [P, P]>
  readonly windows: ReadonlyArray<{ readonly aim: BayAim; readonly width: number }>
}

const stop = (code: string, message: string, at: number): never => {
  throw new RoomsStop(code, message, at)
}

/** The words of a `bay in ...` line (`t`, its words without commas). */
export function readBayLine(t: readonly string[], at: number, plain: PlainNumbers): BayWords {
  if (t.length < 4 || t[1] !== 'in') stop('rooms/syntax', english(said('rooms.bay.form', { line: at })), at)
  const room = t[2]!
  const side = t[3]!
  let place: BayWords['place'] = { centred: true }
  let width: number | null = null
  let depth: number | null = null
  let shape: BayWords['shape'] | null = null
  let angle: number | null = null
  let windows = 0
  let windowWidth: number | null = null
  let i = 4
  while (i < t.length) {
    const w = t[i]!
    if (w === 'centred' || w === 'centered') i++
    else if (t[i + 1] === 'from' && t[i + 2] !== undefined && isNumberWord(w)) {
      place = { centred: false, dist: numberOf(w, at, plain), from: t[i + 2]! }
      i += 3
    } else if (t[i + 1] === 'wide' && isNumberWord(w)) {
      width = numberOf(w, at, plain)
      i += 2
    } else if (t[i + 1] === 'deep' && isNumberWord(w)) {
      depth = numberOf(w, at, plain)
      i += 2
    } else if (w === 'curved' || w === 'canted') {
      if (shape !== null) stop('rooms/syntax', english(said('rooms.bay.shape', { line: at })), at)
      shape = w
      i++
      if (w === 'canted' && t[i] !== undefined && /^[0-9]+(?:\.[0-9]+)?$/.test(t[i]!) && !['from', 'wide', 'deep'].includes(t[i + 1] ?? '')) {
        angle = Number(t[i])
        i++
      }
    } else if (w === 'windows' && t[i + 1] !== undefined) {
      const n = t[i + 1]!
      if (!/^[0-9]+$/.test(n)) stop('rooms/syntax', english(said('rooms.bay.windowNumber', { line: at, word: n })), at)
      windows = Number(n)
      i += 2
      if (t[i + 1] === 'wide' && t[i] !== undefined && isNumberWord(t[i]!)) {
        windowWidth = numberOf(t[i]!, at, plain)
        i += 2
      }
    } else stop('rooms/syntax', english(said('rooms.bay.unknownWord', { line: at, word: w })), at)
  }
  if (shape === null) stop('rooms/syntax', english(said('rooms.bay.shape', { line: at })), at)
  if (width === null || depth === null || !(width > 0) || !(depth > 0)) stop('rooms/size', english(said('rooms.bay.size', { line: at })), at)
  if (shape === 'curved' && angle !== null) stop('rooms/syntax', english(said('rooms.bay.unknownWord', { line: at, word: String(angle) })), at)
  const cant = angle ?? limit('bayCantAngle')
  if (!(cant > 0 && cant < 90)) stop('rooms/size', english(said('rooms.bay.angle', { line: at, angle: String(cant) })), at)
  if (shape === 'canted' && windows !== 0 && windows !== 1 && windows !== 3) stop('rooms/syntax', english(said('rooms.bay.windowCount', { line: at, count: String(windows) })), at)
  if (windowWidth !== null && !(windowWidth > 0)) stop('rooms/size', english(said('rooms.bay.size', { line: at })), at)
  return { room, side, place, width: width!, depth: depth!, shape: shape!, angle: cant, windows, windowWidth }
}

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * The bay of `bay` put into side `i` of a counter-clockwise room outline, its near edge `s0`
 * along the side from corner `i`. Refuses, by line `at`, a bay that runs past the side or leaves
 * a stretch of it beside it shorter than its `wall` thickness (it may start at a corner), a curved
 * bay past a half circle, a canted bay with no front, and windows that do not fit.
 */
export function bayOnSide(poly: readonly P[], i: number, s0: number, bay: BayWords, at: number, wall: number): BayShape {
  const p = poly[i]!
  const q = poly[(i + 1) % poly.length]!
  const L = dist(p, q)
  const none = tolerance('noLength')
  const { width: w, depth: d } = bay
  if (s0 < -none || s0 + w > L + none) {
    stop('rooms/size', english(said('rooms.bay.past', { line: at, width: num(f2(w)), room: bay.room, side: bay.side, from: num(f2(s0)), to: num(f2(s0 + w)), length: num(f2(L)) })), at)
  }
  for (const left of [s0, L - s0 - w]) {
    if (left > none && left < wall - none) stop('rooms/size', english(said('rooms.bay.stub', { line: at, room: bay.room, side: bay.side, left: num(f2(left)), wall: num(f2(wall)) })), at)
  }
  const u: P = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]
  const n: P = [u[1], -u[0]]
  const a = add(p, mul(u, Math.max(0, s0)))
  const b = add(p, mul(u, Math.min(L, s0 + w)))
  // A bay that starts or ends at a corner of the room starts or ends the side there.
  const keep = (pts: P[]): P[] => pts.filter((x, k) => !((k === 0 && dist(x, p) < none) || (k === pts.length - 1 && dist(x, q) < none)))
  const piers = (count: number, length: number): number => bay.windowWidth ?? (length - (count + 1) * limit('bayWindowPier')) / count
  const fits = (count: number, width: number, length: number, key: 'rooms.bay.windowFitFacet' | 'rooms.bay.windowFitCurve'): void => {
    if (!(width > 0) || count * width > length + none) stop('rooms/size', english(said(key, { line: at, count: String(count), width: num(f2(width)), length: num(f2(length)) })), at)
  }
  if (bay.shape === 'curved') {
    if (d > w / 2 + none) stop('rooms/size', english(said('rooms.bay.deep', { line: at, width: num(f2(w)), most: num(f2(w / 2)), depth: num(f2(d)) })), at)
    // The chord and the depth (its sagitta) give the turn: the tangent of a quarter of it is 2d/w.
    const sweep = 4 * Math.atan((2 * d) / w)
    const { pts, curve } = arcBetween(a, b, sweep, n)
    const out = [...poly.slice(0, i + 1), ...keep([a, ...pts.slice(1, -1), b]), ...poly.slice(i + 1)]
    const windows: Array<{ aim: BayAim; width: number }> = []
    if (bay.windows > 0) {
      const arcLength = curve.r * sweep
      const ww = piers(bay.windows, arcLength)
      fits(bay.windows, ww, arcLength, 'rooms.bay.windowFitCurve')
      const gap = (arcLength - bay.windows * ww) / (bay.windows + 1)
      const start = Math.atan2(a[1] - curve.c[1], a[0] - curve.c[0])
      // From the bay's first end toward its middle, which lies the way the side faces.
      const turn = (a[0] - curve.c[0]) * n[1] - (a[1] - curve.c[1]) * n[0] > 0 ? 1 : -1
      for (let k = 0; k < bay.windows; k++) {
        const s = gap + k * (ww + gap) + ww / 2
        windows.push({ aim: { centre: curve.c, angle: start + (turn * s) / curve.r }, width: ww })
      }
    }
    return { poly: out, curves: [curve], facets: [], windows }
  }
  const run = d / Math.tan((bay.angle * Math.PI) / 180)
  if (w - 2 * run < none) stop('rooms/size', english(said('rooms.bay.canted', { line: at, width: num(f2(w)), depth: num(f2(d)), angle: String(bay.angle), cheeks: num(f2(2 * run)) })), at)
  const front0 = add(add(a, mul(u, run)), mul(n, d))
  const front1 = add(add(b, mul(u, -run)), mul(n, d))
  const out = [...poly.slice(0, i + 1), ...keep([a, front0, front1, b]), ...poly.slice(i + 1)]
  const facets: Array<readonly [P, P]> = [[a, front0], [front0, front1], [front1, b]]
  const glazed = bay.windows === 3 ? facets : bay.windows === 1 ? [facets[1]!] : []
  const windows = glazed.map((f) => {
    const length = dist(f[0], f[1])
    const ww = piers(1, length)
    fits(1, ww, length, 'rooms.bay.windowFitFacet')
    return { aim: { facet: f }, width: ww }
  })
  return { poly: out, curves: [], facets, windows }
}
