/**
 * WRT-30 (C26): a split keeps the outdoor and roofed marks on both halves, so the new part of an
 * open courtyard is not counted as floor inside the building.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

let b: Bench | undefined
afterAll(() => b?.close())

async function split(marks: Record<string, unknown>): Promise<FloorPlan> {
  b?.close()
  const plan = factsOffice() as { rooms: Array<Record<string, unknown>> }
  const room = plan.rooms.find((r) => r.id === 'g-reception')!
  Object.assign(room, marks)
  b = bench({ 'p.json': plan })
  const reply = await b.call('grid_split_room', { plan: 'p.json', room: 'g-reception', side: 'north', size: 2, new_room: 'g-store', new_name: 'Store', door_width: 0 })
  expect(reply.isError, reply.text).toBe(false)
  return parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'p.json'), 'utf8')))
}
const pick = (plan: FloorPlan, id: string) => {
  const r = plan.rooms.find((x) => x.id === id)!
  return { outdoor: r.outdoor, roofed: r.roofed }
}

describe('a split keeps the outdoor and roofed marks (WRT-30)', () => {
  it('marks both halves of an open courtyard outdoor and open', async () => {
    const plan = await split({ outdoor: 'courtyard', roofed: false })
    expect(pick(plan, 'g-reception')).toEqual({ outdoor: 'courtyard', roofed: false })
    expect(pick(plan, 'g-store')).toEqual({ outdoor: 'courtyard', roofed: false })
  })

  it('marks both halves of a roofed porch roofed', async () => {
    const plan = await split({ outdoor: 'porch', roofed: true })
    expect(pick(plan, 'g-store')).toEqual({ outdoor: 'porch', roofed: true })
  })

  it('keeps an outdoor space that states no roofed mark as it was', async () => {
    const plan = await split({ outdoor: true })
    expect(pick(plan, 'g-store')).toEqual({ outdoor: true, roofed: undefined })
  })

  it('gives a room that is not outdoor neither mark', async () => {
    const plan = await split({})
    expect(pick(plan, 'g-store')).toEqual({ outdoor: undefined, roofed: undefined })
  })
})
