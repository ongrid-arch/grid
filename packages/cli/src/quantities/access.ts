/**
 * CNT-17 (lab EL-15, C-14, J-15): accessibility measurements, as numbers only until figures are
 * confirmed.
 *
 * The plan may mark the rooms and routes that need to be accessible (`accessible`, C14). For
 * those (or, with no mark, for every room) this lists what Grid measures on the plan: each door's
 * hole and the clear width past its open leaf, each corridor at its narrowest from end to end,
 * each room's turning space, and the way in from the entrance with every step on it and its
 * height. Where Grid cannot tell, it says so, and the answer ends with what it did not look at.
 *
 * Nothing is measured here that the library did not already measure: the doorway's clear width,
 * the way through a room and the turning space are CNT-13's (`use.ts`), the ways from room to room
 * the way-out check's (`wayGraph`), a door's sill BRF-1's step, a step between rooms LVL-7's
 * (`planSteps`), the ground LVL-4's (`groundLevel`) and the stairs and lifts that join floors
 * LVL-3's (`floorJoins`).
 *
 * A number is set against a figure only when the figure is the person's own, from the brief
 * beside the plan (BRF-1), labelled "your figure" wherever it is said, or a figure from a code
 * that a named person has confirmed against its source (`confirmedFigure`, `@ongrid/rules`). No
 * figure Grid holds is confirmed yet (COD-6), so today only the person's own are used. No line
 * says a room, a route or the plan is accessible, or that it complies.
 *
 * Pure: a survey, the person's figures and the code's in, lines and data out.
 */
import {
  type DoorJudgedBy,
  type DoorLeaf,
  type DoorwayClearance,
  floorElevations,
  floorJoins,
  groundLevel,
  limit,
  passageWidth,
  planForFloor,
  planSteps,
  roomFloorOffset,
  tolerance,
  turningSpace,
  type FloorJoin,
  type JoinKind,
  type Passage,
  type PlanStep,
  type Segment,
  type Vec2,
} from '@ongrid/floorplan/geometry'
import type { ConfirmedFigure, FigureKey } from '@ongrid/rules'
import type { FigureName, FigureWish } from '../brief/brief'
import { OUTSIDE, entryWays, wayGraph } from './measure'
import type { Survey, SurveyRoom } from './survey'
import { fixturesOf } from './use'
import { doorClearanceOf, doorLeavesSaid, doorWidthFor, DOOR_MEASURE_NAMES, type DoorMeasure } from './doorWidth'

const q = (text: string): string => JSON.stringify(text)

type Length = (metres: number) => string

/** How every comparison with the person's own figure is labelled, in the text and in the data. */
export const YOUR_FIGURE = 'your figure'

/** The first line of every answer: numbers, not a finding. */
export const ACCESS_HEAD = 'Accessibility measurements: what Grid measured on the plan, as numbers, and not a finding about any room, route or the plan.'

/** Said under every answer. */
export const ACCESS_RULE =
  'Measured on the plan between wall faces, clear of the fixtures it holds. A door\'s clear width is its hole less Grid\'s own allowance for an open leaf; a corridor is measured on a grid of points, to within a few centimetres. A number is set only against your own figures, from the brief beside the plan, and against a figure from a code only once a named person has confirmed it against its source.'

/** What the answer never looks at, said every time. */
export const NOT_LOOKED_AT: readonly string[] = [
  'the swing and weight of a door leaf, the floor beside a door\'s handle side, and its handles;',
  'any threshold, mat or edge at a door other than the sill the plan states for it, and any change of level other than the rooms\' floor offsets;',
  'ramps: a ramp the plan states between two floors is for vehicles and is not measured here, and one within a floor cannot be stated, so no slope, length or landing is measured;',
  'inside a lift: its car, its doors and its controls;',
  'fittings and furniture the plan does not hold: a WC, basin, bath, grab rail or bed is measured round only when the plan holds it as a fixture;',
  'surfaces, lighting, colour contrast, and the height of switches, sockets, handles and worktops;',
  'the way to the entrance outside the building: paths, parking and the slope of the ground;',
  'whether any number here is enough: that is for your own figures, a code\'s and the people who decide.',
]

// ---------------------------------------------------------------------------------------------
// Figures

/** The code figure each measure may be set against once a named person has confirmed it. */
export const ACCESS_CODE_FIGURES: { readonly entranceDoor: FigureKey; readonly corridor: FigureKey } = {
  // The main door out of a home, measured clear with the door open.
  entranceDoor: 'exitDoorClearWidth',
  // A hallway inside a home.
  corridor: 'routeMinWidth',
}

/** A figure a number is set against: the person's own, or a code's that a named person confirmed. */
export type AccessFigure =
  | { readonly from: 'yours'; readonly label: typeof YOUR_FIGURE; readonly figure: FigureName; readonly value: number; readonly quote: string | null }
  | { readonly from: 'code'; readonly label: string; readonly key: FigureKey; readonly value: number; readonly confirmed: ConfirmedFigure }

/** One number set against one figure. `short` is true when it falls short: under a least, or over a most (a step). */
export interface Against {
  readonly figure: AccessFigure
  readonly short: boolean
  /** ARE-27: for the person's door width, the width it was set against: clear, leaf or hole. */
  readonly measure?: DoorMeasure
}

export interface AccessFigures {
  /** The person's own, from the brief beside the plan. */
  readonly yours: readonly FigureWish[]
  /** A code figure, only when a named person has confirmed it (`confirmedFigure`); else null. */
  readonly code: (key: FigureKey) => ConfirmedFigure | null
}

function codeLabel(c: ConfirmedFigure): string {
  const cites = c.citations.map((x) => `${x.document} ${x.edition} ${x.clause}`).join(', ')
  const who = c.verifiedBy.map((v) => `${v.by} on ${v.on}`).join(' and ')
  return `${cites} (${c.jurisdiction}, read for ${c.readFor}), checked by ${who}`
}

function yoursFor(figures: AccessFigures, name: FigureName, room?: SurveyRoom): AccessFigure | null {
  const wish = figures.yours.find((w) => {
    if (w.figure !== name) return false
    if (room === undefined || w.rooms.length === 0) return true
    const said = (n: string): boolean => n.trim().toLowerCase() === room.facts.name.trim().toLowerCase() || n === room.facts.id
    return w.rooms.some(said)
  })
  return wish === undefined ? null : { from: 'yours', label: YOUR_FIGURE, figure: name, value: wish.value, quote: wish.quote }
}

/** ARE-27: the width the person's door figure is for: clear unless the brief says leaf or hole. */
function doorMeasureOf(figures: AccessFigures): DoorMeasure {
  return figures.yours.find((w) => w.figure === 'door_width')?.door ?? 'clear'
}

function codeFor(figures: AccessFigures, key: FigureKey): AccessFigure | null {
  const confirmed = figures.code(key)
  return confirmed === null ? null : { from: 'code', label: codeLabel(confirmed), key, value: confirmed.value, confirmed }
}

const near = (): number => tolerance('joint')

/** A least: short when the number is under it. */
function least(measured: number | null, figure: AccessFigure | null): Against[] {
  if (figure === null || measured === null) return []
  return [{ figure, short: measured + near() < figure.value }]
}

/** A most (a step): short when the number is over it. */
function most(measured: number | null, figure: AccessFigure | null): Against[] {
  if (figure === null || measured === null) return []
  return [{ figure, short: measured > figure.value + near() }]
}

function againstText(against: readonly Against[], L: Length, words: { short: string; enough: string }): string {
  return against
    .map((a) => {
      const whose = a.figure.from === 'yours' ? `${YOUR_FIGURE} of ${L(a.figure.value)}` : `the ${L(a.figure.value)} of ${a.figure.label}`
      // ARE-27: a door figure says which width it was set against.
      const by = a.measure === undefined ? '' : ` for its ${DOOR_MEASURE_NAMES[a.measure]}`
      return `; ${a.short ? words.short : words.enough} ${whose}${by}`
    })
    .join('')
}

const LEAST_WORDS = { short: 'under', enough: 'at least' }
const MOST_WORDS = { short: 'higher than', enough: 'no higher than' }

// ---------------------------------------------------------------------------------------------
// What is measured: the marked rooms and routes, or every room

export interface AccessRoute {
  /** A room id, or null for the entrance. */
  readonly from: string | null
  readonly to: string
}

export interface AccessScope {
  /** False when the plan marks nothing: then every room is measured, and the way in to each. */
  readonly marked: boolean
  readonly rooms: readonly string[]
  readonly routes: readonly AccessRoute[]
  /** Ids the mark names that are no room the plan can measure. */
  readonly unknown: readonly string[]
}

const measurable = (room: SurveyRoom | undefined): room is SurveyRoom => room !== undefined && room.polygon.length >= 3

export function accessScope(survey: Survey): AccessScope {
  const mark = survey.plan.accessible
  const listed = [...(mark?.rooms ?? [])]
  const routes = [...(mark?.routes ?? [])]
  if (listed.length === 0 && routes.length === 0) {
    const rooms = survey.rooms.filter((r) => measurable(r) && r.facts.zoneOf === undefined).map((r) => r.facts.id)
    return { marked: false, rooms, routes: rooms.map((to) => ({ from: null, to })), unknown: [] }
  }
  const unknown = new Set<string>()
  const known = (id: string): boolean => {
    if (measurable(survey.byId.get(id))) return true
    unknown.add(id)
    return false
  }
  const rooms = [...new Set(listed.filter(known))]
  const kept: AccessRoute[] = rooms.map((to) => ({ from: null, to }))
  for (const route of routes) {
    const ok = [route.to, ...(route.from === undefined ? [] : [route.from])].map(known).every(Boolean)
    if (ok && !kept.some((k) => k.to === route.to && k.from === (route.from ?? null))) kept.push({ from: route.from ?? null, to: route.to })
  }
  return { marked: true, rooms, routes: kept, unknown: [...unknown] }
}

// ---------------------------------------------------------------------------------------------
// The ways

/** One stretch of a way on one floor: the rooms in order, and each door or opening passed into the next. */
export interface WayLeg {
  readonly floor: string
  readonly rooms: readonly string[]
  readonly vias: readonly { readonly via: string; readonly into: string }[]
  /** True when the leg starts outside, through the entrance. */
  readonly fromOutside: boolean
}

/** A step on a way, with its height; null when Grid cannot tell the height. */
export interface WayStep {
  readonly kind: 'sill' | 'level' | 'ground' | 'stair'
  /** The door, opening, dividing line or stair it is at. */
  readonly at: string
  readonly height: number | null
  /** For a stair, how many risers; else 1. Null when Grid cannot tell. */
  readonly count: number | null
  /** Up or down, going along the way; null for a sill, which is both. */
  readonly up: boolean | null
  /** For a stair drawn as rooms on each floor, the two rooms, lower first: the plan states no stair there. */
  readonly rooms?: readonly [string, string]
}

export interface AccessWay {
  readonly from: string | null
  readonly to: string
  /** The entrance door it starts through, or null for a way from a room. */
  readonly entrance: string | null
  readonly found: boolean
  readonly legs: readonly WayLeg[]
  /** The stairs and lifts it goes between floors by. */
  readonly joins: readonly { readonly kind: JoinKind; readonly via: string; readonly from: string; readonly to: string }[]
  readonly steps: readonly WayStep[]
  /** The narrowest clear width of a door or opening on it, by id; null with none. */
  readonly narrowest: { readonly via: string; readonly clear: number } | null
  /** What Grid cannot tell about it, in words. */
  readonly cannotTell: readonly string[]
}

interface Graph {
  readonly next: Map<string, Array<{ room: string; via: string }>>
}

/** The way with the fewest rooms on one floor, from `starts` (rooms, or OUTSIDE through `doors`) to `goal`. */
function legOn(survey: Survey, graphs: Map<string, Graph>, floor: string, start: string, goal: string, doors: ReadonlySet<string> | null): WayLeg | null {
  let graph = graphs.get(floor)
  if (graph === undefined) {
    graph = { next: wayGraph(survey, floor).next }
    graphs.set(floor, graph)
  }
  const step = (room: string): Array<{ room: string; via: string }> => {
    if (room !== OUTSIDE) return (graph.next.get(room) ?? []).filter((s) => s.room !== OUTSIDE)
    const out: Array<{ room: string; via: string }> = []
    for (const e of entryWays(survey, graph.next)) if (doors === null || doors.has(e.via)) out.push({ room: e.room, via: e.via })
    return out
  }
  const back = new Map<string, { room: string; via: string }>()
  const seen = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const room = queue.shift()!
    if (room === goal) break
    for (const s of step(room)) {
      if (seen.has(s.room)) continue
      seen.add(s.room)
      back.set(s.room, { room, via: s.via })
      queue.push(s.room)
    }
  }
  if (!seen.has(goal)) return null
  const rooms: string[] = []
  const vias: { via: string; into: string }[] = []
  for (let at = goal; at !== start;) {
    const prev = back.get(at)!
    vias.unshift({ via: prev.via, into: at })
    rooms.unshift(at)
    at = prev.room
  }
  if (start !== OUTSIDE) rooms.unshift(start)
  return { floor, rooms, vias, fromOutside: start === OUTSIDE }
}

/** The entrance: the front door the plan names when it leads outside, else every door out of the ground floor. */
export interface Entrance {
  readonly floor: string
  readonly doors: readonly string[]
  readonly front: boolean
}

export function entranceOf(survey: Survey): Entrance | null {
  // ARE-36: a way in through an outdoor space that reaches outside is the entrance, before a door straight out.
  const exitsOn = (floor: string): string[] => {
    const entries = entryWays(survey, wayGraph(survey, floor).next)
    const through = entries.filter((e) => e.through !== null)
    return [...new Set((through.length > 0 ? through : entries).map((e) => e.via))]
  }
  const front = survey.plan.front?.opening
  if (front !== undefined) {
    const floor = survey.facts.openings.get(front)?.floor
    if (floor !== undefined && exitsOn(floor).includes(front)) return { floor, doors: [front], front: true }
  }
  for (const floor of groundLevel(survey.plan).groundFloors) {
    const doors = exitsOn(floor.id)
    if (doors.length > 0) return { floor: floor.id, doors, front: false }
  }
  return null
}

/** The floors to go through from `from` to `to`, by the joins given: the fewest joins. */
function floorPath(joins: readonly FloorJoin[], from: string, to: string): FloorJoin[] | null {
  const back = new Map<string, FloorJoin>()
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const floor = queue.shift()!
    if (floor === to) break
    for (const join of joins) {
      const [a, b] = [join.lower.floor, join.upper.floor]
      const other = a === floor ? b : b === floor ? a : null
      if (other === null || seen.has(other)) continue
      seen.add(other)
      back.set(other, join)
      queue.push(other)
    }
  }
  if (!seen.has(to)) return null
  const path: FloorJoin[] = []
  for (let at = to; at !== from;) {
    const join = back.get(at)!
    path.unshift(join)
    at = join.lower.floor === at ? join.upper.floor : join.lower.floor
  }
  return path
}

interface WayContext {
  readonly survey: Survey
  readonly graphs: Map<string, Graph>
  readonly entrance: Entrance | null
  readonly joins: ReturnType<typeof floorJoins>
  readonly steps: Map<string, PlanStep[]>
  readonly ground: ReturnType<typeof groundLevel>
  readonly clear: (via: string) => number | null
}

function stepsOnFloor(c: WayContext, floor: string): PlanStep[] {
  let found = c.steps.get(floor)
  if (found === undefined) {
    found = planSteps(planForFloor(c.survey.plan, floor))
    c.steps.set(floor, found)
  }
  return found
}

function wayTo(c: WayContext, route: AccessRoute): AccessWay {
  const { survey } = c
  const target = survey.byId.get(route.to)!
  const startRoom = route.from === null ? null : survey.byId.get(route.from)!
  const startFloor = startRoom === null ? c.entrance?.floor : startRoom.facts.floor
  const none = (why: string): AccessWay => ({ from: route.from, to: route.to, entrance: null, found: false, legs: [], joins: [], steps: [], narrowest: null, cannotTell: [why] })
  if (startFloor === undefined) return none('Grid found no door to the outside on the ground floor, so it cannot tell the way in.')

  // Between floors: by lifts alone if they reach, else by any stair or lift.
  let path: FloorJoin[] | null = []
  if (startFloor !== target.facts.floor) {
    path = floorPath(c.joins.joins.filter((j) => j.kind === 'lift'), startFloor, target.facts.floor) ?? floorPath(c.joins.joins, startFloor, target.facts.floor)
    if (path === null) return none(`No stair or lift that Grid can see joins ${q(floorName(survey, startFloor))} to ${q(floorName(survey, target.facts.floor))}, so it cannot tell the way to ${q(target.facts.name)}.`)
  }
  const legs: WayLeg[] = []
  let floor = startFloor
  let start = startRoom === null ? OUTSIDE : startRoom.facts.id
  for (let i = 0; i <= path.length; i++) {
    const join = path[i]
    const goal = join === undefined ? target.facts.id : join.lower.floor === floor ? join.lower.room : join.upper.room
    const leg = legOn(survey, c.graphs, floor, start, goal, start === OUTSIDE ? new Set(c.entrance!.doors) : null)
    if (leg === null) {
      const where = start === OUTSIDE ? 'the entrance' : q(survey.byId.get(start)?.facts.name ?? start)
      return { ...none(`There is no way from ${where} to ${q(survey.byId.get(goal)?.facts.name ?? goal)} through the plan's doors and openings.`), legs }
    }
    legs.push(leg)
    if (join === undefined) break
    const arrive = join.lower.floor === floor ? join.upper : join.lower
    floor = arrive.floor
    start = arrive.room
  }

  // The steps: each sill, each change of level between rooms, the ground outside, each stair.
  const steps: WayStep[] = []
  const cannotTell: string[] = []
  const same = tolerance('sameFloorLevel')
  const offsetOf = (id: string): number => {
    const room = survey.plan.rooms.find((r) => r.id === id)
    return room === undefined ? 0 : roomFloorOffset(room)
  }
  legs.forEach((leg, li) => {
    leg.vias.forEach((v, vi) => {
      const facts = survey.facts.openings.get(v.via)
      if (leg.fromOutside && vi === 0) {
        const above = (c.ground.above.get(leg.floor) ?? 0) + offsetOf(v.into)
        if (!c.ground.stated) cannotTell.push(`whether there is a step between the ground outside and the floor inside ${facts?.type ?? 'door'} ${q(v.via)}: the plan states no ground level for the site (site.ground)`)
        else if (Math.abs(above) > same) steps.push({ kind: 'ground', at: v.via, height: Math.abs(above), count: 1, up: above > 0 })
      }
      if (facts !== undefined && facts.type !== 'window' && facts.sill > same) steps.push({ kind: 'sill', at: v.via, height: facts.sill, count: 1, up: null })
      if (!(leg.fromOutside && vi === 0)) {
        const fromRoom = vi === 0 ? leg.rooms[0]! : leg.vias[vi - 1]!.into
        const step = stepsOnFloor(c, leg.floor).find((s) => (s.openingId ?? s.wallId) === v.via && [s.upper, s.lower].includes(fromRoom) && [s.upper, s.lower].includes(v.into))
        if (step !== undefined) steps.push({ kind: 'level', at: v.via, height: step.rise, count: 1, up: step.upper === v.into })
      }
    })
    const join = path![li]
    if (join === undefined) return
    if (join.kind === 'lift') return
    const goingUp = join.lower.floor === leg.floor
    if (join.kind === 'stair') {
      const stair = c.joins.stairs.find((s) => s.id === join.via)
      steps.push({ kind: 'stair', at: join.via, height: stair?.riserHeight ?? null, count: stair?.risers ?? null, up: goingUp })
    } else {
      // A stair drawn as a room on each floor: Grid sees that it climbs, not how.
      steps.push({ kind: 'stair', at: join.via, height: null, count: null, up: goingUp, rooms: [join.lower.room, join.upper.room] })
    }
  })
  let narrowest: AccessWay['narrowest'] = null
  for (const leg of legs) {
    for (const v of leg.vias) {
      const clear = c.clear(v.via)
      if (clear !== null && (narrowest === null || clear < narrowest.clear)) narrowest = { via: v.via, clear }
    }
  }
  const joins = path.map((j) => ({ kind: j.kind, via: j.via, from: j.lower.floor, to: j.upper.floor }))
  return { from: route.from, to: route.to, entrance: startRoom === null ? (legs[0]?.vias[0]?.via ?? null) : null, found: true, legs, joins, steps, narrowest, cannotTell }
}

function floorName(survey: Survey, floor: string): string {
  return survey.facts.floors.find((f) => f.id === floor)?.name ?? floor
}

// ---------------------------------------------------------------------------------------------
// The measures

export interface AccessDoor {
  readonly id: string
  readonly type: 'door' | 'opening'
  readonly floor: string
  /** The rooms on each side, by id, or `outside`. */
  readonly between: readonly [string, string]
  readonly hole: number
  readonly leaf: number
  /** The clear width past the open leaf and any fixture in front of it (CNT-13's `doorwayClearance`). */
  readonly clear: number
  /** ARE-27: each leaf with its own clear width, and what `clear` is the width of. */
  readonly leaves: readonly DoorLeaf[]
  readonly judgedBy: DoorJudgedBy
  /** The sill above the floor: a step at the door when more than 0. */
  readonly sill: number
  readonly entrance: boolean
  readonly against: readonly Against[]
}

export interface AccessCorridor {
  readonly room: string
  /** The narrowest point of the way along it from end to end; null when Grid finds no two ends. */
  readonly narrowest: number | null
  readonly at: Vec2 | null
  /** The widest circle it holds, said when no two ends are found. */
  readonly widest: number
  readonly against: readonly Against[]
}

export interface AccessTurning {
  readonly room: string
  readonly diameter: number
  readonly at: Vec2
  readonly against: readonly Against[]
}

export interface AccessData {
  readonly marked: boolean
  readonly rooms: readonly string[]
  readonly routes: readonly AccessRoute[]
  readonly unknown: readonly string[]
  readonly entrance: Entrance | null
  readonly doors: readonly AccessDoor[]
  readonly corridors: readonly AccessCorridor[]
  readonly turning: readonly AccessTurning[]
  readonly ways: readonly AccessWay[]
  /** The figures the numbers were set against: the person's own, and the code's a named person confirmed. */
  readonly figures: { readonly yours: readonly { readonly figure: FigureName; readonly value: number; readonly label: typeof YOUR_FIGURE }[]; readonly code: readonly { readonly key: FigureKey; readonly value: number; readonly label: string }[] }
  readonly notLookedAt: readonly string[]
}

export interface AccessAnswer {
  readonly lines: readonly string[]
  readonly data: AccessData
}

/**
 * The sides of an outline that could end a corridor (ARE-25): its straight runs, pieces in one
 * line joined, that turn into the room at both their corners by at least `corridorEndTurn`. A
 * jog in a side (one corner in, one out) and the straight pieces a curve is drawn with (each
 * turning by no more than `arcStep`) are never an end.
 */
function endSides(polygon: readonly Vec2[]): Segment[] {
  const n = polygon.length
  if (n < 3) return []
  const dirOf = (a: Vec2, b: Vec2): Vec2 => ({ x: b.x - a.x, y: b.y - a.y })
  const cross = (u: Vec2, v: Vec2): number => u.x * v.y - u.y * v.x
  const dot = (u: Vec2, v: Vec2): number => u.x * v.x + u.y * v.y
  // The corners: the points where the outline turns, not those where two pieces run on in one line.
  const corners: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const before = polygon[(i + n - 1) % n]!
    const here = polygon[i]!
    const after = polygon[(i + 1) % n]!
    const u = dirOf(before, here)
    const v = dirOf(here, after)
    const lu = Math.hypot(u.x, u.y)
    const lv = Math.hypot(v.x, v.y)
    if (lu <= tolerance('noLength') || lv <= tolerance('noLength')) continue
    if (Math.abs(cross(u, v)) / (lu * lv) < tolerance('parallel') && dot(u, v) > 0) continue
    corners.push(here)
  }
  const m = corners.length
  if (m < 3) return []
  let area = 0
  for (let i = 0; i < m; i++) area += cross(corners[i]!, corners[(i + 1) % m]!)
  const inward = Math.sign(area)
  const turn = (u: Vec2, v: Vec2): number => inward * Math.atan2(cross(u, v), dot(u, v))
  // The outline beside a side is read a quarter of the side's length away from its corner, so a
  // sliver where two faces meet does not turn it the wrong way.
  const away = (from: number, by: 1 | -1, reach: number): Vec2 => {
    const corner = corners[from]!
    for (let k = 1; k < m; k++) {
      const p = corners[(from + by * k + m * k) % m]!
      if (Math.hypot(p.x - corner.x, p.y - corner.y) >= reach) return p
    }
    return corners[(from + by + m) % m]!
  }
  const ends: Segment[] = []
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m
    const [b, c] = [corners[i]!, corners[j]!]
    const side = dirOf(b, c)
    const reach = Math.hypot(side.x, side.y) / 4
    if (turn(dirOf(away(i, -1, reach), b), side) >= tolerance('corridorEndTurn') && turn(side, dirOf(c, away(j, 1, reach))) >= tolerance('corridorEndTurn')) ends.push([b, c])
  }
  return ends
}

/**
 * The way along a corridor from end to end: its two ends are the sides of its outline that end
 * it (`endSides`) no wider than it, farthest apart, and the way is CNT-13's `passageWidth` between
 * them, on a grid `corridorRasterAcross` steps across the corridor and taken true to the walls
 * (ARE-25); null when Grid finds no two ends. With the widest circle the corridor holds, never
 * narrower than the way. COD-8's firm standards read a corridor's width by it too.
 */
export function corridorEnds(room: SurveyRoom, obstacles: ReturnType<ReturnType<typeof fixturesOf>['obstacles']>): { way: Passage | null; widest: number } {
  const widest = turningSpace(room.polygon, room.holes, obstacles).diameter
  const reach = widest + 2 * tolerance('useRaster') + tolerance('lengthEqual')
  const sideLength = ([a, b]: Segment): number => Math.hypot(b.x - a.x, b.y - a.y)
  const caps = endSides(room.polygon).filter((e) => sideLength(e) <= reach)
  const mid = ([a, b]: Segment): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  let best: { a: Segment; b: Segment; d: number } | null = null
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      const [m, n] = [mid(caps[i]!), mid(caps[j]!)]
      const d = Math.hypot(m.x - n.x, m.y - n.y)
      if (best === null || d > best.d) best = { a: caps[i]!, b: caps[j]!, d }
    }
  }
  if (best === null || best.d <= widest) return { way: null, widest }
  const step = widest / limit('corridorRasterAcross')
  const way = passageWidth(room.polygon, room.holes, obstacles, best.a, best.b, { step })
  // The body at the narrowest point is a circle the corridor holds, so the widest circle is never
  // narrower than it: the widest is found to a thousandth of the room's length, the way to the walls.
  return { way, widest: way === null ? widest : Math.max(widest, way.width) }
}

/** The narrowest point of a corridor from end to end (`corridorEnds`). */
function corridorNarrowest(room: SurveyRoom, obstacles: ReturnType<ReturnType<typeof fixturesOf>['obstacles']>): { narrowest: number | null; at: Vec2 | null; widest: number } {
  const { way, widest } = corridorEnds(room, obstacles)
  return way === null ? { narrowest: null, at: null, widest } : { narrowest: way.width, at: way.at, widest }
}

/**
 * A corridor's narrowest point from end to end, clear of the fixtures on its floor: the figure
 * `grid_measure what=access` gives and the brief's `corridor_width` is judged by (ARE-17).
 * `narrowest` is null when Grid finds no two ends; `widest` is then the figure to fall back on.
 */
export function corridorNarrowestOf(survey: Survey, room: SurveyRoom): { narrowest: number | null; at: Vec2 | null; widest: number } {
  return corridorNarrowest(room, fixturesOf(survey).obstacles(room.facts.floor))
}

const at = (p: Vec2): string => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`

/** The text cap on each list; the data holds every entry. */
export const ACCESS_LINES_MAX = 40

/**
 * The accessibility measurements of a plan: for the rooms and routes it marks (or every room),
 * every door's hole and clear width, each corridor's narrowest point, each room's turning space
 * and the way in from the entrance with its steps, each set against the person's own figure and
 * a code's only once confirmed.
 */
export function accessAnswer(survey: Survey, figures: AccessFigures, L: Length, brief: string | null): AccessAnswer {
  const scope = accessScope(survey)
  const { obstacles } = fixturesOf(survey)
  const entrance = entranceOf(survey)
  // ARE-27: every door read through the one rule the brief reads it by.
  const clearance = (via: string): DoorwayClearance | null => doorClearanceOf(survey, via)
  const context: WayContext = {
    survey,
    graphs: new Map(),
    entrance,
    joins: floorJoins(survey.plan),
    steps: new Map(),
    ground: groundLevel(survey.plan, floorElevations(survey.plan)),
    clear: (via) => clearance(via)?.clear ?? null,
  }
  const ways = scope.routes.map((route) => wayTo(context, route))

  // The rooms measured: the marked ones and every room on a way to them, or every room.
  const inScope = new Set(scope.rooms)
  for (const way of ways) for (const leg of way.legs) for (const room of leg.rooms) inScope.add(room)
  for (const route of scope.routes) {
    inScope.add(route.to)
    if (route.from !== null) inScope.add(route.from)
  }
  const rooms = survey.rooms.filter((r) => inScope.has(r.facts.id) && measurable(r))
  const onWays = new Set(ways.flatMap((w) => w.legs.flatMap((l) => l.vias.map((v) => v.via))))

  // Doors: every door and doorless opening of a room measured, and every one on a way.
  const doors: AccessDoor[] = []
  for (const floor of survey.facts.floors) {
    for (const opening of floor.openings) {
      if (opening.type === 'window') continue
      const sides = opening.sides.map((s) => (typeof s === 'object' ? s.room : s === 'outside' ? 'outside' : s)) as [string, string]
      if (!onWays.has(opening.id) && !sides.some((s) => inScope.has(s))) continue
      const d = clearance(opening.id)
      if (d === null) continue
      const isEntrance = entrance?.doors.includes(opening.id) === true
      // ARE-27: the person's figure against the width it is for (clear unless the brief says leaf or hole), as the brief sets it.
      const measure = doorMeasureOf(figures)
      const yours = least(doorWidthFor(d, measure), yoursFor(figures, 'door_width')).map((a) => ({ ...a, measure }))
      const against = [
        ...yours,
        ...(isEntrance ? least(d.clear, codeFor(figures, ACCESS_CODE_FIGURES.entranceDoor)) : []),
      ]
      doors.push({ id: opening.id, type: opening.type, floor: opening.floor, between: sides, hole: d.hole, leaf: d.leaf, clear: d.clear, leaves: d.leaves, judgedBy: d.judgedBy, sill: opening.sill, entrance: isEntrance, against })
    }
  }

  const corridors: AccessCorridor[] = []
  const turning: AccessTurning[] = []
  for (const room of rooms) {
    const blocks = obstacles(room.facts.floor)
    if (room.facts.use === 'corridor') {
      const found = corridorNarrowest(room, blocks)
      const against = [
        ...least(found.narrowest ?? found.widest, yoursFor(figures, 'corridor_width')),
        ...least(found.narrowest ?? found.widest, codeFor(figures, ACCESS_CODE_FIGURES.corridor)),
      ]
      corridors.push({ room: room.facts.id, ...found, against })
    }
    const circle = turningSpace(room.polygon, room.holes, blocks)
    turning.push({ room: room.facts.id, diameter: circle.diameter, at: circle.at, against: least(circle.diameter, yoursFor(figures, 'turning_circle', room)) })
  }

  // The words.
  const name = (id: string): string => (id === 'outside' ? 'outside' : q(survey.byId.get(id)?.facts.name ?? id))
  const lines: string[] = [ACCESS_HEAD]
  if (!scope.marked) {
    lines.push('The plan marks no room or route as needing to be accessible (accessible in the plan file), so every room is measured, and the way in to each from the entrance.')
  } else {
    const marked = [
      ...(scope.rooms.length === 0 ? [] : [`${scope.rooms.length === 1 ? 'room' : 'rooms'} ${scope.rooms.map(name).join(', ')}, with the way in to each from the entrance`]),
      ...scope.routes.filter((r) => r.from !== null).map((r) => `the route from ${name(r.from!)} to ${name(r.to)}`),
      ...scope.routes.filter((r) => r.from === null && !scope.rooms.includes(r.to)).map((r) => `the route from the entrance to ${name(r.to)}`),
    ]
    lines.push(`Marked as needing to be accessible: ${marked.join('; ') || 'nothing Grid can measure'}.`)
    if (scope.unknown.length > 0) lines.push(`The mark names ${scope.unknown.map(q).join(', ')}, which ${scope.unknown.length === 1 ? 'is no room' : 'are no rooms'} Grid can measure, so ${scope.unknown.length === 1 ? 'it is' : 'they are'} not measured.`)
  }
  const yours = figures.yours.filter((w) => w.figure !== 'ceiling_height')
  const codeUsed = [ACCESS_CODE_FIGURES.entranceDoor, ACCESS_CODE_FIGURES.corridor].map((key) => codeFor(figures, key)).filter((f): f is Extract<AccessFigure, { from: 'code' }> => f !== null)
  lines.push(
    yours.length === 0
      ? `Set against none of your own figures: ${brief === null ? 'no brief is kept beside the plan' : `the brief ${q(brief)} gives none`} (door_width, corridor_width, turning_circle, step; grid_write_brief keeps them).`
      : `Set against ${YOUR_FIGURE}s, from the brief ${q(brief ?? '')}: ${yours.map((w) => `${w.figure} ${L(w.value)}`).join(', ')}. They are yours, not a code's.`
  )
  lines.push(
    codeUsed.length === 0
      ? 'No figure from a code is used: none that Grid holds for these measures has been confirmed by a named person against its source.'
      : `Figures from a code, each confirmed by a named person: ${codeUsed.map((f) => `${L(f.value)}, ${f.label}`).join('; ')}.`
  )

  const capped = <T>(heading: string, list: readonly T[], line: (item: T) => string): void => {
    if (list.length === 0) return
    lines.push(heading)
    for (const item of list.slice(0, ACCESS_LINES_MAX)) lines.push(`  ${line(item)}`)
    if (list.length > ACCESS_LINES_MAX) lines.push(`  And ${list.length - ACCESS_LINES_MAX} more, in the data. Marking the rooms that need to be accessible measures only them and the ways to them.`)
  }
  capped(`Doors and doorless openings (${doors.length}): the hole in the wall, and the clear width past an open leaf, leaf by leaf:`, doors, (d) => {
    const leaf = d.leaf > 0 ? `${L(d.clear)} clear past the open ${d.judgedBy === 'pair' ? 'leaves' : 'leaf'}` : `${L(d.clear)} clear`
    const leaves = doorLeavesSaid(d, L)
    const sill = d.sill > tolerance('sameFloorLevel') ? `; its sill stands ${L(d.sill)} above the floor` : ''
    return `${d.type} ${q(d.id)}${d.entrance ? ' (the entrance)' : ''}, ${name(d.between[0])} to ${name(d.between[1])}: ${L(d.hole)} hole, ${leaf}${leaves === '' ? '' : ` (${leaves})`}${sill}${againstText(d.against, L, LEAST_WORDS)}.`
  })
  if (rooms.some((r) => r.facts.use === 'corridor')) {
    capped(`Corridors (${corridors.length}), at their narrowest from end to end:`, corridors, (c) =>
      c.narrowest === null
        ? `${name(c.room)}: Grid finds no two ends to measure between; the widest circle it holds is ${L(c.widest)}${againstText(c.against, L, LEAST_WORDS)}.`
        : `${name(c.room)}: ${L(c.narrowest)}, at ${at(c.at!)}${againstText(c.against, L, LEAST_WORDS)}.`
    )
  } else {
    lines.push('Corridors: no room measured is used as a corridor.')
  }
  capped(`Turning space (${turning.length}): the widest circle each room's free floor holds:`, turning, (t) => `${name(t.room)}: ${L(t.diameter)}, centred at ${at(t.at)}${againstText(t.against, L, LEAST_WORDS)}.`)

  const stepFigure = yoursFor(figures, 'step')
  const stepText = (s: WayStep): string => {
    const where = `${s.kind === 'stair' ? 'stair' : (survey.facts.openings.get(s.at)?.type ?? 'dividing line')} ${q(s.at)}`
    const against = againstText(most(s.height, stepFigure), L, MOST_WORDS)
    if (s.kind === 'sill') return `${L(s.height!)} at ${where}, its sill${against}`
    if (s.kind === 'ground') return `${L(s.height!)} ${s.up ? 'up' : 'down'} from the ground outside to the floor inside ${where}${against}`
    if (s.kind === 'level') return `${L(s.height!)} ${s.up ? 'up' : 'down'} at ${where}, between rooms at different levels${against}`
    if (s.height === null) return `the stair drawn as rooms ${s.rooms!.map(name).join(' and ')}, ${s.up ? 'up' : 'down'}: Grid cannot tell how many steps it has or how high they are, as the plan states no stair there`
    return `${s.count} risers of ${L(s.height)} ${s.up ? 'up' : 'down'} ${where}${against}`
  }
  const wayHead = entrance === null ? 'The way in from the entrance: Grid found no door to the outside on the ground floor.' : `The way in from the entrance (${entrance.doors.map((d) => `${survey.facts.openings.get(d)?.type ?? 'door'} ${q(d)}`).join(', ')}${entrance.front ? ', the front door' : ''}), and each route marked:`
  capped(wayHead, ways, (w) => {
    const head = w.from === null ? `to ${name(w.to)}` : `from ${name(w.from)} to ${name(w.to)}`
    if (!w.found) return `${head}: ${w.cannotTell[0]}`
    const joinText = (j: AccessWay['joins'][number]): string => {
      const floors = `between ${q(floorName(survey, j.from))} and ${q(floorName(survey, j.to))}`
      if (j.kind === 'stair') return `the stair ${q(j.via)} ${floors}`
      const [lower, upper] = j.via.split('|')
      return `${j.kind === 'lift' ? 'the lift' : 'the stair'} drawn as rooms ${q(lower ?? j.via)} and ${q(upper ?? j.via)}, ${floors}`
    }
    const parts: string[] = []
    w.legs.forEach((leg, i) => {
      const said = leg.vias.map((v) => `${survey.facts.openings.get(v.via)?.type ?? 'open side'} ${q(v.via)} into ${name(v.into)}`).join(', ')
      if (said !== '') parts.push(said)
      const join = w.joins[i]
      if (join !== undefined) parts.push(joinText(join))
    })
    const route = parts.join('; ') || 'already there'
    const steps = w.steps.length === 0 ? 'no step on it that the plan shows' : `${w.steps.length === 1 ? '1 step' : `${w.steps.length} steps`}: ${w.steps.map(stepText).join('; ')}`
    const lift = w.joins.some((j) => j.kind === 'lift') ? '; Grid measures no lift car or its doors' : ''
    const narrow = w.narrowest === null ? '' : `; its narrowest door or opening leaves ${L(w.narrowest.clear)} clear (${q(w.narrowest.via)})`
    const tell = w.cannotTell.filter((t) => !t.startsWith('whether there is a step between the ground')).map((t) => `; Grid cannot tell ${t}`).join('')
    return `${head}: ${route}; ${steps}${narrow}${lift}${tell}.`
  })
  const groundUnknown = [...new Set(ways.flatMap((w) => w.cannotTell.filter((t) => t.startsWith('whether there is a step between the ground'))))]
  for (const t of groundUnknown) lines.push(`Grid cannot tell ${t}.`)
  lines.push('Not looked at:', ...NOT_LOOKED_AT.map((n) => `  - ${n}`))

  return {
    lines,
    data: {
      marked: scope.marked,
      rooms: scope.rooms,
      routes: scope.routes,
      unknown: scope.unknown,
      entrance,
      doors,
      corridors,
      turning,
      ways,
      figures: {
        yours: yours.map((w) => ({ figure: w.figure, value: w.value, label: YOUR_FIGURE })),
        code: codeUsed.map((f) => ({ key: f.key, value: f.value, label: f.label })),
      },
      notLookedAt: NOT_LOOKED_AT,
    },
  }
}
