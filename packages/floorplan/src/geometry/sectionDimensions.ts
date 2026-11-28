/**
 * VEW-89: the dimension chains of a section, worked out from the section alone.
 *
 * A section carries the plan's own kind of dimension (`Dimension`), in the section's coordinates
 * (x across from the picture's left, y up from the datum):
 *
 * - beside the building, on its left, up to three vertical chains, nearest first:
 *   - `detail`: each floor's level, the sill and head of every door and window the line cuts, and
 *     on each floor the clear height of the room nearest that side, up to the building's top;
 *   - `levels`: floor to floor, from each floor's level to the next, then to the top;
 *   - `overall`: from the ground beside the building to its top: the highest of the roofs' tops
 *     and the parapets the line cuts, else the highest cut part;
 * - under it, two horizontal chains along the cut:
 *   - `walls`: the faces of the walls cut on the floor the line cuts most walls of (the lowest of
 *     those on a tie);
 *   - `length`: from the first wall face cut on any floor to the last.
 *
 * Points closer than `chainSliver` are one point, as on the plan's chains, and a chain that would
 * say no more than the next one out is left out. Each dimension stands on the building's edge (or
 * under its lowest part) with no offset: the picture sets the chains out in its own pixels.
 *
 * Pure: derived, nothing stored.
 */
import type { Dimension, DimensionKind } from './dimensions'
import type { PlanSection } from './section'
import { sectionGroundAt } from './section'
import { tolerance } from './tolerances'
import type { Vec2 } from './vec2'

/** What a chain measures. */
export type SectionChainKind = 'detail' | 'levels' | 'overall' | 'walls' | 'length'

/** What one end of a section's dimension is at: a floor's level, a room's ceiling, an opening's sill or head, the building's top, the ground or a wall's face. */
export type SectionChainEndKind = 'floor' | 'ceiling' | 'sill' | 'head' | 'ridge' | 'parapet' | 'roof' | 'top' | 'ground' | 'face'

export interface SectionChainEnd {
  readonly kind: SectionChainEndKind
  /** The floor's, room's, opening's or wall's id; the floor's for a roof, ridge or parapet; empty for the ground and a top. */
  readonly id: string
}

/** One dimension of a section's chain, with what each of its ends is at. */
export interface SectionDimension extends Dimension {
  readonly ends: readonly [SectionChainEnd, SectionChainEnd]
}

export interface SectionChain {
  readonly kind: SectionChainKind
  /** `vertical`: up the building's left side; `horizontal`: along the cut, under it. */
  readonly axis: 'vertical' | 'horizontal'
  /** Its dimensions in order: from the bottom up, or from the left across. */
  readonly dimensions: readonly SectionDimension[]
}

interface Point {
  readonly at: number
  readonly mark: SectionChainEnd
}

/** Which mark is kept where two points of a chain are one: a floor's level over the rest, a wall's face over nothing. */
const RANK: Record<SectionChainEndKind, number> = { floor: 6, ground: 5, ridge: 4, parapet: 4, roof: 4, top: 4, head: 3, sill: 3, ceiling: 2, face: 1 }

/** The points in order, those closer than `chainSliver` to the one before them made one, the better mark kept. */
function merged(points: readonly Point[]): Point[] {
  const near = tolerance('chainSliver')
  const sorted = [...points].sort((a, b) => a.at - b.at || RANK[b.mark.kind] - RANK[a.mark.kind])
  const out: Point[] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && p.at - last.at < near) {
      if (RANK[p.mark.kind] > RANK[last.mark.kind]) out[out.length - 1] = { at: last.at, mark: p.mark }
      continue
    }
    out.push(p)
  }
  return out
}

/** A chain's dimensions through `points` in order, standing at `across` on the other axis, pushed out along `normal`. */
function chainOf(kind: SectionChainKind, axis: SectionChain['axis'], points: readonly Point[], across: number, measure: DimensionKind): SectionChain {
  const at = (v: number): Vec2 => (axis === 'vertical' ? { x: across, y: v } : { x: v, y: across })
  const normal: Vec2 = axis === 'vertical' ? { x: -1, y: 0 } : { x: 0, y: -1 }
  const dimensions: SectionDimension[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const from = at(a.at)
    const to = at(b.at)
    dimensions.push({
      id: `section-${kind}-${i - 1}`,
      kind: measure,
      from,
      to,
      value: b.at - a.at,
      normal,
      offset: 0,
      labelAt: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      measuredTo: ['face', 'face'],
      side: axis === 'vertical' ? 'left' : 'bottom',
      ends: [a.mark, b.mark]
    })
  }
  return { kind, axis, dimensions }
}

const sameAs = (a: readonly Point[], b: readonly Point[]): boolean => a.length === b.length && a.every((p, i) => Math.abs(p.at - b[i]!.at) < tolerance('chainSliver'))

/** The building's top on the section, and what it is: the highest roof or parapet cut, else the highest cut part. */
function topOf(section: PlanSection): Point | null {
  const tops: Point[] = section.roofs.flatMap((r) => [
    { at: r.level, mark: { kind: r.pitch !== undefined && r.pitch > 0 ? ('ridge' as const) : ('roof' as const), id: r.floor } },
    ...(r.parapet === undefined ? [] : [{ at: r.parapet, mark: { kind: 'parapet' as const, id: r.floor } }])
  ])
  if (tops.length === 0) {
    const ys = section.cut.flatMap((piece) => piece.outline.map((p) => p.y))
    return ys.length === 0 ? null : { at: Math.max(...ys), mark: { kind: 'top', id: '' } }
  }
  return tops.reduce((best, p) => (p.at > best.at || (p.at === best.at && RANK[p.mark.kind] > RANK[best.mark.kind]) ? p : best))
}

/** Each wall cut, by floor: its faces across the section. */
function wallFaces(section: PlanSection): { floor: string; id: string; from: number; to: number }[] {
  return section.parts.flatMap((p) => {
    if (p.kind !== 'wall') return []
    const xs = p.rings.flatMap((ring) => ring.map((q) => q.x))
    return xs.length === 0 ? [] : [{ floor: p.floor, id: p.id, from: Math.min(...xs), to: Math.max(...xs) }]
  })
}

/** VEW-89: the section's dimension chains, vertical ones nearest the building first, then the horizontal ones nearest the cut first. */
export function sectionChains(section: PlanSection): SectionChain[] {
  const top = topOf(section)
  if (top === null || section.building === null) return []
  const left = section.building.from
  const cutFloors = section.levels.filter((l) => l.from !== undefined && l.to !== undefined && l.level < top.at)
  const floors: Point[] = cutFloors.map((l) => ({ at: l.level, mark: { kind: 'floor', id: l.floor } }))

  const vertical: { kind: SectionChainKind; points: Point[]; measure: DimensionKind }[] = []
  if (floors.length > 0) {
    // The room nearest the left on each floor gives its clear height.
    const ceilings: Point[] = cutFloors.flatMap((l) => {
      const rooms = section.rooms.filter((r) => r.floor === l.floor && r.open !== true).sort((a, b) => a.from - b.from)
      const room = rooms[0]
      return room === undefined ? [] : [{ at: room.floorLevel + room.height, mark: { kind: 'ceiling' as const, id: room.room } }]
    })
    const openings: Point[] = section.openings.flatMap((o) => [
      { at: o.sill, mark: { kind: 'sill' as const, id: o.id } },
      { at: o.head, mark: { kind: 'head' as const, id: o.id } }
    ])
    const bottom = floors[0]!.at
    const within = (p: Point): boolean => p.at > bottom && p.at < top.at
    vertical.push({ kind: 'detail', points: merged([...floors, ...openings.filter(within), ...ceilings.filter(within), top]), measure: 'opening' })
    vertical.push({ kind: 'levels', points: merged([...floors, top]), measure: 'wall' })
  }
  const ground = sectionGroundAt(section.ground, Math.max(0, Math.min(section.length, left)))
  if (ground < top.at) vertical.push({ kind: 'overall', points: merged([{ at: ground, mark: { kind: 'ground', id: '' } }, top]), measure: 'overall' })

  const walls = wallFaces(section)
  const horizontal: { kind: SectionChainKind; points: Point[]; measure: DimensionKind }[] = []
  if (walls.length > 0) {
    const order = section.levels.map((l) => l.floor)
    const counts = new Map<string, number>()
    for (const w of walls) counts.set(w.floor, (counts.get(w.floor) ?? 0) + 1)
    const most = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]![0]
    const faces = (list: typeof walls): Point[] => list.flatMap((w) => [{ at: w.from, mark: { kind: 'face' as const, id: w.id } }, { at: w.to, mark: { kind: 'face' as const, id: w.id } }])
    const all = merged(faces(walls))
    horizontal.push({ kind: 'walls', points: merged(faces(walls.filter((w) => w.floor === most))), measure: 'wall' })
    if (all.length >= 2) horizontal.push({ kind: 'length', points: [all[0]!, all[all.length - 1]!], measure: 'overall' })
  }

  /** Each chain kept when it has a dimension and says more than the next one out. */
  const kept = (list: typeof vertical, axis: SectionChain['axis'], across: number): SectionChain[] =>
    list
      .filter((c, i) => c.points.length >= 2 && (i === list.length - 1 || !sameAs(c.points, list[i + 1]!.points)))
      .map((c) => chainOf(c.kind, axis, c.points, across, c.measure))
      .filter((c) => c.dimensions.length > 0)
  return [...kept(vertical, 'vertical', left), ...kept(horizontal, 'horizontal', section.bounds.min.y)]
}
