/**
 * Two rooms knocked into one (WRT-3, lab WR-2): the stretch of the wall between them is taken
 * out, the first room takes in the second, and the doors and windows in the stretch go with it.
 * The merged room keeps the first room's facts of the person's own and its number, and takes the
 * second's facts it does not carry (CNT-9); what the second said otherwise is named, never kept
 * in silence. The pieces of a cut wall each keep the wall's facts.
 *
 * Two rooms of different uses are never made one use in silence (CNT-8, lab AB-9): the call says
 * the merged room's use, or keeps both rooms as zones of one open-plan room (`zones`). Then the
 * stretch becomes a dividing line the two zones list, each keeps its id, name and use, and the
 * merged room is a new room round both.
 *
 * CNT-15 (C24, lab AC-4): nor are two rooms' finishes. Two rooms that name different finishes for
 * one surface are merged only as zones, each keeping its own, so a kitchen's tiled floor stays the
 * kitchen's; the merged room names the finishes the two share. Without zones, a finish only one
 * of them names is the merged room's.
 *
 * The way of doing it comes from the lab's edit prototype (`merge-rooms`): the wall is cut at
 * the centre lines of the walls that meet it where the two rooms stop sharing it, so what is
 * left of it still bounds the rooms beside it; every room that named the wall names the pieces
 * beside it instead, in its own order (C3).
 *
 * Pure: a survey in, a patch out.
 */
import { FINISH_SURFACES, cross, dot, roomFinishes, signedArea, sub, tolerance, wallAxis, wallLength, wallPointAt, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { factOf, statedWall, wallWithEnds, type Flat } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import type { Survey, SurveyRoom } from '../quantities/survey'
import { refuseCurved, type OpeningChange, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'
import { r3 } from './seat'

const TOL = 0.011

/** An id the plan does not use yet, from a base. */
export function freshId(used: ReadonlySet<string>, base: string): string {
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

/** Every id the plan's parts have: walls, rooms, openings, and (WRT-46) items and columns, so a new part never shares one. */
export function usedIds(survey: Survey): Set<string> {
  const plan = survey.plan
  return new Set([...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.items ?? []), ...(plan.columns ?? [])].map((part) => part.id))
}

/** Where a room's outline runs along a wall: its span from the wall's start, and +1 or -1 for the way the outline goes. */
export function spanOn(room: SurveyRoom, wall: Wall): { lo: number; hi: number; sign: number } | null {
  const axis = wallAxis(wall)
  let best: { lo: number; hi: number; sign: number } | null = null
  for (const edge of room.edges) {
    if (edge.wall?.id !== wall.id) continue
    const a = dot(sub(edge.from, axis.start), axis.dir)
    const b = dot(sub(edge.to, axis.start), axis.dir)
    const span = { lo: Math.min(a, b), hi: Math.max(a, b), sign: b >= a ? 1 : -1 }
    if (best === null || span.hi - span.lo > best.hi - best.lo) best = span
  }
  return best
}

/**
 * Where a room's outline passes a curved wall (CNT-22): the middle of its sides on the curve, or
 * the middle of the curve when it has none. A curved wall has no straight axis to measure along.
 */
function curvePassed(room: SurveyRoom, wall: Wall): Vec2 {
  const along = room.edges.filter((edge) => edge.wall?.id === wall.id)
  if (along.length === 0) return wallPointAt(wall, wallLength(wall) / 2)
  const sum = along.reduce((p, edge) => ({ x: p.x + edge.from.x + edge.to.x, y: p.y + edge.from.y + edge.to.y }), { x: 0, y: 0 })
  return { x: sum.x / (2 * along.length), y: sum.y / (2 * along.length) }
}

/** The room's wall list, turned counter-clockwise if it was written the other way. */
export function ccwBoundary(room: SurveyRoom, plan: Survey['plan']): string[] {
  const listed = plan.rooms.find((r) => r.id === room.facts.id)!.boundary
  const points: Vec2[] = []
  for (const id of listed) {
    const wall = plan.walls.find((w) => w.id === id)
    if (!wall) continue
    if (wall.arc !== undefined) {
      points.push(curvePassed(room, wall))
      continue
    }
    const axis = wallAxis(wall)
    const span = spanOn(room, wall)
    const s = span ? (span.lo + span.hi) / 2 : axis.length / 2
    points.push({ x: axis.start.x + axis.dir.x * s, y: axis.start.y + axis.dir.y * s })
  }
  return signedArea(points) < 0 ? [...listed].reverse() : [...listed]
}

interface Piece {
  readonly lo: number
  readonly hi: number
  readonly id: string
}

/** The pieces of a cut wall beside a room's side on it, in the order its outline meets them. */
export function piecesBeside(room: SurveyRoom, wall: Wall, pieces: readonly Piece[]): string[] {
  const span = spanOn(room, wall)
  if (!span) return []
  const own = pieces.filter((p) => Math.min(p.hi, span.hi) - Math.max(p.lo, span.lo) > 0.05).sort((a, b) => a.lo - b.lo)
  if (span.sign < 0) own.reverse()
  return own.map((p) => p.id)
}

/** The wall cut into pieces, as a patch's walls to add, change or take out. */
export function cutWall(wall: Wall, pieces: readonly Piece[]): { change?: { start: [number, number]; end: [number, number] }; add: Record<string, unknown>[]; remove: boolean } {
  const axis = wallAxis(wall)
  const at = (s: number): [number, number] => [r3(axis.start.x + axis.dir.x * s), r3(axis.start.y + axis.dir.y * s)]
  if (pieces.length === 1 && pieces[0]!.id === wall.id) return { change: { start: at(pieces[0]!.lo), end: at(pieces[0]!.hi) }, add: [], remove: false }
  // As its file states it: a value the reading filled in is not written into the pieces (WRT-6),
  // and a wall placed by its face gives each piece that face, on the face's line (HND-11).
  const stated = statedWall(wall) as Record<string, unknown>
  const rest: Record<string, unknown> = { ...stated }
  for (const key of ['id', 'start', 'end']) delete rest[key]
  const piece = (p: Piece): Record<string, unknown> => {
    const placed = wallWithEnds(stated, { start: at(p.lo), end: at(p.hi) })
    return { id: p.id, start: placed['start'], end: placed['end'], ...rest }
  }
  return { add: pieces.map(piece), remove: true }
}

/** Where along a wall the walls crossing it near `s` have their centre line, or `s` when none does. */
export function cutAt(plan: Survey['plan'], wall: Wall, s: number): number {
  const axis = wallAxis(wall)
  let near: number | null = null
  for (const other of plan.walls) {
    if (other.id === wall.id || (other.floor ?? 'ground') !== (wall.floor ?? 'ground')) continue
    if (other.arc !== undefined) {
      // CNT-22: a curved wall meets the cut wall at an end of its curve, or not at all.
      for (const end of [other.start, other.end]) {
        const p = { x: end[0], y: end[1] }
        const t = dot(sub(p, axis.start), axis.dir)
        const off = Math.abs(cross(axis.dir, sub(p, axis.start)))
        if (off <= other.thickness / 2 + TOL && Math.abs(t - s) <= other.thickness / 2 + TOL && (near === null || Math.abs(t - s) < Math.abs(near - s))) near = t
      }
      continue
    }
    const x = wallAxis(other)
    const denom = cross(axis.dir, x.dir)
    if (Math.abs(denom) < tolerance('parallel')) continue
    const t = cross(sub(x.start, axis.start), x.dir) / denom
    const u = cross(sub(x.start, axis.start), axis.dir) / denom
    if (Math.abs(t - s) <= other.thickness / 2 + TOL && u >= -TOL && u <= x.length + TOL) {
      if (near === null || Math.abs(t - s) < Math.abs(near - s)) near = t
    }
  }
  return near ?? s
}

export interface MergeRequest {
  readonly name?: string
  readonly use?: string
  /** CNT-8: keep both rooms as zones of the merged room, which is a new room. */
  readonly zones?: boolean
  /** With `zones`: the merged room's id. Made from the two rooms' when left out. */
  readonly id?: string
  /** WRT-33: the merged room's type, the value of the type fact its rooms carry (named `type` when they carry none). */
  readonly type?: string
}

/** WRT-33: a room's type fact, the first of its facts whose name ends in "type", in any capitals. */
function typeFactOf(room: { readonly properties?: Readonly<Record<string, unknown>> | undefined }): { key: string; value: string } | null {
  for (const [key, value] of Object.entries(room.properties ?? {})) if (/type$/i.test(key)) return { key, value: String(value) }
  return null
}

/**
 * WRT-28 (C18): the plan's flats after a merge. A flat never lists a room that is gone, and a room
 * is in one flat at most. The merged room takes the place the first room had in its flat, or the
 * second's when only that one was in a flat; the second room's own flat gives it up, and is taken
 * out when no room is left in it. Returns null when no flat names either room.
 */
export function flatsAfterMerge(
  flats: readonly Flat[] | undefined,
  aId: string,
  bId: string,
  merged: string,
  names: { readonly a: string; readonly b: string; readonly merged: string },
): { flats: Flat[]; said: string[]; notKept: string[] } | null {
  if (flats === undefined || !flats.some((f) => f.rooms.includes(aId) || f.rooms.includes(bId))) return null
  const said: string[] = []
  const notKept: string[] = []
  const owner = flats.find((f) => f.rooms.includes(aId)) ?? flats.find((f) => f.rooms.includes(bId))!
  const label = (f: Flat): string => quoted(f.name ?? f.id)
  const next: Flat[] = []
  for (const flat of flats) {
    if (!flat.rooms.includes(aId) && !flat.rooms.includes(bId)) {
      next.push(flat)
      continue
    }
    const rooms: string[] = []
    for (const id of flat.rooms) {
      const gone = id === aId || id === bId
      const put = gone ? (flat === owner ? merged : null) : id
      if (put !== null && !rooms.includes(put)) rooms.push(put)
    }
    if (rooms.length === 0) {
      said.push(`Flat ${label(flat)} is taken out: ${names.b} was its only room.`)
      continue
    }
    if (flat !== owner) notKept.push(`Flat ${label(flat)} no longer lists ${names.b}: ${names.merged} is in flat ${label(owner)}, and a room is in one flat only.`)
    next.push({ ...flat, rooms })
  }
  if (owner.rooms.includes(bId) && !owner.rooms.includes(aId)) said.push(`Flat ${label(owner)} lists ${names.merged} in place of ${names.b}.`)
  else if (notKept.length === 0 && said.length === 0) said.push(`Flat ${label(owner)} no longer lists ${names.b}.`)
  return { flats: next, said, notKept }
}

export function mergeRooms(survey: Survey, aId: string, bId: string, request: MergeRequest): Patch {
  const plan = survey.plan
  if (aId === bId) throw new EditRefused('Name two different rooms to merge.')
  const A = survey.byId.get(aId)!
  const B = survey.byId.get(bId)!
  const aRoom = plan.rooms.find((r) => r.id === aId)!
  const bRoom = plan.rooms.find((r) => r.id === bId)!
  const an = quoted(A.facts.name)
  const bn = quoted(B.facts.name)
  if ((aRoom.floor ?? 'ground') !== (bRoom.floor ?? 'ground')) throw new EditRefused(`${an} and ${bn} are on different floors.`)
  if (A.polygon.length < 3 || B.polygon.length < 3) throw new EditRefused(`${A.polygon.length < 3 ? an : bn} has no outline Grid can measure; grid_check says why.`)
  if ((bRoom.holes?.length ?? 0) > 0 || (aRoom.holes?.length ?? 0) > 0) throw new EditRefused('A room with a hole is not merged by this tool; write the plan again with grid_write_rooms.')
  // CNT-8: a zone is part of a room; the room is what is merged.
  for (const [room, name] of [[aRoom, an], [bRoom, bn]] as const) {
    if (room.partOf !== undefined) throw new EditRefused(`${name} is a zone of room ${quoted(room.partOf)}; merge rooms, not their zones.`)
  }
  const zonesOf = (id: string): string[] => plan.rooms.filter((r) => r.partOf === id).map((r) => r.id)
  if (request.zones === true && zonesOf(aId).length + zonesOf(bId).length > 0) {
    const which = zonesOf(aId).length > 0 ? an : bn
    throw new EditRefused(`${which} has zones already, and a zone is part of a room, not of a zone. Merge without zones, and say the merged room's use.`)
  }
  // CNT-22: only the wall the two share is cut; a curved wall round either room stays as it is.
  refuseCurved(aRoom.boundary.filter((id) => bRoom.boundary.includes(id)).map((id) => plan.walls.find((w) => w.id === id)), 'mergeRooms')

  const shared: Array<{ wall: Wall; s0: number; s1: number }> = []
  for (const id of new Set(aRoom.boundary.filter((w) => bRoom.boundary.includes(w)))) {
    const wall = plan.walls.find((w) => w.id === id)
    if (!wall) continue
    const ea = spanOn(A, wall)
    const eb = spanOn(B, wall)
    // The two outlines run along the wall the opposite way: one room on each face.
    if (!ea || !eb || ea.sign === eb.sign) continue
    const s0 = Math.max(ea.lo, eb.lo)
    const s1 = Math.min(ea.hi, eb.hi)
    if (s1 - s0 > 0.05) shared.push({ wall, s0, s1 })
  }
  if (shared.length === 0) {
    const beside = plan.rooms.filter((r) => r.id !== aId && r.boundary.some((w) => aRoom.boundary.includes(w))).map((r) => quoted(r.name))
    throw new EditRefused(`${an} and ${bn} do not share a wall, so there is nothing to take out. Rooms that share a wall with ${an}: ${beside.join(', ') || 'none'}.`)
  }
  // Only once the two can be merged: then what the merged room is for.
  if (request.zones !== true && request.use === undefined && aRoom.use !== undefined && bRoom.use !== undefined && aRoom.use !== bRoom.use) {
    // Asked, never chosen: one of the two uses would leave the plan (lab AB-9).
    throw new EditRefused(
      `${an} is used as ${aRoom.use} and ${bn} as ${bRoom.use}, and one room has one use. Say the merged room's use with use (${aRoom.use}, ${bRoom.use} or another), or keep both uses with zones: true, as zones of one open-plan room.`
    )
  }
  if (request.zones !== true && request.id !== undefined) throw new EditRefused('new_room names the merged room made with zones: true; without zones the merged room keeps the id of the first.')
  // CNT-15 (lab AC-4): a finish is never changed in silence by a knock-through.
  const aFinish = roomFinishes(aRoom)
  const bFinish = roomFinishes(bRoom)
  const clash = FINISH_SURFACES.filter((surface) => aFinish[surface] !== null && bFinish[surface] !== null && aFinish[surface] !== bFinish[surface])
  if (request.zones !== true && clash.length > 0) {
    const surface = clash[0]!
    throw new EditRefused(
      `${an} has a ${surface} finish of ${quoted(aFinish[surface]!)} and ${bn} of ${quoted(bFinish[surface]!)}, and one room has one ${surface} finish. Keep both with zones: true, as zones of one open-plan room that each keep their own finishes, or give one of them the other's finish first (grid_rename_room).`
    )
  }
  const used = usedIds(survey)
  // One cut for every wall the two share (WRT-50): its pieces, and with zones its dividing line.
  interface Cut {
    wall: Wall
    s0: number
    s1: number
    c0: number
    c1: number
    axis: ReturnType<typeof wallAxis>
    pieces: Piece[]
    line: Piece | null
  }
  const cuts: Cut[] = shared.map(({ wall, s0, s1 }) => {
    const axis = wallAxis(wall)
    const c0 = cutAt(plan, wall, s0)
    const c1 = cutAt(plan, wall, s1)
    const kept: Piece[] = []
    if (c0 > 0.05) kept.push({ lo: 0, hi: c0, id: '' })
    if (axis.length - c1 > 0.05) kept.push({ lo: c1, hi: axis.length, id: '' })
    const pieces: Piece[] = kept.length === 1 ? [{ ...kept[0]!, id: wall.id }] : kept.map((p, i) => {
      const id = freshId(used, `${wall.id}-${'ab'[i]}`)
      used.add(id)
      return { ...p, id }
    })
    return { wall, s0, s1, c0, c1, axis, pieces, line: null }
  })
  // CNT-8: with zones, each stretch taken out stays as a dividing line between the two zones.
  if (request.zones === true) {
    for (const cut of cuts) {
      cut.line = { lo: cut.c0, hi: cut.c1, id: freshId(used, `${cut.wall.id}-line`) }
      used.add(cut.line.id)
    }
  }
  const zoned = request.zones === true
  const cutOf = new Map(cuts.map((cut) => [cut.wall.id, cut]))

  // The merged room's walls, counter-clockwise (WRT-50): each room's list, with a marker where it
  // met a shared wall; walk A, cross to B at a marker, and back to A at the next.
  const marker = (id: string): string => `\u0000${id}`
  const tokens = (room: SurveyRoom): string[] =>
    ccwBoundary(room, plan).flatMap((id) => {
      const cut = cutOf.get(id)
      if (cut === undefined) return [id]
      const span = spanOn(room, cut.wall)!
      const own = piecesBeside(room, cut.wall, cut.pieces)
      const mid = (cut.s0 + cut.s1) / 2
      const centre = (pid: string): number => {
        const p = cut.pieces.find((x) => x.id === pid)!
        return (p.lo + p.hi) / 2
      }
      return [...own.filter((pid) => (centre(pid) < mid) === (span.sign > 0)), marker(id), ...own.filter((pid) => (centre(pid) < mid) !== (span.sign > 0))]
    })
  const sides = [tokens(A), tokens(B)]
  const joined: string[] = []
  const start = sides[0]!.findIndex((t) => !t.startsWith('\u0000'))
  if (start >= 0) {
    let side = 0
    let at = start
    for (let guard = 0; guard <= (sides[0]!.length + sides[1]!.length) * 2; guard++) {
      const token = sides[side]![at]!
      if (token.startsWith('\u0000')) {
        side = 1 - side
        at = sides[side]!.indexOf(token)
      } else if (joined[joined.length - 1] !== token) joined.push(token)
      at = (at + 1) % sides[side]!.length
      if (side === 0 && at === start) break
    }
  }
  // Every wall of either room that is not a shared stretch is on the merged outline; one the walk
  // did not reach is on another loop: the rooms meet so that the merged room has a hole or two parts.
  const walked = new Set(joined)
  if (start < 0 || sides.some((side) => side.some((t) => !t.startsWith('\u0000') && !walked.has(t)))) {
    throw new EditRefused(`${an} and ${bn} meet at ${cuts.length} walls (${cuts.map((c) => quoted(c.wall.id)).join(', ')}) in a way that would leave the merged room as more than one outline, or with a hole, so Grid does not take them out. Merge them one wall at a time with grid_write_rooms.`)
  }
  while (joined.length > 1 && joined[0] === joined[joined.length - 1]) joined.pop()
  const line = zoned ? cuts[0]!.line : null
  const lineIds = cuts.flatMap((cut) => (cut.line === null ? [] : [cut.line.id]))
  /** A room's wall list with every cut wall in it replaced by the pieces beside the room. */
  const through = (room: SurveyRoom, listed: readonly string[]): string[] =>
    listed.flatMap((id) => {
      const cut = cutOf.get(id)
      return cut === undefined ? [id] : piecesBeside(room, cut.wall, cut.line === null ? cut.pieces : [...cut.pieces, cut.line])
    })

  const said: string[] = []
  const guessed: string[] = []
  const rooms = new Map<string, RoomChange>()
  const addRooms: Record<string, unknown>[] = []
  const merged = !zoned ? aId : request.id ?? freshId(used, `${aId}-${bId}`)
  const mergedName = request.name ?? (!zoned ? A.facts.name : `${A.facts.name} and ${B.facts.name}`)
  // CNT-9: the merged room keeps the facts of the first room, and takes the second's it does not
  // carry, with zones or without. With zones the two rooms keep their own facts as zones as well.
  const notKept: string[] = []
  const aFacts = aRoom.properties ?? {}
  const bFacts = bRoom.properties ?? {}
  const taken = Object.entries(bFacts).filter(([fact]) => factOf(aRoom, fact) === undefined)
  const differ = Object.entries(bFacts).filter(([fact, value]) => factOf(aRoom, fact) !== undefined && factOf(aRoom, fact) !== value)
  const typeFact = typeFactOf(aRoom) ?? typeFactOf(bRoom)
  let mergedFacts: Record<string, string | number | boolean> | null = taken.length > 0 ? { ...aFacts, ...Object.fromEntries(taken) } : null
  // WRT-33: the type the person gives the merged room.
  if (request.type !== undefined) mergedFacts = { ...(mergedFacts ?? aFacts), [typeFact?.key ?? 'type']: request.type }
  if (taken.length > 0) said.push(`${request.name !== undefined || line !== null ? quoted(mergedName) : an} takes the facts of ${bn} it did not carry: ${taken.map(([fact]) => quoted(fact)).join(', ')}.`)
  if (differ.length > 0) notKept.push(`${bn} said otherwise of ${differ.map(([fact, value]) => `${quoted(fact)} (${quoted(String(factOf(aRoom, fact)))} kept, ${quoted(String(value))} not)`).join(', ')}; the merged room keeps what ${an} says${line === null ? '' : `, and ${bn} keeps its own as a zone`}.`)
  if (line === null) {
    const change: RoomChange = { boundary: joined }
    if (request.name !== undefined) change.name = request.name
    if (request.use !== undefined) change.use = request.use
    // One of the two states no use: the merged room takes the other's, so no use is lost.
    else if (aRoom.use === undefined && bRoom.use !== undefined) change.use = bRoom.use
    if (mergedFacts !== null) change.properties = mergedFacts
    // CNT-15: a finish only the second room names is the merged room's, so no finish is lost.
    const taken = FINISH_SURFACES.filter((surface) => aFinish[surface] === null && bFinish[surface] !== null)
    if (taken.length > 0) {
      change.finishes = Object.fromEntries(FINISH_SURFACES.flatMap((surface) => { const finish = aFinish[surface] ?? bFinish[surface]; return finish === null ? [] : [[surface, finish]] }))
      said.push(`${request.name !== undefined ? quoted(request.name) : an} takes the ${taken.join(' and ')} finish${taken.length === 1 ? '' : 'es'} of ${bn}.`)
    }
    rooms.set(aId, change)
    if (request.name === undefined) guessed.push(`The merged room keeps the id, name and use of ${an} (${change.use ?? aRoom.use ?? 'no use'}); pass name or use to change them.`)
    if (bRoom.number !== undefined) notKept.push(`The room number of ${bn}, ${quoted(bRoom.number)}, is gone with it${aRoom.number !== undefined ? `; the merged room keeps ${quoted(aRoom.number)}` : ''}.`)
    // A zone of the room that is gone is a zone of the merged room now.
    for (const zone of zonesOf(bId)) rooms.set(zone, { partOf: aId })
  } else {
    if (used.has(merged) && request.id !== undefined) throw new EditRefused(`The plan already has a part with id ${quoted(merged)}; pass another new_room.`)
    used.add(merged)
    // Each room becomes a zone of the merged room, bounded by its own walls and the new line. It
    // keeps its facts and any number it states (CNT-9), though a zone is numbered by its room.
    rooms.set(aId, { boundary: through(A, aRoom.boundary), partOf: merged })
    rooms.set(bId, { boundary: through(B, bRoom.boundary), partOf: merged })
    // The merged room gets what a merged room gets without zones: the first room's number and facts.
    const facts = mergedFacts ?? (Object.keys(aFacts).length > 0 ? aFacts : null)
    // CNT-15: the merged room names the finishes its two zones share; each zone keeps its own.
    const shared = Object.fromEntries(FINISH_SURFACES.flatMap((surface) => (aFinish[surface] !== null && aFinish[surface] === bFinish[surface] ? [[surface, aFinish[surface]!]] : [])))
    if (FINISH_SURFACES.some((surface) => aFinish[surface] !== null || bFinish[surface] !== null)) said.push(`${an} and ${bn} keep their own finishes as zones${Object.keys(shared).length === 0 ? '' : `; ${quoted(mergedName)} names the ones they share`}.`)
    addRooms.push({
      id: merged,
      name: mergedName,
      boundary: joined,
      ...(request.use === undefined ? {} : { use: request.use }),
      ...(aRoom.floor === undefined ? {} : { floor: aRoom.floor }),
      ...(aRoom.number === undefined ? {} : { number: aRoom.number }),
      ...(facts === null ? {} : { properties: { ...facts } }),
      ...(Object.keys(shared).length === 0 ? {} : { finishes: shared }),
    })
    if (aRoom.number !== undefined) said.push(`${quoted(mergedName)} takes the room number of ${an}, ${quoted(aRoom.number)}.`)
    if (bRoom.number !== undefined) {
      notKept.push(`The room number of ${bn}, ${quoted(bRoom.number)}, stays on it as a zone but is not shown: a zone is numbered by its room${aRoom.number !== undefined ? `, and the merged room keeps ${quoted(aRoom.number)}` : ''}.`)
    }
    if (request.name === undefined) guessed.push(`The merged room is called ${quoted(mergedName)}; pass name to call it something else.`)
    if (request.id === undefined) guessed.push(`The merged room's id is ${quoted(merged)}; pass new_room for another.`)
  }
  // Other rooms that named the wall now name the pieces beside them.
  for (const room of survey.rooms) {
    const id = room.facts.id
    if (id === aId || id === bId) continue
    const listed = plan.rooms.find((r) => r.id === id)!.boundary
    if (!listed.some((w) => cutOf.has(w))) continue
    const now = listed.flatMap((w) => {
      const cut = cutOf.get(w)
      return cut === undefined ? [w] : piecesBeside(room, cut.wall, cut.pieces)
    })
    if (now.length === listed.length && now.every((w, i) => w === listed[i])) continue
    rooms.set(id, { boundary: now })
  }

  // Openings in the wall: those in a kept piece stay where they are; those in the stretch go.
  const openings = new Map<string, OpeningChange>()
  const removeOpenings = new Set<string>()
  for (const o of plan.openings) {
    // With zones the second room is kept, as a zone, and an anchor on its face still holds.
    if (o.anchor?.room === bId && line === null) openings.set(o.id, { anchor: { ...o.anchor, room: aId } })
    const cut = cutOf.get(o.wall)
    if (cut === undefined) continue
    const { wall, pieces } = cut
    const home = pieces.find((p) => p.lo - tolerance('joint') <= o.offset && o.offset + o.width <= p.hi + tolerance('joint'))
    if (!home) {
      removeOpenings.add(o.id)
      said.push(`Removed ${o.type} ${quoted(o.id)}: it was in the wall taken out.`)
      continue
    }
    if (home.id !== wall.id || home.lo > 0) openings.set(o.id, { ...(openings.get(o.id) ?? {}), wall: home.id, offset: r3(o.offset - home.lo) })
  }

  // WRT-33: two doors on one wall of the merged room, as two units' doors on one corridor, are
  // offered, never taken out: which one goes is the person's.
  const roomWalls = new Set(joined)
  const doorsOn = new Map<string, string[]>()
  for (const o of plan.openings) {
    if (o.type !== 'door' || removeOpenings.has(o.id)) continue
    const on = openings.get(o.id)?.wall ?? o.wall
    if (!roomWalls.has(on)) continue
    doorsOn.set(on, [...(doorsOn.get(on) ?? []), o.id])
  }
  for (const [on, ids] of doorsOn) {
    if (ids.length < 2) continue
    said.push(`The merged room has ${ids.length} doors on wall ${quoted(on)}: ${ids.map((id) => quoted(id)).join(', ')}. One may be enough; to take one out, call grid_change_opening with opening set to its id and remove true.`)
  }

  const cutPatches = cuts.map((c) => cutWall(c.wall, c.pieces))
  const strip = cuts.reduce((sum, c) => sum + (c.wall.virtual === true ? 0 : (c.s1 - c.s0) * c.wall.thickness), 0)
  const sizes = `the ${(A.facts.shape?.area ?? 0).toFixed(2)} m² of ${an} and the ${(B.facts.shape?.area ?? 0).toFixed(2)} m² of ${bn}${strip > 0 ? `, with ${strip.toFixed(2)} m² under the wall taken out` : ''}`
  // WRT-33: a type the merged room keeps no longer says what it is, whichever room it came from.
  if (typeFact !== null && request.type === undefined) {
    const area = (A.facts.shape?.area ?? 0) + (B.facts.shape?.area ?? 0) + strip
    guessed.push(`The merged room keeps the ${quoted(typeFact.key)} ${quoted(typeFact.value)} of ${typeFactOf(aRoom) !== null ? an : bn}, and is now ${area.toFixed(2)} m², so that type may no longer fit; pass type to give it its own.`)
  }
  const wordForUse = (use: string | undefined): string => (use === undefined ? 'no use' : use)
  const took = cuts.map((c) =>
    c.pieces.length === 0
      ? `Took out wall ${quoted(c.wall.id)} (${c.axis.length.toFixed(2)} m) between ${an} and ${bn}.`
      : `Took ${(c.c1 - c.c0).toFixed(2)} m out of wall ${quoted(c.wall.id)} between ${an} and ${bn}; what is left: ${c.pieces.map((p) => `${quoted(p.id)} (${(p.hi - p.lo).toFixed(2)} m)`).join(', ')}.`,
  )
  said.unshift(
    ...took,
    line === null
      ? `${request.name !== undefined ? quoted(request.name) : an} is ${sizes}; ${bn} is gone.`
      : `${quoted(request.name ?? `${A.facts.name} and ${B.facts.name}`)} (${quoted(merged)}) is one room of ${sizes}. ${an} (${wordForUse(aRoom.use)}) and ${bn} (${wordForUse(bRoom.use)}) are kept as its zones, with their ids, names and uses, on either side of the dividing ${lineIds.length === 1 ? 'line' : 'lines'} ${lineIds.map((id) => quoted(id)).join(', ')}.`,
  )
  // A dividing line, written as the format fills one in: no thickness, no height (`WALL_DEFAULTS`).
  const lineWall = cuts.flatMap((c) => {
    if (c.line === null) return []
    const at = (t: number): [number, number] => [r3(c.axis.start.x + c.axis.dir.x * t), r3(c.axis.start.y + c.axis.dir.y * t)]
    return [{ id: c.line.id, start: at(c.line.lo), end: at(c.line.hi), thickness: 0, height: 0, kind: 'interior', virtual: true, ...(c.wall.floor === undefined ? {} : { floor: c.wall.floor }) }]
  })
  // WRT-28: the flats name the merged room, never one that is gone.
  const flatsNow = flatsAfterMerge(plan.flats, aId, bId, merged, { a: an, b: bn, merged: line === null ? an : quoted(mergedName) })
  if (flatsNow !== null) {
    said.push(...flatsNow.said)
    notKept.push(...flatsNow.notKept)
  }
  return {
    ...(flatsNow === null ? {} : { plan: { flats: flatsNow.flats } }),
    walls: new Map(cuts.flatMap((c, i) => (cutPatches[i]!.change ? [[c.wall.id, cutPatches[i]!.change!] as const] : []))),
    openings,
    removeOpenings,
    rooms,
    said,
    guessed,
    removeWalls: new Set(cuts.flatMap((c, i) => (cutPatches[i]!.remove ? [c.wall.id] : []))),
    addWalls: [...cutPatches.flatMap((c) => c.add), ...lineWall],
    removeRooms: line === null ? new Set([bId]) : new Set(),
    ...(addRooms.length === 0 ? {} : { addRooms }),
    // A door that joined either room joins the merged room now: the same space, not a change.
    roomsBecome: line === null ? new Map([[bId, aId]]) : new Map([[aId, merged], [bId, merged]]),
    notKept,
  }
}
