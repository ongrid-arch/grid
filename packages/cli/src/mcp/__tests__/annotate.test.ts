/**
 * SHT-22: writing on the drawing through `grid_annotate`. A two-storey house: a 2.4 × 5 m hall and
 * a living room east of it below, a landing and a bedroom over them above. What the tool places
 * is the plan's own `annotations` and `sketch`, placed as rooms text lines place them.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
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
const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>
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

describe('grid_annotate', () => {
  it('places a tag at a point, on the floor given, and answers with it and what each floor carries', async () => {
    const reply = await ok('grid_annotate', { plan: 'house.json', kind: 'tag', text: 'You are here', at: '1.2,2', floor: 'first', out: 'here.json' })
    expect(file('here.json')['annotations']).toEqual([{ id: 'tag-1', kind: 'tag', text: 'You are here', at: [1.2, 2], floor: 'first' }])
    expect(file('house.json')['annotations']).toBeUndefined()
    expect(reply.text).toContain('  tag-1: tag "You are here" at 1.2,2, on floor first')
    expect(reply.text).toContain('  Floor first: 1 tag (tag-1).')
    expect(reply.data).toMatchObject({ placed: ['tag-1'], removed: [], annotations: ['tag-1'], sketch: [] })
  })

  it('places many at once as rooms text lines: tags in rooms, a symbol, and the way out as an arrow', async () => {
    const reply = await ok('grid_annotate', {
      plan: 'here.json',
      lines: ['tag "FE" in living', 'tag "FE" in bed', 'symbol entrance at 1.2,-0.5 "Way in"', 'route exit 4,4 4,1 1.2,1 1.2,-1', 'route 1.2,4 1.2,1 on first'],
      out: 'evacuation.json',
    })
    const plan = file('evacuation.json')
    expect(plan['annotations']).toEqual([
      { id: 'tag-1', kind: 'tag', text: 'You are here', at: [1.2, 2], floor: 'first' },
      { id: 'tag-2', kind: 'tag', text: 'FE', room: 'living' },
      { id: 'tag-3', kind: 'tag', text: 'FE', room: 'bed' },
      { id: 'symbol-1', kind: 'symbol', text: 'Way in', symbol: 'entrance', at: [1.2, -0.5] },
    ])
    const sketch = plan['sketch'] as Array<{ id: string; category: string; points: number[][]; floor?: string }>
    expect(sketch.map((s) => [s.id, s.category, s.floor])).toEqual([['route-1', 'exit', undefined], ['route-2', 'route', 'first']])
    // The route's own points, then its head: a V back up the last leg at its end.
    expect(sketch[0]!.points.slice(0, 4)).toEqual([[4, 4], [4, 1], [1.2, 1], [1.2, -1]])
    expect(sketch[0]!.points).toHaveLength(7)
    expect(sketch[0]!.points[5]).toEqual([1.2, -1])
    expect(reply.text).toContain('  tag-3: tag "FE" in bed, on floor first')
    expect(reply.text).toContain('  route-1: route exit from 4,4 to 1.2,-1, 3 legs, on floor ground')
    expect(reply.text).toContain('  Floor first: 2 tags, 1 route (tag-1, tag-3, route-2).')
    expect(reply.text).toContain('  Floor ground: 1 tag, 1 symbol, 1 route (tag-2, symbol-1, route-1).')
    expect(reply.data).toMatchObject({ placed: ['tag-2', 'tag-3', 'symbol-1', 'route-1', 'route-2'], sketch: ['route-1', 'route-2'] })
  })

  it('takes entries out by id and refuses, with nothing written, what it cannot place', async () => {
    const reply = await ok('grid_annotate', { plan: 'evacuation.json', remove: ['tag-2', 'route-2'], out: 'fewer.json' })
    expect(reply.text).toContain('Took off the drawing: tag-2, route-2.')
    expect((file('fewer.json')['annotations'] as { id: string }[]).map((a) => a.id)).toEqual(['tag-1', 'tag-3', 'symbol-1'])
    expect((file('fewer.json')['sketch'] as { id: string }[]).map((a) => a.id)).toEqual(['route-1'])
    expect(await refused('grid_annotate', { plan: 'fewer.json', kind: 'tag', text: 'FE', room: 'kitchen', out: 'never.json' })).toMatch(/The tag: the plan has no room 'kitchen': its rooms are hall, living, landing, bed\. Write 'tag "<text>" at x,y \| in <room>.*Nothing was written\./)
    expect(await refused('grid_annotate', { plan: 'fewer.json', lines: ['tag "A" at 1,1', 'tag at 2,2'], out: 'never.json' })).toMatch(/lines\[1\]: a tag needs its text, in quotes/)
    expect(await refused('grid_annotate', { plan: 'fewer.json', lines: ['tag "A" at 1,1 colour red'], out: 'never.json' })).toMatch(/lines\[0\]: 'colour' is not understood on a tag line/)
    expect(await refused('grid_annotate', { plan: 'fewer.json', kind: 'tag', text: 'A', at: '1,1', id: 'tag-1', out: 'never.json' })).toMatch(/has tag-1 already/)
    expect(await refused('grid_annotate', { plan: 'fewer.json', remove: ['nothing'], out: 'never.json' })).toMatch(/The plan has no note, tag, symbol, key or sketch item nothing\. Its drawing carries: tag-1, tag-3, symbol-1, route-1\./)
    expect(await refused('grid_annotate', { plan: 'fewer.json', text: 'A', out: 'never.json' })).toMatch(/text describes one entry: give its kind too/)
    expect(() => readFileSync(join(b.folder, 'never.json'))).toThrow()
  })

  it('reads them back as rooms text lines, which write the same plan again', async () => {
    const back = await ok('grid_describe', { plan: 'fewer.json', as: 'rooms' })
    const text = (back.data as { rooms: string } | undefined)?.rooms ?? back.text
    // The last block is the first floor's: a line on another floor says so, and an id is written when it is not the one Grid would give.
    expect(text).toContain('\ntag "You are here" at 1.2,2\ntag "FE" in bed id tag-3\nsymbol entrance "Way in" at 1.2,-0.5 on ground\nroute exit 4,4 4,1 1.2,1 1.2,-1 on ground\n')
    const again = compileRoomsText(text.slice(text.indexOf('based on')))
    expect(again.problems).toEqual([])
    expect(again.plan!.annotations).toEqual(file('fewer.json')['annotations'])
    expect(again.plan!.sketch).toEqual(file('fewer.json')['sketch'])
  })

  it('keeps the file\'s annotations and sketch when a rooms text writes none, and takes the text\'s when it does', async () => {
    const before = file('fewer.json')
    const bare = async (): Promise<string> => {
      const back = await ok('grid_describe', { plan: 'fewer.json', as: 'rooms' })
      return back.text.slice(back.text.indexOf('based on')).split('\n').filter((line) => !/^(tag|symbol|route) /.test(line)).join('\n')
    }
    await ok('grid_write_rooms', { plan: 'fewer.json', rooms: await bare() })
    expect(file('fewer.json')['annotations']).toEqual(before['annotations'])
    expect(file('fewer.json')['sketch']).toEqual(before['sketch'])
    await ok('grid_write_rooms', { plan: 'fewer.json', rooms: `${await bare()}\ntag "Only this" at 1,1\n` })
    expect(file('fewer.json')['annotations']).toEqual([{ id: 'tag-1', kind: 'tag', text: 'Only this', at: [1, 1], floor: 'first' }])
    expect(file('fewer.json')['sketch']).toEqual(before['sketch'])
  })
})
