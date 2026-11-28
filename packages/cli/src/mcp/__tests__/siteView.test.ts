/**
 * VEW-85, as an agent meets it: `grid_view kind=site` draws the plot with every building of the plan
 * on it, each named with its storeys and height, the labelled things, the set-back lines and the
 * street; `kind=plan` with `with_site` draws the site faint under an upper floor, framed with it;
 * `grid draw --site` and `--with-site` draw the same as files.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sitePlanFixture } from '@ongrid/floorplan/test-support/sitePlan'
import { runGrid } from '../../command/main'
import { bench, type Bench, type Reply } from './replay/harness'

let b: Bench
beforeAll(() => {
  b = bench({ 'site.json': sitePlanFixture(), 'one.json': sitePlanFixture(false), 'empty.json': { version: '1', units: 'm', walls: [], rooms: [], openings: [] } })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

async function grid(...args: string[]): Promise<{ status: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const status = await runGrid(args, { stdout: (text) => (out += text), stderr: (text) => (err += text), stdoutIsTerminal: false, cwd: b.folder })
  return { status, out, err }
}

describe('grid_view kind=site', () => {
  it('draws every building with its storeys and height, the labels, set-backs and street', async () => {
    const reply = await ok('grid_view', { plan: 'site.json', kind: 'site' })
    expect(reply.image).toBe(true)
    expect(reply.data!['kind']).toBe('site')
    expect(reply.data!['ids']).toEqual(['house', 'studio', 'garage'])
    const site = reply.data!['site'] as { buildings: { id: string; storeys: { above: number }; drawn: boolean }[]; labels: { text: string }[]; setbacks: { edge: number; distance: number }[]; streets: { edge: number; faces: string }[]; north: boolean; plotArea: number }
    expect(site.buildings.map((x) => [x.id, x.storeys.above, x.drawn])).toEqual([['house', 2, true], ['studio', 1, true], ['garage', 1, true]])
    expect(site.labels.map((l) => l.text)).toEqual(['Old oak', 'Assembly point'])
    expect(site.setbacks).toEqual([{ edge: 1, distance: 4 }, { edge: 2, distance: 2 }])
    expect(site.streets).toEqual([{ edge: 1, faces: 'south' }])
    expect(site.north).toBe(true)
    expect(site.plotArea).toBeCloseTo(1200, 6)
    expect(reply.text).toContain('Site plan, working')
    expect(reply.text).toContain('"House" (house): 2 storeys')
    expect(reply.text).toContain('"Assembly point"')
    expect(reply.text).toContain('The plan holds no street names')
  })

  it('draws a plan that names no buildings as one, and writes an svg', async () => {
    const one = await ok('grid_view', { plan: 'one.json', kind: 'site', look: 'technical', out: 'site.svg' })
    expect(one.text).toContain('The building: 2 storeys')
    const svg = readFileSync(join(b.folder, 'exports', 'site.svg'), 'utf8')
    expect(svg).toContain('data-part="site-building"')
  })

  it('refuses another kind\'s arguments, and a plan with nothing to draw', async () => {
    const floor = await b.call('grid_view', { plan: 'site.json', kind: 'site', floor: 'up' })
    expect(floor.isError).toBe(true)
    expect(floor.text).toContain('kind=site takes look, not floor')
    const stray = await b.call('grid_view', { plan: 'site.json', kind: 'facade', side: 'north', with_site: true })
    expect(stray.isError).toBe(true)
    expect(stray.text).toContain('not with_site')
    const empty = await b.call('grid_view', { plan: 'empty.json', kind: 'site' })
    expect(empty.isError).toBe(true)
  })
})

describe('grid_view kind=plan with with_site', () => {
  it('draws the site faint under an upper floor, framed with it', async () => {
    const plain = await ok('grid_view', { plan: 'site.json', kind: 'plan', floor: 'up', frame: 'floor' })
    const under = await ok('grid_view', { plan: 'site.json', kind: 'plan', floor: 'up', frame: 'floor', with_site: true })
    expect(under.text).toContain('The site is drawn faint under the floor')
    expect(under.data!['pxPerMetre'] as number).toBeLessThan(plain.data!['pxPerMetre'] as number)
    // On the shared frame of every floor too.
    const shared = await ok('grid_view', { plan: 'site.json', kind: 'plan', floor: 'up', with_site: true, out: 'up.svg' })
    expect(shared.text).toContain('The site is drawn faint under the floor')
    expect(readFileSync(join(b.folder, 'exports', 'up.svg'), 'utf8')).toContain('data-part="site-under"')
  })
})

describe('grid draw --site and --with-site', () => {
  it('writes the site plan, and the site under a floor', async () => {
    const site = await grid('draw', 'site.json', '--site', '--out', 'drawn-site.svg')
    expect(site.status, site.err).toBe(0)
    const svg = readFileSync(join(b.folder, 'drawn-site.svg'), 'utf8')
    expect(svg.match(/data-part="site-building"/g)).toHaveLength(3)
    expect(svg).toContain('data-part="scale-bar"')
    const under = await grid('draw', 'site.json', '--floor', 'up', '--with-site', '--out', 'drawn-up.svg')
    expect(under.status, under.err).toBe(0)
    expect(readFileSync(join(b.folder, 'drawn-up.svg'), 'utf8')).toContain('data-part="site-under"')
  })

  it('refuses what does not go with them', async () => {
    const floor = await grid('draw', 'site.json', '--site', '--floor', 'up')
    expect(floor.status).not.toBe(0)
    expect(floor.err).toContain('--floor does not go with --site')
    const both = await grid('draw', 'site.json', '--site', '--with-site')
    expect(both.status).not.toBe(0)
    const facade = await grid('draw', 'site.json', '--with-site', '--facade', 'north')
    expect(facade.status).not.toBe(0)
  })
})
