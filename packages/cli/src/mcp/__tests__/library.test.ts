/**
 * CNT-20 (C30): the library through the tool server. "Will a double bed and two side tables fit"
 * is answered the same way every time: the entry's size is the library's, placing it says whether
 * it fits, and an office's own standard room in the library folder beside the plan is placed by
 * name and copied into the plan.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

/** A bedroom 3.6 × 3.6 m inside, its door in its east wall. */
function bedroom(): unknown {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.6, kind: 'exterior' })
  return {
    version: '1',
    walls: [wall('s', [0, 0], [3.8, 0]), wall('e', [3.8, 0], [3.8, 3.8]), wall('n', [3.8, 3.8], [0, 3.8]), wall('w', [0, 3.8], [0, 0])],
    rooms: [{ id: 'bed', name: 'Bedroom', boundary: ['s', 'e', 'n', 'w'], use: 'bedroom' }],
    openings: [{ id: 'door', wall: 'e', type: 'door', offset: 1.6, width: 0.9, height: 2.1 }],
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': bedroom(), 'twice.json': bedroom(), 'office.json': bedroom(), 'taken.json': bedroom(), 'sized.json': bedroom() })
  mkdirSync(join(b.folder, 'library'))
  writeFileSync(
    join(b.folder, 'library', 'ours.json'),
    JSON.stringify({
      version: '1',
      items: [{ name: 'our-bed', kind: 'bed', size: [1.5, 2], height: 0.45, clearance: 0.7, label: 'King', source: 'Office standard, sheet 3' }],
      rooms: [{ name: 'our-bedroom', size: [3.2, 3.4], items: [{ library: 'our-bed', at: [1.6, 1] }, { library: 'side-table', at: [0.6, 0.2] }, { library: 'side-table', at: [2.6, 0.2] }] }],
    })
  )
  writeFileSync(join(b.folder, 'library', 'broken.json'), '{ not json')
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

const fileOf = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>

describe('the library', () => {
  it('lists Grid\'s entries, the office\'s and what it left out, each with where its size comes from', async () => {
    // CNT-47: with the equipment, Grid's library is longer than one page of the answer.
    const reply = await ok('grid_measure', { plan: 'plan.json', what: 'library', whole: true })
    expect(reply.text).toContain('"double-bed": bed "Double bed", 1.40 × 2.00 m, 0.50 m high, 0.60 m clear in front (Grid\'s own size, not a code figure)')
    expect(reply.text).toContain('"our-bed": bed "King", 1.50 × 2.00 m, 0.45 m high, 0.70 m clear in front (from library/ours.json; Office standard, sheet 3)')
    expect(reply.text).toContain('Left out of the library: library/broken.json is not JSON.')
    const answer = (reply.data as { answer: { items: { name: string }[]; rooms: { name: string }[] } }).answer
    expect(answer.items.map((i) => i.name)).toContain('wardrobe')
    expect(answer.rooms.map((r) => r.name)).toEqual(['our-bedroom', 'bathroom', 'cloakroom', 'double-bedroom', 'single-bedroom', 'table-4-chairs', 'table-6-chairs'])
    const one = await ok('grid_measure', { plan: 'plan.json', what: 'library', name: 'double-bed' })
    expect(one.text).toContain('its back is its head')
  })

  it('fits an entry by name, the same size every time, with the clear floor it keeps', async () => {
    const first = await ok('grid_measure', { plan: 'plan.json', what: 'fit', room: 'bed', name: 'double-bed' })
    const again = await ok('grid_measure', { plan: 'plan.json', what: 'fit', room: 'bed', name: 'double-bed' })
    expect(first.text).toBe(again.text)
    expect(first.text).toContain('"double-bed" is 1.40 × 2.00 m with 0.60 m clear in front (Grid\'s own size, not a code figure), so the box tried is 1.40 × 2.60 m.')
    expect(first.text).toContain('fits in "Bedroom"')
    const big = await ok('grid_measure', { plan: 'plan.json', what: 'fit', room: 'bed', name: 'kitchen-run-3000' })
    expect(big.text).toContain('fits')
    const refused = await b.call('grid_measure', { plan: 'plan.json', what: 'fit', room: 'bed', name: 'doble-bed' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('Did you mean "double-bed"?')
  })
})

describe('placing by name', () => {
  it('places a double bed and two side tables, writes only their names and places, and says they fit', async () => {
    const reply = await ok('grid_place_item', { plan: 'plan.json', name: 'double-bedroom', x: 0.1, y: 0.1 })
    expect(reply.text).toContain('Placed typical room "double-bedroom"')
    expect(reply.text).toContain('Placed bed "double-bed" from "double-bed" (1.40 × 2.00 m')
    expect(reply.data).toMatchObject({ placed: ['double-bed', 'side-table', 'side-table-2', 'wardrobe'], fits: true })
    const items = fileOf('plan.json')['items'] as Record<string, unknown>[]
    expect(items[0]).toEqual({ id: 'double-bed', library: 'double-bed', at: [1.7, 1.1] })
    expect('library' in fileOf('plan.json')).toBe(false)
    // The plan draws, checks and counts them as the library sizes them.
    const person = await ok('grid_describe', { plan: 'plan.json', for: 'person' })
    expect(person.text).toContain('Furniture: 1 bed, 2 tables, 1 storage unit.')
    const agent = await ok('grid_describe', { plan: 'plan.json' })
    expect(agent.text).toContain('Fixtures and furniture: 1 bed, 2 tables, 1 storage unit.')
  })

  it('says when what it placed does not fit, and still writes it', async () => {
    const reply = await ok('grid_place_item', { plan: 'twice.json', name: 'double-bed', x: 1.9, y: 2.8 })
    expect(reply.data).toMatchObject({ fits: false })
    expect(reply.text).toContain('Worth a look: Bed "double-bed" runs into wall "n"')
    const check = await ok('grid_check', { plan: 'twice.json', full: true })
    expect(check.text).toContain('[item/into-wall]')
  })

  it('places an office\'s own room from the library folder and copies its entry into the plan', async () => {
    const reply = await ok('grid_place_item', { plan: 'office.json', name: 'our-bedroom', x: 0.1, y: 0.1 })
    expect(reply.text).toContain('from library/ours.json')
    expect(reply.text).toContain('Left out of the library: library/broken.json is not JSON.')
    expect(reply.text).toContain('The plan now holds "our-bed" in its own library')
    const file = fileOf('office.json')
    expect(file['library']).toEqual([{ name: 'our-bed', kind: 'bed', size: [1.5, 2], height: 0.45, clearance: 0.7, label: 'King', source: 'Office standard, sheet 3' }])
    // DXF: each piece is a block of its own, named after its entry.
    const exported = await ok('grid_export', { plan: 'office.json', format: 'dxf' })
    const dxf = readFileSync(join(b.folder, (exported.data as { written: string }).written), 'utf8')
    expect(dxf).toContain('GRID-OUR-BED-1500x2000')
    expect(dxf).toContain('GRID-SIDE-TABLE-450x400')
  })

  // CNT-43: an odd size placed in one call, from the nearest entry or by its kind.
  it('places an item at its own size, height and label, and a thing with no entry by its kind', async () => {
    const desk = await ok('grid_place_item', { plan: 'sized.json', name: 'desk', x: 1.2, y: 0.7, width: 1.4, depth: 0.7, label: 'Hot desk' })
    expect(desk.text).toContain('Placed desk "desk" from "desk" (1.40 × 0.70 m, 0.75 m high, keeping 0.75 m clear in front, at the size given)')
    const wc = await ok('grid_place_item', { plan: 'sized.json', name: 'wc-child', x: 3, y: 0.5 })
    expect(wc.text).toContain('(0.32 × 0.50 m, 0.35 m high, keeping 0.50 m clear in front, Grid\'s own size, not a code figure)')
    const kennel = await ok('grid_place_item', { plan: 'sized.json', name: 'storage', id: 'kennel', x: 1.2, y: 3, width: 1.2, depth: 0.9, height: 0.9, label: 'Kennel', turn: 180 })
    expect(kennel.text).toContain('Placed storage unit "kennel" (1.20 × 0.90 m, 0.90 m high, at the size given)')
    const items = fileOf('sized.json')['items'] as Record<string, unknown>[]
    expect(items.map((i) => i['id'])).toEqual(['desk', 'wc-child', 'kennel'])
    expect(items[0]).toEqual({ id: 'desk', library: 'desk', at: [1.2, 0.7], size: [1.4, 0.7], label: 'Hot desk' })
    expect(items[2]).toEqual({ id: 'kennel', kind: 'storage', at: [1.2, 3], turn: 180, size: [1.2, 0.9], height: 0.9, label: 'Kennel' })
    const before = readFileSync(join(b.folder, 'sized.json'), 'utf8')
    for (const [args, says] of [
      [{ name: 'table', x: 3, y: 3, width: 1.2, depth: 0.6 }, 'give its width, depth and height'],
      [{ name: 'desk', x: 3, y: 3, width: 1.2 }, 'Give width and depth together'],
      [{ name: 'bathroom', x: 3, y: 3, height: 1 }, 'place its items one by one'],
    ] as const) {
      const refused = await b.call('grid_place_item', { plan: 'sized.json', ...args })
      expect(refused.isError, says).toBe(true)
      expect(refused.text).toContain(says)
    }
    expect(readFileSync(join(b.folder, 'sized.json'), 'utf8')).toBe(before)
  })

  it('refuses a name no library holds, naming the nearest, and writes nothing', async () => {
    const before = readFileSync(join(b.folder, 'twice.json'), 'utf8')
    const reply = await b.call('grid_place_item', { plan: 'twice.json', name: 'wardrob', x: 1, y: 1 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('Did you mean "wardrobe"?')
    expect(readFileSync(join(b.folder, 'twice.json'), 'utf8')).toBe(before)
  })
})

// WRT-46: an id a part holds is refused naming the part and where it is, and a rewrite says what it kept.
describe('a taken id', () => {
  it('refuses placing under an id a bed holds, naming the bed, its place and its room, and writes nothing', async () => {
    await ok('grid_place_item', { plan: 'taken.json', name: 'double-bed', x: 1.9, y: 1.5, id: 'bed-1' })
    const before = readFileSync(join(b.folder, 'taken.json'), 'utf8')
    const again = await b.call('grid_place_item', { plan: 'taken.json', name: 'double-bed', x: 1.9, y: 1.5, id: 'bed-1' })
    expect(again.isError).toBe(true)
    expect(again.text).toContain('Can\'t place "double-bed": the id "bed-1" is taken by bed "bed-1" at (1.90, 1.50) in room "Bedroom".')
    expect(again.text).toContain('Pick another id, or leave id out')
    // A new room is refused the bed's id too, naming it, where it once took it.
    const room = await b.call('grid_add_room', { plan: 'taken.json', room: 'bed-1', name: 'Study', against: 'bed', side: 'west', width: 2, depth: 2 })
    expect(room.isError).toBe(true)
    expect(room.text).toContain('The id "bed-1" is already used in the plan, by bed "bed-1" at (1.90, 1.50) in room "Bedroom"; pick another for the new room.')
    // A room's id is named with the room.
    const placed = await b.call('grid_place_item', { plan: 'taken.json', name: 'wardrobe', x: 1, y: 3, id: 'bed' })
    expect(placed.text).toContain('the id "bed" is taken by room "Bedroom" ("bed").')
    expect(readFileSync(join(b.folder, 'taken.json'), 'utf8')).toBe(before)
  })

  it('answers a rewrite from rooms text with the items it kept and the room each is in', async () => {
    const reply = await ok('grid_write_rooms', { plan: 'taken.json', rooms: 'walls outside 0.2 inside 0.1 height 2.6\nroom bed "Bedroom" bedroom 3.4 x 3.4 at 0.2,0.2', replace: true })
    expect(reply.text).toContain('Kept the plan\'s item where it stood, as the file has it: bed "bed-1" in "Bedroom".')
    expect((reply.data as { itemsKept: unknown[] }).itemsKept).toEqual([{ id: 'bed-1', kind: 'bed', at: [1.9, 1.5], floor: 'ground', room: 'Bedroom', worthALook: [] }])
  })
})
