/**
 * Use indicators in a person's terms (CNT-13): can a wheelchair turn here, is the way through
 * wide enough for a body or a trolley, how much floor is in front of and beside each fixture,
 * what clear width each doorway leaves and whether a fixture stands in front of a window. Each
 * line says what it measured, the figure it set that against, and whose figure it is: the
 * person's own, or one of Grid's own indicators (`tolerances.ts`), never a rule from a code.
 *
 * The measures are the library's (`@ongrid/floorplan/geometry`, `use.ts`); this file picks the
 * mouths, the fixtures and the figures, and words the answer. Pure: a survey in, lines and data
 * out.
 */
import { english, said } from '@ongrid/floorplan/messages'
import {
  doorwayClearance,
  fixtureSpace,
  INDICATOR_NOTE,
  itemFootprint,
  itemName,
  liesUnderfoot,
  limit,
  lineMouth,
  openingMouth,
  passageWidth,
  pointMouth,
  tolerance,
  turningSpace,
  USE_INDICATORS,
  windowCover,
  type Item,
  type Obstacle,
  type Opening,
  type Segment,
  type UseCode,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { say } from '@ongrid/floorplan/messages'
import { planFixtures, type FixtureRow } from './fixtures'
import { COMMON_PARTS, OUTSIDE, routeBetween, wayGraph } from './measure'
import { roomCalled, roomCalledById, type Survey, type SurveyRoom } from './survey'
import { WALKED_RULE, walkedLength } from './walked'

const q = (text: string): string => JSON.stringify(text)

/** Said under every answer with indicators. */
export const USE_RULE =
  `${INDICATOR_NOTE} Measured on the free floor between wall faces, clear of the fixtures the plan holds; furniture, radiators and the swing of a door leaf are not in the plan. The way through a room is measured on a grid of points, to within a few centimetres.`

/** The figure an indicator is set against: the person's, or Grid's own. */
export interface Figure {
  readonly value: number
  readonly from: 'person' | 'grid'
}

export function figureOf(given: unknown, name: 'useDoorwayClear' | 'usePassageWidth' | 'useTurningCircle' | 'useClearSpace'): Figure {
  return typeof given === 'number' ? { value: given, from: 'person' } : { value: limit(name), from: 'grid' }
}

/** One indicator, as data. */
export interface Indicator {
  readonly code: UseCode
  /** What it is about: a room, a doorway, a fixture or a window, by id. */
  readonly about: string
  /** What it measured, in metres; null when nothing could be measured. */
  readonly measured: number | null
  readonly figure: Figure
  /** True when what it measured is less than the figure. */
  readonly under: boolean
  readonly at?: Vec2
  readonly detail?: Readonly<Record<string, unknown>>
}

export interface IndicatorAnswer {
  readonly lines: readonly string[]
  readonly indicators: readonly Indicator[]
}

type Length = (metres: number) => string

function against(measured: number, figure: Figure, L: Length): string {
  const whose = figure.from === 'person' ? `the ${L(figure.value)} you gave` : `Grid's own indicator of ${L(figure.value)}`
  return measured + tolerance('joint') >= figure.value ? `at least ${whose}` : `under ${whose}`
}

const isUnder = (measured: number | null, figure: Figure): boolean => measured === null || measured + tolerance('joint') < figure.value

export interface SurveyFixtures {
  readonly rows: readonly FixtureRow[]
  readonly items: readonly Item[]
  readonly obstacles: (floor: string) => Obstacle[]
  /** CNT-23: the obstacles on a floor whose footprints reach the box widened by `margin`; the rest cannot touch a measure made inside it. */
  readonly near: (floor: string, box: Box, margin: number) => Obstacle[]
  /** An item or its row by id, found without a scan. */
  readonly itemById: ReadonlyMap<string, Item>
  readonly rowById: ReadonlyMap<string, FixtureRow>
}

/** A box on the plan, in metres. */
export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const fixturesCache = new WeakMap<Survey, SurveyFixtures>()

/** The plan's fixtures that can be drawn, as obstacles, each with its row; worked out once a survey. CNT-17's access measures and COD-8's firm standards keep clear of them too. */
export function fixturesOf(survey: Survey): SurveyFixtures {
  const known = fixturesCache.get(survey)
  if (known) return known
  const found = fixturesOfPlan(survey)
  fixturesCache.set(survey, found)
  return found
}

function fixturesOfPlan(survey: Survey): SurveyFixtures {
  const rows = planFixtures(survey.plan).rows
  const rowById = new Map(rows.map((row) => [row.id, row] as const))
  const items = (survey.plan.items ?? []).filter((item) => rowById.has(item.id))
  const itemById = new Map(items.map((item) => [item.id, item] as const))
  const byFloor = new Map<string, { obstacle: Obstacle; box: Box }[]>()
  const listByFloor = new Map<string, Obstacle[]>()
  for (const row of rows) {
    // CNT-42: a rug lies on the floor: nothing is measured to it, and it narrows no way.
    if (liesUnderfoot(row.kind)) continue
    const outline = itemFootprint(itemById.get(row.id)!)
    const list = byFloor.get(row.floor) ?? []
    list.push({ obstacle: { id: row.id, outline }, box: boxOf(outline) })
    byFloor.set(row.floor, list)
  }
  return {
    rows,
    items,
    itemById,
    rowById,
    obstacles: (floor) => {
      // The same list every time, so what is worked out from it once (`fixtureSpace`) is kept.
      let list = listByFloor.get(floor)
      if (list === undefined) {
        list = (byFloor.get(floor) ?? []).map((entry) => entry.obstacle)
        listByFloor.set(floor, list)
      }
      return list
    },
    near: (floor, box, margin) =>
      (byFloor.get(floor) ?? [])
        .filter((e) => e.box.maxX >= box.minX - margin && e.box.minX <= box.maxX + margin && e.box.maxY >= box.minY - margin && e.box.minY <= box.maxY + margin)
        .map((entry) => entry.obstacle),
  }
}

function boxOf(points: readonly Vec2[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

/**
 * How far past a room's box a fixture can still change what is measured in it (CNT-23). A
 * doorway's approach depth reaches past its wall's far face; the way through a room lists the
 * fixtures within two steps of its grid of the narrowest point; and where a doorway or a dividing
 * line opens the room's outline, a fixture just beyond it can be the nearest thing to a point
 * inside, as far out as half the length of the opening. Anything farther cannot change a figure.
 */
function reachOf(survey: Survey, room: SurveyRoom, box: Box, openings: number): number {
  const thickest = survey.plan.walls.reduce((most, wall) => Math.max(most, wall.thickness), 0)
  const step = Math.max(tolerance('useRaster'), Math.sqrt(((box.maxX - box.minX) * (box.maxY - box.minY)) / limit('useRasterCells')))
  return limit('useApproachDepth') + thickest + 2 * step + openings / 2
}

/** Where a door, an opening or a dividing line (`via`) meets the room, or null. */
export function mouthOf(survey: Survey, room: SurveyRoom, via: string): Segment | null {
  const opening = survey.plan.openings.find((o) => o.id === via)
  const wallId = opening?.wall ?? via
  const wall = survey.plan.walls.find((w) => w.id === wallId)
  if (wall === undefined) return null
  if (opening !== undefined && wall.virtual !== true) return openingMouth(wall, opening, room.polygon, room.holes)
  return lineMouth(wall, room.polygon)
}

function namesOf(items: readonly Item[], ids: readonly string[]): string {
  const wanted = new Set(ids)
  return items.filter((item) => wanted.has(item.id)).map(itemName).join(', ')
}

export function besideText(passage: { beside: { fixtures: readonly string[]; wall: boolean } }, items: readonly Item[]): string {
  const fixtures = namesOf(items, passage.beside.fixtures)
  if (fixtures === '') return passage.beside.wall ? ', between walls' : ''
  return passage.beside.wall ? `, between ${fixtures} and a wall` : `, beside ${fixtures}`
}

const at = (p: Vec2): string => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`

// ---------------------------------------------------------------------------------------------
// One room: grid_measure what=use

/** The doors, doorless openings and dividing lines of a room, in plan order. */
export function waysOf(survey: Survey, room: SurveyRoom): { via: string; opening: Opening | null; wall: Wall }[] {
  const out: { via: string; opening: Opening | null; wall: Wall }[] = []
  for (const facts of room.openings) {
    if (facts.type === 'window') continue
    const opening = survey.plan.openings.find((o) => o.id === facts.id)
    const wall = survey.plan.walls.find((w) => w.id === facts.wall)
    if (opening && wall) out.push({ via: opening.id, opening, wall })
  }
  const seen = new Set<string>()
  for (const edge of room.edges) {
    if (edge.wall === null || edge.wall.virtual !== true || seen.has(edge.wall.id)) continue
    seen.add(edge.wall.id)
    out.push({ via: edge.wall.id, opening: null, wall: edge.wall })
  }
  return out
}

/**
 * Every indicator for one room: its turning space, the clear width of each doorway, the way
 * through it between its doorways (or from its one doorway to its widest point), the floor in
 * front of and beside each of its fixtures, and each window a fixture stands in front of.
 */
export function roomIndicators(survey: Survey, room: SurveyRoom, given: { width?: unknown; diameter?: unknown; clearance?: unknown }, L: Length, leftOut = 0): IndicatorAnswer {
  const lines: string[] = []
  const indicators: Indicator[] = []
  const { rows, items, near, obstacles: onFloor, itemById, rowById } = fixturesOf(survey)
  // CNT-23: only what stands in or against this room can change what is measured in it.
  const box = boxOf(room.polygon)
  const mouthsLength = waysOf(survey, room).reduce((sum, way) => {
    const mouth = mouthOf(survey, room, way.via)
    return sum + (mouth === null ? 0 : Math.hypot(mouth[1].x - mouth[0].x, mouth[1].y - mouth[0].y))
  }, 0)
  const obstacles = near(room.facts.floor, box, reachOf(survey, room, box, mouthsLength))
  // A ray from a fixture's face can pass out through a doorway and meet a fixture in the next room.
  const everyFixture = onFloor(room.facts.floor)
  const own = rows.filter((row) => row.room === room.facts.id)
  const name = q(roomCalled(room.facts))
  const add = (indicator: Indicator, text: string): void => {
    indicators.push(indicator)
    lines.push(`Indicator, ${USE_INDICATORS[indicator.code].name}: ${text}.`)
  }

  // Turning space.
  const turning = figureOf(given.diameter, 'useTurningCircle')
  const circle = turningSpace(room.polygon, room.holes, obstacles)
  // ARE-26: with fixtures left out, an empty room is not said to hold none: they could not be measured.
  const clearOf = own.length === 0 ? (leftOut > 0 ? english(said('measure.noneMeasured')) : 'the room holds no fixtures') : `clear of ${own.length === 1 ? 'its fixture' : `its ${own.length} fixtures`}`
  add(
    { code: 'use/turning-space', about: room.facts.id, measured: circle.diameter, figure: turning, under: isUnder(circle.diameter, turning), at: circle.at },
    `the widest circle the free floor of ${name} holds is ${L(circle.diameter)} across, centred at ${at(circle.at)}, ${clearOf}; ${against(circle.diameter, turning, L)}`
  )

  // Each doorway's clear width.
  const body = figureOf(given.width, 'useDoorwayClear')
  const ways = waysOf(survey, room)
  for (const way of ways) {
    if (way.opening === null) continue
    const d = doorwayClearance(way.wall, way.opening, obstacles)
    const leaf = d.leaf > 0 ? ` less ${L(d.leaf)} for the open leaf` : ''
    const narrowed = d.narrowedBy.length === 0 ? '' : `; ${namesOf(items, d.narrowedBy)} ${d.narrowedBy.length === 1 ? 'stands' : 'stand'} in front of ${L(d.covered)} of it`
    add(
      { code: 'use/doorway-clear-width', about: way.opening.id, measured: d.clear, figure: body, under: isUnder(d.clear, body), detail: { hole: d.hole, leaf: d.leaf, covered: d.covered, narrowedBy: d.narrowedBy } },
      `${way.opening.type} ${q(way.opening.id)} leaves ${L(d.clear)} clear, its ${L(d.hole)} hole${leaf}${narrowed}; ${against(d.clear, body, L)}`
    )
  }

  // The way through, between each pair of doorways, or from the one doorway to the widest point.
  const passage = figureOf(given.width, 'usePassageWidth')
  const mouths = ways.flatMap((way) => {
    const mouth = mouthOf(survey, room, way.via)
    return mouth === null ? [] : [{ via: way.via, mouth }]
  })
  const pairs: { from: string; to: string; a: Segment; b: Segment }[] = []
  if (mouths.length === 1) pairs.push({ from: mouths[0]!.via, to: 'its widest point', a: mouths[0]!.mouth, b: pointMouth(circle.at) })
  for (let i = 0; i < mouths.length; i++) for (let j = i + 1; j < mouths.length; j++) pairs.push({ from: mouths[i]!.via, to: q(mouths[j]!.via), a: mouths[i]!.mouth, b: mouths[j]!.mouth })
  const shown = pairs.slice(0, 10)
  for (const pair of shown) {
    const way = passageWidth(room.polygon, room.holes, obstacles, pair.a, pair.b)
    const between = `from ${q(pair.from)} to ${pair.to}`
    if (way === null) {
      add({ code: 'use/passage-width', about: room.facts.id, measured: null, figure: passage, under: true, detail: { from: pair.from, to: pair.to } }, `there is no way through ${name} ${between} clear of its fixtures`)
      continue
    }
    const where = way.atDoorway ? ', no narrower than its doorways' : ` at its narrowest, at ${at(way.at)}${besideText(way, items)}`
    add(
      { code: 'use/passage-width', about: room.facts.id, measured: way.width, figure: passage, under: isUnder(way.width, passage), at: way.at, detail: { from: pair.from, to: pair.to, beside: way.beside, atDoorway: way.atDoorway, step: way.step } },
      `the widest body or trolley that gets through ${name} ${between} is ${L(way.width)}${where}; ${against(way.width, passage, L)}`
    )
  }
  if (pairs.length > shown.length) lines.push(`  … ${pairs.length - shown.length} more ways between its doorways are not measured here; ask grid_measure what=route for one.`)

  // The floor in front of and beside each fixture.
  const space = figureOf(given.clearance, 'useClearSpace')
  for (const row of own) {
    // CNT-42: a rug keeps no floor of its own clear.
    if (liesUnderfoot(row.kind)) continue
    const item = itemById.get(row.id)!
    const found = fixtureSpace(item, room.polygon, room.holes, everyFixture)
    const sides = [['in front', found.front], ...(found.sides ? ([['to its left', found.left], ['to its right', found.right]] as const) : [])] as readonly (readonly [string, number | null])[]
    const joinedTo = (ids: readonly string[]): string => namesOf(items, ids)
    const said = [
      ...sides.map(([where, v]) => `${where} ${v === null ? 'open' : L(v)}${where === 'in front' && found.frontBy !== null && v !== null ? `, an aisle to ${joinedTo([found.frontBy])}` : ''}`),
      ...(found.joined.left.length > 0 ? [`to its left it is joined end to end with ${joinedTo(found.joined.left)}`] : []),
      ...(found.joined.right.length > 0 ? [`to its right it is joined end to end with ${joinedTo(found.joined.right)}`] : []),
    ].join(', ')
    const measuredSides = sides.filter(([where]) => !(where === 'to its left' && found.joined.left.length > 0) && !(where === 'to its right' && found.joined.right.length > 0))
    const bounded = measuredSides.flatMap(([where, v]) => (v === null ? [] : [{ where, v }]))
    const least = bounded.length === 0 ? null : bounded.reduce((a, b) => (b.v < a.v ? b : a))
    add(
      { code: 'use/space-by-fixture', about: row.id, measured: least?.v ?? null, figure: space, under: least !== null && isUnder(least.v, space), detail: { front: found.front, left: found.left, right: found.right, frontBy: found.frontBy, joined: found.joined } },
      `${itemName(item)} has clear floor ${said}, as seen from its front, to the nearest wall face, doorway or fixture; ${least === null ? 'nothing bounds it' : `the least, ${least.where}, is ${against(least.v, space, L)}`}`
    )
  }

  // Windows a fixture higher than the sill stands in front of.
  for (const facts of room.openings) {
    if (facts.type !== 'window') continue
    const opening = survey.plan.openings.find((o) => o.id === facts.id)
    const wall = survey.plan.walls.find((w) => w.id === facts.wall)
    if (!opening || !wall) continue
    const cover = windowCover(wall, opening, obstacles.map((o) => ({ ...o, height: rowById.get(o.id)!.height })))
    if (cover.by.length === 0) continue
    const depth: Figure = { value: limit('useApproachDepth'), from: 'grid' }
    add(
      { code: 'use/window-blocked', about: opening.id, measured: cover.covered, figure: depth, under: false, detail: { width: cover.width, sill: cover.sill, by: cover.by } },
      `${namesOf(items, cover.by.map((b) => b.id))}, higher than its ${L(cover.sill)} sill, ${cover.by.length === 1 ? 'stands' : 'stand'} in front of ${L(cover.covered)} of window ${q(opening.id)}'s ${L(cover.width)}, measured within Grid's own approach depth of ${L(depth.value)}`
    )
  }
  return { lines, indicators }
}

// ---------------------------------------------------------------------------------------------
// A way for a body or a trolley: grid_measure what=route with width

/** One room on a way, and the width of the way through it. */
export interface WayRoom {
  readonly room: string
  /** The widest body that gets through it from where the way comes in to where it leaves; null when nothing does. */
  readonly width: number | null
  readonly at: Vec2 | null
  readonly beside: { readonly fixtures: readonly string[]; readonly wall: boolean } | null
  readonly atDoorway: boolean
}

/** One step of a way, and the clear width its doorway leaves (null for a dividing line, which has no hole). */
export interface WayStep {
  readonly via: string
  readonly type: 'door' | 'window' | 'opening' | 'open side'
  readonly into: string
  readonly clear: number | null
  readonly narrowedBy: readonly string[]
}

export interface Way {
  readonly rooms: readonly WayRoom[]
  readonly steps: readonly WayStep[]
  /** The widest body the whole way takes: its narrowest room or doorway. */
  readonly width: number | null
  /** VEW-9: how far it is walked (`WALKED_RULE`), in metres; null when a room on it has no outline. */
  readonly length: number | null
}

export interface WideRoute {
  readonly from: string
  readonly to: string
  readonly width: number
  /** True when some way is at least `width` all along. */
  readonly through: boolean
  /** The way it gets through by, or null. */
  readonly way: Way | null
  /** The way with the fewest rooms, measured, and what on it is narrower than `width`. */
  readonly shortest: Way | null
  readonly narrower: readonly { readonly kind: 'room' | 'doorway'; readonly id: string; readonly width: number | null }[]
}

/**
 * The way for a body or a trolley `width` wide from one room to another or to the outside, keeping
 * clear of the fixtures: first the way with the fewest rooms, measured room by room and doorway by
 * doorway; when something on it is narrower, the way with the fewest rooms that is at least that
 * wide all along, if there is one. ARE-70: `onto` the common parts, the way ends on them, as the
 * route it widens does.
 */
export function wideRoute(survey: Survey, from: string, to: string, width: number, onto?: typeof COMMON_PARTS): WideRoute | null {
  const start = survey.byId.get(from)!
  const floor = start.facts.floor
  const { next, openings, common } = wayGraph(survey, floor)
  const { obstacles: onFloor } = fixturesOf(survey)
  const obstacles = onFloor(floor)
  const goal = to === 'outside' ? OUTSIDE : to

  const passages = new Map<string, WayRoom>()
  const through = (roomId: string, viaIn: string | null, viaOut: string | null): WayRoom => {
    const key = `${roomId}|${viaIn ?? ''}|${viaOut ?? ''}`
    const known = passages.get(key)
    if (known) return known
    const room = survey.byId.get(roomId)
    let found: WayRoom = { room: roomId, width: null, at: null, beside: null, atDoorway: false }
    if (room !== undefined && room.polygon.length >= 3) {
      // Where the way starts or ends, it is anywhere in the room: the person is already in it.
      const a = viaIn === null ? null : mouthOf(survey, room, viaIn)
      const b = viaOut === null ? null : mouthOf(survey, room, viaOut)
      const lost = (viaIn !== null && a === null) || (viaOut !== null && b === null)
      const way = lost ? null : passageWidth(room.polygon, room.holes, obstacles, a, b)
      if (way !== null) found = { room: roomId, width: way.width, at: way.at, beside: way.beside, atDoorway: way.atDoorway }
    }
    passages.set(key, found)
    return found
  }
  const doorway = (via: string): { clear: number | null; narrowedBy: readonly string[] } => {
    const opening = openings.get(via)
    if (opening === undefined) return { clear: null, narrowedBy: [] }
    const wall = survey.plan.walls.find((w) => w.id === opening.wall)
    if (wall === undefined) return { clear: null, narrowedBy: [] }
    const d = doorwayClearance(wall, opening, obstacles)
    return { clear: d.clear, narrowedBy: d.narrowedBy }
  }
  const measure = (rooms: readonly string[], vias: readonly string[], into: readonly string[]): Way => {
    const wayRooms = rooms.map((room, i) => through(room, i === 0 ? null : vias[i - 1]!, i < vias.length ? vias[i]! : null))
    const steps = vias.map((via, i): WayStep => {
      const d = doorway(via)
      return { via, type: openings.get(via)?.type ?? 'open side', into: into[i]!, clear: d.clear, narrowedBy: d.narrowedBy }
    })
    const all = [...wayRooms.map((r) => r.width), ...steps.filter((s) => s.type !== 'open side').map((s) => s.clear)]
    const width = all.some((w) => w === null) ? null : Math.min(...(all as number[]))
    const length = walkedLength(survey, rooms, vias, goal === OUTSIDE)?.length ?? null
    return { rooms: wayRooms, steps, width, length }
  }
  const wide = (w: number | null): boolean => w !== null && w + tolerance('joint') >= width

  // A body this wide is followed on its floor only: the stairs' widths are not measured here.
  const base = routeBetween(survey, from, to, false, {}, onto === COMMON_PARTS)
  if (base === null) return null
  const shortest = measure(base.rooms, base.steps.map((s) => s.via), base.steps.map((s) => s.into))
  const narrower = [
    ...shortest.rooms.filter((r) => !wide(r.width)).map((r) => ({ kind: 'room' as const, id: r.room, width: r.width })),
    ...shortest.steps.filter((s) => s.type !== 'open side' && !wide(s.clear)).map((s) => ({ kind: 'doorway' as const, id: s.via, width: s.clear })),
  ]
  if (narrower.length === 0) return { from, to, width, through: true, way: shortest, shortest, narrower }
  // ARE-70: a way out onto the common parts ends there, as the route it widens does.
  const ends = new Map<string, Array<{ room: string; via: string }>>()
  if (base.onto === COMMON_PARTS) for (const w of common) ends.set(w.room, [...(ends.get(w.room) ?? []), { room: OUTSIDE, via: w.via }])

  // Another way: the fewest rooms, every room and doorway on it at least `width`.
  interface State { readonly room: string; readonly via: string | null; readonly back: State | null }
  const queue: State[] = [{ room: from, via: null, back: null }]
  const seen = new Set([`${from}|`])
  let end: { state: State; via: string } | null = null
  while (queue.length > 0 && end === null) {
    const state = queue.shift()!
    for (const step of [...(next.get(state.room) ?? []), ...(ends.get(state.room) ?? [])]) {
      if (step.via === state.via) continue
      const gate = doorway(step.via)
      if (openings.has(step.via) && !wide(gate.clear)) continue
      if (!wide(through(state.room, state.via, step.via).width)) continue
      if (step.room === goal) {
        if (goal === OUTSIDE || wide(through(step.room, step.via, null).width)) {
          end = { state, via: step.via }
          break
        }
        continue
      }
      if (step.room === OUTSIDE) continue
      const key = `${step.room}|${step.via}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ room: step.room, via: step.via, back: state })
    }
  }
  if (end === null) return { from, to, width, through: false, way: null, shortest, narrower }
  const rooms: string[] = []
  const vias: string[] = [end.via]
  for (let s: State | null = end.state; s !== null; s = s.back) {
    rooms.unshift(s.room)
    if (s.via !== null) vias.unshift(s.via)
  }
  const into = [...rooms.slice(1), goal === OUTSIDE ? (base.onto ?? 'outside') : goal]
  if (goal !== OUTSIDE) rooms.push(goal)
  return { from, to, width, through: true, way: measure(rooms, vias, into), shortest, narrower }
}

/** The lines of a wide route's answer. */
export function wideRouteLines(survey: Survey, route: WideRoute, figure: Figure, L: Length): string[] {
  const { items } = fixturesOf(survey)
  const name = (id: string): string => (id === 'outside' ? 'outside' : id === COMMON_PARTS ? say('en', 'route.commonParts') : q(roomCalledById(survey, id)))
  const body = `a body or trolley ${L(route.width)} wide (${figure.from === 'person' ? 'the width you gave' : 'Grid\'s own indicator'})`
  const stepsText = (way: Way): string => way.steps.map((s) => `${s.type} ${q(s.via)}${s.clear === null ? '' : ` (${L(s.clear)} clear)`} into ${name(s.into)}`).join(', then ')
  const roomsText = (way: Way): string =>
    way.rooms
      .map((r) => {
        if (r.width === null) return `${name(r.room)} no way through clear of its fixtures`
        if (r.atDoorway) return `${name(r.room)} no narrower than its doorways`
        return `${name(r.room)} ${L(r.width)} at its narrowest${r.at ? `, at ${at(r.at)}` : ''}${r.beside ? besideText({ beside: r.beside }, items) : ''}`
      })
      .join('; ')
  const lines: string[] = []
  const head = `Indicator, ${USE_INDICATORS['use/passage-width'].name}: from ${name(route.from)} to ${name(route.to)} for ${body}`
  const shortest = route.shortest!
  if (route.narrower.length === 0) {
    lines.push(`${head}: it gets through, ${stepsText(shortest)}.`)
  } else {
    const narrow = route.narrower
      .map((n) => (n.kind === 'doorway' ? `${q(n.id)} leaves ${n.width === null ? 'no' : L(n.width)} clear` : `the way through ${name(n.id)} is ${n.width === null ? 'closed by its fixtures' : L(n.width)}`))
      .join('; ')
    lines.push(`${head}: on the way with the fewest rooms, ${stepsText(shortest)}, it does not get through: ${narrow}.`)
    lines.push(route.way === null ? `No way through the plan's doors and openings is ${L(route.width)} wide all along.` : `It gets through another way: ${stepsText(route.way)}.`)
  }
  lines.push(`Each room on the way, clear of its fixtures: ${roomsText(route.way ?? shortest)}.`)
  const walked = (route.way ?? shortest).length
  if (walked !== null) lines.push(`Walked, ${L(walked)}.`, WALKED_RULE)
  lines.push(`Door widths are what the hole in the wall leaves less ${L(limit('useOpenLeaf'))} for an open leaf, and less any fixture standing in front of it.`)
  return lines
}
