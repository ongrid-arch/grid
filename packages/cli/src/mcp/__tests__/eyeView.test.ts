/**
 * VEW-30: the eye view stands on the room's own floor, in its middle. A room on an upper floor
 * with a floor offset has its eye measured from that floor, and a stated point is stood on.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const house = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/two-storey.plan.json'), 'utf8')) as {
  rooms: { id: string; floorOffset?: number }[]
}
const raised = JSON.parse(JSON.stringify(house)) as typeof house
raised.rooms.find((r) => r.id === 'f-bed')!.floorOffset = 0.45

let b: Bench
beforeAll(() => {
  b = bench({ 'house.json': house, 'raised.json': raised })
})
afterAll(() => b.close())

const eye = async (plan: string, extra: Record<string, unknown> = {}) => b.call('grid_view', { plan, kind: 'eye', room: 'f-bed', ...extra })
const zOf = (reply: { data?: Record<string, unknown> }): number => (reply.data!['camera'] as { position: number[] }).position[2]!

describe('kind=eye on the room\'s own floor', () => {
  it('measures the eye from the floor offset as well as the storey level', async () => {
    const plain = await eye('house.json')
    const high = await eye('raised.json')
    expect(plain.isError, plain.text).toBe(false)
    expect(high.isError, high.text).toBe(false)
    expect(zOf(high) - zOf(plain)).toBeCloseTo(0.45, 6)
    const camera = high.data!['camera'] as { standingIn: { room: string | null } }
    expect(camera.standingIn.room).toBe('f-bed')
  })

  it('stands where it is told, inside the room, and refuses a point outside it', async () => {
    const first = await eye('house.json')
    const [x, y] = (first.data!['camera'] as { position: number[] }).position as [number, number]
    const there = await eye('house.json', { stand_at: { x: x + 0.2, y } })
    expect(there.isError, there.text).toBe(false)
    const position = (there.data!['camera'] as { position: number[] }).position
    expect(position[0]).toBeCloseTo(x + 0.2, 6)
    expect(position[1]).toBeCloseTo(y, 6)
    const outside = await eye('house.json', { stand_at: { x: x + 500, y } })
    expect(outside.isError).toBe(true)
    expect(outside.text).toMatch(/stand_at/)
  })
})
