/**
 * VEW-9: the walk-through, `grid describe --length walk`, the long form of the description.
 *
 * Each floor is walked from its way in: the door the plan names as its front, else the widest
 * door from outside into a corridor, else the widest door from outside. A floor with no way in
 * from outside starts in its stair room, where the stairs arrive. From there the walk goes room
 * by room through the doors, doorless openings and open sides, as the way-out check reads them
 * (`wayGraph`): it takes the ways out of each room from left to right as you stand in its doorway,
 * goes as deep as it can, and comes back. Every way the check reads is a way on (ARE-18), an open
 * side as much as a door. A room no way reaches is said as such.
 *
 * In each room you stand in the doorway you came in by, at its middle on the room's side, facing
 * into the room square to the wall. What is in the room is said by the wall it is on: ahead, on
 * your left, on your right, and in the wall you stand in (behind you), each with how far it is.
 * A fixture is on the wall nearest its middle; one that stands clear of every wall (ARE-18: an
 * island, a table) is said where it stands, by how far ahead its near side is and whether it is
 * across your way. Where the walk starts with no doorway you stand in the room's middle, facing
 * square to the room's longest side, and the room is said by its whole depth. Left and right are the building's: when the plan
 * says its y runs down the page, the drawing is the building mirrored and they are read the
 * right way round.
 *
 * Pictures (`walkPictures.ts`) are taken at eye height from each doorway, a step into the room,
 * looking ahead, with VEW-3's eye camera.
 *
 * Nothing here checks anything. Pure: a survey in, facts out; `walkText` words them.
 */
import { dot, planOrientation, poleOfInaccessibility, sub, tolerance, type Vec2 } from '@ongrid/floorplan/geometry'
import { planFixtures } from '../quantities/fixtures'
import { OUTSIDE, entryWays, wayGraph } from '../quantities/measure'
import { crossingOf } from '../quantities/walked'
import type { Survey, SurveyRoom } from '../quantities/survey'
import { compassOf, type Compass } from './facts'
import { DEFAULT_LANGUAGE, num, say, type MessageKey, type Value, type Values } from '@ongrid/floorplan/messages'
import { PersonNames, type DescribeAudience, type Words } from './card'

const ENGLISH: Words = { language: DEFAULT_LANGUAGE, options: {} }

/** How high the eye of a walk's pictures is above the floor, as grid_view kind=eye takes it. */
export const WALK_EYE_HEIGHT = 1.6
/** The most pictures one grid_describe answer carries: a floor at a time beyond that. */
export const WALK_PICTURES_MAX = 12
/** Within this much of straight ahead (or of beside you), a thing is said to be straight there. */
const STRAIGHT = 0.3
/** ARE-18: a fixture whose footprint comes within this much of a side of its room stands against that wall; else it stands clear of them, in the room. Grid's own figure for the walk's words, not a check. */
const AGAINST_WALL = 0.3

export type WalkWall = 'ahead' | 'left' | 'right' | 'behind'
type WalkGroup = WalkWall | 'inRoom'

export interface WalkThing {
  readonly kind: 'door' | 'window' | 'opening' | 'open side' | 'fixture'
  readonly id: string
  /** An opening's width, an open side's shared stretch; a fixture's width along its back. */
  readonly width: number
  /** The room on the other side, by id, or `outside`, `nothing drawn` or `a room left out`; null for a fixture. */
  readonly to: string | null
  /** A fixture's label, else its kind in words. */
  readonly label?: string
  /** How far ahead of you its middle is, along the way you face. */
  readonly ahead: number
  /** How far to your left (+) or right (−) its middle is. */
  readonly across: number
  /** ARE-18, a fixture clear of the walls only: how far ahead its near side is (negative: behind you), and how far to your left (+) or right (−) its near side is, 0 when it is across your way. */
  readonly near?: { readonly ahead: number; readonly across: number }
}

export interface WalkStop {
  readonly room: string
  readonly floor: string
  /** Where you came from: a room id, `outside`, or null where the walk starts with no doorway. */
  readonly from: string | null
  readonly via: string | null
  readonly viaKind: WalkThing['kind'] | null
  readonly viaWidth: number | null
  /** Where you stand: the doorway's middle on the room's side, or the room's middle with no doorway. */
  readonly stand: Vec2
  /** The way you face on the drawing, and as a heading in degrees clockwise from its top. */
  readonly facing: Compass
  readonly heading: number
  /** The room as you face it: across from side to side, and deep from where you stand. */
  readonly across: number
  readonly deep: number
  readonly area: number
  /** How far the wall ahead, on your left and on your right is, straight out from where you stand. */
  readonly reach: { readonly ahead: number | null; readonly left: number | null; readonly right: number | null }
  readonly ahead: readonly WalkThing[]
  readonly left: readonly WalkThing[]
  readonly right: readonly WalkThing[]
  readonly behind: readonly WalkThing[]
  /** ARE-18: fixtures that stand clear of every wall, nearest first. */
  readonly inRoom: readonly WalkThing[]
}

export interface FloorWalk {
  readonly floor: string
  /** How the walk starts: the named front door, a door from outside, or the stair room. */
  readonly start: 'front' | 'way in' | 'stair' | 'first room' | null
  readonly stops: readonly WalkStop[]
  /** Rooms of the floor no way of the walk reaches, by id. */
  readonly notReached: readonly string[]
  /** The earlier floor this one is laid out like, when it is not walked again. */
  readonly repeats: string | null
}

export interface PlanWalk {
  readonly floors: readonly FloorWalk[]
  /** The plan says its y runs down the page: left and right are read the right way round. */
  readonly mirrored: boolean
}

const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y)
  return l < tolerance('noLength') ? { x: 0, y: 1 } : { x: v.x / l, y: v.y / l }
}
const leftOf = (f: Vec2): Vec2 => ({ x: -f.y, y: f.x })

/** How far a ray from `p` along `d` goes before it meets the room's outline or a hole. */
function rayReach(room: SurveyRoom, p: Vec2, d: Vec2): number | null {
  let best: number | null = null
  for (const ring of [room.polygon, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const e = sub(b, a)
      const den = d.x * e.y - d.y * e.x
      if (Math.abs(den) < tolerance('noLength')) continue
      const w = sub(a, p)
      const t = (w.x * e.y - w.y * e.x) / den
      const u = (w.x * d.y - w.y * d.x) / den
      if (t > tolerance('joint') && u >= -tolerance('noLength') && u <= 1 + tolerance('noLength') && (best === null || t < best)) best = t
    }
  }
  return best
}

/** Which wall a face whose outward normal is `out` is, for someone facing `f`. */
function wallFor(out: Vec2, f: Vec2): WalkWall {
  const a = dot(out, f)
  const l = dot(out, leftOf(f))
  if (Math.abs(a) >= Math.abs(l)) return a > 0 ? 'ahead' : 'behind'
  return l > 0 ? 'left' : 'right'
}

interface Ways {
  readonly next: Map<string, Array<{ room: string; via: string }>>
}

/** The things in a room, by wall, as seen from `stand` facing `f`; `skip` is the doorway you stand in. */
function thingsIn(survey: Survey, ways: Ways, room: SurveyRoom, stand: Vec2, f: Vec2, skip: string | null, mirror: number, fixtures: ReadonlyMap<string, FixtureSpot[]>): Record<WalkGroup, WalkThing[]> {
  const out: Record<WalkGroup, WalkThing[]> = { ahead: [], left: [], right: [], behind: [], inRoom: [] }
  const place = (middle: Vec2): { ahead: number; across: number } => ({ ahead: dot(sub(middle, stand), f), across: mirror * dot(sub(middle, stand), leftOf(f)) })
  const put = (wall: WalkWall, thing: WalkThing): void => {
    // Mirrored, the drawing's left wall is the building's right one.
    const side = mirror < 0 && (wall === 'left' || wall === 'right') ? (wall === 'left' ? 'right' : 'left') : wall
    out[side].push(thing)
  }
  for (const facts of room.openings) {
    if (facts.id === skip) continue
    const mine = facts.sides.findIndex((side) => typeof side === 'object' && side.room === room.facts.id)
    const otherSide = facts.sides[mine === 0 ? 1 : 0]!
    const other = typeof otherSide === 'object' ? otherSide.room : otherSide
    if (other === room.facts.id) continue
    const crossing = crossingOf(survey, room, facts.id)
    if (crossing === null) continue
    put(wallFor({ x: -crossing.inward.x, y: -crossing.inward.y }, f), { kind: facts.type, id: facts.id, width: facts.width, to: other, ...place(crossing.near) })
  }
  // Open sides: the stretches of the outline on a dividing line, one per line.
  const seen = new Set<string>()
  for (const edge of room.edges) {
    const wall = edge.wall
    if (wall === null || wall.virtual !== true || seen.has(wall.id) || wall.id === skip) continue
    seen.add(wall.id)
    const to = (ways.next.get(room.facts.id) ?? []).find((w) => w.via === wall.id)?.room
    const crossing = crossingOf(survey, room, wall.id, to === undefined ? null : (survey.byId.get(to) ?? null))
    if (crossing === null) continue
    const stretch = room.edges.filter((e) => e.wall?.id === wall.id).reduce((sum, e) => sum + e.length, 0)
    put(wallFor({ x: -crossing.inward.x, y: -crossing.inward.y }, f), { kind: 'open side', id: wall.id, width: stretch, to: to === undefined || to === OUTSIDE ? 'nothing drawn' : to, ...place(crossing.near) })
  }
  for (const spot of fixtures.get(room.facts.id) ?? []) {
    // ARE-18: clear of every wall by more than AGAINST_WALL, it stands in the room.
    const clear = Math.min(...spot.corners.map((c) => distanceToOutline(c, room)))
    if (clear > AGAINST_WALL) {
      const aheadOf = spot.corners.map((c) => dot(sub(c, stand), f))
      const sideOf = spot.corners.map((c) => mirror * dot(sub(c, stand), leftOf(f)))
      const lo = Math.min(...sideOf)
      const hi = Math.max(...sideOf)
      const nearAhead = Math.min(...aheadOf) > 0 ? Math.min(...aheadOf) : Math.max(...aheadOf) < 0 ? Math.max(...aheadOf) : 0
      out.inRoom.push({ kind: 'fixture', id: spot.id, width: spot.width, to: null, label: spot.label, ...place(spot.at), near: { ahead: nearAhead, across: lo > 0 ? lo : hi < 0 ? hi : 0 } })
      continue
    }
    let best: { d: number; out: Vec2 } | null = null
    for (const edge of room.edges) {
      const e = sub(edge.to, edge.from)
      const span = dot(e, e)
      if (span < tolerance('noLength') ** 2) continue
      const t = Math.max(0, Math.min(1, dot(sub(spot.at, edge.from), e) / span))
      const d = Math.hypot(edge.from.x + e.x * t - spot.at.x, edge.from.y + e.y * t - spot.at.y)
      if (best === null || d < best.d) best = { d, out: unit({ x: e.y, y: -e.x }) }
    }
    if (best === null) continue
    put(wallFor(best.out, f), { kind: 'fixture', id: spot.id, width: spot.width, to: null, label: spot.label, ...place(spot.at) })
  }
  // Ahead and behind from left to right; along the side walls, nearest first.
  out.ahead.sort((a, b) => b.across - a.across)
  out.behind.sort((a, b) => b.across - a.across)
  out.left.sort((a, b) => a.ahead - b.ahead)
  out.right.sort((a, b) => a.ahead - b.ahead)
  out.inRoom.sort((a, b) => Math.abs(a.near!.ahead) - Math.abs(b.near!.ahead))
  return out
}

/** How far a point is from the nearest side of a room's outline or holes. */
function distanceToOutline(p: Vec2, room: SurveyRoom): number {
  let best = Infinity
  for (const ring of [room.polygon, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const e = sub(ring[(i + 1) % ring.length]!, a)
      const span = dot(e, e)
      const t = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), e) / span))
      best = Math.min(best, Math.hypot(a.x + e.x * t - p.x, a.y + e.y * t - p.y))
    }
  }
  return best
}

/**
 * ARE-18: the way to face from a room's middle: of the four ways square to its longest side,
 * the one nearest `toward` (north on the drawing with none), so the room is said square.
 */
function squareFacing(room: SurveyRoom, toward: Vec2 | null): Vec2 {
  const want = toward ?? { x: 0, y: 1 }
  let longest: Vec2 | null = null
  let length = 0
  for (const edge of room.edges) {
    if (edge.length > length) [longest, length] = [unit(sub(edge.to, edge.from)), edge.length]
  }
  if (longest === null) return want
  const ways = [longest, leftOf(longest), { x: -longest.x, y: -longest.y }, { x: longest.y, y: -longest.x }]
  return ways.reduce((best, d) => (dot(d, want) > dot(best, want) ? d : best))
}

interface FixtureSpot {
  readonly id: string
  readonly label: string
  readonly width: number
  readonly at: Vec2
  /** Its footprint's four corners. */
  readonly corners: readonly Vec2[]
}

/** A footprint's four corners from its middle, its size (along its back × to its front) and its turn in degrees, counter-clockwise. */
function cornersOf(at: Vec2, size: readonly [number, number], turn: number): Vec2[] {
  const r = (turn * Math.PI) / 180
  const across = { x: Math.cos(r), y: Math.sin(r) }
  const front = { x: -Math.sin(r), y: Math.cos(r) }
  return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => ({
    x: at.x + across.x * u! * size[0] + front.x * v! * size[1],
    y: at.y + across.y * u! * size[0] + front.y * v! * size[1],
  }))
}

function fixtureSpots(survey: Survey): Map<string, FixtureSpot[]> {
  const byRoom = new Map<string, FixtureSpot[]>()
  if ((survey.plan.items ?? []).length === 0) return byRoom
  for (const row of planFixtures(survey.plan).rows) {
    if (row.room === null) continue
    if (!byRoom.has(row.room)) byRoom.set(row.room, [])
    const at = { x: row.at[0], y: row.at[1] }
    byRoom.get(row.room)!.push({ id: row.id, label: row.label, width: row.size[0], at, corners: cornersOf(at, row.size, row.turn) })
  }
  return byRoom
}

const CIRCULATION = new Set(['corridor', 'reception'])

/**
 * The way into a floor from outside: the named front, else a way in through an outdoor space that
 * reaches outside (ARE-36), else the widest door into a corridor, else the widest.
 */
function wayIn(survey: Survey, ways: Ways, rooms: ReadonlySet<string>, done: ReadonlySet<string>): { room: string; via: string; front: boolean } | null {
  const front = survey.plan.front?.opening
  const doors: { room: string; via: string; width: number; circulation: boolean; outdoor: boolean }[] = []
  for (const way of entryWays(survey, ways.next)) {
    if (!rooms.has(way.room) || done.has(way.room)) continue
    if (way.via === front) return { room: way.room, via: way.via, front: true }
    doors.push({ room: way.room, via: way.via, width: survey.facts.openings.get(way.via)!.width, circulation: CIRCULATION.has(survey.byId.get(way.room)?.facts.use ?? ''), outdoor: way.through !== null })
  }
  doors.sort((a, b) => Number(b.outdoor) - Number(a.outdoor) || Number(b.circulation) - Number(a.circulation) || b.width - a.width)
  const best = doors[0]
  return best === undefined ? null : { room: best.room, via: best.via, front: false }
}

/** One stop: standing in the doorway `via` of `room` (or in its middle), facing in. */
function stopAt(survey: Survey, ways: Ways, room: SurveyRoom, from: string | null, via: string | null, toward: Vec2 | null, mirror: number, fixtures: ReadonlyMap<string, FixtureSpot[]>): WalkStop | null {
  if (room.polygon.length < 3) return null
  let stand: Vec2
  let f: Vec2
  const other = from === null || from === OUTSIDE || from === 'outside' ? null : (survey.byId.get(from) ?? null)
  const crossing = via === null ? null : crossingOf(survey, room, via, other)
  if (crossing !== null) {
    stand = crossing.near
    f = crossing.inward
  } else {
    stand = poleOfInaccessibility(room.polygon, undefined, room.holes).point
    f = squareFacing(room, toward === null ? null : unit(sub(toward, stand)))
  }
  const things = thingsIn(survey, ways, room, stand, f, via, mirror, fixtures)
  const l = leftOf(f)
  // ARE-23: the room is sized in its own frame. A doorway in a wall at an angle to the room's
  // sides is crossed square to that wall, and the room's extent along that skewed line is not
  // a side of it; the size is then taken along the room's own side nearest to the way you face. A room with a curved wall has no sides of its own: it keeps the way you face.
  const own = squareFacing(room, f)
  const skewed = !room.edges.some((e) => e.wall?.arc !== undefined) && Math.abs(own.x * f.y - own.y * f.x) > tolerance('squareCorner')
  const sized = skewed ? own : f
  const sizedLeft = leftOf(sized)
  const ahead = room.polygon.map((p) => dot(sub(p, stand), sized))
  const across = room.polygon.map((p) => dot(sub(p, stand), sizedLeft))
  const inside = { x: stand.x + f.x * tolerance('joint') * 2, y: stand.y + f.y * tolerance('joint') * 2 }
  const reachLeft = rayReach(room, inside, l)
  const reachRight = rayReach(room, inside, { x: -l.x, y: -l.y })
  const opening = via === null ? undefined : survey.facts.openings.get(via)
  return {
    room: room.facts.id,
    floor: room.facts.floor,
    from: from === OUTSIDE ? 'outside' : from,
    via,
    viaKind: via === null ? null : (opening?.type ?? 'open side'),
    viaWidth: opening?.width ?? null,
    stand,
    facing: compassOf(f),
    heading: ((Math.atan2(f.x, f.y) * 180) / Math.PI + 360) % 360,
    across: Math.max(...across) - Math.min(...across),
    // From a doorway, as deep as the room goes ahead of you; from its middle, the whole room.
    deep: crossing === null ? Math.max(...ahead) - Math.min(...ahead) : Math.max(...ahead) - Math.max(0, Math.min(...ahead)),
    area: room.facts.shape?.area ?? 0,
    reach: {
      ahead: rayReach(room, stand, f),
      left: mirror < 0 ? reachRight : reachLeft,
      right: mirror < 0 ? reachLeft : reachRight,
    },
    ...things,
  }
}

/** Walk one floor from its way in, room by room, left to right, as deep as it goes. */
function walkFloor(survey: Survey, floorId: string, mirror: number, fixtures: ReadonlyMap<string, FixtureSpot[]>): FloorWalk {
  const floor = survey.facts.floors.find((f) => f.id === floorId)!
  const roomIds = floor.rooms.filter((r) => r.zoneOf === undefined).map((r) => r.id)
  const rooms = new Set(roomIds)
  const ways: Ways = wayGraph(survey, floorId)
  const visited = new Set<string>()
  const stops: WalkStop[] = []
  let start: FloorWalk['start'] = null

  const tour = (first: { room: string; from: string | null; via: string | null; toward: Vec2 | null }): void => {
    const stack = [first]
    while (stack.length > 0) {
      const at = stack.pop()!
      if (visited.has(at.room)) continue
      const room = survey.byId.get(at.room)
      if (room === undefined) continue
      visited.add(at.room)
      const stop = stopAt(survey, ways, room, at.from, at.via, at.toward, mirror, fixtures)
      if (stop === null) continue
      stops.push(stop)
      // The ways on, from left to right as you stand here, sweeping round from your left hand.
      const all = [...stop.ahead, ...stop.left, ...stop.right, ...stop.behind].sort((a, b) => Math.atan2(b.across, b.ahead) - Math.atan2(a.across, a.ahead))
      const order = new Map(all.map((t, i) => [t.id, i]))
      // ARE-18: every way the check reads is a way on; one not said in the room's walls goes last.
      const rank = (via: string): number => order.get(via) ?? order.size
      const onward = (ways.next.get(at.room) ?? [])
        .filter((w) => w.room !== OUTSIDE && rooms.has(w.room) && !visited.has(w.room))
        .sort((a, b) => rank(a.via) - rank(b.via))
      const firstBy = new Map<string, string>()
      for (const w of onward) if (!firstBy.has(w.room)) firstBy.set(w.room, w.via)
      const next = [...firstBy.entries()]
      for (let i = next.length - 1; i >= 0; i--) stack.push({ room: next[i]![0], from: at.room, via: next[i]![1], toward: null })
    }
  }

  for (;;) {
    const way = wayIn(survey, ways, rooms, visited)
    if (way === null) break
    if (start === null) start = way.front ? 'front' : 'way in'
    tour({ room: way.room, from: OUTSIDE, via: way.via, toward: null })
  }
  if (start === null && roomIds.length > 0) {
    const stair = roomIds.find((id) => survey.byId.get(id)?.facts.use === 'stair')
    const first = stair ?? roomIds[0]!
    start = stair !== undefined ? 'stair' : 'first room'
    const door = (ways.next.get(first) ?? []).find((w) => w.room !== OUTSIDE)
    const room = survey.byId.get(first)
    const toward = door === undefined || room === undefined ? null : (crossingOf(survey, room, door.via, survey.byId.get(door.room) ?? null)?.near ?? null)
    tour({ room: first, from: null, via: null, toward })
  }
  return { floor: floorId, start, stops, notReached: roomIds.filter((id) => !visited.has(id)), repeats: null }
}

/** The walk of every floor, or of the one asked for; a floor laid out like an earlier one is said once. */
export function planWalk(survey: Survey, onlyFloor?: string): PlanWalk {
  const mirrored = planOrientation(survey.plan).yAxis === 'down'
  const mirror = mirrored ? -1 : 1
  const fixtures = fixtureSpots(survey)
  const floors = survey.facts.floors
    .filter((floor) => onlyFloor === undefined || floor.id === onlyFloor)
    .map((floor): FloorWalk => {
      if (onlyFloor === undefined && floor.repeats !== null) return { floor: floor.id, start: null, stops: [], notReached: [], repeats: floor.repeats.of }
      return walkFloor(survey, floor.id, mirror, fixtures)
    })
  return { floors, mirrored }
}

// ---------------------------------------------------------------------------------------------
// Words

/** A length in metres: two decimals at most, no trailing zeros. */
function m(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

const KIND_LETTER: Record<WalkThing['kind'], string> = { door: 'd', window: 'w', opening: 'o', 'open side': 'v', fixture: 'f' }
const BEYOND_AGENT: Record<string, string> = { outside: 'OUT', 'nothing drawn': 'NONE', 'a room left out': 'LEFT' }

/** MSG-11: the person's close, in English; `describe.walk.close` in every language. */
export const WALK_PERSON_CLOSE = say('en', 'describe.walk.close')
export const WALK_AGENT_CLOSE = 'CHECKS none here: grid check.'

/** MSG-11: the person's form in its language (`describe.walk.*`); the agent's stays as it is. */
const t = (w: Words, key: MessageKey, values?: Values): string => say(w.language, key, values, w.options)
/** A length in metres, with the language's decimal mark. */
const fig = (value: number): Value => num(m(value))

function personThing(thing: WalkThing, names: PersonNames, w: Words): string {
  if (thing.kind === 'fixture') return thing.label === undefined ? t(w, 'describe.walk.thing.fixture.unnamed') : t(w, 'describe.walk.thing.fixture', { label: thing.label })
  const to =
    thing.to === null ? '' : thing.to === 'outside' ? t(w, 'describe.walk.to.outside') : thing.to === 'nothing drawn' ? t(w, 'describe.walk.to.nothing') : thing.to === 'a room left out' ? t(w, 'describe.walk.to.leftOut') : t(w, 'describe.walk.to.room', { room: names.room(thing.to) })
  if (thing.kind === 'window') return t(w, 'describe.walk.thing.window', { width: fig(thing.width) })
  if (thing.kind === 'open side') return t(w, 'describe.walk.thing.openSide', { to, length: fig(thing.width) })
  return t(w, thing.kind === 'door' ? 'describe.walk.thing.door' : 'describe.walk.thing.opening', { width: fig(thing.width), to })
}

const toSide = (w: Words, across: number): string => t(w, across > 0 ? 'describe.walk.where.toLeft' : 'describe.walk.where.toRight', { distance: fig(Math.abs(across)) })
const sideways = (w: Words, across: number): string => (Math.abs(across) < STRAIGHT ? t(w, 'describe.walk.where.straight') : toSide(w, across))
const besideYou = (w: Words, across: number): string => (Math.abs(across) < STRAIGHT ? t(w, 'describe.walk.where.here') : toSide(w, across))
const along = (w: Words, ahead: number): string => (ahead < STRAIGHT ? t(w, 'describe.walk.where.beside') : t(w, 'describe.walk.where.ahead', { distance: fig(ahead) }))

function personStop(n: number, stop: WalkStop, names: PersonNames, w: Words): string[] {
  const lines: string[] = []
  const wide: Values = stop.viaWidth === null ? {} : { width: fig(stop.viaWidth) }
  const via =
    stop.viaKind === null
      ? ''
      : stop.viaKind === 'open side'
        ? t(w, 'describe.walk.via.openSide')
        : t(w, `describe.walk.via.${stop.viaKind === 'door' ? 'door' : 'opening'}${stop.viaWidth === null ? '' : '.wide'}` as MessageKey, wide)
  const came = stop.from === null ? t(w, 'describe.walk.came.start') : stop.from === 'outside' ? t(w, 'describe.walk.came.outside', { via }) : t(w, 'describe.walk.came.room', { room: names.room(stop.from), via })
  lines.push(
    t(w, 'describe.walk.stop', {
      n,
      room: names.room(stop.room),
      came,
      facing: t(w, `describe.c.${stop.facing}` as MessageKey),
      across: fig(stop.across),
      deep: fig(stop.deep),
      area: num((Math.round(stop.area * 10) / 10).toFixed(1)),
    })
  )
  const list = (things: readonly WalkThing[], where: (t: WalkThing) => string): string =>
    things.length === 0 ? t(w, 'describe.walk.plainWall') : things.map((thing) => t(w, 'describe.walk.item', { thing: personThing(thing, names, w), where: where(thing) })).join(t(w, 'join.semicolon'))
  const reach = (r: number | null): string => (r === null ? '' : t(w, 'describe.walk.reach', { distance: fig(r) }))
  lines.push(`   ${t(w, 'describe.walk.ahead', { reach: reach(stop.reach.ahead), things: list(stop.ahead, (x) => sideways(w, x.across)) })}`)
  lines.push(`   ${t(w, 'describe.walk.left', { reach: reach(stop.reach.left), things: list(stop.left, (x) => along(w, x.ahead)) })}`)
  lines.push(`   ${t(w, 'describe.walk.right', { reach: reach(stop.reach.right), things: list(stop.right, (x) => along(w, x.ahead)) })}`)
  if (stop.behind.length > 0) lines.push(`   ${t(w, stop.via === null ? 'describe.walk.behind' : 'describe.walk.inWall', { things: list(stop.behind, (x) => besideYou(w, x.across)) })}`)
  if (stop.inRoom.length > 0) lines.push(`   ${t(w, 'describe.walk.inRoom', { things: stop.inRoom.map((x) => personFree(x, w)).join(t(w, 'join.semicolon')) })}`)
  return lines
}

/** ARE-18: a fixture clear of the walls, where it stands: its near side ahead or behind, and across your way or to one side. */
function personFree(thing: WalkThing, w: Words): string {
  const near = thing.near ?? { ahead: thing.ahead, across: thing.across }
  const ahead = Math.abs(near.ahead) < tolerance('joint') ? t(w, 'describe.walk.free.level') : t(w, near.ahead > 0 ? 'describe.walk.free.ahead' : 'describe.walk.free.behind', { distance: fig(Math.abs(near.ahead)) })
  const where = near.across === 0 ? t(w, 'describe.walk.free.across') : toSide(w, near.across)
  return thing.label === undefined ? t(w, 'describe.walk.free.unnamed', { ahead, where }) : t(w, 'describe.walk.free', { label: thing.label, ahead, where })
}

function agentThing(thing: WalkThing): string {
  if (thing.kind === 'fixture') return `${thing.id} f`
  const to = thing.to === null ? '' : `>${BEYOND_AGENT[thing.to] ?? thing.to}`
  return `${thing.id} ${KIND_LETTER[thing.kind]}${m(thing.width)}${to}`
}

const lr = (across: number): string => (Math.abs(across) < STRAIGHT ? '0' : `${across > 0 ? 'L' : 'R'}${m(Math.abs(across))}`)

function agentStop(n: number, stop: WalkStop): string {
  const came = stop.from === null ? 'START' : `<${stop.from === 'outside' ? 'OUT' : stop.from} ${stop.via}${stop.viaKind === null || stop.viaKind === 'open side' ? '' : ` ${KIND_LETTER[stop.viaKind]}${stop.viaWidth === null ? '' : m(stop.viaWidth)}`}`
  const group = (letter: string, reach: number | null, things: readonly WalkThing[], where: (t: WalkThing) => string): string =>
    `${letter}${reach === null ? '' : m(reach)} ${things.length === 0 ? '-' : things.map((t) => `${agentThing(t)} ${where(t)}`).join('; ')}`
  return [
    `${n} ${stop.room} ${came}`,
    `${stop.facing} ${m(stop.across)}x${m(stop.deep)} ${m(stop.area)}`,
    group('A', stop.reach.ahead, stop.ahead, (t) => lr(t.across)),
    group('L', stop.reach.left, stop.left, (t) => `+${m(Math.max(0, t.ahead))}`),
    group('R', stop.reach.right, stop.right, (t) => `+${m(Math.max(0, t.ahead))}`),
    group('B', null, stop.behind, (t) => lr(t.across)),
    // ARE-18: fixtures clear of the walls, only where there are some.
    ...(stop.inRoom.length === 0 ? [] : [group('F', null, stop.inRoom, (t) => `${(t.near?.ahead ?? 0) < 0 ? '-' : '+'}${m(Math.abs(t.near?.ahead ?? 0))} ${(t.near?.across ?? 0) === 0 ? 'X' : `${(t.near?.across ?? 0) > 0 ? 'L' : 'R'}${m(Math.abs(t.near?.across ?? 0))}`}`)]),
  ].join(' | ')
}

const START_KEY: Record<NonNullable<FloorWalk['start']>, MessageKey> = {
  front: 'describe.walk.start.front',
  'way in': 'describe.walk.start.wayIn',
  stair: 'describe.walk.start.stair',
  'first room': 'describe.walk.start.firstRoom',
}

/** The walk in words, for a person (names only, never an id) or an agent (terse, with every id). */
export function walkText(survey: Survey, walk: PlanWalk, audience: DescribeAudience, pictures: ReadonlyMap<WalkStop, string> = new Map(), w: Words = ENGLISH): string {
  const lines: string[] = []
  if (audience === 'person') {
    const names = new PersonNames(survey.facts, w)
    lines.push(t(w, 'describe.walk.intro'))
    if (walk.mirrored) lines.push(t(w, 'describe.walk.mirrored'))
    for (const floor of walk.floors) {
      lines.push('')
      if (floor.repeats !== null) {
        lines.push(t(w, 'describe.walk.repeats', { floor: names.floor(floor.floor), of: names.floor(floor.repeats) }))
        continue
      }
      const start = t(w, floor.start === null ? 'describe.walk.start.none' : START_KEY[floor.start])
      lines.push(t(w, floor.stops.length === 1 ? 'describe.walk.floor.one' : 'describe.walk.floor.many', { floor: names.floor(floor.floor), count: floor.stops.length, start }))
      floor.stops.forEach((stop, i) => {
        lines.push(...personStop(i + 1, stop, names, w))
        const picture = pictures.get(stop)
        if (picture !== undefined) lines.push(`   ${t(w, 'describe.walk.picture', { picture, height: fig(WALK_EYE_HEIGHT) })}`)
      })
      if (floor.notReached.length > 0) lines.push(t(w, 'describe.walk.notReached', { rooms: floor.notReached.map((id) => names.room(id)).join(t(w, 'join.comma')) }))
    }
    lines.push('')
    lines.push(t(w, 'describe.walk.close'))
  } else {
    lines.push('KEY walk: n room <from via(OUT=outside, START=no doorway) | facing WxD(across x deep from the doorway) m2 | A(head) wall dist: things, left (L) or right (R) of you, 0=straight | L(eft wall) dist, R(ight wall) dist: things, +metres ahead | B(ehind, the wall you stand in): things L/R | F(ree, clear of the walls, when any): fixtures +metres ahead (- behind) to the near side, X=across your way else L/R to the near side. Thing: id d/w/o/v(open side)/f(fixture) width >other side. Ways on are walked left to right, depth first.')
    if (walk.mirrored) lines.push('Y DOWN: the drawing is the building mirrored; L and R are the building\'s.')
    for (const floor of walk.floors) {
      if (floor.repeats !== null) {
        lines.push(`WALK ${floor.floor} as ${floor.repeats}`)
        continue
      }
      lines.push(`WALK ${floor.floor}: ${floor.stops.length} stops, start ${floor.start ?? 'none'}`)
      floor.stops.forEach((stop, i) => {
        const picture = pictures.get(stop)
        lines.push(`${agentStop(i + 1, stop)}${picture === undefined ? '' : ` | PIC ${picture}`}`)
      })
      if (floor.notReached.length > 0) lines.push(`NOT REACHED ${floor.notReached.join(' ')}`)
    }
    lines.push(WALK_AGENT_CLOSE)
  }
  return `${lines.join('\n')}\n`
}
