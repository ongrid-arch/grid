/**
 * LVL-9: a section along a line, drawn from the model (lab SE-5, N-section).
 *
 * A section is a vertical cut along a line on the plan, looking to one side of it. Everything it
 * shows is the model's own, the same the 3D view, the IFC and the take-off read:
 *
 * - the walls, split into what has substance (`wallParts`: runs, and the sill and lintel round each
 *   door and window), with their corners joined as the plan joins them (`wallJoints`). Under another
 *   floor a storey's top is that floor's slab: a full-height wall that stops short of it, or of
 *   the flat roof Grid lays, rises to it (`wallTopsUnder`, VEW-33), and the strip it adds is listed;
 * - the slabs, the roofs and the parapets (`planEnvelope`, LVL-4), open over stairs, lifts and voids.
 *   LVL-20: a sloped roof the floor states (LVL-6) is cut along its slopes and its dormers, as thick
 *   as Grid takes a roof, and the walls under it are cut, and seen, up to the top the roof leaves
 *   them (`wallTopProfile`): an outside wall rises to it, so a gable end is closed. The rooms under
 *   it are given their headroom along the line (`headroom`);
 * - the stairs the plan states (LVL-3), as they are built (VEW-11, `stairSection.ts`): each flight
 *   its treads and risers over a waist with the soffit beneath, each landing a slab, nothing
 *   solid down to the floor the stair leaves;
 * - the floor of each raised room (LVL-7), solid from its storey's floor up;
 * - the ground the site states (LVL-4), and which side of each cut wall is outside (MSG-13, CNT-3);
 *   CNT-49: on a slope the ground along the line is sloped (`ground.fall`, read with
 *   `sectionGroundAt`), and the earth, the ground line and the walls holding it back follow it;
 * - VEW-65: the earth under the ground, in the cut, less the building's part below the ground, so a
 *   basement stands in its hole, the walls cut below the ground with the outside on one face holding
 *   it back (`retaining`); `sectionEarth` runs it, and the ground line, out to a picture's edges;
 * - the plinth under a floor on the ground whose slab stands clear of that ground (VEW-16,
 *   `plinthUnder`): its outside walls carried down to the ground, the band they stand on
 *   (`outerWallBand`) from the ground up to the slab, cut and seen beyond. The ground line runs on
 *   under such a floor, so its plinths stand on it.
 *
 * The section's own coordinates: `x` runs across the picture from its left, along the line, as a
 * person standing on the line and looking toward the chosen side sees it; `y` is the height, in
 * metres from the ground floor's floor level, the datum of a floor's `elevation` (C5). Every point
 * is rounded to `shellGrid`, so a wall standing on a slab touches it, and the cut parts join into
 * connected shapes (SE-5: not a rectangle per wall).
 *
 * What lies beyond the cut is given as faces, each with how far beyond it is: the faces of walls,
 * slab edges (only where the slab's thickness is stated, VEW-29), roof edges and stairs (a flight's sides as its profile) that face the person looking, as seen on the cut, with
 * their doors and windows open. Drawn from the farthest to the nearest, each over the last, they
 * hide what lies behind them; a face seen edge-on is a line (a corner).
 *
 * What the plan does not state and Grid takes is listed (`assumed`), and the cut parts it is about
 * are given to be marked, tinted and dashed, never hatched: a slab whose thickness is not stated, every roof, a wall whose height
 * nothing states or that the plan marks assumed. Levels worked out from the floors below, a ground
 * level the site does not state, room heights taken from the storey and stair rooms with no stated
 * stair are listed too, not hatched.
 *
 * Pure, total and never throws: a part that cannot be worked out is left out, as the plan view
 * leaves it out.
 */

import { planInState } from './phases'
import { floorRoofShape, headroomBands, planeAt, risesToRoof, roomHeadroom, topAt, undersideAlong, wallTopProfile, type RoofPlane, type RoofShapeOverFloor, type WallTopPoint } from './roofs'
import { wallTypeOf } from './partTypes'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import { heightByDefault } from '../types/floorplan'
import type { Floor, FloorPlan, RoofShape, Wall } from './plan'
import { indexPlan, openingsOf } from './plan'
import { floorOf, planFloors, planForFloor } from './floors'
import { wholeWall } from './through'
import { floorElevations, isFiniteWall, wallTopsUnder, type WallTopUnder } from './elevations'
import { planEnvelope } from './envelope'
import { KEPT_DRAWN, keptIn } from './kept'
import { groundLevel, plinthUnder } from './ground'
import { floorWalls, outerWallBand } from './areas'
import { wallJoints } from './joints'
import { SQUARE_ENDS, wallAxis, wallParts, wallPointAt, wallSegments, wallSlicePolygon, pointAlong } from './wall'
import { brokenOnFloor } from './validate'
import { planStairs } from './stairs'
import { flightProfile, landingLevels, profileRing, stairWaist, type FlightProfile } from './stairSection'
import { tryRoomShape } from './room'
import { outdoorRoofed } from './outdoor'
import { roomFloorOffset } from './steps'
import { isItemKind, itemRoom, itemSolid, roomShapes } from './items'
import { roomZones } from './zones'
import { planWallSides, stretchAt } from './exposure'
import { planMarks } from './marks'
import { cutOutline, inPieces, piecesAsRings, ringOf, union } from './polygons'
import { limit, tolerance } from './tolerances'
import { metresText } from './rounding'
import { METRES, showLength, type Display } from '../types/units'
import type { Vec2 } from './vec2'
import { add, dot, length, perp, scale, signedArea, sub } from './vec2'
import type { Bounds } from './floorplan'
import { english, joined as joinedValues, name, num, said, withSentence, type Name, type Said, type Value } from '../messages/say'

/** Which side of the line the section looks toward, walking from its first point to its second. */
export type SectionToward = 'left' | 'right'

/** Where a section is cut: a line on the plan, and the side it looks toward. */
export interface SectionLine {
  readonly from: Vec2
  readonly to: Vec2
  readonly toward: SectionToward
}

/** A piece of the section: its outline counter-clockwise, its holes clockwise. `x` across, `y` up. */
export interface SectionPiece {
  readonly outline: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
}

export type SectionPartKind = 'wall' | 'slab' | 'roof' | 'parapet' | 'stair' | 'floor' | 'plinth' | 'item'

/** One part of the model the line cuts, as rectangles (a wall, a slab) or blocks (a stair). */
export interface SectionPart {
  readonly kind: SectionPartKind
  /** The wall's or the stair's id, the floor's for a slab, roof, parapet or plinth, the room's for a raised floor, the item's for an item. */
  readonly id: string
  readonly floor: string
  /** The rectangles it is cut into along the line, each counter-clockwise. */
  readonly rings: readonly (readonly Vec2[])[]
  /**
   * For a wall: which side of it, across the section, is outside where the line cuts it (MSG-13: a
   * room on one face only); null where it has rooms on both faces, or none.
   */
  readonly outside?: 'left' | 'right' | null
  /** VEW-23: for a wall: its type is glazed, so it is cut as glass in a frame, not as solid. */
  readonly glazed?: true
  /** VEW-65: for a wall: it is cut below the ground with the outside on one face, so it holds the earth back. */
  readonly retaining?: true
}

/**
 * VEW-65: the earth in the cut, under the ground line. The building's own part below the ground
 * (`dug`) is left out of it: a basement stands in its hole.
 */
export interface SectionEarth {
  /** Its lowest level: `sectionEarthBelow` under the lowest thing cut under the ground, or under the ground. */
  readonly bottom: number
  /** The earth from x = 0 to the line's length, from `bottom` up to the ground, less `dug`. */
  readonly pieces: readonly SectionPiece[]
  /**
   * The building below the ground: along the line, from the lowest foot of the floors standing
   * there (a slab's underside, a sunken room's) up to the highest top of their storeys, cut off at
   * the ground, with every cut part below it.
   */
  readonly dug: readonly SectionPiece[]
  /** Whether each end of the line is clear of `dug`, so the earth and the ground line may run on past it. */
  readonly open: { readonly start: boolean; readonly end: boolean }
}

export type SectionFaceKind = 'wall' | 'slab' | 'roof' | 'parapet' | 'stair' | 'plinth' | 'item'

/** A face beyond the cut that faces the person looking: a piece to paint over what lies behind it. */
export interface SectionFace {
  readonly kind: SectionFaceKind
  readonly id: string
  readonly floor: string
  /** How far beyond the cut it is, in metres: the farthest are drawn first. */
  readonly depth: number
  /** The face with its doors and windows open; a face seen edge-on is one line, its `edge`. */
  readonly pieces: readonly SectionPiece[]
  readonly edge: readonly [Vec2, Vec2] | null
}

/** Where a level stands, and whether the plan says so. */
export interface SectionLevel {
  readonly floor: string
  readonly name: string
  /** The top of the floor's slab, in metres from the ground floor's floor level. */
  readonly level: number
  /**
   * `stated`: the floor states its elevation. `datum`: the lowest floor at or above 0, which stands
   * at 0 by the rule floors are stacked by. `worked-out`: from the floors below it, their heights
   * and their slabs.
   */
  readonly source: 'stated' | 'datum' | 'worked-out'
  /**
   * VEW-84: where the floor stands across the section, its cut parts and rooms from `from` to `to`;
   * left out when the line cuts nothing of it. Its level mark is drawn beside the nearer end of it.
   */
  readonly from?: number
  readonly to?: number
}

/** VEW-84: how far across the section something drawn stands, from `from` to `to`. */
export interface SectionSpan {
  readonly from: number
  readonly to: number
}

/** A room the line crosses, with its floor and its height. */
export interface SectionRoom {
  readonly room: string
  readonly floor: string
  readonly name: string
  /** Where the line crosses it longest, across the section. */
  readonly from: number
  readonly to: number
  /** Its floor's level: its storey's, and its own offset (LVL-7). */
  readonly floorLevel: number
  /**
   * Floor to ceiling: its stated `height` (ARE-10), else up to the slab or roof over its storey;
   * under a void, up through it to what is over the void (VEW-34).
   */
  readonly height: number
  readonly heightStated: boolean
  /**
   * VEW-56: the room has no ceiling to read a height from: an open-air outdoor space or a void.
   * The picture names it and writes no height.
   */
  readonly open?: true
  /**
   * VEW-34: the rooms marked as voids it rises through, lowest first, when it states no height and
   * a void is over most of it on the line; `from` and `to` are then where it stands under them.
   */
  readonly through?: readonly string[]
  /**
   * LVL-20: under a sloped roof the floor states, the stretches across the section where the room
   * has at least each of Grid's headroom bands (`headroomBands`) over its floor, lowest band first.
   */
  readonly headroom?: readonly SectionHeadroom[]
}

/** LVL-20: a stretch of a room's floor on the line with at least `height` over it. */
export interface SectionHeadroom {
  readonly height: number
  readonly from: number
  readonly to: number
}

/** The top of a roof the line cuts; LVL-20: and, for a roof the floor states, its shape and levels. */
export interface SectionRoof {
  readonly floor: string
  /** The highest point of the roof's cut, in metres from the datum. */
  readonly level: number
  readonly shape?: RoofShape
  /** The pitch in degrees; 0 on a flat roof. */
  readonly pitch?: number
  /** The underside's levels at the eaves and at its top (the ridge, or a flat roof's eaves). */
  readonly eaves?: number
  readonly ridge?: number
  /** VEW-84: where the roof's cut stands across the section. */
  readonly from: number
  readonly to: number
  /** VEW-84: the top of the parapet cut on it, when the line cuts one. */
  readonly parapet?: number
}

export type SectionAssumptionKind = 'slab' | 'roof' | 'wall-height' | 'wall-top' | 'wall-roof' | 'marked' | 'ground' | 'level' | 'room-height' | 'no-stair' | 'risers' | 'waist'

/** Something the section takes that the plan does not state. */
export interface SectionAssumption {
  readonly kind: SectionAssumptionKind
  /** What it is about: floor, wall, room or stair ids. */
  readonly ids: readonly string[]
  /** In a sentence, for the list under the drawing: its English. */
  readonly words: string
  /** MSG-11: the same sentence by key and values, to say in another language. Not enumerable. */
  readonly said?: Said
  /** Whether its cut parts are marked on the drawing (`pieces`), tinted and dashed, never hatched: a hatch reads as a material. A level, a height or a ground is listed only. */
  readonly hatched: boolean
  /** The cut parts it is about, joined; empty when it is not hatched. */
  readonly pieces: readonly SectionPiece[]
}

export interface SectionReach {
  readonly missesBuilding: boolean
  readonly startInside: boolean
  readonly endInside: boolean
}

export interface PlanSection {
  readonly line: SectionLine
  /** The line's length, in metres: the cut runs from x = 0 to x = length. */
  readonly length: number
  /** The point of the plan at x = 0, the way x grows on the plan, and the way the section looks. */
  readonly start: Vec2
  readonly right: Vec2
  readonly look: Vec2
  /** The cut parts, joined: connected shapes, each the walls, slabs, roofs and stairs that touch. */
  readonly cut: readonly SectionPiece[]
  /** Every part cut, one by one, in plan order: walls, then slabs and roofs, then stairs. */
  readonly parts: readonly SectionPart[]
  /** VEW-23: the walls of a glazed type the line cuts, apart from `cut`: glass in a frame, never solid. */
  readonly glass: readonly SectionPart[]
  /**
   * CNT-48: the fixtures and furniture the line cuts, apart from `cut` and `parts`: each item's
   * blocks (`itemSolid`, as the 3D view stands them) on the floor of its room, one part per item.
   * Their sides beyond the cut are in `beyond`, of kind `item`.
   */
  readonly items: readonly SectionPart[]
  /** What lies beyond the cut, farthest first. */
  readonly beyond: readonly SectionFace[]
  /**
   * The ground: its level, whether the site states it, and the stretches of its line from x = 0 to
   * the line's length (VEW-65): wherever no floor stands through the ground, so under a floor that
   * stands clear of it on its plinth (VEW-16) and over a basement that lies under it. `earth` is
   * the earth below it.
   */
  readonly ground: { readonly level: number; readonly stated: boolean; readonly segments: readonly (readonly [number, number])[]; readonly earth: SectionEarth; readonly fall?: SectionGroundFall }
  /** Every floor's level, lowest first. */
  readonly levels: readonly SectionLevel[]
  /** The top of each roof the line cuts, by the floor it covers. */
  readonly roofs: readonly SectionRoof[]
  /** The rooms the line crosses, floor by floor. */
  readonly rooms: readonly SectionRoom[]
  /**
   * VEW-38: where the line stands against the building: `missesBuilding` when it cuts no part of
   * it, `startInside` and `endInside` when its first or last point stands inside a floor's outline,
   * so the cut stops there instead of running past the building. The picture breaks the cut at
   * such an end and says so.
   */
  readonly reach: SectionReach
  /** What the section takes that the plan does not state, in the order it is listed. */
  readonly assumed: readonly SectionAssumption[]
  /** The box round the cut, what lies beyond it and the ground line, in section coordinates. */
  readonly bounds: Bounds
  /**
   * VEW-84: how far across the section the building is drawn (its cut, glass, items and what lies
   * beyond), without the ground line; null when nothing of it is drawn. The level marks stand beside it.
   */
  readonly building: SectionSpan | null
}

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/** How a section stands on the plan: where x = 0 is, the way x grows, the way it looks, how long it is. */
export interface SectionFrame {
  readonly start: Vec2
  readonly right: Vec2
  readonly look: Vec2
  readonly length: number
}
type Frame = SectionFrame

/**
 * Facing the side looked toward, x grows to the right hand: along the line looking left of it, back
 * along it looking right.
 */
export function sectionFrame(line: SectionLine): SectionFrame {
  const dir = sub(line.to, line.from)
  const lineLength = length(dir)
  const along = lineLength > tolerance('noLength') ? scale(dir, 1 / lineLength) : { x: 1, y: 0 }
  return line.toward === 'left'
    ? { start: line.from, right: along, look: perp(along), length: lineLength }
    : { start: line.to, right: scale(along, -1), look: scale(perp(along), -1), length: lineLength }
}

const across = (frame: Frame, p: Vec2): number => dot(sub(p, frame.start), frame.right)
const beyondOf = (frame: Frame, p: Vec2): number => dot(sub(p, frame.start), frame.look)

/**
 * Where the cut line runs inside a shape of the plan (rings, even-odd), as stretches of x within
 * the line, `[0, length]` (anywhere along it, unless `clip`). A vertex on the line counts on one side only, so a corner is not crossed
 * twice.
 */
function inside(frame: Frame, rings: readonly (readonly Vec2[])[], clip = true): [number, number][] {
  const crossings: number[] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const da = beyondOf(frame, a)
      const db = beyondOf(frame, b)
      if (da > 0 === db > 0) continue
      const t = da / (da - db)
      crossings.push(across(frame, a) + (across(frame, b) - across(frame, a)) * t)
    }
  }
  crossings.sort((p, q) => p - q)
  const out: [number, number][] = []
  const none = tolerance('noLength')
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const x0 = clip ? Math.max(0, crossings[i]!) : crossings[i]!
    const x1 = clip ? Math.min(frame.length, crossings[i + 1]!) : crossings[i + 1]!
    if (x1 - x0 > none) out.push([x0, x1])
  }
  return out
}

/** Every number of the section on `shellGrid`, so parts drawn to meet do meet. */
function snapper(): (v: number) => number {
  const steps = Math.round(1 / tolerance('shellGrid'))
  return (v) => Math.round(v * steps) / steps
}

/** CNT-49: the ground along a section's line, `level = at + perMetre * x`. */
export interface SectionGroundFall {
  readonly at: number
  readonly perMetre: number
}

/** CNT-49: the ground's level at `x` along a section's line: on its slope, else its one level. */
export function sectionGroundAt(ground: Pick<PlanSection['ground'], 'level' | 'fall'>, x: number): number {
  return ground.fall === undefined ? ground.level : ground.fall.at + ground.fall.perMetre * x
}

/** CNT-49: the band from `bottom` up to the ground, `x0` to `x1`, its top following the ground. */
const underGround = (snap: (v: number) => number, x0: number, x1: number, bottom: number, groundAt: (x: number) => number): Vec2[] => [
  { x: snap(x0), y: snap(bottom) },
  { x: snap(x1), y: snap(bottom) },
  { x: snap(x1), y: snap(groundAt(x1)) },
  { x: snap(x0), y: snap(groundAt(x0)) }
]

const rect = (snap: (v: number) => number, x0: number, x1: number, y0: number, y1: number): Vec2[] => [
  { x: snap(x0), y: snap(y0) },
  { x: snap(x1), y: snap(y0) },
  { x: snap(x1), y: snap(y1) },
  { x: snap(x0), y: snap(y1) }
]

/** Rings joined into pieces; empty when there are none or the join fails. */
function joined(rings: readonly (readonly Vec2[])[]): SectionPiece[] {
  const live = rings.filter((ring) => Math.abs(signedArea(ring)) > 0)
  if (live.length === 0) return []
  const pieces = cutOutline('union', [ringOf(live[0]!)], live.slice(1).map((ring) => [ringOf(ring)]))
  if (pieces === null) return []
  // VEW-57: a hole too small to be a room is a hair between parts that almost meet.
  const hair = tolerance('sliverArea')
  return piecesAsRings(pieces).map((piece) => ({ ...piece, holes: piece.holes.filter((hole) => Math.abs(signedArea(hole)) > hair) }))
}

/**
 * VEW-57: a stair's ring whose side stands within `stairSnap` of the side of a wall or slab it
 * faces (their heights overlap) is moved onto it, so the two join. Only the stair moves.
 */
function snapToCut(ring: readonly Vec2[], others: readonly (readonly Vec2[])[]): Vec2[] {
  const reach = tolerance('stairSnap')
  const xs = ring.map((p) => p.x)
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const ys = ring.map((p) => p.y)
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  let toLo: number | null = null
  let toHi: number | null = null
  for (const other of others) {
    const oy = other.map((p) => p.y)
    if (Math.min(...oy) >= y1 || Math.max(...oy) <= y0) continue
    const ox = other.map((p) => p.x)
    const right = Math.max(...ox)
    const left = Math.min(...ox)
    if (right < lo && lo - right <= reach && (toLo === null || right > toLo)) toLo = right
    if (left > hi && left - hi <= reach && (toHi === null || left < toHi)) toHi = left
  }
  return ring.map((p) => (toLo !== null && p.x === lo ? { x: toLo, y: p.y } : toHi !== null && p.x === hi ? { x: toHi, y: p.y } : p))
}

const multiOf = (pieces: MultiPolygon): (readonly Vec2[])[] => piecesAsRings(pieces).flatMap((p) => [p.outline, ...p.holes])

/** The rings of a plan shape as one list, for `inside`. */
const ringsOf = (pieces: MultiPolygon): (readonly Vec2[])[] => multiOf(pieces)

/**
 * The section of the plan along `line`. See the module's header. Never throws: a line shorter than
 * `noLength` cuts nothing and gives an empty section.
 */
export function planSection(stated: FloorPlan, line: SectionLine): PlanSection {
  // SHT-25: kept with a frozen plan: a sheet finds its section lines, sizes each section, then draws it.
  const key = `section\u0000${line.from.x}\u0000${line.from.y}\u0000${line.to.x}\u0000${line.to.y}\u0000${line.toward}`
  return keptIn(KEPT_DRAWN, stated, key, () => workOutSection(stated, line))
}

function workOutSection(stated: FloorPlan, line: SectionLine): PlanSection {
  // CNT-10: the section is cut through the building as it will be after the work.
  const plan = planInState(stated, 'after')
  const snap = snapper()
  const frame = sectionFrame(line)
  const lineLength = frame.length

  const floors = planFloors(plan)
  const elevations = floorElevations(plan)
  const envelope = planEnvelope(plan, { elevations })
  // VEW-33: under another floor a storey's top is that floor's slab: full-height walls rise to it.
  const topUnder = wallTopsUnder(plan, envelope, elevations)
  const raisedWalls: { floor: string; wall: string; under: WallTopUnder; rings: Vec2[][] }[] = []
  // LVL-20: the outside walls cut up to the roof over them, past the heights they state.
  const roofRaised: { floor: string; wall: string; height: number; rings: Vec2[][] }[] = []
  const ground = groundLevel(plan, elevations)
  const marks = planMarks(plan)
  const parts: SectionPart[] = []
  const itemParts: SectionPart[] = []
  const faces: SectionFace[] = []
  const rooms: SectionRoom[] = []
  const notes: SectionAssumption[] = []
  const defaultHeights = new Map<string, string[]>()
  const markedWalls: string[] = []
  const squareFace = tolerance('squareCorner')
  const none = tolerance('noLength')

  // VEW-34: what stands over a point of the plan: each floor's slab (its body and sunken pieces)
  // and the voids it is open over.
  const slabsOver = envelope.floors.flatMap((shell) =>
    shell.slab === null
      ? []
      : [{ floor: shell.floor, top: shell.slab.top, pieces: [shell.slab.body, ...shell.slab.sunken.map((s) => s.pieces)], voids: shell.slab.openings.filter((o) => o.kind === 'void' && o.room !== null) }]
  )
  const pointAt = (x: number): Vec2 => add(frame.start, scale(frame.right, x))
  // CNT-49: on a slope, the ground along the line.
  const fall: SectionGroundFall | undefined =
    ground.surface === null ? undefined : { at: ground.surface.at(frame.start), perMetre: ground.surface.gradient.x * frame.right.x + ground.surface.gradient.y * frame.right.y }
  const groundAt = (x: number): number => sectionGroundAt({ level: ground.level, fall }, x)
  /**
   * A point of a floor rising through the voids over it: the lowest slab over it, above the
   * floor, open there as a void, takes it to that floor's top, and on. Null when no void is over it.
   */
  const riseAt = (from: string, p: Vec2): { top: number; through: { floor: string; room: string }[] } | null => {
    const through: { floor: string; room: string }[] = []
    let floor = from
    let top = 0
    for (let step = 0; step < slabsOver.length; step++) {
      const storey = elevations.floors.get(floor)
      if (storey === undefined) break
      const roof = envelope.floors.find((f) => f.floor === floor)?.roof
      if (roof != null && inPieces(roof.pieces, p)) break
      let over: (typeof slabsOver)[number] | null = null
      for (const slab of slabsOver) {
        if (slab.floor === floor || slab.top <= storey.floorLevel + tolerance('sameFloorLevel') || (over !== null && slab.top >= over.top)) continue
        if (slab.pieces.some((pieces) => inPieces(pieces, p))) over = slab
      }
      const open = over?.voids.find((o) => inPieces(o.pieces, p))
      const upper = over === null ? undefined : elevations.floors.get(over.floor)
      if (over === null || open === undefined || upper === undefined) break
      through.push({ floor: over.floor, room: open.room! })
      floor = over.floor
      top = upper.floorLevel + upper.clearHeight
    }
    return through.length === 0 ? null : { top, through }
  }
  /** The x where a void starts or ends along the line. */
  const voidEnds = slabsOver.flatMap((slab) => slab.voids.flatMap((o) => inside(frame, ringsOf(o.pieces)).flat()))
  /** Voids a room rises through: they are its space, and are not labelled of their own. */
  const risenVoids = new Set<string>()
  /**
   * Where a room's stretch on the line stands under a void, when that is most of it: the longest
   * run under the same voids, its top and the voids.
   */
  const underVoid = (floor: string, from: number, to: number): { from: number; to: number; top: number; through: { floor: string; room: string }[] } | null => {
    if (voidEnds.length === 0) return null
    const xs = [...new Set([from, to, ...voidEnds.filter((x) => x > from + none && x < to - none)])].sort((a, b) => a - b)
    const runs: { from: number; to: number; top: number; through: { floor: string; room: string }[] }[] = []
    let risen = 0
    for (let i = 0; i + 1 < xs.length; i++) {
      const rise = riseAt(floor, pointAt((xs[i]! + xs[i + 1]!) / 2))
      if (rise === null) continue
      risen += xs[i + 1]! - xs[i]!
      const last = runs[runs.length - 1]
      const same = last !== undefined && Math.abs(last.to - xs[i]!) <= none && Math.abs(last.top - rise.top) <= none && last.through.map((t) => t.room).join('\u0000') === rise.through.map((t) => t.room).join('\u0000')
      if (same) last.to = xs[i + 1]!
      else runs.push({ from: xs[i]!, to: xs[i + 1]!, ...rise })
    }
    if (!(risen * 2 > to - from)) return null
    return runs.reduce((best, run) => (run.to - run.from > best.to - best.from ? run : best))
  }

  /** Where a point of the plan lies along a straight wall from its start, within it. */
  const alongWall = (wall: Wall, p: Vec2): number => {
    const axis = wallAxis(wall)
    return Math.min(axis.length, Math.max(0, dot(sub(p, axis.start), axis.dir)))
  }

  /**
   * LVL-20: a wall's cut from `x0` to `x1` across the section, from `y0` up to the top its profile
   * gives where the line crosses it, turning where the top turns.
   */
  function underProfile(wall: Wall, profile: readonly WallTopPoint[], x0: number, x1: number, y0: number, base: number): Vec2[] {
    const u0 = alongWall(wall, pointAt(x0))
    const u1 = alongWall(wall, pointAt(x1))
    const xs = [x1]
    if (Math.abs(u1 - u0) > none) {
      for (const p of [...profile].reverse()) {
        if (p.u > Math.min(u0, u1) + none && p.u < Math.max(u0, u1) - none) xs.push(x0 + ((p.u - u0) / (u1 - u0)) * (x1 - x0))
      }
    }
    xs.push(x0)
    const ordered = [x1, ...xs.slice(1, -1).sort((a, b) => b - a), x0]
    const topOf = (x: number): number => Math.max(y0, base + topAt(profile, Math.abs(u1 - u0) > none ? u0 + ((x - x0) / (x1 - x0)) * (u1 - u0) : u0))
    return [{ x: snap(x0), y: snap(y0) }, { x: snap(x1), y: snap(y0) }, ...ordered.map((x) => ({ x: snap(x), y: snap(topOf(x)) }))]
  }

  /** The part of a ring above a height, as rings. */
  function above(ring: readonly Vec2[], y: number): Vec2[][] {
    const xs = ring.map((p) => p.x)
    const ys = ring.map((p) => p.y)
    const top = Math.max(...ys)
    if (!(top - y > none)) return []
    const cut = cutOutline('intersection', [ringOf(ring)], [[ringOf(rect(snap, Math.min(...xs), Math.max(...xs), y, top))]])
    return cut === null ? [] : piecesAsRings(cut).map((piece) => [...piece.outline])
  }

  /** A face of the plan, from a to b with its outside toward `outward`, standing between two heights. */
  const face = (
    kind: SectionFaceKind,
    id: string,
    floor: string,
    a: Vec2,
    b: Vec2,
    outward: Vec2,
    y0: number,
    y1: number,
    holes: readonly { readonly a: Vec2; readonly b: Vec2; readonly y0: number; readonly y1: number }[] = [],
    // LVL-20: a wall's top as the roof leaves it, from its floor's level `base`: the face stands under it.
    top: { readonly wall: Wall; readonly profile: readonly WallTopPoint[]; readonly base: number } | null = null
  ): void => {
    if (!(y1 - y0 > none)) return
    let da = beyondOf(frame, a)
    let db = beyondOf(frame, b)
    if (da <= none && db <= none) return
    let pa = a
    let pb = b
    if (da < 0 || db < 0) {
      const t = da / (da - db)
      const cut = add(a, scale(sub(b, a), t))
      if (da < 0) {
        pa = cut
        da = 0
      } else {
        pb = cut
        db = 0
      }
    }
    const facing = dot(outward, frame.look)
    if (facing > squareFace) return
    const xa = across(frame, pa)
    const xb = across(frame, pb)
    if (facing >= -squareFace || Math.abs(xb - xa) <= none) {
      // Seen edge-on: a corner, at its nearest point.
      const x = da <= db ? xa : xb
      if (x < -none || x > frame.length + none) return
      const near = da <= db ? pa : pb
      const high = top === null ? y1 : top.base + topAt(top.profile, alongWall(top.wall, near))
      if (!(high - y0 > none)) return
      faces.push({ kind, id, floor, depth: Math.min(da, db), pieces: [], edge: [{ x: snap(x), y: snap(y0) }, { x: snap(x), y: snap(high) }] })
      return
    }
    const x0 = Math.max(0, Math.min(xa, xb))
    const x1 = Math.min(frame.length, Math.max(xa, xb))
    if (!(x1 - x0 > none)) return
    let body: MultiPolygon = [[ringOf(rect(snap, x0, x1, y0, y1))]]
    if (top !== null) {
      // The face under the wall's top, along the edge from a to b.
      const ua = alongWall(top.wall, pa)
      const ub = alongWall(top.wall, pb)
      const at = (u: number): Vec2 => (Math.abs(ub - ua) > none ? add(pa, scale(sub(pb, pa), (u - ua) / (ub - ua))) : pa)
      const us = [ub, ...top.profile.map((p) => p.u).filter((u) => u > Math.min(ua, ub) + none && u < Math.max(ua, ub) - none).sort((p, q) => (ub > ua ? q - p : p - q)), ua]
      const tops = us.map((u, i) => ({ x: across(frame, i === 0 ? pb : i === us.length - 1 ? pa : at(u)), y: top.base + topAt(top.profile, u) }))
      const under = [{ x: across(frame, pa), y: y0 - 1 }, { x: across(frame, pb), y: y0 - 1 }, ...tops]
      const cut = Math.abs(signedArea(under)) > 0 ? cutOutline('intersection', body, [[ringOf(under)]]) : null
      if (cut === null || cut.length === 0) return
      body = cut
    }
    const cutters = holes.flatMap((hole) => {
      const h0 = Math.max(x0, Math.min(across(frame, hole.a), across(frame, hole.b)))
      const h1 = Math.min(x1, Math.max(across(frame, hole.a), across(frame, hole.b)))
      const top = Math.min(hole.y1, y1)
      const foot = Math.max(hole.y0, y0)
      return h1 - h0 > none && top - foot > none ? [[ringOf(rect(snap, h0, h1, foot, top))]] : []
    })
    const pieces = piecesAsRings(cutters.length === 0 ? body : (cutOutline('difference', body, cutters) ?? body))
    if (pieces.length === 0) return
    faces.push({ kind, id, floor, depth: (da + db) / 2, pieces, edge: null })
  }

  /**
   * The faces of a ring of the plan, its outside to the right of each edge when it runs clockwise:
   * the ring holds the solid. A `hole` holds none, and its faces look into it.
   */
  const ringFaces = (kind: SectionFaceKind, id: string, floor: string, ring: readonly Vec2[], y0: number, y1: number, hole = false): void => {
    const clockwise = (signedArea(ring) < 0) !== hole
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const edge = sub(b, a)
      const len = length(edge)
      if (len <= none) continue
      const left = scale(perp(edge), 1 / len)
      face(kind, id, floor, a, b, clockwise ? left : scale(left, -1), y0, y1)
    }
  }

  const levels: SectionLevel[] = []
  // LVL-5: the openings of walls through floors, across the section, which no slab closes.
  const throughHoles: Vec2[][] = []
  const lowestAbove = [...new Set(floors.map(levelOf))].filter((l) => l >= 0).sort((a, b) => a - b)[0]
  for (const floor of floors) {
    const storey = elevations.floors.get(floor.id) ?? { floorLevel: 0, clearHeight: 0 }
    const base = storey.floorLevel
    const stated = floor.elevation !== undefined && Number.isFinite(floor.elevation)
    levels.push({ floor: floor.id, name: floor.name, level: snap(base), source: stated ? 'stated' : levelOf(floor) === lowestAbove && base === 0 ? 'datum' : 'worked-out' })

    const slice = planForFloor(plan, floor.id)
    const index = indexPlan(slice)
    const broken = brokenOnFloor(slice)
    const sides = planWallSides(index)
    const usable = slice.walls.filter((wall) => !broken.has(wall.id) && isFiniteWall(wall))
    const joints = wallJoints(usable)
    // VEW-24: where rooms of this floor stand below it, across the line: the walls round them run down to their slab.
    const sunkSpans = (envelope.floors.find((f) => f.floor === floor.id)?.slab?.sunken ?? []).flatMap((sunk) =>
      inside(frame, ringsOf(sunk.pieces)).map(([from, to]) => ({ from, to, offset: sunk.offset }))
    )

    for (const part of usable) {
      if (part.virtual) continue
      // LVL-5 (C19): a wall through floors is cut once, whole, from its own floor; its openings
      // are open through every slab between, as the window through two storeys is.
      const whole = wholeWall(part, openingsOf(index, part.id).filter((o) => !broken.has(o.id)))
      if (whole === null) continue
      const wall = whole.wall
      const openings = whole.openings
      const ends = joints.get(wall.id) ?? SQUARE_ENDS
      if (wall !== part) {
        for (const o of openings) {
          for (const [x0, x1] of inside(frame, [wallSlicePolygon(wall, Math.max(0, o.offset), o.offset + o.width, ends)])) throughHoles.push(rect(snap, x0, x1, base + o.sill, base + o.sill + o.height))
        }
      }
      const rings: Vec2[][] = []
      // LVL-20: under a roof the floor states, a wall's top is what the roof leaves it, an outside
      // wall raised to it; its parts are cut as high as that reaches.
      const profile = wall === part ? wallTopProfile(plan, wall) : null
      const peak = profile === null ? wall.height : Math.max(...profile.map((p) => p.z))
      const tall = peak > wall.height ? { ...wall, height: peak } : wall
      // VEW-33: a wall through floors keeps its own top; any other may rise to the slab over it.
      const under = wall === part && profile === null ? topUnder(wall, floor.id) : null
      const raised: Vec2[][] = []
      const toRoof: Vec2[][] = []
      for (const part of wallParts(tall, openings)) {
        const polygon = wallSlicePolygon(wall, part.from, part.to, ends)
        const atTop = under !== null && part.zTo >= wall.height - none
        const topped = profile !== null && part.zTo >= peak - none
        for (const [x0, x1] of inside(frame, [polygon])) {
          // VEW-24: a wall's foot beside or in a sunken room is carried down to that room's slab.
          const down = part.zFrom <= none ? Math.min(0, ...sunkSpans.filter((s) => s.from <= x1 + none && s.to >= x0 - none).map((s) => s.offset)) : 0
          if (topped) {
            const ring = underProfile(wall, profile, x0, x1, base + part.zFrom + down, base)
            rings.push(ring)
            if (peak > wall.height + tolerance('joint')) toRoof.push(...above(ring, base + wall.height))
            continue
          }
          rings.push(rect(snap, x0, x1, base + part.zFrom + down, atTop ? under.top : base + part.zTo))
          if (atTop) raised.push(rect(snap, x0, x1, base + wall.height, under.top))
        }
      }
      if (under !== null && raised.length > 0) raisedWalls.push({ floor: floor.id, wall: wall.id, under, rings: raised })
      if (toRoof.length > 0 && risesToRoof(plan, wall)) roofRaised.push({ floor: floor.id, wall: wall.id, height: wall.height, rings: toRoof })
      if (rings.length > 0) {
        const glazed = wallTypeOf(plan, wall)?.glazed === true
        parts.push({ kind: 'wall', id: wall.id, floor: floor.id, rings, outside: outsideAt(frame, wall, sides), ...(glazed ? { glazed: true as const } : {}) })
        if (heightByDefault(plan, wall)) defaultHeights.set(floor.id, [...(defaultHeights.get(floor.id) ?? []), wall.id])
        if (marks.assumed('wall', wall.id)) markedWalls.push(wall.id)
      }
      // VEW-29: a floor whose slab thickness is not stated draws no band of its own beyond the cut:
      // the walls it carries stand down over the slab's edge.
      const slabOf = envelope.floors.find((f) => f.floor === floor.id)?.slab
      const drop = slabOf != null && slabOf.kind === 'floor' && !slabOf.thicknessStated ? slabOf.thickness : 0
      wallFaces(wall, ends, openings, base, floor.id, base - drop, profile !== null ? base + peak : under?.top, profile)
    }

    // A raised room's floor stands on its storey's, solid up to its own (LVL-7).
    const zones = roomZones(index).zoneOf
    const roofOver = floorRoofShape(plan, floor.id)
    for (const room of slice.rooms) {
      if (broken.has(room.id) || zones.has(room.id)) continue
      const shape = tryRoomShape(room, index)
      if (shape === null || shape.polygon.length < 3) continue
      const stretches = inside(frame, [shape.polygon, ...shape.holes])
      if (stretches.length === 0) continue
      const offset = roomFloorOffset(room)
      if (offset > tolerance('sameFloorLevel')) {
        parts.push({ kind: 'floor', id: room.id, floor: floor.id, rings: stretches.map(([x0, x1]) => rect(snap, x0, x1, base, base + offset)) })
      }
      const [from, to] = stretches.reduce((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best))
      const own = room.height !== undefined && Number.isFinite(room.height) && room.height > 0
      // VEW-34: a room that states no height, under a void over most of it, is as high as the space over the void.
      const under = own || room.void === true ? null : underVoid(floor.id, from, to)
      // LVL-20: under a sloped roof the floor states, a room that states no height is as high as the
      // roof leaves it at its highest, the figure `grid_measure` gives, and its headroom is given along the line.
      const sloped = roofOver !== null && (roofOver.planes.length > 0 || roofOver.dormers.length > 0) && room.void !== true && outdoorRoofed(room) !== false ? roofOver : null
      const headroom = sloped === null || under !== null ? null : roomHeadroom(plan, room, index)
      const bands = sloped === null || headroom === null ? [] : headroomOnLine(sloped, stretches, offset, own ? room.height! : headroom.highest)
      for (const t of under?.through ?? []) risenVoids.add(`${t.floor}\u0000${t.room}`)
      rooms.push({
        room: room.id,
        floor: floor.id,
        name: room.name,
        from: snap(under?.from ?? from),
        to: snap(under?.to ?? to),
        floorLevel: snap(base + offset),
        height: snap(own ? room.height! : under !== null ? under.top - base - offset : headroom !== null ? headroom.highest : storey.clearHeight - offset),
        heightStated: own,
        ...(room.void === true || outdoorRoofed(room) === false ? { open: true as const } : {}),
        ...(under === null ? {} : { through: under.through.map((t) => t.room) }),
        ...(sloped === null || headroom === null ? {} : { headroom: bands })
      })
    }

    // CNT-48: each item standing here, by the blocks the 3D view stands it as, on its room's floor:
    // cut where the line crosses it, its sides beyond the cut seen.
    const items = (slice.items ?? []).filter((item) => !broken.has(item.id) && isItemKind(item.kind))
    if (items.length > 0) {
      const shapes = roomShapes(index, broken)
      for (const item of items) {
        const room = itemRoom(item, shapes)
        const lift = base + (room === null ? 0 : roomFloorOffset(room))
        const rings: Vec2[][] = []
        for (const block of itemSolid(item)) {
          for (const [x0, x1] of inside(frame, [block.outline])) rings.push(rect(snap, x0, x1, lift + block.bottom, lift + block.top))
          ringFaces('item', item.id, floor.id, block.outline, lift + block.bottom, lift + block.top)
        }
        if (rings.length > 0) itemParts.push({ kind: 'item', id: item.id, floor: floor.id, rings })
      }
    }
  }

  /**
   * LVL-20: the stretches of a room's floor on the line, `stretches`, with at least each headroom band
   * over it under the roof: where the underside, less the room's own rise (`offset`), reaches the band,
   * and never past the room's own height (`cap`).
   */
  function headroomOnLine(roof: RoofShapeOverFloor, stretches: readonly (readonly [number, number])[], offset: number, cap: number): SectionHeadroom[] {
    const found: SectionHeadroom[] = []
    for (const height of headroomBands()) {
      if (cap < height - tolerance('lengthEqual')) continue
      const runs: [number, number][] = []
      for (const [s0, s1] of stretches) {
        for (const piece of undersideAlong(roof, pointAt(s0), pointAt(s1))) {
          const xa = s0 + piece.from
          const xb = s0 + piece.to
          const za = planeAt(piece.plane, pointAt(xa)) - offset - height
          const zb = planeAt(piece.plane, pointAt(xb)) - offset - height
          if (za < 0 && zb < 0) continue
          const lo = za >= 0 ? xa : xa + (za / (za - zb)) * (xb - xa)
          const hi = zb >= 0 ? xb : xa + (za / (za - zb)) * (xb - xa)
          if (hi - lo > none) runs.push([lo, hi])
        }
      }
      for (const [lo, hi] of mergeStretches(runs)) found.push({ height, from: snap(lo), to: snap(hi) })
    }
    return found
  }

  /** The two faces and two ends of a wall, its doors and windows open in its faces. */
  function wallFaces(wall: Wall, ends: typeof SQUARE_ENDS, openings: ReturnType<typeof openingsOf>, base: number, floor: string, foot = base, top = base + wall.height, profile: readonly WallTopPoint[] | null = null): void {
    if (wall.arc !== undefined) {
      curvedWallFaces(wall, openings, base, floor, foot, top)
      return
    }
    const axis = wallAxis(wall)
    const total = axis.length
    const [l0, l1, r1, r0] = wallSlicePolygon(wall, 0, total, ends)
    const half = wall.thickness / 2
    const holesOn = (offset: number) =>
      openings.map((o) => ({
        a: add(pointAlong(axis, Math.max(0, o.offset)), scale(axis.normal, offset)),
        b: add(pointAlong(axis, Math.min(total, o.offset + o.width)), scale(axis.normal, offset)),
        y0: base + o.sill,
        y1: base + o.sill + o.height
      }))
    const cutTo = profile === null ? null : { wall, profile, base }
    face('wall', wall.id, floor, l0!, l1!, axis.normal, foot, top, holesOn(half), cutTo)
    face('wall', wall.id, floor, r0!, r1!, scale(axis.normal, -1), foot, top, holesOn(-half), cutTo)
    face('wall', wall.id, floor, l1!, r1!, axis.dir, foot, top, [], cutTo)
    face('wall', wall.id, floor, r0!, l0!, scale(axis.dir, -1), foot, top, [], cutTo)
  }

  /**
   * CNT-18: a curved wall's faces, one flat piece per chord of its curve (each within
   * `arcSagitta` of it), its doors and windows open where they stand along the curve, and an end
   * face only where the wall ends.
   */
  function curvedWallFaces(wall: Wall, openings: ReturnType<typeof openingsOf>, base: number, floor: string, foot = base, top = base + wall.height): void {
    const half = wall.thickness / 2
    const segments = wallSegments(wall)
    // VEW-79: the faces of each side, by the chord they stand on, to be joined into one face per run.
    const sides: { left: (SectionFace | null)[]; right: (SectionFace | null)[] } = { left: [], right: [] }
    const pushed = (): SectionFace | null => {
      const last = faces[faces.length - 1]
      return last !== undefined && last.edge === null && last.id === wall.id ? last : null
    }
    segments.forEach((segment, i) => {
      const side = (offset: number, p: Vec2): Vec2 => add(p, scale(segment.normal, offset))
      const holesOn = (offset: number) =>
        openings
          .filter((o) => o.offset < segment.to && o.offset + o.width > segment.from)
          .map((o) => ({
            a: side(offset, wallPointAt(wall, Math.max(segment.from, o.offset))),
            b: side(offset, wallPointAt(wall, Math.min(segment.to, o.offset + o.width))),
            y0: base + o.sill,
            y1: base + o.sill + o.height
          }))
      const l0 = side(half, segment.start)
      const l1 = side(half, segment.end)
      const r0 = side(-half, segment.start)
      const r1 = side(-half, segment.end)
      const before = faces.length
      face('wall', wall.id, floor, l0, l1, segment.normal, foot, top, holesOn(half))
      sides.left.push(faces.length > before ? pushed() : null)
      const middle = faces.length
      face('wall', wall.id, floor, r0, r1, scale(segment.normal, -1), foot, top, holesOn(-half))
      sides.right.push(faces.length > middle ? pushed() : null)
      if (i === segments.length - 1 && wall.arc!.sweep % 360 !== 0) face('wall', wall.id, floor, l1, r1, segment.dir, foot, top)
      if (i === 0 && wall.arc!.sweep % 360 !== 0) face('wall', wall.id, floor, r0, l0, scale(segment.dir, -1), foot, top)
    })
    const closed = wall.arc!.sweep % 360 === 0
    for (const side of [sides.left, sides.right]) joinCurveRuns(faces, side, closed)
  }

  // The slabs, roofs and parapets (LVL-4).
  const roofs: SectionRoof[] = []
  const unstatedSlabs: { floor: Floor; rings: Vec2[][] }[] = []
  const roofRings: { floor: Floor; rings: Vec2[][]; thickness: number; shape: RoofShape | null }[] = []
  for (const floor of floors) {
    const shell = envelope.floors.find((f) => f.floor === floor.id)
    if (shell === undefined) continue
    if (shell.slab !== null && shell.slab.thickness > 0) {
      const { top, thickness } = shell.slab
      const rings: Vec2[][] = []
      for (const [x0, x1] of inside(frame, ringsOf(shell.slab.pieces))) rings.push(rect(snap, x0, x1, top - thickness, top))
      for (const sunk of shell.slab.sunken) {
        for (const [x0, x1] of inside(frame, ringsOf(sunk.pieces))) {
          rings.push(rect(snap, x0, x1, top + sunk.offset - thickness, top + sunk.offset))
          // VEW-24: the step up to the floor is slab too, so the lowered slab and the floor are one piece.
          const rib = Math.min(thickness, (x1 - x0) / 2)
          rings.push(rect(snap, x0, x0 + rib, top + sunk.offset - thickness, top), rect(snap, x1 - rib, x1, top + sunk.offset - thickness, top))
        }
      }
      if (rings.length > 0) {
        parts.push({ kind: 'slab', id: floor.id, floor: floor.id, rings })
        if (!shell.slab.thicknessStated) unstatedSlabs.push({ floor, rings })
      }
      if (shell.slab.thicknessStated) for (const piece of piecesAsRings(shell.slab.pieces)) for (const ring of [piece.outline, ...piece.holes]) ringFaces('slab', floor.id, floor.id, ring, top - thickness, top)
    }
    // VEW-16: the outside walls carried down to the ground, under a floor whose slab stands clear of it.
    const plinth = plinthUnder(shell.slab, ground.under.get(floor.id)?.low ?? ground.level)
    if (plinth !== null) {
      const band = plinthBand(floor.id)
      const rings = inside(frame, ringsOf(band)).map(([x0, x1]) => rect(snap, x0, x1, plinth.bottom, plinth.top))
      if (rings.length > 0) parts.push({ kind: 'plinth', id: floor.id, floor: floor.id, rings })
      for (const piece of piecesAsRings(band)) {
        ringFaces('plinth', floor.id, floor.id, piece.outline, plinth.bottom, plinth.top)
        for (const hole of piece.holes) ringFaces('plinth', floor.id, floor.id, hole, plinth.bottom, plinth.top, true)
      }
    }
    const roof = shell.roof
    // LVL-20: a sloped roof the floor states is cut along its slopes and dormers.
    const stated = roof !== null && roof.shape !== null ? floorRoofShape(plan, floor.id) : null
    const slopes = stated !== null && (stated.planes.length > 0 || stated.dormers.length > 0) ? stated : null
    if (roof !== null && slopes !== null) {
      const level = elevations.floors.get(floor.id)?.floorLevel ?? 0
      const rings = inside(frame, ringsOf(roof.pieces)).flatMap(([x0, x1]) => slopedCut(slopes, x0, x1, level, roof.thickness))
      if (rings.length > 0) {
        parts.push({ kind: 'roof', id: floor.id, floor: floor.id, rings })
        roofRings.push({ floor, rings, thickness: roof.thickness, shape: roof.shape })
        roofs.push({ floor: floor.id, level: snap(Math.max(...rings.flat().map((p) => p.y))), shape: slopes.roof.shape, pitch: slopes.pitch, eaves: snap(level + slopes.roof.eaves), ridge: snap(level + slopes.top), ...spanOf(rings.flat()) })
      }
      for (const piece of piecesAsRings(roof.pieces)) for (const ring of [piece.outline, ...piece.holes]) slopedFaces(floor.id, ring, slopes, level, roof.thickness)
    } else if (roof !== null) {
      const roofTop = roof.bottom + roof.thickness
      const rings = inside(frame, ringsOf(roof.pieces)).map(([x0, x1]) => rect(snap, x0, x1, roof.bottom, roofTop))
      if (rings.length > 0) {
        parts.push({ kind: 'roof', id: floor.id, floor: floor.id, rings })
        roofRings.push({ floor, rings, thickness: roof.thickness, shape: roof.shape })
        const levels = stated === null ? {} : { shape: stated.roof.shape, pitch: 0, eaves: snap(roof.bottom), ridge: snap(roof.bottom) }
        roofs.push({ floor: floor.id, level: snap(roofTop), ...levels, ...spanOf(rings.flat()) })
      }
      for (const piece of piecesAsRings(roof.pieces)) for (const ring of [piece.outline, ...piece.holes]) ringFaces('roof', floor.id, floor.id, ring, roof.bottom, roofTop)
      if (roof.parapet !== null) {
        const roofTop = roof.bottom + roof.thickness
        const parapetTop = roofTop + roof.parapet.height
        const parapet = inside(frame, ringsOf(roof.parapet.pieces)).map(([x0, x1]) => rect(snap, x0, x1, roofTop, parapetTop))
        if (parapet.length > 0) {
          parts.push({ kind: 'parapet', id: floor.id, floor: floor.id, rings: parapet })
          // VEW-84: the roof's mark carries the parapet's top when the line cuts it.
          const at = roofs.findIndex((r) => r.floor === floor.id)
          if (at !== -1) roofs[at] = { ...roofs[at]!, parapet: snap(parapetTop) }
        }
        for (const piece of piecesAsRings(roof.parapet.pieces)) for (const ring of [piece.outline, ...piece.holes]) ringFaces('parapet', floor.id, floor.id, ring, roofTop, parapetTop)
      }
    }
  }

  /**
   * LVL-20: a sloped roof's cut from `x0` to `x1` across the section: along each straight piece of
   * its underside a band as thick as the roof, measured square to its slope; where a dormer rises
   * from the slope, a strip as thick, on the dormer's side, joins the two.
   */
  function slopedCut(roof: RoofShapeOverFloor, x0: number, x1: number, level: number, thickness: number): Vec2[][] {
    const pieces = undersideAlong(roof, pointAt(x0), pointAt(x1))
    const rings: Vec2[][] = []
    const band = (plane: RoofPlane): number => thickness * Math.sqrt(1 + plane.gx * plane.gx + plane.gy * plane.gy)
    const zAt = (plane: RoofPlane, x: number): number => level + planeAt(plane, pointAt(x))
    pieces.forEach((piece, i) => {
      const xa = x0 + piece.from
      const xb = x0 + piece.to
      const t = band(piece.plane)
      rings.push([
        { x: snap(xa), y: snap(zAt(piece.plane, xa)) },
        { x: snap(xb), y: snap(zAt(piece.plane, xb)) },
        { x: snap(xb), y: snap(zAt(piece.plane, xb) + t) },
        { x: snap(xa), y: snap(zAt(piece.plane, xa) + t) }
      ])
      const next = pieces[i + 1]
      if (next === undefined) return
      const low = zAt(piece.plane, xb)
      const high = zAt(next.plane, xb)
      if (Math.abs(high - low) <= none) return
      // The higher piece holds the strip: it stands on the lower one and rises to its own top.
      if (high > low) rings.push(rect(snap, xb, Math.min(x0 + next.to, xb + thickness), low, high + band(next.plane)))
      else rings.push(rect(snap, Math.max(xa, xb - thickness), xb, high, low + t))
    })
    return rings.filter((ring) => Math.abs(signedArea(ring)) > 0)
  }

  /**
   * LVL-20: the edges of a sloped roof seen beyond the cut, each a band along the roof's underside
   * as thick as the roof, facing the person looking; one seen edge-on is a line.
   */
  function slopedFaces(floor: string, ring: readonly Vec2[], roof: RoofShapeOverFloor, level: number, thickness: number): void {
    const clockwise = signedArea(ring) < 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const edge = sub(b, a)
      const len = length(edge)
      if (len <= none) continue
      const left = scale(perp(edge), 1 / len)
      const outward = clockwise ? left : scale(left, -1)
      const facing = dot(outward, frame.look)
      if (facing > squareFace) continue
      let da = beyondOf(frame, a)
      let db = beyondOf(frame, b)
      if (da <= none && db <= none) continue
      let pa = a
      let pb = b
      if (da < 0 || db < 0) {
        const t = da / (da - db)
        const cut = add(a, scale(sub(b, a), t))
        if (da < 0) {
          pa = cut
          da = 0
        } else {
          pb = cut
          db = 0
        }
      }
      const pieces = undersideAlong(roof, pa, pb)
      const run = length(sub(pb, pa))
      const dir = run > 0 ? scale(sub(pb, pa), 1 / run) : { x: 0, y: 0 }
      const band = (plane: RoofPlane): number => thickness * Math.sqrt(1 + plane.gx * plane.gx + plane.gy * plane.gy)
      if (facing >= -squareFace || Math.abs(across(frame, pb) - across(frame, pa)) <= none) {
        // Seen edge-on: a line at its nearest point.
        const near = da <= db ? pa : pb
        const x = across(frame, near)
        if (x < -none || x > frame.length + none || pieces.length === 0) continue
        const piece = pieces[da <= db ? 0 : pieces.length - 1]!
        const z = level + planeAt(piece.plane, near)
        faces.push({ kind: 'roof', id: floor, floor, depth: Math.min(da, db), pieces: [], edge: [{ x: snap(x), y: snap(z) }, { x: snap(x), y: snap(z + band(piece.plane)) }] })
        continue
      }
      const quads = pieces.map((piece) => {
        const p = add(pa, scale(dir, piece.from))
        const q = add(pa, scale(dir, piece.to))
        const zp = level + planeAt(piece.plane, p)
        const zq = level + planeAt(piece.plane, q)
        const t = band(piece.plane)
        return [
          { x: across(frame, p), y: zp },
          { x: across(frame, q), y: zq },
          { x: across(frame, q), y: zq + t },
          { x: across(frame, p), y: zp + t }
        ]
      })
      const ys = quads.flat().map((p) => p.y)
      if (ys.length === 0) continue
      const within = rect(snap, 0, frame.length, Math.min(...ys) - 1, Math.max(...ys) + 1)
      const body = joined(quads.map((quad) => quad.map((p) => ({ x: snap(p.x), y: snap(p.y) }))))
      const kept = body.length === 0 ? null : cutOutline('intersection', [ringOf(within)], [body.map((piece) => [ringOf(piece.outline), ...piece.holes.map(ringOf)])])
      const shown = kept === null ? [] : piecesAsRings(kept)
      if (shown.length > 0) faces.push({ kind: 'roof', id: floor, floor, depth: (da + db) / 2, pieces: shown, edge: null })
    }
  }

  /** The band of a floor's outside walls, on plan: what its plinth stands under. Empty when it cannot be worked out. */
  function plinthBand(floor: string): MultiPolygon {
    try {
      const slice = planForFloor(plan, floor)
      return union(outerWallBand(floorWalls(slice, floor, brokenOnFloor(slice)), planWallSides(indexPlan(slice))))
    } catch {
      return []
    }
  }

  // LVL-5: a slab stops at the opening of a wall that rises past it: the window through two
  // storeys is open from its sill to its head.
  if (throughHoles.length > 0) {
    const cutters = throughHoles.map((ring) => [ringOf(ring)])
    parts.forEach((part, i) => {
      if (part.kind !== 'slab') return
      const rings = part.rings.flatMap((ring) => {
        const left = cutOutline('difference', [ringOf(ring)], cutters)
        return left === null ? [ring] : piecesAsRings(left).map((piece) => piece.outline)
      })
      parts[i] = { ...part, rings }
    })
  }

  // The stairs the plan states (LVL-3), as they are built (VEW-11): each flight its treads and
  // risers over a waist and the soffit beneath, each landing a slab, nothing solid to the floor.
  const laid = (plan.stairs ?? []).length === 0 ? [] : planStairs(plan, brokenOnFloor).stairs
  const workedRisers: string[] = []
  const waisted: string[] = []
  for (const stair of laid) {
    const rings: Vec2[][] = []
    for (const flight of stair.flights) {
      const profile = flightProfile(stair, flight)
      const along = profile.length > none ? scale(sub(flight.to, flight.from), 1 / profile.length) : frame.right
      const sOf = (x: number): number => dot(sub(add(frame.start, scale(frame.right, x)), flight.from), along)
      for (const [x0, x1] of inside(frame, [flight.outline])) {
        const ring = profileRing(profile, x0, sOf(x0), x1, sOf(x1), snap)
        if (ring.length >= 3 && Math.abs(signedArea(ring)) > 0) rings.push(ring)
      }
      flightFaces(stair, flight, profile, along)
    }
    for (const landing of stair.landings) {
      const { bottom, top } = landingLevels(stair, landing.risersBelow)
      for (const [x0, x1] of inside(frame, [landing.outline])) rings.push(rect(snap, x0, x1, bottom, top))
      ringFaces('stair', stair.id, stair.lower.floor, landing.outline, bottom, top)
    }
    if (rings.length > 0) {
      const fixed = parts.filter((p) => p.kind === 'wall' || p.kind === 'slab').flatMap((p) => p.rings)
      for (let i = 0; i < rings.length; i++) rings[i] = snapToCut(rings[i]!, fixed)
      parts.push({ kind: 'stair', id: stair.id, floor: stair.lower.floor, rings })
      if (!stair.risersStated) workedRisers.push(stair.id)
      if (stair.flights.length > 0) waisted.push(stair.id)
    }
  }

  /**
   * A flight's faces beyond the cut (VEW-11): its two sides, each its profile; its risers, one face (VEW-41)
   * of each riser in its place (VEW-69); its upper end, from the soffit to its last tread, which also stands for the soffit
   * seen from above the flight.
   */
  function flightFaces(stair: (typeof laid)[number], flight: (typeof laid)[number]['flights'][number], profile: FlightProfile, along: Vec2): void {
    const half = stair.width / 2
    const side = scale(perp(along), half)
    const ends = (s: number): [Vec2, Vec2] => {
      const at = add(flight.from, scale(along, s))
      return [add(at, side), sub(at, side)]
    }
    const [lFoot, rFoot] = ends(0)
    const [lTop, rTop] = ends(profile.length)
    sideFace(stair, profile, lFoot, lTop, perp(along))
    sideFace(stair, profile, rFoot, rTop, scale(perp(along), -1))
    riserFace(stair, flight, profile, along)
    face('stair', stair.id, stair.lower.floor, lTop, rTop, along, profile.bottomAt(profile.length), profile.topAt(profile.length))
  }

  /**
   * VEW-69: a flight's risers beyond the cut, as one face (VEW-41): each riser one riser tall, at its
   * own riser line and the height it rises from, joined. Seen head-on they make one rectangle, at an
   * angle they step up and away; seen edge-on they add nothing, since the flight's side shows them.
   * Never a face from the floor at the foot up to the top, which closed off the room under the stair.
   */
  function riserFace(stair: (typeof laid)[number], flight: (typeof laid)[number]['flights'][number], profile: FlightProfile, along: Vec2): void {
    const facing = dot(scale(along, -1), frame.look)
    if (facing >= -squareFace) return
    const rings: Vec2[][] = []
    let depth = Infinity
    // The last riser line rises to the landing or floor above, which draws its own face.
    for (let k = 0; k + 1 < flight.riserLines.length; k++) {
      const [a, b] = flight.riserLines[k]!
      let da = beyondOf(frame, a)
      let db = beyondOf(frame, b)
      if (da <= none && db <= none) continue
      let pa = a
      let pb = b
      if (da < 0 || db < 0) {
        const cut = add(a, scale(sub(b, a), da / (da - db)))
        if (da < 0) [pa, da] = [cut, 0]
        else [pb, db] = [cut, 0]
      }
      const x0 = Math.max(0, Math.min(across(frame, pa), across(frame, pb)))
      const x1 = Math.min(frame.length, Math.max(across(frame, pa), across(frame, pb)))
      if (!(x1 - x0 > none)) continue
      rings.push(rect(snap, x0, x1, profile.lower + k * stair.riserHeight, profile.lower + (k + 1) * stair.riserHeight))
      depth = Math.min(depth, (da + db) / 2)
    }
    const pieces = joined(rings)
    if (pieces.length > 0) faces.push({ kind: 'stair', id: stair.id, floor: stair.lower.floor, depth, pieces, edge: null })
  }

  /** A side of a flight, from its foot `a` to its top `b`, facing `outward`: the flight's profile. */
  function sideFace(stair: (typeof laid)[number], profile: FlightProfile, a: Vec2, b: Vec2, outward: Vec2): void {
    const facing = dot(outward, frame.look)
    let da = beyondOf(frame, a)
    let db = beyondOf(frame, b)
    if ((da <= none && db <= none) || facing > squareFace) return
    let sa = 0
    let sb = profile.length
    if (da < 0 || db < 0) {
      const t = da / (da - db)
      if (da < 0) {
        sa = t * profile.length
        da = 0
      } else {
        sb = t * profile.length
        db = 0
      }
    }
    const xAt = (s: number): number => across(frame, add(a, scale(sub(b, a), s / profile.length)))
    let xa = xAt(sa)
    let xb = xAt(sb)
    if (facing >= -squareFace || Math.abs(xb - xa) <= none) {
      // Seen edge-on: a line at its nearest point, from the soffit's lowest to the highest tread.
      const x = da <= db ? xa : xb
      if (x < -none || x > frame.length + none) return
      faces.push({ kind: 'stair', id: stair.id, floor: stair.lower.floor, depth: Math.min(da, db), pieces: [], edge: [{ x: snap(x), y: snap(profile.bottomAt(sa)) }, { x: snap(x), y: snap(profile.topAt(sb)) }] })
      return
    }
    // Kept within the line: where x leaves [0, length], so does the piece of the side.
    const sAtX = (x: number): number => sa + ((x - xa) / (xb - xa)) * (sb - sa)
    if (Math.min(xa, xb) < 0 || Math.max(xa, xb) > frame.length) {
      const lo = Math.max(0, Math.min(xa, xb))
      const hi = Math.min(frame.length, Math.max(xa, xb))
      if (!(hi - lo > none)) return
      const [na, nb] = xa <= xb ? [lo, hi] : [hi, lo]
      ;[sa, sb] = [sAtX(na), sAtX(nb)]
      ;[xa, xb] = [na, nb]
    }
    const ring = profileRing(profile, xa, sa, xb, sb, snap)
    if (ring.length < 3) return
    faces.push({ kind: 'stair', id: stair.id, floor: stair.lower.floor, depth: (da + db) / 2, pieces: [{ outline: ring, holes: [] }], edge: null })
  }

  // VEW-65: each floor's body along the line: from its foot (its slab's underside, a sunken room's
  // lower) up to its storey's top, where its outline is.
  const bodies: { from: number; to: number; foot: number; top: number }[] = []
  for (const floor of floors) {
    const shell = envelope.floors.find((f) => f.floor === floor.id)
    const storey = elevations.floors.get(floor.id)
    if (shell?.outline == null || shell.slab === null || storey === undefined) continue
    // A roof over it, such as a basement's that stands out of the ground, is its top too.
    const top = Math.max(storey.floorLevel + storey.clearHeight, shell.roof === null ? -Infinity : shell.roof.bottom + shell.roof.thickness)
    const foot = shell.slab.top - Math.max(0, shell.slab.thickness)
    for (const [from, to] of inside(frame, ringsOf(shell.outline))) bodies.push({ from, to, foot, top })
    for (const sunk of shell.slab.sunken) {
      for (const [from, to] of inside(frame, ringsOf(sunk.pieces))) bodies.push({ from, to, foot: foot + Math.min(0, sunk.offset), top })
    }
  }

  // The ground line, from x = 0 to the line's length, the cut's own extent: wherever no floor stands
  // through the ground, its foot at or under it (no plinth, VEW-16) and its top over it. So it runs on
  // under a floor on its plinth, and over a basement under a garden.
  const through = mergeStretches(
    bodies
      .filter((b) => {
        const at = groundAt((b.from + b.to) / 2)
        return !(b.foot - at > tolerance('plinthLeast')) && b.top - at > tolerance('sameFloorLevel')
      })
      .map((b) => [b.from, b.to] as const)
  )
  const segments: [number, number][] = []
  let cursor = 0
  for (const [a, b] of through) {
    if (a - cursor > none) segments.push([snap(cursor), snap(a)])
    cursor = Math.max(cursor, b)
  }
  if (lineLength - cursor > none) segments.push([snap(cursor), snap(lineLength)])

  // VEW-65: the building below the ground: along the line, the lowest foot to the highest top of the
  // floors standing there, cut off at the ground, with every cut part below it.
  const dugRings: Vec2[][] = []
  const breaks = [...new Set(bodies.flatMap((b) => [b.from, b.to]))].sort((a, b) => a - b)
  for (let i = 0; i + 1 < breaks.length; i++) {
    const [x0, x1] = [breaks[i]!, breaks[i + 1]!]
    if (!(x1 - x0 > none)) continue
    const mid = (x0 + x1) / 2
    const standing = bodies.filter((b) => b.from <= mid && b.to >= mid)
    if (standing.length === 0) continue
    const foot = Math.min(...standing.map((b) => b.foot))
    // CNT-49: cut off at the ground by `below`, which follows it on a slope.
    const top = fall === undefined ? Math.min(ground.level, Math.max(...standing.map((b) => b.top))) : Math.min(Math.max(groundAt(x0), groundAt(x1)), Math.max(...standing.map((b) => b.top)))
    if (top - foot > none) dugRings.push(rect(snap, x0, x1, foot, top))
  }
  const cutRings = parts.flatMap((p) => p.rings).filter((ring) => ring.some((p) => p.y < groundAt(p.x) - none))
  const lowest = Math.min(groundAt(0), groundAt(lineLength), ...dugRings.flat().map((p) => p.y), ...cutRings.flat().map((p) => p.y))
  const below = [[ringOf(underGround(snap, -1, lineLength + 1, lowest - 1, groundAt))]]
  const dugAll = [...dugRings, ...cutRings].filter((ring) => Math.abs(signedArea(ring)) > 0)
  const dug: MultiPolygon = dugAll.length === 0 ? [] : (cutOutline('intersection', union(dugAll.map((ring) => [ringOf(ring)])), below) ?? [])
  const earthBottom = snap(lowest - limit('sectionEarthBelow'))
  const touches = (x: number): boolean => piecesAsRings(dug).some((piece) => piece.outline.some((p) => Math.abs(p.x - x) <= tolerance('shellGrid')))
  const earth: SectionEarth = {
    bottom: earthBottom,
    pieces: earthBetween(dug, 0, lineLength, earthBottom, groundAt, snap),
    dug: piecesAsRings(dug).map((piece) => ({ outline: piece.outline.map((p) => ({ x: snap(p.x), y: snap(p.y) })), holes: piece.holes.map((h) => h.map((p) => ({ x: snap(p.x), y: snap(p.y) }))) })),
    open: { start: !touches(0), end: !touches(lineLength) }
  }
  // A wall cut below the ground with the outside on one face holds the earth back.
  parts.forEach((part, i) => {
    if (part.kind !== 'wall' || part.outside == null) return
    if (part.rings.some((ring) => ring.some((p) => p.y < groundAt(p.x) - tolerance('sameFloorLevel')))) parts[i] = { ...part, retaining: true }
  })

  // What is taken, in the order it is listed. MSG-11: each sentence by key (`drawing.section.taken.*`),
  // carried as `said`; `words` is its English.
  const nameOf = (id: string): Name => {
    const floor = floors.find((f) => f.id === id)
    return name(floor?.name || id)
  }
  const ids = (list: readonly string[]): Value => joinedValues(list.map(name), 'join.comma')
  const many = (n: number): 'one' | 'many' => (n === 1 ? 'one' : 'many')
  const taken = (note: Omit<SectionAssumption, 'words' | 'said'>, sentence: Said): void => {
    notes.push(withSentence({ ...note, words: english(sentence) }, sentence))
  }
  for (const { floor, rings } of unstatedSlabs) {
    const thickness = envelope.floors.find((f) => f.floor === floor.id)?.slab?.thickness ?? 0
    taken({ kind: 'slab', ids: [floor.id], hatched: true, pieces: joined(rings) }, said('drawing.section.taken.slab', { floor: nameOf(floor.id), thickness: num(metresText(thickness)) }))
  }
  for (const { floor, rings, thickness, shape } of roofRings) {
    // LVL-6: a flat roof the floor states stands at its eaves; LVL-20: a sloped one is cut on its slopes.
    const values = { floor: nameOf(floor.id), thickness: num(metresText(thickness)) }
    const sentence = shape === null
      ? said('drawing.section.taken.roof.none', values)
      : shape === 'flat'
        ? said('drawing.section.taken.roof.flat', values)
        : said('drawing.section.taken.roof.sloped', { ...values, shape: said(`drawing.section.roofShape.${shape}`) })
    taken({ kind: 'roof', ids: [floor.id], hatched: true, pieces: joined(rings) }, sentence)
  }
  for (const [floor, wallIds] of defaultHeights) {
    const rings = parts.filter((p) => p.kind === 'wall' && p.floor === floor && wallIds.includes(p.id)).flatMap((p) => p.rings)
    taken({ kind: 'wall-height', ids: wallIds, hatched: true, pieces: joined(rings) }, said(`drawing.section.taken.wallHeight.${many(wallIds.length)}`, { count: wallIds.length, floor: nameOf(floor), ids: ids(wallIds) }))
  }
  // VEW-33: the walls drawn up to the slab or roof over them, floor by floor, by what is over them.
  const byOver = new Map<string, (typeof raisedWalls)[number][]>()
  for (const raised of raisedWalls) {
    const key = `${raised.floor}\u0000${raised.under.over.kind}\u0000${raised.under.over.floor}`
    byOver.set(key, [...(byOver.get(key) ?? []), raised])
  }
  for (const list of byOver.values()) {
    const { floor, under } = list[0]!
    const wallIds = [...new Set(list.map((r) => r.wall))]
    const rise = Math.max(...list.map((r) => r.under.rise))
    const values = { count: wallIds.length, floor: nameOf(floor), over: nameOf(under.over.floor), rise: num(metresText(rise)), ids: ids(wallIds) }
    taken(
      { kind: 'wall-top', ids: wallIds, hatched: true, pieces: joined(list.flatMap((r) => r.rings)) },
      said(`drawing.section.taken.wallTop.${under.over.kind}.${many(wallIds.length)}`, values)
    )
  }
  // LVL-20: the outside walls cut up to the roof over them, past the heights they state, floor by floor.
  const raisedOn = new Map<string, (typeof roofRaised)[number][]>()
  for (const raised of roofRaised) raisedOn.set(raised.floor, [...(raisedOn.get(raised.floor) ?? []), raised])
  for (const [floor, list] of raisedOn) {
    const wallIds = [...new Set(list.map((r) => r.wall))]
    const sentence =
      wallIds.length === 1
        ? said('drawing.section.taken.wallRoof.one', { floor: nameOf(floor), height: num(metresText(list[0]!.height)), ids: ids(wallIds) })
        : said('drawing.section.taken.wallRoof.many', { count: wallIds.length, floor: nameOf(floor), ids: ids(wallIds) })
    taken({ kind: 'wall-roof', ids: wallIds, hatched: true, pieces: joined(list.flatMap((r) => r.rings)) }, sentence)
  }
  if (markedWalls.length > 0) {
    const rings = parts.filter((p) => p.kind === 'wall' && markedWalls.includes(p.id)).flatMap((p) => p.rings)
    taken({ kind: 'marked', ids: markedWalls, hatched: true, pieces: joined(rings) }, said(`drawing.section.taken.marked.${many(markedWalls.length)}`, { count: markedWalls.length, ids: ids(markedWalls) }))
  }
  if (!ground.stated) taken({ kind: 'ground', ids: [], hatched: false, pieces: [] }, said('drawing.section.taken.ground', { level: num(levelText(ground.level)) }))
  for (const level of levels) {
    if (level.source === 'worked-out') taken({ kind: 'level', ids: [level.floor], hatched: false, pieces: [] }, said('drawing.section.taken.level', { floor: nameOf(level.floor), level: num(levelText(level.level)) }))
  }
  // VEW-34: a void a room below rises through is that room's space: it is not labelled.
  const shownRooms = rooms.filter((r) => !risenVoids.has(`${r.floor}\u0000${r.room}`))
  const unstatedRooms = shownRooms.filter((r) => !r.heightStated && r.through === undefined && r.open !== true)
  if (unstatedRooms.length > 0) {
    const names = [...new Set(unstatedRooms.map((r) => r.name || r.room))]
    taken({ kind: 'room-height', ids: unstatedRooms.map((r) => r.room), hatched: false, pieces: [] }, said(`drawing.section.taken.roomHeight.${many(unstatedRooms.length)}`, { count: unstatedRooms.length, names: ids(names) }))
  }
  const risenRooms = shownRooms.filter((r) => r.through !== undefined)
  if (risenRooms.length > 0) {
    const names = [...new Set(risenRooms.map((r) => r.name || r.room))]
    taken({ kind: 'room-height', ids: risenRooms.map((r) => r.room), hatched: false, pieces: [] }, said(`drawing.section.taken.roomVoid.${many(risenRooms.length)}`, { count: risenRooms.length, names: ids(names) }))
  }
  const stairRooms = new Set(laid.flatMap((s) => [s.lower.room, s.upper.room]).filter((r): r is string => r !== null))
  const bare = shownRooms.filter((r) => plan.rooms.some((room) => room.id === r.room && floorOf(room) === r.floor && room.use === 'stair') && !stairRooms.has(r.room))
  if (bare.length > 0) {
    taken({ kind: 'no-stair', ids: bare.map((r) => r.room), hatched: false, pieces: [] }, said(`drawing.section.taken.noStair.${many(bare.length)}`, { count: bare.length, ids: ids(bare.map((r) => r.room)) }))
  }
  if (workedRisers.length > 0) {
    taken({ kind: 'risers', ids: workedRisers, hatched: false, pieces: [] }, said('drawing.section.taken.risers', { ids: ids(workedRisers) }))
  }
  if (waisted.length > 0) {
    taken({ kind: 'waist', ids: waisted, hatched: false, pieces: [] }, said('drawing.section.taken.waist', { ids: ids(waisted), waist: num(metresText(stairWaist())) }))
  }

  const outlines = envelope.floors.flatMap((f) => (f.outline == null ? [] : [f.outline]))
  const endIn = (x: number): boolean => outlines.some((o) => inPieces(o, pointAt(x)))
  const reach: SectionReach = { missesBuilding: parts.length === 0, startInside: lineLength > none && endIn(0), endInside: lineLength > none && endIn(lineLength) }
  const glass = parts.filter((p) => p.glazed === true)
  const cut = joined(parts.filter((p) => p.glazed !== true).flatMap((p) => p.rings))
  beyondOrder(faces)
  // VEW-84: what of the building is drawn, across the section, without the ground line.
  const drawn: Vec2[] = [
    ...cut.flatMap((p) => p.outline),
    ...glass.flatMap((p) => p.rings.flat()),
    ...itemParts.flatMap((p) => p.rings.flat()),
    ...faces.flatMap((f) => (f.edge === null ? f.pieces.flatMap((p) => p.outline) : [...f.edge]))
  ]
  const points: Vec2[] = [
    ...drawn,
    ...segments.flatMap(([a, b]) => [{ x: a, y: groundAt(a) }, { x: b, y: groundAt(b) }]),
    { x: 0, y: groundAt(0) },
    { x: lineLength, y: groundAt(lineLength) },
    { x: 0, y: earth.bottom }
  ]
  // VEW-84: where each floor stands across the section.
  const floorSpan = (floor: string): SectionSpan | null => {
    const at: Vec2[] = [
      ...parts.filter((p) => p.floor === floor && p.kind !== 'roof' && p.kind !== 'parapet' && p.kind !== 'item').flatMap((p) => p.rings.flat()),
      ...shownRooms.filter((r) => r.floor === floor).flatMap((r) => [{ x: r.from, y: r.floorLevel }, { x: r.to, y: r.floorLevel }])
    ]
    return at.length === 0 ? null : spanOf(at)
  }
  return {
    line,
    length: lineLength,
    start: frame.start,
    right: frame.right,
    look: frame.look,
    cut,
    parts,
    glass,
    items: itemParts,
    beyond: faces,
    ground: { level: ground.level, stated: ground.stated, segments, earth, ...(fall === undefined ? {} : { fall }) },
    levels: levels.map((level) => withSpan(level, floorSpan(level.floor))).sort((a, b) => a.level - b.level),
    roofs,
    rooms: shownRooms,
    reach,
    assumed: notes,
    bounds: boundsOf(points),
    building: drawn.length === 0 ? null : spanOf(drawn)
  }
}

/** VEW-84: how far across the section points stand. */
function spanOf(points: readonly Vec2[]): SectionSpan {
  return { from: Math.min(...points.map((p) => p.x)), to: Math.max(...points.map((p) => p.x)) }
}

/** VEW-84: a level with where its floor stands across the section, when the line cuts any of it. */
function withSpan(level: SectionLevel, span: SectionSpan | null): SectionLevel {
  return span === null ? level : { ...level, from: span.from, to: span.to }
}

/** VEW-65: the earth from `x0` to `x1`, from `bottom` up to the ground, less the building below the ground. */
function earthBetween(dug: MultiPolygon, x0: number, x1: number, bottom: number, groundAt: (x: number) => number, snap: (v: number) => number): SectionPiece[] {
  if (!(x1 - x0 > tolerance('noLength')) || !(Math.min(groundAt(x0), groundAt(x1)) - bottom > tolerance('noLength'))) return []
  const band = [ringOf(underGround(snap, x0, x1, bottom, groundAt))]
  const left = dug.length === 0 ? [band] : cutOutline('difference', band, [dug])
  if (left === null) return []
  const snapped = (ring: readonly Vec2[]): Vec2[] => ring.map((p) => ({ x: snap(p.x), y: snap(p.y) }))
  return piecesAsRings(left).map((piece) => ({ outline: snapped(piece.outline), holes: piece.holes.map(snapped) }))
}

/**
 * VEW-65: a section's earth and ground line run out to `from` and `to` across the section (`from`
 * at or left of 0, `to` at or right of its length), for a picture to reach its edges: at each end of
 * the line clear of the building below the ground (`earth.open`), and only there. At an end the
 * line stops in the building's part below the ground, both stop at the cut's end, as the cut does.
 */
export function sectionEarth(section: PlanSection, from: number, to: number): { readonly pieces: readonly SectionPiece[]; readonly segments: readonly (readonly [number, number])[] } {
  const snap = snapper()
  const { earth, segments } = section.ground
  const left = earth.open.start ? Math.min(0, from) : 0
  const right = earth.open.end ? Math.max(section.length, to) : section.length
  const dug: MultiPolygon = earth.dug.map((piece) => [ringOf(piece.outline), ...piece.holes.map(ringOf)])
  const pieces = earthBetween(dug, left, right, earth.bottom, (x) => sectionGroundAt(section.ground, x), snap)
  const near = tolerance('shellGrid')
  const out = segments.map(([a, b]): [number, number] => [a <= near ? snap(left) : a, b >= section.length - near ? snap(right) : b])
  return { pieces, segments: out }
}

/** Farthest first; of two as far, a face before a line, so the corner shows. */
/**
 * VEW-79: the faces of one side of a curved wall, by the chord they stand on (null where a chord's
 * face is not seen), joined where they follow each other into one face, the union of their pieces,
 * at the depth of the nearest: its silhouette, with no line where one chord meets the next. A run
 * whose union fails is left as it is. On a whole circle the run carries on past the last chord.
 */
function joinCurveRuns(faces: SectionFace[], side: readonly (SectionFace | null)[], closed: boolean): void {
  const runs: SectionFace[][] = []
  let run: SectionFace[] = []
  for (const one of side) {
    if (one === null) {
      if (run.length > 0) runs.push(run)
      run = []
    } else run.push(one)
  }
  if (run.length > 0) {
    if (closed && runs.length > 0 && side[0] !== null) runs[0] = [...run, ...runs[0]!]
    else runs.push(run)
  }
  for (const pieces of runs) {
    if (pieces.length < 2) continue
    const rings = pieces.flatMap((f) => f.pieces.map((p): Polygon => [ringOf(p.outline), ...p.holes.map((h) => ringOf(h))]))
    const union = rings.length === 0 ? null : cutOutline('union', rings[0]!, rings.slice(1))
    if (union === null || union.length === 0) continue
    const nearest = pieces.reduce((best, f) => (f.depth < best.depth ? f : best), pieces[0]!)
    const one: SectionFace = { ...nearest, pieces: piecesAsRings(union) }
    const gone = new Set<SectionFace>(pieces)
    const at = faces.indexOf(pieces[0]!)
    const kept = faces.filter((f) => !gone.has(f))
    kept.splice(Math.min(at, kept.length), 0, one)
    faces.length = 0
    faces.push(...kept)
  }
}

function beyondOrder(faces: SectionFace[]): void {
  faces.sort((a, b) => b.depth - a.depth || (a.edge === null ? 0 : 1) - (b.edge === null ? 0 : 1))
}

/** Stretches of x joined where they overlap or touch, in order. */
function mergeStretches(stretches: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = [...stretches].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && a <= last[1] + tolerance('noLength')) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** Which side of a wall, across the section, is outside where the line cuts it (MSG-13), or null. */
function outsideAt(frame: Frame, wall: Wall, sides: ReturnType<typeof planWallSides>): 'left' | 'right' | null {
  const found = sides.get(wall.id)
  if (found === undefined) return null
  // CNT-18: on a curved wall, the chord of its curve the line crosses, and how far along the
  // curve that is; a straight wall is its one chord.
  const pieces = wallSegments(wall)
  const crossed = pieces.find((p) => Math.sign(beyondOf(frame, p.start)) !== Math.sign(beyondOf(frame, p.end))) ?? pieces[Math.floor(pieces.length / 2)]!
  const axis = crossed
  // Where the line crosses the wall's axis, along the wall.
  const da = beyondOf(frame, axis.start)
  const db = beyondOf(frame, axis.end)
  const span = axis.to - axis.from
  const s = axis.from + (da === db ? span / 2 : Math.min(span, Math.max(0, (da / (da - db)) * span)))
  const stretch = stretchAt(found, s)
  if (stretch === null || stretch.worked !== 'exterior') return null
  // The outside is the face with no room on it; the wall's normal points at its left face.
  const outward = stretch.left.length === 0 ? axis.normal : scale(axis.normal, -1)
  const x = dot(outward, frame.right)
  return Math.abs(x) <= tolerance('squareCorner') ? null : x > 0 ? 'right' : 'left'
}

/**
 * A level as a drawing writes it, in plan, section and elevation alike (VEW-20): a sign and the
 * figure in the display's unit, ±0 at the datum. Metres keep three decimals (`+94.900`), centimetres
 * one, millimetres none, feet and inches are `31'-9"`; the display's decimal mark is used.
 */
export function levelText(level: number, display: Display = METRES): string {
  const decimals = display.precision ?? (display.length === 'm' ? 3 : display.length === 'cm' ? 1 : 0)
  const shown = display.length === 'ft-in' ? display : { ...display, precision: decimals }
  const figure = showLength(Math.abs(level), shown, { unit: false })
  if (!/[1-9]/.test(figure)) return `±${figure}`
  return `${level < 0 ? '−' : '+'}${figure}`
}

function boundsOf(points: readonly Vec2[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 }, width: 0, height: 0 }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY }, width: maxX - minX, height: maxY - minY }
}
