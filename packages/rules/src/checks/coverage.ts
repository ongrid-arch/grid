/**
 * What each check looked at (MSG-2, lab CH-1, CH-4, W-8): for every check, the floors, rooms or
 * doors it looked at, and the ones it skipped with the reason, floor by floor. So a report with no
 * findings says what it is: these parts were looked at and nothing was found in them, and these
 * were not looked at, for this reason.
 *
 * The figure checks give their own (`sizeCheck`, `escapeCheck`). The core's plan checks are read
 * here from the plan and from the core's own notices, so they follow the core as it changes: a
 * floor the core says it could not follow to the ground (`no_stairs`) is a floor its route checks
 * did not look at, whatever the reason the core has for it.
 *
 * Pure: a plan in, plain data out.
 */

import { indexPlan, planFloors, planForFloor, plotBoundary, roomZones, statedGround, type FloorPlan, type RulesReport as PlanRulesReport } from '@ongrid/floorplan/geometry'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { english, said, withSentence, type Said } from '@ongrid/floorplan/messages'
import type { BuildingType } from '@ongrid/floorplan/types/floorplan'
import { buildingKindsSaid, buildingTypeSaid, type BuildingKind } from './figures'
import type { CheckCoverage, CoverageGroup, CoverageSkip, Rule, RuleFinding, SkipReason } from './types'

/** What one check looked at and skipped on one floor, by id. */
export interface FloorScope {
  readonly lookedAt: string[]
  readonly skipped: Partial<Record<SkipReason, string[]>>
  /** CNT-5: on a floor skipped as `not_for_building`, the kind the plan says it is. */
  readonly building?: BuildingType
}

/** The order skips are listed in: what could not be looked at first, then what the check is not about. */
const SKIP_ORDER: readonly SkipReason[] = [
  'no_place',
  'not_for_building',
  'no_figures_for_place',
  'no_rooms',
  'cannot_be_drawn',
  'waits_for_part',
  'no_stairs',
  'way_out_not_drawn',
  'way_out_through_common_parts',
  'alone_off_ground',
  'above_escape_storeys',
  'no_ground_level',
  'no_building_outline',
  'boundary_not_closed',
  'no_use',
  'use_not_covered',
  'part_of_room'
]

/** What each check looks at. A check Grid has must be here: a test fails when one is missing. */
export const LOOKS_AT: Readonly<Record<string, CheckCoverage['looksAt']>> = {
  'floor-has-exit': 'floor',
  'room-has-door': 'room',
  'room-reaches-exit': 'room',
  'door-leads-somewhere': 'door',
  'stairs-line-up': 'room',
  'openings-above-ground': 'door',
  // BRF-3: the edges of the plot's boundary, by number.
  'site-boundary': 'edge',
  'habitable-room-area': 'room',
  'escape-opening': 'room'
}

/**
 * Why a part was skipped, in plain words: one wording per reason, and per check where it differs.
 * CNT-5: `not_for_building` names the kinds the check's figures were read for (`readFor`) and the
 * kind the plan says the building is.
 */
export function skipWhySaid(reason: SkipReason, ruleId: string, building?: { readonly readFor: readonly BuildingKind[]; readonly is: BuildingType | undefined }): Said {
  if (reason === 'not_for_building') return said('check.skip.not_for_building', { kinds: buildingKindsSaid(building?.readFor ?? []), building: buildingTypeSaid(building?.is) })
  if (reason === 'use_not_covered') return said(ruleId === 'escape-opening' ? 'check.skip.use_not_covered.escape' : ruleId === 'stairs-line-up' ? 'check.skip.use_not_covered.stairs' : 'check.skip.use_not_covered')
  return said(`check.skip.${reason}`)
}

export function skipWhy(reason: SkipReason, ruleId: string, building?: { readonly readFor: readonly BuildingKind[]; readonly is: BuildingType | undefined }): string {
  return english(skipWhySaid(reason, ruleId, building))
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Ids by text, so the coverage is the same whatever order the plan lists its parts in. */
const sorted = (ids: readonly string[]): string[] => [...ids].sort(byText)

/** One check's coverage from its scopes, floor by floor, in floor order; ids by text. */
export function coverageOf(rule: Rule, scopes: readonly (readonly [string, FloorScope])[], findings: number, readFor: readonly BuildingKind[] = []): CheckCoverage {
  const lookedAt: CoverageGroup[] = scopes
    .filter(([, scope]) => scope.lookedAt.length > 0)
    .map(([floor, scope]) => ({ floor, ids: sorted(scope.lookedAt) }))
  const skipped: CoverageSkip[] = []
  for (const [floor, scope] of scopes) {
    for (const reason of SKIP_ORDER) {
      const ids = scope.skipped[reason] ?? []
      if (ids.length > 0) {
        const why = skipWhySaid(reason, rule.id, { readFor, is: scope.building })
        // MSG-11: the reason by key and values too, not enumerable, to say it in any language.
        skipped.push(withSentence({ floor, ids: sorted(ids), reason, why: english(why) }, why))
      }
    }
  }
  const count = (groups: readonly CoverageGroup[]): number => groups.reduce((sum, group) => sum + group.ids.length, 0)
  return {
    ruleId: rule.id,
    title: rule.title,
    looksAt: LOOKS_AT[rule.id] ?? 'room',
    lookedAt,
    lookedAtCount: count(lookedAt),
    skipped,
    skippedCount: count(skipped),
    findings
  }
}

/** Every room of a floor skipped for one reason: how a check that did not run is told. */
export function allSkipped(storey: FloorPlan, reason: SkipReason, building?: BuildingType): FloorScope {
  return { lookedAt: [], skipped: { [reason]: storey.rooms.map((room) => room.id) }, ...(building === undefined ? {} : { building }) }
}

/**
 * The scopes of the core's plan checks, by rule id, then floor by floor. Read from the plan and
 * the core's notices: `no_stairs` and `way_out_not_drawn` say which floors the route checks
 * could not follow, and a room or door the drawing check leaves out is skipped by every check.
 */
export function planCheckScopes(
  plan: FloorPlan,
  base: PlanRulesReport,
  /** Each floor as `drawable` reads it, when the caller has it already. */
  read: ReadonlyMap<string, ReturnType<typeof drawable>> = new Map()
): Map<string, [string, FloorScope][]> {
  const noStairs = new Set(base.notChecked.filter((n) => n.reason === 'no_stairs').map((n) => n.floor))
  const wayOutNotDrawn = new Set(base.notChecked.filter((n) => n.reason === 'way_out_not_drawn').map((n) => n.floor))
  // LVL-14: a floor above the ground with no stair at all was looked at by the way-out check: that is its finding.
  const noStair = new Set(base.findings.filter((f) => f.code === 'no_stair').map((f) => f.floor))
  // CNT-6: the way out goes on through common parts the plan does not draw.
  const throughCommon = new Set(base.notChecked.filter((n) => n.reason === 'way_out_through_common_parts').map((n) => n.floor))
  const scopes = new Map<string, [string, FloorScope][]>(base.rules.map((rule) => [rule.id, []]))
  const ground = statedGround(plan) !== null
  const add = (rule: string, floor: string, scope: FloorScope): void => {
    scopes.get(rule)?.push([floor, scope])
  }
  // BRF-3: every edge of the plot's boundary, by number, for the whole plan, when the site states one.
  const plot = plotBoundary(plan)
  if (plot !== null) {
    const edges = plot.edges.map((edge) => String(edge.edge))
    const outline = base.notChecked.some((n) => n.reason === 'boundary_not_measured')
    add('site-boundary', '', plot.problem !== null ? { lookedAt: [], skipped: { boundary_not_closed: edges } } : outline ? { lookedAt: [], skipped: { no_building_outline: edges } } : { lookedAt: edges, skipped: {} })
  }
  for (const floor of planFloors(plan)) {
    const slice = planForFloor(plan, floor.id)
    const { storey, leftOut } = read.get(floor.id) ?? drawable(slice)
    const index = indexPlan(storey)
    const outlines = roomOutlines(storey, index, leftOut.rooms)
    const drawn = storey.rooms.filter((room) => outlines.has(room.id)).map((room) => room.id)
    const cannot = storey.rooms.filter((room) => !outlines.has(room.id)).map((room) => room.id)
    // CNT-8: a zone is reached as its room is; the route checks look at the room.
    const zoneOf = roomZones(index).zoneOf
    const places = drawn.filter((id) => !zoneOf.has(id))
    const zones = drawn.filter((id) => zoneOf.has(id))
    const asPart = zones.length > 0 ? { part_of_room: zones } : {}
    const followed = drawn.length > 0 && !noStairs.has(floor.id)

    // The floor's way out: looked at when its routes ran and its door out is drawn.
    const floorReason: SkipReason | null =
      drawn.length === 0 ? 'no_rooms' : noStair.has(floor.id) ? null : !followed ? 'no_stairs' : wayOutNotDrawn.has(floor.id) ? 'way_out_not_drawn' : throughCommon.has(floor.id) ? 'way_out_through_common_parts' : null
    add('floor-has-exit', floor.id, floorReason === null ? { lookedAt: [floor.id], skipped: {} } : { lookedAt: [], skipped: { [floorReason]: [floor.id] } })

    // A door on every room: on every floor, but not the one room of a floor the plan cannot reach.
    const alone = !followed && places.length === 1
    add('room-has-door', floor.id, {
      lookedAt: alone ? [] : places,
      skipped: { cannot_be_drawn: cannot, ...(alone ? { alone_off_ground: places } : {}), ...asPart }
    })

    // A route to the way out: only on a floor whose routes ran.
    add('room-reaches-exit', floor.id, {
      lookedAt: followed ? places : [],
      skipped: { cannot_be_drawn: cannot, ...(followed ? {} : { no_stairs: places }), ...asPart }
    })

    // Stairs and lift shafts line up (LVL-3): the rooms used as a stair or a lift, on every floor.
    const used = new Map(storey.rooms.map((room) => [room.id, room.use] as const))
    const shafts = drawn.filter((id) => used.get(id) === 'stair' || used.get(id) === 'lift')
    add('stairs-line-up', floor.id, {
      lookedAt: shafts,
      skipped: { cannot_be_drawn: cannot, use_not_covered: drawn.filter((id) => !shafts.includes(id)) }
    })

    // No door or window below the ground (LVL-4): every door, window and opening that can be
    // drawn, when the site states its ground level; with none stated each is skipped for want of it.
    const sound = slice.openings.filter((o) => !leftOut.openings.has(o.id)).map((o) => o.id)
    add('openings-above-ground', floor.id, {
      lookedAt: ground ? sound : [],
      skipped: { cannot_be_drawn: slice.openings.filter((o) => leftOut.openings.has(o.id)).map((o) => o.id), ...(ground ? {} : { no_ground_level: sound }) }
    })

    // Every door leads somewhere: every door and opening that can be drawn, on every floor with
    // rooms. With no room on either side, a door is not read at all.
    const doors = slice.openings.filter((o) => o.type !== 'window')
    const drawnDoors = doors.filter((o) => !leftOut.openings.has(o.id)).map((o) => o.id)
    add('door-leads-somewhere', floor.id, {
      lookedAt: drawn.length > 0 ? drawnDoors : [],
      skipped: {
        cannot_be_drawn: doors.filter((o) => leftOut.openings.has(o.id)).map((o) => o.id),
        ...(drawn.length > 0 ? {} : { no_rooms: drawnDoors })
      }
    })
  }
  return scopes
}

/**
 * MSG-5: the parts whose finding was held back, moved from `lookedAt` to `skipped`
 * (`waits_for_part`): a check that cannot say either way has not looked at them. A finding is
 * about a floor (`floor-has-exit`), a door (`door-leads-somewhere`) or its first room.
 */
export function heldCoverage(coverage: readonly CheckCoverage[], held: readonly RuleFinding[]): CheckCoverage[] {
  const count = (groups: readonly CoverageGroup[]): number => groups.reduce((sum, group) => sum + group.ids.length, 0)
  return coverage.map((check) => {
    const mine = held.filter((finding) => finding.ruleId === check.ruleId)
    if (mine.length === 0) return check
    const part = (finding: RuleFinding): string | undefined =>
      check.looksAt === 'floor' ? finding.floor : check.looksAt === 'door' ? finding.openings[0] : check.looksAt === 'edge' ? String(finding.boundary?.edge ?? '') : finding.rooms[0]
    const moved = new Map<string, Set<string>>()
    for (const finding of mine) {
      const id = part(finding)
      if (id === undefined) continue
      if (!check.lookedAt.some((group) => group.floor === finding.floor && group.ids.includes(id))) continue
      moved.set(finding.floor, (moved.get(finding.floor) ?? new Set()).add(id))
    }
    if (moved.size === 0) return check
    const lookedAt = check.lookedAt
      .map((group) => ({ floor: group.floor, ids: group.ids.filter((id) => !moved.get(group.floor)?.has(id)) }))
      .filter((group) => group.ids.length > 0)
    const skipped: CoverageSkip[] = [...check.skipped]
    const why = skipWhySaid('waits_for_part', check.ruleId)
    for (const [floor, ids] of moved) skipped.push(withSentence({ floor, ids: sorted([...ids]), reason: 'waits_for_part' as const, why: english(why) }, why))
    // In floor order as `coverageOf` gives them, then by reason.
    const floorOrder = new Map<string, number>()
    for (const group of [...check.lookedAt, ...check.skipped]) if (!floorOrder.has(group.floor)) floorOrder.set(group.floor, floorOrder.size)
    skipped.sort((a, b) => (floorOrder.get(a.floor) ?? 0) - (floorOrder.get(b.floor) ?? 0) || SKIP_ORDER.indexOf(a.reason) - SKIP_ORDER.indexOf(b.reason))
    return { ...check, lookedAt, lookedAtCount: count(lookedAt), skipped, skippedCount: count(skipped) }
  })
}

/** The coverage of one floor's parts, and the plan's, counted again: what `--floor` shows. */
export function coverageOnFloor(coverage: readonly CheckCoverage[], floor: string): CheckCoverage[] {
  const count = (groups: readonly CoverageGroup[]): number => groups.reduce((sum, group) => sum + group.ids.length, 0)
  return coverage.map((check) => {
    const lookedAt = check.lookedAt.filter((group) => group.floor === floor || group.floor === '')
    const skipped = check.skipped.filter((group) => group.floor === floor || group.floor === '')
    return { ...check, lookedAt, lookedAtCount: count(lookedAt), skipped, skippedCount: count(skipped) }
  })
}

/**
 * How many of the plan's rooms at least one check looked at, and the rooms no check looked at,
 * each as `{ floor, id }`: the count a report prints beside the count of lines (W-8).
 */
export function roomsLookedAt(
  plan: FloorPlan,
  coverage: readonly CheckCoverage[],
  floor?: string
): { rooms: number; lookedAt: number; byNone: { floor: string; id: string }[] } {
  const key = (floorId: string, id: string): string => `${floorId}\u0000${id}`
  const seen = new Set(
    coverage.filter((check) => check.looksAt === 'room').flatMap((check) => check.lookedAt.flatMap((group) => group.ids.map((id) => key(group.floor, id))))
  )
  // CNT-8: a zone is looked at when its room is.
  const zoneOf = roomZones(indexPlan(plan)).zoneOf
  const rooms = planFloors(plan)
    .filter((f) => floor === undefined || f.id === floor)
    .flatMap((f) => planForFloor(plan, f.id).rooms.map((room) => ({ floor: f.id, id: room.id })))
  const byNone = rooms.filter((room) => !seen.has(key(room.floor, room.id)) && !seen.has(key(room.floor, zoneOf.get(room.id) ?? '')))
  return { rooms: rooms.length, lookedAt: rooms.length - byNone.length, byNone }
}
