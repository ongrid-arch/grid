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
 * - the slabs, the roofs and the parapets (`planEnvelope`, LVL-4), open over stairs, lifts and voids;
 * - the stairs the plan states (LVL-3), as they are built (VEW-11, `stairSection.ts`): each flight
 *   its treads and risers over a waist with the soffit beneath, each landing a slab, nothing
 *   solid down to the floor the stair leaves;
 * - the floor of each raised room (LVL-7), solid from its storey's floor up;
 * - the ground the site states (LVL-4), and which side of each cut wall is outside (MSG-13, CNT-3);
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
import { wallTypeOf } from './partTypes'
import type { MultiPolygon } from 'polygon-clipping'
import { heightByDefault } from '../types/floorplan'
import type { Floor, FloorPlan, RoofShape, Wall } from './plan'
import { indexPlan, openingsOf } from './plan'
import { floorOf, planFloors, planForFloor } from './floors'
import { wholeWall } from './through'
import { floorElevations, isFiniteWall, wallTopsUnder, type WallTopUnder } from './elevations'
import { planEnvelope } from './envelope'
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

export type SectionPartKind = 'wall' | 'slab' | 'roof' | 'parapet' | 'stair' | 'floor' | 'plinth'

/** One part of the model the line cuts, as rectangles (a wall, a slab) or blocks (a stair). */
export interface SectionPart {
  readonly kind: SectionPartKind
  /** The wall's or the stair's id, the floor's for a slab, roof, parapet or plinth, the room's for a raised floor. */
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
}

export type SectionFaceKind = 'wall' | 'slab' | 'roof' | 'parapet' | 'stair' | 'plinth'

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
}

export type SectionAssumptionKind = 'slab' | 'roof' | 'wall-height' | 'wall-top' | 'marked' | 'ground' | 'level' | 'room-height' | 'no-stair' | 'risers' | 'waist'

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
  /** What lies beyond the cut, farthest first. */
  readonly beyond: readonly SectionFace[]
  /**
   * The ground: its level, whether the site states it, and the stretches of its line: outside the
   * building, and under a floor that stands clear of it on its plinth (VEW-16).
   */
  readonly ground: { readonly level: number; readonly stated: boolean; readonly segments: readonly (readonly [number, number])[] }
  /** Every floor's level, lowest first. */
  readonly levels: readonly SectionLevel[]
  /** The top of each roof the line cuts, by the floor it covers. */
  readonly roofs: readonly { readonly floor: string; readonly level: number }[]
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
  const ground = groundLevel(plan, elevations)
  const marks = planMarks(plan)
  const parts: SectionPart[] = []
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

  /** A face of the plan, from a to b with its outside toward `outward`, standing between two heights. */
  const face = (kind: SectionFaceKind, id: string, floor: string, a: Vec2, b: Vec2, outward: Vec2, y0: number, y1: number, holes: readonly { readonly a: Vec2; readonly b: Vec2; readonly y0: number; readonly y1: number }[] = []): void => {
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
      faces.push({ kind, id, floor, depth: Math.min(da, db), pieces: [], edge: [{ x: snap(x), y: snap(y0) }, { x: snap(x), y: snap(y1) }] })
      return
    }
    const x0 = Math.max(0, Math.min(xa, xb))
    const x1 = Math.min(frame.length, Math.max(xa, xb))
    if (!(x1 - x0 > none)) return
    const body = rect(snap, x0, x1, y0, y1)
    const cutters = holes.flatMap((hole) => {
      const h0 = Math.max(x0, Math.min(across(frame, hole.a), across(frame, hole.b)))
      const h1 = Math.min(x1, Math.max(across(frame, hole.a), across(frame, hole.b)))
      const top = Math.min(hole.y1, y1)
      const foot = Math.max(hole.y0, y0)
      return h1 - h0 > none && top - foot > none ? [[ringOf(rect(snap, h0, h1, foot, top))]] : []
    })
    const pieces = cutters.length === 0 ? [{ outline: body, holes: [] }] : piecesAsRings(cutOutline('difference', [ringOf(body)], cutters) ?? [[ringOf(body)]])
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
      // VEW-33: a wall through floors keeps its own top; any other may rise to the slab over it.
      const under = wall === part ? topUnder(wall, floor.id) : null
      const raised: Vec2[][] = []
      for (const part of wallParts(wall, openings)) {
        const polygon = wallSlicePolygon(wall, part.from, part.to, ends)
        const atTop = under !== null && part.zTo >= wall.height - none
        for (const [x0, x1] of inside(frame, [polygon])) {
          // VEW-24: a wall's foot beside or in a sunken room is carried down to that room's slab.
          const down = part.zFrom <= none ? Math.min(0, ...sunkSpans.filter((s) => s.from <= x1 + none && s.to >= x0 - none).map((s) => s.offset)) : 0
          rings.push(rect(snap, x0, x1, base + part.zFrom + down, atTop ? under.top : base + part.zTo))
          if (atTop) raised.push(rect(snap, x0, x1, base + wall.height, under.top))
        }
      }
      if (under !== null && raised.length > 0) raisedWalls.push({ floor: floor.id, wall: wall.id, under, rings: raised })
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
      wallFaces(wall, ends, openings, base, floor.id, base - drop, under?.top)
    }

    // A raised room's floor stands on its storey's, solid up to its own (LVL-7).
    const zones = roomZones(index).zoneOf
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
      for (const t of under?.through ?? []) risenVoids.add(`${t.floor}\u0000${t.room}`)
      rooms.push({
        room: room.id,
        floor: floor.id,
        name: room.name,
        from: snap(under?.from ?? from),
        to: snap(under?.to ?? to),
        floorLevel: snap(base + offset),
        height: snap(own ? room.height! : under !== null ? under.top - base - offset : storey.clearHeight - offset),
        heightStated: own,
        ...(room.void === true || outdoorRoofed(room) === false ? { open: true as const } : {}),
        ...(under === null ? {} : { through: under.through.map((t) => t.room) })
      })
    }
  }

  /** The two faces and two ends of a wall, its doors and windows open in its faces. */
  function wallFaces(wall: Wall, ends: typeof SQUARE_ENDS, openings: ReturnType<typeof openingsOf>, base: number, floor: string, foot = base, top = base + wall.height): void {
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
    face('wall', wall.id, floor, l0!, l1!, axis.normal, foot, top, holesOn(half))
    face('wall', wall.id, floor, r0!, r1!, scale(axis.normal, -1), foot, top, holesOn(-half))
    face('wall', wall.id, floor, l1!, r1!, axis.dir, foot, top)
    face('wall', wall.id, floor, r0!, l0!, scale(axis.dir, -1), foot, top)
  }

  /**
   * CNT-18: a curved wall's faces, one flat piece per chord of its curve (each within
   * `arcSagitta` of it), its doors and windows open where they stand along the curve, and an end
   * face only where the wall ends.
   */
  function curvedWallFaces(wall: Wall, openings: ReturnType<typeof openingsOf>, base: number, floor: string, foot = base, top = base + wall.height): void {
    const half = wall.thickness / 2
    const segments = wallSegments(wall)
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
      face('wall', wall.id, floor, l0, l1, segment.normal, foot, top, holesOn(half))
      face('wall', wall.id, floor, r0, r1, scale(segment.normal, -1), foot, top, holesOn(-half))
      if (i === segments.length - 1 && wall.arc!.sweep % 360 !== 0) face('wall', wall.id, floor, l1, r1, segment.dir, foot, top)
      if (i === 0 && wall.arc!.sweep % 360 !== 0) face('wall', wall.id, floor, r0, l0, scale(segment.dir, -1), foot, top)
    })
  }

  // The slabs, roofs and parapets (LVL-4).
  const roofs: { floor: string; level: number }[] = []
  const unstatedSlabs: { floor: Floor; rings: Vec2[][] }[] = []
  const onPlinths = new Set<string>()
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
    const plinth = plinthUnder(shell.slab, ground.level)
    if (plinth !== null) {
      onPlinths.add(floor.id)
      const band = plinthBand(floor.id)
      const rings = inside(frame, ringsOf(band)).map(([x0, x1]) => rect(snap, x0, x1, plinth.bottom, plinth.top))
      if (rings.length > 0) parts.push({ kind: 'plinth', id: floor.id, floor: floor.id, rings })
      for (const piece of piecesAsRings(band)) {
        ringFaces('plinth', floor.id, floor.id, piece.outline, plinth.bottom, plinth.top)
        for (const hole of piece.holes) ringFaces('plinth', floor.id, floor.id, hole, plinth.bottom, plinth.top, true)
      }
    }
    const roof = shell.roof
    if (roof !== null) {
      const roofTop = roof.bottom + roof.thickness
      const rings = inside(frame, ringsOf(roof.pieces)).map(([x0, x1]) => rect(snap, x0, x1, roof.bottom, roofTop))
      if (rings.length > 0) {
        parts.push({ kind: 'roof', id: floor.id, floor: floor.id, rings })
        roofRings.push({ floor, rings, thickness: roof.thickness, shape: roof.shape })
        roofs.push({ floor: floor.id, level: snap(roofTop) })
      }
      for (const piece of piecesAsRings(roof.pieces)) for (const ring of [piece.outline, ...piece.holes]) ringFaces('roof', floor.id, floor.id, ring, roof.bottom, roofTop)
      if (roof.parapet !== null) {
        const parapetTop = roofTop + roof.parapet.height
        const parapet = inside(frame, ringsOf(roof.parapet.pieces)).map(([x0, x1]) => rect(snap, x0, x1, roofTop, parapetTop))
        if (parapet.length > 0) parts.push({ kind: 'parapet', id: floor.id, floor: floor.id, rings: parapet })
        for (const piece of piecesAsRings(roof.parapet.pieces)) for (const ring of [piece.outline, ...piece.holes]) ringFaces('parapet', floor.id, floor.id, ring, roofTop, parapetTop)
      }
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
   * A flight's faces beyond the cut (VEW-11): its two sides, each its profile; the risers seen head-on, one face
   * at its foot (VEW-41); its upper end, from the soffit to its last tread, which also stands for the soffit
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
    // VEW-41: the risers seen head-on are one face at the foot, as tall as the flight, not one column each.
    face('stair', stair.id, stair.lower.floor, lFoot, rFoot, scale(along, -1), profile.lower, profile.topAt(profile.length))
    face('stair', stair.id, stair.lower.floor, lTop, rTop, along, profile.bottomAt(profile.length), profile.topAt(profile.length))
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

  // The ground: outside the floors that meet it, where the line crosses them, run past the building
  // on both sides. VEW-16: a floor on its plinth stands clear of the ground, which runs on under it.
  const meets = floors.filter((floor) => {
    const shell = envelope.floors.find((f) => f.floor === floor.id)
    const level = elevations.floors.get(floor.id)?.floorLevel ?? 0
    return levelOf(floor) === Math.min(...floors.map(levelOf)) || level - (shell?.slab?.thickness ?? 0) <= ground.level
  })
  const stretchesOf = (list: readonly Floor[]): [number, number][] =>
    mergeStretches(
      list.flatMap((floor) => {
        const outline = envelope.floors.find((f) => f.floor === floor.id)?.outline
        return outline == null ? [] : inside(frame, ringsOf(outline), false)
      }).filter(([a, b]) => b > 0 && a < lineLength)
    )
  const building = stretchesOf(meets)
  const reaching = stretchesOf(meets.filter((floor) => !onPlinths.has(floor.id)))
  const run = limit('sectionGroundRun')
  const groundFrom = building.length === 0 ? 0 : Math.min(0, building[0]![0] - run)
  const groundTo = building.length === 0 ? lineLength : Math.max(lineLength, building[building.length - 1]![1] + run)
  const segments: [number, number][] = []
  let cursor = groundFrom
  for (const [a, b] of reaching) {
    if (a - cursor > none) segments.push([snap(cursor), snap(a)])
    cursor = Math.max(cursor, b)
  }
  if (groundTo - cursor > none) segments.push([snap(cursor), snap(groundTo)])

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
    // LVL-6: a roof the floor states stands at its eaves; the section does not draw a slope yet.
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
  const points: Vec2[] = [
    ...cut.flatMap((p) => p.outline),
    ...glass.flatMap((p) => p.rings.flat()),
    ...faces.flatMap((f) => (f.edge === null ? f.pieces.flatMap((p) => p.outline) : [...f.edge])),
    ...segments.flatMap(([a, b]) => [{ x: a, y: ground.level }, { x: b, y: ground.level }]),
    { x: 0, y: ground.level },
    { x: lineLength, y: ground.level }
  ]
  return {
    line,
    length: lineLength,
    start: frame.start,
    right: frame.right,
    look: frame.look,
    cut,
    parts,
    glass,
    beyond: faces,
    ground: { level: ground.level, stated: ground.stated, segments },
    levels: levels.sort((a, b) => a.level - b.level),
    roofs,
    rooms: shownRooms,
    reach,
    assumed: notes,
    bounds: boundsOf(points)
  }
}

/** Farthest first; of two as far, a face before a line, so the corner shows. */
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
