/**
 * BRF-4 (lab FD-1): massing before walls, and "how much fits on this plot", through the tools.
 *
 * FD-1's plot is the lab's I series plot (`I/scenarios/s5-plot`): (0, 0), (18, 0), (22, 25),
 * (0, 25), 500 m² by hand. The massing outline is the outside face of the house its second
 * attempt drew, (3, 5), (15.762, 5), (18.482, 22), (3, 22): 240.074 m² a floor by hand, two
 * floors 3 m high, 2 homes on each, 3 parking spaces on the ground floor. By hand: coverage
 * 240.074 / 500 = 48.0%, floor area ratio 480.149 / 500 = 0.96, height 3 + 0.25 + 3 + 0.25 =
 * 6.50 m, parking 3 / 4 = 0.75 a home, and 3.00 m from the west edge (x 0 to x 3) and from the slanted east edge at both corners.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { bench, type Bench, type Reply } from './replay/harness'

const OUTLINE = [[3, 5], [15.762, 5], [18.482, 22], [3, 22]]
const FD1 = {
  version: '1',
  units: 'm',
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0, height: 3, building: 'home', outline: OUTLINE, homes: 2, parking: 3 },
    { id: 'first', name: 'First floor', level: 1, height: 3, building: 'home', outline: OUTLINE, homes: 2 },
  ],
  walls: [],
  rooms: [],
  openings: [],
  site: { boundary: [[0, 0], [18, 0], [22, 25], [0, 25]], streets: [1], setbacks: [{ from: 'all', distance: 3, source: 'given' }] },
}
const BRIEF = {
  version: '1',
  figures: {
    heading: "The person's own figures: theirs, not from any code or standard.",
    plot_coverage: { value: 40, level: 'must', source: 'given', quote: 'the plot can be 40% built on' },
    floor_area_ratio: { value: 1, measure: 'gross_external', level: 'must', source: 'given', quote: 'a ratio of one' },
    building_height: { value: 9, level: 'must', source: 'given', quote: 'nine metres at most' },
    parking_per_home: { value: 1, level: 'must', source: 'given', quote: 'one space a home' },
  },
}

let b: Bench
beforeAll(() => {
  b = bench({ 'fd1.json': FD1, 'fd1.brief.json': BRIEF, 'bare.json': FD1, 'ratio.json': FD1, 'ratio.brief.json': { version: '1', figures: { floor_area_ratio: { value: 1, level: 'should', source: 'assumed' } } } })
})
afterAll(() => b.close())

async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(name, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('FD-1: the plot with a massing outline, before any wall', () => {
  it('returns the gross area per floor and a storey count (grid_areas)', async () => {
    const reply = await call('grid_areas', { plan: 'fd1.json' })
    expect(reply.text).toContain('Floor "ground": net 0.00 m², gross internal not known, gross external 240.07 m².')
    expect(reply.text).toContain('Floor "first": net 0.00 m², gross internal not known, gross external 240.07 m².')
    expect(reply.text).toContain('Gross external: 480.15 m²')
    expect(reply.text).toContain('Storeys: 2 storeys at or above the ground floor, none below it; counted by level, from the floors that hold an outline or walls that close one.')
    expect(reply.text).toContain('Floors "Ground floor", "First floor" are massing, an outline with no walls yet')
    const data = reply.data as { floors: { floor: string; grossExternal: number; massing?: boolean }[]; storeys: { above: number; below: number } }
    expect(data.floors.map((f) => [f.floor, f.massing, Math.round(f.grossExternal * 100) / 100])).toEqual([['ground', true, 240.07], ['first', true, 240.07]])
    expect(data.storeys).toMatchObject({ above: 2, below: 0 })
  })

  it('measures the plot against the massing (grid_measure what=site)', async () => {
    const reply = await call('grid_measure', { what: 'site', plan: 'bare.json' })
    const lines = reply.text.split('\n')
    expect(lines[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(reply.text).toContain("Plot coverage: 48%, the building's 240.07 m² on the 500.00 m² plot.")
    expect(reply.text).toContain('  Edge 4: 3.00 m from the west boundary; you asked for 3.00 m.')
    expect(reply.text).toContain('Storeys: 2 storeys at or above the ground floor')
    expect(reply.text).toContain('  "Ground floor": gross external 240.07 m², massing: its outline, no walls yet.')
    expect(reply.text).toContain('Site limits, the person\'s own figures: theirs, not from any code or standard.')
  })
})

describe('FD-1: the person\'s own site limits, used, allowed, and met or not', () => {
  it('reports each with the area rule named, and Grid supplies no figure', async () => {
    const reply = await call('grid_measure', { what: 'site', plan: 'fd1.json' })
    const limits = reply.text.split('\n').filter((l) => /^ {2}(Plot coverage|Floor area ratio|Building height|Parking per home|Set-back)/.test(l))
    expect(limits).toEqual([
      "  Plot coverage: used 48.0%, your limit at most 40%: not met. Measured as the building seen from above, every floor at or above the ground floor, open outdoor space left out, inside the plot's boundary, over the plot's area: 240.07 m² over 500.00 m².",
      '  Floor area ratio: used 0.96, your limit at most 1: met. Measured as Gross external area (Gross external area is the floor inside the outside face of the walls, every wall counted, and less any void, which has no floor), of every floor at or above the ground floor, over the plot\'s area: 480.15 m² over 500.00 m².',
      "  Building height: used 6.50 m, your limit at most 9.00 m: met. Measured as from the ground to the top of the highest roof: a floor's level, its clear height and the roof slab over it, or the ridge its roof states, and its parapet; from the ground floor's floor level, since site.ground states no ground, to the roof over \"First floor\".",
      '  Parking per home: used 0.75 spaces per home, your limit at least 1 space per home: not met. Measured as the parking spaces the floors state (floors[].parking) over the homes they state (floors[].homes), added up over every floor: 3 spaces for 4 homes.',
      '  Set-back from edge 1 (the south boundary): used 5.00 m, your limit at least 3.00 m: met. Measured as the least distance from the building, seen from above, to the edge, as a tape between the two nearest points measures it.',
      // The house the second attempt drew stands 3 m off the slanted east edge, at both its corners.
      '  Set-back from edge 2 (the east boundary): used 3.00 m, your limit at least 3.00 m: met. Measured as the least distance from the building, seen from above, to the edge, as a tape between the two nearest points measures it.',
      '  Set-back from edge 3 (the north boundary): used 3.00 m, your limit at least 3.00 m: met. Measured as the least distance from the building, seen from above, to the edge, as a tape between the two nearest points measures it.',
      '  Set-back from edge 4 (the west boundary): used 3.00 m, your limit at least 3.00 m: met. Measured as the least distance from the building, seen from above, to the edge, as a tape between the two nearest points measures it.',
    ])
    const data = reply.data as { answer: { limits: { limit: string; used: number | null; allowed: number; state: string; rule: string }[] } }
    expect(data.answer.limits.slice(0, 4).map((l) => [l.limit, l.used, l.allowed, l.state])).toEqual([
      ['plot_coverage', 48.015, 40, 'missed'],
      ['floor_area_ratio', 0.96, 1, 'met'],
      ['building_height', 6.5, 9, 'met'],
      ['parking_per_home', 0.75, 1, 'missed'],
    ])
    expect(data.answer.limits[1]!.rule).toContain('Gross external area')
    expect(approvalWords(reply.text)).toEqual([])
  })

  it('names the measure it assumed for a ratio that names none, for the person to confirm', async () => {
    const reply = await call('grid_measure', { what: 'site', plan: 'ratio.json' })
    expect(reply.text).toContain('Floor area ratio: used 0.96, your limit at most 1, assumed for you to confirm: met.')
    expect(reply.text).toContain("Assumed: the ratio names no measure and Grid has none usual for the plan's place, so gross external area is used; ask the person which their figure is set by.")
  })

  it('says a ratio set by gross internal area is not measured on massing, and why', async () => {
    b.write('inside.json', FD1)
    b.write('inside.brief.json', { version: '1', figures: { floor_area_ratio: { value: 1, measure: 'gross_internal', level: 'must', source: 'given', quote: 'one, inside the walls' } } })
    const reply = await call('grid_measure', { what: 'site', plan: 'inside.json' })
    expect(reply.text).toContain('Floor area ratio: not measured, gross internal area is not known on "Ground floor": it is an outline with no walls yet')
  })

  it('gives the same lines with the brief (grid_write_brief), met or missed, never a score', async () => {
    const reply = await call('grid_write_brief', { plan: 'fd1.json' })
    expect(reply.text).toContain('missed (must): Plot coverage: used 48.0%, your limit at most 40%: not met.')
    expect(reply.text).toContain('met (must): Building height: used 6.50 m, your limit at most 9.00 m: met.')
    expect(reply.text).toContain('missed (must): Parking per home: used 0.75 spaces per home')
    expect(approvalWords(reply.text)).toEqual([])
  })

  it('refuses a limit out of range, naming it and what it takes', async () => {
    const reply = await b.call('grid_write_brief', { plan: 'fd1.json', brief: { figures: { plot_coverage: { value: 140, level: 'must', source: 'assumed' } } } })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('figures.plot_coverage.value must be a percentage of the plot above 0 to 100')
  })
})
