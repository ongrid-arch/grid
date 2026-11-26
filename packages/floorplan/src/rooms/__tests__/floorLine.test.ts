/**
 * WRT-14: the floor line is hard to get wrong. The name is optional and, when given, in quotes;
 * the settings agents guess (`elevation=0`, `level: 1`) are read as `key value`; level is the
 * storey number; and every refusal quotes the whole form and says what each word measures.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const ROOM = 'room a "A" living 3 x 3 at 0,0'
const FORM = 'floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]'

function floorsOf(...floorLines: string[]): NonNullable<FloorPlan['floors']> {
  const text = floorLines.flatMap((line) => [line, ROOM]).join('\n')
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan).floors!
}

function refusal(floorLine: string): { code: string; message: string } {
  const result = compileRoomsText(`${floorLine}\n${ROOM}`)
  expect(result.plan).toBeNull()
  expect(result.problems).toHaveLength(1)
  return result.problems[0]!
}

describe('the floor name', () => {
  it('is optional: a floor with none is named by its id', () => {
    const [f] = floorsOf('floor ground')
    expect(f).toMatchObject({ id: 'ground', name: 'ground', level: 0 })
    const [g] = floorsOf('floor g level 0 elevation 0')
    expect(g).toMatchObject({ id: 'g', name: 'g', level: 0, elevation: 0 })
  })

  it('is written in quotes; an unquoted name is refused with the line it should be', () => {
    const p = refusal('floor l1 First floor level 1 elevation 3')
    expect(p.code).toBe('rooms/syntax')
    expect(p.message).toContain(`floor l1 "First floor" level 1 elevation 3`)
    expect(p.message).toContain(FORM)
  })

  it('may be given as name "<text>"', () => {
    const [f] = floorsOf('floor l1 name "First floor" level 1')
    expect(f).toMatchObject({ id: 'l1', name: 'First floor', level: 1 })
  })

  it('refuses a name that reads as a setting', () => {
    const p = refusal('floor a "elevation=0"')
    expect(p.code).toBe('rooms/syntax')
    expect(p.message).toContain('elevation 0')
    expect(p.message).toContain(FORM)
  })
})

describe('the settings agents guess', () => {
  it('reads key=value, key:value, key: value and key = value as key value', () => {
    const floors = floorsOf(
      'floor a elevation=0 level=0',
      'floor b "B" level:1 elevation: 3.1',
      'floor c "C" level = 2 Elevation = 6.2 height=2.8 slab:0.3'
    )
    expect(floors.map((f) => [f.id, f.name, f.level, f.elevation])).toEqual([
      ['a', 'a', 0, 0],
      ['b', 'B', 1, 3.1],
      ['c', 'C', 2, 6.2],
    ])
    expect(floors[2]).toMatchObject({ height: 2.8, slab: 0.3 })
  })

  it('refuses a word written twice, a word with no value and a word it does not know, each with the form', () => {
    for (const line of ['floor a "A" level 1 level 2', 'floor a "A" level', 'floor a "A" storey 2', 'floor a "A" level 1 3.2', 'floor a 3.2']) {
      const p = refusal(line)
      expect(p.code, line).toBe('rooms/syntax')
      expect(p.message, line).toContain(FORM)
      expect(p.message, line).not.toContain('Write it')
    }
  })

  it('quotes the form when a value is not a length', () => {
    const p = refusal('floor a "A" height tall')
    expect(p.message).toContain(FORM)
  })
})

describe('level is the storey number', () => {
  it('takes whole numbers, below ground too, and a half for a half level', () => {
    const floors = floorsOf('floor b "Basement" level -1', 'floor g "Ground" level 0', 'floor m "Mezzanine" level 0.5', 'floor f "First" level 1')
    expect(floors.map((f) => f.level)).toEqual([-1, 0, 0.5, 1])
  })

  it('refuses a level written in metres, and says to write elevation', () => {
    for (const line of ['floor a "A" level 2.85', 'floor a "A" level 3.2 height 3.2', 'floor a "A" level 0.6']) {
      const p = refusal(line)
      expect(p.code, line).toBe('rooms/syntax')
      expect(p.message, line).toMatch(/storey number/)
      expect(p.message, line).toMatch(/elevation \d/)
      expect(p.message, line).toContain(FORM)
    }
  })

  it('refuses a level with a unit', () => {
    const p = refusal('floor a "A" level -9ft')
    expect(p.message).toMatch(/storey number/)
    expect(p.message).toContain('elevation -9ft')
  })

  it('says what height measures, so a floor-to-floor figure is not written as height', () => {
    const p = refusal('floor a "A" level 2.85')
    expect(p.message).toMatch(/floor-to-floor/)
    expect(p.message).toMatch(/slab/)
  })
})

describe('every floor-line refusal quotes the form', () => {
  it('a floor with no id, a floor written twice, a kind of building Grid does not know', () => {
    expect(refusal('floor').message).toContain(FORM)
    expect(refusal('floor a "A" building castle').message).toContain(FORM)
    const twice = compileRoomsText(`floor a "A"\n${ROOM}\nfloor a "B"\n${ROOM}`)
    expect(twice.problems[0]!.code).toBe('rooms/duplicate-id')
    expect(twice.problems[0]!.message).toContain(FORM)
  })
})

describe('the read-back', () => {
  it('gives a level that is neither whole nor a half in raw floor, and loses nothing', () => {
    const plan = parseFloorPlan(compileRoomsText(`floor g "Ground" level 0\n${ROOM}\nfloor u "Up" level 1\n${ROOM}`).plan)
    const odd: FloorPlan = { ...plan, floors: plan.floors!.map((f) => (f.id === 'u' ? { ...f, level: 0.25 } : f)) }
    const reading = readRoomsText(odd)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toContain('raw floor {"level":0.25}')
    const again = compileRoomsText(reading.text)
    expect(again.problems).toEqual([])
    expect(parseFloorPlan(again.plan).floors!.map((f) => f.level)).toEqual([0, 0.25])
  })

  it('writes an unnamed floor back as it reads', () => {
    const plan = parseFloorPlan(compileRoomsText(`floor ground\n${ROOM}`).plan)
    const again = compileRoomsText(readRoomsText(plan).text)
    expect(again.problems).toEqual([])
    expect(parseFloorPlan(again.plan).floors).toEqual(plan.floors)
  })
})

/** WRT-69: a refusal names the real fault: a number or a name in the wrong place, a word with no value. */
describe('the fault a floor-line refusal names', () => {
  /** The line the refusal offers, read with the room under it. */
  function offered(message: string): string {
    const line = /Write it: '([^']+)'/.exec(message)?.[1]
    expect(line, message).toBeDefined()
    expect(compileRoomsText(`${line!}\n${ROOM}`).problems).toEqual([])
    return line!
  }

  it('says a number after the id stands where the quoted name goes, and offers it as the level', () => {
    const p = refusal('floor g 0')
    expect(p.code).toBe('rooms/syntax')
    expect(p.message).toContain("'0' stands where the floor's name goes, right after its id")
    expect(p.message).toContain('in quotes')
    expect(offered(p.message)).toBe('floor g level 0')
    expect(p.message).toContain(FORM)
    expect(offered(refusal('floor l1 1 "First" height 3').message)).toBe('floor l1 "First" level 1 height 3')
  })

  it('offers no level for a number that is no storey number, or on a line that has one', () => {
    for (const line of ['floor a 3.2', 'floor a 2 level 2']) {
      const p = refusal(line)
      expect(p.message, line).toContain("stands where the floor's name goes, right after its id")
      expect(p.message, line).not.toContain('Write it')
    }
  })

  it('says a quoted name written after the settings goes right after the id', () => {
    const p = refusal('floor g level 0 "Ground" height 3')
    expect(p.code).toBe('rooms/syntax')
    expect(p.message).toContain('right after its id, before the settings')
    expect(offered(p.message)).toBe('floor g "Ground" level 0 height 3')
    // A second name is still a word the line does not know.
    expect(refusal('floor g "Ground" level 0 "Other"').message).toContain("'Other' is not a word a floor line knows")
  })

  it('says what a known word with no value after it takes', () => {
    const slab = refusal('floor g level 0 slab')
    expect(slab.code).toBe('rooms/syntax')
    expect(slab.message).toContain("'slab' needs its value after it: slab <m>, the thickness of the floor it stands on")
    expect(refusal('floor g slab height 3').message).toContain("'slab' needs its value after it: slab <m>")
    expect(refusal('floor g "G" level').message).toContain("'level' needs its value after it: level <n>, the storey number")
    expect(refusal('floor g "G" elevation').message).toContain("'elevation' needs its value after it: elevation <m>")
    expect(refusal('floor g "G" height').message).toContain("'height' needs its value after it: height <m>")
    expect(refusal('floor g name').message).toContain(`'name' needs its value after it: name "<name>"`)
    expect(refusal('floor g "G" building').message).toContain("'building' needs its value after it: building <kind>, one of: ")
  })
})
