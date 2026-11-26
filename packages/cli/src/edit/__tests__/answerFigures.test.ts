import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * WRT-11: the figures and counts a change answers with are the ones grid_areas gives for the plan
 * as it now is, and counts are of rooms and openings, never of names.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')

/** A box of two equal rooms side by side with a door between them: it reads the same mirrored. */
const SYMMETRIC = `plan "Pair"
walls outside 0.3 inside 0.1 height 2.6

room west "West room" bedroom 4 x 4 at 0.15,0.15
room east "East room" bedroom 4 x 4 east of west

door door-mid between west and east, 1.6 from south, 0.8 wide, opens into east, hinged south
window win-west in west west, 1.5 from south, 1.0 wide
window win-east in east east, 1.5 from south, 1.0 wide
`

/** `floors` floors, each with the same two rooms by the same names. */
function tower(floors: number): Record<string, unknown> {
  const out: Record<string, unknown> = { version: '1', units: 'm', floors: [], walls: [], rooms: [], openings: [] }
  for (let i = 0; i < floors; i++) {
    const f = `f${i}`
    ;(out['floors'] as unknown[]).push({ id: f, name: `Floor ${i}`, level: i })
    const w = (id: string, s: [number, number], e: [number, number], kind: string) => ({ id: `${id}-${f}`, start: s, end: e, thickness: kind === 'exterior' ? 0.3 : 0.1, height: 2.8, kind, floor: f })
    ;(out['walls'] as unknown[]).push(w('s1', [0, 0], [4, 0], 'exterior'), w('s2', [4, 0], [8, 0], 'exterior'), w('e', [8, 0], [8, 4], 'exterior'), w('n2', [8, 4], [4, 4], 'exterior'), w('n1', [4, 4], [0, 4], 'exterior'), w('w', [0, 4], [0, 0], 'exterior'), w('m', [4, 0], [4, 4], 'interior'))
    ;(out['rooms'] as unknown[]).push(
      { id: `a-${f}`, name: 'Office', use: 'office', floor: f, boundary: [`s1-${f}`, `m-${f}`, `n1-${f}`, `w-${f}`] },
      { id: `b-${f}`, name: 'Store', use: 'storage', floor: f, boundary: [`s2-${f}`, `e-${f}`, `n2-${f}`, `m-${f}`] },
    )
  }
  return out
}

let b: Bench
beforeAll(async () => {
  b = bench({ 'tower.json': tower(46) })
  expect((await b.call('grid_write_rooms', { plan: 'flat.json', rooms: FLAT })).isError).toBe(false)
  expect((await b.call('grid_write_rooms', { plan: 'pair.json', rooms: SYMMETRIC })).isError).toBe(false)
})
afterAll(() => b.close())

const lines = (text: string): string[] => text.split('\n')

describe('WRT-11: a split answers with the rooms as they are', () => {
  it('gives the room its real new area and keeps the window it still has, on a plan written rooms first', async () => {
    const reply = await b.call('grid_split_room', { plan: 'flat.json', room: 'bed1', side: 'east', size: 1.35, new_room: 'den', new_name: 'Den', out: 'split.json' })
    expect(reply.isError, reply.text).toBe(false)
    const line = lines(reply.text).find((l) => l.startsWith('"Bedroom 1":'))!
    expect(line).toMatch(/^"Bedroom 1": 13\.64 → ([\d.]+) m²; new room "Den": ([\d.]+) m²\.$/)
    const [, kept, taken] = line.match(/→ ([\d.]+) m²; new room "Den": ([\d.]+) m²/)!
    expect(Number(kept)).toBeGreaterThan(8)
    expect(Number(kept) + Number(taken)).toBeLessThan(13.64)
    expect(Number(kept) + Number(taken)).toBeGreaterThan(13.64 - 0.5)
    // Grid's own areas say the same.
    const areas = await b.call('grid_areas', { plan: 'split.json' })
    const rooms = (areas.data!['floors'] as { rooms: { id: string; net: number }[] }[]).flatMap((f) => f.rooms)
    expect(rooms.find((r) => r.id === 'bed1')!.net).toBeCloseTo(Number(kept), 1)
    expect(rooms.find((r) => r.id === 'den')!.net).toBeCloseTo(Number(taken), 1)
    expect(reply.text).not.toContain('has no window now')
  })

  it('checks whether the remaining room keeps a patterned window', async () => {
    const raw = JSON.parse(readFileSync(resolve(b.folder, 'pair.json'), 'utf8')) as {
      rooms: { id: string; boundary: string[] }[]
      walls: { id: string; start: number[]; end: number[] }[]
    }
    const west = raw.rooms.find((r) => r.id === 'west')!
    const north = raw.walls.find(({ id, start, end }) => west.boundary.includes(id) && start[1] === end[1] && start[1]! > 3)!
    const margins = north.start[0]! < north.end[0]! ? { start: 0, end: 4 } : { start: 4, end: 0 }
    const pattern = { id: 'north-row', wall: north.id, opening: { type: 'window', width: 0.8, height: 1.2, sill: 0.9 }, count: 1, margins }
    b.write('patterned.json', { ...raw, patterns: [pattern] })
    const reply = await b.call('grid_split_room', { plan: 'patterned.json', room: 'west', side: 'west', size: 1.1, new_room: 'store', new_name: 'Store', out: 'pattern-split.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toContain('has no window now')
    const after = JSON.parse(readFileSync(resolve(b.folder, 'pattern-split.json'), 'utf8')) as { patterns: unknown[] }
    expect(after.patterns).toEqual([pattern])
  })

  it('reports both measured areas when splitting an outdoor courtyard', async () => {
    const rooms = `plan "Courtyard"
walls outside 0.3 inside 0.1 height 2.6

room court "Courtyard" - 6 x 6 at 0.15,0.15 outdoor courtyard edge wall
`
    const written = await b.call('grid_write_rooms', { plan: 'court.json', rooms })
    expect(written.isError, written.text).toBe(false)
    const reply = await b.call('grid_split_room', { plan: 'court.json', room: 'court', side: 'west', size: 26 / 15, new_room: 'yard', new_name: 'Yard', door_width: 0, out: 'court-split.json' })
    expect(reply.isError, reply.text).toBe(false)
    const areas = await b.call('grid_areas', { plan: 'court-split.json' })
    const byId = (areas.data!['floors'] as { rooms: { id: string; net: number }[] }[])[0]!.rooms
    const kept = byId.find((r) => r.id === 'court')!.net
    const added = byId.find((r) => r.id === 'yard')!.net
    expect(kept).toBeGreaterThan(24)
    expect(added).toBeGreaterThan(9)
    expect(reply.text).toContain(`"Courtyard": 36.00 → ${kept.toFixed(2)} m²; new room "Yard": ${added.toFixed(2)} m².`)
    expect(areas.data!['net']).toBe(0)
  })
})

describe('WRT-11: the verdict counts things', () => {
  it('says one rename is one room renamed', async () => {
    const reply = await b.call('grid_rename_room', { plan: 'flat.json', room: 'living', name: 'Lounge', out: 'rename.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data!['verdict']).toContain('1 room renamed')
    expect(reply.data!['verdict']).not.toContain('2 rooms')
  })

  it('counts rooms by floor on a building of 46 floors with the same names on each', { timeout: 60_000 }, async () => {
    const reply = await b.call('grid_stretch', { plan: 'tower.json', side: 'north', by: 1, out: 'tower2.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data!['verdict']).toContain('92 rooms (2 on each of 46 floors)')
  })

  it('gives the net grid_areas gives, on a plan with a column', async () => {
    const raw = JSON.parse(readFileSync(resolve(b.folder, 'flat.json'), 'utf8')) as Record<string, unknown>
    raw['columns'] = [{ id: 'c1', shape: 'square', width: 0.6, at: [2, 2] }]
    b.write('col.json', raw)
    const reply = await b.call('grid_stretch', { plan: 'col.json', side: 'north', by: 0.5, out: 'col2.json' })
    expect(reply.isError, reply.text).toBe(false)
    const before = await b.call('grid_areas', { plan: 'col.json' })
    const after = await b.call('grid_areas', { plan: 'col2.json' })
    const net = (r: { data?: Record<string, unknown> }): string => (r.data!['net'] as number).toFixed(2)
    expect(reply.data!['verdict']).toContain(`net ${net(before)} m² → ${net(after)} m²`)
  })

  it('says a door that swings the other way is one opening changed, in a building that reads the same mirrored', async () => {
    const reply = await b.call('grid_change_opening', { plan: 'pair.json', opening: 'door-mid', opens_into: 'west', out: 'swing.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data!['verdict']).toContain('1 opening changed')
    expect(reply.data!['verdict']).toContain('"door-mid" now opens into "West room" (it opened into "East room")')
    expect(reply.data!['verdict']).not.toMatch(/mirrored|turned/)
  })

  it('says a mirror is a mirror', async () => {
    const reply = await b.call('grid_mirror', { plan: 'flat.json', how: 'left-right', out: 'mirror.json' })
    expect(reply.data!['verdict']).toContain('mirrored left to right')
  })

  it('turns a plan stated finer than a millimetre a quarter round with every wall the same length (VEW-22)', async () => {
    // Sizes to a tenth of a millimetre: the middle of the walls' box falls on half a millimetre.
    const box = (w: number, d: number) => ({
      version: '1', units: 'm',
      walls: [
        { id: 's', start: [-0.15, -0.15], end: [w, -0.15], thickness: 0.3, height: 2.6, kind: 'exterior' },
        { id: 'e', start: [w, -0.15], end: [w, d], thickness: 0.3, height: 2.6, kind: 'exterior' },
        { id: 'n', start: [w, d], end: [-0.15, d], thickness: 0.3, height: 2.6, kind: 'exterior' },
        { id: 'w', start: [-0.15, d], end: [-0.15, -0.15], thickness: 0.3, height: 2.6, kind: 'exterior' },
      ],
      rooms: [{ id: 'r', name: 'Living', boundary: ['s', 'e', 'n', 'w'] }],
      openings: [],
    })
    b.write('fine.json', box(7.789, 3.3845))
    for (const turn of [90, 180, 270]) {
      const reply = await b.call('grid_mirror', { plan: 'fine.json', turn, out: `fine-${turn}.json` })
      expect(reply.isError, reply.text).toBe(false)
      const before = JSON.parse(readFileSync(resolve(b.folder, 'fine.json'), 'utf8')) as { walls: { start: number[]; end: number[] }[] }
      const after = JSON.parse(readFileSync(resolve(b.folder, `fine-${turn}.json`), 'utf8')) as { walls: { start: number[]; end: number[] }[] }
      const len = (w: { start: number[]; end: number[] }): number => Math.hypot(w.end[0]! - w.start[0]!, w.end[1]! - w.start[1]!)
      before.walls.forEach((wall, i) => expect(len(after.walls[i]!), `turn ${turn}`).toBeCloseTo(len(wall), 6))
    }
    const reply = await b.call('grid_mirror', { plan: 'fine.json', how: 'top-bottom', out: 'fine-m.json' })
    expect(reply.isError, reply.text).toBe(false)
    const mirrored = JSON.parse(readFileSync(resolve(b.folder, 'fine-m.json'), 'utf8')) as { walls: { start: number[]; end: number[] }[] }
    expect(Math.abs(mirrored.walls[1]!.end[1]! - mirrored.walls[1]!.start[1]!)).toBeCloseTo(3.5345, 6)
  })

  it('says writing the same rooms again is the same building when the file keeps a column', async () => {
    const raw = JSON.parse(readFileSync(resolve(b.folder, 'flat.json'), 'utf8')) as Record<string, unknown>
    raw['columns'] = [{ id: 'c1', shape: 'square', width: 0.6, at: [2, 2] }]
    b.write('rewrite.json', raw)
    const before = await b.call('grid_areas', { plan: 'rewrite.json' })
    const back = await b.call('grid_describe', { plan: 'rewrite.json', as: 'rooms' })
    expect(back.isError, back.text).toBe(false)
    const again = await b.call('grid_write_rooms', { plan: 'rewrite.json', rooms: back.text })
    expect(again.isError, again.text).toBe(false)
    expect(again.data!['verdict']).toContain('same building')
    const after = await b.call('grid_areas', { plan: 'rewrite.json' })
    expect(after.data!['net']).toBe(before.data!['net'])
  })
})
