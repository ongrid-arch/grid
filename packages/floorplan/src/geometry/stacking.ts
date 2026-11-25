/**
 * Floors that line up (LVL-5, lab WR-9, E-9): each floor's outline set against the floor below it.
 *
 * Floors are drawn one over the other, each with its own walls (C5), so widening one leaves the
 * other where it was, with nothing said (E-9: the ground floor 0.30 m wider than the floor above,
 * seen only in a 3D picture). Here each floor's outline, as its walls draw it (`floorSpaces`), is set
 * against the outline of the floors one level below: where it reaches past them it overhangs, and
 * where they reach past it it sits back. A stretch no deeper than `stackShift` and half the
 * thickest wall it runs along lines up, as the faces of walls of different thickness on one axis
 * do (the scoreboard's sound buildings have outside walls from 0.20 to 0.50 m on each floor). Only floors with a room on them are
 * compared: a parapet or a lone wall is no floor plate. Either way it is a warning, as an
 * overhang or a set-back is often meant: a floor that states `overhang: "meant"` is not asked about.
 * A floor wholly inside the floors below (a mezzanine, a part upper floor, the floor over a
 * single-storey extension) is a part floor, said once by its sides (`floor/set-back`, LVL-10).
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

/** The pieces of `a` outside `b`, each at least `stackShift` across, largest first. */
/**
 * How deep a stretch may be and still be walls of different thickness on one axis: `stackShift`,
 * and half the thickest solid wall of either floor that runs along it. A 0.45 m ground floor wall
 * under a 0.25 m one, on one axis, puts their faces 0.10 m apart.
 */
function allowed(box: { x0: number; y0: number; x1: number; y1: number }, walls: readonly Wall[]): number {
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
  return tolerance('stackShift') + thickest / 2
}

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

function past(a: MultiPolygon, b: MultiPolygon, frame: { x0: number; y0: number; x1: number; y1: number }, walls: readonly Wall[]): Stretch[] | null {
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

/**
 * One warning for each floor whose outline does not lie over the floors one level below it
 * (`floor/out-of-line`, or `floor/set-back` for a part floor wholly inside them), unless it states
 * `overhang: "meant"`. Floors that cannot be worked out
 * (`spaces` leaves them out) are not compared.
 */
export function stackingIssues(plan: FloorPlan, spaces: readonly FloorSpaces[]): Issue[] {
  const floors = planFloors(plan)
  if (floors.length < 2) return []
  // A floor with no room on it (a parapet, a lone balustrade, a floor not drawn yet) is no floor
  // plate to line up: it is not compared, nor compared against.
  const withRooms = new Set(plan.rooms.map(floorOf))
  const outlines = new Map(spaces.filter((s) => withRooms.has(s.floor)).map((s) => [s.floor, s.outline] as const))
  const levels = [...new Set(floors.map(levelOf))].sort((a, b) => a - b)
  const issues: Issue[] = []
  for (let i = 0; i + 1 < levels.length; i++) {
    const below = floors.filter((f) => levelOf(f) === levels[i])
    const lower = below.flatMap((f) => asMulti(outlines.get(f.id) ?? []))
    if (lower.length === 0) continue
    let lowerUnion: MultiPolygon
    try {
      lowerUnion = lower.length === 1 ? lower : polygonClipping.union(lower[0]!, ...lower.slice(1))
    } catch {
      continue
    }
    const xs = lowerUnion.flatMap((piece) => piece[0]!.map((p) => p[0]))
    const ys = lowerUnion.flatMap((piece) => piece[0]!.map((p) => p[1]))
    const frame = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    for (const floor of floors.filter((f) => levelOf(f) === levels[i + 1])) {
      if (floor.overhang === 'meant') continue
      const upper = asMulti(outlines.get(floor.id) ?? [])
      if (upper.length === 0) continue
      const walls = [...below.flatMap((f) => wallsOnFloor(plan, f.id)), ...wallsOnFloor(plan, floor.id)]
      const over = past(upper, lowerUnion, frame, walls)
      const back = past(lowerUnion, upper, frame, walls)
      if (over === null || back === null || (over.length === 0 && back.length === 0)) continue
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
        issues.push(withSaid({ entity: 'floor', id: floor.id, code: 'floor/set-back', severity: 'warning', message: english(sentence) }, sentence))
        continue
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
      issues.push(withSaid({ entity: 'floor', id: floor.id, code: 'floor/out-of-line', severity: 'warning', message: english(sentence) }, sentence))
    }
  }
  return issues
}
