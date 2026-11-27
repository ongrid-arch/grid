/**
 * ARE-75: the `state` argument of the reading tools: the building before the work, after it, or
 * both, on a plan with phases. `before` and `after` read the plan as it stands then, a plan of
 * that state alone (`planAsItStands`); `both`, and a call that leaves it out, read the plan as
 * each tool always has. `grid_view` draws two named drawings besides: the demolition plan (before
 * the work, the parts to be demolished drawn dashed) and the proposed plan (after it, the new
 * parts marked).
 */
import { planHasPhases, type FloorPlan, type PlanState } from '@ongrid/floorplan/geometry'
import type { Speaker } from '@ongrid/floorplan/messages'
import type { LoadedPlan } from '../command/plan'
import { loadedInState } from '../quantities/phaseState'
import type { Answer, ArgSpec } from './toolkit'

/** A state the reading tools take. */
export type StateAsked = PlanState | 'both'

export const STATE_WORDS: readonly StateAsked[] = ['before', 'after', 'both']

/** The argument, with what `both` and leaving it out mean for the tool. */
export function stateArg(both: string, leftOut: string): ArgSpec {
  return {
    type: 'string',
    enum: STATE_WORDS,
    description: `On a plan with phases: before for the building as it stands before the work (its existing parts and those to be demolished), after for the building as it will be (its existing and new parts), each read as a plan of that state alone; both ${both}. Left out, ${leftOut}. A plan with no phases is one state, read the same with each.`,
    examples: ['before', 'both'],
  }
}

/** grid_view's drawings: the states, and the demolition and proposed plans. */
export type ViewState = StateAsked | 'demolition' | 'proposed'

export const VIEW_STATE_ARG: ArgSpec = {
  type: 'string',
  enum: [...STATE_WORDS, 'demolition', 'proposed'],
  description: 'On a plan with phases, which building to draw: demolition for the demolition plan (the building before the work, the parts to be demolished dashed and in the key), proposed for the proposed plan (the building after the work, the new parts marked), before or after for that building alone with no phase drawn, both for every part with its phase. both when left out. For kind=3d, eye, facade and section, demolition draws the building before the work and proposed after it.',
  examples: ['demolition', 'proposed', 'before'],
}

/** The loaded plan a tool reads for the state asked: as it stands then for before and after, else as read. */
export function loadedFor(loaded: LoadedPlan, state: unknown): LoadedPlan {
  return state === 'before' || state === 'after' ? loadedInState(loaded, state) : loaded
}

/**
 * The loaded plan grid_view draws for the state asked, and the one its measures, its 3D, facade
 * and section read: the demolition and proposed plans draw their phases, and measure the building
 * as it stands then, as every other reader does.
 */
export function viewLoadedFor(loaded: LoadedPlan, state: unknown): { readonly drawn: LoadedPlan; readonly measured: LoadedPlan } {
  if (state === 'demolition') return { drawn: loadedInState(loaded, 'before', 'kept'), measured: loadedInState(loaded, 'before') }
  if (state === 'proposed') return { drawn: loadedInState(loaded, 'after', 'kept'), measured: loadedInState(loaded, 'after') }
  const read = loadedFor(loaded, state)
  return { drawn: read, measured: read }
}

/** The line an answer read in a state opens with; null for both or none, and on a plan with no phases. */
export function stateLine(plan: FloorPlan, state: unknown, s: Speaker): string | null {
  if (!planHasPhases(plan)) return null
  if (state === 'before' || state === 'after') return s.say(`tool.state.${state}`)
  if (state === 'demolition' || state === 'proposed') return s.say(`view.state.${state}`)
  return null
}

/** An answer read in a state: its line first (not in a CSV table) and the state in its data. */
export function withStateLine<A extends Answer>(answer: A, line: string | null, state: unknown, asCsv = false): A {
  if (line === null) return answer
  return { ...answer, text: asCsv ? answer.text : `${line}\n${answer.text}`, data: { ...answer.data, state } }
}
