/**
 * CNT-25: a curved wall costs about what its chord costs. A tower of rounded-square plates, four
 * quarter-circle corners a floor, is checked in a time that grows with its floors, not their
 * square; drawing one of its floors does not work out every floor's level; and
 * what is kept between readers (a curve's pieces, a room's traced outline, a floor's spaces, the
 * building's levels) gives the same answers, to the last digit, as working them out afresh.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { checkDoorSweeps } from '../sweep'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'
import * as elevations from '../elevations'
import { roomOutline } from '../room'
import { straightPieces, wallSegments } from '../wall'
import { floorSpaces, spacesKnown } from '../spaces'
import { withTolerances } from '../tolerances'
import { planWallSides } from '../exposure'

type Tuple = [number, number]

const SIDE = 32
const wall = (id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall => ({ id, start, end, thickness: 0.3, height: 3, kind: 'exterior', ...extra })

/** One plate: four straight sides and four quarter circles of radius 4 m, or their chords, turned `turn` radians. */
function plateWalls(prefix: string, floor: string, turn: number, curved: boolean): Wall[] {
  const h = SIDE / 2
  const r = 4
  const [c, s] = [Math.cos(turn), Math.sin(turn)]
  const p = (x: number, y: number): Tuple => [x * c - y * s, x * s + y * c]
  const corner = (centre: Tuple): Partial<Wall> => (curved ? { arc: { centre, sweep: 90 }, floor } : { floor })
  return [
    wall(`${prefix}s`, p(-h + r, -h), p(h - r, -h), { floor }),
    wall(`${prefix}se`, p(h - r, -h), p(h, -h + r), corner(p(h - r, -h + r))),
    wall(`${prefix}e`, p(h, -h + r), p(h, h - r), { floor }),
    wall(`${prefix}ne`, p(h, h - r), p(h - r, h), corner(p(h - r, h - r))),
    wall(`${prefix}n`, p(h - r, h), p(-h + r, h), { floor }),
    wall(`${prefix}nw`, p(-h + r, h), p(-h, h - r), corner(p(-h + r, h - r))),
    wall(`${prefix}w`, p(-h, h - r), p(-h, -h + r), { floor }),
    wall(`${prefix}sw`, p(-h, -h + r), p(-h + r, -h), corner(p(-h + r, -h + r)))
  ]
}

/** `count` floors of plates, each turned a little more, with a window in each corner and a door in two sides. */
function tower(count: number, curved: boolean): FloorPlan {
  const floors = Array.from({ length: count }, (_, i) => ({ id: `f${i + 1}`, name: `Floor ${i + 1}`, level: i }))
  const walls = floors.flatMap((floor, i) => plateWalls(`${floor.id}-`, floor.id, (i * 1.5 * Math.PI) / 180, curved))
  const rooms = floors.map((floor) => ({ id: `${floor.id}-plate`, name: `Plate ${floor.id}`, floor: floor.id, boundary: walls.filter((w) => w.floor === floor.id).map((w) => w.id) }))
  const openings = floors.flatMap((floor) => [
    ...['se', 'ne', 'nw', 'sw'].map((side) => ({ id: `${floor.id}-win-${side}`, wall: `${floor.id}-${side}`, type: 'window' as const, offset: 1, width: 1.2, sill: 0.9, height: 1.5 })),
    ...['n', 's'].map((side) => ({ id: `${floor.id}-door-${side}`, wall: `${floor.id}-${side}`, type: 'door' as const, offset: 5, width: 0.9, sill: 0, height: 2.1 }))
  ])
  return { version: '1', units: 'm', floors, walls, rooms, openings }
}

/**
 * What grew with the floors and the curves: the plan's validation without the spaces (which join
 * each curved wall as its strips, and set each floor's outline against the floors under it), and
 * the door-swing check, which draws each floor.
 */
function check(plan: FloorPlan): number {
  const started = performance.now()
  validatePlan(plan, indexPlan(plan), { spaces: false })
  checkDoorSweeps(plan, () => null)
  return performance.now() - started
}

afterEach(() => vi.restoreAllMocks())

describe('a tower with curved corners (CNT-25)', () => {
  it('is checked in a time that grows with its floors, not with their square', () => {
    // Once first, so no time counts loading the code.
    check(tower(2, true))
    const ten = check(tower(10, true))
    const forty = check(tower(40, true))
    const straight = check(tower(40, false))
    console.log(`CNT-25: curved corners, 10 floors in ${Math.round(ten)} ms, 40 in ${Math.round(forty)} ms; straight corners, 40 in ${Math.round(straight)} ms`)
    // Four times the floors: about four times the time now; before, each floor's drawing worked
    // out every floor's level and traced every room again, and it took over ten times. The
    // guard leaves room for a busy machine.
    expect(forty).toBeLessThan(6 * ten + 1_500)
  }, 300_000)

  it('draws one floor without working out every floor of the building', () => {
    const plan = tower(12, true)
    const spy = vi.spyOn(elevations, 'floorElevations')
    const drawing = buildFloorPlan(planForFloor(plan, 'f5'))
    expect(drawing.rooms.map((room) => room.id)).toEqual(['f5-plate'])
    expect(spy.mock.calls.some(([asked]) => asked === plan)).toBe(false)
  })
})

describe('what is kept between readers gives the answers worked out afresh (CNT-25)', () => {
  const plate = (): FloorPlan => tower(1, true)

  it('traces a room once and gives every caller its own outline', () => {
    const plan = plate()
    const room = plan.rooms[0]!
    const first = roomOutline(room, indexPlan(plan))
    const polygon = first.polygon.map((p) => ({ ...p }))
    first.polygon.reverse()
    ;(first.sides as unknown[]).length = 0
    const again = roomOutline(room, indexPlan(plan))
    expect(again.polygon).toEqual(polygon)
    expect(again.sides).toHaveLength(plan.walls.length)
    // The same room traced from a copy of the plan, whose objects are new, is the same.
    const copy = JSON.parse(JSON.stringify(plan)) as FloorPlan
    expect(roomOutline(copy.rooms[0]!, indexPlan(copy)).polygon).toEqual(polygon)
  })

  it('traces a room afresh when a wall it lists is a new object', () => {
    const plan = plate()
    const room = plan.rooms[0]!
    const before = roomOutline(room, indexPlan(plan)).polygon
    const thicker: FloorPlan = { ...plan, walls: plan.walls.map((w) => (w.arc === undefined ? w : { ...w, thickness: 0.5 })) }
    const after = roomOutline(room, indexPlan(thicker)).polygon
    expect(after).not.toEqual(before)
    const fresh = JSON.parse(JSON.stringify(thicker)) as FloorPlan
    expect(roomOutline(fresh.rooms[0]!, indexPlan(fresh)).polygon).toEqual(after)
  })

  it('works a curve out again under changed tolerances, and keeps nothing from them', () => {
    const plan = plate()
    const curved = plan.walls.find((w) => w.arc !== undefined)!
    const room = plan.rooms[0]!
    const stated = wallSegments(curved).length
    const outline = roomOutline(room, indexPlan(plan)).polygon.length
    const coarse = withTolerances({ arcStep: 0.3 }, () => ({
      segments: wallSegments(curved).length,
      pieces: straightPieces(curved).length,
      outline: roomOutline(room, indexPlan(plan)).polygon.length
    }))
    expect(coarse.segments).toBeLessThan(stated)
    expect(coarse.pieces).toBe(coarse.segments)
    expect(coarse.outline).toBeLessThan(outline)
    expect(wallSegments(curved)).toHaveLength(stated)
    expect(roomOutline(room, indexPlan(plan)).polygon).toHaveLength(outline)
  })

  it('gives a curved wall the same pieces each time, each list its own', () => {
    const curved = plate().walls.find((w) => w.arc !== undefined)!
    const first = straightPieces(curved)
    first.pop()
    expect(straightPieces(curved)).toHaveLength(first.length + 1)
    expect(straightPieces(curved)[0]).toBe(straightPieces(curved)[0])
    expect(wallSegments(curved)).toEqual(JSON.parse(JSON.stringify(wallSegments({ ...curved }))))
  })

  it('gives a floor the same spaces from a kept comparison as from a fresh one', () => {
    const plan = plate()
    const first = floorSpaces(plan, 'f1')
    expect(spacesKnown(first)).toBe(true)
    if (!spacesKnown(first)) return
    ;(first.spaces as unknown[]).length = 0
    const again = floorSpaces(plan, 'f1')
    const fresh = JSON.parse(JSON.stringify(plan)) as FloorPlan
    expect(again).toEqual(floorSpaces(fresh, 'f1'))
    expect(spacesKnown(again) && again.spaces.length).toBe(1)
  })

  it('works each wall\'s sides out as before', () => {
    const plan = plate()
    const sides = planWallSides(indexPlan(plan))
    expect([...sides.values()].map((s) => s.exposure)).toEqual(plan.walls.map(() => 'exterior'))
    const curved = sides.get('f1-se')!
    expect(curved.stretches.length).toBeGreaterThan(0)
    expect(curved.stretches.every((stretch) => stretch.left.length + stretch.right.length === 1)).toBe(true)
  })

  it('gives the building its levels from what was kept, each caller its own map', () => {
    const plan = tower(3, true)
    const first = elevations.floorElevations(plan)
    ;(first.floors as Map<string, unknown>).clear()
    const again = elevations.floorElevations(plan)
    expect([...again.floors.keys()]).toEqual(['f1', 'f2', 'f3'])
    expect(again).toEqual(elevations.floorElevations(JSON.parse(JSON.stringify(plan)) as FloorPlan))
  })
})

describe('the checks that grew with the square of a floor (CNT-25)', () => {
  /** The plain median, sorting the list given. */
  const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  }

  it("gives a tall wall the median of its floor's other walls as their typical height", () => {
    const lists: number[][] = [
      [2.7, 2.7, 2.7, 13],
      [2.4, 3.1, 2.7, 2.9, 13],
      [3.2, 2.4, 2.4, 2.8, 2.6, 13],
      [13, 2.5, 2.5, 3.1, 2.7, 2.7, 2.9],
      [2.6, 13, 13.5, 2.8, 2.4, 3.1]
    ]
    for (const heights of lists) {
      const walls = heights.map((height, i) => wall(`w${i}`, [i * 5, 0], [i * 5 + 4, 0], { height, kind: 'partition' }))
      const plan: FloorPlan = { version: '1', units: 'm', walls, rooms: [], openings: [] }
      const said = validatePlan(plan).issues.filter((issue) => issue.code === 'wall/size-question')
      expect(said.length).toBeGreaterThan(0)
      for (const issue of said) {
        const i = Number(issue.id.slice(1))
        const typical = median(heights.filter((_, k) => k !== i))
        expect(issue.message).toContain(`typically ${typical.toFixed(2)} m`)
      }
    }
  })
})
