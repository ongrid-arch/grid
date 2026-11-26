/**
 * WRT-75: a fit-out started on a base plan through the tool server, changed by the edits and
 * written again from rooms text, the base never changed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runEdit } from '../../command/edit'
import { bench, type Bench } from './replay/harness'

type Part = { id: string; boundary?: string[] }
type PlanFile = { base?: string; walls: Part[]; rooms: Part[]; openings: Part[] }

const wall = (id: string, start: number[], end: number[], kind = 'exterior', thickness = 0.3) => ({ id, start, end, thickness, height: 2.7, kind })

/** A shell of two rooms, 8 by 5 m between centre lines, split at x = 4, a door in from the south. */
const SHELL = {
  version: '1',
  walls: [wall('n1', [0, 5], [4, 5]), wall('n2', [4, 5], [8, 5]), wall('e', [8, 5], [8, 0]), wall('s2', [8, 0], [4, 0]), wall('s1', [4, 0], [0, 0]), wall('west', [0, 0], [0, 5]), wall('mid', [4, 0], [4, 5], 'interior', 0.1)],
  rooms: [
    { id: 'left', name: 'Left bay', use: 'office', boundary: ['s1', 'mid', 'n1', 'west'] },
    { id: 'right', name: 'Right bay', use: 'office', boundary: ['s2', 'e', 'n2', 'mid'] },
  ],
  openings: [
    { id: 'front', wall: 's1', type: 'door', offset: 1, width: 0.9, height: 2.1 },
    { id: 'd-mid', wall: 'mid', type: 'door', offset: 2, width: 0.8, height: 2.1 },
  ],
}

let b: Bench
beforeAll(() => {
  b = bench({ 'shell.json': SHELL })
})
afterAll(() => b.close())

const onDisk = (file: string): PlanFile => JSON.parse(readFileSync(join(b.folder, file), 'utf8')) as PlanFile
const shellText = (): string => readFileSync(join(b.folder, 'shell.json'), 'utf8')
async function ok(name: string, args: Record<string, unknown>) {
  const reply = await b.call(name, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

describe('grid_start_fit_out (WRT-75)', () => {
  it("writes a fit-out of the base's rooms on the base's walls, which grid_check reads whole", async () => {
    const before = shellText()
    const reply = await ok('grid_start_fit_out', { base: 'shell.json', plan: 'fit.json', name: 'Clinic' })
    expect(reply.text).toContain('Started a fit-out on the base plan "shell.json": its 2 rooms are the fit-out\'s own')
    expect(reply.data).toMatchObject({ written: 'fit.json', base: 'shell.json', rooms: ['left', 'right'] })
    const file = onDisk('fit.json')
    expect(file.base).toBe('shell.json')
    expect(file.walls).toEqual([])
    expect(file.openings).toEqual([])
    expect(file.rooms.map((r) => r.boundary)).toEqual(SHELL.rooms.map((r) => r.boundary))
    const check = await ok('grid_check', { plan: 'fit.json' })
    expect(check.text).toContain('fitted out in "shell.json"')
    expect(check.text).not.toMatch(/\berror\b/)
    expect(shellText()).toBe(before)
  })

  it('refuses a plan that holds parts already, and the base as the fit-out', async () => {
    const again = await b.call('grid_start_fit_out', { base: 'shell.json', plan: 'fit.json' })
    expect(again.isError).toBe(true)
    expect(again.text).toContain('holds a plan already: pass replace=true')
    const self = await b.call('grid_start_fit_out', { base: 'shell.json', plan: 'shell.json', replace: true })
    expect(self.isError).toBe(true)
    expect(self.text).toContain('plan is the base plan')
    const missing = await b.call('grid_start_fit_out', { base: 'nowhere.json', plan: 'other.json' })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('There is no file')
  })

  it('takes the edits as the work, and keeps the base as it is', async () => {
    const before = shellText()
    await ok('grid_start_fit_out', { base: 'shell.json', plan: 'split.json' })
    await ok('grid_split_room', { plan: 'split.json', room: 'left', side: 'north', size: 1.5, new_room: 'store', new_name: 'Store', new_use: 'storage' })
    const file = onDisk('split.json')
    expect(file.walls).toHaveLength(1)
    expect(file.rooms.map((r) => r.id).sort()).toEqual(['left', 'right', 'store'])
    expect(shellText()).toBe(before)
    // A change that would cut the shell is refused.
    const cut = await b.call('grid_add_opening', { plan: 'split.json', type: 'window', room: 'right', side: 'east' })
    expect(cut.isError).toBe(true)
    expect(cut.text).toContain('base plan "shell.json"')
  })

  it('writes a fit-out from rooms text on the same base, resting on its walls', async () => {
    const rooms = ['base shell.json', 'walls outside 0.3 inside 0.1', 'room left "Consulting" office 3.8 x 4.7 at 0.15,0.15', 'room right "Waiting" office 3.8 x 4.7 east of left'].join('\n')
    const reply = await ok('grid_write_rooms', { plan: 'text.json', rooms })
    expect(reply.text).toContain('The rooms rest on 7 of its walls')
    const file = onDisk('text.json')
    expect(file.base).toBe('shell.json')
    expect(file.walls).toEqual([])
    expect(file.rooms.find((r) => r.id === 'left')!.boundary).toEqual(['s1', 'mid', 'n1', 'west'])
  })

  it('is the verb fit-out of grid edit', async () => {
    let out = ''
    await runEdit(['fit-out', 'cli.json', '--base', 'shell.json', '--project', b.folder], b.folder, (text) => { out += text })
    expect(out).toContain('Started a fit-out on the base plan "shell.json"')
    expect(onDisk('cli.json').base).toBe('shell.json')
  })
})
