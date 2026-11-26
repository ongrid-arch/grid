/**
 * CMD-43: a drawing as Grid reads it, the same for a DXF and an IFC file, before it is written
 * as rooms text (`toRooms.ts`). Lengths are in metres, points on the plan (x east, y north, C4);
 * every part keeps the DXF handle or IFC GlobalId it came from (`source`).
 *
 * Pure: types and the small geometry the readers share.
 */

export type P = readonly [number, number]

/** What a DXF layer, or an IFC class, was read as. */
export const LAYER_ROLES = ['walls', 'doors', 'windows', 'openings', 'rooms', 'names', 'nothing'] as const
export type LayerRole = (typeof LAYER_ROLES)[number]

/** One layer (or IFC class) of the drawing: how many entities it holds, what it was read as and why. */
export interface LayerUse {
  readonly layer: string
  readonly entities: number
  readonly readAs: LayerRole
  /** `name`: its name says so; `asked`: the call's layers said so; `content`: what it holds; `class`: an IFC class. */
  readonly why: 'name' | 'asked' | 'content' | 'class'
}

/** A storey of the drawing: an IFC storey, or the one floor of a DXF (no floor line). */
export interface DrawnFloor {
  readonly key: string
  readonly name: string
  /** Metres above the drawing's zero, as the file states it; null when it states none. */
  readonly elevation: number | null
  /** The ceiling height its spaces are drawn to, when they say. */
  readonly height: number | null
  readonly source: string | null
}

/** A room as drawn: its inside faces, counter-clockwise, and what its label says. */
export interface DrawnRoom {
  readonly floor: string
  readonly outline: readonly P[]
  readonly name: string | null
  readonly number: string | null
  /** The area its label states, in square metres, when it states one. */
  readonly statedArea: number | null
  /** The use the file states for it (an IFC space's object type), when it states one. */
  readonly use?: string | null
  readonly source: string | null
  /** How the outline was read: a closed outline on a rooms layer, an IFC space, or the faces of the walls round it. */
  readonly from: 'outline' | 'space' | 'faces'
}

export type OpeningKind = 'door' | 'window' | 'opening'

/** A door, window or doorless opening as drawn: where its middle is, along which line, how wide. */
export interface DrawnOpening {
  readonly floor: string
  readonly kind: OpeningKind
  readonly at: P
  /** The direction along its wall, when the drawing gives one. */
  readonly along: P | null
  readonly width: number
  readonly height: number | null
  readonly sill: number | null
  readonly source: string | null
  /** A gap in the wall's faces, an insert placed with no gap, or an IFC element. */
  readonly how: 'gap' | 'insert' | 'element'
}

/** A wall's source, for matching the walls Grid works out back to it: its faces or its footprint. */
export interface DrawnWall {
  readonly floor: string
  readonly source: string
  readonly faces: readonly (readonly [P, P])[]
  readonly footprint: readonly P[] | null
  readonly height: number | null
}

/** The length unit a drawing was read in. */
export interface DrawingUnit {
  readonly name: string
  /** Metres per unit of the file. */
  readonly scale: number
  readonly from: 'file' | 'asked' | 'guessed'
}

export interface Drawing {
  readonly format: 'dxf' | 'ifc'
  readonly unit: DrawingUnit
  /** Empty for a DXF: its one floor has no floor line. */
  readonly floors: readonly DrawnFloor[]
  readonly rooms: readonly DrawnRoom[]
  readonly openings: readonly DrawnOpening[]
  readonly walls: readonly DrawnWall[]
  /** The commonest distance from a room's face to the building's outline, per floor (`''` for a DXF), when there is one. */
  readonly outside: ReadonlyMap<string, number>
  /** The walls' height, when the drawing gives one. */
  readonly wallHeight: number | null
  readonly layers: readonly LayerUse[]
  /** What was assumed, one sentence each, to confirm with the person. */
  readonly assumed: readonly string[]
  /** What the drawing holds that the rooms text does not write, one sentence each. */
  readonly leftOut: readonly string[]
}

/** Why a drawing was not read: one line, naming the file's part, never its text. */
export class DrawingRefused extends Error {
  override readonly name = 'DrawingRefused'
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
export const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
export const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
export const cross = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
export const len = (a: P): number => Math.hypot(a[0], a[1])
export const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const unit = (a: P): P => {
  const n = len(a)
  return n === 0 ? [1, 0] : [a[0] / n, a[1] / n]
}

/** Twice nothing: the signed area of a ring, counter-clockwise positive. */
export function signedArea(ring: readonly P[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

export function perimeter(ring: readonly P[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) s += dist(ring[i]!, ring[(i + 1) % ring.length]!)
  return s
}

/** Whether a point is inside a ring (on its edge counts as either). */
export function inside(ring: readonly P[], pt: P): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

/** A ring counter-clockwise, its repeated points and the points on a straight line between their neighbours taken out. */
export function tidyRing(ring: readonly P[], straight: number): P[] {
  let pts: P[] = []
  for (const p of ring) if (pts.length === 0 || dist(pts[pts.length - 1]!, p) > straight) pts.push(p)
  if (pts.length > 1 && dist(pts[0]!, pts[pts.length - 1]!) <= straight) pts.pop()
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!
      const b = pts[i]!
      const c = pts[(i + 1) % pts.length]!
      const ac = dist(a, c)
      if (ac === 0 || Math.abs(cross(sub(c, a), sub(b, a))) / ac <= straight) {
        pts = [...pts.slice(0, i), ...pts.slice(i + 1)]
        changed = true
        i--
      }
    }
  }
  if (signedArea(pts) < 0) pts = pts.reverse()
  return pts
}

/** The points of an arc from `a0` turning `sweep` radians round `c`, no piece further than `off` from the curve, at most 64 pieces. */
export function arcPoints(c: P, r: number, a0: number, sweep: number, off: number): P[] {
  const step = r <= off ? Math.PI / 2 : 2 * Math.acos(1 - off / r)
  const n = Math.min(64, Math.max(1, Math.ceil(Math.abs(sweep) / step)))
  const out: P[] = []
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])
  }
  return out
}

/** The points of a DXF bulge from `p` to `q` (the tangent of a quarter of its sweep), `p` and `q` included. */
export function bulgePoints(p: P, q: P, bulge: number, off: number): P[] {
  const c = dist(p, q)
  if (bulge === 0 || c === 0) return [p, q]
  const sweep = 4 * Math.atan(bulge)
  const r = c / (2 * Math.abs(Math.sin(sweep / 2)))
  const v = unit(sub(q, p))
  const left: P = [-v[1], v[0]]
  const centre = add(add(p, mul(sub(q, p), 0.5)), mul(left, (c / 2) * ((1 - bulge * bulge) / (2 * bulge))))
  const a0 = Math.atan2(p[1] - centre[1], p[0] - centre[0])
  const pts = arcPoints(centre, r, a0, sweep, off)
  pts[0] = p
  pts[pts.length - 1] = q
  return pts
}

/** A word folded for matching a layer or block name: lower case, accents off. */
export function folded(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** `n` things, with the right word for one or many. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** A length in metres as rooms text writes it: to a tenth of a millimetre, with no trailing zeros. */
export function m(value: number): string {
  const r = Math.round(value * 10000) / 10000
  return (Object.is(r, -0) ? 0 : r).toString()
}
