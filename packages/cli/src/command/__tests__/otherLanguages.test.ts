/**
 * MSG-22: a plan in another language, end to end: its one floor named in the language it is read
 * in, its uses written in the person's own words, and its ids in plain letters.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { runGrid } from '../main'

const t = 0.2
const wall = (id: string, start: [number, number], end: [number, number], kind = 'exterior') => ({ id, start, end, thickness: t, height: 2.7, kind })
/** Two rooms on one floor, with no floor list: a kitchen and a bathroom. */
const plan = {
  version: '1',
  units: 'm',
  walls: [wall('s1', [0, 0], [4, 0]), wall('s2', [4, 0], [7, 0]), wall('e', [7, 0], [7, 4]), wall('n2', [7, 4], [4, 4]), wall('n1', [4, 4], [0, 4]), wall('w', [0, 4], [0, 0]), wall('mid', [4, 0], [4, 4], 'interior')],
  rooms: [
    { id: 'cocina', name: 'Cocina', use: 'kitchen', boundary: ['s1', 'mid', 'n1', 'w'] },
    { id: 'bano', name: 'Baño', use: 'bathroom', boundary: ['s2', 'e', 'n2', 'mid'] },
  ],
  openings: [{ id: 'puerta', wall: 'mid', type: 'door', offset: 1.5, width: 0.8, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': plan, 'es.json': { ...plan, display: { language: 'es-MX' } } })
})
afterAll(() => b.close())

async function grid(...args: string[]): Promise<string> {
  let out = ''
  let err = ''
  const status = await runGrid(args, { stdout: (d) => (out += typeof d === 'string' ? d : ''), stderr: (e) => (err += e), stdoutIsTerminal: false, cwd: b.folder })
  expect(err).toBe('')
  expect(status).toBe(0)
  return out
}

const planOf = (file: string): typeof plan => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as typeof plan

describe('the one floor, in the language it is read in', () => {
  it('is "Planta baja" in a Spanish description and check, and "Ground floor" in English', async () => {
    expect(await grid('describe', 'plan.json', '--lang', 'es', '--for', 'agent')).toContain('Planta baja')
    expect(await grid('describe', 'plan.json', '--for', 'agent')).toContain('Ground floor')
    const record = JSON.parse(await grid('check', 'plan.json', '--lang', 'es', '--json')) as unknown
    expect(JSON.stringify(record)).not.toContain('Ground floor')
  })

  it('reads a plan whose language has a region (es-MX) as Spanish', async () => {
    const text = await grid('describe', 'es.json', '--for', 'agent')
    expect(text).toContain('Planta baja')
    const told = await b.call('grid_describe', { plan: 'plan.json', language: 'es-ES', for: 'agent' })
    expect(told.isError, told.text).toBe(false)
    expect(told.text).toContain('Planta baja')
  })
})

describe('a use in the person\'s own words', () => {
  it('is read as the use by the rename tool and by grid edit', async () => {
    b.write('uses.json', plan)
    const renamed = await b.call('grid_rename_room', { plan: 'uses.json', room: 'cocina', use: 'Flur' })
    expect(renamed.isError, renamed.text).toBe(false)
    expect(planOf('uses.json').rooms.find((r) => r.id === 'cocina')!.use).toBe('corridor')
    await grid('edit', 'rename', 'uses.json', '--room', 'cocina', '--use', 'cocina')
    expect(planOf('uses.json').rooms.find((r) => r.id === 'cocina')!.use).toBe('kitchen')
    const none = await b.call('grid_rename_room', { plan: 'uses.json', room: 'cocina', use: 'none' })
    expect(none.isError, none.text).toBe(false)
    expect(planOf('uses.json').rooms.find((r) => r.id === 'cocina')!.use).toBeUndefined()
  })

  it('refuses a word that is no use, with the uses it takes', async () => {
    const refused = await b.call('grid_rename_room', { plan: 'plan.json', room: 'cocina', use: 'sala' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('kitchen')
    expect(refused.text).not.toContain('sala')
  })

  it('is kept as the use it means in the brief', async () => {
    const written = await b.call('grid_write_brief', { plan: 'plan.json', brief: { rooms: [{ use: 'dormitorio', count: 2, level: 'must', source: 'given', quote: 'dos dormitorios' }, { use: '卫生间', count: 1, level: 'must', source: 'given', quote: 'un baño' }] } })
    expect(written.isError, written.text).toBe(false)
    const brief = JSON.parse(readFileSync(join(b.folder, 'plan.brief.json'), 'utf8')) as { rooms: { use: string }[] }
    expect(brief.rooms.map((r) => r.use)).toEqual(['bedroom', 'bathroom'])
  })
})

describe('ids in plain letters', () => {
  it('reads an id given with accents as the plain id rooms text writes', async () => {
    b.write('ids.json', plan)
    const renamed = await b.call('grid_rename_room', { plan: 'ids.json', room: 'baño', name: 'Baño grande' })
    expect(renamed.isError, renamed.text).toBe(false)
    expect(planOf('ids.json').rooms.find((r) => r.id === 'bano')!.name).toBe('Baño grande')
  })

  it('writes rooms text with accented ids in plain letters, and says so', async () => {
    const written = await b.call('grid_write_rooms', { plan: 'written.json', rooms: 'room salón "Salón" salón 4 x 3.5 at 0,0\nroom baño "Baño" baño 2 x 2 east of salón\ndoor puerta between salón and baño, centred, 0.8 wide' })
    expect(written.isError, written.text).toBe(false)
    expect(written.text).toContain("'baño' is 'bano'")
    expect(planOf('written.json').rooms.map((r) => r.id)).toEqual(['salon', 'bano'])
    const view = await b.call('grid_describe', { plan: 'written.json', for: 'agent' })
    expect(view.isError, view.text).toBe(false)
  })
})
