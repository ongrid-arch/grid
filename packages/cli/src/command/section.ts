/**
 * LVL-9: how a section and a plan's marks are asked for, by `grid draw` (`--section`, `--toward`,
 * `--marks`) and by `grid_view` (`cut`, `toward`, `marks`). Light on purpose: the tool server reads
 * it without loading the drawing code.
 *
 * A section is a line on the plan, from one point to another, and the side of it the section looks
 * toward, walking from the first point to the second: `left` (the default) or `right`. The command
 * writes the line as `x1,y1:x2,y2`, in metres in the plan's coordinates.
 */
import type { SectionLine, SectionToward } from '@ongrid/floorplan/geometry/section'
import type { DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { limit, tolerance } from '@ongrid/floorplan/geometry/tolerances'
import { UsageError } from './options'

/** What `--marks` and `marks` may name. */
export const MARK_WORDS = ['levels', 'elevations', 'section', 'schedule', 'access'] as const
export type MarkWord = (typeof MARK_WORDS)[number]

export const TOWARD_WORDS: readonly SectionToward[] = ['left', 'right']

/** The side a section looks toward, from `--toward` or `toward`: left when not given. */
export function towardOf(given: string | undefined, name = '--toward'): SectionToward {
  if (given === undefined) return 'left'
  if (!(TOWARD_WORDS as readonly string[]).includes(given)) throw new UsageError(`${name} takes left or right: the side of the line the section looks toward, walking from its first point to its second.`)
  return given as SectionToward
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

/** A cut line's two points, checked: finite, inside Grid's largest size, and apart. */
export function sectionLineOf(from: readonly [number, number], to: readonly [number, number], toward: SectionToward, name = '--section'): SectionLine {
  const largest = limit('largest')
  for (const value of [...from, ...to]) {
    if (!Number.isFinite(value) || Math.abs(value) > largest) throw new UsageError(`${name} takes coordinates in metres, each within ${largest} of the origin.`)
  }
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) <= tolerance('noLength')) throw new UsageError(`${name} needs two different points: the line is cut from the first to the second.`)
  return { from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] }, toward }
}

/** `--section x1,y1:x2,y2`, read. */
export function readSectionOption(text: string, toward: SectionToward): SectionLine {
  const points = text.split(':').map((point) => point.split(',').map((v) => v.trim()))
  if (points.length !== 2 || points.some((p) => p.length !== 2 || p.some((v) => !NUMBER.test(v)))) {
    throw new UsageError(`--section takes the line to cut along as x1,y1:x2,y2, in metres, for example 0,2.5:9,2.5: got ${JSON.stringify(text)}.`)
  }
  const [a, b] = points.map((p) => [Number(p[0]), Number(p[1])] as [number, number])
  return sectionLineOf(a!, b!, toward)
}

/** `--marks` or `marks`, read: each word once, known by name. */
export function readMarks(words: readonly string[], name = '--marks'): Set<MarkWord> {
  const found = new Set<MarkWord>()
  for (const word of words) {
    if (!(MARK_WORDS as readonly string[]).includes(word)) throw new UsageError(`${name} ${JSON.stringify(word)} is not a mark Grid draws on a plan: use ${MARK_WORDS.join(', ')}${name === '--marks' ? ', joined by commas' : ''}.`)
    if (found.has(word as MarkWord)) throw new UsageError(`${name} names ${word} twice.`)
    found.add(word as MarkWord)
  }
  if (found.size === 0) throw new UsageError(`${name} needs the marks to draw: ${MARK_WORDS.join(', ')}${name === '--marks' ? ', joined by commas' : ''}.`)
  return found
}

/**
 * The marks a plan picture draws, from the words and the section line. ARE-15's `schedule` and
 * SHT-27's `access` need the plan read, so the caller adds them (`withScheduleMarks`,
 * `quantities/schedule.ts`; `withAccessMarks`, `quantities/accessMarks.ts`).
 */
export function marksAsked(words: ReadonlySet<MarkWord>, line: SectionLine | null): DrawingMarksAsked {
  return { section: words.has('section') ? line : null, elevations: words.has('elevations'), levels: words.has('levels') }
}
