/**
 * Lengths and areas at the edge (WRT-7, lab AA-22, WR-18, R-2): the one reader of a length a
 * person or an agent types, and the one writer of a length or an area they read.
 *
 * The plan file always stores metres. A length comes in as a bare number in metres, or as text
 * with its unit: `3.81`, `3.81 m`, `381 cm`, `3810 mm`, `12'6"`, `12 ft 6 in`, `150"`, and with
 * the decimal comma chosen, `3,81`. It goes out in the person's display: metres, centimetres,
 * millimetres or feet and inches, with a decimal point or comma.
 *
 * Pure: text and numbers in, text and numbers out.
 */
import { limit, tolerance } from '../geometry/tolerances'
import { languageDecimal, type Language } from '../messages/languages'

export const LENGTH_UNITS = ['m', 'cm', 'mm', 'ft-in'] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]
export const AREA_UNITS = ['m2', 'ft2'] as const
export type AreaUnit = (typeof AREA_UNITS)[number]
export const DECIMAL_MARKS = ['point', 'comma'] as const
export type DecimalMark = (typeof DECIMAL_MARKS)[number]

/** How the person reads lengths and areas. Never stored in the geometry: the file is in metres. */
export interface Display {
  readonly length: LengthUnit
  readonly area: AreaUnit
  readonly decimal: DecimalMark
  /**
   * Decimals shown: for metres 2 (2.40), centimetres 1, millimetres 0 (2400); for feet and
   * inches, the inch is split into 2 ** precision parts (0: whole inches, 1: halves, 3: eighths).
   */
  readonly precision?: number
  /** MSG-11: the language Grid's words are written in; English when not given. */
  readonly language?: Language
}

export const METRES: Display = { length: 'm', area: 'm2', decimal: 'point' }

/** Exact by definition: 25.4 mm, and twelve of them. */
const INCH = 254 / 10_000
const FOOT = 12 * INCH
const PER_METRE: Record<Exclude<LengthUnit, 'ft-in'>, number> = { m: 1, cm: 100, mm: 1000 }

/** Why a length could not be read, in words, naming what was meant. Never the text sent. */
export class LengthRefused extends Error {
  override readonly name = 'LengthRefused'
}

/** A number as typed: digits with one decimal mark, the comma only when it is the person's mark. */
function numberOf(text: string, decimal: DecimalMark): number | null {
  const t = text.trim()
  if (decimal === 'comma') {
    if (/^[-+]?\d+(,\d+)?$/.test(t)) return Number(t.replace(',', '.'))
    if (/^[-+]?\d+\.\d+$/.test(t)) return Number(t)
    return null
  }
  if (/^[-+]?\d+,\d+$/.test(t)) throw new LengthRefused('has a decimal comma: write 3.81, or choose the decimal comma to type 3,81')
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return Number(t)
  return null
}

/** Whole and fractional inches: `6`, `6.5`, `6 1/2`, `1/2`. */
function inchesOf(text: string, decimal: DecimalMark): number | null {
  const t = text.trim()
  const frac = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t)
  if (frac) {
    const whole = frac[1] === undefined ? 0 : Number(frac[1])
    const below = Number(frac[3])
    if (below === 0) return null
    return whole + Number(frac[2]) / below
  }
  return numberOf(t, decimal)
}

/**
 * A length in metres from what was typed. A number is metres; text may carry its unit. Refuses
 * what it cannot read, and a length past Grid's largest, in words.
 */
export function readLength(value: unknown, decimal: DecimalMark = 'point'): number {
  let metres: number | null = null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new LengthRefused('is not a finite number')
    metres = value
  } else if (typeof value === 'string') {
    const t = value.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"')
    if (t === '') throw new LengthRefused('is empty: write a length, such as 3.81 or 381 cm')
    const feetInches = /^([-+]?\d+(?:[.,]\d+)?)\s*(?:'|ft|feet|foot)\s*-?\s*(?:([\d./ ,]+?)\s*(?:"|in|inch|inches))?$/.exec(t)
    const inchesOnly = /^([-+]?[\d./ ,]+?)\s*(?:"|in|inch|inches)$/.exec(t)
    const withUnit = /^([-+]?[\d.,]+)\s*(mm|cm|km|m|millimetres?|centimetres?|kilometres?|metres?|millimeters?|centimeters?|kilometers?|meters?)$/.exec(t)
    if (feetInches) {
      const feet = numberOf(feetInches[1]!, decimal)
      const inches = feetInches[2] === undefined ? 0 : inchesOf(feetInches[2], decimal)
      if (feet !== null && inches !== null) {
        if (inches >= 12) throw new LengthRefused(`has ${inches} inches after the feet: write them as feet, such as 13'0" for 12'12"`)
        metres = Math.sign(feet || 1) * (Math.abs(feet) * FOOT + inches * INCH)
      }
    } else if (inchesOnly) {
      const inches = inchesOf(inchesOnly[1]!, decimal)
      if (inches !== null) metres = inches * INCH
    } else if (withUnit) {
      const n = numberOf(withUnit[1]!, decimal)
      const unit = withUnit[2]!
      const per = unit.startsWith('mm') || unit.startsWith('milli') ? 1000 : unit.startsWith('cm') || unit.startsWith('centi') ? 100 : unit.startsWith('k') ? 1 / 1000 : 1
      if (n !== null) metres = n / per
    } else {
      metres = numberOf(t, decimal)
    }
    if (metres === null) throw new LengthRefused('is not a length Grid reads: write metres (3.81), or a number with its unit: 381 cm, 3810 mm, 12\'6", 150"')
  } else {
    throw new LengthRefused('takes a length: a number in metres, or text with its unit')
  }
  const largest = limit('largest')
  if (Math.abs(metres) > largest) throw new LengthRefused(`is ${Math.abs(metres).toExponential(2)} m, past the largest length Grid takes, ${largest.toExponential(0)} m`)
  return metres
}

/** The number with the person's decimal mark. */
function marked(text: string, decimal: DecimalMark): string {
  return decimal === 'comma' ? text.replace('.', ',') : text
}

/** How a length is meant: most are along the floor; a sill or an opening's height is read in inches in feet and inches. */
export type LengthKind = 'length' | 'height'

/**
 * A length for a person: `2.40 m`, `240.0 cm`, `2400 mm`, `7'-10 1/2"`; a height in feet and
 * inches is in inches, as `48"`. `unit: false` leaves the metric unit off (a dimension line).
 */
export function showLength(metres: number, display: Display = METRES, options: { kind?: LengthKind; unit?: boolean } = {}): string {
  const unit = options.unit ?? true
  if (display.length === 'ft-in') {
    const parts = 2 ** Math.max(0, Math.min(5, display.precision ?? 0))
    const sign = metres < 0 ? '-' : ''
    // MSG-37: a half is rounded away from zero, past the float noise of the metres behind it.
    const total = Math.round(((Math.abs(metres) + tolerance('lengthEqual')) / INCH) * parts) / parts
    const inchText = (inches: number): string => {
      const whole = Math.floor(inches + tolerance('noLength'))
      const rest = Math.round((inches - whole) * parts)
      if (rest === 0) return `${whole}`
      let num = rest
      let den = parts
      while (num % 2 === 0) {
        num /= 2
        den /= 2
      }
      return whole === 0 ? `${num}/${den}` : `${whole} ${num}/${den}`
    }
    if (options.kind === 'height') return `${sign}${inchText(total)}"`
    const feet = Math.floor(total / 12 + tolerance('noLength'))
    return `${sign}${feet}'-${inchText(total - feet * 12)}"`
  }
  const per = PER_METRE[display.length]
  const decimals = display.precision ?? (display.length === 'm' ? 2 : display.length === 'cm' ? 1 : 0)
  const text = marked(((metres + Math.sign(metres) * tolerance('lengthEqual')) * per).toFixed(decimals), display.decimal)
  return unit ? `${text} ${display.length}` : text
}

/** An area for a person: `12.40 m²` or `133.5 sq ft`. */
export function showArea(squareMetres: number, display: Display = METRES, decimals?: number): string {
  if (display.area === 'ft2') return `${marked((squareMetres / (FOOT * FOOT)).toFixed(decimals ?? 1), display.decimal)} sq ft`
  return `${marked(squareMetres.toFixed(decimals ?? 2), display.decimal)} m²`
}

/** The display a word names, for an option or an argument: `m`, `cm`, `mm`, `ft-in`, each with `comma` for the decimal comma. */
export function displayOf(length: LengthUnit, decimal: DecimalMark = 'point', area?: AreaUnit, precision?: number): Display {
  return { length, area: area ?? (length === 'ft-in' ? 'ft2' : 'm2'), decimal, ...(precision !== undefined ? { precision } : {}) }
}

/**
 * MSG-11: the display a plan's own `display` states: metres when it names no length unit, and a
 * language's own decimal mark (a comma for Spanish) unless it names one.
 */
export function statedDisplay(stated: { readonly length?: LengthUnit | undefined; readonly area?: AreaUnit | undefined; readonly decimal?: DecimalMark | undefined; readonly precision?: number | undefined; readonly language?: Language | undefined }): Display {
  const length = stated.length ?? 'm'
  const decimal = stated.decimal ?? languageDecimal(stated.language ?? 'en')
  const display = displayOf(length, decimal, stated.area, stated.precision)
  return stated.language === undefined ? display : { ...display, language: stated.language }
}

/** The units a plan file may state for its lengths, with metres per unit. Grid writes metres. */
export const FILE_UNITS: Readonly<Record<string, { metres: number; name: string }>> = {
  m: { metres: 1, name: 'metres' },
  cm: { metres: 1 / 100, name: 'centimetres' },
  mm: { metres: 1 / 1000, name: 'millimetres' },
  ft: { metres: FOOT, name: 'feet' },
  in: { metres: INCH, name: 'inches' },
}

/** Every length a plan file holds, by list: the fields, and those that are a point or a pair. */
const LENGTH_FIELDS: Readonly<Record<string, readonly string[]>> = {
  walls: ['start', 'end', 'thickness', 'height'],
  // CNT-14: the part of a door or window that opens is a length too.
  openings: ['offset', 'width', 'sill', 'height', 'opens.width', 'opens.height'],
  rooms: ['height', 'floorOffset'],
  floors: ['elevation', 'height', 'slab'],
  items: ['at', 'size', 'height'],
  // LVL-8: an opening pattern's spacing, and the lengths of the opening and the margins in it.
  patterns: ['spacing', 'opening.width', 'opening.sill', 'opening.height', 'opening.opens.width', 'opening.opens.height', 'margins.start', 'margins.end'],
}

/** CNT-15: every length a named type holds, by its list in `types`. A wall type's height may be a word, left as it is. */
const TYPE_LENGTH_FIELDS: Readonly<Record<string, readonly string[]>> = {
  walls: ['thickness', 'height'],
  doors: ['width', 'height', 'opens.width', 'opens.height'],
  windows: ['width', 'height', 'sill', 'opens.width', 'opens.height'],
}

/** `part` with the length at `path` (a field, or a field inside a field) scaled, when it is there. */
function scaledAt(part: Record<string, unknown>, path: readonly string[], scaled: (v: unknown) => unknown): Record<string, unknown> {
  const [head, ...rest] = path as [string, ...string[]]
  if (!(head in part)) return part
  if (rest.length === 0) return { ...part, [head]: scaled(part[head]) }
  const nested = part[head]
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) return part
  return { ...part, [head]: scaledAt(nested as Record<string, unknown>, rest, scaled) }
}

/**
 * A plan file that states its lengths in another unit (`"units": "mm"`), with every length in
 * metres and `units` set to `m`; `from` names the unit it was in. A value that is not a number
 * is left as it is, for the reader to name. Any other file is given back as it was.
 */
export function planInMetres<T>(raw: T): { raw: T; from: string | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { raw, from: null }
  const plan = raw as Record<string, unknown>
  const stated = typeof plan['units'] === 'string' ? (plan['units'] as string).trim().toLowerCase() : null
  if (stated === null || stated === 'm' || !Object.hasOwn(FILE_UNITS, stated)) return { raw, from: null }
  const k = FILE_UNITS[stated]!.metres
  // To a nanometre, so 3810 mm is written 3.81 and not 3.8100000000000005.
  const one = (x: unknown): unknown => (typeof x === 'number' && Number.isFinite(x) ? Number((x * k).toFixed(9)) : x)
  const scaled = (v: unknown): unknown => (Array.isArray(v) ? v.map(one) : one(v))
  const out: Record<string, unknown> = { ...plan, units: 'm' }
  for (const [list, fields] of Object.entries(LENGTH_FIELDS)) {
    if (!Array.isArray(plan[list])) continue
    out[list] = (plan[list] as unknown[]).map((part) => {
      if (typeof part !== 'object' || part === null || Array.isArray(part)) return part
      let next: Record<string, unknown> = { ...(part as Record<string, unknown>) }
      for (const field of fields) next = scaledAt(next, field.split('.'), scaled)
      return next
    })
  }
  // CNT-15 (C24): the named types' lengths, in the same unit.
  const types = plan['types']
  if (typeof types === 'object' && types !== null && !Array.isArray(types)) {
    const next: Record<string, unknown> = { ...(types as Record<string, unknown>) }
    for (const [list, fields] of Object.entries(TYPE_LENGTH_FIELDS)) {
      if (!Array.isArray(next[list])) continue
      next[list] = (next[list] as unknown[]).map((part) => {
        if (typeof part !== 'object' || part === null || Array.isArray(part)) return part
        let scaledPart: Record<string, unknown> = { ...(part as Record<string, unknown>) }
        for (const field of fields) scaledPart = scaledAt(scaledPart, field.split('.'), scaled)
        return scaledPart
      })
    }
    out['types'] = next
  }
  return { raw: out as T, from: stated }
}
