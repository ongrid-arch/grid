import { WHOLE_BUILDING_KEY, type Estimate, type EstimateLine } from './estimate'
import { priceEstimate, type PricedLine, type Rates } from './rates'

/** Match the bill's keys and units. An absent line contributes zero measured quantity. */
function byKey<T extends EstimateLine>(lines: readonly T[]): Map<string, T> {
  return new Map(lines.map((line) => [identity(line), line]))
}

const identity = (line: Pick<EstimateLine, 'key' | 'unit'>): string => `${line.key}\u0000${line.unit}`

function priceBoth(before: Estimate, after: Estimate, rates: Rates) {
  // Packs are an order for one version. They are not part of the estimate's value.
  const pricingRates = { ...rates, orders: [] }
  const old = priceEstimate(before, pricingRates)
  const next = priceEstimate(after, pricingRates)
  const wrongUnit = new Map([...old.wrongUnit, ...next.wrongUnit].map((line) => [identity(line), line]))
  return {
    old: byKey(old.lines),
    next: byKey(next.lines),
    cost: {
      file: rates.file,
      label: rates.label,
      currency: rates.currency,
      before: old.total,
      after: next.total,
      change: next.total - old.total,
      complete: old.complete && next.complete,
      missing: [...new Set([...old.missing, ...next.missing])],
      wrongUnit: [...wrongUnit.values()],
      unused: old.unused.filter((key) => next.unused.includes(key)),
    },
  }
}

export function estimateChange(before: Estimate, after: Estimate, rates: Rates | null) {
  const old = byKey(before.lines)
  const next = byKey(after.lines)
  const pricing = rates === null ? null : priceBoth(before, after, rates)
  const lines = [...new Set([...next.keys(), ...old.keys()])].map((id) => {
    const earlier = old.get(id)
    const later = next.get(id)
    const line = (later ?? earlier)!
    const oldPrice = pricing?.old.get(id)
    const newPrice = pricing?.next.get(id)
    const price: PricedLine | undefined = newPrice ?? oldPrice
    const before = earlier?.quantity ?? 0
    const after = later?.quantity ?? 0
    const beforeAmount = price?.amount == null ? null : oldPrice?.amount ?? 0
    const afterAmount = price?.amount == null ? null : newPrice?.amount ?? 0
    return {
      key: line.key,
      what: line.what,
      unit: line.unit,
      before,
      after,
      change: after - before,
      assumed: (earlier?.assumed ?? false) || (later?.assumed ?? false),
      rule: line.rule,
      alternative: line.key === WHOLE_BUILDING_KEY,
      state: price?.state ?? 'no rate',
      rateKey: price?.rateKey ?? null,
      rate: price?.rate ?? null,
      rateUnit: price?.given?.unit ?? null,
      waste: price?.given?.waste ?? null,
      beforeAmount,
      afterAmount,
      changeAmount: beforeAmount === null || afterAmount === null ? null : afterAmount - beforeAmount,
    }
  })
  return { lines, notes: { before: before.notes, after: after.notes }, cost: pricing?.cost ?? null }
}
