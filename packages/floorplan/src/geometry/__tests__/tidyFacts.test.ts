/**
 * CNT-9: `grid tidy`'s fixes keep the facts of the person's own. Taking out a copy of a wall
 * moves the copy's facts onto the wall kept, where it has none of that name; splitting a room
 * along a wall that crosses it gives both parts the room's facts, and its number stays with the
 * room. The plans are MSG-12's.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { Wall } from '../plan'
import { tidyPlan } from '../wallFaults'
import { outline, type Point } from '../../test-support/outline'

const wall = (id: string, start: Point, end: Point, extra: Partial<Wall> = {}): Wall => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'interior', ...extra })

describe('tidy keeps the facts (CNT-9)', () => {
  it('moves the facts of a copy of a wall onto the wall kept, the kept wall\'s own winning', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const first = { ...walls[0]!, properties: { 'fire rating': 'EI 30' } }
    const copy = { ...walls[0]!, id: 'copy', properties: { 'Fire rating': 'EI 60', acoustic: 45 } }
    const plan = parseFloorPlan({ walls: [first, ...walls.slice(1), copy], rooms: [room] })
    const result = tidyPlan(plan)
    expect(result.applied[0]!.message).toContain('and giving wall "w1" the facts of its own it carries.')
    const tidied = result.plan
    expect(tidied.walls.map((w) => w.id)).not.toContain('copy')
    expect(tidied.walls.find((w) => w.id === first.id)!.properties).toEqual({ 'fire rating': 'EI 30', acoustic: 45 })
  })

  it('takes out a copy that carries no facts exactly as before', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const plan = parseFloorPlan({ walls: [...walls, { ...walls[0]!, id: 'copy' }], rooms: [room] })
    const tidied = tidyPlan(plan)
    expect(tidied.applied.flatMap((f) => f.fix!.edits)).toContainEqual({ op: 'remove-wall', wall: 'copy' })
    expect(tidied.plan.walls[0]).not.toHaveProperty('properties')
  })

  it('splits a room along a wall across it into two parts that both keep its facts, its number staying with it', () => {
    const plan = parseFloorPlan({
      walls: [
        wall('s', [0, 0], [6.4, 0], { kind: 'exterior' }),
        wall('e', [6.4, 0], [6.4, 3.2], { kind: 'exterior' }),
        wall('n', [6.4, 3.2], [0, 3.2], { kind: 'exterior' }),
        wall('w', [0, 3.2], [0, 0], { kind: 'exterior' }),
        wall('mid', [3.2, 0], [3.2, 3.2]),
        wall('stray', [4.8, 0], [4.8, 3.2], { thickness: 0.1, kind: 'partition' }),
      ],
      rooms: [
        { id: 'hall', name: 'Hall', boundary: ['s', 'mid', 'n', 'w'], use: 'living' },
        { id: 'bed', name: 'Bedroom', number: '1.02', boundary: ['s', 'e', 'n', 'mid'], use: 'bedroom', properties: { department: 'Sales', 'head count': 2 } },
      ],
      openings: [{ id: 'bed-door', wall: 'mid', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
    })
    const tidied = tidyPlan(plan).plan
    const bed = tidied.rooms.find((r) => r.id === 'bed')!
    const part = tidied.rooms.find((r) => r.id === 'bed-2')!
    expect(bed.properties).toEqual({ department: 'Sales', 'head count': 2 })
    expect(part.properties).toEqual({ department: 'Sales', 'head count': 2 })
    expect(bed.number).toBe('1.02')
    expect(part.number).toBeUndefined()
  })
})
