/**
 * The plan, ready to draw.
 *
 * This is the boundary with the UI: shapes and coordinates come out of here,
 * and nothing else. Not one color, line weight or typeface. The consumer emits
 * a `<path>` per polygon and the CSS decides how it looks.
 */

import type { FloorPlan, Opening } from './plan'
import { indexPlan, openingsOf } from './plan'
import type { Vec2 } from './vec2'
import { add, centroid, dot, fromTuple, intersectLines, scale, sub } from './vec2'
import { limit, tolerance } from './tolerances'
import { typeMaterial, wallTypeOf } from './partTypes'
import type { SliceSide, WallAxis } from './wall'
import { openingAxis, openingsCutting, runGuests, type AxisPoint } from './openingRun'
import { openingChord, openingSpan, wallAxis, wallCenterline, wallParts, wallPath, wallPlanSlices, wallSegments, wallSliceShape } from './wall'
import { wallCurve } from './arc'
import { wallJoints } from './joints'
import type { WallExposure } from './exposure'
import { roomFloorArea, roomNesting, tryRoomShape } from './room'
import { poleOfInaccessibility } from './innerPoint'
import { wallExposure, wallSides } from './exposure'
import { isOutdoor } from './outdoor'
import type { Issue } from './validate'
import { brokenOnFloor, validatePlan } from './validate'
import type { PlanStep } from './steps'
import type { PlanNote, PlanSketch } from './writing'
import { planNotes, planSketch, sketchExtent } from './writing'
import { contextOn } from './buildings'
import { boundaryEdgeCount } from '../types/floorplan'
import { planOrientation } from './orientation'
import { planSteps } from './steps'
import type { RiserLine, StairLayout } from './stairs'
import { planStairs } from './stairs'
import type { StairSymbol } from './stairSymbol'
import { arrowHead, stairSymbol } from './stairSymbol'
import type { LiftSymbol } from './liftSymbol'
import { liftSymbol } from './liftSymbol'
import { floorOf, planFloors, wholePlan } from './floors'
import { columnFootprint, columnRoom, columnStandsOn, soundColumns } from './columns'
import { bayFootprint, planRamps, rampsOnFloor, soundBays } from './parking'
import { gridsOn, planGrid, type PlanGrid } from './structuralGrid'
import type { ColumnShape } from '../types/floorplan'
import { statedOutline } from './massing'
import { isRaised, itemBlockSymbol, itemFootprint, itemRoom, itemSymbol, roomShapes } from './items'
import { isLabelledKind, itemKindWord } from './itemKinds'
import { planMarks } from './marks'
import type { MarkedPart, OpeningKind, OpeningPart, Phase } from '../types/floorplan'
import { statedKind } from './openingKinds'
import { planSite, siteExtent, type PlanSite } from './plot'
import { siteFloors } from './site'
import { flatOutlines, type PlanFlatOutline } from './flats'
import { partPhases, planHasPhases, planInState } from './phases'

export interface PlanWall {
  readonly id: string
  readonly virtual: boolean
  /** WRT-76: a virtual outside edge of outdoor space. */
  readonly openEdge?: true
  /** WRT-76: a railing is drawn as a line in plan. */
  readonly railing?: true
  /** WRT-76: a solid wall below the plan cut is drawn in outline. */
  readonly low?: true
  /**
   * Whether it faces the outside or separates two rooms. Derived from the
   * geometry rather than read from the file — it is what gives each wall its
   * line weight.
   */
  readonly exposure: WallExposure
  /**
   * Solid runs, with the openings already taken out and the corners joined to the walls it
   * meets (SHT-2). Empty for virtual walls.
   */
  readonly slices: readonly Vec2[][]
  /** The axis, for drawing virtual walls as a line. */
  readonly centerline: readonly [Vec2, Vec2]
  /** How thick it is, in metres: 0 for a virtual wall, which is a line (SHT-4: where its faces are). */
  readonly thickness: number
  /** WRT-6: the plan marks the wall, or a value of it, assumed. Left out when it does not. */
  readonly assumed?: true
  /**
   * CNT-10: what the work does to it, in a plan with phases; left out in one with none. A
   * demolished wall is drawn as it stands before the work, the others as they will be after it.
   */
  readonly phase?: Phase
  /**
   * CNT-18: a curved wall's arc, exactly, for a drawing or an export that can draw an arc; absent
   * for a straight wall. `path` is its axis by its stations (what a curved dividing line draws as),
   * and `runs` each solid run's two faces exactly, one per slice and in the same order.
   */
  readonly curve?: PlanCurve
  /**
   * SHT-10: the plan states the wall a partition and it stands inside, so a drawing can draw it
   * lighter than an inside wall (`wallDrawnKind`). Left out for every other wall.
   */
  readonly partition?: true
  /** SHT-10: the material of the wall's type (CNT-15, C24), as the person names it, for a detailed drawing's hatch. Left out with none. */
  readonly material?: string
  /**
   * CNT-26: a garden or boundary wall, standing apart from the building (`landscapeWalls`), so a
   * drawing draws it lighter than an outside wall and keys it apart. Left out for every other wall.
   */
  readonly landscape?: true
}

/** CNT-18: a curved wall's arc in a drawing (`PlanWall.curve`). */
export interface PlanCurve {
  readonly centre: Vec2
  readonly radius: number
  /** Radians, counter-clockwise from +X, where the wall starts. */
  readonly startAngle: number
  /** Signed radians, counter-clockwise positive. */
  readonly sweep: number
  readonly path: readonly Vec2[]
  readonly runs: readonly { readonly left: SliceSide; readonly right: SliceSide }[]
}

export interface PlanRoom {
  readonly id: string
  readonly outdoor?: true
  readonly name: string
  readonly polygon: readonly Vec2[]
  /**
   * The room's holes (ARE-6), clockwise where the outline is counter-clockwise, so a path of
   * the outline and its holes leaves them open. Empty for a room with none.
   */
  readonly holes: readonly (readonly Vec2[])[]
  /**
   * Square meters, computed from the polygon, less its holes and the floor of any room marked
   * `inside` that sits in it (`roomArea`). The polygon stays the whole outline: the inner room is
   * drawn over it.
   */
  readonly area: number
  /** Where to place the name label. In a room with holes, a point on its floor, never in a hole. */
  readonly labelAt: Vec2
  /** The floor left for labels when this room has rooms inside it, outer ring first. */
  readonly labelRegions?: readonly (readonly (readonly Vec2[])[])[]
  /** VEW-13: the room's own number, as the plan states it (CNT-9). Left out when it states none. */
  readonly number?: string
  /** WRT-6: the plan marks the room, or a value of it, assumed. Left out when it does not. */
  readonly assumed?: true
  /** CNT-10: what the work does to it, in a plan with phases. Only rooms that stand after the work are drawn. */
  readonly phase?: Phase
}

export interface PlanOpening {
  readonly id: string
  readonly wallId: string
  readonly type: Opening['type']
  /** Ends of the opening on the wall axis. */
  readonly from: Vec2
  readonly to: Vec2
  /** Unit normal of the wall: which way a door symbol swings. */
  readonly normal: Vec2
  /**
   * VEW-77: on a curved wall, or across the joint of a smooth run, the axis from `from` to `to`
   * through the curve's stations, with the normal at each point: a window's lines and the gap's
   * fill follow it. Left out where the opening lies on one straight line, `from` to `to`, which
   * are then the chord across its edges.
   */
  readonly path?: readonly AxisPoint[]
  readonly thickness: number
  readonly width: number
  /** The jamb a door hangs from, when the plan states it (C2: `start` is nearer `wall.start`). */
  readonly hinge?: Opening['hinge']
  /** The face a door opens toward, when the plan states it (`left` is the face `normal` points at). */
  readonly swing?: Opening['swing']
  /** CNT-14: its kind, when the plan states one its type takes. A door with none is one swinging leaf. */
  readonly kind?: OpeningKind
  /** CNT-14: the part of it that opens, when the plan states one. */
  readonly opens?: OpeningPart
  /** CNT-14: how high it is, from its sill, for a symbol that shows what lies overhead (a garage door). */
  readonly height?: number
  /** WRT-6: the plan marks the opening, or a value of it, assumed. Left out when it does not. */
  readonly assumed?: true
  /** CNT-10: what the work does to it, in a plan with phases; left out in one with none. */
  readonly phase?: Phase
  /**
   * SHT-10: a window that lies above the plan's cut (`planCutHeight`): its sill at or above it,
   * or a high-level window (CNT-14). A drawing draws it dashed. Left out for every other opening.
   */
  readonly above?: true
}

/** A fixture or a piece of furniture, ready to draw (CNT-12): its footprint and its symbol inside it, to scale. */
export interface PlanItem {
  readonly id: string
  /** Its kind, one the kinds registry holds (CNT-20: `itemKinds.ts`). */
  readonly kind: string
  /** What it is called: its label, else its kind's word. */
  readonly label: string
  /** The room it stands in, or null. */
  readonly room: string | null
  /** The floor it covers, counter-clockwise. */
  readonly outline: readonly Vec2[]
  /** Rings to fill with the paper and outline, in order, then lines over them (`itemSymbol`). */
  readonly rings: readonly (readonly Vec2[])[]
  readonly lines: readonly (readonly Vec2[])[]
  /**
   * CNT-20: where it stands and how it is turned, for a drawing that places one symbol many
   * times (the DXF's blocks): its middle, its turn in degrees counter-clockwise, its width and
   * depth, the library entry it was placed from, and its symbol in its own frame (`itemBlockSymbol`).
   */
  readonly at: Vec2
  readonly turn: number
  readonly size: readonly [number, number]
  readonly library?: string
  readonly block: { readonly rings: readonly (readonly Vec2[])[]; readonly lines: readonly (readonly Vec2[])[] }
  /** WRT-6: the plan marks the fixture, or a value of it, assumed. Left out when it does not. */
  readonly assumed?: true
  /** CNT-55: it hangs above the plan's cut (`isRaised`: a wall unit, a hood), drawn dashed with no fill. Left out when it does not. */
  readonly raised?: true
  /** CNT-55: its kind draws its label inside it (a fryer, a range), in the plan and the DXF. Left out when it does not. */
  readonly labelled?: true
}

/**
 * A column, ready to draw (CNT-16): the floor it covers, cut through as a wall is. A round
 * column also gives its middle and radius, so a drawing can draw its true circle.
 */
export interface PlanColumn {
  readonly id: string
  readonly shape: ColumnShape
  /** What it is called: its label, else null. */
  readonly label: string | null
  /** The room it stands in, or null. */
  readonly room: string | null
  /** The floor it covers, counter-clockwise (`columnFootprint`). */
  readonly outline: readonly Vec2[]
  readonly centre: Vec2
  /** A round column's radius; absent on a square one. */
  readonly radius?: number
}

/**
 * A parking bay, ready to draw (CNT-19): its outline, the usual painted marking, and its number,
 * which the drawing writes in its middle.
 */
export interface PlanBay {
  readonly id: string
  /** Its number as marked, else null. */
  readonly number: string | null
  /** The floor it covers, counter-clockwise (`bayFootprint`). */
  readonly outline: readonly Vec2[]
  readonly centre: Vec2
}

/**
 * A ramp, as one of the floors it joins draws it (CNT-19): its outline, its middle line from the
 * lower end to the upper, which the drawing ends with an arrow pointing up, and its slope, which
 * the drawing writes along it. The figures are the ones `planRamps` works out.
 */
export interface PlanRamp {
  readonly id: string
  readonly name: string
  /** Whether this floor is the ramp's lower end or its upper end. */
  readonly end: 'lower' | 'upper'
  /** A band along each stretch of its middle line, then a square at each turn, counter-clockwise. */
  readonly pieces: readonly (readonly Vec2[])[]
  /** Its middle line, lower end first. */
  readonly line: readonly Vec2[]
  /** Its slope in percent, worked out from its levels and its run. */
  readonly slope: number
  /** The slope the plan states, in percent, or null. */
  readonly statedSlope: number | null
  /** The arrow head at the upper end of its middle line, a triangle, tip first; null with no last stretch. */
  readonly arrow: readonly Vec2[] | null
  /** Where its slope is written: halfway along its middle line. */
  readonly labelAt: Vec2
}

/**
 * A stair the plan states, as one of the floors it joins draws it (LVL-3): its flights with a
 * line across at every riser, its landings, and its walking line from the lower end to the upper,
 * which the drawing ends with an arrow pointing up. The figures are the ones `planStairs` works
 * out, so a label can say them without measuring.
 */
export interface PlanStair {
  readonly id: string
  readonly name: string
  /** Whether this floor is the stair's lower end or its upper end. */
  readonly end: 'lower' | 'upper'
  readonly flights: readonly { readonly outline: readonly Vec2[]; readonly riserLines: readonly RiserLine[] }[]
  readonly landings: readonly (readonly Vec2[])[]
  /** The walking line, lower end first. */
  readonly line: readonly Vec2[]
  readonly risers: number
  readonly riserHeight: number
  readonly going: number
  /**
   * SHT-11: the symbol as this floor draws it: on the lower floor cut at `planCutHeight`, with a
   * break line and the part above it marked to be dashed; on the upper floor whole. Every line
   * the drawing draws for the stair is here.
   */
  readonly symbol: StairSymbol
}

/** A laid-out stair as the floor `floor` draws it; on a plan that is no slice, as its lower floor does. */
export function planStair(stair: StairLayout, floor: string | null): PlanStair {
  const end = floor !== null && floor === stair.upper.floor ? 'upper' : 'lower'
  return {
    id: stair.id,
    name: stair.name,
    end,
    flights: stair.flights.map((f) => ({ outline: f.outline, riserLines: f.riserLines })),
    landings: stair.landings.map((l) => l.outline),
    line: stair.line,
    risers: stair.risers,
    riserHeight: stair.riserHeight,
    going: stair.going,
    symbol: stairSymbol(stair, end)
  }
}

/** SHT-11: a room used as a lift shaft, with its symbol: a cross in the shaft. */
export interface PlanLift {
  /** The room's id. */
  readonly id: string
  readonly lines: LiftSymbol['lines']
}

export interface Bounds {
  readonly min: Vec2
  readonly max: Vec2
  readonly width: number
  readonly height: number
}

/**
 * A room the drawing could not draw (MSG-8): it has no outline of its own, so it stands as the
 * box round the walls it lists, to their faces, so a reader sees where it should be.
 */
export interface UndrawnRoom {
  readonly id: string
  readonly name: string
  readonly box: Bounds
}

/** The plan's geometry, resolved. Not the model — what gets drawn. */
export interface PlanDrawing {
  readonly walls: readonly PlanWall[]
  readonly rooms: readonly PlanRoom[]
  readonly openings: readonly PlanOpening[]
  /**
   * Where a room at one level meets a room at another (LVL-7): a line across each door or
   * doorless opening between them, and along a dividing line between them. Empty when every
   * room stands on its storey's floor.
   */
  readonly steps: readonly PlanStep[]
  /**
   * The stairs the plan states that start or end on this floor (LVL-3), each drawn on both. Empty
   * when the plan states none.
   */
  readonly stairs: readonly PlanStair[]
  /** SHT-11: the rooms used as a lift that could be drawn, each with its cross. Empty with none. */
  readonly lifts: readonly PlanLift[]
  /**
   * SHT-11 with CNT-4: each flat of the plan's flats list with a room on this floor that could be
   * drawn, as its outline: its rooms grown to the middle of the walls round them, joined. Empty
   * when the plan lists no flats.
   */
  readonly flats: readonly PlanFlatOutline[]
  /**
   * The rooms that could not be drawn, each as the box round the walls it lists that the plan
   * holds (MSG-8). A room none of whose walls can be found has no box and is not here.
   */
  readonly undrawn: readonly UndrawnRoom[]
  /** The fixtures (CNT-12), drawn over the room fills and under the walls. Empty when the plan has none. */
  readonly items: readonly PlanItem[]
  /** SHT-7: the sketch layer, drawn only: never measured, checked or taken as a wall. */
  readonly sketch: readonly PlanSketch[]
  /** SHT-7: the notes, tags, symbols and key written on the drawing. */
  readonly notes: readonly PlanNote[]
  /**
   * CNT-3: the plan's stated north, for the drawing's north arrow: the way north points, in
   * radians counter-clockwise from +Y. Null when the plan states no north, or places a north
   * symbol of its own on this floor (which then points to it).
   */
  readonly north: { readonly turn: number } | null
  /** SHT-7: the box round the sketch layer, so a view frames it too; null with none. */
  readonly sketchBounds: Bounds | null
  /**
   * BRF-3: the plot's boundary, its street edges and the site's things, on the ground floor's
   * plan only (`siteFloors`); null on another floor, or when the plan states none. Drawn only.
   */
  readonly site: PlanSite | null
  /** BRF-3: the box round the site, so a view frames the plot too; null with no site drawn. */
  readonly siteBounds: Bounds | null
  /**
   * BRF-4 (C17): the outline the floor states, its corners in order, drawn as a line round the
   * floor: massing before any wall, and the outside face the walls are drawn inside. Left out
   * when the floor states none.
   */
  readonly outline?: readonly Vec2[]
  /**
   * CNT-6 (C23): the context shapes drawn round the plan on this floor (a neighbour's house, the
   * hall a stand stands in), each its outline's corners in order. Drawn only: in no measure or
   * check. Left out when the floor has none.
   */
  readonly context?: readonly { readonly id: string; readonly name: string | null; readonly points: readonly Vec2[] }[]
  /**
   * CNT-16 (C25): the columns standing on this floor, drawn cut through as the walls are. Left out
   * when the plan states none.
   */
  readonly columns?: readonly PlanColumn[]
  /**
   * CNT-16 (C25): the structural grids drawn on this floor, each its named lines; the spacing is
   * dimensioned by `buildDimensions`. Drawn only. Left out when none is drawn here.
   */
  readonly grids?: readonly PlanGrid[]
  /** CNT-19 (C29): the parking bays on this floor, each its marking and number. Left out when the plan states none. */
  readonly bays?: readonly PlanBay[]
  /** CNT-19 (C29): the ramps that start or end on this floor, each drawn on both. Left out when the plan states none. */
  readonly ramps?: readonly PlanRamp[]
  /** Envelope of the whole drawing, for computing the viewBox. */
  readonly bounds: Bounds
  /** What could not be drawn and why. Never a reason to skip the rest. */
  readonly issues: readonly Issue[]
}

const EMPTY_BOUNDS: Bounds = {
  min: { x: 0, y: 0 },
  max: { x: 0, y: 0 },
  width: 0,
  height: 0
}

export function computeBounds(points: readonly Vec2[]): Bounds {
  if (points.length === 0) return EMPTY_BOUNDS
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * The envelope of every wall in the plan, across all floors.
 *
 * Unlike the per-floor `bounds` a drawing or scene carries, this does not depend
 * on which floor is showing — which is what the 3D camera needs, since framing
 * and orbiting around a per-floor centre would move the pivot every time the
 * user changed storey.
 *
 * Reads the raw `start`/`end` tuples rather than going through `wallAxis`, so a
 * zero-length wall gives no bounds rather than throwing. No validation, and no
 * elevations — there is no z in the file (C5).
 */
export function planBounds(plan: FloorPlan): Bounds {
  const points: Vec2[] = []
  for (const wall of plan.walls) {
    points.push(fromTuple(wall.start), fromTuple(wall.end))
    // CNT-18: a curve bows out past its ends.
    const curve = wall.arc === undefined ? null : wallCurve(wall)
    if (curve !== null && curve.radius > 0) points.push(...wallPath(wall))
  }
  return computeBounds(points)
}

/**
 * Turns the plan model into drawable shapes.
 *
 * A broken plan does not make this fail: whatever cannot be built is skipped
 * and recorded in `issues`.
 */
/**
 * CNT-10: a plan with phases is drawn as it will be after the work, each wall, opening and room
 * with its phase, and the walls and openings to be demolished as they stand before it, first in
 * the lists so that what stands after the work is drawn over them. Each state's corners are
 * joined among its own walls, so a demolished wall never bends a new one. A plan with no phases
 * is drawn as it always was.
 */
export function buildFloorPlan(plan: FloorPlan): PlanDrawing {
  if (!planHasPhases(plan)) {
    const index = indexPlan(plan)
    const { issues, broken } = validatePlan(plan, index)
    return buildDrawing(plan, index, issues, broken, null)
  }
  const { issues, broken } = validatePlan(plan)
  const phases = partPhases(plan)
  const afterPlan = planInState(plan, 'after')
  const after = buildDrawing(afterPlan, indexPlan(afterPlan), issues, broken, phases)
  const beforePlan = planInState(plan, 'before')
  const before = buildDrawing(beforePlan, indexPlan(beforePlan), issues, broken, phases)
  const demolished = (part: { readonly phase?: Phase }): boolean => part.phase === 'demolished'
  const walls = [...before.walls.filter(demolished), ...after.walls]
  const openings = [...before.openings.filter(demolished), ...after.openings]
  const extent = [after.bounds.min, after.bounds.max, ...walls.filter(demolished).flatMap((wall) => [...wall.slices.flat(), ...wall.centerline, ...(wall.curve?.path ?? [])])]
  return { ...after, walls, openings, bounds: computeBounds(after.walls.length + after.rooms.length + after.items.length + after.stairs.length === 0 ? extent.slice(2) : extent) }
}

function buildDrawing(plan: FloorPlan, index: ReturnType<typeof indexPlan>, issues: readonly Issue[], broken: ReadonlySet<string>, phases: ReadonlyMap<string, Phase> | null): PlanDrawing {
  const phaseOf = (id: string): { phase?: Phase } => {
    const phase = phases?.get(id)
    return phase === undefined ? {} : { phase }
  }
  // WRT-6: what the plan marks assumed is drawn in its own style; only those parts get the key.
  const marks = planMarks(plan)
  const assumed = (part: MarkedPart, id: string): { assumed?: true } => (marks.assumed(part, id) ? { assumed: true } : {})

  const walls: PlanWall[] = []
  const openings: PlanOpening[] = []
  const extent: Vec2[] = []
  // The corners, joined once for the walls this drawing holds (SHT-2).
  const sound = plan.walls.filter((wall) => !broken.has(wall.id))
  const joints = wallJoints(sound)
  // VEW-77: the openings that run on from one wall of a smooth run onto the next.
  const guests = runGuests(sound, plan.openings.filter((o) => !broken.has(o.id)))

  for (const wall of plan.walls) {
    if (broken.has(wall.id)) continue

    const own = openingsOf(index, wall.id).filter((o) => !broken.has(o.id))
    // Each wall leaves the gaps of its own openings and of those that run onto it.
    const usable = openingsCutting(own, guests, wall.id)
    const ends = joints.get(wall.id)
    const slices = wall.virtual ? [] : wallPlanSlices(wall, usable, ends)
    const curve = wallCurve(wall)
    const path = wallPath(wall)
    const exposure = wallExposure(index, wall.id)
    const material = typeMaterial(wallTypeOf(plan, wall))
    const sides = wallSides(index, wall.id)
    const listedBy = index.roomsByWall.get(wall.id) ?? []
    const openEdge = wall.virtual === true && listedBy.length > 0 && listedBy.every(isOutdoor) &&
      sides?.stretches.every((stretch) => stretch.left.length === 0 || stretch.right.length === 0) === true

    walls.push({
      id: wall.id,
      virtual: wall.virtual === true,
      ...(openEdge && { openEdge: true as const }),
      ...(wall.virtual !== true && (wall.railing === true ? { railing: true as const } : wall.height < limit('planCutHeight') ? { low: true as const } : {})),
      exposure,
      slices,
      centerline: wallCenterline(wall),
      thickness: wall.virtual ? 0 : wall.thickness,
      ...(curve !== null && {
        curve: {
          centre: curve.centre,
          radius: curve.radius,
          startAngle: curve.startAngle,
          sweep: curve.sweep,
          path,
          runs: wall.virtual
            ? []
            : wallParts(wall, usable)
                .filter((part) => part.kind === 'solid')
                .map((part) => wallSliceShape(wall, part.from, part.to, ends))
        }
      }),
      ...assumed('wall', wall.id),
      ...phaseOf(wall.id),
      // SHT-10: a stated partition standing inside, and its type's material, for the drawing's detail.
      ...(wall.kind === 'partition' && !wall.virtual && exposure === 'interior' && { partition: true as const }),
      ...(material !== null && !wall.virtual && { material }),
      ...(sides?.landscape === true && { landscape: true as const })
    })

    for (const slice of slices) extent.push(...slice)
    extent.push(...path)

    for (const opening of own) {
      const span = openingSpan(opening)
      // The line between its edges (C21): on a curved wall, or along a smooth run (VEW-77), the
      // chord between them, and the axis it follows.
      const axis = openingAxis(sound, opening, wall)
      const hole = axis?.bends === true ? axis.chord : openingChord(wall, span.from, span.to)
      const kind = statedKind(opening.type, opening.kind)
      openings.push({
        id: opening.id,
        wallId: wall.id,
        type: opening.type,
        from: hole.start,
        to: hole.end,
        normal: hole.normal,
        ...(axis?.bends === true && { path: axis.points }),
        // A dividing line has no width, so neither has a gap in it: it must not paint the
        // written thickness across the floor.
        thickness: wall.virtual ? 0 : wall.thickness,
        width: opening.width,
        // Only what the plan states: an undecided door has no key, so nothing downstream guesses.
        ...(opening.hinge !== undefined && { hinge: opening.hinge }),
        ...(opening.swing !== undefined && { swing: opening.swing }),
        ...(kind !== null && { kind }),
        ...(opening.opens !== undefined && { opens: opening.opens }),
        height: opening.height,
        ...assumed('opening', opening.id),
        ...phaseOf(opening.id),
        // SHT-10: a window wholly above the plan's cut is drawn dashed.
        ...(opening.type === 'window' && (kind === 'high-level' || (opening.sill !== undefined && opening.sill >= limit('planCutHeight'))) && { above: true as const })
      })
    }
  }

  const nesting = roomNesting(index)
  const rooms: PlanRoom[] = []
  const lifts: PlanLift[] = []
  const undrawn: UndrawnRoom[] = []
  for (const room of plan.rooms) {
    const shape = broken.has(room.id) ? null : tryRoomShape(room, index)
    if (!shape) {
      const box = boxRoundWalls(room, index)
      if (box) undrawn.push({ id: room.id, name: room.name, box })
      continue
    }
    const { polygon, holes } = shape
    const host = nesting.hosts.get(room.id)
    const labelRegions = host?.rooms.length
      ? host.region.map((region) => region.map((ring) => ring.slice(0, -1).map(fromTuple)))
      : undefined
    if (room.use === 'lift') lifts.push({ id: room.id, lines: liftSymbol(polygon, holes).lines })
    rooms.push({
      id: room.id,
      name: room.name,
      ...(isOutdoor(room) && { outdoor: true as const }),
      polygon,
      holes,
      // Less its holes (ARE-6) and the floor of any room marked `inside` that sits in it (ARE-5).
      area: roomFloorArea(room, index, polygon),
      // The middle of the corners of a ring lies in its hole: there, the point of its floor
      // farthest from every edge.
      labelAt: holes.length === 0 ? centroid(polygon) : poleOfInaccessibility(polygon, undefined, holes).point,
      ...(labelRegions === undefined ? {} : { labelRegions }),
      ...(room.number === undefined ? {} : { number: room.number }),
      ...assumed('room', room.id),
      ...phaseOf(room.id)
    })
    extent.push(...polygon)
  }

  const items: PlanItem[] = []
  if ((plan.items ?? []).length > 0) {
    const shapes = roomShapes(index, broken)
    for (const item of plan.items ?? []) {
      const symbol = broken.has(item.id) ? null : itemSymbol(item)
      const block = symbol === null ? null : itemBlockSymbol(item)
      if (symbol === null || block === null) continue
      const outline = itemFootprint(item)
      items.push({
        id: item.id,
        kind: item.kind,
        label: item.label ?? itemKindWord(item.kind),
        room: itemRoom(item, shapes)?.id ?? null,
        outline,
        rings: symbol.rings,
        lines: symbol.lines,
        at: { x: item.at[0], y: item.at[1] },
        turn: item.turn ?? 0,
        size: item.size,
        ...(item.library === undefined ? {} : { library: item.library }),
        block,
        ...assumed('item', item.id),
        ...(isRaised(item) ? { raised: true as const } : {}),
        ...(isLabelledKind(item.kind) ? { labelled: true as const } : {})
      })
      extent.push(...outline)
    }
  }

  // The stairs that start or end here, read from the plan this floor was cut from.
  const floor = wholePlan(plan).floor
  const stairs = (plan.stairs ?? []).length === 0 ? [] : planStairs(plan, floor === null ? () => broken : brokenOnFloor).stairs.map((stair) => planStair(stair, floor))
  for (const stair of stairs) for (const flight of stair.flights) extent.push(...flight.outline)

  const sketch = planSketch(plan)
  const notes = planNotes(plan, (id) => rooms.find((room) => room.id === id)?.labelAt)
  const sketchBounds = sketch.length === 0 ? null : computeBounds(sketchExtent(sketch))
  const stated = planOrientation(plan).north
  const north = stated === null || notes.some((note) => note.kind === 'symbol' && note.symbol === 'north') ? null : { turn: (stated * Math.PI) / 180 }
  // BRF-3: the site on the ground floor's plan, and on a plan that is no slice. CNT-25: which
  // floors those are is asked only of a plan with a site, since it works out every floor's level.
  const sited = planSite(plan)
  const site = sited === null || floor === null || siteFloors(wholePlan(plan).whole).includes(floor) ? sited : null
  const siteBounds = site === null ? null : computeBounds(siteExtent(site))
  const flats = flatOutlines(plan, index, broken)
  // BRF-4 (C17): the floor's stated outline, on its own plan; on a plan that is no slice, its one floor's.
  const floors = planFloors(plan)
  const drawnFloor = floor ?? (floors.length === 1 ? floors[0]!.id : null)
  const statedRing = drawnFloor === null ? null : statedOutline(plan, drawnFloor)
  const floorRing = statedRing === null ? null : statedRing[0]!.slice(0, -1).map(([x, y]) => ({ x, y }))
  if (floorRing !== null) extent.push(...floorRing)
  // CNT-6 (C23): the context round the plan, on the floor drawn; framed with it.
  const context = (drawnFloor === null ? [] : contextOn(plan, drawnFloor)).map((shape) => {
    const ring = boundaryEdgeCount(shape.points) === shape.points.length ? shape.points : shape.points.slice(0, -1)
    return { id: shape.id, name: shape.name ?? null, points: ring.map(([x, y]) => ({ x, y })) }
  })
  for (const shape of context) extent.push(...shape.points)
  // CNT-16 (C25): the columns standing here, and the structural grids drawn on this floor.
  const columns = planColumns(plan, index)
  for (const column of columns ?? []) extent.push(...column.outline)
  const grids = gridsOn(plan, drawnFloor).map(planGrid)
  for (const grid of grids) for (const line of grid.lines) extent.push(line.from, line.to)
  // CNT-19 (C29): the parking bays on this floor, and the ramps that start or end on it.
  const bays = plan.bays === undefined ? undefined : soundBays(plan).map((bay): PlanBay => ({ id: bay.id, number: bay.number ?? null, outline: bayFootprint(bay), centre: { x: bay.at[0], y: bay.at[1] } }))
  for (const bay of bays ?? []) extent.push(...bay.outline)
  const ramps = plan.ramps === undefined ? undefined : (drawnFloor === null ? planRamps(plan).ramps : rampsOnFloor(plan, drawnFloor)).map((ramp): PlanRamp => ({
    id: ramp.id,
    name: ramp.name,
    end: drawnFloor !== null && drawnFloor === ramp.upper.floor ? 'upper' : 'lower',
    pieces: ramp.pieces,
    line: ramp.line,
    slope: ramp.slope,
    statedSlope: ramp.statedSlope,
    arrow: arrowHead(ramp.line, ramp.width),
    labelAt: alongLine(ramp.line, ramp.length / 2)
  }))
  for (const ramp of ramps ?? []) for (const piece of ramp.pieces) extent.push(...piece)
  return {
    walls, rooms, openings, steps: planSteps(plan, index, broken), items, undrawn, stairs, lifts, flats, sketch, notes, north, sketchBounds, site, siteBounds,
    ...(floorRing === null ? {} : { outline: floorRing }),
    ...(context.length === 0 ? {} : { context }),
    ...(columns === undefined ? {} : { columns }),
    ...(grids.length === 0 ? {} : { grids }),
    ...(bays === undefined ? {} : { bays }),
    ...(ramps === undefined ? {} : { ramps }),
    bounds: computeBounds(extent),
    issues
  }
}

/** CNT-19: the point `at` metres along a line from its first point, or its last point past its end. */
function alongLine(line: readonly Vec2[], at: number): Vec2 {
  let left = at
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const stretch = Math.hypot(b.x - a.x, b.y - a.y)
    if (stretch > 0 && left <= stretch) return { x: a.x + ((b.x - a.x) * left) / stretch, y: a.y + ((b.y - a.y) * left) / stretch }
    left -= stretch
  }
  return line[line.length - 1] ?? { x: 0, y: 0 }
}

/** CNT-16: the columns a drawing of this plan (or floor's slice) draws; undefined when the plan states none. */
function planColumns(plan: FloorPlan, index: ReturnType<typeof indexPlan>): PlanColumn[] | undefined {
  if (plan.columns === undefined) return undefined
  const floors = planFloors(plan)
  const rooms = roomShapes(index)
  return soundColumns(plan).map((column) => {
    const floor = floors.find((f) => columnStandsOn(plan, column, f.id))?.id ?? floorOf(column)
    return {
      id: column.id,
      shape: column.shape,
      label: column.label ?? null,
      room: columnRoom(column, rooms, floor)?.id ?? null,
      outline: columnFootprint(column),
      centre: { x: column.at[0], y: column.at[1] },
      ...(column.shape === 'round' ? { radius: column.width / 2 } : {})
    }
  })
}

/**
 * The box round the walls a room lists, round it and its holes (MSG-8), to their faces.
 *
 * Where two of the walls meet, their axes cross within both walls (give or take half the other
 * wall's thickness and `wallContact`): those corners bound the room, so a long outside wall the
 * room shares with others does not stretch its box. With fewer corners than make a box, it is
 * the box round the whole walls. Null when the room lists no wall the plan holds.
 */
function boxRoundWalls(room: FloorPlan['rooms'][number], index: ReturnType<typeof indexPlan>): Bounds | null {
  const walls: { axis: WallAxis; half: number }[] = []
  for (const id of new Set([...room.boundary, ...(room.holes ?? []).flat()])) {
    const wall = index.wallsById.get(id)
    if (!wall || ![...wall.start, ...wall.end].every(Number.isFinite)) continue
    const half = Number.isFinite(wall.thickness) && wall.thickness > 0 ? wall.thickness / 2 : 0
    // CNT-18: a curved wall stands as its straight pieces, when it can be built at all.
    if (wall.arc !== undefined) {
      const curve = wallCurve(wall)
      if (curve !== null && curve.radius > 0 && [...wall.arc.centre].every(Number.isFinite)) {
        for (const axis of wallSegments(wall)) walls.push({ axis, half })
      }
      continue
    }
    if (wall.start[0] === wall.end[0] && wall.start[1] === wall.end[1]) continue
    walls.push({ axis: wallAxis(wall), half })
  }
  if (walls.length === 0) return null
  const half = Math.max(...walls.map((wall) => wall.half))
  const widen = (points: readonly Vec2[]): Bounds =>
    computeBounds(points.flatMap((p) => [{ x: p.x - half, y: p.y - half }, { x: p.x + half, y: p.y + half }]))

  const contact = tolerance('wallContact')
  const within = (p: Vec2, axis: WallAxis, slack: number): boolean => {
    const along = dot(sub(p, axis.start), axis.dir)
    return along >= -slack && along <= axis.length + slack
  }
  const corners: Vec2[] = []
  walls.forEach((a, i) => {
    for (const b of walls.slice(i + 1)) {
      const p = intersectLines({ point: a.axis.start, dir: a.axis.dir }, { point: b.axis.start, dir: b.axis.dir })
      if (p && within(p, a.axis, b.half + contact) && within(p, b.axis, a.half + contact)) corners.push(p)
    }
  })
  const box = computeBounds(corners)
  if (corners.length >= 3 && box.width > 0 && box.height > 0) return widen(corners)
  return widen(walls.flatMap((wall) => [wall.axis.start, wall.axis.end]))
}

/** Envelope with a margin, in meters, so the drawing is not flush to the edge. */
export function padBounds(bounds: Bounds, margin: number): Bounds {
  const offset = scale({ x: 1, y: 1 }, margin)
  const min = add(bounds.min, scale(offset, -1))
  const max = add(bounds.max, offset)
  return { min, max, width: max.x - min.x, height: max.y - min.y }
}
