import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runGrid } from '../main'
import { drawFormat } from '../draw'

/** CMD-27: the picture's format follows the `--out` extension when no format is named. */

const sample = resolve(__dirname, '../../../fixtures/two-floor-house.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-draw-format-'))
  made.push(dir)
  writeFileSync(join(dir, 'house.json'), readFileSync(sample))
})

async function grid(...args: string[]): Promise<{ status: number; err: string }> {
  let err = ''
  const status = await runGrid(args, { stdout: () => undefined, stderr: (text) => (err += text), stdoutIsTerminal: true, cwd: dir })
  return { status, err }
}

const magic = (name: string): string => readFileSync(join(dir, name)).subarray(1, 4).toString('latin1')

describe('grid draw: the format from --out', () => {
  it('writes a PNG for --out site.png without --png', async () => {
    const run = await grid('draw', 'house.json', '--out', 'site.png')
    expect(run.status).toBe(0)
    expect(magic('site.png')).toBe('PNG')
  })

  it('reads the extension without regard to case, and takes --scale with it', async () => {
    const run = await grid('draw', 'house.json', '--out', 'SITE.PNG', '--scale', '2')
    expect(run.status).toBe(0)
    expect(magic('SITE.PNG')).toBe('PNG')
  })

  it('does the same for a facade and a section', async () => {
    expect((await grid('draw', 'house.json', '--facade', 'north', '--out', 'f.png')).status).toBe(0)
    expect(magic('f.png')).toBe('PNG')
    expect((await grid('draw', 'house.json', '--section', '2,-1:2,9', '--out', 's.png')).status).toBe(0)
    expect(magic('s.png')).toBe('PNG')
  })

  it('still writes an SVG for --out site.svg', async () => {
    const run = await grid('draw', 'house.json', '--out', 'site.svg')
    expect(run.status).toBe(0)
    expect(readFileSync(join(dir, 'site.svg'), 'utf8').startsWith('<svg')).toBe(true)
  })

  it('refuses --png with a .svg file, naming both, and writes nothing', async () => {
    const run = await grid('draw', 'house.json', '--png', '--out', 'site.svg')
    expect(run.status).toBe(2)
    expect(run.err).toContain('--png')
    expect(run.err).toContain('.svg')
    expect(existsSync(join(dir, 'site.svg'))).toBe(false)
  })

  it('refuses --3d with a .svg file, naming both', async () => {
    const run = await grid('draw', 'house.json', '--3d', '--out', 'site.svg')
    expect(run.status).toBe(2)
    expect(run.err).toContain('--3d')
    expect(run.err).toContain('.svg')
  })

  it('refuses an extension Grid does not draw, naming the two it does', async () => {
    const run = await grid('draw', 'house.json', '--out', 'site.jpg')
    expect(run.status).toBe(2)
    expect(run.err).toContain('.png')
    expect(run.err).toContain('.svg')
  })

  it('names the format a request takes', () => {
    expect(drawFormat({ png: false, out: 'a.png' }).png).toBe(true)
    expect(drawFormat({ png: false, out: 'a.svg' }).png).toBe(false)
    expect(drawFormat({ png: false }).png).toBe(false)
  })
})
