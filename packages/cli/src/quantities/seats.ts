/**
 * ARE-67: the seats, desks and covers the plan's furniture gives, counted once, per item and in
 * totals per room, per zone (CNT-8), per floor and for the whole plan.
 *
 * - A chair, a stool, an armchair or a fixed seat is one seat.
 * - A sofa or a pew is one seat per `SEATING.seatWidth` of its width, at least one.
 * - A label that states its seats ("3-seat", "4 seats", "for 6", "6-seater") is read before
 *   either, on any of those kinds.
 * - A desk is one desk. The chair at it is the seat.
 * - A seat is a cover when its footprint stands within `SEATING.atTable` of a table's, on the
 *   same floor: a cover is a place at a table.
 *
 * Each item's room is the one that holds the middle of its footprint, as every count of the
 * plan's items reads it (`itemRoom`); its zone the zone of that room holding the same point. The
 * figures are Grid's own way of counting the furniture as drawn, citing no document, and say
 * nothing of how many people a room may hold.
 *
 * Pure: a survey in, plain data out.
 */
import { floorOf, indexPlan, itemFootprint, itemRoom, pointInPolygon, roomShapes, segmentDistance, type Item, type Vec2 } from '@ongrid/floorplan/geometry'
import type { Survey } from './survey'

/** Grid's own readings for the count, in metres. */
export const SEATING = {
  /** The width of a sofa or a pew one person sits in. */
  seatWidth: 0.6,
  /** How far from a table's edge a seat may stand and still be a place at it. */
  atTable: 0.5,
} as const

/** The rule every answer of the count states. */
export const SEATING_RULE = `Seats, desks and covers are counted from the furniture as drawn: a chair, stool, armchair or fixed seat is one seat, a sofa or pew one seat per ${SEATING.seatWidth} m of its width unless its label states its seats, a desk one desk, and a seat standing within ${SEATING.atTable} m of a table one cover. Each piece is counted in the room, and the zone, that holds the middle of its footprint. Grid's own count of what is drawn, not how many people a room may hold.`

/** The kinds that give one seat each. */
const ONE_SEAT: ReadonlySet<string> = new Set(['chair', 'stool', 'armchair', 'seat'])
/** The kinds that give a seat per seat width. */
const BY_WIDTH: ReadonlySet<string> = new Set(['sofa', 'pew'])

/** How an item's seats were read: from its kind, its width or its label. */
export type SeatsFrom = 'kind' | 'width' | 'label'

/** One item's share of the count. */
export interface SeatingRow {
  readonly id: string
  readonly kind: string
  readonly floor: string
  /** The room that holds the middle of its footprint, or null. */
  readonly room: string | null
  /** The zone of that room that holds it, or null. */
  readonly zone: string | null
  readonly seats: number
  readonly desks: number
  /** Its seats when it stands at a table, else 0. */
  readonly covers: number
  /** How its seats were read; null for an item that gives none. */
  readonly from: SeatsFrom | null
}

export interface SeatingTotal {
  readonly seats: number
  readonly desks: number
  readonly covers: number
}

export interface SeatingPlace extends SeatingTotal {
  readonly id: string
  readonly floor: string
}

export interface Seating {
  /** Every item that gives a seat or a desk, in the plan's order. */
  readonly rows: readonly SeatingRow[]
  /** The same rows by item id. */
  readonly byItem: ReadonlyMap<string, SeatingRow>
  /** Every item's zone, whether or not it gives a seat: null for none. */
  readonly itemZones: ReadonlyMap<string, string | null>
  /** Per room, its zones' items included; every room of the plan, none left out. */
  readonly rooms: ReadonlyMap<string, SeatingPlace>
  /** Per zone, only its own items. */
  readonly zones: ReadonlyMap<string, SeatingPlace>
  readonly floors: ReadonlyMap<string, SeatingTotal>
  readonly plan: SeatingTotal
  /** The items standing in no room, counted in the floor's and the plan's totals only. */
  readonly outside: number
}

const SEAT_WORDS = /(\d{1,3})\s*-?\s*(?:seats?|seater|places?|covers?|pax)\b|\bfor\s+(\d{1,3})\b/i

/** The seats a label states, or null. */
export function labelSeats(label: string | undefined): number | null {
  if (label === undefined) return null
  const match = SEAT_WORDS.exec(label)
  if (match === null) return null
  const n = Number(match[1] ?? match[2])
  return Number.isInteger(n) && n > 0 ? n : null
}

/** The seats one item gives, and how they were read. */
export function itemSeats(item: Pick<Item, 'kind' | 'size' | 'label'>): { seats: number; from: SeatsFrom | null } {
  const seating = ONE_SEAT.has(item.kind) || BY_WIDTH.has(item.kind)
  if (!seating) return { seats: 0, from: null }
  const stated = labelSeats(item.label)
  if (stated !== null) return { seats: stated, from: 'label' }
  if (ONE_SEAT.has(item.kind)) return { seats: 1, from: 'kind' }
  // A thousandth over, so a 1.8 m sofa is three seats whatever its binary error.
  return { seats: Math.max(1, Math.floor(item.size[0] / SEATING.seatWidth + 1e-3)), from: 'width' }
}

/** The least distance between two footprints: 0 when they touch or overlap. */
function gap(a: readonly Vec2[], b: readonly Vec2[]): number {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return 0
  let least = Infinity
  for (let i = 0; i < a.length; i++) {
    const s = { a: a[i]!, b: a[(i + 1) % a.length]! }
    for (let j = 0; j < b.length; j++) least = Math.min(least, segmentDistance(s, { a: b[j]!, b: b[(j + 1) % b.length]! }))
  }
  return least
}

const add = (to: { seats: number; desks: number; covers: number }, row: SeatingTotal): void => {
  to.seats += row.seats
  to.desks += row.desks
  to.covers += row.covers
}

/** The plan's seats, desks and covers, per item and in totals. */
export function planSeating(survey: Survey): Seating {
  const plan = survey.plan
  const items = plan.items ?? []
  let shapes: ReturnType<typeof roomShapes> | null = null
  const tables = items.filter((item) => item.kind === 'table').map((item) => ({ floor: floorOf(item), footprint: itemFootprint(item) }))
  const zones = survey.rooms.filter((room) => room.facts.zoneOf !== undefined && room.polygon.length >= 3)
  const rows: SeatingRow[] = []
  const itemZones = new Map<string, string | null>()
  for (const item of items) {
    shapes ??= roomShapes(indexPlan(plan))
    const room = itemRoom(item, shapes)?.id ?? null
    const at = { x: item.at[0], y: item.at[1] }
    const zone = room === null ? null : zones.find((z) => z.facts.zoneOf === room && pointInPolygon(at, z.polygon, z.holes))?.facts.id ?? null
    itemZones.set(item.id, zone)
    const { seats, from } = itemSeats(item)
    const desks = item.kind === 'desk' ? 1 : 0
    if (seats === 0 && desks === 0) continue
    const floor = floorOf(item)
    let covers = 0
    if (seats > 0) {
      const footprint = itemFootprint(item)
      if (tables.some((table) => table.floor === floor && gap(footprint, table.footprint) <= SEATING.atTable)) covers = seats
    }
    rows.push({ id: item.id, kind: item.kind, floor, room, zone, seats, desks, covers, from })
  }
  const place = (id: string, floor: string) => ({ id, floor, seats: 0, desks: 0, covers: 0 })
  const rooms = new Map(plan.rooms.filter((r) => survey.byId.get(r.id)?.facts.zoneOf === undefined).map((r) => [r.id, place(r.id, floorOf(r))] as const))
  const zoneTotals = new Map(zones.map((z) => [z.facts.id, place(z.facts.id, floorOf(z.facts))] as const))
  const floors = new Map<string, { seats: number; desks: number; covers: number }>()
  const all = { seats: 0, desks: 0, covers: 0 }
  let outside = 0
  for (const row of rows) {
    add(all, row)
    const floor = floors.get(row.floor) ?? { seats: 0, desks: 0, covers: 0 }
    add(floor, row)
    floors.set(row.floor, floor)
    const room = row.room === null ? undefined : rooms.get(row.room)
    if (room === undefined) outside += 1
    else add(room, row)
    if (row.zone !== null) add(zoneTotals.get(row.zone)!, row)
  }
  return { rows, byItem: new Map(rows.map((row) => [row.id, row] as const)), itemZones, rooms, zones: zoneTotals, floors, plan: all, outside }
}

/** A room's or a zone's total, by id: a zone's own, else the room's; null for no such room. */
export function seatingOf(seating: Seating, id: string): SeatingPlace | null {
  return seating.zones.get(id) ?? seating.rooms.get(id) ?? null
}

// ---------------------------------------------------------------------------------------------
// The answer of grid_measure what=seats

const q = (text: string): string => JSON.stringify(text)
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
const totalText = (t: SeatingTotal): string => `${plural(t.seats, 'seat', 'seats')}, ${plural(t.desks, 'desk', 'desks')}, ${plural(t.covers, 'cover', 'covers')}`

export interface SeatingAnswer {
  readonly lines: string[]
  readonly data: Record<string, unknown>
}

/** The count as an answer: the plan's, each floor's, each room's that holds any and its zones'; or one room's (or zone's) with its pieces. */
export function seatingAnswer(survey: Survey, roomId?: string): SeatingAnswer {
  const counted = planSeating(survey)
  const nameOf = (id: string): string => {
    const name = survey.plan.rooms.find((r) => r.id === id)?.name.trim() ?? ''
    return name === '' ? id : name
  }
  const kinds = (rows: readonly SeatingRow[]): string => {
    const by = new Map<string, { n: number; seats: number; width: number; label: number }>()
    for (const row of rows) {
      const k = by.get(row.kind) ?? { n: 0, seats: 0, width: 0, label: 0 }
      k.n += 1
      k.seats += row.seats
      if (row.from === 'width') k.width += 1
      if (row.from === 'label') k.label += 1
      by.set(row.kind, k)
    }
    return [...by.entries()].map(([kind, k]) => {
      const how = [k.width > 0 ? `${k.width} by width` : null, k.label > 0 ? `${k.label} by label` : null].filter((x) => x !== null).join(', ')
      return `${k.n} ${kind}${k.seats > 0 && k.seats !== k.n ? ` (${plural(k.seats, 'seat', 'seats')}${how === '' ? '' : `, ${how}`})` : how === '' ? '' : ` (${how})`}`
    }).join(', ')
  }
  const place = (p: SeatingPlace) => ({ id: p.id, name: nameOf(p.id), floor: p.floor, seats: p.seats, desks: p.desks, covers: p.covers })
  if (roomId !== undefined) {
    const one = seatingOf(counted, roomId)
    const zone = counted.zones.has(roomId)
    const rows = counted.rows.filter((row) => (zone ? row.zone === roomId : row.room === roomId))
    const total: SeatingPlace = one ?? { id: roomId, floor: floorOf(survey.plan.rooms.find((r) => r.id === roomId) ?? {}), seats: 0, desks: 0, covers: 0 }
    const lines = [`${q(nameOf(roomId))}${zone ? ' (a zone)' : ''}: ${totalText(total)}${rows.length === 0 ? '.' : `, from ${kinds(rows)}.`}`]
    const zones = zone ? [] : [...counted.zones.values()].filter((z) => survey.byId.get(z.id)?.facts.zoneOf === roomId)
    if (zones.length > 0) lines.push(`  Its zones: ${zones.map((z) => `${q(nameOf(z.id))} ${totalText(z)}`).join('; ')}.`)
    return { lines, data: { room: place(total), zones: zones.map(place), items: rows } }
  }
  const lines = [`In the plan: ${totalText(counted.plan)}${counted.rows.length === 0 ? '. No furniture gives a seat or a desk.' : `, from ${kinds(counted.rows)}.`}`]
  const rooms = [...counted.rooms.values()].filter((r) => r.seats + r.desks > 0)
  const zones = [...counted.zones.values()].filter((z) => z.seats + z.desks > 0)
  for (const [floor, total] of counted.floors) {
    if (counted.floors.size > 1) lines.push(`Floor ${q(floor)}: ${totalText(total)}.`)
    for (const room of rooms.filter((r) => r.floor === floor).slice(0, 60)) {
      const own = zones.filter((z) => survey.byId.get(z.id)?.facts.zoneOf === room.id)
      lines.push(`  ${q(nameOf(room.id))}: ${totalText(room)}${own.length === 0 ? '' : `; its zones ${own.map((z) => `${q(nameOf(z.id))} ${totalText(z)}`).join('; ')}`}.`)
    }
  }
  if (rooms.length > 60) lines.push(`  … and ${rooms.length - 60} more rooms in the data.`)
  if (counted.outside > 0) lines.push(`${plural(counted.outside, 'piece stands', 'pieces stand')} in no room: counted on the floor and in the plan only.`)
  return {
    lines,
    data: {
      plan: counted.plan,
      floors: [...counted.floors.entries()].map(([floor, t]) => ({ floor, ...t })),
      rooms: rooms.map(place),
      zones: zones.map((z) => ({ ...place(z), of: survey.byId.get(z.id)?.facts.zoneOf ?? null })),
      items: counted.rows,
      outside: counted.outside,
    },
  }
}
