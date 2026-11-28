/**
 * ARE-78: a route between rooms on different floors goes up and down the stairs the way-out check
 * reads (a stair the plan states, stair rooms one over the other), by a lift shaft only when no
 * stair joins them, and with several stairs takes the one that makes the walk shortest.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { edit, stairHouse, stairRoomHouse } from '@ongrid/floorplan/test-support/plans'
import { routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/** The stair house with a second stair, from the kitchen straight up into the study. */
const twoStairs = () =>
  edit(stairHouse(), (copy) => {
    copy.stairs = [...(copy.stairs ?? []), { id: 's2', name: 'Back stair', from: 'ground', to: 'first', width: 0.9, run: [[9, 0.6], [9, 3.4]] }]
  })

describe('a route between rooms on different floors (ARE-78)', () => {
  it('from the study upstairs to the bedroom below, by the stated stair, walked', () => {
    const route = routeBetween(surveyPlan(stairHouse()), 'study', 'bedroom')!
    expect(route).not.toBeNull()
    expect(route.steps.map((s) => [s.type, s.via, s.into])).toEqual([
      ['door', 'd_up', 'landing'],
      ['stair', 's1', 'hall'],
      ['door', 'd_hb', 'bedroom'],
    ])
    expect(route.floors).toEqual(['first', 'first', 'ground', 'ground'])
    expect(route.onStairs).toBeCloseTo(2.8, 6)
    expect(route.length).not.toBeNull()
    expect(route.length!).toBeGreaterThan(route.onStairs!)
    expect(route.gap).toBeNull()
  })

  it('up as well as down: the bedroom to the study is the same way back', () => {
    const survey = surveyPlan(stairHouse())
    const down = routeBetween(survey, 'study', 'bedroom')!
    const up = routeBetween(survey, 'bedroom', 'study')!
    expect(up.rooms).toEqual([...down.rooms].reverse())
    expect(up.length!).toBeCloseTo(down.length!, 6)
  })

  it('down two floors of stair rooms one over the other, from the middle of each', () => {
    const route = routeBetween(surveyPlan(stairRoomHouse()), 'second-main', 'ground-main')!
    expect(route.rooms).toEqual(['second-main', 'second-stair', 'first-stair', 'ground-stair', 'ground-main'])
    expect(route.steps.filter((s) => s.type === 'stair').length).toBe(2)
    expect(route.onStairs).toBe(0)
    expect(route.length).not.toBeNull()
  })

  it('by a lift shaft when no stair joins the floors, each step said as a lift', () => {
    const route = routeBetween(surveyPlan(stairRoomHouse({ use: 'lift' })), 'second-main', 'ground-main')!
    expect(route).not.toBeNull()
    expect(route.steps.filter((s) => s.type === 'lift').map((s) => s.via)).toEqual(['first-stair|second-stair', 'ground-stair|first-stair'])
    expect(route.steps.some((s) => s.type === 'stair')).toBe(false)
    expect(route.length).not.toBeNull()
  })

  it('a lift is never a way out: the route to outside from the top floor of a lift-only house finds none', () => {
    expect(routeBetween(surveyPlan(stairRoomHouse({ use: 'lift' })), 'second-main', 'outside')).toBeNull()
  })

  it('with two stairs, the one that makes the walk shortest, the other listed with its length', () => {
    const survey = surveyPlan(twoStairs())
    const route = routeBetween(survey, 'study', 'kitchen')!
    expect(route.steps.find((s) => s.type === 'stair')!.via).toBe('s2')
    expect(route.otherWays!.map((w) => w.via)).toEqual(['s1'])
    expect(route.otherWays![0]!.length!).toBeGreaterThan(route.length!)
    // From the landing the front stair is nearer.
    const fromLanding = routeBetween(survey, 'landing', 'hall')!
    expect(fromLanding.steps.find((s) => s.type === 'stair')!.via).toBe('s1')
    expect(fromLanding.otherWays!.map((w) => w.via)).toEqual(['s2'])
  })

  it('a route on one floor keeps to it and lists no other ways; the way out is unchanged', () => {
    const survey = surveyPlan(twoStairs())
    const same = routeBetween(survey, 'study', 'landing')!
    expect(new Set(same.floors)).toEqual(new Set(['first']))
    expect(same.otherWays).toBeUndefined()
    const out = routeBetween(survey, 'study', 'outside')!
    expect(out.exit).toBe('front')
    expect(out.otherWays).toBeUndefined()
  })

  describe('through grid_measure', () => {
    let b: Bench
    afterEach(() => b?.close())

    it('answers a route to a room on another floor, where it used to refuse', async () => {
      b = bench({ 'house.json': twoStairs() })
      const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'study', to: 'kitchen' })
      expect(reply.isError).toBe(false)
      expect(reply.text).toContain('stair "s2"')
      expect(reply.text).toContain('along the stairs')
      expect(reply.text).toContain('Other ways between the floors: stair "s1"')
      const answer = reply.data!['answer'] as { found: boolean; floors: string[]; length: number; otherWays: Array<{ via: string }> }
      expect(answer.found).toBe(true)
      expect(answer.floors[0]).toBe('first')
      expect(answer.floors.at(-1)).toBe('ground')
      expect(answer.length).toBeGreaterThan(0)
      expect(answer.otherWays.map((w) => w.via)).toEqual(['s1'])
    })

    it('says when the way goes by a lift', async () => {
      b = bench({ 'lift.json': stairRoomHouse({ use: 'lift' }) })
      const reply = await b.call('grid_measure', { plan: 'lift.json', what: 'route', room: 'second-main', to: 'ground-main' })
      expect(reply.isError).toBe(false)
      expect(reply.text).toContain('lift "')
      expect(reply.text).toContain('No stair joins these floors')
    })
  })
})
