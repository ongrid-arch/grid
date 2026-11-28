/**
 * VEW-89: a section's dimension chains, drawn as the plan's dimensions are.
 *
 * The core works the chains out (`sectionChains`), each standing on the building's left edge or
 * under its lowest part; this sets them out in pixels and draws each figure with the plan's own
 * `dimensionMark`: the vertical chains past the floor level marks on the left, nearest first, the
 * horizontal ones under the drawing, nearest first, each tied back by a short extension line.
 *
 * Pure: no DOM.
 */
import type { Dimension, SectionChain, Vec2 } from '@ongrid/floorplan/geometry'
import type { Display } from '@ongrid/floorplan/types/units'
import { dimensionTextBox, estimateTextWidth, placeDimensionLabel, withDisplay, type Box } from '../canvas2d/labelPlacement'
import { TEXT_PX } from './look'
import type { Look } from './look'
import { dimensionClutter } from './markLayout'
import { dimensionMark, paints } from './scene'
import type { SvgNode } from './svgNode'
import { el } from './svgNode'

/** How far the first chain stands past the level marks or the drawing, and the next chains past it, in pixels. */
const CHAIN_GAP_PX = 18
const CHAIN_STEP_PX = 30
/** How long the extension line that ties each figure back is, in pixels. */
const STUB_PX = 8
/** The room a chain's figures take past its outermost line, in pixels. */
const FIGURE_PX = estimateTextWidth('00.00', TEXT_PX.dimension) / 2 + 4

/** The room the chains take, in pixels: past the left level marks, and under the drawing. */
export function chainBands(chains: readonly SectionChain[]): { readonly left: number; readonly bottom: number } {
  const band = (count: number): number => (count === 0 ? 0 : CHAIN_GAP_PX + (count - 1) * CHAIN_STEP_PX + FIGURE_PX)
  return { left: band(chains.filter((c) => c.axis === 'vertical').length), bottom: band(chains.filter((c) => c.axis === 'horizontal').length) }
}

/**
 * The chains as SVG, at `mpp` metres a pixel: the vertical ones `marksPx` past the building's left
 * edge (the room its level marks take), in the look's dimension paint and the units given.
 */
export function sectionChainNodes(chains: readonly SectionChain[], marksPx: number, mpp: number, look: Look, paperScale: number | undefined, units: Display): SvgNode[] {
  const paint = paints(look, mpp, paperScale)
  const count = { vertical: 0, horizontal: 0 }
  const stub = STUB_PX * mpp
  const setOut = chains.map((chain) => {
    const out = ((chain.axis === 'vertical' ? marksPx : 0) + CHAIN_GAP_PX + count[chain.axis]++ * CHAIN_STEP_PX) * mpp
    return chain.dimensions.map((d): Dimension => {
      // From the stub's inner end, pushed out to the chain's line.
      const shift = (p: Vec2): Vec2 => ({ x: p.x + d.normal.x * (out - stub), y: p.y + d.normal.y * (out - stub) })
      const from = shift(d.from)
      const to = shift(d.to)
      return { ...d, from, to, offset: stub, labelAt: { x: (from.x + to.x) / 2 + d.normal.x * stub, y: (from.y + to.y) / 2 + d.normal.y * stub } }
    })
  })
  // As on the plan, a figure keeps off the ticks, the extension lines and the figures placed before it:
  // one with no room between its ticks is left off the drawing (the answer still gives it).
  const clutter = dimensionClutter(setOut.flat(), mpp, look.draftedDimensions)
  const placed: Box[] = []
  return withDisplay(units, () =>
    chains.map((chain, i) =>
      el(
        'g',
        { 'data-part': 'section-chain', 'data-chain': chain.kind, 'data-axis': chain.axis },
        setOut[i]!.map((dim) => {
          const labelAt = placeDimensionLabel(dim, [...placed, ...clutter], mpp)
          if (labelAt !== null) placed.push(dimensionTextBox(labelAt, dim, mpp))
          return dimensionMark(dim, mpp, labelAt, undefined, paint, look.draftedDimensions)
        })
      )
    )
  )
}
