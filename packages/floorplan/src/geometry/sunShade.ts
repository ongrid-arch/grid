/**
 * CNT-58: what the sun does to the plan at a moment: where it shines from on the drawing, the
 * shadows the plan's own walls, floors and site things cast, the share of each open space in sun,
 * and which way each face of each building looks and whether the sun is on it.
 *
 * - The sun is worked out from the site's `latitude` and `longitude` (`astronomy/sunPosition.ts`)
 *   and turned onto the drawing by the plan's north (C7), the top of the drawing when it states
 *   none (`northStated` says which). Times are solar unless a UTC offset is given.
 * - What casts a shadow (`sunCasters`): each floor's slab outline (`slabOutline`, the floors at
 *   or above the ground), with the open outdoor space (a courtyard, a terrace) taken out, standing
 *   from its floor level to its storey's top; every wall that bounds outdoor space and no room, a
 *   garden or boundary wall included, at its own height from its floor; a site fence with a height,
 *   as a thin plate (`fenceCasts`); a tree with a height and a canopy, as a disc of its canopy from
 *   `treeCrownBase` of its height to its top. A floor whose outline cannot be worked out casts by
 *   its walls. A pitched roof is taken flat at the storey's top; the ground is level.
 * - A shadow is cast on a level plane: the ground (the site's level, `groundLevel`) or an open
 *   space's own floor level, by what stands above it. A prism's shadow on a plane is exact: its
 *   two caps moved away from the sun by their heights over the plane times the shadow's length
 *   per metre, and the band each edge sweeps between them, joined.
 * - A share in sun is an area: the open space less the shadow on its level, over the space. The
 *   same at one moment or many, so a moment and a range never tell two stories.
 * - A face is a straight stretch of a building's footprint outline (the floors at or above the
 *   ground joined, open space taken out, so a courtyard's sides face into it), its pieces in line
 *   joined (`writtenParallel`). It faces the way of its outward normal, turned by north. The sun is
 *   on it when the sun is up and in front of it; its foot (`sunFaceFoot` in front of it) is in the
 *   shadow of whatever else stands in the way.
 *
 * Pure: no DOM, no network, no clock.
 */
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import { addDays, daysBetween, sunDay, sunPosition, type CalendarDay, type EarthPlace, type SunDay, type SunPosition } from '../astronomy/sunPosition'
import type { FloorPlan, PlanIndex } from './plan'
import { indexPlan } from './plan'
import { floorElevations } from './elevations'
import { floorOf, planFloors, wallsOnFloor } from './floors'
import { groundLevel } from './ground'
import { planBuildings } from './buildings'
import { landscapeWalls } from './landscape'
import { compassPoint, directionOfTurn, planOrientation, bearingOf, wrapDegrees, type CompassPoint } from './orientation'
import { buildingPlan, isOutdoor, outdoorOnlyWalls, outdoorRoofed, planHasOutdoor } from './outdoor'
import { outlineKnown, slabOutline } from './outline'
import { cutOutline, inPieces, multiArea, piecesAsRings, ringOf } from './polygons'
import { tryRoomShape } from './room'
import { tolerance, limit } from './tolerances'
import { validatePlan } from './validate'
import type { Vec2 } from './vec2'
import { wallSegments } from './wall'

export type { CalendarDay, EarthPlace, SunDay, SunPosition } from '../astronomy/sunPosition'
export { addDays, daysBetween, isCalendarDay, sunDay, sunPosition } from '../astronomy/sunPosition'

/** One moment: a day and minutes from its midnight, solar time or the clock's (`utcOffset`). */
export interface SunMoment {
  readonly day: CalendarDay
  readonly minutes: number
}

/** Where the plan says it is on the earth, or null when it states no latitude and longitude. */
export function planPlace(plan: Pick<FloorPlan, 'site'>): EarthPlace | null {
  const { latitude, longitude } = plan.site ?? {}
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

/** The sun at one moment, on the plan. */
export interface PlanSun {
  readonly moment: SunMoment
  readonly position: SunPosition
  /** Whether it is high enough to cast a shadow Grid works out (`sunLowest`). */
  readonly up: boolean
  /** The way toward the sun on the drawing, level, a unit vector in plan axes. */
  readonly toward: Vec2
  /** The same as degrees clockwise from the top of the drawing (+y). */
  readonly drawing: number
  /** The nearest compass point of the sun's bearing. */
  readonly compass: CompassPoint
  /** How long a shadow is per metre of height; null when the sun is down. */
  readonly shadowPerMetre: number | null
  /** Whether the plan states its north; when not, the top of the drawing is taken as north. */
  readonly northStated: boolean
}

/** The north bearings are turned by: the plan's, else the top of the page (as the camera takes it). */
function northOf(plan: Pick<FloorPlan, 'north' | 'yAxis'>): number {
  const o = planOrientation(plan)
  return o.north ?? (o.yAxis === 'down' ? 180 : 0)
}

/** The unit direction on the drawing a compass bearing points, by the plan's north: `bearingOf` undone. */
export function bearingDirection(plan: Pick<FloorPlan, 'north' | 'yAxis'>, bearing: number): Vec2 {
  const north = northOf(plan)
  const turn = planOrientation(plan).yAxis === 'up' ? north - bearing : bearing + north
  return directionOfTurn(turn)
}

/** The sun at `moment` over `place`, turned onto the plan. */
export function planSunAt(plan: Pick<FloorPlan, 'north' | 'yAxis'>, place: EarthPlace, moment: SunMoment, utcOffset: number | null = null): PlanSun {
  const position = sunPosition(moment.day, moment.minutes, place, utcOffset)
  const toward = bearingDirection(plan, position.azimuth)
  const drawing = wrapDegrees((Math.atan2(toward.x, toward.y) * 180) / Math.PI)
  const up = position.elevation >= tolerance('sunLowest')
  return {
    moment,
    position,
    up,
    toward,
    drawing,
    compass: compassPoint(position.azimuth),
    shadowPerMetre: up ? 1 / Math.tan((position.elevation * Math.PI) / 180) : null,
    northStated: planOrientation(plan).north !== null,
  }
}

/** The sun's day at the plan's place: sunrise, solar noon, sunset. */
export function planSunDay(place: EarthPlace, day: CalendarDay, utcOffset: number | null = null): SunDay {
  return sunDay(day, place, utcOffset)
}

/** The moments of a range: each date from `from` to `until` every `everyDays` (the last always in), each time from `start` to `end` every `everyMinutes`. */
export function sunMoments(from: CalendarDay, until: CalendarDay, start: number, end: number, everyDays: number = limit('sunStepDays'), everyMinutes: number = limit('sunStepMinutes')): SunMoment[] {
  const days: CalendarDay[] = []
  const span = daysBetween(from, until)
  for (let d = 0; d <= span; d += everyDays) days.push(addDays(from, d))
  if (span > 0 && daysBetween(days.at(-1)!, until) !== 0) days.push(until)
  const minutes: number[] = []
  for (let t = start; t <= end; t += everyMinutes) minutes.push(t)
  if (minutes.length === 0 || minutes.at(-1)! < end) minutes.push(end)
  return days.flatMap((day) => minutes.map((m) => ({ day, minutes: m })))
}

// ─── What casts a shadow ─────────────────────────────────────────────────────────────────────

/** One thing that casts a shadow: a footprint standing from `bottom` to `top`, in the floors' datum. */
export interface ShadeCaster {
  readonly kind: 'floor' | 'wall' | 'fence' | 'tree'
  /** The floor's, wall's or site thing's id. */
  readonly id: string
  readonly pieces: MultiPolygon
  readonly bottom: number
  readonly top: number
}

export interface SunCasters {
  readonly casters: readonly ShadeCaster[]
  /** The ground's level, in the floors' datum: where the shadows on the ground lie. */
  readonly ground: number
  /** The floors whose outline could not be worked out, which cast by their walls instead. */
  readonly byWalls: readonly string[]
  /** The site's trees and fences that cast nothing, as they state no height (or a tree no canopy). */
  readonly noHeight: readonly string[]
}

/** The plan with open outdoor space out of the building and a roofed one (a porch) in it, as the footprint takes it. */
function builtPlan(plan: FloorPlan): FloorPlan {
  if (!planHasOutdoor(plan)) return plan
  const roofedAsBuilding: FloorPlan = {
    ...plan,
    rooms: plan.rooms.map((room) => {
      if (!isOutdoor(room) || outdoorRoofed(room) !== true) return room
      const rest: Record<string, unknown> = { ...room }
      delete rest['outdoor']
      return rest as unknown as typeof room
    }),
  }
  return buildingPlan(roofedAsBuilding, indexPlan(roofedAsBuilding))
}

/** The open outdoor spaces of a floor, as polygons. */
function openSpacesOn(plan: FloorPlan, index: PlanIndex, floor: string): Polygon[] {
  return plan.rooms.flatMap((room) => {
    if (!isOutdoor(room) || outdoorRoofed(room) === true || floorOf(room) !== floor) return []
    const shape = tryRoomShape(room, index)
    return shape === null || shape.polygon.length < 3 ? [] : [[ringOf(shape.polygon), ...shape.holes.map(ringOf)]]
  })
}

/** A strip of a wall's footprint, for each of its straight pieces. */
function wallPieces(wall: FloorPlan['walls'][number], half: number): MultiPolygon {
  return wallSegments(wall).flatMap((s): Polygon[] => {
    if (s.length <= 0) return []
    const n = { x: -s.dir.y * half, y: s.dir.x * half }
    return [[[[s.start.x + n.x, s.start.y + n.y], [s.end.x + n.x, s.end.y + n.y], [s.end.x - n.x, s.end.y - n.y], [s.start.x - n.x, s.start.y - n.y]]]]
  })
}

/** A line's footprint as a thin plate `half` either side of it. */
function linePieces(points: readonly (readonly [number, number])[], half: number): MultiPolygon {
  const out: Polygon[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i]!
    const [bx, by] = points[i + 1]!
    const len = Math.hypot(bx - ax, by - ay)
    if (len === 0) continue
    const n = { x: (-(by - ay) / len) * half, y: ((bx - ax) / len) * half }
    out.push([[[ax + n.x, ay + n.y], [bx + n.x, by + n.y], [bx - n.x, by - n.y], [ax - n.x, ay - n.y]]])
  }
  return out
}

/** A disc as a polygon of `canopySides` sides. */
function discPieces(at: readonly [number, number], radius: number): MultiPolygon {
  const sides = Math.max(3, Math.round(limit('canopySides')))
  const ring: Pair[] = []
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides
    ring.push([at[0] + radius * Math.cos(a), at[1] + radius * Math.sin(a)])
  }
  return [[ring]]
}

const cache = new WeakMap<FloorPlan, SunCasters>()

/** Everything in the plan that casts a shadow. Worked out once per plan object. */
export function sunCasters(plan: FloorPlan): SunCasters {
  const kept = cache.get(plan)
  if (kept !== undefined) return kept
  const index = indexPlan(plan)
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations).level
  const built = builtPlan(plan)
  const broken = new Set(validatePlan(built, indexPlan(built), { spaces: false }).broken)
  const casters: ShadeCaster[] = []
  const byWalls: string[] = []
  for (const floor of planFloors(plan)) {
    const level = elevations.floors.get(floor.id)
    if (level === undefined) continue
    const top = level.floorLevel + level.clearHeight
    if (top <= ground) continue
    const outline = slabOutline(built, floor.id, broken)
    if (outlineKnown(outline)) {
      if (outline.pieces.length === 0) continue
      const open = openSpacesOn(plan, index, floor.id)
      const pieces = open.length === 0 ? outline.pieces : cutOutline('difference', outline.pieces, open)
      if (pieces !== null && pieces.length > 0) casters.push({ kind: 'floor', id: floor.id, pieces, bottom: level.floorLevel, top })
      continue
    }
    // A floor whose outline is not known casts by its walls.
    byWalls.push(floor.id)
    for (const wall of wallsOnFloor(plan, floor.id)) {
      if (wall.virtual === true || broken.has(wall.id)) continue
      casters.push({ kind: 'wall', id: wall.id, pieces: wallPieces(wall, wall.thickness / 2), bottom: level.floorLevel, top: level.floorLevel + wall.height })
    }
  }
  // The walls round outdoor space and the garden walls, which no outline holds.
  const apart = new Set([...outdoorOnlyWalls(index), ...landscapeWalls(plan, index)])
  for (const wall of plan.walls) {
    if (!apart.has(wall.id) || wall.virtual === true || broken.has(wall.id)) continue
    const base = elevations.floors.get(floorOf(wall))?.floorLevel ?? 0
    if (!(wall.height > 0)) continue
    casters.push({ kind: 'wall', id: wall.id, pieces: wallPieces(wall, wall.thickness / 2), bottom: base, top: base + wall.height })
  }
  // The site's fences and trees with a height.
  const noHeight: string[] = []
  for (const thing of plan.site?.things ?? []) {
    if (thing.kind === 'fence') {
      if (thing.height === undefined) noHeight.push(thing.id)
      else if ((thing.points?.length ?? 0) >= 2) casters.push({ kind: 'fence', id: thing.id, pieces: linePieces(thing.points!, tolerance('fenceCasts') / 2), bottom: ground, top: ground + thing.height })
    } else if (thing.kind === 'tree') {
      if (thing.height === undefined || thing.canopy === undefined || thing.at === undefined) noHeight.push(thing.id)
      else casters.push({ kind: 'tree', id: thing.id, pieces: discPieces(thing.at, thing.canopy / 2), bottom: ground + thing.height * tolerance('treeCrownBase'), top: ground + thing.height })
    }
  }
  const out = { casters, ground, byWalls, noHeight }
  cache.set(plan, out)
  return out
}

// ─── Shadows ─────────────────────────────────────────────────────────────────────────────────

/** A geometry moved by (dx, dy). */
const moved = (pieces: MultiPolygon, dx: number, dy: number): MultiPolygon => pieces.map((polygon) => polygon.map((ring) => ring.map(([x, y]): Pair => [x + dx, y + dy])))

/** The shadow one caster casts on the level plane at `level`; empty when it stands wholly below it. */
export function casterShadow(caster: ShadeCaster, sun: PlanSun, level: number): MultiPolygon {
  if (!sun.up || sun.shadowPerMetre === null || caster.top <= level) return []
  const away = { x: -sun.toward.x * sun.shadowPerMetre, y: -sun.toward.y * sun.shadowPerMetre }
  const low = Math.max(caster.bottom, level) - level
  const high = caster.top - level
  const near = moved(caster.pieces, away.x * low, away.y * low)
  const far = moved(caster.pieces, away.x * high, away.y * high)
  const bands: Polygon[] = []
  for (const polygon of caster.pieces) {
    for (const ring of polygon) {
      const open = openRing(ring)
      for (let i = 0; i < open.length; i++) {
        const [ax, ay] = open[i]!
        const [bx, by] = open[(i + 1) % open.length]!
        bands.push([[[ax + away.x * low, ay + away.y * low], [bx + away.x * low, by + away.y * low], [bx + away.x * high, by + away.y * high], [ax + away.x * high, ay + away.y * high]]])
      }
    }
  }
  return cutOutline('union', near, [far, ...bands]) ?? []
}

/** Every shadow cast on the level plane at `level` (the ground when left out) at the sun's moment, joined. */
export function shadowsOn(casters: SunCasters, sun: PlanSun, level: number = casters.ground): MultiPolygon {
  if (!sun.up) return []
  const each = casters.casters.map((c) => casterShadow(c, sun, level)).filter((s) => s.length > 0)
  if (each.length === 0) return []
  return cutOutline('union', each[0]!, each.slice(1)) ?? []
}

// ─── What is measured in sun ─────────────────────────────────────────────────────────────────

/** A surface whose share in sun is measured: an open outdoor space, a paved area or pool of the site, or a patch the call names. */
export interface SunSurface {
  readonly kind: 'outdoor' | 'site' | 'area'
  readonly id: string
  readonly name: string
  /** The floor it is on; null for the site's things and a named patch, which lie on the ground. */
  readonly floor: string | null
  /** The level its shadows are cast on, in the floors' datum. */
  readonly level: number
  readonly pieces: MultiPolygon
  readonly area: number
}

/** A patch named in the call, by its corners in plan metres. */
export interface SunArea {
  readonly name: string
  readonly points: readonly Vec2[]
}

/** The surfaces measured: every open outdoor space with an outline, the site's paving and pools, and the patches named. */
export function sunSurfaces(plan: FloorPlan, areas: readonly SunArea[] = []): SunSurface[] {
  const index = indexPlan(plan)
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations).level
  const out: SunSurface[] = []
  for (const room of plan.rooms) {
    if (!isOutdoor(room) || outdoorRoofed(room) === true) continue
    const shape = tryRoomShape(room, index)
    if (shape === null || shape.polygon.length < 3) continue
    const pieces: MultiPolygon = [[ringOf(shape.polygon), ...shape.holes.map(ringOf)]]
    const floor = floorOf(room)
    const level = Math.max(elevations.floors.get(floor)?.floorLevel ?? 0, ground)
    out.push({ kind: 'outdoor', id: room.id, name: room.name ?? room.id, floor, level, pieces, area: multiArea(pieces) })
  }
  for (const thing of plan.site?.things ?? []) {
    if ((thing.kind !== 'paving' && thing.kind !== 'pool') || (thing.points?.length ?? 0) < 3) continue
    const pieces = cutOutline('union', [thing.points!.map(([x, y]): Pair => [x, y])], []) ?? []
    if (pieces.length === 0) continue
    out.push({ kind: 'site', id: thing.id, name: thing.label ?? thing.id, floor: null, level: ground, pieces, area: multiArea(pieces) })
  }
  for (const area of areas) {
    const pieces = cutOutline('union', [ringOf(area.points)], []) ?? []
    if (pieces.length === 0) continue
    out.push({ kind: 'area', id: area.name, name: area.name, floor: null, level: ground, pieces, area: multiArea(pieces) })
  }
  return out
}

/** The share of a surface in sun (0 to 1) given the shadow on its level; 0 when the sun is down. */
export function shareInSun(surface: SunSurface, shadow: MultiPolygon, sun: PlanSun): number {
  if (!sun.up) return 0
  if (surface.area <= 0) return 0
  if (shadow.length === 0) return 1
  const lit = cutOutline('difference', surface.pieces, [shadow])
  if (lit === null) return 0
  return Math.min(1, Math.max(0, multiArea(lit) / surface.area))
}

// ─── Faces ───────────────────────────────────────────────────────────────────────────────────

/** One face of a building's footprint. */
export interface PlanFace {
  /** The building it belongs to, by id; null on a plan that names none (or for the floors in none). */
  readonly building: string | null
  /** Its number, round its building's outline. */
  readonly face: number
  readonly from: Vec2
  readonly to: Vec2
  readonly length: number
  /** Its outward normal on the drawing. */
  readonly outward: Vec2
  /** The way it faces, degrees clockwise from north (the top of the drawing when none is stated), and the nearest compass point. */
  readonly bearing: number
  readonly faces: CompassPoint
  /** Whether it looks into a hole of the outline: a courtyard or a light well. */
  readonly inner: boolean
}

/** The faces of one outline, its straight pieces in line joined. */
function outlineFaces(pieces: MultiPolygon, plan: FloorPlan, building: string | null): PlanFace[] {
  const orientation = planOrientation(plan)
  const north = northOf(plan)
  const out: PlanFace[] = []
  const parallel = tolerance('writtenParallel')
  const shortest = tolerance('sunFaceShortest')
  for (const piece of piecesAsRings(pieces)) {
    ;[piece.outline, ...piece.holes].forEach((open, r) => {
      const edges = open.map((a, i) => ({ a, b: open[(i + 1) % open.length]! })).filter((e) => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 0)
      if (edges.length < 3) return
      const unit = (e: { a: Vec2; b: Vec2 }): Vec2 => {
        const l = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)
        return { x: (e.b.x - e.a.x) / l, y: (e.b.y - e.a.y) / l }
      }
      const inLine = (e: { a: Vec2; b: Vec2 }, f: { a: Vec2; b: Vec2 }): boolean => {
        const u = unit(e)
        const v = unit(f)
        return Math.abs(u.x * v.y - u.y * v.x) < parallel && u.x * v.x + u.y * v.y > 0
      }
      // Start at a corner, so no face is cut in two where the ring happens to begin.
      let first = edges.findIndex((e, i) => !inLine(edges[(i + edges.length - 1) % edges.length]!, e))
      if (first < 0) first = 0
      const runs: { a: Vec2; b: Vec2 }[] = []
      for (let k = 0; k < edges.length; k++) {
        const e = edges[(first + k) % edges.length]!
        const last = runs.at(-1)
        if (last !== undefined && inLine(last, e)) runs[runs.length - 1] = { a: last.a, b: e.b }
        else runs.push({ ...e })
      }
      for (const run of runs) {
        if (Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y) < shortest) continue
        const u = unit(run)
        // polygon-clipping gives an outer ring counter-clockwise and a hole clockwise: outside is to the right of both.
        const outward = { x: u.y, y: -u.x }
        const bearing = bearingOf(outward, orientation, north) ?? 0
        out.push({ building, face: out.length + 1, from: run.a, to: run.b, length: Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y), outward, bearing, faces: compassPoint(bearing), inner: r > 0 })
      }
    })
  }
  return out
}

/** Every face of every building, from the outlines of its floors at or above the ground. */
export function planFaces(plan: FloorPlan): PlanFace[] {
  const { casters, ground } = sunCasters(plan)
  const floors = casters.filter((c) => c.kind === 'floor' && c.top > ground)
  const buildings = planBuildings(plan)
  const groups: { id: string | null; floors: Set<string> }[] =
    buildings.length === 0 ? [{ id: null, floors: new Set(floors.map((f) => f.id)) }] : buildings.map((b) => ({ id: b.id, floors: new Set(b.floors) }))
  if (buildings.length > 0) {
    const held = new Set(buildings.flatMap((b) => b.floors))
    const rest = floors.filter((f) => !held.has(f.id)).map((f) => f.id)
    if (rest.length > 0) groups.push({ id: null, floors: new Set(rest) })
  }
  return groups.flatMap((group) => {
    const own = floors.filter((f) => group.floors.has(f.id))
    if (own.length === 0) return []
    const joined = cutOutline('union', own[0]!.pieces, own.slice(1).map((f) => f.pieces))
    return joined === null ? [] : outlineFaces(joined, plan, group.id)
  })
}

/** A face at a moment. */
export interface FaceSun {
  /** Whether the sun is up and in front of it. */
  readonly facing: boolean
  /** The angle between the sun's rays and the face's square, degrees; null when the sun is not on it. */
  readonly angle: number | null
  /** The share of its foot in the shadow of something else, 0 to 1; 1 when the sun is not on it. */
  readonly footInShade: number
}

/** The sun on a face at the moment, given the shadow on the ground. */
export function faceSun(face: PlanFace, sun: PlanSun, groundShadow: MultiPolygon): FaceSun {
  const front = face.outward.x * sun.toward.x + face.outward.y * sun.toward.y
  if (!sun.up || front <= 0) return { facing: false, angle: null, footInShade: 1 }
  const e = (sun.position.elevation * Math.PI) / 180
  const angle = (Math.acos(Math.min(1, Math.max(-1, Math.cos(e) * front))) * 180) / Math.PI
  const out = tolerance('sunFaceFoot')
  const a = { x: face.from.x + face.outward.x * out, y: face.from.y + face.outward.y * out }
  const b = { x: face.to.x + face.outward.x * out, y: face.to.y + face.outward.y * out }
  return { facing: true, angle, footInShade: lineShare(a, b, groundShadow) }
}

/** The share of the line from a to b inside the pieces, by the crossings of its edges. */
function lineShare(a: Vec2, b: Vec2, pieces: MultiPolygon): number {
  if (pieces.length === 0) return 0
  const d = { x: b.x - a.x, y: b.y - a.y }
  const ts = [0, 1]
  for (const polygon of pieces) {
    for (const ring of polygon) {
      const open = openRing(ring)
      for (let i = 0; i < open.length; i++) {
        const p = open[i]!
        const q = open[(i + 1) % open.length]!
        const e = { x: q[0] - p[0], y: q[1] - p[1] }
        const den = d.x * e.y - d.y * e.x
        if (den === 0) continue
        const w = { x: p[0] - a.x, y: p[1] - a.y }
        const t = (w.x * e.y - w.y * e.x) / den
        const s = (w.x * d.y - w.y * d.x) / den
        if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.push(t)
      }
    }
  }
  ts.sort((x, y) => x - y)
  let inside = 0
  for (let i = 0; i + 1 < ts.length; i++) {
    const mid = (ts[i]! + ts[i + 1]!) / 2
    if (inPieces(pieces, { x: a.x + d.x * mid, y: a.y + d.y * mid })) inside += ts[i + 1]! - ts[i]!
  }
  return Math.min(1, Math.max(0, inside))
}

/** A ring without the closing point polygon-clipping repeats. */
function openRing(ring: readonly Pair[]): readonly Pair[] {
  return ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
}
