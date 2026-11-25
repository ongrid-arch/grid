export * from './types'
export { diffPlans } from './diff'
export { changesOutsideScope, MIN_MOVEMENT_M } from './scope'
export { revertChanges } from './revert'
export { statusOf } from './status'
export { alignPlans, wallsInPlace, type Alignment, type AlignOptions, type Redrawn, type RenamedId } from './place'
export { findTurn, planTurn, turnPlan, PLAN_TURNS, type PlanTurn, type PlanTurnId } from './turn'
export { sameRing } from './props'
export {
  compareBuildings,
  BUILDING_COMPARISON_VERSION,
  type BuildingComparison,
  type ChangeLine,
  type CompareOptions,
  type ComparisonIssue,
  type ComparisonIssueCode,
  type ComparisonMarks,
  type NoteLike,
  type OpeningMovedWith,
  type RoomStatus,
  type RoomVerdict
} from './building'
