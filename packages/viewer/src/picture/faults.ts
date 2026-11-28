/**
 * What went wrong, shown on the drawing (MSG-8).
 *
 * A picture can be given the lines of Grid's one result record (MSG-1), in the record's order.
 * Each line keeps its number, its place in the record from 1, which is the number `grid check`
 * prints before it, so a mark on the drawing and a line of the report say the same number.
 * A line about a room, a wall, an opening or a fixture gets a numbered mark on that part with its words
 * beside it (an opening the drawing leaves out, on its wall); a line about the floor or the whole
 * plan, or about a part the drawing does not hold, is only in the key under the drawing (VEW-17),
 * so nothing of it covers a wall. Every line is also in the key.
 *
 * Where a mark goes comes from what the geometry core and the label placement already worked
 * out: a room's label, an opening's gap, a wall's axis, the box round an undrawn room's walls.
 * Nothing here computes geometry of its own; it only lays text out in pixels.
 *
 * Pure: no DOM, no React.
 */
import type { PlanDrawing, Vec2 } from '@ongrid/floorplan/geometry'
import { centroid } from '@ongrid/floorplan/geometry'
import type { Box } from '../canvas2d/labelPlacement'
import { drawingWords, estimateTextWidth, overlaps } from '../canvas2d/labelPlacement'
import type { PlanLook } from './look'
import { LINE_PX, TEXT_PX } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'
import { ENGLISH_WORDS, drawingText, type DrawingWords } from './words'

/** What a line is about, as the result record names it. */
export type FaultThingKind = 'plan' | 'floor' | 'wall' | 'room' | 'opening' | 'item' | 'stair' | 'pattern' | 'flat'

/**
 * The part of a result line (MSG-1's `ResultLine`) a picture uses. A record's `lines` can be
 * passed as they are.
 */
export interface FaultLine {
  readonly thing: { readonly kind: FaultThingKind; readonly id: string }
  /** The floor the thing is on; null for the plan as a whole. */
  readonly floor: string | null
  /** MSG-36: on a line said once for several floors, each floor it holds for. */
  readonly floors?: readonly string[]
  readonly message: string
}

/** A line with its number in the whole record. */
export interface NumberedFault {
  readonly number: number
  readonly line: FaultLine
  /** For a line about an opening: the wall the plan puts it on, where the drawing leaves it out. */
  readonly wall?: string
}

/**
 * The lines a drawing of one floor shows: that floor's and the whole plan's, numbered in the
 * whole record. `walls` names each opening's wall, as the plan states it. MSG-36: a line said once
 * for several floors is on each of them; where its part is not on this floor it is in the key.
 */
export function faultsOnFloor(lines: readonly FaultLine[], floor: string, walls: ReadonlyMap<string, string> = new Map()): NumberedFault[] {
  return lines.flatMap((line, index) => {
    if (line.floor !== null && line.floor !== floor && !(line.floors?.includes(floor) ?? false)) return []
    const wall = line.thing.kind === 'opening' ? walls.get(line.thing.id) : undefined
    return [wall === undefined ? { number: index + 1, line } : { number: index + 1, line, wall }]
  })
}

/** A mark's height on screen, whatever the zoom. */
export const FAULT_MARK_PX = 16
/** How far a mark's words sit from the mark, and the text's air round it. */
const WORDS_GAP_PX = 5
const ASCENT = 0.75
const DESCENT = 0.25
/** The key's margins, line height and the room its numbers take, in pixels. */
const KEY_MARGIN_PX = 16
const KEY_LINE_PX = 17
const KEY_NUMBER_PX = 34

const numbersText = (faults: readonly NumberedFault[]): string => faults.map((fault) => fault.number).join(', ')
const wordsOf = (faults: readonly NumberedFault[]): string => faults.map((fault) => fault.line.message).join(' · ')

/** Text broken into lines of at most `width` pixels, by words; a word longer than that keeps its own line. */
export function wrapText(text: string, fontPx: number, width: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter((w) => w.length > 0)) {
    const next = current === '' ? word : `${current} ${word}`
    if (current !== '' && estimateTextWidth(next, fontPx) > width) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current !== '') lines.push(current)
  return lines
}

/** The paint the marks use, in a group scaled to pixels. */
function paints(look: PlanLook) {
  return {
    mark: { fill: look.warning, stroke: look.paper, 'stroke-width': LINE_PX.warningRing } as Attrs,
    number: { fill: look.paper, 'font-family': look.font, 'font-size': TEXT_PX.faultNumber, 'text-anchor': 'middle' } as Attrs,
    // On a backing of paper rather than a halo: Skia, which draws the PNG, ignores `paint-order`.
    backing: { fill: look.paper } as Attrs,
    words: { fill: look.warning, 'font-family': look.font, 'font-size': TEXT_PX.warning } as Attrs,
    name: { fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.roomName, 'text-anchor': 'middle' } as Attrs,
    reason: { fill: look.warning, 'font-family': look.font, 'font-size': TEXT_PX.warning, 'text-anchor': 'middle' } as Attrs,
    keyNumber: { fill: look.warning, 'font-family': look.font, 'font-size': TEXT_PX.warning } as Attrs,
    keyText: { fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning } as Attrs
  }
}

const pixelGroup = (at: Vec2, mpp: number): string => `translate(${at.x} ${-at.y}) scale(${mpp})`

/** The faults by the thing they are about, in the order first met. */
function byThing(faults: readonly NumberedFault[]): Map<string, NumberedFault[]> {
  const groups = new Map<string, NumberedFault[]>()
  for (const fault of faults) {
    const key = `${fault.line.thing.kind}:${fault.line.thing.id}`
    const group = groups.get(key)
    if (group) group.push(fault)
    else groups.set(key, [fault])
  }
  return groups
}

/** Where the scene's other text already is, for the marks to keep off. */
export interface FaultLayout {
  readonly drawing: PlanDrawing
  /** Each drawn room's label box, by room id, where it got one. */
  readonly labelBoxes: ReadonlyMap<string, Box>
  /** Every label box: the marks' words keep off them. */
  readonly blocks: readonly Box[]
  /** Where text may go: the framed drawing and its margin. */
  readonly within: Box
  readonly metersPerPixel: number
  readonly look: PlanLook
}

/**
 * The text inside each room that could not be drawn: its name and why, from its lines, or
 * "Not drawn" (in the drawing's language) when the picture was given none. Centred in the box round its walls.
 */
export function undrawnRoomText(layout: FaultLayout, faults: readonly NumberedFault[]): SvgNode[] {
  const { drawing, metersPerPixel: mpp, look } = layout
  const paint = paints(look)
  const groups = byThing(faults)
  return drawing.undrawn.map((room, index) => {
    const own = groups.get(`room:${room.id}`) ?? []
    const reason = own.length === 0 ? drawingText(drawingWords(), 'drawing.notDrawn') : wordsOf(own)
    const width = Math.max(room.box.width / mpp - 2 * FAULT_MARK_PX, 140)
    const lines = wrapText(reason, TEXT_PX.warning, width)
    const centre = { x: room.box.min.x + room.box.width / 2, y: room.box.min.y + room.box.height / 2 }
    // The name on the first line, the reason under it; the block centred on the box.
    const top = -((lines.length * KEY_LINE_PX) / 2)
    return el(
      'g',
      { 'data-part': 'undrawn-label', 'data-room': room.id, transform: pixelGroup(centre, mpp) },
      [
        el('text', { 'data-part': 'undrawn-name', y: lengthOf(top), ...paint.name }, [room.name || room.id]),
        ...lines.map((text, line) =>
          el('text', { 'data-part': 'undrawn-reason', y: lengthOf(top + (line + 1) * KEY_LINE_PX), ...paint.reason }, [text])
        )
      ],
      `undrawn-label:${room.id}:${index}`
    )
  })
}

const lengthOf = (value: number): string => String(Number(value.toFixed(2)))

/** Where the mark for a thing goes, and whether its words go beside it; null when the drawing does not hold it. */
function spotOf(kind: FaultThingKind, id: string, layout: FaultLayout, wall?: string): { at: Vec2; words: boolean } | null {
  const { drawing, labelBoxes, metersPerPixel: mpp } = layout
  const reach = (FAULT_MARK_PX / 2 + 4) * mpp
  if (kind === 'room') {
    const label = labelBoxes.get(id)
    if (label) return { at: { x: label.minX - reach, y: (label.minY + label.maxY) / 2 }, words: true }
    const room = drawing.rooms.find((r) => r.id === id)
    if (room) return { at: room.labelAt, words: true }
    const undrawn = drawing.undrawn.find((r) => r.id === id)
    // Its words are already in its box.
    if (undrawn) return { at: { x: undrawn.box.min.x + reach, y: undrawn.box.max.y - reach }, words: false }
    return null
  }
  if (kind === 'opening') {
    const opening = drawing.openings.find((o) => o.id === id)
    if (opening) return { at: { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 }, words: true }
    // Left out of the drawing: on the wall it should be in.
    return wall === undefined ? null : spotOf('wall', wall, layout)
  }
  if (kind === 'item') {
    // A fixture (CNT-12): on the middle of its outline.
    const item = drawing.items.find((i) => i.id === id)
    return item && item.outline.length > 0 ? { at: centroid(item.outline), words: true } : null
  }
  if (kind === 'stair') {
    // A stair (LVL-3): at the foot of its walking line, where it is drawn on this floor.
    const stair = drawing.stairs.find((s) => s.id === id)
    const at = stair?.line[0]
    return at === undefined ? null : { at, words: true }
  }
  if (kind === 'flat') {
    // A flat (CNT-4): on the first corner of its outline on this floor.
    const at = drawing.flats.find((f) => f.id === id)?.rings[0]?.[0]
    return at === undefined ? null : { at, words: true }
  }
  if (kind === 'wall') {
    const wall = drawing.walls.find((w) => w.id === id)
    if (!wall) return null
    const [a, b] = wall.centerline
    return { at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, words: true }
  }
  return null
}

const inside = (outer: Box, inner: Box): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY

/** How wide a mark's words may run before they wrap, and their line height, in pixels. */
const WORDS_MAX_PX = 320
const WORDS_LINE_PX = 15

interface Mark {
  readonly key: string
  readonly kind: FaultThingKind
  readonly id: string
  readonly at: Vec2
  readonly numbers: string
  /** Half the mark's width, in pixels. */
  readonly half: number
  /** Its words, wrapped; null where they are drawn elsewhere (an undrawn room's box). */
  readonly words: readonly string[] | null
  readonly faults: readonly NumberedFault[]
}

const markHalf = (numbers: string): number => Math.max(FAULT_MARK_PX, estimateTextWidth(numbers, TEXT_PX.faultNumber) + 6) / 2
const blockWidth = (lines: readonly string[]): number => Math.max(...lines.map((line) => estimateTextWidth(line, TEXT_PX.warning)))

/**
 * The numbered marks, each with the words of its lines beside it: one per part with lines about
 * it. A line about the floor or the plan, or about a part the drawing does not hold, has no mark
 * on the drawing (VEW-17): it is listed in the key under it.
 *
 * A part's words go to the right of its mark, else the left, below or above, wherever they keep
 * clear of the labels, the marks and the other words; with no clear spot, on the one that covers
 * least, on a backing of paper so they always read. Also says which openings got a mark, so the
 * plain warning dot is not drawn under it.
 */
export function faultMarks(layout: FaultLayout, faults: readonly NumberedFault[]): { nodes: SvgNode[]; openings: Set<string> } {
  const { metersPerPixel: mpp, look } = layout
  const paint = paints(look)
  const placed: Box[] = [...layout.blocks]
  const openings = new Set<string>()
  const marks: Mark[] = []
  const wrapped = (group: readonly NumberedFault[]): string[] => wrapText(wordsOf(group), TEXT_PX.warning, WORDS_MAX_PX)

  for (const [key, group] of byThing(faults)) {
    const { kind, id } = group[0]!.line.thing
    const spot = spotOf(kind, id, layout, group[0]!.wall)
    if (!spot) {
      // VEW-17: a line about the floor or the plan, or a part the drawing does not hold, has no
      // place on the drawing: it is in the key under it, by its number, and nowhere over the walls.
      continue
    }
    if (kind === 'opening') openings.add(id)
    const numbers = numbersText(group)
    marks.push({ key, kind, id, at: spot.at, numbers, half: markHalf(numbers), words: spot.words ? wrapped(group) : null, faults: group })
  }
  for (const mark of marks) placed.push(boxAround(mark.at, mark.half, FAULT_MARK_PX / 2, mpp))
  const nodes = marks.map((mark) => {
    const r = FAULT_MARK_PX / 2
    const children: SvgNode[] = [
      el('rect', { 'data-part': 'fault-mark-dot', x: -mark.half, y: -r, width: mark.half * 2, height: FAULT_MARK_PX, rx: r, ...paint.mark }),
      el('text', { 'data-part': 'fault-mark-number', dy: lengthOf(TEXT_PX.faultNumber * 0.35), ...paint.number }, [mark.numbers])
    ]
    if (mark.words !== null && mark.words.length > 0) children.push(...(wordsBeside(mark, mark.words, placed, layout, paint, true) ?? []))
    return el(
      'g',
      {
        'data-part': 'fault-mark',
        'data-thing': mark.kind,
        'data-id': mark.id,
        'data-numbers': mark.numbers,
        role: 'img',
        'aria-label': mark.faults.map((fault) => `${fault.number}: ${fault.line.message}`).join(' · '),
        'pointer-events': 'none',
        transform: pixelGroup(mark.at, mpp)
      },
      children,
      `fault:${mark.key}`
    )
  })
  return { nodes, openings }
}

/**
 * A mark's words as a block of lines on a backing of paper, placed as `faultMarks` says, and kept
 * in `placed`. `always` places them where they cover least when no spot is clear; else there is
 * then nothing (null), and only the right of the mark is tried.
 */
function wordsBeside(mark: Mark, lines: readonly string[], placed: Box[], layout: FaultLayout, paint: ReturnType<typeof paints>, always: boolean): SvgNode[] | null {
  const { metersPerPixel: mpp, within } = layout
  const r = FAULT_MARK_PX / 2
  const width = blockWidth(lines)
  const height = lines.length * WORDS_LINE_PX
  const side = mark.half + WORDS_GAP_PX
  // The block's top-left corner in pixels from the mark, y down: the first line level with the mark.
  const level = -WORDS_LINE_PX / 2
  const spots = [
    { x: side, y: level },
    { x: -side - width, y: level },
    { x: -width / 2, y: r + WORDS_GAP_PX },
    { x: -width / 2, y: -r - WORDS_GAP_PX - height }
  ].map((spot) => ({
    ...spot,
    box: {
      minX: mark.at.x + (spot.x - 2) * mpp,
      maxX: mark.at.x + (spot.x + width + 2) * mpp,
      minY: mark.at.y - (spot.y + height + 2) * mpp,
      maxY: mark.at.y - (spot.y - 2) * mpp
    }
  }))
  const covers = (box: Box): number => placed.filter((other) => overlaps(other, box)).length
  const fits = (always ? spots : spots.slice(0, 1)).filter((spot) => inside(within, spot.box))
  const clear = fits.find((spot) => covers(spot.box) === 0)
  if (!clear && !always) return null
  const choice = clear ?? [...(fits.length > 0 ? fits : spots)].sort((a, b) => covers(a.box) - covers(b.box))[0]!
  placed.push(choice.box)
  const baseline = (WORDS_LINE_PX + (ASCENT - DESCENT) * TEXT_PX.warning) / 2
  return [
    el('rect', {
      'data-part': 'fault-mark-backing',
      x: lengthOf(choice.x - 2),
      y: lengthOf(choice.y - 1),
      width: lengthOf(width + 4),
      height: lengthOf(height + 2),
      ...paint.backing
    }),
    ...lines.map((line, index) =>
      el('text', { 'data-part': 'fault-mark-text', x: lengthOf(choice.x), y: lengthOf(choice.y + index * WORDS_LINE_PX + baseline), ...paint.words }, [line])
    )
  ]
}

function boxAround(at: Vec2, halfWidthPx: number, halfHeightPx: number, mpp: number): Box {
  return {
    minX: at.x - (halfWidthPx + 2) * mpp,
    maxX: at.x + (halfWidthPx + 2) * mpp,
    minY: at.y - (halfHeightPx + 2) * mpp,
    maxY: at.y + (halfHeightPx + 2) * mpp
  }
}

/** The key under a picture: every numbered line of this floor with its words, in pixels from its top-left corner. */
export interface PictureKey {
  readonly height: number
  readonly nodes: readonly SvgNode[]
}

/**
 * The key: a heading, then each line's number and words, wrapped to the picture's width, and
 * how many lines are about other floors, in `words`' language. Null when there is nothing to list.
 */
export function faultKey(faults: readonly NumberedFault[], elsewhere: number, width: number, look: PlanLook, words: DrawingWords = ENGLISH_WORDS): PictureKey | null {
  if (faults.length === 0 && elsewhere === 0) return null
  const paint = paints(look)
  const textWidth = Math.max(width - 2 * KEY_MARGIN_PX - KEY_NUMBER_PX, 80)
  const nodes: SvgNode[] = []
  let y = KEY_MARGIN_PX + ASCENT * TEXT_PX.warning
  const heading = faults.length === 0 ? drawingText(words, 'drawing.faults.none') : drawingText(words, 'drawing.faults.some', { count: faults.length })
  nodes.push(el('text', { 'data-part': 'key-heading', x: KEY_MARGIN_PX, y: lengthOf(y), ...paint.keyText }, [heading]))
  for (const fault of faults) {
    y += KEY_LINE_PX
    nodes.push(el('text', { 'data-part': 'key-number', x: KEY_MARGIN_PX, y: lengthOf(y), ...paint.keyNumber }, [String(fault.number)]))
    wrapText(fault.line.message, TEXT_PX.warning, textWidth).forEach((text, line) => {
      if (line > 0) y += KEY_LINE_PX
      nodes.push(el('text', { 'data-part': 'key-text', x: KEY_MARGIN_PX + KEY_NUMBER_PX, y: lengthOf(y), ...paint.keyText }, [text]))
    })
  }
  if (elsewhere > 0) {
    y += KEY_LINE_PX
    nodes.push(el('text', { 'data-part': 'key-elsewhere', x: KEY_MARGIN_PX, y: lengthOf(y), ...paint.keyText }, [drawingText(words, 'drawing.faults.elsewhere', { count: elsewhere })]))
  }
  const height = Math.ceil(y + DESCENT * TEXT_PX.warning + KEY_MARGIN_PX)
  return { height, nodes: [el('rect', { 'data-part': 'key-rule', x: KEY_MARGIN_PX, y: 0, width: Math.max(width - 2 * KEY_MARGIN_PX, 1), height: 1, fill: look.labelSoft }), ...nodes] }
}
