import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expandPatterns } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * WRT-24: a stretch moves everything beyond its line with the walls. A warehouse of two 24 m
 * bays on two floors, stretched east by 12 m through its east bay (the line at x = 36): the
 * column, the parking bay and the stair beyond the line move, the grid's last spacing grows, the
 * site's fence gets longer and its tree moves, the door patterns keep their doors where they stood
 * at their pitch, and what stays (a ramp across the line, a turned grid, the plot's boundary) is
 * named.
 */

type Tuple = [number, number]
type Raw = Record<string, unknown>

function warehouse(): Raw {
  const walls: Raw[] = []
  const rooms: Raw[] = []
  for (const floor of ['ground', 'first']) {
    const s = floor === 'ground' ? '' : '-1'
    const w = (id: string, start: Tuple, end: Tuple, kind = 'exterior'): Raw => ({ id: `${id}${s}`, start, end, thickness: kind === 'exterior' ? 0.3 : 0.2, height: 6, kind, floor })
    walls.push(w('s1', [0, 0], [24, 0]), w('s2', [24, 0], [48, 0]), w('e', [48, 0], [48, 20]), w('n2', [48, 20], [24, 20]), w('n1', [24, 20], [0, 20]), w('w', [0, 20], [0, 0]), w('mid', [24, 0], [24, 20], 'interior'))
    rooms.push(
      { id: `west${s}`, name: `West bay${s}`, use: 'storage', floor, boundary: [`s1${s}`, `mid${s}`, `n1${s}`, `w${s}`] },
      { id: `east${s}`, name: `East bay${s}`, use: 'storage', floor, boundary: [`s2${s}`, `e${s}`, `n2${s}`, `mid${s}`] },
    )
  }
  return {
    version: '1',
    units: 'm',
    floors: [{ id: 'ground', name: 'Ground', level: 0, elevation: 0, height: 6 }, { id: 'first', name: 'First', level: 1, elevation: 6, height: 6 }],
    walls,
    rooms,
    openings: [],
    patterns: [
      // Four dock doors spread along s2, which grows at its end.
      { id: 'docks', wall: 's2', opening: { type: 'door', width: 3, height: 4 }, count: 4, margins: { start: 2, end: 2 } },
      // A door every 6 m along n2, which runs west and grows at its start.
      { id: 'north-doors', wall: 'n2', opening: { type: 'door', width: 2, height: 2.4 }, spacing: 6, margins: { start: 1 } },
    ],
    columns: [
      { id: 'c1', shape: 'square', width: 0.5, at: [12, 10] },
      { id: 'c2', shape: 'square', width: 0.5, at: [30, 10] },
      { id: 'c3', shape: 'square', width: 0.5, at: [42, 10] },
    ],
    grids: [
      { id: 'main', origin: [0, 0], x: { spacing: [12, 12, 12, 12] }, y: { spacing: [20] } },
      { id: 'skew', origin: [40, 5], turn: 30, x: { spacing: [3] }, y: { spacing: [3] } },
      // WRT-83: a radial grid beyond the line moves whole with its centre.
      { id: 'ring', origin: [44, 30], x: { spacing: [90] }, y: { spacing: [] }, polar: { radius: 2 } },
    ],
    bays: [
      { id: 'b1', number: '1', at: [30, 4], width: 2.5, length: 5 },
      { id: 'b2', number: '2', at: [42, 4], width: 2.5, length: 5 },
    ],
    stairs: [{ id: 'st1', from: 'ground', to: 'first', width: 1.2, start: [40, 17], end: [46, 17] }],
    ramps: [{ id: 'r1', from: 'ground', to: 'first', width: 3.5, run: [[28, 12], [44, 12]] }],
    site: {
      boundary: [[-10, -10], [80, -10], [80, 40], [-10, 40]],
      things: [
        { id: 'fence', kind: 'fence', points: [[-5, -5], [30, -5], [60, -5]] },
        { id: 'oak', kind: 'tree', at: [45, 30] },
        { id: 'path', kind: 'path', points: [[5, 30], [15, 30]], width: 1.5 },
      ],
    },
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'warehouse.json': warehouse() })
})
afterAll(() => b.close())

const read = (file: string): Raw => JSON.parse(readFileSync(resolve(b.folder, file), 'utf8')) as Raw
const byId = (list: unknown, id: string): Raw => (list as Raw[]).find((part) => part['id'] === id)!

/** Where each opening a pattern places stands in the building: its near edge's point. */
function doorPlaces(raw: Raw): Map<string, Tuple> {
  const plan = expandPatterns(parseFloorPlan(raw)).plan
  const out = new Map<string, Tuple>()
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wall)!
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    const t = o.offset / len
    out.set(o.id, [Number((w.start[0] + t * (w.end[0] - w.start[0])).toFixed(4)), Number((w.start[1] + t * (w.end[1] - w.start[1])).toFixed(4))])
  }
  return out
}

describe('WRT-24: a stretch carries what is beyond its line', () => {
  it('moves the column, the bay, the stair, the grid and the site things beyond the line, and names what stayed', async () => {
    const reply = await b.call('grid_stretch', { plan: 'warehouse.json', side: 'east', by: 12, through: 'east', out: 'longer.json' })
    expect(reply.isError, reply.text).toBe(false)
    const after = read('longer.json')
    expect(byId(after['columns'], 'c1')['at']).toEqual([12, 10])
    expect(byId(after['columns'], 'c2')['at']).toEqual([30, 10])
    expect(byId(after['columns'], 'c3')['at']).toEqual([54, 10])
    expect(byId(after['bays'], 'b1')['at']).toEqual([30, 4])
    expect(byId(after['bays'], 'b2')['at']).toEqual([54, 4])
    // The stair written by its ends is written by its run, moved whole.
    const stair = byId(after['stairs'], 'st1')
    expect(stair['run']).toEqual([[52, 17], [58, 17]])
    expect(stair['start']).toBeUndefined()
    // The ramp across the line stays as it was, and is named.
    expect(byId(after['ramps'], 'r1')['run']).toEqual([[28, 12], [44, 12]])
    // The grid square to the stretch: its spacing across the line (between lines 3 and 4; the room's middle is just short of line 4) grows by the distance.
    const main = byId(after['grids'], 'main')
    expect(main['origin']).toEqual([0, 0])
    expect((main['x'] as Raw)['spacing']).toEqual([12, 12, 24, 12])
    expect((main['y'] as Raw)['spacing']).toEqual([20])
    // The turned grid stays.
    expect(byId(after['grids'], 'skew')['origin']).toEqual([40, 5])
    expect(byId(after['grids'], 'ring')).toEqual({ id: 'ring', origin: [56, 30], x: { spacing: [90] }, y: { spacing: [] }, polar: { radius: 2 } })
    const site = after['site'] as Raw
    expect(site['boundary']).toEqual([[-10, -10], [80, -10], [80, 40], [-10, 40]])
    expect(byId(site['things'], 'fence')['points']).toEqual([[-5, -5], [30, -5], [72, -5]])
    expect(byId(site['things'], 'oak')['at']).toEqual([57, 30])
    expect(byId(site['things'], 'path')['points']).toEqual([[5, 30], [15, 30]])

    expect(reply.text).toContain('1 column, 1 parking bay, 2 structural grids, 1 stair and 2 things on the site beyond the line moved with it.')
    expect(reply.text).toContain('Grid "main": lines 3 and 4 are 24 m apart now, 12 m more, so it still reaches the walls that moved.')
    const couldNotKeep = reply.data!['couldNotKeep'] as string[]
    expect(couldNotKeep).toContain('Ramp "r1" crosses the line, and stretching it would change its length: it stays where it was.')
    expect(couldNotKeep).toContain('Grid "skew" is turned across the stretch, so it stays where it was: its lines no longer reach the walls that moved.')
    expect(reply.data!['guessed']).toContain('The site\'s boundary stays where it was: a stretch moves the building, not the plot.')
  })

  it('keeps every door of a pattern where it stood, at its pitch', async () => {
    const reply = await b.call('grid_stretch', { plan: 'warehouse.json', side: 'east', by: 12, through: 'east', out: 'doors.json' })
    expect(reply.isError, reply.text).toBe(false)
    const before = warehouse()
    const after = read('doors.json')
    // The docks grow at their wall's end: the four doors keep their 5.667 m pitch.
    expect(byId(after['patterns'], 'docks')['spacing']).toBe(5.666667)
    expect(byId(after['patterns'], 'docks')['count']).toBe(4)
    expect(byId(after['patterns'], 'docks')['opening']).toEqual({ type: 'door', width: 3, height: 4 })
    // The north doors' wall grows at its start: the start margin takes the 12 m.
    expect(byId(after['patterns'], 'north-doors')['margins']).toEqual({ start: 13 })
    const was = doorPlaces(before)
    const now = doorPlaces(after)
    for (const id of ['docks-ground-1', 'docks-ground-2', 'docks-ground-3', 'docks-ground-4', 'north-doors-ground-1', 'north-doors-ground-4']) {
      expect(now.get(id), id).toEqual(was.get(id))
    }
    expect(reply.text).toContain('Pattern "docks" keeps its 4 openings where they were, 5.667 m apart; the 12 m its wall grew at its end is clear: raise its count to fill it.')
    expect(reply.text).toContain('Pattern "north-doors" keeps its openings where they were: its start margin is 13 m now.')
  })

  it('leaves the grid and the stair where they were when one floor is stretched, and says so', async () => {
    const reply = await b.call('grid_stretch', { plan: 'warehouse.json', side: 'east', by: 12, through: 'east', floor: 'ground', out: 'ground.json' })
    expect(reply.isError, reply.text).toBe(false)
    const after = read('ground.json')
    expect(byId(after['columns'], 'c3')['at']).toEqual([54, 10])
    expect((byId(after['grids'], 'main')['x'] as Raw)['spacing']).toEqual([12, 12, 12, 12])
    expect(byId(after['stairs'], 'st1')['start']).toEqual([40, 17])
    const couldNotKeep = reply.data!['couldNotKeep'] as string[]
    expect(couldNotKeep).toContain('Grid "main" is drawn on floors that were not stretched, so it stays where it was: its lines no longer reach the walls that moved.')
    expect(couldNotKeep).toContain('Stair "st1" joins a floor that was not stretched: it stays where it was.')
  })

  it('shrinks the grid spacing back with the walls', async () => {
    const reply = await b.call('grid_stretch', { plan: 'longer.json', side: 'east', by: -12, through: 'east', out: 'back.json' })
    expect(reply.isError, reply.text).toBe(false)
    const after = read('back.json')
    expect((byId(after['grids'], 'main')['x'] as Raw)['spacing']).toEqual([12, 12, 12, 12])
    expect(byId(after['columns'], 'c3')['at']).toEqual([42, 10])
    expect(reply.text).toContain('12 m less')
  })
})
