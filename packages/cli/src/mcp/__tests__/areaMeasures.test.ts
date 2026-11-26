/**
 * ARE-14: grid_areas with the measures that need the later parts of the plan. The four-flat floor
 * gives each flat's area to the middle of its party walls with the rule's sentence (lab R-1); a
 * balcony is left out of every total, or counted by a rule the person states, and the answer says
 * which (CNT-7); and a shop's floor area and free floor are a quarter apart, each labelled (lab
 * S-6).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { bench, type Bench, type Reply } from './replay/harness'

const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const FOUR_FLATS = readFileSync(resolve(FLOORPLAN_FIXTURES, 'rooms/four-flats.rooms'), 'utf8')

/** The lab's flat with a balcony, the balcony marked as outdoor space and the flat listed. */
function balconyFlat(): unknown {
  const raw = JSON.parse(labPlanText('G/scenarios/s03a-flat-balcony.json')) as { rooms: { id: string }[] }
  const rooms = raw.rooms.map((room) => (room.id === 'balcony' ? { ...room, outdoor: 'balcony' } : room))
  return { ...raw, rooms, flats: [{ id: 'F', name: 'Flat 3A', rooms: rooms.map((room) => room.id) }] }
}

/** The lab's house with its gardens, its driveway and its side passages marked as outdoor space (lab EL-8). */
function houseWithGardens(): unknown {
  const raw = JSON.parse(labPlanText('G/scenarios/s01c-plot-virtual.json')) as { rooms: { id: string }[] }
  const kinds: Record<string, string> = { 'front-garden': 'garden', driveway: 'other', 'front-east': 'garden', 'side-w': 'other', 'side-e': 'other', 'back-garden': 'garden' }
  return { ...raw, rooms: raw.rooms.map((room) => (kinds[room.id] === undefined ? room : { ...room, outdoor: kinds[room.id] })) }
}

/**
 * A shop 10 × 6 m inside its 0.2 m walls (60 m²), with two shelving runs and a counter fixed to the
 * floor, 15 m² of them, drawn as kitchen runs (the only run of units a plan holds yet, CNT-11). The
 * counter stands in the till, a zone of the shop 2.5 m deep behind a line.
 */
function shop(): unknown {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 3, kind: 'exterior' })
  const run = (id: string, label: string, at: number[], size: number[]) => ({ id, kind: 'kitchen-run', label, at, size, height: 1.8 })
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1', [0, 0], [7.6, 0]),
      wall('s2', [7.6, 0], [10.2, 0]),
      wall('e', [10.2, 0], [10.2, 6.2]),
      wall('n2', [10.2, 6.2], [7.6, 6.2]),
      wall('n1', [7.6, 6.2], [0, 6.2]),
      wall('w', [0, 6.2], [0, 0]),
      { id: 'till-line', start: [7.6, 0], end: [7.6, 6.2], thickness: 0, height: 3, kind: 'interior', virtual: true },
    ],
    rooms: [
      { id: 'shop', name: 'Shop', use: 'retail', boundary: ['s1', 's2', 'e', 'n2', 'n1', 'w'] },
      { id: 'till', name: 'Till', use: 'retail', partOf: 'shop', boundary: ['s2', 'e', 'n2', 'till-line'] },
    ],
    openings: [{ id: 'entrance', wall: 's1', type: 'door', offset: 2, width: 1.8, height: 2.4 }],
    items: [
      run('shelf-1', 'Shelving', [3.1, 1.6], [5, 1]),
      run('shelf-2', 'Shelving', [3.1, 4.6], [5, 1]),
      run('counter', 'Counter', [8.6, 3.1], [1, 5]),
    ],
  }
}

let b: Bench
beforeAll(async () => {
  b = bench({ 'balcony.json': balconyFlat(), 'shop.json': shop(), 'house.json': houseWithGardens(), 'stated-gb.json': { ...(balconyFlat() as object), site: { country: 'GB' } } })
  const wrote = await b.call('grid_write_rooms', { plan: 'four.json', rooms: FOUR_FLATS })
  expect(wrote.isError, wrote.text).toBe(false)
})
afterAll(() => b.close())

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_areas', args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('ARE-14 an area per flat to the middle of the party walls (lab R-1)', () => {
  it('gives each flat of the four-flat floor its area to the party walls, both faces, with the rule sentence', async () => {
    const reply = await ok({ plan: 'four.json' })
    const flats = reply.data!['flats'] as { id: string; net: number; toPartyWalls: { grossInternal: number; grossExternal: number } }[]
    expect(flats.map((f) => [f.id, Number(f.toPartyWalls.grossInternal.toFixed(2)), Number(f.toPartyWalls.grossExternal.toFixed(2))])).toEqual([
      ['A', 72.95, 79.11],
      ['B', 72.95, 79.11],
      ['C', 105.49, 112.98],
      ['D', 105.49, 112.98],
    ])
    expect(reply.text).toContain('  "Flat A" (One bedroom; 5 rooms): 68.27 m²; to the party walls 72.95 m² to the inside face of the outer walls, 79.11 m² to the outside face of the outer walls')
    expect(reply.text).toContain("Area to the party walls: Area to the party walls is the floor of a flat's rooms with the walls and partitions between them, measured to the middle of each wall it shares with another flat")
    expect(reply.text).toMatch(/Area to the party walls: Nothing inside the flat is taken off/)
    const common = reply.data!['notInFlatsToPartyWalls'] as { grossInternal: number; grossExternal: number }
    // The flats and the common parts add up to the floor's gross areas: no floor is left unclaimed here.
    const sum = (key: 'grossInternal' | 'grossExternal'): number => flats.reduce((s, f) => s + f.toPartyWalls[key], 0) + common[key]
    expect(sum('grossInternal')).toBeCloseTo(reply.data!['grossInternal'] as number, 1)
    expect(sum('grossExternal')).toBeCloseTo(reply.data!['grossExternal'] as number, 1)
  })

  it('gives only the face the reader asked for in the text, and both in the data', async () => {
    const reply = await ok({ plan: 'four.json', country: 'GB' })
    expect(reply.text).toContain('68.27 m²; to the party walls 72.95 m² to the inside face of the outer walls')
    expect(reply.text).not.toContain('to the outside face of the outer walls')
    const flats = reply.data!['flats'] as { toPartyWalls: { grossExternal: number } }[]
    expect(flats[0]!.toPartyWalls.grossExternal).toBeCloseTo(79.11, 2)
  })
})

describe('ARE-59 the plan\'s own country is read, and the argument only overrides it', () => {
  it('gives the gross measure usual where the plan says it stands, with no country argument', async () => {
    const reply = await ok({ plan: 'stated-gb.json' })
    expect(reply.text).not.toContain('No country was given')
    expect(reply.text).toContain('For GB Grid gives the inside face')
  })

  it('lets the country argument override the plan\'s', async () => {
    const us = await ok({ plan: 'stated-gb.json', country: 'US' })
    expect(us.text).toContain('For homes in US Grid gives the outside face')
  })
})

describe('ARE-14 a balcony left out, or counted by the person\'s rule (CNT-7)', () => {
  it('says the balcony is left out of every total when no rule is stated', async () => {
    const reply = await ok({ plan: 'balcony.json' })
    expect(reply.text).toContain('No rule you stated counts any of it, so it is left out of every total.')
    expect(reply.text).toMatch(/"Flat 3A" \(6 rooms\): 76\.34 m²; to the party walls .*; outdoor space 4\.50 m², listed apart/)
    expect((reply.data!['outdoor'] as { weighted: unknown }).weighted).toBeNull()
  })

  it('counts the share the rule states, beside the net and never in it, and names the rule as the person\'s', async () => {
    const plain = await ok({ plan: 'balcony.json' })
    const rule = 'Half of each balcony, as the lender counts it'
    const reply = await ok({ plan: 'balcony.json', outdoor_rules: { balcony: { share: 0.5, rule } } })
    expect(reply.data!['net']).toBe(plain.data!['net'])
    expect(reply.text).toContain(`Your rule counts 50% of each balcony, and Grid has not checked it (${rule}): 2.25 m².`)
    expect(reply.text).toContain('Net with the outdoor space your rules count: 78.59 m². Every other figure here leaves it out.')
    expect(reply.text).toContain('outdoor space 4.50 m², of which your rules count 2.25 m²: 78.59 m² with it')
    expect(reply.text).not.toContain('No rule you stated counts any of it')
    const weighted = (reply.data!['outdoor'] as { weighted: { kinds: { kind: string; share: number }[]; withNet: number } }).weighted
    expect(weighted.kinds.map((k) => [k.kind, k.share])).toEqual([['balcony', 0.5]])
  })

  it('says which kinds no stated rule counts, and that none is counted when its rule names a kind the plan has none of', async () => {
    const reply = await ok({ plan: 'house.json', outdoor_rules: { garden: { share: 0.1, rule: 'A tenth of a garden, as the person counts it' } } })
    expect(reply.text).toMatch(/Your rule counts 10% of each garden, and Grid has not checked it \(A tenth of a garden, as the person counts it\): \d+\.\d\d m²\./)
    expect(reply.text).toContain('No rule you stated counts any outdoor space, so that space is left out of every total.')
    const none = await ok({ plan: 'balcony.json', outdoor_rules: { terrace: { share: 1, rule: 'All of a terrace, as the person counts it' } } })
    expect(none.text).toContain('No rule you stated counts any of it, so it is left out of every total.')
  })

  it('refuses a kind Grid does not know, a share past 1 and a rule left empty, by name', async () => {
    for (const [rules, said] of [
      [{ roof: { share: 0.5, rule: 'x' } }, 'outdoor_rules names a kind of outdoor space Grid does not know'],
      [{ balcony: { share: 2, rule: 'Twice a balcony' } }, 'outdoor_rules.balcony.share takes a number from 0 to 1'],
      [{ balcony: { share: 0.5, rule: ' ' } }, 'outdoor_rules.balcony.rule takes the rule'],
      [{ balcony: { share: 0.5, rule: 'Half', note: 'x' } }, 'outdoor_rules.balcony takes share and rule only'],
    ] as const) {
      const reply = await b.call('grid_areas', { plan: 'balcony.json', outdoor_rules: rules })
      expect(reply.isError).toBe(true)
      expect(reply.text).toContain(said)
    }
  })
})

describe('ARE-14 floor area and free floor in a shop (lab S-6)', () => {
  it('gives 60 m² of floor and 45 m² free, a quarter apart, each labelled with its rule', async () => {
    const reply = await ok({ plan: 'shop.json' })
    expect(reply.data!['net'] as number).toBeCloseTo(60, 6)
    expect(reply.data!['free'] as number).toBeCloseTo(45, 6)
    expect(reply.data!['fixtures'] as number).toBeCloseTo(15, 6)
    expect(1 - (reply.data!['free'] as number) / (reply.data!['net'] as number)).toBeCloseTo(0.25, 6)
    expect(reply.text).toMatch(/^Net: 60\.00 m²/m)
    expect(reply.text).toContain("Free floor: 45.00 m², the net less the 15.00 m² its fixtures stand on. Free floor is a room's net area less the floor its fixtures stand on")
    expect(reply.text).toMatch(/"Shop" \(retail\): 10\.00 m × 6\.00 m, 60\.00 m², free floor 45\.00 m² \(fixtures stand on 15\.00 m²\)/)
    expect(reply.text).toMatch(/Free floor: Only the fixtures the plan states are taken off/)
  })

  it('gives a zone the free floor of the fixtures standing in it, and keeps them in its room\'s', async () => {
    const reply = await ok({ plan: 'shop.json' })
    const rooms = (reply.data!['floors'] as { rooms: { id: string; net: number; free?: number; fixtures?: number }[] }[])[0]!.rooms
    const till = rooms.find((r) => r.id === 'till')!
    expect(till.net).toBeCloseTo(15, 6)
    expect(till.fixtures).toBeCloseTo(5, 6)
    expect(till.free).toBeCloseTo(10, 6)
    expect(rooms.find((r) => r.id === 'shop')!.fixtures).toBeCloseTo(15, 6)
  })

  it('gives no free floor on a plan with no fixtures', async () => {
    const reply = await ok({ plan: 'four.json' })
    expect(reply.data).not.toHaveProperty('free')
    expect(reply.text).not.toContain('Free floor')
  })
})
