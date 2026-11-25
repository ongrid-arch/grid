import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runGrid } from '../../command/main'

/** SHT-16: the date on a sheet is the one asked for, so the same plan gives the same bytes. */

const sample = resolve(__dirname, '../../../fixtures/two-floor-house.json')
let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-sheet-date-'))
  writeFileSync(join(dir, 'house.json'), readFileSync(sample))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function grid(...args: string[]): Promise<{ status: number; err: string }> {
  let err = ''
  const status = await runGrid(args, { stdout: () => {}, stderr: (text) => (err += text), stdoutIsTerminal: false, cwd: dir })
  return { status, err }
}

async function bytes(date: string, ...more: string[]): Promise<Buffer> {
  const run = await grid('sheet', 'house.json', ...more, '--date', date, '--out', 'x.pdf')
  expect(run).toMatchObject({ status: 0 })
  return readFileSync(join(dir, 'x.pdf'))
}

describe('the date on a sheet (SHT-16)', () => {
  it('gives the same drawing bytes for the same date, and other bytes for another', async () => {
    const a = await bytes('2026-01-31', '--layout', 'drawing')
    const b = await bytes('2026-01-31', '--layout', 'drawing')
    const c = await bytes('2026-02-01', '--layout', 'drawing')
    expect(b.equals(a)).toBe(true)
    expect(c.equals(a)).toBe(false)
  }, 120_000)

  it('gives the same bytes for a client sheet and a check sheet', async () => {
    for (const layout of ['client', 'check']) {
      const a = await bytes('2026-01-31', '--layout', layout)
      const b = await bytes('2026-01-31', '--layout', layout)
      const c = await bytes('2026-02-01', '--layout', layout)
      expect(b.equals(a)).toBe(true)
      expect(c.equals(a)).toBe(false)
    }
  }, 180_000)

  it('refuses a date it cannot read, naming it', async () => {
    const run = await grid('sheet', 'house.json', '--layout', 'check', '--date', 'tomorrow')
    expect(run.status).not.toBe(0)
    expect(run.err).toContain('--date "tomorrow"')
  })
})
