/**
 * LVL-26: a room that states its height stands its own walls to it. The storey keeps the height of
 * its other walls, the flat roof steps up over the room, the room has its ceiling there, the walls
 * are not asked about against the storey, and a wall of one floor standing in the space of a wall
 * of a floor above it is said (`wall/same-space`).
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { validatePlan } from '../validate'
import { indexPlan } from '../plan'
import { floorElevations } from '../elevations'
import { sceneShell, buildScene } from '../scene3d'
import { sceneInterior } from '../interior'
import { exportPlan } from '../../export/planExport'
import { parseGlb, readMeshes } from '../export/__tests__/glb-reader'

function written(lines: readonly string[]): FloorPlan {
  const result = compileRoomsText(lines.join('\n'))
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const codes = (plan: FloorPlan): string[] => validatePlan(plan, indexPlan(plan)).issues.map((i) => i.code)

const THEATRE = ['walls outside 0.3 inside 0.1', 'floor g "Ground" level 0 height 4.25', 'room foyer "Foyer" - 12 x 10 at 0,0', 'room tower "Fly tower" - 14 x 10 east of foyer height 26']

describe('a room taller than its storey (LVL-26)', () => {
  it('keeps the storey at its other walls and steps the roof up over the room', () => {
    const plan = written(THEATRE)
    expect(Math.max(...plan.walls.map((w) => w.height))).toBe(26)
    expect(floorElevations(plan).floors.get('g')?.clearHeight).toBe(4.25)
    const roof = sceneShell(plan)?.roof
    expect(roof).toBeTruthy()
    const raised = roof!.pieces.filter((p) => p.rise !== undefined)
    expect(raised.length).toBeGreaterThan(0)
    expect(roof!.bottom + raised[0]!.rise!.z0).toBeCloseTo(26, 6)
  })

  it('gives the room its ceiling at its height', () => {
    const plan = written(THEATRE)
    const interior = sceneInterior(plan, buildScene(plan), 4.25)
    expect(interior.ceilings.find((c) => c.room.endsWith('tower'))?.z).toBeCloseTo(26, 6)
    expect(interior.ceilings.find((c) => c.room.endsWith('foyer'))?.z).toBeCloseTo(4.25, 6)
  })

  it('does not ask about walls a room raises or stops against the storey the floor states', () => {
    const plan = written([...THEATRE, 'room duct "Duct" - 1 x 10 north of foyer align west height 0.9'])
    expect(codes(plan)).not.toContain('wall/above-storey')
    expect(codes(plan)).not.toContain('floor/wall-heights-differ')
    const own = written(['walls outside 0.3 inside 0.1', 'floor g "Ground" level 0 height 4.25', 'room foyer "Foyer" - 12 x 10 at 0,0', 'wall foyer north height 6'])
    expect(codes(own)).toContain('wall/above-storey')
  })

  it('stacks the floor above on the storey, not on the raised walls', () => {
    const plan = written(['walls outside 0.3 inside 0.1', 'floor g "Ground" level 0', 'room nave "Nave" - 10 x 30 at 0,0 height 14', 'room aisle "Aisle" - 4 x 30 east of nave', 'floor f1 "Gallery" level 1', 'room gallery "Gallery" - 4 x 30 at 10.1,0'])
    expect(floorElevations(plan).floors.get('f1')?.floorLevel).toBeCloseTo(2.95, 6)
  })
})

describe('a room taller or lower than its storey in a GLB (LVL-26)', () => {
  const ids = { projectId: 'p', projectName: 'Theatre', now: new Date(0) }
  const plan = (): FloorPlan => written([...THEATRE, 'room duct "Duct" - 1 x 10 north of foyer align west height 0.9'])
  const tops = (walls: 'whole' | 'rooms'): Map<string, number> => {
    const meshes = readMeshes(parseGlb(exportPlan(plan(), 'glb', { ...ids, walls }).data as Uint8Array))
    return new Map(meshes.map((m) => [m.name, Math.max(...m.points.map((p) => p.y))] as const))
  }

  it('stands each wall as high as the rooms it bounds, whole or split by room, and steps its roof up', () => {
    for (const walls of ['whole', 'rooms'] as const) {
      const top = tops(walls)
      expect(top.get('wall_w-foyer-tower')).toBeCloseTo(26, 6)
      expect(top.get('wall_ext-north-1')).toBeCloseTo(0.9, 6)
      expect(top.get('wall_ext-south-1')).toBeCloseTo(4.25, 6)
    }
    const meshes = readMeshes(parseGlb(exportPlan(plan(), 'glb', ids).data as Uint8Array))
    const roof = meshes.find((m) => m.name === 'roof_g')!
    // The roof's underside over the foyer at the storey, over the tower at its top, and nothing of
    // the storey's piece over the tower: each face's middle, in the plan (x east, -z north).
    const middles = roof.triangles.map((t) => t.map((i) => roof.points[i]!)).map((ps) => ({ x: ps.reduce((a, p) => a + p.x, 0) / 3, y: ps.reduce((a, p) => a - p.z, 0) / 3, z: ps.reduce((a, p) => a + p.y, 0) / 3 }))
    const under = (x0: number, x1: number): number[] => middles.filter((p) => p.x > x0 && p.x < x1 && p.y > 0.5 && p.y < 9.5).map((p) => p.z)
    expect(Math.min(...under(0.5, 11.5))).toBeCloseTo(4.25, 6)
    expect(Math.max(...under(0.5, 11.5))).toBeCloseTo(4.5, 6)
    expect(Math.min(...under(12.6, 25.6))).toBeCloseTo(26, 6)
  })
})

describe('walls of two floors in the same space (LVL-26)', () => {
  const annex = (north: string): FloorPlan =>
    written(['walls outside 0.3 inside 0.1', 'floor g "Annex" level 0 height 3', 'room annex "Annex" - 6 x 4 at 0,0', ...(north === '' ? [] : [north]), 'floor m "Mezzanine" level 1', 'room mezz "Mezzanine" - 6 x 4 at 0,0'])

  it('says a wall that rises past the floor above where a wall of it stands', () => {
    const plan = annex('wall annex north height 8')
    const issue = validatePlan(plan, indexPlan(plan)).issues.find((i) => i.code === 'wall/same-space')
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('past the level of floor "Mezzanine"')
    expect(issue?.message).toMatch(/for 6\.\d+ m/)
  })

  it('says nothing where the walls stop at the floor above', () => {
    expect(codes(annex(''))).not.toContain('wall/same-space')
  })
})
