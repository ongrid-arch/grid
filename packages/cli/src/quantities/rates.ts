/**
 * ARE-13: a cost from the person's own rates, never from a price list (lab AC-2).
 *
 * The rates are the person's, in a file of their own beside the plan (`rates.json`), never in
 * the plan and never in Grid. The file names its currency, or it is refused: no amount is ever
 * shown without one. Each rate prices the lines whose key it is, or begins with followed by a
 * colon: `wall:exterior` prices every outside wall thickness, `door` every door size, an exact
 * key wins over a shorter one. A rate per ft² or per ft is turned into one per m² or per m; a
 * rate in any other unit than its line's is not used, and is listed apart from the lines that
 * have no rate. A line with no rate is listed, never filled.
 *
 * The file may also say how materials are ordered (`orders`): which lines an order is for, how
 * much one pack covers, the coats and the waste. Grid adds no waste and no pack size of its own.
 *
 *     {
 *       "label": "Our rates, March",
 *       "currency": "EUR",
 *       "rates": {
 *         "floor": { "rate": 40, "unit": "m2" },
 *         "floor:bathroom": { "rate": 85, "unit": "m2", "waste": 0.1 },
 *         "door": { "rate": 350, "unit": "nr" }
 *       },
 *       "orders": {
 *         "Plasterboard": { "for": ["wall_finish", "ceiling"], "covers": 2.88, "waste": 0.1, "pack": "sheets of 1.2 x 2.4 m" }
 *       }
 *     }
 *
 * Reading goes through the project (`projectFiles.ts`), like every file Grid reads. A refusal
 * names the part of the file and what it takes, and never repeats the person's text.
 */
import path from 'path'
import { tolerance } from '@ongrid/floorplan/geometry'
import { readPlanText } from '@ongrid/floorplan/types/jsonText'
import { PathRefused, quoted, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { textProblem } from '../command/planText'
import { WHOLE_BUILDING_KEY, type Estimate, type EstimateLine, type QuantityUnit } from './estimate'
import { ScheduleRowError } from './schedule'
import { csv, FT_PER_M, sqFt } from './units'

/** The rates file Grid looks for beside the plan when none is named. */
export const RATES_FILE = 'rates.json'
/** The largest rates file Grid reads, in bytes. */
export const RATES_FILE_MAX_BYTES = 1024 * 1024
export const RATE_UNITS = ['m2', 'm', 'nr', 'ft2', 'ft'] as const
export type RateUnit = (typeof RATE_UNITS)[number]
const RATES_MAX = 2_000
const ORDERS_MAX = 200
const ORDER_KEYS_MAX = 100
const CURRENCY_MAX = 16
/** Long enough for the longest key the estimate writes: a finish's name of 120 characters after `wall_finish:finish:`. */
const KEY_MAX = 200
/**
 * A key as the lines write them (CNT-31): a word in small letters (`floor`, `wall-type`), then
 * parts after colons. A part may be the plan's own text, a type's id or a finish's name, so what
 * follows the word may hold any character, a colon too (`wall-type:Bloc 20:0.2`,
 * `floor:finish:Roble`); `textProblem` keeps out line breaks and control characters.
 */
const KEY = /^[a-z][a-z_-]*(?::.+)?$/u

/** Why a rates file was refused. One line; it names parts of the file, never their text. */
export class RatesRefused extends Error {
  override readonly name = 'RatesRefused'
}

export interface Rate {
  /** Per `unit`; null when the person has not filled it in yet, as on the rate card. */
  readonly rate: number | null
  readonly unit: RateUnit
  /** A share added to the quantity before it is priced, 0 to 1. */
  readonly waste: number
}

export interface Order {
  readonly name: string
  /** The keys of the lines it is for; each covers longer keys, as a rate does. */
  readonly for: readonly string[]
  /** How much one pack covers, in the lines' unit. */
  readonly covers: number
  readonly coats: number
  readonly waste: number
  /** What a pack is, in the person's words: "sheets of 1.2 x 2.4 m". */
  readonly pack: string
}

export interface Rates {
  /** The file, relative to the project folder. */
  readonly file: string
  readonly label: string | null
  readonly currency: string
  readonly rates: ReadonlyMap<string, Rate>
  readonly orders: readonly Order[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A field name to show in a refusal: only when it keeps to a key's characters. */
const named = (key: string): string => (/^[A-Za-z0-9_:.x-]{1,64}$/.test(key) ? JSON.stringify(key) : 'a field whose name Grid will not repeat')

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const extra = Object.keys(value).find((key) => !keys.includes(key))
  if (extra !== undefined) throw new RatesRefused(`${where} holds ${named(extra)}, which Grid does not read: it may hold only ${keys.join(', ')}`)
}

function text(value: unknown, where: string, max: number): string {
  if (typeof value !== 'string') throw new RatesRefused(`${where} must be text`)
  const problem = textProblem(value, 'name')
  if (problem !== null) throw new RatesRefused(`${where} ${problem}`)
  if (value.length > max) throw new RatesRefused(`${where} is ${value.length} characters long; it may have at most ${max}`)
  return value.trim()
}

function share(value: unknown, where: string): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new RatesRefused(`${where} must be a share from 0 to 1, such as 0.1 for a tenth more`)
  return value
}

function key(value: string, where: string): string {
  if (value.length > KEY_MAX || !KEY.test(value) || textProblem(value, 'path') !== null) throw new RatesRefused(`${where} has ${named(value)}, which is not a key: a key is a word in small letters, then parts after colons, as the quantities write it (floor:bathroom, wall:exterior:0.35, wall-type:block:0.2, door:0.8x2.1)`)
  return value
}

/** The rates file's JSON, checked. `file` is where it was read, for the answer. */
export function parseRates(raw: unknown, file: string): Rates {
  if (!isObject(raw)) throw new RatesRefused('it must be a JSON object with currency and rates')
  onlyKeys(raw, ['label', 'currency', 'rates', 'orders'], 'the file')
  if (raw['currency'] === undefined || raw['currency'] === null || (typeof raw['currency'] === 'string' && raw['currency'].trim() === '')) {
    throw new RatesRefused('it names no currency: add "currency", such as "EUR", so that no amount is shown without one')
  }
  const currency = text(raw['currency'], 'currency', CURRENCY_MAX)
  const label = raw['label'] === undefined || raw['label'] === null ? null : text(raw['label'], 'label', 200) || null
  if (!isObject(raw['rates'])) throw new RatesRefused('rates must be an object of rates by key, such as {"floor": {"rate": 40, "unit": "m2"}}')
  const entries = Object.entries(raw['rates'])
  if (entries.length > RATES_MAX) throw new RatesRefused(`rates holds ${entries.length.toLocaleString('en-US')} rates; it may hold at most ${RATES_MAX.toLocaleString('en-US')}`)
  const rates = new Map<string, Rate>()
  for (const [k, value] of entries) {
    const at = `rates[${named(k)}]`
    key(k, 'rates')
    if (!isObject(value)) throw new RatesRefused(`${at} must be an object with rate and unit`)
    onlyKeys(value, ['rate', 'unit', 'waste', 'note'], at)
    const rate = value['rate']
    if (rate !== null && (typeof rate !== 'number' || !Number.isFinite(rate))) throw new RatesRefused(`${at}.rate must be a number, or null while it is not filled in`)
    if (typeof rate === 'number' && rate < 0) throw new RatesRefused(`${at}.rate is below 0; a rate is 0 or more`)
    if (typeof value['unit'] !== 'string' || !(RATE_UNITS as readonly string[]).includes(value['unit'])) {
      throw new RatesRefused(`${at}.unit must be one of ${RATE_UNITS.join(', ')}`)
    }
    if (value['note'] !== undefined) text(value['note'], `${at}.note`, 200)
    rates.set(k, { rate: rate as number | null, unit: value['unit'] as RateUnit, waste: share(value['waste'], `${at}.waste`) })
  }
  const orders: Order[] = []
  if (raw['orders'] !== undefined) {
    if (!isObject(raw['orders'])) throw new RatesRefused('orders must be an object of orders by name')
    const list = Object.entries(raw['orders'])
    if (list.length > ORDERS_MAX) throw new RatesRefused(`orders holds ${list.length} orders; it may hold at most ${ORDERS_MAX}`)
    list.forEach(([name, value], i) => {
      const at = `orders, number ${i + 1},`
      text(name, `the name of ${at}`, 120)
      if (!isObject(value)) throw new RatesRefused(`${at} must be an object with for and covers`)
      onlyKeys(value, ['for', 'covers', 'coats', 'waste', 'pack'], at)
      const keys = value['for']
      if (!Array.isArray(keys) || keys.length === 0 || keys.length > ORDER_KEYS_MAX || keys.some((k) => typeof k !== 'string')) {
        throw new RatesRefused(`${at} for must be a list of 1 to ${ORDER_KEYS_MAX} keys of the quantities, such as ["wall_finish", "ceiling"]`)
      }
      const covers = value['covers']
      if (typeof covers !== 'number' || !Number.isFinite(covers) || covers <= 0) throw new RatesRefused(`${at} covers must be a number above 0: how much one pack covers, in the unit of its lines`)
      const coats = value['coats'] ?? 1
      if (typeof coats !== 'number' || !Number.isInteger(coats) || coats < 1 || coats > 20) throw new RatesRefused(`${at} coats must be a whole number from 1 to 20`)
      orders.push({
        name: name.trim(),
        for: (keys as string[]).map((k) => key(k, `${at} for`)),
        covers,
        coats,
        waste: share(value['waste'], `${at} waste`),
        pack: value['pack'] === undefined ? 'packs' : text(value['pack'], `${at} pack`, 120),
      })
    })
  }
  return { file, label, currency, rates, orders }
}

function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

/**
 * The rates file named, or `rates.json` beside the plan. Null when none is named and there is
 * none beside the plan. Refused with `RatesRefused`, or `PathRefused` for the path.
 */
export function readRates(project: Project, planFile: string, given?: string): Rates | null {
  const file = given ?? path.join(path.dirname(planFile), RATES_FILE)
  let read: { text: string; real: string }
  try {
    read = project.readText(file, RATES_FILE_MAX_BYTES)
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) throw new RatesRefused(`The rates file: ${oneLine(error.message)}.`)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      if (given === undefined) return null
      throw new RatesRefused(`There is no rates file ${quoted(file)} in the project folder. Leave rates out for the rate card, the lines with their units, ready to fill.`)
    }
    if (code === 'EISDIR') throw new RatesRefused(`${quoted(file)} is a folder, not a rates file.`)
    if (code === 'EFBIG') throw new RatesRefused(`${quoted(file)} is larger than ${RATES_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a rates file.`)
    if (code === 'EACCES' || code === 'EPERM') throw new RatesRefused(`${quoted(file)} can't be read: permission denied.`)
    throw error
  }
  const shown = project.relative(read.real)
  const parsed = readPlanText(read.text)
  if (!parsed.ok) {
    const where = parsed.fault.kind === 'not-json' && parsed.fault.line !== null ? ` at line ${parsed.fault.line}, column ${parsed.fault.column}` : ''
    throw new RatesRefused(`The rates file ${quoted(shown)} is not JSON${where}.`)
  }
  if (parsed.marks.length > 0) {
    const mark = parsed.marks[0]!
    throw new RatesRefused(`The rates file ${quoted(shown)} holds ${mark.what === 'not-a-number' ? 'a value that is not a number' : 'a decimal comma'} at line ${mark.line}, column ${mark.column}: write numbers with a decimal point.`)
  }
  try {
    return parseRates(parsed.value, shown)
  } catch (error) {
    if (error instanceof RatesRefused) throw new RatesRefused(`The rates file ${quoted(shown)} is refused: ${error.message}.`)
    throw error
  }
}

// ---------------------------------------------------------------------------------------------
// Pricing

/** `priced`, `no rate`, `wrong unit`, or `alternative` for the whole-building line when it is priced. */
export type LineState = 'priced' | 'no rate' | 'wrong unit' | 'alternative'

export interface PricedLine extends EstimateLine {
  readonly state: LineState
  /** The key of the rate that prices it; null when none covers it. */
  readonly rateKey: string | null
  /** The rate as the file gives it. */
  readonly given: { readonly rate: number | null; readonly unit: RateUnit; readonly waste: number } | null
  /** The rate per the line's own unit; null unless it is priced. */
  readonly rate: number | null
  /** The quantity with the rate's waste added; null unless it is priced. */
  readonly priced: number | null
  readonly amount: number | null
}

export interface OrderLine {
  readonly name: string
  /** The lines it is for, by key. */
  readonly lines: readonly string[]
  readonly unit: QuantityUnit
  /** The lines' quantity added up. */
  readonly quantity: number
  /** With every coat and the waste. */
  readonly needed: number
  /** Whole packs. */
  readonly packs: number
  readonly pack: string
  readonly covers: number
  readonly assumed: boolean
  readonly rule: string
}

export interface Pricing {
  readonly file: string
  readonly label: string | null
  readonly currency: string
  readonly lines: readonly PricedLine[]
  /** The priced lines added up: the whole-building line is never in it. */
  readonly total: number
  /** True when every line but the whole-building one is priced. */
  readonly complete: boolean
  /** Lines no rate prices, or whose rate is not filled in, by key. */
  readonly missing: readonly string[]
  /** Lines whose rate is in another unit, apart from the missing ones. */
  readonly wrongUnit: readonly { readonly key: string; readonly rateKey: string; readonly rateUnit: RateUnit; readonly unit: QuantityUnit }[]
  /** Rates that price no line of this plan. */
  readonly unused: readonly string[]
  /** The whole building at its rate, when the file gives one: never added to the total. */
  readonly wholeBuilding: number | null
  readonly orders: readonly OrderLine[]
  /** Orders that could not be worked out, each in a sentence. */
  readonly orderProblems: readonly string[]
}

/** Whether `rateKey` covers `lineKey`: the same, or a shorter key followed by a colon. */
export function covers(rateKey: string, lineKey: string): boolean {
  return lineKey === rateKey || lineKey.startsWith(`${rateKey}:`)
}

/** The rate for a line: its own key first, then each shorter key, dropping a part at a time. */
function rateFor(rates: ReadonlyMap<string, Rate>, lineKey: string): { key: string; rate: Rate } | null {
  for (let k = lineKey; k !== ''; k = k.includes(':') ? k.slice(0, k.lastIndexOf(':')) : '') {
    const rate = rates.get(k)
    if (rate !== undefined) return { key: k, rate }
  }
  return null
}

/** A rate per its own unit as a rate per the line's unit, or null when the units do not match. */
function perLineUnit(rate: number, unit: RateUnit, line: QuantityUnit): number | null {
  if (unit === line) return rate
  if (line === 'm2' && unit === 'ft2') return rate * sqFt(1)
  if (line === 'm' && unit === 'ft') return rate * FT_PER_M
  return null
}

const UNIT_WORDS: Readonly<Record<QuantityUnit, string>> = { m2: 'm²', m: 'm', nr: 'nr' }

function ordersOf(estimate: Estimate, orders: readonly Order[]): { orders: OrderLine[]; problems: string[] } {
  const out: OrderLine[] = []
  const problems: string[] = []
  for (const order of orders) {
    const lines = estimate.lines.filter((line) => line.key !== WHOLE_BUILDING_KEY && order.for.some((k) => covers(k, line.key)))
    if (lines.length === 0) {
      problems.push(`The order ${JSON.stringify(order.name)} is for no line of this plan.`)
      continue
    }
    const units = [...new Set(lines.map((line) => line.unit))]
    if (units.length > 1) {
      problems.push(`The order ${JSON.stringify(order.name)} is for lines in ${units.map((u) => UNIT_WORDS[u]).join(' and ')}; one order takes lines of one unit.`)
      continue
    }
    const unit = units[0]!
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0)
    const needed = quantity * order.coats * (1 + order.waste)
    const packs = Math.ceil(needed / order.covers - tolerance('relativeNoise'))
    const coats = order.coats === 1 ? '' : ` × ${order.coats} coats`
    const waste = order.waste === 0 ? '' : ` + ${+(order.waste * 100).toFixed(2)}% waste`
    out.push({
      name: order.name,
      lines: lines.map((line) => line.key),
      unit,
      quantity,
      needed,
      packs,
      pack: order.pack,
      covers: order.covers,
      assumed: lines.some((line) => line.assumed),
      rule: `${quantity.toFixed(2)} ${UNIT_WORDS[unit]} of ${lines.map((line) => line.key).join(', ')}${coats}${waste}, in whole packs of ${order.covers} ${UNIT_WORDS[unit]}; coverage, coats, waste and pack are the person's, from the rates file.`,
    })
  }
  return { orders: out, problems }
}

/** The estimate priced from the person's rates. */
export function priceEstimate(estimate: Estimate, rates: Rates): Pricing {
  const used = new Set<string>()
  const missing: string[] = []
  const wrongUnit: Pricing['wrongUnit'][number][] = []
  let total = 0
  let wholeBuilding: number | null = null
  const lines = estimate.lines.map((line): PricedLine => {
    const whole = line.key === WHOLE_BUILDING_KEY
    const found = rateFor(rates.rates, line.key)
    if (found !== null) used.add(found.key)
    const given = found === null ? null : { rate: found.rate.rate, unit: found.rate.unit, waste: found.rate.waste }
    const unpriced = { rateKey: found?.key ?? null, given, rate: null, priced: null, amount: null }
    if (found === null || found.rate.rate === null) {
      // The whole-building line is an alternative: no rate for it is not a gap.
      if (!whole) missing.push(line.key)
      return { ...line, state: 'no rate', ...unpriced }
    }
    const rate = perLineUnit(found.rate.rate, found.rate.unit, line.unit)
    if (rate === null) {
      wrongUnit.push({ key: line.key, rateKey: found.key, rateUnit: found.rate.unit, unit: line.unit })
      return { ...line, state: 'wrong unit', ...unpriced }
    }
    const priced = line.quantity * (1 + found.rate.waste)
    const amount = priced * rate
    if (whole) wholeBuilding = amount
    else total += amount
    return { ...line, state: whole ? 'alternative' : 'priced', rateKey: found.key, given, rate, priced, amount }
  })
  const { orders, problems } = ordersOf(estimate, rates.orders)
  return {
    file: rates.file,
    label: rates.label,
    currency: rates.currency,
    lines,
    total,
    complete: missing.length === 0 && wrongUnit.length === 0,
    missing,
    wrongUnit,
    unused: [...rates.rates.keys()].filter((k) => !used.has(k)),
    wholeBuilding,
    orders,
    orderProblems: problems,
  }
}

/** The rate card: every line's key and unit, ready to fill in and save as the rates file. */
export function rateCard(estimate: { readonly lines: readonly Pick<EstimateLine, 'key' | 'unit'>[] }): { readonly label: string; readonly currency: string; readonly rates: Readonly<Record<string, { readonly rate: null; readonly unit: QuantityUnit }>> } {
  return {
    label: '',
    currency: '',
    rates: Object.fromEntries(estimate.lines.map((line) => [line.key, { rate: null, unit: line.unit }])),
  }
}

// ---------------------------------------------------------------------------------------------
// The bill as CSV

type Cell = string | number | null

/** A number for a spreadsheet: finite, and never a negative zero; else the row is named. */
function amountCell(row: number, what: string, value: number | null): number | null {
  if (value === null) return null
  if (!Number.isFinite(value)) throw new ScheduleRowError('bill of quantities', row, `has no number for its ${what}`)
  return value === 0 ? 0 : value
}

/**
 * VEW-83: the decimals a currency's amounts are written with: its smallest unit for an ISO 4217
 * code (two for EUR, none for JPY, three for KWD), else two.
 */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** VEW-83: an amount rounded to its currency's smallest unit; a missing one stays missing. */
function money(value: number | null, digits: number): number | null {
  if (value === null || !Number.isFinite(value)) return value
  const scale = 10 ** digits
  const rounded = Math.round(value * scale) / scale
  return rounded === 0 ? 0 : rounded
}

/**
 * The bill as CSV: one row per line, with its rule and assumed mark; with rates, the rate, the
 * amount and the state of each, then the total; then the orders. Amounts are values, never
 * formulas: a cell a spreadsheet would read as a formula is written as text (`units.ts`). VEW-83:
 * each amount and the total are rounded to the currency's smallest unit; a rate is as given.
 */
export function estimateCsv(estimate: Estimate, pricing: Pricing | null): string {
  const lines: readonly (EstimateLine & Partial<PricedLine>)[] = pricing?.lines ?? estimate.lines
  const per = (unit: QuantityUnit): string | null => (pricing === null ? null : `${pricing.currency}/${unit}`)
  const digits = pricing === null ? 2 : currencyDigits(pricing.currency)
  const rows: Cell[][] = lines.map((line, i) => [
    'line', line.key, line.what, amountCell(i + 1, 'quantity', line.quantity), line.unit, line.assumed ? 'assumed' : '',
    amountCell(i + 1, 'rate', line.rate ?? null), line.rate === null || line.rate === undefined ? null : per(line.unit),
    line.given?.waste ? line.given.waste : null, money(amountCell(i + 1, 'amount', line.amount ?? null), digits), line.rateKey ?? null,
    line.state ?? 'no rate', line.rule,
  ])
  if (pricing !== null) {
    rows.push(['total', '', 'Total of the priced lines', null, '', '', null, null, null, money(amountCell(rows.length + 1, 'total', pricing.total), digits), null, pricing.complete ? 'complete' : 'not every line priced', ''])
    for (const order of pricing.orders) {
      rows.push(['order', order.name, `${order.packs} ${order.pack}`, amountCell(rows.length + 1, 'quantity', order.needed), order.unit, order.assumed ? 'assumed' : '', null, null, null, null, null, '', order.rule])
    }
  }
  return csv(['section', 'key', 'what', 'quantity', 'unit', 'assumed', 'rate', 'per', 'waste', 'amount', 'rate key', 'state', 'rule'], rows)
}
