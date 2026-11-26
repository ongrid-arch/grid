/**
 * Sloped roofs and the ceilings under them (LVL-6, lab VE-5).
 *
 * A floor may state its roof (`Floor.roof`): flat, mono-pitch, gable or hip, from an eaves height,
 * with a pitch or a ridge height. Here it becomes planes: the roof's underside over a point of the
 * plan is the lowest of its sloped planes there, and never higher than its top (the ridge). Every
 * height is in metres above the floor's level, as a wall's is.
 *
 * Where the roof stands: its eaves run round the smallest rectangle that holds the lines of the
 * floor's outside walls (every solid wall when none is stated outside), turned to the longest of
 * them (`types/roofFrame.ts`). Each sloped plane rises from one side of that rectangle, inward, at
 * the roof's slope: the two long sides of a gable (or the two along `ridgeRuns`), all four of a hip,
 * the side opposite `highSide` of a mono-pitch roof. On a rectangle that is the roof as built; over
 * an L or a T it is one roof over the whole rectangle, with no valleys (see the review's "Not built").
 *
 * What the roof cuts:
 *
 * - **a wall** standing inside that rectangle: its top, along its line, is the lower of its own
 *   height and the roof's underside over that line (`wallTopProfile`). A gable is then a gable, and
 *   the views, the IFC, the check of an opening's top against its wall and the storey's height all
 *   read that top. A wall with no part of it under its height is left a rectangle.
 * - **a room**: its ceiling is the roof's underside, under its own height when it states one, and
 *   its floor area is reported by headroom band (`roomHeadroom`): the floor with at least
 *   `headroomLow` and at least `headroomFull` of height over it, both Grid's own figures.
 *
 * LVL-20: the roof's dormers raise its underside where they stand (`roofUnderside`,
 * `undersideAlong`): sections and the headroom bands read them. And a wall stated `exterior`
 * (on its own floor, not round outdoor space alone) rises to the roof whatever height it states: its
 * top is the roof's underside over its line (`wallTopProfile`), so a gable end is closed and a
 * mono-pitch extension's walls meet their roof.
 *
 * Pure, and never throws on a plan the schema read.
 */

import type { Dormer, FloorPlan, PlanIndex, Roof, Rooflight, Room, Wall } from './plan'
import { indexPlan } from './plan'
import { outdoorOnlyWalls, planHasOutdoor } from './outdoor'
import { floorOf, planForFloor, wallsOnFloor } from './floors'
import { floorElevations, DEFAULT_STOREY_HEIGHT } from './elevations'
import { tryRoomShape } from './room'
import { roomFloorOffset } from './steps'
import { cutOutline, inPieces, multiArea, ringOf, union } from './polygons'
import { limit, tolerance } from './tolerances'
import { wallAxis } from './wall'
import type { Vec2 } from './vec2'
import { roofFrame, roofSlope, roofTop, ridgeRunsOf, type RoofFrame } from '../types/roofFrame'
import type { MultiPolygon } from 'polygon-clipping'
import { said, type Said } from '../messages/say'

/** A plane of the roof's underside: its height over (x, y) is `z0 + gx·x + gy·y`, above the floor's level. */
export interface RoofPlane {
  readonly z0: number
  readonly gx: number
  readonly gy: number
}

export const planeAt = (plane: RoofPlane, p: Vec2): number => plane.z0 + plane.gx * p.x + plane.gy * p.y

/** A floor's stated roof, as planes. */
export interface RoofShapeOverFloor {
  readonly floor: string
  readonly roof: Roof
  readonly frame: RoofFrame
  /** The rectangle its eaves run round, on the outside walls' lines, counter-clockwise. */
  readonly footprint: readonly Vec2[]
  /** Its sloped planes, each rising from its eaves; none on a flat roof. */
  readonly planes: readonly RoofPlane[]
  /** The underside's highest point: the ridge, or a flat roof's eaves. It never rises above it. */
  readonly top: number
  /** Rise per metre on plan, and the pitch in degrees; both 0 on a flat roof. */
  readonly slope: number
  readonly pitch: number
  /** LVL-20: the dormers that have a place on it, in the roof's order; one that has none is left out (the check names it). */
  readonly dormers: readonly DormerPlace[]
}

/** Every plane that bounds the underside: the sloped ones, then the top as a level plane. */
export const boundingPlanes = (shape: RoofShapeOverFloor): readonly RoofPlane[] => [...shape.planes, { z0: shape.top, gx: 0, gy: 0 }]

/** The roof's underside over a point: the lowest plane there. */
export function roofHeightAt(shape: RoofShapeOverFloor, p: Vec2): number {
  let h = shape.top
  for (const plane of shape.planes) h = Math.min(h, planeAt(plane, p))
  return h
}

const shapes = new WeakMap<FloorPlan, Map<string, RoofShapeOverFloor | null>>()

/** The walls a floor's roof stands on: those stated outside, else every solid wall. */
function roofWalls(plan: FloorPlan, floor: string): Wall[] {
  const solid = wallsOnFloor(plan, floor).filter((w) => w.virtual !== true)
  const outside = solid.filter((w) => w.kind === 'exterior')
  return outside.length > 0 ? outside : solid
}

/**
 * The roof a floor states, as planes, or null when it states none or has no walls to stand it on.
 * The first entry of a floor id wins, as in `planFloors`.
 */
export function floorRoofShape(plan: FloorPlan, floor: string): RoofShapeOverFloor | null {
  let byFloor = shapes.get(plan)
  if (byFloor === undefined) {
    byFloor = new Map()
    shapes.set(plan, byFloor)
  }
  if (byFloor.has(floor)) return byFloor.get(floor)!
  const found = shapeOf(plan, floor)
  byFloor.set(floor, found)
  return found
}

function shapeOf(plan: FloorPlan, floor: string): RoofShapeOverFloor | null {
  const roof = (plan.floors ?? []).find((f) => f.id === floor)?.roof
  if (roof === undefined) return null
  const frame = roofFrame(roofWalls(plan, floor))
  if (frame === null) return null
  const { east, north } = frame
  const at = (u: number, v: number): Vec2 => ({ x: u * east.x + v * north.x, y: u * east.y + v * north.y })
  const footprint = [at(frame.west, frame.south), at(frame.eastEdge, frame.south), at(frame.eastEdge, frame.northEdge), at(frame.west, frame.northEdge)]
  const slope = roofSlope(roof, frame)
  // A plane rising inward from one side: `inward` points into the rectangle, `edge` is the side's
  // place along it.
  const from = (inward: Vec2, edge: number): RoofPlane => ({ z0: roof.eaves - slope * edge, gx: slope * inward.x, gy: slope * inward.y })
  const southSide = from(north, frame.south)
  const northSide = from({ x: -north.x, y: -north.y }, -frame.northEdge)
  const westSide = from(east, frame.west)
  const eastSide = from({ x: -east.x, y: -east.y }, -frame.eastEdge)
  let planes: RoofPlane[] = []
  if (roof.shape === 'gable') planes = ridgeRunsOf(roof, frame) === 'east-west' ? [southSide, northSide] : [westSide, eastSide]
  else if (roof.shape === 'hip') planes = [southSide, eastSide, northSide, westSide]
  else if (roof.shape === 'mono-pitch') {
    // The plane rises from the side opposite the high one.
    planes = [{ north: southSide, south: northSide, east: westSide, west: eastSide }[roof.highSide ?? 'north']]
  }
  if (!(slope > 0)) planes = []
  const bare: RoofShapeOverFloor = {
    floor,
    roof,
    frame,
    footprint,
    planes,
    top: roofTop(roof, frame),
    slope: planes.length === 0 ? 0 : slope,
    pitch: planes.length === 0 ? 0 : (Math.atan(slope) * 180) / Math.PI,
    dormers: []
  }
  const dormers = (roof.dormers ?? []).flatMap((dormer) => {
    const place = dormerPlace(bare, dormer)
    return 'problem' in place ? [] : [place]
  })
  return dormers.length === 0 ? bare : { ...bare, dormers }
}

// ---------------------------------------------------------------------------------------------
// Convex pieces of the plan, cut by planes

/** A convex polygon less the part where `f` is negative: Sutherland and Hodgman's clip by one line. */
function clipConvex(polygon: readonly Vec2[], f: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

const ringArea = (ring: readonly Vec2[]): number => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/**
 * The roof's rectangle widened all round by its own width and depth: far enough to hold the walls'
 * outer faces and anything drawn against them, near enough to stay a number.
 */
function reach(shape: RoofShapeOverFloor): Vec2[] {
  const { frame } = shape
  const grow = frame.eastEdge - frame.west + (frame.northEdge - frame.south)
  const { east, north } = frame
  const at = (u: number, v: number): Vec2 => ({ x: u * east.x + v * north.x, y: u * east.y + v * north.y })
  return [
    at(frame.west - grow, frame.south - grow),
    at(frame.eastEdge + grow, frame.south - grow),
    at(frame.eastEdge + grow, frame.northEdge + grow),
    at(frame.west - grow, frame.northEdge + grow)
  ]
}

/** One plane of the underside and the part of the plan under it, a convex polygon, counter-clockwise. */
export interface RoofFacet {
  readonly plane: RoofPlane
  readonly polygon: readonly Vec2[]
}

/**
 * The underside as convex pieces, each under one plane (the top too, where the roof is level):
 * where a plane is the lowest of them. Over the rectangle and well round it, so any part of the
 * floor's outline falls in one. A piece with no area (a gable's ridge line) is left out.
 */
export function roofFacets(shape: RoofShapeOverFloor): RoofFacet[] {
  const planes = boundingPlanes(shape)
  const facets: RoofFacet[] = []
  planes.forEach((plane, i) => {
    let polygon: Vec2[] = reach(shape)
    planes.forEach((other, j) => {
      if (j === i || polygon.length < 3) return
      polygon = clipConvex(polygon, (p) => planeAt(other, p) - planeAt(plane, p))
    })
    if (polygon.length >= 3 && ringArea(polygon) > tolerance('noArea')) facets.push({ plane, polygon })
  })
  return facets
}

/** The part of the plan, round the roof, with at least `height` under the roof: convex, possibly empty. */
export function regionAtLeast(shape: RoofShapeOverFloor, height: number): Vec2[] {
  if (shape.top < height - tolerance('lengthEqual')) return []
  let polygon: Vec2[] = reach(shape)
  for (const plane of shape.planes) {
    if (polygon.length < 3) return []
    polygon = clipConvex(polygon, (p) => planeAt(plane, p) - height)
  }
  return polygon.length >= 3 ? polygon : []
}

// ---------------------------------------------------------------------------------------------
// Walls cut to the roof

/** A point of a wall's top: `u` metres along it from its start, `z` above the floor's level. */
export interface WallTopPoint {
  readonly u: number
  readonly z: number
}

const profiles = new WeakMap<Wall, { readonly shape: RoofShapeOverFloor; readonly profile: readonly WallTopPoint[] | null }>()

/** Whether a point lies in the roof's rectangle, give or take `gap`. */
function underRoof(shape: RoofShapeOverFloor, p: Vec2): boolean {
  const { frame } = shape
  const u = p.x * frame.east.x + p.y * frame.east.y
  const v = p.x * frame.north.x + p.y * frame.north.y
  const slack = tolerance('gap')
  return u >= frame.west - slack && u <= frame.eastEdge + slack && v >= frame.south - slack && v <= frame.northEdge + slack
}

/**
 * LVL-20: whether a wall rises to the roof over it whatever height it states: a solid wall stated
 * `exterior`, standing on its own floor (not through floors, LVL-5), and not round outdoor space
 * alone (VEW-35: a parapet on a terrace keeps its own top). By the stated kind, as the roof's own
 * frame stands on the walls stated exterior; a wall left `interior` on the building's outside keeps
 * its height, and the check names the gap over it (`wall/under-roof`).
 */
export function risesToRoof(plan: FloorPlan, wall: Wall): boolean {
  if (wall.virtual === true || wall.kind !== 'exterior' || wall.through !== undefined) return false
  if (!planHasOutdoor(plan)) return true
  return !fencedOn(plan, floorOf(wall)).has(wall.id)
}

const fencedWalls = new WeakMap<FloorPlan, Map<string, ReadonlySet<string>>>()

function fencedOn(plan: FloorPlan, floor: string): ReadonlySet<string> {
  let byFloor = fencedWalls.get(plan)
  if (byFloor === undefined) {
    byFloor = new Map()
    fencedWalls.set(plan, byFloor)
  }
  let found = byFloor.get(floor)
  if (found === undefined) {
    try {
      found = outdoorOnlyWalls(indexPlan(planForFloor(plan, floor)))
    } catch {
      found = new Set()
    }
    byFloor.set(floor, found)
  }
  return found
}

/**
 * The top of a wall the floor's roof cuts, along its line from its start: the lower of the wall's
 * height and the underside over its line, as the points where it turns, first at 0 and last at the
 * wall's length. LVL-20: a wall that rises to the roof (`risesToRoof`) is cut from the roof's top,
 * so its top is the underside over its line wherever that stands above its stated height. Null when
 * the roof neither cuts nor raises it: no roof stated, a dividing line, a wall standing outside the
 * roof's rectangle, or one as high everywhere as the roof over it, and no higher.
 */
export function wallTopProfile(plan: FloorPlan, wall: Wall): readonly WallTopPoint[] | null {
  if (wall.virtual === true || !(wall.height > 0)) return null
  const shape = floorRoofShape(plan, floorOf(wall))
  if (shape === null) return null
  const cached = profiles.get(wall)
  if (cached !== undefined && cached.shape === shape) return cached.profile
  const profile = profileOf(shape, wall, risesToRoof(plan, wall) ? Math.max(wall.height, shape.top) : wall.height)
  profiles.set(wall, { shape, profile })
  return profile
}

function profileOf(shape: RoofShapeOverFloor, wall: Wall, height: number): readonly WallTopPoint[] | null {
  let axis: ReturnType<typeof wallAxis>
  try {
    axis = wallAxis(wall)
  } catch {
    return null
  }
  if (!underRoof(shape, axis.start) || !underRoof(shape, axis.end)) return null
  const length = axis.length
  // Each bound as a line along the wall: a + b·u.
  const lines = [...boundingPlanes(shape).map((plane) => ({ a: planeAt(plane, axis.start), b: plane.gx * axis.dir.x + plane.gy * axis.dir.y })), { a: height, b: 0 }]
  const at = (u: number): number => Math.min(...lines.map((l) => l.a + l.b * u))
  const cuts = new Set<number>([0, length])
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const db = lines[i]!.b - lines[j]!.b
      if (Math.abs(db) < tolerance('noSlope')) continue
      const u = (lines[j]!.a - lines[i]!.a) / db
      if (u > tolerance('noLength') && u < length - tolerance('noLength')) cuts.add(u)
    }
  }
  // Where lines cross at one place, rounding gives several places a hair apart: one is kept.
  const places: number[] = []
  for (const u of [...cuts].sort((a, b) => a - b)) {
    if (places.length > 0 && u - places[places.length - 1]! < tolerance('joint') && u !== length) continue
    if (u === length && places.length > 0 && length - places[places.length - 1]! < tolerance('joint')) places.pop()
    places.push(u)
  }
  const points = places.map((u) => ({ u, z: at(u) }))
  if (points.every((p) => Math.abs(p.z - wall.height) <= tolerance('joint'))) return null
  // Only the points where the top turns: each kept point is checked against the last one kept.
  const turns: WallTopPoint[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const a = turns[turns.length - 1]!
    const p = points[i]!
    const b = points[i + 1]!
    const expected = a.z + ((b.z - a.z) * (p.u - a.u)) / (b.u - a.u)
    if (Math.abs(expected - p.z) > tolerance('joint')) turns.push(p)
  }
  turns.push(points[points.length - 1]!)
  return turns
}

/**
 * LVL-20: the roof's underside over a wall's line, as `wallTopProfile` gives a top: the points where
 * it turns, from 0 to the wall's length, whatever the wall's height. Null when the wall is curved or
 * stands outside the roof's rectangle. What the check of a gap over a wall reads.
 */
export function roofOverWall(shape: RoofShapeOverFloor, wall: Wall): readonly WallTopPoint[] | null {
  return profileOf(shape, { ...wall, height: shape.top + 1 }, shape.top + 1)
}

/** The wall's top at `u` along it, on a profile. */
export function topAt(profile: readonly WallTopPoint[], u: number): number {
  if (u <= profile[0]!.u) return profile[0]!.z
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!
    const b = profile[i]!
    if (u <= b.u) return b.u === a.u ? b.z : a.z + ((b.z - a.z) * (u - a.u)) / (b.u - a.u)
  }
  return profile[profile.length - 1]!.z
}

/** The lowest and highest the top stands between `from` and `to` along the wall. */
export function topBetween(profile: readonly WallTopPoint[], from: number, to: number): { readonly low: number; readonly high: number } {
  const values = [topAt(profile, from), topAt(profile, to), ...profile.filter((p) => p.u > from && p.u < to).map((p) => p.z)]
  return { low: Math.min(...values), high: Math.max(...values) }
}

/** The area of the wall's face under its top between `from` and `to` along it, in square metres. */
export function faceUnderTop(profile: readonly WallTopPoint[], from: number, to: number): number {
  const a = Math.min(from, to)
  const b = Math.max(from, to)
  const us = [a, ...profile.map((p) => p.u).filter((u) => u > a && u < b), b]
  let area = 0
  for (let i = 1; i < us.length; i++) area += ((topAt(profile, us[i - 1]!) + topAt(profile, us[i]!)) / 2) * (us[i]! - us[i - 1]!)
  return area
}

/** A wall's highest point: its height, or the highest point of the top the roof leaves it. */
export function wallPeak(plan: FloorPlan, wall: Wall): number {
  const profile = wallTopProfile(plan, wall)
  return profile === null ? wall.height : Math.max(...profile.map((p) => p.z))
}

/**
 * LVL-6 with HND-2: the volume of `pieces` swept up from 0 to the lowest of `planes`, in cubic
 * metres: each plane over the part of the pieces where it is the lowest, its height there
 * integrated exactly (a plane's mean over a polygon is its height at the centroid). This is the
 * volume of an extrusion clipped by those planes, as the IFC writes a wall or a space under the
 * roof. The planes are in the pieces' frame and stay above 0 over them.
 */
export function volumeUnder(planes: readonly RoofPlane[], pieces: MultiPolygon): number {
  if (planes.length === 0 || pieces.length === 0) return 0
  const xs = pieces.flatMap((polygon) => polygon.flatMap((ring) => ring.map(([x]) => x)))
  const ys = pieces.flatMap((polygon) => polygon.flatMap((ring) => ring.map(([, y]) => y)))
  const grow = 1 + Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)
  const [x0, x1, y0, y1] = [Math.min(...xs) - grow, Math.max(...xs) + grow, Math.min(...ys) - grow, Math.max(...ys) + grow]
  // A plane given twice would count its part twice.
  const distinct = planes.filter((plane, i) => planes.findIndex((p) => p.z0 === plane.z0 && p.gx === plane.gx && p.gy === plane.gy) === i)
  let volume = 0
  distinct.forEach((plane, i) => {
    let region: Vec2[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
    distinct.forEach((other, j) => {
      if (j === i || region.length < 3) return
      region = clipConvex(region, (p) => planeAt(other, p) - planeAt(plane, p))
    })
    if (region.length < 3 || ringArea(region) <= 0) return
    const under = cutOutline('intersection', pieces, [[ringOf(region)]])
    for (const polygon of under ?? []) {
      polygon.forEach((ring, k) => {
        let a = 0
        let mx = 0
        let my = 0
        for (let n = 0; n < ring.length; n++) {
          const [px, py] = ring[n]!
          const [qx, qy] = ring[(n + 1) % ring.length]!
          const cross = px * qy - qx * py
          a += cross / 2
          mx += ((px + qx) * cross) / 6
          my += ((py + qy) * cross) / 6
        }
        // The outer ring counts, its holes are taken off, whichever way each runs.
        const sign = (k === 0 ? 1 : -1) * Math.sign(a)
        volume += sign * (plane.z0 * a + plane.gx * mx + plane.gy * my)
      })
    }
  })
  return volume
}

// ---------------------------------------------------------------------------------------------
// Rooflights

/** Where a rooflight lies: on one plane of the roof, as a rectangle on the plan. */
export interface RooflightPlace {
  readonly rooflight: Rooflight
  readonly plane: RoofPlane
  /** Its rectangle on the plan, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Unit directions on the plan: along its width, and up the slope (its length). */
  readonly across: Vec2
  readonly up: Vec2
  /** Its length as the plan shows it: its length on the slope, foreshortened. */
  readonly planLength: number
}

/**
 * A rooflight's place on the roof, or why it has none: it must lie inside the roof's rectangle and
 * wholly on one plane of it, so it does not cross a ridge or a hip.
 */
export function rooflightPlace(shape: RoofShapeOverFloor, rooflight: Rooflight): RooflightPlace | { readonly problem: Said } {
  const at = { x: rooflight.at[0], y: rooflight.at[1] }
  const planes = boundingPlanes(shape)
  let plane = planes[planes.length - 1]!
  for (const candidate of planes) if (planeAt(candidate, at) < planeAt(plane, at) - tolerance('joint')) plane = candidate
  const rise = Math.hypot(plane.gx, plane.gy)
  const flat = rise < tolerance('noSlope')
  const up = flat ? shape.frame.north : { x: plane.gx / rise, y: plane.gy / rise }
  const across = { x: up.y, y: -up.x }
  const planLength = rooflight.length / Math.sqrt(1 + rise * rise)
  const w = rooflight.width / 2
  const l = planLength / 2
  const corner = (a: number, b: number): Vec2 => ({ x: at.x + across.x * a + up.x * b, y: at.y + across.y * a + up.y * b })
  let outline = [corner(-w, -l), corner(w, -l), corner(w, l), corner(-w, l)]
  if (ringArea(outline) < 0) outline = outline.reverse()
  if (!outline.every((p) => underRoof(shape, p))) return { problem: said('issue.floor/rooflight-misplaced.outside') }
  const onPlane = outline.every((p) => planes.every((other) => planeAt(plane, p) <= planeAt(other, p) + tolerance('joint')))
  if (!onPlane) return { problem: said('issue.floor/rooflight-misplaced.acrossSlopes') }
  return { rooflight, plane, outline, across, up, planLength }
}

// ---------------------------------------------------------------------------------------------
// Dormers (LVL-20)

/** Where a dormer stands: on one sloped plane of the roof, running up it from its front. */
export interface DormerPlace {
  readonly dormer: Dormer
  /** The plane of the roof its front stands on. */
  readonly plane: RoofPlane
  /** Its rectangle on the plan, from its front up the slope, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Unit directions on the plan: along its front, and up the slope. */
  readonly across: Vec2
  readonly up: Vec2
  /** Metres on plan from its front to its back: as stated, else to where it meets the roof. */
  readonly depth: number
  /** Its underside: a box dormer's one level plane, a gable dormer's two slopes; the lowest of them. */
  readonly planes: readonly RoofPlane[]
  /** Its underside's highest point: a box dormer's ceiling, a gable dormer's ridge. */
  readonly top: number
}

/** Whether a point lies in a convex polygon, counter-clockwise, give or take `noLength`. */
function inConvex(polygon: readonly Vec2[], p: Vec2): boolean {
  const slack = tolerance('noLength')
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len = Math.hypot(ex, ey)
    if (len === 0) continue
    if ((ex * (p.y - a.y) - ey * (p.x - a.x)) / len < -slack) return false
  }
  return true
}

/**
 * A dormer's place on the roof, or why it has none: its front must stand inside the roof's
 * rectangle on one sloped plane, higher than the roof there, and the dormer must run back up that
 * plane without leaving it (across a ridge or a hip) or the rectangle.
 */
export function dormerPlace(shape: RoofShapeOverFloor, dormer: Dormer): DormerPlace | { readonly problem: Said } {
  const at = { x: dormer.at[0], y: dormer.at[1] }
  const bounding = boundingPlanes(shape)
  let plane = bounding[bounding.length - 1]!
  for (const candidate of bounding) if (planeAt(candidate, at) < planeAt(plane, at) - tolerance('joint')) plane = candidate
  const rise = Math.hypot(plane.gx, plane.gy)
  if (rise < tolerance('noSlope')) return { problem: said('issue.floor/dormer-misplaced.flat') }
  const up = { x: plane.gx / rise, y: plane.gy / rise }
  const across = { x: up.y, y: -up.x }
  const half = dormer.width / 2
  const corner = (c: number, s: number): Vec2 => ({ x: at.x + across.x * c + up.x * s, y: at.y + across.y * c + up.y * s })
  const onPlane = (p: Vec2): boolean => bounding.every((other) => planeAt(plane, p) <= planeAt(other, p) + tolerance('joint'))
  const front = [corner(-half, 0), corner(half, 0)]
  if (!front.every((p) => underRoof(shape, p))) return { problem: said('issue.floor/dormer-misplaced.outside') }
  if (!front.every(onPlane)) return { problem: said('issue.floor/dormer-misplaced.acrossSlopes') }
  const foot = planeAt(plane, at)
  if (!(dormer.height > foot + tolerance('joint'))) return { problem: said('issue.floor/dormer-misplaced.low') }
  const own = dormer.shape === 'gable' ? Math.tan(((dormer.pitch ?? shape.pitch) * Math.PI) / 180) : 0
  const top = dormer.height + own * half
  const depth = dormer.depth ?? (top - foot) / rise
  const back = [corner(half, depth), corner(-half, depth)]
  if (!back.every((p) => underRoof(shape, p))) return { problem: said('issue.floor/dormer-misplaced.outside') }
  // Its back may reach the ridge, never past it onto another slope.
  if (!back.every(onPlane)) return { problem: said('issue.floor/dormer-misplaced.acrossSlopes') }
  let outline = [front[0]!, front[1]!, back[0]!, back[1]!]
  if (ringArea(outline) < 0) outline = outline.reverse()
  const c0 = across.x * at.x + across.y * at.y
  const planes: RoofPlane[] =
    dormer.shape === 'box'
      ? [{ z0: dormer.height, gx: 0, gy: 0 }]
      : [
          // From each side, rising inward to the ridge over its middle.
          { z0: dormer.height + own * half - own * c0, gx: own * across.x, gy: own * across.y },
          { z0: dormer.height + own * half + own * c0, gx: -own * across.x, gy: -own * across.y }
        ]
  return { dormer, plane, outline, across, up, depth, planes, top }
}

/** A dormer's underside over a point, or null when the point is not under it. */
function dormerAt(place: DormerPlace, p: Vec2): { readonly z: number; readonly plane: RoofPlane } | null {
  if (!inConvex(place.outline, p)) return null
  let best = place.planes[0]!
  for (const plane of place.planes) if (planeAt(plane, p) < planeAt(best, p)) best = plane
  return { z: planeAt(best, p), plane: best }
}

/** The roof's underside over a point and the plane it lies in there, a dormer raising it where it stands. */
function undersideOf(shape: RoofShapeOverFloor, p: Vec2): { readonly z: number; readonly plane: RoofPlane } {
  const bounding = boundingPlanes(shape)
  let plane = bounding[bounding.length - 1]!
  for (const candidate of bounding) if (planeAt(candidate, p) < planeAt(plane, p)) plane = candidate
  let found = { z: planeAt(plane, p), plane }
  for (const place of shape.dormers) {
    const raised = dormerAt(place, p)
    if (raised !== null && raised.z > found.z) found = raised
  }
  return found
}

/** LVL-20: the roof's underside over a point, above the floor's level: `roofHeightAt` raised by the dormers. */
export function roofUnderside(shape: RoofShapeOverFloor, p: Vec2): number {
  return undersideOf(shape, p).z
}

/** A straight piece of the underside along a line: `from` to `to` metres along it, under one plane. */
export interface UndersidePiece {
  readonly from: number
  readonly to: number
  readonly plane: RoofPlane
}

/**
 * LVL-20: the roof's underside along the line from `a` to `b`, as straight pieces, each under one
 * plane (of the roof, its level top or a dormer), from 0 to the line's length. Where two pieces meet
 * at different heights a dormer's front or side rises from the slope.
 */
export function undersideAlong(shape: RoofShapeOverFloor, a: Vec2, b: Vec2): UndersidePiece[] {
  const total = Math.hypot(b.x - a.x, b.y - a.y)
  if (!(total > tolerance('noLength'))) return []
  const dir = { x: (b.x - a.x) / total, y: (b.y - a.y) / total }
  const planes = [...boundingPlanes(shape), ...shape.dormers.flatMap((d) => d.planes)]
  const lines = planes.map((plane) => ({ a: planeAt(plane, a), b: plane.gx * dir.x + plane.gy * dir.y }))
  const breaks = [0, total]
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const db = lines[i]!.b - lines[j]!.b
      if (Math.abs(db) < tolerance('noSlope')) continue
      breaks.push((lines[j]!.a - lines[i]!.a) / db)
    }
  }
  // Where the line crosses a dormer's sides.
  for (const place of shape.dormers) {
    place.outline.forEach((p, i) => {
      const q = place.outline[(i + 1) % place.outline.length]!
      const ex = q.x - p.x
      const ey = q.y - p.y
      const denominator = dir.x * ey - dir.y * ex
      if (Math.abs(denominator) < tolerance('noSlope')) return
      const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / denominator
      const s = ((p.x - a.x) * dir.y - (p.y - a.y) * dir.x) / denominator
      if (s >= -tolerance('noLength') && s <= 1 + tolerance('noLength')) breaks.push(t)
    })
  }
  const places = [...new Set(breaks.filter((t) => t >= 0 && t <= total))].sort((x, y) => x - y)
  const pieces: UndersidePiece[] = []
  for (let i = 0; i + 1 < places.length; i++) {
    const from = places[i]!
    const to = places[i + 1]!
    if (!(to - from > tolerance('noLength'))) continue
    const middle = (from + to) / 2
    const { plane } = undersideOf(shape, { x: a.x + dir.x * middle, y: a.y + dir.y * middle })
    const last = pieces[pieces.length - 1]
    if (last !== undefined && last.plane.z0 === plane.z0 && last.plane.gx === plane.gx && last.plane.gy === plane.gy) pieces[pieces.length - 1] = { ...last, to }
    else pieces.push({ from, to, plane })
  }
  return pieces
}

/**
 * LVL-20: the parts of the plan with at least `height` under the roof: `regionAtLeast`, and the
 * floor under each dormer with that much over it. Convex pieces, possibly overlapping; none when
 * there is no such part.
 */
export function regionsAtLeast(shape: RoofShapeOverFloor, height: number): Vec2[][] {
  const pieces: Vec2[][] = []
  const main = regionAtLeast(shape, height)
  if (main.length >= 3) pieces.push(main)
  for (const place of shape.dormers) {
    let polygon: Vec2[] = [...place.outline]
    for (const plane of place.planes) {
      if (polygon.length < 3) break
      polygon = clipConvex(polygon, (p) => planeAt(plane, p) - height)
    }
    if (polygon.length >= 3 && ringArea(polygon) > tolerance('noArea')) pieces.push(polygon)
  }
  return pieces
}

// ---------------------------------------------------------------------------------------------
// Headroom

/** The floor of a room with at least `height` over it. */
export interface HeadroomBand {
  readonly height: number
  readonly area: number
}

export interface RoomHeadroom {
  readonly room: string
  readonly floor: string
  /** The room's floor area (net, as `roomArea` measures it). */
  readonly area: number
  /** At least `headroomLow`, then at least `headroomFull`. */
  readonly bands: readonly HeadroomBand[]
  /** The lowest and highest height over its floor. */
  readonly lowest: number
  readonly highest: number
  /** Whether a stated roof bounds its ceiling. */
  readonly underRoof: boolean
}

/** The headroom bands Grid reports: its own two figures, in metres. */
export const headroomBands = (): readonly number[] => [limit('headroomLow'), limit('headroomFull')]

/**
 * A room's floor by headroom band (LVL-6): how much of it has at least `headroomLow`, and at least
 * `headroomFull`, of height over it, measured from the room's floor to its ceiling. The ceiling is
 * the room's own height when it states one, else its storey's clear height, under the floor's roof
 * where it states one (then the roof's top, not the storey's, is the most it can be), and under each
 * lowered zone (LVL-4). Null when the room is not in the plan or cannot be drawn.
 */
export function roomHeadroom(plan: FloorPlan, which: string | Room, index?: PlanIndex): RoomHeadroom | null {
  const room = typeof which === 'string' ? plan.rooms.find((r) => r.id === which) : which
  if (room === undefined) return null
  const floor = floorOf(room)
  const own = index ?? indexPlan(planForFloor(plan, floor))
  const shape = tryRoomShape(room, own)
  if (shape === null || shape.polygon.length < 3) return null
  const pieces: MultiPolygon = [[ringOf(shape.polygon), ...shape.holes.map(ringOf)]]
  const roof = floorRoofShape(plan, floor)
  const offset = roomFloorOffset(room)
  const stated = room.height !== undefined && Number.isFinite(room.height) && room.height > 0 ? room.height : null
  const storey = floorElevations(plan).floors.get(floor)?.clearHeight ?? DEFAULT_STOREY_HEIGHT
  const cap = stated ?? (roof !== null ? roof.top : storey) - offset
  const zones = loweredZones(room, pieces)
  const area = multiArea(pieces)

  const bands = headroomBands().map((height): HeadroomBand => {
    if (cap < height - tolerance('lengthEqual')) return { height, area: 0 }
    let region: MultiPolygon | null = pieces
    if (roof !== null) {
      // LVL-20: the floor under a dormer counts where the dormer gives it the height.
      const enough = regionsAtLeast(roof, height + offset)
      region = enough.length === 0 ? [] : cutOutline('intersection', pieces, [union(enough.map((piece): MultiPolygon => [[ringOf(piece)]]))])
    }
    const low = zones.filter((z) => z.height < height - tolerance('lengthEqual')).map((z) => z.pieces)
    if (region !== null && region.length > 0 && low.length > 0) region = cutOutline('difference', region, low)
    return { height, area: region === null ? 0 : multiArea(region) }
  })

  // The ceiling over each corner of the room's floor cut into the roof's planes: a plane's lowest
  // and highest points over a piece of floor are at its corners.
  const heights: number[] = []
  const facets = roof === null ? [] : roofFacets(roof)
  if (facets.length === 0) heights.push(cap)
  // LVL-20: a dormer's floor, its corners and the ends of its ridge, under its own underside.
  const dormerPieces = (roof?.dormers ?? []).flatMap((place) => {
    const ends = [0, place.depth].map((s): [number, number] => {
      const front = { x: place.dormer.at[0] + place.up.x * s, y: place.dormer.at[1] + place.up.y * s }
      return [front.x, front.y]
    })
    const under = cutOutline('intersection', pieces, [[[ringOf(place.outline)]]]) ?? []
    return [...under, ...ends.filter(([x, y]) => inPieces(pieces, { x, y })).map((end): [number, number][][] => [[end]])]
  })
  for (const facet of facets) {
    const under = cutOutline('intersection', pieces, [[[ringOf(facet.polygon)]]]) ?? []
    for (const polygon of under) for (const ring of polygon) for (const [x, y] of ring) heights.push(Math.min(cap, roofUnderside(roof!, { x, y }) - offset))
  }
  for (const polygon of dormerPieces) for (const ring of polygon) for (const [x, y] of ring) heights.push(Math.min(cap, roofUnderside(roof!, { x, y }) - offset))
  const lowest = Math.min(...heights, ...zones.map((z) => z.height))
  const highest = Math.max(...heights)
  return { room: room.id, floor, area, bands, lowest, highest, underRoof: roof !== null }
}

function loweredZones(room: Room, pieces: MultiPolygon): { height: number; pieces: MultiPolygon }[] {
  return (room.ceiling?.lowered ?? []).flatMap((zone) => {
    const cut = cutOutline('intersection', pieces, [[[ringOf(zone.points.map(([x, y]) => ({ x, y })))]]])
    return cut === null || cut.length === 0 ? [] : [{ height: zone.height, pieces: cut }]
  })
}
