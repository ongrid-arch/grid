/**
 * WRT-25: a floor that stands at another height, or has another level, height or slab, between
 * two versions of a plan, with its old and new figures.
 *
 * The floors in both versions are paired by id (and, asked, by name after that, for two plans
 * written apart). Each pair is compared by what it states (`name`, `level`, `elevation`,
 * `height`, `slab`, as the id diff's `floorProps` does) and by where its floor stands as
 * `floorElevations` works it out, so a floor that states no elevation and stands elsewhere
 * because the floors under it changed is a change too. The move up or down is said from where
 * it stands, so a stated and a worked-out move read alike.
 *
 * Pure: plans in, plain data out. The words are keys of the message files (`diff.floor.*`).
 */

import type { Floor, FloorPlan } from '../plan'
import { planFloors } from '../floors'
import { floorElevations } from '../elevations'
import { metresText } from '../rounding'
import { tolerance } from '../tolerances'
import { joined, name, num, said, type Said, type Value } from '../../messages/say'

/** A figure before and after; null for one a version does not state. */
export interface FloorFigure {
  readonly before: number | null
  readonly after: number | null
}

export interface FloorChange {
  /** The later id. */
  readonly floor: string
  /** The later name. */
  readonly name: string
  /** The name before, when it changed. */
  readonly renamedFrom: string | null
  /** The storey number (`level`), when it changed. */
  readonly level: { readonly before: number; readonly after: number } | null
  /** What the floor states, when it changed. */
  readonly elevation: FloorFigure | null
  readonly height: FloorFigure | null
  readonly slab: FloorFigure | null
  /** Where its floor stands, in metres, as `floorElevations` works it out, when it moved. */
  readonly stands: { readonly before: number; readonly after: number } | null
  /** The line: "Floor "Mezzanine" moved down 9.50 m: elevation 13.75 → 4.25 m". */
  readonly said: Said
  /** The same words for the middle of a sentence: "floor "Mezzanine" moved down …". */
  readonly inSentence: Said
}

export interface FloorChangeOptions {
  /** Pair the floors left over by their name too: for two plans written apart. */
  readonly byName?: boolean
}

function floorsOf(plan: FloorPlan): Floor[] {
  try {
    return planFloors(plan)
  } catch {
    return []
  }
}

/** The floors in both versions: by id, then (asked) by name. */
function pairFloors(earlier: readonly Floor[], later: readonly Floor[], byName: boolean): Array<readonly [Floor, Floor]> {
  const pairs: Array<readonly [Floor, Floor]> = []
  const used = new Set<string>()
  const left: Floor[] = []
  for (const before of earlier) {
    const after = later.find((f) => f.id === before.id)
    if (after) {
      pairs.push([before, after])
      used.add(after.id)
    } else left.push(before)
  }
  if (byName) {
    for (const before of left) {
      const after = later.find((f) => !used.has(f.id) && f.name === before.name)
      if (!after) continue
      pairs.push([before, after])
      used.add(after.id)
    }
  }
  return pairs
}

const finite = (value: number | undefined): number | null => (value !== undefined && Number.isFinite(value) ? value : null)

/** A stated figure that changed, or null. */
function figure(before: number | undefined, after: number | undefined, epsilon: number): FloorFigure | null {
  const [b, a] = [finite(before), finite(after)]
  if (b === null && a === null) return null
  if (b !== null && a !== null && Math.abs(b - a) <= epsilon) return null
  return { before: b, after: a }
}

const metres = (value: number | null): Value => (value === null ? said('diff.floor.notStated') : said('diff.floor.metres', { value: num(metresText(value)) }))

/** Where each floor stands, worked out; empty when it cannot be. */
function standing(plan: FloorPlan): ReadonlyMap<string, number> {
  try {
    return new Map([...floorElevations(plan).floors].map(([id, level]) => [id, level.floorLevel] as const))
  } catch {
    return new Map()
  }
}

/** The floors in both versions that changed, in the later plan's order of floors. */
export function floorChanges(earlier: FloorPlan, later: FloorPlan, options: FloorChangeOptions = {}): FloorChange[] {
  const epsilon = tolerance('diffLength')
  const [before, after] = [floorsOf(earlier), floorsOf(later)]
  const pairs = pairFloors(before, after, options.byName === true)
  if (pairs.length === 0) return []
  // A plan of one floor stands at 0 unless it states an elevation, which is compared as stated:
  // the stack is worked out only when there are floors to stack.
  const several = before.length > 1 || after.length > 1
  const standsBefore = several ? standing(earlier) : new Map<string, number>()
  const standsAfter = several ? standing(later) : new Map<string, number>()
  const order = new Map(after.map((f, i) => [f.id, i] as const))
  pairs.sort(([, a], [, b]) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const out: FloorChange[] = []
  for (const [was, is] of pairs) {
    const renamedFrom = was.name !== is.name ? was.name : null
    const level = was.level !== is.level && Number.isFinite(was.level) && Number.isFinite(is.level) ? { before: was.level, after: is.level } : null
    const elevation = figure(was.elevation, is.elevation, epsilon)
    const height = figure(was.height, is.height, epsilon)
    const slab = figure(was.slab, is.slab, epsilon)
    // Where it stands: worked out with several floors, else the elevation it states (0 when none).
    const from = standsBefore.get(was.id) ?? finite(was.elevation) ?? 0
    const to = standsAfter.get(is.id) ?? finite(is.elevation) ?? 0
    const stands = Math.abs(to - from) > epsilon ? { before: from, after: to } : null
    if (renamedFrom === null && level === null && elevation === null && height === null && slab === null && stands === null) continue

    const parts: Value[] = []
    if (renamedFrom !== null) parts.push(said('diff.floor.renamed', { name: name(is.name) }))
    if (level !== null) parts.push(said('diff.floor.level', { before: num(String(level.before)), after: num(String(level.after)) }))
    if (elevation !== null) parts.push(said('diff.floor.elevation', { before: metres(elevation.before), after: metres(elevation.after) }))
    // With the elevation stated in both, it already says where the floor stands.
    const statedBoth = finite(was.elevation) !== null && finite(is.elevation) !== null
    if (stands !== null && !statedBoth) parts.push(said('diff.floor.stands', { before: num(metresText(stands.before)), after: num(metresText(stands.after)) }))
    if (height !== null) parts.push(said('diff.floor.height', { before: metres(height.before), after: metres(height.after) }))
    if (slab !== null) parts.push(said('diff.floor.slab', { before: metres(slab.before), after: metres(slab.after) }))
    if (parts.length === 0) continue

    const floor = name(renamedFrom ?? is.name)
    const changes = joined(parts, 'join.semicolon')
    const by = stands === null ? null : num(metresText(Math.abs(stands.after - stands.before)))
    const line = (plain: 'diff.floor.changed' | 'diff.floor.changed.inSentence', up: 'diff.floor.up' | 'diff.floor.up.inSentence', down: 'diff.floor.down' | 'diff.floor.down.inSentence'): Said =>
      stands === null || by === null ? said(plain, { floor, changes }) : said(stands.after > stands.before ? up : down, { floor, by, changes })
    out.push({
      floor: is.id,
      name: is.name,
      renamedFrom,
      level,
      elevation,
      height,
      slab,
      stands,
      said: line('diff.floor.changed', 'diff.floor.up', 'diff.floor.down'),
      inSentence: line('diff.floor.changed.inSentence', 'diff.floor.up.inSentence', 'diff.floor.down.inSentence')
    })
  }
  return out
}
