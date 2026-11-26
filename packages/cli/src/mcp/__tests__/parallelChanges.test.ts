import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { twoBedFlat } from './replay/plans'

// CMD-41: several tool servers, each its own Node process as an agent's host starts it, changing
// one plan at the same time. Each change holds the plan's lock, so none is lost.

let dir: string
let script: string
let project: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'grid-parallel-server-'))
  script = join(dir, 'server.js')
  await build({
    entryPoints: [join(__dirname, '..', 'server.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: script,
    external: ['@napi-rs/canvas'],
    logLevel: 'silent',
  })
  project = mkdtempSync(join(tmpdir(), 'grid-parallel-project-'))
  writeFileSync(join(project, 'grid.json'), '{"version":1}\n')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

/** One server process, given its lines at once; its replies. */
function serve(lines: unknown[]): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', reject)
    child.on('close', () => {
      try {
        resolve(out.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as Record<string, unknown>))
      } catch (error) {
        reject(error)
      }
    })
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`)
    child.stdin.end()
  })
}

const rename = (room: string, name: string): unknown => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_rename_room', arguments: { room, name } } })

describe('changes from several processes at once', () => {
  it('all answer Wrote, and every one of them is in the plan', async () => {
    writeFileSync(join(project, 'plan.json'), `${JSON.stringify(twoBedFlat(), null, 2)}\n`)
    const rooms = ['living', 'kitchen', 'hall', 'bed1', 'bath', 'bed2']
    // Two rounds each, so every process changes the plan more than once while the others do.
    const replies = await Promise.all(rooms.map((room) => serve([rename(room, `First ${room}`), { ...(rename(room, `Room ${room}`) as object), id: 2 }])))
    for (const reply of replies.flat()) {
      const result = reply['result'] as { isError?: boolean; content: { text: string }[] }
      expect(result.isError ?? false).toBe(false)
      expect(result.content[0]!.text).toContain('Wrote')
    }
    const plan = JSON.parse(readFileSync(join(project, 'plan.json'), 'utf8')) as { rooms: { id: string; name: string }[] }
    for (const room of rooms) expect(plan.rooms.find((r) => r.id === room)!.name).toBe(`Room ${room}`)
    expect(existsSync(join(project, 'plan.lock'))).toBe(false)
  }, 60_000)
})
