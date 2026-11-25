/**
 * ARE-13: quantities for a first estimate, and a cost only from the person's own rates (lab AC-1,
 * AC-2, AC-6, AC-14). Every expected figure below is worked out by hand from the plan, in the
 * comment beside it, not copied from Grid's answer.
 *
 * The rates here are made up, in a made-up currency ("TST"), to test the arithmetic: none is a
 * price.
 */
import { readFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, ROOM_USES, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planEstimate, type EstimateLine } from '../../quantities/estimate'
import { parseRates, priceEstimate, rateCard, RatesRefused } from '../../quantities/rates'
import { surveyPlan } from '../../quantities/survey'
import { bench, type Bench } from './replay/harness'

const ROOMS = resolve(__dirname, '../../../../floorplan/fixtures/rooms')
const raw = (file: string): FloorPlan => JSON.parse(readFileSync(resolve(ROOMS, file), 'utf8')) as FloorPlan
/** The lab's 26-room floor (AC-1, lab O d1-four-flats): four flats round a stair and lift core. */
const fourFlats = raw('four-flats.plan.json')
/** The lab's odd house (AC-6): a ground floor of 10 x 8 m with a cut corner, a first floor of 5 x 8 m over its west half. */
const oddHouse = raw('odd-house.plan.json')
/** The lab's one-room plan (AC-1, lab bench minimal.json): 4 x 3 m on centre lines, 0.3 m walls 2.6 m high. */
const minimal: FloorPlan = parseFloorPlan({
  version: '1',
  units: 'm',
  walls: [
    { id: 'south', start: [0, 0], end: [4, 0], thickness: 0.3, height: 2.6, kind: 'exterior' },
    { id: 'east', start: [4, 0], end: [4, 3], thickness: 0.3, height: 2.6, kind: 'exterior' },
    { id: 'north', start: [4, 3], end: [0, 3], thickness: 0.3, height: 2.6, kind: 'exterior' },
    { id: 'west', start: [0, 3], end: [0, 0], thickness: 0.3, height: 2.6, kind: 'exterior' },
  ],
  rooms: [{ id: 'room', name: 'Room', use: 'living', boundary: ['south', 'east', 'north', 'west'] }],
  openings: [
    { id: 'door', wall: 'south', type: 'door', offset: 0.5, width: 0.9, height: 2.1, hinge: 'start', swing: 'left' },
    { id: 'window', wall: 'north', type: 'window', offset: 1.2, width: 1.4, sill: 0.9, height: 1.3 },
  ],
})

const estimateOf = (plan: FloorPlan) => planEstimate(surveyPlan(parseFloorPlan(plan)))
const line = (lines: readonly EstimateLine[], key: string): EstimateLine => {
  const found = lines.find((l) => l.key === key)
  if (found === undefined) throw new Error(`no line ${key}: ${lines.map((l) => l.key).join(', ')}`)
  return found
}
const sum = (lines: readonly EstimateLine[], prefix: string): number => lines.filter((l) => l.key.startsWith(prefix)).reduce((s, l) => s + l.quantity, 0)

/**
 * The 26-room floor by hand. Every wall is 2.8 m high. Inside faces: outer walls 0.35 thick on
 * the lines x = 0 and 26, y = 0 and 18 (faces at 0.175 in from each); corridor walls 0.25 thick
 * at y = 7.6 and 9.6 (faces 7.475, 7.725, 9.475, 9.725); core and party walls 0.3 at x = 10, 16
 * and 13 north of the corridor; stair and lift walls 0.2; partitions 0.12 (faces 0.06 either side).
 *
 * Rooms, inside sizes (m), area (m²) and perimeter (m):
 *   Flat A (and B, its mirror): living 5.265 x 4.365 = 22.982, 19.26; bedroom 4.29 x 4.365 =
 *     18.726, 17.31; kitchen 3.765 x 2.815 = 10.598, 13.16; hall 3.38 x 2.815 = 9.515, 12.39;
 *     bathroom 2.29 x 2.815 = 6.446, 10.21. Flat: 68.267 m², 72.33 m.
 *   Flat C (and D): living 4.765 x 4.365 = 20.799, 18.26; bedroom 1 3.38 x 4.365 = 14.754, 15.49;
 *     bedroom 2 4.29 x 4.365 = 18.726, 17.31; kitchen 3.265 x 3.615 = 11.803, 13.76; hall
 *     6.08 x 3.615 = 21.979, 19.39; bathroom 3.09 x 3.615 = 11.170, 13.41. Flat: 99.231 m², 97.62 m.
 *   Core: stair 2.75 x 7.3 = 20.075, 20.10; riser 2.75 x 4.725 = 12.994, 14.95; lift
 *     2.75 x 2.375 = 6.531, 10.25; corridor 25.65 x 1.75 = 44.888, 54.80. Core: 84.488 m², 100.10 m.
 *   All rooms: 2 x 68.267 + 2 x 99.231 + 84.488 = 419.484 m²; 2 x 72.33 + 2 x 97.62 + 100.10 = 440.00 m.
 *
 * Openings, 42: 15 doors 0.8 x 2.1 (14 in the flats' partitions, the riser's in the 0.2 stair
 * wall), 6 doors 1.0 x 2.1 in the 0.25 corridor walls (four front doors, stair, lift), 4 doorless
 * openings 1.6 x 2.1 in partitions, and 17 windows in the outer walls: 10 of 1.8 x 1.4 (2.52 m²),
 * 4 of 1.2 x 1.1 (1.32), 2 of 1.2 x 1.4 (1.68), 1 of 1.6 x 1.6 (2.56): 36.40 m² of window.
 * Every door and doorless opening has a room on both sides; every window has one room inside.
 */
const FOUR_FLATS: ReadonlyArray<{ figure: string; got: (lines: readonly EstimateLine[]) => number; want: number }> = [
  // 1. The floor finish lines, every use added: the rooms' areas above, 419.484 m².
  { figure: 'floor finishes, every use', got: (l) => sum(l, 'floor:'), want: 419.48 },
  // 2. Ceilings: taken as flat and as big as the floor, 419.484 m² (assumed).
  { figure: 'ceilings', got: (l) => line(l, 'ceiling').quantity, want: 419.48 },
  // 3. Inside wall faces: 440.00 m of room perimeter x 2.8 = 1,232.00, less every opening from each
  //    side it is seen from: doors 2 x (15 x 1.68 + 6 x 2.10) = 75.60, doorless openings
  //    2 x 4 x 3.36 = 26.88, windows once 36.40. 1,232.00 - 138.88 = 1,093.12 m². (The lab's
  //    1,005.04 is this less its 88.08 m² of wall tiling, which needs a tile height Grid does not have.)
  { figure: 'inside wall faces, every use', got: (l) => sum(l, 'wall_finish:'), want: 1093.12 },
  // 4. Skirting: 440.00 m of perimeter less each door and doorless opening on both its sides:
  //    2 x (15 x 0.8 + 6 x 1.0 + 4 x 1.6) = 48.80. 440.00 - 48.80 = 391.20 m.
  { figure: 'skirting', got: (l) => line(l, 'skirting').quantity, want: 391.2 },
  // 5. Reveals, (2 x height + width, and the width again under a sill) x wall thickness:
  //    windows 10 x (2.8 + 3.6) x 0.35 = 22.40, 4 x (2.2 + 2.4) x 0.35 = 6.44,
  //    2 x (2.8 + 2.4) x 0.35 = 3.64, (3.2 + 3.2) x 0.35 = 2.24; doors 6 x (4.2 + 1.0) x 0.25 = 7.80,
  //    14 x (4.2 + 0.8) x 0.12 = 8.40, (4.2 + 0.8) x 0.2 = 1.00. 51.92 m².
  { figure: 'reveals', got: (l) => line(l, 'reveals').quantity, want: 51.92 },
  // 6. Outer walls 0.35: 26 + 18 + 26 + 18 = 88 m on centre lines x 2.8 = 246.40, less the
  //    windows' 36.40: 210.00 m².
  { figure: 'exterior walls 0.35 m', got: (l) => line(l, 'wall:exterior:0.35').quantity, want: 210 },
  // Walls 7 to 10 run between the faces of the walls they butt into (CNT-31): each end that meets
  // another wall away from its ends stops half that wall's thickness short of its centre line.
  // 7. Corridor walls 0.25: 2 x 26 m, each stopping at the outer walls' faces, 0.175 in at both
  //    ends: 2 x 25.65 = 51.3 m x 2.8 = 143.64, less 6 doors of 2.10: 131.04 m².
  { figure: 'interior walls 0.25 m', got: (l) => line(l, 'wall:interior:0.25').quantity, want: 131.04 },
  // 8. Core and party walls 0.3: 7.6 + 7.6 + 8.4 = 23.6 m, each between a 0.35 outer wall and a
  //    0.25 corridor wall (0.175 + 0.125 = 0.3 off each): 22.7 m x 2.8, no openings: 63.56 m².
  { figure: 'interior walls 0.3 m', got: (l) => line(l, 'wall:interior:0.3').quantity, want: 63.56 },
  // 9. Stair and lift walls 0.2: the stair wall 7.6 less 0.175 + 0.125, the lift wall 3.0 between
  //    the 0.2 stair wall and a 0.3 core wall less 0.1 + 0.15: 7.3 + 2.75 = 10.05 m x 2.8 = 28.14,
  //    less the riser door 1.68: 26.46 m².
  { figure: 'interior walls 0.2 m', got: (l) => line(l, 'wall:interior:0.2').quantity, want: 26.46 },
  // 10. Partitions 0.12: on centre lines flats A and B 10 + 4.6 + 3 + 3 = 20.6 m each, C and D
  //     13 + 4.6 + 4.6 + 3.8 + 3.8 = 29.8 m each, 100.8 m. Between faces: each middle partition
  //     less 0.175 + 0.15 = 0.325, each 4.6 m one less 0.175 + 0.06 = 0.235, each short one less
  //     0.125 + 0.06 = 0.185: 100.8 - 4 x 0.325 - 6 x 0.235 - 8 x 0.185 = 96.61 m x 2.8 = 270.508,
  //     less 14 doors of 1.68 and 4 doorless openings of 3.36: 270.508 - 36.96 = 233.55 m².
  { figure: 'partitions 0.12 m', got: (l) => line(l, 'wall:partition:0.12').quantity, want: 233.55 },
  // 11. Outside face: the outline 26.35 x 18.35 m, 2 x (26.35 + 18.35) = 89.40 m x 2.8 = 250.32,
  //     less the windows' 36.40: 213.92 m².
  { figure: 'outside face', got: (l) => line(l, 'external_finish').quantity, want: 213.92 },
  // 12. Doors and windows, each once: 15 + 6 = 21 doors, 10 + 4 + 2 + 1 = 17 windows (38 nr).
  { figure: 'doors and windows, counted once', got: (l) => sum(l, 'door:') + sum(l, 'window:'), want: 38 },
  // 13. Slab under the one floor: its outline, 26.35 x 18.35 = 483.52 m² (assumed).
  { figure: 'slab', got: (l) => line(l, 'slab').quantity, want: 483.52 },
  // 14. Gross internal area: inside the outer walls' inside faces, 25.65 x 17.65 = 452.72 m².
  { figure: 'gross internal area', got: (l) => line(l, 'gross_internal').quantity, want: 452.72 },
]

describe('AC-1: the 26-room floor, against the figures worked by hand', () => {
  const { lines, notes } = estimateOf(fourFlats)

  it.each(FOUR_FLATS.map((f) => [f.figure, f] as const))('%s', (_, f) => {
    expect(f.got(lines)).toBeCloseTo(f.want, 2)
  })

  it('splits the figures as a rates file prices them: by use, by kind and thickness, by size', () => {
    // Bathrooms: 2 x 6.446 + 2 x 11.170 = 35.23 m².
    expect(line(lines, 'floor:bathroom').quantity).toBeCloseTo(35.23, 2)
    expect(line(lines, 'door:0.8x2.1').quantity).toBe(15)
    expect(line(lines, 'door:1x2.1').quantity).toBe(6)
    expect(line(lines, 'window:1.8x1.4').quantity).toBe(10)
    expect(line(lines, 'window:1.2x1.1').quantity).toBe(4)
    // One floor: nothing stands over it, so its roof is its whole outline, 483.52 m² (assumed).
    expect(line(lines, 'roof').quantity).toBeCloseTo(483.52, 2)
    expect(lines.some((l) => l.key === 'upper_floor')).toBe(false)
    expect(notes).toEqual([])
  })

  it('works out an order from the person\'s pack size and waste: plasterboard as the lab did', () => {
    // (1,093.12 walls + 419.48 ceilings) x 1.1 = 1,663.86 m², / 2.88 m² a sheet = 577.7: 578 sheets.
    const estimate = estimateOf(fourFlats)
    const rates = parseRates({ currency: 'TST', rates: {}, orders: { Plasterboard: { for: ['wall_finish', 'ceiling'], covers: 2.88, waste: 0.1, pack: 'sheets of 1.2 x 2.4 m' } } }, 'rates.json')
    const [order] = priceEstimate(estimate, rates).orders
    expect(order).toMatchObject({ name: 'Plasterboard', packs: 578, unit: 'm2', pack: 'sheets of 1.2 x 2.4 m', assumed: true })
    expect(order!.needed).toBeCloseTo(1663.86, 2)
  })
})

describe('AC-1: the lab\'s one-room plan, as its own tests worked it', () => {
  // Inside 3.7 x 2.7 m; door 0.9 x 2.1 (1.89 m²), window 1.4 x 1.3 on a 0.9 sill (1.82 m²).
  const { lines } = estimateOf(minimal)

  it('measures each line by its rule', () => {
    expect(line(lines, 'floor:living').quantity).toBeCloseTo(3.7 * 2.7, 2)
    // 12.8 m of room perimeter x 2.6, less the door and the window.
    expect(line(lines, 'wall_finish:living').quantity).toBeCloseTo(12.8 * 2.6 - 1.89 - 1.82, 2)
    expect(line(lines, 'skirting').quantity).toBeCloseTo(12.8 - 0.9, 2)
    // 14 m on centre lines x 2.6, less the openings.
    expect(line(lines, 'wall:exterior:0.3').quantity).toBeCloseTo(14 * 2.6 - 3.71, 2)
    // The outline 4.3 x 3.3 m: 15.2 m round, corners in.
    expect(line(lines, 'external_finish').quantity).toBeCloseTo(15.2 * 2.6 - 3.71, 2)
    // The door: two sides and its head; the window: two sides, head and sill.
    expect(line(lines, 'reveals').quantity).toBeCloseTo((2 * 2.1 + 0.9) * 0.3 + (2 * 1.3 + 2 * 1.4) * 0.3, 2)
    expect(line(lines, 'roof').quantity).toBeCloseTo(4.3 * 3.3, 2)
  })

  it('prices only the lines a rate is given for, and lists the rest', () => {
    const pricing = priceEstimate(estimateOf(minimal), parseRates({ currency: 'TST', rates: { floor: { rate: 10, unit: 'm2' }, door: { rate: 100, unit: 'nr' } } }, 'rates.json'))
    // "floor" covers floor:living, "door" covers door:0.9x2.1.
    expect(pricing.total).toBeCloseTo(9.99 * 10 + 100, 2)
    expect(pricing.missing).toContain('window:1.4x1.3')
    expect(pricing.lines.find((l) => l.key === 'window:1.4x1.3')).toMatchObject({ state: 'no rate', amount: null })
    expect(pricing.complete).toBe(false)
  })

  it('turns a rate per square foot into one per square metre', () => {
    const pricing = priceEstimate(estimateOf(minimal), parseRates({ currency: 'TST', rates: { floor: { rate: 1, unit: 'ft2' } } }, 'rates.json'))
    expect(pricing.total).toBeCloseTo(9.99 * 10.76391, 2)
  })

  it('adds a rate\'s waste to the quantity it prices', () => {
    const pricing = priceEstimate(estimateOf(minimal), parseRates({ currency: 'TST', rates: { skirting: { rate: 3, unit: 'm', waste: 0.1 } } }, 'rates.json'))
    // 11.9 m + 10% = 13.09 m at 3: 39.27.
    expect(pricing.total).toBeCloseTo(39.27, 2)
  })
})

describe('AC-2: a cost only from the person\'s own rates', () => {
  it('refuses a rates file with no currency, and a negative rate', () => {
    expect(() => parseRates({ rates: { floor: { rate: 10, unit: 'm2' } } }, 'rates.json')).toThrow(RatesRefused)
    expect(() => parseRates({ currency: '  ', rates: {} }, 'rates.json')).toThrow(/names no currency/)
    expect(() => parseRates({ currency: 'TST', rates: { door: { rate: -5, unit: 'nr' } } }, 'rates.json')).toThrow(/below 0/)
    expect(() => parseRates({ currency: 'TST', rates: { door: { rate: 5, unit: 'each' } } }, 'rates.json')).toThrow(/unit must be one of m2, m, nr, ft2, ft/)
    expect(() => parseRates({ currency: 'TST', rates: { 'Door Sizes': { rate: 5, unit: 'nr' } } }, 'rates.json')).toThrow(/not a key/)
  })

  it('lists a rate in the wrong unit apart from a missing one, and prices neither', () => {
    const pricing = priceEstimate(estimateOf(minimal), parseRates({ currency: 'TST', rates: { floor: { rate: 10, unit: 'nr' }, roof: { rate: 60, unit: 'm' } } }, 'rates.json'))
    expect(pricing.total).toBe(0)
    expect(pricing.wrongUnit).toEqual([
      { key: 'floor:living', rateKey: 'floor', rateUnit: 'nr', unit: 'm2' },
      { key: 'roof', rateKey: 'roof', rateUnit: 'm', unit: 'm2' },
    ])
    expect(pricing.missing).not.toContain('floor:living')
    expect(pricing.missing).not.toContain('roof')
    expect(pricing.missing).toContain('ceiling')
  })

  it('takes an exact key over a shorter one, and names a rate that prices no line', () => {
    const pricing = priceEstimate(estimateOf(fourFlats), parseRates({ currency: 'TST', rates: { floor: { rate: 10, unit: 'm2' }, 'floor:bathroom': { rate: 20, unit: 'm2' }, 'wall:party': { rate: 1, unit: 'm2' } } }, 'rates.json'))
    expect(pricing.lines.find((l) => l.key === 'floor:bathroom')).toMatchObject({ rateKey: 'floor:bathroom', rate: 20 })
    expect(pricing.lines.find((l) => l.key === 'floor:living')).toMatchObject({ rateKey: 'floor', rate: 10 })
    // (419.48 - 35.23) x 10 + 35.23 x 20 = 3,842.5 + 704.6 = 4,547.1.
    expect(pricing.total).toBeCloseTo(384.25 * 10 + 35.23 * 20, 0)
    expect(pricing.unused).toEqual(['wall:party'])
  })

  it('never adds the whole-building line to the total', () => {
    const pricing = priceEstimate(estimateOf(minimal), parseRates({ currency: 'TST', rates: { gross_internal: { rate: 1000, unit: 'm2' } } }, 'rates.json'))
    expect(pricing.total).toBe(0)
    // 3.7 x 2.7 = 9.99 m² inside the outer walls, at 1,000.
    expect(pricing.wholeBuilding).toBeCloseTo(9990, 1)
    expect(pricing.missing).not.toContain('gross_internal')
  })
})

describe('AC-6: the slab and the roof, worked out from the outlines and marked assumed', () => {
  const { lines } = estimateOf(oddHouse)

  it('puts a roof over the single-storey part too, not only over the top floor', () => {
    // Ground floor on centre lines: the pentagon (0,0) (10,0) (10,6) (8,8) (0,8), 80 - 2 = 78 m²,
    // 10 + 6 + 2.83 + 8 + 8 = 34.83 m round. Its outline lies half a 0.3 m wall out, mitred at
    // each corner: 78 + 34.83 x 0.15 + 0.15² x (3 x tan 45° + 2 x tan 22.5°) = 78 + 5.224 + 0.086
    // = 83.31 m². First floor: 5.3 x 8.3 = 43.99 m², all of it over the ground floor. Roof: 43.99
    // over the first floor and 83.31 - 43.99 = 39.32 over the ground: 83.31 m², where the top
    // floor alone would give 43.99 (the lab's first try, 47% short).
    const roof = line(lines, 'roof')
    expect(roof.quantity).toBeCloseTo(83.31, 2)
    expect(roof.floors!.map((f) => [f.floor, Number(f.quantity.toFixed(2))])).toEqual([['ground', 39.32], ['first', 43.99]])
    expect(roof.assumed).toBe(true)
  })

  it('marks every line that rests on a slab, a floor structure, a roof or a ceiling the plan does not hold', () => {
    // The slab is the ground floor's outline, 83.31 m²; the first floor structure its gross
    // internal area, 4.7 x 7.7 = 36.19 m², less the landing over the ground floor's stair room,
    // open as the take-off opens it (no stair is stated): (2.94 - 0.15) x (3.94 - 0.15) =
    // 2.79 x 3.79 = 10.57 m², so 25.62 m² (CNT-31).
    expect(line(lines, 'slab')).toMatchObject({ assumed: true })
    expect(line(lines, 'slab').quantity).toBeCloseTo(83.31, 2)
    expect(line(lines, 'upper_floor').quantity).toBeCloseTo(36.19 - 2.79 * 3.79, 2)
    expect(lines.filter((l) => l.assumed).map((l) => l.key)).toEqual(['ceiling', 'slab', 'upper_floor', 'roof'])
    for (const l of lines.filter((l) => l.assumed)) expect(l.rule).toMatch(/^Assumed: .*because the plan holds no/)
  })

  it('gives one floor its own part: no slab over a floor that is not the lowest, its own roof', () => {
    const first = planEstimate(surveyPlan(parseFloorPlan(oddHouse)), { floors: ['first'] }).lines
    expect(first.some((l) => l.key === 'slab')).toBe(false)
    // 5.3 x 8.3 = 43.99 m² of roof over the first floor; its structure 4.7 x 7.7 = 36.19 m² less
    // the landing's 10.57 m².
    expect(line(first, 'roof').quantity).toBeCloseTo(43.99, 2)
    expect(line(first, 'upper_floor').quantity).toBeCloseTo(36.19 - 2.79 * 3.79, 2)
  })

  it('gives every line its rule in one sentence', () => {
    for (const l of [...lines, ...estimateOf(fourFlats).lines]) {
      expect(l.rule.length, l.key).toBeGreaterThan(40)
      expect(l.rule.split(/\.\s/).length, l.key).toBeLessThanOrEqual(2)
    }
  })

  it('takes a stated stair\'s footprint out of the floor it arrives on', () => {
    // Two storeys of 6 x 5 m on centre lines, 0.3 m outer walls: the first floor's gross internal
    // area is 5.7 x 4.7 = 26.79 m². A straight stair 0.9 m wide on a 3.4 m walking line covers
    // 0.9 x 3.4 = 3.06 m² of it: 23.73 m².
    const plan = raw('two-storey.plan.json')
    const withStair = { ...plan, stairs: [{ id: 'stair', from: 'ground', to: 'first', width: 0.9, run: [[1, 0.6], [1, 4.0]] }] } as unknown as FloorPlan
    expect(line(estimateOf(plan).lines, 'upper_floor').quantity).toBeCloseTo(26.79, 2)
    expect(line(estimateOf(withStair).lines, 'upper_floor').quantity).toBeCloseTo(23.73, 2)
  })
})

/** The one-room plan on a floor of its own, so the floor can state a roof. */
const onGround = (extra: Record<string, unknown> = {}, roof?: Record<string, unknown>): FloorPlan =>
  parseFloorPlan({
    ...JSON.parse(JSON.stringify(minimal)),
    floors: [{ id: 'ground', name: 'Ground floor', level: 0, ...(roof === undefined ? {} : { roof }) }],
    ...extra,
  })

describe('CNT-31: the estimate\'s labels, rate keys and measures', () => {
  it('words every use\'s lines, never "undefined"', () => {
    for (const use of ROOM_USES) {
      const plan = { ...minimal, rooms: [{ ...minimal.rooms[0]!, use }] } as FloorPlan
      const lines = estimateOf(plan).lines.filter((l) => l.key.endsWith(`:${use}`))
      expect(lines.map((l) => l.key), use).toEqual([`floor:${use}`, `wall_finish:${use}`])
      for (const l of lines) expect(l.what, use).not.toMatch(/undefined/)
    }
  })

  it('reads back the rate card it writes, typed walls, doors and finishes by their own names', () => {
    // A wall type and a door type with ids in capitals, a space and an accent, and finishes named
    // in the person's words: every key the estimate writes is a key the rates file takes.
    const plan = parseFloorPlan({
      ...JSON.parse(JSON.stringify(minimal)),
      floors: [{ id: 'ground', name: 'Ground floor', level: 0, roof: { shape: 'gable', eaves: 2.6, pitch: 35 } }],
      types: { walls: [{ id: 'Bloc 30 é', name: 'Block wall', thickness: 0.3 }], doors: [{ id: 'P-Entrée', name: 'Front door' }] },
      walls: minimal.walls.map((w) => (w.id === 'south' ? { ...w, wallType: 'Bloc 30 é' } : w)),
      rooms: [{ ...minimal.rooms[0]!, finishes: { floor: 'Oak boards, Smoked', walls: 'Paint: Matt White' } }],
      openings: minimal.openings.map((o) => (o.id === 'door' ? { ...o, doorType: 'P-Entrée' } : o)),
    })
    const estimate = planEstimate(surveyPlan(plan))
    const keys = estimate.lines.map((l) => l.key)
    expect(keys).toEqual(expect.arrayContaining(['wall-type:Bloc 30 é:0.3', 'door-type:P-Entrée', 'floor:finish:Oak boards, Smoked', 'wall_finish:finish:Paint: Matt White', 'ridge', 'eaves', 'verge']))
    const card = rateCard(estimate)
    const filled = { currency: 'TST', rates: Object.fromEntries(Object.entries(card.rates).map(([k, r]) => [k, { rate: 1, unit: r.unit }])) }
    const rates = parseRates(JSON.parse(JSON.stringify(filled)), 'rates.json')
    expect([...rates.rates.keys()]).toEqual(keys)
    const pricing = priceEstimate(estimate, rates)
    expect(pricing.missing).toEqual([])
    expect(pricing.wrongUnit).toEqual([])
    expect(pricing.unused).toEqual([])
    expect(pricing.complete).toBe(true)
    for (const l of pricing.lines) expect(l.rateKey, l.key).toBe(l.key)
  })

  it('still refuses a key that is no key: capitals first, a line break, an empty part at the end', () => {
    for (const bad of ['Floor', 'floor:', 'floor:a\nb', ':floor', 'wall type:x']) {
      expect(() => parseRates({ currency: 'TST', rates: { [bad]: { rate: 1, unit: 'm2' } } }, 'rates.json'), bad).toThrow(/not a key/)
    }
  })

  it('prices a gable roof on its slope, with its ridge, eaves and verges', () => {
    // The one-room plan's outline is 4.3 x 3.3 m to the outside faces of its 0.3 m walls: 14.19 m²
    // on plan. A gable at 35° along the longer side: on the slope 14.19 / cos 35° = 17.32 m²; the
    // ridge 4.3 m, the eaves 2 x 4.3 = 8.6 m, and four verges each half the 3.3 m span along the
    // slope, 4 x 1.65 / cos 35° = 8.06 m. Flat on plan it was 18% short.
    const lines = estimateOf(onGround({}, { shape: 'gable', eaves: 2.6, pitch: 35 }))
    const cos = Math.cos((35 * Math.PI) / 180)
    const roof = line(lines.lines, 'roof')
    expect(roof.quantity).toBeCloseTo(14.19 / cos, 2)
    expect(roof.what).toBe('Roof, on its slope, wherever no floor is above ("Ground floor" 17.32 m², gable at 35.0°)')
    expect(line(lines.lines, 'ridge').quantity).toBeCloseTo(4.3, 3)
    expect(line(lines.lines, 'eaves').quantity).toBeCloseTo(8.6, 3)
    expect(line(lines.lines, 'verge').quantity).toBeCloseTo((4 * 1.65) / cos, 3)
    expect(lines.lines.some((l) => l.key === 'hip')).toBe(false)
    for (const key of ['ridge', 'eaves', 'verge']) expect(line(lines.lines, key)).toMatchObject({ unit: 'm', assumed: true })
  })

  it('gives a hip roof its hips and a shorter ridge', () => {
    // A hip at 35° over 4.3 x 3.3 m: ridge 4.3 - 3.3 = 1.0 m, eaves 2 x (4.3 + 3.3) = 15.2 m, four
    // hips each from a corner to the ridge: 1.65 m each way on plan, rising 1.65 x tan 35°.
    const { lines } = estimateOf(onGround({}, { shape: 'hip', eaves: 2.6, pitch: 35 }))
    const rise = 1.65 * Math.tan((35 * Math.PI) / 180)
    expect(line(lines, 'ridge').quantity).toBeCloseTo(1, 3)
    expect(line(lines, 'eaves').quantity).toBeCloseTo(15.2, 3)
    expect(line(lines, 'hip').quantity).toBeCloseTo(4 * Math.hypot(1.65, 1.65, rise), 3)
    expect(lines.some((l) => l.key === 'verge')).toBe(false)
  })

  it('takes a void out of the upper floor it opens', () => {
    // The two-storey plan's first floor: 5.7 x 4.7 = 26.79 m² gross internal. Its bathroom made a
    // void, (5.85 - 3.05) x (4.85 - 0.15) = 2.8 x 4.7 = 13.16 m², has no floor to build; it is out
    // of the gross internal area already, so it comes off once.
    const plan = raw('two-storey.plan.json')
    const withVoid = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'f-bath' ? { ...r, void: true } : r)) } as unknown as FloorPlan
    expect(line(estimateOf(withVoid).lines, 'upper_floor').quantity).toBeCloseTo(26.79 - 2.8 * 4.7, 2)
  })

  it('lays no slab, roof or ceiling over an open deck', () => {
    // The one-room plan with a terrace of 4 x 2 m on centre lines to its south, edged by dividing
    // lines. The slab and the roof are the room's alone, 4.3 x 3.3 = 14.19 m², and the ceiling the
    // room's 3.7 x 2.7 = 9.99 m².
    const plan = onGround({
      walls: [
        ...minimal.walls,
        { id: 'deck-e', start: [4, 0], end: [4, -2], virtual: true },
        { id: 'deck-s', start: [4, -2], end: [0, -2], virtual: true },
        { id: 'deck-w', start: [0, -2], end: [0, 0], virtual: true },
      ],
      rooms: [...minimal.rooms, { id: 'deck', name: 'Deck', outdoor: 'terrace', boundary: ['south', 'deck-w', 'deck-s', 'deck-e'] }],
    })
    const { lines } = estimateOf(plan)
    expect(line(lines, 'slab').quantity).toBeCloseTo(14.19, 2)
    expect(line(lines, 'roof').quantity).toBeCloseTo(14.19, 2)
    expect(line(lines, 'ceiling').quantity).toBeCloseTo(9.99, 2)
  })
})

/** A fixed bound means nothing on a machine running more work than it has cores, so it is skipped there. */
const BUSY = loadavg()[0]! > cpus().length

describe('grid_takeoff with for=estimate', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({ 'plan.json': fourFlats })
  })
  afterAll(() => b.close())

  it('gives a rate card and no money when there is no rates file (AC-2)', async () => {
    const r = await b.call('grid_takeoff', { for: 'estimate' })
    expect(r.isError, r.text).toBe(false)
    expect(r.text).toContain('Rate card: no rates given, so no cost.')
    expect(r.text).toContain('  door:0.8x2.1: Door 0.80 × 2.10 m, 15 nr; rate per nr')
    expect(r.text).toContain('  roof: Roof, taken as flat, wherever no floor is above ("Ground floor" 483.52 m²), 483.52 m², assumed; rate per m2')
    expect(r.text).toContain('General guidance, not your local rules')
    expect(r.text).not.toMatch(/ = \d|Total/)
    const card = r.data!['rateCard'] as { currency: string; rates: Record<string, { rate: null; unit: string }> }
    expect(card.currency).toBe('')
    expect(Object.keys(card.rates)).toEqual((r.data!['lines'] as EstimateLine[]).map((l) => l.key))
    expect(card.rates['skirting']).toEqual({ rate: null, unit: 'm' })
    expect(r.data!['cost']).toBeUndefined()
  })

  it('carries each line\'s rule, and marks the assumed ones', async () => {
    const r = await b.call('grid_takeoff', { for: 'estimate' })
    for (const l of r.data!['lines'] as EstimateLine[]) {
      expect(typeof l.rule).toBe('string')
      expect(typeof l.assumed).toBe('boolean')
    }
    expect(r.text).toMatch(/ceiling: Ceilings, every room, 419\.48 m², assumed; rate per m2\n {4}Rule: Assumed: a flat ceiling/)
  })

  it('prices from rates.json beside the plan, and lists missing rates and wrong units apart', async () => {
    b.write('rates.json', { label: 'MADE-UP TEST RATES', currency: 'TST', rates: { floor: { rate: 10, unit: 'm2' }, door: { rate: 100, unit: 'm2' }, skirting: { rate: null, unit: 'm' } } })
    const r = await b.call('grid_takeoff', { for: 'estimate' })
    expect(r.isError, r.text).toBe(false)
    expect(r.text).toContain('Priced from "rates.json" ("MADE-UP TEST RATES"), in "TST"')
    // 419.48 m² x 10.
    expect(r.text).toContain('Total of the priced lines: 4,194.84 TST.')
    expect(r.text).toContain('2 lines have their rate in the wrong unit (door:0.8x2.1: "door" is per m2, the line is in nr; door:1x2.1: "door" is per m2, the line is in nr)')
    expect(r.text).toMatch(/\d+ lines have no rate \(ceiling, wall_finish:bedroom, .*skirting, /)
    expect(r.text).toContain('  skirting: Skirting, every room, 391.20 m, no rate: "skirting" is not filled in')
    const cost = r.data!['cost'] as { missing: string[]; wrongUnit: Array<{ key: string }>; complete: boolean }
    expect(cost.wrongUnit.map((w) => w.key)).toEqual(['door:0.8x2.1', 'door:1x2.1'])
    expect(cost.missing).not.toContain('door:0.8x2.1')
    expect(cost.complete).toBe(false)
  })

  it('refuses a rates file with no currency, naming the file', async () => {
    b.write('nocurrency.json', { label: 'MADE-UP, TEST ONLY', rates: { floor: { rate: 10, unit: 'm2' } } })
    const r = await b.call('grid_takeoff', { for: 'estimate', rates: 'nocurrency.json' })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('The rates file "nocurrency.json" is refused: it names no currency: add "currency", such as "EUR", so that no amount is shown without one.')
  })

  it('refuses a rates file that is not there, and rates without for=estimate', async () => {
    expect((await b.call('grid_takeoff', { for: 'estimate', rates: 'missing.json' })).text).toMatch(/^There is no rates file "missing.json"/)
    expect((await b.call('grid_takeoff', { rates: 'rates.json' })).text).toBe('rates goes with for=estimate or for=change: the take-off by room holds no cost.')
    expect((await b.call('grid_takeoff', { for: 'estimate', rooms: ['A-bath'] })).isError).toBe(true)
  })

  it('writes the bill as CSV, one row per line with its rule', async () => {
    // A folder of its own: the rates.json written above would price it.
    const own = bench({ 'one-room.json': minimal })
    const r = await own.call('grid_takeoff', { plan: 'one-room.json', for: 'estimate', format: 'csv' })
    own.close()
    const rows = r.text.trimEnd().split('\n')
    // MSG-3: every CSV opens with the label, then the header.
    expect(rows[0]).toBe('"General guidance, not your local rules"')
    expect(rows[1]).toBe('section,key,what,quantity,unit,assumed,rate,per,waste,amount,rate key,state,rule')
    expect(rows).toContain('line,door:0.9x2.1,Door 0.90 × 2.10 m,1,nr,,,,,,,no rate,"Counted once per opening, not once per room, by the size of its hole in the wall, width by height; the plan holds no frames, leaves or types."')
    expect(rows.find((row) => row.startsWith('line,roof,'))).toMatch(/^line,roof,"Roof, taken as flat, wherever no floor is above \(""Ground floor"" 14\.19 m²\)",14\.19,m2,assumed,/)
  })

  it.skipIf(BUSY)('answers the 26-room floor in under a second (skipped on a machine under load)', { retry: 2 }, async () => {
    const start = performance.now()
    const r = await b.call('grid_takeoff', { for: 'estimate', rates: 'rates.json' })
    expect(r.isError).toBe(false)
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
