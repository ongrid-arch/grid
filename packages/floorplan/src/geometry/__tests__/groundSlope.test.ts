/**
 * CNT-49: the ground on a slope (per side, a fall, along the plot's edges), read at every wall by
 * the below-ground and way-out checks, the ground floors, the footprint, the storeys and the height.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import type { FloorPlan } from '../plan'
import { groundLevel, openingsBelowGround, statedGround } from '../ground'
import { groundSurface } from '../groundSurface'
import { checkPlanSanity } from '../rules/check'
import { footprintFloors } from '../site'
import { buildingHeight, planStoreys } from '../storeys'
import { flat } from '../../test-support/plans'
import { facadeGroundAt, planFacade } from '../facade'
import { planSection, sectionGroundAt } from '../section'
import { sceneGround } from '../groundPlane'
import { openingPoint } from '../ground'

const plan = (text: string): FloorPlan => {
  const result = compileRoomsText(text)
  if (result.plan === undefined || result.plan === null) throw new Error(JSON.stringify(result.problems ?? result))
  return result.plan as FloorPlan
}

/** A chalet on a slope falling south: the living floor entered from the hill, bedrooms walking out below. */
const CHALET = `plan "Chalet"
walls outside 0.3 inside 0.1 height 2.6
windows sill 0.9 height 1.3
floor ground "Living floor" level 0 elevation 0
room living "Living room" living 8 x 6 at 0.15,0.15
door front in living north, 1 from west, 0.9 wide
door terrace in living south, 3 from west, 0.9 wide
floor lower "Bedrooms" level -1 elevation -2.8
room bed "Bedroom" bedroom 8 x 6 at 0.15,0.15
door garden in bed south, 1 from west, 0.9 wide
window hill in bed north, 3 from west, 1.2 wide
window view in bed south, 5 from west, 1.2 wide
`

const withSite = (p: FloorPlan, site: NonNullable<FloorPlan['site']>): FloorPlan => ({ ...p, site })

describe('the ground on a slope', () => {
  it('meets the levels stated at two opposite sides exactly, and is null with none', () => {
    const chalet = plan(CHALET)
    expect(groundSurface(chalet)).toBeNull()
    const surface = groundSurface(withSite(chalet, { groundSides: { north: 0, south: -2.8 } }))!
    expect(surface.offBy).toBe(0)
    expect(surface.at({ x: 4, y: 6.3 })).toBeCloseTo(0, 9)
    expect(surface.at({ x: 4, y: 0 })).toBeCloseTo(-2.8, 9)
    expect(surface.toward!.y).toBeCloseTo(-1, 9)
  })

  it('reads a fall through the stated ground at the middle of the building', () => {
    const surface = groundSurface(withSite(plan(CHALET), { ground: -1, fall: { slope: 50, toward: 'south' } }))!
    const middle = surface.at({ x: 4.15, y: 3.15 })
    expect(middle).toBeCloseTo(-1, 9)
    expect(surface.at({ x: 4.15, y: 2.15 }) - middle).toBeCloseTo(-0.5, 9)
    expect(surface.slope).toBeCloseTo(50, 9)
  })

  it('reads a street falling along an edge of the plot, level across it', () => {
    const p = withSite(plan(CHALET), { boundary: [[-5, -5], [20, -5], [20, 20], [-5, 20]], groundEdges: [{ edge: 1, start: 0, end: -5 }] })
    const surface = groundSurface(p)!
    expect(surface.at({ x: -5, y: 0 })).toBeCloseTo(0, 9)
    expect(surface.at({ x: 20, y: 7 })).toBeCloseTo(-5, 9)
    expect(surface.at({ x: 7.5, y: 3 })).toBeCloseTo(-2.5, 9)
  })

  it('says how far it is off levels that lie on no one even slope', () => {
    const surface = groundSurface(withSite(plan(CHALET), { ground: 5, groundSides: { north: 0, south: 0 } }))!
    expect(surface.offBy).toBeGreaterThan(1)
    expect(surface.worst).not.toBeNull()
  })
})

describe('a chalet whose bedrooms walk out below (lab: walk-out floors dropped out)', () => {
  const chalet = withSite(plan(CHALET), { groundSides: { north: 0, south: -2.8 } })

  it('takes both floors as on the ground: in the ground floors, the footprint and the storeys', () => {
    const ground = groundLevel(chalet)
    expect(ground.groundFloors.map((f) => f.id).sort()).toEqual(['ground', 'lower'])
    expect(ground.above.get('lower')).toBe(0)
    expect(footprintFloors(chalet).sort()).toEqual(['ground', 'lower'])
    expect(planStoreys(chalet)).toMatchObject({ above: 2, below: 0 })
    expect(statedGround(chalet)).toBeCloseTo(-2.8, 9)
  })

  it('measures the height from the lowest ground round it', () => {
    const height = buildingHeight(chalet)!
    expect(height.ground).toBeCloseTo(-2.8, 9)
    expect(height.height).toBeGreaterThan(5.4)
  })

  it('names the bedroom window dug into the hill, and leaves the garden side alone', () => {
    const below = openingsBelowGround(chalet).map((o) => o.opening)
    expect(below).toContain('hill')
    expect(below).not.toContain('garden')
    expect(below).not.toContain('view')
  })

  it('takes the walk-out garden door as a way out, and names the terrace door over the falling garden', () => {
    const report = checkPlanSanity(chalet)
    const up = report.findings.filter((f) => f.code === 'door_to_outside_above_ground')
    expect(up.map((f) => [f.openings[0], f.elevation])).toEqual([['terrace', 2.8]])
    expect(report.findings.filter((f) => f.code === 'opening_below_ground').map((f) => f.openings[0])).toEqual(['hill'])
    expect(report.findings.some((f) => f.code === 'no_route_to_exit' || f.code === 'no_exit')).toBe(false)
  })
})

describe('a plan with one ground level', () => {
  it('reads exactly as before', () => {
    const before = groundLevel({ ...flat(), site: { ground: 1.2 } })
    expect(before.surface).toBeNull()
    expect(before.under.size).toBe(0)
    expect(before.level).toBe(1.2)
  })
})

/** Three houses of a terrace stepping down a street that falls 3 m along the plot's south edge. */
const TERRACE = `plan "Terrace"
walls outside 0.3 inside 0.1 height 2.6
floor h1 "House 1" level 0 elevation 0
room r1 "House 1" living 4.7 x 8 at 0.15,0.15
door d1 in r1 south, 2 from west, 0.9 wide
floor h2 "House 2" level 0 elevation -1
room r2 "House 2" living 4.7 x 8 at 5.15,0.15
door d2 in r2 south, 2 from west, 0.9 wide
floor h3 "House 3" level 0 elevation -2
room r3 "House 3" living 4.7 x 8 at 10.15,0.15
door d3 in r3 south, 2 from west, 0.9 wide
`

describe('a terrace along a falling street (lab: no one level was right for every door)', () => {
  const street = { boundary: [[0, -3], [15, -3], [15, 12], [0, 12]] as [number, number][], streets: [1], groundEdges: [{ edge: 1, start: 0, end: -3 }] }

  it('reads each door against the street in front of it', () => {
    const terrace = withSite(plan(TERRACE), street)
    const ground = groundLevel(terrace)
    const steps = (['d1', 'd2', 'd3'] as const).map((id, i) => ground.aboveAt(`h${i + 1}`, openingPoint(terrace, terrace.openings.find((o) => o.id === id)!)!))
    for (const step of steps) expect(step).toBeGreaterThan(0)
    for (const step of steps) expect(step).toBeLessThan(0.8)
    const report = checkPlanSanity(terrace)
    expect(report.findings.filter((f) => f.code === 'opening_below_ground' || f.code === 'door_to_outside_above_ground')).toEqual([])
  })

  it('names a door below one level for the whole street, as before', () => {
    const report = checkPlanSanity(withSite(plan(TERRACE), { ground: -1 }))
    expect(report.findings.filter((f) => f.code === 'opening_below_ground').map((f) => f.openings[0])).toEqual(['d3'])
  })
})

/** A car park level dug in under a street that falls 3 m from west to east. */
const CAR_PARK = `plan "Car park"
walls outside 0.3 inside 0.1 height 2.6
floor p "Car park" level -1 elevation -3
room park "Parking" parking 20 x 10 at 0.15,0.15
opening ramp in park east, 4 from south, 3 wide, height 2.2
window vent-w in park west, 4 from south, 1 wide, sill 2, height 0.5
`

describe('a car park under a falling street (lab: its depth worked out by hand)', () => {
  it('names each opening by its depth under the street at its own wall', () => {
    const park = withSite(plan(CAR_PARK), { groundSides: { west: 0, east: -3 } })
    const below = openingsBelowGround(park)
    expect(below.map((o) => o.opening)).toEqual(['vent-w'])
    expect(below[0]!.sillBelow).toBeCloseTo(1, 6)
  })
})

describe('the pictures on a slope', () => {
  const chalet = withSite(plan(CHALET), { groundSides: { north: 0, south: -2.8 } })

  it('draws the ground along a side facade as a sloped line, and level along the low side', () => {
    const east = planFacade(chalet, 'east')
    expect(east.ground.fall).toBeDefined()
    const { u0, u1 } = east.extent!
    const ends = [facadeGroundAt(east, u0), facadeGroundAt(east, u1)].sort((a, b) => a - b)
    const surface = groundSurface(chalet)!
    expect(ends[0]).toBeLessThan(-2.7)
    expect(ends[1]).toBeGreaterThan(-0.1)
    expect(ends[1]! - ends[0]!).toBeCloseTo(surface.gradient.y * (u1 - u0), 4)
    const south = planFacade(chalet, 'south')
    expect(south.ground.fall!.perMetre).toBeCloseTo(0, 9)
    expect(facadeGroundAt(south, 0)).toBeCloseTo(-2.8, 0)
    // A flat ground has no fall.
    expect(planFacade(withSite(plan(CHALET), { ground: 0 }), 'east').ground.fall).toBeUndefined()
  })

  it('draws the ground along a section line as sloped, the earth under it with it', () => {
    const section = planSection(chalet, { from: { x: 4, y: -3 }, to: { x: 4, y: 9 }, toward: 'right' })
    expect(section.ground.fall).toBeDefined()
    const surface = groundSurface(chalet)!
    const ends = [sectionGroundAt(section.ground, 0), sectionGroundAt(section.ground, section.length)].sort((a, b) => a - b)
    expect(ends[0]).toBeCloseTo(surface.at({ x: 4, y: -3 }), 6)
    expect(ends[1]).toBeCloseTo(surface.at({ x: 4, y: 9 }), 6)
    expect(section.ground.earth.pieces.length).toBeGreaterThan(0)
  })

  it('tilts the 3D ground sheet', () => {
    const ground = sceneGround(chalet, 10)
    expect(ground.tilt).toBeDefined()
    expect(ground.tilt!.y).toBeGreaterThan(0)
    expect(sceneGround(withSite(plan(CHALET), { ground: 0 }), 10).tilt).toBeUndefined()
  })
})
