/**
 * CNT-60: the site in 3D, for the 3D views and the GLB.
 *
 * The site's things (BRF-3, C13) and the shapes drawn round the plan for context (CNT-6, C23) as
 * plain upright blocks: an outline on plan, counter-clockwise, solid from its `bottom` to its
 * `top`, in the floors' own datum (metres from the ground floor's floor level, as
 * `floorElevations` places the storeys). Each block keeps the id of the thing it draws and its
 * kind, which the viewer colours and the GLB names and gives a material.
 *
 * Everything stands on the ground at its middle: the site's level (`site.ground`, else 0), or on a
 * slope the ground there (`groundSurface`, CNT-49).
 *
 * - A neighbour (a context shape) rises its `height` from the ground, or from the floor it names
 *   when that floor is above the ground floor, so a platform up a floor is drawn up there. One with
 *   no height is drawn as its footprint, `siteLift` thick.
 * - A fence and a gate are thin plates along their line (`fenceDrawnThickness`), their height, else
 *   `fenceDrawnHeight`.
 * - A path is a strip its width wide along its middle line, and paving its shape, each `siteLift`
 *   thick on the ground.
 * - A pool is its water, sunk into the ground: from `poolDrawnDepth` below the ground to
 *   `poolWaterBelowEdge` below it. The ground is cut away over it (`sceneGround`).
 * - A tree is a trunk (`treeDrawnTrunk` across) up to its crown, and a crown its canopy across
 *   (else `treeDrawnCanopy`) from `treeCrownBase` of its height (else `treeDrawnHeight`) to its top,
 *   traced with `canopySides` sides, as its shadow is (CNT-58).
 *
 * Drawn only: no block is a wall, a room or a part of a building, and none is in a measure. Pure,
 * and never throws: a thing that cannot be drawn is left out.
 */

import type { ContextShape, SiteThing } from '../types/floorplan'
import type { BuildingElevations } from './elevations'
import { floorElevations } from './elevations'
import type { FloorPlan } from './plan'
import { groundLevel } from './ground'
import { limit, tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { signedArea } from './vec2'

/** The kinds of block the site is drawn with. */
export const SITE_BLOCK_KINDS = ['neighbour', 'fence', 'gate', 'path', 'paving', 'water', 'trunk', 'crown'] as const
export type SiteBlockKind = (typeof SITE_BLOCK_KINDS)[number]

/** One upright block of the site: its outline counter-clockwise, solid from `bottom` to `top`. */
export interface SiteBlock {
  /** The id of the thing or context shape it draws. */
  readonly id: string
  readonly kind: SiteBlockKind
  readonly outline: readonly Vec2[]
  readonly bottom: number
  readonly top: number
}

export interface SiteScene {
  /** The site's blocks: the neighbours first, in the plan's order, then the site's things in theirs. */
  readonly blocks: readonly SiteBlock[]
}

type Pair = readonly [number, number]

/** A ring as points, counter-clockwise, its closing point (the first again) left out. */
function ccw(points: readonly Pair[]): Vec2[] {
  const first = points[0]
  const last = points.at(-1)
  const open = points.length > 1 && first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points
  const ring = open.map(([x, y]) => ({ x, y }))
  return signedArea(ring) < 0 ? ring.reverse() : ring
}

/** The middle of the box round some points. */
function middle(points: readonly Pair[]): Vec2 {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

/** A line as one counter-clockwise rectangle per piece, `half` each side of it. */
function strips(points: readonly Pair[], half: number): Vec2[][] {
  const out: Vec2[][] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i]!
    const [bx, by] = points[i + 1]!
    const length = Math.hypot(bx - ax, by - ay)
    if (!(length > 0)) continue
    const n = { x: (-(by - ay) / length) * half, y: ((bx - ax) / length) * half }
    out.push(ccw([
      [ax - n.x, ay - n.y],
      [bx - n.x, by - n.y],
      [bx + n.x, by + n.y],
      [ax + n.x, ay + n.y]
    ]))
  }
  return out
}

/** A disc, counter-clockwise, traced with `canopySides` sides. */
function disc(at: Pair, radius: number): Vec2[] {
  const sides = Math.max(3, Math.round(limit('canopySides')))
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides
    return { x: at[0] + radius * Math.cos(a), y: at[1] + radius * Math.sin(a) }
  })
}

const usable = (ring: readonly Vec2[]): boolean => ring.length >= 3 && ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Math.abs(signedArea(ring)) > 0

/** The site's blocks for the 3D views and the GLB. */
export function siteScene(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): SiteScene {
  let groundAt: (p: Vec2) => number = () => 0
  let groundFloors: ReadonlySet<string> = new Set()
  try {
    const ground = groundLevel(plan, elevations)
    const surface = ground.surface
    groundAt = surface === null ? () => ground.level : (p) => surface.at(p)
    groundFloors = new Set(ground.groundFloors.map((f) => f.id))
  } catch {
    // The ground at 0, as with none stated.
  }

  const blocks: SiteBlock[] = []
  const push = (id: string, kind: SiteBlockKind, outline: readonly Vec2[], bottom: number, top: number): void => {
    if (usable(outline) && Number.isFinite(bottom) && Number.isFinite(top) && top > bottom) blocks.push({ id, kind, outline, bottom, top })
  }

  function neighbour(shape: ContextShape): void {
    const outline = ccw(shape.points)
    const floor = shape.floor
    const up = floor !== undefined && !groundFloors.has(floor) ? elevations.floors.get(floor) : undefined
    // A floor below the ground floor stands it on the ground too: a neighbour is never buried.
    const ground = groundAt(middle(shape.points))
    const bottom = up !== undefined && up.floorLevel > ground ? up.floorLevel : ground
    push(shape.id, 'neighbour', outline, bottom, bottom + (shape.height ?? tolerance('siteLift')))
  }

  function siteThing(thing: SiteThing): void {
    const points = thing.points ?? []
    if (thing.kind === 'tree') {
      if (thing.at === undefined) return
      const ground = groundAt({ x: thing.at[0], y: thing.at[1] })
      const height = thing.height ?? limit('treeDrawnHeight')
      const crown = ground + height * tolerance('treeCrownBase')
      push(thing.id, 'trunk', disc(thing.at, limit('treeDrawnTrunk') / 2), ground, crown)
      push(thing.id, 'crown', disc(thing.at, (thing.canopy ?? limit('treeDrawnCanopy')) / 2), crown, ground + height)
      return
    }
    if (points.length < 2) return
    const ground = groundAt(middle(points))
    if (thing.kind === 'fence' || thing.kind === 'gate') {
      const height = thing.height ?? limit('fenceDrawnHeight')
      for (const strip of strips(points, limit('fenceDrawnThickness') / 2)) push(thing.id, thing.kind, strip, ground, ground + height)
    } else if (thing.kind === 'path') {
      if (thing.width === undefined) return
      for (const strip of strips(points, thing.width / 2)) push(thing.id, 'path', strip, ground, ground + tolerance('siteLift'))
    } else if (thing.kind === 'paving') {
      push(thing.id, 'paving', ccw(points), ground, ground + tolerance('siteLift'))
    } else if (thing.kind === 'pool') {
      push(thing.id, 'water', ccw(points), ground - limit('poolDrawnDepth'), ground - limit('poolWaterBelowEdge'))
    }
  }

  // The neighbours first, then the site's things, each in the plan's order.
  for (const shape of plan.context ?? []) {
    try {
      neighbour(shape)
    } catch {
      // Left out: an outline that cannot be drawn.
    }
  }
  for (const thing of plan.site?.things ?? []) {
    try {
      siteThing(thing)
    } catch {
      // Left out: a thing that cannot be drawn.
    }
  }
  return { blocks }
}

/** CNT-60: the pools' edges on plan, counter-clockwise, which the ground is cut away over. */
export function poolOutlines(plan: FloorPlan): Vec2[][] {
  const out: Vec2[][] = []
  for (const thing of plan.site?.things ?? []) {
    if (thing.kind !== 'pool' || (thing.points?.length ?? 0) < 3) continue
    const ring = ccw(thing.points!)
    if (usable(ring)) out.push(ring)
  }
  return out
}
