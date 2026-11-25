/**
 * WRT-52: a dividing line takes no wall's width, so bays opened to each other keep their module,
 * also when a bay is a unit of several rooms and only some of them are opened.
 */
import { describe, expect, it } from 'vitest'
import { indexPlan } from '../../geometry/plan'
import { tryRoomPolygon } from '../../geometry/room'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText, type RoomsResult } from '../compile'

const walls = 'walls outside 0.3 inside 0.15 height 3'

function written(lines: readonly string[]): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText(`${lines.join('\n')}\n`)
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

/** Each room's inside, as Grid measures it on the plan, from the walls worked out for it. */
function measured(plan: FloorPlan): Record<string, { w: number; d: number; area: number }> {
  const index = indexPlan(plan)
  const out: Record<string, { w: number; d: number; area: number }> = {}
  for (const room of plan.rooms) {
    const poly = tryRoomPolygon(room, index)!
    let twice = 0
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % poly.length]!
      twice += a.x * b.y - b.x * a.y
    }
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    out[room.id] = { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), area: Math.abs(twice) / 2 }
  }
  return out
}

const areaNotes = (result: RoomsResult): string[] => result.warnings.filter((w) => w.code === 'rooms/area-differs').map((w) => w.message)

const bay = ['unit bay', 'room lab "Lab {n}" office 3.3 x 7 at 0,0', 'room desk "Write-up {n}" office 3.3 x 2.4 north of lab', 'end']

describe('a room placed beside a unit goes against the room it is opened to (WRT-52)', () => {
  it('an open lab east of a bay, opened to its lab only, keeps both sizes', () => {
    const { result, plan } = written([walls, ...bay, 'place bay as 1 at 0,0', 'room open "Open lab" office 6 x 7 east of 1 align south', 'wall between lab-1 and open virtual'])
    expect(areaNotes(result)).toEqual([])
    const m = measured(plan)
    expect(m['lab-1']!.area).toBeCloseTo(23.1, 6)
    expect(m['open']!.area).toBeCloseTo(42, 6)
    expect(m['desk-1']!.area).toBeCloseTo(3.3 * 2.4, 6)
  })

  it('a corridor south of a row of bays, opened to each lab, keeps every lab and its own size', () => {
    const { result, plan } = written([
      walls,
      ...bay,
      'repeat bay 4 east as 1 at 0,0',
      'room c "Corridor" corridor * x 2.4 south of 1 until 4',
      ...[1, 2, 3, 4].map((n) => `wall between c and lab-${n} virtual`),
    ])
    expect(areaNotes(result)).toEqual([])
    const m = measured(plan)
    for (const n of [1, 2, 3, 4]) expect(m[`lab-${n}`]!.area).toBeCloseTo(23.1, 6)
    expect(m['c']!.d).toBeCloseTo(2.4, 6)
  })
})

describe('bays sized to centre lines keep their module when their labs are opened (WRT-52)', () => {
  it('puts every dividing line and wall on a 3.3 m line, repeats included', () => {
    const { result, plan } = written([
      walls,
      'sizes centre',
      ...bay,
      'repeat bay 5 east as 1 at 0,0',
      ...[1, 2, 3, 4].map((n) => `wall between lab-${n} and lab-${n + 1} virtual`),
    ])
    const across = plan.walls.filter((w) => w.start[0] === w.end[0] && w.id !== 'ext-west' && w.id !== 'ext-east')
    const xs = [...new Set(across.map((w) => Math.round(w.start[0] * 1e6) / 1e6))].sort((a, b) => a - b)
    const west = plan.walls.find((w) => w.id === 'ext-west')!.start[0]
    expect(xs.map((x) => x - west)).toEqual([1, 2, 3, 4].map((k) => expect.closeTo(3.3 * k, 6)))
    const m = measured(plan)
    for (const n of [2, 3, 4]) {
      expect(m[`lab-${n}`]!.w).toBeCloseTo(3.3, 6)
      expect(m[`desk-${n}`]!.w).toBeCloseTo(3.15, 6)
    }
    expect(plan.walls.filter((w) => w.virtual === true).every((w) => w.thickness === 0)).toBe(true)
    // The write-up room stands back half a wall from the lab's dividing line: its size adds up.
    expect(result.warnings).toEqual([])
  })

  it('sized to inside faces, the same bays still say the labs came out larger', () => {
    const { result } = written([walls, ...bay, 'repeat bay 3 east as 1 at 0,0', 'wall between lab-1 and lab-2 virtual', 'wall between lab-2 and lab-3 virtual'])
    expect(areaNotes(result).length).toBe(3)
  })
})
