import { describe, expect, it } from 'vitest'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { planSection } from '@ongrid/floorplan/geometry/section'
import { sectionNote } from '../drawSection'

/** VEW-38: what `grid draw --section` says on standard error about a line's reach. */
describe('the note on a section line that misses the building or ends inside it (VEW-38)', () => {
  const plan = labPlan('A/scenarios/townhouse.json')
  it('says nothing when the line runs past the building', () => {
    const section = planSection(plan, { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 13 }, toward: 'left' })
    expect(sectionNote({ ...section, assumed: [] })).toBeNull()
  })
  it('says a line over open ground cuts nothing of the building', () => {
    const section = planSection(plan, { from: { x: 40, y: -2 }, to: { x: 40, y: 13 }, toward: 'left' })
    expect(sectionNote(section)).toContain('cuts nothing of the building')
  })
  it('says a line ending in the building ends inside it', () => {
    const section = planSection(plan, { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 5 }, toward: 'left' })
    expect(sectionNote(section)).toContain('ends inside the building at one end')
  })
})
