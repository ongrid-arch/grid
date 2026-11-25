import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { describeText } from '../card'
import { planFacts } from '../facts'
import { surveyPlan } from '../../quantities/survey'
import { planAreas } from '../../quantities/areas'

/**
 * ARE-34: in a plan in feet with outside walls of 6 in and inside walls of 4.5 in, a room beside a
 * deeper one has a side that runs along an inside wall and then an outside wall, whose faces the
 * file puts a twentieth of a millimetre apart. Every room is still a rectangle with its size.
 */
const FEET = `plan "Ranch"
display ft-in numbers ft
walls outside 6in inside 4.5in height 9ft
room living "Living" living 18 x 14 at 0,0
room kitchen "Kitchen" kitchen 12 x 20 east of living
room bed "Bed" bedroom 13 x 11 north of living
`

const plan = parseFloorPlan(compileRoomsText(FEET).plan)

describe('rooms on inside and outside walls keep their W x D (ARE-34)', () => {
  it('are written WxD, not ~WxD, in the description for an agent', () => {
    const text = describeText(planFacts(plan), 'short', 'agent')
    const rooms = text.split('\n').filter((line) => /^(living|kitchen|bed) /.test(line))
    expect(rooms).toHaveLength(3)
    for (const line of rooms) expect(line).not.toMatch(/ ~\d/)
    expect(text).toMatch(/^living "Living" living 5\.49x4\.27 /m)
    expect(text).toMatch(/^kitchen "Kitchen" kitchen 3\.66x6\.1 /m)
  })

  it('each have their size in the areas', () => {
    const rooms = planAreas(surveyPlan(plan)).floors.flatMap((floor) => floor.rooms)
    expect(rooms).toHaveLength(3)
    for (const room of rooms) expect(room.size, room.id).not.toBeNull()
    const living = rooms.find((room) => room.id === 'living')!
    expect(living.size![0]).toBeCloseTo(5.4864, 3)
    expect(living.size![1]).toBeCloseTo(4.2672, 3)
  })
})
