/**
 * LVL-29: a roof past its walls: its overhang, all round or side by side, and its canopies and
 * brise-soleil, in the envelope, the 3D shell, the plan's dashed lines, elevations, sections and
 * the check.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planEnvelope } from '../envelope'
import { buildScene, sceneShell } from '../scene3d'
import { toObj } from '../export/obj'
import { planForFloor } from '../floors'
import { floorAbove } from '../above'
import { planFacade } from '../facade'
import { planSection } from '../section'
import { validatePlan } from '../validate'
import { indexPlan } from '../plan'
import { intersectionArea, multiArea } from '../polygons'
import { overhangSides } from '../roofParts'

type Raw = Record<string, unknown>

const wall = (id: string, start: number[], end: number[], floor = 'ground'): Raw => ({ id, start, end, thickness: 0.3, kind: 'exterior', height: 2.7, floor })

/** An 8 by 6 box on its walls' centre lines: its outline, to the walls' outer faces, is 8.3 by 6.3. */
function box(roof: Raw | undefined, upper = false): FloorPlan {
  const floors: Raw[] = [{ id: 'ground', name: 'Ground', level: 0, ...(roof === undefined ? {} : { roof }) }]
  const walls = [wall('s', [0, 0], [8, 0]), wall('e', [8, 0], [8, 6]), wall('n', [8, 6], [0, 6]), wall('w', [0, 6], [0, 0])]
  const rooms: Raw[] = [{ id: 'r', name: 'Hall', boundary: ['s', 'e', 'n', 'w'], use: 'living' }]
  if (upper) {
    // A first floor over the box's west half only.
    floors.push({ id: 'first', name: 'First', level: 1 })
    walls.push(wall('fs', [0, 0], [4, 0], 'first'), wall('fe', [4, 0], [4, 6], 'first'), wall('fn', [4, 6], [0, 6], 'first'), wall('fw', [0, 6], [0, 0], 'first'))
    rooms.push({ id: 'f', name: 'Study', boundary: ['fs', 'fe', 'fn', 'fw'], use: 'office', floor: 'first' })
  }
  return parseFloorPlan({ floors, walls, rooms, openings: [] })
}

const roofOf = (plan: FloorPlan, floor = 'ground') => planEnvelope(plan).floors.find((f) => f.floor === floor)!.roof!

describe('a roof overhang (LVL-29)', () => {
  it('runs a flat roof past its walls all round', () => {
    const none = roofOf(box({ shape: 'flat', eaves: 2.7 }))
    expect(none.area).toBeCloseTo(8.3 * 6.3, 3)
    expect(none.overhangArea).toBeUndefined()
    const roof = roofOf(box({ shape: 'flat', eaves: 2.7, overhang: 0.6 }))
    expect(roof.area).toBeCloseTo(9.5 * 7.5, 3)
    expect(roof.overhangArea).toBeCloseTo(9.5 * 7.5 - 8.3 * 6.3, 3)
    expect(roof.slopeArea).toBeCloseTo(roof.area, 3)
  })

  it('runs it side by side, a side left out having none', () => {
    const roof = roofOf(box({ shape: 'flat', eaves: 2.7, overhang: { south: 1, east: 0.5 } }))
    expect(roof.area).toBeCloseTo((8.3 + 0.5) * (6.3 + 1), 3)
    expect(overhangSides({ shape: 'flat', eaves: 2.7, overhang: { south: 1 } })).toEqual({ north: 0, east: 0, south: 1, west: 0 })
  })

  it("carries a pitched roof's planes on past the eaves, so its edge is lower than the eaves", () => {
    const roof = roofOf(box({ shape: 'gable', pitch: 45, eaves: 2.7, ridgeRuns: 'east-west', overhang: 0.5 }))
    const lowest = Math.min(...roof.facets.flatMap((f) => f.pieces.flat(2).map(([x, y]) => f.plane.z0 + f.plane.gx * x + f.plane.gy * y)))
    // The eaves stand on the walls' centre lines; the overhang's edge is 0.15 + 0.5 m further out.
    expect(lowest).toBeCloseTo(2.7 - 0.65, 3)
    expect(roof.slopeArea).toBeCloseTo((9.3 * 7.3) * Math.SQRT2, 2)
  })

  it('stops where a floor above stands', () => {
    const plan = box({ shape: 'flat', eaves: 2.7, overhang: 0.6 }, true)
    const roof = roofOf(plan)
    // The east half is roofed: the overhang runs round it, along the first floor's faces, never into it.
    const first = planEnvelope(plan).floors.find((f) => f.floor === 'first')!.outline!
    expect(intersectionArea(roof.pieces, first)).toBeCloseTo(0, 6)
    const xs = roof.pieces.flat(2).map(([x]) => x)
    expect(Math.max(...xs)).toBeCloseTo(8.75, 3)
    expect(Math.min(...xs)).toBeLessThan(4.15)
    const ys = roof.pieces.flat(2).map(([, y]) => y)
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([expect.closeTo(-0.75, 3), expect.closeTo(6.75, 3)])
  })

  it('draws the roof past the walls dashed on the floor plan', () => {
    const plain = floorAbove(planForFloor(box({ shape: 'flat', eaves: 2.7 }), 'ground'))
    expect(plain.lines).toEqual([])
    const above = floorAbove(planForFloor(box({ shape: 'flat', eaves: 2.7, overhang: 0.6 }), 'ground'))
    const xs = above.lines.flat().map((p) => p.x)
    expect(above.lines.length).toBeGreaterThan(0)
    expect(Math.min(...xs)).toBeCloseTo(-0.75, 3)
    expect(Math.max(...xs)).toBeCloseTo(8.75, 3)
  })

  it('replaces the projection an elevation drew for a pitched roof', () => {
    const roofSpan = (plan: FloorPlan): number[] => {
      const faces = planFacade(plan, 'south').faces.filter((f) => f.kind === 'roof' || f.kind === 'roof-plane')
      return [Math.min(...faces.map((f) => f.u0)), Math.max(...faces.map((f) => f.u1))]
    }
    const [a0, a1] = roofSpan(box({ shape: 'gable', pitch: 40, eaves: 2.7, ridgeRuns: 'east-west' }))
    const [b0, b1] = roofSpan(box({ shape: 'gable', pitch: 40, eaves: 2.7, ridgeRuns: 'east-west', overhang: 0.9 }))
    expect(b1 - b0).toBeCloseTo(8.3 + 1.8, 2)
    expect(b1 - b0).toBeGreaterThan(a1 - a0)
  })
})

describe('canopies and brise-soleil (LVL-29)', () => {
  const parts = [
    { id: 'entrance', kind: 'canopy', side: 'south', depth: 1.2, height: 2.4, width: 3, at: [4, 0] },
    { id: 'shade', kind: 'brise-soleil', side: 'west', depth: 0.8, height: 2.2, blades: 4 }
  ]
  const plan = (): FloorPlan => box({ shape: 'flat', eaves: 2.7, parts })

  it('stands each part out from its side, at its height, in no roof area', () => {
    const roof = roofOf(plan())
    expect(roof.parts).toBe(2)
    expect(roof.area).toBeCloseTo(8.3 * 6.3, 3)
    const canopy = roof.facets.find((f) => f.part?.id === 'entrance')!
    expect(canopy.plane.z0).toBe(2.4)
    expect(canopy.area).toBeCloseTo(3 * 1.2, 4)
    const ys = canopy.pieces.flat(2).map(([, y]) => y)
    expect(Math.max(...ys)).toBeCloseTo(-0.15, 4)
    expect(Math.min(...ys)).toBeCloseTo(-1.35, 4)
    const xs = canopy.pieces.flat(2).map(([x]) => x)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([expect.closeTo(2.5, 4), expect.closeTo(5.5, 4)])
    const shade = roof.facets.find((f) => f.part?.id === 'shade')!
    expect(shade.part?.kind).toBe('brise-soleil')
    expect(shade.pieces.length).toBe(4)
    // The whole west side, out to 0.8 m past its face.
    const sx = shade.pieces.flat(2).map(([x]) => x)
    expect(Math.min(...sx)).toBeGreaterThan(-0.15 - 0.8 - 1e-9)
    expect(Math.max(...sx)).toBeLessThan(-0.15)
    expect(multiArea(shade.pieces)).toBeCloseTo(shade.area, 6)
  })

  it('is in the 3D shell with the roof, raised to its own height', () => {
    const shell = sceneShell(planForFloor(plan(), 'ground'))!
    const raised = shell.roof!.pieces.filter((p) => p.rise !== undefined)
    // Four blades and the canopy, each lifted from the roof's underside to its own.
    expect(raised.length).toBe(5)
    expect(raised.map((p) => shell.roof!.bottom + p.rise!.z0).sort()).toEqual([2.2, 2.2, 2.2, 2.2, 2.4])
  })

  it('is written in the OBJ with the roof', () => {
    const obj = toObj(buildScene(planForFloor(plan(), 'ground')))
    const roofLines = obj.split('\n')
    const start = roofLines.findIndex((l) => /^[og] .*roof/.test(l))
    expect(start).toBeGreaterThan(-1)
    // A vertex at the canopy's front edge, 1.35 m south of the walls' centre line, at its underside.
    const vertices = roofLines.filter((l) => l.startsWith('v ')).map((l) => l.split(' ').slice(1).map(Number))
    const near = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) < 1e-3
    expect(vertices.some((v) => near(v[0], 2.5) && v.some((c) => near(c, 2.4)) && v.some((c) => near(Math.abs(c), 1.35)))).toBe(true)
  })

  it('is dashed on the plan, its back edge on the wall left out', () => {
    const above = floorAbove(planForFloor(plan(), 'ground'))
    const ys = above.lines.flat().map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(-1.35, 3)
  })

  it('shows in an elevation and is cut in a section at its height', () => {
    const faces = planFacade(plan(), 'south').faces.filter((f) => f.kind === 'roof' && Math.abs(f.bottom - 2.4) < 1e-6)
    expect(faces.length).toBeGreaterThan(0)
    const section = planSection(plan(), { from: { x: 4, y: -3 }, to: { x: 4, y: 8 }, toward: 'right' })
    const cut = section.parts.filter((p) => p.kind === 'roof' && p.id === 'entrance')
    expect(cut.length).toBe(1)
    expect(Math.min(...cut[0]!.rings.flat().map((p) => p.y))).toBeCloseTo(2.4, 4)
  })

  it('names a part with no outside wall within its width, and leaves it out', () => {
    const far = box({ shape: 'flat', eaves: 2.7, parts: [{ id: 'lost', kind: 'canopy', side: 'south', depth: 1, height: 2.4, width: 2, at: [30, 0] }] })
    expect(roofOf(far).parts).toBeUndefined()
    const { issues } = validatePlan(far, indexPlan(far))
    const found = issues.filter((i) => i.code === 'floor/roof-part-misplaced')
    expect(found.length).toBe(1)
    expect(found[0]!.message).toContain('lost')
    expect(validatePlan(plan(), indexPlan(plan())).issues.filter((i) => i.code === 'floor/roof-part-misplaced')).toEqual([])
  })
})
