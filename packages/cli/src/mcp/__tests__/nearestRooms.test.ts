import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan'
import '../serveTools'
import { floorArg, roomArg, wallArg } from '../toolkit'

/** CMD-21: a wrong room, wall or floor id is answered with the nearest ids, not the plan's first. */

function plan(): FloorPlan {
  const rooms = Array.from({ length: 400 }, (_, i) => ({ id: `room-${100 + i}`, name: `Room ${100 + i}`, floor: 'f1' }))
  const walls = Array.from({ length: 100 }, (_, i) => ({ id: `wall-${i}` }))
  return { rooms, walls, floors: [{ id: 'f1' }, { id: 'level3' }] } as unknown as FloorPlan
}

function refusal(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('not refused')
}

describe('a wrong id is answered with the nearest ids', () => {
  it('names the room a floor prefix hides, first, from among hundreds', () => {
    const text = refusal(() => roomArg(plan(), 'f3-room-310'))
    expect(text).toMatch(/Its nearest rooms: "room-310" \("Room 310"\)/)
    expect(text).toContain('and 395 more')
    expect(text).not.toContain('"room-100"')
  })

  it('gives five rooms near a far-off id, never the first thirty', () => {
    const text = refusal(() => roomArg(plan(), 'atrium'))
    expect(text.match(/"room-\d+" \(/g)).toHaveLength(5)
  })

  it('does the same for walls and floors', () => {
    expect(refusal(() => wallArg(plan(), 'x'))).toMatch(/Its nearest walls: (?:"wall-\d+"(?:, )?){5} and 95 more/)
    expect(refusal(() => floorArg(plan(), 'level-3'))).toContain('The nearest known id is "level3".')
  })
})
