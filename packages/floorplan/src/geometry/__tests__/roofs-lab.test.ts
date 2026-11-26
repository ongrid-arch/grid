/**
 * LVL-6: the lab's findings on sloped ceilings and roofs (VE-5), with the lab's own numbers.
 *
 * Every wall was a rectangle and every roof a flat slab, so:
 *
 * - the converted loft (`A/scenarios/loft-sloped.json`) has its gables as 3.6 m rectangles, and a
 *   window in the west gable (`w-bed-gable-corner`, sill 2.0 m) where the real roof is about 1.26
 *   to 1.95 m high is accepted;
 * - its 21.66 m² attic bedroom has, by hand, 18.42 m² with 1.5 m of headroom and 12.28 m² with
 *   2.2 m, and Grid gave neither;
 * - the attic over the house with knee walls (`H/scenarios/h17-attic-knee-wall.json`) is 49% too
 *   large in the IFC: its spaces are boxes as high as the gables.
 *
 * The lab's plans state no roof (the format had no way to): each test states the one the walls
 * show, a gable with its ridge running east-west over the middle of the floor, its eaves at the
 * knee walls' height on their lines and its ridge at the gables' height.
 *
 * The hand figures. The loft is 8 × 6 m on its walls' lines; the roof's underside rises from 1.0 m
 * on the south and north knee walls (y = 0 and y = 6) to 3.6 m at the ridge (y = 3), so the
 * headroom at a distance d from a knee wall's line is 1.0 + d × 2.6 / 3. The bedroom is
 * 3.8 × 5.7 m inside its walls (x 0.15 to 3.95, y 0.15 to 5.85): 21.66 m².
 *
 * - At least 1.5 m: d ≥ 0.5 × 3 / 2.6 = 0.5769 m from each knee wall's line, a band
 *   6 − 2 × 0.5769 = 4.8462 m deep: 3.8 × 4.8462 = 18.42 m².
 * - At least 2.2 m: d ≥ 1.2 × 3 / 2.6 = 1.3846 m, a band 3.2308 m deep: 3.8 × 3.2308 = 12.28 m².
 * - The volume under the roof: 3.8 × 2 × ∫ from 0.15 to 3 of (1 + 2.6 d / 3) dd
 *   = 3.8 × 2 × (2.85 + 1.3 / 3 × (9 − 0.0225)) = 51.23 m³ (as a 3.6 m box it is 77.98 m³).
 *
 * The attic over h17 is the same shape, 1.2 m at the knee walls and 3.9 m at the ridge: its
 * bedroom, 6.55 × 5.7 m inside its walls (x 1.3 to 7.85), holds 6.55 × 2 × (2.85 × 1.2 + 0.45 ×
 * 8.9775) = 97.72 m³, and as a 3.9 m box 145.61 m³, 49% more (VE-5).
 */
import { describe, expect, it } from 'vitest'
import { labPlanText } from '../../test-support/lab'
import { named, parseIfc, productVolume, quantityOf } from '../../test-support/ifcVolume'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planForFloor } from '../floors'
import { validatePlan } from '../validate'
import { roomHeadroom } from '../roofs'
import { toIfc } from '../export/ifc'
import { buildScene, elevationArea } from '../scene3d'

const LOFT = 'A/scenarios/loft-sloped.json'
const KNEE = 'H/scenarios/h17-attic-knee-wall.json'

/** A lab plan with the roof its walls show stated on one floor. */
function withRoof(name: string, floor: string, roof: Record<string, unknown>): FloorPlan {
  const raw = JSON.parse(labPlanText(name)) as { floors: { id: string }[] }
  for (const f of raw.floors) if (f.id === floor) Object.assign(f, { roof })
  return parseFloorPlan(raw)
}

const loft = (): FloorPlan => withRoof(LOFT, 'attic', { shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' })
const knee = (): FloorPlan => withRoof(KNEE, 'attic', { shape: 'gable', eaves: 1.2, ridge: 3.9, ridgeRuns: 'east-west' })

const OPTIONS = { projectId: 'lab', projectName: 'Loft', now: new Date('2026-11-22T00:00:00Z') }

describe('the attic bedroom of the converted loft (VE-5)', () => {
  it('reports 18.42 m² with at least 1.5 m of headroom and 12.28 m² with at least 2.2 m', () => {
    const headroom = roomHeadroom(loft(), 'bed')
    expect(headroom).not.toBeNull()
    expect(headroom!.area.toFixed(2)).toBe('21.66')
    expect(headroom!.bands.map((b) => [b.height, b.area.toFixed(2)])).toEqual([
      [1.5, '18.42'],
      [2.2, '12.28']
    ])
    // The lowest headroom is at the knee walls' inner faces, the highest under the ridge.
    expect(headroom!.lowest.toFixed(2)).toBe('1.13')
    expect(headroom!.highest.toFixed(2)).toBe('3.60')
  })

  it('refuses the window in the west gable that lies above the roof, and keeps the others', () => {
    const plan = loft()
    const { issues, broken } = validatePlan(planForFloor(plan, 'attic'))
    const above = issues.filter((i) => i.code === 'opening/above-roof')
    // The window runs from y = 5.7 to 4.9 on the west gable, where the roof is 1.26 to 1.95 m high;
    // its sill is at 2.0 m. The bedroom's door, 2.0 m high, stands in the same strip by the north
    // knee wall (y 4.9 to 5.7, on the partition at x = 4): its top is above the roof too, which the
    // lab did not name.
    expect(above.map((i) => i.id)).toEqual(['d-bed', 'w-bed-gable-corner'])
    const window = above.find((i) => i.id === 'w-bed-gable-corner')!
    expect(window.severity).toBe('error')
    expect(window.message).toBe(
      'Opening "w-bed-gable-corner" reaches 3.20 m on wall "gable-w", where the roof over floor "Attic (converted loft)" cuts the wall to 1.26 to 1.95 m: it lies wholly above the roof'
    )
    expect(above.find((i) => i.id === 'd-bed')!.message).toContain('its top is above the roof; at its sill of 0.00 m, a height up to 1.26 m fits')
    expect(broken.has('w-bed-gable-corner')).toBe(true)
    for (const id of ['w-bed-gable', 'w-bath-gable', 'w-bed-knee', 'd-bath']) expect(broken.has(id), id).toBe(false)
  })

  it('accepted that window before the roof was stated', () => {
    const { issues, broken } = validatePlan(planForFloor(parseFloorPlan(JSON.parse(labPlanText(LOFT))), 'attic'))
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(broken.has('w-bed-gable-corner')).toBe(false)
  })

  it('writes the bedroom into the IFC with the volume under the roof, within 2% of 51.23 m³', () => {
    const doc = parseIfc(toIfc(loft(), OPTIONS))
    const [space] = named(doc, 'IFCSPACE', 'Attic bedroom')
    const volume = productVolume(doc, space!)
    const hand = 3.8 * 2 * (2.85 + (1.3 / 3) * (9 - 0.0225))
    expect(hand.toFixed(2)).toBe('51.23')
    expect(Math.abs(volume - hand) / hand).toBeLessThan(0.02)
    // HND-2's base quantities say the same volume: the clipped space's, not a box's.
    expect(quantityOf(doc, space!, 'Qto_SpaceBaseQuantities', 'GrossVolume')).toBeCloseTo(hand, 6)
    expect(quantityOf(doc, space!, 'Qto_SpaceBaseQuantities', 'Height')).toBeCloseTo(3.6, 9)
  })
})

describe('the attic over the house with knee walls (VE-5)', () => {
  it('writes the attic bedroom into the IFC within 2% of its 97.72 m³ by hand, not 49% over', () => {
    const doc = parseIfc(toIfc(knee(), OPTIONS))
    const [space] = named(doc, 'IFCSPACE', 'Attic bedroom')
    const volume = productVolume(doc, space!)
    const hand = 6.55 * 2 * (2.85 * 1.2 + 0.45 * (9 - 0.0225))
    expect(hand.toFixed(2)).toBe('97.72')
    expect(Math.abs(volume - hand) / hand).toBeLessThan(0.02)
    expect(quantityOf(doc, space!, 'Qto_SpaceBaseQuantities', 'GrossVolume')).toBeCloseTo(hand, 6)
  })

  it('draws its gables as gables: 1.2 m at the knee walls, 3.9 m at the ridge, the window in the east one kept', () => {
    // The roof's planes meet the top at the ridge a hair apart (3 ± 4e-16 m along the wall): one turn.
    const scene = buildScene(planForFloor(knee(), 'attic'))
    for (const id of ['t-e', 't-w', 't-spine']) {
      const wall = scene.walls.find((w) => w.id === id)!
      expect(wall.elevation.outline.map((p) => [Number(p.x.toFixed(6)), Number(p.y.toFixed(6))]), id).toEqual(
        [[0, 0], [6, 0], [6, 1.2], [3, 3.9], [0, 1.2]]
      )
    }
    // 6 × 1.2 + 6 × 2.7 / 2 = 15.3 m², less the 1.2 × 1.2 m window.
    expect(elevationArea(scene.walls.find((w) => w.id === 't-e')!.elevation)).toBeCloseTo(15.3 - 1.44, 9)
  })

  it('wrote a 3.9 m box before the roof was stated, 49% over the hand volume', () => {
    const doc = parseIfc(toIfc(parseFloorPlan(JSON.parse(labPlanText(KNEE))), OPTIONS))
    const [space] = named(doc, 'IFCSPACE', 'Attic bedroom')
    const volume = productVolume(doc, space!)
    const hand = 6.55 * 2 * (2.85 * 1.2 + 0.45 * (9 - 0.0225))
    expect(volume.toFixed(1)).toBe((37.335 * 3.9).toFixed(1))
    expect(Math.round((volume / hand - 1) * 100)).toBe(49)
  })
})

describe('the rooflights and dormers the lab tried (VE-5, h15)', () => {
  const TRIES = 'H/scenarios/h15-rooflight-dormer-tries.json'

  it('tells an opening on the roof, or on a room, that a window in the roof is a rooflight', () => {
    const { issues } = validatePlan(parseFloorPlan(JSON.parse(labPlanText(TRIES))))
    const missing = issues.filter((i) => i.code === 'opening/missing-wall')
    expect(missing.map((i) => i.id)).toEqual(['t-rooflight-1', 't-rooflight-2'])
    for (const line of missing) expect(line.message).toContain("a window in the roof is a rooflight, stated in its floor's roof (floors[].roof.rooflights), and a dormer is stated there too (floors[].roof.dormers)")
  })

  it('draws the same rooflight once it is stated in the attic\'s roof, and says its dormer is not drawn', () => {
    const raw = JSON.parse(labPlanText(TRIES)) as { floors: Record<string, unknown>[] }
    raw.floors[1]!['roof'] = { shape: 'gable', eaves: 1.2, ridge: 3.9, ridgeRuns: 'east-west', rooflights: [{ id: 'rl', at: [5, 1.5], width: 0.8, length: 1.2 }], dormers: [{ id: 'd', shape: 'box', at: [6.5, 0.6], width: 1.8, height: 2.2 }] }
    const plan = parseFloorPlan(raw)
    const lines = validatePlan(plan).issues.filter((i) => i.code.startsWith('floor/rooflight') || i.code.startsWith('floor/dormers'))
    expect(lines.map((i) => [i.code, i.id])).toEqual([['floor/dormers-not-drawn', 'attic']])
    const doc = parseIfc(toIfc(plan, OPTIONS))
    expect(named(doc, 'IFCWINDOW', 'rl')).toHaveLength(1)
  })
})
