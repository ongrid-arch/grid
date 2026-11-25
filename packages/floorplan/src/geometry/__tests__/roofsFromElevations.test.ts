/**
 * LVL-15: a roof only where nothing of the building stands over a floor, worked out from the
 * floors' elevations rather than the order of `level`; a stepped floor roofed on its own walls.
 */
import { describe, expect, it } from 'vitest'
import { exterior, room } from '../../test-support/plans'
import { floorEnvelope, planEnvelope } from '../envelope'
import { planSection } from '../section'
import type { Floor, FloorPlan, Room, Wall } from '../plan'

/** A closed box of outside walls on a floor, `height` tall, with one room in it. */
function box(floor: string, x0: number, y0: number, x1: number, y1: number, height: number): { walls: Wall[]; room: Room } {
  const ids = ['s', 'e', 'n', 'w'].map((side) => `${floor}_${side}`)
  const walls = [
    exterior(ids[0]!, [x0, y0], [x1, y0], { floor, height }),
    exterior(ids[1]!, [x1, y0], [x1, y1], { floor, height }),
    exterior(ids[2]!, [x1, y1], [x0, y1], { floor, height }),
    exterior(ids[3]!, [x0, y1], [x0, y0], { floor, height })
  ]
  return { walls, room: room(`${floor}_room`, `Room ${floor}`, ids, floor) }
}

interface Storey {
  readonly floor: Floor
  readonly box: readonly [number, number, number, number]
  readonly walls: number
}

const storey = (floor: Floor & { readonly box: Storey['box']; readonly walls: number }): Storey => {
  const { box: outline, walls, ...rest } = floor
  return { floor: rest, box: outline, walls }
}

function planOf(given: readonly (Floor & { readonly box: Storey['box']; readonly walls: number })[], extra: Partial<FloorPlan> = {}): FloorPlan {
  const floors = given.map(storey)
  const parts = floors.map((f) => box(f.floor.id, ...f.box, f.walls))
  return {
    version: '1',
    units: 'm',
    openings: [],
    floors: floors.map((f) => f.floor),
    walls: parts.flatMap((p) => p.walls),
    rooms: parts.map((p) => p.room),
    ...extra
  }
}

const roofed = (plan: FloorPlan): Record<string, number | null> =>
  Object.fromEntries(planEnvelope(plan).floors.map((f) => [f.floor, f.roof === null ? null : Number(f.roof.area.toFixed(2))]))

const FRONT = [0, 0, 10, 5] as const
const BACK = [0, 5, 10, 10] as const
// Each half 10.2 × 5.2 to the outside faces of its 0.2 m walls.
const HALF = 10.2 * 5.2

/** A split-level house: the front half-levels at 0 and 2.8 m, the back ones at 1.4 and 4.2 m. */
function splitLevel(levels: readonly [number, number, number, number] = [0, 1, 2, 3]): FloorPlan {
  return planOf([
    { id: 'lowerFront', name: 'Lower front', level: levels[0], elevation: 0, box: FRONT, walls: 2.55 },
    { id: 'lowerBack', name: 'Lower back', level: levels[1], elevation: 1.4, box: BACK, walls: 2.55 },
    { id: 'upperFront', name: 'Upper front', level: levels[2], elevation: 2.8, box: FRONT, walls: 2.55 },
    { id: 'upperBack', name: 'Upper back', level: levels[3], elevation: 4.2, box: BACK, walls: 2.55 }
  ])
}

describe('a roof only where nothing stands over the floor', () => {
  it('roofs the two top half-levels of a split-level house and neither of the two they stand on', () => {
    const roofs = roofed(splitLevel())
    expect(roofs.lowerFront).toBeNull()
    expect(roofs.lowerBack).toBeNull()
    // The upper front has nothing over it but the upper back's wall along their edge, 0.2 m of it.
    expect(roofs.upperFront).toBeCloseTo(HALF - 10.2 * 0.2, 2)
    expect(roofs.upperBack).toBeCloseTo(HALF, 2)
    const lower = floorEnvelope(splitLevel(), 'lowerFront')!
    expect(lower).toMatchObject({ roofKnown: true, why: null })
    expect(lower.slab!.kind).toBe('base')
  })

  it('reads the elevations, whatever order `level` gives the half-levels', () => {
    const roofs = roofed(splitLevel([0, 2, 1, 3]))
    expect(roofs.lowerFront).toBeNull()
    expect(roofs.lowerBack).toBeNull()
    expect(roofs.upperFront).not.toBeNull()
    expect(roofs.upperBack).not.toBeNull()
  })

  it('names the floor that took each part of a roof off', () => {
    const plan = planOf([
      { id: 'ground', name: 'Ground', level: 0, box: [0, 0, 10, 8], walls: 2.7 },
      { id: 'first', name: 'First', level: 1, box: [0, 0, 5, 8], walls: 2.7 }
    ])
    const roof = floorEnvelope(plan, 'ground')!.roof!
    expect(roof.under).toEqual(['first'])
    expect(roof.area).toBeCloseTo(10.2 * 8.2 - 5.2 * 8.2, 6)
  })

  it('labels a roof in the section only over each top half-level, never under a floor', () => {
    const section = planSection(splitLevel(), { from: { x: 5, y: -2 }, to: { x: 5, y: 12 }, toward: 'left' })
    expect(section.roofs.map((r) => r.floor).sort()).toEqual(['upperBack', 'upperFront'])
    expect(section.parts.filter((p) => p.kind === 'roof').map((p) => p.floor).sort()).toEqual(['upperBack', 'upperFront'])
  })

  it('roofs only the top deck of each side of a half-level car park', () => {
    // Decks 2.4 m clear, 2.9 m apart on each side, the east side half a level up: the deck over a
    // west deck is the next west one, two places on in `level`, and stands above its clear height.
    const decks = [0, 1, 2, 3, 4, 5].map((level) => {
      const west = level % 2 === 0
      return { id: `${west ? 'west' : 'east'}${Math.floor(level / 2)}`, name: `Deck ${level}`, level, elevation: level * 1.45, box: (west ? [0, 0, 15, 30] : [15, 0, 30, 30]) as [number, number, number, number], walls: 2.4 }
    })
    const roofs = roofed(planOf(decks))
    expect(Object.entries(roofs).filter(([, area]) => area !== null).map(([floor]) => floor).sort()).toEqual(['east2', 'west2'])
  })

  it('lays no roof over a basement under the garden, below the ground', () => {
    const plan = planOf(
      [
        { id: 'basement', name: 'Basement', level: -1, elevation: -2.8, box: [0, 0, 10, 16], walls: 2.55 },
        { id: 'ground', name: 'Ground', level: 0, elevation: 0, box: [0, 0, 10, 8], walls: 2.7 }
      ],
      { site: { ground: 0 } } as Partial<FloorPlan>
    )
    expect(roofed(plan).basement).toBeNull()
    const section = planSection(plan, { from: { x: 5, y: -2 }, to: { x: 5, y: 18 }, toward: 'left' })
    expect(section.roofs.map((r) => r.floor)).toEqual(['ground'])
  })
})

describe('a stepped floor roofed on its own walls', () => {
  // Two steps of one level: the upper one 0.6 m higher, with walls 0.6 m lower, so both tops align.
  const stepped = (upper: Partial<Floor> = {}): FloorPlan =>
    planOf([
      { id: 'low', name: 'Low step', level: 0, elevation: 0, box: [0, 0, 6, 8], walls: 3 },
      { id: 'high', name: 'High step', level: 0, elevation: 0.6, box: [6, 0, 12, 8], walls: 2.4, ...upper }
    ])

  it('lays each step\'s roof on the tops of its own walls', () => {
    const plan = stepped()
    expect(floorEnvelope(plan, 'low')!.roof!.bottom).toBeCloseTo(3, 9)
    const high = floorEnvelope(plan, 'high')!.roof!
    expect(high.bottom).toBeCloseTo(0.6 + 2.4, 9)
    expect(high.facets[0]!.plane.z0).toBeCloseTo(2.4, 9)
  })

  it('keeps the height a step states', () => {
    const high = floorEnvelope(stepped({ height: 2.8 }), 'high')!.roof!
    expect(high.bottom).toBeCloseTo(0.6 + 2.8, 9)
  })
})
