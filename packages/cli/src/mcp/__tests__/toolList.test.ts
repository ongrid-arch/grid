/**
 * CMD-52: `tools/list` gives each tool short, so a host can read it on every turn. Before, the
 * list was about 740 KB (near 185,000 tokens). Every list, whole and by group, is held under a
 * ceiling in tokens (four characters a token); a tool whose listed text grows past it fails here,
 * and its detail belongs in its full description, which grid_help gives.
 */
import { describe, expect, it } from 'vitest'
import { PathRefused } from '../../fs/projectFiles'
import { UsageError } from '../../command/options'
import { handleLine } from '../protocol'
import { GRID_TOOLS, projectTools } from '../serveTools'
import { firstSentence, tokensOf } from '../toolList'
import { groupOf, readToolGroups, TOOL_GROUPS, type ToolGroup } from '../toolGroups'
import { allArgs, toolDefinition } from '../toolkit'

interface Listed {
  name: string
  title: string
  description: string
  inputSchema: { type: string; properties: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties: boolean }
  outputSchema?: unknown
  annotations: Record<string, unknown>
}

/** The list as a host reads it: the JSON text of the answer to tools/list. */
async function listText(groups?: readonly ToolGroup[]): Promise<string> {
  return (await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), projectTools(new PathRefused('no project in this test'), groups))) as string
}

async function listed(groups?: readonly ToolGroup[]): Promise<Listed[]> {
  return (JSON.parse(await listText(groups)) as { result: { tools: Listed[] } }).result.tools
}

/**
 * The ceilings in tokens, a little over each list's size when they were set: every tool about
 * 39,000, view 7,900 (grid_view alone takes 1,900), areas 5,800, write 6,600 and edit 20,200. The
 * whole list holds every tool, each with every argument's name, type, allowed values and range, so
 * it cannot be as short as one group's. Raise one only with the reason, as tools are added.
 */
const CEILINGS: Readonly<Record<ToolGroup | 'all', number>> = { all: 45_000, view: 9_000, areas: 7_000, write: 8_000, edit: 23_000 }

describe('the tool list (CMD-52)', () => {
  it('is a fraction of the tools in full, and each list is under its ceiling in tokens', async () => {
    const whole = JSON.stringify({ tools: GRID_TOOLS.map((tool) => toolDefinition(tool)) })
    const all = await listText()
    expect(tokensOf(all), 'every tool').toBeLessThanOrEqual(CEILINGS.all)
    expect(all.length).toBeLessThan(whole.length / 3)
    for (const group of TOOL_GROUPS) expect(tokensOf(await listText([group])), group).toBeLessThanOrEqual(CEILINGS[group])
  })

  it('lists every tool by default, in its order, with its name, title, hints and every argument', async () => {
    const tools = await listed()
    expect(tools.map((tool) => tool.name)).toEqual(GRID_TOOLS.map((tool) => tool.name))
    for (const tool of tools) {
      const grid = GRID_TOOLS.find((one) => one.name === tool.name)!
      const whole = toolDefinition(grid) as unknown as Listed
      expect(tool.title, tool.name).toBe(grid.title)
      expect(tool.description, tool.name).toMatch(/^Use this when /)
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(300)
      expect(whole.description.startsWith(tool.description.replace(/…$/, '')), tool.name).toBe(true)
      expect(typeof tool.annotations['readOnlyHint'], tool.name).toBe('boolean')
      expect(tool.outputSchema, tool.name).toBeUndefined()
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false)
      expect(tool.inputSchema.required, tool.name).toEqual(whole.inputSchema.required)
      expect(Object.keys(tool.inputSchema.properties), tool.name).toEqual(Object.keys(allArgs(grid)))
      for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
        const full = whole.inputSchema.properties[name]!
        for (const key of ['type', 'enum', 'minimum', 'maximum']) expect(property[key], `${tool.name} ${name} ${key}`).toEqual(full[key])
        expect(typeof property['description'], `${tool.name} ${name}`).toBe('string')
        if (full['properties'] !== undefined) expect(Object.keys(property['properties'] as object), `${tool.name} ${name}`).toEqual(Object.keys(full['properties'] as object))
      }
    }
  })

  it('lists the groups asked for, with grid_project and grid_help always', async () => {
    const view = (await listed(['view'])).map((tool) => tool.name)
    expect(view.slice(0, 2)).toEqual(['grid_project', 'grid_help'])
    expect(view).toEqual(expect.arrayContaining(['grid_view', 'grid_describe', 'grid_check', 'grid_preview', 'grid_export', 'grid_sheet']))
    expect(view).not.toContain('grid_areas')
    expect(view).not.toContain('grid_write_rooms')
    const both = (await listed(['areas', 'edit'])).map((tool) => tool.name)
    expect(both).toEqual(expect.arrayContaining(['grid_areas', 'grid_measure', 'grid_merge_rooms', 'grid_undo']))
    expect(both).not.toContain('grid_view')
    expect((await listed(['write'])).map((tool) => tool.name)).toEqual(expect.arrayContaining(['grid_write_rooms', 'grid_write_brief']))
    // Every tool is in one group, so the four groups list every tool.
    expect((await listed([...TOOL_GROUPS])).length).toBe(GRID_TOOLS.length)
    for (const tool of GRID_TOOLS) expect(TOOL_GROUPS, tool.name).toContain(groupOf(tool))
  })

  it('reads --tools split at commas, and refuses a group it does not know without repeating it', () => {
    expect(readToolGroups('view,areas')).toEqual(['view', 'areas'])
    expect(readToolGroups(' Edit , write,edit')).toEqual(['edit', 'write'])
    expect(() => readToolGroups('view,plans')).toThrow(UsageError)
    expect(() => readToolGroups('view,plans')).toThrow(/--tools takes view, areas, write, edit/)
    expect(() => readToolGroups('view,plans')).not.toThrow(/plans/)
    expect(() => readToolGroups(',')).toThrow(UsageError)
  })

  it('cuts a text at its first sentence, and a long one at a word', () => {
    expect(firstSentence('Use this when it fits. Do not use it otherwise.', 300)).toBe('Use this when it fits.')
    expect(firstSentence('A plan file, such as plan.json or options/b.json. More.', 300)).toBe('A plan file, such as plan.json or options/b.json.')
    expect(firstSentence('one two three four five six', 15)).toBe('one two three…')
  })
})
