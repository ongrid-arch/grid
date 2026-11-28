/**
 * ARE-79: the measures of the work, the new parts against the building before it, for a plan
 * whose parts carry phases (C16). They are geometry and apply no rule: whether a figure needs
 * permission, or meets a limit, is not said here or anywhere it is worded.
 *
 * - The building before and after the work is `planInState`; each footprint is `siteMeasures`'
 *   (BRF-3): the outside face of every floor at or above the ground floor, open outdoor space out.
 * - `depths`: how far the footprint after the work reaches past the one before on each side, read
 *   along the two axes of the old footprint's longest face, each way, and how wide the added piece
 *   is across that way. The plan does not say which side is the rear, so each side is given by the
 *   way it faces, by the plan's north, or the top of the drawing when it states none.
 * - `heights`: above the ground under each floor (`groundLevel`), the lowest and the highest top of
 *   the new walls (as the roof cuts them, `wallTopProfile`), the walls that face outside when any
 *   new wall is stated so, and the highest point of the ceiling or the roof's underside over the
 *   new rooms (`roomHeadroom`). The roof's own build-up, a parapet and the eaves' overhang are not
 *   drawn, so they are not in it.
 * - `volume`: each new room's floor, its whole outline with nothing standing in it taken off,
 *   times the height over it: its own height, else its storey's, under the floor's roof planes
 *   where the floor states a roof (`volumeUnder`).
 * - `plot`: the boundary's area less the footprint, before and after the work.
 * - `boundary`: the least distance from the added footprint (after less before) to each edge of
 *   the boundary, beside the whole building's before and after.
 *
 * The footprints are compared on a grid of `diffLength`, and a depth or a change under it is
 * none, as between two versions. Pure: a plan in, plain
 * data out, never a changed plan.
 */
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon } from 'polygon-clipping'
import type { FloorPlan, Room, Wall } from './plan'
import { indexPlan } from './plan'
import { idsInPhase, planHasPhases, planInState } from './phases'
import { siteMeasures, type SiteMeasures } from './site'
import { cutOutline, multiArea, ringOf } from './polygons'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import { floorElevations } from './elevations'
import { groundLevel } from './ground'
import { floorOf } from './floors'
import { boundingPlanes, floorRoofShape, roomHeadroom, volumeUnder, wallTopProfile } from './roofs'
import { tryRoomShape } from './room'
import { roomFloorOffset } from './steps'
import { isOutdoor } from './outdoor'
import { landscapeWalls } from './landscape'
import { tolerance } from './tolerances'
import { dot, length, perp, sub, type Vec2 } from './vec2'

/** How far the building reaches past its old outline on one side. */
export interface WorkDepth {
  /** The way, in plan coordinates: a unit vector out of the old building. */
  readonly direction: Vec2
  /** The way it faces, by the plan's north (the top of the drawing when it states none). */
  readonly faces: CompassPoint
  /** How far past the old outline's furthest point on that side, in metres. */
  readonly depth: number
  /** How wide the added piece is across that way, in metres. */
  readonly across: number
}

/** The heights of the new parts, above the ground under them, in metres. */
export interface WorkHeights {
  /** The lowest and the highest top of the new walls; null with no new wall. */
  readonly wallsLowest: number | null
  readonly wallsHighest: number | null
  /** The walls those are read from: the new walls stated to face outside, else every new wall. */
  readonly walls: readonly string[]
  /** The highest point of the ceiling or the roof's underside over the new rooms; null with no new room. */
  readonly highest: number | null
  /** Whether a roof the plan states is over any new room. */
  readonly underRoof: boolean
}

/** A new room's floor and the volume over it. */
export interface WorkRoomVolume {
  readonly room: string
  readonly name: string
  readonly floor: string
  readonly area: number
  readonly volume: number
  readonly underRoof: boolean
}

/** The plot left unbuilt, before and after the work. */
export interface WorkPlot {
  readonly area: number
  readonly before: number
  readonly after: number
}

/** The least distance to one edge of the boundary. */
export interface WorkEdge {
  readonly edge: number
  readonly name: string
  readonly faces: CompassPoint
  /** From the added footprint; null when nothing is added on the ground. */
  readonly added: number | null
  /** From the whole building before and after the work. */
  readonly before: number | null
  readonly after: number | null
}

export interface WorkMeasures {
  /** Whether the plan's parts carry phases; false gives nothing else. */
  readonly phased: boolean
  /** The new rooms and walls, by id: in the building after the work, not before. */
  readonly newRooms: readonly string[]
  readonly newWalls: readonly string[]
  /** Whether the plan states its north; when not, the ways are read with north at the top of the drawing. */
  readonly northStated: boolean
  /** The footprint's area before and after; null when it has none. */
  readonly footprint: { readonly before: number | null; readonly after: number | null; readonly added: number }
  readonly depths: readonly WorkDepth[]
  readonly heights: WorkHeights
  readonly rooms: readonly WorkRoomVolume[]
  /** The sum of `rooms`' volumes, in cubic metres. */
  readonly volume: number
  /** Null when the site states no sound boundary. */
  readonly plot: WorkPlot | null
  readonly edges: readonly WorkEdge[]
}

const NONE: WorkMeasures = {
  phased: false,
  newRooms: [],
  newWalls: [],
  northStated: false,
  footprint: { before: null, after: null, added: 0 },
  depths: [],
  heights: { wallsLowest: null, wallsHighest: null, walls: [], highest: null, underRoof: false },
  rooms: [],
  volume: 0,
  plot: null,
  edges: [],
}

type Ring = readonly (readonly [number, number])[]
const ringsOf = (pieces: MultiPolygon): Ring[] => pieces.flatMap((polygon) => polygon as Ring[])
const pointsOf = (pieces: MultiPolygon): Vec2[] => ringsOf(pieces).flatMap((ring) => ring.map(([x, y]) => ({ x, y })))

/**
 * A footprint on a grid of `diffLength`, joined again: the corner fills leave steps far smaller
 * than that, which the difference of two footprints would keep as slivers with no width.
 */
function snapped(pieces: MultiPolygon): MultiPolygon {
  if (pieces.length === 0) return pieces
  const step = tolerance('diffLength')
  const on = (v: number): number => Math.round(v / step) * step + 0
  return polygonClipping.union(pieces.map((polygon) => polygon.map((ring) => ring.map(([x, y]): [number, number] => [on(x), on(y)]))))
}

/** The measures of the work on a plan whose parts carry phases. */
export function workMeasures(plan: FloorPlan): WorkMeasures {
  if (!planHasPhases(plan)) return NONE
  const before = planInState(plan, 'before')
  const after = planInState(plan, 'after')
  const fresh = idsInPhase(plan, 'new')
  const newRooms = after.rooms.filter((r) => fresh.has(r.id) && !isOutdoor(r) && r.void !== true)
  const newWalls = after.walls.filter((w) => fresh.has(w.id) && w.virtual !== true)
  const orientation = planOrientation(plan)
  const north = orientation.north ?? 0
  const facing = (direction: Vec2): CompassPoint => compassPoint(bearingOf(direction, orientation, north) ?? 0)

  const siteBefore = siteMeasures(before)
  const siteAfter = siteMeasures(after)
  const oldPieces = snapped(siteBefore.footprint?.pieces ?? [])
  const newPieces = snapped(siteAfter.footprint?.pieces ?? [])
  const addedPieces = (oldPieces.length === 0 ? newPieces : cutOutline('difference', newPieces, [oldPieces]) ?? [])
    .filter((polygon) => multiArea([polygon]) > tolerance('areaReported'))

  const depths = workDepths(oldPieces, newPieces, addedPieces, facing)
  const { heights, rooms } = newParts(after, newRooms, newWalls)
  return {
    phased: true,
    newRooms: newRooms.map((r) => r.id),
    newWalls: newWalls.map((w) => w.id),
    northStated: orientation.north !== null,
    footprint: { before: siteBefore.footprint?.area ?? null, after: siteAfter.footprint?.area ?? null, added: multiArea(addedPieces) },
    depths,
    heights,
    rooms,
    volume: rooms.reduce((sum, r) => sum + r.volume, 0),
    plot: plotLeft(siteBefore, siteAfter),
    edges: edgeDistances(siteBefore, siteAfter, addedPieces),
  }
}

/** How far the footprint after reaches past the one before, each way along the old footprint's axes. */
function workDepths(oldPieces: MultiPolygon, newPieces: MultiPolygon, added: MultiPolygon, facing: (d: Vec2) => CompassPoint): WorkDepth[] {
  if (oldPieces.length === 0 || newPieces.length === 0 || added.length === 0) return []
  let axis: Vec2 = { x: 1, y: 0 }
  let longest = 0
  for (const ring of ringsOf(oldPieces).slice(0, 1)) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i]!
      const [bx, by] = ring[(i + 1) % ring.length]!
      const run = { x: bx - ax, y: by - ay }
      const long = length(run)
      if (long > longest + tolerance('diffLength')) {
        longest = long
        axis = { x: run.x / long, y: run.y / long }
      }
    }
  }
  const across = perp(axis)
  const ways = [across, { x: -across.x, y: -across.y }, axis, { x: -axis.x, y: -axis.y }]
  const old = pointsOf(oldPieces)
  const now = pointsOf(newPieces)
  const most = (points: readonly Vec2[], d: Vec2): number => Math.max(...points.map((p) => dot(p, d)))
  const found: WorkDepth[] = []
  for (const way of ways) {
    const edge = most(old, way)
    const depth = most(now, way) - edge
    if (depth <= tolerance('diffLength')) continue
    const side = perp(way)
    const past = added.filter((polygon) => pointsOf([polygon]).some((p) => dot(p, way) > edge + tolerance('diffLength')))
    const spread = pointsOf(past).map((p) => dot(p, side))
    found.push({ direction: way, faces: facing(way), depth, across: spread.length === 0 ? 0 : Math.max(...spread) - Math.min(...spread) })
  }
  return found
}

/** The heights of the new walls and rooms above the ground, and the volume over each new room. */
function newParts(after: FloorPlan, rooms: readonly Room[], walls: readonly Wall[]): { heights: WorkHeights; rooms: WorkRoomVolume[] } {
  const elevations = floorElevations(after)
  const ground = groundLevel(after, elevations)
  const above = (floor: string): number => (elevations.floors.get(floor)?.floorLevel ?? 0) - ground.groundOf(floor)
  const index = indexPlan(after)
  const garden = landscapeWalls(after, index)
  const built = walls.filter((w) => !garden.has(w.id))
  const outside = built.filter((w) => w.kind === 'exterior')
  const read = outside.length > 0 ? outside : built
  const tops = read.map((wall) => {
    const profile = wallTopProfile(after, wall)
    const zs = profile === null ? [wall.height] : profile.map((p) => p.z)
    const base = above(floorOf(wall))
    return { low: base + Math.min(...zs), high: base + Math.max(...zs) }
  })
  let highest: number | null = null
  let underRoof = false
  const volumes: WorkRoomVolume[] = []
  for (const room of rooms) {
    const floor = floorOf(room)
    const offset = roomFloorOffset(room)
    const headroom = roomHeadroom(after, room)
    const shape = tryRoomShape(room, index)
    if (headroom === null || shape === null) continue
    const top = above(floor) + offset + headroom.highest
    highest = highest === null ? top : Math.max(highest, top)
    underRoof ||= headroom.underRoof
    const pieces: MultiPolygon = [[ringOf(shape.polygon), ...shape.holes.map(ringOf)]]
    const area = multiArea(pieces)
    const roof = headroom.underRoof ? floorRoofShape(after, floor) : null
    const stated = room.height !== undefined && Number.isFinite(room.height) && room.height > 0 ? room.height : null
    let volume: number
    if (roof === null) volume = area * headroom.highest
    else {
      const cap = stated === null ? roof.top : stated + offset
      volume = Math.max(0, volumeUnder([...boundingPlanes(roof), { z0: cap, gx: 0, gy: 0 }], pieces) - offset * area)
    }
    volumes.push({ room: room.id, name: room.name.trim() === '' ? room.id : room.name, floor, area, volume, underRoof: roof !== null })
  }
  return {
    heights: {
      wallsLowest: tops.length === 0 ? null : Math.min(...tops.map((t) => t.low)),
      wallsHighest: tops.length === 0 ? null : Math.max(...tops.map((t) => t.high)),
      walls: read.map((w) => w.id),
      highest,
      underRoof,
    },
    rooms: volumes,
  }
}

/** The plot less the footprint, before and after the work. */
function plotLeft(before: SiteMeasures, after: SiteMeasures): WorkPlot | null {
  const boundary = after.boundary
  if (boundary === null || boundary.problem !== null) return null
  const left = (site: SiteMeasures): number => Math.max(0, boundary.area - (site.covered ?? 0))
  return { area: boundary.area, before: left(before), after: left(after) }
}

/** The least distance between two segments: 0 where they cross. */
function segmentGap(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  const side = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const crosses = side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
  if (crosses) return 0
  const toSegment = (p: Vec2, s: Vec2, e: Vec2): number => {
    const run = sub(e, s)
    const long = dot(run, run)
    const t = long === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, s), run) / long))
    return length(sub(p, { x: s.x + run.x * t, y: s.y + run.y * t }))
  }
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b))
}

/** The least distance from the added footprint, and from the building before and after, to each edge. */
function edgeDistances(before: SiteMeasures, after: SiteMeasures, added: MultiPolygon): WorkEdge[] {
  const boundary = after.boundary
  if (boundary === null || boundary.problem !== null) return []
  const rings = ringsOf(added)
  return boundary.edges.map((edge): WorkEdge => {
    let least: number | null = null
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!
        const [bx, by] = ring[(i + 1) % ring.length]!
        const gap = segmentGap({ x: ax, y: ay }, { x: bx, y: by }, edge.from, edge.to)
        least = least === null ? gap : Math.min(least, gap)
      }
    }
    const of = (site: SiteMeasures): number | null => site.edges.find((e) => e.edge.edge === edge.edge)?.distance ?? null
    return { edge: edge.edge, name: edge.name, faces: edge.faces, added: least, before: of(before), after: of(after) }
  })
}
