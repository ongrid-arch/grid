/**
 * WRT-7 in rooms text: a length may carry its unit in one word, and a `display` line records how
 * the person reads lengths, which the read-back writes again. The file stays in metres.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const metric = 'walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 3.6576 x 3.048\nroom bed "Bed" bedroom 3 x 3.048 east of living\ndoor d1 between living and bed, centred, 0.9144 wide\n'

describe('lengths with their unit', () => {
  it('reads feet and inches, centimetres and millimetres as the same plan in metres', () => {
    const imperial = written('walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 12ft x 10ft\nroom bed "Bed" bedroom 300cm x 3048mm east of living\ndoor d1 between living and bed, centred, 36in wide\n')
    const plain = written(metric)
    expect(imperial.walls.map((w) => [w.start, w.end])).toEqual(plain.walls.map((w) => [w.start, w.end]))
    expect(imperial.openings[0]!.width).toBeCloseTo(0.9144, 9)
    expect(imperial.units).toBe('m')
  })

  it("takes the foot and inch marks in one word: 12'6\" and 12'-6\"", () => {
    for (const size of [`12'6"`, `12'-6"`, '12ft6in']) {
      const result = compileRoomsText(`walls outside 0.3 inside 0.1 height 2.7\nroom living "Living's room" living ${size} x 3\n`)
      expect(result.problems).toEqual([])
      expect(result.rooms[0]!.width).toBeCloseTo(3.81, 9)
      expect(result.rooms[0]!.name).toBe("Living's room")
    }
  })

  it("reads a door's part that opens (CNT-14) in its unit, and the read-back keeps it", () => {
    const plan = written('walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 12ft x 10ft\nroom bed "Bed" bedroom 300cm x 3048mm east of living\ndoor d1 between living and bed, centred, 60in wide, height 80in, part 36in x 2000mm\n')
    expect(plan.openings[0]!.opens!.width).toBeCloseTo(0.9144, 9)
    expect(plan.openings[0]!.opens!.height).toBeCloseTo(2, 9)
    expect(written(readRoomsText(plan).text).openings[0]!.opens).toEqual(plan.openings[0]!.opens)
  })

  it('refuses a unit it cannot read, in words, with the forms it takes', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 12ft13in x 3\n')
    expect(result.plan).toBeNull()
    expect(result.problems[0]).toMatchObject({ code: 'rooms/units', line: 2 })
    expect(result.problems[0]!.message).toContain("12'6\"")
  })
})

describe('the display line', () => {
  it('records how the person reads lengths, and changes no length', () => {
    const plan = written(`display ft-in precision 3\n${metric}`)
    expect(plan.display).toEqual({ length: 'ft-in', precision: 3 })
    expect(plan.walls).toEqual(written(metric).walls)
  })

  it('is written again by the read-back, so writing the reading keeps it', () => {
    const plan = written(`display mm decimal comma\n${metric}`)
    const reading = readRoomsText(plan).text
    expect(reading).toContain('display mm decimal comma')
    expect(written(reading).display).toEqual({ length: 'mm', decimal: 'comma' })
  })

  it('refuses a unit Grid has no display for, naming the ones it has', () => {
    const result = compileRoomsText(`display furlongs\n${metric}`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]!.message).toContain('display <m|cm|mm|ft-in>')
  })
})

describe('a long room side (WRT-22)', () => {
  const head = 'walls outside 0.3 inside 0.1 height 2.7\n'
  const questions = (text: string): string[] => {
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    return result.warnings.filter((w) => w.code === 'rooms/size-question').map((w) => w.message)
  }

  it('takes a length written with its unit as meant, at any size', () => {
    for (const size of ['250m x 160m', '250000mm x 160000mm', '0.25km x 160m']) {
      const result = compileRoomsText(`${head}room hall "Hall" storage ${size}\n`)
      expect(result.problems, size).toEqual([])
      expect(result.rooms[0]!.width, size).toBeCloseTo(250, 6)
      expect(result.rooms[0]!.depth, size).toBeCloseTo(160, 6)
      expect(result.warnings.filter((w) => w.code === 'rooms/size-question'), size).toEqual([])
    }
  })

  it("writes a bare side past a building's in metres and asks about it, naming the unit to write", () => {
    const asked = questions(`${head}room hall "Hall" storage 250 x 160\n`)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain("room 'hall' is 250 m in width, written with no unit: is that meant?")
    expect(asked[0]).toContain('longer than 200 m')
    expect(asked[0]).toContain('250m')
  })

  it('weighs the side by the kind of building: a hall asks later, a home sooner', () => {
    expect(questions(`building warehouse\n${head}room hall "Hall" storage 250 x 160\n`)).toEqual([])
    expect(questions(`building sport\n${head}room stand "Stand" assembly 300 x 40\n`)).toEqual([])
    const home = questions(`${head}room living "Living" living 60 x 4\n`)
    expect(home).toHaveLength(1)
    expect(home[0]).toContain('longer than 50 m in a home')
    expect(questions(`building warehouse\n${head}room hall "Hall" storage 1200 x 160\n`)[0]).toContain('in a building of large halls')
  })

  it('still refuses a bare side so long it is no building, naming the form that is taken', () => {
    const result = compileRoomsText(`${head}room hall "Hall" storage 3600 x 160\n`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]!.code).toBe('rooms/size')
    expect(result.problems[0]!.message).toContain('3600m if it is metres')
    expect(compileRoomsText(`${head}room hall "Hall" storage 3600m x 160\n`).problems).toEqual([])
  })

  it("asks the same of a side stretched with '*' and of a polygon", () => {
    const stretched = questions(`${head}room a "A" storage 10 x 10\nroom b "B" storage 10 x 10 at 790,0\nroom c "C" corridor * x 3 north of a until b\n`)
    expect(stretched).toHaveLength(1)
    expect(stretched[0]).toContain("room 'c' stretches with '*' to")
    const polygon = questions(`${head}room p "P" storage polygon 0,0 400,0 400,20 0,20\n`)
    expect(polygon).toHaveLength(1)
    expect(polygon[0]).toContain("room 'p' is a polygon 400 m across in width")
  })

  it('reads a long room back with its unit, so writing the reading asks nothing', () => {
    const plan = written(`${head}room hall "Hall" storage 250m x 160m\n`)
    const reading = readRoomsText(plan).text
    expect(reading).toContain('250m x 160m')
    expect(questions(reading)).toEqual([])
  })
})
