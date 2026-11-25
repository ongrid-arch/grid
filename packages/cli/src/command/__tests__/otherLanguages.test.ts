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
