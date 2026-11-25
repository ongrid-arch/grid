/**
 * WRT-8: a picture of a comparison. The later plan in pale, what was removed in one colour, what
 * was added in another, and the rooms that changed tinted and labelled with their old and new
 * area. WRT-12: a wall that moved or an opening that changed is drawn as changed, at its new place
 * in the changed colour with its old place outlined, never as removed under added.
 *
 * Nothing here works out what changed: the core does (`compareBuildings` and its `marks`), and
 * gives the earlier plan laid on the later one. This draws the later plan with the comparison
 * look through the one drawing function (`planPicture`), then each plan's own drawing of the
 * parts the marks name: the earlier plan's for what was removed, the later plan's for the rest.
 *
 * Pure: no DOM, no React.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Bounds, ComparisonMarks, PlanDrawing, Vec2 } from '@ongrid/floorplan/geometry'
import { buildFloorPlan, computeBounds, planForFloor, resolveFloor } from '@ongrid/floorplan/geometry'
import { pathOf } from '../canvas2d/viewport'
import { lengthText, lookWithColors, PICTURE_FONT, type Look, type PlanLook } from './look'
import type { PictureKey } from './faults'
import { planPicture, type Picture } from './planSvg'
import { el, type SvgNode } from './svgNode'

/** The colours of a comparison: removed, added and changed, each with the pale tint of its fill. */
export const COMPARISON_COLORS = {
  removed: '#c0392b',
  removedFill: '#f5d0cb',
  added: '#1e8449',
  addedFill: '#cdebd6',
  changed: '#b9770e',
  changedFill: '#f8e3bf'
} as const

/** What stayed: the working look's parts, all pale, so what changed stands out. */
export const UNCHANGED_COLORS: PlanLook = {
  paper: '#ffffff',
  room: '#f7f6f2',
  wall: '#c9c6bd',
  wallExterior: '#bdb9ae',
  virtual: '#dcd9d0',
  window: '#eef3f6',
  label: '#9c998f',
  labelSoft: '#b3b0a6',
  dimension: '#c9c6bd',
  dimensionSoft: '#dcd9d0',
  dimensionText: '#b3b0a6',
  dimensionSoftText: '#c9c6bd',
  warning: '#c9c6bd',
  font: PICTURE_FONT
}

/** The comparison look: the working look's lines in the pale colours. */
export const COMPARISON_LOOK: Look = { ...lookWithColors(UNCHANGED_COLORS), name: 'comparison' }

export interface ComparisonPictureOptions {
  /** The floor to draw: the later plan's lowest when left out. */
  readonly floor?: string | null
  /** Width in pixels. 1200 by default. */
  readonly width?: number
}

const LABEL_PX = 13
const MARGIN_M = 0.6

function drawingOf(plan: FloorPlan, floor: string): PlanDrawing {
  return buildFloorPlan(planForFloor(plan, floor))
}

function pointsOf(drawing: PlanDrawing): Vec2[] {
  return [...drawing.walls.flatMap((w) => [...w.slices.flat(), ...w.centerline]), ...drawing.rooms.flatMap((r) => r.polygon)]
}

/** The parts the marks name, in one plan's own drawing, filled and outlined in one colour; with `outline`, outlined only, dashed. */
function markNodes(drawing: PlanDrawing, ids: { walls: readonly string[]; openings: readonly string[]; rooms: readonly string[] }, colour: string, fill: string, mpp: number, part: string, outline = false): SvgNode[] {
  const walls = new Set(ids.walls)
  const openings = new Set(ids.openings)
  const rooms = new Set(ids.rooms)
  const nodes: SvgNode[] = []
  for (const room of drawing.rooms) {
    if (!rooms.has(room.id) || room.polygon.length < 3) continue
    nodes.push(el('path', { 'data-part': `${part}-room`, 'data-id': room.id, d: pathOf(room.polygon), fill, 'fill-opacity': 0.7, stroke: colour, 'stroke-width': lengthText(2 * mpp), 'stroke-dasharray': `${lengthText(6 * mpp)} ${lengthText(4 * mpp)}` }))
  }
  for (const wall of drawing.walls) {
    if (!walls.has(wall.id)) continue
    if (wall.virtual || wall.slices.length === 0) {
      nodes.push(el('path', { 'data-part': `${part}-wall`, 'data-id': wall.id, d: pathOf(wall.centerline).replace(/Z$/, ''), fill: 'none', stroke: colour, 'stroke-width': lengthText(2 * mpp) }))
      continue
    }
    for (const slice of wall.slices) {
      const paint = outline ? { fill: 'none', 'stroke-dasharray': `${lengthText(4 * mpp)} ${lengthText(3 * mpp)}`, 'stroke-width': lengthText(1.5 * mpp) } : { fill: colour, 'fill-opacity': 0.8, 'stroke-width': lengthText(mpp) }
      nodes.push(el('path', { 'data-part': `${part}-wall`, 'data-id': wall.id, d: pathOf(slice), stroke: colour, ...paint }))
    }
  }
  for (const opening of drawing.openings) {
    if (!openings.has(opening.id)) continue
    const half = opening.thickness / 2
    const side = { x: opening.normal.x * half, y: opening.normal.y * half }
    const corners = [
      { x: opening.from.x + side.x, y: opening.from.y + side.y },
      { x: opening.to.x + side.x, y: opening.to.y + side.y },
      { x: opening.to.x - side.x, y: opening.to.y - side.y },
      { x: opening.from.x - side.x, y: opening.from.y - side.y }
    ]
    const paint = outline ? { fill: 'none', 'stroke-dasharray': `${lengthText(4 * mpp)} ${lengthText(3 * mpp)}` } : { fill }
    nodes.push(el('path', { 'data-part': `${part}-opening`, 'data-id': opening.id, d: pathOf(corners), ...paint, stroke: colour, 'stroke-width': lengthText(2 * mpp) }))
  }
  return nodes
}

/**
 * MSG-27: the stretches a wall gained or lost along its line, each a band of its thickness in one
 * colour, drawn only on the floor whose drawing holds the wall.
 */
function stretchNodes(drawing: PlanDrawing, stretches: ComparisonMarks['stretches'], kind: 'added' | 'removed', colour: string, mpp: number): SvgNode[] {
  const here = new Set(drawing.walls.map((w) => w.id))
  const nodes: SvgNode[] = []
  for (const stretch of stretches) {
    if (stretch.kind !== kind || !here.has(stretch.wall)) continue
    const dx = stretch.to[0] - stretch.from[0]
    const dy = stretch.to[1] - stretch.from[1]
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    const half = stretch.thickness / 2
    const side = { x: (-dy / length) * half, y: (dx / length) * half }
    const corners = [
      { x: stretch.from[0] + side.x, y: stretch.from[1] + side.y },
      { x: stretch.to[0] + side.x, y: stretch.to[1] + side.y },
      { x: stretch.to[0] - side.x, y: stretch.to[1] - side.y },
      { x: stretch.from[0] - side.x, y: stretch.from[1] - side.y }
    ]
    nodes.push(el('path', { 'data-part': `${kind}-stretch`, 'data-id': stretch.wall, d: pathOf(corners), fill: colour, 'fill-opacity': 0.8, stroke: colour, 'stroke-width': lengthText(mpp) }))
  }
  return nodes
}

/** Words on a paper strip, in pixels, at a point of the plan. */
function labelAt(at: Vec2, text: string, colour: string, mpp: number, dy: number, part: string): SvgNode {
  const width = text.length * LABEL_PX * 0.56 + 10
  return el('g', { 'data-part': part, transform: `translate(${lengthText(at.x)} ${lengthText(-at.y)}) scale(${lengthText(mpp)})` }, [
    el('rect', { x: lengthText(-width / 2), y: dy - LABEL_PX, width: lengthText(width), height: LABEL_PX + 6, fill: '#ffffff', opacity: 0.9, rx: 3 }),
    el('text', { x: 0, y: dy, 'text-anchor': 'middle', fill: colour, 'font-family': PICTURE_FONT, 'font-size': LABEL_PX, 'font-weight': 'bold' }, [text])
  ])
}

/** The key in a band under the drawing, so it never covers the plan's corner (VEW-17). */
function keyBand(): PictureKey {
  const entries: Array<[string, string]> = [
    ['Removed', COMPARISON_COLORS.removed],
    ['Added', COMPARISON_COLORS.added],
    ['Changed', COMPARISON_COLORS.changed],
    ['Unchanged', UNCHANGED_COLORS.wallExterior]
  ]
  const children: SvgNode[] = []
  entries.forEach(([words, colour], i) => {
    const x = 16 + i * 110
    children.push(el('rect', { x, y: 11, width: 14, height: 10, fill: colour }))
    children.push(el('text', { x: x + 22, y: 20, fill: '#232320', 'font-family': PICTURE_FONT, 'font-size': 12 }, [words]))
  })
  return { height: 32, nodes: [el('g', { 'data-part': 'comparison-key' }, children)] }
}

/** The comparison as a picture of one floor. `earlier` is the earlier plan laid on `later` (`BuildingComparison.aligned`). */
export function comparisonPicture(earlier: FloorPlan, later: FloorPlan, marks: ComparisonMarks, options: ComparisonPictureOptions = {}): Picture {
  const floor = resolveFloor(later, options.floor)
  const before = drawingOf(earlier, floor)
  const after = drawingOf(later, floor)
  const box = computeBounds([...pointsOf(before), ...pointsOf(after)])
  const frame: Bounds = {
    min: { x: box.min.x - MARGIN_M, y: box.min.y - MARGIN_M },
    max: { x: box.max.x + MARGIN_M, y: box.max.y + MARGIN_M },
    width: box.width + 2 * MARGIN_M,
    height: box.height + 2 * MARGIN_M
  }
  const base = planPicture(later, {
    floor,
    look: COMPARISON_LOOK,
    showDimensions: false,
    frame,
    ...(options.width === undefined ? {} : { width: options.width }),
    show: { title: false, key: false, notes: false, sketch: false, areas: false, warnings: false, above: false }
  })
  const mpp = base.view.width / base.width
  const changed = new Map(marks.changedRooms.map((r) => [r.room, r.label] as const))
  const nodes: SvgNode[] = [
    ...base.nodes,
    ...markNodes(after, { walls: [], openings: [], rooms: [...changed.keys()] }, COMPARISON_COLORS.changed, COMPARISON_COLORS.changedFill, mpp, 'changed'),
    // What changed in both versions: where it was, outlined, under where it is now.
    ...markNodes(before, { ...marks.changed, rooms: [] }, COMPARISON_COLORS.changed, COMPARISON_COLORS.changedFill, mpp, 'changed-was', true),
    ...markNodes(after, { ...marks.changed, rooms: [] }, COMPARISON_COLORS.changed, COMPARISON_COLORS.changedFill, mpp, 'changed'),
    ...markNodes(before, marks.removed, COMPARISON_COLORS.removed, COMPARISON_COLORS.removedFill, mpp, 'removed'),
    ...markNodes(after, marks.added, COMPARISON_COLORS.added, COMPARISON_COLORS.addedFill, mpp, 'added'),
    // MSG-27: a wall made longer or shorter: only the stretch it gained or lost.
    ...stretchNodes(before, marks.stretches, 'removed', COMPARISON_COLORS.removed, mpp),
    ...stretchNodes(after, marks.stretches, 'added', COMPARISON_COLORS.added, mpp)
  ]
  for (const room of after.rooms) {
    const label = changed.get(room.id)
    if (label !== undefined) nodes.push(labelAt(room.labelAt, label, COMPARISON_COLORS.changed, mpp, 18, 'changed-label'))
  }
  const removedRooms = new Set(marks.removed.rooms)
  for (const room of before.rooms) {
    if (removedRooms.has(room.id)) nodes.push(labelAt(room.labelAt, `${room.name || room.id}: removed`, COMPARISON_COLORS.removed, mpp, 18, 'removed-label'))
  }
  return { ...base, look: COMPARISON_LOOK, nodes, key: keyBand() }
}
