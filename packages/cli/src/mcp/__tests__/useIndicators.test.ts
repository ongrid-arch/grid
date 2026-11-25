/**
 * CNT-13: use indicators in grid_measure. what=use gives a room's turning circle, each
 * doorway's clear width, the way through it, the floor round each fixture and a window a
 * fixture stands in front of; what=route with width says whether a body or a trolley that wide
 * gets through, clear of the fixtures. Each line says what it measured and the width it set it
 * against, the person's or Grid's own, and is labelled as an indicator. No line reads as a pass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { bench, type Bench, type Reply } from './replay/harness'

/**
 * A 6 × 4 m flat: a hall down the left (1.15 m between faces), a bathroom and a bedroom off it.
 * The front door is low in the hall's west wall, so the way from the bedroom out runs down the
 * hall past a cupboard (a kitchen run) that leaves 0.65 m beside it.
 */
function flat(items: unknown[]): unknown {
  const wall = (id: string, start: number[], end: number[], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1', [0, 0], [1.3, 0]),
      wall('s2', [1.3, 0], [6, 0]),
      wall('e1', [6, 0], [6, 2]),
      wall('e2', [6, 2], [6, 4]),
      wall('n2', [6, 4], [1.3, 4]),
      wall('n1', [1.3, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      { ...wall('hx1', [1.3, 0], [1.3, 2], 'interior'), thickness: 0.1 },
      { ...wall('hx2', [1.3, 2], [1.3, 4], 'interior'), thickness: 0.1 },
      { ...wall('mid', [1.3, 2], [6, 2], 'interior'), thickness: 0.1 },
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s1', 'hx1', 'hx2', 'n1', 'w'], use: 'corridor' },
      { id: 'bath', name: 'Bathroom', boundary: ['s2', 'e1', 'mid', 'hx1'], use: 'bathroom' },
      { id: 'bed', name: 'Bedroom', boundary: ['mid', 'e2', 'n2', 'hx2'], use: 'bedroom' },
    ],
    openings: [
      { id: 'front', wall: 'w', type: 'door', offset: 3, width: 0.9, height: 2.1 },
      { id: 'door-bath', wall: 'hx1', type: 'door', offset: 0.6, width: 0.8, height: 2.1 },
      { id: 'door-bed', wall: 'hx2', type: 'door', offset: 0.6, width: 0.8, height: 2.1 },
      { id: 'win-bath', wall: 'e1', type: 'window', offset: 0.5, width: 1, sill: 0.6, height: 1.2 },
    ],
    items,
  }
}

const BATH = { id: 'tub', kind: 'bath', at: [3, 0.45], size: [1.7, 0.7], height: 0.55 }
const WC = { id: 'wc', kind: 'toilet', at: [5.6, 1], size: [0.4, 0.6], height: 0.8, turn: 90 }
const CUPBOARD = { id: 'store', kind: 'kitchen-run', label: 'Cupboard', at: [0.35, 2], size: [0.5, 0.8], height: 2 }

let b: Bench
beforeAll(() => {
  b = bench({ 'flat.json': flat([BATH, WC, CUPBOARD]), 'empty.json': flat([]) })
})
afterAll(() => b.close())

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_measure', { plan: 'flat.json', ...args })
  expect(reply.isError, reply.text).toBe(false)
  expect(reply.text.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
  expect(approvalWords(reply.text)).toEqual([])
  console.log('=====', JSON.stringify(args), '\n' + reply.text)
  return reply
}

type Indicator = { code: string; about: string; measured: number | null; figure: { value: number; from: string }; under: boolean; detail?: Record<string, unknown> }
const indicators = (reply: Reply): Indicator[] => (reply.data!['answer'] as { indicators: Indicator[] }).indicators

describe('a room\'s use indicators (what=use)', () => {
  it('says what each measured and against which figure, Grid\'s own when the person gives none, as an indicator', async () => {
    const reply = await ok({ what: 'use', room: 'bath' })
    const lines = reply.text.split('\n').filter((l) => l.startsWith('Indicator'))
    expect(lines.length).toBeGreaterThanOrEqual(6)
    for (const line of lines) expect(line).toMatch(/Grid's own (indicator of|approach depth of) \d/)
    expect(reply.text).toContain('An indicator, measured on the plan')
    expect(reply.text).toContain('not a rule from any code or standard')
    expect(indicators(reply).map((i) => [i.code, i.about])).toEqual([
      ['use/turning-space', 'bath'],
      ['use/doorway-clear-width', 'door-bath'],
      ['use/passage-width', 'bath'],
      ['use/space-by-fixture', 'tub'],
      ['use/space-by-fixture', 'wc'],
      ['use/window-blocked', 'win-bath'],
    ])
  })

  it('gives the clear width a doorway leaves: the hole less the open leaf', async () => {
    const reply = await ok({ what: 'use', room: 'bath' })
    expect(reply.text).toContain('Indicator, clear width of a doorway: door "door-bath" leaves 0.75 m clear, its 0.80 m hole less 0.05 m for the open leaf; under Grid\'s own indicator of 0.80 m.')
    const door = indicators(reply).find((i) => i.code === 'use/doorway-clear-width')!
    expect(door).toMatchObject({ figure: { value: 0.8, from: 'grid' }, under: true })
    expect(door.measured).toBeCloseTo(0.75, 9)
  })

  it('takes the person\'s own figures when given, and says so', async () => {
    const reply = await ok({ what: 'use', room: 'bath', width: 0.7, diameter: 1.2, clearance: 0.5 })
    expect(reply.text).toContain('leaves 0.75 m clear, its 0.80 m hole less 0.05 m for the open leaf; at least the 0.70 m you gave.')
    expect(reply.text).toMatch(/Indicator, turning space: the widest circle the free floor of "Bathroom" holds is 1\.\d\d m across, centred at \([\d.]+, [\d.]+\), clear of its 2 fixtures; at least the 1\.20 m you gave\./)
    for (const i of indicators(reply).filter((i) => i.code !== 'use/window-blocked')) expect(i.figure.from, i.code).toBe('person')
  })

  it('measures the floor in front of and beside each fixture, and the window the toilet stands in front of', async () => {
    const reply = await ok({ what: 'use', room: 'bath' })
    // The bath's front faces +y: from y 0.8 to the face of the dividing wall at 1.95.
    expect(reply.text).toContain('Indicator, space in front of and beside a fixture: bath "tub" has clear floor in front 1.15 m, to its left 0.80 m, to its right')
    const wc = indicators(reply).find((i) => i.about === 'wc')!
    // Turned to face -x, its right is +y: from y 1.2 to the dividing wall's face at 1.95.
    expect(wc.detail!['right']).toBeCloseTo(0.75, 5)
    expect(reply.text).toContain('Indicator, window blocked: toilet "wc", higher than its 0.60 m sill, stands in front of 0.40 m of window "win-bath"\'s 1.00 m, measured within Grid\'s own approach depth of 0.30 m.')
  })

  it('measures the way through a room from its one doorway to its widest point, clear of the bath', async () => {
    const reply = await ok({ what: 'use', room: 'bath' })
    expect(reply.text).toMatch(/Indicator, way through a room: the widest body or trolley that gets through "Bathroom" from "door-bath" to its widest point is \d\.\d\d m/)
  })

  it('says a room with no fixtures holds none', async () => {
    const reply = await b.call('grid_measure', { plan: 'empty.json', what: 'use', room: 'bed' })
    expect(reply.text).toContain('the room holds no fixtures')
    expect(reply.text).not.toContain('space in front of')
  })

  it('refuses an argument use does not take', async () => {
    const reply = await b.call('grid_measure', { plan: 'flat.json', what: 'use', room: 'bath', under: 1 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('what=use takes room, width, diameter, clearance, not under.')
  })
})

describe('a way for a body or a trolley (what=route with width)', () => {
  it('gets through when every room and doorway on the way is at least that wide', async () => {
    const reply = await ok({ what: 'route', room: 'bed', to: 'outside', width: 0.6 })
    expect(reply.text).toContain('Indicator, way through a room: from "Bedroom" to outside for a body or trolley 0.60 m wide (the width you gave): it gets through, door "door-bed" (0.75 m clear) into "Hall", then door "front" (0.85 m clear) into outside.')
    expect(reply.text).toMatch(/"Hall" 0\.6\d m at its narrowest, at \([\d.]+, [\d.]+\), between "Cupboard" \(kitchen run "store"\) and a wall/)
    expect(reply.data!['answer']).toMatchObject({ found: true, code: 'use/passage-width', through: true, width: 0.6, figure: { value: 0.6, from: 'person' } })
  })

  it('says what stops a wider one, and that no other way is that wide', async () => {
    const reply = await ok({ what: 'route', room: 'bed', to: 'outside', width: 0.7 })
    expect(reply.text).toMatch(/it does not get through: the way through "Hall" is 0\.6\d m\./)
    expect(reply.text).toContain('No way through the plan\'s doors and openings is 0.70 m wide all along.')
    expect((reply.data!['answer'] as { narrower: unknown[] }).narrower).toEqual([{ kind: 'room', id: 'hall', width: expect.any(Number) }])
  })

  it('names a doorway narrower than the body, with its clear width', async () => {
    const reply = await ok({ what: 'route', room: 'hall', to: 'bed', width: 0.78 })
    expect(reply.text).toContain('it does not get through: "door-bed" leaves 0.75 m clear.')
  })

  it('answers with the same fields without a width, set against Grid\'s own indicator', async () => {
    const without = await b.call('grid_measure', { plan: 'flat.json', what: 'route', room: 'bed', to: 'outside' })
    const given = await ok({ what: 'route', room: 'bed', to: 'outside', width: 0.7 })
    expect(without.text).toContain('Narrowest door or opening on the way: "door-bed", 0.80 m.')
    expect(without.text).toContain('a body or trolley 0.90 m wide (Grid\'s own indicator)')
    const a = without.data!['answer'] as Record<string, unknown>
    const g = given.data!['answer'] as Record<string, unknown>
    expect(Object.keys(a).sort()).toEqual(Object.keys(g).sort())
    for (const key of ['length', 'legs', 'steps', 'narrowestPassage', 'through', 'way', 'shortest', 'narrower', 'figure']) expect(a).toHaveProperty(key)
    expect(a['figure']).toEqual({ value: 0.9, from: 'grid' })
    expect(g['figure']).toEqual({ value: 0.7, from: 'person' })
    expect(typeof a['length']).toBe('number')
    expect(a['length']).toBe(g['length'])
    expect(g['narrowestPassage']).toEqual(a['narrowestPassage'])
  })

  it('gives the length and the legs with a width too', async () => {
    const reply = await ok({ what: 'route', room: 'bed', to: 'outside', width: 0.6 })
    expect(reply.text).toContain('Narrowest door or opening on the way')
    expect(reply.text).toMatch(/Walked, \d+\.\d\d m: /)
    expect((reply.data!['answer'] as { legs: unknown[] }).legs.length).toBeGreaterThan(0)
  })
})
