/**
 * VEW-82: a straight wall cut, for a GLB, where the rooms beside it change: one piece per stretch
 * between rooms' corners (`GlbWallStretch`), each a closed solid of its own with the rooms on its
 * two faces. A game engine then gets a maze's walls as the walls of its rooms, not one mesh as long
 * as the building.
 *
 * Each piece is the wall's elevation clipped to its stretch along the wall. A cut never runs
 * through a door or a window: a stretch boundary inside an opening's span joins the two stretches,
 * and so does a stretch shorter than `wallPieceShortest`. The elevation's ends are kept, so the
 * first and the last piece meet the corners as the whole wall does, and a cut between two pieces
 * is square. A curved wall (CNT-18) is written whole.
 */

import type { Vec2 } from '../vec2'
import type { SceneWall, WallElevation } from '../scene3d'
import { limit, tolerance } from '../tolerances'
import type { GlbWallStretch } from './glbFacts'

/** One piece of a wall: its elevation, the part of the wall's from `from` to `to`, and the rooms on its faces. */
export interface WallPiece {
  readonly elevation: WallElevation
  readonly from: number
  readonly to: number
  readonly left: readonly string[]
  readonly right: readonly string[]
}

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])].sort()
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, k) => id === b[k])

/** The polygon's part on one side of the upright line u = at: `keep` 1 keeps u ≥ at, -1 keeps u ≤ at (Sutherland–Hodgman, one edge). */
function clipAt(polygon: readonly Vec2[], at: number, keep: 1 | -1): Vec2[] {
  const out: Vec2[] = []
  const inside = (p: Vec2): boolean => (p.x - at) * keep >= 0
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    if (inside(p)) out.push(p)
    if (inside(p) !== inside(q)) {
      const t = (at - p.x) / (q.x - p.x)
      out.push({ x: at, y: p.y + (q.y - p.y) * t })
    }
  }
  // A point clipped onto the line twice in a row is one point.
  const none = tolerance('noLength')
  return out.filter((p, k) => {
    const next = out[(k + 1) % out.length]!
    return out.length < 2 || Math.abs(p.x - next.x) > none || Math.abs(p.y - next.y) > none
  })
}

/**
 * The stretches with another wall standing across them given to their neighbours: one between two
 * stretches is cut at its middle, on that wall's line, and one at an end of the wall joins the
 * stretch next to it.
 */
function overCrossings(stretches: readonly GlbWallStretch[]): GlbWallStretch[] {
  const out: GlbWallStretch[] = stretches.filter((s) => s.under !== true).map((s) => ({ ...s }))
  if (out.length === 0) return [...stretches]
  for (const crossing of stretches.filter((s) => s.under === true)) {
    const before = out.filter((s) => s.to <= crossing.from + tolerance('noLength')).pop()
    const after = out.find((s) => s.from >= crossing.to - tolerance('noLength'))
    const middle = (crossing.from + crossing.to) / 2
    const at = (s: GlbWallStretch): number => out.indexOf(s)
    if (before !== undefined) out[at(before)] = { ...before, to: after === undefined ? crossing.to : middle }
    if (after !== undefined) out[at(after)] = { ...after, from: before === undefined ? crossing.from : middle }
  }
  return out
}

/** The stretches joined where a cut would run through an opening, leave a piece too short, or part rooms that are the same. */
function joinedStretches(wall: SceneWall, stretches: readonly GlbWallStretch[]): GlbWallStretch[] {
  const shortest = limit('wallPieceShortest')
  const none = tolerance('noLength')
  const spans = wall.elevation.holes.map((hole) => [Math.min(...hole.map((p) => p.x)), Math.max(...hole.map((p) => p.x))] as const)
  const throughOpening = (at: number): boolean => spans.some(([a, b]) => at > a - none && at < b + none)
  const end = wall.elevation.length
  const out: GlbWallStretch[] = []
  for (const stretch of overCrossings(stretches)) {
    const last = out[out.length - 1]
    const joins =
      last !== undefined &&
      ((same(last.left, stretch.left) && same(last.right, stretch.right)) || throughOpening(stretch.from) || last.to - last.from < shortest || end - stretch.from < shortest)
    if (last !== undefined && joins) out[out.length - 1] = { from: last.from, to: stretch.to, left: union(last.left, stretch.left), right: union(last.right, stretch.right) }
    else out.push(stretch)
  }
  return out
}

/**
 * The wall's pieces at its rooms, or null when it stays one: a curved wall, a wall with one stretch,
 * or one whose every cut would run through an opening or leave a piece too short.
 */
export function wallPieces(wall: SceneWall, stretches: readonly GlbWallStretch[]): WallPiece[] | null {
  if (wall.pieces !== undefined || stretches.length < 2) return null
  const joined = joinedStretches(wall, stretches)
  if (joined.length < 2) return null
  const { outline, holes } = wall.elevation
  return joined.map((stretch, k) => {
    // The first and the last piece reach the wall's own ends, wherever its outline puts them.
    const from = k === 0 ? -Infinity : stretch.from
    const to = k === joined.length - 1 ? Infinity : stretch.to
    let shape: Vec2[] = [...outline]
    if (from > -Infinity) shape = clipAt(shape, from, 1)
    if (to < Infinity) shape = clipAt(shape, to, -1)
    const mine = holes.filter((hole) => {
      const middle = (Math.min(...hole.map((p) => p.x)) + Math.max(...hole.map((p) => p.x))) / 2
      return middle >= from && middle < to
    })
    return { elevation: { ...wall.elevation, outline: shape, holes: mine }, from: stretch.from, to: stretch.to, left: stretch.left, right: stretch.right }
  })
}

/** A piece's name after its wall's: the rooms on its left face, then on its right, `outside` for none. */
export function pieceLabel(wallId: string, piece: Pick<WallPiece, 'left' | 'right'>): string {
  const side = (rooms: readonly string[]): string => (rooms.length === 0 ? 'outside' : rooms.join('+'))
  return `${wallId}_${side(piece.left)}.${side(piece.right)}`
}
