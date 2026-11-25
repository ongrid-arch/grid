/**
 * SHT-7: writing on the drawing. The sketch layer, the notes, tags and symbols, and the band
 * under the drawing that holds its title and its key.
 *
 * Where each thing is comes from the geometry core (`PlanDrawing.sketch`, `PlanDrawing.notes`)
 * and the label placement; nothing here computes geometry of its own. A sketch is drawn as the
 * author wrote it, in a soft line, under the walls: it is never measured or checked.
 *
 * Pure: no DOM, no React.
 */
import type { PlanDrawing, PlanNote, PlanSketch, Vec2, WallDrawnKind } from '@ongrid/floorplan/geometry'
import { hatchLines, wallDrawnKind } from '@ongrid/floorplan/geometry'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import { estimateTextWidth } from '../canvas2d/labelPlacement'
import type { PictureKey } from './faults'
import { wrapText } from './faults'
import type { PhaseLook, PlanLook } from './look'
import { LINE_PX, TEXT_PX, USE_FILLS, lengthText } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'
import { ENGLISH_WORDS, drawingText, roomUseWord, type DrawingWords } from './words'

const n = (value: number): string => lengthText(value)
const pixelGroup = (at: Vec2, mpp: number, turn = 0): string =>
  `translate(${at.x} ${-at.y}) scale(${mpp})${turn === 0 ? '' : ` rotate(${n((-turn * 180) / Math.PI)})`}`

/** The sketch layer, in the plan's order: soft lines in screen pixels, its text upright. */
export function sketchNodes(sketch: readonly PlanSketch[], mpp: number, look: PlanLook): SvgNode[] {
  const line: Attrs = { fill: 'none', stroke: look.labelSoft, 'stroke-width': n(LINE_PX.sketch * mpp), 'stroke-linejoin': 'round' }
  const words: Attrs = { fill: look.labelSoft, 'font-family': look.font, 'font-size': TEXT_PX.sketch, 'text-anchor': 'middle' }
  return sketch.map((item, index) => {
    const attrs = { 'data-part': 'sketch', 'data-kind': item.kind, 'data-category': item.category, 'data-id': item.id, 'pointer-events': 'none' }
    const key = `sketch:${item.id}:${index}`
    if (item.text) {
      return el('g', { ...attrs, transform: pixelGroup(item.text.at, mpp) }, [el('text', { dy: '4', ...words }, [item.text.text])], key)
    }
    if (item.arc) {
      const { center: c, radius: r, from, to } = item.arc
      const a = { x: c.x + r * Math.cos(from), y: -(c.y + r * Math.sin(from)) }
      const b = { x: c.x + r * Math.cos(to), y: -(c.y + r * Math.sin(to)) }
      // Counter-clockwise on the plan is clockwise with y flipped: sweep 0. More than half a turn is the large arc.
      const turn = (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      const d = `M${n(a.x)},${n(a.y)}A${n(r)},${n(r)} 0 ${turn > Math.PI ? 1 : 0} 0 ${n(b.x)},${n(b.y)}`
      return el('path', { ...attrs, d, ...line }, [], key)
    }
    const d = `M${item.points.map((p) => `${n(p.x)},${n(-p.y)}`).join('L')}${item.closed ? 'Z' : ''}`
    return el('path', { ...attrs, d, ...line }, [], key)
  })
}

/** How far under a room's label a note in that room sits, in pixels: below its area line. */
const UNDER_LABEL_PX = 32

/** The notes and tags that carry words (VEW-17): each is a number on the plan and its words in the band. */
export function numberedNotes(notes: readonly PlanNote[]): PlanNote[] {
  return notes.filter((note) => (note.kind === 'note' || note.kind === 'tag') && note.at !== null && (note.text ?? '') !== '')
}

/** The radius of a note's numbered mark on the plan, in pixels. */
const NOTE_MARK_R = 8

/**
 * The notes, tags and symbols, each at its place: a note in a room goes under that room's
 * label where the label was placed (`labelAt`), else at the room's label point.
 *
 * VEW-17: a note or tag with words is a small numbered mark at its place, and its words are in
 * the band under the drawing (`writingBand`, `numberedNotes`), so no sentence ever covers a wall,
 * a dimension or the page's edge.
 */
export function noteNodes(notes: readonly PlanNote[], labelAt: ReadonlyMap<string, Vec2>, mpp: number, look: PlanLook): SvgNode[] {
  const words: Attrs = { fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.note, 'text-anchor': 'middle' }
  const ink: Attrs = { fill: look.label, stroke: look.paper, 'stroke-width': 1 }
  const numbered = numberedNotes(notes)
  return notes.flatMap((note, index): SvgNode[] => {
    if (note.kind === 'key' || note.at === null) return []
    const placed = note.room === null ? undefined : labelAt.get(note.room)
    const at = placed ? { x: placed.x, y: placed.y } : note.at
    const dy = placed ? UNDER_LABEL_PX : 0
    const attrs = { 'data-part': `note-${note.kind}`, 'data-id': note.id, 'pointer-events': 'none' }
    const key = `note:${note.id}:${index}`
    if (note.kind === 'symbol') {
      const shape =
        note.symbol === 'north'
          ? northShape(look)
          : [el('path', { d: 'M0,-8L8,6L-8,6Z', ...ink })]
      const label = note.text ? [el('text', { y: '20', ...words }, [note.text])] : []
      return [el('g', { ...attrs, transform: pixelGroup(at, mpp, note.turn) }, [...shape, ...label], key)]
    }
    const position = numbered.indexOf(note)
    if (position < 0) return []
    const mark = el('g', { ...attrs, 'data-number': String(position + 1), transform: pixelGroup(at, mpp) }, [
      el('circle', { 'data-part': 'note-mark', cy: n(dy), r: NOTE_MARK_R, fill: look.paper, stroke: look.label, 'stroke-width': 1 }),
      el('text', { y: n(dy + 3.5), ...words, 'font-size': 10 }, [String(position + 1)])
    ], key)
    return [mark]
  })
}

/** SHT-7's north symbol, in pixels round its middle, pointing up: an arrowhead and an N over it. */
function northShape(look: PlanLook): SvgNode[] {
  const words: Attrs = { fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.note, 'text-anchor': 'middle' }
  const ink: Attrs = { fill: look.label, stroke: look.paper, 'stroke-width': 1 }
  return [el('path', { d: 'M0,-14L6,6L0,2L-6,6Z', ...ink }), el('text', { y: '-17', ...words }, ['N'])]
}

/** How far the north arrow's middle stands in from the corner of the view, in pixels. */
const NORTH_INSET_PX = 30

/**
 * CNT-3: the north arrow of a plan that states its north: SHT-7's north symbol on a disc of
 * paper, in the top-right corner of the view, turned to the north the plan states
 * (`PlanDrawing.north`). `view` is the part of the plan shown, in plan metres with y down.
 */
export function northArrowNode(north: { readonly turn: number }, view: { readonly x: number; readonly y: number; readonly width: number }, mpp: number, look: PlanLook): SvgNode {
  const at = { x: view.x + view.width - NORTH_INSET_PX * mpp, y: -(view.y + NORTH_INSET_PX * mpp) }
  const disc = el('circle', { r: '23', fill: look.paper, stroke: look.labelSoft, 'stroke-width': 1 })
  return el('g', { 'data-part': 'north-arrow', 'pointer-events': 'none', transform: pixelGroup(at, mpp, north.turn) }, [disc, ...northShape(look)], 'north-arrow')
}

/** One entry of the drawing's key: a swatch and what it stands for. */
export interface KeyEntry {
  readonly swatch: 'fill' | 'line' | 'dash' | 'door' | 'mark' | 'hatch'
  readonly color: string
  readonly words: string
  /** SHT-10: a hatch swatch's line angles, in degrees counter-clockwise. */
  readonly angles?: readonly number[]
}

/** What the key lists: only what this drawing shows, in `words`' language. */
export function keyEntries(
  drawing: PlanDrawing,
  look: PlanLook,
  shown: {
    readonly swings: boolean
    readonly sketch: boolean
    readonly uses: readonly RoomUse[]
    readonly marks: boolean
    readonly above?: boolean
    readonly painted?: readonly { readonly colour: string; readonly words: string }[]
    readonly phases?: PhaseLook
    /** SHT-10: each kind of wall's fill, as the look draws it; the colours' own when left out. */
    readonly walls?: Readonly<Record<WallDrawnKind, string>>
    /** SHT-10: the room fills by use the drawing tints its rooms with; `USE_FILLS` when left out. */
    readonly useFills?: Readonly<Record<RoomUse, string>>
    /** SHT-10: the floor finishes the drawing tints its rooms by, each with its fill. */
    readonly finishes?: readonly { readonly finish: string; readonly colour: string }[]
    /** SHT-10: the wall materials the drawing hatches, each with its hatch's angles, in the ink. */
    readonly materials?: readonly { readonly material: string; readonly angles: readonly number[]; readonly ink: string }[]
  },
  words: DrawingWords = ENGLISH_WORDS
): KeyEntry[] {
  const say = (key: Parameters<typeof drawingText>[1], values?: Parameters<typeof drawingText>[2]): string => drawingText(words, key, values)
  const entries: KeyEntry[] = []
  // CNT-26: a garden or boundary wall has its own entry, in the fill it is drawn in.
  const garden = drawing.walls.some((wall) => !wall.virtual && wall.phase === undefined && wall.landscape === true)
  const solid = drawing.walls.filter((wall) => !wall.virtual && wall.phase === undefined && wall.landscape !== true)
  // SHT-10: each kind of wall in the fill the look draws it with.
  const fill = shown.walls ?? { outside: look.wallExterior, inside: look.wallInside ?? look.wall, partition: look.wallPartition ?? look.wallInside ?? look.wall }
  if (solid.some((wall) => wall.exposure === 'exterior')) entries.push({ swatch: 'fill', color: fill.outside, words: say('drawing.key.outsideWall') })
  // CNT-6: a party wall, or one to the common parts, drawn as an outer wall of the home is.
  if (solid.some((wall) => wall.exposure === 'separating')) entries.push({ swatch: 'fill', color: fill.outside, words: say('drawing.key.separatingWall') })
  if (solid.some((wall) => wallDrawnKind(wall) === 'inside')) entries.push({ swatch: 'fill', color: fill.inside, words: say('drawing.key.insideWall') })
  if (solid.some((wall) => wallDrawnKind(wall) === 'partition')) entries.push({ swatch: 'fill', color: fill.partition, words: say('drawing.key.partition') })
  if (garden) entries.push({ swatch: 'fill', color: fill.partition, words: say('drawing.key.gardenWall') })
  for (const entry of shown.materials ?? []) entries.push({ swatch: 'hatch', color: entry.ink, angles: entry.angles, words: say('drawing.key.material', { material: entry.material }) })
  // CNT-10: a plan with phases keys its walls by what the work does to them.
  const phased = drawing.walls.filter((wall) => !wall.virtual && wall.phase !== undefined)
  const phases = shown.phases
  if (phases !== undefined && phased.length > 0) {
    if (phased.some((wall) => wall.phase === 'existing')) entries.push({ swatch: 'fill', color: phases.existing ?? look.wall, words: say('drawing.key.existingWall') })
    if (phased.some((wall) => wall.phase === 'new')) entries.push({ swatch: 'fill', color: phases.new ?? look.wall, words: say('drawing.key.newWall') })
  }
  if (phases !== undefined && [...drawing.walls, ...drawing.openings].some((part) => part.phase === 'demolished')) entries.push({ swatch: 'dash', color: phases.demolished, words: say('drawing.key.demolished') })
  if (drawing.walls.some((wall) => wall.virtual)) entries.push({ swatch: 'dash', color: look.virtual, words: say('drawing.key.virtual') })
  // CNT-16: the columns, in the outside walls' tone, and the structural grid's chain lines.
  if ((drawing.columns ?? []).length > 0) entries.push({ swatch: 'fill', color: look.wallExterior, words: say('drawing.key.column') })
  if ((drawing.grids ?? []).length > 0) entries.push({ swatch: 'dash', color: look.dimension, words: say('drawing.key.grid') })
  // CNT-19: the parking bays' marking and the ramps, drawn in ink.
  if ((drawing.bays ?? []).length > 0) entries.push({ swatch: 'line', color: look.wall, words: say('drawing.key.bay') })
  if ((drawing.ramps ?? []).length > 0) entries.push({ swatch: 'line', color: look.wall, words: say('drawing.key.ramp') })
  if (drawing.openings.some((o) => o.type === 'window')) entries.push({ swatch: 'fill', color: look.window, words: say('drawing.key.window') })
  if (shown.swings && drawing.openings.some((o) => o.type === 'door' && o.hinge !== undefined && o.swing !== undefined)) {
    entries.push({ swatch: 'door', color: look.wall, words: say('drawing.key.door') })
  }
  // SHT-11: the floor above's outline, and a stair past its cut, drawn dashed.
  if (shown.above === true) entries.push({ swatch: 'dash', color: look.wall, words: say('drawing.key.above') })
  for (const use of shown.uses) entries.push({ swatch: 'fill', color: (shown.useFills ?? USE_FILLS)[use], words: say('drawing.key.use', { use: roomUseWord(words, use) }) })
  for (const entry of shown.finishes ?? []) entries.push({ swatch: 'fill', color: entry.colour, words: say('drawing.key.finish', { finish: entry.finish }) })
  // CNT-9: the parts picked out, by what each colour stands for.
  for (const entry of shown.painted ?? []) entries.push({ swatch: 'fill', color: entry.colour, words: entry.words })
  if (shown.sketch) {
    for (const category of new Set(drawing.sketch.map((item) => item.category))) {
      entries.push({ swatch: 'line', color: look.labelSoft, words: say('drawing.key.sketch', { category }) })
    }
  }
  // WRT-6: drawn dashed in the warning colour (`paints.assumed`).
  if ([...drawing.walls, ...drawing.rooms, ...drawing.openings, ...drawing.items].some((part) => part.assumed === true)) {
    entries.push({ swatch: 'dash', color: look.warning, words: say('drawing.key.assumed') })
  }
  if (shown.marks) entries.push({ swatch: 'mark', color: look.warning, words: say('drawing.key.marks') })
  return entries
}

const MARGIN_PX = 16
const LINE_PX_KEY = 18
const SWATCH = { width: 22, height: 10 }
/** SHT-10: how far apart a hatch swatch's lines are, in pixels. */
const HATCH_SWATCH_PX = 3

/**
 * The band under the drawing for its title and its key, in pixels from its top-left corner:
 * the title on the first line, then the key's entries side by side, wrapping. Null with neither.
 * The title is the plan's own, as written; the key's heading is in `words`' language.
 */
export function writingBand(title: string | null, entries: readonly KeyEntry[], width: number, look: PlanLook, words: DrawingWords = ENGLISH_WORDS, notes: readonly string[] = []): PictureKey | null {
  if (title === null && entries.length === 0 && notes.length === 0) return null
  const nodes: SvgNode[] = []
  let y = MARGIN_PX
  if (title !== null) {
    const lines = wrapText(title, TEXT_PX.title, Math.max(width - 2 * MARGIN_PX, 80))
    lines.forEach((line) => {
      y += TEXT_PX.title
      nodes.push(el('text', { 'data-part': 'title', x: MARGIN_PX, y: n(y), fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.title }, [line]))
      y += 6
    })
  }
  if (entries.length > 0) {
    y += 8
    const heading = drawingText(words, 'drawing.key')
    nodes.push(el('text', { 'data-part': 'key-title', x: MARGIN_PX, y: n(y + 9), fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [heading]))
    // The entries start after the heading: 40 px, or more for a longer word ("Leyenda").
    const indent = Math.max(40, Math.ceil(estimateTextWidth(heading, TEXT_PX.warning) + 12))
    let x = MARGIN_PX + indent
    for (const entry of entries) {
      const span = SWATCH.width + 6 + estimateTextWidth(entry.words, TEXT_PX.warning) + 18
      if (x + span > width - MARGIN_PX && x > MARGIN_PX + indent) {
        x = MARGIN_PX + indent
        y += LINE_PX_KEY
      }
      nodes.push(el('g', { 'data-part': 'key-entry', transform: `translate(${n(x)} ${n(y)})` }, [swatchOf(entry, look), el('text', { x: SWATCH.width + 6, y: '9', fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [entry.words])]))
      x += span
    }
    y += LINE_PX_KEY
  }
  // VEW-17: the notes, numbered as their marks on the plan are, wrapped to the band's width.
  if (notes.length > 0) {
    y += 8
    nodes.push(el('text', { 'data-part': 'notes-title', x: MARGIN_PX, y: n(y + 9), fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [drawingText(words, 'drawing.notes')]))
    y += LINE_PX_KEY
    const indent = 40
    notes.forEach((text, index) => {
      const lines = wrapText(text, TEXT_PX.warning, Math.max(width - 2 * MARGIN_PX - indent, 80))
      nodes.push(el('text', { 'data-part': 'notes-number', x: MARGIN_PX + indent - 8, y: n(y + 9), 'text-anchor': 'end', fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [String(index + 1)]))
      lines.forEach((line) => {
        nodes.push(el('text', { 'data-part': 'notes-text', x: MARGIN_PX + indent, y: n(y + 9), fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [line]))
        y += LINE_PX_KEY
      })
    })
  }
  return { height: Math.ceil(y + MARGIN_PX / 2), nodes }
}

function swatchOf(entry: KeyEntry, look: PlanLook): SvgNode {
  const { width: w, height: h } = SWATCH
  switch (entry.swatch) {
    case 'fill':
      return el('rect', { 'data-part': 'key-swatch', x: 0, y: 0, width: w, height: h, fill: entry.color, stroke: look.labelSoft, 'stroke-width': 0.5 })
    case 'line':
      return el('path', { 'data-part': 'key-swatch', d: `M0,${h / 2}L${w},${h / 2}`, fill: 'none', stroke: entry.color, 'stroke-width': 1.5 })
    case 'dash':
      return el('path', { 'data-part': 'key-swatch', d: `M0,${h / 2}L${w},${h / 2}`, fill: 'none', stroke: entry.color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' })
    case 'door':
      return el('path', { 'data-part': 'key-swatch', d: `M2,${h}L2,0A${h},${h} 0 0 1 ${h + 2},${h}`, fill: 'none', stroke: entry.color, 'stroke-width': 1 })
    case 'mark':
      return el('circle', { 'data-part': 'key-swatch', cx: h / 2 + 2, cy: h / 2, r: h / 2 + 1, fill: entry.color })
    case 'hatch': {
      // SHT-10: the hatch across a box of paper, by the core's own lines. The key is drawn y down,
      // so an angle counter-clockwise on the plan turns the other way here.
      const ring = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
      const lines = (entry.angles ?? []).flatMap((angle) => hatchLines(ring, HATCH_SWATCH_PX, (-angle * Math.PI) / 180))
      const d = lines.map(([a, b]) => `M${n(a.x)},${n(a.y)}L${n(b.x)},${n(b.y)}`).join('')
      return el('g', { 'data-part': 'key-swatch' }, [
        el('rect', { x: 0, y: 0, width: w, height: h, fill: look.paper, stroke: look.labelSoft, 'stroke-width': 0.5 }),
        ...(d === '' ? [] : [el('path', { d, fill: 'none', stroke: entry.color, 'stroke-width': 0.75 })])
      ])
    }
  }
}

/**
 * VEW-13: the room key, for the rooms whose labels are their numbers: rooms of one name
 * together, their numbers in runs ("1–24 Stall"), side by side and wrapping under the heading
 * in `words`' language. Null when no room is keyed.
 */
export function roomKeyBand(keyed: readonly { readonly number: string; readonly name: string }[], width: number, look: PlanLook, words: DrawingWords = ENGLISH_WORDS): PictureKey | null {
  if (keyed.length === 0) return null
  const byName = new Map<string, string[]>()
  for (const room of keyed) {
    const list = byName.get(room.name)
    if (list) list.push(room.number)
    else byName.set(room.name, [room.number])
  }
  const nodes: SvgNode[] = []
  let y = MARGIN_PX
  const heading = drawingText(words, 'drawing.key.rooms')
  nodes.push(el('text', { 'data-part': 'room-key-title', x: MARGIN_PX, y: n(y + 9), fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [heading]))
  const indent = Math.max(40, Math.ceil(estimateTextWidth(heading, TEXT_PX.warning) + 12))
  let x = MARGIN_PX + indent
  for (const [name, list] of byName) {
    const entry = `${numberRuns(list)} ${name}`
    const span = estimateTextWidth(entry, TEXT_PX.warning) + 18
    if (x + span > width - MARGIN_PX && x > MARGIN_PX + indent) {
      x = MARGIN_PX + indent
      y += LINE_PX_KEY
    }
    nodes.push(el('text', { 'data-part': 'room-key-entry', x: n(x), y: n(y + 9), fill: look.label, 'font-family': look.font, 'font-size': TEXT_PX.warning }, [entry]))
    x += span
  }
  y += LINE_PX_KEY
  return { height: Math.ceil(y + MARGIN_PX / 2), nodes }
}

/** Room numbers in runs: whole numbers one after another as "3–7", the rest as written, by commas. */
export function numberRuns(numbers: readonly string[]): string {
  const parts: string[] = []
  let run: [number, number] | null = null
  const close = () => {
    if (run === null) return
    parts.push(run[0] === run[1] ? String(run[0]) : run[1] === run[0] + 1 ? `${run[0]}, ${run[1]}` : `${run[0]}–${run[1]}`)
    run = null
  }
  for (const number of numbers) {
    const whole = /^[1-9][0-9]{0,8}$/.test(number) ? Number(number) : null
    if (whole !== null && run !== null && whole === run[1] + 1) {
      run = [run[0], whole]
      continue
    }
    close()
    if (whole !== null) run = [whole, whole]
    else parts.push(number)
  }
  close()
  return parts.join(', ')
}

/** Two bands one over the other: `top`, then `below` moved down by its height. */
export function stackBands(top: PictureKey | null, below: PictureKey | null): PictureKey | null {
  if (top === null) return below
  if (below === null) return top
  return { height: top.height + below.height, nodes: [...top.nodes, el('g', { transform: `translate(0 ${top.height})` }, below.nodes)] }
}
