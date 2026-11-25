/**
 * The whole building made wider or longer (WRT-3, lab WR-2, WR-4): "the flat 30 cm wider".
 *
 * Everything beyond a line across the building moves out by the distance asked: walls wholly
 * beyond it move, walls across it get longer, and the rooms the line crosses grow. The line is
 * just inside the outside wall on that side unless the call puts it through a room. Every floor
 * moves together unless one is named.
 *
 * The way of doing it comes from the lab's edit prototype (`widen`). Openings keep their anchor
 * or their place in the building (`seat.ts`), so an entrance in a wall that grows at its start
 * stays where it was instead of sliding into a junction (WR-4).
 *
 * WRT-24: the rest of the building beyond the line moves with the walls: columns, parking bays,
 * stairs and ramps wholly beyond it, a structural grid set square to it (its spacing across the
 * line grows), the site's things (their points beyond it) and the opening patterns on the walls
 * that grow, kept at their pitch. What stays behind is named, with why (`carryParts`).
 *
 * Pure: a survey in, a patch out.
 */
import { gridLineNames, planGrid, tolerance, wallLength, type FloorPlan, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said as sentence, type MessageKey, type Value } from '@ongrid/floorplan/messages'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { listed, refuseCurved, type Direction, type OpeningChange, type PartList, type Patch } from './edits'
import { EditRefused } from './refused'
import { COMPASS, r3, seatOpenings } from './seat'

export interface StretchRequest {
  readonly side: Direction
  readonly by: number
  /** A room the line runs through, across its middle. */
  readonly through?: string
  readonly floor?: string
}

export function stretchPlan(survey: Survey, request: StretchRequest): Patch {
  const plan = survey.plan
  const { side, by } = request
  const out = COMPASS[side]
  const across = side === 'east' || side === 'west'
  const sign = side === 'east' || side === 'north' ? 1 : -1
  const coord = (p: readonly [number, number] | Vec2): number => (Array.isArray(p) ? (across ? p[0] : p[1]) : across ? (p as Vec2).x : (p as Vec2).y)
  const onFloor = (floor: string | undefined): boolean => request.floor === undefined || (floor ?? 'ground') === request.floor
  const walls = plan.walls.filter((w) => onFloor(w.floor))
  if (walls.length === 0) throw new EditRefused('That floor has no walls to stretch.')
  const guessed: string[] = []
  let line: number
  let where: string
  if (request.through !== undefined) {
    const room = survey.byId.get(request.through)!
    if (room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
    if (!onFloor(room.facts.floor)) throw new EditRefused(`That room is on floor ${quoted(room.facts.floor)}, not the floor named.`)
    const values = room.polygon.map(coord)
    line = (Math.min(...values) + Math.max(...values)) / 2
    where = `through the middle of ${quoted(room.facts.name)}`
  } else {
    const values = walls.flatMap((w) => [coord(w.start), coord(w.end)])
    line = sign > 0 ? Math.max(...values) - 0.01 : Math.min(...values) + 0.01
    where = `at its ${side} outside wall`
    guessed.push(`Only the rooms along the ${side} side grow: the ${side} outside wall moves out. Pass through with a room to stretch the building through that room instead.`)
  }
  const beyond = (p: readonly [number, number] | Vec2): boolean => sign * (coord(p) - line) > 0
  const v = { x: out.x * by, y: out.y * by }
  const move = (p: readonly [number, number]): [number, number] => [r3(p[0] + v.x), r3(p[1] + v.y)]

  const changes = new Map<string, { start?: [number, number]; end?: [number, number] }>()
  const moved: string[] = []
  const longer: string[] = []
  for (const w of walls) {
    const s = beyond(w.start)
    const e = beyond(w.end)
    if (!s && !e) continue
    refuseCurved([w], 'stretch')
    const change = { ...(s ? { start: move(w.start) } : {}), ...(e ? { end: move(w.end) } : {}) }
    const ns = change.start ?? w.start
    const ne = change.end ?? w.end
    if (Math.hypot(ne[0] - ns[0], ne[1] - ns[1]) < 0.05) throw new EditRefused(`That would leave wall ${quoted(w.id)} with no length.`)
    changes.set(w.id, change)
    ;(s && e ? moved : longer).push(w.id)
  }
  if (changes.size === 0) throw new EditRefused(`Nothing of the plan lies ${side} of that line, so nothing would move.`)
  const floors = new Set(walls.map((w) => w.floor ?? 'ground'))
  if (request.floor === undefined && floors.size > 1) guessed.push(`All ${floors.size} floors are stretched together; pass floor to stretch one.`)

  const seated = seatOpenings(survey, changes, (p) => (beyond(p) ? { x: p.x + v.x, y: p.y + v.y } : p), { shift: v, what: 'stretching it' })
  const openings = new Map<string, OpeningChange>()
  const said = [
    `Stretched the plan ${Math.abs(by).toFixed(2)} m ${by >= 0 ? `to the ${side}` : `back from the ${side}`}, ${where}: ${moved.length} wall${moved.length === 1 ? '' : 's'} moved and ${longer.length} ${by >= 0 ? 'longer' : 'shorter'}${floors.size > 1 && request.floor === undefined ? `, on all ${floors.size} floors` : ''}.`,
  ]
  const stayed: string[] = []
  for (const [id, offset] of seated.offsets) {
    const o = plan.openings.find((x) => x.id === id)!
    if (Math.abs(offset - o.offset) <= tolerance('noLength')) continue
    openings.set(id, { offset })
    const change = changes.get(o.wall)
    if (change?.start !== undefined && change.end === undefined && o.anchor === undefined) stayed.push(`${o.type} ${quoted(o.id)}`)
  }
  // CNT-12: a fixture beyond the line moves with the walls round it.
  const items = new Map<string, { at: [number, number]; turn: number }>()
  for (const item of plan.items ?? []) {
    if (onFloor(item.floor) && beyond(item.at)) items.set(item.id, { at: move(item.at), turn: item.turn ?? 0 })
  }
  if (items.size > 0) said.push(`${items.size} fixture${items.size === 1 ? '' : 's'} beyond the line moved with ${items.size === 1 ? 'it' : 'them'}.`)
  const carried = carryParts(plan, { beyond, move, by, coord, onFloor, changes, sign, across, line, single: request.floor !== undefined })
  said.push(...carried.said)
  if (stayed.length > 0) said.push(`${listed(stayed)} ${stayed.length === 1 ? 'stays where it was: its wall grew at its start, so its offset is' : 'stay where they were: their walls grew at their start, so their offsets are'} ${Math.abs(by).toFixed(2)} m ${by >= 0 ? 'longer' : 'shorter'}.`)
  return {
    walls: changes,
    openings,
    removeOpenings: new Set(),
    rooms: new Map(),
    ...(items.size === 0 ? {} : { items }),
    ...(carried.parts.size === 0 ? {} : { parts: carried.parts }),
    said,
    guessed: [...guessed, ...seated.guessed, ...carried.guessed],
    notKept: [...seated.notKept, ...carried.notKept],
  }
}

type Pair = [number, number]
type Put = (list: PartList, id: string, change: Record<string, unknown>) => void

/** What `carryParts` needs of the stretch: its line, which side of it is beyond, and the move. */
interface Carry {
  readonly beyond: (p: readonly [number, number] | Vec2) => boolean
  readonly move: (p: readonly [number, number]) => Pair
  readonly by: number
  readonly coord: (p: readonly [number, number] | Vec2) => number
  readonly onFloor: (floor: string | undefined) => boolean
  readonly changes: ReadonlyMap<string, { start?: Pair; end?: Pair }>
  readonly sign: number
  readonly across: boolean
  readonly line: number
  /** One floor is stretched, not every one. */
  readonly single: boolean
}

const say = (key: MessageKey, values?: Record<string, Value>): string => english(sentence(key, values))
const metres = (value: number): Value => num(String(r3(Math.abs(value))))
/** Kept to the micrometre, as the patterns write their places. */
const r6 = (value: number): number => Number(value.toFixed(6)) + 0

/**
 * WRT-24: the parts beyond the line that move with the walls, and the ones that stay, each named
 * with why. Columns, bays, stairs and ramps move whole; a stair or ramp across the line stays,
 * since stretching it changes its risers or its slope. A structural grid square to the stretch
 * moves its lines beyond the line, and the spacing across it grows by the distance; a grid turned
 * across it, or drawn on a floor that is not stretched, stays and is said no longer to reach the
 * walls that moved. The site's things move their points beyond the line; its boundary stays.
 * A pattern on a wall that grows keeps its openings where they stand, at their pitch.
 */
function carryParts(plan: FloorPlan, c: Carry): { parts: Map<PartList, Map<string, Record<string, unknown>>>; said: string[]; guessed: string[]; notKept: string[] } {
  const parts = new Map<PartList, Map<string, Record<string, unknown>>>()
  const put: Put = (list, id, change) => {
    const of = parts.get(list) ?? new Map<string, Record<string, unknown>>()
    of.set(id, { ...(of.get(id) ?? {}), ...change })
    parts.set(list, of)
  }
  const said: string[] = []
  const guessed: string[] = []
  const notKept: string[] = []
  const moved: Value[] = []
  const counted = (key: 'column' | 'bay' | 'grid' | 'stair' | 'ramp' | 'thing', n: number): void => {
    if (n > 0) moved.push(sentence(`edit.stretch.count.${key}.${n === 1 ? 'one' : 'many'}`, { n }))
  }

  let columns = 0
  for (const column of plan.columns ?? []) {
    if (!c.onFloor(column.floor) || !c.beyond(column.at)) continue
    put('columns', column.id, { at: c.move(column.at) })
    columns++
  }
  let bays = 0
  for (const bay of plan.bays ?? []) {
    if (!c.onFloor(bay.floor) || !c.beyond(bay.at)) continue
    put('bays', bay.id, { at: c.move(bay.at) })
    bays++
  }
  // Stairs and ramps move whole, the floors they join stretched; one across the line stays.
  const runs = (list: 'stairs' | 'ramps', all: readonly { id: string; from: string; to: string; run: readonly (readonly [number, number])[] }[]): number => {
    let n = 0
    for (const part of all) {
      const out = part.run.filter((p) => c.beyond(p)).length
      if (out === 0) continue
      const label = sentence(list === 'stairs' ? 'edit.stretch.part.stair' : 'edit.stretch.part.ramp', { id: name(part.id) })
      if (!c.onFloor(part.from) || !c.onFloor(part.to)) {
        notKept.push(say('edit.stretch.stays.otherFloor', { part: label }))
        continue
      }
      if (out < part.run.length) {
        notKept.push(say('edit.stretch.stays.crosses', { part: label }))
        continue
      }
      // A run written as its two ends is written as its run.
      put(list, part.id, { run: part.run.map((p) => c.move(p)), start: null, end: null })
      n++
    }
    return n
  }
  const stairs = runs('stairs', plan.stairs ?? [])
  const ramps = runs('ramps', plan.ramps ?? [])
  const grids = carryGrids(plan, c, put, said, notKept)
  // The site's things lie on the ground; its boundary is the plot, and stays.
  let things = 0
  const site = plan.site
  if (site !== undefined && c.onFloor(undefined)) {
    for (const thing of site.things ?? []) {
      const change: Record<string, unknown> = {}
      if (thing.points !== undefined && thing.points.some((p) => c.beyond(p))) change['points'] = thing.points.map((p) => (c.beyond(p) ? c.move(p) : [p[0], p[1]]))
      if (thing.at !== undefined && c.beyond(thing.at)) change['at'] = c.move(thing.at)
      if (Object.keys(change).length === 0) continue
      put('site.things', thing.id, change)
      things++
    }
    if ((site.boundary ?? []).some((p) => c.beyond(p))) guessed.push(say('edit.stretch.boundary'))
  }
  counted('column', columns)
  counted('bay', bays)
  counted('grid', grids)
  counted('stair', stairs)
  counted('ramp', ramps)
  counted('thing', things)
  if (moved.length > 0) said.unshift(say('edit.stretch.carried', { parts: joined(moved, 'join.comma', 'join.and') }))
  carryPatterns(plan, c, put, said, notKept)
  return { parts, said, guessed, notKept }
}

/** WRT-24: the structural grids beyond the line; how many moved. */
function carryGrids(plan: FloorPlan, c: Carry, put: Put, said: string[], notKept: string[]): number {
  const allFloors = [...new Set(plan.walls.map((w) => w.floor ?? 'ground'))]
  const axis = { x: c.across ? 1 : 0, y: c.across ? 0 : 1 }
  let n = 0
  for (const grid of plan.grids ?? []) {
    const drawn = planGrid(grid)
    if (!drawn.lines.some((l) => c.beyond(l.from) || c.beyond(l.to))) continue
    const label = name(grid.id)
    if (c.single && (grid.floors ?? allFloors).some((f) => !c.onFloor(f))) {
      notKept.push(say('edit.stretch.stays.gridFloor', { grid: label }))
      continue
    }
    const turn = ((grid.turn ?? 0) * Math.PI) / 180
    // How far along the stretch each set's lines step: the x lines along the grid's x, the y lines along its y.
    const kx = Math.cos(turn) * axis.x + Math.sin(turn) * axis.y
    const ky = -Math.sin(turn) * axis.x + Math.cos(turn) * axis.y
    // Square to the stretch only when turned by a whole number of quarter turns, as stated.
    const square = (grid.turn ?? 0) % 90 === 0
    const which = !square ? null : Math.abs(kx) > Math.abs(ky) ? 'x' : 'y'
    if (which === null) {
      notKept.push(say('edit.stretch.stays.gridTurned', { grid: label }))
      continue
    }
    const k = Math.sign(which === 'x' ? kx : ky)
    const set = grid[which]
    const at = [0]
    for (const step of set.spacing) at.push(at[at.length - 1]! + step)
    const out = at.map((d) => c.sign * (c.coord(grid.origin) + k * d - c.line) > 0)
    const change: Record<string, unknown> = {}
    if (out[0]) change['origin'] = c.move(grid.origin)
    const spacing = [...set.spacing]
    const names = gridLineNames(set, which)
    for (let i = 0; i < spacing.length; i++) {
      if (out[i] === out[i + 1]) continue
      const next = r6(spacing[i]! + c.by)
      if (next <= tolerance('noLength')) throw new EditRefused(say('edit.stretch.grid.short', { grid: label, from: names[i]!, to: names[i + 1]! }))
      spacing[i] = next
      said.push(say(c.by >= 0 ? 'edit.stretch.grid.spacing.more' : 'edit.stretch.grid.spacing.less', { grid: label, from: names[i]!, to: names[i + 1]!, spacing: metres(next), change: metres(c.by) }))
    }
    if (spacing.some((value, i) => value !== set.spacing[i])) change[which] = { ...set, spacing }
    put('grids', grid.id, change)
    n++
  }
  return n
}

/** WRT-24: the opening patterns on walls that grow at one end, kept where they stand at their pitch. */
function carryPatterns(plan: FloorPlan, c: Carry, put: Put, said: string[], notKept: string[]): void {
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  const over = tolerance('openingOverrun')
  for (const pattern of plan.patterns ?? []) {
    const change = c.changes.get(pattern.wall)
    const wall = walls.get(pattern.wall)
    if (change === undefined || wall === undefined || (change.start !== undefined) === (change.end !== undefined)) continue
    const label = name(pattern.id)
    const after: Wall = { ...wall, start: change.start ?? wall.start, end: change.end ?? wall.end }
    const length = wallLength(wall)
    const grown = wallLength(after) - length
    const a = pattern.margins?.start ?? 0
    const e = pattern.margins?.end ?? 0
    const width = pattern.opening.width
    if (change.start !== undefined) {
      // The wall's start moved: its openings keep their places by a start margin that much longer.
      const d = { x: after.end[0] - after.start[0], y: after.end[1] - after.start[1] }
      const shift = ((wall.start[0] - after.start[0]) * d.x + (wall.start[1] - after.start[1]) * d.y) / Math.hypot(d.x, d.y)
      const margin = r6(a + shift)
      put('patterns', pattern.id, { margins: { ...pattern.margins, start: Math.max(0, margin) } })
      if (margin < 0) notKept.push(say('edit.stretch.pattern.marginLost', { pattern: label }))
      else said.push(say('edit.stretch.pattern.margin', { pattern: label, margin: metres(margin) }))
      continue
    }
    const free = length - a - e
    if (pattern.spacing === undefined) {
      // A count alone spreads its openings along the wall: given the pitch they had, they stay.
      const count = pattern.count!
      if (count < 2) continue
      const pitch = r6((free - width) / (count - 1))
      put('patterns', pattern.id, { spacing: pitch })
      said.push(grown > 0
        ? say('edit.stretch.pattern.pitch.grew', { pattern: label, n: count, pitch: metres(pitch), free: metres(grown) })
        : say('edit.stretch.pattern.pitch.kept', { pattern: label, n: count, pitch: metres(pitch) }))
      continue
    }
    if (pattern.count !== undefined) continue
    const fits = (room: number): number => Math.max(0, Math.floor((room - width + over) / pattern.spacing!) + 1)
    const before = fits(free)
    const now = fits(free + grown)
    if (now !== before) said.push(say('edit.stretch.pattern.more', { pattern: label, spacing: metres(pattern.spacing), before, after: now }))
  }
}
