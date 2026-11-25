import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { comparePlans } from '../compare'
import { surveyPlan } from '../survey'

/**
 * A window in the same place on another floor is another window. Found by WRT-3: moving the
 * north wall of one flat of the lab's block by 0.10 m paired its windows with the ones above
 * them, and the comparison said "openings: 6 out, 6 new".
 */
describe('comparing a plan of several floors', () => {
  it('pairs an opening only with one on its own floor', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/edits/block-588.json'), 'utf8')) as { walls: Array<{ id: string; start: [number, number]; end: [number, number] }> }
    const before = parseFloorPlan(raw)
    const moved = structuredClone(raw)
    for (const wall of moved.walls) {
      if (wall.id !== 'L1-ext-n') continue
      wall.start = [wall.start[0], wall.start[1] - 0.1]
      wall.end = [wall.end[0], wall.end[1] - 0.1]
    }
    const verdict = comparePlans(surveyPlan(before), surveyPlan(parseFloorPlan(moved)), ['before', 'after']).verdict
    expect(verdict).not.toMatch(/openings: \d+ out/)
  })
})

/**
 * WRT-25: a floor that moved up or down is a change in the write verdict. Found when a mezzanine
 * written at 13.75 m and written again at 4.25 m was answered "the same building as the plan before".
 */
describe('a floor moved up or down', () => {
  const warehouse = (mezzanine: string): string => `plan "Warehouse"
walls outside 0.3 inside 0.1 height 3
floor ground "Ground" level 0 elevation 0 height 13
room hall "Hall" storage 20 x 10 at 0,0
floor mezz "Mezzanine" level 1 ${mezzanine} height 3
room office "Office" office 6 x 4 at 0,0
`
  const plan = (text: string): FloorPlan => {
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    return parseFloorPlan(result.plan)
  }
  const high = surveyPlan(plan(warehouse('elevation 13.75')))
  const low = surveyPlan(plan(warehouse('elevation 4.25')))

  it('is never the same building, and says the move with both elevations', () => {
    const compared = comparePlans(high, low, ['the plan before', 'the plan now'])
    expect(compared.verdict).not.toContain('same building')
    expect(compared.verdict).toBe('The plan now has the walls, openings and rooms of the plan before, each in its place, but floor "Mezzanine" moved down 9.50 m: elevation 13.75 m → 4.25 m.')
    expect(compared.floorsChanged).toEqual([expect.objectContaining({ floor: 'mezz', elevation: { before: 13.75, after: 4.25 } })])
  })

  it('says it after "but" when the plan also moved on the drawing', () => {
    const moved = plan(warehouse('elevation 4.25'))
    const by = ([x, y]: readonly [number, number]): [number, number] => [x + 5, y]
    const shifted = { ...moved, walls: moved.walls.map((w) => ({ ...w, start: by(w.start), end: by(w.end) })) }
    const verdict = comparePlans(high, surveyPlan(parseFloorPlan(shifted)), ['before', 'after']).verdict
    expect(verdict).toContain('moved 5.00 m on the drawing, but floor "Mezzanine" moved down 9.50 m: elevation 13.75 m → 4.25 m.')
  })

  it('still says the same building when no floor changed', () => {
    expect(comparePlans(high, surveyPlan(plan(warehouse('elevation 13.75'))), ['the plan before', 'the plan now']).verdict).toContain('is the same building as the plan before')
  })
})
