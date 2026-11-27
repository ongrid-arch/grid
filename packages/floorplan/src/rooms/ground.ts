/**
 * The site's ground level in rooms text (ARE-62): one line, the level of the ground outside in
 * metres from the ground floor's floor level, the datum of a floor's `elevation` (LVL-4's
 * `site.ground`):
 *
 *   ground <m>                    -0.15 for a floor 15 cm above the ground, 0 for one at it
 *   ground level <m>              the same; so is `ground at <m>`
 *   ground <m> below|above [[the] ground floor]
 *                                 the distance and its way, so no sign is guessed:
 *                                 `ground 0.15 below` is `ground -0.15`
 *
 * CNT-49: the ground on a slope, in the same datum, each a line of its own:
 *
 *   ground north <m> south <m> ...  the ground at the building's sides (`site.groundSides`), any
 *                                 of north, east, south and west, each once
 *   ground slope <n>[%] toward <compass point>   a fall (`site.fall`), in percent, through the
 *                                 `ground <m>` level (else 0) at the middle of the building;
 *                                 `slope <n>% toward <point>` and `ground fall ...` are the same
 *   ground edge <n> <m> [[to] <m>]  the ground along edge n of the plot (`site.groundEdges`): at
 *                                 its first corner, and at its second when it falls along it
 *
 * A length may carry its unit (`ground -6in`), and a plain number is read as the text's display
 * line reads lengths. It is the same field `site ground <m>` writes (`site.ts` keeps both as one,
 * written once), and the read-back writes it as `ground <m>`.
 *
 * Pure: words in, a level out.
 */
import { english, said } from '../messages/say'
import { metres, numberOf, RoomsStop, type PlainNumbers, PLAIN_METRES } from './words'
import { FALL_TOWARD, type FallToward, type Site } from '../types/floorplan'

/** The first word of the line this file reads. */
export const GROUND_LINE_WORD = 'ground'
/** CNT-49: `slope ...` on a line of its own is `ground slope ...`. */
export const SLOPE_LINE_WORD = 'slope'

const SIDES = ['north', 'east', 'south', 'west'] as const
type Side = (typeof SIDES)[number]

/** CNT-49: what a `ground` line on a slope says. */
export type GroundWords =
  | { readonly kind: 'level'; readonly level: number }
  | { readonly kind: 'sides'; readonly sides: Partial<Record<Side, number>> }
  | { readonly kind: 'fall'; readonly fall: { readonly slope: number; readonly toward: FallToward } }
  | { readonly kind: 'edge'; readonly edge: { readonly edge: number; readonly start: number; readonly end?: number } }

const refuseSlope = (at: number, key: 'rooms.ground.sides' | 'rooms.ground.fall' | 'rooms.ground.edge'): never => {
  throw new RoomsStop('rooms/site', english(said(key, { line: String(at) })), at)
}

/** CNT-49: any `ground` line: its one level, or the ground at the sides, a fall or an edge's levels. */
export function groundLineOfWords(words: readonly string[], at: number, plain: PlainNumbers = PLAIN_METRES): GroundWords {
  const first = words[0]
  if (first !== undefined && (SIDES as readonly string[]).includes(first)) {
    const sides: Partial<Record<Side, number>> = {}
    for (let i = 0; i < words.length; i += 2) {
      const side = words[i] as Side
      const figure = words[i + 1]
      if (!(SIDES as readonly string[]).includes(side) || figure === undefined || sides[side] !== undefined) return refuseSlope(at, 'rooms.ground.sides')
      sides[side] = numberOf(figure, at, plain) + 0
    }
    return { kind: 'sides', sides }
  }
  if (first === 'slope' || first === 'fall') return { kind: 'fall', fall: fallOfWords(words.slice(1), at) }
  if (first === 'edge') {
    const [n, start, toWord, ...rest] = words.slice(1)
    const end = toWord === 'to' ? rest.shift() : toWord
    const edge = Number(n)
    if (n === undefined || !Number.isInteger(edge) || edge < 1 || start === undefined || rest.length > 0 || (toWord === 'to' && end === undefined)) return refuseSlope(at, 'rooms.ground.edge')
    const from = numberOf(start, at, plain) + 0
    const to = end === undefined ? undefined : numberOf(end, at, plain) + 0
    return { kind: 'edge', edge: { edge, start: from, ...(to === undefined || to === from ? {} : { end: to }) } }
  }
  return { kind: 'level', level: groundOfWords(words, at, plain) }
}

/** CNT-49: the words after `slope`: `<n>[%] toward <compass point>`. */
export function fallOfWords(words: readonly string[], at: number): { slope: number; toward: FallToward } {
  const [figure, towardWord, point, ...rest] = words
  const slope = figure === undefined ? NaN : Number(figure.replace(/%$/, ''))
  if (!Number.isFinite(slope) || slope < 0 || towardWord !== 'toward' || point === undefined || !(FALL_TOWARD as readonly string[]).includes(point) || rest.length > 0) return refuseSlope(at, 'rooms.ground.fall')
  return { slope: slope + 0, toward: point as FallToward }
}

/** CNT-49: the site's ground on a slope as rooms text writes it back. */
export function slopeLines(site: Pick<Site, 'groundSides' | 'fall' | 'groundEdges'>): string[] {
  const lines: string[] = []
  const sides = site.groundSides
  if (sides !== undefined) {
    const words = SIDES.flatMap((side) => (sides[side] === undefined ? [] : [`${side} ${metres(sides[side]!)}`]))
    if (words.length > 0) lines.push(`ground ${words.join(' ')}`)
  }
  if (site.fall !== undefined) lines.push(`ground slope ${site.fall.slope}% toward ${site.fall.toward}`)
  for (const g of site.groundEdges ?? []) lines.push(`ground edge ${g.edge} ${metres(g.start)}${g.end === undefined ? '' : ` to ${metres(g.end)}`}`)
  return lines
}

const refuse = (at: number, key: 'rooms.ground.usage' | 'rooms.ground.way', value?: string): never => {
  throw new RoomsStop('rooms/site', english(said(key, { line: String(at), ...(value === undefined ? {} : { value }) })), at)
}

/** The ground's level from the words after `ground`, refused with the forms it takes. */
export function groundOfWords(words: readonly string[], at: number, plain: PlainNumbers = PLAIN_METRES): number {
  const t = [...words]
  if (t[0] === 'level' || t[0] === 'at') t.shift()
  const figure = t.shift()
  if (figure === undefined) return refuse(at, 'rooms.ground.usage')
  const value = numberOf(figure, at, plain)
  const way = t[0] === 'below' || t[0] === 'above' ? t.shift() : undefined
  // `[the] ground floor` after the way names the datum the figure is from already.
  if (way !== undefined && t.join(' ').replace(/^the /, '') === 'ground floor') t.length = 0
  if (t.length > 0) return refuse(at, 'rooms.ground.usage')
  if (way === undefined) return value === 0 ? 0 : value
  if (value < 0) return refuse(at, 'rooms.ground.way', figure.replace(/^-/, ''))
  return way === 'below' && value !== 0 ? -value : value
}
