/**
 * WRT-73 (C16): marking phases without hand-editing the file.
 *
 * - `startWorks`: every wall, door, window and room that states no phase is marked `existing`,
 *   so the building as it stands is the "before" and every later edit is the work
 *   (`phasedPatch` in `phases.ts` reads a plan that states a phase that way).
 * - `setPhase`: parts marked `existing`, `demolished` or `new`, by id or by room. A room takes
 *   the walls only it uses, never one another room still needs, and the doors and windows in them.
 * - `phasedPlanFrom`: two plans, the building before and after the work, written as one plan with
 *   phases. Pure: raw plans in, a raw plan and its account out.
 *
 * Self-contained: nothing here changes how an edit makes work.
 */
import { phaseReading, planHasPhases, type FloorPlan, type Room } from '@ongrid/floorplan/geometry'
import type { Phase } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import { emptyPatch, listed, type OpeningChange, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

export const PHASES: readonly Phase[] = ['existing', 'demolished', 'new']

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`

/** "3 walls, 2 doors or windows and 2 rooms", leaving out what is none. */
function counted(walls: number, openings: number, rooms: number): string {
  const parts = [walls > 0 ? count(walls, 'wall') : '', openings > 0 ? `${openings} door${openings === 1 ? '' : 's'} or window${openings === 1 ? '' : 's'}` : '', rooms > 0 ? count(rooms, 'room') : ''].filter((p) => p !== '')
  return parts.length === 0 ? 'nothing' : listed(parts, 3)
}

/** The walls round a room, its holes' too. */
const wallsOf = (room: Room): string[] => [...new Set([...room.boundary, ...(room.holes ?? []).flat()])]

/**
 * Every wall, opening and room that states no phase is marked existing; a door or window with
 * none on a wall that states demolished or new goes with its wall, and is left to. `plan` is the plan as stated, every phase in it (a survey reads only the building after the work). A plan fitted out in a
 * base is refused: its own parts are the work, and the base is read as existing already.
 */
export function startWorks(plan: FloorPlan): Patch {
  if (plan.base !== undefined) throw new EditRefused('This plan is fitted out in a base plan, whose parts are read as existing already and whose own parts are the work: there is nothing to mark.')
  const walls = plan.walls.filter((w) => w.phase === undefined)
  const read = phaseReading(plan)
  const openings = plan.openings.filter((o) => o.phase === undefined && read.opening(o) === 'existing')
  const rooms = plan.rooms.filter((r) => r.phase === undefined)
  const patch = emptyPatch([])
  if (walls.length + openings.length + rooms.length === 0) {
    if (!planHasPhases(plan)) throw new EditRefused('The plan has no walls, doors, windows or rooms to mark as existing.')
    return { ...patch, said: ['Every wall, door, window and room already states a phase, so nothing was marked. grid_set_phase changes one.'] }
  }
  const stated = [...plan.walls, ...plan.openings, ...plan.rooms].filter((part) => part.phase !== undefined).length
  return {
    ...patch,
    walls: new Map(walls.map((w) => [w.id, { phase: 'existing' as const }])),
    openings: new Map(openings.map((o) => [o.id, { phase: 'existing' as const } as OpeningChange])),
    rooms: new Map(rooms.map((r) => [r.id, { phase: 'existing' as const } as RoomChange])),
    said: [
      `Marked ${counted(walls.length, openings.length, rooms.length)} as existing: the plan as it stands is the building before the work.${stated > 0 ? ` ${count(stated, 'part')} already stated a phase and kept it.` : ''}`,
      'From now on a change is the work: what it adds is new, and what it takes out of what stands stays in the plan, to be demolished. To fix the survey itself without making work, pass correction.',
    ],
    extra: { marked: { existing: { walls: walls.length, openings: openings.length, rooms: rooms.length } } },
  }
}

/** What `setPhase` is asked: parts by id, and rooms (each with the walls only it uses). */
export interface PhaseSet {
  readonly phase: Phase
  readonly parts?: readonly string[]
  readonly rooms?: readonly string[]
}

/** Parts marked by id or by room, with each wall's doors and windows following it. */
export function setPhase(plan: FloorPlan, request: PhaseSet): Patch {
  const { phase } = request
  const ids = request.parts ?? []
  const roomIds = request.rooms ?? []
  if (ids.length + roomIds.length === 0) throw new EditRefused('Nothing to mark: give parts (ids of walls, doors, windows or rooms), or rooms.')
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  const openings = new Map(plan.openings.map((o) => [o.id, o] as const))
  const rooms = new Map(plan.rooms.map((r) => [r.id, r] as const))
  const markWalls = new Set<string>()
  const markOpenings = new Set<string>()
  const markRooms = new Set<string>()
  const left: string[] = []

  const unknown: string[] = []
  for (const id of ids) {
    if (walls.has(id)) markWalls.add(id)
    else if (openings.has(id)) markOpenings.add(id)
    else if (rooms.has(id)) markRooms.add(id)
    else unknown.push(quoted(id))
  }
  if (unknown.length > 0) {
    throw new EditRefused(`The plan has no wall, door, window or room ${listed(unknown, 4)}: a phase is set on walls, doors, windows and rooms by id (stairs, columns and fixtures state none).`)
  }
  for (const id of roomIds) {
    if (!rooms.has(id)) throw new EditRefused(`The plan has no room ${quoted(id)}.`)
    markRooms.add(id)
  }
  // By room: the walls only the marked rooms use. A wall another room still stands against stays as it is.
  const marked = new Set(markRooms)
  const roomWalls = new Set<string>()
  for (const id of roomIds) {
    const room = rooms.get(id)!
    for (const wallId of wallsOf(room)) {
      if (!walls.has(wallId)) continue
      const shared = plan.rooms.find((r) => !marked.has(r.id) && wallsOf(r).includes(wallId))
      if (shared === undefined) {
        markWalls.add(wallId)
        roomWalls.add(wallId)
      } else left.push(`wall ${quoted(wallId)} (room ${quoted(shared.id)} stands against it too)`)
    }
  }
  // A room takes every door and window in its walls. A wall named by id and set to demolished or new takes those that state a
  // phase of their own, so none stands where its wall does not; set to existing, they keep theirs (a door may still be coming out).
  for (const o of plan.openings) {
    if (!markWalls.has(o.wall)) continue
    if (roomWalls.has(o.wall) || (o.phase !== undefined && phase !== 'existing')) markOpenings.add(o.id)
  }

  const changedWalls = [...markWalls].filter((id) => walls.get(id)!.phase !== phase)
  const changedOpenings = [...markOpenings].filter((id) => openings.get(id)!.phase !== phase)
  const changedRooms = [...markRooms].filter((id) => rooms.get(id)!.phase !== phase)
  const said: string[] = []
  const words: Record<Phase, string> = { existing: 'existing', demolished: 'to be demolished', new: 'new' }
  if (changedWalls.length + changedOpenings.length + changedRooms.length === 0) said.push(`Everything named is already ${words[phase]}, so nothing changed.`)
  else {
    const named = [...changedWalls.map((id) => `wall ${quoted(id)}`), ...changedOpenings.map((id) => quoted(id)), ...changedRooms.map((id) => `room ${quoted(id)}`)]
    said.push(`Marked ${listed(named, 6)} as ${words[phase]}.`)
  }
  if (left.length > 0) said.push(`Left as they are: ${listed(left, 4)}. Name the other room too to take the shared wall with it, or give the wall in parts.`)
  if (phase !== 'existing' && !planHasPhases(plan)) said.push('Nothing else in the plan states a phase, so it reads as existing; grid_start_works marks it all, so a change from here is the work.')
  return {
    ...emptyPatch(said),
    walls: new Map(changedWalls.map((id) => [id, { phase }])),
    openings: new Map(changedOpenings.map((id) => [id, { phase } as OpeningChange])),
    rooms: new Map(changedRooms.map((id) => [id, { phase } as RoomChange])),
    extra: { phase: { set: phase, walls: changedWalls, openings: changedOpenings, rooms: changedRooms, left } },
  }
}

// ---------------------------------------------------------------------------------------------
// Two plans into one

type Raw = Record<string, unknown>
const LISTS = ['walls', 'openings', 'rooms'] as const

/** What `phasedPlanFrom` made, and what it says of it. */
export interface PhasedFrom {
  readonly plan: Raw
  readonly said: string[]
  readonly counts: Readonly<Record<Phase, { walls: number; openings: number; rooms: number }>>
  /** The ids a changed part's old self was given, by its id. */
  readonly kept: Readonly<Record<string, string>>
}

const listOf = (plan: Raw, key: (typeof LISTS)[number]): Raw[] => (Array.isArray(plan[key]) ? (plan[key] as Raw[]) : [])
const idOf = (part: Raw): string => String(part['id'])

/** A record as text with its keys in order, so two the same compare the same. */
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Raw).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * The building before and after the work, as one plan with phases. By id: a part only the
 * first plan holds is demolished; one only the second holds is new; one both hold the same is
 * existing. A part both hold but changed (or that stands on a wall that changed) is its old self,
 * `<id>-before`, demolished, beside its new self, which keeps the id. Everything but the walls,
 * doors, windows and rooms (floors, fixtures, stairs, the plan's own fields) is the second
 * plan's; floors only the first plan has are kept.
 */
export function phasedPlanFrom(before: Raw, after: Raw): PhasedFrom {
  for (const [name, plan] of [['before', before], ['after', after]] as const) {
    if (plan['base'] !== undefined) throw new EditRefused(`The ${name} plan is fitted out in a base plan: give plans that are each a whole building.`)
    const stated = LISTS.flatMap((key) => listOf(plan, key).filter((p) => p['phase'] !== undefined).map((p) => `${key.slice(0, -1)} ${quoted(idOf(p))}`))
    if (stated.length > 0) throw new EditRefused(`The ${name} plan already states phases (${listed(stated, 3)}): give the building as it stands before and the building as it is after, each with no phase.`)
  }
  const taken = new Set<string>(LISTS.flatMap((key) => [...listOf(before, key), ...listOf(after, key)].map(idOf)))
  const free = (id: string): string => {
    let next = `${id}-before`
    for (let n = 2; taken.has(next); n++) next = `${id}-before-${n}`
    taken.add(next)
    return next
  }
  const same = (a: Raw | undefined, b: Raw | undefined): boolean => a !== undefined && b !== undefined && canon({ ...a, phase: undefined }) === canon({ ...b, phase: undefined })

  const wallsBefore = new Map(listOf(before, 'walls').map((w) => [idOf(w), w] as const))
  const wallsAfter = new Map(listOf(after, 'walls').map((w) => [idOf(w), w] as const))
  // A wall in both plans that is not the same wall: its old self is kept under another id.
  const oldWall = new Map<string, string>()
  for (const [id, wall] of wallsBefore) if (wallsAfter.has(id) && !same(wall, wallsAfter.get(id))) oldWall.set(id, free(id))
  const asBefore = (id: string): string => oldWall.get(id) ?? id
  const onChanged = (ids: readonly string[]): boolean => ids.some((id) => oldWall.has(id))

  const kept: Record<string, string> = Object.fromEntries(oldWall)
  const counts = { existing: { walls: 0, openings: 0, rooms: 0 }, demolished: { walls: 0, openings: 0, rooms: 0 }, new: { walls: 0, openings: 0, rooms: 0 } }
  const out: Record<(typeof LISTS)[number], Raw[]> = { walls: [], openings: [], rooms: [] }
  const put = (key: (typeof LISTS)[number], part: Raw, phase: Phase): void => {
    out[key].push({ ...part, phase })
    counts[phase][key]++
  }

  const references = (key: (typeof LISTS)[number], part: Raw): string[] => {
    if (key === 'openings') return [String(part['wall'])]
    if (key === 'rooms') return [...((part['boundary'] as string[] | undefined) ?? []), ...(((part['holes'] as string[][] | undefined) ?? []).flat())]
    return []
  }
  const renamedOld = (key: (typeof LISTS)[number], part: Raw): Raw => {
    if (key === 'openings') return { ...part, wall: asBefore(String(part['wall'])) }
    if (key === 'rooms') {
      return {
        ...part,
        boundary: ((part['boundary'] as string[] | undefined) ?? []).map(asBefore),
        ...(part['holes'] === undefined ? {} : { holes: (part['holes'] as string[][]).map((hole) => hole.map(asBefore)) }),
      }
    }
    return part
  }

  for (const key of LISTS) {
    const was = new Map(listOf(before, key).map((p) => [idOf(p), p] as const))
    const now = new Map(listOf(after, key).map((p) => [idOf(p), p] as const))
    // Order: the second plan's parts, then what only the first held.
    for (const [id, part] of now) {
      const old = was.get(id)
      if (old === undefined) put(key, part, 'new')
      else if (key === 'walls' ? !oldWall.has(id) : same(old, part) && !onChanged(references(key, part)) && !onChanged(references(key, old))) put(key, part, 'existing')
      else {
        put(key, part, 'new')
        const copy = key === 'walls' ? asBefore(id) : free(id)
        if (key !== 'walls') kept[id] = copy
        put(key, { ...renamedOld(key, old), id: copy }, 'demolished')
      }
    }
    for (const [id, part] of was) if (!now.has(id)) put(key, renamedOld(key, part), 'demolished')
  }
  const floors = [...(Array.isArray(after['floors']) ? (after['floors'] as Raw[]) : [])]
  const floorIds = new Set(floors.map(idOf))
  for (const floor of Array.isArray(before['floors']) ? (before['floors'] as Raw[]) : []) if (!floorIds.has(idOf(floor))) floors.push(floor)

  const plan: Raw = { ...after, walls: out.walls, openings: out.openings, rooms: out.rooms, ...(floors.length > 0 ? { floors } : {}) }
  const line = (phase: Phase, words: string): string => `${counted(counts[phase].walls, counts[phase].openings, counts[phase].rooms)} ${words}`
  const said = [
    `Wrote one plan from the two: ${line('existing', 'existing (the same in both)')}; ${line('demolished', 'to be demolished (only in the first, or the old self of a part that changed)')}; ${line('new', 'new (only in the second, or changed)')}.`,
    ...(Object.keys(kept).length === 0 ? [] : [`A part that changed keeps its old self beside it, demolished: ${listed(Object.entries(kept).map(([id, copy]) => `${quoted(id)} as ${quoted(copy)}`), 4)}.`]),
    ...(['items', 'stairs', 'columns', 'bays', 'ramps'] as const).some((k) => Array.isArray(before[k]) && (before[k] as unknown[]).length > 0) ? ['Fixtures, stairs and the rest are the second plan\'s: they state no phase.'] : [],
  ]
  return { plan, said, counts, kept }
}
