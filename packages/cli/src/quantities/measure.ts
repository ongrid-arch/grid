/**
 * Measuring in a person's terms: a room's sizes, height and the widest circle it holds, whether
 * a box or a circle fits in it, the way from one room to another with the doors it passes, what
 * is narrower than a figure the person gives, a wall's lengths, and the clear distance between
 * two things (ARE-10).
 *
 * Every answer measures the empty room between its wall faces: the plan holds no furniture,
 * fixtures, radiators or door leaves, and says so.
 */
import { outdoorIds } from '@ongrid/floorplan/geometry/outdoor'
import {
  cross,
  dot,
  floorJoins,
  floorOf,
  groundLevel,
  indexPlan,
  planFloors,
  wholePlan,
  floorRoofShape,
  fromTuple,
  itemFootprint,
  planForFloor,
  pointAlong,
  poleOfInaccessibility,
  roomHeadroom,
  risesToRoof,
  wallTopProfile,
  roomWallIds,
  spotsInside,
  sub,
  tolerance,
  curveFault,
  wallAxis,
  wallLength,
  wallSlicePolygon,
  type FloorPlan,
  type Item,
  type Opening,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { checkPlanSanity, drawable } from '@ongrid/floorplan/geometry/rules/check'
import { floorGraph, roomOutlines, type BlockedBy } from '@ongrid/floorplan/geometry/rules/graph'
import { compassOf, type Compass } from '../describe/facts'
import { ringSides, type RoomForm } from '../describe/sides'
import { roomCalled, type Survey, type SurveyRoom } from './survey'
import { walkRoute, type EndAt, type StairPassage, type StartAt, type WalkPoint, type WalkedLeg, type WalkGap } from './walked'

export const EMPTY_ROOM_RULE =
  'Measured in the empty room between wall faces: the fixtures the plan holds, furniture, radiators, door leaves and the space a person needs round them are not taken off.'

export interface RoomSide {
  /** The way it faces out of the room; for a curve, the way its middle faces. */
  readonly facing: Compass
  /** Its length; for a curve, along the curve. */
  readonly length: number
  readonly wall: string | null
  /** CMD-49: a curved side's circle, its sweep in degrees counter-clockwise positive (360 all the way round), or null for a straight side. */
  readonly curve: { readonly centre: Vec2; readonly radius: number; readonly sweep: number } | null
}

export interface RoomMeasure {
  readonly id: string
  readonly name: string
  readonly floor: string
  readonly area: number
  readonly perimeter: number
  /** Across (x) and up (y) the drawing: its sizes when the room is a rectangle square to it. */
  readonly across: number
  readonly up: number
  readonly rectangle: boolean
  /** The widest circle that fits, and where its centre is. */
  readonly widestCircle: number
  readonly circleAt: Vec2
  readonly sides: readonly RoomSide[]
  /** CMD-49: its shape as a person names it (round, a band, turned, four-sided, with curves), or null when across and up say it. */
  readonly form: RoomForm | null
}

/**
 * CMD-49: the sides of the room's outline, then of each hole, as a person names them: the
 * pieces a curve is traced by are one curved side, split where the wall under them changes.
 */
export function sidesOf(room: SurveyRoom): RoomSide[] {
  let offset = 0
  return [room.polygon, ...room.holes].flatMap((ring) => {
    const edges = room.edges.slice(offset, offset + ring.length)
    offset += ring.length
    return ringSides(ring, (i) => edges[i]?.wall?.id ?? null).map((side) => {
      const walls = new Set(edges.slice(side.first, side.first + side.pieces).concat(side.first + side.pieces > ring.length ? edges.slice(0, side.first + side.pieces - ring.length) : []).map((edge) => edge.wall?.id ?? null))
      return {
        facing: compassOf(side.out),
        length: side.length,
        wall: walls.size === 1 ? [...walls][0]! : null,
        curve: side.curve === null ? null : { centre: side.curve.centre, radius: side.curve.radius, sweep: (side.curve.sweep * 180) / Math.PI },
      }
    })
  })
}

export function measureRoom(room: SurveyRoom): RoomMeasure {
  const pole = poleOfInaccessibility(room.polygon, undefined, room.holes)
  const shape = room.facts.shape
  const sides = sidesOf(room)
  return {
    id: room.facts.id,
    name: roomCalled(room.facts),
    floor: room.facts.floor,
    area: shape?.area ?? 0,
    perimeter: sides.reduce((sum, side) => sum + side.length, 0),
    across: shape?.across ?? 0,
    up: shape?.up ?? 0,
    rectangle: shape?.rectangle ?? false,
    widestCircle: 2 * pole.distance,
    circleAt: pole.point,
    sides,
    form: shape?.form ?? null,
  }
}

export interface FitAnswer {
  readonly fits: boolean
  readonly what: string
  /** Where its middle can go, when it fits: one spot, and how it is turned. */
  readonly at: Vec2 | null
  readonly turned: boolean
  /** For a box: the biggest square it would take, as a hint when it does not fit. */
  readonly widestCircle: number
}

/**
 * Whether a box or a circle fits in the room, and where. `clear` is the footprints it must keep
 * clear of besides the room's holes: the room's fixtures (CNT-12), which take their floor.
 */
export function fitInRoom(room: SurveyRoom, shape: { width: number; depth: number } | { diameter: number }, clear: readonly (readonly Vec2[])[] = []): FitAnswer {
  const holes = clear.length === 0 ? room.holes : [...room.holes, ...clear]
  const pole = poleOfInaccessibility(room.polygon, undefined, holes)
  if ('diameter' in shape) {
    const fits = 2 * pole.distance >= shape.diameter - tolerance('joint')
    return { fits, what: `a circle ${shape.diameter.toFixed(2)} m across`, at: fits ? pole.point : null, turned: false, widestCircle: 2 * pole.distance }
  }
  const what = `a ${shape.width.toFixed(2)} × ${shape.depth.toFixed(2)} m rectangle`
  const along = spotsInside(room.polygon, shape.width / 2, shape.depth / 2, holes)
  if (along.length > 0) return { fits: true, what, at: along[0]!, turned: false, widestCircle: 2 * pole.distance }
  const turned = spotsInside(room.polygon, shape.depth / 2, shape.width / 2, holes)
  if (turned.length > 0) return { fits: true, what, at: turned[0]!, turned: true, widestCircle: 2 * pole.distance }
  return { fits: false, what, at: null, turned: false, widestCircle: 2 * pole.distance }
}

export interface RouteStep {
  /** The opening or dividing line passed, and its width; a dividing line has none. ARE-18: or the stair taken, and its width when the plan states the stair. */
  readonly via: string
  readonly type: 'door' | 'window' | 'opening' | 'open side' | 'stair' | 'lift'
  readonly width: number | null
  readonly into: string
}

export interface Route {
  readonly from: string
  readonly to: string
  /** Rooms in order, the first and the last included. */
  readonly rooms: readonly string[]
  /** ARE-18: the floor of each room in `rooms`, in order: a route out may take the stairs. */
  readonly floors: readonly string[]
  readonly steps: readonly RouteStep[]
  /** The narrowest door or opening on the way, and the room with the narrowest widest circle. */
  readonly narrowestPassage: { readonly via: string; readonly width: number } | null
  readonly narrowestRoom: { readonly room: string; readonly widestCircle: number } | null
  /** VEW-9: how far it is walked (`WALKED_RULE`), in metres; null when a room on it has no outline. */
  readonly length: number | null
  /** Each room's share of the length, in order; the holes through the walls and the stairs are the rest. */
  readonly legs: readonly WalkedLeg[]
  /** ARE-18: along the stairs on the way, on plan, in metres; null with `length`. */
  readonly onStairs: number | null
  /** ARE-18: when `length` is null, the room it stops at and why. */
  readonly gap: WalkGap | null
  /** ARE-30: the points the route is walked from and to, on the drawing, and which kind each is; null with `length`. */
  readonly startPoint: WalkPoint | null
  readonly endPoint: WalkPoint | null
  /** ARE-21, a route to `outside` only: the way out it takes, the nearest by walked length. */
  readonly exit?: string
  /** ARE-21: the other ways out, nearest first, each with the length of its own route (null when it cannot be measured). */
  readonly otherExits?: readonly { readonly via: string; readonly type: RouteStep['type']; readonly rooms: readonly string[]; readonly length: number | null }[]
  /**
   * ARE-70, a route to `outside` only: set when it ends on the building's common parts, which the
   * plan does not draw (a flat's front door onto its landing): its last step goes `into` them.
   */
  readonly onto?: typeof COMMON_PARTS
  /**
   * ARE-78, a route between rooms on different floors only: the ways by the other stairs (or
   * lifts) off the floor it starts on, shortest walked first, each with the stair or lift it
   * leaves by and the length of its own route (null when it cannot be measured).
   */
  readonly otherWays?: readonly { readonly via: string; readonly type: RouteStep['type']; readonly rooms: readonly string[]; readonly length: number | null }[]
}

/** ARE-70: where the last step of a way out onto the common parts goes (`RouteStep.into`). */
export const COMMON_PARTS = 'common parts'

/** The way out of every room, as a step past the last room of a route to `outside`. */
export const OUTSIDE = '\u0000outside'

/**
 * The ways from room to room on one floor: for each room, the rooms (or `OUTSIDE`) a door, a
 * doorless opening or a dividing line (`via`) leads to, as the way-out check reads them.
 */
export function wayGraph(survey: Survey, floor: string): { next: Map<string, Array<{ room: string; via: string }>>; openings: Map<string, Opening>; blocked: readonly BlockedBy[]; common: ReadonlyArray<{ room: string; via: string }> } {
  const { storey, leftOut } = drawable(planForFloor(survey.plan, floor))
  const graph = floorGraph(storey, leftOut.rooms)
  const openings = new Map(storey.openings.map((o) => [o.id, o]))
  const next = new Map<string, Array<{ room: string; via: string }>>()
  const join = (a: string, b: string, via: string): void => {
    if (!next.has(a)) next.set(a, [])
    next.get(a)!.push({ room: b, via })
  }
  for (const l of graph.links) {
    join(l.rooms[0], l.rooms[1], l.via)
    join(l.rooms[1], l.rooms[0], l.via)
  }
  for (const exit of graph.exits) join(exit.room, OUTSIDE, exit.opening)
  // ARE-70: the doors and open sides onto the common parts, as the way-out check reads them: no
  // step in `next`, the way out only when no door to the open air is reached (`routeBetween`).
  const common = [...graph.common.map((c) => ({ room: c.room, via: c.opening })), ...graph.openEdges.filter((e) => e.beyond === 'common').map((e) => ({ room: e.room, via: e.edge }))]
  // ARE-46: a doorway an item leaves no clear width in is no way; it is kept to say why.
  return { next, openings, blocked: graph.blocked, common }
}

/** A door a person comes in by: into `room` from outside, straight, or `through` an outdoor space that reaches outside (ARE-36). */
export interface EntryWay {
  readonly room: string
  readonly via: string
  readonly through: string | null
}

/**
 * The doors a person comes in by on one floor, from its ways (`wayGraph`): a door from a room
 * straight to outside, and a door from a room into an outdoor space (C26) that itself reaches
 * outside, by a door or an open edge, as a terrace to the street does. A window is never one.
 */
export function entryWays(survey: Survey, next: ReadonlyMap<string, ReadonlyArray<{ room: string; via: string }>>): EntryWay[] {
  const outdoor = outdoorIds(survey.plan)
  const leads = (room: string): boolean => (next.get(room) ?? []).some((w) => w.room === OUTSIDE)
  const door = (via: string): boolean => {
    const facts = survey.facts.openings.get(via)
    return facts !== undefined && facts.type !== 'window'
  }
  const found: EntryWay[] = []
  for (const [room, ways] of next) {
    for (const w of ways) {
      if (!door(w.via)) continue
      if (w.room === OUTSIDE) found.push({ room, via: w.via, through: null })
      else if (!outdoor.has(room) && outdoor.has(w.room) && leads(w.room)) found.push({ room, via: w.via, through: w.room })
    }
  }
  return found
}

/** A place a route passes: a room on its floor, or the way out. */
interface RouteNode {
  readonly floor: string
  readonly room: string
}

/**
 * The way with the fewest rooms between two rooms of one floor, or to any way out ('outside').
 *
 * ARE-18: the way out is the way-out check's: up and down the stairs it reads (`floorJoins`: a
 * stair the plan states, stair rooms one over the other, never a lift), and out only through a
 * door or opening on a floor that does not stand above the ground (`groundLevel`). A balcony door
 * upstairs is no way out. A way between two rooms keeps to their floor, and so does the way out
 * with `acrossFloors` false: any door out of the floor, as before.
 *
 * ARE-70: when no way out is reached, a way onto the building's common parts is the way out, as
 * the check reads a flat's front door onto its landing: the route says so (`onto`). `onlyCommon`
 * looks for that way out only, so a body's way (`wideRoute`) ends where the route it widens does.
 *
 * ARE-78: a way between two rooms on different floors goes up and down the same stairs, and by a
 * lift shaft (lift rooms one over the other) only when no stair joins them. Each stair or lift
 * off the floor it starts on is tried, and the shortest walked is the answer (`otherWays`).
 */
export function routeBetween(survey: Survey, from: string, to: string, acrossFloors = true, ends: { readonly start?: StartAt; readonly end?: EndAt } = {}, onlyCommon = false): Route | null {
  const target = to === 'outside' ? undefined : survey.byId.get(to)
  if (acrossFloors && target !== undefined && target.facts.floor !== survey.byId.get(from)!.facts.floor) return routeAcrossFloors(survey, from, to, ends)
  let common = false
  let first = onlyCommon ? null : routeSearch(survey, from, to, acrossFloors, null, ends, false)
  if (first === null && to === 'outside') {
    first = routeSearch(survey, from, to, acrossFloors, null, ends, true)
    common = first !== null
  }
  if (first === null || to !== 'outside') return first
  // ARE-21: every way out the search can reach, each by the way with the fewest rooms to it; the
  // shortest walked is the answer and the others are listed, not the one met first.
  const doors = new Set<string>()
  for (const floor of planFloors(survey.plan)) {
    const graph = wayGraph(survey, floor.id)
    if (common) for (const w of graph.common) doors.add(w.via)
    else for (const ways of graph.next.values()) for (const w of ways) if (w.room === OUTSIDE) doors.add(w.via)
  }
  const routes: Route[] = []
  for (const via of [...doors].sort()) {
    const r = routeSearch(survey, from, to, acrossFloors, via, ends, common)
    if (r !== null && r.steps.at(-1)?.via === via) routes.push(r)
  }
  if (routes.length === 0) return first
  // Measured ways first, shortest first; then the fewest rooms, then the doorway's id.
  routes.sort(byWalked((r) => r.steps.at(-1)!.via))
  const [best, ...others] = routes
  return {
    ...best!,
    exit: best!.steps.at(-1)!.via,
    otherExits: others.map((r) => ({ via: r.steps.at(-1)!.via, type: r.steps.at(-1)!.type, rooms: r.rooms, length: r.length })),
  }
}

/** Measured ways first, shortest first; then the fewest rooms, then the id of the doorway or stair `last` names. */
function byWalked(last: (r: Route) => string): (a: Route, b: Route) => number {
  return (a, b) => {
    if ((a.length === null) !== (b.length === null)) return a.length === null ? 1 : -1
    if (a.length !== null && b.length !== null && Math.abs(a.length - b.length) > tolerance('noLength')) return a.length - b.length
    return a.rooms.length - b.rooms.length || (last(a) < last(b) ? -1 : last(a) > last(b) ? 1 : 0)
  }
}

/** ARE-78: the way between two rooms on different floors, by the stairs, else by the lifts too. */
function routeAcrossFloors(survey: Survey, from: string, to: string, ends: { readonly start?: StartAt; readonly end?: EndAt }): Route | null {
  const fromFloor = survey.byId.get(from)!.facts.floor
  for (const lifts of [false, true]) {
    const found = stairJoins(survey.plan, lifts)
    const off = [...new Set(found.joins.filter((j) => j.lower.floor === fromFloor || j.upper.floor === fromFloor).map((j) => j.via))].sort()
    const routes: { route: Route; via: string }[] = []
    for (const via of off) {
      const r = routeSearch(survey, from, to, true, null, ends, false, { found, onlyJoin: via, lifts })
      if (r !== null) routes.push({ route: r, via })
    }
    if (routes.length === 0) continue
    const leaves = new Map(routes.map((r) => [r.route, r.via] as const))
    const sorted = routes.map((r) => r.route).sort(byWalked((r) => leaves.get(r)!))
    const [best, ...others] = sorted
    const kindOf = (via: string): RouteStep['type'] => (found.joins.find((j) => j.via === via)?.kind === 'lift' ? 'lift' : 'stair')
    return { ...best!, otherWays: others.map((r) => ({ via: leaves.get(r)!, type: kindOf(leaves.get(r)!), rooms: r.rooms, length: r.length })) }
  }
  return null
}

/**
 * ARE-63: the floors whose way out the way-out check does not follow, because no stair joins them
 * to the ground floor: the floors of its `no_stairs` notes. A route out from one is said beside
 * them, found or not, so it never reads as the check's.
 */
export function floorsNotChecked(survey: Survey): ReadonlySet<string> {
  return new Set(checkPlanSanity(survey.plan).notChecked.filter((n) => n.reason === 'no_stairs').map((n) => n.floor))
}

/**
 * One search; `onlyExit` limits the way out to that doorway (ARE-21); `common`, the ways out are
 * onto the common parts (ARE-70). ARE-78: `across` is a way between rooms on different floors:
 * its joins (with the lifts when `lifts`), and the one stair or lift it leaves its floor by.
 */
function routeSearch(survey: Survey, from: string, to: string, acrossFloors: boolean, onlyExit: string | null, ends: { readonly start?: StartAt; readonly end?: EndAt } = {}, common = false, across: { readonly found: Joins; readonly onlyJoin: string; readonly lifts: boolean } | null = null): Route | null {
  const fromFloor = survey.byId.get(from)!.facts.floor
  const out = to === 'outside'
  const toFloor = out ? fromFloor : (survey.byId.get(to)?.facts.floor ?? fromFloor)
  const floorsToo = (out || across !== null) && acrossFloors
  const graphs = new Map<string, ReturnType<typeof wayGraph>>()
  const graphOf = (floor: string): ReturnType<typeof wayGraph> => {
    if (!graphs.has(floor)) graphs.set(floor, wayGraph(survey, floor))
    return graphs.get(floor)!
  }
  const aboveGround = out && floorsToo ? groundLevel(survey.plan).aboveGround : (): boolean => false
  const found: Joins = across !== null ? across.found : floorsToo ? stairJoins(survey.plan) : { joins: [], stairs: [] }
  const joins = found.joins
  const key = (n: RouteNode): string => `${n.floor}\u0000${n.room}`
  const OUT_KEY = OUTSIDE
  const goalKey = out ? OUT_KEY : key({ floor: toFloor, room: to })

  const back = new Map<string, { node: RouteNode; via: string; stair: boolean }>()
  const nodes = new Map<string, RouteNode>([[key({ floor: fromFloor, room: from }), { floor: fromFloor, room: from }]])
  const queue: RouteNode[] = [{ floor: fromFloor, room: from }]
  const seen = new Set([key(queue[0]!)])
  while (queue.length > 0) {
    const at = queue.shift()!
    if (key(at) === goalKey) break
    const onward: { node: RouteNode | null; via: string; stair: boolean }[] = []
    for (const step of graphOf(at.floor).next.get(at.room) ?? []) {
      if (step.room === OUTSIDE) {
        // On a floor that stands above the ground, a door out is no way out (the check's rule).
        if (out && !aboveGround(at.floor) && (onlyExit === null || step.via === onlyExit)) onward.push({ node: null, via: step.via, stair: false })
        continue
      }
      if (at.floor !== fromFloor && !floorsToo) continue
      onward.push({ node: { floor: at.floor, room: step.room }, via: step.via, stair: false })
    }
    // ARE-70: onto the common parts, on any floor: a flat's front door onto its landing.
    if (out && common) for (const step of graphOf(at.floor).common) if (step.room === at.room && (onlyExit === null || step.via === onlyExit)) onward.push({ node: null, via: step.via, stair: false })
    for (const join of joins) {
      // ARE-78: off the floor it starts on only by the stair or lift asked for.
      if (across !== null && at.floor === fromFloor && join.via !== across.onlyJoin) continue
      for (const [a, b] of [[join.lower, join.upper], [join.upper, join.lower]] as const) {
        if (a.floor === at.floor && a.room === at.room) onward.push({ node: b, via: join.via, stair: true })
      }
    }
    for (const step of onward) {
      const k = step.node === null ? OUT_KEY : key(step.node)
      if (seen.has(k)) continue
      seen.add(k)
      back.set(k, { node: at, via: step.via, stair: step.stair })
      if (step.node !== null) {
        nodes.set(k, step.node)
        queue.push(step.node)
      }
    }
  }
  if (!seen.has(goalKey)) return null

  const rooms: string[] = []
  const floors: string[] = []
  const steps: RouteStep[] = []
  const stairWidth = new Map(found.stairs.map((s) => [s.id, s.width] as const))
  const lift = new Set(found.joins.filter((j) => j.kind === 'lift').map((j) => j.via))
  for (let at = goalKey; at !== key({ floor: fromFloor, room: from });) {
    const prev = back.get(at)!
    const node = nodes.get(at)
    const opening = prev.stair ? undefined : graphOf(prev.node.floor).openings.get(prev.via)
    steps.unshift({
      via: prev.via,
      type: prev.stair ? (lift.has(prev.via) ? 'lift' : 'stair') : (opening?.type ?? 'open side'),
      width: prev.stair ? (stairWidth.get(prev.via) ?? null) : (opening?.width ?? null),
      into: node === undefined ? (common ? COMMON_PARTS : 'outside') : node.room,
    })
    if (node !== undefined) {
      rooms.unshift(node.room)
      floors.unshift(node.floor)
    }
    at = key(prev.node)
  }
  rooms.unshift(from)
  floors.unshift(fromFloor)

  let narrowestPassage: Route['narrowestPassage'] = null
  for (const step of steps) {
    if (step.type === 'stair' || step.type === 'lift') continue
    if (step.width !== null && (narrowestPassage === null || step.width < narrowestPassage.width)) narrowestPassage = { via: step.via, width: step.width }
  }
  let narrowestRoom: Route['narrowestRoom'] = null
  for (const id of rooms) {
    const room = survey.byId.get(id)
    if (room === undefined || room.polygon.length < 3) continue
    const circle = 2 * poleOfInaccessibility(room.polygon, undefined, room.holes).distance
    if (narrowestRoom === null || circle < narrowestRoom.widestCircle) narrowestRoom = { room: id, widestCircle: circle }
  }
  const passages = stairPassages(steps.filter((s) => s.type === 'stair' || s.type === 'lift').map((s) => s.via), found)
  const doorEnds = new Set(survey.plan.rooms.filter((r) => r.use === 'stair' || r.use === 'lift').map((r) => r.id))
  const walked = walkRoute(survey, rooms, steps.map((s) => s.via), out, passages, { ...ends, doorEnds })
  return {
    from,
    to,
    rooms,
    floors,
    steps,
    narrowestPassage,
    narrowestRoom,
    length: walked.walked?.length ?? null,
    legs: walked.walked?.legs ?? [],
    onStairs: walked.walked?.onStairs ?? null,
    gap: walked.gap,
    startPoint: walked.walked?.start ?? null,
    endPoint: walked.walked?.end ?? null,
    ...(common ? { onto: COMMON_PARTS } : {}),
  }
}

export type Joins = Pick<ReturnType<typeof floorJoins>, 'joins' | 'stairs'>

/**
 * The stairs between floors as the way-out check reads them: its outlines, a lift left out. ARE-63:
 * the walk reads them too. ARE-78: `lifts` keeps the lift shafts, for a way between two rooms.
 */
export function stairJoins(plan: FloorPlan, lifts = false): Joins {
  const outlines = new Map<string, Map<string, readonly Vec2[]>>()
  const leftOutOn = new Map<string, ReadonlySet<string>>()
  for (const floor of planFloors(plan)) {
    const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
    outlines.set(floor.id, new Map([...roomOutlines(storey, indexPlan(storey), leftOut.rooms)].map(([id, o]) => [id, o.polygon] as const)))
    leftOutOn.set(floor.id, leftOut.rooms)
  }
  if (outlines.size < 2) return { joins: [], stairs: [] }
  const found = floorJoins(plan, outlines, (slice) => leftOutOn.get(wholePlan(slice).floor ?? '') ?? new Set())
  return { joins: lifts ? found.joins : found.joins.filter((j) => j.kind !== 'lift'), stairs: found.stairs }
}

/** Where each stair on a route is met in the rooms at its ends, and how long it is on plan. */
function stairPassages(vias: readonly string[], { joins, stairs }: Joins): Map<string, StairPassage> {
  const passages = new Map<string, StairPassage>()
  const laid = new Map(stairs.map((s) => [s.id, s] as const))
  for (const via of vias) {
    const join = joins.find((j) => j.via === via)
    if (join === undefined) continue
    const stair = join.kind === 'stair' ? laid.get(via) : undefined
    if (stair === undefined) {
      passages.set(via, { at: new Map([[join.lower.room, null], [join.upper.room, null]]), length: 0 })
      continue
    }
    const line = stair.line
    const length = line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - line[i]!.x, p.y - line[i]!.y), 0)
    passages.set(via, { at: new Map([[join.lower.room, stair.lower.at], [join.upper.room, stair.upper.at]]), length })
  }
  return passages
}

// ---------------------------------------------------------------------------------------------
// ARE-10: lengths, distances and a room's height, measured from faces as a person measures.

export const FACES_RULE =
  'Measured between faces, as a tape would be: a wall by its faces, a door or window by the edges of its hole in the wall, a room by its inside outline. Centre lines are used only for a wall\'s own length.'

export const HEIGHT_RULE =
  'A room is as high as the plan states for it. When it states none, the room is as high as the lowest solid wall round it, since a level ceiling rests on all of them; dividing lines stand no height and are left out. Under a roof its floor states, a room that states no height is as high as the roof over it, given from its lowest to its highest.'

/** A room's height and where it comes from. */
export interface RoomHeight {
  /** In metres; null when the plan states none and no solid wall bounds the room. */
  readonly value: number | null
  /** `room`: the room states it; `walls`: its solid walls agree; `lowest wall`: they differ and the lowest wins. */
  readonly from: 'room' | 'walls' | 'lowest wall' | 'roof' | null
  /** The solid walls round the room: the lowest and highest height, and the walls at the lowest, by id. Null when there are none. */
  readonly walls: { readonly low: number; readonly high: number; readonly lowest: readonly string[] } | null
  /** LVL-6, only under a roof the floor states: the lowest and highest height over the room's floor. */
  readonly roof?: { readonly lowest: number; readonly highest: number }
}

/**
 * The rule for a room's height (ARE-10): a height the room states wins; else the lowest solid
 * wall its boundary or its holes list (ARE-6), because a level ceiling rests on every one of
 * them. A wall that states no height takes its floor's stated height (LVL-1), else the schema's
 * 2.7 m, which cannot be told from a stated 2.7 m (AU3).
 */
export function roomHeight(plan: FloorPlan, roomId: string): RoomHeight {
  const room = plan.rooms.find((r) => r.id === roomId)
  const byId = new Map(plan.walls.map((w) => [w.id, w]))
  const solid = [...new Set(room ? roomWallIds(room) : [])]
    .map((id) => byId.get(id))
    .filter((w): w is Wall => w !== undefined && w.virtual !== true && w.height > 0)
  let walls: RoomHeight['walls'] = null
  if (solid.length > 0) {
    const low = Math.min(...solid.map((w) => w.height))
    const high = Math.max(...solid.map((w) => w.height))
    walls = { low, high, lowest: solid.filter((w) => w.height - low < tolerance('joint')).map((w) => w.id) }
  }
  if (room?.height !== undefined) return { value: room.height, from: 'room', walls }
  // LVL-6: under a roof the floor states, the ceiling is the roof: the room is as high as the
  // roof over it, from its lowest to its highest, and its walls (cut to the roof) do not bound it.
  const under = room !== undefined && floorRoofShape(plan, floorOf(room)) !== null ? roomHeadroom(plan, room) : null
  if (under !== null) return { value: under.highest, from: 'roof', walls, roof: { lowest: under.lowest, highest: under.highest } }
  if (walls === null) return { value: null, from: null, walls }
  return { value: walls.low, from: walls.high - walls.low < tolerance('joint') ? 'walls' : 'lowest wall', walls }
}

/** A wall's length on its centre line, and the stretch of each room's inside outline along it. */
export interface WallLengths {
  readonly id: string
  readonly floor: string
  readonly length: number
  readonly thickness: number
  readonly height: number
  readonly virtual: boolean
  readonly faces: ReadonlyArray<{ readonly room: string; readonly name: string; readonly length: number }>
  /**
   * LVL-20: the wall's top along its length, under a roof its floor states: `roof` when the roof
   * cuts it, `raised` when, an outside wall, it rises to the roof past the height it states (`height`);
   * null when its top is level at its height.
   */
  readonly cut: 'roof' | 'raised' | null
  /** Where its top turns, in metres along it from its start, and its height there; null when it is level. */
  readonly top: ReadonlyArray<{ readonly at: number; readonly height: number }> | null
  /** Its top's lowest and highest points: both its height when it is level. */
  readonly low: number
  readonly high: number
}

export function wallLengths(survey: Survey, wall: Wall): WallLengths {
  const faces = survey.rooms
    .map((room) => ({
      room: room.facts.id,
      name: roomCalled(room.facts),
      length: room.edges.filter((edge) => edge.wall?.id === wall.id).reduce((sum, edge) => sum + edge.length, 0),
    }))
    .filter((face) => face.length > tolerance('joint'))
  const profile = wall.virtual === true ? null : wallTopProfile(survey.plan, wall)
  const heights = profile === null ? [wall.height] : profile.map((p) => p.z)
  const high = Math.max(...heights)
  const raised = profile !== null && risesToRoof(survey.plan, wall) && high > wall.height + tolerance('joint')
  return {
    id: wall.id,
    floor: floorOf(wall),
    length: lengthOf(wall),
    thickness: wall.virtual === true ? 0 : wall.thickness,
    height: wall.height,
    virtual: wall.virtual === true,
    faces,
    cut: profile === null ? null : raised ? 'raised' : 'roof',
    top: profile === null ? null : profile.map((p) => ({ at: p.u, height: p.z })),
    low: Math.min(...heights),
    high,
  }
}

/** Something to measure from: its kind, id, floor and outline in plan (a polygon, a line or a point). */
export interface Thing {
  readonly kind: 'wall' | 'opening' | 'room' | 'item' | 'point'
  readonly id: string | null
  /** Null for a free point, which takes the floor of what it is measured to. */
  readonly floor: string | null
  readonly shape: readonly Vec2[]
}

/** A wall's length along its axis: along its curve for a curved wall (CNT-18), 0 for one that cannot be built. */
function lengthOf(wall: Wall): number {
  if (wall.arc !== undefined) return curveFault(wall) === null ? wallLength(wall) : 0
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

/**
 * A wall's footprint: its faces, or its line when it is a dividing line. A curved wall's is its
 * faces along the curve (CNT-18); a curved dividing line's, the curve itself as a band of no width.
 */
function wallShape(wall: Wall, from: number, to: number): Vec2[] {
  if (wall.arc !== undefined) return wallSlicePolygon(wall.virtual === true ? { ...wall, thickness: 0 } : wall, from, to)
  const axis = wallAxis(wall)
  if (wall.virtual === true) return [pointAlong(axis, from), pointAlong(axis, to)]
  return wallSlicePolygon(wall, from, to)
}

export function wallThing(wall: Wall): Thing {
  const length = lengthOf(wall)
  const shape = length < tolerance('noLength') ? [fromTuple(wall.start)] : wallShape(wall, 0, length)
  return { kind: 'wall', id: wall.id, floor: floorOf(wall), shape }
}

/** An opening's hole through its wall: from its near edge to its far edge, face to face. */
export function openingThing(opening: Opening, wall: Wall): Thing {
  return { kind: 'opening', id: opening.id, floor: floorOf(wall), shape: wallShape(wall, opening.offset, opening.offset + opening.width) }
}

export function roomThing(room: SurveyRoom): Thing {
  return { kind: 'room', id: room.facts.id, floor: room.facts.floor, shape: room.polygon }
}

/** A fixture by its footprint (CNT-12): the gap between two fixtures is between their edges. */
export function itemThing(item: Item): Thing {
  return { kind: 'item', id: item.id, floor: floorOf(item), shape: itemFootprint(item) }
}

export function pointThing(point: Vec2): Thing {
  return { kind: 'point', id: null, floor: null, shape: [point] }
}

export interface Distance {
  /** The clear distance in metres; 0 when the two touch or overlap. */
  readonly distance: number
  /** The nearest point of each, the first thing's first. */
  readonly at: readonly [Vec2, Vec2]
  /** Which way the second is from the first on the drawing; null when they touch. */
  readonly toward: Compass | null
}

type Segment = readonly [Vec2, Vec2]

function segmentsOf(shape: readonly Vec2[]): Segment[] {
  if (shape.length === 1) return [[shape[0]!, shape[0]!]]
  if (shape.length === 2) return [[shape[0]!, shape[1]!]]
  return shape.map((p, i) => [p, shape[(i + 1) % shape.length]!] as const)
}

function nearestOnSegment(p: Vec2, [a, b]: Segment): Vec2 {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  if (span < tolerance('noLength') ** 2) return a
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return { x: a.x + ab.x * t, y: a.y + ab.y * t }
}

/** Where two segments cross, when they cross away from each other's ends. */
function crossing([a, b]: Segment, [c, d]: Segment): Vec2 | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < tolerance('noLength')) return null
  const t = cross(sub(c, a), s) / denominator
  const u = cross(sub(c, a), r) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a.x + r.x * t, y: a.y + r.y * t }
}

function holds(shape: readonly Vec2[], p: Vec2): boolean {
  if (shape.length < 3) return false
  let inside = false
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const a = shape[i]!
    const b = shape[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The clear distance between two things, outline to outline. */
export function distanceBetween(first: Thing, second: Thing): Distance {
  const touching = (p: Vec2): Distance => ({ distance: 0, at: [p, p], toward: null })
  if (holds(first.shape, second.shape[0]!)) return touching(second.shape[0]!)
  if (holds(second.shape, first.shape[0]!)) return touching(first.shape[0]!)
  let best: Distance | null = null
  for (const a of segmentsOf(first.shape)) {
    for (const b of segmentsOf(second.shape)) {
      const met = crossing(a, b)
      if (met !== null) return touching(met)
      const pairs: Array<readonly [Vec2, Vec2]> = [
        [a[0], nearestOnSegment(a[0], b)],
        [a[1], nearestOnSegment(a[1], b)],
        [nearestOnSegment(b[0], a), b[0]],
        [nearestOnSegment(b[1], a), b[1]],
      ]
      for (const [p, q] of pairs) {
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (best === null || d < best.distance) best = { distance: d, at: [p, q], toward: null }
      }
    }
  }
  const found = best!
  if (found.distance < tolerance('joint')) return touching(found.at[0])
  return { ...found, toward: compassOf(sub(found.at[1], found.at[0])) }
}

/**
 * ARE-53: the solid walls a straight measure from `from` to `to` passes through, in order along
 * it. A wall in `leave` (a thing measured, or the wall an opening stands in) is not counted, nor
 * is a dividing line, nor a wall the line crosses inside the hole of one of its openings.
 */
export function wallsCrossed(plan: FloorPlan, floor: string | null, from: Vec2, to: Vec2, leave: ReadonlySet<string>): string[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length < tolerance('joint') * 2) return []
  const along = (t: number): Vec2 => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
  const margin = tolerance('joint') / length
  const a = along(margin)
  const b = along(1 - margin)
  const found: Array<{ id: string; t: number }> = []
  for (const wall of plan.walls) {
    if (wall.virtual === true || leave.has(wall.id)) continue
    if (floor !== null && floorOf(wall) !== floor) continue
    const shape = wallThing(wall).shape
    if (shape.length < 3) continue
    const ts: number[] = []
    for (const edge of segmentsOf(shape)) {
      const met = crossing([a, b], edge)
      if (met !== null) ts.push(Math.hypot(met.x - a.x, met.y - a.y))
    }
    // A segment that starts or ends inside the wall passes through it from or to that end.
    const segment = Math.hypot(b.x - a.x, b.y - a.y)
    if (holds(shape, a)) ts.push(0)
    if (holds(shape, b)) ts.push(segment)
    if (ts.length === 0) continue
    const near = Math.min(...ts)
    const far = Math.max(...ts)
    const mid = along(margin + ((near + far) / 2 / length))
    const inHole = plan.openings.some((o) => o.wall === wall.id && holds(openingThing(o, wall).shape, mid))
    if (!inHole) found.push({ id: wall.id, t: near })
  }
  return found.sort((x, y) => x.t - y.t).map((f) => f.id)
}
