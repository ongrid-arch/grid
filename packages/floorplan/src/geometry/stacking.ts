/**
 * Floors that line up (LVL-5, lab WR-9, E-9): each floor's outline set against the floor below it.
 *
 * Floors are drawn one over the other, each with its own walls (C5), so widening one leaves the
 * other where it was, with nothing said (E-9: the ground floor 0.30 m wider than the floor above,
 * seen only in a 3D picture). Here each floor's outline, as its walls draw it (`floorSpaces`), is set
 * against the outline of the floors under it (LVL-11: in its own building, by where they stand,
 * see `stackingIssues`): where it reaches past them it overhangs, and
 * where they reach past it it sits back. A stretch no deeper than `stackShift` and half the
 * thickest wall it runs along lines up, as the faces of walls of different thickness on one axis
 * do (the scoreboard's sound buildings have outside walls from 0.20 to 0.50 m on each floor). Only floors with a room on them are
 * compared: a parapet or a lone wall is no floor plate. Either way it is a warning, as an
 * overhang or a set-back is often meant: a floor that states `overhang: "meant"` is not asked about.
 * A floor wholly inside the floors below (a mezzanine, a part upper floor, the floor over a
 * single-storey extension) is a part floor, said once by its sides (`floor/set-back`, LVL-10).
 * A floor a half level up beside another of its building, with nothing under it, is a split level,
 * and the plan's split levels are said once (`floor/split-level`, LVL-11), never as an overhang.
 *
 * Pure, and never throws: a pair of floors the polygon library cannot cut is not compared.
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import type { Floor, FloorPlan, Wall } from './plan'
import type { FloorSpaces } from './spaces'
import type { Issue } from './validate'
import { floorOf, planFloors, wallsOnFloor } from './floors'
import { multiArea } from './polygons'
import { TOLERANCES, tolerance } from './tolerances'
import { metresText } from './rounding'
import { english, joined, name, num, said, type Said, type Value } from '../messages/say'
import { withSaid } from './issueWords'
import { wallPath } from './wall'
import { curveFault } from './arc'
import { SLAB_THICKNESS, floorElevations, tallestDrawnWall, type BuildingElevations } from './elevations'
import { buildingOfFloor } from './buildings'

const levelOf = (floor: Floor): number => (Number.isFinite(floor.level) ? floor.level : 0)

/**
 * Points on the finest grid the overlap cuts use: an outline's corners made good leave notches a
 * nanometre deep, which would join a strip past the floor below to slivers along its sides.
 */
const GRID = TOLERANCES.overlapGrids.values[TOLERANCES.overlapGrids.values.length - 1]!
const snap = (v: number): number => Math.round(v / GRID) * GRID
const closed = (ring: readonly { x: number; y: number }[]): Pair[] => [...ring.map((p): Pair => [snap(p.x), snap(p.y)]), [snap(ring[0]!.x), snap(ring[0]!.y)]]
const asMulti = (outline: FloorSpaces['outline']): MultiPolygon => outline.filter((piece) => piece.length > 0 && piece[0]!.length >= 3).map((piece): Polygon => piece.map(closed))

/** A stretch of one outline past another: its box on the plan, how far across it is, and the side. */
interface Stretch {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  /** How far it reaches past: its extent toward its side, or across it (`widthOf`) all round. */
  readonly depth: number
  /** The side of the floor below it lies on, or all round it when it goes round the floor. */
  readonly side: 'north' | 'east' | 'south' | 'west' | 'all round'
  readonly area: number
}

type Frame = { x0: number; y0: number; x1: number; y1: number }

/**
 * The thickest solid wall of either floor that runs along a stretch: within half its thickness
 * and `gap` of the stretch's box.
 */
function thickestAlong(box: Frame, walls: readonly Wall[]): number {
  let thickest = 0
  for (const wall of walls) {
    if (wall.virtual === true || !(wall.thickness > 0)) continue
    const reach = wall.thickness / 2 + tolerance('gap')
    // Its box round its axis: a curved wall's (CNT-18) round its curve, not between its ends. A
    // straight wall is boxed between its ends, which needs no length.
    const ends = [{ x: wall.start[0], y: wall.start[1] }, { x: wall.end[0], y: wall.end[1] }]
    const path = wall.arc !== undefined && curveFault(wall) === null ? wallPath(wall) : ends
    const [x0, x1] = [Math.min(...path.map((p) => p.x)) - reach, Math.max(...path.map((p) => p.x)) + reach]
    const [y0, y1] = [Math.min(...path.map((p) => p.y)) - reach, Math.max(...path.map((p) => p.y)) + reach]
    if (x0 <= box.x1 && box.x0 <= x1 && y0 <= box.y1 && box.y0 <= y1) thickest = Math.max(thickest, wall.thickness)
  }
  return thickest
}

/**
 * How deep a stretch may be and still be walls of different thickness on one axis: `stackShift`,
 * and half the thickest solid wall of either floor that runs along it. A 0.45 m ground floor wall
 * under a 0.25 m one, on one axis, puts their faces 0.10 m apart.
 */
const allowed = (box: Frame, walls: readonly Wall[]): number => tolerance('stackShift') + thickestAlong(box, walls) / 2

/**
 * LVL-11: how wide two floors' outlines may overlap and still only share a wall: `stackShift` and
 * the whole of the thickest wall along the overlap. Two halves of a split level, each drawn to the
 * outside face of the wall between them, overlap by its thickness, and neither lies under the other.
 */
const sharedOnly = (box: Frame, walls: readonly Wall[]): number => tolerance('stackShift') + thickestAlong(box, walls)

/**
 * How wide a piece is across: the width of the strip with its area and the length of its edges,
 * every ring. Exact for a rectangle (a strip along one side), and close for a frame round a floor
 * or an L round a corner, where its box would give the length of a side.
 */
function widthOf(piece: Polygon, area: number): number {
  let perimeter = 0
  for (const ring of piece) for (let i = 0; i + 1 < ring.length; i++) perimeter += Math.hypot(ring[i + 1]![0] - ring[i]![0], ring[i + 1]![1] - ring[i]![1])
  return (perimeter - Math.sqrt(Math.max(0, perimeter * perimeter - 16 * area))) / 4
}

/** The pieces of `a` outside `b`, each wider than `allowed`, largest first; null when they cannot be cut. */
function past(a: MultiPolygon, b: MultiPolygon, frame: Frame, walls: readonly Wall[]): Stretch[] | null {
  const middle = { x: (frame.x0 + frame.x1) / 2, y: (frame.y0 + frame.y1) / 2 }
  let pieces: MultiPolygon
  try {
    pieces = polygonClipping.difference(a, b)
  } catch {
    return null
  }
  const found: Stretch[] = []
  for (const piece of pieces) {
    const ring = piece[0] ?? []
    if (ring.length < 4) continue
    const xs = ring.map((p) => p[0])
    const ys = ring.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const area = multiArea([piece])
    if (!(widthOf(piece, area) > allowed({ x0, y0, x1, y1 }, walls))) continue
    // The side of the floor below it lies on: the way its middle is from the middle of that floor,
    // as a share of the floor's half-width and half-depth; all round when it holds the middle.
    const dx = ((x0 + x1) / 2 - middle.x) / Math.max((frame.x1 - frame.x0) / 2, tolerance('noLength'))
    const dy = ((y0 + y1) / 2 - middle.y) / Math.max((frame.y1 - frame.y0) / 2, tolerance('noLength'))
    // LVL-10: all round only when it goes round: a piece with a hole. A strip along one side that
    // holds the middle of the floor below is on that side still.
    const round = piece.length > 1 && x0 < middle.x && middle.x < x1 && y0 < middle.y && middle.y < y1
    const side = round ? 'all round' : Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'north' : 'south'
    const depth = side === 'all round' ? widthOf(piece, area) : side === 'east' || side === 'west' ? x1 - x0 : y1 - y0
    found.push({ x0, y0, x1, y1, depth, side, area })
  }
  return found.sort((p, q) => q.area - p.area)
}

/** The four sides, in the order a set-back names them. */
const WAYS = ['north', 'east', 'south', 'west'] as const
type Way = (typeof WAYS)[number]

/**
 * LVL-10: the sides a floor wholly inside the floors below sits back on, and how far on each:
 * how far the stretches that sit back (each already wider than `allowed`) reach past the floor's
 * own box on that side, the deepest of them. A side is named only when that is more than
 * `allowed` along it, so a sliver or a wall stub names none. Null when no side is: the stretches
 * lie inside the floor's own outline (a hole in it), which is said as a floor out of line.
 */
function setBackSides(
  upper: MultiPolygon,
  back: readonly Stretch[],
  walls: readonly Wall[]
): { sides: Array<{ side: Way; depth: number }>; box: { x0: number; y0: number; x1: number; y1: number } } | null {
  const xs = upper.flatMap((piece) => (piece[0] ?? []).map((p) => p[0]))
  const ys = upper.flatMap((piece) => (piece[0] ?? []).map((p) => p[1]))
  if (xs.length === 0) return null
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  const sides: Array<{ side: Way; depth: number }> = []
  for (const side of WAYS) {
    let deepest = 0
    for (const s of back) {
      // The part of the stretch past the floor's box on this side, and how far it reaches.
      const strip =
        side === 'north'
          ? { x0: s.x0, x1: s.x1, y0: box.y1, y1: s.y1 }
          : side === 'south'
            ? { x0: s.x0, x1: s.x1, y0: s.y0, y1: box.y0 }
            : side === 'east'
              ? { x0: box.x1, x1: s.x1, y0: s.y0, y1: s.y1 }
              : { x0: s.x0, x1: box.x0, y0: s.y0, y1: s.y1 }
      const reach = side === 'north' || side === 'south' ? strip.y1 - strip.y0 : strip.x1 - strip.x0
      if (reach > allowed(strip, walls)) deepest = Math.max(deepest, reach)
    }
    if (deepest > 0) sides.push({ side, depth: deepest })
  }
  return sides.length === 0 ? null : { sides, box }
}

/** The most stretches one line names; the rest are counted. */
const NAMED = 3


/** The box round some pieces' outer rings, or null when they have none. */
function boxOf(pieces: MultiPolygon): Frame | null {
  const xs = pieces.flatMap((piece) => (piece[0] ?? []).map((p) => p[0]))
  const ys = pieces.flatMap((piece) => (piece[0] ?? []).map((p) => p[1]))
  if (xs.length === 0) return null
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** LVL-11: the pieces wider than a wall two floors share (`sharedOnly`), so more than that wall. */
const widerThanShared = (pieces: MultiPolygon, walls: readonly Wall[]): MultiPolygon =>
  pieces.filter((piece) => {
    const box = boxOf([piece])
    return box !== null && widthOf(piece, multiArea([piece])) > sharedOnly(box, walls)
  })

/** LVL-11: what two floors' outlines have in common past a wall they share; null when they cannot be cut. */
function common(a: MultiPolygon, b: MultiPolygon, walls: readonly Wall[]): MultiPolygon | null {
  try {
    return widerThanShared(polygonClipping.intersection(a, b), walls)
  } catch {
    return null
  }
}

/** The area two outlines have in common, 0 when they cannot be cut. */
function sharedArea(a: MultiPolygon, b: MultiPolygon): number {
  try {
    return multiArea(polygonClipping.intersection(a, b))
  } catch {
    return 0
  }
}

/** How far a point is from a segment. */
function toSegment(p: Pair, a: Pair, b: Pair): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const along = dx * dx + dy * dy
  const t = along > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / along)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/**
 * LVL-11: two floors' outlines touch or overlap: they share some floor, or an edge of one lies
 * within `gap` of an edge of the other. A half level stands beside the floor it steps from.
 */
function adjoins(a: MultiPolygon, b: MultiPolygon): boolean {
  const [p, q] = [boxOf(a), boxOf(b)]
  const gap = tolerance('gap')
  if (p === null || q === null || p.x0 > q.x1 + gap || q.x0 > p.x1 + gap || p.y0 > q.y1 + gap || q.y0 > p.y1 + gap) return false
  if (sharedArea(a, b) > 0) return true
  const edges = (m: MultiPolygon): Array<[Pair, Pair]> => m.flatMap((piece) => piece.flatMap((ring) => ring.slice(1).map((end, i): [Pair, Pair] => [ring[i]!, end])))
  const theirs = edges(b)
  return edges(a).some(([a0, a1]) =>
    theirs.some(([b0, b1]) => Math.min(toSegment(a0, b0, b1), toSegment(a1, b0, b1), toSegment(b0, a0, a1), toSegment(b1, a0, a1)) <= gap)
  )
}

/** LVL-11: a half level, the floor it steps from and how far up it stands. */
interface Step {
  readonly floor: Floor
  readonly from: Floor
  readonly rise: number
}

/** The plan's buildings by floor (CNT-6), or none when the list cannot be read. */
function buildingsByFloor(plan: FloorPlan): ReadonlyMap<string, string> {
  if ((plan.buildings ?? []).length === 0) return new Map()
  try {
    return buildingOfFloor(plan)
  } catch {
    return new Map()
  }
}

/**
 * A warning for each floor whose outline does not lie over the floors under it (`floor/out-of-line`,
 * or `floor/set-back` for a part floor wholly inside them), and one for the plan's split levels
 * (`floor/split-level`, LVL-11), unless the floor states `overhang: "meant"`. Floors that cannot be
 * worked out (`spaces` leaves them out) are not compared.
 *
 * LVL-11: a floor is set against the floors of its own building (CNT-6; the floors no building
 * names together) that stand below it, by their floor levels (`floorElevations`, when a floor
 * states its elevation; else by `level`, which then orders them the same way), and that lie under
 * its own outline by more than a wall they share. Taken from the nearest down, a floor whose share
 * lies all under a nearer one is covered by it and left out. A floor with nothing under it, beside
 * a lower floor of its building and less than that floor's clear height above it, is a half level
 * of it: the split levels are said once, for the plan. Any other floor with nothing under it is set
 * against the floors of its building at the nearest level below it, as before.
 */
export function stackingIssues(plan: FloorPlan, spaces: readonly FloorSpaces[]): Issue[] {
  const floors = planFloors(plan)
  if (floors.length < 2) return []
  // A floor with no room on it (a parapet, a lone balustrade, a floor not drawn yet) is no floor
  // plate to line up: it is not compared, nor compared against.
  const withRooms = new Set(plan.rooms.map(floorOf))
  const outlines = new Map<string, MultiPolygon>()
  for (const s of spaces) {
    const multi = withRooms.has(s.floor) ? asMulti(s.outline) : []
    if (multi.length > 0) outlines.set(s.floor, multi)
  }
  // Where each floor stands. With no elevation stated, `level` orders the floors as their floor
  // levels would, and each stands on the top of the floors below it, so none is a half level.
  const stated = floors.some((f) => f.elevation !== undefined && Number.isFinite(f.elevation))
  const storeys = stated ? floorElevations(plan).floors : null
  const at = new Map(floors.map((f) => [f.id, storeys?.get(f.id)?.floorLevel ?? levelOf(f)] as const))
  const clear = (f: Floor): number | null => storeys?.get(f.id)?.clearHeight ?? null
  const same = stated ? tolerance('sameFloorLevel') : 0
  const building = buildingsByFloor(plan)
  const groups = new Map<string, Floor[]>()
  for (const f of floors) {
    if (!outlines.has(f.id)) continue
    const key = building.get(f.id) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  const issues: Issue[] = []
  let elevations: BuildingElevations | null = null
  const steps: Step[] = []
  let stepsAt = -1
  for (const floor of floors) {
    const upper = outlines.get(floor.id)
    if (upper === undefined) continue
    const here = at.get(floor.id)!
    const lower = (groups.get(building.get(floor.id) ?? '') ?? []).filter((f) => at.get(f.id)! < here - same).sort((a, b) => at.get(b.id)! - at.get(a.id)!)
    if (lower.length === 0) continue
    // The floors under it, nearest first, each that is not covered by a nearer one.
    const beneath: Floor[] = []
    let covered: MultiPolygon | null = null
    let cut = true
    for (const f of lower) {
      const walls = [...wallsOnFloor(plan, f.id), ...wallsOnFloor(plan, floor.id)]
      const share = common(upper, outlines.get(f.id)!, walls)
      if (share === null) {
        cut = false
        break
      }
      if (share.length === 0) continue
      try {
        const rest = covered === null ? share : widerThanShared(polygonClipping.difference(share, covered), walls)
        if (rest.length > 0) beneath.push(f)
        covered = covered === null ? share : polygonClipping.union(covered, share)
      } catch {
        cut = false
        break
      }
    }
    if (!cut) continue
    // VEW-33: the walls of each floor under it set against its slab. `overhang` is about outlines, not heights.
    if (beneath.length > 0) {
      elevations ??= floorElevations(plan)
      issues.push(...storeyTops(plan, floor, beneath, elevations, floors))
    }
    if (floor.overhang === 'meant') continue
    if (beneath.length > 0) {
      // CNT-40: a floor below ground (a negative `level`) is dug into the earth: it is not said to
      // overhang or sit back from the floors under it, and a floor is not set against a basement.
      const judged = levelOf(floor) < 0 ? [] : beneath.filter((f) => levelOf(f) >= 0)
      const issue = judged.length === 0 ? null : lineUp(plan, floor, upper, judged, outlines)
      if (issue !== null) issues.push(issue)
      continue
    }
    // Nothing under it: a half level beside a lower floor of its building, the one it shares most
    // with (the wall between them), else the nearest up from it.
    const half = lower
      .filter((f) => {
        const height = clear(f)
        return height !== null && here - at.get(f.id)! < height && adjoins(upper, outlines.get(f.id)!)
      })
      .map((f) => ({ f, share: sharedArea(upper, outlines.get(f.id)!) }))
      .sort((a, b) => b.share - a.share || at.get(b.f.id)! - at.get(a.f.id)!)[0]?.f
    if (half !== undefined) {
      if (steps.length === 0) stepsAt = issues.length
      steps.push({ floor, from: half, rise: here - at.get(half.id)! })
      continue
    }
    // Else it stands away from the floors below it: set against those at the nearest level down.
    const nearest = at.get(lower[0]!.id)!
    const issue = lineUp(
      plan,
      floor,
      upper,
      lower.filter((f) => at.get(f.id)! >= nearest - same),
      outlines
    )
    if (issue !== null) issues.push(issue)
  }
  if (steps.length > 0) issues.splice(stepsAt, 0, splitLevels(steps, outlines))
  return issues
}

/**
 * VEW-33: under another floor a storey's top is that floor's slab. Each floor `below` the floor
 * `over`, by the floors' levels (`floorElevations`), has its tallest drawn wall set against the
 * slab of `over` (its stated `slab`, else `SLAB_THICKNESS`): walls that stop short of the slab's
 * underside by more than `sameFloorLevel` leave a gap (`floor/gap-under-slab`), which the sections
 * and facades close by drawing them up to it; walls that rise past the floor level of `over` stand
 * in the storey above (`floor/walls-past-floor`). Walls that run into the slab and stop in it are
 * not said: stating a storey's walls floor to floor, slab included, is a way of writing heights.
 * LVL-24: a floor that states its clear height, which with the slab of `over` reaches past the
 * floor level of `over`, wrote its floor-to-floor as its height (`floor/height-past-next`).
 * A floor that draws no wall, or whose levels are not numbers, is not set against anything.
 */
function storeyTops(plan: FloorPlan, over: Floor, below: readonly Floor[], elevations: BuildingElevations, floors: readonly Floor[]): Issue[] {
  const upper = elevations.floors.get(over.id)
  if (upper === undefined || !Number.isFinite(upper.floorLevel)) return []
  const slab = over.slab !== undefined && Number.isFinite(over.slab) && over.slab >= 0 ? over.slab : SLAB_THICKNESS
  const underside = upper.floorLevel - slab
  const same = tolerance('sameFloorLevel')
  const at = (value: number): Value => num(metresText(value))
  const issues: Issue[] = []
  for (const floor of below) {
    const storey = elevations.floors.get(floor.id)
    // A floor alone on its level that states no height is as tall as its tallest drawn wall (`stackFloors`).
    const alone = floor.height === undefined && !floors.some((f) => f.id !== floor.id && levelOf(f) === levelOf(floor))
    const tallest = alone && storey !== undefined ? storey.clearHeight : tallestDrawnWall(plan, floor)
    if (storey === undefined || !Number.isFinite(storey.floorLevel) || !(tallest > 0)) continue
    const top = storey.floorLevel + tallest
    const values = { floor: name(floor.name || floor.id), over: name(over.name || over.id), top: at(top), underside: at(underside), level: at(upper.floorLevel) }
    if (underside - top > same) {
      const sentence = said('issue.floor/gap-under-slab', { ...values, gap: at(underside - top) })
      issues.push(withSaid({ entity: 'floor', id: floor.id, code: 'floor/gap-under-slab', severity: 'warning', message: english(sentence) }, sentence))
    } else if (top - upper.floorLevel > same) {
      const sentence = said('issue.floor/walls-past-floor', { ...values, past: at(top - upper.floorLevel) })
      issues.push(withSaid({ entity: 'floor', id: floor.id, code: 'floor/walls-past-floor', severity: 'warning', message: english(sentence) }, sentence))
      continue
    }
    // LVL-24: a clear height stated as if it were the floor-to-floor, so that with the slab over it
    // it runs past the floor over it. Not said where its walls already rise past that floor.
    const clear = floor.height !== undefined && Number.isFinite(floor.height) && floor.height > 0 ? floor.height : null
    if (clear === null) continue
    const reach = storey.floorLevel + clear + slab
    if (reach - upper.floorLevel <= same) continue
    const sentence = said('issue.floor/height-past-next', {
      floor: values.floor,
      over: values.over,
      height: at(clear),
      slab: at(slab),
      reach: at(reach),
      past: at(reach - upper.floorLevel),
      level: values.level,
      fits: at(Math.max(0, upper.floorLevel - slab - storey.floorLevel)),
    })
    issues.push(withSaid({ entity: 'floor', id: floor.id, code: 'floor/height-past-next', severity: 'warning', message: english(sentence) }, sentence))
  }
  return issues
}

/** LVL-11: the plan's split levels, said once: each half level, how far up and on which side of the floor it steps from. */
function splitLevels(steps: readonly Step[], outlines: ReadonlyMap<string, MultiPolygon>): Issue {
  const named = steps.slice(0, NAMED).map((step) => {
    const [mine, theirs] = [boxOf(outlines.get(step.floor.id)!)!, boxOf(outlines.get(step.from.id)!)!]
    const dx = (mine.x0 + mine.x1 - theirs.x0 - theirs.x1) / 2
    const dy = (mine.y0 + mine.y1 - theirs.y0 - theirs.y1) / 2
    const side: Way = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'north' : 'south'
    return said('issue.part.splitLevel.step', {
      floor: name(step.floor.name || step.floor.id),
      rise: num(metresText(step.rise)),
      lower: name(step.from.name || step.from.id),
      side: said(`describe.way.${side}`)
    })
  })
  const extra = steps.length - NAMED
  const more = extra > 0 ? said(extra === 1 ? 'issue.part.splitLevel.more.one' : 'issue.part.splitLevel.more.many', { count: extra }) : ''
  const sentence = said('issue.floor/split-level', { steps: joined(named, 'join.semicolon'), more })
  return withSaid({ entity: 'floor', id: steps[0]!.floor.id, code: 'floor/split-level', severity: 'warning', message: english(sentence) }, sentence)
}

/**
 * A floor's outline set against the floors `below` it: `floor/set-back` for a part floor wholly
 * inside them, `floor/out-of-line` for one that reaches past or sits back from them, else nothing.
 */
function lineUp(plan: FloorPlan, floor: Floor, upper: MultiPolygon, below: readonly Floor[], outlines: ReadonlyMap<string, MultiPolygon>): Issue | null {
  const lower = below.flatMap((f) => outlines.get(f.id) ?? [])
  if (lower.length === 0) return null
  let lowerUnion: MultiPolygon
  try {
    lowerUnion = lower.length === 1 ? lower : polygonClipping.union(lower[0]!, ...lower.slice(1))
  } catch {
    return null
  }
  const frame = boxOf(lowerUnion)
  if (frame === null) return null
  const walls = [...below.flatMap((f) => wallsOnFloor(plan, f.id)), ...wallsOnFloor(plan, floor.id)]
  const over = past(upper, lowerUnion, frame, walls)
  const back = past(lowerUnion, upper, frame, walls)
  if (over === null || back === null || (over.length === 0 && back.length === 0)) return null
  const at = (value: number): Value => num(metresText(value))
  const lowerNames = joined(below.map((f) => name(f.name || f.id)), 'join.and')
  // LVL-10: a floor wholly inside the floors below is a part floor, set back from them: said
  // once, by the sides it sits back on and how far, never as a floor out of line.
  const setBack = over.length === 0 ? setBackSides(upper, back, walls) : null
  if (setBack !== null) {
    const { sides, box } = setBack
    const flush = WAYS.filter((way) => !sides.some((s) => s.side === way))
    const sentence = said('issue.floor/set-back', {
      floor: name(floor.name || floor.id),
      lower: lowerNames,
      sides: joined(
        sides.map((s) => said('issue.part.setBack.side', { depth: at(s.depth), side: said(`describe.way.${s.side}`) })),
        'join.comma',
        'join.and'
      ),
      flush: flush.length === 0 ? '' : said('issue.part.setBack.flush', { sides: joined(flush.map((way) => said(`describe.way.${way}`)), 'join.comma', 'join.and') }),
      x0: at(box.x0),
      y0: at(box.y0),
      x1: at(box.x1),
      y1: at(box.y1),
      lx0: at(frame.x0),
      ly0: at(frame.y0),
      lx1: at(frame.x1),
      ly1: at(frame.y1)
    })
    return withSaid({ entity: 'floor', id: floor.id, code: 'floor/set-back', severity: 'warning', message: english(sentence) }, sentence)
  }
  // MSG-11: by key (`issue.floor/out-of-line`, `issue.part.lineUp.*`), each stretch with its figures.
  const stretches = (list: readonly Stretch[], verb: 'over' | 'back'): Said => {
    const named = list
      .slice(0, NAMED)
      .map((s) =>
        said(s.side === 'all round' ? 'issue.part.lineUp.stretch.all' : 'issue.part.lineUp.stretch', {
          depth: at(s.depth),
          ...(s.side === 'all round' ? {} : { side: said(`describe.way.${s.side}`) }),
          x0: at(s.x0),
          y0: at(s.y0),
          x1: at(s.x1),
          y1: at(s.y1)
        })
      )
    const extra = list.length - NAMED
    const more = extra > 0 ? said(extra === 1 ? 'issue.part.lineUp.more.one' : 'issue.part.lineUp.more.many', { count: extra }) : ''
    return said(`issue.part.lineUp.${verb}`, { stretches: joined(named, 'join.semicolon'), more })
  }
  const parts = [over.length > 0 ? stretches(over, 'over') : null, back.length > 0 ? stretches(back, 'back') : null].filter((p): p is Said => p !== null)
  const sentence = said('issue.floor/out-of-line', {
    floor: name(floor.name || floor.id),
    lower: lowerNames,
    parts: joined(parts, 'join.semicolonAnd')
  })
  return withSaid({ entity: 'floor', id: floor.id, code: 'floor/out-of-line', severity: 'warning', message: english(sentence) }, sentence)
}
