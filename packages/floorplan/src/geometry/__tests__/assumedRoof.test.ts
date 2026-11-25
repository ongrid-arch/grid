/**
 * LVL-13: Grid assumes a flat roof over every part of a floor with nothing above it, but none
 * where the ground covers the floor (a crypt, a basement) and none over the walls that bound open
 * outdoor space alone (a roof terrace's parapet, a balcony's edge). A roof the floor states stays.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { planForFloor } from '../floors'
import { planEnvelope } from '../envelope'
import { planSection } from '../section'
import { buildScene } from '../scene3d'
import { toIfc } from '../export/ifc'

function written(text: readonly string[]): FloorPlan {
  const result = compileRoomsText(text.join('\n'))
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}

const envelopeOf = (plan: FloorPlan, floor: string) => planEnvelope(plan).floors.find((f) => f.floor === floor)!
const roofsCut = (plan: FloorPlan, floor: string, from: { x: number; y: number }, to: { x: number; y: number }) =>
  planSection(plan, { from, to, toward: 'left' }).parts.filter((p) => p.kind === 'roof' && p.floor === floor)
const ifcRoofs = (plan: FloorPlan): string[] => [...toIfc(plan).matchAll(/IFCROOF\('[^']*',#\d+,'([^']*)'/g)].map((m) => m[1]!)

describe('a roof floor of a stair house and an open terrace', () => {
  // The stair house and the terrace share the floor's long outside walls, south and north.
  const plan = written([
    'walls outside 0.3 inside 0.1 height 2.7',
    'floor ground "Ground" level 0 height 3',
    'room a "Living" living 10.2 x 3 at 0,0',
    'floor roof "Roof" level 1 height 2.4',
    'room rs "Stair house" stair 3 x 3 at 0,0',
    'room t "Terrace" - 6.9 x 3 east of rs outdoor terrace unroofed',
  ])

  it('is roofed over the stair house and its walls, and not over the terrace\'s walls', () => {
    const roof = envelopeOf(plan, 'roof').roof!
    // 3 × 3 m inside, 0.3 m outside walls all round: 3.6 × 3.6 m.
    expect(roof.area).toBeCloseTo(3.6 * 3.6, 6)
    for (const [ring] of roof.pieces) expect(Math.max(...ring!.map(([x]) => x))).toBeLessThanOrEqual(3.3 + 1e-6)
  })

  it('cuts no roof in a section through the terrace, and one through the stair house', () => {
    expect(roofsCut(plan, 'roof', { x: 6, y: -2 }, { x: 6, y: 5 })).toEqual([])
    expect(roofsCut(plan, 'roof', { x: 1.5, y: -2 }, { x: 1.5, y: 5 })).toHaveLength(1)
  })

  it('carries the 3D roof over the stair house alone', () => {
    const shell = buildScene(planForFloor(plan, 'roof')).shell!
    const xs = shell.roof!.pieces.flatMap((piece) => piece.outline.map((p) => p.x))
    expect(Math.max(...xs)).toBeLessThanOrEqual(3.3 + 1e-6)
  })
})

describe('a roof floor of open terraces alone', () => {
  const plan = written([
    'walls outside 0.3 inside 0.1 height 2.7',
    'floor ground "Ground" level 0 height 3',
    'room a "Living" living 10 x 3 at 0,0',
    'floor roof "Roof" level 1 height 2.4',
    'room t1 "West terrace" - 5 x 3 at 0,0 outdoor terrace unroofed',
    'room t2 "East terrace" - 4.9 x 3 east of t1 outdoor terrace unroofed',
  ])

  it('has no roof in the envelope, the section, the 3D or the IFC', () => {
    expect(envelopeOf(plan, 'roof').roof).toBeNull()
    expect(roofsCut(plan, 'roof', { x: 2, y: -2 }, { x: 2, y: 5 })).toEqual([])
    expect(buildScene(planForFloor(plan, 'roof')).shell?.roof ?? null).toBeNull()
    expect(ifcRoofs(plan)).not.toContain('Roof roof')
  })
})

describe('a crypt under a church', () => {
  // The crypt reaches past the church above it on the east, as a crypt's thicker walls may.
  const text = [
    'walls outside 0.6 inside 0.2 height 4',
    'floor ground "Church" level 0 height 6',
    'room nave "Nave" worship 12 x 6 at 0,0',
    'floor crypt "Crypt" level -1 height 3',
    'room c "Crypt" worship 13 x 6 at 0,0',
  ]
  const plan = written(text)

  it('has no roof: the ground covers what the church does not', () => {
    expect(envelopeOf(plan, 'crypt').roof).toBeNull()
    expect(planEnvelope(plan).roofArea).toBeCloseTo(envelopeOf(plan, 'ground').roof!.area, 6)
    expect(roofsCut(plan, 'crypt', { x: 12.5, y: -2 }, { x: 12.5, y: 8 })).toEqual([])
    expect(ifcRoofs(plan)).toEqual(['Church roof'])
  })

  it('has its roof where the site\'s ground lies below it', () => {
    const sloped = parseFloorPlan({ ...plan, site: { ...plan.site, ground: -2 } })
    const roof = envelopeOf(sloped, 'crypt').roof!
    expect(roof.area).toBeGreaterThan(0)
    expect(ifcRoofs(sloped)).toContain('Crypt roof')
  })

  it('keeps a roof the crypt states', () => {
    const stated = parseFloorPlan({ ...plan, floors: plan.floors!.map((f) => (f.id === 'crypt' ? { ...f, roof: { shape: 'flat', eaves: 3 } } : f)) })
    expect(envelopeOf(stated, 'crypt').roof).not.toBeNull()
  })
})
