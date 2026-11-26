import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { inspectPlan } from '@ongrid/rules'
import { inventedScan, INVENTED_FLAT } from '@ongrid/floorplan/test-support/roomScan'
import { runGrid } from '../main'

/**
 * HND-12: `grid write --scan`, a plan written from a phone room scan, and the scan kept beside it
 * as evidence, keyed by its own ids. The scans are invented (`test-support/roomScan.ts`). Run in
 * this process through `runGrid`, as the built file runs it.
 */

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

interface Ran {
  readonly status: number
  readonly out: string
  readonly err: string
}

async function grid(dir: string, ...args: string[]): Promise<Ran> {
  let out = ''
  let err = ''
  const status = await runGrid(args, {
    stdout: (data) => (out += typeof data === 'string' ? data : Buffer.from(data).toString('utf8')),
    stderr: (text) => (err += text),
    stdoutIsTerminal: false,
    cwd: dir,
  })
  return { status, out, err }
}

const SCAN = inventedScan(INVENTED_FLAT)

async function project(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-scan-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  writeFileSync(join(dir, 'flat.json'), JSON.stringify(SCAN.json))
  return dir
}

const read = (dir: string, file: string): Record<string, unknown> => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>

describe('grid write --scan (lab AE-2)', () => {
  it('writes the plan with no issue but the values to confirm, lists what it assumed, and keeps the scan beside it', async () => {
    const dir = await project()
    const run = await grid(dir, 'write', '--scan', 'flat.json')
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    expect(run.out).toContain('Wrote plan.json from the scan flat.json: 4 rooms, 7 walls (3 between two scanned faces, 4 scanned from one side), 6 doors and windows, 4 fixtures.')
    expect(run.out).toContain('"Living room" 16.00 m² (the scan\'s floor outline 16.00 m², 0.0000% apart)')
    expect(run.out).toContain('Assumed, to confirm with the person (5):')
    expect(run.out).toContain('Kept the scan beside the plan as plan.scan.json, keyed by its own ids')
    expect(run.out).toContain('Problems in the drawing: 0 → 0.')

    const result = inspectPlan(readFileSync(join(dir, 'plan.json'), 'utf8'))
    // Nothing refused, left out, worth a look or found: the eight values the scan does not give, to
    // confirm with the person (CNT-45: the bed's and the sofa's turns among them), and (CNT-14) the four doors whose swing the scan does not say, as
    // not checked. A scan states no kind and no part that opens: each door is one leaf.
    expect(result.counts).toEqual({ refused: 0, 'left-out': 0, 'worth-a-look': 0, finding: 0, 'not-checked': 1, 'to-confirm': 8 })
    expect(result.lines.filter((l) => l.code !== 'plan/value-assumed').map((l) => [l.code, l.also])).toEqual([['floor/not-checked-door-swings', ['door-1', 'door-2', 'door-3', 'door-4']]])
    const written = read(dir, 'plan.json') as { openings: Array<Record<string, unknown>> }
    expect(written.openings.filter((o) => 'kind' in o || 'opens' in o)).toEqual([])

    const evidence = read(dir, 'plan.scan.json')
    expect(evidence).toMatchObject({ kind: 'grid-scan-evidence', version: 1, format: 'apple-room-model', capture: { identifier: SCAN.ids['capture'], version: 2 } })
    const surfaces = evidence['surfaces'] as Record<string, { list: string; drawnAs: unknown }>
    expect(Object.keys(surfaces)).toHaveLength(Object.keys(SCAN.ids).length - 1)
    expect(surfaces[SCAN.ids['living-floor']!]).toMatchObject({ list: 'floors', drawnAs: { part: 'room', id: 'living' } })
    expect(surfaces[SCAN.ids['front-door']!]).toMatchObject({ list: 'doors', drawnAs: { part: 'opening', id: 'door-1' } })
    expect(surfaces[SCAN.ids['bed']!]).toMatchObject({ list: 'objects', category: 'bed', drawnAs: { part: 'item', id: 'bed-1' } })
  })

  it('matches a re-scan to the scan kept before: the same ids keep the same parts', async () => {
    const dir = await project()
    expect((await grid(dir, 'write', '--scan', 'flat.json')).status).toBe(0)
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const again = await grid(dir, 'write', '--scan', 'flat.json')
    expect(again.err).toBe('')
    expect(again.out).toContain('Matched to the scan kept before by its ids: 21 parts kept their ids, 0 new; nothing the scan before had is missing.')
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
  })

  it('refuses a plan changed since it was written from the scan, and with --replace keeps the person\'s facts by id', async () => {
    const dir = await project()
    expect((await grid(dir, 'write', '--scan', 'flat.json')).status).toBe(0)
    const plan = read(dir, 'plan.json') as { rooms: Array<{ id: string; number?: string }> }
    plan.rooms[0]!.number = 'G.01'
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
    const refused = await grid(dir, 'write', '--scan', 'flat.json')
    expect(refused.status).toBe(1)
    expect(refused.err).toContain('plan.json was changed since Grid wrote it from the scan kept beside it')
    expect(read(dir, 'plan.json')).toEqual(plan)
    const replaced = await grid(dir, 'write', '--scan', 'flat.json', '--replace')
    expect(replaced.status).toBe(0)
    expect(replaced.out).toContain('Facts of your own and room numbers kept by id on 1 part.')
    expect((read(dir, 'plan.json') as typeof plan).rooms[0]).toMatchObject({ id: 'living', number: 'G.01' })
  })

  it('refuses to write a scan over a plan not written from one', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'plan.rooms'), 'walls outside 0.3 inside 0.1 height 2.6\nroom a "A" living 4 x 4\n')
    expect((await grid(dir, 'write', 'plan.rooms')).status).toBe(0)
    const refused = await grid(dir, 'write', '--scan', 'flat.json')
    expect(refused.status).toBe(1)
    expect(refused.err).toContain('plan.json was not written from a scan: there is no scan kept beside it (plan.scan.json)')
  })

  it('refuses a file that is not a scan, never quoting it', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'notes.json'), '{"my address is": 12 Some Street}')
    const notJson = await grid(dir, 'write', '--scan', 'notes.json')
    expect(notJson.status).toBe(1)
    expect(notJson.err).toContain('notes.json is not JSON, so it is not a room scan.')
    expect(notJson.err).not.toContain('Street')
    writeFileSync(join(dir, 'empty.json'), '{"doors": []}')
    const noWalls = await grid(dir, 'write', '--scan', 'empty.json')
    expect(noWalls.err).toContain('it holds no walls')
    expect((await grid(dir, 'write', 'plan.rooms', '--scan', 'flat.json')).err).toContain('name one or the other, not both')
    expect((await grid(dir, 'write', '--scan', 'plan.json', '--plan', 'plan.json')).err).toContain('The scan and the plan are one file')
  })
})
