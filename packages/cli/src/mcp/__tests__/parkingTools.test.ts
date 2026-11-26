/**
 * CNT-46: parking bays and ramps written through the tools. A two-level car park: on each floor a
 * 30 × 20 m deck (its inside faces from 0,0 to 30,20) and a 12 × 12 m ramp room east of it. The
 * bays and ramps the tools write are the plan's own, laid out as rooms text's `bays` and `ramp`
 * lines lay them.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const PARK = [
  'walls outside 0.3 inside 0.2 height 3',
  'floor b1 "Basement" level -3 height 3',
  'room deck "Deck" parking 30 x 20 at 0,0',
  'room spiral "Spiral" parking 12 x 12 east of deck',
  'door d0 between deck and spiral, centred, 6 wide, opens into spiral',
  'floor g "Ground" level 0 height 3',
  'room deck "Deck" parking 30 x 20 at 0,0',
  'room spiral "Spiral" parking 12 x 12 east of deck',
  'door d1 between deck and spiral, centred, 6 wide, opens into spiral',
]

let b: Bench
const field = (name: string, key: string): unknown => (JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>)[key]
type Bay = { id: string; number?: string; at: [number, number]; floor?: string }
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
  await ok('grid_write_rooms', { plan: 'park.json', rooms: PARK.join('\n') })
})
afterAll(() => b.close())

describe('grid_place_bays', () => {
  it('fills a room with rows and aisles, numbered from 1, and says what it chose', async () => {
    const reply = await ok('grid_place_bays', { plan: 'park.json', group: 'f', room: 'deck', floor: 'b1', width: 2.5, length: 5, out: 'filled.json' })
    const bays = field('filled.json', 'bays') as Bay[]
    expect(bays).toHaveLength(24)
    expect(bays[0]).toEqual({ id: 'f-1', number: '1', at: [1.25, 2.5], width: 2.5, length: 5, floor: 'b1' })
    expect(field('park.json', 'bays')).toBeUndefined()
    expect(reply.text).toContain('Placed 24 2.5 x 5 m bays in room deck on floor b1, f-1 to f-24, numbered 1 to 24.')
    expect(reply.text).toMatch(/The aisles are 6 m wide, Grid's own width, not a code figure/)
    expect(reply.data).toMatchObject({ bays: 24, group: 'f', first: 'f-1', last: 'f-24' })
  })

  it('numbers on from the floor\'s highest number, and replaces its own group when placed again', async () => {
    await ok('grid_place_bays', { plan: 'filled.json', group: 'n', room: 'spiral', floor: 'b1', along: 'north', kind: 'accessible', count: 2, out: 'more.json' })
    const more = field('more.json', 'bays') as Bay[]
    expect(more.slice(24).map((bay) => [bay.id, bay.number])).toEqual([['n-1', '25'], ['n-2', '26']])
    const reply = await ok('grid_place_bays', { plan: 'more.json', group: 'f', room: 'deck', floor: 'b1', kind: 'car', aisle: 2.5, numbered: 'B1-001', out: 'again.json' })
    const again = field('again.json', 'bays') as Bay[]
    expect(again.filter((bay) => bay.id.startsWith('f-'))).toHaveLength(36)
    expect(again.find((bay) => bay.id === 'f-36')!.number).toBe('B1-036')
    expect(reply.text).toContain('Placed again (replacing 24) 36')
  })

  it('refuses bays it cannot lay out, with nothing written', async () => {
    expect(await refused('grid_place_bays', { plan: 'park.json', group: 's', room: 'deck', floor: 'g', along: 'south', width: 2.5, length: 5, count: 20, out: 'no.json' })).toMatch(/20 bays 2\.5 m wide do not fit along the south side of room g-deck: 12 do.*Nothing was written\./)
    expect(await refused('grid_place_bays', { plan: 'park.json', group: 's', room: 'deck', kind: 'car', width: 2.5, out: 'no.json' })).toMatch(/size \(width and length\) or its kind, not both/)
    expect(await refused('grid_place_bays', { plan: 'park.json', group: 's', room: 'cellar', along: 'south', out: 'no.json' })).toMatch(/The plan has no room 'cellar' to lay it in\. Nothing was written\./)
  })
})

describe('grid_add_ramp', () => {
  it('adds a helix in its room and answers with its rise, length and slope', async () => {
    const reply = await ok('grid_add_ramp', { plan: 'park.json', id: 'h', from: 'b1', to: 'g', room: 'spiral', width: 3.5, shape: 'helix', turns: 1, out: 'helix.json' })
    const [ramp] = field('helix.json', 'ramps') as Array<{ id: string; run: number[][] }>
    expect(ramp!.id).toBe('h')
    expect(ramp!.run).toHaveLength(25)
    expect(reply.text).toContain('Added ramp h from floor b1 to floor g, a helix in spiral, 3.5 m wide.')
    expect(reply.text).toMatch(/Ramp h climbs 3\.25 m from floor b1 to floor g over [0-9.]+ m along its middle line: slope [0-9.]+% \(1 in [0-9.]+\)\./)
    expect(reply.data).toMatchObject({ ramp: 'h', points: 25 })
  })

  it('adds a straight ramp in its room and one along its middle line', async () => {
    await ok('grid_add_ramp', { plan: 'park.json', from: 'b1', to: 'g', room: 'deck', width: 4, runs: 'east', along: 'north', out: 'straight.json' })
    expect(field('straight.json', 'ramps')).toEqual([{ id: 'ramp-1', from: 'b1', to: 'g', width: 4, run: [[0, 18], [30, 18]] }])
    await ok('grid_add_ramp', { plan: 'park.json', id: 'free', from: 'b1', to: 'g', width: 3, run: ['2,2', '20,2'], out: 'free.json' })
    expect(field('free.json', 'ramps')).toEqual([{ id: 'free', from: 'b1', to: 'g', width: 3, run: [[2, 2], [20, 2]] }])
  })

  it('refuses a ramp it cannot lay out, with nothing written', async () => {
    expect(await refused('grid_add_ramp', { plan: 'park.json', from: 'b1', to: 'b1', room: 'deck', width: 4, runs: 'east', out: 'no.json' })).toMatch(/both floor b1.*Nothing was written\./)
    expect(await refused('grid_add_ramp', { plan: 'park.json', from: 'b1', to: 'g', room: 'spiral', width: 3, shape: 'helix', radius: 9, out: 'no.json' })).toMatch(/past the walls of room/)
    expect(await refused('grid_add_ramp', { plan: 'park.json', from: 'b1', to: 'g', room: 'spiral', width: 3, shape: 'helix', starts: 'up', out: 'no.json' })).toMatch(/starts takes a side/)
  })
})

describe('grid_write_rooms with bay and ramp lines', () => {
  it('writes them, reads them back, and keeps the file\'s bays and ramps when the text writes none', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'lined.json', rooms: [...PARK, 'bays f in deck fill, car, numbered 1, on b1', 'ramp h from b1 to g in spiral, 3.5 wide, helix'].join('\n') })
    expect(field('lined.json', 'bays')).toHaveLength(24)
    expect(field('lined.json', 'ramps')).toHaveLength(1)
    expect(reply.text).toContain('24 2.5 x 5 m bays in room deck on floor b1, f-1 to f-24, numbered 1 to 24.')
    const described = await ok('grid_describe', { plan: 'lined.json', as: 'rooms' })
    expect(described.text).toContain('bays f at 1.25,2.5, 2.5 x 5, count 12, runs east, numbered 1, on b1')
    expect(described.text).toMatch(/ramp h from b1 to g, 3\.5 wide, helix at [0-9.]+,[0-9.]+ radius [0-9.]+ turns 1 starts south/)
    const again = await ok('grid_write_rooms', { plan: 'lined.json', rooms: [...PARK, `based on ${/based on ([0-9a-f]+)/.exec(described.text)![1]}`].join('\n') })
    expect(field('lined.json', 'bays')).toHaveLength(24)
    expect(again.text).toContain("Kept the plan's 24 parking bays as the file has them: this rooms text writes no bay line.")
    expect(again.text).toContain("Kept the plan's ramp as the file has it: this rooms text writes no ramp line.")
  })
})
