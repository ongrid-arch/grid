/**
 * The 2D plan as SVG elements: the one place its markup is written.
 *
 * The app's 2D view (`Canvas2D`) renders this tree through React, and `planToSvg` writes the
 * same tree out as text, so for the same plan, size and look the two give the same markup,
 * byte for byte. The geometry comes from `@ongrid/floorplan/geometry`; nothing here computes
 * any of its own.
 *
 * Each element carries its structure (`data-part`, `data-id`, …) and its final paint as SVG
 * presentation attributes (`fill`, `stroke`, `stroke-width`, `font-family`, …), so the markup
 * draws correctly on its own. In the app the stylesheets still win: CSS overrides
 * presentation attributes, which is how the dark theme, selection and the review tints keep
 * working. Every attribute written here is one `plan.css` also sets for that element. The
 * review's ghosts of an earlier version carry none: only the app draws them.
 *
 * Line widths are written in metres for the zoom being drawn (pixels times metres per pixel),
 * not with `vector-effect: non-scaling-stroke`, which only browsers honour. A paper look
 * (SHT-1's technical look) gives them in millimetres on paper instead, times the output scale.
 *
 * The look decides how each part is drawn, never where: the walls, openings, door swings,
 * dimensions and label places are the same in every look.
 *
 * Pure: no DOM, no React.
 */
import type { Dimension, Ghosts, OpeningSymbol, PlanAbove, PlanDrawing, PlanOpening, PlanRoom, PlanWall, ScheduleMark, SymbolPart, Vec2, WallDrawnKind } from '@ongrid/floorplan/geometry'
import { boundsWithDimensions, guessedDoorKind, hatchLines, openingDetail, openingSymbol, poleOfInaccessibility, slopeText, traceWall, wallDrawnKind } from '@ongrid/floorplan/geometry'
import type { DoorHanding } from '../canvas2d/doorHanding'
import { doorSymbolOf } from '../canvas2d/doorSymbol'
import { openingAt, stripAcross } from '../canvas2d/strip'
import type { Box, LabelStyle, PlacedLabel } from '../canvas2d/labelPlacement'
import {
  DIMENSION_DY,
  ROOM_AREA_DY,
  areaNumber,
  areaUnit,
  dimensionText,
  dimensionTextBox,
  doorSwingBox,
  drawingWords,
  formatArea,
  labelName,
  formLines,
  lineBox,
  lineOutline,
  placeDimensionLabel,
  placeRoomLabels,
  roomNumbers,
  withDisplay,
} from '../canvas2d/labelPlacement'
import type { Viewport } from '../canvas2d/viewport'
import { FRAME_MARGIN, pathOf, roomPathOf } from '../canvas2d/viewport'
import type { Look, PlanLook } from './look'
import { GRID_BUBBLE_PX, LINE_PX, TEXT_PX, UNDRAWN_TINT, detailShown, hatchSpacingMetres, lengthText, lineMetres, toLook, wallOutlineMetres } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'
import type { NumberedFault } from './faults'
import { faultMarks, undrawnRoomText } from './faults'
import { noteNodes, sketchNodes } from './writing'
import { scheduleMarkNodes } from './drawingMarks'
import { dimensionClutter, layoutMarks } from './markLayout'
import { drawingText } from './words'
import { num } from '@ongrid/floorplan/messages'
import { bayLabels } from './bayLabels'
import { siteNodes, sitePaints } from './site'
import { isSiteScale, withoutSiteClutter } from './siteScale'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'

/** The door-sweep warning mark's size on screen, whatever the zoom. */
export const WARNING_RADIUS_PX = 5

/** The pulse's size on screen, whatever the zoom. */
export const PULSE_RADIUS_PX = 6

/** The size of the "?" on a door whose swing is not stated, in screen pixels. */
export const UNDECIDED_TEXT_PX = 10

/** The presentation attributes this module writes. Nothing else in the markup uses them. */
export const PAINT_ATTRIBUTES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'paint-order',
  'font-family',
  'font-size',
  'text-anchor'
] as const

/**
 * What the app shows on top of a plain drawing: a live build, a review against an earlier
 * version, selection and hover. A picture uses none of it (`STILL`).
 */
export interface SceneLive {
  /** Parts being removed by a live build, drawn from the plan before and fading out. */
  readonly leaving: { readonly drawing: PlanDrawing; readonly ids: ReadonlySet<string>; readonly progress: number } | null
  /** The earlier version's removed and changed parts. */
  readonly ghosts: Ghosts | null
  /** Ghost rooms that were removed: they get a label saying so. */
  readonly removedRooms: readonly PlanRoom[]
  readonly selectedId: string | null
  /** What a current element says about itself in a review (`data-diff`, `data-focus`). */
  readonly marks: (id: string) => Attrs
  /** What a ghost says about itself. */
  readonly ghostAttrs: (id: string) => Attrs
  /** `data-hit` while the user hovers the warning of a door that runs into this. */
  readonly hit: (id: string) => Attrs
  /** A room's fill, 0 to 1, while it fades in. */
  readonly roomFill: (id: string) => number | null
  /** How much of a wall has been traced, 0 to 1. */
  readonly wallTrace: (id: string) => number | null
  /** How far a sliding wall still has to go, in plan metres. */
  readonly wallOffset: (id: string) => Vec2 | null
  /** How far an opening has opened, 0 to 1. */
  readonly openingOpen: (id: string) => number | null
  /** How far a dimension has faded in, 0 to 1. At 0 it is not drawn. */
  readonly dimensionShown: (dim: Dimension) => number
  readonly labelOpacity: (id: string) => number | undefined
  /** A room's area before and after, shown in place of its area. */
  readonly areaChange: (id: string) => { readonly before: number; readonly after: number } | undefined
  /** The door whose warning is hovered: its message shows. */
  readonly hoveredWarning: string | null
  /** Where the "still working" pulse sits, in plan coordinates. */
  readonly pulse: Vec2 | null
}

const none = (): Attrs => ({})
const nothing = (): null => null

/** A plain drawing: nothing in flight, nothing reviewed, nothing selected. */
export const STILL: SceneLive = {
  leaving: null,
  ghosts: null,
  removedRooms: [],
  selectedId: null,
  marks: none,
  ghostAttrs: none,
  hit: none,
  roomFill: nothing,
  wallTrace: nothing,
  wallOffset: nothing,
  openingOpen: nothing,
  dimensionShown: () => 1,
  labelOpacity: () => undefined,
  areaChange: () => undefined,
  hoveredWarning: null,
  pulse: null
}

export interface SceneInput {
  /** One floor's drawing (`buildFloorPlan` of `planForFloor`). */
  readonly drawing: PlanDrawing
  /** Which way each door opens, by opening id. A door without one draws as a plain gap. */
  readonly handings: ReadonlyMap<string, DoorHanding>
  /** What each door whose swing runs into something says, by opening id. */
  readonly doorWarnings: ReadonlyMap<string, string>
  readonly dimensions: readonly Dimension[]
  /** How many metres one pixel of the picture measures: the zoom. */
  readonly metersPerPixel: number
  /**
   * VEW-44: the part of the plan the picture shows. A label moved out of its room stays inside
   * it, so no leader is drawn to a label that would fall outside the picture. Left out, the
   * whole drawing and its margin, as a framed view always shows.
   */
  readonly view?: Viewport
  /** A named look, or colours of your own drawn the working way. */
  readonly look: Look | PlanLook
  /**
   * N in the output scale 1:N, for a look whose lines are in millimetres on paper. Left out,
   * the picture's own: each of its pixels a CSS pixel on paper.
   */
  readonly paperScale?: number
  /** How the room tags read: capitals, numbers, how the area is rounded. */
  readonly labels?: LabelStyle
  /**
   * The result record's lines on this floor, numbered in the whole record (MSG-8): each gets a
   * numbered mark on its part, with its words beside it. None by default.
   */
  readonly faults?: readonly NumberedFault[]
  /** SHT-7: what the drawing shows. Everything on, and rooms in one fill, by default. */
  readonly show?: Partial<SceneShow>
  /**
   * SHT-11: the outline of the floor above (`floorAbove` of the floor's slice), drawn dashed over
   * the room fills and under the walls. None by default.
   */
  readonly above?: PlanAbove
  /** SHT-7: each room's use by id, for `show.colourBy: 'use'`. */
  readonly uses?: ReadonlyMap<string, RoomUse>
  /**
   * SHT-10: each room's floor finish by id (CNT-15), for `show.colourBy: 'finish'`, and the plan's
   * floor finishes in the order its rooms first name them: the n-th takes the look's n-th tint.
   */
  readonly finishes?: { readonly rooms: ReadonlyMap<string, string>; readonly order: readonly string[] }
  /** SHT-10: the plan's wall materials in order (`planWallMaterials`): the n-th takes the look's n-th hatch. */
  readonly materials?: readonly string[]
  /** ARE-15: the schedules' marks (`DrawingMarks.schedule`), drawn by the room labels where they are placed. None by default. */
  readonly scheduleMarks?: readonly ScheduleMark[]
  readonly live?: Partial<SceneLive>
}

/** SHT-7: the parts of a drawing that can be left out, and how its rooms are filled. */
export interface SceneShow {
  readonly notes: boolean
  readonly sketch: boolean
  readonly areas: boolean
  readonly swings: boolean
  /** The door warning dots and the numbered marks of what went wrong (MSG-8). */
  readonly warnings: boolean
  /** SHT-11: the dashed outline of the floor above. */
  readonly above: boolean
  /**
   * `use` fills each room by its use, SHT-10's `finish` by its floor finish, each from the look's
   * tints; null gives every room the look's one fill.
   */
  readonly colourBy: 'use' | 'finish' | null
  /**
   * CNT-9: parts picked out, by id, each in its colour: a room's fill at half strength over its
   * own, a wall, door, window or opening laid over in the colour. Null for none.
   */
  readonly paint?: ReadonlyMap<string, string> | null
}

/** Everything shown, rooms in one fill. */
export const SHOW_ALL: SceneShow = { notes: true, sketch: true, areas: true, swings: true, warnings: true, above: true, colourBy: null }

/** The paint for each part, for one look, zoom and output scale. */
function paints(named: Look, mpp: number, paperScale: number | undefined) {
  const look = named.colors
  const line = lineMetres(named, mpp, paperScale)
  const width = (part: Parameters<typeof line.width>[0]): string => lengthText(line.width(part))
  const dashes = (part: Parameters<typeof line.dash>[0]): string => line.dash(part).map(lengthText).join(' ')
  const ink = named.ink
  const text = (fill: string, size: number): Attrs => ({
    fill,
    'font-family': look.font,
    'font-size': size,
    'text-anchor': 'middle'
  })
  return {
    room: { fill: look.room } as Attrs,
    // SHT-10: each kind of wall in its own fill; a wall hatched in a detailed drawing on the paper.
    wall: (kind: WallDrawnKind, phase?: PlanWall['phase'], hatched = false): Attrs => ({
      // CNT-10: an existing wall in its tone and a new one filled, where the look says so.
      fill: (phase === 'existing' ? named.phases.existing : phase === 'new' ? named.phases.new : null) ?? (hatched ? look.paper : named.walls.fill[kind])
    }),
    // SHT-10: a wall material's hatch, a door's or window's frame and a window's sill, in a detailed drawing.
    wallHatch: { fill: 'none', stroke: ink, 'stroke-width': width('hatch'), 'stroke-linecap': 'butt' } as Attrs,
    frame: { fill: look.paper, stroke: ink, 'stroke-width': width('frame'), 'stroke-linejoin': 'miter' } as Attrs,
    sill: { stroke: ink, 'stroke-width': width('sill'), 'stroke-linecap': 'butt' } as Attrs,
    // CNT-10: a wall or an opening to be demolished: a dashed outline, no fill.
    demolished: {
      fill: 'none',
      stroke: named.phases.demolished,
      'stroke-width': width('demolished'),
      'stroke-dasharray': dashes('demolished'),
      'stroke-linejoin': 'miter'
    } as Attrs,
    // Drawn under every wall's fill and twice as wide as the pen: the fill covers its inner
    // half, and where two walls meet, the seam, so what shows is one outline the pen's width
    // round the walls as a whole.
    // SHT-10: each kind of wall with its own pen.
    wallOutline: ((stroke: string | null) =>
      stroke === null
        ? null
        : (kind: WallDrawnKind): Attrs => ({
            fill: 'none',
            stroke,
            'stroke-width': lengthText(wallOutlineMetres(named, kind, mpp, paperScale)),
            'stroke-linejoin': 'miter'
          }))(named.wallOutline),
    virtual: {
      fill: 'none',
      stroke: look.virtual,
      'stroke-width': width('virtual'),
      'stroke-dasharray': dashes('virtual')
    } as Attrs,
    opening: (type: PlanOpening['type'], swing: boolean, above = false): Attrs =>
      // A paper look leaves the gap open, so the walls' outline shows across their cut ends.
      named.wallOutline !== null
        ? { fill: 'none', stroke: 'none' }
        : {
            fill: type === 'window' ? look.window : look.paper,
            ...(type === 'opening' || swing ? { stroke: 'none' } : { stroke: ink, 'stroke-width': width('opening') }),
            // SHT-10: a window above the plan's cut, its outline dashed.
            ...(above && type === 'window' && named.aboveDashed ? { 'stroke-dasharray': dashes('above') } : {})
          },
    jamb: { stroke: ink, 'stroke-width': width('jamb') } as Attrs,
    step: { stroke: ink, 'stroke-width': width('step'), 'stroke-linecap': 'butt' } as Attrs,
    stair: { fill: 'none', stroke: ink, 'stroke-width': width('stair') } as Attrs,
    // SHT-11: a stair past its break line, dashed as what lies above the cut.
    stairAbove: { fill: 'none', stroke: ink, 'stroke-width': width('stair'), ...(named.aboveDashed ? { 'stroke-dasharray': dashes('above') } : {}) } as Attrs,
    /** SHT-10: the dash of what lies above the plan's cut, or none in a look that draws it solid. */
    aboveDash: named.aboveDashed ? ({ 'stroke-dasharray': dashes('above') } as Attrs) : ({} as Attrs),
    stairArrow: { fill: ink, stroke: 'none' } as Attrs,
    above: { fill: 'none', stroke: ink, 'stroke-width': width('above'), 'stroke-dasharray': dashes('above') } as Attrs,
    // CNT-4: a flat's outline, a chain line as thin as the floor above's, in the paper's colour:
    // it runs along the middle of the walls, over them.
    flat: { fill: 'none', stroke: look.paper, 'stroke-width': width('above'), 'stroke-dasharray': dashes('chain'), 'stroke-linejoin': 'miter' } as Attrs,
    // BRF-4: a floor's stated outline, solid, at the weight of the floor above's line.
    outline: { fill: 'none', stroke: ink, 'stroke-width': width('above') } as Attrs,
    fixture: { fill: look.paper, stroke: ink, 'stroke-width': width('fixture'), 'stroke-linejoin': 'round' } as Attrs,
    fixtureLine: { fill: 'none', stroke: ink, 'stroke-width': width('fixture'), 'stroke-linecap': 'butt' } as Attrs,
    // CNT-16: a column cut through as a wall is, in the outside walls' tone, outlined in ink; a
    // structural grid's chain lines and its names' circles in the dimensions' colour.
    column: { fill: look.wallExterior, stroke: ink, 'stroke-width': width('column'), 'stroke-linejoin': 'miter' } as Attrs,
    gridLine: { fill: 'none', stroke: look.dimension, 'stroke-width': width('grid'), 'stroke-dasharray': dashes('chain') } as Attrs,
    gridBubble: { fill: look.paper, stroke: look.dimension, 'stroke-width': width('grid') } as Attrs,
    gridName: text(look.dimensionText, TEXT_PX.gridName),
    // CNT-19: a parking bay's marking and a ramp's outline and middle line, at a stair's weight;
    // the bay's number and the ramp's slope in the dimensions' text colour.
    bay: { fill: 'none', stroke: ink, 'stroke-width': width('stair'), 'stroke-linejoin': 'miter' } as Attrs,
    ramp: { fill: 'none', stroke: ink, 'stroke-width': width('stair') } as Attrs,
    rampArrow: { fill: ink, stroke: 'none' } as Attrs,
    bayNumber: text(look.dimensionText, TEXT_PX.bayNumber),
    rampSlope: text(look.dimensionText, TEXT_PX.rampSlope),
    doorLeaf: { stroke: ink, 'stroke-width': width('doorLeaf'), 'stroke-linecap': 'square' } as Attrs,
    doorArc: { fill: 'none', stroke: ink, 'stroke-width': width('doorArc') } as Attrs,
    windowFace: { stroke: ink, 'stroke-width': width('windowFace'), 'stroke-linecap': 'butt' } as Attrs,
    glass: { stroke: ink, 'stroke-width': width('glass'), 'stroke-linecap': 'butt' } as Attrs,
    undecided: {
      stroke: ink,
      'stroke-width': width('undecided'),
      'stroke-dasharray': dashes('undecided'),
      'stroke-linecap': 'butt'
    } as Attrs,
    undecidedText: {
      fill: ink,
      'font-family': look.font,
      'font-size': UNDECIDED_TEXT_PX,
      'text-anchor': 'middle'
    } as Attrs,
    // A disc of paper under the "?", so the dashed line never runs through it. Not a halo of
    // stroke under the text: Skia, which draws the PNG, does not honour `paint-order`.
    undecidedDisc: { fill: look.paper } as Attrs,
    // WRT-6 (lab WR-15): what the plan marks assumed, for the person to confirm: a dashed line in
    // the look's warning colour, with the undecided door's pen and dash, in every look.
    assumed: {
      fill: 'none',
      stroke: look.warning,
      'stroke-width': width('undecided'),
      'stroke-dasharray': dashes('undecided'),
      'stroke-linejoin': 'round'
    } as Attrs,
    extension: { stroke: look.dimension, 'stroke-width': width('extension') } as Attrs,
    tick: { stroke: look.dimension, 'stroke-width': width('tick'), 'stroke-linecap': 'butt' } as Attrs,
    dimensionLine: (room: boolean): Attrs =>
      room
        ? {
            stroke: look.dimensionSoft,
            'stroke-width': width('dimension'),
            'stroke-dasharray': dashes('roomDimension')
          }
        : { stroke: look.dimension, 'stroke-width': width('dimension') },
    dimensionText: (room: boolean): Attrs =>
      room
        ? text(look.dimensionSoftText, TEXT_PX.roomDimension)
        : text(look.dimensionText, TEXT_PX.dimension),
    label: text(look.label, TEXT_PX.roomName),
    leader: { stroke: look.labelSoft, 'stroke-width': width('leader') } as Attrs,
    area: text(look.labelSoft, TEXT_PX.roomArea),
    // In a group scaled to pixels, so these widths are pixels.
    warningDot: { fill: look.warning, stroke: look.paper, 'stroke-width': LINE_PX.warningRing } as Attrs,
    warningText: {
      fill: look.warning,
      'font-family': look.font,
      'font-size': TEXT_PX.warning,
      'paint-order': 'stroke',
      stroke: look.paper,
      'stroke-width': LINE_PX.warningHalo,
      'stroke-linejoin': 'round'
    } as Attrs,
    pulse: { fill: look.wallExterior } as Attrs,
    undrawn: {
      fill: look.warning,
      'fill-opacity': UNDRAWN_TINT,
      stroke: look.warning,
      // A mark of what went wrong, not a line of the drawing: in screen pixels in every look.
      'stroke-width': lengthText(LINE_PX.undrawn * mpp),
      'stroke-dasharray': LINE_PX.undrawnDash.map((value) => lengthText(value * mpp)).join(' ')
    } as Attrs,
    // BRF-3: the plot and what is on it, in the look's own site colours.
    site: sitePaints(named, line)
  }
}

type Paints = ReturnType<typeof paints>

const virtualPath = (points: readonly Vec2[]): string => `M${points.map((p) => `${p.x},${-p.y}`).join('L')}`

/** A dividing line's points: its two ends, or a curved one's stations (CNT-18). */
const linePoints = (wall: PlanWall): readonly Vec2[] => wall.curve?.path ?? wall.centerline

/** The first share `t` of a line, along it, for a line being traced. */
function lineShare(points: readonly Vec2[], t: number): Vec2[] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y))
  let left = t * lengths.reduce((sum, length) => sum + length, 0)
  const out = [points[0]!]
  for (let i = 0; i < lengths.length; i++) {
    const [a, b, length] = [points[i]!, points[i + 1]!, lengths[i]!]
    if (left >= length) {
      out.push(b)
      left -= length
      continue
    }
    const k = length === 0 ? 0 : left / length
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
    break
  }
  return out
}

/** SHT-11: the part each kind of a stair symbol's line is drawn as. */
const STAIR_PARTS = { outline: 'stair-outline', riser: 'stair-riser', walk: 'stair-line' } as const

/** A label group: placed in metres, then scaled so its contents are in pixels. */
/** How far an opening's id sits off its wall's face, in screen pixels. */
const OPENING_ID_PX = 12

const labelTransform = (at: Vec2, mpp: number): string => `translate(${at.x} ${-at.y}) scale(${mpp})`

/** How long the 45-degree tick across each end of a drafted dimension is, in screen pixels (SHT-4). */
export const DIMENSION_TICK_PX = 7

/**
 * The angle a number along a dimension line is turned by, in degrees as SVG turns (clockwise
 * on the page), so it reads from the bottom or from the right, never upside down.
 */
function readingAngle(a: Vec2, b: Vec2): number {
  // To a thousandth of a degree first, so an upright line a hair off reads like any other.
  let degrees = Number(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(3))
  if (degrees > 90) degrees -= 180
  if (degrees <= -90) degrees += 180
  // Plan y grows up and SVG y down, so a turn counter-clockwise on the plan is a negative one.
  return degrees === 0 ? 0 : -degrees
}

/**
 * A ghost of the earlier version's room, wall or opening. Ghosts carry no paint: they belong
 * to the review, which only the app shows, and its stylesheets alone decide their look.
 */
function roomShape(room: PlanRoom, attrs: Attrs, key?: string): SvgNode {
  return el('path', { d: roomPathOf(room), 'data-part': 'room', ...attrs }, [], key)
}

/** A solid wall is one path per run between its openings; a virtual wall is a line. */
function wallShape(wall: PlanWall, attrs: Attrs, key?: string): SvgNode {
  if (wall.virtual) {
    return el('path', { d: virtualPath(linePoints(wall)), 'data-part': 'virtual', ...attrs }, [], key)
  }
  return el(
    'g',
    {},
    wall.slices.map((slice) =>
      el('path', {
        d: pathOf(slice),
        'data-part': 'wall',
        'data-exposure': wall.exposure,
        ...attrs
      })
    ),
    key
  )
}

function openingShape(opening: PlanOpening, attrs: Attrs, key?: string): SvgNode {
  return el(
    'path',
    {
      d: pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness)),
      'data-part': 'opening',
      'data-type': opening.type,
      ...attrs
    },
    [],
    key
  )
}

/**
 * One dimension: the dimension line, the two extension lines that tie it to what it
 * measures, and the number. Where it goes comes from the geometry core.
 */
function dimensionMark(
  dim: Dimension,
  mpp: number,
  labelAt: Vec2 | null,
  opacity: number | undefined,
  paint: Paints,
  drafted: boolean
): SvgNode {
  const room = dim.kind === 'room'
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  const a = { x: dim.from.x + shift.x, y: dim.from.y + shift.y }
  const b = { x: dim.to.x + shift.x, y: dim.to.y + shift.y }

  // Extension lines overshoot the dimension line a little, as on a drawing.
  const overshoot = 0.08
  const tipA = { x: a.x + dim.normal.x * overshoot, y: a.y + dim.normal.y * overshoot }
  const tipB = { x: b.x + dim.normal.x * overshoot, y: b.y + dim.normal.y * overshoot }

  const children: SvgNode[] = []
  if (dim.offset !== 0) {
    children.push(
      el('line', { 'data-part': 'extension', x1: dim.from.x, y1: -dim.from.y, x2: tipA.x, y2: -tipA.y, ...paint.extension }),
      el('line', { 'data-part': 'extension', x1: dim.to.x, y1: -dim.to.y, x2: tipB.x, y2: -tipB.y, ...paint.extension })
    )
  }
  children.push(el('line', { 'data-part': 'dimension-line', x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, ...paint.dimensionLine(room) }))
  const span = Math.hypot(b.x - a.x, b.y - a.y)
  if (drafted && span > 0) {
    // A tick across each end, turned 45 degrees from the line, as a drawing marks it.
    const half = (DIMENSION_TICK_PX / 2) * mpp
    const along = { x: (b.x - a.x) / span, y: (b.y - a.y) / span }
    const tick = { x: ((along.x - along.y) * half) / Math.SQRT2, y: ((along.y + along.x) * half) / Math.SQRT2 }
    for (const end of [a, b]) {
      children.push(el('line', { 'data-part': 'dimension-tick', x1: end.x - tick.x, y1: -(end.y - tick.y), x2: end.x + tick.x, y2: -(end.y + tick.y), ...paint.tick }))
    }
  }
  if (labelAt) {
    // The number stands where every look puts it; a drafted look turns it along the line.
    const angle = drafted ? readingAngle(a, b) : 0
    children.push(
      el('g', { transform: labelTransform(labelAt, mpp) }, [
        el('text', { 'data-part': 'dimension-text', dy: String(DIMENSION_DY), ...(angle !== 0 && { transform: `rotate(${angle})` }), ...paint.dimensionText(room) }, [
          dimensionText(dim.value)
        ])
      ])
    )
  }
  // What each end measures to (SHT-4): `face`, `centre-line` or `finish`, from's then to's.
  return el(
    'g',
    { 'data-part': 'dimension', 'data-kind': dim.kind, 'data-id': dim.id, 'data-measured-to': dim.measuredTo.join(' '), opacity },
    children,
    dim.id
  )
}

/** The label boxes a dimension's number could meet anywhere along its line. */
function blocksNear(dim: Dimension, blocks: readonly Box[], mpp: number): Box[] {
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  const line = lineBox({ x: dim.from.x + shift.x, y: dim.from.y + shift.y }, { x: dim.to.x + shift.x, y: dim.to.y + shift.y }, mpp)
  const text = dimensionTextBox({ x: 0, y: 0 }, dim, mpp)
  const reach: Box = {
    minX: line.minX + text.minX,
    maxX: line.maxX + text.maxX,
    minY: line.minY + text.minY,
    maxY: line.maxY + text.maxY
  }
  return blocks.filter((block) => block.minX < reach.maxX && reach.minX < block.maxX && block.minY < reach.maxY && reach.minY < block.maxY)
}

type Line = readonly [Vec2, Vec2]

/** The line from `a` to `b` moved `by` metres along the opening's normal, in SVG coordinates. */
function across(opening: PlanOpening, by: number): Line {
  const shift = (p: Vec2): Vec2 => ({ x: p.x + opening.normal.x * by, y: -(p.y + opening.normal.y * by) })
  return [shift(opening.from), shift(opening.to)]
}

const lineEl = (part: string, [a, b]: Line, attrs: Attrs): SvgNode => el('line', { 'data-part': part, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...attrs })

/**
 * A window as the wall's break bridged by thin lines: one along each face of the wall and the
 * glass line along its middle. Drawing, not a target.
 */
function windowSymbol(opening: PlanOpening, paint: Paints, panes = false, above = false): SvgNode {
  const half = opening.thickness / 2
  // SHT-10: a window above the plan's cut, every line dashed.
  const dash = above ? paint.aboveDash : {}
  const flip = ([a, b]: readonly [Vec2, Vec2]): Line => [
    { x: a.x, y: -a.y },
    { x: b.x, y: -b.y }
  ]
  // SHT-10: in a detailed drawing, its glass as the core lays out its two panes (`openingDetail`).
  const glass = panes ? openingDetail(opening).glass.map((pane) => lineEl('window-glass', flip(pane), { ...paint.glass, ...dash })) : [lineEl('window-glass', across(opening, 0), { ...paint.glass, ...dash })]
  return el(
    'g',
    { 'data-part': 'window-symbol', 'data-opening': opening.id, 'data-above': above ? 'true' : undefined, 'pointer-events': 'none', 'aria-hidden': 'true' },
    [lineEl('window-face', across(opening, half), { ...paint.windowFace, ...dash }), lineEl('window-face', across(opening, -half), { ...paint.windowFace, ...dash }), ...glass],
    `${opening.id}:window`
  )
}

/**
 * SHT-10: a door's or window's detail in a drawing at 1:50 or larger, as the core lays it out
 * (`openingDetail`): a frame at each side of the hole and a window's sill on each face of the
 * wall. Null for a doorless opening. Drawing, not a target.
 */
function detailNode(opening: PlanOpening, paint: Paints): SvgNode | null {
  const detail = openingDetail(opening)
  if (detail.frames.length === 0) return null
  const dash = opening.above ? paint.aboveDash : {}
  // The pen is centred on the ring's edge, so the ring is drawn half the pen's width in: the whole
  // stroke then lies inside the wall's faces and the hole's edges, never past them.
  const inset = Number(paint.frame['stroke-width']) / 2
  const rings = detail.frames.map((ring) => insetRing(ring, inset))
  return el(
    'g',
    { 'data-part': 'opening-detail', 'data-opening': opening.id, 'pointer-events': 'none', 'aria-hidden': 'true' },
    [
      ...rings.map((ring, index) => el('path', { 'data-part': 'frame', d: pathOf(ring), ...paint.frame, ...dash }, [], `f${index}`)),
      ...detail.sills.map(([a, b], index) => el('line', { 'data-part': 'sill', x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, ...paint.sill, ...dash }, [], `s${index}`))
    ],
    `${opening.id}:detail`
  )
}

/** A rectangle's ring with every edge moved `by` metres inward (not past its middle). */
function insetRing(ring: readonly Vec2[], by: number): Vec2[] {
  if (ring.length !== 4 || !(by > 0)) return [...ring]
  const centre = { x: (ring[0]!.x + ring[2]!.x) / 2, y: (ring[0]!.y + ring[2]!.y) / 2 }
  const side = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)
  const [u, v] = [side(ring[0]!, ring[1]!), side(ring[1]!, ring[2]!)]
  if (!(u > 0 && v > 0)) return [...ring]
  // Each corner moves toward the middle by `by` along both of the rectangle's edge directions.
  const ex = { x: (ring[1]!.x - ring[0]!.x) / u, y: (ring[1]!.y - ring[0]!.y) / u }
  const ey = { x: (ring[2]!.x - ring[1]!.x) / v, y: (ring[2]!.y - ring[1]!.y) / v }
  const cu = Math.min(by, u / 4)
  const cv = Math.min(by, v / 4)
  return ring.map((p) => {
    const su = Math.sign((p.x - centre.x) * ex.x + (p.y - centre.y) * ex.y)
    const sv = Math.sign((p.x - centre.x) * ey.x + (p.y - centre.y) * ey.y)
    return { x: p.x - su * cu * ex.x - sv * cv * ey.x, y: p.y - su * cu * ex.y - sv * cv * ey.y }
  })
}

/** CNT-14: the drawing's names of a symbol's lines, by what each is. */
const PIECE_PARTS: Readonly<Record<SymbolPart, string>> = {
  jamb: 'jamb',
  leaf: 'door-leaf',
  panel: 'door-panel',
  face: 'window-face',
  glass: 'window-glass',
  arrow: 'door-arrow'
}

/**
 * CNT-14: a door or window that states its kind, or the part of it that opens, drawn from its
 * kind's symbol (`openingSymbol` in the core): every line and swing where the core puts it, a
 * line above the plan's cut or hidden in the wall dashed. Drawing, not a target.
 */
function kindSymbolNode(opening: PlanOpening, symbol: OpeningSymbol, paint: Paints, opacity: number | undefined): SvgNode {
  const flip = (p: Vec2): Vec2 => ({ x: p.x, y: -p.y })
  const pen = (part: SymbolPart): Attrs =>
    part === 'jamb' ? paint.jamb : part === 'leaf' ? paint.doorLeaf : part === 'glass' ? paint.glass : part === 'arrow' ? paint.jamb : paint.windowFace
  const children = symbol.pieces.map((piece) => {
    if (piece.shape === 'arc') {
      const a = flip(piece.tip)
      const b = flip(piece.far)
      const r = piece.radius.toFixed(4)
      const d = `M${a.x.toFixed(4)},${a.y.toFixed(4)}A${r},${r} 0 0 ${piece.counterClockwise ? 1 : 0} ${b.x.toFixed(4)},${b.y.toFixed(4)}`
      return el('path', { 'data-part': 'door-arc', d, ...paint.doorArc })
    }
    const [a, b] = [flip(piece.from), flip(piece.to)]
    const attrs = pen(piece.part)
    return el('line', {
      'data-part': PIECE_PARTS[piece.part],
      'data-above': piece.above || opening.above ? 'true' : undefined,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      ...attrs,
      // SHT-10: a window wholly above the plan's cut is dashed whatever its kind.
      ...(piece.above || opening.above ? paint.aboveDash : {})
    })
  })
  const door = opening.type === 'door'
  return el(
    'g',
    {
      'data-part': door ? 'door-symbol' : 'window-symbol',
      'data-opening': opening.id,
      'data-kind': symbol.kind,
      'pointer-events': 'none',
      'aria-hidden': 'true',
      opacity
    },
    children,
    `${opening.id}:${door ? 'door' : 'window'}`
  )
}

/** CNT-14: whether a door or window is drawn from its kind's symbol: it states a kind or the part of it that opens. */
const drawnByKind = (handing: DoorHanding | undefined): boolean => handing?.kind !== undefined || handing?.opens !== undefined

/**
 * VEW-22: what a door is drawn from: its own hanging, or for a door at least `wideSingleLeaf`
 * wide that states no kind, the same with Grid's guess (`guessedDoorKind`), a pair or a sliding
 * door, never one leaf as wide as the door. The same object when nothing is guessed.
 */
export function drawnHanding(opening: PlanOpening, handing: DoorHanding | undefined): DoorHanding | undefined {
  if (opening.type !== 'door') return handing
  const kind = guessedDoorKind(Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y), handing ?? {})
  return kind === null ? handing : { ...handing, kind }
}

/**
 * A door whose hinge or swing the plan does not state: a dashed line across the gap and a "?",
 * so it reads as a door still to be decided, never as a guessed swing or an open gap.
 */
function undecidedSymbol(opening: PlanOpening, mpp: number, paint: Paints): SvgNode {
  const at = { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 }
  return el(
    'g',
    { 'data-part': 'door-undecided', 'data-opening': opening.id, 'pointer-events': 'none', role: 'img', 'aria-label': drawingText(drawingWords(), 'drawing.undecidedDoor') },
    [
      lineEl('door-undecided-line', across(opening, 0), paint.undecided),
      el('g', { transform: labelTransform(at, mpp) }, [
        el('circle', { 'data-part': 'door-undecided-disc', r: UNDECIDED_TEXT_PX * 0.6, ...paint.undecidedDisc }),
        el('text', { 'data-part': 'door-undecided-mark', dy: '3.5', ...paint.undecidedText }, ['?'])
      ])
    ],
    `${opening.id}:undecided`
  )
}

/** SHT-7, SHT-10: a room's tint, by its use or its floor finish, from the look's tints; none for the look's one fill. */
function tintOf(look: Look, by: SceneShow['colourBy'], id: string, input: SceneInput): Attrs {
  if (by === 'use') {
    const use = input.uses?.get(id)
    return use === undefined ? {} : { fill: look.tints.uses[use] }
  }
  if (by === 'finish' && look.tints.finishes.length > 0) {
    const finish = input.finishes?.rooms.get(id)
    const at = finish === undefined ? -1 : input.finishes!.order.indexOf(finish)
    return at < 0 ? {} : { fill: look.tints.finishes[at % look.tints.finishes.length]! }
  }
  return {}
}

/** The plan's elements, back to front: what goes inside the `<svg>`. */
/**
 * A room's label as it was placed (VEW-13): the plain form as it has always been drawn, else its
 * lines at its size, turned a quarter to read from the bottom when it is turned. A keyed label is
 * the room's number, with the room's name in `data-name` for the room key (`roomKeyOf`).
 */
function labelNode(label: PlacedLabel, name: string, area: string[] | null, opacity: number | undefined, mpp: number, paint: Paints, key: string): SvgNode {
  const { form } = label
  const transform = `${labelTransform(label.at, mpp)}${form.turned ? ' rotate(-90)' : ''}`
  if (form.scale === 1 && !form.keyed && form.names.length === 1 && form.area !== null) {
    return el(
      'g',
      { transform, opacity },
      [
        el('text', { 'data-part': 'label', ...paint.label }, [name]),
        ...(area === null ? [] : [el('text', { 'data-part': 'area', dy: String(ROOM_AREA_DY), ...paint.area }, area)])
      ],
      key
    )
  }
  const lines = formLines(form)
  const size = (attrs: Attrs, px: number): Attrs => ({ ...attrs, 'font-size': lengthText(px * form.scale) })
  return el(
    'g',
    { transform, opacity, ...(form.keyed ? { 'data-keyed': form.names[0]!, 'data-name': name } : {}) },
    [
      ...form.names.map((line, i) => el('text', { 'data-part': 'label', ...(i === 0 ? {} : { dy: lengthText(lines.names[i]!) }), ...size(paint.label, TEXT_PX.roomName) }, [line])),
      ...(form.area === null || area === null || lines.area === null ? [] : [el('text', { 'data-part': 'area', dy: lengthText(lines.area), ...size(paint.area, TEXT_PX.roomArea) }, area)])
    ],
    key
  )
}

/**
 * VEW-13: the rooms whose labels are their numbers in this scene, in the scene's order: each
 * number with the room's name as drawn, for the room key under the drawing.
 */
export function roomKeyOf(nodes: readonly SvgNode[]): { readonly number: string; readonly name: string }[] {
  return nodes.flatMap((node) => {
    const number = node.attrs['data-keyed']
    const name = node.attrs['data-name']
    return node.key?.startsWith('label:') === true && number !== undefined && name !== undefined ? [{ number: String(number), name: String(name) }] : []
  })
}

export function planScene(input: SceneInput): SvgNode[] {
  return withDisplay(input.labels?.display, () => planSceneIn(input))
}

function planSceneIn(input: SceneInput): SvgNode[] {
  const { drawing, handings, doorWarnings, metersPerPixel: mpp } = input
  // VEW-31: the dimensions as they are drawn, the chains clear of each other and the grids' names past them.
  const layout = layoutMarks(drawing, isSiteScale(drawing.bounds) ? withoutSiteClutter(input.dimensions) : input.dimensions)
  const dimensions = layout.dimensions
  const look = toLook(input.look)
  const style = input.labels ?? {}
  const decimals = style.areaDecimals ?? 2
  const live: SceneLive = { ...STILL, ...input.live }
  const paint = paints(look, mpp, input.paperScale)
  const show: SceneShow = { ...SHOW_ALL, ...input.show }
  const picked = show.paint ?? null
  const fillOf = (id: string): Attrs => {
    const colour = picked?.get(id)
    const base = { ...paint.room, ...tintOf(look, show.colourBy, id, input) }
    return colour === undefined ? base : { ...base, fill: colour, 'fill-opacity': 0.45 }
  }
  // SHT-10: the detail a drawing at 1:50 or larger shows, in a look that has it.
  const detail = detailShown(look, mpp, input.paperScale) ? look.detail : null
  const materials = input.materials ?? []
  const hatched = (wall: PlanWall): boolean => detail !== null && !wall.virtual && wall.material !== undefined && materials.includes(wall.material)
  const out: SvgNode[] = []

  const selected = (id: string): boolean => id === live.selectedId

  if (live.leaving) {
    // Removed parts, drawn from the plan before, fading out. Not clickable: they are
    // already gone from the plan.
    const { drawing: before, ids, progress } = live.leaving
    const children: SvgNode[] = []
    for (const room of before.rooms) {
      if (!ids.has(room.id)) continue
      children.push(el('path', { d: roomPathOf(room), 'data-part': 'room', 'data-id': room.id, ...paint.room }, [], room.id))
    }
    for (const wall of before.walls) {
      if (!ids.has(wall.id)) continue
      if (wall.virtual) {
        children.push(
          el('path', { d: virtualPath(linePoints(wall)), 'data-part': 'virtual', 'data-id': wall.id, ...paint.virtual }, [], wall.id)
        )
        continue
      }
      wall.slices.forEach((slice, index) =>
        children.push(
          el(
            'path',
            {
              d: pathOf(slice),
              'data-part': 'wall',
              'data-id': wall.id,
              'data-exposure': wall.exposure,
              'data-wall-kind': wallDrawnKind(wall),
              ...paint.wall(wallDrawnKind(wall))
            },
            [],
            `${wall.id}:${index}`
          )
        )
      )
    }
    for (const opening of before.openings) {
      if (!ids.has(opening.id)) continue
      children.push(
        el(
          'path',
          {
            d: pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness)),
            'data-part': 'opening',
            'data-type': opening.type,
            'data-id': opening.id,
            ...paint.opening(opening.type, false)
          },
          [],
          opening.id
        )
      )
    }
    out.push(el('g', { 'data-leaving': 'true', opacity: 1 - progress, 'pointer-events': 'none' }, children, 'leaving'))
  }

  // BRF-3: the site, under everything: the building covers what it stands on. Drawn only.
  if (drawing.site !== null && drawing.site !== undefined) out.push(...siteNodes(drawing.site, paint.site, mpp))
  // CNT-6 (C23): the context round the plan, dashed under everything: drawn only, never measured.
  const context = drawing.context ?? []
  if (context.length > 0) {
    out.push(
      el(
        'g',
        { 'data-part': 'context', 'pointer-events': 'none', 'aria-hidden': 'true' },
        context.map((shape) => el('path', { 'data-part': 'context-shape', 'data-context': shape.id, d: virtualPath([...shape.points, shape.points[0]!]), ...paint.above }, [], shape.id)),
        'context'
      )
    )
  }

  // A ghost room lies under the current rooms, like a floor that used to be there.
  for (const room of live.ghosts?.rooms ?? []) {
    out.push(roomShape(room, live.ghostAttrs(room.id), `ghost-room-${room.id}`))
  }

  for (const room of drawing.rooms) {
    out.push(
      el(
        'path',
        {
          d: roomPathOf(room),
          'data-part': 'room',
          'data-id': room.id,
          'data-selectable': 'true',
          'data-selected': selected(room.id),
          opacity: live.roomFill(room.id) ?? undefined,
          ...live.marks(room.id),
          ...fillOf(room.id)
        },
        [],
        room.id
      )
    )
  }

  // CNT-16: each structural grid, its chain lines over the room fills and under the walls, and
  // each line's name in a circle past both its ends. Drawing, not a target. Its spacing is with
  // the other dimensions.
  for (const grid of drawing.grids ?? []) {
    const r = GRID_BUBBLE_PX * mpp
    out.push(
      el(
        'g',
        { 'data-part': 'grid', 'data-id': grid.id, 'data-name': grid.name ?? undefined, 'pointer-events': 'none', 'aria-hidden': 'true' },
        grid.lines.flatMap((line, index) => {
          // VEW-31: a name's circle stands past the chains in its way; the line runs on to it.
          const reach = { from: layout.gridReach(grid.id, line.set, 'from'), to: layout.gridReach(grid.id, line.set, 'to') }
          const starts = { x: line.from.x + line.along.x * reach.from, y: line.from.y + line.along.y * reach.from }
          const finish = { x: line.to.x - line.along.x * reach.to, y: line.to.y - line.along.y * reach.to }
          const ends = [
            { x: starts.x + line.along.x * r, y: starts.y + line.along.y * r },
            { x: finish.x - line.along.x * r, y: finish.y - line.along.y * r }
          ]
          return [
            el('path', { 'data-part': 'grid-line', 'data-line': line.name, d: virtualPath([starts, finish]), ...paint.gridLine }, [], `l${index}`),
            ...ends.flatMap((at, end) => [
              el('circle', { 'data-part': 'grid-bubble', cx: at.x, cy: -at.y, r, ...paint.gridBubble }, [], `b${index}-${end}`),
              el('g', { transform: labelTransform(at, mpp) }, [el('text', { 'data-part': 'grid-name', dy: String(DIMENSION_DY), ...paint.gridName }, [line.name])], `n${index}-${end}`)
            ])
          ]
        }),
        `grid:${grid.id}`
      )
    )
  }

  // CNT-12: the fixtures, over the room fills and under the walls, so a wall covers a fixture
  // that runs into it. Each is its symbol to scale, in the wall's ink on the paper. Drawing, not
  // a target: clicks reach the room underneath. Lit, like a wall, while the warning of a door
  // that swings into it is hovered (CNT-13).
  for (const item of drawing.items) {
    out.push(
      el(
        'g',
        { 'data-part': 'fixture', 'data-id': item.id, 'data-kind': item.kind, 'data-room': item.room ?? undefined, 'pointer-events': 'none', ...live.hit(item.id) },
        [
          ...item.rings.map((ring, index) => el('path', { 'data-part': 'fixture-ring', d: `${pathOf(ring)}`, ...paint.fixture }, [], `r${index}`)),
          ...item.lines.map((line, index) => el('path', { 'data-part': 'fixture-line', d: virtualPath(line), ...paint.fixtureLine }, [], `l${index}`))
        ],
        `fixture:${item.id}`
      )
    )
  }

  // SHT-11: a lift shaft's cross, corner to corner, over its room's fill and under the walls that
  // box it. Drawing, not a target.
  for (const lift of drawing.lifts) {
    out.push(
      el(
        'g',
        { 'data-part': 'lift', 'data-id': lift.id, 'pointer-events': 'none', 'aria-hidden': 'true' },
        lift.lines.map(([a, b], index) => el('path', { 'data-part': 'lift-cross', d: virtualPath([a, b]), ...paint.stair }, [], String(index))),
        `lift:${lift.id}`
      )
    )
  }

  // BRF-4 (C17): the outline the floor states, a solid line round it: the massing before any
  // wall, under the walls once they are drawn. Drawing, not a target.
  const floorRing = drawing.outline
  if (floorRing !== undefined && floorRing.length >= 3) {
    out.push(el('path', { 'data-part': 'floor-outline', d: virtualPath([...floorRing, floorRing[0]!]), ...paint.outline, 'pointer-events': 'none', 'aria-hidden': 'true' }, [], 'floor-outline'))
  }

  // SHT-11: the outline of the floor above, dashed, over the floors and under the walls, so a
  // stretch over an inner wall is hidden by it. Drawing, not a target.
  const above = input.above
  if (show.above && above !== undefined && above.lines.length > 0) {
    out.push(
      el(
        'g',
        { 'data-part': 'above', 'data-floors': above.floors.join(' '), 'pointer-events': 'none', 'aria-hidden': 'true' },
        above.lines.map((line, index) => el('path', { 'data-part': 'above-line', d: virtualPath(line), ...paint.above }, [], String(index))),
        'above'
      )
    )
  }

  // Ghost walls and openings go over the room fills, which are opaque: a removed partition
  // or a wall that moved outward lies inside a current room. They stay under the current
  // walls, so a wall that kept its place covers its own ghost.
  for (const wall of live.ghosts?.walls ?? []) {
    out.push(wallShape(wall, live.ghostAttrs(wall.id), `ghost-wall-${wall.id}`))
  }
  for (const opening of live.ghosts?.openings ?? []) {
    out.push(openingShape(opening, live.ghostAttrs(opening.id), `ghost-opening-${opening.id}`))
  }

  // A paper look's heavy outline round the cut walls, under their fills (`paints`). Drawing, not
  // a target: clicks reach the walls on top.
  const outline = paint.wallOutline
  if (outline) {
    out.push(
      el(
        'g',
        { 'data-part': 'wall-outlines', 'pointer-events': 'none', 'aria-hidden': 'true' },
        drawing.walls.flatMap((wall) =>
          wall.virtual || wall.phase === 'demolished' ? [] : wall.slices.map((slice) => el('path', { d: pathOf(slice), 'data-part': 'wall-outline', 'data-wall': wall.id, ...outline(wallDrawnKind(wall)) }))
        ),
        'wall-outlines'
      )
    )
  }

  // SHT-7: the sketch layer, over the floors and under the walls. Drawn only.
  if (show.sketch) out.push(...sketchNodes(drawing.sketch, mpp, look.colors))

  for (const wall of drawing.walls) {
    const tracing = live.wallTrace(wall.id)
    const offset = live.wallOffset(wall.id)
    const transform = offset ? `translate(${offset.x} ${-offset.y})` : undefined

    // CNT-10: a wall to be demolished is drawn as it stands before the work, dashed and unfilled,
    // under what stands after it. Drawing, not a target.
    if (wall.phase === 'demolished') {
      const shapes = wall.virtual ? [el('path', { d: virtualPath(linePoints(wall)), 'data-part': 'demolished-wall', 'data-id': wall.id, ...paint.demolished })] : wall.slices.map((slice) => el('path', { d: pathOf(slice), 'data-part': 'demolished-wall', 'data-id': wall.id, ...paint.demolished }))
      out.push(el('g', { 'data-phase': 'demolished', 'pointer-events': 'none' }, shapes, `demolished-${wall.id}`))
      continue
    }

    if (wall.virtual) {
      const points = linePoints(wall)
      out.push(
        el(
          'path',
          {
            d: virtualPath(tracing === null ? points : lineShare(points, tracing)),
            'data-part': 'virtual',
            'data-id': wall.id,
            'data-moving': offset ? wall.id : undefined,
            transform,
            ...live.marks(wall.id),
            ...paint.virtual
          },
          [],
          wall.id
        )
      )
      continue
    }

    const slices = tracing === null ? wall.slices : traceWall(wall, tracing)
    out.push(
      el(
        'g',
        { 'data-moving': offset ? wall.id : undefined, transform },
        slices.map((slice, index) =>
          el(
            'path',
            {
              d: pathOf(slice),
              'data-part': 'wall',
              'data-id': wall.id,
              'data-exposure': wall.exposure,
              'data-wall-kind': wallDrawnKind(wall),
              'data-phase': wall.phase,
              'data-selectable': 'true',
              'data-selected': selected(wall.id),
              ...live.marks(wall.id),
              ...live.hit(wall.id),
              ...paint.wall(wallDrawnKind(wall), wall.phase, hatched(wall))
            },
            [],
            String(index)
          )
        ),
        wall.id
      )
    )
  }

  // SHT-10: each wall of a material hatched across, at 1:50 and larger, with the material's hatch
  // in turn (`planWallMaterials`), over the walls' paper and under the openings. Drawing, not a target.
  if (detail !== null && detail.hatches.length > 0) {
    const spacing = hatchSpacingMetres(look, mpp, input.paperScale)
    const hatches: SvgNode[] = []
    for (const wall of drawing.walls) {
      if (!hatched(wall) || wall.phase === 'demolished') continue
      const angles = detail.hatches[materials.indexOf(wall.material!) % detail.hatches.length]!
      const lines = wall.slices.flatMap((slice) => angles.flatMap((angle) => hatchLines(slice, spacing, (angle * Math.PI) / 180)))
      if (lines.length === 0) continue
      const d = lines.map(([a, b]) => `M${lengthText(a.x)},${lengthText(-a.y)}L${lengthText(b.x)},${lengthText(-b.y)}`).join('')
      hatches.push(el('path', { 'data-part': 'wall-hatch', 'data-wall': wall.id, 'data-material': wall.material, d, ...paint.wallHatch }, [], `hatch:${wall.id}`))
    }
    if (hatches.length > 0) out.push(el('g', { 'data-part': 'wall-hatches', 'pointer-events': 'none', 'aria-hidden': 'true' }, hatches, 'wall-hatches'))
  }

  // CNT-16: each column, cut through as the walls are, over them where it meets one. A round one
  // is its true circle. Drawing, not a target: clicks reach the room underneath.
  for (const column of drawing.columns ?? []) {
    out.push(
      column.radius !== undefined
        ? el('circle', { 'data-part': 'column', 'data-id': column.id, 'data-shape': column.shape, 'data-room': column.room ?? undefined, cx: column.centre.x, cy: -column.centre.y, r: column.radius, 'pointer-events': 'none', ...paint.column }, [], `column:${column.id}`)
        : el('path', { 'data-part': 'column', 'data-id': column.id, 'data-shape': column.shape, 'data-room': column.room ?? undefined, d: pathOf(column.outline), 'pointer-events': 'none', ...paint.column }, [], `column:${column.id}`)
    )
  }

  // SHT-11 with CNT-4: each flat's outline, a chain line along the middle of the walls round its
  // rooms, so one line runs between two flats. It is drawn over the walls in the paper's colour,
  // where a line in ink would vanish into a dark wall, and under the openings, so a doorway
  // breaks it. Drawing, not a target.
  for (const flat of drawing.flats) {
    out.push(
      el(
        'g',
        { 'data-part': 'flat', 'data-id': flat.id, 'data-name': flat.name, 'pointer-events': 'none', 'aria-hidden': 'true' },
        flat.rings.map((ring, index) => el('path', { 'data-part': 'flat-outline', d: pathOf(ring), ...paint.flat }, [], String(index))),
        `flat:${flat.id}`
      )
    )
  }

  for (const opening of drawing.openings) {
    if (opening.phase === 'demolished') continue
    const opened = live.openingOpen(opening.id)
    const span = opened === null ? opening : openingAt(opening, opened)
    const host = drawing.walls.find((wall) => wall.id === opening.wallId)
    const exposure = host?.exposure
    // VEW-22: a wide door that states no kind is drawn as Grid's guess, a pair or a sliding door.
    const handing = drawnHanding(opening, handings.get(opening.id))
    const guessed = handing !== handings.get(opening.id)
    // CNT-14: a door or window that states its kind is drawn from its kind's symbol; any other as before.
    const kinded = opening.type !== 'opening' && drawnByKind(handing) ? openingSymbol(opening, handing) : null
    const door = kinded === null ? doorSymbolOf(opening, handing) : null
    const drawn = kinded !== null || door !== null

    if (opened !== null) {
      // The part of the gap not yet open is still wall, so the wall parts from the
      // opening's centre outwards.
      ;[
        [opening.from, span.from],
        [span.to, opening.to]
      ].forEach(([a, b], index) =>
        out.push(
          el(
            'path',
            {
              d: pathOf(stripAcross(a, b, opening.normal, opening.thickness)),
              'data-part': 'wall',
              'data-exposure': exposure,
              'data-wall-kind': host === undefined ? undefined : wallDrawnKind(host),
              'data-closing': 'true',
              'pointer-events': 'none',
              ...paint.wall(host === undefined ? 'inside' : wallDrawnKind(host), host?.phase, host !== undefined && hatched(host))
            },
            [],
            `${opening.id}:closing:${index}`
          )
        )
      )
    }
    out.push(
      el(
        'path',
        {
          d: pathOf(stripAcross(span.from, span.to, opening.normal, opening.thickness)),
          'data-part': 'opening',
          'data-type': opening.type,
          'data-id': opening.id,
          'data-phase': opening.phase,
          'data-selectable': 'true',
          'data-selected': selected(opening.id),
          ...live.marks(opening.id),
          'data-swing': opening.type === 'door' && drawn ? 'true' : undefined,
          ...(kinded !== null && { 'data-kind': kinded.kind }),
          'data-kind-guess': guessed ? 'true' : undefined,
          'data-above': opening.above ? 'true' : undefined,
          ...live.hit(opening.id),
          ...paint.opening(opening.type, opening.type === 'door' && drawn, opening.above === true)
        },
        [],
        opening.id
      )
    )
    if (door && show.swings) {
      // Drawing, not a target: clicks reach the gap or room underneath.
      out.push(
        el(
          'g',
          {
            'data-part': 'door-symbol',
            'data-opening': opening.id,
            'pointer-events': 'none',
            'aria-hidden': 'true',
            opacity: opened ?? undefined
          },
          [
            ...door.jambs.map(([a, b]) => el('line', { 'data-part': 'jamb', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...paint.jamb })),
            el('line', {
              'data-part': 'door-leaf',
              x1: door.leaf[0].x,
              y1: door.leaf[0].y,
              x2: door.leaf[1].x,
              y2: door.leaf[1].y,
              ...paint.doorLeaf
            }),
            el('path', { 'data-part': 'door-arc', d: door.arc, ...paint.doorArc })
          ],
          `${opening.id}:door`
        )
      )
    }
    if (kinded !== null && opening.type === 'door' && show.swings) out.push(kindSymbolNode(opening, kinded, paint, opened ?? undefined))
    // SHT-10: in a detailed drawing a plain window's glass is two panes; a window above the cut is dashed.
    if (look.glass && opening.type === 'window') out.push(kinded !== null ? kindSymbolNode(opening, kinded, paint, undefined) : windowSymbol(opening, paint, detail !== null, opening.above === true))
    if (look.undecidedDoors && opening.type === 'door' && !drawn) out.push(undecidedSymbol(opening, mpp, paint))
    if (detail !== null && opened === null) {
      const node = detailNode(opening, paint)
      if (node !== null) out.push(node)
    }
  }
  // CNT-10: each opening to be demolished, as a dashed outline across its wall where it stood,
  // over the walls and the openings that stand after the work: a blocked window shows on its
  // wall, a widened door's old opening inside the new one. Drawing, not a target.
  for (const opening of drawing.openings) {
    if (opening.phase !== 'demolished') continue
    out.push(el('path', { d: pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness)), 'data-part': 'demolished-opening', 'data-type': opening.type, 'data-id': opening.id, 'pointer-events': 'none', ...paint.demolished }, [], `demolished-${opening.id}`))
  }

  // WRT-6 (lab WR-15): what the plan marks assumed, drawn in its own style: a dashed line round
  // each assumed room, wall and fixture and across each assumed opening, over the walls so it
  // shows on every one. Drawing, not a target: clicks reach the parts underneath.
  const assumed: SvgNode[] = []
  for (const room of drawing.rooms) if (room.assumed) assumed.push(el('path', { d: roomPathOf(room), 'data-part': 'assumed-room', 'data-id': room.id, ...paint.assumed }, [], `room:${room.id}`))
  for (const wall of drawing.walls) {
    if (!wall.assumed) continue
    if (wall.virtual) assumed.push(el('path', { d: virtualPath(linePoints(wall)), 'data-part': 'assumed-wall', 'data-id': wall.id, ...paint.assumed }, [], `wall:${wall.id}`))
    else wall.slices.forEach((slice, index) => assumed.push(el('path', { d: pathOf(slice), 'data-part': 'assumed-wall', 'data-id': wall.id, ...paint.assumed }, [], `wall:${wall.id}:${index}`)))
  }
  for (const opening of drawing.openings) if (opening.assumed) assumed.push(lineEl('assumed-opening', across(opening, 0), { 'data-id': opening.id, ...paint.assumed }))
  for (const item of drawing.items) if (item.assumed) assumed.push(el('path', { d: pathOf(item.outline), 'data-part': 'assumed-item', 'data-id': item.id, ...paint.assumed }, [], `item:${item.id}`))
  if (assumed.length > 0) out.push(el('g', { 'data-part': 'assumed', 'pointer-events': 'none', role: 'img', 'aria-label': drawingText(drawingWords(), 'drawing.assumed') }, assumed, 'assumed'))
  // CNT-9: the walls, doors, windows and openings picked out, over the drawing, each in its
  // colour. Drawing, not a target: clicks reach the part underneath.
  if (picked !== null && picked.size > 0) {
    const pen = lengthText(3 * mpp)
    for (const wall of drawing.walls) {
      const colour = picked.get(wall.id)
      if (colour === undefined) continue
      if (wall.virtual) {
        out.push(el('path', { d: virtualPath(linePoints(wall)), 'data-part': 'picked', 'data-id': wall.id, fill: 'none', stroke: colour, 'stroke-width': pen, 'pointer-events': 'none' }, [], `picked:${wall.id}`))
        continue
      }
      out.push(el('g', { 'data-part': 'picked', 'data-id': wall.id, 'pointer-events': 'none' }, wall.slices.map((slice, index) => el('path', { d: pathOf(slice), fill: colour, 'fill-opacity': 0.75 }, [], String(index))), `picked:${wall.id}`))
    }
    for (const opening of drawing.openings) {
      const colour = picked.get(opening.id)
      if (colour === undefined) continue
      out.push(el('path', { d: pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness)), 'data-part': 'picked', 'data-id': opening.id, fill: colour, 'fill-opacity': 0.85, stroke: colour, 'stroke-width': pen, 'pointer-events': 'none' }, [], `picked:${opening.id}`))
    }
  }

  // A stair the plan states (LVL-3), on both floors it joins, as the core lays out its symbol
  // (SHT-11): on the floor it rises from, solid up to the break line at the plan's cut and dashed
  // above it; on the floor it arrives on, whole. A line at every riser, the walking line and an
  // arrow head pointing up. Drawing, not a target: clicks reach the room underneath.
  for (const stair of drawing.stairs) {
    const children: SvgNode[] = []
    for (const line of stair.symbol.lines) {
      children.push(
        el('path', {
          d: line.closed ? pathOf(line.points) : virtualPath(line.points),
          'data-part': STAIR_PARTS[line.kind],
          'data-above': line.above ? 'true' : undefined,
          ...(line.above ? paint.stairAbove : paint.stair)
        })
      )
    }
    if (stair.symbol.cut !== null) children.push(el('path', { d: virtualPath(stair.symbol.cut), 'data-part': 'stair-break', ...paint.stair }))
    if (stair.symbol.arrow !== null) children.push(el('path', { d: pathOf(stair.symbol.arrow), 'data-part': 'stair-arrow', ...paint.stairArrow }))
    out.push(
      el(
        'g',
        { 'data-part': 'stair', 'data-id': stair.id, 'data-end': stair.end, 'pointer-events': 'none', 'aria-hidden': 'true' },
        children,
        `stair:${stair.id}`
      )
    )
  }

  // CNT-19 (C29): each parking bay, its marking and its number in the middle, and each ramp on
  // both floors it joins, its outline, its middle line ending in an arrow head pointing up and its
  // slope written halfway along. Drawing, not a target: clicks reach the room underneath.
  const bayNumbers = bayLabels(drawing.bays ?? [], mpp)
  for (const bay of drawing.bays ?? []) {
    const children: SvgNode[] = [el('path', { 'data-part': 'bay-outline', d: pathOf(bay.outline), ...paint.bay })]
    // VEW-32: a number that fits its bay stays in it; a row of bays too small for theirs is one range.
    const own = bayNumbers.find((label) => label.bay === bay.id)
    if (own !== undefined) children.push(el('g', { transform: labelTransform(bay.centre, mpp) }, [el('text', { 'data-part': 'bay-number', dy: String(DIMENSION_DY), ...paint.bayNumber }, [own.text])]))
    out.push(el('g', { 'data-part': 'bay', 'data-id': bay.id, 'data-number': bay.number ?? undefined, 'pointer-events': 'none', 'aria-hidden': 'true' }, children, `bay:${bay.id}`))
  }
  bayNumbers
    .filter((label) => label.bay === null)
    .forEach((label, index) => out.push(el('g', { 'data-part': 'bay-range', 'pointer-events': 'none', 'aria-hidden': 'true', transform: labelTransform(label.at, mpp) }, [el('text', { dy: String(DIMENSION_DY), ...paint.bayNumber }, [label.text])], `bay-range:${index}`)))
  for (const ramp of drawing.ramps ?? []) {
    const children: SvgNode[] = ramp.pieces.map((piece, index) => el('path', { 'data-part': 'ramp-outline', d: pathOf(piece), ...paint.ramp }, [], String(index)))
    children.push(el('path', { 'data-part': 'ramp-line', d: virtualPath(ramp.line), ...paint.ramp }))
    if (ramp.arrow !== null) children.push(el('path', { 'data-part': 'ramp-arrow', d: pathOf(ramp.arrow), ...paint.rampArrow }))
    children.push(
      el('g', { transform: labelTransform(ramp.labelAt, mpp) }, [
        el('text', { 'data-part': 'ramp-slope', dy: String(DIMENSION_DY), ...paint.rampSlope }, [drawingText(drawingWords(), 'drawing.ramp.slope', { slope: num(slopeText(ramp.slope)) })])
      ])
    )
    out.push(el('g', { 'data-part': 'ramp', 'data-id': ramp.id, 'data-end': ramp.end, 'data-slope': slopeText(ramp.slope), 'pointer-events': 'none', 'aria-hidden': 'true' }, children, `ramp:${ramp.id}`))
  }

  // A step between rooms at different levels (LVL-7): a solid line in the wall's ink across the
  // opening, on top of the gap, or over a dividing line, which then reads as an edge. Drawing,
  // not a target: clicks reach the gap or room underneath.
  for (const step of drawing.steps) {
    out.push(
      el(
        'line',
        {
          'data-part': 'step',
          'data-wall': step.wallId,
          'data-opening': step.openingId ?? undefined,
          'data-upper': step.upper,
          'data-lower': step.lower,
          'pointer-events': 'none',
          x1: step.from.x,
          y1: -step.from.y,
          x2: step.to.x,
          y2: -step.to.y,
          ...paint.step
        },
        [],
        `step:${step.wallId}:${step.openingId ?? ''}:${step.from.x},${step.from.y}`
      )
    )
  }

  // A room that could not be drawn (MSG-8): the box round its walls, tinted and dashed, over the
  // walls so its edge shows. Drawing, not a target.
  drawing.undrawn.forEach((room, index) => {
    const { min, max } = room.box
    out.push(
      el(
        'path',
        {
          'data-part': 'undrawn-room',
          'data-room': room.id,
          'pointer-events': 'none',
          d: `M${min.x},${-min.y}L${max.x},${-min.y}L${max.x},${-max.y}L${min.x},${-max.y}Z`,
          ...paint.undrawn
        },
        [],
        `undrawn:${room.id}:${index}`
      )
    )
  })

  // Each label goes to a spot in its room clear of door swings, walls and the other labels,
  // or out of the room with a leader. Measured from the text actually drawn, so a wider
  // "before → after" area still gets the room it needs.
  const areaText = (room: PlanRoom): string => {
    if (!show.areas) return ''
    const change = live.areaChange(room.id)
    return change
      ? `${areaNumber(change.before, decimals)} → ${areaNumber(change.after, decimals)} ${areaUnit()}`
      : formatArea(room.area, decimals)
  }
  // The same text in the pieces the app has always drawn it in, one text node each.
  const areaPieces = (room: PlanRoom): string[] => {
    if (!show.areas) return []
    const change = live.areaChange(room.id)
    return change
      ? [areaNumber(change.before, decimals), ' → ', areaNumber(change.after, decimals), ` ${areaUnit()}`]
      : [areaNumber(room.area, decimals), ` ${areaUnit()}`]
  }
  // WRT-43: a room with no name is labelled with its id, so it is never drawn as a blank.
  const names = drawing.rooms.map((room, index) => {
    const blank = room.name.trim() === ''
    const name = labelName(blank ? room.id : room.name, index, style)
    return style.ids && !blank ? `${name} [${room.id}]` : name
  })
  const swings: Box[] = []
  for (const opening of drawing.openings) {
    const box = doorSwingBox(opening, drawnHanding(opening, handings.get(opening.id)), mpp)
    if (box) swings.push(box)
  }
  // The dimension lines, and the numbers that never move: a label keeps off them when it can.
  const dimensionBlocks: Box[] = []
  for (const dim of dimensions) {
    const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
    dimensionBlocks.push(lineBox({ x: dim.from.x + shift.x, y: dim.from.y + shift.y }, { x: dim.to.x + shift.x, y: dim.to.y + shift.y }, mpp))
    if (dim.kind !== 'room') dimensionBlocks.push(dimensionTextBox(dim.labelAt, dim, mpp))
  }
  // A label moved out of its room keeps off the box of a room that could not be drawn, when it can.
  for (const room of drawing.undrawn) {
    dimensionBlocks.push({ minX: room.box.min.x, maxX: room.box.max.x, minY: room.box.min.y, maxY: room.box.max.y })
  }
  // A label moved out of its room stays where a framed view of the plan, or a picture of it,
  // always shows: the drawing and its dimensions, and the margin `fitTo` leaves round them.
  const framed = boundsWithDimensions(drawing, dimensions)
  const padX = Math.max(framed.width, 0.001) * FRAME_MARGIN
  const padY = Math.max(framed.height, 0.001) * FRAME_MARGIN
  // VEW-44: nor outside the picture's own view, where its leader would lead to nothing.
  const shown = input.view
  const reach: Box = {
    minX: Math.max(framed.min.x - padX, shown ? shown.x : -Infinity),
    maxX: Math.min(framed.max.x + padX, shown ? shown.x + shown.width : Infinity),
    minY: Math.max(framed.min.y - padY, shown ? -(shown.y + shown.height) : -Infinity),
    maxY: Math.min(framed.max.y + padY, shown ? -shown.y : Infinity)
  }
  // VEW-13: the number a room's label falls back to, its name then listed in the room key.
  const numbers = roomNumbers(drawing.rooms)
  const labels = placeRoomLabels(
    drawing.rooms.map((room, index) => ({ id: room.id, polygon: room.polygon, holes: room.holes, name: names[index]!, areaText: areaText(room), number: numbers[index]! })),
    // A fixture blocks a label like a wall does (CNT-12): a room's name never sits on a bath.
    // VEW-13: nor on a stair's treads or a lift's cross.
    {
      swings,
      walls: [
        ...drawing.walls.filter((wall) => !wall.virtual).flatMap((wall) => wall.slices),
        ...drawing.items.map((item) => item.outline),
        ...drawing.stairs.flatMap((stair) => stair.flights.map((flight) => flight.outline)),
        ...drawing.lifts.flatMap((lift) => lift.lines.map(([a, b]) => lineOutline(a, b, mpp)))
      ],
      dimensions: dimensionBlocks
    },
    mpp,
    reach
  )
  const labelBlocks = labels.flatMap((label) => (label ? [label.box] : []))
  const faults = input.faults ?? []
  const faultLayout = {
    drawing,
    labelBoxes: new Map(labels.flatMap((label) => (label ? [[label.id, label.box] as const] : []))),
    blocks: labelBlocks,
    within: reach,
    metersPerPixel: mpp,
    look: look.colors
  }

  // A number outside the plan keeps off the room labels and the numbers already placed on its
  // chain and the next: one that has no room between its ticks waits for the user to zoom in.
  // VEW-31: nor on a tick across a chain's ends or an extension line, its own or a neighbour's.
  const clutter = dimensionClutter(dimensions, mpp, look.draftedDimensions)
  const placedNumbers: Box[] = []
  for (const dim of dimensions) {
    const shown = live.dimensionShown(dim)
    if (shown <= 0) continue
    const labelAt =
      dim.kind === 'room'
        ? placeDimensionLabel(dim, blocksNear(dim, labelBlocks, mpp), mpp)
        : placeDimensionLabel(dim, [...blocksNear(dim, labelBlocks, mpp), ...blocksNear(dim, placedNumbers, mpp), ...blocksNear(dim, clutter, mpp)], mpp)
    if (labelAt && dim.kind !== 'room') placedNumbers.push(dimensionTextBox(labelAt, dim, mpp))
    out.push(dimensionMark(dim, mpp, labelAt, shown < 1 ? shown : undefined, paint, look.draftedDimensions))
  }

  drawing.rooms.forEach((room, index) => {
    const label = labels[index]
    // No clear spot at this zoom: the label waits for the user to zoom in.
    if (!label) return
    const opacity = live.labelOpacity(room.id)
    if (label.leader) {
      const [a, b] = label.leader
      out.push(
        el(
          'line',
          { 'data-part': 'label-leader', 'data-room': room.id, x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, opacity, ...paint.leader },
          [],
          `leader:${room.id}`
        )
      )
    }
    out.push(labelNode(label, names[index]!, show.areas ? areaPieces(room) : null, opacity, mpp, paint, `label:${room.id}`))
  })

  // The name of each room that could not be drawn, and why, in the middle of its box.
  out.push(...undrawnRoomText(faultLayout, faults))

  // After the current labels, so the plan's own fills never cover it. A ghost, so no paint.
  for (const room of live.removedRooms) {
    out.push(
      el(
        'g',
        { transform: labelTransform(poleOfInaccessibility(room.polygon, undefined, room.holes).point, mpp), ...live.ghostAttrs(room.id) },
        [el('text', { 'data-part': 'label' }, [`${room.name.trim() === '' ? room.id : room.name} · ${formatArea(room.area, decimals)} · ${drawingText(drawingWords(), 'drawing.removed')}`])],
        `ghost-label-${room.id}`
      )
    )
  }

  // SHT-7: the notes, tags and symbols. A note in a room goes under that room's label.
  const labelAt = new Map(labels.flatMap((label) => (label ? [[label.id, label.at] as const] : [])))
  if (show.notes) out.push(...noteNodes(drawing.notes, labelAt, mpp, look.colors))
  // ARE-15: the schedules' marks, a room's over its label where it was placed.
  if (input.scheduleMarks !== undefined && input.scheduleMarks.length > 0) out.push(...scheduleMarkNodes(input.scheduleMarks, labelAt, look, mpp))

  // The check view: each opening's id just off the middle of its wall, on the side its normal
  // points to, upright and sized in screen pixels like the labels.
  if (style.ids) {
    for (const opening of drawing.openings) {
      const reach = opening.thickness / 2
      const at = {
        x: (opening.from.x + opening.to.x) / 2 + opening.normal.x * reach,
        y: (opening.from.y + opening.to.y) / 2 + opening.normal.y * reach
      }
      out.push(
        el(
          'g',
          { 'data-part': 'opening-id', 'data-opening': opening.id, transform: labelTransform(at, mpp) },
          [el('text', { x: opening.normal.x * OPENING_ID_PX, y: -opening.normal.y * OPENING_ID_PX + 4, ...paint.area }, [opening.id])],
          `opening-id:${opening.id}`
        )
      )
    }
  }

  // Laid out before the warning dots, which a numbered mark on the same door replaces.
  const marks = faults.length === 0 || !show.warnings ? null : faultMarks(faultLayout, faults)
  for (const opening of drawing.openings) {
    const message = doorWarnings.get(opening.id)
    if (message === undefined || marks?.openings.has(opening.id) || !show.warnings) continue
    const at = { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 }
    // Sized in screen pixels like the labels.
    const children: SvgNode[] = [el('circle', { 'data-part': 'door-warning-dot', r: WARNING_RADIUS_PX, ...paint.warningDot })]
    if (live.hoveredWarning === opening.id) {
      children.push(
        el('text', { 'data-part': 'door-warning-text', x: WARNING_RADIUS_PX + 6, dy: '4', ...paint.warningText }, [message])
      )
    }
    out.push(
      el(
        'g',
        {
          'data-part': 'door-warning',
          'data-opening': opening.id,
          role: 'img',
          'aria-label': message,
          transform: labelTransform(at, mpp)
        },
        children,
        `warning:${opening.id}`
      )
    )
  }

  // Over everything else on the plan: what went wrong, numbered as in the result record.
  if (marks) out.push(...marks.nodes)

  if (live.pulse) {
    // Presentation only: not part of the plan, its bounds or selection.
    out.push(
      el(
        'circle',
        {
          'data-part': 'pulse',
          class: 'animate-grid-pulse',
          cx: live.pulse.x,
          cy: -live.pulse.y,
          r: PULSE_RADIUS_PX * mpp,
          'pointer-events': 'none',
          'aria-hidden': 'true',
          ...paint.pulse
        },
        [],
        'pulse'
      )
    )
  }

  return out
}
