/**
 * WRT-79: a floor's roof and its roof lights written as rooms text lines, never as JSON, and read
 * back the same way. An 8 × 6 m house under each roof.
 */
import { describe, expect, it } from 'vitest'
import { safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'floor ground "Ground floor" level 0 height 2.7', 'room house "House" living 8 x 6 at 0,0', 'door front in house south, centred, 0.9 wide, opens in']
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HOUSE, ...lines].join('\n'))
const roofOf = (...lines: string[]): unknown => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return result.plan!.floors![0]!.roof
}
const refused = (...lines: string[]): string => {
  const result = write(...lines)
  expect(result.plan).toBeNull()
  return result.problems[0]!.message
}

describe('the roof line', () => {
  it('writes each shape as the floor roof the plan file holds', () => {
    expect(roofOf('roof flat eaves 3')).toEqual({ shape: 'flat', eaves: 3 })
    expect(roofOf('roof gable pitch 45 eaves 2.7')).toEqual({ shape: 'gable', eaves: 2.7, pitch: 45 })
    expect(roofOf('roof gable ridge 5.2 eaves 2.7 ridge runs north-south')).toEqual({ shape: 'gable', eaves: 2.7, ridge: 5.2, ridgeRuns: 'north-south' })
    expect(roofOf('roof hip pitch 30deg eaves 2.7')).toEqual({ shape: 'hip', eaves: 2.7, pitch: 30 })
    expect(roofOf('roof mono-pitch pitch 10 eaves 2.4 high north')).toEqual({ shape: 'mono-pitch', eaves: 2.4, pitch: 10, highSide: 'north' })
    expect(roofOf('roof shed pitch 10 degrees eaves 240cm rises to east')).toEqual({ shape: 'mono-pitch', eaves: 2.4, pitch: 10, highSide: 'east' })
    expect(roofOf('roof gabled pitch 45 eaves 2.7 runs east-west')).toEqual({ shape: 'gable', eaves: 2.7, pitch: 45, ridgeRuns: 'east-west' })
  })

  it('is the one floor the text has, with no floor line', () => {
    const result = compileRoomsText(['room house "House" living 8 x 6 at 0,0', 'roof gable pitch 40 eaves 2.6'].join('\n'))
    expect(result.problems).toEqual([])
    expect(result.plan!.floors).toHaveLength(1)
    expect(result.plan!.floors![0]!.roof).toEqual({ shape: 'gable', eaves: 2.6, pitch: 40 })
  })

  it('refuses a roof that cannot be, saying what to write', () => {
    expect(refused('roof gable pitch 45')).toMatch(/^Line 5: a roof says how high its eaves are/)
    expect(refused('roof flat pitch 5 eaves 3')).toMatch(/^Line 5: this roof cannot be: its pitch belongs to a sloped roof/)
    expect(refused('roof gable eaves 2.7')).toMatch(/^Line 5: this roof cannot be: its pitch needs the pitch in degrees or the ridge height/)
    expect(refused('roof gable pitch 45 ridge 6 eaves 2.7')).toMatch(/^Line 5: this roof cannot be/)
    expect(refused('roof gable ridge 2 eaves 2.7')).toMatch(/its ridge must be higher than the eaves/)
    expect(refused('roof mono-pitch pitch 10 eaves 2.4')).toMatch(/its highSide is needed on a mono-pitch roof/)
    expect(refused('roof gabel pitch 45 eaves 2.7')).toBe("Line 5: 'gabel' is not a roof's shape: a roof is flat, gable, hip or mono-pitch. Did you mean gable?")
    expect(refused('roof gable pitch 95 eaves 2.7')).toMatch(/^Line 5: 'pitch' takes the roof's slope in degrees/)
    expect(refused('roof gable pitch 45 eaves 2.7 steep')).toMatch(/^Line 5: 'steep' is not a word a roof line takes. Write 'roof <flat\|gable\|hip\|mono-pitch>/)
    expect(refused('roof gable pitch 45 eaves 2.7', 'roof hip pitch 30 eaves 2.7')).toBe("Line 6: this floor's roof is written on line 5 already: write it once, in one roof line.")
    expect(refused('roof gable pitch 45 eaves 2.7', 'raw floor {"roof": {"shape": "flat", "eaves": 3}}')).toMatch(/^Line 6: this floor's roof is written on line 5 already/)
  })

  it('takes a roof copied from the floor below off, or puts its own in its place', () => {
    const text = [...HOUSE, 'roof gable pitch 45 eaves 2.7', 'floor first "First" level 1 elevation 3 copy ground', 'roof none', 'floor second "Second" level 2 elevation 6 copy ground', 'roof flat eaves 2.7'].join('\n')
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    expect(result.plan!.floors!.map((f) => f.roof)).toEqual([{ shape: 'gable', eaves: 2.7, pitch: 45 }, undefined, { shape: 'flat', eaves: 2.7 }])
  })
})

describe('the rooflight line', () => {
  it('places a roof light over the middle of a named room, or at a point', () => {
    const roof = roofOf('roof mono-pitch pitch 10 eaves 2.7 high north', 'rooflight r1 over house, 1.2 x 0.8', 'skylight r2 at 2,3, 0.6 x 0.6', 'roof light r3 at 6,3, 1x1')
    expect(roof).toEqual({
      shape: 'mono-pitch',
      eaves: 2.7,
      pitch: 10,
      highSide: 'north',
      rooflights: [
        { id: 'r1', at: [4, 3], width: 1.2, length: 0.8 },
        { id: 'r2', at: [2, 3], width: 0.6, length: 0.6 },
        { id: 'r3', at: [6, 3], width: 1, length: 1 },
      ],
    })
  })

  it('refuses one with no roof, a room it does not know or an id twice', () => {
    expect(refused('rooflight r1 over house, 1 x 1')).toMatch(/^Line 5: a roof light stands in the floor's roof/)
    expect(refused('roof flat eaves 3', 'rooflight r1 over hall, 1 x 1')).toMatch(/^Line 6: .*hall/)
    // The roof's own check: a roof light over the middle of a gable lies across its ridge.
    expect(refused('roof gable pitch 45 eaves 2.7', 'rooflight r1 over house, 1 x 1')).toMatch(/floor\/rooflight-misplaced/)
    expect(refused('roof flat eaves 3', 'rooflight r1 at 2,2, 1 x 1', 'rooflight r1 at 4,2, 1 x 1')).toBe("Line 7: the roof light id 'r1' is used twice in this floor's roof.")
    expect(refused('roof flat eaves 3', 'rooflight r1 over house')).toMatch(/^Line 6: write 'rooflight <id> over <room>/)
  })
})

describe('reading a roof back', () => {
  const plan = (text: string): FloorPlan => {
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    return safeParseFloorPlan(result.plan)!
  }

  it('writes roof and rooflight lines, and writing them again gives the same floors', () => {
    const first = plan([...HOUSE, 'roof mono-pitch pitch 12 eaves 2.4 high south', 'rooflight r1 over house, 1.2 x 0.8'].join('\n'))
    const back = readRoomsText(first)
    expect(back.text).toContain('roof mono-pitch pitch 12 eaves 2.4 high south\nrooflight r1 at 4,3, 1.2 x 0.8')
    expect(back.text).not.toContain('raw floor')
    expect(back.rawFloors).toEqual([])
    expect(plan(back.text).floors).toEqual(first.floors)
  })

  it('keeps a roof with dormers in raw floor', () => {
    const text = [...HOUSE, 'raw floor {"roof": {"shape": "gable", "eaves": 2.7, "pitch": 45, "dormers": [{"id": "d1", "shape": "box", "at": [4, 4.5], "width": 1.5, "height": 2.6}]}}'].join('\n')
    const back = readRoomsText(plan(text))
    expect(back.text).toContain('raw floor {"roof":')
    expect(back.text).not.toMatch(/^roof /m)
  })
})
