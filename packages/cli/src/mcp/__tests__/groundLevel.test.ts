/**
 * ARE-62: the site's ground level, written by a `ground` line or `grid_set_site ground`, and named
 * by every answer that finds the plan states none. The house is 9 × 10 m to its outside faces,
 * from 0,0 to 9,10, as in `siteTools.test.ts`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '@ongrid/floorplan/messages'
import { bench, type Bench, type Reply } from './replay/harness'
// After the harness, which loads the tool server first, as the server loads its tools.
import { setSiteTool } from '../siteTools'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']
const CUT = { from: [-1, 5], to: [10, 5] }
const WAYS = /'ground <m>'.*grid_set_site ground/

let b: Bench
const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'house.json', rooms: HOUSE.join('\n') })
  await ok('grid_write_rooms', { plan: 'grounded.json', rooms: [...HOUSE, 'ground 0.15 below'].join('\n') })
})
afterAll(() => b.close())

describe('the ground level', () => {
  it('is written by a ground line and read back as one', async () => {
    expect(file('grounded.json')['site']).toEqual({ ground: -0.15 })
    expect((await ok('grid_describe', { plan: 'grounded.json', as: 'rooms' })).text).toContain('ground -0.15')
  })

  it('is set by grid_set_site ground, and the tool names the line', async () => {
    const reply = await ok('grid_set_site', { plan: 'house.json', ground: 0, out: 'level.json' })
    expect(file('level.json')['site']).toEqual({ ground: 0 })
    expect(reply.text).toContain("The ground outside: 0.00 m from the ground floor's floor level.")
    expect(setSiteTool.description).toContain('ground -0.15')
    expect(setSiteTool.args['ground']!.description).toContain('the below-ground check')
  })

  it('names both ways to state it wherever an answer says the plan states none', async () => {
    const section = await ok('grid_view', { plan: 'house.json', kind: 'section', cut: CUT })
    expect(section.text).toMatch(/the site states no ground level\. State it with a 'ground <m>' line in rooms text, or grid_set_site ground/)
    const facade = await ok('grid_view', { plan: 'house.json', kind: 'facade', side: 'south' })
    expect(facade.text).toMatch(/The site states no ground level: the ground line is drawn at the ground floor's floor level\. State it with a 'ground <m>' line/)
    const check = await ok('grid_check', { plan: 'house.json', whole: true })
    expect(check.text).toContain("the plan states no ground level for the site (write 'ground <m>' in rooms text, or give grid_set_site ground)")
  })

  it('says nothing of the kind once the ground is stated', async () => {
    for (const reply of [
      await ok('grid_view', { plan: 'grounded.json', kind: 'section', cut: CUT }),
      await ok('grid_view', { plan: 'grounded.json', kind: 'facade', side: 'south' }),
      await ok('grid_check', { plan: 'grounded.json', whole: true }),
    ]) {
      expect(reply.text).not.toContain('no ground level')
      expect(reply.text).not.toContain('grid_set_site ground')
    }
  })

  it('in every English sentence that finds no ground level, except the drawing\'s own labels', () => {
    // Drawn on the picture or the sheet, for the person: the answers that carry them add the ways.
    const DRAWN = new Set(['drawing.facade.noGround', 'drawing.section.taken.ground'])
    const finding = Object.entries(en).filter(([key, text]) => !DRAWN.has(key) && /states no ground level|no ground level|ground level not stated|ground level is not stated/.test(text))
    expect(finding.map(([key]) => key)).toEqual(['check.skip.no_ground_level'])
    for (const [key, text] of finding) expect(text, key).toMatch(WAYS)
  })
})
