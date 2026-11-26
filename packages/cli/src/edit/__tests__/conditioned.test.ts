/**
 * ARE-60: grid_rename_room says whether a room is heated or cooled, so in the living area under
 * air, and states it in the plan only where the room's use would not give it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const HOUSE = compileRoomsText([
  'walls outside 0.3 inside 0.1 height 2.7',
  'room living "Living" living 6 x 5 at 0,0',
  'room garage "Garage" parking 3 x 5 east of living',
  'room lanai "Lanai" - 6 x 3 north of living',
  'room porch "Porch" - 6 x 2 south of living outdoor porch',
].join('\n')).plan

let b: Bench | undefined
afterAll(() => b?.close())

async function rename(steps: readonly Record<string, unknown>[]): Promise<{ texts: string[]; errors: boolean[]; rooms: Map<string, boolean | undefined> }> {
  b?.close()
  b = bench({ 'p.json': HOUSE })
  const texts: string[] = []
  const errors: boolean[] = []
  for (const step of steps) {
    const reply = await b.call('grid_rename_room', { plan: 'p.json', ...step })
    texts.push(reply.text)
    errors.push(reply.isError === true)
  }
  const plan = parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'p.json'), 'utf8')))
  return { texts, errors, rooms: new Map(plan.rooms.map((room) => [room.id, room.conditioned] as const)) }
}

describe('grid_rename_room with conditioned (ARE-60)', () => {
  it('takes a lanai out of the area under air and says so', async () => {
    const done = await rename([{ room: 'lanai', conditioned: 'no' }])
    expect(done.errors).toEqual([false])
    expect(done.rooms.get('lanai')).toBe(false)
    expect(done.texts[0]).toContain('"Lanai" is not heated or cooled now')
  })

  it('puts a heated garage in, and back out by its use with no key left', async () => {
    const done = await rename([{ room: 'garage', conditioned: 'yes' }, { room: 'garage', conditioned: 'no' }])
    expect(done.errors).toEqual([false, false])
    expect(done.texts[0]).toContain('"Garage" is heated or cooled now')
    expect(done.rooms.get('garage')).toBeUndefined()
  })

  it('keeps a garage made a bedroom out when asked, and says a use change that moves it', async () => {
    const kept = await rename([{ room: 'garage', use: 'bedroom', conditioned: 'no' }])
    expect(kept.rooms.get('garage')).toBe(false)
    const moved = await rename([{ room: 'garage', use: 'bedroom' }])
    expect(moved.rooms.get('garage')).toBeUndefined()
    expect(moved.texts[0]).toContain('"Garage" is heated or cooled now')
  })

  it('refuses outdoor space, and a change that changes nothing', async () => {
    const done = await rename([{ room: 'porch', conditioned: 'yes' }, { room: 'living', conditioned: 'yes' }])
    expect(done.errors).toEqual([true, true])
    expect(done.texts[0]).toContain('is outdoor space, which is never under air')
    expect(done.texts[1]).toContain('nothing to change')
  })
})
