/**
 * WRT-55: rooms text written from sample plans gets what each line says, or a refusal that names
 * what is really wrong and how to write it. Each case here was written silently, or refused with
 * advice that did not apply, before.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'

const walls = 'walls outside 0.3 inside 0.1 height 2.7\n'
const write = (body: string) => compileRoomsText(walls + body)
const codes = (result: ReturnType<typeof compileRoomsText>): string[] => result.problems.map((p) => p.code)
const room = (result: ReturnType<typeof compileRoomsText>, id: string) => result.rooms.find((r) => r.id === id)!

describe('a room placed or sized twice', () => {
  it('refuses a room placed twice, naming both places', () => {
    const result = write('room a "A" living 4 x 4\nroom b "B" bedroom 3 x 3 north of a south of a\n')
    expect(result.plan).toBeNull()
    expect(codes(result)).toEqual(['rooms/syntax'])
    expect(result.problems[0]!.message).toContain("'north of a'")
    expect(result.problems[0]!.message).toContain("'south of a'")
  })

  it('refuses at and a side together, and two sizes', () => {
    expect(codes(write('room a "A" living 4 x 4 at 0,0 at 1,1\n'))).toEqual(['rooms/syntax'])
    expect(codes(write('room a "A" living 4 x 4\nroom b "B" bedroom 3 x 3 at 4,0 east of a\n'))).toEqual(['rooms/syntax'])
    const sized = write('room a "A" living 4 x 4 5 x 5\n')
    expect(codes(sized)).toEqual(['rooms/syntax'])
    expect(sized.problems[0]!.message).toContain("'4 x 4'")
    expect(sized.problems[0]!.message).toContain("'5 x 5'")
  })
})

describe('until and a stretched side', () => {
  it('stops at the near face of the room it names when that room is in the way', () => {
    const result = write('room a "A" living 4 x 4\nroom x "X" living 2 x 4 east of a\nroom b "B" bedroom 3 x 6 east of x\nroom c "C" corridor * x 1.5 north of a until b\n')
    expect(result.problems).toEqual([])
    // From a's west face to b's west face, less the wall between: 4 + 0.1 + 2 = 6.1.
    expect(room(result, 'c').width).toBeCloseTo(6.1, 4)
  })

  it("'until near' stops at the near face, and plain until beside the row runs to its far face as before", () => {
    const body = 'room a "A" living 4 x 4\nroom b "B" bedroom 3 x 4 east of a\n'
    expect(room(write(`${body}room c "C" corridor * x 1.5 north of a until b\n`), 'c').width).toBeCloseTo(7.1, 4)
    const near = write(`${body}room c "C" corridor * x 1.5 north of a until near b\n`)
    expect(near.problems).toEqual([])
    expect(room(near, 'c').width).toBeCloseTo(4, 4)
  })

  it('takes the extent of the room beside it for a * along it, and says so', () => {
    const result = write('room a "A" living 5 x 4\nroom c "C" corridor * x 1.5 north of a\nroom d "D" corridor 1.2 x * east of a\n')
    expect(result.problems).toEqual([])
    expect(room(result, 'c').width).toBeCloseTo(5, 4)
    expect(room(result, 'd').depth).toBeCloseTo(4, 4)
    expect(result.guesses.join(' ')).toContain("'c'")
  })
})

describe('repeat labels and fill', () => {
  const unit = 'unit u w=3\nroom r "R {n}" bedroom $w x 4\nend\n'

  it('keeps leading zeros and counts from the digits', () => {
    const result = write(`${unit}repeat u 3 east as 001 at 0,0\nroom c "C" corridor * x 1.5 north of r-001 until r-003\n`)
    expect(result.problems).toEqual([])
    expect(result.rooms.map((r) => r.id)).toEqual(['r-001', 'r-002', 'r-003', 'c'])
    const lettered = write(`${unit}repeat u 2 east as A01 at 0,0\n`)
    expect(lettered.rooms.map((r) => r.id)).toEqual(['r-A01', 'r-A02'])
    expect(write(`${unit}repeat u 2 east as A at 0,0\n`).rooms.map((r) => r.id)).toEqual(['r-A1', 'r-A2'])
  })

  it('works out the setting written * so the row fills the length', () => {
    const result = write(`${unit}repeat u 4 east as 1 at 0,0 w=* fill 12.7\n`)
    expect(result.problems).toEqual([])
    const xs = result.rooms.map((r) => r.width)
    // Four rooms and three 0.1 m walls in 12.7 m: 3.1 m each.
    for (const w of xs) expect(w).toBeCloseTo(3.1, 3)
  })

  it('refuses fill without a setting written *', () => {
    const result = write(`${unit}repeat u 4 east as 1 at 0,0 fill 12.7\n`)
    expect(codes(result)).toEqual(['rooms/syntax'])
    expect(result.problems[0]!.message).toContain('w=*')
  })

  it('says once, and first, that a row runs past the room it is placed beside', () => {
    const result = write(`room corr "Corridor" corridor 12 x 1.5\n${unit}repeat u 4 east as 1 north of corr align west\n`)
    expect(result.problems).toEqual([])
    const overruns = result.warnings.filter((w) => w.code === 'rooms/row-overrun')
    expect(overruns).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('rooms/row-overrun')
    expect(overruns[0]!.message).toContain("'corr'")
    expect(overruns[0]!.message).toContain('0.30')
  })
})

describe('the gap that closes', () => {
  it('gives the width that closes a gap too wide for a wall', () => {
    const result = write('room a "A" living 4 x 4 at 0,0\nroom b "B" bedroom 3 x 4 at 4.8,0\n')
    expect(codes(result)).toEqual(['rooms/gap'])
    // 0.8 m apart; a 0.1 m wall closes it when one room is 0.7 m wider.
    expect(result.problems[0]!.message).toContain("'3.7 x 4' for 'b'")
    expect(result.problems[0]!.message).toContain("'4.7 x 4' for 'a'")
  })
})

describe('sizes to the outside faces and the centre lines', () => {
  it('adds up two rooms sized to their outside faces placed one beside the other', () => {
    const result = write('room a "A" living 2.44 x 6.06 outside at 0,0\nroom b "B" bedroom 2.44 x 6.06 outside east of a\n')
    expect(result.problems).toEqual([])
    expect(room(result, 'a').width + room(result, 'b').width + 0.3 + 0.1 + 0.3).toBeCloseTo(4.88, 4)
  })

  it('keeps the inside wall between rooms of a unit sized to centre lines and placed at x,y', () => {
    const result = write('unit u\nroom a "A {n}" living 4 x 4 centre at 0,0\nroom b "B {n}" bedroom 4 x 4 centre at 4,0\nend\nplace u as 1 at 0,0\n')
    expect(result.problems).toEqual([])
    expect(result.walls.find((w) => w.kind === 'interior')!.thickness).toBeCloseTo(0.1, 4)
    expect(room(result, 'a-1').width).toBeCloseTo(3.8, 4)
  })
})

describe('openings', () => {
  const pair = 'room a "A" living 4 x 4\nroom b "B" bedroom 3 x 4 east of a\n'

  it('refuses opens in and opens out on a door between two rooms, offering each room', () => {
    for (const how of ['in', 'out']) {
      const result = write(`${pair}door d1 between a and b, centred, 0.8 wide, opens ${how}\n`)
      expect(codes(result)).toEqual(['rooms/door-side'])
      expect(result.problems[0]!.fixes?.map((f) => f.text)).toEqual(['door d1 between a and b, centred, 0.8 wide, opens into a', 'door d1 between a and b, centred, 0.8 wide, opens into b'])
    }
  })

  it('lets a door carry a name, kept in its facts', () => {
    const result = write(`${pair}door d1 "Front door" in a south, centred, 0.9 wide\n`)
    expect(result.problems).toEqual([])
    expect(result.plan!.openings.find((o) => o.id === 'd1')!.properties).toEqual({ name: 'Front door' })
  })

  it('measures a door between two rooms along the stretch they share', () => {
    const result = write('room a "A" living 8 x 4\nroom b "B" bedroom 3 x 3 north of a align east\ndoor d1 between a and b, 0.5 from west, 0.8 wide\n')
    expect(result.problems).toEqual([])
    const plan = result.plan!
    const door = plan.openings.find((o) => o.id === 'd1')!
    const wall = plan.walls.find((w) => w.id === door.wall)!
    const x0 = Math.min(wall.start[0], wall.end[0]) + (wall.start[0] < wall.end[0] ? door.offset : -door.offset - door.width + Math.abs(wall.end[0] - wall.start[0]))
    // b's west face is at x = 5; the door starts 0.5 m east of it.
    expect(x0).toBeCloseTo(5.5, 3)
  })

  it('puts a window on the outside stretch of a side partly against another room', () => {
    // The bath covers the west 2 m of bed1's north side; the outside stretch is the east 2 m.
    const body = 'room bed1 "Bed 1" bedroom 4 x 4\nroom bath "Bath" bathroom 2 x 2 north of bed1\n'
    for (const place of ['centred', '0.4 from west']) {
      const result = write(`${body}window w1 in bed1 north, ${place}, 0.9 wide\n`)
      expect(result.problems).toEqual([])
      expect(result.warnings).toEqual([])
      expect(result.openings[0]).toContain('joins bed1 and the outside')
      expect(result.guesses.join(' ')).toContain('outside stretch')
    }
    // A window that stands in the outside stretch as written is placed as before.
    const kept = write(`${body}window w1 in bed1 north, 0.3 from east, 0.9 wide\n`)
    expect(kept.openings[0]).toContain("0.30 m from bed1's east corner")
  })
})

describe('open', () => {
  it('says which room it opened the room to', () => {
    const result = write('room a "A" living 4 x 4\nroom b "B" bedroom 3 x 4 east of a open\n')
    expect(result.problems).toEqual([])
    expect(result.guesses.join(' ')).toContain("'b' is open to 'a'")
  })

  it("names the room with 'open <room>', also for a room placed at x,y", () => {
    const result = write('room a "A" living 4 x 4 at 0,0\nroom b "B" bedroom 4 x 4 at 4,0 open a\n')
    expect(result.problems).toEqual([])
    expect(result.walls.some((w) => w.virtual && w.rooms.includes('a') && w.rooms.includes('b'))).toBe(true)
    const bare = write('room a "A" living 4 x 4 at 0,0\nroom b "B" bedroom 4 x 4 at 4,0 open\n')
    expect(codes(bare)).toEqual(['rooms/syntax'])
    expect(bare.problems[0]!.message).toContain("'open <room>'")
  })

  it('opens a room cut out of a corner to its host', () => {
    const result = write('room a "A" living 5 x 5\nroom cl "Stair" stair 1.5 x 1.5 inside a corner ne open\n')
    expect(result.problems).toEqual([])
    const between = result.walls.filter((w) => w.kind !== 'exterior' && w.rooms.includes('a') && w.rooms.includes('cl'))
    expect(between.length).toBeGreaterThan(0)
    expect(between.every((w) => w.virtual)).toBe(true)
    expect(result.guesses.join(' ')).toContain("'cl' is open to 'a'")
  })
})

describe('words in the wrong place', () => {
  it('points a room line that names a floor to the floor lines', () => {
    const result = write('room a "A" living 4 x 4 floor first\n')
    expect(codes(result)).toEqual(['rooms/syntax'])
    expect(result.problems[0]!.message).toContain("'floor first'")
    expect(result.problems[0]!.message).toContain('floor line')
  })

  it('says where outdoor goes when it is written as the use', () => {
    for (const word of ['outdoor', 'terrace']) {
      const result = write(`room a "A" living 4 x 4\nroom t "Terrace" ${word} 4 x 3 south of a\n`)
      expect(codes(result)).toEqual(['rooms/unknown-use'])
      expect(result.problems[0]!.fixes?.map((f) => f.text)).toEqual(['room t "Terrace" - 4 x 3 south of a outdoor terrace'])
      expect(write(`room a "A" living 4 x 4\n${result.problems[0]!.fixes![0]!.text}\n`).problems).toEqual([])
    }
  })

  it('shows a thickness as a bare number when a wall line is not understood', () => {
    const result = write('room a "A" living 4 x 4\nwall a south thick\n')
    expect(codes(result)).toEqual(['rooms/syntax'])
    expect(result.problems[0]!.message).not.toContain('a thickness,')
    expect(result.problems[0]!.message).toContain('0.2')
  })

  it('reads a quote mark written with a backslash inside quotes', () => {
    const result = write('room a "The \\"den\\"" living 4 x 4\n')
    expect(result.problems).toEqual([])
    expect(result.plan!.rooms[0]!.name).toBe('The "den"')
  })
})

describe('a wall where placement left none', () => {
  it('makes the wall a wall line asks for between rooms placed touching', () => {
    const result = write('room a "A" living 4 x 4 at 0,0\nroom b "B" bedroom 4 x 4 at 4,0\nwall between a and b\n')
    expect(result.problems).toEqual([])
    const wall = result.walls.find((w) => w.kind !== 'exterior' && w.rooms.includes('a') && w.rooms.includes('b'))!
    expect(wall.virtual).toBe(false)
    expect(wall.thickness).toBeCloseTo(0.1, 4)
    expect(wall.id).toBe('w-a-b')
    // Each room gives up half the wall: Grid measures 3.95 x 4 m inside.
    expect(result.warnings.find((w) => w.code === 'rooms/area-differs')!.message).toContain('15.80')
    expect(result.warnings.map((w) => w.code)).toContain('rooms/wall-on-line')
  })

  it('offers open only to a room placed beside the other', () => {
    const at = write('room a "A" living 4 x 4 at 0,0\nroom b "B" bedroom 4 x 4 at 4,0\n')
    expect(codes(at)).toEqual(['rooms/touching'])
    expect(at.problems[0]!.message).not.toContain("add 'open' to the room line")
    expect(at.problems[0]!.message).toContain("'open a'")
  })

  it('offers a corner only to a room that fits in the other', () => {
    const big = write('room a "A" living 3 x 3 at 0,0\nroom b "B" bedroom 5 x 5 at 1,1\n')
    expect(codes(big)).toContain('rooms/overlap')
    expect(big.problems[0]!.message).not.toContain('corner')
    const small = write('room a "A" living 5 x 5 at 0,0\nroom b "B" bedroom 1 x 1 at 4,4\n')
    expect(small.problems[0]!.message).toContain("'inside a corner")
  })
})
