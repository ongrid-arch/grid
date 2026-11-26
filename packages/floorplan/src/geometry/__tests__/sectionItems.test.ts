/**
 * CNT-48: fixtures and furniture in a section. The line cuts each item it crosses as the blocks the
 * 3D view stands it as, on the floor of its room, apart from the walls' and slabs' solid cut; the
 * items beyond it are seen. A kitchen cut through its island shows the island, and the run beyond.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { planSection, type SectionLine } from '../section'

function written(text: readonly string[]): FloorPlan {
  const result = compileRoomsText(text.join('\n'))
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}

const KITCHEN = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'room kitchen "Kitchen" kitchen 5 x 4 at 0,0',
  'item run kitchen-run-3000 in kitchen against north, at west',
  'item island kitchen-run 1.8 x 0.9 at 2.5,1.6',
]
const bare = written(KITCHEN.slice(0, 2))
const kitchen = written(KITCHEN)
// Across the room, through the island's middle, looking north toward the run.
const THROUGH_ISLAND: SectionLine = { from: { x: -1, y: 1.6 }, to: { x: 6, y: 1.6 }, toward: 'left' }

const span = (rings: readonly (readonly { x: number; y: number }[])[]) => {
  const xs = rings.flat().map((p) => p.x)
  const ys = rings.flat().map((p) => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

describe('a section through a kitchen island', () => {
  const section = planSection(kitchen, THROUGH_ISLAND)

  it('cuts the island as wide and as high as it stands', () => {
    const island = section.items.find((p) => p.id === 'island')
    expect(island?.kind).toBe('item')
    const box = span(island!.rings)
    // The island's middle is 2.5 m along the plan, 3.5 m from the line's start; 1.8 m wide.
    expect(box.x0).toBeCloseTo(3.5 - 0.9, 2)
    expect(box.x1).toBeCloseTo(3.5 + 0.9, 2)
    expect(box.y0).toBeCloseTo(0, 6)
    expect(box.y1).toBeCloseTo(0.9, 2)
  })

  it('does not cut the run against the north wall, and sees it beyond', () => {
    expect(section.items.map((p) => p.id)).toEqual(['island'])
    expect(section.beyond.some((face) => face.kind === 'item' && face.id === 'run')).toBe(true)
  })

  it('leaves the cut of the walls and slabs as it is without the items', () => {
    const without = planSection(bare, THROUGH_ISLAND)
    expect(section.cut).toEqual(without.cut)
    expect(section.parts).toEqual(without.parts)
    expect(section.parts.some((p) => (p.kind as string) === 'item')).toBe(false)
  })

  it('cuts nothing of an item that the line misses', () => {
    const past = planSection(kitchen, { from: { x: -1, y: 0.3 }, to: { x: 6, y: 0.3 }, toward: 'right' })
    expect(past.items).toEqual([])
  })
})

describe('an item in a raised room', () => {
  const plan = written([
    'walls outside 0.3 inside 0.1 height 2.7',
    'room a "Living" living 4 x 4 at 0,0',
    'item t dining-table-4 at 2,2',
  ])
  const raised: FloorPlan = { ...plan, rooms: plan.rooms.map((room) => ({ ...room, floorOffset: 0.45 })) }

  it('stands on that room\'s floor', () => {
    const cut = planSection(raised, { from: { x: -1, y: 2 }, to: { x: 5, y: 2 }, toward: 'left' }).items.find((p) => p.id === 't')!
    const box = span(cut.rings)
    expect(box.y0).toBeGreaterThanOrEqual(0.45 - 1e-6)
    expect(box.y1).toBeCloseTo(0.45 + 0.75, 2)
  })
})
