import { describe, expect, it } from 'vitest'
import { floorElevations, type FloorPlan } from '@ongrid/floorplan/geometry'
import { twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { doorClearanceOf } from '../../quantities/doorWidth'
import { surveyPlan } from '../../quantities/survey'
import { planData, planDataText, planGeoJson, type DataOpening } from '../planData'

/**
 * VEW-80: the plan's geometry as data. The two-floor house: a hall at x 0..4, y 0..4 with a
 * door into the kitchen in the wall at x 4 (`d_hk`, hung from its start and opening into the
 * hall), a sliding door between bedroom and bathroom, a glass partition there, a WC and facts.
 */
function house(): FloorPlan {
  const plan = twoFloorHouse()
  return {
    ...plan,
    types: { walls: [{ id: 'glass', name: 'Glass partition', glazed: true }] },
    walls: plan.walls.map((w) => (w.id === 'bb' ? { ...w, wallType: 'glass' } : w)),
    rooms: plan.rooms.map((r) => (r.id === 'bathroom' ? { ...r, properties: { 'keep out': true } } : r)),
    openings: plan.openings.map((o) =>
      o.id === 'd_hk' ? { ...o, hinge: 'start' as const, swing: 'left' as const, properties: { 'Door state': 'Automatic' } }
        : o.id === 'd_bb' ? { ...o, kind: 'sliding' as const }
          : o
    ),
    items: [{ id: 'wc', kind: 'toilet', at: [9, 7], size: [0.4, 0.7], height: 0.8 }],
  }
}

const near = (a: readonly number[], b: readonly number[]): void => {
  expect(a.length).toBe(b.length)
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 4))
}

describe('the plan as data (VEW-80)', () => {
  const plan = house()
  const survey = surveyPlan(plan)
  const data = planData(survey, plan)
  const opening = (id: string): DataOpening => data.openings.find((o) => o.id === id)!

  it('holds every floor in one frame, each part with its floor and elevation', () => {
    const levels = floorElevations(survey.plan).floors
    expect(data.grid).toMatchObject({ version: 1, units: 'm', frame: 'plan' })
    expect(data.grid.floors.map((f) => f.id)).toEqual(['ground', 'first'])
    expect(data.grid.floors[1]!.elevation).toBeCloseTo(levels.get('first')!.floorLevel, 4)
    expect(data.grid.floors[1]!.elevation).toBeGreaterThan(0)
    const study = data.rooms.find((r) => r.id === 'study')!
    expect(study).toMatchObject({ floor: 'first', elevation: data.grid.floors[1]!.elevation })
    // The same x and y on both floors: the study above the kitchen's half of the house.
    expect(Math.min(...study.polygon.map((p) => p[0]))).toBeCloseTo(5.05, 4)
  })

  it('gives each room its outline, a point on its floor, its centroid and its net area', () => {
    const hall = data.rooms.find((r) => r.id === 'hall')!
    expect(hall.polygon).toHaveLength(4)
    expect(hall.holes).toEqual([])
    near(hall.centroid, [2.025, 2.025])
    expect(hall.area).toBeCloseTo(3.85 * 3.85, 2)
    expect(hall.centre[0]).toBeGreaterThan(0.1)
    expect(hall.centre[0]).toBeLessThan(3.95)
    expect(hall.keepOut).toBe(false)
    expect(data.rooms.find((r) => r.id === 'bathroom')!).toMatchObject({ keepOut: true, facts: { 'keep out': true } })
  })

  it('gives each door its centre, directions, hole, clear width, sides, sill and swing', () => {
    const door = opening('d_hk')
    near(door.centre, [4, 1.95])
    near(door.along, [0, 1])
    near(door.across, [-1, 0])
    expect(door.rooms).toEqual(['hall', 'kitchen'])
    expect(door.opensInto).toBe('hall')
    expect(door).toMatchObject({ part: 'door', wall: 'hk', kind: 'single', width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', glazed: false, state: 'automatic', automatic: true })
    expect(door.clearWidth).toBeCloseTo(doorClearanceOf(survey, 'd_hk')!.clear, 4)
    expect(door.clearWidth!).toBeLessThan(0.9)
    const xs = door.hole.map((p) => p[0])
    const ys = door.hole.map((p) => p[1])
    near([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [3.95, 4.05, 1.5, 2.4])
    // One quarter disc, from the hinge on the hall's face, closed along the wall, open into the hall.
    expect(door.sweeps).toHaveLength(1)
    const sweep = door.sweeps![0]!
    near(sweep[0]!, [3.95, 1.5])
    near(sweep[1]!, [3.95, 2.4])
    near(sweep[sweep.length - 1]!, [3.05, 1.5])
    for (const p of sweep.slice(1)) expect(Math.hypot(p[0] - 3.95, p[1] - 1.5)).toBeCloseTo(0.9, 3)
  })

  it('says a sliding door sweeps nothing, an undecided one is not known, and a window is glass', () => {
    expect(opening('d_bb')).toMatchObject({ kind: 'sliding', sweeps: [], clearWidth: 0.9 })
    expect(opening('front')).toMatchObject({ sweeps: null, hinge: null, opensInto: null, state: null, automatic: false })
    expect(opening('win_k')).toMatchObject({ part: 'window', glazed: true, clearWidth: null, sill: 0.9, state: null })
  })

  it('gives each wall its solid runs, centre line and glass, and each item its footprint', () => {
    const hk = data.walls.find((w) => w.id === 'hk')!
    // The door cuts the wall into two runs.
    expect(hk.polygons).toHaveLength(2)
    near(hk.centreLine.flat(), [4, 0, 4, 4])
    near(hk.centre, [4, 2])
    expect(hk.rooms).toEqual(['hall', 'kitchen'])
    expect(data.walls.find((w) => w.id === 'bb')!.glazed).toBe(true)
    expect(hk.glazed).toBe(false)
    const wc = data.items.find((i) => i.id === 'wc')!
    expect(wc).toMatchObject({ part: 'fixture', kind: 'toilet', room: 'bathroom', floor: 'ground' })
    near(wc.centre, [9, 7])
    near(wc.centroid, [9, 7])
    expect(wc.polygon).toHaveLength(4)
  })

  it('writes one floor alone when asked', () => {
    const first = planData(survey, plan, ['first'])
    expect(first.grid.floors.map((f) => f.id)).toEqual(['first'])
    expect(new Set([...first.rooms, ...first.walls, ...first.openings].map((p) => p.floor))).toEqual(new Set(['first']))
  })

  it('writes the same bytes for the plan written in another order', () => {
    const turned = { ...plan, walls: [...plan.walls].reverse(), rooms: [...plan.rooms].reverse(), openings: [...plan.openings].reverse() }
    expect(planDataText(planData(surveyPlan(turned), turned), 'json')).toBe(planDataText(data, 'json'))
    expect(planDataText(planData(surveyPlan(turned), turned), 'geojson')).toBe(planDataText(data, 'geojson'))
  })

  it('writes GeoJSON features with closed rings, outlines counter-clockwise', () => {
    const geo = planGeoJson(data) as { type: string; grid: unknown; features: { id: string; geometry: { type: string; coordinates: number[][][] | number[][][][] }; properties: Record<string, unknown> }[] }
    expect(geo.type).toBe('FeatureCollection')
    expect(geo.grid).toEqual(data.grid)
    expect(geo.features).toHaveLength(data.rooms.length + data.walls.length + data.openings.length + data.items.length)
    const hall = geo.features.find((f) => f.id === 'room/hall')!
    expect(hall.geometry.type).toBe('Polygon')
    const ring = (hall.geometry.coordinates as number[][][])[0]!
    expect(ring[0]).toEqual(ring[ring.length - 1])
    const signed = ring.slice(0, -1).reduce((s, a, i, r) => s + a[0]! * r[(i + 1) % r.length]![1]! - r[(i + 1) % r.length]![0]! * a[1]!, 0)
    expect(signed).toBeGreaterThan(0)
    expect(hall.properties).toMatchObject({ id: 'hall', part: 'room', floor: 'ground' })
    expect(hall.properties).not.toHaveProperty('polygon')
    expect(geo.features.find((f) => f.id === 'wall/hk')!.geometry.type).toBe('MultiPolygon')
    expect(geo.features.find((f) => f.id === 'door/d_hk')!.properties).toMatchObject({ clearWidth: opening('d_hk').clearWidth, rooms: ['hall', 'kitchen'] })
  })
})
