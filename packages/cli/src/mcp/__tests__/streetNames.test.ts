/**
 * VEW-88, as an agent meets it: `grid_set_site street_names` names the street an edge of the plot
 * is on, the site plan writes the name along the edge (`grid_view kind=site`, its text, data and
 * picture, and `grid draw --site`), `grid_measure what=site` and rooms text read it back, and a
 * name that is empty or too long is refused with nothing written. The site is VEW-85's invented
 * one, a 40 × 30 m plot with a street to the south (edge 1); every street name is invented.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sitePlanFixture } from '@ongrid/floorplan/test-support/sitePlan'
import { runGrid } from '../../command/main'
import { bench, type Bench, type Reply } from './replay/harness'

let b: Bench
beforeAll(() => {
  b = bench({ 'site.json': sitePlanFixture() })
})
afterAll(() => b.close())

const site = (name: string): Record<string, unknown> => (JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as { site: Record<string, unknown> }).site
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('grid_set_site street_names', () => {
  it('names a street edge, and puts an edge named that is not on a street on one', async () => {
    const reply = await ok('grid_set_site', { plan: 'site.json', street_names: ['1 Harbour Road', 'edge 2 Mill Lane'], out: 'named.json' })
    expect(site('named.json')['streets']).toEqual([1, 2])
    expect(site('named.json')['streetNames']).toEqual([{ edge: 1, name: 'Harbour Road' }, { edge: 2, name: 'Mill Lane' }])
    expect(reply.text).toContain('Put edge 2 on the street, to carry its name.')
    expect(reply.text).toContain('The streets\' names: edge 1 on "Harbour Road", edge 2 on "Mill Lane".')
    // A side of the drawing names every edge facing it; [] takes the names out.
    await ok('grid_set_site', { plan: 'site.json', street_names: ['south Quay Street'], out: 'side.json' })
    expect(site('side.json')['streetNames']).toEqual([{ edge: 1, name: 'Quay Street' }])
    await ok('grid_set_site', { plan: 'named.json', street_names: [], out: 'cleared.json' })
    expect(site('cleared.json')['streetNames']).toBeUndefined()
    expect(site('cleared.json')['streets']).toEqual([1, 2])
  })

  it('refuses an empty name, an overlong one and an edge the plot does not have, writing nothing', async () => {
    const before = readFileSync(join(b.folder, 'site.json'), 'utf8')
    const empty = await b.call('grid_set_site', { plan: 'site.json', street_names: ['1'] })
    expect(empty.isError).toBe(true)
    expect(empty.text).toContain('The street name for edge 1 is empty')
    const long = await b.call('grid_set_site', { plan: 'site.json', street_names: [`1 ${'Long '.repeat(30).trim()}`] })
    expect(long.isError).toBe(true)
    expect(long.text).toContain('a name may have at most 120')
    const off = await b.call('grid_set_site', { plan: 'site.json', street_names: ['9 Harbour Road'] })
    expect(off.isError).toBe(true)
    expect(off.text).toMatch(/edge 9/)
    const twice = await b.call('grid_set_site', { plan: 'site.json', street_names: ['1 Harbour Road', 'south Quay Street'] })
    expect(twice.text).toContain('Edge 1 is given two street names')
    expect(readFileSync(join(b.folder, 'site.json'), 'utf8')).toBe(before)
  })

  it('keeps a name while its edge is on a street, and drops it with the street or the boundary', async () => {
    await ok('grid_set_site', { plan: 'site.json', street_names: ['1 Harbour Road', '2 Mill Lane'], out: 'keep.json' })
    const moved = await ok('grid_set_site', { plan: 'keep.json', streets: ['1'], out: 'moved.json' })
    expect(site('moved.json')['streetNames']).toEqual([{ edge: 1, name: 'Harbour Road' }])
    expect(moved.text).toContain('the street name "Mill Lane" on edge 2, which is no longer on a street')
    await ok('grid_set_site', { plan: 'keep.json', remove: ['streets', 'setbacks'], out: 'nostreet.json' })
    expect(site('nostreet.json')['streetNames']).toBeUndefined()
    await ok('grid_set_site', { plan: 'keep.json', remove: ['boundary'], out: 'noplot.json' })
    expect(site('noplot.json')['streetNames']).toBeUndefined()
  })
})

describe('street names read back', () => {
  beforeAll(async () => {
    await ok('grid_set_site', { plan: 'site.json', street_names: ['1 Harbour Road'], streets: ['1', '2'], out: 'read.json' })
  })

  it('grid_view kind=site writes the name on the picture and gives it in its text and data', async () => {
    const reply = await ok('grid_view', { plan: 'read.json', kind: 'site' })
    expect(reply.image).toBe(true)
    const streets = (reply.data!['site'] as { streets: unknown[] }).streets
    expect(streets).toEqual([{ edge: 1, faces: 'south', name: 'Harbour Road' }, { edge: 2, faces: 'east', name: null }])
    expect(reply.text).toContain('edge 1, facing south, "Harbour Road"; edge 2, facing east, no name')
    expect(reply.text).toContain('grid_set_site street_names names it.')
  })

  it('grid draw --site writes the name in the SVG file', async () => {
    let err = ''
    const status = await runGrid(['draw', 'read.json', '--site', '--out', 'read-site.svg'], { stdout: () => undefined, stderr: (text) => (err += text), stdoutIsTerminal: false, cwd: b.folder })
    expect(status, err).toBe(0)
    expect(readFileSync(join(b.folder, 'read-site.svg'), 'utf8')).toContain('>Harbour Road<')
  })

  it('grid_measure what=site names the street, and rooms text writes it back', async () => {
    const measured = await ok('grid_measure', { plan: 'read.json', what: 'site' })
    expect(measured.text).toContain('"Harbour Road"')
    const rooms = await ok('grid_describe', { plan: 'read.json', as: 'rooms' })
    expect(rooms.text).toContain('street edge 1 "Harbour Road"')
    expect(rooms.text).toContain('street edge 2')
  })
})
