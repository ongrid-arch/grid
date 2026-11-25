/**
 * ARE-28: a dividing line, a virtual wall between two rooms, joins those two rooms and nothing
 * else. Where only one of them is beside it (the bit run on into an outside wall's body, or past
 * the end of a narrower room) it is no way outside and no open edge. Only doors, doorless openings
 * and open edges (a line with one room all along it) lead out. Rooms text ends each dividing line
 * where its two rooms stop sharing an edge.
 *
 * The plans are a ring of corridors round a courtyard, joined at its corners by dividing lines,
 * and a hall of stands round an aisle, all open to each other.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan } from '../../types/floorplan'
import { checkPlanSanity } from '../rules'
import { floorGraph } from '../rules/graph'
import { planForFloor } from '../floors'
import { planAreaFigures } from '../areas'
import { edit } from '../../test-support/plans'
import { stand } from '../../test-support/largerBuilding'

const written = (text: string): FloorPlan => {
  const result = compileRoomsText(text)
  if (result.plan === null) throw new Error(JSON.stringify(result.problems))
  return parseFloorPlan(result.plan)
}

const graphOf = (plan: FloorPlan) => floorGraph(planForFloor(plan, plan.floors?.[0]?.id ?? 'ground'))
const codes = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => f.code)

/** Four corridors round a 14 × 11 courtyard no room claims, joined at the corners by dividing lines. */
const RING = `plan "Ring of corridors"
walls outside 0.3 inside 0.1 height 2.7

room north "North corridor" corridor 20 x 3 at 0,17
room west "West corridor" corridor 3 x 14 at 0,3
room east "East corridor" corridor 3 x 14 at 17,3
room south "South corridor" corridor 20 x 3 at 0,0
wall between north and west virtual
wall between north and east virtual
wall between south and west virtual
wall between south and east virtual
`

/** The ring as Grid used to write it: each dividing line run on to the centre lines of the outside walls it meets. */
const runOn = (plan: FloorPlan): FloorPlan =>
  edit(plan, (copy) => {
    for (const wall of copy.walls) {
      if (wall.virtual !== true) continue
      const [dx, dy] = [wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]]
      const length = Math.hypot(dx, dy)
      const [ux, uy] = [(dx / length) * 0.15, (dy / length) * 0.15]
      wall.start = [wall.start[0] - ux, wall.start[1] - uy]
      wall.end = [wall.end[0] + ux, wall.end[1] + uy]
    }
  })

/** Four stands in a row on an aisle, two stands across it, all open; the one way out is a door in the far stand. */
const HALL = `plan "Hall of stands"
walls outside 0.3 inside 0.1 height 4

room b1 "Stand 1" shop 3 x 3 at 0,0
room b2 "Stand 2" shop 3 x 3 east of b1
room b3 "Stand 3" shop 3 x 3 east of b2
room b4 "Stand 4" shop 3 x 3 east of b3
room aisle "Aisle" corridor 12 x 3 north of b1
room b5 "Stand 5" shop 3 x 3 north of aisle
room b6 "Stand 6" shop 9 x 3 east of b5
wall between b1 and b2 virtual
wall between b2 and b3 virtual
wall between b3 and b4 virtual
wall between b1 and aisle virtual
wall between b2 and aisle virtual
wall between b3 and aisle virtual
wall between b4 and aisle virtual
wall between aisle and b5 virtual
wall between aisle and b6 virtual
wall between b5 and b6 virtual
door main in b6 north, 4 from west, 2 wide
`

describe('a dividing line is no way outside (ARE-28)', () => {
  it('a ring of corridors joined at its corners, with no door out, has no way out', () => {
    for (const plan of [written(RING), runOn(written(RING))]) {
      const graph = graphOf(plan)
      expect(graph.links.map((l) => l.rooms.join('+'))).toEqual(['east+north', 'east+south', 'north+west', 'south+west'])
      expect(graph.exits).toEqual([])
      expect(graph.openEdges).toEqual([])
      expect(codes(plan)).toContain('no_exit')
    }
  })

  it('with a door in the outside wall, that door is the one way out', () => {
    const plan = edit(runOn(written(RING)), (copy) => {
      const outer = copy.walls.find((w) => w.kind === 'exterior' && w.start[1] > 20 && w.end[1] > 20)!
      copy.openings.push({ id: 'front', wall: outer.id, type: 'door', offset: 9, width: 1, sill: 0, height: 2.1 })
    })
    expect(graphOf(plan).exits).toEqual([{ room: 'north', opening: 'front' }])
    expect(codes(plan)).toEqual([])
  })

  it('a stand past the end of the aisle, or along a long shared line, finds no way out along it', () => {
    const plan = written(HALL)
    expect(graphOf(plan).exits).toEqual([{ room: 'b6', opening: 'main' }])
    expect(codes(plan)).toEqual([])
    // With the door gone, the hall has no way out at all.
    expect(codes(edit(plan, (copy) => { copy.openings = [] }))).toContain('no_exit')
  })

  it('still reads what the plan states lies beyond a dividing line', () => {
    const plan = edit(runOn(written(RING)), (copy) => {
      copy.walls.find((w) => w.id === 'open-north-west')!.beyond = 'outside'
    })
    expect(graphOf(plan).exits).toEqual([{ room: 'north', opening: 'open-north-west' }])
  })

  it('leaves an open edge, a line with one room all along it, a way out as before', () => {
    expect(floorGraph(stand('outside')).exits).toEqual([{ room: 'stand', opening: 'front' }])
    expect(floorGraph(stand()).openEdges).toEqual([{ room: 'stand', edge: 'front', beyond: 'outside' }])
  })
})

describe('rooms text ends a dividing line where its rooms stop sharing an edge (ARE-28)', () => {
  it('the corner lines of the ring run across the corridor only, not into the walls', () => {
    const plan = written(RING)
    const lines = plan.walls.filter((w) => w.virtual === true).map((w) => [w.id, w.start, w.end])
    expect(lines).toEqual([
      ['open-north-west', [0, 17], [3, 17]],
      ['open-north-east', [17, 17], [20, 17]],
      ['open-west-south', [0, 3], [3, 3]],
      ['open-east-south', [17, 3], [20, 3]],
    ])
  })

  it('the line between the aisle and the wider stand ends at the end of the aisle', () => {
    const line = written(HALL).walls.find((w) => w.id === 'open-aisle-b4')!
    expect(Math.max(line.start[0], line.end[0])).toBe(12)
  })

  it('every room still closes, with the same areas as with the lines run on', () => {
    const plan = written(RING)
    const [now, before] = [planAreaFigures(plan), planAreaFigures(runOn(plan))]
    expect(now.net.area).toBeCloseTo(before.net.area!, 6)
    expect(now.grossInternal.area).toBeCloseTo(before.grossInternal.area!, 6)
    expect(codes(plan).filter((code) => code !== 'no_exit' && code !== 'no_route_to_exit')).toEqual([])
  })
})
