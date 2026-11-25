/**
 * LVL-14: a floor above the ground that nothing joins to the ground floor is a finding of its own
 * (`no_stair`), not only a way out left unchecked. A two-storey house drawn with no stair came back
 * with no finding at all.
 */
import { describe, expect, it } from 'vitest'
import { checkPlanSanity, floorsWithNoStair } from '../index'
import { edit, flat, twoFloorHouse } from '../../test-support/plans'

const onFirst = (use: 'stair' | 'lift') =>
  edit(twoFloorHouse(), (copy) => {
    copy.rooms = copy.rooms.map((r) => (r.id === 'landing' ? { ...r, use } : r))
  })

describe('a floor above the ground with no stair (LVL-14)', () => {
  it('is a finding on the floor, with the ground floor a stair would rise from', () => {
    expect(floorsWithNoStair(twoFloorHouse())).toEqual([{ floor: 'first', from: 'ground' }])
    const report = checkPlanSanity(twoFloorHouse())
    const found = report.findings.filter((f) => f.code === 'no_stair')
    expect(found).toEqual([
      {
        code: 'no_stair',
        ruleId: 'floor-has-exit',
        floor: 'first',
        rooms: [],
        openings: [],
        stairFrom: 'ground',
        message: '"First floor" stands above the ground, and nothing joins it to the ground floor: no room on it is used as a stair or a lift, and the plan states no stair to it'
      }
    ])
    // Its way out is still not followed, so the notice stays for the coverage to read.
    expect(report.notChecked.map((n) => [n.reason, n.floor])).toEqual([['no_stairs', 'first']])
  })

  it('is not said with a stair room, a lift room, a stated stair or a ramp on the floor', () => {
    expect(floorsWithNoStair(onFirst('stair'))).toEqual([])
    expect(floorsWithNoStair(onFirst('lift'))).toEqual([])
    const stair = edit(twoFloorHouse(), (copy) => {
      copy.stairs = [{ id: 's1', from: 'ground', to: 'first', width: 1, run: [[0.6, 0.6], [0.6, 3.6]] }]
    })
    expect(floorsWithNoStair(stair)).toEqual([])
    const ramp = edit(twoFloorHouse(), (copy) => {
      copy.ramps = [{ id: 'r1', from: 'first', to: 'ground', width: 3, run: [[1, 1], [1, 7]] }]
    })
    expect(floorsWithNoStair(ramp)).toEqual([])
    // A stair room upstairs with none below it is still a floor the route cannot follow: its notice stays, and no finding.
    const report = checkPlanSanity(onFirst('stair'))
    expect(report.findings.map((f) => f.code)).not.toContain('no_stair')
    expect(report.notChecked.map((n) => n.reason)).toEqual(['no_stairs'])
  })

  it('is not said of one floor, a floor of voids, or a lone floor up in a building', () => {
    expect(floorsWithNoStair(flat())).toEqual([])
    const voids = edit(twoFloorHouse(), (copy) => {
      copy.rooms = copy.rooms.map((r) => (r.floor === 'first' ? { ...r, void: true } : r))
    })
    expect(floorsWithNoStair(voids)).toEqual([])
    // A flat drawn on its own on the third floor: there is no ground floor to join it to.
    const alone = edit(flat(), (copy) => {
      copy.floors = [{ id: 'third', name: 'Third floor', level: 3 }]
      for (const part of [...copy.walls, ...copy.rooms]) part.floor = 'third'
    })
    expect(floorsWithNoStair(alone)).toEqual([])
    expect(checkPlanSanity(alone).findings.map((f) => f.code)).not.toContain('no_stair')
  })
})
