/**
 * A plan read back as rooms text (WRT-2), so an agent can change a plan it did not write the way
 * it writes one: the rooms with their inside sizes and places, the openings by the room side
 * they are in and their distance from its corner, and the walls line with every exception
 * (height, thickness, kind, id, direction) the plan holds.
 *
 * The read-back is checked before it is given: it is written again here, and each floor whose
 * rooms text does not give back the very same walls, rooms and openings is given in Grid's own
 * terms instead (raw lines), so writing the text again loses nothing. An opening that rooms
 * text cannot place as it is (one that runs past its wall, or names a wall the plan does not
 * have) is given raw on its own. Asked for rooms anyway (`prefer: 'rooms'`), every floor is
 * given rooms first and what would change is said at the top.
 *
 * Pure: a plan in, text out.
 */
import { heightByDefault, safeParseFloorPlan, statedWall, type FloorPlan, type Opening, type Room, type Wall } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { planFloors } from '../geometry/floors'
import { english, said } from '../messages/say'
import { tryRoomPolygon } from '../geometry/room'
import { limit, tolerance } from '../geometry/tolerances'
import { doorKindOf, kindFits, sweepsFloor, swingNeeds } from '../geometry/openingKinds'
import { compileRoomsText, RAW_FLOOR_KEYS, type RoomsResult } from './compile'
import { planRevision } from './stamp'
import { metres } from './words'

type P = readonly [number, number]

const S2 = Math.sqrt(0.5)
const DIRS: Readonly<Record<string, P>> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }
const COMPASS: Readonly<Record<string, P>> = { ...DIRS, ne: [S2, S2], nw: [-S2, S2], se: [S2, -S2], sw: [-S2, -S2] }
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
const cross = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const norm = (a: P): number => Math.hypot(a[0], a[1])
const unit = (a: P): P => {
  const n = norm(a)
  return [a[0] / n, a[1] / n]
}
const compassOf = (v: P, table: Readonly<Record<string, P>> = COMPASS): string =>
  Object.keys(table).reduce((best, k) => (dot(v, table[k]!) > dot(v, table[best]!) ? k : best))
const floorOf = (part: { floor?: string | undefined }): string => part.floor ?? 'ground'
const quote = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`)
/** Lengths that agree to a tenth of a millimetre are the same length here. */
const SAME = tolerance('roomsWritten')

/** The most common value, the first one met winning a tie. */
function mostCommon<T>(values: readonly T[], fallback: T): T {
  const count = new Map<T, number>()
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1)
  let best = fallback
  let most = 0
  for (const [v, n] of count) if (n > most) [best, most] = [v, n]
  return best
}

// A wall is written as its file states it: a value the reading filled in is left out (WRT-6).
// CNT-15: a raw line keeps the values a part's type gave it, so it is read the same with no types to
// read them from; writing it again leaves to the type what it gives the same (`carryFacts`).
const rawLine = (kind: 'wall' | 'room' | 'opening', part: unknown): string => `raw ${kind} ${JSON.stringify(kind === 'wall' ? statedWall({ ...(part as Wall), typed: undefined }) : { ...(part as Record<string, unknown>), typed: undefined })}`

/** The read-back as rooms text writes it again, read as Grid reads a plan file (WRT-6). */
type ReadBack = Omit<RoomsResult, 'plan'> & { readonly plan: FloorPlan | null }



/** What the read-back found, beside its text. */
export interface RoomsReading {
  readonly text: string
  /** Floors given in Grid's own terms, with why. */
  readonly rawFloors: readonly { readonly floor: string; readonly why: string }[]
  /** Openings given raw on their own. */
  readonly rawOpenings: readonly string[]
  /** With `prefer: 'rooms'`: what writing the text again changes, one line each. */
  readonly changes: readonly string[]
}

export interface ReadOptions {
  /** `exact` (the default) never loses anything; `rooms` gives every floor rooms first. */
  readonly prefer?: 'exact' | 'rooms'
  /** The name on the `plan` line. */
  readonly name?: string
}

// ---------------------------------------------------------------------------------------------
// Comparing parts

function sameNumber(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return Math.abs(a - b) <= SAME
}

function samePoint(a: readonly [number, number], b: readonly [number, number]): boolean {
  return sameNumber(a[0], b[0]) && sameNumber(a[1], b[1])
}

function wallDiffers(a: Wall, b: Wall, statesNone: (wall: Wall) => boolean): string | null {
  if (!samePoint(a.start, b.start) || !samePoint(a.end, b.end)) return 'stands elsewhere'
  if (!sameNumber(a.thickness, b.thickness)) return 'has another thickness'
  if (!sameNumber(a.height, b.height)) return 'has another height'
  if (statesNone(a) !== statesNone(b)) return 'states no height in one only'
  if (a.kind !== b.kind) return 'is of another kind'
  if ((a.virtual === true) !== (b.virtual === true)) return 'is solid in one and a dividing line in the other'
  if (floorOf(a) !== floorOf(b)) return 'is on another floor'
  return otherKeys(a, b, ['id', 'start', 'end', 'thickness', 'height', 'kind', 'virtual', 'floor', 'unstated', ...FACTS_CARRIED])
}

function roomDiffers(a: Room, b: Room): string | null {
  if (a.name !== b.name) return 'has another name'
  if (a.use !== b.use) return 'has another use'
  if (a.boundary.join('|') !== b.boundary.join('|')) return 'is bounded by other walls'
  if (floorOf(a) !== floorOf(b)) return 'is on another floor'
  if ((a.inside === true) !== (b.inside === true)) return 'sits inside another room in one only'
  if (!sameNumber(a.height, b.height)) return 'has another height'
  return otherKeys(a, b, ['id', 'name', 'use', 'boundary', 'floor', 'inside', 'height', ...FACTS_CARRIED, 'number'])
}

/**
 * CNT-9: the facts of the person's own, and a room's stated number, are kept by id when the text
 * is written again (`carryFacts`), so they are no difference here: the read-back stays rooms first.
 */
const FACTS_CARRIED = ['properties'] as const

/**
 * Any other key of a part, as the schema reads it: a key rooms text does not write (one a later
 * step adds) is a difference, so the floor is given in Grid's own terms and nothing is lost.
 */
function otherKeys(a: object, b: object, said: readonly string[]): string | null {
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (said.includes(key)) continue
    const x = ra[key]
    const y = rb[key]
    if (x === undefined && y === undefined) continue
    if (typeof x === 'number' && typeof y === 'number' ? !sameNumber(x, y) : JSON.stringify(x) !== JSON.stringify(y)) return `has another ${key}`
  }
  return null
}

function openingDiffers(a: Opening, b: Opening): string | null {
  if (a.wall !== b.wall) return 'is in another wall'
  if (a.type !== b.type) return 'is of another type'
  if (!sameNumber(a.offset, b.offset) || !sameNumber(a.width, b.width)) return 'stands elsewhere along its wall'
  if (!sameNumber(a.sill, b.sill) || !sameNumber(a.height, b.height)) return 'has another sill or height'
  if (a.hinge !== b.hinge || a.swing !== b.swing) return 'hangs or swings another way'
  if (a.kind !== b.kind) return 'is of another kind'
  if (!sameNumber(a.opens?.width ?? 0, b.opens?.width ?? 0) || !sameNumber(a.opens?.height ?? 0, b.opens?.height ?? 0)) return 'opens in another part'
  return otherKeys(a, b, ['id', 'wall', 'type', 'offset', 'width', 'sill', 'height', 'hinge', 'swing', 'kind', 'opens', ...FACTS_CARRIED])
}

interface Difference {
  readonly kind: 'wall' | 'room' | 'opening'
  readonly id: string
  readonly what: string
}

function differences<T extends { id: string }>(kind: Difference['kind'], before: readonly T[], after: readonly T[], differs: (a: T, b: T) => string | null): Difference[] {
  const out: Difference[] = []
  const byId = new Map(after.map((x) => [x.id, x]))
  for (const a of before) {
    const b = byId.get(a.id)
    if (!b) out.push({ kind, id: a.id, what: 'is not there' })
    else {
      const what = differs(a, b)
      if (what !== null) out.push({ kind, id: a.id, what })
    }
  }
  const ids = new Set(before.map((x) => x.id))
  for (const b of after) if (!ids.has(b.id)) out.push({ kind, id: b.id, what: 'is new' })
  return out
}

function floorDifferences(original: FloorPlan, written: FloorPlan, floor: string): Difference[] {
  const on = <T extends { floor?: string | undefined }>(list: readonly T[]): T[] => list.filter((x) => floorOf(x) === floor)
  const wallFloor = new Map(original.walls.map((w) => [w.id, floorOf(w)]))
  const writtenWallFloor = new Map(written.walls.map((w) => [w.id, floorOf(w)]))
  const openingsOn = (plan: FloorPlan, walls: Map<string, string>): Opening[] => plan.openings.filter((o) => (walls.get(o.wall) ?? 'ground') === floor)
  return [
    ...differences('wall', on(original.walls), on(written.walls), (a, b) => wallDiffers(a, b, (w) => heightByDefault(w === a ? original : written, w))),
    ...differences('room', on(original.rooms), on(written.rooms), roomDiffers),
    ...differences('opening', openingsOn(original, wallFloor), openingsOn(written, writtenWallFloor), openingDiffers),
  ]
}

function floorsDiffer(original: FloorPlan, written: FloorPlan): boolean {
  const a = original.floors ?? []
  const b = written.floors ?? []
  if (a.length !== b.length) return true
  return a.some((f, i) => {
    const g = b[i]!
    // LVL-4's parapet and LVL-6's roof are not rooms text: a floor that states one is given in Grid's own terms.
    return f.id !== g.id || f.name !== g.name || f.level !== g.level || !sameNumber(f.elevation, g.elevation) || !sameNumber(f.height, g.height) || !sameNumber(f.slab, g.slab) || f.building !== g.building || !sameNumber(f.parapet, g.parapet) || JSON.stringify(f.roof) !== JSON.stringify(g.roof)
  })
}

// ---------------------------------------------------------------------------------------------
// The draft

interface Rule {
  outside: number
  inside: number
  /** Null when no wall states a height, nor its floor (WRT-6). */
  height: number | null
  kind: Wall['kind']
  types: Map<number, Wall['kind']>
  doorH: number
  winSill: number
  winH: number
}

function ruleOf(plan: FloorPlan): Rule {
  const solid = plan.walls.filter((w) => w.virtual !== true)
  const stated = solid.filter((w) => !heightByDefault(plan, w))
  const outsideWalls = solid.filter((w) => w.kind === 'exterior')
  const insideWalls = solid.filter((w) => w.kind !== 'exterior')
  const inside = mostCommon(insideWalls.map((w) => w.thickness), 0.1)
  const kind = mostCommon(insideWalls.filter((w) => w.thickness === inside).map((w) => w.kind), 'interior')
  const types = new Map<number, Wall['kind']>()
  for (const t of new Set(insideWalls.map((w) => w.thickness))) {
    const k = mostCommon(insideWalls.filter((w) => w.thickness === t).map((w) => w.kind), kind)
    if (t !== inside && k !== kind) types.set(t, k)
  }
  const doors = plan.openings.filter((o) => o.type !== 'window')
  const windows = plan.openings.filter((o) => o.type === 'window')
  return {
    outside: mostCommon(outsideWalls.map((w) => w.thickness), 0.3),
    inside,
    // WRT-6: only the heights something states. With none, the text states none either.
    height: stated.length === 0 ? null : mostCommon(stated.map((w) => w.height), stated[0]!.height),
    kind: kind === 'exterior' ? 'interior' : kind,
    types,
    doorH: mostCommon(doors.map((o) => o.height), 2.1),
    winSill: mostCommon(windows.map((o) => o.sill), 0.9),
    winH: mostCommon(windows.map((o) => o.height), 1.2),
  }
}

interface FloorDraft {
  readonly id: string
  readonly header: string[]
  readonly rooms: string[]
  readonly walls: Map<string, string[]>
  readonly openings: Map<string, string>
  readonly raw: string[]
}

/** The local id rooms text gives a part on a floor, so the writing gives back the plan's id. */
function localIds(plan: FloorPlan, floors: readonly string[], multi: boolean): Map<string, string> {
  const wallFloor = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  const parts = [
    ...plan.rooms.map((r) => ({ id: r.id, floor: floorOf(r) })),
    ...plan.openings.map((o) => ({ id: o.id, floor: wallFloor.get(o.wall) ?? 'ground' })),
  ]
  const out = new Map<string, string>()
  if (!multi) {
    for (const p of parts) out.set(p.id, p.id)
    return out
  }
  // LVL-16: the writing keeps an id as written on the first floor that writes it and puts the
  // floor's id in front on the others, so `first-door` is written `door` when an earlier floor
  // has `door`, and the writing puts the floor back. Any other id, such as one of a plan written
  // before, when every floor took its id in front, is written as it is, so nothing is renamed.
  const order = new Map(floors.map((f, i) => [f, i]))
  const floorOfId = new Map(parts.map((p) => [p.id, p.floor]))
  for (const p of parts) {
    const local = p.id.startsWith(`${p.floor}-`) ? p.id.slice(p.floor.length + 1) : null
    const owner = local === null ? undefined : floorOfId.get(local)
    const kept = owner !== undefined && (order.get(owner) ?? Infinity) < (order.get(p.floor) ?? -Infinity)
    out.set(p.id, kept ? local! : p.id)
  }
  return out
}

function roomLine(room: Room, poly: P[], local: string): string {
  const use = room.use ?? '-'
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0
  const d = Math.max(...ys) - y0
  let area = 0
  for (let i = 0; i < poly.length; i++) area += cross(poly[i]!, poly[(i + 1) % poly.length]!) / 2
  const rect = poly.length === 4 && Math.abs(Math.abs(area) - w * d) < tolerance('areaEqual')
  // WRT-22: a side past the lowest figure Grid asks at (a home's) is written with its unit, so the reading asks nothing of it.
  const side = (v: number): string => (v > limit('roomsSideAsked', 'home') ? `${metres(v)}m` : metres(v))
  const where = rect ? `${side(w)} x ${side(d)} at ${metres(x0)},${metres(y0)}` : `polygon ${poly.map((p) => `${metres(p[0])},${metres(p[1])}`).join(' ')}`
  const height = room.height !== undefined ? ` height ${metres(room.height)}` : ''
  const step = room.floorOffset !== undefined ? ` floor ${metres(room.floorOffset)}` : ''
  const tenure = room.tenure !== undefined ? ` tenure ${room.tenure}` : ''
  const type = room.roomType !== undefined ? ` type ${quote(room.roomType)}` : ''
  // CNT-7 (C26): `outdoor: true` has no word of its own, so such a room's floor is given raw.
  const outdoor = typeof room.outdoor === 'string' ? ` outdoor ${room.outdoor}${room.roofed === undefined ? '' : room.roofed ? ' roofed' : ' unroofed'}` : ''
  return `room ${local} ${quote(room.name)} ${use} ${where}${height}${step}${tenure}${type}${outdoor}`
}

/** The rooms on the two sides of an opening's middle: [left, right] of its wall. */
function roomsAtOpening(o: Opening, wall: Wall, plan: FloorPlan, polys: Map<string, P[]>): [string | null, string | null] {
  const dir = unit(sub(wall.end, wall.start))
  const normal: P = [-dir[1], dir[0]]
  const along = o.offset + o.width / 2
  const mid: P = [wall.start[0] + dir[0] * along, wall.start[1] + dir[1] * along]
  const out: Array<string | null> = []
  for (const sign of [1, -1]) {
    const reach = wall.virtual === true ? tolerance('stepPastFace') : wall.thickness / 2 + tolerance('stepPastFace')
    const p: P = [mid[0] + normal[0] * sign * reach, mid[1] + normal[1] * sign * reach]
    let hit: string | null = null
    for (const r of plan.rooms) {
      if (floorOf(r) !== floorOf(wall)) continue
      const poly = polys.get(r.id)
      if (poly && contains(poly, p)) {
        hit = r.id
        break
      }
    }
    out.push(hit)
  }
  return [out[0]!, out[1]!]
}

function contains(poly: readonly P[], pt: P): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a[1] > pt[1] !== b[1] > pt[1]) {
      const x = a[0] + ((pt[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])
      if (pt[0] < x) inside = !inside
    }
  }
  return inside
}

function openingLine(o: Opening, wall: Wall, plan: FloorPlan, polys: Map<string, P[]>, rule: Rule, local: Map<string, string>): string | null {
  const [left, right] = roomsAtOpening(o, wall, plan, polys)
  const host = left ?? right
  if (host === null) return null
  const poly = polys.get(host)!
  const dir = unit(sub(wall.end, wall.start))
  const a: P = [wall.start[0] + dir[0] * o.offset, wall.start[1] + dir[1] * o.offset]
  const b: P = [wall.start[0] + dir[0] * (o.offset + o.width), wall.start[1] + dir[1] * (o.offset + o.width)]
  const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let best: { d: number; p0: P; u: P; L: number; n: P } | null = null
  const edges: Array<{ p0: P; p1: P; u: P; n: P }> = []
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]!
    const p1 = poly[(i + 1) % poly.length]!
    const u = unit(sub(p1, p0))
    edges.push({ p0, p1, u, n: [u[1], -u[0]] })
    if (Math.abs(cross(u, dir)) > tolerance('noTurn')) continue
    const d = Math.abs(cross(u, sub(mid, p0)))
    if (best === null || d < best.d) best = { d, p0, u, L: norm(sub(p1, p0)), n: [u[1], -u[0]] }
  }
  if (best === null) return null
  const s0 = Math.min(dot(sub(a, best.p0), best.u), dot(sub(b, best.p0), best.u))
  let side = compassOf(best.n)
  const facing = edges.filter((e) => dot(e.n, COMPASS[side]!) > 0.9)
  if (facing.length > 1) {
    facing.sort((x, y) => x.p0[0] + x.p1[0] - (y.p0[0] + y.p1[0]) || x.p0[1] + x.p1[1] - (y.p0[1] + y.p1[1]))
    const k = facing.findIndex((e) => samePoint(e.p0, best!.p0))
    side = `${side}.${k + 1}`
  }
  const from = compassOf([-best.u[0], -best.u[1]], DIRS)
  let line = `${o.type} ${local.get(o.id) ?? o.id} in ${local.get(host) ?? host} ${side}, ${metres(s0)} from ${from}, ${metres(o.width)} wide`
  if (o.type === 'window') {
    if (!sameNumber(o.sill, rule.winSill)) line += `, sill ${metres(o.sill)}`
    if (!sameNumber(o.height, rule.winH)) line += `, height ${metres(o.height)}`
  } else {
    if (!sameNumber(o.sill, 0)) line += `, sill ${metres(o.sill)}`
    if (!sameNumber(o.height, rule.doorH)) line += `, height ${metres(o.height)}`
  }
  // CNT-14: its kind and the part that opens. A kind its type does not take cannot be written.
  if (o.kind !== undefined) {
    if (!kindFits(o.type, o.kind)) return null
    line += `, ${o.kind}`
  }
  if (o.opens !== undefined) line += `, part ${metres(o.opens.width)}${o.opens.height !== undefined ? ` x ${metres(o.opens.height)}` : ''}`
  if (o.type === 'door') {
    const kind = doorKindOf(o.kind)
    // A pair needs only the face it opens to; a door that slides, rolls or lifts, neither.
    const needs = swingNeeds(kind)
    const into = o.swing === undefined ? undefined : o.swing === 'left' ? left : right
    const hingeDir: P = o.hinge === 'start' ? [-dir[0], -dir[1]] : dir
    if (!sweepsFloor(kind)) {
      if (into !== undefined) line += into === null ? ', opens out' : `, opens into ${local.get(into) ?? into}`
      if (o.hinge !== undefined) line += `, hinged ${compassOf(hingeDir, DIRS)}`
    } else if (o.swing === undefined && o.hinge === undefined) line += ', no-swing'
    else if (o.swing === undefined || (needs.hinge && o.hinge === undefined)) return null
    else {
      line += into === null || into === undefined ? ', opens out' : `, opens into ${local.get(into) ?? into}`
      if (o.hinge !== undefined) line += `, hinged ${compassOf(hingeDir, DIRS)}`
    }
  }
  return line
}

/** The rooms text of one floor, rooms first, before it is checked. */
function draftFloor(plan: FloorPlan, floor: string, rule: Rule, local: Map<string, string>): FloorDraft {
  const index = indexPlan(plan)
  const polys = new Map<string, P[]>()
  for (const r of plan.rooms) {
    const poly = tryRoomPolygon(r, index)
    if (poly) polys.set(r.id, poly.map((p) => [p.x, p.y] as P))
  }
  const draft: FloorDraft = { id: floor, header: [], rooms: [], walls: new Map(), openings: new Map(), raw: [] }
  for (const room of plan.rooms.filter((r) => floorOf(r) === floor)) {
    const poly = polys.get(room.id)
    if (!poly) {
      draft.raw.push(rawLine('room', room))
      continue
    }
    draft.rooms.push(roomLine(room, poly, local.get(room.id) ?? room.id))
  }
  // Virtual lines, and outside walls of another thickness or kind: said before the writing.
  const onFloor = plan.rooms.filter((r) => floorOf(r) === floor)
  for (const wall of plan.walls.filter((w) => floorOf(w) === floor)) {
    const rooms = index.roomsByWall.get(wall.id) ?? []
    if (wall.virtual === true && rooms.length === 2) {
      const [a, b] = rooms.map((r) => local.get(r.id) ?? r.id) as [string, string]
      addWallSay(draft, `wall between ${a} and ${b}`, ['virtual', ...(wall.thickness !== 0 ? [metres(wall.thickness)] : []), ...(wall.height !== 0 ? ['height', metres(wall.height)] : [])])
      continue
    }
    if (wall.virtual === true || (wall.thickness === rule.outside && wall.kind === 'exterior')) continue
    for (const room of rooms) {
      const poly = polys.get(room.id)
      if (!poly) continue
      const side = outsideSide(poly, wall, onFloor.filter((r) => r !== room).map((r) => polys.get(r.id)).filter((x): x is P[] => x !== undefined))
      if (side === null) continue
      addWallSay(draft, `wall ${local.get(room.id) ?? room.id} ${side}`, [
        ...(wall.thickness !== rule.outside ? [metres(wall.thickness)] : []),
        ...(wall.kind !== 'exterior' ? [wall.kind] : []),
      ])
    }
  }
  const walls = new Map(plan.walls.map((w) => [w.id, w]))
  for (const o of plan.openings) {
    const wall = walls.get(o.wall)
    if (!wall) {
      if (floor === 'ground' || plan.walls.length === 0) draft.raw.push(rawLine('opening', o))
      continue
    }
    if (floorOf(wall) !== floor) continue
    const line = openingLine(o, wall, plan, polys, rule, local)
    draft.openings.set(o.id, line ?? rawLine('opening', o))
  }
  for (const wall of plan.walls.filter((w) => floorOf(w) === floor && (index.roomsByWall.get(w.id)?.length ?? 0) === 0)) draft.raw.push(rawLine('wall', wall))
  return draft
}

/**
 * The compass side of a room that a wall runs along with no room beyond it, or null: the wall
 * is outside for that room there. Looked for beyond the wall's far face, by the room's side.
 */
function outsideSide(poly: readonly P[], wall: Wall, others: readonly (readonly P[])[]): string | null {
  const dir = unit(sub(wall.end, wall.start))
  const len = norm(sub(wall.end, wall.start))
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]!
    const p1 = poly[(i + 1) % poly.length]!
    const u = unit(sub(p1, p0))
    if (Math.abs(cross(u, dir)) > tolerance('noTurn')) continue
    const n: P = [u[1], -u[0]]
    const off = dot(sub(wall.start, p0), n)
    if (Math.abs(off - wall.thickness / 2) > SAME * 10) continue
    // Where the side and the wall run together.
    const a = dot(sub(p0, wall.start), dir)
    const b = dot(sub(p1, wall.start), dir)
    const lo = Math.max(0, Math.min(a, b))
    const hi = Math.min(len, Math.max(a, b))
    if (hi - lo <= SAME) continue
    const mid = (lo + hi) / 2
    const beyond = wall.thickness / 2 + tolerance('stepPastFace')
    const probe: P = [wall.start[0] + dir[0] * mid + n[0] * beyond, wall.start[1] + dir[1] * mid + n[1] * beyond]
    if (others.some((o) => contains(o, probe))) return null
    return compassOf(n)
  }
  return null
}

function addWallSay(draft: FloorDraft, handle: string, words: readonly string[]): void {
  const list = draft.walls.get(handle) ?? []
  for (const w of words) if (!list.includes(w) || w === 'height' || /^\d/.test(w)) list.push(w)
  draft.walls.set(handle, list)
}

function sayWords(handle: string, words: string[], word: string, value?: string): void {
  if (word === 'height' || word === 'id') {
    const k = words.indexOf(word)
    if (k >= 0) words.splice(k, 2)
    words.push(word, value!)
  } else if (!words.includes(word)) words.push(word)
  void handle
}

// ---------------------------------------------------------------------------------------------
// The text

function headerLines(plan: FloorPlan, rule: Rule, name: string | undefined): string[] {
  const lines: string[] = []
  if (name !== undefined) lines.push(`plan ${quote(name)}`)
  lines.push(`based on ${planRevision(plan)}`)
  if (plan.building !== undefined) lines.push(`building ${plan.building}`)
  // WRT-7: how the person reads lengths, so writing the text again keeps it.
  const shown = plan.display
  if (shown !== undefined) lines.push(['display', shown.length, ...(shown.area !== undefined ? ['area', shown.area] : []), ...(shown.decimal !== undefined ? ['decimal', shown.decimal] : []), ...(shown.precision !== undefined ? ['precision', String(shown.precision)] : [])].join(' '))
  lines.push(`walls outside ${metres(rule.outside)} inside ${metres(rule.inside)}${rule.kind !== 'interior' ? ` ${rule.kind}` : ''}${rule.height === null ? '' : ` height ${metres(rule.height)}`}`)
  for (const [t, k] of [...rule.types].sort((a, b) => a[0] - b[0])) lines.push(`walltype ${metres(t)} ${k}`)
  if (!sameNumber(rule.doorH, 2.1)) lines.push(`doors height ${metres(rule.doorH)}`)
  if (!sameNumber(rule.winSill, 0.9) || !sameNumber(rule.winH, 1.2)) lines.push(`windows sill ${metres(rule.winSill)} height ${metres(rule.winH)}`)
  return lines
}

/** WRT-14: a level rooms text writes on the floor line: a whole number or a half. */
const storeyLevel = (level: number): boolean => Number.isInteger(level * 2)

function floorLine(plan: FloorPlan, floor: string): string | null {
  const f = (plan.floors ?? []).find((x) => x.id === floor)
  if (!f) return null
  // WRT-14: rooms text writes a level as a storey number, whole or a half; any other is the plan
  // file's own, given in `raw floor` (`rawFloorOf`).
  const extra = [
    ...(storeyLevel(f.level) ? [`level ${metres(f.level)}`] : []),
    ...(f.height !== undefined ? [`height ${metres(f.height)}`] : []),
    ...(f.elevation !== undefined ? [`elevation ${metres(f.elevation)}`] : []),
    ...(f.slab !== undefined ? [`slab ${metres(f.slab)}`] : []),
    ...(f.building !== undefined ? [`building ${f.building}`] : []),
  ]
  return [`floor ${f.id}`, quote(f.name), ...extra].join(' ')
}

function textOf(plan: FloorPlan, rule: Rule, name: string | undefined, floors: readonly FloorDraft[], raw: ReadonlySet<string>): string {
  const lines = headerLines(plan, rule, name)
  for (const d of floors) {
    lines.push('')
    const fl = floorLine(plan, d.id)
    if (fl !== null) lines.push(fl)
    // LVL-6: the floor's roof and parapet, which rooms text has no words for, as the plan holds
    // them; BRF-4: its outline and the homes and parking spaces it states.
    const f = (plan.floors ?? []).find((x) => x.id === d.id)
    const extra = f === undefined ? {} : { ...(storeyLevel(f.level) ? {} : { level: f.level }), ...Object.fromEntries(RAW_FLOOR_KEYS.flatMap((key) => (f[key as keyof typeof f] === undefined ? [] : [[key, f[key as keyof typeof f]]]))) }
    if (Object.keys(extra).length > 0) lines.push(`raw floor ${JSON.stringify(extra)}`)
    if (raw.has(d.id)) {
      lines.push(`# Written in Grid's own terms: rooms text does not give back this floor's walls as they are.`)
      for (const w of plan.walls.filter((x) => floorOf(x) === d.id)) lines.push(rawLine('wall', w))
      for (const r of plan.rooms.filter((x) => floorOf(x) === d.id)) lines.push(rawLine('room', r))
      const walls = new Map(plan.walls.map((w) => [w.id, w]))
      for (const o of plan.openings) {
        const w = walls.get(o.wall)
        if (w ? floorOf(w) === d.id : d.id === floors[0]!.id) lines.push(rawLine('opening', o))
      }
      continue
    }
    for (const [handle, words] of d.walls) if (words.length > 0) lines.push(`${handle} ${words.join(' ')}`)
    lines.push(...d.rooms)
    lines.push(...d.openings.values())
    lines.push(...d.raw)
  }
  return `${lines.join('\n')}\n`
}

/** Says what the writing should say about each wall it worked out, to give back the plan's own. */
function reconcileWalls(original: FloorPlan, written: ReadBack, drafts: FloorDraft[]): boolean {
  const plan = written.plan
  if (plan === null) return false
  let said = false
  const byFloor = new Map(drafts.map((d) => [d.id, d]))
  for (const facts of written.walls) {
    const w = plan.walls.find((x) => x.id === facts.id)
    if (!w) continue
    const draft = byFloor.get(floorOf(w))
    if (!draft) continue
    // The original wall in the same place: the same line and ends, either way round.
    const same = original.walls.find(
      (o) =>
        floorOf(o) === floorOf(w) &&
        (o.virtual === true) === (w.virtual === true) &&
        ((samePoint(o.start, w.start) && samePoint(o.end, w.end)) || (samePoint(o.start, w.end) && samePoint(o.end, w.start)))
    )
    if (same) {
      for (const handle of facts.handles) {
        const words = draft.walls.get(handle) ?? []
        const before = words.join(' ')
        if (same.id !== w.id) sayWords(handle, words, 'id', same.id)
        // A height the plan leaves to Grid's default is not said: rooms text would state it (WRT-6).
        if ((!sameNumber(same.height, w.height) || heightByDefault(plan, w)) && !heightByDefault(original, same)) sayWords(handle, words, 'height', metres(same.height))
        if (same.kind !== w.kind && w.virtual !== true) sayWords(handle, words, same.kind)
        if (samePoint(same.start, w.end) && !samePoint(same.start, w.start) && !words.includes('reversed')) words.push('reversed')
        if (words.join(' ') !== before) {
          draft.walls.set(handle, words)
          said = true
        }
      }
      continue
    }
    // No wall stands there whole: each stretch takes the id of the original wall it lies on.
    for (const { handle, start, end } of facts.stretches) {
      const covering = original.walls.filter((o) => floorOf(o) === floorOf(w) && onWall(o, start, end, w.thickness))
      if (covering.length !== 1) continue
      const words = draft.walls.get(handle) ?? []
      if (words.includes('id')) continue
      sayWords(handle, words, 'id', covering[0]!.id)
      if ((!sameNumber(covering[0]!.height, w.height) || heightByDefault(plan, w)) && !heightByDefault(original, covering[0]!)) sayWords(handle, words, 'height', metres(covering[0]!.height))
      if (covering[0]!.kind !== w.kind) sayWords(handle, words, covering[0]!.kind)
      draft.walls.set(handle, words)
      said = true
    }
  }
  return said
}

/** Does the stretch from `start` to `end` lie along wall `whole`'s line, mostly inside its length, with its thickness? */
function onWall(whole: Wall, start: P, end: P, thickness: number): boolean {
  if (!sameNumber(whole.thickness, thickness)) return false
  const part = { start, end }
  const dir = unit(sub(whole.end, whole.start))
  const len = norm(sub(whole.end, whole.start))
  const off = (p: readonly [number, number]): number => cross(dir, sub(p, whole.start))
  const at = (p: readonly [number, number]): number => dot(sub(p, whole.start), dir)
  if (Math.abs(off(part.start)) > SAME * 10 || Math.abs(off(part.end)) > SAME * 10) return false
  const a = at(part.start)
  const b = at(part.end)
  // A stretch overlaps the wall for most of its own length.
  const lo = Math.max(0, Math.min(a, b))
  const hi = Math.min(len, Math.max(a, b))
  return hi - lo > Math.abs(b - a) / 2
}

/** Each room's boundary started at the wall the plan starts it at. */
function reconcileRooms(original: FloorPlan, written: ReadBack, drafts: FloorDraft[], local: Map<string, string>): boolean {
  const plan = written.plan
  if (plan === null) return false
  let said = false
  for (const room of original.rooms) {
    const got = plan.rooms.find((r) => r.id === room.id)
    if (!got || got.boundary.join('|') === room.boundary.join('|') || room.boundary.length === 0) continue
    const first = room.boundary[0]!
    const k = got.boundary.indexOf(first)
    if (k <= 0) continue
    const rotated = [...got.boundary.slice(k), ...got.boundary.slice(0, k)]
    if (rotated.join('|') !== room.boundary.join('|')) continue
    const draft = drafts.find((d) => d.id === floorOf(room))
    if (!draft) continue
    const lid = local.get(room.id) ?? room.id
    const i = draft.rooms.findIndex((line) => line.startsWith(`room ${lid} `))
    if (i < 0 || draft.rooms[i]!.includes(' first-wall ')) continue
    draft.rooms[i] = `${draft.rooms[i]} first-wall ${first}`
    said = true
  }
  return said
}

/** How many times the read-back is written again to settle what it must say, at most. */
const SETTLE_ROUNDS = 6

/**
 * The plan as rooms text. By default it loses nothing: writing it again with
 * `compileRoomsText` gives back the same walls, rooms, openings and floors.
 */
export function readRoomsText(plan: FloorPlan, options: ReadOptions = {}): RoomsReading {
  const rule = ruleOf(plan)
  const floors = planFloors(plan).map((f) => f.id)
  if (floors.length === 0) floors.push('ground')
  const multi = floors.length > 1 || (plan.floors?.length ?? 0) > 0
  const local = localIds(plan, floors, floors.length > 1)
  const drafts = floors.map((f) => draftFloor(plan, f, rule, local))
  const raw = new Set<string>()
  const rawOpenings: string[] = []
  const why = new Map<string, string>()
  let changes: string[] = []
  if (plan.walls.length + plan.rooms.length + plan.openings.length === 0) {
    return { text: textOf(plan, rule, options.name, drafts, raw), rawFloors: [], rawOpenings: [], changes: [] }
  }
  // CNT-18: rooms text writes straight walls. A floor with a curved wall is given in Grid's own
  // terms, which keep the curve, whatever was asked for, so writing it again loses nothing.
  for (const wall of plan.walls) {
    const floor = floorOf(wall)
    if (wall.arc === undefined || raw.has(floor) || !floors.includes(floor)) continue
    raw.add(floor)
    why.set(floor, english(said('describe.rooms.curved', { wall: quote(wall.id) })))
  }
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    const text = textOf(plan, rule, options.name, drafts, raw)
    const compiled = compileRoomsText(text)
    // Read as a plan file is read, so a wall it gives no height reads as the plan's do (WRT-6).
    const written: ReadBack = { ...compiled, plan: compiled.plan === null ? null : safeParseFloorPlan(compiled.plan) }
    if (written.plan === null) {
      // A floor the writing refuses is given in Grid's own terms.
      const at = written.problems[0]?.line ?? null
      const floor = floorAtLine(text, at, floors) ?? drafts.find((d) => !raw.has(d.id))?.id
      if (floor === undefined || raw.has(floor)) break
      raw.add(floor)
      why.set(floor, written.problems[0]?.message ?? 'its rooms text could not be written')
      continue
    }
    const saidWalls = reconcileWalls(plan, written, drafts)
    const saidRooms = reconcileRooms(plan, written, drafts, local)
    if (saidWalls || saidRooms) continue
    // Openings the writing does not give back as they are go raw on their own.
    let moved = false
    for (const d of drafts) {
      if (raw.has(d.id)) continue
      for (const [id, line] of d.openings) {
        if (line.startsWith('raw ')) continue
        const a = plan.openings.find((o) => o.id === id)!
        const b = written.plan.openings.find((o) => o.id === id)
        if (b === undefined || openingDiffers(a, b) !== null) {
          d.openings.set(id, rawLine('opening', a))
          rawOpenings.push(id)
          moved = true
        }
      }
    }
    if (moved) continue
    const left = drafts.filter((d) => !raw.has(d.id)).map((d) => ({ d, diff: floorDifferences(plan, written.plan!, d.id) }))
    const wrong = left.filter((x) => x.diff.length > 0)
    if (floorsDiffer(plan, written.plan) && !multi) break
    if (wrong.length === 0) break
    if (options.prefer === 'rooms') {
      changes = wrong.flatMap((x) => x.diff.map((d) => `${d.kind} ${d.id} ${d.what}`))
      break
    }
    for (const { d, diff } of wrong) {
      raw.add(d.id)
      why.set(d.id, diff.slice(0, 3).map((x) => `${x.kind} '${x.id}' ${x.what}`).join('; '))
    }
  }
  let text = textOf(plan, rule, options.name, drafts, raw)
  if (changes.length > 0) {
    const note = [`# Written rooms first as asked: writing this text again changes ${changes.length} part${changes.length === 1 ? '' : 's'} of the plan:`, ...changes.slice(0, 20).map((c) => `#   ${c}`), ...(changes.length > 20 ? [`#   and ${changes.length - 20} more`] : [])]
    text = `${note.join('\n')}\n${text}`
  }
  return { text, rawFloors: [...raw].map((floor) => ({ floor, why: why.get(floor) ?? '' })), rawOpenings, changes }
}

/** The floor a line of the text is on. */
function floorAtLine(text: string, line: number | null, floors: readonly string[]): string | null {
  if (line === null) return null
  let floor: string | null = floors[0] ?? null
  const lines = text.split('\n')
  for (let i = 0; i < Math.min(line, lines.length); i++) {
    const m = /^floor (\S+) /.exec(lines[i]!)
    if (m) floor = m[1]!
  }
  return floor
}
