/**
 * WRT-82: a curved raw wall written by its two ends and a point on the curve, a radius and a
 * side, or a bulge, and ends written `from` and `to`, become the plan file's centre and sweep
 * (C21), the same wall as written by them; words that name no curve are refused with their line.
 */
import { describe, expect, it } from 'vitest'
import { curveFault, wallCurve } from '../../geometry/arc'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { arcOfEnds } from '../curves'

const HALL = 'walls outside 0.3 inside 0.1 height 3\nroom hall "Hall" living 5 x 4 at 0,0\n'

const raw = (fields: string): string => `raw wall {"id": "bay", "thickness": 0.2, "height": 3, "kind": "exterior", ${fields}}`

function bay(fields: string): { plan: FloorPlan; guesses: readonly string[] } {
  const result = compileRoomsText(`${HALL}${raw(fields)}\n`)
  expect(result.problems.map((p) => p.message)).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { plan, guesses: result.guesses }
}

const wallOf = (plan: FloorPlan) => plan.walls.find((w) => w.id === 'bay')!

describe('a curved raw wall by its ends (WRT-82)', () => {
  // A half circle of radius 3 from (10, 0) to (16, 0) round (13, 0), bowing south: counter-clockwise.
  const half = '"start": [10, 0], "end": [16, 0]'

  it('works out the centre and sweep from a point on the curve, either way round', () => {
    const south = wallOf(bay(`${half}, "arc": {"through": [13, -3]}`).plan)
    expect(south.arc!.centre[0]).toBeCloseTo(13, 6)
    expect(south.arc!.centre[1]).toBeCloseTo(0, 6)
    expect(south.arc!.sweep).toBeCloseTo(180, 4)
    expect(curveFault(south)).toBeNull()
    const north = wallOf(bay(`${half}, "arc": {"through": [13, 3]}`).plan)
    expect(north.arc!.sweep).toBeCloseTo(-180, 4)
    // More than half a circle: a point beyond the ends' line.
    const big = wallOf(bay(`"start": [10, 0], "end": [16, 0], "arc": {"through": [13, 5]}`).plan)
    const curve = wallCurve(big)!
    expect(Math.abs(big.arc!.sweep)).toBeGreaterThan(180)
    expect(Math.hypot(13 - curve.centre.x, 5 - curve.centre.y)).toBeCloseTo(curve.radius, 6)
    expect(curveFault(big)).toBeNull()
  })

  it('works out the shorter arc of a radius, bowing to the side named', () => {
    const left = wallOf(bay(`${half}, "arc": {"radius": 5, "side": "left"}`).plan)
    const right = wallOf(bay(`${half}, "arc": {"radius": 5, "side": "right"}`).plan)
    expect(left.arc!.centre).toEqual([13, -4])
    expect(right.arc!.centre).toEqual([13, 4])
    const size = (2 * Math.asin(3 / 5) * 180) / Math.PI
    expect(left.arc!.sweep).toBeCloseTo(-size, 5)
    expect(right.arc!.sweep).toBeCloseTo(size, 5)
    expect(wallCurve(left)!.radius).toBeCloseTo(5, 6)
    expect(curveFault(left)).toBeNull()
  })

  it('reads a bulge as CAD stores it, on the arc or the wall, and a bulge of 0 as straight', () => {
    const { plan, guesses } = bay(`${half}, "arc": {"bulge": 1}`)
    expect(wallOf(plan).arc).toEqual({ centre: [13, 0], sweep: 180 })
    expect(guesses.join('\n')).toMatch(/raw wall 'bay' curves round 13,0 turning \+180 degrees/)
    expect(wallOf(bay(`${half}, "bulge": -1`).plan).arc).toEqual({ centre: [13, 0], sweep: -180 })
    const flat = bay(`${half}, "bulge": 0`)
    expect(wallOf(flat.plan).arc).toBeUndefined()
    expect(flat.guesses.join('\n')).toMatch(/bulge of 0, so it is straight/)
  })

  it('reads from and to as start and end, on the wall or in its arc', () => {
    expect(wallOf(bay('"from": [10, 0], "to": [16, 0], "arc": {"bulge": 1}').plan)).toMatchObject({ start: [10, 0], end: [16, 0], arc: { centre: [13, 0], sweep: 180 } })
    expect(wallOf(bay('"arc": {"from": [10, 0], "to": [16, 0], "through": [13, -3]}').plan)).toMatchObject({ start: [10, 0], end: [16, 0] })
    expect(wallOf(bay('"from": [10, 0], "to": [16, 0]').plan).arc).toBeUndefined()
  })

  it('keeps a curve written by its centre and sweep as it was, and says nothing', () => {
    const { plan, guesses } = bay(`${half}, "arc": {"centre": [13, 0], "sweep": 180}`)
    expect(wallOf(plan).arc).toEqual({ centre: [13, 0], sweep: 180 })
    expect(guesses.join('\n')).not.toMatch(/raw wall 'bay'/)
  })

  it('refuses words that name no curve, or say it two ways, with the line and every way to write one', () => {
    const cases: Array<[string, RegExp]> = [
      [`${half}, "arc": {"through": [13, 0]}`, /in line with its two ends/],
      [`${half}, "arc": {"through": [10, 0]}`, /"through" that is not a point/],
      [`${half}, "arc": {"radius": 2, "side": "left"}`, /"radius" that is not a number at least half/],
      [`${half}, "arc": {"radius": 5, "side": "north"}`, /"side" that is not "left" or "right"/],
      [`${half}, "arc": {"radius": 5}`, /"side" that is not/],
      [`${half}, "arc": {"bulge": "big"}`, /"bulge" that is not a number/],
      [`${half}, "arc": {"centre": [13, 0], "through": [13, -3]}`, /more than one way/],
      [`${half}, "bulge": 1, "arc": {"centre": [13, 0], "sweep": 180}`, /twice/],
      [`${half}, "from": [10, 0]`, /twice/],
      ['"start": [10, 0], "end": [10, 0], "arc": {"bulge": 1}', /two different points/],
    ]
    for (const [fields, why] of cases) {
      const result = compileRoomsText(`${HALL}${raw(fields)}\n`)
      expect(result.plan, fields).toBeNull()
      const problem = result.problems.find((p) => p.code === 'rooms/raw' && /raw wall 'bay'/.test(p.message))
      expect(problem?.line, fields).toBe(3)
      expect(problem!.message, fields).toMatch(why)
      expect(problem!.message).toContain('"through": [x, y]')
      expect(problem!.message).toContain('"bulge": <b>')
    }
  })
})

describe('the arc by its ends, worked out (WRT-82)', () => {
  it('gives the same centre and sweep by each form, for one arc', () => {
    // A quarter circle of radius 4 round (0, 0), from (4, 0) to (0, 4), counter-clockwise.
    const s: [number, number] = [4, 0]
    const e: [number, number] = [0, 4]
    const through = arcOfEnds(s, e, { through: [4 * Math.SQRT1_2, 4 * Math.SQRT1_2] })
    const radius = arcOfEnds(s, e, { radius: 4, side: 'right' })
    const bulge = arcOfEnds(s, e, { bulge: Math.tan(Math.PI / 8) })
    for (const made of [through, radius, bulge]) {
      expect(made).not.toBeNull()
      expect('fault' in made!).toBe(false)
      const arc = made as { centre: [number, number]; sweep: number }
      expect(arc.centre[0]).toBeCloseTo(0, 6)
      expect(arc.centre[1]).toBeCloseTo(0, 6)
      expect(arc.sweep).toBeCloseTo(90, 5)
    }
  })
})
