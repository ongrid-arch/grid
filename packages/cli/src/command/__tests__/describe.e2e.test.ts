import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'

/**
 * VEW-5: `grid describe`, run the way a person runs it: the built file, as its own Node
 * process, in a temporary folder. What each length says is tested on the library in
 * `describe/__tests__`.
 */

const cli = resolve(__dirname, '../../..')
const bundle = join(cli, 'dist', 'grid.mjs')

const made: string[] = []
let dir: string

beforeAll(() => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-describe-'))
  made.push(dir)
  for (const name of ['two-bed-flat.json', 'front-door-into-bedroom.json']) {
    writeFileSync(join(dir, name), readFileSync(join(cli, 'fixtures', name)))
  }
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

interface Run {
  readonly status: number | null
  readonly out: string
  readonly err: string
}

function grid(args: readonly string[], cwd = dir): Run {
  const run = spawnSync(process.execPath, [bundle, ...args], { cwd, timeout: 30_000 })
  if (run.error) throw run.error
  return { status: run.status, out: run.stdout.toString('utf8'), err: run.stderr.toString('utf8') }
}

function expectRefusal(run: Run, status: number, ...words: string[]): void {
  expect(run.status).toBe(status)
  expect(run.out).toBe('')
  expect(run.err.trimEnd().split('\n')).toHaveLength(1)
  expect(run.err.startsWith('grid: ')).toBe(true)
  for (const word of words) expect(run.err).toContain(word)
}

describe('grid describe', () => {
  it("prints a person's rooms card when asked nothing else", () => {
    const run = grid(['describe', 'two-bed-flat.json'])
    expect(run.status).toBe(0)
    expect(run.err).toBe('')
    // MSG-3: the label is the first line; the card follows it.
    expect(run.out.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(run.out.split('\n')[1]).toBe('A plan of one floor with 5 rooms (none says what it is for), 68.8 m² inside; from outside, a door leads into Living room.')
    expect(run.out).toContain('\nBedroom 2: 3.83 × 3.58, 13.7 m², at 0.13, 0.13.')
    expect(run.out).not.toContain('bed2')
    expect(run.out.trimEnd().endsWith('This describes the plan and checks nothing: grid check runs the checks.')).toBe(true)
  })

  it('answers in three lengths, for a person and for an agent', () => {
    const sizes: Record<string, number> = {}
    for (const length of ['line', 'rooms', 'walls']) {
      for (const audience of ['person', 'agent']) {
        const run = grid(['describe', 'two-bed-flat.json', '--length', length, `--for=${audience}`])
        expect(run.status).toBe(0)
        sizes[`${length} ${audience}`] = Buffer.byteLength(run.out)
        // MSG-3: the label is the first line at every length, for both readers; the cards no
        // longer hold it themselves (describe.test.ts), so it is held here.
        expect(run.out.split('\n')[0], `${length} ${audience}`).toBe(GENERAL_GUIDANCE_LABEL)
        // The label, then the one line (MSG-3).
        if (length === 'line') expect(run.out.trimEnd().split('\n')).toEqual([GENERAL_GUIDANCE_LABEL, expect.any(String)])
        if (audience === 'agent') expect(run.out).toContain(length === 'line' ? 'into lounge' : 'bed2')
      }
    }
    expect(sizes['line person']).toBeLessThan(sizes['rooms person']!)
    expect(sizes['rooms person']).toBeLessThan(sizes['walls person']!)
    expect(sizes['rooms agent']).toBeLessThan(sizes['walls agent']!)
  })

  it('shows the front door that opens into a bedroom on the first line', () => {
    const run = grid(['describe', 'front-door-into-bedroom.json', '--length', 'line'])
    expect(run.out).toBe(`${GENERAL_GUIDANCE_LABEL}\nA plan of one floor with 6 rooms (2 bedrooms, 1 bathroom), 62.6 m² inside; from outside, a door leads into Bedroom 2.\n`)
  })

  it('reads plan.json with no path inside a project grid init made', () => {
    const project = join(dir, 'demo')
    expect(grid(['init', 'demo']).status).toBe(0)
    const run = grid(['describe', '--length', 'line'], project)
    expect(run.status).toBe(0)
    expect(run.out.trimEnd().split('\n')).toHaveLength(2)
    expect(run.out.startsWith(`${GENERAL_GUIDANCE_LABEL}\nA plan of one floor with 2 rooms`)).toBe(true)
    // From another folder too, with --project.
    expect(grid(['describe', '--project', project, '--length', 'line']).out).toBe(run.out)
  })

  it('says where it looked when the folder holds no plan.json (CMD-18)', () => {
    expectRefusal(grid(['describe']), 1, 'holds no plan.json')
  })

  it('refuses a length or an audience it does not know, by name', () => {
    expectRefusal(grid(['describe', 'two-bed-flat.json', '--length', 'short']), 2, '--length takes one of line, rooms, walls, walk: got "short".')
    expectRefusal(grid(['describe', 'two-bed-flat.json', '--for', 'client']), 2, '--for takes one of person, agent: got "client".')
  })

  it('refuses a repeated option, a switch it does not take and a stray value', () => {
    expectRefusal(grid(['describe', 'two-bed-flat.json', '--for', 'agent', '--for', 'person']), 2, '--for was given more than once')
    expectRefusal(grid(['describe', 'two-bed-flat.json', '--json']), 2, 'describe has no option "--json"')
    expectRefusal(grid(['describe', 'two-bed-flat.json', '--length']), 2, '--length needs a value')
    expectRefusal(grid(['describe', 'two-bed-flat.json', 'other.json']), 2, 'describe takes one plan file')
  })

  it('refuses a plan outside the project and a file that is not there', () => {
    expectRefusal(grid(['describe', '../elsewhere.json']), 1)
    expectRefusal(grid(['describe', 'missing.json']), 1, 'There is no file missing.json.')
  })

  it('shows its help, and the overview lists it', () => {
    const help = grid(['describe', '--help'])
    expect(help.status).toBe(0)
    expect(help.out).toContain('Usage: grid describe [<plan.json>] [--length line|rooms|walls|walk] [--for person|agent] [--as rooms] [--floor <id>] [--pictures <folder>] [--lang en|es] [--project <folder>]')
    expect(help.out).toContain('--length <value>')
    expect(help.out).toContain('--for <value>')
    expect(grid(['--help']).out).toMatch(/^ {2}describe Describes the plan/m)
  })
})
