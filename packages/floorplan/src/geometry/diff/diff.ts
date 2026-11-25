/**
 * Compares two versions of a plan and says exactly what changed.
 *
 * Pure: plans in, plain data out. No AI, no file, no git.
 */

import type { FloorPlan, PlanIndex } from '../plan'
import { indexPlan } from '../plan'
import { DEFAULT_FLOOR, floorOf, planFloors } from '../floors'
import { idChurn } from './churn'
import { derivedOpenings } from './derived'
import { matchById } from './match'
import type { Matched } from './match'
import { ENTITY_ORDER, compareIssues, compareText } from './order'
import { wallMotion } from './motion'
import { floorProps, openingProps, phaseProp, roomProps, wallProps } from './props'
import { phaseReading } from '../phases'
import { roomAreas } from './rooms'
import { assess, assessmentIssues, without } from './validity'
import { makeSummarizer } from './summary'
import type {
  ChangeKind,
  DiffOptions,
  EntityRef,
  PlanChange,
  PlanDiff,
  PropChange,
  WallMotion
} from './types'
import { PLAN_DIFF_SCHEMA_VERSION } from './types'
import { tolerance } from '../tolerances'


/**
 * Floors by storey (`level`), then id: the review numbers its cards in this
 * order, and the basement must not come before the ground floor because of its
 * spelling. A floor only in the earlier plan keeps its earlier level.
 */
function floorOrder(earlier: FloorPlan, later: FloorPlan): (a: string, b: string) => number {
  const levels = new Map<string, number>()
  for (const floor of [...planFloors(earlier), ...planFloors(later)]) {
    levels.set(floor.id, floor.level)
  }
  const levelOf = (id: string): number => levels.get(id) ?? 0
  return (a, b) => levelOf(a) - levelOf(b) || compareText(a, b)
}

function change(
  entity: EntityRef,
  floor: string,
  kind: ChangeKind,
  props: readonly PropChange[] = [],
  motion?: WallMotion
): PlanChange {
  return {
    id: `${entity.type}:${entity.id}:${kind}`,
    entity,
    floor,
    kind,
    props,
    ...(motion ? { motion } : {}),
    summary: '',
    dependsOn: [],
    derived: false
  }
}

/** How one kind of entity is compared: where it lives and what can differ. */
interface Comparison<T extends { readonly id: string }> {
  readonly type: EntityRef['type']
  /** Matched once by the caller, so a pass that needs the same pairs does not match again. */
  readonly matched: Matched<T>
  /** `side` is the plan the entity comes from. */
  readonly floorOf: (item: T, side: 'base' | 'head') => string
  readonly props: (before: T, after: T) => PropChange[]
  /** Only walls move. */
  readonly motion?: (before: T, after: T) => WallMotion | undefined
}

function compare<T extends { readonly id: string }>(spec: Comparison<T>): PlanChange[] {
  const { matched } = spec
  const changes: PlanChange[] = []

  for (const item of matched.added) {
    changes.push(change({ type: spec.type, id: item.id }, spec.floorOf(item, 'head'), 'added'))
  }
  for (const item of matched.removed) {
    changes.push(change({ type: spec.type, id: item.id }, spec.floorOf(item, 'base'), 'removed'))
  }
  for (const [before, after] of matched.both) {
    const props = spec.props(before, after)
    if (props.length === 0) continue
    changes.push(
      change(
        { type: spec.type, id: after.id },
        spec.floorOf(after, 'head'),
        'modified',
        props,
        spec.motion?.(before, after)
      )
    )
  }
  return changes
}

export function diffPlans(
  earlier: FloorPlan,
  later: FloorPlan,
  options: DiffOptions = {}
): PlanDiff {
  const epsilon = options.epsilon ?? tolerance('diffLength')
  const areaEpsilon = options.areaEpsilon ?? tolerance('areaReported')

  // What is itself invalid on either side is left out and named in the issues.
  const assessments = { base: assess(earlier), head: assess(later) }
  const skip = new Set([...assessments.base.skipped, ...assessments.head.skipped])
  const base = without(earlier, skip)
  const head = without(later, skip)

  const wholeIndexes: Record<'base' | 'head', PlanIndex> = {
    base: indexPlan(earlier),
    head: indexPlan(later)
  }
  const indexes: Record<'base' | 'head', PlanIndex> = {
    base: indexPlan(base),
    head: indexPlan(head)
  }

  // MSG-25: each part's phase as each version reads it, from the whole plans: an opening on a
  // skipped wall still follows that wall.
  const readings = options.phases === false ? null : { base: phaseReading(earlier), head: phaseReading(later) }

  const walls = compare({
    type: 'wall',
    matched: matchById(base.walls, head.walls),
    floorOf: (wall) => floorOf(wall),
    props: (before, after) => [...wallProps(before, after, epsilon), ...phaseProp(before, after, readings && [readings.base.wall, readings.head.wall])],
    motion: (before, after) => wallMotion(before, after, epsilon)
  })
  const roomPairs = matchById(base.rooms, head.rooms)
  const rooms = compare({
    type: 'room',
    matched: roomPairs,
    floorOf: (room) => floorOf(room),
    props: (before, after) => [...roomProps(before, after, epsilon), ...phaseProp(before, after, readings && [readings.base.room, readings.head.room])]
  })
  const wallChanges = new Map(walls.map((c) => [c.entity.id, c] as const))
  const roomChanges = new Map(rooms.map((c) => [c.entity.id, c] as const))

  // Openings are matched and compared once: the derived pass only needs the pairs
  // that have no change of their own.
  const openingPairs = matchById(base.openings, head.openings)
  const openingChanges = new Map(
    openingPairs.both.map(([before, after]) => [after.id, [...openingProps(before, after, epsilon), ...phaseProp(before, after, readings && [readings.base.opening, readings.head.opening])]])
  )
  const unchangedOpenings = openingPairs.both.filter(
    ([, after]) => openingChanges.get(after.id)!.length === 0
  )

  const changes: PlanChange[] = [
    ...walls,
    ...derivedOpenings(unchangedOpenings, indexes.base, indexes.head, wallChanges, epsilon),
    // Floors come from the whole plans: a skipped wall must not make its floor vanish.
    ...compare({
      type: 'floor',
      matched: matchById(planFloors(earlier), planFloors(later)),
      floorOf: (floor) => floor.id,
      props: floorProps
    }),
    ...compare({
      type: 'opening',
      matched: openingPairs,
      // An opening takes the floor of the wall it sits on, even a wall that was skipped.
      floorOf: (opening, side) => {
        const wall = wholeIndexes[side].wallsById.get(opening.wall)
        return wall ? floorOf(wall) : DEFAULT_FLOOR.id
      },
      props: (_before, after) => openingChanges.get(after.id)!
    }),
    ...rooms
  ]

  const summarize = makeSummarizer(earlier, later)
  const areas = roomAreas(
    base,
    head,
    indexes.base,
    indexes.head,
    wallChanges,
    roomChanges,
    areaEpsilon
  )

  // A room resized by its walls has an area change and nothing of its own: give it a change too,
  // or everything that reads `changes` would see it as unchanged.
  const inBoth = new Set(roomPairs.both.map(([, after]) => after.id))
  for (const delta of areas.areas) {
    if (!inBoth.has(delta.roomId) || roomChanges.has(delta.roomId)) continue
    changes.push({
      id: `room:${delta.roomId}:modified`,
      entity: { type: 'room', id: delta.roomId },
      floor: delta.floor,
      kind: 'modified',
      props: [],
      summary: '',
      dependsOn: delta.dependsOn,
      derived: true
    })
  }

  const issues = [
    ...assessmentIssues('base', assessments.base),
    ...assessmentIssues('head', assessments.head),
    ...areas.issues,
    ...(options.detectIdChurn === false
      ? []
      : idChurn(base, head, indexes.base, indexes.head, epsilon))
  ]

  const compareFloors = floorOrder(earlier, later)
  const compareChanges = (a: PlanChange, b: PlanChange): number =>
    compareFloors(a.floor, b.floor) ||
    ENTITY_ORDER[a.entity.type] - ENTITY_ORDER[b.entity.type] ||
    compareText(a.entity.id, b.entity.id)

  return {
    schemaVersion: PLAN_DIFF_SCHEMA_VERSION,
    epsilon,
    areaEpsilon,
    changes: changes.sort(compareChanges).map((c) => ({ ...c, summary: summarize(c) })),
    areas: areas.areas.sort(
      (a, b) => compareFloors(a.floor, b.floor) || compareText(a.roomId, b.roomId)
    ),
    issues: issues.sort(compareIssues)
  }
}
