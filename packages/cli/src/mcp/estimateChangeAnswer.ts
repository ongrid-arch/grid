import { say } from '@ongrid/floorplan/messages'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import type { Display } from '@ongrid/floorplan/types/units'
import { PATH_MAX, type Project } from '../fs/projectFiles'
import { planEstimate, type QuantityUnit } from '../quantities/estimate'
import { estimateChange } from '../quantities/estimateChange'
import { rateCard, RATES_FILE, RatesRefused, readRates, type Rates } from '../quantities/rates'
import type { Survey } from '../quantities/survey'
import { areaText, csv, lengthText } from '../quantities/units'
import { asRefusal, BOOLEAN, listSchema, NULLABLE_NUMBER, NULLABLE_STRING, NUMBER, objectSchema, STRING, ToolRefusal, type Answer, type ArgSpec } from './toolkit'

const changeLine = objectSchema({
  key: STRING, what: STRING, unit: STRING, before: NUMBER, after: NUMBER, change: NUMBER,
  assumed: BOOLEAN, rule: STRING, alternative: BOOLEAN, state: STRING, rateKey: NULLABLE_STRING,
  rate: NULLABLE_NUMBER, rateUnit: NULLABLE_STRING, waste: NULLABLE_NUMBER,
  beforeAmount: NULLABLE_NUMBER, afterAmount: NULLABLE_NUMBER, changeAmount: NULLABLE_NUMBER,
})
const changeCost = objectSchema({
  file: STRING, label: NULLABLE_STRING, currency: STRING, before: NUMBER, after: NUMBER, change: NUMBER,
  complete: BOOLEAN, missing: listSchema(STRING), wrongUnit: { type: 'array' }, unused: listSchema(STRING),
})
const comparisonProperties = {
  baseline: STRING, target: STRING, lines: listSchema(changeLine),
  notes: objectSchema({ before: listSchema(STRING), after: listSchema(STRING) }),
  cost: changeCost,
  rateCard: objectSchema({ label: STRING, currency: STRING, rates: { type: 'object' } }),
}

export const CHANGE_RATES_ARG: ArgSpec = {
  type: 'string',
  maxLength: PATH_MAX,
  description: say('en', 'tool.estimateChange.ratesArg'),
  examples: [RATES_FILE, 'costs/rates-2027.json'],
}

export const ESTIMATE_CHANGE_PROPERTIES = comparisonProperties
export const ESTIMATE_CHANGE_SCHEMA = objectSchema(comparisonProperties, ['baseline', 'target', 'lines', 'notes'])

export function ratesForTool(project: Project, file: string, given: unknown) {
  try {
    return readRates(project, file, given as string | undefined)
  } catch (error) {
    if (error instanceof RatesRefused) throw new ToolRefusal(error.message)
    throw asRefusal(error)
  }
}

export function estimateChangeAnswer(
  before: Survey, after: Survey, baseline: string, target: string,
  rates: Rates | null, units: Display, floor?: string, asCsv = false,
): Answer {
  const floors = floor === undefined ? {} : { floors: [floor] }
  const earlier = planEstimate(before, floors)
  const later = planEstimate(after, floors)
  const { lines, cost, notes } = estimateChange(earlier, later, rates)
  const data = {
    label: GENERAL_GUIDANCE_LABEL,
    baseline, target, lines, notes,
    rules: [...new Set(lines.map((line) => line.rule))],
    ...(cost === null ? { rateCard: rateCard({ lines }) } : { cost }),
  }
  if (asCsv) {
    const rows = lines.map((line) => [
      line.key, line.what, line.unit, line.before, line.after, line.change,
      line.beforeAmount, line.afterAmount, line.changeAmount, cost?.currency ?? null,
      line.rate, line.rateKey, line.rateUnit, line.waste, line.state,
      line.assumed ? 'yes' : 'no', line.alternative ? 'yes' : 'no', line.rule,
    ])
    if (cost !== null) rows.push(['', say('en', 'tool.estimateChange.csvTotal'), '', null, null, null, cost.before, cost.after, cost.change, cost.currency, null, null, null, null, cost.complete ? 'complete' : 'partial', '', '', ''])
    for (const [side, remarks] of Object.entries(notes)) {
      for (const note of remarks) rows.push(['', side, '', null, null, null, null, null, null, null, null, null, null, null, '', '', '', note])
    }
    return { text: csv(['key', 'what', 'unit', 'before', 'after', 'change', 'before amount', 'after amount', 'change amount', 'currency', 'rate', 'rate key', 'given unit', 'waste', 'state', 'assumed', 'alternative', 'rule'], rows), data }
  }

  const language = units.language ?? 'en'
  const quantity = (value: number, unit: QuantityUnit): string =>
    unit === 'nr' ? `${value} nr` : unit === 'm3' ? `${value.toFixed(2)} m³` : unit === 'm2' ? areaText(value, units) : lengthText(value, units)
  const money = (value: number): string => `${value.toLocaleString(units.decimal === 'comma' ? 'de-DE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${JSON.stringify(cost!.currency)}`
  const signed = (value: number, shown: string): string => value > 0 ? `+${shown}` : shown
  const text = [say(language, 'tool.estimateChange.heading', { before: JSON.stringify(baseline), after: JSON.stringify(target) })]
  if (cost === null) text.push(say(language, 'tool.estimateChange.card'))
  else {
    text.push(say(language, 'tool.estimateChange.total', {
      file: JSON.stringify(cost.file), before: money(cost.before), after: money(cost.after), change: signed(cost.change, money(cost.change)),
    }))
    if (!cost.complete) text.push(say(language, 'tool.estimateChange.partial'))
  }
  for (const line of lines) {
    const quantities = `${quantity(line.before, line.unit)} → ${quantity(line.after, line.unit)} (${signed(line.change, quantity(line.change, line.unit))})`
    let amount = ''
    if (line.changeAmount !== null) amount = `${money(line.beforeAmount!)} → ${money(line.afterAmount!)} (${signed(line.changeAmount, money(line.changeAmount))})`
    else if (cost !== null) amount = say(language, line.state === 'wrong unit' ? 'tool.estimateChange.wrongUnit' : 'tool.estimateChange.noRate')
    const marks = [
      ...(line.assumed ? [say(language, 'tool.estimateChange.assumed')] : []),
      ...(line.alternative ? [say(language, 'tool.estimateChange.alternative')] : []),
    ]
    text.push(`  ${line.key}: ${line.what}, ${quantities}${amount ? ` | ${amount}` : ''}${marks.length ? ` (${marks.join(', ')})` : ''}`)
  }
  for (const note of notes.before) text.push(say(language, 'tool.estimateChange.noteBefore', { note }))
  for (const note of notes.after) text.push(say(language, 'tool.estimateChange.noteAfter', { note }))
  return { text: text.join('\n'), data }
}
