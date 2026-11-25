/**
 * ARE-21: a route to outside walks to every way out and takes the nearest, not the first met.
 *
 * The two-bed flat has one front door, off the Hall. Here the Kitchen gets a back door in the
 * west wall too, with an id that sorts after the front door's. From the Living room both ways
 * are two rooms away, but the back door is far nearer.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const FLAT = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')) as { openings: unknown[] }
const TWO_EXITS = {
  ...FLAT,
  openings: [...FLAT.openings, { id: 'z-back', wall: 'ext-west', type: 'door', offset: 2.4, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }],
}

describe('a route to outside takes the nearest way out (ARE-21)', () => {
  it('the nearer back door, not the front door', () => {
    const survey = surveyPlan(parseFloorPlan(TWO_EXITS))
    const route = routeBetween(survey, 'living', 'outside')!
    expect(route.exit).toBe('z-back')
    expect(route.steps.at(-1)!.via).toBe('z-back')
    expect(route.otherExits!.map((e) => e.via)).toEqual(['door-entrance'])
    expect(route.otherExits![0]!.length!).toBeGreaterThan(route.length!)
  })

  it('from the Hall it is the front door, the way it always was', () => {
    const survey = surveyPlan(parseFloorPlan(TWO_EXITS))
    const route = routeBetween(survey, 'hall', 'outside')!
    expect(route.exit).toBe('door-entrance')
    expect(route.otherExits!.map((e) => e.via)).toEqual(['z-back'])
  })

  it('a plan with one way out names it and lists no others; a route between rooms names none', () => {
    const survey = surveyPlan(parseFloorPlan(FLAT))
    const out = routeBetween(survey, 'bed1', 'outside')!
    expect(out.exit).toBe('door-entrance')
    expect(out.otherExits).toEqual([])
    expect(routeBetween(survey, 'bed1', 'hall')!.exit).toBeUndefined()
  })

  describe('through grid_measure', () => {
    let b: Bench
    afterEach(() => b?.close())
    it('says which way out it chose and lists the others', async () => {
      b = bench({ 'flat.json': TWO_EXITS })
      const reply = await b.call('grid_measure', { plan: 'flat.json', what: 'route', room: 'living', to: 'outside' })
      expect(reply.isError).toBe(false)
      expect(reply.text).toContain('Nearest way out: door "z-back"')
      expect(reply.text).toContain('door "door-entrance"')
      const answer = reply.data!['answer'] as { exit: string; otherExits: Array<{ via: string }> }
      expect(answer.exit).toBe('z-back')
      expect(answer.otherExits.map((e) => e.via)).toEqual(['door-entrance'])
    })
  })
})
