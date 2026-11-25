/**
 * A floor's outline (LVL-4): the floor its walls enclose, walls and all, the shape a slab covers
 * and a roof is cut from.
 *
 * It is joined as `spaces.ts` joins the walls for the gross external area (ARE-9), so the two agree
 * to the last digit the arithmetic keeps: every solid wall a strip as wide as it is thick, with
 * square ends lengthened by `gap` and the corners made good (`cornerFills`), every dividing line a
 * hairline, and what their outer edges enclose. Only the pieces that hold enclosed floor are kept:
 * a garden wall standing apart, which encloses nothing, carries no slab and no roof.
 *
 * The outline only exists where walls meet and close a floor, or where the floor states one
 * (BRF-4, C17: `massing.ts`), joined with what its walls enclose; a floor whose walls enclose
 * nothing and that states no outline has none, and says so. Pure, and never throws. The join is done by `polygon-clipping` (MIT).
 */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import { floorWalls } from './areas'
import type { FloorPlan } from './plan'
import { boxOfRings, cornerFills, inPolygon, multiArea, pointInside, strip, union } from './polygons'
import { farReason, outlineFarReason } from './spaces'
import { statedOutline } from './massing'
import { straightPieces } from './wall'
import { TOLERANCES, tolerance } from './tolerances'

export interface FloorOutline {
  readonly floor: string
  /** The pieces of the outline, each counter-clockwise with its holes clockwise. */
  readonly pieces: MultiPolygon
  /** In square metres: the gross external area of the pieces that hold floor. */
  readonly area: number
  /** The floor the walls enclose, each space a piece with a point inside it, away from its edges. */
  readonly spaces: readonly { readonly pieces: Polygon; readonly at: { readonly x: number; readonly y: number } }[]
}

/** Why a floor has no outline. */
export interface FloorOutlineUnknown {
  readonly floor: string
  readonly reason: string
}

export function outlineKnown(result: FloorOutline | FloorOutlineUnknown): result is FloorOutline {
  return !('reason' in result)
}

/**
 * The outline of one floor of `plan` a slab covers, its walls in `broken` left out. Not SHT-11's
 * `floorOutline` (`spaces.ts`), the outer rings alone for the floor above's dashed line: this one
 * keeps the holes and the enclosed spaces, and drops a piece that encloses no floor. A floor whose walls close no
 * floor has an outline of no pieces. Unknown, with the reason, when the walls lie too far out to
 * join or the polygon library fails on every grid.
 */
export function slabOutline(plan: FloorPlan, floor: string, broken: ReadonlySet<string>): FloorOutline | FloorOutlineUnknown {
  // A curved wall is joined as its straight pieces, as `spaces.ts` joins it (CNT-18).
  const walls = floorWalls(plan, floor, broken).flatMap(straightPieces)
  // BRF-4 (C17): the outline the floor states, joined with what its walls enclose.
  const outline = statedOutline(plan, floor)
  const far = farReason(walls) ?? outlineFarReason(floor, outline)
  if (far) return { floor, reason: far }
  if (walls.length === 0 && outline === null) return { floor, pieces: [], area: 0, spaces: [] }

  let reach = 0
  for (const wall of walls) reach = Math.max(reach, ...wall.start.map(Math.abs), ...wall.end.map(Math.abs))
  for (const [x, y] of outline?.[0] ?? []) reach = Math.max(reach, Math.abs(x), Math.abs(y))
  const join = tolerance('gap')
  for (const grid of TOLERANCES.joinGrids.values) {
    try {
      const steps = grid === 0 ? 0 : Math.round(1 / grid)
      const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
      const lineHalf = Math.max(TOLERANCES.lineHalfWidth.value, 5 * grid, reach * TOLERANCES.farNoise.value)
      const runs = walls.map((wall) => {
        const start = { x: wall.start[0], y: wall.start[1] }
        const dx = wall.end[0] - start.x
        const dy = wall.end[1] - start.y
        const length = Math.hypot(dx, dy)
        return { wall, start, dir: { x: dx / length, y: dy / length }, length }
      })
      const solidRuns = runs.filter((r) => r.wall.virtual !== true)
      const bodies = (virtual: boolean): Polygon[] =>
        runs.filter((r) => (r.wall.virtual === true) === virtual).map((r) => strip(r.start, r.dir, r.length, virtual ? lineHalf : r.wall.thickness / 2, join, snap))
      const solid = union([...bodies(false), ...cornerFills(solidRuns, lineHalf, snap)])
      const lines = bodies(true)
      const frame = lines.length === 0 ? solid : union([...solid, ...lines])
      const stated: Polygon[] = outline === null ? [] : [[outline[0]!.map(([x, y]): [number, number] => [snap(x), snap(y)])]]
      const filled = union([...frame.map((polygon) => [polygon[0]!]), ...stated])
      const faces = filled.length === 0 ? [] : frame.length === 0 ? filled : polygonClipping.difference(filled, frame)
      const inside = faces.map((face) => pointInside(face, boxOfRings(face)))
      const pieces = filled.filter((piece) => inside.some((p) => inPolygon(p, piece)))
      return { floor, pieces, area: multiArea(pieces), spaces: faces.map((face, i) => ({ pieces: face, at: inside[i]! })) }
    } catch {
      // The polygon library could not join the walls on this grid: the next, coarser one is tried.
    }
  }
  // CNT-22: in Grid's own words; the polygon library's message is never passed on.
  return { floor, reason: 'the walls could not be joined: their shapes are too close to tell apart' }
}
