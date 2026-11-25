/**
 * Reading a line of rooms text into words, and a word into a number or a point.
 *
 * A line is split at spaces; a word in double or single quotes may hold spaces, and a quote mark
 * inside them with a backslash before it (`\"`, `\'`) is the mark itself (WRT-55); `#` starts a
 * comment outside quotes; a comma at the end of a word is dropped, so a line may read like a
 * sentence. A plain number is metres. A length may instead carry its unit in one word, with no
 * space (`readLength` in `types/units.ts` reads it): `381cm`, `3810mm`, `3.81m`, `0.5km`, `12ft`,
 * `150in`, `12ft6in`, `12'6"`, `12'-6"`. A quote mark straight after a digit is a foot or inch mark, not a
 * quote. A number may be a sum written with digits and the signs + - * / and brackets, such as
 * `3.0+0.3`, in metres: nothing else is evaluated. A point is two lengths with a comma between and
 * no space, each with or without its unit (`3.2,0`, `10ft,0ft`, WRT-62).
 *
 * WRT-34: a plain number is metres only in a text that reads metres. Under a display line that
 * is not metres (`display ft-in`, `display mm`), the line says what a plain number is
 * (`numbers ft`, `numbers mm`), or a plain number other than 0 is refused as a question; and in a
 * text read in feet, `12-6` is refused, since it reads as a sum and is most likely 12'6".
 *
 * MSG-22: a word outside quotes is read in plain letters (`plainId`): an id written `baño` is
 * `bano` wherever the text names it, so every tool takes it; a name in quotes keeps its accents.
 */
import { english, said } from '../messages/say'
import { plainId } from '../types/planText'
import { LengthRefused, readLength, type LengthUnit } from '../types/units'

/** A problem that stops the reading, with its code and the line it is on. */
export class RoomsStop extends Error {
  override readonly name = 'RoomsStop'
  constructor(
    readonly code: string,
    message: string,
    readonly line: number | null = null
  ) {
    super(message)
  }
}

/** The words of one line, without its comment. */
export function wordsOf(line: string, at: number): string[] {
  return quotedWordsOf(line, at).map((w) => w.text)
}

/** A word of a line, and whether any of it was written in quotes (WRT-14: a floor's name must be). */
export interface LineWord {
  readonly text: string
  readonly quoted: boolean
}

/**
 * The words of one line, without its comment, each with whether it was written in quotes. A word
 * outside quotes is in plain letters (MSG-22) unless `asWritten`.
 */
export function quotedWordsOf(line: string, at: number, asWritten = false): LineWord[] {
  const out: LineWord[] = []
  let word = ''
  let started = false
  let quoted = false
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote !== null) {
      // WRT-55: a quote mark written with a backslash before it is the mark itself: "The \"den\"".
      if (c === '\\' && (line[i + 1] === '"' || line[i + 1] === "'")) {
        word += line[i + 1]
        i++
      } else if (c === quote) quote = null
      else word += c
      continue
    }
    // A foot or inch mark: 12'6", 150". A quote opens only where a digit does not end the word.
    if ((c === '"' || c === "'") && started && /[0-9]$/.test(word)) {
      word += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      started = true
      quoted = true
      continue
    }
    if (c === '#') break
    if (c === ' ' || c === '\t') {
      if (started) out.push({ text: word, quoted })
      word = ''
      started = false
      quoted = false
      continue
    }
    word += c
    started = true
  }
  if (quote !== null) throw new RoomsStop('rooms/syntax', `line ${at}: a quote is opened and never closed.`, at)
  if (started) out.push({ text: word, quoted })
  return out
    .map((w) => (w.text.endsWith(',') ? { ...w, text: w.text.slice(0, -1) } : w))
    .map((w) => (asWritten || w.quoted ? w : { ...w, text: plainId(w.text) }))
    .filter((w) => w.text !== '')
}

/** A sum of numbers: digits, a point, + - * / and brackets. Anything else is not read. */
function evaluate(text: string): number | null {
  let i = 0
  const peek = (): string => text[i] ?? ''
  const skip = (): void => {
    while (peek() === ' ') i++
  }
  function atom(): number | null {
    skip()
    if (peek() === '(') {
      i++
      const value = sum()
      skip()
      if (value === null || peek() !== ')') return null
      i++
      return value
    }
    if (peek() === '-' || peek() === '+') {
      const sign = peek() === '-' ? -1 : 1
      i++
      const value = atom()
      return value === null ? null : sign * value
    }
    const m = /^\d+(?:\.\d*)?|^\.\d+/.exec(text.slice(i))
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }
  function product(): number | null {
    let value = atom()
    for (;;) {
      skip()
      const op = peek()
      if (value === null || (op !== '*' && op !== '/')) return value
      i++
      const next = atom()
      if (next === null) return null
      value = op === '*' ? value * next : value / next
    }
  }
  function sum(): number | null {
    let value = product()
    for (;;) {
      skip()
      const op = peek()
      if (value === null || (op !== '+' && op !== '-')) return value
      i++
      const next = product()
      if (next === null) return null
      value = op === '+' ? value + next : value - next
    }
  }
  const value = sum()
  skip()
  return value !== null && i === text.length && Number.isFinite(value) ? value : null
}

/** A length with its unit in one word: `381cm`, `12ft6in`, `12'-6"`, `10km`. */
const UNIT_WORD = /^[-+]?[0-9.]+\s*(mm|cm|km|m|ft|in|'|")/

/** WRT-22: whether a length word carries its unit (`250m`, `240000mm`), so it is taken as meant. */
export function hasUnit(word: string): boolean {
  return UNIT_WORD.test(word)
}

/** WRT-34: the units a plain number may be read in, named on the display line (`numbers ft`). */
export const PLAIN_UNITS = ['m', 'cm', 'mm', 'ft'] as const
export type PlainUnit = (typeof PLAIN_UNITS)[number]

/** WRT-34: how a plain number is read: the display's length unit, and the unit `numbers` names. */
export interface PlainNumbers {
  readonly display: LengthUnit
  readonly numbers: PlainUnit | null
}

/** A text with no display line: a plain number is metres. */
export const PLAIN_METRES: PlainNumbers = { display: 'm', numbers: null }

/** A plain number in metres; exact for the foot, 0.3048 m by definition. */
function inMetres(value: number, unit: PlainUnit): number {
  if (unit === 'ft') return (value * 3048) / 10_000
  return unit === 'm' ? value : value / (unit === 'cm' ? 100 : 1000)
}

/** The unit a display reads lengths in, as the unit word written after a number. */
const DISPLAY_WORD: Readonly<Record<LengthUnit, PlainUnit>> = { m: 'm', cm: 'cm', mm: 'mm', 'ft-in': 'ft' }

/** WRT-34: a plain number, read as `plain` says, or refused. */
function plainLength(word: string, value: number, at: number, plain: PlainNumbers): number {
  const feet = /^(\d+)-(\d+(?:\.\d+)?)$/.exec(word)
  if (feet && (plain.display === 'ft-in' || plain.numbers === 'ft')) {
    throw new RoomsStop('rooms/units', english(said('rooms.numbers.feetInches', { line: String(at), word, feet: feet[1]!, inches: feet[2]! })), at)
  }
  if (value === 0) return 0
  if (plain.numbers !== null) return inMetres(value, plain.numbers)
  if (plain.display === 'm') return value
  const unit = DISPLAY_WORD[plain.display]
  throw new RoomsStop('rooms/units', english(said('rooms.numbers.question', { line: String(at), word, unit, reads: said(`rooms.numbers.reads.${plain.display}`), plural: said(`rooms.numbers.plain.${unit}`), display: plain.display })), at)
}

/**
 * A length in metres: a word with its unit is read in that unit; a plain number is read as
 * `plain` says (WRT-34), metres in a text with no display line.
 */
export function numberOf(word: string, at: number, plain: PlainNumbers = PLAIN_METRES): number {
  if (/^[0-9.+\-*/() ]+$/.test(word)) {
    const value = evaluate(word)
    if (value !== null) return plainLength(word, value, at, plain)
  }
  if (UNIT_WORD.test(word)) {
    try {
      return readLength(word)
    } catch (error) {
      if (!(error instanceof LengthRefused)) throw error
      throw new RoomsStop('rooms/units', `line ${at}: '${word}' ${error.message}. In rooms text a length and its unit are one word with no space, such as 3.6, 360cm, 12ft or 12'6".`, at)
    }
  }
  throw new RoomsStop('rooms/syntax', `line ${at}: expected a length (3.6 for metres, or with its unit: 360cm, 12ft, 12'6"), found '${word}'.`, at)
}

/** A point written `x,y` with no space. */
export function pointOf(word: string, at: number, plain: PlainNumbers = PLAIN_METRES): [number, number] {
  const parts = word.split(',')
  if (parts.length !== 2) {
    throw new RoomsStop('rooms/syntax', `line ${at}: expected a point written x,y with no space (for example 3.2,0), found '${word}'.`, at)
  }
  return [numberOf(parts[0]!, at, plain), numberOf(parts[1]!, at, plain)]
}

/**
 * WRT-62: whether a word is written as a point, `x,y` with one comma, each side starting as a
 * length does (a digit, a point, a sign or a bracket), with or without its unit: `3.2,0`,
 * `10ft,0ft`, `12'6",4m`. It does not read the lengths: `pointOf` does, and refuses one by name.
 */
export function isPointWord(word: string): boolean {
  return /^[-+(.0-9][^,]*,[-+(.0-9][^,]*$/.test(word)
}

/** WRT-62: whether either length of a point word carries its unit (`10ft,0`). */
export function pointHasUnit(word: string): boolean {
  return word.split(',').some((part) => hasUnit(part))
}

/** Is this word a number as `numberOf` reads it? */
export function isNumberWord(word: string): boolean {
  if (/^[0-9.+\-*/()]+$/.test(word)) return evaluate(word) !== null
  // A word that starts as a length with its unit is one, so a wrong one is refused as a length.
  return UNIT_WORD.test(word)
}

/** A length as rooms text writes it: up to four decimals, no trailing zeros. */
export function metres(value: number): string {
  const rounded = Math.round(value * 10000) / 10000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** Two decimals, for messages. */
export const f2 = (value: number): string => value.toFixed(2)
