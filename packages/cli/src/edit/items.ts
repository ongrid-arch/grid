/**
 * The items' changes (CNT-45): a fixture or a piece of furniture added (`addItem`,
 * `grid_add_item`), moved or turned (`moveItem`, `grid_move_item`) or taken out (`removeItems`,
 * `grid_remove_item`). Each is a patch, as every change is, and places an item by rooms text's own
 * reading of its words (`placeItem` in `rooms/items.ts`), so a tool and an `item` line put the same
 * item in the same place: against a side of a room with its turn worked out, or at a point.
 *
 * `followWalls` is the one rule every change keeps: an item standing against a wall moves with
 * that wall (`itemsFollowWalls`), so a room side moved or a wall made thicker carries the bath and
 * the wardrobe against it.
 *
 * Pure: a survey in, a patch out.
 */
import { floorOf, indexPlan, isPointKind, itemKindWord, itemRoom, roomShapes, validatePlan, type FloorPlan, type Item } from '@ongrid/floorplan/geometry'
import type { FactValue } from '@ongrid/floorplan/types/floorplan'
import type { Library } from '@ongrid/floorplan/library'
import { itemsFollowWalls, ItemRefused, layRow, placeItem, rowItemId, type ClearSides, type ItemMade, type ItemSide, type ItemWords, type RowWords } from '@ongrid/floorplan/rooms'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { emptyPatch, listed, readingAfter, type Patch } from './edits'
import { idHolder } from './holder'
import { FIT_CODES } from './place'
import { EditRefused } from './refused'

type Pair = readonly [number, number]

/** Where an item goes: against a side of a room, or at a point; every field left out when not given. */
export interface ItemPlace {
  readonly room?: string
  readonly against?: ItemSide
  readonly end?: ItemSide
  readonly from?: { readonly side: ItemSide; readonly distance: number }
  readonly fullWidth?: boolean
  readonly at?: Pair
  readonly turn?: number
  readonly floor?: string
}

/** What a call says about an item to add. */
export interface AddItemRequest extends ItemPlace {
  readonly id?: string
  readonly name: string
  readonly label?: string
  readonly size?: Pair
  readonly depth?: number
  readonly height?: number
  readonly clearance?: number
  /** CNT-47: the clear floor kept behind it and at its left and right. */
  readonly clearSides?: ClearSides
  /** CNT-47: the item laid out in rows, as a row line lays it out. */
  readonly row?: RowWords
  /** CNT-52: facts of the person's own it carries (`properties`): an extinguisher's type, a sensor's address. */
  readonly facts?: Readonly<Record<string, FactValue>>
}

/** CNT-52: an item's record with the facts the call gives, when it gives any. */
const withFacts = <T extends object>(record: T, request: AddItemRequest): T => (request.facts === undefined || Object.keys(request.facts).length === 0 ? record : { ...record, properties: { ...request.facts } })

/** What a call says about an item to move: a new place, or a distance to move it by. */
export interface MoveItemRequest extends ItemPlace {
  readonly id: string
  readonly by?: Pair
}

const n2 = (value: number): string => value.toFixed(2)
const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.:?]$/.test(text) ? '' : '.'}`

/** The item placed from its words, or the refusal as an edit's. */
function placed(plan: FloorPlan, words: ItemWords, library?: Library): ItemMade {
  try {
    return library === undefined ? placeItem(plan, words) : placeItem(plan, words, library)
  } catch (error) {
    if (error instanceof ItemRefused) throw new EditRefused(sentence(error.message))
    throw error
  }
}

/** Every id the plan's parts have, so a new item takes one of its own. */
function takenIds(plan: FloorPlan): Set<string> {
  return new Set([...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.items ?? []), ...(plan.columns ?? [])].map((part) => part.id))
}

/** An item by id, or the refusal naming the nearest. */
function itemNamed(plan: FloorPlan, id: string): Item {
  const items = plan.items ?? []
  const item = items.find((i) => i.id === id)
  if (item !== undefined) return item
  const meant = likelyId(id, items.map((i) => i.id))
  throw new EditRefused(`The plan has no item ${quoted(id)}${meant === null ? '' : `: did you mean ${quoted(meant)}?`} ${items.length === 0 ? 'It has no fixtures or furniture.' : `Its items: ${listed(items.map((i) => i.id), 12)}.`}`)
}

/** Where an item stands, in a sentence: its middle, its turn, its room. */
function whereSaid(plan: FloorPlan, item: Item): string {
  const rooms = roomShapes(indexPlan(plan))
  const room = itemRoom(item, rooms)
  return `at (${n2(item.at[0])}, ${n2(item.at[1])})${(item.turn ?? 0) === 0 ? '' : `, turned ${item.turn}°`}, ${room === null ? 'in no room' : `in room ${quoted(room.name || room.id)}`}${floorOf(item) === 'ground' ? '' : ` on floor ${quoted(floorOf(item))}`}`
}

/** What Grid's checks say of the items named after the change: nothing in the way, or each note. */
function fitLines(after: FloorPlan, ids: ReadonlySet<string>): { lines: string[]; fits: boolean; worthALook: { code: string; id: string; message: string }[] } {
  const { issues } = validatePlan(after)
  const fit = issues.filter((issue) => FIT_CODES.has(issue.code) && (ids.has(issue.id) || ((issue as { readonly hits?: readonly string[] }).hits ?? []).some((hit) => ids.has(hit))))
  // CNT-52: a point stands where it is put, on a wall or outside: no place check is made of it.
  const points = (after.items ?? []).filter((item) => ids.has(item.id)).every((item) => isPointKind(item.kind))
  return {
    lines: fit.length === 0 ? [points ? 'It is a point: it stands where it is put, takes no floor and is in no item\'s way.' : 'It fits: it runs into no wall or other item, and stands in no clear floor one keeps.'] : fit.map((issue) => `Worth a look: ${issue.message}`),
    fits: fit.length === 0,
    worthALook: fit.map((issue) => ({ code: issue.code, id: issue.id, message: issue.message })),
  }
}

/** The words of a place, as `placeItem` reads them. */
function placeWords(place: ItemPlace): Omit<ItemWords, 'id' | 'name'> {
  return {
    ...(place.room === undefined ? {} : { room: place.room }),
    ...(place.against === undefined ? {} : { against: place.against }),
    ...(place.end === undefined ? {} : { end: place.end }),
    ...(place.from === undefined ? {} : { from: place.from }),
    ...(place.fullWidth === true ? { fullWidth: true } : {}),
    ...(place.at === undefined ? {} : { at: place.at }),
    ...(place.turn === undefined ? {} : { turn: place.turn }),
    ...(place.floor === undefined ? {} : { floor: place.floor }),
  }
}

/** Against which side it was put, in a sentence, or nothing at a point. */
function againstSaid(made: ItemMade, place: ItemPlace): string {
  if (made.room === null || place.against === undefined) return ''
  const along = place.fullWidth === true ? ', the full width of it' : place.end !== undefined ? `, in its ${place.end} corner` : place.from !== undefined ? `, ${n2(place.from.distance)} m from its ${place.from.side} end` : ', centred on it'
  return ` against the ${place.against} side of room ${quoted(made.room)}${along}, facing into the room,`
}

/** An item added by its words: a library entry or a kind, against a side of a room or at a point. */
export function addItem(survey: Survey, library: Library, request: AddItemRequest): Patch {
  const plan = survey.plan
  const taken = takenIds(plan)
  if (request.id !== undefined && taken.has(request.id)) throw new EditRefused(`The id ${quoted(request.id)} is taken by ${idHolder(plan, request.id)}: give the item another id, or move that one with grid_move_item.`)
  if (request.row !== undefined) return addRow(survey, library, request, request.row, taken)
  let id = request.id ?? request.name
  if (request.id === undefined) for (let n = 2; taken.has(id); n++) id = `${request.name}-${n}`
  const made = placed(plan, {
    id,
    name: request.name,
    ...(request.label === undefined ? {} : { label: request.label }),
    ...(request.size === undefined ? {} : { size: request.size }),
    ...(request.depth === undefined ? {} : { depth: request.depth }),
    ...(request.height === undefined ? {} : { height: request.height }),
    ...(request.clearance === undefined ? {} : { clearance: request.clearance }),
    ...(request.clearSides === undefined ? {} : { clearSides: request.clearSides }),
    ...placeWords(request),
  }, library)
  const patch: Patch = { ...emptyPatch([]), addItems: [withFacts({ ...made.record }, request)], ...(made.copy.length === 0 ? {} : { addLibrary: made.copy.map((entry) => ({ ...entry })) }) }
  const after = readingAfter(plan, patch)
  const item = (after.items ?? []).find((i) => i.id === id) ?? made.item
  const fit = fitLines(after, new Set([id]))
  const said = [
    `Placed ${itemKindWord(item.kind)} ${quoted(id)}${item.library === undefined ? '' : ` from ${quoted(item.library)}`} (${n2(item.size[0])} × ${n2(item.size[1])} m, ${n2(item.height)} m high)${againstSaid(made, request)} ${whereSaid(after, item)}.`,
    ...made.guesses.map(sentence),
    ...fit.lines,
    ...(made.copy.length === 0 ? [] : [`The plan now holds ${made.copy.map((entry) => quoted(entry.name)).join(', ')} in its own library, so it reads the same without the library folder.`]),
  ]
  return { ...patch, said, extra: { item: id, placed: [id], fits: fit.fits, worthALook: fit.worthALook } }
}

/** CNT-47: the ids a row of items takes, from its own id. */
function rowIds(id: string, row: RowWords): string[] {
  const rows = row.rows ?? 1
  const ids: string[] = []
  for (let r = 1; r <= rows; r++) for (let n = 1; n <= row.count; n++) ids.push(rowItemId(id, r, n, rows))
  return ids
}

/** CNT-47: an item laid out in rows, as a row line lays it out, each item a plain item of the plan. */
function addRow(survey: Survey, library: Library, request: AddItemRequest, row: RowWords, taken: ReadonlySet<string>): Patch {
  const plan = survey.plan
  let id = request.id ?? request.name
  const clash = (base: string): string | undefined => rowIds(base, row).find((one) => taken.has(one))
  if (request.id !== undefined && clash(id) !== undefined) throw new EditRefused(`The id ${quoted(clash(id)!)} that the row would give is taken by ${idHolder(plan, clash(id)!)}: give the row another id.`)
  if (request.id === undefined) for (let n = 2; clash(id) !== undefined; n++) id = `${request.name}-${n}`
  const words: ItemWords = {
    id,
    name: request.name,
    ...(request.label === undefined ? {} : { label: request.label }),
    ...(request.size === undefined ? {} : { size: request.size }),
    ...(request.depth === undefined ? {} : { depth: request.depth }),
    ...(request.height === undefined ? {} : { height: request.height }),
    ...(request.clearance === undefined ? {} : { clearance: request.clearance }),
    ...(request.clearSides === undefined ? {} : { clearSides: request.clearSides }),
    ...placeWords(request),
  }
  let made: ItemMade[]
  try {
    made = layRow(plan, words, row, library)
  } catch (error) {
    if (error instanceof ItemRefused) throw new EditRefused(sentence(error.message))
    throw error
  }
  const first = made[0]!
  const copy = first.copy
  const patch: Patch = { ...emptyPatch([]), addItems: made.map((one) => withFacts({ ...one.record }, request)), ...(copy.length === 0 ? {} : { addLibrary: copy.map((entry) => ({ ...entry })) }) }
  const after = readingAfter(plan, patch)
  const ids = made.map((one) => one.item.id)
  const item = (after.items ?? []).find((i) => i.id === ids[0]) ?? first.item
  const fit = fitLines(after, new Set(ids))
  const rows = row.rows ?? 1
  const word = itemKindWord(item.kind)
  const said = [
    `Laid out ${made.length} × ${word}${item.library === undefined ? '' : ` from ${quoted(item.library)}`} (${n2(item.size[0])} × ${n2(item.size[1])} m, ${n2(item.height)} m high)${rows > 1 ? `, ${rows} rows of ${row.count}` : ` in a row of ${row.count}`}, ${quoted(ids[0]!)} to ${quoted(ids[ids.length - 1]!)}${againstSaid(first, request)} the first ${whereSaid(after, item)}.`,
    ...first.guesses.map(sentence),
    ...fit.lines,
    ...(copy.length === 0 ? [] : [`The plan now holds ${copy.map((entry) => quoted(entry.name)).join(', ')} in its own library, so it reads the same without the library folder.`]),
  ]
  return { ...patch, said, extra: { item: ids[0]!, placed: ids, fits: fit.fits, worthALook: fit.worthALook } }
}

/** An item moved or turned: against another side, into another room, to a point, or by a distance. */
export function moveItem(survey: Survey, request: MoveItemRequest): Patch {
  const plan = survey.plan
  const item = itemNamed(plan, request.id)
  const place = placeWords(request)
  const given = Object.keys(place).length > 0
  if (request.by !== undefined && (request.at !== undefined || request.against !== undefined)) throw new EditRefused('Give a distance to move it by (dx, dy), or where it goes (against a side, or x and y), not both.')
  if (!given && request.by === undefined) throw new EditRefused('Say where it goes: room with against (a side of the room, and at, from or full_width along it), x and y (its middle), turn, or dx and dy (a distance to move it by).')
  let change: { at: [number, number]; turn: number; floor?: string; size?: [number, number] }
  let how = ''
  if (request.against !== undefined || (request.room !== undefined && request.at === undefined && request.by === undefined)) {
    if (request.against === undefined) throw new EditRefused(`Say which side of room ${quoted(request.room!)} it stands against (against north, east, south or west), or its middle with x and y.`)
    const rooms = roomShapes(indexPlan(plan))
    const room = request.room ?? itemRoom(item, rooms)?.id
    if (room === undefined) throw new EditRefused(`Item ${quoted(item.id)} stands in no room: say the room whose side it goes against.`)
    // The item keeps its own figures; only its place, turn and (full width) its width change.
    const made = placed(plan, { id: item.id, name: item.kind, size: [item.size[0], item.size[1]], height: item.height, ...place, room })
    change = { at: [made.item.at[0], made.item.at[1]], turn: made.item.turn ?? 0, ...(floorOf(made.item) === floorOf(item) ? {} : { floor: floorOf(made.item) }), ...(request.fullWidth === true ? { size: [made.item.size[0], made.item.size[1]] } : {}) }
    how = againstSaid(made, { ...request, room })
  } else if (request.by !== undefined) {
    change = { at: [item.at[0] + request.by[0], item.at[1] + request.by[1]], turn: request.turn ?? item.turn ?? 0, ...(request.floor === undefined ? {} : { floor: request.floor }) }
    how = ` ${n2(Math.hypot(request.by[0], request.by[1]))} m,`
  } else {
    if (request.end !== undefined || request.from !== undefined || request.fullWidth === true) throw new EditRefused('at, from and full_width place an item along the side it stands against: give against too.')
    const at = request.at ?? [item.at[0], item.at[1]]
    change = { at: [at[0], at[1]], turn: request.turn ?? item.turn ?? 0, ...(request.floor === undefined ? {} : { floor: request.floor }) }
    if (request.room !== undefined) {
      const room = plan.rooms.find((r) => r.id === request.room)
      if (room === undefined) throw new EditRefused(`The plan has no room ${quoted(request.room)}.`)
      if (floorOf(room) !== floorOf(item) && request.floor === undefined) change = { ...change, floor: floorOf(room) }
    }
  }
  const round = (v: number): number => Math.round(v * 1e9) / 1e9 + 0
  change = { ...change, at: [round(change.at[0]), round(change.at[1])], turn: round((((change.turn % 360) + 360) % 360)) }
  const patch: Patch = { ...emptyPatch([]), items: new Map([[item.id, change]]) }
  const after = readingAfter(plan, patch)
  const now = (after.items ?? []).find((i) => i.id === item.id)!
  const fit = fitLines(after, new Set([item.id]))
  const said = [`Moved ${itemKindWord(item.kind)} ${quoted(item.id)}${how} from (${n2(item.at[0])}, ${n2(item.at[1])}) to ${whereSaid(after, now).replace(/^at /, '')}.`, ...fit.lines]
  return { ...patch, said, extra: { item: item.id, fits: fit.fits, worthALook: fit.worthALook } }
}

/** Items taken out of the plan, by id, or every item in a room. */
export function removeItems(survey: Survey, request: { readonly ids?: readonly string[]; readonly room?: string }): Patch {
  const plan = survey.plan
  const items = plan.items ?? []
  const ids = new Set<string>()
  for (const id of request.ids ?? []) ids.add(itemNamed(plan, id).id)
  if (request.room !== undefined) {
    const room = plan.rooms.find((r) => r.id === request.room)
    if (room === undefined) throw new EditRefused(`The plan has no room ${quoted(request.room)}.`)
    const rooms = roomShapes(indexPlan(plan))
    const inside = items.filter((item) => itemRoom(item, rooms)?.id === room.id)
    if (inside.length === 0) throw new EditRefused(`Room ${quoted(room.name || room.id)} has no fixtures or furniture to take out.`)
    for (const item of inside) ids.add(item.id)
  }
  if (ids.size === 0) throw new EditRefused('Name the items to take out (ids), or a room to clear (room).')
  const gone = items.filter((item) => ids.has(item.id))
  const said = [`Took out ${gone.length === 1 ? `${itemKindWord(gone[0]!.kind)} ${quoted(gone[0]!.id)}` : `${gone.length} items: ${listed(gone.map((i) => `${itemKindWord(i.kind)} ${quoted(i.id)}`), 8)}`}.`]
  return { ...emptyPatch(said), removeItems: ids, extra: { removed: [...ids] } }
}

/**
 * CNT-45: the change with every item that stands against a wall it moves moved with that wall,
 * and said. `after` reads the plan as the patch leaves it. The items the change moves or takes
 * out itself, and a change of the whole plan (a mirror, a turn), are left to it.
 */
export function followWalls(plan: FloorPlan, patch: Patch, after: (patch: Patch) => FloorPlan): Patch {
  if ((plan.items ?? []).length === 0 || patch.whole === true || (patch.walls.size === 0 && (patch.removeWalls?.size ?? 0) === 0 && (patch.addWalls ?? []).length === 0)) return patch
  const skip = new Set([...(patch.items?.keys() ?? []), ...(patch.removeItems ?? [])])
  const moved = itemsFollowWalls(plan, after(patch), skip)
  if (moved.size === 0) return patch
  const names = [...moved.keys()].map((id) => {
    const item = plan.items!.find((i) => i.id === id)!
    return `${itemKindWord(item.kind)} ${quoted(id)}`
  })
  return {
    ...patch,
    items: new Map([...(patch.items ?? new Map()), ...moved]),
    said: [...patch.said, `${moved.size === 1 ? `${sentence(names[0]!).slice(0, -1)} stands against a wall that moved, and moved with it` : `${moved.size} items stand against walls that moved, and moved with them: ${listed(names, 6)}`}.`],
  }
}
