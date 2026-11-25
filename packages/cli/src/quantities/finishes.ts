/**
 * CNT-15 (C24): the quantities of the plan's named wall types and of the rooms' finishes, from
 * the same take-off as everything else (`roomTakeoff`), so a finishes plan, a flooring order and
 * an estimate come from the same facts.
 *
 * A room's finish covers the whole room, less each of its zones (CNT-8) that names a finish of its
 * own for that surface: the zone's part of the room is the zone's finish. So a kitchen kept as a
 * zone after a knock-through keeps its tiled floor (lab AC-4). A surface no room or zone names a
 * finish for is listed as not stated, never given one.
 *
 * Pure: a survey in, plain data out.
 */
import { FINISH_SURFACES, curveFault, roomFinishes, wallAxis, wallLength, wallTypeOf, type FinishSurface, type Wall } from '@ongrid/floorplan/geometry'
import { roomCalled, type Survey, type SurveyRoom } from './survey'
import { roomTakeoff, wallFaceCut, type RoomTakeoff } from './takeoff'

export { FINISH_SURFACES, type FinishSurface }

/** What each surface is measured in: floor, walls and ceiling by area, skirting by length. */
export const FINISH_UNITS: Readonly<Record<FinishSurface, 'm2' | 'm'>> = { floor: 'm2', walls: 'm2', ceiling: 'm2', skirting: 'm' }

export const FINISH_RULE =
  "A room's finish covers the room, less each of its zones that names its own finish for that surface: that part is the zone's. Floor and ceiling are the net area, walls the inside wall face less openings, skirting the inside perimeter less doorways, as grid_takeoff measures them. A surface no room or zone names a finish for is not stated."

export const WALL_TYPE_RULE =
  "Walls of a type the plan names, each counted once: length along the centre line, gross with openings and net less their widths, and the wall's face on one side, its length times its height (under the roof its floor states, the face the roof leaves it, its gable part given apart) less every opening in it."

/** One room's or zone's part of one surface, with the finish it names (null: none stated). */
export interface FinishShare {
  readonly surface: FinishSurface
  readonly finish: string | null
  readonly quantity: number
  readonly room: string
  /** The zone this part is, or null for the room itself. */
  readonly zone: string | null
  readonly floor: string
}

/** One room, or a zone with a finish of its own, and its four surfaces. */
export interface FinishRow {
  readonly id: string
  readonly name: string
  readonly floor: string
  /** The room a zone is part of; null for a room. */
  readonly zoneOf: string | null
  readonly surfaces: Readonly<Record<FinishSurface, { readonly finish: string | null; readonly quantity: number }>>
}

/** One finish of one surface across the plan. */
export interface FinishTotal {
  readonly surface: FinishSurface
  readonly finish: string | null
  readonly unit: 'm2' | 'm'
  readonly quantity: number
  /** The rooms and zones it covers, by id, in the plan's order. */
  readonly rooms: readonly string[]
}

export interface FinishQuantities {
  readonly rows: readonly FinishRow[]
  readonly totals: readonly FinishTotal[]
  readonly rule: string
}

const QUANTITY: Readonly<Record<FinishSurface, (t: RoomTakeoff) => number>> = {
  floor: (t) => t.floorArea,
  walls: (t) => t.wallFace,
  ceiling: (t) => t.ceiling,
  skirting: (t) => t.skirting,
}

/** A room's finishes as the plan states them, by its id. */
function statedFinishes(survey: Survey, id: string): Readonly<Record<FinishSurface, string | null>> {
  const room = survey.plan.rooms.find((r) => r.id === id)
  return room === undefined ? roomFinishes({}) : roomFinishes(room)
}

/**
 * Each room's and zone's part of each surface. `onFloor` keeps the floors asked for; a room that
 * cannot be measured is left out. A zone is measured with its room.
 */
export function finishShares(survey: Survey, onFloor: (floor: string) => boolean = () => true): FinishShare[] {
  const shares: FinishShare[] = []
  const measured = (room: SurveyRoom): boolean => room.facts.shape !== null && room.polygon.length >= 3
  for (const room of survey.rooms) {
    if (!onFloor(room.facts.floor) || room.facts.zoneOf !== undefined || !measured(room)) continue
    const whole = roomTakeoff(room, undefined, survey.plan)
    const own = statedFinishes(survey, room.facts.id)
    const zones = survey.rooms.filter((zone) => zone.facts.zoneOf === room.facts.id && zone.facts.floor === room.facts.floor && measured(zone))
    for (const surface of FINISH_SURFACES) {
      let left = QUANTITY[surface](whole)
      for (const zone of zones) {
        const finish = statedFinishes(survey, zone.facts.id)[surface]
        if (finish === null) continue
        const quantity = Math.min(left, QUANTITY[surface](roomTakeoff(zone, undefined, survey.plan)))
        left -= quantity
        shares.push({ surface, finish, quantity, room: room.facts.id, zone: zone.facts.id, floor: room.facts.floor })
      }
      shares.push({ surface, finish: own[surface], quantity: Math.max(0, left), room: room.facts.id, zone: null, floor: room.facts.floor })
    }
  }
  return shares
}

/** The finishes room by room (a zone with a finish of its own after its room), and each finish's total. */
export function planFinishes(survey: Survey, floors?: readonly string[]): FinishQuantities {
  const onFloor = (floor: string): boolean => floors === undefined || floors.includes(floor)
  const shares = finishShares(survey, onFloor)
  const names = new Map<string, string>(survey.rooms.map((room) => [`${room.facts.floor}\u0000${room.facts.id}`, roomCalled(room.facts)]))
  const rows = new Map<string, { id: string; name: string; floor: string; zoneOf: string | null; surfaces: Partial<Record<FinishSurface, { finish: string | null; quantity: number }>> }>()
  for (const share of shares) {
    const id = share.zone ?? share.room
    const key = `${share.floor}\u0000${id}`
    const row = rows.get(key) ?? { id, name: names.get(key) ?? id, floor: share.floor, zoneOf: share.zone === null ? null : share.room, surfaces: {} }
    row.surfaces[share.surface] = { finish: share.finish, quantity: share.quantity }
    rows.set(key, row)
  }
  const none = { finish: null, quantity: 0 }
  const listed: FinishRow[] = [...rows.values()].map((row) => ({
    ...row,
    // A zone lists only the surfaces it names a finish for; the others are its room's.
    surfaces: Object.fromEntries(FINISH_SURFACES.map((surface) => [surface, row.surfaces[surface] ?? none])) as FinishRow['surfaces'],
  }))
  const totals = new Map<string, { surface: FinishSurface; finish: string | null; quantity: number; rooms: string[] }>()
  for (const share of shares) {
    const key = `${share.surface}\u0000${share.finish ?? ''}`
    const total = totals.get(key) ?? { surface: share.surface, finish: share.finish, quantity: 0, rooms: [] }
    total.quantity += share.quantity
    const id = share.zone ?? share.room
    if (share.quantity > 0 && !total.rooms.includes(id)) total.rooms.push(id)
    totals.set(key, total)
  }
  const ordered = [...totals.values()]
    .filter((total) => total.quantity > 0 || total.finish !== null)
    .sort((a, b) => FINISH_SURFACES.indexOf(a.surface) - FINISH_SURFACES.indexOf(b.surface) || (a.finish === b.finish ? 0 : a.finish === null ? 1 : b.finish === null ? -1 : a.finish < b.finish ? -1 : 1))
    .map((total): FinishTotal => ({ ...total, unit: FINISH_UNITS[total.surface] }))
  return { rows: listed, totals: ordered, rule: FINISH_RULE }
}

/** One of the plan's named wall types, and its walls' quantities. */
export interface WallTypeRun {
  readonly type: string
  readonly name: string
  readonly kind: Wall['kind'] | null
  readonly material: string | null
  readonly glazed: boolean
  readonly count: number
  readonly gross: number
  readonly net: number
  /** The face on one side, its length times its height, less every opening in it. */
  readonly face: number
  /** CNT-34: the part of `face` above the lowest the roof leaves the walls' tops: the gable part, inside `face`. */
  readonly gable: number
}

/** The walls of each named wall type on the floors given, in the order the plan lists its types. */
export function wallTypeRuns(survey: Survey, floors?: readonly string[]): WallTypeRun[] {
  const onFloor = (floor: string): boolean => floors === undefined || floors.includes(floor)
  const wallFloor = new Map(survey.facts.floors.flatMap((f) => f.walls.map((w) => [w.id, f.id] as const)))
  const holes = new Map<string, { width: number; area: number }>()
  for (const o of survey.plan.openings) {
    const wall = survey.plan.walls.find((w) => w.id === o.wall)
    const height = wall === undefined ? o.height : Math.max(0, Math.min(o.sill + o.height, wall.height) - o.sill)
    const hole = holes.get(o.wall) ?? { width: 0, area: 0 }
    holes.set(o.wall, { width: hole.width + o.width, area: hole.area + o.width * height })
  }
  const runs = new Map<string, { count: number; gross: number; net: number; face: number; gable: number }>()
  for (const wall of survey.plan.walls) {
    if (wall.virtual === true || !wallFloor.has(wall.id) || !onFloor(wallFloor.get(wall.id)!)) continue
    const type = wallTypeOf(survey.plan, wall)
    if (type === null) continue
    const length = wall.arc !== undefined ? (curveFault(wall) === null ? wallLength(wall) : 0) : wallAxis(wall).length
    const hole = holes.get(wall.id) ?? { width: 0, area: 0 }
    // CNT-34: under the roof the floor states, the face is what the roof leaves the wall.
    const cut = wall.arc !== undefined ? { face: length * wall.height, gable: 0 } : wallFaceCut(survey.plan, wall, 0, length)
    const run = runs.get(type.id) ?? { count: 0, gross: 0, net: 0, face: 0, gable: 0 }
    runs.set(type.id, { count: run.count + 1, gross: run.gross + length, net: run.net + Math.max(0, length - hole.width), face: run.face + Math.max(0, cut.face - hole.area), gable: run.gable + cut.gable })
  }
  return (survey.plan.types?.walls ?? [])
    .filter((type, i, all) => runs.has(type.id) && all.findIndex((t) => t.id === type.id) === i)
    .map((type) => ({ type: type.id, name: type.name, kind: type.kind ?? null, material: type.material ?? null, glazed: type.glazed === true, ...runs.get(type.id)! }))
}
