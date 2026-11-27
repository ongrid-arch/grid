import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/** VEW-83: `grid export --csv <table>` and `--format xlsx --what <table>`, run in this process. */
const flat = resolve(__dirname, '../../../../floorplan/fixtures/edits/flat-v00.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-table-'))
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

describe('grid export of a table (VEW-83)', () => {
  it('writes the area table as CSV into exports/ with --csv areas', async () => {
    const dir = project()
    const run = await grid(dir, 'export', '--csv', 'areas')
    expect(run.status, run.err).toBe(0)
    expect(run.out).toMatch(/Wrote .*exports\/plan-areas\.csv/)
    const text = readFileSync(join(dir, 'exports', 'plan-areas.csv'), 'utf8')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    const lines = text.slice(1).trimEnd().split('\n')
    expect(lines[0]).toMatch(/^floor,room id,name/)
    expect(lines.at(-1)).toBe('"General guidance, not your local rules"')
  })

  it('writes an XLSX with --format xlsx --what, and a decimal comma with --decimal comma', async () => {
    const dir = project()
    const xlsx = await grid(dir, 'export', '--format', 'xlsx', '--what', 'rooms', '--out', 'rooms-rev-b.xlsx')
    expect(xlsx.status, xlsx.err).toBe(0)
    expect(readFileSync(join(dir, 'rooms-rev-b.xlsx')).subarray(0, 2).toString('latin1')).toBe('PK')
    const comma = await grid(dir, 'export', '--csv', 'rooms', '--decimal', 'comma', '--units', 'mm')
    expect(comma.status, comma.err).toBe(0)
    expect(readFileSync(join(dir, 'exports', 'plan-rooms.csv'), 'utf8').split('\n')[0]).toContain(';height mm;')
  })

  it('refuses a table with no --what, --what with a drawing, and a drawing option with a table', async () => {
    const dir = project()
    const none = await grid(dir, 'export', '--format', 'csv')
    expect(none.status).toBe(2)
    expect(none.err).toContain('--format csv needs --what')
    const drawing = await grid(dir, 'export', '--format', 'dxf', '--what', 'areas')
    expect(drawing.status).toBe(2)
    expect(drawing.err).toContain('--what is for CSV and XLSX only')
    const scale = await grid(dir, 'export', '--csv', 'areas', '--scale', '100')
    expect(scale.status).toBe(2)
    expect(scale.err).toContain('--scale is for drawings and models')
    const floor = await grid(dir, 'export', '--csv', 'areas', '--floor', 'all')
    expect(floor.status).toBe(1)
    expect(floor.err).toContain('--floor all writes a drawing per floor')
  })
})
