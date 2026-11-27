/**
 * ARE-75: the building as it stands before and after the work, and the area table of the work,
 * on the refurbishment stand-in (a kitchen and dining room made one, a living room split for a
 * study, the bathroom kept).
 */
import { describe, expect, it } from 'vitest'
import { planHasPhases } from '@ongrid/floorplan/geometry'
import { deepFreeze } from '@ongrid/floorplan/geometry/kept'
import { refurbishment } from '@ongrid/floorplan/test-support/phases'
import { loadedInState, phaseAreas, planAsItStands } from '../phaseState'
import { planAreas } from '../areas'
import { surveyPlan } from '../survey'
import type { LoadedPlan } from '../../command/plan'

const round = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100)
const ids = (parts: readonly { readonly id: string }[]): string[] => parts.map((p) => p.id).sort()

describe('the plan as it stands in one state (ARE-75)', () => {
  it('holds the parts that stand then, none of them with a phase', () => {
    const plan = refurbishment()
    const before = planAsItStands(plan, 'before')
    expect(ids(before.rooms)).toEqual(['bath', 'dining', 'kitchen', 'living-old'])
    expect(ids(before.walls)).toEqual(['wb', 'we', 'wk', 'wn', 'ws', 'ww', 'wx'])
    expect(before.openings.map((o) => o.id)).toContain('win-south-old')
    expect(before.openings.map((o) => o.id)).not.toContain('win-living')
    expect(planHasPhases(before)).toBe(false)
    const after = planAsItStands(plan, 'after')
    expect(ids(after.rooms)).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(after.walls.map((w) => w.id)).not.toContain('wk')
    expect(planHasPhases(after)).toBe(false)
    // A reader that reads the state after the work reads the building before as it is.
    expect(ids(surveyPlan(before).plan.rooms)).toEqual(['bath', 'dining', 'kitchen', 'living-old'])
  })

  it('never changes a frozen plan, and gives the same reading of it each time', () => {
    const plan = deepFreeze(refurbishment())
    const text = JSON.stringify(plan)
    const once = planAsItStands(plan, 'before')
    expect(planAsItStands(plan, 'before')).toBe(once)
    expect(Object.isFrozen(once)).toBe(true)
    expect(JSON.stringify(plan)).toBe(text)
    const loaded = deepFreeze({ file: 'refurb.json', plan, issues: [], broken: new Set<string>() } as LoadedPlan)
    const read = loadedInState(loaded, 'after')
    expect(read).toBe(loadedInState(loaded, 'after'))
    expect(read.plan).toBe(planAsItStands(plan, 'after'))
    expect(read.file).toBe('refurb.json')
    // Kept with their phases, for the demolition plan.
    expect(planHasPhases(loadedInState(loaded, 'before', 'kept').plan)).toBe(true)
    expect(JSON.stringify(plan)).toBe(text)
  })

  it('gives a plan with no phases back as it is', () => {
    const plan = planAsItStands(refurbishment(), 'after')
    expect(planAsItStands(plan, 'before')).toBe(plan)
  })
})

describe('the area table of the work (ARE-75)', () => {
  const table = phaseAreas(refurbishment())

  it('gives each room before, after and the change', () => {
    const room = (id: string): [string, number | null, number | null, number | null] => {
      const r = table.rooms.find((one) => one.id === id)!
      return [r.phase, round(r.existing), round(r.proposed), round(r.change)]
    }
    expect(room('kitchen')).toEqual(['demolished', 13.44, 0, -13.44])
    expect(room('kitchen-dining')).toEqual(['new', 0, 27.36, 27.36])
    expect(room('bath')).toEqual(['existing', 8.64, 8.64, 0])
    expect(table.rooms).toHaveLength(7)
  })

  it('gives each use and the totals, matching grid_areas in each state', () => {
    const use = (word: string): (number | null)[] => [table.byUse[word]!.existing, table.byUse[word]!.proposed, table.byUse[word]!.change].map(round)
    expect(use('kitchen')).toEqual([13.44, 27.36, 13.92])
    expect(use('dining')).toEqual([13.44, 0, -13.44])
    expect(use('study')).toEqual([0, 8.74, 8.74])
    expect(table.net.existing).toBeCloseTo(53.76, 6)
    expect(table.net.proposed).toBeCloseTo(53.86, 6)
    expect(table.net.change).toBeCloseTo(0.1, 6)
    const plan = refurbishment()
    expect(table.net.existing).toBe(planAreas(surveyPlan(planAsItStands(plan, 'before'))).net)
    expect(table.net.proposed).toBe(planAreas(surveyPlan(plan)).net)
    expect(table.grossInternal.change).toBe(0)
  })
})
