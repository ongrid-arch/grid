/**
 * LVL-23: building lines in rooms text. A block names the floor lines under it, a `floors` line
 * names floors written anywhere; each building counts its levels from its own ground floor and
 * may state its pad. The read-back writes the buildings, and writing it again keeps them.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { parseFloorPlan } from '../../types/floorplan'
import { floorElevations } from '../../geometry/elevations'

const floor = (id: string, x: number, extra = ''): string => `floor ${id} "${id}"${extra}
room r "Room" living 6 x 5 at ${x},0
door d in r south, centred, 0.9 wide
`

const compiled = (text: string) => compileRoomsText(`plan "Site"\n${text}`)
const problems = (text: string): string[] => compiled(text).problems.map((p) => `${p.code} ${p.message}`)

describe('LVL-23 building blocks', () => {
  it('takes the floor lines under a building line as its own, up to the next building line or end', () => {
    const made = compiled(`building row-a "Row A" pad 2.5ft\n${floor('ag', 0)}${floor('a1', 0)}building row-b "Row B"\n${floor('bg', 20)}end\n${floor('shed', 40)}`)
    expect(made.problems).toEqual([])
    expect(made.plan!.buildings).toEqual([
      { id: 'row-a', name: 'Row A', floors: ['ag', 'a1'], pad: expect.closeTo(0.762, 9) },
      { id: 'row-b', name: 'Row B', floors: ['bg'] },
    ])
  })

  it('counts each building\'s levels from its own ground floor, and stacks them from its pad', () => {
    const made = compiled(`building a pad 1.5\n${floor('ag', 0)}${floor('a1', 0)}building b\n${floor('bg', 20)}${floor('b1', 20)}`)
    expect(made.plan!.floors!.map((f) => [f.id, f.level])).toEqual([
      ['ag', 0],
      ['a1', 1],
      ['bg', 0],
      ['b1', 1],
    ])
    const levels = floorElevations(parseFloorPlan(made.plan)).floors
    expect(levels.get('ag')!.floorLevel).toBeCloseTo(1.5, 9)
    expect(levels.get('bg')!.floorLevel).toBeCloseTo(0, 9)
  })

  it('takes the floors form, naming floors written anywhere', () => {
    const made = compiled(`${floor('ag', 0)}${floor('bg', 20, ' level 0')}building a "A" floors ag\nbuilding b floors bg`)
    expect(made.problems).toEqual([])
    expect(made.plan!.buildings).toEqual([
      { id: 'a', name: 'A', floors: ['ag'] },
      { id: 'b', floors: ['bg'] },
    ])
  })

  it('keeps building <kind> as the kind of building the plan is', () => {
    const made = compiled(`building home\n${floor('g', 0)}`)
    expect(made.problems).toEqual([])
    expect(made.plan!.building).toBe('home')
    expect(made.plan!.buildings).toBeUndefined()
  })
})

describe('LVL-23 building lines refused', () => {
  it('refuses a floor in two buildings', () => {
    expect(problems(`building a\n${floor('ag', 0)}building b floors ag`)).toEqual([
      "rooms/syntax Line 6: floor 'ag' is in building 'a' already (line 2), so it cannot be in 'b' too: a floor is in one building at most.",
    ])
  })

  it('refuses a floor the text does not write', () => {
    expect(problems(`${floor('ag', 0)}building a floors ag zz`)).toEqual([
      "rooms/unknown-floor Line 5: building 'a' names floor 'zz', which the text does not write. The text's floors: ag.",
    ])
  })

  it('refuses a block with no floor', () => {
    expect(problems(`${floor('ag', 0)}building a\nend`)).toEqual([
      "rooms/syntax Line 5: building 'a' holds no floor: write its floor lines under it, or name them: building a floors <floor> ...",
    ])
  })

  it('takes a bare word near a kind for a misspelt kind', () => {
    expect(problems(`building offce\n${floor('ag', 0)}`)[0]).toMatch(/did you mean 'building office'/)
  })

  it('refuses a word it does not take, and an end with nothing open', () => {
    expect(problems(`building a high 3\n${floor('ag', 0)}`)[0]).toMatch(/'high' is not a word a building line takes/)
    expect(problems(`${floor('ag', 0)}end`)[0]).toMatch(/'end' closes a building line or a unit/)
  })
})

describe('LVL-23 the read-back', () => {
  it('writes each building as a floors line after the floors, and writing it again keeps them', () => {
    const made = compiled(`building a "Row A" pad 0.76\n${floor('ag', 0)}${floor('a1', 0)}building b\n${floor('bg', 20)}`)
    expect(made.problems).toEqual([])
    const plan = parseFloorPlan(made.plan)
    const text = readRoomsText(plan).text
    expect(text).toMatch(/\nbuilding a "Row A" pad 0\.76 floors ag a1\nbuilding b floors bg\n$/)
    const again = compileRoomsText(text)
    expect(again.problems).toEqual([])
    expect(again.plan!.buildings).toEqual(made.plan!.buildings)
    // The read-back writes the floors by level; each keeps its own.
    const levels = (floors: readonly { id: string; level: number }[]) => Object.fromEntries(floors.map((f) => [f.id, f.level]))
    expect(levels(again.plan!.floors!)).toEqual(levels(made.plan!.floors!))
    const stacked = floorElevations(parseFloorPlan(again.plan)).floors
    expect(stacked.get('ag')!.floorLevel).toBeCloseTo(0.76, 9)
  })
})
