import { spawn } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { twoBedFlat } from './replay/plans'

// The server is started as its own Node process, the way an agent's host starts it.

let dir: string
let script: string
let project: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'grid-preview-tool-'))
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
  project = mkdtempSync(join(tmpdir(), 'grid-tool-project-'))
  writeFileSync(join(project, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(project, 'plan.json'), JSON.stringify(twoBedFlat()))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

function exchange(lines: unknown[], command: readonly string[] = [script]): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...command], {
      cwd: project,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', reject)
    child.on('close', () => {
      try {
        resolve(out.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)))
      } catch (error) {
        reject(error)
      }
    })
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`)
    child.stdin.end()
  })
}

describe('the tool server', () => {
  it('answers initialize and tool calls over stdio in order, and nothing for notifications', async () => {
    const replies = await exchange([
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_areas', arguments: {} } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'grid_preview', arguments: { floor: 'ground', view: '3d' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'grid_preview', arguments: { floor: 'basement-99' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/list' },
    ])

    expect(replies.map((reply) => reply['id'])).toEqual([0, 1, 2, 3, 4])
    expect(replies[0]).toMatchObject({ result: { serverInfo: { name: 'grid' } } })
    expect(replies[1]).toMatchObject({ result: { structuredContent: { net: expect.any(Number) } } })
    // VEW-4: the preview writes its record beside the plan and answers with the picture it shows;
    // this server is bundled alone, without the canvas a PNG needs, so it says so and still moves.
    expect(replies[2]).toMatchObject({ result: { content: [{ type: 'text', text: expect.stringMatching(/^General guidance, not your local rules\nShowing floor "ground" in 3d\. [^]*@napi-rs\/canvas/) }] } })
    expect(replies[3]).toMatchObject({ result: { isError: true, content: [{ type: 'text', text: 'That floor is not in this plan. Its floors: "ground".' }] } })
    expect((replies[4] as { result: { tools: unknown[] } }).result.tools).toHaveLength(39)
  }, 30_000)

  // npm test builds the command first; the picture needs the native canvas from node_modules.
  it('draws a picture through grid serve, the way a host starts it', async () => {
    const replies = await exchange([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_view', arguments: { kind: 'plan' } } },
    ], [join(__dirname, '..', '..', '..', 'bin', 'grid.mjs'), 'serve'])
    expect(replies[0]).toMatchObject({ result: { content: [{ type: 'text' }, { type: 'image', mimeType: 'image/png' }] } })
  }, 30_000)
})
