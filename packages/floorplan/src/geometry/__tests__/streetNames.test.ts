/**
 * VEW-88: a street's name on the edge of the plot it runs along. The plan keeps it beside the
 * street edges (`site.streetNames`), the site plan gives it to the street it names, and rooms
 * text reads it from a street line in quotes and writes it back the same way. Every name here is
 * invented.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import { siteLines } from '../../rooms/site'
import { SITE_PLAN_TEXT } from '../../test-support/sitePlan'
import { parseFloorPlan, SiteSchema } from '../../types/floorplan'
import { plotBoundary } from '../plot'
import { sitePlan } from '../sitePlan'

const BOUNDARY: [number, number][] = [[0, 0], [40, 0], [40, 30], [0, 30]]

/** The site plan's text with its street line in place of `street south`. */
function compiled(streetLines: string) {
  return compileRoomsText(SITE_PLAN_TEXT.replace('street south\n', `${streetLines}\n`))
}

describe('VEW-88 street names in the plan', () => {
  it('keeps a name on a street edge, and refuses one on an edge not on a street or named twice', () => {
    expect(SiteSchema.safeParse({ boundary: BOUNDARY, streets: [1], streetNames: [{ edge: 1, name: 'Harbour Road' }] }).success).toBe(true)
    const off = SiteSchema.safeParse({ boundary: BOUNDARY, streets: [1], streetNames: [{ edge: 3, name: 'Mill Lane' }] })
    expect(off.success).toBe(false)
    expect(off.error!.issues[0]!.message).toMatch(/does not name edge 3 as on a street/)
    const twice = SiteSchema.safeParse({ boundary: BOUNDARY, streets: [1], streetNames: [{ edge: 1, name: 'Harbour Road' }, { edge: 1, name: 'Quay Street' }] })
    expect(twice.error!.issues[0]!.message).toMatch(/twice/)
  })

  it('refuses an empty name and one longer than a name may be', () => {
    expect(SiteSchema.safeParse({ boundary: BOUNDARY, streets: [1], streetNames: [{ edge: 1, name: '' }] }).success).toBe(false)
    const long = SiteSchema.safeParse({ boundary: BOUNDARY, streets: [1], streetNames: [{ edge: 1, name: 'x'.repeat(121) }] })
    expect(long.success).toBe(false)
    expect(long.error!.issues[0]!.message).toMatch(/at most 120/)
  })

  it('gives the plot\'s edge and the site plan\'s street its name, and none to an unnamed one', () => {
    const plan = parseFloorPlan({ ...(compiled('street edge 1 "Harbour Road"\nstreet edge 2').plan as object) })
    expect(plotBoundary(plan)!.edges.map((e) => [e.edge, e.street, e.streetName])).toEqual([[1, true, 'Harbour Road'], [2, true, null], [3, false, null], [4, false, null]])
    expect(sitePlan(plan).streets.map((s) => [s.edge, s.name])).toEqual([[1, 'Harbour Road'], [2, null]])
  })
})

describe('VEW-88 street names in rooms text', () => {
  it('reads a name in quotes on a street line, for every edge it names', () => {
    const made = compiled('street south "Harbour Road"\nstreet east')
    expect(made.problems).toEqual([])
    const site = (made.plan as { site: { streets: number[]; streetNames: unknown } }).site
    expect(site.streets).toEqual([1, 2])
    expect(site.streetNames).toEqual([{ edge: 1, name: 'Harbour Road' }])
  })

  it('writes the names back so the text reads the same plan again', () => {
    const plan = parseFloorPlan(compiled('street edge 1 "Harbour Road"\nstreet edge 2 3').plan)
    const lines = siteLines(plan)
    expect(lines).toContain('street edge 2 3')
    expect(lines).toContain('street edge 1 "Harbour Road"')
    const again = parseFloorPlan(compiled(lines.filter((l) => l.startsWith('street')).join('\n')).plan)
    expect(again.site!.streets).toEqual(plan.site!.streets)
    expect(again.site!.streetNames).toEqual(plan.site!.streetNames)
  })

  it('refuses two names on one line, a name of spaces and two names for one edge', () => {
    expect(compiled('street edge 1 "Harbour Road" "Quay Street"').problems[0]!.message).toMatch(/one name in quotes/)
    expect(compiled('street edge 1 "  "').problems[0]!.message).toMatch(/empty/)
    expect(compiled('street edge 1 "Harbour Road"\nstreet south "Quay Street"').problems[0]!.message).toMatch(/one name/)
  })
})
