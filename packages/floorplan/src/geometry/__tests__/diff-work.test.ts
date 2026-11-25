/**
 * CMD-31: a plan compared with itself by phase, before its work against after it, judges its
 * issues by what the work does. A door whose room the work replaces with a new one is the work,
 * not an issue; an old window the work leaves between two rooms is one. Compared as two
 * versions, the same plans are read as before.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { refurbishment } from '../../test-support/phases'
import { compareBuildings } from '../diff'
import { planInState } from '../phases'

const wall = (id: string, start: [number, number], end: [number, number], phase: string, kind = 'exterior'): Record<string, unknown> =>
  ({ id, start, end, thickness: kind === 'exterior' ? 0.3 : 0.1, height: 3, kind, phase })

/**
 * Two classrooms knocked into one, and a new classroom built against the old north wall: the
 * north window over it now looks into the new room, the other still looks out, and the north
 * door that led outside now leads into the new room.
 */
function school(): FloorPlan {
  return parseFloorPlan({
    version: '1',
    walls: [
      wall('ws', [0, 0], [12, 0], 'existing'),
      wall('we', [12, 0], [12, 6], 'existing'),
      wall('wn', [12, 6], [0, 6], 'existing'),
      wall('ww', [0, 6], [0, 0], 'existing'),
      wall('wx', [6, 0], [6, 6], 'demolished', 'interior'),
      wall('e1', [0, 6], [0, 10], 'new'),
      wall('e2', [0, 10], [6, 10], 'new'),
      wall('e3', [6, 10], [6, 6], 'new'),
    ],
    rooms: [
      { id: 'class-a', name: 'Classroom A', boundary: ['ws', 'wx', 'wn', 'ww'], phase: 'demolished' },
      { id: 'class-b', name: 'Classroom B', boundary: ['ws', 'we', 'wn', 'wx'], phase: 'demolished' },
      { id: 'hall', name: 'Teaching hall', boundary: ['ws', 'we', 'wn', 'ww'], phase: 'new' },
      { id: 'class-new', name: 'New classroom', boundary: ['wn', 'e3', 'e2', 'e1'], phase: 'new' },
    ],
    openings: [
      { id: 'door-a', wall: 'ws', type: 'door', offset: 2, width: 0.9, height: 2.1 },
      { id: 'door-b', wall: 'ws', type: 'door', offset: 8, width: 0.9, height: 2.1 },
      { id: 'door-north', wall: 'wn', type: 'door', offset: 10, width: 0.9, height: 2.1 },
      { id: 'win-old', wall: 'wn', type: 'window', offset: 8, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'win-east', wall: 'wn', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 },
    ],
  })
}

const byPhase = (plan: FloorPlan, work: boolean): ReturnType<typeof compareBuildings> =>
  compareBuildings(planInState(plan, 'before'), planInState(plan, 'after'), { phases: false, ...(work ? { work: true } : {}) })

describe('the issues of a comparison by phase (CMD-31)', () => {
  it('says no door whose room the work replaced: the refurbishment has no issue', () => {
    expect(byPhase(refurbishment(), true).issues).toEqual([])
  })

  it('says the old window that now looks into the new classroom, and not the doors into the rooms knocked together', () => {
    const compared = byPhase(school(), true)
    expect(compared.issues.map((i) => [i.code, i.entities[0]?.id])).toEqual([
      ['door_joins_other_rooms', 'door-north'],
      ['window_between_rooms', 'win-old'],
    ])
    const issue = compared.issues.find((i) => i.code === 'window_between_rooms')!
    expect(issue.message).toBe('Window "win-old" now stands between "New classroom" and "Teaching hall"; before the work one side of it was outside')
    expect(issue.entities).toEqual([{ type: 'opening', id: 'win-old' }, { type: 'room', id: 'class-new' }, { type: 'room', id: 'hall' }])
    expect(compared.verdict).toMatch(/^2 issues to look at first\./)
  })

  it('still says a door that led outside and now leads into a room', () => {
    const door = byPhase(school(), true).issues.find((i) => i.code === 'door_joins_other_rooms')!
    expect(door.message).toBe('Door "door-north" joined "class-a" and the outside; it now joins "class-new" and "hall"')
  })

  it('reads the same plans as two versions as before: every door that joins other rooms, and no window', () => {
    const compared = byPhase(school(), false)
    expect(compared.issues.map((i) => [i.code, i.entities[0]?.id])).toEqual([
      ['door_joins_other_rooms', 'door-a'],
      ['door_joins_other_rooms', 'door-b'],
      ['door_joins_other_rooms', 'door-north'],
    ])
  })
})
