/**
 * LVL-7: a step inside a floor. A genkan set 0.18 m off its storey draws a step line and is raised
 * in 3D (lab R-4); a 0.6 m stage is floor at its own level, not a wall, and its 32 m² counts as
 * floor (S-17). The IFC half of both is in `export/__tests__/ifc.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'
import { planSteps, roomFloorOffset } from '../steps'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { diffPlans } from '../diff'
import { floorMesh } from '../export/mesh'
import { tolerance } from '../tolerances'
import { parseFloorPlan, safeParseFloorPlan } from '../../types/floorplan'
import { ballroomWithStage, edit, genkanFlat } from '../../test-support/plans'

const mm = (value: number): number => Math.round(value * 1000) / 1000
const at = (p: { x: number; y: number }): [number, number] => [mm(p.x), mm(p.y)]

describe('LVL-7 the plan file', () => {
  it('reads a room\'s floor offset, up or down', () => {
    const plan = parseFloorPlan(genkanFlat(-0.18))
    expect(plan.rooms.find((r) => r.id === 'genkan')?.floorOffset).toBe(-0.18)
  })

  it('adds no key to a room that states none', () => {
    const plan = parseFloorPlan(genkanFlat())
    expect(plan.rooms.find((r) => r.id === 'hall')).not.toHaveProperty('floorOffset')
    expect(roomFloorOffset(plan.rooms.find((r) => r.id === 'hall')!)).toBe(0)
  })

  it('refuses an offset that is not a number', () => {
    const raw = edit(genkanFlat(), (copy) => {
      ;(copy.rooms[0] as { floorOffset: unknown }).floorOffset = '0.18'
    })
    expect(safeParseFloorPlan(raw)).toBeNull()
  })
})

describe('LVL-7 a genkan 0.18 m off its storey (R-4)', () => {
  it('draws a step line across the opening into the hall, on the hall\'s face of the wall', () => {
    const { steps } = buildFloorPlan(genkanFlat())
    expect(steps).toHaveLength(1)
    const step = steps[0]!
    expect(step).toMatchObject({ wallId: 'x', openingId: 'g', upper: 'genkan', lower: 'hall' })
    expect(step.rise).toBeCloseTo(0.18, 9)
    // The partition is 0.1 m thick on x = 1.5: the hall's face is x = 1.55. The gap runs 1 to 1.9.
    expect([at(step.from), at(step.to)]).toEqual([[1.55, 1], [1.55, 1.9]])
  })

  it('draws no step at the front door, which has no room outside it', () => {
    expect(buildFloorPlan(genkanFlat()).steps.some((s) => s.openingId === 'd')).toBe(false)
  })

  it('is raised 0.18 m in 3D, and the hall stays on the storey\'s floor', () => {
    const scene = buildScene(genkanFlat())
    const genkan = scene.slabs.find((s) => s.roomId === 'genkan')!
    const hall = scene.slabs.find((s) => s.roomId === 'hall')!
    expect(genkan.offset).toBe(0.18)
    expect(hall).not.toHaveProperty('offset')
    const mesh = floorMesh(genkan)!
    // VEW-73: its top lifted off the slab, as every room's floor in a 3D file.
    expect(Math.max(...mesh.points.map((p) => p.z))).toBeCloseTo(0.18 + tolerance('floorLift'), 9)
    expect(Math.min(...mesh.points.map((p) => p.z))).toBe(0)
  })

  it('draws a sunken genkan the other way: the step is on the genkan\'s face', () => {
    const { steps } = buildFloorPlan(genkanFlat(-0.18))
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ upper: 'hall', lower: 'genkan' })
    expect(steps[0]!.rise).toBeCloseTo(0.18, 9)
    expect([at(steps[0]!.from), at(steps[0]!.to)]).toEqual([[1.45, 1], [1.45, 1.9]])
  })

  it('draws no step for rooms closer in height than sameFloorLevel (5 mm)', () => {
    expect(buildFloorPlan(genkanFlat(0.004)).steps).toEqual([])
    expect(buildFloorPlan(genkanFlat(0)).steps).toEqual([])
  })

  it('draws no step at a window, which is no way through', () => {
    const plan = edit(genkanFlat(), (copy) => {
      copy.openings = copy.openings.map((o) => (o.id === 'g' ? { ...o, type: 'window', sill: 0.9, height: 1 } : o))
    })
    expect(buildFloorPlan(plan).steps).toEqual([])
  })

  it('draws one step for each door in the wall between the two rooms', () => {
    const plan = edit(genkanFlat(), (copy) => {
      copy.openings.push({ id: 'g2', wall: 'x', type: 'door', offset: 2.2, width: 0.6, sill: 0, height: 2 })
    })
    expect(buildFloorPlan(plan).steps.map((s) => s.openingId)).toEqual(['g', 'g2'])
  })

  it('raises no question for a genkan step', () => {
    const { issues } = validatePlan(genkanFlat())
    expect(issues.filter((i) => i.code === 'room/offset-question')).toEqual([])
  })
})

describe('LVL-7 a 0.6 m stage in a ballroom (S-17)', () => {
  it('is floor, not a wall: its edges have no substance, and nothing is drawn solid', () => {
    const drawing = buildFloorPlan(ballroomWithStage())
    for (const id of ['stg-s', 'stg-e', 'stg-n', 'stg-w']) {
      const wall = drawing.walls.find((w) => w.id === id)!
      expect(wall.virtual).toBe(true)
      expect(wall.slices).toEqual([])
    }
    expect(buildScene(ballroomWithStage()).walls.map((w) => w.id)).toEqual(['hall-s', 'hall-e', 'hall-n', 'hall-w'])
  })

  it('counts its 32 m² as floor, taken off the ballroom, so the hall\'s floor is counted once', () => {
    const drawing = buildFloorPlan(ballroomWithStage())
    const area = (id: string): number => drawing.rooms.find((r) => r.id === id)!.area
    expect(area('stage')).toBeCloseTo(32, 9)
    // 23.7 × 17.7 inside the 0.3 m walls, less the stage.
    expect(area('ballroom')).toBeCloseTo(23.7 * 17.7 - 32, 9)
    expect(area('stage') + area('ballroom')).toBeCloseTo(23.7 * 17.7, 9)
  })

  it('stands at its own level in 3D, 0.6 m up', () => {
    const scene = buildScene(ballroomWithStage())
    expect(scene.slabs.find((s) => s.roomId === 'stage')?.offset).toBe(0.6)
    expect(scene.slabs.find((s) => s.roomId === 'ballroom')).not.toHaveProperty('offset')
  })

  it('draws its edge as a step 0.6 m down to the ballroom, all 24 m of it', () => {
    const { steps } = buildFloorPlan(ballroomWithStage())
    expect(steps.map((s) => s.wallId)).toEqual(['stg-s', 'stg-e', 'stg-n', 'stg-w'])
    for (const step of steps) {
      expect(step).toMatchObject({ openingId: null, upper: 'stage', lower: 'ballroom' })
      expect(step.rise).toBeCloseTo(0.6, 9)
    }
    const length = steps.reduce((sum, s) => sum + Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y), 0)
    expect(length).toBeCloseTo(24, 9)
  })

  it('is a sound part of the plan: no error, and no question about its level', () => {
    const { issues, broken } = validatePlan(ballroomWithStage())
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(issues.filter((i) => i.code === 'room/offset-question')).toEqual([])
    expect(broken.size).toBe(0)
  })

  it('has its sides in the 3D export: a band round its edge from the floor to its top', () => {
    const stage = buildScene(ballroomWithStage()).slabs.find((s) => s.roomId === 'stage')!
    const mesh = floorMesh(stage)!
    // Two triangles on top, and two for each of the four sides.
    expect(mesh.faces).toHaveLength(2 + 4 * 2)
    // Each side faces out of the stage: its normal points away from the stage's centre.
    const centre = { x: 12, y: 15.6 }
    for (const [a, b, c] of mesh.faces.slice(2)) {
      const [p, q, r] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
      const u = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }
      const v = { x: r.x - p.x, y: r.y - p.y, z: r.z - p.z }
      const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z }
      const mid = { x: (p.x + q.x + r.x) / 3 - centre.x, y: (p.y + q.y + r.y) / 3 - centre.y }
      expect(normal.x * mid.x + normal.y * mid.y).toBeGreaterThan(0)
    }
  })
})

describe('LVL-7 the checks and the diff', () => {
  it('asks about a room set further than 1.5 m off its storey', () => {
    const { issues } = validatePlan(genkanFlat(1.8))
    const question = issues.find((i) => i.code === 'room/offset-question')
    expect(question).toMatchObject({ entity: 'room', id: 'genkan', severity: 'warning' })
    expect(question?.message).toContain('Room "genkan" stands 1.80 m above its storey\'s floor: is that meant?')
  })

  it('asks about a room raised to the height its floor states', () => {
    const plan = edit(genkanFlat(1.2), (copy) => {
      copy.floors = [{ id: 'ground', name: 'Ground', level: 0, height: 1.2 }]
    })
    const question = validatePlan(plan).issues.find((i) => i.code === 'room/offset-question')
    expect(question?.message).toContain('which reaches the 1.20 m its floor "ground" states it is high')
  })

  it('lists a floor offset stated or changed, and reads unstated as 0', () => {
    const flat = genkanFlat(0)
    const raised = genkanFlat(0.18)
    const change = diffPlans(flat, raised).changes.find((c) => c.entity.id === 'genkan')
    expect(change).toMatchObject({ kind: 'modified', props: [{ key: 'floorOffset', before: 0, after: 0.18 }] })
    expect(change?.summary).toContain('floor offset 0.00 → 0.18 m')
    const unstated = edit(flat, (copy) => {
      delete copy.rooms[0]!.floorOffset
    })
    expect(diffPlans(unstated, flat).changes).toEqual([])
  })

  it('finds the steps from an index it is given, and none in a plan with no offsets', () => {
    const plan = ballroomWithStage()
    expect(planSteps(plan, indexPlan(plan))).toHaveLength(4)
    expect(planSteps(ballroomWithStage(0))).toEqual([])
  })
})
