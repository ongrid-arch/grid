import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { diffPlans } from '../diff'
import {
  edit,
  moveWall,
  room,
  shuffled,
  sixRoomHouse,
  twoRoomBox,
  withWall
} from './diff-fixtures'

function turned(plan: FloorPlan, degrees: number): FloorPlan {
  const a = (degrees * Math.PI) / 180
  const turn = (p: readonly [number, number]): [number, number] => [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a)
  ]
  return edit(plan, (copy) => {
    for (const wall of copy.walls) {
      wall.start = turn(wall.start)
      wall.end = turn(wall.end)
    }
  })
}

/** Both pieces of the divider between the left and the middle column. */
function moveDivider(plan: FloorPlan, dx: number): FloorPlan {
  return moveWall(moveWall(plan, 'v1_0', dx, 0), 'v1_1', dx, 0)
}

describe('moving a wall that two rooms share', () => {
  // The inner faces of every divider are 3.85 m long, in both rows.
  const SHARED_FACE = 3.85
  const ROOMS_ON_DIVIDER = ['r00', 'r01', 'r10', 'r11']

  it.each([0.25, 0.5, -0.3])(
    'grows one side and shrinks the other by the offset times the shared face (%d m)',
    (d) => {
      const plan = sixRoomHouse()
      const diff = diffPlans(plan, moveDivider(plan, d))
      expect(diff.areas.map((a) => a.roomId).sort()).toEqual(ROOMS_ON_DIVIDER)
      for (const delta of diff.areas) {
        const left = delta.roomId.startsWith('r0') // the left column gains when the wall moves right
        const expected = (left ? 1 : -1) * d * SHARED_FACE
        expect(delta.after! - delta.before!).toBeCloseTo(expected, 9)
      }
    }
  )

  it('gives the same answer when the whole plan is turned', () => {
    const plan = sixRoomHouse()
    const reference = diffPlans(plan, moveDivider(plan, 0.5)).areas
    for (const angle of [0.6435 * (180 / Math.PI), 90, 211]) {
      const areas = diffPlans(turned(plan, angle), turned(moveDivider(plan, 0.5), angle)).areas
      expect(areas.map((x) => x.roomId)).toEqual(reference.map((x) => x.roomId))
      areas.forEach((delta, i) => {
        expect(delta.after! - delta.before!).toBeCloseTo(
          reference[i]!.after! - reference[i]!.before!,
          9
        )
      })
    }
  })

  it('makes each area change depend on the change of the wall that caused it', () => {
    const plan = sixRoomHouse()
    const diff = diffPlans(plan, moveDivider(plan, 0.5))
    for (const delta of diff.areas) {
      const row = delta.roomId.slice(-1)
      expect(delta.dependsOn).toEqual([`wall:v1_${row}:modified`])
    }
    const ids = new Set(diff.changes.map((c) => c.id))
    for (const delta of diff.areas) for (const id of delta.dependsOn) expect(ids.has(id)).toBe(true)
  })

  it('only reports the rooms on the wall that moved', () => {
    const plan = sixRoomHouse()
    const diff = diffPlans(plan, moveWall(plan, 'v1_0', 0.5, 0))
    expect(diff.areas.map((a) => a.roomId)).toEqual(['r00', 'r10'])
  })

  it('says which floor the room is on, and is ordered', () => {
    const plan = sixRoomHouse()
    const areas = diffPlans(plan, moveDivider(plan, 0.5)).areas
    expect(new Set(areas.map((a) => a.floor))).toEqual(new Set(['ground']))
    expect(areas.map((a) => a.roomId)).toEqual([...areas.map((a) => a.roomId)].sort())
  })
})

describe('an area that did not really change', () => {
  it('is not reported when it moved by less than 0.01 m²', () => {
    const plan = twoRoomBox()
    // 0.0011 m across a 3.8 m face is 0.004 m²: a real wall change, not a real area change.
    const diff = diffPlans(plan, moveWall(plan, 'w_mid', 0.0011, 0))
    expect(diff.changes.map((c) => c.entity.id)).toContain('w_mid')
    expect(diff.areas).toEqual([])
  })

  it('is not reported when every number is noise under the tolerance, even in a big room', () => {
    const plan = sixRoomHouse()
    const noisy = edit(plan, (copy) => {
      copy.walls.forEach((wall, i) => {
        const nudge = (i % 2 === 0 ? 1 : -1) * 0.0009
        wall.start = [wall.start[0] + nudge, wall.start[1] - nudge]
        wall.end = [wall.end[0] - nudge, wall.end[1] + nudge]
        wall.thickness += nudge
      })
    })
    const diff = diffPlans(plan, noisy)
    expect(diff.changes).toEqual([])
    expect(diff.areas).toEqual([])
  })

  it('is not reported for a room that was only renamed or listed in another order', () => {
    const plan = twoRoomBox()
    expect(diffPlans(plan, shuffled(plan, 4)).areas).toEqual([])
  })
})

describe('rooms that appear and disappear', () => {
  it('reports an added room with no earlier area', () => {
    const plan = twoRoomBox()
    const next = edit(plan, (copy) => {
      copy.rooms.push(room('r_new', 'Pantry', ['w_s', 'w_mid', 'w_n', 'w_w']))
    })
    expect(diffPlans(plan, next).areas).toMatchObject([
      { roomId: 'r_new', before: null, floor: 'ground' }
    ])
    expect(diffPlans(plan, next).areas[0]!.after).toBeCloseTo(3.85 * 3.8, 6)
  })

  it('reports a removed room with no later area', () => {
    const plan = twoRoomBox()
    const next = edit(plan, (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'r_right')
    })
    const [delta] = diffPlans(plan, next).areas
    expect(delta).toMatchObject({ roomId: 'r_right', after: null })
    expect(delta!.before).toBeCloseTo(3.85 * 3.8, 6)
  })
})

describe('a room that stops closing', () => {
  it('has no later area, and the diff says so', () => {
    const plan = twoRoomBox()
    // A divider turned parallel to the south wall cannot form a corner with it.
    const next = withWall(plan, 'w_mid', { start: [4, 0], end: [7, 0] })
    const diff = diffPlans(plan, next)
    const left = diff.areas.find((a) => a.roomId === 'r_left')!
    expect(left.after).toBeNull()
    expect(left.before).toBeCloseTo(3.85 * 3.8, 6)
    expect(left.dependsOn).toEqual(['wall:w_mid:modified'])
    expect(diff.issues).toContainEqual({
      code: 'room_unclosed',
      // CMD-34: named by its name; its id is in the entities.
      message: 'Room "Left room" closed before and no longer does',
      entities: [{ type: 'room', id: 'r_left' }]
    })
  })

  it('stays quiet about a room that did not close before either', () => {
    const plan = withWall(twoRoomBox(), 'w_mid', { start: [4, 0], end: [7, 0] })
    const next = moveWall(plan, 'w_mid', 0, 0.5)
    const diff = diffPlans(plan, next)
    expect(diff.issues.filter((i) => i.code === 'room_unclosed')).toEqual([])
  })
})

describe('a room resized by its walls', () => {
  it('gets a derived change that depends on the wall changes', () => {
    const plan = sixRoomHouse()
    const diff = diffPlans(plan, moveDivider(plan, 0.5))
    const kitchen = diff.changes.find((c) => c.id === 'room:r00:modified')
    expect(kitchen).toMatchObject({
      kind: 'modified',
      derived: true,
      props: [],
      dependsOn: ['wall:v1_0:modified']
    })
    expect(kitchen!.summary).toMatch(/ changed with its walls$/)
    // Every room with a reported area has a change, and the other way round for derived rooms.
    const roomChanges = diff.changes.filter((c) => c.entity.type === 'room')
    expect(roomChanges.map((c) => c.entity.id).sort()).toEqual(
      diff.areas.map((a) => a.roomId).sort()
    )
    for (const change of roomChanges) {
      expect(change.dependsOn).toEqual(diff.areas.find((a) => a.roomId === change.entity.id)!.dependsOn)
    }
  })

  it('is not given a second change when it has one of its own', () => {
    const plan = sixRoomHouse()
    const later = edit(moveDivider(plan, 0.5), (copy) => {
      copy.rooms.find((r) => r.id === 'r00')!.name = 'Pantry'
    })
    const changes = diffPlans(plan, later).changes.filter((c) => c.entity.id === 'r00')
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ derived: false, props: [{ key: 'name' }] })
  })

  it('has no change when its area did not move', () => {
    const plan = sixRoomHouse()
    const diff = diffPlans(plan, moveWall(plan, 'h0_0', 0, 0.0004))
    expect(diff.changes.filter((c) => c.entity.type === 'room')).toEqual([])
  })
})
