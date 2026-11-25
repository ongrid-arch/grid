/**
 * The routes a person can take through one floor, deduced from the plan.
 *
 * Nothing in the schema marks a route: rooms are where a person can be,
 * and doors, doorless openings and virtual walls are how they move between
 * them. Which rooms an opening joins is read from the geometry at the opening's
 * own position, never from the list of rooms that name its wall: a long wall
 * can border several rooms along different stretches.
 */

import type { FloorPlan, Opening, PlanIndex, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { floorOf } from '../floors'
import { roomNesting, tryRoomShape } from '../room'
import { roomZones } from '../zones'
import type { FloorSpaces, Space } from '../spaces'
import { floorSpaces, spacesKnown } from '../spaces'
import { planWallSides, wallBeyond } from '../exposure'
import { flatOfRoom, planFlats } from '../flats'
import type { Vec2 } from '../vec2'
import { add, area, scale } from '../vec2'
import { wallFrameAt, wallLength } from '../wall'
import { TOLERANCES, limit, tolerance } from '../tolerances'
import { overFigure, underFigure } from '../rounding'
import { roomFloorOffset } from '../steps'
import { doorwayClearance } from '../use'
import { itemFootprint } from '../items'
import { isItemKind } from '../itemKinds'

/** How far past a wall's face a point is taken to be in the room beyond it, in metres (`stepPastFace`). */
export const STEP_PAST_FACE_M = TOLERANCES.stepPastFace.value

export interface RoomOutline {
  readonly id: string
  readonly polygon: readonly Vec2[]
  /** Its holes, clockwise (ARE-6). A point in a hole is not in the room. */
  readonly holes: readonly (readonly Vec2[])[]
}

/** The outline of every room that closes, by id, except those left out. */
export function roomOutlines(
  plan: FloorPlan,
  index: PlanIndex,
  leftOut: ReadonlySet<string> = new Set()
): Map<string, RoomOutline> {
  const outlines = new Map<string, RoomOutline>()
  for (const room of plan.rooms) {
    if (leftOut.has(room.id)) continue
    const shape = tryRoomShape(room, index)
    if (shape !== null) outlines.set(room.id, { id: room.id, polygon: shape.polygon, holes: shape.holes })
  }
  return outlines
}

/** Even-odd ray cast. A point exactly on an edge may fall either way. */
function contains(polygon: readonly Vec2[], point: Vec2): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > point.y !== b.y > point.y) {
      const x = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (point.x < x) inside = !inside
    }
  }
  return inside
}

/** Whether a room's floor holds the point: inside its outline and in none of its holes (ARE-6). */
function holds(outline: RoomOutline, point: Vec2): boolean {
  return contains(outline.polygon, point) && !outline.holes.some((hole) => contains(hole, point))
}

/** A room's floor area as the graph compares rooms: its outline less its holes. */
const floorArea = (outline: RoomOutline): number =>
  outline.holes.reduce((sum, hole) => sum - area([...hole]), area([...outline.polygon]))

/**
 * The rooms on the two sides of a point on a wall's axis, `[left, right]`:
 * `left` is the side the wall's normal points at. Only rooms that name the
 * wall are tried, so a room on another storey or across the plan never matches.
 *
 * Rooms inside rooms (ARE-5). Where more than one of those rooms holds the
 * point, the smallest is the one there: an en-suite in the corner of a bedroom
 * lists the bedroom's outer walls too, and its window is its own. And a room
 * marked `inside` lists only its own walls, so on their far side, where none of
 * the rooms that name the wall is, lies the room it sits in (`roomNesting`, found
 * from the outlines): a door in a wardrobe pod opens into the bedroom.
 *
 * A zone (CNT-8) is never on a side: a door in the walls of an open-plan room opens into the
 * room, whichever of its zones it is in.
 */
export function sidesAt(
  wall: Wall,
  along: number,
  index: PlanIndex,
  outlines: ReadonlyMap<string, RoomOutline>
): [string | null, string | null] {
  // Along a curved wall's curve (CNT-18), the normal where it is.
  const axis = wallFrameAt(wall, along)
  const centre = axis.point
  const step = wall.thickness / 2 + tolerance('stepPastFace')
  // A zone is no place of its own (CNT-8): what is in it is in its room.
  const zones = roomZones(index)
  const candidates = (index.roomsByWall.get(wall.id) ?? [])
    .filter((room) => !zones.zoneOf.has(room.id))
    .map((room) => outlines.get(room.id))
    .filter((outline): outline is RoomOutline => outline !== undefined)
  const nesting = roomNesting(index)
  const roomAt = (point: Vec2): string | null => {
    let found: RoomOutline | null = null
    let foundArea = Infinity
    for (const outline of candidates) {
      if (!holds(outline, point)) continue
      const size = floorArea(outline)
      if (size < foundArea) {
        found = outline
        foundArea = size
      }
    }
    if (found !== null) return found.id
    for (const outline of candidates) {
      const host = nesting.inner.get(outline.id)?.host ?? null
      const around = host === null ? undefined : outlines.get(host)
      if (around !== undefined && holds(around, point)) return around.id
    }
    return null
  }
  return [roomAt(add(centre, scale(axis.normal, step))), roomAt(add(centre, scale(axis.normal, -step)))]
}

/** The rooms on the two sides of an opening, at its middle (C2: measured from `wall.start`). */
export function openingSides(
  opening: Opening,
  index: PlanIndex,
  outlines: ReadonlyMap<string, RoomOutline>
): [string | null, string | null] {
  const wall = index.wallsById.get(opening.wall)
  if (wall === undefined) return [null, null]
  return sidesAt(wall, opening.offset + opening.width / 2, index, outlines)
}

/**
 * Whether the side of a wall with no room on it, at a point along the wall, is outside (MSG-13).
 *
 * A wall stated `exterior` faces outside, as stated. Any other wall is worked out: past a face
 * with no room lies the outside, unless the walls enclose floor there, which is a space no room
 * claims (a forgotten room, a courtyard not drawn), not the outside (ARE-4). The spaces of a
 * floor are worked out only when first asked, and when they cannot be, the side is not taken to
 * be outside, as before.
 */
export type OutsideTest = (wall: Wall, along: number, side: 'left' | 'right', asStated?: boolean) => boolean

/**
 * MSG-17: the enclosed floor no room claims past a wall's face, as the place of that piece among
 * the floor's spaces, or `null` when that side is not enclosed (or the spaces cannot be worked out).
 */
export type EnclosedTest = (wall: Wall, along: number, side: 'left' | 'right') => number | null

/** What lies past a wall's face with no room on it: the outside (`outside`), or which enclosed floor (`enclosedAt`). */
export interface SideReader {
  readonly outside: OutsideTest
  readonly enclosedAt: EnclosedTest
  /** The piece of enclosed floor `enclosedAt` gave, on the wall's floor. */
  readonly piece: (wall: Wall, at: number) => Space | undefined
}

export function outsideTest(plan: FloorPlan, index: PlanIndex): OutsideTest {
  return sideReader(plan, index).outside
}

export function sideReader(plan: FloorPlan, index: PlanIndex): SideReader {
  const spaces = new Map<string, FloorSpaces | null>()
  const spacesOf = (floor: string): FloorSpaces | null => {
    if (!spaces.has(floor)) {
      const found = floorSpaces(plan, floor, { index })
      spaces.set(floor, spacesKnown(found) ? found : null)
    }
    return spaces.get(floor) ?? null
  }
  const enclosedAt: EnclosedTest = (wall, along, side) => {
    const found = spacesOf(floorOf(wall))
    if (found === null) return null
    const axis = wallFrameAt(wall, along)
    const step = (wall.virtual === true ? 0 : wall.thickness / 2) + tolerance('stepPastFace')
    const point = add(axis.point, scale(axis.normal, side === 'left' ? step : -step))
    const at = found.spaces.findIndex((space) => {
      const [outer, ...islands] = space.rings
      return outer !== undefined && contains(outer, point) && !islands.some((ring) => contains(ring, point))
    })
    return at < 0 ? null : at
  }
  // `asStated: false` asks only what lies there, for a door with no room on either side.
  const outside: OutsideTest = (wall, along, side, asStated = true) => {
    if (asStated && wall.kind === 'exterior') return true
    // CNT-6 (C23): more of the building stated beyond the wall is not the outside.
    const beyond = wallBeyond(wall)
    if (beyond !== null) return beyond === 'outside'
    if (spacesOf(floorOf(wall)) === null) return false
    return enclosedAt(wall, along, side) === null
  }
  return { outside, enclosedAt, piece: (wall, at) => spacesOf(floorOf(wall))?.spaces[at] }
}

/** What keeps a person from passing a door or a doorless opening: a sill above the floor, too narrow, or too low. */
export type ShortOf = 'width' | 'height' | 'sill'

/**
 * Whether a person fits through a door or a doorless opening (MSG-18): wide and high enough, with
 * its sill at the floor, by Grid's own sizes (`passableWidth`, `passableHeight`, `passableSill`),
 * which are not code figures. The first it falls short of (sill, width, height), or `null` when it is a way
 * through. Compared as drawn, never rounded first (ARE-7): a door drawn at exactly the size fits.
 */
export function shortOf(opening: Opening): ShortOf | null {
  // A door up in the wall is named for that first, whatever its size.
  if (overFigure(opening.sill, limit('passableSill'), 'm')) return 'sill'
  if (underFigure(opening.width, limit('passableWidth'), 'm')) return 'width'
  if (underFigure(opening.height, limit('passableHeight'), 'm')) return 'height'
  return null
}

/** A door or doorless opening no person fits through, and the rooms on its sides, in id order. */
export interface TooSmall {
  readonly opening: string
  readonly rooms: readonly string[]
  readonly short: ShortOf
}

/**
 * ARE-46: a door or doorless opening an item stands in front of so that nothing of its hole is
 * clear (the `clear` of `doorwayClearance`, as the placing answer says it), with the rooms on its
 * sides in id order and the items that cover it. None of them is in `links`: a kitchen run across
 * a door is a closed door until it is moved.
 */
export interface BlockedBy {
  readonly opening: string
  readonly rooms: readonly string[]
  readonly by: readonly string[]
}

/**
 * LVL-17: a door or doorless opening between two rooms of one storey whose floors stand further
 * apart in height than a step (`passableRise`), with neither room used as a stair. Each room's
 * level is its `floorOffset` (LVL-7), in metres from its storey's floor. None of them is in
 * `links`: a door onto a floor 3 m up is no way through without a stair.
 */
export interface BetweenLevels {
  readonly opening: string
  /** The room whose floor stands lower, and its level. */
  readonly lower: string
  readonly lowerAt: number
  /** The room whose floor stands higher, and its level. */
  readonly upper: string
  readonly upperAt: number
  /** How much higher the upper floor stands, in metres. */
  readonly rise: number
}

/**
 * LVL-17: the two rooms' levels across a door, when they stand further apart than a step and
 * neither room is a stair (the stair is how a person climbs between them), else `null`. Compared
 * as drawn (ARE-7): a rise of exactly `passableRise` is a step.
 */
export function levelsAcross(opening: string, a: Room | undefined, b: Room | undefined): BetweenLevels | null {
  if (a === undefined || b === undefined) return null
  if (a.use === 'stair' || b.use === 'stair') return null
  const [lower, upper] = roomFloorOffset(a) <= roomFloorOffset(b) ? [a, b] : [b, a]
  const rise = roomFloorOffset(upper) - roomFloorOffset(lower)
  if (!overFigure(rise, limit('passableRise'), 'm')) return null
  return { opening, lower: lower.id, lowerAt: roomFloorOffset(lower), upper: upper.id, upperAt: roomFloorOffset(upper), rise }
}

/** Two rooms a person can move between, in id order, and the opening or virtual wall between them. */
export interface RouteLink {
  readonly rooms: readonly [string, string]
  readonly via: string
}

/** An opening with a room on one side only. */
export interface OneSided {
  readonly room: string
  readonly opening: string
}

/**
 * CNT-6 (C23): a virtual wall with a room on one side only, an open edge, never a door: where it
 * leads, as the plan states (`beyond`) or, unstated, as the drawing says: the outside, or floor no
 * room claims (`undrawn`).
 */
export interface OpenEdge {
  readonly room: string
  readonly edge: string
  readonly beyond: 'outside' | 'common' | 'neighbour' | 'undrawn'
}

export interface FloorGraph {
  /** Every room that closes, by id. */
  readonly rooms: readonly string[]
  readonly links: readonly RouteLink[]
  /**
   * Doors and doorless openings to the outside: through a wall stated `exterior`, or with no room
   * and no enclosed floor past it. Never onto a courtyard closed in on every side (`closedCourts`, MSG-17).
   */
  readonly exits: readonly OneSided[]
  /** Doors and doorless openings into enclosed floor that no room claims. */
  readonly undrawn: readonly OneSided[]
  /**
   * CNT-6 (C23): doors and doorless openings onto a common part of the building that is not
   * drawn: through a separating wall, or one that states a common part beyond it. A way on, never
   * an exit, and nothing worth a note: a flat's front door onto a landing.
   */
  readonly common: readonly OneSided[]
  /** CNT-6: doors and doorless openings into a neighbour the plan states beyond the wall: never a route. */
  readonly intoNeighbour: readonly OneSided[]
  /** CNT-6: open edges, each once per room; those to the outside are in `exits` too. */
  readonly openEdges: readonly OpenEdge[]
  /**
   * CNT-6 (C23): ways through between rooms of two different flats (CNT-4): a door cut through to
   * the neighbour. None of them is in `links`: a home is never left through another.
   */
  readonly betweenHomes: readonly RouteLink[]
  /**
   * Doors and doorless openings beside a room that no person fits through (MSG-18). None of them
   * is in `links`, `exits` or `undrawn`: a 5 cm hole is not a way out.
   */
  readonly tooSmall: readonly TooSmall[]
  /**
   * ARE-46: doors and doorless openings an item leaves no clear width in. None of them is in `links`,
   * `exits` or the rest: they are closed while the item stands there.
   */
  readonly blocked: readonly BlockedBy[]
  /**
   * MSG-17 (lab CH-6): doors and doorless openings through a wall stated `exterior` onto outside
   * floor the walls close in on every side, a courtyard or a light well no room claims, with no
   * door from it to the open air. None of them is in `exits`: a way out must lead to open air.
   */
  readonly closedCourts: readonly OneSided[]
  /**
   * LVL-17: doors and doorless openings between rooms whose floors stand further apart than a
   * step, neither of them a stair. None of them is in `links`.
   */
  readonly betweenLevels: readonly BetweenLevels[]
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The routes of one floor. `plan` is a single storey (`planForFloor`) whose walls
 * and openings can all be drawn, so every wall has an axis. Rooms in `leftOut`
 * stay in the plan but are not places: a door beside one says nothing.
 */
export function floorGraph(plan: FloorPlan, leftOut: ReadonlySet<string> = new Set()): FloorGraph {
  const index = indexPlan(plan)
  const outlines = roomOutlines(plan, index, leftOut)
  const nesting = roomNesting(index)
  const zones = roomZones(index)
  const links: RouteLink[] = []
  const exits: OneSided[] = []
  const undrawn: OneSided[] = []
  const common: OneSided[] = []
  const intoNeighbour: OneSided[] = []
  const openEdges: OpenEdge[] = []
  const betweenHomes: RouteLink[] = []
  const tooSmall: TooSmall[] = []
  const blocked: BlockedBy[] = []
  // The storey's own items, each by its footprint (`planForFloor` has cut them to the floor).
  const obstacles = (plan.items ?? []).filter((item) => isItemKind(item.kind)).map((item) => ({ id: item.id, outline: itemFootprint(item) }))
  const closedCourts: OneSided[] = []
  const betweenLevels: BetweenLevels[] = []
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room] as const))
  // CNT-6: which flat each room is in (CNT-4), so a home is never left through another.
  const flatOf = flatOfRoom(planFlats(plan))

  const reader = sideReader(plan, index)
  const outside = reader.outside
  const leadsOut = courtWays(plan, index, outlines, reader)
  const passage = (wall: Wall, via: string, along: number, sides: [string | null, string | null]): void => {
    const [left, right] = sides
    if (left !== null && right !== null) {
      if (left !== right) {
        const pair = { rooms: [left, right].sort(byText) as [string, string], via }
        const homes = [flatOf.get(left), flatOf.get(right)]
        if (homes[0] !== undefined && homes[1] !== undefined && homes[0] !== homes[1]) betweenHomes.push(pair)
        else links.push(pair)
      }
      return
    }
    const room = left ?? right
    if (room === null) return
    // The other side may be a room that was left out: no conclusion from what is not drawn.
    if ((index.roomsByWall.get(wall.id) ?? []).some((r) => !outlines.has(r.id))) return
    // Nor when the room sits inside a room that was left out.
    const host = nesting.inner.get(room)?.host ?? null
    if (host !== null && !outlines.has(host)) return
    const edge = wall.virtual === true && via === wall.id
    // CNT-6 (C23): what the plan states lies beyond the wall comes first.
    const beyond = wallBeyond(wall)
    if (beyond === 'common' || beyond === 'neighbour') {
      if (edge) openEdges.push({ room, edge: via, beyond })
      else (beyond === 'common' ? common : intoNeighbour).push({ room, opening: via })
      return
    }
    // Outside as stated, or worked out: no room and no enclosed floor past that face (MSG-13).
    const side = left === null ? 'left' : 'right'
    if (beyond === 'outside' || outside(wall, along, side)) {
      // MSG-17 (lab CH-6): a wall stated exterior onto floor the walls close in, a courtyard no
      // room claims, is a way out only when a door leads on from that courtyard to the open air.
      const court = beyond === null && !edge && wall.kind === 'exterior' ? reader.enclosedAt(wall, along, side) : null
      if (court !== null && !leadsOut(wall, court)) {
        closedCourts.push({ room, opening: via })
        return
      }
      exits.push({ room, opening: via })
      if (edge) openEdges.push({ room, edge: via, beyond: 'outside' })
    } else if (edge) {
      // An open edge into floor no room claims is not a door into a space not drawn (CNT-6).
      openEdges.push({ room, edge: via, beyond: 'undrawn' })
    } else {
      undrawn.push({ room, opening: via })
    }
  }

  for (const opening of plan.openings) {
    // A window is never a way through.
    if (opening.type === 'window') continue
    const wall = index.wallsById.get(opening.wall)
    if (wall === undefined) continue
    const sides = openingSides(opening, index, outlines)
    // A door no person fits through is named, and is not a way through (MSG-18).
    const short = shortOf(opening)
    if (short !== null) {
      const rooms = [...new Set(sides.filter((room): room is string => room !== null))].sort(byText)
      if (rooms.length > 0) tooSmall.push({ opening: opening.id, rooms, short })
      continue
    }
    // ARE-46: a door an item leaves no clear width in is closed, and names the item.
    if (obstacles.length > 0) {
      const clear = doorwayClearance(wall, opening, obstacles)
      if (clear.narrowedBy.length > 0 && clear.clear < tolerance('noLength')) {
        const rooms = [...new Set(sides.filter((room): room is string => room !== null))].sort(byText)
        if (rooms.length > 0) {
          blocked.push({ opening: opening.id, rooms, by: clear.narrowedBy })
          continue
        }
      }
    }
    // LVL-17: a door onto a floor much higher than its own is named, and is not a way through.
    const [left, right] = sides
    const levels = left !== null && right !== null && left !== right ? levelsAcross(opening.id, roomsById.get(left), roomsById.get(right)) : null
    if (levels !== null) {
      betweenLevels.push(levels)
      continue
    }
    passage(wall, opening.id, opening.offset + opening.width / 2, sides)
  }
  // A virtual wall is an open side all along its length (MSG-14): each stretch of it joins the
  // rooms on its two sides there. The stretches are cut wherever the rooms beside it change, so
  // two lines that cross at their middles join all four rooms round the crossing (lab S-4); a
  // line tested only at its middle tested the crossing.
  const sides = planWallSides(index)
  for (const wall of plan.walls) {
    if (wall.virtual !== true) continue
    const stretches = (sides.get(wall.id)?.stretches ?? []).filter((st) => st.to - st.from > tolerance('lineInside'))
    const points = stretches.length > 0 ? stretches.map((st) => (st.from + st.to) / 2) : [wallLength(wall) / 2]
    const read = points.map((along) => ({ along, sides: sidesAt(wall, along, index, outlines) }))
    // ARE-28: a dividing line, with two rooms on its sides along any stretch, joins those rooms
    // and nothing else. Where only one room is beside it (the bit run on into an outside wall's
    // body, past a narrower room's end, or along a row of merged lines) it leads nowhere, unless
    // the plan states what lies beyond it (C23). Only an open edge, a line with one room all
    // along it, leads out.
    const divides = read.some(({ sides: [left, right] }) => left !== null && right !== null && left !== right)
    for (const { along, sides } of read) {
      if (divides && (sides[0] === null) !== (sides[1] === null) && wallBeyond(wall) === null) continue
      passage(wall, wall.id, along, sides)
    }
  }

  const bySide = (a: OneSided, b: OneSided): number => byText(a.room, b.room) || byText(a.opening, b.opening)
  // A line with several stretches can join the same two rooms, or lead out of one room, more than once.
  const once = <T>(list: T[], key: (t: T) => string): T[] => [...new Map(list.map((t) => [key(t), t] as const)).values()]
  return {
    // Zones (CNT-8) are reached as their room is: they are not places of their own.
    rooms: [...outlines.keys()].filter((id) => !zones.zoneOf.has(id)).sort(byText),
    links: once(links, (l) => `${l.rooms.join('|')}|${l.via}`).sort(
      (a, b) => byText(a.rooms[0], b.rooms[0]) || byText(a.rooms[1], b.rooms[1]) || byText(a.via, b.via)
    ),
    exits: once(exits, (e) => `${e.room}|${e.opening}`).sort(bySide),
    undrawn: once(undrawn, (u) => `${u.room}|${u.opening}`).sort(bySide),
    common: once(common, (u) => `${u.room}|${u.opening}`).sort(bySide),
    intoNeighbour: once(intoNeighbour, (u) => `${u.room}|${u.opening}`).sort(bySide),
    openEdges: once(openEdges, (e) => `${e.room}|${e.edge}|${e.beyond}`).sort((a, b) => byText(a.room, b.room) || byText(a.edge, b.edge) || byText(a.beyond, b.beyond)),
    betweenHomes: once(betweenHomes, (l) => `${l.rooms.join('|')}|${l.via}`).sort(
      (a, b) => byText(a.rooms[0], b.rooms[0]) || byText(a.rooms[1], b.rooms[1]) || byText(a.via, b.via)
    ),
    blocked: blocked.sort((a, b) => byText(a.rooms[0]!, b.rooms[0]!) || byText(a.opening, b.opening)),
    tooSmall: tooSmall.sort((a, b) => byText(a.rooms[0]!, b.rooms[0]!) || byText(a.opening, b.opening)),
    closedCourts: once(closedCourts, (u) => `${u.room}|${u.opening}`).sort(bySide),
    betweenLevels: betweenLevels.sort((a, b) => byText(a.lower, b.lower) || byText(a.upper, b.upper) || byText(a.opening, b.opening))
  }
}

/**
 * MSG-17: whether a piece of enclosed floor no room claims (by its place among the floor's spaces)
 * leads to the open air: through a door or doorless opening a person fits through, with no room on
 * either side, from it to floor no wall encloses, or to another such piece that does. A gate in a
 * courtyard wall, or a passage out to the street. Worked out once per piece, when first asked.
 *
 * A piece a room claims is that room's. A piece with a dividing line along its edge is open on that
 * side, and one too narrow for a person to stand in (twice its area over its edge's length under
 * `passableWidth`) is a gap between walls, not a courtyard: past any of them, a wall stated
 * exterior faces outside, as before.
 */
function courtWays(
  plan: FloorPlan,
  index: PlanIndex,
  outlines: ReadonlyMap<string, RoomOutline>,
  reader: SideReader
): (wall: Wall, court: number) => boolean {
  const open = (piece: Space | undefined): boolean => {
    // Floor a room claims, reached past a wall that room does not list, is that room's: as before.
    if (piece === undefined || piece.rooms.length > 0) return true
    if (piece.walls.some((id) => index.wallsById.get(id)?.virtual === true)) return true
    const edge = piece.rings.reduce((sum, ring) => sum + ring.reduce((run, p, i) => run + Math.hypot(ring[(i + 1) % ring.length]!.x - p.x, ring[(i + 1) % ring.length]!.y - p.y), 0), 0)
    return edge === 0 || underFigure((2 * piece.area) / edge, limit('passableWidth'), 'm')
  }
  let joins: Map<number, (number | 'out')[]> | null = null
  const ways = (): Map<number, (number | 'out')[]> => {
    if (joins !== null) return joins
    joins = new Map()
    for (const opening of plan.openings) {
      if (opening.type === 'window' || shortOf(opening) !== null) continue
      const wall = index.wallsById.get(opening.wall)
      if (wall === undefined) continue
      const [left, right] = openingSides(opening, index, outlines)
      if (left !== null || right !== null) continue
      const along = opening.offset + opening.width / 2
      const beyond = wallBeyond(wall)
      if (beyond === 'common' || beyond === 'neighbour') continue
      const a = reader.enclosedAt(wall, along, 'left')
      const b = reader.enclosedAt(wall, along, 'right')
      const join = (from: number | null, to: number | null): void => {
        if (from === null || from === to) return
        joins!.set(from, [...(joins!.get(from) ?? []), to ?? 'out'])
      }
      join(a, b)
      join(b, a)
    }
    return joins
  }
  const known = new Map<number, boolean>()
  return (wall, court) => {
    if (open(reader.piece(wall, court))) return true
    const was = known.get(court)
    if (was !== undefined) return was
    const seen = new Set([court])
    const queue = [court]
    let out = false
    while (queue.length > 0 && !out) {
      for (const next of ways().get(queue.shift()!) ?? []) {
        if (next === 'out') out = true
        else if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    for (const piece of seen) known.set(piece, out)
    return out
  }
}
