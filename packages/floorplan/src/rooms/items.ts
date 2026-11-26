/**
 * Fixtures and furniture in rooms text and through the tools (CNT-45): one reading of an item's
 * words, so an `item` line, `grid_add_item` and `grid_move_item` place an item the same way.
 *
 *   item <id> ["<label>"] <name> [<w> x <d>] [<h> high] [clear <m>] in <room> against <side>
 *        [, at <end> | , <n> from <end> | , full width [<d> deep]]
 *   item <id> ["<label>"] <name> [<w> x <d>] [<h> high] [clear <m>] at x,y [turn <degrees>] [on <floor>]
 *   raw item { ...Grid's own JSON for an item... }     (raw fixture and raw furniture are the same)
 *
 * `<name>` is a library entry (the plan's own, else Grid's: `bath`, `double-bed`, `wardrobe`) or a
 * kind (`toilet`, `storage`). A kind with no size is placed as Grid's first entry of that kind; a
 * kind given a size and no height takes that entry's height, said as a guess.
 *
 * Against a side, the item's back lies on the room's inside face on that side (the edge of the
 * room's outline whose outward normal is nearest the side named, the furthest out of those), its
 * width along it and its front into the room, so its turn is worked out: unturned an item's back
 * faces -y (C6), so against south it is 0, east 90, north 180 and west 270. It is centred on the
 * side unless `at <end>` puts it in that corner or `<n> from <end>` that far from it; `full width`
 * makes it as long as the side, a built-in wardrobe or a cupboard wall.
 *
 * The read-back writes each item as a line (`itemLines`): against its side when those words give
 * back its own place, at its point otherwise, and raw when rooms text cannot name it, so writing
 * the text again keeps it as it is. `itemsFollowWalls` keeps an item against the wall it stands
 * against when that wall moves.
 *
 * Pure: words in, an item out, or the reason there is none.
 */
import { ItemSchema, type FloorPlan, type Item, type LibraryItem, type Room, type Wall } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { floorOf, planFloors } from '../geometry/floors'
import { tryRoomPolygon } from '../geometry/room'
import { itemRoom, roomShapes } from '../geometry/items'
import { isItemKind, itemKinds } from '../geometry/itemKinds'
import { wallAxis } from '../geometry/wall'
import { tolerance } from '../geometry/tolerances'
import { BUILT_IN_ITEMS, builtInItem } from '../library/builtIn'
import { planLibrary, type Library } from '../library/index'
import { likelyId } from '../types/nearest'
import { plainId } from '../types/planText'
import { isPointWord, numberOf, pointOf, RoomsStop, type LineWord, type PlainNumbers, PLAIN_METRES } from './words'

type P = readonly [number, number]

/** The first word of the line this file reads. */
export const ITEM_LINE_WORDS: readonly string[] = ['item']

/** The words after `raw` that take Grid's own JSON for an item. */
export const RAW_ITEM_KINDS: readonly string[] = ['item', 'fixture', 'furniture']

/** The sides of a room an item stands against, and the ends of a side: the sides of the drawing (C4). */
export const ITEM_SIDES = ['north', 'east', 'south', 'west'] as const
export type ItemSide = (typeof ITEM_SIDES)[number]

const COMPASS: Readonly<Record<ItemSide, P>> = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] }

/** What an item line or a tool says about one item. */
export interface ItemWords {
  readonly id: string
  readonly label?: string
  /** A library entry's name or a kind. */
  readonly name: string
  readonly size?: P
  readonly depth?: number
  readonly height?: number
  readonly clearance?: number
  /** The room it stands in, with `against`; or only to say its floor, with `at`. */
  readonly room?: string
  readonly against?: ItemSide
  /** The corner it goes in along that side: `at west`. */
  readonly end?: ItemSide
  /** How far from that end its nearer side is: `0.3 from west`. */
  readonly from?: { readonly side: ItemSide; readonly distance: number }
  readonly fullWidth?: boolean
  /** Its middle on the plan, and its turn, in place of a side. */
  readonly at?: P
  readonly turn?: number
  readonly floor?: string
}

/** Why an item's words give no item, in a sentence that names what to change. */
export class ItemRefused extends Error {
  override readonly name = 'ItemRefused'
}

/** An item placed from its words. */
export interface ItemMade {
  /** The item as its file will hold it: by its library name, with only the figures stated. */
  readonly record: Readonly<Record<string, unknown>>
  /** The item as Grid reads it, every figure filled in. */
  readonly item: Item
  /** The room it was placed against a side of; null at a point. */
  readonly room: string | null
  /** The office entries the plan must take in to read it the same (a tool's library only). */
  readonly copy: readonly LibraryItem[]
  /** What Grid chose, in a sentence each. */
  readonly guesses: readonly string[]
}

/** A length for a sentence: to the millimetre, no trailing zeros. */
const m = (v: number): string => String(Math.round(v * 1000) / 1000 + 0)
/** A length or an angle for a line Grid reads again: exact to the nanometre. */
const exact = (v: number): string => String(Math.round(v * 1e9) / 1e9 + 0)
const settled = (v: number): number => Math.round(v * 1e9) / 1e9 + 0
/** A turn in degrees, from 0 up to 360. */
const turned = (deg: number): number => {
  const t = settled(((deg % 360) + 360) % 360)
  return t >= 360 ? 0 : t
}

const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
const add = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k]
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]

/** The compass word nearest a direction, or null when it lies between two (more than 45 degrees from each). */
function sideNearest(v: P): ItemSide | null {
  let best: ItemSide | null = null
  let most = Math.SQRT1_2
  for (const side of ITEM_SIDES) {
    const d = dot(COMPASS[side], v)
    if (d > most) {
      most = d
      best = side
    }
  }
  return best
}

/** A room of the plan by id: a room written on a later floor may carry its floor's id in front. */
function roomNamed(plan: FloorPlan, id: string): Room | undefined {
  const floors = planFloors(plan).map((f) => f.id)
  return plan.rooms.find((r) => r.id === id) ?? plan.rooms.find((r) => floors.some((f) => r.id === `${f}-${id}` && floorOf(r) === f))
}

/** One side of a room's inside outline: from `a` to `b`, `u` along it, `out` its outward normal. */
interface Side {
  readonly a: P
  readonly b: P
  readonly u: P
  readonly out: P
  readonly length: number
}

/** The edges of a room's inside outline, counter-clockwise, each with its outward normal. */
function sidesOf(poly: readonly { x: number; y: number }[]): Side[] {
  const signed = poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length]!
    return s + (p.x * q.y - q.x * p.y)
  }, 0)
  const ring = signed >= 0 ? poly : [...poly].reverse()
  const sides: Side[] = []
  for (let i = 0; i < ring.length; i++) {
    const a: P = [ring[i]!.x, ring[i]!.y]
    const b: P = [ring[(i + 1) % ring.length]!.x, ring[(i + 1) % ring.length]!.y]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length <= tolerance('sameFace')) continue
    const u: P = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    sides.push({ a, b, u, out: [u[1], -u[0]], length })
  }
  return sides
}

/** The side of a room an item named against `side` stands on: facing it, the furthest out, the longest of those. */
function sideFacing(sides: readonly Side[], side: ItemSide): Side | null {
  const dir = COMPASS[side]
  const facing = sides.filter((s) => dot(s.out, dir) > Math.SQRT1_2)
  if (facing.length === 0) return null
  const reach = (s: Side): number => dot(add(s.a, s.b), dir) / 2
  const far = Math.max(...facing.map(reach))
  const near = tolerance('itemIntoWall')
  return facing.filter((s) => reach(s) >= far - near).sort((x, y) => y.length - x.length)[0]!
}

/** The library entry an item's name is, or the kind it is, with what Grid chose for it. */
function entryOf(library: Library, words: ItemWords): { found: ReturnType<Library['items']['get']>; kind: string; name: string; guesses: string[] } {
  const found = library.items.get(words.name)
  if (found !== undefined) {
    if (!isItemKind(found.entry.kind)) throw new ItemRefused(`library item '${words.name}' is a '${found.entry.kind}', a kind Grid does not hold.`)
    return { found, kind: found.entry.kind, name: words.name, guesses: [] }
  }
  if (!isItemKind(words.name)) {
    const meant = likelyId(words.name, [...library.items.keys(), ...itemKinds()])
    throw new ItemRefused(`'${words.name}' is neither a library entry nor a kind of item Grid holds${meant === null ? '' : `: did you mean '${meant}'?`} The kinds are ${itemKinds().join(', ')}; grid_measure what=library lists the entries.`)
  }
  const first = BUILT_IN_ITEMS.find((entry) => entry.kind === words.name)
  // A kind with no size is Grid's first entry of that kind.
  if (words.size === undefined && !(words.fullWidth === true && words.depth !== undefined && words.height !== undefined)) {
    if (first === undefined) throw new ItemRefused(`'${words.name}' is a kind with no entry in Grid's library, so give its size and height: '<w> x <d>', '<h> high'.`)
    return { found: library.items.get(first.name) ?? { entry: first, from: 'grid', file: null }, kind: first.kind, name: first.name, guesses: [`a ${words.name} with no size given is Grid's '${first.name}', ${m(first.size[0])} × ${m(first.size[1])} m.`] }
  }
  return { found: undefined, kind: words.name, name: words.name, guesses: [] }
}

/**
 * The item its words give, placed against a side of its room or at its point. Throws
 * `ItemRefused`, its sentence starting in small letters, for a caller to put its own start on.
 * `library` is the plan's own and Grid's unless a tool gives the office's too.
 */
export function placeItem(plan: FloorPlan, words: ItemWords, library: Library = planLibrary(plan)): ItemMade {
  const positive = (v: number | undefined, what: string): void => {
    if (v !== undefined && !(Number.isFinite(v) && v > 0)) throw new ItemRefused(`${what} is a length more than 0.`)
  }
  positive(words.size?.[0], "an item's width")
  positive(words.size?.[1], "an item's depth")
  positive(words.depth, "an item's depth")
  positive(words.height, "an item's height")
  if (words.clearance !== undefined && !(Number.isFinite(words.clearance) && words.clearance >= 0)) throw new ItemRefused('the clear floor kept in front is a length, 0 or more.')
  const { found, kind, name, guesses } = entryOf(library, words)
  const entry = found?.entry
  let width = words.size?.[0] ?? entry?.size[0]
  let depth = words.depth ?? words.size?.[1] ?? entry?.size[1]
  let height = words.height ?? entry?.height
  if (entry === undefined && height === undefined) {
    const first = BUILT_IN_ITEMS.find((e) => e.kind === kind)
    if (first === undefined) throw new ItemRefused(`a ${kind} is given its height, '<h> high'.`)
    height = first.height
    guesses.push(`a ${kind} given no height stands ${m(first.height)} m high, as Grid's '${first.name}'.`)
  }
  const placedBySide = words.against !== undefined
  if (placedBySide && words.at !== undefined) throw new ItemRefused("give the side of the room it stands against ('against north') or its point ('at x,y'), not both.")
  if (!placedBySide && (words.end !== undefined || words.from !== undefined || words.fullWidth === true)) throw new ItemRefused("'at <end>', 'from' and 'full width' place an item along the side it stands against: say 'against <side>' too.")
  if (placedBySide && words.turn !== undefined) throw new ItemRefused('an item against a side is turned to face into the room: leave its turn out.')
  if (words.end !== undefined && words.from !== undefined) throw new ItemRefused("give 'at <end>' or '<n> from <end>', not both.")
  if (words.fullWidth === true && (words.end !== undefined || words.from !== undefined)) throw new ItemRefused("a full-width item fills the side, so it takes no 'at' or 'from'.")
  if (words.fullWidth === true && words.size !== undefined && words.depth === undefined) depth = words.size[1]
  let at: P
  let turn: number
  let floor: string | undefined
  let roomId: string | null = null
  if (placedBySide) {
    if (words.room === undefined) throw new ItemRefused(`say the room whose ${words.against} side it stands against: 'in <room> against ${words.against}'.`)
    const room = roomNamed(plan, words.room)
    if (room === undefined) throw new ItemRefused(`the plan has no room '${words.room}' to place it in.`)
    const poly = tryRoomPolygon(room, indexPlan(plan))
    if (poly === null) throw new ItemRefused(`Grid cannot draw room ${room.id}, so it has no side to stand the item against.`)
    const side = sideFacing(sidesOf(poly), words.against!)
    if (side === null) throw new ItemRefused(`room ${room.id} has no side facing ${words.against}.`)
    if (words.fullWidth === true) {
      width = side.length
      guesses.push(`full width along the ${words.against} side of ${room.id} is ${m(side.length)} m.`)
    }
    if (width === undefined || depth === undefined) throw new ItemRefused("give its size, '<w> x <d>'.")
    const near = tolerance('itemIntoWall')
    if (width > side.length + near) throw new ItemRefused(`${m(width)} m wide, it does not fit along the ${words.against} side of room ${room.id}, which is ${m(side.length)} m long.`)
    const endWord = words.end ?? words.from?.side
    let s = side.length / 2
    if (endWord !== undefined) {
      const along = dot(COMPASS[endWord], side.u)
      if (Math.abs(along) < Math.SQRT1_2) {
        const ends = [sideNearest([-side.u[0], -side.u[1]]), sideNearest(side.u)].filter((x): x is ItemSide => x !== null)
        throw new ItemRefused(`the ${words.against} side of room ${room.id} has no ${endWord} end${ends.length === 2 ? `: its ends are ${ends[0]} and ${ends[1]}` : ''}.`)
      }
      const gap = words.from?.distance ?? 0
      if (!(Number.isFinite(gap) && gap >= 0)) throw new ItemRefused("'from' takes a length, 0 or more.")
      s = along < 0 ? gap + width / 2 : side.length - gap - width / 2
      if (s - width / 2 < -near || s + width / 2 > side.length + near) throw new ItemRefused(`${m(gap)} m from the ${endWord} end, a ${m(width)} m item runs past the ${words.against} side of room ${room.id}, ${m(side.length)} m long.`)
    }
    const inward: P = [-side.out[0], -side.out[1]]
    at = add(add(side.a, side.u, s), inward, depth / 2)
    turn = turned((Math.atan2(-inward[0], inward[1]) * 180) / Math.PI)
    floor = floorOf(room)
    roomId = room.id
  } else {
    if (words.at === undefined) throw new ItemRefused("say where it goes: 'in <room> against <side>', or its middle, 'at x,y'.")
    at = words.at
    turn = turned(words.turn ?? 0)
    if (words.floor !== undefined) floor = words.floor
    else if (words.room !== undefined) {
      const room = roomNamed(plan, words.room)
      if (room === undefined) throw new ItemRefused(`the plan has no room '${words.room}'.`)
      floor = floorOf(room)
    }
  }
  if (words.floor !== undefined && floor !== words.floor) throw new ItemRefused(`room ${roomId} is on floor ${floor}, not ${words.floor}.`)
  const floors = planFloors(plan).map((f) => f.id)
  if (floor !== undefined && floors.length > 0 && !floors.includes(floor)) throw new ItemRefused(`the plan has no floor '${floor}' (its floors: ${floors.join(', ')}).`)
  const sized = words.size !== undefined || words.fullWidth === true || words.depth !== undefined || entry === undefined
  const record: Record<string, unknown> = {
    id: words.id,
    ...(entry === undefined ? { kind } : { library: name }),
    at: [settled(at[0]), settled(at[1])],
    ...(turn === 0 ? {} : { turn }),
    ...(floor === undefined || (floor === 'ground' && words.floor === undefined) ? {} : { floor }),
    ...(words.label === undefined ? {} : { label: words.label }),
    ...(sized ? { size: [settled(width!), settled(depth!)] } : {}),
    ...(words.height !== undefined || entry === undefined ? { height: settled(height!) } : {}),
    ...(words.clearance === undefined ? {} : { clearance: settled(words.clearance) }),
  }
  const read = ItemSchema.safeParse({
    ...record,
    kind,
    size: [settled(width!), settled(depth!)],
    height: settled(height!),
    ...(words.label === undefined && entry?.label !== undefined ? { label: entry.label } : {}),
    ...(words.clearance === undefined && entry?.clearance !== undefined ? { clearance: entry.clearance } : {}),
  })
  if (!read.success) throw new ItemRefused(`the item would not be read: ${read.error.issues[0]!.path.join('.')} ${read.error.issues[0]!.message}.`)
  const copy = found !== undefined && found.from === 'office' ? [found.entry] : []
  return { record, item: read.data, room: roomId, copy, guesses }
}

/** An id an item line gives back as it is: one word of plain letters. */
const readable = (id: string): boolean => /^[A-Za-z0-9._-]+$/.test(id) && plainId(id) === id

const quoteName = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`)

/** An item line from its words, as rooms text reads it. */
export function itemLine(words: ItemWords): string {
  const parts = [`item ${words.id}${words.label === undefined ? '' : ` ${quoteName(words.label)}`} ${words.name}`]
  if (words.size !== undefined && words.fullWidth !== true) parts.push(`${exact(words.size[0])} x ${exact(words.size[1])}`)
  if (words.height !== undefined) parts.push(`${exact(words.height)} high`)
  if (words.clearance !== undefined) parts.push(`clear ${exact(words.clearance)}`)
  let tail = ''
  if (words.against !== undefined) {
    parts.push(`in ${words.room} against ${words.against}`)
    if (words.fullWidth === true) tail = `, full width${words.depth === undefined ? '' : ` ${exact(words.depth)} deep`}`
    else if (words.end !== undefined) tail = `, at ${words.end}`
    else if (words.from !== undefined) tail = `, ${exact(words.from.distance)} from ${words.from.side}`
  } else if (words.at !== undefined) {
    parts.push(`at ${exact(words.at[0])},${exact(words.at[1])}`)
    if (words.turn !== undefined && words.turn !== 0) parts.push(`turn ${exact(words.turn)}`)
    if (words.floor !== undefined) parts.push(`on ${words.floor}`)
  }
  return `${parts.join(' ')}${tail}`
}

/** Whether two items stand in one place: the same middle, turn, size and floor, to the nanometre's rounding. */
function samePlace(a: Item, b: Item): boolean {
  const near = tolerance('sameFace')
  const turnA = turned(a.turn ?? 0)
  const turnB = turned(b.turn ?? 0)
  const turnGap = Math.min(Math.abs(turnA - turnB), 360 - Math.abs(turnA - turnB))
  return (
    Math.abs(a.at[0] - b.at[0]) <= near &&
    Math.abs(a.at[1] - b.at[1]) <= near &&
    turnGap <= near &&
    Math.abs(a.size[0] - b.size[0]) <= near &&
    Math.abs(a.size[1] - b.size[1]) <= near &&
    Math.abs(a.height - b.height) <= near &&
    floorOf(a) === floorOf(b) &&
    a.kind === b.kind &&
    (a.label ?? '') === (b.label ?? '') &&
    (a.clearance ?? 0) === (b.clearance ?? 0)
  )
}

/** The figures an item states itself, as words: what its library entry does not fill. */
function figureWords(item: Item): Pick<ItemWords, 'name' | 'label' | 'size' | 'height' | 'clearance'> {
  const filled = new Set(item.fromLibrary ?? [])
  const byKind = item.library === undefined
  return {
    name: item.library ?? item.kind,
    ...(item.label !== undefined && !filled.has('label') ? { label: item.label } : {}),
    ...(byKind || !filled.has('size') ? { size: [item.size[0], item.size[1]] as P } : {}),
    ...(byKind || !filled.has('height') ? { height: item.height } : {}),
    ...(item.clearance !== undefined && !filled.has('clearance') ? { clearance: item.clearance } : {}),
  }
}

/**
 * The words of an item that stands against a side of its room and give back its own place, or
 * null when none do: the read-back then writes its point.
 */
export function itemWordsAgainst(plan: FloorPlan, item: Item, rooms = roomShapes(indexPlan(plan))): ItemWords | null {
  const room = itemRoom(item, rooms)
  if (room === null || !readable(room.id)) return null
  const poly = tryRoomPolygon(room, indexPlan(plan))
  if (poly === null) return null
  const sides = sidesOf(poly)
  const figures = figureWords(item)
  const near = tolerance('sameFace')
  for (const against of ITEM_SIDES) {
    const side = sideFacing(sides, against)
    if (side === null) continue
    const inward: P = [-side.out[0], -side.out[1]]
    const s = dot(sub(item.at, side.a), side.u)
    const back = dot(sub(item.at, side.a), inward) - item.size[1] / 2
    if (Math.abs(back) > near) continue
    const startEnd = sideNearest([-side.u[0], -side.u[1]])
    const endEnd = sideNearest(side.u)
    const w = item.size[0]
    const base = { id: item.id, ...figures, room: room.id, against }
    const options: ItemWords[] = []
    if (Math.abs(w - side.length) <= near && figures.size !== undefined) {
      const { size, ...rest } = base as typeof base & { size?: P }
      options.push({ ...rest, fullWidth: true, ...(size !== undefined ? { depth: size[1] } : {}) })
    }
    if (Math.abs(s - side.length / 2) <= near) options.push(base)
    if (startEnd !== null && Math.abs(s - w / 2) <= near) options.push({ ...base, end: startEnd })
    if (endEnd !== null && Math.abs(s - (side.length - w / 2)) <= near) options.push({ ...base, end: endEnd })
    if (startEnd !== null && s - w / 2 > 0) options.push({ ...base, from: { side: startEnd, distance: settled(s - w / 2) } })
    for (const words of options) {
      try {
        if (samePlace(placeItem(plan, words).item, item)) return words
      } catch {
        // Words that do not place it are not its words.
      }
    }
  }
  return null
}

/**
 * The plan's items as rooms text: each against its side when that gives back its place, at its
 * point otherwise, and raw when rooms text cannot name it, so it is written again unchanged.
 */
export function itemLines(plan: FloorPlan): string[] {
  const items = plan.items ?? []
  if (items.length === 0) return []
  const rooms = roomShapes(indexPlan(plan))
  const own = new Set((plan.library ?? []).map((entry) => entry.name))
  const others = new Set([...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id))
  const floors = planFloors(plan).map((f) => f.id)
  const seen = new Set<string>()
  return items.map((item) => {
    const twice = seen.has(item.id) || others.has(item.id)
    seen.add(item.id)
    // An item of the plan's own library entry, which rooms text does not hold, is written with every figure.
    if (item.library !== undefined && (own.has(item.library) || builtInItem(item.library) === undefined)) return `raw item ${JSON.stringify(statedOf({ ...item, fromLibrary: [] }))}`
    const label = item.label
    const plainLabel = label === undefined || !(label.includes('"') && label.includes("'"))
    if (twice || !readable(item.id) || !readable(item.library ?? item.kind) || !isItemKind(item.kind) || !plainLabel || (item.floor !== undefined && !readable(item.floor))) {
      return `raw item ${JSON.stringify(statedOf(item))}`
    }
    const against = itemWordsAgainst(plan, item, rooms)
    if (against !== null) return itemLine(against)
    const words: ItemWords = {
      id: item.id,
      ...figureWords(item),
      at: [item.at[0], item.at[1]],
      ...(turned(item.turn ?? 0) === 0 ? {} : { turn: turned(item.turn ?? 0) }),
      ...(floorOf(item) !== 'ground' || (item.floor !== undefined && floors.some((f) => f !== 'ground')) ? { floor: floorOf(item) } : {}),
    }
    try {
      if (samePlace(placeItem(plan, words).item, item)) return itemLine(words)
    } catch {
      // Words that do not place it: Grid's own JSON.
    }
    return `raw item ${JSON.stringify(statedOf(item))}`
  })
}

/** An item as its file holds it: what its library entry fills left out. */
function statedOf(item: Item): Record<string, unknown> {
  const { fromLibrary, ...rest } = item
  const out: Record<string, unknown> = { ...rest }
  for (const key of fromLibrary ?? []) delete out[key]
  return out
}

const USAGE =
  "write 'item <id> [\"<label>\"] <name> [<w> x <d>] [<h> high] [clear <m>] in <room> against <north|east|south|west> [, at <end> | , <n> from <end> | , full width]', or at its middle: 'item <id> <name> at x,y [turn <degrees>] [on <floor>]'."

const isSide = (word: string | undefined): word is ItemSide => word !== undefined && (ITEM_SIDES as readonly string[]).includes(word)

/** The words of an item line, after `item`; `at` its line, or 0 from a tool. */
export function itemOfWords(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers = PLAIN_METRES): ItemWords {
  const lead = at > 0 ? `line ${at}: ` : ''
  const stop = (message: string): never => {
    throw new RoomsStop('rooms/item', `${lead}${message}`, at > 0 ? at : null)
  }
  const id = t[1]
  if (id === undefined || quoted[1]?.quoted === true) return stop(`an item needs an id after 'item'; ${USAGE}`)
  let i = 2
  let label: string | undefined
  if (quoted[2]?.quoted === true) {
    label = quoted[2].text
    i = 3
  }
  const name = t[i]
  if (name === undefined || quoted[i]?.quoted === true) return stop(`an item says what it is after its id: a library entry (bath, double-bed, wardrobe) or a kind (toilet, storage); ${USAGE}`)
  i++
  const words: { -readonly [K in keyof ItemWords]?: ItemWords[K] } = {}
  const once = <K extends keyof ItemWords>(key: K, value: ItemWords[K], word: string): void => {
    if (words[key] !== undefined) stop(`the item says '${word}' twice.`)
    words[key] = value
  }
  const side = (word: string | undefined, after: string): ItemSide => (isSide(word) ? word : stop(`'${after}' takes north, east, south or west${word === undefined ? '' : `, not '${word}'`}.`))
  while (i < t.length) {
    const word = t[i]!
    const next = t[i + 1]
    if (word === 'clear') {
      if (next === undefined) return stop("'clear' takes the clear floor kept in front, in metres.")
      once('clearance', numberOf(next, at, plain), 'clear')
      i += 2
    } else if (word === 'in' || word === 'on') {
      if (next === undefined) return stop(`'${word}' takes ${word === 'in' ? 'a room' : 'a floor'}.`)
      once(word === 'in' ? 'room' : 'floor', next, word)
      i += 2
    } else if (word === 'against') {
      once('against', side(next, 'against'), 'against')
      i += 2
    } else if (word === 'full' && next === 'width') {
      once('fullWidth', true, 'full width')
      i += 2
    } else if (word === 'at') {
      if (next !== undefined && isPointWord(next)) once('at', pointOf(next, at, plain), 'at')
      else if (next === 'centre' || next === 'center' || next === 'middle') {
        // Centred is where an item against a side goes when nothing else is said.
      } else once('end', side(next, 'at'), 'at')
      i += 2
    } else if (word === 'turn' || word === 'turned') {
      const n = next === undefined ? NaN : Number(next)
      if (!Number.isFinite(n)) return stop(`'${word}' takes degrees counter-clockwise: 0, 90, 180 or 270.`)
      once('turn', n, word)
      i += 2
    } else if (next === 'x' && t[i + 2] !== undefined) {
      once('size', [numberOf(word, at, plain), numberOf(t[i + 2]!, at, plain)], 'x')
      i += 3
    } else if (next === 'high' || next === 'deep') {
      once(next === 'high' ? 'height' : 'depth', numberOf(word, at, plain), next)
      i += 2
    } else if (next === 'from') {
      once('from', { side: side(t[i + 2], 'from'), distance: numberOf(word, at, plain) }, 'from')
      i += 3
    } else return stop(`'${word}' is not a word an item line knows; ${USAGE}`)
  }
  if (words.against === undefined && words.at === undefined) return stop(`an item says where it goes; ${USAGE}`)
  return { id, ...(label === undefined ? {} : { label }), name, ...(words as Omit<ItemWords, 'id' | 'label' | 'name'>) }
}

/** A note on the item lines, as the compiler records its others. */
export interface ItemNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

/** The item lines of a text, read as they come and placed once the rooms are drawn. */
export class ItemLines {
  private readonly entries: Array<{ readonly line: number; readonly words?: ItemWords; readonly raw?: Item }> = []

  get written(): boolean {
    return this.entries.length > 0
  }

  /** The ids of the raw items: the plan file's own, which the check names but never refuses. */
  rawIds(): string[] {
    return this.entries.flatMap((e) => (e.raw === undefined ? [] : [e.raw.id]))
  }

  read(t: readonly string[], quoted: readonly LineWord[], at: number, plain: PlainNumbers): void {
    this.entries.push({ line: at, words: itemOfWords(t, quoted, at, plain) })
  }

  /** `raw item {...}`: Grid's own JSON for an item, taken as it is, never placed again. */
  raw(json: string, at: number): void {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw new RoomsStop('rooms/raw', `line ${at}: a raw item is one JSON object on the rest of the line, as Grid's plan file holds it in "items"; this one could not be read.`, at)
    }
    // An item by its library name takes the figures its entry gives, as the plan file is read.
    const filled = typeof value === 'object' && value !== null && !Array.isArray(value) ? fillFromBuiltIn(value as Record<string, unknown>) : value
    const checked = ItemSchema.safeParse(filled)
    if (!checked.success) {
      const issue = checked.error.issues[0]!
      throw new RoomsStop('rooms/raw', `line ${at}: the raw item would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}. An item is {"id", "kind", "at": [x, y], "size": [w, d], "height"}, or {"id", "library", "at": [x, y]}, as Grid's plan file holds it.`, at)
    }
    this.entries.push({ line: at, raw: value as Item })
  }

  /** The plan's items, in the order of their lines, as their file will hold them, and what the lines say about them. */
  finish(plan: FloorPlan | null): { items?: Record<string, unknown>[]; problems: ItemNote[]; guesses: string[] } {
    const problems: ItemNote[] = []
    const guesses: string[] = []
    if (this.entries.length === 0) return { problems, guesses }
    const items: Record<string, unknown>[] = []
    const ids = new Set<string>()
    const others = new Set(plan === null ? [] : [...plan.walls, ...plan.rooms, ...plan.openings].map((part) => part.id))
    for (const entry of this.entries) {
      const id = entry.words?.id ?? entry.raw!.id
      if (ids.has(id) || others.has(id)) {
        problems.push({ code: 'rooms/duplicate-id', line: entry.line, message: `line ${entry.line}: the item id '${id}' ${ids.has(id) ? 'is used by two items' : 'is the id of a wall, room or opening'}.` })
        continue
      }
      ids.add(id)
      if (entry.raw !== undefined) {
        items.push(entry.raw as unknown as Record<string, unknown>)
        continue
      }
      // A plan that cannot be read is refused for what else is wrong with it.
      if (plan === null) continue
      try {
        const made = placeItem(plan, entry.words!)
        items.push({ ...made.record })
        guesses.push(...made.guesses.map((g) => `Line ${entry.line}: ${g}`))
      } catch (error) {
        if (!(error instanceof ItemRefused)) throw error
        problems.push({ code: 'rooms/item', line: entry.line, message: `line ${entry.line}: ${error.message}` })
      }
    }
    return { items, problems, guesses }
  }
}

/** A raw item by a built-in library name, with the figures its entry gives filled in to be checked. */
function fillFromBuiltIn(item: Record<string, unknown>): Record<string, unknown> {
  if (typeof item['library'] !== 'string') return item
  const entry = builtInItem(item['library'])
  if (entry === undefined) return item
  return { kind: entry.kind, size: [...entry.size], height: entry.height, ...item }
}

// ── Items that stand against a wall move with it ─────────────────────────────────────────────

/** A face of a straight wall an item stands against: the wall, the side of it (+1 along its normal, -1 against) and the face's offset. */
interface Against {
  readonly wall: string
  readonly sign: 1 | -1
}

/** The face line of a wall on one side: a point on it and its normal pointing away from the wall. */
function faceOf(wall: Wall, sign: 1 | -1): { point: P; normal: P; dir: P } | null {
  if (wall.arc !== undefined || wall.virtual === true) return null
  try {
    const axis = wallAxis(wall)
    const normal: P = [axis.normal.x * sign, axis.normal.y * sign]
    return { point: add([axis.start.x, axis.start.y], normal, wall.thickness / 2), normal, dir: [axis.dir.x, axis.dir.y] }
  } catch {
    return null
  }
}

/** The walls whose face a line of an item (its back, or a side) lies on: the line's middle, its outward direction and half its length. */
function wallsAgainst(walls: readonly Wall[], middle: P, outward: P, half: number): Against[] {
  const near = tolerance('itemIntoWall')
  const found: Against[] = []
  for (const wall of walls) {
    for (const sign of [1, -1] as const) {
      const face = faceOf(wall, sign)
      if (face === null) continue
      // The face looks back at the item: its normal against the item line's outward direction.
      if (dot(face.normal, outward) > -1 + tolerance('writtenParallel')) continue
      if (Math.abs(dot(sub(middle, face.point), face.normal)) > near) continue
      const along = dot(sub(middle, face.point), face.dir)
      let length: number
      try {
        length = wallAxis(wall).length
      } catch {
        continue
      }
      if (along + half < -near || along - half > length + near) continue
      found.push({ wall: wall.id, sign })
    }
  }
  return found
}

/**
 * CNT-45: where each item standing against a wall goes when the walls change, by id: an item
 * whose back lies on a wall's face moves square to it as far as that face moved, and one that
 * also stands with a side against another wall (in a corner) keeps to that one too. An item
 * whose walls stay, turn or are gone stays where it is; so does one in `skip` (moved by the
 * change itself). Only straight walls are followed.
 */
export function itemsFollowWalls(before: FloorPlan, after: FloorPlan, skip: ReadonlySet<string> = new Set()): Map<string, { at: [number, number]; turn: number }> {
  const moved = new Map<string, { at: [number, number]; turn: number }>()
  const items = before.items ?? []
  if (items.length === 0) return moved
  const afterWalls = new Map(after.walls.map((w) => [w.id, w]))
  // A plan after that holds no items at all keeps the plan before's (a rewrite from rooms text).
  const stillThere = after.items === undefined ? null : new Set(after.items.map((item) => item.id))
  const byFloor = new Map<string, Wall[]>()
  for (const wall of before.walls) {
    const list = byFloor.get(floorOf(wall)) ?? []
    list.push(wall)
    byFloor.set(floorOf(wall), list)
  }
  const near = tolerance('sameFace')
  for (const item of items) {
    if (skip.has(item.id) || (stillThere !== null && !stillThere.has(item.id))) continue
    const t = ((item.turn ?? 0) * Math.PI) / 180
    const across: P = [Math.cos(t), Math.sin(t)]
    const front: P = [-Math.sin(t), Math.cos(t)]
    const [w, d] = item.size
    const walls = byFloor.get(floorOf(item)) ?? []
    const backs = wallsAgainst(walls, add(item.at, front, -d / 2), [-front[0], -front[1]], w / 2)
    if (backs.length === 0) continue
    const sides = [
      ...wallsAgainst(walls, add(item.at, across, -w / 2), [-across[0], -across[1]], d / 2),
      ...wallsAgainst(walls, add(item.at, across, w / 2), across, d / 2),
    ]
    // How far a face moved, square to it, and its normal: null when the wall turned or is gone.
    const shift = (against: Against): { by: number; normal: P } | null => {
      const was = walls.find((x) => x.id === against.wall)
      const now = afterWalls.get(against.wall)
      if (was === undefined || now === undefined || floorOf(now) !== floorOf(was)) return null
      const a = faceOf(was, against.sign)
      const b = faceOf(now, against.sign)
      if (a === null || b === null) return null
      if (Math.abs(a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]) > tolerance('writtenParallel') || dot(a.dir, b.dir) < 0) return null
      return { by: dot(sub(b.point, a.point), a.normal), normal: a.normal }
    }
    const back = backs.map(shift).find((s) => s !== null) ?? null
    if (back === null) continue
    const side = sides.map(shift).find((s) => s !== null) ?? null
    let delta: P = [back.normal[0] * back.by, back.normal[1] * back.by]
    if (side !== null) {
      // Square to both faces: delta·n1 = by1 and delta·n2 = by2.
      const [n1, n2] = [back.normal, side.normal]
      const det = n1[0] * n2[1] - n1[1] * n2[0]
      if (Math.abs(det) > tolerance('writtenParallel')) delta = [(back.by * n2[1] - side.by * n1[1]) / det, (n1[0] * side.by - n2[0] * back.by) / det]
    }
    if (Math.hypot(delta[0], delta[1]) <= near) continue
    moved.set(item.id, { at: [settled(item.at[0] + delta[0]), settled(item.at[1] + delta[1])], turn: item.turn ?? 0 })
  }
  return moved
}
