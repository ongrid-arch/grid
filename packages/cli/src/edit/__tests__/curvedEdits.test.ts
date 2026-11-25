import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { surveyPlan } from '../../quantities/survey'

/**
 * CNT-22: an edit that does not touch a curved wall works on a plan that has one. Two bedrooms
 * share a straight wall; the hall north of them has a curved east wall, `hall-e`, and the study
 * west of the hall a half-round bay with a window kept from the study's west face. Merging the
 * bedrooms, or the study with the bedroom beside it, leaves the curves as they were; a merge that
 * would take out a curved wall is refused in words, and nothing is written.
 */

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })

const plan = {
  version: '1',
  units: 'm',
  walls: [
    // Two bedrooms, 4 × 3 m each, side by side, with the straight wall `mid` between them.
    wall('s1', [0, 0], [4, 0]),
    wall('s2', [4, 0], [8, 0]),
    wall('e', [8, 0], [8, 3]),
    wall('n1', [4, 3], [0, 3], { kind: 'interior' }),
    wall('n2', [8, 3], [4, 3], { kind: 'interior' }),
    wall('w', [0, 3], [0, 0]),
    wall('mid', [4, 0], [4, 3], { kind: 'interior', thickness: 0.1 }),
    // The hall north of them, its east side a half circle bulging east.
    wall('hall-e', [8, 3], [8, 6], { arc: { centre: [8, 4.5], sweep: 180 } }),
    wall('hall-n', [8, 6], [4, 6]),
    wall('hall-w', [4, 6], [4, 3], { kind: 'interior', thickness: 0.1 }),
    // The study west of the hall, its north side a half-round bay.
    wall('bay', [4, 6], [0, 6], { arc: { centre: [2, 6], sweep: 180 } }),
    wall('study-w', [0, 6], [0, 3]),
  ],
  rooms: [
    { id: 'bed-1', name: 'Bedroom 1', boundary: ['s1', 'mid', 'n1', 'w'], use: 'bedroom' },
    { id: 'bed-2', name: 'Bedroom 2', boundary: ['s2', 'e', 'n2', 'mid'], use: 'bedroom' },
    { id: 'hall', name: 'Hall', boundary: ['n2', 'hall-e', 'hall-n', 'hall-w'], use: 'circulation' },
    { id: 'study', name: 'Study', boundary: ['n1', 'hall-w', 'bay', 'study-w'], use: 'bedroom' },
  ],
  openings: [
    { id: 'd1', wall: 'mid', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 },
    { id: 'd2', wall: 'n2', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'd3', wall: 'hall-w', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 },
    { id: 'win', wall: 'bay', type: 'window', offset: 2.5, width: 1.2, sill: 0.9, height: 1.2, anchor: { from: 'west', room: 'study' } },
    { id: 'hall-win', wall: 'hall-e', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 },
  ],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': plan })
})
afterAll(() => b.close())

const written = (file: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(b.folder, file), 'utf8')))
const curves = (p: { walls: readonly unknown[] }): unknown[] => p.walls.filter((w) => (w as { arc?: unknown }).arc !== undefined).map((w) => JSON.stringify(w))
const before = curves(parseFloorPlan(plan))

describe('a curved wall an edit does not touch (CNT-22)', () => {
  it('merges two rooms that share a straight wall, with a curved wall elsewhere on the floor', async () => {
    const reply = await b.call('grid_merge_rooms', { room: 'bed-1', with: 'bed-2', out: 'beds.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toMatch(/no straight axis|is curved/)
    const after = written('beds.json')
    expect(after.walls.map((w) => w.id)).not.toContain('mid')
    expect(after.rooms.map((r) => r.id)).not.toContain('bed-2')
    expect(curves(after)).toEqual(before)
  })

  it('merges a room with a curved wall round it across the straight wall it shares', async () => {
    const reply = await b.call('grid_merge_rooms', { room: 'study', with: 'bed-1', out: 'study.json' })
    expect(reply.isError, reply.text).toBe(false)
    const after = written('study.json')
    const study = after.rooms.find((r) => r.id === 'study')!
    expect(study.boundary).toContain('bay')
    expect(after.walls.map((w) => w.id)).not.toContain('n1')
    expect(curves(after)).toEqual(before)
    // The window kept from the study's west face stays where it was on the bay.
    expect(after.openings.find((o) => o.id === 'win')!.offset).toBe(2.5)
    // The merged room is the study with its bay, the bedroom and the floor under the wall taken out.
    const area = (p: FloorPlan, id: string): number => surveyPlan(p).byId.get(id)!.facts.shape!.area
    const was = parseFloorPlan(plan)
    expect(area(after, 'study')).toBeCloseTo(area(was, 'study') + area(was, 'bed-1') + 0.2 * 3.8, 1)
    const areas = await b.call('grid_areas', { plan: 'study.json' })
    expect(areas.isError, areas.text).toBe(false)
  })

  it('stretches the plan with a window on an untouched curve kept from a room\'s face', async () => {
    const reply = await b.call('grid_stretch', { side: 'south', by: 0.5, through: 'bed-1', out: 'moved.json' })
    expect(reply.isError, reply.text).toBe(false)
    const after = written('moved.json')
    expect(curves(after)).toEqual(before)
    expect(after.openings.find((o) => o.id === 'win')!.offset).toBe(2.5)
  })

  it('refuses, in words, a merge that would take out a curved wall, and writes nothing', async () => {
    const round = {
      ...plan,
      walls: [...plan.walls, wall('nook-e', [4, 6], [4, 8.5]), wall('nook-n', [4, 8.5], [0, 8.5]), wall('nook-w', [0, 8.5], [0, 6])],
      rooms: [...plan.rooms, { id: 'nook', name: 'Nook', boundary: ['bay', 'nook-w', 'nook-n', 'nook-e'], use: 'bedroom' }],
    }
    const b2 = bench({ 'round.json': round })
    try {
      const reply = await b2.call('grid_merge_rooms', { plan: 'round.json', room: 'study', with: 'nook', out: 'nook.json' })
      expect(reply.isError).toBe(true)
      expect(reply.text).toContain('Wall "bay" is curved, and merging rooms changes straight walls only.')
      expect(reply.text).not.toMatch(/no straight axis|at .*\.ts/)
    } finally {
      b2.close()
    }
  })
})
