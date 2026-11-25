/**
 * Net, gross internal and gross external area, per floor and per use, each saying what it
 * measures (ARE-9), named as the ARE-8 decision says.
 *
 * Every figure here follows Grid's own rule, described in Grid's own words in `MEASURES`: what it
 * measures, what it does not take off, and what the plan cannot say. No figure is said to be
 * measured to a published standard. A standard's rule would come in only as a figure record with
 * its document, edition, clause, place, day read and status, and none is carried yet.
 *
 * The figures come from the spaces the walls enclose (`spaces.ts`), so that on every floor
 *
 *     gross external = net + columns + rooms named outside + walls + floor no room claims − off its space
 *
 * holds to the last digit the arithmetic keeps, and gross internal is the same with the outer
 * walls left out. `off its space` is room floor that is not enclosed floor counted once: rooms
 * that overlap, or that run over walls or outside them. On a plan without such faults it is 0
 * (validation names each one: `room/overlap`, `room/space-mismatch`). `columns` is the floor the
 * columns standing in the rooms cover (CNT-16), which each room's area has taken off.
 *
 * Which walls face outside is the one answer `exposure.ts` gives (MSG-13), stretch by stretch.
 * Gross internal is the outline of the floor less those stretches of wall, keeping only the parts
 * that hold enclosed floor, so the square at an outside corner and a garden wall standing apart
 * go with the outer walls.
 *
 * Pure: a plan in, numbers and sentences out. The join is done by `polygon-clipping` (MIT).
 */

import { planInState } from './phases'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { indexPlan, roomWallIds } from './plan'
import { floorOf, planFloors, wallsOnFloor } from './floors'
import { roomFloorArea, tryRoomPolygon, tryRoomShape } from './room'
import { floorSpaces, spacesKnown, type FloorSpaces, type Space } from './spaces'
import { planWallSides, type WallSides } from './exposure'
import { validatePlan } from './validate'
import { floorJoins } from './floorJoins'
import { cornerFills, inPolygon, polygonArea, strip, union } from './polygons'
import { roomZones } from './zones'
import { planFlats } from './flats'
import { planBuildings } from './buildings'
import { statedOutline } from './massing'
import { TOLERANCES, tolerance } from './tolerances'
import type { Vec2 } from './vec2'
import { wallLength, wallSegments } from './wall'
import { curveFault } from './arc'
import { buildingPlan, outdoorIds, outdoorKind, outdoorRoofed, planHasOutdoor } from './outdoor'
import type { OutdoorKind } from '../types/floorplan'
import { roomColumnArea, roomColumns } from './columns'
import { english, num, said } from '../messages/say'
import { partyWallArea, type PartyWallArea, type PartyWallRoom } from './partyWalls'

/**
 * The three measures, the floor by headroom band (LVL-6), outdoor space (CNT-7), and a flat's area
 * to the party walls and the free floor beside the net (ARE-14).
 */
export type Measure = 'net' | 'grossInternal' | 'grossExternal' | 'headroom' | 'outdoor' | 'partyWall' | 'freeFloor'
export type GrossMeasure = 'grossInternal' | 'grossExternal'

/** A measure described in Grid's own words. No standard's text, and no standard's name. */
export interface MeasureRule {
  readonly measure: Measure
  /** What it is called in an answer. */
  readonly name: string
  /** What it measures, in one sentence. */
  readonly measures: string
  /** What it does not take off. */
  readonly notTakenOff: string
  /** What the plan cannot say, that a reader may assume. */
  readonly cannotSay: string
}

/**
 * The measures table. `docs/areas.md` holds the same table; a test fails
 * when the two differ.
 */
export const MEASURES: Readonly<Record<Measure, MeasureRule>> = {
  net: {
    measure: 'net',
    name: 'Net area',
    measures: 'Net area is the floor inside each room, measured to the faces of its walls, less any hole in it, any room drawn inside it and the floor the columns standing in it cover, a room marked as a void (open to the floor below, so with no floor) not counting at all; a stair drawn as a room on floor after floor counts once, on the floor it rises from.',
    notTakenOff: 'Nothing else inside a room is taken off: fixed units, a column drawn as a short wall rather than as a column, and floor under a low ceiling all count.',
    cannotSay: 'The plan cannot say which rooms the reader counts: a store drawn as a room counts unless it is named as outside, and a balcony, a terrace or a garden counts unless it is marked as outdoor space.',
  },
  grossInternal: {
    measure: 'grossInternal',
    name: 'Gross internal area',
    measures: 'Gross internal area is the floor inside the inside face of the walls that face outside, with the inner walls and partitions counted, and less any void, which has no floor.',
    notTakenOff: 'Inner walls, partitions, stairs and floor no room claims are not taken off.',
    cannotSay: 'Which walls face outside is worked out from the rooms beside them, an outdoor space being the outside; floor no room claims, such as a courtyard or a light well not drawn as outdoor space, may be covered or not, so it counts.',
  },
  grossExternal: {
    measure: 'grossExternal',
    name: 'Gross external area',
    measures: 'Gross external area is the floor inside the outside face of the walls, every wall counted, and less any void, which has no floor.',
    notTakenOff: 'Outer walls, inner walls and floor no room claims are not taken off.',
    cannotSay: 'A wall shared with a neighbour, or with common parts the plan does not draw, counts to its middle once the plan marks it separating; any other wall counts in full, a wall standing apart too.',
  },
  headroom: {
    measure: 'headroom',
    name: 'Area by headroom',
    measures: `Area by headroom is the floor of each room with at least ${TOLERANCES.headroomLow.value} m, and with at least ${TOLERANCES.headroomFull.value} m, of height over it, from the room's floor to its ceiling or to the underside of the roof its floor states, whichever is lower.`,
    notTakenOff: 'It is measured on the room\'s whole floor: nothing standing in the room is taken off, a column neither, and floor under a lowered zone of the ceiling counts by that zone\'s height.',
    cannotSay: 'The plan cannot say how deep the roof is built up or where a low slope is boxed in, so the height is taken to the roof\'s underside as stated, from its eaves on the outside walls\' lines.',
  },
  // CNT-7: its words are in the message files (MSG-11), said here in English as the rest are.
  outdoor: {
    measure: 'outdoor',
    name: 'Outdoor area',
    measures: english(said('areas.measure.outdoor.measures')),
    notTakenOff: english(said('areas.measure.outdoor.notTakenOff')),
    cannotSay: english(said('areas.measure.outdoor.cannotSay')),
  },
  // ARE-14 (lab R-1): a flat's area to the middle of its party walls (`partyWalls.ts`).
  partyWall: {
    measure: 'partyWall',
    name: english(said('areas.measure.partyWall.name')),
    measures: english(said('areas.measure.partyWall.measures')),
    notTakenOff: english(said('areas.measure.partyWall.notTakenOff')),
    cannotSay: english(said('areas.measure.partyWall.cannotSay')),
  },
  // ARE-14 (lab S-6): the floor a room's fixtures leave free (CNT-12), beside its net area.
  freeFloor: {
    measure: 'freeFloor',
    name: english(said('areas.measure.freeFloor.name')),
    measures: english(said('areas.measure.freeFloor.measures')),
    notTakenOff: english(said('areas.measure.freeFloor.notTakenOff')),
    cannotSay: english(said('areas.measure.freeFloor.cannotSay')),
  },
}

/**
 * The gross measure Grid gives first, by the country the plan will be built in (ARE-8): the inside
 * face in the UK and most of Europe, the outside face for homes in the US. Elsewhere there is no
 * usual one, and both are given. This is the decision recorded on ARE-8, not a figure read from
 * any document; it names no standard.
 */
const INSIDE_FACE: ReadonlySet<string> = new Set([
  'GB', 'IE', 'FR', 'DE', 'ES', 'PT', 'IT', 'NL', 'BE', 'LU', 'AT', 'CH', 'DK', 'SE', 'NO', 'FI',
  'IS', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'RO', 'BG', 'GR', 'CY', 'MT', 'EE', 'LV', 'LT',
])
const OUTSIDE_FACE: ReadonlySet<string> = new Set(['US'])

/** The gross measure usual where the plan will be built, or null when Grid has none for that place. */
export function usualGross(country: string | undefined): GrossMeasure | null {
  const code = (country ?? '').trim().toUpperCase()
  if (INSIDE_FACE.has(code)) return 'grossInternal'
  if (OUTSIDE_FACE.has(code)) return 'grossExternal'
  return null
}

/** A room as the areas count it. */
export interface RoomAreaFigure {
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly floor: string
  /** Net, as Grid measures a room everywhere (`roomArea`): less the floor its columns cover. */
  readonly area: number
  /** CNT-16: the floor the columns standing in it cover, taken off `area`, and the columns by id. Absent when none stands in it. */
  readonly columns?: { readonly area: number; readonly ids: readonly string[] }
  /** Named as outside by the caller: listed apart, in no net or gross internal figure. */
  readonly outside: boolean
  /**
   * CNT-8: the room this one is a zone of, or null. A zone is listed and measured, and is in no
   * figure: its floor is its room's. Its area goes to `byUse` under its own use, out of its room's.
   */
  readonly zoneOf: string | null
  /**
   * SHT-11, lab DR-5: on a room used as a stair that lies over a stair room on the floor below
   * (LVL-3's join), the stair room its floor is counted with: the lowest of the rooms the stair
   * rises through. The room keeps its area, and is in no net figure. Absent on every other room.
   */
  readonly countedWith?: { readonly floor: string; readonly room: string }
  /**
   * CNT-7 (C26): on an outdoor space only, its kind and whether a roof covers it. It is in no net,
   * gross internal or gross external figure: it is listed apart, in `outdoor`.
   */
  readonly outdoor?: { readonly kind: OutdoorKind; readonly roofed: boolean }
  /**
   * ARE-16 (LVL-4): on a void only: the room is open to the floor below and has no floor. It is
   * listed and measured, and is in no net, gross internal or gross external figure.
   */
  readonly void?: true
}

/** A room Grid could not draw, so it is in no figure. */
export interface RoomLeftOut {
  readonly id: string
  readonly name: string
  readonly floor: string
}

export interface FloorAreaFigures {
  readonly floor: string
  /** The rooms that are counted, in plan order. */
  readonly rooms: readonly RoomAreaFigure[]
  /** Rooms on this floor that could not be drawn: in no figure here. */
  readonly leftOut: readonly RoomLeftOut[]
  /** The rooms not named outside, less the stair rooms counted with the one below (`overStairs`), and no zone (CNT-8). */
  readonly net: number
  /** `net` by room use; a room with none is under `not said`. Adds up to `net`. */
  readonly byUse: Readonly<Record<string, number>>
  /** The rooms named outside. */
  readonly outsideRooms: number
  /** SHT-11: the stair rooms over a stair room below, whose floor is counted there (`countedWith`). */
  readonly overStairs: number
  /** CNT-16: the floor the columns standing in this floor's rooms cover (zones aside): taken off the rooms' areas, in the gross figures. */
  readonly columns: number
  /** The rest are null when the floor's spaces could not be worked out (`why`). */
  readonly grossExternal: number | null
  readonly grossInternal: number | null
  /** Every solid wall, with the corners made good between them. */
  readonly walls: number | null
  /** The part of `walls` outside the inside face of the outer walls: gross external less gross internal, less outside rooms. */
  readonly outerWalls: number | null
  /** Enclosed floor no room claims. */
  readonly unclaimed: number | null
  /** Room floor that is not enclosed floor counted once: overlaps, and rooms over or outside walls. 0 on a sound plan. */
  readonly offSpace: number | null
  /** Why a gross figure is null, in a sentence; null when both are known. */
  readonly why: string | null
  /** BRF-4 (C17): the floor is massing, an outline it states with no walls yet: gross external only. */
  readonly massing: boolean
  /** CNT-7 (C26): the floor of its outdoor spaces, in no other figure; only on a floor that has one. */
  readonly outdoor?: number
  /** ARE-16: the size of its voids (LVL-4), which are in no figure: no floor stands there. 0 with none. */
  readonly voids: number
}

/** A total, with the rule it follows. */
export interface AreaFigure {
  readonly measure: Measure
  /** Null when some floor's figure is unknown; `why` says which. */
  readonly area: number | null
  readonly rule: MeasureRule
  readonly why: string | null
}

/** Which gross measure the answer gives first, and why. */
export interface ReaderMeasure {
  /** The measures to give, in order. Both when none is usual or both were asked for. */
  readonly gross: readonly GrossMeasure[]
  /** `asked`: the caller named it. `country`: usual where the plan will be built. `none`: no country, or none usual there. */
  readonly chosen: 'asked' | 'country' | 'none'
  readonly country: string | null
  /** In a sentence. */
  readonly why: string
}

/** CNT-4: what a flat's area measures, in Grid's own words. */
export const FLAT_AREA_RULE =
  "A flat's area is the net area of the rooms the plan lists for it, each counted as the net counts it: a zone in its room, a room named outside not at all, and a stair once, on the floor it rises from."

/**
 * CNT-4 (lab EL-1): a flat's area, from the plan's flats list: the net area of the rooms it holds,
 * counted as the net counts them (no zone, no room named outside, a stair counted once), on the
 * floors given.
 */
export interface FlatAreaFigure {
  readonly id: string
  readonly name: string
  /** The type it states, by id, and the type's name; null with none (or a type the plan does not state, for the name). */
  readonly type: string | null
  readonly typeName: string | null
  readonly mirrored: boolean
  /** The floors its rooms are on, of the floors given. */
  readonly floors: readonly string[]
  /** The net area of its rooms, on the floors given. */
  readonly net: number
  /** `net` by floor, for a flat on more than one (a duplex). */
  readonly byFloor: Readonly<Record<string, number>>
  /** The rooms counted, by id. */
  readonly rooms: readonly string[]
  /** Rooms it holds that are in no net figure, each with why: a zone, a room named outside, a stair counted below, outdoor space (CNT-7). */
  readonly notCounted: readonly { readonly id: string; readonly why: 'zone' | 'outside' | 'stair-below' | 'outdoor' }[]
  /** Rooms it holds that Grid could not draw: in no figure. */
  readonly leftOut: readonly string[]
  /**
   * ARE-14 (lab R-1): its area to the middle of its party walls (`MEASURES.partyWall`), to each
   * face of its outer walls, on the floors given. Null when the rooms could not be joined.
   */
  readonly toPartyWalls: PartyWallArea | null
  /**
   * ARE-14: the outdoor spaces it holds (CNT-7), in none of its other figures, and the floor of them
   * the rules the caller stated count (null when none counts any). Absent when it holds none.
   */
  readonly outdoor?: { readonly area: number; readonly weighted: number | null }
}

/**
 * CNT-7 (C26): a share of an outdoor space's floor a rule counts, such as half a balcony: the share,
 * from 0 to 1, and the rule in words, with where it comes from. Grid holds none of its own: only a
 * rule the caller states weights an outdoor space.
 */
export interface OutdoorWeight {
  readonly weight: number
  readonly rule: string
}

/** CNT-7 (C26): the plan's outdoor space, listed apart from every other figure. */
export interface OutdoorAreaFigure {
  /** The floor of every outdoor space on the floors given. */
  readonly area: number
  readonly byKind: Readonly<Partial<Record<OutdoorKind, number>>>
  /** Of `area`, the floor a roof covers, and the floor open to the sky. */
  readonly roofed: number
  readonly open: number
  readonly rule: MeasureRule
  /**
   * Their floor weighted by the rules the caller stated, and those rules; null when none was
   * stated for a kind on the floors given. ARE-14: each kind a rule counts, with its share, and the
   * net with that floor added (`withNet`); the net itself never holds it.
   */
  readonly weighted: {
    readonly area: number
    readonly rules: readonly string[]
    readonly kinds: readonly { readonly kind: OutdoorKind; readonly area: number; readonly share: number; readonly counted: number; readonly rule: string }[]
    readonly withNet: number
  } | null
}

/** CNT-6 (C23): a building's figures, the sum of its own floors' among the floors given. */
export interface BuildingAreaFigure {
  readonly id: string
  readonly name: string
  /** Its floors among those given, in plan order. */
  readonly floors: readonly string[]
  readonly net: number
  /** Null when a floor of it has none. */
  readonly grossInternal: number | null
  readonly grossExternal: number | null
}

export interface PlanAreaFigures {
  readonly floors: readonly FloorAreaFigures[]
  /** CNT-6: each building the plan names with a floor among those given, in plan order. Empty with none. */
  readonly buildings: readonly BuildingAreaFigure[]
  /** CNT-4: each flat of the plan's flats list with a room on the floors given, in plan order. Empty with none. */
  readonly flats: readonly FlatAreaFigure[]
  /** CNT-4: the net area of the rooms in no flat (the common parts, on a plan that lists flats); the whole net with none. */
  readonly notInFlats: number
  /** ARE-14: the rooms in no flat to the party walls, as a flat's are; null on a plan that lists no flats, or when they could not be joined. */
  readonly notInFlatsToPartyWalls: PartyWallArea | null
  readonly net: AreaFigure
  readonly grossInternal: AreaFigure
  readonly grossExternal: AreaFigure
  /** Net by use over the floors given. Adds up to the net total. */
  readonly byUse: Readonly<Record<string, number>>
  readonly outsideRooms: number
  readonly leftOut: readonly RoomLeftOut[]
  readonly reader: ReaderMeasure
  readonly notes: readonly string[]
  /** CNT-7 (C26): the outdoor spaces on the floors given, listed apart; only on a plan that has one. */
  readonly outdoor?: OutdoorAreaFigure
}

export interface AreaOptions {
  readonly index?: PlanIndex
  /** Ids the drawing's checks mark as broken; worked out with `validatePlan` when not given. */
  readonly broken?: ReadonlySet<string>
  /** Room ids to list apart, such as a balcony: in no net or gross internal figure. */
  readonly outside?: ReadonlySet<string>
  /** Only these floors, in plan order. Every floor when not given. */
  readonly floors?: readonly string[]
  /** Where the plan will be built, as a two-letter country code. */
  readonly country?: string
  /** The gross measure asked for. The usual one for `country` when not given. */
  readonly gross?: GrossMeasure | 'both'
  /** CNT-7: the share of each kind of outdoor space a rule the caller states counts. None when not given. */
  readonly outdoorWeights?: Readonly<Partial<Record<OutdoorKind, OutdoorWeight>>>
}

const NOT_SAID = 'not said'
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
const nameOf = (room: Room): string => (room.name.trim() === '' ? room.id : room.name)

/** The walls `floorSpaces` joins on this floor, in plan order. */
export function floorWalls(plan: FloorPlan, floor: string, broken: ReadonlySet<string>): Wall[] {
  // LVL-5: a wall through floors is one of each floor's it stands on.
  return wallsOnFloor(plan, floor).filter(
    (wall) =>
      !broken.has(wall.id) &&
      (wall.arc !== undefined ? curveFault(wall) === null : wall.start[0] !== wall.end[0] || wall.start[1] !== wall.end[1]) &&
      (wall.virtual === true || wall.thickness > 0)
  )
}

/**
 * The stretches of a solid wall that face outside, along it from its start, each longer than
 * `lineInside`. A stretch with no room on either face (where a partition runs into the wall, or
 * round a corner) goes with the outer stretches when they lie on both sides of it, or on one side
 * with the wall's end on the other.
 */
function outerStretches(sides: WallSides | undefined, length: number): (readonly [number, number])[] {
  if (sides === undefined) return []
  if (sides.stated === 'exterior') return [[0, length]]
  const list = sides.stretches
  // CNT-6: a party wall, or one to the common parts, bounds the floor as an outside wall does.
  const bounds = (worked: WallSides['stretches'][number]['worked']): boolean => worked === 'exterior' || worked === 'separating'
  const outer = (i: number): boolean | null => (i < 0 || i >= list.length ? null : bounds(list[i]!.worked))
  const out: [number, number][] = []
  list.forEach((stretch, i) => {
    const before = outer(i - 1)
    const after = outer(i + 1)
    const faces = bounds(stretch.worked) || (stretch.worked === 'detached' && before !== false && after !== false && (before === true || after === true))
    if (!faces) return
    const last = out[out.length - 1]
    if (last !== undefined && stretch.from - last[1] <= tolerance('noLength')) last[1] = stretch.to
    else out.push([stretch.from, stretch.to])
  })
  return out.filter(([from, to]) => to - from >= tolerance('lineInside'))
}


/**
 * The floor inside the inside face of the walls that face outside, inner walls counted: the
 * floor's outline, as `spaces.ts` joins it, less the outer stretches of wall, keeping the parts
 * that hold enclosed floor. Null with a reason when no wall on the floor faces outside.
 */
interface Run {
  readonly wall: Wall
  readonly start: Vec2
  readonly dir: Vec2
  readonly length: number
  /** Where the run lies along its wall's axis: all of a straight wall, one chord of a curve. */
  readonly from: number
  readonly to: number
}

/** Each wall as runs: a straight wall one, a curved wall one per chord (CNT-18). */
const runsOf = (walls: readonly Wall[]): Run[] =>
  walls.flatMap((wall) =>
    wallSegments(wall).map((segment) => ({ wall, start: segment.start, dir: segment.dir, length: segment.length, from: segment.from, to: segment.to }))
  )

/**
 * The stretches of the solid walls that face outside, as strips, with the corners made good
 * between two of them (MSG-13): what gross internal takes off the outline, and what a parapet
 * stands on (LVL-4). Empty when no wall faces outside. A curved wall's stretches, along its
 * curve, are cut by its chords, each strip along its own chord.
 */
function outerStrips(runs: readonly Run[], sides: ReadonlyMap<string, WallSides>, lineHalf: number, snap: (v: number) => number): Polygon[] {
  const join = tolerance('gap')
  const outer = runs
    .filter((r) => r.wall.virtual !== true)
    .flatMap((r) => {
      const whole = r.wall.arc === undefined ? r.length : wallLength(r.wall)
      const scale = r.to - r.from === 0 ? 1 : r.length / (r.to - r.from)
      return outerStretches(sides.get(r.wall.id), whole).flatMap(([from, to]): { run: Run; s: readonly [number, number] }[] => {
        const a = Math.max(from, r.from)
        const b = Math.min(to, r.to)
        return b - a > tolerance('noLength') ? [{ run: r, s: [(a - r.from) * scale, (b - r.from) * scale] as const }] : []
      })
    })
  const cuts: Polygon[] = outer.map(({ run, s: [from, to] }) => {
    const a = from <= tolerance('noLength') ? -join : from
    const b = to >= run.length - tolerance('noLength') ? run.length + join : to
    const at = { x: run.start.x + run.dir.x * a, y: run.start.y + run.dir.y * a }
    return strip(at, run.dir, b - a, run.wall.thickness / 2, 0, snap)
  })
  // The corners made good between two outer stretches go with them.
  const outerRuns = outer.map(({ run, s: [from, to] }) => ({ wall: run.wall, start: { x: run.start.x + run.dir.x * from, y: run.start.y + run.dir.y * from }, dir: run.dir, length: to - from }))
  cuts.push(...cornerFills(outerRuns, lineHalf, snap))
  return cuts
}

/** How far the walls reach from the origin, along a curve too. */
const reachOf = (walls: readonly Wall[]): number => {
  let reach = 0
  for (const run of runsOf(walls)) reach = Math.max(reach, Math.abs(run.start.x), Math.abs(run.start.y), Math.abs(run.start.x + run.dir.x * run.length), Math.abs(run.start.y + run.dir.y * run.length))
  return reach
}

/**
 * The floor inside the inside face of the walls that face outside, inner walls counted: the
 * floor's outline, as `spaces.ts` joins it, less the outer stretches of wall, keeping the parts
 * that hold enclosed floor. Null with a reason when no wall on the floor faces outside.
 */
function insideFace(walls: readonly Wall[], spaces: FloorSpaces, sides: ReadonlyMap<string, WallSides>, indoor: (space: Space) => boolean = () => true): number | string {
  if (spaces.spaces.length === 0) return 0
  const join = tolerance('gap')
  const reach = reachOf(walls)
  const runs = runsOf(walls)
  const solid = runs.filter((r) => r.wall.virtual !== true)
  if (outerStrips(solid, sides, 0, (v) => v).length === 0) return 'no wall on this floor faces outside, so the inside face of the outer walls is not known'
  let failure: unknown = null
  for (const grid of TOLERANCES.joinGrids.values) {
    try {
      const steps = grid === 0 ? 0 : Math.round(1 / grid)
      const snap = grid === 0 ? (v: number) => v : (v: number) => Math.round(v * steps) / steps
      const lineHalf = Math.max(TOLERANCES.lineHalfWidth.value, 5 * grid, reach * TOLERANCES.farNoise.value)
      const bodies: Polygon[] = runs.map((r) => strip(r.start, r.dir, r.length, r.wall.virtual === true ? lineHalf : r.wall.thickness / 2, join, snap))
      const frame = union([...bodies, ...cornerFills(solid, lineHalf, snap)])
      const filled = union(frame.map((polygon) => [polygon[0]!]))
      const rest: MultiPolygon = polygonClipping.difference(filled, ...outerStrips(solid, sides, lineHalf, snap))
      // CNT-7: a piece that holds only outdoor space (a courtyard inside its walls) is no floor.
      return sum(rest.filter((piece) => spaces.spaces.some((space) => indoor(space) && inPolygon(space.at, piece))).map(polygonArea))
    } catch (error) {
      failure = error
    }
  }
  return `the outer walls could not be cut from the floor (${failure instanceof Error ? failure.message : String(failure)})`
}

/**
 * The walls of one floor that face outside, as strips along them (LVL-4: what a parapet stands
 * on): the same stretches gross internal takes off. `walls` are the floor's walls as `floorSpaces`
 * joins them. Empty when none faces outside.
 */
export function outerWallBand(walls: readonly Wall[], sides: ReadonlyMap<string, WallSides>): Polygon[] {
  const solid = runsOf(walls).filter((r) => r.wall.virtual !== true)
  const lineHalf = Math.max(TOLERANCES.lineHalfWidth.value, reachOf(walls) * TOLERANCES.farNoise.value)
  return outerStrips(solid, sides, lineHalf, (v) => v)
}

/**
 * CNT-7 (C26): the building the gross figures are measured on, on a plan with outdoor space: the
 * plan less the walls that bound outdoor space and no room (`buildingPlan`), with its own index and
 * wall sides.
 */
interface Building {
  readonly plan: FloorPlan
  readonly index: PlanIndex
  readonly sides: () => ReadonlyMap<string, WallSides>
  readonly outdoor: ReadonlySet<string>
}

function floorFigures(
  plan: FloorPlan,
  floor: string,
  index: PlanIndex,
  broken: ReadonlySet<string>,
  outside: ReadonlySet<string>,
  sides: () => ReadonlyMap<string, WallSides>,
  countedWith: ReadonlyMap<string, { readonly floor: string; readonly room: string }>,
  building: Building | null
): FloorAreaFigures {
  const rooms: RoomAreaFigure[] = []
  const leftOut: RoomLeftOut[] = []
  const zones = roomZones(index)
  for (const room of plan.rooms) {
    if (floorOf(room) !== floor) continue
    // The rooms `floorSpaces` sets against the spaces, so that the figures add up.
    const outline = broken.has(room.id) ? null : tryRoomPolygon(room, index)
    if (outline === null || outline.length < 3) {
      leftOut.push({ id: room.id, name: nameOf(room), floor })
      continue
    }
    const zoneOf = zones.zoneOf.get(room.id) ?? null
    // CNT-7: an outdoor space is listed apart, in no figure, whatever else the caller names it.
    const kind = outdoorKind(room)
    const apart = kind === null && outside.has(room.id)
    const isVoid = room.void === true
    const below = apart || kind !== null || isVoid ? undefined : countedWith.get(`${floor}|${room.id}`)
    // CNT-16: the columns standing in it, taken off its area (`roomFloorArea`).
    const columnIds = roomColumns(room, index)
    rooms.push({
      id: room.id,
      name: nameOf(room),
      use: room.use ?? null,
      floor,
      area: roomFloorArea(room, index, outline),
      outside: apart,
      zoneOf,
      ...(below === undefined ? {} : { countedWith: below }),
      ...(columnIds.length === 0 ? {} : { columns: { area: roomColumnArea(room, index), ids: columnIds } }),
      ...(kind === null ? {} : { outdoor: { kind, roofed: outdoorRoofed(room)! } }),
      ...(isVoid ? { void: true as const } : {}),
    })
  }
  // A zone is in no figure (CNT-8): its floor is its room's, counted once. A zone is in no stair
  // stack either (`stairStacks`), so it never has `countedWith`.
  const counted = rooms.filter((room) => !room.outside && room.outdoor === undefined && room.void !== true && room.zoneOf === null && room.countedWith === undefined)
  const overStairs = sum(rooms.filter((room) => room.countedWith !== undefined).map((room) => room.area))
  const byUse: Record<string, number> = {}
  const add = (use: string | null, value: number): void => {
    byUse[use ?? NOT_SAID] = (byUse[use ?? NOT_SAID] ?? 0) + value
  }
  for (const room of counted) {
    // A room with zones gives each zone's floor to the zone's use, and keeps the rest for its own.
    // Zones that hold more than the room (two that overlap) leave it to the room's own use.
    const own = rooms.filter((zone) => zone.zoneOf === room.id)
    const zoned = sum(own.map((zone) => zone.area))
    if (own.length === 0 || zoned > room.area + tolerance('areaReported')) {
      add(room.use, room.area)
      continue
    }
    // What is left is the room's own; a sliver left by rounding goes with the first zone, so the
    // uses still add up to the net area to the last digit.
    const rest = room.area - zoned
    own.forEach((zone, i) => add(zone.use ?? room.use, zone.area + (i === 0 && rest < tolerance('areaReported') ? rest : 0)))
    if (rest >= tolerance('areaReported')) add(room.use, rest)
  }
  const net = sum(counted.map((room) => room.area))
  const outsideRooms = sum(rooms.filter((room) => room.outside).map((room) => room.area))
  const outdoorRooms = rooms.filter((room) => room.outdoor !== undefined)
  const columns = sum(rooms.map((room) => room.columns?.area ?? 0))
  // ARE-16: a void has no floor, so its floor is taken from both gross figures as well as the net.
  const voids = sum(rooms.filter((room) => room.void === true && room.zoneOf === null).map((room) => room.area))
  const base = { floor, rooms, leftOut, net, byUse, outsideRooms, overStairs, columns, voids, ...(outdoorRooms.length === 0 ? {} : { outdoor: sum(outdoorRooms.map((room) => room.area)) }) }

  // CNT-7: the gross figures are the building's, measured without the walls that bound only
  // outdoor space; an outdoor space inside the building's walls (a courtyard) is taken off them.
  const measured = building ?? { plan, index, sides, outdoor: new Set<string>() }
  const spaces = floorSpaces(measured.plan, floor, { index: measured.index, broken })
  if (!spacesKnown(spaces)) {
    return { ...base, grossExternal: null, grossInternal: null, walls: null, outerWalls: null, unclaimed: null, offSpace: null, why: `the walls' outline could not be worked out: ${spaces.reason}`, massing: false }
  }
  const outdoorSpace = (space: Space): boolean => space.rooms.length > 0 && space.rooms.every((r) => measured.outdoor.has(r.room))
  const enclosedOutdoor = measured.outdoor.size === 0 ? 0 : sum(spaces.spaces.filter(outdoorSpace).map((space) => space.area))
  const keptOutdoor = measured.outdoor.size === 0 ? 0 : sum(outdoorRooms.filter((room) => measured.plan.rooms.some((r) => r.id === room.id && floorOf(r) === floor)).map((room) => room.area))
  const offSpace = spaces.roomArea - keptOutdoor - (spaces.floorArea - enclosedOutdoor - spaces.unclaimedArea)
  const walls = floorWalls(measured.plan, floor, broken)
  if (walls.length === 0 && statedOutline(plan, floor) !== null) {
    // BRF-4 (C17): massing, an outline with no walls yet. Its outline is its outside face; it has
    // no inside face of walls to measure to until the walls are drawn.
    return { ...base, grossExternal: spaces.outlineArea, grossInternal: null, walls: 0, outerWalls: null, unclaimed: spaces.unclaimedArea, offSpace, why: MASSING_WHY, massing: true }
  }
  const inside = insideFace(walls, spaces, measured.sides(), (space) => !outdoorSpace(space))
  const known = typeof inside === 'number'
  // CNT-6 (C23): a separating wall with more of the building beyond it counts to its middle.
  const beyond = pastMiddle(walls, spaces, measured.sides())
  const gross = Math.max(0, spaces.outlineArea - beyond - enclosedOutdoor - voids)
  return {
    ...base,
    grossExternal: gross,
    grossInternal: known ? Math.max(0, inside - outsideRooms - voids) : null,
    walls: Math.max(0, spaces.wallArea - beyond),
    outerWalls: known ? Math.max(0, gross - (inside - voids)) : null,
    unclaimed: spaces.unclaimedArea,
    offSpace,
    why: known ? null : inside,
    massing: false,
  }
}

/**
 * CNT-6 (C23): the floor of the outline past the middle of every stretch of separating wall with a
 * room on one side only (`separating` in `exposure.ts`): the half of a party wall, or of a wall to
 * the common parts, that belongs to what lies beyond it. At a wall's ends the cut runs on past its
 * middle line to the face of the wall it meets, so the corner is cut on the same line. 0 when no
 * such stretch is drawn, or the cut cannot be made.
 */
function pastMiddle(walls: readonly Wall[], spaces: FloorSpaces, sides: ReadonlyMap<string, WallSides>): number {
  const solid = runsOf(walls).filter((r) => r.wall.virtual !== true)
  const reach = Math.max(0, ...solid.map((r) => r.wall.thickness / 2)) + tolerance('gap')
  const bands: Polygon[] = []
  for (const run of solid) {
    const wallSides = sides.get(run.wall.id)
    if (wallSides === undefined) continue
    const whole = run.wall.arc === undefined ? run.length : wallLength(run.wall)
    const scale = run.to - run.from === 0 ? 1 : run.length / (run.to - run.from)
    const list = wallSides.stretches
    const cut = (i: number): boolean => list[i]?.worked === 'separating'
    // An end of the wall where no other wall carries straight on: the cut runs on to the face of
    // the wall it meets there.
    const end = (point: Vec2): boolean =>
      !solid.some((other) => {
        if (other.wall === run.wall) return false
        const across = Math.abs(other.dir.x * run.dir.y - other.dir.y * run.dir.x)
        const ends = [other.start, { x: other.start.x + other.dir.x * other.length, y: other.start.y + other.dir.y * other.length }]
        return across <= tolerance('joint') && ends.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= tolerance('joint'))
      })
    list.forEach((stretch, i) => {
      // A stretch with no room on either face inside a corner goes with the separating one beside it.
      const beside = stretch.worked === 'detached' && (cut(i - 1) || cut(i + 1))
      if (stretch.worked !== 'separating' && !beside) return
      const a = Math.max(stretch.from, run.from)
      const b = Math.min(stretch.to, run.to)
      if (!(b - a > tolerance('noLength'))) return
      // The face with no room on it: the normal points at the left face.
      const one = stretch.worked === 'separating' ? stretch : (cut(i - 1) ? list[i - 1] : list[i + 1])!
      const away = one.left.length === 0 ? 1 : -1
      const startPoint = run.start
      const endPoint = { x: run.start.x + run.dir.x * run.length, y: run.start.y + run.dir.y * run.length }
      const from = (a - run.from) * scale - (a <= tolerance('noLength') && end(startPoint) ? reach : 0)
      const to = (b - run.from) * scale + (b >= whole - tolerance('noLength') && end(endPoint) ? reach : 0)
      const normal = { x: -run.dir.y * away, y: run.dir.x * away }
      const depth = run.wall.thickness / 2 + tolerance('gap')
      const at = (along: number, out: number): [number, number] => [run.start.x + run.dir.x * along + normal.x * out, run.start.y + run.dir.y * along + normal.y * out]
      bands.push([[at(from, 0), at(to, 0), at(to, depth), at(from, depth)]])
    })
  }
  if (bands.length === 0) return 0
  try {
    const outline: MultiPolygon = spaces.outline.map((rings) => rings.map((ring) => ring.map((p): [number, number] => [p.x, p.y])))
    const cut = polygonClipping.intersection(outline, union(bands))
    return sum(cut.map(polygonArea))
  } catch {
    return 0
  }
}

/** BRF-4: why a massing floor has no gross internal area. */
export const MASSING_WHY = 'it is an outline with no walls yet, so there is no inside face of its walls to measure to; its gross external area is its outline'


/**
 * SHT-11, lab DR-5: the stair rooms whose floor is counted with a stair room below, by floor and
 * id, each with the lowest room of its stair. Rooms used as a stair on neighbouring floors are one
 * stair when LVL-3's way-out check joins them (`floorJoins`: they share at least
 * `stairRoomOverlap` of the smaller); its floor is counted once, on the floor it rises from.
 */
function stairStacks(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>): Map<string, { floor: string; room: string }> {
  const outlines = new Map<string, Map<string, Vec2[]>>()
  // CNT-8: a zone is part of its room, not a room of its own, so it is in no stack.
  const zones = roomZones(index)
  for (const room of plan.rooms) {
    if (room.use !== 'stair' || broken.has(room.id) || zones.zoneOf.has(room.id)) continue
    const outline = tryRoomPolygon(room, index)
    if (outline === null || outline.length < 3) continue
    const floor = floorOf(room)
    const rooms = outlines.get(floor) ?? new Map<string, Vec2[]>()
    rooms.set(room.id, outline)
    outlines.set(floor, rooms)
  }
  const stacks = new Map<string, { floor: string; room: string }>()
  if ([...outlines.values()].filter((rooms) => rooms.size > 0).length < 2) return stacks
  const below = new Map<string, { floor: string; room: string }>()
  // Only what the outlines hold: no stated stair is laid out here.
  for (const join of floorJoins({ ...plan, stairs: [] }, outlines, () => broken).joins) {
    if (join.kind !== 'stair-room') continue
    const key = `${join.upper.floor}|${join.upper.room}`
    // A room over two stair rooms below goes with the first found: it is still counted once.
    if (!below.has(key)) below.set(key, join.lower)
  }
  for (const key of below.keys()) {
    let lowest = below.get(key)!
    const seen = new Set([key])
    for (let next = below.get(`${lowest.floor}|${lowest.room}`); next !== undefined; next = below.get(`${lowest.floor}|${lowest.room}`)) {
      const at = `${next.floor}|${next.room}`
      if (seen.has(at)) break
      seen.add(at)
      lowest = next
    }
    stacks.set(key, lowest)
  }
  return stacks
}

function readerMeasure(options: AreaOptions): ReaderMeasure {
  const country = options.country === undefined || options.country.trim() === '' ? null : options.country.trim().toUpperCase()
  if (options.gross === 'both') return { gross: ['grossInternal', 'grossExternal'], chosen: 'asked', country, why: 'Both gross areas were asked for.' }
  if (options.gross !== undefined) return { gross: [options.gross], chosen: 'asked', country, why: `${MEASURES[options.gross].name} was asked for.` }
  const usual = usualGross(country ?? undefined)
  if (usual === 'grossInternal') return { gross: [usual], chosen: 'country', country, why: `For ${country} Grid gives the inside face of the outer walls first; gross external can be asked for.` }
  if (usual === 'grossExternal') return { gross: [usual], chosen: 'country', country, why: `For homes in ${country} Grid gives the outside face of the walls first; gross internal can be asked for.` }
  const usualWhere = 'the inside face is usual in the UK and most of Europe, the outside face for homes in the US'
  return {
    gross: ['grossInternal', 'grossExternal'],
    chosen: 'none',
    country,
    why: country === null
      ? `No country was given, so both gross areas are given: ${usualWhere}.`
      : `Grid has no usual gross measure for ${country}, so both are given: ${usualWhere}.`,
  }
}

const total = (measure: Measure, floors: readonly FloorAreaFigures[], pick: (f: FloorAreaFigures) => number | null): AreaFigure => {
  const unknown = floors.filter((f) => pick(f) === null)
  return {
    measure,
    area: unknown.length > 0 ? null : sum(floors.map((f) => pick(f)!)),
    rule: MEASURES[measure],
    why: unknown.length > 0 ? unknown.map((f) => `Floor ${JSON.stringify(f.floor)}: ${f.why ?? 'not known'}.`).join(' ') : null,
  }
}

/**
 * Net, gross internal and gross external area of the plan, per floor and per use, each with the
 * rule it follows. Never throws on a plan the schema reads: a figure that cannot be worked out is
 * null with the reason.
 */
export function planAreaFigures(stated: FloorPlan, given: AreaOptions = {}): PlanAreaFigures {
  // CNT-10: the areas of the building as it will be after the work.
  const plan = planInState(stated, 'after')
  const options = plan === stated ? given : { ...given, index: undefined, broken: undefined }
  const index = options.index ?? indexPlan(plan)
  const broken = options.broken ?? validatePlan(plan, index, { spaces: false }).broken
  const outside = options.outside ?? new Set<string>()
  let sides: ReadonlyMap<string, WallSides> | undefined
  const sidesOnce = (): ReadonlyMap<string, WallSides> => (sides ??= planWallSides(index))
  const stacks = stairStacks(plan, index, broken)
  const building = buildingOf(plan, index)
  const floors = planFloors(plan)
    .filter((floor) => options.floors === undefined || options.floors.includes(floor.id))
    .map((floor) => floorFigures(plan, floor.id, index, broken, outside, sidesOnce, stacks, building))

  const byUse: Record<string, number> = {}
  for (const f of floors) for (const [use, area] of Object.entries(f.byUse)) byUse[use] = (byUse[use] ?? 0) + area
  const leftOut = floors.flatMap((f) => f.leftOut)
  const reported = tolerance('areaReported')
  const notes: string[] = []
  if (leftOut.length > 0) {
    notes.push(`Left out of every figure, because Grid could not draw ${leftOut.length === 1 ? 'it' : 'them'}: ${leftOut.map((r) => JSON.stringify(r.name)).join(', ')}. grid_check says why.`)
  }
  const massing = floors.filter((f) => f.massing)
  if (massing.length > 0) {
    const names = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
    notes.push(
      `${massing.length === 1 ? 'Floor' : 'Floors'} ${massing.map((f) => JSON.stringify(names.get(f.floor) ?? f.floor)).join(', ')} ${massing.length === 1 ? 'is' : 'are'} massing, ` +
        `an outline with no walls yet: gross external area only, to the outline as stated, and no net or gross internal area until the walls and rooms are drawn.`
    )
  }
  const unclaimed = sum(floors.filter((f) => !f.massing).map((f) => f.unclaimed ?? 0))
  const where = floors.some((f) => statedOutline(plan, f.floor) !== null) ? "inside the walls, or inside a floor's stated outline," : 'inside the walls'
  if (unclaimed >= reported) notes.push(`${unclaimed.toFixed(2)} m² of floor ${where} belongs to no room: it is in the gross figures only.`)
  const off = sum(floors.map((f) => Math.abs(f.offSpace ?? 0)))
  if (off >= reported) notes.push(`${off.toFixed(2)} m² of the rooms' floor is counted twice, or lies on walls or outside them, so net plus walls plus unclaimed floor is not the gross; grid_check names the rooms.`)
  const outsideRooms = sum(floors.map((f) => f.outsideRooms))
  const over = rooms(floors).filter((room) => room.countedWith !== undefined)
  if (over.length > 0) {
    const names = new Map(plan.rooms.map((room) => [`${floorOf(room)}|${room.id}`, nameOf(room)] as const))
    const floorNames = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
    const lowest = [...new Map(over.map((room) => [`${room.countedWith!.floor}|${room.countedWith!.room}`, room.countedWith!] as const)).values()]
    for (const stair of lowest) {
      const above = over.filter((room) => room.countedWith!.floor === stair.floor && room.countedWith!.room === stair.room)
      notes.push(
        `${JSON.stringify(names.get(`${stair.floor}|${stair.room}`) ?? stair.room)} on ${JSON.stringify(floorNames.get(stair.floor) ?? stair.floor)} is a stair that rises through ` +
          `${above.length === 1 ? 'the stair room' : `${above.length} stair rooms`} over it (${above.map((room) => JSON.stringify(floorNames.get(room.floor) ?? room.floor)).join(', ')}): ` +
          `its floor is counted once, there, so ${sum(above.map((room) => room.area)).toFixed(2)} m² over it is in no net figure; the gross figures still hold it.`
      )
    }
  }
  // CNT-16: the floor the columns cover, taken off the rooms they stand in.
  const columnFloor = sum(floors.map((f) => f.columns))
  if (columnFloor > 0) {
    const count = new Set(rooms(floors).flatMap((room) => room.columns?.ids ?? [])).size
    notes.push(english(said(count === 1 ? 'areas.columns.one' : 'areas.columns.many', { count, area: num(columnFloor.toFixed(2)) })))
  }
  if (rooms(floors).some((room) => room.outside)) notes.push('Rooms named as outside are listed apart: they are in no net or gross internal figure, and their floor is in the gross external one.')
  const outdoor = outdoorFigure(floors, options.outdoorWeights)
  if (outdoor !== null) notes.push(english(said('areas.note.outdoor', { area: num(outdoor.area.toFixed(2)) })))
  const toParty = partyWallGroups(plan, index, broken, sidesOnce, floors)
  const flats = flatFigures(plan, floors, toParty, options.outdoorWeights)
  const notInFlats = sum(floors.map((f) => f.net)) - sum(flats.map((flat) => flat.net))

  return {
    floors,
    buildings: buildingFigures(plan, floors),
    flats,
    notInFlats,
    notInFlatsToPartyWalls: toParty === null ? null : toParty.common,
    net: total('net', floors, (f) => f.net),
    grossInternal: total('grossInternal', floors, (f) => f.grossInternal),
    grossExternal: total('grossExternal', floors, (f) => f.grossExternal),
    byUse,
    outsideRooms,
    leftOut,
    reader: readerMeasure(options),
    notes,
    ...(outdoor === null ? {} : { outdoor }),
  }
}

/** CNT-7: the building the gross figures are measured on, or null for a plan with no outdoor space. */
function buildingOf(plan: FloorPlan, index: PlanIndex): Building | null {
  if (!planHasOutdoor(plan)) return null
  const measured = buildingPlan(plan, index)
  const own = measured === plan ? index : indexPlan(measured)
  let sides: ReadonlyMap<string, WallSides> | undefined
  return { plan: measured, index: own, sides: () => (sides ??= planWallSides(own)), outdoor: outdoorIds(measured) }
}

/** CNT-7: the outdoor spaces on the floors given, and their floor weighted by the rules stated. Null when there is none. */
function outdoorFigure(floors: readonly FloorAreaFigures[], weights: AreaOptions['outdoorWeights']): OutdoorAreaFigure | null {
  const outdoor = rooms(floors).filter((room) => room.outdoor !== undefined)
  if (outdoor.length === 0) return null
  const byKind: Partial<Record<OutdoorKind, number>> = {}
  for (const room of outdoor) byKind[room.outdoor!.kind] = (byKind[room.outdoor!.kind] ?? 0) + room.area
  const weighed = outdoor.flatMap((room) => {
    const weight = weights?.[room.outdoor!.kind]
    return weight === undefined || !Number.isFinite(weight.weight) ? [] : [{ room, weight }]
  })
  const kinds = (Object.keys(byKind) as OutdoorKind[]).flatMap((kind) => {
    const weight = weights?.[kind]
    if (weight === undefined || !Number.isFinite(weight.weight)) return []
    const share = shareOf(weight)
    return [{ kind, area: byKind[kind]!, share, counted: byKind[kind]! * share, rule: weight.rule }]
  })
  const net = sum(floors.map((f) => f.net))
  return {
    area: sum(outdoor.map((room) => room.area)),
    byKind,
    roofed: sum(outdoor.filter((room) => room.outdoor!.roofed).map((room) => room.area)),
    open: sum(outdoor.filter((room) => !room.outdoor!.roofed).map((room) => room.area)),
    rule: MEASURES.outdoor,
    weighted: weighed.length === 0
      ? null
      : {
          area: sum(weighed.map(({ room, weight }) => room.area * shareOf(weight))),
          rules: [...new Set(weighed.map(({ weight }) => weight.rule))],
          kinds,
          withNet: net + sum(weighed.map(({ room, weight }) => room.area * shareOf(weight))),
        },
  }
}

/** A stated share, held from 0 to 1. */
const shareOf = (weight: OutdoorWeight): number => Math.min(1, Math.max(0, weight.weight))

const rooms = (floors: readonly FloorAreaFigures[]): RoomAreaFigure[] => floors.flatMap((f) => f.rooms)

/** CNT-6: each building's figures, the sums of its own floors'. */
function buildingFigures(plan: FloorPlan, floors: readonly FloorAreaFigures[]): BuildingAreaFigure[] {
  const byFloor = new Map(floors.map((f) => [f.floor, f] as const))
  const grossOf = (list: readonly FloorAreaFigures[], pick: (f: FloorAreaFigures) => number | null): number | null => {
    const values = list.map(pick)
    return values.every((v): v is number => v !== null) ? sum(values) : null
  }
  return planBuildings(plan).flatMap((building) => {
    const own = building.floors.flatMap((id) => (byFloor.has(id) ? [byFloor.get(id)!] : []))
    if (own.length === 0) return []
    return [{
      id: building.id,
      name: building.name,
      floors: own.map((f) => f.floor),
      net: sum(own.map((f) => f.net)),
      grossInternal: grossOf(own, (f) => f.grossInternal),
      grossExternal: grossOf(own, (f) => f.grossExternal),
    }]
  })
}

/** CNT-4: each flat's figures, from the flats list and the rooms as the floors count them. */
function flatFigures(plan: FloorPlan, floors: readonly FloorAreaFigures[], toParty: PartyWallGroups | null, weights: AreaOptions['outdoorWeights']): FlatAreaFigure[] {
  const flats = planFlats(plan)
  if (flats.length === 0) return []
  const measured = new Map(rooms(floors).map((room) => [`${room.floor}|${room.id}`, room] as const))
  const missing = new Set(floors.flatMap((f) => f.leftOut.map((room) => `${room.floor}|${room.id}`)))
  const given = new Set(floors.map((f) => f.floor))
  const out: FlatAreaFigure[] = []
  for (const flat of flats) {
    const here = flat.rooms.filter((room) => given.has(room.floor))
    if (here.length === 0) continue
    const counted: string[] = []
    const notCounted: FlatAreaFigure['notCounted'][number][] = []
    const byFloor: Record<string, number> = {}
    let outdoorArea = 0
    let weighted: number | null = null
    let holdsOutdoor = false
    for (const { id, floor } of here) {
      const room = measured.get(`${floor}|${id}`)
      if (room === undefined) continue
      if (room.outdoor !== undefined) holdsOutdoor = true
      if (room.zoneOf !== null) notCounted.push({ id, why: 'zone' })
      else if (room.outdoor !== undefined) {
        notCounted.push({ id, why: 'outdoor' })
        outdoorArea += room.area
        const weight = weights?.[room.outdoor.kind]
        if (weight !== undefined && Number.isFinite(weight.weight)) weighted = (weighted ?? 0) + room.area * shareOf(weight)
      }
      else if (room.outside) notCounted.push({ id, why: 'outside' })
      else if (room.countedWith !== undefined) notCounted.push({ id, why: 'stair-below' })
      else {
        counted.push(id)
        byFloor[floor] = (byFloor[floor] ?? 0) + room.area
      }
    }
    out.push({
      id: flat.id,
      name: flat.name,
      type: flat.type,
      typeName: flat.typeName,
      mirrored: flat.mirrored,
      floors: flat.floors.filter((floor) => given.has(floor)),
      net: sum(Object.values(byFloor)),
      byFloor,
      rooms: counted,
      notCounted,
      leftOut: here.filter((room) => missing.has(`${room.floor}|${room.id}`)).map((room) => room.id),
      toPartyWalls: toParty === null ? null : (toParty.flats.get(flat.id) ?? null),
      ...(holdsOutdoor ? { outdoor: { area: outdoorArea, weighted } } : {}),
    })
  }
  return out
}

/** ARE-14: each flat's area to the party walls, and the rooms' in no flat, over the floors given. */
interface PartyWallGroups {
  readonly flats: ReadonlyMap<string, PartyWallArea | null>
  readonly common: PartyWallArea | null
}

/**
 * ARE-14 (lab R-1): each flat's rooms, and the rooms in no flat, measured to the middle of the
 * walls round them (`partyWalls.ts`), floor by floor and added up. A room in a flat's figure is a
 * room the floors measure, but no zone (it is in its room), no outdoor space (it is the outside)
 * and no room named outside. Null on a plan that lists no flats.
 */
function partyWallGroups(plan: FloorPlan, index: PlanIndex, broken: ReadonlySet<string>, sides: () => ReadonlyMap<string, WallSides>, floors: readonly FloorAreaFigures[]): PartyWallGroups | null {
  const flats = planFlats(plan)
  if (flats.length === 0) return null
  const flatOf = new Map(flats.flatMap((flat) => flat.rooms.map((room) => [`${room.floor}|${room.id}`, flat.id] as const)))
  const stated = new Map(plan.rooms.map((room) => [`${floorOf(room)}|${room.id}`, room] as const))
  // Lab plans repeat ids from floor to floor, so a room's walls are looked up on its own floor.
  const wallsOn = new Map(floors.map((f) => [f.floor, new Map(wallsOnFloor(plan, f.floor).map((wall) => [wall.id, wall] as const))] as const))
  // By flat (null for the rooms in no flat), then by floor, so a duplex's floors are added and never joined across.
  const groups = new Map<string | null, Map<string, PartyWallRoom[]>>()
  for (const f of floors) {
    for (const figure of f.rooms) {
      if (figure.zoneOf !== null || figure.outdoor !== undefined || figure.outside) continue
      const room = stated.get(`${f.floor}|${figure.id}`)
      const shape = room === undefined ? null : tryRoomShape(room, index)
      if (room === undefined || shape === null) continue
      const group = flatOf.get(`${f.floor}|${figure.id}`) ?? null
      const own = [...new Set(roomWallIds(room))].flatMap((id) => {
        const wall = wallsOn.get(f.floor)?.get(id)
        return wall === undefined || broken.has(id) ? [] : [wall]
      })
      const byFloor = groups.get(group) ?? new Map<string, PartyWallRoom[]>()
      byFloor.set(f.floor, [...(byFloor.get(f.floor) ?? []), { polygon: shape.polygon, holes: shape.holes, walls: own }])
      groups.set(group, byFloor)
    }
  }
  const none: PartyWallArea = { grossInternal: 0, grossExternal: 0 }
  const measured = (group: string | null): PartyWallArea | null => {
    let total: PartyWallArea | null = none
    for (const rooms of (groups.get(group) ?? new Map<string, PartyWallRoom[]>()).values()) {
      const area = partyWallArea(rooms, sides())
      total = total === null || area === null ? null : { grossInternal: total.grossInternal + area.grossInternal, grossExternal: total.grossExternal + area.grossExternal }
    }
    return total
  }
  const given = new Set(floors.map((f) => f.floor))
  return {
    flats: new Map(flats.filter((flat) => flat.rooms.some((room) => given.has(room.floor))).map((flat) => [flat.id, measured(flat.id)] as const)),
    common: measured(null),
  }
}
