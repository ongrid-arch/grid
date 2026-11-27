/**
 * Data for raising the plan into volume.
 *
 * Like `floorplan.ts`, this module does NOT import Three: it returns numbers.
 * Three lives in the consumer. That keeps the geometry testable without a
 * browser, and lets a glTF exporter reuse it tomorrow without dragging the
 * whole renderer along.
 *
 * The technique: every wall is described by its ELEVATION — the rectangle you
 * would see head-on, with doors and windows as holes. The consumer extrudes it
 * by the thickness and places it in space. No boolean operations needed: the
 * opening is a hole in the outline, and Three triangulates it on extrusion.
 */

import { planInState } from './phases'
import type { FloorPlan, Opening, PlanIndex, Room, Wall } from './plan'
import { indexPlan, openingsOf } from './plan'
import type { Vec2 } from './vec2'
import { signedArea } from './vec2'
import { tolerance } from './tolerances'
import type { WallEnds } from './wall'
import { SQUARE_ENDS, openingChord, openingSpan, wallAxis, wallLength, wallParts, wallPath, wallPointAt, wallSegments } from './wall'
import { curveStationsBetween, wallCurve } from './arc'
import { cross, dot, fromTuple, normalize, sub } from './vec2'
import { wallJoints } from './joints'
import type { WallExposure } from './exposure'
import { tryRoomShape } from './room'
import { roomZones } from './zones'
import { roomFloorOffset } from './steps'
import { wallExposure } from './exposure'
import { wallRevision } from './revision'
import type { Bounds } from './floorplan'
import { computeBounds } from './floorplan'
import type { Issue } from './validate'
import { brokenOnFloor, validatePlan } from './validate'
import type { StairLayout } from './stairs'
import { planStairs } from './stairs'
import { floorElevations } from './elevations'
import { planFloors, wholePlan } from './floors'
import { wholeWall } from './through'
import { columnFootprint, columnPart, columnRise, soundColumns } from './columns'
import { isItemKind, itemRoom, itemSolid, roomShapes, type ItemBlock } from './items'
import { floorEnvelope, type FloorRoof } from './envelope'
import { outdoorKind, outdoorRoofed } from './outdoor'
import type { OutdoorKind } from '../types/floorplan'
import { wallTopProfile, type RoofPlane, type WallTopPoint } from './roofs'
import { piecesAsRings } from './polygons'
import type { MultiPolygon } from 'polygon-clipping'
import type { OpeningKind } from '../types/floorplan'
import type { OpeningPartKind } from './openingParts'
import { openingParts } from './openingParts'
import { statedKind } from './openingKinds'
import { openingGlazed, wallGlazed } from './partTypes'

/** A point in model space: XY is the plan, Z is height. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The wall seen head-on, in local coordinates:
 *   u = distance along the wall from `start`
 *   v = height above the floor
 *
 * The outline winds counter-clockwise and the holes wind clockwise. That
 * inversion is not a detail: if the holes wind the same way as the outline,
 * they do not open. It is the classic mistake with this technique, which is
 * why a test compares the signs of the areas.
 */
export interface WallElevation {
  readonly wallId: string
  readonly outline: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
  /** Extrusion depth. */
  readonly thickness: number
  readonly length: number
  readonly height: number
  /**
   * How far each face reaches past the ends of the axis where the wall meets others (SHT-2):
   * the outline is the wall's elevation on its axis, and each face's ends move by these to
   * the joint (`alongFace`). Zero at an end cut square.
   */
  readonly ends: WallEnds
}

/**
 * Where a point of the elevation at `u` lies along the wall on one of its faces, once the
 * corners are joined: a point at either end of the wall moves with that face's end. `left` is
 * the face the wall's normal points at, the one at `−across`.
 */
export function alongFace(elevation: WallElevation, u: number, face: 'left' | 'right'): number {
  if (u <= 0) return u - elevation.ends.start[face]
  if (u >= elevation.length) return u + elevation.ends.end[face]
  return u
}

/**
 * How the elevation is planted in space.
 *
 * The three vectors are orthonormal and form the wall's basis: the consumer
 * uses them to build the matrix that takes local coordinates (u, v, thickness)
 * into the world. They are in MODEL coordinates (Z up); converting to Three's
 * convention (Y up) is the consumer's job.
 */
export interface WallBasis {
  /** The wall's `start` point, at floor level. */
  readonly origin: Vec3
  /** Where u grows. */
  readonly along: Vec3
  /** Where v grows. Always (0, 0, 1). */
  readonly up: Vec3
  /**
   * Where the thickness grows. The extrusion is centered on the axis, so the
   * side is geometrically irrelevant — what matters is that
   * `along × up = across`, i.e. that the basis is right-handed. Using the
   * normal from `wallFaces()` here would mirror the basis and leave the
   * extrusion with its normals inside out (the wall would look black).
   */
  readonly across: Vec3
}

export interface SceneWall {
  readonly id: string
  readonly elevation: WallElevation
  readonly basis: WallBasis
  /** Derived from the geometry: how many rooms it borders. */
  readonly exposure: WallExposure
  /**
   * Changes only when this wall's shape does. The consumer keeps its built
   * mesh while the revision holds, instead of retriangulating an extrusion and
   * re-uploading it on every write to the plan file.
   */
  readonly revision: string
  /**
   * CNT-18: a curved wall, raised as straight pieces that follow its curve: each a flat prism
   * of its own, mitred to the next, solid between openings and a lintel or a sill over each.
   * A consumer raises these and not `elevation`, which is then the wall unrolled along its
   * curve (its holes where its openings are, for measuring). Absent for a straight wall.
   */
  readonly pieces?: readonly SceneWallPiece[]
  /** VEW-78: the wall's type is glass (`wallGlazed`): a curtain wall or a glazed partition. */
  readonly glazed?: true
}

/** One straight piece of a curved wall in 3D (CNT-18): a rectangle on its own basis, no holes. */
export interface SceneWallPiece {
  readonly elevation: WallElevation
  readonly basis: WallBasis
}

/**
 * The slab under one room — the floor surface it stands on.
 *
 * Named "slab", not "floor", because a floor plan's `floor` is a storey (C5).
 * One SceneSlab per room; a storey's worth of them is what a 3D scene draws.
 */
export interface SceneSlab {
  readonly roomId: string
  readonly name: string
  /** Polygon on the model's XY plane, at z = 0. */
  readonly polygon: readonly Vec2[]
  /** The room's holes (ARE-6), clockwise: the floor is open there. Empty for a room with none. */
  readonly holes: readonly (readonly Vec2[])[]
  /**
   * How far the room's floor stands above its storey's floor level, in metres (LVL-7), when it
   * states an offset other than 0; absent, it stands on the storey's floor. The slab's top is at
   * this height, and a raised room's slab is solid down to the storey's floor, so a stage reads
   * as a platform.
   */
  readonly offset?: number
  /** CNT-7 (C26): on an outdoor space only, its kind and whether a roof covers it (lab EL-18). */
  readonly outdoor?: { readonly kind: OutdoorKind; readonly roofed: boolean }
}

/**
 * A dividing line (a virtual wall): no substance to raise, so the scene draws it on the
 * floor, between the slabs of the rooms either side, which meet on it.
 */
export interface SceneDivider {
  readonly wallId: string
  /** The wall's axis on the model's XY plane, at z = 0. */
  readonly from: Vec2
  readonly to: Vec2
  /** CNT-18: a curved dividing line's axis by its stations, from `from` to `to`; absent when straight. */
  readonly path?: readonly Vec2[]
}

/** One block of a stair: a tread or a landing, solid from the stair's foot to its top (LVL-3). */
export interface SceneStairBlock {
  /** On the model's XY plane, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Heights above the storey's floor level, in metres. */
  readonly bottom: number
  readonly top: number
}

/**
 * A stair the plan states, in the scene of the floor it rises from (LVL-3): one block per tread
 * and per landing, each standing on the floor at the stair's foot and as high as the riser it
 * tops. The last riser rises onto the floor above, which is that storey's own slab.
 */
export interface SceneStair {
  readonly id: string
  readonly name: string
  readonly blocks: readonly SceneStairBlock[]
}

/** A laid-out stair as blocks, with heights from `floorLevel`, the level of the storey it rises from. */
export function stairBlocks(stair: StairLayout, floorLevel: number): SceneStair {
  const base = stair.lower.level - floorLevel
  const blocks: SceneStairBlock[] = []
  for (const flight of stair.flights) {
    for (let k = 0; k + 1 < flight.riserLines.length; k++) {
      const [a, b] = flight.riserLines[k]!
      const [c, d] = flight.riserLines[k + 1]!
      // Left to right across the flight, looking up it: counter-clockwise is right, up, left, down.
      blocks.push({ outline: [b, d, c, a], bottom: base, top: base + (flight.risersBelow + k + 1) * stair.riserHeight })
    }
  }
  for (const landing of stair.landings) {
    blocks.push({ outline: landing.outline, bottom: base, top: base + landing.risersBelow * stair.riserHeight })
  }
  return { id: stair.id, name: stair.name, blocks }
}

/** A piece of a flat solid on the plan: its outline counter-clockwise, its holes clockwise. */
export interface ScenePiece {
  readonly outline: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
  /**
   * LVL-6: a piece of a sloped roof is not level: its bottom and its top are raised, over each
   * point, by this plane's height there (`z0 + gx·x + gy·y`), so the piece lies on the roof's
   * slope, as thick as the solid. Absent on a level piece.
   */
  readonly rise?: RoofPlane
}

/**
 * A flat solid of the building's shell (LVL-4): pieces on the plan, solid between two heights,
 * in metres above the storey's floor level.
 */
export interface SceneSolid {
  readonly pieces: readonly ScenePiece[]
  readonly bottom: number
  readonly top: number
}

/**
 * What closes a storey (LVL-4): the slab it stands on, from its outline, open over its stairs,
 * lifts and voids (`envelope.ts`), and the roof over every part of it with nothing above, with its
 * parapet. Heights are the storey's own, so the slab lies under z = 0 and fills the space between
 * this storey and the one below it when the two are stacked.
 */
export interface SceneShell {
  readonly floor: string
  /** The slab, then a piece lower down under each room whose floor is set below the storey's. */
  readonly slab: readonly SceneSolid[]
  readonly roof: SceneSolid | null
  readonly parapet: SceneSolid | null
}

const scenePieces = (pieces: MultiPolygon): ScenePiece[] => piecesAsRings(pieces)

/**
 * The shell of the storey `plan` is, or of the only floor of a plan that is no slice (LVL-4). Null
 * for a plan of several floors that is no slice: its floors would all stand at z = 0 (C5), and a
 * slab or a roof can only be placed on one.
 */
export function sceneShell(plan: FloorPlan): SceneShell | null {
  const { whole, floor } = wholePlan(plan)
  const floors = planFloors(whole)
  const id = floor ?? (floors.length === 1 ? floors[0]!.id : null)
  if (id === null) return null
  const elevations = floorElevations(whole)
  const envelope = floorEnvelope(whole, id, elevations)
  if (envelope === null) return null
  const base = elevations.floors.get(id)?.floorLevel ?? 0
  const slab: SceneSolid[] = []
  if (envelope.slab !== null) {
    const { thickness } = envelope.slab
    if (envelope.slab.pieces.length > 0 && thickness > 0) slab.push({ pieces: scenePieces(envelope.slab.pieces), bottom: -thickness, top: 0 })
    for (const sunk of envelope.slab.sunken) {
      if (thickness > 0) slab.push({ pieces: scenePieces(sunk.pieces), bottom: sunk.offset - thickness, top: sunk.offset })
    }
  }
  const roof = envelope.roof
  const roofSolid: SceneSolid | null = roof === null ? null : roofSolidOf(roof, base)
  const parapet: SceneSolid | null =
    roof?.parapet == null || roofSolid === null
      ? null
      : { pieces: scenePieces(roof.parapet.pieces), bottom: roofSolid.top, top: roofSolid.top + roof.parapet.height }
  return { floor: id, slab, roof: roofSolid, parapet }
}

/** CNT-14: one box of a door or window (its frame, a leaf or its glass) on the plan, solid between two heights above the storey's floor. */
export interface SceneOpeningPart {
  readonly part: OpeningPartKind
  /** On the model's XY plane, counter-clockwise. */
  readonly outline: readonly Vec2[]
  readonly bottom: number
  readonly top: number
}

/**
 * CNT-14: a door or window in 3D, its frame, leaves and glass (`openingParts`), its leaves closed
 * and hung from the face of the wall the door opens toward. A doorless opening has none.
 */
export interface SceneOpening {
  readonly id: string
  readonly wallId: string
  readonly type: 'door' | 'window'
  /** Its kind as the plan states it, or null (a door then is one swinging leaf). */
  readonly kind: OpeningKind | null
  readonly parts: readonly SceneOpeningPart[]
  /**
   * VEW-78: a door whose type is glazed (`openingGlazed`): its leaves are glass in their frame.
   * Absent for a door that is not and for every window, whose glass is its `glass` parts.
   */
  readonly glazed?: true
}

/** CNT-14: a door's or window's boxes on the plan, from its wall's terms (`openingParts`). */
export function sceneOpening(opening: Opening, wall: Wall): SceneOpening | null {
  if (opening.type === 'opening') return null
  const parts = openingParts(opening, wall)
  if (parts.length === 0) return null
  // CNT-18: in a curved wall the hole is the straight chord between the opening's edges (C21), so
  // the parts stand square to it, their places along the curve drawn in to the chord.
  const span = openingSpan(opening)
  const line = wall.arc === undefined ? wallAxis(wall) : openingChord(wall, span.from, span.to)
  const from = wall.arc === undefined ? 0 : span.from
  const along = wall.arc === undefined ? 1 : line.length / (span.to - span.from)
  const point = (at: number, across: number): Vec2 => ({
    x: line.start.x + line.dir.x * (at - from) * along + line.normal.x * across,
    y: line.start.y + line.dir.y * (at - from) * along + line.normal.y * across
  })
  return {
    id: opening.id,
    wallId: wall.id,
    type: opening.type,
    kind: statedKind(opening.type, opening.kind),
    parts: parts.map((p) => ({
      part: p.part,
      // The normal is the axis turned counter-clockwise, so this order winds counter-clockwise.
      outline: [point(p.along[0], p.across[0]), point(p.along[1], p.across[0]), point(p.along[1], p.across[1]), point(p.along[0], p.across[1])],
      bottom: p.up[0],
      top: p.up[1]
    }))
  }
}

/**
 * The roof as a solid of the storey: level pieces at its underside, or (LVL-6) each plane's pieces
 * raised onto that plane, as thick as the roof.
 */
function roofSolidOf(roof: FloorRoof, base: number): SceneSolid {
  const sloped = roof.facets.some((f) => f.plane.gx !== 0 || f.plane.gy !== 0)
  if (!sloped) {
    const pieces = roof.facets.length === 1 ? roof.facets[0]!.pieces : roof.pieces
    return { pieces: scenePieces(pieces), bottom: roof.bottom - base, top: roof.bottom - base + roof.thickness }
  }
  const pieces = roof.facets.flatMap((facet) => scenePieces(facet.pieces).map((piece) => ({ ...piece, rise: facet.plane })))
  return { pieces, bottom: 0, top: roof.thickness }
}

/**
 * CNT-16: a column, raised once, whole, from its own floor's z = 0 to its top (`columnRise`): its
 * footprint, counter-clockwise, solid from `bottom` to `top`.
 */
export interface SceneColumn {
  readonly id: string
  readonly shape: 'square' | 'round'
  readonly outline: readonly Vec2[]
  readonly bottom: number
  readonly top: number
}

/**
 * CNT-42: a fixture or a piece of furniture, raised on the floor of the room it stands in as the
 * plain blocks its kind gives (`itemSolid`, the kinds registry): each block's outline,
 * counter-clockwise, solid from `bottom` to `top`, in metres above its storey's z = 0.
 */
export interface SceneItem {
  readonly id: string
  readonly kind: string
  readonly blocks: readonly ItemBlock[]
}

export interface Scene3D {
  readonly walls: readonly SceneWall[]
  /** CNT-14: the frames, leaves and glass of the doors and windows the walls hold. */
  readonly openings: readonly SceneOpening[]
  readonly slabs: readonly SceneSlab[]
  readonly dividers: readonly SceneDivider[]
  /** The stairs that rise from this floor (LVL-3); empty when the plan states none. */
  readonly stairs: readonly SceneStair[]
  /** CNT-16: the columns raised from this floor, each once, whole; `buildScene` always gives the list, empty when the plan states none. */
  readonly columns?: readonly SceneColumn[]
  /** CNT-42: the items standing on this floor, each by its kind's blocks; `buildScene` always gives the list, empty when the plan states none. */
  readonly items?: readonly SceneItem[]
  /** The slab under this floor and the roof over its parts with nothing above (LVL-4), or null. */
  readonly shell: SceneShell | null
  /** Plan envelope, for framing the camera. */
  readonly bounds: Bounds
  /** Height of the tallest wall. */
  readonly height: number
  readonly issues: readonly Issue[]
}

/**
 * The opening rectangle in local coordinates, winding clockwise.
 *
 * The order of the points is deliberate: up the left edge, across the top and
 * down the right. That yields a negative area, opposite to the outline's.
 */
function holeFrom(opening: Opening): Vec2[] {
  const span = openingSpan(opening)
  const top = opening.sill + opening.height
  return [
    { x: span.from, y: opening.sill },
    { x: span.from, y: top },
    { x: span.to, y: top },
    { x: span.to, y: opening.sill }
  ]
}

/**
 * The wall elevation, with its holes.
 *
 * Returns `null` for a virtual wall: there is no substance to raise.
 */
export function wallElevation(
  wall: Wall,
  openings: readonly Opening[] = [],
  ends: WallEnds = SQUARE_ENDS,
  top: readonly WallTopPoint[] | null = null
): WallElevation | null {
  if (wall.virtual) return null

  const length = wallLength(wall)

  // Counter-clockwise, starting at the foot of `start`. LVL-6: a wall the roof cuts has the top the
  // roof leaves it (`wallTopProfile`), walked back from the far end.
  const outline: Vec2[] =
    top === null
      ? [
          { x: 0, y: 0 },
          { x: length, y: 0 },
          { x: length, y: wall.height },
          { x: 0, y: wall.height }
        ]
      : [{ x: 0, y: 0 }, { x: length, y: 0 }, ...[...top].reverse().map((p) => ({ x: p.u, y: p.z }))]
  const height = top === null ? wall.height : Math.max(...top.map((p) => p.z))

  return {
    wallId: wall.id,
    outline,
    holes: openings.map(holeFrom),
    thickness: wall.thickness,
    length,
    height,
    ends
  }
}

/** The wall's orthonormal basis, in model coordinates. A curved wall's is its first piece's (CNT-18). */
export function wallBasis(wall: Wall): WallBasis {
  if (wall.arc !== undefined) {
    const first = wallSegments(wall)[0]!
    return basisOf(first.start, first.end)
  }
  const axis = wallAxis(wall)
  return {
    origin: { x: axis.start.x, y: axis.start.y, z: 0 },
    along: { x: axis.dir.x, y: axis.dir.y, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    across: { x: -axis.normal.x, y: -axis.normal.y, z: 0 }
  }
}

function basisOf(from: Vec2, to: Vec2): WallBasis {
  const dir = normalize(sub(to, from))
  return {
    origin: { x: from.x, y: from.y, z: 0 },
    along: { x: dir.x, y: dir.y, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    across: { x: dir.y, y: -dir.x, z: 0 }
  }
}

/**
 * A curved wall's straight pieces in 3D (CNT-18). Each run of `wallParts` is followed by chords:
 * a solid run by its stations, an opening's lintel and sill by the one chord its hole is, so the
 * hole stays straight. Where two chords meet, both are mitred on the line that halves the turn,
 * so their faces meet edge to edge; at an end of the wall, the joint's reach is taken along the
 * end chord.
 */
export function curvedWallPieces(wall: Wall, openings: readonly Opening[] = [], ends: WallEnds = SQUARE_ENDS): SceneWallPiece[] {
  const curve = wallCurve(wall)
  if (curve === null || wall.virtual) return []
  const parts = wallParts(wall, openings)
  // Every chord, by where it runs along the curve; a lintel and its sill share theirs.
  const runs: { from: number; to: number; zFrom: number; zTo: number }[] = []
  for (const part of parts) {
    const stations = part.kind === 'solid' ? curveStationsBetween(curve, part.from, part.to) : [part.from, part.to]
    for (let k = 0; k + 1 < stations.length; k++) runs.push({ from: stations[k]!, to: stations[k + 1]!, zFrom: part.zFrom, zTo: part.zTo })
  }
  const breaks = [...new Set(runs.flatMap((run) => [run.from, run.to]))].sort((a, b) => a - b)
  const point = (s: number): Vec2 => wallPointAt(wall, s)
  const none = tolerance('noLength')
  const chordAt = (from: number): Vec2 | null => {
    const i = breaks.findIndex((b) => Math.abs(b - from) <= none)
    if (i < 0) return null
    const next = breaks[i + 1] ?? (curve.closed ? breaks[1] : undefined)
    if (next === undefined) return null
    const to = next < from ? next + curve.length : next
    return normalize(sub(point(to), point(from)))
  }
  const chordTo = (to: number): Vec2 | null => {
    const i = breaks.findIndex((b) => Math.abs(b - to) <= none)
    if (i < 0) return null
    const prev = i > 0 ? breaks[i - 1] : curve.closed ? breaks[breaks.length - 2] : undefined
    if (prev === undefined) return null
    return normalize(sub(point(to), point(prev > to ? prev - curve.length : prev)))
  }
  const half = wall.thickness / 2
  const mitre = (a: Vec2 | null, b: Vec2 | null): { left: number; right: number } => {
    if (a === null || b === null) return { left: 0, right: 0 }
    const reach = half * Math.tan(Math.atan2(cross(a, b), dot(a, b)) / 2)
    return { left: -reach, right: reach }
  }
  const total = curve.length
  return runs.flatMap((run) => {
    const a = point(run.from)
    const b = point(run.to)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length <= none || run.zTo - run.zFrom <= none) return []
    const dir = normalize(sub(b, a))
    const atStart = !curve.closed && run.from <= none
    const atEnd = !curve.closed && run.to >= total - none
    const pieceEnds: WallEnds = {
      start: atStart ? ends.start : mitre(chordTo(run.from), dir),
      end: atEnd ? ends.end : mitre(dir, chordAt(run.to))
    }
    const elevation: WallElevation = {
      wallId: wall.id,
      outline: [
        { x: 0, y: run.zFrom },
        { x: length, y: run.zFrom },
        { x: length, y: run.zTo },
        { x: 0, y: run.zTo }
      ],
      holes: [],
      thickness: wall.thickness,
      length,
      height: run.zTo - run.zFrom,
      ends: pieceEnds
    }
    return [{ elevation, basis: basisOf(a, b) }]
  })
}

/** A room's slab polygon, with its holes. The same ones the plan view draws. */
export function roomSlab(room: Room, index: PlanIndex): SceneSlab | null {
  const shape = tryRoomShape(room, index)
  if (!shape) return null
  const offset = roomFloorOffset(room)
  const kind = outdoorKind(room)
  return {
    roomId: room.id,
    name: room.name,
    polygon: shape.polygon,
    holes: shape.holes,
    ...(offset !== 0 && { offset }),
    ...(kind === null ? {} : { outdoor: { kind, roofed: outdoorRoofed(room) === true } })
  }
}

/**
 * Elevation area with the holes taken out.
 *
 * It exists for the tests: multiplied by the thickness it gives the wall
 * volume, and that equality catches any arithmetic slip in the elevation.
 */
export function elevationArea(elevation: WallElevation): number {
  const solid = Math.abs(signedArea(elevation.outline))
  const holes = elevation.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)
  return solid - holes
}

/**
 * Builds the whole scene.
 *
 * Mirrors `buildFloorPlan()`: it leans on the same validation and skips what
 * cannot be built instead of failing.
 */
export interface SceneOptions {
  /** The shell, when the caller has worked it out already (`sceneShell`). */
  readonly shell?: SceneShell | null
}

export function buildScene(stated: FloorPlan, options: SceneOptions = {}): Scene3D {
  // CNT-10: the model is the building as it will be after the work.
  const plan = planInState(stated, 'after')
  const index = indexPlan(plan)
  const { issues, broken } = validatePlan(plan, index)

  const walls: SceneWall[] = []
  const openings: SceneOpening[] = []
  const dividers: SceneDivider[] = []
  const extent: Vec2[] = []
  let height = 0
  // The corners, joined as the drawing joins them (SHT-2).
  const joints = wallJoints(plan.walls.filter((wall) => !broken.has(wall.id)))

  for (const wall of plan.walls) {
    if (broken.has(wall.id)) continue

    const path = wallPath(wall)
    extent.push(...path)
    if (wall.virtual) {
      const [from, to] = [fromTuple(wall.start), fromTuple(wall.end)]
      dividers.push({ wallId: wall.id, from, to, ...(wall.arc !== undefined && { path }) })
      continue
    }

    // LVL-5 (C19): a wall through floors is raised once, whole, from its own floor, with its
    // openings as stated; on the floors above it is there already.
    const whole = wholeWall(wall, openingsOf(index, wall.id).filter((o) => !broken.has(o.id)))
    if (whole === null) continue
    const usable = whole.openings
    const ends = joints.get(wall.id)
    const top = whole.wall === wall ? wallTopProfile(plan, wall) : null
    const elevation = wallElevation(whole.wall, usable, ends, top)
    if (!elevation) continue

    walls.push({
      id: wall.id,
      elevation,
      basis: wallBasis(wall),
      exposure: wallExposure(index, wall.id),
      revision: wallRevision(whole.wall, usable, ends, top),
      ...(wall.arc !== undefined && { pieces: curvedWallPieces(whole.wall, usable, ends) }),
      ...(wallGlazed(plan, wall) && { glazed: true as const })
    })
    if (elevation.height > height) height = elevation.height
    for (const opening of usable) {
      const parts = sceneOpening(opening, wall)
      if (parts !== null) openings.push(parts.type === 'door' && openingGlazed(plan, opening) ? { ...parts, glazed: true } : parts)
    }
  }

  const slabs: SceneSlab[] = []
  // A zone's floor is its room's (CNT-8): one slab, the room's.
  const zones = roomZones(index)
  for (const room of plan.rooms) {
    if (broken.has(room.id) || zones.zoneOf.has(room.id)) continue
    const slab = roomSlab(room, index)
    if (!slab) continue
    slabs.push(slab)
    extent.push(...slab.polygon)
  }

  // The stairs that rise from this floor, read from the plan it was cut from (LVL-3). A plan that
  // is no slice draws every stair, each rising from its lower floor's z = 0, as its walls do (C5).
  const stairs: SceneStair[] = []
  if ((plan.stairs ?? []).length > 0) {
    const { whole, floor } = wholePlan(plan)
    const levels = floorElevations(whole).floors
    for (const stair of planStairs(plan, floor === null ? () => broken : brokenOnFloor).stairs) {
      if (floor !== null && stair.lower.floor !== floor) continue
      const scene = stairBlocks(stair, levels.get(stair.lower.floor)?.floorLevel ?? 0)
      stairs.push(scene)
      for (const block of scene.blocks) extent.push(...block.outline)
    }
  }

  // CNT-16: each column standing here, raised once from its own floor; on a floor above, where a
  // column through floors has been raised already, nothing.
  const columns: SceneColumn[] = []
  if ((plan.columns ?? []).length > 0) {
    const { whole } = wholePlan(plan)
    for (const column of soundColumns(plan)) {
      const part = columnPart(column)
      if (part !== null && !part.base) continue
      const top = columnRise(whole, part?.whole ?? column)
      if (!(top > 0)) continue
      columns.push({ id: column.id, shape: column.shape, outline: columnFootprint(column), bottom: 0, top })
    }
  }

  // CNT-42: each item Grid can draw, raised from the floor of the room it stands in.
  const items: SceneItem[] = []
  const placed = (plan.items ?? []).filter((item) => !broken.has(item.id) && isItemKind(item.kind))
  if (placed.length > 0) {
    const rooms = roomShapes(index, broken)
    for (const item of placed) {
      const room = itemRoom(item, rooms)
      const lift = room === null ? 0 : roomFloorOffset(room)
      const blocks = itemSolid(item).map((b) => ({ outline: b.outline, bottom: b.bottom + lift, top: b.top + lift }))
      if (blocks.length > 0) items.push({ id: item.id, kind: item.kind, blocks })
    }
  }

  // The bounds stay the walls' axes and the rooms, as before: the shell reaches out to the walls'
  // faces, which the bounds do not frame either.
  const shell = options.shell !== undefined ? options.shell : sceneShell(plan)

  // CNT-14: the doors and windows in the plan's order, as the exports list every other part.
  const order = new Map(plan.openings.map((o, i) => [o.id, i] as const))
  openings.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  return { walls, openings, slabs, dividers, stairs, columns, items, shell, bounds: computeBounds(extent), height, issues }
}
