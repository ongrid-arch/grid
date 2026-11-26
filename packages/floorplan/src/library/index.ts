/**
 * CNT-20 (C30): the library a plan places things from by name: Grid's built-in entries
 * (`builtIn.ts`), an office's own (`library/*.json` in the project folder, read by the command),
 * and the entries the plan holds itself.
 *
 * A name is looked for in the plan first, then in the office's files, then in Grid's: an office's
 * entry stands in for Grid's of the same name, and once placed it is copied into the plan, so the
 * plan reads the same without the folder, as a CAD drawing keeps the blocks inserted into it.
 *
 * An office file is JSON: `{ "version": "1", "items": [...], "rooms": [...] }`. An item is a
 * `LibraryItemSchema`; a room is a typical room (`TypicalRoom`): items by name set out from the
 * room's inside back-left corner. Pure: data in, data out.
 */
import { z } from 'zod'
import { LibraryItemSchema, ROOM_USES, text, type FloorPlan, type LibraryItem } from '../types/floorplan'
import { isItemKind } from '../geometry/itemKinds'
import { BUILT_IN_ITEMS, BUILT_IN_ROOMS, type TypicalRoom, type TypicalRoomItem } from './builtIn'

export { BUILT_IN_ITEMS, BUILT_IN_ROOMS, BUILT_IN_SOURCE, builtInItem, builtInRoom, type TypicalRoom, type TypicalRoomItem } from './builtIn'

/** At most this many entries in one office file, and items in one typical room. */
export const LIBRARY_FILE_MAX = 500
export const TYPICAL_ROOM_ITEMS_MAX = 50

const finite = (): z.ZodNumber => z.number().finite()

const TypicalRoomItemSchema = z
  .object({
    library: text('id'),
    at: z.tuple([finite(), finite()]),
    turn: finite().optional(),
    label: text('name').optional(),
  })
  .strict()

/** A typical room as an office file states it. */
export const TypicalRoomSchema = z
  .object({
    name: text('id'),
    label: text('name').optional(),
    use: z.enum(ROOM_USES).optional(),
    size: z.tuple([finite().positive(), finite().positive()]),
    items: z.array(TypicalRoomItemSchema).min(1).max(TYPICAL_ROOM_ITEMS_MAX),
    source: text('name').optional(),
  })
  .strict()

/** An office's library file. */
export const LibraryFileSchema = z
  .object({
    version: z.literal('1'),
    items: z.array(LibraryItemSchema.strict()).max(LIBRARY_FILE_MAX).optional(),
    rooms: z.array(TypicalRoomSchema).max(LIBRARY_FILE_MAX).optional(),
  })
  .strict()

export type LibraryFile = z.infer<typeof LibraryFileSchema>

/** Where a library entry was found. */
export type LibraryFrom = 'plan' | 'office' | 'grid'

export interface FoundItem {
  readonly entry: LibraryItem
  readonly from: LibraryFrom
  /** The office file it is in, from the project folder; null for the plan's and Grid's. */
  readonly file: string | null
}

export interface FoundRoom {
  readonly room: TypicalRoom
  readonly from: Exclude<LibraryFrom, 'plan'>
  readonly file: string | null
}

/** The library a plan places from: every name once, in the order it is looked for. */
export interface Library {
  readonly items: ReadonlyMap<string, FoundItem>
  readonly rooms: ReadonlyMap<string, FoundRoom>
  /** A name an office file gives twice, or that two files give: the first is kept. */
  readonly repeated: readonly { readonly name: string; readonly file: string }[]
}

/** An office's library file as read: its path from the project folder and what it holds. */
export interface OfficeFile {
  readonly file: string
  readonly items: readonly LibraryItem[]
  readonly rooms: readonly TypicalRoom[]
}

/** The plan's own entries, then the office's files in the order given, then Grid's. */
export function planLibrary(plan: Pick<FloorPlan, 'library'>, office: readonly OfficeFile[] = []): Library {
  const items = new Map<string, FoundItem>()
  const rooms = new Map<string, FoundRoom>()
  const repeated: { name: string; file: string }[] = []
  for (const entry of plan.library ?? []) if (!items.has(entry.name)) items.set(entry.name, { entry, from: 'plan', file: null })
  for (const { file, items: own, rooms: typical } of office) {
    for (const entry of own) {
      const known = items.get(entry.name)
      if (known === undefined) items.set(entry.name, { entry, from: 'office', file })
      else if (known.from === 'office') repeated.push({ name: entry.name, file })
    }
    for (const room of typical) {
      if (!rooms.has(room.name)) rooms.set(room.name, { room, from: 'office', file })
      else repeated.push({ name: room.name, file })
    }
  }
  for (const entry of BUILT_IN_ITEMS) if (!items.has(entry.name)) items.set(entry.name, { entry, from: 'grid', file: null })
  for (const room of BUILT_IN_ROOMS) if (!rooms.has(room.name)) rooms.set(room.name, { room, from: 'grid', file: null })
  return { items, rooms, repeated }
}

/** Why something could not be placed from the library: one line, naming what was asked. */
export class LibraryRefused extends Error {
  override readonly name = 'LibraryRefused'
}

/** A place on the plan, in metres. */
export type Pair = readonly [number, number]

/**
 * CNT-43: an item's own figures, stated on the item beside its library name, so the entry fills
 * only what is left out (C30 keeps a value the item states). `size` is its width and depth.
 */
export interface OwnFigures {
  readonly size?: Pair | undefined
  readonly height?: number | undefined
  readonly clearance?: number | undefined
  readonly label?: string | undefined
}

/** What placing by name asks for: the name, where, and, for one item, its own id and figures. */
export interface PlaceRequest {
  readonly name: string
  readonly at: Pair
  readonly turn?: number
  readonly floor?: string
  readonly id?: string
  readonly own?: OwnFigures
}

/** What placing by name adds to the plan: the items as their file will hold them, and the entries to copy in. */
export interface Placed {
  /** The item records to add, each by its library name: `{ id, library, at, turn?, floor?, label? }`. */
  readonly items: readonly Readonly<Record<string, unknown>>[]
  /** The office entries the plan must hold for them to read the same without the folder. */
  readonly copy: readonly LibraryItem[]
  /** Whether a typical room was placed, and which. */
  readonly room: FoundRoom | null
  /** CNT-43: the kind it was placed by, when the name is a kind and no library entry. */
  readonly kind: string | null
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6
const turned = (turn: number): number => round(((turn % 360) + 360) % 360)

/**
 * Places a library item or a typical room by name: an item with its middle at `at`, or a typical
 * room with its inside back-left corner at `at`, its items set out from there and the whole turned
 * by `turn` (degrees counter-clockwise) about that corner. Ids are the entry's names, made unique
 * against `taken`. Refused for a name no library holds, naming the nearest.
 *
 * CNT-43: one item takes its own figures (`own`), written on it beside its library name. A name
 * that is no entry but a kind Grid holds places a plain item of that kind, which then needs its
 * size and height. A typical room takes none: it is many items.
 */
export function placeFromLibrary(library: Library, request: PlaceRequest, taken: ReadonlySet<string>): Placed {
  const used = new Set(taken)
  const idFor = (base: string): string => {
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return id
  }
  const copies = new Map<string, LibraryItem>()
  const where = (at: Pair, turn: number): Record<string, unknown> => ({
    at: [round(at[0]), round(at[1])],
    ...(turned(turn) === 0 ? {} : { turn: turned(turn) }),
    ...(request.floor === undefined ? {} : { floor: request.floor }),
  })
  const record = (name: string, at: Pair, turn: number, id: string, label?: string): Record<string, unknown> => {
    const found = library.items.get(name)
    if (found === undefined) throw new LibraryRefused(`no library holds an item named ${JSON.stringify(name)}`)
    if (!isItemKind(found.entry.kind)) throw new LibraryRefused(`library item ${JSON.stringify(name)} is a ${JSON.stringify(found.entry.kind)}, a kind Grid does not hold`)
    if (found.from === 'office') copies.set(name, found.entry)
    return { id, library: name, ...where(at, turn), ...(label === undefined ? {} : { label }) }
  }
  const turn = request.turn ?? 0
  const own = request.own ?? {}
  const figures = {
    ...(own.size === undefined ? {} : { size: [round(own.size[0]), round(own.size[1])] }),
    ...(own.height === undefined ? {} : { height: round(own.height) }),
    ...(own.clearance === undefined ? {} : { clearance: round(own.clearance) }),
    ...(own.label === undefined ? {} : { label: own.label }),
  }
  const room = library.rooms.get(request.name)
  const byKind = !library.items.has(request.name) && room === undefined && isItemKind(request.name)
  if (library.items.has(request.name) || byKind) {
    if (request.id !== undefined && used.has(request.id)) throw new LibraryRefused(`id ${JSON.stringify(request.id)} is taken by another part of the plan`)
    if (byKind && (own.size === undefined || own.height === undefined)) {
      throw new LibraryRefused(`${JSON.stringify(request.name)} is a kind, not a library entry, so give its width, depth and height to place one`)
    }
    const id = request.id ?? idFor(request.name)
    if (request.id !== undefined) used.add(request.id)
    if (byKind) return { items: [{ id, kind: request.name, ...where(request.at, turn), ...figures }], copy: [], room: null, kind: request.name }
    return { items: [{ ...record(request.name, request.at, turn, id), ...figures }], copy: [...copies.values()], room: null, kind: null }
  }
  if (room === undefined) throw new LibraryRefused(`no library holds an item or a typical room named ${JSON.stringify(request.name)}`)
  if (Object.keys(figures).length > 0) throw new LibraryRefused(`${JSON.stringify(request.name)} is a typical room of several items, so it takes no size, height, clear floor or label of its own: place its items one by one to size them`)
  const r = (turn * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const items = room.room.items.map((part: TypicalRoomItem) => {
    const [x, y] = part.at
    const at: Pair = [request.at[0] + x * cos - y * sin, request.at[1] + x * sin + y * cos]
    return record(part.library, at, turn + (part.turn ?? 0), idFor(part.library), part.label)
  })
  return { items, copy: [...copies.values()], room, kind: null }
}

/**
 * The floor a library item or typical room needs, width × depth in metres: an item's footprint
 * with the clear floor it keeps in front of it, or a typical room's size. Null for a name no
 * library holds.
 */
export function libraryFootprint(library: Library, name: string): { readonly width: number; readonly depth: number; readonly what: 'item' | 'room' } | null {
  const item = library.items.get(name)
  if (item !== undefined) return { width: item.entry.size[0], depth: item.entry.size[1] + (item.entry.clearance ?? 0), what: 'item' }
  const room = library.rooms.get(name)
  if (room !== undefined) return { width: room.room.size[0], depth: room.room.size[1], what: 'room' }
  return null
}

/** Every name the library holds, items then typical rooms, for a refusal that lists them. */
export function libraryNames(library: Library): string[] {
  return [...library.items.keys(), ...library.rooms.keys()]
}
