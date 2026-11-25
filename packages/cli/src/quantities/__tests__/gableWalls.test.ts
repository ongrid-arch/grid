/**
 * CNT-34: a wall a floor's stated roof cuts is measured by its face under the top the roof leaves
 * it, in the take-off, the estimate and the wall-type totals alike, with the gable part given apart.
 * A 6 × 4 cabin with walls 4 m high under a gable (eaves 2.4 m, ridge 3.7 m, ridge east-west): each
 * end wall is a 4 m wide rectangle to the eaves with a triangle 1.3 m high over it.
 */
import { describe, expect, it } from 'vitest'
import { edit, exterior, flat, room } from '@ongrid/floorplan/test-support/plans'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { planEstimate } from '../estimate'
import { wallTypeRuns } from '../finishes'
import { surveyPlan } from '../survey'
import { planTakeoff } from '../takeoff'

function cabin(roof: boolean): FloorPlan {
  const base = edit(flat(), (copy) => {
    copy.walls = [
      exterior('s', [0, 0], [6, 0], { height: 4 }),
      exterior('e', [6, 0], [6, 4], { height: 4 }),
      exterior('n', [6, 4], [0, 4], { height: 4 }),
      exterior('w', [0, 4], [0, 0], { height: 4 }),
    ]
    copy.rooms = [room('main', 'Main', ['s', 'e', 'n', 'w'])]
    copy.openings = []
  })
  const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>
  raw['types'] = { walls: [{ id: 'timber', name: 'Timber frame', thickness: 0.2, material: 'timber' }] }
  ;(raw['walls'] as Record<string, unknown>[]).forEach((w) => {
    w['wallType'] = 'timber'
  })
  if (roof) raw['floors'] = [{ id: 'ground', name: 'Ground', level: 0, roof: { shape: 'gable', eaves: 2.4, ridge: 3.7, ridgeRuns: 'east-west' } }]
  return parseFloorPlan(raw)
}

// An end wall: 4 m wide, 2.4 m to the eaves, a triangle 1.3 m high over it.
const END_FACE = 4 * 2.4 + (4 * 1.3) / 2
const END_GABLE = (4 * 1.3) / 2

describe('wall faces under a gable roof (CNT-34)', () => {
  it('takes the room\'s wall face under the roof and says its gable part', () => {
    const bare = planTakeoff(surveyPlan(cabin(false))).rooms[0]!
    const roofed = planTakeoff(surveyPlan(cabin(true))).rooms[0]!
    expect(bare.gable).toBe(0)
    // Between the long walls' faces (3.8 m) each end's triangle is a little smaller.
    expect(roofed.gable).toBeGreaterThan((2 * 3.5 * 1.3) / 2)
    expect(roofed.gable).toBeLessThan(2 * END_GABLE)
    expect(roofed.wallFace).toBeLessThan(bare.wallFace)
  })

  it('gives the wall-type run the same face as the take-off, its gable part inside it', () => {
    const survey = surveyPlan(cabin(true))
    const [run] = wallTypeRuns(survey)
    expect(run!.gable).toBeCloseTo(2 * END_GABLE, 6)
    // The two end walls under the gable, the two long walls to the eaves.
    expect(run!.face).toBeCloseTo(2 * END_FACE + 2 * 6 * 2.4, 6)
    expect(wallTypeRuns(surveyPlan(cabin(false)))[0]!.gable).toBe(0)
    expect(wallTypeRuns(surveyPlan(cabin(false)))[0]!.face).toBeCloseTo(2 * 4 * 4 + 2 * 6 * 4, 6)
  })

  it('splits the estimate\'s walls into what is under the eaves and the gable part, and adds up', () => {
    const lines = planEstimate(surveyPlan(cabin(true))).lines
    const walls = lines.filter((line) => line.key.startsWith('wall-type:')).reduce((sum, line) => sum + line.quantity, 0)
    const gable = lines.find((line) => line.key === 'wall_gable')!.quantity
    // Joined at the corners, the centre lines grow by the wall's thickness at each end.
    expect(gable).toBeGreaterThan(2 * END_GABLE * 0.9)
    expect(gable).toBeLessThan(2 * END_GABLE * 1.2)
    expect(walls + gable).toBeLessThan(2 * 4 * 4 + 2 * 6 * 4)
    const outside = lines.find((line) => line.key === 'external_finish')!.quantity
    const outsideGable = lines.find((line) => line.key === 'external_finish_gable')!.quantity
    expect(outsideGable).toBeGreaterThan(0)
    expect(outside + outsideGable).toBeLessThan(2 * 4 * 4 + 2 * 6 * 4 + 1)
  })

  it('leaves a plan with no roof as it was: no gable lines', () => {
    const lines = planEstimate(surveyPlan(cabin(false))).lines
    expect(lines.some((line) => line.key.endsWith('_gable'))).toBe(false)
  })
})
