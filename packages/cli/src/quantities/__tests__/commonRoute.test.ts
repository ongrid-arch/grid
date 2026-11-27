/**
 * ARE-70: a route to outside from a flat drawn on its own up in a building ends at its front door
 * onto the common landing, as the way-out check reads it, and says that the way on from there is
 * not followed. A door to the open air at the ground is still taken first.
 *
 * The two-bed flat has one front door, off the Hall, in its north wall.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { COMMON_PARTS, routeBetween } from '../measure'
import { surveyPlan } from '../survey'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Plan = { walls: Array<{ id: string; kind?: string; beyond?: string }>; openings: unknown[]; floors?: unknown[] }
const FLAT = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')) as Plan
const THIRD = [{ id: 'ground', name: 'Third floor', level: 3, elevation: 9 }]
const marked = (plan: Plan, change: Partial<Plan['walls'][number]>): Plan => ({ ...plan, walls: plan.walls.map((w) => (w.id === 'ext-north' ? { ...w, ...change } : w)) })
const UP_HIGH = { ...marked(FLAT, { kind: 'separating' }), floors: THIRD }
const UNMARKED = { ...FLAT, floors: THIRD }

describe('a way out onto the common parts (ARE-70)', () => {
  it('ends at the front door in a separating wall, on the common parts, walked', () => {
    const route = routeBetween(surveyPlan(parseFloorPlan(UP_HIGH)), 'bed1', 'outside')!
    expect(route).not.toBeNull()
    expect(route.onto).toBe(COMMON_PARTS)
    expect(route.exit).toBe('door-entrance')
    expect(route.steps.at(-1)).toMatchObject({ via: 'door-entrance', into: COMMON_PARTS })
    expect(route.length).not.toBeNull()
  })

  it('does the same for a wall that states the common parts beyond it', () => {
    const plan = { ...marked(FLAT, { kind: 'interior', beyond: 'common' }), floors: THIRD }
    const route = routeBetween(surveyPlan(parseFloorPlan(plan)), 'living', 'outside')!
    expect(route.onto).toBe(COMMON_PARTS)
    expect(route.exit).toBe('door-entrance')
  })

  it('takes a door to the open air at the ground before the front door onto the landing', () => {
    const plan = {
      ...marked(FLAT, { kind: 'separating' }),
      openings: [...FLAT.openings, { id: 'z-back', wall: 'ext-west', type: 'door', offset: 2.4, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }],
    }
    const route = routeBetween(surveyPlan(parseFloorPlan(plan)), 'hall', 'outside')!
    expect(route.exit).toBe('z-back')
    expect(route.onto).toBeUndefined()
    expect(route.steps.at(-1)!.into).toBe('outside')
  })

  it('finds no way out up high through a door nothing marks', () => {
    expect(routeBetween(surveyPlan(parseFloorPlan(UNMARKED)), 'bed1', 'outside')).toBeNull()
  })

  describe('through grid_measure', () => {
    let b: Bench
    afterEach(() => b?.close())

    it('says the way ends on the common parts and sets a body against it', async () => {
      b = bench({ 'flat.json': UP_HIGH })
      const reply = await b.call('grid_measure', { plan: 'flat.json', what: 'route', room: 'bed1', to: 'outside' })
      expect(reply.isError).toBe(false)
      expect(reply.text).toContain('door "door-entrance" 0.90 m into the building\'s common parts')
      expect(reply.text).toContain('Nearest way out: door "door-entrance"')
      expect(reply.text).toContain('This way out ends on the building\'s common parts, which the plan does not draw')
      expect(reply.text).not.toContain('does not follow this way out')
      expect(reply.text).toMatch(/Indicator, .*: from "Bedroom 1" to outside for a body or trolley 0\.90 m wide/)
      const answer = reply.data!['answer'] as { found: boolean; onto: string; exit: string; through: boolean | null }
      expect(answer).toMatchObject({ found: true, onto: COMMON_PARTS, exit: 'door-entrance' })
      expect(answer.through).not.toBeNull()
    })

    it('says how to mark a front door it reads as a door out 9 m above the ground', async () => {
      b = bench({ 'flat.json': UNMARKED })
      const reply = await b.call('grid_measure', { plan: 'flat.json', what: 'route', room: 'bed1', to: 'outside' })
      expect(reply.isError).toBe(false)
      expect(reply.text).toContain('There is no way from')
      expect(reply.text).toContain('The door "door-entrance" from "Hall" leads outside 9.00 m above the ground, so it is not taken as a way out.')
      expect(reply.text).toContain('mark its wall "ext-north" separating')
      expect(reply.text).toContain('grid_set')
    })
  })
})
