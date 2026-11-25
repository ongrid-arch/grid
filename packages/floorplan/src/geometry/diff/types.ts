/**
 * The plan diff contract: plain data, so it survives `JSON.stringify` and can
 * be read by the review screens, the canvas and the check on the assistant's
 * edits alike.
 *
 * Everything here is computed from two plans. Nothing in a diff comes from an
 * AI, and nothing is a class instance or a Map.
 */

import { TOLERANCES } from '../tolerances'

export const PLAN_DIFF_SCHEMA_VERSION = 1 as const

/**
 * Two lengths closer than this are the same length. Ten times
 * coarser than `revision.ts`, so whatever it calls unchanged is unchanged here.
 */
export const LENGTH_TOLERANCE_M = TOLERANCES.diffLength.value

/** Two areas closer than this are the same area (`areaReported`). */
export const AREA_TOLERANCE_M2 = TOLERANCES.areaReported.value

export type EntityType = 'floor' | 'wall' | 'opening' | 'room'
export type ChangeKind = 'added' | 'removed' | 'modified'

export interface EntityRef {
  readonly type: EntityType
  readonly id: string
}

/** What a property can hold: only things JSON keeps as they are. */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly [number, number]

/** One property that differs, in model units (metres), under the schema's own name. */
export interface PropChange {
  readonly key: string
  readonly before: PropValue
  readonly after: PropValue
}

/** How a wall moved, computed from its two axes. */
export type WallMotion =
  | {
      readonly kind: 'translated'
      readonly vector: readonly [number, number]
      /** Distance across the wall, along its normal. Signed. */
      readonly normalDistance: number
      /** Distance along the wall. Signed. */
      readonly axialDistance: number
    }
  | {
      readonly kind: 'resized'
      readonly fixedEnd: 'start' | 'end'
      /** Later length minus earlier length. */
      readonly lengthDelta: number
    }
  | {
      readonly kind: 'rotated'
      readonly pivot: readonly [number, number]
      /** Counter-clockwise, in degrees, from -180 (excluded) to 180. */
      readonly angleDeg: number
    }
  | { readonly kind: 'reshaped' }

export interface PlanChange {
  /** `<entity type>:<entity id>:<kind>`: an entity has at most one change per diff. */
  readonly id: string
  readonly entity: EntityRef
  /** The later floor; an opening takes its wall's. */
  readonly floor: string
  readonly kind: ChangeKind
  /** Empty for added, removed and derived changes. */
  readonly props: readonly PropChange[]
  /** Walls whose position changed. */
  readonly motion?: WallMotion
  readonly summary: string
  /** Ids of the changes this one follows from. */
  readonly dependsOn: readonly string[]
  /** An opening that moved, or a room that was resized, only because its walls did. */
  readonly derived: boolean
}

export interface AreaDelta {
  readonly roomId: string
  readonly floor: string
  /** Net m²; null when the room did not exist or could not close. */
  readonly before: number | null
  readonly after: number | null
  /** The wall changes this one follows from, and those of any room inside it (ARE-5). */
  readonly dependsOn: readonly string[]
}

export type IssueCode =
  /** The earlier plan has entities that cannot be drawn; they were not compared. */
  | 'invalid_base'
  /** The later plan has entities that cannot be drawn; they were not compared. */
  | 'invalid_head'
  /** An opening names a wall that does not exist. */
  | 'dangling_host'
  /** A removed and an added entity overlap so much that one id probably changed. */
  | 'suspected_id_churn'
  /** A room that closed before no longer does. */
  | 'room_unclosed'
  /** The assistant named a room that exists in neither plan. */
  | 'unknown_target'

export interface DiffIssue {
  readonly code: IssueCode
  readonly message: string
  readonly entities: readonly EntityRef[]
}

export interface PlanDiff {
  readonly schemaVersion: typeof PLAN_DIFF_SCHEMA_VERSION
  readonly epsilon: number
  readonly areaEpsilon: number
  /** Ordered by storey (`Floor.level`, then floor id), then entity type, then id. */
  readonly changes: readonly PlanChange[]
  readonly areas: readonly AreaDelta[]
  readonly issues: readonly DiffIssue[]
}

export interface DiffOptions {
  /** Metres. Defaults to `LENGTH_TOLERANCE_M`. */
  readonly epsilon?: number
  /** Square metres. Defaults to `AREA_TOLERANCE_M2`. */
  readonly areaEpsilon?: number
  /** Default true. Only the issues change; the changes themselves never do. */
  readonly detectIdChurn?: boolean
  /**
   * MSG-25: whether a part whose phase changed is a change (a `phase` property). Default true;
   * false for a plan compared with itself by phase, whose pairs are one part in two states.
   */
  readonly phases?: boolean
}

/** What the assistant said it was editing. */
export interface ScopeTargets {
  readonly rooms: readonly string[]
  /** Everything on a named floor is in scope. */
  readonly floors?: readonly string[]
}

export interface ScopeOptions {
  /** Metres. A change whose numbers all moved less than this is ignored. Default `diffMovement` (0.01). */
  readonly minMovement?: number
}

export interface ScopeResult {
  /** False when nothing was named: the check is off and returns nothing. */
  readonly checked: boolean
  readonly changes: readonly PlanChange[]
  readonly issues: readonly DiffIssue[]
}
