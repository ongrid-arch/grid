/**
 * A facade from the model (LVL-8): what a person standing outside one side of the building sees,
 * looking straight at it, every floor stacked at its level.
 *
 * The sides are the drawing's (C4, C7): `north` is the side toward +Y, the top of the drawing, as
 * rooms text, the anchors and `grid describe` name them, whatever north the plan states. The
 * facade of a side is a view along the opposite way: a face is seen when it turns toward that side
 * (by at least `facadeFacing`), and is drawn as it projects onto the plane across the view, with
 * `u` running left to right as the person sees it and `z` up from the ground floor's floor level.
 *
 * What is seen comes from the core's own answers, never worked out again here:
 *
 * - **the outside of each floor** is the edge of its outline (`planEnvelope`, LVL-4): the floor its
 *   walls enclose, walls and all, so a facade's corners are the building's corners. Which side of
 *   a wall is outside is the same answer, MSG-13's and CNT-3's: the outline holds the rooms, and
 *   its edge is every wall's outside face;
 * - **the wall behind each stretch of that edge** is the solid wall whose outside face lies on it
 *   (within `facadeOnFace`): its height, from its floor's level (`floorElevations`, LVL-1), and its
 *   doors and windows, at their sills and heads, each window with its frame, sashes, lights, sill
 *   and head (VEW-63, `windowSeen`). Under another floor a storey's top is that
 *   floor's slab: a full-height wall that stops short of it rises to it (`wallTopsUnder`, VEW-33).
 *   Under a roof the floor states (LVL-6) it rises to the roof whatever height it states, so a
 *   gable end is drawn whole from the eaves to the verge (VEW-61). A short stretch with no wall on it (a corner, a
 *   wall end) is part of the wall beside it; a long one (a dividing line on the outline, an open
 *   side) is open, and drawn as nothing;
 * - **on a floor with outdoor space** (C26, VEW-25), whose slab's outline leaves out the walls round
 *   outdoor space alone and takes a terrace in, the walls along two more outlines too, both the
 *   core's (`slabOutline`): the floor with every wall, and the building alone (`buildingPlan`). So a
 *   porch's front, a terrace's parapet, a stair enclosure on a roof terrace and a front set back
 *   behind a terrace are seen. A wall found along two of them is drawn once, whole;
 * - **each floor's slab edge**, the band it stands on, under its walls, only where the floor states
 *   its slab's thickness (VEW-29); otherwise its walls stand down over the edge; **each roof's edge** over
 *   the parts with nothing above, and **each parapet** on it (LVL-4);
 * - **the plinth** under a floor on the ground whose slab stands clear of the ground (VEW-16,
 *   `plinthUnder`): a band along the same edges as its slab's, from the ground up to the slab, so
 *   the building stands on the ground line with nothing open under it;
 * - **the ground**, at the level the site states (`site.ground`), else the ground floor's floor
 *   level, 0, as LVL-4 reads it. Nothing below it is seen. CNT-49: on a slope the ground along the
 *   side's front face is a sloped line (`ground.fall`, read with `facadeGroundAt`), and the
 *   silhouette is cut at it.
 *
 * Every face carries how far it stands behind the nearest (`depth`) and its plane (`tier`: 0 the
 * front, 1 the next set back, 2 anything further), for its line weight, and the faces come
 * farthest first, the order they are drawn in, so a nearer face hides what stands behind it. A
 * wall's face the nearer faces hide whole is left out, and so is a door or window they hide whole
 * (VEW-25), so `walls` and `openings` list what is seen.
 * `outline` is the facade's silhouette above the ground. Stairs stand inside the building and are
 * not seen.
 *
 * Opening patterns (C12) are expanded first (`withPatterns`). A curved wall (C21) is seen by the
 * straight pieces the outline follows it by, each standing for the wall. Pure, and never throws.
 */

import { planInState } from './phases'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import polygonClipping from 'polygon-clipping'
import type { FloorPlan, Opening, Wall } from './plan'
import { COMPASS_SIDES, type WindowKind } from '../types/floorplan'
import { floorElevations, isFiniteWall, wallTopsUnder } from './elevations'
import { planEnvelope } from './envelope'
import { floorOf, planFloors, planForFloor } from './floors'
import { indexPlan } from './plan'
import { groundLevel, plinthUnder } from './ground'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import { withPatterns } from './patterns'
import { limit, tolerance } from './tolerances'
import { brokenOnFloor } from './validate'
import { floorRoofShape, planeAt, topAt, wallTopProfile, type RoofPlane } from './roofs'
import type { Vec2 } from './vec2'
import { straightPieces, wallFrameAt, wallPointAt } from './wall'
import { openingParts } from './openingParts'
import { windowKindOf } from './openingKinds'
import { curveFault, wallCurve } from './arc'
import { outlineKnown, slabOutline } from './outline'
import { buildingPlan, isOutdoor, outdoorOnlyWalls } from './outdoor'

/** The sides a facade is drawn for: the drawing's four (C4). */
export const FACADE_SIDES = COMPASS_SIDES
export type FacadeSide = (typeof FACADE_SIDES)[number]

/** The way each side lies from the building, on the plan. */
const SIDE_DIRECTION: Readonly<Record<FacadeSide, Vec2>> = {
  north: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: -1 },
  west: { x: -1, y: 0 }
}

/**
 * What a face of a facade is: a wall's outside face, the edge of a slab, a roof or a parapet, the
 * surface of a sloped roof's plane (`roof-plane`, LVL-6), or the plinth a floor stands on down to
 * the ground (`plinth`, VEW-16).
 */
export type FacadeFaceKind = 'wall' | 'slab' | 'roof' | 'parapet' | 'roof-plane' | 'plinth'

/**
 * VEW-12: which edge of a sloped roof a line or a band is: its `eaves`, the level foot of a plane;
 * its `ridge`, a level line higher up (the top of a mono-pitch roof too); a `hip`, where two planes
 * meet on a slope; a `verge`, where a plane ends on a slope at the floor's outline (a gable); an
 * `abutment`, where the roof meets more of the building above it.
 */
export type FacadeRoofEdge = 'eaves' | 'ridge' | 'hip' | 'verge' | 'abutment'

/** VEW-12: one edge of a roof's plane, as seen: from one end to the other, `[u, z]`. */
export interface FacadeRoofLine {
  readonly kind: FacadeRoofEdge
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
}

/** A door, window or doorless opening in a wall face, where it is seen. */
export interface FacadeOpening {
  readonly id: string
  readonly type: Opening['type']
  readonly wall: string
  /** Across the facade, left to right as seen, in metres. */
  readonly u0: number
  readonly u1: number
  /** Its sill and its head, from the ground floor's floor level. */
  readonly bottom: number
  readonly top: number
  /** The thickness of the wall it is cut in, in metres: how deep its reveals are (VEW-49). */
  readonly reveal: number
  /** VEW-63: for a window, its parts as seen; a door and a doorless opening have none. */
  readonly window?: FacadeWindow
}

/** VEW-63: a rectangle across a facade: `u0` to `u1` left to right, `bottom` to `top` up. */
export interface FacadeRect {
  readonly u0: number
  readonly u1: number
  readonly bottom: number
  readonly top: number
}

/**
 * VEW-63: a window as a facade sees it, from the parts the 3D view and the exports hold
 * (`openingParts`, CNT-14): its kind, as it states it or its window type (C24) fills it, the
 * members of its frame and of each sash, farthest first (so where two lights meet a bar stands
 * between them: a mullion or a transom), its lights (the glass), and the sill under its hole and
 * the head over it, each null where its wall has no room for it. Grid's own drawing sizes: the
 * plan holds no frame, sill or head.
 */
export interface FacadeWindow {
  readonly kind: WindowKind
  readonly members: readonly FacadeRect[]
  readonly lights: readonly FacadeRect[]
  readonly sill: FacadeRect | null
  readonly head: FacadeRect | null
}

/**
 * One face of a facade: `outline`, a polygon across the view in `[u, z]` points, and the box round
 * it, `u0` to `u1` and `bottom` to `top`. A wall's face is a rectangle unless a roof the floor
 * states (LVL-6) cuts its top: a gable end is a pentagon. A sloped roof shows its edges as bands
 * that follow the slope, and each plane of it that turns toward the side as a surface.
 */
export interface FacadeFace {
  readonly kind: FacadeFaceKind
  readonly floor: string
  /** The wall it is the outside face of; null for a slab, a roof, a parapet or a plinth. */
  readonly wall: string | null
  readonly u0: number
  readonly u1: number
  readonly bottom: number
  readonly top: number
  /** Its corners in order, `[u, z]`, not closed. */
  readonly outline: readonly (readonly [number, number])[]
  /** How far it stands behind the nearest face of the facade, in metres, at its middle. */
  readonly depth: number
  /** Its plane, front to back: 0 the front, 1 the next set back, 2 anything further. */
  readonly tier: 0 | 1 | 2
  readonly openings: readonly FacadeOpening[]
  /** VEW-12: for a band along a sloped roof's edge, which edge it is; null for any other face. */
  readonly edge: FacadeRoofEdge | null
  /** VEW-12: for a roof's plane, each of its edges with what it is; empty for any other face. */
  readonly roofLines: readonly FacadeRoofLine[]
}

/** A floor of a facade, at its level. */
export interface FacadeLevel {
  readonly floor: string
  readonly name: string
  /** Its floor level, from the ground floor's (0). */
  readonly level: number
  readonly height: number
}

export interface Facade {
  readonly side: FacadeSide
  /** The way the side lies from the building, on the plan: the facade is seen looking against it. */
  readonly direction: Vec2
  /** Left to right as seen, on the plan: `u` is a point's distance along it. */
  readonly across: Vec2
  /** The way the side faces on the earth, when the plan states its north; else null. */
  readonly compass: { readonly bearing: number; readonly faces: CompassPoint } | null
  /** Farthest first: the order they are drawn in. */
  readonly faces: readonly FacadeFace[]
  /** The facade's silhouette above the ground: rings of `[u, z]` points, each closed. */
  readonly outline: readonly (readonly (readonly [number, number])[])[]
  /**
   * The ground: its level and whether the site states it. CNT-49: on a slope, `fall` is the ground
   * along the side's front face, its level at u = 0 and how much it rises per metre of u; `level`
   * is then the lowest ground under the building.
   */
  readonly ground: { readonly level: number; readonly stated: boolean; readonly fall?: FacadeGroundFall }
  /** The floors with a face on this facade, lowest first. */
  readonly levels: readonly FacadeLevel[]
  /** What the facade spans, or null when nothing faces this side. */
  readonly extent: { readonly u0: number; readonly u1: number; readonly bottom: number; readonly top: number } | null
  /** The walls and the openings it shows, by id, in plan order. */
  readonly walls: readonly string[]
  readonly openings: readonly string[]
}

type Pair = readonly [number, number]

/** CNT-49: the ground along a facade, `z = at + perMetre * u`. */
export interface FacadeGroundFall {
  readonly at: number
  readonly perMetre: number
}

/** CNT-49: the ground's level at `u` across a facade: on its slope, else its one level. */
export function facadeGroundAt(facade: Pick<Facade, 'ground'>, u: number): number {
  const fall = facade.ground.fall
  return fall === undefined ? facade.ground.level : fall.at + fall.perMetre * u
}

const dot = (p: Vec2, d: Vec2): number => p.x * d.x + p.y * d.y

/** Kept to the micrometre, so the join of the walls leaves no hair on a facade's corners. */
const fine = (metres: number): number => Number(metres.toFixed(6)) + 0

/** A face before its depth is known: its two ends on the plan. */
interface Seen {
  readonly kind: FacadeFaceKind
  readonly floor: string
  readonly wall: string | null
  /** Its corners in order: each a point on the plan and its height. */
  readonly points: readonly { readonly p: Vec2; readonly z: number }[]
  readonly openings: readonly FacadeOpening[]
  readonly edge?: FacadeRoofEdge | null
  readonly roofLines?: readonly { readonly kind: FacadeRoofEdge; readonly a: { readonly p: Vec2; readonly z: number }; readonly b: { readonly p: Vec2; readonly z: number } }[]
  readonly order: number
}

/**
 * VEW-47: the stretches of a wall that rises through floors (C19), one per floor, joined into one
 * face from the lowest floor's bottom to the top floor's top. The parts of an opening that crosses
 * a slab join by id into one opening; a slab's edge band that lies inside the joined face is left
 * out, so no line crosses the wall.
 */
function joinThroughWalls(seen: readonly Seen[], plan: FloorPlan, across: Vec2): Seen[] {
  const through = new Set(plan.walls.filter((w) => w.through !== undefined).map((w) => w.id))
  if (through.size === 0) return [...seen]
  const key = (s: Seen): string => `${s.wall}|${s.points[0]!.p.x.toFixed(4)},${s.points[0]!.p.y.toFixed(4)}|${s.points[1]!.p.x.toFixed(4)},${s.points[1]!.p.y.toFixed(4)}`
  const groups = new Map<string, Seen[]>()
  for (const s of seen) {
    if (s.kind !== 'wall' || s.wall === null || !through.has(s.wall) || s.points.length < 4) continue
    groups.set(key(s), [...(groups.get(key(s)) ?? []), s])
  }
  const joined = new Map<Seen, Seen | null>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const byLevel = [...group].sort((x, y) => Math.min(...x.points.map((q) => q.z)) - Math.min(...y.points.map((q) => q.z)))
    const lowest = byLevel[0]!
    const highest = byLevel[byLevel.length - 1]!
    const parts = new Map<string, FacadeOpening>()
    for (const piece of byLevel) {
      for (const o of piece.openings) {
        const seenBefore = parts.get(o.id)
        parts.set(o.id, seenBefore === undefined ? o : { ...o, bottom: Math.min(seenBefore.bottom, o.bottom), top: Math.max(seenBefore.top, o.top) })
      }
    }
    const one: Seen = { ...lowest, points: [...lowest.points.slice(0, 2), ...highest.points.slice(2)], openings: [...parts.values()] }
    for (const piece of byLevel) joined.set(piece, piece === lowest ? one : null)
  }
  if (joined.size === 0) return [...seen]
  const faces = [...joined.values()].filter((s): s is Seen => s !== null)
  const inside = (s: Seen): boolean => {
    const us = s.points.map(({ p }) => dot(p, across))
    const zs = s.points.map(({ z }) => z)
    const near = tolerance('facadeOnFace')
    return faces.some((f) => {
      const fu = f.points.map(({ p }) => dot(p, across))
      const fz = f.points.map(({ z }) => z)
      return Math.min(...us) >= Math.min(...fu) - near && Math.max(...us) <= Math.max(...fu) + near && Math.min(...zs) >= Math.min(...fz) - near && Math.max(...zs) <= Math.max(...fz) + near
    })
  }
  return seen.flatMap((s) => {
    if (joined.has(s)) {
      const one = joined.get(s)
      return one === null || one === undefined ? [] : [one]
    }
    return s.kind === 'slab' && inside(s) ? [] : [s]
  })
}

/** A band along an edge, from `bottom` to `top` over each end (a sloped roof's edge rises with it). */
const band = (a: Vec2, b: Vec2, bottomA: number, bottomB: number, thickness: number): Seen['points'] => [
  { p: a, z: bottomA },
  { p: b, z: bottomB },
  { p: b, z: bottomB + thickness },
  { p: a, z: bottomA + thickness }
]

/**
 * A ring of an outline with the points that only bend it by a hair taken out: the join of the
 * walls leaves a corner a little off square, with a notch a hair wide, and cuts a straight side
 * into pieces there. A point within `facadeOnFace` of the line through its neighbours is not a
 * corner, whether it lies between them or past one, at the tip of a notch with no width.
 *
 * VEW-36: every point taken out stays within `facadeOnFace` of the side that is left, not only of
 * the line through its neighbours when it was taken. Otherwise a straight side swallows, one
 * station at a time, the start of a curve it runs into, as on a rounded corner, and turns off the
 * straight wall's face by more than that, so the wall is no longer found on it.
 */
function straightened(ring: readonly Pair[]): Vec2[] {
  const closed = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
  const all = (closed ? ring.slice(0, -1) : ring).map(([x, y]) => ({ x, y }))
  const near = tolerance('facadeOnFace')
  const offLine = (p: Vec2, a: Vec2, b: Vec2): number => {
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    return length > 0 ? Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length : Math.hypot(p.x - a.x, p.y - a.y)
  }
  // The points kept, by their place in the ring.
  const kept = all.map((_, i) => i)
  for (let changed = true; changed && kept.length > 3; ) {
    changed = false
    for (let i = 0; i < kept.length && kept.length > 3; i++) {
      const from = kept[(i - 1 + kept.length) % kept.length]!
      const to = kept[(i + 1) % kept.length]!
      const prev = all[from]!
      const next = all[to]!
      // Every point between the two neighbours, this one and the ones taken out before it.
      let straight = true
      for (let j = (from + 1) % all.length; j !== to && straight; j = (j + 1) % all.length) straight = offLine(all[j]!, prev, next) <= near
      if (!straight) continue
      kept.splice(i, 1)
      i--
      changed = true
    }
  }
  return kept.map((i) => all[i]!)
}

/** Each edge of an outline that turns toward the side, and shows some width across the view. */
function edgesFacing(pieces: MultiPolygon, direction: Vec2): { a: Vec2; b: Vec2; e: Vec2; length: number }[] {
  const out: { a: Vec2; b: Vec2; e: Vec2; length: number }[] = []
  const across = { x: -direction.y, y: direction.x }
  for (const polygon of pieces) {
    for (const ring of polygon) {
      const points = straightened(ring)
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!
        const b = points[(i + 1) % points.length]!
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        if (!(length > tolerance('noLength'))) continue
        const e = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
        // Outer rings run counter-clockwise and holes clockwise, so the solid is on the left of
        // every edge and the outside on its right.
        const outward = { x: e.y, y: -e.x }
        if (dot(outward, direction) <= tolerance('facadeFacing')) continue
        if (Math.abs(dot(e, across)) * length <= tolerance('facadeOnFace')) continue
        out.push({ a, b, e, length })
      }
    }
  }
  return out
}

/**
 * How far a curved wall's outside face may bow off a straightened edge of the outline and still
 * lie on it (CNT-18): the sagitta of its curve over the edge, and never more than `facadeOnFace`,
 * since `straightened` keeps every point of the outline within that of the edge it leaves. Taken
 * over the edge alone, a long straight side between two tight corners would allow metres, and a
 * corner on the far side of the building would be drawn on it (VEW-36).
 */
function curveBow(edge: { readonly length: number }, wall: Wall): number {
  const curve = wallCurve(wall)
  if (curve === null) return 0
  return Math.min(tolerance('facadeOnFace'), (edge.length * edge.length) / (8 * (curve.radius + wall.thickness / 2)))
}

/** A wall's outside face along an edge: the stretch of the edge it covers, from the edge's start. */
interface Cover {
  readonly wall: Wall
  readonly t0: number
  readonly t1: number
}

/** The walls whose face lies on the edge, and where along it. */
function coversOf(edge: { a: Vec2; e: Vec2; length: number }, walls: readonly Wall[], owners: ReadonlyMap<Wall, Wall> = new Map()): Cover[] {
  const near = tolerance('facadeOnFace')
  const outward = { x: edge.e.y, y: -edge.e.x }
  const along = (p: Vec2): number => (p.x - edge.a.x) * edge.e.x + (p.y - edge.a.y) * edge.e.y
  const off = (p: Vec2): number => Math.abs((p.x - edge.a.x) * outward.x + (p.y - edge.a.y) * outward.y)
  const covers: Cover[] = []
  for (const wall of walls) {
    const sx = wall.start[0]
    const sy = wall.start[1]
    const dx = wall.end[0] - sx
    const dy = wall.end[1] - sy
    const length = Math.hypot(dx, dy)
    const normal = { x: -dy / length, y: dx / length }
    // The face that looks out the way the edge does.
    const sign = dot(normal, outward) >= 0 ? 1 : -1
    const half = (wall.thickness / 2) * sign
    const p = { x: sx + normal.x * half, y: sy + normal.y * half }
    const q = { x: wall.end[0] + normal.x * half, y: wall.end[1] + normal.y * half }
    // A piece of a curved wall lies on the curve, which bows off a straightened edge of the
    // outline (CNT-18, VEW-36: `curveBow`).
    const owner = owners.get(wall)
    const bow = owner === undefined ? 0 : curveBow(edge, owner)
    if (off(p) > near + bow || off(q) > near + bow) continue
    const t0 = Math.max(0, Math.min(along(p), along(q)))
    const t1 = Math.min(edge.length, Math.max(along(p), along(q)))
    // A straight piece of a curved wall stands for the wall (CNT-18).
    if (t1 - t0 > tolerance('noLength')) covers.push({ wall: owners.get(wall) ?? wall, t0, t1 })
  }
  return covers
}

/**
 * The edge cut into stretches, each with the wall it shows: the tallest wall over it, or, for a
 * stretch no wall covers that is no longer than a wall is thick (a corner, a wall end), the wall
 * beside it. A longer stretch with no wall is open and left out.
 */
function stretchesOf(edge: { length: number }, covers: readonly Cover[], thickest: number): { wall: Wall; t0: number; t1: number }[] {
  const points = [...new Set([0, edge.length, ...covers.flatMap((c) => [c.t0, c.t1])])].sort((x, y) => x - y)
  const pieces: { wall: Wall | null; t0: number; t1: number }[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const t0 = points[i]!
    const t1 = points[i + 1]!
    if (!(t1 - t0 > tolerance('noLength'))) continue
    const mid = (t0 + t1) / 2
    const over = covers.filter((c) => c.t0 <= mid && mid <= c.t1).sort((x, y) => y.wall.height - x.wall.height)
    pieces.push({ wall: over[0]?.wall ?? null, t0, t1 })
  }
  const reach = thickest + tolerance('gap')
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!
    if (piece.wall !== null || piece.t1 - piece.t0 > reach) continue
    const before = pieces[i - 1]?.wall ?? null
    const after = pieces[i + 1]?.wall ?? null
    const taller = before !== null && after !== null ? (before.height >= after.height ? before : after) : (before ?? after)
    pieces[i] = { ...piece, wall: taller }
  }
  const out: { wall: Wall; t0: number; t1: number }[] = []
  for (const piece of pieces) {
    if (piece.wall === null) continue
    const last = out[out.length - 1]
    if (last !== undefined && last.wall === piece.wall && Math.abs(last.t1 - piece.t0) <= tolerance('noLength')) out[out.length - 1] = { ...last, t1: piece.t1 }
    else out.push({ wall: piece.wall, t0: piece.t0, t1: piece.t1 })
  }
  return out
}

/** The openings of a wall seen in a stretch of its face: the ones whose middle lies in it. */
function openingsIn(
  wall: Wall,
  openings: readonly Opening[],
  edge: { a: Vec2; e: Vec2; length: number },
  stretch: { t0: number; t1: number },
  across: Vec2,
  floorLevel: number
): FacadeOpening[] {
  const sx = wall.start[0]
  const sy = wall.start[1]
  const dx = wall.end[0] - sx
  const dy = wall.end[1] - sy
  const length = Math.hypot(dx, dy)
  // Along a curved wall's curve (CNT-18): its openings' edges are on the curve.
  const at = (s: number): Vec2 => (wall.arc !== undefined ? wallPointAt(wall, s) : { x: sx + (dx / length) * s, y: sy + (dy / length) * s })
  const along = (p: Vec2): number => (p.x - edge.a.x) * edge.e.x + (p.y - edge.a.y) * edge.e.y
  const point = (t: number): Vec2 => ({ x: edge.a.x + edge.e.x * t, y: edge.a.y + edge.e.y * t })
  const out: FacadeOpening[] = []
  for (const opening of openings) {
    if (!Number.isFinite(opening.offset) || !Number.isFinite(opening.width)) continue
    const centre = at(opening.offset + opening.width / 2)
    // On a curved wall, an opening is seen on the stretch of the outline beside it, not on every
    // stretch its middle projects onto (CNT-18).
    const curve = wallCurve(wall)
    if (curve !== null) {
      const off = Math.abs((centre.x - edge.a.x) * edge.e.y - (centre.y - edge.a.y) * edge.e.x)
      if (off > wall.thickness / 2 + tolerance('facadeOnFace') + curveBow(edge, wall)) continue
    }
    const middle = along(centre)
    if (middle < stretch.t0 - tolerance('noLength') || middle > stretch.t1 + tolerance('noLength')) continue
    const ends = [along(at(opening.offset)), along(at(opening.offset + opening.width))].map((t) => dot(point(t), across))
    out.push({
      id: opening.id,
      type: opening.type,
      wall: wall.id,
      u0: fine(Math.min(...ends)),
      u1: fine(Math.max(...ends)),
      bottom: fine(floorLevel + opening.sill),
      top: fine(floorLevel + opening.sill + opening.height),
      reveal: fine(wall.thickness)
    })
  }
  return out
}

/**
 * A wall's face along a stretch of an edge, as corners: along the bottom at its floor's level, then
 * back along its top: level at its height, or at the underside of the slab or flat roof over it
 * when it stops short of it (`raisedTo`, VEW-33), or, under a roof the floor states (LVL-6), the
 * top the roof leaves it (`wallTopProfile`), turning where it turns.
 *
 * VEW-61: under a roof the floor states, an outside wall (`toRoof`) rises to the roof whatever
 * height it states, as a wall that states none does: its top is the roof's underside over its line,
 * so a gable end is drawn whole from the eaves to the verge, with no line at the stated height.
 */
function wallPoints(plan: FloorPlan, wall: Wall, edge: { a: Vec2; e: Vec2 }, stretch: { t0: number; t1: number }, floorLevel: number, drop = 0, raisedTo?: number, toRoof = false): Seen['points'] {
  const point = (t: number): Vec2 => ({ x: edge.a.x + edge.e.x * t, y: edge.a.y + edge.e.y * t })
  const a = point(stretch.t0)
  const b = point(stretch.t1)
  const bottom = [{ p: a, z: floorLevel - drop }, { p: b, z: floorLevel - drop }]
  const roofTop = toRoof ? floorRoofShape(plan, floorOf(wall))?.top : undefined
  const profile = wallTopProfile(plan, roofTop !== undefined && roofTop > wall.height ? { ...wall, height: roofTop } : wall)
  // VEW-33: a level top under another floor's slab, or the flat roof Grid lays, rises to it.
  const level = raisedTo ?? floorLevel + wall.height
  if (profile === null) return [...bottom, { p: b, z: level }, { p: a, z: level }]
  const sx = wall.start[0]
  const sy = wall.start[1]
  const length = Math.hypot(wall.end[0] - sx, wall.end[1] - sy)
  const dx = (wall.end[0] - sx) / length
  const dy = (wall.end[1] - sy) / length
  // A point of the edge as a distance along the wall from its start, and back.
  const along = (p: Vec2): number => (p.x - sx) * dx + (p.y - sy) * dy
  const onEdge = (s: number): number => (sx + dx * s - edge.a.x) * edge.e.x + (sy + dy * s - edge.a.y) * edge.e.y
  const ts = [stretch.t1, ...profile.map((q) => onEdge(q.u)).filter((t) => t > stretch.t0 && t < stretch.t1).sort((x, y) => y - x), stretch.t0]
  const top = ts.map((t) => {
    const p = point(t)
    return { p, z: floorLevel + topAt(profile, Math.min(length, Math.max(0, along(p)))) }
  })
  return [...bottom, ...top]
}

/** Whether a point of the plan lies on a ring of these pieces, within `facadeOnFace`. */
function onEdgeOf(p: Vec2, pieces: MultiPolygon): boolean {
  const near = tolerance('facadeOnFace')
  for (const polygon of pieces) {
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i]!
        const [bx, by] = ring[i + 1]!
        const length2 = (bx - ax) ** 2 + (by - ay) ** 2
        const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / length2)) : 0
        if (Math.hypot(p.x - (ax + (bx - ax) * t), p.y - (ay + (by - ay) * t)) <= near) return true
      }
    }
  }
  return false
}

/**
 * VEW-12: which edge of a sloped roof the plan's edge `a`–`b` of a plane is: on the roof's edge but
 * not on the floor's outline, an abutment; level, its eaves at the plane's lowest (`low`) and else
 * a ridge; sloped, a verge on the outline and a hip inside the roof. Null on a level plane.
 */
function roofEdgeOf(a: Vec2, b: Vec2, plane: RoofPlane, low: number, roof: MultiPolygon, outline: MultiPolygon): FacadeRoofEdge | null {
  if (!(Math.hypot(plane.gx, plane.gy) > tolerance('noLength'))) return null
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const onOutline = onEdgeOf(mid, outline)
  if (!onOutline && onEdgeOf(mid, roof)) return 'abutment'
  const za = planeAt(plane, a)
  const zb = planeAt(plane, b)
  if (Math.abs(za - zb) <= tolerance('facadeOnFace')) return Math.min(za, zb) - low <= tolerance('facadeOnFace') ? 'eaves' : 'ridge'
  return onOutline ? 'verge' : 'hip'
}

/** The silhouette of the faces above the ground: their union. Empty when it cannot be worked out. */
function silhouette(faces: readonly FacadeFace[], ground: number, groundAt: (u: number) => number = () => ground): (readonly (readonly [number, number])[])[] {
  const shapes: Polygon[] = faces
    .filter((f) => f.top > Math.min(groundAt(f.u0), groundAt(f.u1)) && f.u1 > f.u0 && f.outline.length >= 3)
    .map((f) => [[...f.outline.map(([u, z]) => [u, z] as [number, number]), [f.outline[0]![0], f.outline[0]![1]]]])
  if (shapes.length === 0) return []
  try {
    const all = polygonClipping.union(shapes[0]!, ...shapes.slice(1))
    const u0 = Math.min(...faces.map((f) => f.u0)) - 1
    const u1 = Math.max(...faces.map((f) => f.u1)) + 1
    const top = Math.max(...faces.map((f) => f.top), groundAt(u0), groundAt(u1)) + 1
    const above = polygonClipping.intersection(all, [[[u0, groundAt(u0)], [u1, groundAt(u1)], [u1, top], [u0, top], [u0, groundAt(u0)]]])
    // A ring with no area to speak of (`areaReported`), a sliver the join leaves along a gable's slope, is not part of it.
    const area = (ring: readonly (readonly [number, number])[]): number => Math.abs(ring.slice(0, -1).reduce((sum, [u, z], i) => sum + u * ring[i + 1]![1] - ring[i + 1]![0] * z, 0)) / 2
    return above.flatMap((polygon) => polygon.map((ring) => ring.map(([u, z]) => [fine(u), fine(z)] as const)).filter((ring) => area(ring) > tolerance('areaReported')))
  } catch {
    return []
  }
}

/** The plane of each depth, front to back, faces within `facadeSameDepth` of each other sharing one. */
function tiersOf(depths: readonly number[]): Map<number, 0 | 1 | 2> {
  const sorted = [...new Set(depths)].sort((x, y) => x - y)
  const tiers = new Map<number, 0 | 1 | 2>()
  let rank = 0
  let start: number | null = null
  for (const depth of sorted) {
    if (start !== null && depth - start > tolerance('facadeSameDepth')) {
      rank++
      start = depth
    }
    start ??= depth
    tiers.set(depth, Math.min(rank, 2) as 0 | 1 | 2)
  }
  return tiers
}

type Ring = [number, number][]
const closedRing = (outline: FacadeFace['outline']): Ring => [...outline.map(([u, z]): [number, number] => [u, z]), [outline[0]![0], outline[0]![1]]]
const boxRing = (u0: number, u1: number, bottom: number, top: number): Ring => [[u0, bottom], [u1, bottom], [u1, top], [u0, top], [u0, bottom]]
const ringsArea = (pieces: MultiPolygon): number =>
  pieces.reduce((sum, polygon) => sum + polygon.reduce((s, ring, i) => s + (i === 0 ? 1 : -1) * Math.abs(ring.slice(0, -1).reduce((a, [u, z], j) => a + u * ring[j + 1]![1] - ring[j + 1]![0] * z, 0)) / 2, 0), 0)

/** Whether the shape is hidden whole by the faces in front of it: nothing of it is left above `areaReported`. */
function hiddenBy(shape: Ring, box: { u0: number; u1: number; bottom: number; top: number }, nearer: readonly FacadeFace[]): boolean {
  const over = nearer.filter((f) => f.u0 < box.u1 && f.u1 > box.u0 && f.bottom < box.top && f.top > box.bottom && f.outline.length >= 3)
  if (over.length === 0) return false
  try {
    // VEW-49: a doorless opening is a hole in the face that holds it: what stands behind is seen.
    const solid = (f: FacadeFace): Polygon => [closedRing(f.outline), ...f.openings.filter((o) => o.type === 'opening' && o.u0 >= f.u0 && o.u1 <= f.u1 && o.bottom >= f.bottom && o.top <= f.top).map((o) => boxRing(o.u0, o.u1, o.bottom, o.top))]
    const left = polygonClipping.difference([shape], ...over.map(solid))
    return ringsArea(left) <= tolerance('areaReported')
  } catch {
    return false
  }
}

/**
 * VEW-25: the faces in drawing order, with each wall's face that is not seen null: one lying within
 * another face of the same wall, floor and depth (found along two outlines), or one the faces in
 * front of it hide whole. A wall's face left in loses the openings hidden whole. Every other face
 * is kept as it is.
 */
function seenWalls(faces: readonly FacadeFace[]): (FacadeFace | null)[] {
  const near = tolerance('facadeOnFace')
  const within = (a: FacadeFace, b: FacadeFace): boolean => b.u0 <= a.u0 + near && a.u1 <= b.u1 + near && b.bottom <= a.bottom + near && a.top <= b.top + near
  return faces.map((face, i) => {
    if (face.kind !== 'wall') return face
    const twin = faces.find((other, j) => j !== i && other.kind === 'wall' && other.wall === face.wall && other.floor === face.floor && Math.abs(other.depth - face.depth) <= near && within(face, other) && (!within(other, face) || j < i))
    if (twin !== undefined) return null
    const nearer = faces.filter((other) => other.depth < face.depth - tolerance('facadeSameDepth'))
    if (hiddenBy(closedRing(face.outline), face, nearer)) return null
    const openings = face.openings.filter((o) => !hiddenBy(boxRing(o.u0, o.u1, o.bottom, o.top), o, nearer))
    return openings.length === face.openings.length ? face : { ...face, openings }
  })
}

/**
 * VEW-63: a window's parts as the facade sees it: each box of `openingParts` taken onto the
 * facade, along its wall to `u` between the ends it is seen at and up to `z` between its sill and
 * head as seen (so a window through floors, VEW-47, is worked out whole), and its sill and head,
 * kept inside the face it is in (`bottom` to `top`).
 */
function windowSeen(seen: FacadeOpening, opening: Opening, wall: Wall, direction: Vec2, across: Vec2, bottom: number, top: number): FacadeWindow {
  const from = opening.offset
  const to = opening.offset + opening.width
  // Which end of the opening is seen on the left: its start end where the wall runs the facade's way.
  const forward = dot(wallPointAt(wall, to), across) - dot(wallPointAt(wall, from), across) >= 0
  const uAt = (s: number): number => {
    const t = (s - from) / opening.width
    return forward ? seen.u0 + t * (seen.u1 - seen.u0) : seen.u1 - t * (seen.u1 - seen.u0)
  }
  const zAt = (up: number): number => seen.bottom + ((up - opening.sill) / opening.height) * (seen.top - seen.bottom)
  // The side of the wall the facade looks at: the left face (`across` above 0) when its normal turns that way.
  const outside = dot(wallFrameAt(wall, from + opening.width / 2).normal, direction) >= 0 ? 1 : -1
  const rect = (along: readonly [number, number], up: readonly [number, number]): FacadeRect => {
    const [a, b] = [uAt(along[0]), uAt(along[1])]
    return { u0: fine(Math.min(a, b)), u1: fine(Math.max(a, b)), bottom: fine(zAt(up[0])), top: fine(zAt(up[1])) }
  }
  const parts = openingParts(opening, wall)
  const members = parts
    .map((part, order) => ({ part, order, near: ((part.across[0] + part.across[1]) / 2) * outside }))
    .filter(({ part }) => part.part !== 'glass')
    .sort((x, y) => x.near - y.near || x.order - y.order)
    .map(({ part }) => rect(part.along, part.up))
  const lights = parts.filter((part) => part.part === 'glass').map((part) => rect(part.along, part.up))
  const past = limit('sillProjection')
  const sillTop = seen.bottom
  const sillBottom = Math.max(bottom, sillTop - limit('facadeSillDepth'))
  const headTop = Math.min(top, seen.top + limit('facadeHeadDepth'))
  const room = tolerance('noLength')
  return {
    kind: windowKindOf(opening.kind),
    members,
    lights,
    sill: sillTop - sillBottom > room ? { u0: fine(seen.u0 - past), u1: fine(seen.u1 + past), bottom: fine(sillBottom), top: fine(sillTop) } : null,
    head: headTop - seen.top > room ? { u0: seen.u0, u1: seen.u1, bottom: seen.top, top: fine(headTop) } : null
  }
}

const KIND_ORDER: Readonly<Record<FacadeFaceKind, number>> = { plinth: 0, slab: 1, wall: 2, roof: 3, 'roof-plane': 4, parapet: 5 }

/** The facade of one side of the building. See the module's header. */
export function planFacade(stated: FloorPlan, side: FacadeSide): Facade {
  // CNT-10: the facade as it will be after the work.
  const plan = planInState(withPatterns(stated), 'after')
  const direction = SIDE_DIRECTION[side]
  // Looking against the side's way, the right hand points this way.
  const across = { x: -direction.y + 0, y: direction.x + 0 }
  const orientation = planOrientation(plan)
  const bearing = orientation.north === null ? null : bearingOf(direction, orientation)
  const compass = bearing === null ? null : { bearing, faces: compassPoint(bearing) }
  const elevations = floorElevations(plan)
  const ground = ((): Facade['ground'] => {
    try {
      const found = groundLevel(plan, elevations)
      const surface = found.surface
      if (surface === null) return { level: found.level, stated: found.stated }
      // CNT-49: the ground along the side's front face, the building's furthest point that way.
      const ends = plan.walls.flatMap((w) => [w.start, w.end]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
      const front = ends.length === 0 ? 0 : Math.max(...ends.map((p) => dot({ x: p[0], y: p[1] }, direction)))
      const g = surface.gradient
      const fall = { at: fine(surface.c + dot(g, direction) * front), perMetre: fine(dot(g, across)) }
      return { level: found.level, stated: found.stated, fall }
    } catch {
      return { level: 0, stated: false }
    }
  })()
  const groundAt = (u: number): number => facadeGroundAt({ ground }, u)
  const empty: Facade = { side, direction, across, compass, faces: [], outline: [], ground, levels: [], extent: null, walls: [], openings: [] }

  let floors: ReturnType<typeof planFloors>
  try {
    floors = planFloors(plan)
  } catch {
    return empty
  }
  const envelope = planEnvelope(plan, { elevations })
  // VEW-33: under another floor a storey's top is that floor's slab: full-height walls rise to it.
  const topUnder = wallTopsUnder(plan, envelope, elevations)
  const seen: Seen[] = []
  const add = (face: Omit<Seen, 'order'>): void => {
    seen.push({ ...face, order: seen.length })
  }

  for (const floor of floors) {
    const env = envelope.floors.find((f) => f.floor === floor.id)
    const storey = elevations.floors.get(floor.id)
    if (env === undefined || env.outline === null || env.outline.length === 0 || storey === undefined) continue
    const slice = planForFloor(plan, floor.id)
    const broken = brokenOnFloor(slice)
    const walls = slice.walls.filter(
      (w) => w.virtual !== true && !broken.has(w.id) && isFiniteWall(w) && w.thickness > 0 && (w.arc !== undefined ? curveFault(w) === null : w.start[0] !== w.end[0] || w.start[1] !== w.end[1])
    )
    // CNT-18: a curved wall's face is found along the outline by its straight pieces, each standing for it.
    const owners = new Map<Wall, Wall>()
    const faces = walls.flatMap((w) => {
      if (w.arc === undefined) return [w]
      const pieces = straightPieces(w)
      for (const piece of pieces) owners.set(piece, w)
      return pieces
    })
    // VEW-35: a wall round outdoor space alone (a balcony's edge, a terrace's parapet) keeps its own
    // top: it does not rise to the slab over it, so the doors behind it show above it.
    const fenced = outdoorOnlyWalls(indexPlan(slice))
    const thickest = Math.max(0, ...walls.map((w) => w.thickness))
    const openingsOf = new Map<string, Opening[]>()
    for (const opening of slice.openings) {
      if (broken.has(opening.id)) continue
      openingsOf.set(opening.wall, [...(openingsOf.get(opening.wall) ?? []), opening])
    }
    const edges = edgesFacing(env.outline, direction)
    // VEW-29: a slab's edge is a band of its own only where its thickness is stated; unstated, the
    // wall above it stands down over the edge, as brick and render do, with no string course.
    const bandStated = env.slab !== null && env.slab.thicknessStated
    // A base slab lies on the ground: the wall stays on it.
    const bandDrop = env.slab !== null && !bandStated && env.slab.kind === 'floor' ? env.slab.thickness : 0
    // VEW-25: on a floor with outdoor space (C26), the slab's outline leaves out the walls round
    // outdoor space alone (a porch's front, a terrace's parapet) and takes a terrace in, so the
    // building's own front behind it lies inside. The walls are also read along the floor's
    // outline with every wall, and along the building's alone.
    const outlines = [env.outline]
    if (slice.rooms.some(isOutdoor)) {
      for (const found of [slabOutline(slice, floor.id, broken), slabOutline(buildingPlan(slice), floor.id, broken)]) {
        if (outlineKnown(found) && found.pieces.length > 0) outlines.push(found.pieces)
      }
    }
    for (const outline of outlines) {
      for (const edge of outline === env.outline ? edges : edgesFacing(outline, direction)) {
        for (const stretch of stretchesOf(edge, coversOf(edge, faces, owners), thickest)) {
          add({
            kind: 'wall',
            floor: floor.id,
            wall: stretch.wall.id,
            points: (() => {
              const own = fenced.has((owners.get(stretch.wall) ?? stretch.wall).id)
              // VEW-35: a wall round outdoor space alone keeps its own top; VEW-61: any other rises to the roof the floor states.
              return wallPoints(plan, stretch.wall, edge, stretch, storey.floorLevel, bandDrop, own ? undefined : topUnder(owners.get(stretch.wall) ?? stretch.wall, floor.id)?.top, !own)
            })(),
            openings: openingsIn(stretch.wall, openingsOf.get(stretch.wall.id) ?? [], edge, stretch, across, storey.floorLevel)
          })
        }
      }
    }
    if (env.slab !== null) {
      const { top, thickness } = env.slab
      if (bandStated) for (const edge of edges) add({ kind: 'slab', floor: floor.id, wall: null, points: band(edge.a, edge.b, top - thickness, top - thickness, thickness), openings: [] })
      // VEW-16: down to the ground the site states, under a floor whose slab stands clear of it.
      const plinth = plinthUnder(env.slab, ground.level)
      if (plinth !== null) {
        // VEW-29: with no band of its own for the slab, the plinth carries on up to the slab's top.
        const plinthTop = bandStated ? plinth.top : top
        for (const edge of edges) add({ kind: 'plinth', floor: floor.id, wall: null, points: band(edge.a, edge.b, plinth.bottom, plinth.bottom, plinthTop - plinth.bottom), openings: [] })
      }
    }
    if (env.roof !== null && env.roof.shape === null) {
      const { bottom, thickness } = env.roof
      for (const edge of edgesFacing(env.roof.pieces, direction)) add({ kind: 'roof', floor: floor.id, wall: null, points: band(edge.a, edge.b, bottom, bottom, thickness), openings: [] })
      if (env.roof.parapet !== null) {
        const { height, pieces } = env.roof.parapet
        for (const edge of edgesFacing(pieces, direction)) add({ kind: 'parapet', floor: floor.id, wall: null, points: band(edge.a, edge.b, bottom + thickness, bottom + thickness, height), openings: [] })
      }
    } else if (env.roof !== null) {
      // LVL-6: a sloped roof, plane by plane: each edge as a band that follows the slope, and each
      // plane that comes down toward the side as a surface, its top face.
      // VEW-12: each band and each plane's edge says which edge of the roof it is.
      const { thickness, pieces: roofPieces } = env.roof
      const outline = env.outline
      for (const facet of env.roof.facets) {
        const at = (p: Vec2): number => storey.floorLevel + planeAt(facet.plane, p)
        const low = Math.min(...facet.pieces.flatMap((polygon) => polygon.flatMap((ring) => ring.map(([x, y]) => planeAt(facet.plane, { x, y })))))
        const edgeOf = (a: Vec2, b: Vec2): FacadeRoofEdge | null => roofEdgeOf(a, b, facet.plane, low, roofPieces, outline)
        for (const edge of edgesFacing(facet.pieces, direction)) add({ kind: 'roof', floor: floor.id, wall: null, points: band(edge.a, edge.b, at(edge.a), at(edge.b), thickness), openings: [], edge: edgeOf(edge.a, edge.b) })
        if (-(facet.plane.gx * direction.x + facet.plane.gy * direction.y) <= tolerance('facadeFacing')) continue
        for (const polygon of facet.pieces) {
          const ring = straightened(polygon[0] ?? [])
          if (ring.length < 3) continue
          const points = ring.map((p) => ({ p, z: at(p) + thickness }))
          const roofLines = points.flatMap((a, i) => {
            const b = points[(i + 1) % points.length]!
            const kind = edgeOf(a.p, b.p)
            return kind === null ? [] : [{ kind, a, b }]
          })
          add({ kind: 'roof-plane', floor: floor.id, wall: null, points, openings: [], roofLines })
        }
      }
    }
  }
  // VEW-47: a wall rising through floors (C19) is one face with one window: its stretch on each
  // floor is joined, the window's parts are one opening, and no slab band crosses it.
  const joined = joinThroughWalls(seen, plan, across)
  seen.length = 0
  seen.push(...joined)
  if (seen.length === 0) return empty

  // The nearest point of the facade stands furthest the side's way.
  const front = Math.max(...seen.flatMap((s) => s.points.map(({ p }) => dot(p, direction))))
  // Its middle's depth: over its ends for a face along an edge, over its corners for a roof's plane.
  const depthOf = (s: Seen): number => {
    const ds = s.points.map(({ p }) => dot(p, direction))
    return front - (Math.min(...ds) + Math.max(...ds)) / 2
  }
  // VEW-63: each window seen gets its parts, from the whole opening and its wall.
  const openingById = new Map(plan.openings.map((o) => [o.id, o]))
  const wallById = new Map(plan.walls.map((w) => [w.id, w]))
  const drawn = seen
    .map((s) => {
      const outline = s.points.map(({ p, z }) => [fine(dot(p, across)), fine(z)] as const)
      const us = outline.map(([u]) => u)
      const zs = outline.map(([, z]) => z)
      const openings = s.openings.map((o) => {
        const opening = openingById.get(o.id)
        const owner = wallById.get(o.wall)
        if (o.type !== 'window' || opening === undefined || owner === undefined || !(opening.height > 0) || !(opening.width > 0)) return o
        return { ...o, window: windowSeen(o, opening, owner, direction, across, Math.min(...zs), Math.max(...zs)) }
      })
      const depth = depthOf(s)
      const seenAt = ({ p, z }: { readonly p: Vec2; readonly z: number }): Pair => [fine(dot(p, across)), fine(z)]
      const roofLines = (s.roofLines ?? [])
        .map((line) => ({ kind: line.kind, from: seenAt(line.a), to: seenAt(line.b) }))
        .filter((line) => Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]) > tolerance('noLength'))
      const face: FacadeFace = {
        kind: s.kind,
        floor: s.floor,
        wall: s.wall,
        u0: Math.min(...us),
        u1: Math.max(...us),
        bottom: Math.min(...zs),
        top: Math.max(...zs),
        outline,
        depth: fine(depth),
        tier: 0,
        openings,
        edge: s.edge ?? null,
        roofLines
      }
      return { s, face, depth }
    })
    .filter(({ face }) => face.u1 - face.u0 > tolerance('noLength'))
    .sort((x, y) => y.face.depth - x.face.depth || KIND_ORDER[x.face.kind] - KIND_ORDER[y.face.kind] || x.s.order - y.s.order)
  const kept = seenWalls(drawn.map(({ face }) => face))
  const shown = drawn.filter((_, i) => kept[i] !== null)
  const tiers = tiersOf(shown.map(({ depth }) => depth))
  const faces: FacadeFace[] = drawn.flatMap(({ depth }, i) => {
    const face = kept[i]
    return face === null || face === undefined ? [] : [{ ...face, tier: tiers.get(depth)! }]
  })

  const levels: FacadeLevel[] = floors
    .filter((f) => faces.some((face) => face.floor === f.id))
    .map((f) => {
      const storey = elevations.floors.get(f.id)!
      return { floor: f.id, name: f.name || f.id, level: storey.floorLevel, height: storey.clearHeight }
    })
    .sort((x, y) => x.level - y.level)
  const wallIds = new Set(faces.flatMap((f) => (f.wall === null ? [] : [f.wall])))
  const openingIds = new Set(faces.flatMap((f) => f.openings.map((o) => o.id)))
  return {
    side,
    direction,
    across,
    compass,
    faces,
    outline: silhouette(faces, ground.level, groundAt),
    ground,
    levels,
    extent: {
      u0: Math.min(...faces.map((f) => f.u0)),
      u1: Math.max(...faces.map((f) => f.u1)),
      bottom: Math.min(ground.level, groundAt(Math.min(...faces.map((f) => f.u0))), groundAt(Math.max(...faces.map((f) => f.u1))), ...faces.map((f) => f.bottom)),
      top: Math.max(...faces.map((f) => f.top))
    },
    walls: plan.walls.filter((w) => wallIds.has(w.id)).map((w) => w.id).filter((id, i, all) => all.indexOf(id) === i),
    openings: plan.openings.filter((o) => openingIds.has(o.id)).map((o) => o.id)
  }
}
