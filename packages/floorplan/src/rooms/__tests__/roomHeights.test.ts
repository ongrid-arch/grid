/**
 * LVL-26: a room's height raises the walls it bounds, or stops them, and every other wall keeps
 * the storey's; `walltype ... height` and a room line's `walls ... height` set the height of the
 * walls they give; a room that would rise into a room of a floor above is refused with both lines.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText, type RoomsResult } from '../index'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { indexPlan } from '../../geometry/plan'

const WALLS = 'walls outside 0.3 inside 0.1 height 3.5'

function write(lines: readonly string[]): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText([WALLS, ...lines].join('\n'))
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

/** The heights of the walls whose rooms are exactly these, sorted. */
function heightsOf(plan: FloorPlan, ...rooms: string[]): number[] {
  const index = indexPlan(plan)
  const key = [...rooms].sort().join()
  const of = (wall: Wall): string => (index.roomsByWall.get(wall.id) ?? []).map((r) => r.id).sort().join()
  return plan.walls.filter((w) => w.virtual !== true && of(w) === key).map((w) => w.height).sort((a, b) => a - b)
}

/** Read back as rooms text, and that text written again gives the same walls and rooms. */
function readsBack(plan: FloorPlan): void {
  const reading = readRoomsText(plan)
  expect(reading.rawFloors).toEqual([])
  const again = parseFloorPlan(compileRoomsText(reading.text).plan)
  const walls = (p: FloorPlan): unknown => p.walls.map((w) => [w.start, w.end, w.thickness, w.height, w.kind]).sort()
  expect(walls(again)).toEqual(walls(plan))
  expect(again.rooms.map((r) => r.height)).toEqual(plan.rooms.map((r) => r.height))
}

describe("a room's height and its walls (LVL-26)", () => {
  it('raises the walls a tall room bounds, the wall it shares with a lower room too, and no other', () => {
    const { plan } = write(['room foyer "Foyer" - 8 x 6 at 0,0', 'room cinema "Cinema" - 12 x 6 east of foyer height 9', 'room cafe "Cafe" - 8 x 4 north of foyer'])
    expect(new Set(heightsOf(plan, 'cinema'))).toEqual(new Set([9]))
    expect(heightsOf(plan, 'cinema', 'foyer')).toEqual([9])
    expect(new Set(heightsOf(plan, 'foyer'))).toEqual(new Set([3.5]))
    expect(new Set(heightsOf(plan, 'cafe', 'foyer'))).toEqual(new Set([3.5]))
    expect(plan.rooms.find((r) => r.id === 'cinema')?.height).toBe(9)
    readsBack(plan)
  })

  it('stops the walls only a lower room bounds at its height, from its own floor', () => {
    const { plan } = write(['room store "Store" - 6 x 4 at 0,0', 'room duct "Duct" - 1 x 4 east of store height 0.9', 'room deck "Deck" - 3 x 3 north of store floor 0.6 height 1.1'])
    expect(new Set(heightsOf(plan, 'duct'))).toEqual(new Set([0.9]))
    expect(heightsOf(plan, 'duct', 'store')).toEqual([3.5])
    expect(new Set(heightsOf(plan, 'deck'))).toEqual(new Set([1.7]))
    readsBack(plan)
  })

  it('leaves a text with no room height as it was', () => {
    const lines = ['room a "A" office 4 x 4 at 0,0', 'room b "B" office 4 x 4 east of a']
    const { plan } = write(lines)
    expect(new Set(plan.walls.map((w) => w.height))).toEqual(new Set([3.5]))
  })

  it("keeps a wall line's own height over the room's", () => {
    const { plan } = write(['room nave "Nave" - 10 x 30 at 0,0 height 28', 'wall nave west height 12'])
    expect(heightsOf(plan, 'nave')).toEqual([12, 28, 28, 28])
  })

  it("gives the walls a walltype's height, and the walls a room adds its walls' height", () => {
    const typed = write(['walltype 0.05 partition height 2.5', 'room hall "Hall" - 20 x 10 at 0,0 height 6', 'room b1 "Booth 1" - 3 x 3 north of hall align west walls 0.05'])
    expect(heightsOf(typed.plan, 'b1', 'hall')).toEqual([2.5])
    expect(new Set(heightsOf(typed.plan, 'b1'))).toEqual(new Set([3.5]))
    const own = write(['room hall "Hall" - 20 x 10 at 0,0 height 6', 'room b1 "Booth 1" - 3 x 3 north of hall align west walls 0.05 partition height 2.5'])
    expect(heightsOf(own.plan, 'b1', 'hall')).toEqual([2.5])
    expect(own.plan.rooms.find((r) => r.id === 'b1')?.height).toBeUndefined()
    expect(own.plan.walls.find((w) => w.thickness === 0.05)?.kind).toBe('partition')
  })

  it('refuses a malformed walltype line with the words it takes', () => {
    const result = compileRoomsText(`${WALLS}\nwalltype 0.05 partition height\nroom a "A" - 3 x 3 at 0,0`)
    expect(result.problems[0]?.message).toContain('[height <h>]')
  })

  it('refuses a room that would rise into a room of the floor above, naming both lines', () => {
    const text = [WALLS, 'floor g "Ground" level 0', 'room hall "Hall" - 10 x 8 at 0,0 height 7', 'room side "Side" - 6 x 8 east of hall', 'floor f1 "First" level 1', 'room office "Office" - 16 x 8 at 0,0'].join('\n')
    const result = compileRoomsText(text)
    expect(result.plan).toBeNull()
    const problem = result.problems.find((p) => p.code === 'rooms/height-into-floor')
    expect(problem?.line).toBe(3)
    expect(problem?.message).toContain("(line 6)")
    expect(problem?.message).toContain("floor 'f1'")
  })

  it('lets a tall room rise past the floor above where nothing of it stands over the room', () => {
    const text = [WALLS, 'floor g "Ground" level 0', 'room hall "Hall" - 10 x 8 at 0,0 height 7', 'room side "Side" - 6 x 8 east of hall', 'floor f1 "First" level 1', 'room office "Office" - 6 x 8 at 10.1,0'].join('\n')
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    expect(new Set(heightsOf(plan, 'g-hall').length > 0 ? heightsOf(plan, 'g-hall') : heightsOf(plan, 'hall'))).toEqual(new Set([7]))
  })
})
