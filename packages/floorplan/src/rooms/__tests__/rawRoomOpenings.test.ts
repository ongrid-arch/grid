/**
 * WRT-45: a door, window or opening line naming a room written raw is placed on the room's
 * walls when the line says which wall, and refused by name with the raw line to write when it
 * does not; no line is passed over in silence.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

const wall = (id: string, a: [number, number], b: [number, number], extra = ''): string =>
  `raw wall {"id": "${id}", "start": [${a.join(', ')}], "end": [${b.join(', ')}], "thickness": 0.2, "height": 3, "kind": "exterior"${extra}}`

/** Two raw rooms side by side, 4 x 3 m each on their walls' centre lines, sharing wall 'm' at x = 4. */
const PAIR = [
  wall('s1', [0, 0], [4, 0]),
  wall('s2', [4, 0], [8, 0]),
  wall('e', [8, 0], [8, 3]),
  wall('n2', [8, 3], [4, 3]),
  wall('n1', [4, 3], [0, 3]),
  wall('w', [0, 3], [0, 0]),
  wall('m', [4, 0], [4, 3], ', "kind": "interior"'),
  'raw room {"id": "west", "name": "West", "boundary": ["s1", "m", "n1", "w"]}',
  'raw room {"id": "east", "name": "East", "boundary": ["s2", "e", "n2", "m"]}',
].join('\n')

/** A round raw room, 3 m to its walls' centre line round (0, 10): two half circles, 'c' by the north and 'd' by the south. */
const ROUND = [
  wall('c', [3, 10], [-3, 10], ', "arc": {"centre": [0, 10], "sweep": 180}'),
  wall('d', [-3, 10], [3, 10], ', "arc": {"centre": [0, 10], "sweep": 180}'),
  'raw room {"id": "round", "name": "Round", "boundary": ["c", "d"]}',
].join('\n')

const RULES = 'walls outside 0.2 inside 0.1 height 3\n'

describe('opening lines naming raw rooms are placed (WRT-45)', () => {
  it('places a door between two raw rooms on the wall they share', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\ndoor d1 between west and east, centred, 0.9 wide\n`)
    expect(result.problems).toEqual([])
    const door = result.plan!.openings.find((o) => o.id === 'd1')!
    expect(door).toMatchObject({ wall: 'm', type: 'door', offset: 1.05, width: 0.9, sill: 0, height: 2.1 })
    // 'm' runs north, so its left face looks west: the door opens east, into 'east'.
    expect(door.swing).toBe('right')
    expect(door.hinge).toBe('start')
    expect(result.guesses.join(' ')).toContain("opens into 'east'")
    expect(validatePlan(parseFloorPlan(result.plan)).issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('places a window in the raw room side named, measured from that end of the wall', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\nwindow w1 in west west, 1 from south, 1.2 wide\n`)
    expect(result.problems).toEqual([])
    // 'w' runs from (0, 3) south to (0, 0): 1 m from its south end is 0.8 m from its start.
    expect(result.plan!.openings).toEqual([{ id: 'w1', wall: 'w', type: 'window', offset: 0.8, width: 1.2, sill: 0.9, height: 1.2 }])
  })

  it('opens a door in a raw room out through its outside wall', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\ndoor d2 in west south, 0.5 from west, 0.9 wide, opens out\n`)
    expect(result.problems).toEqual([])
    // 's1' runs east with 'west' on its left: the outside is its right face.
    expect(result.plan!.openings[0]).toMatchObject({ wall: 's1', offset: 0.5, swing: 'right', hinge: 'start' })
  })

  it('places a door in the curved wall of a round raw room, along its arc', () => {
    const result = compileRoomsText(`${RULES}${ROUND}\ndoor d3 in round south, centred, 0.9 wide, opens into round\n`)
    expect(result.problems).toEqual([])
    const door = result.plan!.openings[0]!
    expect(door.wall).toBe('d')
    expect(door.offset).toBeCloseTo((3 * Math.PI - 0.9) / 2, 4)
    // 'd' turns counter-clockwise round the centre, so its left face looks into the room.
    expect(door.swing).toBe('left')
    expect(result.openings.join(' ')).toContain('d3: door 0.90 m in d')
  })

  it('places a door between a raw room and a room Grid worked out, through a wall they both name', () => {
    const text = `${RULES}room hall "Hall" - 4 x 3 at 0,0\nraw room {"id": "nook", "name": "Nook", "boundary": ["ext-east", "k1", "k2", "k3"]}\n${[
      wall('k1', [4.1, -0.1], [6, -0.1]),
      wall('k2', [6, -0.1], [6, 3.1]),
      wall('k3', [6, 3.1], [4.1, 3.1]),
    ].join('\n')}\ndoor d4 between hall and nook, centred, 0.8 wide\n`
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    expect(result.plan!.openings[0]).toMatchObject({ id: 'd4', wall: 'ext-east', width: 0.8 })
  })

  it('reads the doors and windows of a floor whose rooms are all raw, which were dropped before', () => {
    const result = compileRoomsText(`${RULES}floor ground "Ground" level 0\n${PAIR}\ndoor d1 between west and east, centred, 0.9 wide\nwindow w1 in east east, centred, 1.2 wide\n`)
    expect(result.problems).toEqual([])
    expect(result.plan!.openings.map((o) => [o.id, o.wall])).toEqual([
      ['d1', 'm'],
      ['w1', 'e'],
    ])
  })
})

describe('opening lines naming raw rooms are refused by name when they do not say which wall (WRT-45)', () => {
  it('refuses a door between a raw room and a room it shares no wall with, with the raw line to write', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\n${ROUND}\ndoor d5 between round and west, centred, 0.9 wide\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/no-shared-wall', 14]])
    const message = result.problems[0]!.message
    expect(message).toContain("room 'round' is written raw")
    expect(message).toContain("shares no wall with 'west'")
    expect(message).toContain('raw opening {"id": "d5", "wall": "<wall>", "type": "door", "offset": <offset>, "width": 0.9, "height": 2.1}')
    expect(message).toContain("The walls of 'round': c, d.")
  })

  it('refuses a door between a room Grid worked out and a raw room it shares no wall with, never as no room', () => {
    const result = compileRoomsText(`${RULES}room living "Living" - 5 x 4 at 0,0\n${ROUND}\ndoor d9 between living and round, centred, 0.9 wide\n`)
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/no-shared-wall', 6]])
    expect(result.problems[0]!.message).toContain("room 'round' is written raw, and it shares no wall with 'living'")
  })

  it('refuses a side no wall of the raw room faces, and a side two walls face', () => {
    const none = compileRoomsText(`${RULES}${ROUND}\nwindow w2 in round east, centred, 1 wide\n`)
    expect(none.problems.map((p) => p.code)).toEqual(['rooms/no-side'])
    expect(none.problems[0]!.message).toContain('none of its walls faces east')
    expect(none.problems[0]!.message).toContain('"sill": 0.9')
    // The south side of 'long' is two walls, 'a1' and 'a2'.
    const long = [
      wall('a1', [0, 0], [2, 0]),
      wall('a2', [2, 0], [4, 0]),
      wall('b', [4, 0], [4, 3]),
      wall('t', [4, 3], [0, 3]),
      wall('l', [0, 3], [0, 0]),
      'raw room {"id": "long", "name": "Long", "boundary": ["a1", "a2", "b", "t", "l"]}',
    ].join('\n')
    const two = compileRoomsText(`${RULES}${long}\nwindow w3 in long south, centred, 1 wide\n`)
    expect(two.problems.map((p) => p.code)).toEqual(['rooms/no-side'])
    expect(two.problems[0]!.message).toContain('2 of its walls face south, a1, a2, so the line does not say which')
  })

  it('hangs a door as seen from the room it opens into', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\ndoor d10 between west and east, centred, 0.9 wide, opens into west, hinged left\n`)
    expect(result.problems).toEqual([])
    const door = result.plan!.openings[0]!
    expect(door.swing).toBe('left')
    // Seen from 'west', looking east at 'm', its left hand is north: the wall's end.
    expect(door.hinge).toBe('end')
    expect(result.guesses).toEqual([])
  })

  it('refuses a place measured from another room', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\ndoor d6 between west and east, 1 from south of east, 0.9 wide\n`)
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/no-side'])
    expect(result.problems[0]!.message).toContain("measured from the wall's own ends, not from room 'east'")
    expect(result.problems[0]!.message).toContain('"wall": "m"')
  })

  it('refuses an opening that runs past the end of the raw wall', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\ndoor d7 in east east, 2.5 from south, 0.9 wide\n`)
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/opening-fit'])
    expect(result.problems[0]!.message).toContain("along wall 'e', which is 3.00 m long")
  })

  it('names the rooms on a floor of raw rooms when a line names none of them', () => {
    const result = compileRoomsText(`${RULES}${PAIR}\ndoor d8 between hall and west, centred, 0.9 wide\nwindow w8 in kitchen north, centred, 1 wide\n`)
    const problems = [...result.problems].sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
    expect(problems.map((p) => [p.code, p.line])).toEqual([
      ['rooms/unknown-room', 11],
      ['rooms/unknown-room', 12],
    ])
    expect(problems[0]!.message).toContain("there is no room 'hall'")
    expect(problems[1]!.message).toContain("there is no room 'kitchen'")
    expect(problems[1]!.message).toContain('Rooms: west, east.')
  })
})
