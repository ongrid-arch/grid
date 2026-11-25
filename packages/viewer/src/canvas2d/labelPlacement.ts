/**
 * Where room labels go, and keeps dimension numbers off them.
 *
 * Each room's name and area sit at a spot inside the room where the whole label fits, clear
 * of door swings, walls, other labels and, when there is room, dimension lines. The spots come
 * from the geometry core (`spotsInside`): the room's pole of inaccessibility first, then the
 * rest of the room, deepest first. VEW-13: a label that does not fit is turned, made smaller,
 * wrapped, shortened to the name, then to the room's number (`labelForms`), still in its room.
 * Only a room none of whose forms fits moves its label out, a short way, off every room, and
 * a leader line that crosses no other room ties it to the room's pole (`placeRoomLabels`).
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
import { areaText, doorSwing, metresText, openingSymbol, pointInPolygon, poleOfInaccessibility, rectOf, rectTouchesPolygon, spotsInside, symbolPoints, tolerance } from '@ongrid/floorplan/geometry'
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
export function dimensionText(value: number): string {
  if (drawingDisplay !== null) return showLength(value, drawingDisplay, { unit: false })
  return metresText(value)
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
  const width = Math.max(estimateTextWidth(room.name, ROOM_NAME_PX), estimateTextWidth(area, ROOM_AREA_PX))
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
  const half = estimateTextWidth(dimensionText(dim.value), px) / 2 + PADDING_PX
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
 * place on the floor, 1, 2, 3, passing over the numbers other rooms state.
 */
export function roomNumbers(rooms: readonly { readonly number?: string }[]): string[] {
  const stated = new Set(rooms.flatMap((room) => (room.number === undefined || room.number === '' ? [] : [room.number])))
  let next = 0
  return rooms.map((room) => {
    if (room.number !== undefined && room.number !== '') return room.number
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
  readonly walls: readonly (readonly Vec2[])[]
  /** Dimension lines and the numbers that stay put. Kept clear when there is room. */
  readonly dimensions: readonly Box[]
}

/**
 * VEW-13: one way of writing a room's label. Its lines top first: the name, on one line or two,
 * then the area unless it is left out. `scale` multiplies the label's text sizes; `turned` is a
 * quarter turn, so it reads from the bottom up, along a long narrow room; `keyed` is the room's
 * number alone, its name in the room key.
 */
export interface LabelForm {
  readonly names: readonly string[]
  /** The area line, or null when the form leaves it out. */
  readonly area: string | null
  readonly scale: number
  readonly turned: boolean
  readonly keyed: boolean
}

/** How much smaller the smaller forms are: 13 px names become 10 px. */
export const SMALL_LABEL = 0.77
/** How far apart two lines of one wrapped name are, in name heights. */
const NAME_LINE = 1.15

/** Where each line's baseline is, in pixels below the first's, at the form's own size. */
export function formLines(form: LabelForm): { names: number[]; area: number | null } {
  const step = NAME_LINE * ROOM_NAME_PX * form.scale
  const names = form.names.map((_, i) => i * step)
  const last = names[names.length - 1] ?? 0
  return { names, area: form.area === null ? null : last + ROOM_AREA_DY * form.scale }
}

/**
 * A form's box drawn at `at`, the centre of the first line's baseline, in plan metres (y up).
 * The plain form's box is `roomLabelBox`'s. A turned form turns the box a quarter round `at`.
 */
export function formBox(form: LabelForm, at: Vec2, metersPerPixel: number): Box {
  const namePx = ROOM_NAME_PX * form.scale
  const areaPx = ROOM_AREA_PX * form.scale
  const lines = formLines(form)
  const width = Math.max(...form.names.map((name) => estimateTextWidth(name, namePx)), form.area === null ? 0 : estimateTextWidth(form.area, areaPx))
  const top = ASCENT * namePx + PADDING_PX
  const bottom = (lines.area ?? lines.names[lines.names.length - 1] ?? 0) + DESCENT * (lines.area === null ? namePx : areaPx) + PADDING_PX
  const half = width / 2 + PADDING_PX
  const m = metersPerPixel
  // Turned a quarter anticlockwise: the text's up is the plan's -x, its right the plan's +y.
  if (form.turned) return { minX: at.x - top * m, maxX: at.x + bottom * m, minY: at.y - half * m, maxY: at.y + half * m }
  return { minX: at.x - half * m, maxX: at.x + half * m, minY: at.y - bottom * m, maxY: at.y + top * m }
}

/**
 * The forms a room's label is tried in, in order: whole and upright, turned, smaller, the name
 * wrapped on two lines, the name without its area, and last the room's number.
 */
export function labelForms(name: string, areaText: string, number?: string): LabelForm[] {
  const area = areaText === '' ? null : areaText
  // The plain form keeps an area line even when it is empty, as it always has.
  const forms: LabelForm[] = [{ names: [name], area: areaText, scale: 1, turned: false, keyed: false }]
  const both = (names: readonly string[], withArea: string | null, scale: number) => {
    for (const turned of [false, true]) forms.push({ names, area: withArea, scale, turned, keyed: false })
  }
  forms.push({ names: [name], area: areaText, scale: 1, turned: true, keyed: false })
  both([name], area, SMALL_LABEL)
  const wrapped = wrapName(name)
  if (wrapped !== null) both(wrapped, area, SMALL_LABEL)
  if (area !== null) {
    both([name], null, SMALL_LABEL)
    if (wrapped !== null) both(wrapped, null, SMALL_LABEL)
  }
  if (number !== undefined && number !== '') {
    forms.push({ names: [number], area: null, scale: 1, turned: false, keyed: true })
    forms.push({ names: [number], area: null, scale: SMALL_LABEL, turned: false, keyed: true })
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
  /** The point of the room the label names: inside the room, where the text or its leader starts. */
  readonly anchor: Vec2
  /** Where the text goes: the centre of the name's baseline. */
  readonly at: Vec2
  /** The text's box, for keeping dimension numbers off it. */
  readonly box: Box
  /** From the anchor to the moved label's edge, when the label did not fit in its room. */
  readonly leader: readonly [Vec2, Vec2] | null
  /** VEW-13: how the label is written. */
  readonly form: LabelForm
}

/** How much air a label keeps round it, from other labels and door swings, in pixels. */
const CLEARANCE_PX = 1
/** How far a moved label keeps from its room, in pixels. */
const LEADER_GAP_PX = 10
/** VEW-13: how far from its room's box a moved label may go, at most, in pixels: a short leader. */
export const LEADER_REACH_PX = 48
/** How many rings of spots round a room a moved label tries, at most. */
const MAX_RINGS = 48
/** How many spots each ring has, at most. */
const RING_SPOTS = 256

/**
 * Where every room's label goes, in the order of `rooms`: `null` for a room whose label has
 * nowhere clear to go at this zoom, which is then not drawn, like a dimension number with no
 * clear spot. Zooming in gives it room.
 *
 * VEW-13: a label stays in its room. Each room tries its forms in turn (`labelForms`), each
 * clear of the labels before it, door swings and walls, and of dimensions when it can. Only a
 * room none of whose forms fits moves its label out, whole or as its number: to a spot off
 * every room and every wall, at most `LEADER_REACH_PX` from the room and never past `within`,
 * on a leader from the room's pole that crosses no other room. No label is ever put on a door
 * swing, another label or another room.
 */
export function placeRoomLabels(
  rooms: readonly LabelRoom[],
  obstacles: LabelObstacles,
  metersPerPixel: number,
  /** Where a moved label must stay: the part of the plan a framed view always shows. */
  within?: Box
): (PlacedLabel | null)[] {
  const mpp = metersPerPixel
  const forms = rooms.map((room) => labelForms(room.name, room.areaText, room.number))
  const extent = rectOf(rooms.flatMap((room) => room.polygon))
  const first = forms.map((list) => formShape(list[0]!, mpp))
  const cell = Math.max(
    (extent.maxX - extent.minX) / 128,
    (extent.maxY - extent.minY) / 128,
    ...first.map((size) => 2 * size.halfHeight),
    tolerance('joint')
  )

  const taken = new BoxIndex<Box>(cell)
  const swings = new BoxIndex<Box>(cell)
  obstacles.swings.forEach((box) => swings.add(box, box))
  const dimensions = new BoxIndex<Box>(cell)
  obstacles.dimensions.forEach((box) => dimensions.add(box, box))
  const walls = new BoxIndex<readonly Vec2[]>(cell)
  obstacles.walls.forEach((outline) => walls.add(rectOf(outline), outline))
  const outlines = new BoxIndex<{ readonly index: number; readonly polygon: readonly Vec2[] }>(cell)
  rooms.forEach((room, index) => outlines.add(rectOf(room.polygon), { index, polygon: room.polygon }))

  const boxHit = (box: Box) => (other: Box) => overlaps(box, other)
  const shapeHit = (box: Box) => (outline: readonly Vec2[]) => rectTouchesPolygon(box, outline)
  // A pixel of air round each label, so two never touch and rounding cannot make them meet.
  const air = CLEARANCE_PX * mpp
  const free = (box: Box): boolean => {
    const wide = grow(box, air)
    return !taken.some(wide, boxHit(wide)) && !swings.some(wide, boxHit(wide))
  }
  const offWalls = (box: Box): boolean => !walls.some(box, shapeHit(box))
  const offRooms = (box: Box): boolean => !outlines.some(box, (room) => rectTouchesPolygon(box, room.polygon))
  const offDimensions = (box: Box): boolean => !dimensions.some(box, boxHit(box))
  /** Whether a leader from `a` to `b` runs through, or touches, a room other than room `own`. */
  const crossesRoom = (a: Vec2, b: Vec2, own: number): boolean =>
    outlines.some(rectOf([a, b]), (room) => room.index !== own && segmentTouchesPolygon(a, b, room.polygon))

  const placed: (PlacedLabel | null)[] = rooms.map(() => null)
  const late: number[] = []

  rooms.forEach((room, i) => {
    const box0 = rectOf(room.polygon)
    for (const form of forms[i]!) {
      const size = formShape(form, mpp)
      // A form wider or taller than the room's own box fits nowhere in it.
      if (2 * size.halfWidth > box0.maxX - box0.minX || 2 * size.halfHeight > box0.maxY - box0.minY) continue
      const spots = spotsInside(room.polygon, size.halfWidth, size.halfHeight, room.holes)
      if (spots.length === 0) continue
      let centre: Vec2 | undefined
      for (const ok of [(box: Box) => free(box) && offWalls(box) && offDimensions(box), (box: Box) => free(box) && offWalls(box)]) {
        centre = spots.find((spot) => ok(size.boxAt(spot)))
        if (centre) break
      }
      if (!centre) continue
      const box = size.boxAt(centre)
      placed[i] = { id: room.id, anchor: size.atOf(centre), at: size.atOf(centre), box, leader: null, form }
      taken.add(box, box)
      return
    }
    late.push(i)
  })

  for (const i of late) {
    const room = rooms[i]!
    const anchor = poleOfInaccessibility(room.polygon, undefined, room.holes).point
    const own = rectOf(room.polygon)
    const reach = LEADER_REACH_PX * mpp
    const moved = [forms[i]![0]!, ...forms[i]!.filter((form) => form.keyed).slice(0, 1)]
    for (const form of moved) {
      const size = formShape(form, mpp)
      const spots = spotsAround(own, extent, anchor, size, LEADER_GAP_PX * mpp, 2 * air, reach).filter(
        (spot) => !within || contains(within, size.boxAt(spot))
      )
      const fine = (spot: Vec2, ok: (box: Box) => boolean): boolean => {
        const box = size.boxAt(spot)
        return ok(box) && !crossesRoom(anchor, nearestOnBox(anchor, box), i)
      }
      let centre: Vec2 | undefined
      for (const ok of [
        (box: Box) => free(box) && offRooms(box) && offWalls(box) && offDimensions(box),
        (box: Box) => free(box) && offRooms(box) && offWalls(box)
      ]) {
        centre = spots.find((spot) => fine(spot, ok))
        if (centre) break
      }
      if (!centre) continue
      const box = size.boxAt(centre)
      placed[i] = { id: room.id, anchor, at: size.atOf(centre), box, leader: [anchor, nearestOnBox(anchor, box)], form }
      taken.add(box, box)
      break
    }
  }

  return placed
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

/** A form's size in metres, and the way between its box's centre and where its text goes. */
function formShape(form: LabelForm, mpp: number) {
  const box = formBox(form, { x: 0, y: 0 }, mpp)
  const halfWidth = (box.maxX - box.minX) / 2
  const halfHeight = (box.maxY - box.minY) / 2
  // The text's first baseline sits this far from the box's centre.
  const shift = { x: (box.maxX + box.minX) / 2, y: (box.maxY + box.minY) / 2 }
  return {
    halfWidth,
    halfHeight,
    atOf: (centre: Vec2): Vec2 => ({ x: centre.x - shift.x, y: centre.y - shift.y }),
    boxAt: (centre: Vec2): Box => ({
      minX: centre.x - halfWidth,
      maxX: centre.x + halfWidth,
      minY: centre.y - halfHeight,
      maxY: centre.y + halfHeight
    })
  }
}

/**
 * Spots for a label's centre on rings round the room's box, the nearest to `anchor` first.
 * The first rings are one label height apart and later ones farther, until they clear the
 * whole drawing (`extent`), go past `reach` or `MAX_RINGS` is reached.
 */
function spotsAround(
  room: Rect,
  extent: Rect,
  anchor: Vec2,
  size: { halfWidth: number; halfHeight: number },
  gap: number,
  air: number,
  /** VEW-13: how far out the rings may go, at most. */
  reach: number
): Vec2[] {
  const step = Math.max(2 * size.halfHeight + air, gap)
  if (!(step > 0) || !Number.isFinite(step)) return []
  // How far out a ring must go to leave the drawing on every side.
  const clear = Math.max(room.minX - extent.minX, extent.maxX - room.maxX, room.minY - extent.minY, extent.maxY - room.maxY, 0)
  const spots: { at: Vec2; far: number }[] = []
  let out = gap
  for (let k = 0; k < MAX_RINGS && out <= reach; k++) {
    const minX = room.minX - size.halfWidth - out
    const maxX = room.maxX + size.halfWidth + out
    const minY = room.minY - size.halfHeight - out
    const maxY = room.maxY + size.halfHeight + out
    const w = maxX - minX
    const h = maxY - minY
    const perimeter = 2 * (w + h)
    const count = Math.max(8, Math.min(RING_SPOTS, Math.ceil(perimeter / step)))
    for (let n = 0; n < count; n++) {
      // Walk the ring from its bottom-left corner, anticlockwise.
      let d = (perimeter * n) / count
      let at: Vec2
      if (d < w) at = { x: minX + d, y: minY }
      else if ((d -= w) < h) at = { x: maxX, y: minY + d }
      else if ((d -= h) < w) at = { x: maxX - d, y: maxY }
      else at = { x: minX, y: maxY - (d - w) }
      spots.push({ at, far: Math.hypot(at.x - anchor.x, at.y - anchor.y) })
    }
    if (out > clear + step) break
    out += step * (1 + Math.floor(k / 8))
  }
  spots.sort((a, b) => a.far - b.far)
  return spots.map((spot) => spot.at)
}

/** Whether the segment from `a` to `b` has a point in the outline or on its edge. */
function segmentTouchesPolygon(a: Vec2, b: Vec2, polygon: readonly Vec2[]): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true
  const side = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const within = (p: Vec2, q: Vec2, r: Vec2): boolean =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y)
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const c = polygon[j]!
    const d = polygon[i]!
    const d1 = side(c, d, a)
    const d2 = side(c, d, b)
    const d3 = side(a, b, c)
    const d4 = side(a, b, d)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
    if ((d1 === 0 && within(c, d, a)) || (d2 === 0 && within(c, d, b)) || (d3 === 0 && within(a, b, c)) || (d4 === 0 && within(a, b, d))) return true
  }
  return false
}

const contains = (outer: Box, inner: Box): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY

function nearestOnBox(p: Vec2, box: Box): Vec2 {
  return { x: Math.min(Math.max(p.x, box.minX), box.maxX), y: Math.min(Math.max(p.y, box.minY), box.maxY) }
}
