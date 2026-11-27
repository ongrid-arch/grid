/**
 * CNT-15 (C24): the plan's named wall, door and window types, and the rooms' finishes, as the
 * readers ask for them: the type a part takes, its material, and what the drawing's check says
 * about the types list.
 *
 * The reading has already filled every part from its type (`withTypes` in `types/floorplan.ts`),
 * so a reader that only needs a wall's thickness or a door's size reads the part. This file is
 * for what the type carries that no part does: its name, whether it is glazed and its material.
 *
 * Grid checks no material and no finish. Pure: a plan in, plain data out.
 */
import type { DoorType, FloorPlan, Opening, Room, Wall, WallType, WindowType } from '../types/floorplan'
import { FINISH_SURFACES, type FinishSurface } from '../types/floorplan'
import { likelyId } from '../types/nearest'
import { english, joined, name, said, type MessageKey, type Said } from '../messages/say'
import { isFloorSlice } from './floors'
import { withSaid } from './issueWords'
import type { Issue } from './validate'

export { FINISH_SURFACES, type FinishSurface }

/** The lists of `types`, by the part that names one. */
export type TypeList = 'walls' | 'doors' | 'windows'

/** A list's types by id; the first of an id is the one read. */
function byId<T extends { readonly id: string }>(list: readonly T[] | undefined): ReadonlyMap<string, T> {
  const out = new Map<string, T>()
  for (const type of list ?? []) if (!out.has(type.id)) out.set(type.id, type)
  return out
}

export const planWallTypes = (plan: Pick<FloorPlan, 'types'>): ReadonlyMap<string, WallType> => byId(plan.types?.walls)
export const planDoorTypes = (plan: Pick<FloorPlan, 'types'>): ReadonlyMap<string, DoorType> => byId(plan.types?.doors)
export const planWindowTypes = (plan: Pick<FloorPlan, 'types'>): ReadonlyMap<string, WindowType> => byId(plan.types?.windows)

/** Whether the plan holds any named type. */
export function planHasTypes(plan: Pick<FloorPlan, 'types'>): boolean {
  const types = plan.types
  return (types?.walls?.length ?? 0) + (types?.doors?.length ?? 0) + (types?.windows?.length ?? 0) > 0
}

/** The wall type a wall takes, named or by default (`wallType` after the reading), or null. A dividing line takes none. */
export function wallTypeOf(plan: Pick<FloorPlan, 'types'>, wall: Pick<Wall, 'wallType' | 'virtual'>): WallType | null {
  if (wall.virtual === true || wall.wallType === undefined) return null
  return planWallTypes(plan).get(wall.wallType) ?? null
}

/** The door or window type an opening takes, or null. A doorless opening takes none. */
export function openingTypeOf(plan: Pick<FloorPlan, 'types'>, opening: Pick<Opening, 'type' | 'doorType' | 'windowType'>): DoorType | WindowType | null {
  if (opening.type === 'door') return opening.doorType === undefined ? null : planDoorTypes(plan).get(opening.doorType) ?? null
  if (opening.type === 'window') return opening.windowType === undefined ? null : planWindowTypes(plan).get(opening.windowType) ?? null
  return null
}

/** VEW-78: a material named as glass ("Glass", "Clear glazing"), in the plan's own words. */
const GLASS_MATERIAL = /\b(glass|glazed|glazing)\b/i

/** VEW-78: whether a type says it is glass: `glazed`, else a glass material; null when it says neither. */
function typeIsGlass(type: { readonly glazed?: boolean | undefined; readonly material?: string | undefined } | null): boolean | null {
  if (type === null) return null
  if (type.glazed !== undefined) return type.glazed
  return type.material !== undefined && GLASS_MATERIAL.test(type.material) ? true : null
}

/**
 * VEW-78: whether a door or window is glazed, as the 3D view draws it and the sun table and the
 * eye view's window list count it. A window is, unless its type says it is not; a door only when
 * its type says it is (`glazed`, or a glass material). A doorless opening is a hole, not glass.
 */
export function openingGlazed(plan: Pick<FloorPlan, 'types'>, opening: Pick<Opening, 'type' | 'doorType' | 'windowType'>): boolean {
  if (opening.type === 'opening') return false
  const stated = typeIsGlass(openingTypeOf(plan, opening))
  return stated ?? opening.type === 'window'
}

/** VEW-78: whether a wall is glass (a curtain wall, a glazed partition): its type says so. */
export function wallGlazed(plan: Pick<FloorPlan, 'types'>, wall: Pick<Wall, 'wallType' | 'virtual'>): boolean {
  return typeIsGlass(wallTypeOf(plan, wall)) === true
}

/** A type's material as the person names it, or null when it states none. */
export function typeMaterial(type: { readonly material?: string | undefined } | null): string | null {
  return type?.material ?? null
}

/** The four finishes a room names, each null when it names none. */
export function roomFinishes(room: Pick<Room, 'finishes'>): Readonly<Record<FinishSurface, string | null>> {
  // CNT-51: skirting false is no skirting, so no named one.
  return Object.fromEntries(FINISH_SURFACES.map((surface) => { const finish = room.finishes?.[surface]; return [surface, typeof finish === 'string' ? finish : null] })) as Record<FinishSurface, string | null>
}

/** CNT-51 (C24): whether the room or zone states it has no skirting. */
export function roomHasNoSkirting(room: Pick<Room, 'finishes'>): boolean {
  return room.finishes?.skirting === false
}

/** Whether any room or zone of the plan names a finish, a finished face or a band, or states no skirting. */
export function planHasFinishes(plan: Pick<FloorPlan, 'rooms'>): boolean {
  return plan.rooms.some((room) => FINISH_SURFACES.some((surface) => room.finishes?.[surface] !== undefined) || (room.finishes?.faces?.length ?? 0) > 0 || (room.finishes?.bands?.length ?? 0) > 0)
}

// ---------------------------------------------------------------------------------------------
// What the drawing's check says (MSG-11: `issue.type/*`)

const typeIssue = (entity: Issue['entity'], id: string, code: string, sentence: Said): Issue =>
  withSaid({ entity, id, code, message: english(sentence), severity: 'warning' }, sentence)

/** What follows the sentence: the types the list holds, or the one most likely meant. */
function moreSaid(id: string, known: readonly string[]): Said {
  if (known.length === 0) return said('issue.part.types.none')
  const meant = likelyId(id, known)
  return meant === null ? said('issue.part.types.list', { types: joined(known.map(name), 'join.comma') }) : said('issue.part.types.meant', { meant: name(meant) })
}

const LIST_OF_PART = { wall: 'walls', door: 'doors', window: 'windows' } as const

/**
 * The types list's own faults (CNT-15): a type listed twice, a part or a default that names a
 * type the plan does not hold, and a type on a part that takes none (a dividing line, a window
 * naming a door type). Each is worth a look; the part is read as taking no type. Run on the whole
 * plan only, as the flats are: a slice holds the same types.
 */
export function typeIssues(plan: FloorPlan): Issue[] {
  // A part may name a type in a plan that holds none: that is said too.
  if (isFloorSlice(plan)) return []
  const issues: Issue[] = []
  const lists: Record<TypeList, readonly { readonly id: string }[]> = { walls: plan.types?.walls ?? [], doors: plan.types?.doors ?? [], windows: plan.types?.windows ?? [] }
  const known: Record<TypeList, string[]> = { walls: [], doors: [], windows: [] }
  for (const list of ['walls', 'doors', 'windows'] as const) {
    const seen = new Set<string>()
    for (const type of lists[list]) {
      if (seen.has(type.id)) issues.push(typeIssue('plan', type.id, 'type/duplicate-id', said(`issue.type/duplicate-id.${list}` as MessageKey, { type: name(type.id) })))
      else known[list].push(type.id)
      seen.add(type.id)
    }
  }
  const has = (list: TypeList, id: string): boolean => known[list].includes(id)
  for (const wall of plan.walls) {
    if (wall.wallType === undefined) continue
    if (wall.virtual === true) {
      issues.push(typeIssue('wall', wall.id, 'type/wrong-part', said('issue.type/wrong-part', { part: name(wall.id), type: name(wall.wallType) })))
      continue
    }
    if (!has('walls', wall.wallType)) issues.push(typeIssue('wall', wall.id, 'type/unknown', said('issue.type/unknown', { part: name(wall.id), type: name(wall.wallType), more: moreSaid(wall.wallType, known.walls) })))
  }
  for (const opening of plan.openings) {
    for (const [field, part] of [['doorType', 'door'], ['windowType', 'window']] as const) {
      const id = opening[field]
      if (id === undefined) continue
      if (opening.type !== part) {
        issues.push(typeIssue('opening', opening.id, 'type/wrong-part', said(`issue.type/wrong-part.${part}`, { part: name(opening.id), type: name(id) })))
        continue
      }
      const list = LIST_OF_PART[part]
      if (!has(list, id)) issues.push(typeIssue('opening', opening.id, 'type/unknown', said(`issue.type/unknown.${part}`, { part: name(opening.id), type: name(id), more: moreSaid(id, known[list]) })))
    }
  }
  const defaults = plan.types?.defaults
  const namedDefaults: [TypeList, string | undefined][] = [
    ...Object.values(defaults?.walls ?? {}).map((id): [TypeList, string | undefined] => ['walls', id]),
    ['doors', defaults?.door],
    ['windows', defaults?.window],
  ]
  const told = new Set<string>()
  for (const [list, id] of namedDefaults) {
    if (id === undefined || has(list, id) || told.has(`${list}|${id}`)) continue
    told.add(`${list}|${id}`)
    issues.push(typeIssue('plan', id, 'type/unknown', said(`issue.type/unknown.default.${list}` as MessageKey, { type: name(id), more: moreSaid(id, known[list]) })))
  }
  return issues
}
