/**
 * A builder's take-off: metres of wall by kind, per room the floor, the ceiling, the skirting and
 * the wall face to plaster, and per floor the slab and the roof (LVL-4), each with the rule it is
 * measured by.
 *
 * Every figure comes from the plan's own walls and openings. A ceiling is the floor area under it,
 * at the room's height or its lowered zones', and nothing is taken off for a kitchen unit or a bath.
 * A room that states no skirting (CNT-51) is taken off with none.
 *
 * The plan states no slab and no roof: Grid works them out from each floor's outline
 * (`planEnvelope`). So every slab and roof line is marked assumed, with what was assumed (lab
 * AC-6): taking the top floor's outline as the roof missed 47% of the odd house's.
 */
import {
  SLAB_THICKNESS,
  floorElevations,
  floorOf,
  indexPlan,
  planEnvelope,
  planFloors,
  planForFloor,
  phaseReading,
  roomCeiling,
  curveFault,
  wallAxis,
  wallLength,
  faceUnderTop,
  topBetween,
  wallTopProfile,
  columnArea,
  columnDepth,
  columnRise,
  soundColumns,
  planBayCounts,
  planRamps,
  landscapeWalls,
  planEarth,
  type FloorEnvelope,
  type PlanEarth,
  type FloorPlan,
  type RoofShape,
  type SlabOpeningKind,
  type Wall,
} from '@ongrid/floorplan/geometry'
import { roomCalled, type Survey, type SurveyRoom } from './survey'
import { english, said } from '@ongrid/floorplan/messages'

export const TAKEOFF_RULES = {
  walls: 'Wall length is the length of each solid wall along its centre line, each wall counted once; gross is with openings, net takes off the width of every opening in it.',
  floor: 'Floor and ceiling area is the room between its wall faces (the net area); a void, open to the floor below, has none, nor skirting, and its edge with no wall is given as a guard length. A ceiling is the floor below it, at the room\'s height, its lowered zones at theirs.',
  skirting: 'Skirting is the room\'s inside perimeter less the width of every door and doorless opening on it.',
  plaster: 'Wall face is each inside side of the room times the height of the wall it is on, less every door, window and opening in it (width times height). Dividing lines are not plastered.',
  envelope: 'Slab and roof area is on plan, from each floor\'s outline to the outside face of its walls: a slab is the outline less its openings over stairs, lifts and voids; a roof is the outline less the floors on the level above, so every part with nothing above it is roofed.',
} as const

export interface WallRun {
  /** CNT-26: `garden` for the garden and boundary walls, taken off apart whatever kind they state. */
  readonly kind: Wall['kind'] | 'garden'
  readonly count: number
  /** Centre-line metres. */
  readonly gross: number
  readonly net: number
}

export interface RoomTakeoff {
  readonly id: string
  readonly name: string
  readonly floor: string
  readonly floorArea: number
  readonly ceiling: number
  readonly perimeter: number
  readonly skirting: number
  readonly wallFace: number
  /** CNT-34: the part of the wall face above the lowest the roof leaves the walls' tops: the gable part, inside `wallFace`. */
  readonly gable: number
  readonly openingsOff: number
  /** ARE-16: the room is a void (LVL-4): no floor, ceiling or skirting; its wall faces are still taken off. */
  readonly void?: true
  /** ARE-16, only on a void: the length of its edge no solid wall closes, and of every door and doorless opening in its walls, which needs a guard. */
  readonly guard?: number
  /** The usual height of the room's walls. */
  readonly height: number | null
  /** LVL-4: the ceiling's height above the floor: the room's stated height, else its walls' usual one. */
  readonly ceilingHeight: number | null
  /** LVL-4: the zones of its ceiling lowered under the rest, each with its height and area. */
  readonly lowered: readonly { readonly name: string; readonly height: number; readonly area: number }[]
  /** ARE-77: the inside face of its walls with earth behind them, below the ground: taken out of `wallFace`. Left out when none. */
  readonly earthFace?: number
}

/** What a slab is open over, in a line. */
export interface SlabOpeningLine {
  readonly kind: SlabOpeningKind
  readonly via: string
  readonly area: number
}

/** LVL-4: one floor's slab and roof, worked out from its outline, never stated by the plan. */
export interface EnvelopeLine {
  readonly floor: string
  readonly floorName: string
  /** The floor's outline, on plan, to the outside face of its walls. */
  readonly outline: number | null
  /** The slab it stands on, as built: less its openings. Null when the floor has no outline. */
  readonly slab: {
    readonly kind: 'base' | 'floor'
    readonly area: number
    readonly thickness: number
    readonly openings: readonly SlabOpeningLine[]
    /** ARE-77: the part of it that rests on the ground, with no floor under it; 0 when none. */
    readonly onGround: number
  } | null
  /**
   * The roof over every part of it with nothing above, and its parapet's height. Null when it has
   * none. LVL-6: the shape the floor states (null: flat, as Grid lays it), its pitch in degrees, its
   * area on the slope and how many rooflights it holds.
   */
  readonly roof: {
    readonly area: number
    readonly parapet: number | null
    readonly shape: RoofShape | null
    readonly pitch: number
    readonly slopeArea: number
    readonly rooflights: number
  } | null
  /** ARE-77: the slab over the part of it the ground covers, with the soil over it: never its roof. Left out when none. */
  readonly buried?: { readonly area: number; readonly cover: number }
  /** Always: the plan states no slab and no roof, so Grid's are an assumption. */
  readonly state: 'assumed'
  /** What Grid assumed, in words. */
  readonly assumed: readonly string[]
  /** Why there is no slab or roof, when there is none. */
  readonly why: string | null
}

export interface EnvelopeTakeoff {
  readonly floors: readonly EnvelopeLine[]
  /** Every slab, as built; null when a floor's outline is not known. */
  readonly slabs: number | null
  /** Every roof, on plan; null when a floor's outline is not known. */
  readonly roof: number | null
  readonly state: 'assumed'
}

/** CNT-16: the columns of one shape and size, each counted once, on its own floor. */
export interface ColumnRun {
  readonly shape: 'square' | 'round'
  /** A square column's side along its own x, a round one's diameter. */
  readonly width: number
  /** A square column's other side; null for a round one. */
  readonly depth: number | null
  readonly count: number
  /** Metres of column, foot to top, each whole however many floors it rises through. */
  readonly length: number
  /** Cubic metres. */
  readonly volume: number
}

/** CNT-19: one floor's parking bays, counted. */
export interface BayCount {
  readonly floor: string
  readonly floorName: string
  /** Every bay drawn on the floor, numbered or not. */
  readonly count: number
  /** The numbers its bays state, each once, in number order. */
  readonly numbers: readonly string[]
  readonly unnumbered: number
}

/** CNT-19: a ramp's figures: the two levels it joins in metres, its rise, its length and its slope. */
export interface RampFigures {
  readonly id: string
  readonly name: string
  readonly from: string
  readonly to: string
  readonly lower: { readonly floor: string; readonly level: number }
  readonly upper: { readonly floor: string; readonly level: number }
  readonly width: number
  /** Metres up, from the lower level to the upper. */
  readonly rise: number
  /** Metres along its middle line, on plan. */
  readonly length: number
  /** Percent: metres of rise per 100 metres along it, from the levels and the run. */
  readonly slope: number
  /** The same slope as "1 in n". */
  readonly oneIn: number
  /** The slope the plan states, in percent, or null. */
  readonly statedSlope: number | null
}

/** ARE-77: the retaining walls that hold the same height of earth, on the floors asked for. */
export interface RetainingRun {
  /** The most earth they hold, from their floor's level, in metres. */
  readonly retained: number
  readonly count: number
  /** Along the outline, in metres. */
  readonly length: number
  /** Their outer face below the ground, in m². */
  readonly area: number
  readonly floors: readonly string[]
}

/** ARE-77: what of the building has earth against it, and the dig. */
export interface EarthTakeoff {
  readonly retaining: readonly RetainingRun[]
  readonly buried: readonly { readonly floor: string; readonly floorName: string; readonly area: number; readonly cover: number }[]
  /** Every slab resting on the ground, on any floor. */
  readonly bearing: readonly { readonly floor: string; readonly floorName: string; readonly area: number; readonly base: boolean }[]
  readonly dig: readonly { readonly floor: string; readonly floorName: string; readonly area: number; readonly depth: number; readonly volume: number }[]
  /** In m³. */
  readonly excavation: number
  readonly state: 'assumed'
}

export interface Takeoff {
  readonly walls: readonly WallRun[]
  /** ARE-77: retaining walls, buried and ground-bearing slabs and the dig. Left out on a plan with nothing in the earth. */
  readonly earth?: EarthTakeoff
  /** CNT-16: the columns, by shape and size. Left out on a plan with none. */
  readonly columns?: readonly ColumnRun[]
  /** CNT-19: the parking bays, counted per floor. Left out on a plan with none. */
  readonly bays?: readonly BayCount[]
  /** CNT-19: the ramps, each with its levels and its slope. Left out on a plan with none. */
  readonly ramps?: readonly RampFigures[]
  readonly rooms: readonly RoomTakeoff[]
  readonly totals: { readonly floorArea: number; readonly ceiling: number; readonly skirting: number; readonly wallFace: number; readonly guard?: number }
  /** LVL-4: the slabs and the roof, floor by floor. */
  readonly envelope: EnvelopeTakeoff
  readonly rules: readonly string[]
}

// CNT-6: a separating wall (a party wall, or one to the common parts) is taken off as its own kind.
const KINDS: readonly Wall['kind'][] = ['exterior', 'separating', 'interior', 'partition']

/**
 * CNT-34: the face of `wall` between `from` and `to` metres along its centre line, under the top the
 * floor's roof leaves it (a rectangle at its height where the roof cuts nothing), and the gable part
 * of it, the face above the lowest the top stands over that stretch. A curved wall is taken as its
 * stated height.
 */
export function wallFaceCut(plan: FloorPlan, wall: Wall, from: number, to: number): { readonly face: number; readonly gable: number } {
  const span = Math.max(0, to - from)
  const top = wallTopProfile(plan, wall)
  if (top === null) return { face: span * wall.height, gable: 0 }
  const face = faceUnderTop(top, from, to)
  return { face, gable: Math.max(0, face - span * topBetween(top, from, to).low) }
}

/** The same for a length of the wall that is not its axis (joined at corners): the mean height over the axis, taken on that length. */
export function wallFaceOver(plan: FloorPlan, wall: Wall, length: number): { readonly face: number; readonly gable: number } {
  if (wall.arc !== undefined || wall.virtual === true) return { face: length * wall.height, gable: 0 }
  const axis = wallAxis(wall).length
  if (!(axis > 0)) return { face: length * wall.height, gable: 0 }
  const whole = wallFaceCut(plan, wall, 0, axis)
  return { face: (whole.face / axis) * length, gable: (whole.gable / axis) * length }
}

/** One room's take-off; `ceiling` gives its stated ceiling height and lowered zones (none stated when left out). */
export function roomTakeoff(
  room: SurveyRoom,
  ceiling: (room: SurveyRoom) => Pick<RoomTakeoff, 'lowered'> & { readonly stated: number | null } = () => ({ stated: null, lowered: [] }),
  plan?: FloorPlan
): RoomTakeoff {
  const perimeter = room.edges.reduce((sum, edge) => sum + edge.length, 0)
  let face = 0
  let gable = 0
  const heights: number[] = []
  for (const edge of room.edges) {
    if (edge.wall === null || edge.wall.virtual === true) continue
    // LVL-6: a wall the floor's roof cuts has its face under the top the roof leaves it.
    const top = plan === undefined ? null : wallTopProfile(plan, edge.wall)
    if (top === null || plan === undefined) {
      face += edge.length * edge.wall.height
      heights.push(edge.wall.height)
      continue
    }
    const axis = wallAxis(edge.wall)
    const along = (p: { x: number; y: number }): number => (p.x - axis.start.x) * axis.dir.x + (p.y - axis.start.y) * axis.dir.y
    const cut = wallFaceCut(plan, edge.wall, Math.min(along(edge.from), along(edge.to)), Math.max(along(edge.from), along(edge.to)))
    face += cut.face
    gable += cut.gable
    heights.push(edge.length > 0 ? cut.face / edge.length : edge.wall.height)
  }
  // Openings in this room's sides: in a dividing line there is nothing to take off.
  let openingsOff = 0
  let passages = 0
  const virtual = new Set(room.edges.filter((edge) => edge.wall?.virtual === true).map((edge) => edge.wall!.id))
  for (const opening of room.openings) {
    if (virtual.has(opening.wall)) continue
    const wall = room.edges.find((edge) => edge.wall?.id === opening.wall)?.wall
    const top = Math.min(opening.sill + opening.height, wall?.height ?? Infinity)
    openingsOff += opening.width * Math.max(0, top - opening.sill)
    if (opening.type !== 'window') passages += opening.width
  }
  // ARE-16: a void has no floor, so no floor, ceiling or skirting; its open edge is a guard length.
  const isVoid = room.facts.void === true
  const area = isVoid ? 0 : (room.facts.shape?.area ?? 0)
  const guard = isVoid ? room.edges.reduce((sum, edge) => sum + (edge.wall === null || edge.wall.virtual === true ? edge.length : 0), 0) + passages : 0
  heights.sort((a, b) => a - b)
  const height = heights.length > 0 ? heights[Math.floor(heights.length / 2)]! : null
  const { stated, lowered } = isVoid ? { stated: null, lowered: [] } : ceiling(room)
  return {
    id: room.facts.id,
    name: roomCalled(room.facts),
    floor: room.facts.floor,
    floorArea: area,
    ceiling: area,
    perimeter,
    skirting: isVoid ? 0 : Math.max(0, perimeter - passages),
    wallFace: Math.max(0, face - openingsOff),
    gable,
    openingsOff,
    ...(isVoid ? { void: true as const, guard } : {}),
    height,
    ceilingHeight: isVoid ? null : (stated ?? height),
    lowered,
  }
}

/** CNT-51 (C24): one part of a room's skirting: the room's own rest or a zone's part, its finish, or none stated as none. */
export interface SkirtingPart {
  /** The zone this part is, or null for the room itself. */
  readonly zone: string | null
  readonly finish: string | null
  /** The room or zone states no skirting: nothing is measured for it. */
  readonly none: boolean
  readonly quantity: number
}

/**
 * CNT-51 (C24): a room's skirting as its finishes and its zones' say: each zone that names a
 * skirting or states none takes its part of the room's, and the rest is the room's own, none
 * where the room states none. `whole` is the room's skirting as measured.
 */
export function skirtingParts(survey: Survey, room: SurveyRoom, whole: number): SkirtingPart[] {
  const stated = (id: string): string | false | undefined => survey.plan.rooms.find((r) => r.id === id)?.finishes?.skirting
  const parts: SkirtingPart[] = []
  let left = whole
  for (const zone of survey.rooms) {
    if (zone.facts.zoneOf !== room.facts.id || zone.facts.floor !== room.facts.floor || zone.facts.shape === null || zone.polygon.length < 3) continue
    const skirting = stated(zone.facts.id)
    if (skirting === undefined) continue
    const quantity = Math.min(left, roomTakeoff(zone).skirting)
    left -= quantity
    parts.push({ zone: zone.facts.id, finish: skirting === false ? null : skirting, none: skirting === false, quantity: skirting === false ? 0 : quantity })
  }
  const own = stated(room.facts.id)
  parts.push({ zone: null, finish: typeof own === 'string' ? own : null, none: own === false, quantity: own === false ? 0 : Math.max(0, left) })
  return parts
}

/** What Grid takes for a floor's slab and roof that the plan does not state. */
function assumptions(env: FloorEnvelope, thicknessStated: boolean): string[] {
  const out: string[] = []
  if (env.slab !== null) {
    out.push('the slab is the floor\'s outline, to the outside face of its walls: the plan states no slab')
    if (!thicknessStated) out.push(`the slab is ${SLAB_THICKNESS.toFixed(2)} m thick: the floor states no slab thickness`)
    if (env.slab.openings.some((o) => o.kind === 'stair-room')) out.push('the opening over a stair room is the floor it shares with the stair room below: the plan states no stair there')
  }
  // CNT-6 (lab AC-7): no roof, because the plan states more of the building above the floor.
  if (env.above !== undefined) out.push(english(said('takeoff.assumed.noRoofAbove', { above: said(`takeoff.assumed.above.${env.above}`) })))
  if (env.roof !== null && env.roof.shape === null) out.push('the roof is flat, over every part with nothing above, with no overhang and no fall: the plan states no roof')
  // LVL-6: the floor states its roof's shape and slope, but not where it ends or what it is made of.
  if (env.roof !== null && env.roof.shape !== null) out.push(`the roof is the ${env.roof.shape} roof the floor states, over every part with nothing above, with no overhang: the plan states its shape and slope, not its build-up`)
  return out
}

/** LVL-4: the slabs and roofs of the floors given, from their outlines. */
export function envelopeTakeoff(survey: Survey, floors?: readonly string[], earth: PlanEarth = planEarth(survey.plan, floors)): EnvelopeTakeoff {
  const names = new Map(survey.facts.floors.map((f) => [f.id, f.name] as const))
  // ARE-55: a fit-out is fitted in a shell whose slab and roof are the base's, not the work's.
  if (survey.plan.base !== undefined) {
    const own = planFloors(survey.plan).filter((f) => floors === undefined || floors.includes(f.id))
    const lines: EnvelopeLine[] = own.map((f) => ({
      floor: f.id,
      floorName: names.get(f.id) ?? f.id,
      outline: null,
      slab: null,
      roof: null,
      state: 'assumed',
      assumed: [],
      why: english(said('takeoff.fitOut.noSlabRoof')),
    }))
    return { floors: lines, slabs: null, roof: null, state: 'assumed' }
  }
  const stated = new Map(planFloors(survey.plan).map((f) => [f.id, f.slab !== undefined && Number.isFinite(f.slab)] as const))
  const envelope = planEnvelope(survey.plan, floors === undefined ? {} : { floors })
  // ARE-77: a roof the ground covers is a buried slab, never a roof.
  const buriedRoof = new Set(earth.buried.filter((b) => b.from === 'roof').map((b) => b.floor))
  const lines: EnvelopeLine[] = envelope.floors.map((env) => {
    const buried = earth.buried.filter((b) => b.floor === env.floor)
    const area = buried.reduce((sum, b) => sum + b.area, 0)
    return {
      floor: env.floor,
      floorName: names.get(env.floor) ?? env.floor,
      outline: env.outlineArea,
      slab:
        env.slab === null
          ? null
          : {
              kind: env.slab.kind,
              area: env.slab.area,
              thickness: env.slab.thickness,
              openings: env.slab.openings.map((o) => ({ kind: o.kind, via: o.via, area: o.area })),
              onGround: earth.bearing.find((b) => b.floor === env.floor)?.area ?? 0,
            },
      roof:
        env.roof === null || buriedRoof.has(env.floor)
          ? null
          : { area: env.roof.area, parapet: env.roof.parapet?.height ?? null, shape: env.roof.shape, pitch: env.roof.pitch, slopeArea: env.roof.slopeArea, rooflights: env.roof.rooflights.length },
      ...(buried.length === 0 ? {} : { buried: { area, cover: area > 0 ? buried.reduce((sum, b) => sum + b.cover * b.area, 0) / area : 0 } }),
      state: 'assumed',
      assumed: assumptions(env, stated.get(env.floor) ?? false).filter((line) => !buriedRoof.has(env.floor) || !line.startsWith('the roof ')),
      why: env.why,
    }
  })
  const roof = envelope.roofArea === null ? null : envelope.roofArea - envelope.floors.reduce((sum, env) => sum + (buriedRoof.has(env.floor) ? (env.roof?.area ?? 0) : 0), 0)
  return { floors: lines, slabs: envelope.slabArea, roof, state: 'assumed' }
}

/** Each room's stated ceiling height and lowered zones, by floor and room id. */
function ceilings(survey: Survey): (room: SurveyRoom) => Pick<RoomTakeoff, 'lowered'> & { readonly stated: number | null } {
  const storeys = floorElevations(survey.plan).floors
  const indexes = new Map<string, ReturnType<typeof indexPlan>>()
  return (room) => {
    const floor = room.facts.floor
    const plan = survey.plan.rooms.find((r) => r.id === room.facts.id && floorOf(r) === floor) ?? survey.plan.rooms.find((r) => r.id === room.facts.id)
    const stated = plan?.height !== undefined && Number.isFinite(plan.height) ? plan.height : null
    if (plan?.ceiling === undefined) return { stated, lowered: [] }
    let index = indexes.get(floor)
    if (index === undefined) {
      index = indexPlan(planForFloor(survey.plan, floor))
      indexes.set(floor, index)
    }
    const pieces = roomCeiling(plan, index, storeys.get(floor)?.clearHeight ?? 0) ?? []
    return { stated, lowered: pieces.filter((p) => p.zone !== null).map((p) => ({ name: p.zone!, height: p.height, area: p.area })) }
  }
}

export function planTakeoff(survey: Survey, floors?: readonly string[], rooms?: readonly string[]): Takeoff {
  const onFloor = (floor: string): boolean => floors === undefined || floors.includes(floor)
  const wallFloor = new Map(survey.facts.floors.flatMap((f) => f.walls.map((w) => [w.id, f.id] as const)))
  // ARE-55: a fit-out takes off its own walls: the base's (read as existing) are the shell, not the work.
  const reading = survey.plan.base === undefined ? null : phaseReading(survey.plan)
  const shellWall = (wall: Wall): boolean => reading !== null && reading.wall(wall) === 'existing'
  const walls = survey.plan.walls.filter((wall) => wall.virtual !== true && !shellWall(wall) && wallFloor.has(wall.id) && onFloor(wallFloor.get(wall.id)!))
  const openingWidth = new Map<string, number>()
  for (const o of survey.plan.openings) openingWidth.set(o.wall, (openingWidth.get(o.wall) ?? 0) + o.width)
  // CNT-26: a garden or boundary wall, standing apart from the building, is taken off on its own run.
  const landscape = landscapeWalls(survey.plan)
  const runs: WallRun[] = [...KINDS, 'garden' as const].map((kind) => {
    const of = walls.filter((wall) => (landscape.has(wall.id) ? kind === 'garden' : wall.kind === kind))
    // Along a curved wall's curve (CNT-18).
    const lengthOf = (wall: Wall): number => (wall.arc !== undefined ? (curveFault(wall) === null ? wallLength(wall) : 0) : wallAxis(wall).length)
    const gross = of.reduce((sum, wall) => sum + lengthOf(wall), 0)
    const net = of.reduce((sum, wall) => sum + Math.max(0, lengthOf(wall) - (openingWidth.get(wall.id) ?? 0)), 0)
    return { kind, count: of.length, gross, net }
  }).filter((run) => run.count > 0)
  // A zone's floor, walls and ceiling are its room's (CNT-8): taken off once, unless asked for by name.
  const ceilingOf = ceilings(survey)
  const earth = planEarth(survey.plan, floors)
  const list = survey.rooms
    .filter((room) => onFloor(room.facts.floor) && (rooms === undefined ? room.facts.zoneOf === undefined : rooms.includes(room.facts.id)))
    .map((room) => {
      const t = roomTakeoff(room, ceilingOf, survey.plan)
      // CNT-51: skirting where the room, or a zone of it, states none is measured as none.
      const skirting = room.facts.zoneOf === undefined ? skirtingParts(survey, room, t.skirting).reduce((sum, part) => sum + part.quantity, 0) : survey.plan.rooms.find((r) => r.id === room.facts.id)?.finishes?.skirting === false ? 0 : t.skirting
      const withSkirting = skirting === t.skirting ? t : { ...t, skirting }
      // ARE-77: the inside face of a wall with earth behind it is not plaster.
      const earthFace = Math.min(t.wallFace, roomEarthFace(earth, room))
      return earthFace > 0 ? { ...withSkirting, wallFace: t.wallFace - earthFace, earthFace } : withSkirting
    })
  const total = (key: 'floorArea' | 'ceiling' | 'skirting' | 'wallFace'): number => list.reduce((sum, room) => sum + room[key], 0)
  const columns = columnRuns(survey.plan, onFloor)
  const { bays, ramps } = parkingFigures(survey.plan, onFloor)
  return {
    walls: runs,
    ...(columns.length === 0 ? {} : { columns }),
    ...(bays.length === 0 ? {} : { bays }),
    ...(ramps.length === 0 ? {} : { ramps }),
    rooms: list,
    totals: { floorArea: total('floorArea'), ceiling: total('ceiling'), skirting: total('skirting'), wallFace: total('wallFace'), ...(list.some((room) => room.void === true) ? { guard: list.reduce((sum, room) => sum + (room.guard ?? 0), 0) } : {}) },
    envelope: envelopeTakeoff(survey, floors, earth),
    ...(earth.inEarth ? { earth: earthTakeoff(survey, earth) } : {}),
    rules: [...Object.values(TAKEOFF_RULES), ...(earth.inEarth ? [earthRule()] : []), ...(columns.length === 0 ? [] : [columnRule()]), ...(bays.length === 0 && ramps.length === 0 ? [] : [parkingRule()])],
  }
}

/** ARE-77: how the earth against the building is measured, in Grid's words. */
export const earthRule = (): string => english(said('takeoff.rule.earth'))

/** ARE-77: the inside face of a room's walls with earth behind them: each side on a retaining wall, by the share of that wall's face below the ground. */
export function roomEarthFace(earth: PlanEarth, room: SurveyRoom): number {
  if (earth.retaining.length === 0) return 0
  let face = 0
  for (const edge of room.edges) {
    if (edge.wall === null || edge.wall.virtual === true) continue
    const held = earth.retaining.find((r) => r.wall === edge.wall!.id && r.floor === room.facts.floor)
    if (held !== undefined) face += edge.length * edge.wall.height * held.share
  }
  return face
}

/** ARE-77: the retaining walls by the height of earth they hold, the highest first. */
export function retainingRuns(earth: PlanEarth): RetainingRun[] {
  const runs = new Map<string, { retained: number; count: number; length: number; area: number; floors: string[] }>()
  for (const face of earth.retaining) {
    const key = face.retained.toFixed(3)
    const run = runs.get(key) ?? { retained: Number(key), count: 0, length: 0, area: 0, floors: [] }
    run.count++
    run.length += face.length
    run.area += face.area
    if (!run.floors.includes(face.floor)) run.floors.push(face.floor)
    runs.set(key, run)
  }
  return [...runs.values()].sort((a, b) => b.retained - a.retained)
}

function earthTakeoff(survey: Survey, earth: PlanEarth): EarthTakeoff {
  const names = new Map(survey.facts.floors.map((f) => [f.id, f.name] as const))
  const named = (floor: string): string => names.get(floor) ?? floor
  return {
    retaining: retainingRuns(earth),
    buried: earth.buried.map((b) => ({ floor: b.floor, floorName: named(b.floor), area: b.area, cover: b.cover })),
    bearing: earth.bearing.map((b) => ({ floor: b.floor, floorName: named(b.floor), area: b.area, base: b.base })),
    dig: earth.dig.map((d) => ({ floor: d.floor, floorName: named(d.floor), area: d.area, depth: d.depth, volume: d.volume })),
    excavation: earth.excavation,
    state: 'assumed',
  }
}

/** CNT-19: how the bays are counted and the ramps measured, in Grid's words. */
export const parkingRule = (): string => english(said('takeoff.rule.parking'))

/** CNT-19: the plan's bays counted on the floors asked for, and the ramps that start or end on one of them. */
export function parkingFigures(plan: FloorPlan, onFloor: (floor: string) => boolean = () => true): { bays: BayCount[]; ramps: RampFigures[] } {
  const names = new Map(planFloors(plan).map((floor) => [floor.id, floor.name ?? floor.id]))
  const bays = planBayCounts(plan)
    .filter((count) => onFloor(count.floor))
    .map((count) => ({ floor: count.floor, floorName: names.get(count.floor) ?? count.floor, count: count.count, numbers: count.numbers, unnumbered: count.unnumbered }))
  const ramps = planRamps(plan)
    .ramps.filter((ramp) => onFloor(ramp.lower.floor) || onFloor(ramp.upper.floor))
    .map((ramp) => ({
      id: ramp.id,
      name: ramp.name,
      from: ramp.from,
      to: ramp.to,
      lower: { floor: ramp.lower.floor, level: ramp.lower.level },
      upper: { floor: ramp.upper.floor, level: ramp.upper.level },
      width: ramp.width,
      rise: ramp.rise,
      length: ramp.length,
      slope: ramp.slope,
      oneIn: ramp.oneIn,
      statedSlope: ramp.statedSlope,
    }))
  return { bays, ramps }
}

/** CNT-16: how the columns are taken off, in Grid's words. */
export const columnRule = (): string => english(said('takeoff.rule.columns'))

/** CNT-16: the plan's columns on the floors asked for, by shape and size, each counted on its own floor. */
function columnRuns(plan: FloorPlan, onFloor: (floor: string) => boolean): ColumnRun[] {
  const runs = new Map<string, { shape: 'square' | 'round'; width: number; depth: number | null; count: number; length: number; volume: number }>()
  for (const column of soundColumns(plan)) {
    if (!onFloor(floorOf(column))) continue
    const depth = column.shape === 'round' ? null : columnDepth(column)
    const key = `${column.shape}|${column.width}|${depth}`
    const rise = columnRise(plan, column)
    const run = runs.get(key) ?? { shape: column.shape, width: column.width, depth, count: 0, length: 0, volume: 0 }
    run.count++
    run.length += rise
    run.volume += columnArea(column) * rise
    runs.set(key, run)
  }
  return [...runs.values()]
}
