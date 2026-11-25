/**
 * ARE-41: a length taped on site is set against the building as surveyed, its existing state, not
 * the proposed one, whichever way the plan is handed over.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { planInState } from '../phases'
import { tapedLengths } from '../taped'

const wall = (id: string, start: [number, number], end: [number, number], phase: string) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'partition', phase })

/** An existing room 4 m by 3 m between its wall centre lines; a new room beside it that takes its east wall's place. */
function plan(taped: object[]) {
  return parseFloorPlan({
    version: '1',
    walls: [
      wall('s', [0, 0], [4, 0], 'existing'),
      wall('e', [4, 0], [4, 3], 'demolished'),
      wall('n', [4, 3], [0, 3], 'existing'),
      wall('w', [0, 3], [0, 0], 'existing'),
      wall('s2', [0, 0], [6, 0], 'new'),
      wall('e2', [6, 0], [6, 3], 'new'),
      wall('n2', [6, 3], [0, 3], 'new'),
      wall('w2', [0, 3], [0, 0], 'new'),
    ],
    rooms: [
      { id: 'old', name: 'Old', boundary: ['s', 'e', 'n', 'w'], phase: 'existing' },
      { id: 'big', name: 'Big', boundary: ['s2', 'e2', 'n2', 'w2'], phase: 'new' },
    ],
    openings: [],
    taped,
  })
}

describe('taped lengths in the existing state (ARE-41)', () => {
  it('sets a length taped in a room that stands now against that room', () => {
    const [row] = tapedLengths(plan([{ room: 'old', wall: 's', length: 3.8 }]))
    expect(row!.drawn).toBeCloseTo(3.8, 6)
    expect(row!.state).toBe('agrees')
  })

  it('does not measure a length against a room that only the work will make', () => {
    const [row] = tapedLengths(plan([{ room: 'big', wall: 's2', length: 5.8 }]))
    expect(row!.drawn).toBeNull()
    expect(row!.state).toBe('not-measured')
    expect(row!.missing).toBe('no-room')
  })

  it('gives the same rows however the plan is handed over', () => {
    const whole = plan([{ room: 'old', wall: 's', length: 3.8 }, { room: 'big', wall: 's2', length: 5.8 }])
    expect(tapedLengths(whole).map((r) => r.state)).toEqual(['agrees', 'not-measured'])
    expect(tapedLengths(planInState(whole, 'before')).map((r) => r.state)).toEqual(['agrees', 'not-measured'])
  })

  it('reads a plan with no phases as it is', () => {
    const raw = plan([{ room: 'old', wall: 's', length: 3.8 }])
    const bare = { ...raw, walls: raw.walls.slice(0, 4).map((w) => ({ ...w, phase: undefined })), rooms: [{ ...raw.rooms[0]!, phase: undefined }] }
    expect(tapedLengths(bare as typeof raw)[0]!.state).toBe('agrees')
  })
})
