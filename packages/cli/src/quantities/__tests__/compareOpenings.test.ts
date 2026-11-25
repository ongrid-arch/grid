import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { compareBuildings } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { comparePlans } from '../compare'
import { surveyPlan } from '../survey'

/**
 * WRT-29: an opening that stands somewhere else is said to have moved, and how far. Found when a
 * door moved 2.88 m along its wall and the edit's verdict and grid_compare both said every
 * opening was where it was (the opening was paired by its id and counted as in its place), and
 * when a window that moved with its wall was not named at all.
 */
const text = `plan "Two rooms"
walls outside 0.2 inside 0.1 height 2.7
room living "Living" living 6 x 4 at 0,0
room bed "Bedroom" bedroom 4 x 4 east of living

door front in living south, 0.5 from west, 0.9 wide, opens in, hinged west
door link between living and bed, 0.5 from south, 0.9 wide, opens into bed, hinged south
window w1 in living north, 1 from west, 1.2 wide
window w2 in living north, 3.5 from west, 1.2 wide
window w3 in bed north, 1 from west, 1.2 wide
window w4 in bed east, 1 from south, 1.2 wide
`

function plan(): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const opening = (p: FloorPlan, id: string): FloorPlan['openings'][number] => p.openings.find((o) => o.id === id)!

/** The plan with `id` slid `by` metres along its wall. */
function slid(p: FloorPlan, id: string, by: number): FloorPlan {
  return { ...p, openings: p.openings.map((o) => (o.id === id ? { ...o, offset: o.offset + by } : o)) }
}

/**
 * The plan with wall `id` moved by `d` and its neighbours' ends with it, as an edit moves it: an
 * opening on a neighbour that grew at its start keeps its place in the building.
 */
function wallMoved(p: FloorPlan, id: string, d: readonly [number, number]): FloorPlan {
  const wall = p.walls.find((w) => w.id === id)!
  const ends = [wall.start, wall.end]
  const at = (q: readonly [number, number]): boolean => ends.some((e) => Math.abs(e[0] - q[0]) < 1e-6 && Math.abs(e[1] - q[1]) < 1e-6)
  const move = (q: readonly [number, number]): [number, number] => (at(q) ? [q[0] + d[0], q[1] + d[1]] : [q[0], q[1]])
  const grew = new Map(p.walls.filter((w) => w.id !== id && at(w.start)).map((w) => {
    const length = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    return [w.id, ((w.end[0] - w.start[0]) * d[0] + (w.end[1] - w.start[1]) * d[1]) / length] as const
  }))
  return {
    ...p,
    walls: p.walls.map((w) => ({ ...w, start: move(w.start), end: move(w.end) })),
    openings: p.openings.map((o) => (grew.has(o.wall) ? { ...o, offset: o.offset - grew.get(o.wall)! } : o)),
  }
}

describe('an opening that moved', () => {
  const before = plan()

  it('is never the same building: a door slid 2.88 m along its wall is said to have moved, and how far', () => {
    const after = slid(before, 'front', 2.88)
    for (const inPlace of [true, false]) {
      const compared = comparePlans(surveyPlan(before), surveyPlan(after), ['the plan before', 'the plan now'], { inPlace })
      expect(compared.likeness).toBeNull()
      expect(compared.verdict).not.toContain('same building')
      expect(compared.verdict).toContain('door "front" moved 2.88 m along its wall')
      expect(compared.openingsChanged).toEqual([{ id: 'front', type: 'door', changes: ['moved 2.88 m along its wall'], moved: 2.88 }])
      expect(compared.openingsOut).toEqual([])
      expect(compared.openingsNew).toEqual([])
    }
    // The words grid_diff says it with.
    expect(compareBuildings(before, after).changes.map((c) => c.text)).toContainEqual(expect.stringContaining('moved 2.88 m along its wall'))
  })

  it('says a window that moved with its wall, and how far', () => {
    const host = opening(before, 'w4').wall
    const after = wallMoved(before, host, [0.6, 0])
    const compared = comparePlans(surveyPlan(before), surveyPlan(after), ['the plan before', 'the plan now'], { inPlace: true })
    expect(compared.verdict).toContain('window "w4" moved 0.60 m with its wall')
    expect(compared.openingsChanged).toEqual([expect.objectContaining({ id: 'w4', changes: ['moved 0.60 m with its wall'], moved: 0.6 })])
  })

  it('counts many openings that moved, with how far', () => {
    let after = before
    for (const id of ['w1', 'w2', 'w3']) after = slid(after, id, 0.3)
    const compared = comparePlans(surveyPlan(before), surveyPlan(after), ['the plan before', 'the plan now'])
    expect(compared.verdict).not.toContain('same building')
    expect(compared.verdict).toContain('3 windows moved 0.30 m along their walls')
    const mixed = slid(after, 'front', 1)
    expect(comparePlans(surveyPlan(before), surveyPlan(mixed), ['A', 'B']).verdict).toContain('4 openings moved 0.30 to 1.00 m')
  })

  it('says a door moved and widened as moved and changed', () => {
    const after = { ...slid(before, 'front', 1), openings: slid(before, 'front', 1).openings.map((o) => (o.id === 'front' ? { ...o, width: 1 } : o)) }
    const compared = comparePlans(surveyPlan(before), surveyPlan(after), ['the plan before', 'the plan now'], { inPlace: true })
    expect(compared.openingsChanged).toEqual([expect.objectContaining({ id: 'front', changes: ['width 0.90 → 1.00 m', 'moved 1.05 m along its wall'] })])
    expect(compared.verdict).toContain('door "front" moved 1.05 m along its wall')
    expect(compared.verdict).toContain('1 opening changed')
  })

  it('keeps the same plan the same building, and a plan moved on the drawing moved', () => {
    expect(comparePlans(surveyPlan(before), surveyPlan(before), ['before', 'after']).verdict).toBe('After is the same building as before: every wall, opening and room is where it was.')
    const by = (q: readonly [number, number]): [number, number] => [q[0] + 5, q[1] + 2]
    const shifted = { ...before, walls: before.walls.map((w) => ({ ...w, start: by(w.start), end: by(w.end) })) }
    const compared = comparePlans(surveyPlan(before), surveyPlan(shifted), ['before', 'after'])
    expect(compared.likeness).toBe('moved')
    expect(compared.openingsChanged).toEqual([])
  })
})
