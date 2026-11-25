/**
 * Dimension strings.
 *
 * A dimension measures a distance and says where to draw it. This module owns
 * the first half — what is measured, how much it is, what each end measures to
 * and where the line goes — and stops there. The drafting conventions that turn
 * that into a dimension that reads like architecture (extension lines, tick
 * marks, text placement, typography) belong to the design side.
 *
 * SHT-4: dimensions run along the walls.
 *
 * - Inside a room, a room with four square corners gets its width and depth, along its own
 *   walls however the plan is turned; any other room gets one dimension per side, each a
 *   little in from that side and inside the room.
 * - Outside the plan, each side has up to three chains, nearest first: the openings (each
 *   corner to the next edge of a door or window), the walls (the faces of every wall that
 *   meets that side of the building) and the overall size. The plan's two main directions
 *   are the walls', not the page's, so a turned house is dimensioned along its walls. Every
 *   chain runs between the same two outermost points, so each adds up to the next.
 * - VEW-22: the main directions are those of the way that holds half the outside walls' length
 *   or more, else of the plan's one wing, else the page's, the overall size then from the box
 *   round the whole outline. Outside walls that run another way are dimensioned along
 *   themselves, each line of facade with its own chains and overall length (`chain`); a plan of
 *   two wings or more has each wing dimensioned square to itself. A chain keeps no sliver under
 *   `chainSliver`, and a wall thinner than `chainThinWall` is marked at its centre line.
 * - Every dimension says what each of its ends measures to: a wall's face, or the centre line
 *   of a dividing line (or of a thin wall, VEW-22), which has no faces. `finish` is for a plan that records its finishes;
 *   none does yet, so nothing measures to one.
 *
 * Everything here is derived: nothing about dimensions is stored in the plan
 * file, because a stored measurement is a measurement that drifts from the
 * geometry it describes.
 */

import type { PlanDrawing, PlanRoom, PlanWall, Bounds } from './floorplan'
import { computeBounds } from './floorplan'
import { gridDimensions } from './structuralGrid'
import { signedDistanceToOutline } from './innerPoint'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { add, cross, distance, dot, length, normalize, perp, scale, signedArea, sub } from './vec2'

/**
 * What a dimension measures: the plan's overall size, a chain of walls or of openings outside
 * the plan, a room inside it, one opening on its own wall (`openingDimensions`), or (CNT-16) the
 * spacing of a structural grid's lines (`gridDimensions`).
 */
export type DimensionKind = 'overall' | 'wall' | 'opening' | 'room' | 'grid'

/** What one end of a dimension measures to. */
export type MeasuredTo = 'centre-line' | 'face' | 'finish'

/** The side of the plan a chain outside it runs along, in the plan's own main directions. */
export type DimensionSide = 'bottom' | 'left' | 'top' | 'right'

/**
 * One dimension, in plan coordinates (meters).
 *
 * `from` and `to` are the two points being measured. The dimension line itself
 * is drawn parallel to them, pushed `offset` meters along `normal` — that
 * offset is what keeps stacked dimensions from sitting on top of each other.
 * A room dimension has its points on the line itself, inside the room, and no
 * offset.
 */
export interface Dimension {
  readonly id: string
  readonly kind: DimensionKind
  readonly from: Vec2
  readonly to: Vec2
  /** Distance in meters. This is the number that gets drawn. */
  readonly value: number
  /** Unit direction the dimension line is pushed along. */
  readonly normal: Vec2
  /** How far it is pushed, in meters. */
  readonly offset: number
  /** Midpoint of the dimension line, where the text belongs. */
  readonly labelAt: Vec2
  /** What each end measures to: `from`'s, then `to`'s (SHT-4). */
  readonly measuredTo: readonly [MeasuredTo, MeasuredTo]
  /** For a dimension outside the plan, the side it runs along. */
  readonly side?: DimensionSide
  /**
   * VEW-22: for a dimension outside the plan along a facade or a wing of its own, square to that
   * and not to the plan's main directions, the line of chains it is in: the chains of one line
   * add up to that line's overall size, and `side` is the side in the wing's own directions.
   * Left out on the plan's main directions.
   */
  readonly chain?: string
}

/** How far the first dimension line sits from what it measures, in meters. */
const BASE_OFFSET = 0.6

/** How far apart the chains outside the plan sit, in meters. */
const CHAIN_SPACING = 0.5

/** A room narrower than this is not worth dimensioning — the text will not fit. */
const MIN_ROOM_SIDE = 0.8

/**
 * Where a room's dimension lines sit inside it, as a fraction of the room.
 *
 * Not the middle: the room name and its area already live at the centroid, and
 * three labels stacked on the same point is unreadable. A quarter in keeps
 * each dimension clear of the name and of the other dimension. In a room with a
 * hole the line may not cross, the next of these that keeps it on the floor.
 */
const ROOM_DIMENSION_INSETS = [0.25, 0.75, 0.1, 0.9]

/**
 * How far in from its side a side of a room that is not a rectangle is dimensioned, in
 * metres, and the nearer places tried when that would take the line out of the room.
 */
const SIDE_INSETS = [0.4, 0.2, 0.1, 0]

function makeDimension(
  id: string,
  kind: DimensionKind,
  from: Vec2,
  to: Vec2,
  normal: Vec2,
  offset: number,
  measuredTo: readonly [MeasuredTo, MeasuredTo],
  side?: DimensionSide,
  chain?: string
): Dimension {
  const shift = scale(normal, offset)
  const a = add(from, shift)
  const b = add(to, shift)
  return {
    id,
    kind,
    from,
    to,
    value: distance(from, to),
    normal,
    offset,
    labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    measuredTo,
    ...(side !== undefined && { side }),
    ...(chain !== undefined && { chain })
  }
}

// ── The plan's main directions ───────────────────────────────────────────────────────────────

/** The plan's two main directions: `u` the more nearly across the page, `v` 90 degrees from it. */
export interface PlanAxes {
  readonly u: Vec2
  readonly v: Vec2
}

/** A direction turned by quarter turns until it lies within 45 degrees of the page's x axis. */
function folded(dir: Vec2): Vec2 {
  let d = dir
  for (let turn = 0; turn < 4; turn++) {
    if (d.x > 0 && d.y > -d.x && d.y <= d.x) return d
    d = perp(d)
  }
  return d
}

/**
 * The plan's main directions: the direction most of its outside walls run in, by length, or
 * most of its solid walls when none faces outside. A plan with no solid wall uses the page's.
 */
export function planAxes(walls: readonly PlanWall[]): PlanAxes {
  const solid = walls.filter((wall) => !wall.virtual)
  const outside = solid.filter((wall) => wall.exposure === 'exterior')
  const noLength = tolerance('noLength')
  // A curved wall runs no one way (CNT-18).
  const runs = (outside.length > 0 ? outside : solid).flatMap((wall) => {
    if (wall.curve !== undefined) return []
    const d = sub(wall.centerline[1], wall.centerline[0])
    const len = length(d)
    return len <= noLength ? [] : [{ dir: folded(scale(d, 1 / len)), len }]
  })
  if (runs.length === 0) return { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } }
  const square = tolerance('squareCorner')
  let best = runs[0]!
  let bestWeight = -1
  for (const run of runs) {
    let weight = 0
    for (const other of runs) if (Math.abs(cross(run.dir, other.dir)) <= square) weight += other.len
    // A tie goes to the direction nearer the page's own, so a square plan keeps the page's axes.
    if (weight > bestWeight || (weight === bestWeight && Math.abs(run.dir.y) < Math.abs(best.dir.y))) {
      best = run
      bestWeight = weight
    }
  }
  return { u: best.dir, v: perp(best.dir) }
}

// ── Outside the plan: the chains and the overall size ───────────────────────────────────────

/** A point of a chain, as a distance along it, and what it measures to. */
interface Mark {
  readonly at: number
  readonly to: MeasuredTo
}

interface Side {
  readonly side: DimensionSide
  /** The direction the chain runs in. */
  readonly along: Vec2
  /** The direction away from the plan. */
  readonly out: Vec2
  readonly overallId: string
  /** Whether it has an overall dimension even with no chain of its own. */
  readonly always: boolean
}

export interface OutsideOptions {
  /** The overall size of the plan. On by default. */
  readonly overall?: boolean
  /** The chains of openings and walls along each side. On by default. */
  readonly chains?: boolean
}

/**
 * The dimensions outside the plan: on each side, the chain of openings nearest the walls, then
 * the chain of walls, then the overall size. The overall width is below the plan and the
 * overall depth to its left, the usual spots on a floor plan; above and to the right there is
 * an overall size only where there is a chain to add up to it.
 */
export function outsideDimensions(drawing: PlanDrawing, options: OutsideOptions = {}): Dimension[] {
  const { overall = true, chains = true } = options
  if (!overall && !chains) return []
  // VEW-22: the outside walls by the way they run. With two wings or more, each is dimensioned
  // square to itself. Otherwise the plan's main directions are those of the way that holds half
  // the outside length or more, else of its one wing, else the page's; every other way is
  // dimensioned along itself.
  const groups = outsideGroups(drawing.walls)
  const total = groups.reduce((sum, group) => sum + group.weight, 0)
  const wings = groups.filter((group) => group.walls.length >= 3 && group.weight >= tolerance('wingShare') * total)
  const heaviest = groups[0]
  const main: PlanAxes | null =
    wings.length >= 2
      ? null
      : heaviest === undefined || heaviest.weight >= total / 2
        ? planAxes(drawing.walls)
        : wings.length === 1
          ? { u: wings[0]!.dir, v: perp(wings[0]!.dir) }
          : { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } }
  const result = main === null ? [] : mainDimensions(drawing, main, overall, chains)
  const square = tolerance('squareCorner')
  groups.forEach((group, index) => {
    if (main !== null && Math.abs(cross(group.dir, main.u)) <= square) return
    result.push(...groupDimensions(drawing, group, index + 1, overall, chains))
  })
  return result
}

/** VEW-22: outside straight walls that run one way, square to each other, and their length. */
interface WallGroup {
  /** The way they run, folded to within 45 degrees of the page's x axis. */
  readonly dir: Vec2
  readonly walls: PlanWall[]
  readonly weight: number
}

/** VEW-22: the outside straight walls by the way they run, the most length first. */
function outsideGroups(walls: readonly PlanWall[]): WallGroup[] {
  const square = tolerance('squareCorner')
  const runs = walls
    .filter((wall) => !wall.virtual && wall.exposure === 'exterior')
    .flatMap((wall) => {
      const run = directionOf(wall)
      return run === null ? [] : [{ wall, dir: folded(run.dir), len: run.len }]
    })
    .sort((a, b) => b.len - a.len)
  const groups: { dir: Vec2; walls: PlanWall[]; weight: number }[] = []
  for (const run of runs) {
    const group = groups.find((g) => Math.min(Math.abs(cross(g.dir, run.dir)), Math.abs(dot(g.dir, run.dir))) <= square)
    if (group) {
      group.walls.push(run.wall)
      group.weight += run.len
    } else groups.push({ dir: run.dir, walls: [run.wall], weight: run.len })
  }
  return groups.sort((a, b) => b.weight - a.weight)
}

/** The four sides of a set of directions, each with the way its chains run and the way out. */
function sidesOf(u: Vec2, v: Vec2): Side[] {
  return [
    { side: 'bottom', along: u, out: scale(v, -1), overallId: 'overall-width', always: true },
    { side: 'left', along: v, out: scale(u, -1), overallId: 'overall-height', always: true },
    { side: 'top', along: u, out: v, overallId: 'overall-width-top', always: false },
    { side: 'right', along: v, out: u, overallId: 'overall-height-right', always: false }
  ]
}

/**
 * VEW-22: one way's walls dimensioned along themselves: on each of its four sides, the facade
 * walls that stand on one line get that line's openings and walls chains and its overall length,
 * pushed out from its outermost face. A wing is dimensioned square to itself so, and a single
 * angled facade gets its own length.
 */
function groupDimensions(drawing: PlanDrawing, group: WallGroup, number: number, overall: boolean, chains: boolean): Dimension[] {
  const near = tolerance('chainPoint')
  const own = new Set(group.walls.map((wall) => wall.id))
  const result: Dimension[] = []
  for (const side of sidesOf(group.dir, perp(group.dir))) {
    const facade = facadeWalls(drawing, side).filter((wall) => own.has(wall.id))
    if (facade.length === 0) continue
    // The facade walls by how far out they stand; walls within a wall's thickness of each other stand on one line.
    const outermost = (wall: PlanWall): number => Math.max(...wall.slices.flat().map((p) => dot(p, side.out)))
    const sorted = [...facade].sort((a, b) => outermost(b) - outermost(a))
    const lines: PlanWall[][] = []
    for (const wall of sorted) {
      const line = lines[lines.length - 1]
      if (line && outermost(line[0]!) - outermost(wall) <= Math.max(line[0]!.thickness, wall.thickness)) line.push(wall)
      else lines.push([wall])
    }
    lines.forEach((line, k) => {
      const ats = line.flatMap((wall) => wall.slices.flat().map((p) => dot(p, side.along)))
      const lo: Mark = { at: Math.min(...ats), to: 'face' }
      const hi: Mark = { at: Math.max(...ats), to: 'face' }
      if (hi.at - lo.at <= near) return
      const face = Math.max(...line.map(outermost))
      const point = (at: number): Vec2 => add(scale(side.along, at), scale(side.out, face))
      const strings: { kind: DimensionKind; marks: Mark[] }[] = []
      if (chains) {
        const openings = chainMarks(lo, hi, openingMarks(drawing, line, side.along))
        if (openings.length > 2) strings.push({ kind: 'opening', marks: openings })
        const walls = chainMarks(lo, hi, wallMarks(drawing, line, side.along))
        if (walls.length > 2) strings.push({ kind: 'wall', marks: walls })
      }
      if (overall) strings.push({ kind: 'overall', marks: [lo, hi] })
      const chain = `g${number}-${side.side}-${k}`
      strings.forEach(({ kind, marks }, index) => {
        const offset = BASE_OFFSET + index * CHAIN_SPACING
        for (let i = 0; i + 1 < marks.length; i++) {
          const a = marks[i]!
          const b = marks[i + 1]!
          const id = kind === 'overall' ? `overall-${chain}` : `${kind}-${chain}-${i}`
          result.push(makeDimension(id, kind, point(a.at), point(b.at), side.out, offset, [a.to, b.to], side.side, chain))
        }
      })
    })
  }
  return result
}

/** The chains and overall size along the plan's main directions, as SHT-4 gives them. */
function mainDimensions(drawing: PlanDrawing, axes: PlanAxes, overall: boolean, chains: boolean): Dimension[] {
  const { u, v } = axes
  const pointAt = (t: number, w: number): Vec2 => add(scale(u, t), scale(v, w))
  const near = tolerance('chainPoint')

  // The building's extent along each main direction: the faces of its walls, and the ends of
  // the dividing lines that reach past them.
  const extent = new Map<string, Mark>()
  const reach = (key: string, at: number, to: MeasuredTo, beyond: (a: number, b: number) => boolean): void => {
    const held = extent.get(key)
    if (!held || beyond(at, held.at)) extent.set(key, { at, to })
  }
  const more = (a: number, b: number): boolean => a > b + near
  const less = (a: number, b: number): boolean => a < b - near
  const take = (points: readonly Vec2[], to: MeasuredTo): void => {
    for (const p of points) {
      const t = dot(p, u)
      const w = dot(p, v)
      reach('tMin', t, to, less)
      reach('tMax', t, to, more)
      reach('wMin', w, to, less)
      reach('wMax', w, to, more)
    }
  }
  for (const wall of drawing.walls) if (!wall.virtual) take(wall.slices.flat(), 'face')
  for (const wall of drawing.walls) if (wall.virtual) take(wall.curve?.path ?? wall.centerline, 'centre-line')
  const tMin = extent.get('tMin')
  const tMax = extent.get('tMax')
  const wMin = extent.get('wMin')
  const wMax = extent.get('wMax')
  if (!tMin || !tMax || !wMin || !wMax) return []

  const sides = sidesOf(u, v)

  const result: Dimension[] = []
  for (const side of sides) {
    const acrossU = side.along === u
    const [lo, hi] = acrossU ? [tMin, tMax] : [wMin, wMax]
    if (hi.at - lo.at <= near) continue
    // The line the chain's points stand on: the building's outermost face on this side.
    const line = side.side === 'bottom' ? wMin.at : side.side === 'top' ? wMax.at : side.side === 'left' ? tMin.at : tMax.at
    const point = (at: number): Vec2 => (acrossU ? pointAt(at, line) : pointAt(line, at))

    const strings: { kind: DimensionKind; marks: Mark[] }[] = []
    if (chains) {
      const facade = facadeWalls(drawing, side)
      const openings = chainMarks(lo, hi, openingMarks(drawing, facade, side.along))
      if (openings.length > 2) strings.push({ kind: 'opening', marks: openings })
      const walls = chainMarks(lo, hi, wallMarks(drawing, facade, side.along))
      if (walls.length > 2) strings.push({ kind: 'wall', marks: walls })
    }
    if (overall && (side.always || strings.length > 0)) strings.push({ kind: 'overall', marks: [lo, hi] })

    strings.forEach(({ kind, marks }, index) => {
      const offset = BASE_OFFSET + index * CHAIN_SPACING
      for (let i = 0; i + 1 < marks.length; i++) {
        const a = marks[i]!
        const b = marks[i + 1]!
        const id = kind === 'overall' ? side.overallId : `${kind}-${side.side}-${i}`
        result.push(makeDimension(id, kind, point(a.at), point(b.at), side.out, offset, [a.to, b.to], side.side))
      }
    })
  }
  return result
}

/**
 * A chain's points in order: its two ends, then the marks between them, each closer than
 * `chainSliver` to the one before it dropped (a wall's face is kept over a centre line there):
 * a wall a little off square leaves no sliver (VEW-22).
 */
function chainMarks(lo: Mark, hi: Mark, marks: readonly Mark[]): Mark[] {
  const near = tolerance('chainSliver')
  const between = marks.filter((m) => m.at > lo.at + near && m.at < hi.at - near).sort((a, b) => a.at - b.at || (a.to === b.to ? 0 : a.to === 'face' ? -1 : 1))
  const out: Mark[] = [lo]
  for (const mark of between) if (mark.at - out[out.length - 1]!.at > near) out.push(mark)
  if (out.length > 1 && hi.at - out[out.length - 1]!.at <= near) out.pop()
  out.push(hi)
  return out
}

/** Where along an outside wall it is tried for a room behind it and none in front, as shares of its length. */
const PROBES = [0.5, 0.3, 0.7, 0.1, 0.9]

/** A straight wall's way and length; null for a curved wall (CNT-18), which is not chained along a side. */
const directionOf = (wall: PlanWall): { dir: Vec2; len: number } | null => {
  if (wall.curve !== undefined) return null
  const d = sub(wall.centerline[1], wall.centerline[0])
  const len = length(d)
  return len <= tolerance('noLength') ? null : { dir: scale(d, 1 / len), len }
}

/**
 * The walls that face out on one side: solid outside walls along it, with a room just behind
 * them and none just in front.
 */
function facadeWalls(drawing: PlanDrawing, side: Side): PlanWall[] {
  const square = tolerance('squareCorner')
  const slack = tolerance('wallContact')
  const inRoom = (p: Vec2): boolean => drawing.rooms.some((room) => signedDistanceToOutline(p, room.polygon, room.holes) > 0)
  return drawing.walls.filter((wall) => {
    if (wall.virtual || wall.exposure !== 'exterior') return false
    const run = directionOf(wall)
    if (!run || Math.abs(cross(run.dir, side.along)) > square) return false
    // Tried at several places along it: one may fall where another wall meets it.
    const probe = scale(side.out, wall.thickness / 2 + slack)
    const [s, e] = wall.centerline
    return PROBES.some((t) => {
      const at = add(s, scale(sub(e, s), t))
      return !inRoom(add(at, probe)) && inRoom(sub(at, probe))
    })
  })
}

/** The edges of the doors and windows in the walls that face out on one side. */
function openingMarks(drawing: PlanDrawing, facade: readonly PlanWall[], along: Vec2): Mark[] {
  const ids = new Set(facade.map((wall) => wall.id))
  return drawing.openings
    .filter((opening) => ids.has(opening.wallId))
    .flatMap((opening) => [opening.from, opening.to].map((p) => ({ at: dot(p, along), to: 'face' as const })))
}

/**
 * The walls chain of one side: where each wall that faces out on it ends, and the faces of
 * every wall that meets one of them square, or the line of a dividing line that does.
 */
function wallMarks(drawing: PlanDrawing, facade: readonly PlanWall[], along: Vec2): Mark[] {
  const square = tolerance('squareCorner')
  const gap = tolerance('gap')
  const marks: Mark[] = []
  for (const wall of facade) {
    const ats = wall.slices.flat().map((p) => dot(p, along))
    if (ats.length > 0) marks.push({ at: Math.min(...ats), to: 'face' }, { at: Math.max(...ats), to: 'face' })
  }
  for (const other of drawing.walls) {
    const run = directionOf(other)
    if (!run || Math.abs(dot(run.dir, along)) > square) continue
    const meets = other.centerline.find((end) =>
      facade.some((wall) => {
        const axis = directionOf(wall)
        if (!axis || wall.id === other.id) return false
        const rel = sub(end, wall.centerline[0])
        const alongWall = dot(rel, axis.dir)
        const slack = other.thickness / 2 + gap
        return Math.abs(cross(axis.dir, rel)) <= wall.thickness / 2 + gap && alongWall >= -slack && alongWall <= axis.len + slack
      })
    )
    if (!meets) continue
    const at = dot(meets, along)
    // VEW-22: a thin wall is marked at its centre line, so its thickness is no figure of its own.
    if (other.virtual || other.thickness < tolerance('chainThinWall')) marks.push({ at, to: 'centre-line' })
    else marks.push({ at: at - other.thickness / 2, to: 'face' }, { at: at + other.thickness / 2, to: 'face' })
  }
  return marks
}

/**
 * Overall dimensions: the width and depth of the whole plan along its main directions, to the
 * outer faces of its walls, placed outside it — below it and to its left.
 */
export function overallDimensions(drawing: PlanDrawing): Dimension[] {
  return outsideDimensions(drawing, { chains: false })
}

// ── Inside a room ────────────────────────────────────────────────────────────────────────────

/** One straight side of a room's outline, counter-clockwise, and what it is. */
interface RoomSide {
  readonly a: Vec2
  readonly b: Vec2
  readonly dir: Vec2
  readonly len: number
  /** Into the room. */
  readonly inward: Vec2
  /** A wall's face, or a dividing line, which is its own centre line. */
  readonly is: MeasuredTo
}

/** The sides of a room's outline, counter-clockwise, with corners on a straight run dropped. */
function roomSides(room: PlanRoom, walls: readonly PlanWall[]): RoomSide[] {
  const ring = signedArea(room.polygon) < 0 ? [...room.polygon].reverse() : [...room.polygon]
  const noLength = tolerance('noLength')
  const parallel = tolerance('parallel')
  const points: Vec2[] = []
  for (const p of ring) if (points.length === 0 || distance(points[points.length - 1]!, p) > noLength) points.push(p)
  if (points.length > 1 && distance(points[0]!, points[points.length - 1]!) <= noLength) points.pop()
  // Drop a corner where the outline carries straight on.
  let changed = true
  while (changed && points.length > 3) {
    changed = false
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i + points.length - 1) % points.length]!
      const here = points[i]!
      const next = points[(i + 1) % points.length]!
      const d1 = normalize(sub(here, prev))
      const d2 = normalize(sub(next, here))
      if (Math.abs(cross(d1, d2)) <= parallel && dot(d1, d2) > 0) {
        points.splice(i, 1)
        changed = true
        break
      }
    }
  }
  const lines = walls.filter((wall) => wall.virtual)
  const contact = tolerance('wallContact')
  const onLine = (p: Vec2, [s, e]: readonly [Vec2, Vec2]): boolean => {
    const d = sub(e, s)
    const len2 = dot(d, d)
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, s), d) / len2))
    return distance(p, add(s, scale(d, t))) <= contact
  }
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]!
    const len = distance(a, b)
    const dir = scale(sub(b, a), 1 / len)
    const divided = lines.some((line) => onLine(a, line.centerline) && onLine(b, line.centerline))
    return { a, b, dir, len, inward: perp(dir), is: divided ? 'centre-line' : 'face' }
  })
}

/**
 * Whether a line drawn from `a` to `b` stays on the room's floor: inside it, out of its holes.
 * Its ends may sit on the outline, give or take `wallContact`: a surveyed room is never quite
 * square, so a line across it meets its sides a hair in or out.
 */
function staysInside(a: Vec2, b: Vec2, room: PlanRoom): boolean {
  const slack = tolerance('wallContact')
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = add(a, scale(sub(b, a), t))
    if (signedDistanceToOutline(p, room.polygon, room.holes) < -slack) return false
  }
  const ab = sub(b, a)
  const len = length(ab)
  if (len === 0) return true
  const noArea = tolerance('noArea')
  const end = slack / len
  for (const ring of [room.polygon, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i]!
      const cd = sub(ring[(i + 1) % ring.length]!, c)
      const turn = cross(ab, cd)
      if (Math.abs(turn) <= noArea) continue
      // Where the two cross, along the line (t) and along the edge (s).
      const t = cross(sub(c, a), cd) / turn
      const s = cross(sub(c, a), ab) / turn
      if (t > end && t < 1 - end && s > 0 && s < 1) return false
    }
  }
  return true
}

/**
 * Room dimensions, drawn inside the room along its walls' faces.
 *
 * A room with four square corners gets its width and depth, a quarter of the way in, each
 * along a pair of its walls; turned or not, they are the sizes between its faces, so width ×
 * depth is its area. Any other room — an L, a room with a bay, a skewed one — gets one
 * dimension per side long enough to carry its number, a little in from that side and inside
 * the room: the line of a concave room's overall box would run through the room next door.
 * `walls` tells a side along a dividing line, which measures to that line, from a wall's face.
 */
export function roomDimensions(room: PlanRoom, walls: readonly PlanWall[] = []): Dimension[] {
  if (room.polygon.length < 3) return []
  const sides = roomSides(room, walls)
  if (sides.length < 3) return []
  const square = tolerance('squareCorner')
  const n = sides.length
  const sideAt = (i: number): RoomSide => sides[(i + n) % n]!
  const rectangle = n === 4 && sides.every((side, i) => Math.abs(dot(side.dir, sideAt(i + 1).dir)) <= square)

  if (rectangle) {
    // Width along the pair nearer the page's x axis, measured on the lower side of it; depth
    // along the other pair, on its left side. Each runs left to right or bottom to top.
    const pairs = [[0, 2], [1, 3]] as const
    const [across, up] = Math.abs(sides[0]!.dir.x) >= Math.abs(sides[1]!.dir.x) ? pairs : [pairs[1], pairs[0]]
    const bottom = [...across].sort((p, q) => sides[q]!.inward.y - sides[p]!.inward.y)[0]!
    const left = [...up].sort((p, q) => sides[q]!.inward.x - sides[p]!.inward.x)[0]!
    const width = sides[bottom]!.len
    const depth = sides[left]!.len
    if (width < MIN_ROOM_SIDE || depth < MIN_ROOM_SIDE) return []
    const line = (i: number, id: string, span: number, positive: (d: Vec2) => number): Dimension[] => {
      const side = sides[i]!
      for (const inset of ROOM_DIMENSION_INSETS) {
        const shift = scale(side.inward, span * inset)
        let from = add(side.a, shift)
        let to = add(side.b, shift)
        let ends: [MeasuredTo, MeasuredTo] = [sideAt(i - 1).is, sideAt(i + 1).is]
        if (positive(side.dir) < 0) {
          ;[from, to] = [to, from]
          ends = [ends[1], ends[0]]
        }
        if (staysInside(from, to, room)) return [makeDimension(id, 'room', from, to, side.inward, 0, ends)]
      }
      return []
    }
    return [...line(bottom, `${room.id}-width`, depth, (d) => d.x), ...line(left, `${room.id}-depth`, width, (d) => d.y)]
  }

  const result: Dimension[] = []
  sides.forEach((side, i) => {
    if (side.len < MIN_ROOM_SIDE) return
    for (const inset of SIDE_INSETS) {
      const shift = scale(side.inward, inset)
      const from = add(side.a, shift)
      const to = add(side.b, shift)
      if (inset === 0 || staysInside(from, to, room)) {
        result.push(makeDimension(`${room.id}-side-${i}`, 'room', from, to, side.inward, 0, [sideAt(i - 1).is, sideAt(i + 1).is]))
        return
      }
    }
  })
  return result
}

/**
 * Opening dimensions: the width of each door and window, on its own wall.
 *
 * The line is pushed out along the wall normal so it clears the wall body
 * instead of being swallowed by it.
 */
export function openingDimensions(drawing: PlanDrawing): Dimension[] {
  return drawing.openings.map((opening) =>
    makeDimension(
      `${opening.id}-width`,
      'opening',
      opening.from,
      opening.to,
      opening.normal,
      opening.thickness / 2 + 0.25,
      ['face', 'face']
    )
  )
}

export interface DimensionOptions {
  /** The overall size outside the plan. */
  readonly overall?: boolean
  /** The chains of openings and walls outside the plan (SHT-4). */
  readonly chains?: boolean
  readonly rooms?: boolean
  /** Each door and window's width on its own wall, inside walls too. Off by default. */
  readonly openings?: boolean
  /** CNT-16: the spacing of the structural grids drawn, line to line and in all. */
  readonly grids?: boolean
}

/**
 * Every dimension for a drawing.
 *
 * They come in layers because a plan showing all of them at once is unreadable
 * at small scale — the consumer decides which ones to show at which zoom.
 */
export function buildDimensions(
  whole: PlanDrawing,
  options: DimensionOptions = {}
): Dimension[] {
  const { overall = true, chains = true, rooms = true, openings = false, grids = true } = options
  // CNT-10: the sizes are of the building after the work; what is to be demolished has none.
  const standing = (part: { readonly phase?: string }): boolean => part.phase !== 'demolished'
  const drawing = whole.walls.every(standing) && whole.openings.every(standing) ? whole : { ...whole, walls: whole.walls.filter(standing), openings: whole.openings.filter(standing) }
  const result: Dimension[] = []

  result.push(...outsideDimensions(drawing, { overall, chains }))
  if (rooms) for (const room of drawing.rooms) result.push(...roomDimensions(room, drawing.walls))
  if (openings) result.push(...openingDimensions(drawing))
  if (grids) for (const grid of drawing.grids ?? []) result.push(...gridDimensions(grid))

  return result
}

/**
 * The extent a drawing needs once its dimensions are placed.
 *
 * Dimensions sit outside the walls, so framing on the plan bounds alone would
 * clip them.
 */
export function boundsWithDimensions(drawing: PlanDrawing, dims: readonly Dimension[]): Bounds {
  const points: Vec2[] = [drawing.bounds.min, drawing.bounds.max]
  // SHT-7: the sketch layer and the notes placed at a point are framed too.
  if (drawing.sketchBounds) points.push(drawing.sketchBounds.min, drawing.sketchBounds.max)
  // BRF-3: and the plot, on the floor it is drawn on.
  if (drawing.siteBounds) points.push(drawing.siteBounds.min, drawing.siteBounds.max)
  for (const note of drawing.notes) if (note.at && note.room === null) points.push(note.at)
  for (const dim of dims) {
    const shift = scale(dim.normal, dim.offset)
    points.push(add(dim.from, shift), add(dim.to, shift))
  }
  return computeBounds(points)
}

/**
 * Direction along the dimension, and the one perpendicular to it. Handy for a
 * consumer drawing extension lines and tick marks.
 */
export function dimensionAxes(dim: Dimension): { along: Vec2; across: Vec2 } {
  const along = normalize(sub(dim.to, dim.from))
  return { along, across: perp(along) }
}
