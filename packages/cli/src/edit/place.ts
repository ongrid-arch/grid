/**
 * CNT-20 (C30): placing a library item or a typical room by name: "put a double bed in the main
 * bedroom", "use our standard bathroom here". The items are written as their file holds them, by
 * their library name (`library`), so the entry gives their size, height and clear floor every
 * time; an office's entry is copied into the plan's own `library` with them. The answer names the
 * room each landed in and what Grid's checks say of it: a wall it runs into, an item it stands in,
 * the clear floor it keeps blocked.
 */
import { floorOf, indexPlan, isItemKind, itemKindWord, itemRoom, roomShapes, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { LibraryRefused, libraryNames, placeFromLibrary, type Library, type PlaceRequest } from '@ongrid/floorplan/library'
import { english, name as idName, said as sentence } from '@ongrid/floorplan/messages'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { emptyPatch, readingAfter, type Patch } from './edits'
import { idHolder } from './holder'
import { EditRefused } from './refused'

/** The checks on an item that say whether it fits where it was put. */
export const FIT_CODES = new Set(['item/outside-rooms', 'item/into-wall', 'item/overlap', 'item/clearance-blocked', 'item/too-tall', 'item/blocks-doorway', 'item/blocks-window', 'opening/door-hits-item'])

const n2 = (value: number): string => value.toFixed(2)

/** Every id the plan's parts have, so a placed item takes one of its own. */
function takenIds(plan: FloorPlan): Set<string> {
  return new Set([...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.items ?? []), ...(plan.columns ?? [])].map((part) => part.id))
}

export function placeItems(survey: Survey, library: Library, request: PlaceRequest, problems: readonly string[] = []): Patch {
  const leftOut = problems.map((problem) => `Left out of the library: ${problem}.`)
  const plan = survey.plan
  // WRT-46: an id a part holds is refused naming that part and where it is, as a kept item is easily taken for cleared.
  const taken = takenIds(plan)
  if (request.id !== undefined && taken.has(request.id) && (library.items.has(request.name) || (!library.rooms.has(request.name) && isItemKind(request.name)))) {
    throw new EditRefused([english(sentence('edit.idTaken.place', { name: idName(request.name), id: idName(request.id), holder: idHolder(plan, request.id) })), ...leftOut].join(' '))
  }
  let placed: ReturnType<typeof placeFromLibrary>
  try {
    placed = placeFromLibrary(library, request, taken)
  } catch (error) {
    if (!(error instanceof LibraryRefused)) throw error
    const meant = likelyId(request.name, libraryNames(library))
    throw new EditRefused([`Can't place ${quoted(request.name)}: ${error.message}.${meant === null ? '' : ` Did you mean ${quoted(meant)}?`} grid_measure what=library lists what the library holds.`, ...leftOut].join(' '))
  }
  const patch: Patch = { ...emptyPatch([]), addItems: placed.items.map((item) => ({ ...item })), ...(placed.copy.length === 0 ? {} : { addLibrary: placed.copy.map((entry) => ({ ...entry })) }) }
  // The plan as it will be read, to say where each item landed and what the checks say of it.
  const after = readingAfter(plan, patch)
  const index = indexPlan(after)
  const { issues, broken } = validatePlan(after, index)
  const rooms = roomShapes(index, broken)
  const ids = new Set(placed.items.map((item) => item.id as string))
  // CNT-43: an item given its own size, height or clear floor is said at the size given, not the entry's.
  const own = request.own ?? {}
  const sized = own.size !== undefined || own.height !== undefined || own.clearance !== undefined
  const said: string[] = [...leftOut]
  if (placed.room !== null) {
    const { room, from, file } = placed.room
    said.push(`Placed typical room ${quoted(room.name)} (${n2(room.size[0])} × ${n2(room.size[1])} m${from === 'office' ? `, from ${file}` : ''}): ${placed.items.length} item${placed.items.length === 1 ? '' : 's'}, set out from its back-left corner at (${n2(request.at[0])}, ${n2(request.at[1])}).`)
  }
  for (const item of (after.items ?? []).filter((i) => ids.has(i.id))) {
    const found = library.items.get(item.library ?? '')
    const room = itemRoom(item, rooms)
    const where = room === null ? 'in no room' : `in room ${quoted(room.name || room.id)}`
    const source = sized ? ', at the size given' : found === undefined ? '' : found.from === 'office' ? `, from ${found.file}` : found.from === 'grid' ? ", Grid's own size, not a code figure" : ", the plan's own entry"
    const clear = item.clearance === undefined || item.clearance === 0 ? '' : `, keeping ${n2(item.clearance)} m clear in front`
    said.push(
      `Placed ${itemKindWord(item.kind)} ${quoted(item.id)} ${item.library === undefined ? '' : `from ${quoted(item.library)} `}(${n2(item.size[0])} × ${n2(item.size[1])} m, ${n2(item.height)} m high${clear}${source}) at (${n2(item.at[0])}, ${n2(item.at[1])})${item.turn === undefined ? '' : `, turned ${item.turn}°`}, ${where}${floorOf(item) === 'ground' && request.floor === undefined ? '' : ` on floor ${quoted(floorOf(item))}`}.`
    )
  }
  const fit = issues.filter((issue) => FIT_CODES.has(issue.code) && (ids.has(issue.id) || ((issue as { readonly hits?: readonly string[] }).hits ?? []).some((hit) => ids.has(hit))))
  if (fit.length === 0) said.push('It fits: nothing placed runs into a wall or another item, or stands in the clear floor one keeps.')
  else for (const issue of fit) said.push(`Worth a look: ${issue.message}`)
  if (placed.copy.length > 0) said.push(`The plan now holds ${placed.copy.map((entry) => quoted(entry.name)).join(', ')} in its own library, so it reads the same without the library folder.`)
  return { ...patch, said, extra: { placed: placed.items.map((item) => item.id as string), fits: fit.length === 0, worthALook: fit.map((issue) => ({ code: issue.code, id: issue.id, message: issue.message })) } }
}
