/**
 * ARE-75: the building before the work, after it, and the two side by side.
 *
 * `planAsItStands` is a plan with phases read in one state as a plan of one state: the walls,
 * openings and rooms that stand then (`planInState`), with every phase and the base taken off, so
 * a reader that reads phases (the schedules' removals, the drawing's dashes, the fields' phase)
 * reads that building alone. `loadedInState` is a loaded plan with it. A plan with no phases is
 * given back as it is. Both are new objects, kept with a frozen plan version (CMD-51), so a
 * survey of the state is kept between calls as the plan's own is; nothing here changes a plan.
 *
 * `phaseAreas` is the area table of the work: `planAreas` of the building before and after,
 * joined room by room (a room keeps its id through the work), by use and by floor, with the
 * change, after less before. Pure: plans in, figures out.
 */
import { phaseReading, planHasPhases, planInState, type FloorPlan, type PlanState } from '@ongrid/floorplan/geometry'
import { keptFor } from '@ongrid/floorplan/geometry/kept'
import type { Phase } from '@ongrid/floorplan/types/floorplan'
import type { LoadedPlan } from '../command/plan'
import { planAreas, type AreasRequest, type PlanAreas, type RoomArea } from './areas'
import { surveyPlan } from './survey'

/** The plan as it stands in one state, a plan of that state alone: no part states a phase, and no base is named. */
export function planAsItStands<P extends FloorPlan>(plan: P, state: PlanState): P {
  if (!planHasPhases(plan)) return plan
  return keptFor(plan, `stood ${state}`, () => {
    const inState = planInState(plan, state)
    const plain = <T extends { readonly phase?: Phase }>(part: T): T => {
      if (part.phase === undefined) return part
      const own: { phase?: Phase } = { ...part }
      delete own.phase
      return own as T
    }
    const stood: { base?: unknown } = { ...inState, walls: inState.walls.map(plain), openings: inState.openings.map(plain), rooms: inState.rooms.map(plain) }
    delete stood.base
    return stood as P
  })
}

/**
 * A loaded plan read in one state (`planAsItStands`): everything else it holds as it was read; no
 * base, which is read in already. With `phases` kept, its parts keep their phases and the base
 * (`planInState`), for a drawing that marks them: the demolition plan, the proposed plan.
 */
export function loadedInState(loaded: LoadedPlan, state: PlanState, phases: 'plain' | 'kept' = 'plain'): LoadedPlan {
  if (!planHasPhases(loaded.plan)) return loaded
  return keptFor(loaded, `stood ${state} ${phases}`, () => {
    const own = Object.getOwnPropertyDescriptors(loaded) as PropertyDescriptorMap
    const read = <P extends FloorPlan>(plan: P): P => (phases === 'kept' ? planInState(plan, state) : planAsItStands(plan, state))
    if (phases === 'plain') delete own['base']
    own['plan'] = { value: read(loaded.plan), enumerable: true }
    if (loaded.stated !== undefined) own['stated'] = { value: read(loaded.stated), enumerable: true }
    return Object.defineProperties({}, own) as LoadedPlan
  })
}

/** One figure before and after the work, and the change: null where a side has none. */
export interface Change {
  readonly existing: number | null
  readonly proposed: number | null
  readonly change: number | null
}

/** One room's net area before and after the work. */
export interface RoomChange extends Change {
  readonly floor: string
  readonly id: string
  readonly name: string
  readonly use: string | null
  /** The room's phase: existing (it stands before and after), demolished (before only) or new (after only). */
  readonly phase: Phase
}

export interface PhaseAreas {
  readonly rooms: readonly RoomChange[]
  /** By use, the uses in the order first met before, then after. */
  readonly byUse: Readonly<Record<string, Change>>
  readonly floors: readonly (Change & { readonly floor: string })[]
  readonly net: Change
  readonly grossInternal: Change
  readonly grossExternal: Change
  /** The two measures in full, for whatever else a caller needs from them. */
  readonly before: PlanAreas
  readonly after: PlanAreas
}

/** The change from one figure to another, to the square centimetre. */
function changeOf(existing: number | null, proposed: number | null): Change {
  return { existing, proposed, change: existing === null || proposed === null ? null : Math.round((proposed - existing) * 1e4) / 1e4 }
}

const roomsOf = (areas: PlanAreas): RoomArea[] => areas.floors.flatMap((floor) => [...floor.rooms])

/** The area table of the work: each room, use, floor and total before (existing), after (proposed) and the change. */
export function phaseAreas(stated: FloorPlan, request: AreasRequest = {}): PhaseAreas {
  // Each measured as the plan as it stands then, as grid_areas state=before and state=after measure it.
  const before = planAreas(surveyPlan(planAsItStands(stated, 'before')), request)
  const after = planAreas(surveyPlan(planAsItStands(stated, 'after')), request)
  const read = phaseReading(stated)
  const phases = new Map(stated.rooms.map((room) => [room.id, read.room(room)] as const))
  const key = (room: RoomArea): string => `${room.floor}\u0000${room.id}`
  const was = new Map(roomsOf(before).map((room) => [key(room), room] as const))
  const now = new Map(roomsOf(after).map((room) => [key(room), room] as const))
  const rooms: RoomChange[] = []
  for (const room of [...was.values(), ...[...now.values()].filter((r) => !was.has(key(r)))]) {
    const earlier = was.get(key(room))
    const later = now.get(key(room))
    const phase = phases.get(room.id) ?? 'existing'
    // A room that does not stand in a state has no floor then: 0, so its change is all of it.
    const side = (one: RoomArea | undefined, stands: boolean): number | null => (one === undefined ? (stands ? null : 0) : one.net)
    rooms.push({ floor: room.floor, id: room.id, name: (later ?? room).name, use: (later ?? room).use, phase, ...changeOf(side(earlier, phase !== 'new'), side(later, phase !== 'demolished')) })
  }
  const uses = [...new Set([...Object.keys(before.byUse), ...Object.keys(after.byUse)])]
  const byUse = Object.fromEntries(uses.map((use) => [use, changeOf(before.byUse[use] ?? 0, after.byUse[use] ?? 0)]))
  const floorIds = [...new Set([...before.floors.map((f) => f.floor), ...after.floors.map((f) => f.floor)])]
  const floors = floorIds.map((floor) => ({ floor, ...changeOf(before.floors.find((f) => f.floor === floor)?.net ?? 0, after.floors.find((f) => f.floor === floor)?.net ?? 0) }))
  return {
    rooms,
    byUse,
    floors,
    net: changeOf(before.net, after.net),
    grossInternal: changeOf(before.grossInternal, after.grossInternal),
    grossExternal: changeOf(before.grossExternal, after.grossExternal),
    before,
    after,
  }
}
