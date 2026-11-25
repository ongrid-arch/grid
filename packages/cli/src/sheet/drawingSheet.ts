/**
 * SHT-6: one printable sheet at a true scale. One floor of the plan, in the technical look
 * (SHT-1), drawn at 1:N on a chosen paper (A4 to A0) with a scale bar, a caption (what it is,
 * which floor, the scale), north, a title block (project, drawing, scale, date, status) and the
 * label "General guidance, not your local rules". Text is sized in millimetres on the paper:
 * notes 2.5 mm, titles 5 to 6 mm.
 *
 * The sheet is laid out in paper millimetres as SVG elements (`DrawingSheet.nodes`), the one
 * source of all three files: the SVG writes them out, the PDF draws them as paths and text
 * (`vector.ts`), and the PNG draws them the same way onto a canvas. The floor is the same
 * picture `grid draw --look technical` makes (`planPicture`), nested at its true size: its view
 * in plan metres becomes `view × 1000 / N` millimetres on the paper. Its lines are in paper
 * millimetres already (the look's pen set for 1:N), and its labels in pixels, which the sheet
 * sizes so that a dimension's figure prints at 2.5 mm (`PIXEL_MM`).
 */
import { buildFloorPlan, computeBounds, planFloors, planForFloor, resolveFloor, withPatterns, type Bounds } from '@ongrid/floorplan/geometry'
import { decimalFor, DEFAULT_LANGUAGE, say, type Language } from '@ongrid/floorplan/messages'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { FRAME_MARGIN, viewBoxOf } from '@ongrid/viewer/src/canvas2d/viewport'
import { pictureFrame, planPicture, undecidedDoorsOf, type Picture, type PictureOptions } from '@ongrid/viewer/src/picture'
import { el, toSvg, type SvgChild, type SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { TEXT_PX } from '@ongrid/viewer/src/picture/look'
import type { LoadedPlan } from '../command/plan'
import { planFacts } from '../describe/facts'
import { notShownNote } from './limits'
import { SHEET_LOOK, sheetDate } from './pages'
import { COMMON_SCALES, PAPERS, PAPER_NAMES, SCALES_TRIED, scaleText, type PaperName } from './drawingPapers'

export { PAPERS, PAPER_NAMES, SCALES_TRIED, COMMON_SCALES, SCALE_MAX, scaleText, type PaperName } from './drawingPapers'

/** How long one picture pixel is on the paper: a dimension's figure (`TEXT_PX.dimension`) prints at 2.5 mm. */
export const PIXEL_MM = 2.5 / TEXT_PX.dimension

/** The sheet's own text sizes, in millimetres on the paper. */
export const TEXT_MM = { note: 2.5, field: 2.5, value: 3, caption: 3.5, drawing: 5, project: 6 } as const

const MARGIN = 10
/** Space kept round the drawing inside its area, and between the blocks, in millimetres. */
const PAD = 4
const GAP = 5
const TITLE_BLOCK_WIDTH = 110
/** Below this, the caption and scale bar go above the title block, not beside it. */
const SIDE_MIN = 70
const BAR_TARGET = 50
const BAR_HEIGHT = 2
const NORTH_RADIUS = 5
const LINE = { frame: 0.35, rule: 0.18, bar: 0.18 } as const
const INK = '#000000'
const QUIET = '#3c3c3c'
const PAPER_FILL = '#ffffff'
const FONT = "'Source Sans 3', Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"

/** Measures text in millimetres: the sheet's sans face at `size` mm, semibold when `bold`. */
export type MeasureText = (text: string, size: number, bold?: boolean) => number

export interface DrawingRequest {
  /** N in 1:N. 1:100 when it fits, else 1:200, else 1:500, when left out. */
  readonly scale?: number
  /** The paper. The smallest that fits when left out. */
  readonly paper?: PaperName
  /** The floor, by id; the lowest when left out. */
  readonly floor?: string
  /** Each room's width and depth (its room dimensions). On when left out. */
  readonly roomSizes?: boolean
}

export interface DrawingSheetOptions {
  /** The project's name: the sheet's words' name, else the plan's title, else the file's. */
  readonly project: string
  readonly date: Date
  readonly language?: Language
  readonly measure: MeasureText
}

/** What the sheet says, as text, for an answer and for a test reading the PDF back. */
export interface DrawingWords {
  readonly project: string
  readonly drawing: string
  readonly caption: string
  readonly scale: string
  readonly date: string
  readonly status: string
  readonly label: string
  readonly notes: readonly string[]
}

export interface DrawingSheet {
  readonly paper: { readonly name: PaperName; readonly width: number; readonly height: number; readonly orientation: 'portrait' | 'landscape' }
  /** N in 1:N. */
  readonly scale: number
  readonly floor: string
  /** Where the floor's picture is on the paper, in millimetres, and the plan metres it shows (y down). */
  readonly drawing: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly view: Picture['view'] }
  /** Where the scale bar is: its left end, and how many metres it is long and how many millimetres. */
  readonly scaleBar: { readonly x: number; readonly y: number; readonly metres: number; readonly length: number }
  /** The north arrow's middle and the turn the plan states, or null when it states none. */
  readonly north: { readonly x: number; readonly y: number; readonly turn: number } | null
  readonly words: DrawingWords
  /** The sheet's elements in paper millimetres, inside an `<svg>` of the paper's size. */
  readonly nodes: readonly SvgNode[]
  /** How the scale or the paper was chosen, when Grid chose it. */
  readonly chosen: { readonly scale: boolean; readonly paper: boolean }
}

/** The floor does not fit the paper asked for at the scale asked for. The message says what would. */
export class DrawingDoesNotFit extends Error {
  override readonly name = 'DrawingDoesNotFit'
}

const n = (value: number): string => String(Math.round(value * 1000) / 1000)

/** The words of the sheet's foot, wrapped, and the height each block takes. */
function wrap(measure: MeasureText, text: string, size: number, width: number, bold = false): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const joined = line ? `${line} ${word}` : word
    if (!line || measure(joined, size, bold) <= width) { line = joined; continue }
    lines.push(line)
    line = word
  }
  if (line) lines.push(line)
  return lines
}

/** A size that fits one line in `width`, down to `least`; below it, the text wraps at `least`. */
function fitted(measure: MeasureText, text: string, size: number, least: number, width: number, bold = false): { size: number; lines: string[] } {
  const wide = measure(text, size, bold)
  if (wide <= width) return { size, lines: [text] }
  const shrunk = Math.max(least, Math.floor(((size * width) / wide) * 10) / 10)
  return { size: shrunk, lines: wrap(measure, text, shrunk, width, bold) }
}

const textNode = (x: number, y: number, size: number, words: string, extra: Record<string, string | number> = {}): SvgNode =>
  el('text', { x: n(x), y: n(y), fill: INK, 'font-family': FONT, 'font-size': n(size), ...extra }, [words])

const line = (x1: number, y1: number, x2: number, y2: number, width: number = LINE.rule): SvgNode =>
  el('line', { x1: n(x1), y1: n(y1), x2: n(x2), y2: n(y2), stroke: INK, 'stroke-width': n(width) })

/** One line's height for text of a size: 1.3 times it. */
const lead = (size: number): number => size * 1.3

interface Field { readonly label: string; readonly value: string; readonly size: number; readonly least: number; readonly bold?: boolean }

/** A cell of the title block: its small label, then its value, wrapped to the cell. */
function cell(measure: MeasureText, field: Field, width: number): { lines: string[]; size: number; height: number } {
  const { size, lines } = fitted(measure, field.value, field.size, field.least, width - 2 * 1.5, field.bold)
  return { lines, size, height: 1.5 + lead(TEXT_MM.field) + lines.length * lead(size) + 0.8 }
}

function cellNodes(field: Field, laid: { lines: string[]; size: number }, x: number, y: number): SvgNode[] {
  const label = textNode(x + 1.5, y + 1.5 + TEXT_MM.field, TEXT_MM.field, field.label.toUpperCase(), { fill: QUIET })
  const values = laid.lines.map((words, i) => textNode(x + 1.5, y + 1.5 + lead(TEXT_MM.field) + (i + 1) * lead(laid.size) - 0.3 * laid.size, laid.size, words, field.bold ? { 'font-weight': 600 } : {}))
  return [label, ...values]
}

interface TitleBlock { readonly width: number; readonly height: number; readonly nodes: (x: number, y: number) => SvgNode[] }

function titleBlock(measure: MeasureText, words: DrawingWords, width: number, language: Language): TitleBlock {
  const project: Field = { label: say(language, 'sheet.block.project'), value: words.project, size: TEXT_MM.project, least: TEXT_MM.value, bold: true }
  const drawing: Field = { label: say(language, 'sheet.block.drawing'), value: words.drawing, size: TEXT_MM.drawing, least: TEXT_MM.value }
  const small: Field[] = [
    { label: say(language, 'sheet.block.scale'), value: words.scale, size: TEXT_MM.value, least: TEXT_MM.note },
    { label: say(language, 'sheet.block.date'), value: words.date, size: TEXT_MM.value, least: TEXT_MM.note },
    { label: say(language, 'sheet.block.status'), value: words.status, size: TEXT_MM.value, least: TEXT_MM.note },
  ]
  const third = width / 3
  const top = cell(measure, project, width)
  const middle = cell(measure, drawing, width)
  const row = small.map((field) => cell(measure, field, third))
  const rowHeight = Math.max(...row.map((c) => c.height))
  const labelLines = wrap(measure, words.label, TEXT_MM.note, width - 3)
  const labelHeight = 1.2 + labelLines.length * lead(TEXT_MM.note) + 0.6
  const height = top.height + middle.height + rowHeight + labelHeight
  return {
    width,
    height,
    nodes: (x, y) => {
      const y1 = y + top.height
      const y2 = y1 + middle.height
      const y3 = y2 + rowHeight
      return [
        el('rect', { 'data-part': 'title-block', x: n(x), y: n(y), width: n(width), height: n(height), fill: 'none', stroke: INK, 'stroke-width': n(LINE.frame) }),
        line(x, y1, x + width, y1), line(x, y2, x + width, y2), line(x, y3, x + width, y3),
        line(x + third, y2, x + third, y3), line(x + 2 * third, y2, x + 2 * third, y3),
        ...cellNodes(project, top, x, y),
        ...cellNodes(drawing, middle, x, y1),
        ...small.flatMap((field, i) => cellNodes(field, row[i]!, x + i * third, y2)),
        ...labelLines.map((words, i) => textNode(x + 1.5, y3 + 1.2 + (i + 1) * lead(TEXT_MM.note) - 0.75, TEXT_MM.note, words, { 'data-part': 'guidance-label' })),
      ]
    },
  }
}

/** The scale bar's length in metres: 1, 2 or 5 times a power of ten, about `BAR_TARGET` mm long. */
export function scaleBarMetres(scale: number): number {
  const target = (BAR_TARGET * scale) / 1000
  const power = 10 ** Math.floor(Math.log10(target))
  return [5, 2, 1].map((step) => step * power).find((metres) => metres <= target) ?? power
}

function figure(value: number, language: Language): string {
  const text = String(Math.round(value * 1000) / 1000)
  return decimalFor(language) === 'comma' ? text.replace('.', ',') : text
}

function scaleBarNodes(scale: number, x: number, y: number, language: Language): { nodes: SvgNode[]; metres: number; length: number } {
  const metres = scaleBarMetres(scale)
  const lead = Number(String(metres)[0])
  const parts = lead === 2 ? 4 : 5
  const length = (metres * 1000) / scale
  const step = length / parts
  const boxes = Array.from({ length: parts }, (_, i) =>
    el('rect', { x: n(x + i * step), y: n(y), width: n(step), height: n(BAR_HEIGHT), fill: i % 2 === 0 ? INK : PAPER_FILL, stroke: INK, 'stroke-width': n(LINE.bar) }))
  const labels = Array.from({ length: parts + 1 }, (_, i) => {
    const value = figure((metres / parts) * i, language)
    const baseline = y + BAR_HEIGHT + 1 + TEXT_MM.note
    // The last figure carries the unit and starts a little before its tick, so it reads from it.
    return i === parts
      ? textNode(x + length - 0.8, baseline, TEXT_MM.note, say(language, 'sheet.scaleBar.metres', { length: value }))
      : textNode(x + i * step, baseline, TEXT_MM.note, value, { 'text-anchor': 'middle' })
  })
  return { nodes: [el('g', { 'data-part': 'scale-bar' }, [...boxes, ...labels])], metres, length }
}

/** The north arrow: an arrowhead and an N in a circle, turned to the north the plan states. */
function northNodes(x: number, y: number, turn: number, language: Language): SvgNode {
  const degrees = (-turn * 180) / Math.PI
  return el('g', { 'data-part': 'north-arrow', transform: `translate(${n(x)} ${n(y)}) rotate(${n(degrees)})` }, [
    el('circle', { cx: 0, cy: 0, r: NORTH_RADIUS, fill: 'none', stroke: INK, 'stroke-width': n(LINE.rule) }),
    el('path', { d: 'M0,-4.2L2.2,2.6L0,1.3L-2.2,2.6Z', fill: INK }),
    textNode(0, -NORTH_RADIUS - 1, TEXT_MM.note, say(language, 'sheet.north.letter'), { 'text-anchor': 'middle', 'font-weight': 600 }),
  ])
}

/** The paper in an orientation, with the drawing area above the foot and the foot's own top. */
interface Layout {
  readonly paper: DrawingSheet['paper']
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly footTop: number
  readonly side: boolean
}

interface Foot {
  readonly block: TitleBlock
  readonly captionLines: string[]
  readonly noteLines: string[]
  readonly sideWidth: number
  readonly side: boolean
  readonly height: number
}

const BAR_ROW = 2 * NORTH_RADIUS + 4

function footOf(measure: MeasureText, words: DrawingWords, innerWidth: number, language: Language): Foot {
  const side = innerWidth - TITLE_BLOCK_WIDTH - GAP >= SIDE_MIN
  const blockWidth = side ? TITLE_BLOCK_WIDTH : innerWidth
  const block = titleBlock(measure, words, blockWidth, language)
  const sideWidth = (side ? innerWidth - TITLE_BLOCK_WIDTH - GAP : innerWidth) - PAD
  const captionLines = wrap(measure, words.caption, TEXT_MM.caption, sideWidth)
  const noteLines = words.notes.flatMap((note) => wrap(measure, note, TEXT_MM.note, sideWidth))
  const text = captionLines.length * lead(TEXT_MM.caption) + 1 + noteLines.length * lead(TEXT_MM.note) + 2 + BAR_ROW + 3
  const height = side ? Math.max(block.height, text) : block.height + GAP + text
  return { block, captionLines, noteLines, sideWidth, side, height }
}

function layoutOf(name: PaperName, orientation: 'portrait' | 'landscape', foot: (innerWidth: number) => Foot): Layout & { foot: Foot } {
  const size = PAPERS[name]
  const width = orientation === 'portrait' ? size.width : size.height
  const height = orientation === 'portrait' ? size.height : size.width
  const innerWidth = width - 2 * MARGIN
  const laid = foot(innerWidth)
  const footTop = height - MARGIN - laid.height
  const area = { x: MARGIN + PAD, y: MARGIN + PAD, width: innerWidth - 2 * PAD, height: footTop - GAP - MARGIN - PAD }
  return { paper: { name, width, height, orientation }, area, footTop, side: laid.side, foot: laid }
}

/** The floor's size on the paper at 1:N, in millimetres, with the space kept round it. */
function drawnSize(framed: Bounds, scale: number): { width: number; height: number } {
  return { width: (framed.width * 1000) / scale, height: (framed.height * 1000) / scale }
}

const fits = (size: { width: number; height: number }, area: Layout['area']): boolean => size.width <= area.width && size.height <= area.height

/** The orientations to try for a drawing of this shape: the one that matches it first. */
const orientations = (size: { width: number; height: number }): ('portrait' | 'landscape')[] =>
  size.width > size.height ? ['landscape', 'portrait'] : ['portrait', 'landscape']

/** The first paper (and orientation) at a scale the floor fits, smallest first, or null. */
function paperFor(framed: Bounds, scale: number, papers: readonly PaperName[], foot: (innerWidth: number) => Foot): (Layout & { foot: Foot }) | null {
  const size = drawnSize(framed, scale)
  for (const name of papers) {
    for (const orientation of orientations(size)) {
      const laid = layoutOf(name, orientation, foot)
      if (fits(size, laid.area)) return laid
    }
  }
  return null
}

function doesNotFit(framed: Bounds, request: DrawingRequest, foot: (innerWidth: number) => Foot): DrawingDoesNotFit {
  const scale = request.scale ?? SCALES_TRIED[0]
  const size = drawnSize(framed, scale)
  const at = `At ${scaleText(scale)} the floor's drawing is ${Math.ceil(size.width)} x ${Math.ceil(size.height)} mm`
  const paper = paperFor(framed, scale, PAPER_NAMES, foot)
  const larger = paper === null ? null : `${paper.paper.name} fits it`
  const smaller = request.paper === undefined
    ? null
    : (() => {
        const want = COMMON_SCALES.find((s) => s > scale && paperFor(framed, s, [request.paper!], foot) !== null)
        return want === undefined ? null : `${scaleText(want)} fits ${request.paper}`
      })()
  const offers = [larger, smaller].filter((offer): offer is string => offer !== null)
  const where = request.paper === undefined ? 'larger than A0 can hold' : `larger than ${request.paper} can hold`
  return new DrawingDoesNotFit(`${at}, ${where}${offers.length > 0 ? `: ${offers.join(', or ')}` : ''}.`)
}

/** The floor's picture, sized so that its view is the framed floor and the space round it. */
function floorPicture(plan: FloorPlan, options: PictureOptions, framed: Bounds, scale: number): Picture {
  const pad = (PAD * scale) / 1000
  const want = { width: framed.width + 2 * pad, height: framed.height + 2 * pad }
  const cx = (framed.min.x + framed.max.x) / 2
  const cy = (framed.min.y + framed.max.y) / 2
  // `planPicture` frames with `FRAME_MARGIN` round its frame: a frame that much smaller is
  // framed to exactly the size wanted.
  const grow = 1 + 2 * FRAME_MARGIN
  const half = { x: want.width / grow / 2, y: want.height / grow / 2 }
  const frame = computeBounds([{ x: cx - half.x, y: cy - half.y }, { x: cx + half.x, y: cy + half.y }])
  const metresPerPixel = (PIXEL_MM * scale) / 1000
  const width = Math.max(1, Math.round(want.width / metresPerPixel))
  const height = Math.max(1, Math.round(want.height / metresPerPixel))
  return planPicture(plan, { ...options, frame, width, height, paperScale: scale })
}

/** Leaves out the picture's own north arrow: the sheet draws its own, beside the scale bar. */
function withoutNorth(nodes: readonly SvgNode[]): SvgNode[] {
  return nodes.filter((node) => node.attrs['data-part'] !== 'north-arrow')
}

/** Lays out the sheet. Throws `DrawingDoesNotFit` when the floor fits no paper asked for. */
export function drawingSheet(loaded: LoadedPlan, request: DrawingRequest, options: DrawingSheetOptions): DrawingSheet {
  const { plan } = loaded
  const language = options.language ?? DEFAULT_LANGUAGE
  const { measure } = options
  const floorId = resolveFloor(plan, request.floor)
  const floors = planFloors(plan)
  const floorIndex = floors.findIndex((floor) => floor.id === floorId)
  const floor = floors[floorIndex] ?? { id: floorId, name: floorId }
  const pictureOptions: PictureOptions = {
    floor: floorId,
    look: SHEET_LOOK,
    roomSizes: request.roomSizes !== false,
    // The sheet has its own title block, caption and notes: the band under the drawing is left off.
    show: { title: false, key: false },
    language,
  }
  const framed = pictureFrame(plan, pictureOptions)
  const north = buildFloorPlan(planForFloor(withPatterns(plan), floorId)).north

  const facts = planFacts(plan)
  const undecided = undecidedDoorsOf(plan, floorId).length > 0
  const wordsAt = (scale: number, paper: PaperName): DrawingWords => {
    const scaleOn = say(language, 'sheet.block.scaleOn', { scale: scaleText(scale), paper })
    const caption = floors.length > 1
      ? say(language, 'sheet.drawing.caption.many', { floor: floor.name, number: floorIndex + 1, count: floors.length, scale: scaleText(scale), paper })
      : say(language, 'sheet.drawing.caption.one', { floor: floor.name, scale: scaleText(scale), paper })
    const notes = [
      notShownNote(plan, floorId, facts.connections.stairs.length > 0, language),
      ...(undecided ? [say(language, 'sheet.undecided')] : []),
      ...(north === null ? [say(language, 'sheet.north.notStated')] : []),
    ]
    return {
      project: options.project,
      drawing: say(language, 'sheet.drawing.title', { floor: floor.name }),
      caption,
      scale: scaleOn,
      date: sheetDate(options.date, language),
      status: say(language, 'sheet.status.draft'),
      label: say(language, 'label'),
      notes,
    }
  }

  // The words depend on the paper's name only through the caption and the scale's cell, which
  // wrap the same for every paper name of two characters: they are measured with the first.
  const scales = request.scale === undefined ? SCALES_TRIED : [request.scale]
  const papers = request.paper === undefined ? PAPER_NAMES : [request.paper]
  let chosen: { laid: Layout & { foot: Foot }; scale: number } | null = null
  for (const scale of scales) {
    const words = wordsAt(scale, papers[0]!)
    const foot = (innerWidth: number): Foot => footOf(measure, words, innerWidth, language)
    const laid = paperFor(framed, scale, papers, foot)
    if (laid !== null) { chosen = { laid, scale }; break }
  }
  if (chosen === null) {
    const words = wordsAt(scales[0]!, papers[0]!)
    throw doesNotFit(framed, request, (innerWidth) => footOf(measure, words, innerWidth, language))
  }
  const { scale } = chosen
  const words = wordsAt(scale, chosen.laid.paper.name)
  const laid = layoutOf(chosen.laid.paper.name, chosen.laid.paper.orientation, (innerWidth) => footOf(measure, words, innerWidth, language))
  const { paper, area, foot } = laid

  const picture = floorPicture(plan, pictureOptions, framed, scale)
  const drawn = { width: (picture.view.width * 1000) / scale, height: (picture.view.height * 1000) / scale }
  const drawing = { x: area.x + (area.width - drawn.width) / 2, y: area.y + (area.height - drawn.height) / 2, width: drawn.width, height: drawn.height, view: picture.view }
  const floorNode = el('svg', {
    'data-part': 'floor-drawing',
    x: n(drawing.x), y: n(drawing.y), width: n(drawing.width), height: n(drawing.height),
    viewBox: viewBoxOf(picture.view), preserveAspectRatio: 'xMidYMid meet',
  }, withoutNorth(picture.nodes))

  // The foot: the title block at the right, the caption, notes, scale bar and north beside it,
  // or above it on a narrow paper.
  const innerRight = paper.width - MARGIN
  const footBottom = paper.height - MARGIN
  const blockX = innerRight - foot.block.width
  const blockY = footBottom - foot.block.height
  const sideX = MARGIN + PAD
  const sideTop = foot.side ? footBottom - foot.height : laid.footTop
  const caption = foot.captionLines.map((words, i) => textNode(sideX, sideTop + (i + 1) * lead(TEXT_MM.caption) - 0.3 * TEXT_MM.caption, TEXT_MM.caption, words, { 'data-part': 'caption', 'font-weight': 600 }))
  const notesTop = sideTop + foot.captionLines.length * lead(TEXT_MM.caption) + 1
  const notes = foot.noteLines.map((words, i) => textNode(sideX, notesTop + (i + 1) * lead(TEXT_MM.note) - 0.3 * TEXT_MM.note, TEXT_MM.note, words, { 'data-part': 'note', fill: QUIET }))
  const barRowTop = notesTop + foot.noteLines.length * lead(TEXT_MM.note) + 2
  const bar = scaleBarNodes(scale, sideX + 2, barRowTop + NORTH_RADIUS - BAR_HEIGHT, language)
  const northAt = { x: sideX + Math.min(foot.sideWidth - NORTH_RADIUS - 1, bar.length + 22 + NORTH_RADIUS), y: barRowTop + NORTH_RADIUS + 1.5 }
  const nodes: SvgNode[] = [
    el('rect', { 'data-part': 'paper', x: 0, y: 0, width: n(paper.width), height: n(paper.height), fill: PAPER_FILL }),
    el('rect', { 'data-part': 'frame', x: MARGIN, y: MARGIN, width: n(paper.width - 2 * MARGIN), height: n(paper.height - 2 * MARGIN), fill: 'none', stroke: INK, 'stroke-width': n(LINE.frame) }),
    floorNode,
    ...caption,
    ...notes,
    ...bar.nodes,
    ...(north === null ? [] : [northNodes(northAt.x, northAt.y, north.turn, language)]),
    ...foot.block.nodes(blockX, blockY),
  ]
  return {
    paper,
    scale,
    floor: floorId,
    drawing,
    scaleBar: { x: sideX + 2, y: barRowTop + NORTH_RADIUS - BAR_HEIGHT, metres: bar.metres, length: bar.length },
    north: north === null ? null : { ...northAt, turn: north.turn },
    words,
    nodes,
    chosen: { scale: request.scale === undefined, paper: request.paper === undefined },
  }
}

/** The sheet as an SVG file, sized in millimetres: printed at 100%, it is at its scale. */
export function drawingSheetSvg(sheet: DrawingSheet): string {
  const { paper } = sheet
  const root = el('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: `${n(paper.width)}mm`,
    height: `${n(paper.height)}mm`,
    viewBox: `0 0 ${n(paper.width)} ${n(paper.height)}`,
    role: 'img',
    'aria-label': sheet.words.caption,
  }, sheet.nodes as SvgChild[])
  return `${toSvg(root)}\n`
}
