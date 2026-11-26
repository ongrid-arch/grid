/**
 * LVL-22: a floor copied turned, moved or scaled, and floors repeated so: the copy has the
 * floor's rooms, as large (or scaled), its walls as many and as thick, and its doors and windows
 * on the same sides of the same rooms.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Opening, type Wall } from '../../types/floorplan'
import { indexPlan } from '../../geometry/plan'
import { roomArea } from '../../geometry/room'
import { floorOf } from '../../geometry/floors'
import { compileRoomsText } from '../compile'
import { repeatedIds } from '../floorCopies'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const BASE = [
  'walls outside 0.3 inside 0.1 height 2.8',
  'floor f00 level 0',
  'room liv "Living" living 5 x 4 at 0,0',
  'room bed "Bedroom" bedroom 3 x 4 east of liv',
  'room bath "Bath" bathroom 3 x 2 north of liv align west',
  'door d1 between liv and bed, 1 from south, 0.9 wide',
  'door d2 between liv and bath, centred, 0.8 wide',
  'window w1 in liv south, centred, 1.8 wide',
  'window w2 in bed east, 0.6 from north, 1.2 wide',
]

const text = (...more: string[]): string => [...BASE, ...more].join('\n')

const onFloor = <T,>(parts: readonly T[], floor: string): T[] => parts.filter((p) => floorOf(p as never) === floor)

function areas(plan: FloorPlan, floor: string): Record<string, number> {
  const index = indexPlan(plan)
  // To the square centimetre: the walls' ends are written to a tenth of a millimetre.
  return Object.fromEntries(onFloor(plan.rooms, floor).map((r) => [r.id.replace(`${floor}-`, ''), Math.round(roomArea(r, index) * 100) / 100]))
}

/** The walls' length by thickness, in centimetres: a turned floor may break an outside wall at another junction. */
function thicknesses(plan: FloorPlan, floor: string): Record<number, number> {
  const out: Record<number, number> = {}
  for (const w of onFloor(plan.walls, floor) as Wall[]) {
    const t = Math.round(w.thickness * 1000)
    out[t] = (out[t] ?? 0) + Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
  }
  for (const t of Object.keys(out)) out[Number(t)] = Math.round(out[Number(t)]! * 100)
  return out
}

/** Each opening's id with the rooms it joins, from the plan's walls and rooms. */
function joins(plan: FloorPlan, floor: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const o of onFloor(plan.openings, floor) as Opening[]) {
    const rooms = onFloor(plan.rooms, floor).filter((r) => r.boundary.includes(o.wall)).map((r) => r.id.replace(`${floor}-`, '')).sort()
    out[o.id.replace(`${floor}-`, '')] = `${o.type}:${rooms.join('+')}:${Math.round(o.width * 100)}`
  }
  return out
}

describe('a floor copied turned (LVL-22)', () => {
  for (const turn of [30, 90, 180, 2]) {
    it(`turned ${turn}° keeps its rooms, walls, doors and windows`, () => {
      const plan = written(text(`floor f01 level 1 copy f00 with openings turn ${turn}`))
      expect(areas(plan, 'f01')).toEqual(areas(plan, 'f00'))
      expect(thicknesses(plan, 'f01')).toEqual(thicknesses(plan, 'f00'))
      expect(joins(plan, 'f01')).toEqual(joins(plan, 'f00'))
    })
  }

  it('turns clockwise with the word, about the point written', () => {
    const plan = written(text('floor f01 level 1 copy f00 turn 90 clockwise about 0,0'))
    const corners = onFloor(plan.walls, 'f01').flatMap((w) => [w.start, w.end])
    // Turned a quarter clockwise about the origin, every corner lies south of it and east of it.
    expect(Math.max(...corners.map((p) => p[1]))).toBeLessThan(0.5)
    expect(Math.min(...corners.map((p) => p[0]))).toBeGreaterThan(-0.5)
  })

  it('moves every corner by the move', () => {
    const plan = written(text('floor f01 level 1 copy f00 with openings move 10,-2'))
    const was = onFloor(plan.walls, 'f00').map((w) => w.start)
    const now = onFloor(plan.walls, 'f01').map((w) => w.start)
    expect(now.length).toBe(was.length)
    now.forEach((p, i) => expect([p[0] - was[i]![0], p[1] - was[i]![1]].map((v) => Math.round(v * 1000) / 1000)).toEqual([10, -2]))
  })

  it('scales the rooms and keeps the walls as thick', () => {
    const plan = written(text('floor f01 level 1 copy f00 with openings scale 0.8'))
    // The same thicknesses, 100 mm and 300 mm, and no other: shorter, not thinner.
    expect(Object.keys(thicknesses(plan, 'f01'))).toEqual(Object.keys(thicknesses(plan, 'f00')))
    expect(thicknesses(plan, 'f01')[100]).toBeLessThan(thicknesses(plan, 'f00')[100]!)
    const was = areas(plan, 'f00')
    const now = areas(plan, 'f01')
    for (const id of Object.keys(was)) expect(now[id]).toBeLessThan(was[id]!)
    expect(joins(plan, 'f01')).toEqual(joins(plan, 'f00'))
  })

  it('keeps a sloped roof unturned and says so, unless the turn is by quarter turns', () => {
    const roofed = (turn: number): string[] =>
      compileRoomsText(text('raw floor {"roof": {"shape": "gable", "eaves": 2.7, "ridge": 5.2, "ridgeRuns": "east-west"}}', `floor f01 level 1 copy f00 with openings turn ${turn}`)).warnings.map((w) => w.code)
    expect(roofed(30)).toContain('rooms/turned-roof')
    expect(roofed(90)).not.toContain('rooms/turned-roof')
  })

  it('refuses a word it does not know, and a turn with no degrees, with the form', () => {
    const odd = compileRoomsText(text('floor f01 level 1 copy f00 spin 30'))
    expect(odd.problems[0]).toMatchObject({ code: 'rooms/syntax' })
    expect(odd.problems[0]!.message).toContain("'spin' is not understood")
    expect(odd.problems[0]!.message).toContain('turn <deg>')
    const bare = compileRoomsText(text('floor f01 level 1 copy f00 turn'))
    expect(bare.problems[0]!.message).toContain("'turn' takes the degrees")
  })
})

describe('floors repeated turned and raised (LVL-22)', () => {
  it('writes f01 to f39, each 3.4 m above the one below and turned 2° more', () => {
    const result = compileRoomsText(text('repeat floors 39 from f00 with openings turn 2 rise 3.4'))
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    const floors = plan.floors!
    expect(floors.map((f) => f.id)).toEqual(['f00', ...repeatedIds('f00', null, 39)])
    expect(floors.at(-1)!.id).toBe('f39')
    floors.slice(1).forEach((f, i) => {
      expect(f.level).toBe(i + 1)
      expect(f.elevation).toBeCloseTo(3.4 * (i + 1), 6)
    })
    const ref = areas(plan, 'f00')
    for (const f of floors) expect(areas(plan, f.id)).toEqual(ref)
    expect(joins(plan, 'f39')).toEqual(joins(plan, 'f00'))
    expect(result.guesses.some((g) => g.includes('39 floors written') && g.includes('turned 2° counter-clockwise'))).toBe(true)
  })

  it('writes the same file twice', () => {
    const line = text('repeat floors 5 from f00 with openings turn 7 move 0.5,0 scale 0.97 rise 3')
    expect(JSON.stringify(compileRoomsText(line).plan)).toBe(JSON.stringify(compileRoomsText(line).plan))
  })

  it('keeps a room that rises through where it is written', () => {
    const plan = written(
      [
        'walls outside 0.3 inside 0.1 height 2.8',
        'floor f00 level 0',
        'room core "Core" stair 3 x 3 at 0,0 through f04',
        'room flat "Flat" living 6 x 6 at 10,10',
        'repeat floors 4 from f00 turn 10',
      ].join('\n')
    )
    const box = (floor: string, id: string): number[] => {
      const room = plan.rooms.find((r) => floorOf(r) === floor && (r.id === id || r.id === `${floor}-${id}`))!
      const walls = plan.walls.filter((w) => room.boundary.includes(w.id))
      return [Math.min(...walls.map((w) => Math.min(w.start[0], w.end[0])))].map((v) => Math.round(v * 1000) / 1000)
    }
    expect(box('f04', 'core')).toEqual(box('f00', 'core'))
    expect(box('f04', 'flat')).not.toEqual(box('f00', 'flat'))
  })

  it('counts ids up from the digits, or from the id written after as', () => {
    expect(repeatedIds('f00', null, 3)).toEqual(['f01', 'f02', 'f03'])
    expect(repeatedIds('typ', null, 2)).toEqual(['typ2', 'typ3'])
    expect(repeatedIds('ground', 'l1', 3)).toEqual(['l1', 'l2', 'l3'])
  })

  it('refuses more than 200 floors, a floor not written and an id already written', () => {
    expect(compileRoomsText(text('repeat floors 201 from f00')).problems[0]!.message).toContain('from 1 to 200 floors')
    expect(compileRoomsText(text('repeat floors 3 from g')).problems[0]).toMatchObject({ code: 'rooms/unknown-floor' })
    expect(compileRoomsText(text('floor f02 level 2 copy f00', 'repeat floors 3 from f00')).problems[0]).toMatchObject({ code: 'rooms/duplicate-id' })
  })

  it('refuses a rise from a floor above the first that states no elevation', () => {
    const result = compileRoomsText(text('floor f01 level 1 copy f00', 'repeat floors 3 from f01 as f02 rise 3'))
    expect(result.problems[0]!.message).toContain("rise counts up from the elevation of floor 'f01'")
  })
})
