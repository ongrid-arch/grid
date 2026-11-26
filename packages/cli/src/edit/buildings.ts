/**
 * A building of the plan set (LVL-23, `grid_set_building`): added, changed (its name, its pad, its
 * floors) or taken out. A patch of the plan's own `buildings` (C23), as every change is, checked by
 * the same rules as a rooms text building line: each floor one the plan has, and in one building
 * at most. Taking a building out takes out no floor: its floors are in no building again.
 */
import { planBuildings, planFloors } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'

/** What a call says about a building: every field but `id` is left out when not given. */
export interface BuildingRequest {
  readonly id: string
  readonly name?: string
  /** The level of its own ground, in metres from the plan's datum. */
  readonly pad?: number
  readonly floors?: readonly string[]
  readonly remove?: boolean
}

type Building = NonNullable<FloorPlan['buildings']>[number]

const M = (v: number): string => `${Math.round(v * 1000) / 1000 + 0} m`
const list = (ids: readonly string[]): string => (ids.length > 20 ? `${ids.slice(0, 20).join(', ')} and ${ids.length - 20} more` : ids.join(', '))

/** The floors refused: one the plan does not have, or one another building holds. */
function checkFloors(plan: FloorPlan, id: string, floors: readonly string[]): void {
  const known = planFloors(plan).map((f) => f.id)
  const unknown = floors.filter((f) => !known.includes(f))
  if (unknown.length > 0) throw new EditRefused(`The plan has no floor ${list(unknown)}. Its floors: ${list(known)}.`)
  const twice = floors.filter((f, i) => floors.indexOf(f) !== i)
  if (twice.length > 0) throw new EditRefused(`floors names ${list([...new Set(twice)])} twice.`)
  for (const other of planBuildings(plan)) {
    if (other.id === id) continue
    const shared = floors.filter((f) => other.floors.includes(f))
    if (shared.length > 0) throw new EditRefused(`Floor ${list(shared)} is in building ${other.id} already, and a floor is in one building at most: take it out of ${other.id} first (grid_set_building id ${other.id} with its other floors).`)
  }
}

/** What the building is, for the answer. */
const described = (b: Building): string => `${b.name === undefined ? '' : `"${b.name}", `}floors ${list(b.floors)}${b.pad === undefined ? '' : `, on a pad at ${M(b.pad)}`}`

/** One building added, changed or taken out, by id. */
export function setBuilding(survey: Survey, request: BuildingRequest): Patch {
  const plan = survey.plan
  const buildings = plan.buildings ?? []
  const at = buildings.findIndex((b) => b.id === request.id)
  const given = (['name', 'pad', 'floors'] as const).filter((k) => request[k] !== undefined)
  if (request.remove === true) {
    if (at < 0) throw new EditRefused(`The plan has no building with the id ${request.id}. ${buildings.length === 0 ? 'It names none.' : `Its buildings: ${list(buildings.map((b) => b.id))}.`}`)
    if (given.length > 0) throw new EditRefused(`remove takes nothing else: leave out ${given.join(', ')}.`)
    const left = buildings.filter((_, i) => i !== at)
    return { ...emptyPatch([`Took building ${request.id} out of the plan; its floors are in no building now, and stack with the floors no building names.`]), plan: { buildings: left.length === 0 ? null : left }, extra: { building: request.id } }
  }
  if (request.floors !== undefined && request.floors.length === 0) throw new EditRefused('floors takes the ids of one floor or more.')
  if (at < 0) {
    if (request.floors === undefined) throw new EditRefused(`The plan has no building ${request.id}: to add it, give its floors, the ids of the floors that are its own.`)
    checkFloors(plan, request.id, request.floors)
    const made: Building = { id: request.id, ...(request.name === undefined ? {} : { name: request.name }), floors: [...request.floors], ...(request.pad === undefined ? {} : { pad: request.pad }) }
    return { ...emptyPatch([`Added building ${request.id}: ${described(made)}.${made.pad === undefined ? '' : ' Its floors that state no elevation stack from its pad.'}`]), plan: { buildings: [...buildings, made] }, extra: { building: request.id } }
  }
  if (given.length === 0) throw new EditRefused('Give what changes: name, pad or floors; or remove.')
  const old = buildings[at]!
  if (request.floors !== undefined) checkFloors(plan, request.id, request.floors)
  const next: Building = {
    id: old.id,
    ...((request.name ?? old.name) === undefined ? {} : { name: request.name ?? old.name! }),
    floors: [...(request.floors ?? old.floors)],
    ...((request.pad ?? old.pad) === undefined ? {} : { pad: request.pad ?? old.pad! }),
  }
  const parts: string[] = []
  if (next.name !== old.name) parts.push(`its name, now "${next.name}"`)
  if (next.pad !== old.pad) parts.push(old.pad === undefined ? `a pad at ${M(next.pad!)}` : `its pad ${M(old.pad)} to ${M(next.pad!)}`)
  if (next.floors.join(' ') !== old.floors.join(' ')) parts.push(`its floors, now ${list(next.floors)}`)
  return {
    ...emptyPatch([`Changed building ${old.id}: ${parts.length === 0 ? 'nothing, it is so already' : parts.join('; ')}.`]),
    plan: { buildings: buildings.map((b, i) => (i === at ? next : b)) },
    extra: { building: old.id },
  }
}
