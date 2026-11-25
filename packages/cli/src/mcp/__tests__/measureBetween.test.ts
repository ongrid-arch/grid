import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

/**
 * ARE-10: grid_measure answers lengths, distances and a room's height from faces, as a person
 * measures, so an agent does no arithmetic of its own (lab entry AR-8). The odd house is the
 * lab's, kept in the scoreboard's data: its entrance sits at offset 1.00 m on the south wall,
 * and the west wall is 0.30 m thick, so the door is 0.85 m from the inside face.
 */

const repo = resolve(__dirname, '../../../../..')

function oddHouse(): unknown {
  const lines = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz'))).toString('utf8').split('\n')
  for (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line) as { name: string; text: string }
    if (row.name === 'F/scenarios/odd-house.json') return JSON.parse(row.text)
  }
  throw new Error('the odd house is missing from the scoreboard data')
}

/** A 4 × 3 m box on the axes, 0.2 m walls, with the heights given south, east, north, west. */
function box(heights: readonly [number, number, number, number], roomHeight?: number): unknown {
  const corners = [[0, 0], [4, 0], [4, 3], [0, 3]] as const
  const ids = ['w-s', 'w-e', 'w-n', 'w-w']
  return {
    version: '1',
    units: 'm',
    walls: corners.map((start, i) => ({
      id: ids[i], start, end: corners[(i + 1) % 4], thickness: 0.2, height: heights[i], kind: 'exterior',
    })),
    rooms: [{ id: 'room', name: 'Study', boundary: ids, ...(roomHeight === undefined ? {} : { height: roomHeight }) }],
    openings: [],
  }
}

/** Three 3 × 3 m rooms in a row, A, B and C, 0.2 m walls between; `door` cuts a door in the first partition. */
function row(door: boolean): unknown {
  const xs = [0, 3, 6, 9]
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
  const walls = [
    wall('s', [0, 0], [9, 0]), wall('n', [9, 3], [0, 3]),
    ...xs.map((x, i) => wall(`x${i}`, [x, 0], [x, 3])),
  ]
  const boundary = (i: number) => [`x${i}`, 's', `x${i + 1}`, 'n']
  return {
    version: '1', units: 'm', walls,
    rooms: ['A', 'B', 'C'].map((name, i) => ({ id: name.toLowerCase(), name, boundary: boundary(i) })),
    openings: door ? [{ id: 'door', type: 'door', wall: 'x1', offset: 1, width: 1, height: 2.1 }] : [],
  }
}

let b: Bench
beforeAll(() => {
  b = bench({
    'odd.json': oddHouse(),
    'row.json': row(false),
    'rowDoor.json': row(true),
    'level.json': box([2.7, 2.7, 2.7, 2.7]),
    'mixed.json': box([2.7, 2.7, 2.4, 2.7]),
    'stated.json': box([2.7, 2.7, 2.4, 2.7], 2.55),
  })
})
afterAll(() => b.close())

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_measure', args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

async function refused(args: Record<string, unknown>): Promise<string> {
  const reply = await b.call('grid_measure', args)
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}

const answer = (reply: Reply): Record<string, unknown> => (reply.data as { answer: Record<string, unknown> }).answer

describe('what=between: the clear distance between two named things, from their faces', () => {
  it('puts the odd house\'s entrance 0.85 m from the inside face of its side wall (AR-8)', async () => {
    const reply = await ok({ plan: 'odd.json', what: 'between', from: 'entrance', to: 'g-w' })
    expect(answer(reply)['distance']).toBeCloseTo(0.85, 6)
    expect(reply.text).toContain('0.85 m')
    expect(reply.text).toContain('"entrance"')
    expect(reply.text).toContain('"g-w"')
  })

  it('gives the same distance either way round', async () => {
    const reply = await ok({ plan: 'odd.json', what: 'between', from: 'g-w', to: 'entrance' })
    expect(answer(reply)['distance']).toBeCloseTo(0.85, 6)
  })

  it('measures the door\'s other edge to the face of the wall past it', async () => {
    // The door runs from 1.00 to 2.00 m along the south wall; the partition's axis is at 3.00 m, 0.12 m thick.
    const reply = await ok({ plan: 'odd.json', what: 'between', from: 'entrance', to: 'g-x3' })
    expect(answer(reply)['distance']).toBeCloseTo(0.94, 6)
  })

  it('gives the gap between two walls face to face, not axis to axis', async () => {
    // The hall: the outside wall's inside face at 0.15 m, the partition's face at 2.94 m.
    expect(answer(await ok({ plan: 'odd.json', what: 'between', from: 'g-w', to: 'g-x3' }))['distance']).toBeCloseTo(2.79, 6)
    expect(answer(await ok({ plan: 'odd.json', what: 'between', from: 'g-s', to: 'g-y4' }))['distance']).toBeCloseTo(3.79, 6)
  })

  it('gives two rooms across one wall the wall\'s thickness', async () => {
    const reply = await ok({ plan: 'odd.json', what: 'between', from: 'g-stair', to: 'g-kitchen' })
    expect(answer(reply)['distance']).toBeCloseTo(0.12, 6)
  })

  it('says a door and its own wall touch', async () => {
    const reply = await ok({ plan: 'odd.json', what: 'between', from: 'entrance', to: 'g-s' })
    expect(answer(reply)['distance']).toBe(0)
    expect(reply.text).toMatch(/touch/)
  })

  it('measures to a free point given by its coordinates', async () => {
    // The hall's inside corner, where the south and west faces meet.
    const reply = await ok({ plan: 'odd.json', what: 'between', from: 'entrance', x: 0.15, y: 0.15 })
    expect(answer(reply)['distance']).toBeCloseTo(0.85, 6)
  })

  it('refuses two things on different floors', async () => {
    expect(await refused({ plan: 'odd.json', what: 'between', from: 'entrance', to: 'f-w' })).toMatch(/same floor/)
  })

  it('refuses a call with both a second thing and a point, or half a point', async () => {
    expect(await refused({ plan: 'odd.json', what: 'between', from: 'entrance', to: 'g-w', x: 0, y: 0 })).toMatch(/to, or x and y/)
    expect(await refused({ plan: 'odd.json', what: 'between', from: 'entrance', x: 0 })).toMatch(/x and y/)
    expect(await refused({ plan: 'odd.json', what: 'between', to: 'g-w' })).toMatch(/needs from/)
  })

  it('refuses an argument that belongs to another measure', async () => {
    expect(await refused({ plan: 'odd.json', what: 'between', from: 'entrance', to: 'g-w', room: 'g-living' })).toMatch(/takes from, to, x, y/)
  })
})

describe('what=between: says when the measure runs through a wall (ARE-53)', () => {
  it('names the partitions between two rooms and calls the figure overall, not clear', async () => {
    const reply = await ok({ plan: 'row.json', what: 'between', from: 'a', to: 'c' })
    expect(answer(reply)['through']).toEqual(['x1', 'x2'])
    expect(answer(reply)['clear']).toBe(false)
    expect(reply.text).toMatch(/overall/)
    expect(reply.text).toMatch(/through walls "x1", "x2"/)
    expect(reply.text).not.toMatch(/ clear,/)
  })

  it('names nothing for two walls with open floor between them', async () => {
    const reply = await ok({ plan: 'row.json', what: 'between', from: 'x0', x: 1.5, y: 1.5 })
    expect(answer(reply)['through']).toEqual([])
    expect(answer(reply)['clear']).toBe(true)
    expect(reply.text).toMatch(/ clear,/)
  })

  it('leaves out the wall a measured door stands in', async () => {
    const reply = await ok({ plan: 'rowDoor.json', what: 'between', from: 'door', to: 'x2' })
    expect(answer(reply)['through']).toEqual([])
  })

  it('does not count a wall the line passes through at a door', async () => {
    const reply = await ok({ plan: 'rowDoor.json', what: 'between', from: 'a', x: 7.5, y: 1.5 })
    expect(answer(reply)['through']).toEqual(['x2'])
  })
})

describe('what=wall: a wall\'s length on its centre line and along each room\'s face', () => {
  it('gives the odd house\'s south wall 10.00 m, and the length each room sees', async () => {
    const reply = await ok({ plan: 'odd.json', what: 'wall', wall: 'g-s' })
    const wall = answer(reply) as { length: number; thickness: number; faces: Array<{ room: string; length: number }> }
    expect(wall.length).toBeCloseTo(10, 6)
    expect(wall.thickness).toBeCloseTo(0.3, 6)
    expect(wall.faces.map((f) => f.room)).toEqual(['g-stair', 'g-living'])
    expect(wall.faces[0]!.length).toBeCloseTo(2.79, 6)
    expect(wall.faces[1]!.length).toBeCloseTo(6.79, 6)
    expect(reply.text).toContain('10.00 m')
    expect(reply.text).toContain('"Hall and stair" 2.79 m')
  })
})

describe('a room\'s height', () => {
  it('is its walls\' height when the plan states none and they agree', async () => {
    const reply = await ok({ plan: 'level.json', what: 'room', room: 'room' })
    expect(answer(reply)['height']).toMatchObject({ value: 2.7, from: 'walls' })
    expect(reply.text).toContain('Height 2.70 m')
  })

  it('is the lowest of its walls when they differ, and says which (the rule in docs/tool-server.md)', async () => {
    const reply = await ok({ plan: 'mixed.json', what: 'room', room: 'room' })
    expect(answer(reply)['height']).toMatchObject({ value: 2.4, from: 'lowest wall', walls: { low: 2.4, high: 2.7, lowest: ['w-n'] } })
    expect(reply.text).toMatch(/Height 2\.40 m, the lowest of its walls: "w-n"/)
  })

  it('is the room\'s own stated height, which wins over its walls', async () => {
    const reply = await ok({ plan: 'stated.json', what: 'room', room: 'room' })
    expect(answer(reply)['height']).toMatchObject({ value: 2.55, from: 'room' })
    expect(reply.text).toContain('Height 2.55 m, as the plan states for the room. Its walls stand 2.40 m to 2.70 m.')
  })

  it('is ruled the same way in docs/tool-server.md, the guide an agent reads', () => {
    const guide = readFileSync(resolve(repo, 'docs/tool-server.md'), 'utf8').replace(/\s+/g, ' ')
    expect(guide).toContain('A height the room states wins, whatever its walls stand')
    expect(guide).toContain('When they differ, the room is as high as the lowest of them')
  })

  it('follows each floor\'s walls in the odd house', async () => {
    expect(answer(await ok({ plan: 'odd.json', what: 'room', room: 'g-living' }))['height']).toMatchObject({ value: 2.7, from: 'walls' })
    expect(answer(await ok({ plan: 'odd.json', what: 'room', room: 'f-bed' }))['height']).toMatchObject({ value: 2.5, from: 'walls' })
  })
})

describe('an unknown name', () => {
  it('is refused with the nearest known id, without repeating what was sent', async () => {
    const text = await refused({ plan: 'odd.json', what: 'between', from: 'entrence', to: 'g-w' })
    expect(text).toContain('nearest known id is "entrance"')
    expect(text).not.toContain('entrence')
  })

  it('names the nearest room for a room, and the nearest wall for a wall', async () => {
    const room = await refused({ plan: 'odd.json', what: 'room', room: 'g-kitchn' })
    expect(room).toContain('nearest known id is "g-kitchen"')
    expect(room).not.toContain('g-kitchn')
    const wall = await refused({ plan: 'odd.json', what: 'wall', wall: 'g-sw' })
    // "g-s" and "g-w" are each one letter away: the plan's first wins.
    expect(wall).toContain('nearest known id is "g-s"')
    expect(wall).not.toContain('g-sw')
  })
})
