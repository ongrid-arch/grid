/**
 * VEW-86: the ground through its stated levels, and its profile along a line.
 *
 * With spot levels stated (`site.spotLevels`, C7), the ground is not one even slope: it passes
 * through every stated level. The levels are triangulated (Delaunay, Bowyer and Watson's way) and
 * the ground is read linearly inside each triangle; outside the triangles, at the nearest point of
 * their outer edges, so it runs on level from the last level stated. Levels that lie along one line
 * alone are read along that line and level across it; one level alone is the ground everywhere.
 * Two levels at one point are taken as their mean.
 *
 * `along` gives the ground's profile between two points of the plan: its level at each end, where
 * the line crosses an edge of a triangle and where it passes a stated level, the straight runs
 * between them merged. Inside the triangles that is the ground exactly; outside them, close to it.
 *
 * Pure, and never throws.
 */

import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'

/** VEW-86: a ground profile: `[distance along, level]` points, the distance rising, read linearly between them. */
export type GroundProfile = readonly (readonly [number, number])[]

/** One level at a point of the plan. */
export interface SpotPoint {
  readonly at: Vec2
  readonly level: number
}

/** The ground through its stated levels. */
export interface SpotGround {
  /** The ground's level at a point of the plan. */
  readonly at: (p: Vec2) => number
  /** The ground's profile from `a` to `b`, the distance along measured from `a`, in metres. */
  readonly along: (a: Vec2, b: Vec2) => GroundProfile
}

type Tri = readonly [number, number, number]

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x

/** The points with one level each: points closer than `noLength` taken as one, at their mean level. */
function merged(points: readonly SpotPoint[]): SpotPoint[] {
  const out: { at: Vec2; sum: number; count: number }[] = []
  const near = tolerance('noLength')
  for (const p of points) {
    if (!Number.isFinite(p.at.x) || !Number.isFinite(p.at.y) || !Number.isFinite(p.level)) continue
    const same = out.find((q) => Math.hypot(q.at.x - p.at.x, q.at.y - p.at.y) <= near)
    if (same === undefined) out.push({ at: p.at, sum: p.level, count: 1 })
    else {
      same.sum += p.level
      same.count += 1
    }
  }
  return out.map((q) => ({ at: q.at, level: q.sum / q.count }))
}

/** Whether `p` lies inside the circle through the triangle's corners (counter-clockwise). */
function inCircle(a: Vec2, b: Vec2, c: Vec2, p: Vec2): boolean {
  const [ax, ay, bx, by, cx, cy] = [a.x - p.x, a.y - p.y, b.x - p.x, b.y - p.y, c.x - p.x, c.y - p.y]
  return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > 0
}

/** The Delaunay triangles of the points, counter-clockwise, by index; none when they lie on one line. */
function triangulate(points: readonly Vec2[]): Tri[] {
  const n = points.length
  if (n < 3) return []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(x1 - x0, y1 - y0, 1)
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  // A triangle round them all, far out, taken away at the end.
  const all = [...points, { x: mid.x - 64 * span, y: mid.y - 32 * span }, { x: mid.x + 64 * span, y: mid.y - 32 * span }, { x: mid.x, y: mid.y + 64 * span }]
  let tris: Tri[] = [[n, n + 1, n + 2]]
  for (let i = 0; i < n; i++) {
    const p = all[i]!
    const bad = tris.filter(([a, b, c]) => inCircle(all[a]!, all[b]!, all[c]!, p))
    const edges = new Map<string, [number, number]>()
    for (const [a, b, c] of bad) {
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const key = u < v ? `${u},${v}` : `${v},${u}`
        if (edges.has(key)) edges.delete(key)
        else edges.set(key, [u, v])
      }
    }
    const gone = new Set(bad)
    tris = tris.filter((t) => !gone.has(t))
    for (const [u, v] of edges.values()) if (cross(sub(all[v]!, all[u]!), sub(p, all[u]!)) > 0) tris.push([u, v, i])
  }
  return tris.filter(([a, b, c]) => a < n && b < n && c < n)
}

/** The ground through `points`: see the module's header. */
export function spotGround(given: readonly SpotPoint[]): SpotGround {
  const points = merged(given)
  if (points.length === 0) return { at: () => 0, along: (a, b) => [[0, 0], [Math.hypot(b.x - a.x, b.y - a.y), 0]] }
  const at0 = points.map((p) => p.at)
  const tris = triangulate(at0)
  // The outer edges: each edge of one triangle only; for points on one line, the line between them in order.
  let outer: [number, number][]
  if (tris.length > 0) {
    const count = new Map<string, [number, number, number]>()
    for (const [a, b, c] of tris) {
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const key = u < v ? `${u},${v}` : `${v},${u}`
        const seen = count.get(key)
        count.set(key, seen === undefined ? [u, v, 1] : [seen[0], seen[1], seen[2] + 1])
      }
    }
    outer = [...count.values()].filter((e) => e[2] === 1).map((e) => [e[0], e[1]])
  } else {
    const first = at0[0]!
    const far = at0.reduce((best, p) => (Math.hypot(p.x - first.x, p.y - first.y) > Math.hypot(best.x - first.x, best.y - first.y) ? p : best), first)
    const d = sub(far, first)
    const order = at0.map((p, i) => ({ i, t: d.x * (p.x - first.x) + d.y * (p.y - first.y) })).sort((a, b) => a.t - b.t)
    outer = order.slice(1).map((o, k) => [order[k]!.i, o.i])
  }
  const edges = (() => {
    const keys = new Set<string>()
    const out: [number, number][] = [...outer]
    for (const [u, v] of outer) keys.add(u < v ? `${u},${v}` : `${v},${u}`)
    for (const [a, b, c] of tris) {
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const key = u < v ? `${u},${v}` : `${v},${u}`
        if (!keys.has(key)) {
          keys.add(key)
          out.push([u, v])
        }
      }
    }
    return out
  })()
  const near = tolerance('noLength')

  const at = (p: Vec2): number => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return points[0]!.level
    for (const [a, b, c] of tris) {
      const [pa, pb, pc] = [at0[a]!, at0[b]!, at0[c]!]
      const area = cross(sub(pb, pa), sub(pc, pa))
      if (!(area > 0)) continue
      const wa = cross(sub(pb, p), sub(pc, p)) / area
      const wb = cross(sub(pc, p), sub(pa, p)) / area
      const wc = 1 - wa - wb
      const slack = near / Math.sqrt(area)
      if (wa >= -slack && wb >= -slack && wc >= -slack) return wa * points[a]!.level + wb * points[b]!.level + wc * points[c]!.level
    }
    if (outer.length === 0) return points[0]!.level
    let best = Infinity
    let level = points[0]!.level
    for (const [u, v] of outer) {
      const [pu, pv] = [at0[u]!, at0[v]!]
      const d = sub(pv, pu)
      const len2 = d.x * d.x + d.y * d.y
      const t = len2 > 0 ? Math.max(0, Math.min(1, (d.x * (p.x - pu.x) + d.y * (p.y - pu.y)) / len2)) : 0
      const dist = Math.hypot(pu.x + d.x * t - p.x, pu.y + d.y * t - p.y)
      if (dist < best) {
        best = dist
        level = points[u]!.level + (points[v]!.level - points[u]!.level) * t
      }
    }
    return level
  }

  const along = (a: Vec2, b: Vec2): GroundProfile => {
    const d = sub(b, a)
    const length = Math.hypot(d.x, d.y)
    if (!(length > near)) return [[0, at(a)], [length, at(b)]]
    const ts = new Set<number>([0, 1])
    for (const [u, v] of edges) {
      const [pu, pv] = [at0[u]!, at0[v]!]
      const e = sub(pv, pu)
      const denom = cross(d, e)
      if (Math.abs(denom) <= near * near) continue
      const w = sub(pu, a)
      const t = cross(w, e) / denom
      const s = cross(w, d) / denom
      if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.add(t)
    }
    for (const p of at0) {
      const t = (d.x * (p.x - a.x) + d.y * (p.y - a.y)) / (length * length)
      if (t > 0 && t < 1) ts.add(t)
    }
    const raw = [...ts].sort((x, y) => x - y).map((t): [number, number] => [t * length, at({ x: a.x + d.x * t, y: a.y + d.y * t })])
    // The straight runs merged: a point on the line between its neighbours adds nothing.
    const out: [number, number][] = [raw[0]!]
    for (let i = 1; i < raw.length; i++) {
      const p = raw[i]!
      const last = out[out.length - 1]!
      if (!(p[0] - last[0] > near)) continue
      const next = raw[i + 1]
      if (next !== undefined && out.length >= 1) {
        const k = (p[0] - last[0]) / (next[0] - last[0])
        if (Math.abs(last[1] + (next[1] - last[1]) * k - p[1]) <= near) continue
      }
      out.push(p)
    }
    return out
  }

  return { at, along }
}

/** VEW-86: a profile's level at `x`: read linearly between its points, level beyond its ends. */
export function profileAt(profile: GroundProfile, x: number): number {
  const first = profile[0]
  if (first === undefined) return 0
  if (x <= first[0]) return first[1]
  for (let i = 1; i < profile.length; i++) {
    const [x1, z1] = profile[i]!
    if (x <= x1) {
      const [x0, z0] = profile[i - 1]!
      return x1 - x0 > 0 ? z0 + ((z1 - z0) * (x - x0)) / (x1 - x0) : z1
    }
  }
  return profile[profile.length - 1]![1]
}

/** VEW-86: a profile's points strictly between `x0` and `x1`, in order, with its level at each end: the ground line from one to the other. */
export function profileBetween(profile: GroundProfile, x0: number, x1: number): [number, number][] {
  return [[x0, profileAt(profile, x0)], ...profile.filter(([x]) => x > x0 && x < x1).map(([x, z]): [number, number] => [x, z]), [x1, profileAt(profile, x1)]]
}

/** VEW-86: the highest and the lowest ground of a profile from `x0` to `x1`. */
export function profileRange(profile: GroundProfile, x0: number, x1: number): { readonly low: number; readonly high: number } {
  const zs = profileBetween(profile, x0, x1).map(([, z]) => z)
  return { low: Math.min(...zs), high: Math.max(...zs) }
}
