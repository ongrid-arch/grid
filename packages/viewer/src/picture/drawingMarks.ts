/**
 * LVL-9: the marks a plan carries for its other drawings, as the core places them
 * (`drawingMarks`): a section's cut line with the way it looks, an elevation mark outside each
 * main side of the building, and the level of each room's floor; and ARE-15's schedule marks, each
 * room's and opening's mark in the schedules, in SHT-7's tag. Each symbol is drawn in pixels
 * round the point the core gives, so it reads the same at any zoom.
 *
 * Pure: no DOM, no React.
 */
import type { CompassPoint, DrawingMarks, ScheduleMark, Vec2 } from '@ongrid/floorplan/geometry'
import { levelText } from '@ongrid/floorplan/geometry'
import { estimateTextWidth, overlaps, type Box } from '../canvas2d/labelPlacement'
import type { Look } from './look'
import { TEXT_PX, lengthText, lineMetres } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'
import { ENGLISH_WORDS, drawingText, type DrawingWords } from './words'

const n = (value: number): string => lengthText(value)
const pixelGroup = (at: Vec2, mpp: number): string => `translate(${n(at.x)} ${n(-at.y)}) scale(${n(mpp)})`

/** The heavy stroke at each end of a cut line, and the arrow and name beyond it, in pixels. */
const END_PX = 16
const ARROW_PX = 14
const NAME_PX = 28
/** An elevation mark's disc, in pixels. */
const DISC_PX = 12
/** How far under a room's label point its level stands, in pixels: below the name and the area. */
const LEVEL_DY_PX = 32
/** ARE-15: how far over a room's label point its mark's middle stands, in pixels: above its name. */
const ROOM_MARK_DY_PX = 24
/** ARE-15: how far out from its wall's face an opening's mark's middle stands, in pixels. */
const OPENING_MARK_PX = 14
/** SHT-7's tag: its height, and the room either side of its words, in pixels. */
const TAG_HEIGHT_PX = 17
const TAG_PAD_PX = 10

/** VEW-31: how far a mark is slid out a step at a time to clear what is in its way, in pixels, and the most steps. */
const NUDGE_PX = 4
const NUDGE_MAX = 400
/** VEW-31: how far an elevation mark's disc, arrow and letters reach round its point, in pixels. */
const ELEVATION_REACH_PX = DISC_PX + 11
/** VEW-31: a section head's box: its arrow and name, from the end of the cut, in pixels. */
const HEAD_REACH_PX = NAME_PX + 8

const squareAt = (at: Vec2, half: number): Box => ({ minX: at.x - half, maxX: at.x + half, minY: at.y - half, maxY: at.y + half })

/**
 * VEW-31: the point `at` slid out along `out`, a few pixels at a time, until a box of `half`
 * pixels round it meets none of `avoid`: the point itself when it is clear already.
 */
function clearOf(at: Vec2, out: Vec2, half: number, avoid: readonly Box[], mpp: number, centre: Vec2 = { x: 0, y: 0 }): Vec2 {
  let moved = at
  for (let step = 0; step <= NUDGE_MAX; step++) {
    moved = { x: at.x + out.x * NUDGE_PX * mpp * step, y: at.y + out.y * NUDGE_PX * mpp * step }
    const box = squareAt({ x: moved.x + centre.x * mpp, y: moved.y + centre.y * mpp }, half * mpp)
    if (!avoid.some((other) => overlaps(box, other))) return moved
  }
  return at
}

/**
 * VEW-31: the elevation marks slid out from the building until they touch no chain, figure or grid
 * bubble. `mpp` is metres per pixel. The marks given are not changed.
 */
export function clearElevationMarks(marks: DrawingMarks, avoid: readonly Box[], mpp: number): DrawingMarks {
  if (avoid.length === 0 || marks.elevations.length === 0) return marks
  return { ...marks, elevations: marks.elevations.map((mark) => ({ ...mark, at: clearOf(mark.at, { x: -mark.look.x, y: -mark.look.y }, ELEVATION_REACH_PX, avoid, mpp) })) }
}

/** MSG-11: the letters of the way a side faces, in the drawing's language (`drawing.mark.faces.*`). */
const short = (faces: CompassPoint, words: DrawingWords): string => drawingText(words, `drawing.mark.faces.${faces}`)

/** A triangle pointing along `dir` (on the plan, y up), from `from` px out to `to` px, in a pixel group. */
function arrow(dir: Vec2, from: number, to: number, half: number): string {
  const d = { x: dir.x, y: -dir.y }
  const side = { x: -d.y, y: d.x }
  const p = (along: number, across: number): string => `${n(d.x * along + side.x * across)},${n(d.y * along + side.y * across)}`
  return `M${p(to, 0)}L${p(from, half)}L${p(from, -half)}Z`
}

/** The marks' elements, over the drawing and under the north arrow. `mpp` is metres per pixel. */
export function drawingMarkNodes(marks: DrawingMarks, look: Look, mpp: number, paperScale?: number, words: DrawingWords = ENGLISH_WORDS, avoid: readonly Box[] = []): SvgNode[] {
  const lines = lineMetres(look, mpp, paperScale)
  const ink = look.ink
  const nodes: SvgNode[] = []
  const name: Attrs = { 'text-anchor': 'middle', fill: look.colors.label, 'font-family': look.colors.font, 'font-size': TEXT_PX.note, 'font-weight': 'bold' }

  // SHT-23: the section named A, then any further ones, each drawn the same way under its own name.
  for (const cut of [...(marks.section === null ? [] : [marks.section]), ...marks.sections]) {
    const heavy = Math.max(lines.width('elevationGround'), lines.width('mark'))
    const span = { x: cut.to.x - cut.from.x, y: cut.to.y - cut.from.y }
    const length = Math.hypot(span.x, span.y)
    const along = length === 0 ? { x: 1, y: 0 } : { x: span.x / length, y: span.y / length }
    const endBit = (at: Vec2, inward: Vec2): SvgNode => {
      const end = { x: at.x + inward.x * END_PX * mpp, y: at.y + inward.y * END_PX * mpp }
      return el('path', { 'data-part': 'section-mark-end', d: `M${n(at.x)},${n(-at.y)}L${n(end.x)},${n(-end.y)}`, fill: 'none', stroke: ink, 'stroke-width': n(heavy) })
    }
    // VEW-31: a head that would stand on a chain or a bubble slides out along the cut's line, which runs on to it.
    const headAt = (at: Vec2, out: Vec2): Vec2 => clearOf(at, out, HEAD_REACH_PX, avoid, mpp, { x: cut.look.x * (NAME_PX / 2), y: cut.look.y * (NAME_PX / 2) })
    const head = (at: Vec2, out: Vec2): SvgNode[] => {
      const stands = headAt(at, out)
      const lead = stands === at ? [] : [el('path', { 'data-part': 'section-mark-lead', d: `M${n(at.x)},${n(-at.y)}L${n(stands.x)},${n(-stands.y)}`, fill: 'none', stroke: ink, 'stroke-width': n(lines.width('mark')), 'stroke-dasharray': lines.dash('chain').map(n).join(' ') })]
      return [
        ...lead,
        el('g', { 'data-part': 'section-mark-head', transform: pixelGroup(stands, mpp) }, [
          el('path', { d: arrow(cut.look, 2, ARROW_PX + 2, 6), fill: ink }),
          el('text', { x: n(cut.look.x * NAME_PX), y: n(-cut.look.y * NAME_PX + 5), ...name }, [cut.label])
        ])
      ]
    }
    nodes.push(
      el('g', { 'data-part': 'section-mark', 'data-label': cut.label }, [
        el('path', { 'data-part': 'section-mark-line', d: `M${n(cut.from.x)},${n(-cut.from.y)}L${n(cut.to.x)},${n(-cut.to.y)}`, fill: 'none', stroke: ink, 'stroke-width': n(lines.width('mark')), 'stroke-dasharray': lines.dash('chain').map(n).join(' ') }),
        endBit(cut.from, along),
        endBit(cut.to, { x: -along.x, y: -along.y }),
        ...head(cut.from, { x: -along.x, y: -along.y }),
        ...head(cut.to, along)
      ])
    )
  }

  for (const mark of marks.elevations) {
    nodes.push(
      el('g', { 'data-part': 'elevation-mark', 'data-faces': mark.faces, 'data-facade': mark.facade, transform: pixelGroup(mark.at, mpp) }, [
        el('path', { d: arrow(mark.look, DISC_PX - 2, DISC_PX + 9, 7), fill: ink }),
        el('circle', { r: DISC_PX, fill: look.colors.paper, stroke: ink, 'stroke-width': n(lines.width('mark') / mpp) }),
        el('text', { y: '4', ...name, 'font-size': TEXT_PX.dimension }, [short(mark.faces, words)])
      ])
    )
  }

  const level: Attrs = { fill: look.colors.labelSoft, 'font-family': look.colors.font, 'font-size': TEXT_PX.dimension }
  for (const mark of marks.levels) {
    nodes.push(
      el('g', { 'data-part': 'level-mark', 'data-id': mark.room, 'data-level': n(mark.level), 'data-stated': String(mark.stated), transform: pixelGroup(mark.at, mpp) }, [
        el('path', { d: `M-22,${LEVEL_DY_PX - 8}L-14,${LEVEL_DY_PX - 8}L-18,${LEVEL_DY_PX - 2}Z`, fill: look.colors.labelSoft }),
        el('text', { x: -10, y: LEVEL_DY_PX, ...level }, [levelText(mark.level)])
      ])
    )
  }

  // ARE-15's schedule marks are drawn by the scene, over the room labels where it placed them
  // (`scheduleMarkNodes`).
  return nodes
}

/**
 * ARE-15: each schedule mark in SHT-7's tag, its words over a box of paper, tied to its row by the
 * part's id: a room's over its name where the label was placed (`labelAt`), else over the room's
 * label point; an opening's just out from its wall's face.
 */
export function scheduleMarkNodes(marks: readonly ScheduleMark[], labelAt: ReadonlyMap<string, Vec2>, look: Look, mpp: number): SvgNode[] {
  const tag: Attrs = { 'text-anchor': 'middle', fill: look.colors.label, 'font-family': look.colors.font, 'font-size': TEXT_PX.note }
  return marks.map((mark) => {
    const middle = mark.out === null ? { x: 0, y: -ROOM_MARK_DY_PX } : { x: mark.out.x * OPENING_MARK_PX, y: -mark.out.y * OPENING_MARK_PX }
    const at = mark.of === 'room' ? labelAt.get(mark.id) ?? mark.at : mark.at
    const width = estimateTextWidth(mark.mark, TEXT_PX.note) + TAG_PAD_PX
    return el('g', { 'data-part': 'schedule-mark', 'data-of': mark.of, 'data-id': mark.id, 'data-mark': mark.mark, 'pointer-events': 'none', transform: pixelGroup(at, mpp) }, [
      el('rect', { x: n(middle.x - width / 2), y: n(middle.y - TAG_HEIGHT_PX / 2), width: n(width), height: TAG_HEIGHT_PX, rx: '3', fill: look.colors.paper, stroke: look.colors.label, 'stroke-width': 1 }),
      el('text', { x: n(middle.x), y: n(middle.y + 4.5), ...tag }, [mark.mark])
    ], `schedule-mark:${mark.of}:${mark.id}`)
  })
}
