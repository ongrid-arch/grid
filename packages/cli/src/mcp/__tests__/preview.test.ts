/**
 * VEW-4: the preview the person and the agent share, through the tool server as a host calls it:
 * the agent's grid_preview, the page's grid_preview_sync, the record beside the plan between them,
 * and the page served as an MCP App resource.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { handleLine } from '../protocol'
import { projectResources, projectTools } from '../serveTools'
import { twoBedFlat } from './replay/plans'

interface Content { type: string; text?: string; data?: string; mimeType?: string }
interface Result { content: Content[]; structuredContent?: Record<string, unknown>; isError?: boolean }

let folder: string
let next = 1

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'grid-preview-'))
  writeFileSync(join(folder, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(folder, 'plan.json'), JSON.stringify(twoBedFlat()))
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const tools = projectTools(openProject(folder, folder, 'project'))
  const line = await handleLine(JSON.stringify({ jsonrpc: '2.0', id: next++, method, params }), tools, projectResources())
  return JSON.parse(line as string) as Record<string, unknown>
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const out = await rpc('tools/call', { name, arguments: args })
  return out['result'] as Result
}

const text = (result: Result): string => result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const image = (result: Result): Content | undefined => result.content.find((c) => c.type === 'image')
const record = (): Record<string, unknown> => JSON.parse(readFileSync(join(folder, 'plan.preview.json'), 'utf8')) as Record<string, unknown>

describe('grid_preview, the agent\'s side (VEW-4)', () => {
  it('reads what the person selected, writing nothing, when it is asked to show nothing', async () => {
    const result = await call('grid_preview')
    expect(result.isError).toBeUndefined()
    expect(text(result)).toContain('The person has selected nothing in the preview.')
    expect(image(result)).toBeUndefined()
    expect(result.structuredContent).toMatchObject({ shown: false, selected: null, view: '2d', floor: 'ground' })
    expect(existsSync(join(folder, 'plan.preview.json'))).toBe(false)
  })

  it('frames a room and picks parts out in the record beside the plan, and answers with the picture it shows', async () => {
    const plan = readFileSync(join(folder, 'plan.json'), 'utf8')
    const result = await call('grid_preview', { room: 'kitchen', highlight: ['door-kitchen', 'pass-kitchen-living'], note: 'The kitchen door moved.' })
    expect(result.isError).toBeUndefined()
    expect(text(result)).toMatch(/^General guidance, not your local rules\nShowing floor "ground", room "kitchen" framed in 2d, 2 parts picked out, with your note\./)
    // A client with no viewer gets the picture and its words.
    expect(image(result)).toMatchObject({ type: 'image', mimeType: 'image/png' })
    expect(text(result)).toContain('cropped to room "kitchen"')
    expect(record()).toMatchObject({ version: '1', revision: 1, view: '2d', floor: 'ground', frame: 'kitchen', highlight: ['door-kitchen', 'pass-kitchen-living'], note: 'The kitchen door moved.', changedBy: 'agent', selected: null })
    expect(result.structuredContent).toMatchObject({ shown: true, room: 'kitchen', highlight: ['door-kitchen', 'pass-kitchen-living'], previewFile: 'plan.preview.json', planFile: 'plan.json' })
    expect(readFileSync(join(folder, 'plan.json'), 'utf8')).toBe(plan)
  })

  it('refuses an id the plan does not have, naming the nearest, without repeating it', async () => {
    const result = await call('grid_preview', { highlight: ['door-kitchn'] })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('"door-kitchen"')
    expect(text(result)).not.toContain('door-kitchn')
    expect(existsSync(join(folder, 'plan.preview.json'))).toBe(false)
  })

  it('looks through a camera grid_view returned, in 3d', async () => {
    const view = await call('grid_view', { kind: '3d', from: 'south-west' })
    const camera = view.structuredContent!['camera'] as Record<string, unknown>
    const result = await call('grid_preview', { camera })
    expect(result.structuredContent).toMatchObject({ view: '3d', camera: { bearing: camera['bearing'], tilt: camera['tilt'] } })
    expect(image(result)).toMatchObject({ mimeType: 'image/png' })
    expect(record()).toMatchObject({ view: '3d', camera: { bearing: camera['bearing'] } })
  })
})

describe('grid_preview_sync, the page\'s side (VEW-4)', () => {
  it('gives the 2D drawing as the viewer\'s SVG, each part with its id and its box, and the picture as a PNG', async () => {
    const result = await call('grid_preview_sync')
    const data = result.structuredContent!
    expect(data['changed']).toBe(true)
    const drawing = data['drawing'] as { view: string; floor: string; svg: string; boxes: Array<{ id: string; x: number; y: number; width: number; height: number }> }
    expect(drawing).toMatchObject({ view: '2d', floor: 'ground' })
    expect(drawing.svg).toContain('data-id="kitchen"')
    expect(drawing.svg).toContain('data-id="door-kitchen"')
    // The kitchen spans x 0 to 4.6 and y 4.4 to 7.6 in the plan: in the SVG's frame, y is down.
    const kitchen = drawing.boxes.find((b) => b.id === 'kitchen')!
    expect(kitchen.x).toBeCloseTo(0.1, 1)
    expect(kitchen.y).toBeCloseTo(-7.5, 1)
    expect(data['floors']).toEqual([{ id: 'ground', name: 'Ground floor' }])
    expect(image(result)).toMatchObject({ mimeType: 'image/png' })
    // Nothing more when nothing changed.
    const again = await call('grid_preview_sync', { since: data['revision'] })
    expect(again.structuredContent).toMatchObject({ changed: false, revision: data['revision'] })
    expect(image(again)).toBeUndefined()
  })

  it('writes the part the person clicked, which the agent reads with grid_preview', async () => {
    await call('grid_preview_sync', { select: 'bed1' })
    expect(record()).toMatchObject({ selected: { id: 'bed1', kind: 'room', floor: 'ground' }, changedBy: 'person', revision: 1 })
    const read = await call('grid_preview')
    expect(text(read)).toContain('The person has selected room "bed1" ("Bedroom 1") on floor "ground".')
    expect(read.structuredContent!['selected']).toEqual({ id: 'bed1', kind: 'room', name: 'Bedroom 1', floor: 'ground' })
    await call('grid_preview_sync', { clear: true })
    expect(record()['selected']).toBeNull()
  })

  it('sends only the record when the agent picked parts out and the drawing stayed the same', async () => {
    const first = await call('grid_preview_sync')
    await call('grid_preview', { highlight: ['door-bath'] })
    const after = await call('grid_preview_sync', { since: first.structuredContent!['revision'] })
    expect(after.structuredContent).toMatchObject({ changed: true, drawing: null, record: { highlight: ['door-bath'], changedBy: 'agent' } })
  })

  it('draws again when the plan changes', async () => {
    const first = await call('grid_preview_sync')
    const plan = twoBedFlat() as { rooms: Array<{ id: string; name: string }> }
    plan.rooms.find((r) => r.id === 'kitchen')!.name = 'Galley'
    writeFileSync(join(folder, 'plan.json'), JSON.stringify(plan))
    const after = await call('grid_preview_sync', { since: first.structuredContent!['revision'] })
    expect(after.structuredContent!['changed']).toBe(true)
    expect((after.structuredContent!['drawing'] as { svg: string }).svg).toContain('Galley')
  })

  it('turns to 3d, and picks the part a click on the 3D picture shows', async () => {
    const turned = await call('grid_preview_sync', { view: '3d' })
    expect(turned.structuredContent).toMatchObject({ drawing: { view: '3d' } })
    expect(image(turned)).toMatchObject({ mimeType: 'image/png' })
    const picked = await call('grid_preview_sync', { pick: { x: 0.5, y: 0.55 } })
    const selected = picked.structuredContent!['selected'] as { id: string; kind: string } | null
    expect(selected).not.toBeNull()
    expect(picked.structuredContent!['picked']).toMatchObject({ id: selected!.id })
    expect(record()['selected']).toMatchObject({ id: selected!.id })
  })

  it('refuses a click on an id the plan does not have', async () => {
    const result = await call('grid_preview_sync', { select: 'ballroom' })
    expect(result.isError).toBe(true)
    expect(text(result)).not.toContain('ballroom')
  })
})

describe('the preview page as an MCP App (VEW-4)', () => {
  it('says it offers resources and the MCP Apps extension', async () => {
    const out = await rpc('initialize', { protocolVersion: '2025-06-18' })
    expect(out['result']).toMatchObject({ capabilities: { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } })
  })

  it('links grid_preview to the page, and lists grid_preview_sync for the page only', async () => {
    const tools = ((await rpc('tools/list'))['result'] as { tools: Array<{ name: string; _meta?: Record<string, unknown> }> }).tools
    expect(tools.find((t) => t.name === 'grid_preview')!._meta).toEqual({ ui: { resourceUri: 'ui://grid/preview' }, 'ui/resourceUri': 'ui://grid/preview' })
    expect(tools.find((t) => t.name === 'grid_preview_sync')!._meta).toEqual({ ui: { resourceUri: 'ui://grid/preview', visibility: ['app'] }, 'ui/resourceUri': 'ui://grid/preview' })
    expect(tools.filter((t) => t._meta !== undefined).map((t) => t.name)).toEqual(['grid_preview', 'grid_preview_sync'])
  })

  it('serves the page, holding all it needs, as the MCP App resource', async () => {
    const listed = (await rpc('resources/list'))['result'] as { resources: Array<Record<string, unknown>> }
    // CMD-7: the guide for agents and the plan's JSON Schema follow the page.
    expect(listed.resources[0]).toEqual(expect.objectContaining({ uri: 'ui://grid/preview', mimeType: 'text/html;profile=mcp-app' }))
    expect(listed.resources.map((r) => r['uri'])).toEqual(['ui://grid/preview', 'grid://guide', 'grid://schema/plan', 'grid://guide/rooms'])
    const read = (await rpc('resources/read', { uri: 'ui://grid/preview' }))['result'] as { contents: Array<{ uri: string; mimeType: string; text: string; _meta: unknown }> }
    expect(read.contents).toHaveLength(1)
    const page = read.contents[0]!
    expect(page).toMatchObject({ uri: 'ui://grid/preview', mimeType: 'text/html;profile=mcp-app', _meta: { ui: { prefersBorder: true } } })
    expect(page.text).toMatch(/^<!doctype html>/)
    expect(page.text).toContain('grid_preview_sync')
    expect(page.text).toContain('ui/initialize')
    // Nothing is loaded from anywhere else: no script, sheet or picture by address.
    expect(page.text).not.toMatch(/\s(src|href)="(https?:)?\/\//)
    // In a host the page talks to the host; only grid preview's page calls the server it came from.
    expect(page.text).toMatch(/<body>/)
    const missing = await rpc('resources/read', { uri: 'ui://grid/elsewhere' })
    expect(missing['error']).toMatchObject({ code: -32002 })
    expect(JSON.stringify(missing)).not.toContain('elsewhere')
  })

  it('serves the page to a 2026-07-28 client too', async () => {
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} }
    const discover = await rpc('server/discover', { _meta: meta })
    expect(discover['result']).toMatchObject({ capabilities: { resources: {} } })
    const read = await rpc('resources/read', { uri: 'ui://grid/preview', _meta: meta })
    expect(read['result']).toMatchObject({ resultType: 'complete', contents: [{ uri: 'ui://grid/preview' }] })
  })
})

describe('a client with no viewer (VEW-4)', () => {
  it('still gets an image and text from every tool that draws', async () => {
    writeFileSync(join(folder, 'other.json'), JSON.stringify(twoBedFlat()))
    await call('grid_mark_start')
    // A change since the start marker, for grid_diff to draw.
    expect((await call('grid_rename_room', { room: 'bed2', name: 'Study', use: 'other' })).isError).toBeUndefined()
    const camera = (await call('grid_view', { kind: '3d' })).structuredContent!['camera']
    const calls: Array<[string, Record<string, unknown>]> = [
      ['grid_view', { kind: 'plan' }],
      ['grid_view', { kind: '3d' }],
      ['grid_view', { kind: 'eye', room: 'living' }],
      ['grid_view', { kind: 'facade', side: 'south' }],
      ['grid_view', { kind: 'section', cut: { from: [0, 2], to: [9.2, 2] } }],
      ['grid_compare', { plans: ['plan.json', 'other.json'], picture: true }],
      ['grid_diff', {}],
      ['grid_preview', { view: '2d' }],
      ['grid_preview', { camera }],
      ['grid_preview_sync', {}],
      ['grid_preview_sync', { view: '3d' }],
    ]
    for (const [name, args] of calls) {
      const result = await call(name, args)
      expect(result.isError, `${name} ${JSON.stringify(args)}: ${text(result)}`).toBeUndefined()
      expect(result.content[0], name).toMatchObject({ type: 'text' })
      expect(text(result).length, name).toBeGreaterThan(40)
      expect(image(result), `${name} ${JSON.stringify(args)}`).toMatchObject({ type: 'image', mimeType: 'image/png' })
    }
  }, 60_000)
})
