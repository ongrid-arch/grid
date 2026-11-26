/**
 * SHT-10: what a drawing needs to draw a plan in more detail than its outlines, worked out here so
 * the viewer only draws it: the kind each wall is drawn as, the hatch lines across a wall of a
 * material, and a door's or window's frames, its glass as two panes and its sills.
 *
 * Nothing here says how any of it looks (no colour, pen or dash) or when a drawing shows it: a
 * look decides that (`packages/viewer`, SHT-1). The sizes are the ones the 3D model draws a
 * frame and glass with (`frameFace`, `frameDepth`, `glassThickness`), and how far a sill stands
 * out from its wall (`sillProjection`). The plan holds no frame, pane or sill: these are drawn
 * only, never measured or checked.
 *
 * Pure: drawing geometry in, points in metres out.
 */
import type { FloorPlan } from './plan'
import type { PlanOpening, PlanWall } from './floorplan'
import type { Vec2 } from './vec2'
import { add, dot, scale } from './vec2'
import { limit } from './tolerances'
import { planWallTypes } from './partTypes'

/** SHT-10: the three ways a wall is drawn: facing outside (or another home), inside, and a partition. */
export const WALL_DRAWN_KINDS = ['outside', 'inside', 'partition'] as const
export type WallDrawnKind = (typeof WALL_DRAWN_KINDS)[number]

/**
 * SHT-10: how a wall is drawn, from its worked-out exposure (MSG-13, CNT-6) and its stated kind:
 * a wall facing outside, or a party wall or one to the common parts (`separating`), as an outside
 * wall; a stated partition that stands inside as a partition, and a garden or boundary wall
 * (CNT-26) in the partition's weight; every other wall as an inside wall.
 */
export function wallDrawnKind(wall: Pick<PlanWall, 'exposure' | 'partition' | 'landscape'>): WallDrawnKind {
  // CNT-26: a garden or boundary wall is drawn in the partition's lighter weight.
  if (wall.landscape === true) return 'partition'
  if (wall.exposure === 'exterior' || wall.exposure === 'separating') return 'outside'
  return wall.partition === true ? 'partition' : 'inside'
}

/**
 * SHT-10: the materials of the plan's wall types (CNT-15, C24), each once, in the order the types
 * list them: the order a drawing gives each its hatch in, so a material keeps its hatch on every
 * floor of the plan.
 */
export function planWallMaterials(plan: Pick<FloorPlan, 'types'>): string[] {
  const out: string[] = []
  for (const type of planWallTypes(plan).values()) if (type.material !== undefined && !out.includes(type.material)) out.push(type.material)
  return out
}

type Segment = readonly [Vec2, Vec2]

/**
 * SHT-10: parallel lines `spacing` metres apart at `angle` radians (counter-clockwise from +X),
 * cut to the inside of `ring`, which may be concave. The lines are set out from the plan's origin,
 * so the hatch of two walls that meet runs on across the joint.
 */
export function hatchLines(ring: readonly Vec2[], spacing: number, angle: number): Segment[] {
  return hatchRings([ring], spacing, angle)
}

/**
 * VEW-65: `hatchLines` over several rings at once, even-odd: an outline and its holes, so the hatch
 * keeps out of the holes.
 */
export function hatchRings(rings: readonly (readonly Vec2[])[], spacing: number, angle: number): Segment[] {
  const live = rings.filter((ring) => ring.length >= 3)
  if (live.length === 0 || !(spacing > 0)) return []
  const along = { x: Math.cos(angle), y: Math.sin(angle) }
  const across = { x: -along.y, y: along.x }
  const levelsOf = live.map((ring) => ring.map((p) => dot(p, across)))
  const all = levelsOf.flat()
  const first = Math.ceil(Math.min(...all) / spacing)
  const last = Math.floor(Math.max(...all) / spacing)
  const out: Segment[] = []
  for (let step = first; step <= last; step++) {
    const level = step * spacing
    const crossings: number[] = []
    live.forEach((ring, r) => {
      const levels = levelsOf[r]!
      for (let i = 0; i < ring.length; i++) {
        const a = levels[i]! - level
        const b = levels[(i + 1) % ring.length]! - level
        // Half-open, so a line through a corner meets it once.
        if (a > 0 === b > 0) continue
        const p = ring[i]!
        const q = ring[(i + 1) % ring.length]!
        const t = a / (a - b)
        crossings.push(dot({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, along))
      }
    })
    crossings.sort((m, n) => m - n)
    const base = scale(across, level)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      if (crossings[i + 1]! > crossings[i]!) out.push([add(base, scale(along, crossings[i]!)), add(base, scale(along, crossings[i + 1]!))])
    }
  }
  return out
}

/** SHT-10: a door's or window's detail on a plan: its frames, its glass as two panes and its sills. */
export interface OpeningDetail {
  /** One frame at each side of the hole, a ring counter-clockwise, inside the hole. */
  readonly frames: readonly (readonly Vec2[])[]
  /** A window's two panes, along the middle of its frame; none for a door. */
  readonly glass: readonly Segment[]
  /** A window's sill on each face of the wall, standing out from it; none for a door. */
  readonly sills: readonly Segment[]
}

const NO_DETAIL: OpeningDetail = { frames: [], glass: [], sills: [] }

/**
 * SHT-10: the frames of a door or window, `frameFace` wide at each side of its hole: a door's
 * through the whole depth of its wall, a window's `frameDepth` deep in the middle of it (no deeper
 * than the wall), as the 3D model draws them. A window's glass is two panes `glassThickness` apart
 * in the middle of the wall, and its sills a line along each face, `sillProjection` out from it and
 * as far past each side of the hole. A doorless opening, and an opening in a dividing line, have none.
 */
export function openingDetail(opening: PlanOpening): OpeningDetail {
  if (opening.type === 'opening' || !(opening.thickness > 0)) return NO_DETAIL
  const span = Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y)
  if (!(span > 0)) return NO_DETAIL
  const along = { x: (opening.to.x - opening.from.x) / span, y: (opening.to.y - opening.from.y) / span }
  const n = opening.normal
  const at = (t: number, by: number): Vec2 => ({ x: opening.from.x + along.x * t + n.x * by, y: opening.from.y + along.y * t + n.y * by })
  const face = Math.min(limit('frameFace'), span / 2)
  const window = opening.type === 'window'
  const half = window ? Math.min(limit('frameDepth'), opening.thickness) / 2 : opening.thickness / 2
  const frame = (t0: number, t1: number): Vec2[] => [at(t0, -half), at(t1, -half), at(t1, half), at(t0, half)]
  const frames = [frame(0, face), frame(span - face, span)]
  if (!window) return { frames, glass: [], sills: [] }
  const pane = Math.min(limit('glassThickness'), half) / 2
  const glass: Segment[] = [
    [at(face, -pane), at(span - face, -pane)],
    [at(face, pane), at(span - face, pane)]
  ]
  const out = limit('sillProjection')
  const wall = opening.thickness / 2
  const sills: Segment[] = [
    [at(-out, wall + out), at(span + out, wall + out)],
    [at(-out, -(wall + out)), at(span + out, -(wall + out))]
  ]
  return { frames, glass, sills }
}
