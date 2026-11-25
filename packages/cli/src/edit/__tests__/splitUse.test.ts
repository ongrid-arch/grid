/**
 * WRT-49: a split gives the new room the use of the room it came from unless another is named,
 * and says so.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

let b: Bench | undefined
afterAll(() => b?.close())

async function split(use: string | undefined, args: Record<string, unknown> = {}): Promise<{ plan: FloorPlan; text: string }> {
  b?.close()
  const plan = factsOffice() as { rooms: Array<Record<string, unknown>> }
  const room = plan.rooms.find((r) => r.id === 'g-reception')!
  if (use === undefined) delete room.use
  else room.use = use
  b = bench({ 'p.json': plan })
  const reply = await b.call('grid_split_room', { plan: 'p.json', room: 'g-reception', side: 'north', size: 2, new_room: 'g-store', new_name: 'Store', door_width: 0, ...args })
  expect(reply.isError, reply.text).toBe(false)
  return { plan: parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'p.json'), 'utf8'))), text: reply.text }
}
const use = (plan: FloorPlan, id: string) => plan.rooms.find((r) => r.id === id)!.use

describe('a split gives the new room the room\'s use (WRT-49)', () => {
  it('takes the use of the room it came from and says so', async () => {
    const { plan, text } = await split('office')
    expect(use(plan, 'g-store')).toBe('office')
    expect(use(plan, 'g-reception')).toBe('office')
    expect(text).toMatch(/takes the use of/)
  })

  it('takes the use the room had when the call gives the room another', async () => {
    const { plan } = await split('office', { use: 'meeting' })
    expect(use(plan, 'g-reception')).toBe('meeting')
    expect(use(plan, 'g-store')).toBe('office')
  })

  it('keeps the use the call names for the new room, with no line about it', async () => {
    const { plan, text } = await split('office', { new_use: 'storage' })
    expect(use(plan, 'g-store')).toBe('storage')
    expect(text).not.toMatch(/takes the use of/)
  })

  it('gives a room with no use a new room with none', async () => {
    const { plan, text } = await split(undefined)
    expect(use(plan, 'g-store')).toBeUndefined()
    expect(text).not.toMatch(/takes the use of/)
  })
})
