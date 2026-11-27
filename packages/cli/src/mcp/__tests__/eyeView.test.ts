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

/**
 * VEW-75: the eye camera stands anywhere, with a lens and a tilt: at a door, an item or a corner,
 * looking at an item or a point, in a one-point or two-point perspective, never inside a fixture,
 * and in a small room from its doorway, looking diagonally across.
 */
const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.plan.json'), 'utf8')) as Record<string, unknown>
const furnished = { ...flat, items: [{ id: 'sofa-1', kind: 'sofa', at: [2.3, 1.2], size: [2, 0.9], height: 0.8 }] }

type Camera = { position: number[]; direction: number[]; tilt: number; lens: { focalLength: number }; standingIn: { room: string | null } }
const cam = (reply: { data?: Record<string, unknown> }): Camera => reply.data!['camera'] as Camera
/** Degrees the line of sight is off square to the plan's axes, 0 to 45. */
const offSquare = (c: Camera): number => {
  const a = Math.abs((Math.atan2(c.direction[0]!, c.direction[1]!) * 180) / Math.PI) % 90
  return Math.min(a, 90 - a)
}

describe('kind=eye stands anywhere, with a lens and a tilt', () => {
  let f: Bench
  beforeAll(() => {
    f = bench({ 'flat.json': flat, 'furnished.json': furnished })
  })
  afterAll(() => f.close())
  const look = async (extra: Record<string, unknown>, plan = 'flat.json') => f.call('grid_view', { plan, kind: 'eye', ...extra })

  it('takes a lens and a tilt, the eye staying where it stands', async () => {
    const level = await look({ room: 'bed1' })
    const tilted = await look({ room: 'bed1', lens: 35, tilt: 10 })
    expect(tilted.isError, tilted.text).toBe(false)
    expect(cam(tilted).lens.focalLength).toBe(35)
    expect(cam(tilted).tilt).toBe(10)
    expect(cam(tilted).position[2]).toBeCloseTo(cam(level).position[2]!, 5)
    expect(cam(tilted).direction[2]).toBeLessThan(0)
    expect(tilted.text).toMatch(/lens 35 mm, 54° across/)
    expect(tilted.text).toMatch(/looking 10° down/)
  })

  it('stands in a doorway and looks across to the far corner', async () => {
    const reply = await look({ room: 'bed1', at: 'door-bed1' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/in the doorway of door "door-bed1"/)
    expect(reply.text).toMatch(/far corner of the room, diagonally across/)
    expect(cam(reply).standingIn.room).toBe('bed1')
    expect(offSquare(cam(reply))).toBeGreaterThan(15)
  })

  it('stands in a corner of the room, clear of its walls', async () => {
    const reply = await look({ room: 'bed1', at: 'south-west' })
    expect(reply.isError, reply.text).toBe(false)
    const [x, y] = cam(reply).position as [number, number]
    expect(x).toBeLessThan(5.3)
    expect(y).toBeLessThan(0.8)
    expect(cam(reply).standingIn.room).toBe('bed1')
  })

  it('stands in front of an item, and looks at an item or a point', async () => {
    const front = await look({ room: 'living', at: 'sofa-1' }, 'furnished.json')
    expect(front.isError, front.text).toBe(false)
    expect(front.text).toMatch(/in front of "Sofa"|in front of "sofa/i)
    const [x, y] = cam(front).position as [number, number]
    expect(Math.hypot(x - 2.3, y - 1.2)).toBeCloseTo(0.95, 2)
    const atItem = await look({ room: 'living', stand_at: { x: 3.5, y: 3.5 }, toward: 'sofa-1' }, 'furnished.json')
    expect(atItem.isError, atItem.text).toBe(false)
    const d = cam(atItem).direction
    expect(Math.atan2(d[1]!, d[0]!)).toBeCloseTo(Math.atan2(1.2 - 3.5, 2.3 - 3.5), 4)
    const atPoint = await look({ room: 'living', stand_at: { x: 1, y: 1 }, look_at: { x: 4, y: 4 } }, 'furnished.json')
    expect(atPoint.isError, atPoint.text).toBe(false)
    expect(cam(atPoint).direction[0]).toBeCloseTo(cam(atPoint).direction[1]!, 6)
  })

  it('offers a two-point and a one-point perspective, level', async () => {
    const two = await look({ room: 'bed1', toward: 'south', perspective: 'two-point' })
    expect(two.isError, two.text).toBe(false)
    expect(offSquare(cam(two))).toBeCloseTo(25, 4)
    expect(two.text).toMatch(/Two-point perspective/)
    expect(two.text).toMatch(/turned 25°/)
    const one = await look({ room: 'bed1', toward: 'south-east', perspective: 'one-point' })
    expect(one.isError, one.text).toBe(false)
    expect(offSquare(cam(one))).toBeCloseTo(0, 4)
    const tilted = await look({ room: 'bed1', perspective: 'two-point', tilt: 5 })
    expect(tilted.isError).toBe(true)
    expect(tilted.text).toMatch(/leave tilt out/)
  })

  it('keeps the camera out of fixtures', async () => {
    const first = await look({ room: 'kitchen' })
    const [x, y] = cam(first).position as [number, number]
    const run = { ...flat, items: [{ id: 'run-1', kind: 'kitchen-run', at: [x, y], size: [2.4, 0.6], height: 0.9 }] }
    const g = bench({ 'run.json': run })
    try {
      const moved = await g.call('grid_view', { plan: 'run.json', kind: 'eye', room: 'kitchen' })
      expect(moved.isError, moved.text).toBe(false)
      expect(moved.text).toMatch(/m clear of /)
      const [mx, my] = cam(moved).position as [number, number]
      expect(Math.abs(my - y) > 0.3 + 0.2 - 1e-6 || Math.abs(mx - x) > 1.2 + 0.2 - 1e-6).toBe(true)
      const inside = await g.call('grid_view', { plan: 'run.json', kind: 'eye', room: 'kitchen', stand_at: { x, y } })
      expect(inside.isError).toBe(true)
      expect(inside.text).toMatch(/stand_at .* is inside or against/)
    } finally {
      g.close()
    }
  })

  it('stands in a small room\'s doorway and looks diagonally across', async () => {
    const reply = await look({ room: 'bath' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/in the doorway of door "door-bath", as the room is small/)
    expect(reply.text).toMatch(/far corner/)
    expect(cam(reply).standingIn.room).toBe('bath')
    expect(offSquare(cam(reply))).toBeGreaterThan(10)
  })

  it('refuses from, naming at', async () => {
    const reply = await look({ room: 'bed1', from: 'south' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/at says where to stand/)
  })
})
