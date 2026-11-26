/**
 * LVL-21: stairs written through the tools. A two-storey house: a 2.4 × 5 m hall (its inside faces
 * from 0,0 to 2.4,5) and a living room east of it below, a landing and a bedroom over them above.
 * The stair the tools write is the plan's own, laid out as a rooms text `stair` line lays it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Ground" level 0 height 2.7',
  'room hall "Hall" corridor 2.4 x 5 at 0,0',
  'room living "Living" living 5 x 5 east of hall',
  'door front in hall south, centred, 0.9 wide, opens in',
  'door d0 between hall and living, centred, 0.8 wide',
  'floor first "First" level 1 height 2.7',
  'room landing "Landing" corridor 2.4 x 5 at 0,0',
  'room bed "Bed" bedroom 5 x 5 east of landing',
  'door d1 between landing and bed, centred, 0.8 wide',
]

let b: Bench
const stairs = (name: string): unknown => (JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>)['stairs']
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
})
afterAll(() => b.close())

describe('grid_add_stair', () => {
  it('lays a stair in a room as a stair line does, and answers with what Grid worked out', async () => {
    const reply = await ok('grid_add_stair', { plan: 'house.json', from: 'ground', to: 'first', room: 'hall', width: 1, shape: 'U', runs: 'north', name: 'Main stair', out: 'u.json' })
    expect(stairs('u.json')).toEqual([{ id: 'stair-1', name: 'Main stair', from: 'ground', to: 'first', width: 1, run: [[0.5, 1], [0.5, 4.5], [1.9, 4.5], [1.9, 1]] }])
    expect(stairs('house.json')).toBeUndefined()
    expect(reply.text).toContain('Added stair stair-1 from floor ground to floor first, in hall, 1 m wide.')
    expect(reply.text).toMatch(/Stair stair-1 climbs [0-9.]+ m in \d+ risers of [0-9.]+ m \(worked out\), going [0-9.]+ m, pitch [0-9.]+°, 1 m wide, in 3 flights; walking line 0\.5,1 0\.5,4\.5 1\.9,4\.5 1\.9,1 from its foot in hall on floor ground to its head in landing on floor first\./)
    expect(reply.data).toMatchObject({ stair: 'stair-1', stairs: ['stair-1'] })
  })

  it('takes a room for its floor, and a walking line of its own', async () => {
    await ok('grid_add_stair', { plan: 'house.json', id: 'st', from: 'hall', to: 'landing', width: '90cm', runs: 'north', along: 'west', out: 'room.json' })
    expect(stairs('room.json')).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[0.45, 0.9], [0.45, 4.1]] }])
    await ok('grid_add_stair', { plan: 'house.json', id: 'free', from: 'ground', to: 'first', width: 0.9, run: ['3,1', '3,4.5'], risers: 16, out: 'free.json' })
    expect(stairs('free.json')).toEqual([{ id: 'free', from: 'ground', to: 'first', width: 0.9, run: [[3, 1], [3, 4.5]], risers: 16 }])
  })

  it('refuses a stair it cannot lay out, with nothing written', async () => {
    expect(await refused('grid_add_stair', { plan: 'house.json', from: 'ground', to: 'first', room: 'hall', width: 1.3, shape: 'U', runs: 'north' })).toMatch(/^A U stair 1\.3 m wide needs the room wider than 2\.6 m across.* Nothing was written\.$/)
    expect(await refused('grid_add_stair', { plan: 'house.json', from: 'ground', to: 'attic', room: 'hall', width: 1, runs: 'north' })).toContain("'attic' after to is neither a floor of the plan")
    expect(await refused('grid_add_stair', { plan: 'house.json', from: 'ground', to: 'first', width: 1, room: 'hall', runs: 'north', run: ['1,1', '1,4'] })).toContain('not both')
    expect(await refused('grid_add_stair', { plan: 'house.json', from: 'ground', to: 'first', width: 1 })).toContain('Say the room it goes in')
    expect(stairs('house.json')).toBeUndefined()
  })
})

describe('grid_change_stair', () => {
  it('lays a stair in a room out again with the words that change, and keeps the rest', async () => {
    await ok('grid_add_stair', { plan: 'house.json', id: 'st', from: 'ground', to: 'first', room: 'hall', width: 1, shape: 'L', runs: 'north', out: 'change.json' })
    const wider = await ok('grid_change_stair', { plan: 'change.json', id: 'st', width: 0.9, then: 'west' })
    expect(stairs('change.json')).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[1.95, 0.9], [1.95, 4.55], [0.9, 4.55]] }])
    expect(wider.text).toContain('Changed stair st: width 1 m to 0.9 m; laid again in hall.')
    await ok('grid_change_stair', { plan: 'change.json', id: 'st', shape: 'straight', risers: 15 })
    expect(stairs('change.json')).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[1.2, 0.9], [1.2, 4.1]], risers: 15 }])
    await ok('grid_change_stair', { plan: 'change.json', id: 'st', risers: 0 })
    expect(stairs('change.json')).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[1.2, 0.9], [1.2, 4.1]] }])
  })

  it('keeps a walking line of its own, takes a new one, and removes a stair', async () => {
    await ok('grid_add_stair', { plan: 'house.json', id: 'free', from: 'ground', to: 'first', width: 0.9, run: ['3,1', '3,4.5'], out: 'own.json' })
    await ok('grid_change_stair', { plan: 'own.json', id: 'free', width: 1 })
    expect(stairs('own.json')).toEqual([{ id: 'free', from: 'ground', to: 'first', width: 1, run: [[3, 1], [3, 4.5]] }])
    expect(await refused('grid_change_stair', { plan: 'own.json', id: 'free', shape: 'U' })).toContain('runs along a walking line of its own')
    await ok('grid_change_stair', { plan: 'own.json', id: 'free', run: ['4,1', '4,4.5'] })
    expect(stairs('own.json')).toEqual([{ id: 'free', from: 'ground', to: 'first', width: 1, run: [[4, 1], [4, 4.5]] }])
    const gone = await ok('grid_change_stair', { plan: 'own.json', id: 'free', remove: true })
    expect(stairs('own.json')).toBeUndefined()
    expect(gone.text).toContain('Took stair free out of the plan.')
    expect(gone.data).toMatchObject({ stairs: [] })
    expect(await refused('grid_change_stair', { plan: 'own.json', id: 'free', width: 1 })).toContain('The plan has no stair with the id free. The plan has none.')
  })
})

describe('grid_write_rooms with stairs', () => {
  it('writes a stair line, and keeps the file\'s stairs when the text writes none', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'lined.json', rooms: [...HOUSE, 'stair st from ground to first in hall, 1 wide, U, runs north'].join('\n') })
    expect(stairs('lined.json')).toEqual([{ id: 'st', from: 'ground', to: 'first', width: 1, run: [[0.5, 1], [0.5, 4.5], [1.9, 4.5], [1.9, 1]] }])
    expect(reply.text).toContain('Line 11: stair st climbs')
    const described = await ok('grid_describe', { plan: 'lined.json', as: 'rooms' })
    expect(described.text).toContain('stair st from ground to first in hall, 1 wide, U, runs north')
    const again = await ok('grid_write_rooms', { plan: 'lined.json', rooms: [...HOUSE, `based on ${/based on ([0-9a-f]+)/.exec(described.text)![1]}`].join('\n') })
    expect(stairs('lined.json')).toHaveLength(1)
    expect(again.text).toContain("Kept the plan's stair as the file has it: this rooms text writes no stair line.")
  })
})
