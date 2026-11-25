/**
 * The plan check contract: plain data, so it survives `JSON.stringify` and can be
 * read by a program and a warnings list alike.
 *
 * Everything here is computed from the plan. Nothing comes from an AI, and a
 * report never says a plan complies: no findings only means these checks found
 * nothing.
 */

import { en } from '../../messages/en'
import type { Said } from '../../messages/say'

export const RULES_REPORT_SCHEMA_VERSION = 1 as const

/** The label every report carries. */
export const GENERAL_GUIDANCE_LABEL = en.label

/** One place a rule's figure was read: the document, its edition and the clause number. */
export interface RuleCitation {
  readonly document: string
  readonly edition: string
  readonly clause: string
}

/**
 * Where a rule comes from.
 *
 * A `plan-sanity` rule follows from the drawing alone: it cites no document, and none
 * should be read into it. A `building-code` rule applies figures, and names where each
 * was read.
 */
export interface RuleSource {
  readonly kind: 'plan-sanity' | 'building-code'
  /** One line a report can show as it is. */
  readonly label: string
  /** Only on a `building-code` rule. */
  readonly citations?: readonly RuleCitation[]
}

export interface Rule {
  readonly id: string
  readonly title: string
  readonly source: RuleSource
}

export type FindingCode =
  /** The floor has no door or opening to the outside, and no door to a space left undrawn. */
  | 'no_exit'
  /**
   * LVL-14: a floor above the ground that nothing joins to the ground floor: no room on it is used
   * as a stair or a lift, and the plan states no stair or ramp to it (`floorsWithNoStair`).
   */
  | 'no_stair'
  /** A room has no door, opening or open side to another space. */
  | 'room_without_door'
  /** A room has a way out of itself but none that leads to an exit. */
  | 'no_route_to_exit'
  /** A door leads, through a wall that is not exterior, to a space not drawn as a room. */
  | 'door_to_undrawn_space'
  /** LVL-1: a door or opening to the outside on a floor standing above the ground; never a way out. */
  | 'door_to_outside_above_ground'
  /**
   * CNT-6 (lab EL-4): a door, a doorless opening or an open side between rooms of two different
   * flats (CNT-4), or a door through a wall the plan says has a neighbour beyond it. Never a route:
   * a home is not left through another. Its rooms are the room, then the other home's room.
   */
  | 'door_between_homes'
  /**
   * CNT-6 (lab R-10): a flat none of whose doors opens onto a room in no flat, a common part the
   * plan does not draw, a space not drawn or the outside. Its rooms are the flat's.
   */
  | 'flat_without_front_door'
  /**
   * LVL-3: rooms used as a stair on two neighbouring levels, none lying over one on the other, so
   * they join nothing. On the upper floor; its rooms are the upper level's, then the lower's.
   */
  | 'stair_out_of_line'
  /** LVL-3: the same for rooms used as a lift: the shaft is out of line. */
  | 'lift_out_of_line'
  /**
   * LVL-5 (lab WR-9): a room used as a stair that lies over one on the floor below, enough to join
   * it, but moved from it by more than `stackShift`, and not marked `overhang: "meant"`. On the
   * upper floor; its rooms are the upper room, then the lower.
   */
  | 'stair_shifted'
  /** LVL-5: the same for a lift shaft. */
  | 'lift_shifted'
  /**
   * MSG-18: a door or doorless opening no person fits through, by Grid's own sizes (not code
   * figures): too narrow, too low, or with its sill above the floor. It is not a way through.
   */
  | 'opening_too_small_to_pass'
  /**
   * MSG-17 (lab CH-6): a door or doorless opening through a wall stated exterior onto outside floor
   * the walls close in on every side, with no door on from it to the open air. Never a way out.
   */
  | 'door_into_closed_court'
  /**
   * LVL-17: a door or doorless opening between two rooms of one storey whose floors stand further
   * apart than a step (`passableRise`), neither of them used as a stair. Not a way through. Its
   * rooms are the lower room, then the upper; its `levels` say both levels.
   */
  | 'door_between_levels'
  /**
   * MSG-17 (lab AB-1): a let, a flat (CNT-4) or a room marked `private` in no flat in a plan with
   * common parts, whose every route to a way out goes through a room another let holds. Its rooms
   * are the let's, then those of the other lets on the way out.
   */
  | 'let_through_another_let'
  /**
   * LVL-4: a door, window or doorless opening in an outside wall that lies below the ground level
   * the site states (lab VE-7), wholly or in part. Only when the plan states the ground.
   */
  | 'opening_below_ground'
  /**
   * BRF-3 (lab EL-16): the building stands nearer an edge of the plot's boundary than the set-back
   * the person asked for from it: their figure, never a code's. On the floor whose outline comes
   * nearest the edge.
   */
  | 'setback_short'
  /** BRF-3: the building's outside face reaches past an edge of the plot's boundary, out of the plot. */
  | 'over_boundary'

/** One way through from a room: the room on its other side, and the opening or virtual wall. */
export interface RouteStep {
  readonly room: string
  readonly via: string
}

export interface RuleFinding {
  readonly code: FindingCode
  readonly ruleId: string
  readonly floor: string
  readonly rooms: readonly string[]
  readonly openings: readonly string[]
  /** One line of plain English, built from a fixed template. */
  readonly message: string
  /**
   * MSG-11: the sentence by its key and values, where the record cannot word it again from its
   * other fields (a part below the ground, a stair out of line). Not enumerable (`withSentence`).
   */
  readonly said?: Said
  /**
   * Only on `no_route_to_exit`: every way through the room, by the room beyond it, then by id.
   * Optional, so the report stays at schema version 1.
   */
  readonly through?: readonly RouteStep[]
  /** CNT-6: only on `flat_without_front_door`, the flat's id (CNT-4); MSG-17: on `let_through_another_let` when the let is a flat. */
  readonly flat?: string
  /**
   * LVL-17, only on `door_between_levels`: each room's floor level, in m from its storey's floor
   * (LVL-7), the lower room's first, and how much higher the upper stands. Optional, like `through`.
   */
  readonly levels?: {
    readonly lower: { readonly room: string; readonly at: number }
    readonly upper: { readonly room: string; readonly at: number }
    readonly rise: number
  }
  /** LVL-14, only on `no_stair`: the ground floor a stair to the floor would rise from, by id. Optional, like `through`. */
  readonly stairFrom?: string
  /**
   * MSG-17, only on `let_through_another_let`: the let's rooms, and the rooms of other lets on its
   * nearest way out, in the order the way passes them, by id. Optional, like `through`.
   */
  readonly lets?: {
    readonly own: readonly string[]
    readonly through: readonly string[]
  }
  /**
   * Only on `door_to_outside_above_ground`: how far the floor stands above the ground, in m, as
   * the message says it. Optional, like `through` (MSG-1: the notes word it from this).
   */
  readonly elevation?: number
  /**
   * Only on `opening_too_small_to_pass`: whether it is a door or a doorless opening, what it falls short of, its size there as drawn
   * in m (to the digits that keep it on its side of the size, ARE-7), and Grid's own size, which
   * is not a code figure. Optional, like `through`.
   */
  readonly passage?: {
    readonly kind: 'door' | 'opening'
    readonly short: 'width' | 'height' | 'sill'
    readonly drawn: number
    readonly passable: number
  }
  /**
   * Only on `opening_below_ground`: how far its foot and its top lie under the ground, in m (its
   * top's depth is 0 or less when it reaches above the ground), and whether it lies wholly below.
   * Optional, like `through`.
   */
  readonly belowGround?: {
    readonly foot: number
    readonly top: number
    readonly wholly: boolean
  }
  /**
   * Only on `setback_short` and `over_boundary` (BRF-3): the edge of the boundary by number, the way
   * it faces and whether it is on a street; the least distance from the building's outside face to
   * it, in m, and how far past it the building reaches (0 when it does not); and the set-back the
   * person asked for from it, with where it was asked for and who gave it, or null. `northStated`
   * is false when the way is read with north as the top of the drawing. Optional, like `through`.
   */
  readonly boundary?: {
    readonly edge: number
    readonly faces: string
    readonly street: boolean
    readonly name: string
    readonly distance: number
    readonly past: number
    readonly asked: { readonly distance: number; readonly from: 'edge' | 'street' | 'all'; readonly source: 'given' | 'assumed' | null } | null
    readonly northStated: boolean
  }
  /**
   * Only on `stair_shifted` and `lift_shifted` (LVL-5): how far the upper room is moved from the
   * one below, east (+x) and north (+y) of the drawing, in m; for a shaft not moved as a whole,
   * each side that stands off the one below's (east or north positive); and the box of each on the
   * plan. Optional, like `through`.
   */
  readonly shift?: {
    readonly east: number
    readonly north: number
    readonly sides: readonly { readonly side: 'north' | 'east' | 'south' | 'west'; readonly by: number }[]
    readonly upper: { readonly min: readonly [number, number]; readonly max: readonly [number, number] }
    readonly lower: { readonly min: readonly [number, number]; readonly max: readonly [number, number] }
  }
}

export type NotCheckedReason =
  /**
   * Not the ground floor, and no stair joins it to the ground floor (LVL-3): no stair the plan
   * states, and no room used as a stair lying over one on the floor below.
   */
  | 'no_stairs'
  /** The plan validation rejects it, so it was left out of the routes. */
  | 'cannot_be_drawn'
  /**
   * The floor's only doors out lead to a space that is not drawn, as the entrance of a flat
   * does. Whether that space is a way out cannot be told, so the routes were not checked.
   */
  | 'way_out_not_drawn'
  /**
   * CNT-6 (lab R-10): the same, where every way on from the floor is onto the building's common
   * parts that are not drawn: a flat's front door onto a landing, a stand's open side onto the aisle.
   */
  | 'way_out_through_common_parts'
  /**
   * BRF-3: the site states a boundary, but the building's outline could not be worked out, so no
   * distance to it was measured and no set-back compared.
   */
  | 'boundary_not_measured'

export interface NotChecked {
  readonly reason: NotCheckedReason
  /** The floor the notice is about. Empty for a notice about the whole plan. */
  readonly floor: string
  readonly rooms: readonly string[]
  readonly openings: readonly string[]
  readonly message: string
  /**
   * MSG-11: the sentence by its key and values, where the record cannot word it again from its
   * other fields (BRF-3: why no distance to the boundary was measured). Not enumerable (`withSentence`).
   */
  readonly said?: Said
  /**
   * MSG-5, only on `cannot_be_drawn`: the findings a check did not give because they rest on a
   * part that could not be drawn (`rules/held.ts`), each with the parts it waits for. Each comes
   * back once those parts are drawn, if it still holds. Optional, like `through`.
   */
  readonly held?: readonly HeldFinding[]
  /**
   * LVL-5, only on `cannot_be_drawn`: the type of each of `openings`, in order, so a window is
   * worded as what it is, never as a door. Optional, like `through`.
   */
  readonly openingKinds?: readonly ('door' | 'window' | 'opening')[]
}

/** MSG-5: a finding held back, and the rooms and openings that could not be drawn that it waits for, by id. */
export interface HeldFinding<Finding = RuleFinding> {
  readonly finding: Finding
  readonly waitsFor: readonly string[]
}

export interface RulesReport {
  readonly schemaVersion: typeof RULES_REPORT_SCHEMA_VERSION
  /** What the plan was checked against. */
  readonly basis: 'general-baseline'
  readonly label: typeof GENERAL_GUIDANCE_LABEL
  /** Every rule that was applied. */
  readonly rules: readonly Rule[]
  /** Ordered by floor level, then code, then the rooms they name. */
  readonly findings: readonly RuleFinding[]
  /** What could not be checked in this plan, and why. */
  readonly notChecked: readonly NotChecked[]
  /**
   * What these checks never look at, whatever the plan: the same fixed lines in every
   * report, so no findings is not read as more than it is.
   */
  readonly limits: readonly string[]
}
