/**
 * MSG-5 (lab MS-4, W-6): a note that rests on a part that could not be drawn is held back, and
 * the floor's notice names the part and keeps the note. A note on a sound part is still given.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { checkPlanSanity } from '../rules'
import { validatePlan } from '../validate'
import { door, edit, flat, wall, withoutOpening } from '../../test-support/plans'

const given = (plan: FloorPlan, leftOut: Parameters<typeof checkPlanSanity>[1] = {}) =>
  checkPlanSanity(plan, leftOut).findings.map((f) => `${f.code} ${f.rooms.join('+')}`)
const held = (plan: FloorPlan, leftOut: Parameters<typeof checkPlanSanity>[1] = {}) =>
  checkPlanSanity(plan, leftOut)
    .notChecked.flatMap((n) => n.held ?? [])
    .map((h) => `${h.finding.code} ${h.finding.rooms.join('+')} <- ${h.waitsFor.join(',')}`)

/** The flat with the hall's wall list cut to two walls, so the hall cannot be drawn. */
const hallNotDrawn = (): FloorPlan =>
  edit(flat(), (copy) => {
    copy.rooms.find((r) => r.id === 'hall')!.boundary = ['s1', 'hk']
  })

describe('a note that rests on a room that could not be drawn', () => {
  it('is held, not given: the floor has its doors, they open into the hall', () => {
    // Its wall list is cut short, so the bedroom's door is on none of its walls: the hall may
    // still be the space beyond it.
    expect(given(hallNotDrawn())).toEqual([])
    expect(held(hallNotDrawn())).toEqual(['door_to_undrawn_space bedroom <- hall', 'room_without_door kitchen <- hall'])
  })

  it('is named by the one "could not be drawn" notice, which keeps the note', () => {
    const notices = checkPlanSanity(hallNotDrawn()).notChecked
    // The way out is said not to be checked as before: its doors lead into the space not drawn.
    expect(notices.map((n) => n.reason)).toEqual(['cannot_be_drawn', 'way_out_not_drawn'])
    expect(notices[0]).toMatchObject({ reason: 'cannot_be_drawn', floor: 'ground', rooms: ['hall'], openings: [] })
    expect(notices[0]!.message).toBe('On "Ground floor", these rooms could not be drawn, so they and what rests on them were not checked: "Hall"')
    expect(notices[0]!.held![0]!.finding.message).toBe('A door from "Bedroom" leads to a space that is not drawn as a room')
  })

  it('holds the way out when the front door is on a wall of the room that could not be drawn', () => {
    // The hall lists its walls out of order; its front door stays on its wall s1.
    const plan = edit(flat(), (copy) => {
      copy.rooms.find((r) => r.id === 'hall')!.boundary = ['s1', 'hb', 'hk', 'w1']
    })
    expect(given(plan)).toEqual([])
    expect(held(plan)).toEqual(expect.arrayContaining(['no_exit  <- hall']))
  })
})

describe('a note that rests on a door that could not be drawn', () => {
  // The bathroom's only door runs off its wall.
  const doorOffWall = (): FloorPlan =>
    edit(flat(), (copy) => {
      copy.openings.find((o) => o.id === 'd_bb')!.offset = 3.5
    })

  it('holds "no door" for a room that shares a wall with it, and says which door it waits for', () => {
    expect(given(doorOffWall())).toEqual([])
    expect(held(doorOffWall())).toEqual(['room_without_door bathroom <- d_bb'])
  })

  it('gives the note again once the door is drawn, if it still holds: a door taken away', () => {
    expect(given(withoutOpening(flat(), 'd_bb'))).toEqual(['room_without_door bathroom'])
    expect(held(withoutOpening(flat(), 'd_bb'))).toEqual([])
  })

  it('holds a note that happens to be true while a part on its walls is broken (W-6)', () => {
    // No door to the bathroom, and its window runs off its wall: the note waits for the window.
    const plan = edit(withoutOpening(flat(), 'd_bb'), (copy) => {
      copy.openings.find((o) => o.id === 'win_b')!.offset = 4.5
    })
    expect(given(plan)).toEqual([])
    expect(held(plan)).toEqual(['room_without_door bathroom <- win_b'])
  })

  it('still gives a note on a room no broken part touches', () => {
    // The kitchen's window runs off its wall; the bathroom shares no wall with it.
    const plan = edit(withoutOpening(flat(), 'd_bb'), (copy) => {
      copy.openings.find((o) => o.id === 'win_k')!.offset = 5.5
    })
    expect(given(plan)).toEqual(['room_without_door bathroom'])
  })
})

describe('an opening that could be placed on no wall', () => {
  // Lab M-9: the front door on wall "S1", the wall is "s1".
  const misspelt = (): FloorPlan =>
    edit(flat(), (copy) => {
      copy.openings.find((o) => o.id === 'front')!.wall = 'S1'
    })

  it('is named as not drawn, and the way out waits for it', () => {
    const report = checkPlanSanity(misspelt())
    expect(report.findings).toEqual([])
    expect(report.notChecked).toMatchObject([{ reason: 'cannot_be_drawn', rooms: [], openings: ['front'] }])
    // LVL-5 (lab A-16): the door is called a door, by its type.
    expect(report.notChecked[0]!.message).toBe('On "Ground floor", this door could not be drawn, so it and what rests on it were not checked: "front"')
    expect(report.notChecked[0]!.openingKinds).toEqual(['door'])
    expect(held(misspelt())).toEqual([
      'no_exit  <- front',
      'no_route_to_exit bathroom <- front',
      'no_route_to_exit bedroom <- front',
      'no_route_to_exit hall <- front',
      'no_route_to_exit kitchen <- front'
    ])
  })
})

describe('a part the reader left out', () => {
  it('holds what rests on it, as one the drawing leaves out', () => {
    const plan = withoutOpening(flat(), 'd_bb')
    const leftOut = { leftOut: [{ kind: 'opening' as const, id: 'd_bb', floor: null, walls: ['bb'] }] }
    expect(given(plan, leftOut)).toEqual([])
    expect(held(plan, leftOut)).toEqual(['room_without_door bathroom <- d_bb'])
    expect(checkPlanSanity(plan, leftOut).notChecked).toMatchObject([{ reason: 'cannot_be_drawn', openings: ['d_bb'] }])
  })

  it('a room left out holds where a door into it leads', () => {
    const plan = edit(flat(), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'bathroom')
    })
    expect(given(plan)).toContain('door_to_undrawn_space bedroom')
    const leftOut = { leftOut: [{ kind: 'room' as const, id: 'bathroom', floor: 'ground', walls: ['kb2', 'e2', 'n1', 'bb'] }] }
    expect(given(plan, leftOut)).toEqual([])
    expect(held(plan, leftOut)).toEqual(['door_to_undrawn_space bedroom <- bathroom'])
  })
})

describe('the cause a drawing problem names (causedBy)', () => {
  const causes = (plan: FloorPlan, options: Parameters<typeof validatePlan>[2] = {}) =>
    validatePlan(plan, undefined, options).issues.map((i) => `${i.code} ${i.id}${i.causedBy === undefined ? '' : ` <- ${i.causedBy}`}`)

  it('a door on a wall that cannot be drawn, and a room on it, follow from the wall', () => {
    const plan = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 'bb')!.end = [5, 4]
    })
    expect(causes(plan)).toEqual(
      expect.arrayContaining(['wall/zero-length bb', 'opening/broken-wall d_bb <- bb', 'room/broken-wall bedroom <- bb', 'room/broken-wall bathroom <- bb'])
    )
  })

  it('a wall the reader left out is the cause of what rests on it', () => {
    const plan = edit(flat(), (copy) => {
      copy.walls = copy.walls.filter((w) => w.id !== 'bb')
    })
    expect(causes(plan, { leftOutWalls: new Set(['bb']) })).toEqual(
      expect.arrayContaining(['opening/broken-wall d_bb <- bb', 'room/broken-wall bedroom <- bb', 'room/broken-wall bathroom <- bb'])
    )
  })

  it('a plan with no walls: one line, and every room and opening follows from it', () => {
    const plan = edit(flat(), (copy) => {
      copy.walls = []
    })
    const issues = validatePlan(plan).issues
    expect(issues[0]).toMatchObject({ code: 'plan/no-walls', id: 'plan', severity: 'error' })
    expect(issues[0]!.message).toBe('The plan has no walls, but 4 rooms and 6 openings name walls. Nothing can be drawn or measured until the walls are in the plan')
    expect(issues.slice(1).every((i) => i.causedBy === 'plan')).toBe(true)
    expect(issues).toHaveLength(1 + 4 + 6)
  })

  it('enclosed floor no room claims follows from the room that could not be drawn there', () => {
    const plan = edit(flat(), (copy) => {
      copy.rooms.find((r) => r.id === 'kitchen')!.boundary = ['s2', 'e1', 'kb2', 'kb1', 'hk-typo']
    })
    expect(causes(plan)).toEqual(expect.arrayContaining(['floor/unclaimed ground <- kitchen']))
  })

  it('a room measured as if closed: its outline lines follow from the wall that stops short', () => {
    // The bathroom's north wall stops 1 m short of the corner at (10, 8).
    const plan = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 'n1')!.start = [9, 8]
      copy.walls.push(wall('extra', [7, 4], [7, 8]))
    })
    const found = causes(plan)
    expect(found.some((c) => c.startsWith('wall/short n1'))).toBe(true)
    for (const c of found.filter((c) => c.startsWith('room/space-mismatch bathroom') || c.startsWith('room/not-enclosed bathroom'))) expect(c).toMatch(/<- n1$/)
  })

  it('a door on a wall that is in the plan names no cause', () => {
    const plan = edit(flat(), (copy) => {
      copy.openings.push(door('d_x', 'nowhere', 1))
    })
    expect(causes(plan)).toContain('opening/missing-wall d_x')
  })
})
