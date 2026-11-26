import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * VEW-64: `grid export` of a plan of several floors writes the whole building into a GLB or OBJ
 * when no floor is named, and says on standard error which floors the file holds and which not.
 */

const HOUSE = resolve(__dirname, '../../../fixtures/two-floor-house.json')
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
  const dir = mkdtempSync(join(tmpdir(), 'grid-floors-'))
  made.push(dir)
  copyFileSync(HOUSE, join(dir, 'house.json'))
  return dir
}

describe('grid export holds the whole building (VEW-64)', () => {
  it('writes one GLB of every floor, named with no floor, and says so', async () => {
    const dir = folder()
    const run = await grid(dir, 'export', 'house.json', '--format', 'glb')
    expect(run.status).toBe(0)
    expect(run.out).toBe(`Wrote ${join('exports', 'house.glb')}\n`)
    expect(run.err).toContain('Holds all 2 floors of the plan, each a node named by its id and raised to its elevation, under one root node, "building".\n')
    expect(existsSync(join(dir, 'exports', 'house.glb'))).toBe(true)
  })

  it('names the floors an OBJ of one floor leaves out, with --out too', async () => {
    const dir = folder()
    const run = await grid(dir, 'export', 'house.json', '--format', 'obj', '--floor', 'ground', '--out', 'ground.obj')
    expect(run.status).toBe(0)
    expect(run.err).toContain('Holds floor "ground" only, written at its elevation, 0.00 m; the other floor is not in this file: leave the floor out to export the whole building.\n')
  })
})
