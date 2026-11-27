/**
 * Curved rooms and walls in rooms text (WRT-78).
 *
 * A curved room (`circle`, `oval`, `arc`, `band`) or a curved side (`wall <room> <side> curve
 * radius <r>`) is first an outline whose curved stretches are traced by short straight pieces,
 * so the writer works out its walls as it does for any polygon. The pieces stand at fixed turns
 * from east (`CURVE_STEP`), whatever the curve, so two rooms on one centre (a round room and
 * the band round it) have pieces at the same angles that face each other one by one. Each room
 * keeps the circles its curves lie on (`CurveCircle`, its inside faces). Once the walls are
 * worked out, `curveWalls` joins the pieces of one curve between the same rooms into one curved
 * wall (C21's `arc`), with its ends moved exactly onto its circle, and the straight walls that
 * meet them moved along their own line with them, so the plan holds true arcs.
 *
 * Pure: points in, points out. Nothing here reads or writes a file.
 */
import { tolerance } from '../geometry/tolerances'

type P = readonly [number, number]

/** A circle a room's curved stretch lies on: its inside face, round `c` at radius `r`. */
export interface CurveCircle {
  readonly c: P
  readonly r: number
}

/** A curved outline: its corners counter-clockwise, and the circles its pieces lie on. */
export interface CurvedShape {
  readonly poly: P[]
  readonly curves: CurveCircle[]
}

const TURN = 2 * Math.PI

/** The turn between two stations of a curve's pieces: 2.5 degrees, so the compass points and the half and quarter points are stations. */
export const CURVE_STEP = TURN / 144

/** How near a corner must lie to a circle to be on it: the rounding of the arithmetic only. */
const onCircle = (): number => tolerance('joint')
/** A length or an angle too small to be one. */
const none = (): number => tolerance('noLength')

const at = (c: P, r: number, a: number): P => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]
const angleOf = (c: P, p: P): number => Math.atan2(p[1] - c[1], p[0] - c[0])
const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1])

/** An angle brought into [0, 2π). */
const wrap = (a: number): number => ((a % TURN) + TURN) % TURN

function signedArea(pts: readonly P[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

const ccw = (pts: P[]): P[] => (signedArea(pts) < 0 ? [...pts].reverse() : pts)

/**
 * The stations of an arc round `c` at radius `r`, from angle `a0` turning `sweep` radians
 * (counter-clockwise positive): both ends, and every multiple of `CURVE_STEP` between them that
 * is not within a quarter step of an end.
 */
export function arcPoints(c: P, r: number, a0: number, sweep: number): P[] {
  const lo = Math.min(a0, a0 + sweep)
  const hi = Math.max(a0, a0 + sweep)
  const margin = CURVE_STEP / 4
  const inner: number[] = []
  for (let k = Math.ceil((lo + margin) / CURVE_STEP); k * CURVE_STEP < hi - margin; k++) inner.push(k * CURVE_STEP)
  if (sweep < 0) inner.reverse()
  return [at(c, r, a0), ...inner.map((a) => at(c, r, a)), at(c, r, a0 + sweep)]
}

/** A round room `d` across, centred on `c`. */
export function circleShape(c: P, d: number): CurvedShape {
  const r = d / 2
  return { poly: arcPoints(c, r, 0, TURN).slice(0, -1), curves: [{ c, r }] }
}

/**
 * An oval `w` by `d` centred on `c`, as four arcs that meet without a kink: two small ones round
 * the ends of the long axis and two large ones along its sides, the small radius taken as the
 * ellipse's own at its ends (b²/a). A `w` equal to `d` is a circle.
 */
export function ovalShape(c: P, w: number, d: number): CurvedShape {
  if (Math.abs(w - d) < none()) return circleShape(c, w)
  const turned = d > w
  const a = Math.max(w, d) / 2
  const b = Math.min(w, d) / 2
  const small = (b * b) / a
  const large = ((a - small) ** 2 + b * b - small * small) / (2 * (b - small))
  const phi = Math.atan2(large - b, a - small)
  const arcs: Array<{ c: P; r: number; a0: number; sweep: number }> = [
    { c: [a - small, 0], r: small, a0: -phi, sweep: 2 * phi },
    { c: [0, b - large], r: large, a0: phi, sweep: Math.PI - 2 * phi },
    { c: [-(a - small), 0], r: small, a0: Math.PI - phi, sweep: 2 * phi },
    { c: [0, large - b], r: large, a0: Math.PI + phi, sweep: Math.PI - 2 * phi },
  ]
  // A tall oval is the wide one turned a quarter turn; the quarter is a whole number of steps.
  const place = (p: P): P => (turned ? [c[0] - p[1], c[1] + p[0]] : [c[0] + p[0], c[1] + p[1]])
  const poly: P[] = []
  const curves: CurveCircle[] = []
  for (const arc of arcs) {
    const a0 = arc.a0 + (turned ? Math.PI / 2 : 0)
    const centre = place(arc.c)
    curves.push({ c: centre, r: arc.r })
    poly.push(...arcPoints(centre, arc.r, a0, arc.sweep).slice(0, -1))
  }
  return { poly, curves }
}

/** The radius and centre of the arc from `p` to `q` turning `sweep` radians (its size, under 2π) out toward `n`. */
function arcOn(p: P, q: P, sweep: number, n: P): { c: P; r: number } {
  const chord = dist(p, q)
  const r = chord / (2 * Math.sin(sweep / 2))
  const m: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const back = r * Math.cos(sweep / 2)
  return { c: [m[0] - n[0] * back, m[1] - n[1] * back], r }
}

/** The stations from `p` to `q` round `c`, the way that passes through direction `n`. */
function arcThrough(c: P, r: number, p: P, q: P, n: P): P[] {
  const a0 = angleOf(c, p)
  const s = wrap(angleOf(c, q) - a0)
  const mid = a0 + s / 2
  const sweep = Math.cos(mid) * n[0] + Math.sin(mid) * n[1] >= 0 ? s : s - TURN
  const pts = arcPoints(c, r, a0, sweep)
  // The ends are the corners as given, not as worked out again.
  return [p, ...pts.slice(1, -1), q]
}

/**
 * A round end (an apse): the straight side from `p` to `q` and an arc turning `sweep` radians
 * (under 2π) out toward `n`, the side's outward direction.
 */
export function segmentShape(p: P, q: P, sweep: number, n: P): CurvedShape {
  const { c, r } = arcOn(p, q, sweep, n)
  return { poly: ccw(arcThrough(c, r, p, q, n)), curves: [{ c, r }] }
}

/**
 * The floor between radii `r1` and `r2` round `c`, from angle `from` turning `sweep` radians
 * (counter-clockwise positive, its size under 2π).
 */
export function bandShape(c: P, r1: number, r2: number, from: number, sweep: number): CurvedShape {
  const outer = arcPoints(c, r2, from, sweep)
  const inner = arcPoints(c, r1, from + sweep, -sweep)
  return { poly: ccw([...outer, ...inner]), curves: [{ c, r: r1 }, { c, r: r2 }] }
}

/**
 * A room's side `i` (from corner i to the next) of a counter-clockwise outline bowed into an arc
 * of radius `r`, out of the room or, `inward`, into it. Null when the radius is under half the
 * side, which no arc spans.
 */
export function bowedSide(poly: readonly P[], i: number, r: number, inward: boolean): CurvedShape | null {
  const p = poly[i]!
  const q = poly[(i + 1) % poly.length]!
  const L = dist(p, q)
  if (r < L / 2 - none()) return null
  const out: P = [(q[1] - p[1]) / L, -(q[0] - p[0]) / L]
  const n: P = inward ? [-out[0], -out[1]] : out
  const sweep = 2 * Math.asin(Math.min(1, L / (2 * r)))
  const { c } = arcOn(p, q, sweep, n)
  const pts = arcThrough(c, r, p, q, n)
  return { poly: [...poly.slice(0, i + 1), ...pts.slice(1, -1), ...poly.slice(i + 1)], curves: [{ c, r }] }
}

/** The circle of `curves` the piece from `p` to `q` is one piece of, or null for a straight side. */
export function curveOfPiece(curves: readonly CurveCircle[] | undefined, p: P, q: P): CurveCircle | null {
  if (curves === undefined) return null
  for (const curve of curves) {
    const off = onCircle() * Math.max(1, curve.r)
    if (Math.abs(dist(curve.c, p) - curve.r) > off || Math.abs(dist(curve.c, q) - curve.r) > off) continue
    const turn = Math.abs(Math.atan2(Math.sin(angleOf(curve.c, q) - angleOf(curve.c, p)), Math.cos(angleOf(curve.c, q) - angleOf(curve.c, p))))
    if (turn <= CURVE_STEP * 1.5) return curve
  }
  return null
}

/**
 * The true area of an outline whose pieces trace curves: the outline's own, and for each piece
 * of a curve the sliver between it and its arc, added where the curve bows out of the room and
 * taken off where it bows in.
 */
export function curvedArea(poly: readonly P[], curves: readonly CurveCircle[] | undefined): number {
  const signed = signedArea(poly)
  const sign = signed < 0 ? -1 : 1
  let area = Math.abs(signed)
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    const curve = curveOfPiece(curves, p, q)
    if (curve === null) continue
    const half = Math.min(1, dist(p, q) / (2 * curve.r))
    const phi = 2 * Math.asin(half)
    const sliver = (curve.r * curve.r * (phi - Math.sin(phi))) / 2
    // Outward from the room is to the right of p→q on a counter-clockwise outline.
    const out: P = [sign * (q[1] - p[1]), -sign * (q[0] - p[0])]
    const mid: P = [(p[0] + q[0]) / 2 - curve.c[0], (p[1] + q[1]) / 2 - curve.c[1]]
    area += mid[0] * out[0] + mid[1] * out[1] > 0 ? sliver : -sliver
  }
  return area
}

/** The corners of an outline that are corners of the room, not stations along one curve. */
export function cornerCount(poly: readonly P[], curves: readonly CurveCircle[] | undefined): number {
  let n = 0
  for (let i = 0; i < poly.length; i++) {
    const before = curveOfPiece(curves, poly[(i - 1 + poly.length) % poly.length]!, poly[i]!)
    const after = curveOfPiece(curves, poly[i]!, poly[(i + 1) % poly.length]!)
    if (before === null || after === null || before !== after) n++
  }
  return n
}

// ---------------------------------------------------------------------------------------------
// The pieces joined into curved walls

/** What `curveWalls` reads of a room's side as the writer works it out. */
export interface PieceEdge {
  readonly room: { readonly curves?: readonly CurveCircle[] | undefined }
  readonly p: P
  readonly q: P
  /** Outward from the room. */
  readonly n: P
}

/** What `curveWalls` reads of a stretch of wall: the sides it stands on, and its wall. */
export interface PieceRaw<W> {
  readonly sides: ReadonlyArray<readonly [number, number, number]>
  readonly reversed: boolean
  wall?: W
}

/** The written wall, as the plan file holds it. */
export interface PieceJson {
  id: string
  start: [number, number]
  end: [number, number]
  thickness: number
  height?: number
  kind: string
  virtual?: boolean
  railing?: boolean
  arc?: { centre: [number, number]; sweep: number }
}

/** What `curveWalls` reads and writes of a worked-out wall. */
export interface PieceWall<W> {
  id: string
  raws: Array<PieceRaw<W>>
  t: number
  kind: string
  virtual: boolean
  height: number | null
  railing?: boolean
  ext: boolean
  start: P
  end: P
  json: PieceJson
  sidesRooms: [string[], string[]]
}

/** A curved wall as `curveWalls` made it: its circle, along its centre line, and how it turns. */
export interface CurvedWall {
  readonly c: P
  /** The centre line's radius. */
  readonly rho: number
  /** Where `start` lies seen from the centre, in radians counter-clockwise from east. */
  readonly a0: number
  /** Radians from `start` to `end`, counter-clockwise positive; ±2π for a whole circle. */
  readonly sweep: number
  readonly length: number
  readonly closed: boolean
}

interface Piece<W> {
  wall: W
  c: P
  rho: number
  t: number
  /** Its two ends counter-clockwise round the centre. */
  a: P
  b: P
  key: string
}

/** Where a whole circle starts and ends: its south-west point, away from the compass points doors are most often written at. */
const CLOSED_START = (5 * Math.PI) / 4

/**
 * Joins the walls that are pieces of one curve, between the same rooms and of the same make,
 * into one curved wall each, and gives each wall that met them its end on the curve. Returns
 * the walls, each merged one in the place of its first piece, and the curves made, by wall.
 */
export function curveWalls<W extends PieceWall<W>>(walls: W[], edges: readonly PieceEdge[], fix: (v: number) => number): { walls: W[]; curved: Map<W, CurvedWall> } {
  const curved = new Map<W, CurvedWall>()
  const pieces: Array<Piece<W>> = []
  for (const w of walls) {
    let centre: P | null = null
    let inner: number | null = null
    let outer: number | null = null
    let all = w.raws.length > 0
    for (const r of w.raws) {
      for (const [idx] of r.sides) {
        const e = edges[idx]
        const curve = e === undefined ? null : curveOfPiece(e.room.curves, e.p, e.q)
        if (e === undefined || curve === null || (centre !== null && dist(centre, curve.c) > onCircle())) {
          all = false
          break
        }
        centre = curve.c
        const mid: P = [(e.p[0] + e.q[0]) / 2 - curve.c[0], (e.p[1] + e.q[1]) / 2 - curve.c[1]]
        const convex = mid[0] * e.n[0] + mid[1] * e.n[1] > 0
        if (convex) inner = curve.r
        else outer = curve.r
      }
      if (!all) break
    }
    if (!all || centre === null || (inner === null && outer === null)) continue
    const c = centre
    // Between two rooms on one curve the wall fills the gap between their faces, whose pieces stand a little nearer.
    const t = inner !== null && outer !== null ? outer - inner : w.t
    const rho = inner !== null && outer !== null ? (inner + outer) / 2 : inner !== null ? inner + t / 2 : outer! - t / 2
    const turnsLeft = (w.start[0] - c[0]) * (w.end[1] - c[1]) - (w.start[1] - c[1]) * (w.end[0] - c[0]) > 0
    const [a, b] = turnsLeft ? [w.start, w.end] : [w.end, w.start]
    const rooms = [...new Set(w.sidesRooms.flat())].sort().join(',')
    const key = [fix(c[0]), fix(c[1]), Math.round(rho * 1e5), Math.round(t * 1e5), w.kind, w.virtual, w.height, w.railing === true, w.ext, rooms].join('\u0000')
    pieces.push({ wall: w, c, rho, t, a, b, key })
  }
  if (pieces.length === 0) return { walls, curved }
  const groups = new Map<string, Array<Piece<W>>>()
  for (const piece of pieces) groups.set(piece.key, [...(groups.get(piece.key) ?? []), piece])
  const joined = new Map<W, W>()
  const out = new Set<W>()
  for (const piece of pieces) out.add(piece.wall)
  const straight = walls.filter((w) => !out.has(w))
  const near = (p: P, q: P): boolean => dist(p, q) < tolerance('roomsCurveJoint')
  /**
   * Where a joint of a curve's pieces moves to, on the curve: where the straight wall ending
   * there that moves least meets the circle along its own line, else straight out from the
   * centre. A joint two curves share moves once, for both.
   */
  const snapped: Array<{ from: P; to: P }> = []
  const snap = (x: P, c: P, rho: number, own: ReadonlySet<W>): P => {
    const known = snapped.find((m) => near(m.from, x))
    if (known !== undefined) return known.to
    let best: P | null = null
    for (const w of straight) {
      for (const [p, other] of [[w.start, w.end], [w.end, w.start]] as const) {
        if (!near(p, x)) continue
        const y = lineMeetsCircle(other, p, c, rho)
        if (y !== null && (best === null || dist(y, x) < dist(best, x))) best = y
      }
    }
    // An end no other wall meets, where the curve stops short in the body of a wall that ends
    // nearby (where its pieces are shorter than the walls round them are thick): the curve is
    // carried on to where that wall's line meets it, and that wall's end with it.
    const alone = best === null && !walls.some((w) => !own.has(w) && (near(w.start, x) || near(w.end, x)))
    if (alone) {
      let reach: { from: P; to: P } | null = null
      for (const w of straight) {
        for (const [p, other] of [[w.start, w.end], [w.end, w.start]] as const) {
          if (dist(p, x) > tolerance('roomsWallWidest')) continue
          const y = lineMeetsCircle(other, p, c, rho)
          if (y !== null && dist(y, x) <= tolerance('roomsWallWidest') && (reach === null || dist(y, p) < dist(reach.to, reach.from))) reach = { from: p, to: y }
        }
      }
      if (reach !== null) {
        snapped.push(reach)
        best = reach.to
      }
    }
    const to = best ?? at(c, rho, angleOf(c, x))
    snapped.push({ from: x, to })
    return to
  }
  for (const group of groups.values()) {
    for (const chain of chainsOf(group)) {
      const first = chain.pieces[0]!
      const last = chain.pieces[chain.pieces.length - 1]!
      const { c, rho } = first
      // Counter-clockwise from `lo` to `hi`.
      let lo: P
      let hi: P
      const own = new Set(chain.pieces.map((p) => p.wall))
      if (chain.closed) lo = hi = at(c, rho, CLOSED_START)
      else {
        lo = snap(first.a, c, rho, own)
        hi = snap(last.b, c, rho, own)
      }
      // The joints along it, where a wall standing against the curve meets it.
      for (const piece of chain.pieces.slice(1)) snap(piece.a, c, rho, own)
      if (chain.closed) snap(first.a, c, rho, own)
      const sweep = chain.closed ? TURN : wrap(angleOf(c, hi) - angleOf(c, lo))
      // A run of no length is left as it was, to be left out with the other walls of no length.
      if (!chain.closed && (sweep < none() || sweep > TURN - none())) continue
      // An outside wall runs with its room on its left, as each of its pieces does; a wall
      // between two rooms runs counter-clockwise, unless the text turns it round.
      const firstWall = first.wall
      const turnsLeft = (firstWall.start[0] - c[0]) * (firstWall.end[1] - c[1]) - (firstWall.start[1] - c[1]) * (firstWall.end[0] - c[0]) > 0
      const reversed = chain.pieces.some((p) => p.wall.raws.some((r) => r.reversed))
      const clockwise = firstWall.ext ? !turnsLeft : reversed
      const start = clockwise ? hi : lo
      const finish = clockwise ? lo : hi
      const signed = clockwise ? -sweep : sweep
      const merged: W = { ...firstWall, t: first.t, raws: chain.pieces.flatMap((p) => p.wall.raws), start, end: finish }
      const fs: [number, number] = [fix(start[0]), fix(start[1])]
      const fc: [number, number] = [fix(c[0]), fix(c[1])]
      // The sweep as the written ends and centre give it, so the end lies where the sweep takes the start.
      const written = chain.closed ? signed : Math.sign(signed) * (clockwise ? wrap(angleOf(fc, fs) - angleOf(fc, [fix(finish[0]), fix(finish[1])])) : wrap(angleOf(fc, [fix(finish[0]), fix(finish[1])]) - angleOf(fc, fs)))
      merged.json = {
        ...firstWall.json,
        thickness: fix(first.t),
        start: fs,
        end: [fix(finish[0]), fix(finish[1])],
        arc: { centre: fc, sweep: Math.round(((written * 180) / Math.PI) * 1e6) / 1e6 },
      }
      for (const r of merged.raws) r.wall = merged
      for (const piece of chain.pieces) joined.set(piece.wall, merged)
      joined.set(merged, merged)
      curved.set(merged, { c, rho, a0: angleOf(c, start), sweep: signed, length: rho * sweep, closed: chain.closed })
    }
  }
  // A curved wall is named as its first piece was, less the piece's number, when no other wall has that name.
  const taken = new Set(straight.map((w) => w.id))
  for (const merged of curved.keys()) {
    const base = merged.id.replace(/-\d+$/, '')
    let id = base
    for (let k = 2; taken.has(id); k++) id = `${base}-${k}`
    taken.add(id)
    merged.id = id
    merged.json = { ...merged.json, id }
  }
  // The straight walls that ended on a joint of a curve end where it moved to.
  const result: W[] = []
  const placed = new Set<W>()
  for (const w of walls) {
    const merged = joined.get(w)
    if (merged !== undefined) {
      if (!placed.has(merged)) {
        placed.add(merged)
        result.push(merged)
      }
      continue
    }
    const moved = (p: P): P => snapped.find((m) => near(m.from, p))?.to ?? p
    const [s0, e0] = [moved(w.start), moved(w.end)]
    if (s0 !== w.start || e0 !== w.end) {
      w.start = s0
      w.end = e0
      w.json = { ...w.json, start: [fix(s0[0]), fix(s0[1])], end: [fix(e0[0]), fix(e0[1])] }
    }
    result.push(w)
  }
  return { walls: result, curved }
}

/** The point where the line from `from` through `p` meets the circle, the one nearest `p`. */
function lineMeetsCircle(from: P, p: P, c: P, rho: number): P | null {
  const d: P = [p[0] - from[0], p[1] - from[1]]
  const L = Math.hypot(d[0], d[1])
  if (L < none()) return null
  const u: P = [d[0] / L, d[1] / L]
  const f: P = [p[0] - c[0], p[1] - c[1]]
  const bq = f[0] * u[0] + f[1] * u[1]
  const disc = bq * bq - (f[0] * f[0] + f[1] * f[1] - rho * rho)
  if (disc < 0) return null
  const roots = [-bq - Math.sqrt(disc), -bq + Math.sqrt(disc)]
  const t = roots.reduce((x, y) => (Math.abs(y) < Math.abs(x) ? y : x))
  if (Math.abs(t) > tolerance('roomsWallWidest')) return null
  return [p[0] + u[0] * t, p[1] + u[1] * t]
}

/** The pieces of one group in runs that meet end to end, counter-clockwise; a run that comes round to its start is closed. */
function chainsOf<W>(group: ReadonlyArray<Piece<W>>): Array<{ pieces: Array<Piece<W>>; closed: boolean }> {
  const left = [...group].sort((x, y) => wrap(angleOf(x.c, x.a)) - wrap(angleOf(y.c, y.a)))
  const chains: Array<{ pieces: Array<Piece<W>>; closed: boolean }> = []
  const near = (p: P, q: P): boolean => dist(p, q) < tolerance('roomsCurveJoint')
  while (left.length > 0) {
    const run = [left.shift()!]
    // Forward from its end, then back from its start.
    for (let grown = true; grown; ) {
      grown = false
      const k = left.findIndex((x) => near(x.a, run[run.length - 1]!.b))
      if (k >= 0) {
        run.push(left.splice(k, 1)[0]!)
        grown = true
      }
    }
    for (let grown = true; grown; ) {
      grown = false
      const k = left.findIndex((x) => near(x.b, run[0]!.a))
      if (k >= 0) {
        run.unshift(left.splice(k, 1)[0]!)
        grown = true
      }
    }
    chains.push({ pieces: run, closed: run.length > 2 && near(run[run.length - 1]!.b, run[0]!.a) })
  }
  return chains
}

// ---------------------------------------------------------------------------------------------
// Along a curved wall

/** How far along the wall, from its start, the point of its curve in direction `angle` from the centre lies; null when the curve does not reach it. */
export function stationAt(curve: CurvedWall, angle: number): number | null {
  const turned = curve.sweep >= 0 ? wrap(angle - curve.a0) : wrap(curve.a0 - angle)
  const s = turned * curve.rho
  if (curve.closed) return s
  return s <= curve.length + none() ? s : null
}

/** The point `s` along the wall's centre line, and the way the wall runs there. */
export function frameAt(curve: CurvedWall, s: number): { point: P; along: P; outward: P } {
  const sign = curve.sweep >= 0 ? 1 : -1
  const a = curve.a0 + (sign * s) / curve.rho
  const outward: P = [Math.cos(a), Math.sin(a)]
  return { point: at(curve.c, curve.rho, a), along: [-sign * outward[1], sign * outward[0]], outward }
}

/** The direction, in radians from east, of the point of `curve` a room sees when it looks `look`, or null when the curve has no such point inside its ends. */
export function facingAngle(curve: CurvedWall, look: P, roomInside: boolean): number | null {
  const a = Math.atan2(roomInside ? look[1] : -look[1], roomInside ? look[0] : -look[0])
  const s = stationAt(curve, a)
  if (s === null) return null
  if (!curve.closed && (s < onCircle() || s > curve.length - onCircle())) return null
  return a
}

// ---------------------------------------------------------------------------------------------
// A curved raw wall written by its ends (WRT-82)

/** Why a raw wall's curve, written by its ends, names no curve. */
export type ArcFormFault = 'mixed' | 'twice' | 'ends' | 'point' | 'line' | 'radius' | 'side' | 'bulge'

/** A raw wall as rooms text reads it: the plan file's JSON, its fields not yet checked. */
type RawWall = Record<string, unknown>

const isPoint = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
/** To the micrometre (or micro-degree), with no negative zero. */
const keep6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0

/**
 * The centre and sweep (C21, degrees counter-clockwise positive) of the arc from `s` to `e` that
 * turns `sweep` radians, signed, its size under a whole turn: the centre is off the chord's
 * middle to its left by half the chord over the tangent of half the sweep.
 */
function arcOfSweep(s: P, e: P, sweep: number): { centre: [number, number]; sweep: number } {
  const L = dist(s, e)
  const left: P = [-(e[1] - s[1]) / L, (e[0] - s[0]) / L]
  const back = L / 2 / Math.tan(sweep / 2)
  const c: P = [(s[0] + e[0]) / 2 + left[0] * back, (s[1] + e[1]) / 2 + left[1] * back]
  const centre: [number, number] = [keep6(c[0]), keep6(c[1])]
  // The sweep as the written centre gives it, so the end lies where the sweep takes the start.
  const turned = wrap(angleOf(centre, e) - angleOf(centre, s))
  const written = sweep > 0 ? turned : turned - TURN
  return { centre, sweep: keep6((written * 180) / Math.PI) }
}

/**
 * The arc from `s` to `e` through `t`, by its ends and a point on it; from `s` to `e` at radius
 * `r`, bowing to `side` going from start to end, the shorter way; or by its `bulge`, the tangent
 * of a quarter of its sweep, positive counter-clockwise, as CAD drawings store it (0 is straight:
 * null). A fault when the words name no curve.
 */
export function arcOfEnds(
  s: P,
  e: P,
  form: { readonly through: P } | { readonly radius: number; readonly side: 'left' | 'right' } | { readonly bulge: number }
): { centre: [number, number]; sweep: number } | null | { fault: ArcFormFault } {
  const L = dist(s, e)
  if (L < none()) return { fault: 'ends' }
  if ('through' in form) {
    const t = form.through
    if (dist(t, s) < onCircle() || dist(t, e) < onCircle()) return { fault: 'point' }
    const cross = (e[0] - s[0]) * (t[1] - s[1]) - (e[1] - s[1]) * (t[0] - s[0])
    if (Math.abs(cross) / L < onCircle()) return { fault: 'line' }
    // A point to the right of start to end is on a counter-clockwise arc, as a positive bulge is.
    const ccw = cross < 0
    // The angle at the point on the arc is π less half the sweep: the inscribed angle.
    const u: P = [s[0] - t[0], s[1] - t[1]]
    const v: P = [e[0] - t[0], e[1] - t[1]]
    const inscribed = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)))))
    const size = 2 * (Math.PI - inscribed)
    return arcOfSweep(s, e, ccw ? size : -size)
  }
  if ('radius' in form) {
    if (!(form.radius > 0) || form.radius < L / 2 - none()) return { fault: 'radius' }
    const size = 2 * Math.asin(Math.min(1, L / (2 * form.radius)))
    return arcOfSweep(s, e, form.side === 'right' ? size : -size)
  }
  if (form.bulge === 0) return null
  return arcOfSweep(s, e, 4 * Math.atan(form.bulge))
}

/**
 * A raw wall with its ends and curve as the plan file holds them: `from` and `to` read as
 * `start` and `end` (on the wall or in its `arc`), a `bulge` on the wall read as the arc's, and an
 * arc written `through` a point, by `radius` and `side`, or by `bulge` turned into its centre and
 * sweep. A wall written the plan file's way is returned as it was; a fault when the words name
 * no curve or say it two ways.
 */
export function rawWallEnds(part: RawWall): { part: RawWall } | { fault: ArcFormFault } {
  let wall: RawWall = { ...part }
  const arcIn = wall['arc']
  let arc: Record<string, unknown> | null = typeof arcIn === 'object' && arcIn !== null && !Array.isArray(arcIn) ? { ...(arcIn as Record<string, unknown>) } : null
  if (wall['bulge'] !== undefined) {
    if (arc !== null) return { fault: 'twice' }
    arc = { bulge: wall['bulge'] }
    delete wall['bulge']
  }
  const ends = (from: Record<string, unknown>, into: RawWall): { fault: ArcFormFault } | null => {
    for (const [word, field] of [['from', 'start'], ['to', 'end']] as const) {
      if (from[word] === undefined) continue
      if (into[field] !== undefined && into[field] !== from[word]) return { fault: 'twice' }
      into[field] = from[word]
      delete from[word]
    }
    return null
  }
  const onWall = ends(wall, wall)
  if (onWall !== null) return onWall
  if (arc !== null) {
    const inArc = ends(arc, wall)
    if (inArc !== null) return inArc
  }
  if (arc === null) return { part: wall }
  const forms = [arc['centre'] !== undefined || arc['sweep'] !== undefined, arc['through'] !== undefined, arc['radius'] !== undefined || arc['side'] !== undefined, arc['bulge'] !== undefined].filter(Boolean).length
  if (forms > 1) return { fault: 'mixed' }
  if (forms === 0 || arc['centre'] !== undefined || arc['sweep'] !== undefined) return { part: { ...wall, arc } }
  const s = wall['start']
  const e = wall['end']
  if (!isPoint(s) || !isPoint(e)) return { fault: 'ends' }
  const { through, radius, side, bulge, ...rest } = arc
  let made: ReturnType<typeof arcOfEnds>
  if (through !== undefined) {
    if (!isPoint(through)) return { fault: 'point' }
    made = arcOfEnds(s, e, { through })
  } else if (bulge !== undefined) {
    if (typeof bulge !== 'number' || !Number.isFinite(bulge)) return { fault: 'bulge' }
    made = arcOfEnds(s, e, { bulge })
  } else {
    if (side !== 'left' && side !== 'right') return { fault: 'side' }
    if (typeof radius !== 'number' || !Number.isFinite(radius)) return { fault: 'radius' }
    made = arcOfEnds(s, e, { radius, side })
  }
  if (made !== null && 'fault' in made) return made
  if (made === null) {
    delete wall['arc']
    return { part: wall }
  }
  wall = { ...wall, arc: { ...rest, centre: made.centre, sweep: made.sweep } }
  return { part: wall }
}
