/**
 * SHT-25: the envelope, a facade and a section of a frozen plan are worked out once and kept with
 * it, as a sheet asks for each again and again; of a plan that may still change, never; and not
 * while the tolerance table is changed for a call.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { floorElevations } from '../elevations'
import { planEnvelope } from '../envelope'
import { planFacade } from '../facade'
import { deepFreeze } from '../kept'
import { planSection, type SectionLine } from '../section'
import { withTolerances } from '../tolerances'

const house = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/rooms/two-storey.plan.json'), 'utf8')))
const line: SectionLine = { from: { x: -2, y: 3 }, to: { x: 20, y: 3 }, toward: 'left' }

describe('the drawings of a frozen plan (SHT-25)', () => {
  const plan = deepFreeze(house())

  it('keep the envelope, asked for alone or with the levels the plan has', () => {
    const first = planEnvelope(plan)
    expect(planEnvelope(plan)).toBe(first)
    const levelled = planEnvelope(plan, { elevations: floorElevations(plan) })
    expect(planEnvelope(plan, { elevations: floorElevations(plan) })).toBe(levelled)
    expect(levelled).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('keep the envelope of some floors apart from the whole', () => {
    const floor = plan.floors![0]!.id
    const some = planEnvelope(plan, { floors: [floor] })
    expect(some).not.toBe(planEnvelope(plan))
    expect(some.floors.map((f) => f.floor)).toEqual([floor])
  })

  it('keep each facade by its side and each section by its line', () => {
    expect(planFacade(plan, 'south')).toBe(planFacade(plan, 'south'))
    expect(planFacade(plan, 'north')).not.toBe(planFacade(plan, 'south'))
    expect(planSection(plan, line)).toBe(planSection(plan, { ...line, from: { ...line.from } }))
    expect(planSection(plan, { ...line, toward: 'right' })).not.toBe(planSection(plan, line))
  })

  it('give what a plan that may still change gives, worked out afresh each time', () => {
    const open = house()
    expect(planEnvelope(open)).not.toBe(planEnvelope(open))
    expect(planFacade(open, 'south')).not.toBe(planFacade(open, 'south'))
    expect(planEnvelope(open)).toEqual(planEnvelope(plan))
    expect(planFacade(open, 'east')).toEqual(planFacade(plan, 'east'))
    expect(planSection(open, line)).toEqual(planSection(plan, line))
  })

  it('are not kept while the tolerances are changed for a call', () => {
    const kept = planEnvelope(plan)
    const changed = withTolerances({ passableWidth: 0.25 }, () => planEnvelope(plan))
    expect(changed).not.toBe(kept)
    expect(planEnvelope(plan)).toBe(kept)
  })
})
