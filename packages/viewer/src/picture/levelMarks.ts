/**
 * VEW-84: the level marks of a section and of an elevation, drawn one way for both.
 *
 * Each mark stands beside the building, a small gap off its outermost part, on the side the part it
 * marks stands on: its preferred side, unless that part stands away from that edge of the building
 * and reaches the other (a split level's upper half, a storey set back to one side). A thin datum
 * line runs from the part out to the mark, so the level reads back to the drawing. The tick and its
 * triangle stand at the true level; marks close together on one side are staggered: the words of
 * one that would touch the words below it step up clear of them, joined to the tick by a leader.
 *
 * Pure: no DOM. Lengths in metres with y up, as the drawings are; the marks' own sizes in pixels.
 */
import { tolerance } from '@ongrid/floorplan/geometry'
import { estimateTextWidth } from '../canvas2d/labelPlacement'
import { TEXT_PX, lengthText } from './look'
import type { Look } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'

/** A mark's tick, its gap off the building, the leader to stepped words and the words' room past them, in pixels. */
export const LEVEL_TICK_PX = 36
export const LEVEL_GAP_PX = 14
const LEADER_PX = 10
const WORDS_GAP_PX = 4
/** How far apart the words of two marks on one side stand at least, baseline to baseline, in pixels. */
const WORDS_STEP_PX = TEXT_PX.dimension + 4

export type LevelSide = 'left' | 'right'

/** One level to mark: its level, its words, its part's name, its side by default and where the part it marks stands across the drawing. */
export interface LevelMarkInput {
  readonly level: number
  readonly words: string
  readonly part: string
  readonly prefer: LevelSide
  readonly from?: number
  readonly to?: number
  readonly attrs?: Attrs
}

/** How far across the drawing the building stands. */
export interface BuildingSpan {
  readonly from: number
  readonly to: number
}

/** The side a mark goes on: its preferred one, unless its part stands off that edge of the building and on the other. */
export function levelSide(mark: LevelMarkInput, building: BuildingSpan): LevelSide {
  if (mark.from === undefined || mark.to === undefined) return mark.prefer
  const near = tolerance('joint')
  const offLeft = mark.from - building.from > near
  const offRight = building.to - mark.to > near
  if (mark.prefer === 'left' && offLeft && !offRight) return 'right'
  if (mark.prefer === 'right' && offRight && !offLeft) return 'left'
  return mark.prefer
}

/** The marks on each side of the building. */
export function levelSides(marks: readonly LevelMarkInput[], building: BuildingSpan): { left: LevelMarkInput[]; right: LevelMarkInput[] } {
  const left = marks.filter((m) => levelSide(m, building) === 'left')
  const right = marks.filter((m) => levelSide(m, building) === 'right')
  return { left, right }
}

/** The room a side's marks take past the building, in pixels: gap, tick, leader and the widest words. */
export function levelMarksWidth(marks: readonly LevelMarkInput[]): number {
  if (marks.length === 0) return 0
  return LEVEL_GAP_PX + LEVEL_TICK_PX + LEADER_PX + WORDS_GAP_PX * 2 + Math.max(...marks.map((m) => estimateTextWidth(m.words, TEXT_PX.dimension)))
}

/** How far each mark's words step up off its tick, in pixels, lowest first, so no two touch. */
export function staggered(levels: readonly number[], mpp: number): number[] {
  const order = levels.map((level, i) => ({ level, i })).sort((a, b) => a.level - b.level || a.i - b.i)
  const lift = new Array<number>(levels.length).fill(0)
  let last = -Infinity
  for (const { level, i } of order) {
    const at = Math.max(level / mpp, last + WORDS_STEP_PX)
    lift[i] = at - level / mpp
    last = at
  }
  return lift
}

const n = (value: number): string => lengthText(value)

/**
 * The marks of one side, beside the building: each a group at its level with its datum line back to
 * the part it marks, its tick, its triangle and its words on paper.
 */
export function levelMarkNodes(marks: readonly LevelMarkInput[], side: LevelSide, building: BuildingSpan, mpp: number, look: Look, stroke: number): SvgNode[] {
  const sign = side === 'left' ? -1 : 1
  const x = side === 'left' ? building.from - LEVEL_GAP_PX * mpp : building.to + LEVEL_GAP_PX * mpp
  const lifts = staggered(marks.map((m) => m.level), mpp)
  const pen = n(stroke / mpp)
  return marks.map((mark, i) => {
    const lift = lifts[i]!
    // The datum line: from the near end of what it marks (the building's edge when it says none) out to the tick.
    const reach = side === 'left' ? (mark.from ?? building.from) : (mark.to ?? building.to)
    const datum = `M${n((reach - x) / mpp)},0L0,0`
    const tick = `M0,0L${sign * LEVEL_TICK_PX},0`
    const triangle = `M${sign * 8},0L${sign * 8 - 4},-6L${sign * 8 + 4},-6Z`
    const stepped = lift > 0
    const wordsAt = LEVEL_TICK_PX + WORDS_GAP_PX + (stepped ? LEADER_PX : 0)
    const wide = estimateTextWidth(mark.words, TEXT_PX.dimension) + 4
    // VEW-65: the words stand on paper, so they read over the earth's hatch and the ground line.
    const backing = el('rect', {
      'data-part': 'level-backing',
      x: n(side === 'left' ? -(wordsAt + 2) - wide : wordsAt - 2),
      y: n(2 - TEXT_PX.dimension - lift),
      width: n(wide + 4),
      height: n(TEXT_PX.dimension + 4),
      fill: look.colors.paper
    })
    return el('g', { 'data-part': mark.part, ...(mark.attrs ?? {}), 'data-level': n(mark.level), transform: `translate(${n(x)} ${n(-mark.level)}) scale(${n(mpp)})` }, [
      el('path', { 'data-part': 'level-datum', d: datum, fill: 'none', stroke: look.colors.dimension, 'stroke-width': pen }),
      backing,
      el('path', { d: tick, fill: 'none', stroke: look.colors.dimension, 'stroke-width': pen }),
      ...(stepped ? [el('path', { 'data-part': 'level-leader', d: `M${sign * LEVEL_TICK_PX},0L${sign * (LEVEL_TICK_PX + LEADER_PX)},${n(-lift)}`, fill: 'none', stroke: look.colors.dimension, 'stroke-width': pen })] : []),
      el('path', { d: triangle, fill: look.colors.dimension }),
      el('text', { x: sign * wordsAt, y: n(4 - lift), 'text-anchor': side === 'left' ? 'end' : 'start', fill: look.colors.dimensionText, 'font-family': look.colors.font, 'font-size': TEXT_PX.dimension }, [mark.words])
    ])
  })
}

/** Both sides' marks, in the order of their levels, lowest first, whichever side each stands on. */
export function levelMarksBeside(sides: { readonly left: readonly LevelMarkInput[]; readonly right: readonly LevelMarkInput[] }, building: BuildingSpan, mpp: number, look: Look, stroke: number): SvgNode[] {
  const drawn = [
    ...levelMarkNodes(sides.left, 'left', building, mpp, look, stroke).map((node, i) => ({ node, level: sides.left[i]!.level, order: i })),
    ...levelMarkNodes(sides.right, 'right', building, mpp, look, stroke).map((node, i) => ({ node, level: sides.right[i]!.level, order: sides.left.length + i }))
  ]
  return drawn.sort((a, b) => a.level - b.level || a.order - b.order).map((d) => d.node)
}
