import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'
import { bench } from '../../mcp/__tests__/replay/harness'

/**
 * WRT-57: the sample flat written again with a store carved in its hall's corner and the front
 * door put in the store's wall. The write names the door that no longer leads outside, and its
 * count holds what grid check then lists, the routes out included, not only the drawing problems.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')
const STORE = FLAT.replace(/^room bed2 .*$/m, (line) => `${line}\nroom store "Store" storage 1.0 x 1.0 inside hall corner ne`).replace('door door-entrance in hall north,', 'door door-entrance in hall north.2,')
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

describe('a write that leads the front door into a room carved beside it', () => {
  it('names the door that no longer leads outside and counts the routes out it costs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-write-entrance-'))
    made.push(dir)
    expect((await grid(dir, 'init')).status).toBe(0)
    writeFileSync(join(dir, 'plan.rooms'), FLAT)
    const first = await grid(dir, 'write', 'plan.rooms')
    expect(first.status).toBe(0)
    expect(first.out).toContain('To look at: 0 → 0, of them problems in the drawing 0 → 0.')
    writeFileSync(join(dir, 'store.rooms'), STORE)
    const ran = await grid(dir, 'write', 'store.rooms')
    expect(ran.err).toBe('')
    expect(ran.status).toBe(0)
    expect(ran.out).toContain('No longer leads outside: "door-entrance" joined "hall" and the outside; it now joins "hall" and "store".')
    expect(ran.out).toContain('To look at: 0 → 2, of them problems in the drawing 0 → 0.')
    expect(ran.out).not.toContain('Problems in the drawing: 0 → 0.')
  })

  it('says the same on grid_write_rooms, as data too', async () => {
    const b = bench({})
    try {
      expect((await b.call('grid_write_rooms', { plan: 'plan.json', rooms: FLAT })).isError).toBe(false)
      const reply = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: STORE })
      expect(reply.isError).toBe(false)
      expect(reply.data!['toLookAt']).toEqual({ before: 0, after: 2 })
      expect(reply.data!['drawingProblems']).toEqual({ before: 0, after: 0, new: [] })
      expect(reply.data!['doors']).toEqual(['No longer leads outside: "door-entrance" joined "hall" and the outside; it now joins "hall" and "store".'])
      expect(reply.text).toContain('To look at: 0 → 2')
    } finally {
      b.close()
    }
  })
})
