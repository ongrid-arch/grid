/**
 * The plan symbol of each kind of door and window (CNT-14), in plan coordinates.
 *
 * One function says where every line and arc of a symbol goes, so the 2D view, the pictures, the
 * sheet and the DXF draw the same symbol; they only write it out (SHT-1: the look decides how,
 * never where). The symbols are the usual ones, drawn in proportions of the opening and its wall:
 *
 * - one leaf: the jambs, the open leaf and its swing (as before CNT-14); beside a fixed panel when
 *   only part of it opens;
 * - a pair: a leaf and a swing from each jamb, meeting where the leaves meet;
 * - folding: its panels folded back in a zig-zag on the face it opens to, from the end it hangs from;
 * - sliding: two panels in the thickness of the wall, overlapping in the middle, each a thin
 *   rectangle with its glass down the middle, and an arrow for the way each slides;
 * - pocket: the leaf across the opening, and dashed (hidden in the wall) where it slides into it;
 * - roller: the curtain across the opening on the face it runs on, and its roll overhead dashed;
 * - garage: the door across the opening, and dashed where it lies overhead when open;
 * - windows: the two faces of the wall and the glass between them (as before CNT-14); a pair with
 *   the line where its casements meet; a sliding window's two panes overlapping; a high-level
 *   window all dashed, since it lies above the plan's cut.
 *
 * A line marked `above` lies above the plan's cut or hidden in the wall, and is drawn dashed.
 */

import type { PlanOpening } from './floorplan'
import type { DoorValues } from './door'
import { doorSweeps, doorSwing } from './door'
import type { Vec2 } from './vec2'
import { add, distance, lerp, scale } from './vec2'
import { doorKindOf, foldingPanels, pairLeaves, partWidth, windowKindOf } from './openingKinds'
import { limit } from './tolerances'
import type { OpeningKind } from '../types/floorplan'

/** What a line of a symbol is: a jamb across the wall, a leaf or panel, a fixed panel, a wall face, glass or an arrow showing the way a panel slides. */
export type SymbolPart = 'jamb' | 'leaf' | 'panel' | 'face' | 'glass' | 'arrow'

export interface SymbolLine {
  readonly shape: 'line'
  readonly part: SymbolPart
  readonly from: Vec2
  readonly to: Vec2
  /** Above the plan's cut, or hidden in the wall: drawn dashed. */
  readonly above?: true
}

/** A leaf's swing, from the open leaf's tip round to where it lies closed, exactly. */
export interface SymbolArc {
  readonly shape: 'arc'
  readonly center: Vec2
  readonly radius: number
  /** The open leaf's tip. */
  readonly tip: Vec2
  /** Where the leaf's tip lies closed. */
  readonly far: Vec2
  /** The turn from closed to open, in the plan: counter-clockwise or not. */
  readonly counterClockwise: boolean
}

export type SymbolPiece = SymbolLine | SymbolArc

export interface OpeningSymbol {
  /** The kind it is drawn as. */
  readonly kind: OpeningKind
  /** The lines and arcs, in drawing order. */
  readonly pieces: readonly SymbolPiece[]
}

/** How far the two leaves of a sliding door or the panes of a sliding window overlap, as a share of the opening. */
const SLIDE_OVERLAP = 1 / 20
/** Where across the wall the two leaves or panes of a sliding opening run, as a share of the wall's thickness either side of its axis. */
const SLIDE_TRACK = 1 / 4
/** The same, for a sliding window, whose panes run nearer the middle. */
const PANE_TRACK = 1 / 6
/** Across a dividing line, which has no thickness, the tracks are this share of the opening's width apart. */
const LINE_TRACK = 1 / 32

const line = (part: SymbolPart, from: Vec2, to: Vec2, above = false): SymbolLine => (above ? { shape: 'line', part, from, to, above: true } : { shape: 'line', part, from, to })

/** The point at `t` along the opening (0 at `from`, 1 at `to`), moved `by` metres along its normal. */
function at(opening: PlanOpening, t: number, by: number): Vec2 {
  const p = lerp(opening.from, opening.to, t)
  return { x: p.x + opening.normal.x * by, y: p.y + opening.normal.y * by }
}

/** The opening's line moved `by` metres along its normal, between `t0` and `t1`. */
const across = (opening: PlanOpening, part: SymbolPart, by: number, t0 = 0, t1 = 1, above = false): SymbolLine =>
  t0 === 0 && t1 === 1
    ? line(part, { x: opening.from.x + opening.normal.x * by, y: opening.from.y + opening.normal.y * by }, { x: opening.to.x + opening.normal.x * by, y: opening.to.y + opening.normal.y * by }, above)
    : line(part, at(opening, t0, by), at(opening, t1, by), above)

/** The two jambs, across the wall at each end of the opening, as the door symbol has always drawn them. */
function jambs(opening: PlanOpening): SymbolLine[] {
  const half = { x: (opening.normal.x * opening.thickness) / 2, y: (opening.normal.y * opening.thickness) / 2 }
  const jamb = (p: Vec2): SymbolLine => line('jamb', { x: p.x + half.x, y: p.y + half.y }, { x: p.x - half.x, y: p.y - half.y })
  return [jamb(opening.from), jamb(opening.to)]
}

/** A swinging leaf, open, and its swing. */
function leafAndArc(swing: NonNullable<ReturnType<typeof doorSwing>>): SymbolPiece[] {
  const [hinge, tip] = swing.leaf
  const { center, radius, from } = swing.arc
  const far = { x: center.x + radius * Math.cos(from), y: center.y + radius * Math.sin(from) }
  return [line('leaf', hinge, tip), { shape: 'arc', center, radius, tip, far, counterClockwise: swing.arc.counterClockwise }]
}

/** Across the wall: half its thickness, or for a dividing line a share of the opening's width. */
const track = (opening: PlanOpening, share: number): number =>
  opening.thickness > 0 ? opening.thickness * share : distance(opening.from, opening.to) * LINE_TRACK

/** The side of the wall a door runs or opens on, as a sign along the normal; 0 when unstated. */
const faceSign = (side: DoorValues['swing']): number => (side === 'left' ? 1 : side === 'right' ? -1 : 0)

/** An arrow's head, as a share of the opening's width. */
const ARROW_HEAD = 1 / 25

/** A sliding panel's half-depth, as a share of the offset of the track it runs in. */
const PANEL_DEPTH = 1 / 4

/** A sliding panel between `t0` and `t1` in the track `by` metres off the axis: its four edges and its glass down the middle. */
function slidingPanel(opening: PlanOpening, by: number, t0: number, t1: number): SymbolPiece[] {
  const d = Math.abs(by) * PANEL_DEPTH
  const [inner, outer] = [by - d, by + d]
  return [
    across(opening, 'leaf', inner, t0, t1),
    across(opening, 'leaf', outer, t0, t1),
    line('leaf', at(opening, t0, inner), at(opening, t0, outer)),
    line('leaf', at(opening, t1, inner), at(opening, t1, outer)),
    across(opening, 'glass', by, t0, t1)
  ]
}

/** An arrow along the opening from `t0` to `t1` (its head at `t1`), `by` metres off the axis: a shaft and two strokes of a head. */
function arrow(opening: PlanOpening, t0: number, t1: number, by: number): SymbolLine[] {
  const width = distance(opening.from, opening.to)
  const head = Math.min(width * ARROW_HEAD, (width * Math.abs(t1 - t0) * 2) / 5)
  const dir = Math.sign(t1 - t0)
  const back = t1 - (dir * head) / width
  const spread = head / 2
  const tip = at(opening, t1, by)
  return [line('arrow', at(opening, t0, by), tip), line('arrow', tip, at(opening, back, by + spread)), line('arrow', tip, at(opening, back, by - spread))]
}

function doorSymbol(opening: PlanOpening, values: DoorValues): OpeningSymbol | null {
  const kind = doorKindOf(values.kind)
  const width = distance(opening.from, opening.to)
  if (!(width > 0)) return null
  const half = opening.thickness / 2
  const sign = faceSign(values.swing)
  const startHung = (values.hinge ?? 'start') === 'start'
  // Along the opening from the end it hangs from (or opens toward): 0 there, 1 at the other end.
  const t = (s: number): number => (startHung ? s : 1 - s)

  if (kind === 'single' || kind === 'double') {
    const sweeps = doorSweeps(opening, values)
    if (sweeps === null || sweeps.length === 0) return null
    const pieces: SymbolPiece[] = [...jambs(opening)]
    for (const sweep of sweeps) if (sweep.shape === 'arc') pieces.push(...leafAndArc(sweep.swing))
    // One leaf beside a fixed panel: the panel is drawn across the rest of the opening.
    if (kind === 'single' && values.opens) {
      const leaf = partWidth(width, values.opens) / width
      if (leaf < 1) pieces.push(across(opening, 'panel', 0, Math.min(t(leaf), t(1)), Math.max(t(leaf), t(1))))
    }
    return { kind, pieces }
  }
  if (kind === 'folding') {
    if (values.hinge == null || sign === 0) return null
    const folds = partWidth(width, values.opens)
    const panels = foldingPanels(folds, limit('foldingPanel'))
    const step = folds / width / panels
    const depth = folds / panels / 2
    const pieces: SymbolPiece[] = [...jambs(opening)]
    for (let k = 0; k < panels; k++) {
      const out = (j: number): number => sign * (half + (j % 2 === 1 ? depth : 0))
      pieces.push(line('leaf', at(opening, t(k * step), out(k)), at(opening, t((k + 1) * step), out(k + 1))))
    }
    if (folds < width) pieces.push(across(opening, 'panel', 0, Math.min(t(folds / width), t(1)), Math.max(t(folds / width), t(1))))
    return { kind, pieces }
  }
  if (kind === 'sliding') {
    const by = track(opening, SLIDE_TRACK)
    const pieces: SymbolPiece[] = [...jambs(opening)]
    pieces.push(...slidingPanel(opening, by, 0, 1 / 2 + SLIDE_OVERLAP), ...slidingPanel(opening, -by, 1 / 2 - SLIDE_OVERLAP, 1))
    // One arrow for each panel, toward the middle: the pair looks the same from either end.
    pieces.push(...arrow(opening, 0.15, 0.4, 0), ...arrow(opening, 0.85, 0.6, 0))
    return { kind, pieces }
  }
  if (kind === 'pocket') {
    // The leaf across the opening, and the pocket it slides into, hidden in the wall past the end it opens toward.
    return { kind, pieces: [...jambs(opening), across(opening, 'leaf', 0), line('leaf', at(opening, t(0), 0), at(opening, t(-1), 0), true)] }
  }
  // Roller and garage doors: the door across the opening on the face it runs on, and dashed what lies overhead.
  const face = sign * half
  const pieces: SymbolPiece[] = [...jambs(opening), across(opening, 'leaf', face)]
  if (sign !== 0) {
    const reach = kind === 'garage' ? (opening.height ?? width) : half
    const deep = face + sign * reach
    pieces.push(across(opening, 'leaf', deep, 0, 1, true))
    if (kind === 'garage') pieces.push(line('leaf', at(opening, 0, face), at(opening, 0, deep), true), line('leaf', at(opening, 1, face), at(opening, 1, deep), true))
  }
  return { kind, pieces }
}

/**
 * VEW-77: the point `t` of the way along an opening's path (by its length along the run), moved
 * `by` metres along the normal there.
 */
function pathAt(path: NonNullable<PlanOpening['path']>, t: number, by: number): Vec2 {
  const first = path[0]!
  const last = path[path.length - 1]!
  const u = first.at + (last.at - first.at) * t
  let k = 0
  while (k + 2 < path.length && path[k + 1]!.at < u) k++
  const a = path[k]!
  const b = path[k + 1]!
  const share = b.at === a.at ? 0 : Math.max(0, Math.min(1, (u - a.at) / (b.at - a.at)))
  const p = lerp(a.point, b.point, share)
  const n = lerp(a.normal, b.normal, share)
  const size = Math.hypot(n.x, n.y) || 1
  return { x: p.x + (n.x / size) * by, y: p.y + (n.y / size) * by }
}

/**
 * A window's line `by` metres off its axis between `t0` and `t1`: one line on a straight
 * opening, one per facet along its path on a curve or across a joint (VEW-77), so the lines lie
 * on the wall's faces as they bow.
 */
function alongWindow(opening: PlanOpening, part: SymbolPart, by: number, t0 = 0, t1 = 1, above = false): SymbolLine[] {
  const path = opening.path
  if (path === undefined || path.length < 3) return [across(opening, part, by, t0, t1, above)]
  const first = path[0]!.at
  const whole = path[path.length - 1]!.at - first
  if (!(whole > 0)) return [across(opening, part, by, t0, t1, above)]
  const ts = [t0, ...path.map((p) => (p.at - first) / whole).filter((t) => t > t0 && t < t1), t1]
  return ts.slice(1).map((t, i) => line(part, pathAt(path, ts[i]!, by), pathAt(path, t, by), above))
}

function windowSymbol(opening: PlanOpening): OpeningSymbol {
  const kind = windowKindOf(opening.kind)
  const half = opening.thickness / 2
  const high = kind === 'high-level'
  const faces = [...alongWindow(opening, 'face', half, 0, 1, high), ...alongWindow(opening, 'face', -half, 0, 1, high)]
  if (kind === 'sliding') {
    const by = track(opening, PANE_TRACK)
    return { kind, pieces: [...faces, ...alongWindow(opening, 'glass', by, 0, 1 / 2 + SLIDE_OVERLAP), ...alongWindow(opening, 'glass', -by, 1 / 2 - SLIDE_OVERLAP, 1)] }
  }
  const pieces: SymbolPiece[] = [...faces, ...alongWindow(opening, 'glass', 0, 0, 1, high)]
  if (kind === 'double') {
    const width = distance(opening.from, opening.to)
    const startHung = (opening.hinge ?? 'start') === 'start'
    const split = width > 0 ? pairLeaves(width, opening.opens)[0] / width : 1 / 2
    const s = startHung ? split : 1 - split
    const path = opening.path
    pieces.push(path !== undefined && path.length >= 3 ? line('face', pathAt(path, s, half), pathAt(path, s, -half)) : line('face', at(opening, s, half), at(opening, s, -half)))
  }
  return { kind, pieces }
}

/**
 * The symbol of one door or window, or `null` when there is nothing honest to draw: a doorless
 * opening, or a door whose kind swings or folds and whose swing the plan does not state, which is
 * drawn as undecided instead. `values` are what the caller holds about the door's hanging (its
 * own `hinge`, `swing`, `kind` and `opens` when left out).
 */
export function openingSymbol(opening: PlanOpening, values: DoorValues = opening): OpeningSymbol | null {
  if (opening.type === 'window') return windowSymbol(opening)
  if (opening.type !== 'door') return null
  return doorSymbol(opening, values)
}

/** Every point of a symbol's lines and, for a swing, the hinge and both ends: for framing and for keeping labels off it. */
export function symbolPoints(symbol: OpeningSymbol): Vec2[] {
  return symbol.pieces.flatMap((piece) => (piece.shape === 'line' ? [piece.from, piece.to] : [piece.center, piece.tip, piece.far, add(piece.center, scale({ x: piece.tip.x - piece.center.x + piece.far.x - piece.center.x, y: piece.tip.y - piece.center.y + piece.far.y - piece.center.y }, 1 / Math.SQRT2))]))
}
