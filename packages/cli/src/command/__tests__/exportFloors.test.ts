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

describe('grid export: materials, roofs and curves (VEW-73)', () => {
  it('writes grid.mtl beside an OBJ, into exports/ and beside --out', async () => {
    const dir = folder()
    const run = await grid(dir, 'export', 'house.json', '--format', 'obj')
    expect(run.status).toBe(0)
    expect(run.out).toContain(join('exports', 'grid.mtl'))
    expect(existsSync(join(dir, 'exports', 'grid.mtl'))).toBe(true)
    const out = await grid(dir, 'export', 'house.json', '--format', 'obj', '--out', 'model.obj')
    expect(out.status).toBe(0)
    expect(existsSync(join(dir, 'grid.mtl'))).toBe(true)
  })

  it('takes --no-roofs and --arc-segments for a GLB, and writes no materials file for it', async () => {
    const dir = folder()
    const run = await grid(dir, 'export', 'house.json', '--format', 'glb', '--no-roofs', '--arc-segments', '32')
    expect(run.status).toBe(0)
    expect(existsSync(join(dir, 'exports', 'grid.mtl'))).toBe(false)
  })

  it('refuses them for DXF and IFC, and a count of pieces it does not write', async () => {
    const dir = folder()
    expect((await grid(dir, 'export', 'house.json', '--format', 'dxf', '--no-roofs')).err).toContain('--no-roofs applies to GLB and OBJ only')
    expect((await grid(dir, 'export', 'house.json', '--format', 'ifc', '--arc-segments', '32')).err).toContain('--arc-segments applies to GLB and OBJ only')
    for (const bad of ['2', '1001', '12.5', 'many']) {
      const run = await grid(dir, 'export', 'house.json', '--format', 'glb', '--arc-segments', bad)
      expect(run.status).not.toBe(0)
      expect(run.err).toContain('give a whole number from 3 to 1000')
    }
  })
})
