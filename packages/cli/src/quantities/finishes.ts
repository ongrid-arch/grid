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
 * CNT-51: a room's wall face is split into its bands (a splashback behind the kitchen run, tiles to
 * 1.2 m all round), its finished faces (a feature wall, less the bands on it) and the rest, under
 * its walls finish, so the walls shares always add up to the take-off's wall face. A room that
 * states no skirting has none.
 *
 * Pure: a survey in, plain data out.
 */
import { FINISH_SURFACES, curveFault, floorOf, roomFinishes, tolerance, wallAxis, wallLength, wallTypeOf, type FinishSurface, type Wall } from '@ongrid/floorplan/geometry'
import type { FinishBand, FloorPlan, Item } from '@ongrid/floorplan/types/floorplan'
import { roomCalled, type Survey, type SurveyRoom } from './survey'
import { roomTakeoff, skirtingParts, wallFaceCut, type RoomTakeoff } from './takeoff'

export { FINISH_SURFACES, type FinishSurface }

/** What each surface is measured in: floor, walls and ceiling by area, skirting by length. */
export const FINISH_UNITS: Readonly<Record<FinishSurface, 'm2' | 'm'>> = { floor: 'm2', walls: 'm2', ceiling: 'm2', skirting: 'm' }

export const FINISH_RULE =
  "A room's finish covers the room, less each of its zones that names its own finish for that surface: that part is the zone's. Floor and ceiling are the net area, walls the inside wall face less openings, skirting the inside perimeter less doorways, as grid_takeoff measures them. A band of finish is its length on the room's inside faces (behind an item, the length of the item's back) times its height under the wall's top, less the part of each opening in it; it and a finished wall face come off the room's walls finish. A room that states no skirting has none. A surface no room or zone names a finish for is not stated."

export const WALL_TYPE_RULE =
  "Walls of a type the plan names, each counted once: length along the centre line, gross with openings and net less their widths, and the wall's face on one side, its length times its height (under the roof its floor states, the face the roof leaves it, its gable part given apart) less every opening in it."

/** CNT-51: one band of finish as measured: where it is, how high, how long and its area. */
export interface BandLine {
  readonly finish: string
  /** The wall whose face it is on, or null for every face of the room. */
  readonly wall: string | null
  /** The item it is behind, or null. */
  readonly behind: string | null
  /** Metres above the floor its bottom and its top stand at. */
  readonly from: number
  readonly to: number
  /** Metres along the room's inside faces it runs. */
  readonly length: number
  readonly area: number
}

/** CNT-51: one wall's face finished other than the room's walls, less the bands on it. */
export interface FaceLine {
  readonly wall: string
  readonly finish: string
  readonly area: number
}

/** One room's or zone's part of one surface, with the finish it names (null: none stated). */
export interface FinishShare {
  readonly surface: FinishSurface
  readonly finish: string | null
  readonly quantity: number
  readonly room: string
  /** The zone this part is, or null for the room itself. */
  readonly zone: string | null
  readonly floor: string
  /** CNT-51, walls only: the band this part is. */
  readonly band?: BandLine
  /** CNT-51, walls only: the finished wall face this part is, by wall id. */
  readonly face?: string
  /** CNT-51, skirting only: the room or zone states no skirting. */
  readonly none?: true
}

/** One room, or a zone with a finish of its own, and its four surfaces. */
export interface FinishRow {
  readonly id: string
  readonly name: string
  readonly floor: string
  /** The room a zone is part of; null for a room. */
  readonly zoneOf: string | null
  readonly surfaces: Readonly<Record<FinishSurface, { readonly finish: string | null; readonly quantity: number }>>
  /** CNT-51: its bands and finished wall faces, each taken off its walls finish; empty when it states none. */
  readonly bands: readonly BandLine[]
  readonly faces: readonly FaceLine[]
  /** CNT-51: it states no skirting. */
  readonly noSkirting: boolean
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

/** One stretch of a room's inside face on a solid wall: where it runs along the wall and how high the wall stands there. */
interface FaceStrip {
  readonly wall: Wall
  readonly start: { readonly x: number; readonly y: number }
  readonly end: { readonly x: number; readonly y: number }
  readonly length: number
  /** The mean height the wall's top leaves over the stretch. */
  readonly height: number
  /** Metres along the wall's axis the stretch runs between; null on a curved wall. */
  readonly along: readonly [number, number] | null
}

/** One opening in a wall face of the room: along the wall's axis and from its sill to its head. */
interface FaceHole {
  readonly wall: string
  readonly along: readonly [number, number]
  readonly rise: readonly [number, number]
}

const overlap = (a: readonly [number, number], b: readonly [number, number]): number => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))

/** The room's inside faces on its solid walls, and the openings in them, as roomTakeoff measures them. */
function faceStrips(room: SurveyRoom, plan: FloorPlan): { strips: FaceStrip[]; holes: FaceHole[] } {
  const strips: FaceStrip[] = []
  for (const edge of room.edges) {
    if (edge.wall === null || edge.wall.virtual === true || !(edge.length > 0)) continue
    if (edge.wall.arc !== undefined) {
      strips.push({ wall: edge.wall, start: edge.from, end: edge.to, length: edge.length, height: edge.wall.height, along: null })
      continue
    }
    const axis = wallAxis(edge.wall)
    const at = (p: { x: number; y: number }): number => (p.x - axis.start.x) * axis.dir.x + (p.y - axis.start.y) * axis.dir.y
    const along: [number, number] = [Math.min(at(edge.from), at(edge.to)), Math.max(at(edge.from), at(edge.to))]
    const cut = wallFaceCut(plan, edge.wall, along[0], along[1])
    strips.push({ wall: edge.wall, start: edge.from, end: edge.to, length: edge.length, height: cut.face / edge.length, along })
  }
  const walls = new Map(strips.map((strip) => [strip.wall.id, strip.wall] as const))
  const holes: FaceHole[] = room.openings.flatMap((o) => {
    const wall = walls.get(o.wall)
    if (wall === undefined) return []
    return [{ wall: o.wall, along: [o.offset, o.offset + o.width] as const, rise: [o.sill, Math.max(o.sill, Math.min(o.sill + o.height, wall.height))] as const }]
  })
  return { strips, holes }
}

/** The stretch of a strip an item's back stands against, in metres along the strip, or null. */
function behindItem(strip: FaceStrip, item: Item): readonly [number, number] | null {
  const ux = (strip.end.x - strip.start.x) / strip.length
  const uy = (strip.end.y - strip.start.y) / strip.length
  // The floor is on the left of every edge: the face looks that way, into the room.
  const nx = -uy
  const ny = ux
  const t = ((item.turn ?? 0) * Math.PI) / 180
  const front = { x: -Math.sin(t), y: Math.cos(t) }
  if (front.x * nx + front.y * ny < 1 - tolerance('writtenParallel')) return null
  const [width, depth] = item.size
  const back = { x: item.at[0] - (front.x * depth) / 2, y: item.at[1] - (front.y * depth) / 2 }
  const off = (back.x - strip.start.x) * nx + (back.y - strip.start.y) * ny
  if (Math.abs(off) > tolerance('itemIntoWall')) return null
  const middle = (back.x - strip.start.x) * ux + (back.y - strip.start.y) * uy
  const span: [number, number] = [Math.max(0, middle - width / 2), Math.min(strip.length, middle + width / 2)]
  return span[1] > span[0] ? span : null
}

/** The part of a strip, in metres along it, turned into metres along its wall's axis. */
function onAxis(strip: FaceStrip, span: readonly [number, number]): readonly [number, number] | null {
  if (strip.along === null) return null
  const axis = wallAxis(strip.wall)
  const at = (s: number): number => (strip.start.x + ((strip.end.x - strip.start.x) * s) / strip.length - axis.start.x) * axis.dir.x + (strip.start.y + ((strip.end.y - strip.start.y) * s) / strip.length - axis.start.y) * axis.dir.y
  const a = at(span[0])
  const b = at(span[1])
  return [Math.min(a, b), Math.max(a, b)]
}

/**
 * CNT-51: one band measured on a room's faces, with its area on each wall. A band behind an item
 * that stands against none of the room's faces, or on a wall that is not one of them, measures none.
 */
export function measureBand(room: SurveyRoom, plan: FloorPlan, band: FinishBand): { line: BandLine; byWall: Map<string, number> } {
  const { strips, holes } = faceStrips(room, plan)
  const item = band.behind === undefined ? undefined : (plan.items ?? []).find((i) => i.id === band.behind && floorOf(i) === room.facts.floor)
  const from = band.from ?? (item !== undefined ? item.height : 0)
  const top = from + band.height
  const byWall = new Map<string, number>()
  let length = 0
  let area = 0
  const curvedHoled = new Set<string>()
  for (const strip of strips) {
    if (band.wall !== undefined && strip.wall.id !== band.wall) continue
    let span: readonly [number, number] | null = [0, strip.length]
    if (band.behind !== undefined) span = item === undefined ? null : behindItem(strip, item)
    if (span === null) continue
    const rise: [number, number] = [from, Math.min(top, strip.height)]
    if (!(rise[1] > rise[0])) continue
    let part = (span[1] - span[0]) * (rise[1] - rise[0])
    const axis = onAxis(strip, span)
    for (const hole of holes) {
      if (hole.wall !== strip.wall.id) continue
      if (axis === null) {
        // A curved wall's openings are taken off once, at their full width.
        if (curvedHoled.has(strip.wall.id)) continue
        part -= (hole.along[1] - hole.along[0]) * overlap(hole.rise, rise)
      } else part -= overlap(hole.along, axis) * overlap(hole.rise, rise)
    }
    if (axis === null) curvedHoled.add(strip.wall.id)
    part = Math.max(0, part)
    length += span[1] - span[0]
    area += part
    byWall.set(strip.wall.id, (byWall.get(strip.wall.id) ?? 0) + part)
  }
  return { line: { finish: band.finish, wall: band.wall ?? null, behind: band.behind ?? null, from, to: top, length, area }, byWall }
}

/** CNT-51: one wall's face in the room, its length times its height less the openings in it. */
export function wallFaceInRoom(room: SurveyRoom, plan: FloorPlan, wall: string): number {
  const { strips, holes } = faceStrips(room, plan)
  const face = strips.filter((s) => s.wall.id === wall).reduce((sum, s) => sum + s.length * s.height, 0)
  const off = holes.filter((h) => h.wall === wall).reduce((sum, h) => sum + (h.along[1] - h.along[0]) * (h.rise[1] - h.rise[0]), 0)
  return Math.max(0, face - off)
}

/** CNT-51: a room's or zone's bands and finished faces, measured, each face less the bands on it. */
export function roomBandsAndFaces(survey: Survey, room: SurveyRoom): { bands: BandLine[]; faces: FaceLine[] } {
  const record = survey.plan.rooms.find((r) => r.id === room.facts.id)
  const stated = record?.finishes
  if (stated === undefined || ((stated.bands ?? []).length === 0 && (stated.faces ?? []).length === 0)) return { bands: [], faces: [] }
  const banded = new Map<string, number>()
  const bands = (stated.bands ?? []).map((band) => {
    const measured = measureBand(room, survey.plan, band)
    for (const [wall, area] of measured.byWall) banded.set(wall, (banded.get(wall) ?? 0) + area)
    return measured.line
  })
  const faces = (stated.faces ?? []).map((face) => ({ wall: face.wall, finish: face.finish, area: Math.max(0, wallFaceInRoom(room, survey.plan, face.wall) - (banded.get(face.wall) ?? 0)) }))
  return { bands, faces }
}

/**
 * Each room's and zone's part of each surface. `onFloor` keeps the floors asked for; a room that
 * cannot be measured is left out. A zone is measured with its room. CNT-51: a room's and its zones'
 * bands and finished faces come off its walls before the zones' and the room's walls finishes.
 */
export function finishShares(survey: Survey, onFloor: (floor: string) => boolean = () => true): FinishShare[] {
  const shares: FinishShare[] = []
  const measured = (room: SurveyRoom): boolean => room.facts.shape !== null && room.polygon.length >= 3
  for (const room of survey.rooms) {
    if (!onFloor(room.facts.floor) || room.facts.zoneOf !== undefined || !measured(room)) continue
    const whole = roomTakeoff(room, undefined, survey.plan)
    const own = statedFinishes(survey, room.facts.id)
    const zones = survey.rooms.filter((zone) => zone.facts.zoneOf === room.facts.id && zone.facts.floor === room.facts.floor && measured(zone))
    const base = { room: room.facts.id, floor: room.facts.floor }
    for (const surface of FINISH_SURFACES) {
      if (surface === 'skirting') {
        // CNT-51: none where the room or a zone of it states no skirting.
        for (const part of skirtingParts(survey, room, whole.skirting)) shares.push({ surface, finish: part.finish, quantity: part.quantity, ...base, zone: part.zone, ...(part.none ? { none: true as const } : {}) })
        continue
      }
      let left = QUANTITY[surface](whole)
      const carved: FinishShare[] = []
      const carve = (zone: string | null, finish: string, area: number, extra: Pick<FinishShare, 'band' | 'face'>): number => {
        const quantity = Math.min(left, area)
        left -= quantity
        carved.push({ surface, finish, quantity, ...base, zone, ...extra })
        return quantity
      }
      for (const zone of zones) {
        let zoneLeft = QUANTITY[surface](roomTakeoff(zone, undefined, survey.plan))
        if (surface === 'walls') {
          const parts = roomBandsAndFaces(survey, zone)
          for (const band of parts.bands) zoneLeft -= carve(zone.facts.id, band.finish, band.area, { band })
          for (const face of parts.faces) zoneLeft -= carve(zone.facts.id, face.finish, face.area, { face: face.wall })
        }
        const finish = statedFinishes(survey, zone.facts.id)[surface]
        if (finish === null) continue
        const quantity = Math.min(left, Math.max(0, zoneLeft))
        left -= quantity
        shares.push({ surface, finish, quantity, ...base, zone: zone.facts.id })
      }
      if (surface === 'walls') {
        const parts = roomBandsAndFaces(survey, room)
        for (const band of parts.bands) carve(null, band.finish, band.area, { band })
        for (const face of parts.faces) carve(null, face.finish, face.area, { face: face.wall })
      }
      // The room's own rest first, so a reader looking for the room's part finds it before its bands.
      shares.push({ surface, finish: own[surface], quantity: Math.max(0, left), ...base, zone: null }, ...carved)
    }
  }
  return shares
}

/** The finishes room by room (a zone with a finish of its own after its room), and each finish's total. */
export function planFinishes(survey: Survey, floors?: readonly string[]): FinishQuantities {
  const onFloor = (floor: string): boolean => floors === undefined || floors.includes(floor)
  const shares = finishShares(survey, onFloor)
  const names = new Map<string, string>(survey.rooms.map((room) => [`${room.facts.floor}\u0000${room.facts.id}`, roomCalled(room.facts)]))
  const rows = new Map<string, { id: string; name: string; floor: string; zoneOf: string | null; surfaces: Partial<Record<FinishSurface, { finish: string | null; quantity: number }>>; bands: BandLine[]; faces: FaceLine[]; noSkirting: boolean }>()
  for (const share of shares) {
    const id = share.zone ?? share.room
    const key = `${share.floor}\u0000${id}`
    const row = rows.get(key) ?? { id, name: names.get(key) ?? id, floor: share.floor, zoneOf: share.zone === null ? null : share.room, surfaces: {}, bands: [], faces: [], noSkirting: false }
    // CNT-51: a band or a finished face is listed apart; the surface is the rest.
    if (share.band !== undefined) row.bands.push({ ...share.band, area: share.quantity })
    else if (share.face !== undefined) row.faces.push({ wall: share.face, finish: share.finish!, area: share.quantity })
    else row.surfaces[share.surface] = { finish: share.finish, quantity: share.quantity }
    if (share.none === true) row.noSkirting = true
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
