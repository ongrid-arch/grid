/**
 * CNT-26: a wall that stands apart from the building, with no room on either side, is a garden or
 * boundary wall: landscape, never building.
 *
 * The house is the lab's G series house alone (`s01a-house-alone.json`): outside walls 0.30 m thick
 * on centre lines from (3.15, 10.15) to (11.85, 19.85), six rooms, 76.34 m² net, 78.96 m² gross
 * internal and 90 m² gross external, 2.7 m high. Round it, on its 15 × 30 m plot, a boundary wall
 * 0.20 m thick and 1.8 m high on centre lines from (0, 0) to (15, 30), stated `exterior` as an agent
 * writes it; in the back garden a 3.2 m wall standing apart, and one running from the house's east
 * face to the boundary. Measured by hand, the house is the same with them as without: the plot is
 * a garden, not the ground floor, and the garden walls are no outside walls. Walls with no room
 * beside them that close a space against the house (a porch not drawn as a room) stay the
 * building's: that is floor no room claims.
 */
import { describe, expect, it } from 'vitest'
import {
  buildFloorPlan,
  floorElevations,
  indexPlan,
  landscapeWalls,
  planAreaFigures,
  planEnvelope,
  validatePlan,
  wallDrawnKind,
  wallExposure,
  wallSides,
  type FloorPlan,
} from '../index'
import { parseFloorPlan } from '../../types/floorplan'
import { labPlanText } from '../../test-support/lab'

type Raw = Record<string, unknown> & { rooms: Record<string, unknown>[]; walls: Record<string, unknown>[] }

const house = (): Raw => JSON.parse(labPlanText('G/scenarios/s01a-house-alone.json')) as Raw

const wall = (id: string, start: [number, number], end: [number, number], height: number, thickness = 0.2): Record<string, unknown> => ({
  id,
  start,
  end,
  thickness,
  height,
  kind: 'exterior',
})

/** The plot's boundary wall, a closed ring of four. */
const RING = [
  wall('plot-s', [0, 0], [15, 0], 1.8),
  wall('plot-e', [15, 0], [15, 30], 1.8),
  wall('plot-n', [15, 30], [0, 30], 1.8),
  wall('plot-w', [0, 30], [0, 0], 1.8),
]
/** A tall wall standing apart in the back garden, and one from the house's east face to the boundary. */
const GARDEN = [wall('garden-apart', [2, 25], [8, 25], 3.2), wall('garden-side', [12, 15], [14.9, 15], 1.8)]

function withWalls(walls: readonly Record<string, unknown>[]): FloorPlan {
  const plan = house()
  plan.walls.push(...walls.map((w) => ({ ...w })))
  return parseFloorPlan(plan)
}

const round = (value: number | null | undefined): string => (value ?? NaN).toFixed(2)
const figures = (plan: FloorPlan): string[] => {
  const areas = planAreaFigures(plan)
  return [areas.net.area, areas.grossInternal.area, areas.grossExternal.area].map(round)
}
const envelope = (plan: FloorPlan): string[] => {
  const floor = planEnvelope(plan).floors[0]!
  return [floor.outlineArea, floor.slab?.area, floor.roof?.area].map(round)
}

describe('a boundary wall round the plot and garden walls standing apart (CNT-26)', () => {
  const alone = parseFloorPlan(house())
  const plot = withWalls([...RING, ...GARDEN])

  it('measures the house as it is alone: the plot is a garden, not floor', () => {
    expect(figures(alone)).toEqual(['76.34', '78.96', '90.00'])
    expect(figures(plot)).toEqual(figures(alone))
    // Each floor's sums hold, with no unclaimed floor and no wall area of the garden walls.
    const floor = planAreaFigures(plot).floors[0]!
    const aloneFloor = planAreaFigures(alone).floors[0]!
    expect(round(floor.unclaimed)).toBe('0.00')
    expect(round(floor.walls)).toBe(round(aloneFloor.walls))
  })

  it('gives the floor the slab, the roof and the outline of the house alone', () => {
    expect(envelope(plot)).toEqual(envelope(alone))
    expect(round(planEnvelope(plot).roofArea)).toBe(round(planEnvelope(alone).roofArea))
  })

  it('sets the storey height by the house, not by a taller garden wall', () => {
    expect(floorElevations(plot).floors.get('ground')!.clearHeight).toBe(2.7)
  })

  it('reads every garden wall as landscape, standing in the open, and the house walls as outside walls', () => {
    const index = indexPlan(plot)
    expect([...landscapeWalls(plot, index)].sort()).toEqual(['garden-apart', 'garden-side', 'plot-e', 'plot-n', 'plot-s', 'plot-w'])
    for (const id of landscapeWalls(plot, index)) {
      expect(wallExposure(index, id)).toBe('detached')
      expect(wallSides(index, id)!.landscape).toBe(true)
    }
    for (const id of ['ext-s', 'ext-e', 'ext-n', 'ext-w']) {
      expect(wallExposure(index, id)).toBe('exterior')
      expect(wallSides(index, id)!.landscape).toBeUndefined()
    }
    expect(wallExposure(index, 'spine')).toBe('interior')
  })

  it('reports no floor no room claims inside the ring', () => {
    const codes = validatePlan(plot).issues.map((issue) => issue.code)
    expect(codes).not.toContain('floor/unclaimed')
  })

  it('draws a garden wall lighter than an outside wall, and marks it landscape', () => {
    const drawing = buildFloorPlan(plot)
    const ring = drawing.walls.find((w) => w.id === 'plot-n')!
    expect(ring.landscape).toBe(true)
    expect(ring.exposure).toBe('detached')
    expect(wallDrawnKind(ring)).toBe('partition')
    const outer = drawing.walls.find((w) => w.id === 'ext-n')!
    expect(outer.landscape).toBeUndefined()
    expect(wallDrawnKind(outer)).toBe('outside')
  })
})

describe('what stays the building', () => {
  it('reads a plan of walls alone, with no rooms yet, as before: its ring is the building', () => {
    const plan = parseFloorPlan({ version: '1', walls: RING, rooms: [], openings: [] })
    const index = indexPlan(plan)
    expect(landscapeWalls(plan, index).size).toBe(0)
    expect(wallExposure(index, 'plot-n')).toBe('exterior')
    expect(round(planAreaFigures(plan).floors[0]!.grossExternal)).toBe(round(15.2 * 30.2))
  })

  it('keeps a low wall standing inside a room, and a ring a room lists', () => {
    // A 1.1 m wall across the living room, which no room lists.
    const inside = withWalls([wall('half-wall', [4, 12], [6, 12], 1.1, 0.1)])
    expect(landscapeWalls(inside).has('half-wall')).toBe(false)
    // The ring as the walls of a room drawn round the house: the building's, as the plan says.
    const raw = house()
    raw.walls.push(...RING.map((w) => ({ ...w })))
    raw.rooms.push({ id: 'yard', name: 'Yard', boundary: ['plot-s', 'plot-e', 'plot-n', 'plot-w'] })
    const listed = parseFloorPlan(raw)
    expect(landscapeWalls(listed).size).toBe(0)
  })

  it('reads a garden wall run out from one corner of the house as landscape, and walls that close a space against the house as the building\'s', () => {
    // From the house's north-east corner out into the back garden: it touches the house at one place.
    const corner = withWalls([wall('spur', [12, 20], [14, 23], 1.8)])
    expect([...landscapeWalls(corner)]).toEqual(['spur'])
    // A porch drawn as three walls against the south wall, and no room: a space not drawn, still floor.
    const porch = withWalls([wall('p1', [5, 10], [5, 8], 2.7), wall('p2', [5, 8], [7, 8], 2.7), wall('p3', [7, 8], [7, 10], 2.7)])
    expect(landscapeWalls(porch).size).toBe(0)
    expect(round(planAreaFigures(porch).floors[0]!.unclaimed)).not.toBe('0.00')
  })

  it('keeps a wall that rises through floors the building\'s', () => {
    const raw = house()
    raw.walls.push({ ...wall('tower', [2, 25], [8, 25], 3.2), through: 'ground' })
    expect(landscapeWalls(parseFloorPlan(raw)).has('tower')).toBe(false)
  })
})
