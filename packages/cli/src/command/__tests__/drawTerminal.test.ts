import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runGrid } from '../main'
import { drawsPng, PNG_TO_TERMINAL } from '../draw'

/** CMD-25: picture bytes are never written to a terminal. Run in this process through `runGrid`. */

const sample = resolve(__dirname, '../../../fixtures/two-floor-house.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-draw-terminal-'))
  made.push(dir)
  writeFileSync(join(dir, 'house.json'), readFileSync(sample))
})

async function grid(terminal: boolean, ...args: string[]): Promise<{ status: number; bytes: number; err: string; head: string }> {
  let bytes = 0
  let head = ''
  let err = ''
  const status = await runGrid(args, {
    stdout: (data) => {
      const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)
      if (bytes === 0) head = buffer.subarray(0, 4).toString('latin1')
      bytes += buffer.length
    },
    stderr: (text) => (err += text),
    stdoutIsTerminal: terminal,
    cwd: dir,
  })
  return { status, bytes, err, head }
}

const PNG_KINDS: readonly (readonly string[])[] = [
  ['--png'],
  ['--3d'],
  ['--png', '--scale', '2'],
  ['--facade', 'north', '--png'],
  ['--section', '2,-1:2,9', '--png'],
]

describe('grid draw: no picture bytes on a terminal', () => {
  it.each(PNG_KINDS)('refuses %s with no --out, names --out and writes nothing', async (...flags) => {
    const run = await grid(true, 'draw', 'house.json', ...flags)
    expect(run.status).toBe(2)
    expect(run.bytes).toBe(0)
    expect(run.err).toContain('--out')
    expect(run.err).toContain('not shown in a terminal')
  })

  it('refuses a saved view the same way', async () => {
    const run = await grid(true, 'draw', 'house.json', '--view', 'Anything')
    expect(run.status).toBe(2)
    expect(run.bytes).toBe(0)
    expect(run.err).toContain('--out')
  })

  it('writes the file when --out is named, even on a terminal', async () => {
    const run = await grid(true, 'draw', 'house.json', '--png', '--out', 'plan.png')
    expect(run.status).toBe(0)
    expect(readFileSync(join(dir, 'plan.png')).subarray(1, 4).toString('latin1')).toBe('PNG')
  })

  it('still sends PNG bytes to a pipe or a file', async () => {
    const run = await grid(false, 'draw', 'house.json', '--png')
    expect(run.status).toBe(0)
    expect(run.head.slice(1)).toBe('PNG')
  })

  it('prints an SVG on a terminal, which is text', async () => {
    const run = await grid(true, 'draw', 'house.json')
    expect(run.status).toBe(0)
    expect(run.head).toBe('<svg')
  })

  it('asks every picture kind the same way', () => {
    expect(drawsPng({ png: true })).toBe(true)
    expect(drawsPng({ png: false, threeD: true })).toBe(true)
    expect(drawsPng({ png: false })).toBe(false)
    expect(PNG_TO_TERMINAL).toContain('--out')
  })
})
