/**
 * WRT-67: a wall Grid makes from the gap two rooms leave, thicker than the wall the walls line
 * gives them, is said with the floor it takes and the size that closes the gap.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, type RoomsProblem } from '../compile'

const WALLS = 'display m\nwalls outside 0.3 inside 0.1 height 2.6\n'

function fromGap(text: string): RoomsProblem[] {
  const result = compileRoomsText(WALLS + text)
  expect(result.problems).toEqual([])
  return result.warnings.filter((w) => w.code === 'rooms/wall-from-gap')
}

describe('a wall from a gap thicker than the walls line', () => {
  it('says how much thicker, the floor in it and the sizes that close the gap', () => {
    const said = fromGap('room living "Living room" living 4.6 x 4 at 0,0\nroom hall "Hall" corridor 1.9 x 4 at 5.1,0\n')
    expect(said).toHaveLength(1)
    const message = said[0]!.message
    expect(message).toContain("between 'living' (line 3) and 'hall' (line 4) is 0.50 m thick")
    expect(message).toContain('0.40 m thicker than the 0.10 m wall between them, along 4.00 m, so 1.60 m² of floor is in the wall')
    expect(message).toContain("make one of them 0.40 m larger toward the other: '2.3 x 4' for 'hall', or '5 x 4' for 'living'")
    expect(message).toContain("'walls 0.50'")
  })

  it('counts only the stretch the two rooms share', () => {
    // An L-shaped hall meets the living room along 2 m of its 3 m west side.
    const said = fromGap('room living "Living room" living 4 x 3 at 0,0\nroom hall "Hall" corridor polygon 4.5,0 6,0 6,3 5.5,3 5.5,2 4.5,2\n')
    expect(said).toHaveLength(1)
    expect(said[0]!.message).toContain('along 2.00 m, so 0.80 m² of floor')
  })

  it('says how far to move a room that has no plain size', () => {
    const said = fromGap('room living "Living room" living polygon 0,0 4,0 4,3 0,3\nroom hall "Hall" corridor polygon 4.5,0 6,0 6,3 4.5,3\n')
    expect(said).toHaveLength(1)
    expect(said[0]!.message).toContain('move one of them 0.40 m toward the other')
  })

  it('says a wall between two inside rooms as thick as the outside walls', () => {
    const said = fromGap('room kitchen "Kitchen" kitchen 4 x 4 at 0,0\nroom wc "WC" toilet 1.5 x 1.5 at 4.3,0\n')
    expect(said).toHaveLength(1)
    expect(said[0]!.message).toContain('is 0.30 m thick')
    expect(said[0]!.message).toContain('0.20 m thicker than the 0.10 m wall between them, along 1.50 m, so 0.30 m² of floor is in the wall')
  })

  it('says nothing of an inside wall whose thickness a line states', () => {
    expect(fromGap('room kitchen "Kitchen" kitchen 4 x 4 at 0,0\nroom wc "WC" toilet 1.5 x 1.5 at 4.3,0 walls 0.3\n')).toEqual([])
    expect(fromGap('wall between kitchen and wc 0.3\nroom kitchen "Kitchen" kitchen 4 x 4 at 0,0\nroom wc "WC" toilet 1.5 x 1.5 at 4.3,0\n')).toEqual([])
  })

  it('says a wall thinner than the walls line with no floor figure', () => {
    const said = fromGap('room a "A" - 4 x 4 at 0,0\nroom b "B" - 4 x 4 at 4.05,0\n')
    expect(said).toHaveLength(1)
    expect(said[0]!.message).not.toContain('m² of floor')
    expect(said[0]!.message).toContain('if not, move a room.')
  })
})
