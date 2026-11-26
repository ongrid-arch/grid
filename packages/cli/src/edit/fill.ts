/**
 * CNT-44: a room, or a zone of an open-plan room, filled with one library entry at a pitch: "how
 * many desks fit in the hot-desk zone", "set out the café with tables for four". One call lays a
 * lattice of modules over the room's inside outline and keeps every spot whose module lies inside
 * it, clear of the walls by the person's figure, of the floor kept in front of each door, of the
 * columns and of the items already there; Grid's own fit checks then take out any module they
 * name. The modules are written as one group, `<group>-<n>`, so `replace` fills the room again.
 *
 * A module is a library item (with the clear floor it keeps in front) or a typical set (a table
 * and its chairs), set out as `grid_place_item` places it (`placeFromLibrary`). Pure: a survey and
 * a library in, a patch out.
 */
import {
  area,
  columnFootprint,
  columnsOnFloor,
  convexPenetration,
  floorOf,
  itemClearanceZone,
  itemFootprint,
  rectInsidePolygon,
  tolerance,
  validatePlan,
  wallFrameAt,
  withPatterns,
  type FloorPlan,
  type Vec2,
} from '@ongrid/floorplan/geometry'
import { liesUnderfoot } from '@ongrid/floorplan/geometry/itemKinds'
import { LibraryRefused, libraryFootprint, libraryNames, placeFromLibrary, type Library, type Pair } from '@ongrid/floorplan/library'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { roomCalled } from '../quantities/survey'
import { emptyPatch, readingAfter, type Patch } from './edits'
import { idHolder } from './holder'
import { EditRefused } from './refused'

/** Grid's own figures for what a fill leaves out, said as Grid's whenever one is used. */
export const FILL_AISLE = 0.9
export const FILL_DOOR_CLEARANCE = 1.2
/** The most modules one fill places. */
export const FILL_MOST = 1000

/** The checks on an item that take a filled module out: the ones `grid_place_item` answers with. */
const FIT_CODES = new Set(['item/outside-rooms', 'item/into-wall', 'item/leaves-room', 'item/overlap', 'item/clearance-blocked', 'item/too-tall', 'item/blocks-doorway', 'item/blocks-window', 'opening/door-hits-item'])

export interface FillRequest {
  readonly room: string
  readonly name: string
  readonly pitch?: number
  readonly aisle?: number
  readonly backToBack?: boolean
  readonly turn?: number
  readonly wallClearance?: number
  readonly doorClearance?: number
  readonly count?: number
  readonly group?: string
  readonly label?: string
  readonly replace?: boolean
}

/** What gave up a spot of the lattice. */
type Lost = 'door' | 'column' | 'item' | 'shape' | 'checks'

interface Obstacle {
  readonly what: Exclude<Lost, 'shape' | 'checks'>
  readonly id: string
  readonly outline: readonly Vec2[]
  readonly box: Box
}

interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** A module kept: its middle in the lattice's frame and whether it is turned round (the near row of a back-to-back pair). */
interface Spot {
  readonly u: number
  readonly v: number
  readonly round: boolean
  readonly row: number
}

interface Arrangement {
  readonly turn: number
  readonly spots: readonly Spot[]
  readonly lost: Readonly<Record<Lost, number>>
  /** The room's extent in the lattice's frame, less the walls' clearance. */
  readonly roomAlong: number
  readonly roomAcross: number
}

const EPS = 1e-9
const n2 = (value: number): string => value.toFixed(2)
/** Degrees as few figures as they need: 90, 22.5. */
const degrees = (value: number): string => String(Math.round(value * 100) / 100)
const deg = (value: number): number => Math.round((((value % 360) + 360) % 360) * 1e6) / 1e6
const boxOf = (points: readonly Vec2[]): Box => ({
  x0: Math.min(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)),
  y1: Math.max(...points.map((p) => p.y)),
})
const meet = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** Turns a point by `turn` degrees counter-clockwise about the origin. */
function turned(p: Vec2, turn: number): Vec2 {
  const r = (turn * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** The floor kept clear in front of each door and doorless opening on the floor, out from both faces of its wall. */
function doorZones(plan: FloorPlan, floor: string, clear: number): Obstacle[] {
  const walls = new Map(plan.walls.map((wall) => [wall.id, wall]))
  const out: Obstacle[] = []
  for (const opening of withPatterns(plan).openings) {
    if (opening.type === 'window') continue
    const wall = walls.get(opening.wall)
    if (wall === undefined || floorOf(wall) !== floor) continue
    try {
      const a = wallFrameAt(wall, opening.offset)
      const b = wallFrameAt(wall, opening.offset + opening.width)
      const reach = (wall.virtual === true ? 0 : wall.thickness / 2) + clear
      const at = (p: Vec2, n: Vec2, k: number): Vec2 => ({ x: p.x + n.x * k, y: p.y + n.y * k })
      const outline = [at(a.point, a.normal, -reach), at(b.point, b.normal, -reach), at(b.point, b.normal, reach), at(a.point, a.normal, reach)]
      out.push({ what: 'door', id: opening.id, outline, box: boxOf(outline) })
    } catch {
      // A wall that cannot be worked out is named by its own checks.
    }
  }
  return out
}

/** The columns and the items already on the floor, each item with the floor it keeps clear in front. */
function standing(plan: FloorPlan, floor: string, leaving: ReadonlySet<string>): Obstacle[] {
  const out: Obstacle[] = []
  for (const column of columnsOnFloor(plan, floor)) {
    try {
      const outline = columnFootprint(column)
      if (outline.length >= 3) out.push({ what: 'column', id: column.id, outline, box: boxOf(outline) })
    } catch {
      // A column Grid cannot draw is named by its own checks.
    }
  }
  for (const item of plan.items ?? []) {
    if (floorOf(item) !== floor || leaving.has(item.id) || liesUnderfoot(item.kind)) continue
    for (const outline of [itemFootprint(item), itemClearanceZone(item)]) {
      if (outline.length >= 3) out.push({ what: 'item', id: item.id, outline, box: boxOf(outline) })
    }
  }
  return out
}

interface Lattice {
  readonly width: number
  readonly depth: number
  readonly pitch: number
  readonly aisle: number
  readonly backToBack: boolean
  readonly wall: number
}

/**
 * The modules a lattice turned by `turn` keeps in the room, with its slack set at `share` of the
 * way along and across (0 the near edge, 1 the far). Spots run row by row from the near side.
 */
function arrange(polygon: readonly Vec2[], holes: readonly (readonly Vec2[])[], obstacles: readonly Obstacle[], l: Lattice, turn: number, along: number, across: number): Arrangement {
  const local = polygon.map((p) => turned(p, -turn))
  const localHoles = holes.map((hole) => hole.map((p) => turned(p, -turn)))
  const box = boxOf(local)
  const rowDepth = l.backToBack ? 2 * l.depth : l.depth
  const rowPitch = rowDepth + l.aisle
  const roomAlong = box.x1 - box.x0 - 2 * l.wall
  const roomAcross = box.y1 - box.y0 - 2 * l.wall
  const columns = roomAlong + EPS < l.width ? 0 : Math.floor((roomAlong - l.width) / l.pitch + EPS) + 1
  const rows = roomAcross + EPS < rowDepth ? 0 : Math.floor((roomAcross - rowDepth) / rowPitch + EPS) + 1
  const spareAlong = columns === 0 ? 0 : roomAlong - (l.width + (columns - 1) * l.pitch)
  const spareAcross = rows === 0 ? 0 : roomAcross - (rowDepth + (rows - 1) * rowPitch)
  const u0 = box.x0 + l.wall + along * spareAlong + l.width / 2
  const v0 = box.y0 + l.wall + across * spareAcross
  const lost: Record<Lost, number> = { door: 0, column: 0, item: 0, shape: 0, checks: 0 }
  const spots: Spot[] = []
  // One row and one module past the count, for a half pair or a room wider at one end.
  for (let row = 0; row <= rows; row++) {
    const back = v0 + row * rowPitch
    const modules = l.backToBack ? [{ low: back, round: true }, { low: back + l.depth, round: false }] : [{ low: back, round: false }]
    for (let column = 0; column <= columns; column++) {
      const u = u0 + column * l.pitch
      for (const { low, round } of modules) {
        const rect = { minX: u - l.width / 2, minY: low, maxX: u + l.width / 2, maxY: low + l.depth }
        const counted = row < rows && column < columns
        const grown = { minX: rect.minX - l.wall, minY: rect.minY - l.wall, maxX: rect.maxX + l.wall, maxY: rect.maxY + l.wall }
        if (!rectInsidePolygon(grown, local, localHoles)) {
          if (counted) lost.shape++
          continue
        }
        const corners = [
          { x: rect.minX, y: rect.minY },
          { x: rect.maxX, y: rect.minY },
          { x: rect.maxX, y: rect.maxY },
          { x: rect.minX, y: rect.maxY },
        ].map((p) => turned(p, turn))
        const own = boxOf(corners)
        const hit = obstacles.find((o) => meet(own, o.box) && convexPenetration(corners, o.outline) > tolerance('itemOverlap'))
        if (hit !== undefined) {
          lost[hit.what]++
          continue
        }
        spots.push({ u, v: low + l.depth / 2, round, row })
      }
    }
  }
  return { turn, spots, lost, roomAlong, roomAcross }
}

/**
 * What is left over past the modules kept, along the rows and across them: the room's extent in
 * the lattice's frame, less the walls' clearance, less what the modules span.
 */
function leftOver(arrangement: Arrangement, spots: readonly Spot[], l: Lattice): { alongRows: number; acrossRows: number } {
  if (spots.length === 0) return { alongRows: Math.max(0, arrangement.roomAlong), acrossRows: Math.max(0, arrangement.roomAcross) }
  const usedAlong = Math.max(...spots.map((s) => s.u)) - Math.min(...spots.map((s) => s.u)) + l.width
  const usedAcross = Math.max(...spots.map((s) => s.v)) - Math.min(...spots.map((s) => s.v)) + l.depth
  return { alongRows: Math.max(0, arrangement.roomAlong - usedAlong), acrossRows: Math.max(0, arrangement.roomAcross - usedAcross) }
}

/** The turns tried when none is given: square to the drawing, then square to the room's longest side. */
function turnsToTry(polygon: readonly Vec2[]): number[] {
  const out = [0, 90, 180, 270]
  let longest = 0
  let angle = 0
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    if (length > longest + EPS) {
      longest = length
      angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI
    }
  })
  for (const k of [0, 90, 180, 270]) {
    const t = deg(angle + k)
    if (!out.some((o) => Math.abs(o - t) < 1e-6 || Math.abs(Math.abs(o - t) - 360) < 1e-6)) out.push(t)
  }
  return out
}

/** The best arrangement at one turn: the slack at the near edge, the middle or the far, along and across. */
function bestAt(polygon: readonly Vec2[], holes: readonly (readonly Vec2[])[], obstacles: readonly Obstacle[], l: Lattice, turn: number): Arrangement {
  let best: Arrangement | null = null
  for (const across of [0, 0.5, 1]) {
    for (const along of [0, 0.5, 1]) {
      const tried = arrange(polygon, holes, obstacles, l, turn, along, across)
      if (best === null || tried.spots.length > best.spots.length) best = tried
    }
  }
  return best!
}

/** The words for which way the modules' backs face at a turn. */
function facingWords(turn: number): string {
  const back = turned({ x: 0, y: -1 }, turn)
  const axis = Math.abs(back.x) > 1 - 1e-9 ? (back.x > 0 ? '+x' : '-x') : Math.abs(back.y) > 1 - 1e-9 ? (back.y > 0 ? '+y' : '-y') : null
  return axis === null ? `turned ${degrees(turn)}°` : `turned ${degrees(turn)}°, backs to ${axis}`
}

/** The ids of an earlier fill of the group: `<group>-<n>`, and a set's `<group>-<n>-<m>`. */
function groupIds(plan: FloorPlan, group: string): string[] {
  const own = new RegExp(`^${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+(-\\d+)?$`)
  return (plan.items ?? []).filter((item) => own.test(item.id)).map((item) => item.id)
}

export function fillRoom(survey: Survey, library: Library, request: FillRequest, problems: readonly string[] = []): Patch {
  const plan = survey.plan
  const room = survey.byId.get(request.room)
  if (room === undefined || room.polygon.length < 3) throw new EditRefused(`Room ${quoted(request.room)} has no outline Grid can fill: grid_check says why.`)
  if (room.facts.void === true) throw new EditRefused(`Room ${quoted(roomCalled(room.facts))} is a void, open to the floor below, so it has no floor to fill.`)
  const footprint = libraryFootprint(library, request.name)
  if (footprint === null) {
    const meant = likelyId(request.name, libraryNames(library))
    throw new EditRefused(`Can't fill with ${quoted(request.name)}: no library holds it.${meant === null ? '' : ` Did you mean ${quoted(meant)}?`} grid_measure what=library lists what the library holds.`)
  }
  try {
    placeFromLibrary(library, { name: request.name, at: [0, 0] }, new Set())
  } catch (error) {
    if (!(error instanceof LibraryRefused)) throw error
    throw new EditRefused(`Can't fill with ${quoted(request.name)}: ${error.message}.`)
  }
  const item = library.items.get(request.name)
  const set = item === undefined ? library.rooms.get(request.name) : undefined
  const pitch = request.pitch ?? footprint.width
  if (pitch + EPS < footprint.width) throw new EditRefused(`A pitch of ${n2(pitch)} m is less than ${quoted(request.name)}'s width, ${n2(footprint.width)} m, so the modules would stand in each other.`)
  const aisle = request.aisle ?? FILL_AISLE
  const wall = request.wallClearance ?? 0
  const doorClear = request.doorClearance ?? FILL_DOOR_CLEARANCE
  const backToBack = request.backToBack === true
  const group = request.group ?? request.name
  const guessed: string[] = []
  if (request.pitch === undefined) guessed.push(`a pitch of ${n2(pitch)} m along each row, ${quoted(request.name)}'s width, so the modules stand side by side; give pitch for a gap between them.`)
  if (request.aisle === undefined) guessed.push(`an aisle of ${n2(aisle)} m between the rows, Grid's own figure, not a code's; give aisle for yours.`)
  if (request.wallClearance === undefined) guessed.push('0 m kept clear of the walls; give wall_clearance for a way round the edge.')
  if (request.doorClearance === undefined) guessed.push(`${n2(doorClear)} m kept clear in front of each door, Grid's own figure, not a code's; give door_clearance for yours.`)

  const floor = room.facts.floor
  const earlier = groupIds(plan, group)
  if (request.replace !== true && earlier.length > 0) {
    throw new EditRefused(`The plan already holds the group ${quoted(group)}: ${earlier.length} item${earlier.length === 1 ? '' : 's'} (${quoted(earlier[0]!)} the first). Pass replace true to fill it again, or give group another name.`)
  }
  const leaving = new Set(request.replace === true ? earlier : [])
  const obstacles = [...doorZones(plan, floor, doorClear), ...standing(plan, floor, leaving)]
  const lattice: Lattice = { width: footprint.width, depth: footprint.depth, pitch, aisle, backToBack, wall }
  const turns = request.turn === undefined ? turnsToTry(room.polygon) : [deg(request.turn)]
  const tried = turns.map((turn) => bestAt(room.polygon, room.holes, obstacles, lattice, turn))
  const best = tried.reduce((a, b) => (b.spots.length > a.spots.length ? b : a))
  const most = Math.min(request.count ?? FILL_MOST, FILL_MOST)
  let spots = best.spots.slice(0, FILL_MOST)
  const perModule = set === undefined ? 1 : set.room.items.length

  // Each module as grid_place_item places it, then Grid's own checks on the plan as it will be read.
  const records = (kept: readonly Spot[]): { items: Record<string, unknown>[][]; copy: Map<string, Record<string, unknown>> } => {
    const copy = new Map<string, Record<string, unknown>>()
    const items = kept.map((spot, i) => {
      const k = i + 1
      const round = spot.round ? 180 : 0
      const centre = { x: spot.u, y: spot.v }
      const offset = set === undefined ? { x: 0, y: -footprint.depth / 2 + item!.entry.size[1] / 2 } : { x: -footprint.width / 2, y: -footprint.depth / 2 }
      const back = turned(offset, round)
      const at = turned({ x: centre.x + back.x, y: centre.y + back.y }, best.turn)
      const placed = placeFromLibrary(
        library,
        { name: request.name, at: [at.x, at.y] as Pair, turn: best.turn + round, ...(floor === 'ground' ? {} : { floor }), ...(set === undefined ? { id: `${group}-${k}` } : {}) },
        new Set()
      )
      for (const entry of placed.copy) copy.set(entry.name, { ...entry })
      return placed.items.map((record, j) => ({
        ...record,
        ...(set === undefined ? {} : { id: `${group}-${k}-${j + 1}` }),
        ...(set === undefined && request.label !== undefined ? { label: request.label } : {}),
      }))
    })
    return { items, copy }
  }
  const patchOf = (built: ReturnType<typeof records>): Patch => ({
    ...emptyPatch([]),
    addItems: built.items.flat(),
    ...(leaving.size === 0 ? {} : { removeItems: leaving }),
    ...(built.copy.size === 0 ? {} : { addLibrary: [...built.copy.values()] }),
  })
  const flagged: Map<string, number> = new Map()
  let built = records(spots)
  for (let pass = 0; pass < 5 && spots.length > 0; pass++) {
    const moduleOf = new Map<string, number>()
    built.items.forEach((list, i) => list.forEach((record) => moduleOf.set(record['id'] as string, i)))
    const after = readingAfter(plan, patchOf(built))
    const out = new Set<number>()
    for (const issue of validatePlan(after).issues) {
      if (!FIT_CODES.has(issue.code)) continue
      const named = [issue.id, ...((issue as { readonly hits?: readonly string[] }).hits ?? [])].flatMap((id) => (moduleOf.has(id) ? [moduleOf.get(id)!] : []))
      for (const i of named) {
        if (!out.has(i)) flagged.set(issue.code, (flagged.get(issue.code) ?? 0) + 1)
        out.add(i)
      }
    }
    if (out.size === 0) break
    spots = spots.filter((_, i) => !out.has(i))
    built = records(spots)
  }
  const checked = [...flagged.values()].reduce((a, b) => a + b, 0)
  const available = spots.length
  if (spots.length > most) {
    spots = spots.slice(0, most)
    built = records(spots)
  }

  // The ids the group gives must be free, but for the group's own items a replace takes out.
  const taken = new Set([...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.items ?? []), ...(plan.columns ?? [])].map((part) => part.id).filter((id) => !leaving.has(id)))
  for (const id of built.items.flat().map((record) => record['id'] as string)) {
    if (taken.has(id)) throw new EditRefused(`The id ${quoted(id)} the group ${quoted(group)} would give is taken by ${idHolder(plan, id)}. Give group another name, or replace true to fill the group again.`)
  }

  // The answer: how many, how they are set out, the floor each has and what is left over.
  const count = spots.length
  const what = set === undefined ? `${quoted(request.name)} (${n2(item!.entry.size[0])} × ${n2(item!.entry.size[1])} m${(item!.entry.clearance ?? 0) > 0 ? ` with ${n2(item!.entry.clearance!)} m clear in front` : ''})` : `${quoted(request.name)} (a set of ${perModule} items, ${n2(footprint.width)} × ${n2(footprint.depth)} m)`
  const rows = new Set(spots.map((s) => `${s.row}|${s.round}`)).size
  const perRow = Math.max(0, ...[...new Set(spots.map((s) => `${s.row}|${s.round}`))].map((key) => spots.filter((s) => `${s.row}|${s.round}` === key).length))
  const floorArea = room.facts.shape?.area ?? area(room.polygon)
  const ids = built.items.map((list) => list.map((record) => record['id'] as string))
  const said: string[] = [...problems.map((problem) => `Left out of the library: ${problem}.`)]
  const where = `room ${quoted(roomCalled(room.facts))}`
  if (count === 0) said.push(`No ${what} fits in ${where} at this set-out.`)
  else said.push(`${count} ${what} fit in ${where}: ${rows} row${rows === 1 ? '' : 's'}, at most ${perRow} a row, ${facingWords(best.turn)}${backToBack ? ', the rows back to back in pairs' : ''}; the group is ${quoted(group)} (${ids[0]![0]}${count * perModule > 1 ? ` to ${ids[ids.length - 1]![ids[ids.length - 1]!.length - 1]}` : ''}${perModule > 1 ? `, ${count * perModule} items` : ''}).`)
  said.push(`Set out at a pitch of ${n2(pitch)} m along each row and ${n2((backToBack ? 2 : 1) * footprint.depth + aisle)} m from row to row (an aisle of ${n2(aisle)} m), ${n2(wall)} m from the walls and ${n2(doorClear)} m clear in front of each door.`)
  if (count > 0) said.push(`The room's ${n2(floorArea)} m² is ${n2(floorArea / count)} m² a module.`)
  const over = leftOver(best, spots, lattice)
  if (count > 0) said.push(`Left over past the modules: ${n2(over.alongRows)} m along the rows and ${n2(over.acrossRows)} m across them.`)
  const lostWords = [
    best.lost.door > 0 ? `${best.lost.door} to the floor kept in front of a door` : '',
    best.lost.column > 0 ? `${best.lost.column} to a column` : '',
    best.lost.item > 0 ? `${best.lost.item} to an item already there` : '',
    best.lost.shape > 0 ? `${best.lost.shape} to the room's shape` : '',
    checked > 0 ? `${checked} to Grid's checks (${[...flagged.keys()].join(', ')})` : '',
  ].filter((w) => w !== '')
  if (lostWords.length > 0) said.push(`Places given up: ${lostWords.join('; ')}.`)
  if (request.count !== undefined && available < request.count) said.push(`You asked for ${request.count}: ${request.count - count} short at this set-out.`)
  else if (available > count) said.push(request.count === undefined ? `Placed the first ${count}, the most one fill places; ${available - count} more fit.` : `Placed the first ${count}, as asked; ${available - count} more fit.`)
  if (request.turn === undefined) {
    const other = tried.filter((t) => t !== best && t.spots.length !== best.spots.length && Math.abs(deg(t.turn - best.turn) - 180) > 1e-6)
    const next = other.sort((a, b) => b.spots.length - a.spots.length)[0]
    if (next !== undefined) said.push(`Turned ${degrees(next.turn)}° instead, ${next.spots.length} would fit before Grid's checks.`)
  }
  if (leaving.size > 0) said.push(`Took out the group's ${leaving.size} item${leaving.size === 1 ? '' : 's'} placed before.`)
  const patch = patchOf(built)
  return {
    ...patch,
    said,
    guessed,
    extra: {
      group,
      count,
      items: count * perModule,
      placed: ids.flat(),
      ...(request.count === undefined ? {} : { asked: request.count }),
      rows,
      perRow,
      turn: best.turn,
      pitch,
      rowPitch: (backToBack ? 2 : 1) * footprint.depth + aisle,
      aisle,
      backToBack,
      wallClearance: wall,
      doorClearance: doorClear,
      area: floorArea,
      perModule: count === 0 ? null : floorArea / count,
      leftOver: over,
      givenUp: { door: best.lost.door, column: best.lost.column, item: best.lost.item, shape: best.lost.shape, checks: checked },
      removed: leaving.size,
    },
  }
}
