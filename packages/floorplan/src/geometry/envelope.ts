/**
 * Slabs, roofs and ceilings from the floors' outlines (LVL-4, lab VE-4, AC-6, F19).
 *
 * From each floor's outline (`outline.ts`, the shape of its gross external area, less any hole in a
 * room that no room fills, a courtyard open to the sky) Grid makes:
 *
 * - **one slab per floor**, the one it stands on: the whole outline, walls and all, open over each
 *   stair and lift shaft that rises into it from the floor below and over each room marked as a
 *   void. A room whose floor is set below its storey's (LVL-7) is cut out of it: its own slab
 *   lies lower. The lowest level's slabs are base slabs.
 * - **a roof over every part with nothing above**: the floor's outline less the outlines of the
 *   floors on the next level up, flat, on the floor's walls (its floor level plus its clear height),
 *   as thick as `SLAB_THICKNESS`. LVL-15: "above" is read from the floors' elevations, not the
 *   order of `level`: every floor whose floor stands higher, at any height, is taken off, so the
 *   slab a half level of a split-level house or car park stands on is a floor, never a roof. A
 *   floor of its own elevation that shares its level with others (a step of a stepped house) is
 *   roofed on its own tallest wall, not the level's, unless it states its height. With a `parapet` stated on the floor, the outside walls under the
 *   roof's edge rise that far above it. LVL-13: none is laid where it would lie at or under the
 *   ground (`site.ground`, else 0): the ground covers a crypt or a basement past the floor above.
 * - **a ceiling** in each room that states one: at the room's height, less its lowered zones, each
 *   at its own height.
 *
 * A zone of a room (CNT-8, `partOf`) is part of its room's floor: it fills no courtyard, opens no
 * slab as a void or a stair or lift room, has no sunken slab and no ceiling of its own, so a room
 * with zones gives the same slab, roof and ceiling as the room drawn without them.
 *
 * The opening over a stair: a stair the plan states (LVL-3) opens the upper floor over its flights
 * and landings. Rooms used as a stair on two neighbouring floors that lie one over the other
 * (`floorJoins`), with no stated stair between them, open the upper floor over the floor they
 * share: the plan does not say where the flights are, so the whole stair room is open. A lift
 * shaft is open over the floor its rooms share.
 *
 * Outdoor space (CNT-7, C26) is the outside to the building. The outline is the building's: the
 * walls that bound outdoor space and no room are not in it, and an outdoor space inside the walls (a
 * courtyard, a light well) is open in it. An outdoor space on the lowest level stands on the ground,
 * so it has no slab; one above it (a balcony, a roof terrace) stands on a slab, as a floor does. Only
 * an outdoor space marked roofed (`outdoorRoofed`) has a roof: a porch or a carport is roofed with
 * the floor, an open terrace is not. LVL-13: nor are the walls that bound open outdoor space and no
 * room, along the stretch beside it, even where the same wall runs on past a room.
 *
 * LVL-12: floor no room claims that is open to the sky (`openSky.ts`: a window looks into it, or
 * it lies over open sky below) is cut out of the outline as a courtyard in a room is, and an open
 * courtyard or light well over open sky below has no slab on any floor. A floor whose roof covers
 * roofed outdoor space alone (a canopy on columns) is roofed at that space's height
 * (`canopyHeight`); beside the building, such a space is roofed with the floor.
 *
 * Every figure is worked out from the walls: the plan states no roof, no slab outline and no
 * opening, so each is Grid's reading, and the quantities say so (AC-6).
 *
 * Pure, and never throws: a floor whose outline cannot be worked out has no slab or roof, and says
 * why. The cutting is done by `polygon-clipping` (MIT).
 */

import { planInState } from './phases'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import { floorOf, planFloors, planForFloor, wallsOnFloor } from './floors'
import type { BuildingElevations } from './elevations'
import { SLAB_THICKNESS, floorElevations, tallestDrawnWall } from './elevations'
import { boxOfPoints } from './boxIndex'
import type { Floor, FloorPlan, PlanIndex, Room } from './plan'
import { indexPlan, roomWallIds } from './plan'
import { floorJoins, roomOutlinesByFloor, type OutlinesByFloor } from './floorJoins'
import { outlineKnown, slabOutline, type FloorOutline, type FloorOutlineUnknown } from './outline'
import { boxOfRings, cutOutline, inRing, multiArea, overlaps, pointInside, ringOf, union, type Box } from './polygons'
import { outerWallBand, floorWalls } from './areas'
import { planWallSides } from './exposure'
import { tryRoomShape } from './room'
import { roomFloorOffset } from './steps'
import { brokenOnFloor } from './validate'
import { tolerance } from './tolerances'
import { roomZones } from './zones'
import { buildingPlan, isOutdoor, outdoorKind, outdoorRoofed } from './outdoor'
import { inOpenSky, openBelow } from './openSky'
import { columnRise, columnsOnFloor, soundColumn } from './columns'
import type { OutdoorKind } from '../types/floorplan'
import type { Vec2 } from './vec2'
import { planRamps } from './parking'
import { groundLevel } from './ground'
import { overItsWalls } from './partyWalls'
import type { RoofShape } from './plan'
import { floorRoofShape, regionAtLeast, roofFacets, rooflightPlace, type RoofPlane, type RooflightPlace, type RoofShapeOverFloor } from './roofs'

/** What a slab is open over. */
export type SlabOpeningKind = 'stair' | 'stair-room' | 'lift' | 'void' | 'ramp'

/** A hole in a floor's slab. */
export interface SlabOpening {
  readonly kind: SlabOpeningKind
  /**
   * What makes it: a stated stair's id; for rooms one over the other, the lower room's id and the
   * upper's, joined by "|" (as `floorJoins` says them); a void's room id; a ramp's id (CNT-19).
   */
  readonly via: string
  /** The room on this floor it opens, when one holds it. */
  readonly room: string | null
  /** Its outline, inside the floor's outline. */
  readonly pieces: MultiPolygon
  readonly area: number
}

/** A room whose floor stands below its storey's (LVL-7): its own piece of slab, lower down. */
export interface SunkenSlab {
  readonly room: string
  /** How far its floor stands below the storey's, in metres: negative. */
  readonly offset: number
  readonly pieces: MultiPolygon
}

/** The slab a floor stands on. */
export interface FloorSlab {
  /** `base` on the lowest level, else `floor`. */
  readonly kind: 'base' | 'floor'
  /** The top of the slab: the floor's floor level, in metres from the ground floor's. */
  readonly top: number
  /** Its thickness: the floor's stated `slab`, else `SLAB_THICKNESS`. */
  readonly thickness: number
  readonly thicknessStated: boolean
  /** The outline less the sunken rooms: the body an IFC slab extrudes, before its openings void it. */
  readonly body: MultiPolygon
  /** The body less its openings: the slab as built, what a 3D view draws. */
  readonly pieces: MultiPolygon
  /** The area of `pieces`, in square metres. */
  readonly area: number
  readonly openings: readonly SlabOpening[]
  readonly sunken: readonly SunkenSlab[]
}

/** One plane of a roof (LVL-6) and the part of the roof under it. */
export interface RoofFacetPieces {
  /** The underside's height over the plan, above the floor's level. Level on a flat roof. */
  readonly plane: RoofPlane
  readonly pieces: MultiPolygon
  /** On plan, in square metres. */
  readonly area: number
  /** On the slope: the plan area over the cosine of the plane's pitch. */
  readonly slopeArea: number
}

/** The roof over the parts of a floor with nothing above. */
export interface FloorRoof {
  readonly pieces: MultiPolygon
  /** In square metres, on plan: a flat roof's area. */
  readonly area: number
  /**
   * The underside, on the floor's walls: its floor level plus its clear height. Under a roof the
   * floor states (LVL-6), its floor level plus the roof's eaves: a sloped roof's lowest line.
   */
  readonly bottom: number
  readonly thickness: number
  /** The floors above whose outlines were taken off; none for the top level. */
  readonly under: readonly string[]
  /** The outside walls rising past the roof's edge, when the floor states a parapet. Flat roofs only. */
  readonly parapet: { readonly height: number; readonly pieces: MultiPolygon } | null
  /** LVL-6: the shape the floor states for its roof; null for the flat roof Grid lays on its walls. */
  readonly shape: RoofShape | null
  /** Its pitch in degrees; 0 when flat. */
  readonly pitch: number
  /** The roof cut by the planes of its underside: one level set of pieces when it is flat. */
  readonly facets: readonly RoofFacetPieces[]
  /** The roof's area on its slope, in square metres: `area` when it is flat. */
  readonly slopeArea: number
  /** Its rooflights, each wholly on one plane of it; one that is not is left out (the check names it). */
  readonly rooflights: readonly RooflightPlace[]
}

export interface FloorEnvelope {
  readonly floor: string
  /** The floor's outline, or null when it cannot be worked out (`why`). */
  readonly outline: MultiPolygon | null
  readonly outlineArea: number | null
  /** Null when the floor has no outline: its walls close no floor, or it cannot be worked out. */
  readonly slab: FloorSlab | null
  /** Null when every part of the floor has a floor above it, or the outline is not known. */
  readonly roof: FloorRoof | null
  /** Whether the roof is known: false when this floor's outline, or that of a floor above it, is not. */
  readonly roofKnown: boolean
  /** Why the floor has no slab or roof, in a sentence; null when it has what its outline gives. */
  readonly why: string | null
  /**
   * CNT-6 (C23): what the plan states lies above the floor, when it is more of the building (a
   * common part or a neighbour): the floor then has no roof.
   */
  readonly above?: 'common' | 'neighbour'
}

export interface PlanEnvelope {
  readonly floors: readonly FloorEnvelope[]
  /** Every roof, on plan; null when some floor's outline is not known. */
  readonly roofArea: number | null
  /** Every slab as built; null when some floor's outline is not known. */
  readonly slabArea: number | null
}

export interface EnvelopeOptions {
  /** Only these floors, in plan order. Every floor when not given. */
  readonly floors?: readonly string[]
  readonly elevations?: BuildingElevations
}

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/** A room's floor as a polygon, with its holes. */
function roomPieces(room: Room, index: PlanIndex): MultiPolygon | null {
  const shape = tryRoomShape(room, index)
  if (shape === null || shape.polygon.length < 3) return null
  return [[ringOf(shape.polygon), ...shape.holes.map(ringOf)]]
}

/**
 * The outline less the floor inside every hole in a room (ARE-6) that no room on the floor fills: a
 * courtyard in a ring gallery is open to the sky, so it has no slab and no roof, while the walls
 * round it stand on the slab. A core with rooms in it is floor.
 */
function openToTheSky(outline: FloorOutline | FloorOutlineUnknown, slice: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, sky: OpenSkyTest): FloorOutline | FloorOutlineUnknown {
  if (!outlineKnown(outline) || outline.pieces.length === 0) return outline
  const zones = roomZones(index).zoneOf
  const shapes = slice.rooms
    .filter((room) => !broken.has(room.id) && !zones.has(room.id))
    .map((room) => tryRoomShape(room, index))
    .filter((shape): shape is NonNullable<typeof shape> => shape !== null && shape.polygon.length >= 3)
  const holes = shapes.flatMap((shape) => shape.holes.filter((hole) => hole.length >= 3).map(ringOf))
  const inside = shapes.map((shape) => {
    const polygon = [ringOf(shape.polygon), ...shape.holes.map(ringOf)]
    return pointInside(polygon, boxOfRings(polygon))
  })
  const empty = holes.filter((hole) => !inside.some((p) => inRing(p, hole)))
  // LVL-12: a space no room holds that is open to the sky (`openSky.ts`): a courtyard drawn round
  // with rooms, with a window into it or open sky under it.
  const claimed = (p: Vec2): boolean => shapes.some((shape) => inRing(p, ringOf(shape.polygon)) && !shape.holes.some((hole) => inRing(p, ringOf(hole))))
  const open = outline.spaces
    .filter((space) => empty.some((hole) => inRing(space.at, hole)) || (!claimed(space.at) && sky(space.at)))
    .map((space) => space.pieces)
  if (open.length === 0) return outline
  const pieces = cutOutline('difference', outline.pieces, open)
  return pieces === null ? outline : { ...outline, pieces, area: multiArea(pieces) }
}

/**
 * The slabs and roofs of the plan, floor by floor in plan order, from each floor's outline. See the
 * module's header for the rules. Never throws.
 */
export function planEnvelope(stated: FloorPlan, options: EnvelopeOptions = {}): PlanEnvelope {
  // CNT-10: the slabs and roofs of the building as it will be after the work.
  const plan = planInState(stated, 'after')
  const floors = planFloors(plan)
  const elevations = options.elevations ?? floorElevations(plan)
  const wanted = floors.filter((f) => options.floors === undefined || options.floors.includes(f.id))
  const levels = [...new Set(floors.map(levelOf))].sort((a, b) => a - b)
  const lowest = levels[0] ?? 0
  // LVL-15: where a floor's floor stands, which decides what stands over what.
  const floorLevelOf = (f: Floor): number => elevations.floors.get(f.id)?.floorLevel ?? 0
  // LVL-13: the ground's level, in the floors' own datum: as the site states it, else 0. LVL-23:
  // a building's floors are under its own ground.
  const groundOf = groundLevel(plan, elevations).groundOf

  const slices = new Map<string, Slice>()
  const sliceOf = (id: string) => {
    let found = slices.get(id)
    if (found === undefined) {
      const slice = planForFloor(plan, id)
      found = { slice, index: indexPlan(slice), broken: brokenOnFloor(slice) }
      slices.set(id, found)
    }
    return found
  }
  // CNT-8: a zone of a room, on its floor.
  const isZone = (floorId: string, room: string): boolean => roomZones(sliceOf(floorId).index).zoneOf.has(room)
  const outlines = new Map<string, ReturnType<typeof slabOutline>>()
  // CNT-7 (C26): on a floor with outdoor space, what its roof covers, beside what its slab does.
  const roofs = new Map<string, MultiPolygon>()
  // LVL-12: the floors whose roof covers roofed outdoor space alone (a canopy on columns).
  const canopies = new Set<string>()
  // LVL-12: floor open to the sky is worked out on the whole plan, floor by floor down.
  let whole: PlanIndex | null = null
  const wholeIndex = (): PlanIndex => (whole ??= indexPlan(plan))
  const skyOn = (id: string): OpenSkyTest => (p) => inOpenSky(wholeIndex(), id, p)
  const outlineOf = (id: string) => {
    let found = outlines.get(id)
    if (found === undefined) {
      const { slice, index, broken } = sliceOf(id)
      const floor = floors.find((f) => f.id === id)
      const base = floor !== undefined && levelOf(floor) === lowest && (floor.below === undefined || floor.below === 'ground')
      const sky = skyOn(id)
      const outdoor = outdoorOutlines(slice, id, index, broken, base, sky, (p) => openBelow(wholeIndex(), id, p))
      if (outdoor === null) found = openToTheSky(slabOutline(slice, id, broken), slice, index, broken, sky)
      else {
        found = outdoor.slab
        if (outlineKnown(outdoor.slab)) roofs.set(id, outdoor.roof)
        if (outdoor.canopy) canopies.add(id)
      }
      outlines.set(id, found)
    }
    return found
  }

  // What joins the floors: only worked out when something could open a slab.
  const shafts = plan.rooms.some((room) => room.use === 'stair' || room.use === 'lift') || (plan.stairs ?? []).length > 0
  let rooms: OutlinesByFloor | null = null
  let joins: ReturnType<typeof floorJoins> | null = null
  const joinsOnce = () => {
    if (joins === null) {
      rooms = roomOutlinesByFloor(plan)
      joins = floorJoins(plan, rooms)
    }
    return { joins, rooms: rooms! }
  }

  const result = wanted.map((floor): FloorEnvelope => {
    const own = outlineOf(floor.id)
    if (!outlineKnown(own)) {
      return { floor: floor.id, outline: null, outlineArea: null, slab: null, roof: null, roofKnown: false, why: `its outline could not be worked out: ${own.reason}` }
    }
    const canopy = canopies.has(floor.id) && (roofs.get(floor.id) ?? []).length > 0
    if (own.pieces.length === 0 && !canopy) {
      return { floor: floor.id, outline: [], outlineArea: 0, slab: null, roof: null, roofKnown: true, why: 'its walls close no floor, so it has no outline for a slab or a roof' }
    }
    const storey = elevations.floors.get(floor.id) ?? { floorLevel: 0, clearHeight: 0 }
    // CNT-6 (C23, lab AC-7): a floor with more of the building below it stands on a floor slab,
    // not on the ground, whatever its level.
    const onGround = floor.below === undefined || floor.below === 'ground'
    const slab = own.pieces.length === 0 ? null : slabOf(plan, floor, own, storey.floorLevel, levelOf(floor) === lowest && onGround, sliceOf(floor.id), shafts ? joinsOnce : null, isZone)
    // CNT-6: and one with more of the building above it has no roof.
    if (floor.above !== undefined && floor.above !== 'outside') {
      return { floor: floor.id, outline: own.pieces, outlineArea: own.area, slab, roof: null, roofKnown: true, why: null, above: floor.above }
    }

    // LVL-15: the roof is the outline less every floor whose floor stands higher, at any height,
    // the lowest first, until nothing is left: a half level's slab is a floor, not a roof.
    let pieces: MultiPolygon = roofs.get(floor.id) ?? own.pieces
    const under: string[] = []
    const unknown: Floor[] = []
    const reach = boxOfRings(pieces.flatMap((polygon) => polygon))
    const higher = floors
      .filter((f) => f.id !== floor.id && floorLevelOf(f) > storey.floorLevel + tolerance('sameFloorLevel'))
      .sort((a, b) => floorLevelOf(a) - floorLevelOf(b))
    for (const f of higher) {
      if (pieces.length === 0) break
      const above = outlineOf(f.id)
      if (!outlineKnown(above)) {
        // A floor whose outline is not known puts the roof in doubt only where its walls stand.
        if (overlaps(wallsBox(plan, f.id), reach)) unknown.push(f)
        continue
      }
      if (above.pieces.length === 0 || !overlaps(boxOfRings(above.pieces.flatMap((polygon) => polygon)), reach)) continue
      const left = cutOutline('difference', pieces, [above.pieces])
      if (left === null) {
        return { floor: floor.id, outline: own.pieces, outlineArea: own.area, slab, roof: null, roofKnown: false, why: 'the floors above could not be cut from its outline' }
      }
      if (multiArea(pieces) - multiArea(left) > tolerance('noArea')) under.push(f.id)
      pieces = left
    }
    if (unknown.length > 0 && pieces.length > 0) {
      return { floor: floor.id, outline: own.pieces, outlineArea: own.area, slab, roof: null, roofKnown: false, why: `the roof is not known: the outline of ${unknown.map((f) => JSON.stringify(f.name || f.id)).join(', ')} above it could not be worked out` }
    }
    let roof: FloorRoof | null = null
    const shape = pieces.length > 0 ? floorRoofShape(plan, floor.id) : null
    // LVL-13: a roof Grid would lay at or under the ground (a crypt, a basement past the floor
    // above) is not laid: the ground covers that part of the floor. LVL-12: a roof over roofed
    // outdoor space alone stands as high as that space does.
    const clear = canopy && shape === null ? canopyHeight(plan, sliceOf(floor.id), floor.id, storey.clearHeight) : onOwnWalls(plan, floor, floors, storey.clearHeight)
    const buried = shape === null && storey.floorLevel + clear + SLAB_THICKNESS <= groundOf(floor.id) + tolerance('sameFloorLevel')
    if (pieces.length > 0 && !buried) {
      const sloped = shape !== null && shape.planes.length > 0
      const height = !sloped && floor.parapet !== undefined && Number.isFinite(floor.parapet) && floor.parapet > 0 ? floor.parapet : null
      let parapet: FloorRoof['parapet'] = null
      if (height !== null) {
        const { slice, index, broken } = sliceOf(floor.id)
        const band = outerWallBand(floorWalls(slice, floor.id, broken), planWallSides(index))
        const along = band.length === 0 ? [] : cutOutline('intersection', pieces, [union(band)])
        if (along !== null && along.length > 0) parapet = { height, pieces: along }
      }
      const { facets, rooflights } = roofPieces(shape, pieces, clear)
      roof = {
        pieces,
        area: multiArea(pieces),
        bottom: storey.floorLevel + (shape === null ? clear : shape.roof.eaves),
        thickness: SLAB_THICKNESS,
        under,
        parapet,
        shape: shape === null ? null : shape.roof.shape,
        pitch: shape === null ? 0 : shape.pitch,
        facets,
        slopeArea: facets.reduce((total, f) => total + f.slopeArea, 0),
        rooflights
      }
    }
    return { floor: floor.id, outline: own.pieces, outlineArea: own.area, slab, roof, roofKnown: true, why: null }
  })

  const sum = (pick: (f: FloorEnvelope) => number): number => result.reduce((total, f) => total + pick(f), 0)
  return {
    floors: result,
    roofArea: result.every((f) => f.roofKnown) ? sum((f) => f.roof?.area ?? 0) : null,
    slabArea: result.every((f) => f.outline !== null) ? sum((f) => f.slab?.area ?? 0) : null
  }
}

/**
 * LVL-15: how high a floor's flat roof stands on its walls. Floors sharing a level share its clear
 * height (`stackFloors`), the tallest wall of them all; a floor of its own elevation on that level
 * (a step of a stepped house) is roofed on its own tallest wall instead, so its roof meets the tops
 * of its walls. A floor that states its height, or stands alone on its level, keeps the clear height.
 */
function onOwnWalls(plan: FloorPlan, floor: Floor, floors: readonly Floor[], clearHeight: number): number {
  if (floor.height !== undefined && Number.isFinite(floor.height) && floor.height > 0) return clearHeight
  if (!floors.some((f) => f.id !== floor.id && levelOf(f) === levelOf(floor))) return clearHeight
  const tallest = tallestDrawnWall(plan, floor)
  return Number.isFinite(tallest) && tallest > 0 ? tallest : clearHeight
}

/** LVL-15: the box round a floor's walls, each widened by its thickness, its curve's circle and all. */
function wallsBox(plan: FloorPlan, floor: string): Box {
  const points: Vec2[] = []
  for (const wall of wallsOnFloor(plan, floor)) {
    const grow = Number.isFinite(wall.thickness) ? Math.max(0, wall.thickness) : 0
    const ends: [number, number][] = [wall.start, wall.end]
    if (wall.arc !== undefined) {
      const radius = Math.hypot(wall.start[0] - wall.arc.centre[0], wall.start[1] - wall.arc.centre[1])
      ends.push([wall.arc.centre[0] - radius, wall.arc.centre[1] - radius], [wall.arc.centre[0] + radius, wall.arc.centre[1] + radius])
    }
    for (const [x, y] of ends) points.push({ x: x - grow, y: y - grow }, { x: x + grow, y: y + grow })
  }
  return boxOfPoints(points)
}

/** A convex ring with each corner moved toward its middle by `noLength`. */
function pulledIn(ring: readonly Vec2[]): Vec2[] {
  const middle = { x: ring.reduce((sum, p) => sum + p.x, 0) / ring.length, y: ring.reduce((sum, p) => sum + p.y, 0) / ring.length }
  return ring.map((p) => {
    const length = Math.hypot(middle.x - p.x, middle.y - p.y)
    return length > tolerance('noLength') ? { x: p.x + ((middle.x - p.x) / length) * tolerance('noLength'), y: p.y + ((middle.y - p.y) / length) * tolerance('noLength') } : p
  })
}

const samePlane = (a: RoofPlane, b: RoofPlane): boolean =>
  Math.abs(a.z0 - b.z0) <= tolerance('joint') && Math.abs(a.gx - b.gx) <= tolerance('joint') && Math.abs(a.gy - b.gy) <= tolerance('joint')

/**
 * The roof's pieces cut into the planes of its underside (LVL-6), each less the rooflights on it,
 * and the rooflights that lie wholly on the roof. With no roof stated, one level set of pieces at the
 * floor's clear height, as LVL-4 laid it.
 */
function roofPieces(shape: RoofShapeOverFloor | null, pieces: MultiPolygon, clearHeight: number): { facets: RoofFacetPieces[]; rooflights: RooflightPlace[] } {
  if (shape === null) {
    const area = multiArea(pieces)
    return { facets: [{ plane: { z0: clearHeight, gx: 0, gy: 0 }, pieces, area, slopeArea: area }], rooflights: [] }
  }
  const rooflights = (shape.roof.rooflights ?? []).flatMap((rooflight) => {
    const place = rooflightPlace(shape, rooflight)
    if ('problem' in place) return []
    const ring: MultiPolygon = [[ringOf([...place.outline])]]
    const inside = cutOutline('intersection', pieces, [ring])
    const whole = Math.abs(multiArea(ring))
    return inside !== null && Math.abs(multiArea(inside) - whole) <= tolerance('areaReported') ? [place] : []
  })
  const facets = roofFacets(shape).flatMap((facet): RoofFacetPieces[] => {
    // VEW-12: a hip line running exactly through a corner of the outline can defeat the cut; the
    // plane is then cut again, pulled in toward its middle by a hair (`noLength`), never lost.
    let under = cutOutline('intersection', pieces, [[[ringOf([...facet.polygon])]]]) ?? cutOutline('intersection', pieces, [[[ringOf(pulledIn(facet.polygon))]]])
    if (under === null || under.length === 0) return []
    const holes = rooflights.filter((r) => samePlane(r.plane, facet.plane)).map((r): MultiPolygon => [[ringOf([...r.outline])]])
    if (holes.length > 0) under = cutOutline('difference', under, holes) ?? under
    const area = multiArea(under)
    const rise = Math.hypot(facet.plane.gx, facet.plane.gy)
    return [{ plane: facet.plane, pieces: under, area, slopeArea: area * Math.sqrt(1 + rise * rise) }]
  })
  return { facets, rooflights }
}

/**
 * CNT-7 (C26): a floor's outline on a plan with outdoor space on that floor: what its slab covers and
 * what its roof covers. The building's outline (`buildingPlan`: no wall that bounds outdoor space
 * alone, and any outdoor space inside the walls open in it) is in both. Every outdoor space is in
 * the slab off the lowest level; on it, none is, as the ground is under it. Only the roofed ones are
 * in the roof. Null on a floor with no outdoor space, which is read as before.
 */
function outdoorOutlines(
  slice: FloorPlan,
  id: string,
  index: PlanIndex,
  broken: ReadonlySet<string>,
  base: boolean,
  sky: OpenSkyTest,
  overSky: OpenSkyTest
): { slab: FloorOutline | FloorOutlineUnknown; roof: MultiPolygon; canopy: boolean } | null {
  const outdoor = slice.rooms.filter((room) => isOutdoor(room) && floorOf(room) === id && !broken.has(room.id))
  if (outdoor.length === 0) return null
  const building = buildingPlan(slice, index)
  const buildingIndex = building === slice ? index : indexPlan(building)
  const known = openToTheSky(slabOutline(building, id, broken), building, buildingIndex, broken, sky)
  if (!outlineKnown(known)) return { slab: known, roof: [], canopy: false }
  const shapes = outdoor.map((room) => ({ room, pieces: roomPieces(room, index) })).filter((s): s is { room: Room; pieces: MultiPolygon } => s.pieces !== null)
  // An outdoor space inside the building's walls is open in its outline.
  const inside = known.spaces.filter((space) => shapes.some((s) => s.pieces.some((polygon) => inRing(space.at, polygon[0]!) && !polygon.slice(1).some((hole) => inRing(space.at, hole))))).map((space) => space.pieces)
  const own = inside.length === 0 ? known.pieces : cutOutline('difference', known.pieces, inside) ?? known.pieces
  const join = (extra: readonly MultiPolygon[]): MultiPolygon => (extra.length === 0 ? own : cutOutline('union', own, extra) ?? own)
  // LVL-12: a courtyard or a light well over open sky on the floor below has no slab: the sky
  // reaches down through it. A balcony, a terrace or a garden above the lowest floor stands on one.
  const throughSky = (s: { room: Room; pieces: MultiPolygon }): boolean => {
    if (!OPEN_THROUGH.has(outdoorKind(s.room)!) || outdoorRoofed(s.room) !== false) return false
    const polygon = s.pieces[0]!
    return overSky(pointInside(polygon, boxOfRings(polygon)))
  }
  const slab = base ? own : join(shapes.filter((s) => !throughSky(s)).map((s) => s.pieces))
  const roofed = shapes.filter((s) => outdoorRoofed(s.room) === true).map((s) => s.pieces)
  const roof = lessOpenWalls(join(roofed), slice, id, index, broken)
  return { slab: { ...known, pieces: slab, area: multiArea(slab) }, roof, canopy: known.pieces.length === 0 && roofed.length > 0 }
}

/**
 * LVL-13: the roof less the walls that bound open outdoor space and no room: a terrace's parapet,
 * a balcony's edge, along the stretch beside it, even where the same wall runs on past a room (a
 * stair house on a roof terrace). Each unroofed outdoor space over the whole of its walls
 * (`overItsWalls`), less each room and roofed outdoor space over the whole of theirs: a wall a room
 * lists carries the room's roof.
 */
function lessOpenWalls(roof: MultiPolygon, slice: FloorPlan, id: string, index: PlanIndex, broken: ReadonlySet<string>): MultiPolygon {
  if (roof.length === 0) return roof
  const zones = roomZones(index).zoneOf
  const rooms = slice.rooms.filter((room) => floorOf(room) === id && !broken.has(room.id) && !zones.has(room.id))
  const over = (room: Room): Polygon[] => {
    const shape = tryRoomShape(room, index)
    if (shape === null || shape.polygon.length < 3) return []
    const walls = [...new Set(roomWallIds(room))].flatMap((wallId) => {
      const wall = index.wallsById.get(wallId)
      return wall === undefined || broken.has(wallId) ? [] : [wall]
    })
    return overItsWalls({ polygon: shape.polygon, holes: shape.holes, walls })
  }
  const open = rooms.filter((room) => isOutdoor(room) && outdoorRoofed(room) !== true).flatMap(over)
  if (open.length === 0) return roof
  const covered = rooms.filter((room) => !isOutdoor(room) || outdoorRoofed(room) === true).flatMap(over)
  const bare = cutOutline('difference', open.length === 1 ? open[0]! : (cutOutline('union', [], open) ?? []), covered)
  if (bare === null || bare.length === 0) return roof
  return cutOutline('difference', roof, [bare]) ?? roof
}

/** LVL-12: the outdoor kinds open to the sky down through the floors they stand on. */
const OPEN_THROUGH: ReadonlySet<OutdoorKind> = new Set<OutdoorKind>(['courtyard', 'light-well'])

/** A test of a point of one floor: whether it lies in (or over) open sky. */
type OpenSkyTest = (p: Vec2) => boolean

/**
 * LVL-12: how high a roof over roofed outdoor space alone stands above its floor: the tallest
 * such space's stated `height`, else the tallest column standing in it (`columnRise`), else the
 * storey's clear height.
 */
function canopyHeight(plan: FloorPlan, { slice, index, broken }: Slice, id: string, clearHeight: number): number {
  const columns = columnsOnFloor(plan, id).filter(soundColumn)
  let tallest = 0
  for (const room of slice.rooms) {
    if (!isOutdoor(room) || outdoorRoofed(room) !== true || floorOf(room) !== id || broken.has(room.id)) continue
    if (room.height !== undefined && Number.isFinite(room.height) && room.height > 0) {
      tallest = Math.max(tallest, room.height)
      continue
    }
    const shape = tryRoomShape(room, index)
    if (shape === null || shape.polygon.length < 3) continue
    const ring = ringOf(shape.polygon)
    for (const column of columns) if (inRing({ x: column.at[0], y: column.at[1] }, ring)) tallest = Math.max(tallest, columnRise(plan, column))
  }
  return tallest > 0 ? tallest : clearHeight
}

/** One floor's slab and roof, from the whole plan: `planEnvelope` for that floor alone. */
export function floorEnvelope(plan: FloorPlan, floor: string, elevations?: BuildingElevations): FloorEnvelope | null {
  return planEnvelope(plan, { floors: [floor], ...(elevations ? { elevations } : {}) }).floors[0] ?? null
}

interface Slice {
  readonly slice: FloorPlan
  readonly index: PlanIndex
  readonly broken: ReadonlySet<string>
}

function slabOf(
  plan: FloorPlan,
  floor: Floor,
  own: FloorOutline,
  top: number,
  base: boolean,
  { slice, index, broken }: Slice,
  joinsOnce: (() => { joins: ReturnType<typeof floorJoins>; rooms: OutlinesByFloor }) | null,
  /** Whether a room on a floor is a zone of another (CNT-8): its floor is its room's. */
  isZone: (floor: string, room: string) => boolean
): FloorSlab {
  const stated = floor.slab !== undefined && Number.isFinite(floor.slab) && floor.slab >= 0
  const thickness = stated ? floor.slab! : SLAB_THICKNESS
  const openings: SlabOpening[] = []
  const add = (kind: SlabOpeningKind, via: string, room: string | null, shape: MultiPolygon | null): void => {
    if (shape === null || shape.length === 0) return
    const pieces = cutOutline('intersection', own.pieces, [shape])
    if (pieces === null || pieces.length === 0) return
    openings.push({ kind, via, room, pieces, area: multiArea(pieces) })
  }

  if (joinsOnce !== null) {
    const { joins, rooms } = joinsOnce()
    // A stair the plan states opens the floor it arrives at, over its flights and landings.
    const stated = joins.stairs.filter((stair) => stair.upper.floor === floor.id)
    for (const stair of stated) {
      const parts = [...stair.flights.map((f) => f.outline), ...stair.landings.map((l) => l.outline)].map((ring): MultiPolygon => [[ringOf(ring)]])
      add('stair', stair.id, stair.upper.room, cutOutline('union', parts[0] ?? [], parts.slice(1)))
    }
    for (const join of joins.joins) {
      if (join.kind === 'stair' || join.upper.floor !== floor.id) continue
      // Rooms one over the other that a stated stair already joins: its flights say where the hole is.
      if (join.kind === 'stair-room' && stated.some((s) => s.upper.room === join.upper.room || s.lower.room === join.lower.room)) continue
      // A zone is in no stair or lift stack (CNT-8): only its room opens the floor.
      if (isZone(join.lower.floor, join.lower.room) || isZone(join.upper.floor, join.upper.room)) continue
      const lower = rooms.get(join.lower.floor)?.get(join.lower.room)
      const upper = rooms.get(join.upper.floor)?.get(join.upper.room)
      if (lower === undefined || upper === undefined) continue
      add(join.kind, join.via, join.upper.room, cutOutline('intersection', [[ringOf(upper)]], [[[ringOf(lower)]]]))
    }
  }
  // CNT-19 (C29): a ramp opens the floor it arrives at over the whole of it, as a stated stair does.
  for (const ramp of planRamps(plan).ramps) {
    if (ramp.upper.floor !== floor.id) continue
    const parts = ramp.pieces.map((ring): MultiPolygon => [[ringOf(ring)]])
    add('ramp', ramp.id, null, cutOutline('union', parts[0] ?? [], parts.slice(1)))
  }
  // A room marked as a void has no floor. A zone's floor is its room's (CNT-8): it is no void, and
  // it is not sunk, of its own.
  for (const room of slice.rooms) {
    if (room.void !== true || broken.has(room.id) || floorOf(room) !== floor.id || isZone(floor.id, room.id)) continue
    add('void', room.id, room.id, roomPieces(room, index))
  }

  // A room whose floor lies below its storey's has its own slab, lower down.
  const sunken: SunkenSlab[] = []
  for (const room of slice.rooms) {
    if (broken.has(room.id) || room.void === true || isZone(floor.id, room.id)) continue
    const offset = roomFloorOffset(room)
    if (!(offset < -tolerance('sameFloorLevel'))) continue
    const shape = roomPieces(room, index)
    const pieces = shape === null ? null : cutOutline('intersection', own.pieces, [shape])
    if (pieces !== null && pieces.length > 0) sunken.push({ room: room.id, offset, pieces })
  }

  const body = sunken.length === 0 ? own.pieces : cutOutline('difference', own.pieces, sunken.map((s) => s.pieces)) ?? own.pieces
  const pieces = openings.length === 0 ? body : cutOutline('difference', body, openings.map((o) => o.pieces)) ?? body
  return { kind: base ? 'base' : 'floor', top, thickness, thicknessStated: stated, body, pieces, area: multiArea(pieces), openings, sunken }
}

/** A ceiling piece: flat, at its height above the room's floor. */
export interface CeilingPiece {
  /** `null` for the ceiling itself, else the lowered zone's name, or its number from 1 when it states none. */
  readonly zone: string | null
  readonly height: number
  readonly pieces: MultiPolygon
  readonly area: number
}

/**
 * A room's ceiling (LVL-4), when it states one: the room's footprint at `height` above its floor,
 * less each lowered zone, and each zone, inside the room, at its own height. `height` is the room's
 * stated height, else `storeyHeight` less its floor offset. Null when the room states no ceiling or
 * cannot be drawn. A zone that lies wholly outside the room is left out. Null, too, for a zone of a
 * room (CNT-8, `partOf`): the ceiling over it is its room's, so it has none of its own. Under a
 * sloped roof the floor states (LVL-6), each piece is only where the roof stands higher than it.
 */
export function roomCeiling(room: Room, index: PlanIndex, storeyHeight: number, roof: RoofShapeOverFloor | null = null): readonly CeilingPiece[] | null {
  if (room.ceiling === undefined || roomZones(index).zoneOf.has(room.id)) return null
  const footprint = roomPieces(room, index)
  if (footprint === null) return null
  const own = room.height !== undefined && Number.isFinite(room.height) && room.height > 0 ? room.height : storeyHeight - roomFloorOffset(room)
  const zones: CeilingPiece[] = []
  ;(room.ceiling.lowered ?? []).forEach((zone, i) => {
    const outline: Vec2[] = zone.points.map(([x, y]) => ({ x, y }))
    const pieces = cutOutline('intersection', footprint, [[[ringOf(outline)]]])
    if (pieces === null || pieces.length === 0) return
    zones.push({ zone: zone.name ?? String(i + 1), height: zone.height, pieces, area: multiArea(pieces) })
  })
  const rest = zones.length === 0 ? footprint : cutOutline('difference', footprint, zones.map((z) => z.pieces)) ?? footprint
  const pieces = [{ zone: null, height: own, pieces: rest, area: multiArea(rest) }, ...zones]
  if (roof === null || roof.planes.length === 0) return pieces
  // LVL-6: under a sloped roof a flat ceiling is only where the roof is higher than it; elsewhere
  // the roof's underside is the ceiling.
  const offset = roomFloorOffset(room)
  return pieces.flatMap((piece) => {
    const region = regionAtLeast(roof, piece.height + offset)
    const under = region.length < 3 ? [] : cutOutline('intersection', piece.pieces, [[[ringOf(region)]]]) ?? []
    return under.length === 0 ? [] : [{ ...piece, pieces: under, area: multiArea(under) }]
  })
}
