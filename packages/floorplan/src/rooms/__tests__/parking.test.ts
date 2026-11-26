/**
 * CNT-46: parking bays and ramps in rooms text. A two-level car park: on each floor a 30 × 20 m
 * deck (its inside faces from 0,0 to 30,20) and a 12 × 12 m ramp room east of it (30.x to 42.x).
 * Every bay and ramp written becomes the plan's own `bays` and `ramps`, which the counts, the
 * drawing and the checks read.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planBayCounts, planRamps } from '../../geometry/parking'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { layBays, layRamp, numberAfter, rampWordsOf } from '../parking'

const PARK = [
  'walls outside 0.3 inside 0.2 height 3',
  'floor b1 "Basement" level -3 height 3',
  'room deck "Deck" parking 30 x 20 at 0,0',
  'room spiral "Spiral" parking 12 x 12 east of deck',
  'door d0 between deck and spiral, centred, 6 wide',
  'floor g "Ground" level 0 height 3',
  'room deck "Deck" parking 30 x 20 at 0,0',
  'room spiral "Spiral" parking 12 x 12 east of deck',
  'door d1 between deck and spiral, centred, 6 wide',
]
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...PARK, ...lines].join('\n'))
const planOf = (...lines: string[]): FloorPlan => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}
const again = (plan: FloorPlan): FloorPlan => {
  const text = readRoomsText(plan).text
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

describe('bay lines (CNT-46)', () => {
  it('writes one bay on the floor of the floor line above it, a kind giving Grid its size', () => {
    const plan = planOf('bay p1 at 2,3, 2.5 x 5, number 101', 'bay p2 at 6,3, accessible, on b1')
    expect(plan.bays).toEqual([
      { id: 'p1', number: '101', at: [2, 3], width: 2.5, length: 5, floor: 'g' },
      { id: 'p2', at: [6, 3], width: 3.6, length: 5, floor: 'b1' },
    ])
    const result = write('bay p2 at 6,3, accessible')
    expect(result.guesses.join('\n')).toMatch(/Grid's own size for an accessible bay, not a code figure.*Grid records no kind on a bay/)
  })

  it('lays a row along a side of a room, as many as fit unless count says, numbered on', () => {
    const plan = planOf('bays s in deck along south, 2.5 x 5, numbered B1-01')
    expect(plan.bays).toHaveLength(12)
    expect(plan.bays![0]).toEqual({ id: 's-1', number: 'B1-01', at: [1.25, 2.5], width: 2.5, length: 5, floor: 'g' })
    expect(plan.bays![11]).toMatchObject({ id: 's-12', number: 'B1-12', at: [28.75, 2.5] })
    const north = planOf('bays n in deck along north, car, count 4, from east, inset 1')
    expect(north.bays!.map((b) => b.at)).toEqual([[27.75, 17.5], [25.25, 17.5], [22.75, 17.5], [20.25, 17.5]])
    const west = planOf('bays w in deck along west, 2.5 x 5, count 2')
    expect(west.bays!.map((b) => [b.at, b.turn])).toEqual([[[2.5, 1.25], 90], [[2.5, 3.75], 90]])
  })

  it('fills a room with rows and the aisles between them, and says how', () => {
    const result = write('bays f in deck fill, car, aisle 6, numbered 1')
    expect(result.problems).toEqual([])
    const bays = result.plan!.bays!
    // 20 m deep: a row (5), its aisle (6), a row (5); a third row would need an aisle of its own.
    expect(bays).toHaveLength(24)
    expect(new Set(bays.map((b) => b.at[1]))).toEqual(new Set([2.5, 13.5]))
    expect(bays[23]).toMatchObject({ id: 'f-24', number: '24' })
    const said = result.guesses.join('\n')
    expect(said).toMatch(/2 rows of bays running east-west from the south side of room g-deck, with 1 aisle 6 m wide, up to 12 bays a row; 4 m left at the north side/)
    expect(said).toMatch(/24 2\.5 x 5 m bays in room g-deck on floor g, f-1 to f-24, numbered 1 to 24/)
    const big = write('bays f in deck fill, car, aisle 2.5')
    // With 2.5 m aisles: a row, an aisle, two rows back to back and the third row's aisle.
    expect(big.plan!.bays).toHaveLength(36)
    expect(planBayCounts(parseFloorPlan(result.plan)).find((c) => c.floor === 'g')).toMatchObject({ count: 24 })
  })

  it('numbers on from the last digits, keeping their width', () => {
    expect(numberAfter('B1-07', 3)).toBe('B1-10')
    expect(numberAfter('9', 1)).toBe('10')
    expect(() => numberAfter('A', 1)).toThrow(/numbered/)
  })

  it('refuses a row that does not fit, naming the room and what it needs', () => {
    const cases: Array<[string, RegExp]> = [
      ['bays s in deck along south, 2.5 x 5, count 20', /20 bays 2\.5 m wide do not fit along the south side of room g-deck: 12 do/],
      ['bays s in deck along south, 2.5 x 25', /need the room 25 m deep from its south side, and room g-deck is 30 m east-west by 20 m north-south inside/],
      ['bays f in spiral fill, 2.5 x 5, aisle 8, rows north-south', /need the room 13 m deep/],
      ['bays s in nowhere along south, car', /no room 'nowhere'/],
      ['bays s in deck along south, 2.5 x', /not a word a bays line knows/],
    ]
    for (const [line, message] of cases) {
      const result = write(line)
      expect(result.problems.map((p) => p.code)).toEqual(['rooms/bay'])
      expect(result.problems[0]!.message).toMatch(message)
      expect(result.problems[0]!.message).toMatch(/^Line 10: /)
    }
  })

  it('takes raw bays as the plan file holds them, and refuses an id twice', () => {
    const plan = planOf('raw bay {"id": "x1", "at": [3, 3], "width": 2.4, "length": 4.8, "floor": "b1"}')
    expect(plan.bays).toEqual([{ id: 'x1', at: [3, 3], width: 2.4, length: 4.8, floor: 'b1' }])
    const twice = write('bay x1 at 3,3, car', 'bay x1 at 9,3, car')
    expect(twice.problems.map((p) => p.code)).toEqual(['rooms/duplicate-id'])
  })

  it('writes rows back as rows, and writing them again gives the same bays', () => {
    const plan = planOf('bays f in deck fill, car, numbered B-001', 'bays w in spiral along west, 2.5 x 5, count 3, on b1', 'bay one at 40,3, 2.4 x 4.8, turn 30')
    const text = readRoomsText(plan).text
    expect(text).toMatch(/^bays f at 1\.25,2\.5, 2\.5 x 5, count 12, runs east, numbered B-001, on g$/m)
    expect(text).toMatch(/^bays f at 1\.25,13\.5, 2\.5 x 5, count 12, runs east, first 13, numbered B-013, on g$/m)
    expect(text).toMatch(/^bay one at 40,3, 2\.4 x 4\.8, turn 30, on g$/m)
    expect(again(plan).bays).toEqual(plan.bays)
  })
})

describe('ramp lines (CNT-46)', () => {
  it('lays a straight ramp in its room and works out its slope from the floors', () => {
    const result = write('ramp r1 "Down ramp" from b1 to g in spiral, 4 wide, straight, runs north along west')
    expect(result.problems).toEqual([])
    const ramp = result.plan!.ramps![0]!
    expect(ramp).toMatchObject({ id: 'r1', name: 'Down ramp', from: 'b1', to: 'g', width: 4 })
    expect(ramp.run[0]![1]).toBeLessThan(ramp.run[1]![1])
    expect(result.guesses.join('\n')).toMatch(/ramp r1 climbs 3\.25 m from floor b1 to floor g over 12 m along its middle line: slope 27\.1% \(1 in 3\.7\)/)
  })

  it('turns a helix round the middle of its room, its points on one circle', () => {
    const plan = planOf('ramp h from b1 to g in spiral, 3.5 wide, helix, turns 1')
    const ramp = plan.ramps![0]!
    expect(ramp.run).toHaveLength(25)
    const at = ramp.run[0]!
    const middle = [ramp.run[6]![0] - ramp.run[18]![0], 0]
    expect(middle[0]).not.toBe(0)
    const centre = [(ramp.run[0]![0] + ramp.run[12]![0]) / 2, (ramp.run[0]![1] + ramp.run[12]![1]) / 2] as const
    const radius = Math.hypot(at[0] - centre[0], at[1] - centre[1])
    for (const p of ramp.run) expect(Math.hypot(p[0] - centre[0], p[1] - centre[1])).toBeCloseTo(radius, 6)
    // Its last point is its first: one full turn.
    expect(ramp.run[24]![0]).toBeCloseTo(at[0], 6)
    expect(ramp.run[24]![1]).toBeCloseTo(at[1], 6)
    const layout = planRamps(plan).ramps[0]!
    expect(layout.rise).toBeCloseTo(3.25, 6)
    expect(layout.length).toBeGreaterThan(2 * Math.PI * radius * 0.98)
  })

  it('refuses a ramp it cannot lay, with its line and what to change', () => {
    const cases: Array<[string, RegExp]> = [
      ['ramp r from b1 to b1 in spiral, 4 wide, straight, runs north', /both floor b1/],
      ['ramp r from b1 to attic in spiral, 4 wide, straight, runs north', /'attic' after to is neither a floor/],
      ['ramp r from b1 to g in spiral, straight, runs north', /how wide it is/],
      ['ramp r from b1 to g in spiral, 13 wide, straight, runs north', /does not fit across room/],
      ['ramp r from b1 to g in spiral, 3 wide, helix, radius 9', /past the walls of room/],
      ['ramp r from b1 to g in spiral, 4 wide, helix, radius 1.5', /half its width/],
    ]
    for (const [line, message] of cases) {
      const result = write(line)
      expect(result.problems.map((p) => p.code)).toEqual(['rooms/ramp'])
      expect(result.problems[0]!.message).toMatch(message)
    }
  })

  it('takes a raw ramp as it is, and the old raw words now say where a bay and a ramp go', () => {
    const plan = planOf('raw ramp {"id": "rr", "from": "b1", "to": "g", "width": 3, "run": [[5, 5], [25, 5]]}')
    expect(plan.ramps).toEqual([{ id: 'rr', from: 'b1', to: 'g', width: 3, run: [[5, 5], [25, 5]] }])
    const stall = write('raw stall {"id": "s"}')
    expect(stall.problems[0]!.message).toMatch(/raw bay \{"id": "<id>", "at": \[x, y\]/)
  })

  it('writes a helix and an in-room ramp back as their own words, and writing them again gives the same ramps', () => {
    const plan = planOf('ramp h from b1 to g in spiral, 3.5 wide, helix, turns 1, clockwise, starts west', 'ramp r1 from b1 to g in deck, 4 wide, straight, runs east along north', 'ramp r2 from b1 to g, 3 wide, run 2,2 10,2 10,8')
    const text = readRoomsText(plan).text
    expect(text).toMatch(/^ramp h from b1 to g, 3\.5 wide, helix at [0-9.]+,[0-9.]+ radius [0-9.]+ turns 1 starts west clockwise$/m)
    expect(text).toMatch(/^ramp r1 from b1 to g in (b1-)?deck, 4 wide, straight, runs east along north$/m)
    expect(text).toMatch(/^ramp r2 from b1 to g, 3 wide, run 2,2 10,2 10,8$/m)
    expect(again(plan).ramps).toEqual(plan.ramps)
  })

  it('finds a helix in a ramp the file holds, and only when laying it out again gives its points', () => {
    const plan = planOf('ramp h from b1 to g in spiral, 3.5 wide, helix, turns 1.5')
    const words = rampWordsOf(plan, plan.ramps![0]!)
    expect(words).toMatchObject({ shape: 'helix', turns: 1.5 })
    const bent = { ...plan.ramps![0]!, run: plan.ramps![0]!.run.map((p, i) => (i === 3 ? ([p[0] + 0.5, p[1]] as [number, number]) : p)) }
    expect(rampWordsOf(plan, bent)).toBeNull()
  })

  it('lays the same bays and ramps through the functions the tools call', () => {
    const plan = planOf()
    const made = layBays(plan, { group: 'f', how: 'fill', room: 'deck', kind: 'car' }, 'g')
    expect(made.bays).toHaveLength(24)
    const ramp = layRamp(plan, { id: 'h', from: 'b1', to: 'g', width: 3.5, room: 'spiral', shape: 'helix' })
    expect(ramp.layout.rise).toBeCloseTo(3.25, 6)
  })
})
