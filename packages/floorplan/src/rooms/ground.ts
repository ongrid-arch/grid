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
 * A length may carry its unit (`ground -6in`), and a plain number is read as the text's display
 * line reads lengths. It is the same field `site ground <m>` writes (`site.ts` keeps both as one,
 * written once), and the read-back writes it as `ground <m>`.
 *
 * Pure: words in, a level out.
 */
import { english, said } from '../messages/say'
import { numberOf, RoomsStop, type PlainNumbers, PLAIN_METRES } from './words'

/** The first word of the line this file reads. */
export const GROUND_LINE_WORD = 'ground'

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
