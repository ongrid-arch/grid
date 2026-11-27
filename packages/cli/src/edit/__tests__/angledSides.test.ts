import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * CMD-50: a side is named as rooms text names it (a compass word, `ne` for a chamfer, `east.2`, a
 * wall id, `facing <room>`) and an angled side moves along its own normal, the walls that meet it
 * at an angle keeping their direction.
 */

type Pair = [number, number]
type Raw = { id: string; start: Pair; end: Pair }
const wall = (id: string, start: Pair, end: Pair, kind = 'exterior'): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
const plan = (walls: Record<string, unknown>[], rooms: Record<string, unknown>[]): Record<string, unknown> => ({ version: '1', units: 'm', walls, rooms, openings: [] })

/** A hall with its north-east corner cut off by a chamfer, "c". */
const CHAMFER = plan(
  [wall('s', [0, 0], [4, 0]), wall('e', [4, 0], [4, 2]), wall('c', [4, 2], [3, 3]), wall('n', [3, 3], [0, 3]), wall('w', [0, 3], [0, 0])],
  [{ id: 'hall', name: 'Hall', use: 'hall', boundary: ['s', 'e', 'c', 'n', 'w'] }],
)

/** Two rooms side by side, the kitchen west of the lounge, wall "mid" between them. */
const PAIR = plan(
  [wall('s1', [0, 0], [4, 0]), wall('s2', [4, 0], [8, 0]), wall('e', [8, 0], [8, 3]), wall('n2', [8, 3], [4, 3]), wall('n1', [4, 3], [0, 3]), wall('w', [0, 3], [0, 0]), wall('mid', [4, 0], [4, 3], 'interior')],
  [{ id: 'a', name: 'Kitchen', use: 'kitchen', boundary: ['s1', 'mid', 'n1', 'w'] }, { id: 'b', name: 'Lounge', use: 'living', boundary: ['s2', 'e', 'n2', 'mid'] }],
)

/** An L: two sides face east, "e1" at x 6 and "e2" at x 4. */
const ELL = plan(
  [wall('s', [0, 0], [6, 0]), wall('e1', [6, 0], [6, 2]), wall('n1', [6, 2], [4, 2]), wall('e2', [4, 2], [4, 4]), wall('n2', [4, 4], [0, 4]), wall('w', [0, 4], [0, 0])],
  [{ id: 'ell', name: 'Studio', use: 'living', boundary: ['s', 'e1', 'n1', 'e2', 'n2', 'w'] }],
)

/** A 4 m by 3 m room turned 30 degrees on the drawing, its corners to the millimetre. */
const c30 = Math.cos(Math.PI / 6)
const s30 = Math.sin(Math.PI / 6)
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const at = (u: number, v: number): Pair => [r3(u * c30 - v * s30), r3(u * s30 + v * c30)]
const TURNED = plan(
  [wall('ab', at(0, 0), at(4, 0)), wall('bc', at(4, 0), at(4, 3)), wall('cd', at(4, 3), at(0, 3)), wall('da', at(0, 3), at(0, 0))],
  [{ id: 'den', name: 'Den', use: 'living', boundary: ['ab', 'bc', 'cd', 'da'] }],
)

let b: Bench
beforeAll(() => {
  b = bench({ 'chamfer.json': CHAMFER, 'pair.json': PAIR, 'ell.json': ELL, 'turned.json': TURNED })
})
afterAll(() => b.close())

const written = (file: string): Raw[] => (JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as { walls: Raw[] }).walls
const get = (walls: Raw[], id: string): Raw => walls.find((w) => w.id === id)!
const dir = (w: Raw): [number, number] => {
  const d: Pair = [w.end[0] - w.start[0], w.end[1] - w.start[1]]
  const l = Math.hypot(d[0], d[1])
  return [d[0] / l, d[1] / l]
}
const len = (w: Raw): number => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])

describe('an angled side moved along its own normal', () => {
  it('moves a chamfer out by its compass word, its neighbours keeping their direction and the chamfer its angle', async () => {
    const reply = await b.call('grid_move_room_side', { plan: 'chamfer.json', room: 'hall', side: 'ne', by: 0.5, out: 'ne.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/Moved wall "c", the north-east side of "Hall", 0\.50 m out/)
    expect(reply.text).toMatch(/Walls "e" and "n" meet the side at an angle and keep their direction/)
    const walls = written('ne.json')
    const k = 0.5 / Math.SQRT1_2
    expect(get(walls, 'e').start).toEqual([4, 0])
    expect(get(walls, 'e').end[0]).toBe(4)
    expect(get(walls, 'e').end[1]).toBeCloseTo(2 + k, 3)
    expect(get(walls, 'n').start[0]).toBeCloseTo(3 + k, 3)
    expect(get(walls, 'n').start[1]).toBe(3)
    const c = get(walls, 'c')
    expect(c.start).toEqual(get(walls, 'e').end)
    expect(c.end).toEqual(get(walls, 'n').start)
    expect(dir(c)[0]).toBeCloseTo(-Math.SQRT1_2, 3)
    expect(dir(c)[1]).toBeCloseTo(Math.SQRT1_2, 3)
    // Half a metre out along its normal: its line is that much further from the corner it cut.
    expect((c.start[0] + c.start[1]) * Math.SQRT1_2 - 6 * Math.SQRT1_2).toBeCloseTo(0.5, 3)
  })

  it('reads north-east and a wall id as the same side', async () => {
    const long = await b.call('grid_move_room_side', { plan: 'chamfer.json', room: 'hall', side: 'north-east', by: 0.5, out: 'long.json' })
    const byWall = await b.call('grid_move_room_side', { plan: 'chamfer.json', room: 'hall', side: 'c', by: 0.5, out: 'wall.json' })
    expect(long.isError, long.text).toBe(false)
    expect(byWall.isError, byWall.text).toBe(false)
    expect(byWall.text).toMatch(/the side on wall "c" of "Hall"/)
    expect(written('long.json')).toEqual(written('ne.json'))
    expect(written('wall.json')).toEqual(written('ne.json'))
  })

  it('refuses a side the room does not have, listing its sides as rooms text names them', async () => {
    const reply = await b.call('grid_move_room_side', { plan: 'chamfer.json', room: 'hall', side: 'se', by: 0.5, out: 'se.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/"Hall" has no side facing se\./)
    expect(reply.text).toMatch(/Its sides: .*ne \(\d+\.\d\d m, wall "c"\)/)
    expect(reply.text).toMatch(/north \(\d+\.\d\d m, wall "n"\)/)
  })

  it('moves the side shared with another room, named by that room', async () => {
    const facing = await b.call('grid_move_room_side', { plan: 'pair.json', room: 'a', side: 'facing Lounge', by: 0.5, out: 'facing.json' })
    const east = await b.call('grid_move_room_side', { plan: 'pair.json', room: 'a', side: 'east', by: 0.5, out: 'east.json' })
    expect(facing.isError, facing.text).toBe(false)
    expect(east.isError, east.text).toBe(false)
    expect(facing.text).toMatch(/the side facing "Lounge" of "Kitchen"/)
    expect(written('facing.json')).toEqual(written('east.json'))
    expect(get(written('facing.json'), 'mid').start).toEqual([4.5, 0])
    const theSide = await b.call('grid_move_room_side', { plan: 'pair.json', room: 'a', side: 'the side facing b', by: 0.5, out: 'theSide.json' })
    expect(theSide.isError, theSide.text).toBe(false)
    expect(written('theSide.json')).toEqual(written('east.json'))
  })

  it('picks one of two sides facing one way by its count, from the west, and refuses the word alone', async () => {
    const both = await b.call('grid_move_room_side', { plan: 'ell.json', room: 'ell', side: 'east', by: 0.5, out: 'both.json' })
    expect(both.isError).toBe(true)
    expect(both.text).toMatch(/has 2 sides facing east, not in one line/)
    expect(both.text).toMatch(/east\.1 \(\d+\.\d\d m, wall "e2"\)/)
    expect(both.text).toMatch(/east\.2 \(\d+\.\d\d m, wall "e1"\)/)
    const second = await b.call('grid_move_room_side', { plan: 'ell.json', room: 'ell', side: 'east.2', by: 0.5, out: 'second.json' })
    expect(second.isError, second.text).toBe(false)
    const walls = written('second.json')
    expect(get(walls, 'e1').start).toEqual([6.5, 0])
    expect(get(walls, 'e2').start).toEqual([4, 2])
    const third = await b.call('grid_move_room_side', { plan: 'ell.json', room: 'ell', side: 'east.3', by: 0.5, out: 'third.json' })
    expect(third.isError).toBe(true)
    expect(third.text).toMatch(/has 2 sides facing east, so east\.3 is none of them/)
  })

  it('moves a side of a room turned 30 degrees along its normal, and refuses a way it has no side facing', async () => {
    const north = await b.call('grid_move_room_side', { plan: 'turned.json', room: 'den', side: 'north', by: 1, out: 'north.json' })
    expect(north.isError).toBe(true)
    expect(north.text).toMatch(/has no side facing north/)
    expect(north.text).toMatch(/ne \(\d+\.\d\d m, wall "bc"\)/)
    const reply = await b.call('grid_move_room_side', { plan: 'turned.json', room: 'den', side: 'ne', by: 1, out: 'turned-ne.json' })
    expect(reply.isError, reply.text).toBe(false)
    const walls = written('turned-ne.json')
    expect(len(get(walls, 'ab'))).toBeCloseTo(5, 2)
    expect(len(get(walls, 'cd'))).toBeCloseTo(5, 2)
    expect(len(get(walls, 'bc'))).toBeCloseTo(3, 2)
    // Every corner still square, every wall still facing its way.
    for (const id of ['ab', 'bc', 'cd', 'da']) {
      const before = dir(get(TURNED['walls'] as Raw[], id))
      const after = dir(get(walls, id))
      expect(after[0]).toBeCloseTo(before[0], 3)
      expect(after[1]).toBeCloseTo(before[1], 3)
    }
  })

  it('gives a turned room an inside size across an angled side', async () => {
    const reply = await b.call('grid_move_room_side', { plan: 'turned.json', room: 'den', side: 'ne', to: 4.8, out: 'to.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/inside size across the north-east side 3\.80 → 4\.80 m/)
    expect(len(get(written('to.json'), 'ab'))).toBeCloseTo(5, 2)
  })
})
