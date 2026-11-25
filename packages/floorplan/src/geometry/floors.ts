/**
 * Floors (storeys) — C5.
 *
 * A plan is a stack of floors sharing one origin and one coordinate system.
 * Walls and rooms name their floor; openings inherit their wall's. There is no
 * z here: slicing a plan to one floor is how the views show a storey, and each
 * one still rises from z = 0 (C4).
 *
 * Slicing rather than passing a floor id into every builder is deliberate: it
 * means no loop can forget to filter, so cross-floor bleed is impossible by
 * construction rather than by discipline.
 */
import { DEFAULT_FLOOR_ID, type BuildingType, type Floor } from '../types/floorplan'
import type { FloorPlan, Opening, Wall } from './plan'
import { hasWallsThrough, storeyWalls, throughFloorParts, wallStandsOn } from './through'
import { sliceColumns } from './columns'
import { DEFAULT_LANGUAGE, GROUND_FLOOR_NAME, groundFloorName, type Language } from '../messages/languages'

/** The floor every entity belongs to until it says otherwise, named in English. */
export const DEFAULT_FLOOR: Floor = { id: DEFAULT_FLOOR_ID, name: GROUND_FLOOR_NAME.en, level: 0 }

/** MSG-22: the floor every entity belongs to, named in the plan's language (`display.language`). */
export function groundFloor(plan: Pick<FloorPlan, 'display'>): Floor {
  const language = plan.display?.language ?? DEFAULT_LANGUAGE
  return language === DEFAULT_LANGUAGE ? DEFAULT_FLOOR : { ...DEFAULT_FLOOR, name: groundFloorName(language) }
}

/**
 * MSG-22: the plan as read in a language asked of a command or a tool, so the floor it names in
 * no list (`groundFloor`) is named in that language. The same plan when the language is the
 * plan's own, or when every floor it stands on has its own name. Nothing else changes: the
 * display's language is the one the words are written in anyway.
 */
export function spokenIn<T extends FloorPlan>(plan: T, language: Language | undefined): T {
  if (language === undefined || language === (plan.display?.language ?? DEFAULT_LANGUAGE)) return plan
  if ((plan.floors ?? []).some((floor) => floor.id === DEFAULT_FLOOR_ID)) return plan
  return { ...plan, display: { ...plan.display, language } }
}

/** The floor an entity belongs to. Unstated means the ground floor (C5). */
export function floorOf(entity: { readonly floor?: string }): string {
  return entity.floor ?? DEFAULT_FLOOR_ID
}

/**
 * Every floor the plan actually has.
 *
 * The registry names and orders them; entities make them reachable. Both
 * sources are needed: registry alone would let one forgotten entry hide real
 * geometry with no way to reach it, and derivation alone has no names, no
 * stable order, and cannot express a storey the user asked for but has not
 * filled yet.
 *
 * Registry entries come first, ordered by `level` (stable within a tie).
 * Floors only an entity names are appended in first-appearance order — there is
 * no level to sort them by, and appending keeps them visible rather than
 * guessing where they belong.
 */
export function planFloors(plan: FloorPlan): Floor[] {
  const registry: Floor[] = []
  const seen = new Set<string>()

  for (const floor of plan.floors ?? []) {
    if (seen.has(floor.id)) continue // first entry wins; the duplicate is reported by validation
    seen.add(floor.id)
    registry.push(floor)
  }

  // Stable: Array.prototype.sort is stable, so equal levels keep registry order.
  registry.sort((a, b) => a.level - b.level)

  const derived: Floor[] = []
  for (const entity of [...plan.walls, ...plan.rooms]) {
    const id = floorOf(entity)
    if (seen.has(id)) continue
    seen.add(id)
    // No registry entry, so no name of its own. The id is the best label there is.
    derived.push(id === DEFAULT_FLOOR_ID ? groundFloor(plan) : { id, name: id, level: 0 })
  }

  const all = [...registry, ...derived]
  return all.length > 0 ? all : [groundFloor(plan)]
}

/**
 * CNT-5: what kind of building a floor is: its own `building`, else the plan's, else undefined
 * (the plan does not say). The first floor entry with the id wins, as in `planFloors`.
 */
export function floorBuilding(plan: Pick<FloorPlan, 'building' | 'floors'>, floorId: string): BuildingType | undefined {
  return (plan.floors ?? []).find((floor) => floor.id === floorId)?.building ?? plan.building
}

/** CNT-5: whether a floor's kind of building is its own, not the plan's. */
export function floorStatesBuilding(plan: Pick<FloorPlan, 'floors'>, floorId: string): boolean {
  return (plan.floors ?? []).find((floor) => floor.id === floorId)?.building !== undefined
}

/**
 * A floor id the plan really has: `requested` when present, otherwise the
 * lowest floor.
 *
 * Resolving on every read instead of syncing state means a stale id — a floor
 * the assistant deleted, or one left over from another project — is harmless
 * and needs no effect to clean up.
 */
export function resolveFloor(plan: FloorPlan, requested?: string | null): string {
  const floors = planFloors(plan)
  if (requested && floors.some((floor) => floor.id === requested)) return requested
  return floors[0]?.id ?? DEFAULT_FLOOR_ID
}

/**
 * The floor the views open on when none is picked: the ground floor, that is
 * the first floor at level 0, else the lowest floor above ground, else the
 * lowest. A basement opens first only in a plan that is all basement.
 *
 * `resolveFloor` keeps falling back to the lowest floor: the export reads it.
 */
export function defaultFloor(plan: FloorPlan): string {
  const floors = planFloors(plan)
  const ground = floors.find((floor) => floor.level === 0)
  if (ground) return ground.id

  const above = floors.filter((floor) => floor.level > 0)
  const candidates = above.length > 0 ? above : floors
  let lowest = candidates[0]
  for (const floor of candidates) if (lowest && floor.level < lowest.level) lowest = floor
  return lowest?.id ?? DEFAULT_FLOOR_ID
}

/**
 * The floor the views show: `requested` when the plan has it, otherwise
 * `defaultFloor`. Resolved on every read, like `resolveFloor`, so a stale id
 * needs no cleanup.
 */
export function viewFloor(plan: FloorPlan, requested?: string | null): string {
  if (requested && planFloors(plan).some((floor) => floor.id === requested)) return requested
  return defaultFloor(plan)
}

/** Wall ids that name more than one wall, so they resolve to no single storey. */
function collidingWallIds(plan: FloorPlan): ReadonlySet<string> {
  const seen = new Set<string>()
  const collided = new Set<string>()
  for (const wall of plan.walls) {
    if (seen.has(wall.id)) collided.add(wall.id)
    else seen.add(wall.id)
  }
  return collided
}

/**
 * The plan restricted to one floor.
 *
 * Walls, rooms and items by their own floor, openings by their wall's — so an opening
 * whose wall is elsewhere is dropped rather than left orphaned. `version`,
 * `units`, the registry and the reference image carry over untouched.
 *
 * Exact id match: resolve the id with `resolveFloor` first.
 *
 * One exception to the slices partitioning the plan: an opening on a wall id
 * that names walls on several storeys is dropped from every slice.
 * Matching by id alone would otherwise draw the same door on each of those
 * floors, which is worse than drawing it nowhere — and `validatePlan` reports
 * the collision as `plan/duplicate-id` so it is not silent.
 */
export function planForFloor(plan: FloorPlan, floorId: string): FloorPlan {
  // LVL-5 (C19): a wall through floors stands on each floor it rises through, as its stretch
  // there, with the part of each of its openings that lies in it (`throughFloorParts`).
  if (hasWallsThrough(plan)) {
    const parts = throughFloorParts(plan, floorId)
    return cutFloor(plan, floorId, parts.walls, parts.openings)
  }
  const walls = plan.walls.filter((wall) => floorOf(wall) === floorId)
  return cutFloor(plan, floorId, walls, plan.openings)
}

/**
 * LVL-5: one floor's slice as the storeys are stacked from it (`floorElevations`): a wall through
 * floors stands only on the floor it rises through, as a wall of that floor, without its openings
 * (`storeyWalls`). A plan with no such wall slices as `planForFloor` does.
 */
export function storeySlice(plan: FloorPlan, floorId: string): FloorPlan {
  if (!hasWallsThrough(plan)) return planForFloor(plan, floorId)
  const walls = storeyWalls(plan, floorId)
  const plain = new Set(walls.filter((wall) => wall.through === undefined).map((wall) => wall.id))
  const sharedIds = new Set(plan.walls.filter((wall) => wall.through !== undefined).map((wall) => wall.id))
  return cutFloor(plan, floorId, walls, plan.openings.filter((o) => plain.has(o.wall) && !sharedIds.has(o.wall)))
}

/**
 * The walls standing on a floor, as its slice holds them: `planForFloor(plan, floor).walls`, read
 * without cutting the rest when no wall rises through floors.
 */
export function wallsOnFloor(plan: FloorPlan, floorId: string): Wall[] {
  if (!hasWallsThrough(plan)) return plan.walls.filter((wall) => floorOf(wall) === floorId)
  return throughFloorParts(plan, floorId).walls
}

/** Whether a wall stands on a floor: its own, or (LVL-5) one it rises through. */
export { wallStandsOn }

function cutFloor(plan: FloorPlan, floorId: string, walls: readonly Wall[], candidates: readonly Opening[]): FloorPlan {
  const wallIds = new Set(walls.map((wall) => wall.id))
  const collided = collidingWallIds(plan)

  // LVL-8: a slice holds plain openings only. A pattern names a wall on one floor and repeats on
  // others, so it is expanded on the whole plan (`expandPatterns`), never on a slice.
  const { patterns: _patterns, ...whole } = plan
  void _patterns
  const slice: FloorPlan = {
    ...whole,
    walls: [...walls],
    rooms: plan.rooms.filter((room) => floorOf(room) === floorId),
    openings: candidates.filter(
      (opening) => wallIds.has(opening.wall) && !collided.has(opening.wall)
    ),
    // CNT-12: an item by its own floor. A plan with no items keeps no key.
    ...(plan.items !== undefined && { items: plan.items.filter((item) => floorOf(item) === floorId) }),
    // CNT-16: a column on each floor it stands on, as a column of that floor (`sliceColumns`).
    ...(plan.columns !== undefined && { columns: sliceColumns(plan, floorId) }),
    // CNT-19: a parking bay by its own floor. A ramp, as a stair, is kept whole on every slice.
    ...(plan.bays !== undefined && { bays: plan.bays.filter((bay) => floorOf(bay) === floorId) }),
    // SHT-7: a sketch item by its own floor; a note by its room's, or its own when at a point.
    ...(plan.sketch !== undefined && { sketch: plan.sketch.filter((item) => floorOf(item) === floorId) }),
    ...(plan.annotations !== undefined && {
      annotations: plan.annotations.filter((note) =>
        note.room !== undefined ? plan.rooms.some((room) => room.id === note.room && floorOf(room) === floorId) : floorOf(note) === floorId
      )
    })
  }
  // A slice of a slice still leads back to the plan the first was cut from.
  slices.set(slice, { whole: slices.get(plan)?.whole ?? plan, floor: floorId })
  return slice
}

/**
 * Every plan `planForFloor` returned, with the plan it was cut from and its floor, held weakly:
 * nothing about the slice itself changes.
 */
const slices = new WeakMap<FloorPlan, { readonly whole: FloorPlan; readonly floor: string }>()

/**
 * The whole plan a floor's slice was cut from, and the slice's floor; a plan that is no slice is
 * its own whole, with no floor. A stair (LVL-3) joins two floors, so a slice reads it from here.
 */
export function wholePlan(plan: FloorPlan): { readonly whole: FloorPlan; readonly floor: string | null } {
  const found = slices.get(plan)
  return found === undefined ? { whole: plan, floor: null } : found
}

/**
 * Whether `plan` is one floor's slice (`planForFloor`). A slice keeps the whole floor list but
 * only one floor's parts, so a check that sets floors against each other (LVL-1: an empty top
 * floor) would read the others as empty. Such checks run on the whole plan only.
 */
export function isFloorSlice(plan: FloorPlan): boolean {
  return slices.has(plan)
}

/** Whether the floor has anything to draw. Cheaper than slicing. */
export function floorHasGeometry(plan: FloorPlan, floorId: string): boolean {
  return (
    plan.walls.some((wall) => wallStandsOn(plan, wall, floorId)) ||
    plan.rooms.some((room) => floorOf(room) === floorId) ||
    // BRF-4 (C17): a floor's stated outline is something drawn on it, before any wall.
    (plan.floors?.some((floor) => floor.id === floorId && floor.outline !== undefined) ?? false)
  )
}
