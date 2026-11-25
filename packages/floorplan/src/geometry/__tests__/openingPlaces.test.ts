import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { wallEndInOpening } from '../openingPlaces'
import { door, exterior, flat, room, wall, window_ } from '../../test-support/plans'

const PLACE = /^(opening\/(crosses-wall|fills-wall|on-dividing-line|window-between-rooms)|wall\/ends-in-opening)$/

const placeIssues = (plan: FloorPlan) =>
  validatePlan(plan)
    .issues.filter((i) => PLACE.test(i.code))
    .map((i) => ({ code: i.code, entity: i.entity, id: i.id, severity: i.severity, hits: (i as { hits?: readonly string[] }).hits }))

/** A 4 × 3 m room with 0.3 m outside walls, as the lab's MS-8 rooms are drawn. */
function box(openings: Opening[], extra: { walls?: Wall[] } = {}): FloorPlan {
  const thick = { thickness: 0.3 }
  return {
    version: '1',
    units: 'm',
    walls: [
      exterior('s', [0, 0], [4, 0], thick),
      exterior('e', [4, 0], [4, 3], thick),
      exterior('n', [4, 3], [0, 3], thick),
      exterior('w', [0, 3], [0, 0], thick),
      ...(extra.walls ?? [])
    ],
    rooms: [room('r', 'Room', ['s', 'e', 'n', 'w'])],
    openings
  }
}

describe('where each opening stands (MSG-16)', () => {
  it('says nothing of openings clear of every wall that meets theirs', () => {
    expect(placeIssues(box([door('d', 's', 1.5), window_('win', 'n', 1.4)]))).toEqual([])
    expect(placeIssues(flat())).toEqual([])
  })

  it('MS-8 names a window 0.1 m from a corner, and says which offsets keep it clear', () => {
    const plan = box([window_('win', 'n', 0.1)])
    expect(placeIssues(plan)).toEqual([{ code: 'opening/crosses-wall', entity: 'opening', id: 'win', severity: 'warning', hits: ['e', 'n'] }])
    const said = validatePlan(plan).issues.find((i) => i.code === 'opening/crosses-wall')!.message
    expect(said).toBe(
      'Window "win" on wall "n" runs 0.05 m into wall "e", which meets it there: it is cut through its own wall only, ' +
        'so wall "e" stands across it. An offset from 0.15 to 2.65 m keeps it clear.'
    )
  })

  it('MS-8 names a door across a junction, and the wall that ends in it', () => {
    const partition = wall('p', [2, 0], [2, 3], { kind: 'partition' })
    const plan: FloorPlan = { ...box([door('d', 's', 1.6)], { walls: [partition] }), rooms: [] }
    expect(placeIssues(plan)).toEqual([{ code: 'wall/ends-in-opening', entity: 'wall', id: 'p', severity: 'warning', hits: ['d', 's'] }])
  })

  it('names a door whose wall runs on into the wall it meets, at either end', () => {
    expect(placeIssues(box([door('d', 's', 0)])).map((i) => [i.code, i.id, i.hits])).toEqual([['opening/crosses-wall', 'd', ['w', 's']]])
    expect(placeIssues(box([door('d', 's', 3.1)])).map((i) => [i.code, i.id, i.hits])).toEqual([['opening/crosses-wall', 'd', ['e', 's']]])
  })

  it('says nothing of a wall no higher than the sill, which stands under the window', () => {
    const low = wall('p', [2, 0], [2, 3], { kind: 'partition', height: 0.9 })
    const plan: FloorPlan = { ...box([window_('win', 's', 1.4)], { walls: [low] }), rooms: [] }
    expect(placeIssues(plan)).toEqual([])
    const higher: FloorPlan = { ...plan, walls: plan.walls.map((w) => (w.id === 'p' ? { ...w, height: 1 } : w)) }
    expect(placeIssues(higher).map((i) => [i.code, i.id])).toEqual([['wall/ends-in-opening', 'p']])
  })

  it('MS-8 warns of a door on a dividing line, naming the door and the line, and leaves it drawn', () => {
    const line = { id: 'v', start: [2, 0] as [number, number], end: [2, 3] as [number, number], thickness: 0, height: 2.7, kind: 'interior' as const, virtual: true }
    const plan: FloorPlan = { ...box([door('d', 'v', 1)], { walls: [line] }), rooms: [] }
    expect(placeIssues(plan)).toEqual([{ code: 'opening/on-dividing-line', entity: 'opening', id: 'd', severity: 'warning', hits: ['v'] }])
    expect(buildFloorPlan(plan).openings.map((o) => o.id)).toEqual(['d'])
  })

  describe('a wall whose centre line meets at a jamb frames the opening (ARE-32)', () => {
    /** A 0.3 m wall, and a corridor of 0.1 m walls carried through it by an opening `width` wide from `from`. */
    function corridor(x0: number, from: number, width: number): FloorPlan {
      const a = x0 + 2.35
      const b = a + 1.2
      const walls = [
        exterior('x', [x0, 0], [x0 + 6, 0], { thickness: 0.3 }),
        wall('n1', [a, 0], [a, 3]),
        wall('n2', [b, 0], [b, 3]),
        wall('s1', [a, 0], [a, -3]),
        wall('s2', [b, 0], [b, -3])
      ]
      return { version: '1', units: 'm', walls, rooms: [], openings: [{ id: 'o', wall: 'x', type: 'opening', offset: a - x0 + from, width, sill: 0, height: 2.1 }] }
    }

    it('says nothing of a corridor carried through an opening as wide as it is between centre lines, wherever it stands', () => {
      for (let k = 0; k < 12; k++) {
        const x0 = k * 12.47 + 0.1 * k
        expect(placeIssues(corridor(x0, 0, 1.2))).toEqual([])
        // Within the tolerance of either jamb is at the jamb.
        expect(placeIssues(corridor(x0, -0.0004, 1.2008))).toEqual([])
      }
    })

    it('still names a wall that meets the wall off the jamb, inside the opening or with its body in it', () => {
      const four = [
        ['wall/ends-in-opening', 'n1'],
        ['wall/ends-in-opening', 'n2'],
        ['wall/ends-in-opening', 's1'],
        ['wall/ends-in-opening', 's2']
      ]
      // Centre lines 5 mm inside the opening, and 5 mm outside it with 45 mm of body in it.
      expect(placeIssues(corridor(0, -0.005, 1.21)).map((i) => [i.code, i.id])).toEqual(four)
      expect(placeIssues(corridor(0, 0.005, 1.19)).map((i) => [i.code, i.id])).toEqual(four)
    })

    it('says nothing of a half-round bay whose mouth is one opening', () => {
      const bay = { ...exterior('bay', [1.5, 0], [4.5, 0], { thickness: 0.2 }), arc: { centre: [3, 0] as [number, number], sweep: 180 } }
      const mouth = (offset: number, width: number): FloorPlan => ({
        version: '1',
        units: 'm',
        walls: [exterior('s', [0, 0], [6, 0], { thickness: 0.3 }), bay],
        rooms: [],
        openings: [{ id: 'mouth', wall: 's', type: 'opening', offset, width, sill: 0, height: 2.1 }]
      })
      expect(placeIssues(mouth(1.5, 3))).toEqual([])
      // Wider than the mouth, the bay's wall meets inside the opening.
      expect(placeIssues(mouth(1.4, 3.2)).map((i) => [i.code, i.id])).toEqual([['wall/ends-in-opening', 'bay']])
    })
  })

  it('names an opening as long as its wall once, not once for each corner', () => {
    const plan = box([{ id: 'gap', wall: 'e', type: 'opening', offset: 0, width: 3, sill: 0, height: 2.1 }])
    expect(placeIssues(plan).map((i) => [i.code, i.id])).toEqual([['opening/fills-wall', 'gap']])
  })

  it('warns of a window with rooms on both sides, naming the wall and both rooms: it may be a borrowed light', () => {
    const plan = flat()
    const between = plan.walls.find((w) => w.kind !== 'exterior')!
    const withWindow: FloorPlan = { ...plan, openings: [...plan.openings, window_('borrowed', between.id, 0.5, 0.6)] }
    const found = validatePlan(withWindow).issues.filter((i) => i.code === 'opening/window-between-rooms')
    expect(found.map((i) => [i.id, i.severity])).toEqual([['borrowed', 'warning']])
    expect(found[0]!.message).toMatch(new RegExp(`^Window "borrowed" in wall "${between.id}" has rooms on both sides, "[^"]+" and "[^"]+": it may be a borrowed light\\.`))
    expect((found[0] as { hits?: readonly string[] }).hits).toHaveLength(3)
  })

  it('cuts the opening through its own wall only: the wall it runs into is drawn whole', () => {
    const without = buildFloorPlan(box([]))
    const withDoor = buildFloorPlan(box([door('d', 's', 0)]))
    const slices = (drawing: ReturnType<typeof buildFloorPlan>, id: string) => drawing.walls.find((w) => w.id === id)!.slices
    expect(slices(withDoor, 'w')).toEqual(slices(without, 'w'))
    expect(slices(withDoor, 's')).not.toEqual(slices(without, 's'))
  })
})

describe('wallEndInOpening, for the edit commands (MSG-16)', () => {
  const index = indexPlan(box([window_('win', 'n', 1, 1.2)]))

  it('is null for a wall end clear of the openings', () => {
    expect(wallEndInOpening(index, 'n', 0.5, 0.1)).toBeNull()
  })

  it('names the opening a wall end lands in, and the nearest place clear of it', () => {
    const hit = wallEndInOpening(index, 'n', 1.4, 0.1)!
    expect(hit.opening.id).toBe('win')
    expect(hit.nearest).toBeCloseTo(0.95, 9)
    expect(wallEndInOpening(index, 'n', 2, 0.1)!.nearest).toBeCloseTo(2.25, 9)
  })
})
