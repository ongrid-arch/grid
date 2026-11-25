/**
 * VEW-3 (lab SE-4, SE-7, S-16): the camera record, the one description of a 3D view.
 *
 * A camera is set by what it is pointed at (`target`: a point, and the room it is in), the
 * compass bearing from there to the camera, how far it looks down (`tilt`), how far it stands
 * (`distance`), its lens (a focal length in millimetres on a 36 × 24 mm sensor) and the floor
 * shown cut away (`cut`). From those Grid works out the rest: where the camera stands, which
 * way it looks and which way is up, the field of view, how high the eye is above its floor,
 * which floors are drawn and which room, if any, it stands in. The last five fields are the
 * perspective camera of the open BCF format, in the plan's metres: `position`, `direction`,
 * `up`, `fieldOfView` (vertical, in degrees) and `aspectRatio`.
 *
 * Every number is rounded to a millionth, so a record sent back unchanged gives the same record,
 * digit for digit: the tool server's views, the stills, a saved view and the app's 3D view all
 * read this one record.
 *
 * Axes: x and y are the plan's (C4), z is the height above the ground floor's floor level, as
 * the 3D model stands its floors (`floorElevations`; a plan of one floor stands it at 0).
 *
 * Bearings: degrees clockwise from the north the plan states (CNT-3, `north`). With no stated
 * north, bearing 0 is the top of the drawing (+y), and the record says so (`bearingFrom`).
 *
 * Pure: no Three, no React, no DOM.
 */
import { floorElevations, type BuildingElevations } from './elevations'
import { floorOf, planFloors } from './floors'
import { pointInPolygon } from './innerPoint'
import { roomShapes } from './items'
import { directionOfTurn, planOrientation, wrapDegrees, type PlanOrientation } from './orientation'
import { indexPlan, type FloorPlan, type Wall } from './plan'
import { area } from './vec2'
import type { Vec2 } from './vec2'
import { wallPolygon, wallSlicePolygon } from './wall'
import { limit, tolerance } from './tolerances'

export type Point3 = readonly [number, number, number]

/** The sensor every camera's lens is given on: full frame, 36 by 24 mm. */
export const CAMERA_SENSOR = { width: 36, height: 24 } as const

/** What bearing 0 is: the north the plan states, or the top of the drawing when it states none. */
export const BEARING_FROM = ['north', 'plan up'] as const
export type BearingFrom = (typeof BEARING_FROM)[number]

/** The words a camera outside every room is described with (lab S-16). */
export const OUTSIDE_ANY_ROOM = 'outside any room'

export interface CameraLens {
  /** In millimetres. */
  readonly focalLength: number
  /** In millimetres. */
  readonly sensor: { readonly width: number; readonly height: number }
}

/** What a camera is set by: the record's own fields, which a record sent back is read from. */
export interface CameraSetting {
  readonly target: { readonly room: string | null; readonly point: Point3 }
  /** Degrees clockwise from `north`, from the target to the camera. */
  readonly bearing: number
  /**
   * The north `bearing` is read from, in degrees counter-clockwise from the top of the drawing
   * (as the plan's `north`), or null for the top of the drawing. The plan's own when left out.
   */
  readonly north?: number | null
  /** Degrees the camera looks down at the target; below 0 it looks up. */
  readonly tilt: number
  /** Metres from the camera to the target. */
  readonly distance: number
  /** Millimetres, on `CAMERA_SENSOR`. */
  readonly focalLength: number
  /** The floor shown cut away (nothing above it drawn), or null for the whole building. */
  readonly cut: string | null
  /** The picture's width over its height. 1.5 when left out, as the sensor is. */
  readonly aspectRatio?: number
}

/** Where a camera stands: in which room, on which floor, or outside any room. */
export interface CameraPlace {
  readonly room: string | null
  readonly name: string | null
  readonly floor: string | null
  /** `in "Kitchen"`, or `outside any room`. */
  readonly words: string
}

/** The camera record. Its key order is fixed, so it serialises the same every time. */
export interface CameraRecord {
  readonly target: { readonly room: string | null; readonly point: Point3 }
  readonly bearing: number
  readonly bearingFrom: BearingFrom
  /** The north the bearing is from (as the plan states it), or null: bearing 0 is the top of the drawing. */
  readonly north: number | null
  readonly tilt: number
  readonly distance: number
  /** Metres from `floor`'s floor level up to the camera. */
  readonly eyeHeight: number
  readonly floor: string
  readonly lens: CameraLens
  readonly cut: string | null
  /** The floors drawn, lowest first. */
  readonly floors: readonly string[]
  readonly standingIn: CameraPlace
  /** BCF's perspective camera: where it stands, the unit direction it looks and its unit up, in plan metres. */
  readonly position: Point3
  readonly direction: Point3
  readonly up: Point3
  /** BCF's vertical field of view, in degrees. */
  readonly fieldOfView: number
  readonly aspectRatio: number
}

const DEG = Math.PI / 180

/** A millionth: the record's every number, so a record read back is the same digit for digit. */
export function cameraRound(value: number): number {
  return Math.round(value * 1e6) / 1e6 + 0
}

const round3 = (p: readonly [number, number, number]): Point3 => [cameraRound(p[0]), cameraRound(p[1]), cameraRound(p[2])]

/** The vertical field of view, in degrees, of a focal length on a sensor `height` mm tall. */
export function fieldOfViewOf(focalLength: number, height: number = CAMERA_SENSOR.height): number {
  return (2 * Math.atan(height / (2 * focalLength))) / DEG
}

/** The focal length, in millimetres, that gives a vertical field of view on a sensor `height` mm tall. */
export function focalLengthOf(fieldOfView: number, height: number = CAMERA_SENSOR.height): number {
  return height / (2 * Math.tan((fieldOfView * DEG) / 2))
}

/** The north bearings are read from: the plan's, else the top of the page it was drawn on (as `planFacing`). */
function northUsed(orientation: PlanOrientation, north: number | null): number {
  return north ?? (orientation.yAxis === 'down' ? 180 : 0)
}

/**
 * A compass bearing as a direction on the drawing: degrees clockwise from the top of the drawing
 * (+y). With y up a turn clockwise on the earth is clockwise on the drawing; with y down the
 * drawing is the building's mirror image, and it is the other way (`bearingOf`).
 */
export function drawingBearing(bearing: number, orientation: PlanOrientation, north: number | null = orientation.north): number {
  const n = northUsed(orientation, north)
  return wrapDegrees(orientation.yAxis === 'up' ? bearing - n : -(bearing + n))
}

/** A direction on the drawing, degrees clockwise from +y, as a compass bearing: `drawingBearing` undone. */
export function compassBearing(drawing: number, orientation: PlanOrientation, north: number | null = orientation.north): number {
  const n = northUsed(orientation, north)
  return wrapDegrees(orientation.yAxis === 'up' ? drawing + n : -drawing - n)
}

/** The unit direction on the drawing `degrees` clockwise from +y, exact at each quarter turn. */
export function drawingDirection(degrees: number): { x: number; y: number } {
  return directionOfTurn(-degrees)
}

/** Floor levels as the 3D model stands them: a plan of one floor stands it at 0, whatever its level. */
export function modelFloorLevels(plan: FloorPlan, elevations: BuildingElevations = floorElevations(plan)): Map<string, { base: number; clearHeight: number }> {
  const floors = planFloors(plan)
  const out = new Map<string, { base: number; clearHeight: number }>()
  for (const floor of floors) {
    const storey = elevations.floors.get(floor.id)
    out.set(floor.id, { base: floors.length <= 1 ? 0 : (storey?.floorLevel ?? 0), clearHeight: storey?.clearHeight ?? 0 })
  }
  return out
}

/** The floors lowest first, in the order the 3D view stacks them. */
function floorsLowestFirst(plan: FloorPlan) {
  return planFloors(plan)
    .map((floor, order) => ({ floor, order }))
    .sort((a, b) => a.floor.level - b.floor.level || a.order - b.order)
    .map(({ floor }) => floor)
}

/**
 * The floors drawn with a floor cut away, as the 3D view draws them: that floor and those below
 * it. A floor at the cut floor's own level would stand in its place, and is not drawn. Every
 * floor without a cut.
 */
export function shownFloors(plan: FloorPlan, cut: string | null): string[] {
  const floors = floorsLowestFirst(plan)
  const level = floors.find((f) => f.id === cut)?.level
  if (cut === null || level === undefined || floors.length <= 1) return floors.map((f) => f.id)
  return floors.filter((f) => f.id === cut || f.level < level).map((f) => f.id)
}

/** The floor a camera's eye height is measured from: its target room's, else the cut, else the ground floor. */
function eyeFloor(plan: FloorPlan, target: string | null, cut: string | null): string {
  const room = target === null ? undefined : plan.rooms.find((r) => r.id === target)
  if (room !== undefined) return floorOf(room)
  if (cut !== null) return cut
  const floors = floorsLowestFirst(plan)
  return (floors.find((f) => f.level === 0) ?? floors[0])?.id ?? 'ground'
}

/**
 * The room a point stands in: the smallest room whose floor holds it, on the floor whose storey
 * holds its height (from its floor level up to its clear height). Outside every room, null.
 */
export function cameraPlace(plan: FloorPlan, position: Point3, levels = modelFloorLevels(plan)): CameraPlace {
  const [x, y, z] = position
  const shapes = roomShapes(indexPlan(plan))
  let best: { room: FloorPlan['rooms'][number]; size: number } | null = null
  for (const { room, shape } of shapes) {
    const level = levels.get(floorOf(room))
    if (level === undefined || z < level.base || z > level.base + level.clearHeight) continue
    if (!pointInPolygon({ x, y }, shape.polygon, shape.holes)) continue
    const size = area(shape.polygon)
    if (best === null || size < best.size) best = { room, size }
  }
  if (best === null) return { room: null, name: null, floor: null, words: OUTSIDE_ANY_ROOM }
  return { room: best.room.id, name: best.room.name, floor: floorOf(best.room), words: `in ${JSON.stringify(best.room.name)}` }
}

/**
 * The record for a setting, on this plan. The bearing is given back from the plan's own north:
 * a setting read from a north since changed keeps the camera where it was, and says its bearing
 * from the north the plan states now.
 */
export function cameraRecord(plan: FloorPlan, setting: CameraSetting, levels = modelFloorLevels(plan)): CameraRecord {
  const orientation = planOrientation(plan)
  const from = setting.north === undefined ? orientation.north : setting.north
  const target = round3(setting.target.point)
  const tilt = cameraRound(setting.tilt)
  const distance = cameraRound(setting.distance)
  const focalLength = cameraRound(setting.focalLength)
  const aspectRatio = cameraRound(setting.aspectRatio ?? CAMERA_SENSOR.width / CAMERA_SENSOR.height)
  const onDrawing = drawingBearing(cameraRound(wrapDegrees(setting.bearing)), orientation, from)
  const bearing = cameraRound(wrapDegrees(compassBearing(onDrawing, orientation)))
  const u = drawingDirection(onDrawing)
  const cos = Math.cos(tilt * DEG)
  const sin = Math.sin(tilt * DEG)
  const position = round3([target[0] + distance * cos * u.x, target[1] + distance * cos * u.y, target[2] + distance * sin])
  const direction = round3([-cos * u.x, -cos * u.y, -sin])
  // Up, in the upright plane through the line of sight: no roll.
  const up = round3([-sin * u.x, -sin * u.y, cos])
  const cut = setting.cut !== null && planFloors(plan).some((f) => f.id === setting.cut) ? setting.cut : null
  const room = setting.target.room !== null && plan.rooms.some((r) => r.id === setting.target.room) ? setting.target.room : null
  const floor = eyeFloor(plan, room, cut)
  const base = levels.get(floor)?.base ?? 0
  return {
    target: { room, point: target },
    bearing: bearing === 360 ? 0 : bearing,
    bearingFrom: orientation.north === null ? 'plan up' : 'north',
    north: orientation.north,
    tilt,
    distance,
    eyeHeight: cameraRound(position[2] - base),
    floor,
    lens: { focalLength, sensor: { width: CAMERA_SENSOR.width, height: CAMERA_SENSOR.height } },
    cut,
    floors: shownFloors(plan, cut),
    standingIn: cameraPlace(plan, position, levels),
    position,
    direction,
    up,
    fieldOfView: cameraRound(fieldOfViewOf(focalLength)),
    aspectRatio,
  }
}

/** VEW-26: a box in the plan's metres, z up as the 3D model stands its floors. */
export interface CameraBox {
  readonly min: Point3
  readonly max: Point3
}

/** VEW-26: where a camera fitted to a box points, and how far it stands. */
export interface CameraFit {
  readonly target: Point3
  readonly distance: number
}

/** The frames a fitted still is taken in: landscape, as the sensor, or portrait for a tall box. */
export const LANDSCAPE_ASPECT = CAMERA_SENSOR.width / CAMERA_SENSOR.height
export const PORTRAIT_ASPECT = CAMERA_SENSOR.height / CAMERA_SENSOR.width
/** How much of the frame's width or height a fitted box takes at most: the rest is its margin. */
const FIT_FILL = 0.88
/** A portrait frame is taken only when it shows the box this many times larger than a landscape one. */
const PORTRAIT_GAIN = 1.25
/** How many times the target is moved to the middle of what the camera sees. */
const FIT_PASSES = 6

type Vec3 = readonly [number, number, number]
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** The camera's own axes for a setting: to its right, its up and the way it looks, in plan metres. */
function cameraAxes(plan: FloorPlan, setting: CameraSetting): { right: Vec3; up: Vec3; along: Vec3 } {
  const orientation = planOrientation(plan)
  const from = setting.north === undefined ? orientation.north : setting.north
  const u = drawingDirection(drawingBearing(wrapDegrees(setting.bearing), orientation, from))
  const cos = Math.cos(setting.tilt * DEG)
  const sin = Math.sin(setting.tilt * DEG)
  const along: Vec3 = [-cos * u.x, -cos * u.y, -sin]
  const up: Vec3 = [-sin * u.x, -sin * u.y, cos]
  // Along the line of sight crossed with up: the camera's right.
  const right: Vec3 = [along[1] * up[2] - along[2] * up[1], along[2] * up[0] - along[0] * up[2], along[0] * up[1] - along[1] * up[0]]
  return { right, up, along }
}

/** The box's eight corners, each side at least a metre, so a plan with nothing drawn has a frame. */
function boxCorners(box: CameraBox): Vec3[] {
  const lo: number[] = []
  const hi: number[] = []
  for (let i = 0; i < 3; i++) {
    const [a, b] = [box.min[i]!, box.max[i]!]
    const pad = Math.max(0, 1 - (b - a)) / 2
    lo.push(a - pad)
    hi.push(b + pad)
  }
  const out: Vec3[] = []
  for (const x of [lo[0]!, hi[0]!]) for (const y of [lo[1]!, hi[1]!]) for (const z of [lo[2]!, hi[2]!]) out.push([x, y, z])
  return out
}

/**
 * VEW-26: the target and the distance at which a camera, at the setting's bearing, tilt, lens
 * and aspect, sees all of `box` and fills its frame with it: every corner inside the frame with
 * a margin, one of them near an edge, and what it sees centred. With `level`, the target keeps
 * the setting's height (an eye-level camera that looks level, its upright lines upright), and is
 * moved across only.
 */
export function fitCamera(plan: FloorPlan, setting: CameraSetting, box: CameraBox, options: { readonly level?: boolean } = {}): CameraFit {
  const { right, up, along } = cameraAxes(plan, setting)
  const aspect = setting.aspectRatio ?? LANDSCAPE_ASPECT
  const high = Math.tan((fieldOfViewOf(setting.focalLength) * DEG) / 2) * FIT_FILL
  const wide = high * aspect
  const corners = boxCorners(box)
  const middle = corners.reduce<[number, number, number]>((sum, c) => [sum[0] + c[0] / 8, sum[1] + c[1] / 8, sum[2] + c[2] / 8], [0, 0, 0])
  let target: [number, number, number] = options.level ? [middle[0], middle[1], setting.target.point[2]] : middle
  const distanceFor = (t: Vec3): number => {
    let most = limit('cameraClosest')
    for (const c of corners) {
      const d: Vec3 = [c[0] - t[0], c[1] - t[1], c[2] - t[2]]
      most = Math.max(most, Math.abs(dot3(d, right)) / wide - dot3(d, along), Math.abs(dot3(d, up)) / high - dot3(d, along))
    }
    return most
  }
  let distance = distanceFor(target)
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    // Where the corners fall on the picture, as a share of the distance: move the target to their middle.
    let [left, rightMost, low, top] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const c of corners) {
      const d: Vec3 = [c[0] - target[0], c[1] - target[1], c[2] - target[2]]
      const depth = distance + dot3(d, along)
      const x = dot3(d, right) / depth
      const y = dot3(d, up) / depth
      left = Math.min(left, x)
      rightMost = Math.max(rightMost, x)
      low = Math.min(low, y)
      top = Math.max(top, y)
    }
    const across = ((left + rightMost) / 2) * distance
    const upward = options.level ? 0 : ((low + top) / 2) * distance
    target = [target[0] + right[0] * across + up[0] * upward, target[1] + right[1] * across + up[1] * upward, target[2] + right[2] * across + up[2] * upward]
    distance = distanceFor(target)
  }
  return { target: round3(target), distance: cameraRound(distance) }
}

/**
 * VEW-26: the frame a fitted still is taken in: portrait (2 by 3) when the box fills it clearly
 * more than a landscape frame (3 by 2), as a tower does, else landscape.
 */
export function fitAspect(plan: FloorPlan, setting: CameraSetting, box: CameraBox, options: { readonly level?: boolean } = {}): number {
  // What the box fills of a frame goes as one over its distance squared and its width.
  const shown = (aspect: number): number => {
    const { distance } = fitCamera(plan, { ...setting, aspectRatio: aspect }, box, options)
    return 1 / (distance * distance * aspect)
  }
  return shown(PORTRAIT_ASPECT) > PORTRAIT_GAIN * shown(LANDSCAPE_ASPECT) ? cameraRound(PORTRAIT_ASPECT) : cameraRound(LANDSCAPE_ASPECT)
}

/** What a record is set by, to send it back or save it. */
export function cameraSetting(record: Pick<CameraRecord, 'target' | 'bearing' | 'north' | 'tilt' | 'distance' | 'lens' | 'cut' | 'aspectRatio'>): CameraSetting {
  return {
    target: { room: record.target.room, point: record.target.point },
    bearing: record.bearing,
    north: record.north,
    tilt: record.tilt,
    distance: record.distance,
    focalLength: record.lens.focalLength,
    cut: record.cut,
    aspectRatio: record.aspectRatio,
  }
}

/** A view as the plan file stores it (`views`, C11): its name, its setting and its BCF camera. */
export interface StoredView {
  readonly name: string
  readonly target: { readonly room?: string; readonly point: Point3 }
  readonly bearing: number
  readonly bearingFrom: BearingFrom
  readonly north?: number
  readonly tilt: number
  readonly distance: number
  readonly lens: CameraLens
  readonly cut?: string
  readonly floors: readonly string[]
  readonly position: Point3
  readonly direction: Point3
  readonly up: Point3
  readonly fieldOfView: number
  readonly aspectRatio: number
}

/** The view a record is saved as, under `name`. What the plan says about it now is not stored. */
export function storedView(name: string, record: CameraRecord): StoredView {
  return {
    name,
    target: { ...(record.target.room !== null ? { room: record.target.room } : {}), point: record.target.point },
    bearing: record.bearing,
    bearingFrom: record.bearingFrom,
    ...(record.north !== null ? { north: record.north } : {}),
    tilt: record.tilt,
    distance: record.distance,
    lens: { focalLength: record.lens.focalLength, sensor: { width: record.lens.sensor.width, height: record.lens.sensor.height } },
    ...(record.cut !== null ? { cut: record.cut } : {}),
    floors: [...record.floors],
    position: record.position,
    direction: record.direction,
    up: record.up,
    fieldOfView: record.fieldOfView,
    aspectRatio: record.aspectRatio,
  }
}

/** What a saved view is set by: its bearing read from the north it was saved with. */
export function viewSetting(view: Omit<StoredView, 'floors'> & { readonly floors?: readonly string[] | undefined }): CameraSetting {
  return {
    target: { room: view.target.room ?? null, point: view.target.point },
    bearing: view.bearing,
    north: view.bearingFrom === 'north' ? (view.north ?? null) : null,
    tilt: view.tilt,
    distance: view.distance,
    focalLength: view.lens.focalLength,
    cut: view.cut ?? null,
    aspectRatio: view.aspectRatio,
  }
}

/** The plan's saved view by name, its capitals and spaces aside, or null. */
export function findView<V extends { readonly name: string }>(views: readonly V[] | undefined, name: string): V | null {
  const wanted = name.trim().toLowerCase()
  return (views ?? []).find((v) => v.name.trim().toLowerCase() === wanted) ?? null
}

/** VEW-59: a camera inside a wall: the wall, and the distance that stands the camera clear of it. */
export interface CameraInWall {
  /** The wall the camera stands in. */
  readonly wall: string
  /** The distance from the target, in metres, that stands the camera outside every wall; null when it looks straight down. */
  readonly clearDistance: number | null
}

/** How far past a wall's face a camera is stood to clear it, in metres. */
const CLEAR_BY = 0.1
/** Walls a camera is walked out of one after another, at most. */
const CLEAR_STEPS = 8

/** Walls of the floors a picture shows that hold the point, standing between their floor's level and its top. */
function wallsAround(plan: FloorPlan, camera: CameraRecord, p: Vec2, z: number, levels: ReturnType<typeof modelFloorLevels>): { wall: Wall; polygon: Vec2[] }[] {
  const shown = new Set(camera.floors)
  const out: { wall: Wall; polygon: Vec2[] }[] = []
  for (const wall of plan.walls) {
    if (wall.virtual || !shown.has(floorOf(wall))) continue
    const level = levels.get(floorOf(wall))
    if (level === undefined || z < level.base || z > level.base + level.clearHeight) continue
    const polygon = wallPolygon(wall)
    if (!pointInPolygon(p, polygon)) continue
    // A door or window leaves the wall open where the camera stands in it.
    const open = plan.openings.some((o) => o.wall === wall.id && z >= o.sill && z <= o.sill + o.height && pointInPolygon(p, wallSlicePolygon(wall, o.offset, o.offset + o.width)))
    if (!open) out.push({ wall, polygon })
  }
  return out
}

/** How far along `dir` from `from` the last side of the polygon is crossed. */
function farthestCrossing(polygon: readonly Vec2[], from: Vec2, dir: Vec2): number {
  let far = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const den = dir.x * ey - dir.y * ex
    if (Math.abs(den) < tolerance('noArea')) continue
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / den
    const s = ((a.x - from.x) * dir.y - (a.y - from.y) * dir.x) / den
    if (s >= 0 && s <= 1 && t > far) far = t
  }
  return far
}

/**
 * VEW-59: whether the camera stands inside a wall the picture draws, and how far from its target
 * it would stand clear of every wall, walking out along its bearing. A picture taken from inside
 * a wall is a flat field of the wall's colour.
 */
export function cameraInsideWall(plan: FloorPlan, camera: CameraRecord, levels = modelFloorLevels(plan)): CameraInWall | null {
  const [x, y, z] = camera.position
  const first = wallsAround(plan, camera, { x, y }, z, levels)[0]
  if (first === undefined) return null
  const away = { x: x - camera.target.point[0], y: y - camera.target.point[1] }
  const run = Math.hypot(away.x, away.y)
  const cos = Math.cos(camera.tilt * DEG)
  if (run === 0 || cos <= 0) return { wall: first.wall.id, clearDistance: null }
  const dir = { x: away.x / run, y: away.y / run }
  let walked = 0
  for (let step = 0; step < CLEAR_STEPS; step++) {
    const here = { x: x + dir.x * walked, y: y + dir.y * walked }
    const holding = wallsAround(plan, camera, here, z, levels)
    if (holding.length === 0) return { wall: first.wall.id, clearDistance: cameraRound(camera.distance + walked / cos) }
    walked += Math.max(...holding.map((h) => farthestCrossing(h.polygon, here, dir))) + CLEAR_BY
  }
  return { wall: first.wall.id, clearDistance: null }
}
