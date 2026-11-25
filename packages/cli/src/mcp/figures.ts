/**
 * How the figures in a tool's structured data are written (CMD-22): one rule at the edge of
 * the answer, so no tool has to remember it. A length goes to the millimetre and an area to
 * 0.01 m², rounded once, from a value cleaned of the arithmetic's noise, halves away from
 * zero (`rounded`, ARE-7). So 27.359999999999985 is 27.36, 3.0999999999999996 is 3.1, and a
 * 20.295 m² room is 20.3 however its figure was worked out. The words of an answer are not
 * touched. With `data=compact` the data is also put in the order a reader needs: the
 * totals first, and what is empty left out.
 *
 * Which figures are areas is told by their name, because the answers hold metres and square
 * metres side by side: `area`, anything in m2, the net, gross and circulation figures of the
 * floor areas, the take-off's ceiling, wall face and slab. Under the take-off's wall lines a
 * `net` and a `gross` are lengths. Any other figure is a length, or a plain number, and keeps
 * three decimals.
 */
import { rounded } from '@ongrid/floorplan/geometry'
import type { GridTool } from './toolkit'

/** Decimals of a length in metres: the millimetre. */
const LENGTH_DECIMALS = 3
/** Decimals of an area in square metres. */
const AREA_DECIMALS = 2
/** A key that holds an area, or a whole list or record of them. */
const AREA_KEY = /area|m2|sqm|wallface|byuse|^(walls|unclaimed|net|grossInternal|grossExternal|circulation|ceiling|openingsOff|slab|roof|freeFloor)$/i
/** Under these a `net` or a `gross` is a length: only a name that says area or face is an area. */
const LENGTH_PARENTS = new Set(['walls', 'wallTypes', 'columns'])
const AREA_WORD = /area|m2|sqm|face/i
/** A key whose figure is a place on the globe, never rounded to the millimetre. */
const PLACE_KEY = /^(lat|lon)/i
/** A record the agent hands back as it was given, a camera: its figures are state, never rounded. */
const EXACT_KEYS = new Set(['camera'])
/** Under this a figure is a tolerance or a ratio, kept as it is. */
const SMALL = 0.001
/** A figure that is zero to this many decimals is the arithmetic's noise round zero (3.9e-15 of floor no room covers). */
const NOISE_DECIMALS = 9

function figure(value: number, area: boolean): number {
  if (rounded(value, NOISE_DECIMALS) === 0) return 0
  if (Math.abs(value) < SMALL) return Number(value.toPrecision(12))
  return rounded(value, area ? AREA_DECIMALS : LENGTH_DECIMALS)
}

function roundIn(value: unknown, area: boolean, lengths: boolean, key: string): unknown {
  if (EXACT_KEYS.has(key)) return value
  if (typeof value === 'number') return !Number.isFinite(value) || Number.isInteger(value) || PLACE_KEY.test(key) ? value : figure(value, area)
  if (Array.isArray(value)) return value.map((item) => roundIn(item, area, lengths, key))
  if (typeof value === 'object' && value !== null) {
    // A line of the take-off states its unit: a quantity in m2 is an area.
    const squared = (value as { unit?: unknown }).unit === 'm2'
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        const inLengths = lengths || (LENGTH_PARENTS.has(k) && typeof v === 'object')
        return [k, roundIn(v, area || (squared && k === 'quantity') || (inLengths ? AREA_WORD.test(k) : AREA_KEY.test(k)), inLengths, k)]
      }),
    )
  }
  return value
}

/** The data with every figure rounded as above. */
export function roundedData(data: Record<string, unknown>): Record<string, unknown> {
  return roundIn(data, false, false, '') as Record<string, unknown>
}

const TOTALS_KEY = /^(totals?|cost)$/
const isEmpty = (v: unknown): boolean => v === null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0)

/** Every key the tool's output schema requires, anywhere: those stay even when empty. */
function requiredKeys(schema: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => requiredKeys(s, into))
  else if (typeof schema === 'object' && schema !== null) {
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'required' && Array.isArray(v)) v.forEach((name) => typeof name === 'string' && into.add(name))
      else requiredKeys(v, into)
    }
  }
  return into
}

function leave(value: unknown, keep: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => leave(item, keep))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => keep.has(k) || !isEmpty(v)).map(([k, v]) => [k, leave(v, keep)]))
}

/** The data, compact: the label, the single figures and the totals first, the lists after them. */
export function compactData(data: Record<string, unknown>, tool: Pick<GridTool, 'outputSchema'>): Record<string, unknown> {
  const left = leave(data, requiredKeys(tool.outputSchema)) as Record<string, unknown>
  const entries = Object.entries(left)
  const first = (k: string, v: unknown): boolean => k === 'label' || TOTALS_KEY.test(k) || typeof v !== 'object' || v === null
  return Object.fromEntries([...entries.filter(([k, v]) => first(k, v)), ...entries.filter(([k, v]) => !first(k, v))])
}

/** What a tool's answer carries as data, shaped for the call's arguments. */
export function shapedData(tool: Pick<GridTool, 'outputSchema'>, args: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const done = roundedData(data)
  return args['data'] === 'compact' ? compactData(done, tool) : done
}
