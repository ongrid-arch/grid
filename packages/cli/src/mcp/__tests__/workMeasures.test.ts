/**
 * ARE-79: grid_measure what=work, the measures of the work as measures, and grid_areas' figures
 * quoted where the plan will be built: Spain's useful and built areas, and a US home's area under
 * air above the ground.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench } from './replay/harness'

let b: Bench | undefined
afterAll(() => b?.close())
const open = (files: Record<string, unknown>): Bench => {
  b?.close()
  b = bench(files)
  return b
}

const wall = (id: string, start: [number, number], end: [number, number], phase: 'existing' | 'new', kind: 'exterior' | 'interior' = 'exterior') =>
  ({ id, start, end, thickness: kind === 'exterior' ? 0.3 : 0.1, height: 2.5, kind, phase })

/** A house of two rooms, 8 x 4 m on its walls' centre lines, with a new room 3 m deep on its north side. */
const extension = {
  version: '1',
  units: 'm',
  north: 0,
  walls: [
    wall('s', [0, 0], [8, 0], 'existing'),
    wall('e', [8, 0], [8, 4], 'existing'),
    wall('n', [8, 4], [0, 4], 'existing'),
    wall('w', [0, 4], [0, 0], 'existing'),
    wall('p', [4, 0], [4, 4], 'existing', 'interior'),
    wall('w2', [0, 7], [0, 4], 'new'),
    wall('n2', [8, 7], [0, 7], 'new'),
    wall('e2', [8, 4], [8, 7], 'new'),
  ],
  rooms: [
    { id: 'a', name: 'Living', use: 'living', boundary: ['s', 'p', 'n', 'w'], phase: 'existing' },
    { id: 'b', name: 'Kitchen', use: 'kitchen', boundary: ['s', 'e', 'n', 'p'], phase: 'existing' },
    { id: 'c', name: 'Garden room', use: 'living', boundary: ['n', 'e2', 'n2', 'w2'], phase: 'new' },
  ],
  openings: [],
  site: { boundary: [[-5, -5], [15, -5], [15, 25], [-5, 25]], country: 'GB' },
}

describe('grid_measure what=work (ARE-79)', () => {
  it('gives the depth, heights, floor, volume, plot left and boundary distances as measures', async () => {
    const reply = await open({ 'ext.json': extension }).call('grid_measure', { plan: 'ext.json', what: 'work' })
    expect(reply.isError, reply.text).not.toBe(true)
    const text = reply.text
    expect(text).toContain('They are measures: Grid applies no rule to them and does not say whether the work needs permission.')
    expect(text).toContain('It reaches 3.00 m past the building\'s old outline on its north side, 8.30 m across.')
    expect(text).toContain('On the ground it adds 24.90 m² of footprint: 35.69 m² before the work, 60.59 m² after it.')
    expect(text).toContain('The tops of the new walls stand 2.50 m above the ground (3 walls).')
    expect(text).toContain('The new rooms hold 52.0 m³ inside their walls, ceilings and roof: "Garden room" 52.0 m³.')
    expect(text).toContain('The plot left unbuilt: 564.31 m² before the work, 539.41 m² after it, 89.9% of the 600.00 m² plot.')
    expect(text).toContain('the north boundary: 17.85 m to the new parts; the building 20.85 m before the work, 17.85 m after it.')
    expect(text).not.toMatch(/permitted|allowed|complies/i)
    const answer = (reply.data as { answer: Record<string, unknown> }).answer
    expect(answer['newRooms']).toEqual(['c'])
    expect((answer['depths'] as { faces: string; depth: number }[]).map((d) => [d.faces, d.depth])).toEqual([['north', 3]])
    expect(answer['volume']).toBeCloseTo(7.7 * 2.7 * 2.5, 3)
    expect((answer['area'] as { grossExternal: { change: number } }).grossExternal.change).toBeCloseTo(24.9, 3)
  })

  it('says so on a plan whose parts carry no phases, and takes no other argument', async () => {
    const unphased = <T extends { phase?: string }>(part: T): T => {
      const own = { ...part }
      delete own.phase
      return own
    }
    const plain = { ...extension, walls: extension.walls.slice(0, 5).map(unphased), rooms: extension.rooms.slice(0, 2).map(unphased) }
    const bench = open({ 'plain.json': plain })
    const reply = await bench.call('grid_measure', { plan: 'plain.json', what: 'work' })
    expect(reply.text).toContain('The plan marks no part existing, demolished or new, so there is no work to measure')
    const refused = await bench.call('grid_measure', { plan: 'plain.json', what: 'work', room: 'a' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('what=work takes no other argument, not room.')
  })
})

/** Two flats either side of a shared stair hall, on one floor. */
function flats(country: string): Record<string, unknown> {
  const raw = compileRoomsText([
    'walls outside 0.3 inside 0.2 height 2.7',
    'room f1 "Flat 1" living 6 x 5 at 0,0',
    'room hall "Stair hall" corridor 2 x 5 east of f1',
    'room f2 "Flat 2" living 4 x 5 east of hall',
  ].join('\n')).plan as Record<string, unknown>
  return { ...raw, site: { country }, flats: [{ id: 'A', name: 'Flat 1', rooms: ['f1'] }, { id: 'B', name: 'Flat 2', rooms: ['f2'] }] }
}

describe('grid_areas, the figures quoted where the plan is built (ARE-79)', () => {
  it('gives Spain\'s useful area and built area without and with the shared parts, per flat', async () => {
    const reply = await open({ 'es.json': flats('ES') }).call('grid_areas', { plan: 'es.json' })
    expect(reply.isError, reply.text).not.toBe(true)
    const local = (reply.data as { local: { country: string; useful: number; built: number; builtShared: number; flats: { id: string; useful: number; built: number; builtShared: number }[] } }).local
    expect(local.country).toBe('ES')
    expect(local.useful).toBeCloseTo(30 + 10 + 20, 6)
    const [a, bFlat] = local.flats
    expect(a!.useful).toBeCloseTo(30, 6)
    expect(bFlat!.useful).toBeCloseTo(20, 6)
    // Each flat to the outside face of its outer walls and the middle of the walls to the hall.
    expect(a!.built).toBeCloseTo(6.4 * 5.6, 6)
    expect(bFlat!.built).toBeCloseTo(4.4 * 5.6, 6)
    expect(local.built).toBeCloseTo(a!.built + bFlat!.built, 6)
    // The hall's built area shared out by the flats' built areas: the two add up to the whole.
    expect(a!.builtShared + bFlat!.builtShared).toBeCloseTo(local.builtShared, 6)
    expect(a!.builtShared / bFlat!.builtShared).toBeCloseTo(a!.built / bFlat!.built, 3)
    expect(reply.text).toContain('The figures usually quoted for a home in Spain, by Grid\'s own reading of them:')
    expect(reply.text).toContain('Useful area: 60.00 m².')
    expect(reply.text).toMatch(/"Flat 1": useful 30\.00 m², built 35\.84 m², built with the shared parts \d+\.\d\d m²\./)
    expect(reply.text).toContain('they follow no published standard')
  })

  it('gives them in Spanish for a plan shown in Spanish', async () => {
    const reply = await open({ 'es.json': { ...flats('ES'), display: { language: 'es' } } }).call('grid_areas', { plan: 'es.json' })
    expect(reply.isError, reply.text).not.toBe(true)
    expect(reply.text).toContain('Superficie útil: 60,00 m².')
    expect(reply.text).toContain('Superficie construida con zonas comunes')
  })

  it('gives a US home\'s area under air above the ground, a heated basement out', async () => {
    const raw = compileRoomsText([
      'walls outside 0.3 inside 0.1 height 2.7',
      'floor basement "Basement" level -1',
      'room den "Den" living 6 x 5 at 0,0',
      'floor ground "Ground floor" level 0',
      'room living "Living" living 6 x 5 at 0,0',
    ].join('\n')).plan as Record<string, unknown>
    const reply = await open({ 'us.json': { ...raw, site: { country: 'US' } } }).call('grid_areas', { plan: 'us.json' })
    expect(reply.isError, reply.text).not.toBe(true)
    const local = (reply.data as { local: { country: string; aboveGround: number; conditioned: number; floors: string[] } }).local
    expect(local.country).toBe('US')
    expect(local.floors).toEqual(['ground'])
    expect(local.aboveGround).toBeCloseTo(6.6 * 5.6, 6)
    expect(local.conditioned).toBeCloseTo(2 * 6.6 * 5.6, 6)
    const lines = reply.text.split('\n')
    expect(lines.findIndex((l) => l.includes('Living area under air above the ground: 36.96 m²; with the floors below the ground floor, 73.92 m².'))).toBeLessThan(lines.findIndex((l) => l.startsWith('Net: ')))
  })

  it('gives none for a country Grid has none for', async () => {
    const reply = await open({ 'gb.json': flats('GB') }).call('grid_areas', { plan: 'gb.json' })
    expect((reply.data as Record<string, unknown>)['local']).toBeUndefined()
  })
})
