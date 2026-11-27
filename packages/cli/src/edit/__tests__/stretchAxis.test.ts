import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * CMD-50: a stretch of a building turned on the drawing runs along the building's own axis
 * nearest the way asked, and says so; one that would turn a wall crossing its line (a room made a
 * kite) is refused, naming the wall.
 */

type Pair = [number, number]
type Raw = { id: string; start: Pair; end: Pair }
const wall = (id: string, start: Pair, end: Pair, kind = 'exterior'): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
const plan = (walls: Record<string, unknown>[], rooms: Record<string, unknown>[]): Record<string, unknown> => ({ version: '1', units: 'm', walls, rooms, openings: [] })
const r3 = (v: number): number => Math.round(v * 1000) / 1000

/** Two rooms, each 4 m by 3 m side by side, the pair turned `degrees` on the drawing. */
function turned(degrees: number): Record<string, unknown> {
  const c = Math.cos((degrees * Math.PI) / 180)
  const s = Math.sin((degrees * Math.PI) / 180)
  const at = (u: number, v: number): Pair => [r3(u * c - v * s), r3(u * s + v * c)]
  return plan(
    [
      wall('s1', at(0, 0), at(4, 0)), wall('s2', at(4, 0), at(8, 0)), wall('e', at(8, 0), at(8, 3)), wall('n2', at(8, 3), at(4, 3)),
      wall('n1', at(4, 3), at(0, 3)), wall('w', at(0, 3), at(0, 0)), wall('mid', at(4, 0), at(4, 3), 'interior'),
    ],
    [{ id: 'a', name: 'Study', use: 'office', boundary: ['s1', 'mid', 'n1', 'w'] }, { id: 'b', name: 'Lounge', use: 'living', boundary: ['s2', 'e', 'n2', 'mid'] }],
  )
}

/** A hall with its north-east corner cut off by a chamfer, "c". */
const CHAMFER = plan(
  [wall('s', [0, 0], [4, 0]), wall('e', [4, 0], [4, 2]), wall('c', [4, 2], [3, 3]), wall('n', [3, 3], [0, 3]), wall('w', [0, 3], [0, 0])],
  [{ id: 'hall', name: 'Hall', use: 'hall', boundary: ['s', 'e', 'c', 'n', 'w'] }],
)

let b: Bench
beforeAll(() => {
  b = bench({ 'thirty.json': turned(30), 'square.json': turned(0), 'diamond.json': turned(45), 'chamfer.json': CHAMFER })
})
afterAll(() => b.close())

const written = (file: string): Raw[] => (JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as { walls: Raw[] }).walls
const dir = (w: Raw): Pair => {
  const d: Pair = [w.end[0] - w.start[0], w.end[1] - w.start[1]]
  const l = Math.hypot(d[0], d[1])
  return [d[0] / l, d[1] / l]
}
const len = (w: Raw): number => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])

describe('a stretch along the building\'s own axis', () => {
  it('stretches two rooms turned 30 degrees along their own axis nearest north, every wall keeping its direction', async () => {
    const reply = await b.call('grid_stretch', { plan: 'thirty.json', side: 'north', by: 1, out: 'thirty-n.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/No wall of the plan faces north: the building is turned on the drawing, so it was stretched along its own axis nearest that way, 30\.0° from north\./)
    const before = turned(30)['walls'] as Raw[]
    const after = written('thirty-n.json')
    for (const w of before) {
      const moved = after.find((x) => x.id === w.id)!
      expect(dir(moved)[0], w.id).toBeCloseTo(dir(w)[0], 3)
      expect(dir(moved)[1], w.id).toBeCloseTo(dir(w)[1], 3)
    }
    // The walls across the line are a metre longer; the rooms 4 m by 4 m.
    for (const id of ['w', 'mid', 'e']) expect(len(after.find((x) => x.id === id)!), id).toBeCloseTo(4, 2)
    for (const id of ['s1', 's2', 'n1', 'n2']) expect(len(after.find((x) => x.id === id)!), id).toBeCloseTo(4, 2)
  })

  it('stretches a plan square to the drawing exactly as before', async () => {
    const reply = await b.call('grid_stretch', { plan: 'square.json', side: 'north', by: 1, out: 'square-n.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toMatch(/own axis/)
    const after = written('square-n.json')
    expect(after.find((w) => w.id === 'n1')!.start).toEqual([4, 4])
    expect(after.find((w) => w.id === 'mid')!.end).toEqual([4, 4])
    expect(after.find((w) => w.id === 's1')!.start).toEqual([0, 0])
  })

  it('refuses a building turned 45 degrees, where two of its axes are as near the way asked', async () => {
    const reply = await b.call('grid_stretch', { plan: 'diamond.json', side: 'north', by: 1, out: 'diamond-n.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/two of the building's own axes are as near it, toward north-(east|west) and toward north-(east|west)/)
    const ne = await b.call('grid_stretch', { plan: 'diamond.json', side: 'ne', by: 1, out: 'diamond-ne.json' })
    expect(ne.isError, ne.text).toBe(false)
    // North-east runs along its long sides: the lounge, beyond the line, is a metre longer.
    for (const id of ['s2', 'n2']) expect(len(written('diamond-ne.json').find((x) => x.id === id)!), id).toBeCloseTo(5, 2)
    for (const id of ['s1', 'n1']) expect(len(written('diamond-ne.json').find((x) => x.id === id)!), id).toBeCloseTo(4, 2)
  })

  it('refuses a stretch that would turn a wall across its line, naming it, and stretches through a room where none turns', async () => {
    const reply = await b.call('grid_stretch', { plan: 'chamfer.json', side: 'north', by: 0.5, out: 'chamfer-n.json' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/Stretching the plan north would turn wall "c" by \d+\.\d°, which cross the line at an angle/)
    const through = await b.call('grid_stretch', { plan: 'chamfer.json', side: 'north', by: 0.5, through: 'hall', out: 'chamfer-through.json' })
    expect(through.isError, through.text).toBe(false)
    const c = written('chamfer-through.json').find((w) => w.id === 'c')!
    expect(c.start).toEqual([4, 2.5])
    expect(c.end).toEqual([3, 3.5])
  })
})
