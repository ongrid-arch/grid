/**
 * VEW-32: the numbers of a plan's parking bays as they are drawn at one zoom. A number that fits
 * inside its bay is that bay's own. Numbers that do not fit would print on top of each other
 * (`P1P2P3`), so a row of such bays is labelled once, as a range from its first number to its last
 * (`P1-P30`), in the middle of the row. A bay on its own that does not fit waits for the zoom.
 *
 * Pure: no DOM, no React.
 */
import type { PlanBay, Vec2 } from '@ongrid/floorplan/geometry'
import { tolerance } from '@ongrid/floorplan/geometry'
import { estimateTextWidth } from '../canvas2d/labelPlacement'
import { TEXT_PX } from './look'

/** The room a number needs either side, in screen pixels. */
const PADDING_PX = 2
/** Bays whose centres differ by less than this, in metres, stand on one line. */
const ON_LINE = 0.05
/** A gap between neighbours of more than this many times the row's smallest pitch ends the row. */
const GAP_FACTOR = 2

export interface BayLabel {
  readonly at: Vec2
  readonly text: string
  /** The bay it numbers; null for the range over a row. */
  readonly bay: string | null
}

const widthPx = (bay: PlanBay, mpp: number): number => (Math.max(...bay.outline.map((p) => p.x)) - Math.min(...bay.outline.map((p) => p.x))) / mpp

/** The labels to draw for these bays at `mpp` metres per pixel, in the bays' order, ranges last. */
export function bayLabels(bays: readonly PlanBay[], mpp: number): BayLabel[] {
  const labels: BayLabel[] = []
  const crowded: (PlanBay & { number: string })[] = []
  for (const bay of bays) {
    if (bay.number === null) continue
    if (estimateTextWidth(bay.number, TEXT_PX.bayNumber) + 2 * PADDING_PX <= widthPx(bay, mpp)) labels.push({ at: bay.centre, text: bay.number, bay: bay.id })
    else crowded.push({ ...bay, number: bay.number })
  }
  for (const row of rows(crowded)) {
    const first = row[0]!
    const last = row.at(-1)!
    labels.push({ at: { x: (first.centre.x + last.centre.x) / 2, y: (first.centre.y + last.centre.y) / 2 }, text: `${first.number}-${last.number}`, bay: null })
  }
  return labels
}

/** The runs of two or more bays that stand on one line, side by side, in order along it. */
function rows<T extends PlanBay>(bays: readonly T[]): T[][] {
  const result: T[][] = []
  const taken = new Set<T>()
  for (const axis of ['y', 'x'] as const) {
    const along = axis === 'y' ? 'x' : 'y'
    const lines = new Map<number, T[]>()
    for (const bay of bays) {
      if (taken.has(bay)) continue
      const key = Math.round(bay.centre[axis] / ON_LINE)
      lines.set(key, [...(lines.get(key) ?? []), bay])
    }
    for (const line of lines.values()) {
      if (line.length < 2) continue
      const sorted = [...line].sort((a, b) => a.centre[along] - b.centre[along])
      const gaps = sorted.slice(1).map((bay, i) => bay.centre[along] - sorted[i]!.centre[along])
      const pitch = Math.min(...gaps)
      let run = [sorted[0]!]
      const flush = (): void => {
        if (run.length >= 2) {
          result.push(run)
          run.forEach((bay) => taken.add(bay))
        }
      }
      sorted.slice(1).forEach((bay, i) => {
        if (gaps[i]! > pitch * GAP_FACTOR + tolerance('joint')) {
          flush()
          run = [bay]
        } else run.push(bay)
      })
      flush()
    }
  }
  return result
}
