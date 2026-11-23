/* eslint-disable @typescript-eslint/no-explicit-any -- the answers are read as loose JSON, as a client reads them */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryProject } from '../../fs/memoryProject'
import { LINE_MAX_BYTES } from '../protocol'
import { startHostedServer, type HostedServer } from '../http'
import { twoBedFlat } from './replay/plans'

// AIV-19: the same tool server over MCP Streamable HTTP, stateless, each call carrying its plan.

let server: HostedServer
let quiet: string
let before: string
const ROOMS = readFileSync(resolve(__dirname, '../../../../../docs/samples/flat.rooms'), 'utf8')

beforeAll(async () => {
  // The server runs with its working folder empty: anything it wrote to disk would show there.
  quiet = mkdtempSync(join(tmpdir(), 'grid-hosted-'))
  before = process.cwd()
  process.chdir(quiet)
  server = await startHostedServer({ port: 0 })
})

afterAll(async () => {
  await server.close()
  process.chdir(before)
  rmSync(quiet, { recursive: true, force: true })
})

let nextId = 1
async function rpc(method: string, params: Record<string, unknown> = {}): Promise<Record<string, any>> {
  const reply = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })
  expect(reply.status).toBe(200)
  expect(reply.headers.get('content-type')).toContain('application/json')
  return (await reply.json()) as Record<string, any>
}

const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, any>> => (await rpc('tools/call', { name, arguments: args }))['result']

describe('the hosted tool server over HTTP', () => {
  it('answers initialize and lists the tools that need no file, each taking plan_json', async () => {
    const init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }))['result']
    expect(init.serverInfo.name).toBe('grid')
    expect(init.instructions).toContain('plan_json')
    expect(init.capabilities.extensions['io.modelcontextprotocol/ui'].mimeTypes).toContain('text/html;profile=mcp-app')

    const tools = (await rpc('tools/list'))['result'].tools as Array<Record<string, any>>
    const names = tools.map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['grid_check', 'grid_describe', 'grid_areas', 'grid_view', 'grid_show_plan', 'grid_write_rooms', 'grid_rename_room']))
    for (const gone of ['grid_export', 'grid_sheet', 'grid_preview', 'grid_preview_sync', 'grid_mark_start', 'grid_mark_seen', 'grid_write_brief', 'grid_compare', 'grid_diff', 'grid_report_problem']) {
      expect(names, gone).not.toContain(gone)
    }
    for (const tool of tools) {
      const properties = Object.keys(tool.inputSchema.properties)
      expect(properties, tool.name).toContain('plan_json')
      for (const file of ['plan', 'out', 'plans', 'scan']) expect(properties, `${tool.name} ${file}`).not.toContain(file)
    }
    // Only the tools that show a plan link the page.
    expect(tools.find((tool) => tool.name === 'grid_show_plan')!._meta.ui.resourceUri).toBe('ui://grid/plan')
    expect(tools.find((tool) => tool.name === 'grid_check')!._meta).toBeUndefined()
  })

  it('reads a plan the call carries, with the label and no verdict of compliance', async () => {
    const result = await call('grid_describe', { plan_json: twoBedFlat() })
    expect(result.isError).toBeUndefined()
    const text = result.content[0].text as string
    expect(text.startsWith('General guidance, not your local rules')).toBe(true)
    expect(result.structuredContent.label).toBe('General guidance, not your local rules')
    const checked = (await call('grid_check', { plan_json: JSON.stringify(twoBedFlat()) })).content[0].text as string
    expect(checked).toContain('General guidance, not your local rules')
    expect(`${text}${checked}`).not.toMatch(/\b(complies|compliant|approved)\b/i)
  })

  it('changes a plan and gives the changed plan back, with the drawing for the page', async () => {
    const result = await call('grid_rename_room', { plan_json: twoBedFlat(), room: 'bed1', name: 'Study' })
    expect(result.isError).toBeUndefined()
    const plan = result.structuredContent.plan_json as { rooms: Array<{ id: string; name: string }> }
    expect(plan.rooms.find((room) => room.id === 'bed1')!.name).toBe('Study')
    expect(result.content[0].text).toContain('"name":"Study"')
    expect(result.content[0].text.startsWith('General guidance, not your local rules')).toBe(true)
    const drawings = result._meta['grid/drawings'] as Array<{ id: string; svg: string }>
    expect(drawings.length).toBeGreaterThan(0)
    expect(drawings[0]!.svg).toContain('<svg')
    // The changed plan goes straight into the next call.
    const again = await call('grid_describe', { plan_json: plan })
    expect(again.content[0].text).toContain('Study')
  })

  it('writes a first plan from rooms text with no plan_json', async () => {
    const result = await call('grid_write_rooms', { rooms: ROOMS })
    expect(result.isError, result.content?.[0]?.text).toBeUndefined()
    expect((result.structuredContent.plan_json as { rooms: unknown[] }).rooms.length).toBeGreaterThan(5)
  })

  it('shows the plan through the page, a self-contained MCP App', async () => {
    const shown = await call('grid_show_plan', { plan_json: twoBedFlat() })
    expect(shown.structuredContent.floors).toBeGreaterThan(0)
    expect(shown._meta['grid/drawings'].length).toBeGreaterThan(0)
    const read = (await rpc('resources/read', { uri: 'ui://grid/plan' }))['result'].contents[0]
    expect(read.mimeType).toBe('text/html;profile=mcp-app')
    expect(read.text).toContain('ui/notifications/tool-result')
    // No address to load anything from, and no frame.
    expect(read.text).not.toMatch(/https?:\/\//)
    expect(read.text).not.toMatch(/<iframe|<link|\ssrc=/i)
  })

  it('refuses a call without a plan and a plan that is not an object, by name', async () => {
    const missing = await call('grid_describe', {})
    expect(missing.isError).toBe(true)
    expect(missing.content[0].text).toContain('plan_json')
    const bad = await call('grid_describe', { plan_json: '[1]' })
    expect(bad.isError).toBe(true)
    const notJson = await call('grid_describe', { plan_json: '{nope' })
    expect(notJson.isError).toBe(true)
  })

  it('refuses what is not a JSON request, a request too large, and a site it does not know', async () => {
    const post = (body: string, headers: Record<string, string>): Promise<Response> => fetch(server.url, { method: 'POST', headers, body })
    expect((await post('x', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post('{nope', { 'content-type': 'application/json' })).status).toBe(400)
    expect((await post(' '.repeat(LINE_MAX_BYTES + 10), { 'content-type': 'application/json' }).catch(() => ({ status: 413 }))).status).toBe(413)
    expect((await fetch(server.url)).status).toBe(405)
    expect((await fetch(server.url, { method: 'DELETE' })).status).toBe(405)
    expect((await fetch(server.url.replace('/mcp', '/other'))).status).toBe(404)
    const foreign = await post('{}', { 'content-type': 'application/json', origin: 'https://example.org' })
    expect(foreign.status).toBe(403)
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
    // A notification is taken and gets no body.
    const note = await post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), { 'content-type': 'application/json' })
    expect(note.status).toBe(202)
  })

  it('lets a chat app\'s own site call it, and never with a wildcard', async () => {
    const reply = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://claude.ai' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(reply.status).toBe(200)
    expect(reply.headers.get('access-control-allow-origin')).toBe('https://claude.ai')
    const preflight = await fetch(server.url, { method: 'OPTIONS', headers: { origin: 'https://chatgpt.com', 'access-control-request-method': 'POST' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://chatgpt.com')
  })

  it('answers a request addressed to a name that is not its own with 421', async () => {
    const url = new URL(server.url)
    const { request } = await import('http')
    const status = await new Promise<number>((done) => {
      const req = request({ host: '127.0.0.1', port: url.port, path: '/mcp', method: 'POST', headers: { host: 'evil.example', 'content-type': 'application/json' } }, (res) => { res.resume(); done(res.statusCode ?? 0) })
      req.end('{}')
    })
    expect(status).toBe(421)
  })
})

describe('hosted mode touches no file', () => {
  it('leaves the folder it runs in empty after every kind of call', async () => {
    await call('grid_describe', { plan_json: twoBedFlat() })
    await call('grid_rename_room', { plan_json: twoBedFlat(), room: 'bed1', name: 'Study' })
    await call('grid_write_rooms', { rooms: ROOMS })
    await call('grid_view', { plan_json: twoBedFlat() })
    await call('grid_show_plan', { plan_json: twoBedFlat() })
    expect(readdirSync(quiet)).toEqual([])
  })

  it('cannot be pointed at a path on the host: a plan that names a file finds none, and a path argument is refused', async () => {
    const withImage = { ...(twoBedFlat() as Record<string, unknown>), referenceImage: { path: '/etc/hosts', floor: 'ground' } }
    const result = await call('grid_describe', { plan_json: withImage })
    expect(JSON.stringify(result)).not.toContain('localhost')
    const named = await call('grid_describe', { plan_json: twoBedFlat(), plan: '/etc/hosts' })
    expect(named.isError).toBe(true)
  })

  it('keeps its files in memory, inside the one request, and refuses a path that leads out', () => {
    const project = new MemoryProject()
    project.writeFile('plan.json', '{"a":1}')
    expect(project.readText('plan.json').text).toBe('{"a":1}')
    expect(project.readTextIfThere('nothing.json')).toBeNull()
    for (const path of ['../plan.json', '/etc/hosts', 'C:\\x.json']) expect(() => project.readText(path), path).toThrow()
    // A second request has its own project: nothing is kept between them.
    expect(new MemoryProject().readTextIfThere('plan.json')).toBeNull()
  })
})
