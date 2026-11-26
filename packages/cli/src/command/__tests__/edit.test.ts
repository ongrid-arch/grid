import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * `grid edit <verb>` (WRT-3): the tool server's changes as verbs of the command, run in this
 * process through `runGrid`, as the built file runs it.
 */

const flat = resolve(__dirname, '../../../../floorplan/fixtures/edits/flat-v00.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-edit-'))
  made.push(dir)
  writeFileSync(join(dir, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(dir, 'plan.json'), readFileSync(flat))
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

describe('grid edit', () => {
  it('renames a room of the project\'s plan and says which checks now apply differently', async () => {
    const dir = project()
    const ran = await grid(dir, 'edit', 'rename', '--room', 'bed2', '--name', 'Study', '--use', 'other')
    expect(ran.err).toBe('')
    expect(ran.status).toBe(0)
    expect(ran.out.split('\n').slice(0, 2)).toEqual(['Renamed "Bedroom 2" to "Study".', '"Study" is used as other now, not bedroom.'])
    expect(ran.out).toMatch(/Wrote "plan\.json"\.\n$/)
    expect(ran.out).not.toContain(dir)
    const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { rooms: Array<{ id: string; name: string; use: string }> }
    expect(plan.rooms.find((r) => r.id === 'bed2')).toMatchObject({ name: 'Study', use: 'other' })
  })

  it('takes a number option as metres, and writes to --out', async () => {
    const dir = project()
    const ran = await grid(dir, 'edit', 'move-side', 'plan.json', '--room', 'kitchen', '--side', 'south', '--to', '4', '--out', 'deeper.json', '--json')
    expect(ran.status).toBe(0)
    const data = JSON.parse(ran.out) as { label: string; written: string; couldNotKeep: string[] }
    expect(data.label).toBe('General guidance, not your local rules')
    expect(data.written).toBe('deeper.json')
    expect(data.couldNotKeep).toHaveLength(1)
  })

  it('refuses an option the verb does not take, by name', async () => {
    const ran = await grid(project(), 'edit', 'merge', '--room', 'living', '--by', '2')
    expect(ran.status).toBe(2)
    expect(ran.err).toMatch(/^grid: edit merge has no option "--by"\. Its options: --room, --with, --name, --use, --type, --zones, --new-room, --correction, --out, --json, --project, --help\.\n$/)
  })

  it('names a missing option as the command line spells it', async () => {
    const ran = await grid(project(), 'edit', 'merge', '--room', 'living')
    expect(ran.status).toBe(2)
    expect(ran.err).toMatch(/^grid: Pass --with: /)
  })

  it('refuses a change it cannot make in one line, and writes nothing', async () => {
    const dir = project()
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const ran = await grid(dir, 'edit', 'merge', '--room', 'living', '--with', 'bath')
    expect(ran.status).toBe(1)
    expect(ran.err.split('\n')).toHaveLength(2)
    expect(ran.err).toMatch(/do not share a wall/)
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
  })

  it('takes a yes-or-no option named alone or followed by true, as its help says (CMD-29)', async () => {
    const dir = project()
    const alone = await grid(dir, 'edit', 'merge', '--room', 'living', '--with', 'bath', '--zones')
    const spelled = await grid(dir, 'edit', 'merge', '--room', 'living', '--with', 'bath', '--zones', 'true')
    expect(spelled.err).not.toMatch(/takes one plan file/)
    expect(spelled).toEqual(alone)
    const off = await grid(dir, 'edit', 'merge', '--room', 'living', '--with', 'bath', '--zones', 'false')
    expect(off).toEqual(await grid(dir, 'edit', 'merge', '--room', 'living', '--with', 'bath'))
  })

  it('lists its verbs', async () => {
    const ran = await grid(project(), 'edit', '--help')
    expect(ran.status).toBe(0)
    expect(ran.out).toMatch(/^Usage: grid edit <verb>/)
    for (const verb of ['opening', 'move-side', 'merge', 'split', 'add-room', 'stretch', 'rename', 'mirror']) expect(ran.out).toContain(`  ${verb}`)
  })

  it('says --sill is a door\'s threshold as well as a window\'s sill', async () => {
    const ran = await grid(project(), 'edit', 'opening', '--help')
    expect(ran.status).toBe(0)
    expect(ran.out).toMatch(/--sill <value>.*door's threshold/)
    expect(ran.out).not.toMatch(/--sill <value>\s+Windows:/)
  })
})
