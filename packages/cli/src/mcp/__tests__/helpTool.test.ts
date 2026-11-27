/**
 * CMD-52: grid_help gives what the short tool list leaves out: one tool whole, or the tool
 * groups and every tool, saying which the server lists.
 */
import { describe, expect, it } from 'vitest'
import { PathRefused } from '../../fs/projectFiles'
import { handleLine } from '../protocol'
import { GRID_TOOLS, projectTools } from '../serveTools'
import { toolDefinition } from '../toolkit'
import type { ToolGroup } from '../toolGroups'

interface Called {
  isError?: boolean
  content: Array<{ type: string; text?: string }>
  structuredContent?: Record<string, unknown>
}

async function help(args: Record<string, unknown>, groups?: readonly ToolGroup[]): Promise<{ text: string; isError: boolean; data: Record<string, unknown> }> {
  const line = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_help', arguments: args } })
  const out = JSON.parse((await handleLine(line, projectTools(new PathRefused('no project in this test'), groups))) as string) as { result: Called }
  return { text: out.result.content.find((c) => c.type === 'text')?.text ?? '', isError: out.result.isError === true, data: out.result.structuredContent ?? {} }
}

describe('grid_help (CMD-52)', () => {
  it('gives one tool whole: its description, every argument with its examples, and both schemas', async () => {
    const tool = GRID_TOOLS.find((one) => one.name === 'grid_measure')!
    const reply = await help({ tool: 'grid_measure', whole: true })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain(tool.description)
    expect(reply.text).toContain('{"what":"route","room":"bed1","to":"outside"}')
    expect(reply.text).toMatch(/^- what \(required\): .*Examples: /m)
    const given = reply.data['tool'] as Record<string, unknown>
    const full = toolDefinition(tool)
    expect(given['description']).toBe(tool.description)
    expect(given['input_schema']).toEqual(full['inputSchema'])
    expect(given['output_schema']).toEqual(full['outputSchema'])
    expect(given['group']).toBe('areas')
    expect(given['listed']).toBe(true)
  })

  it('gives the groups and every tool when no tool is named', async () => {
    const reply = await help({})
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('This server lists every group.')
    expect(reply.text).toMatch(/^view: .*grid_view/m)
    expect(reply.data['listed_groups']).toBeNull()
    const tools = reply.data['tools'] as Array<{ name: string; group: string; listed: boolean }>
    expect(tools.map((one) => one.name)).toEqual(GRID_TOOLS.map((one) => one.name))
    expect(tools.every((one) => one.listed)).toBe(true)
    expect(reply.text.length).toBeLessThan(4000)
  })

  it('says a tool is not listed by a server started with --tools, and which group lists it', async () => {
    const reply = await help({ tool: 'grid_write_rooms', whole: true }, ['view'])
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text.split('\n')[1]).toContain('not listed by this server, which lists view: start it with --tools write')
    expect((reply.data['tool'] as { listed: boolean }).listed).toBe(false)
    const all = await help({}, ['view'])
    expect(all.text).toContain('This server lists view, with grid_project and grid_help.')
    expect(all.text).toContain('grid_write_rooms (not listed)')
    expect(all.data['listed_groups']).toEqual(['view'])
  })

  it('refuses a tool Grid does not have, with the nearest name and without repeating the one sent', async () => {
    const reply = await help({ tool: 'grid_mesure' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('The nearest is "grid_measure".')
    expect(reply.text).not.toContain('grid_mesure')
  })
})
