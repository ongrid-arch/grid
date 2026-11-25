/**
 * CNT-19 (lab EL-11): the parking bays and the ramps in the take-off and the description, and on
 * the sheet's list of what it does with each part of a plan.
 */
import { describe, expect, it } from 'vitest'
import { basementCarPark } from '@ongrid/floorplan/test-support/parking'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'
import { planFacts } from '../../describe/facts'
import { describeText } from '../../describe/card'
import { SHEET_COVERAGE } from '../../sheet/coverage'

describe('parking bays and ramps in the quantities and the description', () => {
  it('counts the basement\'s 16 bays by number and returns the ramp\'s slope as a number (EL-11)', () => {
    const t = planTakeoff(surveyPlan(basementCarPark()))
    expect(t.bays).toEqual([{ floor: 'B1', floorName: 'Basement car park', count: 16, numbers: Array.from({ length: 16 }, (_, i) => String(i + 1)), unnumbered: 0 }])
    expect(t.ramps).toEqual([
      {
        id: 'ramp',
        name: 'Car ramp',
        from: 'B1',
        to: 'ground',
        lower: { floor: 'B1', level: -3 },
        upper: { floor: 'ground', level: 0 },
        width: 3.2,
        rise: expect.closeTo(3, 9),
        length: expect.closeTo(18, 9),
        slope: expect.closeTo(100 / 6, 9),
        oneIn: expect.closeTo(6, 9),
        statedSlope: 16.7,
      },
    ])
    expect(t.rules.at(-1)).toMatch(/^A parking bay is counted on its own floor/)
  })

  it('counts only the floors asked for, and leaves the take-off as it was on a plan with none', () => {
    const plan = basementCarPark()
    const ground = planTakeoff(surveyPlan(plan), ['ground'])
    expect('bays' in ground).toBe(false)
    expect(ground.ramps).toHaveLength(1)
    const none = planTakeoff(surveyPlan(basementCarPark({ bays: undefined, ramps: undefined })))
    expect('bays' in none).toBe(false)
    expect('ramps' in none).toBe(false)
    expect(none.rules.some((rule) => rule.includes('parking'))).toBe(false)
  })

  it('says each floor\'s bays and ramps, for a person and for an agent', () => {
    const facts = planFacts(basementCarPark())
    const person = describeText(facts, 'rooms', 'person')
    expect(person).toContain('  Parking bays (16): 1 to 16.')
    expect(person).toContain('  Ramp Car ramp, up from Basement car park to Ground floor: 3 m over 18 m, a slope of 16.7 %.')
    const agent = describeText(facts, 'rooms', 'agent')
    expect(agent).toContain('BAYS 16 numbers 1-16')
    expect(agent).toContain('RAMP ramp B1->ground rise 3 length 18 slope 16.7%')
  })

  it('is placed on the sheet: the bays and the ramps drawn', () => {
    expect(SHEET_COVERAGE.bays).toEqual({ shown: 'drawn' })
    expect(SHEET_COVERAGE.ramps).toEqual({ shown: 'drawn' })
  })
})

describe('the take-off\'s ramp lines', () => {
  it('writes each unit once and names a floor with no bays by name', async () => {
    const { bench } = await import('../../mcp/__tests__/replay/harness')
    const b = bench({ 'car.json': basementCarPark() })
    try {
      const reply = await b.call('grid_takeoff', { plan: 'car.json' })
      const line = reply.text.split('\n').find((l) => l.startsWith('Ramp '))
      expect(line).toBeDefined()
      expect(line).not.toMatch(/ m m\b/)
      expect(line).toContain('from "Basement car park" at -3.00 m to "Ground floor" at 0.00 m, 3.00 m up over 18.00 m')
    } finally {
      b.close()
    }
  })
})
