import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * WRT-44: a plan an older writer wrote with a wall of no length (its two ends one point) is
 * written over with rooms text, and read back and written again, without Grid saying something
 * went wrong inside it.
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

interface PlanFile {
  walls: Array<{ id: string; start: [number, number]; end: [number, number]; thickness: number; kind: string }>
  rooms: Array<{ id: string; boundary: string[] }>
  openings: Array<Record<string, unknown>>
}

/** The flat written from rooms text, then given a wall of no length in its first room's outline, with a door in it. */
async function older(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-no-length-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  writeFileSync(join(dir, 'plan.rooms'), FLAT)
  expect((await grid(dir, 'write', 'plan.rooms')).status).toBe(0)
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as PlanFile
  const at = plan.walls[0]!.start
  plan.walls.push({ id: 'z', start: [at[0], at[1]], end: [at[0], at[1]], thickness: 0.1, kind: 'interior' })
  plan.rooms[0]!.boundary.push('z')
  plan.openings.push({ id: 'dz', wall: 'z', type: 'door', offset: 0, width: 0.8, sill: 0, height: 2.1 })
  writeFileSync(join(dir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
  return dir
}

describe('a plan holding a wall with no length (WRT-44)', () => {
  it('is written over with --replace, and nothing goes wrong inside Grid', async () => {
    const dir = await older()
    const ran = await grid(dir, 'write', 'plan.rooms', '--replace')
    expect(ran.err).not.toMatch(/inside Grid/i)
    expect(ran.status).toBe(0)
    const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as PlanFile
    expect(plan.walls.some((w) => w.id === 'z')).toBe(false)
  })

  it('reads back as rooms text naming the wall it leaves out, and that text is written', async () => {
    const dir = await older()
    const back = await grid(dir, 'describe', '--as', 'rooms')
    expect(back.status).toBe(0)
    expect(back.out).toContain('# Left out: wall "z" has no length')
    writeFileSync(join(dir, 'back.rooms'), back.out)
    const ran = await grid(dir, 'write', 'back.rooms')
    expect(ran.err).not.toMatch(/inside Grid/i)
    expect(ran.status).toBe(0)
  })
})
