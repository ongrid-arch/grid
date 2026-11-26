/**
 * A fit-out on a base plan in rooms text (WRT-75, C16): the `base` line, and the rooms resting on
 * the base's walls.
 *
 *   base <plan file>          the base plan, by its path from the project folder (quoted when it
 *                             holds a space): the shell the rooms are fitted out in
 *
 * The rooms are written as every room is, by their inside faces. A wall the writing works out is
 * the base's when every room that names it has its face along it flush on a wall of the base
 * (`restOnBase`): a wall of the same floor, along the same line, with the room on the far side of
 * that face from the base wall's centre line. That wall is not written: the room's boundary names
 * the base's walls in its place, by the base's ids, in order along the room's side. A wall the
 * writing works out that ends on such a wall's centre line has its end moved, along its own line,
 * to the base wall's centre line, as it would end on a wall of its own, and the openings in it keep
 * their places. The match is by faces, so a room rests on a base wall of any thickness, whatever
 * the text's `walls` line says.
 *
 * A door or window the text puts in a wall that rests on the base is refused, naming the base
 * wall: the shell is read-only in a fit-out, and its doors and windows are the base's. So is a part
 * of the text with the id of a base wall or opening, except a raw wall or opening that is that very
 * part (the read-back gives a floor raw so), which is the base's and is left out. A wall worked out
 * with a base wall's id is written with `-fit` after it. A room's face near a base wall but not on
 * it is said, with how far off it is.
 *
 * Pure: the compiler reads no file. The command reads the base the text names (`baseNamedIn`) and
 * passes it in `CompileOptions.base`.
 */
import { safeParseFloorPlan, type FloorPlan, type Opening, type Room, type Wall } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { floorOf } from '../geometry/floors'
import { tryRoomPolygon } from '../geometry/room'
import { mergeBase, planInState } from '../geometry/phases'
import { tolerance } from '../geometry/tolerances'
import { english, joined, name, num, said } from '../messages/say'
import { f2, RoomsStop } from './words'

type P = readonly [number, number]

/** The first word of the line this file reads. */
export const BASE_LINE_WORDS: readonly string[] = ['base']

/** The base plan a fit-out names, as the command read it: its path as written, and the plan (opening patterns expanded). */
export interface BasePlan {
  readonly file: string
  readonly plan: FloorPlan
}

/** A note of the fit-out's writing, as the compiler's problems and warnings are. */
interface Note {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

const BASE_LINE = /^\s*base(?:\s+(?:"([^"]*)"|'([^']*)'|(\S+)))?\s*(.*)$/

/** The path a `base` line names, or null for a line that is not a `base` line; `''` for one that names none. */
function pathOfLine(line: string): string | null {
  const found = BASE_LINE.exec(line)
  if (found === null) return null
  if (found[4] !== '') return ''
  return found[1] ?? found[2] ?? found[3] ?? ''
}

/** The base plan a text names, and its line, for the command to read before it writes; null when it names none. */
export function baseNamedIn(text: string): { readonly file: string; readonly line: number } | null {
  const lines = text.split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!/^\s*base(\s|$)/.test(line)) continue
    const file = pathOfLine(line)
    if (file !== null && file !== '') return { file, line: i + 1 }
  }
  return null
}

/** The compiler's reading of the `base` line. */
export class BaseLine {
  file: string | null = null
  line: number | null = null

  read(text: string, at: number): void {
    const file = pathOfLine(text)
    if (file === null || file === '') throw new RoomsStop('rooms/base', english(said('rooms.base.syntax', { line: at })), at)
    if (this.line !== null) throw new RoomsStop('rooms/base', english(said('rooms.base.twice', { line: at, first: this.line })), at)
    this.file = file
    this.line = at
  }
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
const cross = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
const unit = (a: P): P => {
  const n = Math.hypot(a[0], a[1])
  return [a[0] / n, a[1] / n]
}
const left = (u: P): P => [-u[1], u[0]]
/** Written as the compiler writes a length: to a tenth of a millimetre. */
const r4 = (v: number): number => {
  const r = Math.round(v * 10000) / 10000
  return r === 0 ? 0 : r
}

/** A straight wall's line: its start, its direction and its length. */
interface Line {
  readonly start: P
  readonly u: P
  readonly length: number
}

function lineOf(wall: Pick<Wall, 'start' | 'end'>): Line | null {
  const d = sub(wall.end, wall.start)
  const length = Math.hypot(d[0], d[1])
  return length > tolerance('roomsWritten') ? { start: wall.start, u: unit(d), length } : null
}

const straight = (wall: Wall): boolean => wall.arc === undefined && wall.through === undefined

/** The written plan with its rooms resting on the base's walls, or the problems that stop it. */
export interface FitOut<T> {
  readonly plan: T
  readonly problems: readonly Note[]
  readonly warnings: readonly Note[]
  /** The walls the writing worked out that are the base's, and so not written. */
  readonly rested: ReadonlySet<string>
  /** The base's walls the rooms rest on, in the order first met. */
  readonly restsOn: readonly string[]
  /** The plan with its base read in, as `grid check` reads it. */
  readonly checked: FloorPlan | null
  /** The base's walls and openings, whose notes the writing says and never refuses. */
  readonly baseIds: ReadonlySet<string>
}

/** The line of the text that writes an opening, by its id. */
function openingLine(lines: readonly string[], id: string): number | null {
  const at = lines.findIndex((line) => {
    const words = line.trim().split(/\s+/)
    return ['door', 'window', 'opening'].includes(words[0] ?? '') && words[1] === id
  })
  return at < 0 ? null : at + 1
}

/** The stretch of a room's face along a wall: its two ends, in the room's own order round it. */
interface Face {
  readonly p: P
  readonly q: P
  /** Toward the room. */
  readonly inward: P
}

/** The faces of a room's outline that lie along a wall's face, on the room's side. */
function facesAlong(poly: readonly P[], wall: Wall, line: Line): Face[] {
  let twice = 0
  for (let i = 0; i < poly.length; i++) twice += cross(poly[i]!, poly[(i + 1) % poly.length]!)
  const faces: Face[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    const d = sub(q, p)
    if (Math.hypot(d[0], d[1]) <= tolerance('roomsWritten')) continue
    const u = unit(d)
    if (Math.abs(cross(u, line.u)) > tolerance('writtenParallel')) continue
    const off = dot(sub(p, line.start), left(line.u))
    if (Math.abs(Math.abs(off) - wall.thickness / 2) > tolerance('roomsWritten')) continue
    const a = dot(sub(p, line.start), line.u)
    const b = dot(sub(q, line.start), line.u)
    if (Math.max(a, b) < -tolerance('roomsWritten') || Math.min(a, b) > line.length + tolerance('roomsWritten')) continue
    const inward = twice > 0 ? left(u) : ([u[1], -u[0]] as P)
    faces.push({ p, q, inward })
  }
  return faces
}

/** How a room's face lies against the base's walls: the walls it rests on, in its order, or why not. */
type Against = { readonly rests: readonly Wall[] } | { readonly partly: readonly Wall[] } | { readonly off: { readonly wall: Wall; readonly by: number } | null }

function against(face: Face, base: readonly Wall[], floor: string, own: Wall): Against {
  const u = unit(sub(face.q, face.p))
  const flush: Wall[] = []
  let near: { wall: Wall; by: number } | null = null
  for (const wall of base) {
    if (floorOf(wall) !== floor || !straight(wall)) continue
    const line = lineOf(wall)
    if (line === null || Math.abs(cross(line.u, u)) > tolerance('writtenParallel')) continue
    const a = dot(sub(face.p, line.start), line.u)
    const b = dot(sub(face.q, line.start), line.u)
    // Along the same stretch: the face and the base wall share more than a touch.
    if (Math.min(Math.max(a, b), line.length) - Math.max(Math.min(a, b), 0) <= tolerance('gap')) continue
    const n = left(line.u)
    const off = dot(sub(face.p, line.start), n)
    // The room is on the far side of the base wall's face from its centre line.
    const away = Math.sign(off) === Math.sign(dot(face.inward, n))
    const by = Math.abs(Math.abs(off) - wall.thickness / 2)
    if (away && by <= tolerance('flushFaces')) flush.push(wall)
    else if (by <= own.thickness + wall.thickness && (near === null || by < near.by)) near = { wall, by }
  }
  if (flush.length === 0) return { off: near }
  // Covered end to end by the base walls on its line, in the room's order along it.
  const at = (wall: Wall): [number, number] => {
    const s = dot(sub(wall.start, face.p), u)
    const e = dot(sub(wall.end, face.p), u)
    return s < e ? [s, e] : [e, s]
  }
  const length = Math.hypot(...sub(face.q, face.p))
  const ordered = [...flush].sort((x, y) => at(x)[0] + at(x)[1] - (at(y)[0] + at(y)[1]))
  let reached = 0
  for (const wall of [...flush].sort((x, y) => at(x)[0] - at(y)[0])) {
    const [s, e] = at(wall)
    if (s > reached + tolerance('gap')) break
    reached = Math.max(reached, e)
  }
  return reached >= length - tolerance('gap') ? { rests: ordered } : { partly: ordered }
}

/** Drops the same wall named twice in a row round a room (two worked-out walls on one base wall). */
function once(boundary: readonly string[]): string[] {
  const out = boundary.filter((id, i) => i === 0 || id !== boundary[i - 1])
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop()
  return out
}

type Plain = { walls: Array<Omit<Wall, 'height' | 'unstated'> & { height?: number }>; rooms: Room[]; openings: Opening[]; base?: string }

/**
 * The written plan of a text that names a base: its rooms on the base's walls (see the header).
 * `named` is the path the text's `base` line gives, `base` the plan the command read for it, `raw`
 * the ids the text wrote raw. Null when the text names no base.
 */
export function restOnBase<T extends Plain>(text: string, plan: T, named: { readonly file: string; readonly line: number } | null, base: BasePlan | undefined, raw: ReadonlySet<string>): FitOut<T> | null {
  if (named === null) return null
  const none = { rested: new Set<string>(), restsOn: [], checked: null, baseIds: new Set<string>() }
  if (base === undefined || base.file !== named.file) {
    return { plan, problems: [{ code: 'rooms/base', line: named.line, message: capital(english(said('rooms.base.notRead', { line: named.line, file: name(named.file) }))) }], warnings: [], ...none }
  }
  const lines = text.split(/\r\n|\r|\n/)
  const shell = planInState(base.plan, 'after')
  const baseWalls = new Map(shell.walls.map((w) => [w.id, w]))
  const baseOpenings = new Map(shell.openings.map((o) => [o.id, o]))
  const baseIds = new Set([...baseWalls.keys(), ...baseOpenings.keys()])
  const problems: Note[] = []
  const warnings: Note[] = []

  // A raw part that is the base's own is left out; one with a base id that is another part is refused.
  const same = (a: P, b: P): boolean => Math.hypot(...sub(a, b)) <= tolerance('roomsWritten')
  const theBase = (wall: Plain['walls'][number]): boolean => {
    const b = baseWalls.get(wall.id)
    if (b === undefined || Math.abs(b.thickness - wall.thickness) > tolerance('roomsWritten')) return false
    return (same(b.start, wall.start) && same(b.end, wall.end)) || (same(b.start, wall.end) && same(b.end, wall.start))
  }
  const baseOpening = (opening: Opening): boolean => {
    const b = baseOpenings.get(opening.id)
    return b !== undefined && b.wall === opening.wall && Math.abs(b.offset - opening.offset) <= tolerance('roomsWritten') && Math.abs(b.width - opening.width) <= tolerance('roomsWritten')
  }
  const fileWord = name(base.file)
  let walls = plan.walls.filter((w) => !(raw.has(w.id) && theBase(w)))
  let openings = plan.openings.filter((o) => !(raw.has(o.id) && baseOpening(o)))
  for (const wall of walls) if (raw.has(wall.id) && baseWalls.has(wall.id)) problems.push({ code: 'rooms/base', line: null, message: english(said('rooms.base.rawTaken', { kind: 'wall', id: name(wall.id), file: fileWord })) })
  for (const opening of openings) if (raw.has(opening.id) && baseOpenings.has(opening.id)) problems.push({ code: 'rooms/base', line: openingLine(lines, opening.id), message: english(said('rooms.base.rawTaken', { kind: opening.type, id: name(opening.id), file: fileWord })) })
  for (const part of [...plan.rooms, ...openings.filter((o) => !raw.has(o.id))]) {
    if (baseIds.has(part.id)) problems.push({ code: 'rooms/base', line: 'wall' in part ? openingLine(lines, part.id) : null, message: english(said('rooms.base.idTaken', { id: name(part.id), file: fileWord })) })
  }

  // The walls worked out that rest on the base, each room's face on them, by the room's own order.
  const parsed = safeParseFloorPlan({ version: '1', units: 'm', ...plan, walls, openings, base: undefined })
  const index = parsed === null ? null : indexPlan(parsed)
  const polys = new Map<string, P[] | null>()
  const polyOf = (room: Room): P[] | null => {
    if (!polys.has(room.id)) polys.set(room.id, index === null ? null : (tryRoomPolygon(room, index)?.map((v): P => [v.x, v.y]) ?? null))
    return polys.get(room.id)!
  }
  const rested = new Map<string, { readonly onto: ReadonlyMap<string, readonly string[]>; readonly bases: readonly Wall[] }>()
  for (const wall of parsed?.walls ?? []) {
    if (raw.has(wall.id) || wall.virtual === true || !straight(wall)) continue
    const line = lineOf(wall)
    if (line === null) continue
    const rooms = plan.rooms.filter((r) => floorOf(r) === floorOf(wall) && r.boundary.includes(wall.id))
    if (rooms.length === 0 || plan.rooms.some((r) => (r.holes ?? []).some((hole) => hole.includes(wall.id)))) continue
    const onto = new Map<string, string[]>()
    const bases: Wall[] = []
    let whole = true
    for (const room of rooms) {
      const poly = polyOf(room)
      const faces = poly === null ? [] : facesAlong(poly, wall, line)
      if (faces.length === 0) {
        whole = false
        continue
      }
      for (const face of faces) {
        const lies = against(face, [...baseWalls.values()], floorOf(wall), wall)
        if ('rests' in lies) {
          onto.set(room.id, [...(onto.get(room.id) ?? []), ...lies.rests.map((w) => w.id)])
          bases.push(...lies.rests.filter((w) => !bases.includes(w)))
          continue
        }
        whole = false
        if ('partly' in lies) {
          warnings.push({ code: 'rooms/base-partly', line: null, message: english(said('rooms.base.partly', { room: name(room.id), wall: name(wall.id), bases: joined(lies.partly.map((w) => name(w.id)), 'join.comma', 'join.and'), file: fileWord })) })
        } else if (lies.off !== null) {
          warnings.push({ code: 'rooms/base-off', line: null, message: english(said('rooms.base.off', { room: name(room.id), wall: name(wall.id), by: num(f2(lies.off.by)), base: name(lies.off.wall.id), file: fileWord })) })
        }
      }
    }
    if (whole && bases.length > 0) rested.set(wall.id, { onto, bases })
  }

  // Doors and windows in a wall that rests on the base cut the shell; so does one in a base wall.
  for (const opening of openings) {
    const on = rested.get(opening.wall)?.bases.map((w) => w.id) ?? (baseWalls.has(opening.wall) ? [opening.wall] : null)
    if (on === null) continue
    problems.push({ code: 'rooms/base', line: openingLine(lines, opening.id), message: english(said('rooms.base.opening', { kind: opening.type, id: name(opening.id), walls: joined(on.map((id) => name(id)), 'join.comma', 'join.and'), file: fileWord })) })
  }

  // The walls that met a wall now the base's end on the base wall's centre line; their openings stay put.
  const ends = new Map<string, { start?: P; end?: P }>()
  for (const wall of walls) {
    if (rested.has(wall.id) || raw.has(wall.id) || wall.arc !== undefined) continue
    const own = lineOf(wall)
    if (own === null) continue
    for (const which of ['start', 'end'] as const) {
      const point = wall[which]
      for (const [id, rest] of rested) {
        const met = lineOf(parsed!.walls.find((w) => w.id === id)!)!
        const along = dot(sub(point, met.start), met.u)
        if (Math.abs(dot(sub(point, met.start), left(met.u))) > tolerance('roomsWritten') || along < -tolerance('roomsWritten') || along > met.length + tolerance('roomsWritten')) continue
        const onto = rest.bases.map((b) => ({ b, line: lineOf(b)! })).sort((x, y) => distanceAlong(point, x.line) - distanceAlong(point, y.line))[0]!
        const turn = cross(own.u, onto.line.u)
        if (Math.abs(turn) <= tolerance('writtenParallel')) continue
        const t = cross(sub(onto.line.start, point), onto.line.u) / turn
        ends.set(wall.id, { ...ends.get(wall.id), [which]: [r4(point[0] + own.u[0] * t), r4(point[1] + own.u[1] * t)] as P })
        break
      }
    }
  }
  const moved = (wall: Plain['walls'][number]): Plain['walls'][number] => {
    const end = ends.get(wall.id)
    return end === undefined ? wall : { ...wall, ...(end.start === undefined ? {} : { start: [end.start[0], end.start[1]] }), ...(end.end === undefined ? {} : { end: [end.end[0], end.end[1]] }) }
  }
  openings = openings.map((opening) => {
    const start = ends.get(opening.wall)?.start
    const wall = walls.find((w) => w.id === opening.wall)
    if (start === undefined || wall === undefined) return opening
    const line = lineOf(wall)!
    return { ...opening, offset: r4(opening.offset - dot(sub(start, wall.start), line.u)) }
  })

  // A wall worked out with a base wall's or opening's id takes `-fit` after it.
  const taken = new Set([...baseIds, ...walls.map((w) => w.id), ...plan.rooms.map((r) => r.id), ...openings.map((o) => o.id)])
  const renamed = new Map<string, string>()
  for (const wall of walls) {
    if (rested.has(wall.id) || raw.has(wall.id) || !baseIds.has(wall.id)) continue
    let next = `${wall.id}-fit`
    for (let n = 2; taken.has(next); n++) next = `${wall.id}-fit-${n}`
    taken.add(next)
    renamed.set(wall.id, next)
    warnings.push({ code: 'rooms/base-renamed', line: null, message: english(said('rooms.base.renamed', { id: name(wall.id), renamed: name(next), file: fileWord })) })
  }
  const idOf = (id: string): string => renamed.get(id) ?? id
  walls = walls.filter((w) => !rested.has(w.id)).map((w) => ({ ...moved(w), id: idOf(w.id) }))
  openings = openings.map((o) => (renamed.has(o.wall) ? { ...o, wall: idOf(o.wall) } : o))
  const rooms = plan.rooms.map((room): Room => {
    const boundary = room.boundary.flatMap((id) => (rested.has(id) ? (rested.get(id)!.onto.get(room.id) ?? []) : [idOf(id)]))
    return { ...room, boundary: rested.size === 0 ? boundary : once(boundary), ...(room.holes === undefined ? {} : { holes: room.holes.map((hole) => hole.map(idOf)) }) }
  })
  const restsOn = [...new Set([...rested.values()].flatMap((r) => r.bases.map((w) => w.id)))]
  const written = { ...plan, base: named.file, walls, rooms, openings } as T
  const own = safeParseFloorPlan(written)
  const checked = own === null ? null : mergeBase(own, base.plan).plan
  const capitalNote = (note: Note): Note => ({ ...note, message: capital(note.message) })
  return { plan: written, problems: problems.map(capitalNote), warnings: warnings.map(capitalNote), rested: new Set(rested.keys()), restsOn, checked, baseIds }
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** How far a point is from a line's stretch, along it: none when it is beside the stretch. */
function distanceAlong(point: P, line: Line): number {
  const a = dot(sub(point, line.start), line.u)
  return a < 0 ? -a : a > line.length ? a - line.length : 0
}

/** The answer's line on the base: what it is and which of its walls the rooms rest on. */
export function baseAnswer(base: { readonly file: string; readonly restsOn: readonly string[] }): string {
  if (base.restsOn.length === 0) return english(said('rooms.base.restsOnNone', { file: name(base.file) }))
  return english(said('rooms.base.restsOn', { file: name(base.file), count: base.restsOn.length, walls: joined(base.restsOn.slice(0, 12).map((id) => name(id)), 'join.comma', 'join.and') }))
}

/** A fit-out's own parts: the plan as read with its base's walls and openings taken out again. */
export function ownParts<T extends Pick<FloorPlan, 'walls' | 'openings' | 'floors'>>(plan: T, base: { readonly walls: ReadonlySet<string>; readonly openings: ReadonlySet<string>; readonly floors: ReadonlySet<string> }): T {
  const floors = (plan.floors ?? []).filter((f) => !base.floors.has(f.id))
  const { floors: _all, ...rest } = plan
  void _all
  return { ...rest, ...(floors.length > 0 ? { floors } : {}), walls: plan.walls.filter((w) => !base.walls.has(w.id)), openings: plan.openings.filter((o) => !base.openings.has(o.id)) } as T
}

/**
 * The read-back of a fit-out: the plan it reads (the fit-out with its base read in, keeping only
 * the base walls its rooms name and none of the base's openings, which come with the base) and the
 * same view of the plan the text writes again, so the two compare part by part.
 */
export function fitOutReading(file: FloorPlan, base: BasePlan): { readonly plan: FloorPlan; readonly line: string; readonly again: (written: FloorPlan) => FloorPlan } {
  const view = (plan: FloorPlan): FloorPlan => {
    const merged = mergeBase(plan, base.plan)
    const named = new Set(plan.rooms.flatMap((r) => [...r.boundary, ...(r.holes ?? []).flat()]))
    const { base: _named, ...rest } = merged.plan
    void _named
    return { ...rest, walls: merged.plan.walls.filter((w) => !merged.walls.has(w.id) || named.has(w.id)), openings: merged.plan.openings.filter((o) => !merged.openings.has(o.id)) }
  }
  const quoted = /\s/.test(base.file) ? `"${base.file}"` : base.file
  return { plan: view(file), line: `base ${quoted}`, again: view }
}
