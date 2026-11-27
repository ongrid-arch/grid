import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS, serverTool } from '../../mcp/serveTools'
import { runGrid } from '../main'
import { READ_COMMANDS } from '../read'

/**
 * CMD-48: the reading tools as commands, run in this process through `runGrid`: the same answer
 * as the tool server's, a table where there is one, and `--fail-on` for CI.
 */

const flat = resolve(__dirname, '../../../../floorplan/fixtures/edits/flat-v00.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-read-'))
  made.push(dir)
  writeFileSync(join(dir, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(dir, 'plan.json'), readFileSync(flat))
  writeFileSync(join(dir, 'other.json'), readFileSync(flat))
  return dir
}

async function grid(dir: string, ...args: string[]): Promise<{ status: number; out: string; err: string }> {
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

/** What the tool server answers to the same call, as `structuredContent`. */
async function served(dir: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tool = GRID_TOOLS.find((t) => t.name === name)!
  const answer = await serverTool(tool, { project: openProject(dir, dir, 'project') }).call({ ...args, whole: true })
  expect(answer.isError).toBeUndefined()
  return answer.data!
}

const SAME: readonly [string[], string, Record<string, unknown>][] = [
  [['areas'], 'grid_areas', {}],
  [['schedule', '--of', 'doors'], 'grid_schedule', { of: 'doors' }],
  [['takeoff', 'plan.json'], 'grid_takeoff', { plan: 'plan.json' }],
  [['measure', 'narrow', '--under', '0.8'], 'grid_measure', { what: 'narrow', under: 0.8 }],
  [['measure', '--what', 'room', '--room', 'bed2'], 'grid_measure', { what: 'room', room: 'bed2' }],
  [['count', '--kind', 'door', '--by', 'width'], 'grid_count', { kind: ['door'], by: 'width' }],
  [['find', '--kind', 'door,window', '--fields', 'width'], 'grid_find', { kind: ['door', 'window'], fields: ['width'] }],
  [['measure', 'seats'], 'grid_measure', { what: 'seats' }],
  [['find', '--kind', 'item'], 'grid_find', { kind: ['item'] }],
  [['count', '--kind', 'item'], 'grid_count', { kind: ['item'] }],
  [['fields', '--kind', 'room'], 'grid_fields', { kind: ['room'] }],
  [['compare', 'plan.json', 'other.json'], 'grid_compare', { plans: ['plan.json', 'other.json'] }],
  [['brief'], 'grid_write_brief', {}],
]

describe('the reading commands', () => {
  it('has a command for each reading tool named', () => {
    expect(Object.keys(READ_COMMANDS)).toEqual(['areas', 'schedule', 'takeoff', 'measure', 'count', 'find', 'fields', 'compare', 'brief'])
  })

  it.each(SAME)('grid %j --json prints exactly the tool server\'s structured answer', async (args, tool, call) => {
    const dir = project()
    const ran = await grid(dir, ...args, '--json')
    expect(ran.err).toBe('')
    expect(ran.status).toBe(0)
    expect(JSON.parse(ran.out)).toEqual(await served(dir, tool, call))
  })

  it('prints the tool\'s text without --json', async () => {
    const ran = await grid(project(), 'measure', 'narrow', '--under', '0.8')
    expect(ran.status).toBe(0)
    expect(ran.out.split('\n')[0]).toBe('General guidance, not your local rules')
    expect(ran.out).toContain('Narrower than 0.80 m: door "door-bath" 0.70 m')
  })

  it('writes the tool\'s own CSV for areas, the same as --format csv', async () => {
    const dir = project()
    const asCsv = await grid(dir, 'areas', '--csv')
    expect(asCsv.status).toBe(0)
    expect(asCsv.out.split('\n')[0]).toBe('"General guidance, not your local rules"')
    expect(asCsv.out).toContain(',')
    expect((await grid(dir, 'areas', '--format', 'csv')).out).toBe(asCsv.out)
  })

  it('writes the rows of find and the groups of count as CSV', async () => {
    const dir = project()
    const found = await grid(dir, 'find', '--kind', 'door', '--fields', 'width', '--csv')
    expect(found.status).toBe(0)
    expect(found.out.split('\n').slice(0, 3)).toEqual(['"General guidance, not your local rules"', 'id,width', 'door-bath,0.7'])
    const counted = await grid(dir, 'count', '--kind', 'door', '--by', 'width', '--csv')
    expect(counted.out.split('\n').slice(1, 3)).toEqual(['width,count', '0.8,4'])
    expect(counted.out).toMatch(/\ntotal,6\n$/)
  })

  it('refuses --csv where the answer is no table, and --csv with --json', async () => {
    const measured = await grid(project(), 'measure', 'narrow', '--under', '0.8', '--csv')
    expect(measured.status).toBe(2)
    expect(measured.err).toMatch(/^grid: measure has no option "--csv"\./)
    const both = await grid(project(), 'find', '--csv', '--json')
    expect(both.status).toBe(2)
    expect(both.err).toBe('grid: --json and --csv were both given: give one.\n')
  })

  it('exits 3 after printing the answer when --fail-on holds, and 0 when it does not', async () => {
    const dir = project()
    const narrow = await grid(dir, 'find', '--kind', 'door', '--where', 'width < 0.8', '--fail-on', 'found')
    expect(narrow.status).toBe(3)
    expect(narrow.out).toContain('door "door-bath"')
    expect((await grid(dir, 'find', '--kind', 'door', '--where', 'width < 0.6', '--fail-on', 'found')).status).toBe(0)
    expect((await grid(dir, 'find', '--kind', 'door', '--where', 'width < 0.6', '--fail-on', 'none')).status).toBe(3)
    expect((await grid(dir, 'count', '--kind', 'door', '--where', 'width < 0.8', '--fail-on', 'found')).status).toBe(3)
    expect((await grid(dir, 'schedule', '--narrower-than', '0.8', '--fail-on', 'found')).status).toBe(3)
    expect((await grid(dir, 'schedule', '--narrower-than', '0.6', '--fail-on', 'found')).status).toBe(0)
    expect((await grid(dir, 'measure', 'narrow', '--under', '0.8', '--fail-on', 'short')).status).toBe(3)
    expect((await grid(dir, 'measure', 'narrow', '--under', '0.6', '--fail-on', 'short')).status).toBe(0)
    expect((await grid(dir, 'measure', 'fit', '--room', 'bed2', '--width', '3', '--depth', '3', '--fail-on', 'short')).status).toBe(3)
    expect((await grid(dir, 'measure', 'fit', '--room', 'bed2', '--width', '1', '--depth', '1', '--fail-on', 'short')).status).toBe(0)
    expect((await grid(dir, 'measure', 'use', '--room', 'bath', '--fail-on', 'short')).status).toBe(3)
    expect((await grid(dir, 'areas', '--fail-on', 'unproven')).status).toBe(0)
    expect((await grid(dir, 'compare', 'plan.json', 'other.json', '--fail-on', 'differs')).status).toBe(0)
    expect((await grid(dir, 'edit', 'move-side', '--room', 'kitchen', '--side', 'south', '--to', '4', '--out', 'deeper.json')).status).toBe(0)
    expect((await grid(dir, 'compare', 'plan.json', 'deeper.json', '--fail-on', 'differs')).status).toBe(3)
  })

  it('fails on a brief line missed, and reads the brief without writing it', async () => {
    const dir = project()
    const brief = (count: number): Record<string, unknown> => ({ rooms: [{ use: 'bedroom', count, level: 'must', source: 'given', quote: 'the bedrooms' }] })
    await served(dir, 'grid_write_brief', { brief: brief(3) })
    const kept = readFileSync(join(dir, 'plan.brief.json'), 'utf8')
    const missed = await grid(dir, 'brief', '--fail-on', 'missed')
    expect(missed.status).toBe(3)
    expect(missed.out).toContain('missed')
    expect(readFileSync(join(dir, 'plan.brief.json'), 'utf8')).toBe(kept)
    await served(dir, 'grid_write_brief', { brief: brief(2), replace: true })
    expect((await grid(dir, 'brief', '--fail-on', 'missed')).status).toBe(0)
  })

  it('refuses a --fail-on condition the command does not take, or one that means nothing for the call, before running', async () => {
    const unknown = await grid(project(), 'areas', '--fail-on', 'found')
    expect(unknown.status).toBe(2)
    expect(unknown.err).toBe('grid: --fail-on takes unproven.\n')
    const meaningless = await grid(project(), 'measure', 'room', '--room', 'bed2', '--fail-on', 'short')
    expect(meaningless.status).toBe(2)
    expect(meaningless.err).toMatch(/^grid: --fail-on short goes with measuring fit, narrow, route, use/)
    expect((await grid(project(), 'takeoff', '--fail-on', 'assumed')).status).toBe(2)
  })

  it('names the tool\'s arguments as options in a refusal, and refuses a plan it cannot read with exit 1', async () => {
    const dir = project()
    const what = await grid(dir, 'measure')
    expect(what.status).toBe(2)
    expect(what.err).toMatch(/^grid: measure needs what to measure, as its first word: room, between/)
    const room = await grid(dir, 'measure', 'fit', '--room', 'nowhere', '--width', '1', '--depth', '1')
    expect(room.status).toBe(1)
    expect(room.err.split('\n')).toHaveLength(2)
    const missing = await grid(dir, 'areas', 'nothing.json')
    expect(missing.status).toBe(1)
    const stray = await grid(dir, 'schedule', '--of', 'openings', '--narrower-than', '0.8')
    expect(stray.status).toBe(1)
    expect(stray.err).toBe('grid: --of openings takes no --narrower-than.\n')
    const one = await grid(dir, 'compare', 'plan.json')
    expect(one.status).toBe(2)
    expect(one.err).toMatch(/^grid: compare takes 2 to 6 plan files/)
  })

  it('shows each command\'s options from its tool, and lists the commands in the overview', async () => {
    const help = await grid(project(), 'schedule', '--help')
    expect(help.status).toBe(0)
    expect(help.out).toMatch(/^Usage: grid schedule /)
    expect(help.out).toContain('--narrower-than <value>')
    expect(help.out).toContain('--fail-on <value>')
    const overview = await grid(project(), '--help')
    for (const name of Object.keys(READ_COMMANDS)) expect(overview.out).toContain(`\n  ${name} `)
  })
})

describe('grid check --fail-on', () => {
  it('exits 3 on a plan with a problem to act on, and 0 on one with none', async () => {
    const dir = project()
    expect((await grid(dir, 'check', '--fail-on', 'problems')).status).toBe(0)
    const plan = JSON.parse(readFileSync(flat, 'utf8')) as { openings: { id: string }[] }
    plan.openings = plan.openings.filter((o) => o.id !== 'door-entrance')
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
    const ran = await grid(dir, 'check', '--fail-on', 'problems')
    expect(ran.status).toBe(3)
    expect(ran.out.split('\n')[0]).toBe('General guidance, not your local rules')
    expect((await grid(dir, 'check', '--fail-on', 'notes')).status).toBe(3)
    const wrong = await grid(dir, 'check', '--fail-on', 'any')
    expect(wrong.status).toBe(2)
    expect(wrong.err).toBe('grid: --fail-on takes problems or notes.\n')
  })
})
