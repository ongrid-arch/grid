/**
 * CNT-36: a dividing line written between two rooms works on any side they share, square to the
 * drawing or at an angle, written exactly or to the centimetre; rooms opened to each other that
 * share no side are refused by name; and every note the check makes is in the answer's warnings.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText, type RoomsResult } from '../compile'

const walls = 'walls outside 0.3 inside 0.15 height 2.7\n'
/** A five-sided nave: square on its east side, at an angle on its north-east side, from (10,6) to (5,10). */
const nave = 'room nave "Nave" worship polygon 0,0 10,0 10,6 5,10 0,6\n'
/** A chapel against the east side, square to the drawing. */
const east = 'room ch2 "East chapel" worship polygon 10,1 13,1 13,4 10,4\nwall between nave and ch2 virtual\n'
/** A chapel against the angled side, its corners exactly on it. */
const exact = 'room ch1 "North-east chapel" worship polygon 8.5,7.2 10.9,10.2 7.9,12.6 5.5,9.6\nwall between nave and ch1 virtual\n'
/** The same kind of chapel with its corners written to the centimetre, a few millimetres off the side. */
const rounded = 'room ch1 "North-east chapel" worship polygon 8.67,7.06 10.55,9.41 8.2,11.28 6.33,8.94\nwall between nave and ch1 virtual\n'

function written(text: string): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

/** The walls of the plan that border both rooms or that one of them lists, by kind. */
function between(plan: FloorPlan, a: string, b: string): { lines: string[]; solid: string[] } {
  const of = (id: string): Set<string> => new Set(plan.rooms.find((r) => r.id === id)!.boundary)
  const [A, B] = [of(a), of(b)]
  const shared = plan.walls.filter((w) => A.has(w.id) && B.has(w.id))
  return { lines: shared.filter((w) => w.virtual === true).map((w) => w.id), solid: shared.filter((w) => w.virtual !== true).map((w) => w.id) }
}

describe('a dividing line on an angled side (CNT-36)', () => {
  for (const [label, chapel, mouth] of [
    ['with its corners exactly on the side', exact, 3.84],
    ['with its corners written to the centimetre', rounded, 3],
  ] as const) {
    it(`opens a chapel against the angled side ${label}, as against the square one`, () => {
      const { result, plan } = written(`${walls}${nave}${chapel}${east}`)
      for (const room of ['ch1', 'ch2']) {
        const shared = between(plan, 'nave', room)
        expect(shared.lines).toHaveLength(1)
        expect(shared.solid).toEqual([])
      }
      // The line runs the width of the chapel's mouth, and no outside wall of the nave runs across it.
      const nw = plan.walls.find((w) => w.id === between(plan, 'nave', 'ch1').lines[0])!
      expect(Math.hypot(nw.end[0] - nw.start[0], nw.end[1] - nw.start[1])).toBeCloseTo(mouth, 2)
      expect(result.warnings).toEqual([])
      expect(validatePlan(plan).issues).toEqual([])
    })
  }

  it('opens an angled bay off a hall with 1.8 m outside walls with no drawing problem', () => {
    const text = [
      'walls outside 1.8 inside 0.3 height 6',
      'room hall "Hall" assembly polygon 0,0 12,0 18,7 18,14 0,14',
      'room bay "Bay" assembly polygon 14.02,2.36 15.92,0.73 17.87,3.01 15.98,4.64',
      'wall between hall and bay virtual',
      '',
    ].join('\n')
    const { result, plan } = written(text)
    expect(between(plan, 'hall', 'bay')).toEqual({ lines: ['open-hall-bay'], solid: [] })
    expect(result.warnings).toEqual([])
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('puts a wall between rooms that face each other across an angled side written to the centimetre', () => {
    const text = `${walls}${nave}room ch1 "North-east chapel" worship polygon 8.76,7.18 10.64,9.53 8.29,11.40 6.42,9.06\n`
    const { result, plan } = written(text)
    const shared = between(plan, 'nave', 'ch1')
    expect(shared.lines).toEqual([])
    expect(shared.solid).toHaveLength(1)
    expect(plan.walls.find((w) => w.id === shared.solid[0])!.kind).toBe('interior')
    expect(validatePlan(plan).issues.length).toBe(result.warnings.filter((w) => w.code === 'rooms/check').length)
  })

  it('refuses rooms opened to each other that share no side, naming both', () => {
    const result = compileRoomsText(`${walls}${nave}room ch "Chapel" worship polygon 12,1 15,1 15,4 12,4\nwall between nave and ch virtual\n`)
    expect(result.plan).toBeNull()
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatchObject({ code: 'rooms/no-shared-wall', line: 4 })
    expect(result.problems[0]!.message).toContain("'nave' and 'ch' are opened to each other, but they share no side")
  })

  it('still writes a square chapel as before', () => {
    const { result, plan } = written(`${walls}${nave}${east}`)
    expect(between(plan, 'nave', 'ch2')).toEqual({ lines: ['open-nave-ch2'], solid: [] })
    expect(plan.walls.find((w) => w.id === 'open-nave-ch2')).toMatchObject({ start: [10, 1], end: [10, 4] })
    expect(result.warnings).toEqual([])
  })
})
