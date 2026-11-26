/**
 * WRT-76: outdoor space is open where no room faces it; `edge open|railing <h>|wall [<h>]`,
 * `wall <room> <side> virtual|railing` and `open <side>` set its edges, and every room's; the
 * answer says what `walls` and `height` on a room line set; and each reads back as rooms text.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText, type RoomsResult } from '../index'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { indexPlan } from '../../geometry/plan'
import { tryRoomPolygon } from '../../geometry/room'
import { validatePlan } from '../../geometry/validate'

const WALLS = 'walls outside 0.3 inside 0.1 height 2.7'

function write(lines: readonly string[]): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText([WALLS, ...lines].join('\n'))
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

/** The walls round one room and no other, as open, railing or wall with thickness and height. */
function edgesOf(plan: FloorPlan, room: string): string[] {
  const index = indexPlan(plan)
  const own = (wall: Wall): boolean => (index.roomsByWall.get(wall.id) ?? []).map((r) => r.id).join() === room
  return plan.walls
    .filter(own)
    .map((wall) => (wall.virtual === true ? 'open' : `${wall.railing === true ? 'railing' : 'wall'} ${wall.thickness} ${wall.height}`))
    .sort()
}

/** Read back as rooms text, and that text written again gives the same walls. */
function readsBack(plan: FloorPlan): string {
  const reading = readRoomsText(plan)
  expect(reading.rawFloors).toEqual([])
  const again = parseFloorPlan(compileRoomsText(reading.text).plan)
  const walls = (p: FloorPlan): unknown => p.walls.map((w) => [w.id, w.start, w.end, w.thickness, w.height, w.kind, w.virtual === true, w.railing === true]).sort()
  expect(walls(again)).toEqual(walls(plan))
  return reading.text
}

const codes = (result: RoomsResult): string[] => result.warnings.map((w) => w.code)

describe('outdoor space is open where no room faces it (WRT-76)', () => {
  it('draws a terrace beside the house with open edges and the house wall between', () => {
    const { plan } = write(['room living "Living room" living 5 x 4 at 0,0', 'room terrace "Terrace" - 5 x 3 north of living outdoor terrace'])
    expect(edgesOf(plan, 'terrace')).toEqual(['open', 'open', 'open'])
    const shared = plan.walls.filter((w) => w.virtual !== true && w.kind === 'exterior' && w.start[1] === w.end[1] && Math.abs(w.start[1] - 4.15) < 1e-9)
    expect(shared.map((w) => w.thickness)).toEqual([0.3])
    expect(tryRoomPolygon(plan.rooms[1]!, indexPlan(plan))).not.toBeNull()
    expect(validatePlan(plan).issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(readsBack(plan)).not.toContain('wall terrace')
  })

  it('keeps a stated wide wall between the house and terrace', () => {
    const { plan } = write([
      'wall between house and terrace north 0.9',
      'room house "House" living 6 x 5 at 0,0',
      'room terrace "Terrace" - 6 x 4 north of house outdoor terrace',
    ])
    const shared = indexPlan(plan).roomsByWall
    expect(plan.walls.find((wall) => shared.get(wall.id)?.length === 2)?.thickness).toBe(0.9)
    expect(edgesOf(plan, 'terrace')).toEqual(['open', 'open', 'open'])
    readsBack(plan)
  })

  it('opens two outdoor spaces that touch to each other, with no word on either', () => {
    const { plan } = write(['room lane1 "Lane 1" - 30 x 3 at 0,0 outdoor other', 'room lane2 "Lane 2" - 30 x 3 at 0,3 outdoor other', 'room lane3 "Lane 3" - 30 x 3 at 0,6 outdoor other'])
    expect(plan.walls.every((w) => w.virtual === true)).toBe(true)
    readsBack(plan)
  })

  it.each(['0.45', '1'])('keeps a %s m gap beside outdoor space', (gap) => {
    const { result, plan } = write(['room house "House" living 6 x 5 at 0,0', `room yard "Yard" - 6 x 4 at 0,-(4+${gap}) outdoor garden`])
    expect(result.problems).toEqual([])
    expect(edgesOf(plan, 'yard')).toEqual(['open', 'open', 'open', 'open'])
    expect(edgesOf(plan, 'house').every((e) => e === 'wall 0.3 2.7')).toBe(true)
    readsBack(plan)
  })
})

describe("a room line's edge words (WRT-76)", () => {
  it("gives a balcony railings of the height written, as thick as the floor's inside walls", () => {
    const { plan } = write(['room living "Living room" living 5 x 4 at 0,0', 'room bal "Balcony" - 5 x 1.5 south of living outdoor balcony edge railing 1.1'])
    expect(edgesOf(plan, 'bal')).toEqual(['railing 0.1 1.1', 'railing 0.1 1.1', 'railing 0.1 1.1'])
    expect(readsBack(plan)).toMatch(/wall bal south(?: 0.1)? exterior railing/)
  })

  it("gives a roof terrace a parapet of its own walls' thickness and the height written", () => {
    const { result, plan } = write(['room roof "Roof terrace" - 8 x 6 at 0,0 outdoor terrace walls 0.15 edge wall 0.45'])
    expect(edgesOf(plan, 'roof')).toEqual(['wall 0.15 0.45', 'wall 0.15 0.45', 'wall 0.15 0.45', 'wall 0.15 0.45'])
    expect(codes(result)).not.toContain('rooms/walls-unused')
    readsBack(plan)
  })

  it("gives an indoor room's outside walls its own walls with 'edge wall', and says when its walls set none", () => {
    const bare = write(['room house "House" living 8 x 6 at 0,0', 'room summer "Summerhouse" - 3 x 3 at 12,0 walls 0.1'])
    expect(edgesOf(bare.plan, 'summer')).toEqual(['wall 0.3 2.7', 'wall 0.3 2.7', 'wall 0.3 2.7', 'wall 0.3 2.7'])
    const note = bare.result.warnings.find((w) => w.code === 'rooms/walls-unused')
    expect(note?.message).toContain("Write 'edge wall' on its line")
    const edged = write(['room house "House" living 8 x 6 at 0,0', 'room summer "Summerhouse" - 3 x 3 at 12,0 walls 0.1 edge wall'])
    expect(edgesOf(edged.plan, 'summer')).toEqual(['wall 0.1 2.7', 'wall 0.1 2.7', 'wall 0.1 2.7', 'wall 0.1 2.7'])
    expect(codes(edged.result)).not.toContain('rooms/walls-unused')
    readsBack(edged.plan)
  })

  it("leaves a car park deck open, with an edge barrier where 'edge railing' says", () => {
    const { plan } = write(['room deck "Deck level 1" parking 30 x 16 at 0,0 edge railing 1.2'])
    expect(edgesOf(plan, 'deck')).toEqual(['railing 0.1 1.2', 'railing 0.1 1.2', 'railing 0.1 1.2', 'railing 0.1 1.2'])
    readsBack(plan)
  })

  it("says that an outdoor space's walls and low height set none of its edges", () => {
    const { result, plan } = write(['room living "Living room" living 5 x 4 at 0,0', 'room terrace "Terrace" - 5 x 3 north of living outdoor terrace walls 0.1 height 0.45'])
    expect(codes(result)).toContain('rooms/walls-unused')
    expect(codes(result)).toContain('rooms/outdoor-height')
    expect(plan.walls.filter((w) => w.virtual !== true).every((w) => w.thickness === 0.3)).toBe(true)
    const heightOnly = write(['room living "Living room" living 5 x 4 at 0,0', 'room terrace "Terrace" - 5 x 3 north of living outdoor terrace height 0.45'])
    expect(heightOnly.result.warnings.find((w) => w.code === 'rooms/outdoor-height')?.message).toContain("'edge wall 0.45'")
  })

  it('refuses an edge word it does not know, with the words it takes', () => {
    const result = compileRoomsText(`${WALLS}\nroom t "T" - 4 x 4 at 0,0 outdoor terrace edge fence`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]!.message).toContain("'edge railing <h>'")
  })
})

describe('one side open, a railing or a wall (WRT-76)', () => {
  it("opens an indoor room's outside side with 'wall <room> <side> virtual', and reads it back", () => {
    const { plan } = write(['room carport "Carport" parking 3 x 6 at 0,0', 'wall carport south virtual'])
    expect(edgesOf(plan, 'carport')).toEqual(['open', 'wall 0.3 2.7', 'wall 0.3 2.7', 'wall 0.3 2.7'])
    expect(readsBack(plan)).toContain('wall carport south virtual')
  })

  it("walls one side of outdoor space with a wall line, and makes another a railing", () => {
    const { plan } = write(['room bal "Balcony" - 4 x 2 at 0,0 outdoor balcony', 'wall bal west 0.2', 'wall bal east railing height 1'])
    expect(edgesOf(plan, 'bal')).toEqual(['open', 'open', 'railing 0.1 1', 'wall 0.2 2.7'])
    readsBack(plan)
  })

  it("opens a room's side onto whatever is there with 'open <side>', a unit's rooms too", () => {
    const { plan } = write([
      'unit shops',
      'room a "Shop A" retail 5 x 8 at 0,0',
      'room b "Shop B" retail 5 x 8 east of a',
      'end',
      'place shops as s at 0,0',
      'room street "Pavement terrace" - 10.1 x 3 south of s outdoor terrace open north',
    ])
    const index = indexPlan(plan)
    const between = plan.walls.filter((w) => (index.roomsByWall.get(w.id) ?? []).some((r) => r.id === 'street') && (index.roomsByWall.get(w.id) ?? []).length > 1)
    expect(new Set(between.flatMap((wall) => (index.roomsByWall.get(wall.id) ?? []).map((r) => r.id)))).toEqual(new Set(['a-s', 'b-s', 'street']))
    expect(between.every((w) => w.virtual === true)).toBe(true)
    readsBack(plan)
  })

  it('opens a placed unit boundary to a room and leaves internal walls in place', () => {
    const { plan } = write([
      'unit shop',
      'room front "Front" retail 4 x 3 at 0,0',
      'room back "Back" storage 4 x 2 north of front',
      'end',
      'room street "Pavement" - 4 x 2 at 0,0 outdoor terrace',
      'place shop as s north of street open south',
    ])
    const index = indexPlan(plan)
    const shared = (a: string, b: string): Wall | undefined => plan.walls.find((wall) => {
      const ids = (index.roomsByWall.get(wall.id) ?? []).map((room) => room.id)
      return ids.includes(a) && ids.includes(b)
    })
    expect(shared('street', 'front-s')?.virtual).toBe(true)
    expect(shared('front-s', 'back-s')?.virtual).not.toBe(true)
    readsBack(plan)
  })

  it("opens a unit's side when nothing is there and mirrors its open side", () => {
    const { plan } = write(['unit bay open south', 'room load "Loading bay" storage 4 x 6 at 0,0', 'end', 'place bay as b1 at 0,0', 'place bay as b2 at 0,20 mirror north-south'])
    const open = (room: string): number => {
      const index = indexPlan(plan)
      return plan.walls.filter((w) => w.virtual === true && (index.roomsByWall.get(w.id) ?? []).some((r) => r.id === room)).map((w) => (w.start[1] + w.end[1]) / 2)[0]!
    }
    expect(open('load-b1')).toBeCloseTo(0, 6)
    expect(open('load-b2')).toBeCloseTo(20, 6)
  })
})

describe('outdoor words in the use slot (WRT-76)', () => {
  it.each([
    ['patio', '- 5 x 3 north of living outdoor terrace'],
    ['deck', '- 5 x 3 north of living outdoor terrace'],
    ['veranda', '- 5 x 3 north of living outdoor porch'],
    ['walkway', 'corridor 5 x 3 north of living outdoor other'],
  ])("refuses '%s' with the line written as outdoor space", (word, written) => {
    const result = compileRoomsText(`${WALLS}\nroom living "Living room" living 5 x 4 at 0,0\nroom out "Out" ${word} 5 x 3 north of living`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]!.code).toBe('rooms/unknown-use')
    expect(result.problems[0]!.message).toContain(`room out "Out" ${written}`)
  })
})
