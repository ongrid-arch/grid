/** MSG-22: the floor a plan names in no list is named in the plan's language. */
import { describe, expect, it } from 'vitest'
import { flat, twoFloorHouse } from '../../test-support/plans'
import { planFloors, spokenIn } from '../floors'

describe('the ground floor in the plan\'s language', () => {
  it('is "Ground floor" in English and "Planta baja" in Spanish', () => {
    const plan = flat()
    expect(planFloors(plan).map((f) => f.name)).toEqual(['Ground floor'])
    expect(planFloors({ ...plan, display: { language: 'es' } }).map((f) => f.name)).toEqual(['Planta baja'])
  })

  it('reads the plan in a language asked for, and leaves a plan that names its floors alone', () => {
    const plan = flat()
    expect(planFloors(spokenIn(plan, 'es'))[0]!.name).toBe('Planta baja')
    expect(spokenIn(plan, 'en')).toBe(plan)
    expect(spokenIn(plan, undefined)).toBe(plan)
    const named = twoFloorHouse()
    expect(spokenIn(named, 'es')).toBe(named)
    expect(planFloors(spokenIn(named, 'es')).map((f) => f.name)).toEqual(planFloors(named).map((f) => f.name))
  })
})
