/**
 * What a plan written rooms first records about how it was written (WRT-2).
 *
 * The plan file is the source of truth; the rooms text is a way of writing and reading it. These
 * are kept in the plan's `written`:
 *
 * - `revision`: the plan's fingerprint as Grid wrote it from rooms text. Rooms text that says
 *   it was read from another revision, or a plan changed since by other means, is refused by
 *   `grid write` with the difference, so nothing done to the plan in between is lost unseen.
 * - `boundaries`: each room's boundary fingerprint. A room's boundary (the walls round it, in
 *   order) is derived: Grid works it out from where the rooms are, and no one writes it. One
 *   that no longer matches was edited by hand, and the drawing check refuses it with its own
 *   code, `room/derived-edited`.
 * - `text` (WRT-87): the rooms text itself, as it was written. The read-back (`read.ts`) gives it
 *   again, with its units, repeats and copies, while it still writes the plan the file holds.
 *
 * Pure: plain data in, strings out.
 */
import type { FloorPlan, Room } from '../types/floorplan'

/** 32-bit FNV-1a, as eight hex digits. */
function fnv(text: string, seed = 0x811c9dc5): string {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const n4 = (v: number): string => (Math.round(v * 10000) / 10000).toFixed(4)

/** Plain data as one text in any key order, numbers to a tenth of a millimetre (WRT-87: the read-back compares parts by it). */
export function canonical(value: unknown): string {
  if (typeof value === 'number') return n4(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * The plan's fingerprint: its floors, walls, rooms and openings, numbers to a tenth of a
 * millimetre, in any key order. Sixteen hex digits.
 */
export function planRevision(plan: Pick<FloorPlan, 'walls' | 'rooms' | 'openings' | 'floors'>): string {
  const text = canonical({ floors: plan.floors ?? [], walls: plan.walls, rooms: plan.rooms, openings: plan.openings })
  return fnv(text) + fnv(text, 0x01000193)
}

/** A room's boundary fingerprint: its wall ids in order. */
export function boundaryPrint(room: { readonly boundary: readonly string[] }): string {
  return fnv(room.boundary.join('\u0000'))
}

/** What a plan written from rooms text keeps in `written`. */
export interface WrittenStamp {
  readonly from: 'rooms'
  readonly revision: string
  readonly boundaries: Readonly<Record<string, string>>
  /** WRT-87: the rooms text the plan was written from, as it was written. */
  readonly text?: string
}

/** WRT-87: with `text`, the rooms text it was written from is kept beside the stamp, for the read-back. */
export function stampFor(plan: Pick<FloorPlan, 'walls' | 'rooms' | 'openings' | 'floors'>, text?: string): WrittenStamp {
  const boundaries: Record<string, string> = {}
  for (const room of plan.rooms) boundaries[room.id] = boundaryPrint(room)
  return { from: 'rooms', revision: planRevision(plan), boundaries, ...(text === undefined ? {} : { text }) }
}

/** The rooms of a plan written rooms first whose boundary was changed since Grid worked it out. */
export function boundariesEdited(plan: Pick<FloorPlan, 'rooms'> & { readonly written?: WrittenStamp | undefined }): Room[] {
  const written = plan.written
  if (written === undefined) return []
  return plan.rooms.filter((room) => {
    const print = written.boundaries[room.id]
    return print !== undefined && print !== boundaryPrint(room)
  })
}

/**
 * A plan file's JSON after one of Grid's own edits (a tool's change, a tidy fix): the rooms whose
 * boundary the edit changed, or that it added, are printed again, so Grid's edits never read as
 * hand edits. A plan not written rooms first is given back as it was.
 */
export function keptDerived<T extends Record<string, unknown>>(before: readonly { readonly id: string; readonly boundary: readonly string[] }[], after: T): T {
  const written = after['written'] as Partial<WrittenStamp> | undefined
  if (typeof written !== 'object' || written === null || written.from !== 'rooms' || typeof written.boundaries !== 'object' || written.boundaries === null) return after
  const rooms = Array.isArray(after['rooms']) ? (after['rooms'] as Array<Pick<Room, 'id' | 'boundary'>>) : []
  const was = new Map(before.map((r) => [r.id, r.boundary.join('\u0000')]))
  const boundaries: Record<string, string> = { ...written.boundaries }
  for (const room of rooms) {
    if (typeof room?.id !== 'string' || !Array.isArray(room.boundary)) continue
    if (was.get(room.id) !== room.boundary.join('\u0000')) boundaries[room.id] = boundaryPrint(room)
  }
  return { ...after, written: { ...written, boundaries } }
}
