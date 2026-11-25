import { describe, expect, it } from 'vitest'
import { nearestIds } from '../nearest'

/** CMD-21: the known ids nearest a wrong one, for a plan with many rooms. */
describe('nearestIds', () => {
  const known = ['room-101', 'room-102', 'room-310', 'f3-stair-1', 'f3-lobby', 'atrium']

  it('puts an id that holds the one sent, or is held by it, before the rest', () => {
    expect(nearestIds('f3-room-310', known)[0]).toBe('room-310')
    expect(nearestIds('Room_310b', known)[0]).toBe('room-310')
  })

  it('then ranks by edits, and keeps the plan\'s order on a tie', () => {
    expect(nearestIds('room-1o2', known).slice(0, 2)).toEqual(['room-102', 'room-101'])
  })

  it('never returns the id sent, and returns at most count', () => {
    expect(nearestIds('atrium', known)).not.toContain('atrium')
    expect(nearestIds('zzz', known, 3)).toHaveLength(3)
    expect(nearestIds('zzz', [])).toEqual([])
  })
})
