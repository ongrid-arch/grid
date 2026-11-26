/**
 * LVL-4: the lab's findings on slabs, roofs and the ground, with the lab's own numbers.
 *
 * - VE-4 (AU3 re-run): the OBJ and GLB of a floor held no slab, so the stacked two-storey model
 *   showed 0.25 m of air between its floors; the odd house's single-storey living room had no roof;
 *   the IFC had no roof object and sealed every stair at every floor.
 * - AC-6: the roof taken as the top floor's outline is 43.99 m² on the odd house; the true flat
 *   roof is 83.31 m² (each floor's outline less the floor above: 39.32 over the ground floor and
 *   43.99 over the first). The quantities line is in the command's tests.
 * - VE-7: a basement flat's windows lie below the ground, and nothing said so.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '../../test-support/lab'
import { exportPlan } from '../../export/planExport'
import { parseGlb, readMeshes } from '../export/__tests__/glb-reader'
import { checkPlanSanity } from '../rules/check'
import { floorElevations } from '../elevations'
import { planEnvelope } from '../envelope'
import { inPieces } from '../polygons'
import type { FloorPlan } from '../plan'

const ODD = 'F/scenarios/odd-house.json'
/** The odd house and every copy of it the lab kept. */
const ODD_COPIES = [
  'AU1/scenarios/AR-1/odd-house.json',
  'AU2/scenarios/F-odd-house/plan.json',
  'AU2/scenarios/Q20/odd-house.json',
  'AU2/scenarios/Q20/odd-house/plan.json',
  'AU2/scenarios/Q20/orig/odd-house.json',
  'AU2/scenarios/Q20/orig/odd-house/plan.json',
  'AU4/scenarios/K/scenarios/f-odd-house.json',
  ODD,
  'K/scenarios/_roundtrip/f-odd-house-back.json',
  'K/scenarios/f-odd-house.json',
  'N/scenarios/odd-house.json',
  'O/scenarios/odd-house.json',
  'Q/scenarios/part1/odd-house.json',
  'Q/scenarios/part1/orig/odd-house.json'
]

const OPTIONS = { projectId: 'lab', projectName: 'Odd house', now: new Date('2026-11-22T00:00:00Z') }

/** The z range of each named object of an OBJ file. */
function objRanges(text: string): Map<string, { min: number; max: number }> {
  const ranges = new Map<string, { min: number; max: number }>()
  let current: { min: number; max: number } | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('o ')) {
      current = { min: Infinity, max: -Infinity }
      ranges.set(line.slice(2), current)
    } else if (line.startsWith('v ') && current !== null) {
      const z = Number(line.split(' ')[3])
      current.min = Math.min(current.min, z)
      current.max = Math.max(current.max, z)
    }
  }
  return ranges
}

/**
 * The storeys of a plan as the whole building's OBJ holds them (VEW-64): every floor in one file,
 * each at its elevation, so the file's heights are the building's. The lab lifted each floor's own
 * file to its floor level by hand.
 */
function stacked(plan: FloorPlan): { floor: string; level: number; top: number; ranges: Map<string, { min: number; max: number }> }[] {
  const levels = floorElevations(plan).floors
  const ranges = objRanges(exportPlan(plan, 'obj', OPTIONS).data as string)
  return ['ground', 'first'].map((floor) => {
    const level = levels.get(floor)!
    return { floor, level: level.floorLevel, top: level.floorLevel + level.clearHeight, ranges }
  })
}

describe('VE-4: slabs in the OBJ and GLB files', () => {
  it('gives each floor of the odd house its slab, so the stacked model has no air between its floors', () => {
    const [ground, first] = stacked(labPlan(ODD))
    // Before LVL-4 neither file held a slab: the first floor stood at 2.95 m on the ground floor's
    // 2.70 m walls with nothing between them.
    expect(ground!.top).toBeCloseTo(2.7, 9)
    expect(first!.level).toBeCloseTo(2.95, 9)
    const slab = first!.ranges.get('slab_first')
    expect(slab, 'the first floor file has a slab').toBeDefined()
    expect(slab!.min).toBeCloseTo(ground!.top, 9)
    expect(slab!.max).toBeCloseTo(first!.level, 9)
    // The ground floor stands on its own slab, and its single-storey part carries the roof.
    expect(ground!.ranges.get('slab_ground')).toEqual({ min: -0.25, max: 0 })
    const roof = ground!.ranges.get('roof_ground')
    expect(roof).toBeDefined()
    expect(roof!.min).toBeCloseTo(2.7, 9)
    expect(roof!.max).toBeCloseTo(2.95, 9)
  })

  it('writes the same slab and roof into the GLB, each floor at its elevation', () => {
    const plan = labPlan(ODD)
    const levels = floorElevations(plan).floors
    for (const floor of ['ground', 'first']) {
      const level = levels.get(floor)!.floorLevel
      const meshes = readMeshes(parseGlb(exportPlan(plan, 'glb', { ...OPTIONS, floorId: floor }).data as Uint8Array))
      // glTF is Y up: a model height is the stored y.
      const heights = (name: string): number[] => {
        const mesh = meshes.find((m) => m.name === name)
        expect(mesh, `${floor}: ${name}`).toBeDefined()
        const ys = mesh!.points.map((p) => p.y)
        return [Math.min(...ys), Math.max(...ys)]
      }
      const [bottom, top] = heights(`slab_${floor}`)
      expect(bottom).toBeCloseTo(level - 0.25, 6)
      expect(top).toBeCloseTo(level, 6)
      heights(`roof_${floor}`)
    }
  })
})

describe('VE-4 and AC-6: the odd house has a roof over its single-storey living room', () => {
  it('roofs 39.32 m² of the ground floor and 43.99 m² of the first: 83.31 m² in all, not the top floor\'s 43.99', () => {
    const envelope = planEnvelope(labPlan(ODD))
    const ground = envelope.floors.find((f) => f.floor === 'ground')!
    const first = envelope.floors.find((f) => f.floor === 'first')!
    expect(ground.outlineArea).toBeCloseTo(83.31, 2)
    expect(first.outlineArea).toBeCloseTo(43.99, 2)
    expect(ground.roof!.area).toBeCloseTo(39.32, 2)
    expect(first.roof!.area).toBeCloseTo(43.99, 2)
    expect(envelope.roofArea).toBeCloseTo(83.31, 2)
  })

  it('covers the east half of the living room, which has nothing above it, on every copy of the odd house', () => {
    for (const name of ODD_COPIES) {
      const plan = labPlan(name)
      const envelope = planEnvelope(plan)
      const [lower, upper] = envelope.floors
      // The living room's east half (x 5 to 10) has nothing above it; its west part lies under the bathroom.
      expect(inPieces(lower!.roof!.pieces, { x: 7.5, y: 3 }), name).toBe(true)
      expect(inPieces(lower!.roof!.pieces, { x: 4, y: 2 }), name).toBe(false)
      expect(inPieces(upper!.roof!.pieces, { x: 4, y: 2 }), name).toBe(true)
    }
  })

  it('opens the first floor over the stair, and holds roof objects and that opening in the IFC', () => {
    const plan = labPlan(ODD)
    const first = planEnvelope(plan).floors.find((f) => f.floor === 'first')!
    expect(first.slab!.openings.map((o) => [o.kind, o.via])).toEqual([['stair-room', 'g-stair|f-landing']])
    expect(inPieces(first.slab!.pieces, { x: 1.5, y: 2 })).toBe(false)
    expect(inPieces(first.slab!.pieces, { x: 1.5, y: 6 })).toBe(true)
    const ifc = exportPlan(plan, 'ifc', OPTIONS).data as string
    expect(ifc.match(/IFCROOF\(/g)).toHaveLength(2)
    expect(ifc.match(/\.ROOF\.\);/g)).toHaveLength(2)
    expect(ifc).toMatch(/IFCOPENINGELEMENT\([^\n]*'Opening over Landing'/)
    // One slab per floor, not one per room: the ground floor's base slab and the first floor's.
    expect(ifc.match(/\.BASESLAB\.\);/g)).toHaveLength(1)
    expect(ifc.match(/\.FLOOR\.\);/g)).toHaveLength(1)
  })
})

describe('VE-7: openings below the ground', () => {
  it('flags the basement flat\'s windows and door once the site states its ground level', () => {
    const plan = labPlan('A/scenarios/basement-flat.json')
    // Before LVL-4 the plan could not say where the ground is, and nothing was said.
    expect(checkPlanSanity(plan).findings.filter((f) => f.code === 'opening_below_ground')).toEqual([])
    const withGround = { ...plan, site: { ground: 0 } }
    const below = checkPlanSanity(withGround).findings.filter((f) => f.code === 'opening_below_ground')
    expect(below.map((f) => f.openings[0]).sort()).toEqual(['b-entry', 'b-w-bed', 'b-w-living'])
    const living = below.find((f) => f.openings[0] === 'b-w-living')!
    // The basement stands at −2.55 m: the window's sill at −1.15 m and its head at −0.55 m.
    expect(living.message).toBe('The window in "Living + kitchen" lies wholly below the ground: its top is 0.55 m under the ground level the site states')
  })
})
