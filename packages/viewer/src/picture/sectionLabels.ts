/**
 * VEW-50: where a room's words go in a section. Pure geometry in metres: the words are put in the
 * largest empty part of the room's cut, clear of every line drawn and off every solid shape.
 */
import type { PlanSection, Vec2 } from '@ongrid/floorplan/geometry'

export type Ring = readonly Vec2[]
export type Segment = readonly [Vec2, Vec2]

/** A box of words, centre and size, in metres. */
export interface LabelBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface LabelObstacles {
  /** Shapes that are filled (the cut, glass, a stair seen beyond): words never lie on them. */
  readonly solids: readonly (readonly Ring[])[]
  /** Every line drawn: edges the words must not cross. */
  readonly lines: readonly Segment[]
}

/** How many places are tried across a room's longer side. */
const STEPS = 28
/** Clear space round the words, in metres. */
const MARGIN = 0.03

const ringSegments = (ring: Ring): Segment[] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as const)
export const segmentsOf = (rings: readonly Ring[]): Segment[] => rings.flatMap(ringSegments)

function inRings(rings: readonly Ring[], p: Vec2): boolean {
  let inside = false
  for (const ring of rings) {
    for (const [a, b] of ringSegments(ring)) {
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
  }
  return inside
}

function crossesBox(a: Vec2, b: Vec2, box: { x0: number; x1: number; y0: number; y1: number }): boolean {
  // Liang–Barsky clip of the segment against the box.
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const r = q / p
      if (p < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return false
    }
  }
  return true
}

function distance(p: Vec2, [a, b]: Segment): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Whether a box is clear: no line through it, no corner or middle on a solid. */
export function boxIsClear(box: LabelBox, obstacles: LabelObstacles): boolean {
  const r = { x0: box.x - box.width / 2 - MARGIN, x1: box.x + box.width / 2 + MARGIN, y0: box.y - box.height / 2 - MARGIN, y1: box.y + box.height / 2 + MARGIN }
  if (obstacles.lines.some(([a, b]) => crossesBox(a, b, r))) return false
  const probes: Vec2[] = []
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) probes.push({ x: r.x0 + ((r.x1 - r.x0) * i) / 4, y: r.y0 + ((r.y1 - r.y0) * j) / 2 })
  return !obstacles.solids.some((rings) => probes.some((p) => inRings(rings, p)))
}

/**
 * The best place for words of one size inside a room's box, or null when none is clear: the clear
 * place farthest from every line, a little toward the middle when several are as good.
 */
export function placeLabel(room: { from: number; to: number; bottom: number; top: number }, size: { width: number; height: number }, obstacles: LabelObstacles): LabelBox | null {
  const x0 = room.from + size.width / 2
  const x1 = room.to - size.width / 2
  const y0 = room.bottom + size.height / 2
  const y1 = room.top - size.height / 2
  if (x1 < x0 || y1 < y0) return null
  const step = Math.max(room.to - room.from, room.top - room.bottom) / STEPS
  const nx = Math.max(1, Math.round((x1 - x0) / step))
  const ny = Math.max(1, Math.round((y1 - y0) / step))
  const mid = { x: (room.from + room.to) / 2, y: (room.bottom + room.top) / 2 }
  let best: { box: LabelBox; score: number } | null = null
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const box: LabelBox = { x: x1 === x0 ? x0 : x0 + ((x1 - x0) * i) / nx, y: y1 === y0 ? y0 : y0 + ((y1 - y0) * j) / ny, ...size }
      if (!boxIsClear(box, obstacles)) continue
      const near = obstacles.lines.reduce((m, s) => Math.min(m, distance(box, s)), 1)
      const score = Math.min(near, 1) - 0.01 * Math.hypot(box.x - mid.x, box.y - mid.y)
      if (best === null || score > best.score) best = { box, score }
    }
  }
  return best?.box ?? null
}

/** What the words of a section's rooms keep clear of: the section's own shapes and lines. */
export function labelObstacles(section: PlanSection): LabelObstacles {
  const shapes = [
    ...section.cut.map((p) => [p.outline, ...p.holes] as Ring[]),
    ...section.glass.map((g) => [...g.rings] as Ring[]),
    ...section.beyond.filter((f) => f.kind === 'stair').flatMap((f) => f.pieces.map((p) => [p.outline, ...p.holes] as Ring[]))
  ]
  const pieces = [...section.cut, ...section.assumed.flatMap((a) => a.pieces), ...section.beyond.flatMap((f) => f.pieces)]
  const lines: Segment[] = [
    ...pieces.flatMap((p) => segmentsOf([p.outline, ...p.holes])),
    ...section.glass.flatMap((g) => segmentsOf(g.rings)),
    ...section.beyond.flatMap((f) => (f.edge === null ? [] : [f.edge]))
  ]
  return { solids: shapes, lines }
}
