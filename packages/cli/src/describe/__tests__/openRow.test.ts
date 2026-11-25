/**
 * VEW-53: one dividing line along a row of bays leaves every bay open to the corridor, not
 * only the bay at the middle of the line.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { describeText } from '../card'
import { planFacts } from '../facts'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'interior', ...extra })
const bay = (n: number): Record<string, unknown>[] => [wall(`d${n}`, [n * 3, 0], [n * 3 + 3, 0], { virtual: true, thickness: 0, height: 0 })]

/** A corridor 9 × 2 along the south of three bays, each 3 × 4, split by walls; one dividing line between. */
const PLAN = {
  version: '1',
  units: 'm',
  walls: [
    wall('line', [0, 2], [9, 2], { virtual: true, thickness: 0, height: 0 }),
    wall('c-s', [0, 0], [9, 0], { kind: 'exterior' }),
    wall('c-e', [9, 0], [9, 2], { kind: 'exterior' }),
    wall('c-w', [0, 2], [0, 0], { kind: 'exterior' }),
    wall('b-e', [9, 2], [9, 6], { kind: 'exterior' }),
    wall('b-n', [9, 6], [0, 6], { kind: 'exterior' }),
    wall('b-w', [0, 6], [0, 2], { kind: 'exterior' }),
    wall('p1', [3, 2], [3, 6]),
    wall('p2', [6, 2], [6, 6]),
  ],
  rooms: [
    { id: 'corr', name: 'Corridor', boundary: ['c-s', 'c-e', 'line', 'c-w'], use: 'corridor' },
    { id: 'b1', name: 'Bay 1', boundary: ['line', 'p1', 'b-n', 'b-w'] },
    { id: 'b2', name: 'Bay 2', boundary: ['line', 'p2', 'b-n', 'p1'] },
    { id: 'b3', name: 'Bay 3', boundary: ['line', 'b-e', 'b-n', 'p2'] },
  ],
  openings: [],
}

describe('a dividing line along a row of bays', () => {
  it('lists every bay as open to the corridor, and none as merely next to it', () => {
    const facts = planFacts(parseFloorPlan(PLAN))
    const rooms = facts.floors[0]!.openSides.map((side) => [...side.rooms].sort().join('|')).sort()
    expect(rooms).toEqual(['b1|corr', 'b2|corr', 'b3|corr'])
    const text = describeText(facts, 'rooms', 'person')
    expect(text.split('\n').filter((l) => l.includes('Corridor') && l.includes('next to'))).toEqual([])
    for (const name of ['Bay 1', 'Bay 2', 'Bay 3']) expect(text).toContain(name)
    const agent = describeText(facts, 'rooms', 'agent')
    expect(agent).toMatch(/^corr .*line v>b1/m)
    expect(agent).toMatch(/^corr .*line v>b2/m)
    expect(agent).toMatch(/^corr .*line v>b3/m)
    expect(agent.split('\n').find((l) => l.startsWith('corr '))).not.toContain('| next')
  })
})
