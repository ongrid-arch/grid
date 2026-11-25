/**
 * BRF-6: a first layout from a list of rooms with their sizes and the rooms that should touch,
 * written as rooms text (WRT-2), so the plan it makes is an ordinary plan that every check,
 * export and read-back reads, and the text can be changed and written again.
 *
 * The packing is simple and deterministic: the same list gives the same text, byte for byte.
 *
 * - With three rooms or more, or a corridor in the list, the rooms stand in two rows, one on
 *   each side of a hall running east-west: the list's corridor, or one Grid adds, as wide as
 *   `layoutHall` (Grid's own size, not a code figure). Fewer rooms stand in one row.
 * - A room may be turned: a size is either way round. A room given only an area takes the depth
 *   of its row and the width that keeps its area, so long as that leaves it a usable shape
 *   (WRT-61): no side under `layoutNarrowest` (or its own square's side, when it is smaller) and,
 *   keeping its area, no longer than `layoutLongest` times its width (both Grid's own). In a row
 *   deeper than that it is as narrow as it may be and only as deep as its area needs (with `tidy`
 *   it is then made as deep as the row, and larger than asked); no row is shallower than it may be.
 * - Of every way of sharing the rooms between the rows, and every depth each row could take, it
 *   keeps the one that holds the most wishes to touch (a `must` counts three, a `should` one, an
 *   `avoid` broken takes three away), then the smallest rectangle round the rooms, then the one
 *   nearest a square, then the first in the list's order. Within a row of up to
 *   `layoutRowOrders` rooms, the order that holds the most wishes is kept.
 * - `tidy`: the outline is a rectangle. Every room in a row is as deep as the row, and the room of
 *   the shorter row already changed (else its largest) takes up the length left over. Those
 *   sizes are not kept, and the answer names each.
 * - `sizes`: every room keeps its size, and the outline steps where the rooms differ.
 *
 * It does not place doors or windows, and knows nothing of the plot, the orientation, the
 * footprint, more than one floor, or rooms other than rectangles.
 *
 * Pure: a list in, rooms text out. Nothing here reads or writes a file.
 */
import { limit, tolerance } from '../geometry/tolerances'
import { ROOMS_WALLS } from './compile'

export const LAYOUT_SHAPES = ['tidy', 'sizes'] as const
export type LayoutShape = (typeof LAYOUT_SHAPES)[number]

/** A room to place: its name, its use (a use of Grid's, or null), and an inside size or an area. */
export interface LayoutRoom {
  readonly name: string
  readonly use: string | null
  /** The inside size, either way round, in metres. */
  readonly inside: readonly [number, number] | null
  /** The net area in m², for a room given no inside size. */
  readonly area: number | null
}

/** Two rooms, by name, that should share a wall (`must`, `should`) or not (`avoid`). */
export interface LayoutTouch {
  readonly rooms: readonly [string, string]
  readonly level: 'must' | 'should' | 'avoid'
}

export interface LayoutRequest {
  readonly rooms: readonly LayoutRoom[]
  readonly touch: readonly LayoutTouch[]
  /** The corridor of the list the rooms stand along, or null for Grid to add one when it needs one. */
  readonly hall: LayoutRoom | null
  readonly shape: LayoutShape
}

/** A room as the layout drew it: inside faces, east-west by north-south. */
export interface PlacedRoom {
  readonly id: string
  readonly name: string
  /** Its place in the request's rooms, or null for the hall. */
  readonly index: number | null
  readonly row: 'hall' | 'south' | 'north'
  readonly width: number
  readonly depth: number
  /** Whether its size is the one asked: its inside size either way round, or its area. */
  readonly kept: boolean
}

export interface Layout {
  readonly text: string
  readonly rooms: readonly PlacedRoom[]
  /** The hall Grid added, or null when the list gave one or none was needed. */
  readonly added: PlacedRoom | null
  /** The rectangle round the rooms' inside faces and the walls between them, east-west by north-south. */
  readonly outline: readonly [number, number]
  /** Wishes to touch, between rooms that were placed: how many there are, and how many hold. */
  readonly touch: { readonly wished: number; readonly held: number }
}

/** Why a list cannot be laid out. */
export class LayoutRefused extends Error {
  override readonly name = 'LayoutRefused'
}

const WEIGHT = { must: 3, should: 1, avoid: -3 } as const
const cm = (v: number): number => Math.round(v * 100)
const r4 = (v: number): number => Math.round(v * 10_000) / 10_000
const fmt = (v: number): string => String(r4(v))
const close = (a: number, b: number): boolean => Math.abs(a - b) <= tolerance('lengthEqual')

function slug(name: string, used: Set<string>): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room'
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

function quote(name: string): string {
  return name.includes('"') ? `'${name}'` : `"${name}"`
}

/**
 * The shortest side a room given only an area may have (WRT-61): `layoutNarrowest`, or its own
 * square's side when it is smaller than that, and never so short that, keeping its area, the room
 * runs longer than `layoutLongest` times it.
 */
function shortest(area: number): number {
  return r4(Math.max(Math.min(limit('layoutNarrowest'), Math.sqrt(area)), Math.sqrt(area / limit('layoutLongest'))))
}

/** One room's width and depth in a row of a given depth, or null when it is deeper both ways. */
function fit(room: LayoutRoom, depth: number): { w: number; d: number } | null {
  if (room.inside === null) {
    const short = shortest(room.area!)
    if (depth < short - tolerance('lengthEqual')) return null
    // In a row deeper than its longest side, it is as narrow as it may be and as deep as its area needs.
    const long = r4(room.area! / short)
    if (depth + tolerance('lengthEqual') >= long) return { w: short, d: long }
    return { w: r4(room.area! / depth), d: depth }
  }
  const [a, b] = [...room.inside].sort((x, y) => x - y) as [number, number]
  if (b <= depth + tolerance('lengthEqual')) return { w: a, d: b }
  if (a <= depth + tolerance('lengthEqual')) return { w: b, d: a }
  return null
}

interface Row {
  readonly order: readonly number[]
  readonly depth: number
  readonly width: number
  readonly sizes: ReadonlyArray<{ w: number; d: number }>
}

/**
 * The depths a row could take: each size of its rooms, and the depth its rooms need, at least as
 * deep as the room that needs most: a sized room's shorter side, a room given only an area its
 * shortest (WRT-61).
 */
function depthsOf(rooms: readonly LayoutRoom[], members: readonly number[]): number[] {
  const need = Math.max(0, ...members.map((i) => (rooms[i]!.inside === null ? shortest(rooms[i]!.area!) : Math.min(...rooms[i]!.inside!))))
  // A row of rooms given only their areas is as deep as the square of its largest.
  const sized = members.filter((i) => rooms[i]!.inside !== null)
  const all = [need, ...(sized.length > 0 ? sized.flatMap((i) => rooms[i]!.inside!) : [cm(Math.sqrt(Math.max(...members.map((i) => rooms[i]!.area!)))) / 100])]
  return [...new Set(all.map(r4))].filter((d) => d >= need - tolerance('lengthEqual')).sort((x, y) => x - y)
}

function rowAt(rooms: readonly LayoutRoom[], order: readonly number[], depth: number, wall: number): Row | null {
  const sizes: Array<{ w: number; d: number }> = []
  for (const i of order) {
    const size = fit(rooms[i]!, depth)
    if (size === null) return null
    sizes.push(size)
  }
  const width = sizes.reduce((sum, s) => sum + s.w, 0) + Math.max(0, order.length - 1) * wall
  return { order, depth: Math.max(...sizes.map((s) => s.d)), width: r4(width), sizes }
}

function* orders(items: readonly number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield [...items]
    return
  }
  for (let k = 0; k < items.length; k++) {
    for (const rest of orders([...items.slice(0, k), ...items.slice(k + 1)])) yield [items[k]!, ...rest]
  }
}

/** The order of a row's rooms that holds the most wishes to touch, the list's order first on a tie. */
function bestOrder(members: readonly number[], weight: (a: number, b: number) => number): { order: number[]; score: number } {
  const score = (order: readonly number[]): number => order.slice(1).reduce((sum, b, k) => sum + weight(order[k]!, b), 0)
  let best = { order: [...members], score: score(members) }
  if (members.length > limit('layoutRowOrders')) return best
  for (const order of orders(members)) {
    const s = score(order)
    if (s > best.score) best = { order, score: s }
  }
  return best
}

/** Whether one key comes before another, figure by figure. */
function before(a: readonly number[], b: readonly number[]): boolean {
  const k = a.findIndex((v, i) => v !== b[i])
  return k >= 0 && a[k]! < b[k]!
}

/** Lays the rooms out, as rooms text and what it drew. Refused when no room can be placed. */
export function layOut(request: LayoutRequest): Layout {
  const rooms = request.rooms
  if (rooms.length === 0) throw new LayoutRefused('there is no room with a size to place')
  if (rooms.length > limit('layoutRooms')) throw new LayoutRefused(`it holds ${rooms.length} rooms to place, and a first layout places at most ${limit('layoutRooms')}`)
  const wall = ROOMS_WALLS.inside
  const hallWanted = request.hall !== null || rooms.length >= 3
  const hallDepth = request.hall?.inside !== null && request.hall?.inside !== undefined ? Math.min(...request.hall.inside) : limit('layoutHall')

  const byName = new Map<string, number[]>()
  rooms.forEach((room, i) => byName.set(room.name.trim().toLowerCase(), [...(byName.get(room.name.trim().toLowerCase()) ?? []), i]))
  const pairs = new Map<string, number>()
  for (const wish of request.touch) {
    const [a, b] = wish.rooms.map((name) => byName.get(name.trim().toLowerCase()) ?? [])
    for (const x of a!) for (const y of b!) if (x !== y) pairs.set(`${Math.min(x, y)}|${Math.max(x, y)}`, (pairs.get(`${Math.min(x, y)}|${Math.max(x, y)}`) ?? 0) + WEIGHT[wish.level])
  }
  const weight = (a: number, b: number): number => pairs.get(`${Math.min(a, b)}|${Math.max(a, b)}`) ?? 0

  const n = rooms.length
  const full = (1 << n) - 1
  const orderCache = new Map<number, { order: number[]; score: number }>()
  const orderOf = (subset: number, list: readonly number[]): { order: number[]; score: number } => {
    const known = orderCache.get(subset) ?? bestOrder(list, weight)
    orderCache.set(subset, known)
    return known
  }
  const members = (mask: number, north: boolean): number[] => rooms.map((_, i) => i).filter((i) => ((mask >> i) & 1) === (north ? 1 : 0))
  let best: { key: readonly number[]; south: Row; north: Row | null } | null = null
  for (let mask = 0; mask < (hallWanted ? 1 << n : 1); mask++) {
    const south = members(mask, false)
    const north = members(mask, true)
    if (south.length === 0 || (n >= 2 && hallWanted && north.length === 0)) continue
    const s = orderOf(mask ^ full, south)
    const nn = north.length === 0 ? { order: [], score: 0 } : orderOf(mask, north)
    for (const ds of depthsOf(rooms, south)) {
      const rs = rowAt(rooms, s.order, ds, wall)
      if (rs === null) continue
      for (const dn of north.length === 0 ? [0] : depthsOf(rooms, north)) {
        const rn = north.length === 0 ? null : rowAt(rooms, nn.order, dn, wall)
        if (north.length > 0 && rn === null) continue
        const width = Math.max(rs.width, rn?.width ?? 0)
        const depth = rs.depth + (hallWanted ? hallDepth + wall : 0) + (rn === null ? 0 : rn.depth + wall)
        // Most wishes held, then the smallest rectangle, then the squarest, then the first found.
        const key = [-(s.score + nn.score), cm(width * depth), cm(Math.abs(width - depth))]
        if (best === null || before(key, best.key)) best = { key, south: rs, north: rn }
      }
    }
  }
  if (best === null) throw new LayoutRefused('no way of placing its rooms in rows was found')

  // ---------------------------------------------------------------------------------------------
  // The rooms drawn, and the text that writes them.

  const used = new Set<string>()
  const width = Math.max(best.south.width, best.north?.width ?? 0)
  const placed: PlacedRoom[] = []
  const lines: string[] = [`# A first layout from the brief (BRF-6), ${request.shape === 'tidy' ? 'in a rectangle: rooms that do not fit it are made larger' : 'keeping every size: the outline steps'}. Change it and write it again.`]
  const kept = (room: LayoutRoom, w: number, d: number): boolean => {
    if (room.inside !== null) {
      const [a, b] = [...room.inside].sort((x, y) => x - y)
      const [x, y] = [w, d].sort((p, q) => p - q)
      return cm(a!) === cm(x!) && cm(b!) === cm(y!)
    }
    return Math.abs(w * d - room.area!) < tolerance('areaReported')
  }
  let hall: PlacedRoom | null = null
  let added: PlacedRoom | null = null
  if (hallWanted) {
    const named = request.hall ?? { name: 'Hall', use: 'corridor', inside: null, area: null }
    const id = slug(named.name, used)
    hall = { id, name: named.name, index: null, row: 'hall', width, depth: hallDepth, kept: request.hall === null || (named.inside === null && named.area === null) || kept(named, width, hallDepth) }
    if (request.hall === null) added = hall
    lines.push(`room ${id} ${quote(named.name)} ${named.use ?? 'corridor'} ${fmt(width)} x ${fmt(hallDepth)}`)
  }
  for (const [row, side] of [[best.south, 'south'], [best.north, 'north']] as const) {
    if (row === null) continue
    const sizes = row.sizes.map((s) => (request.shape === 'tidy' ? { w: s.w, d: row.depth } : { ...s }))
    if (request.shape === 'tidy' && !close(row.width, width)) {
      // The room already changed takes up the length left over, else the largest: the fewest sizes not kept.
      const every = row.order.map((_, k) => k)
      const changed = every.filter((k) => !kept(rooms[row.order[k]!]!, sizes[k]!.w, sizes[k]!.d))
      const area = (k: number): number => sizes[k]!.w * sizes[k]!.d
      const k = (changed.length > 0 ? changed : every).reduce((m, x) => (area(x) > area(m) + tolerance('areaEqual') ? x : m))
      sizes[k] = { w: r4(sizes[k]!.w + width - row.width), d: sizes[k]!.d }
    }
    let last: string | null = hall?.id ?? null
    row.order.forEach((i, k) => {
      const room = rooms[i]!
      const id = slug(room.name, used)
      const { w, d } = sizes[k]!
      const where = last === null ? '' : k === 0 ? ` ${side} of ${last} align west` : ` east of ${last} align ${hall === null ? 'south' : side === 'south' ? 'north' : 'south'}`
      lines.push(`room ${id} ${quote(room.name)} ${room.use ?? '-'} ${fmt(w)} x ${fmt(d)}${where}`)
      placed.push({ id, name: room.name, index: i, row: side, width: w, depth: d, kept: kept(room, w, d) })
      last = id
    })
  }
  const rowsDepth = (request.shape === 'tidy' ? best.south.depth : Math.max(...placed.filter((p) => p.row === 'south').map((p) => p.depth)))
    + (hall === null ? 0 : hall.depth + wall)
    + (best.north === null ? 0 : wall + (request.shape === 'tidy' ? best.north.depth : Math.max(...placed.filter((p) => p.row === 'north').map((p) => p.depth))))
  // A wish holds when its two rooms stand side by side in a row, or one of them is the hall.
  const all = hall === null ? placed : [hall, ...placed]
  const named = (name: string): PlacedRoom[] => all.filter((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  const touches = (x: PlacedRoom, y: PlacedRoom): boolean => x !== y && (x.row === 'hall' || y.row === 'hall' || (x.row === y.row && Math.abs(placed.indexOf(x) - placed.indexOf(y)) === 1))
  const wishes = request.touch.filter((wish) => named(wish.rooms[0]).length > 0 && named(wish.rooms[1]).length > 0)
  const held = wishes.filter((wish) => named(wish.rooms[0]).some((x) => named(wish.rooms[1]).some((y) => touches(x, y))) === (wish.level !== 'avoid')).length
  return {
    text: `${lines.join('\n')}\n`,
    rooms: all,
    added,
    outline: [r4(width), r4(rowsDepth)],
    touch: { wished: wishes.length, held },
  }
}
