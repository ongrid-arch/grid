import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { bench } from './replay/harness'

/** VEW-80: grid_export writes the plan's geometry as data, and grid_find asks for it by field. */
function house(): Record<string, unknown> {
  const plan = twoFloorHouse()
  return {
    ...plan,
    openings: plan.openings.map((o) => (o.id === 'd_hk' ? { ...o, hinge: 'start', swing: 'left', properties: { 'door state': 'held open' } } : o)),
  }
}

describe('the plan as data from the tool server (VEW-80)', () => {
  const b = bench({ 'house.json': house() })
  afterAll(() => b.close())

  it('writes a GeoJSON of every floor in one frame and answers as every export does', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'geojson' })
    expect(reply.isError).toBe(false)
    expect(reply.data).toMatchObject({ written: 'exports/house.geojson', format: 'geojson', leftOut: 0, floorsLeftOut: [] })
    expect((reply.data!['floors'] as { id: string }[]).map((f) => f.id)).toEqual(['ground', 'first'])
    expect(reply.text).toContain("Holds all 2 floors of the plan in one frame, the plan's x and y in metres, each part with its floor and elevation.")
    const geo = JSON.parse(readFileSync(join(b.folder, 'exports', 'house.geojson'), 'utf8')) as { type: string; features: { id: string; properties: Record<string, unknown> }[] }
    expect(geo.type).toBe('FeatureCollection')
    expect(geo.features.find((f) => f.id === 'door/d_hk')!.properties).toMatchObject({ opensInto: 'hall', state: 'held open', automatic: false })
  })

  it('writes the json of one floor, named apart from the plan file', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'json', floor: 'first' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['written']).toBe('exports/house-first-floor-data.json')
    expect(reply.data!['floorsLeftOut']).toEqual(['ground'])
    const data = JSON.parse(readFileSync(join(b.folder, 'exports', 'house-first-floor-data.json'), 'utf8')) as { grid: { floors: { id: string }[] }; rooms: { id: string }[] }
    expect(data.grid.floors.map((f) => f.id)).toEqual(['first'])
    expect(data.rooms.map((r) => r.id)).toEqual(['landing', 'study'])
  })

  it('refuses an option that does not apply to the data, by its argument', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'geojson', roofs: false })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('roofs false applies to GLB and OBJ only')
  })

  it('grid_find gives a part\'s geometry, clear width, glass and state as fields', async () => {
    const reply = await b.call('grid_find', { plan: 'house.json', kind: ['door'], where: ['door state is set'], fields: ['centre', 'polygon', 'clear width', 'glazed', 'door state'] })
    expect(reply.isError).toBe(false)
    const rows = reply.data!['rows'] as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'd_hk', centre: [4, 1.95], glazed: false, 'door state': 'held open' })
    expect(rows[0]!['clear width']).toBeLessThan(0.9)
    expect((rows[0]!['polygon'] as unknown[][])[0]).toHaveLength(4)
    const glass = await b.call('grid_find', { plan: 'house.json', where: ['glazed = yes'] })
    expect(glass.data!['ids']).toEqual(expect.arrayContaining(['win_k', 'win_b']))
    const rooms = await b.call('grid_find', { plan: 'house.json', kind: ['room'], where: ['centroid is set'], fields: ['centroid'] })
    expect((rooms.data!['rows'] as unknown[]).length).toBe(6)
  })

  it('refuses a test of coordinates other than is set and is missing, and lists the fields', async () => {
    const refused = await b.call('grid_find', { plan: 'house.json', where: ['centre = 1'] })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('only "is set" and "is missing" test it')
    const fields = await b.call('grid_fields', { plan: 'house.json', kind: ['door'] })
    const names = (fields.data!['fields'] as { name: string }[]).map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['polygon', 'centre', 'centroid', 'clear width', 'glazed', 'door state']))
    // The fact the field reads is not hidden by it.
    expect((fields.data!['facts'] as { name: string; shadowed: boolean }[]).find((f) => f.name === 'door state')).toMatchObject({ shadowed: false })
  })
})
