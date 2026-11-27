/**
 * CNT-51: grid_set_finishes on the tool server: one call for many rooms, a splashback behind the
 * kitchen run that grid_takeoff then gives as a band of its own, and the band's argument checks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench } from './replay/harness'

const TEXT = [
  'walls outside 0.3 inside 0.1 height 2.5',
  'room kitchen "Kitchen" kitchen 4 x 3',
  'room bath "Bathroom" bathroom 2 x 3 east of kitchen',
  'room bed "Bedroom" bedroom 3 x 3 east of bath',
  'door d1 between kitchen and bath, centred, 0.8 wide, opens into bath',
  'door d2 between bath and bed, centred, 0.8 wide, opens into bed',
  'door front in kitchen south, centred, 0.9 wide, opens in',
  'item k-run kitchen-run-2400 in kitchen against north',
  '',
].join('\n')

let b: Bench
beforeAll(() => {
  b = bench({ 'flat.json': compileRoomsText(TEXT).plan })
})
afterAll(() => b.close())

describe('grid_set_finishes (CNT-51)', () => {
  it('finishes every room but the wet ones, then lays a splashback the take-off measures on its own', async () => {
    const all = await b.call('grid_set_finishes', { plan: 'flat.json', rooms: ['all'], except: ['wet'], floor_finish: 'Oak boards', wall_finish: 'Painted plaster' })
    expect(all.isError, all.text).toBe(false)
    expect(all.text).toMatch(/"Oak boards" now in "Kitchen" and "Bedroom"|"Oak boards" now in "Kitchen", "Bedroom"/)
    const band = await b.call('grid_set_finishes', { plan: 'flat.json', rooms: ['kitchen'], band: { finish: 'Ceramic tile', height: 0.6, behind: 'k-run' } })
    expect(band.isError, band.text).toBe(false)
    expect(band.text).toMatch(/2\.40 m long: 1\.44 m²/)
    const takeoff = await b.call('grid_takeoff', { plan: 'flat.json' })
    expect(takeoff.isError, takeoff.text).toBe(false)
    const bands = takeoff.data!['bands'] as { room: string; finish: string; area: number }[]
    expect(bands).toHaveLength(1)
    expect(bands[0]!.room).toBe('kitchen')
    expect(bands[0]!.area).toBeCloseTo(1.44, 6)
    const count = await b.call('grid_count', { plan: 'flat.json', kind: ['room'], where: ['floor finish = Oak boards'] })
    expect(count.isError, count.text).toBe(false)
    expect(count.text).toMatch(/\b2\b/)
  })

  it('refuses a band with no height', async () => {
    const reply = await b.call('grid_set_finishes', { plan: 'flat.json', rooms: ['kitchen'], band: { finish: 'Tile' }, out: 'no.json' })
    expect(reply.isError).toBe(true)
  })
})
