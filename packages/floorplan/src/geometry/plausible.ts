/**
 * Sizes far outside a building's, asked about as questions (MSG-15, lab MS-3, AE-6).
 *
 * A plan typed in feet, a height with a digit too many or a wall 2 mm thick still draws, and
 * nothing else in the checks would say a word. These are warnings worded as questions: the size
 * may be meant. The limits are Grid's own (`tolerances.ts`), chosen to catch a slipped digit or
 * unit, and are no rule: a message never says what a building must be.
 *
 * Where the plan says it is a home (a room in it is used as a bedroom or a living room), the
 * limits for a home apply; where it, or a floor of it, says it is a building of large halls
 * (WRT-22: for assembly, sport, industry or a warehouse), those for a hall, the units question
 * among them; otherwise those for any building.
 */

import type { FloorPlan, Opening, PlanIndex, Room, Wall } from './plan'
import { roomWallIds } from './plan'
import { outdoorOnlyWalls } from './outdoor'
import { landscapeWalls } from './landscape'
import { sharedPart, storeyFloorOf } from './through'
import { area } from './vec2'
import { tryRoomPolygon } from './room'
import type { BuildingKind, ToleranceName } from './tolerances'
import { limit } from './tolerances'
import { fixedText } from './rounding'
import type { Said, Value } from '../messages/say'
import { english, joined, name, num, said } from '../messages/say'
import { groupedNum, withSaid } from './issueWords'
import type { Issue } from './validate'

/** The room uses that make a plan a home. */
const HOME_USES: readonly string[] = ['bedroom', 'living']

/** WRT-22: the kinds of building (CNT-5) whose rooms and walls are a hall's: large spans, tall walls. */
const HALL_BUILDINGS: readonly string[] = ['assembly', 'sport', 'industry', 'warehouse']

/** The parts of a plan its kind of building is read from. */
export type KindOfPlan = Pick<FloorPlan, 'rooms' | 'building' | 'floors'>

/**
 * What kind of building the plan says it is: a hall when it, or a floor of it, is said to be for
 * assembly, sport, industry or a warehouse (WRT-22); else a home when a room in it is used as one.
 */
export function buildingKind(plan: KindOfPlan): BuildingKind {
  const said = [plan.building, ...(plan.floors ?? []).map((floor) => floor.building)]
  if (said.some((kind) => kind !== undefined && HALL_BUILDINGS.includes(kind))) return 'hall'
  return plan.rooms.some((room) => room.use !== undefined && HOME_USES.includes(room.use)) ? 'home' : 'any'
}

/** The units an agent most often types as metres, with how many metres one of them is. */
const UNITS = [
  { name: 'feet', metres: 0.3048 },
  { name: 'inches', metres: 25.4 / 1000 },
  { name: 'centimetres', metres: 1 / 100 },
  { name: 'millimetres', metres: 1 / 1000 }
] as const

/** A size as `size` writes it, as a figure: the sentence writes the unit. */
const sized = (value: number): Value => num(size(value))
/** A size with its unit, as one of a list. */
const inMetresOf = (value: number): Said => said('issue.part.metres', { n: sized(value) })

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** A size to two decimals, or to three significant figures below a metre, so 0.0015 stays 0.0015. */
function size(value: number): string {
  if (Math.abs(value) >= 1 || value === 0) return fixedText(value, 2)
  const shown = Number(value.toPrecision(3)).toString()
  return /^-?0\.\d$/.test(shown) ? `${shown}0` : shown
}

/** Square metres with their thousands grouped, as a figure: the sentence writes the unit. */
const squareMetres = (value: number): Value =>
  groupedNum(value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const inHome = (building: BuildingKind): Value =>
  building === 'home' ? said('issue.part.inHome') : building === 'hall' ? said('issue.part.inHall') : ''

function within(value: number, low: ToleranceName, high: ToleranceName, building: BuildingKind = 'any'): boolean {
  return value >= limit(low, building) && value <= limit(high, building)
}

interface Typical {
  readonly height: number | null
  readonly thickness: number | null
  readonly door: number | null
}

/**
 * The units question: the plan's typical sizes are not a building's in metres, and are in one
 * of `UNITS`. Null when the sizes read as metres, or as no unit at all.
 */
function unitsQuestion(typical: Typical, building: BuildingKind): Issue | null {
  const { height, thickness, door } = typical
  if (height === null || thickness === null) return null
  // WRT-22: a hall's walls are taller than a storey's; read as metres up to a hall's height.
  if (within(height, 'typicalHeightLowest', 'typicalHeightHighest', building)) return null
  for (const unit of UNITS) {
    const read = (value: number): number => value * unit.metres
    if (!within(read(height), 'typicalHeightLowest', 'typicalHeightHighest')) continue
    if (!within(read(thickness), 'typicalThicknessLowest', 'typicalThicknessHighest')) continue
    if (door !== null && !within(read(door), 'typicalDoorLowest', 'typicalDoorHighest')) continue
    const inMetres = [inMetresOf(read(height)), inMetresOf(read(thickness))]
    const doors = door === null ? '' : said('issue.plan/units-question.doors', { width: sized(door) })
    if (door !== null) inMetres.push(inMetresOf(read(door)))
    const sentence = said('issue.plan/units-question', {
      unit: said(`issue.part.unit.${unit.name}`),
      height: sized(height),
      thickness: sized(thickness),
      doors,
      list: joined(inMetres, 'join.comma', 'join.and'),
      factor: num(String(unit.metres))
    })
    return withSaid({ entity: 'plan', id: 'plan', code: 'plan/units-question', severity: 'warning', message: english(sentence) }, sentence)
  }
  return null
}

/**
 * CNT-25: `median` of a floor's wall heights less one wall's, from the floor's heights sorted
 * once: the entries left out are `times` entries equal to `value`. The same figure as sorting
 * the rest, without sorting a floor's heights again for each of its walls. A floor with a height
 * that is not a number has `rest`, the other walls' heights, sorted afresh, as before.
 */
function medianLeaving(sorted: readonly number[], value: number, times: number, rest: () => number[]): number | null {
  if (!sorted.every(Number.isFinite)) return median(rest())
  const n = sorted.length - times
  if (n <= 0) return null
  // The first entry not below `value`: the block the wall's own entries are in.
  let k = 0
  let high = sorted.length
  while (k < high) {
    const mid = (k + high) >> 1
    if (sorted[mid]! < value) k = mid + 1
    else high = mid
  }
  const at = (i: number): number => sorted[i < k ? i : i + times]!
  const mid = Math.floor(n / 2)
  return n % 2 === 1 ? at(mid) : (at(mid - 1) + at(mid)) / 2
}

function wallQuestions(wall: Wall, typicalHeight: number | null, building: BuildingKind, storey: number | undefined): Said[] {
  const asked: Said[] = []
  const id = name(wall.id)
  const highest = limit('wallHighest', building)
  // LVL-1: a floor that states its height keeps it, whatever its walls.
  const stands =
    storey === undefined
      ? said('issue.wall/size-question.stands', { height: sized(wall.height) })
      : said('issue.wall/size-question.stated', { height: sized(storey) })
  // Against the other walls first: that names what the wall most likely should be.
  if (typicalHeight !== null && wall.height >= typicalHeight * limit('wallHigherThanTypical')) {
    asked.push(said('issue.wall/size-question.typical', { wall: id, height: sized(wall.height), typical: sized(typicalHeight), stands }))
  } else if (wall.height > highest) {
    const values = { wall: id, height: sized(wall.height), limit: sized(highest), home: inHome(building) }
    asked.push(
      storey === undefined
        ? said('issue.wall/size-question.higher', values)
        : said('issue.wall/size-question.higherStated', { ...values, stands })
    )
  } else if (wall.height < limit('wallLowest', building)) {
    asked.push(said('issue.wall/size-question.lower', { wall: id, height: sized(wall.height), limit: sized(limit('wallLowest', building)) }))
  }
  const thickest = limit('wallThickest', building)
  if (wall.thickness < limit('wallThinnest', building)) {
    asked.push(said('issue.wall/size-question.thinner', { wall: id, thickness: sized(wall.thickness), limit: sized(limit('wallThinnest', building)) }))
  } else if (wall.thickness > thickest) {
    asked.push(said('issue.wall/size-question.thicker', { wall: id, thickness: sized(wall.thickness), limit: sized(thickest), home: inHome(building) }))
  }
  return asked
}

function openingQuestions(opening: Opening, building: BuildingKind, climb: Room | undefined): Said[] {
  const asked: Said[] = []
  const noun = said(`issue.part.Named.${opening.type}`, { id: name(opening.id) })
  const narrowest = limit('openingNarrowest', building)
  if (opening.width < narrowest) {
    const still = opening.type === 'door' ? said('issue.opening/size-question.still') : ''
    asked.push(said('issue.opening/size-question.narrower', { opening: noun, width: sized(opening.width), limit: sized(narrowest), still }))
  }
  const lowest = limit('openingLowest', building)
  if (opening.height < lowest) {
    asked.push(said('issue.opening/size-question.lower', { opening: noun, height: sized(opening.height), limit: sized(lowest) }))
  } else if (climb !== undefined && opening.type !== 'window' && opening.height < limit('stairDoorLowest', building)) {
    // LVL-18: a door onto a stair or a lift lower than a person walks through upright.
    const key = climb.use === 'lift' ? 'issue.opening/size-question.lift' : 'issue.opening/size-question.stair'
    asked.push(said(key, { opening: noun, room: name(climb.id), height: sized(opening.height), limit: sized(limit('stairDoorLowest', building)) }))
  }
  return asked
}

/** LVL-18: the room used as a stair or a lift on each wall, the first one listing it. */
function climbsByWall(plan: FloorPlan, broken: ReadonlySet<string>): Map<string, Room> {
  const climbs = new Map<string, Room>()
  for (const room of plan.rooms) {
    if ((room.use !== 'stair' && room.use !== 'lift') || broken.has(room.id)) continue
    for (const wall of roomWallIds(room)) if (!climbs.has(wall)) climbs.set(wall, room)
  }
  return climbs
}

/**
 * LVL-18: a storey too low to stand in, set by its walls. In a plan of more than one floor, a floor
 * that states no height and no roof of its own stands as high as its tallest wall; when that is
 * lower than `storeyLowest` it is asked about. Fences, parapets round outdoor space and garden
 * walls are no part of the storey, as `tallestDrawnWall` leaves them out. A stated height is asked
 * about in `levels.ts`.
 */
function lowStoreyQuestions(
  plan: FloorPlan,
  index: PlanIndex,
  byFloor: ReadonlyMap<string, readonly Wall[]>,
  building: BuildingKind,
  ask: (entity: Issue['entity'], id: string, code: string, question: Said) => void
): void {
  const floors = plan.floors ?? []
  if (new Set(floors.map((floor) => floor.id)).size < 2) return
  const outdoor = outdoorOnlyWalls(index)
  const landscape = landscapeWalls(plan, index)
  const lowest = limit('storeyLowest', building)
  const seen = new Set<string>()
  for (const floor of floors) {
    if (seen.has(floor.id)) continue
    seen.add(floor.id)
    if (floor.roof !== undefined || (floor.height !== undefined && Number.isFinite(floor.height))) continue
    const walls = (byFloor.get(floor.id) ?? []).filter((wall) => !outdoor.has(wall.id) && !landscape.has(wall.id) && Number.isFinite(wall.height))
    if (walls.length === 0) continue
    const tallest = Math.max(...walls.map((wall) => wall.height))
    if (!(tallest > 0) || tallest >= lowest) continue
    ask('floor', floor.id, 'floor/size-question', said('issue.floor/size-question.walls', { floor: name(floor.id), height: sized(tallest), limit: sized(lowest) }))
  }
}

/**
 * Questions about sizes far outside a building's: first whether the whole plan was typed in
 * another unit, then single walls, openings and rooms. When the units question is asked, the
 * single sizes it explains are not asked about one by one. Warnings only: nothing is skipped.
 */
export function validatePlausibility(
  plan: FloorPlan,
  index: PlanIndex,
  broken: ReadonlySet<string>,
  issues: Issue[]
): void {
  const building = buildingKind(plan)
  const solid = plan.walls.filter((wall) => !wall.virtual && !broken.has(wall.id))
  const doors = plan.openings.filter((o) => o.type === 'door' && !broken.has(o.id))
  const units = unitsQuestion({
    height: median(solid.map((w) => w.height)),
    thickness: median(solid.map((w) => w.thickness)),
    door: median(doors.map((o) => o.width))
  }, building)
  if (units !== null) {
    issues.push(units)
    return
  }

  const ask = (entity: Issue['entity'], id: string, code: string, question: Said): void => {
    const sentence = said('issue.part.both', { first: question, then: said('issue.part.notARule') })
    issues.push(withSaid({ entity, id, code, severity: 'warning', message: english(sentence) }, sentence))
  }

  // LVL-5: a wall through floors stands as a wall of the floor it rises through.
  const floorOfWall = (wall: Wall): string => storeyFloorOf(plan, wall)
  const byFloor = new Map<string, Wall[]>()
  for (const wall of solid) {
    const floor = floorOfWall(wall)
    const list = byFloor.get(floor)
    if (list) list.push(wall)
    else byFloor.set(floor, [wall])
  }
  // The first entry for a floor is the one used, as in `planFloors`.
  const storeys = new Map<string, number | undefined>()
  for (const floor of plan.floors ?? []) {
    if (storeys.has(floor.id)) continue
    storeys.set(floor.id, floor.height !== undefined && Number.isFinite(floor.height) ? floor.height : undefined)
  }
  // Each floor's heights sorted once, and how many times each wall is listed on it.
  const heightsOf = new Map<string, { list: readonly Wall[]; sorted: number[]; times: Map<Wall, number> }>()
  for (const [floor, list] of byFloor) {
    const times = new Map<Wall, number>()
    for (const w of list) times.set(w, (times.get(w) ?? 0) + 1)
    heightsOf.set(floor, { list, sorted: list.map((w) => w.height).sort((a, b) => a - b), times })
  }
  for (const wall of solid) {
    // A part of a wall through floors, in a floor's slice, runs through its slab by design.
    if (sharedPart(wall) !== null) continue
    const heights = heightsOf.get(floorOfWall(wall))!
    const times = heights.times.get(wall)!
    // The typical height is that of the floor's other walls, when it has three or more.
    const rest = (): number[] => heights.list.filter((w) => w !== wall).map((w) => w.height)
    const typicalHeight = heights.list.length - times >= 3 ? medianLeaving(heights.sorted, wall.height, times, rest) : null
    const storey = storeys.get(floorOfWall(wall))
    for (const message of wallQuestions(wall, typicalHeight, building, storey)) ask('wall', wall.id, 'wall/size-question', message)
  }

  lowStoreyQuestions(plan, index, byFloor, building, ask)

  const climbs = climbsByWall(plan, broken)
  for (const opening of plan.openings) {
    if (broken.has(opening.id)) continue
    for (const message of openingQuestions(opening, building, climbs.get(opening.wall))) ask('opening', opening.id, 'opening/size-question', message)
  }

  const largest = limit('roomLargest', building)
  for (const room of plan.rooms) {
    if (broken.has(room.id)) continue
    const outline = tryRoomPolygon(room, index)
    if (outline === null) continue
    const measured = area(outline)
    if (!(measured > largest)) continue
    ask(
      'room',
      room.id,
      'room/size-question',
      said('issue.room/size-question', { room: name(room.id), area: squareMetres(measured), limit: squareMetres(largest), home: inHome(building) })
    )
  }
}
