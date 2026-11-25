/**
 * Columns standing in each other, and in an item (CNT-21): a column inside a rack, a cupboard or a
 * fixture, or two columns drawn on the same spot. Both parts are named, with how far one reaches
 * into the other, past the same tolerance as two items (`itemOverlap`), so a column against an
 * item's face is not named. A column against or in a wall is ordinary building and is not named.
 *
 * Its own file, not `columns.ts`: it reads the items' footprints, and the items' checks read the
 * rooms, which read the columns.
 *
 * Pure: a plan in, issues out.
 */

import type { FloorPlan } from './plan'
import type { Issue } from './validate'
import { columnFloorIds, columnFootprint, columnSaid, soundColumns } from './columns'
import { itemFootprint, itemNameSaid, convexPenetration } from './items'
import { floorOf } from './floors'
import { tolerance } from './tolerances'
import { metresText } from './rounding'
import { english, num, said, type Said } from '../messages/say'
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
  }
  return issues
}
