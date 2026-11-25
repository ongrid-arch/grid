/**
 * Floor areas with the rule each one follows, said in the answer (ARE-9), and the state of each
 * (MSG-2).
 *
 * The figures are the library's (`planAreaFigures`): net, gross internal and gross external,
 * per floor and per use, each described in Grid's own words (`MEASURES`). This file adds what
 * the measuring tools show beside them: each room's inside size, the floor its fixtures leave
 * free (CNT-12), circulation (rooms whose `use` is corridor or stair) as a share of the gross
 * internal area, and the state of every figure (`state.ts`).
 *
 * Rooms the caller names as outside (a balcony, a terrace) are listed apart and are not in the
 * net or the gross internal area. Rooms Grid could not draw are listed with no area, named, and
 * are in no figure.
 */
import { MEASURES, floorOf, floorRoofShape, headroomBands, planMarks, roomHeadroom, wallSureness, type GrossMeasure, type HeadroomBand, type MeasureRule, type ReaderMeasure, type RoomLeftOut } from '@ongrid/floorplan/geometry'
import { FLAT_AREA_RULE, planAreaFigures, type ApartAreaFigure, type FlatAreaFigure, type OutdoorAreaFigure, type OutdoorWeight, type PlanAreaFigures } from '@ongrid/floorplan/geometry/areas'
import type { PartyWallArea } from '@ongrid/floorplan/geometry/partyWalls'
import type { MarkSource, OutdoorKind } from '@ongrid/floorplan/types/floorplan'
import type { Survey, SurveyRoom } from './survey'
import { FIXTURE_RULES, planFixtures } from './fixtures'
import { doubted, joinStates, lessRooms, NOT_LOOKED_AT, roomDoubts, roomState, sumState, type AreaState, type NumberState } from './state'

/** What each measure measures, in one sentence each. */
export const AREA_RULES = {
  net: MEASURES.net.measures,
  grossInternal: MEASURES.grossInternal.measures,
  grossExternal: MEASURES.grossExternal.measures,
  circulation: 'Circulation is the rooms whose use is corridor or stair, a stair counted once, as a share of the gross internal area.',
} as const

/** CNT-4: what a flat's area measures, said only on a plan that lists flats. */
export const FLAT_RULE = FLAT_AREA_RULE

/**
 * WRT-6 (lab AE-4, AE-13): how sure an area is, from the marks on the walls round it. `source`
 * is where those walls came from (scanned first, when any was). `plusMinus` is the most the area
 * moves when each marked wall's face moves by its tolerance, each side of the room times that
 * tolerance, added up; null when a scanned wall states no tolerance, so how sure is not stated.
 * `percent` is that over the area. A room none of whose walls is marked has none.
 */
export interface AreaSureness {
  readonly source: MarkSource
  readonly plusMinus: number | null
  readonly percent: number | null
}

export interface RoomArea {
  readonly id: string
  readonly name: string
  readonly use: string | null
  readonly floor: string
  /** Null when the room cannot be drawn, so has no area (MSG-2): it is named as left out of every total. */
  readonly net: number | null
  /** MSG-2: proven, not proven (the drawing questions its outline) or not looked at (not measured). */
  readonly state: NumberState
  /** The drawing problems that question its outline, by code. Empty when there are none. */
  readonly doubts: readonly string[]
  /** Inside sizes across and up the drawing, when the room is a rectangle square to it. */
  readonly size: readonly [number, number] | null
  readonly outside: boolean
  /**
   * SHT-11, lab DR-5: only on a stair room over a stair room below: the room its floor is counted
   * with, on the floor the stair rises from. It keeps its own area, and is in no total.
   */
  readonly countedWith?: { readonly floor: string; readonly room: string }
  /** CNT-12, only on a room with fixtures: the floor they stand on, and the net area less it. */
  readonly fixtures?: number
  readonly free?: number
  /**
   * LVL-6, only on a room on a floor that states its roof: its floor with at least each headroom
   * band of height over it, and its lowest and highest height.
   */
  readonly headroom?: { readonly bands: readonly HeadroomBand[]; readonly lowest: number; readonly highest: number }
  /** CNT-8, only on a zone: the room it is part of. Measured, and in no total: its floor is its room's. */
  readonly zoneOf?: string
  /** CNT-7 (C26), only on an outdoor space: its kind and whether a roof covers it. Measured, and in no total. */
  readonly outdoor?: { readonly kind: OutdoorKind; readonly roofed: boolean }
  /** ARE-16, only on a void (LVL-4): no floor stands there. Measured, and in no total. */
  readonly void?: true
  /**
   * WRT-6: only on a room whose walls the plan marks: where they came from and how sure the area
   * is. A zone's band is its own, and is added into no total (CNT-8).
   */
  readonly sureness?: AreaSureness
}

export interface FloorAreas {
  readonly floor: string
  readonly rooms: readonly RoomArea[]
  /** Rooms on this floor Grid could not draw: in no figure. */
  readonly leftOut: readonly RoomLeftOut[]
  readonly net: number
  readonly byUse: Readonly<Record<string, number>>
  readonly circulation: number
  /** Null when it cannot be worked out on this floor (`why`). */
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  readonly outsideRooms: number
  /** SHT-11: the stair rooms whose floor is counted with the stair room below. */
  readonly overStairs: number
  /** Every solid wall; null with the gross figures. */
  readonly walls: number | null
  /** Enclosed floor that no room covers, on the whole floor. */
  readonly unclaimed: number
  /** BRF-4 (C17): the floor is massing, an outline it states with no walls yet; left out otherwise. */
  readonly massing?: true
  /** WRT-6: the net area's sureness, from its rooms'; only when one of them has one. */
  readonly sureness?: AreaSureness
  /** ARE-14 (lab S-6), only on a floor with fixtures: the floor they take from the rooms its net counts, and the net less it. */
  readonly fixtures?: number
  readonly free?: number
  readonly why: string | null
  /** LVL-6, only on a floor that states its roof: its rooms' floor by headroom band, those counted in net. */
  readonly headroom?: readonly HeadroomBand[]
  /** MSG-2: the state of each figure, and the rooms it left out or holds in doubt. */
  readonly states: {
    readonly net: AreaState
    readonly byUse: Readonly<Record<string, AreaState>>
    readonly circulation: AreaState
    readonly grossInternal: AreaState
    readonly grossExternal: AreaState
  }
}

/** CNT-4 (lab EL-1): a flat's area, from the plan's flats list, with its state (MSG-2). */
export interface FlatAreas extends FlatAreaFigure {
  /** Proven, not proven (a room of it in doubt or left out) or not looked at (none measured). */
  readonly state: AreaState
  /** ARE-14, only on a flat with fixtures in the rooms it counts: the floor they take, and its net less it. */
  readonly fixtures?: number
  readonly free?: number
}

export interface PlanAreas {
  readonly floors: readonly FloorAreas[]
  /** CNT-4: each flat of the plan's flats list on the floors given, in plan order; empty with none. */
  readonly flats: readonly FlatAreas[]
  /** CNT-4: the net area of the rooms in no flat: the common parts. Null when the plan lists no flats. */
  readonly notInFlats: number | null
  /** ARE-14: the rooms in no flat to the party walls, as a flat's are. Null when the plan lists no flats. */
  readonly notInFlatsToPartyWalls: PartyWallArea | null
  /** CNT-6: each building the plan names, its own floors' figures; empty with none. */
  readonly buildings: PlanAreaFigures['buildings']
  readonly net: number
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  readonly circulation: number
  /** Circulation over gross internal, 0 to 1; null without a gross internal area. */
  readonly circulationShare: number | null
  /** Net over gross internal, 0 to 1; null without a gross internal area. */
  readonly netToGross: number | null
  readonly byUse: Readonly<Record<string, number>>
  readonly leftOut: readonly RoomLeftOut[]
  /** Which gross measure to give first, and why. */
  readonly reader: ReaderMeasure
  /** Why a gross figure is not known, in a sentence; null when both are. */
  readonly grossWhy: string | null
  /** LVL-6: the floor by headroom band, over the floors that state their roof; null when none does. */
  readonly headroom: readonly HeadroomBand[] | null
  /** CNT-7 (C26): the outdoor spaces, listed apart from every total; only on a plan that has one. */
  readonly outdoor?: OutdoorAreaFigure
  /** The three measures, each with what it measures, does not take off and cannot say, and area by headroom where a floor states its roof. */
  readonly measures: readonly MeasureRule[]
  readonly rules: readonly string[]
  readonly notes: readonly string[]
  /** WRT-6: the net total's sureness, from its rooms'; only when one of them has one. */
  readonly sureness?: AreaSureness
  /** ARE-14 (lab S-6), only on a plan with fixtures: the floor they take from the rooms the net counts, and the net less it. */
  readonly fixtures?: number
  readonly free?: number
  /** ARE-20: the rooms asked to be measured apart, with the state of their net; only when some were. */
  readonly apart?: ApartAreaFigure & { readonly state: AreaState }
  /** MSG-2: the state of each total, and the rooms it left out or holds in doubt. */
  readonly states: {
    readonly net: AreaState
    readonly circulation: AreaState
    readonly grossInternal: AreaState
    readonly grossExternal: AreaState
    readonly circulationShare: AreaState
    readonly netToGross: AreaState
  }
}

export interface AreasRequest {
  readonly outside?: ReadonlySet<string>
  readonly floors?: readonly string[]
  readonly country?: string
  readonly gross?: GrossMeasure | 'both'
  /** CNT-7, ARE-14: the share of each kind of outdoor space a rule the person states counts. */
  readonly outdoorWeights?: Readonly<Partial<Record<OutdoorKind, OutdoorWeight>>>
  /** ARE-20: room ids to measure apart, as one building from another built against it. */
  readonly apart?: ReadonlySet<string>
}

const CIRCULATION = new Set(['corridor', 'stair'])

/** Bands of several rooms or floors added up, band by band. */
function addBands(lists: readonly (readonly HeadroomBand[])[]): HeadroomBand[] {
  return headroomBands().map((height) => ({ height, area: lists.reduce((total, bands) => total + (bands.find((b) => b.height === height)?.area ?? 0), 0) }))
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

const NOT_SAID = 'not said'

/** The rule for a band on an area, said where one is given (WRT-6). */
export const SURENESS_RULE = 'Give or take: each side of a room times the tolerance its wall is marked with, added up, over the area: the most the area moves if every marked face moves its full tolerance one way. Grid\'s own rule, not a survey standard.'

/** WRT-6: how sure a room's area is, from the marks on the walls its sides lie on. */
function roomSureness(room: SurveyRoom | undefined, marks: ReturnType<typeof planMarks>, net: number | null): AreaSureness | undefined {
  if (room === undefined || marks.all.length === 0) return undefined
  let source: MarkSource | null = null
  let plusMinus: number | null = 0
  for (const edge of room.edges) {
    if (edge.wall === null) continue
    const sure = wallSureness(marks, edge.wall.id)
    if (sure.source === null) continue
    if (source === null || sure.source === 'scanned') source = sure.source
    if (sure.tolerance !== null) plusMinus = plusMinus === null ? null : plusMinus + edge.length * sure.tolerance
    else if (sure.source === 'scanned') plusMinus = null
  }
  if (source === null) return undefined
  return { source, plusMinus, percent: plusMinus === null || net === null || net <= 0 ? null : (100 * plusMinus) / net }
}

/** WRT-6: the sureness of a sum of rooms: their bands added up, over the sum. */
function sumSureness(rooms: readonly RoomArea[], total: number): AreaSureness | undefined {
  const sure = rooms.filter((room) => room.sureness !== undefined)
  if (sure.length === 0) return undefined
  const plusMinus = sure.some((room) => room.sureness!.plusMinus === null) ? null : sure.reduce((a, room) => a + room.sureness!.plusMinus!, 0)
  const source = sure.some((room) => room.sureness!.source === 'scanned') ? 'scanned' : sure[0]!.sureness!.source
  return { source, plusMinus, percent: plusMinus === null || total <= 0 ? null : (100 * plusMinus) / total }
}
/** The rooms the totals count: no outside room, no zone (CNT-8), no stair room counted with the one below (SHT-11). */
const inTotals = (room: RoomArea): boolean => !room.outside && room.outdoor === undefined && room.void !== true && room.zoneOf === undefined && room.countedWith === undefined

const key = (floor: string, id: string): string => `${floor}\u0000${id}`

export function planAreas(survey: Survey, request: AreasRequest = {}): PlanAreas {
  const outside = request.outside ?? new Set<string>()
  const figures = planAreaFigures(survey.plan, {
    outside,
    ...(request.floors ? { floors: request.floors } : {}),
    ...(request.country ? { country: request.country } : {}),
    ...(request.gross ? { gross: request.gross } : {}),
    ...(request.outdoorWeights ? { outdoorWeights: request.outdoorWeights } : {}),
    ...(request.apart ? { apart: request.apart } : {}),
  })
  const { taken, zoneTaken } = planFixtures(survey.plan, request.floors)
  // LVL-6: a room on a floor that states its roof has its floor by headroom band.
  const headroomOf = (floor: string, id: string, net: number | null): Pick<RoomArea, 'headroom'> => {
    if (net === null || floorRoofShape(survey.plan, floor) === null) return {}
    const room = survey.plan.rooms.find((r) => r.id === id && floorOf(r) === floor)
    const found = room === undefined ? null : roomHeadroom(survey.plan, room)
    return found === null ? {} : { headroom: { bands: found.bands, lowest: found.lowest, highest: found.highest } }
  }
  const doubts = roomDoubts(survey.plan, figures.floors.map((f) => f.floor))
  // Lab plans repeat room ids from floor to floor, so a room is found by its floor too.
  const shapes = new Map(survey.rooms.map((room) => [key(room.facts.floor, room.facts.id), room.facts.shape] as const))
  const surveyed = new Map(survey.rooms.map((room) => [key(room.facts.floor, room.facts.id), room] as const))
  const marks = planMarks(survey.plan)

  const floors: FloorAreas[] = figures.floors.map((f) => {
    const counted = new Map(f.rooms.map((room) => [room.id, room] as const))
    const unmeasured = new Map(f.leftOut.map((room) => [room.id, room] as const))
    // Every room on the floor, in plan order: one Grid could not draw is listed with no area.
    const ids = [...new Set(survey.plan.rooms.map((room) => room.id).filter((id) => counted.has(id) || unmeasured.has(id)))]
    const uses = new Map(survey.plan.rooms.filter((room) => counted.has(room.id) || unmeasured.has(room.id)).map((room) => [room.id, room.use ?? null] as const))
    const rooms: RoomArea[] = ids.map((id) => {
      const figure = counted.get(id)
      const net = figure?.area ?? null
      const doubted = doubts.get(f.floor)?.get(id) ?? []
      const shape = shapes.get(key(f.floor, id))
      // ARE-14: a zone's fixtures are those whose middle is in it; its room's free floor holds them too.
      const fixtures = figure !== undefined && figure.zoneOf !== null ? zoneTaken.get(id) : taken.get(id)
      const sureness = roomSureness(surveyed.get(key(f.floor, id)), marks, net)
      return {
        id,
        name: figure?.name ?? unmeasured.get(id)!.name,
        use: figure?.use ?? uses.get(id) ?? null,
        floor: f.floor,
        net,
        state: roomState(net, doubted),
        doubts: doubted,
        size: shape?.rectangle ? [shape.across, shape.up] : null,
        outside: outside.has(id),
        ...(figure?.countedWith === undefined ? {} : { countedWith: figure.countedWith }),
        // Fixtures add no area and take none from the totals: only the room's free floor (CNT-12).
        // A room that could not be measured has no free floor either (MSG-2).
        ...(fixtures === undefined ? {} : { fixtures, ...(net === null ? {} : { free: Math.max(0, net - fixtures) }) }),
        ...headroomOf(f.floor, id, net),
        ...(figure === undefined || figure.zoneOf === null ? {} : { zoneOf: figure.zoneOf }),
        ...(figure?.outdoor === undefined ? {} : { outdoor: figure.outdoor }),
        ...(figure?.void === true ? { void: true as const } : {}),
        ...(sureness === undefined ? {} : { sureness }),
      }
    })
    // CNT-8: a zone is in no total; its floor is counted in its room's, by the zone's use.
    // SHT-11: nor is a stair room counted with the one below, nor the zones of such a room.
    const inside = rooms.filter(inTotals)
    const zones = rooms.filter((room) => !room.outside && room.outdoor === undefined && room.zoneOf !== undefined && inside.some((r) => r.id === room.zoneOf))
    const useOf = (room: RoomArea): string => room.use ?? (room.zoneOf === undefined ? null : rooms.find((r) => r.id === room.zoneOf)?.use) ?? NOT_SAID
    const byUseState: Record<string, AreaState> = {}
    const usesHere = [
      ...inside.filter((room) => !zones.some((zone) => zone.zoneOf === room.id) || Object.hasOwn(f.byUse, useOf(room))).map(useOf),
      ...zones.map(useOf),
    ]
    for (const use of [...new Set(usesHere)]) byUseState[use] = sumState([...inside, ...zones].filter((room) => useOf(room) === use))
    const circulating = inside.filter((room) => CIRCULATION.has(room.use ?? ''))
    // A use whose rooms could none be measured is still listed, at 0 and not looked at (MSG-2).
    const byUse: Record<string, number> = { ...f.byUse }
    for (const use of Object.keys(byUseState)) byUse[use] ??= 0
    const headroom = inside.some((room) => room.headroom !== undefined) ? addBands(inside.flatMap((room) => (room.headroom ? [room.headroom.bands] : []))) : null
    const floorSure = sumSureness(inside, f.net)
    // ARE-14 (lab S-6): the floor the fixtures take from the rooms the net counts, beside the net.
    const fitted = inside.filter((room) => room.fixtures !== undefined)
    const floorFixtures = sum(fitted.map((room) => room.fixtures!))
    return {
      floor: f.floor,
      rooms,
      leftOut: f.leftOut,
      net: f.net,
      byUse,
      circulation: sum(circulating.map((room) => room.net ?? 0)),
      grossInternal: f.grossInternal,
      grossExternal: f.grossExternal,
      outsideRooms: f.outsideRooms,
      overStairs: f.overStairs,
      walls: f.walls,
      unclaimed: f.unclaimed ?? 0,
      // BRF-4 (C17): only on a massing floor, an outline with no walls yet.
      ...(f.massing ? { massing: true as const } : {}),
      ...(floorSure === undefined ? {} : { sureness: floorSure }),
      ...(fitted.length === 0 ? {} : { fixtures: floorFixtures, free: Math.max(0, f.net - floorFixtures) }),
      why: f.why,
      ...(headroom === null ? {} : { headroom }),
      states: {
        net: sumState(inside),
        byUse: byUseState,
        circulation: sumState(circulating),
        // Gross areas come from the walls; gross internal takes off the outside rooms. ARE-20: one
        // below a figure it must hold is not proven, and says why.
        grossInternal: f.grossInternal === null ? NOT_LOOKED_AT : doubted(lessRooms(rooms.filter((room) => room.outside)), f.doubts.grossInternal),
        grossExternal: f.grossExternal === null ? NOT_LOOKED_AT : doubted(lessRooms([]), f.doubts.grossExternal),
      },
    }
  })

  const grossInternal = figures.grossInternal.area
  const net = figures.net.area ?? 0
  const circulation = sum(floors.map((f) => f.circulation))
  const unknown = [figures.grossInternal, figures.grossExternal].filter((g) => g.area === null)
  const grossWhy = unknown.length === 0 ? null : `No ${unknown.map((g) => g.rule.name.toLowerCase()).join(' or ')}: ${unknown[0]!.why}`
  const netState = joinStates(floors.map((f) => f.states.net))
  const notes: string[] = grossWhy ? [grossWhy] : []
  // CNT-10: the state these figures describe, in a plan with phases.
  const work = survey.facts.work
  if (work !== null) {
    const gone = work.counts.demolished.rooms
    notes.unshift(`These areas are of the building as it will be after the work: ${gone === 0 ? 'no room is' : gone === 1 ? 'the room to be demolished is' : `the ${gone} rooms to be demolished are`} left out, and new rooms are in.`)
  }
  // AC-9: a room that cannot be measured is named, so a total short by its area is read as such.
  if (netState.leftOut.length > 0) {
    const several = survey.facts.floors.length > 1
    const named = netState.leftOut.map((room) => `${JSON.stringify(room.name)}${several ? ` on ${JSON.stringify(room.floor)}` : ''}`).join(', ')
    notes.push(`Every total here leaves out ${netState.leftOut.length === 1 ? 'a room' : `${netState.leftOut.length} rooms`} that could not be measured, and is short by ${netState.leftOut.length === 1 ? 'its' : 'their'} area: ${named}.`)
  }
  // The library's own note on rooms left out says the same, so it is not said twice.
  notes.push(...figures.notes.filter((note) => !note.startsWith('Left out of every figure')))
  // ARE-20: a total's doubt is its floors', each said with its floor, so the floors' own are not joined in again.
  const withoutWhy = (state: AreaState): AreaState => ({ state: state.state === 'not-proven' && state.leftOut.length + state.notProven.length === 0 ? 'proven' : state.state, leftOut: state.leftOut, notProven: state.notProven })
  const grossInternalState = grossInternal === null ? NOT_LOOKED_AT : doubted(joinStates(floors.map((f) => withoutWhy(f.states.grossInternal))), figures.grossInternal.doubt)
  const grossExternalState = figures.grossExternal.area === null ? NOT_LOOKED_AT : doubted(joinStates(floors.map((f) => withoutWhy(f.states.grossExternal))), figures.grossExternal.doubt)
  const circulationState = joinStates(floors.map((f) => f.states.circulation))
  // LVL-3: a stair the plan states stands in rooms that are already measured, so its flights add
  // no floor: its area is counted once, in the rooms it stands in.
  for (const stair of survey.facts.connections.stairs) {
    notes.push(`Stair ${JSON.stringify(stair.id)} covers ${stair.footprint.toFixed(2)} m² in the rooms it stands in; it adds no floor of its own.`)
  }
  const floorBands = floors.flatMap((f) => (f.headroom ? [f.headroom] : []))
  // WRT-6: the plan's band adds up the rooms its net counts, so no zone's band (CNT-8) and no
  // stair room's counted with the one below (SHT-11) is added twice.
  const sureness = sumSureness(floors.flatMap((f) => f.rooms.filter(inTotals)), net)
  // CNT-4: each flat's figure is the library's; its state is that of the rooms it counts and the
  // rooms of it Grid could not draw.
  const listed = new Map(floors.flatMap((f) => f.rooms).map((room) => [key(room.floor, room.id), room] as const))
  const floorOfRoom = new Map(survey.plan.rooms.map((room) => [room.id, floorOf(room)] as const))
  const flats: FlatAreas[] = figures.flats.map((flat) => {
    const own = [...flat.rooms, ...flat.leftOut].flatMap((id) => {
      const room = listed.get(key(floorOfRoom.get(id) ?? '', id))
      return room === undefined ? [] : [room]
    })
    // ARE-14: the floor the fixtures take from the rooms it counts.
    const fitted = flat.rooms.flatMap((id) => {
      const room = listed.get(key(floorOfRoom.get(id) ?? '', id))
      return room?.fixtures === undefined ? [] : [room.fixtures]
    })
    const fixtures = sum(fitted)
    return { ...flat, state: sumState(own), ...(fitted.length === 0 ? {} : { fixtures, free: Math.max(0, flat.net - fixtures) }) }
  })
  const hasFlats = (survey.plan.flats ?? []).length > 0
  if (hasFlats) {
    const outOfFlats = flats.filter((flat) => flat.leftOut.length > 0)
    if (outOfFlats.length > 0) notes.push(`A flat's area leaves out the rooms of it Grid could not draw: ${outOfFlats.map((flat) => `${JSON.stringify(flat.name)} (${flat.leftOut.map((id) => JSON.stringify(id)).join(', ')})`).join('; ')}.`)
  }
  const fittedFloors = floors.filter((f) => f.fixtures !== undefined)
  const planFixtureFloor = sum(fittedFloors.map((f) => f.fixtures!))
  return {
    floors,
    flats,
    notInFlats: hasFlats ? figures.notInFlats : null,
    notInFlatsToPartyWalls: hasFlats ? figures.notInFlatsToPartyWalls : null,
    buildings: figures.buildings,
    net,
    grossInternal,
    grossExternal: figures.grossExternal.area,
    circulation,
    circulationShare: grossInternal ? circulation / grossInternal : null,
    netToGross: grossInternal ? net / grossInternal : null,
    byUse: Object.fromEntries([...new Set(floors.flatMap((f) => Object.keys(f.byUse)))].map((use) => [use, sum(floors.map((f) => f.byUse[use] ?? 0))])),
    leftOut: figures.leftOut,
    reader: figures.reader,
    grossWhy,
    headroom: floorBands.length === 0 ? null : addBands(floorBands),
    measures: [
      MEASURES.net,
      MEASURES.grossInternal,
      MEASURES.grossExternal,
      ...(floorBands.length === 0 ? [] : [MEASURES.headroom]),
      ...(figures.outdoor === undefined ? [] : [MEASURES.outdoor]),
      // ARE-14: a flat's area to the party walls, on a plan that lists flats, and free floor where fixtures stand.
      ...(hasFlats ? [MEASURES.partyWall] : []),
      ...(taken.size === 0 ? [] : [MEASURES.freeFloor]),
    ],
    rules: [...Object.values(AREA_RULES), ...(hasFlats ? [FLAT_RULE] : []), ...(taken.size === 0 ? [] : [FIXTURE_RULES.free]), ...(floorBands.length === 0 ? [] : [MEASURES.headroom.measures]), ...(sureness === undefined ? [] : [SURENESS_RULE])],
    notes,
    ...(figures.outdoor === undefined ? {} : { outdoor: figures.outdoor }),
    ...(sureness === undefined ? {} : { sureness }),
    ...(fittedFloors.length === 0 ? {} : { fixtures: planFixtureFloor, free: Math.max(0, net - planFixtureFloor) }),
    ...(figures.apart === undefined ? {} : { apart: { ...figures.apart, state: sumState(floors.flatMap((f) => f.rooms.filter((room) => inTotals(room) && figures.apart!.rooms.includes(room.id)))) } }),
    states: {
      net: netState,
      circulation: circulationState,
      grossInternal: grossInternalState,
      grossExternal: grossExternalState,
      circulationShare: grossInternal ? joinStates([circulationState, grossInternalState]) : NOT_LOOKED_AT,
      netToGross: grossInternal ? joinStates([netState, grossInternalState]) : NOT_LOOKED_AT,
    },
  }
}
