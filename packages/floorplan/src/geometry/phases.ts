/**
 * CNT-10 (C16, lab EL-10, CP4-4): existing, demolished and new, and a fit-out on a base plan.
 *
 * A plan that states a phase holds two states of the building: before the work (its existing and
 * demolished parts) and after it (its existing and new parts). Everything that measures or checks
 * the building reads one state (`planInState`), the one after the work unless it says otherwise;
 * the drawing and the exports read both, each part in its phase. A plan that states no phase and
 * names no base is one state, read exactly as it always was: every function here returns it as
 * it is.
 *
 * The phase a part is read in (`phaseOf`): its own; else, for an opening, its wall's when that is
 * demolished or new (a door goes with its wall, and is built with it); else `new` in a plan fitted
 * out in a base (the plan is the work) and `existing` in any other (it stands before and after).
 *
 * A base plan (`mergeBase`): its walls and openings, as they stand after its own work, are read
 * into the plan as existing. The plan's own parts keep their ids; a base part with an id of the
 * plan's is a clash, which the caller refuses. Pure: plans in, plans and issues out.
 */
import type { FloorPlan, Opening, Room, Wall } from './plan'
import type { WallEnds } from './wall'
import { wallJoints } from './joints'
import type { Phase } from '../types/floorplan'
import { english, name, said, type Said } from '../messages/say'
import type { MessageKey } from '../messages/en'

/** A state of the building: as it stands before the work, or as it will be after it. */
export type PlanState = 'before' | 'after'

export const PLAN_STATES: readonly PlanState[] = ['before', 'after']

/** A phase in words, as a sentence writes it (MSG-11: `issue.part.phase.*`, "existing", "to be demolished", "new"). */
export const PHASE_WORDS: Readonly<Record<Phase, MessageKey>> = { existing: 'issue.part.phase.existing', demolished: 'issue.part.phase.demolished', new: 'issue.part.phase.new' }

/** Whether the plan states a phase on any wall, opening or room, or names a base plan. */
export function planHasPhases(plan: Pick<FloorPlan, 'walls' | 'openings' | 'rooms' | 'base'>): boolean {
  if (plan.base !== undefined) return true
  return plan.walls.some((w) => w.phase !== undefined) || plan.openings.some((o) => o.phase !== undefined) || plan.rooms.some((r) => r.phase !== undefined)
}

/** Whether a part in this phase stands in this state. */
export function standsIn(phase: Phase, state: PlanState): boolean {
  return state === 'before' ? phase !== 'new' : phase !== 'demolished'
}

/** The states a part in this phase stands in. */
const statesOf = (phase: Phase): PlanState[] => PLAN_STATES.filter((state) => standsIn(phase, state))

/** How a plan's parts are read: the phase of each, for a plan that has phases. */
export interface PhaseReading {
  readonly wall: (wall: Pick<Wall, 'phase'>) => Phase
  readonly opening: (opening: Pick<Opening, 'phase' | 'wall'>) => Phase
  readonly room: (room: Pick<Room, 'phase'>) => Phase
}

/** The phase each part of the plan is read in (see the header). */
export function phaseReading(plan: Pick<FloorPlan, 'walls' | 'base'>): PhaseReading {
  const unstated: Phase = plan.base !== undefined ? 'new' : 'existing'
  const walls = new Map<string, Wall>()
  for (const wall of plan.walls) if (!walls.has(wall.id)) walls.set(wall.id, wall)
  const wall = (w: Pick<Wall, 'phase'>): Phase => w.phase ?? unstated
  return {
    wall,
    room: (r) => r.phase ?? unstated,
    opening: (o) => {
      if (o.phase !== undefined) return o.phase
      const on = walls.get(o.wall)
      const phase = on === undefined ? unstated : wall(on)
      return phase === 'demolished' || phase === 'new' ? phase : unstated
    },
  }
}

/** Each wall, opening and room's phase by id, for a plan that has phases; empty for one that has none. */
export function partPhases(plan: FloorPlan): Map<string, Phase> {
  const phases = new Map<string, Phase>()
  if (!planHasPhases(plan)) return phases
  const read = phaseReading(plan)
  for (const wall of plan.walls) if (!phases.has(wall.id)) phases.set(wall.id, read.wall(wall))
  for (const opening of plan.openings) if (!phases.has(opening.id)) phases.set(opening.id, read.opening(opening))
  for (const room of plan.rooms) if (!phases.has(room.id)) phases.set(room.id, read.room(room))
  return phases
}

/**
 * The plan in one state: its walls, openings and rooms that stand then, with their phases as
 * stated; every other part as it is. A plan with no phases is returned as it is, and so is a
 * plan already in that state.
 */
export function planInState<P extends FloorPlan>(plan: P, state: PlanState): P {
  if (!planHasPhases(plan)) return plan
  const read = phaseReading(plan)
  const walls = plan.walls.filter((w) => standsIn(read.wall(w), state))
  const openings = plan.openings.filter((o) => standsIn(read.opening(o), state))
  const rooms = plan.rooms.filter((r) => standsIn(read.room(r), state))
  if (walls.length === plan.walls.length && openings.length === plan.openings.length && rooms.length === plan.rooms.length) return plan
  return { ...plan, walls, openings, rooms }
}

/** The ids of the parts read in this phase. */
export function idsInPhase(plan: FloorPlan, phase: Phase): Set<string> {
  const ids = new Set<string>()
  for (const [id, p] of partPhases(plan)) if (p === phase) ids.add(id)
  return ids
}

/** How many walls, openings and rooms are read in each phase; all zero for a plan with no phases. */
export function phaseCounts(plan: FloorPlan): Record<Phase, { walls: number; openings: number; rooms: number }> {
  const counts = { existing: { walls: 0, openings: 0, rooms: 0 }, demolished: { walls: 0, openings: 0, rooms: 0 }, new: { walls: 0, openings: 0, rooms: 0 } }
  if (!planHasPhases(plan)) return counts
  const read = phaseReading(plan)
  for (const wall of plan.walls) counts[read.wall(wall)].walls++
  for (const opening of plan.openings) counts[read.opening(opening)].openings++
  for (const room of plan.rooms) counts[read.room(room)].rooms++
  return counts
}

/** One part that stands when its wall does not (`phaseIssues`). */
export interface PhaseClash {
  readonly code: 'opening/phase-wall' | 'room/phase-wall'
  readonly id: string
  readonly wall: string
  /** The phase the part is read in, and its wall's. */
  readonly phase: Phase
  readonly wallPhase: Phase
  /** In English, as every drawing issue's message is; `said` is the sentence by key (MSG-11). */
  readonly message: string
  readonly said: Said
}

/** The states a phase stands in, in words (`issue.part.states.*`): "before and after the work", "only before the work". */
const statesSaid = (phase: Phase): Said => {
  const states = statesOf(phase)
  return said(states.length === 2 ? 'issue.part.states.both' : states[0] === 'before' ? 'issue.part.states.before' : 'issue.part.states.after')
}

/** A part that stands when its wall does not, as its issue says it (`issue.opening/phase-wall`, `issue.room/phase-wall`). */
function clashSaid(code: PhaseClash['code'], part: string, phase: Phase, wall: string, wallPhase: Phase): Said {
  return said(`issue.${code}`, { part: name(part), phase: said(PHASE_WORDS[phase]), states: statesSaid(phase), wall: name(wall), wallPhase: said(PHASE_WORDS[wallPhase]), wallStates: statesSaid(wallPhase) })
}

/**
 * Each opening and room that stands in a state its wall does not: a new door in a wall to be
 * demolished, an existing room round a new wall. Such a part cannot be drawn in that state, so
 * it is left out of both. None in a plan with no phases.
 */
export function phaseClashes(plan: FloorPlan): PhaseClash[] {
  if (!planHasPhases(plan)) return []
  const read = phaseReading(plan)
  const walls = new Map<string, Wall>()
  for (const wall of plan.walls) if (!walls.has(wall.id)) walls.set(wall.id, wall)
  const clashes: PhaseClash[] = []
  const missing = (phase: Phase, wall: Wall): boolean => statesOf(phase).some((state) => !standsIn(read.wall(wall), state))
  for (const opening of plan.openings) {
    const wall = walls.get(opening.wall)
    if (wall === undefined) continue
    const phase = read.opening(opening)
    if (!missing(phase, wall)) continue
    const sentence = clashSaid('opening/phase-wall', opening.id, phase, wall.id, read.wall(wall))
    clashes.push({ code: 'opening/phase-wall', id: opening.id, wall: wall.id, phase, wallPhase: read.wall(wall), message: english(sentence), said: sentence })
  }
  for (const room of plan.rooms) {
    const phase = read.room(room)
    const ids = [...new Set([...room.boundary, ...(room.holes ?? []).flat()])]
    const wall = ids.map((id) => walls.get(id)).find((w): w is Wall => w !== undefined && missing(phase, w))
    if (wall === undefined) continue
    const sentence = clashSaid('room/phase-wall', room.id, phase, wall.id, read.wall(wall))
    clashes.push({ code: 'room/phase-wall', id: room.id, wall: wall.id, phase, wallPhase: read.wall(wall), message: english(sentence), said: sentence })
  }
  return clashes
}

/** A base plan read into a fit-out (`mergeBase`). */
export interface BaseMerge {
  /** The fit-out with the base's walls and openings in it, as existing. */
  readonly plan: FloorPlan
  /** The ids of the walls and openings that came from the base: read-only. */
  readonly walls: ReadonlySet<string>
  readonly openings: ReadonlySet<string>
  /** WRT-75: the ids of the floors that came from the base, which the fit-out does not list. */
  readonly floors: ReadonlySet<string>
  /** Base parts whose ids the fit-out uses for a part of its own. */
  readonly clashes: readonly string[]
}

/**
 * A fit-out with its base: the base's walls and openings as they stand after its own work, each
 * read as existing, after the fit-out's own; the base's floors the fit-out does not list. The
 * base's rooms are not read: the fit-out says what its rooms are. `base` must have its opening
 * patterns expanded already.
 */
export function mergeBase(plan: FloorPlan, base: FloorPlan): BaseMerge {
  const shell = planInState(base, 'after')
  const own = new Set<string>([...plan.walls, ...plan.openings, ...plan.rooms, ...(plan.items ?? []), ...(plan.stairs ?? [])].map((part) => part.id))
  const clashes = [...new Set([...shell.walls, ...shell.openings].map((part) => part.id).filter((id) => own.has(id)))]
  const walls = shell.walls.map((wall): Wall => ({ ...wall, phase: 'existing' }))
  const openings = shell.openings.map((opening): Opening => ({ ...opening, phase: 'existing' }))
  const floorIds = new Set((plan.floors ?? []).map((floor) => floor.id))
  const floors = [...(plan.floors ?? []), ...(shell.floors ?? []).filter((floor) => !floorIds.has(floor.id))]
  const merged: FloorPlan = {
    ...plan,
    walls: [...plan.walls, ...walls],
    openings: [...plan.openings, ...openings],
    ...(floors.length > 0 ? { floors } : {}),
  }
  const fromBase = new Set((shell.floors ?? []).map((floor) => floor.id).filter((id) => !floorIds.has(id)))
  return { plan: merged, walls: new Set(walls.map((w) => w.id)), openings: new Set(openings.map((o) => o.id)), floors: fromBase, clashes }
}

/**
 * The corners of walls of a plan with phases, each state's joined among its own walls: the walls
 * that stand after the work together, and each wall to be demolished with the walls that stand
 * before it. With no phases, `wallJoints` of them all.
 */
export function phasedJoints(walls: readonly Wall[], phases: ReadonlyMap<string, Phase>): ReadonlyMap<string, WallEnds> {
  if (phases.size === 0) return wallJoints(walls)
  const after = wallJoints(walls.filter((w) => phases.get(w.id) !== 'demolished'))
  if (!walls.some((w) => phases.get(w.id) === 'demolished')) return after
  const before = wallJoints(walls.filter((w) => phases.get(w.id) !== 'new'))
  const joints = new Map(after)
  for (const wall of walls) {
    const ends = before.get(wall.id)
    if (phases.get(wall.id) === 'demolished' && ends !== undefined) joints.set(wall.id, ends)
  }
  return joints
}
