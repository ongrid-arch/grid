/**
 * Columns standing in each other, and in an item (CNT-21): a column inside a rack, a cupboard or a
 * fixture, or two columns drawn on the same spot. Both parts are named, with how far one reaches
 * into the other, past the same tolerance as two items (`itemOverlap`), so a column against an
 * item's face is not named. A column against or in a wall is ordinary building and is not named,
 * with two exceptions (ARE-80): a column in an opening's hole (a perimeter column drawn through a
 * window's glass or a doorway), and a partition drawn on through a column, past it on both sides.
 * A partition that stops at or in a column is how one is drawn to it, and is not named. Curved
 * walls are not looked at for either.
 *
 * Its own file, not `columns.ts`: it reads the items' footprints, and the items' checks read the
 * rooms, which read the columns.
 *
 * Pure: a plan in, issues out.
 */

import type { Column } from '../types/floorplan'
import type { FloorPlan, Opening, Wall } from './plan'
import type { Issue } from './validate'
import { columnFloorIds, columnFootprint, columnSaid, soundColumns } from './columns'
import { itemFootprint, itemNameSaid, convexPenetration } from './items'
import { wallFloorIds } from './through'
import { isCurved, wallAxis, wallPlanSlices, wallSlicePolygon } from './wall'
import type { Vec2 } from './vec2'
import { dot, sub } from './vec2'
import { floorOf } from './floors'
import { tolerance } from './tolerances'
import { metresText } from './rounding'
import { english, name, num, said, type Said } from '../messages/say'
import { withSaid } from './issueWords'

const clash = (id: string, code: string, sentence: Said, hit: string): Issue =>
  withSaid({ entity: 'plan', id, code, message: english(sentence), severity: 'warning', hits: [hit] }, sentence)

/**
 * The columns of a plan standing in another column, or in an item on a floor they stand on. Items
 * the drawing's checks left out (`broken`) are skipped.
 */
export function columnClashIssues(plan: FloorPlan, broken: ReadonlySet<string>): Issue[] {
  const columns = soundColumns(plan)
  if (columns.length === 0) return []
  const items = (plan.items ?? []).filter((item) => !broken.has(item.id))
  const walls = plan.walls.filter((wall) => !broken.has(wall.id) && !isCurved(wall) && wall.thickness > 0 && Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) > tolerance('noLength'))
  const openings = plan.openings.filter((opening) => !broken.has(opening.id))
  const feet = columns.map((column) => ({ column, footprint: columnFootprint(column), floors: columnFloorIds(plan, column) }))
  const issues: Issue[] = []
  for (let i = 0; i < feet.length; i++) {
    const a = feet[i]!
    for (let j = 0; j < i; j++) {
      const b = feet[j]!
      if (!a.floors.some((floor) => b.floors.includes(floor))) continue
      const depth = convexPenetration(a.footprint, b.footprint)
      if (depth <= tolerance('itemOverlap')) continue
      issues.push(
        clash(a.column.id, 'plan/column-overlap', said('issue.plan/column-overlap', { column: columnSaid(a.column), other: columnSaid(b.column), depth: num(metresText(depth)) }), b.column.id)
      )
    }
    for (const item of items) {
      if (!a.floors.includes(floorOf(item))) continue
      const depth = convexPenetration(a.footprint, itemFootprint(item))
      if (depth <= tolerance('itemOverlap')) continue
      issues.push(
        clash(a.column.id, 'plan/column-in-item', said('issue.plan/column-in-item', { column: columnSaid(a.column), item: itemNameSaid(item), depth: num(metresText(depth)) }), item.id)
      )
    }
    issues.push(...columnInWalls(plan, a.column, a.footprint, a.floors, walls, openings))
  }
  return issues
}

/** ARE-80: a column in an opening's hole, or with a partition drawn on through it. */
function columnInWalls(plan: FloorPlan, column: Column, footprint: Vec2[], floors: readonly string[], walls: readonly Wall[], openings: readonly Opening[]): Issue[] {
  const issues: Issue[] = []
  const reach = tolerance('itemOverlap')
  for (const wall of walls) {
    if (!wallFloorIds(plan, wall).some((floor) => floors.includes(floor))) continue
    const own = openings.filter((opening) => opening.wall === wall.id)
    let inOpening = false
    for (const opening of own) {
      const depth = convexPenetration(footprint, wallSlicePolygon(wall, opening.offset, opening.offset + opening.width))
      if (depth <= reach) continue
      inOpening = true
      const sentence = said(`issue.plan/column-in-opening.${opening.type === 'window' ? 'window' : 'door'}`, { column: columnSaid(column), opening: name(opening.id), depth: num(metresText(depth)) })
      issues.push(clash(column.id, 'plan/column-in-opening', sentence, opening.id))
    }
    if (inOpening || wall.kind !== 'partition') continue
    // The partition's solid runs: one reaching into the column, and the wall going on past it both ways.
    const depth = Math.max(0, ...wallPlanSlices(wall, own).map((slice) => convexPenetration(footprint, slice)))
    if (depth <= reach) continue
    const axis = wallAxis(wall)
    const along = footprint.map((p) => dot(sub(p, axis.start), axis.dir))
    if (Math.min(...along) <= reach || Math.max(...along) >= axis.length - reach) continue
    issues.push(clash(column.id, 'plan/column-in-partition', said('issue.plan/column-in-partition', { column: columnSaid(column), wall: name(wall.id), depth: num(metresText(depth)) }), wall.id))
  }
  return issues
}
