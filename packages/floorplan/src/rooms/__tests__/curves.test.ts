/**
 * WRT-78: curved rooms and walls written in rooms text: a circle, an oval, a round end (an
 * apse), a bowed side and a band between two radii come out as true curved walls (C21's `arc`),
 * shared by the rooms on either side, with their doors and windows placed along the curve.
 */
import { describe, expect, it } from 'vitest'
import { indexPlan } from '../../geometry/plan'
import { tryRoomPolygon } from '../../geometry/room'
import { validatePlan } from '../../geometry/validate'
import { wallLength } from '../../geometry/wall'
import { tolerance } from '../../geometry/tolerances'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

function written(text: string): { plan: FloorPlan; result: ReturnType<typeof compileRoomsText> } {
  const result = compileRoomsText(text)
  expect(result.problems.map((p) => p.message)).toEqual([])
  const plan = parseFloorPlan(result.plan)
  expect(validatePlan(plan).issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`)).toEqual([])
  return { plan, result }
}

/** The area Grid measures a room at, from its walls. */
function measured(plan: FloorPlan, id: string): number {
  const room = plan.rooms.find((r) => r.id === id)!
  const poly = tryRoomPolygon(room, indexPlan(plan))!
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s / 2)
}

const curvedWalls = (plan: FloorPlan) => plan.walls.filter((w) => w.arc !== undefined)

describe('curved rooms in rooms text (WRT-78)', () => {
  it('writes a circle as one whole curved wall round its centre, at its true area', () => {
    const { plan, result } = written('plan "Pavilion"\nroom pav "Pavilion" - circle 12 at 20,6\n')
    expect(plan.walls).toHaveLength(1)
    const wall = plan.walls[0]!
    expect(wall.arc).toEqual({ centre: [20, 6], sweep: 360 })
    expect(wall.start).toEqual(wall.end)
    expect(Math.hypot(wall.start[0] - 20, wall.start[1] - 6)).toBeCloseTo(6 + wall.thickness / 2, 4)
    expect(plan.rooms[0]!.boundary).toEqual([wall.id])
    const area = result.rooms[0]!.area
    expect(area).toBeCloseTo(Math.PI * 36, 6)
    expect(Math.abs(measured(plan, 'pav') - area)).toBeLessThan(0.02)
    expect(result.warnings).toEqual([])
    expect(result.guesses.join(' ')).toContain('12.00 m across')
    // 'circle radius 6' says the same.
    const again = compileRoomsText('room pav "Pavilion" - circle radius 6 at 20,6\n')
    expect(parseFloorPlan(again.plan).walls).toEqual(plan.walls)
  })

  it('writes an oval as four curved walls that meet without a kink', () => {
    const { plan, result } = written('room hall "Hall" - oval 60 x 36 at 0,0\n')
    const arcs = curvedWalls(plan)
    expect(arcs).toHaveLength(4)
    expect(plan.walls).toHaveLength(4)
    const box = plan.walls.flatMap((w) => [w.start, w.end])
    expect(Math.max(...box.map((p) => p[0]))).toBeLessThan(30.2)
    const area = result.rooms[0]!.area
    // A four-centred oval: a little less than the ellipse it stands for, more than its diamond.
    expect(area).toBeLessThan(Math.PI * 30 * 18)
    expect(area).toBeGreaterThan(0.95 * Math.PI * 30 * 18)
    expect(Math.abs(measured(plan, 'hall') - area)).toBeLessThan(0.2)
    // A tall oval is the wide one turned a quarter turn.
    const tall = written('room hall "Hall" - oval 36 x 60 at 0,0\n')
    expect(tall.result.rooms[0]!.area).toBeCloseTo(area, 6)
  })

  it('writes a round end on a side of a room, its chord the wall between them', () => {
    const { plan, result } = written('room nave "Nave" - 20 x 10 at 0,0\nroom apse "Apse" - arc 180 east of nave\ndoor d1 between nave and apse, centred, 2 wide\nwindow w1 in apse east, centred, 1.5 wide\n')
    const arcs = curvedWalls(plan)
    expect(arcs).toHaveLength(1)
    const apse = arcs[0]!
    // Carried on to the centre lines of the nave's walls it meets.
    expect(Math.abs(Math.abs(apse.arc!.sweep) - 180)).toBeLessThan(2)
    expect(result.rooms.find((r) => r.id === 'apse')!.area).toBeCloseTo((Math.PI * 25) / 2, 6)
    const between = plan.walls.find((w) => w.id === plan.openings.find((o) => o.id === 'd1')!.wall)!
    expect(between.arc).toBeUndefined()
    expect(between.start[0]).toBeCloseTo(between.end[0], 6)
    // The window stands at the apse's east point: the middle of the curve.
    const w1 = plan.openings.find((o) => o.id === 'w1')!
    expect(w1.wall).toBe(apse.id)
    expect(w1.offset + w1.width / 2).toBeCloseTo(wallLength(apse) / 2, 2)
    // A chord written after the sweep: a shallower end, centred on the nave's side.
    const shallow = written('room nave "Nave" - 20 x 10 at 0,0\nroom apse "Apse" - arc 120 6 east of nave\n')
    const chord = 6
    const r = chord / (2 * Math.sin(Math.PI / 3))
    const segment = (r * r * ((2 * Math.PI) / 3 - Math.sin((2 * Math.PI) / 3))) / 2
    expect(shallow.result.rooms.find((x) => x.id === 'apse')!.area).toBeCloseTo(segment, 6)
  })

  it('bows a side of a room out, or in, by a wall line, keeping the line\'s other words', () => {
    const { plan, result } = written('room hall "Hall" - 10 x 6 at 0,0\nwall hall east curve radius 4 0.4 exterior\nwindow w1 in hall east, centred, 2 wide\n')
    const arcs = curvedWalls(plan)
    expect(arcs).toHaveLength(1)
    expect(arcs[0]!.thickness).toBe(0.4)
    const half = Math.asin(3 / 4)
    const sliver = 16 * (half - Math.sin(2 * half) / 2)
    expect(result.rooms[0]!.area).toBeCloseTo(60 + sliver, 6)
    expect(plan.openings[0]!.wall).toBe(arcs[0]!.id)
    const inward = written('room hall "Hall" - 10 x 6 at 0,0\nwall hall east curve radius 4 inward\n')
    expect(inward.result.rooms[0]!.area).toBeCloseTo(60 - sliver, 6)
  })

  it('lets rooms on one centre share their curves, with doors placed along them', () => {
    const { plan, result } = written(
      'room pav "Pavilion" - circle 12 at 0,0\n' +
        'room ring "Ring" - band 6.1 to 10 from 0 sweep 180 at 0,0\n' +
        'room ring2 "Ring 2" - band 6.1 to 10 from 180 sweep 180 at 0,0 open ring\n' +
        'door d1 between pav and ring, centred, 1 wide\n' +
        'door d2 in ring north, centred, 1.5 wide\n' +
        'door d3 in ring2 south, 2 from east, 1 wide\n'
    )
    expect(curvedWalls(plan)).toHaveLength(4)
    const shared = plan.walls.find((w) => w.id === plan.openings.find((o) => o.id === 'd1')!.wall)!
    expect(shared.arc).toEqual({ centre: [0, 0], sweep: 180 })
    expect(shared.thickness).toBe(0.1)
    expect(wallLength(shared)).toBeCloseTo(6.05 * Math.PI, 3)
    expect(plan.openings.find((o) => o.id === 'd1')!.offset).toBeCloseTo((6.05 * Math.PI) / 2 - 0.5, 3)
    // In the ring, north is the middle of its outer curve.
    const d2 = plan.openings.find((o) => o.id === 'd2')!
    const outer = plan.walls.find((w) => w.id === d2.wall)!
    expect(d2.offset + 0.75).toBeCloseTo(wallLength(outer) / 2, 3)
    // Two metres along the curve from its east point.
    const d3 = plan.openings.find((o) => o.id === 'd3')!
    const south = plan.walls.find((w) => w.id === d3.wall)!
    const east = d3.hinge === 'end' ? d3.offset + d3.width : d3.offset
    const fromEast = Math.min(east, wallLength(south) - east)
    expect(fromEast).toBeCloseTo(2, 3)
    for (const room of ['pav', 'ring', 'ring2']) {
      const area = result.rooms.find((r) => r.id === room)!.area
      expect(Math.abs(measured(plan, room) - area)).toBeLessThan(0.02 + tolerance('areaReported'))
    }
  })

  it('places a round room in a unit, mirrored with it', () => {
    const { plan } = written('room a "A" - 6 x 6 at 0,0\nunit u\nroom p "P" - circle 3 at 2,2\ndoor pd in p west, centred, 0.9 wide\nend\nplace u as A at 20,0\nplace u as B at 30,0 mirror east-west\n')
    expect(curvedWalls(plan)).toHaveLength(2)
    // The mirrored copy's door is in its east, as the unit's west is mirrored.
    const a = plan.openings.find((o) => o.id === 'pd-A')!
    const b = plan.openings.find((o) => o.id === 'pd-B')!
    expect(a.offset).not.toBeCloseTo(b.offset, 2)
  })

  it('refuses what it cannot draw, by name', () => {
    const refused = (text: string): string => compileRoomsText(text).problems.map((p) => `${p.code}: ${p.message}`).join(' | ')
    expect(refused('room ring "Ring" - band 6 to 10 at 0,0\n')).toContain('two bands')
    expect(refused('room ring "Ring" - band 10 to 6 sweep 90 at 0,0\n')).toContain('rooms/size')
    expect(refused('room hall "Hall" - 10 x 6 at 0,0\nwall hall east curve radius 2\n')).toContain('at least 3.00 m')
    expect(refused('room nave "Nave" - 20 x 10 at 0,0\nroom apse "Apse" - arc 180 at 30,0\n')).toContain("'arc 180'")
    expect(refused('room nave "Nave" - 20 x 10 at 0,0\nroom apse "Apse" - arc 400 east of nave\n')).toContain('less than 360')
    expect(refused('room ring "Ring" - band 6 to 10 sweep 90 east of x\n')).toContain('by that centre')
    // Beside a straight side a round room would touch it at one point.
    expect(refused('room a "A" - 6 x 6 at 0,0\nroom pod "Pod" - circle 3 south of a\n')).toContain("'south of a' cannot place it")
    expect(refused('room pav "Pav" - circle 12 centre at 0,0\n')).toContain('inside faces')
    expect(refused('room pav "Pav" - circle 12 4 x 4 at 0,0\n')).toContain('sized twice')
    expect(refused('room pav "Pav" - circle 12 at 0,0\ndoor d1 in pav east, centred, 40 wide\n')).toContain('curved wall')
  })
})
