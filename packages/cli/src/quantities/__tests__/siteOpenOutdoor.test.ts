/**
 * ARE-24: the answer about the plot leaves open outdoor space out of the building, gives the other
 * figure beside it and says which is which.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { METRES } from '@ongrid/floorplan/types/units'
import { siteAnswer } from '../site'

const plan = (marks: Record<string, Record<string, unknown>>) => {
  const raw = JSON.parse(labPlanText('G/scenarios/s02a-terrace-porch.json')) as { rooms: Record<string, unknown>[] } & Record<string, unknown>
  for (const room of raw.rooms) Object.assign(room, marks[room.id as string] ?? {})
  return parseFloorPlan({ ...raw, site: { boundary: [[-5, -10], [15, -10], [15, 20], [-5, 20]], streets: [1], setbacks: [] } })
}

describe('plot coverage and open outdoor space (ARE-24)', () => {
  it('gives the coverage of the enclosed building and the one with the terrace, and each edge to both', () => {
    const answer = siteAnswer(plan({ terrace: { outdoor: 'terrace' }, porch: { outdoor: 'porch' } }), METRES)
    const data = answer.data as { coverage: { covered: number; openOutdoorLeftOut: boolean }; coverageWithOpenOutdoor: { covered: number }; boundary: { edges: { faces: string; distance: number; distanceWithOpenOutdoor: number }[] } }
    expect(data.coverage.covered).toBeCloseTo(93.6, 1)
    expect(data.coverage.openOutdoorLeftOut).toBe(true)
    expect(data.coverageWithOpenOutdoor.covered).toBeCloseTo(107.55, 1)
    const north = data.boundary.edges.find((e) => e.faces === 'north')!
    expect(north.distance).toBeCloseTo(10.15, 2)
    expect(north.distanceWithOpenOutdoor).toBeCloseTo(7.15, 2)
    const text = answer.lines.join('\n')
    expect(text).toContain('With the open outdoor space counted as building')
    expect(text).toContain('(the enclosed building)')
    expect(text).toContain('to the open outdoor space')
  })

  it('answers a plan with no open outdoor space as before', () => {
    const answer = siteAnswer(plan({}), METRES)
    expect(answer.lines.join('\n')).not.toContain('open outdoor')
    expect((answer.data as { coverageWithOpenOutdoor: unknown }).coverageWithOpenOutdoor).toBeNull()
  })
})
