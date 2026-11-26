/**
 * CNT-44: "how many desks fit in the hot-desk zone" in one call. A dry run gives the count and
 * writes nothing; the fill writes the desks as one group; replace fills the group again at another
 * pitch; a zone of an open-plan room is filled inside its own outline.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import Ajv from 'ajv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GRID_TOOLS } from '../serveTools'
import { toolDefinition } from '../toolkit'
import { bench, type Bench, type Reply } from './replay/harness'

/** A floor 10 × 6 m inside, in two rooms of 5 m each side of a wall at x 5.1, a door in the south wall. */
function floor(): unknown {
  const wall = (id: string, start: number[], end: number[], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.8, kind })
  return {
    version: '1',
    walls: [
      wall('s1', [0, 0], [5.1, 0]),
      wall('s2', [5.1, 0], [10.2, 0]),
      wall('e', [10.2, 0], [10.2, 6.2]),
      wall('n2', [10.2, 6.2], [5.1, 6.2]),
      wall('n1', [5.1, 6.2], [0, 6.2]),
      wall('w', [0, 6.2], [0, 0]),
      wall('mid', [5.1, 0], [5.1, 6.2], 'interior'),
    ],
    rooms: [
      { id: 'hot', name: 'Hot desks', boundary: ['s1', 'mid', 'n1', 'w'], use: 'office' },
      { id: 'quiet', name: 'Quiet room', boundary: ['s2', 'e', 'n2', 'mid'], use: 'office' },
    ],
    openings: [{ id: 'd1', wall: 's2', type: 'door', offset: 2, width: 0.9, height: 2.1 }],
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': floor(), 'zones.json': floor() })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

const fileText = (name: string): string => readFileSync(join(b.folder, name), 'utf8')
const itemsOf = (name: string): { id: string; library: string; at: [number, number] }[] => ((JSON.parse(fileText(name)) as { items?: { id: string; library: string; at: [number, number] }[] }).items ?? [])

const ajv = new Ajv({ allErrors: true, schemaId: 'auto' })
const fitsSchema = (data: unknown): boolean => ajv.validate(toolDefinition(GRID_TOOLS.find((t) => t.name === 'grid_fill_room')!)['outputSchema'] as object, data) as boolean

describe('filling a room with desks', () => {
  it('answers how many fit on a dry run, and writes nothing', async () => {
    const before = fileText('plan.json')
    const reply = await ok('grid_fill_room', { plan: 'plan.json', room: 'hot', name: 'desk', pitch: 1.6, aisle: 1.2, dry_run: true })
    expect(fileText('plan.json')).toBe(before)
    expect(reply.text).toContain('Dry run: nothing was written.')
    expect(reply.text).toContain('Guessed: 0 m kept clear of the walls')
    // Along 6 m turned 90: 4 desks at 1.60 m; across 5 m: rows 2.55 m apart, 2 rows.
    expect(reply.data).toMatchObject({ count: 8, dryRun: true, turn: 90 })
    expect(fitsSchema(reply.data), JSON.stringify(ajv.errors)).toBe(true)
  })

  it('writes the desks as one group, and fills it again at another pitch with replace', async () => {
    const reply = await ok('grid_fill_room', { plan: 'plan.json', room: 'hot', name: 'desk', group: 'hot-desk', label: 'Hot desk' })
    expect(fitsSchema(reply.data), JSON.stringify(ajv.errors)).toBe(true)
    const count = (reply.data as { count: number }).count
    expect(count).toBeGreaterThan(8)
    expect(reply.text).toContain(`the group is "hot-desk" (hot-desk-1 to hot-desk-${count})`)
    expect(reply.text).toContain('Wrote "plan.json".')
    const items = itemsOf('plan.json')
    expect(items.map((item) => item.id)).toEqual(Array.from({ length: count }, (_, i) => `hot-desk-${i + 1}`))
    expect(items.every((item) => item.library === 'desk' && item.at[0] < 5.1)).toBe(true)
    const taken = await b.call('grid_fill_room', { plan: 'plan.json', room: 'hot', name: 'desk', group: 'hot-desk' })
    expect(taken.isError).toBe(true)
    expect(taken.text).toContain(`The plan already holds the group "hot-desk": ${count} items ("hot-desk-1" the first). Pass replace true to fill it again`)
    expect(taken.text).toContain('Nothing was written.')
    const again = await ok('grid_fill_room', { plan: 'plan.json', room: 'hot', name: 'desk', group: 'hot-desk', pitch: 1.6, aisle: 1.2, replace: true })
    expect(again.data).toMatchObject({ count: 8, removed: count })
    expect(again.text).toContain(`Took out the group's ${count} items placed before.`)
    expect(itemsOf('plan.json')).toHaveLength(8)
  })

  it('keeps the floor in front of the door clear', async () => {
    const reply = await ok('grid_fill_room', { plan: 'plan.json', room: 'quiet', name: 'desk', turn: 0, dry_run: true })
    expect((reply.data as { givenUp: { door: number } }).givenUp.door).toBeGreaterThan(0)
  })

  it('fills a zone of an open-plan room inside its own outline', async () => {
    await ok('grid_merge_rooms', { plan: 'zones.json', room: 'hot', with: 'quiet', zones: true, new_room: 'office' })
    const reply = await ok('grid_fill_room', { plan: 'zones.json', room: 'hot', name: 'table-4-chairs', group: 'cafe' })
    expect(fitsSchema(reply.data), JSON.stringify(ajv.errors)).toBe(true)
    const items = itemsOf('zones.json')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.at[0] < 5.1)).toBe(true)
    expect(items[0]!.id).toBe('cafe-1-1')
  })

  it('refuses a fill where nothing fits, with nothing written', async () => {
    const before = fileText('plan.json')
    const reply = await b.call('grid_fill_room', { plan: 'plan.json', room: 'hot', name: 'desk', wall_clearance: 3 })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('Nothing fits, so nothing was placed')
    expect(fileText('plan.json')).toBe(before)
  })
})
