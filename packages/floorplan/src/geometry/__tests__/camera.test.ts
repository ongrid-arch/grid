/**
 * VEW-3 (lab SE-4, SE-7, S-16): the camera record. It is set by a target, a bearing, a tilt, a
 * distance, a lens and a cut; the rest is worked out, the BCF camera exactly from the setting.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cameraInsideWall,
  cameraPlace,
  cameraRecord,
  cameraSetting,
  compassBearing,
  drawingBearing,
  fieldOfViewOf,
  findView,
  focalLengthOf,
  OUTSIDE_ANY_ROOM,
  planOrientation,
  shownFloors,
  storedView,
  viewSetting,
  fitAspect,
  fitCamera,
  type CameraBox,
  type CameraRecord,
  type CameraSetting,
} from '../index'
import { parseFloorPlan, safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { readingNotes } from '../../types/reading'

const fixture = (path: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', path), 'utf8')))
const flat = fixture('two-bed-flat.json')
const twoStorey = fixture('rooms/two-storey.plan.json')

const setting = (more: Partial<CameraSetting> = {}): CameraSetting => ({
  target: { room: null, point: [5, 4, 1] },
  bearing: 135,
  tilt: 30,
  distance: 20,
  focalLength: 35,
  cut: null,
  ...more,
})

const length = (v: readonly number[]): number => Math.hypot(...v)
const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((sum, x, i) => sum + x * b[i]!, 0)

describe('the camera record', () => {
  it('stands the camera on its bearing, tilted and as far as it says, and looks at the target', () => {
    const r = cameraRecord(flat, setting({ bearing: 180, tilt: 0, distance: 10 }))
    // Bearing 180 is south of the target; with no north stated, south is down the drawing.
    expect(r.position).toEqual([5, -6, 1])
    expect(r.direction).toEqual([0, 1, 0])
    expect(r.up).toEqual([0, 0, 1])
    expect(r.bearingFrom).toBe('plan up')
    expect(r.north).toBeNull()
  })

  it('gives the BCF camera from the setting: a unit direction to the target, a unit up across it, the vertical field of view of the lens', () => {
    const r = cameraRecord(flat, setting())
    const toTarget = r.target.point.map((t, i) => (t - r.position[i]!) / r.distance)
    for (let i = 0; i < 3; i++) expect(r.direction[i]).toBeCloseTo(toTarget[i]!, 5)
    expect(length(r.direction)).toBeCloseTo(1, 5)
    expect(length(r.up)).toBeCloseTo(1, 5)
    expect(dot(r.up, r.direction)).toBeCloseTo(0, 5)
    expect(r.up[2]).toBeGreaterThan(0)
    expect(r.position[2] - r.target.point[2]).toBeCloseTo(20 * Math.sin(Math.PI / 6), 5)
    expect(r.fieldOfView).toBeCloseTo(fieldOfViewOf(35), 5)
    expect(r.fieldOfView).toBeCloseTo((2 * Math.atan(12 / 35) * 180) / Math.PI, 5)
    expect(r.lens).toEqual({ focalLength: 35, sensor: { width: 36, height: 24 } })
    expect(r.aspectRatio).toBe(1.5)
    expect(fieldOfViewOf(focalLengthOf(45))).toBeCloseTo(45, 9)
  })

  it('reads a bearing from the north the plan states, and says so', () => {
    const north = parseFloorPlan({ ...flat, north: 90 })
    const r = cameraRecord(north, setting({ bearing: 90, tilt: 0, distance: 10 }))
    // North lies to the left of the drawing (-x), so east is up the drawing.
    expect(r.position).toEqual([5, 14, 1])
    expect(r.bearingFrom).toBe('north')
    expect(r.north).toBe(90)
    const orientation = planOrientation(north)
    expect(drawingBearing(90, orientation)).toBe(0)
    expect(compassBearing(0, orientation)).toBe(90)
    // A plan whose y runs down is the building's mirror image: the other way round.
    const down = planOrientation({ north: 0, yAxis: 'down' })
    expect(compassBearing(drawingBearing(30, down), down)).toBe(30)
    expect(drawingBearing(90, down)).toBe(270)
  })

  it('is the same record, digit for digit, when its setting is sent back', () => {
    for (const plan of [flat, twoStorey, parseFloorPlan({ ...flat, north: 37.5 })]) {
      const first = cameraRecord(plan, setting({ bearing: 211.123456789, tilt: 17.3333333, distance: 13.987654321, focalLength: focalLengthOf(45) }))
      const again = cameraRecord(plan, cameraSetting(first))
      expect(JSON.stringify(again)).toBe(JSON.stringify(first))
      const back: CameraRecord = JSON.parse(JSON.stringify(first))
      expect(JSON.stringify(cameraRecord(plan, cameraSetting(back)))).toBe(JSON.stringify(first))
    }
  })

  it('keeps a saved camera where it was when the plan\'s north has changed since, and gives its bearing from the north now', () => {
    const saved = storedView('Corner', cameraRecord(flat, setting({ bearing: 200 })))
    const turned = parseFloorPlan({ ...flat, north: 30 })
    const r = cameraRecord(turned, viewSetting(saved))
    expect(r.position).toEqual(saved.position)
    expect(r.bearing).toBeCloseTo(230, 5)
    expect(r.bearingFrom).toBe('north')
  })

  it('measures the eye from the floor of the room it is pointed at, the cut, or the ground floor', () => {
    const upstairs = twoStorey.rooms.find((room) => room.floor === 'first')!
    const r = cameraRecord(twoStorey, setting({ target: { room: upstairs.id, point: [3, 3, 4] }, tilt: 0 }))
    expect(r.floor).toBe('first')
    expect(r.eyeHeight).toBeLessThan(4)
    expect(cameraRecord(twoStorey, setting({ tilt: 0 })).floor).toBe('ground')
    expect(cameraRecord(twoStorey, setting({ tilt: 0, cut: 'first' })).floor).toBe('first')
  })

  it('lists the floors drawn: with a floor cut away, that floor and those below it', () => {
    expect(shownFloors(twoStorey, null)).toEqual(['ground', 'first'])
    expect(shownFloors(twoStorey, 'ground')).toEqual(['ground'])
    expect(cameraRecord(twoStorey, setting({ cut: 'first' })).floors).toEqual(['ground', 'first'])
    // A floor the plan does not have is no cut.
    expect(cameraRecord(twoStorey, setting({ cut: 'attic' })).cut).toBeNull()
  })
})

describe('where the camera stands (S-16)', () => {
  it('says "outside any room" for a camera outside every room, above the roof or below the floor', () => {
    expect(cameraPlace(flat, [-5, -5, 1.6]).words).toBe(OUTSIDE_ANY_ROOM)
    expect(cameraPlace(flat, [-5, -5, 1.6]).room).toBeNull()
    const inside = cameraPlace(flat, [2, 2, 1.6])
    expect(inside.room).toBe('living')
    expect(inside.words).toBe('in "Living room"')
    expect(cameraPlace(flat, [2, 2, 40]).words).toBe(OUTSIDE_ANY_ROOM)
    expect(cameraPlace(flat, [2, 2, -1]).words).toBe(OUTSIDE_ANY_ROOM)
    // In the wall between two rooms is in neither.
    expect(cameraPlace(flat, [4.6, 2, 1.6]).words).toBe(OUTSIDE_ANY_ROOM)
    expect(cameraRecord(flat, setting()).standingIn.words).toBe(OUTSIDE_ANY_ROOM)
  })
})

describe('a view saved with the plan (C9)', () => {
  it('is read by the plan format, and a plan with none reads as before', () => {
    const view = storedView('Garden corner', cameraRecord(flat, setting({ target: { room: 'living', point: [2, 2, 1.3] } })))
    const plan = parseFloorPlan({ ...flat, views: [view] })
    expect(plan.views).toEqual([view])
    expect(readingNotes({ ...flat, views: [view] })).toEqual(readingNotes(flat))
    expect(flat.views).toBeUndefined()
    expect(findView(plan.views, ' garden CORNER')).toEqual(view)
    expect(findView(plan.views, 'street')).toBeNull()
  })

  it('refuses a view that tilts past the limit, stands too close or has a lens Grid does not take', () => {
    const view = storedView('A', cameraRecord(flat, setting()))
    expect(safeParseFloorPlan({ ...flat, views: [{ ...view, tilt: 90 }] })).toBeNull()
    expect(safeParseFloorPlan({ ...flat, views: [{ ...view, distance: 0 }] })).toBeNull()
    expect(safeParseFloorPlan({ ...flat, views: [{ ...view, lens: { ...view.lens, focalLength: 2 } }] })).toBeNull()
    expect(safeParseFloorPlan({ ...flat, views: [{ ...view, bearingFrom: 'north' }] })).toBeNull()
    expect(safeParseFloorPlan({ ...flat, views: [view] })).not.toBeNull()
  })
})

/** VEW-26: where each corner of a box falls on a record's picture, from -1 to 1 across and up. */
function onPicture(r: CameraRecord, box: CameraBox): Array<[number, number]> {
  const right = [r.direction[1] * r.up[2] - r.direction[2] * r.up[1], r.direction[2] * r.up[0] - r.direction[0] * r.up[2], r.direction[0] * r.up[1] - r.direction[1] * r.up[0]]
  const high = Math.tan((r.fieldOfView * Math.PI) / 360)
  const out: Array<[number, number]> = []
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const d = [x - r.position[0], y - r.position[1], z - r.position[2]]
    const depth = dot(d, r.direction)
    out.push([dot(d, right) / depth / (high * r.aspectRatio), dot(d, r.up) / depth / high])
  }
  return out
}

describe('a camera fitted to a box (VEW-26)', () => {
  const tower: CameraBox = { min: [0, 0, 0], max: [30, 30, 170] }
  const station: CameraBox = { min: [0, 0, 0], max: [130, 25, 12] }
  const fitted = (box: CameraBox, more: Partial<CameraSetting> = {}, level = false): CameraRecord => {
    const base = setting({ focalLength: focalLengthOf(45), ...more })
    const aspectRatio = fitAspect(flat, base, box, { level })
    const fit = fitCamera(flat, { ...base, aspectRatio }, box, { level })
    return cameraRecord(flat, { ...base, aspectRatio, target: { room: null, point: fit.target }, distance: fit.distance })
  }

  it('sees every corner, with one near an edge of the frame, and centres what it sees', () => {
    for (const box of [tower, station]) {
      for (const bearing of [0, 135, 200]) {
        const r = fitted(box, { bearing })
        const spots = onPicture(r, box)
        const most = Math.max(...spots.flat().map(Math.abs))
        expect(most).toBeLessThanOrEqual(0.9)
        expect(most).toBeGreaterThan(0.8)
        const xs = spots.map((s) => s[0])
        const ys = spots.map((s) => s[1])
        expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThan(0.02)
        expect(Math.abs(Math.max(...ys) + Math.min(...ys))).toBeLessThan(0.02)
      }
    }
  })

  it('takes a tower in a portrait frame and a long low building in a landscape one', () => {
    expect(fitted(tower).aspectRatio).toBeLessThan(1)
    expect(fitted(station).aspectRatio).toBe(1.5)
  })

  it('keeps a level camera level at the height it was given, the box still in its frame', () => {
    const r = fitted(tower, { tilt: 0, target: { room: null, point: [0, 0, 1.6] } }, true)
    expect(r.tilt).toBe(0)
    expect(r.position[2]).toBeCloseTo(1.6, 6)
    expect(r.up).toEqual([0, 0, 1])
    for (const [x, y] of onPicture(r, tower)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.9)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.9)
    }
  })

  it('stands closer to a small box than to a large one', () => {
    const small = fitted({ min: [0, 0, 0], max: [4, 3, 2.6] })
    const large = fitted(station)
    expect(small.distance).toBeLessThan(large.distance / 5)
  })
})

describe('a camera inside a wall (VEW-59)', () => {
  // The flat's south wall runs along y = 0, 0.3 m thick; its windows are at 1.2 to 3 and 6.2 to 7.6 m.
  const insideSouth = (more: Partial<CameraSetting> = {}): CameraRecord =>
    cameraRecord(flat, setting({ target: { room: null, point: [4, 5, 1.2] }, bearing: 180, tilt: 0, distance: 5, ...more }))

  it('names the wall and a distance that stands the camera clear of it', () => {
    const inside = cameraInsideWall(flat, insideSouth())
    expect(inside?.wall).toBe('ext-south')
    expect(inside?.clearDistance).toBeCloseTo(5.25, 6)
    expect(cameraInsideWall(flat, insideSouth({ distance: inside!.clearDistance! }))).toBeNull()
  })

  it('says nothing for a camera outside every wall or in a room', () => {
    expect(cameraInsideWall(flat, insideSouth({ distance: 10 }))).toBeNull()
    expect(cameraInsideWall(flat, insideSouth({ distance: 2 }))).toBeNull()
  })

  it('says nothing for a camera above the wall or in a door opening', () => {
    expect(cameraInsideWall(flat, insideSouth({ target: { room: null, point: [4, 5, 30] } }))).toBeNull()
    // The entrance door is in the north wall (y = 7.6), 3.45 to 4.35 m along it from its start.
    const inDoor = cameraRecord(flat, setting({ target: { room: null, point: [5.1, 2, 1] }, bearing: 0, tilt: 0, distance: 5.6 }))
    expect(cameraInsideWall(flat, inDoor)).toBeNull()
  })

  it('gives no distance for a camera looking straight down', () => {
    const down = cameraRecord(flat, setting({ target: { room: null, point: [4, 0, 1.2] }, tilt: 90, distance: 0 }))
    expect(cameraInsideWall(flat, down)).toEqual({ wall: 'ext-south', clearDistance: null })
  })
})
