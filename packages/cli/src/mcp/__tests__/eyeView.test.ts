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

/** VEW-78: a room whose only glazing is a glazed sliding door, and one whose door is not marked glazed. */
const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7 })
const slider = (doorType?: string) => ({
  version: '1',
  units: 'm',
  ...(doorType === undefined ? {} : { types: { doors: [{ id: doorType, name: 'Glazed slider', kind: 'sliding', glazed: true }] } }),
  walls: [wall('s', [0, 0], [9, 0]), wall('e', [9, 0], [9, 5]), wall('n', [9, 5], [0, 5]), wall('w', [0, 5], [0, 0])],
  rooms: [{ id: 'living', name: 'Living room', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'patio', wall: 's', type: 'door', kind: 'sliding', offset: 0.3, width: 8.4, height: 2.4, ...(doorType === undefined ? {} : { doorType }) }],
})

let b: Bench
beforeAll(() => {
  b = bench({ 'house.json': house, 'raised.json': raised, 'glazed.json': slider('slider'), 'plain.json': slider() })
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

describe('kind=eye and glazing (VEW-78)', () => {
  it('lists a glazed door with the windows and never says the room has none', async () => {
    const reply = await b.call('grid_view', { plan: 'glazed.json', kind: 'eye', room: 'living' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).not.toMatch(/has no windows/)
    expect(reply.text).toMatch(/glazed door "patio" sill 0/)
    expect(reply.data!['sills']).toEqual([{ id: 'patio', type: 'door', sill: 0, top: 2.4, seenOver: true }])
    expect(reply.text).toMatch(/glass is see-through/)
  })

  it('says how to mark a door glazed when none is', async () => {
    const reply = await b.call('grid_view', { plan: 'plain.json', kind: 'eye', room: 'living' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/no windows and no glazed door/)
    expect(reply.text).toMatch(/grid_change_type with glazed true/)
    expect(reply.data!['sills']).toEqual([])
  })
})
