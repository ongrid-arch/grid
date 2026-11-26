import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * WRT-75: `grid write` writes a fit-out on a base plan from rooms text: the file names its base
 * and holds only the fit-out's own walls, rooms and openings; `grid describe --as rooms` reads it
 * back on its base, and that text writes again over it as any read-back does.
 */

const SHELL = ['walls outside 0.3 inside 0.2', 'room unit "Unit" office 11.7 x 7.7 at 0.15,0.15', 'door entrance in unit south, 1 from west, 1.2 wide'].join('\n')
const FIT_OUT = [
  'base shell.json',
  'walls outside 0.2 inside 0.1',
  'room front "Reception" office 5.8 x 7.7 at 0.15,0.15',
  'room back "Treatment" office 5.8 x 7.7 east of front',
  'door d1 between front and back, centred, 0.9 wide',
].join('\n')

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

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

/** A project with the shell written as shell.json. */
async function project(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-write-fitout-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  writeFileSync(join(dir, 'shell.rooms'), SHELL)
  const shell = await grid(dir, 'write', 'shell.rooms', '--plan', 'shell.json')
  expect(shell.err).toBe('')
  return dir
}

describe('grid write on a base plan (WRT-75)', () => {
  it('writes a fit-out that names its base and holds only its own parts', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'fit.rooms'), FIT_OUT)
    const ran = await grid(dir, 'write', 'fit.rooms')
    expect(ran.err).toBe('')
    expect(ran.status).toBe(0)
    expect(ran.out).toContain('Fitted out in the base plan "shell.json"')
    expect(ran.out).toContain('The rooms rest on 4 of its walls')
    const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { base: string; walls: { id: string }[]; openings: { id: string }[] }
    expect(plan.base).toBe('shell.json')
    expect(plan.walls.map((w) => w.id)).toEqual(['w-front-back'])
    expect(plan.openings.map((o) => o.id)).toEqual(['d1'])
    // The shell is as it was.
    const shell = JSON.parse(readFileSync(join(dir, 'shell.json'), 'utf8')) as { walls: unknown[] }
    expect(shell.walls).toHaveLength(4)
    const check = await grid(dir, 'check')
    expect(check.out).toContain('fitted out in "shell.json"')
    expect(check.out).toContain('No findings.')
    expect(check.out).toContain('To look at (1): 1 not checked.')
  })

  it('reads the fit-out back on its base, and writes that text again over it', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'fit.rooms'), FIT_OUT)
    expect((await grid(dir, 'write', 'fit.rooms')).status).toBe(0)
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const read = await grid(dir, 'describe', '--as', 'rooms')
    expect(read.status).toBe(0)
    expect(read.out).toContain('\nbase shell.json\n')
    expect(read.out).not.toContain('raw ')
    writeFileSync(join(dir, 'again.rooms'), read.out)
    const again = await grid(dir, 'write', 'again.rooms')
    expect(again.err).toBe('')
    expect(again.status).toBe(0)
    const after = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as Record<string, unknown>
    const was = JSON.parse(before) as Record<string, unknown>
    for (const key of ['base', 'walls', 'rooms', 'openings']) expect(after[key], key).toEqual(was[key])
  })

  it('refuses another base, or none, over a fit-out unless asked to replace it', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'fit.rooms'), FIT_OUT)
    expect((await grid(dir, 'write', 'fit.rooms')).status).toBe(0)
    writeFileSync(join(dir, 'other.json'), readFileSync(join(dir, 'shell.json')))
    writeFileSync(join(dir, 'other.rooms'), FIT_OUT.replace('base shell.json', 'base other.json'))
    const other = await grid(dir, 'write', 'other.rooms', '--replace')
    expect(other.status).toBe(0)
    expect((JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { base: string }).base).toBe('other.json')
    writeFileSync(join(dir, 'back.rooms'), FIT_OUT)
    const refused = await grid(dir, 'write', 'back.rooms')
    expect(refused.status).not.toBe(0)
    expect(refused.err).toContain('is a fit-out on the base plan "other.json", and this rooms text names "shell.json"')
    writeFileSync(join(dir, 'none.rooms'), SHELL)
    const none = await grid(dir, 'write', 'none.rooms')
    expect(none.status).not.toBe(0)
    expect(none.err).toContain('names no base')
  })

  it('refuses a base outside the project, one that is not there, and the plan as its own base', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'out.rooms'), FIT_OUT.replace('base shell.json', 'base ../shell.json'))
    const out = await grid(dir, 'write', 'out.rooms')
    expect(out.status).not.toBe(0)
    expect(out.err).toContain('The rooms text was not written, and the plan is as it was')
    writeFileSync(join(dir, 'missing.rooms'), FIT_OUT.replace('base shell.json', 'base nowhere.json'))
    const missing = await grid(dir, 'write', 'missing.rooms')
    expect(missing.status).not.toBe(0)
    expect(missing.err).toContain('There is no file')
    writeFileSync(join(dir, 'self.rooms'), FIT_OUT)
    const self = await grid(dir, 'write', 'self.rooms', '--plan', 'shell.json')
    expect(self.status).not.toBe(0)
    expect(self.err).toContain('is the plan it would write')
  })
})
