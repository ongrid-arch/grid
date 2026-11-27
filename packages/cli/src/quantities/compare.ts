/**
 * Comparing plans the way people compare them: options side by side in one table by use, and
 * what differs between two of them by room name, in metres and square metres.
 *
 * Two plans written separately share no ids, so nothing here pairs things by id first. Rooms
 * are paired by name, walls by where they stand, openings by where they are in a wall. Before
 * anything is listed, the second plan is tried as the first one moved, mirrored or turned a
 * quarter: a flipped flat is said to be flipped, not listed as twenty moved walls (Y-4, Y-5).
 *
 * WRT-29: the likeness is found with openings paired by place only, so an opening that stands
 * somewhere else under its id is never "where it was"; what differs is then paired as `grid_diff`
 * pairs it (`alignPlans`), and an opening whose middle moved is said to have moved, and how far.
 *
 * WRT-32: a room that kept its name and size and stands somewhere else moved, as it was: said with
 * how far and which way, never counted among the rooms that keep their name and size.
 */
import { alignPlans, centroid, compareMassing, curveFault, floorChanges, tolerance, wallAxis, wallLength, wallPath, wallPointAt, type FloorChange, type FloorPlan, type MassingFigures, type Opening, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said, type MessageKey, type Said } from '@ongrid/floorplan/messages'
import { notCountedRooms, planAreas, roomKey, type PlanAreas } from './areas'
import { lettableFigures, peopleRatios, type LettableChoice, type PeopleFigures, type PeopleRatio } from './lettable'
import { planSeating } from './seats'
import { sideNames, type Survey } from './survey'

/** Two sizes closer than this are one (MSG-15's `joint`; arithmetic, so it never changes). */
const joint = tolerance('joint')
/** WRT-29: two openings whose middles are this close stand in the same place, as in the diff. */
const samePlaceM = tolerance('diffPlace')

export interface OptionRow {
  readonly label: string
  readonly rooms: number
  readonly bedrooms: number
  readonly net: number
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  /** ARE-60: the living area under air and the total under roof; `underAirFirst` when they lead (a US plan). */
  readonly conditioned: number | null
  readonly underRoof: number | null
  readonly underAirFirst: boolean
  readonly circulation: number
  readonly circulationShare: number | null
  readonly netToGross: number | null
  readonly byUse: Readonly<Record<string, number>>
  /** ARE-61: the net floor by the firm's room type and by tenure; only on a plan where a room states one. */
  readonly byRoomType?: Readonly<Record<string, number>>
  readonly byTenure?: Readonly<Record<string, number>>
  /** ARE-68: the lettable area, the core and efficiency (lettable over gross internal, null without it). */
  readonly lettable: number
  readonly core: number
  readonly efficiency: number | null
  readonly coreShare: number | null
  /** ARE-68: the area per one of each figure for who the building is for; only where one is given or counted. */
  readonly people?: readonly PeopleRatio[]
}

/** ARE-68: the lettable rooms as the person counts them, and who the building is for: the call's, else the plan's brief's. */
export interface OptionAsk {
  readonly choice?: LettableChoice
  readonly people?: PeopleFigures
  readonly brief?: PeopleFigures
}

export function optionRow(label: string, survey: Survey, ask: OptionAsk = {}): OptionRow {
  const areas: PlanAreas = planAreas(survey)
  const letting = lettableFigures(areas, ask.choice)
  const people = peopleRatios(areas, letting, { ...(ask.people ? { asked: ask.people } : {}), ...(ask.brief ? { brief: ask.brief } : {}) }, planSeating(survey).plan)
  const byUse: Record<string, number> = {}
  for (const floor of areas.floors) for (const [use, value] of Object.entries(floor.byUse)) byUse[use] = (byUse[use] ?? 0) + value
  // CNT-8: a zone is part of a room, not a room of its own. CNT-27: the rooms are counted as
  // grid_count counts them, as the net does: a stair or lift shaft once, no void or outdoor space.
  const left = notCountedRooms(areas)
  const rooms = survey.rooms.filter((room) => room.facts.zoneOf === undefined)
  const counted = rooms.filter((room) => !left.has(roomKey(room.facts.floor, room.facts.id)))
  return {
    label,
    rooms: counted.length,
    bedrooms: rooms.filter((room) => room.facts.use === 'bedroom').length,
    net: areas.net,
    grossInternal: areas.grossInternal,
    grossExternal: areas.grossExternal,
    conditioned: areas.conditioned,
    underRoof: areas.underRoof,
    underAirFirst: areas.underAir.first,
    circulation: areas.circulation,
    circulationShare: areas.circulationShare,
    netToGross: areas.netToGross,
    byUse,
    ...(areas.byRoomType === undefined ? {} : { byRoomType: areas.byRoomType }),
    ...(areas.byTenure === undefined ? {} : { byTenure: areas.byTenure }),
    lettable: letting.lettable,
    core: letting.core,
    efficiency: letting.efficiency,
    coreShare: letting.coreShare,
    ...(people.length === 0 ? {} : { people }),
  }
}

/** How the second plan sits against the first, when it is the same building. */
export type Likeness = 'same' | 'moved' | 'mirrored left to right' | 'mirrored top to bottom' | 'turned half round' | 'turned a quarter' | null

export interface RoomDelta {
  readonly name: string
  readonly before: number | null
  readonly after: number | null
  /**
   * WRT-32: how far its middle moved on the drawing, in metres (to the centimetre), when it is the
   * one room of its name in both plans (by floor and id in place), kept its size and stands
   * somewhere else; null otherwise.
   */
  readonly moved: number | null
  /** WRT-32: which way, in metres east and north on the drawing; null when it did not move. */
  readonly by: readonly [number, number] | null
}

/** WRT-32: a room that moved as it was, with its line. */
export interface RoomMove {
  readonly name: string
  readonly moved: number
  readonly by: readonly [number, number]
  readonly text: string
}

export interface WallDelta {
  readonly id: string
  readonly kind: Wall['kind']
  readonly length: number
  readonly height: number
  /** Both faces, length times height each. */
  readonly faceArea: number
  /** The rooms on its two sides, by name, in the plan it is in. */
  readonly between: readonly string[]
}

/** A wall that stands somewhere else, or is another length, under the same id. */
export interface WallChange {
  readonly id: string
  readonly kind: Wall['kind']
  readonly lengthBefore: number
  readonly lengthAfter: number
  /** How far its middle moved, in metres. */
  readonly moved: number
}

/**
 * A wall that stands where it stood but is another height or thickness (WRT-2, lab AB-2: a
 * read-back lowered every wall from 3.00 to 2.70 m and the verdict said nothing changed).
 */
export interface WallSizeChange {
  readonly id: string
  readonly heightBefore: number
  readonly heightAfter: number
  readonly thicknessBefore: number
  readonly thicknessAfter: number
}

export interface OpeningDelta {
  readonly id: string
  readonly type: string
  readonly width: number
  readonly height: number
  readonly between: readonly [string, string]
}

export interface OpeningChange {
  readonly id: string
  readonly type: string
  readonly changes: readonly string[]
  /** WRT-29: how far its middle moved on the drawing, in metres (to the centimetre); null when it stands where it stood. */
  readonly moved: number | null
}

/** WRT-25: a floor's old and new figures, as data, with its line. */
export type FloorFigures = Omit<FloorChange, 'said' | 'inSentence'> & { readonly text: string }

export interface Comparison {
  readonly likeness: Likeness
  readonly shift: Vec2 | null
  readonly rooms: readonly RoomDelta[]
  readonly netBefore: number
  readonly netAfter: number
  readonly wallsOut: readonly WallDelta[]
  readonly wallsNew: readonly WallDelta[]
  readonly wallsChanged: readonly WallChange[]
  /** Walls in their place at another height or thickness: named in the verdict, whatever the likeness. */
  readonly wallsResized: readonly WallSizeChange[]
  readonly openingsOut: readonly OpeningDelta[]
  readonly openingsNew: readonly OpeningDelta[]
  readonly openingsChanged: readonly OpeningChange[]
  /** WRT-32: the rooms that kept their name and size and stand somewhere else, named in the verdict. */
  readonly roomsMoved: readonly RoomMove[]
  /**
   * WRT-25: the floors in both plans (by id, then by name) that stand elsewhere or changed their
   * level, elevation, height, slab or name: named in the verdict, whatever the likeness.
   */
  readonly floorsChanged: readonly FloorFigures[]
  /**
   * MSG-27: the massing and the site (outlines, homes, parking, buildings, the plot and its
   * things), each a line, and the figures side by side; a plan whose massing or site differs is
   * never the same building.
   */
  readonly massing: { readonly lines: readonly string[]; readonly figures: MassingFigures; readonly sideBySide: string | null }
  readonly verdict: string
}

type Transform = (p: Vec2) => Vec2

interface Box { minX: number; minY: number; maxX: number; maxY: number }

function boxOf(plan: FloorPlan): Box {
  // A curve bows out past its ends (CNT-18).
  const points = plan.walls.flatMap((w): Vec2[] => (w.arc !== undefined && curveFault(w) === null ? wallPath(w) : [pt(w.start), pt(w.end)]))
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

/** The ways the first plan's box can be laid on the second's, the plain one first. */
function transforms(a: Box, b: Box): Array<{ likeness: Exclude<Likeness, null>; map: Transform }> {
  const list: Array<{ likeness: Exclude<Likeness, null>; map: Transform }> = [
    { likeness: 'same', map: (p) => p },
    { likeness: 'moved', map: (p) => ({ x: p.x - a.minX + b.minX, y: p.y - a.minY + b.minY }) },
    { likeness: 'mirrored left to right', map: (p) => ({ x: a.maxX - p.x + b.minX, y: p.y - a.minY + b.minY }) },
    { likeness: 'mirrored top to bottom', map: (p) => ({ x: p.x - a.minX + b.minX, y: a.maxY - p.y + b.minY }) },
    { likeness: 'turned half round', map: (p) => ({ x: a.maxX - p.x + b.minX, y: a.maxY - p.y + b.minY }) },
    { likeness: 'turned a quarter', map: (p) => ({ x: a.maxY - p.y + b.minX, y: p.x - a.minX + b.minY }) },
    { likeness: 'turned a quarter', map: (p) => ({ x: p.y - a.minY + b.minX, y: a.maxX - p.x + b.minY }) },
  ]
  return list
}

const NEAR_M = 0.05

function close(p: Vec2, q: Vec2, tolerance = NEAR_M): boolean {
  return Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance
}

const pt = (pair: readonly [number, number]): Vec2 => ({ x: pair[0], y: pair[1] })

/** The same wall's place: its two ends, either way round, and solid or a dividing line in both. */
function samePlace(a: Wall, b: Wall, map: Transform): boolean {
  const s = map(pt(a.start))
  const e = map(pt(a.end))
  const ends = (close(s, pt(b.start)) && close(e, pt(b.end))) || (close(s, pt(b.end)) && close(e, pt(b.start)))
  return ends && (a.virtual === true) === (b.virtual === true) && sameCurve(a, b, map)
}

/** CNT-18: both straight, or both curved through the same middle round the same centre. */
function sameCurve(a: Wall, b: Wall, map: Transform): boolean {
  if (a.arc === undefined || b.arc === undefined) return a.arc === b.arc
  const middle = (w: Wall): Vec2 | null => (curveFault(w) === null ? wallPointAt(w, wallLength(w) / 2) : null)
  const [ma, mb] = [middle(a), middle(b)]
  if (ma === null || mb === null) return false
  return close(map(pt(a.arc.centre)), pt(b.arc.centre)) && close(map(ma), mb)
}

/** A wall's length along its axis, curved or not; 0 for one that cannot be built. */
function lengthOf(wall: Wall): number {
  if (wall.arc !== undefined) return curveFault(wall) === null ? wallLength(wall) : 0
  // WRT-44: a straight wall whose ends are one point (a plan an older writer wrote) is 0 long.
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

/**
 * The same wall: in its place. A wall another height or thickness in its place is the same wall
 * resized, listed in `wallsResized` and named in the verdict, never left unsaid.
 */
function sameWall(a: Wall, b: Wall, map: Transform): boolean {
  return samePlace(a, b, map)
}

/** Walls of `a` that stand in their place in `b` at another height or thickness. */
function wallsResized(a: FloorPlan, b: FloorPlan, map: Transform): WallSizeChange[] {
  const out: WallSizeChange[] = []
  for (const wall of a.walls) {
    if (wall.virtual === true) continue
    const other = b.walls.find((x) => (x.floor ?? 'ground') === (wall.floor ?? 'ground') && samePlace(wall, x, map))
    if (!other) continue
    if (Math.abs(wall.height - other.height) < joint && Math.abs(wall.thickness - other.thickness) < joint) continue
    out.push({ id: other.id, heightBefore: wall.height, heightAfter: other.height, thicknessBefore: wall.thickness, thicknessAfter: other.thickness })
  }
  return out
}

/** "15 walls another height (3.00 → 2.70 m)", or null when none is. */
function resizedWords(list: readonly WallSizeChange[]): string[] {
  const parts: string[] = []
  const say = (what: string, pick: (w: WallSizeChange) => [number, number]): void => {
    const changed = list.filter((w) => Math.abs(pick(w)[0] - pick(w)[1]) >= joint)
    if (changed.length === 0) return
    const pairs = [...new Set(changed.map((w) => `${pick(w)[0].toFixed(2)} → ${pick(w)[1].toFixed(2)} m`))]
    const shown = pairs.length > 3 ? `${pairs.slice(0, 3).join(', ')} and more` : pairs.join(', ')
    parts.push(`${changed.length} wall${changed.length === 1 ? '' : 's'} another ${what} (${shown})`)
  }
  say('height', (w) => [w.heightBefore, w.heightAfter])
  say('thickness', (w) => [w.thicknessBefore, w.thicknessAfter])
  return parts
}

/** Where an opening's middle is, on its wall's axis. */
function openingAt(plan: FloorPlan, id: string): Vec2 | null {
  const o = plan.openings.find((x) => x.id === id)
  const wall = o && plan.walls.find((w) => w.id === o.wall)
  if (!o || !wall) return null
  const along = o.offset + o.width / 2
  if (wall.arc !== undefined) return curveFault(wall) === null ? wallPointAt(wall, along) : null
  if (lengthOf(wall) === 0) return null
  const axis = wallAxis(wall)
  return { x: axis.start.x + axis.dir.x * along, y: axis.start.y + axis.dir.y * along }
}

/** Walls of `a` with no wall of `b` in their place, under `map`. */
function wallsMissing(a: FloorPlan, b: FloorPlan, map: Transform): Wall[] {
  return a.walls.filter((wall) => !b.walls.some((other) => (other.floor ?? 'ground') === (wall.floor ?? 'ground') && sameWall(wall, other, map)))
}

interface OpeningPair { a: string; b: string }

/** The floor an opening is on: its wall's (C5). */
function openingFloor(plan: FloorPlan, wallId: string): string {
  return plan.walls.find((w) => w.id === wallId)?.floor ?? 'ground'
}

/**
 * Openings paired by where they are, under `map`: the likeness is found with these. WRT-29: an
 * opening somewhere else is never paired by its id here, so it is never "where it was"; only two
 * openings whose places cannot be worked out (a curve that cannot be built) are paired by id.
 */
function pairOpenings(a: FloorPlan, b: FloorPlan, map: Transform): { pairs: OpeningPair[]; onlyA: string[]; onlyB: string[] } {
  const pairs: OpeningPair[] = []
  const usedB = new Set<string>()
  for (const o of a.openings) {
    const at = openingAt(a, o.id)
    const floor = openingFloor(a, o.wall)
    const match = b.openings.find((x) => {
      // The same place on another floor is another opening (WRT-3: a window moved on one floor of a block).
      if (usedB.has(x.id) || x.type !== o.type || openingFloor(b, x.wall) !== floor) return false
      const there = openingAt(b, x.id)
      if (at === null || there === null) return at === there && x.id === o.id
      return close(map(at), there, Math.max(NEAR_M, Math.abs(x.width - o.width) / 2 + NEAR_M))
    })
    if (match) {
      pairs.push({ a: o.id, b: match.id })
      usedB.add(match.id)
    }
  }
  const pairedA = new Set(pairs.map((p) => p.a))
  return { pairs, onlyA: a.openings.filter((o) => !pairedA.has(o.id)).map((o) => o.id), onlyB: b.openings.filter((o) => !usedB.has(o.id)).map((o) => o.id) }
}

/**
 * WRT-29: openings paired as `grid_diff` pairs them (`alignPlans`): by place, then at their place
 * along a wall that moved, then by id of the same type, then by id; by id first when both plans
 * were written rooms first, whose authors named their openings.
 */
function pairOpeningsAsDiff(a: FloorPlan, b: FloorPlan): { pairs: OpeningPair[]; onlyA: string[]; onlyB: string[] } {
  const idsFirst = a.written?.from === 'rooms' && b.written?.from === 'rooms'
  const found = alignPlans(a, b, { idsFirst }).openings
  const pairs = a.openings.flatMap((o) => (found.has(o.id) ? [{ a: o.id, b: found.get(o.id)! }] : []))
  const pairedB = new Set(pairs.map((p) => p.b))
  return { pairs, onlyA: a.openings.filter((o) => !found.has(o.id)).map((o) => o.id), onlyB: b.openings.filter((o) => !pairedB.has(o.id)).map((o) => o.id) }
}

type MovedHow = 'along' | 'with' | 'plain'

interface OpeningMove {
  readonly id: string
  readonly type: Opening['type']
  readonly how: MovedHow
  /** Metres, to the centimetre. */
  readonly by: number
}

const MOVED_WORDS: Readonly<Record<MovedHow, MessageKey>> = { along: 'compare.opening.moved.along', with: 'compare.opening.moved.with', plain: 'compare.opening.moved' }

/**
 * WRT-29: how far an opening paired across the two plans moved, and how: along its wall (its wall
 * stands where it stood), with its wall (its wall moved and it kept its place along it, from
 * either end), or plainly. Null when it stands where it stood: its middle no further than
 * `diffPlace`, or half the change of its width more (an opening widened from one edge).
 */
function openingMove(a: FloorPlan, b: FloorPlan, oa: Opening, ob: Opening, map: Transform): OpeningMove | null {
  const from = openingAt(a, oa.id)
  const to = openingAt(b, ob.id)
  if (from === null || to === null) return null
  const at = map(from)
  const distance = Math.hypot(to.x - at.x, to.y - at.y)
  if (distance <= samePlaceM + Math.abs(oa.width - ob.width) / 2) return null
  const wa = a.walls.find((w) => w.id === oa.wall)
  const wb = b.walls.find((w) => w.id === ob.wall)
  let how: MovedHow = 'plain'
  if (wa !== undefined && wb !== undefined) {
    if (samePlace(wa, wb, map)) how = 'along'
    else {
      const [la, lb] = [lengthOf(wa), lengthOf(wb)]
      const [ma, mb] = [oa.offset + oa.width / 2, ob.offset + ob.width / 2]
      const reversed = dirOf(wa, map).x * dirOf(wb, (p) => p).x + dirOf(wa, map).y * dirOf(wb, (p) => p).y < 0
      const ends = reversed ? [[ma, lb - mb], [la - ma, mb]] : [[ma, mb], [la - ma, lb - mb]]
      if (ends.some(([x, y]) => Math.abs(x! - y!) <= samePlaceM)) how = 'with'
    }
  }
  return { id: ob.id, type: ob.type, how, by: Math.round(distance * 100) / 100 }
}

const metres = (value: number): string => value.toFixed(2)

/** WRT-29: the words for an opening that moved, among its changes. */
function movedWords(move: OpeningMove): Said {
  return said(MOVED_WORDS[move.how], { by: num(metres(move.by)) })
}

/** WRT-29: the openings that moved, in the verdict: one by its id, more counted with how far. */
function movedPart(moves: readonly OpeningMove[]): string | null {
  if (moves.length === 0) return null
  if (moves.length === 1) {
    const move = moves[0]!
    return english(said('compare.openings.moved.one', { type: said(`describe.word.${move.type}` as const), id: name(move.id), how: movedWords(move) }))
  }
  const types = new Set(moves.map((m) => m.type))
  const kind = types.size === 1 ? said(`compare.word.${[...types][0]!}s` as const) : said('compare.word.openings')
  const figures = moves.map((m) => m.by)
  const [low, high] = [metres(Math.min(...figures)), metres(Math.max(...figures))]
  const range = low === high ? num(low) : said('compare.range', { from: num(low), to: num(high) })
  const hows = new Set(moves.map((m) => m.how))
  const how = hows.size === 1 && hows.has('along') ? said('compare.openings.how.along') : hows.size === 1 && hows.has('with') ? said('compare.openings.how.with') : ''
  return english(said('compare.openings.moved.many', { count: moves.length, kind, range, how }))
}

function wallRooms(survey: Survey, wall: Wall): string[] {
  return survey.rooms.filter((room) => room.edges.some((edge) => edge.wall?.id === wall.id)).map((room) => room.facts.name)
}

function wallDelta(survey: Survey, wall: Wall): WallDelta {
  const length = lengthOf(wall)
  return {
    id: wall.id,
    kind: wall.kind,
    length,
    height: wall.height,
    faceArea: wall.virtual === true ? 0 : 2 * length * wall.height,
    between: wallRooms(survey, wall),
  }
}

function namesOf(survey: Survey, sides: readonly [string, string]): [string, string] {
  return sides.map((side) => survey.facts.rooms.get(side)?.name ?? side) as [string, string]
}

function openingDelta(survey: Survey, id: string): OpeningDelta {
  const facts = survey.facts.openings.get(id)
  const o = survey.plan.openings.find((x) => x.id === id)!
  return { id, type: o.type, width: o.width, height: o.height, between: facts ? namesOf(survey, sideNames(facts)) : ['?', '?'] }
}

/** The room a door opens into, by name, or null when the plan does not say. */
function opensInto(survey: Survey, id: string): string | null {
  const o = survey.plan.openings.find((x) => x.id === id)
  const facts = survey.facts.openings.get(id)
  if (!o || o.type !== 'door' || o.swing === undefined || !facts) return null
  const [left, right] = namesOf(survey, sideNames(facts))
  return o.swing === 'left' ? left : right
}

function sameDirection(a: FloorPlan, b: FloorPlan, wallA: string, wallB: string, map: Transform): boolean {
  const wa = a.walls.find((w) => w.id === wallA)
  const wb = b.walls.find((w) => w.id === wallB)
  if (!wa || !wb) return true
  const da = dirOf(wa, map)
  const db = dirOf(wb, (p) => p)
  return da.x * db.x + da.y * db.y > 0
}

function dirOf(wall: Wall, map: Transform): Vec2 {
  const s = map(pt(wall.start))
  const e = map(pt(wall.end))
  return { x: e.x - s.x, y: e.y - s.y }
}

function intoA(a: Survey, id: string): string {
  const before = opensInto(a, id)
  return before === null ? '' : ` (it opened into ${JSON.stringify(before)})`
}

/** WRT-11: each room's net area as grid_areas gives it (columns off), by floor and id; one measure for both plans. */
function netsOf(s: Survey): Map<string, number> {
  const out = new Map<string, number>()
  for (const floor of planAreas(s).floors) for (const room of floor.rooms) out.set(`${floor.floor}\u0000${room.id}`, room.net ?? 0)
  return out
}

function roomDeltas(a: Survey, b: Survey): RoomDelta[] {
  const byName = (s: Survey): Map<string, number> => {
    const nets = netsOf(s)
    const map = new Map<string, number>()
    for (const room of s.rooms) map.set(room.facts.name, (map.get(room.facts.name) ?? 0) + (nets.get(`${room.facts.floor}\u0000${room.facts.id}`) ?? 0))
    return map
  }
  const before = byName(a)
  const after = byName(b)
  const names = [...new Set([...before.keys(), ...after.keys()])]
  return names.map((name) => ({ name, before: before.get(name) ?? null, after: after.get(name) ?? null, moved: null, by: null }))
}

/** WRT-32: at most this many rooms that moved are named in the verdict; more are counted. */
const ROOMS_MOVED_NAMED = 3

/** WRT-32: "1.00 m east and 0.50 m north on the drawing". */
function moveText(dx: number, dy: number): string {
  const least = tolerance('diffMovement')
  const parts: Said[] = []
  if (Math.abs(dx) >= least) parts.push(said(dx > 0 ? 'compare.move.east' : 'compare.move.west', { by: num(metres(Math.abs(dx))) }))
  if (Math.abs(dy) >= least) parts.push(said(dy > 0 ? 'compare.move.north' : 'compare.move.south', { by: num(metres(Math.abs(dy))) }))
  return english(said('compare.move.onDrawing', { parts: joined(parts, 'join.and') }))
}

/**
 * WRT-32: the rooms that kept their size and stand somewhere else, under `map`: paired by name, the
 * one room of its name on its floor in each plan, or by floor and id in place. A room of the same
 * area and box whose middle is further than `diffPlace` from where it stood moved.
 */
function roomMoves(a: Survey, b: Survey, map: Transform, inPlace: boolean): RoomMove[] {
  const nets = { a: netsOf(a), b: netsOf(b) }
  const key = (room: Survey['rooms'][number]): string => (inPlace ? `${room.facts.floor}\u0000${room.facts.id}` : `${room.facts.floor}\u0000${room.facts.name}`)
  const only = (s: Survey): Map<string, Survey['rooms'][number]> => {
    const counts = new Map<string, number>()
    for (const room of s.rooms) counts.set(key(room), (counts.get(key(room)) ?? 0) + 1)
    return new Map(s.rooms.filter((room) => counts.get(key(room)) === 1 && room.polygon.length >= 3).map((room) => [key(room), room] as const))
  }
  const now = only(b)
  const out: RoomMove[] = []
  for (const [k, was] of only(a)) {
    const is = now.get(k)
    if (is === undefined) continue
    const net = (s: 'a' | 'b', room: Survey['rooms'][number]): number => nets[s].get(`${room.facts.floor}\u0000${room.facts.id}`) ?? 0
    if (Math.abs(net('a', was) - net('b', is)) >= 0.01) continue
    const size = (polygon: readonly Vec2[]): [number, number] => [Math.max(...polygon.map((p) => p.x)) - Math.min(...polygon.map((p) => p.x)), Math.max(...polygon.map((p) => p.y)) - Math.min(...polygon.map((p) => p.y))]
    const mapped = was.polygon.map(map)
    const [[wa, da], [wb, db]] = [size(mapped), size(is.polygon)]
    if (Math.abs(wa - wb) >= joint || Math.abs(da - db) >= joint) continue
    const from = centroid(mapped)
    const to = centroid(is.polygon)
    const [dx, dy] = [to.x - from.x, to.y - from.y]
    const moved = Math.hypot(dx, dy)
    if (moved <= samePlaceM) continue
    const by: [number, number] = [Math.round(dx * 100) / 100, Math.round(dy * 100) / 100]
    out.push({ name: is.facts.name, moved: Math.round(moved * 100) / 100, by, text: english(said('compare.room.moved.one', { room: name(is.facts.name), by: moveText(dx, dy) })) })
  }
  return out
}

/** WRT-32: the verdict's part for the rooms that moved: a few by name, more counted with how far. */
function roomsMovedPart(moves: readonly RoomMove[]): string[] {
  if (moves.length <= ROOMS_MOVED_NAMED) return moves.map((m) => m.text)
  const figures = moves.map((m) => m.moved)
  const [low, high] = [metres(Math.min(...figures)), metres(Math.max(...figures))]
  return [english(said('compare.room.moved.many', { count: moves.length, range: low === high ? num(low) : said('compare.range', { from: num(low), to: num(high) }) }))]
}

/** WRT-11: how rooms changed between a plan and the same plan changed in place, paired by floor and id. */
type RoomKind = 'renamed' | 'used differently' | 'differ in size' | 'added' | 'taken out'
function roomChanges(a: Survey, b: Survey): Map<RoomKind, string[]> {
  const nets = { a: netsOf(a), b: netsOf(b) }
  const key = (room: Survey['rooms'][number]): string => `${room.facts.floor}\u0000${room.facts.id}`
  const was = new Map(a.rooms.map((room) => [key(room), room] as const))
  const now = new Map(b.rooms.map((room) => [key(room), room] as const))
  const out = new Map<RoomKind, string[]>()
  // CNT-27: a stair or lift room over the lowest of its shaft is that shaft, counted once, on the
  // floor it rises from: its change is the shaft's.
  const shafts = { a: notCountedRooms(planAreas(a)), b: notCountedRooms(planAreas(b)) }
  const seen = new Map<RoomKind, Set<string>>()
  const add = (kind: RoomKind, room: Survey['rooms'][number], plan: 'a' | 'b' = 'b'): void => {
    const shaft = shafts[plan].get(key(room))
    const lowest = shaft?.why === 'shaft' && shaft.with !== undefined ? shaft.with : { floor: room.facts.floor, room: room.facts.id }
    const counted = seen.get(kind) ?? new Set<string>()
    if (counted.has(roomKey(lowest.floor, lowest.room))) return
    counted.add(roomKey(lowest.floor, lowest.room))
    seen.set(kind, counted)
    out.set(kind, [...(out.get(kind) ?? []), lowest.floor])
  }
  for (const [k, room] of now) {
    const old = was.get(k)
    if (old === undefined) {
      add('added', room)
      continue
    }
    if (old.facts.name !== room.facts.name) add('renamed', room)
    if (old.facts.use !== room.facts.use) add('used differently', room)
    if (Math.abs((nets.a.get(k) ?? 0) - (nets.b.get(k) ?? 0)) >= 0.01) add('differ in size', room)
  }
  for (const [k, room] of was) if (!now.has(k)) add('taken out', room, 'a')
  return out
}

/**
 * WRT-11: "2 rooms renamed", and on a building of several floors "92 rooms (2 on each of 46
 * floors) differ in size": the count of rooms, never of names.
 */
function roomCountWords(kind: RoomKind, floors: readonly string[]): string {
  const n = floors.length
  const perFloor = new Map<string, number>()
  for (const floor of floors) perFloor.set(floor, (perFloor.get(floor) ?? 0) + 1)
  const counts = [...new Set(perFloor.values())]
  const where = perFloor.size <= 1 ? '' : counts.length === 1 ? ` (${counts[0]} on each of ${perFloor.size} floors)` : ` (on ${perFloor.size} floors)`
  const verb = kind === 'differ in size' && n === 1 ? 'differs in size' : kind
  return `${n} room${n === 1 ? '' : 's'}${where} ${verb}`
}

const sum = (values: readonly number[]): number => values.reduce((x, y) => x + y, 0)

/** The uses a plan's rooms and zones state, each once, in plan order. */
const usesOf = (s: Survey): string[] => [...new Set(s.rooms.flatMap((r) => (r.facts.use === undefined ? [] : [r.facts.use])))]

function areaWord(value: number): string {
  return `${value.toFixed(2)} m²`
}

/** What differs between two plans, `a` before and `b` after. */
export function comparePlans(a: Survey, b: Survey, labels: readonly [string, string] = ['before', 'after'], options: { readonly inPlace?: boolean } = {}): Comparison {
  // WRT-11: `inPlace` is a plan and the same plan after a change: it stands where it stood, rooms pair
  // by floor and id, and it is never read as the plan mirrored or turned.
  const inPlace = options.inPlace === true
  const boxA = boxOf(a.plan)
  const boxB = boxOf(b.plan)
  // The first likeness under which every wall and opening has its place.
  let likeness: Likeness = null
  let map: Transform = (p) => p
  for (const t of inPlace ? transforms(boxA, boxB).slice(0, 1) : transforms(boxA, boxB)) {
    if (a.plan.walls.length !== b.plan.walls.length || a.plan.openings.length !== b.plan.openings.length) break
    if (wallsMissing(a.plan, b.plan, t.map).length > 0) continue
    const o = pairOpenings(a.plan, b.plan, t.map)
    if (o.onlyA.length > 0 || o.onlyB.length > 0) continue
    // The same building has every opening the same size, and every door hung the same way.
    const alike = o.pairs.every(({ a: ia, b: ib }) => {
      const oa = a.plan.openings.find((x) => x.id === ia)!
      const ob = b.plan.openings.find((x) => x.id === ib)!
      const sized = Math.abs(oa.width - ob.width) < joint && Math.abs(oa.height - ob.height) < joint && Math.abs(oa.sill - ob.sill) < joint
      const plain = t.likeness === 'same' || t.likeness === 'moved'
      return sized && (!plain || (oa.swing === ob.swing && oa.hinge === ob.hinge) || !sameDirection(a.plan, b.plan, oa.wall, ob.wall, t.map))
    })
    if (!alike) continue
    if (inPlace && roomChanges(a, b).size > 0) continue
    if (roomDeltas(a, b).some((r) => r.before === null || r.after === null || Math.abs(r.before - r.after) >= 0.01)) continue
    likeness = t.likeness
    map = t.map
    break
  }
  // MSG-27: the same walls and rooms on other blocks, homes or a site changed are not the same building.
  const massingFound = likeness === null || likeness === 'same' || likeness === 'moved' ? compareMassing(a.plan, b.plan, likeness === 'moved' ? [boxB.minX - boxA.minX, boxB.minY - boxA.minY] : [0, 0]) : null
  const massingLines = (massingFound?.lines ?? []).map((line) => english(line.said))
  if (massingLines.length > 0) likeness = null
  const shift = likeness === 'moved' ? { x: boxB.minX - boxA.minX, y: boxB.minY - boxA.minY } : null
  if (likeness === null) {
    // Not the same building: compare in place, allowing a shifted origin when the boxes agree in size.
    const sameBox = Math.abs(boxA.maxX - boxA.minX - (boxB.maxX - boxB.minX)) < NEAR_M && Math.abs(boxA.maxY - boxA.minY - (boxB.maxY - boxB.minY)) < NEAR_M
    map = sameBox && !inPlace ? transforms(boxA, boxB)[1]!.map : (p) => p
  }

  // WRT-32: the rooms that moved as they were; none when the plan is the same building, each in its place.
  const roomsMoved = likeness === null ? roomMoves(a, b, map, inPlace) : []
  // Said on its row by name only when no other room has the name: a row sums the rooms of its name.
  const named = (name: string): number => b.rooms.filter((room) => room.facts.name === name).length
  const movedByName = new Map(roomsMoved.filter((m) => named(m.name) === 1).map((m) => [m.name, m] as const))
  const rooms = roomDeltas(a, b).map((r) => {
    const m = movedByName.get(r.name)
    return m === undefined ? r : { ...r, moved: m.moved, by: m.by }
  })
  // A zone's floor is its room's (CNT-8): counted once.
  // WRT-11: grid_areas' net, the same rule on both plans.
  const netOf = (s: Survey): number => planAreas(s).net
  const netBefore = netOf(a)
  const netAfter = netOf(b)
  const inverse = (wall: Wall): boolean => !a.plan.walls.some((other) => sameWall(other, wall, map))
  const missing = likeness ? [] : wallsMissing(a.plan, b.plan, map)
  const added = likeness ? [] : b.plan.walls.filter(inverse)
  // Walls not in their place that keep their id were moved or stretched, not taken out (Y-4).
  const wallsChanged: WallChange[] = []
  for (const wall of missing) {
    const same = added.find((other) => other.id === wall.id)
    if (!same) continue
    const mid = (w: Wall): Vec2 => ({ x: (w.start[0] + w.end[0]) / 2, y: (w.start[1] + w.end[1]) / 2 })
    const from = map(mid(wall))
    const to = mid(same)
    wallsChanged.push({ id: wall.id, kind: same.kind, lengthBefore: lengthOf(wall), lengthAfter: lengthOf(same), moved: Math.hypot(to.x - from.x, to.y - from.y) })
  }
  const changedIds = new Set(wallsChanged.map((w) => w.id))
  const wallsOut = missing.filter((wall) => !changedIds.has(wall.id)).map((wall) => wallDelta(a, wall))
  const wallsNew = added.filter((wall) => !changedIds.has(wall.id)).map((wall) => wallDelta(b, wall))
  // WRT-29: what differs is paired as grid_diff pairs it; the same building lists no openings.
  const paired = likeness ? { pairs: [], onlyA: [], onlyB: [] } : pairOpeningsAsDiff(a.plan, b.plan)
  const openingsOut = paired.onlyA.map((id) => openingDelta(a, id))
  const openingsNew = paired.onlyB.map((id) => openingDelta(b, id))
  const openingsChanged: OpeningChange[] = []
  const moves: OpeningMove[] = []
  // The openings with a change other than where they are: "N openings changed" counts these.
  const otherChanged = new Set<string>()
  let swingChanged: { id: string; detail: string } | undefined
  if (likeness === null) {
    for (const pair of paired.pairs) {
      const oa = a.plan.openings.find((o) => o.id === pair.a)!
      const ob = b.plan.openings.find((o) => o.id === pair.b)!
      const changes: string[] = []
      // WRT-29: a door turned into a window under its id, as the diff says it.
      if (oa.type !== ob.type) changes.push(english(said(`compare.opening.was.${oa.type}` as const)))
      if (Math.abs(oa.width - ob.width) > joint) changes.push(`width ${oa.width.toFixed(2)} → ${ob.width.toFixed(2)} m`)
      if (Math.abs(oa.height - ob.height) > joint) changes.push(`height ${oa.height.toFixed(2)} → ${ob.height.toFixed(2)} m`)
      if (Math.abs(oa.sill - ob.sill) > joint) changes.push(`sill ${oa.sill.toFixed(2)} → ${ob.sill.toFixed(2)} m`)
      // The walls may run the other way in the other plan: then left and right, start and end swap.
      const wa = a.plan.walls.find((w) => w.id === oa.wall)
      const wb = b.plan.walls.find((w) => w.id === ob.wall)
      const flipped = wa !== undefined && wb !== undefined && dirOf(wa, map).x * dirOf(wb, (p) => p).x + dirOf(wa, map).y * dirOf(wb, (p) => p).y < 0
      const swingA = oa.swing === undefined ? undefined : flipped ? (oa.swing === 'left' ? 'right' : 'left') : oa.swing
      const hingeA = oa.hinge === undefined ? undefined : flipped ? (oa.hinge === 'start' ? 'end' : 'start') : oa.hinge
      if (swingA !== ob.swing) {
        const intoB = opensInto(b, pair.b)
        const detail = `now opens into ${intoB === null ? 'a side not said' : JSON.stringify(intoB)}${intoA(a, pair.a)}`
        changes.push(detail)
        swingChanged = { id: pair.b, detail }
      }
      if (hingeA !== ob.hinge && swingA === ob.swing) changes.push('hung from the other side')
      // CNT-14: a door or window of another kind.
      if ((oa.kind ?? null) !== (ob.kind ?? null)) changes.push(ob.kind === undefined ? `no kind stated now (was ${oa.kind})` : `now ${ob.kind}${oa.kind === undefined ? '' : ` (was ${oa.kind})`}`)
      // WRT-29: where it went, and how far, after what else changed.
      const move = openingMove(a.plan, b.plan, oa, ob, map)
      if (move !== null) moves.push(move)
      const other = changes.length
      if (move !== null) changes.push(english(movedWords(move)))
      if (changes.length > 0) openingsChanged.push({ id: pair.b, type: ob.type, changes, moved: move?.by ?? null })
      if (other > 0) otherChanged.add(pair.b)
    }
  }

  const resized = wallsResized(a.plan, b.plan, map)
  // WRT-25: a floor moved up or down is a change, whatever stands where on the drawing.
  const floors = floorChanges(a.plan, b.plan, { byName: true })
  const floorParts = floors.map((f) => english(f.inSentence))
  const floorsChanged: FloorFigures[] = floors.map((f) => ({ floor: f.floor, name: f.name, renamedFrom: f.renamedFrom, level: f.level, elevation: f.elevation, height: f.height, slab: f.slab, stands: f.stands, text: english(f.said) }))
  const resizedParts = [...floorParts, ...resizedWords(resized)]
  const but = resizedParts.length > 0 ? `, but ${resizedParts.join(' and ')}` : ''
  const [before, after] = labels
  let verdict: string
  if (likeness === 'same' && floorParts.length > 0) verdict = english(said('compare.same.floors', { after, before, changes: joined(resizedParts, 'join.and') }))
  else if (likeness === 'same') verdict = resizedParts.length > 0 ? `${after} is the same building as ${before}, every wall, opening and room where it was${but}.` : `${after} is the same building as ${before}: every wall, opening and room is where it was.`
  else if (likeness === 'moved') verdict = `${after} is the same building as ${before}, moved ${Math.hypot(shift!.x, shift!.y).toFixed(2)} m on the drawing${but}.`
  else if (likeness !== null) verdict = `${after} is ${before} ${likeness}: every room keeps its size (${areaWord(netAfter)} net)${but}.`
  else {
    const changed = rooms.filter((r) => r.before === null || r.after === null || Math.abs(r.before - r.after) >= 0.01)
    const parts = [`net ${areaWord(netBefore)} → ${areaWord(netAfter)} (${netAfter - netBefore >= 0 ? '+' : ''}${(netAfter - netBefore).toFixed(2)})`]
    if (inPlace) for (const [kind, floors] of roomChanges(a, b)) parts.push(roomCountWords(kind, floors))
    else if (changed.length > 0) parts.push(`${changed.length} room${changed.length === 1 ? ' differs' : 's differ'} by name or size`)
    if (wallsOut.length + wallsNew.length > 0) parts.push(`walls: ${wallsOut.length} out (${sum(wallsOut.map((w) => w.length)).toFixed(2)} m), ${wallsNew.length} new (${sum(wallsNew.map((w) => w.length)).toFixed(2)} m)`)
    if (wallsChanged.length > 0) parts.push(`${wallsChanged.length} wall${wallsChanged.length === 1 ? '' : 's'} moved or changed length`)
    parts.push(...resizedParts)
    parts.push(...massingLines)
    parts.push(...roomsMovedPart(roomsMoved))
    const openingWords = (n: number, what: string): string => `${n} ${n === 1 ? 'opening' : 'openings'} ${what}`
    // WRT-29: the openings that moved in a part of their own, with how far.
    const moved = movedPart(moves)
    if (moved !== null) parts.push(moved)
    if (inPlace) {
      if (otherChanged.size === 1 && swingChanged !== undefined) {
        parts.push(`1 opening changed (${JSON.stringify(swingChanged.id)} ${swingChanged.detail})`)
      } else if (otherChanged.size > 0) parts.push(openingWords(otherChanged.size, 'changed'))
      if (openingsOut.length > 0) parts.push(openingWords(openingsOut.length, 'taken out'))
      if (openingsNew.length > 0) parts.push(openingWords(openingsNew.length, 'new'))
    } else if (openingsOut.length + openingsNew.length + otherChanged.size > 0) parts.push(`openings: ${openingsOut.length} out, ${openingsNew.length} new, ${otherChanged.size} changed`)
    verdict = `${before} → ${after}: ${parts.join('; ')}.`
  }
  // CNT-8 (lab AB-9): a use no room or zone has any more is named, never lost in silence.
  const lost = usesOf(a).filter((use) => !usesOf(b).includes(use))
  if (lost.length > 0) verdict += ` ${after.charAt(0).toUpperCase()}${after.slice(1)} has no room or zone used as ${lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(', ')} or ${lost[lost.length - 1]}`}, which ${before} had.`
  const sideBySide = massingFound?.sideBySide == null ? null : english(massingFound.sideBySide)
  if (sideBySide !== null) verdict += ` ${sideBySide}.`
  verdict = verdict.charAt(0).toUpperCase() + verdict.slice(1)
  const massing = { lines: massingLines, figures: massingFound?.figures ?? compareMassing(a.plan, b.plan).figures, sideBySide }
  return { likeness, shift, rooms, netBefore, netAfter, wallsOut, wallsNew, wallsChanged, wallsResized: resized, openingsOut, openingsNew, openingsChanged, roomsMoved, floorsChanged, massing, verdict }
}
