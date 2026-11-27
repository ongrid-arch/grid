/**
 * `grid_help` (CMD-52): what `tools/list` leaves out. The list gives each tool short
 * (`toolList.ts`); this gives one tool whole, from `toolDefinition`: its description, every
 * argument with its description and examples, and its input and output schemas. With no tool it
 * gives the groups `grid mcp --tools` lists (`toolGroups.ts`) and every tool by group, saying
 * which this server lists. It reads the tools from the context the server set (`ToolContext.tools`).
 */
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import { GROUP_SUMMARIES, groupOf, TOOL_GROUPS } from './toolGroups'
import { BOOLEAN, listSchema, objectSchema, STRING, toolDefinition, ToolRefusal, type GridTool, type ToolContext } from './toolkit'

export const HELP_TOOL_NAME = 'grid_help'

const NULLABLE_STRINGS = { type: ['array', 'null'], items: STRING } as const
const SCHEMA = { type: 'object' } as const

/** The tools the server was started with, or every tool: a context the server did not set lists none. */
function toolsOf(context: ToolContext): NonNullable<ToolContext['tools']> {
  if (context.tools === undefined) throw new ToolRefusal('grid_help answers on the tool server only, which hands it the tools it lists.')
  return context.tools
}

/** One argument in the text: its name, whether it is needed, its description and its examples. */
function argLine(name: string, property: Record<string, unknown>, required: boolean): string {
  const examples = Array.isArray(property['examples']) ? property['examples'].map((one) => JSON.stringify(one)).join(', ') : ''
  return `- ${name}${required ? ' (required)' : ''}: ${String(property['description'] ?? '')}${examples === '' ? '' : ` Examples: ${examples}.`}`
}

function oneTool(tool: GridTool, listed: boolean, groups: readonly string[] | null): { text: string; data: Record<string, unknown> } {
  const full = toolDefinition(tool)
  const input = full['inputSchema'] as { properties: Record<string, Record<string, unknown>>; required?: string[] }
  const group = groupOf(tool)
  const where = listed ? `listed, group ${group}` : `not listed by this server, which lists ${groups?.join(', ') ?? 'every group'}: start it with --tools ${group}`
  const args = Object.entries(input.properties)
  const lines = [
    `${tool.name}: ${tool.title} (${where}).`,
    tool.description,
    args.length === 0 ? 'It takes no arguments.' : 'Arguments:',
    ...args.map(([name, property]) => argLine(name, property, input.required?.includes(name) === true)),
  ]
  return {
    text: lines.join('\n'),
    data: {
      listed_groups: groups,
      tool: { name: tool.name, title: tool.title, group, listed, description: tool.description, input_schema: input, output_schema: full['outputSchema'] },
    },
  }
}

export const helpTool: GridTool = {
  name: HELP_TOOL_NAME,
  title: 'Help on a tool and the tool groups',
  hint: 'read',
  description:
    'Use this when a tool\'s listed description or arguments are too short to call it right, or to see which tools there are by group: with tool, it gives that tool\'s whole description, every argument with its description and examples, and its input and output schemas; with none, the tool groups and every tool. '
    + 'The tool list gives each tool its first sentence and each argument its type, allowed values and one short example, so a host reads it on every turn without the rest. '
    + 'Lengths in every tool are metres unless the argument says it takes text with its unit. '
    + 'A server started with grid mcp --tools view,areas,write,edit lists those groups only, and grid_project and grid_help always; this tool says which group lists a tool it does not. '
    + 'Do not use to read the plan (grid_describe) or to find the plan files (grid_project).',
  args: {
    tool: {
      type: 'string',
      description: 'The tool to give whole, by its name. Every tool by group when left out.',
      examples: ['grid_write_rooms', 'grid_measure'],
      id: true,
    },
  },
  outputSchema: objectSchema({
    listed_groups: NULLABLE_STRINGS,
    groups: listSchema(objectSchema({ name: STRING, summary: STRING })),
    tools: listSchema(objectSchema({ name: STRING, title: STRING, group: STRING, listed: BOOLEAN })),
    tool: objectSchema({ name: STRING, title: STRING, group: STRING, listed: BOOLEAN, description: STRING, input_schema: SCHEMA, output_schema: SCHEMA }),
  }, ['listed_groups']),
  run(args, context) {
    const { all, listed, groups } = toolsOf(context)
    const asked = args['tool']
    if (typeof asked === 'string') {
      const tool = all.find((one) => one.name === asked)
      if (tool === undefined) {
        const near = likelyId(asked, all.map((one) => one.name))
        throw new ToolRefusal(`That is not one of Grid's tools.${near === null ? '' : ` The nearest is ${quoted(near)}.`} grid_help with no tool lists them all.`)
      }
      return oneTool(tool, listed.has(tool.name), groups)
    }
    const rows = all.map((tool) => ({ name: tool.name, title: tool.title, group: groupOf(tool), listed: listed.has(tool.name) }))
    const lines = [
      groups === null ? 'This server lists every group.' : `This server lists ${groups.join(', ')}, with grid_project and grid_help.`,
      ...TOOL_GROUPS.map((group) => `${group}: ${GROUP_SUMMARIES[group]} ${rows.filter((row) => row.group === group).map((row) => `${row.name}${row.listed ? '' : ' (not listed)'}`).join(', ')}.`),
      'Call grid_help with tool for one tool whole.',
    ]
    return { text: lines.join('\n'), data: { listed_groups: groups, groups: TOOL_GROUPS.map((name) => ({ name, summary: GROUP_SUMMARIES[name] })), tools: rows } }
  },
}
