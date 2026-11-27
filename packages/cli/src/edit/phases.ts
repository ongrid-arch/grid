/**
 * CNT-10 (lab EL-10, CP4-4): what Grid's edits do in a plan with phases, and in a fit-out on a
 * base plan.
 *
 * A fit-out's base is read-only (`baseTouched`): a change that would move, cut or take out one of
 * the base's walls or openings, or put an opening in a base wall, is refused, naming them, and
 * nothing is written. The base's parts are never in the file, so no change can write them.
 *
 * In a plan that states phases (`phasedPatch`), an edit is the work: what it adds is new, what it
 * takes out of what stood before stays in the plan, to be demolished, and a door or window it
 * changes keeps its old self beside it, demolished, so a widened door is its old opening and a
 * new one in the same place.
 *
 * WRT-15: the room edits (merge, split, add a room, stretch, a side moved) are the work too.
 * - A wall that stood before and that the change makes longer along its line stays as it stood;
 *   each stretch added is a wall of its own, `<id>-new`, new. One made shorter takes its new ends
 *   and the stretch cut off is kept as `<id>-before`, to be demolished. One moved off its line is
 *   new, with its id, and the wall it was is kept as `<id>-before`, to be demolished, with its
 *   doors and windows (a door left on the wall goes with it and is new).
 * - A door or window whose place along its wall changes only because its wall's start moved
 *   stands where it stood: it is not new work.
 * - A room that stood before and that the change reshapes, or that would stand on a wall that is
 *   new, is new, with its id, and the room it was is kept as `<id>-before`, to be demolished,
 *   round the walls as they stood. A room on the pieces of a wall cut where it stood keeps its
 *   shape and stays.
 * The part after the work keeps its id, so later changes and the doors into a room still name
 * it. A curved wall is never cut (CNT-18), so one an edit moves is changed in place, and the
 * answer says so. Pure: a plan and a patch in, a patch out.
 */
import {
  indexPlan,
  phaseReading,
  planHasPhases,
  tolerance,
  tryRoomPolygon,
  wallAxis,
  area,
  type FloorPlan,
  type Opening,
  type Room,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { statedWall } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import { listed, readingAfter, type OpeningChange, type Patch, type RoomChange } from './edits'

type RawRecord = Record<string, unknown>
type Pair = [number, number]

/** The base's walls and openings a patch would change, by id; empty when it leaves them as they are. */
export function baseTouched(patch: Patch, base: { readonly walls: ReadonlySet<string>; readonly openings: ReadonlySet<string> }): string[] {
  const touched = new Set<string>()
  for (const id of [...patch.walls.keys(), ...(patch.removeWalls ?? [])]) if (base.walls.has(id)) touched.add(id)
  for (const id of [...patch.openings.keys(), ...patch.removeOpenings]) if (base.openings.has(id)) touched.add(id)
  // An opening put in a base wall, or moved into one, cuts the shell.
  for (const opening of patch.addOpenings ?? []) if (base.walls.has(opening['wall'] as string)) touched.add(opening['wall'] as string)
  for (const change of patch.openings.values()) if (change.wall !== undefined && base.walls.has(change.wall)) touched.add(change.wall)
  return [...touched]
}

/** The words of a refusal for a change that touches a base, naming the parts. */
export function baseRefusal(touched: readonly string[], file: string): string {
  const names = listed(touched.map(quoted), 4)
  return `That change would touch the base plan ${quoted(file)}: ${names} ${touched.length === 1 ? 'is' : 'are'} part of the shell this plan is fitted out in, which is read-only here. Change the base plan itself, or make the change inside the shell. Nothing was written.`
}

/** What a change to an opening alters of the opening itself, rather than how it is hung or kept. */
// CNT-14: a door or window of another kind is another door or window, so its old self is kept too;
// a door rehung (`hinge`, `swing`) is the same door.
const SHAPE_KEYS: readonly (keyof OpeningChange)[] = ['offset', 'width', 'height', 'sill', 'type', 'wall', 'kind']

/** An id the plan does not use: `<id>-<word>`, then `-<word>-2` and on. */
function freeId(taken: Set<string>, id: string, word = 'before'): string {
  let next = `${id}-${word}`
  for (let n = 2; taken.has(next); n++) next = `${id}-${word}-${n}`
  taken.add(next)
  return next
}

/** A straight stretch of wall, its two ends. */
interface Stretch {
  readonly id: string
  readonly start: Pair
  readonly end: Pair
}

const pair = (v: readonly number[]): Pair => [v[0]!, v[1]!]

/** A change without some of its keys. */
function without<T extends object>(change: T, keys: readonly (keyof T)[]): T {
  const rest = { ...change }
  for (const key of keys) delete rest[key]
  return rest
}
const gap = (a: Pair, b: Pair): number => Math.hypot(a[0] - b[0], a[1] - b[1])
const lengthOf = (s: Pick<Stretch, 'start' | 'end'>): number => gap(s.start, s.end)

/** A point's place along a stretch from its start, and its distance off the stretch's line. */
function placeOn(s: Pick<Stretch, 'start' | 'end'>, p: Pair): { along: number; off: number } {
  const len = lengthOf(s)
  const dir = [(s.end[0] - s.start[0]) / len, (s.end[1] - s.start[1]) / len] as const
  const dx = p[0] - s.start[0]
  const dy = p[1] - s.start[1]
  return { along: dx * dir[0] + dy * dir[1], off: Math.abs(dx * dir[1] - dy * dir[0]) }
}

/** The point `along` metres from a stretch's start. */
function pointOn(s: Pick<Stretch, 'start' | 'end'>, along: number): Pair {
  const len = lengthOf(s)
  return [s.start[0] + ((s.end[0] - s.start[0]) * along) / len, s.start[1] + ((s.end[1] - s.start[1]) * along) / len]
}

/** The two ends of an opening's hole, in the building, on a stretch. */
const holeOn = (s: Pick<Stretch, 'start' | 'end'>, offset: number, width: number): [Pair, Pair] => [pointOn(s, offset), pointOn(s, offset + width)]

/** Where a hole with these two ends sits on a stretch: its offset, when it lies within it. */
function seatOn(s: Pick<Stretch, 'start' | 'end'>, hole: readonly [Pair, Pair]): number | undefined {
  const slack = tolerance('joint')
  const [a, b] = hole.map((p) => placeOn(s, p))
  if (a!.off > slack || b!.off > slack) return undefined
  const lo = Math.min(a!.along, b!.along)
  const hi = Math.max(a!.along, b!.along)
  return lo > -slack && hi < lengthOf(s) + slack ? Math.max(0, lo) : undefined
}

/**
 * Whether a wall lies along another, on its line and within its length: a piece it was cut into.
 * No edit cuts a curved wall (CNT-18, `refuseCurved`), so nothing is a piece of one: taken out,
 * it stays, to be demolished.
 */
function pieceOf(piece: RawRecord, wall: Wall): boolean {
  const start = piece['start'] as [number, number] | undefined
  const end = piece['end'] as [number, number] | undefined
  if (start === undefined || end === undefined || wall.arc !== undefined) return false
  const axis = wallAxis(wall)
  const near = (p: [number, number]): boolean => {
    const dx = p[0] - axis.start.x
    const dy = p[1] - axis.start.y
    const along = dx * axis.dir.x + dy * axis.dir.y
    const off = Math.abs(dx * axis.dir.y - dy * axis.dir.x)
    const slack = tolerance('joint')
    return off < slack && along > -slack && along < axis.length + slack
  }
  return near(start) && near(end)
}

/** What a change of ends does to a straight wall: nothing, adds stretches along its line, cuts some off, or moves it. */
type EndsChange =
  | { readonly kind: 'same' }
  | { readonly kind: 'longer'; readonly added: readonly (readonly [Pair, Pair])[] }
  | { readonly kind: 'shorter'; readonly cut: readonly (readonly [Pair, Pair])[] }
  | { readonly kind: 'moved' }

function endsChange(was: Stretch, start: Pair, end: Pair): EndsChange {
  const slack = tolerance('joint')
  const [a, b] = [placeOn(was, start), placeOn(was, end)]
  if (a.off > slack || b.off > slack) return { kind: 'moved' }
  const lo = Math.min(a.along, b.along)
  const hi = Math.max(a.along, b.along)
  const length = lengthOf(was)
  const loSame = Math.abs(lo) <= slack
  const hiSame = Math.abs(hi - length) <= slack
  if (loSame && hiSame) return { kind: 'same' }
  if (lo <= slack && hi >= length - slack) {
    const added: (readonly [Pair, Pair])[] = []
    if (!loSame) added.push([pointOn(was, lo), was.start])
    if (!hiSame) added.push([was.end, pointOn(was, hi)])
    return { kind: 'longer', added }
  }
  if (lo >= -slack && hi <= length + slack) {
    const cut: (readonly [Pair, Pair])[] = []
    if (!loSame) cut.push([was.start, pointOn(was, lo)])
    if (!hiSame) cut.push([pointOn(was, hi), was.end])
    return { kind: 'shorter', cut }
  }
  return { kind: 'moved' }
}

/** A wall as its file would state it, at other ends, under another id and in a phase. */
function wallRecord(wall: Wall, id: string, start: Pair, end: Pair, phase: 'new' | 'demolished'): RawRecord {
  const stated: RawRecord = { ...statedWall(wall) }
  for (const key of ['id', 'start', 'end', 'face', 'phase', 'arc']) delete stated[key]
  return { id, start, end, ...stated, phase }
}

/** A room as its file would state it, without its phase. */
function roomRecord(room: Room): RawRecord {
  const rest: RawRecord = { ...room }
  delete rest['phase']
  return rest
}

/** The stretches that stand for a wall in one state, in order along it, and its two far ends. */
interface Run {
  readonly ids: readonly string[]
  readonly low: Pair
  readonly high: Pair
}

/** A run of stretches along a line, from its pieces: ordered from one far end to the other. */
function runOf(line: Stretch, pieces: readonly Stretch[]): Run {
  const at = (s: Stretch): number => placeOn(line, pointOn(s, lengthOf(s) / 2)).along
  const sorted = [...pieces].sort((p, q) => at(p) - at(q))
  const ends = pieces.flatMap((s) => [s.start, s.end])
  const along = ends.map((p) => placeOn(line, p).along)
  return { ids: sorted.map((s) => s.id), low: ends[along.indexOf(Math.min(...along))]!, high: ends[along.indexOf(Math.max(...along))]! }
}

/**
 * A ring of wall ids with each wall that stands as a run of stretches in this state written as
 * that run, in order round the ring: the end of the run nearer the wall before it comes first.
 */
function ringWith(ring: readonly string[], runs: ReadonlyMap<string, Run>, endsOf: (id: string) => readonly Pair[]): string[] {
  const out: string[] = []
  ring.forEach((id, i) => {
    const run = runs.get(id)
    if (run === undefined) {
      out.push(id)
      return
    }
    if (run.ids.length < 2) {
      out.push(...run.ids)
      return
    }
    const before = ring[(i - 1 + ring.length) % ring.length]!
    const near = runs.get(before)
    const points = near === undefined ? endsOf(before) : [near.low, near.high]
    const to = (p: Pair): number => Math.min(...points.map((q) => gap(p, q)))
    out.push(...(to(run.high) < to(run.low) ? [...run.ids].reverse() : run.ids))
  })
  return out
}

/** Whether two room outlines are the same shape, corner for corner, leaving out corners in a straight run. */
function sameOutline(a: readonly Vec2[] | null, b: readonly Vec2[] | null): boolean {
  if (a === null || b === null) return a === b
  const slack = tolerance('joint')
  const corners = (ring: readonly Vec2[]): Vec2[] =>
    ring.filter((p, i) => {
      const prev = ring[(i - 1 + ring.length) % ring.length]!
      const next = ring[(i + 1) % ring.length]!
      const cross = (p.x - prev.x) * (next.y - prev.y) - (p.y - prev.y) * (next.x - prev.x)
      return Math.abs(cross) / Math.max(Math.hypot(next.x - prev.x, next.y - prev.y), slack) > slack
    })
  const [p, q] = [corners(a), corners(b)]
  const near = (from: Vec2[], to: Vec2[]): boolean => from.every((u) => to.some((v) => Math.hypot(u.x - v.x, u.y - v.y) <= slack))
  return Math.abs(area(a) - area(b)) <= slack && p.length === q.length && near(p, q) && near(q, p)
}

/**
 * A patch made on the building after the work, turned into the work itself, for a plan that
 * states phases (see the header). `plan` is the plan as read, every phase in it. A plan with no
 * phases, or one fitted out in a base, gets its patch as it is.
 */
export function phasedPatch(plan: FloorPlan, patch: Patch): Patch {
  if (!planHasPhases(plan) || plan.base !== undefined) return patch
  const read = phaseReading(plan)
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  const openings = new Map(plan.openings.map((o) => [o.id, o] as const))
  const rooms = new Map(plan.rooms.map((r) => [r.id, r] as const))
  const added = [...(patch.addWalls ?? []), ...(patch.addOpenings ?? []), ...(patch.addRooms ?? [])].map((part) => part['id']).filter((id): id is string => typeof id === 'string')
  const taken = new Set([...walls.keys(), ...openings.keys(), ...rooms.keys(), ...(plan.items ?? []).map((i) => i.id), ...added])
  const existing = (phase: string): boolean => phase === 'existing'
  const said: string[] = []
  const inPlace: string[] = []
  const kept: string[] = []
  const made: string[] = []
  const stretchOf = (wall: Wall): Stretch => ({ id: wall.id, start: pair(wall.start), end: pair(wall.end) })

  // Walls. `before` holds, for each wall that stood before and that the change alters, the
  // stretches that stand for it before the work; `after`, the stretches of a wall made longer.
  const removedWalls = new Set<string>()
  const wallChanges = new Map(patch.walls)
  const before = new Map<string, Stretch[]>()
  const after = new Map<string, Stretch[]>()
  const movedWalls = new Map<string, string>()
  // CNT-59: a wall cut in pieces keeps its id on its longest piece, its ends changed, so the
  // others are pieces of a changed wall as well as of one taken out.
  const cutWalls = [...(patch.removeWalls ?? []), ...[...patch.walls].filter(([, change]) => change.start !== undefined || change.end !== undefined).map(([id]) => id)]
  const addWalls = (patch.addWalls ?? []).map((wall) => {
    const cutFrom = cutWalls.map((id) => walls.get(id)).find((w): w is Wall => w !== undefined && pieceOf(wall, w))
    // A piece keeps what its wall stated; a wall of its own is new.
    return cutFrom !== undefined || wall['phase'] !== undefined ? wall : { ...wall, phase: 'new' }
  })
  for (const id of patch.removeWalls ?? []) {
    const wall = walls.get(id)
    if (wall === undefined || !existing(read.wall(wall))) {
      removedWalls.add(id)
      continue
    }
    const pieces = addWalls.filter((piece) => pieceOf(piece, wall))
    if (pieces.length > 0) {
      // Cut where it stood: its pieces stand for it before the work as after it.
      removedWalls.add(id)
      before.set(id, pieces.map((piece) => ({ id: piece['id'] as string, start: pair(piece['start'] as Pair), end: pair(piece['end'] as Pair) })))
      const covered = pieces.reduce((sum, piece) => sum + gap(pair(piece['start'] as Pair), pair(piece['end'] as Pair)), 0)
      if (covered < lengthOf(stretchOf(wall)) - tolerance('joint')) inPlace.push(`wall ${quoted(id)}`)
      continue
    }
    wallChanges.set(id, { phase: 'demolished' })
    kept.push(`wall ${quoted(id)}`)
  }
  const extraWalls: RawRecord[] = []
  for (const [id, change] of patch.walls) {
    const wall = walls.get(id)
    if (wall === undefined || !existing(read.wall(wall)) || (change.start === undefined && change.end === undefined)) continue
    if (wall.arc !== undefined || change.arc !== undefined) {
      inPlace.push(`wall ${quoted(id)}`)
      continue
    }
    const was = stretchOf(wall)
    const start = pair(change.start ?? wall.start)
    const end = pair(change.end ?? wall.end)
    const how = endsChange(was, start, end)
    if (how.kind === 'same') continue
    if (how.kind === 'longer') {
      // It stays as it stood; what is added along its line is new.
      const rest = without(change, ['start', 'end'])
      if (Object.keys(rest).length === 0) wallChanges.delete(id)
      else wallChanges.set(id, rest)
      const pieces = how.added.map(([a, b]) => ({ id: freeId(taken, id, 'new'), start: a, end: b }))
      for (const piece of pieces) extraWalls.push(wallRecord(wall, piece.id, piece.start, piece.end, 'new'))
      after.set(id, [was, ...pieces])
      made.push(...pieces.map((piece) => `wall ${quoted(piece.id)} (added to ${quoted(id)})`))
      continue
    }
    const cutBy = addWalls.filter((piece) => pieceOf(piece, wall))
    if (how.kind === 'shorter' && cutBy.length > 0) {
      // CNT-59: cut where it stood, its longest piece keeping its id: its pieces stand for it
      // before the work as after it, as when every piece takes a new id.
      const pieces = cutBy.map((piece) => ({ id: piece['id'] as string, start: pair(piece['start'] as Pair), end: pair(piece['end'] as Pair) }))
      before.set(id, [{ id, start, end }, ...pieces])
      const covered = [{ start, end }, ...pieces].reduce((sum, piece) => sum + gap(piece.start, piece.end), 0)
      if (covered < lengthOf(was) - tolerance('joint')) inPlace.push(`wall ${quoted(id)}`)
      continue
    }
    if (how.kind === 'shorter') {
      // It takes its new ends and stays; what is cut off is kept, to be demolished.
      const pieces = how.cut.map(([a, b]) => ({ id: freeId(taken, id), start: a, end: b }))
      for (const piece of pieces) extraWalls.push(wallRecord(wall, piece.id, piece.start, piece.end, 'demolished'))
      before.set(id, [{ id, start, end }, ...pieces])
      kept.push(...pieces.map((piece) => `the stretch cut off wall ${quoted(id)} (as ${quoted(piece.id)})`))
      continue
    }
    // Moved off its line: the wall with its id is new, the wall it was kept, to be demolished.
    const old = freeId(taken, id)
    extraWalls.push(wallRecord(wall, old, was.start, was.end, 'demolished'))
    wallChanges.set(id, { ...change, phase: 'new' })
    before.set(id, [{ ...was, id: old }])
    movedWalls.set(id, old)
    kept.push(`wall ${quoted(id)} (as ${quoted(old)})`)
    made.push(`wall ${quoted(id)}`)
  }

  // Where each wall stands after the change, as the patch gives it, and as the plan will hold it.
  const patchEnds = (id: string): Stretch | undefined => {
    const change = patch.walls.get(id)
    const wall = walls.get(id)
    const piece = addWalls.find((w) => w['id'] === id)
    if (piece !== undefined) return { id, start: pair(piece['start'] as Pair), end: pair(piece['end'] as Pair) }
    if (wall === undefined || wall.arc !== undefined) return undefined
    return { id, start: pair(change?.start ?? wall.start), end: pair(change?.end ?? wall.end) }
  }
  const standsAfter = (id: string): readonly Stretch[] => {
    const run = after.get(id)
    if (run !== undefined) return run
    const ends = patchEnds(id)
    return ends === undefined ? [] : [ends]
  }
  const standsBefore = (id: string): readonly Stretch[] => {
    const run = before.get(id)
    if (run !== undefined) return run
    const wall = walls.get(id)
    return wall === undefined || wall.arc !== undefined ? [] : [stretchOf(wall)]
  }
  /** An opening's place in a wall made longer, which keeps its ends: on the wall or a stretch added. */
  const seatAfter = (wallId: string, offset: number, width: number): { wall: string; offset: number } | undefined => {
    const run = after.get(wallId)
    const ends = patchEnds(wallId)
    if (run === undefined || ends === undefined) return undefined
    const hole = holeOn(ends, offset, width)
    for (const stretch of run) {
      const at = seatOn(stretch, hole)
      if (at !== undefined) return { wall: stretch.id, offset: at }
    }
    return undefined
  }

  // Openings: one taken out stays, to be demolished; one changed keeps its old self, demolished.
  const removeOpenings = new Set<string>()
  const openingChanges = new Map(patch.openings)
  const addOpenings: RawRecord[] = (patch.addOpenings ?? []).map((o) => {
    const seat = typeof o['wall'] === 'string' && typeof o['offset'] === 'number' && typeof o['width'] === 'number' ? seatAfter(o['wall'], o['offset'], o['width']) : undefined
    const placed = seat === undefined ? o : { ...o, ...seat }
    return placed['phase'] === undefined ? { ...placed, phase: 'new' } : placed
  })
  /** Where an opening that stood before stands before the work: on its wall, or the stretch that holds it now. */
  const seatBefore = (opening: Opening): { wall: string; offset: number } => {
    const run = before.get(opening.wall)
    const wall = walls.get(opening.wall)
    if (run === undefined || wall === undefined || wall.arc !== undefined) return { wall: opening.wall, offset: opening.offset }
    const hole = holeOn(stretchOf(wall), opening.offset, opening.width)
    for (const stretch of run) {
      const at = seatOn(stretch, hole)
      if (at !== undefined) return { wall: stretch.id, offset: at }
    }
    return { wall: run[0]!.id, offset: opening.offset }
  }
  const seatChange = (opening: Opening): Partial<OpeningChange> => {
    const seat = seatBefore(opening)
    return { ...(seat.wall !== opening.wall ? { wall: seat.wall } : {}), ...(Math.abs(seat.offset - opening.offset) > tolerance('noLength') ? { offset: seat.offset } : {}) }
  }
  for (const id of patch.removeOpenings) {
    const opening = openings.get(id)
    if (opening === undefined || !existing(read.opening(opening))) removeOpenings.add(id)
    else {
      openingChanges.set(id, { phase: 'demolished', ...seatChange(opening) })
      said.push(`${quoted(id)} stood before the work: it stays in the plan, to be demolished.`)
    }
  }
  for (const [id, asked] of patch.openings) {
    const opening = openings.get(id)
    if (opening === undefined || !existing(read.opening(opening))) continue
    let change: OpeningChange = asked
    // In a wall made longer, which keeps its ends, its place is measured from where the wall starts.
    const seat = seatAfter(change.wall ?? opening.wall, change.offset ?? opening.offset, change.width ?? opening.width)
    if (seat !== undefined) change = { ...change, wall: seat.wall, offset: seat.offset }
    // Its place along the wall changed only as the wall's start moved: it stands where it stood.
    const target = change.wall ?? opening.wall
    const where = standsAfter(target).find((s) => s.id === target)
    const was = walls.get(opening.wall)
    if (target === opening.wall && change.offset !== undefined && where !== undefined && was !== undefined && was.arc === undefined && !movedWalls.has(target)) {
      const slack = tolerance('joint')
      const then = holeOn(stretchOf(was), opening.offset, opening.width)
      const now = holeOn(where, change.offset, change.width ?? opening.width)
      const kept = (gap(then[0], now[0]) <= slack && gap(then[1], now[1]) <= slack) || (gap(then[0], now[1]) <= slack && gap(then[1], now[0]) <= slack)
      if (kept) {
        change = without(change, ['offset'])
      }
    }
    if (change.wall === opening.wall) {
      change = without(change, ['wall'])
    }
    if (Object.keys(change).length === 0) {
      openingChanges.delete(id)
      continue
    }
    openingChanges.set(id, change)
    if (movedWalls.has(opening.wall) || !SHAPE_KEYS.some((key) => change[key] !== undefined)) continue
    const old = freeId(taken, id)
    addOpenings.push({ ...statedOpening(opening), id: old, ...seatBefore(opening), phase: 'demolished' })
    openingChanges.set(id, { ...change, phase: 'new' })
    said.push(`${quoted(id)} is new work; the opening it was is kept as ${quoted(old)}, to be demolished.`)
  }
  // A door or window in a wall moved off its line goes with it: new, its old self kept, to be demolished.
  for (const opening of plan.openings) {
    const old = movedWalls.get(opening.wall)
    if (old === undefined || !existing(read.opening(opening)) || removeOpenings.has(opening.id) || patch.removeOpenings.has(opening.id)) continue
    const copy = freeId(taken, opening.id)
    addOpenings.push({ ...statedOpening(opening), id: copy, wall: old, phase: 'demolished' })
    openingChanges.set(opening.id, { ...(openingChanges.get(opening.id) ?? {}), phase: 'new' })
    said.push(`${quoted(opening.id)} goes with its wall and is new work; the opening it was is kept as ${quoted(copy)}, to be demolished.`)
  }

  // Rooms: one taken out stays, to be demolished; one added is new; one reshaped is new, and the
  // room it was is kept, to be demolished, round the walls as they stood.
  const afterRuns = new Map([...after].map(([id, run]) => [id, runOf(patchEnds(id)!, run)] as const))
  const beforeRuns = new Map([...before].map(([id, run]) => [id, runOf(stretchOf(walls.get(id)!), run)] as const))
  const endsAfter = (id: string): Pair[] => standsAfter(id).flatMap((s) => [s.start, s.end])
  const endsBefore = (id: string): Pair[] => standsBefore(id).flatMap((s) => [s.start, s.end])
  const asAfter = (ring: readonly string[]): string[] => ringWith(ring, afterRuns, endsAfter)
  const asBefore = (ring: readonly string[]): string[] => ringWith(ring, beforeRuns, endsBefore)
  const holesAfter = (holes: readonly (readonly string[])[] | undefined): { holes?: string[][] } => (holes === undefined ? {} : { holes: holes.map(asAfter) })
  const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i])

  const removeRooms = new Set<string>()
  const roomChanges = new Map<string, RoomChange>(patch.rooms)
  const addRooms: RawRecord[] = (patch.addRooms ?? []).map((room) => {
    const boundary = Array.isArray(room['boundary']) ? asAfter(room['boundary'] as string[]) : undefined
    const holes = Array.isArray(room['holes']) ? (room['holes'] as string[][]).map(asAfter) : undefined
    return { ...room, ...(boundary !== undefined ? { boundary } : {}), ...(holes !== undefined ? { holes } : {}), ...(room['phase'] === undefined ? { phase: 'new' } : {}) }
  })
  for (const id of patch.removeRooms ?? []) {
    const room = rooms.get(id)
    if (room === undefined || !existing(read.room(room))) {
      removeRooms.add(id)
      continue
    }
    const boundary = asBefore(room.boundary)
    roomChanges.set(id, { phase: 'demolished', ...(same(boundary, room.boundary) ? {} : { boundary }) })
    kept.push(`room ${quoted(id)}`)
  }
  // The rooms as they will stand, read from the walls and openings as the patch now leaves them.
  const roomsAfter = new Map<string, RoomChange>()
  for (const room of plan.rooms) {
    if (!existing(read.room(room)) || (patch.removeRooms ?? new Set()).has(room.id)) continue
    const change = patch.rooms.get(room.id) ?? {}
    const ring = change.boundary ?? room.boundary
    const boundary = asAfter(ring)
    const holes = holesAfter(room.holes)
    const moved = !same(boundary, room.boundary) || (holes.holes !== undefined && room.holes !== undefined && !holes.holes.every((h, i) => same(h, room.holes![i]!)))
    if (moved) roomsAfter.set(room.id, { ...change, boundary, ...holes })
  }
  const staged: Patch = {
    ...patch,
    walls: wallChanges,
    removeWalls: removedWalls,
    addWalls: [...addWalls, ...extraWalls],
    openings: openingChanges,
    removeOpenings,
    addOpenings,
    rooms: new Map([...roomChanges, ...roomsAfter]),
    removeRooms,
    addRooms,
  }
  const reading = readingAfter(plan, staged)
  const readAfter = phaseReading(reading)
  const wallsAfter = new Map(reading.walls.map((w) => [w.id, w] as const))
  const indexBefore = indexPlan(plan)
  const indexAfter = indexPlan(reading)
  const outlineAfter = new Map(reading.rooms.map((r) => [r.id, r] as const))
  for (const room of plan.rooms) {
    if (!existing(read.room(room)) || (patch.removeRooms ?? new Set()).has(room.id)) continue
    const now = outlineAfter.get(room.id)
    if (now === undefined) continue
    const onNew = [...now.boundary, ...(now.holes ?? []).flat()].some((wallId) => {
      const wall = wallsAfter.get(wallId)
      return wall !== undefined && readAfter.wall(wall) === 'new'
    })
    const reshaped = onNew || !sameOutline(tryRoomPolygon(room, indexBefore), tryRoomPolygon(now, indexAfter))
    const change = roomsAfter.get(room.id) ?? patch.rooms.get(room.id)
    if (!reshaped) {
      if (change !== undefined) roomChanges.set(room.id, change)
      continue
    }
    const old = freeId(taken, room.id)
    addRooms.push({
      ...roomRecord(room),
      id: old,
      boundary: asBefore(room.boundary),
      ...(room.holes === undefined ? {} : { holes: room.holes.map(asBefore) }),
      phase: 'demolished',
    })
    roomChanges.set(room.id, { ...(change ?? {}), phase: 'new' })
    kept.push(`room ${quoted(room.id)} (as ${quoted(old)})`)
    made.push(`room ${quoted(room.id)}`)
  }

  const work = [
    ...(kept.length === 0 ? [] : [`Stood before the work and stays in the plan, to be demolished: ${listed(kept, 8)}.`]),
    ...(made.length === 0 ? [] : [`New work in their place: ${listed(made, 8)}.`]),
  ]
  const notKept = inPlace.length === 0 ? [] : [
    `${listed([...new Set(inPlace)], 4)} stood before the work and ${inPlace.length === 1 ? 'is' : 'are'} changed in place, so the plan no longer holds how ${inPlace.length === 1 ? 'it' : 'they'} stood. To keep both, mark the old one demolished and add the new one with phase new.`,
  ]
  return {
    ...staged,
    rooms: roomChanges,
    addRooms,
    said: [...patch.said, ...said, ...work],
    notKept: [...(patch.notKept ?? []), ...notKept],
  }
}

/**
 * WRT-15: the building before its work with each room an edit kept as it stood (`<id>-before`,
 * `<id>-before-2` and on) under the id of the room that stands in its place after the work, so
 * comparing the two states reads a room reshaped as the same room changed, not one room taken
 * out and another added. A room is read under that id only when no room before the work has it.
 */
export function roomsAsTheyStood<P extends FloorPlan>(before: P, after: FloorPlan): P {
  const was = new Set(before.rooms.map((room) => room.id))
  const now = new Set(after.rooms.map((room) => room.id))
  const named = new Map<string, string>()
  for (const room of before.rooms) {
    const base = /^(.+)-before(?:-\d+)?$/.exec(room.id)?.[1]
    if (base !== undefined && now.has(base) && !was.has(base) && ![...named.values()].includes(base)) named.set(room.id, base)
  }
  if (named.size === 0) return before
  const id = (room: string): string => named.get(room) ?? room
  return { ...before, rooms: before.rooms.map((room) => ({ ...room, id: id(room.id), ...(room.partOf === undefined ? {} : { partOf: id(room.partOf) }) })) }
}

/** An opening as a file would state it: the fields the schema reads, without its phase. */
function statedOpening(opening: Opening): RawRecord {
  const rest: RawRecord = { ...opening }
  delete rest['phase']
  return rest
}
