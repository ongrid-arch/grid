/**
 * VEW-86: the ground through spot levels, drawn as its true profile in sections and elevations:
 * a ground that bends at each level and steps where two lines of them stand close, the earth under
 * it, and the lower floors of a house stepped down a hill shown on the low side.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import type { FloorPlan } from '../plan'
import { groundSurface } from '../groundSurface'
import { profileAt, spotGround } from '../groundSpots'
import { facadeGroundAt, planFacade } from '../facade'
import { planSection, sectionEarth, sectionGroundAt } from '../section'
import { openingsBelowGround } from '../ground'
import { SiteSchema } from '../../types/floorplan'

const plan = (text: string): FloorPlan => {
  const result = compileRoomsText(text)
  if (result.plan === undefined || result.plan === null) throw new Error(JSON.stringify(result.problems ?? result))
  return result.plan as FloorPlan
}

/** A house stepped down a hill falling south: the bedrooms' floor runs out under the living floor's south front. */
const STEPPED = `plan "Stepped house"
walls outside 0.3 inside 0.1 height 2.6
windows sill 0.9 height 1.3
floor lower "Bedrooms" level -1 elevation -3
room bed "Bedroom" bedroom 8 x 12 at 0.15,0.15
window view in bed south, 3 from west, 1.2 wide
window hill in bed north, 3 from west, 1.2 wide
floor ground "Living floor" level 0 elevation 0
room living "Living room" living 8 x 6 at 0.15,6.15
door front in living north, 1 from west, 0.9 wide
`

/** The ground stepped at the living floor's south front: 0 on the hill, -3 below it, two lines of spot levels 10 cm apart. */
const STEP: NonNullable<FloorPlan['site']>['spotLevels'] = [-2, 10].flatMap((x) => [
  { at: [x, 14] as [number, number], level: 0 },
  { at: [x, 6.4] as [number, number], level: 0 },
  { at: [x, 6.3] as [number, number], level: -3 },
  { at: [x, -2] as [number, number], level: -3 }
])

const withSite = (p: FloorPlan, site: NonNullable<FloorPlan['site']>): FloorPlan => ({ ...p, site })

describe('the ground through spot levels', () => {
  it('meets every level, is read linearly between them and runs on level past the last', () => {
    const ground = spotGround([
      { at: { x: 0, y: 0 }, level: 0 },
      { at: { x: 10, y: 0 }, level: -2 },
      { at: { x: 10, y: 10 }, level: -4 },
      { at: { x: 0, y: 10 }, level: -1 }
    ])
    expect(ground.at({ x: 0, y: 0 })).toBeCloseTo(0, 9)
    expect(ground.at({ x: 10, y: 10 })).toBeCloseTo(-4, 9)
    expect(ground.at({ x: 5, y: 0 })).toBeCloseTo(-1, 9)
    expect(ground.at({ x: 20, y: 0 })).toBeCloseTo(-2, 9)
    expect(ground.at({ x: -5, y: 5 })).toBeCloseTo(-0.5, 9)
  })

  it('reads a line of levels along that line and level across it, and one level everywhere', () => {
    const street = spotGround([
      { at: { x: 0, y: 0 }, level: 0 },
      { at: { x: 10, y: 0 }, level: -1 },
      { at: { x: 20, y: 0 }, level: -3 }
    ])
    expect(street.at({ x: 15, y: 7 })).toBeCloseTo(-2, 9)
    expect(street.at({ x: 5, y: -4 })).toBeCloseTo(-0.5, 9)
    expect(street.at({ x: 30, y: 0 })).toBeCloseTo(-3, 9)
    expect(spotGround([{ at: { x: 3, y: 3 }, level: -1.2 }]).at({ x: 50, y: -9 })).toBeCloseTo(-1.2, 9)
  })

  it('gives the profile along a line with a point at each bend and none on a straight run', () => {
    const street = spotGround([
      { at: { x: 0, y: 0 }, level: 0 },
      { at: { x: 10, y: 0 }, level: -1 },
      { at: { x: 20, y: 0 }, level: -3 },
      { at: { x: 30, y: 0 }, level: -5 }
    ])
    const profile = street.along({ x: -5, y: 2 }, { x: 35, y: 2 })
    expect(profile.map(([x]) => x)).toEqual([0, 5, 15, 35, 40].map((x) => expect.closeTo(x, 9)))
    expect(profileAt(profile, 20)).toBeCloseTo(-2, 9)
    expect(profileAt(profile, 100)).toBeCloseTo(-5, 9)
  })

  it('is refused with two levels at one point, or beside a fall', () => {
    expect(SiteSchema.safeParse({ spotLevels: [{ at: [0, 0], level: 0 }, { at: [0, 0], level: -1 }] }).success).toBe(false)
    expect(SiteSchema.safeParse({ spotLevels: [{ at: [0, 0], level: 0 }], fall: { slope: 10, toward: 'south' } }).success).toBe(false)
    expect(SiteSchema.safeParse({ spotLevels: [{ at: [0, 0], level: 0 }, { at: [0, 4], level: -1 }] }).success).toBe(true)
  })
})

describe('a house stepped down a hill', () => {
  const stepped = withSite(plan(STEPPED), { spotLevels: STEP })

  it('reads the true ground at each wall: the bedroom window on the hill is below the ground, the one on the low side is not', () => {
    const surface = groundSurface(stepped)!
    expect(surface.along).toBeDefined()
    expect(surface.at({ x: 4, y: 10 })).toBeCloseTo(0, 6)
    expect(surface.at({ x: 4, y: 3 })).toBeCloseTo(-3, 6)
    const below = openingsBelowGround(stepped).map((o) => o.opening)
    expect(below).toContain('hill')
    expect(below).not.toContain('view')
  })

  it('draws the section ground as its profile, stepping at the living floor, the earth under it', () => {
    const section = planSection(stepped, { from: { x: 4, y: -3 }, to: { x: 4, y: 15 }, toward: 'right' })
    const g = section.ground
    expect(g.fall).toBeUndefined()
    expect(g.profile).toBeDefined()
    const yAt = (y: number): number => (section.start.y === -3 ? y + 3 : 15 - y)
    expect(sectionGroundAt(g, yAt(12))).toBeCloseTo(0, 6)
    expect(sectionGroundAt(g, yAt(1))).toBeCloseTo(-3, 6)
    // The step: three metres in ten centimetres.
    expect(Math.abs(sectionGroundAt(g, yAt(6.4)) - sectionGroundAt(g, yAt(6.3)))).toBeCloseTo(3, 6)
    expect(g.profile!.length).toBeGreaterThanOrEqual(4)
    const earth = sectionEarth(section, -2, section.length + 2)
    expect(earth.pieces.length).toBeGreaterThan(0)
    const top = Math.max(...earth.pieces.flatMap((p) => p.outline.map((q) => q.y)))
    expect(top).toBeCloseTo(0, 2)
    // The bedrooms' floor is drawn whole: its cut reaches down to its floor on the low side.
    expect(Math.min(...section.cut.flatMap((p) => p.outline.map((q) => q.y)))).toBeLessThan(-3)
  })

  it('draws the side elevation with the ground falling away from the lower floor, which is shown', () => {
    const east = planFacade(stepped, 'east')
    expect(east.ground.fall).toBeUndefined()
    expect(east.ground.profile).toBeDefined()
    const u = (y: number): number => y * (east.across.y >= 0 ? 1 : -1)
    expect(facadeGroundAt(east, u(2))).toBeCloseTo(-3, 6)
    expect(facadeGroundAt(east, u(11))).toBeCloseTo(0, 6)
    // The silhouette reaches down to the bedrooms' floor on the low side, and not on the hill.
    const low = east.outline.flat().filter(([uu]) => Math.abs(uu - u(2)) < 4).map(([, z]) => z)
    expect(Math.min(...low)).toBeLessThan(-2.9)
    const hill = east.outline.flat().filter(([uu]) => Math.abs(uu - u(11)) < 0.5).map(([, z]) => z)
    expect(Math.min(...hill)).toBeGreaterThan(-0.1)
  })

  it('reads as before with no spot levels', () => {
    const flatSite = withSite(plan(STEPPED), { ground: -3 })
    expect(planFacade(flatSite, 'east').ground.profile).toBeUndefined()
    expect(planSection(flatSite, { from: { x: 4, y: -3 }, to: { x: 4, y: 15 }, toward: 'right' }).ground.profile).toBeUndefined()
    const sloped = withSite(plan(STEPPED), { groundSides: { north: 0, south: -3 } })
    expect(planFacade(sloped, 'east').ground.fall).toBeDefined()
    expect(groundSurface(sloped)!.along).toBeUndefined()
  })
})
