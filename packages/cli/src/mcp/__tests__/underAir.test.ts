/**
 * ARE-60: grid_areas and grid_compare give the living area under air and the total under roof,
 * each with its rule, and lead with them for a plan built in the US.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { MEASURES } from '@ongrid/floorplan/geometry'
import { bench, type Bench } from './replay/harness'

const house = (extra: Record<string, unknown> = {}, more: readonly string[] = []) => ({
  ...(compileRoomsText([
    'walls outside 0.3 inside 0.1 height 2.7',
    'room living "Living" living 6 x 5 at 0,0',
    'room garage "Garage" parking 3 x 5 east of living',
    ...more,
  ].join('\n')).plan as object),
  ...extra,
})

let b: Bench | undefined
afterAll(() => b?.close())
const open = (files: Record<string, unknown>): Bench => {
  b?.close()
  b = bench(files)
  return b
}

describe('grid_areas, the area under air (ARE-60)', () => {
  it('leads a US plan with the area under air and the total under roof, each with its rule', async () => {
    const reply = await open({ 'us.json': house({ site: { country: 'US' } }) }).call('grid_areas', { plan: 'us.json' })
    expect(reply.isError, reply.text).not.toBe(true)
    const data = reply.data as Record<string, unknown>
    expect(data['conditioned'] as number).toBeCloseTo(6.4 * 5.6, 6)
    expect(data['underRoof'] as number).toBeCloseTo(9.7 * 5.6, 6)
    const lines = reply.text.split('\n')
    const first = lines.findIndex((line) => line.startsWith(`${MEASURES.conditioned.name}: `))
    expect(first).toBeGreaterThan(-1)
    expect(lines[first]).toContain(MEASURES.conditioned.measures)
    expect(lines[first + 1]).toMatch(new RegExp(`^${MEASURES.underRoof.name}: `))
    expect(first).toBeLessThan(lines.findIndex((line) => line.startsWith('Net: ')))
    expect(reply.text).toContain('"Garage" (parking): ')
    expect(reply.text).toContain(', not under air: in the total under roof only')
    expect(reply.text).toContain('One room is not under air, "Garage" (used for parking): its 15.00 m²')
    expect((data['measures'] as { measure: string }[]).map((m) => m.measure)).toContain('conditioned')
  })

  it('gives the figures in the data only for a plan built elsewhere that states no room heated', async () => {
    const reply = await open({ 'gb.json': house({ site: { country: 'GB' } }) }).call('grid_areas', { plan: 'gb.json' })
    expect((reply.data as Record<string, unknown>)['conditioned'] as number).toBeCloseTo(6.4 * 5.6, 6)
    expect(reply.text).not.toContain(MEASURES.conditioned.name)
  })

  it('says them after the gross figures where a room states it, outside the US', async () => {
    const plan = house({}, [])
    const rooms = (plan as { rooms: Record<string, unknown>[] }).rooms.map((room) => (room['id'] === 'garage' ? { ...room, conditioned: false } : room))
    const reply = await open({ 'p.json': { ...plan, rooms } }).call('grid_areas', { plan: 'p.json' })
    const lines = reply.text.split('\n')
    expect(lines.findIndex((line) => line.startsWith(`${MEASURES.conditioned.name}: `))).toBeGreaterThan(lines.findIndex((line) => line.startsWith('Gross external: ')))
    expect(reply.text).toContain('"Garage" (marked unconditioned)')
  })

  it('puts them first in the CSV of a US plan', async () => {
    const reply = await open({ 'us.json': house({ site: { country: 'US' } }) }).call('grid_areas', { plan: 'us.json', format: 'csv' })
    const names = reply.text.trim().split('\n').slice(-6, -1).map((row) => row.split(',')[2])
    expect(names).toEqual([MEASURES.conditioned.name, MEASURES.underRoof.name, 'Net total', 'Gross internal', 'Gross external'])
  })
})

describe('grid_compare, the area under air (ARE-60)', () => {
  it('carries both figures in each option, and leads a US option\'s line with them', async () => {
    const heated = house({ site: { country: 'US' } })
    const rooms = (heated as { rooms: Record<string, unknown>[] }).rooms.map((room) => (room['id'] === 'garage' ? { ...room, conditioned: true } : room))
    const reply = await open({ 'a.json': house({ site: { country: 'US' } }), 'b.json': { ...heated, rooms } }).call('grid_compare', { plans: ['a.json', 'b.json'] })
    expect(reply.isError, reply.text).not.toBe(true)
    const options = (reply.data as { options: { conditioned: number; underRoof: number }[] }).options
    expect(options[0]!.conditioned).toBeCloseTo(6.4 * 5.6, 6)
    expect(options[1]!.conditioned).toBeCloseTo(9.7 * 5.6, 6)
    expect(options[0]!.underRoof).toBeCloseTo(9.7 * 5.6, 6)
    expect(reply.text).toMatch(/^ {2}A: 35\.84 m² under air, 54\.32 m² under roof; net /m)
    expect(reply.text).toContain(MEASURES.conditioned.measures)
  })
})
