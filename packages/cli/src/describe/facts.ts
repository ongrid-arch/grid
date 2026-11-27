/**
 * What `grid describe` says about a plan, worked out once and printed in several lengths
 * (`card.ts`).
 *
 * Which rooms an opening joins comes from the same place as the way-out check: the geometry
 * at the opening's middle (`openingSides` in `@ongrid/floorplan`), on each floor as that
 * check reads it, without the parts the drawing's checks reject. Nothing here is guessed
 * from a name: a room is a bedroom only when its `use` says so.
 */
import {
  columnDepth,
  planBayCounts,
  rampsOnFloor,
  columnRoom,
  roomColumnArea,
  roomShapes,
  soundColumns,
  cross,
  dot,
  floorJoins,
  floorOf,
  hasWallsThrough,
  indexPlan,
  phaseCounts,
  planFloors,
  planForFloor,
  planHasPhases,
  planInState,
  roomArea,
  roomZones,
  sub,
  tolerance,
  wallCurve,
  wallFrameAt,
  wallLength,
  wallSegments,
  type Floor,
  type FloorPlan,
  type Opening,
  type PlanIndex,
  type Vec2,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { DEFAULT_FLOOR_ID, heightByDefault, WALL_DEFAULTS, type BuildingType, type OutdoorKind, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { outdoorKind } from '@ongrid/floorplan/geometry/outdoor'
import { drawable } from '@ongrid/floorplan/geometry/rules/check'
import { floorGraph, openingSides, roomOutlines, sidesAt, type RoomOutline } from '@ongrid/floorplan/geometry/rules/graph'
import { roomForm, type RoomForm } from './sides'

/** A direction on the drawing: north is up (+y), whatever north the plan states (CNT-3). */
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

const COMPASS: readonly Compass[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']

export function compassOf(v: Vec2): Compass {
  const turn = Math.atan2(v.y, v.x) / (Math.PI / 4)
  return COMPASS[((Math.round(turn) % 8) + 8) % 8]!
}

export interface RoomShape {
  /** The lower-left corner of the inside, the smallest x and y of its outline. */
  readonly at: Vec2
  /** Across (x) and up (y) the drawing, inside the walls. */
  readonly across: number
  readonly up: number
  /** Whether the inside is a rectangle square to the drawing, so across by up is its size. */
  readonly rectangle: boolean
  readonly area: number
  /** CMD-49: its shape as a person names it (round, a band, turned, four-sided, with curves), or null when across and up say it. */
  readonly form: RoomForm | null
}

export interface RoomFacts {
  readonly id: string
  readonly name: string
  readonly use?: RoomUse
  readonly floor: string
  /** Null when the drawing's checks leave the room out: it has no outline to measure. */
  readonly shape: RoomShape | null
  /** Rooms across one of its walls, whether or not anything joins them, by id. None for a zone. */
  readonly neighbours: readonly string[]
  /** CNT-8, only on a zone: the room it is part of. A zone is measured, and counted in no total. */
  readonly zoneOf?: string
  /** CNT-7 (C26), only on an outdoor space: its kind. It is measured, and counted in no total. */
  readonly outdoor?: OutdoorKind
  /** ARE-16 (LVL-4), only on a void: open to the floor below, so no floor. It is measured, and counted in no total. */
  readonly void?: true
}

/** How far an opening's edge is from the inside corner at one end of the room's side. */
export interface CornerGap {
  /** Which way the corner is from the opening, on the drawing. */
  readonly toward: Compass
  readonly distance: number
}

export interface OpeningSide {
  readonly room: string
  /** Which side of the room the opening is on, seen from inside. */
  readonly face: Compass
  /** The two inside corners of that side, nearer the wall's start first. Null when no side of the outline lies on the wall's face there. */
  readonly corners: readonly [CornerGap, CornerGap] | null
}

/** What is on a side of an opening with no room there. */
export type Beyond = 'outside' | 'nothing drawn' | 'a room left out'

export interface OpeningFacts {
  readonly id: string
  readonly type: Opening['type']
  readonly wall: string
  readonly floor: string
  readonly offset: number
  readonly width: number
  readonly sill: number
  readonly height: number
  /** The rooms on the two sides: the side the wall's normal points at first. */
  readonly sides: readonly [OpeningSide | Beyond, OpeningSide | Beyond]
}

/** A virtual wall: a line on the floor that leaves two rooms open to each other. */
export interface OpenSide {
  readonly wall: string
  readonly rooms: readonly [string, string]
}

export interface WallFacts {
  readonly id: string
  readonly start: Vec2
  readonly end: Vec2
  readonly thickness: number
  readonly height: number
  /** WRT-6: the height is stated by neither the wall nor its floor: Grid's default, drawn only. */
  readonly heightNotStated: boolean
  readonly kind: Wall['kind']
  readonly virtual: boolean
  /** CNT-18: a curved wall's centre, radius, sweep in degrees and length along the curve. */
  readonly curve?: { readonly centre: Vec2; readonly radius: number; readonly sweep: number; readonly length: number }
}

/** A floor laid out like an earlier one: same walls, rooms and openings, other ids. */
export interface Repeat {
  readonly of: string
  /** The id prefix of the earlier floor and the one that replaces it here, when the ids differ only by it. */
  readonly prefix: readonly [string, string] | null
}

export interface FloorFacts {
  readonly id: string
  /** Null when the plan does not name the floor. */
  readonly name: string | null
  readonly level: number
  readonly rooms: readonly RoomFacts[]
  readonly walls: readonly WallFacts[]
  /** Wall by wall, in the order of `walls`, and along each wall from its start. */
  readonly openings: readonly OpeningFacts[]
  readonly openSides: readonly OpenSide[]
  /** ARE-18: open sides with a room on one side only that the way-out check reads as a way out, each with its room. */
  readonly edgesOut: readonly { readonly wall: string; readonly room: string }[]
  /** ARE-63: doors and doorless openings onto the building's common parts, not drawn (a flat's front door onto its landing), as the way-out check reads them; left out when there are none. */
  readonly commonIn?: readonly { readonly opening: string; readonly room: string }[]
  readonly repeats: Repeat | null
  readonly area: number
  /**
   * The usual height of a solid wall on this floor, of those that state one (or whose floor
   * does); of all of them when none does (WRT-6). Null when it has no solid wall.
   */
  readonly wallHeight: number | null
  /** Rooms and openings the drawing's checks leave out on this floor, by id. */
  readonly leftOut: readonly string[]
  /** CNT-16: the columns standing on this floor, in plan order. Left out on a plan with none. */
  readonly columns?: readonly ColumnFacts[]
  /** CNT-19: the parking bays on this floor, counted. Left out on a plan with none. */
  readonly bays?: { readonly count: number; readonly numbers: readonly string[]; readonly unnumbered: number }
  /** CNT-19: the ramps that start or end on this floor, in plan order. Left out on a plan with none. */
  readonly ramps?: readonly RampFacts[]
}

/** CNT-19: a ramp, as the description says it: the floors at its two ends, its rise, length and slope. */
export interface RampFacts {
  readonly id: string
  readonly name: string
  readonly lower: string
  readonly upper: string
  readonly rise: number
  readonly length: number
  /** Percent, from the levels and the run. */
  readonly slope: number
}

/** CNT-16: a column, as the description says it. */
export interface ColumnFacts {
  readonly id: string
  readonly label: string | null
  readonly shape: 'square' | 'round'
  readonly width: number
  /** A square column's other side; null for a round one. */
  readonly depth: number | null
  readonly at: Vec2
  /** The room it stands in, by id, or null. */
  readonly room: string | null
}

/** Something that departs from the usual height. */
export interface HeightException {
  readonly id: string
  readonly floor: string
  readonly value: number
}

export interface Heights {
  /** The usual height of a solid wall that states one, or whose floor does; null when none does. */
  readonly wall: number | null
  /**
   * WRT-6 (lab AU3-6): the solid walls whose height nothing states, so they are drawn at Grid's
   * default, and that default. Their height is not stated, never "2.70 m".
   */
  readonly notStated: { readonly count: number; readonly drawn: number }
  /** Floors whose walls are usually another height. */
  readonly floorWalls: ReadonlyArray<{ readonly floor: string; readonly value: number }>
  /** Walls of another height than most on their floor. */
  readonly walls: readonly HeightException[]
  /** The usual sill of a window; null when there are none. */
  readonly windowSill: number | null
  readonly windowSills: readonly HeightException[]
  /** Doors and doorless openings with a sill above the floor. */
  readonly doorSills: readonly HeightException[]
}

export interface PlanFacts {
  readonly floors: readonly FloorFacts[]
  readonly rooms: ReadonlyMap<string, RoomFacts>
  readonly openings: ReadonlyMap<string, OpeningFacts>
  readonly heights: Heights
  readonly wallCount: number
  readonly openingCount: number
  /** Rooms with a stair use. */
  readonly stairRooms: number
  /** CNT-5: what kind of building the plan says it is, and each floor that says otherwise for itself. */
  readonly building: { readonly plan: BuildingType | undefined; readonly floors: readonly { readonly floor: string; readonly building: BuildingType }[] }
  /**
   * How the floors are joined (LVL-3): stairs the plan states, with the figures Grid works out,
   * stair rooms and lift shafts that lie one over the other, and stair rooms or shafts out of line.
   */
  readonly connections: Connections
  /** Whether the plan states its north (CNT-3). The descriptions' sides stay the drawing's either way. */
  readonly northStated: boolean
  /** CNT-4: whether the plan lists its flats, so which rooms make each is something it says. */
  readonly flatsListed: boolean
  /**
   * CNT-10: what the plan's work holds, for a plan with phases: how many walls, openings and rooms
   * are in each phase, and the base it is fitted out in. Every other fact is of the building after
   * the work. Null for a plan with no phases.
   */
  readonly work: WorkFacts | null
}

export interface WorkFacts {
  readonly counts: ReturnType<typeof phaseCounts>
  readonly base: string | null
}

export interface StairFacts {
  readonly id: string
  readonly name: string
  readonly lower: string
  readonly upper: string
  readonly risers: number
  readonly riserHeight: number
  readonly going: number
  readonly width: number
  /** The plan area of its flights and landings, m²: floor of the rooms it stands in, not added. */
  readonly footprint: number
}

export interface Connections {
  readonly stairs: readonly StairFacts[]
  /** Pairs of floors whose rooms used as a stair (or a lift) lie one over the other, lower first. */
  readonly stairRooms: readonly (readonly [string, string])[]
  readonly lifts: readonly (readonly [string, string])[]
  /** Pairs of floors whose stair rooms (or shafts) do not line up, lower first. */
  readonly outOfLine: readonly { readonly kind: 'stair' | 'lift'; readonly floors: readonly [string, string] }[]
  /** Floors with rooms that no stair, stated or drawn as a room, joins to another floor. */
  readonly unjoined: readonly string[]
}

/** How the floors are joined, from the one answer the way-out check reads (`floorJoins`). */
function connectionsOf(plan: FloorPlan, floors: readonly FloorFacts[]): Connections {
  const empty: Connections = { stairs: [], stairRooms: [], lifts: [], outOfLine: [], unjoined: [] }
  if (floors.length < 2) return empty
  const found = floorJoins(plan)
  const pairs = (kind: 'stair-room' | 'lift'): [string, string][] => {
    const seen = new Map<string, [string, string]>()
    for (const join of found.joins) if (join.kind === kind) seen.set(`${join.lower.floor}|${join.upper.floor}`, [join.lower.floor, join.upper.floor])
    return [...seen.values()]
  }
  const joined = new Set(found.joins.filter((j) => j.kind !== 'lift').flatMap((j) => [j.lower.floor, j.upper.floor]))
  return {
    stairs: found.stairs.map((stair) => ({
      id: stair.id,
      name: stair.name,
      lower: stair.lower.floor,
      upper: stair.upper.floor,
      risers: stair.risers,
      riserHeight: stair.riserHeight,
      going: stair.going,
      width: stair.width,
      footprint: stair.footprint,
    })),
    stairRooms: pairs('stair-room'),
    lifts: pairs('lift'),
    outOfLine: found.outOfLine.map((out) => ({ kind: out.kind, floors: [out.lower[0]!.floor, out.upper[0]!.floor] as const })),
    unjoined: floors.filter((floor) => floor.rooms.length > 0 && !joined.has(floor.id)).map((floor) => floor.id),
  }
}

/** How far a point may be from a wall's face and still be on it, in metres. */
const ON_FACE_M = 0.02
/**
 * A side of a room's outline lies along a wall when the sine of the angle between them is below
 * this. Not yet in MSG-15's table (`reviews/MSG-15.md` asks for an entry); kept here, once.
 */
export const ALONG_WALL_SINE = 1e-3
/** How much of a wall two rooms must share to be next to each other, in metres. */
const SHARED_M = 0.05

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The usual value, the one most things have; ties go to the smaller. */
function usual(values: readonly number[]): number | null {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: number | null = null
  let most = 0
  for (const [value, count] of counts) {
    if (count > most || (count === most && best !== null && value < best)) {
      best = value
      most = count
    }
  }
  return best
}

/** CNT-16: `columns` is the floor its columns take off `area`, which leaves its outline a rectangle. */
function shapeOf(polygon: readonly Vec2[], area: number, columns = 0, holes: readonly (readonly Vec2[])[] = []): RoomShape {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const across = Math.max(...xs) - minX
  const up = Math.max(...ys) - minY
  const rectangle = polygon.length === 4 && Math.abs(across * up - (area + columns)) < 0.01
  return { at: { x: minX, y: minY }, across, up, rectangle, area, form: rectangle ? null : roomForm(polygon, holes) }
}

/**
 * The sides of a room's outline that lie on a wall's face, as the stretches of the wall's axis
 * they cover. `toward` is +1 for a room on the side the wall's normal points at, -1 for the other.
 */
function faceStretches(wall: Wall, polygon: readonly Vec2[], toward: 1 | -1): Array<readonly [number, number]> {
  const half = wall.virtual === true ? 0 : wall.thickness / 2
  const stretches: Array<readonly [number, number]> = []
  // A curved wall piece by piece (CNT-18): each stretch along the curve, where its piece is.
  const curved = wall.arc !== undefined
  for (const axis of wallSegments(wall)) {
    const along = axis.length === 0 ? 1 : (axis.to - axis.from) / axis.length
    const off = (point: Vec2): number => dot(sub(point, axis.start), axis.normal) * toward - half
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!
      const q = polygon[(i + 1) % polygon.length]!
      const edge = sub(q, p)
      const length = Math.hypot(edge.x, edge.y)
      if (length < tolerance('noLength')) continue
      if (Math.abs(cross(edge, axis.dir)) / length > ALONG_WALL_SINE) continue
      if (Math.abs(off(p)) > ON_FACE_M || Math.abs(off(q)) > ON_FACE_M) continue
      let a = dot(sub(p, axis.start), axis.dir)
      let b = dot(sub(q, axis.start), axis.dir)
      if (curved) {
        if (Math.max(a, b) < -ON_FACE_M || Math.min(a, b) > axis.length + ON_FACE_M) continue
        a = axis.from + Math.min(Math.max(a, 0), axis.length) * along
        b = axis.from + Math.min(Math.max(b, 0), axis.length) * along
      }
      stretches.push([Math.min(a, b), Math.max(a, b)])
    }
  }
  if (!curved) return stretches
  // Pieces in a row along the curve are one stretch.
  const joined: Array<[number, number]> = []
  for (const [lo, hi] of [...stretches].sort((x, y) => x[0] - y[0])) {
    const last = joined.at(-1)
    if (last !== undefined && lo <= last[1] + ON_FACE_M) last[1] = Math.max(last[1], hi)
    else joined.push([lo, hi])
  }
  return joined
}

/** The stretch of the room's side on the wall's face that holds the point `along` the axis. */
function faceStretch(wall: Wall, polygon: readonly Vec2[], toward: 1 | -1, along: number): readonly [number, number] | null {
  return faceStretches(wall, polygon, toward).find(([lo, hi]) => along >= lo - ON_FACE_M && along <= hi + ON_FACE_M) ?? null
}

function sideOf(
  opening: Opening,
  wall: Wall,
  room: string,
  toward: 1 | -1,
  outlines: ReadonlyMap<string, RoomOutline>,
): OpeningSide {
  // Where the opening is: on a curved wall the way the curve runs at its middle (CNT-18).
  const axis = wallFrameAt(wall, opening.offset + opening.width / 2)
  const inward = { x: -axis.normal.x * toward, y: -axis.normal.y * toward }
  const polygon = outlines.get(room)!.polygon
  const stretch = faceStretch(wall, polygon, toward, opening.offset + opening.width / 2)
  const back = { x: -axis.dir.x, y: -axis.dir.y }
  return {
    room,
    face: compassOf(inward),
    // A whole circle has no corners to measure from (CNT-18).
    corners: stretch === null || wallCurve(wall)?.closed === true
      ? null
      : [
          { toward: compassOf(back), distance: opening.offset - stretch[0] },
          { toward: compassOf(axis.dir), distance: stretch[1] - (opening.offset + opening.width) },
        ],
  }
}

/** CNT-18: a curved wall's curve, for its facts. */
function curveFacts(wall: Wall): Pick<WallFacts, 'curve'> {
  const curve = wallCurve(wall)
  if (curve === null || wall.arc === undefined) return {}
  return { curve: { centre: curve.centre, radius: curve.radius, sweep: wall.arc.sweep, length: curve.length } }
}

/** What is past an opening's side with no room on it, read as the way-out check reads it. */
function beyond(wall: Wall, index: PlanIndex, outlines: ReadonlyMap<string, RoomOutline>): Beyond {
  if ((index.roomsByWall.get(wall.id) ?? []).some((room) => !outlines.has(room.id))) return 'a room left out'
  return wall.kind === 'exterior' ? 'outside' : 'nothing drawn'
}

/**
 * Every pair of rooms that meet across a wall: one on each face, along a shared stretch of
 * it. Only rooms that name the wall are tried, as for the rooms an opening joins.
 */
function neighboursOn(storey: FloorPlan, index: PlanIndex, outlines: ReadonlyMap<string, RoomOutline>): Map<string, Set<string>> {
  const next = new Map<string, Set<string>>()
  const meet = (a: string, b: string): void => {
    if (!next.has(a)) next.set(a, new Set())
    if (!next.has(b)) next.set(b, new Set())
    next.get(a)!.add(b)
    next.get(b)!.add(a)
  }
  // A zone is inside its room (CNT-8): the room meets its neighbours, the zone none.
  const zoneOf = roomZones(index).zoneOf
  for (const wall of storey.walls) {
    const named = (index.roomsByWall.get(wall.id) ?? []).filter((room) => outlines.has(room.id) && !zoneOf.has(room.id))
    if (named.length < 2) continue
    const on = (toward: 1 | -1): Array<{ room: string; lo: number; hi: number }> =>
      named.flatMap((room) => faceStretches(wall, outlines.get(room.id)!.polygon, toward).map(([lo, hi]) => ({ room: room.id, lo, hi })))
    const left = on(1)
    const right = on(-1)
    for (const a of left) {
      for (const b of right) {
        if (a.room !== b.room && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > SHARED_M) meet(a.room, b.room)
      }
    }
  }
  return next
}

/** A key for a floor's layout that leaves its ids out, and its ids in the same order. */
function layoutOf(storey: FloorPlan): { key: string; ids: string[] } {
  const n = (value: number): string => value.toFixed(4)
  const wallKey = new Map<string, string>()
  for (const wall of storey.walls) {
    wallKey.set(wall.id, [n(wall.start[0]), n(wall.start[1]), n(wall.end[0]), n(wall.end[1]), n(wall.thickness), n(wall.height), wall.kind, wall.virtual === true, ...(wall.arc === undefined ? [] : [n(wall.arc.centre[0]), n(wall.arc.centre[1]), n(wall.arc.sweep)])].join(','))
  }
  const entries: Array<[string, string]> = [
    ...storey.walls.map((wall): [string, string] => [`w${wallKey.get(wall.id)}`, wall.id]),
    ...storey.rooms.map((room): [string, string] => [
      `r${JSON.stringify([room.name, room.use ?? '', room.boundary.map((id) => wallKey.get(id) ?? '?'), ...(room.holes ?? []).map((hole) => hole.map((id) => wallKey.get(id) ?? '?'))])}`,
      room.id,
    ]),
    ...storey.openings.map((o): [string, string] => [
      `o${[wallKey.get(o.wall), o.type, n(o.offset), n(o.width), n(o.sill), n(o.height), o.hinge ?? '', o.swing ?? '', o.kind ?? ''].join(',')}`,
      o.id,
    ]),
  ]
  entries.sort((a, b) => byText(a[0], b[0]) || byText(a[1], b[1]))
  return { key: entries.map((entry) => entry[0]).join('\n'), ids: entries.map((entry) => entry[1]) }
}

/** The prefixes that turn every id of one floor into the id in the same place on another, if there are such. */
function prefixSwap(from: readonly string[], to: readonly string[]): readonly [string, string] | null {
  let swap: readonly [string, string] | null = null
  for (let i = 0; i < from.length; i++) {
    const a = from[i]!
    const b = to[i]!
    let same = 0
    while (same < a.length && same < b.length && a[a.length - 1 - same] === b[b.length - 1 - same]) same++
    if (same === 0) return null
    const pair = [a.slice(0, a.length - same), b.slice(0, b.length - same)] as const
    if (swap === null) swap = pair
    else if (swap[0] !== pair[0] || swap[1] !== pair[1]) return null
  }
  return swap !== null && swap[0] !== swap[1] ? swap : null
}

function floorFacts(plan: FloorPlan, floor: Floor, named: boolean): FloorFacts {
  const { storey, leftOut } = drawable(planForFloor(plan, floor.id))
  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut.rooms)
  const next = neighboursOn(storey, index, outlines)
  const zoneOf = roomZones(index).zoneOf

  const rooms: RoomFacts[] = storey.rooms.map((room) => {
    const outline = outlines.get(room.id)
    const of = zoneOf.get(room.id)
    return {
      id: room.id,
      name: room.name,
      ...(room.use === undefined ? {} : { use: room.use }),
      floor: floor.id,
      shape: outline === undefined ? null : shapeOf(outline.polygon, roomArea(room, index), roomColumnArea(room, index), outline.holes),
      neighbours: [...(next.get(room.id) ?? [])].sort(byText),
      ...(of === undefined ? {} : { zoneOf: of }),
      ...(outdoorKind(room) === null ? {} : { outdoor: outdoorKind(room)! }),
      ...(room.void === true ? { void: true as const } : {}),
    }
  })

  // ARE-18: a door or opening is a way in from outside when the way-out check reads it as one,
  // as stated (an exterior wall) or worked out (no room and no enclosed floor past it).
  const graph = floorGraph(storey, leftOut.rooms)
  const exits = new Set(graph.exits.map((e) => `${e.room}\u0000${e.opening}`))
  const openings: OpeningFacts[] = []
  for (const wall of storey.walls) {
    for (const opening of index.openingsByWall.get(wall.id) ?? []) {
      const [left, right] = openingSides(opening, index, outlines)
      const room = left ?? right
      const past = opening.type !== 'window' && room !== null && exits.has(`${room}\u0000${opening.id}`) ? 'outside' : beyond(wall, index, outlines)
      openings.push({
        id: opening.id,
        type: opening.type,
        wall: wall.id,
        floor: floor.id,
        offset: opening.offset,
        width: opening.width,
        sill: opening.sill,
        height: opening.height,
        sides: [
          left === null ? past : sideOf(opening, wall, left, 1, outlines),
          right === null ? past : sideOf(opening, wall, right, -1, outlines),
        ],
      })
    }
  }

  // A dividing line leaves every pair of rooms open that meet along a shared stretch of it, not
  // only the pair at its middle (VEW-53): a row of bays on one line is open to the corridor.
  const openSides: OpenSide[] = []
  const notZones = [...outlines.keys()].filter((id) => !roomZones(index).zoneOf.has(id))
  for (const wall of storey.walls) {
    if (wall.virtual !== true) continue
    const on = (toward: 1 | -1): Array<{ room: string; lo: number; hi: number }> =>
      notZones.flatMap((room) => faceStretches(wall, outlines.get(room)!.polygon, toward).map(([lo, hi]) => ({ room, lo, hi })))
    const left = on(1)
    const right = on(-1)
    const pairs = new Map<string, readonly [string, string]>()
    for (const a of left) {
      for (const b of right) {
        if (a.room !== b.room && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > SHARED_M) pairs.set([a.room, b.room].sort(byText).join('\u0000'), [a.room, b.room])
      }
    }
    // The pair at the middle first, as before; the rest in the order along the line.
    const [mid1, mid2] = sidesAt(wall, wallLength(wall) / 2, index, outlines)
    const all = [...pairs.values()]
    const first = all.findIndex(([a, b]) => (a === mid1 && b === mid2) || (a === mid2 && b === mid1))
    if (first >= 0) all[first] = [mid1!, mid2!]
    if (first > 0) all.unshift(...all.splice(first, 1))
    if (all.length === 0 && mid1 !== null && mid2 !== null && mid1 !== mid2) all.push([mid1, mid2])
    for (const rooms of all) openSides.push({ wall: wall.id, rooms })
  }

  const walls: WallFacts[] = storey.walls.map((wall) => ({
    id: wall.id,
    start: { x: wall.start[0], y: wall.start[1] },
    end: { x: wall.end[0], y: wall.end[1] },
    thickness: wall.thickness,
    height: wall.height,
    heightNotStated: heightByDefault(plan, wall),
    kind: wall.kind,
    virtual: wall.virtual === true,
    ...curveFacts(wall),
  }))

  return {
    id: floor.id,
    name: named ? floor.name : null,
    level: floor.level,
    rooms,
    walls,
    openings,
    openSides,
    edgesOut: graph.openEdges.filter((e) => e.beyond === 'outside').map((e) => ({ wall: e.edge, room: e.room })),
    ...(graph.common.length === 0 ? {} : { commonIn: graph.common.map((c) => ({ opening: c.opening, room: c.room })) }),
    repeats: null,
    // A zone's floor is its room's (CNT-8): counted once.
    // CNT-7: an outdoor space is listed apart, in no total.
    area: rooms.reduce((sum, room) => sum + (room.zoneOf === undefined && room.outdoor === undefined && room.void !== true ? (room.shape?.area ?? 0) : 0), 0),
    wallHeight: usualHeight(plan, storey.walls),
    leftOut: [...leftOut.rooms, ...leftOut.openings].sort(byText),
    ...(storey.columns === undefined ? {} : { columns: columnFacts(storey, index) }),
    ...(plan.bays === undefined ? {} : { bays: bayFacts(storey, floor.id) }),
    ...(plan.ramps === undefined ? {} : { ramps: rampsOnFloor(plan, floor.id).map((r) => ({ id: r.id, name: r.name, lower: r.lower.floor, upper: r.upper.floor, rise: r.rise, length: r.length, slope: r.slope })) }),
  }
}

/** CNT-19: a floor's bays, counted: none on a floor with none. */
function bayFacts(storey: FloorPlan, floorId: string): { count: number; numbers: string[]; unnumbered: number } {
  const found = planBayCounts(storey).find((count) => count.floor === floorId)
  return found === undefined ? { count: 0, numbers: [], unnumbered: 0 } : { count: found.count, numbers: [...found.numbers], unnumbered: found.unnumbered }
}

/** CNT-16: the columns a floor's slice holds that are drawn, each with the room it stands in. */
function columnFacts(storey: FloorPlan, index: ReturnType<typeof indexPlan>): ColumnFacts[] {
  const rooms = roomShapes(index)
  return soundColumns(storey).map((column) => ({
    id: column.id,
    label: column.label ?? null,
    shape: column.shape,
    width: column.width,
    depth: column.shape === 'round' ? null : columnDepth(column),
    at: { x: column.at[0], y: column.at[1] },
    room: columnRoom(column, rooms)?.id ?? null,
  }))
}

/**
 * The usual heights and the exceptions. A floor laid out like an earlier one adds no
 * exceptions of its own: they are the earlier floor's.
 */
/** WRT-6: the usual height of the solid walls that state one, else of them all. */
function usualHeight(plan: FloorPlan, walls: readonly Wall[]): number | null {
  const solid = walls.filter((wall) => wall.virtual !== true)
  const stated = solid.filter((wall) => !heightByDefault(plan, wall))
  return usual((stated.length > 0 ? stated : solid).map((wall) => wall.height))
}

function heightsOf(plan: FloorPlan, floors: readonly FloorFacts[]): Heights {
  const own = new Set(floors.filter((floor) => floor.repeats === null).map((floor) => floor.id))
  const usualOn = new Map(floors.map((floor) => [floor.id, floor.wallHeight]))
  const all = plan.walls.filter((wall) => wall.virtual !== true)
  const solid = all.filter((wall) => !heightByDefault(plan, wall))
  const wall = usual(solid.map((w) => w.height))
  const statedOn = new Set(solid.map((w) => floorOf(w)))
  const floorOfWall = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  // LVL-5: an opening in a wall through floors stands on the floor its foot is on, its sill above
  // that floor's level: each opening as the lowest floor's slice that holds part of it has it.
  const placed = new Map<Opening, string>()
  if (hasWallsThrough(plan)) {
    const seen = new Set<string>()
    for (const floor of planFloors(plan)) {
      for (const o of planForFloor(plan, floor.id).openings) {
        if (seen.has(o.id)) continue
        seen.add(o.id)
        placed.set(o, floor.id)
      }
    }
  }
  const openingList = hasWallsThrough(plan) ? [...placed.keys()] : plan.openings
  const floorOfOpening = (o: Opening): string => placed.get(o) ?? floorOfWall.get(o.wall) ?? DEFAULT_FLOOR_ID
  const onOwn = (o: Opening): boolean => own.has(floorOfOpening(o))
  const windows = openingList.filter((o) => o.type === 'window')
  const windowSill = usual(windows.map((o) => o.sill))
  const at = (o: Opening): HeightException => ({ id: o.id, floor: floorOfOpening(o), value: o.sill })
  return {
    wall,
    notStated: { count: all.length - solid.length, drawn: WALL_DEFAULTS.solid.height },
    floorWalls: floors.flatMap((floor) =>
      floor.repeats === null && floor.wallHeight !== null && floor.wallHeight !== wall && statedOn.has(floor.id) ? [{ floor: floor.id, value: floor.wallHeight }] : []),
    walls: solid
      .filter((w) => own.has(floorOf(w)) && w.height !== usualOn.get(floorOf(w)))
      .map((w) => ({ id: w.id, floor: floorOf(w), value: w.height })),
    windowSill,
    windowSills: windows.filter((o) => o.sill !== windowSill && onOwn(o)).map(at),
    doorSills: openingList.filter((o) => o.type !== 'window' && o.sill > 0 && onOwn(o)).map(at),
  }
}

/** Everything `grid describe` says, from a plan that passed the schema. */
export function planFacts(stated: FloorPlan): PlanFacts {
  // CNT-10: the building as it will be after the work; the work itself is counted apart.
  const work = planHasPhases(stated) ? { counts: phaseCounts(stated), base: stated.base ?? null } : null
  const plan = planInState(stated, 'after')
  const registered = new Set((plan.floors ?? []).map((floor) => floor.id))
  const layouts = new Map<string, { floor: string; ids: string[] }>()
  const floors: FloorFacts[] = planFloors(plan).map((floor) => {
    const facts = floorFacts(plan, floor, registered.has(floor.id) || floor.id === DEFAULT_FLOOR_ID)
    const layout = layoutOf(planForFloor(plan, floor.id))
    const earlier = facts.rooms.length > 0 ? layouts.get(layout.key) : undefined
    if (earlier === undefined) {
      layouts.set(layout.key, { floor: floor.id, ids: layout.ids })
      return facts
    }
    return { ...facts, repeats: { of: earlier.floor, prefix: prefixSwap(earlier.ids, layout.ids) } }
  })
  return {
    floors,
    rooms: new Map(floors.flatMap((floor) => floor.rooms.map((room) => [room.id, room] as const))),
    openings: new Map(floors.flatMap((floor) => floor.openings.map((o) => [o.id, o] as const))),
    heights: heightsOf(plan, floors),
    wallCount: plan.walls.length,
    openingCount: plan.openings.length,
    stairRooms: plan.rooms.filter((room) => room.use === 'stair').length,
    building: {
      plan: plan.building,
      floors: floors.flatMap((floor) => {
        const own = (plan.floors ?? []).find((f) => f.id === floor.id)?.building
        return own === undefined || own === plan.building ? [] : [{ floor: floor.id, building: own }]
      }),
    },
    connections: connectionsOf(plan, floors),
    northStated: typeof plan.north === 'number',
    flatsListed: (plan.flats ?? []).length > 0,
    work,
  }
}
