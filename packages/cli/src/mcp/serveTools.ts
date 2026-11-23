/**
 * The tools of `grid serve`, in the order `tools/list` gives them: the tools that read the
 * plan first, ordered by the requests they answer most often (lab entry Y-2), with the problem
 * report last of them (CMD-13), then the preview and the preview page's own call (VEW-4), the export, the sheet, the start marker
 * (WRT-8), the seen mark (MSG-10), the brief (BRF-1),
 * and last the tools that change the plan, the saved views last of them (VEW-3).
 *
 * Every path an agent passes goes through the project's resolver (`fs/projectFiles.ts`):
 * inside the project folder or refused, with a message naming the path and the folder. The
 * project folder is fixed when the server starts.
 */
import { CanvasMissing } from '../draw/canvas'
import type { PathRefused, Project } from '../fs/projectFiles'
import { FontsMissing } from '../sheet/fonts'
import type { ServerResource, ServerTool, ToolAnswer } from './protocol'
import { PREVIEW_RESOURCE_MIME, PREVIEW_RESOURCE_URI } from '@ongrid/viewer/src/page/names'
import { READ_TOOLS } from './readTools'
import { reportProblemTool } from './reportTool'
import { markSeenTool } from './seenTool'
import { writeBriefTool } from './briefTool'
import { diffTool, markStartTool } from './diffTools'
import { labelled, readArgs, toolDefinition, ToolRefusal, type GridTool, type ToolContext } from './toolkit'
import { WRITE_TOOLS } from './writeTools'
import { guideResources } from '../guide/resources'
import { EDIT_TOOLS } from './editTools'
import { saveViewTool } from './viewTool'
import { previewSyncTool, previewTool } from './previewTools'

export { EXPORT_TOOL_NAME } from './writeTools'
export { PREVIEW_TOOL_NAME } from './previewTools'

/** Every tool, in its fixed order. */
export const GRID_TOOLS: readonly GridTool[] = [
  // WRT-8: what a change did, right after the comparison of separate plans it is told apart from.
  READ_TOOLS[0]!,
  diffTool,
  ...READ_TOOLS.slice(1),
  // CMD-13: the last of the reading tools, for the rarest request: telling Grid's makers.
  reportProblemTool,
  // VEW-4: the preview the person and the agent share, then the page's own call (visibility app).
  previewTool,
  previewSyncTool,
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'write-file'),
  // WRT-8: writes the markers file beside the plan, never the plan.
  markStartTool,
  // MSG-10: writes the marks file beside the plan, never the plan: the last of the files it writes.
  markSeenTool,
  // BRF-1: writes the brief beside the plan, never the plan: written before the first room.
  writeBriefTool,
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'change-plan'),
  ...EDIT_TOOLS,
  // VEW-3: changes the plan's saved views only, never the building: the last of the changes.
  saveViewTool,
]

async function answer(tool: GridTool, raw: unknown, context: ToolContext): Promise<ToolAnswer> {
  try {
    const result = labelled(await tool.run(readArgs(tool, raw), context))
    return { text: result.text, data: result.data, ...(result.meta ? { meta: result.meta } : {}), ...(result.image ? { image: result.image } : {}), ...(result.images ? { images: result.images } : {}) }
  } catch (error) {
    if (error instanceof ToolRefusal || error instanceof CanvasMissing || error instanceof FontsMissing) return { text: error.message, isError: true }
    throw error
  }
}

export function serverTool(tool: GridTool, context: ToolContext): ServerTool {
  const definition = toolDefinition(tool)
  return {
    definition,
    call: (raw, request) => answer(tool, raw, request?.protocolVersion === undefined ? context : { ...context, protocolVersion: request.protocolVersion }),
  }
}

/**
 * The tools for a project folder, or for the reason there is none: then every call that needs
 * a file answers with that reason.
 */
export function projectTools(project: Project | PathRefused): ServerTool[] {
  const context: ToolContext = { project }
  return GRID_TOOLS.map((tool) => serverTool(tool, context))
}

/**
 * VEW-4: the resources of `grid serve`: the preview page, an MCP App that `grid_preview` names. The
 * page is loaded only when a host reads it; it holds everything it needs, and loads nothing.
 */
export function projectResources(): ServerResource[] {
  return [
    {
      definition: {
        uri: PREVIEW_RESOURCE_URI,
        name: 'grid-preview',
        title: 'Grid preview',
        description: 'The plan in 2D and 3D, shared with the agent: the person clicks a part to select it, and the agent frames a room or picks parts out (grid_preview).',
        mimeType: PREVIEW_RESOURCE_MIME,
      },
      read: async () => ({ text: (await import('@ongrid/viewer/src/page/previewPage')).previewPageHtml(), _meta: { ui: { prefersBorder: true } } }),
    },
    // CMD-7: the guide for agents and the plan's JSON Schema.
    ...guideResources(),
  ]
}
