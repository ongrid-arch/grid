/**
 * WRT-8: two versions compared by what stands where in the building, not by ids.
 *
 * The cases are the lab's (WR-8, Y-4, RT-8, U-4), rebuilt on the repository's own fixtures: the
 * two-bedroom flat (`two-bed-flat.json`) and the same flat written rooms first
 * (`rooms/flat.rooms`). "Today" in a test name is what the id diff alone says of the same pair.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { alignPlans, compareBuildings, diffPlans, sameRing } from '../diff'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, 'two-bed-flat.json'), 'utf8')))
const roomsText = (): string => readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8')

/** Rooms text written as `grid write` writes it: with what it records of how it was written. */
function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { ...plan, written: stampFor(plan) }
}

/** Every id new, every wall drawn the other way round, the lists in another order, the origin moved and every point slipped a little. */
function renamedAndMoved(plan: FloorPlan, shift: readonly [number, number], slip = 0.004): FloorPlan {
  const walls = new Map(plan.walls.map((w, i) => [w.id, `wall-${i + 1}`] as const))
  const openings = new Map(plan.openings.map((o, i) => [o.id, `${o.type}-${i + 1}`] as const))
  const rooms = new Map(plan.rooms.map((r, i) => [r.id, `room-${i + 1}`] as const))
  const lengths = new Map(plan.walls.map((w) => [w.id, Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])] as const))
  const at = (p: readonly [number, number], k: number): [number, number] => [p[0] + shift[0] + slip * (k % 2), p[1] + shift[1] - slip * (k % 3 === 0 ? 1 : 0)]
  return {
    ...plan,
    walls: plan.walls.map((w, i) => ({ ...w, id: walls.get(w.id)!, start: at(w.end, i), end: at(w.start, i + 1) })).reverse(),
    openings: plan.openings
      .map((o) => ({
        ...o,
        id: openings.get(o.id)!,
        wall: walls.get(o.wall)!,
        offset: lengths.get(o.wall)! - o.offset - o.width,
        ...(o.hinge ? { hinge: o.hinge === 'start' ? ('end' as const) : ('start' as const) } : {}),
        ...(o.swing ? { swing: o.swing === 'left' ? ('right' as const) : ('left' as const) } : {})
      }))
      .reverse(),
    rooms: plan.rooms.map((r) => ({ ...r, id: rooms.get(r.id)!, boundary: [...r.boundary].reverse().map((id) => walls.get(id)!) })).reverse()
  }
}

describe('the same building under new ids (done-when 1, lab WR-8 and Y-4)', () => {
  it('compares as no change, with one line saying how many ids were renamed', () => {
    const before = flat()
    const after = renamedAndMoved(before, [0.15, -0.15])
    // Today: the id diff alone lists every part as removed and added.
    expect(diffPlans(before, after).changes.length).toBe(56)

    const compared = compareBuildings(before, after)
    expect(compared.changes).toEqual([])
    expect(compared.sameBuilding).toBe(true)
    expect(compared.renamed).toMatchObject({ count: 28, walls: 9, openings: 13, rooms: 6 })
    expect(compared.issues).toEqual([])
    expect(compared.verdict).toContain('Same building, 28 ids renamed (9 walls, 13 openings, 6 rooms)')
    expect(compared.shift[0]).toBeCloseTo(0.15, 2)
    expect(compared.diff.changes).toEqual([])
  })

  it('reads the flat written rooms first and the one drawn by hand as one building (Y-4)', () => {
    const byHand = renamedAndMoved(flat(), [0.15, 0.15], 0)
    const compared = compareBuildings(byHand, written(roomsText()))
    expect(compared.changes).toEqual([])
    expect(compared.renamed.count).toBeGreaterThan(0)
    expect(compared.verdict).toMatch(/^Same building, \d+ ids renamed/)
  })

  it('still says what changed in a building that kept its walls but lost a figure', () => {
    const before = flat()
    const after = renamedAndMoved({ ...before, walls: before.walls.map((w) => ({ ...w, height: 2.7 })) }, [0, 0], 0)
    const compared = compareBuildings(before, after)
    expect(compared.changes.map((c) => c.text)).toEqual([expect.stringMatching(/^9 walls height 2\.60 → 2\.70 m: /)])
    expect(compared.renamed.count).toBe(28)
  })
})

describe('walls drawn in other pieces (lab RT-8: the same flat with one wall per stretch)', () => {
  it('reads the outside wall cut in two where the rooms meet, either way, as the same building', () => {
    const before = flat()
    const south = before.walls.find((w) => w.id === 'ext-south')!
    const cutAt = 4.6
    const after: FloorPlan = {
      ...before,
      walls: [...before.walls.filter((w) => w.id !== 'ext-south'), { ...south, id: 'south-a', end: [cutAt, 0] }, { ...south, id: 'south-b', start: [south.end[0], 0], end: [cutAt, 0] }],
      openings: before.openings.map((o) => {
        if (o.wall !== 'ext-south') return o
        const middle = o.offset + o.width / 2
        return middle < cutAt ? { ...o, wall: 'south-a' } : { ...o, wall: 'south-b', offset: south.end[0] - o.offset - o.width }
      }),
      rooms: before.rooms.map((r) => ({ ...r, boundary: r.boundary.map((id) => (id !== 'ext-south' ? id : r.id === 'living' ? 'south-a' : 'south-b')) }))
    }
    expect(diffPlans(before, after).changes.length).toBeGreaterThan(0)
    for (const [a, b] of [[before, after], [after, before]] as const) {
      const compared = compareBuildings(a, b)
      expect(compared.changes).toEqual([])
      expect(compared.redrawn).toHaveLength(1)
    }
    expect(compareBuildings(before, after).verdict).toBe('Same building, 1 wall drawn as 2 pieces standing where it stood: every room, wall and opening stands where it stood.')
  })
})

describe('a one-number edit to a flat written rooms first (done-when 2, lab RT-8)', () => {
  const base = (): FloorPlan => written(roomsText())
  const wider = (): FloorPlan => written(roomsText().replace('living   4.4 x 4.2', 'living   4.7 x 4.2'))

  it('has at most two change lines, and says the kitchen door stayed where it was', () => {
    const [before, after] = [base(), wider()]
    // Today: 23 changes, the kitchen door "moved to another wall; moved 4.40 m along its wall".
    expect(diffPlans(before, after).changes.length).toBe(23)
    expect(diffPlans(before, after).changes.find((c) => c.entity.id === 'door-kitchen')?.summary).toContain('moved 4.40 m')

    const compared = compareBuildings(before, after)
    expect(compared.roomsFirst).toBe(true)
    expect(compared.changes.length).toBeLessThanOrEqual(2)
    expect(compared.changes.map((c) => c.text)).toEqual([
      '"Living room" 18.48 m² → 19.74 m² (4.40 × 4.20 m → 4.70 × 4.20 m)',
      '"Bedroom 1", "Hall", "Bathroom" and "Bedroom 2" moved 0.30 m east on the drawing, as they were'
    ])
    expect(compared.changes.some((c) => c.entities.some((e) => e.id === 'door-kitchen'))).toBe(false)
    expect(compared.stayed.find((s) => s.opening === 'door-kitchen')?.text).toBe(
      'Door "door-kitchen" stayed where it was, in "Hall" and "Kitchen", on the wall that replaced its own'
    )
    expect(compared.issues).toEqual([])
  })

  it('reads a room given another short name as the same room (RT-8: 10 changes today)', () => {
    const renamed = written(roomsText().replace(/\bbed1\b/g, 'study'))
    expect(diffPlans(base(), renamed).changes.length).toBeGreaterThan(0)
    const compared = compareBuildings(base(), renamed)
    expect(compared.changes).toEqual([])
    expect(compared.issues).toEqual([])
    expect(compared.renamed.pairs).toContainEqual({ type: 'room', before: 'bed1', after: 'study' })
  })

  it('keeps the scope check to the rooms named, and names what moved outside them', () => {
    const compared = compareBuildings(base(), wider(), { rooms: ['living'] })
    expect(compared.scope.checked).toBe(true)
    expect(compared.scope.outside.map((c) => c.text)).toEqual([expect.stringContaining('moved 0.30 m east')])
    expect(compared.verdict).toContain('1 change outside the rooms named ("living")')
  })

  it('marks for a picture what was removed, what was added and the room that grew', () => {
    const { marks } = compareBuildings(base(), wider())
    expect(marks.removed.walls).toContain('w-x4.6')
    expect(marks.added.walls).toEqual(expect.arrayContaining(['w-living-east', 'w-kitchen-hall']))
    expect(marks.changedRooms).toContainEqual({ room: 'living', label: 'Living room: 18.48 m² to 19.74 m²' })
  })
})

describe('a room list read as a ring (lab U-4)', () => {
  it('reads the same walls from another wall, or the other way round, as no change', () => {
    expect(sameRing(['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b'])).toBe(true)
    expect(sameRing(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])).toBe(true)
    expect(sameRing(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd'])).toBe(false)
    const before = flat()
    const after = { ...before, rooms: before.rooms.map((r) => (r.id === 'bed2' ? { ...r, boundary: [...r.boundary.slice(1), r.boundary[0]!] } : r)) }
    expect(diffPlans(before, after).changes).toEqual([])
    expect(compareBuildings(before, after).changes).toEqual([])
  })
})

describe('the issues, first', () => {
  it('names a door that now joins other rooms and a wall that now meets a window', () => {
    const before = flat()
    // A wall across Bedroom 2, from the hall to the outside wall, ending inside its window.
    const bed2 = before.openings.find((o) => o.id === 'win-bed2')!
    const host = before.walls.find((w) => w.id === bed2.wall)!
    const y = host.start[1] + bed2.offset + bed2.width / 2
    const after: FloorPlan = {
      ...before,
      walls: [...before.walls, { id: 'split', start: [6, y], end: [host.start[0], y], thickness: 0.1, height: 2.6, kind: 'interior' }]
    }
    const compared = compareBuildings(before, after)
    expect(compared.issues.map((i) => i.code)).toContain('opening_crossed')
    expect(compared.issues.find((i) => i.code === 'opening_crossed')!.message).toBe('Wall "split" now meets wall "ext-east" inside window "win-bed2"')
    expect(compared.verdict).toMatch(/^\d+ issues? to look at first\./)
  })

  it('says which notes of the drawing check came and went, following renamed ids', () => {
    const before = flat()
    const after = renamedAndMoved(before, [0, 0], 0)
    const note = (code: string, id: string): { code: string; thing: { kind: string; id: string }; also: string[]; message: string } => ({ code, thing: { kind: 'room', id }, also: [], message: `${code} on ${id}` })
    const compared = compareBuildings(before, after, { notes: { before: [note('room/too-small', 'bed2'), note('room/no-window', 'hall')], after: [note('room/too-small', 'room-6'), note('room/no-door', 'room-1')] } })
    expect(compared.issues.map((i) => [i.code, i.message])).toEqual([
      ['note_added', 'New note room/no-door: room/no-door on room-1'],
      ['note_gone', 'Note gone room/no-window: room/no-window on hall']
    ])
  })
})

describe('laying one version on the other', () => {
  it('pairs walls by place before id, and keeps a pair the other way round', () => {
    const before = flat()
    const after = renamedAndMoved(before, [0, 0], 0)
    const alignment = alignPlans(before, after)
    expect(alignment.walls.size).toBe(9)
    expect(alignment.openings.size).toBe(13)
    expect(alignment.rooms.size).toBe(6)
    expect(alignment.shift).toEqual([0, 0])
  })
})

describe('a door of another kind (CNT-14 with WRT-8)', () => {
  it('names the new kind and the part that opens on the door, under new ids too', () => {
    const before = flat()
    const door = before.openings.find((o) => o.type === 'door')!
    const after: FloorPlan = { ...before, openings: before.openings.map((o) => (o.id === door.id ? { ...o, kind: 'sliding' as const, opens: { width: 0.5 } } : o)) }
    const line = (plan: FloorPlan): string | undefined => compareBuildings(before, plan).changes.map((c) => c.text).find((t) => t.includes('now sliding'))
    expect(line(after)).toContain('part that opens the whole of it → 0.5')
    expect(line(renamedAndMoved(after, [3, -2]))).toContain('now sliding')
  })
})

/**
 * The flat with every point east of `line` moved `by` further east, as `grid_move_room_side`
 * moves it: an opening on a wall that grew at its start keeps its place in the building.
 */
function sideMovedEast(plan: FloorPlan, line: number, by: number): FloorPlan {
  const east = (p: readonly [number, number]): boolean => p[0] >= line
  const out = (p: readonly [number, number]): [number, number] => [east(p) ? p[0] + by : p[0], p[1]]
  const grewAtStart = new Set(plan.walls.filter((w) => east(w.start) && !east(w.end)).map((w) => w.id))
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, start: out(w.start), end: out(w.end) })),
    openings: plan.openings.map((o) => (grewAtStart.has(o.wall) ? { ...o, offset: o.offset + by } : o))
  }
}

describe('openings on a wall that moved (WRT-12)', () => {
  it('says the windows on a side moved 0.5 m east moved with their wall, and not that they stayed', () => {
    const before = flat()
    const after = sideMovedEast(before, 9, 0.5)
    const compared = compareBuildings(before, after)
    expect(compared.stayed).toEqual([])
    expect(compared.movedWith.map((m) => m.text)).toEqual([
      'Window "win-bath" moved with its wall, 0.50 m east on the drawing, in "Bathroom"',
      'Window "win-bed2" moved with its wall, 0.50 m east on the drawing, in "Bedroom 2"'
    ])
    expect(compared.movedWith[0]).toMatchObject({ opening: 'win-bath', with: 'wall' })
    expect(compared.movedWith[0]!.by[0]).toBeCloseTo(0.5, 6)
    expect(compared.movedWith[0]!.by[1]).toBeCloseTo(0, 6)
    expect(compared.verdict).toContain('2 openings moved with their walls')
    // They follow from the wall: no change line of their own.
    expect(compared.changes.some((c) => c.entities.some((e) => e.type === 'opening'))).toBe(false)
  })

  it('after a stretch north, says the entrance moved with its wall, and nothing of the openings on the walls that grew', () => {
    const before = flat()
    const north = (p: readonly [number, number]): [number, number] => [p[0], p[1] >= 7 ? p[1] + 0.5 : p[1]]
    // The west wall runs north to south: it grows at its start, so its windows keep their place by a longer offset.
    const after: FloorPlan = {
      ...before,
      walls: before.walls.map((w) => ({ ...w, start: north(w.start), end: north(w.end) })),
      openings: before.openings.map((o) => (o.wall === 'ext-west' ? { ...o, offset: o.offset + 0.5 } : o))
    }
    const compared = compareBuildings(before, after)
    expect(compared.movedWith.map((m) => m.text)).toEqual(['Door "door-entrance" moved with its wall, 0.50 m north on the drawing, in "Hall"'])
    // The walls that only grew at their north end carried nothing: their openings are not named at all.
    expect(compared.stayed).toEqual([])
    expect(compared.changes.some((c) => c.entities.some((e) => e.type === 'opening'))).toBe(false)
  })

  it('pairs a window whose wall moved and whose id changed with itself, by its place along the wall', () => {
    const before = flat()
    const moved = sideMovedEast(before, 9, 0.5)
    const after: FloorPlan = { ...moved, openings: moved.openings.map((o) => (o.wall === 'ext-east' ? { ...o, id: `${o.id}-new` } : o)) }
    const compared = compareBuildings(before, after)
    expect(compared.changes.map((c) => c.text).filter((t) => /Window (added|removed)/.test(t))).toEqual([])
    expect(compared.renamed.pairs).toContainEqual({ type: 'opening', before: 'win-bath', after: 'win-bath-new' })
    expect(compared.movedWith.map((m) => m.opening)).toEqual(['win-bath-new', 'win-bed2-new'])
  })

  it('marks a wall moved 2 cm and an opening widened as changed, not as added', () => {
    const before = flat()
    const after: FloorPlan = {
      ...before,
      walls: before.walls.map((w) => (w.id === 'spine' ? { ...w, start: [4.62, 0], end: [4.62, 7.6] } : w)),
      openings: before.openings.map((o) => (o.id === 'door-bed1' ? { ...o, width: 0.9 } : o))
    }
    const { marks } = compareBuildings(before, after)
    expect(marks.added).toEqual({ walls: [], openings: [], rooms: [] })
    expect(marks.removed).toEqual({ walls: [], openings: [], rooms: [] })
    expect(marks.changed.walls).toEqual(['spine'])
    expect(marks.changed.openings).toContain('door-bed1')
  })
})

describe('walls whose own figures changed (WRT-19)', () => {
  /** The flat written rooms first with outside walls 0.34 m thick. */
  const survey = (): FloorPlan => written(roomsText().replace('walls outside 0.3 ', 'walls outside 0.34 '))
  /** The same with some walls 0.30 m thick, on their centre lines. */
  const thinner = (plan: FloorPlan, ids: readonly string[]): FloorPlan => ({ ...plan, walls: plan.walls.map((w) => (ids.includes(w.id) ? { ...w, thickness: 0.3 } : w)) })

  it('lists a wall made thinner in a plan written rooms first, with both figures, and names it in the rooms that grew', () => {
    const before = survey()
    const compared = compareBuildings(before, thinner(before, ['ext-north']))
    expect(compared.roomsFirst).toBe(true)
    // Before: the rooms that grew, and no wall.
    expect(compared.changes.map((c) => c.text)).toContain('Wall "ext-north" thickness 0.34 → 0.30 m, by "Kitchen", "Hall" and "Bedroom 2"')
    expect(compared.changes.find((c) => c.text.startsWith('Wall "ext-north"'))?.entities).toEqual([{ type: 'wall', id: 'ext-north' }])
    const kitchen = compared.rooms.find((r) => r.room === 'kitchen')!
    expect(kitchen).toMatchObject({ status: 'changed', walls: ['ext-north'] })
    expect(kitchen.text).toMatch(/^"Kitchen" [\d.]+ m² → [\d.]+ m² \(.*\), because wall "ext-north" went from 0\.34 to 0\.30 m thick$/)
    expect(compared.rooms.find((r) => r.room === 'living')).toMatchObject({ status: 'unchanged', walls: [] })
    expect(compared.verdict).toContain('1 wall or opening change')
    expect(compared.sameBuilding).toBe(false)
  })

  it('says walls made thinner the same way as one cause', () => {
    const before = survey()
    const kitchen = compareBuildings(before, thinner(before, ['ext-north', 'ext-west'])).rooms.find((r) => r.room === 'kitchen')!
    expect(kitchen.walls).toEqual(['ext-north', 'ext-west'])
    expect(kitchen.text).toContain('because walls "ext-north" and "ext-west" went from 0.34 to 0.30 m thick')
  })

  it('is no longer the same building when every outside wall is thinner and the rooms kept their inside sizes', () => {
    const compared = compareBuildings(survey(), written(roomsText()))
    expect(compared.sameBuilding).toBe(false)
    expect(compared.changes.map((c) => c.text)).toEqual([
      expect.stringMatching(/^Wall "ext-east" .*thickness 0\.34 → 0\.30 m, by /),
      expect.stringMatching(/^Wall "ext-north" .*thickness 0\.34 → 0\.30 m, by /),
      expect.stringMatching(/^Wall "ext-south" .*thickness 0\.34 → 0\.30 m, by /),
      expect.stringMatching(/^Wall "ext-west" .*thickness 0\.34 → 0\.30 m, by /)
    ])
    // The rooms kept their sizes, so no wall is a cause.
    expect(compared.rooms.every((r) => r.status === 'unchanged' && r.walls.length === 0)).toBe(true)
  })

  it('lists a wall another height or kind in a plan written rooms first', () => {
    const before = survey()
    const after: FloorPlan = { ...before, walls: before.walls.map((w) => (w.id === 'w-hall-east' ? { ...w, height: 2.4, kind: 'partition' as const } : w)) }
    expect(compareBuildings(before, after).changes.map((c) => c.text)).toEqual(['Wall "w-hall-east" height 2.60 → 2.40 m; kind interior → partition, by "Hall", "Bathroom" and "Bedroom 2"'])
  })

  it('names a wall drawn wall by wall that was made thinner, or moved, in the rooms behind it', () => {
    const before = flat()
    const made = compareBuildings(before, { ...before, walls: before.walls.map((w) => (w.id === 'ext-south' ? { ...w, thickness: 0.26 } : w)) })
    expect(made.rooms.find((r) => r.room === 'living')).toMatchObject({ walls: ['ext-south'], text: expect.stringContaining('because wall "ext-south" went from 0.30 to 0.26 m thick') })
    expect(made.changes.map((c) => c.text)).toContain('Wall "ext-south" thickness 0.30 → 0.26 m, by "Living room" and "Bedroom 1"')
    const moved = compareBuildings(before, { ...before, walls: before.walls.map((w) => (w.id === 'spine' ? { ...w, start: [4.9, 0], end: [4.9, 7.6] } : w)) })
    expect(moved.rooms.find((r) => r.room === 'living')).toMatchObject({ walls: ['spine'], text: expect.stringContaining('because wall "spine" moved 0.30 m') })
    expect(moved.rooms.find((r) => r.room === 'bed1')).toMatchObject({ walls: ['spine'] })
  })

  it('names no wall for a room written wider: its walls followed the room', () => {
    const compared = compareBuildings(written(roomsText()), written(roomsText().replace('living   4.4 x 4.2', 'living   4.7 x 4.2')))
    expect(compared.rooms.every((r) => r.walls.length === 0)).toBe(true)
    expect(compared.changes.some((c) => c.entities.some((e) => e.type === 'wall'))).toBe(false)
  })
})
