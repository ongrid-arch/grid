/**
 * VEW-32: what a picture of a site-sized plan leaves out. At that size a room's own size and a
 * long chain of openings are unreadable and print the same figures over and over; the overall
 * size and the walls' chains stay, and a zoomed picture of one building is not site-sized.
 *
 * Pure: no DOM, no React.
 */
import type { Bounds, Dimension } from '@ongrid/floorplan/geometry'

/** A drawing whose longer side is at least this many metres is a site. */
export const SITE_SCALE_METRES = 100
/** An opening chain with more marks than this is left out of a site picture. */
export const LONG_OPENING_CHAIN = 6

export const isSiteScale = (bounds: Bounds): boolean => Math.max(bounds.width, bounds.height) >= SITE_SCALE_METRES

/** The dimensions a site-sized picture draws: no room sizes, no long opening chains. */
export function withoutSiteClutter(dimensions: readonly Dimension[]): Dimension[] {
  const marks = new Map<string, number>()
  const chainOf = (dim: Dimension): string => `${dim.side ?? ''}|${dim.chain ?? ''}|${dim.normal.x.toFixed(3)},${dim.normal.y.toFixed(3)}|${dim.offset.toFixed(3)}`
  for (const dim of dimensions) if (dim.kind === 'opening') marks.set(chainOf(dim), (marks.get(chainOf(dim)) ?? 0) + 1)
  return dimensions.filter((dim) => dim.kind !== 'room' && !(dim.kind === 'opening' && (marks.get(chainOf(dim)) ?? 0) > LONG_OPENING_CHAIN))
}
