/**
 * A plan as a picture: one floor, drawn whole, as an SVG file.
 *
 * No browser, no running app and no stylesheet: the colours, line widths and font are written
 * on each element. The elements are the ones the app's 2D view draws for the same plan, size
 * and look (`planScene`), byte for byte; the file only adds its own `<svg>` root and a sheet
 * of paper behind them.
 *
 * Pure: no DOM, no React. For PNG, see `drawPlan` in the `ongrid` package.
 */
import { statedDisplay, type Display } from '@ongrid/floorplan/types/units'
import { say, type Language } from '@ongrid/floorplan/messages'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Bounds, Dimension, DrawingMarks, DrawingMarksAsked, PlanDrawing } from '@ongrid/floorplan/geometry'
import {
  boundsWithDimensions,
  buildDimensions,
  buildFloorPlan,
  computeBounds,
  drawingMarks,
  limit,
  marksExtent,
  floorAbove,
  openingSymbol,
  planForFloor,
  planWallMaterials,
  resolveFloor,
  tracePlacement,
  validateFloorDoorSweeps,
  withPatterns
} from '@ongrid/floorplan/geometry'
import type { TracePlacement } from '@ongrid/floorplan/geometry'
import type { DoorHanding } from '../canvas2d/doorHanding'
import type { LabelStyle } from '../canvas2d/labelPlacement'
import { doorHandingOf } from '../canvas2d/doorHanding'
import type { Viewport } from '../canvas2d/viewport'
import { fitTo, viewBoxOf } from '../canvas2d/viewport'
import type { Look, LookName, PlanLook } from './look'
import { LOOKS, detailShown, fileLook, lengthText, toLook } from './look'
import { planScene, roomKeyOf } from './scene'
import type { FaultLine, PictureKey } from './faults'
import { faultKey, faultsOnFloor } from './faults'
import { keyEntries, northArrowNode, numberedNotes, roomKeyBand, stackBands, writingBand } from './writing'
import { drawingMarkNodes } from './drawingMarks'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import type { SvgNode } from './svgNode'
import { el, toSvg } from './svgNode'
import { ENGLISH_WORDS, drawingText, saidText, wordsOf, type DrawingWords } from './words'

export interface PictureOptions {
  /** Which floor to draw. Unset, or a floor the plan does not have, means its lowest floor. */
  readonly floor?: string | null
  /** Width in pixels. 1200 by default. */
  readonly width?: number
  /**
   * Height in pixels. By default it follows the floor's shape, between 0.4 and 2.5 times the
   * width, so the plan fills the picture.
   */
  readonly height?: number
  /**
   * A named look (SHT-1): `working` (the default: the screen and every picture an agent gets),
   * `technical` (black on white with lines in millimetres on paper, for sheets and files to hand
   * on) or `dark`. `light` is the older name for `working`. Or a look, or colours, of your own.
   */
  readonly look?: LookName | 'light' | Look | PlanLook
  /**
   * N in the output scale 1:N, for a look whose lines are in millimetres on paper: its pen set
   * and its line widths follow it. Left out, it is the picture's own, each pixel a CSS pixel
   * (96 to the inch) on paper.
   */
  readonly paperScale?: number
  /** The overall and room dimensions. On by default. */
  readonly showDimensions?: boolean
  /**
   * SHT-6: each room's own width and depth (its room dimensions), when the dimensions are shown.
   * On by default; off leaves the dimensions outside the plan only.
   */
  readonly roomSizes?: boolean
  /** How the room tags read: capitals, room numbers, how the area is rounded. Plain by default. */
  readonly labels?: LabelStyle
  /**
   * The part of the floor to frame, in plan metres (VEW-6: a crop or a zoom onto one room). The
   * whole floor and its dimensions when left out. Labels and lines keep their size in pixels.
   */
  readonly frame?: Bounds
  /**
   * What went wrong (MSG-8): every line of the plan's result record (`inspectPlan` in
   * `@ongrid/rules`), in its order. The lines on the floor drawn get a numbered mark on their
   * part, with their words beside it, and are listed under the drawing by the same numbers.
   * None by default.
   */
  readonly faults?: readonly FaultLine[]
  /**
   * SHT-7: what the picture shows. Each is on by default: `title` and `key` (the plan's own, in
   * the band under the drawing; `key: true` adds a key the plan does not ask for), `notes`,
   * `sketch`, `areas`, `swings`, `warnings` (door warnings and MSG-8's marks and list) and
   * `above` (SHT-11: the dashed outline of the floor above).
   * `colourBy: 'use'` fills each room by its use, SHT-10's `colourBy: 'finish'` by its floor
   * finish (CNT-15), and either puts what each fill stands for in the key, which is then drawn
   * unless `key: false` leaves it off. So is the key of a drawing whose walls are hatched by
   * their material (SHT-10's detail, at 1:50 and larger).
   */
  readonly show?: PictureShow
  /**
   * MSG-11: the language Grid's own words on the picture are written in (its key, its list of
   * what to look at, its label), with that language's decimal mark unless the display states
   * one. The display's own language when left out (`labels.display`, else the plan's
   * `display`), else English. Room names and the plan's own words are drawn as written.
   */
  readonly language?: Language
  /**
   * LVL-9: the marks for the plan's other drawings: `section`, a section's cut line with the way it
   * looks; `elevations`, a mark outside each main side looking at the building; `levels`, each
   * room's floor level; ARE-15's `schedule`, each room's and opening's mark in the schedules, by
   * id. None by default.
   */
  readonly marks?: DrawingMarksAsked
  /**
   * HND-10 (C31): the plan's trace image, read by the caller: the picture itself, as a `data:`
   * address of a PNG or a JPEG, and its size in pixels. It is drawn on the floor it lies under,
   * where the plan places it and at its opacity, over the rooms' fills and under every line of the
   * plan, and the view frames it with the drawing. The viewer reads no file and fetches nothing. Not drawn when left out.
   */
  readonly trace?: TracePicture
}

/** HND-10: a trace image as a picture is given it: a PNG or a JPEG as a `data:` address, and its size in pixels. */
export interface TracePicture {
  readonly href: string
  readonly width: number
  readonly height: number
}

/** The only addresses a trace image is drawn from: the picture itself, never a file or the network. */
const TRACE_HREF = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/

/** SHT-7: what a picture shows. */
export interface PictureShow {
  readonly title?: boolean
  readonly key?: boolean
  readonly notes?: boolean
  readonly sketch?: boolean
  readonly areas?: boolean
  readonly swings?: boolean
  readonly warnings?: boolean
  readonly above?: boolean
  readonly colourBy?: 'use' | 'finish' | null
  /**
   * CNT-9: parts picked out, by id, each in its colour (`GROUP_COLOURS`, `HIGHLIGHT_COLOUR`), and
   * what each colour stands for in the key, which is then drawn.
   */
  readonly paint?: ReadonlyMap<string, string>
  readonly paintKey?: readonly { readonly colour: string; readonly words: string }[]
}

/** A picture before it is written out. */
export interface Picture {
  /** Size in pixels. */
  readonly width: number
  readonly height: number
  /** What part of the plan it shows, in plan metres with y down. */
  readonly view: Viewport
  readonly look: Look
  /** How many rooms it draws, for the picture's description. */
  readonly rooms: number
  /**
   * The doors it draws with the "undecided" mark, by opening id: doors whose hinge or swing the
   * plan does not state, in a look that marks them (`technical`). Empty in any other look.
   */
  readonly undecidedDoors: readonly string[]
  /**
   * The plan's elements: exactly what the app's 2D view draws inside its `<svg>`, and, when the
   * plan states its north, the north arrow in the corner of the view (CNT-3).
   */
  readonly nodes: readonly SvgNode[]
  /**
   * The key under the drawing, when the picture was given faults: `height` more pixels below
   * the plan's `height`. Null otherwise.
   */
  readonly key: PictureKey | null
  /** MSG-11: the language of its own words, for the label and the description. English when left out. */
  readonly language?: Language
  /** What the picture is, for its accessible name: a floor plan's when left out. LVL-8: a facade's; LVL-9: a section's. */
  readonly title?: string
}

/** The picture's whole height in pixels: the plan and the key under it. */
export function fullHeight(picture: Pick<Picture, 'height' | 'key'>): number {
  return picture.height + (picture.key?.height ?? 0)
}

export const DEFAULT_WIDTH = 1200
const MIN_SHAPE = 0.4
const MAX_SHAPE = 2.5

/** Which way each door of the plan opens, by opening id. */
export function handingsOf(plan: FloorPlan): Map<string, DoorHanding> {
  return new Map(plan.openings.map((opening) => [opening.id, doorHandingOf(opening)]))
}

/**
 * Doors whose swing runs into something (a wall, or another door), with what they say and
 * what they hit, and a wide door with no kind drawn as one leaf (CNT-14). The warnings that only
 * say a value is missing are left out: that door has no symbol, so there is nothing to point at.
 *
 * Only for the floor shown (QAR-7): `slice` is its `planForFloor` and `drawing` the
 * `buildFloorPlan(slice)` the view draws, so nothing is built twice and no other floor is checked.
 */
export function doorWarningsOf(
  slice: FloorPlan,
  drawing: PlanDrawing,
  words: DrawingWords = ENGLISH_WORDS
): Map<string, { messages: string[]; hits: Set<string> }> {
  const byDoor = new Map<string, { messages: string[]; hits: Set<string> }>()
  for (const issue of validateFloorDoorSweeps(slice, drawing, doorHandingOf)) {
    // CNT-14: a wide door drawn as one leaf has its arc to point at, so its question is marked too.
    if (issue.hits.length === 0 && issue.code !== 'opening/wide-single-leaf') continue
    const entry = byDoor.get(issue.id) ?? { messages: [], hits: new Set<string>() }
    // MSG-11: in the drawing's language, from the sentence's key and values.
    const message = saidText(words, issue.message, issue.said)
    if (!entry.messages.includes(message)) entry.messages.push(message)
    issue.hits.forEach((id) => entry.hits.add(id))
    byDoor.set(issue.id, entry)
  }
  return byDoor
}

/** What a door's warning mark says: all its messages, in one line. */
export function warningMessages(
  warnings: ReadonlyMap<string, { readonly messages: readonly string[] }>
): Map<string, string> {
  return new Map([...warnings].map(([id, { messages }]) => [id, messages.join(' ')]))
}

function undecidedIn(drawing: PlanDrawing, handings: ReadonlyMap<string, DoorHanding>): string[] {
  // CNT-14: a door whose kind slides, rolls or lifts is drawn from its kind and is never undecided.
  return drawing.openings.filter((o) => o.type === 'door' && openingSymbol(o, handings.get(o.id)) === null).map((o) => o.id)
}

/**
 * The doors on a floor whose hinge or swing the plan does not state, by opening id: the ones a
 * look that marks them (`technical`) draws as undecided. Unset, or a floor the plan does not
 * have, means its lowest floor.
 */
export function undecidedDoorsOf(plan: FloorPlan, floor?: string | null): string[] {
  const slice = planForFloor(withPatterns(plan), resolveFloor(plan, floor))
  return undecidedIn(buildFloorPlan(slice), handingsOf(slice))
}

/** What a plan view frames: the drawing and its dimensions, which sit outside the walls. */
export function framingOf(drawing: PlanDrawing, dimensions: readonly Dimension[]): Bounds {
  return boundsWithDimensions(drawing, dimensions)
}

/**
 * SHT-10: the look a picture written to a file or handed to an agent is drawn in: the one asked
 * for, on light paper whatever the screen's theme (`fileLook`): `dark` draws the working look.
 */
export function fileLookOf(look: PictureOptions['look']): Look {
  return fileLook(lookOf(look))
}

/** The look a picture is drawn in. */
export function lookOf(look: PictureOptions['look']): Look {
  if (look === undefined || look === 'light') return LOOKS.working
  if (typeof look === 'string') {
    const named = LOOKS[look]
    if (!named) throw new RangeError(`Grid has no look called ${JSON.stringify(look)}: use working, technical or dark`)
    return named
  }
  return toLook(look)
}

function paperScaleOption(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`The paper scale is N in 1:N, a number above 0: got ${value}`)
  return value
}

function pixels(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`The picture's ${name} must be a whole number of pixels, at least 1: got ${value}`)
  }
  return value
}

/** The size of the picture: as asked, or a width with a height that follows the plan. */
function sizeOf(framed: Bounds, options: PictureOptions): { width: number; height: number } {
  const width = pixels('width', options.width ?? DEFAULT_WIDTH)
  if (options.height !== undefined) return { width, height: pixels('height', options.height) }
  const shape = framed.width > 0 && framed.height > 0 ? framed.height / framed.width : 0.75
  const clamped = Math.min(Math.max(shape, MIN_SHAPE), MAX_SHAPE)
  return { width, height: Math.max(1, Math.round(width * clamped)) }
}

function framePicture(plan: FloorPlan, options: PictureOptions) {
  const floor = resolveFloor(plan, options.floor)
  // LVL-8: a plan's opening patterns are drawn as the plain openings they expand into.
  const slice = planForFloor(withPatterns(plan), floor)
  const drawing = buildFloorPlan(slice)
  const dimensions = options.showDimensions === false ? [] : buildDimensions(drawing, { rooms: options.roomSizes !== false })
  const around = framingOf(drawing, dimensions)
  // LVL-9: the marks stand outside the drawing and its dimensions, and the view frames them too.
  const marks = marksOf(plan, floor, drawing, around, options.marks)
  // HND-10: the trace image under this floor, framed with the drawing so a floor not yet traced shows it whole.
  const trace = traceOf(plan, floor, options.trace)
  const drawn = marks === null ? around : withMarks(around, marks)
  const framed = options.frame ?? (trace === null ? drawn : withTrace(drawn, trace.placement, drawing.walls.length + drawing.rooms.length > 0))
  const { width, height } = sizeOf(framed, options)
  return { floor, slice, drawing, dimensions, marks, trace, width, height, view: fitTo(framed, width / height) }
}

/** HND-10: the plan's trace image placed under `floor`, or null when it lies under another or none is given. */
function traceOf(plan: FloorPlan, floor: string, given: TracePicture | undefined): { placement: TracePlacement; picture: TracePicture; opacity: number } | null {
  const image = plan.referenceImage
  if (given === undefined || image === undefined) return null
  if (!TRACE_HREF.test(given.href)) throw new RangeError('A trace image is drawn from a PNG or a JPEG given as a data: address, never from a file or the network')
  const placement = tracePlacement(plan, given)
  if (placement === null || placement.floor !== floor) return null
  return { placement, picture: given, opacity: image.opacity }
}

/** The frame round the drawing and the trace image's corners; the image alone on a floor with nothing drawn yet. */
function withTrace(around: Bounds, placement: TracePlacement, drawn: boolean): Bounds {
  return computeBounds(drawn ? [around.min, around.max, ...placement.corners] : [...placement.corners])
}

/** HND-10: the trace image, drawn under every line of the plan. */
function traceNode(trace: { placement: TracePlacement; picture: TracePicture; opacity: number }): SvgNode {
  // To ten figures: a picture's corner far from the origin must not move by a rounding.
  const matrix = trace.placement.matrix.map((n) => String(Number(n.toPrecision(10)))).join(' ')
  return el('image', {
    'data-part': 'trace-image',
    href: trace.picture.href,
    x: 0,
    y: 0,
    width: trace.picture.width,
    height: trace.picture.height,
    preserveAspectRatio: 'none',
    opacity: lengthText(trace.opacity),
    transform: `matrix(${matrix})`
  })
}

function marksOf(plan: FloorPlan, floor: string, drawing: PlanDrawing, around: Bounds, asked: DrawingMarksAsked | undefined): DrawingMarks | null {
  if (asked === undefined || (asked.section == null && asked.elevations !== true && asked.levels !== true && asked.schedule == null)) return null
  return drawingMarks(plan, floor, drawing, around, asked)
}

/** The frame round the drawing and its marks, with half a mark's distance round each, for its symbol. */
function withMarks(around: Bounds, marks: DrawingMarks): Bounds {
  const reach = limit('elevationMarkOffset') / 2
  const points = marksExtent(marks).flatMap((p) => [
    { x: p.x - reach, y: p.y - reach },
    { x: p.x + reach, y: p.y + reach }
  ])
  return computeBounds([around.min, around.max, ...points])
}

/**
 * SHT-6: the part of the plan a picture with these options frames before its margin, in plan
 * metres with y up: the drawing, its dimensions and its marks, or `frame` when it is given. A
 * sheet at a true scale sizes its picture from it.
 */
export function pictureFrame(plan: FloorPlan, options: PictureOptions = {}): Bounds {
  const { drawing, dimensions, marks } = framePicture(plan, options)
  const around = framingOf(drawing, dimensions)
  return options.frame ?? (marks === null ? around : withMarks(around, marks))
}

/**
 * The size of the picture `planPicture` makes with these options, and the part of the plan it
 * shows, without drawing it: no labels are placed, so it is quick on a large plan.
 */
export function pictureView(plan: FloorPlan, options: PictureOptions = {}): Pick<Picture, 'width' | 'height' | 'view'> {
  const { width, height, view } = framePicture(plan, options)
  return { width, height, view }
}

/**
 * WRT-7, MSG-11: the display a picture's labels are written in: the call's, else the plan's own,
 * with the language asked for. A language asked for on a plan with no display gets that
 * language's own (a decimal comma for Spanish). Undefined for plain metres in English.
 */
export function displayOfPicture(plan: FloorPlan, options: PictureOptions): Display | undefined {
  const asked = options.language
  const own = options.labels?.display
  if (own !== undefined) return asked === undefined ? own : { ...own, language: asked }
  if (plan.display === undefined && (asked === undefined || asked === 'en')) return undefined
  return statedDisplay({ ...(plan.display ?? {}), ...(asked === undefined ? {} : { language: asked }) })
}

/** Lays out one floor of a plan as a picture, framed the way the 2D view frames it. */
export function planPicture(plan: FloorPlan, options: PictureOptions = {}): Picture {
  const { floor, slice, drawing, dimensions, marks, trace, width, height, view } = framePicture(plan, options)
  const display = displayOfPicture(plan, options)
  const words = wordsOf(display)
  const look = lookOf(options.look)
  const all = options.faults ?? []
  const faults = faultsOnFloor(all, floor, new Map(slice.openings.map((opening) => [opening.id, opening.wall])))
  const handings = handingsOf(slice)
  const show = options.show ?? {}
  const on = (part: Exclude<keyof PictureShow, 'colourBy' | 'key' | 'paint' | 'paintKey'>): boolean => show[part] !== false
  const uses = new Map(slice.rooms.flatMap((room) => (room.use === undefined ? [] : [[room.id, room.use] as const])))
  // SHT-10: each room's floor finish, and the plan's finishes in the order its rooms first name
  // them, so a finish keeps its tint on every floor; the plan's wall materials, for their hatch.
  const finishOrder = [...new Set(plan.rooms.flatMap((room) => (room.finishes?.floor === undefined ? [] : [room.finishes.floor])))]
  const finishes = { rooms: new Map(slice.rooms.flatMap((room) => (room.finishes?.floor === undefined ? [] : [[room.id, room.finishes.floor] as const]))), order: finishOrder }
  const materials = planWallMaterials(plan)
  const mpp = view.width / width
  // SHT-11: the floor above, worked out only when it is shown.
  const above = on('above') ? floorAbove(slice) : undefined
  const scene = planScene({
    drawing,
    handings,
    doorWarnings: warningMessages(doorWarningsOf(slice, drawing, words)),
    dimensions,
    metersPerPixel: mpp,
    look,
    ...(options.paperScale === undefined ? {} : { paperScale: paperScaleOption(options.paperScale) }),
    // WRT-7: the labels and dimensions are in the call's display, else the plan's own.
    labels: display === undefined ? options.labels : { ...options.labels, display },
    faults,
    uses,
    finishes,
    materials,
    ...(above === undefined ? {} : { above }),
    // ARE-15: the schedules' marks go by the room labels, which the scene places.
    ...(marks === null || marks.schedule.length === 0 ? {} : { scheduleMarks: marks.schedule }),
    show: {
      notes: on('notes'),
      sketch: on('sketch'),
      areas: on('areas'),
      swings: on('swings'),
      warnings: on('warnings'),
      above: on('above'),
      colourBy: show.colourBy ?? null,
      paint: show.paint ?? null
    }
  })
  // CNT-3: a plan that states its north gets a north arrow in the corner of the view.
  const withMarkNodes = marks === null ? scene : [...scene, ...drawingMarkNodes(marks, look, view.width / width, options.paperScale, words)]
  const withNorth = drawing.north === null ? withMarkNodes : [...withMarkNodes, northArrowNode(drawing.north, view, view.width / width, look.colors)]
  // HND-10: the trace image over the rooms' fills, which would hide it, and under every line the
  // plan draws: walls, openings, dimensions and labels.
  const fills = withNorth.findIndex((node) => node.attrs['data-part'] !== 'room')
  const at = fills < 0 ? withNorth.length : fills
  const nodes = trace === null ? withNorth : [...withNorth.slice(0, at), traceNode(trace), ...withNorth.slice(at)]
  // SHT-7: the title and the key in a band under the drawing, then what went wrong (MSG-8).
  const title = on('title') ? (plan.title ?? null) : null
  const painted = show.paintKey ?? []
  // CNT-10: a drawing of work keys its phases unless the key is turned off.
  const shownUses = show.colourBy === 'use' ? ROOM_USES.filter((use) => drawing.rooms.some((room) => uses.get(room.id) === use)) : []
  // SHT-10: the floor finishes tinted on this floor, and the materials hatched on it.
  const tinted = look.tints.finishes
  const shownFinishes = show.colourBy === 'finish' && tinted.length > 0 ? finishOrder.filter((finish) => drawing.rooms.some((room) => finishes.rooms.get(room.id) === finish)).map((finish) => ({ finish, colour: tinted[finishOrder.indexOf(finish) % tinted.length]! })) : []
  const detail = detailShown(look, mpp, options.paperScale) ? look.detail : null
  const shownMaterials =
    detail === null || detail.hatches.length === 0
      ? []
      : materials.filter((material) => drawing.walls.some((wall) => !wall.virtual && wall.phase !== 'demolished' && wall.material === material)).map((material) => ({ material, angles: detail.hatches[materials.indexOf(material) % detail.hatches.length]!, ink: look.ink }))
  // CNT-10: a drawing of work keys its phases unless the key is turned off. SHT-10: so does one
  // whose colours or hatches carry a meaning of the plan's own: its rooms tinted, its walls hatched.
  const keyed = show.key === true || (show.key !== false && (painted.length > 0 || drawing.notes.some((note) => note.kind === 'key') || drawing.walls.some((wall) => wall.phase !== undefined) || shownUses.length > 0 || shownFinishes.length > 0 || shownMaterials.length > 0))
  const marked = on('warnings') && faults.length > 0
  const entries = keyed ? keyEntries(drawing, look.colors, { swings: on('swings'), sketch: on('sketch'), uses: shownUses, marks: marked, above: (above?.lines.length ?? 0) > 0, painted, phases: look.phases, walls: look.walls.fill, useFills: look.tints.uses, finishes: shownFinishes, materials: shownMaterials }, words) : []
  // VEW-17: a note's words are in the band, numbered; its mark on the plan carries the number.
  const noteWords = on('notes') ? numberedNotes(drawing.notes).map((note) => note.text ?? '') : []
  const writing = writingBand(title, entries, width, look.colors, words, noteWords)
  const listed = options.faults === undefined || !on('warnings') ? null : faultKey(faults, all.length - faults.length, width, look.colors, words)
  // VEW-13: the rooms written as their numbers, and their names, unless the key is turned off.
  const rooms = show.key === false ? null : roomKeyBand(roomKeyOf(scene), width, look.colors, words)
  const key = stackBands(stackBands(writing, rooms), listed)
  const undecidedDoors = look.undecidedDoors ? undecidedIn(drawing, handings) : []
  const picture: Picture = { width, height, view, look, rooms: drawing.rooms.length, undecidedDoors, nodes, key }
  return words.language === 'en' ? picture : { ...picture, language: words.language }
}

/** How a picture is written as a file. */
export interface PictureFileOptions {
  /**
   * MSG-3: the label "General guidance, not your local rules" in the top-left corner. On by
   * default; off only where the page round the picture carries it already (a sheet).
   */
  readonly label?: boolean
}

/** The label's text size in pixels, as a dimension's. */
const LABEL_PX = 11

/**
 * VEW-17: the height of the caption band the label is written in, under the drawing and its key,
 * in pixels. A picture's file is this much taller than `fullHeight` when it carries the label.
 */
export const CAPTION_PX = LABEL_PX + 15

/** The picture's file height in pixels: the drawing, its key and, with the label (the default), the caption band. */
export function fileHeight(picture: Pick<Picture, 'height' | 'key'>, label = true): number {
  return fullHeight(picture) + (label ? CAPTION_PX : 0)
}

/**
 * The label in a caption band of its own under everything else, in pixels from the band's
 * top-left corner, so it never covers a drawn part. The paper is the band's own.
 */
function captionNode(look: Look, language: Language, y: number): SvgNode {
  return el('g', { 'data-part': 'guidance-label', transform: `translate(0 ${lengthText(y)})` }, [
    el('text', { x: 16, y: LABEL_PX + 8, fill: look.colors.labelSoft, 'font-family': look.colors.font, 'font-size': LABEL_PX }, [say(language, 'label')])
  ])
}

/**
 * The picture as an SVG file. `scale` multiplies its size in pixels and nothing else: the
 * drawing is the same, only finer. It carries the label in a caption band under the drawing (MSG-3, VEW-17).
 */
export function pictureToSvg(picture: Picture, scale = 1, options: PictureFileOptions = {}): string {
  const { view, look, key } = picture
  const stamp = options.label !== false
  const language = picture.language ?? 'en'
  const words = { ...ENGLISH_WORDS, language }
  if (key || stamp) {
    // The plan in its own frame at the top, in plan metres; the key under it, then the caption, in pixels.
    const total = fileHeight(picture, stamp)
    const plan = el(
      'svg',
      { x: 0, y: 0, width: picture.width, height: picture.height, viewBox: viewBoxOf(view), preserveAspectRatio: 'xMidYMid meet' },
      picture.nodes
    )
    const root = el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: Math.round(picture.width * scale),
        height: Math.round(total * scale),
        viewBox: `0 0 ${picture.width} ${total}`,
        role: 'img',
        'aria-label': key
          ? picture.title === undefined
            ? drawingText(words, 'drawing.picture.keyed', { count: picture.rooms })
            : drawingText(words, 'drawing.picture.titled.keyed', { title: picture.title })
          : (picture.title ?? drawingText(words, 'drawing.picture', { count: picture.rooms }))
      },
      [
        el('rect', { 'data-part': 'paper', x: 0, y: 0, width: picture.width, height: total, fill: look.colors.paper }),
        plan,
        ...(key ? [el('g', { 'data-part': 'key', transform: `translate(0 ${picture.height})` }, key.nodes)] : []),
        // In this frame a unit is a pixel already.
        ...(stamp ? [captionNode(look, language, fullHeight(picture))] : [])
      ]
    )
    return `${toSvg(root)}\n`
  }
  const paper = el('rect', {
    'data-part': 'paper',
    x: view.x,
    y: view.y,
    width: view.width,
    height: view.height,
    fill: look.colors.paper
  })
  const root = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: Math.round(picture.width * scale),
      height: Math.round(picture.height * scale),
      viewBox: viewBoxOf(view),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': picture.title ?? drawingText(words, 'drawing.picture', { count: picture.rooms })
    },
    [paper, ...picture.nodes]
  )
  return `${toSvg(root)}\n`
}

/**
 * One floor of a plan as an SVG file, with its colours, line widths and font written in.
 *
 * ```ts
 * const svg = planToSvg(plan, { floor: 'ground', width: 1600 })
 * ```
 */
export function planToSvg(plan: FloorPlan, options: PictureOptions = {}): string {
  return pictureToSvg(planPicture(plan, options))
}
