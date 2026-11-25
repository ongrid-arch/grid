/**
 * BRF-3 (lab EL-16): the plot, its edges and set-backs, how far the building stands from each
 * edge, and how much of the plot it covers.
 *
 * The house is the lab's G series house (`G/scenarios/s01b-site-fields.json`): outside walls
 * 0.30 m thick on centre lines from (3.15, 10.15) to (11.85, 19.85), so its outside face runs
 * from x 3 to 12 and y 10 to 20, 9 × 10 = 90 m². The plot is 15 × 30 = 450 m², edge 1 along the
 * street to the south. By hand: 3.00 m from the west and east edges, 10.00 m from the south and
 * north; slid 2 m east, 5.00 m from the west and 1.00 m from the east; covering 90 / 450 = 20%.
 */
import { describe, expect, it } from 'vitest'
import { checkPlanSanity, floorElevations, planAreaFigures, plotBoundary, siteMeasures, validatePlan, type FloorPlan } from '../index'
import { toIfc } from '../export/ifc'
import { parseFloorPlan } from '../../types/floorplan'
import { labPlanText } from '../../test-support/lab'

const SITE = {
  boundary: [[0, 0], [15, 0], [15, 30], [0, 30]],
  streets: [1],
  setbacks: [{ from: 'all', distance: 3, source: 'given' }],
}

/** The lab's house in its 15 × 30 m plot, slid `dx` east, with `site` added to the plot's. */
export function houseInPlot(dx = 0, site: Record<string, unknown> = {}): FloorPlan {
  const raw = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as Record<string, unknown>
  const walls = (raw['walls'] as { start: number[]; end: number[] }[]).map((w) => ({ ...w, start: [w.start[0]! + dx, w.start[1]], end: [w.end[0]! + dx, w.end[1]] }))
  return parseFloorPlan({ ...raw, walls, site: { ...SITE, ...site } })
}

/** The same house with no site at all. */
const houseAlone = (): FloorPlan => {
  const raw = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as Record<string, unknown>
  delete raw['site']
  return parseFloorPlan(raw)
}

/** The things the lab drew as walls and rooms (s01g, s05a), written as the site's own. */
const THINGS = [
  { id: 'fence', kind: 'fence', points: [[0, 0], [15, 0], [15, 30], [0, 30], [0, 0]], height: 1.8 },
  { id: 'gate', kind: 'gate', points: [[7.8, 0], [9, 0]] },
  { id: 'path', kind: 'path', points: [[8.4, 0], [8.4, 10]], width: 1.2 },
  { id: 'drive', kind: 'paving', points: [[9, 0], [12, 0], [12, 10], [9, 10]] },
  { id: 'tree1', kind: 'tree', at: [3, 4], canopy: 5, height: 4 },
  { id: 'tree2', kind: 'tree', at: [4, 25], canopy: 4, height: 4 },
  { id: 'tree3', kind: 'tree', at: [11.5, 26.5], height: 4 },
  { id: 'pool', kind: 'pool', points: [[1, 21], [5, 21], [5, 29], [1, 29]] },
]

describe('the plot boundary (BRF-3)', () => {
  it('numbers its edges, names each by the way it faces, and gives each the set-back asked', () => {
    const plot = plotBoundary(houseInPlot(0, { setbacks: [{ from: 'all', distance: 3 }, { from: 'street', distance: 5 }, { from: 3, distance: 6 }] }))!
    expect(plot.area).toBe(450)
    expect(plot.problem).toBeNull()
    expect(plot.edges.map((e) => [e.edge, e.faces, e.street, e.name, e.setback?.distance, e.setback?.from])).toEqual([
      [1, 'south', true, 'the south boundary', 5, 'street'],
      [2, 'east', false, 'the east boundary', 3, 'all'],
      [3, 'north', false, 'the north boundary', 6, 'edge'],
      [4, 'west', false, 'the west boundary', 3, 'all'],
    ])
  })

  it('reads the boundary either way round, and a last point on the first closes it', () => {
    const plot = plotBoundary(houseInPlot(0, { boundary: [[0, 0], [0, 30], [15, 30], [15, 0], [0, 0]], streets: [4] }))!
    expect(plot.edges.map((e) => `${e.edge} ${e.faces}${e.street ? ' street' : ''}`)).toEqual(['1 west', '2 north', '3 east', '4 south street'])
  })

  it('names the way by the plan\'s north, and two edges facing one way by their numbers', () => {
    const turned = plotBoundary({ ...houseInPlot(), north: 90 })!
    // North 90 points to -x: the edge facing -x faces north.
    expect(turned.edges.map((e) => e.faces)).toEqual(['west', 'south', 'east', 'north'])
    expect(turned.northStated).toBe(true)
    const stepped = plotBoundary(houseInPlot(0, { boundary: [[0, 0], [15, 0], [15, 20], [10, 20], [10, 30], [0, 30]], streets: [], setbacks: [] }))!
    expect(stepped.edges.filter((e) => e.faces === 'north').map((e) => e.name)).toEqual(['the north boundary (edge 3)', 'the north boundary (edge 5)'])
  })

  it('says why a boundary that crosses itself measures nothing', () => {
    const plan = houseInPlot(0, { boundary: [[0, 0], [15, 30], [15, 0], [0, 20]], streets: [], setbacks: [] })
    expect(plotBoundary(plan)!.problem).toBe('edges 1 and 3 cross or touch')
    expect(validatePlan(plan).issues.filter((i) => i.code === 'plan/boundary-crosses')).toHaveLength(1)
    const site = siteMeasures(plan)
    expect(site.edges).toEqual([])
    expect(site.coverage).toBeNull()
  })
})

describe('how far the building stands from the boundary (EL-16)', () => {
  it('measures each edge from the outside face, by hand: 3, 10, 3 and 10 m', () => {
    const site = siteMeasures(houseInPlot())
    expect(site.footprint!.area).toBeCloseTo(90, 6)
    expect(site.edges.map((e) => [e.edge.edge, Number(e.distance.toFixed(6)), e.short, e.past])).toEqual([
      [1, 10, null, 0],
      [2, 3, null, 0],
      [3, 10, null, 0],
      [4, 3, null, 0],
    ])
    // Each face of the house, by the way it faces, and the edge in front of it.
    expect(site.faces.map((f) => `${f.faces} ${f.length.toFixed(2)} m: edge ${f.edge} at ${f.distance.toFixed(2)} m`).sort()).toEqual([
      'east 10.00 m: edge 2 at 3.00 m',
      'north 9.00 m: edge 3 at 10.00 m',
      'south 9.00 m: edge 1 at 10.00 m',
      'west 10.00 m: edge 4 at 3.00 m',
    ])
  })

  it('slid 2 m east, the house is 1.00 m from the east boundary where 3.00 m was asked', () => {
    const plan = houseInPlot(2)
    const east = siteMeasures(plan).edges.find((e) => e.edge.faces === 'east')!
    expect(east.distance).toBeCloseTo(1, 9)
    expect(east.short).toBeCloseTo(2, 9)
    const found = checkPlanSanity(plan).findings.filter((f) => f.code === 'setback_short')
    expect(found.map((f) => f.message)).toEqual(['The building is 1.00 m from the east boundary; you asked for 3.00 m'])
    expect(found[0]!.ruleId).toBe('site-boundary')
    expect(found[0]!.boundary).toMatchObject({ edge: 2, faces: 'east', distance: 1, asked: { distance: 3, from: 'all', source: 'given' }, northStated: true })
    // Where it stood, nothing is named.
    expect(checkPlanSanity(houseInPlot()).findings.filter((f) => f.ruleId === 'site-boundary')).toEqual([])
  })

  it('says a set-back assumed for the person is to confirm, and keeps a distance a hair short on its side of the figure', () => {
    const assumed = checkPlanSanity(houseInPlot(2, { setbacks: [{ from: 2, distance: 3, source: 'assumed' }] })).findings.find((f) => f.code === 'setback_short')!
    expect(assumed.message).toBe('The building is 1.00 m from the east boundary; 3.00 m is assumed for you, to confirm')
    const hair = checkPlanSanity(houseInPlot(0.006)).findings.filter((f) => f.code === 'setback_short')
    expect(hair.map((f) => f.message)).toEqual(['The building is 2.99 m from the east boundary; you asked for 3.00 m'])
    expect(checkPlanSanity(houseInPlot(0.004)).findings.filter((f) => f.code === 'setback_short')).toEqual([])
  })

  it('names a house slid over the boundary, by how far it reaches past it', () => {
    const found = checkPlanSanity(houseInPlot(3.5)).findings.filter((f) => f.ruleId === 'site-boundary')
    expect(found.map((f) => [f.code, f.message])).toEqual([['over_boundary', 'The building reaches 0.50 m over the east boundary, out of the plot']])
  })
})

describe('plot coverage, and the site\'s things (BRF-3 done when 2)', () => {
  it('reads 20% for 90 m² on 450 m²', () => {
    const site = siteMeasures(houseInPlot())
    expect(site.covered).toBeCloseTo(90, 6)
    expect(site.coverage).toBeCloseTo(0.2, 9)
  })

  it('the fence, the trees and the pool add 0 walls and 0 m², and leave the roof height alone', () => {
    const alone = houseAlone()
    const sited = houseInPlot(0, { things: THINGS })
    expect(sited.site!.things).toHaveLength(8)
    expect(sited.walls).toHaveLength(alone.walls.length)
    const walls = (plan: FloorPlan): number => (toIfc(plan).match(/IFCWALL(STANDARDCASE)?\(/g) ?? []).length
    expect(walls(sited)).toBe(walls(alone))
    const [a, b] = [planAreaFigures(alone), planAreaFigures(sited)]
    expect(b.net.area).toBe(a.net.area)
    expect(b.grossExternal.area).toBe(a.grossExternal.area)
    expect(b.grossInternal.area).toBe(a.grossInternal.area)
    expect(floorElevations(sited).roof).toEqual(floorElevations(alone).roof)
    expect(siteMeasures(sited).coverage).toBeCloseTo(0.2, 9)
    // No check gives a line about them.
    expect(checkPlanSanity(sited).findings).toEqual(checkPlanSanity(houseInPlot()).findings)
  })

  it('makes the footprint of every floor at or above the ground floor, and leaves a basement out', () => {
    const raw = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as { walls: Record<string, unknown>[]; rooms: Record<string, unknown>[] }
    const basement = {
      ...raw,
      floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'below', name: 'Basement', level: -1 }],
      site: SITE,
      // A basement running 4 m further east, under the ground: it is in no distance.
      walls: [...raw.walls, { id: 'b-s', start: [3.15, 10.15], end: [15.85, 10.15], thickness: 0.3, height: 2.5, kind: 'exterior', floor: 'below' }, { id: 'b-e', start: [15.85, 10.15], end: [15.85, 19.85], thickness: 0.3, height: 2.5, kind: 'exterior', floor: 'below' }, { id: 'b-n', start: [15.85, 19.85], end: [3.15, 19.85], thickness: 0.3, height: 2.5, kind: 'exterior', floor: 'below' }, { id: 'b-w', start: [3.15, 19.85], end: [3.15, 10.15], thickness: 0.3, height: 2.5, kind: 'exterior', floor: 'below' }],
    }
    const site = siteMeasures(parseFloorPlan(basement))
    expect(site.footprint!.floors).toEqual(['ground'])
    expect(site.edges.find((e) => e.edge.faces === 'east')!.distance).toBeCloseTo(3, 9)
  })
})

describe('open outdoor space is no building (ARE-24)', () => {
  // The lab's house, 9 x 10 m outside, with an open terrace on its north side (4.65 x 3.00 = 13.95 m2)
  // and a porch on its south side (2.40 x 1.50 = 3.60 m2), in a 20 x 30 = 600 m2 plot.
  const BOUNDARY = [[-5, -10], [15, -10], [15, 20], [-5, 20]]
  const sited = (marks: Record<string, Record<string, unknown>>): FloorPlan => {
    const raw = JSON.parse(labPlanText('G/scenarios/s02a-terrace-porch.json')) as { rooms: Record<string, unknown>[] } & Record<string, unknown>
    for (const room of raw.rooms) Object.assign(room, marks[room.id as string] ?? {})
    return parseFloorPlan({ ...raw, site: { boundary: BOUNDARY, streets: [1], setbacks: [] } })
  }

  it('measures the coverage and the distances to the enclosed building, and gives the figure with the terrace beside them', () => {
    const site = siteMeasures(sited({ terrace: { outdoor: 'terrace' }, porch: { outdoor: 'porch' } }))
    // The house and its roofed porch: 90 + 3.60 m2. The open terrace is left out.
    expect(site.covered).toBeCloseTo(93.6, 1)
    expect(site.coverage).toBeCloseTo(93.6 / 600, 1)
    expect(site.edges.find((e) => e.edge.faces === 'north')!.distance).toBeCloseTo(10.15, 1)
    expect(site.edges.find((e) => e.edge.faces === 'south')!.distance).toBeCloseTo(8.35, 1)
    // The same with the terrace counted as building.
    expect(site.withOpen!.covered).toBeCloseTo(93.6 + 13.95, 1)
    expect(site.withOpen!.coverage).toBeCloseTo((93.6 + 13.95) / 600, 1)
    expect(site.withOpen!.edges.find((e) => e.edge.faces === 'north')!.distance).toBeCloseTo(7.15, 1)
  })

  it('counts a plan whose outdoor rooms are drawn as rooms as it always did, and has no second figure', () => {
    const drawn = siteMeasures(sited({}))
    expect(drawn.withOpen).toBeNull()
    expect(drawn.covered).toBeCloseTo(90 + 13.95 + 3.6, 1)
    expect(siteMeasures(houseInPlot()).withOpen).toBeNull()
  })

  it('counts an open outdoor room marked roofed as building', () => {
    const site = siteMeasures(sited({ terrace: { outdoor: 'terrace', roofed: true }, porch: { outdoor: 'porch' } }))
    expect(site.covered).toBeCloseTo(90 + 13.95 + 3.6, 1)
    expect(site.withOpen).toBeNull()
  })
})
