/**
 * LVL-26: walls of two floors standing in the same space. A wall of one floor that rises past the
 * floor level of a floor above it, where a wall of that floor lies along it with their bodies
 * overlapping for more than `sameSpaceAlong`, is one wall counted on two floors (an annex's walls
 * run up past its mezzanine, and the mezzanine draws them again): `wall/same-space`, a warning on
 * the lower wall, naming both. Walls through floors (LVL-5) stand on every floor by design and are
 * left out, as are curved walls, dividing lines and walls the check leaves out. Floors stand where
 * every reader stacks them (`floorElevations`). Pure.
 */
import type { FloorPlan, Wall } from './plan'
import type { Issue } from './validate'
import { floorOf, planFloors } from './floors'
import { floorElevations } from './elevations'
import { sharedPart } from './through'
import { tolerance } from './tolerances'
import { metresText } from './rounding'
import { english, name, num, said, type Value } from '../messages/say'
import { withSaid } from './issueWords'
import { wallAxis, type WallAxis } from './wall'

const m = (value: number): Value => num(metresText(value))

/** How far two straight walls lie along each other with their bodies overlapping; 0 when they do not. */
function sharedAlong(a: WallAxis, wall: Wall, b: WallAxis, other: Wall): number {
  if (Math.abs(a.dir.x * b.dir.y - a.dir.y * b.dir.x) > tolerance('writtenParallel')) return 0
  const reach = (wall.thickness + other.thickness) / 2 - tolerance('noLength')
  const off = (p: { x: number; y: number }): number => (p.x - a.start.x) * a.normal.x + (p.y - a.start.y) * a.normal.y
  if (!(reach > 0) || Math.abs(off(b.start)) >= reach || Math.abs(off(b.end)) >= reach) return 0
  const at = (p: { x: number; y: number }): number => (p.x - a.start.x) * a.dir.x + (p.y - a.start.y) * a.dir.y
  const [s0, s1] = [at(b.start), at(b.end)].sort((x, y) => x - y) as [number, number]
  return Math.max(0, Math.min(a.length, s1) - Math.max(0, s0))
}

export function sameSpaceIssues(plan: FloorPlan, broken: ReadonlySet<string>): Issue[] {
  const floors = planFloors(plan)
  if (floors.length < 2) return []
  const byFloor = new Map<string, Array<{ wall: Wall; axis: WallAxis }>>()
  for (const wall of plan.walls) {
    if (wall.virtual === true || wall.arc !== undefined || wall.through !== undefined || sharedPart(wall) !== null || broken.has(wall.id)) continue
    if (!Number.isFinite(wall.height) || !(wall.thickness > 0)) continue
    const axis = wallAxis(wall)
    if (!(axis.length > tolerance('noLength'))) continue
    const floor = floorOf(wall)
    byFloor.set(floor, [...(byFloor.get(floor) ?? []), { wall, axis }])
  }
  if (byFloor.size < 2) return []
  const levels = floorElevations(plan).floors
  const named = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const same = tolerance('sameFloorLevel')
  const issues: Issue[] = []
  for (const [lower, walls] of byFloor) {
    const base = levels.get(lower)?.floorLevel
    if (base === undefined || !Number.isFinite(base)) continue
    // The floors above it, nearest first: a wall is said against the first it runs into.
    const above = [...byFloor.keys()]
      .map((id) => ({ id, level: levels.get(id)?.floorLevel }))
      .filter((f): f is { id: string; level: number } => f.id !== lower && f.level !== undefined && Number.isFinite(f.level) && f.level > base + same)
      .sort((x, y) => x.level - y.level)
    for (const { wall, axis } of walls) {
      for (const upper of above) {
        if (base + wall.height <= upper.level + same) break
        let found: { other: Wall; along: number } | null = null
        for (const { wall: other, axis: theirs } of byFloor.get(upper.id)!) {
          const along = sharedAlong(axis, wall, theirs, other)
          if (along > tolerance('sameSpaceAlong')) {
            found = { other, along }
            break
          }
        }
        if (found === null) continue
        const sentence = said('issue.wall/same-space', {
          wall: name(wall.id),
          floor: name(named.get(lower) ?? lower),
          height: m(wall.height),
          past: m(base + wall.height - upper.level),
          over: name(named.get(upper.id) ?? upper.id),
          other: name(found.other.id),
          along: m(found.along),
        })
        issues.push(withSaid({ entity: 'wall', id: wall.id, code: 'wall/same-space', severity: 'warning', message: english(sentence) }, sentence))
        break
      }
    }
  }
  return issues
}
