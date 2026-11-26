/**
 * VEW-67 (C31): the plan's trace image set, placed, scaled and turned (`grid_place_trace`,
 * `grid edit trace`). One call sets what it gives and keeps the rest: the picture (`path`, and a
 * PDF's `page`), the floor it lies under, its opacity, where its top-left corner lies (`at`), its
 * turn, and its scale, stated, set from two points on it and the length between them (a scale
 * bar's two ends and the length marked on it), or with its corner and turn from two of its
 * pixels pinned to the two points of the plan they show. Pinned, pixel p lies on the plan at
 * `at + turn(rotation)(scale·u, −scale·v)`, so for pixels p1, p2 and points q1, q2 the scale is
 * |q2 − q1| over |p2 − p1| (its v turned up), the turn the angle from one to the other, and `at`
 * is q1 less p1 turned and scaled. The image is checked by the plan's own schema before anything
 * is written; the path's place in the project folder is the tool's to check (`projectFiles`).
 */
import { planFloors } from '@ongrid/floorplan/geometry'
import { ReferenceImageSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'

type Pair = readonly [number, number]

export interface TraceRequest {
  readonly path?: string
  readonly page?: number
  readonly floor?: string
  readonly opacity?: number
  readonly at?: Pair
  readonly rotation?: number
  readonly scale?: number
  readonly calibration?: { readonly from: Pair; readonly to: Pair; readonly length: number }
  readonly pins?: { readonly pixels: readonly [Pair, Pair]; readonly points: readonly [Pair, Pair] }
  readonly remove?: boolean
}

/** The opacity the schema gives a trace image that states none, left out of the file. */
const OPACITY_UNSTATED = ReferenceImageSchema.parse({ path: 'a.png' }).opacity

const short = (v: number): string => String(Number(v.toPrecision(6)) + 0)
const P = (p: Pair): string => `(${short(p[0])}, ${short(p[1])})`

/** Where two pixels pinned to two points of the plan place the picture: its corner, turn and scale. */
export function pinnedPlacement(pixels: readonly [Pair, Pair], points: readonly [Pair, Pair]): { at: [number, number]; rotation: number; scale: number } {
  // The pixels' v runs down the picture; the plan's y runs up (C4).
  const a = [pixels[1][0] - pixels[0][0], -(pixels[1][1] - pixels[0][1])] as const
  const b = [points[1][0] - points[0][0], points[1][1] - points[0][1]] as const
  const pixelsApart = Math.hypot(a[0], a[1])
  const metresApart = Math.hypot(b[0], b[1])
  if (!(pixelsApart > 0)) throw new EditRefused('pin_pixels are the same pixel: pin two pixels apart, as far apart on the picture as you can.')
  if (!(metresApart > 0)) throw new EditRefused('pin_points are the same point: pin the two pixels to two points of the plan apart.')
  const scale = metresApart / pixelsApart
  let rotation = ((Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])) * 180) / Math.PI
  rotation = ((rotation % 360) + 540) % 360 - 180
  if (Math.abs(rotation) < 1e-9) rotation = 0
  const turn = (rotation * Math.PI) / 180
  const u = pixels[0][0] * scale
  const v = -pixels[0][1] * scale
  const at: [number, number] = [points[0][0] - (Math.cos(turn) * u - Math.sin(turn) * v), points[0][1] - (Math.sin(turn) * u + Math.cos(turn) * v)]
  return { at, rotation, scale }
}

/** The trace image set as asked, or taken out. */
export function placeTrace(plan: FloorPlan, request: TraceRequest): Patch {
  const had = plan.referenceImage
  const given = Object.entries(request).filter(([key, value]) => value !== undefined && key !== 'remove').map(([key]) => key)
  if (request.remove === true) {
    if (given.length > 0) throw new EditRefused('remove takes the trace image out: give it alone.')
    if (had === undefined) throw new EditRefused('The plan has no trace image to take out.')
    return { ...emptyPatch(['Took the trace image out. The picture itself stays in the project folder.']), plan: { referenceImage: null } }
  }
  if (given.length === 0) throw new EditRefused('Give the picture (path), or how to place it: floor, at, rotation, scale, calibrate_from with calibrate_to and length, pin_pixels with pin_points, opacity or page; or remove to take it out.')
  if (had === undefined && request.path === undefined) throw new EditRefused('The plan has no trace image yet: give path, the picture inside the project folder.')
  const scales = [request.scale !== undefined, request.calibration !== undefined, request.pins !== undefined].filter(Boolean).length
  if (scales > 1) throw new EditRefused('Give one way to scale it: scale, calibrate_from with calibrate_to and length, or pin_pixels with pin_points.')
  if (request.pins !== undefined && (request.at !== undefined || request.rotation !== undefined)) throw new EditRefused('pin_pixels with pin_points set where the picture lies and its turn: leave at and rotation out.')
  if (request.floor !== undefined && !planFloors(plan).some((floor) => floor.id === request.floor)) throw new EditRefused(`The plan has no floor ${JSON.stringify(request.floor)}.`)

  const image: Record<string, unknown> = { ...(had ?? {}) }
  const said: string[] = []
  if (image['opacity'] === OPACITY_UNSTATED) delete image['opacity']
  if (request.path !== undefined) {
    image['path'] = request.path
    said.push(had === undefined ? `The trace image is ${JSON.stringify(request.path)}.` : `The trace image is now ${JSON.stringify(request.path)}; where it lies and its scale are kept.`)
  }
  const pdf = String(image['path']).toLowerCase().endsWith('.pdf')
  if (request.page !== undefined) {
    if (!pdf) throw new EditRefused('page names a page of a PDF: the trace image is a picture, not a PDF.')
    image['page'] = request.page
    said.push(`It is page ${request.page} of the PDF.`)
  } else if (!pdf) delete image['page']
  if (request.floor !== undefined) {
    image['floor'] = request.floor
    said.push(`It lies under floor ${JSON.stringify(request.floor)}.`)
  }
  if (request.opacity !== undefined) {
    image['opacity'] = request.opacity
    said.push(`Its opacity is ${short(request.opacity)}.`)
  }
  if (request.at !== undefined) {
    image['at'] = [request.at[0], request.at[1]]
    said.push(`Its top-left corner is at ${P(request.at)} m.`)
  }
  if (request.rotation !== undefined) {
    image['rotation'] = request.rotation
    said.push(`It is turned ${short(request.rotation)}° counter-clockwise about that corner.`)
  }
  if (request.scale !== undefined) {
    image['scale'] = request.scale
    delete image['calibration']
    said.push(`Its scale is 1 px = ${short(request.scale)} m.`)
  }
  if (request.calibration !== undefined) {
    const c = request.calibration
    image['calibration'] = { from: [c.from[0], c.from[1]], to: [c.to[0], c.to[1]], length: c.length }
    delete image['scale']
    const pixels = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1])
    said.push(`Its scale is set from pixels ${P(c.from)} and ${P(c.to)}, ${short(pixels)} px apart, ${short(c.length)} m apart on the building: 1 px = ${short(c.length / pixels)} m.`)
  }
  if (request.pins !== undefined) {
    const placed = pinnedPlacement(request.pins.pixels, request.pins.points)
    image['at'] = placed.at
    image['rotation'] = placed.rotation
    image['scale'] = placed.scale
    delete image['calibration']
    said.push(`Pinned pixel ${P(request.pins.pixels[0])} to ${P(request.pins.points[0])} and pixel ${P(request.pins.pixels[1])} to ${P(request.pins.points[1])}: 1 px = ${short(placed.scale)} m, turned ${short(placed.rotation)}°, its top-left corner at ${P(placed.at)} m.`)
  }
  const checked = ReferenceImageSchema.safeParse(image)
  if (!checked.success) {
    const issue = checked.error.issues[0]!
    throw new EditRefused(`The trace image would not be read: ${['referenceImage', ...issue.path].join('.')} ${issue.message}.`)
  }
  return { ...emptyPatch(said), plan: { referenceImage: image } }
}
