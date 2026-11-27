/**
 * CNT-58: the sun worked out by Grid, so no agent works the noon sun out by hand: grid_measure
 * what=sun with a date gives where the sun is, the faces it is on and each open space's share in
 * sun; grid_view draws the shadow plan and lights the model from the sun; grid_export writes the
 * sun as a light and north into a glb; eye toward is a compass direction once north is stated.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench, type Reply } from './replay/harness'

/** Four wings round a 6 × 4 m courtyard open to the sky, walls 2.7 m high; the court runs y -4 to 0. */
function courtyard(extra: Record<string, unknown> = {}): unknown {
  const result = compileRoomsText(
    [
      'walls outside 0.3 inside 0.1 height 2.7',
      'room n "North wing" living 12 x 4 at 0,0',
      'room c "Court" - 6 x 4 south of n align west shift 3 outdoor courtyard',
      'room w "West wing" bedroom 2.9 x 4 west of c',
      'room e "East wing" bedroom 3 x 4 east of c',
      'room s "South wing" kitchen 12 x 4 south of c align west shift -3',
      'window nw in n north, centred, 1.2 wide',
    ].join('\n'),
  )
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return { ...(result.plan as object), ...extra }
}

/** A Seville courtyard house, north up the drawing. */
const SEVILLE = { site: { latitude: 37.39, longitude: -5.99 } }

let b: Bench
beforeAll(() => {
  b = bench({ 'court.json': courtyard(SEVILLE), 'turned.json': courtyard({ ...SEVILLE, north: 90 }), 'nowhere.json': courtyard(), 'north0.json': courtyard({ north: 0 }) })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

type Moment = { azimuth: number; elevation: number; up: boolean; faces: { face: number; sun: boolean }[]; spaces: { id: string; inSun: number }[] }
type Space = { id: string; kind: string; inSun: number; byMoment: number[] }
type Face = { face: number; faces: string; inner: boolean; sunHours?: number }
const answer = (reply: Reply) => reply.data!['answer'] as { moments: Moment[]; spaces: Space[]; faces: Face[]; days: { sunrise: string; noon: string; sunset: string }[] }

describe('grid_measure what=sun with a date', () => {
  it('gives the noon sun over the courtyard, once, so two agents cannot tell two stories', async () => {
    const reply = await ok('grid_measure', { plan: 'court.json', what: 'sun', date: '2026-06-21', time: '12:00' })
    const found = answer(reply)
    const noon = found.moments[0]!
    expect(noon.azimuth).toBeGreaterThan(179)
    expect(noon.azimuth).toBeLessThan(181)
    expect(noon.elevation).toBeCloseTo(90 - 37.39 + 23.44, 0)
    // The south wing, 2.7 m high, throws 2.7 / tan(76°) = 0.66 m into the 4 m court.
    const court = found.spaces.find((s) => s.id === 'c')!
    expect(court.inSun).toBeGreaterThan(0.8)
    expect(court.inSun).toBeLessThan(0.86)
    expect(reply.text).toContain('Times are the site\'s local solar time')
    expect(reply.text).toMatch(/In sun: "Court" \(24\.00 m²\) 8\d%/)
    expect(reply.text).toContain('not a daylight or sunlight result')
    expect(found.days[0]!.noon).toBe('12:00')
  })

  it('gives each space\'s share over hours, weighted by time, and the hours on each face', async () => {
    const found = answer(await ok('grid_measure', { plan: 'court.json', what: 'sun', date: '2026-06-21', hours: '09:00-17:00', areas: { bed: [[3.2, -3.8], [8.8, -3.8], [8.8, -3], [3.2, -3]] } }))
    const court = found.spaces.find((s) => s.id === 'c')!
    expect(court.byMoment).toHaveLength(17)
    expect(court.inSun).toBeGreaterThan(0.3)
    expect(court.inSun).toBeLessThan(0.95)
    // At noon (the seventh moment) the bed along the court's south side lies partly in the south wing's shadow.
    const bed = found.spaces.find((s) => s.id === 'bed')!
    expect(bed.kind).toBe('area')
    expect(bed.byMoment[6]!).toBeGreaterThan(0.5)
    expect(bed.byMoment[6]!).toBeLessThan(court.byMoment[6]!)
    const outerSouth = found.faces.filter((f) => !f.inner && f.faces === 'south')
    expect(Math.max(...outerSouth.map((f) => f.sunHours!))).toBeGreaterThan(6)
    const noonOnly = answer(await ok('grid_measure', { plan: 'court.json', what: 'sun', date: '2026-06-21', hours: '10:00-14:00' }))
    expect(noonOnly.faces.filter((f) => !f.inner && f.faces === 'north').every((f) => f.sunHours === 0)).toBe(true)
    // 09:00 to 17:00 runs longer after noon than before: the west faces have the sun longer than
    // the east, and the north face only late, once the June sun has passed west of due west.
    const hours = (way: string): number => Math.max(...found.faces.filter((f) => !f.inner && f.faces === way).map((f) => f.sunHours!))
    expect(hours('west')).toBeGreaterThan(hours('east'))
    expect(hours('north')).toBeGreaterThan(0)
    expect(hours('north')).toBeLessThan(2)
  })

  it('reads clock times with utc_offset, and a range of dates', async () => {
    const reply = await ok('grid_measure', { plan: 'court.json', what: 'sun', date: '2026-06-01', until: '2026-06-21', time: '14:00', utc_offset: 2 })
    expect(answer(reply).moments).toHaveLength(4)
    expect(reply.text).toContain('clock times at UTC+2')
  })

  it('turns the faces by the north the plan states', async () => {
    const found = answer(await ok('grid_measure', { plan: 'turned.json', what: 'sun', date: '2026-06-21', time: '12:00' }))
    // North to -x: the drawing's south side faces west, and the sun at noon is on the east of the drawing.
    expect(found.faces.filter((f) => !f.inner).map((f) => f.faces)).toContain('west')
  })

  it('refuses a plan that says nowhere where it is, with how to say it', async () => {
    const reply = await b.call('grid_measure', { plan: 'nowhere.json', what: 'sun', date: '2026-06-21', time: '12:00' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('grid_set_site (latitude, longitude)')
  })

  it('refuses a time without a date, and a date it cannot read', async () => {
    expect((await b.call('grid_measure', { plan: 'court.json', what: 'sun', time: '12:00' })).text).toContain('with date')
    expect((await b.call('grid_measure', { plan: 'court.json', what: 'sun', date: '21/06/2026' })).text).toContain('YYYY-MM-DD')
    expect((await b.call('grid_measure', { plan: 'court.json', what: 'sun', date: '2026-06-21', hours: '17:00-09:00' })).isError).toBe(true)
  })

  it('keeps the table of window walls with no date', async () => {
    const reply = await ok('grid_measure', { plan: 'court.json', what: 'sun' })
    expect(reply.text).toContain('Geometry,')
  })
})

describe('grid_view with sun', () => {
  it('draws the shadow plan and says what is in sun', async () => {
    const reply = await ok('grid_view', { plan: 'court.json', kind: 'plan', sun: '2026-06-21 18:00' })
    expect(reply.image).toBe(true)
    expect(reply.text).toContain('shaded dark round the building')
    expect(reply.text).toMatch(/In sun then: "Court" \d+%/)
  })

  it('lights the 3d model and the eye from the sun, and says so', async () => {
    const three = await ok('grid_view', { plan: 'court.json', kind: '3d', sun: '2026-06-21 18:45' })
    expect(three.image).toBe(true)
    expect(three.text).toContain('lit from the sun then')
    const night = await ok('grid_view', { plan: 'court.json', kind: '3d', sun: '2026-06-21 23:00' })
    expect(night.text).toContain('lit by the sky alone')
    const eye = await ok('grid_view', { plan: 'court.json', kind: 'eye', room: 'n', sun: '2026-06-21 08:00 +02:00' })
    expect(eye.text).toContain('the sun is at bearing')
  })

  it('refuses a moment it cannot read', async () => {
    const reply = await b.call('grid_view', { plan: 'court.json', kind: '3d', sun: 'tomorrow evening' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('YYYY-MM-DD HH:MM')
  })
})

describe('grid_view kind=eye toward a compass direction', () => {
  it('looks the compass way once north is stated, and the drawing\'s with none', async () => {
    const direction = (reply: Reply): number[] => (reply.data!['camera'] as { direction: number[] }).direction
    const plain = await ok('grid_view', { plan: 'north0.json', kind: 'eye', room: 'n', toward: 'west' })
    expect(direction(plain)[0]!).toBeLessThan(-0.9)
    expect(plain.text).toContain('west by the compass')
    // North to -x: west is down the drawing (-y).
    const turned = await ok('grid_view', { plan: 'turned.json', kind: 'eye', room: 'n', toward: 'west' })
    expect(direction(turned)[1]!).toBeLessThan(-0.9)
    const nowhere = await ok('grid_view', { plan: 'nowhere.json', kind: 'eye', room: 'n', toward: 'west' })
    expect(nowhere.text).toContain('the plan states no north')
    expect(direction(nowhere)[0]!).toBeLessThan(-0.9)
  })
})

describe('grid_export glb with sun', () => {
  type Doc = { asset: { extras: Record<string, unknown> }; extensionsUsed?: string[]; extensions?: { KHR_lights_punctual: { lights: { type: string }[] } }; scenes: { nodes: number[] }[]; nodes: { name?: string; rotation?: number[]; extras?: Record<string, unknown> }[] }
  const docOf = (file: string): Doc => {
    const bytes = readFileSync(join(b.folder, file))
    return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as Doc
  }

  it('writes north into the file and the sun as a light node shining from it', async () => {
    await ok('grid_export', { plan: 'turned.json', format: 'glb', out: 'sun.glb', sun: '2026-06-21 12:00' })
    const doc = docOf('sun.glb')
    expect(doc.asset.extras['gridNorth']).toEqual({ north: 90, yAxis: 'up', latitude: 37.39, longitude: -5.99 })
    expect(doc.extensionsUsed).toEqual(['KHR_lights_punctual'])
    expect(doc.extensions!.KHR_lights_punctual.lights[0]!.type).toBe('directional')
    const index = doc.nodes.findIndex((n) => n.name === 'sun')
    expect(doc.scenes[0]!.nodes).toContain(index)
    const sun = doc.nodes[index]!
    expect((sun.extras!['gridSun'] as { azimuth: number }).azimuth).toBeCloseTo(180, 0)
    // The light shines down its node's -Z turned by its rotation: from high in the +x of the plan (south, with north to -x), down and toward -x.
    const [x, y, z, w] = sun.rotation!
    const ray = [-(2 * (x! * z! + w! * y!)), -(2 * (y! * z! - w! * x!)), -(1 - 2 * (x! * x! + y! * y!))]
    expect(ray[0]!).toBeLessThan(0)
    expect(ray[1]!).toBeLessThan(-0.9)
  })

  it('writes north alone without sun, and refuses sun for another format', async () => {
    await ok('grid_export', { plan: 'court.json', format: 'glb', out: 'plain.glb' })
    const doc = docOf('plain.glb')
    expect(doc.asset.extras['gridNorth']).toEqual({ north: null, yAxis: 'up', latitude: 37.39, longitude: -5.99 })
    expect(doc.extensionsUsed).toBeUndefined()
    expect((await b.call('grid_export', { plan: 'court.json', format: 'obj', sun: '2026-06-21 12:00' })).text).toContain('glb only')
  })
})
