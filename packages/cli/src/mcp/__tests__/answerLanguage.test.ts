/**
 * MSG-34: every tool answers in one language: the call's `language`, else the plan's own
 * (`display.language`), else English; and every figure of an answer with one decimal mark, the
 * display's. The house is three rooms on one floor, written rooms first; its language is set
 * with grid_set_plan, as a person sets it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'
import { GRID_TOOLS } from '../serveTools'
import { toolDefinition } from '../toolkit'

const CASA = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Planta baja" level 0',
  'room salon "Salón" living 4.4 x 4.2 at 0.3,0.3',
  'room cocina "Cocina" kitchen 4.4 x 3.05 north of salon',
  'room pasillo "Pasillo" corridor 1.3 x * east of salon until cocina',
  'door d1 between pasillo and salon, 0.1 from south, 0.8 wide, opens into salon',
  'door front in pasillo north, centred, 0.9 wide, opens in, hinged east',
  'window w1 in salon south, centred, 1.8 wide, sill 0.6, height 1.5',
]
const HOUSE = CASA.map((line) => line.replace('"Salón"', '"Living room"').replace('"Cocina"', '"Kitchen"').replace('"Pasillo"', '"Hall"').replace('"Planta baja"', '"Ground floor"'))

let b: Bench
const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
/** Grid's own words and figures: the text with its quoted names and its type keys (door:0.8x2.1) taken out. */
const words = (text: string): string => text.replace(/"[^"\n]*"/g, '""').replace(/\b(door|window|opening):[\d.x]+/g, 'type')
const SPANISH_CLOSING = 'Esta herramienta aún escribe sus propias palabras en inglés'

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'casa.json', rooms: HOUSE.join('\n') })
  await ok('grid_set_plan', { plan: 'casa.json', language: 'es' })
  await ok('grid_write_rooms', { plan: 'house.json', rooms: HOUSE.join('\n') })
  await ok('grid_write_rooms', { plan: 'feet.json', rooms: HOUSE.join('\n') })
  await ok('grid_set_plan', { plan: 'feet.json', units: 'ft-in' })
})
afterAll(() => b.close())

describe('the language every tool takes', () => {
  it('is an argument of every tool, once, beside the tool\'s own', () => {
    for (const tool of GRID_TOOLS) {
      const properties = (toolDefinition(tool)['inputSchema'] as { properties: Record<string, unknown> }).properties
      expect(Object.hasOwn(properties, 'language'), tool.name).toBe(true)
    }
  })

  it('refuses a word that is no language tag, by name', async () => {
    const reply = await b.call('grid_areas', { plan: 'casa.json', language: 'not a tag!' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('language takes a language tag')
  })
})

describe('grid_areas and grid_schedule in the plan\'s language', () => {
  it('answer grid_areas in Spanish on a Spanish plan, every figure with a decimal comma', async () => {
    const reply = await ok('grid_areas', { plan: 'casa.json' })
    expect(reply.text).toContain('Superficie útil: 41,45 m².')
    expect(reply.text).toContain('Construida interior: 42,63 m².')
    expect(reply.text).toContain('Circulación: 9,55 m², 22,4% de la construida interior.')
    expect(reply.text).toContain('(salón)')
    expect(words(reply.text)).not.toMatch(/\d\.\d/)
    expect(reply.text).not.toMatch(/^Net: /m)
    expect(reply.text).not.toContain(SPANISH_CLOSING)
  })

  it('answer in English with a decimal point when the call asks for English', async () => {
    const reply = await ok('grid_areas', { plan: 'casa.json', language: 'en' })
    expect(reply.text).toContain('Net: 41.45 m².')
    expect(reply.text).toContain('Circulation: 9.55 m², 22.4% of gross internal.')
    expect(words(reply.text)).not.toMatch(/\d,\d/)
  })

  it('answer an English plan as before, and in Spanish when the call asks', async () => {
    const english = await ok('grid_areas', { plan: 'house.json' })
    expect(english.text).toContain('Net: 41.45 m².')
    expect(english.text).toContain('Assumed: No country was given, so both gross areas are given')
    const spanish = await ok('grid_areas', { plan: 'house.json', language: 'es-MX' })
    expect(spanish.text).toContain('Superficie útil: 41,45 m².')
  })

  it('answer every grid_schedule in Spanish, with one decimal mark', async () => {
    for (const of of [undefined, 'rooms', 'openings', 'doors', 'windows', 'flats', 'finishes', 'items', 'fixtures']) {
      const reply = await ok('grid_schedule', { plan: 'casa.json', ...(of === undefined ? {} : { of }) })
      expect(words(reply.text), of ?? 'grouped').not.toMatch(/\d\.\d/)
      expect(reply.text, of ?? 'grouped').not.toContain(SPANISH_CLOSING)
    }
    const rooms = await ok('grid_schedule', { plan: 'casa.json', of: 'rooms' })
    expect(rooms.text).toContain('Todas las plantas: 3 estancias, 41,45 m².')
    expect(rooms.text).toContain('2,70 m de alto')
    const grouped = await ok('grid_schedule', { plan: 'casa.json' })
    expect(grouped.text).toContain('1 × ventana 1,80 m de ancho × 1,50 m de alto, antepecho 0,60 m')
    expect(grouped.text).toContain('↔ exterior')
    const doors = await ok('grid_schedule', { plan: 'casa.json', of: 'doors' })
    expect(doors.text).toContain('Cuadro de puertas por tipo, 2 puertas de 2 tipos:')
  })
})

describe('the tools not moved yet', () => {
  it('close a Spanish answer with one line in Spanish that their words are English, and write one decimal mark', async () => {
    const reply = await ok('grid_takeoff', { plan: 'casa.json' })
    expect(reply.text.trimEnd().split('\n').at(-1)).toContain(SPANISH_CLOSING)
    expect(words(reply.text)).not.toMatch(/\d\.\d/)
    expect((await ok('grid_takeoff', { plan: 'house.json' })).text).not.toContain(SPANISH_CLOSING)
  })

  it('give money in an estimate with the display\'s decimal mark', async () => {
    b.write('rates.json', { label: 'MADE-UP TEST RATES', currency: 'TST', rates: { floor: { rate: 1234.5, unit: 'm2' } } })
    const reply = await ok('grid_takeoff', { plan: 'casa.json', for: 'estimate', rates: 'rates.json' })
    expect(reply.text).toMatch(/Total of the priced lines: \d{1,3}(\.\d{3})+,\d\d TST\./)
    const english = await ok('grid_takeoff', { plan: 'house.json', for: 'estimate', rates: 'rates.json' })
    expect(english.text).toMatch(/Total of the priced lines: \d{1,3}(,\d{3})+\.\d\d TST\./)
  })
})

describe('grid_check\'s drawing list', () => {
  it('is in the plan\'s language', async () => {
    const plan = file('casa.json') as { openings: Array<Record<string, unknown>> }
    b.write('wide.json', { ...plan, openings: plan.openings.map((o) => (o['id'] === 'd1' ? { ...o, width: 9 } : o)), written: undefined })
    const spanish = await ok('grid_check', { plan: 'wide.json' })
    const english = await ok('grid_check', { plan: 'wide.json', language: 'en' })
    const said = (reply: Reply): string[] => (reply.data!['drawing'] as Array<{ message: string }>).map((d) => d.message)
    expect(said(english).length).toBeGreaterThan(0)
    expect(said(spanish).length).toBe(said(english).length)
    expect(said(spanish)[0]).not.toBe(said(english)[0])
  })
})

describe('the CSV tables in the plan\'s units', () => {
  it('give lengths in feet, named in the head, with a decimal point', async () => {
    const areas = (await ok('grid_areas', { plan: 'feet.json', format: 'csv' })).text.split('\n')
    expect(areas[1]).toContain('across ft,up ft,net m2,net sq ft')
    expect(areas.find((line) => line.includes('Living room'))).toContain(',14.436,13.78,')
    const rooms = (await ok('grid_schedule', { plan: 'feet.json', of: 'rooms', format: 'csv' })).text.split('\n')
    expect(rooms[1]).toContain('height ft')
    const metres = (await ok('grid_areas', { plan: 'house.json', format: 'csv' })).text.split('\n')
    expect(metres[1]).toContain('across m,up m,net m2')
  })
})

describe('grid_write_rooms records the person\'s language', () => {
  it('from the rooms\' names, when the plan states none', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'nueva.json', rooms: CASA.join('\n') })
    expect((file('nueva.json')['display'] as Record<string, unknown>)['language']).toBe('es')
    expect(reply.text).toContain('The rooms are named in es, so the plan\'s language is now es')
    expect(reply.data!['language']).toBe('es')
  })

  it('from the call, and never over a language the plan states', async () => {
    await ok('grid_write_rooms', { plan: 'asked.json', rooms: HOUSE.join('\n'), language: 'es' })
    expect((file('asked.json')['display'] as Record<string, unknown>)['language']).toBe('es')
    const again = await ok('grid_write_rooms', { plan: 'asked.json', rooms: CASA.join('\n'), language: 'de' })
    expect((file('asked.json')['display'] as Record<string, unknown>)['language']).toBe('es')
    expect(again.data!['language']).toBeNull()
  })

  it('records none for English names', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'plain.json', rooms: HOUSE.join('\n') })
    expect(file('plain.json')['display']).toBeUndefined()
    expect(reply.data!['language']).toBeNull()
  })
})

describe('the rules these answers say', () => {
  it('each have a key, so each is said in the language', async () => {
    const { keyOfWording } = await import('@ongrid/floorplan/messages')
    const { AREA_RULES, SURENESS_RULE } = await import('../../quantities/areas')
    const { SCHEDULE_RULE, ROOM_SCHEDULE_RULE, OPENING_TYPE_RULE, FLAT_SCHEDULE_RULE } = await import('../../quantities/schedule')
    const { FIXTURE_RULES } = await import('../../quantities/fixtures')
    const { FINISH_RULE } = await import('../../quantities/finishes')
    const { HEIGHT_RULE } = await import('../../quantities/measure')
    const { FLAT_AREA_RULE } = await import('@ongrid/floorplan/geometry/areas')
    for (const rule of [...Object.values(AREA_RULES), SCHEDULE_RULE, ROOM_SCHEDULE_RULE, OPENING_TYPE_RULE, FLAT_SCHEDULE_RULE, FIXTURE_RULES.count, FINISH_RULE, HEIGHT_RULE, FLAT_AREA_RULE, SURENESS_RULE]) {
      expect(keyOfWording(rule), rule.slice(0, 40)).toBeDefined()
    }
  })
})
