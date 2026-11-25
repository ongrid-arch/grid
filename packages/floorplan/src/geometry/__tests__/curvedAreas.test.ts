/**
 * CNT-22: curved outside walls and the gross internal area. A rounded-square tower plate, 32 m on
 * its axes with a quarter-circle wall at each corner, gets its gross internal area at every corner
 * radius, turned and far from the origin; forty floors of it, each turned a little more, give the
 * building's total; and a cut that cannot be made says why in Grid's own words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import polygonClipping from 'polygon-clipping'
import type { FloorPlan, Wall } from '../plan'
import { planAreaFigures } from '../areas'

type Tuple = [number, number]

const THICKNESS = 0.3
const SIDE = 32

const wall = (id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall => ({ id, start, end, thickness: THICKNESS, height: 3, kind: 'exterior', ...extra })

/** The plate's walls: four straight sides and four quarter circles of radius `r`, turned `turn` radians round (cx, cy). */
function plateWalls(r: number, turn: number, cx: number, cy: number, prefix = '', floor?: string): Wall[] {
  const h = SIDE / 2
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const p = (x: number, y: number): Tuple => [cx + x * c - y * s, cy + x * s + y * c]
  const on = floor === undefined ? {} : { floor }
  const id = (name: string): string => `${prefix}${name}`
  return [
    wall(id('s'), p(-h + r, -h), p(h - r, -h), on),
    wall(id('se'), p(h - r, -h), p(h, -h + r), { arc: { centre: p(h - r, -h + r), sweep: 90 }, ...on }),
    wall(id('e'), p(h, -h + r), p(h, h - r), on),
    wall(id('ne'), p(h, h - r), p(h - r, h), { arc: { centre: p(h - r, h - r), sweep: 90 }, ...on }),
    wall(id('n'), p(h - r, h), p(-h + r, h), on),
    wall(id('nw'), p(-h + r, h), p(-h, h - r), { arc: { centre: p(-h + r, h - r), sweep: 90 }, ...on }),
    wall(id('w'), p(-h, h - r), p(-h, -h + r), on),
    wall(id('sw'), p(-h, -h + r), p(-h + r, -h), { arc: { centre: p(-h + r, -h + r), sweep: 90 }, ...on })
  ]
}

/** The floor inside the inside face, by hand: a square less the four corners the inside curves leave out. */
function handInside(r: number): number {
  const side = SIDE - THICKNESS
  const inner = r - THICKNESS / 2
  return side * side - (4 - Math.PI) * inner * inner
}

function onePlate(r: number, turn: number, cx: number, cy: number): FloorPlan {
  const walls = plateWalls(r, turn, cx, cy)
  return { version: '1', units: 'm', walls, rooms: [{ id: 'plate', name: 'Plate', boundary: walls.map((w) => w.id) }], openings: [] }
}

describe('a rounded-square tower plate (CNT-22)', () => {
  it('gets its gross internal area at every corner radius, turned and far from the origin', () => {
    const missed: string[] = []
    for (const r of [2, 3, 4, 5, 6, 7.3, 8]) {
      for (const [turn, cx, cy] of [[0, 13.37, 9.359], [0.37, 0, 0], [0.785, 101.1, 70.77]] as const) {
        const figures = planAreaFigures(onePlate(r, turn, cx, cy))
        const gia = figures.grossInternal.area
        if (gia === null) {
          missed.push(`r ${r}, turn ${turn}: ${figures.floors[0]?.why ?? 'no reason'}`)
          continue
        }
        expect(Math.abs(gia - handInside(r)) / handInside(r)).toBeLessThan(0.005)
        // The plate's room is the floor inside its walls' axes, so more than the inside face holds.
        expect(gia).toBeLessThanOrEqual(figures.grossExternal.area!)
      }
    }
    expect(missed).toEqual([])
  })

  it('gives the building its total over forty floors, each turned a little more', () => {
    const floors = Array.from({ length: 40 }, (_, i) => ({ id: `f${i + 1}`, name: `Floor ${i + 1}`, level: i }))
    const walls = floors.flatMap((floor, i) => plateWalls(4, (i * 1.5 * Math.PI) / 180, 0, 0, `${floor.id}-`, floor.id))
    const rooms = floors.map((floor) => ({ id: `${floor.id}-plate`, name: `Plate ${floor.id}`, floor: floor.id, boundary: walls.filter((w) => w.floor === floor.id).map((w) => w.id) }))
    const plan: FloorPlan = { version: '1', units: 'm', floors, walls, rooms, openings: [] }
    const figures = planAreaFigures(plan)
    expect(figures.floors.filter((f) => f.grossInternal === null).map((f) => `${f.floor}: ${f.why}`)).toEqual([])
    expect(figures.grossInternal.area).not.toBeNull()
    expect(Math.abs(figures.grossInternal.area! - 40 * handInside(4)) / (40 * handInside(4))).toBeLessThan(0.005)
  }, 180_000)
})

describe('a cut of the outer walls that cannot be made (CNT-22)', () => {
  afterEach(() => vi.restoreAllMocks())

  const LIBRARY = 'Unable to find segment #1 [0, 0] -> [1, 1] in SweepLine tree.'

  it('says why in Grid\'s own words, never in the polygon library\'s', () => {
    const difference = polygonClipping.difference.bind(polygonClipping)
    // Only the cut of the outer walls fails: it is the one call that takes every outer stretch.
    vi.spyOn(polygonClipping, 'difference').mockImplementation((geom, ...rest) => {
      if (rest.length > 2) throw new Error(LIBRARY)
      return difference(geom, ...rest)
    })
    const figures = planAreaFigures(onePlate(4, 0, 0, 0))
    expect(figures.grossInternal.area).toBeNull()
    expect(figures.floors[0]!.why).toBe('the outer walls could not be cut from the floor: their shapes are too close to tell apart')
    expect(JSON.stringify(figures)).not.toMatch(/SweepLine|segment #/)
  })

  it('says so in its own words when the walls cannot be joined at all', () => {
    vi.spyOn(polygonClipping, 'difference').mockImplementation(() => {
      throw new Error(LIBRARY)
    })
    const figures = planAreaFigures(onePlate(4, 0, 0, 0))
    expect(figures.grossInternal.area).toBeNull()
    expect(figures.floors[0]!.why).toBe("the walls' outline could not be worked out: the walls could not be joined: their shapes are too close to tell apart")
    expect(JSON.stringify(figures)).not.toMatch(/SweepLine|segment #/)
  })
})
