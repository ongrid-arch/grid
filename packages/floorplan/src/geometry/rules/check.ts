/**
 * Checks that a plan can be left: a way out, a door on every room, a route from every
 * room to the way out, and doors that lead somewhere: to open air, never into a courtyard closed
 * in on every side, and for a let, through the common parts, never another let (MSG-17). Checks
 * on the drawing, not on any building code.
 *
 * Pure: a plan in, plain data out. No AI, no file, no network.
 */

import type { FloorPlan } from '../plan'
import { floorOf, planFloors, planForFloor, wholePlan } from '../floors'
import { validatePlan } from '../validate'
import { floorElevations } from '../elevations'
import { groundLevel, openingsBelowGround } from '../ground'
import { limit, tolerance } from '../tolerances'
import type { BetweenLevels, ShortOf } from './graph'
import { metresText } from '../rounding'
import { LIMITS, RULES } from './catalogue'
import { floorGraph, roomOutlines } from './graph'
import type { FloorGraph } from './graph'
import { floorJoins } from '../floorJoins'
import { floorsWithNoStair } from './noStair'
import { flatOfRoom, planFlats } from '../flats'
import { indexPlan } from '../plan'
import { isOutdoor } from '../outdoor'
import type { Vec2 } from '../vec2'
import { english, name, said, withSentence, type MessageKey } from '../../messages/say'
import { messages, saids, shiftedBoxSaid, shiftedHowSaid, shiftWays } from './messages'
import { siteMeasures } from '../site'
import { boundaryEdgeSaid } from '../plot'
import type { FindingCode, HeldFinding, NotChecked, RuleFinding, RulesReport } from './types'
import type { Opening, Wall } from '../plan'
import { planRamps, type RampLayout } from '../parking'
import { wallFrameAt, wallLength } from '../wall'
import { roomWallIds } from '../plan'
import type { LeftOutPart } from '../../types/readParts'
import { damaged, doorWaitsFor, leadsWaitsFor, planDamage, routeWaitsFor, type DrawnFloor, type FloorDamage } from './held'
import { GENERAL_GUIDANCE_LABEL, RULES_REPORT_SCHEMA_VERSION } from './types'

/** Whether the middle of an opening lies within a ramp's width of the foot of a ramp on its floor. */
function atRampFoot(floor: string, wall: Wall | undefined, opening: Opening | undefined, ramps: readonly RampLayout[]): boolean {
  if (wall === undefined || opening === undefined) return false
  try {
    const at = wallFrameAt(wall, Math.min(opening.offset + opening.width / 2, wallLength(wall))).point
    return ramps.some((ramp) => ramp.lower.floor === floor && Math.hypot(at.x - ramp.lower.at.x, at.y - ramp.lower.at.y) <= ramp.width)
  } catch {
    return false
  }
}

const RULE_OF: Record<FindingCode, string> = {
  no_exit: 'floor-has-exit',
  // LVL-14: a floor above the ground nothing joins to the ground floor has no way out either.
  no_stair: 'floor-has-exit',
  room_without_door: 'room-has-door',
  no_route_to_exit: 'room-reaches-exit',
  door_to_undrawn_space: 'door-leads-somewhere',
  door_to_outside_above_ground: 'door-leads-somewhere',
  // CNT-6: a door into another home leads nowhere a route may go; a home's front door is its way out.
  door_between_homes: 'door-leads-somewhere',
  flat_without_front_door: 'room-reaches-exit',
  stair_out_of_line: 'stairs-line-up',
  lift_out_of_line: 'stairs-line-up',
  stair_shifted: 'stairs-line-up',
  lift_shifted: 'stairs-line-up',
  opening_too_small_to_pass: 'room-has-door',
  // MSG-17: a way out leads to open air, and a let is left through common parts.
  door_into_closed_court: 'door-leads-somewhere',
  // LVL-17: a door onto a floor much higher than its own leads nowhere a person can walk.
  door_between_levels: 'door-leads-somewhere',
  let_through_another_let: 'room-reaches-exit',
  opening_below_ground: 'openings-above-ground',
  setback_short: 'site-boundary',
  over_boundary: 'site-boundary'
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** One floor as the routes read it. */
interface FloorRoutes {
  readonly id: string
  readonly name: string
  readonly graph: FloorGraph
  /** Its doors to the outside count as ways out: it does not stand above the ground (LVL-1). */
  readonly exitsCount: boolean
}

const finding = (
  code: FindingCode,
  floor: string,
  rooms: string[],
  message: string,
  openings: string[] = []
): RuleFinding => ({ code, ruleId: RULE_OF[code], floor, rooms, openings, message })

/** A room on a floor: ids repeat from floor to floor in some plans, so routes go by both. */
interface Place {
  readonly floor: string
  readonly room: string
}

/** The key a route knows a room by: its floor, then its id. */
const at = (floor: string, room: string): string => `${floor}\u0000${room}`

/** A stair between two rooms of different floors (LVL-3), and what joins them. */
interface StairLink {
  readonly ends: readonly [Place, Place]
  readonly via: string
}

/**
 * What every floor says on its own: doors into floor nobody drew, and rooms with nothing to go
 * through at all. `joined` are the rooms a stair joins to another floor, by `at` (LVL-3): a
 * stair is a way through, so a room it leaves from is not a room without a door.
 */
function floorFindings(
  floor: FloorRoutes,
  joined: ReadonlySet<string>,
  roomName: (id: string) => string,
  loneRoomReached: boolean,
  /** Rooms marked as a void (LVL-4): no room to stand in, so they need no door and no route; and outdoor spaces (CNT-7). */
  voids: ReadonlySet<string>,
  /** The floor's openings, by id: a way through that is none of them is an open side (CNT-6). */
  openings: ReadonlySet<string>
): { findings: RuleFinding[]; doorless: string[] } {
  const { graph } = floor
  const findings: RuleFinding[] = []
  // A door with nothing drawn behind it: probably a corridor or a stair nobody drew. It
  // is said, never guessed at, and never an exit. On every floor (MSG-14): a door into
  // floor nobody drew is as worth a look upstairs as on the ground.
  for (const { room, opening } of graph.undrawn) {
    findings.push(finding('door_to_undrawn_space', floor.id, [room], messages.doorToUndrawnSpace(roomName(room)), [opening]))
  }
  // CNT-6 (lab EL-4): a door cut through to another home is said, and is never a route. Each room
  // of the pair is named, so the line is found from either home.
  for (const { rooms: [a, b], via } of graph.betweenHomes) {
    const open = !openings.has(via)
    const sentence = saids.betweenHomes(roomName(a), roomName(b), open)
    findings.push(withSentence(finding('door_between_homes', floor.id, [a, b], english(sentence), [via]), sentence))
  }
  for (const { room, opening } of graph.intoNeighbour) {
    const sentence = saids.betweenHomes(roomName(room), null, false)
    findings.push(withSentence(finding('door_between_homes', floor.id, [room], english(sentence), [opening]), sentence))
  }
  // A room with nothing to go through at all. The most specific finding it can get.
  const touched = new Set<string>([
    ...graph.links.flatMap((l) => l.rooms),
    ...graph.exits.map((e) => e.room),
    ...graph.undrawn.map((u) => u.room),
    // CNT-6: a door onto the common parts, an open edge, or one cut through to another home.
    ...graph.common.map((u) => u.room),
    ...graph.intoNeighbour.map((u) => u.room),
    ...graph.openEdges.map((e) => e.room),
    ...graph.betweenHomes.flatMap((l) => l.rooms),
    ...graph.closedCourts.map((u) => u.room),
    // LVL-17: a room whose only door meets a floor much higher has a door, and no route through it.
    ...graph.betweenLevels.flatMap((b) => [b.lower, b.upper]),
    ...graph.rooms.filter((room) => joined.has(at(floor.id, room)))
  ])
  // A floor that is one open room and that no stair joins is reached by a stair the plan does
  // not draw: it is not a room without a door.
  const loneRoom = loneRoomReached && graph.rooms.length === 1
  const doorless = loneRoom ? [] : graph.rooms.filter((room) => !touched.has(room) && !voids.has(room))
  for (const room of doorless) {
    findings.push(finding('room_without_door', floor.id, [room], messages.roomWithoutDoor(roomName(room))))
  }
  // A void is left out of the routes as a room without a door is: nothing there to get out of.
  return { findings, doorless: [...doorless, ...graph.rooms.filter((room) => voids.has(room))] }
}

/**
 * The routes of floors joined by stairs, as one: from every way out of the floors that do not
 * stand above the ground, up and down the stairs, to every room. `stairs` are the joins
 * between rooms of these floors, and `doorless` the rooms already said to have no door, by
 * `at`. A room no route reaches is said, with every way through it.
 */
function routeFindings(
  floors: readonly FloorRoutes[],
  stairs: readonly StairLink[],
  doorless: ReadonlySet<string>,
  /** The floors the way out is checked from: the ground floors among them. */
  ground: readonly FloorRoutes[],
  roomName: (id: string) => string
): { findings: RuleFinding[]; wayOutNotDrawn: boolean } {
  const findings: RuleFinding[] = []
  const starts = (pick: (f: FloorRoutes) => readonly { readonly room: string }[]): string[] =>
    floors.flatMap((f) => pick(f).map((e) => at(f.id, e.room)))
  const exits = starts((f) => (f.exitsCount ? f.graph.exits : []))
  // CNT-6: every way on the plan does not draw: a door into a space not drawn, a door onto the
  // common parts, an open edge onto them or into floor no room claims.
  const undrawn = starts(onward)
  if (floors.every((f) => f.graph.rooms.length === 0)) return { findings, wayOutNotDrawn: false }
  // A flat drawn on its own leaves through its entrance, into a landing nobody drew. That door
  // is already reported, and whether it is a way out cannot be told. The rooms that reach no
  // such door, nor any exit, are still said (MSG-14, lab CH-7): they are cut off either way.
  const wayOutNotDrawn = exits.length === 0 && undrawn.length > 0
  if (exits.length === 0 && !wayOutNotDrawn) {
    // No exit: one finding for each ground floor, not one per room.
    for (const floor of ground) findings.push(finding('no_exit', floor.id, [], messages.noExit(floor.name)))
    return { findings, wayOutNotDrawn: false }
  }

  // Every way through, on a floor or up and down a stair (LVL-3), by the rooms it joins.
  const links: { ends: readonly [Place, Place]; via: string }[] = [
    ...floors.flatMap((f) =>
      f.graph.links.map((l) => ({ ends: [{ floor: f.id, room: l.rooms[0] }, { floor: f.id, room: l.rooms[1] }] as const, via: l.via }))
    ),
    ...stairs
  ]
  const neighbours = new Map<string, string[]>()
  for (const { ends: [a, b] } of links) {
    const ka = at(a.floor, a.room)
    const kb = at(b.floor, b.room)
    neighbours.set(ka, [...(neighbours.get(ka) ?? []), kb])
    neighbours.set(kb, [...(neighbours.get(kb) ?? []), ka])
  }
  // Breadth-first from every exit at once, or, when the way out is not drawn, from every door
  // into a space not drawn.
  const reached = new Set(wayOutNotDrawn ? undrawn : exits)
  const queue = [...reached]
  while (queue.length > 0) {
    for (const next of neighbours.get(queue.shift()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  for (const floor of floors) {
    for (const room of floor.graph.rooms) {
      const key = at(floor.id, room)
      if (reached.has(key) || doorless.has(key)) continue
      // Where its ways through lead, so the warning can say "its only door opens into the bathroom".
      const through = links
        .flatMap(({ ends: [a, b], via }) =>
          at(a.floor, a.room) === key ? [{ room: b.room, via }] : at(b.floor, b.room) === key ? [{ room: a.room, via }] : []
        )
        .sort((a, b) => byText(a.room, b.room) || byText(a.via, b.via))
      const message = wayOutNotDrawn ? messages.noRouteToAnyDoorOut(roomName(room)) : messages.noRoute(roomName(room))
      findings.push({ ...finding('no_route_to_exit', floor.id, [room], message), through })
    }
  }
  return { findings, wayOutNotDrawn }
}

/**
 * CNT-6 (C23): the ways on from a floor that the plan does not draw, as `{ room, opening }`: doors
 * into a space not drawn, doors onto the common parts, and open edges onto them or into floor no
 * room claims. An open edge to the outside is an exit; one to a neighbour leads nowhere.
 */
function onward(floor: FloorRoutes): { readonly room: string; readonly opening: string }[] {
  const { graph } = floor
  const edges = graph.openEdges.filter((e) => e.beyond === 'common' || e.beyond === 'undrawn').map((e) => ({ room: e.room, opening: e.edge }))
  return [...graph.undrawn, ...graph.common, ...edges]
}

/** CNT-6: whether every way on from these floors is onto the building's common parts. */
const throughCommonParts = (floor: FloorRoutes): boolean =>
  floor.graph.undrawn.length === 0 && !floor.graph.openEdges.some((e) => e.beyond === 'undrawn')

/**
 * CNT-6 (lab R-10): every flat (CNT-4) has a front door: a way through from one of its rooms to a
 * room in no flat, up or down a stair to one, onto the common parts or into a space the plan does
 * not draw, or a door to the outside on a floor at the ground. A flat with a room that could not be
 * drawn is not asked: its front door may be on that room.
 */
function frontDoorFindings(
  plan: FloorPlan,
  floors: readonly { readonly id: string }[],
  routes: ReadonlyMap<string, FloorRoutes>,
  stairs: readonly StairLink[],
  leftOutOn: ReadonlyMap<string, ReadonlySet<string>>,
  aboveGround: (floor: string) => boolean
): RuleFinding[] {
  const flats = planFlats(plan)
  if (flats.length === 0) return []
  const flatOf = flatOfRoom(flats)
  const entered = new Set<string>()
  const mark = (room: string): void => {
    const flat = flatOf.get(room)
    if (flat !== undefined) entered.add(flat)
  }
  const across = (a: string, b: string): void => {
    if (flatOf.get(a) === flatOf.get(b)) return
    mark(a)
    mark(b)
  }
  for (const floor of floors) {
    const graph = routes.get(floor.id)?.graph
    if (graph === undefined) continue
    for (const { rooms: [a, b] } of graph.links) across(a, b)
    if (!aboveGround(floor.id)) for (const { room } of graph.exits) mark(room)
    for (const { room } of [...graph.undrawn, ...graph.common]) mark(room)
    for (const { room, beyond } of graph.openEdges) if (beyond === 'common' || beyond === 'undrawn') mark(room)
  }
  for (const { ends: [a, b] } of stairs) across(a.room, b.room)
  return flats.flatMap((flat) => {
    if (flat.rooms.length === 0 || entered.has(flat.id)) return []
    if (flat.rooms.some((room) => leftOutOn.get(room.floor)?.has(room.id) === true)) return []
    const floor = flat.floors[0] ?? flat.rooms[0]!.floor
    const sentence = saids.flatWithoutFrontDoor(flat.name)
    return [withSentence({ ...finding('flat_without_front_door', floor, flat.rooms.map((room) => room.id), english(sentence)), flat: flat.id }, sentence)]
  })
}

/**
 * MSG-17: the plan's lets, each a group of rooms someone holds as their own, by `at`. A flat
 * (CNT-4) is a let; so is each room marked `private` (CNT-5) in no flat, when the plan marks some
 * room `common` or `shared` (a house of rooms to let, student rooms, a hotel): without common
 * parts, the private rooms are one household's. A private bathroom, toilet, store or utility in no
 * flat is no let of its own (an en-suite), and no other let passes through it either (`closed`).
 */
interface Lets {
  readonly of: ReadonlyMap<string, string>
  readonly lets: ReadonlyMap<string, { readonly name: string; readonly flat: string | null; readonly rooms: readonly Place[] }>
  readonly closed: ReadonlySet<string>
}

const SERVICE_USES: ReadonlySet<string> = new Set(['bathroom', 'toilet', 'storage', 'utility'])

function planLets(plan: FloorPlan): Lets {
  const of = new Map<string, string>()
  const lets = new Map<string, { name: string; flat: string | null; rooms: Place[] }>()
  const closed = new Set<string>()
  for (const flat of planFlats(plan)) {
    const key = `flat\u0000${flat.id}`
    const rooms = flat.rooms.map((room) => ({ floor: room.floor, room: room.id }))
    lets.set(key, { name: flat.name, flat: flat.id, rooms })
    for (const room of rooms) of.set(at(room.floor, room.room), key)
  }
  const shared = plan.rooms.some((room) => room.tenure === 'common' || room.tenure === 'shared')
  if (shared) {
    for (const room of plan.rooms) {
      const key = at(floorOf(room), room.id)
      if (room.tenure !== 'private' || of.has(key) || room.void === true || isOutdoor(room)) continue
      if (room.use !== undefined && SERVICE_USES.has(room.use)) {
        closed.add(key)
        continue
      }
      const id = `room\u0000${key}`
      lets.set(id, { name: room.name || room.id, flat: null, rooms: [{ floor: floorOf(room), room: room.id }] })
      of.set(key, id)
    }
  }
  return { of, lets, closed }
}

/**
 * MSG-17 (lab AB-1): each let of these floors that a route reaches, but only through a room
 * another let holds (or a private room no let may pass, `closed`). A let a route cannot reach at
 * all is already said (`no_route_to_exit`, `flat_without_front_door`). The way out is followed up
 * and down the stairs (LVL-3), from the same doors as the routes.
 */
function letFindings(
  floors: readonly FloorRoutes[],
  stairs: readonly StairLink[],
  lets: Lets,
  roomName: (id: string) => string
): RuleFinding[] {
  if (lets.lets.size === 0) return []
  const starts = (pick: (f: FloorRoutes) => readonly { readonly room: string }[]): string[] =>
    floors.flatMap((f) => pick(f).map((e) => at(f.id, e.room)))
  const exits = starts((f) => (f.exitsCount ? f.graph.exits : []))
  const goals = new Set(exits.length > 0 ? exits : starts(onward))
  if (goals.size === 0) return []
  const neighbours = new Map<string, string[]>()
  const join = (a: string, b: string): void => {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  for (const f of floors) for (const l of f.graph.links) join(at(f.id, l.rooms[0]), at(f.id, l.rooms[1]))
  for (const { ends: [a, b] } of stairs) join(at(a.floor, a.room), at(b.floor, b.room))
  const onFloors = new Set(floors.map((f) => f.id))
  // Breadth-first from a let's rooms, through the rooms `may` allows, to the nearest goal.
  const nearest = (from: readonly string[], may: (key: string) => boolean): string[] | null => {
    const back = new Map<string, string | null>(from.map((key) => [key, null] as const))
    const queue = [...from]
    while (queue.length > 0) {
      const here = queue.shift()!
      if (goals.has(here)) {
        const path: string[] = []
        for (let step: string | null = here; step !== null; step = back.get(step) ?? null) path.unshift(step)
        return path
      }
      for (const next of neighbours.get(here) ?? []) {
        if (back.has(next) || !may(next)) continue
        back.set(next, here)
        queue.push(next)
      }
    }
    return null
  }
  const findings: RuleFinding[] = []
  for (const [id, lot] of lets.lets) {
    const own = lot.rooms.filter((r) => onFloors.has(r.floor)).map((r) => at(r.floor, r.room))
    // A let on floors of another group is checked with that group; one split across groups is not asked.
    if (own.length === 0 || own.length < lot.rooms.length) continue
    const free = (key: string): boolean => lets.of.get(key) === id || (!lets.of.has(key) && !lets.closed.has(key))
    if (nearest(own, free) !== null) continue
    const any = nearest(own, () => true)
    if (any === null) continue
    const through = any.filter((key) => lets.of.get(key) !== id && (lets.of.has(key) || lets.closed.has(key)))
    const roomOf = (key: string): string => key.slice(key.indexOf('\u0000') + 1)
    const throughRooms = [...new Set(through.map(roomOf))]
    const ownRooms = lot.rooms.map((r) => r.room)
    const sentence = saids.letThroughAnotherLet(lot.name, throughRooms.map(roomName), lot.flat !== null)
    findings.push(
      withSentence(
        {
          ...finding('let_through_another_let', lot.rooms[0]!.floor, [...ownRooms, ...throughRooms.filter((r) => !ownRooms.includes(r))], english(sentence)),
          ...(lot.flat === null ? {} : { flat: lot.flat }),
          lets: { own: ownRooms, through: throughRooms }
        },
        sentence
      )
    )
  }
  return findings
}

/** The finding for a door or doorless opening no person fits through (MSG-18). */
function tooSmallFinding(
  opening: Opening,
  rooms: readonly string[],
  short: ShortOf,
  floor: string,
  roomName: (id: string) => string
): RuleFinding {
  const key = short === 'width' ? 'passableWidth' : short === 'height' ? 'passableHeight' : 'passableSill'
  const passable = limit(key)
  const value = short === 'width' ? opening.width : short === 'height' ? opening.height : opening.sill
  const size = metresText(value, 2, passable)
  const kind = opening.type === 'door' ? 'door' : 'opening'
  return {
    code: 'opening_too_small_to_pass',
    ruleId: RULE_OF.opening_too_small_to_pass,
    floor,
    rooms: [...rooms],
    openings: [opening.id],
    message: messages.openingTooSmall(roomName(rooms[0]!)),
    passage: { kind, short, drawn: Number(size), passable }
  }
}

/** LVL-17: the finding for a door or doorless opening between floors further apart than a step. */
function betweenLevelsFinding(opening: Opening, levels: BetweenLevels, floor: string, roomName: (id: string) => string): RuleFinding {
  const step = limit('passableRise')
  const rise = metresText(levels.rise, 2, step)
  const kind = opening.type === 'door' ? 'door' : 'opening'
  const sentence = saids.doorBetweenLevels(kind, roomName(levels.lower), metresText(levels.lowerAt), roomName(levels.upper), metresText(levels.upperAt), rise)
  return withSentence(
    {
      ...finding('door_between_levels', floor, [levels.lower, levels.upper], english(sentence), [opening.id]),
      levels: { lower: { room: levels.lower, at: Number(metresText(levels.lowerAt)) }, upper: { room: levels.upper, at: Number(metresText(levels.upperAt)) }, rise: Number(rise) }
    },
    sentence
  )
}

/**
 * The storey without the walls and openings validation rejects, and the rooms it
 * rejects (including those resting on a rejected wall), which stay in the plan so
 * a door beside them is not read as leading nowhere.
 *
 * Exported for checks built on top of this one, so they read a floor the same way.
 */
export function drawable(storey: FloorPlan): {
  storey: FloorPlan
  leftOut: { rooms: Set<string>; openings: Set<string> }
} {
  const { broken } = validatePlan(storey, undefined, { spaces: false })
  const rooms = new Set(storey.rooms.filter((r) => broken.has(r.id)).map((r) => r.id))
  const openings = new Set(
    storey.openings.filter((o) => broken.has(o.id) || broken.has(o.wall)).map((o) => o.id)
  )
  return {
    storey: {
      ...storey,
      walls: storey.walls.filter((w) => !broken.has(w.id)),
      openings: storey.openings.filter((o) => !openings.has(o.id))
    },
    leftOut: { rooms, openings }
  }
}

export interface SanityOptions {
  /**
   * MSG-5: the walls, rooms and openings the reader left out of the plan (`readPlanParts`). A
   * note that rests on one is held back, as one on a part the drawing check leaves out is.
   */
  readonly leftOut?: readonly LeftOutPart[]
}

/**
 * The floors' "could not be drawn" notices (MSG-5): one for each floor where something could not
 * be drawn, naming it, with the findings held back because they rest on it. A finding is held on
 * its own floor's notice, or, for a route followed down a stair, on the first floor of its group
 * where something could not be drawn.
 */
export function cannotBeDrawnNotices(
  floors: readonly { readonly id: string }[],
  damage: ReadonlyMap<string, FloorDamage>,
  held: readonly (HeldFinding<RuleFinding> & { readonly on: string })[],
  floorName: (id: string) => string,
  roomName: (id: string) => string,
  openingKind: (id: string) => 'door' | 'window' | 'opening' | undefined = () => undefined
): NotChecked[] {
  return floors.flatMap((floor) => {
    const at = damage.get(floor.id)
    if (!damaged(at)) return []
    const mine = held.filter((h) => h.on === floor.id).map(({ finding, waitsFor }) => ({ finding, waitsFor }))
    // LVL-5 (lab A-16): each opening by what it is, so a window is never called a door.
    const kinds = at.openings.map(openingKind)
    const known = kinds.every((k) => k !== undefined) ? (kinds as ('door' | 'window' | 'opening')[]) : undefined
    return [
      {
        reason: 'cannot_be_drawn' as const,
        floor: floor.id,
        rooms: at.rooms,
        openings: at.openings,
        message: messages.cannotBeDrawn(floorName(floor.id), at.rooms.map(roomName), at.openings, known),
        ...(mine.length > 0 ? { held: mine } : {}),
        ...(at.rooms.length === 0 && known !== undefined && known.length > 0 ? { openingKinds: known } : {})
      }
    ]
  })
}

/**
 * The plan checks alone: a way out, a door on every room, a route to the way out, and doors
 * that lead somewhere. Not the full check: `checkLocalRules` in `@ongrid/rules` runs these and
 * the figure checks, and `inspectPlan` there gives everything in one record (MSG-1). The two
 * no longer share a name, so importing the wrong one does not compile.
 */
export function checkPlanSanity(plan: FloorPlan, options: SanityOptions = {}): RulesReport {
  const floors = planFloors(plan)
  const level = new Map(floors.map((f) => [f.id, f.level] as const))
  const names = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const roomName = (id: string): string => names.get(id) ?? id
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const floorName = (id: string): string => floorNames.get(id) ?? id

  // The way out is checked from the ground floor: the floor at level 0, or the only floor there
  // is, unless it stands above the ground (LVL-1, lab VE-8: a flat whose only floor is the
  // third). With the site's ground level stated (LVL-4, lab VE-7), the floor nearest the ground,
  // and a floor stands above the ground by its height over that level. A floor a stair joins to
  // it, directly or through other floors, is checked with it, its routes followed down the stair
  // to a door (LVL-3, lab VE-1). Any other floor is said to be unchecked, never passed: a balcony
  // door upstairs is not a way out.
  const elevations = floorElevations(plan)
  const site = groundLevel(plan, elevations)
  const standsAt = (id: string): number => site.above.get(id) ?? 0
  const aboveGround = site.aboveGround
  const ground = site.groundFloors
  const groundIds = new Set(ground.map((f) => f.id))
  const openingIds = new Set(plan.openings.map((o) => o.id))

  const findings: RuleFinding[] = []
  const notChecked: NotChecked[] = []
  const routes = new Map<string, FloorRoutes>()
  const outlines = new Map<string, Map<string, readonly Vec2[]>>()
  const leftOutOn = new Map<string, ReadonlySet<string>>()
  const drawnFloors = new Map<string, DrawnFloor>()
  for (const floor of floors) {
    const drawn = drawable(planForFloor(plan, floor.id))
    drawnFloors.set(floor.id, drawn)
    const { storey, leftOut } = drawn
    const index = indexPlan(storey)
    const graph = floorGraph(storey, leftOut.rooms)
    routes.set(floor.id, { id: floor.id, name: floorName(floor.id), graph, exitsCount: !aboveGround(floor.id) })
    // A door no person fits through (MSG-18), on every floor: it is why a room may have no door.
    const openingsById = new Map(storey.openings.map((o) => [o.id, o] as const))
    for (const { opening, rooms, short } of graph.tooSmall) {
      const drawn = openingsById.get(opening)
      if (drawn === undefined) continue
      findings.push(tooSmallFinding(drawn, rooms, short, floor.id, roomName))
    }
    // LVL-17: a door between floors further apart than a step, on every floor: named with both levels.
    for (const levels of graph.betweenLevels) {
      const drawn = openingsById.get(levels.opening)
      if (drawn === undefined) continue
      findings.push(betweenLevelsFinding(drawn, levels, floor.id, roomName))
    }
    outlines.set(floor.id, new Map([...roomOutlines(storey, index, leftOut.rooms)].map(([id, o]) => [id, o.polygon] as const)))
    leftOutOn.set(floor.id, leftOut.rooms)
  }
  // MSG-5: what could not be drawn, floor by floor, with what the reader left out.
  const damage = planDamage(plan, drawnFloors, options.leftOut)

  // The floors' joins: stairs the plan states, and stair rooms one over the other. A lift is
  // lined up, never taken as a way out.
  const joins = floorJoins(plan, outlines, (slice) => leftOutOn.get(wholePlan(slice).floor ?? '') ?? new Set())
  const stairLinks: StairLink[] = joins.joins
    .filter((j) => j.kind !== 'lift')
    .map((j) => ({ ends: [j.lower, j.upper] as const, via: j.via }))
  const joined = new Set(stairLinks.flatMap((l) => l.ends.map((e) => at(e.floor, e.room))))

  // Floors joined by stairs, as groups: each group is checked as one if it holds a ground floor.
  const group = new Map(floors.map((f) => [f.id, f.id] as const))
  const find = (id: string): string => {
    let at = id
    while (group.get(at) !== at) at = group.get(at)!
    return at
  }
  for (const { ends: [a, b] } of stairLinks) group.set(find(a.floor), find(b.floor))
  const checkedGroups = new Set([...groundIds].map(find))

  const doorless = new Set<string>()
  for (const floor of floors) {
    const checked = checkedGroups.has(find(floor.id))
    // CNT-7 (C26): an outdoor space is the outside to the building: it needs no door and no route
    // of its own, as a void needs none, though a route may pass through it.
    const voids = new Set(planForFloor(plan, floor.id).rooms.filter((room) => room.void === true || isOutdoor(room)).map((room) => room.id))
    const own = floorFindings(routes.get(floor.id)!, joined, roomName, !checked, voids, openingIds)
    findings.push(...own.findings)
    for (const room of own.doorless) doorless.add(at(floor.id, room))
  }
  findings.push(...frontDoorFindings(plan, floors, routes, stairLinks, leftOutOn, aboveGround))
  const lets = planLets(plan)
  for (const root of checkedGroups) {
    const members = floors.filter((f) => find(f.id) === root).map((f) => routes.get(f.id)!)
    const memberIds = new Set(members.map((m) => m.id))
    const found = routeFindings(
      members,
      stairLinks.filter((l) => memberIds.has(l.ends[0].floor)),
      doorless,
      members.filter((m) => groundIds.has(m.id)),
      roomName
    )
    findings.push(...found.findings)
    // MSG-17 (lab CH-6): a door onto a courtyard closed in on every side leads to no open air. It
    // is said where it is why there is no way out; beside a front door it is a courtyard door.
    if (!members.some((m) => m.exitsCount && m.graph.exits.length > 0)) {
      for (const member of members) {
        for (const { room, opening } of member.graph.closedCourts) {
          findings.push(finding('door_into_closed_court', member.id, [room], messages.doorIntoClosedCourt(roomName(room)), [opening]))
        }
      }
    }
    findings.push(...letFindings(members, stairLinks.filter((l) => memberIds.has(l.ends[0].floor)), lets, roomName))
    if (found.wayOutNotDrawn) {
      for (const member of members) {
        const ways = onward(member)
        if (!groundIds.has(member.id) || ways.length === 0) continue
        // CNT-6 (lab R-10): a floor whose ways on are all onto the common parts, as a flat entered
        // from a landing is, says so, and never that its door leads to a space not drawn.
        const common = throughCommonParts(member)
        notChecked.push({
          reason: common ? 'way_out_through_common_parts' : 'way_out_not_drawn',
          floor: member.id,
          rooms: [],
          openings: [...new Set(ways.map((u) => u.opening))].sort(byText),
          message: common ? messages.wayOutThroughCommonParts(member.name) : messages.wayOutNotDrawn(member.name)
        })
      }
    }
  }

  const noStair = new Map(floorsWithNoStair(plan).map((f) => [f.floor, f.from] as const))
  for (const floor of floors) {
    const graph = routes.get(floor.id)!.graph
    // A door to the outside in mid-air (lab VE-8): said, and never a way out. Open sides of a
    // virtual wall are left alone: they edge a terrace or a stand, not a door.
    if (aboveGround(floor.id)) {
      const height = metresText(standsAt(floor.id))
      for (const { room, opening } of graph.exits) {
        if (!openingIds.has(opening)) continue
        // CNT-6: a floor above the ground only by what it states lies below it has no height to say.
        if (!(standsAt(floor.id) > limit('outsideDoorAboveGround'))) {
          const sentence = said('check.doorOutAboveGround.below', { room: name(roomName(room)) })
          findings.push(withSentence({ code: 'door_to_outside_above_ground', ruleId: RULE_OF.door_to_outside_above_ground, floor: floor.id, rooms: [room], openings: [opening], message: english(sentence) } as RuleFinding, sentence))
          continue
        }
        findings.push({
          code: 'door_to_outside_above_ground',
          ruleId: RULE_OF.door_to_outside_above_ground,
          floor: floor.id,
          rooms: [room],
          openings: [opening],
          message: messages.doorOutAboveGround(roomName(room), height),
          elevation: Number(height)
        })
      }
    }
    // LVL-14: a floor above the ground with no stair or lift room and no stated stair to it is a
    // finding of its own. Its way out is still not followed, so the notice below stays.
    const stairFrom = noStair.get(floor.id)
    if (stairFrom !== undefined && !checkedGroups.has(find(floor.id))) {
      findings.push({ ...finding('no_stair', floor.id, [], messages.noStair(floorName(floor.id))), stairFrom })
    }
    if (!checkedGroups.has(find(floor.id)) && graph.rooms.length > 0) {
      notChecked.push({
        reason: 'no_stairs',
        floor: floor.id,
        rooms: [],
        openings: [],
        message: messages.noStairs(floorName(floor.id))
      })
    }
  }

  // Doors and windows in outside walls below the ground the site states (LVL-4, lab VE-7).
  const ramps = planRamps(plan).ramps
  const wallsById = new Map(plan.walls.map((w) => [w.id, w] as const))
  const openingsById = new Map(plan.openings.map((o) => [o.id, o] as const))
  const roomsById = new Map(plan.rooms.map((r) => [r.id, r] as const))
  for (const below of openingsBelowGround(plan, elevations)) {
    // ARE-37: ground dug away in front of the opening is what a light well, an area or a cutting
    // is for. A drawn outdoor space whose floor stands at or under the opening's foot, or the foot
    // of a ramp, leaves it out; one whose floor stands above the foot is named instead.
    const base = elevations.floors.get(below.floor)?.floorLevel ?? 0
    const foot = base + (openingsById.get(below.opening)?.sill ?? 0)
    const outside = below.rooms.flatMap((id) => {
      const r = roomsById.get(id)
      return r !== undefined && isOutdoor(r) ? [r] : []
    })
    const dug = outside.some((r) => base + (r.floorOffset ?? 0) - foot <= tolerance('openingBelowGround'))
    if (dug || atRampFoot(below.floor, wallsById.get(below.wall), openingsById.get(below.opening), ramps)) continue
    const shallow = outside[0]
    const room = below.rooms.find((id) => !isOutdoor(roomsById.get(id) ?? { outdoor: undefined })) ?? below.rooms[0]
    const depth = below.wholly ? below.topBelow : below.sillBelow
    const sentence = saids.belowGround(below.type, room === undefined ? null : roomName(room), below.wall, below.wholly, metresText(depth), shallow === undefined ? undefined : roomName(shallow.id))
    findings.push(
      withSentence(
        {
          code: 'opening_below_ground',
          ruleId: RULE_OF.opening_below_ground,
          floor: below.floor,
          rooms: [...below.rooms],
          openings: [below.opening],
          message: english(sentence),
          belowGround: { foot: Number(metresText(below.sillBelow)), top: Number(metresText(below.topBelow)), wholly: below.wholly }
        } as const,
        sentence
      )
    )
  }

  // The building against its plot (BRF-3, lab EL-16): over an edge of the boundary, or nearer an
  // edge than the set-back the person asked for. Their figures, never a code's: a distance that
  // keeps to one is not said to be enough, it is only not named.
  if (plan.site?.boundary !== undefined) {
    const site = siteMeasures(plan)
    // A boundary that crosses itself is the drawing check's to name (`plan/boundary-crosses`).
    if (site.boundary !== null && site.boundary.problem === null && site.footprint === null) {
      // MSG-11: one wording per reason, the reason's own sentence after the colon.
      const why = site.whySaid ?? null
      const sentence = why === null ? said('check.boundaryNotMeasured.none') : said(why.key.replace('check.siteWhy.', 'check.boundaryNotMeasured.') as MessageKey, why.values)
      notChecked.push(withSentence({ reason: 'boundary_not_measured', floor: '', rooms: [], openings: [], message: english(sentence) } as const, sentence))
    }
    for (const at of site.edges) {
      if (at.past === 0 && at.short === null) continue
      const { edge } = at
      const asked = edge.setback
      const boundary = {
        edge: edge.edge,
        faces: edge.faces,
        street: edge.street,
        name: edge.name,
        distance: Number(metresText(at.distance, 3)),
        past: Number(metresText(at.past, 3)),
        asked: asked === null ? null : { distance: asked.distance, from: asked.from, source: asked.source },
        northStated: site.boundary!.northStated
      }
      const named = boundaryEdgeSaid(site.boundary!.edges, edge)
      const sentence =
        at.past > 0
          ? saids.overBoundary(metresText(at.past), named)
          : saids.setbackShort(metresText(at.distance, 2, asked!.distance), named, metresText(asked!.distance), asked!.source)
      findings.push(withSentence({ ...finding(at.past > 0 ? 'over_boundary' : 'setback_short', at.floor, [], english(sentence)), boundary }, sentence))
    }
  }

  // Stair rooms, or lift shafts, that do not line up from one floor to the next (LVL-3, AU2).
  for (const out of joins.outOfLine) {
    const upperFloor = out.upper[0]!.floor
    const lowerFloors = [...new Set(out.lower.map((r) => r.floor))]
    const upperFloors = [...new Set(out.upper.map((r) => r.floor))]
    const code = out.kind === 'stair' ? 'stair_out_of_line' : 'lift_out_of_line'
    const sentence = saids.outOfLine(
      out.kind,
      out.upper.map((r) => roomName(r.room)),
      upperFloors.map(floorName),
      out.lower.map((r) => roomName(r.room)),
      lowerFloors.map(floorName)
    )
    findings.push(withSentence(finding(code, upperFloor, [...out.upper.map((r) => r.room), ...out.lower.map((r) => r.room)], english(sentence)), sentence))
  }

  // LVL-5 (lab WR-9): stair rooms, or lift shafts, that join the one below but are moved from it.
  for (const moved of joins.shifted) {
    const code = moved.kind === 'stair' ? 'stair_shifted' : 'lift_shifted'
    // MSG-11: how far and which way, and where each stands, by key (`check.shifted.*`). A shaft
    // that is not moved as a whole: the sides that stand off the shaft's below.
    const how = shiftedHowSaid(shiftWays({ east: moved.by.x, north: moved.by.y, sides: moved.sides }, 2))
    const pair = (b: { readonly min: Vec2; readonly max: Vec2 }) => ({ min: [b.min.x, b.min.y] as const, max: [b.max.x, b.max.y] as const })
    const sentence = saids.shifted(
      moved.kind,
      roomName(moved.upper.room),
      floorName(moved.upper.floor),
      roomName(moved.lower.room),
      floorName(moved.lower.floor),
      how,
      shiftedBoxSaid(moved.upperBox),
      shiftedBoxSaid(moved.lowerBox)
    )
    findings.push(withSentence({
      ...finding(code, moved.upper.floor, [moved.upper.room, moved.lower.room], english(sentence)),
      shift: {
        east: Number(metresText(moved.by.x, 3)),
        north: Number(metresText(moved.by.y, 3)),
        sides: moved.sides.map((s) => ({ side: s.side, by: Number(metresText(s.by, 3)) })),
        upper: pair(moved.upperBox),
        lower: pair(moved.lowerBox)
      }
    }, sentence))
  }

  // MSG-5 (lab MS-4, W-6): a note that rests on a part that could not be drawn is held back, and
  // the floor's notice names the part and keeps the note.
  const rooms = new Map(plan.rooms.map((room) => [at(floorOf(room), room.id), room] as const))
  const openingWall = new Map(plan.openings.map((o) => [o.id, o.wall] as const))
  const groupOf = (id: string): string[] => floors.filter((f) => find(f.id) === find(id)).map((f) => f.id)
  const held: (HeldFinding<RuleFinding> & { on: string })[] = []
  const given = findings.filter((found) => {
    let waitsFor: string[] = []
    let on = found.floor
    const room = rooms.get(at(found.floor, found.rooms[0] ?? ''))
    switch (found.code) {
      case 'no_exit':
      case 'no_route_to_exit': {
        const group = groupOf(found.floor)
        waitsFor = routeWaitsFor(group.map((id) => damage.get(id)))
        on = damaged(damage.get(found.floor)) ? found.floor : group.find((id) => damaged(damage.get(id))) ?? found.floor
        break
      }
      case 'room_without_door':
        waitsFor = room === undefined ? [] : doorWaitsFor(roomWallIds(room), damage.get(found.floor))
        break
      case 'door_to_undrawn_space':
        waitsFor = leadsWaitsFor(openingWall.get(found.openings[0] ?? ''), damage.get(found.floor))
        break
      // MSG-17: a gate out of the courtyard, or a room beside it, may be what could not be drawn.
      case 'door_into_closed_court':
        waitsFor = routeWaitsFor([damage.get(found.floor)])
        break
      case 'let_through_another_let': {
        const group = groupOf(found.floor)
        waitsFor = routeWaitsFor(group.map((id) => damage.get(id)))
        on = damaged(damage.get(found.floor)) ? found.floor : group.find((id) => damaged(damage.get(id))) ?? found.floor
        break
      }
      default:
        break
    }
    if (waitsFor.length === 0) return true
    held.push({ finding: found, waitsFor, on })
    return false
  })
  const openingTypes = new Map(plan.openings.map((o) => [o.id, o.type] as const))
  notChecked.unshift(...cannotBeDrawnNotices(floors, damage, held, floorName, roomName, (id) => openingTypes.get(id)))

  return {
    schemaVersion: RULES_REPORT_SCHEMA_VERSION,
    basis: 'general-baseline',
    label: GENERAL_GUIDANCE_LABEL,
    rules: RULES,
    findings: given.sort(
      (a, b) =>
        (level.get(a.floor) ?? 0) - (level.get(b.floor) ?? 0) ||
        byText(a.floor, b.floor) ||
        byText(a.code, b.code) ||
        byText(a.rooms.join(','), b.rooms.join(',')) ||
        byText(a.openings.join(','), b.openings.join(','))
    ),
    notChecked,
    limits: LIMITS
  }
}
