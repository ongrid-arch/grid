/**
 * BRF-3 (lab EL-16): grid_measure what=site. The lab's G series house in a 15 × 30 m plot, with
 * 3 m asked from every edge. Its outside face runs from x 3 to 12 and y 10 to 20: 90 m² on 450 m²,
 * 20%, and 3.00, 10.00, 3.00 and 10.00 m from the edges by hand; slid 2 m east, 1.00 m from the
 * east edge. The site's things are drawn only: they change no figure here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { bench, type Bench, type Reply } from './replay/harness'

const house = (dx: number, site: Record<string, unknown> = {}): Record<string, unknown> => {
  const raw = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as Record<string, unknown>
  const walls = (raw['walls'] as { start: number[]; end: number[] }[]).map((w) => ({ ...w, start: [w.start[0]! + dx, w.start[1]], end: [w.end[0]! + dx, w.end[1]] }))
  return { ...raw, walls, site: { boundary: [[0, 0], [15, 0], [15, 30], [0, 30]], streets: [1], setbacks: [{ from: 'all', distance: 3, source: 'given' }], ...site } }
}
const THINGS = [
  { id: 'fence', kind: 'fence', points: [[0, 0], [15, 0], [15, 30], [0, 30], [0, 0]], height: 1.8 },
  { id: 'tree1', kind: 'tree', at: [3, 4], canopy: 5, height: 4 },
  { id: 'tree2', kind: 'tree', at: [4, 25], height: 4 },
  { id: 'tree3', kind: 'tree', at: [11.5, 26.5], height: 4 },
  { id: 'pool', kind: 'pool', points: [[1, 21], [5, 21], [5, 29], [1, 29]] },
]

let b: Bench
beforeAll(() => {
  b = bench({ 'at.json': house(0), 'slid.json': house(2), 'things.json': house(0, { things: THINGS }), 'none.json': { ...house(0), site: {} } })
})
afterAll(() => b.close())

async function site(plan: string, args: Record<string, unknown> = {}): Promise<Reply> {
  const reply = await b.call('grid_measure', { what: 'site', plan, ...args })
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('the plot (grid_measure what=site)', () => {
  it('reports the house slid to 1 m from the east boundary where 3 m was asked (EL-16)', async () => {
    const reply = await site('slid.json')
    expect(reply.text).toContain('1.00 m from the east boundary; you asked for 3.00 m')
    const lines = reply.text.split('\n')
    expect(lines[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(lines.slice(1, 12)).toEqual([
      'North, as the plan states it: up the drawing (+y) (north 0).',
      'The plot: 450.00 m² inside a boundary of 4 edges; on the street: edge 1 (the south boundary).',
      "Plot coverage: 20%, the building's 90.00 m² on the 450.00 m² plot.",
      // CNT-41: what the coverage counts, said on every plot.
      'The coverage counts the enclosed building; a roofed porch or carport would count with it, and a deck or terrace open to the sky would not. The plan has neither.',
      "The person's own figures: theirs, not from any code or standard.",
      'From each edge of the boundary, the least distance to the building:',
      '  Edge 1, on the street: 10.00 m from the south boundary; you asked for 3.00 m.',
      '  Edge 2: 1.00 m from the east boundary; you asked for 3.00 m: 2.00 m short.',
      '  Edge 3: 10.00 m from the north boundary; you asked for 3.00 m.',
      '  Edge 4: 5.00 m from the west boundary; you asked for 3.00 m.',
      'From each face of the building, square to it, to the edge of the boundary in front of it:',
    ])
    expect(lines.filter((l) => /^ {2}The \w+ face/.test(l)).sort()).toEqual([
      '  The east face, 10.00 m long: 1.00 m to the east boundary.',
      '  The north face, 9.00 m long: 10.00 m to the north boundary.',
      '  The south face, 9.00 m long: 10.00 m to the south boundary.',
      '  The west face, 10.00 m long: 5.00 m to the west boundary.',
    ])
    const answer = reply.data!['answer'] as { boundary: { edges: { edge: number; distance: number; short: number | null; setback: unknown }[] }; coverage: unknown }
    expect(answer.boundary.edges[1]).toMatchObject({ edge: 2, distance: 1, short: 2, setback: { distance: 3, from: 'all', source: 'given' } })
    expect(answer.coverage).toEqual({ ratio: 0.2, percent: '20%', covered: 90, plot: 450 })
    for (const line of lines) expect(approvalWords(line), line).toEqual([])
  })

  it('reads 20% for 90 m² on 450 m², with the fence, trees and pool drawn only', async () => {
    const at = await site('at.json')
    const things = await site('things.json')
    expect(at.text).toContain("Plot coverage: 20%, the building's 90.00 m² on the 450.00 m² plot.")
    expect(things.text.split('\n').filter((l) => !l.startsWith("The site's things"))).toEqual(at.text.split('\n'))
    expect(things.text).toContain("The site's things, drawn only and never measured: 1 fence, 3 trees and 1 pool.")
    // CMD-41: each file has its own revision; the areas are what must match.
    const areas = async (plan: string): Promise<Record<string, unknown>> => {
      const data = { ...(await b.call('grid_areas', { plan })).data! }
      delete data['planRevision']
      return data
    }
    expect(await areas('things.json')).toEqual(await areas('at.json'))
  })

  it('says when the site states no boundary, and refuses an argument site does not take', async () => {
    expect((await site('none.json')).text).toContain('The site states no boundary, so no distance to it and no plot coverage are measured')
    const stray = await b.call('grid_measure', { what: 'site', plan: 'at.json', room: 'living' })
    expect(stray.isError).toBe(true)
    expect(stray.text).toBe('what=site takes no other argument, not room.')
  })

  it('answers in the units asked', async () => {
    expect((await site('slid.json', { units: 'cm' })).text).toContain('Edge 2: 100.0 cm from the east boundary; you asked for 300.0 cm: 200.0 cm short.')
  })
})
