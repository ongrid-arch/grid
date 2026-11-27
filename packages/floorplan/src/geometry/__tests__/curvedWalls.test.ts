/**
 * CNT-18: a curved wall. A round room drawn as one arc wall measures within 0.1% of its hand
 * area, and a 0.9 m door fits on it; a half-round bay, a stair tower and a dividing line on a
 * curve are one wall each, with the right area.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { buildScene, elevationArea } from '../scene3d'
import { roomArea } from '../room'
import { planAreaFigures } from '../areas'
import { wallLength, wallPointAt, wallSegments, wallSlicePolygon } from '../wall'
import { curveAlong, curveFault, wallCurve } from '../arc'
import { area, distance } from '../vec2'
import { parseFloorPlan, wallWithEnds } from '../../types/floorplan'
import { wallJoints } from '../joints'
import { wallExposure } from '../exposure'
import { floorSpaces, spacesKnown } from '../spaces'
import { wallFaults } from '../wallFaults'
import { wallRevision } from '../revision'
import { diffPlans, PLAN_TURNS, turnPlan } from '../diff'
import { planSection } from '../section'
import { tapedLengths } from '../taped'
import { planFacing } from '../orientation'
import { doorSwing } from '../door'
import { validateDoorSweeps } from '../sweep'
import { exportPlan } from '../../export/planExport'
import { parseGlb } from '../export/__tests__/glb-reader'
import { readRoomsText } from '../../rooms/read'
import { compileRoomsText } from '../../rooms/compile'
import { readPlanParts } from '../../types/readParts'
import { planEnvelope } from '../envelope'
import { planFacade } from '../facade'
import { expandPatterns } from '../patterns'
import { pickInModel } from '../pick'
import { english, loadLanguage, say } from '../../messages'
import { planForFloor } from '../floors'
import { wallRise } from '../through'
import type { CameraRecord, Point3 } from '../camera'

type Tuple = [number, number]

function wall(id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall {
  return { id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra }
}

function door(id: string, wallId: string, offset: number, extra: Partial<Opening> = {}): Opening {
  return { id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1, ...extra }
}

/** A round room: one wall, a whole circle of radius 3 m on its axis round (5, 5), 0.2 m thick. */
export function roundRoom(openings: Opening[] = [door('d1', 'round', 2)]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [wall('round', [8, 5], [8, 5], { arc: { centre: [5, 5], sweep: 360 } })],
    rooms: [{ id: 'drum', name: 'Drum', boundary: ['round'] }],
    openings
  }
}

/** A 4 × 3 m room whose north side is a half-round bay of radius 2 m on its axis. */
function bayRoom(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [4, 0]),
      wall('e', [4, 0], [4, 3]),
      wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 } }),
      wall('w', [0, 3], [0, 0])
    ],
    rooms: [{ id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'] }],
    openings: [door('d1', 's', 1.5), { id: 'win', wall: 'bay', type: 'window', offset: 2.5, width: 1.2, sill: 0.9, height: 1.2 }]
  }
}

const HAND_ROUND = Math.PI * 2.9 * 2.9

describe('a curved wall in the plan file (C21)', () => {
  it('reads an arc and keeps it', () => {
    const plan = parseFloorPlan(roundRoom())
    expect(plan.walls[0]!.arc).toEqual({ centre: [5, 5], sweep: 360 })
  })

  it('reads an arc it cannot read as not stated, and says so: the wall is straight', () => {
    // The lab's agents wrote a radius alone (scenario s05b): no centre, no sweep.
    const raw = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, arc: { radius: 3 } } : w)) }
    const read = readPlanParts(raw)
    if (read.plan === null) throw new Error('the plan was refused')
    expect(read.plan.walls.find((w) => w.id === 'bay')!.arc).toBeUndefined()
    expect(read.faults).toContainEqual(expect.objectContaining({ kind: 'value-left-out', part: expect.objectContaining({ list: 'walls', id: 'bay' }) }))
  })

  it('refuses a sweep of nothing or more than a whole turn', () => {
    for (const sweep of [0, 361, -400]) {
      expect(() => parseFloorPlan({ ...roundRoom(), walls: [wall('round', [8, 5], [8, 5], { arc: { centre: [5, 5], sweep } })] })).toThrow()
    }
  })

  it('works out the arc the plan states', () => {
    const curve = wallCurve(roundRoom().walls[0]!)!
    expect(curve.closed).toBe(true)
    expect(curve.radius).toBeCloseTo(3, 12)
    expect(curve.length).toBeCloseTo(6 * Math.PI, 12)
    expect(wallLength(bayRoom().walls[2]!)).toBeCloseTo(2 * Math.PI, 12)
    // Half way round the bay, counter-clockwise from (4, 3): the top of the bay.
    const top = wallPointAt(bayRoom().walls[2]!, Math.PI)
    expect(top.x).toBeCloseTo(2, 12)
    expect(top.y).toBeCloseTo(5, 12)
  })

  it('follows the curve by straight pieces no further than a millimetre off it', () => {
    const w = roundRoom().walls[0]!
    const segments = wallSegments(w)
    expect(segments.length).toBeGreaterThanOrEqual(200)
    for (const segment of segments) {
      const middle = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 }
      expect(3 - distance(middle, { x: 5, y: 5 })).toBeLessThanOrEqual(0.001)
    }
  })
})

describe('a round room drawn as one arc wall', () => {
  it('measures within 0.1% of its hand area', () => {
    const plan = roundRoom()
    const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
    const error = Math.abs(measured - HAND_ROUND) / HAND_ROUND
    expect(error).toBeLessThan(0.001)
    // Far within: the pieces are fine enough for a few hundredths of a percent.
    expect(error).toBeLessThan(0.0003)
  })

  it('takes a 0.9 m door with no fault, and draws it straight across its hole', () => {
    const plan = roundRoom()
    const { issues, broken } = validatePlan(plan)
    expect(broken.size).toBe(0)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    const drawing = buildFloorPlan(plan)
    expect(drawing.rooms).toHaveLength(1)
    expect(drawing.rooms[0]!.area).toBeCloseTo(roomArea(plan.rooms[0]!, indexPlan(plan)), 9)
    const [opening] = drawing.openings
    // The hole is the chord between the door's edges on the curve: a little under 0.9 m.
    const chord = 2 * 3 * Math.sin(0.9 / 6)
    expect(distance(opening!.from, opening!.to)).toBeCloseTo(chord, 9)
    expect(chord).toBeGreaterThan(0.896)
    // Both edges lie on the curve.
    for (const p of [opening!.from, opening!.to]) expect(distance(p, { x: 5, y: 5 })).toBeCloseTo(3, 9)
  })

  it('draws the wall as one solid run round the circle, open at the door', () => {
    const drawing = buildFloorPlan(roundRoom())
    const [w] = drawing.walls
    expect(w!.slices).toHaveLength(1)
    expect(w!.curve).toBeDefined()
    // Wall area: the ring less the door's stretch, give or take the pieces.
    const ring = Math.PI * (3.1 * 3.1 - 2.9 * 2.9)
    const doorway = 0.9 * 0.2
    expect(area(w!.slices[0]!)).toBeCloseTo(ring - doorway, 2)
  })

  it('raises it in 3D as straight pieces, with a lintel over the door', () => {
    const scene = buildScene(roundRoom())
    const [w] = scene.walls
    expect(w!.pieces!.length).toBeGreaterThan(200)
    const lintels = w!.pieces!.filter((piece) => piece.elevation.outline[0]!.y > 0)
    expect(lintels).toHaveLength(1)
    // Unrolled, the wall's elevation keeps its door.
    expect(elevationArea(w!.elevation)).toBeCloseTo(6 * Math.PI * 2.7 - 0.9 * 2.1, 9)
  })

  it('gives the floor its area', () => {
    const figures = planAreaFigures(roundRoom())
    expect(figures.floors[0]!.net).toBeCloseTo(roomArea(roundRoom().rooms[0]!, indexPlan(roundRoom())), 9)
  })
})

describe('a half-round bay', () => {
  it('measures the rectangle and the half disc', () => {
    const plan = bayRoom()
    const { issues } = validatePlan(plan)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    // Inside faces: 3.8 wide, from 0.1 to 3 high, and the half disc of radius 1.9 on top.
    const hand = 3.8 * 2.9 + (Math.PI * 1.9 * 1.9) / 2
    const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
    expect(Math.abs(measured - hand) / hand).toBeLessThan(0.001)
  })

  it('draws the window on the curve', () => {
    const drawing = buildFloorPlan(bayRoom())
    const win = drawing.openings.find((o) => o.id === 'win')!
    for (const p of [win.from, win.to]) expect(distance(p, { x: 2, y: 3 })).toBeCloseTo(2, 9)
    const bay = drawing.walls.find((w) => w.id === 'bay')!
    expect(bay.slices).toHaveLength(2)
    expect(wallSlicePolygon(bayRoom().walls[2]!, 0, 1).length).toBeGreaterThan(4)
  })
})

describe('a curve that cannot be built', () => {
  it('names an end that is not where the sweep takes the start', () => {
    const w = wall('bad', [4, 3], [0, 3.5], { arc: { centre: [2, 3], sweep: 180 } })
    expect(curveFault(w)?.code).toBe('wall/arc-ends-apart')
    const { issues, broken } = validatePlan({ ...bayRoom(), walls: [...bayRoom().walls.filter((x) => x.id !== 'bay'), { ...w, id: 'bay' }] })
    expect(broken.has('bay')).toBe(true)
    expect(issues.find((i) => i.id === 'bay')?.code).toBe('wall/arc-ends-apart')
  })

  // WRT-82: an end on the circle the sweep misses is answered with the sweep that reaches it.
  it('names the sweep that reaches an end on the circle, given the wrong sign', () => {
    const a = (102.68 * Math.PI) / 180
    const end: Tuple = [10 * Math.cos(a), 10 * Math.sin(a)]
    const fault = curveFault(wall('w', [10, 0], end, { arc: { centre: [0, 0], sweep: -102.68 } }))!
    expect(fault.code).toBe('wall/arc-ends-apart')
    expect(fault.said.key).toBe('issue.wall/arc-ends-apart.reach')
    expect(english(fault.said)).toMatch(/The sweep that reaches its end is \+102\.68 \(degrees/)
    const fixed = wall('w', [10, 0], end, { arc: { centre: [0, 0], sweep: 102.68 } })
    expect(curveFault(fixed)).toBeNull()
  })

  it('names the sweep in degrees for one given in radians, and the clockwise one when meant', () => {
    const a = (-75 * Math.PI) / 180
    const end: Tuple = [4 * Math.cos(a), 4 * Math.sin(a)]
    const fault = curveFault(wall('w', [4, 0], end, { arc: { centre: [0, 0], sweep: -1.309 } }))!
    expect(english(fault.said)).toMatch(/reaches its end is -75 \(degrees/)
    const reach = Number(/is ([+-][\d.]+) \(/.exec(english(fault.said))![1])
    expect(curveFault(wall('w', [4, 0], end, { arc: { centre: [0, 0], sweep: reach } }))).toBeNull()
  })

  it('names a radius no more than half the thickness', () => {
    const w = wall('tight', [0.05, 0], [0.05, 0], { arc: { centre: [0, 0], sweep: 360 } })
    expect(curveFault(w)?.code).toBe('wall/arc-too-tight')
  })
})

describe('the curve in the rest of the geometry', () => {
  it('joins a curved wall to the walls at its ends along its tangent there', () => {
    // The bay leaves each side wall in line with it: their ends meet square, flush.
    expect(wallJoints(bayRoom().walls).has('bay')).toBe(false)
    // So does a quarter circle that carries a wall on round a bend.
    const bend = [wall('a', [0, 0], [4, 0]), wall('q', [4, 0], [6, 2], { arc: { centre: [4, 2], sweep: 90 } })]
    expect(wallJoints(bend).has('q')).toBe(false)
    // One leaving a wall at a right angle is mitred to it, as any corner is.
    const square = [wall('a', [0, 0], [4, 0]), wall('q', [4, 0], [2, 2], { arc: { centre: [2, 0], sweep: 90 } })]
    const turned = wallJoints(square).get('q')!
    // CNT-30: inside, the curve's face (a circle of 1.9 m) is cut back to where it crosses the
    // wall's face, 0.1 m up, round the curve; outside it runs on along its tangent 0.1 m past the end.
    expect(turned.start.left).toBeCloseTo(-2 * Math.asin(0.1 / 1.9), 9)
    expect(turned.start.right).toBeCloseTo(0.1, 9)
  })

  it('reads the curved wall as an outside wall all round, and the floor as one space', () => {
    const plan = roundRoom()
    const index = indexPlan(plan)
    expect(wallExposure(index, 'round')).toBe('exterior')
    const spaces = floorSpaces(plan, 'ground', { index })
    expect(spacesKnown(spaces)).toBe(true)
    if (!spacesKnown(spaces)) return
    expect(spaces.spaces).toHaveLength(1)
    expect(spaces.unclaimedArea).toBeLessThan(0.01)
    expect(spaces.mismatches).toEqual([])
  })

  it('gives the gross areas of a round building', () => {
    const figures = planAreaFigures(roundRoom())
    const floor = figures.floors[0]!
    // Outside the walls: a disc of 3.1 m, give or take the pieces and the doorway.
    expect(floor.grossExternal!).toBeGreaterThan(Math.PI * 3.1 * 3.1 * 0.998)
    expect(floor.grossExternal!).toBeLessThan(Math.PI * 3.1 * 3.1 * 1.002)
    expect(floor.grossInternal!).toBeCloseTo(floor.net, 1)
  })

  it('finds no wall fault on a curved wall, and offers no fix that moves one', () => {
    expect(wallFaults(roundRoom())).toEqual([])
    expect(wallFaults(bayRoom()).flatMap((fault) => fault.walls)).not.toContain('bay')
  })

  it('names a curve that changes, in the revision and in the comparison of two plans', () => {
    const plan = bayRoom()
    const deeper = { ...plan, walls: plan.walls.map((w) => (w.id === 'bay' ? { ...w, arc: { centre: [2, 3] as [number, number], sweep: -180 } } : w)) }
    expect(wallRevision(plan.walls[2]!)).not.toBe(wallRevision(deeper.walls[2]!))
    const diff = diffPlans(plan, deeper)
    const change = diff.changes.find((c) => c.entity.id === 'bay')!
    expect(change.props.map((p) => p.key)).toContain('arc')
    expect(change.summary).toContain('curve changed')
  })

  it('faces a round wall every way, room by room, the length of each compass point', () => {
    const facing = planFacing(roundRoom())
    const ways = new Set(facing.walls.filter((w) => w.wall === 'round').map((w) => w.faces))
    expect(ways.size).toBe(8)
    const room = facing.rooms.find((r) => r.room === 'drum')!
    const total = room.walls.reduce((sum, w) => sum + w.length, 0)
    // The whole curve less the doorway, which is no wall.
    expect(total).toBeGreaterThan(6 * Math.PI - 1)
  })

  it('swings a door from its straight edge, and finds nothing in its way', () => {
    const drawing = buildFloorPlan(roundRoom())
    const opening = drawing.openings[0]!
    const swing = doorSwing(opening, 'start', 'left')!
    expect(swing.arc.radius).toBeCloseTo(2 * 3 * Math.sin(0.15), 9)
    // Left of a counter-clockwise curve is its inside: the door opens into the room.
    expect(distance(swing.leaf[1], { x: 5, y: 5 })).toBeLessThan(3)
    const plan = roundRoom([door('d1', 'round', 2, { hinge: 'start', swing: 'left' })])
    expect(validateDoorSweeps(plan, (o) => o).filter((i) => i.code === 'opening/door-blocked')).toEqual([])
  })

  it('takes a curve that runs clockwise, and a curved dividing line', () => {
    const clockwise: FloorPlan = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, start: [0, 3], end: [4, 3], arc: { centre: [2, 3], sweep: -180 } } : w)) }
    const hand = 3.8 * 2.9 + (Math.PI * 1.9 * 1.9) / 2
    expect(Math.abs(roomArea(clockwise.rooms[0]!, indexPlan(clockwise)) - hand) / hand).toBeLessThan(0.001)
    const line: FloorPlan = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, virtual: true, thickness: 0, height: 0 } : w)), openings: [door('d1', 's', 1.5)] }
    const { broken } = validatePlan(line)
    expect(broken.size).toBe(0)
    const drawn = buildFloorPlan(line).walls.find((w) => w.id === 'bay')!
    expect(drawn.slices).toEqual([])
    expect(drawn.curve!.path.length).toBeGreaterThan(100)
    // Measured to the line itself: the half disc of radius 2 over 3.8 × 2.9.
    const toLine = 3.8 * 2.9 + (Math.PI * 2 * 2) / 2
    expect(Math.abs(roomArea(line.rooms[0]!, indexPlan(line)) - toLine) / toLine).toBeLessThan(0.002)
  })

  it('refuses an opening that runs past the end of the curve', () => {
    const plan = bayRoom()
    plan.openings.push({ id: 'far', wall: 'bay', type: 'window', offset: 5.9, width: 1, sill: 0.9, height: 1.2 })
    expect(validatePlan(plan).issues.find((i) => i.id === 'far')?.code).toBe('opening/out-of-wall')
  })
})

describe('exporting a curved wall', () => {
  const options = { projectId: 'p', projectName: 'Drum', now: new Date(0) }

  it('writes the DXF wall faces as arcs, names only the rooms along it as pieces', () => {
    const made = exportPlan(roundRoom(), 'dxf', options)
    expect(made.approximated).toEqual([{ kind: 'room', id: 'drum', floor: 'ground' }])
    const dxf = made.data as string
    // A bulge on a vertex: the stretch to the next one is an arc, on the wall's outline and fill.
    const outline = entitiesOf(dxf).filter((e) => e.type === 'LWPOLYLINE' && e.layer === 'GRID-WALLS-EXTERIOR')
    expect(outline).toHaveLength(1)
    expect(outline[0]!.values(42).filter((b) => b !== 0).length).toBeGreaterThanOrEqual(2)
    const fill = entitiesOf(dxf).filter((e) => e.type === 'HATCH' && e.layer === 'GRID-WALLS-FILL')
    expect(fill[0]!.values(42).filter((b) => b !== 0).length).toBeGreaterThanOrEqual(2)
    expect(dxf).toContain('Rooms along a curved wall, their outlines written as straight pieces (1): "drum"')
    expect(dxf).toContain('GRID-LEFT-OUT')
  })

  it('writes a whole circle with no opening as two half arcs on each face', () => {
    const dxf = exportPlan(roundRoom([]), 'dxf', options).data as string
    const [outline] = entitiesOf(dxf).filter((e) => e.type === 'LWPOLYLINE' && e.layer === 'GRID-WALLS-EXTERIOR')
    const bulges = outline!.values(42)
    expect(bulges).toHaveLength(4)
    for (const bulge of bulges) expect(Math.abs(bulge)).toBeCloseTo(1, 9)
  })

  it('writes a curved dividing line as an arc in the DXF', () => {
    const line: FloorPlan = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, virtual: true, thickness: 0, height: 0 } : w)), openings: [] }
    const dxf = exportPlan(line, 'dxf', options).data as string
    const arcs = entitiesOf(dxf).filter((e) => e.type === 'ARC' && e.layer === 'GRID-WALLS-VIRTUAL')
    expect(arcs).toHaveLength(1)
    expect(arcs[0]!.values(40)).toEqual([2])
  })

  it('writes the IFC axis as a trimmed circle, and names the wall and the room it writes as pieces', () => {
    const made = exportPlan(roundRoom(), 'ifc', options)
    const ifc = made.data as string
    expect(ifc).toMatch(/IFCCIRCLE\(#\d+,3\.\);/)
    expect(ifc).toContain('IFCTRIMMEDCURVE(')
    expect(ifc).toContain("'Grid_Approximated'")
    expect(made.approximated).toEqual([
      { kind: 'wall', id: 'round', floor: 'ground' },
      { kind: 'room', id: 'drum', floor: 'ground' }
    ])
    // The door is a void and a filler, as on a straight wall.
    expect(ifc).toContain("IFCOPENINGELEMENT(")
    expect(ifc).toContain("IFCDOOR(")
  })

  it('writes the OBJ and GLB walls as facets, and says so', () => {
    const obj = exportPlan(roundRoom(), 'obj', options).data as string
    expect(obj).toContain('# Curved walls written as straight pieces (1): "round"')
    expect(obj.split('\n').filter((line) => line.startsWith('o wall_')).length).toBe(1)
    const glb = parseGlb(exportPlan(roundRoom(), 'glb', options).data as Uint8Array)
    const extras = (glb.json.asset as { extras?: { gridApproximated?: { count: number } } }).extras
    expect(extras?.gridApproximated?.count).toBe(2)
  })

  it('writes a plan with no curved wall as before, with nothing approximated', () => {
    const straight = { ...bayRoom(), walls: [wall('s', [0, 0], [4, 0]), wall('e', [4, 0], [4, 3]), wall('n', [4, 3], [0, 3]), wall('w', [0, 3], [0, 0])], rooms: [{ id: 'r', name: 'R', boundary: ['s', 'e', 'n', 'w'] }], openings: [] }
    for (const format of ['dxf', 'ifc', 'obj', 'glb'] as const) {
      const made = exportPlan(straight, format, options)
      expect(made.approximated).toEqual([])
      if (typeof made.data === 'string') expect(made.data).not.toContain('Approximated')
    }
  })
})

describe('rooms text and a curved wall', () => {
  it('reads a floor with a curved wall back in Grid\'s own terms, and writing it again loses nothing', () => {
    const plan = parseFloorPlan(bayRoom())
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([{ floor: 'ground', why: 'wall "bay" is curved, and rooms text writes straight walls only' }])
    const written = compileRoomsText(reading.text)
    expect(written.plan).not.toBeNull()
    expect(written.plan!.walls.find((w) => w.id === 'bay')!.arc).toEqual({ centre: [2, 3], sweep: 180 })
    const again = parseFloorPlan(written.plan)
    expect(roomArea(again.rooms.find((r) => r.id === 'living')!, indexPlan(again))).toBeCloseTo(roomArea(plan.rooms[0]!, indexPlan(plan)), 9)
  })
})

describe('a curved wall in the parts merged from main (HND-2, LVL-4)', () => {
  it('gives a curved wall\'s IFC base quantities along its curve', () => {
    const ifc = exportPlan(bayRoom(), 'ifc', { projectId: 'p', projectName: 'Bay', now: new Date(0) }).data as string
    // The bay: 2π m along its curve, and its body 2π × 0.2 m² from above, give or take the pieces.
    expect(ifc).toContain("IFCQUANTITYLENGTH('Length','Along its axis, from start to end.',$,6.2831853072);")
    const footprint = /IFCQUANTITYAREA\('GrossFootprintArea','[^']*',\$,([0-9.]+)\);/g
    const areas = [...ifc.matchAll(footprint)].map((m) => Number(m[1]))
    expect(areas.some((a) => Math.abs(a - 2 * Math.PI * 0.2) / (2 * Math.PI * 0.2) < 0.001)).toBe(true)
  })

  it('lays a slab and a roof over a round building, the shape of its curve', () => {
    const envelope = planEnvelope(roundRoom())
    const disc = Math.PI * 3.1 * 3.1
    expect(Math.abs(envelope.slabArea! - disc) / disc).toBeLessThan(0.002)
    expect(Math.abs(envelope.roofArea! - disc) / disc).toBeLessThan(0.002)
  })
})

describe('a curved wall in the parts merged from main (LVL-8)', () => {
  it('shows a round wall on every facade, and its door on the side it faces', () => {
    // The door is 2 m along the curve from (8, 5): about 38° round, facing north-east.
    for (const side of ['north', 'east', 'south', 'west'] as const) {
      const facade = planFacade(roundRoom(), side)
      expect(facade.walls, side).toEqual(['round'])
      const width = facade.extent!.u1 - facade.extent!.u0
      expect(width, side).toBeGreaterThan(6.1)
      expect(width, side).toBeLessThan(6.21)
    }
    expect(planFacade(roundRoom(), 'north').openings).toEqual(['d1'])
    expect(planFacade(roundRoom(), 'south').openings).toEqual([])
  })

  it('spreads a pattern along a curved wall, by its length along the curve', () => {
    const plan = { ...bayRoom(), openings: [door('d1', 's', 1.5)], patterns: [{ id: 'row', wall: 'bay', opening: { type: 'window' as const, width: 0.6, height: 1.2, sill: 0.9 }, count: 3, margins: { start: 0.5, end: 0.5 } }] }
    const { plan: expanded, issues } = expandPatterns(plan as never)
    expect(issues).toEqual([])
    const placed = expanded.openings.filter((o) => o.wall === 'bay').map((o) => o.offset)
    // 2π m along the bay: 0.5 to 2π − 0.5, three windows of 0.6 m spread evenly.
    expect(placed).toHaveLength(3)
    expect(placed[0]).toBeCloseTo(0.5, 6)
    expect(placed[2]! + 0.6).toBeCloseTo(2 * Math.PI - 0.5, 5)
    expect(validatePlan(expanded).issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

/** The entities of a DXF, each its type, its layer and the values of a group code in it. */
function entitiesOf(dxf: string): { type: string; layer: string; values: (code: number) => number[] }[] {
  const lines = dxf.split(/\r?\n/)
  const pairs: [number, string][] = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]!.trim()), lines[i + 1]!])
  const start = pairs.findIndex(([code, value], i) => code === 2 && value === 'ENTITIES' && pairs[i - 1]?.[1] === 'SECTION')
  const out: { type: string; layer: string; values: (code: number) => number[] }[] = []
  let current: [number, string][] | null = null
  for (const [code, value] of pairs.slice(start + 1)) {
    if (code === 0) {
      if (current !== null) {
        const own = current
        out.push({ type: own[0]![1], layer: own.find(([c]) => c === 8)?.[1] ?? '', values: (wanted) => own.filter(([c]) => c === wanted).map(([, v]) => Number(v)) })
      }
      if (value === 'ENDSEC') break
      current = [[0, value]]
    } else current?.push([code, value])
  }
  return out
}

describe('a curved wall turned or mirrored for a comparison (WRT-4)', () => {
  it.each(PLAN_TURNS)('%s keeps every curved wall on its circle', (id) => {
    const turned = turnPlan(bayRoom(), id)
    for (const w of turned.walls.filter((x) => x.arc !== undefined)) expect(curveFault(w), `${id} ${w.id}`).toBeNull()
  })
})

describe('a section through a curved wall (CNT-17 with CNT-18)', () => {
  it('cuts the bay where the line crosses it, and faces it beyond, piece by piece', () => {
    // Up the middle of the room: through the south wall and the top of the bay at (2, 5).
    const section = planSection(bayRoom(), { from: { x: 2, y: -1 }, to: { x: 2, y: 6 }, toward: 'right' })
    const bay = section.parts.find((p) => p.kind === 'wall' && p.id === 'bay')
    expect(bay).toBeDefined()
    const across = (id: string): [number, number] => {
      const xs = section.parts.find((p) => p.kind === 'wall' && p.id === id)!.rings[0]!.map((p) => p.x)
      return [Math.min(...xs), Math.max(...xs)]
    }
    const [b0, b1] = across('bay')
    const [s0, s1] = across('s')
    // The bay's axis crosses the line at y = 5, 5 m from the south wall's at y = 0, and the cut
    // is its 0.2 m thickness; through its window, so a sill below and a lintel above.
    expect(Math.abs((b0 + b1) / 2 - (s0 + s1) / 2)).toBeCloseTo(5, 2)
    expect(b1 - b0).toBeCloseTo(0.2, 2)
    expect(bay!.rings).toHaveLength(2)
    expect(section.beyond.filter((f) => f.id === 'bay').length).toBeGreaterThan(2)
  })
})

describe('a curved wall placed by its face (HND-11 with CNT-18)', () => {
  // A round room taped on its inside face: radius 2.9 m, the wall 0.2 m thick. Going
  // counter-clockwise, the left face is the inside one.
  const taped = {
    version: '1',
    walls: [{ id: 'c', start: [2.9, 0], end: [2.9, 0], thickness: 0.2, height: 2.7, kind: 'exterior', face: 'left', arc: { centre: [0, 0], sweep: 360 } }],
    rooms: [{ id: 'r', name: 'Round', boundary: ['c'] }],
    openings: []
  }

  it('reads its centre line half the thickness out along the radius, so the room keeps its taped size', () => {
    const plan = parseFloorPlan(taped)
    const w = plan.walls[0]!
    expect(Math.hypot(w.start[0], w.start[1])).toBeCloseTo(3, 9)
    expect(curveFault(w)).toBeNull()
    const room = roomArea(plan.rooms[0]!, indexPlan(plan))
    expect(Math.abs(room - Math.PI * 2.9 * 2.9) / (Math.PI * 2.9 * 2.9)).toBeLessThan(0.001)
  })

  it('writes its face back round the arc it is moved to', () => {
    const moved = wallWithEnds(taped.walls[0]!, { start: [-3, 0], end: [-3, 0], arc: { centre: [0, 0], sweep: -360 } }, true)
    // Mirrored, the inside face is now its right one, still at the taped 2.9 m.
    expect(moved['face']).toBe('right')
    expect(Math.hypot((moved['start'] as number[])[0]!, (moved['start'] as number[])[1]!)).toBeCloseTo(2.9, 9)
  })
})

describe('a taped length along a curved wall (HND-11 with CNT-18)', () => {
  it('measures a side round the curve, and says a corner on it is not worked out', () => {
    const plan = parseFloorPlan({
      version: '1',
      walls: [{ id: 'c', start: [3, 0], end: [3, 0], thickness: 0.2, height: 2.7, kind: 'exterior', arc: { centre: [0, 0], sweep: 360 } }],
      rooms: [{ id: 'r', name: 'Round', boundary: ['c'] }],
      openings: [],
      taped: [
        { room: 'r', wall: 'c', length: 2 * Math.PI * 2.9 },
        { room: 'r', from: ['c', 'c'], to: ['c', 'c'], length: 1 }
      ]
    })
    const [side, corner] = tapedLengths(plan)
    expect(side!.state).toBe('agrees')
    expect(Math.abs(side!.drawn! - 2 * Math.PI * 2.9) / (2 * Math.PI * 2.9)).toBeLessThan(0.001)
    expect(corner!.state).toBe('not-measured')
    expect(corner!.missing).toBe('no-corner')
  })
})

/** A camera record with only what a pick reads set (VEW-4's test does the same). */
function looking(position: Point3, direction: Point3): CameraRecord {
  return { position, direction, up: [0, 0, 1], fieldOfView: 90, aspectRatio: 1, cut: null } as unknown as CameraRecord
}

describe('a click on a curved wall in the 3D preview (VEW-4 with CNT-18)', () => {
  it('meets the bay along its curve: its window where the window is, the wall beside it', () => {
    // The window runs 2.5 to 3.7 m along the bay from (4, 3): its middle is at 3.1 m, the top of the curve near (2.04, 5).
    const middle = wallPointAt(bayRoom().walls[2]!, 3.1)
    expect(pickInModel(bayRoom(), looking([middle.x, 10, 1.5], [0, -1, 0]), 0.5, 0.5)).toMatchObject({ id: 'win', kind: 'window' })
    expect(pickInModel(bayRoom(), looking([3.9, 10, 0.5], [0, -1, 0]), 0.5, 0.5)).toMatchObject({ id: 'bay', kind: 'wall' })
  })

  it('meets a whole circle, whose start and end are one point, and its door', () => {
    expect(pickInModel(roundRoom(), looking([5, -5, 1.2], [0, 1, 0]), 0.5, 0.5)).toMatchObject({ id: 'round', kind: 'wall' })
    const door = wallPointAt(roundRoom().walls[0]!, 2.45)
    const out = { x: (door.x - 5) * 3, y: (door.y - 5) * 3 }
    expect(pickInModel(roundRoom(), looking([5 + out.x, 5 + out.y, 1], [-out.x, -out.y, 0]), 0.5, 0.5)).toMatchObject({ id: 'd1', kind: 'door' })
  })
})

describe('a curved wall in a plan with phases (CNT-10 with CNT-18)', () => {
  /** The bay room, with a garden wall on a half circle to be demolished and a curved line to go with it. */
  function phased(): FloorPlan {
    const plan = bayRoom()
    return {
      ...plan,
      walls: [
        ...plan.walls,
        wall('garden', [10, 0], [14, 0], { arc: { centre: [12, 0], sweep: 180 }, phase: 'demolished' }),
        wall('edge', [10, -5], [14, -5], { arc: { centre: [12, -5], sweep: 180 }, virtual: true, thickness: 0, height: 0, phase: 'demolished' })
      ]
    }
  }
  const options = { projectId: 'p', projectName: 'Garden', now: new Date(0) }

  it('draws the demolished curve with its arc, and frames it', () => {
    const drawing = buildFloorPlan(phased())
    const garden = drawing.walls.find((w) => w.id === 'garden')!
    expect(garden.phase).toBe('demolished')
    expect(garden.curve!.radius).toBeCloseTo(2, 9)
    // The line curves south, below its ends: the frame takes it in.
    expect(drawing.bounds.min.y).toBeLessThan(-6.9)
    expect(drawing.bounds.max.y).toBeGreaterThan(1.9)
  })

  it('writes the demolished curves on the DXF\'s demolished layer as arcs, with no fill', () => {
    const dxf = exportPlan(phased(), 'dxf', options).data as string
    const demolished = entitiesOf(dxf).filter((e) => e.layer === 'GRID-WALLS-DEMOLISHED')
    const outline = demolished.filter((e) => e.type === 'LWPOLYLINE')
    expect(outline).toHaveLength(1)
    expect(outline[0]!.values(42).filter((b) => b !== 0).length).toBeGreaterThanOrEqual(2)
    expect(demolished.filter((e) => e.type === 'ARC')).toHaveLength(1)
    expect(demolished.filter((e) => e.type === 'HATCH')).toHaveLength(0)
    expect(entitiesOf(dxf).filter((e) => e.type === 'HATCH' && e.layer.startsWith('GRID-WALLS-FILL'))).toHaveLength(3)
  })

  it('gives the curved wall its phase in the IFC', () => {
    const ifc = exportPlan(phased(), 'ifc', options).data as string
    const garden = /#(\d+)=IFCWALLSTANDARDCASE\('[^']*',#\d+,'garden'/.exec(ifc)![1]!
    const phases = [...ifc.matchAll(/#(\d+)=IFCPROPERTYSINGLEVALUE\('Phase',\$,IFCLABEL\('(\w+)'\),\$\);/g)]
    const sets = [...ifc.matchAll(/#(\d+)=IFCPROPERTYSET\('[^']*',#\d+,'Grid_Phase',\$,\(#(\d+)\)\);/g)]
    // The one phase set related to the garden wall says it is to be demolished.
    const rels = [...ifc.matchAll(/IFCRELDEFINESBYPROPERTIES\([^;]*\(#(\d+)\),#(\d+)\);/g)].filter((m) => m[1] === garden)
    const own = sets.filter((s) => rels.some((m) => m[2] === s[1]))
    expect(own).toHaveLength(1)
    expect(phases.find((v) => v[1] === own[0]![2])![2]).toBe('demolished')
  })
})

describe('a point on a curve, by how far along it lies (CNT-18)', () => {
  it('reads back the distance a point was put at, either way round, and takes a point past an end to the nearer end', () => {
    const bay = wallCurve(bayRoom().walls[2]!)!
    for (const s of [0, 1, 3.1, 6]) expect(curveAlong(bay, wallPointAt(bayRoom().walls[2]!, s))).toBeCloseTo(s, 9)
    const clockwise = wall('c', [0, 3], [4, 3], { arc: { centre: [2, 3], sweep: -180 } })
    expect(curveAlong(wallCurve(clockwise)!, wallPointAt(clockwise, 2))).toBeCloseTo(2, 9)
    // Below the bay's centre, just past its start (4, 3) and its end (0, 3).
    expect(curveAlong(bay, { x: 3.9, y: 2 })).toBe(0)
    expect(curveAlong(bay, { x: 0.1, y: 2 })).toBeCloseTo(bay.length, 9)
  })
})

describe('a curved wall inside a floor outline (BRF-4 with CNT-18)', () => {
  it('joins the round wall with the outline the floor states: the slab is the square, and nothing reaches past it', () => {
    const square = [[1, 1], [9, 1], [9, 9], [1, 9]]
    const plan = parseFloorPlan({ ...roundRoom(), floors: [{ id: 'ground', name: 'Ground floor', level: 0, outline: square }] })
    expect(planEnvelope(plan).slabArea).toBeCloseTo(64, 6)
    // A smaller outline: the drum reaches past it, and the slab is the two joined.
    const small = parseFloorPlan({ ...roundRoom(), floors: [{ id: 'ground', name: 'Ground floor', level: 0, outline: [[4, 4], [12, 4], [12, 6], [4, 6]] }] })
    const disc = Math.PI * 3.1 * 3.1
    const joined = planEnvelope(small).slabArea!
    expect(joined).toBeGreaterThan(disc)
    expect(joined).toBeLessThan(disc + 16)
  })
})

describe('a curved wall in the parts merged from main (CNT-4, LVL-5)', () => {
  it('grows a flat round a bay to the middle of the curved wall, as of the straight ones (CNT-4)', () => {
    const plan: FloorPlan = { ...bayRoom(), flats: [{ id: 'f1', name: 'Flat 1', rooms: ['living'] }] } as FloorPlan
    const [flat] = buildFloorPlan(plan).flats
    // To the middle of every wall: 4 × 3 and the half disc of the bay's axis, radius 2.
    const hand = 4 * 3 + (Math.PI * 2 * 2) / 2
    const ring = flat!.rings[0]!
    expect(Math.abs(Math.abs(area(ring)) - hand) / hand).toBeLessThan(0.002)
  })

  it('allows a thick round wall its thickness when the floor above stands a little off it (LVL-5)', () => {
    // Two drums, 0.45 m thick, the first floor's 0.2 m north of the ground floor's: each reaches
    // past the other by at most 0.2 m, within half the wall and `stackShift`. The circles start
    // in the south, so their ends are nowhere near the stretch in the north.
    const drum = (id: string, floor: string, dy: number): Wall => wall(id, [5, 2 + dy], [5, 2 + dy], { arc: { centre: [5, 5 + dy], sweep: 360 }, thickness: 0.45, floor })
    const plan = parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground', level: 0, height: 3 }, { id: 'first', name: 'First', level: 1, height: 3 }],
      walls: [drum('g', 'ground', 0), drum('f', 'first', 0.2)],
      rooms: [{ id: 'rg', name: 'Below', boundary: ['g'], floor: 'ground' }, { id: 'rf', name: 'Above', boundary: ['f'], floor: 'first' }],
      openings: []
    })
    expect(validatePlan(plan).issues.filter((i) => i.code === 'floor/out-of-line')).toEqual([])
  })
})

describe('a curved wall through floors (LVL-5 with CNT-18)', () => {
  /** The bay rising through the first floor, 2.7 m above its level. */
  function tower(): FloorPlan {
    const plan = bayRoom()
    return parseFloorPlan({
      ...plan,
      floors: [{ id: 'ground', name: 'Ground', level: 0, height: 3 }, { id: 'first', name: 'First', level: 1, height: 3 }],
      walls: plan.walls.map((w) => (w.id === 'bay' ? { ...w, through: 'first' } : w))
    })
  }

  it('raises its pieces once, its whole rise, and a click meets it high up', () => {
    // Each floor's model is raised from its slice: the ground floor's holds the whole bay, the first's none of it.
    const bays = buildScene(planForFloor(tower(), 'ground')).walls.filter((w) => w.id === 'bay')
    expect(bays).toHaveLength(1)
    expect(buildScene(planForFloor(tower(), 'first')).walls.some((w) => w.id === 'bay')).toBe(false)
    const tops = bays[0]!.pieces!.map((p) => p.elevation.height)
    // Its whole rise: the first floor's level over the ground floor's (its height and slab), and 2.7 m.
    const rise = wallRise(tower(), tower().walls[2]!)
    expect(rise).toBeGreaterThan(5.7)
    expect(Math.max(...tops)).toBeCloseTo(rise, 6)
    const top = wallPointAt(tower().walls[2]!, 1)
    expect(pickInModel(tower(), looking([top.x + (top.x - 2) * 3, top.y + (top.y - 3) * 3, 5], [-(top.x - 2), -(top.y - 3), 0]), 0.5, 0.5)).toMatchObject({ id: 'bay', kind: 'wall' })
  })
})

describe('a curved wall in every language (MSG-11 with CNT-18)', () => {
  it('says why a curve cannot be built by its key: the same English, and Spanish when asked', async () => {
    await loadLanguage('es')
    const plan = bayRoom()
    plan.walls[2] = { ...plan.walls[2]!, end: [0.5, 3] }
    const found = validatePlan(plan).issues.find((i) => i.code === 'wall/arc-ends-apart')!
    expect(found.said.key).toBe('issue.wall/arc-ends-apart')
    expect(found.message).toBe(english(found.said))
    expect(found.message).toMatch(/^Wall "bay" turns 180° round \(2(\.0+)?, 3(\.0+)?\) from its start, which takes it to .* m off the curve\. Move its end there/)
    const spanish = say('es', found.said.key, found.said.values)
    expect(spanish).toMatch(/^El muro "bay" gira 180° en torno a \(2(,0+)?; 3(,0+)?\) desde su inicio/)
    const tight = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, thickness: 4.5 } : w)) }
    const tooTight = validatePlan(tight).issues.find((i) => i.code === 'wall/arc-too-tight')!
    expect(say('es', tooTight.said.key, tooTight.said.values)).toMatch(/^El muro "bay" se curva con un radio de 2(,0+)? m/)
  })
})
