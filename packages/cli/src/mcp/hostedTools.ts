/**
 * AIV-19: the tools of the hosted tool server (`grid mcp --http`): the same tools as `grid serve`,
 * run on a plan each call carries.
 *
 * Nothing is stored and no file is read or written on the host. A call's `plan_json` is put in a
 * project that lives in memory (`fs/memoryProject.ts`) as `plan.json`, the tool runs on it exactly
 * as it runs on a file, and the project is dropped with the answer. A tool that changes the plan
 * answers with the changed plan as `plan_json`, to be passed to the next call. So no tool has a
 * hosted form of its own: this file only swaps the argument that names a path for the plan itself.
 *
 * Not offered: the tools whose work is a file or a window on the host (the export, the sheet, the
 * start marker, the seen mark, the brief, the preview and its page call), the comparison of two
 * plan files, the difference against git and the problem report, which keeps a draft in the
 * project. The one tool of its own is `grid_show_plan`, which links the plan's page.
 */
import { planFloors } from '@ongrid/floorplan/geometry'
import { say, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import { HOSTED_DRAWINGS_KEY, HOSTED_RESOURCE_URI } from '@ongrid/viewer/src/page/names'
import { guideResources } from '../guide/resources'
import { FIRST_QUESTIONS, GUIDE_AND_SCHEMA, LABEL_AND_RETELLING, ROOMS_FIRST, SOURCE_OF_TRUTH, UNITS_RULE } from '../guide/paragraphs'
import { MemoryProject, MEMORY_PLAN_FILE } from '../fs/memoryProject'
import type { ServerResource, ServerTool, ToolAnswer } from './protocol'
import { GRID_TOOLS, serverTool } from './serveTools'
import { listSchema, NUMBER, objectSchema, readPlan, type ArgSpec, type ArgSpecs, type Answer, type GridTool, type ToolContext } from './toolkit'

const words = (key: MessageKey, values?: Values): string => say('en', key, values)

/** The tools that need the host's disk, or other files than the plan: not offered. */
const NOT_HOSTED: ReadonlySet<string> = new Set(['grid_compare', 'grid_diff', 'grid_report_problem'])
/** The arguments that name a file: the plan itself takes their place. */
const FILE_ARGS: ReadonlySet<string> = new Set(['plan', 'out', 'plans'])
/** The first plan is written from rooms text alone: no scan file, and no brief to lay out from. */
const WRITE_ROOMS = 'grid_write_rooms'

/** What the hosted server tells a host first. */
export const HOSTED_INSTRUCTIONS = [words('hosted.instructions'), UNITS_RULE, ROOMS_FIRST, SOURCE_OF_TRUTH, FIRST_QUESTIONS, GUIDE_AND_SCHEMA, LABEL_AND_RETELLING].join(' ')

function planJsonArg(required: boolean): ArgSpec {
  return {
    type: 'object',
    required,
    description: words(required ? 'hosted.arg.planJson' : 'hosted.arg.planJsonOptional'),
    examples: [{ version: '1', units: 'm', walls: [], rooms: [] }],
    schema: { type: 'object', additionalProperties: true },
    read: (value) => value,
  }
}

/** The drawings the plan's page shows, one per floor, from the viewer's own SVG. */
async function drawingsOf(project: MemoryProject, context: ToolContext): Promise<Record<string, unknown>> {
  const { loaded } = readPlan({ ...context, project }, MEMORY_PLAN_FILE)
  const { planDrawing } = await import('../draw/views')
  return { [HOSTED_DRAWINGS_KEY]: planFloors(loaded.plan).map((floor) => ({ id: floor.id, name: floor.name, svg: planDrawing(loaded.plan, floor.id, 'working').svg })) }
}

/** The tool made to take its plan as `plan_json` and run on a project in memory. */
function hosted(tool: GridTool): GridTool {
  const changes = tool.hint === 'change-plan'
  const first = tool.name === WRITE_ROOMS
  const kept = Object.entries(tool.args).filter(([name]) => !FILE_ARGS.has(name) && !(first && (name === 'scan' || name === 'layout')))
  const args: ArgSpecs = {
    plan_json: planJsonArg(!first),
    ...Object.fromEntries(kept.map(([name, spec]) => [name, first && name === 'rooms' ? { ...spec, required: true } : spec])),
  }
  const shows = changes || tool.ui !== undefined
  const properties = (tool.outputSchema['properties'] ?? {}) as Record<string, unknown>
  return {
    ...tool,
    description: tool.ui === undefined ? `${tool.description}${words(changes ? 'hosted.note.change' : 'hosted.note.read')}` : tool.description,
    args,
    outputSchema: changes ? { ...tool.outputSchema, properties: { ...properties, plan_json: { type: 'object' } } } : tool.outputSchema,
    ...(shows ? { ui: { resourceUri: HOSTED_RESOURCE_URI } } : {}),
    async run(given, context): Promise<Answer> {
      const { plan_json: carried, ...rest } = given
      const project = new MemoryProject()
      if (carried !== undefined) project.writeFile(MEMORY_PLAN_FILE, JSON.stringify(carried))
      const inner: ToolContext = { project, ...(context.protocolVersion === undefined ? {} : { protocolVersion: context.protocolVersion }) }
      const answer = await tool.run({ ...rest, plan: MEMORY_PLAN_FILE }, inner)
      const changed = changes ? project.readTextIfThere(MEMORY_PLAN_FILE) : null
      const plan = changed === null ? undefined : (JSON.parse(changed) as Record<string, unknown>)
      return {
        ...answer,
        text: plan === undefined ? answer.text : `${answer.text}\n${words('hosted.result.changedPlan')}\n${JSON.stringify(plan)}`,
        data: plan === undefined ? answer.data : { ...answer.data, plan_json: plan },
        ...(shows ? { meta: await drawingsOf(project, inner) } : {}),
      }
    },
  }
}

/** The hosted server's one tool of its own: it shows the plan in the page. */
const showPlanTool: GridTool = {
  name: 'grid_show_plan',
  title: words('hosted.show.title'),
  description: words('hosted.show.description'),
  hint: 'read',
  args: { plan: { type: 'string', required: true, description: '', examples: [MEMORY_PLAN_FILE] } },
  outputSchema: objectSchema({ floors: NUMBER, rooms: NUMBER, floorIds: listSchema({ type: 'string' }) }),
  ui: { resourceUri: HOSTED_RESOURCE_URI },
  run(args, context) {
    const { loaded } = readPlan(context, args['plan'])
    const floors = planFloors(loaded.plan)
    return {
      text: words('hosted.show.answer', { floors: floors.length, rooms: loaded.plan.rooms.length }),
      data: { floors: floors.length, rooms: loaded.plan.rooms.length, floorIds: floors.map((floor) => floor.id) },
    }
  },
}

/** Every tool the hosted server offers, in the order of `grid serve`'s. */
export const HOSTED_GRID_TOOLS: readonly GridTool[] = [
  ...GRID_TOOLS.filter((tool) => tool.hint === 'read' && !NOT_HOSTED.has(tool.name)),
  showPlanTool,
  ...GRID_TOOLS.filter((tool) => tool.hint === 'change-plan'),
].map(hosted)

/** A call's plan as the object it stands for: an agent may send the JSON as text. */
function normalised(raw: unknown): { raw: unknown } | { refusal: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { raw }
  const carried = (raw as Record<string, unknown>)['plan_json']
  if (typeof carried !== 'string') return { raw }
  try {
    const plan: unknown = JSON.parse(carried)
    if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) return { refusal: words('hosted.planJson.notObject') }
    return { raw: { ...(raw as Record<string, unknown>), plan_json: plan } }
  } catch {
    return { refusal: words('hosted.planJson.notJson') }
  }
}

/** The tools of the hosted server, ready for the protocol. */
export function hostedTools(): ServerTool[] {
  const context: ToolContext = { project: new MemoryProject() }
  return HOSTED_GRID_TOOLS.map((tool) => {
    const one = serverTool(tool, context)
    return {
      definition: one.definition,
      call(raw, request): ToolAnswer | Promise<ToolAnswer> {
        const read = normalised(raw)
        if ('refusal' in read) return { text: read.refusal, isError: true }
        return one.call(read.raw, request)
      },
    }
  })
}

/** The hosted server's resources: the plan's page, the guide and the plan's JSON Schema. */
export function hostedResources(): ServerResource[] {
  return [
    {
      definition: {
        uri: HOSTED_RESOURCE_URI,
        name: 'grid-plan',
        title: 'Grid plan',
        description: words('hosted.page.resource'),
        mimeType: 'text/html;profile=mcp-app',
      },
      read: async () => ({
        text: (await import('@ongrid/viewer/src/page/hostedPage')).hostedPageHtml({ waiting: words('hosted.page.waiting'), noDrawing: words('hosted.page.noDrawing'), floor: words('hosted.page.floor') }),
        _meta: { ui: { prefersBorder: true } },
      }),
    },
    ...guideResources(),
  ]
}
