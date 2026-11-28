/**
 * How a figure is written: in the person's display (metres, centimetres, millimetres, or feet
 * and inches, with a decimal point or comma), and CSV for a spreadsheet. Grid's figures are
 * always metres; the display is only a way of writing them (WRT-7).
 */
import { GENERAL_GUIDANCE_LABEL, tolerance } from '@ongrid/floorplan/geometry'

import { languageDecimal, type Language } from '@ongrid/floorplan/messages'
import { displayOf, METRES, showArea, showLength, statedDisplay, type DecimalMark, type Display, type LengthKind } from '@ongrid/floorplan/types/units'

/** The units a call may ask for: metres, centimetres, millimetres, feet and inches (`ft` is the same). */
export const DISPLAY_UNITS = ['m', 'cm', 'mm', 'ft-in', 'ft'] as const
export type DisplayUnits = (typeof DISPLAY_UNITS)[number]

const FOOT_M = 0.3048
const SQ_FT_PER_M2 = 1 / (FOOT_M * FOOT_M)
/** Feet in a metre, to turn a rate per foot into one per metre (ARE-13). */
export const FT_PER_M = 1 / FOOT_M

export function sqFt(m2: number): number {
  return m2 * SQ_FT_PER_M2
}

/**
 * The display a call or a plan asks for (WRT-7): the call's `units` and `decimal` first, then
 * the plan's own `display`, then metres. It only changes how figures are written.
 */
export function displayFor(units: unknown, decimal: unknown, plan?: { readonly display?: Partial<Display> | undefined }, language?: Language): Display {
  const stated = plan?.display
  // MSG-11: the call's language, else the plan's; its decimal mark unless one is chosen.
  const tongue = language ?? stated?.language
  const own: Display | undefined = stated === undefined ? undefined : statedDisplay({ ...stated, ...(tongue === undefined ? {} : { language: tongue }) })
  const mark = (decimal as DecimalMark | undefined) ?? own?.decimal ?? languageDecimal(tongue ?? 'en')
  const withLanguage = (display: Display): Display => (tongue === undefined ? display : { ...display, language: tongue })
  if (units === undefined) return withLanguage(own === undefined ? { ...METRES, decimal: mark } : { ...own, decimal: mark })
  const length = units === 'ft' ? 'ft-in' : (units as Exclude<DisplayUnits, 'ft'>)
  return withLanguage(displayOf(length, mark, undefined, own?.length === length ? own.precision : undefined))
}

/** A length under this many metres is a step, a sill or a tolerance: two decimals could change its verdict. */
const SMALL = 0.1

/** `0.015`, not `0.02` or `0.015000`: three decimals when two would change the figure, never fewer than two. */
export function smallMetres(metres: number): string {
  const two = metres.toFixed(2)
  if (Math.abs(Number(two) - metres) < tolerance('lengthEqual')) return two
  return Math.abs(metres) < SMALL ? metres.toFixed(3) : two
}

/** A length as the person reads it; `height` is a sill, written in inches in feet and inches. */
export function lengthText(metres: number, display: Display, kind: LengthKind = 'length'): string {
  if (display.length === 'm' && display.precision === undefined && Math.abs(metres) < SMALL) {
    const text = smallMetres(metres)
    return `${display.decimal === 'comma' ? text.replace('.', ',') : text} m`
  }
  return showLength(metres, display, { kind })
}

/**
 * A length the person gave, written back as given in the display's unit: as many decimals as the
 * figure has (up to four), never rounded to the display's usual precision.
 */
export function ownLengthText(metres: number, display: Display, kind: LengthKind = 'length'): string {
  if (display.length === 'ft-in' || display.precision !== undefined) return showLength(metres, display, { kind })
  const per = { m: 1, cm: 100, mm: 1000 }[display.length]
  const least = { m: 2, cm: 1, mm: 0 }[display.length]
  const value = Math.round(metres * per * 1e4) / 1e4
  const given = String(value).split('.')[1]?.length ?? 0
  const text = value.toFixed(Math.max(least, given))
  return `${display.decimal === 'comma' ? text.replace('.', ',') : text} ${display.length}`
}

/** An area as the person reads it: square feet keep the square metres beside them, as before. */
export function areaText(m2: number, display: Display): string {
  if (display.area === 'ft2') return `${Math.round(sqFt(m2))} sq ft (${showArea(m2, { ...display, area: 'm2' })})`
  return showArea(m2, display)
}

/**
 * MSG-34: the length unit a CSV table's lengths are written in, named in its column heads: the
 * display's (m, cm, mm), feet for feet and inches (a spreadsheet adds decimal feet, not 8'-6").
 */
export function csvLengthUnit(display: Pick<Display, 'length'> = METRES): 'm' | 'cm' | 'mm' | 'ft' {
  return display.length === 'ft-in' ? 'ft' : display.length
}

const PER_METRE: Readonly<Record<'m' | 'cm' | 'mm' | 'ft', number>> = { m: 1, cm: 100, mm: 1000, ft: 1 / 0.3048 }

/** MSG-34: lengths in metres as a CSV table writes them, in `csvLengthUnit`; a missing one stays missing. A cell's decimal mark is always a point. */
export function csvLengths(display: Pick<Display, 'length'> = METRES, metres: readonly (number | null)[]): (number | null)[] {
  const per = PER_METRE[csvLengthUnit(display)]
  return metres.map((value) => (value === null ? null : per === 1 ? value : value * per))
}

/** One CSV field. A field that a spreadsheet would read as a formula is written as text. */
function csvField(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : ''
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * A table as CSV. Its header is the first row, so a spreadsheet or a script takes it as the
 * header (VEW-83); the label is the last row, in one cell (MSG-3).
 */
export function csv(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return [header, ...rows, [GENERAL_GUIDANCE_LABEL]].map((row) => row.map(csvField).join(',')).join('\n') + '\n'
}
