/** VEW-45: a door written `no-swing` is said as the drawing and the check treat it. */
import { describe, expect, it } from 'vitest'
import { roomsAnswer } from '../answer'
import { compileRoomsText } from '../compile'

const TEXT = `plan "Pair"
walls outside 0.3 inside 0.1 height 2.6

room bed  "Bedroom"  bedroom  3.0 x 3.0  at 0.15,0.15
room bath "Bathroom" bathroom 3.0 x 2.0  north of bed

door d1 between bed and bath, 1.0 from west, 0.8 wide, no-swing
`

describe('a door written no-swing', () => {
  it('is said as no swing stated, with both ways it is drawn, as the check says it', () => {
    const result = compileRoomsText(TEXT)
    expect(result.problems).toEqual([])
    const all = JSON.stringify(roomsAnswer(result))
    expect(all).not.toContain('not decided')
    expect(all).toContain('no swing stated')
    expect(all).toContain('dashed line')
    expect(all).toContain('plain gap')
  })
})
