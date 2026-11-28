/**
 * LVL-29: a roof's overhang on the roof line, and the canopy and brise-soleil lines, written,
 * refused with the fix and read back.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { roofOfWords, roofPartOfWords } from '../roofs'

const text = (...lines: string[]): string => ['room a "Hall" living 8 x 6 at 0,0', ...lines, ''].join('\n')

const roofOf = (source: string) => {
  const compiled = compileRoomsText(source)
  expect(compiled.problems).toEqual([])
  return parseFloorPlan(compiled.plan).floors![0]!.roof!
}

const refusal = (source: string): string => {
  const compiled = compileRoomsText(source)
  expect(compiled.problems.length).toBeGreaterThan(0)
  return compiled.problems.map((p) => p.message).join('\n')
}

describe('a roof overhang in rooms text (LVL-29)', () => {
  it('reads one figure all round, and side by side', () => {
    expect(roofOf(text('roof gable pitch 40 eaves 2.7 overhang 0.6')).overhang).toBe(0.6)
    expect(roofOf(text('roof flat eaves 2.7 overhang south 0.9 north 0.3')).overhang).toEqual({ north: 0.3, south: 0.9 })
  })

  it('refuses a figure out of range, a side twice and a word that is no figure', () => {
    expect(refusal(text('roof flat eaves 2.7 overhang 5'))).toContain("'overhang' takes metres past the walls, from 0 to 3")
    expect(refusal(text('roof flat eaves 2.7 overhang -1'))).toContain("'overhang' takes")
    expect(refusal(text('roof flat eaves 2.7 overhang north 0.3 north 0.4'))).toContain("says 'overhang north' twice")
    expect(refusal(text('roof flat eaves 2.7 overhang wide'))).toContain("'overhang' takes")
  })

  it('is taken by the words a tool passes', () => {
    expect(roofOfWords(['roof', 'hip', 'pitch', '30', 'eaves', '2.7', 'overhang', 'east', '0.5'], 0)?.overhang).toEqual({ east: 0.5 })
  })
})

describe('canopy and brise-soleil lines (LVL-29)', () => {
  it('add parts to the floor roof', () => {
    const roof = roofOf(text('roof flat eaves 2.7', 'canopy entrance south depth 1.2 height 2.4 width 3 at 4,0', 'brise soleil shade west depth 0.8 height 2.2 blades 6'))
    expect(roof.parts).toEqual([
      { id: 'entrance', kind: 'canopy', side: 'south', depth: 1.2, height: 2.4, width: 3, at: [4, 0] },
      { id: 'shade', kind: 'brise-soleil', side: 'west', depth: 0.8, height: 2.2, blades: 6 }
    ])
    expect(roofPartOfWords(['brise-soleil', 'b', 'east', 'depth', '1', 'height', '2'], 0)).toEqual({ id: 'b', kind: 'brise-soleil', side: 'east', depth: 1, height: 2 })
  })

  it('refuses a part with no roof above it, a bad side, a missing depth, blades on a canopy and an id twice', () => {
    expect(refusal(text('canopy c south depth 1 height 2.4'))).toContain("a canopy is part of the floor's roof: write the floor's roof line above it")
    expect(refusal(text('roof flat eaves 2.7', 'canopy c up depth 1 height 2.4'))).toContain("a canopy stands out from one side, north, east, south or west, not 'up'")
    expect(refusal(text('roof flat eaves 2.7', 'canopy c south height 2.4'))).toContain("write 'canopy <id> <north|east|south|west> depth <m> height <m>")
    expect(refusal(text('roof flat eaves 2.7', 'canopy c south depth 1 height 2.4 blades 3'))).toContain("'blades' takes a whole number")
    expect(refusal(text('roof flat eaves 2.7', 'canopy c south depth 9 height 2.4'))).toContain('at most 6')
    expect(refusal(text('roof flat eaves 2.7', 'canopy c south depth 1 height 2.4', 'canopy c north depth 1 height 2.4'))).toContain("the roof part id 'c' is used twice")
    expect(refusal(text('roof flat eaves 2.7', 'canopy c south depth 1 height 2.4 colour red'))).toContain("'colour' is not a word a canopy line takes")
  })
})

describe('the read-back of a roof past its walls (LVL-29)', () => {
  it('writes the overhang and the parts as lines, and writing them again gives the same roof', () => {
    const source = text('roof gable pitch 40 eaves 2.7 overhang north 0.3 south 0.9', 'canopy entrance south depth 1.2 height 2.4 width 3 at 4,0', 'brise-soleil shade west depth 0.8 height 2.2 blades 6')
    const plan = parseFloorPlan(compileRoomsText(source).plan)
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toContain('overhang north 0.3 south 0.9')
    expect(reading.text).toContain('canopy entrance south depth 1.2 height 2.4 width 3 at 4,0')
    expect(reading.text).toContain('brise-soleil shade west depth 0.8 height 2.2 blades 6')
    const again = parseFloorPlan(compileRoomsText(reading.text).plan)
    expect(again.floors![0]!.roof).toEqual(plan.floors![0]!.roof)
  })
})
