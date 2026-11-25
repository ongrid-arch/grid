/**
 * VEW-15: a drawing's numbered notes are exactly `grid check`'s. The fields Grid writes itself
 * when it reads a plan (`unstated`, `typed`, `fromLibrary`, `placedBy`) are never named as a field
 * Grid does not know, in `grid draw`, `grid_view` or `grid diff`; a file that writes one still is.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runGrid } from '../../command/main'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/** A bedroom whose walls state no height of their own: the floor states one. */
function bedroom(): Record<string, unknown> {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, kind: 'exterior' })
  return {
    version: '1',
    floors: [{ id: 'ground', name: 'Ground', level: 0, height: 2.6 }],
    walls: [wall('s', [0, 0], [3.8, 0]), wall('e', [3.8, 0], [3.8, 3.8]), wall('n', [3.8, 3.8], [0, 3.8]), wall('w', [0, 3.8], [0, 0])],
    rooms: [{ id: 'bed', name: 'Bedroom', boundary: ['s', 'e', 'n', 'w'], use: 'bedroom' }],
    openings: [{ id: 'door', wall: 'e', type: 'door', offset: 1.6, width: 0.9, height: 2.1, hinge: 'start', swing: 'left' }],
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': bedroom() })
})
afterAll(() => b.close())

async function grid(...args: string[]): Promise<{ status: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const status = await runGrid(args, { stdout: (d) => (out += typeof d === 'string' ? d : Buffer.from(d).toString('utf8')), stderr: (t) => (err += t), stdoutIsTerminal: false, cwd: b.folder })
  return { status, out, err }
}

const marks = (svg: string): number => (svg.match(/data-part="fault-mark"/g) ?? []).length

describe('the reading\'s own fields are not notes', () => {
  it('leaves grid draw with the notes grid check lists (none) for walls with no height and a placed fixture', async () => {
    const placed = await b.call('grid_place_item', { plan: 'plan.json', name: 'double-bed', x: 1.9, y: 1.9 })
    expect(placed.isError, placed.text).toBe(false)
    const typed = await b.call('grid_change_type', { plan: 'plan.json', of: 'wall', type: 'stud', name: 'Stud', thickness: 0.2, parts: ['n'] })
    expect(typed.isError, typed.text).toBe(false)
    const check = await grid('check', 'plan.json', '--json')
    expect(check.out).not.toContain('plan/unknown-field')
    expect((JSON.parse(check.out) as { issues: unknown[] }).issues).toEqual([])
    const drawn = await grid('draw', 'plan.json')
    expect(drawn.status, drawn.err).toBe(0)
    expect(marks(drawn.out)).toBe(0)
  })

  it('leaves grid_view with none, and grid diff with no issue about them', async () => {
    const view = await b.call('grid_view', { plan: 'plan.json', kind: 'plan' })
    expect(view.isError, view.text).toBe(false)
    expect(view.text).not.toContain('Grid does not know')
    // A start marker on a plan that states none of them, then the changes that make Grid write them.
    b.write('fresh.json', bedroom())
    const marker = await b.call('grid_mark_start', { plan: 'fresh.json' })
    expect(marker.isError, marker.text).toBe(false)
    const placed = await b.call('grid_place_item', { plan: 'fresh.json', name: 'double-bed', x: 1.9, y: 1.9 })
    expect(placed.isError, placed.text).toBe(false)
    const named = await b.call('grid_change_type', { plan: 'fresh.json', of: 'wall', type: 'stud', name: 'Stud', thickness: 0.2, parts: ['n'] })
    expect(named.isError, named.text).toBe(false)
    const diff = await grid('diff', 'fresh.json', '--json')
    expect(diff.status, diff.err).toBe(0)
    expect(diff.out).toContain('"changes"')
    expect(diff.out).not.toMatch(/unknown-field|note_added|note_gone|does not know/)
  })

  it('still tells a file that writes one of them itself', async () => {
    const text = JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8')) as { walls: Record<string, unknown>[] }
    text.walls[0]!['unstated'] = ['height']
    writeFileSync(join(b.folder, 'own.json'), JSON.stringify(text))
    const check = await grid('check', 'own.json', '--json')
    expect(check.out).toContain('plan/unknown-field')
  })
})
