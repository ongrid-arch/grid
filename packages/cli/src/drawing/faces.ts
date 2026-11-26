/**
 * CMD-43: rooms worked out from the faces of a drawing's walls, for a drawing with no room
 * outlines (a survey drawn as wall lines, an IFC storey with walls and no spaces).
 *
 * The reading, step by step:
 *
 * 1. The faces are cut where they meet or cross, and ends closer than `JOIN` are one point.
 * 2. A gap in a wall's face, where a door or window stands, is closed: an end of a face whose
 *    line runs on, within `GAP_WIDEST`, into the end of another face on the same line is joined
 *    to it, unless the join would cross a face. A wall's two faces closed at one gap are that
 *    opening's two sides.
 * 3. Faces that end in nothing are taken off, and the regions of the plane the rest bound are
 *    found by walking each face's left side: a region turned counter-clockwise is bounded, and
 *    one turned clockwise is the outline of a group of faces, the hole of the region round it.
 * 4. A region a room name stands in is a room; so is one wider than `ROOM_NARROWEST` (twice its
 *    area over its perimeter) and larger than `ROOM_SMALLEST`. The rest is wall.
 * 5. Two closed gaps facing each other across a wall, each with a room or the outside beyond it,
 *    are one opening between those two.
 * 6. The outside walls' thickness is the commonest distance from a room's face to the outline of
 *    the whole group, weighed by length.
 *
 * Pure: segments in metres in, rooms, openings and a thickness out.
 */
import { tolerance } from '@ongrid/floorplan/geometry/tolerances'
import { cross, dist, dot, inside, len, perimeter, signedArea, sub, unit, add, mul, type P } from './model'

/** Ends closer than this are one point, and a point this close to a face is on it (m). */
export const JOIN = 0.002
/** The widest gap in a wall's face that is closed as a door's or window's (m). */
export const GAP_WIDEST = 3.0
/** How far off its line a face's end may be and still continue it across a gap (m). */
const GAP_OFF_LINE = 0.005
/** A region narrower than this (twice its area over its perimeter) with no name in it is wall (m). */
export const ROOM_NARROWEST = 0.45
/** A region with less floor than this and no name in it is wall (m²). */
export const ROOM_SMALLEST = 0.5
/** The narrowest opening read from a closed gap (m). */
const OPENING_NARROWEST = 0.3

export interface FaceSegment {
  readonly a: P
  readonly b: P
  readonly source: string | null
}

export interface FaceRoom {
  /** Its inside faces, counter-clockwise. */
  readonly outline: P[]
  readonly area: number
  /** The rooms names found in it, by index into the names given. */
  readonly names: number[]
  /** Pieces of wall standing inside it (a column, a free-standing wall), left out. */
  readonly holes: number
}

export interface FaceGap {
  /** The middle of the opening, half-way through the wall. */
  readonly at: P
  readonly along: P
  readonly width: number
  /** The rooms either side by index into `rooms`, or -1 for the outside. */
  readonly sides: readonly [number, number]
}

export interface FaceReading {
  readonly rooms: FaceRoom[]
  readonly gaps: FaceGap[]
  /** The commonest outside wall thickness, or null when no room faces the outline. */
  readonly outside: number | null
  /** Regions read as wall, too narrow or too small to be a room, with no name in them. */
  readonly narrow: number
}

interface Edge {
  u: number
  v: number
  bridge: boolean
}

/** Rooms from wall faces. `names` are where the room names stand. */
export function roomsFromFaces(segments: readonly FaceSegment[], names: readonly P[]): FaceReading {
  // 1. Points and the faces cut where they meet.
  const pts: P[] = []
  const cell = new Map<string, number[]>()
  const key = (x: number, y: number): string => `${Math.floor(x / (JOIN * 4))},${Math.floor(y / (JOIN * 4))}`
  const pointOf = (p: P): number => {
    const cx = Math.floor(p[0] / (JOIN * 4))
    const cy = Math.floor(p[1] / (JOIN * 4))
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of cell.get(`${cx + dx},${cy + dy}`) ?? []) if (dist(pts[i]!, p) <= JOIN) return i
      }
    }
    pts.push(p)
    const k = key(p[0], p[1])
    cell.set(k, [...(cell.get(k) ?? []), pts.length - 1])
    return pts.length - 1
  }
  const segs = segments.filter((s) => dist(s.a, s.b) > JOIN)
  const cuts: number[][] = segs.map(() => [0, 1])
  const boxes = segs.map((s) => [Math.min(s.a[0], s.b[0]) - JOIN, Math.min(s.a[1], s.b[1]) - JOIN, Math.max(s.a[0], s.b[0]) + JOIN, Math.max(s.a[1], s.b[1]) + JOIN] as const)
  const order = segs.map((_, i) => i).sort((i, j) => boxes[i]![0] - boxes[j]![0])
  for (let x = 0; x < order.length; x++) {
    const i = order[x]!
    const bi = boxes[i]!
    for (let y = x + 1; y < order.length; y++) {
      const j = order[y]!
      const bj = boxes[j]!
      if (bj[0] > bi[2]) break
      if (bj[1] > bi[3] || bj[3] < bi[1]) continue
      meet(segs[i]!, segs[j]!, cuts[i]!, cuts[j]!)
    }
  }
  const edges: Edge[] = []
  const seen = new Set<string>()
  const addEdge = (u: number, v: number, bridge: boolean): boolean => {
    if (u === v) return false
    const k = u < v ? `${u}:${v}` : `${v}:${u}`
    if (seen.has(k)) return false
    seen.add(k)
    edges.push({ u, v, bridge })
    return true
  }
  segs.forEach((s, i) => {
    const ts = [...new Set(cuts[i]!.map((t) => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b)
    let last = pointOf(s.a)
    for (const t of ts.slice(1)) {
      const at = pointOf(t === 1 ? s.b : add(s.a, mul(sub(s.b, s.a), t)))
      addEdge(last, at, false)
      last = at
    }
  })

  // 2. Gaps closed.
  const around = (): Map<number, number[]> => {
    const out = new Map<number, number[]>()
    edges.forEach((e, k) => {
      out.set(e.u, [...(out.get(e.u) ?? []), k])
      out.set(e.v, [...(out.get(e.v) ?? []), k])
    })
    return out
  }
  let at = around()
  const other = (e: Edge, p: number): number => (e.u === p ? e.v : e.u)
  const dirFrom = (p: number, e: Edge): P => unit(sub(pts[other(e, p)]!, pts[p]!))
  const bridges: number[] = []
  const crossesAny = (a: P, b: P): boolean =>
    edges.some((e) => {
      const p = pts[e.u]!
      const q = pts[e.v]!
      if (Math.max(p[0], q[0]) < Math.min(a[0], b[0]) - JOIN || Math.min(p[0], q[0]) > Math.max(a[0], b[0]) + JOIN) return false
      if (Math.max(p[1], q[1]) < Math.min(a[1], b[1]) - JOIN || Math.min(p[1], q[1]) > Math.max(a[1], b[1]) + JOIN) return false
      return properCross(a, b, p, q)
    })
  for (let p = 0; p < pts.length; p++) {
    const mine = at.get(p) ?? []
    for (const k of mine) {
      // The face arrives at p going `d`: does it go on past p? If not, look along `d` for its other piece.
      const d = unit(sub(pts[p]!, pts[other(edges[k]!, p)]!))
      if (mine.some((j) => dot(dirFrom(p, edges[j]!), d) > 0.9999)) continue
      let best: { q: number; t: number } | null = null
      for (let q = 0; q < pts.length; q++) {
        if (q === p) continue
        const v = sub(pts[q]!, pts[p]!)
        const t = dot(v, d)
        if (t <= JOIN || t > GAP_WIDEST || Math.abs(cross(d, v)) > GAP_OFF_LINE) continue
        if (best !== null && t >= best.t) continue
        const theirs = at.get(q) ?? []
        if (!theirs.some((j) => dot(dirFrom(q, edges[j]!), d) > 0.9999)) continue
        if (theirs.some((j) => dot(dirFrom(q, edges[j]!), d) < -0.9999)) continue
        best = { q, t }
      }
      if (best === null || crossesAny(pts[p]!, pts[best.q]!)) continue
      // A point standing on the line between them would be crossed: the nearest is joined instead.
      if (addEdge(p, best.q, true)) {
        bridges.push(edges.length - 1)
        at = around()
      }
    }
  }

  // 3. Faces that end in nothing taken off, then the regions walked.
  const alive = edges.map(() => true)
  const degree = new Map<number, number>()
  edges.forEach((e) => {
    degree.set(e.u, (degree.get(e.u) ?? 0) + 1)
    degree.set(e.v, (degree.get(e.v) ?? 0) + 1)
  })
  let pruned = true
  while (pruned) {
    pruned = false
    edges.forEach((e, k) => {
      if (!alive[k]) return
      if ((degree.get(e.u) ?? 0) <= 1 || (degree.get(e.v) ?? 0) <= 1) {
        alive[k] = false
        degree.set(e.u, degree.get(e.u)! - 1)
        degree.set(e.v, degree.get(e.v)! - 1)
        pruned = true
      }
    })
  }
  // Half-edges: 2k from u to v, 2k+1 from v to u.
  const from = (h: number): number => (h % 2 === 0 ? edges[h >> 1]!.u : edges[h >> 1]!.v)
  const to = (h: number): number => (h % 2 === 0 ? edges[h >> 1]!.v : edges[h >> 1]!.u)
  const out = new Map<number, number[]>()
  edges.forEach((_, k) => {
    if (!alive[k]) return
    for (const h of [2 * k, 2 * k + 1]) out.set(from(h), [...(out.get(from(h)) ?? []), h])
  })
  const angle = (h: number): number => {
    const v = sub(pts[to(h)]!, pts[from(h)]!)
    return Math.atan2(v[1], v[0])
  }
  for (const list of out.values()) list.sort((x, y) => angle(x) - angle(y))
  const next = (h: number): number => {
    const list = out.get(to(h))!
    const twin = h ^ 1
    const i = list.indexOf(twin)
    return list[(i - 1 + list.length) % list.length]!
  }
  const cycleOf = new Map<number, number>()
  const cycles: { half: number[]; ring: P[]; area: number }[] = []
  for (const [, list] of out) {
    for (const h0 of list) {
      if (cycleOf.has(h0)) continue
      const half: number[] = []
      let h = h0
      let guard = 0
      while (!cycleOf.has(h) && guard++ < 1_000_000) {
        cycleOf.set(h, cycles.length)
        half.push(h)
        h = next(h)
      }
      const ring = half.map((x) => pts[from(x)]!)
      cycles.push({ half, ring, area: signedArea(ring) })
    }
  }
  // Groups of faces joined to each other: a clockwise cycle is a hole of a region of another group only.
  const group = pts.map((_, i) => i)
  const findGroup = (i: number): number => (group[i] === i ? i : (group[i] = findGroup(group[i]!)))
  edges.forEach((e, k) => {
    if (alive[k]) group[findGroup(e.u)] = findGroup(e.v)
  })
  const groupOf = (c: number): number => findGroup(from(cycles[c]!.half[0]!))
  const bounded = cycles.map((c, i) => i).filter((i) => cycles[i]!.area > 0)
  const holeOf = new Map<number, number>()
  for (let i = 0; i < cycles.length; i++) {
    if (cycles[i]!.area >= 0) continue
    const pt = cycles[i]!.ring[0]!
    let best = -1
    for (const j of bounded) {
      if (groupOf(j) === groupOf(i)) continue
      if (!inside(cycles[j]!.ring, pt)) continue
      if (best === -1 || cycles[j]!.area < cycles[best]!.area) best = j
    }
    holeOf.set(i, best)
  }
  const holes = new Map<number, number[]>()
  for (const [h, r] of holeOf) if (r !== -1) holes.set(r, [...(holes.get(r) ?? []), h])

  // 4. Rooms and wall.
  const roomIndex = new Map<number, number>()
  const rooms: FaceRoom[] = []
  let narrow = 0
  for (const i of bounded) {
    const c = cycles[i]!
    const hs = holes.get(i) ?? []
    const net = c.area + hs.reduce((s, h) => s + cycles[h]!.area, 0)
    const around = perimeter(c.ring) + hs.reduce((s, h) => s + perimeter(cycles[h]!.ring), 0)
    const named = names.flatMap((n, k) => (inside(c.ring, n) && !hs.some((h) => inside(cycles[h]!.ring, n)) ? [k] : []))
    const wide = (2 * net) / around > ROOM_NARROWEST && net > ROOM_SMALLEST
    if (named.length === 0 && !wide) {
      if (net >= ROOM_SMALLEST / 2 && (2 * net) / around >= 0.3 && hs.length === 0) narrow++
      continue
    }
    roomIndex.set(i, rooms.length)
    rooms.push({ outline: c.ring, area: net, names: named, holes: hs.length })
  }
  // Each cycle's region: a bounded cycle its own; a hole the region round it; -1 the outside.
  const regionOf = (c: number): number => (cycles[c]!.area > 0 ? c : (holeOf.get(c) ?? -1))
  const sideOf = (h: number): number => {
    const r = regionOf(cycleOf.get(h)!)
    if (r === -1) return -1
    return roomIndex.has(r) ? roomIndex.get(r)! : -2
  }

  // 5. Openings: closed gaps with wall on one side and a room or the outside on the other, two by two across a wall.
  interface Side {
    a: P
    b: P
    beyond: number
  }
  const sides: Side[] = []
  for (const k of bridges) {
    if (!alive[k]) continue
    const [l, r] = [sideOf(2 * k), sideOf(2 * k + 1)]
    if ((l === -2) === (r === -2)) continue
    const e = edges[k]!
    sides.push({ a: pts[e.u]!, b: pts[e.v]!, beyond: l === -2 ? r : l })
  }
  const used = new Set<number>()
  const gaps: FaceGap[] = []
  const widest = tolerance('roomsWallWidest')
  for (let i = 0; i < sides.length; i++) {
    if (used.has(i)) continue
    const s = sides[i]!
    const u = unit(sub(s.b, s.a))
    const ls = dist(s.a, s.b)
    let best: { j: number; lo: number; hi: number; across: number } | null = null
    for (let j = 0; j < sides.length; j++) {
      if (j === i || used.has(j)) continue
      const t = sides[j]!
      if (Math.abs(cross(u, unit(sub(t.b, t.a)))) > 0.02) continue
      const across = cross(u, sub(t.a, s.a))
      if (Math.abs(across) < JOIN || Math.abs(across) > widest + JOIN) continue
      const [t0, t1] = [dot(sub(t.a, s.a), u), dot(sub(t.b, s.a), u)].sort((x, y) => x - y) as [number, number]
      const lo = Math.max(0, t0)
      const hi = Math.min(ls, t1)
      if (hi - lo < 0.5 * Math.min(ls, t1 - t0)) continue
      if (best === null || Math.abs(across) < Math.abs(best.across)) best = { j, lo, hi, across }
    }
    if (best === null) continue
    const t = sides[best.j]!
    if (s.beyond === t.beyond) continue
    if (best.hi - best.lo < OPENING_NARROWEST) continue
    used.add(i)
    used.add(best.j)
    const mid = add(s.a, mul(u, (best.lo + best.hi) / 2))
    const n: P = [-u[1], u[0]]
    gaps.push({ at: add(mid, mul(n, best.across / 2)), along: u, width: best.hi - best.lo, sides: [s.beyond, t.beyond] })
  }

  // 6. The outside walls' thickness, from the outlines of the groups of faces.
  const outline: (readonly [P, P])[] = []
  for (let i = 0; i < cycles.length; i++) {
    if (cycles[i]!.area < 0 && holeOf.get(i) === -1) {
      const ring = cycles[i]!.ring
      ring.forEach((p, k) => outline.push([p, ring[(k + 1) % ring.length]!]))
    }
  }
  const tally = new Map<number, number>()
  for (const room of rooms) {
    const ring = room.outline
    ring.forEach((p, k) => {
      const q = ring[(k + 1) % ring.length]!
      const L = dist(p, q)
      if (L < 0.2) return
      const u = unit(sub(q, p))
      const mid = add(p, mul(sub(q, p), 0.5))
      let near: number | null = null
      for (const [a, b] of outline) {
        const v = sub(b, a)
        if (len(v) < JOIN || Math.abs(cross(u, unit(v))) > 0.02) continue
        // Outward from a counter-clockwise room is to the right of its face.
        const d = -cross(u, sub(a, mid))
        if (d <= 0.02 || d > widest + JOIN) continue
        const along = dot(sub(mid, a), unit(v))
        if (along < -JOIN || along > len(v) + JOIN) continue
        if (near === null || d < near) near = d
      }
      if (near === null) return
      const bin = Math.round(near / 0.005) * 0.005
      tally.set(bin, (tally.get(bin) ?? 0) + L)
    })
  }
  let outside: number | null = null
  let most = 0
  for (const [bin, weight] of tally) {
    if (weight > most) {
      most = weight
      outside = Math.round(bin * 1000) / 1000
    }
  }
  return { rooms: rooms.map((r) => ({ ...r, outline: r.outline.slice() })), gaps, outside, narrow }
}

/** Whether a to b and p to q cross at a point inside both, not at an end of either. */
function properCross(a: P, b: P, p: P, q: P): boolean {
  const d1 = cross(sub(b, a), sub(p, a))
  const d2 = cross(sub(b, a), sub(q, a))
  const d3 = cross(sub(q, p), sub(a, p))
  const d4 = cross(sub(q, p), sub(b, p))
  const e = JOIN * Math.max(dist(a, b), dist(p, q))
  if (Math.abs(d1) <= e || Math.abs(d2) <= e || Math.abs(d3) <= e || Math.abs(d4) <= e) {
    // Touching or along the same line: a point of one inside the other (away from its ends) is in the way.
    const onSeg = (x: P, s: P, t: P): boolean => {
      const L = dist(s, t)
      if (L === 0) return false
      const along = dot(sub(x, s), sub(t, s)) / L
      return Math.abs(cross(sub(t, s), sub(x, s))) / L <= JOIN && along > JOIN && along < L - JOIN
    }
    return onSeg(p, a, b) || onSeg(q, a, b)
  }
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0
}

/** Where two faces meet or cross: the points along each (0 to 1) to cut it at. */
function meet(s: { a: P; b: P }, t: { a: P; b: P }, cs: number[], ct: number[]): void {
  const r = sub(s.b, s.a)
  const q = sub(t.b, t.a)
  const Ls = len(r)
  const Lt = len(q)
  const onto = (p: P, a: P, v: P, L: number): number | null => {
    const along = dot(sub(p, a), v) / (L * L)
    const off = Math.abs(cross(v, sub(p, a))) / L
    return off <= JOIN && along * L >= -JOIN && along * L <= L + JOIN ? along : null
  }
  // Each end of one on the other.
  for (const p of [t.a, t.b]) {
    const x = onto(p, s.a, r, Ls)
    if (x !== null) cs.push(x)
  }
  for (const p of [s.a, s.b]) {
    const x = onto(p, t.a, q, Lt)
    if (x !== null) ct.push(x)
  }
  const den = cross(r, q)
  if (Math.abs(den) < 1e-12 * Ls * Lt) return
  const u = cross(sub(t.a, s.a), q) / den
  const v = cross(sub(t.a, s.a), r) / den
  if (u * Ls > JOIN && u * Ls < Ls - JOIN && v * Lt > JOIN && v * Lt < Lt - JOIN) {
    cs.push(u)
    ct.push(v)
  }
}
