/**
 * Spaces from walls.
 *
 * A room in the plan file is a list of walls, and `room.ts` traces its outline along them.
 * Nothing there asks whether the walls really enclose that outline. A room left out of the file
 * simply makes the total smaller, and a wall list that skips a wall measures floor that is not
 * one room. This module works out, once per floor and without looking at any room, the spaces the
 * walls enclose, and then sets the rooms against them.
 *
 *  1. Every solid wall is a strip: its centre line widened by half its thickness on each side,
 *     with square ends, as the 2D view draws it. No corner is filled, as in the room outline
 *     (lab entry V-10 is still open). Each strip is lengthened by a millimetre at both ends, so
 *     that walls drawn to meet do meet, whatever the rounding.
 *  2. Every dividing line (a virtual wall) is a hairline strip, also lengthened by a
 *     millimetre. It bounds spaces and takes no floor worth counting.
 *  3. The strips are joined. What their outer edges enclose is the floor's outline. The outline
 *     less the solid walls is the enclosed floor. The outline less the walls and the lines falls
 *     apart into the spaces.
 *  4. Each room's outline is set against them. Enclosed floor that no room covers is unclaimed.
 *     A room that covers wall, or ground outside the walls, or parts of two spaces, does not
 *     match the space its walls enclose. A zone (CNT-8, `zones.ts`) is part of its room: it is
 *     set against no space, and a dividing line only zones list is left out of step 2.
 *
 * The joining is done by `polygon-clipping` (MIT). Everything else here is Grid's own. After the
 * one join, every comparison is local: a room is cut only against the spaces and walls whose
 * boxes it overlaps, so a plan of thousands of rooms costs thousands of small cuts, not one
 * large cut per room.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import { floorOf, planFloors, wallsOnFloor } from './floors'
import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan, roomWallIds } from './plan'
import { straightPieces } from './wall'
import { curveFault } from './arc'
import type { Said } from '../messages/say'
import { english, name, said } from '../messages/say'
import { roomNesting, tryRoomPolygon } from './room'
import { roomZones } from './zones'
import { statedOutline } from './massing'
import type { Vec2 } from './vec2'
import { signedArea } from './vec2'
import { TOLERANCES, tolerance, tolerancesAsStated } from './tolerances'
import type { Box } from './polygons'
import {
  boxOfRings,
  cornerFills,
  intersectionArea,
  multiArea,
  overlaps,
  pointInside,
  polygonArea,
  strip,
  union
} from './polygons'

// The figures come from the tolerance table (`tolerances.ts`), read when the spaces are worked
// out so that a survey's changes reach them.
/** How far each wall strip and line is lengthened at both ends (`gap`), in metres. */
const JOIN = (): number => tolerance('gap')
/** Half the width a dividing line is given near the origin (`lineHalfWidth`), in metres. */
const LINE_HALF_WIDTH = TOLERANCES.lineHalfWidth.value
/** How close a wall must come to a piece of floor to be named as one of its walls (`touch`). */
const TOUCH = (): number => tolerance('touch')
/** How long that contact must be (`touchLength`). */
const TOUCH_LENGTH = (): number => tolerance('touchLength')
/**
 * Half the width of a slit that does not join two spaces (`slit`). Two rooms are only said to
 * lie in one space when they still do with every wall and line widened by this much: a line
 * drawn on the face of a wall, a fraction of a millimetre off after the plan was turned, leaves
 * a slit between them that is not a way from one space to the other.
 */
const SLIT = (): number => tolerance('slit')
/** Shortest stretch of a dividing line inside a room that is named (`lineInside`). */
const LINE_INSIDE = (): number => tolerance('lineInside')
/** Below this a difference in area is not reported (`areaReported`), in square metres. */
const REPORTED = (): number => tolerance('areaReported')
/** Wall area under a room below this is not named wall by wall (`wallShare`). */
const WALL_SHARE = (): number => tolerance('wallShare')
/**
 * Coordinates and thicknesses past `largest` are not a building, and validation refuses them.
 * Joining strips that large loses the precision the comparison needs, so such a floor's spaces
 * are not worked out either.
 */
const FAR = (): number => tolerance('largest')
/**
 * The polygon library can fail to close a ring when two edges almost, but not quite, coincide
 * (rounding noise such as 2.8999999999999995 beside 2.9). The join is tried as drawn first, then
 * with every point rounded to these grids, in metres, coarsest last (`joinGrids`).
 */
const GRIDS = TOLERANCES.joinGrids.values

/** A piece of floor: one connected area, with any islands of wall cut out of it. */
export interface FloorPiece {
  /** The outer ring first, then one ring per island. */
  readonly rings: readonly (readonly Vec2[])[]
  /** In square metres, islands taken out. */
  readonly area: number
  /** A point inside the piece, away from its edges, to say where it is. */
  readonly at: Vec2
  /** Corners of the box around it. */
  readonly min: Vec2
  readonly max: Vec2
  /** The walls and dividing lines along its edge, in plan order. */
  readonly walls: readonly string[]
}

/** One space the walls enclose, and the rooms that cover part of it. */
export interface Space extends FloorPiece {
  readonly rooms: readonly { readonly room: string; readonly area: number }[]
}

/** A room whose outline is not the space its walls enclose. */
export interface RoomMismatch {
  readonly room: string
  /** The room's area as Grid measures it (`roomArea`): its outline, less any room inside it. */
  readonly area: number
  /** How much of that is enclosed floor. */
  readonly enclosed: number
  /** Walls the outline runs over, and how much of each. `listed` when the room names the wall. */
  readonly onWalls: readonly { readonly wall: string; readonly area: number; readonly listed: boolean }[]
  /** How much of the outline lies outside the walls altogether. */
  readonly outside: number
  /** The spaces it covers part of, by area, largest first. More than one means it runs across a wall or a line. */
  readonly spaces: readonly number[]
  /** Dividing lines that run through the room and are not in its wall list. */
  readonly lines: readonly string[]
  /**
   * Other rooms that lie beside this one in the same space, with no wall or dividing line
   * between them, and without overlapping it. Rooms that overlap are not listed here.
   */
  readonly sharedWith: readonly string[]
}

export interface FloorSpaces {
  readonly floor: string
  /** Inside the outer edge of the walls, in square metres. */
  readonly outlineArea: number
  /**
   * That outer edge, piece by piece: each piece's rings as points, the outer ring first, with no
   * point repeated at the end (ARE-13 measures the outside face and the roof from it).
   */
  readonly outline: readonly (readonly (readonly Vec2[])[])[]
  /**
   * Taken by the solid walls and the corners made good between them, less any such corner a
   * room's outline takes in (see `cornerFills`), so that the four figures add up.
   */
  readonly wallArea: number
  /** The outline less the walls: the floor the walls enclose. */
  readonly floorArea: number
  /** The sum of the areas of the rooms on this floor that can be drawn. */
  readonly roomArea: number
  /** Enclosed floor that no room covers, every piece counted. */
  readonly unclaimedArea: number
  readonly spaces: readonly Space[]
  /** The pieces of unclaimed floor of at least `areaReported`, largest first. */
  readonly unclaimed: readonly FloorPiece[]
  readonly mismatches: readonly RoomMismatch[]
  /**
   * BRF-4 (C17): how much of what the walls enclose lies outside the outline the floor states,
   * m²; null when it states none. The outline and the walls are joined either way.
   */
  readonly pastOutline: number | null
}

/** Why a floor's spaces were not worked out. */
export interface FloorSpacesUnknown {
  readonly floor: string
  /** The reason in English, made from `reasonSaid`. */
  readonly reason: string
  /** MSG-11: the reason by its key and values (`issue.part.far.*`). */
  readonly reasonSaid: Said
}

const unknown = (floor: string, reasonSaid: Said): FloorSpacesUnknown => ({ floor, reason: english(reasonSaid), reasonSaid })

/** A wall as a strip, and the rectangle around it that counts as being along it. */
interface WallShape {
  readonly wall: Wall
  readonly body: Polygon
  readonly box: Box
  readonly start: Vec2
  readonly dir: Vec2
  readonly length: number
  /** Half the width of the rectangle "along the wall": half the strip, plus `TOUCH`. */
  readonly reach: number
}

function shapeOf(wall: Wall, lineHalf: number, snap: (v: number) => number): WallShape {
  const start = { x: wall.start[0], y: wall.start[1] }
  const dx = wall.end[0] - start.x
  const dy = wall.end[1] - start.y
  const length = Math.hypot(dx, dy)
  const dir = { x: dx / length, y: dy / length }
  const half = wall.virtual ? lineHalf : wall.thickness / 2
  const body = strip(start, dir, length, half, JOIN(), snap)
  return { wall, body, box: boxOfRings(strip(start, dir, length, half + TOUCH(), JOIN() + TOUCH(), (v) => v)), start, dir, length, reach: half + TOUCH() }
}

/** How much of segment `a`–`b` runs inside the rectangle along `shape`, in metres. */
function contact(a: Pair, b: Pair, shape: WallShape): number {
  // Into the wall's own coordinates: `s` along it from its start, `t` across it.
  const local = ([x, y]: Pair): [number, number] => {
    const rx = x - shape.start.x
    const ry = y - shape.start.y
    return [rx * shape.dir.x + ry * shape.dir.y, -rx * shape.dir.y + ry * shape.dir.x]
  }
  const [s0, t0] = local(a)
  const [s1, t1] = local(b)
  // Liang–Barsky: the part of the segment inside s in [lo, hi] and t in [-reach, reach].
  const lo = -(JOIN() + TOUCH())
  const hi = shape.length + JOIN() + TOUCH()
  let u0 = 0
  let u1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < TOLERANCES.noSlope.value) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > u1) return false
      if (r > u0) u0 = r
    } else {
      if (r < u0) return false
      if (r < u1) u1 = r
    }
    return true
  }
  const ds = s1 - s0
  const dt = t1 - t0
  if (!clip(-ds, s0 - lo) || !clip(ds, hi - s0) || !clip(-dt, t0 + shape.reach) || !clip(dt, shape.reach - t0)) return 0
  return Math.max(0, u1 - u0) * Math.hypot(ds, dt)
}

function pieceOf(polygon: Polygon, shapes: readonly WallShape[]): FloorPiece {
  const box = boxOfRings(polygon)
  // How far the piece runs along each wall: a curved wall's pieces add up to it (CNT-18).
  const alongWall = new Map<string, number>()
  for (const shape of shapes) {
    if (!overlaps(box, shape.box)) continue
    let along = 0
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i++) along += contact(ring[i]!, ring[i + 1]!, shape)
    }
    alongWall.set(shape.wall.id, (alongWall.get(shape.wall.id) ?? 0) + along)
  }
  const walls = [...alongWall].filter(([, along]) => along >= TOUCH_LENGTH()).map(([id]) => id)
  return {
    rings: polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
    area: polygonArea(polygon),
    at: pointInside(polygon, box),
    min: { x: box.x0, y: box.y0 },
    max: { x: box.x1, y: box.y1 },
    walls
  }
}

/** Length of the stretch of segment `a`–`b` that lies inside `polygon`. */
function lengthInside(a: Vec2, b: Vec2, polygon: readonly Vec2[]): number {
  const d = { x: b.x - a.x, y: b.y - a.y }
  const ts = [0, 1]
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const e = { x: q.x - p.x, y: q.y - p.y }
    const denom = d.x * e.y - d.y * e.x
    if (Math.abs(denom) < TOLERANCES.noArea.value) continue
    const t = ((p.x - a.x) * e.y - (p.y - a.y) * e.x) / denom
    const u = ((p.x - a.x) * d.y - (p.y - a.y) * d.x) / denom
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  const inside = (pt: Vec2): boolean => {
    let odd = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i]!
      const pj = polygon[j]!
      if (pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x) odd = !odd
    }
    return odd
  }
  const len = Math.hypot(d.x, d.y)
  let total = 0
  for (let i = 0; i + 1 < ts.length; i++) {
    const mid = (ts[i]! + ts[i + 1]!) / 2
    if (inside({ x: a.x + d.x * mid, y: a.y + d.y * mid })) total += (ts[i + 1]! - ts[i]!) * len
  }
  return total
}

/** Why the spaces of this floor cannot be worked out, or null when they can. */
export function farReason(walls: readonly Wall[]): string | null {
  const far = farSaid(walls)
  return far === null ? null : english(far)
}

/** `farReason` by its key and values (MSG-11). */
export function farSaid(walls: readonly Wall[]): Said | null {
  for (const wall of walls) {
    if ([...wall.start, ...wall.end].some((v) => !Number.isFinite(v) || Math.abs(v) > FAR())) {
      return said('issue.part.far.wall', { wall: name(wall.id), km: FAR() / 1000 })
    }
    if (!wall.virtual && (!Number.isFinite(wall.thickness) || wall.thickness > FAR())) {
      return said('issue.part.far.thick', { wall: name(wall.id), km: FAR() / 1000 })
    }
  }
  return null
}

export interface SpacesOptions {
  readonly index?: PlanIndex
  /** Ids the drawing's checks mark as broken (`validatePlan`). Those walls and rooms are left out. */
  readonly broken?: ReadonlySet<string>
}

interface DrawnRoom {
  readonly room: Room
  readonly outline: readonly Vec2[]
  /**
   * A room with rooms marked `inside` in it: its outline less theirs (`nesting.ts`). It is set
   * against the spaces by that floor, not by its outline.
   */
  readonly region?: MultiPolygon
  /** As Grid measures it (`roomArea`): the outline's area, less any room inside it. */
  readonly area: number
}

/** The walls joined, with every point rounded to `grid` metres (0: as drawn): steps 1 to 3 above. */
function joinWalls(walls: readonly Wall[], grid: number, reach: number, outline: Polygon | null = null) {
  const steps = grid === 0 ? 0 : Math.round(1 / grid)
  const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
  const lineHalf = Math.max(LINE_HALF_WIDTH, 5 * grid, reach * TOLERANCES.farNoise.value)
  const shapes = walls.map((wall) => shapeOf(wall, lineHalf, snap))
  const solidShapes = shapes.filter((s) => !s.wall.virtual)
  const lineShapes = shapes.filter((s) => s.wall.virtual)

  const fills = cornerFills(solidShapes, lineHalf, snap).map((polygon) => ({ polygon, box: boxOfRings(polygon) }))
  const solid = union([...solidShapes.map((s) => s.body), ...fills.map((f) => f.polygon)])
  const frame = lineShapes.length === 0 ? solid : union([...solid, ...lineShapes.map((s) => s.body)])
  const walled = union(frame.map((polygon) => [polygon[0]!]))
  // BRF-4 (C17): the floor's stated outline joins what the walls enclose; floor inside it that no
  // wall encloses is floor too, and what the walls reach past it is measured apart.
  const stated = outline === null ? null : [outline[0]!.map(([x, y]): Pair => [snap(x), snap(y)])]
  const filled = stated === null ? walled : union([...walled, stated])
  return { snap, shapes, solidShapes, lineShapes, fills, solid, frame, filled, walled, stated }
}

/** How far the walls' own outline reaches past a stated outline, m²; null with no outline stated. */
function pastOutline(walled: MultiPolygon, stated: Polygon | null): number | null {
  if (stated === null) return null
  return walled.length === 0 ? 0 : multiArea(polygonClipping.difference(walled, stated))
}

/** The whole comparison, with every point rounded to `grid` metres (0: as drawn). */
function compare(floor: string, walls: readonly Wall[], rooms: readonly DrawnRoom[], grid: number, reach: number, outline: Polygon | null = null): FloorSpaces {
  const { snap, shapes, solidShapes, lineShapes, fills, solid, frame, filled, walled, stated } = joinWalls(walls, grid, reach, outline)
  const faces = filled.length === 0 ? [] : frame.length === 0 ? filled : polygonClipping.difference(filled, frame)
  const outlineArea = multiArea(filled)

  const drawn = rooms.map((r) => {
    const polygon: MultiPolygon = r.region
      ? r.region.map((piece) => piece.map((ring) => ring.map(([x, y]): Pair => [snap(x), snap(y)])))
      : [[r.outline.map((p): Pair => [snap(p.x), snap(p.y)])]]
    return { ...r, polygon, box: boxOfRings(polygon.flat()) }
  })
  const faceBoxes = faces.map(boxOfRings)

  // Which room covers how much of which space: every pair whose boxes overlap, cut once.
  const shares = faces.map(() => [] as { room: number; area: number }[])
  const enclosedOf = drawn.map(() => 0)
  const covered = drawn.map(() => [] as number[])
  drawn.forEach((r, ri) => {
    faces.forEach((face, fi) => {
      if (!overlaps(r.box, faceBoxes[fi]!)) return
      const area = intersectionArea(face, r.polygon)
      if (area <= 0) return
      shares[fi]!.push({ room: ri, area })
      enclosedOf[ri] += area
      if (area >= REPORTED()) covered[ri]!.push(area)
    })
  })

  const spaces: Space[] = faces.map((face, fi) => ({
    ...pieceOf(face, shapes),
    rooms: shares[fi]!
      .filter((s) => s.area >= REPORTED())
      .map((s) => ({ room: drawn[s.room]!.room.id, area: s.area }))
  }))

  // What no room covers, space by space. And rooms that lie side by side in one space: the
  // space holds two rooms, but nothing in the plan divides it. Where they overlap instead, the
  // overlap is the fault, and it is not reported here.
  let unclaimedArea = 0
  const unclaimed: FloorPiece[] = []
  const sharedWith = drawn.map(() => new Set<string>())
  const candidates: number[][] = []
  faces.forEach((face, fi) => {
    const over = shares[fi]!
    const rest = over.length === 0 ? [face] : polygonClipping.difference(face, ...over.map((s) => drawn[s.room]!.polygon))
    let left = 0
    for (const piece of rest) {
      const area = polygonArea(piece)
      left += area
      if (area >= REPORTED()) unclaimed.push(over.length === 0 ? spaces[fi]! : pieceOf(piece, shapes))
    }
    unclaimedArea += left
    const sharing = over.filter((s) => s.area >= REPORTED())
    const overlap = over.reduce((sum, s) => sum + s.area, 0) - (polygonArea(face) - left)
    if (sharing.length > 1 && overlap < REPORTED()) candidates.push(sharing.map((s) => s.room))
  })
  unclaimed.sort((a, b) => b.area - a.area)
  if (candidates.length > 0) {
    // The same spaces with every wall and line widened by `SLIT`: rooms that still share one of
    // them lie side by side in one space.
    const wide = union([
      ...shapes.map((s) => strip(s.start, s.dir, s.length, (s.wall.virtual ? 0 : s.wall.thickness / 2) + SLIT(), JOIN() + SLIT(), snap)),
      ...fills.map((f) => f.polygon)
    ])
    const wideFaces = polygonClipping.difference(filled, wide)
    const wideBoxes = wideFaces.map(boxOfRings)
    const homes = new Map<number, Set<number>>()
    const homeOf = (ri: number): Set<number> => {
      let found = homes.get(ri)
      if (!found) {
        found = new Set()
        const r = drawn[ri]!
        wideFaces.forEach((face, wi) => {
          if (overlaps(r.box, wideBoxes[wi]!) && intersectionArea(face, r.polygon) >= REPORTED()) found!.add(wi)
        })
        homes.set(ri, found)
      }
      return found
    }
    for (const group of candidates) {
      for (const a of group) {
        for (const b of group) {
          if (a !== b && [...homeOf(a)].some((wi) => homeOf(b).has(wi))) sharedWith[a]!.add(drawn[b]!.room.id)
        }
      }
    }
  }

  const mismatches: RoomMismatch[] = []
  let roomOnFills = 0
  drawn.forEach((r, ri) => {
    const spans = covered[ri]!.sort((a, b) => b - a)
    let off = r.area - enclosedOf[ri]!
    // A corner made good that the room's outline takes in counts as the room's (see
    // `cornerFills`): it is neither a mismatch nor wall.
    const nearFills = off > TOLERANCES.noLength.value ? fills.filter((f) => overlaps(r.box, f.box)).map((f) => f.polygon) : []
    if (nearFills.length > 0) {
      const onFills = multiArea(polygonClipping.intersection(r.polygon, union(nearFills)))
      roomOnFills += onFills
      off = Math.max(0, off - onFills)
    }
    const beside = [...sharedWith[ri]!]
    if (off < REPORTED() && spans.length <= 1 && beside.length === 0) return
    const near = solidShapes.filter((s) => overlaps(r.box, s.box))
    const onWalls: { wall: string; area: number; listed: boolean }[] = []
    let outside = off
    if (off >= REPORTED() && near.length > 0) {
      const listed = new Set(roomWallIds(r.room))
      for (const shape of near) {
        const area = intersectionArea(r.polygon, shape.body)
        if (area < WALL_SHARE()) continue
        // The pieces of a curved wall are one wall (CNT-18).
        const same = onWalls.find((on) => on.wall === shape.wall.id)
        if (same) same.area += area
        else onWalls.push({ wall: shape.wall.id, area, listed: listed.has(shape.wall.id) })
      }
      const body = union([...near.map((s) => s.body), ...nearFills])
      outside = Math.max(0, r.area - enclosedOf[ri]! - multiArea(polygonClipping.intersection(r.polygon, body)))
    }
    const lines =
      spans.length > 1
        ? lineShapes
            .filter((s) => !roomWallIds(r.room).includes(s.wall.id) && overlaps(r.box, s.box))
            .filter((s) => {
              const end = { x: s.start.x + s.dir.x * s.length, y: s.start.y + s.dir.y * s.length }
              return lengthInside(s.start, end, r.outline) >= LINE_INSIDE()
            })
            .map((s) => s.wall.id)
            .filter((id, i, all) => all.indexOf(id) === i)
        : []
    mismatches.push({ room: r.room.id, area: r.area, enclosed: enclosedOf[ri]!, onWalls, outside, spaces: spans, lines, sharedWith: beside })
  })

  const wallArea = multiArea(solid) - roomOnFills
  return {
    floor,
    outlineArea,
    outline: filled.map((polygon) => polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y })))),
    wallArea,
    floorArea: outlineArea - wallArea,
    roomArea: rooms.reduce((sum, r) => sum + r.area, 0),
    unclaimedArea,
    spaces,
    unclaimed,
    mismatches,
    pastOutline: pastOutline(walled, stated)
  }
}

/** The walls of one floor that the spaces are worked out from, in plan order. */
function floorWalls(plan: FloorPlan, floor: string, broken: ReadonlySet<string>): Wall[] {
  // LVL-5: a wall through floors is one of each floor's it stands on.
  return wallsOnFloor(plan, floor)
    .filter(
      (wall) =>
        !broken.has(wall.id) &&
        (wall.arc !== undefined ? curveFault(wall) === null : wall.start[0] !== wall.end[0] || wall.start[1] !== wall.end[1]) &&
        (wall.virtual === true || wall.thickness > 0)
    )
    // A curved wall is joined as its straight pieces, each a strip under its id (CNT-18).
    .flatMap(straightPieces)
}

const reachOf = (walls: readonly Wall[], outline: Polygon | null = null): number => {
  let reach = 0
  for (const wall of walls) reach = Math.max(reach, ...wall.start.map(Math.abs), ...wall.end.map(Math.abs))
  for (const [x, y] of outline?.[0] ?? []) reach = Math.max(reach, Math.abs(x), Math.abs(y))
  return reach
}

/** BRF-4: why a stated outline is too far out to join, or null. */
export function outlineFarReason(floor: string, outline: Polygon | null): string | null {
  const far = outlineFarSaid(floor, outline)
  return far === null ? null : english(far)
}

/** `outlineFarReason` by its key and values (MSG-11). */
export function outlineFarSaid(floor: string, outline: Polygon | null): Said | null {
  if (outline === null) return null
  return outline[0]!.some(([x, y]) => Math.abs(x) > FAR() || Math.abs(y) > FAR()) ? said('issue.part.far.outline', { floor: name(floor), km: FAR() / 1000 }) : null
}

/**
 * SHT-11: the outline of one floor, as step 3 above joins it: what the outer edges of its walls
 * and dividing lines enclose, the outline whose area is the gross external area (ARE-9). One ring
 * per separate part, counter-clockwise or not as the join gives it, with no point repeated. Empty
 * with no walls; null when the walls cannot be joined (see `floorSpaces`).
 */
export function floorOutline(plan: FloorPlan, floor: string, options: SpacesOptions = {}): Vec2[][] | null {
  const walls = floorWalls(plan, floor, options.broken ?? new Set<string>())
  const outline = statedOutline(plan, floor)
  if (walls.length === 0 && outline === null) return []
  if (farReason(walls) || outlineFarReason(floor, outline)) return null
  const reach = reachOf(walls, outline)
  for (const grid of GRIDS) {
    try {
      return joinWalls(walls, grid, reach, outline).filled.map((polygon) => polygon[0]!.slice(0, -1).map(([x, y]) => ({ x, y })))
    } catch {
      // Tried again on a coarser grid.
    }
  }
  return null
}

/**
 * The spaces the walls of one floor enclose, set against the rooms of that floor.
 *
 * Returns `FloorSpacesUnknown` when the floor's walls are too far out or too thick to join (see
 * `FAR`), or when the polygon library fails on every grid it is tried on. Never throws.
 */
export function floorSpaces(plan: FloorPlan, floor: string, options: SpacesOptions = {}): FloorSpaces | FloorSpacesUnknown {
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? new Set<string>()
  // CNT-8: a zone is set against no space, and a line that only zones list divides none.
  const zones = roomZones(index)
  const walls = floorWalls(plan, floor, broken).filter((wall) => !zones.lines.has(wall.id))
  const outline = statedOutline(plan, floor)
  const far = farSaid(walls) ?? outlineFarSaid(floor, outline)
  if (far) return unknown(floor, far)

  const nesting = roomNesting(index)
  const rooms: DrawnRoom[] = []
  for (const room of plan.rooms) {
    if (floorOf(room) !== floor || broken.has(room.id) || zones.zoneOf.has(room.id)) continue
    const outline = tryRoomPolygon(room, index)
    if (!outline || outline.length < 3) continue
    if (outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > FAR() || Math.abs(p.y) > FAR())) {
      return unknown(floor, said('issue.part.far.room', { room: name(room.id), km: FAR() / 1000 }))
    }
    const host = nesting.hosts.get(room.id)
    rooms.push(host ? { room, outline, region: host.region, area: host.area } : { room, outline, area: Math.abs(signedArea(outline)) })
  }

  return keptSpaces(floor, walls, rooms, outline, () => {
    const reach = reachOf(walls, outline)
    for (const grid of GRIDS) {
      try {
        return compare(floor, walls, rooms, grid, reach, outline)
      } catch {
        // The polygon library could not join the walls on this grid: the next, coarser one is tried.
      }
    }
    // CNT-22: in Grid's own words; the polygon library's message is never passed on.
    return unknown(floor, said('issue.part.notJoined'))
  })
}

/** What one floor's comparison was worked out from, and what it came to (CNT-25). */
interface KeptComparison {
  readonly floor: string
  readonly walls: readonly Wall[]
  readonly rooms: readonly DrawnRoom[]
  readonly outline: Polygon | null
  readonly result: FloorSpaces | FloorSpacesUnknown
}

/**
 * CNT-25: the comparisons worked out, by the floor's first wall, a few each. Every check that
 * reads the spaces works them out afresh (the whole plan's validation, each floor's drawing, the
 * areas, the sides of each wall), and a curved wall joins as hundreds of strips; while the walls
 * are the very same objects (a curved wall's pieces are kept, `straightPieces`) and the rooms the
 * same rooms with the same outlines, the comparison is the same. A plan is never changed in
 * place once read. Nothing is kept while `withTolerances` is in force.
 */
const comparisons = new WeakMap<Wall, KeptComparison[]>()
const KEPT_PER_WALL = 4

function keptSpaces(
  floor: string,
  walls: readonly Wall[],
  rooms: readonly DrawnRoom[],
  outline: Polygon | null,
  work: () => FloorSpaces | FloorSpacesUnknown
): FloorSpaces | FloorSpacesUnknown {
  const first = walls[0]
  if (first === undefined || !tolerancesAsStated()) return work()
  const list = comparisons.get(first) ?? []
  const found = list.find(
    (kept) =>
      kept.floor === floor &&
      kept.walls.length === walls.length &&
      kept.walls.every((wall, i) => wall === walls[i]) &&
      sameRooms(kept.rooms, rooms) &&
      sameNumbers(kept.outline, outline)
  )
  if (found !== undefined) return copySpaces(found.result)
  const result = work()
  comparisons.set(first, [{ floor, walls, rooms, outline, result }, ...list].slice(0, KEPT_PER_WALL))
  return copySpaces(result)
}

function sameRooms(a: readonly DrawnRoom[], b: readonly DrawnRoom[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => {
      const s = b[i]!
      return (
        r.room === s.room &&
        r.area === s.area &&
        r.outline.length === s.outline.length &&
        r.outline.every((p, k) => p.x === s.outline[k]!.x && p.y === s.outline[k]!.y) &&
        sameNumbers(r.region ?? null, s.region ?? null)
      )
    })
  )
}

/** Two nested lists of numbers (rings, polygons) that hold the same numbers in the same places. */
function sameNumbers(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((x, i) => sameNumbers(x, b[i]))
}

/** A kept comparison as its own record, so a caller that changes its lists changes nothing kept. */
function copySpaces(result: FloorSpaces | FloorSpacesUnknown): FloorSpaces | FloorSpacesUnknown {
  if (!spacesKnown(result)) return { ...result }
  return {
    ...result,
    outline: [...result.outline],
    spaces: [...result.spaces],
    unclaimed: [...result.unclaimed],
    mismatches: [...result.mismatches]
  }
}

/** `floorSpaces` for every floor of the plan, in floor order. */
export function planSpaces(plan: FloorPlan, options: SpacesOptions = {}): (FloorSpaces | FloorSpacesUnknown)[] {
  const index = options.index ?? indexPlan(plan)
  return planFloors(plan).map((floor) => floorSpaces(plan, floor.id, { ...options, index }))
}

export function spacesKnown(result: FloorSpaces | FloorSpacesUnknown): result is FloorSpaces {
  return !('reason' in result)
}
