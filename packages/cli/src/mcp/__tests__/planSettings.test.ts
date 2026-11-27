/**
 * CNT-50: the plan's own settings, set in one call (`grid_set_plan`), and the site's address and
 * its own name (`grid_set_site address`, `site_name`), kept as written and shown by describe.
 * The house is one room on a ground floor named only by its walls, as in `siteTools.test.ts`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']
const TWO_FLOORS = ['walls outside 0.3 inside 0.1 height 2.7', 'floor ground "Ground floor" level 0', 'room hall "Hall" corridor 4 x 4 at 0.3,0.3', 'floor first "First floor" level 1', 'room bed "Bedroom" bedroom 4 x 4 at 0.3,0.3']

let b: Bench
const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
async function refused(tool: string, args: Record<string, unknown>): Promise<string> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(true)
  return reply.text
}

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'house.json', rooms: HOUSE.join('\n') })
  await ok('grid_write_rooms', { plan: 'floors.json', rooms: TWO_FLOORS.join('\n') })
})
afterAll(() => b.close())

describe('grid_set_plan', () => {
  it('sets the language, units, decimal mark, north, country, address, names and floor names in one call', async () => {
    const reply = await ok('grid_set_plan', {
      plan: 'house.json', name: 'Extension', site_name: 'Harbour House', address: '12 Harbour Road, Bristol', country: 'GB', north_points: 'right',
      language: 'es-ES', units: 'mm', area: 'm2', decimal_mark: 'comma', precision: 0, floor_names: ['ground=Planta baja'], out: 'set.json',
    })
    const plan = file('set.json')
    expect(plan['name']).toBe('Extension')
    expect(plan['north']).toBe(-90)
    expect(plan['site']).toEqual({ name: 'Harbour House', address: '12 Harbour Road, Bristol', country: 'GB' })
    expect(plan['display']).toEqual({ language: 'es', length: 'mm', area: 'm2', decimal: 'comma', precision: 0 })
    expect(plan['units']).toBe('m')
    expect(plan['floors']).toEqual([{ id: 'ground', name: 'Planta baja', level: 0 }])
    expect(reply.text).toContain('The site\'s address, kept as written and never looked up: "12 Harbour Road, Bristol".')
    expect(reply.text).toContain('Lengths are shown in mm now; the file stays in metres.')
    expect(reply.text).toContain('Floor "ground" is called "Planta baja" now.')
    expect(reply.data!['settings']).toMatchObject({ name: 'Extension', siteName: 'Harbour House', address: '12 Harbour Road, Bristol', language: 'es', units: 'mm', floors: [{ id: 'ground', name: 'Planta baja' }] })
  })

  it('renames a floor in the floors list in its own record, and takes settings out', async () => {
    await ok('grid_set_plan', { plan: 'floors.json', floor_names: ['first=Primera planta'], units: 'ft-in', out: 'renamed.json' })
    const floors = file('renamed.json')['floors'] as Array<Record<string, unknown>>
    expect(floors.map((f) => f['name'])).toEqual(['Ground floor', 'Primera planta'])
    await ok('grid_set_plan', { plan: 'renamed.json', remove: ['units'], out: 'plain.json' })
    expect(file('plain.json')['display']).toBeUndefined()
  })

  it('says when Grid ships no words for the language', async () => {
    const reply = await ok('grid_set_plan', { plan: 'house.json', language: 'de', out: 'german.json' })
    expect(reply.text).toContain('grid_words lists them to write')
  })

  it('refuses a call with nothing to set, a floor the plan does not have, and a units word it does not take', async () => {
    expect(await refused('grid_set_plan', { plan: 'house.json' })).toContain('Give something to set')
    expect(await refused('grid_set_plan', { plan: 'floors.json', floor_names: ['roof=Roof'] })).toContain('The plan has no floor "roof": its floors are "ground", "first".')
    expect(await refused('grid_set_plan', { plan: 'house.json', units: 'metres' })).toMatch(/units/)
    expect(await refused('grid_set_plan', { plan: 'house.json', address: 'a\u0007b' })).toMatch(/address/)
  })
})

describe('the site\'s address and name', () => {
  it('are set and taken out by grid_set_site', async () => {
    await ok('grid_set_site', { plan: 'house.json', address: 'Calle Mayor 5, Madrid', site_name: 'Casa Mayor', out: 'sited.json' })
    expect(file('sited.json')['site']).toEqual({ address: 'Calle Mayor 5, Madrid', name: 'Casa Mayor' })
    await ok('grid_set_site', { plan: 'sited.json', remove: ['address'], out: 'unsited.json' })
    expect(file('unsited.json')['site']).toEqual({ name: 'Casa Mayor' })
  })

  it('are said by grid_describe, for a person and an agent', async () => {
    await ok('grid_set_site', { plan: 'house.json', address: '12 Harbour Road, Bristol', site_name: 'Harbour House', out: 'described.json' })
    expect((await ok('grid_describe', { plan: 'described.json', length: 'rooms', for: 'person' })).text).toContain('The site: "Harbour House, 12 Harbour Road, Bristol".')
    expect((await ok('grid_describe', { plan: 'described.json', length: 'rooms', for: 'agent' })).text).toContain('SITE name "Harbour House"; address "12 Harbour Road, Bristol"')
    expect((await ok('grid_describe', { plan: 'described.json', as: 'rooms' })).text).toContain('site name "Harbour House"\nsite address "12 Harbour Road, Bristol"')
  })
})
