import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/** SHT-14: the name on a rooms text's `plan` line stays in the plan and reaches the sheet, the IFC and the read-back. */

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

async function written(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-name-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  writeFileSync(join(dir, 'plan.rooms'), FLAT)
  expect((await grid(dir, 'write', 'plan.rooms')).status).toBe(0)
  return dir
}

describe('the plan keeps its name', () => {
  it('stores the name of the plan line, and reads it back', async () => {
    const dir = await written()
    expect((JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { name?: string }).name).toBe('Two-bedroom flat')
    const back = await grid(dir, 'describe', '--as', 'rooms')
    expect(back.out).toContain('plan "Two-bedroom flat"')
  })

  it('keeps the name when a later rooms text has no plan line', async () => {
    const dir = await written()
    writeFileSync(join(dir, 'plan.rooms'), FLAT.replace(/^plan .*\n/m, ''))
    expect((await grid(dir, 'write', 'plan.rooms', '--replace')).status).toBe(0)
    expect((JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { name?: string }).name).toBe('Two-bedroom flat')
  })

  it('names the IFC project file with it, not with the file name', async () => {
    const dir = await written()
    expect((await grid(dir, 'export', '--format', 'ifc')).status).toBe(0)
    const ifc = readFileSync(join(dir, 'exports', 'plan.ifc'), 'utf8')
    expect(ifc).toContain("FILE_NAME('Two-bedroom flat'")
  })
})
