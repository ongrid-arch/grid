/**
 * CNT-59: what another tool calls a part (`identity`) stays with it when the plan is written again
 * from rooms text, by id, as its facts do; and a wall the text now cuts in pieces gives it to its
 * longest piece, so its GlobalId is on one wall and never on two.
 */
import { describe, expect, it } from 'vitest'
import { carryFacts, compileRoomsText, readRoomsText } from '../index'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'

const HEAD = ['walls outside 0.3 inside 0.1 height 2.7']
const GUID = '2O2Fr$t4X7Zf8NOew3FLOH'

const written = (lines: readonly string[]): FloorPlan => {
  const result = compileRoomsText([...HEAD, ...lines].join('\n'))
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}

const length = (w: Wall): number => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
/** The wall along y = `y`, the longest first. */
const along = (plan: FloorPlan, y: number): Wall[] => plan.walls.filter((w) => w.arc === undefined && Math.abs(w.start[1] - y) < 0.01 && Math.abs(w.end[1] - y) < 0.01).sort((a, b) => length(b) - length(a))

describe('an identity through rooms text (CNT-59)', () => {
  const one = ['room living "Living" living 8 x 5 at 0,0']
  const before = written(one)
  const south = along(before, before.walls.reduce((low, w) => Math.min(low, w.start[1], w.end[1]), Infinity))[0]!
  const named: FloorPlan = {
    ...before,
    walls: before.walls.map((w) => (w.id === south.id ? { ...w, identity: { guid: GUID, name: 'Basic Wall', tag: '348112' } } : w)),
    rooms: before.rooms.map((r) => ({ ...r, identity: { name: '0.01' } })),
  }

  it('is kept by id when the same text is written again, and is no difference in the read-back', () => {
    const { plan, lost } = carryFacts(named, written(one))
    expect(lost).toEqual([])
    expect(plan.walls.find((w) => w.id === south.id)!.identity).toEqual({ guid: GUID, name: 'Basic Wall', tag: '348112' })
    expect(plan.rooms[0]!.identity).toEqual({ name: '0.01' })
    const read = readRoomsText(plan)
    expect(read.text).not.toContain('raw')
  })

  it('goes to the longest piece of a wall the text now cuts, and to no other wall', () => {
    // A porch against the south side: the text writes the south wall as the stretch between the
    // two rooms (an inside wall, off the old line) and what is left outside, under new ids.
    const now = written([...one, 'room porch "Porch" corridor 3 x 2 south of living'])
    expect(now.walls.some((w) => w.id === south.id)).toBe(false)
    const { plan, lost } = carryFacts(named, now)
    const holding = plan.walls.filter((w) => w.identity?.guid === GUID)
    expect(holding).toHaveLength(1)
    expect(holding[0]!.id).toBe(along(plan, south.start[1])[0]!.id)
    expect(lost).not.toContain(`wall ${JSON.stringify(south.id)}`)
  })
})
