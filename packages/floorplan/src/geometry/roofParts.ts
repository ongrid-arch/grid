/**
 * A roof past its walls (LVL-29): its overhang and the parts on its sides, canopies and
 * brise-soleil.
 *
 * The sides are the roof frame's (`types/roofFrame.ts`): north, east, south and west are the sides
 * of the rectangle the roof stands on, turned to the floor's longest outside wall.
 *
 * - **The overhang** grows the roof's pieces by its four figures, each out from the sides that
 *   face its way: the pieces' Minkowski sum with the rectangle `[-west, east] × [-south, north]`
 *   in the frame's terms, so every corner of an L or a T is carried round. The envelope cuts the
 *   floors above back out of it, so a roof never runs into a floor over it.
 * - **A part** is a rectangle out from one side of the floor's outline: its back edge on the
 *   outline's furthest edge within its width, `depth` out, at `height` over the floor's level. A
 *   canopy is the whole rectangle; a brise-soleil its blades, parallel to the side, spread evenly
 *   across the depth (`briseSoleilBladeSpacing` apart when the part states no number, each
 *   `briseSoleilBladeWidth` wide).
 *
 * Pure, and never throws.
 */

import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { Roof, RoofPart } from './plan'
import type { RoofFrame } from '../types/roofFrame'
import { cutOutline, ringOf } from './polygons'
import { limit, tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { said, type Said } from '../messages/say'

/** The overhang on each side of the roof's rectangle, in metres. */
export interface RoofSides {
  readonly north: number
  readonly east: number
  readonly south: number
  readonly west: number
}

/** The overhang a roof states, side by side; null when it states none. */
export function overhangSides(roof: Roof): RoofSides | null {
  const o = roof.overhang
  if (o === undefined) return null
  if (typeof o === 'number') return { north: o, east: o, south: o, west: o }
  return { north: o.north ?? 0, east: o.east ?? 0, south: o.south ?? 0, west: o.west ?? 0 }
}

const frameAt = (frame: RoofFrame, u: number, v: number): Vec2 => ({ x: u * frame.east.x + v * frame.north.x, y: u * frame.east.y + v * frame.north.y })
const uOf = (frame: RoofFrame, p: Vec2): number => p.x * frame.east.x + p.y * frame.east.y
const vOf = (frame: RoofFrame, p: Vec2): number => p.x * frame.north.x + p.y * frame.north.y

/** `pieces` swept along the segment from `a` to `b`: both ends, and each edge's parallelogram between them. */
function swept(pieces: MultiPolygon, a: Vec2, b: Vec2): MultiPolygon | null {
  if (Math.hypot(b.x - a.x, b.y - a.y) <= tolerance('noLength')) {
    return a.x === 0 && a.y === 0 ? pieces : pieces.map((polygon) => polygon.map((ring) => ring.map(([x, y]): [number, number] => [x + a.x, y + a.y])))
  }
  const moved = (d: Vec2): MultiPolygon => pieces.map((polygon) => polygon.map((ring) => ring.map(([x, y]): [number, number] => [x + d.x, y + d.y])))
  const quads: Polygon[] = []
  for (const polygon of pieces) {
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const [px, py] = ring[i]!
        const [qx, qy] = ring[i + 1]!
        if (Math.hypot(qx - px, qy - py) <= tolerance('noLength')) continue
        quads.push([
          ringOf([
            { x: px + a.x, y: py + a.y },
            { x: qx + a.x, y: qy + a.y },
            { x: qx + b.x, y: qy + b.y },
            { x: px + b.x, y: py + b.y }
          ])
        ])
      }
    }
  }
  return cutOutline('union', moved(a), [moved(b), ...quads.map((q): MultiPolygon => [q])])
}

/**
 * The roof's pieces grown by its overhang, side by side (the Minkowski sum with the rectangle of
 * the four figures); the pieces unchanged when every figure is 0, and null when the cut fails.
 */
export function grownByOverhang(pieces: MultiPolygon, frame: RoofFrame, sides: RoofSides): MultiPolygon | null {
  if (pieces.length === 0 || (sides.north <= 0 && sides.east <= 0 && sides.south <= 0 && sides.west <= 0)) return pieces
  const along = swept(pieces, frameAt(frame, -sides.west, 0), frameAt(frame, sides.east, 0))
  if (along === null) return null
  return swept(along, frameAt(frame, 0, -sides.south), frameAt(frame, 0, sides.north))
}

/** Where a part of the roof stands. */
export interface RoofPartPlace {
  readonly id: string
  readonly kind: RoofPart['kind']
  readonly side: RoofPart['side']
  /** Its underside, metres above the floor's level. */
  readonly height: number
  /** The rectangle it fills on plan, counter-clockwise: the canopy, or the band its blades lie in. */
  readonly outline: readonly Vec2[]
  /** What is built: the canopy's rectangle, or each blade's. */
  readonly pieces: MultiPolygon
  /** The area of `pieces` on plan, in square metres. */
  readonly area: number
}

/** The stretch along a side a part takes: from `at`'s place (else the middle) by its width (else the whole). */
function partSpan(part: RoofPart, frame: RoofFrame, low: number, high: number): readonly [number, number] {
  const across = part.side === 'north' || part.side === 'south'
  const along = (p: Vec2): number => (across ? uOf(frame, p) : vOf(frame, p))
  const middle = part.at === undefined ? (low + high) / 2 : along({ x: part.at[0], y: part.at[1] })
  const half = part.width === undefined ? (high - low) / 2 : part.width / 2
  return [middle - half, middle + half]
}

/**
 * A part's place out from the side of `outline` (the floor's, walls and all) it names, or why it
 * has none: no part of the outline lies within its width.
 */
export function roofPartPlace(part: RoofPart, frame: RoofFrame, outline: MultiPolygon): RoofPartPlace | { readonly problem: Said } {
  const points = outline.flatMap((polygon) => (polygon[0] ?? []).map(([x, y]): Vec2 => ({ x, y })))
  const nowhere = { problem: said('issue.floor/roof-part-misplaced.nowhere', { side: part.side }) }
  if (points.length === 0) return nowhere
  const across = part.side === 'north' || part.side === 'south'
  const alongOf = (p: Vec2): number => (across ? uOf(frame, p) : vOf(frame, p))
  const outOf = (p: Vec2): number => (across ? vOf(frame, p) : uOf(frame, p))
  const lows = points.map(alongOf)
  const [from, to] = partSpan(part, frame, Math.min(...lows), Math.max(...lows))
  // The outline within the part's width, its furthest point out on the part's side.
  const outs = points.map(outOf)
  const reach = Math.max(...outs) - Math.min(...outs) + part.depth
  const lo = Math.min(...outs) - reach
  const hi = Math.max(...outs) + reach
  const box = (a0: number, a1: number, o0: number, o1: number): Vec2[] => {
    const at = (a: number, o: number): Vec2 => (across ? frameAt(frame, a, o) : frameAt(frame, o, a))
    const ring = [at(a0, o0), at(a1, o0), at(a1, o1), at(a0, o1)]
    // Counter-clockwise whichever way the axes were swapped.
    let sum = 0
    for (let i = 0; i < ring.length; i++) sum += ring[i]!.x * ring[(i + 1) % 4]!.y - ring[(i + 1) % 4]!.x * ring[i]!.y
    return sum < 0 ? ring.reverse() : ring
  }
  const within = cutOutline('intersection', outline, [[[ringOf(box(from, to, lo, hi))]]])
  if (within === null || within.length === 0) return nowhere
  const inner = within.flatMap((polygon) => (polygon[0] ?? []).map(([x, y]) => outOf({ x, y })))
  const outward = part.side === 'north' || part.side === 'east' ? 1 : -1
  const back = outward > 0 ? Math.max(...inner) : Math.min(...inner)
  const front = back + outward * part.depth
  const outlineRing = box(from, to, Math.min(back, front), Math.max(back, front))
  let pieces: MultiPolygon
  if (part.kind === 'canopy') pieces = [[ringOf(outlineRing)]]
  else {
    const count = part.blades ?? Math.max(1, Math.round(part.depth / limit('briseSoleilBladeSpacing')))
    const width = Math.min(limit('briseSoleilBladeWidth'), part.depth / count)
    pieces = Array.from({ length: count }, (_, i): Polygon => {
      const middle = back + outward * ((part.depth * (i + 0.5)) / count)
      return [ringOf(box(from, to, middle - width / 2, middle + width / 2))]
    })
  }
  const area = pieces.reduce((sum, polygon) => {
    const ring = polygon[0]!
    let twice = 0
    for (let i = 0; i < ring.length; i++) twice += ring[i]![0] * ring[(i + 1) % ring.length]![1] - ring[(i + 1) % ring.length]![0] * ring[i]![1]
    return sum + Math.abs(twice) / 2
  }, 0)
  return { id: part.id, kind: part.kind, side: part.side, height: part.height, outline: outlineRing, pieces, area }
}
