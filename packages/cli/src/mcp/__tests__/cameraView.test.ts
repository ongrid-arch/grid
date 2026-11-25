/**
 * VEW-3 (lab SE-4, SE-7, S-16): a camera an agent can set, saved as a named view.
 *
 * 1. A view call with a bearing, a tilt, an eye height and a target room returns the picture and
 *    its camera record, and "lower and more from the left" is one call (SE-4), on three of the
 *    lab's buildings: the bench's two-bed flat, the two-storey house and the odd house.
 * 2. A view saved by name and called up again gives the same record, byte for byte.
 * 3. A camera outside every room says so (S-16).
 */
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const fixture = (path: string): unknown => JSON.parse(readFileSync(resolve(__dirname, path), 'utf8'))

/** The three buildings, each with a room on its ground floor to point the camera at. */
const BUILDINGS = [
  { name: 'the two-bed flat', file: 'flat.json', plan: fixture('../../../fixtures/two-bed-flat.json'), room: 'lounge', floors: 1 },
  { name: 'the two-storey house', file: 'house.json', plan: fixture('../../../../floorplan/fixtures/rooms/two-storey.plan.json'), room: 'g-living', floors: 2 },
  { name: 'the odd house', file: 'odd.json', plan: fixture('../../../../floorplan/fixtures/rooms/odd-house.plan.json'), room: 'g-kitchen', floors: 2 },
] as const

type Point = [number, number, number]
interface Camera {
  target: { room: string | null; point: Point }
  bearing: number
  bearingFrom: string
  north: number | null
  tilt: number
  distance: number
  eyeHeight: number
  floor: string
  lens: { focalLength: number; sensor: { width: number; height: number } }
  cut: string | null
  floors: string[]
  standingIn: { room: string | null; name: string | null; floor: string | null; words: string }
  position: Point
  direction: Point
  up: Point
  fieldOfView: number
  aspectRatio: number
}

const cameraOf = (reply: { data: Record<string, unknown> | undefined }): Camera => reply.data!['camera'] as Camera

let b: Bench
beforeAll(() => {
  b = bench(Object.fromEntries(BUILDINGS.map((building) => [building.file, building.plan])))
})
afterAll(() => b.close())

async function ok(name: string, args: Record<string, unknown>) {
  const reply = await b.call(name, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('a view call with a bearing, a tilt, an eye height and a target room (SE-4)', () => {
  for (const building of BUILDINGS) {
    describe(building.name, () => {
      it('returns the picture and the camera record it was taken with', async () => {
        const reply = await ok('grid_view', { plan: building.file, kind: '3d', room: building.room, bearing: 200, tilt: 25, eye_height: 6 })
        expect(reply.image).toBe(true)
        const camera = cameraOf(reply)
        expect(camera.target.room).toBe(building.room)
        expect(camera.bearing).toBe(200)
        expect(camera.bearingFrom).toBe('plan up')
        expect(camera.tilt).toBe(25)
        expect(camera.eyeHeight).toBe(6)
        expect(camera.floor).toBe('ground')
        // The camera stands back along its bearing until it is 6 m up, looking 25 degrees down at the room.
        expect(camera.distance).toBeCloseTo((camera.position[2] - camera.target.point[2]) / Math.sin((25 * Math.PI) / 180), 4)
        expect(camera.lens.sensor).toEqual({ width: 36, height: 24 })
        expect(camera.fieldOfView).toBe(45)
        // On a house of two floors the room is seen with its floor cut away.
        expect(camera.cut).toBe(building.floors > 1 ? 'ground' : null)
        expect(camera.floors).toEqual(['ground'])
        expect(reply.text).toContain('from bearing 200°')
        expect(reply.text).toContain('clockwise from the top of the drawing, as the plan states no north')
        expect(reply.text).toContain('the eye 6.00 m above floor "ground"')
      })

      it('makes "lower and more from the left" one call, from the last camera record', async () => {
        const first = cameraOf(await ok('grid_view', { plan: building.file, kind: '3d', room: building.room, bearing: 200, tilt: 25, eye_height: 6 }))
        const reply = await ok('grid_view', { plan: building.file, kind: '3d', camera: first, turn: 20, tilt_by: -10 })
        expect(reply.image).toBe(true)
        const next = cameraOf(reply)
        expect(next.target).toEqual(first.target)
        expect(next.distance).toBe(first.distance)
        expect(next.bearing).toBe(220)
        expect(next.tilt).toBe(15)
        // Lower,
        expect(next.position[2]).toBeLessThan(first.position[2])
        expect(next.eyeHeight).toBeLessThan(first.eyeHeight)
        // and further to the left of where the first camera stood, as it looked.
        const left = [-first.direction[1], first.direction[0]]
        expect((next.position[0] - first.position[0]) * left[0]! + (next.position[1] - first.position[1]) * left[1]!).toBeGreaterThan(0)
        // Sending the record back with the numbers changed is the same one call, and the same camera.
        const resent = cameraOf(await ok('grid_view', { plan: building.file, kind: '3d', camera: { ...first, bearing: first.bearing + 20, tilt: first.tilt - 10 } }))
        expect(JSON.stringify(resent)).toBe(JSON.stringify(next))
      })
    })
  }

  it('reads a bearing from the north the plan states, and a named corner from the drawing', async () => {
    b.write('north.json', { ...(BUILDINGS[0].plan as Record<string, unknown>), north: 90 })
    const compass = cameraOf(await ok('grid_view', { plan: 'north.json', kind: '3d', room: 'lounge', bearing: 90, tilt: 20 }))
    expect(compass.bearingFrom).toBe('north')
    expect(compass.north).toBe(90)
    // North points to -x, so east, bearing 90, is up the drawing: the camera stands north of the room on the drawing.
    expect(compass.position[1]).toBeGreaterThan(compass.target.point[1])
    expect(Math.abs(compass.position[0] - compass.target.point[0])).toBeLessThan(1e-6)
    const corner = cameraOf(await ok('grid_view', { plan: 'north.json', kind: '3d', room: 'lounge', from: 'south-east', tilt: 20 }))
    // The south-east corner of the drawing is +x, -y of the room, whatever north the plan states.
    expect(corner.position[0]).toBeGreaterThan(corner.target.point[0])
    expect(corner.position[1]).toBeLessThan(corner.target.point[1])
    expect(corner.bearing).toBe(225)
  })

  it('gives every picture its record, the eye view and the default 3d view too', async () => {
    const eye = await ok('grid_view', { plan: 'flat.json', kind: 'eye', room: 'lounge', eye_height: 1.2 })
    const camera = cameraOf(eye)
    expect(camera.tilt).toBe(0)
    expect(camera.eyeHeight).toBe(1.2)
    expect(camera.lens.focalLength).toBe(18)
    expect(camera.fieldOfView).toBeCloseTo(67.38, 2)
    const whole = cameraOf(await ok('grid_view', { plan: 'house.json', kind: '3d' }))
    expect(whole.target.room).toBeNull()
    expect(whole.bearing).toBe(135)
    expect(whole.tilt).toBe(30)
    expect(whole.cut).toBeNull()
    expect(whole.floors).toEqual(['ground', 'first'])
  })

  it('refuses a camera it cannot set, saying why', async () => {
    const refused = async (args: Record<string, unknown>, why: RegExp) => {
      const reply = await b.call('grid_view', { plan: 'flat.json', kind: '3d', ...args })
      expect(reply.isError, reply.text).toBe(true)
      expect(reply.text).toMatch(why)
    }
    await refused({ bearing: 10, from: 'south' }, /bearing or from, not both/)
    await refused({ tilt: 80, tilt_by: 15 }, /at most 89 degrees from level/)
    await refused({ room: 'lounge', tilt: -10, eye_height: 6 }, /cannot look up at it from there/)
    await refused({ view: 'nowhere' }, /no view saved under that name\. It has no saved views/)
    await refused({ camera: { bearing: 1 } }, /camera\.target takes an object/)
    await refused({ lens: 2 }, /lens takes a number from 8 to 800/)
  })
})

describe('a view saved by name (SE-7)', () => {
  for (const building of BUILDINGS) {
    it(`is called up again as the same record, byte for byte, on ${building.name}`, async () => {
      const taken = await ok('grid_view', { plan: building.file, kind: '3d', room: building.room, bearing: 160, tilt: 35, distance: 18, lens: 35 })
      const camera = cameraOf(taken)
      const saved = await ok('grid_save_view', { plan: building.file, name: 'Garden corner', camera })
      expect(saved.text).toContain('Saved the view "Garden corner" with the plan')
      expect(JSON.stringify(saved.data!['camera'])).toBe(JSON.stringify(camera))
      const called = await ok('grid_view', { plan: building.file, kind: '3d', view: 'garden corner' })
      expect(called.image).toBe(true)
      expect(called.data!['view']).toBe('Garden corner')
      expect(JSON.stringify(cameraOf(called))).toBe(JSON.stringify(camera))

      // The file holds the setting and the BCF camera, in a form other programs can open.
      const file = JSON.parse(readFileSync(join(b.folder, building.file), 'utf8')) as { views: Record<string, unknown>[] }
      expect(file.views).toHaveLength(1)
      const stored = file.views[0]!
      expect(stored).toMatchObject({ name: 'Garden corner', target: { room: building.room }, bearing: 160, bearingFrom: 'plan up', tilt: 35, distance: 18, lens: { focalLength: 35, sensor: { width: 36, height: 24 } } })
      expect(stored['position']).toEqual(camera.position)
      expect(stored['direction']).toEqual(camera.direction)
      expect(stored['up']).toEqual(camera.up)
      expect(stored['fieldOfView']).toBe(camera.fieldOfView)
      expect(stored['aspectRatio']).toBe(1.5)
      // Everything else in the file is as it was.
      const before = building.plan as Record<string, unknown>
      expect(Object.keys(file).filter((key) => key !== 'views')).toEqual(Object.keys(before))
    })
  }

  it('refuses a second view of the same name unless asked to replace it, and takes one out', async () => {
    const camera = cameraOf(await ok('grid_view', { plan: 'flat.json', kind: '3d', from: 'north' }))
    const again = await b.call('grid_save_view', { plan: 'flat.json', name: 'GARDEN CORNER', camera })
    expect(again.isError).toBe(true)
    expect(again.text).toMatch(/already has a view saved as "Garden corner"/)
    await ok('grid_save_view', { plan: 'flat.json', name: 'Garden corner', camera, replace: true })
    expect(JSON.stringify(cameraOf(await ok('grid_view', { plan: 'flat.json', kind: '3d', view: 'Garden corner' })))).toBe(JSON.stringify(camera))
    const gone = await ok('grid_save_view', { plan: 'flat.json', name: 'Garden corner', remove: true })
    expect(gone.text).toContain('Took the view "Garden corner" out of the plan')
    expect('views' in (JSON.parse(readFileSync(join(b.folder, 'flat.json'), 'utf8')) as object)).toBe(false)
  })

  it('is mirrored with the plan, so it frames what it framed', async () => {
    const camera = cameraOf(await ok('grid_view', { plan: 'odd.json', kind: '3d', room: 'g-kitchen', bearing: 120, tilt: 30 }))
    await ok('grid_save_view', { plan: 'odd.json', name: 'Kitchen', camera, replace: true })
    await ok('grid_mirror', { plan: 'odd.json', how: 'left-right', out: 'odd-mirrored.json' })
    const mirrored = cameraOf(await ok('grid_view', { plan: 'odd-mirrored.json', kind: '3d', view: 'Kitchen' }))
    expect(mirrored.target.room).toBe('g-kitchen')
    expect(mirrored.bearing).toBe(240)
    expect(mirrored.tilt).toBe(30)
    expect(mirrored.distance).toBe(camera.distance)
  })
})

describe('a camera outside every room (S-16)', () => {
  it('says "outside any room", and one in a room says which', async () => {
    const outside = await ok('grid_view', { plan: 'flat.json', kind: '3d', room: 'lounge', bearing: 200, tilt: 20 })
    expect(cameraOf(outside).standingIn).toEqual({ room: null, name: null, floor: null, words: 'outside any room' })
    expect(outside.text).toContain('It stands outside any room.')

    const eye = await ok('grid_view', { plan: 'flat.json', kind: 'eye', room: 'lounge' })
    expect(cameraOf(eye).standingIn).toMatchObject({ room: 'lounge', name: 'Living room', floor: 'ground' })
    expect(eye.text).toContain('It stands in "Living room".')

    // The eye view's camera walked back out through the wall: now outside, and it says so.
    const back = await ok('grid_view', { plan: 'flat.json', kind: '3d', camera: cameraOf(eye), distance: 30 })
    expect(cameraOf(back).standingIn.words).toBe('outside any room')
    expect(back.text).toContain('It stands outside any room.')
  })
})

// VEW-19: a still draws the roof the plan's model has, as its GLB and section do.
describe('the roof in a 3d view', () => {
  const flat = BUILDINGS[0].plan as { floors?: unknown[] }
  const gabled = { ...flat, floors: [{ id: 'ground', name: 'Ground floor', level: 0, roof: { shape: 'gable', eaves: 2.6, pitch: 30 } }] }
  let roofed: Bench
  beforeAll(() => {
    roofed = bench({ 'gable.json': gabled, 'flat.json': flat })
  })
  afterAll(() => roofed.close())

  it('draws a stated gable over one storey, and says so', async () => {
    const reply = await roofed.call('grid_view', { plan: 'gable.json', kind: '3d', from: 'south' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('It is drawn with the roof the plan states, a gable roof over "Ground floor"')
    expect(reply.text).not.toContain('no roof')
  })

  it('draws one storey closed from outside, and open with roof=hide or a floor cut away', async () => {
    const closed = await roofed.call('grid_view', { plan: 'flat.json', kind: '3d', from: 'south' })
    expect(closed.text).toContain('Every part with nothing above it has a flat roof')
    const open = await roofed.call('grid_view', { plan: 'gable.json', kind: '3d', from: 'south', roof: 'hide' })
    expect(open.text).toContain('drawn open, without its roof (roof=show draws it)')
    const cut = await roofed.call('grid_view', { plan: 'gable.json', kind: '3d', from: 'south', floor: 'ground' })
    expect(cut.text).toContain('drawn open, without its roof')
    const shown = await roofed.call('grid_view', { plan: 'gable.json', kind: '3d', from: 'south', floor: 'ground', roof: 'show' })
    expect(shown.text).toContain('a gable roof over "Ground floor"')
  })

  it('takes roof for 3d only', async () => {
    const reply = await roofed.call('grid_view', { plan: 'gable.json', kind: 'plan', roof: 'show' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('not roof')
  })
})

/** VEW-26: a plain block of `storeys` floors, `width` by `depth` metres. */
function boxPlan(width: number, depth: number, storeys: number): unknown {
  const floors = Array.from({ length: storeys }, (_, i) => ({ id: `f${i}`, name: `Floor ${i}`, level: i }))
  const corners: Array<[number, number]> = [[0, 0], [width, 0], [width, depth], [0, depth]]
  const walls = floors.flatMap((f) => corners.map((c, i) => ({ id: `${f.id}-w${i}`, start: c, end: corners[(i + 1) % 4]!, thickness: 0.3, height: 3, kind: 'exterior', floor: f.id })))
  const rooms = floors.map((f) => ({ id: `${f.id}-r`, name: `Room ${f.id}`, boundary: [0, 1, 2, 3].map((i) => `${f.id}-w${i}`), use: 'office', floor: f.id }))
  return { version: '1', units: 'm', floors, walls, rooms, openings: [] }
}

describe('a 3D view framed to the building (VEW-26)', () => {
  let framed: Bench
  beforeAll(() => {
    framed = bench({ 'tower.json': boxPlan(12, 12, 30), 'hall.json': boxPlan(120, 14, 1), 'flat.json': fixture('../../../fixtures/two-bed-flat.json') })
  })
  afterAll(() => framed.close())

  const view = async (args: Record<string, unknown>) => {
    const reply = await framed.call('grid_view', { kind: '3d', ...args })
    expect(reply.isError, reply.text).toBe(false)
    return reply
  }

  it('takes a tower in a portrait frame and a long hall in a landscape one', async () => {
    const tower = await view({ plan: 'tower.json' })
    expect(cameraOf(tower).aspectRatio).toBeLessThan(1)
    expect(tower.text).toContain('Framed to the building (fit=building), in a portrait frame')
    const hall = await view({ plan: 'hall.json' })
    expect(cameraOf(hall).aspectRatio).toBe(1.5)
    // Near enough that its 120 m fill the frame: far nearer than 2.2 times its length.
    expect(cameraOf(hall).distance).toBeLessThan(120 * 1.6)
  })

  it('points at the middle of the tower, half way up, not at its foot', async () => {
    const camera = cameraOf(await view({ plan: 'tower.json', from: 'south' }))
    expect(camera.target.point[2]).toBeGreaterThan(30)
  })

  it('fills the frame with the room when a room is named, and with the building on fit=building', async () => {
    const room = cameraOf(await view({ plan: 'flat.json', room: 'lounge' }))
    const whole = cameraOf(await view({ plan: 'flat.json', room: 'lounge', fit: 'building' }))
    expect(room.distance).toBeLessThan(whole.distance)
    expect(room.target.room).toBe('lounge')
    expect(whole.target.room).toBe('lounge')
  })

  it('keeps a camera sent back where it was, and frames it again on fit', async () => {
    const first = cameraOf(await view({ plan: 'tower.json', distance: 400 }))
    expect(first.distance).toBe(400)
    const kept = cameraOf(await view({ plan: 'tower.json', camera: first, turn: 30 }))
    expect(kept.distance).toBe(400)
    const again = cameraOf(await view({ plan: 'tower.json', camera: first, fit: 'building' }))
    expect(again.distance).toBeLessThan(400)
  })

  it('looks level from an eye height outside, so upright lines stay upright', async () => {
    const reply = await view({ plan: 'tower.json', from: 'south', eye_height: 1.6 })
    const camera = cameraOf(reply)
    expect(camera.tilt).toBe(0)
    expect(camera.up).toEqual([0, 0, 1])
    expect(camera.eyeHeight).toBeCloseTo(1.6, 6)
    expect(camera.standingIn.room).toBeNull()
    expect(reply.text).toContain('It looks level from the eye height asked for')
  })

  it('refuses fit with distance, and fit=room with no room', async () => {
    for (const [args, why] of [[{ fit: 'building', distance: 30 }, /fit or distance, not both/], [{ fit: 'room' }, /fit=room frames the room/]] as const) {
      const reply = await framed.call('grid_view', { plan: 'flat.json', kind: '3d', ...args })
      expect(reply.isError, reply.text).toBe(true)
      expect(reply.text).toMatch(why)
    }
  })
})
