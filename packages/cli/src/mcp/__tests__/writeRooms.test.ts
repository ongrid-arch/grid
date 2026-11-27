import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INSTRUCTIONS } from '../protocol'
import { bench, type Bench } from './replay/harness'

/**
 * `grid_write_rooms` and `grid_describe as=rooms` (WRT-2): the way an agent writes a plan, and
 * reads one back to change it. Grid's own edits in between keep the derived parts derived, and
 * rooms text that would undo them is refused with the difference.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')

describe('writing a plan rooms first through the tool server', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({})
  })
  afterAll(() => b.close())

  it('names rooms-first as the main way to write, and the plan file as the source of truth', () => {
    expect(INSTRUCTIONS).toContain('Write a plan rooms first, the main way to write one')
    expect(INSTRUCTIONS).toContain('The plan file is the source of truth; rooms text is a way of writing and reading it.')
    // WRT-7: the person's units, from their words or their place, asked only when neither says.
    expect(INSTRUCTIONS).toContain("Work in the person's units")
    expect(INSTRUCTIONS).toContain('ask only when neither says')
  })

  it('writes, reads back, survives a Grid edit, and refuses the old text with the difference', async () => {
    const wrote = await b.call('grid_write_rooms', { plan: 'flat.json', rooms: FLAT })
    expect(wrote.isError, wrote.text).toBe(false)
    expect(wrote.data).toMatchObject({ written: 'flat.json', walls: 9, openings: 13 })

    const back = await b.call('grid_describe', { plan: 'flat.json', as: 'rooms' })
    expect(back.isError).toBe(false)
    expect(back.text).toMatch(/^based on [0-9a-f]{16}$/m)

    // One of Grid's own edits: the kitchen 0.5 m deeper. Its boundaries stay derived.
    const moved = await b.call('grid_move_room_side', { plan: 'flat.json', room: 'kitchen', side: 'north', by: 0.5 })
    expect(moved.isError, moved.text).toBe(false)
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.text).not.toContain('changed by hand')

    // The text read before the edit would undo it: refused, with what would change.
    const stale = await b.call('grid_write_rooms', { plan: 'flat.json', rooms: back.text })
    expect(stale.isError).toBe(true)
    expect(stale.text).toContain('read from another version of flat.json')
    expect(stale.text).toContain('grid_describe as=rooms')
    expect(stale.text).toContain('replace=true')

    // Read back again, it writes back the edit as it is.
    const fresh = await b.call('grid_describe', { plan: 'flat.json', as: 'rooms' })
    const again = await b.call('grid_write_rooms', { plan: 'flat.json', rooms: fresh.text })
    expect(again.isError, again.text).toBe(false)
    expect(again.data).toMatchObject({ verdict: expect.stringContaining('is the same building as the plan before') })
    const plan = JSON.parse(readFileSync(join(b.folder, 'flat.json'), 'utf8')) as { rooms: { id: string }[] }
    expect(plan.rooms.map((r) => r.id)).toEqual(['living', 'kitchen', 'bed1', 'hall', 'bath', 'bed2'])
  })

  it('reports the drawing origin and the site reference kept in the plan', async () => {
    const plain = await b.call('grid_write_rooms', { plan: 'origin.json', rooms: FLAT })
    expect(plain.isError, plain.text).toBe(false)
    expect(plain.data?.['origin']).toMatchObject({ drawing: [0, 0], wallBoundsCorner: [expect.any(Number), expect.any(Number)], site: null })
    expect(plain.text).toContain('The drawing origin is (0, 0) m on every floor')
    const anchored = await b.call('grid_write_rooms', { plan: 'site-origin.json', rooms: `${FLAT}\nsite origin 21,-17\n` })
    expect(anchored.isError, anchored.text).toBe(false)
    expect(anchored.data?.['origin']).toMatchObject({ drawing: [0, 0], site: [21, -17] })
    expect(anchored.text).toContain('The site reference point is at (21, -17) m')
  })

  it('keeps the boundaries derived through a mirror, which turns every one round', async () => {
    await b.call('grid_write_rooms', { plan: 'mirror.json', rooms: FLAT })
    const before = JSON.parse(readFileSync(join(b.folder, 'mirror.json'), 'utf8')) as { rooms: { boundary: string[] }[] }
    const mirrored = await b.call('grid_mirror', { plan: 'mirror.json', how: 'left-right' })
    expect(mirrored.isError, mirrored.text).toBe(false)
    const after = JSON.parse(readFileSync(join(b.folder, 'mirror.json'), 'utf8')) as { rooms: { boundary: string[] }[] }
    expect(after.rooms.map((r) => r.boundary.join())).not.toEqual(before.rooms.map((r) => r.boundary.join()))
    const check = await b.call('grid_check', { plan: 'mirror.json' })
    expect(check.text).not.toContain('changed by hand')
  })

  it('refuses rooms text with every problem listed, writing nothing', async () => {
    const reply = await b.call('grid_write_rooms', { plan: 'bad.json', rooms: 'room a "A" lounge 3 x 3\n' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("rooms/unknown-use: Line 1: 'lounge' is not a room use Grid knows")
  })
})
