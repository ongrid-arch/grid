/**
 * ARE-25: a corridor's narrowest point from end to end, true to the walls and quickly.
 *
 * - A straight corridor whose faces stand 1.80 m apart measures 1.80 m, its widest circle too, and
 *   is not set under a 1.80 m figure of the person's own.
 * - An L and a corridor that widens at a jog measure their narrowest real width.
 * - A curved corridor measures across its curve, not between two of its straight pieces.
 * - A recess in a side neither narrows nor widens the figure.
 * - The grid is set by the corridor's width, so a 60 m corridor is measured on a few thousand
 *   points.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { corridorEnds, corridorNarrowestOf, type AccessData } from '../access'
import { surveyPlan } from '../survey'
import { fixturesOf } from '../use'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })

/** A plan of one corridor bounded by the walls given, in order. */
const corridorPlan = (walls: Record<string, unknown>[]): FloorPlan =>
  parseFloorPlan({ version: '1', units: 'm', walls, rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: walls.map((w) => w.id) }], openings: [] })

/** A closed run of straight walls through the points, each wall's centre line from one to the next. */
const ring = (points: Tuple[]): Record<string, unknown>[] => points.map((p, i) => wall(`w${i}`, p, points[(i + 1) % points.length]!))

const ROOMS = `walls outside 0.3 inside 0.1 height 2.6
room living "Living" living 4.4 x 4.2
room hall "Hall" corridor 1.8 x 12 east of living
door d1 between hall and living, 0.5 from south, 0.9 wide`

function hallOf(plan: FloorPlan) {
  const survey = surveyPlan(plan)
  const room = survey.rooms.find((r) => r.facts.id === 'hall')!
  return { survey, room, found: corridorNarrowestOf(survey, room) }
}

const written = (text: string): FloorPlan => {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return result.plan as unknown as FloorPlan
}

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

describe('a corridor measured true to its walls (ARE-25)', () => {
  it('measures a straight 1.80 m corridor 1.80 m, the same as its widest circle', () => {
    const { found } = hallOf(written(ROOMS))
    expect(found.narrowest).toBeCloseTo(1.8, 6)
    expect(found.widest).toBeCloseTo(1.8, 6)
  })

  it('does not set a 1.80 m corridor under the person\'s own 1.80 m figure', async () => {
    b = bench({ 'probe.json': written(ROOMS) as unknown as Record<string, unknown> })
    const brief = { figures: { corridor_width: { value: 1.8, level: 'must', source: 'given', quote: 'corridors 1.8 m' } } }
    const wrote = await b.call('grid_write_brief', { plan: 'probe.json', brief })
    expect(wrote.isError, wrote.text).toBe(false)
    const reply = await b.call('grid_measure', { plan: 'probe.json', what: 'access' })
    expect(reply.isError, reply.text).toBe(false)
    const hall = (reply.data as { answer: AccessData }).answer.corridors.find((c) => c.room === 'hall')!
    expect(hall.narrowest).toBeCloseTo(1.8, 6)
    expect(hall.against.map((a) => a.short)).toEqual([false])
  })

  it('measures an L-shaped corridor at its narrowest real width', () => {
    // 2.0 m between centre lines, so 1.80 m between faces, round a corner.
    const { found } = hallOf(corridorPlan(ring([[0, 0], [10, 0], [10, 8], [8, 8], [8, 2], [0, 2]])))
    expect(found.narrowest).toBeCloseTo(1.8, 6)
  })

  it('measures a corridor that widens at a jog at its narrow part', () => {
    const { found } = hallOf(corridorPlan(ring([[0, 0], [20, 0], [20, 2.9], [10, 2.9], [10, 2], [0, 2]])))
    expect(found.narrowest).toBeCloseTo(1.8, 6)
  })

  it('measures a corridor with a recess in its side at the corridor\'s width, past the recess', () => {
    // A 1.80 m corridor 3 m long with a recess 0.7 m wide and 0.3 m deep in its north side, near its east end.
    const { found } = hallOf(corridorPlan(ring([[0, 0], [3, 0], [3, 2], [2.8, 2], [2.8, 2.4], [1.9, 2.4], [1.9, 2], [0, 2]])))
    expect(found.narrowest).toBeCloseTo(1.8, 6)
  })

  it('measures a curved corridor across its curve, from the inner wall to the outer', () => {
    // A quarter ring: faces at radii 3.0 m and 4.8 m, so 1.80 m across.
    const plan = corridorPlan([
      wall('inner', [2.9, 0], [0, 2.9], { arc: { centre: [0, 0], sweep: 90 } }),
      wall('north', [0, 2.9], [0, 4.9]),
      wall('outer', [0, 4.9], [4.9, 0], { arc: { centre: [0, 0], sweep: -90 } }),
      wall('south', [4.9, 0], [2.9, 0]),
    ])
    const { found } = hallOf(plan)
    expect(found.narrowest).not.toBeNull()
    // The curve is drawn in straight pieces no more than 1 mm off it.
    expect(Math.abs(found.narrowest! - 1.8)).toBeLessThan(0.003)
    expect(found.narrowest!).toBeLessThanOrEqual(found.widest)
  })

  it('measures a 60 m corridor on a grid set by its width, in well under a second', () => {
    const plan = written(`walls outside 0.3 inside 0.1 height 2.6
room hall "Hall" corridor 1.8 x 60
room a "A" office 10 x 60 east of hall`)
    const survey = surveyPlan(plan)
    const room = survey.rooms.find((r) => r.facts.id === 'hall')!
    const started = performance.now()
    const { way } = corridorEnds(room, fixturesOf(survey).obstacles(room.facts.floor))
    const took = performance.now() - started
    expect(way!.width).toBeCloseTo(1.8, 6)
    // 24 steps across 1.80 m: some 19 000 points, where a quarter of a million were taken before.
    expect(way!.step).toBeCloseTo(0.075, 6)
    expect(took).toBeLessThan(1000)
  })
})
