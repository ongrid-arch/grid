/**
 * WRT-39: outside walls thicker than two of the widest one-wall gaps (masonry, a 3 m west front)
 * meet at their corners when a plan is written rooms first, as thin walls do: each end reaches
 * the centre line of the wall it meets, and where two rooms open to each other and the outside
 * turns a corner, the outside walls meet each other and not the open line. So no room's outline
 * runs onto a wall it does not list, and the check finds no gap the writer left.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { validatePlan } from '../../geometry/validate'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

/** The codes of what the check finds about rooms and walls. */
const faults = (plan: FloorPlan): string[] =>
  validatePlan(plan)
    .issues.map((i) => i.code)
    .filter((code) => code.startsWith('room/') || code.startsWith('wall/'))

const wall = (plan: FloorPlan, id: string): Wall => {
  const found = plan.walls.find((w) => w.id === id)
  if (found === undefined) throw new Error(`no wall ${id}: ${plan.walls.map((w) => w.id).join(', ')}`)
  return found
}

/** Both ends of a wall, as [x, y] pairs, lowest first. */
const ends = (w: Wall): number[][] => [w.start, w.end].map((p) => [p[0], p[1]]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)

/** An aisle open to a transept: the outside turns a corner at the end of the open line. */
const TRANSEPT = `walls outside 1.8 inside 0.3 height 10
room aisle "Aisle" worship 20 x 6 at 0,0
room transept "Transept" worship 10 x 20 east of aisle align south open
wall aisle west 3
`

describe('thick outside walls meet at their corners (WRT-39)', () => {
  it('a 1.8 m wall and a 3 m front meet at their centre lines, and the check finds nothing', () => {
    const plan = written(TRANSEPT)
    expect(faults(plan)).toEqual([])
    // The front is 3 m: its centre line is 1.5 m out; the 1.8 m walls' are 0.9 m out.
    expect(ends(wall(plan, 'ext-west-1'))).toEqual([[-1.5, -0.9], [-1.5, 6.9]])
    expect(ends(wall(plan, 'ext-south'))).toEqual([[-1.5, -0.9], [30.9, -0.9]])
    expect(ends(wall(plan, 'ext-north-1'))[0]).toEqual([-1.5, 6.9])
  })

  it('at the open inside corner the two outside walls meet each other, not the open line', () => {
    const plan = written(TRANSEPT)
    // The aisle's north wall and the transept's west wall cross at (19.1, 6.9): neither stops on
    // the open line at x = 20 or y = 6 and runs into the room beyond it.
    expect(ends(wall(plan, 'ext-north-1'))[1]).toEqual([19.1, 6.9])
    expect(ends(wall(plan, 'ext-west-2'))[0]).toEqual([19.1, 6.9])
    expect(ends(wall(plan, 'open-aisle-transept'))).toEqual([[20, 0], [20, 6]])
  })

  it('a row of rooms along a thick front gets one front wall, the walls between them reaching its centre line', () => {
    const plan = written(`walls outside 1.8 inside 0.3 height 10
room a "A" - 5 x 5 at 0,0
room b "B" - 5 x 5 north of a
room c "C" - 5 x 5 north of b
room d "D" - 5 x 5 east of a
room e "E" - 5 x 5 north of d
room f "F" - 5 x 5 north of e
wall a west 3
wall b west 3
wall c west 3
`)
    expect(faults(plan)).toEqual([])
    expect(plan.walls.filter((w) => w.id.startsWith('ext-west')).map((w) => w.id)).toEqual(['ext-west'])
    expect(ends(wall(plan, 'ext-west'))).toEqual([[-1.5, -0.9], [-1.5, 16.5]])
    expect(ends(wall(plan, 'w-y5.15'))).toEqual([[-1.5, 5.15], [11.2, 5.15]])
  })

  it('thin walls at the same open corner meet each other too, and the check finds nothing', () => {
    const plan = written(TRANSEPT.replace('outside 1.8', 'outside 0.5').replace('west 3', 'west 0.8'))
    expect(faults(plan)).toEqual([])
    expect(ends(wall(plan, 'ext-north-1'))).toEqual([[-0.4, 6.25], [19.75, 6.25]])
    expect(ends(wall(plan, 'ext-west-2'))).toEqual([[19.75, 6.25], [19.75, 20.25]])
  })
})
