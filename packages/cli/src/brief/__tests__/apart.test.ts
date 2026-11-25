/**
 * ARE-48: a wish to keep two rooms apart reads the doors and open gaps between them, not only a
 * shared wall, and names the rooms that join them.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import type { BriefLine } from '../lines'

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

/** A clinic: two waiting rooms either side of a reception, each joined to it as `way` says. */
function clinic(way: 'gap' | 'door', extra: string[] = []): unknown {
  const join = (id: string, room: string): string =>
    way === 'gap' ? `opening ${id} between reception and ${room}, centred, 1.5 wide` : `door ${id} between reception and ${room}, centred, 0.9 wide`
  const text = [
    'walls outside 0.3 inside 0.1 height 2.6',
    'room reception "Reception" corridor 6 x 4',
    'room cats "Cat waiting" office 3 x 4 west of reception',
    'room dogs "Dog waiting" office 3 x 4 east of reception',
    'door d-in in reception south, centred, 1.2 wide',
    join('g-cats', 'cats'),
    join('g-dogs', 'dogs'),
    ...extra,
    '',
  ].join('\n')
  const compiled = compileRoomsText(text)
  expect(compiled.problems).toEqual([])
  return compiled.plan
}

async function touchLines(plan: unknown, level: 'avoid' | 'must', rooms: [string, string] = ['Cat waiting', 'Dog waiting']): Promise<BriefLine[]> {
  b = bench({ 'clinic.json': plan })
  const reply = await b.call('grid_write_brief', { plan: 'clinic.json', brief: { touch: [{ rooms, level, source: 'given', quote: 'cats and dogs kept apart' }] } })
  expect(reply.isError, reply.text).toBe(false)
  return (reply.data as { lines: BriefLine[] }).lines.filter((l) => l.wish === 'touch')
}

describe('ARE-48: keeping two rooms apart', () => {
  it('misses two waiting rooms open to one reception, and names the room and the gaps that join them', async () => {
    const [line] = await touchLines(clinic('gap'), 'avoid')
    expect(line!.state).toBe('missed')
    expect(line!.text).toContain('joined through "Reception" by two open gaps')
    expect(line!.parts).toEqual(expect.arrayContaining([{ kind: 'room', id: 'reception' }, { kind: 'opening', id: 'g-cats' }, { kind: 'opening', id: 'g-dogs' }]))
  })

  it('keeps them apart when a door stands on the way, and says so', async () => {
    const [line] = await touchLines(clinic('door'), 'avoid')
    expect(line!.state).toBe('met')
    expect(line!.text).toContain('drawn apart, a door on every way between them')
  })

  it('misses a door straight between the two rooms', async () => {
    const plan = compileRoomsText(
      ['walls outside 0.3 inside 0.1 height 2.6', 'room cats "Cat waiting" office 3 x 4', 'room dogs "Dog waiting" office 3 x 4 east of cats', 'door d-between between cats and dogs, centred, 0.9 wide', ''].join('\n')
    ).plan
    const [line] = await touchLines(plan, 'avoid')
    expect(line!.state).toBe('missed')
    expect(line!.text).toContain('sharing a wall, joined by door "d-between"')
  })

  it('takes the outside for no room between: two rooms open to the street stay apart', async () => {
    const plan = compileRoomsText(
      [
        'walls outside 0.3 inside 0.1 height 2.6',
        'room cats "Cat waiting" office 3 x 4',
        'room store "Store" storage 2 x 4 east of cats',
        'room dogs "Dog waiting" office 3 x 4 east of store',
        'opening o-cats in cats south, centred, 1.5 wide',
        'opening o-dogs in dogs south, centred, 1.5 wide',
        '',
      ].join('\n')
    ).plan
    const [line] = await touchLines(plan, 'avoid')
    expect(line!.state).toBe('met')
    expect(line!.text).toContain('drawn apart.')
  })

  it('still reads a wish to touch by a shared wall', async () => {
    const [far] = await touchLines(clinic('gap'), 'must')
    expect(far!.state).toBe('missed')
    expect(far!.text).toContain('drawn apart.')
    b?.close()
    const [near] = await touchLines(clinic('gap'), 'must', ['Cat waiting', 'Reception'])
    expect(near!.state).toBe('met')
    expect(near!.text).toContain('drawn sharing a wall.')
  })
})
