/**
 * CMD-24: one id rule for rooms text, every tool and every option, and a way for a plan whose
 * file holds ids with no plain form to get plain ones without its file being rewritten by hand.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ID_PATTERN as RULE } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { ID_PATTERN, toolDefinition } from '../../mcp/toolkit'
import { checkDiffRequest } from '../diff'
import { runGrid } from '../main'
import { UsageError } from '../options'
import { EDIT_TOOLS } from '../../mcp/editTools'

const t = 0.2
const wall = (id: string, start: [number, number], end: [number, number], kind = 'exterior') => ({ id, start, end, thickness: t, height: 2.7, kind })
/** Two rooms whose ids have no plain form, as rooms text wrote them before ids were plain. */
const plan = {
  version: '1',
  units: 'm',
  walls: [wall('s1', [0, 0], [4, 0]), wall('s2', [4, 0], [7, 0]), wall('e', [7, 0], [7, 4]), wall('n2', [7, 4], [4, 4]), wall('n1', [4, 4], [0, 4]), wall('w', [0, 4], [0, 0]), wall('w-客厅-卧室', [4, 0], [4, 4], 'interior')],
  rooms: [
    { id: '客厅', name: '客厅', use: 'living', boundary: ['s1', 'w-客厅-卧室', 'n1', 'w'] },
    { id: '卧室', name: '卧室', use: 'bedroom', boundary: ['s2', 'e', 'n2', 'w-客厅-卧室'] },
  ],
  openings: [{ id: 'd1', wall: 'w-客厅-卧室', type: 'door', offset: 1.5, width: 0.8, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': plan })
})
afterAll(() => b.close())

async function grid(...args: string[]): Promise<string> {
  let out = ''
  let err = ''
  const status = await runGrid(args, { stdout: (d) => (out += typeof d === 'string' ? d : ''), stderr: (e) => (err += e), stdoutIsTerminal: false, cwd: b.folder })
  expect(err).toBe('')
  expect(status).toBe(0)
  return out
}

describe('one id rule', () => {
  it('is the schema pattern of every id argument', () => {
    expect(ID_PATTERN).toBe(RULE)
    const schema = toolDefinition(EDIT_TOOLS.find((tool) => tool.name === 'grid_rename_room')!).inputSchema as { properties: Record<string, { pattern?: string }> }
    expect(schema.properties['room']!.pattern).toBe(RULE)
  })

  it('reads grid diff --rooms as the tools read an id', () => {
    expect(checkDiffRequest({ rooms: 'baño, salón' }).rooms).toEqual(['bano', 'salon'])
    expect(() => checkDiffRequest({ rooms: '客厅' })).toThrow(UsageError)
  })

  it('refuses an id with no plain form and says how the plan gets plain ids', async () => {
    const refused = await b.call('grid_rename_room', { plan: 'plan.json', room: '客厅', name: 'Living' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('grid_describe as=rooms')
    expect(refused.text).toContain('grid_write_rooms')
  })
})

describe('a plan whose file holds ids with no plain form', () => {
  it('reads back as rooms text with plain ids, names as written, and writes back over the plan', async () => {
    const text = await grid('describe', 'plan.json', '--as', 'rooms')
    expect(text).toContain("'客厅' is 'living'")
    expect(text).toContain('room living "客厅"')
    expect(text).toContain('room bedroom "卧室"')
    expect(text).not.toMatch(/^room 客厅/mu)
    const told = await b.call('grid_describe', { plan: 'plan.json', as: 'rooms' })
    expect(told.isError, told.text).toBe(false)
    const written = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: (told.data as { text: string }).text })
    expect(written.isError, written.text).toBe(false)
    const after = JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8')) as typeof plan
    expect(after.rooms.map((r) => [r.id, r.name])).toEqual([['living', '客厅'], ['bedroom', '卧室']])
    const renamed = await b.call('grid_rename_room', { plan: 'plan.json', room: 'living', name: 'Living' })
    expect(renamed.isError, renamed.text).toBe(false)
  })
})
