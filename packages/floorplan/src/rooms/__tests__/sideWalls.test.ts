/**
 * WRT-51: a door, window or opening line written `in <room> <side>`, where more than one of the
 * room's sides faces that way, is refused with each side named, or, in a unit, taken onto the one
 * side that looks outside the unit; and a refusal that tells the writer to say a side offers the
 * line written in full, tried first.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'

const walls = 'walls outside 0.3 inside 0.1 height 2.7\n'
// A living room with a WC cut out of its north-east corner: two of its sides face east and two face north.
const house = (door: string): string => `${walls}room living "Living" living 5 x 4 at 0,0\nroom wc "WC" toilet 1.5 x 1.5 inside living corner ne\n${door}\n`

describe('a side with several walls', () => {
  it('refuses a door on a bare side that more than one side faces, naming each with what lies beyond it', () => {
    const result = compileRoomsText(house('door d1 in living east, centred, 0.8 wide'))
    expect(result.plan).toBeNull()
    expect(result.problems).toHaveLength(1)
    const [problem] = result.problems
    expect(problem!.code).toBe('rooms/no-side')
    expect(problem!.line).toBe(4)
    expect(problem!.message).toContain("room 'living' has 2 sides facing east")
    expect(problem!.message).toContain("'east.1', 1.60 m, the wall to 'wc'")
    expect(problem!.message).toContain("'east.2', 2.40 m, the wall to the outside")
    expect(problem!.message).toContain("To place it, write line 4 as 'door d1 in living east.1, centred, 0.8 wide' for the wall to 'wc', or 'door d1 in living east.2, centred, 0.8 wide' for the wall to the outside.")
    expect(problem!.fixes).toEqual([
      { line: 4, text: 'door d1 in living east.1, centred, 0.8 wide' },
      { line: 4, text: 'door d1 in living east.2, centred, 0.8 wide' },
    ])
  })

  it('offers lines that write, each in the wall it names', () => {
    const problem = compileRoomsText(house('door d1 in living east, centred, 0.8 wide')).problems[0]!
    const joins = problem.fixes!.map((fix) => {
      const written = compileRoomsText(house(fix.text))
      expect(written.problems).toEqual([])
      return written.openings[0]!.split(';')[0]
    })
    expect(joins[0]).toContain('joins living and wc')
    expect(joins[1]).toContain('joins living and the outside')
  })

  it("refuses a side's number that names none of them, with the ones there are", () => {
    const result = compileRoomsText(house('window w1 in living east.3, centred, 1.2 wide'))
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/no-side'])
    expect(result.problems[0]!.message).toContain("has 2 sides facing east, and 'east.3' is none of them")
    expect(result.problems[0]!.fixes?.map((f) => f.text)).toEqual(['window w1 in living east.1, centred, 1.2 wide', 'window w1 in living east.2, centred, 1.2 wide'])
  })

  it('names a side by its exact word when the room has no side facing the one asked for', () => {
    const result = compileRoomsText(house('door d1 in wc ne, centred, 0.8 wide'))
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/no-side'])
    expect(result.problems[0]!.message).toContain("room 'wc' has no side facing ne")
  })

  it('offers the full line with the side for two rooms that share more than one wall', () => {
    const result = compileRoomsText(house('door d1 between living and wc, centred, 0.7 wide'))
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/two-shared-walls'])
    const problem = result.problems[0]!
    expect(problem.message).toContain("living's north.2 side (1.50 m); living's east.1 side (1.50 m)")
    expect(problem.fixes?.map((f) => f.text)).toEqual(['door d1 in living north.2, centred, 0.7 wide', 'door d1 in living east.1, centred, 0.7 wide'])
    for (const fix of problem.fixes!) {
      const written = compileRoomsText(house(fix.text))
      expect(written.problems).toEqual([])
      expect(written.openings[0]).toContain('joins living and wc')
    }
  })

  it('places a door on a named side as before', () => {
    const result = compileRoomsText(house('door d1 in living east.2, centred, 0.8 wide'))
    expect(result.problems).toEqual([])
    expect(result.openings[0]).toContain('joins living and the outside')
  })
})

describe('a side with several walls in a unit', () => {
  // A cabin with its bath in the corner on the corridor side: the bath partition is the longer of its two north sides.
  const deck = (door: string, after = ''): string =>
    `${walls}unit cabin\nroom cabin "Cabin" bedroom 3 x 4 at 0,0\nroom bath "Bath" bathroom 2 x 1.5 inside cabin corner nw\n${door}\nend\nrepeat cabin 4 east as 301 at 0,0\nroom corr "Corridor" corridor 12.3 x 1.5 north of cabin-301 align west\n${after}`

  it("takes the one side onto something outside the unit: every cabin's door is in the corridor wall", () => {
    const result = compileRoomsText(deck('door d in cabin north, centred, 0.7 wide'))
    expect(result.problems).toEqual([])
    expect(result.openings).toHaveLength(4)
    for (const line of result.openings) expect(line).toMatch(/joins cabin-30\d and corr;/)
    const said = result.guesses.filter((g) => g.includes('sides facing north'))
    expect(said).toHaveLength(4)
    expect(said[0]).toBe("Line 5: room 'cabin-301' has 2 sides facing north; 'north.2', the wall to 'corr', was used, the only one onto something outside unit '301'. Write 'north.1' for the wall to 'bath-301' to choose another.")
  })

  it('keeps a side the unit names by its number', () => {
    const result = compileRoomsText(deck('door d in cabin north.1, centred, 0.7 wide'))
    expect(result.problems).toEqual([])
    for (const line of result.openings) expect(line).toMatch(/joins cabin-30\d and bath-30\d;/)
  })

  it('refuses when more than one side looks outside the unit, and offers no line a unit writes once for all', () => {
    // A stepped cabin placed alone: both of its north sides are outside walls.
    const text = `${walls}unit cabin\nroom cabin "Cabin" bedroom polygon 0,0 4,0 4,3 2,3 2,4 0,4\ndoor d in cabin north, centred, 0.7 wide\nend\nplace cabin as 301 at 0,0\n`
    const result = compileRoomsText(text)
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/no-side'])
    expect(result.problems[0]!.message).toContain("room 'cabin-301' has 2 sides facing north")
    expect(result.problems[0]!.fixes).toBeUndefined()
  })
})
