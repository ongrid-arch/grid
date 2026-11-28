import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * CMD-54: `grid write <plan.rooms> --dry-run` tries the rooms text against the plan and answers
 * as the write would, writing nothing: the plan, its change log and the folder stay as they were.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')
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

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-dry-run-'))
  made.push(dir)
  writeFileSync(join(dir, 'flat.rooms'), FLAT)
  return dir
}

const everything = (dir: string): Record<string, string> => Object.fromEntries(readdirSync(dir).sort().map((file) => [file, readFileSync(join(dir, file), 'utf8')]))

describe('grid write --dry-run (CMD-54)', () => {
  it('answers the rooms and writes no plan', async () => {
    const dir = folder()
    const was = everything(dir)
    const ran = await grid(dir, 'write', 'flat.rooms', '--plan', 'flat.json', '--dry-run')
    expect(ran.status, ran.err).toBe(0)
    expect(ran.out).toMatch(/^Dry run: tried the rooms text against "flat\.json" and wrote nothing/m)
    expect(ran.out).toMatch(/Rooms, inside faces/)
    expect(everything(dir)).toEqual(was)
  })

  it('leaves a written plan and its change log as they were, in --json too', async () => {
    const dir = folder()
    expect((await grid(dir, 'write', 'flat.rooms', '--plan', 'flat.json')).status).toBe(0)
    const was = everything(dir)
    writeFileSync(join(dir, 'wider.rooms'), FLAT.replace(/(\d+(?:\.\d+)?) x /, (_, w: string) => `${Number(w) + 0.5} x `))
    const after = { ...was, 'wider.rooms': readFileSync(join(dir, 'wider.rooms'), 'utf8') }
    const ran = await grid(dir, 'write', 'wider.rooms', '--plan', 'flat.json', '--dry-run', '--json')
    expect(ran.status, ran.err).toBe(0)
    const answer = JSON.parse(ran.out) as { dryRun: boolean; written: string; verdict: string | null }
    expect(answer).toMatchObject({ dryRun: true, written: 'flat.json' })
    expect(answer.verdict).toEqual(expect.stringContaining('the plan this text writes'))
    expect(everything(dir)).toEqual(after)
  })

  it('refuses text with problems as the write does', async () => {
    const dir = folder()
    writeFileSync(join(dir, 'bad.rooms'), 'room a "A" living 4 x 4\nroom b "B" kennel 3 x 3 east of a\n')
    const ran = await grid(dir, 'write', 'bad.rooms', '--plan', 'bad.json', '--dry-run')
    expect(ran.status).not.toBe(0)
    expect(ran.err).toMatch(/kennel/)
    expect(readdirSync(dir)).not.toContain('bad.json')
  })

  it('goes with a rooms text file only', async () => {
    const dir = folder()
    const ran = await grid(dir, 'write', '--layout', 'tidy', '--plan', 'flat.json', '--dry-run')
    expect(ran.status).not.toBe(0)
    expect(ran.err).toMatch(/--dry-run goes with a rooms text file, not --layout/)
  })
})
