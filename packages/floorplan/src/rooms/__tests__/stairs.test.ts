/**
 * LVL-21: stairs in rooms text. A two-storey house: on each floor a 2.4 × 5 m room by the west
 * wall (a hall below, a landing above, its inside faces from 0,0 to 2.4,5) and a 5 × 5 m room east
 * of it. Every stair written becomes the plan's own `stairs`, which the drawing, the 3D model,
 * the IFC export and the way-out check read.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planStairs } from '../../geometry/stairs'
import { brokenOnFloor, validatePlan } from '../../geometry/validate'
import { toIfc } from '../../geometry/export/ifc'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { layStair, stairWordsOf } from '../stairs'

const HOUSE = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Ground" level 0 height 2.7',
  'room hall "Hall" corridor 2.4 x 5 at 0,0',
  'room living "Living" living 5 x 5 east of hall',
  'door front in hall south, centred, 0.9 wide, opens in',
  'door d0 between hall and living, centred, 0.8 wide',
  'floor first "First" level 1 height 2.7',
  'room landing "Landing" corridor 2.4 x 5 at 0,0',
  'room bed "Bed" bedroom 5 x 5 east of landing',
  'door d1 between landing and bed, centred, 0.8 wide',
]
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HOUSE, ...lines].join('\n'))
const planOf = (...lines: string[]): FloorPlan => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}
const laid = (plan: FloorPlan) => planStairs(plan, brokenOnFloor)
const stairProblems = (plan: FloorPlan): string[] => validatePlan(plan).issues.filter((i) => i.entity === 'stair').map((i) => i.code)

describe('a stair line (LVL-21)', () => {
  it('lays a straight stair in its room, a landing as deep as it is wide at each end', () => {
    const plan = planOf('stair st "Main stair" from ground to first in hall, 1 wide, straight, runs north')
    expect(plan.stairs).toEqual([{ id: 'st', name: 'Main stair', from: 'ground', to: 'first', width: 1, run: [[1.2, 1], [1.2, 4]] }])
    const [stair] = laid(plan).stairs
    expect(stair).toMatchObject({ lower: { floor: 'ground', room: 'hall' }, upper: { floor: 'first', room: 'landing' } })
    expect(stairProblems(plan)).toEqual([])
    // The stair Grid already draws and exports: the IFC file has it with its flight.
    expect(toIfc(plan)).toMatch(/IFCSTAIR\('[^']+',#\d+,'Main stair'/)
  })

  it('says what it worked out for the stair in the answer', () => {
    const result = write('stair st from ground to first in hall, 1 wide, straight, runs north')
    const line = result.guesses.find((g) => g.startsWith('Line 11: stair st'))!
    expect(line).toMatch(/^Line 11: stair st climbs [0-9.]+ m in \d+ risers of [0-9.]+ m \(worked out\), going [0-9.]+ m, pitch [0-9.]+°, 1 m wide, in 1 flight; walking line 1\.2,1 1\.2,4 from its foot in hall on floor ground to its head in landing on floor first\.$/)
  })

  it('lays an L up the side away from its turn, turning clockwise unless told, and a U up one side and down the other', () => {
    const l = planOf('stair st from ground to first in hall, 0.9 wide, L, runs north')
    expect(l.stairs![0]!.run).toEqual([[0.45, 0.9], [0.45, 4.55], [1.5, 4.55]])
    const west = planOf('stair st from ground to first in hall, 0.9 wide, L, runs north then west')
    expect(west.stairs![0]!.run).toEqual([[1.95, 0.9], [1.95, 4.55], [0.9, 4.55]])
    const u = planOf('stair st from ground to first in hall, 1 wide, U, runs north')
    expect(u.stairs![0]!.run).toEqual([[0.5, 1], [0.5, 4.5], [1.9, 4.5], [1.9, 1]])
    const [stair] = laid(u).stairs
    expect(stair!.flights).toHaveLength(3)
    expect(stair!.landings).toHaveLength(2)
    expect(stairProblems(u)).toEqual([])
  })

  it('reads a room after from or to as its floor, puts the stair in it with no in, and takes along and risers', () => {
    const result = write('stair st from hall to landing, 0.9 wide, runs south along east, risers 16')
    expect(result.problems).toEqual([])
    expect(result.plan!.stairs).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[1.95, 4.1], [1.95, 0.9]], risers: 16 }])
    expect(result.guesses).toContain('Line 11: the stair st goes in room hall, the room from names.')
  })

  it('runs down from an upper floor, and along a walking line of its own', () => {
    const down = planOf('stair st from first to ground in landing, 1 wide, runs east')
    expect(down.stairs![0]).toMatchObject({ from: 'first', to: 'ground', run: [[1, 2.5], [1.4, 2.5]] })
    const own = planOf('stair st from ground to first, 0.9 wide, run 3,1 3,4.5 risers 15')
    expect(own.stairs).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[3, 1], [3, 4.5]], risers: 15 }])
  })

  it('refuses what it cannot lay out, with its line and what to change', () => {
    const cases: Array<[string, RegExp]> = [
      ['stair st from ground to attic in hall, 1 wide, runs north', /'attic' after to is neither a floor of the plan \(its floors: ground, first\) nor a room/],
      ['stair st from ground to ground in hall, 1 wide, runs north', /both floor ground/],
      ['stair st from ground to first in hall, runs north', /how wide it is/],
      ['stair st from ground to first in cellar, 1 wide, runs north', /no room 'cellar'/],
      ['stair st from ground to first in hall, 1 wide', /the way it runs/],
      ['stair st from ground to first in hall, 1.3 wide, runs east', /needs the room longer than 2\.6 m that way.*room hall is 2\.4 m east-west by 5 m across/],
      ['stair st from ground to first in hall, 1.3 wide, U, runs north', /a U stair 1\.3 m wide needs the room wider than 2\.6 m across/],
      ['stair st from ground to first in hall, 1 wide, L, runs north then south', /'then south' is not across/],
      ['stair st from ground to first in hall, 1 wide, straight, runs north then east', /a straight stair does not turn/],
      ['stair st from ground to first in hall, 1 wide, sideways', /'sideways' is not a word a stair line knows/],
      ['stair st from ground to first, 1 wide, run 1,1', /two or more/],
    ]
    for (const [line, message] of cases) {
      const result = write(line)
      expect(result.plan, line).toBeNull()
      expect(result.problems.map((p) => p.line), line).toEqual([11])
      expect(result.problems[0]!.message, line).toMatch(message)
      expect(result.problems[0]!.message, line).toMatch(/^Line 11: /)
    }
    const twice = write('stair st from ground to first in hall, 1 wide, runs north', 'stair st from ground to first in hall, 0.9 wide, runs north')
    expect(twice.problems.map((p) => [p.code, p.line])).toEqual([['rooms/duplicate-id', 12]])
  })

  it('says a stair whose head lands in no room, and keeps it', () => {
    const result = write('stair st from ground to first, 0.9 wide, run 3,1 3,4.5', 'stair s2 from ground to first, 0.9 wide, run 9,1 9,4')
    expect(result.problems).toEqual([])
    expect([...new Set(result.warnings.filter((w) => w.code === 'rooms/stair-end').map((w) => w.line))]).toEqual([12])
    expect(result.plan!.stairs).toHaveLength(2)
  })

  it('takes raw stair as Grid\'s own JSON, its two ends too, and refuses one the plan file would not read', () => {
    const result = write('raw stair {"id": "s1", "from": "ground", "to": "first", "width": 0.9, "start": [1.2, 0.9], "end": [1.2, 4.1], "risers": 16}')
    expect(result.problems).toEqual([])
    expect(result.plan!.stairs).toEqual([{ id: 's1', from: 'ground', to: 'first', width: 0.9, run: [[1.2, 0.9], [1.2, 4.1]], risers: 16 }])
    const bad = write('raw stair {"id": "s1", "from": "ground", "to": "first", "run": [[1, 1], [1, 4]]}')
    expect(bad.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 11]])
    expect(bad.problems[0]!.message).toMatch(/width/)
  })
})

describe('the stairs read back as rooms text (LVL-21)', () => {
  const again = (plan: FloorPlan): FloorPlan => {
    const back = readRoomsText(plan)
    const result = compileRoomsText(back.text)
    expect(result.problems, back.text).toEqual([])
    return parseFloorPlan(result.plan)
  }

  it('writes each stair in its room when the room gives back its walking line, and writing it again keeps it', () => {
    const plan = planOf(
      'stair st from ground to first in hall, 1 wide, U, runs north',
      'stair s2 "Back" from hall to landing, 0.9 wide, straight, runs north along west',
      'stair s3 from ground to first in hall, 0.9 wide, L, runs north then west, risers 17'
    )
    const text = readRoomsText(plan).text
    expect(text).toContain('stair st from ground to first in hall, 1 wide, U, runs north\n')
    expect(text).toContain('stair s2 "Back" from ground to first in hall, 0.9 wide, straight, runs north along west\n')
    expect(text).toContain('stair s3 from ground to first in hall, 0.9 wide, L, runs north then west, risers 17\n')
    expect(again(plan).stairs).toEqual(plan.stairs)
  })

  it('writes a stair no room lays out along its walking line, and one Grid cannot lay out raw', () => {
    const base = planOf()
    const plan: FloorPlan = {
      ...base,
      stairs: [
        { id: 'free', from: 'ground', to: 'first', width: 0.85, run: [[3.123456, 1.5], [3.123456, 4.25], [4.9, 4.25]] },
        { id: 'broken', from: 'ground', to: 'loft', width: 0.9, run: [[1, 1], [1, 4]] },
      ],
    }
    const text = readRoomsText(plan).text
    expect(text).toContain('stair free from ground to first, 0.85 wide, run 3.123456,1.5 3.123456,4.25 4.9,4.25\n')
    expect(text).toContain('raw stair {"id":"broken","from":"ground","to":"loft","width":0.9,"run":[[1,1],[1,4]]}\n')
    expect(again(plan).stairs).toEqual(plan.stairs)
  })

  it('finds the words of a stair laid in a room, and none for one that is not', () => {
    const plan = planOf('stair st from ground to first in hall, 1 wide, L, runs north')
    expect(stairWordsOf(plan, plan.stairs![0]!)).toEqual({ id: 'st', from: 'ground', to: 'first', width: 1, room: 'hall', shape: 'L', runs: 'north' })
    expect(stairWordsOf(plan, { ...plan.stairs![0]!, run: [[0.5, 1], [0.5, 4.4], [1.4, 4.4]] })).toBeNull()
  })

  it('lays the same stair from the same words for a tool as for a line', () => {
    const plan = planOf('stair st from ground to first in hall, 1 wide, U, runs north')
    const made = layStair({ ...plan, stairs: [] }, { id: 'st', from: 'ground', to: 'first', width: 1, room: 'hall', shape: 'U', runs: 'north' })
    expect(made.stair).toEqual(plan.stairs![0])
    expect(made.room).toBe('hall')
  })
})
