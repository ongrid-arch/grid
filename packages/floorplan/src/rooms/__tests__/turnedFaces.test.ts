/**
 * WRT-56: polygon rooms whose facing sides are a few degrees out of parallel, a wall's width apart
 * along all they share, get one wall between them, drawn along their middle line, as a scanned
 * room's do: never an outside wall on each side laid over each other. The rooms keep their corners
 * and the answer says so once a floor.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { compileRoomsText, type RoomsResult } from '../compile'

const walls = 'walls outside 0.6 inside 0.115 height 3\n'
/** Two rooms side by side, the east side of the first square, the west side of the second leaning by `top` at its north end. */
const pair = (top: string): string => `${walls}room a "Study" office polygon 0,0 4,0 4,5 0,5\nroom b "Library" office polygon 4.115,0 8,0 8,5 ${top},5\n`

function written(text: string): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

/** The walls between two rooms: both list them, and they are no outside wall the two run along. */
function shared(plan: FloorPlan, a: string, b: string): Wall[] {
  const of = (id: string): Set<string> => new Set(plan.rooms.find((r) => r.id === id)!.boundary)
  const [A, B] = [of(a), of(b)]
  return plan.walls.filter((w) => A.has(w.id) && B.has(w.id) && w.kind !== 'exterior')
}

const codes = (result: RoomsResult): string[] => result.warnings.map((w) => w.code)

/**
 * A room of a ring between radii r0 and r1, from a0 to a1 degrees, its arcs written as facets of
 * `step` degrees, or, `staggered`, as facets half a step on from those, and its sides across the
 * ring set in by half a 0.1 m wall. A staggered arc's facets are up to half a step out of parallel
 * with those of the arc beside it.
 */
function band(id: string, r0: number, r1: number, a0: number, a1: number, step: number, staggered: boolean): string {
  const n = Math.round((a1 - a0) / step)
  const marks = staggered ? [a0, ...Array.from({ length: n }, (_, i) => a0 + (i + 0.5) * step), a1] : Array.from({ length: n + 1 }, (_, i) => a0 + i * step)
  const at = (r: number, k: number): string => {
    const t = (marks[k]! * Math.PI) / 180
    // The two ends are set in along the arc, square to the side across the ring.
    const along = k === 0 ? 0.05 : k === marks.length - 1 ? -0.05 : 0
    return `${(r * Math.cos(t) - along * Math.sin(t)).toFixed(3)},${(r * Math.sin(t) + along * Math.cos(t)).toFixed(3)}`
  }
  const last = marks.length - 1
  const points = [...marks.map((_, k) => at(r0, k)), ...marks.map((_, k) => at(r1, last - k))]
  return `room ${id} "${id}" assembly polygon ${points.join(' ')}`
}

describe('sides a few degrees out of parallel (WRT-56)', () => {
  for (const [label, top, degrees] of [
    ['0.8 degrees', '4.185', 0.8],
    ['2 degrees', '4.29', 2],
  ] as const) {
    it(`gives a 115 mm partition ${label} out of parallel one wall, along the middle line`, () => {
      const { result, plan } = written(pair(top))
      const between = shared(plan, 'a', 'b')
      expect(between).toHaveLength(1)
      const w = between[0]!
      expect(w.kind).toBe('interior')
      // The 115 mm the text states, which the gap passes through, midway between the two sides at both ends.
      const gapAt = (y: number): number => 4.115 + ((Number(top) - 4.115) * y) / 5 - 4
      expect(w.thickness).toBeCloseTo(0.115, 4)
      const xAt = (y: number): number => w.start[0] + ((w.end[0] - w.start[0]) * (y - w.start[1])) / (w.end[1] - w.start[1])
      for (const y of [0, 5]) expect(xAt(y)).toBeCloseTo(4 + gapAt(y) / 2, 3)
      // No outside wall stands between the rooms.
      expect(plan.walls.filter((x) => x.kind === 'exterior' && x.start[0] > 1 && x.start[0] < 7 && x.end[0] > 1 && x.end[0] < 7)).toEqual([])
      const turned = result.warnings.filter((x) => x.code === 'rooms/faces-turned')
      expect(turned).toHaveLength(1)
      expect(turned[0]!.message).toContain(`'a' with 'b'`)
      expect(turned[0]!.message).toContain(`${degrees.toFixed(1)} degrees`)
      expect(turned[0]!.message).toContain(`${((gapAt(5) - 0.115) * 500).toFixed(0)} mm off`)
      expect(codes(result).filter((c) => c === 'rooms/check')).toEqual([])
      expect(validatePlan(plan).issues).toEqual([])
    })
  }

  it('makes the wall as thick as the gap on average, and says so, when the gap passes through no thickness the text states', () => {
    const { result, plan } = written(pair('4.185').replace('inside 0.115', 'inside 0.1'))
    expect(shared(plan, 'a', 'b').map((w) => w.thickness)).toEqual([0.15])
    expect(codes(result)).toContain('rooms/wall-from-gap')
  })

  it('writes a curved band of polygon rooms, its arcs in facets that do not line up, with walls between rooms only', () => {
    const text = [
      'walls outside 0.3 inside 0.1 height 3',
      band('i1', 5, 8, 0, 30, 7.5, false),
      band('i2', 5, 8, 30, 60, 7.5, false),
      band('o1', 8.1, 11, 0, 30, 7.5, true),
      band('o2', 8.1, 11, 30, 60, 7.5, true),
      '',
    ].join('\n')
    const { result, plan } = written(text)
    for (const [a, b] of [['i1', 'o1'], ['i2', 'o2'], ['i1', 'i2'], ['o1', 'o2']] as const) {
      expect(shared(plan, a, b).length).toBeGreaterThan(0)
      for (const w of shared(plan, a, b)) expect(w.kind).toBe('interior')
    }
    expect(codes(result)).toContain('rooms/faces-turned')
    expect(codes(result).filter((c) => c === 'rooms/check' || c === 'rooms/hole' || c === 'rooms/not-drawn')).toEqual([])
    expect(validatePlan(plan).issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('leaves sides further than 5 degrees out of parallel apart', () => {
    const result = compileRoomsText(pair('4.6'))
    expect(codes(result)).not.toContain('rooms/faces-turned')
  })

  it('leaves sides out of parallel that are wider apart than a wall at one end apart', () => {
    const result = compileRoomsText(`${walls}room a "Study" office polygon 0,0 4,0 4,5 0,5\nroom b "Library" office polygon 4.3,0 8,0 8,5 4.7,5\n`)
    expect(codes(result)).not.toContain('rooms/faces-turned')
  })

  it('says nothing of a side written to the centimetre against an angled one', () => {
    const { result } = written(
      'walls outside 0.3 inside 0.15 height 2.7\nroom nave "Nave" worship polygon 0,0 10,0 10,6 5,10 0,6\nroom ch1 "North-east chapel" worship polygon 8.76,7.18 10.64,9.53 8.29,11.40 6.42,9.06\n'
    )
    expect(codes(result)).not.toContain('rooms/faces-turned')
  })
})
