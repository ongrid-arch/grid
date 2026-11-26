/**
 * CNT-44: a room filled with one library entry at a pitch. The counts are worked out by hand for
 * a room 10 × 6 m inside (walls 0.2 m thick on the lines x 0 and 10.2, y 0 and 6.2) and Grid's
 * desk, 1.20 × 0.60 m with 0.75 m clear in front, so a module 1.20 × 1.35 m.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { planLibrary } from '@ongrid/floorplan/library'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../../quantities/survey'
import { readingAfter } from '../edits'
import { fillRoom, type FillRequest } from '../fill'
import { EditRefused } from '../refused'

interface Extra {
  count: number
  items: number
  placed: string[]
  rows: number
  perRow: number
  turn: number
  leftOver: { alongRows: number; acrossRows: number }
  givenUp: { door: number; column: number; item: number; shape: number; checks: number }
  perModule: number | null
  removed: number
}

function office(extra: Record<string, unknown> = {}): FloorPlan {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.8, kind: 'exterior' })
  return parseFloorPlan({
    version: '1',
    walls: [wall('s', [0, 0], [10.2, 0]), wall('e', [10.2, 0], [10.2, 6.2]), wall('n', [10.2, 6.2], [0, 6.2]), wall('w', [0, 6.2], [0, 0])],
    rooms: [{ id: 'office', name: 'Office', boundary: ['s', 'e', 'n', 'w'], use: 'office' }],
    openings: [],
    ...extra,
  })
}

function fill(plan: FloorPlan, request: Partial<FillRequest> = {}) {
  const patch = fillRoom(surveyPlan(plan), planLibrary(plan), { room: 'office', name: 'desk', ...request })
  return { patch, extra: patch.extra as unknown as Extra, after: readingAfter(plan, patch) }
}

describe('filling a room with desks at a pitch', () => {
  it('fits the count worked out by hand, side by side with Grid\'s own aisle, and says what is left over', () => {
    const { patch, extra, after } = fill(office(), { turn: 0 })
    // Along 10 m: 8 desks of 1.20 m (0.40 m over). Across 6 m: rows 1.35 + 0.90 apart, 3 of them (0.15 m over).
    expect(extra).toMatchObject({ count: 24, rows: 3, perRow: 8, turn: 0 })
    expect(extra.leftOver.alongRows).toBeCloseTo(0.4)
    expect(extra.leftOver.acrossRows).toBeCloseTo(0.15)
    expect(extra.perModule).toBeCloseTo(60 / 24)
    expect(extra.placed[0]).toBe('desk-1')
    expect(extra.placed[23]).toBe('desk-24')
    expect(patch.guessed?.join(' ')).toContain('an aisle of 0.90 m between the rows, Grid\'s own figure')
    expect(patch.said.join('\n')).toContain('24 "desk" (1.20 × 0.60 m with 0.75 m clear in front) fit in room "Office": 3 rows, at most 8 a row')
    expect(patch.said.join('\n')).toContain('Left over past the modules: 0.40 m along the rows and 0.15 m across them.')
    // Every desk is clear of Grid's own checks.
    const ids = new Set(extra.placed)
    expect(validatePlan(after).issues.filter((issue) => ids.has(issue.id))).toEqual([])
    expect(after.items?.every((item) => item.library === 'desk' && item.size[0] === 1.2)).toBe(true)
  })

  it('keeps the person\'s pitch and aisle, and with no turn keeps the turn that fits most', () => {
    // 1.60 m pitch, 1.20 m aisle: turned 0, 6 a row and 2 rows; turned 90, 4 a row and 4 rows.
    expect(fill(office(), { turn: 0, pitch: 1.6, aisle: 1.2 }).extra).toMatchObject({ count: 12, rows: 2, perRow: 6 })
    const { patch, extra } = fill(office(), { pitch: 1.6, aisle: 1.2 })
    expect(extra).toMatchObject({ count: 16, rows: 4, perRow: 4, turn: 90 })
    expect(patch.guessed).toEqual(['0 m kept clear of the walls; give wall_clearance for a way round the edge.', '1.20 m kept clear in front of each door, Grid\'s own figure, not a code\'s; give door_clearance for yours.'])
  })

  it('sets rows back to back in pairs, and keeps a wall clearance', () => {
    // Pairs 2.70 m deep, 3.60 m apart: turned 90, 5 a row and 3 pairs across the 10 m.
    expect(fill(office(), { backToBack: true }).extra).toMatchObject({ count: 30, rows: 6, perRow: 5 })
    // 0.50 m from the walls: 9 × 5 m to fill, 7 a row and 2 rows.
    expect(fill(office(), { turn: 0, wallClearance: 0.5 }).extra).toMatchObject({ count: 14, rows: 2, perRow: 7 })
  })

  it('keeps the floor in front of a door clear, and stands clear of a column and an item already there', () => {
    const door = { openings: [{ id: 'd1', wall: 's', type: 'door', offset: 4.6, width: 0.9, height: 2.1 }] }
    const withDoor = fill(office(door), { turn: 0 })
    expect(withDoor.extra.count).toBe(22)
    expect(withDoor.extra.givenUp.door).toBe(2)
    expect(withDoor.patch.said.join('\n')).toContain('Places given up: 2 to the floor kept in front of a door.')
    const column = fill(office({ columns: [{ id: 'c1', shape: 'square', width: 0.4, at: [5.1, 3.1] }] }), { turn: 0 })
    expect(column.extra.count).toBeLessThan(24)
    expect(column.extra.givenUp.column).toBeGreaterThan(0)
    const sofa = fill(office({ items: [{ id: 'sofa', library: 'sofa-3', at: [5.1, 3.1] }] }), { turn: 0 })
    expect(sofa.extra.givenUp.item).toBeGreaterThan(0)
    const ids = new Set(sofa.extra.placed)
    expect(validatePlan(sofa.after).issues.filter((issue) => ids.has(issue.id) || ((issue as { hits?: string[] }).hits ?? []).some((hit) => ids.has(hit)))).toEqual([])
  })

  it('stops at the count asked, and says how many short', () => {
    const some = fill(office(), { turn: 0, count: 10 })
    expect(some.extra.count).toBe(10)
    expect(some.patch.said.join('\n')).toContain('Placed the first 10, as asked; 14 more fit.')
    const many = fill(office(), { turn: 0, count: 30 })
    expect(many.extra.count).toBe(24)
    expect(many.patch.said.join('\n')).toContain('You asked for 30: 6 short at this set-out.')
  })

  it('places a table and its chairs as one module, its items numbered in the group', () => {
    const { extra, after } = fill(office(), { name: 'table-4-chairs', group: 'cafe', turn: 0 })
    // Sets 1.20 × 1.80 m: 8 a row, rows 2.70 m apart, 2 rows (and room for no third).
    expect(extra).toMatchObject({ count: 16, items: 80 })
    expect(extra.placed.slice(0, 5)).toEqual(['cafe-1-1', 'cafe-1-2', 'cafe-1-3', 'cafe-1-4', 'cafe-1-5'])
    expect(after.items?.filter((item) => item.kind === 'chair')).toHaveLength(64)
    const ids = new Set(extra.placed)
    expect(validatePlan(after).issues.filter((issue) => ids.has(issue.id))).toEqual([])
  })

  it('refuses a pitch narrower than the module, a name no library holds and a taken id', () => {
    expect(() => fill(office(), { pitch: 1 })).toThrow(EditRefused)
    expect(() => fill(office(), { name: 'dsk' })).toThrow('Did you mean "desk"?')
    expect(() => fill(office({ items: [{ id: 'desk-3', library: 'chair', at: [9.5, 5.5] }] }), { turn: 0 })).toThrow('The plan already holds the group "desk": 1 item ("desk-3" the first).')
    expect(() => fill(office({ columns: [{ id: 'desk-2', shape: 'square', width: 0.2, at: [9.9, 5.9] }] }), { turn: 0 })).toThrow('The id "desk-2" the group "desk" would give is taken by column "desk-2"')
  })

  it('takes the group\'s earlier items out when it fills again', () => {
    const plan = office()
    const first = fill(plan, { turn: 0 })
    const again = fill(first.after, { turn: 0, pitch: 1.6, replace: true })
    expect(again.extra.removed).toBe(24)
    expect(again.after.items?.length).toBe(again.extra.count)
  })
})
