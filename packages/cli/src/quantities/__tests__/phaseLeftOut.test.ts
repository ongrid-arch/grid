/**
 * ARE-54: a room the phases leave out of the areas says so, names the wall and gives the pattern.
 */
import { describe, expect, it } from 'vitest'
import { refurbishment } from '@ongrid/floorplan/test-support/phases'
import { planAreas } from '../areas'
import { surveyPlan } from '../survey'

const notes = (plan: ReturnType<typeof refurbishment>) => planAreas(surveyPlan(plan)).notes

describe('rooms left out by the phases (ARE-54)', () => {
  it('names the rooms, the wall to be demolished and the pattern when two rooms keep their phase', () => {
    const plan = refurbishment()
    for (const room of plan.rooms) if (room.id === 'kitchen' || room.id === 'dining') room.phase = 'existing'
    const phased = notes(plan).filter((n) => n.includes('The phases leave'))
    expect(phased).toHaveLength(1)
    expect(phased[0]).toContain('2 rooms')
    expect(phased[0]).toContain('"kitchen"')
    expect(phased[0]).toContain('"dining"')
    expect(phased[0]).toContain('wall "wk" is to be demolished')
    expect(phased[0]).toContain('the phase demolished')
    expect(phased[0]).toContain('the phase new')
  })

  it('says nothing of phases when the rooms follow the pattern, or the plan has none', () => {
    expect(notes(refurbishment()).filter((n) => n.includes('The phases leave'))).toEqual([])
    const plain = refurbishment()
    for (const part of [...plain.walls, ...plain.rooms, ...plain.openings]) delete part.phase
    expect(notes(plain).filter((n) => n.includes('The phases leave'))).toEqual([])
  })
})
