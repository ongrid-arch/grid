/**
 * The result record (MSG-1): everything Grid tells an agent about a plan, in one list with one
 * count. `docs/result-contract.md` is the contract this file follows: what each field means,
 * what may change and what may not.
 *
 * Plain data, so it survives `JSON.stringify`. Nothing here says a plan complies: a record with
 * no lines only means these checks found nothing.
 */

import type { PlanFix, TapedRow } from '@ongrid/floorplan/geometry'
import type { Language } from '@ongrid/floorplan/messages'
import type { LOOKUP_NOTICE, AppliedFigure, CheckCoverage, Rule } from '../checks/types'
import type { PlaceUsed } from '../checks/place'
import type { FirmFigure, FirmUsed } from './firm'

/** Raised when a field changes meaning or is taken away; adding a field or a code keeps it. */
export const RESULT_VERSION = 1 as const

/**
 * What a line is, in the order the list gives them.
 *
 * - `refused`: the plan could not be read, so nothing else was checked.
 * - `left-out`: a part that cannot be drawn. It is skipped by every view, measure and export.
 * - `worth-a-look`: a part that is drawn, and is very likely a mistake; and first, a word in the
 *   file Grid does not read (MSG-4): an unknown field or room use, or an empty plan.
 * - `finding`: what a plan check found (a way out, a door, a room's size, an escape window).
 * - `not-checked`: something a check could not look at in this plan, and why.
 * - `to-confirm` (WRT-6): a value the plan marks assumed, for the person to confirm. Last, so the
 *   numbers of the other lines do not move when an agent marks what it assumed.
 */
export const LINE_KINDS = ['refused', 'left-out', 'worth-a-look', 'finding', 'not-checked', 'to-confirm'] as const
export type LineKind = (typeof LINE_KINDS)[number]

/**
 * How far a number Grid gives is borne out by the plan (MSG-2, lab AA-12, AC-9): `proven` when
 * every part it is made of was measured and nothing in the drawing questions them; `not-proven`
 * when a part was left out or is in doubt, and it says which; `not-looked-at` when nothing it
 * would be made of could be measured. A number is never shown as more than its state.
 */
export const NUMBER_STATES = ['proven', 'not-proven', 'not-looked-at'] as const
export type NumberState = (typeof NUMBER_STATES)[number]

/** What a line is about. The plan as a whole has the id `''`. An `item` is a fixture (CNT-12); a `stair` a stated stair (LVL-3). */
export type ThingKind = 'plan' | 'floor' | 'wall' | 'room' | 'opening' | 'item' | 'stair' | 'pattern' | 'flat'

export interface Thing {
  readonly kind: ThingKind
  readonly id: string
}

/**
 * MSG-5: the line a line follows from, by its code and the id of the part it is about (`''` for
 * the plan as a whole; for `plan/duplicate-id`, the id it names). Fixing that part clears both.
 */
export interface Cause {
  readonly code: string
  readonly id: string
}

/**
 * MSG-5 (lab MS-4, W-6): a note a check did not give, because it rests on a part that could not
 * be drawn. It comes back once those parts are drawn, if it still holds.
 */
export interface HeldNote {
  /** The code its line would have. */
  readonly code: string
  readonly thing: Thing
  /** The floor it is on. */
  readonly floor: string
  /** The other parts it names, as its line would. */
  readonly also: readonly string[]
  /** The rooms and openings that could not be drawn that it waits for, by id. */
  readonly waitsFor: readonly string[]
}

export interface ResultLine {
  /** Stable: `<thing>/<what>`, lowercase words joined by dashes. Never reused for another meaning. */
  readonly code: string
  readonly kind: LineKind
  readonly thing: Thing
  /** The id of the floor the thing is on; null for the plan as a whole. */
  readonly floor: string | null
  /** The ids of the other parts the line names: the wall a door hits, the rooms a door joins. */
  readonly also: readonly string[]
  /** The one wording of this code, with the plan's names and the figures filled in. */
  readonly message: string
  /** What was found, in words and figures. */
  readonly found: string
  /** What would be right, in words and figures. */
  readonly needed: string
  /** What to change. A suggestion: the plan is the author's. */
  readonly fix: string
  /**
   * On a finding that compared the plan with a figure: the figures, each with its origin, its
   * sources and how far it has been checked.
   */
  readonly figures?: readonly AppliedFigure[]
  /**
   * MSG-7: each change to one part that would clear the line, as data, when there is one: the
   * opening, and its new width, offset, height or sill. `grid_check` gives each as the call that
   * makes it (`calls`). Several when more than one would do.
   */
  readonly fixes?: readonly PlanFix[]
  /**
   * MSG-11: the figures, names, ids and places the line's words were made with, by the names
   * its wording gives them (`{width}` is `width`): a figure as a number, rounded as the words
   * give it. Absent when there are none. The same in every language.
   */
  readonly values?: Readonly<Record<string, string | number>>
  /**
   * MSG-5: on a line that follows from another: that line, by code and id. It is listed right
   * under it, and goes away when that is fixed. A line with none is a problem of its own.
   */
  readonly causedBy?: Cause
  /**
   * MSG-5: on a line that stands for the same note on several parts (lab MS-14): each of them,
   * `thing` first. Its message lists their names.
   */
  readonly each?: readonly Thing[]
  /**
   * MSG-36: on a line said once for alike lines on several floors: each floor it holds for,
   * `floor` first. A view of one floor shows the line on every one of them (`holdsOnFloor`).
   */
  readonly floors?: readonly string[]
  /**
   * MSG-5: on `floor/not-checked-rooms-not-drawn` and `floor/not-checked-doors-not-drawn`: the
   * notes held back because they rest on the parts the line names.
   */
  readonly held?: readonly HeldNote[]
  /**
   * COD-8: on a `firm/` line, the firm's own figure it was set against, from the firm's file
   * beside the plan. Never a code's: such a line carries no `figures`.
   */
  readonly firm?: FirmFigure
}

export interface GridResult {
  readonly resultVersion: typeof RESULT_VERSION
  /** First in every record and every rendering of it, in the record's language. */
  readonly label: string
  /** MSG-11: the language the record's words are in, when it is not English. */
  readonly language?: Language
  /** False when the plan was refused: then the lines are its refusals and nothing else ran. */
  readonly read: boolean
  /** How many lines there are: the one number for how much there is to look at. */
  readonly count: number
  /** The same lines counted by kind. They add up to `count`. */
  readonly counts: Readonly<Record<LineKind, number>>
  /**
   * MSG-5 (lab W-7): how many lines follow from no other and are not `not-checked`: the problems
   * to act on. The lines that follow from one (`causedBy`) go away with it.
   */
  readonly problems: number
  /**
   * Every line, refusals first, then by kind in `LINE_KINDS` order. MSG-5: a line that follows
   * from another comes right under it, whatever its kind.
   */
  readonly lines: readonly ResultLine[]
  /** What the plan was checked against: `local-lookup` once a looked-up figure was applied. */
  readonly basis: 'general-baseline' | 'local-lookup'
  /** Only when a looked-up figure was applied. */
  readonly lookupNotice?: typeof LOOKUP_NOTICE
  /** Every check that ran and looked at something. Empty when the plan was refused. */
  readonly checks: readonly Rule[]
  /**
   * MSG-2: what each check looked at and skipped, with the reason and a count, whether it ran or
   * not. Empty when the plan was refused, or when the checks could not run.
   */
  readonly coverage: readonly CheckCoverage[]
  /** Every figure a check applied. */
  readonly figures: readonly AppliedFigure[]
  /** What these checks never look at, whatever the plan: the same lines every time. */
  readonly limits: readonly string[]
  /**
   * COD-3: the place the figure checks were for, from Grid's list (`country`, the two-letter
   * code; `name`, Grid's name; `from`: `request`, `plan` or `assumed`). Null when no place is
   * stated, and then no figure was applied; null too when the plan was refused.
   */
  readonly place: PlaceUsed | null
  /** COD-3: only when the plan was read and states no place: how many lines the US figures would have given. */
  readonly withoutPlace?: { readonly usLines: number }
  /**
   * HND-11 (lab WR-14): only on a plan that keeps taped lengths: each one, taped against drawn,
   * in the plan's order (`tapedLengths`). One that differs, or cannot be measured, is a line too.
   */
  readonly taped?: readonly TapedRow[]
  /**
   * COD-8: only when the plan has a firm's standards file beside it: the file, whether it was
   * read, and each standard with how many parts it was set against and how many notes it gave.
   * The firm's figures are not tied to a place, and are not among `figures`.
   */
  readonly firm?: FirmUsed
}
