/**
 * The changes of one building of a plan that holds many (CMD-47), each a patch through
 * `writeChange` as every change is: its rooms text written back in place of its floors and parts,
 * a storey added on top like one of its floors, the building taken out with everything on its
 * floors, and a copy of it placed elsewhere on the site. The other buildings' records stay in the
 * file as written (`Patch.lists`). The parts are found by `buildingParts.ts`.
 */
import { floorOf, planBuildings, planFloors, type FloorPlan } from '@ongrid/floorplan/geometry'
import { compileRoomsText, planRevision, problemLines } from '@ongrid/floorplan/rooms'
import { safeParseFloorPlan, statedItem, statedOpening, statedWall } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { buildingNamed, buildingPlan, buildingParts, freeId, idOnFloor, movedBy, ON_A_FLOOR, OTHER_LISTS, planIdsIn, refuseTaken, renamedIds, type BuildingParts, type RawRecord } from './buildingParts'
import { emptyPatch, listed, type Patch } from './edits'
import { EditRefused } from './refused'

type ListChange = { remove: Set<string>; add: RawRecord[] }
const listOf = (plan: object, key: string): RawRecord[] => {
  const value = (plan as RawRecord)[key]
  return Array.isArray(value) ? (value as RawRecord[]) : []
}
const idOf = (part: RawRecord): string => part['id'] as string
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const M = (v: number): string => `${Math.round(v * 1000) / 1000 + 0} m`

/** The building's rooms text, the plan of it alone, and its fingerprint, the `based on` line of its text. */
export function buildingReading(plan: FloorPlan, id: string): { readonly plan: FloorPlan; readonly revision: string } {
  const alone = buildingPlan(plan, buildingParts(plan, id))
  return { plan: alone, revision: planRevision(alone) }
}

/** Every id the building holds, in every list. */
function ownIds(parts: BuildingParts): Set<string> {
  return new Set([...parts.walls, ...parts.rooms, ...parts.openings, ...parts.items, ...[...parts.lists.values()].flatMap((ids) => [...ids])])
}

/** The patch's `lists`, every change of each list in one. */
function listChanges(): { readonly of: (key: string) => ListChange; readonly done: () => Map<string, ListChange> } {
  const map = new Map<string, ListChange>()
  return {
    of: (key) => {
      if (!map.has(key)) map.set(key, { remove: new Set(), add: [] })
      return map.get(key)!
    },
    done: () => new Map([...map].filter(([, c]) => c.remove.size > 0 || c.add.length > 0)),
  }
}

/** The ids of the parts taken out with the building: everything on its floors, and the stairs and ramps to them. */
function removalOf(plan: FloorPlan, parts: BuildingParts, whole = true): Pick<Patch, 'removeWalls' | 'removeRooms' | 'removeOpenings' | 'removeItems'> & { lists: Map<string, ListChange> } {
  const lists = listChanges()
  for (const [key, ids] of parts.lists) for (const id of ids) lists.of(key).remove.add(id)
  if (whole) for (const [key, ids] of parts.touching) for (const id of ids) lists.of(key).remove.add(id)
  lists.of('buildings').remove.add(parts.id)
  // A flat with some of its rooms in the building keeps the others.
  for (const flat of whole ? listOf(plan, 'flats') : []) {
    const rooms = Array.isArray(flat['rooms']) ? (flat['rooms'] as string[]) : []
    const left = rooms.filter((r) => !parts.rooms.has(r))
    if (left.length === rooms.length || left.length === 0) continue
    lists.of('flats').remove.add(idOf(flat))
    lists.of('flats').add.push({ ...flat, rooms: left })
  }
  return { removeWalls: new Set(parts.walls), removeRooms: new Set(parts.rooms), removeOpenings: new Set(parts.openings), removeItems: new Set(parts.items), lists: lists.done() }
}

// ---------------------------------------------------------------------------------------------
// A building's rooms text written back

export interface BuildingTextRequest {
  readonly building: string
  readonly text: string
  readonly replace?: boolean
}

/**
 * The building's floors and every part on them replaced by what its rooms text writes. Text read
 * from another version of the building is refused, and text with no `based on` line over a
 * building with parts needs `replace`. A text that writes building lines writes those buildings in
 * place of this one; one that writes none makes all its floors this building's, keeping its name
 * and pad. An id another building holds is given its floor's id in front; the building's own ids
 * are kept.
 */
export function writeBuildingText(survey: Survey, request: BuildingTextRequest): Patch {
  const plan = survey.plan
  const known = planBuildings(plan).find((b) => b.id === request.building)
  const result = compileRoomsText(request.text.normalize('NFC'))
  if (result.plan === null) {
    const lines = problemLines(result)
    throw new EditRefused(`The rooms text was not written: ${lines[0] ?? 'it could not be read'}${lines.length > 1 ? ` (${lines.length - 1} more: ${lines.slice(1, 4).join(' | ')})` : ''}.`)
  }
  const text = safeParseFloorPlan(result.plan)
  if (text === null) throw new EditRefused('The rooms text was not written: the plan it makes does not fit the plan\'s format.')
  if (text.rooms.length === 0) throw new EditRefused('The rooms text was not written: it has no rooms. Read the building back (grid_describe as=rooms building=...) and change that.')
  const whole = (['site', 'north', 'base'] as const).filter((key) => text[key] !== undefined)
  if (whole.length > 0) throw new EditRefused(`The rooms text of one building writes no ${whole.join(' or ')} line: the plot, north and a fit-out's base are the whole plan's (grid_set_site, grid_write_rooms without building).`)
  const floors = (text.floors ?? []).map((f) => f.id)
  const unnamed = planFloors(text).filter((f) => !floors.includes(f.id)).map((f) => f.id)
  if (floors.length === 0 || unnamed.length > 0) throw new EditRefused('The rooms text of one building names each of its floors with a floor line (floor bg "Ground floor" level 0), so no part of it lands on a floor of another building.')

  const parts = known === undefined ? null : buildingParts(plan, request.building)
  if (parts !== null && request.replace !== true) {
    const now = buildingReading(plan, request.building).revision
    if (result.basedOn !== null && result.basedOn !== now) {
      throw new EditRefused(`This rooms text was read from another version of building ${request.building} (based on ${result.basedOn}; it is now ${now}), so writing it would undo what changed since. Read it back again (grid_describe as=rooms building=${request.building}), make the change there and write that; or pass replace=true to write over it.`)
    }
    if (result.basedOn === null && parts.walls.size + parts.rooms.size > 0) {
      throw new EditRefused(`Building ${request.building} has ${plural(parts.rooms.size, 'room')} and ${plural(parts.walls.size, 'wall')}, and this text was not read from it (it has no based on line). Pass replace=true to write it in their place, or read the building back (grid_describe as=rooms building=${request.building}) and change that.`)
    }
  }

  // The floors and buildings the text writes, against the rest of the plan's.
  const mine = new Set(parts?.floors ?? [])
  const otherFloors = new Set(planFloors(plan).map((f) => f.id).filter((f) => !mine.has(f)))
  const clashes = floors.filter((f) => otherFloors.has(f))
  if (clashes.length > 0) throw new EditRefused(`Floor ${listed(clashes, 6)} ${clashes.length === 1 ? 'is a floor' : 'are floors'} of the plan outside building ${request.building}: give the text's floors ids of their own.`)
  const old = (plan.buildings ?? []).find((b) => b.id === request.building)
  const written = text.buildings ?? []
  if (written.length > 0) {
    const holds = new Set(written.flatMap((b) => b.floors))
    const loose = floors.filter((f) => !holds.has(f))
    if (loose.length > 0) throw new EditRefused(`Floor ${listed(loose, 6)} is in none of the text's building lines: a text that writes building lines puts each of its floors in one.`)
    const others = new Set(planBuildings(plan).map((b) => b.id).filter((b) => b !== request.building))
    const taken = written.map((b) => b.id).filter((b) => others.has(b))
    if (taken.length > 0) throw new EditRefused(`Building ${listed(taken, 6)} is another building of the plan already: give the text's buildings ids of their own.`)
  }
  const buildings = written.length > 0 ? written : [{ id: request.building, ...(old?.name === undefined ? {} : { name: old.name }), floors, ...(old?.pad === undefined ? {} : { pad: old.pad }) }]

  // An id another building holds takes its floor's id in front, as the compiler gives a later floor's.
  const own = parts === null ? new Set<string>() : ownIds(parts)
  const taken = new Set([...planIdsIn(plan)].filter((id) => !own.has(id)))
  const map = new Map<string, string>()
  const renamedNote: string[] = []
  const wallFloor = new Map(text.walls.map((w) => [w.id, floorOf(w)] as const))
  const pick = (id: string, floor: string | null): void => {
    if (!taken.has(id)) {
      taken.add(id)
      return
    }
    const next = freeId(`${floor ?? request.building}-${id}`, taken)
    map.set(id, next)
    renamedNote.push(`${id} → ${next}`)
  }
  for (const key of ['walls', 'rooms', 'items', ...ON_A_FLOOR.filter((k) => k !== 'items')] as const) for (const part of listOf(text, key)) pick(idOf(part), floorOf(part as { floor?: string }))
  for (const o of text.openings) pick(o.id, wallFloor.get(o.wall) ?? null)
  for (const key of ['stairs', 'ramps', 'patterns', 'flats'] as const) for (const part of listOf(text, key)) pick(idOf(part), null)
  const fresh = map.size === 0 ? text : renamedIds(text, map)

  const out = parts === null ? { removeWalls: new Set<string>(), removeRooms: new Set<string>(), removeOpenings: new Set<string>(), removeItems: new Set<string>(), lists: new Map<string, ListChange>() } : removalOf(plan, parts, false)
  const lists = new Map(out.lists)
  const change = (key: string): ListChange => {
    if (!lists.has(key)) lists.set(key, { remove: new Set(), add: [] })
    return lists.get(key)!
  }
  // A list the text writes none of keeps the building's, but for those on a floor it no longer has.
  const kept = new Set(floors)
  for (const key of OTHER_LISTS) {
    if (key === 'floors' || listOf(fresh, key).length > 0 || parts === null) continue
    const stays = listOf(plan, key).filter((part) => (parts.lists.get(key) ?? new Set()).has(idOf(part)) && (key === 'stairs' ? kept.has(part['from'] as string) && kept.has(part['to'] as string) : key === 'patterns' ? fresh.walls.some((w) => w.id === part['wall']) : !(ON_A_FLOOR as readonly string[]).includes(key) || kept.has(floorOf(part as { floor?: string }))))
    for (const part of stays) lists.get(key)?.remove.delete(idOf(part))
  }
  for (const key of OTHER_LISTS) change(key).add.push(...listOf(fresh, key))
  // The flat types the text writes, in place of those with their ids.
  for (const type of listOf(fresh, 'flatTypes')) {
    change('flatTypes').remove.add(idOf(type))
    change('flatTypes').add.push(type)
  }
  change('buildings').remove.add(request.building)
  change('buildings').add.push(...buildings.map((b) => ({ ...b })))
  const textItems = fresh.items ?? []
  const itemsKept = textItems.length > 0 || parts === null ? [] : (plan.items ?? []).filter((i) => parts.items.has(i.id) && kept.has(floorOf(i)))
  const removeItems = new Set([...(out.removeItems ?? [])].filter((id) => !itemsKept.some((i) => i.id === id)))
  const before = parts === null ? 'a new building' : `in place of its ${plural(parts.floors.length, 'floor')}, ${plural(parts.rooms.size, 'room')} and ${plural(parts.walls.size, 'wall')}`
  return {
    ...emptyPatch([
      `Wrote building ${request.building} from rooms text, ${before}: ${plural(floors.length, 'floor')} (${listed(floors, 6)}), ${plural(fresh.rooms.length, 'room')}, ${plural(fresh.walls.length, 'wall')} and ${plural(fresh.openings.length, 'opening')}. Every other building is as it was.`,
      ...(written.length > 0 && !(written.length === 1 && written[0]!.id === request.building) ? [`The text's building lines write ${written.length === 1 ? 'building' : 'buildings'} ${listed(written.map((b) => b.id), 6)} in its place.`] : []),
      ...(renamedNote.length === 0 ? [] : [`Ids another building holds were given their floor in front: ${listed(renamedNote, 8)}.`]),
      ...(itemsKept.length === 0 ? [] : [`Kept the building's ${plural(itemsKept.length, 'item')}: the text writes no item line.`]),
    ]),
    removeWalls: out.removeWalls,
    addWalls: fresh.walls.map((w) => statedWall(w) as unknown as RawRecord),
    removeRooms: out.removeRooms,
    addRooms: fresh.rooms as unknown as RawRecord[],
    removeOpenings: out.removeOpenings,
    addOpenings: fresh.openings.map((o) => statedOpening(o) as unknown as RawRecord),
    removeItems,
    ...(textItems.length === 0 ? {} : { addItems: textItems.map((i) => statedItem(i) as unknown as RawRecord) }),
    lists,
    extra: { building: request.building, buildingsWritten: buildings.map((b) => b.id), renamed: Object.fromEntries(map) },
  }
}

// ---------------------------------------------------------------------------------------------
// A storey added on top

export interface StoreyRequest {
  readonly building: string
  /** The floor it is laid out like: the building's top floor when left out. */
  readonly like?: string
  readonly id?: string
  readonly name?: string
}

/** The floor id after another: its last digits counted up (a2 after a1), else `-2` after it. */
function nextFloorId(top: string, taken: Set<string>): string {
  const digits = /^(.*?)(\d+)$/.exec(top)
  if (digits !== null) {
    const n = String(Number(digits[2]) + 1).padStart(digits[2]!.length, '0')
    return freeId(`${digits[1]}${n}`, taken)
  }
  return freeId(`${top}-2`, taken)
}

/**
 * A storey on top of the building, laid out like one of its floors: its walls, rooms, openings,
 * patterns, items, columns, bays and flats copied onto it with new ids. The building's record
 * takes it; a wall or column that rises through the old top floor rises through it, a stair that
 * reaches the old top floor has a flight on from it; the old top's roof and parapet go up to it.
 */
export function addStorey(survey: Survey, request: StoreyRequest): Patch {
  const plan = survey.plan
  const building = buildingNamed(plan, request.building)
  const parts = buildingParts(plan, request.building)
  const records = new Map((plan.floors ?? []).map((f) => [f.id, f] as const))
  const ordered = planFloors(plan).filter((f) => parts.floors.includes(f.id))
  const top = ordered[ordered.length - 1]
  if (top === undefined) throw new EditRefused(`Building ${request.building} has no floor to add a storey to.`)
  const like = request.like ?? top.id
  if (!parts.floors.includes(like)) throw new EditRefused(`Floor ${like} is not one of building ${request.building}'s: ${listed([...parts.floors], 8)}. A storey is laid out like one of its own floors.`)
  const taken = planIdsIn(plan)
  // Floors are named apart from the parts: a floor a1 and a door a1 are two things.
  const floorIds = new Set(planFloors(plan).map((f) => f.id))
  if (request.id !== undefined) refuseTaken([request.id], floorIds, 'The floor id')
  const id = request.id === undefined ? nextFloorId(top.id, floorIds) : freeId(request.id, floorIds)
  const level = (Number.isFinite(top.level) ? top.level : 0) + 1
  const source = records.get(like)
  const topRecord = records.get(top.id)
  // The new floor: the like floor's record, at the next level, stacked on top (no elevation of its own), with the top's roof.
  const made: RawRecord = { ...(source ?? { name: like }) as unknown as RawRecord, id, name: request.name ?? `${building.name} level ${level}`, level }
  for (const key of ['elevation', 'roof', 'parapet', 'above'] as const) delete made[key]
  if (topRecord?.roof !== undefined) made['roof'] = topRecord.roof
  if (topRecord?.parapet !== undefined) made['parapet'] = topRecord.parapet
  if (topRecord?.above !== undefined) made['above'] = topRecord.above
  if (made['below'] !== undefined) delete made['below']
  const lists = listChanges()
  if (topRecord !== undefined) {
    const lowered: RawRecord = { ...(topRecord as unknown as RawRecord) }
    for (const key of ['roof', 'parapet', 'above'] as const) delete lowered[key]
    lists.of('floors').remove.add(top.id)
    lists.of('floors').add.push(lowered, made)
  } else lists.of('floors').add.push(made)

  // The like floor's parts, each with an id on the new floor.
  const map = new Map<string, string>([[like, id]])
  const onLike = (part: { readonly floor?: string }): boolean => floorOf(part) === like
  const walls = plan.walls.filter(onLike)
  const wallIds = new Set(walls.map((w) => w.id))
  const name = (old: string): string => {
    const next = freeId(idOnFloor(old, like, id), taken)
    map.set(old, next)
    return next
  }
  for (const w of walls) name(w.id)
  const rooms = plan.rooms.filter(onLike)
  for (const r of rooms) name(r.id)
  const openings = plan.openings.filter((o) => wallIds.has(o.wall))
  for (const o of openings) name(o.id)
  const items = (plan.items ?? []).filter(onLike)
  for (const i of items) name(i.id)
  const onFloorLists = (['columns', 'bays'] as const).map((key) => [key, listOf(plan, key).filter((p) => onLike(p as { floor?: string }))] as const)
  for (const [, list] of onFloorLists) for (const p of list) name(idOf(p))
  const patterns = listOf(plan, 'patterns').filter((p) => wallIds.has(p['wall'] as string))
  for (const p of patterns) name(idOf(p))
  const roomIds = new Set(rooms.map((r) => r.id))
  const flats = listOf(plan, 'flats').filter((f) => Array.isArray(f['rooms']) && (f['rooms'] as string[]).length > 0 && (f['rooms'] as string[]).every((r) => roomIds.has(r)))
  for (const f of flats) name(idOf(f))
  // A copy stands on its own floor only: what rose through floors from the like floor does not.
  const copied = <T extends object>(part: T): RawRecord => {
    const next = renamedIds(part as unknown as RawRecord, map)
    next['floor'] = id
    delete next['through']
    return next
  }
  // Cores: what rises through the old top floor rises through the new one, and a stair reaching it goes on up.
  const risen = { walls: 0, columns: 0, stairs: 0 }
  const wallChanges = new Map<string, { through?: string }>()
  for (const w of plan.walls) {
    if (w.through === top.id && floorOf(w) !== top.id && parts.floors.includes(floorOf(w))) {
      wallChanges.set(w.id, { through: id })
      risen.walls++
    }
  }
  const columnChanges = new Map<string, Record<string, unknown>>()
  for (const c of listOf(plan, 'columns')) {
    if (c['through'] === top.id && parts.floors.includes(floorOf(c as { floor?: string }))) {
      columnChanges.set(idOf(c), { through: id })
      risen.columns++
    }
  }
  const stairs: RawRecord[] = []
  for (const s of listOf(plan, 'stairs')) {
    if (!(parts.lists.get('stairs') ?? new Set()).has(idOf(s))) continue
    if (s['to'] !== top.id && s['from'] !== top.id) continue
    const lower = s['to'] === top.id ? s['from'] : s['to']
    if (lower === id) continue
    stairs.push({ ...s, id: freeId(`${idOf(s)}-${id}`, taken), from: top.id, to: id })
    risen.stairs++
  }
  lists.of('stairs').add.push(...stairs)
  for (const [key, list] of onFloorLists) lists.of(key).add.push(...list.map(copied))
  lists.of('patterns').add.push(...patterns.map((p) => {
    const next = renamedIds(p, map)
    delete next['floors']
    return next
  }))
  lists.of('flats').add.push(...flats.map((f) => renamedIds(f, map)))
  lists.of('buildings').remove.add(request.building)
  const record = (plan.buildings ?? []).find((b) => b.id === request.building)!
  lists.of('buildings').add.push({ ...record, floors: [...record.floors, id] })
  const cores = [risen.walls > 0 ? plural(risen.walls, 'wall') : '', risen.columns > 0 ? plural(risen.columns, 'column') : '', risen.stairs > 0 ? plural(risen.stairs, 'stair flight', 'stair flights') : ''].filter((s) => s !== '')
  return {
    ...emptyPatch([
      `Added storey ${id} ("${made['name'] as string}") on top of building ${request.building}, at level ${level} over ${top.id}, laid out like ${like}: ${plural(walls.length, 'wall')}, ${plural(rooms.length, 'room')}, ${plural(openings.length, 'opening')}${items.length === 0 ? '' : `, ${plural(items.length, 'item')}`}${flats.length === 0 ? '' : `, ${plural(flats.length, 'flat')}`}, each with an id on ${id}. It stacks on ${top.id}${topRecord?.roof !== undefined || topRecord?.parapet !== undefined ? `, and ${top.id}'s roof is on it now` : ''}.`,
      cores.length === 0 ? 'No wall, column or stair rose to the old top floor, so no core goes up with it.' : `The cores go up with it: ${cores.join(', ')} now reach ${id}.`,
    ]),
    walls: wallChanges,
    addWalls: walls.map((w) => copied(statedWall(w))),
    addRooms: rooms.map(copied),
    addOpenings: openings.map((o) => renamedIds(statedOpening(o) as unknown as RawRecord, map)),
    ...(items.length === 0 ? {} : { addItems: items.map((i) => copied(statedItem(i))) }),
    ...(columnChanges.size === 0 ? {} : { parts: new Map([['columns', columnChanges]]) }),
    lists: lists.done(),
    extra: { building: request.building, floor: id },
  }
}

// ---------------------------------------------------------------------------------------------
// A building taken out

/** The building, its floors and everything on them taken out of the plan. */
export function removeBuilding(survey: Survey, id: string): Patch {
  const plan = survey.plan
  const parts = buildingParts(plan, id)
  const out = removalOf(plan, parts)
  const touching = [...parts.touching.values()].reduce((n, ids) => n + ids.size, 0)
  const others = [...parts.lists].filter(([key]) => key !== 'floors').reduce((n, [, ids]) => n + ids.size, 0)
  return {
    ...emptyPatch([
      `Took building ${id} out of the plan with its ${plural(parts.floors.length, 'floor')} (${listed([...parts.floors], 6)}) and everything on them: ${plural(parts.rooms.size, 'room')}, ${plural(parts.walls.size, 'wall')}, ${plural(parts.openings.size, 'opening')}${parts.items.size === 0 ? '' : `, ${plural(parts.items.size, 'item')}`}${others === 0 ? '' : `, ${plural(others, 'other part')} (stairs, bays, notes, flats)`}${touching === 0 ? '' : `, and ${plural(touching, 'stair or ramp', 'stairs or ramps')} to them from another building`}. The other buildings are as they were.`,
    ]),
    ...out,
    extra: { building: id },
  }
}

// ---------------------------------------------------------------------------------------------
// A building placed: a copy of one on another lot

export interface PlaceRequest {
  readonly from: string
  readonly id: string
  readonly name?: string
  readonly pad?: number
  /** How far the copy is moved, in plan metres. */
  readonly move?: readonly [number, number]
  /** Where the south-west corner of the copy's walls' box goes. */
  readonly at?: readonly [number, number]
}

/** The box round a building's walls, or null when it has none. */
function wallsBox(plan: FloorPlan, walls: ReadonlySet<string>): { x0: number; y0: number; x1: number; y1: number } | null {
  const points = plan.walls.filter((w) => walls.has(w.id)).flatMap((w) => [w.start, w.end])
  if (points.length === 0) return null
  return { x0: Math.min(...points.map((p) => p[0])), y0: Math.min(...points.map((p) => p[1])), x1: Math.max(...points.map((p) => p[0])), y1: Math.max(...points.map((p) => p[1])) }
}

/**
 * A copy of a building placed elsewhere on the site, moved by `move` or with the south-west corner
 * of its walls' box `at` a point: every floor and part copied with new ids (a floor's id starting
 * with the building's id takes the new one's, else the new id in front), its record named and on
 * its pad as asked. It is moved, never turned.
 */
export function placeBuilding(survey: Survey, request: PlaceRequest): Patch {
  const plan = survey.plan
  const source = buildingNamed(plan, request.from)
  if ((request.move === undefined) === (request.at === undefined)) throw new EditRefused('Give move (how far to move the copy) or at (where the south-west corner of its walls goes), one of the two.')
  const others = planBuildings(plan).map((b) => b.id)
  if (others.includes(request.id)) throw new EditRefused(`Building ${request.id} is in the plan already: give the copy an id of its own.`)
  const parts = buildingParts(plan, request.from)
  const box = wallsBox(plan, parts.walls)
  if (request.at !== undefined && box === null) throw new EditRefused(`Building ${request.from} has no walls to measure its corner from: give move instead of at.`)
  const by: readonly [number, number] = request.move ?? [request.at![0] - box!.x0, request.at![1] - box!.y0]
  const taken = planIdsIn(plan)
  const floorsTaken = new Set(planFloors(plan).map((f) => f.id))
  const map = new Map<string, string>()
  const floorIds = new Map<string, string>()
  for (const f of parts.floors) {
    const next = freeId(f.startsWith(request.from) ? `${request.id}${f.slice(request.from.length)}` : `${request.id}-${f}`, floorsTaken)
    floorIds.set(f, next)
    map.set(f, next)
  }
  const alone = buildingPlan(plan, parts) as unknown as RawRecord
  const floorOfPart = new Map<string, string>()
  for (const w of plan.walls) if (parts.walls.has(w.id)) floorOfPart.set(w.id, floorOf(w))
  for (const o of plan.openings) if (parts.openings.has(o.id)) floorOfPart.set(o.id, floorOfPart.get(o.wall) ?? '')
  for (const key of ['walls', 'rooms', 'openings', 'items', ...OTHER_LISTS] as const) {
    if (key === 'floors') continue
    for (const part of listOf(alone, key)) {
      const id = idOf(part)
      const floor = key === 'openings' ? floorOfPart.get(id) : (key === 'walls' || key === 'rooms' || (ON_A_FLOOR as readonly string[]).includes(key)) ? floorOf(part as { floor?: string }) : undefined
      map.set(id, freeId(floor !== undefined && floorIds.has(floor) ? idOnFloor(id, floor, floorIds.get(floor)!) : `${request.id}-${id}`, taken))
    }
  }
  const copy = movedBy(renamedIds(alone, map), by)
  const lists = listChanges()
  for (const key of OTHER_LISTS) lists.of(key).add.push(...listOf(copy, key))
  const record = (plan.buildings ?? []).find((b) => b.id === request.from)!
  const placed: RawRecord = { id: request.id, ...(request.name === undefined ? {} : { name: request.name }), floors: parts.floors.map((f) => floorIds.get(f)!), ...((request.pad ?? record.pad) === undefined ? {} : { pad: request.pad ?? record.pad }) }
  lists.of('buildings').add.push(placed)
  // Worth a look: the copy's walls' box over another building's.
  const moved = box === null ? null : { x0: box.x0 + by[0], y0: box.y0 + by[1], x1: box.x1 + by[0], y1: box.y1 + by[1] }
  const over = moved === null ? [] : planBuildings(plan).filter((b) => {
    const other = wallsBox(plan, buildingParts(plan, b.id).walls)
    return other !== null && other.x0 < moved.x1 && moved.x0 < other.x1 && other.y0 < moved.y1 && moved.y0 < other.y1
  }).map((b) => b.id)
  const walls = listOf(copy, 'walls')
  const items = listOf(copy, 'items')
  return {
    ...emptyPatch([
      `Placed building ${request.id}, a copy of ${request.from} ("${source.name}") moved ${M(by[0])} east and ${M(by[1])} north: ${plural(parts.floors.length, 'floor')} (${listed(placed['floors'] as string[], 6)}), ${plural(listOf(copy, 'rooms').length, 'room')}, ${plural(walls.length, 'wall')} and ${plural(listOf(copy, 'openings').length, 'opening')}, each with an id of its own${placed['pad'] === undefined ? '' : `, on a pad at ${M(placed['pad'] as number)}`}. It is moved, not turned.`,
      ...(over.length === 0 ? [] : [`Worth a look: its walls' box overlaps building ${listed(over, 6)}'s. Move it with grid_place_building again after taking it out (grid_remove_building), or check the site's plan (grid_view).`]),
    ]),
    addWalls: walls.map((w) => statedWall(w as never) as unknown as RawRecord),
    addRooms: listOf(copy, 'rooms'),
    addOpenings: listOf(copy, 'openings').map((o) => statedOpening(o as never) as unknown as RawRecord),
    ...(items.length === 0 ? {} : { addItems: items.map((i) => statedItem(i as never) as unknown as RawRecord) }),
    lists: lists.done(),
    extra: { building: request.id, from: request.from, moved: [...by], overlaps: over },
  }
}
