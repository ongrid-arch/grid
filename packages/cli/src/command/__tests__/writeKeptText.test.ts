import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * WRT-87: `grid write` keeps the rooms text it wrote the plan from and the language its display
 * line names, and `grid describe --as rooms` gives that text back; written to another plan file
 * and read again, the name, the language and the repeats are all still there.
 */

const HOTEL = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/hotel.rooms'), 'utf8')
const SPOKEN = HOTEL.replace(/^(plan .*)$/m, '$1\ndisplay language es')
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
  name?: string
  display?: { language?: string }
  written?: { text?: string }
  rooms: unknown[]
}

const planOf = (dir: string, file: string): PlanFile => JSON.parse(readFileSync(join(dir, file), 'utf8')) as PlanFile

describe('the rooms text a plan was written from (WRT-87)', () => {
  it('is kept in the plan, with the language its display line names', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-kept-text-'))
    made.push(dir)
    expect((await grid(dir, 'init')).status).toBe(0)
    writeFileSync(join(dir, 'plan.rooms'), SPOKEN)
    const wrote = await grid(dir, 'write', 'plan.rooms', '--plan', 'hotel.json')
    expect(wrote.err).toBe('')
    expect(wrote.status).toBe(0)
    const plan = planOf(dir, 'hotel.json')
    expect(plan.written?.text).toBe(SPOKEN)
    expect(plan.display?.language).toBe('es')
  })

  it('reads back as written, and written to another file and read again it keeps the name, the language and the repeats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-kept-text-'))
    made.push(dir)
    expect((await grid(dir, 'init')).status).toBe(0)
    writeFileSync(join(dir, 'plan.rooms'), SPOKEN)
    expect((await grid(dir, 'write', 'plan.rooms', '--plan', 'hotel.json')).status).toBe(0)
    const back = await grid(dir, 'describe', 'hotel.json', '--as', 'rooms')
    expect(back.status).toBe(0)
    expect(back.out.match(/^repeat guest 6 east/gm)).toHaveLength(2)
    expect(back.out).toMatch(/^display language es$/m)
    expect(back.out.split('\n').length).toBeLessThan(SPOKEN.split('\n').length + 4)
    writeFileSync(join(dir, 'copy.rooms'), back.out)
    const wrote = await grid(dir, 'write', 'copy.rooms', '--plan', 'copy.json')
    expect(wrote.err).toBe('')
    expect(wrote.status).toBe(0)
    const copy = planOf(dir, 'copy.json')
    const plan = planOf(dir, 'hotel.json')
    expect(copy.name).toBe(plan.name)
    expect(copy.display?.language).toBe('es')
    expect(copy.rooms).toEqual(plan.rooms)
    const again = await grid(dir, 'describe', 'copy.json', '--as', 'rooms')
    expect(again.out.match(/^repeat guest 6 east/gm)).toHaveLength(2)
    // Its own label line once, not once for each reading.
    expect(again.out.split('\n').filter((line) => line.startsWith('# ') && back.out.split('\n')[0] === line)).toHaveLength(1)
  })
})
