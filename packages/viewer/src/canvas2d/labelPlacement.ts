/**
 * Where room labels go, and keeps dimension numbers off them.
 *
 * Each room's name and area sit at a spot inside the room where the whole label fits, clear
 * of door swings, walls, other labels and, when there is room, dimension lines. The spots come
 * from the geometry core (`spotsInside`): the room's pole of inaccessibility first, then the
 * rest of the room, deepest first. VEW-13: a label that does not fit is turned, made smaller,
 * wrapped, shortened to the name, then to the room's number (`labelForms`), still in its room.
 * The search stays in the visible room floor, including when a picture shows just a crop.
 *
 * Dimension lines live in metres, but every label is drawn at a fixed size in screen pixels,
 * so whether a number lands on a room's name or area depends on the zoom. This works it out
 * for the current zoom, in plan metres (y up): text boxes are estimated from the font sizes
 * in plan.css (`estimateTextWidth`), the number slides along its own dimension line to the clear spot
 * nearest the middle, and with no clear spot it is hidden (the line stays).
 *
 * Pure: no DOM measuring, so it runs in tests and on every render without layout reads.
 */
import type { Dimension, PlanOpening, Rect, Vec2 } from '@ongrid/floorplan/geometry'
import { areaText, doorSwing, metresText, openingSymbol, rectOf, rectTouchesPolygon, spotsInside, symbolPoints, tolerance } from '@ongrid/floorplan/geometry'
import { TEXT_PX } from '../picture/look'
import { showArea, showLength, type Display } from '@ongrid/floorplan/types/units'
import type { DoorHanding } from './doorHanding'
import { ENGLISH_WORDS, wordsOf, type DrawingWords } from '../picture/words'

export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

// Font sizes and offsets, in screen pixels.
const ROOM_NAME_PX = TEXT_PX.roomName
const ROOM_AREA_PX = TEXT_PX.roomArea
export const ROOM_AREA_DY = 16
const DIMENSION_PX = { room: TEXT_PX.roomDimension, other: TEXT_PX.dimension }
export const DIMENSION_DY = -5
// A generous average glyph width and the usual ascent/descent split, plus breathing room.
const CHAR_WIDTH = 0.62
const ASCENT = 0.75
const DESCENT = 0.25
const PADDING_PX = 2
const SEARCH_STEPS = 48

/**
 * How wide a line of text is, in pixels, without measuring it: every character counts as
 * 0.62 of the font size. That is a little wider than the average letter of a sans-serif face,
 * so a box built on it errs on the side of keeping text apart. The same in a browser, a test
 * and a picture, whatever fonts the machine has.
 */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * CHAR_WIDTH
}

/** How a room's tag reads. Everything is off by default: the name as written, two decimals. */
export interface LabelStyle {
  /** The name in capitals. */
  readonly upperCase?: boolean
  /** A number before each name, 1, 2, 3… in the floor's room order. */
  readonly numbered?: boolean
  /** How many decimals the area keeps: 0, 1 or 2 (the default). */
  readonly areaDecimals?: 0 | 1 | 2
  /** WRT-7: the person's units and decimal mark for areas and dimensions. Metres when left out. */
  readonly display?: Display
  /**
   * The check view (VEW-2): each room's id after its name, in brackets, and each door's and
   * window's id beside it, as the plan file holds them, so a picture and the text that comes
   * with it name the parts the same way. All of it upright.
   */
  readonly ids?: boolean
}

/**
 * WRT-7: the person's display for the drawing being made, or null for metres. `planScene` sets
 * it for the one drawing it makes and puts it back, so every label and dimension of that
 * drawing, and the boxes placed round them, are written one way.
 */
let drawingDisplay: Display | null = null
/** MSG-11: the language of the drawing being made, kept apart: a display of plain metres is dropped, its language is not. */
let drawingLanguage: DrawingWords = ENGLISH_WORDS

export function withDisplay<T>(display: Display | undefined, draw: () => T): T {
  const before = drawingDisplay
  const beforeWords = drawingLanguage
  drawingDisplay = display === undefined || (display.length === 'm' && display.area === 'm2' && display.decimal === 'point' && display.precision === undefined) ? null : display
  drawingLanguage = wordsOf(display)
  try {
    return draw()
  } finally {
    drawingDisplay = before
    drawingLanguage = beforeWords
  }
}

/** MSG-11: the language and decimal mark the drawing being made writes its own words in. */
export function drawingWords(): DrawingWords {
  return drawingLanguage
}

/** A room's area as its tag prints it, rounded the core's one way (ARE-7), in the drawing's display. */
export function formatArea(area: number, decimals: 0 | 1 | 2 = 2): string {
  if (drawingDisplay !== null) return showArea(area, drawingDisplay, drawingDisplay.area === 'ft2' ? Math.min(decimals, 1) : decimals)
  return `${areaText(area, decimals)} m²`
}

/** An area figure without its unit, for "before → after" tags, in the drawing's display. */
export function areaNumber(area: number, decimals: 0 | 1 | 2 = 2): string {
  if (drawingDisplay !== null) return formatArea(area, decimals).replace(/ (m²|sq ft)$/, '')
  return areaText(area, decimals)
}

/** The unit an area tag ends with. */
export function areaUnit(): string {
  return drawingDisplay?.area === 'ft2' ? 'sq ft' : 'm²'
}

/** A dimension's number as it is drawn: metres to the millimetre, then to the centimetre (ARE-7); else in the drawing's display, as 12'-6" or 2860. */
export function dimensionText(value: number, kind?: Dimension['kind']): string {
  if (drawingDisplay !== null) return showLength(value, drawingDisplay, { unit: false })
  // A grid's spacings are set out to the millimetre, so they are drawn so and add up to the overall (VEW-46).
  return metresText(value, kind === 'grid' ? 3 : 2)
}

/** The first line of a room's tag, as `style` asks. `index` is the room's place on its floor. */
export function labelName(name: string, index: number, style: LabelStyle = {}): string {
  const shown = style.upperCase ? name.toUpperCase() : name
  return style.numbered ? `${index + 1} ${shown}` : shown
}

/** Name and area as drawn at `labelAt`: name on the baseline, area 16 px below. */
export function roomLabelBox(
  room: { name: string; area: number; labelAt: Vec2; /** The area line as drawn, when it isn't the plain area. */ areaText?: string },
  metersPerPixel: number
): Box {
  const area = room.areaText ?? formatArea(room.area)
  const width = Math.max(roomTextWidth(room.name, ROOM_NAME_PX), roomTextWidth(area, ROOM_AREA_PX))
  const top = ASCENT * ROOM_NAME_PX + PADDING_PX
  const bottom = ROOM_AREA_DY + DESCENT * ROOM_AREA_PX + PADDING_PX
  const half = width / 2 + PADDING_PX
  return {
    minX: room.labelAt.x - half * metersPerPixel,
    maxX: room.labelAt.x + half * metersPerPixel,
    minY: room.labelAt.y - bottom * metersPerPixel,
    maxY: room.labelAt.y + top * metersPerPixel,
  }
}

/** A dimension's number anchored at `at`, drawn 5 px above it and centred. */
export function dimensionTextBox(at: Vec2, dim: Pick<Dimension, 'kind' | 'value'>, metersPerPixel: number): Box {
  const px = dim.kind === 'room' ? DIMENSION_PX.room : DIMENSION_PX.other
  const half = estimateTextWidth(dimensionText(dim.value, dim.kind), px) / 2 + PADDING_PX
  // Screen y grows down and plan y up: 5 px above the line is +5 px in the plan.
  const baseline = -DIMENSION_DY
  return {
    minX: at.x - half * metersPerPixel,
    maxX: at.x + half * metersPerPixel,
    minY: at.y + (baseline - DESCENT * px - PADDING_PX) * metersPerPixel,
    maxY: at.y + (baseline + ASCENT * px + PADDING_PX) * metersPerPixel,
  }
}

export function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

/**
 * Where to draw the number: `dim.labelAt` when it is clear, else the clear point on the
 * dimension line nearest its middle, else `null` (hide the number). A point is usable only
 * when the whole number stays within the line's two ends.
 */
export function placeDimensionLabel(dim: Dimension, blocks: readonly Box[], metersPerPixel: number): Vec2 | null {
  const clear = (at: Vec2): boolean => {
    const box = dimensionTextBox(at, dim, metersPerPixel)
    return !blocks.some((block) => overlaps(box, block))
  }
  if (clear(dim.labelAt)) return dim.labelAt

  const a = { x: dim.from.x + dim.normal.x * dim.offset, y: dim.from.y + dim.normal.y * dim.offset }
  const b = { x: dim.to.x + dim.normal.x * dim.offset, y: dim.to.y + dim.normal.y * dim.offset }
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length === 0) return null
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const box = dimensionTextBox({ x: 0, y: 0 }, dim, metersPerPixel)
  // Half the number's extent along the line: it must not run past either end.
  const reach = Math.abs(dir.x) * (box.maxX - box.minX) / 2 + Math.abs(dir.y) * (box.maxY - box.minY) / 2
  const lo = reach / length
  const hi = 1 - lo
  if (lo > hi) return null

  for (let step = 1; step <= SEARCH_STEPS; step++) {
    const delta = (step / SEARCH_STEPS) * 0.5
    for (const t of [0.5 - delta, 0.5 + delta]) {
      if (t < lo || t > hi) continue
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (clear(at)) return at
    }
  }
  return null
}

/** The box a door's leaf sweeps, hinge to open leaf. `null` for a door with no swing drawn. */
export function doorSwingBox(opening: PlanOpening, handing: DoorHanding | undefined, metersPerPixel: number): Box | null {
  if (opening.type !== 'door') return null
  // CNT-14: a door that states its kind or the part that opens keeps labels off its kind's symbol.
  if (handing?.kind !== undefined || handing?.opens !== undefined) {
    const symbol = openingSymbol(opening, handing)
    return symbol === null ? null : grow(rectOf(symbolPoints(symbol)), PADDING_PX * metersPerPixel)
  }
  const swing = doorSwing(opening, handing?.hinge, handing?.swing)
  if (!swing) return null
  const { center, radius, from } = swing.arc
  const closed = { x: Math.cos(from), y: Math.sin(from) }
  const open = { x: Math.cos(swing.arc.to), y: Math.sin(swing.arc.to) }
  const points: Vec2[] = [center, swing.leaf[1], { x: center.x + closed.x * radius, y: center.y + closed.y * radius }]
  // The swing is a quarter of a circle: it reaches farthest along an axis that lies inside it.
  const noTurn = tolerance('noArea')
  for (const axis of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
    if (axis.x * closed.x + axis.y * closed.y >= -noTurn && axis.x * open.x + axis.y * open.y >= -noTurn) {
      points.push({ x: center.x + axis.x * radius, y: center.y + axis.y * radius })
    }
  }
  return grow(rectOf(points), PADDING_PX * metersPerPixel)
}

/** A line as a thin box: the dimension lines a label keeps off. */
export function lineBox(a: Vec2, b: Vec2, metersPerPixel: number): Box {
  return grow(rectOf([a, b]), PADDING_PX * metersPerPixel)
}

/** VEW-13: a line as a thin outline a label keeps off, a pixel wide: a lift's cross. */
export function lineOutline(a: Vec2, b: Vec2, metersPerPixel: number): Vec2[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const half = (PADDING_PX * metersPerPixel) / 2
  if (!(length > 0)) return [{ x: a.x - half, y: a.y - half }, { x: a.x + half, y: a.y - half }, { x: a.x + half, y: a.y + half }, { x: a.x - half, y: a.y + half }]
  const n = { x: (-(b.y - a.y) / length) * half, y: ((b.x - a.x) / length) * half }
  return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }]
}

/**
 * VEW-13: each room's number for its keyed label: its own when the plan states one, else its
 * place on the floor, 1, 2, 3, passing over the numbers other rooms state. Repeats add a suffix.
 */
export function roomNumbers(rooms: readonly { readonly number?: string }[]): string[] {
  const stated = new Set(rooms.flatMap((room) => (room.number === undefined || room.number === '' ? [] : [room.number])))
  const used = new Set<string>()
  let next = 0
  return rooms.map((room) => {
    if (room.number !== undefined && room.number !== '') {
      const own = room.number
      let number = own
      if (used.has(own)) {
        let suffix = 2
        do number = `${own}-${suffix++}`
        while (used.has(number) || stated.has(number))
      }
      used.add(number)
      return number
    }
    do next++
    while (stated.has(String(next)))
    return String(next)
  })
}

const grow = (box: Rect, by: number): Box => ({
  minX: box.minX - by,
  minY: box.minY - by,
  maxX: box.maxX + by,
  maxY: box.maxY + by
})

/** A room to label: its outline and the two lines of its tag, as drawn. */
export interface LabelRoom {
  readonly id: string
  readonly polygon: readonly Vec2[]
  /** The room's holes (ARE-6): a label never sits in one. */
  readonly holes?: readonly (readonly Vec2[])[]
  /** Room floor left after taking out rooms inside it, outer ring first in each piece. */
  readonly labelRegions?: readonly (readonly (readonly Vec2[])[])[]
  readonly name: string
  readonly areaText: string
  /**
   * VEW-13: the room's number, its last form when nothing longer fits in it: drawn alone in the
   * room, its name then listed in the room key under the drawing. Left out, the room has none.
   */
  readonly number?: string
}

/** What a label keeps off, in plan metres. */
export interface LabelObstacles {
  /** Door swings. A label never covers one. */
  readonly swings: readonly Box[]
  /** The solid walls, one outline per piece, and whatever else a label never sits on: fixtures, a stair's flights, a lift's cross. */
  readonly walls: readonly (readonly Vec2[] | LabelOutline)[]
  /** Dimension lines and the numbers that stay put. Kept clear when there is room. */
  readonly dimensions: readonly Box[]
}

interface LabelOutline {
  readonly outline: readonly Vec2[]
  /** How far the pen projects past the outline, in metres. */
  readonly ink: number
}

/**
 * VEW-13: one way of writing a room's label. Its lines top first: the name, on one line or two,
 * then the area unless it is left out. `scale` multiplies the text sizes, `angle` turns the
 * label counterclockwise in degrees along a room, and `keyed` is the room's
 * number alone, its name in the room key.
 */
export interface LabelForm {
  readonly names: readonly string[]
  /** The area line, or null when the form leaves it out. */
  readonly area: string | null
  readonly scale: number
  readonly angle: number
  readonly keyed: boolean
}

/** How much smaller the smaller forms are: 13 px names become 10 px. */
export const SMALL_LABEL = 0.77
/** The smallest number is still eight pixels tall in the full picture. */
export const COMPACT_NUMBER = 0.62
/** How far apart two lines of one wrapped name are, in name heights. */
const NAME_LINE = 1.15

/** Where each line's baseline is, in pixels below the first's, at the form's own size. */
export function formLines(form: LabelForm): { names: number[]; area: number | null } {
  const step = NAME_LINE * ROOM_NAME_PX * form.scale
  const names = form.names.map((_, i) => i * step)
  const last = names[names.length - 1] ?? 0
  return { names, area: form.area === null ? null : last + ROOM_AREA_DY * form.scale }
}

/** Text bounds on axes along and across the label, with space for its ink. */
function baselineBox(form: LabelForm, mpp: number): Box {
  const namePx = ROOM_NAME_PX * form.scale
  const areaPx = ROOM_AREA_PX * form.scale
  const lines = formLines(form)
  const width = Math.max(...form.names.map((name) => roomTextWidth(name, namePx)), form.area === null ? 0 : roomTextWidth(form.area, areaPx))
  const top = ASCENT * namePx + PADDING_PX
  const bottom = (lines.area ?? lines.names[lines.names.length - 1] ?? 0) + DESCENT * (lines.area === null ? namePx : areaPx) + PADDING_PX
  const half = width / 2 + PADDING_PX
  return { minX: -half * mpp, maxX: half * mpp, minY: -bottom * mpp, maxY: top * mpp }
}

/** Wider glyphs and full-width text need more room than the average used for dimensions. */
function roomTextWidth(text: string, fontPx: number): number {
  let em = 0
  for (const glyph of text) {
    if (/\p{Mark}/u.test(glyph)) continue
    em += /[MWmw@%&]|[^\u0020-\u024f]/u.test(glyph) ? 1.05 : CHAR_WIDTH
  }
  return em * fontPx
}

const corners = ({ minX, maxX, minY, maxY }: Box): Vec2[] =>
  [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]

function axes(angle: number, origin: Vec2) {
  const radians = angle * Math.PI / 180
  const cos = angle === 90 ? 0 : Math.cos(radians)
  const sin = angle === 90 ? 1 : Math.sin(radians)
  return {
    toLocal: (p: Vec2): Vec2 => {
      const x = p.x - origin.x
      const y = p.y - origin.y
      return { x: x * cos + y * sin, y: -x * sin + y * cos }
    },
    toPlan: (p: Vec2): Vec2 => ({
      x: origin.x + p.x * cos - p.y * sin,
      y: origin.y + p.x * sin + p.y * cos
    })
  }
}

/** The padded label corners as drawn in plan metres. */
export function formCorners(form: LabelForm, at: Vec2, mpp: number): Vec2[] {
  return corners(baselineBox(form, mpp)).map(axes(form.angle, at).toPlan)
}

/** The box round the label in plan metres, including when its text is turned. */
export function formBox(form: LabelForm, at: Vec2, metersPerPixel: number): Box {
  return rectOf(formCorners(form, at, metersPerPixel))
}

/** The longest edge supplies a direction for an angled room, kept upright on the page. */
function roomAngle(polygon: readonly Vec2[]): number {
  let angle = 0
  let longest = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const x = polygon[i]!.x - polygon[j]!.x
    const y = polygon[i]!.y - polygon[j]!.y
    const length = Math.hypot(x, y)
    if (length <= longest) continue
    longest = length
    angle = ((Math.atan2(y, x) * 180 / Math.PI + 270) % 180) - 90
  }
  return angle
}

/** The full label first, then smaller, wrapped, name only and finally number only. */
function labelForms(name: string, areaText: string, number: string | undefined, heading: number): LabelForm[] {
  const area = areaText === '' ? null : areaText
  const angles = Math.abs(heading) > 1 && Math.abs(heading) < 89 ? [0, heading, 90] : [0, 90]
  const forms: LabelForm[] = []
  const add = (names: readonly string[], area: string | null, scale: number, keyed = false) => {
    for (const angle of angles) forms.push({ names, area, scale, angle, keyed })
  }
  add([name], area, 1)
  add([name], area, SMALL_LABEL)
  const wrapped = wrapName(name)
  if (wrapped !== null) add(wrapped, area, SMALL_LABEL)
  if (area !== null) {
    add([name], null, SMALL_LABEL)
    if (wrapped !== null) add(wrapped, null, SMALL_LABEL)
  }
  if (number !== undefined && number !== '') {
    add([number], null, 1, true)
    add([number], null, SMALL_LABEL, true)
    add([number], null, COMPACT_NUMBER, true)
  }
  return forms
}

/** A name of more than one word in two lines of about one length; null for one word. */
function wrapName(name: string): [string, string] | null {
  const words = name.split(' ')
  if (words.length < 2) return null
  let best: [string, string] | null = null
  for (let i = 1; i < words.length; i++) {
    const pair: [string, string] = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    if (best === null || Math.max(pair[0].length, pair[1].length) < Math.max(best[0].length, best[1].length)) best = pair
  }
  return best
}

export interface PlacedLabel {
  readonly id: string
  /** The centre of the first line's baseline. */
  readonly at: Vec2
  /** The text's box, for keeping dimension numbers off it. */
  readonly box: Box
  readonly form: LabelForm
}

/** How much air a label keeps round it, from other labels and door swings, in pixels. */
const CLEARANCE_PX = 1

const contains = (outer: Box, inner: Box): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY

/** Tries each form inside the room floor and current frame. A room with no clear spot has no label. */
export function placeRoomLabels(
  rooms: readonly LabelRoom[],
  obstacles: LabelObstacles,
  mpp: number,
  within?: Box
): (PlacedLabel | null)[] {
  const extent = within ?? rectOf(rooms.flatMap((room) => room.polygon))
  const cell = Math.max((extent.maxX - extent.minX) / 128, (extent.maxY - extent.minY) / 128, 32 * mpp, tolerance('joint'))

  const taken = new BoxIndex<Box>(cell)
  const swings = new BoxIndex<readonly Vec2[]>(cell)
  obstacles.swings.forEach((box) => swings.add(box, corners(box)))
  const dimensions = new BoxIndex<Box>(cell)
  obstacles.dimensions.forEach((box) => dimensions.add(box, box))
  const walls = new BoxIndex<LabelOutline>(cell)
  let widestInk = 0
  for (const wall of obstacles.walls) {
    const item = 'outline' in wall ? wall : { outline: wall, ink: 0 }
    widestInk = Math.max(widestInk, item.ink)
    walls.add(grow(rectOf(item.outline), item.ink), item)
  }

  const air = CLEARANCE_PX * mpp
  return rooms.map((room) => {
    if (room.polygon.length < 3 || !overlaps(extent, rectOf(room.polygon))) return null
    const regions = room.labelRegions ?? [[room.polygon, ...(room.holes ?? [])]]
    const directions = new Map<number, ReturnType<typeof roomLabelAxes>>()
    for (const form of labelForms(room.name, room.areaText, room.number, roomAngle(room.polygon))) {
      let direction = directions.get(form.angle)
      if (direction === undefined) {
        direction = roomLabelAxes(form.angle, room.polygon[0]!, regions, within)
        directions.set(form.angle, direction)
      }
      const { toPlan, planBox, viewed, shapes, project } = direction
      const base = baselineBox(form, mpp)
      const halfWidth = (base.maxX - base.minX) / 2
      const halfHeight = (base.maxY - base.minY) / 2
      const boundsAt = (centre: Vec2): Box => ({
        minX: centre.x - halfWidth, maxX: centre.x + halfWidth,
        minY: centre.y - halfHeight, maxY: centre.y + halfHeight,
      })
      const clear = (box: Box): boolean => {
        const plan = planBox(box)
        const padded = grow(plan, air)
        return (within === undefined || contains(within, plan)) &&
          !taken.some(padded, () => true) &&
          !swings.some(padded, (swing) => rectTouchesPolygon(grow(box, air), project(swing))) &&
          !walls.some(grow(plan, widestInk), ({ outline, ink }) => rectTouchesPolygon(ink > 0 ? grow(box, ink) : box, project(outline)))
      }
      let first: Vec2 | undefined
      let best: Vec2 | undefined
      for (const { polygon, holes } of shapes) {
        const spots = spotsInside(polygon, halfWidth, halfHeight, holes, { within: viewed, accepts: clear })
        first ??= spots[0]
        best = spots.find((spot) => !dimensions.some(planBox(boundsAt(spot)), () => true))
        if (best !== undefined) break
      }
      const centre = best ?? first
      if (centre === undefined) continue
      const at = toPlan({ x: centre.x - (base.maxX + base.minX) / 2, y: centre.y - (base.maxY + base.minY) / 2 })
      const box = planBox(boundsAt(centre))
      taken.add(box, box)
      return { id: room.id, at, box, form }
    }
    return null
  })
}

/** Use local coordinates so turns stay accurate far from the plan's origin. */
function roomLabelAxes(
  angle: number,
  origin: Vec2,
  regions: readonly (readonly (readonly Vec2[])[])[],
  within: Box | undefined
) {
  const { toLocal, toPlan } = axes(angle, origin)
  const local = new WeakMap<readonly Vec2[], Vec2[]>()
  const project = (points: readonly Vec2[]): Vec2[] => {
    let polygon = local.get(points)
    if (polygon === undefined) {
      polygon = points.map(toLocal)
      local.set(points, polygon)
    }
    return polygon
  }
  return {
    toPlan,
    project,
    planBox: angle === 0
      ? (box: Box): Box => ({
        minX: origin.x + box.minX, maxX: origin.x + box.maxX,
        minY: origin.y + box.minY, maxY: origin.y + box.maxY
      })
      : (box: Box): Box => rectOf(corners(box).map(toPlan)),
    viewed: within === undefined ? undefined : rectOf(corners(within).map(toLocal)),
    shapes: regions.map(([outer, ...holes]) => ({ polygon: project(outer!), holes: holes.map(project) }))
  }
}

/**
 * Boxes filed by the square cells of a grid they cover, so asking what is near a box looks at
 * a few cells instead of everything. A box that would cover too many cells goes in a list
 * that every question checks.
 */
class BoxIndex<T> {
  private readonly cells = new Map<string, { box: Rect; item: T }[]>()
  private readonly big: { box: Rect; item: T }[] = []
  constructor(private readonly size: number) {}

  private range(box: Rect): [number, number, number, number] {
    const s = this.size
    return [Math.floor(box.minX / s), Math.floor(box.minY / s), Math.floor(box.maxX / s), Math.floor(box.maxY / s)]
  }

  add(box: Rect, item: T): void {
    const [x0, y0, x1, y1] = this.range(box)
    const entry = { box, item }
    if (!Number.isFinite(x0 + y0 + x1 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 1024) {
      this.big.push(entry)
      return
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`
        const list = this.cells.get(key)
        if (list) list.push(entry)
        else this.cells.set(key, [entry])
      }
    }
  }

  /** Whether any item whose box overlaps `box` passes `test`. */
  some(box: Rect, test: (item: T) => boolean): boolean {
    const near = (entry: { box: Rect; item: T }): boolean => overlaps(box, entry.box) && test(entry.item)
    if (this.big.some(near)) return true
    const [x0, y0, x1, y1] = this.range(box)
    if (!Number.isFinite(x0 + y0 + x1 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 4096) {
      for (const list of this.cells.values()) if (list.some(near)) return true
      return false
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const list = this.cells.get(`${x},${y}`)
        if (list?.some(near)) return true
      }
    }
    return false
  }
}
