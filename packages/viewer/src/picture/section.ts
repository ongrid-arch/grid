/**
 * LVL-9: a section as a picture.
 *
 * Nothing here works out the section: the core does (`planSection`), and gives the cut parts
 * joined, what lies beyond them farthest first, the ground, the levels, the rooms and what it
 * took. This paints them, in the plan's looks and paper line weights (SHT-1):
 *
 * - what lies beyond the cut first, farthest first, each face filled with paper so it hides what is
 *   behind it, in the light `beyond` line;
 * - the cut parts solid, in the walls' tone, under the heavy outline the plan's cut walls have
 *   (written twice the `cut` pen, its inner half under the fill), or solid with no outline in a
 *   screen look;
 * - CNT-48: the fixtures and furniture the line cuts, in paper with a light outline, over the cut;
 * - what the section takes that the plan does not state, over the cut in a light tint and a dashed
 *   outline, never a hatch (a hatch reads as a material);
 * - VEW-65: the earth under the ground, in the cut, filled with paper and hatched as a material, the
 *   building's part below the ground left out of it, over the picture's whole width (`sectionEarth`);
 * - the ground line, twice as heavy as the cut, out to the picture's edges;
 * - each room's name and height, and the level of every floor, roof and the ground beside the
 *   drawing; LVL-20: a sloped roof's eaves and ridge, and under it each room's headroom bands, a
 *   dashed line at each band's height where the room has that much over its floor;
 * - under it, the section's name and line, and the list of what was taken.
 *
 * Pure: no DOM, no React.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Bounds, PlanSection, SectionLine, SectionPiece, Vec2 } from '@ongrid/floorplan/geometry'
import { hatchRings, levelText, metresText, planSection, sectionEarth } from '@ongrid/floorplan/geometry'
import { estimateTextWidth } from '../canvas2d/labelPlacement'
import { fitTo, pathOf } from '../canvas2d/viewport'
import { labelObstacles, placeLabel } from './sectionLabels'
import type { PictureKey } from './faults'
import { wrapText } from './faults'
import { TEXT_PX, lengthText, lineMetres, paperScaleOf } from './look'
import type { Look } from './look'
import type { Picture, PictureOptions } from './planSvg'
import { DEFAULT_WIDTH, displayOfPicture, lookOf } from './planSvg'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'
import { DEFAULT_LANGUAGE, languageDecimal, num, said, type Language } from '@ongrid/floorplan/messages'
import { drawingText, saidText, type DrawingWords } from './words'
import { METRES, showLength, type Display } from '@ongrid/floorplan/types/units'

export interface SectionPictureOptions {
  /** Width in pixels. 1200 by default. */
  readonly width?: number
  /** Height in pixels. By default it follows the section's shape, between 0.4 and 2.5 times the width. */
  readonly height?: number
  /** A named look or one of your own, as for a plan: `working` by default. */
  readonly look?: PictureOptions['look']
  /** N in 1:N for a paper look's pens, as for a plan; the picture's own when left out. */
  readonly paperScale?: number
  /** The section's name on the drawing and in the list under it. `A` by default. */
  readonly label?: string
  /** MSG-11: the language of its words; the plan's own display language when left out. */
  readonly language?: Language
  /** VEW-20: the units its levels and heights are written in; the plan's own display when left out. */
  readonly display?: Display
}

/** A section's picture, with the section it was drawn from, for the words that go with it. */
export interface SectionPicture extends Picture {
  readonly section: PlanSection
}

const MIN_SHAPE = 0.4
const MAX_SHAPE = 2.5
/** How opaque the tint over an assumed part is: light enough to leave the cut's outline readable. */
const ASSUMED_TINT = 0.22
/** A dash and its gap, in pixels, in the key's swatch. */
const ASSUMED_DASH_PX = [4, 3] as const
/** The level marks: the tick's length, the gap to the drawing and the room their words take, in pixels. */
const TICK_PX = 36
const GAP_PX = 14
const KEY_MARGIN_PX = 16
const KEY_LINE_PX = 17
/** VEW-65: how far apart the earth's hatch lines are: in millimetres on paper, in pixels on screen. */
const EARTH_MM = 2
const EARTH_PX = 9

const n = (value: number): string => lengthText(value)
const pixelGroup = (at: Vec2, mpp: number): string => `translate(${n(at.x)} ${n(-at.y)}) scale(${n(mpp)})`
const piecesPath = (pieces: readonly SectionPiece[]): string => pieces.map((p) => pathOf(p.outline) + p.holes.map(pathOf).join('')).join('')
const lineOf = (a: Vec2, b: Vec2): string => `M${a.x.toFixed(4)},${(-a.y).toFixed(4)}L${b.x.toFixed(4)},${(-b.y).toFixed(4)}`

interface LevelLabel {
  readonly level: number
  readonly words: string
  readonly part: string
}

/**
 * MSG-11: the words of a section: its language, the call's or the plan's own, with that
 * language's decimal mark, or the one the plan's display states. English keeps the point, as a
 * section writes its levels in metres whatever the display says.
 */
function sectionWords(plan: FloorPlan, asked: Language | undefined): DrawingWords {
  const language = asked ?? plan.display?.language ?? DEFAULT_LANGUAGE
  return { language, decimal: language === DEFAULT_LANGUAGE ? 'point' : (plan.display?.decimal ?? languageDecimal(language)) }
}

/**
 * VEW-20: the units the levels and heights are written in: the call's, else the plan's display,
 * else metres, with the drawing's own decimal mark.
 */
function unitsOf(plan: FloorPlan, options: SectionPictureOptions, tongue: DrawingWords): Display {
  const base = displayOfPicture(plan, { ...(options.display === undefined ? {} : { labels: { display: options.display } }) }) ?? METRES
  return { ...base, decimal: tongue.decimal }
}

/** The levels beside the drawing: every floor on the left; the roofs and the ground on the right. */
function levelLabels(section: PlanSection, tongue: DrawingWords, units: Display): { left: LevelLabel[]; right: LevelLabel[] } {
  const left = section.levels.map((l) => ({ level: l.level, words: `${levelText(l.level, units)} ${l.name || l.floor}`, part: 'section-level' }))
  const right: LevelLabel[] = [
    // LVL-20: a sloped roof the floor states is marked at its eaves and its ridge; any other at its top.
    ...section.roofs.flatMap((r) =>
      r.pitch !== undefined && r.pitch > 0 && r.eaves !== undefined && r.ridge !== undefined
        ? [
            { level: r.eaves, words: drawingText(tongue, 'drawing.section.eaves', { level: levelText(r.eaves, units) }), part: 'section-eaves-level' },
            { level: r.ridge, words: drawingText(tongue, 'drawing.section.ridge', { level: levelText(r.ridge, units) }), part: 'section-ridge-level' }
          ]
        : [{ level: r.level, words: drawingText(tongue, 'drawing.section.roof', { level: levelText(r.level, units) }), part: 'section-roof-level' }]
    ),
    { level: section.ground.level, words: drawingText(tongue, 'drawing.section.ground', { level: levelText(section.ground.level, units) }), part: 'section-ground-level' }
  ]
  return { left, right }
}

const widest = (labels: readonly LevelLabel[]): number => Math.max(0, ...labels.map((l) => estimateTextWidth(l.words, TEXT_PX.dimension)))

/** What the picture frames: the section, with room beside it for the level marks, in pixels. */
function frameOf(section: PlanSection, width: number, height: number | undefined, tongue: DrawingWords, units: Display): { framed: Bounds; width: number; height: number } {
  const { left, right } = levelLabels(section, tongue, units)
  const leftPx = widest(left) + TICK_PX + GAP_PX
  const rightPx = widest(right) + TICK_PX + GAP_PX
  const base = section.bounds
  const shape = base.width > 0 && base.height > 0 ? base.height / base.width : 0.5
  const tall = height ?? Math.max(1, Math.round(width * Math.min(Math.max(shape, MIN_SHAPE), MAX_SHAPE)))
  let framed = base
  // The labels are in pixels and the frame in metres: a few rounds settle how many metres they take.
  for (let round = 0; round < 4; round++) {
    const mpp = fitTo(framed, width / tall).width / width
    const min = { x: base.min.x - leftPx * mpp, y: base.min.y - TEXT_PX.dimension * 2 * mpp }
    const max = { x: base.max.x + rightPx * mpp, y: base.max.y + TEXT_PX.dimension * 2 * mpp }
    framed = { min, max, width: max.x - min.x, height: max.y - min.y }
  }
  return { framed, width, height: tall }
}

/** Words at a point of the section, in pixels: centred, upright. */
function words(at: Vec2, text: string, mpp: number, attrs: Attrs, dy = 0): SvgNode {
  return el('g', { transform: pixelGroup(at, mpp) }, [el('text', { y: n(dy), ...attrs }, [text])])
}

/** A level mark: a tick at its height, a small triangle on it, and its words over it. */
function levelMark(label: LevelLabel, x: number, side: 'left' | 'right', mpp: number, look: Look, stroke: number): SvgNode {
  const sign = side === 'left' ? -1 : 1
  const at = { x, y: label.level }
  const tick = `M0,0L${sign * TICK_PX},0`
  const triangle = `M${sign * 8},0L${sign * 8 - 4},-6L${sign * 8 + 4},-6Z`
  // VEW-65: the words stand on paper, so they read over the earth's hatch and the ground line.
  const wide = estimateTextWidth(label.words, TEXT_PX.dimension) + 4
  const backing = el('rect', { 'data-part': 'section-level-backing', x: n(side === 'left' ? -(TICK_PX + 6) - wide : TICK_PX + 2), y: n(2 - TEXT_PX.dimension), width: n(wide + 4), height: n(TEXT_PX.dimension + 4), fill: look.colors.paper })
  return el('g', { 'data-part': label.part, transform: pixelGroup(at, mpp) }, [
    backing,
    el('path', { d: tick, fill: 'none', stroke: look.colors.dimension, 'stroke-width': n(stroke / mpp) }),
    el('path', { d: triangle, fill: look.colors.dimension }),
    el('text', { x: sign * (TICK_PX + 4), y: '4', 'text-anchor': side === 'left' ? 'end' : 'start', fill: look.colors.dimensionText, 'font-family': look.colors.font, 'font-size': TEXT_PX.dimension }, [label.words])
  ])
}

/** The band under the drawing: the section's name and line, then what was taken, marked first. */
function sectionKey(section: PlanSection, label: string, width: number, look: Look, tongue: DrawingWords): PictureKey {
  const nodes: SvgNode[] = []
  const text = (y: number, words: string, x = KEY_MARGIN_PX, size: number = TEXT_PX.warning): SvgNode => el('text', { x, y: n(y), fill: look.colors.label, 'font-family': look.colors.font, 'font-size': size }, [words])
  const { from, to, toward } = section.line
  const point = (p: Vec2) => said('drawing.section.point', { x: num(metresText(p.x)), y: num(metresText(p.y)) })
  let y = KEY_MARGIN_PX + TEXT_PX.title
  nodes.push(el('text', { 'data-part': 'title', x: KEY_MARGIN_PX, y: n(y), fill: look.colors.label, 'font-family': look.colors.font, 'font-size': TEXT_PX.title }, [drawingText(tongue, 'drawing.section.name', { label })]))
  y += KEY_LINE_PX
  nodes.push(el('g', { 'data-part': 'section-line' }, [text(y, drawingText(tongue, `drawing.section.line.${toward}`, { from: point(from), to: point(to) }))]))
  const marked = section.assumed.filter((a) => a.hatched)
  const listed = section.assumed.filter((a) => !a.hatched)
  const inner = Math.max(width - 2 * KEY_MARGIN_PX - 30, 80)
  const entry = (words: string, swatch: SvgNode | null): void => {
    const lines = wrapText(words, TEXT_PX.warning, inner)
    y += 4
    nodes.push(el('g', { 'data-part': 'section-taken' }, [
      ...(swatch === null ? [] : [el('g', { transform: `translate(${KEY_MARGIN_PX} ${n(y + 4)})` }, [swatch])]),
      ...lines.map((line, i) => text(y + KEY_LINE_PX * (i + 1) - 4, line, KEY_MARGIN_PX + 30))
    ]))
    y += KEY_LINE_PX * lines.length
  }
  // VEW-38: where the line stands against the building, first: a line that misses it, or stops inside it.
  const reach: Array<'misses' | 'startInside' | 'endInside'> = [
    ...(section.reach.missesBuilding ? (['misses'] as const) : []),
    ...(section.reach.startInside ? (['startInside'] as const) : []),
    ...(section.reach.endInside ? (['endInside'] as const) : [])
  ]
  for (const key of reach) {
    const lines = wrapText(drawingText(tongue, `drawing.section.reach.${key}`), TEXT_PX.warning, inner)
    y += 4
    nodes.push(el('g', { 'data-part': 'section-reach', 'data-reach': key }, lines.map((line, i) => text(y + KEY_LINE_PX * (i + 1) - 4, line))))
    y += KEY_LINE_PX * lines.length
  }
  if (marked.length > 0) {
    y += KEY_LINE_PX
    nodes.push(text(y, drawingText(tongue, 'drawing.section.hatched')))
    for (const a of marked) entry(saidText(tongue, a.words, a.said), el('rect', { 'data-part': 'key-swatch', x: 0, y: 0, width: 22, height: 10, fill: look.colors.dimension, 'fill-opacity': ASSUMED_TINT, stroke: look.colors.label, 'stroke-width': 1, 'stroke-dasharray': ASSUMED_DASH_PX.join(' ') }))
  }
  if (listed.length > 0) {
    y += KEY_LINE_PX
    nodes.push(text(y, drawingText(tongue, 'drawing.section.listed')))
    for (const a of listed) entry(saidText(tongue, a.words, a.said), null)
  }
  return { height: Math.ceil(y + KEY_MARGIN_PX), nodes }
}

/**
 * The section of `plan` along `line` as a picture, framed with its level marks, and the list of
 * what it took under it.
 */
export function sectionPicture(plan: FloorPlan, line: SectionLine, options: SectionPictureOptions = {}): SectionPicture {
  const section = planSection(plan, line)
  const look = lookOf(options.look)
  const label = options.label ?? 'A'
  const tongue = sectionWords(plan, options.language)
  const requested = options.width ?? DEFAULT_WIDTH
  if (!Number.isInteger(requested) || requested < 1) throw new RangeError(`The picture's width must be a whole number of pixels, at least 1: got ${requested}`)
  const units = unitsOf(plan, options, tongue)
  const { framed, width, height } = frameOf(section, requested, options.height, tongue, units)
  const view = fitTo(framed, width / height, 0)
  const mpp = view.width / width
  const lines = lineMetres(look, mpp, options.paperScale)
  const paper = look.colors.paper
  const nodes: SvgNode[] = []

  // What lies beyond, farthest first: each face hides what is behind it.
  const beyond: SvgNode[] = section.beyond.map((face) =>
    face.edge === null
      ? el('path', { 'data-part': 'section-beyond', 'data-kind': face.kind, 'data-id': face.id, d: piecesPath(face.pieces), fill: paper, 'fill-rule': 'evenodd', stroke: look.colors.dimension, 'stroke-width': n(lines.width('elevationBack')), 'stroke-linejoin': 'round' })
      : el('path', { 'data-part': 'section-beyond', 'data-kind': face.kind, 'data-id': face.id, 'data-edge': 'true', d: lineOf(face.edge[0], face.edge[1]), fill: 'none', stroke: look.colors.dimension, 'stroke-width': n(lines.width('elevationBack')) })
  )
  nodes.push(el('g', { 'data-part': 'section-beyond-group' }, beyond))

  // VEW-65: the earth, in the cut over the picture's whole width: paper, so it hides what lies beyond
  // it, hatched at 45 degrees as a material is, the building's part below the ground left out.
  const earth = sectionEarth(section, view.x, view.x + view.width)
  if (earth.pieces.length > 0) {
    const spacing = look.lines.unit === 'mm' ? (EARTH_MM * (options.paperScale ?? paperScaleOf(mpp))) / 1000 : EARTH_PX * mpp
    const hatch = earth.pieces.flatMap((piece) => hatchRings([piece.outline, ...piece.holes], spacing, Math.PI / 4)).map(([a, b]) => lineOf(a, b)).join('')
    nodes.push(
      el('g', { 'data-part': 'section-earth-group' }, [
        el('path', { 'data-part': 'section-earth', d: piecesPath(earth.pieces), fill: paper, 'fill-rule': 'evenodd', stroke: 'none' }),
        ...(hatch === '' ? [] : [el('path', { 'data-part': 'section-earth-hatch', d: hatch, fill: 'none', stroke: look.lines.unit === 'mm' ? look.ink : look.colors.dimension, 'stroke-width': n(lines.width('hatch')) })])
      ])
    )
  }

  // The cut: solid, under the heavy outline in a paper look.
  const cutPath = piecesPath(section.cut)
  if (cutPath !== '') {
    const cut: SvgNode[] = []
    if (look.wallOutline !== null) {
      cut.push(el('path', { 'data-part': 'section-cut-outline', d: cutPath, fill: 'none', stroke: look.wallOutline, 'stroke-width': n(2 * lines.width('wallOutline')), 'stroke-linejoin': 'miter' }))
    }
    cut.push(el('path', { 'data-part': 'section-cut', d: cutPath, fill: look.colors.wall, 'fill-rule': 'evenodd' }))
    nodes.push(el('g', { 'data-part': 'section-cut-group' }, cut))
  }

  // VEW-23: a glazed wall is cut as glass in a frame, never solid: paper inside a frame, a glass
  // line along its long way, and a mullion where the cut ends (the frame's short sides).
  const panes = section.glass.flatMap((part) => part.rings.map((ring) => ({ id: part.id, ring })))
  if (panes.length > 0) {
    const frame = look.wallOutline ?? look.ink
    const glassNodes: SvgNode[] = panes.map(({ id, ring }) => {
      const xs = ring.map((p) => p.x)
      const ys = ring.map((p) => p.y)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const wide = x1 - x0 >= y1 - y0
      const mid = wide ? lineOf({ x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 }) : lineOf({ x: (x0 + x1) / 2, y: y0 }, { x: (x0 + x1) / 2, y: y1 })
      const mullions = wide ? lineOf({ x: x0, y: y0 }, { x: x0, y: y1 }) + lineOf({ x: x1, y: y0 }, { x: x1, y: y1 }) : lineOf({ x: x0, y: y0 }, { x: x1, y: y0 }) + lineOf({ x: x0, y: y1 }, { x: x1, y: y1 })
      return el('g', { 'data-part': 'section-glass', 'data-id': id }, [
        el('path', { 'data-part': 'section-glass-frame', d: pathOf(ring), fill: paper, stroke: frame, 'stroke-width': n(2 * lines.width('wallOutline')), 'stroke-linejoin': 'miter' }),
        el('path', { 'data-part': 'section-glass-line', d: mid, fill: 'none', stroke: frame, 'stroke-width': n(lines.width('wallOutline')) }),
        el('path', { 'data-part': 'section-mullion', d: mullions, fill: 'none', stroke: frame, 'stroke-width': n(2 * lines.width('wallOutline')) })
      ])
    })
    nodes.push(el('g', { 'data-part': 'section-glass-group' }, glassNodes))
  }

  // CNT-48: the fixtures and furniture the line cuts: paper in a light outline, over the cut, so a
  // kitchen island reads as a thing standing in the room and never as structure.
  const items = section.items.filter((part) => part.rings.length > 0)
  if (items.length > 0) {
    const outline = look.lines.unit === 'mm' ? look.ink : look.colors.dimension
    nodes.push(el('g', { 'data-part': 'section-item-group' }, items.map((part) => el('path', { 'data-part': 'section-item', 'data-id': part.id, d: part.rings.map((ring) => pathOf(ring)).join(''), fill: paper, stroke: outline, 'stroke-width': n(lines.width('wallOutline')), 'stroke-linejoin': 'round' }))))
  }

  // What was taken, over the cut: a light tint and a dashed outline, which no material has.
  const marked = section.assumed.filter((a) => a.hatched && a.pieces.length > 0)
  if (marked.length > 0) {
    const pen = lines.width('hatch')
    const outline = look.lines.unit === 'mm' ? look.ink : look.colors.label
    nodes.push(el('g', { 'data-part': 'section-assumed-group' }, marked.map((a) => el('path', { 'data-part': 'section-assumed', 'data-kind': a.kind, 'data-ids': a.ids.join(' '), d: piecesPath(a.pieces), fill: look.colors.dimension, 'fill-opacity': ASSUMED_TINT, 'fill-rule': 'evenodd', stroke: outline, 'stroke-width': n(pen), 'stroke-dasharray': `${n(pen * 6)} ${n(pen * 4)}`, 'stroke-linejoin': 'round' }))))
  }

  // The ground outside the building, in a facade's ground line (LVL-8), so the two drawings match;
  // VEW-65: out to the picture's edges with the earth.
  const g = section.ground
  if (earth.segments.length > 0) {
    const d = earth.segments.map(([a, b]) => lineOf({ x: a, y: g.level }, { x: b, y: g.level })).join('')
    nodes.push(el('path', { 'data-part': 'section-ground', 'data-stated': String(g.stated), d, fill: 'none', stroke: look.ink, 'stroke-width': n(lines.width('elevationGround')), 'stroke-linecap': 'butt' }))
  }

  // VEW-38: a line that ends inside the building breaks the cut there: a zigzag across its height.
  const ends = [...(section.reach.startInside ? [0] : []), ...(section.reach.endInside ? [section.length] : [])]
  if (ends.length > 0) {
    const ys = section.bounds
    const zig = (x: number): string => {
      const steps = 6
      const amp = 5 * mpp
      const top = ys.max.y
      const step = (ys.max.y - ys.min.y) / steps
      return Array.from({ length: steps + 1 }, (_, i) => `${i === 0 ? 'M' : 'L'}${(x + (i % 2 === 0 ? -amp : amp)).toFixed(4)},${(-(top - i * step)).toFixed(4)}`).join('')
    }
    nodes.push(el('g', { 'data-part': 'section-break-group' }, ends.map((x) => el('path', { 'data-part': 'section-break', 'data-at': x === 0 ? 'start' : 'end', d: zig(x), fill: 'none', stroke: look.ink, 'stroke-width': n(lines.width('wallOutline')), 'stroke-linejoin': 'miter' }))))
  }

  // LVL-20: under a sloped roof, each headroom band a dashed line over the room's floor where it has
  // that much height, with its figure at its start.
  const bands = section.rooms.flatMap((room) => (room.headroom ?? []).map((band) => ({ room, band })))
  if (bands.length > 0) {
    const pen = lines.width('elevationLevel')
    nodes.push(
      el(
        'g',
        { 'data-part': 'section-headroom-group' },
        bands.map(({ room, band }) => {
          const y = room.floorLevel + band.height
          const figure = units.length === 'm' ? num(metresText(band.height)) : showLength(band.height, units)
          return el('g', { 'data-part': 'section-headroom', 'data-id': room.room, 'data-height': n(band.height) }, [
            el('path', { d: lineOf({ x: band.from, y }, { x: band.to, y }), fill: 'none', stroke: look.colors.dimension, 'stroke-width': n(pen), 'stroke-dasharray': `${n(pen * 6)} ${n(pen * 4)}` }),
            words({ x: band.from, y }, drawingText(tongue, 'drawing.section.headroom', { height: figure }), mpp, { 'text-anchor': 'start', fill: look.colors.dimensionText, 'font-family': look.colors.font, 'font-size': TEXT_PX.dimension }, -3)
          ])
        })
      )
    )
  }

  // Each room: its name and height, in the largest empty part of the room's cut (VEW-50), clear of
  // every line and off the solid parts, on a halo of paper so they read on a dark fill.
  const roomWords: Attrs = { 'text-anchor': 'middle', fill: look.colors.label, 'font-family': look.colors.font, 'font-size': TEXT_PX.roomArea }
  const roomNodes: SvgNode[] = []
  const obstacles = labelObstacles(section)
  const haloNodes: SvgNode[] = []
  const halo = (text: string, at: Vec2, dy: number, attrs: Attrs): SvgNode[] => {
    haloNodes.push(words(at, text, mpp, { ...attrs, fill: 'none', stroke: paper, 'stroke-width': 4, 'stroke-linejoin': 'round' }, dy))
    return [words(at, text, mpp, attrs, dy)]
  }
  for (const room of section.rooms) {
    const across = (room.to - room.from) / mpp
    const tall = room.height / mpp
    const height = units.length === 'm' ? drawingText(tongue, 'drawing.section.height', { height: num(metresText(room.height)) }) : showLength(room.height, units)
    const name = room.name || room.room
    const attrs = { 'data-part': 'section-room', 'data-id': room.room, 'data-floor': room.floor, 'data-height': n(room.height), 'data-height-stated': String(room.heightStated) }
    const fits = (text: string): boolean => estimateTextWidth(text, TEXT_PX.roomArea) + 8 <= across
    const area = { from: room.from, to: room.to, bottom: room.floorLevel, top: room.floorLevel + room.height }
    const soft = { ...roomWords, fill: look.colors.labelSoft }
    const wide = (a: string, b: string): number => Math.max(estimateTextWidth(a, TEXT_PX.roomArea), estimateTextWidth(b, TEXT_PX.roomArea)) + 8
    // VEW-56: an open-air room or a void has no ceiling, so no height is written; a room too thin
    // for a second line keeps its name.
    const showHeight = room.open !== true
    const both = showHeight && tall >= TEXT_PX.roomArea * 3 && fits(name) && fits(height) ? placeLabel(area, { width: wide(name, height) * mpp, height: (2 * TEXT_PX.roomArea + 8) * mpp }, obstacles) : null
    if (both !== null) {
      roomNodes.push(el('g', attrs, [...halo(name, both, -2, roomWords), ...halo(height, both, TEXT_PX.roomArea + 2, soft)]))
      continue
    }
    const alone = (text: string, words: Attrs): SvgNode[] | null => {
      if (tall < TEXT_PX.roomArea * 1.5 || !fits(text)) return null
      const at = placeLabel(area, { width: wide(text, text) * mpp, height: (TEXT_PX.roomArea + 6) * mpp }, obstacles)
      return at === null ? null : halo(text, at, 4, words)
    }
    // The name is the room's own word: it goes before the height, which only follows a name that does not fit.
    const one = alone(name, roomWords) ?? (showHeight && !fits(name) ? alone(height, soft) : null)
    // Every room keeps its name: one with no clear place for it, a thin one, has it at the middle of its cut.
    const fallback = (): SvgNode[] => halo(name, { x: (room.from + room.to) / 2, y: room.floorLevel + room.height / 2 }, 4, roomWords)
    roomNodes.push(el('g', attrs, one ?? fallback()))
  }
  nodes.push(el('g', { 'data-part': 'section-room-halos' }, haloNodes))
  nodes.push(el('g', { 'data-part': 'section-rooms' }, roomNodes))

  // The levels beside the drawing.
  const { left, right } = levelLabels(section, tongue, units)
  const leftX = section.bounds.min.x - GAP_PX * mpp
  const rightX = section.bounds.max.x + GAP_PX * mpp
  const markStroke = lines.width('elevationLevel')
  nodes.push(el('g', { 'data-part': 'section-levels' }, [...left.map((l) => levelMark(l, leftX, 'left', mpp, look, markStroke)), ...right.map((l) => levelMark(l, rightX, 'right', mpp, look, markStroke))]))

  const key = sectionKey(section, label, width, look, tongue)
  const cutRooms = new Set(section.rooms.map((r) => `${r.floor}\u0000${r.room}`)).size
  const title = drawingText(tongue, cutRooms === 1 ? 'drawing.section.title.one' : 'drawing.section.title.many', { section: said('drawing.section.name', { label }), count: cutRooms })
  const picture: SectionPicture = { width, height, view, look, rooms: cutRooms, undecidedDoors: [], nodes, key, title, section }
  return tongue.language === DEFAULT_LANGUAGE ? picture : { ...picture, language: tongue.language }
}
