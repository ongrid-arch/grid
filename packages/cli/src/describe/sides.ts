/**
 * CMD-49: a room's outline read as the sides a person names. A curve is traced by short straight
 * pieces (a curved wall's stations, CNT-18; rooms text's curves, WRT-78), and a person calls
 * them one curved side, with its radius and its length along the curve; a room of four sides
 * turned on the drawing has its own sides, not the box round it.
 *
 * Read from the outline's points alone, so a curve drawn as many short straight walls is one
 * side too, and `grid describe` (which reads outlines) and `grid_measure` (which also knows the
 * wall under each piece) say the same. Pure: points in, sides out.
 */
import { tolerance, type Vec2 } from '@ongrid/floorplan/geometry'

/** The most a curve's pieces turn at one corner: a curve traced every 2.5 degrees turns 2.5 at each. */
const PIECE_TURN = (10 * Math.PI) / 180
/** How near its corners must lie to one circle for pieces to be one curved side, in metres: a curve drawn to the centimetre is one. */
const ON_CIRCLE_M = 0.01
/** The least a curve turns through: pieces that turn less in all are a side drawn a little off straight. */
const LEAST_SWEEP = (5 * Math.PI) / 180
/** The fewest pieces read as a curve: two pieces with a kink between them are two sides. */
const MIN_PIECES = 3
/** A corner within this of a right angle is square, for a turned rectangle. */
const SQUARE_CORNER = (0.5 * Math.PI) / 180
/** A side within this of the drawing's axes is square to the drawing. */
const ON_AXIS = (0.05 * Math.PI) / 180
/** Two lengths or centres this close are the same, in metres. */
const SAME_M = 0.01
const TURN = 2 * Math.PI

/** The circle a curved side lies on. */
export interface SideCurve {
  readonly centre: Vec2
  readonly radius: number
  /** The angle it turns through round its centre from its start to its end, counter-clockwise positive, in radians. */
  readonly sweep: number
}

/** One side of a ring: a straight piece, or a run of pieces on one circle. */
export interface RingSide {
  /** The index of its first piece (from point `first` to the next) and how many pieces it takes. */
  readonly first: number
  readonly pieces: number
  readonly from: Vec2
  readonly to: Vec2
  /** Its length: along the curve for a curved side. */
  readonly length: number
  readonly curve: SideCurve | null
  /** The way out of the room at its middle (the floor is on the left of the ring). */
  readonly out: Vec2
}

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const angleBetween = (a: Vec2, b: Vec2): number => Math.atan2(cross(a, b), dot(a, b))

/**
 * The circle nearest a run of points, by least squares on the circle's equation (taken about
 * their mean, so far from the origin is as good as near it), or null when they lie in a line.
 */
function circleNear(points: readonly Vec2[]): { centre: Vec2; radius: number } | null {
  const mean = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length }
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (const p of points) {
    const u = p.x - mean.x
    const v = p.y - mean.y
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < tolerance('noArea') * Math.max(1, (suu + svv) ** 2)) return null
  const bu = (suuu + suvv) / 2
  const bv = (svvv + svuu) / 2
  const uc = (bu * svv - bv * suv) / det
  const vc = (bv * suu - bu * suv) / det
  const centre = { x: uc + mean.x, y: vc + mean.y }
  return { centre, radius: Math.sqrt(uc * uc + vc * vc + (suu + svv) / points.length) }
}

/**
 * The sides of a ring of points, going round it from a corner. `key` gives each piece (from point
 * i to the next) a key of the caller's, such as the wall it lies on: a curve is split where it
 * changes.
 */
export function ringSides(ring: readonly Vec2[], key?: (piece: number) => string | null): RingSide[] {
  const n = ring.length
  if (n < 2) return []
  const at = (i: number): Vec2 => ring[((i % n) + n) % n]!
  const dir = (i: number): Vec2 => sub(at(i + 1), at(i))
  const keyOf = (i: number): string | null => (key === undefined ? null : key(((i % n) + n) % n))
  /** The turn at point i, from the piece before it to the piece after it. */
  const turn = (i: number): number => angleBetween(dir(i - 1), dir(i))
  /** A corner a curve may run on through: a small turn, between pieces of one key. */
  const onward = (i: number): boolean => Math.abs(turn(i)) <= PIECE_TURN && keyOf(i - 1) === keyOf(i)
  const smooth = (i: number): boolean => onward(i) && Math.abs(turn(i)) > tolerance('sameAngle')
  // Start at a corner, so no curve is cut in two; a ring with none (a circle, an oval) starts at 0.
  let start = 0
  while (start < n && smooth(start)) start++
  const cornerless = start === n
  if (cornerless) start = 0

  /** The circle points first..first+pieces lie on, or null when they lie on none. */
  const curveOf = (first: number, pieces: number): SideCurve | null => {
    const points = Array.from({ length: pieces + 1 }, (_, k) => at(first + k))
    const whole = pieces >= n
    const circle = circleNear(whole ? points.slice(0, -1) : points)
    if (circle === null) return null
    if (points.some((p) => Math.abs(Math.hypot(p.x - circle.centre.x, p.y - circle.centre.y) - circle.radius) > ON_CIRCLE_M)) return null
    let sweep = 0
    for (let k = 0; k < pieces; k++) sweep += angleBetween(sub(points[k]!, circle.centre), sub(points[k + 1]!, circle.centre))
    if (whole) sweep = Math.sign(sweep) * TURN
    return { centre: circle.centre, radius: circle.radius, sweep }
  }

  const sides: RingSide[] = []
  const straight = (i: number): RingSide => {
    const d = dir(i)
    const length = Math.hypot(d.x, d.y)
    return { first: ((i % n) + n) % n, pieces: 1, from: at(i), to: at(i + 1), length, curve: null, out: length === 0 ? { x: 0, y: 0 } : { x: d.y / length, y: -d.x / length } }
  }
  const curved = (first: number, pieces: number, curve: SideCurve): RingSide => {
    const a0 = Math.atan2(at(first).y - curve.centre.y, at(first).x - curve.centre.x)
    const mid = a0 + curve.sweep / 2
    const away = { x: Math.cos(mid), y: Math.sin(mid) }
    // Turning left round its centre (counter-clockwise), the floor is toward the centre: out is away from it.
    const out = curve.sweep > 0 ? away : { x: -away.x, y: -away.y }
    return { first: ((first % n) + n) % n, pieces, from: at(first), to: at(first + pieces), length: curve.radius * Math.abs(curve.sweep), curve, out }
  }

  let k = 0
  while (k < n) {
    const first = start + k
    let pieces = 1
    let found: { curve: SideCurve; pieces: number } | null = null
    while (k + pieces < n && onward(first + pieces)) {
      const next = pieces + 1
      if (next >= MIN_PIECES) {
        const curve = curveOf(first, next)
        if (curve === null) break
        // Pieces that turn too little in all may still become a curve with more of them.
        if (Math.abs(curve.sweep) >= LEAST_SWEEP) found = { curve, pieces: next }
      }
      pieces = next
    }
    if (found !== null) {
      sides.push(curved(first, found.pieces, found.curve))
      k += found.pieces
    } else {
      sides.push(straight(first))
      k += 1
    }
  }
  // A ring with no corner read from point 0: a curve running across it is one.
  if (cornerless && sides.length > 1) {
    const last = sides[sides.length - 1]!
    const head = sides[0]!
    if (last.curve !== null && head.curve !== null && Math.sign(last.curve.sweep) === Math.sign(head.curve.sweep)) {
      const curve = curveOf(last.first, last.pieces + head.pieces)
      if (curve !== null && Math.abs(curve.sweep) >= LEAST_SWEEP) {
        sides[0] = curved(last.first, last.pieces + head.pieces, curve)
        sides.pop()
      }
    }
  }
  return sides
}

/** A whole turn, to the rounding of the arithmetic. */
export const wholeTurn = (curve: SideCurve): boolean => Math.abs(curve.sweep) > TURN - tolerance('curveSweep')

/**
 * A room's outline read as a person names its shape, or null when across and up the drawing say
 * it (a rectangle square to the drawing, or an outline with neither a curve nor four sides).
 */
export type RoomForm =
  | { readonly kind: 'round'; readonly across: number }
  /** Between two curves on one centre: its length along its middle and its width between them. */
  | { readonly kind: 'band'; readonly long: number; readonly wide: number }
  /** A rectangle turned on the drawing: its own sides, the one nearer across the drawing first, and the turn of that side, counter-clockwise positive, in degrees. */
  | { readonly kind: 'turned'; readonly across: number; readonly up: number; readonly degrees: number }
  /** Four straight sides that are not a rectangle, going round. */
  | { readonly kind: 'four'; readonly sides: readonly number[] }
  /** Any other outline with a curved side: each curve's radius and length. */
  | { readonly kind: 'curved'; readonly curves: readonly { readonly radius: number; readonly length: number }[] }

export function roomForm(polygon: readonly Vec2[], holes: readonly (readonly Vec2[])[] = []): RoomForm | null {
  if (polygon.length < 3) return null
  const sides = ringSides(polygon)
  const curves = sides.flatMap((side) => (side.curve === null ? [] : [side.curve]))
  const curveList = (): RoomForm => ({ kind: 'curved', curves: sides.flatMap((side) => (side.curve === null ? [] : [{ radius: side.curve.radius, length: side.length }])) })
  if (holes.length > 0) return curves.length > 0 ? curveList() : null
  if (sides.length === 1 && curves.length === 1 && wholeTurn(curves[0]!)) return { kind: 'round', across: 2 * curves[0]!.radius }
  if (sides.length === 4 && curves.length === 2) {
    const [a, b] = curves as [SideCurve, SideCurve]
    const sameCentre = Math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y) < SAME_M
    if (sameCentre && Math.sign(a.sweep) !== Math.sign(b.sweep) && Math.abs(Math.abs(a.sweep) - Math.abs(b.sweep)) < tolerance('curveSweep')) {
      return { kind: 'band', long: ((a.radius + b.radius) / 2) * Math.abs(a.sweep), wide: Math.abs(a.radius - b.radius) }
    }
  }
  if (curves.length > 0) return curveList()
  if (sides.length !== 4) return null
  const dirs = sides.map((side) => sub(side.to, side.from))
  const square = dirs.every((d, i) => Math.abs(Math.abs(angleBetween(d, dirs[(i + 1) % 4]!)) - Math.PI / 2) < SQUARE_CORNER)
  const lengths = sides.map((side) => side.length)
  if (!square) return { kind: 'four', sides: lengths }
  // The side nearer across the drawing, and its turn brought into (-45, 45] degrees.
  const angle = Math.atan2(dirs[0]!.y, dirs[0]!.x)
  const quarter = Math.PI / 2
  let turned = angle - Math.round(angle / quarter) * quarter
  if (turned <= -Math.PI / 4) turned += quarter
  if (Math.abs(turned) < ON_AXIS) return null
  const firstAcross = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle))
  const across = firstAcross ? lengths[0]! : lengths[1]!
  const up = firstAcross ? lengths[1]! : lengths[0]!
  return { kind: 'turned', across, up, degrees: (turned * 180) / Math.PI }
}
