/**
 * CNT-26: the take-off lists a garden or boundary wall on a run of its own, `garden`, and not
 * under the kind it states. The house is the lab's G series house alone: 36.80 m of outside wall on
 * centre lines (two of 8.70 m, two of 9.70 m). Round its 15 × 30 m plot, 90 m of boundary wall
 * stated `exterior`; in the garden a 6 m wall standing apart, also stated `exterior`.
 */
import { describe, expect, it } from 'vitest'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'

type Raw = Record<string, unknown> & { walls: Record<string, unknown>[] }

const house = (): Raw => JSON.parse(labPlanText('G/scenarios/s01a-house-alone.json')) as Raw
const wall = (id: string, start: [number, number], end: [number, number]): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 1.8, kind: 'exterior' })

describe('garden and boundary walls in the take-off (CNT-26)', () => {
  it('takes them off apart, and the outside walls as the house\'s alone', () => {
    const alone = planTakeoff(surveyPlan(parseFloorPlan(house())))
    const raw = house()
    raw.walls.push(
      wall('plot-s', [0, 0], [15, 0]),
      wall('plot-e', [15, 0], [15, 30]),
      wall('plot-n', [15, 30], [0, 30]),
      wall('plot-w', [0, 30], [0, 0]),
      wall('garden-apart', [2, 25], [8, 25]),
    )
    const plot = planTakeoff(surveyPlan(parseFloorPlan(raw)))
    const run = (takeoff: typeof plot, kind: string) => takeoff.walls.find((w) => w.kind === kind)
    expect(run(alone, 'garden')).toBeUndefined()
    expect(run(plot, 'exterior')).toEqual(run(alone, 'exterior'))
    expect(run(alone, 'exterior')!.gross).toBeCloseTo(36.8, 6)
    expect(run(plot, 'garden')).toEqual({ kind: 'garden', count: 5, gross: 96, net: 96 })
    // The slab and roof are the house's.
    expect(plot.envelope.slabs).toBeCloseTo(alone.envelope.slabs!, 6)
    expect(plot.envelope.roof).toBeCloseTo(alone.envelope.roof!, 6)
  })
})
