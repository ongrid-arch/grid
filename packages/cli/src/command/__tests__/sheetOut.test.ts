import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runGrid } from '../main'

/** VEW-7: `grid sheet --out` checks where it will write before it draws anything. Run in this process through `runGrid`. */

const drawn = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../sheet/pdf', async (actual) => {
  const real = await actual<typeof import('../../sheet/pdf')>()
  return { ...real, sheetPdf: (...args: Parameters<typeof real.sheetPdf>) => { drawn.count++; return real.sheetPdf(...args) } }
})

const sample = resolve(__dirname, '../../../fixtures/two-floor-house.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-sheet-out-'))
  made.push(dir)
  writeFileSync(join(dir, 'house.json'), readFileSync(sample))
  drawn.count = 0
})

async function grid(...args: string[]): Promise<{ status: number; out: string; err: string }> {
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

describe('grid sheet --out (VEW-7)', () => {
  it('makes the folder of an --out that is not there yet', async () => {
    const run = await grid('sheet', 'house.json', '--layout', 'check', '--out', 'nope/x.pdf')
    expect(run.status).toBe(0)
    expect(existsSync(join(dir, 'nope', 'x.pdf'))).toBe(true)
  })

  it('refuses an --out that is a folder before drawing', async () => {
    mkdirSync(join(dir, 'set.pdf'))
    const run = await grid('sheet', 'house.json', '--layout', 'client', '--out', 'set.pdf')
    expect(run).toMatchObject({ status: 1, err: 'grid: Can\'t write set.pdf: it is a folder.\n' })
    expect(drawn.count).toBe(0)
  })

  it('draws once and writes when the folder is there', async () => {
    const run = await grid('sheet', 'house.json', '--layout', 'check', '--out', 'set.pdf')
    expect(run.status).toBe(0)
    expect(drawn.count).toBe(1)
  }, 60_000)

  it('says how it named the sheet on both paths, the same way', async () => {
    writeFileSync(join(dir, 'approved.json'), readFileSync(sample))
    const into = await grid('sheet', 'approved.json', '--layout', 'check')
    const out = await grid('sheet', 'approved.json', '--layout', 'check', '--out', 'set.pdf')
    const note = 'Named the sheet floor-plan: the plan file\'s name reads as a claim about the plan or as an instruction.\n'
    expect(into.err).toBe(note)
    expect(out.err).toBe(note)
  }, 60_000)
})
