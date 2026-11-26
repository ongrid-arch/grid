import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { diffPlans } from '../diff'
import type { PlanDiff } from '../diff'
import { edit, opening, plan, room, sixRoomHouse, twoRoomBox, wall } from './diff-fixtures'

function churn(diff: PlanDiff, type?: 'wall' | 'opening' | 'room') {
  return diff.issues.filter(
    (i) => i.code === 'suspected_id_churn' && (type === undefined || i.entities[0]!.type === type)
  )
}

/** One 10 m wall, and nothing else. */
const long = plan({ walls: [wall('a', [0, 0], [10, 0])] })
const rebuilt = (patch: Partial<ReturnType<typeof wall>>, id = 'b'): FloorPlan =>
  plan({ walls: [wall(id, [0, 0], [10, 0], patch)] })

describe('a wall that came back under a new id', () => {
  it('reports both changes and the suspicion, in that order', () => {
    const diff = diffPlans(long, rebuilt({}))
    expect(diff.changes.map((c) => c.id)).toEqual(['wall:a:removed', 'wall:b:added'])
    expect(churn(diff)).toEqual([
      {
        code: 'suspected_id_churn',
        message: expect.stringMatching(/a.*b/),
        entities: [
          { type: 'wall', id: 'a' },
          { type: 'wall', id: 'b' }
        ]
      }
    ])
  })

  it('does not merge them, with detection on or off', () => {
    const on = diffPlans(long, rebuilt({}))
    const off = diffPlans(long, rebuilt({}), { detectIdChurn: false })
    expect(off.changes).toEqual(on.changes)
    expect(churn(off)).toEqual([])
  })

  it('needs the walls to overlap by 90% of the longer one', () => {
    const shorter = (length: number): FloorPlan =>
      plan({ walls: [wall('b', [0, 0], [length, 0])] })
    expect(churn(diffPlans(long, shorter(8.9)))).toHaveLength(0)
    expect(churn(diffPlans(long, shorter(9.1)))).toHaveLength(1)
    // The other way round: the later wall is the longer one.
    const longer = (length: number): FloorPlan => plan({ walls: [wall('a', [0, 0], [length, 0])] })
    expect(churn(diffPlans(longer(8.9), rebuilt({})))).toHaveLength(0)
    expect(churn(diffPlans(longer(9.1), rebuilt({})))).toHaveLength(1)
  })

  it('needs the walls to be on the same line', () => {
    const moved = (dy: number): FloorPlan => plan({ walls: [wall('b', [0, dy], [10, dy])] })
    expect(churn(diffPlans(long, moved(0.005)))).toHaveLength(1)
    expect(churn(diffPlans(long, moved(0.02)))).toHaveLength(0)
  })

  it('needs the same thickness', () => {
    expect(churn(diffPlans(long, rebuilt({ thickness: 0.3 })))).toHaveLength(0)
    expect(churn(diffPlans(long, rebuilt({ thickness: 0.2005 })))).toHaveLength(1)
  })

  it('needs the same floor', () => {
    expect(churn(diffPlans(long, rebuilt({ floor: 'first' })))).toHaveLength(0)
    expect(churn(diffPlans(long, rebuilt({ floor: 'ground' })))).toHaveLength(1)
  })

  it('does not suspect two walls that are simply different', () => {
    const elsewhere = plan({ walls: [wall('b', [0, 5], [10, 5])] })
    expect(churn(diffPlans(long, elsewhere))).toEqual([])
    const crossing = plan({ walls: [wall('b', [5, -5], [5, 5])] })
    expect(churn(diffPlans(long, crossing))).toEqual([])
  })

  it('does not suspect a wall that kept its id', () => {
    expect(churn(diffPlans(long, plan({ walls: [wall('a', [0, 0.5], [10, 0.5])] })))).toEqual([])
  })
})

describe('an opening that came back under a new id', () => {
  const base = twoRoomBox()
  const swap = (offset: number): FloorPlan =>
    edit(base, (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'o_win')
      copy.openings.push(opening('o_win2', 'w_n', 'window', offset, 1.2))
    })

  it('is suspected when it sits within 5 cm of the old one on the same wall', () => {
    expect(churn(diffPlans(base, swap(1.04)), 'opening')).toHaveLength(1)
    expect(churn(diffPlans(base, swap(1.06)), 'opening')).toHaveLength(0)
  })

  it('is not suspected on another wall', () => {
    const elsewhere = edit(base, (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'o_win')
      copy.openings.push(opening('o_win2', 'w_s', 'window', 1, 1.2))
    })
    expect(churn(diffPlans(base, elsewhere), 'opening')).toEqual([])
  })
})

describe('a room that came back under a new id', () => {
  const box = (x: number, width: number, wallPrefix: string, roomId: string): FloorPlan =>
    plan({
      walls: [
        wall(`${wallPrefix}s`, [x, 0], [x + width, 0]),
        wall(`${wallPrefix}e`, [x + width, 0], [x + width, 4]),
        wall(`${wallPrefix}n`, [x + width, 4], [x, 4]),
        wall(`${wallPrefix}w`, [x, 4], [x, 0])
      ],
      rooms: [room(roomId, 'Room', [`${wallPrefix}s`, `${wallPrefix}e`, `${wallPrefix}n`, `${wallPrefix}w`])]
    })

  it('is suspected when the room has the same walls', () => {
    const base = box(0, 4, 'a', 'r1')
    const next = edit(base, (copy) => {
      copy.rooms[0]!.id = 'r2'
    })
    expect(churn(diffPlans(base, next), 'room')).toHaveLength(1)
  })

  it('names the rooms by their names, with their ids as data (CMD-34)', () => {
    const base = box(0, 4, 'a', 'r1')
    const sameName = churn(diffPlans(base, edit(base, (copy) => { copy.rooms[0]!.id = 'r2' })), 'room')
    expect(sameName.map((i) => i.message)).toEqual(['Room "Room" was removed and added again in the same place under another id: the id may have changed instead'])
    expect(sameName[0]!.entities).toEqual([{ type: 'room', id: 'r1' }, { type: 'room', id: 'r2' }])
    const renamed = churn(diffPlans(base, edit(base, (copy) => { copy.rooms[0]!.id = 'r2'; copy.rooms[0]!.name = 'Study' })), 'room')
    expect(renamed.map((i) => i.message)).toEqual(['Room "Room" was removed and room "Study" was added in the same place: the id may have changed instead'])
    expect(renamed[0]!.message).not.toMatch(/r1|r2/)
  })

  it('is suspected when the walls were renumbered too, through the walls that matched', () => {
    const diff = diffPlans(box(0, 4, 'a', 'r1'), box(0, 4, 'b', 'r2'))
    expect(churn(diff, 'wall')).toHaveLength(4)
    expect(churn(diff, 'room')).toHaveLength(1)
  })

  it('is suspected when the area is within 10% and the centre within 10 cm', () => {
    // 2.6% more area, centre 5 cm to the right.
    expect(churn(diffPlans(box(0, 4, 'a', 'r1'), box(0, 4.1, 'b', 'r2')), 'room')).toHaveLength(1)
  })

  it('is not suspected when the centre moved 20 cm', () => {
    expect(churn(diffPlans(box(0, 4, 'a', 'r1'), box(0.2, 4, 'b', 'r2')), 'room')).toHaveLength(0)
  })

  it('is not suspected when the area is 20% different', () => {
    expect(churn(diffPlans(box(0, 4, 'a', 'r1'), box(0, 5, 'b', 'r2')), 'room')).toHaveLength(0)
  })
})

describe('a plan whose every id was renumbered', () => {
  it('suspects every wall once and reports no change as a move', () => {
    const base = sixRoomHouse()
    const next = edit(base, (copy) => {
      const rename = new Map(copy.walls.map((w) => [w.id, `n_${w.id}`]))
      for (const w of copy.walls) w.id = rename.get(w.id)!
      for (const r of copy.rooms) r.boundary = r.boundary.map((id) => rename.get(id)!)
      for (const o of copy.openings) o.wall = rename.get(o.wall)!
    })
    const diff = diffPlans(base, next)
    expect(churn(diff, 'wall')).toHaveLength(base.walls.length)
    expect(diff.changes.filter((c) => c.kind === 'modified' && c.entity.type === 'wall')).toEqual([])
  })
})
