/**
 * ARE-36: a way in through an outdoor space that reaches the street is the entrance, for the walk
 * and for the access measures, and a front the plan names is honoured there.
 *
 * The plan is the lab's flat with a porch and a terrace (`s02a`): the front door d-front opens from
 * the hall into the porch, the back door d-back from the kitchen onto the terrace; a wide service
 * door d-service is added straight from the kitchen to the street.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { surveyPlan } from '../../quantities/survey'
import { entranceOf } from '../../quantities/access'
import { planWalk } from '../walk'

function plan(options: { outdoor: boolean; front?: string; service?: boolean }) {
  const raw = JSON.parse(labPlanText('G/scenarios/s02a-terrace-porch.json')) as { rooms: Record<string, unknown>[]; openings: Record<string, unknown>[] } & Record<string, unknown>
  for (const room of raw.rooms) {
    if (room.id === 'terrace') room.outdoor = options.outdoor ? 'terrace' : undefined
    if (room.id === 'porch') room.outdoor = options.outdoor ? 'porch' : undefined
  }
  if (options.service === true) raw.openings.push({ id: 'd-service', wall: 'ext-w', type: 'door', offset: 1, width: 1.4, sill: 0, height: 2.1, hinge: 'start', swing: 'left' })
  if (options.front !== undefined) raw.front = { opening: options.front }
  return surveyPlan(parseFloorPlan(raw))
}

const first = (s: ReturnType<typeof plan>) => planWalk(s).floors[0]!

describe('the entrance through an outdoor space (ARE-36)', () => {
  it('the walk starts at the door onto the street side, not at the wide service door', () => {
    const s = plan({ outdoor: true, service: true })
    const walk = first(s)
    expect(walk.start).toBe('way in')
    expect(walk.stops[0]!.via).toBe('d-front')
    expect(entranceOf(s)!.doors.sort()).toEqual(['d-back', 'd-front'])
  })

  it('a front the plan names through the terrace is honoured', () => {
    const s = plan({ outdoor: true, service: true, front: 'd-back' })
    const walk = first(s)
    expect(walk.start).toBe('front')
    expect(walk.stops[0]!.via).toBe('d-back')
    expect(entranceOf(s)).toMatchObject({ doors: ['d-back'], front: true })
  })

  it('with no outdoor space the service door is the way in, as before', () => {
    const s = plan({ outdoor: false, service: true })
    expect(first(s).stops[0]!.via).toBe('d-service')
    expect(entranceOf(s)!.doors).toEqual(['d-service'])
  })
})
