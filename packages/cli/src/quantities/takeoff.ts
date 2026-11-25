/**
 * A builder's take-off: metres of wall by kind, per room the floor, the ceiling, the skirting and
 * the wall face to plaster, and per floor the slab and the roof (LVL-4), each with the rule it is
 * measured by.
 *
 * Every figure comes from the plan's own walls and openings. The plan holds no finishes, so a
 * ceiling is the floor area under it, at the room's height or its lowered zones', and nothing is
 * taken off for a kitchen unit or a bath.
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
  type FloorEnvelope,
  type FloorPlan,
  type RoofShape,
  type SlabOpeningKind,
  type Wall,
} from '@ongrid/floorplan/geometry'
import type { Survey, SurveyRoom } from './survey'
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
  readonly slab: { readonly kind: 'base' | 'floor'; readonly area: number; readonly thickness: number; readonly openings: readonly SlabOpeningLine[] } | null
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

export interface Takeoff {
  readonly walls: readonly WallRun[]
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
  const { stated, lowered } = ceiling(room)
  return {
    id: room.facts.id,
    name: room.facts.name,
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
    ceilingHeight: stated ?? height,
    lowered,
  }
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
export function envelopeTakeoff(survey: Survey, floors?: readonly string[]): EnvelopeTakeoff {
  const names = new Map(survey.facts.floors.map((f) => [f.id, f.name] as const))
  const stated = new Map(planFloors(survey.plan).map((f) => [f.id, f.slab !== undefined && Number.isFinite(f.slab)] as const))
  const envelope = planEnvelope(survey.plan, floors === undefined ? {} : { floors })
  const lines: EnvelopeLine[] = envelope.floors.map((env) => ({
    floor: env.floor,
    floorName: names.get(env.floor) ?? env.floor,
    outline: env.outlineArea,
    slab:
      env.slab === null
        ? null
        : { kind: env.slab.kind, area: env.slab.area, thickness: env.slab.thickness, openings: env.slab.openings.map((o) => ({ kind: o.kind, via: o.via, area: o.area })) },
    roof:
      env.roof === null
        ? null
        : { area: env.roof.area, parapet: env.roof.parapet?.height ?? null, shape: env.roof.shape, pitch: env.roof.pitch, slopeArea: env.roof.slopeArea, rooflights: env.roof.rooflights.length },
    state: 'assumed',
    assumed: assumptions(env, stated.get(env.floor) ?? false),
    why: env.why,
  }))
  return { floors: lines, slabs: envelope.slabArea, roof: envelope.roofArea, state: 'assumed' }
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
  const walls = survey.plan.walls.filter((wall) => wall.virtual !== true && wallFloor.has(wall.id) && onFloor(wallFloor.get(wall.id)!))
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
  const list = survey.rooms
    .filter((room) => onFloor(room.facts.floor) && (rooms === undefined ? room.facts.zoneOf === undefined : rooms.includes(room.facts.id)))
    .map((room) => roomTakeoff(room, ceilingOf, survey.plan))
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
    envelope: envelopeTakeoff(survey, floors),
    rules: [...Object.values(TAKEOFF_RULES), ...(columns.length === 0 ? [] : [columnRule()]), ...(bays.length === 0 && ramps.length === 0 ? [] : [parkingRule()])],
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
