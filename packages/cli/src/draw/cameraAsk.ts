/**
 * VEW-3 (lab SE-4): the camera a view call asks for, as one camera record (`cameraRecord` in
 * `@ongrid/floorplan/geometry`).
 *
 * A call starts from a camera record it sends back, a view saved with the plan, or Grid's own
 * framing, and changes what it names: the target room, the bearing or a side of the drawing, the
 * tilt, the distance, the eye height, the lens and the floor cut away. `turn` walks the camera
 * round its target and `tilt_by` raises or lowers it, so "lower and more from the left" is one
 * call with no arithmetic. The eye view (standing in a room, looking level) is made here too, so
 * every 3D picture an agent gets comes with the same record.
 *
 * No drawing here: the picture is taken from the record by `cameraView` (`views.ts`).
 */
import {
  CAMERA_SENSOR,
  cameraRecord,
  compassBearing,
  fitAspect,
  fitCamera,
  shownFloors,
  drawingBearing,
  floorOf,
  focalLengthOf,
  limit,
  modelFloorLevels,
  tolerance,
  planFloors,
  planOrientation,
  poleOfInaccessibility,
  wrapDegrees,
  floorElevations,
  type CameraBox,
  type CameraRecord,
  type CameraSetting,
  type FloorPlan,
  type Point3,
  type Vec2,
} from '@ongrid/floorplan/geometry'
import { buildingFrame } from '@ongrid/viewer/src/canvas3d/building'
import type { Survey } from '../quantities/survey'
import type { Side } from './viewNames'

/** A camera Grid cannot set, in Grid's words. */
export class CameraRefused extends Error {
  override readonly name = 'CameraRefused'
}

/** The sides and corners of the drawing, clockwise from its top. */
export const SIDE_BEARING: Readonly<Record<Exclude<Side, 'above'>, number>> = {
  north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315,
}

/** The app's opening lens, 45 degrees tall: 28.97 mm on a 36 × 24 mm sensor. */
export const MODEL_FOCAL_LENGTH = focalLengthOf(45)
/** The eye view's lens, 90 degrees across a picture of 3 by 2: 18 mm on a 36 × 24 mm sensor. */
export const EYE_FOCAL_LENGTH = CAMERA_SENSOR.width / 2
const MODEL_TILT = 30
const ABOVE_TILT = 80

const DEG = Math.PI / 180

/** What a call names. Each is left out when the call does not name it. */
export interface CameraAsk {
  /** A record sent back, or a saved view's setting: what the call starts from. */
  readonly start?: CameraSetting
  readonly room?: string
  readonly from?: Side
  readonly bearing?: number
  readonly tilt?: number
  readonly distance?: number
  readonly eyeHeight?: number
  readonly lens?: number
  /** The floor cut away. */
  readonly cut?: string
  readonly turn?: number
  readonly tiltBy?: number
  /** VEW-26: what fills the frame: the building (the floors drawn) or the room pointed at. */
  readonly fit?: CameraFit
}

/** VEW-26: what a camera Grid frames fills its frame with. */
export const CAMERA_FITS = ['building', 'room'] as const
export type CameraFit = (typeof CAMERA_FITS)[number]

/** Three's (x, up, south) as the plan's (x, y, z up). */
const fromThree = (p: readonly [number, number, number]): Point3 => [p[0], -p[2] + 0, p[1]]

/** Where Grid points a camera at a room: the middle of its floor, half way up its storey. */
function roomTarget(plan: FloorPlan, survey: Survey, room: string): Point3 {
  const surveyed = survey.byId.get(room)
  if (!surveyed || surveyed.polygon.length < 3) throw new CameraRefused('That room has no outline Grid can draw, so a camera cannot be pointed at it; grid_check says why.')
  const centre = poleOfInaccessibility(surveyed.polygon, undefined, surveyed.holes).point
  const level = modelFloorLevels(plan).get(floorOf(plan.rooms.find((r) => r.id === room)!))
  return [centre.x, centre.y, (level?.base ?? 0) + (level?.clearHeight ?? 0) / 2]
}

/**
 * VEW-26: the box of what the 3D view draws: the plan's outline, from under its lowest slab up to
 * its roof, or to the top of the floor cut away.
 */
function buildingBox(plan: FloorPlan, frame: ReturnType<typeof buildingFrame>, cut: string | null): CameraBox {
  const levels = modelFloorLevels(plan)
  const shown = shownFloors(plan, cut).map((id) => levels.get(id)).filter((l) => l !== undefined)
  const top = cut === null || shown.length === 0 ? frame.box.max[1] : Math.max(...shown.map((l) => l.base + l.clearHeight))
  return { min: [frame.box.min[0], -frame.box.max[2] + 0, frame.box.min[1]], max: [frame.box.max[0], -frame.box.min[2] + 0, top] }
}

/** VEW-26: a room's box: its outline over its storey. */
function roomBox(plan: FloorPlan, survey: Survey, room: string): CameraBox {
  const surveyed = survey.byId.get(room)
  if (!surveyed || surveyed.polygon.length < 3) throw new CameraRefused('That room has no outline Grid can draw, so a camera cannot be pointed at it; grid_check says why.')
  const level = modelFloorLevels(plan).get(floorOf(plan.rooms.find((r) => r.id === room)!))
  const xs = surveyed.polygon.map((p) => p.x)
  const ys = surveyed.polygon.map((p) => p.y)
  const base = level?.base ?? 0
  return { min: [Math.min(...xs), Math.min(...ys), base], max: [Math.max(...xs), Math.max(...ys), base + (level?.clearHeight ?? 0)] }
}

/** The camera a call asks for, as its record. Refused, with why, when it cannot be set. */
export function cameraFor(plan: FloorPlan, survey: Survey, ask: CameraAsk): CameraRecord {
  return framedCamera(plan, survey, ask).camera
}

/** VEW-26: the camera a call asks for, with what Grid fitted it to (null: the call's own distance) and whether it was levelled. */
export function framedCamera(plan: FloorPlan, survey: Survey, ask: CameraAsk): { camera: CameraRecord; fit: CameraFit | null; level: boolean } {
  const orientation = planOrientation(plan)
  if (ask.bearing !== undefined && ask.from !== undefined) throw new CameraRefused('Pass bearing or from, not both: both say where the camera stands.')
  const several = planFloors(plan).length > 1
  const room = ask.room ?? ask.start?.target.room ?? null
  const roomFloor = room === null ? null : floorOf(plan.rooms.find((r) => r.id === room)!)
  // A room on one floor of several is seen with its floor cut away, unless the call says otherwise.
  const cut = ask.cut ?? (ask.room !== undefined ? (several ? roomFloor : null) : (ask.start?.cut ?? null))
  const frame = buildingFrame(plan, floorElevations(plan), cut)

  const fromAbove = ask.from === 'above'
  const sideBearing = ask.from === undefined ? undefined : compassBearing(fromAbove ? 180 : SIDE_BEARING[ask.from], orientation)
  const target: CameraSetting['target'] = ask.room !== undefined
    ? { room: ask.room, point: roomTarget(plan, survey, ask.room) }
    : ask.start?.target ?? (room !== null ? { room, point: roomTarget(plan, survey, room) } : { room: null, point: fromThree(frame.target) })

  let setting: CameraSetting = {
    target,
    // A bearing or side the call names is from the plan's north now; else the start's own.
    bearing: ask.bearing ?? sideBearing ?? ask.start?.bearing ?? compassBearing(SIDE_BEARING['south-east'], orientation),
    north: ask.bearing !== undefined || sideBearing !== undefined || ask.start === undefined ? orientation.north : (ask.start.north ?? null),
    tilt: ask.tilt ?? (fromAbove ? ABOVE_TILT : ask.start?.tilt ?? MODEL_TILT),
    // VEW-26: fitted to what it frames below when the call names no distance and sends no camera back.
    distance: ask.distance ?? ask.start?.distance ?? frame.span,
    focalLength: ask.lens ?? ask.start?.focalLength ?? MODEL_FOCAL_LENGTH,
    cut,
    aspectRatio: ask.start?.aspectRatio ?? CAMERA_SENSOR.width / CAMERA_SENSOR.height,
  }

  if (ask.turn !== undefined) {
    // To the camera's left is clockwise round the target, seen from above the drawing.
    const onDrawing = drawingBearing(setting.bearing, orientation, setting.north ?? null)
    setting = { ...setting, bearing: compassBearing(onDrawing + ask.turn, orientation, setting.north ?? null) }
  }
  if (ask.tiltBy !== undefined) setting = { ...setting, tilt: setting.tilt + ask.tiltBy }

  // VEW-26: an eye-level view from outside looks level, so the building's upright lines stay upright.
  const level = ask.eyeHeight !== undefined && ask.tilt === undefined && ask.tiltBy === undefined && ask.distance === undefined && !fromAbove && setting.target.room === null && ask.fit !== 'room'
  if (ask.fit !== undefined && ask.distance !== undefined) throw new CameraRefused('Pass fit or distance, not both: each says how far the camera stands.')
  if (ask.fit === 'room' && setting.target.room === null) throw new CameraRefused('fit=room frames the room the camera is pointed at: pass room too.')
  const fit: CameraFit | null = ask.fit ?? (level || (ask.start === undefined && ask.distance === undefined) ? (ask.room !== undefined ? 'room' : 'building') : null)
  if (fit !== null) {
    const box = fit === 'room' ? roomBox(plan, survey, setting.target.room!) : buildingBox(plan, frame, cut)
    if (level) {
      const draft = cameraRecord(plan, setting)
      const eye = draft.position[2] - draft.eyeHeight + ask.eyeHeight!
      setting = { ...setting, tilt: 0, target: { ...setting.target, point: [setting.target.point[0], setting.target.point[1], eye] } }
    }
    const aspectRatio = fitAspect(plan, setting, box, { level })
    const fitted = fitCamera(plan, { ...setting, aspectRatio }, box, { level })
    setting = { ...setting, aspectRatio, target: { ...setting.target, point: fitted.target }, distance: fitted.distance }
  }

  const most = limit('cameraTilt')
  if (Math.abs(setting.tilt) > most) throw new CameraRefused(`That tilts the camera ${Math.abs(setting.tilt).toFixed(1)} degrees ${setting.tilt > 0 ? 'down' : 'up'}; it may tilt at most ${most} degrees from level.`)

  if (ask.eyeHeight !== undefined && !level) {
    // The floor the eye is measured from is the record's own: the target room's, the cut, or the ground floor.
    const draft = cameraRecord(plan, setting)
    const base = draft.position[2] - draft.eyeHeight
    const eye = base + ask.eyeHeight
    const sin = Math.sin(setting.tilt * DEG)
    const point = setting.target.point
    if (ask.distance !== undefined || Math.abs(setting.tilt) < 1) {
      // The camera stands at the eye: the point it looks at moves up or down its line of sight.
      setting = { ...setting, target: { ...setting.target, point: [point[0], point[1], eye - setting.distance * sin] } }
    } else {
      // The camera stands back along its bearing until it is that high.
      const distance = (eye - point[2]) / sin
      if (!(distance >= limit('cameraClosest'))) {
        throw new CameraRefused(`An eye ${ask.eyeHeight.toFixed(2)} m up is ${eye < point[2] ? 'below' : 'level with'} what the camera is pointed at, ${(point[2] - base).toFixed(2)} m up, so it cannot look ${setting.tilt > 0 ? 'down' : 'up'} at it from there: pass a tilt ${setting.tilt > 0 ? 'below 0 to look up' : 'above 0 to look down'}, or a distance.`)
      }
      setting = { ...setting, distance }
    }
  }

  if (!(setting.distance >= limit('cameraClosest'))) throw new CameraRefused(`The camera would stand ${setting.distance.toFixed(2)} m from what it is pointed at; it stands at least ${limit('cameraClosest')} m away.`)
  if (setting.distance > limit('largest')) throw new CameraRefused(`The camera would stand further than ${limit('largest')} m from what it is pointed at.`)
  return { camera: cameraRecord(plan, setting), fit: ask.eyeHeight !== undefined && !level ? null : fit, level }
}

/** The first crossing of a ray from `from` along `dir` with the polygon's sides, or null. */
function rayHit(polygon: readonly Vec2[], from: Vec2, dir: Vec2): number | null {
  let best: number | null = null
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const den = dir.x * ey - dir.y * ex
    // A line of sight along a side crosses it nowhere: their cross product is none.
    if (Math.abs(den) < tolerance('noArea')) continue
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / den
    const s = ((a.x - from.x) * dir.y - (a.y - from.y) * dir.x) / den
    if (t > 0 && s >= 0 && s <= 1 && (best === null || t < best)) best = t
  }
  return best
}

/**
 * Standing in a room at `stand`, the eye `height` above its floor, looking level toward a point or
 * a heading (degrees clockwise from the top of the drawing): the eye view's camera. It points at
 * what it looks at: the point, or where the line of sight meets the room's outline.
 */
export function eyeCamera(
  plan: FloorPlan,
  options: { room: string; polygon: readonly Vec2[]; stand: Vec2; height: number; toward: Vec2 | number },
): CameraRecord {
  const orientation = planOrientation(plan)
  const floor = floorOf(plan.rooms.find((r) => r.id === options.room)!)
  const eye = (modelFloorLevels(plan).get(floor)?.base ?? 0) + options.height
  const heading = typeof options.toward === 'number'
    ? options.toward
    : wrapDegrees(Math.atan2(options.toward.x - options.stand.x, options.toward.y - options.stand.y) / DEG)
  const along = { x: Math.sin(heading * DEG), y: Math.cos(heading * DEG) }
  const distance = typeof options.toward === 'number'
    ? (rayHit(options.polygon, options.stand, along) ?? 3)
    : Math.hypot(options.toward.x - options.stand.x, options.toward.y - options.stand.y)
  const point: Point3 = [options.stand.x + along.x * distance, options.stand.y + along.y * distance, eye]
  return cameraRecord(plan, {
    target: { room: options.room, point },
    bearing: compassBearing(heading + 180, orientation),
    tilt: 0,
    distance,
    focalLength: EYE_FOCAL_LENGTH,
    cut: floor,
  })
}

/** A camera record as an agent sends it back: read field by field, refused naming the field, never its value. */
export function settingOfCamera(raw: Record<string, unknown>): CameraSetting {
  const number = (value: unknown, where: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new CameraRefused(`camera.${where} takes a number, as grid_view returned it.`)
    return value
  }
  const text = (value: unknown, where: string): string | null => {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(value)) throw new CameraRefused(`camera.${where} takes an id of the plan, or null.`)
    return value
  }
  const object = (value: unknown, where: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CameraRefused(`camera.${where} takes an object, as grid_view returned it.`)
    return value as Record<string, unknown>
  }
  const target = object(raw['target'], 'target')
  const point = target['point']
  if (!Array.isArray(point) || point.length !== 3) throw new CameraRefused('camera.target.point takes three numbers: x, y and the height, in metres.')
  const lens = object(raw['lens'], 'lens')
  const north = raw['north'] === undefined || raw['north'] === null ? null : number(raw['north'], 'north')
  const aspect = raw['aspectRatio'] === undefined ? undefined : number(raw['aspectRatio'], 'aspectRatio')
  if (aspect !== undefined && !(aspect > 0)) throw new CameraRefused('camera.aspectRatio takes a number above 0.')
  return {
    target: { room: text(target['room'], 'target.room'), point: [number(point[0], 'target.point[0]'), number(point[1], 'target.point[1]'), number(point[2], 'target.point[2]')] },
    bearing: number(raw['bearing'], 'bearing'),
    north,
    tilt: number(raw['tilt'], 'tilt'),
    distance: number(raw['distance'], 'distance'),
    focalLength: number(lens['focalLength'], 'lens.focalLength'),
    cut: text(raw['cut'], 'cut'),
    ...(aspect !== undefined ? { aspectRatio: aspect } : {}),
  }
}

/** Checks a focal length against Grid's limits. */
export function lensProblem(focalLength: number): string | null {
  const [shortest, longest] = [limit('lensShortest'), limit('lensLongest')]
  return focalLength >= shortest && focalLength <= longest ? null : `takes a focal length from ${shortest} to ${longest} mm`
}
