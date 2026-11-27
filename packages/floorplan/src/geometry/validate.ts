/**
 * Geometric validation.
 *
 * Mind the split: STRUCTURAL validation — is this valid JSON, are the fields
 * there, are they numbers — is handled by the Zod schema before the plan ever
 * reaches here. This is a different thing: a plan can be structurally perfect
 * and geometrically impossible. A 90 cm door on a 50 cm wall, a window that
 * pokes through the ceiling, two overlapping openings.
 *
 * Getting the AI to produce valid plans consistently is the project's number
 * one risk, so this is not an edge case — it is the normal case. That is why
 * problems come back as a list instead of throwing: what cannot be drawn is
 * skipped and reported, and the rest of the plan still gets drawn.
 */

import type { Said, Value } from '../messages/say'
import { english, joined, name, num, said } from '../messages/say'
import { groupedNum, namesSaid, pointSaid, withSaid } from './issueWords'
import { boundariesEdited } from '../rooms/stamp'
import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { indexPlan, openingsOf, roomWallIds } from './plan'
import { keptFor } from './kept'
import { floorOf, isFloorSlice, planFloors } from './floors'
import { statedOpening, throughIssues, wallRise, wallStandsOn } from './through'
import { stackingIssues } from './stacking'
import { area } from './vec2'
import { openingSpan, wallLength } from './wall'
import { curveFault } from './arc'
import { RoomOutlineError, roomNesting, roomPolygon } from './room'
import type { FloorPiece, FloorSpaces, RoomMismatch } from './spaces'
import { planSpaces, spacesKnown } from './spaces'
import type { RoomOverlap } from './overlaps'
import { MAX_CUTS, roomOverlaps } from './overlaps'
import type { ToleranceChanges } from './tolerances'
import { tolerance, withTolerances } from './tolerances'
import { fixedText, metresText } from './rounding'
import { likelyId } from '../types/nearest'
import { validatePlausibility } from './plausible'
import { wallFaults } from './wallFaults'
import { kindDisagreements, planWallSides } from './exposure'
import { inOpenSky } from './openSky'
import { levelIssues, unknownFloorIssues } from './levels'
import { buildingKind } from './plausible'
import { planStairs } from './stairs'
import { itemIssues } from './items'
import { pointInPolygon } from './innerPoint'
import type { LeftOutPart } from '../types/readParts'
import { itemUseIssues } from './use'
import { openingPlaceIssues } from './openingPlaces'
import { kindFits, statedKind } from './openingKinds'
import { DOOR_KINDS, WINDOW_KINDS } from '../types/floorplan'
import { expandPatterns } from './patterns'
import type { PlanState } from './phases'
import { idsInPhase, phaseClashes, planHasPhases, planInState } from './phases'
import { dormerPlace, floorRoofShape, risesToRoof, roofOverWall, rooflightPlace, topBetween, wallPeak, wallTopProfile } from './roofs'
import { roomZones } from './zones'
import { plotBoundary, ringFault } from './plot'
import { flatIssues } from './flats'
import { buildingIssues } from './buildings'
import { typeIssues } from './partTypes'
import { columnIssues } from './columns'
import { columnClashIssues } from './columnClash'
import { parkingIssues } from './parking'
import { gridIssues } from './structuralGrid'

/**
 * `floor` issues are about a floor as a whole; their id is the floor's id. `item` is a fixture
 * (CNT-12); `stair` (LVL-3), a stated stair; `pattern` (LVL-8), an opening pattern; `flat`
 * (CNT-4), a flat of the plan's `flats`.
 */
export type EntityKind = 'wall' | 'room' | 'opening' | 'plan' | 'floor' | 'item' | 'stair' | 'pattern' | 'flat'

/**
 * `error` is something that cannot be drawn, or sits on a floor the plan does not know, and gets
 * skipped. `warning` still gets drawn, but is worth a look.
 */
export type Severity = 'error' | 'warning'

export interface Issue {
  /** Stable identifier for the kind of problem, so they can be filtered. */
  readonly code: string
  readonly entity: EntityKind
  readonly id: string
  /** The sentence in English, made from `said`. */
  readonly message: string
  /**
   * MSG-11: the sentence by its key and values (`messages/en.ts`, `issue.<code>`), so it can be
   * said in any language and its figures read as data. Not enumerable (`withSaid`): the record
   * compares and prints as it did before it had one.
   */
  readonly said: Said
  readonly severity: Severity
  /**
   * MSG-7: each change to one part that would clear this problem, as data, when there is one. The
   * tool server turns each into the call that makes it.
   */
  readonly fixes?: readonly PlanFix[]
  /**
   * MSG-5: the id of the issue this one follows from, set where it is raised: the wall a door
   * hangs off or a room rests on, the room a piece of unclaimed floor most likely belongs to (and
   * a fixture said to stand in no room, whose middle is on that floor), or
   * `plan` (the id of the plan's own issues) for a plan with no walls. The cause may be a part the
   * reader left out (`leftOutWalls`, `leftOutParts`), whose line is the reader's. Fixing the cause
   * clears this issue too.
   */
  readonly causedBy?: string
}

/**
 * MSG-7: one change to an opening that clears a problem with it. `width` keeps the end nearer
 * the wall's start where it is; `offset` moves it, keeping its width; `wall` is the id most
 * likely meant. Lengths in metres, rounded
 * down to the tenth of a millimetre, so the change stays inside what fits.
 */
export interface PlanFix {
  readonly part: 'opening'
  readonly id: string
  readonly width?: number
  readonly offset?: number
  readonly height?: number
  readonly sill?: number
  /** The wall most likely meant, for an opening on a wall the plan does not have. */
  readonly wall?: string
}

/** A length rounded down to the tenth of a millimetre, for a fix that must stay inside a limit. */
const down = (metres: number): number => Math.floor(Math.round(metres * 10_000_000) / 1000) / 10_000

export interface ValidationResult {
  readonly issues: readonly Issue[]
  /** Ids of entities that cannot be drawn and must be skipped. */
  readonly broken: ReadonlySet<string>
}

function issue(
  entity: EntityKind,
  id: string,
  code: string,
  sentence: Said,
  severity: Severity = 'error',
  fixes: readonly PlanFix[] = []
): Issue {
  const message = english(sentence)
  return withSaid(fixes.length > 0 ? { entity, id, code, message, severity, fixes } : { entity, id, code, message, severity }, sentence)
}

/** MSG-5: an issue that follows from another, by that one's id. MSG-11: it keeps its sentence. */
const followOn = (found: Issue, cause: string | null): Issue => (cause === null ? found : withSaid({ ...found, causedBy: cause }, found.said))

/**
 * How far from the origin the farthest point of the plan sits.
 *
 * C4 · the origin is the point the 3D rises from, same as SketchUp's: the plan
 * lives on XY and z=0 is floor level. A plan that shows up hundreds of meters
 * away (`farFromOrigin`) is still drawable, but it almost always means the agent
 * lost the scale.
 *
 * HND-11 (lab MS-12): a plan kept at survey or map coordinates states a point near the building
 * as `site.origin`, and is measured from that point: its exports write the geometry from it.
 */
function validateOrigin(plan: FloorPlan, issues: Issue[]): void {
  const stated = plan.site?.origin
  const origin = stated !== undefined && stated.every((v) => Number.isFinite(v) && Math.abs(v) <= tolerance('largest')) ? stated : null
  const [ox, oy] = origin ?? [0, 0]
  let farthest = 0
  for (const wall of plan.walls) {
    for (const [x, y] of [wall.start, wall.end]) {
      // A number past `largest` is refused on its own wall (`validateWall`).
      if (Math.hypot(x, y) > tolerance('largest')) continue
      const distance = Math.hypot(x - ox, y - oy)
      if (distance > farthest) farthest = distance
    }
  }

  if (farthest > tolerance('farFromOrigin')) {
    const from = origin === null ? said('issue.part.origin') : said('issue.part.origin.site', { point: pointSaid(fixedText(ox, 2), fixedText(oy, 2)) })
    issues.push(
      issue(
        'plan',
        'plan',
        'plan/far-from-origin',
        said('issue.plan/far-from-origin', { distance: num(fixedText(farthest, 0)), from }),
        'warning'
      )
    )
  }
}

/**
 * BRF-3: a plot boundary that crosses itself, or encloses no ground, measures nothing: no distance
 * to it and no plot coverage. Drawn as it is written, and worth a look.
 */
function validateBoundary(plan: FloorPlan, issues: Issue[]): void {
  if (isFloorSlice(plan)) return
  const boundary = plotBoundary(plan)
  if (boundary === null || boundary.problem === null) return
  issues.push(
    issue(
      'plan',
      'plan',
      'plan/boundary-crosses',
      said('issue.plan/boundary-crosses', { problem: ringFault(boundary.points) ?? boundary.problem }),
      'warning'
    )
  )
}

/**
 * A length as stated, to as many decimals as it takes (at least two, at most six), so that two
 * lengths that differ are never printed alike: 4.8996, not 4.90.
 */
export function exactMetres(value: number): string {
  const fixed = value.toFixed(6).replace(/0+$/, '')
  const [whole, decimals = ''] = fixed.split('.')
  return `${whole}.${decimals.padEnd(2, '0')}`
}

/**
 * LVL-6 (lab VE-5): an opening names a wall, and a window in the roof is no opening in a wall. Said
 * (`issue.opening/missing-wall.roof`) when an opening names the roof, a room or a floor for its
 * wall, as the lab's agents tried.
 */
function inTheRoof(plan: FloorPlan, id: string): boolean {
  return /roof|sky|dormer/i.test(id) || plan.rooms.some((r) => r.id === id) || (plan.floors ?? []).some((f) => f.id === id)
}

/** Whether a number is one Grid accepts: finite, and no larger than `largest`. */
const held = (value: number): boolean => Math.abs(value) <= tolerance('largest')

const kilometres = (metres: number): Value => groupedNum((metres / 1000).toLocaleString('en'))

/** The number of a part, as a line names it. */
type NumberPart = 'startCoordinate' | 'endCoordinate' | 'centreCoordinate' | 'sweep' | 'thickness' | 'height' | 'offset' | 'width' | 'sill'

function tooLarge(what: NumberPart, value: number): Said {
  const part = said(`issue.part.number.${what}`)
  return Number.isFinite(value)
    ? said('issue.part.tooLarge.past', { what: part, value, largest: kilometres(tolerance('largest')) })
    : said('issue.part.tooLarge.infinite', { what: part })
}

/** The line for a part refused for a number past `largest`. */
const refusedNumber = (key: 'issue.wall/too-large' | 'issue.opening/too-large', id: string, what: NumberPart, value: number): Said =>
  said(key, { id: name(id), why: tooLarge(what, value), advice: said('issue.part.tooLarge') })

/**
 * Coordinates and sizes past `largest`, and numbers that are not finite (a plan built in code
 * skips the schema, which refuses those). The part is refused: past that size the arithmetic
 * loses the precision the checks need, and a sum of two such numbers can stop being a number.
 */
function validateWallNumbers(wall: Wall, issues: Issue[]): boolean {
  const named: [NumberPart, number][] = [
    ['startCoordinate', wall.start[0]],
    ['startCoordinate', wall.start[1]],
    ['endCoordinate', wall.end[0]],
    ['endCoordinate', wall.end[1]],
    ['thickness', wall.thickness],
    ['height', wall.height],
    // CNT-18: a curved wall's centre is a point of the plan too.
    ...(wall.arc === undefined ? [] : ([
      ['centreCoordinate', wall.arc.centre[0]],
      ['centreCoordinate', wall.arc.centre[1]],
      ['sweep', wall.arc.sweep]
    ] as [NumberPart, number][]))
  ]
  const bad = named.find(([, value]) => !held(value))
  if (bad === undefined) return true
  issues.push(issue('wall', wall.id, 'wall/too-large', refusedNumber('issue.wall/too-large', wall.id, bad[0], bad[1])))
  return false
}

function validateOpeningNumbers(opening: Opening, issues: Issue[]): boolean {
  const named: [NumberPart, number][] = [
    ['offset', opening.offset],
    ['width', opening.width],
    ['height', opening.height],
    ['sill', opening.sill]
  ]
  const bad = named.find(([, value]) => !held(value))
  if (bad === undefined) return true
  issues.push(issue('opening', opening.id, 'opening/too-large', refusedNumber('issue.opening/too-large', opening.id, bad[0], bad[1])))
  return false
}

function validateWall(wall: Wall, issues: Issue[]): boolean {
  if (!validateWallNumbers(wall, issues)) return false

  const [sx, sy] = wall.start
  const [ex, ey] = wall.end

  // CNT-18: a whole circle starts and ends at one point; a curve that cannot be built says why.
  const curved = curveFault(wall)
  if (curved !== null) {
    issues.push(issue('wall', wall.id, curved.code, curved.said))
    return false
  }

  if (sx === ex && sy === ey && wall.arc === undefined) {
    issues.push(
      issue('wall', wall.id, 'wall/zero-length', said('issue.wall/zero-length', { wall: name(wall.id), at: pointSaid(exactMetres(sx), exactMetres(sy)) }))
    )
    return false
  }

  if (wall.virtual) return true

  let ok = true
  if (wall.thickness <= 0) {
    issues.push(
      issue(
        'wall',
        wall.id,
        'wall/no-thickness',
        said('issue.wall/no-thickness', { wall: name(wall.id), thickness: wall.thickness })
      )
    )
    ok = false
  }
  if (wall.height <= 0) {
    issues.push(
      issue(
        'wall',
        wall.id,
        'wall/no-height',
        said('issue.wall/no-height', { wall: name(wall.id), height: wall.height })
      )
    )
    ok = false
  }
  return ok
}

/** C2: an opening's offset and width are along its wall's axis, curved or not (CNT-18). */
const lengthOf = (wall: Wall): number => wallLength(wall)

function validateOpening(
  opening: Opening,
  index: PlanIndex,
  brokenWalls: ReadonlySet<string>,
  issues: Issue[],
  leftOut: ReadonlySet<string> = new Set(),
  /** MSG-5: the plan has no walls, so an opening on one that is not in the plan follows from that. */
  noWalls = false
): boolean {
  // If the wall is already broken there is nothing to measure against, and its
  // geometry cannot be built either.
  if (brokenWalls.has(opening.wall)) {
    const key = leftOut.has(opening.wall) ? 'issue.opening/broken-wall.leftOut' : 'issue.opening/broken-wall'
    issues.push(followOn(issue('opening', opening.id, 'opening/broken-wall', said(key, { opening: name(opening.id), wall: name(opening.wall) })), opening.wall))
    return false
  }

  const wall = index.wallsById.get(opening.wall)
  if (!wall) {
    // MSG-7: the wall most likely meant, from the one nearest-id helper.
    const meant = likelyId(opening.wall, [...index.wallsById.keys()])
    issues.push(
      followOn(
        issue(
          'opening',
          opening.id,
          'opening/missing-wall',
          meant === null
            ? inTheRoof(index.plan, opening.wall)
              ? said('issue.opening/missing-wall.roof', { opening: name(opening.id), wall: name(opening.wall) })
              : said('issue.opening/missing-wall', { opening: name(opening.id), wall: name(opening.wall) })
            : said('issue.opening/missing-wall.meant', { opening: name(opening.id), wall: name(opening.wall), meant: name(meant) }),
          'error',
          meant === null ? [] : [{ part: 'opening', id: opening.id, wall: meant }]
        ),
        noWalls ? 'plan' : null
      )
    )
    return false
  }

  if (!validateOpeningNumbers(opening, issues)) return false

  let ok = true

  if (opening.width <= 0 || opening.height <= 0) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/degenerate',
        said('issue.opening/degenerate', { opening: name(opening.id), width: opening.width, height: opening.height })
      )
    )
    return false
  }

  const span = openingSpan(opening)
  const wallLength = lengthOf(wall)
  // MS-16: a wall whose ends were rounded to the millimetre is a hair shorter than meant, so an
  // opening may run `openingOverrun` past it and still fit.
  const overrun = tolerance('openingOverrun')
  const before = -span.from
  const after = span.to - wallLength

  if (before > overrun || after > overrun) {
    const past = after >= before ? said('issue.opening/out-of-wall.pastEnd', { by: millimetres(after) }) : said('issue.opening/out-of-wall.beforeStart', { by: millimetres(before) })
    const fits = wallLength - opening.width
    // MSG-7 (lab MS-13): what would be right, not only what is wrong. Keeping its width, the
    // offsets that fit; keeping its offset, the widest that fits there.
    const room = wallLength - opening.offset
    const fixes: PlanFix[] = []
    if (fits >= 0) fixes.push({ part: 'opening', id: opening.id, offset: down(fits) })
    if (room > 0 && opening.offset >= 0) fixes.push({ part: 'opening', id: opening.id, width: down(room) })
    const keepWidth =
      fits >= 0 ? said('issue.opening/out-of-wall.offsets', { to: num(exactMetres(fits)) }) : said('issue.opening/out-of-wall.wider', { by: millimetres(-fits) })
    const keepOffset =
      room > 0 && opening.offset >= 0 ? said('issue.opening/out-of-wall.widths', { offset: num(exactMetres(opening.offset)), width: num(exactMetres(room)) }) : ''
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/out-of-wall',
        said('issue.opening/out-of-wall', {
          opening: name(opening.id),
          from: num(exactMetres(span.from)),
          to: num(exactMetres(span.to)),
          wall: name(wall.id),
          length: num(exactMetres(wallLength)),
          past,
          overrun: millimetres(overrun),
          keepWidth,
          keepOffset
        }),
        'error',
        fixes
      )
    )
    ok = false
  }

  // A dividing line stands no height (0 unless it says otherwise), so a gap in it cannot be
  // too tall for it.
  const head = opening.sill + opening.height
  // LVL-5 (C19): in a wall through floors an opening may reach as high as the wall rises, from its
  // own floor's level. The roof over its top floor is checked on that floor's slice.
  const through = wall.through !== undefined && wall.through !== floorOf(wall)
  // LVL-20: a wall that rises to the roof over it is as high as it rises.
  const rise = through ? wallRise(index.plan, wall) : wall.virtual ? wall.height : wallPeak(index.plan, wall)
  if (!wall.virtual && head > rise + overrun) {
    // MSG-7: the tallest it can be at its sill, when it can be any height at all there.
    const tallest = rise - Math.max(opening.sill, 0)
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/too-tall',
        tallest > 0
          ? said('issue.opening/too-tall.fits', {
              opening: name(opening.id),
              head: num(exactMetres(head)),
              height: num(exactMetres(rise)),
              sill: num(exactMetres(opening.sill)),
              tallest: num(exactMetres(tallest))
            })
          : said('issue.opening/too-tall', { opening: name(opening.id), head: num(exactMetres(head)), height: num(exactMetres(rise)) }),
        'error',
        tallest > 0 ? [{ part: 'opening', id: opening.id, height: down(tallest) }] : []
      )
    )
    ok = false
  } else if (!wall.virtual && !through) {
    // LVL-6: a wall the floor's roof cuts is no higher than the roof over its line.
    const profile = wallTopProfile(index.plan, wall)
    const under = profile === null ? null : topBetween(profile, Math.max(0, span.from), Math.min(wallLength, span.to))
    if (under !== null && head > under.low + overrun) {
      const tallest = under.low - Math.max(opening.sill, 0)
      const floor = (index.plan.floors ?? []).find((f) => f.id === floorOf(wall))
      const range =
        under.high - under.low > tolerance('joint')
          ? said('issue.opening/above-roof.range', { low: num(metresText(under.low)), high: num(metresText(under.high)) })
          : said('issue.opening/above-roof.at', { low: num(metresText(under.low)) })
      const wholly = opening.sill >= under.high - overrun
      issues.push(
        issue(
          'opening',
          opening.id,
          'opening/above-roof',
          said('issue.opening/above-roof', {
            opening: name(opening.id),
            head: num(exactMetres(head)),
            wall: name(wall.id),
            floor: name(floor?.name || floorOf(wall)),
            range,
            where: said(wholly ? 'issue.opening/above-roof.wholly' : 'issue.opening/above-roof.top'),
            fits: tallest > 0 ? said('issue.opening/above-roof.fits', { sill: num(exactMetres(opening.sill)), tallest: num(exactMetres(tallest)) }) : ''
          }),
          'error',
          tallest > 0 ? [{ part: 'opening', id: opening.id, height: down(tallest) }] : []
        )
      )
      ok = false
    }
  }

  validateOpeningKind(opening, issues)

  if (opening.sill < -overrun) {
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/negative-sill',
        said('issue.opening/negative-sill', { opening: name(opening.id), below: num(exactMetres(-opening.sill)) }),
        'error',
        [{ part: 'opening', id: opening.id, sill: 0 }]
      )
    )
    ok = false
  }

  return ok
}

/**
 * CNT-14: a kind its type does not take (a window that is a garage door, a doorless opening with a
 * kind), and a part that opens larger than the opening or in a window that is fixed. Each is worth
 * a look and draws on: the kind is read as not stated, the part as no larger than the opening.
 */
function validateOpeningKind(opening: Opening, issues: Issue[]): void {
  const word = said(`issue.part.kindOf.${opening.type}`)
  if (opening.kind !== undefined && !kindFits(opening.type, opening.kind)) {
    const takes = opening.type === 'door' ? joined(DOOR_KINDS, 'join.comma') : opening.type === 'window' ? joined(WINDOW_KINDS, 'join.comma') : said('issue.part.kindOf.none')
    issues.push(
      issue(
        'opening',
        opening.id,
        'opening/kind-not-for-type',
        said('issue.opening/kind-not-for-type', { opening: name(opening.id), word, kind: name(opening.kind), takes }),
        'warning'
      )
    )
  }
  const part = opening.opens
  if (part === undefined) return
  const overrun = tolerance('openingOverrun')
  const kind = statedKind(opening.type, opening.kind)
  // LVL-5 (C19): a floor's slice holds only its stretch of an opening in a wall through floors;
  // the part that opens is measured against the whole opening, as the plan states it.
  const whole = statedOpening(opening)
  const problem: Said | null =
    opening.type === 'opening'
      ? said('issue.opening/part-too-large.doorless')
      : kind === 'fixed'
        ? said('issue.opening/part-too-large.fixed')
        : part.width > whole.width + overrun
          ? said('issue.opening/part-too-large.wider', { width: num(exactMetres(part.width)), whole: num(exactMetres(whole.width)) })
          : part.height !== undefined && part.height > whole.height + overrun
            ? said('issue.opening/part-too-large.higher', { height: num(exactMetres(part.height)), whole: num(exactMetres(whole.height)) })
            : null
  if (problem === null) return
  issues.push(issue('opening', opening.id, 'opening/part-too-large', said('issue.opening/part-too-large', { opening: name(opening.id), problem }), 'warning'))
}

/**
 * Two openings cannot share a stretch of wall: drawing both cuts two holes in one place.
 * Spans are sorted by offset; the one nearer `wall.start` is kept, and any later opening
 * that starts before the farthest kept end is reported and skipped. Comparing against the
 * farthest end, not only the previous span, catches an opening inside a wider one.
 */
function validateOverlaps(index: PlanIndex, broken: Set<string>, issues: Issue[]): void {
  for (const wall of index.plan.walls) {
    if (broken.has(wall.id)) continue
    const spans = openingsOf(index, wall.id)
      .filter((opening) => !broken.has(opening.id))
      .map(openingSpan)
    // LVL-5 (C19): a wall through floors holds a window on each floor, one over the other: two
    // openings overlap there only where they share a stretch of the wall at the same height.
    if (wall.through !== undefined && wall.through !== floorOf(wall)) {
      const kept: typeof spans = []
      for (const current of spans) {
        const o = current.opening
        const clash = kept.find(
          (k) =>
            current.from < k.to - tolerance('openingOverrun') &&
            k.from < current.to - tolerance('openingOverrun') &&
            o.sill < k.opening.sill + k.opening.height - tolerance('openingOverrun') &&
            k.opening.sill < o.sill + o.height - tolerance('openingOverrun')
        )
        if (clash === undefined) {
          kept.push(current)
          continue
        }
        issues.push(issue('opening', o.id, 'opening/overlap', said('issue.opening/overlap', { first: name(clash.opening.id), second: name(o.id), wall: name(wall.id) })))
        broken.add(o.id)
      }
      continue
    }
    let kept = spans[0]
    for (const current of spans.slice(1)) {
      if (current.from < kept!.to - tolerance('openingOverrun')) {
        issues.push(
          issue(
            'opening',
            current.opening.id,
            'opening/overlap',
            said('issue.opening/overlap', { first: name(kept!.opening.id), second: name(current.opening.id), wall: name(wall.id) })
          )
        )
        broken.add(current.opening.id)
      } else if (current.to > kept!.to) {
        kept = current
      }
    }
  }
}

/**
 * Ids used more than once.
 *
 * An id is the only handle anything has on anything else, and `indexPlan`
 * builds its maps with `set()` — so the last duplicate silently wins every
 * lookup. The visible damage is worst across storeys: a room resolves its
 * boundary to another floor's wall, and `planForFloor` carries an opening into
 * every floor that happens to reuse the id.
 *
 * All of them are skipped rather than one being picked, because when two walls
 * answer to `w1` nobody can know which one the room meant, and drawing one is
 * drawing something the user never described. One namespace for the whole file:
 * `broken` is a flat set of ids, so a room named after a wall really does
 * inherit that wall's fate.
 */
function validateDuplicateIds(
  plan: FloorPlan,
  issues: Issue[],
  broken: Set<string>
): ReadonlySet<string> {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  const parts = [
    ...plan.walls.map(({ id }) => ({ id, noun: 'wall' as const })),
    ...plan.rooms.map(({ id }) => ({ id, noun: 'room' as const })),
    ...plan.openings.map(({ id }) => ({ id, noun: 'opening' as const }))
  ]

  for (const { id } of parts) {
    if (seen.has(id)) duplicated.add(id)
    else seen.add(id)
  }

  for (const id of duplicated) {
    // MSG-6: both parts named, and a free id to rename one to.
    const named = parts.filter((part) => part.id === id).map((part) => part.noun)
    const counts = [...new Set(named)].map((noun) => {
      const n = named.filter((m) => m === noun).length
      return n === 1 ? said(`issue.part.count.${noun}.one`) : said(`issue.part.count.${noun}.many`, { n })
    })
    let free = 2
    while (seen.has(`${id}-${free}`)) free++
    issues.push(
      issue(
        'plan',
        id,
        'plan/duplicate-id',
        said('issue.plan/duplicate-id', { id: name(id), parts: joined(counts, 'join.and'), free: name(`${id}-${free}`) })
      )
    )
    broken.add(id)
  }

  return duplicated
}

/**
 * MSG-6 (lab MS-9): a blank id, and an id that differs from an earlier one only in capitals or
 * spaces (`W1` and `w1`, `s` and `s `). Ids are unique across the whole plan, and these are
 * refused: the part is skipped and named. Of two ids alike, the first in the order walls, rooms,
 * openings keeps its id and the other is skipped, so what points at the first still finds it.
 * The two ids differ as text, so skipping one never skips the other. Two parts with exactly one
 * id are `plan/duplicate-id`'s.
 */
function validateIdSpelling(plan: FloorPlan, issues: Issue[], broken: Set<string>): void {
  type Part = 'wall' | 'room' | 'opening'
  const parts: [Part, string][] = [
    ...plan.walls.map((p): [Part, string] => ['wall', p.id]),
    ...plan.rooms.map((p): [Part, string] => ['room', p.id]),
    ...plan.openings.map((p): [Part, string] => ['opening', p.id])
  ]
  const shapes = new Map<string, { noun: Part; id: string }>()
  for (const [entity, id] of parts) {
    const noun = entity
    if (id.trim() === '') {
      issues.push(issue(entity, id, 'plan/blank-id', said('issue.plan/blank-id', { part: said(`issue.part.Named.${noun}`, { id: name(id) }) })))
      broken.add(id)
      continue
    }
    const shape = id.trim().toLowerCase().replace(/\s+/g, ' ')
    const first = shapes.get(shape)
    if (first === undefined) {
      shapes.set(shape, { noun, id })
      continue
    }
    if (first.id === id) continue
    issues.push(
      issue(
        entity,
        id,
        'plan/similar-id',
        said('issue.plan/similar-id', {
          part: said(`issue.part.Named.${noun}`, { id: name(id) }),
          first: said(`issue.part.named.${first.noun}`, { id: name(first.id) }),
          firstId: name(first.id)
        })
      )
    )
    broken.add(id)
  }
}

/**
 * Floor ids that differ only in capitalisation or spacing.
 *
 * Deliberately a warning and not a normalisation: folding `"Ground"` into
 * `"ground"` would merge two storeys the file keeps apart, and which name then
 * wins is unanswerable. How a floor id is matched is part of C5, a closed
 * convention — changing it is a team decision, not a bug fix. Naming the
 * collision is the part that belongs here.
 */
function validateFloorIdSpelling(plan: FloorPlan, issues: Issue[]): void {
  const byShape = new Map<string, string[]>()
  for (const floor of planFloors(plan)) {
    const shape = floor.id.trim().toLowerCase().replace(/\s+/g, ' ')
    const list = byShape.get(shape)
    if (list) list.push(floor.id)
    else byShape.set(shape, [floor.id])
  }

  for (const ids of byShape.values()) {
    if (ids.length < 2) continue
    issues.push(
      issue(
        'plan',
        ids[0]!,
        'plan/similar-floor-id',
        said('issue.plan/similar-floor-id', { floors: joined(ids.map(name), 'join.and') }),
        'warning'
      )
    )
  }
}

/**
 * Floors · C5.
 *
 * Ids stay globally unique across storeys, which is what keeps the 3D mesh
 * cache correct — but it also means nothing structural stops a room on one
 * floor from naming a wall on another. That reference is the real fault here;
 * the registry checks are only warnings, because a floor named by geometry but
 * missing from the registry is still drawn (see `planFloors`).
 */
function validateFloors(
  plan: FloorPlan,
  index: PlanIndex,
  duplicated: ReadonlySet<string>,
  issues: Issue[],
  broken: Set<string>
): void {
  const declared = new Set<string>()
  for (const floor of plan.floors ?? []) {
    if (declared.has(floor.id)) {
      issues.push(
        issue(
          'plan',
          floor.id,
          'plan/duplicate-floor',
          said('issue.plan/duplicate-floor', { floor: name(floor.id) }),
          'warning'
        )
      )
      continue
    }
    declared.add(floor.id)
  }

  // LVL-1 (lab MS-10): a part on a floor id the plan does not know is left out, with the nearest
  // id it does know. Without a floor list, only an id spelt like a more used one is unknown.
  for (const found of unknownFloorIssues(plan, declared)) {
    issues.push(found)
    if (found.severity === 'error') broken.add(found.id)
  }

  // Runs whether or not there is a registry: a room and its walls must agree.
  for (const room of plan.rooms) {
    const floor = floorOf(room)
    const strays = roomWallIds(room).filter((wallId) => {
      // An ambiguous id resolves to whichever wall happened to come last, so the
      // floor read off it is a coin flip. `plan/duplicate-id` already reports
      // the real fault and has marked the id broken.
      if (duplicated.has(wallId)) return false
      const wall = index.wallsById.get(wallId)
      // LVL-5 (C19): a wall through floors stands on each floor it rises through.
      return wall !== undefined && !wallStandsOn(plan, wall, floor)
    })
    if (strays.length === 0) continue

    issues.push(
      issue(
        'room',
        room.id,
        'room/cross-floor',
        said('issue.room/cross-floor', { room: name(room.id), floor: name(floor), walls: joined(strays.map(name), 'join.comma') })
      )
    )
    broken.add(room.id)
  }
}

/**
 * Square metres to two decimals, a half rounded up. Read to twelve figures first, so that an
 * area of exactly 13.585 that the arithmetic left at 13.58499999… still reads 13.59.
 */
/** A length in millimetres, to a tenth where that is what tells it apart. */
function millimetres(metres: number): Said {
  const mm = metres * 1000
  return said('issue.part.mm', { n: num(mm >= 10 ? fixedText(mm, 0) : Number(mm.toPrecision(2)).toString()) })
}

const two = (value: number): string => fixedText(value, 2)
/** Square metres to two decimals, as a figure: the sentence writes the unit. */
const m2 = (value: number): Value => num(two(value))
const at = (p: { readonly x: number; readonly y: number }): Said => pointSaid(metresText(p.x), metresText(p.y))
const names = (ids: readonly string[], most?: number): Value => namesSaid(ids.map(name), most)

function unclaimedMessage(floor: string, piece: FloorPiece): Said {
  const walls = piece.walls.length > 0 ? said('issue.floor/unclaimed.walls', { walls: names(piece.walls) }) : ''
  return said('issue.floor/unclaimed', { floor: name(floor), area: m2(piece.area), at: at(piece.at), walls })
}

/**
 * A refused room that lists the walls around a piece of unclaimed floor: most likely the room
 * meant to claim it. Its own issue already says why it was left out, so the piece is not
 * reported a second time. "Lists the walls" means that every wall it lists is around the piece
 * (a wall list with one missing), or that it lists every wall around the piece (a wall list out
 * of order, or with a wall too many).
 */
function refusedRoomFor(floor: string, piece: FloorPiece, plan: FloorPlan, broken: ReadonlySet<string>): boolean {
  return refusedRoomOf(floor, piece, plan, broken) !== null
}

/** The refused room `refusedRoomFor` finds, by id, or null. */
function refusedRoomOf(floor: string, piece: FloorPiece, plan: FloorPlan, broken: ReadonlySet<string>): string | null {
  const around = new Set(piece.walls)
  if (around.size === 0) return null
  const room = plan.rooms.find((room) => {
    if (!broken.has(room.id) || floorOf(room) !== floor || room.boundary.length === 0) return false
    const listed = new Set(room.boundary)
    return [...listed].every((id) => around.has(id)) || [...around].every((id) => listed.has(id))
  })
  return room?.id ?? null
}

/**
 * MSG-5: the room a piece of unclaimed floor most likely belongs to, when that room could not be
 * drawn or was left out when the plan was read: one that lists at least two of the walls around
 * it. Its line says why it is not there, and the piece goes with it.
 */
function unclaimedCause(piece: FloorPiece, plan: FloorPlan, broken: ReadonlySet<string>, leftOut: readonly LeftOutPart[]): string | null {
  const around = new Set(piece.walls)
  const lists = (walls: readonly string[]): boolean => new Set(walls.filter((id) => around.has(id))).size >= 2
  // A room on another floor may name this floor's walls (`room/cross-floor`): the walls tell.
  const room = plan.rooms.find((r) => broken.has(r.id) && lists(r.boundary))
  if (room !== undefined) return room.id
  return leftOut.find((part) => part.kind === 'room' && part.id !== null && lists(part.walls))?.id ?? null
}

/** `.one` for one, `.many` for more. */
const oneOrMany = (n: number): 'one' | 'many' => (n === 1 ? 'one' : 'many')

function mismatchMessage(m: RoomMismatch): Said {
  if (m.enclosed < tolerance('areaReported')) return said('issue.room/not-enclosed', { room: name(m.room), area: m2(m.area) })
  const parts: Said[] = []
  const unlisted = m.onWalls.filter((w) => !w.listed)
  const listed = m.onWalls.filter((w) => w.listed)
  const sum = (list: readonly { area: number }[]): number => list.reduce((s, w) => s + w.area, 0)
  if (unlisted.length > 0) {
    parts.push(said(`issue.room/space-mismatch.unlisted.${oneOrMany(unlisted.length)}`, { area: m2(sum(unlisted)), walls: names(unlisted.map((w) => w.wall)) }))
  }
  if (listed.length > 0) {
    parts.push(said(`issue.room/space-mismatch.listed.${oneOrMany(listed.length)}`, { area: m2(sum(listed)), walls: names(listed.map((w) => w.wall)) }))
  }
  if (m.outside >= tolerance('areaReported')) parts.push(said('issue.room/space-mismatch.outside', { area: m2(m.outside) }))
  if (m.spaces.length > 1) {
    const lines = m.lines.length > 0 ? said(`issue.room/space-mismatch.lines.${oneOrMany(m.lines.length)}`, { lines: names(m.lines) }) : ''
    parts.push(said('issue.room/space-mismatch.spaces', { n: m.spaces.length, areas: namesSaid(m.spaces.map(m2), 4), lines }))
  }
  if (m.sharedWith.length > 0) {
    parts.push(said(`issue.room/space-mismatch.shared.${oneOrMany(m.sharedWith.length)}`, { rooms: names(m.sharedWith) }))
  }
  return said('issue.room/space-mismatch', { room: name(m.room), area: m2(m.area), parts: joined(parts, 'join.semicolon') })
}

/**
 * The spaces the walls enclose, floor by floor (`spaces.ts`): floor no room claims, and rooms
 * whose outline is not the space their walls enclose. Warnings only: nothing is skipped.
 */
function validateSpaces(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[], leftOut: readonly LeftOutPart[]): FloorSpaces[] {
  let floors: ReturnType<typeof planSpaces>
  try {
    floors = planSpaces(plan, { index, broken })
  } catch {
    return []
  }
  for (const result of floors) {
    if (!spacesKnown(result)) {
      issues.push(
        issue(
          'floor',
          result.floor,
          'floor/spaces-unknown',
          said('issue.floor/spaces-unknown', { floor: name(result.floor), reason: result.reasonSaid }),
          'warning'
        )
      )
      continue
    }
    reportSpaces(plan, index, result, broken, issues, leftOut)
  }
  return floors.filter(spacesKnown)
}

/**
 * MSG-5: a fixture said to stand in no room (`item/outside-rooms`, CNT-12) whose middle is on
 * enclosed floor no room claims, when the room meant to claim that floor could not be drawn or
 * was left out when the plan was read: the room `floor/unclaimed` would follow from. Its line
 * says why the room is not there, and the fixture's line goes with it. The fixture's other lines
 * (`item/blocks-doorway`, `item/blocks-window`, CNT-13) are measured from the wall, the opening
 * and the fixture alone, never the room, so they follow from nothing here; and they are not
 * given at all for an opening or a wall that cannot be drawn (`itemUseIssues` skips them).
 */
function traceItemRooms(plan: FloorPlan, spaces: readonly FloorSpaces[], broken: ReadonlySet<string>, leftOut: readonly LeftOutPart[], issues: Issue[]): void {
  for (const [i, found] of issues.entries()) {
    if (found.code !== 'item/outside-rooms' || found.causedBy !== undefined) continue
    const item = (plan.items ?? []).find((it) => it.id === found.id)
    if (item === undefined) continue
    const floor = floorOf(item)
    const at = { x: item.at[0], y: item.at[1] }
    const piece = spaces
      .find((result) => result.floor === floor)
      ?.unclaimed.find((p) => p.rings[0] !== undefined && pointInPolygon(at, p.rings[0], p.rings.slice(1)))
    if (piece === undefined) continue
    issues[i] = followOn(found, refusedRoomOf(floor, piece, plan, broken) ?? unclaimedCause(piece, plan, broken, leftOut))
  }
}

function reportSpaces(plan: FloorPlan, index: PlanIndex, result: FloorSpaces, broken: ReadonlySet<string>, issues: Issue[], leftOut: readonly LeftOutPart[]): void {
  // BRF-4 (C17): a floor with an outline and no walls is massing: all of it is floor no room
  // claims yet, and saying so would be the whole floor, every time. Its areas say it is massing.
  // LVL-5: a wall that rises through the floor from below stands on it, so it is not massing.
  const massing = !plan.walls.some((wall) => wallStandsOn(plan, wall, result.floor) && !broken.has(wall.id))
  if (result.pastOutline !== null && result.pastOutline >= tolerance('areaReported')) {
    issues.push(
      issue(
        'floor',
        result.floor,
        'floor/past-outline',
        said('issue.floor/past-outline', { floor: name(result.floor), area: num(result.pastOutline.toFixed(2)) }),
        'warning'
      )
    )
  }
  for (const piece of massing ? [] : result.unclaimed) {
    if (refusedRoomFor(result.floor, piece, plan, broken)) continue
    // LVL-12: floor open to the sky (a window looks into it, or it lies over open sky) is the
    // outside, not floor a room has been left out of.
    if (inOpenSky(index, result.floor, piece.at)) continue
    const found = issue('floor', result.floor, 'floor/unclaimed', unclaimedMessage(result.floor, piece), 'warning')
    issues.push(followOn(found, unclaimedCause(piece, plan, broken, leftOut)))
  }
  for (const m of result.mismatches) {
    const code = m.enclosed < tolerance('areaReported') ? 'room/not-enclosed' : 'room/space-mismatch'
    issues.push(issue('room', m.room, code, mismatchMessage(m), 'warning'))
  }
}

/**
 * Rooms marked `inside` that no room on their floor holds (`nesting.ts`). Their floor is
 * counted on its own and taken off nothing, which is what the plan said not to do.
 */
function validateNesting(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const nesting = roomNesting(index)
  const floors = new Map(plan.rooms.map((room) => [room.id, floorOf(room)] as const))
  for (const inner of nesting.inner.values()) {
    if (inner.host !== null || broken.has(inner.room)) continue
    const floor = floors.get(inner.room) ?? ''
    const why =
      inner.reasonSaid !== undefined
        ? said('issue.room/inside-no-host.unknown', { reason: inner.reasonSaid })
        : inner.nearest !== null
          ? said('issue.room/inside-no-host.nearest', { area: m2(inner.nearest.outside), nearest: name(inner.nearest.room) })
          : said('issue.room/inside-no-host.none', { floor: name(floor) })
    issues.push(
      issue(
        'room',
        inner.room,
        'room/inside-no-host',
        said('issue.room/inside-no-host', { room: name(inner.room), floor: name(floor), why }),
        'warning'
      )
    )
  }
}

/**
 * Rooms that state `partOf` but are not zones of that room (CNT-8, `zones.ts`): it is not on
 * their floor, is a zone itself, or does not hold them. They are counted as rooms of their own,
 * which is what the plan said not to do.
 */
function validateZones(index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  for (const fault of roomZones(index).faults) {
    if (broken.has(fault.zone)) continue
    issues.push(
      issue(
        'room',
        fault.zone,
        'room/zone-not-in-room',
        said('issue.room/zone-not-in-room', { zone: name(fault.zone), room: name(fault.room), why: fault.why, partOf: name('partOf') }),
        'warning'
      )
    )
  }
}

function overlapMessage(o: RoomOverlap): Said {
  const [a, b] = o.rooms
  const [areaA, areaB] = o.areas
  if (o.kind === 'same') {
    const walls = o.sameWalls ? said('issue.room/overlap.sameWalls') : ''
    return said('issue.room/overlap.same', { a: name(a), b: name(b), area: m2(o.shared), walls })
  }
  if (o.kind === 'inside') {
    const [inner, outer] = areaA <= areaB ? [a, b] : [b, a]
    const [innerArea, outerArea] = areaA <= areaB ? [areaA, areaB] : [areaB, areaA]
    return said('issue.room/overlap.inside', {
      inner: name(inner),
      innerArea: m2(innerArea),
      outer: name(outer),
      outerArea: m2(outerArea),
      area: m2(o.shared),
      at: at(o.at)
    })
  }
  return said('issue.room/overlap', { a: name(a), areaA: m2(areaA), b: name(b), areaB: m2(areaB), area: m2(o.shared), at: at(o.at) })
}

/**
 * Rooms on one floor that cover the same floor (`overlaps.ts`). One line per pair, on the room
 * whose area the shared floor most likely makes wrong: the larger of the two, which grew over
 * the other, or the later when both are the same size. Warnings only: both rooms are still drawn
 * and measured.
 */
function validateRoomOverlaps(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const found = roomOverlaps(plan, { index, broken })
  for (const o of found.overlaps) {
    const [a, b] = o.rooms
    // The larger room; the later one when the two are the same size within the tolerance.
    const on = o.kind === 'same' || o.areas[1] > o.areas[0] - tolerance('areaEqual') ? b : a
    issues.push(issue('room', on, 'room/overlap', overlapMessage(o), 'warning'))
  }
  for (const floor of found.stopped) {
    issues.push(
      issue(
        'floor',
        floor,
        'floor/overlaps-unknown',
        said('issue.floor/overlaps-unknown', { floor: name(floor), most: groupedNum(MAX_CUTS.toLocaleString('en')) }),
        'warning'
      )
    )
  }
  for (const u of found.uncompared) {
    const [a, b] = u.rooms
    issues.push(
      issue(
        'room',
        b,
        'room/overlap-unknown',
        // The reason is the polygon library's own error, in its words.
        said('issue.room/overlap-unknown', { a: name(a), b: name(b), reason: u.reason }),
        'warning'
      )
    )
  }
}

/**
 * Wall faults (`wallFaults.ts`, MSG-12): walls that stop short of their corner or run on past it,
 * walls on top of walls, a wall listed twice, a wall across a room that does not list it. One
 * warning each, on the wall (on the room for a wall it lists twice), ending with its fix.
 */
/** MSG-5: what is wrong with a room measured as if it were closed, and so follows from the wall that leaves it open. */
const OUTLINE_CODES = new Set(['room/space-mismatch', 'room/not-enclosed', 'room/overlap'])

function validateWallFaults(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const faults = wallFaults(plan, { index, broken })
  // MSG-5: a wall that stops short of its corner, or leaves a gap, leaves its rooms open; Grid
  // measures each as if it were closed. What is then wrong with those rooms' outlines, and the
  // walls found standing in them, follows from that wall: the first such wall of each room.
  const openedBy = new Map<string, string>()
  for (const fault of faults) {
    if (fault.kind !== 'short' && fault.kind !== 'gap') continue
    for (const room of fault.rooms) if (!openedBy.has(room)) openedBy.set(room, fault.walls[0]!)
  }
  for (const [i, found] of issues.entries()) {
    if (found.causedBy !== undefined || !OUTLINE_CODES.has(found.code)) continue
    const cause = openedBy.get(found.id)
    if (cause !== undefined) issues[i] = followOn(found, cause)
  }
  for (const fault of faults) {
    const onRoom = fault.kind === 'listed-twice'
    const inRoom = fault.kind === 'crosses-room' || fault.kind === 'stands-in-room'
    const cause = inRoom ? fault.rooms.map((room) => openedBy.get(room)).find((wall) => wall !== undefined && wall !== fault.walls[0]) ?? null : null
    issues.push(
      followOn(
        issue(
          onRoom ? 'room' : 'wall',
          onRoom ? fault.rooms[0]! : fault.walls[0]!,
          onRoom ? 'room/wall-listed-twice' : `wall/${fault.kind}`,
          fault.said,
          'warning'
        ),
        cause
      )
    )
  }
}

/**
 * Walls whose stated kind and worked-out kind disagree (`exposure.ts`, MSG-13), in one line each:
 * a wall stated `exterior` with rooms on both sides keeps its kind; a wall stated `partition`
 * that faces outside is treated as an outside wall.
 */
function validateKinds(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  for (const sides of kindDisagreements(plan, index)) {
    if (broken.has(sides.wall) || sides.differs === null) continue
    const length = num(metresText(sides.differs.length))
    const inside = [...new Set(sides.stretches.filter((s) => s.worked === 'interior').flatMap((s) => [...s.left, ...s.right]))]
    const facing = [...new Set(sides.stretches.filter((s) => s.worked === 'exterior').flatMap((s) => [...s.left, ...s.right]))]
    const message =
      sides.differs.stands === 'kept'
        ? said('issue.wall/kind-differs.kept', { wall: name(sides.wall), length, rooms: names(inside) })
        : said('issue.wall/kind-differs', { wall: name(sides.wall), length, rooms: names(facing) })
    issues.push(issue('wall', sides.wall, 'wall/kind-differs', message, 'warning'))
  }
}

/**
 * Stairs that cannot be laid out, and ends of a stair in no room (`planStairs`, LVL-3). An error
 * leaves the stair out of every view and of the way-out check; it never makes a wall or a room
 * broken. A floor's slice says the problems of the stairs that start or end on it.
 */
function validateStairs(plan: FloorPlan, broken: ReadonlySet<string>, issues: Issue[]): void {
  // A slice keeps the plan's stairs (`planForFloor`), so this costs nothing in a plan with none.
  if ((plan.stairs ?? []).length === 0) return
  for (const problem of planStairs(plan, isFloorSlice(plan) ? brokenOnFloor : () => broken).problems) {
    issues.push(issue('stair', problem.stair, problem.code, problem.said, problem.severity))
  }
}

/** The rooms, walls and openings validation leaves out of one floor's slice, without the checks on the whole plan. */
export function brokenOnFloor(slice: FloorPlan): ReadonlySet<string> {
  return validatePlan(slice, undefined, { spaces: false }).broken
}

export interface ValidateOptions {
  /**
   * Whether to work out the spaces the walls enclose and report floor no room claims and rooms
   * that do not match their space (`validateSpaces`), rooms that overlap (`validateRoomOverlaps`)
   * rooms marked `inside` that no room holds (`validateNesting`), the wall faults
   * (`validateWallFaults`) and walls whose stated kind disagrees with the rooms on their sides
   * (`validateKinds`), and the checks on floor levels and heights (`levelIssues`, LVL-1), which
   * read the whole plan: run them on the plan, not on one floor's slice. On by default. Those lines
   * are warnings and never change `broken`, so a caller that only needs `broken` can leave them
   * out: joining every wall of a floor costs more than every other check together.
   */
  readonly spaces?: boolean
  /**
   * Entries of the tolerance table changed for this check, for a survey or a scan that is less
   * exact than a drawing (`withTolerances` in `tolerances.ts`).
   */
  readonly tolerances?: ToleranceChanges
  /**
   * MSG-6: the ids of walls the reader left out (`readPlanParts`). A room or an opening that rests
   * on one is left out too, and its line names the wall and why it is not there, instead of a
   * wall the plan does not have.
   */
  readonly leftOutWalls?: ReadonlySet<string>
  /**
   * MSG-5: every wall, room and opening the reader left out (`readPlanParts`), for the issues that
   * follow from one to name it as their cause: floor no room claims where a left-out room was.
   */
  readonly leftOutParts?: readonly LeftOutPart[]
  /**
   * CNT-10: the state of a plan with phases being checked. Set by `validatePlan` itself, which
   * checks such a plan once in each state (`validatePhases`); left out by every caller.
   */
  readonly state?: PlanState
}

/**
 * CNT-10: a plan with phases, checked once as it will be after the work and once as it stands
 * before it, so a demolished wall and the new one built in its place, or a widened door's old
 * and new openings, are never in one drawing. What the plan holds after the work is reported in
 * full; of the state before it, only what is about a part to be demolished, since the parts that
 * stay are reported already. An opening or a room that stands when its wall does not is one
 * error of its own (`phaseClashes`) and is left out of both.
 */
function validatePhases(plan: FloorPlan, options: ValidateOptions): ValidationResult {
  const clashes = phaseClashes(plan)
  const issues: Issue[] = clashes.map((c) => followOn(issue(c.code === 'room/phase-wall' ? 'room' : 'opening', c.id, c.code, c.said), c.wall))
  const clashing = new Set(clashes.map((c) => c.id))
  const run = (state: PlanState): ValidationResult => {
    const inState = planInState(plan, state)
    const sound = clashing.size === 0 ? inState : { ...inState, openings: inState.openings.filter((o) => !clashing.has(o.id)), rooms: inState.rooms.filter((r) => !clashing.has(r.id)) }
    return validatePlan(sound, undefined, { ...options, state })
  }
  const after = run('after')
  const before = run('before')
  const demolished = idsInPhase(plan, 'demolished')
  issues.push(...after.issues, ...before.issues.filter((i) => demolished.has(i.id)))
  const broken = new Set<string>([...clashing, ...after.broken, ...[...before.broken].filter((id) => demolished.has(id))])
  return { issues, broken }
}

/**
 * WRT-2: in a plan written rooms first, each room's boundary is derived: Grid worked it out from
 * where the rooms are, and `written` keeps its fingerprint. A boundary that no longer matches
 * was edited by hand, and is refused with its own code; the room is left out until the rooms
 * text is written again, or `written` is taken out to keep the plan as a hand-written one.
 */
function validateDerived(plan: FloorPlan, issues: Issue[], broken: Set<string>): void {
  for (const room of boundariesEdited(plan)) {
    if (broken.has(room.id)) continue
    issues.push(
      issue(
        'room',
        room.id,
        'room/derived-edited',
        said('issue.room/derived-edited', { room: name(room.id) })
      )
    )
    broken.add(room.id)
  }
}

/**
 * LVL-6: what a floor's stated roof holds that cannot be drawn. A rooflight that does not lie on
 * the roof, or lies across a ridge or a hip, is left out, and so is a dormer with no place on one
 * slope (LVL-20); a roof with dormers says they are drawn only in sections and the headroom; a wall
 * on the outside that stops under the roof is named. Each floor once, and only where its walls are:
 * a floor's slice keeps the whole floor list.
 */
function validateRoofs(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, issues: Issue[]): void {
  const seen = new Set<string>()
  for (const floor of plan.floors ?? []) {
    if (seen.has(floor.id)) continue
    seen.add(floor.id)
    if (floor.roof === undefined || !plan.walls.some((wall) => floorOf(wall) === floor.id)) continue
    const shape = floorRoofShape(plan, floor.id)
    if (shape === null) continue
    const floorName = name(floor.name || floor.id)
    for (const rooflight of floor.roof.rooflights ?? []) {
      const place = rooflightPlace(shape, rooflight)
      if (!('problem' in place)) continue
      issues.push(
        issue('floor', floor.id, 'floor/rooflight-misplaced', said('issue.floor/rooflight-misplaced', { rooflight: name(rooflight.id), floor: floorName, problem: place.problem }))
      )
    }
    // LVL-20: a dormer with no place on one slope is left out, and the ones drawn are drawn only
    // in sections and the headroom.
    for (const dormer of floor.roof.dormers ?? []) {
      const place = dormerPlace(shape, dormer)
      if (!('problem' in place)) continue
      issues.push(issue('floor', floor.id, 'floor/dormer-misplaced', said('issue.floor/dormer-misplaced', { dormer: name(dormer.id), floor: floorName, problem: place.problem }), 'warning'))
    }
    const dormers = shape.dormers.length
    if (dormers > 0) {
      issues.push(
        issue(
          'floor',
          floor.id,
          'floor/dormers-not-drawn',
          said(`issue.floor/dormers-not-drawn.${oneOrMany(dormers)}`, { floor: floorName, n: dormers }),
          'warning'
        )
      )
    }
    wallsUnderRoof(plan, index, broken, floor.id, floorName, issues)
  }
}

/**
 * LVL-20: a solid wall on the building's outside (its sides worked out as outside, MSG-13) that is
 * not stated `exterior`, so it does not rise to the roof (`risesToRoof`), and stops more than `joint`
 * under the roof's underside somewhere along it: the gap over it is named. A wall through floors,
 * one round outdoor space alone and one outside the roof's rectangle are not.
 */
function wallsUnderRoof(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, floor: string, floorName: Value, issues: Issue[]): void {
  const shape = floorRoofShape(plan, floor)
  if (shape === null) return
  let sides: ReturnType<typeof planWallSides>
  try {
    sides = planWallSides(index)
  } catch {
    return
  }
  for (const wall of plan.walls) {
    if (floorOf(wall) !== floor || wall.virtual === true || wall.kind === 'exterior' || wall.through !== undefined || broken.has(wall.id)) continue
    if (wall.arc !== undefined || sides.get(wall.id)?.worked !== 'exterior' || risesToRoof(plan, wall)) continue
    const over = roofOverWall(shape, wall)
    if (over === null) continue
    const low = Math.min(...over.map((p) => p.z))
    const high = Math.max(...over.map((p) => p.z))
    const gap = high - wall.height
    if (!(gap > tolerance('joint'))) continue
    const range = high - low > tolerance('joint') ? said('issue.opening/above-roof.range', { low: num(metresText(low)), high: num(metresText(high)) }) : said('issue.opening/above-roof.at', { low: num(metresText(low)) })
    issues.push(
      issue(
        'wall',
        wall.id,
        'wall/under-roof',
        said('issue.wall/under-roof', { wall: name(wall.id), floor: floorName, height: num(metresText(wall.height)), range, gap: num(metresText(gap)) }),
        'warning'
      )
    )
  }
}

/**
 * Checks the whole plan. Never throws, except for a `tolerances` change that is not one
 * (`withTolerances`).
 */
export function validatePlan(
  plan: FloorPlan,
  index: PlanIndex = indexPlan(plan),
  options: ValidateOptions = {}
): ValidationResult {
  // CMD-51: a frozen plan's validation is kept with it, for its own index and plain options.
  if (Object.isFrozen(plan) && index === indexPlan(plan) && Object.keys(options).every((key) => key === 'spaces')) {
    const kept = keptFor(plan, `validate ${options.spaces !== false}`, () => validated(plan, index, options))
    // A set is not frozen: each caller is given its own.
    return { issues: kept.issues, broken: new Set(kept.broken) }
  }
  return validated(plan, index, options)
}

function validated(plan: FloorPlan, index: PlanIndex, options: ValidateOptions): ValidationResult {
  if (options.tolerances !== undefined && Object.keys(options.tolerances).length > 0) {
    const { tolerances, ...rest } = options
    return withTolerances(tolerances, () => validatePlan(plan, index, rest))
  }
  // LVL-8: a plan's opening patterns are checked as the plain openings they expand into, after
  // what stopped any of them being placed.
  if (plan.patterns !== undefined) {
    const expanded = expandPatterns(plan)
    const result = validatePlan(expanded.plan, undefined, options)
    return { issues: [...expanded.issues, ...result.issues], broken: result.broken }
  }
  if (options.state === undefined && planHasPhases(plan)) return validatePhases(plan, options)
  const issues: Issue[] = []
  const broken = new Set<string>()
  // MSG-6: a wall the reader left out is not in the plan; what rests on it is left out with it.
  // An id a part of the plan still has is not one of them.
  const present = new Set([...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id))
  const leftOut = new Set([...(options.leftOutWalls ?? [])].filter((id) => !present.has(id)))
  for (const id of leftOut) broken.add(id)
  // MSG-5: a plan with no walls whose rooms and openings name walls. Every one of them is left
  // out for that one reason, and its line follows from this one.
  const noWalls = plan.walls.length === 0 && leftOut.size === 0 && plan.rooms.length + plan.openings.length > 0

  validateOrigin(plan, issues)
  validateBoundary(plan, issues)
  if (noWalls) {
    issues.push(
      issue(
        'plan',
        'plan',
        'plan/no-walls',
        said('issue.plan/no-walls', {
          rooms: said(`issue.plan/no-walls.room.${oneOrMany(plan.rooms.length)}`, { n: plan.rooms.length }),
          openings: said(`issue.plan/no-walls.opening.${oneOrMany(plan.openings.length)}`, { n: plan.openings.length })
        })
      )
    )
  }
  // First: every check below resolves entities by id, so it has to know which
  // ids cannot be resolved at all.
  const duplicated = validateDuplicateIds(plan, issues, broken)
  validateIdSpelling(plan, issues, broken)
  validateFloorIdSpelling(plan, issues)
  validateFloors(plan, index, duplicated, issues, broken)
  // LVL-5: a wall that names a floor to rise through that is not above its own.
  if (!isFloorSlice(plan)) issues.push(...throughIssues(plan))

  for (const wall of plan.walls) {
    if (!validateWall(wall, issues)) broken.add(wall.id)
  }

  for (const opening of plan.openings) {
    if (!validateOpening(opening, index, broken, issues, leftOut, noWalls)) broken.add(opening.id)
  }

  validateOverlaps(index, broken, issues)
  validateRoofs(plan, index, broken, issues)

  for (const room of plan.rooms) {
    // Already faulted (e.g. it reaches across floors) — one fault, one issue.
    if (broken.has(room.id)) continue

    if (roomWallIds(room).some((wallId) => broken.has(wallId))) {
      const gone = roomWallIds(room).filter((wallId) => leftOut.has(wallId))
      const message =
        gone.length > 0
          ? said(`issue.room/broken-wall.leftOut.${oneOrMany(gone.length)}`, { room: name(room.id), walls: joined([...new Set(gone)].map(name), 'join.comma') })
          : said('issue.room/broken-wall', { room: name(room.id) })
      // MSG-5: it follows from the first of those walls, a wall left out first.
      const cause = gone[0] ?? roomWallIds(room).find((wallId) => broken.has(wallId))!
      issues.push(followOn(issue('room', room.id, 'room/broken-wall', message), cause))
      broken.add(room.id)
      continue
    }

    try {
      const polygon = roomPolygon(room, index)
      if (area(polygon) < tolerance('areaEqual')) {
        issues.push(issue('room', room.id, 'room/empty', said('issue.room/empty', { room: name(room.id) })))
        broken.add(room.id)
      }
    } catch (error) {
      issues.push(
        followOn(
          issue(
            'room',
            room.id,
            // The outline says why it failed: not closable, out of order, inside out, or a hole
            // that does not lie inside it (ARE-6).
            error instanceof RoomOutlineError ? error.code : 'room/unclosed',
            // Any other error is one the outline did not expect, said in its own words.
            error instanceof RoomOutlineError ? error.said : said('issue.part.error', { error: error instanceof Error ? error.message : String(error) })
          ),
          noWalls ? 'plan' : null
        )
      )
      broken.add(room.id)
    }
  }

  validateDerived(plan, issues, broken)
  validatePlausibility(plan, index, broken, issues)
  // CNT-12: after the rooms, which a fixture is matched to, and the walls it may run into.
  issues.push(...itemIssues(plan, index, broken))
  // CNT-13: a fixture standing in front of a doorway, or of a window higher than its sill.
  issues.push(...itemUseIssues(plan, index, broken))
  // CNT-4: the flats list, on the whole plan: a slice holds one floor of a duplex.
  issues.push(...flatIssues(plan, index))
  // CNT-6 (C23): the buildings list's own faults.
  issues.push(...buildingIssues(plan))
  // CNT-15 (C24): the named types list, and the parts that name a type, on the whole plan.
  issues.push(...typeIssues(plan))
  // CNT-16 (C25): the columns' and the structural grids' own faults.
  issues.push(...columnIssues(plan))
  // CNT-21: a column standing in another column or in an item.
  issues.push(...columnClashIssues(plan, broken))
  issues.push(...gridIssues(plan))
  // CNT-19 (C29): the parking bays' own faults, and what is worth a look on them. The ramps' are
  // said with the stairs': a ramp is laid out from the floors' levels, which read this check
  // without its spaces, so it must not run there.
  issues.push(...parkingIssues(plan, { ramps: options.spaces !== false }))

  if (options.spaces !== false) issues.push(...levelIssues(plan, broken, buildingKind(plan)))
  if (options.spaces !== false) validateStairs(plan, broken, issues)

  if (options.spaces !== false) {
    const spaces = validateSpaces(plan, index, broken, issues, options.leftOutParts ?? [])
    // LVL-5 (lab WR-9): a floor whose outline does not lie over the floor below it.
    if (!isFloorSlice(plan)) issues.push(...stackingIssues(plan, spaces))
    traceItemRooms(plan, spaces, broken, options.leftOutParts ?? [], issues)
    validateNesting(plan, index, broken, issues)
    validateZones(index, broken, issues)
    validateRoomOverlaps(plan, index, broken, issues)
    validateWallFaults(plan, index, broken, issues)
    // MSG-16: where each opening stands, against the walls that meet its wall.
    issues.push(...openingPlaceIssues(plan, index, broken))
    validateKinds(plan, index, broken, issues)
  }

  return { issues, broken }
}
