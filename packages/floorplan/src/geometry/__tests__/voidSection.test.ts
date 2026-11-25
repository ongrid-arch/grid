/**
 * VEW-34: a room under a void is as high, in section, as the space over it: up through the void
 * to the slab or roof over the void's floor, not its own storey's ceiling.
 */
import { describe, expect, it } from 'vitest'
import { edit, exterior, room, twoFloorHouse, wall } from '../../test-support/plans'
import type { FloorPlan, Room, Wall } from '../plan'
import { planSection, type SectionLine } from '../section'

/** The two-floor house with its landing (x 0 to 5 on the first floor) marked as a void. */
const voidHouse = (): FloorPlan =>
  edit(twoFloorHouse(), (p) => {
    p.rooms = p.rooms.map((r) => (r.id === 'landing' ? { ...r, void: true } : r))
    p.openings = p.openings.filter((o) => o.id !== 'd_up')
  })

/** Across the house at x 2, south to north, looking west: the hall and the bedroom, under the landing. */
const UNDER: SectionLine = { from: { x: 2, y: -2 }, to: { x: 2, y: 10 }, toward: 'left' }

describe('a room under a void, in section', () => {
  // Walls 2.70 m, slabs 0.25 m: the first floor stands at 2.95 m and its roof's underside at 5.65 m.
  const section = planSection(voidHouse(), UNDER)

  it('is labelled with its height up through the void to the roof over it', () => {
    const hall = section.rooms.find((r) => r.room === 'hall')!
    const bedroom = section.rooms.find((r) => r.room === 'bedroom')!
    expect(hall.height).toBeCloseTo(5.65, 6)
    expect(bedroom.height).toBeCloseTo(5.65, 6)
    expect(hall.through).toEqual(['landing'])
    expect(hall.heightStated).toBe(false)
  })

  it('leaves out the void, which has no floor of its own', () => {
    expect(section.rooms.map((r) => r.room)).toEqual(['hall', 'bedroom'])
  })

  it('says it drew the rooms up through the void, and not up to their storey', () => {
    const notes = section.assumed.filter((a) => a.kind === 'room-height')
    expect(notes.map((n) => n.words)).toEqual(['2 rooms cut stand under a void and state no height, so each is drawn up through it to what is over it: "Hall", "Bedroom".'])
    expect(notes[0]!.ids).toEqual(['hall', 'bedroom'])
  })

  it('keeps a height the room states', () => {
    const stated = edit(voidHouse(), (p) => {
      p.rooms = p.rooms.map((r) => (r.id === 'hall' ? { ...r, height: 3 } : r))
    })
    const hall = planSection(stated, UNDER).rooms.find((r) => r.room === 'hall')!
    expect(hall.height).toBe(3)
    expect(hall.through).toBeUndefined()
  })

  it('is as before where no void is over it', () => {
    const plain = planSection(twoFloorHouse(), UNDER)
    expect(plain.rooms.find((r) => r.room === 'hall')!.height).toBeCloseTo(2.7, 6)
    expect(plain.rooms.find((r) => r.room === 'landing')).toBeDefined()
  })
})

/** One 10 x 8 room on the ground floor; over it, on each upper floor, a void from x 0 to `split` and a gallery past it. */
function galleryHouse(split: number, voidFloors = 1): FloorPlan {
  const walls: Wall[] = []
  const rooms: Room[] = []
  const floorIds = ['ground', 'first', 'second'].slice(0, voidFloors + 1)
  for (const [i, floor] of floorIds.entries()) {
    const f = (id: string): string => `${floor}-${id}`
    walls.push(
      exterior(f('s'), [0, 0], [10, 0], { floor }),
      exterior(f('e'), [10, 0], [10, 8], { floor }),
      exterior(f('n'), [10, 8], [0, 8], { floor }),
      exterior(f('w'), [0, 8], [0, 0], { floor })
    )
    if (i === 0) {
      rooms.push(room('living', 'Living room', [f('s'), f('e'), f('n'), f('w')], floor))
      continue
    }
    walls.push(
      exterior(f('s1'), [0, 0], [split, 0], { floor }),
      exterior(f('s2'), [split, 0], [10, 0], { floor }),
      exterior(f('n1'), [10, 8], [split, 8], { floor }),
      exterior(f('n2'), [split, 8], [0, 8], { floor }),
      wall(f('edge'), [split, 0], [split, 8], { floor, virtual: true, thickness: 0 })
    )
    // The outside walls in two pieces at the split, so each room is bounded by its own.
    walls.splice(walls.findIndex((w) => w.id === f('s')), 1)
    walls.splice(walls.findIndex((w) => w.id === f('n')), 1)
    rooms.push({ ...room(f('void'), 'Void', [f('s1'), f('edge'), f('n2'), f('w')], floor), void: true })
    rooms.push(room(f('gallery'), 'Gallery', [f('s2'), f('e'), f('n1'), f('edge')], floor))
  }
  return {
    version: '1',
    units: 'm',
    floors: floorIds.map((id, level) => ({ id, name: id, level })),
    walls,
    rooms,
    openings: []
  }
}

/** Along the house at y 4, west to east, looking north. */
const ALONG: SectionLine = { from: { x: -2, y: 4 }, to: { x: 12, y: 4 }, toward: 'left' }

describe('a room under a void over part of it', () => {
  it('rises through the void when the void is over most of it, its label in the tall part', () => {
    const living = planSection(galleryHouse(6), ALONG).rooms.find((r) => r.room === 'living')!
    expect(living.height).toBeCloseTo(5.65, 6)
    expect(living.through).toEqual(['first-void'])
    // The label stands under the void: from the west wall's inside face to the split.
    expect(living.to - living.from).toBeCloseTo(5.9, 6)
  })

  it('keeps its storey\'s height when the gallery is over most of it', () => {
    const section = planSection(galleryHouse(3), ALONG)
    const living = section.rooms.find((r) => r.room === 'living')!
    expect(living.height).toBeCloseTo(2.7, 6)
    expect(living.through).toBeUndefined()
    expect(section.rooms.some((r) => r.room === 'first-void')).toBe(true)
  })

  it('rises through voids one over the other, to the roof over the top one', () => {
    // Floors at 0, 2.95 and 5.90: the second floor's roof's underside at 8.60.
    const section = planSection(galleryHouse(6, 2), ALONG)
    const living = section.rooms.find((r) => r.room === 'living')!
    expect(living.height).toBeCloseTo(8.6, 6)
    expect(living.through).toEqual(['first-void', 'second-void'])
    expect(section.rooms.map((r) => r.room)).toEqual(['living', 'first-gallery', 'second-gallery'])
  })
})
