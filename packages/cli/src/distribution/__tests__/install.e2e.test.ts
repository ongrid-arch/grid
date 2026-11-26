import { spawn, spawnSync, type SpawnSyncReturns } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PER_REQUEST_VERSIONS } from '../../mcp/protocol'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { unzip } from './unzip'

/**
 * CMD-9: Grid installs from a packed tarball into an empty folder and answers there, through
 * each install artefact. `pack.mjs` makes them all; nothing is published (CMD-8). Every npm run
 * here is offline, against a registry address that answers nothing, with its own cache, so a
 * test can neither reach the network nor touch the machine's npm set-up or any agent's config.
 */

const cli = resolve(__dirname, '../../..')
const { version } = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8')) as { version: string }
const windows = process.platform === 'win32'
const MODERN = '2026-07-28'

let root: string
let out: string
let tarball: string
let env: NodeJS.ProcessEnv

/** The environment of every npm and npx run: offline, its own cache, no optional packages. */
function offlineEnv(): NodeJS.ProcessEnv {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key)))
  return {
    ...clean,
    npm_config_cache: join(root, 'npm-cache'),
    npm_config_registry: 'http://127.0.0.1:9/',
    npm_config_offline: 'true',
    npm_config_omit: 'optional',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_userconfig: join(root, 'npmrc'),
  }
}

function run(command: string, args: readonly string[], cwd: string): SpawnSyncReturns<string> {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: windows, timeout: 120_000 })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr}`)
  return result
}

function folder(name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

function withPlans(dir: string): string {
  for (const plan of ['two-bed-flat.json', 'bathrooms-through-study.json']) copyFileSync(join(cli, 'fixtures', plan), join(dir, plan))
  return dir
}

type Reply = Record<string, unknown> & { id: unknown; result?: Record<string, unknown>; error?: { code: number; message: string; data?: Record<string, unknown> } }

/** Starts a server the way a host does, sends the lines, closes its input, and gives the answers. */
function exchange(command: string, args: readonly string[], cwd: string, lines: readonly unknown[]): Promise<Reply[]> {
  return new Promise((done, fail) => {
    const child = spawn(command, [...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: windows })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', fail)
    child.on('close', (code) => {
      try {
        const replies = stdout.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as Reply)
        if (replies.length === 0) throw new Error(`no answer (exit ${code}): ${stderr}`)
        done(replies)
      } catch (error) {
        fail(error)
      }
    })
    child.stdin.end(lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
  })
}

function meta(protocolVersion = MODERN): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': protocolVersion,
    'io.modelcontextprotocol/clientCapabilities': {},
    'io.modelcontextprotocol/clientInfo': { name: 'grid-install-test', version: '1' },
  }
}

const INITIALIZE = [
  { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'grid-install-test', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
]

function describeCall(id: number, plan: string, modern = false): Record<string, unknown> {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'grid_describe', arguments: { plan }, ...(modern ? { _meta: meta() } : {}) } }
}

function text(reply: Reply | undefined): string {
  const result = reply?.result as { content: Array<{ text: string }>; isError?: boolean } | undefined
  expect(result?.isError).toBeUndefined()
  return result?.content[0]?.text ?? ''
}

/** One call through a server an artefact names, in a folder holding the plans. */
async function oneCall(command: string, args: readonly string[], cwd: string): Promise<void> {
  const replies = await exchange(command, args, cwd, [...INITIALIZE, describeCall(1, 'two-bed-flat.json')])
  expect(replies.map((reply) => reply.id)).toEqual([0, 1])
  expect(replies[0]?.result).toMatchObject({ serverInfo: { name: 'grid' } })
  expect(text(replies[1])).toMatch(/bed/i)
}

/** The command after `--` in an `… mcp add grid -- <command>` line. */
function afterDashes(line: string): [string, string[]] {
  const [, rest] = line.split(' -- ')
  const [command, ...args] = (rest as string).split(' ')
  return [command as string, args]
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'grid-install-'))
  writeFileSync(join(root, 'npmrc'), '')
  env = offlineEnv()
  out = join(root, 'release')
  const packed = spawnSync(process.execPath, [join(cli, 'pack.mjs'), '--out', out], { encoding: 'utf8', env: { ...process.env, npm_config_cache: join(root, 'npm-cache') } })
  if (packed.status !== 0) throw new Error(`pack.mjs failed: ${packed.stderr}`)
  tarball = join(out, `ongrid-${version}.tgz`)
}, 180_000)

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('npx -y ongrid mcp, from the packed tarball in an empty folder', () => {
  // The line before publishing: the same npx run, told where the package is (CMD-8).
  const npx = (): [string, string[]] => ['npx', ['-y', `--package=${tarball}`, 'ongrid', 'mcp']]

  it('answers a client that opens with initialize', async () => {
    const dir = withPlans(folder('empty-initialize'))
    const replies = await exchange(...npx(), dir, [...INITIALIZE, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, describeCall(2, 'two-bed-flat.json')])
    expect(replies.map((reply) => reply.id)).toEqual([0, 1, 2])
    expect(replies[0]?.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'grid' } })
    expect((replies[1]?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toEqual(GRID_TOOLS.map((tool) => tool.name))
    expect(text(replies[2])).toMatch(/bed/i)
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
  }, 120_000)

  it('answers a 2026-07-28 client that starts with server/discover', async () => {
    const dir = withPlans(folder('empty-discover'))
    const replies = await exchange(...npx(), dir, [
      { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: meta() } },
      describeCall(3, 'two-bed-flat.json', true),
    ])
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3])
    expect(replies[0]?.result).toMatchObject({ resultType: 'complete', supportedVersions: [MODERN], capabilities: { tools: {} } })
    expect(replies[1]?.result).toMatchObject({ resultType: 'complete', cacheScope: 'public' })
    expect((replies[1]?.result as { tools: unknown[] }).tools).toHaveLength(GRID_TOOLS.length)
    expect(replies[2]?.result).toMatchObject({ resultType: 'complete' })
    expect(text(replies[2])).toMatch(/bed/i)
  }, 120_000)

  it('refuses anything else, naming the versions it speaks', async () => {
    const dir = folder('empty-refused')
    const replies = await exchange(...npx(), dir, [
      { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta('2099-01-01') } },
      { jsonrpc: '2.0', id: 2, method: 'session/open', params: {} },
    ])
    expect(replies[0]?.error).toMatchObject({ code: -32022, data: { supported: [...PER_REQUEST_VERSIONS] } })
    for (const reply of replies) {
      for (const spoken of [MODERN, '2025-06-18', '2024-11-05']) expect(reply.error?.message).toContain(spoken)
    }
  }, 120_000)

  it('draws no picture without the optional canvas, and says so in one line', async () => {
    const dir = withPlans(folder('empty-no-canvas'))
    const replies = await exchange(...npx(), dir, [...INITIALIZE, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_view', arguments: { plan: 'two-bed-flat.json', kind: 'plan' } } }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'grid_sheet', arguments: { plan: 'two-bed-flat.json', layout: 'check' } } }])
    expect(replies[1]?.result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringMatching(/^Drawing a PNG needs the optional package @napi-rs\/canvas/) }] })
    // VEW-7: a sheet fails with the same one line, and writes nothing.
    const sheetReply = replies[2]?.result as { isError?: boolean; content: Array<{ text: string }> }
    expect(sheetReply.isError).toBe(true)
    expect(sheetReply.content[0]?.text).toMatch(/^Drawing a PNG needs the optional package @napi-rs\/canvas/)
    expect(sheetReply.content[0]?.text).not.toContain('\n')
    expect(existsSync(join(dir, 'exports'))).toBe(false)
  }, 120_000)

  it('keeps no hidden state: two plans, in either order, give the same answers', async () => {
    const dir = withPlans(folder('empty-state'))
    const calls = (first: string, second: string, modern: boolean): unknown[] => [
      ...(modern ? [] : INITIALIZE),
      describeCall(1, first, modern),
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'grid_areas', arguments: { plan: first }, ...(modern ? { _meta: meta() } : {}) } },
      describeCall(3, second, modern),
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'grid_areas', arguments: { plan: second }, ...(modern ? { _meta: meta() } : {}) } },
    ]
    const answers = (replies: Reply[]): unknown[] => replies.filter((reply) => reply.id !== 0)
      .map((reply) => Object.fromEntries(Object.entries(reply.result as Record<string, unknown>).filter(([key]) => key !== '_meta')))
    const a = 'two-bed-flat.json'
    const b = 'bathrooms-through-study.json'
    for (const modern of [false, true]) {
      // One after the other: two npx runs at once race in npm's own cache (ENOTEMPTY).
      const ab = await exchange(...npx(), dir, calls(a, b, modern))
      const ba = await exchange(...npx(), dir, calls(b, a, modern))
      const [abA1, abA2, abB1, abB2] = answers(ab)
      const [baB1, baB2, baA1, baA2] = answers(ba)
      expect(abA1).toEqual(baA1)
      expect(abA2).toEqual(baA2)
      expect(abB1).toEqual(baB1)
      expect(abB2).toEqual(baB2)
      expect(abA1).not.toEqual(abB1)
    }
  }, 120_000)
})

describe('each install artefact installs and makes one call', () => {
  let installed: string

  beforeAll(() => {
    // An agent's host starts `npx -y ongrid mcp`; with the package installed in the folder,
    // npx runs that copy and asks no registry. Here it is the packed tarball's.
    installed = withPlans(folder('installed'))
    run('npm', ['install', '--no-package-lock', tarball], installed)
  }, 120_000)

  it('installs the one bundled file and nothing else', () => {
    const files = readdirSync(join(installed, 'node_modules', 'ongrid')).sort()
    // CMD-7: with the guide for agents and the plan's JSON Schema.
    expect(files).toEqual(['LICENSE', 'NOTICE', 'README.md', 'chunks', 'docs', 'fonts', 'grid.mjs', 'guide.md', 'package.json', 'plan.schema.json'])
    expect(readdirSync(join(installed, 'node_modules', 'ongrid', 'fonts'))).toEqual(expect.arrayContaining(['SourceSans3-Regular.otf', 'OFL-SourceSerif4.txt', 'OFL-SourceSans3.txt']))
    expect(readdirSync(join(installed, 'node_modules')).filter((name) => !name.startsWith('.'))).toEqual(['ongrid'])
    const manifest = JSON.parse(readFileSync(join(installed, 'node_modules', 'ongrid', 'package.json'), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({ name: 'ongrid', version, private: true, mcpName: 'io.github.ongrid-arch/grid' })
    const { stdout } = run('npx', ['ongrid', 'mcp', '--help'], installed)
    expect(stdout).toContain('grid mcp')
  }, 60_000)

  it('the registry entry names the package that was packed', () => {
    const entry = JSON.parse(readFileSync(join(out, 'server.json'), 'utf8')) as { name: string; packages: Array<{ identifier: string; version: string }> }
    const manifest = JSON.parse(readFileSync(join(installed, 'node_modules', 'ongrid', 'package.json'), 'utf8')) as { mcpName: string }
    expect(entry.name).toBe(manifest.mcpName)
    expect(entry.packages[0]).toMatchObject({ identifier: 'ongrid', version })
  })

  it('the plugin folder: the server in its .mcp.json and in its portable mcp.json', async () => {
    const plugin = join(out, 'marketplace', 'plugins', 'grid')
    for (const file of ['.mcp.json', 'mcp.json']) {
      const { mcpServers } = JSON.parse(readFileSync(join(plugin, file), 'utf8')) as { mcpServers: { grid: { command: string; args: string[] } } }
      await oneCall(mcpServers.grid.command, mcpServers.grid.args, installed)
    }
    expect(readFileSync(join(plugin, 'skills', 'grid', 'SKILL.md'), 'utf8')).toMatch(/^---\nname: grid\n/)
    const market = JSON.parse(readFileSync(join(out, 'marketplace', '.claude-plugin', 'marketplace.json'), 'utf8')) as { plugins: Array<{ source: string }> }
    expect(existsSync(join(out, 'marketplace', market.plugins[0]!.source, '.claude-plugin', 'plugin.json'))).toBe(true)
  }, 120_000)

  it('the Add to Cursor link', async () => {
    const install = readFileSync(join(out, 'install.md'), 'utf8')
    const link = new URL(/cursor:\/\/\S+?(?=\)|\s|$)/.exec(install)?.[0] as string)
    const config = JSON.parse(atob(link.searchParams.get('config') as string)) as { command: string; args: string[] }
    await oneCall(config.command, config.args, installed)
  }, 60_000)

  it('the VS Code line', async () => {
    const install = readFileSync(join(out, 'install.md'), 'utf8')
    const config = JSON.parse(/code --add-mcp '(.+)'/.exec(install)?.[1] as string) as { command: string; args: string[] }
    await oneCall(config.command, config.args, installed)
  }, 60_000)

  it.each(['claude', 'codex', 'copilot'])('the %s mcp add line', async (agent) => {
    const install = readFileSync(join(out, 'install.md'), 'utf8')
    const line = new RegExp(`${agent} mcp add grid -- [^\\n\`]+`).exec(install)?.[0] as string
    await oneCall(...afterDashes(line), installed)
  }, 60_000)

  it('the .mcpb bundle for Claude\'s desktop app: unpacked, run as its manifest says, with a picture', async () => {
    const bundle = readdirSync(out).find((name) => name.endsWith('.mcpb'))
    expect(bundle).toBe(`grid-${process.platform}-${process.arch}.mcpb`)
    const unpacked = folder('mcpb')
    for (const [path, entry] of unzip(readFileSync(join(out, bundle as string)))) {
      mkdirSync(dirname(join(unpacked, path)), { recursive: true })
      writeFileSync(join(unpacked, path), entry.data)
    }
    const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')) as { server: { mcp_config: { command: string; args: string[] } } }
    const project = withPlans(folder('desktop-project'))
    const args = manifest.server.mcp_config.args.map((arg) => arg.replace('${__dirname}', unpacked).replace('${user_config.project}', project))
    expect(manifest.server.mcp_config.command).toBe('node')
    const replies = await exchange(process.execPath, args, root, [
      ...INITIALIZE,
      describeCall(1, 'two-bed-flat.json'),
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'grid_view', arguments: { plan: 'two-bed-flat.json', kind: 'plan' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'grid_sheet', arguments: { plan: 'two-bed-flat.json', layout: 'check' } } },
    ])
    expect(text(replies[1])).toMatch(/bed/i)
    // The bundle carries the canvas for the platform it was packed on, so pictures work.
    expect(replies[2]?.result).toMatchObject({ content: [{ type: 'text' }, { type: 'image', mimeType: 'image/png' }] })
    // VEW-7: the sheet is written as a PDF, through the bundle (the one form that carries the canvas).
    expect(text(replies[3])).toMatch(/Wrote "exports\/[^"]*-check\.pdf"/)
    expect(readdirSync(join(project, 'exports')).some((name) => name.endsWith('-check.pdf'))).toBe(true)
  }, 120_000)
})
