/**
 * WRT-44: what the read-back gives, the writing takes, copied floors included, and a wall with no
 * length is never an internal error: the writer leaves out one it works out, refuses a raw one
 * with its line, and the read-back leaves out one an older plan holds, saying so.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { validatePlan } from '../../geometry/validate'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const noLength = (plan: FloorPlan) => plan.walls.filter((w) => w.arc === undefined && w.start[0] === w.end[0] && w.start[1] === w.end[1])

/** A corridor 6 ft deep along two flats, a pair of doors 6 ft wide filling its west end, copied up. */
const CORRIDOR = [
  'display ft-in',
  'walls outside 8in inside 4.5in height 9ft',
  'floor g "Ground" level 0',
  'room a "Flat A" living 13ft x 13ft at 0,0',
  'room b "Flat B" living 13ft x 13ft east of a',
  'room cor "Corridor" corridor * x 6ft north of a until b',
  'door ent in cor west, centred, 6ft wide, double, opens in',
  'door da between cor and a, centred, 3ft wide, opens into a',
  'floor l1 "First" level 1 copy g with openings',
  'floor l2 "Second" level 2 copy g with openings',
  'floor l3 "Third" level 3 copy g with openings',
  '',
].join('\n')

/** A row of flats whose bedroom wing is wider than its living wing: a notch between each two. */
const NOTCHED = [
  'walls outside 0.2032 inside 0.1143',
  'unit u flat "Flat" "Flat {n}"',
  '  room liv "Living" living 7 x 6.7',
  '  room kit "Kitchen" kitchen 3 x 6.7 east of liv open',
  '  room b1 "Bedroom 1" bedroom 4 x 4 south of liv align west',
  '  room b2 "Bedroom 2" bedroom 4 x 4 east of b1',
  '  room ba "Bath" bathroom 2 x 4 east of b2',
  'end',
  'repeat u 2 east as 101 at 0,0',
  '',
].join('\n')

describe('a door as wide as its side reads back as a door line (WRT-44)', () => {
  it('holds the side a hair short of the door in the file, as the writing rounds it', () => {
    const plan = written(CORRIDOR)
    const cor = plan.walls.find((w) => w.id === 'w-cor-a' || w.id.includes('cor'))
    expect(cor).toBeDefined()
    const ent = plan.openings.find((o) => o.id === 'ent')!
    expect(ent.width).toBeCloseTo(1.8288, 4)
  })

  it('gives every copy of the door as a door line, and the text writes back the same plan', () => {
    const plan = written(CORRIDOR)
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.rawOpenings).toEqual([])
    expect(reading.text).not.toMatch(/^raw /m)
    for (const id of ['ent', 'l1-ent', 'l2-ent', 'l3-ent']) expect(reading.text).toMatch(new RegExp(`^door ${id.replace(/^l\d-/, '')} in cor west, 0 from north, 1\\.828\\d* wide`, 'm'))
    const again = written(reading.text)
    expect(again.openings.map((o) => o.id).sort()).toEqual(plan.openings.map((o) => o.id).sort())
    for (const o of plan.openings) {
      const b = again.openings.find((x) => x.id === o.id)!
      expect(b.wall).toBe(o.wall)
      expect(Math.abs(b.width - o.width)).toBeLessThan(0.0005)
    }
    expect(again.walls.length).toBe(plan.walls.length)
  })
})

describe('the writer never writes a wall with no length (WRT-44)', () => {
  it('leaves out the wall between two outside walls closer than their thickness, and the plan passes its check', () => {
    const result = compileRoomsText(NOTCHED)
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    expect(noLength(plan)).toEqual([])
    expect(validatePlan(plan).issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(result.walls.every((w) => w.length > 0)).toBe(true)
    // Its rooms are bounded as written.
    const bath = result.rooms.find((r) => r.id === 'ba-101')!
    expect(bath.area).toBeCloseTo(8, 6)
  })

  it('reads the notched row back and writes it again', () => {
    const plan = written(NOTCHED)
    const reading = readRoomsText(plan)
    expect(reading.leftOut).toEqual([])
    expect(noLength(written(reading.text))).toEqual([])
  })

  it('refuses a door in the notch with its line', () => {
    const result = compileRoomsText(`${NOTCHED}door dn in ba-101 north, 0.05 from east, 0.1 wide\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/opening-fit', 10]])
  })

  it('refuses a raw wall whose two ends are one point with its line, and throws nothing', () => {
    const text = ['walls outside 0.3 inside 0.1', 'room a "A" living 4 x 4 at 0,0', 'raw wall {"id": "z", "start": [6, 1], "end": [6, 1], "thickness": 0.1, "kind": "interior"}', ''].join('\n')
    let result: ReturnType<typeof compileRoomsText> | null = null
    expect(() => (result = compileRoomsText(text))).not.toThrow()
    expect(result!.plan).toBeNull()
    expect(result!.problems).toHaveLength(1)
    expect(result!.problems[0]).toMatchObject({ code: 'rooms/raw', line: 3 })
    expect(result!.problems[0]!.message).toContain("raw wall 'z' starts and ends at the same point, (6, 1)")
  })
})

describe('a plan holding a wall with no length reads back without it (WRT-44)', () => {
  /** Two rooms as an older writer wrote them, with a wall of no length in the first room's outline and a door in it. */
  function older(): FloorPlan {
    const plan = written(['walls outside 0.3 inside 0.1', 'room a "A" living 4 x 4 at 0,0', 'room b "B" bedroom 3 x 4 east of a', 'door d between a and b, centred, 0.9 wide', ''].join('\n'))
    const a = plan.rooms.find((r) => r.id === 'a')!
    const zero = { id: 'z', start: [0, 4.15] as [number, number], end: [0, 4.15] as [number, number], thickness: 0.3, height: plan.walls[0]!.height, kind: 'exterior' as const }
    return parseFloorPlan({
      ...plan,
      walls: [...plan.walls, zero],
      rooms: plan.rooms.map((r) => (r === a ? { ...r, boundary: [...r.boundary, 'z'] } : r)),
      openings: [...plan.openings, { id: 'dz', wall: 'z', type: 'door', offset: 0, width: 0.8, sill: 0, height: 2.1 }],
    })
  }

  it('is a plan the check leaves the wall out of', () => {
    expect(validatePlan(older()).issues.map((i) => i.code)).toContain('wall/zero-length')
  })

  it('names the wall and the opening left out, and the text writes back the rest as it is', () => {
    const plan = older()
    const reading = readRoomsText(plan)
    expect(reading.leftOut).toHaveLength(2)
    expect(reading.text).toContain('# Left out: wall "z" has no length')
    expect(reading.text).toContain('# Left out: opening "dz" stands in wall "z"')
    expect(reading.rawFloors).toEqual([])
    const again = written(reading.text)
    expect(again.walls.map((w) => w.id).sort()).toEqual(plan.walls.filter((w) => w.id !== 'z').map((w) => w.id).sort())
    expect(again.openings.map((o) => o.id)).toEqual(['d'])
    // The based-on line names the file as it is, so the write is not taken for a stale one.
    expect(compileRoomsText(reading.text).basedOn).toBe(readRoomsText(plan).text.match(/^based on (\S+)$/m)![1])
  })
})

describe('rooms open to each other along a row read back as rooms text (WRT-44)', () => {
  it('says the dividing line once for each two rooms across it', () => {
    const plan = written(['walls outside 0.2 inside 0.1', 'unit u flat "U" "U{n}"', '  room liv "Living" living 4 x 4', '  room kit "Kitchen" kitchen 4 x 3 north of liv open', 'end', 'repeat u 3 east as 1 at 0,0', ''].join('\n'))
    expect(plan.walls.filter((w) => w.virtual === true)).toHaveLength(1)
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    for (const n of [1, 2, 3]) expect(reading.text).toContain(`wall between kit-${n} and liv-${n} virtual`)
    const again = written(reading.text)
    expect(again.walls.map((w) => w.id).sort()).toEqual(plan.walls.map((w) => w.id).sort())
  })
})

describe('a floor after one given raw writes its ids whole (WRT-44)', () => {
  it('keeps the copied floor rooms text when the floor it copies is given raw', () => {
    const arc = '{"id": "bow", "start": [4.15, 1], "end": [4.15, 3], "thickness": 0.1, "kind": "interior", "arc": {"centre": [3.15, 2], "sweep": -120}}'
    const plan = written(['walls outside 0.3 inside 0.1', 'floor g "Ground" level 0', 'room a "A" living 4 x 4 at 0,0', 'door d in a south, centred, 0.9 wide', `raw wall ${arc}`, 'floor l1 "First" level 1', 'room a "A" living 4 x 4 at 0,0', 'door d in a south, centred, 0.9 wide', ''].join('\n'))
    expect(plan.openings.map((o) => o.id).sort()).toEqual(['d', 'l1-d'])
    const reading = readRoomsText(plan)
    expect(reading.rawFloors.map((f) => f.floor)).toEqual(['g'])
    expect(reading.text).toMatch(/^door l1-d in l1-a south/m)
    const again = written(reading.text)
    expect(again.openings.map((o) => o.id).sort()).toEqual(['d', 'l1-d'])
  })
})

describe('every lab building reads back and writes again (WRT-44)', () => {
  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.plan.json'))) {
    it(file, () => {
      const plan = parseFloorPlan(JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8')))
      const result = compileRoomsText(readRoomsText(plan).text)
      expect(result.problems).toEqual([])
    })
  }
})
